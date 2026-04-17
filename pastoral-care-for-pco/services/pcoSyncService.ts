
import { firestore } from './firestoreService';
import { createServerLogger } from './logService';
import { 
    PcoPerson, PcoGroup, DetailedDonation, PcoFund, AttendanceRecord, 
    ServicePlanSnapshot, ServicesTeam, CheckInRecord,
    PcoRegistrationEvent, PcoRegistrationAttendee, PcoRegistrationCampus,
    RiskChangeRecord
} from '../types';
import { initializeWebhooks } from './pcoWebhookService';
import { calculateBulkRisk, DEFAULT_RISK_SETTINGS } from './riskService';

// Server-side logger — only initialised when running in Node.js.
// In the browser this module is imported (for client-side syncAllData calls that
// POST to the server), but getDb() must NOT be called because it requires
// Firebase Admin env vars that don't exist in the browser.  Using a no-op
// console fallback keeps the browser bundle from crashing.
const logger = (() => {
    if (typeof window === 'undefined') {
        // Node.js / server context — safe to use Firebase Admin
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { getDb } = require('../backend/firebase');
        return createServerLogger(getDb());
    }
    // Browser context — no-op stubs so all logger.xxx() calls are safe
    return {
        info:  (msg: string, ...rest: any[]) => console.log('[sync]', msg, ...rest),
        warn:  (msg: string, ...rest: any[]) => console.warn('[sync]', msg, ...rest),
        error: (msg: string, ...rest: any[]) => console.error('[sync]', msg, ...rest),
    };
})();


// Helper to get system settings and proxy URL
const getProxyUrl = async () => {
    // Always use the local server relative path since frontend and backend are served from the same origin
    if (typeof window === 'undefined') {
        // Running on server — use the actual port (defaults to 8080 matching server.ts)
        const port = process.env.PORT || 8080;
        return `http://localhost:${port}/pco/proxy`;
    }
    return '/pco/proxy';
};

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

// --- Webhooks are now handled by pcoWebhookService ---

// Helper to allow POST/PUT/DELETE in pcoFetch (extending original)
const pcoFetch = async (churchId: string, endpoint: string, retryCount = 0, method = 'GET', body: any = null): Promise<any> => {
    const proxyUrl = await getProxyUrl();
    // If endpoint is already a full URL (e.g. from 'links.next'), use it directly.
    // Otherwise, prepend the base URL.
    const fullUrl = endpoint.startsWith('http') ? endpoint : `https://api.planningcenteronline.com/${endpoint.startsWith('/') ? endpoint.substring(1) : endpoint}`;
    
    try {
        const response = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                churchId,
                url: fullUrl,
                method,
                body // Pass data for POST/PUT (Proxy expects 'body' key)
            })
        });

        console.log(`[SyncService] Fetching ${method} ${fullUrl} for church ${churchId}`);

        if (response.status === 429) {
            // Respect Retry-After header if available (though PCO might not expose it via CORS/proxy easily)
            // Default to exponential backoff
            const retryAfterHeader = response.headers.get('Retry-After');
            let waitTime = 2000 * Math.pow(2, retryCount); // 2s, 4s, 8s, 16s, 32s
            
            if (retryAfterHeader) {
                const seconds = parseInt(retryAfterHeader, 10);
                if (!isNaN(seconds)) waitTime = (seconds * 1000) + 100;
            }

            // Add jitter
            waitTime += Math.random() * 500;

            if (retryCount < 5) {
                logger.warn(`PCO Rate Limit 429 — retrying`, 'sync', { endpoint, retryCount, waitTimeMs: Math.round(waitTime) }, churchId);
                await delay(waitTime);
                return pcoFetch(churchId, endpoint, retryCount + 1);
            } else {
                logger.error('PCO API Rate Limit Exceeded: Max retries reached', 'sync', { endpoint }, churchId);
                throw new Error("PCO API Rate Limit Exceeded: Max retries reached.");
            }
        }

        if (response.status === 404) {
            logger.warn(`PCO API Resource Not Found (404)`, 'sync', { endpoint }, churchId);
            return null; // Gracefully handle missing resources
        }

        if (!response.ok) {
            const errText = await response.text();
            throw new Error(`PCO API Error (${response.status}): ${errText}`);
        }

        return await response.json();
    } catch (e: any) {
        throw e;
    }
};

// Helper to fetch all pages with safety limit increased and throttling
const fetchAllPages = async (churchId: string, endpoint: string, mapFn: (item: any, included?: any[]) => any, limitPerPage = 100) => {
    let allItems: any[] = [];
    let nextUrl = `${endpoint}${endpoint.includes('?') ? '&' : '?'}per_page=${limitPerPage}`;
    // Removed strict MAX_PAGES limit to allow full sync, rely on 429 handling and throttling
    // Set a very high safety break just in case of infinite loops
    let pageCount = 0;
    const SAFETY_MAX_PAGES = 500; 

    while (nextUrl && pageCount < SAFETY_MAX_PAGES) {
        // Use nextUrl directly as it is already a full URL or relative path
        const relativeUrl = nextUrl;
        
        try {
            const data = await pcoFetch(churchId, relativeUrl);
            if (data && data.data) {
                // Map can return a single item or an array of items (e.g. split donations)
                // We use flat() to ensure allItems is a flat array of records
                const mapped = data.data.map((item: any) => mapFn(item, data.included));
                allItems = [...allItems, ...mapped.flat()];
            }
            nextUrl = data?.links?.next;
            pageCount++;
            
            // Throttle requests slightly to be a good citizen and avoid hitting rate limits too hard
            await delay(200);
        } catch (e: any) {
            logger.warn(`Error fetching page ${pageCount}`, 'sync', { endpoint, page: pageCount, error: e?.message });
            nextUrl = null; // Stop pagination on error
        }
    }
    
    if (pageCount >= SAFETY_MAX_PAGES) {
        logger.warn(`Sync hit safety page limit — data may be incomplete`, 'sync', { endpoint, pages: SAFETY_MAX_PAGES });
    }

    return allItems;
};

// --- Sync Functions ---

export const syncAllData = async (churchId: string) => {
    logger.info('Full sync started', 'sync', { churchId }, churchId);
    const startTime = Date.now();
    
    // Ensure Webhooks are set up using the standard service
    await initializeWebhooks(churchId);

    // Execute sequentially to manage load better, wrapped in try/catch to ensure partial success
    try {
        await syncPeopleData(churchId);
    } catch (e: any) { logger.error('Sync People failed', 'sync', { error: e?.message }, churchId); }

    // Sync check-in counts AFTER people are stored so we can update their records
    try {
        await syncCheckInCounts(churchId);
    } catch (e: any) { logger.error('Sync Check-ins failed', 'sync', { error: e?.message }, churchId); }

    // Sync Check-ins data to populate the Attendance collection for the Attendance tab widgets
    try {
        await syncCheckInsData(churchId);
    } catch (e: any) { logger.error('Sync Check-ins Data failed', 'sync', { error: e?.message }, churchId); }

    try {
        await syncGroupsData(churchId);
    } catch (e: any) { logger.error('Sync Groups failed', 'sync', { error: e?.message }, churchId); }

    try {
        await syncServicesData(churchId);
    } catch (e: any) { logger.error('Sync Services failed', 'sync', { error: e?.message }, churchId); }

    try {
        await syncRecentGiving(churchId);
    } catch (e: any) { logger.error('Sync Giving failed', 'sync', { error: e?.message }, churchId); }

    // Sync Registrations — non-fatal, org may not have the Registrations module
    try {
        await syncRegistrationsData(churchId);
    } catch (e: any) { logger.error('Sync Registrations failed', 'sync', { error: e?.message }, churchId); }

    // Evaluate risk profiles & log changes
    try {
        await syncRiskChanges(churchId);
    } catch (e: any) { logger.error('Sync Risk Changes failed', 'sync', { error: e?.message }, churchId); }

    // Update last sync timestamp regardless of partial failures
    const durationMs = Date.now() - startTime;
    await firestore.updateChurch(churchId, { lastSyncTimestamp: Date.now() });
    logger.info('Full sync complete', 'sync', { churchId, durationMs }, churchId);
};

export const syncPeopleData = async (churchId: string) => {
    logger.info('Syncing people...', 'sync', { churchId }, churchId);
    const people = await fetchAllPages(
        churchId,
        // Include households so we can get householdId + householdName from the included array
        'people/v2/people?include=addresses,emails,phone_numbers,households,field_data',
        (p: any, included: any[] = []) => {
            const attrs = p.attributes;
            const rels = p.relationships;

            // ── Age calculation ─────────────────────────────────────────────────
            let age: number | undefined;
            if (attrs.birthdate) {
                const birth = new Date(attrs.birthdate);
                const now = new Date();
                age = now.getFullYear() - birth.getFullYear();
                if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
                    age--;
                }
            }

            // ── Household (FIX: was incorrectly using primary_campus ID) ────────
            // PCO people have a `households` relationship (array); use the first one.
            const householdRef = rels?.households?.data?.[0];
            const householdId = householdRef?.id || null;

            // Look up the Household record in the `included` array to get its name
            const householdObj = householdId
                ? (included || []).find(i => i.type === 'Household' && i.id === householdId)
                : null;
            const householdName = householdObj?.attributes?.name || null;

            // ── Spiritual milestones (placeholder — requires custom field mapping) ──
            const milestones = {
                salvationDate: null as string | null,
                baptismDate: null as string | null,
                isBaptizedAfterSalvation: null as boolean | null  // null not undefined — Firestore rejects undefined
            };


            // ── Phone Numbers ───────────────────────────────────────────────
            // Extract all phone numbers for this person from the included array.
            // Priority: mobile/cell → home → work → first available.
            const personPhoneNumbers = (included || [])
                .filter(i => i.type === 'PhoneNumber' && rels?.phone_numbers?.data?.some((r: any) => r.id === i.id))
                .map(ph => ({
                    number:   ph.attributes.number   || '',
                    location: ph.attributes.location || 'mobile', // 'mobile' | 'home' | 'work' | 'other'
                    primary:  ph.attributes.primary  ?? false,
                }));

            // Pick a single canonical phone: prefer primary, then mobile, then first available.
            const primaryPhone =
                personPhoneNumbers.find(ph => ph.primary) ||
                personPhoneNumbers.find(ph => ['mobile', 'cell'].includes((ph.location || '').toLowerCase())) ||
                personPhoneNumbers[0] ||
                null;

            return {
                id: p.id,
                churchId,
                name: `${attrs.first_name} ${attrs.last_name}`,
                firstName: attrs.first_name || null,
                lastName: attrs.last_name || null,
                avatar: attrs.avatar || null,
                membership: attrs.membership || null,
                status: attrs.status || null,
                gender: attrs.gender || null,
                birthdate: attrs.birthdate || null,
                anniversary: attrs.anniversary || null,
                createdAt: attrs.created_at,
                child: attrs.child ?? false,
                age,
                spiritualMilestones: milestones,
                // ── Households (FIXED) ──────────────────────────────────────────
                householdId,
                householdName,
                // ── Phone ───────────────────────────────────────────────────────
                /** Canonical phone number for SMS (E.164 or formatted). Null if none on file. */
                phone: primaryPhone ? primaryPhone.number : null,
                phoneNumbers: personPhoneNumbers,
                // ── Addresses ──────────────────────────────────────────────────
                addresses: (included || [])
                    .filter(i => i.type === 'Address' && rels?.addresses?.data?.some((r: any) => r.id === i.id))
                    .map(a => ({
                        city: a.attributes.city,
                        state: a.attributes.state,
                        zip: a.attributes.zip,
                        location: a.attributes.location
                    })),
                // ── Emails ─────────────────────────────────────────────────────
                emails: (included || [])
                    .filter(i => i.type === 'Email' && rels?.emails?.data?.some((r: any) => r.id === i.id))
                    .map(e => ({
                        address: e.attributes.address,
                        location: e.attributes.location,
                        primary: e.attributes.primary,
                    })),
                // checkInCount will be back-filled by syncCheckInCounts()
                checkInCount: 0,
            } as PcoPerson;
        }
    );

    if (people.length > 0) {
        await firestore.upsertPeople(people);
    }
    logger.info(`People sync complete`, 'sync', { churchId, count: people.length }, churchId);
};

/**
 * Fetches the number of PCO check-ins per person over the last 90 days and
 * updates each person's `checkInCount` field in Firestore.
 * This is called AFTER syncPeopleData so person documents already exist.
 */
export const syncCheckInCounts = async (churchId: string) => {
    logger.info('Syncing check-in counts...', 'sync', { churchId }, churchId);

    // PCO returns check-in records newest-first. Fetch last 90 days.
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const sinceStr = since.toISOString().split('T')[0]; // YYYY-MM-DD

    // Aggregate check-in counts by person_id
    const countMap = new Map<string, number>();

    try {
        // Fetch all recent check-ins — each record has a `person_id` attribute
        const checkIns = await fetchAllPages(
            churchId,
            `check-ins/v2/check_ins?where[created_at][gte]=${sinceStr}&per_page=100`,

            (ci: any) => ({
                personId: ci.attributes?.person_id || ci.relationships?.person?.data?.id || null,
            })
        );

        for (const ci of checkIns) {
            if (!ci.personId) continue;
            countMap.set(ci.personId, (countMap.get(ci.personId) || 0) + 1);
        }

        logger.info(`Check-in counts aggregated`, 'sync', {
            churchId,
            totalCheckIns: checkIns.length,
            uniquePeople: countMap.size
        }, churchId);

        // Batch-update person documents with their check-in count
        if (countMap.size > 0) {
            await firestore.updatePeopleCheckInCounts(churchId, Object.fromEntries(countMap));
        }
    } catch (e: any) {
        // Check-ins endpoint may not be accessible with all PCO plans — don't fail the whole sync
        logger.warn('Could not sync check-in counts (endpoint may be unavailable)', 'sync', { error: e?.message }, churchId);
    }

    logger.info('Check-in count sync complete', 'sync', { churchId, uniquePeople: countMap.size }, churchId);
};

/**
 * Calculates risk for all people based on newly fetched data, detects category changes,
 * updates people with their new historicRiskCategory, and logs changes to risk_changes collection.
 */
export const syncRiskChanges = async (churchId: string) => {
    logger.info('Evaluating risk profile changes...', 'sync', { churchId }, churchId);
    
    try {
        const [church, people, donations, groups, plans, teams] = await Promise.all([
            firestore.getChurch(churchId),
            firestore.getPeople(churchId),
            firestore.getDetailedDonations(churchId),
            firestore.getGroups(churchId),
            firestore.getServicePlans(churchId),
            firestore.getServicesTeams(churchId)
        ]);

        const settings = church?.riskSettings || DEFAULT_RISK_SETTINGS;
        
        // Calculate the new risk profiles synchronously using all fetched data
        const evaluatedPeople = calculateBulkRisk(people, donations, groups, plans, teams, settings);
        
        const changes: RiskChangeRecord[] = [];
        const peopleToUpdate: Partial<PcoPerson>[] = [];
        const nowMs = Date.now();
        const nowIso = new Date().toISOString();

        for (const person of evaluatedPeople) {
            const currentCat = person.riskProfile?.category || 'Disconnected';
            const oldCat = person.historicRiskCategory || currentCat;
            
            // If the category has objectively changed, log it and update the person record
            if (currentCat !== oldCat) {
                changes.push({
                    id: `${churchId}_${person.id}_${nowMs}`,
                    churchId,
                    personId: person.id,
                    personName: person.name,
                    date: nowIso,
                    oldCategory: oldCat,
                    newCategory: currentCat,
                    timestamp: nowMs
                });
                
                peopleToUpdate.push({
                    id: person.id,
                    churchId,
                    historicRiskCategory: currentCat
                });
            } else if (!person.historicRiskCategory) {
                // Initial set without creating a fake status change log
                peopleToUpdate.push({
                    id: person.id,
                    churchId,
                    historicRiskCategory: currentCat
                });
            }
        }
        
        if (changes.length > 0) {
            await firestore.upsertRiskChanges(changes);
            logger.info(`Logged ${changes.length} risk status changes.`, 'sync', { churchId }, churchId);
        }
        
        if (peopleToUpdate.length > 0) {
            await firestore.upsertPeople(peopleToUpdate as PcoPerson[]);
            logger.info(`Updated historicRiskCategory on ${peopleToUpdate.length} people.`, 'sync', { churchId }, churchId);
        }

    } catch (e: any) {
        logger.error('Failed to evaluate risk profile changes', 'sync', { error: e?.message }, churchId);
        throw e;
    }
};

export const syncGroupsData = async (churchId: string) => {
    logger.info('Syncing groups (deep scan)...', 'sync', { churchId }, churchId);
    
    // 1. Fetch Basic Group List with correctly mapped Types (via 'include')
    const groups = await fetchAllPages(churchId, 'groups/v2/groups?include=group_type', (g: any, included: any[] = []) => {
        // Resolve Group Type Name from 'included'
        const typeId = g.relationships?.group_type?.data?.id;
        const typeObj = included?.find(i => i.type === 'GroupType' && i.id === typeId);
        const groupTypeName = typeObj?.attributes?.name || 'Small Group';

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
            memberIds: [], // Placeholder
            attendanceHistory: [] // Placeholder
        } as PcoGroup;
    });

    logger.info(`Found ${groups.length} groups — starting deep scan`, 'sync', { churchId, count: groups.length }, churchId);

    const activeGroups = groups.filter(g => !g.archivedAt);
    const archivedGroups = groups.filter(g => g.archivedAt);
    const enrichedGroups: PcoGroup[] = [];

    // 2. Fetch Details for Active Groups
    // We process sequentially or in small batches to respect rate limits
    for (const group of activeGroups) {
        try {
            // A. Fetch All Memberships (Leaders + Members)
            // Used for Leader Widget and Gender Distribution Widget
            const allMembers = await fetchAllPages(churchId, `groups/v2/groups/${group.id}/memberships`, (m: any) => m);
            
            // Extract IDs
            const memberIds = allMembers.map((m: any) => m.relationships?.person?.data?.id).filter(Boolean);
            
            // Filter for Leaders
            const leaderIds = allMembers
                .filter((m: any) => m.attributes.role === 'leader')
                .map((m: any) => m.relationships?.person?.data?.id)
                .filter(Boolean);

            // B. Fetch All Events (History)
            // Used for Attendance Chart and Group Info Widget
            const rawEvents = await fetchAllPages(churchId, `groups/v2/groups/${group.id}/events?order=-starts_at`, (e: any) => e);
            console.log(`Group ${group.name} (${group.id}) has ${rawEvents.length} events.`);
            
            const attendanceHistory = [];

            // Iterate events to fetch detailed attendance breakdown for the most recent ones
            // We limit detailed fetch to 52 events (approx 1 year) to avoid heavy API load
            for (let i = 0; i < rawEvents.length; i++) {
                const e = rawEvents[i];
                const eventId = e.id;
                const date = e.attributes.starts_at;
                
                // Initialize with attributes from the event object
                // This ensures we have data even if we don't do the detailed fetch
                const attrAttendanceCount = e.attributes.attendance_count || 0;
                const attrVisitorsCount = e.attributes.visitors_count || 0;
                
                let membersCount = Math.max(0, attrAttendanceCount - attrVisitorsCount);
                let visitorsCount = attrVisitorsCount;
                let totalCount = attrAttendanceCount;
                
                const attendeeIds: string[] = [];
                const isPast = new Date(date) < new Date();

                // Fetch details for top 52 recent events if they are past and not canceled
                if (i < 52 && isPast && !e.attributes.canceled) {
                    try {
                        // Tiny throttle to prevent burst limits
                        await delay(50); 
                        // CORRECT endpoint: groups/v2/groups/{groupId}/events/{eventId}/attendances
                        // (the old path `events/{eventId}/attendances` does not exist in the PCO Groups API
                        //  and was silently 404-ing, causing all detail fetches to fall back to event attributes)
                        const rawAttendances = await fetchAllPages(churchId, `groups/v2/groups/${group.id}/events/${eventId}/attendances`, (a: any) => a);
                        
                        // Filter to only people who actually attended (attended === true)
                        const allAttendances = rawAttendances.filter((a: any) => a.attributes?.attended === true);
                        
                        if (allAttendances.length > 0) {
                            let recMembers = 0;
                            let recVisitors = 0;

                            allAttendances.forEach((a: any) => {
                                const pid = a.relationships?.person?.data?.id;
                                const role = a.attributes.role; // 'member', 'leader', 'visitor'

                                if (pid) {
                                    attendeeIds.push(pid);
                                    if (role === 'visitor') {
                                        recVisitors++;
                                    } else if (role === 'member' || role === 'leader') {
                                        recMembers++;
                                    } else {
                                        // Fallback if role is unclear — check against known membership lists
                                        if (memberIds.includes(String(pid)) || leaderIds.includes(String(pid))) {
                                            recMembers++;
                                        } else {
                                            recVisitors++;
                                        }
                                    }
                                }
                            });

                            // Overwrite estimates with real per-person data
                            membersCount = recMembers;
                            // Use real visitor count from per-person records.
                            // Do NOT use Math.max() here — mixing headcount and per-person data inflates the number.
                            visitorsCount = recVisitors;
                            totalCount = membersCount + visitorsCount;
                        }
                        // If allAttendances.length === 0, the fallback values from event attributes
                        // (attendance_count / visitors_count) computed above remain in effect.
                    } catch (attErr) {
                        console.warn(`Error fetching attendance breakdown for event ${eventId}`, attErr);
                        // Fallback to attribute data already set
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
                memberIds, // Store all members for demographics
                membersCount: allMembers.length, // Use authoritative count from memberships endpoint
                attendanceHistory
            });

            // Small throttle to be kind to the API between groups
            await delay(50);
        } catch (e: any) {
            logger.warn(`Error fetching details for group ${group.id} (${group.name})`, 'sync', { groupId: group.id, groupName: group.name, error: e?.message }, churchId);
            enrichedGroups.push(group); // Save basic version if details fail
        }
    }

    const finalGroups = [...enrichedGroups, ...archivedGroups];

    if (finalGroups.length > 0) {
        await firestore.upsertGroups(finalGroups);
    }
    logger.info('Groups sync complete', 'sync', { churchId, total: finalGroups.length, active: enrichedGroups.length, archived: archivedGroups.length }, churchId);
};

export const syncServicesData = async (churchId: string) => {
    logger.info('Syncing services plans & teams...', 'sync', { churchId }, churchId);
    
    // 1. Sync Teams
    let teams: ServicesTeam[] = [];
    try {
        teams = await fetchAllPages(churchId, 'services/v2/teams', (t: any) => {
            console.log(`PCO Team: ${t.attributes.name} (ID: ${t.id})`);
            return {
                id: t.id,
                churchId,
                name: t.attributes.name,
                serviceTypeId: t.relationships?.service_type?.data?.id || null,
                memberIds: [], 
                leaderPersonIds: [],
                leaderCount: 0
            } as ServicesTeam;
        });

        // Filter out Unknown teams
        teams = teams.filter(t => t.name && t.name !== 'Unknown');

        // Enrich with Leaders AND Members (Batched)
        console.log(`Fetching details for ${teams.length} teams...`);
        const BATCH_SIZE = 5;
        for (let i = 0; i < teams.length; i += BATCH_SIZE) {
            const batch = teams.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (team) => {
                try {
                    // Fetch Team Leaders
                    const leadersUrl = `services/v2/teams/${team.id}/team_leaders`;
                    const leaderRes = await pcoFetch(churchId, leadersUrl);
                    if (leaderRes.data) {
                        const lIds = leaderRes.data.map((l: any) => l.relationships?.person?.data?.id).filter(Boolean);
                        team.leaderPersonIds = lIds;
                        team.leaderCount = lIds.length;
                    }

                    // Fetch Team Members (Roster)
                    const membersUrl = `services/v2/teams/${team.id}/people?per_page=100`;
                    const membersRes = await pcoFetch(churchId, membersUrl);
                    if (membersRes.data) {
                        const mIds = membersRes.data.map((p: any) => p.id).filter(Boolean);
                        team.memberIds = mIds;
                    }
                } catch (e) {
                    console.warn(`Failed to fetch details for team ${team.id}`, e);
                }
            }));
            await delay(50);
        }
        
        if (teams.length > 0) {
            await firestore.upsertServicesTeams(teams);
        }
        logger.info('Teams sync complete', 'sync', { churchId, count: teams.length }, churchId);
    } catch (e: any) {
        logger.warn('Teams sync failed — Services may be disabled or restricted', 'sync', { churchId, error: e?.message }, churchId);
    }

    // 2. Sync Future Plans (Next 90 Days) AND Recent Past Plans (Last 90 Days)
    // STRATEGY CHANGE: Iterate Service Types instead of 'all/plans' to prevent 404s
    let plans: ServicePlanSnapshot[] = [];
    
    try {
        // Fetch Service Types first
        const serviceTypes = await fetchAllPages(churchId, 'services/v2/service_types', (st: any) => ({
            id: st.id,
            name: st.attributes.name
        }));

        console.log(`Found ${serviceTypes.length} Service Types. Fetching plans...`);

        // Fetch plans for each type individually
        for (const st of serviceTypes) {
            try {
                // Fetch Future Plans
                const futurePlans = await fetchAllPages(churchId, `services/v2/service_types/${st.id}/plans?filter=future&include=plan_times`, (p: any, included: any[] = []) => {
                    // Map plan times from included
                    const planTimes = (included || [])
                        .filter(i => 
                            i.type === 'PlanTime' && 
                            p.relationships?.plan_times?.data?.some((rel: any) => rel.id === i.id)
                        )
                        .map(i => ({
                            id: i.id,
                            startsAt: i.attributes.starts_at,
                            endsAt: i.attributes.ends_at,
                            type: i.attributes.time_type
                        }))
                        .filter(t => t.type === 'service') // Only Service Times
                        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

                    return {
                        id: p.id,
                        churchId,
                        sortDate: p.attributes.sort_date,
                        serviceTypeId: st.id,
                        serviceTypeName: st.name,
                        seriesTitle: p.attributes.series_title || null,
                        title: p.attributes.title || null,
                        positionsFilled: 0,
                        positionsNeeded: 0,
                        planTimes: planTimes.length > 0 ? planTimes.map(t => ({ id: t.id, startsAt: t.startsAt, endsAt: t.endsAt })) : undefined
                    } as ServicePlanSnapshot;
                });
                
                // Fetch Past Plans (Last 90 Days)
                // PCO API filter=past returns most recent past plans first by default
                const pastPlans = await fetchAllPages(churchId, `services/v2/service_types/${st.id}/plans?filter=past&per_page=10&include=plan_times`, (p: any, included: any[] = []) => {
                     // Map plan times from included
                    const planTimes = (included || [])
                        .filter(i => 
                            i.type === 'PlanTime' && 
                            p.relationships?.plan_times?.data?.some((rel: any) => rel.id === i.id)
                        )
                        .map(i => ({
                            id: i.id,
                            startsAt: i.attributes.starts_at,
                            endsAt: i.attributes.ends_at,
                            type: i.attributes.time_type
                        }))
                        .filter(t => t.type === 'service') // Only Service Times
                        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

                    return {
                        id: p.id,
                        churchId,
                        sortDate: p.attributes.sort_date,
                        serviceTypeId: st.id,
                        serviceTypeName: st.name,
                        seriesTitle: p.attributes.series_title || null,
                        title: p.attributes.title || null,
                        positionsFilled: 0,
                        positionsNeeded: 0,
                        planTimes: planTimes.length > 0 ? planTimes.map(t => ({ id: t.id, startsAt: t.startsAt, endsAt: t.endsAt })) : undefined
                    } as ServicePlanSnapshot;
                });

                // Filter past plans to strictly last 90 days
                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
                const recentPastPlans = pastPlans.filter(p => new Date(p.sortDate) >= ninetyDaysAgo);

                plans = [...plans, ...futurePlans, ...recentPastPlans];
                await delay(50); // Small throttle
            } catch (innerE) {
                console.warn(`Could not sync plans for Service Type ${st.id}`, innerE);
                // Continue to next service type, don't abort all
            }
        }

    } catch (e) {
        console.error("Failed to sync service types (Services likely disabled)", e);
        return; // Exit if we can't even get service types
    }

    // Sort plans by date
    plans.sort((a, b) => a.sortDate.localeCompare(b.sortDate));

    // Detail fetch for plans (limited to next 15 future + last 15 past for performance)
    // We prioritize future plans for staffing needs, but need past plans for burnout calculation
    const now = new Date();
    const futurePlansToDetail = plans.filter(p => new Date(p.sortDate) >= now).slice(0, 15);
    const pastPlansToDetail = plans.filter(p => new Date(p.sortDate) < now).slice(-15); // Most recent past
    const plansToDetail = [...futurePlansToDetail, ...pastPlansToDetail];

    const detailedPlans: ServicePlanSnapshot[] = [];
    const personServingMap = new Map<string, { last90Days: number, nextServiceDate?: string, recentServices: { date: string, planId: string, teamName: string, serviceTypeName: string }[] }>();

    for (const plan of plansToDetail) {
        if (!plan.serviceTypeId) {
            detailedPlans.push(plan);
            continue;
        }

        const membersUrl = `services/v2/service_types/${plan.serviceTypeId}/plans/${plan.id}/team_members`;
        const neededUrl = `services/v2/service_types/${plan.serviceTypeId}/plans/${plan.id}/needed_positions`;
        const itemsUrl = `services/v2/service_types/${plan.serviceTypeId}/plans/${plan.id}/items?filter=song_items&include=song`;
        
        try {
            // Fetch Members
            const membersData = await pcoFetch(churchId, membersUrl);
            const members = membersData.data.map((m: any) => ({
                personId: m.relationships?.person?.data?.id || null,
                teamName: m.attributes.team_name || 'Unknown',
                status: m.attributes.status || 'Pending',
                teamPositionName: m.attributes.team_position_name || null,
                name: m.attributes.name || 'Unknown'
            }));
            
            // Update Serving Stats Map
            const planDate = new Date(plan.sortDate);
            const isPast = planDate < now;
            const isFuture = planDate >= now;

            members.forEach((m: any) => {
                if (m.personId && (m.status === 'Confirmed' || m.status === 'C')) {
                    const current = personServingMap.get(m.personId) || { last90Days: 0, recentServices: [] };
                    
                    if (isPast) {
                        // Check if within last 90 days window
                        const ninetyDaysAgo = new Date();
                        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
                        if (planDate >= ninetyDaysAgo) {
                            current.last90Days++;
                        }
                        // Always track recent past services up to a reasonable limit (e.g. they served in the past 90 days)
                        // This allows showing the recent plans widget
                        current.recentServices.push({
                            date: plan.sortDate,
                            planId: plan.id,
                            teamName: m.teamName,
                            serviceTypeName: plan.serviceTypeName || 'Unknown'
                        });
                    } else if (isFuture) {
                        // Track next service date
                        if (!current.nextServiceDate || planDate < new Date(current.nextServiceDate)) {
                            current.nextServiceDate = plan.sortDate;
                        }
                    }
                    personServingMap.set(m.personId, current);
                }
            });

            // Fetch Needed Positions
            const neededData = await pcoFetch(churchId, neededUrl);
            const neededPositions = neededData.data.map((np: any) => {
                let teamName = np.attributes.team_name;
                const teamId = np.relationships?.team?.data?.id;
                if (!teamName || teamName === 'Unknown') {
                    if (teamId) {
                        const team = teams.find(t => t.id === teamId);
                        if (team) {
                            teamName = team.name;
                        }
                    }
                }
                return {
                    teamName: teamName || (teamId ? `Team ${teamId}` : 'Unnamed Team'),
                    quantity: np.attributes.quantity || 0
                };
            });
            const totalNeeded = neededPositions.reduce((sum: number, n: any) => sum + n.quantity, 0);

            // Fetch Plan Items (Songs) — enables Top Songs widget
            // Uses include=song to get title/author from the related Song resource
            let items: { type: string; title: string; author?: string }[] = [];
            try {
                const itemsData = await pcoFetch(churchId, itemsUrl);
                // Build a lookup map for included Song resources
                const includedSongs = new Map<string, { title: string; author: string }>();
                (itemsData.included || []).forEach((inc: any) => {
                    if (inc.type === 'Song') {
                        includedSongs.set(inc.id, {
                            title: inc.attributes.title || 'Unknown',
                            author: inc.attributes.author || ''
                        });
                    }
                });

                items = (itemsData.data || [])
                    .filter((item: any) => item.attributes.item_type === 'song' || item.relationships?.song?.data?.id)
                    .map((item: any) => {
                        const songId = item.relationships?.song?.data?.id;
                        const songDetail = songId ? includedSongs.get(songId) : null;
                        return {
                            type: 'song',
                            title: songDetail?.title || item.attributes.title || 'Unknown Title',
                            author: songDetail?.author || ''
                        };
                    }).filter((item: any) => item.title && item.title !== 'Unknown Title');
            } catch (itemsErr) {
                // Non-fatal — songs are optional; plan still saves without them
                console.warn(`Could not fetch items for plan ${plan.id}:`, itemsErr);
            }

            detailedPlans.push({
                ...plan,
                teamMembers: members,
                neededPositions: neededPositions,
                positionsNeeded: totalNeeded,
                positionsFilled: members.length,
                isUnderstaffed: totalNeeded > 0,
                items
            });
            
            await delay(100); // Throttle detail fetching
        } catch (e) {
            console.error(`Failed to fetch details for plan ${plan.id}`, e);
            // Fallback to basic plan info
            detailedPlans.push(plan);
        }
    }

    // Update People with Serving Stats
    if (personServingMap.size > 0) {
        const peopleUpdates: Partial<PcoPerson>[] = [];
        personServingMap.forEach((stats, personId) => {
            // Burnout threshold: flag anyone who served MORE THAN 2 times in any single week.
            // We bucket recentServices by ISO calendar week (Mon–Sun) and check the max bucket.
            // High:   any week with >2 confirmed services
            // Medium: any week with exactly 2 confirmed services
            // Low:    everyone else
            const weekBuckets = new Map<string, number>();
            stats.recentServices.forEach(rs => {
                const d = new Date(rs.date);
                // ISO week key: YYYY-Www  (approximate using Monday-aligned week number)
                const dayOfWeek = (d.getDay() + 6) % 7; // Mon=0 … Sun=6
                const monday = new Date(d);
                monday.setDate(d.getDate() - dayOfWeek);
                const weekKey = monday.toISOString().slice(0, 10); // "YYYY-MM-DD" of that Monday
                weekBuckets.set(weekKey, (weekBuckets.get(weekKey) || 0) + 1);
            });
            const maxWeeklyCount = weekBuckets.size > 0 ? Math.max(...weekBuckets.values()) : 0;

            let riskLevel: 'Low' | 'Medium' | 'High' = 'Low';
            if (maxWeeklyCount > 2) riskLevel = 'High';
            else if (maxWeeklyCount === 2) riskLevel = 'Medium';

            // Sort recent services descending
            stats.recentServices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

            peopleUpdates.push({
                id: personId,
                servingStats: {
                    last90DaysCount: stats.last90Days,
                    riskLevel,
                    nextServiceDate: stats.nextServiceDate,
                    recentServices: stats.recentServices.slice(0, 10) // keep top 10
                }
            });
        });
        
        // Persist serving stats so the Burnout Watchlist widget has data.
        // upsertPeople uses merge:true so only the servingStats field is updated.
        await firestore.upsertPeople(peopleUpdates as any);
        console.log(`Saved serving stats for ${peopleUpdates.length} people. High risk: ${peopleUpdates.filter((p: any) => p.servingStats?.riskLevel === 'High').length}`);
    }

    // Merge detailed plans back into the main list for saving
    const allPlansToSave = plans.map(p => {
        const detailed = detailedPlans.find(dp => dp.id === p.id);
        return detailed || p;
    });

    if (allPlansToSave.length > 0) {
        await firestore.upsertServicePlans(allPlansToSave);
    }
    logger.info('Service plans sync complete', 'sync', { churchId, total: allPlansToSave.length, detailed: detailedPlans.length }, churchId);
};

export const syncRecentGiving = async (churchId: string, startDate?: Date) => {
    logger.info('Syncing giving...', 'sync', { churchId }, churchId);
    // If no start date, default to last 365 days
    const since = startDate ? startDate.toISOString() : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();
    
    // 1. Fetch Funds First to build a lookup map
    // This is more reliable than relying on 'included' funds in donation responses
    const fundMap = new Map<string, string>();
    try {
        const funds = await fetchAllPages(churchId, 'giving/v2/funds', (f: any) => ({
            id: f.id,
            churchId,
            name: f.attributes.name
        } as PcoFund));
        
        if (funds.length > 0) {
            await firestore.upsertFunds(funds);
            funds.forEach(f => fundMap.set(f.id, f.name));
            console.log(`Synced ${funds.length} funds.`);
        }
    } catch (e) {
        console.error("Funds sync error", e);
    }

    // 2. Fetch Donations
    let donations: DetailedDonation[] = [];
    try {
        // We still include designations to get the amounts and fund IDs
        donations = await fetchAllPages(churchId, `giving/v2/donations?where[received_at][gte]=${since}&include=designations`, (d: any, included: any[] = []) => {
            const donationDate = d.attributes.received_at;
            const donorId = d.relationships?.person?.data?.id || 'anonymous';
            const isRecurring = !!d.relationships?.recurring_donation?.data;

            // Designations map specific amounts to funds
            const designationRefs = d.relationships?.designations?.data || [];
            
            if (designationRefs.length === 0) {
                // Minimal fallback for donation without designations (rare)
                // Use _0 suffix to ensure consistency with new ID schema
                return [{
                    id: `${d.id}_0`,
                    churchId,
                    amount: (d.attributes.amount_cents || 0) / 100,
                    date: donationDate,
                    fundName: 'General',
                    fundId: undefined,
                    donorId,
                    donorName: 'Donor',
                    isRecurring
                }] as DetailedDonation[];
            }

            const results: DetailedDonation[] = [];
            
            designationRefs.forEach((ref: any, index: number) => {
                const designation = included.find(i => i.type === 'Designation' && String(i.id) === String(ref.id));
                if (designation) {
                    const amount = (designation.attributes.amount_cents || 0) / 100;
                    let fundName = 'General';
                    let fundId = undefined;
                    
                    // Resolve Fund Name & ID
                    const fundRef = designation.relationships?.fund?.data;
                    if (fundRef) {
                        fundId = fundRef.id;
                        // Use the pre-fetched fund map for accuracy
                        if (fundMap.has(fundId)) {
                            fundName = fundMap.get(fundId)!;
                        }
                    }
                    
                    results.push({
                        id: `${d.id}_${index}`, // Composite ID for uniqueness in Firestore
                        churchId,
                        amount,
                        date: donationDate,
                        fundName,
                        fundId,
                        donorId,
                        donorName: 'Donor', 
                        isRecurring
                    });
                }
            });
            
            return results;
        });

        if (donations.length > 0) {
            await firestore.upsertDetailedDonations(donations);
            
            // Calculate and Update Giving Stats for People
            console.log("Calculating Giving Stats...");
            const donorStats = new Map<string, { weekly: number, monthly: number, quarterly: number, ytd: number }>();
            const now = new Date();
            const startOfYear = new Date(now.getFullYear(), 0, 1);
            const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
            const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
            const startOfWeek = new Date(now);
            startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday

            donations.forEach(d => {
                if (!d.donorId || d.donorId === 'anonymous') return;
                
                const current = donorStats.get(d.donorId) || { weekly: 0, monthly: 0, quarterly: 0, ytd: 0 };
                const date = new Date(d.date);
                const amount = d.amount;

                if (date >= startOfWeek) current.weekly += amount;
                if (date >= startOfMonth) current.monthly += amount;
                if (date >= startOfQuarter) current.quarterly += amount;
                if (date >= startOfYear) current.ytd += amount;

                donorStats.set(d.donorId, current);
            });

            const peopleUpdates: Partial<PcoPerson>[] = [];
            donorStats.forEach((stats, personId) => {
                peopleUpdates.push({
                    id: personId,
                    givingStats: {
                        ...stats,
                        lastUpdated: Date.now()
                    }
                });
            });

            if (peopleUpdates.length > 0) {
                await firestore.upsertPeople(peopleUpdates as any); // Type assertion needed if partial
                console.log(`Updated giving stats for ${peopleUpdates.length} donors.`);
            }
        }
        console.log(`Synced ${donations.length} donation entries.`);
    } catch (e) {
        console.error("Giving sync error (Check permissions)", e);
    }
};

export const syncCheckInsData = async (churchId: string) => {
    logger.info('Syncing Check-Ins via EventTimes + Headcounts...', 'sync', { churchId }, churchId);

    // Fetch last 90 days of event times
    // PCO Check-Ins hierarchy: Event → EventPeriod → EventTime
    // EventTime has headcount data directly as attributes (regular_count, guest_count, volunteer_count, total_count)
    const since = new Date();
    since.setDate(since.getDate() - 90);
    const sinceStr = since.toISOString(); // Full ISO string for starts_at filter

    try {
        // Fetch event times with event name, headcounts, AND attendance_type names
        // include=event            → event name (e.g. "Sunday Morning")
        // include=headcounts       → manually-entered headcount totals per AttendanceType
        // include=attendance_types → the name of each AttendanceType (Standard, Custom, etc.)
        const eventTimes = await fetchAllPages(
            churchId,
            `check-ins/v2/event_times?where[created_at][gte]=${sinceStr}&include=event,headcounts,attendance_types`,
            (et: any, included: any[] = []) => {
                const attrs = et.attributes;
                const startsAt: string = attrs.starts_at;
                if (!startsAt) return null;

                // Resolve the parent event name from included resources
                const eventId = et.relationships?.event?.data?.id;
                const eventObj = included?.find(i => i.type === 'Event' && i.id === eventId);
                const eventName = eventObj?.attributes?.name || 'Service';

                // --- Digital check-in transaction count (people who used the PCO app/kiosk) ---
                const digitalCheckins: number = attrs.total_count || 0;

                // --- Manual headcounts (from included Headcount + AttendanceType resources) ---
                // Each Headcount links to an AttendanceType via relationships.attendance_type.data.id
                // The AttendanceType.name tells us whether it's Standard (Regular/Guest/Volunteer) or Custom
                const headcountRefs: any[] = et.relationships?.headcounts?.data || [];

                let regulars = 0;
                let guests = 0;
                let volunteers = 0;
                const customHeadcounts: { name: string; total: number }[] = [];

                headcountRefs.forEach((ref: any) => {
                    const hc = included?.find(i => i.type === 'Headcount' && i.id === ref.id);
                    if (!hc) return;

                    const hcTotal: number = hc.attributes?.total || 0;
                    if (hcTotal === 0) return; // Skip zero-count entries

                    // Resolve the AttendanceType name for this headcount
                    const atTypeId = hc.relationships?.attendance_type?.data?.id;
                    const atType = included?.find(i => i.type === 'AttendanceType' && i.id === atTypeId);
                    const typeName: string = (atType?.attributes?.name || '').trim();
                    const typeNameLower = typeName.toLowerCase();

                    // Standard types: Regular, Guest, Volunteer (by convention in PCO)
                    if (typeNameLower === 'regular' || typeNameLower === 'regulars') {
                        regulars += hcTotal;
                    } else if (typeNameLower === 'guest' || typeNameLower === 'guests') {
                        guests += hcTotal;
                    } else if (typeNameLower === 'volunteer' || typeNameLower === 'volunteers') {
                        volunteers += hcTotal;
                    } else {
                        // Custom attendance type — store with its name
                        const existing = customHeadcounts.find(c => c.name === typeName);
                        if (existing) {
                            existing.total += hcTotal;
                        } else {
                            customHeadcounts.push({ name: typeName || 'Other', total: hcTotal });
                        }
                    }
                });

                // Grand total = standard headcounts + custom headcounts + digital check-ins
                const standardTotal = regulars + guests + volunteers;
                const customTotal = customHeadcounts.reduce((s, c) => s + c.total, 0);
                const total = standardTotal + customTotal + digitalCheckins;

                return {
                    id: et.id,
                    eventId: eventId || 'unknown',
                    eventName,
                    startsAt,
                    date: startsAt.split('T')[0],
                    regulars,
                    guests,
                    volunteers,
                    digitalCheckins,
                    customHeadcounts,
                    total,
                    headcount: 0, // legacy field, kept for compatibility
                };
            }
        );



        // Filter out nulls
        const validTimes = eventTimes.filter(Boolean);

        logger.info(`Found ${validTimes.length} check-in event times`, 'sync', { churchId, count: validTimes.length }, churchId);

        if (validTimes.length === 0) {
            logger.warn(
                'No check-in event times found — Check-Ins app may not be active, no events in range, or OAuth scope missing',
                'sync', { churchId }, churchId
            );
            return;
        }

        // Aggregate event times into daily AttendanceRecord objects
        // Multiple services on the same day are combined into one daily record,
        // with individual event details stored in the 'events' array for the Events table widget.
        const dailyMap = new Map<string, {
            total: number;
            guests: number;
            volunteers: number;
            regulars: number;
            headcount: number;
            digitalCheckins: number;
            customHeadcounts: { name: string; total: number }[];
            events: any[];
        }>();

        for (const et of validTimes) {
            const existing = dailyMap.get(et.date) || {
                total: 0,
                guests: 0,
                volunteers: 0,
                regulars: 0,
                headcount: 0,
                digitalCheckins: 0,
                customHeadcounts: [] as { name: string; total: number }[],
                events: [],
            };

            existing.total += et.total;
            existing.guests += et.guests;
            existing.volunteers += et.volunteers;
            existing.regulars += et.regulars;
            existing.headcount += et.headcount;
            existing.digitalCheckins += et.digitalCheckins || 0;

            // Merge custom headcounts by name
            for (const custom of (et.customHeadcounts || [])) {
                const found = existing.customHeadcounts.find(c => c.name === custom.name);
                if (found) found.total += custom.total;
                else existing.customHeadcounts.push({ ...custom });
            }

            existing.events.push({
                id: et.id,
                name: et.eventName,
                startsAt: et.startsAt,
                guests: et.guests,
                regulars: et.regulars,
                volunteers: et.volunteers,
                headcount: et.headcount,
                digitalCheckins: et.digitalCheckins || 0,
                customHeadcounts: et.customHeadcounts || [],
                total: et.total,
            });

            dailyMap.set(et.date, existing);
        }

        // Convert to AttendanceRecord array and save to Firestore
        const attendanceRecords: AttendanceRecord[] = [];
        dailyMap.forEach((stats, date) => {
            attendanceRecords.push({
                id: `daily_${churchId}_${date}`,
                churchId,
                date,
                count: stats.total,
                guests: stats.guests,
                regulars: stats.regulars,
                volunteers: stats.volunteers,
                headcount: stats.headcount,
                digitalCheckins: stats.digitalCheckins,
                customHeadcounts: stats.customHeadcounts,
                events: stats.events,
            } as any);
        });

        if (attendanceRecords.length > 0) {
            await firestore.upsertAttendance(attendanceRecords);
        }

        logger.info(
            'Check-Ins sync complete',
            'sync',
            { churchId, eventTimes: validTimes.length, dailyRecords: attendanceRecords.length },
            churchId
        );

    } catch (e: any) {
        logger.error('Check-Ins sync failed', 'sync', { error: e?.message }, churchId);
        console.error('Check-ins sync failed:', e);
    }
};

/**
 * Full Registrations sync using the correct PCO Registrations API v2 structure:
 *  - PCO calls these "signups" (not "events") in the API, though they appear as "events" in the UI.
 *  1. Campuses  — /registrations/v2/campuses
 *  2. Signups   — /registrations/v2/signups?include=signup_times  (maps to PcoRegistrationEvent)
 *  3. Attendees — /registrations/v2/signups/{id}/attendees?include=person,registration
 *
 * Stored in:
 *   pco_registrations           (one doc per signup)
 *   pco_registration_attendees  (one doc per attendee)
 *   pco_registration_campuses   (one doc per campus)
 *
 * Non-fatal: if the org has no Registrations module (probe returns _pcoNote) we bail silently.
 */
export const syncRegistrationsData = async (churchId: string) => {
    logger.info('Syncing registrations (full replace)...', 'sync', { churchId }, churchId);

    try {
        // ── Probe: check module availability before clearing any existing data ───
        // Use the correct /signups endpoint; /events does not exist in the PCO Registrations API.
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
            if (campuses.length > 0) {
                await firestore.upsertRegistrationCampuses(campuses);
            }
            logger.info('Registration campuses synced', 'sync', { churchId, count: campuses.length }, churchId);
        } catch (campusErr: any) {
            logger.warn('Campus sync failed (non-fatal)', 'sync', { churchId, error: campusErr?.message }, churchId);
        }

        // Build campus lookup for enriching signups
        const campusMap = new Map<string, string>(); // pcoId → name
        campuses.forEach(c => campusMap.set(c.pcoId, c.name));

        // ── 2. Signups (what PCO calls "events" in the UI) ───────────────────
        // PCO Registrations API v2 uses the resource name "signups" for registration events.
        // Signup attributes: name, description, logo_url, open_at, close_at, new_registration_url, archived.
        // Actual event start/end dates live in the related SignupTime resources (included here).
        const rawSignups = await fetchAllPages(
            churchId,
            'registrations/v2/signups?include=signup_times',
            (item: any, included: any[] = []) => {
                if (!item) return null;
                const attrs = item.attributes || {};

                // Resolve the earliest upcoming (or most recent past) SignupTime for a usable date
                const signupTimeRefs: any[] = item.relationships?.signup_times?.data || [];
                const signupTimes = signupTimeRefs
                    .map((ref: any) => included?.find((i: any) => i.type === 'SignupTime' && i.id === ref.id))
                    .filter(Boolean)
                    .sort((a: any, b: any) => {
                        const aDate = a.attributes?.starts_at || a.attributes?.created_at || '';
                        const bDate = b.attributes?.starts_at || b.attributes?.created_at || '';
                        return aDate.localeCompare(bDate);
                    });

                // Pick the first upcoming time; fall back to the last past time
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
                    // Dates — open_at/close_at are the registration window; startsAt from SignupTime is the event date
                    startsAt,
                    endsAt,
                    openAt: attrs.open_at || null,
                    closeAt: attrs.close_at || null,
                    // Counts — filled in during attendee sync below
                    signupCount: 0,
                    signupLimit: null,
                    openSignup: !attrs.archived,
                    // Campus
                    campusId,
                    campusName: campusId ? (campusMap.get(campusId) ?? null) : null,
                    totalRegistrations: 0,
                    totalAttendees: 0,
                    waitlistedCount: 0,
                    canceledCount: 0,
                    lastSynced: now,
                } as PcoRegistrationEvent;
            }
        );

        const events = rawSignups.filter(Boolean) as PcoRegistrationEvent[];
        logger.info(`Fetched ${events.length} registration signups`, 'sync', { churchId }, churchId);

        // ── 3. Clear existing data AFTER fetch succeeds ──────────────────────
        await firestore.clearRegistrations(churchId);

        // ── 4. Attendees for each signup ─────────────────────────────────────
        // Endpoint: GET /registrations/v2/signups/{id}/attendees?include=person,registration
        // Attendee booleans use no `is_` prefix: `waitlisted`, `canceled`, `active`, `complete`
        const allAttendees: PcoRegistrationAttendee[] = [];

        for (const event of events) {
            try {
                const eventAttendees = await fetchAllPages(
                    churchId,
                    `registrations/v2/signups/${event.pcoId}/attendees?include=person,registration`,
                    (attendeeItem: any, included: any[] = []) => {
                        if (!attendeeItem) return null;
                        const aAttrs = attendeeItem.attributes || {};

                        // Resolve the linked Person for name data
                        const personId = attendeeItem.relationships?.person?.data?.id || null;
                        const personData = personId
                            ? included?.find((i: any) => i.type === 'Person' && i.id === personId)
                            : null;
                        const pAttrs = personData?.attributes || {};
                        // PCO Person resource has: name, first_name, last_name
                        const name = pAttrs.name ||
                            (`${pAttrs.first_name || ''} ${pAttrs.last_name || ''}`.trim()) ||
                            'Unknown';

                        // Resolve the linked Registration for financial data
                        const regId = attendeeItem.relationships?.registration?.data?.id || null;
                        const regData = regId
                            ? included?.find((i: any) => i.type === 'Registration' && i.id === regId)
                            : null;
                        const rAttrs = regData?.attributes || {};

                        // PCO Attendee boolean status fields — no `is_` prefix in v2
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

                // Back-fill event counters from actual attendee data
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

            // Throttle between signups to be a good API citizen
            await delay(150);
        }

        // ── 5. Persist to Firestore ──────────────────────────────────────────
        if (events.length > 0) {
            await firestore.upsertRegistrations(events);
        }
        if (allAttendees.length > 0) {
            await firestore.upsertRegistrationAttendees(allAttendees);
        }

        logger.info(
            'Registrations full sync complete',
            'sync',
            { churchId, events: events.length, attendees: allAttendees.length, campuses: campuses.length },
            churchId
        );

    } catch (e: any) {
        // 403 = missing registrations scope
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

