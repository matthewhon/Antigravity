/**
 * syncGroups.ts
 * PCO sync for Groups: group list, memberships, and event attendance history.
 */

import { firestore } from '../firestoreService';
import { PcoGroup } from '../../types';
import { logger, fetchAllPages, delay } from './pcoSyncCore.ts';

export const syncGroupsData = async (churchId: string) => {
    logger.info('Syncing groups (deep scan)...', 'sync', { churchId }, churchId);

    const campuses = await firestore.getCampuses(churchId);
    const campusMap = new Map<string, string>();
    campuses.forEach(c => campusMap.set(c.pcoId, c.name));

    const mapGroup = (g: any, included: any[] = []) => {
        const typeId = g.relationships?.group_type?.data?.id;
        const typeObj = included?.find(i => i.type === 'GroupType' && i.id === typeId);
        const groupTypeName = typeObj?.attributes?.name || 'Small Group';

        const campusId = g.relationships?.campus?.data?.id || null;
        const campusObj = campusId ? included?.find(i => i.type === 'Campus' && i.id === campusId) : null;
        const campusName = campusObj?.attributes?.name || (campusId ? (campusMap.get(campusId) ?? null) : null);

        return {
            id: g.id,
            churchId,
            name: g.attributes.name,
            groupTypeName,
            membersCount: g.attributes.members_count || 0,
            isPublic: g.attributes.publicly_visible ?? false,
            createdAt: g.attributes.created_at,
            archivedAt: g.attributes.archived_at || null,
            lastUpdated: Date.now(),
            leaderIds: [],
            memberIds: [],
            attendanceHistory: [],
            campusId,
            campusName
        } as PcoGroup;
    };

    // STRICT: an empty/truncated result here makes every local group look deleted,
    // and the reconciliation below would archive them all. Fail loudly instead.
    const groups = await fetchAllPages(
        churchId,
        'groups/v2/groups?include=group_type,campus',
        mapGroup,
        100,
        { strict: true }
    );

    // The unfiltered endpoint omits archived groups, so fetch them separately.
    // Without this, archived groups are only ever detected by their *absence*, and
    // get stamped with the sync time instead of the date PCO actually archived them.
    let pcoArchivedGroups: PcoGroup[] = [];
    try {
        pcoArchivedGroups = await fetchAllPages(
            churchId,
            'groups/v2/groups?filter=archived&include=group_type,campus',
            mapGroup,
            100,
            { strict: true }
        );
    } catch (e: any) {
        // Non-fatal: we fall back to absence-detection below, same as before.
        logger.warn('Archived groups fetch failed — archive dates may be approximate',
            'sync', { churchId, error: e?.message }, churchId);
    }

    logger.info(
        `Found ${groups.length} active and ${pcoArchivedGroups.length} archived groups — starting deep scan`,
        'sync', { churchId, active: groups.length, archived: pcoArchivedGroups.length }, churchId
    );

    const localGroups = await firestore.getGroups(churchId);
    const localById = new Map(localGroups.map(lg => [lg.id, lg]));
    const knownInPco = new Set([...groups, ...pcoArchivedGroups].map(g => g.id));

    // Archived in PCO: keep the real archived_at, but merge onto whatever we already
    // hold so a merge-write doesn't blank out memberIds/attendanceHistory that the
    // deep scan collected while the group was still active.
    const archivedGroups = pcoArchivedGroups.map(g => {
        const existing = localById.get(g.id);
        return existing ? { ...existing, ...g, memberIds: existing.memberIds ?? g.memberIds, leaderIds: existing.leaderIds ?? g.leaderIds, attendanceHistory: existing.attendanceHistory ?? g.attendanceHistory } : g;
    });

    // Gone from PCO entirely (deleted, or no longer visible to our token). PCO has no
    // date to give us here, so the sync time is the best marker available.
    const missingLocalGroups = localGroups
        .filter(lg => !knownInPco.has(lg.id))
        .map(lg => ({
            ...lg,
            archivedAt: lg.archivedAt || new Date().toISOString()
        }));

    const activeGroups = groups.filter(g => !g.archivedAt);
    const enrichedGroups: PcoGroup[] = [];

    for (const group of activeGroups) {
        try {
            const allMembers = await fetchAllPages(churchId, `groups/v2/groups/${group.id}/memberships`, (m: any) => m);

            const memberIds = allMembers.map((m: any) => m.relationships?.person?.data?.id).filter(Boolean);
            const leaderIds = allMembers
                .filter((m: any) => m.attributes.role === 'leader')
                .map((m: any) => m.relationships?.person?.data?.id)
                .filter(Boolean);

            const memberJoins = allMembers
                .map((m: any) => {
                    const pid = m.relationships?.person?.data?.id;
                    const joinedAt = m.attributes?.joined_at;
                    return pid && joinedAt ? { id: String(pid), joinedAt: String(joinedAt).split('T')[0] } : null;
                })
                .filter(Boolean) as { id: string; joinedAt: string }[];

            const rawEvents = await fetchAllPages(churchId, `groups/v2/groups/${group.id}/events?order=-starts_at`, (e: any) => e);
            console.log(`Group ${group.name} (${group.id}) has ${rawEvents.length} events.`);

            const attendanceHistory = [];

            for (let i = 0; i < rawEvents.length; i++) {
                const e = rawEvents[i];
                const eventId = e.id;
                const date = e.attributes.starts_at;

                const attrAttendanceCount = e.attributes.attendance_count || 0;
                const attrVisitorsCount = e.attributes.visitors_count || 0;

                let membersCount = Math.max(0, attrAttendanceCount - attrVisitorsCount);
                let visitorsCount = attrVisitorsCount;
                let totalCount = attrAttendanceCount;

                const attendeeIds: string[] = [];
                const isPast = new Date(date) < new Date();

                if (i < 52 && isPast && !e.attributes.canceled) {
                    try {
                        await delay(50);
                        const rawAttendances = await fetchAllPages(
                            churchId,
                            `groups/v2/groups/${group.id}/events/${eventId}/attendances`,
                            (a: any) => a
                        );

                        const allAttendances = rawAttendances.filter((a: any) => a.attributes?.attended === true);

                        if (allAttendances.length > 0) {
                            let recMembers = 0;
                            let recVisitors = 0;

                            allAttendances.forEach((a: any) => {
                                const pid = a.relationships?.person?.data?.id;
                                const role = a.attributes.role;

                                if (pid) {
                                    attendeeIds.push(pid);
                                    if (role === 'visitor') {
                                        recVisitors++;
                                    } else if (role === 'member' || role === 'leader') {
                                        recMembers++;
                                    } else {
                                        if (memberIds.includes(String(pid)) || leaderIds.includes(String(pid))) {
                                            recMembers++;
                                        } else {
                                            recVisitors++;
                                        }
                                    }
                                }
                            });

                            membersCount = recMembers;
                            visitorsCount = recVisitors;
                            totalCount = membersCount + visitorsCount;
                        }
                    } catch (attErr) {
                        console.warn(`Error fetching attendance breakdown for event ${eventId}`, attErr);
                    }
                }

                attendanceHistory.push({
                    eventId,
                    date,
                    count: totalCount,
                    members: membersCount,
                    visitors: visitorsCount,
                    attendeeIds
                });
            }

            enrichedGroups.push({
                ...group,
                leaderIds,
                memberIds,
                memberJoins,
                membersCount: allMembers.length,
                attendanceHistory
            });

            await delay(50);
        } catch (e: any) {
            logger.warn(
                `Error fetching details for group ${group.id} (${group.name})`,
                'sync',
                { groupId: group.id, groupName: group.name, error: e?.message },
                churchId
            );
            enrichedGroups.push(group);
        }
    }

    const finalGroups = [...enrichedGroups, ...archivedGroups, ...missingLocalGroups];

    if (finalGroups.length > 0) {
        await firestore.upsertGroups(finalGroups);
    }
    logger.info(
        'Groups sync complete',
        'sync',
        { churchId, total: finalGroups.length, active: enrichedGroups.length, archived: archivedGroups.length },
        churchId
    );
};
