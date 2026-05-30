import { Firestore } from '@google-cloud/firestore';
import { createServerLogger } from '../services/logService';
import { askPastorAI } from '../services/geminiService';
import { sendIndividualInternal } from './smsSend';
import { calculateBulkRisk, DEFAULT_RISK_SETTINGS } from '../services/riskService';
import { 
    calculateGivingAnalytics, 
    DEFAULT_LIFECYCLE_SETTINGS, 
    calculatePeopleDashboardData, 
    calculateGroupsDashboardData, 
    calculateServicesAnalytics 
} from '../services/analyticsService';
import { fetchFromPco } from './publicApi';

function normalizeToLast10Digits(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    return digits.slice(-10);
}

function findMatchingGroupOrEvent(
    query: string,
    groups: any[],
    pcoEvents: any[]
): { type: 'group' | 'event'; item: any } | null {
    const qLower = query.toLowerCase();
    
    // Create candidates with normalized names and original items
    const groupCandidates = groups
        .filter(g => g.name)
        .map(g => {
            const name = g.name.toLowerCase();
            const nameNormalized = name.replace(/s$/, '').replace(/classes$/, 'class');
            return { type: 'group' as const, item: g, nameNormalized, name };
        });

    const eventCandidates = pcoEvents
        .map(ev => {
            const name = (ev.attributes?.name || '').toLowerCase();
            const nameNormalized = name.replace(/s$/, '').replace(/classes$/, 'class');
            return { type: 'event' as const, item: ev, nameNormalized, name };
        });

    // Combine and sort by normalized name length descending so that more specific/longer matches are checked first
    const candidates = [...groupCandidates, ...eventCandidates].sort((a, b) => b.nameNormalized.length - a.nameNormalized.length);

    const qNormalized = qLower.replace(/s$/, '').replace(/classes$/, 'class');

    // 1. Try exact/substring matches on the sorted candidates
    for (const c of candidates) {
        if (qNormalized.includes(c.nameNormalized) || c.nameNormalized.includes(qNormalized)) {
            return { type: c.type, item: c.item };
        }
    }

    // 2. Try word-by-word overlap check on the sorted candidates
    for (const c of candidates) {
        const wordFilterWord = c.type === 'group' ? 'group' : 'event';
        const words = c.name.split(/\s+/).filter(w => w.length > 3 && w !== 'class' && w !== 'classes' && w !== 'group' && w !== 'meeting' && w !== wordFilterWord);
        if (words.length > 0 && words.every(w => qLower.includes(w))) {
            return { type: c.type, item: c.item };
        }
    }
    
    return null;
}

export async function processExecutiveAiQuery(
    db: Firestore,
    log: ReturnType<typeof createServerLogger>,
    churchId: string,
    phoneNumber: string,
    body: string,
    listId: string,
    smsNumberId?: string
) {
    try {
        // 1. Verify if the person is in the authorized PCO list
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return;
        const churchData = churchSnap.data()!;

        const inputNormalized = normalizeToLast10Digits(phoneNumber);
        if (!inputNormalized || inputNormalized.length < 10) {
            log.warn(`[Executive AI] Incoming phone number ${phoneNumber} is invalid or too short for verification.`, 'system', { churchId }, churchId);
            return;
        }
        
        let listData;
        try {
            const listUrl = `https://api.planningcenteronline.com/people/v2/lists/${listId}/people?per_page=100&include=phone_numbers`;
            listData = await fetchFromPco(churchId, listUrl);
        } catch (err: any) {
            log.warn(`[Executive AI] Failed to fetch PCO list ${listId}: ${err.message}`, 'system', { churchId }, churchId);
            return;
        }

        const people = listData?.data || [];
        const included = listData?.included || [];

        let matchedPerson: { id: string; name: string; avatar: string | null } | null = null;

        for (const person of people) {
            const personId = person.id;
            const personName = person.attributes?.name || '';
            const personAvatar = person.attributes?.avatar || null;

            // Find all phone numbers for this person in the included object
            const phones = included
                .filter((inc: any) => inc.type === 'PhoneNumber' && person.relationships?.phone_numbers?.data?.some((p: any) => p.id === inc.id))
                .map((inc: any) => inc.attributes?.number)
                .filter(Boolean);

            const hasMatchingPhone = phones.some((phone: string) => {
                const norm = normalizeToLast10Digits(phone);
                return norm === inputNormalized;
            });

            if (hasMatchingPhone) {
                matchedPerson = { id: personId, name: personName, avatar: personAvatar };
                break;
            }
        }

        if (!matchedPerson) {
            log.info(`[Executive AI] Phone number ${phoneNumber} is not associated with any member in the authorized list ${listId}. Ignoring.`, 'system', { churchId }, churchId);
            return;
        }

        // Backfill local conversation with person details if not set
        const convId = `${churchId}_${phoneNumber.replace(/\+/g, '')}`;
        const convRef = db.collection('smsConversations').doc(convId);
        const convSnap = await convRef.get();
        if (convSnap.exists) {
            const convData = convSnap.data();
            if (!convData?.personId) {
                await convRef.update({
                    personId: matchedPerson.id,
                    personName: matchedPerson.name,
                    personAvatar: matchedPerson.avatar
                });
                log.info(`[Executive AI] Backfilled conversation ${convId} with PCO member ${matchedPerson.name} (${matchedPerson.id})`, 'system', { churchId }, churchId);
            }
        }

        // 2. Gather Context
        log.info(`[Executive AI] Authorized query received from ${matchedPerson.name} (${phoneNumber}): ${body}`, 'system', { churchId }, churchId);
        
        const [
            peopleSnap,
            donationsSnap,
            groupsSnap,
            servicePlansSnap,
            teamsSnap,
            attendanceSnap,
            budgetsSnap,
            fundsSnap,
            riskChangesSnap,
            statusChangesSnap
        ] = await Promise.all([
            db.collection('people').where('churchId', '==', churchId).get(),
            db.collection('detailed_donations').where('churchId', '==', churchId).get(),
            db.collection('groups').where('churchId', '==', churchId).get(),
            db.collection('service_plans').where('churchId', '==', churchId).get(),
            db.collection('teams').where('churchId', '==', churchId).get(),
            db.collection('attendance').where('churchId', '==', churchId).get(),
            db.collection('budgets').where('churchId', '==', churchId).get(),
            db.collection('funds').where('churchId', '==', churchId).get(),
            db.collection('risk_changes').where('churchId', '==', churchId).get(),
            db.collection('status_changes').where('churchId', '==', churchId).get()
        ]);

        const peopleRaw = peopleSnap.docs.map(doc => doc.data() as any);
        const donations = donationsSnap.docs.map(doc => doc.data() as any);
        const groupsRaw = groupsSnap.docs.map(doc => doc.data() as any);
        const servicePlans = servicePlansSnap.docs.map(doc => doc.data() as any);
        const teams = teamsSnap.docs.map(doc => doc.data() as any);
        const attendanceRaw = attendanceSnap.docs.map(doc => doc.data() as any);
        const budgets = budgetsSnap.docs.map(doc => doc.data() as any);
        const funds = fundsSnap.docs.map(doc => doc.data() as any);
        const riskChangesRaw = riskChangesSnap.docs.map(doc => doc.data() as any);
        const statusChangesRaw = statusChangesSnap.docs.map(doc => doc.data() as any);

        const hideInactiveMembers = churchData.pcoSettings?.hideInactiveMembers ?? false;
        const hideArchivedItems = churchData.pcoSettings?.hideArchivedItems ?? false;

        const visiblePeople = hideInactiveMembers
            ? peopleRaw.filter(p => p.status?.toLowerCase() !== 'inactive')
            : peopleRaw;

        const visibleGroups = hideArchivedItems
            ? groupsRaw.filter(g => !g.archivedAt)
            : groupsRaw;

        const servicesData = calculateServicesAnalytics(servicePlans, teams, attendanceRaw, 'Month');

        const groupMemberMap = new Set<string>();
        visibleGroups.forEach(g => {
            if (g.memberIds) {
                g.memberIds.forEach(mid => groupMemberMap.add(mid));
            }
        });

        const peopleWithGroups = visiblePeople.map(p => ({
            ...p,
            groupIds: groupMemberMap.has(p.id) ? ['exists'] : []
        }));

        const activeRiskSettings = churchData.riskSettings || DEFAULT_RISK_SETTINGS;
        const riskEnrichedPeople = visiblePeople.length > 0
            ? calculateBulkRisk(
                peopleWithGroups,
                donations,
                visibleGroups,
                servicesData?.recentPlans || [],
                teams,
                activeRiskSettings
              )
            : [];

        const sortedRiskChanges = [...riskChangesRaw].sort((a, b) => b.timestamp - a.timestamp);
        const sortedStatusChanges = [...statusChangesRaw].sort((a, b) => b.timestamp - a.timestamp);
        const recentRiskChanges = sortedRiskChanges.slice(0, 10);
        const recentStatusChanges = sortedStatusChanges.slice(0, 10);

        const peopleDashboardData = calculatePeopleDashboardData(
            visiblePeople,
            riskEnrichedPeople,
            recentRiskChanges,
            recentStatusChanges
        );

        const givingAnalyticsData = calculateGivingAnalytics(
            donations,
            'Year',
            undefined,
            visiblePeople,
            churchData.donorLifecycleSettings || DEFAULT_LIFECYCLE_SETTINGS
        );

        const groupsDashboardData = calculateGroupsDashboardData(
            visibleGroups,
            visiblePeople
        );

        const attendanceChartData = [...attendanceRaw]
            .sort((a, b) => a.date.localeCompare(b.date))
            .map(a => ({
                date: a.date,
                attendance: a.count || 0,
                newComers: a.guests || 0
            }));

        const censusData = churchData.censusCache?.data || null;

        // Perform dynamic context calculations
        const now = new Date();
        const pad2 = (n: number) => String(n).padStart(2, '0');
        const toYYYYMMDD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
        
        // 1. Calculate Last Week's Giving
        const day = now.getDay();
        const lastWeekEnd = new Date(now);
        lastWeekEnd.setDate(now.getDate() - day - 1);
        lastWeekEnd.setHours(23, 59, 59, 999);
        const lastWeekStart = new Date(lastWeekEnd);
        lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
        lastWeekStart.setHours(0, 0, 0, 0);

        const lastWeekStartStr = toYYYYMMDD(lastWeekStart);
        const lastWeekEndStr = toYYYYMMDD(lastWeekEnd);

        const lastWeekDonations = donations.filter(d => {
            const dDateStr = (d.date || '').slice(0, 10);
            return dDateStr >= lastWeekStartStr && dDateStr <= lastWeekEndStr;
        });

        const lastWeekTotal = lastWeekDonations.reduce((sum, d) => sum + d.amount, 0);
        const lastWeekByFund: Record<string, number> = {};
        lastWeekDonations.forEach(d => {
            lastWeekByFund[d.fundName] = (lastWeekByFund[d.fundName] || 0) + d.amount;
        });

        const lastWeekGivingSummary = `Total giving last week (${lastWeekStartStr} to ${lastWeekEndStr}): $${lastWeekTotal.toFixed(2)}. ` +
            `Breakdown by fund: ${Object.entries(lastWeekByFund).map(([f, amt]) => `${f}: $${amt.toFixed(2)}`).join(', ') || 'No giving recorded'}.`;

        // 2. Calculate Yearly Giving by Fund
        const yearlyFundTotals: Record<string, Record<string, number>> = {};
        donations.forEach(d => {
            const yr = d.date.substring(0, 4);
            if (!yearlyFundTotals[yr]) yearlyFundTotals[yr] = {};
            yearlyFundTotals[yr][d.fundName] = (yearlyFundTotals[yr][d.fundName] || 0) + d.amount;
        });

        let givingByFundByYearSummary = "Yearly giving by fund:\n";
        Object.entries(yearlyFundTotals).sort(([a], [b]) => b.localeCompare(a)).forEach(([yr, fundsMap]) => {
            givingByFundByYearSummary += `- Year ${yr}:\n`;
            Object.entries(fundsMap).sort((a, b) => b[1] - a[1]).forEach(([f, amt]) => {
                givingByFundByYearSummary += `  * ${f}: $${amt.toFixed(2)}\n`;
            });
        });

        // 3. Dynamic Attendance/Absentee Lookup
        const bodyLower = body.toLowerCase();
        const isAttendanceQuery = /absent|absentee|miss|present|attend|checkin|check-in|who was at|who wasn't|who was not/.test(bodyLower);
        let targetClassAbsenteeSummary = "";

        if (isAttendanceQuery) {
            log.info(`[Executive AI] Detected attendance query, fetching real-time groups & check-in events...`, 'system', { churchId }, churchId);
            
            let pcoEvents: any[] = [];
            let pcoGroups: any[] = [];

            try {
                // Fetch Check-in Events
                const eventsRes = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/check-ins/v2/events?per_page=100');
                pcoEvents = eventsRes.data || [];
            } catch (err: any) {
                log.warn(`[Executive AI] Failed to fetch check-in events from PCO: ${err.message}`, 'system', { churchId }, churchId);
            }

            try {
                // Fetch Groups
                const groupsRes = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/groups/v2/groups?per_page=100');
                pcoGroups = (groupsRes.data || []).map((g: any) => ({
                    id: g.id,
                    name: g.attributes?.name || ''
                }));
            } catch (err: any) {
                log.warn(`[Executive AI] Failed to fetch groups from PCO: ${err.message}`, 'system', { churchId }, churchId);
            }

            const allGroups = [...visibleGroups];
            pcoGroups.forEach(pg => {
                if (!allGroups.some(g => g.id === pg.id)) {
                    allGroups.push(pg);
                }
            });

            const match = findMatchingGroupOrEvent(body, allGroups, pcoEvents);

            if (match) {
                log.info(`[Executive AI] Matched attendance query to PCO ${match.type}: "${match.type === 'group' ? match.item.name : match.item.attributes?.name}"`, 'system', { churchId }, churchId);
                
                if (match.type === 'group') {
                    const g = match.item;
                    try {
                        const membersRes = await fetchFromPco(churchId, `https://api.planningcenteronline.com/groups/v2/groups/${g.id}/memberships?per_page=100&include=person`);
                        const members = membersRes.data || [];
                        const includedPeople = membersRes.included || [];
                        const roster = members.map((m: any) => {
                            const pid = m.relationships?.person?.data?.id;
                            const p = includedPeople.find((inc: any) => inc.type === 'Person' && inc.id === pid);
                            return { id: pid, name: p?.attributes?.name || pid };
                        });

                        const eventsRes = await fetchFromPco(churchId, `https://api.planningcenteronline.com/groups/v2/groups/${g.id}/events?per_page=10&order=-starts_at`);
                        const events = eventsRes.data || [];
                        const pastEvents = events.filter((ev: any) => new Date(ev.attributes?.starts_at) < now);

                        if (pastEvents.length > 0) {
                            const latestEvent = pastEvents[0];
                            const eventId = latestEvent.id;
                            const eventDate = new Date(latestEvent.attributes?.starts_at);

                            const attRes = await fetchFromPco(churchId, `https://api.planningcenteronline.com/groups/v2/groups/${g.id}/events/${eventId}/attendances?per_page=100`);
                            const attendances = attRes.data || [];
                            const attendedIds = new Set<string>(
                                attendances.filter((a: any) => a.attributes?.attended === true).map((a: any) => a.relationships?.person?.data?.id)
                            );

                            const attendedList = roster.filter(r => attendedIds.has(r.id)).map(r => r.name);
                            const absentList = roster.filter(r => !attendedIds.has(r.id)).map(r => r.name);

                            targetClassAbsenteeSummary = `Attendance summary for small group "${g.name}" on most recent meeting (${eventDate.toLocaleDateString()}):` +
                                `\n- Roster: ${roster.map(r => r.name).join(', ')}` +
                                `\n- Attended: ${attendedList.join(', ') || 'None'}` +
                                `\n- Absentees (Roster members who did not attend): ${absentList.join(', ') || 'None'}`;
                        } else {
                            targetClassAbsenteeSummary = `Group "${g.name}" was found, but it has no past events recorded in PCO.`;
                        }
                    } catch (err: any) {
                        log.error(`[Executive AI] Error fetching group attendance data for "${g.name}": ${err.message}`, 'system', { churchId }, churchId);
                        targetClassAbsenteeSummary = `Error fetching group attendance data for "${g.name}": ${err.message}`;
                    }
                } else {
                    const ev = match.item;
                    const eventName = ev.attributes?.name || 'Event';
                    try {
                        const timesRes = await fetchFromPco(churchId, `https://api.planningcenteronline.com/check-ins/v2/event_times?where[event_id]=${ev.id}&order=-starts_at&per_page=20`);
                        const times = timesRes.data || [];
                        const pastTimes = times.filter((t: any) => new Date(t.attributes?.starts_at) < now);

                        if (pastTimes.length > 0) {
                            const latestTime = pastTimes[0];
                            const timeId = latestTime.id;
                            const eventDate = new Date(latestTime.attributes?.starts_at);

                            const sixWeeksAgo = new Date(now.getTime() - 6 * 7 * 24 * 60 * 60 * 1000);

                            const recentCisRes = await fetchFromPco(churchId, `https://api.planningcenteronline.com/check-ins/v2/check_ins?where[event_id]=${ev.id}&per_page=100&include=person&order=-created_at`);
                            const checkIns = recentCisRes.data || [];
                            const includedPeople = recentCisRes.included || [];

                            const countMap: Record<string, { name: string; count: number }> = {};
                            checkIns.forEach((ci: any) => {
                                const ciDate = new Date(ci.attributes?.created_at || ci.attributes?.updated_at);
                                if (ciDate >= sixWeeksAgo) {
                                    const pid = ci.relationships?.person?.data?.id;
                                    const p = includedPeople.find((inc: any) => inc.type === 'Person' && inc.id === pid);
                                    const pName = p?.attributes?.name || pid;
                                    if (pid) {
                                        if (!countMap[pid]) countMap[pid] = { name: pName, count: 0 };
                                        countMap[pid].count++;
                                    }
                                }
                            });

                            const regulars = Object.entries(countMap)
                                .filter(([_, val]) => val.count >= 2)
                                .map(([id, val]) => ({ id, name: val.name }));

                            const latestCisRes = await fetchFromPco(churchId, `https://api.planningcenteronline.com/check-ins/v2/event_times/${timeId}/check_ins?include=person&per_page=100`);
                            const latestCis = latestCisRes.data || [];
                            const latestIncluded = latestCisRes.included || [];
                            const attendeeIds = new Set<string>();
                            const attendeeNames: string[] = [];

                            latestCis.forEach((ci: any) => {
                                const pid = ci.relationships?.person?.data?.id;
                                const p = latestIncluded.find((inc: any) => inc.type === 'Person' && inc.id === pid);
                                if (pid) {
                                    attendeeIds.add(pid);
                                    attendeeNames.push(p?.attributes?.name || pid);
                                }
                            });

                            const absentList = regulars.filter(r => !attendeeIds.has(r.id)).map(r => r.name);

                            targetClassAbsenteeSummary = `Attendance summary for check-in event "${eventName}" on most recent service (${eventDate.toLocaleDateString()}):` +
                                `\n- Regular Roster (checked in >=2 times in last 6 weeks): ${regulars.map(r => r.name).join(', ') || 'None identified'}` +
                                `\n- Checked In (Attended): ${attendeeNames.join(', ') || 'None'}` +
                                `\n- Absentees (Regulars who missed check-in): ${absentList.join(', ') || 'None'}`;
                        } else {
                            targetClassAbsenteeSummary = `Check-in event "${eventName}" was found, but it has no past services recorded in PCO.`;
                        }
                    } catch (err: any) {
                        log.error(`[Executive AI] Error fetching check-in event attendance for "${eventName}": ${err.message}`, 'system', { churchId }, churchId);
                        targetClassAbsenteeSummary = `Error fetching check-in event attendance for "${eventName}": ${err.message}`;
                    }
                }
            } else {
                log.info(`[Executive AI] Attendance query detected, but no matching group/event found.`, 'system', { churchId }, churchId);
                targetClassAbsenteeSummary = "No matching small group or check-in event was identified in the query context.";
            }
        }

        const context = {
            people: peopleDashboardData,
            giving: givingAnalyticsData,
            groups: groupsDashboardData,
            services: servicesData,
            attendance: attendanceChartData,
            census: censusData,
            churchName: churchData.name || 'Church',
            donations,
            funds,
            budgets,
            teams,
            recentRiskChanges,
            recentStatusChanges,
            lastWeekGivingSummary,
            givingByFundByYearSummary,
            targetClassAbsenteeSummary
        };

        // 3. Query Gemini
        const systemInstructionAddition = " You are answering an SMS query from an executive church leader. Keep your answer concise, friendly, and well-formatted for SMS (preferably under 320 characters).";
        
        // askPastorAI is hardcoded inside geminiService, but we can just use callGemini directly or use askPastorAI 
        // Let's use askPastorAI since it builds the prompt nicely, and append to the prompt.
        const modifiedPrompt = `${body}\n\n[SYSTEM INSTRUCTION: ${systemInstructionAddition}]`;
        const aiResponse = await askPastorAI(modifiedPrompt, context);

        if (!aiResponse) {
            log.warn(`[Executive AI] AI returned empty response`, 'system', { churchId }, churchId);
            return;
        }

        // 4. Send SMS
        await sendIndividualInternal({
            db, log, churchId,
            toPhone: phoneNumber,
            body: aiResponse,
            sentByName: 'Executive AI',
            smsNumberId: smsNumberId || undefined
        });

        log.info(`[Executive AI] Sent response to ${phoneNumber}`, 'system', { churchId }, churchId);

    } catch (e: any) {
        log.error(`[Executive AI] Error processing query: ${e.message}`, 'system', { churchId }, churchId);
    }
}
