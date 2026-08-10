/**
 * syncAttendance.ts
 * PCO sync for Check-Ins: per-person check-in counts and event-time attendance records.
 */

import { firestore } from '../firestoreService';
import { AttendanceRecord, PcoCheckInRecord } from '../../types';
import { logger, fetchAllPages } from './pcoSyncCore.ts';

/**
 * Fetches the number of PCO check-ins per person over the last 90 days and
 * updates each person's `checkInCount` field in Firestore.
 * Called AFTER syncPeopleData so person documents already exist.
 */
export const syncCheckInCounts = async (churchId: string) => {
    logger.info('Syncing check-in counts...', 'sync', { churchId }, churchId);

    const campuses = await firestore.getCampuses(churchId);
    const campusMap = new Map<string, string>();
    campuses.forEach(c => campusMap.set(c.pcoId, c.name));

    const since = new Date();
    since.setDate(since.getDate() - 90);
    const sinceStr = since.toISOString().split('T')[0];

    const countMap = new Map<string, number>();

    try {
        const checkIns = await fetchAllPages(
            churchId,
            `check-ins/v2/check_ins?where[created_at][gte]=${sinceStr}`,
            (ci: any) => {
                const campusId = ci.relationships?.campus?.data?.id || null;
                const campusName = campusId ? (campusMap.get(campusId) ?? null) : null;
                return {
                    id: ci.id,
                    personId: ci.attributes?.person_id || ci.relationships?.person?.data?.id || null,
                    createdAt: ci.attributes?.created_at ? ci.attributes.created_at.split('T')[0] : null,
                    campusId,
                    campusName
                };
            }
        );

        const validCheckIns: PcoCheckInRecord[] = checkIns
            .filter((ci: any) => ci.personId && ci.createdAt)
            .map((ci: any) => ({
                id: `${churchId}_${ci.id}`,
                pcoId: ci.id,
                churchId,
                personId: ci.personId,
                createdAt: ci.createdAt,
                campusId: ci.campusId,
                campusName: ci.campusName
            }));

        if (validCheckIns.length > 0) {
            await firestore.saveCheckIns(churchId, validCheckIns);
        }

        for (const ci of checkIns) {
            if (!ci.personId) continue;
            countMap.set(ci.personId, (countMap.get(ci.personId) || 0) + 1);
        }

        logger.info(`Check-in counts aggregated`, 'sync', {
            churchId,
            totalCheckIns: checkIns.length,
            uniquePeople: countMap.size
        }, churchId);

        if (countMap.size > 0) {
            await firestore.updatePeopleCheckInCounts(churchId, Object.fromEntries(countMap));
        }
    } catch (e: any) {
        logger.warn('Could not sync check-in counts (endpoint may be unavailable)', 'sync', { error: e?.message }, churchId);
    }

    logger.info('Check-in count sync complete', 'sync', { churchId, uniquePeople: countMap.size }, churchId);
};

export const syncCheckInsData = async (churchId: string) => {
    logger.info('Syncing Check-Ins via EventTimes + Headcounts...', 'sync', { churchId }, churchId);

    const campuses = await firestore.getCampuses(churchId);
    const campusMap = new Map<string, string>();
    campuses.forEach(c => campusMap.set(c.pcoId, c.name));

    const since = new Date();
    since.setDate(since.getDate() - 90);
    const sinceStr = since.toISOString();

    try {
        const eventTimes = await fetchAllPages(
            churchId,
            `check-ins/v2/event_times?where[created_at][gte]=${sinceStr}&include=event,headcounts,attendance_types`,
            (et: any, included: any[] = []) => {
                const attrs = et.attributes;
                const startsAt: string = attrs.starts_at;
                if (!startsAt) return null;

                const eventId = et.relationships?.event?.data?.id;
                const eventObj = included?.find(i => i.type === 'Event' && i.id === eventId);
                const eventName = eventObj?.attributes?.name || 'Service';
                const campusId = eventObj?.relationships?.campus?.data?.id || null;
                const campusName = campusId ? (campusMap.get(campusId) ?? null) : null;

                const digitalCheckins: number = attrs.total_count || 0;
                const headcountRefs: any[] = et.relationships?.headcounts?.data || [];

                let regulars = 0;
                let guests = 0;
                let volunteers = 0;
                const customHeadcounts: { name: string; total: number }[] = [];

                headcountRefs.forEach((ref: any) => {
                    const hc = included?.find(i => i.type === 'Headcount' && i.id === ref.id);
                    if (!hc) return;
                    const hcTotal: number = hc.attributes?.total || 0;
                    if (hcTotal === 0) return;

                    const atTypeId = hc.relationships?.attendance_type?.data?.id;
                    const atType = included?.find(i => i.type === 'AttendanceType' && i.id === atTypeId);
                    const typeName: string = (atType?.attributes?.name || '').trim();
                    const typeNameLower = typeName.toLowerCase();

                    if (typeNameLower === 'regular' || typeNameLower === 'regulars') {
                        regulars += hcTotal;
                    } else if (typeNameLower === 'guest' || typeNameLower === 'guests') {
                        guests += hcTotal;
                    } else if (typeNameLower === 'volunteer' || typeNameLower === 'volunteers') {
                        volunteers += hcTotal;
                    } else {
                        const existing = customHeadcounts.find(c => c.name === typeName);
                        if (existing) existing.total += hcTotal;
                        else customHeadcounts.push({ name: typeName || 'Other', total: hcTotal });
                    }
                });

                const standardTotal = regulars + guests + volunteers;
                const customTotal = customHeadcounts.reduce((s, c) => s + c.total, 0);
                const total = standardTotal + customTotal + digitalCheckins;

                return {
                    id: et.id, eventId: eventId || 'unknown', eventName, startsAt,
                    date: startsAt.split('T')[0], regulars, guests, volunteers,
                    digitalCheckins, customHeadcounts, total, headcount: 0, campusId, campusName
                };
            }
        );

        const validTimes = eventTimes.filter(Boolean);
        logger.info(`Found ${validTimes.length} check-in event times`, 'sync', { churchId, count: validTimes.length }, churchId);

        if (validTimes.length === 0) {
            logger.warn(
                'No check-in event times found — Check-Ins app may not be active, no events in range, or OAuth scope missing',
                'sync', { churchId }, churchId
            );
            return;
        }

        const dailyMap = new Map<string, {
            total: number; guests: number; volunteers: number; regulars: number;
            headcount: number; digitalCheckins: number;
            customHeadcounts: { name: string; total: number }[];
            events: any[]; campusId: string | null; campusName: string | null;
        }>();

        for (const et of validTimes) {
            const key = `${et.date}_${et.campusId || 'all'}`;
            const existing = dailyMap.get(key) || {
                total: 0, guests: 0, volunteers: 0, regulars: 0, headcount: 0,
                digitalCheckins: 0, customHeadcounts: [] as { name: string; total: number }[],
                events: [], campusId: et.campusId || null, campusName: et.campusName || null,
            };

            existing.total += et.total;
            existing.guests += et.guests;
            existing.volunteers += et.volunteers;
            existing.regulars += et.regulars;
            existing.headcount += et.headcount;
            existing.digitalCheckins += et.digitalCheckins || 0;

            for (const custom of (et.customHeadcounts || [])) {
                const found = existing.customHeadcounts.find(c => c.name === custom.name);
                if (found) found.total += custom.total;
                else existing.customHeadcounts.push({ ...custom });
            }

            existing.events.push({
                id: et.id, name: et.eventName, startsAt: et.startsAt,
                guests: et.guests, regulars: et.regulars, volunteers: et.volunteers,
                headcount: et.headcount, digitalCheckins: et.digitalCheckins || 0,
                customHeadcounts: et.customHeadcounts || [], total: et.total,
                campusId: et.campusId, campusName: et.campusName
            });

            dailyMap.set(key, existing);
        }

        const attendanceRecords: AttendanceRecord[] = [];
        dailyMap.forEach((stats, key) => {
            const date = key.split('_')[0];
            attendanceRecords.push({
                id: `daily_${churchId}_${key}`,
                churchId, date,
                count: stats.total, guests: stats.guests, regulars: stats.regulars,
                volunteers: stats.volunteers, headcount: stats.headcount,
                digitalCheckins: stats.digitalCheckins,
                customHeadcounts: stats.customHeadcounts,
                events: stats.events, campusId: stats.campusId, campusName: stats.campusName
            } as AttendanceRecord);
        });

        if (attendanceRecords.length > 0) {
            await firestore.upsertAttendance(attendanceRecords);
        }

        logger.info(
            'Check-Ins sync complete', 'sync',
            { churchId, eventTimes: validTimes.length, dailyRecords: attendanceRecords.length },
            churchId
        );
    } catch (e: any) {
        logger.error('Check-Ins sync failed', 'sync', { error: e?.message }, churchId);
        console.error('Check-ins sync failed:', e);
    }
};
