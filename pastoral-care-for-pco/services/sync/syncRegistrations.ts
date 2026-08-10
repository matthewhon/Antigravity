/**
 * syncRegistrations.ts
 * PCO sync for Registrations: signups (events), attendees, and registration campuses.
 */

import { firestore } from '../firestoreService';
import { PcoRegistrationEvent, PcoRegistrationAttendee, PcoRegistrationCampus } from '../../types';
import { logger, fetchAllPages, pcoFetch, delay } from './pcoSyncCore.ts';

/**
 * Full Registrations sync using the correct PCO Registrations API v2 structure.
 * Non-fatal: if the org has no Registrations module (probe returns _pcoNote) we bail silently.
 */
export const syncRegistrationsData = async (churchId: string) => {
    logger.info('Syncing registrations (full replace)...', 'sync', { churchId }, churchId);

    try {
        const probeData = await pcoFetch(churchId, 'registrations/v2/signups?per_page=1');
        if (!probeData || probeData._pcoNote) {
            logger.info(
                'Registrations module not available for this organization — skipping sync',
                'sync', { churchId, note: probeData?._pcoNote }, churchId
            );
            return;
        }

        const now = Date.now();

        // ── 1. Campuses ─────────────────────────────────────────────────────────
        let campuses: PcoRegistrationCampus[] = [];
        try {
            campuses = await fetchAllPages(
                churchId,
                'registrations/v2/campuses',
                (item: any) => {
                    if (!item) return null;
                    const attrs = item.attributes || {};
                    return {
                        id: `${churchId}_${item.id}`,
                        pcoId: item.id,
                        churchId,
                        name: attrs.name || 'Unnamed Campus',
                        createdAt: attrs.created_at || null,
                        updatedAt: attrs.updated_at || null,
                        lastSynced: now,
                    } as PcoRegistrationCampus;
                }
            );
            campuses = campuses.filter(Boolean);
            if (campuses.length > 0) await firestore.upsertRegistrationCampuses(campuses);
            logger.info('Registration campuses synced', 'sync', { churchId, count: campuses.length }, churchId);
        } catch (campusErr: any) {
            logger.warn('Campus sync failed (non-fatal)', 'sync', { churchId, error: campusErr?.message }, churchId);
        }

        const campusMap = new Map<string, string>();
        campuses.forEach(c => campusMap.set(c.pcoId, c.name));

        // ── 2. Signups ───────────────────────────────────────────────────────────
        // STRICT: this is a full-replace sync. A truncated signup list would wipe
        // every registration below and restore only the subset that came back.
        const rawSignups = await fetchAllPages(
            churchId,
            'registrations/v2/signups?include=signup_times',
            (item: any, included: any[] = []) => {
                if (!item) return null;
                const attrs = item.attributes || {};

                const signupTimeRefs: any[] = item.relationships?.signup_times?.data || [];
                const signupTimes = signupTimeRefs
                    .map((ref: any) => included?.find((i: any) => i.type === 'SignupTime' && i.id === ref.id))
                    .filter(Boolean)
                    .sort((a: any, b: any) => {
                        const aDate = a.attributes?.starts_at || a.attributes?.created_at || '';
                        const bDate = b.attributes?.starts_at || b.attributes?.created_at || '';
                        return aDate.localeCompare(bDate);
                    });

                const nowIso = new Date().toISOString();
                const upcomingTime = signupTimes.find((t: any) => (t.attributes?.starts_at || '') >= nowIso);
                const chosenTime = upcomingTime || signupTimes[signupTimes.length - 1];
                const startsAt = chosenTime?.attributes?.starts_at || attrs.open_at || null;
                const endsAt = chosenTime?.attributes?.ends_at || attrs.close_at || null;
                const campusId = item.relationships?.campus?.data?.id || null;

                return {
                    id: `${churchId}_${item.id}`,
                    pcoId: item.id,
                    churchId,
                    name: attrs.name || 'Unnamed Event',
                    description: attrs.description || null,
                    logoUrl: attrs.logo_url || null,
                    publicUrl: attrs.new_registration_url ||
                        (item.id ? `https://registrations.planningcenteronline.com/events/${item.id}` : null),
                    visibility: attrs.archived ? 'archived' : 'public',
                    registrationType: null,
                    startsAt,
                    endsAt,
                    openAt: attrs.open_at || null,
                    closeAt: attrs.close_at || null,
                    signupCount: 0,
                    signupLimit: null,
                    openSignup: !attrs.archived,
                    campusId,
                    campusName: campusId ? (campusMap.get(campusId) ?? null) : null,
                    totalRegistrations: 0,
                    totalAttendees: 0,
                    waitlistedCount: 0,
                    canceledCount: 0,
                    lastSynced: now,
                } as PcoRegistrationEvent;
            },
            100,
            { strict: true }
        );

        const events = rawSignups.filter(Boolean) as PcoRegistrationEvent[];
        logger.info(`Fetched ${events.length} registration signups`, 'sync', { churchId }, churchId);

        // ── 3. Attendees for each signup ─────────────────────────────────────
        const allAttendees: PcoRegistrationAttendee[] = [];

        for (const event of events) {
            try {
                const eventAttendees = await fetchAllPages(
                    churchId,
                    `registrations/v2/signups/${event.pcoId}/attendees?include=person,registration`,
                    (attendeeItem: any, included: any[] = []) => {
                        if (!attendeeItem) return null;
                        const aAttrs = attendeeItem.attributes || {};

                        const personId = attendeeItem.relationships?.person?.data?.id || null;
                        const personData = personId
                            ? included?.find((i: any) => i.type === 'Person' && i.id === personId)
                            : null;
                        const pAttrs = personData?.attributes || {};
                        const name = pAttrs.name ||
                            (`${pAttrs.first_name || ''} ${pAttrs.last_name || ''}`.trim()) ||
                            'Unknown';

                        const regId = attendeeItem.relationships?.registration?.data?.id || null;
                        const regData = regId
                            ? included?.find((i: any) => i.type === 'Registration' && i.id === regId)
                            : null;
                        const rAttrs = regData?.attributes || {};

                        const isWaitlisted = aAttrs.waitlisted ?? false;
                        const isCanceled = aAttrs.canceled ?? false;
                        const statusRaw = isWaitlisted ? 'waitlisted' : isCanceled ? 'canceled' : 'confirmed';

                        return {
                            id: `${churchId}_${attendeeItem.id}`,
                            pcoId: attendeeItem.id,
                            churchId,
                            eventId: event.id,
                            pcoEventId: event.pcoId,
                            registrationId: regId || null,
                            name,
                            status: statusRaw,
                            isWaitlisted,
                            isCanceled,
                            attendeeTypeName: aAttrs.selection_type_name || null,
                            personId,
                            emergencyContactName: null,
                            emergencyContactPhone: null,
                            totalCostCents: rAttrs.total_cost_cents ?? null,
                            balanceDueCents: rAttrs.balance_due_cents ?? null,
                            createdAt: aAttrs.created_at || null,
                            lastSynced: now,
                        } as PcoRegistrationAttendee;
                    }
                );

                const validAttendees = eventAttendees.filter(Boolean) as PcoRegistrationAttendee[];

                event.totalAttendees = validAttendees.length;
                event.totalRegistrations = new Set(validAttendees.map(a => a.registrationId).filter(Boolean)).size;
                event.waitlistedCount = validAttendees.filter(a => a.isWaitlisted).length;
                event.canceledCount = validAttendees.filter(a => a.isCanceled).length;
                event.signupCount = validAttendees.filter(a => !a.isWaitlisted && !a.isCanceled).length || 0;

                allAttendees.push(...validAttendees);
            } catch (attErr: any) {
                logger.warn(
                    `Attendee fetch failed for signup ${event.pcoId} (non-fatal)`,
                    'sync', { churchId, signupId: event.pcoId, error: attErr?.message }, churchId
                );
            }
            await delay(150);
        }

        // ── 4. Replace: clear only once every fetch has succeeded ────────────
        // Doing this any earlier leaves a window where a failed attendee fetch (or a
        // crash) drops the tenant's registrations with nothing to restore them from.
        await firestore.clearRegistrations(churchId);

        // ── 5. Persist to Firestore ──────────────────────────────────────────
        if (events.length > 0) await firestore.upsertRegistrations(events);
        if (allAttendees.length > 0) await firestore.upsertRegistrationAttendees(allAttendees);

        logger.info(
            'Registrations full sync complete', 'sync',
            { churchId, events: events.length, attendees: allAttendees.length, campuses: campuses.length },
            churchId
        );
    } catch (e: any) {
        if (e?.message?.includes('403') || e?.message?.includes('requiresReauth') || e?.message?.includes('not authorized')) {
            logger.warn(
                'Registrations sync skipped: scope not granted. Reconnect PCO in Settings → Planning Center to enable.',
                'sync', { churchId }, churchId
            );
            return;
        }
        logger.warn('Registrations sync failed (non-fatal)', 'sync', { churchId, error: e?.message }, churchId);
        console.warn('Registrations sync failed:', e);
    }
};
