import { getDb } from './backend/firebase';
import { createServerLogger } from './services/logService';
import { askPastorAI } from './services/geminiService';
import { fetchFromPco } from './backend/publicApi';

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

export async function testExecutiveAiQuery(
    db: any,
    log: any,
    churchId: string,
    phoneNumber: string,
    body: string,
    listId: string,
    smsNumberId?: string
) {
    console.log(`\n==========================================`);
    console.log(`[TEST QUERY] body: "${body}"`);
    console.log(`==========================================`);
    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) {
            console.error("Church not found");
            return;
        }
        const churchData = churchSnap.data()!;

        const inputNormalized = normalizeToLast10Digits(phoneNumber);
        if (!inputNormalized || inputNormalized.length < 10) {
            console.error("Invalid phone number");
            return;
        }
        
        console.log(`Fetching PCO authorized list ${listId}...`);
        let listData;
        try {
            const listUrl = `https://api.planningcenteronline.com/people/v2/lists/${listId}/people?per_page=100&include=phone_numbers`;
            listData = await fetchFromPco(churchId, listUrl);
        } catch (err: any) {
            console.error(`Failed to fetch PCO list ${listId}: ${err.message}`);
            return;
        }

        const people = listData?.data || [];
        const included = listData?.included || [];
        let matchedPerson: { id: string; name: string; avatar: string | null } | null = null;

        for (const person of people) {
            const personId = person.id;
            const personName = person.attributes?.name || '';
            const personAvatar = person.attributes?.avatar || null;

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
            console.error(`Phone number ${phoneNumber} is not associated with any member in the authorized list ${listId}.`);
            return;
        }

        console.log(`User authorized: ${matchedPerson.name} (${matchedPerson.id})`);
        console.log("Gathering context documents from Firestore...");

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

        const peopleRaw = peopleSnap.docs.map((doc: any) => doc.data() as any);
        const donations = donationsSnap.docs.map((doc: any) => doc.data() as any);
        const groupsRaw = groupsSnap.docs.map((doc: any) => doc.data() as any);
        const servicePlans = servicePlansSnap.docs.map((doc: any) => doc.data() as any);
        const teams = teamsSnap.docs.map((doc: any) => doc.data() as any);
        const attendanceRaw = attendanceSnap.docs.map((doc: any) => doc.data() as any);
        const budgets = budgetsSnap.docs.map((doc: any) => doc.data() as any);
        const funds = fundsSnap.docs.map((doc: any) => doc.data() as any);
        const riskChangesRaw = riskChangesSnap.docs.map((doc: any) => doc.data() as any);
        const statusChangesRaw = statusChangesSnap.docs.map((doc: any) => doc.data() as any);

        console.log(`Retrieved: ${peopleRaw.length} people, ${donations.length} donations, ${groupsRaw.length} groups.`);

        // Dynamic context calculations
        const now = new Date();
        
        // 1. Calculate Last Week's Giving
        const day = now.getDay();
        const lastWeekEnd = new Date(now);
        lastWeekEnd.setDate(now.getDate() - day - 1);
        lastWeekEnd.setHours(23, 59, 59, 999);
        const lastWeekStart = new Date(lastWeekEnd);
        lastWeekStart.setDate(lastWeekEnd.getDate() - 6);
        lastWeekStart.setHours(0, 0, 0, 0);

        const lastWeekDonations = donations.filter((d: any) => {
            const dDate = new Date(d.date);
            return dDate >= lastWeekStart && dDate <= lastWeekEnd;
        });

        const lastWeekTotal = lastWeekDonations.reduce((sum: number, d: any) => sum + d.amount, 0);
        const lastWeekByFund: Record<string, number> = {};
        lastWeekDonations.forEach((d: any) => {
            lastWeekByFund[d.fundName] = (lastWeekByFund[d.fundName] || 0) + d.amount;
        });

        const lastWeekGivingSummary = `Total giving last week (${lastWeekStart.toISOString().substring(0, 10)} to ${lastWeekEnd.toISOString().substring(0, 10)}): $${lastWeekTotal.toFixed(2)}. ` +
            `Breakdown by fund: ${Object.entries(lastWeekByFund).map(([f, amt]) => `${f}: $${amt.toFixed(2)}`).join(', ') || 'No giving recorded'}.`;

        // 2. Calculate Yearly Giving by Fund
        const yearlyFundTotals: Record<string, Record<string, number>> = {};
        donations.forEach((d: any) => {
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
            console.log(`Detected attendance query. Fetching check-in events and groups from PCO API...`);
            let pcoEvents: any[] = [];
            let pcoGroups: any[] = [];

            try {
                const eventsRes = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/check-ins/v2/events?per_page=100');
                pcoEvents = eventsRes.data || [];
            } catch (err: any) {
                console.warn(`Failed to fetch check-in events from PCO: ${err.message}`);
            }

            try {
                const groupsRes = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/groups/v2/groups?per_page=100');
                pcoGroups = (groupsRes.data || []).map((g: any) => ({
                    id: g.id,
                    name: g.attributes?.name || ''
                }));
            } catch (err: any) {
                console.warn(`Failed to fetch groups from PCO: ${err.message}`);
            }

            const allGroups = [...groupsRaw];
            pcoGroups.forEach((pg: any) => {
                if (!allGroups.some((g: any) => g.id === pg.id)) {
                    allGroups.push(pg);
                }
            });

            const match = findMatchingGroupOrEvent(body, allGroups, pcoEvents);

            if (match) {
                console.log(`Matched to ${match.type}: "${match.type === 'group' ? match.item.name : match.item.attributes?.name}"`);
                
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

                            const attendedList = roster.filter((r: any) => attendedIds.has(r.id)).map((r: any) => r.name);
                            const absentList = roster.filter((r: any) => !attendedIds.has(r.id)).map((r: any) => r.name);

                            targetClassAbsenteeSummary = `Attendance summary for small group "${g.name}" on most recent meeting (${eventDate.toLocaleDateString()}):` +
                                `\n- Roster: ${roster.map((r: any) => r.name).join(', ')}` +
                                `\n- Attended: ${attendedList.join(', ') || 'None'}` +
                                `\n- Absentees (Roster members who did not attend): ${absentList.join(', ') || 'None'}`;
                        } else {
                            targetClassAbsenteeSummary = `Group "${g.name}" was found, but it has no past events recorded in PCO.`;
                        }
                    } catch (err: any) {
                        console.error(`Error fetching group attendance data for "${g.name}": ${err.message}`);
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
                        console.error(`Error fetching check-in event attendance for "${eventName}": ${err.message}`);
                    }
                }
            } else {
                console.log("No matching group/event found.");
                targetClassAbsenteeSummary = "No matching small group or check-in event was identified in the query context.";
            }
        }

        const context = {
            churchName: churchData.name || 'Church',
            donations,
            funds,
            budgets,
            teams,
            lastWeekGivingSummary,
            givingByFundByYearSummary,
            targetClassAbsenteeSummary
        };

        console.log("\n--- CALCULATED DYNAMIC CONTEXT SUMMARIES ---");
        console.log(`lastWeekGivingSummary: "${lastWeekGivingSummary}"`);
        console.log(`givingByFundByYearSummary:\n${givingByFundByYearSummary}`);
        console.log(`targetClassAbsenteeSummary:\n${targetClassAbsenteeSummary}`);
        console.log("------------------------------------------");

        console.log("Calling Gemini (askPastorAI)...");
        const systemInstructionAddition = " You are answering an SMS query from an executive church leader. Keep your answer concise, friendly, and well-formatted for SMS (preferably under 320 characters).";
        const modifiedPrompt = `${body}\n\n[SYSTEM INSTRUCTION: ${systemInstructionAddition}]`;
        const aiResponse = await askPastorAI(modifiedPrompt, context);

        console.log(`\n🤖 Pastor AI SMS Response:`);
        console.log(`"${aiResponse}"`);
        console.log(`Length: ${aiResponse?.length || 0} characters.`);

    } catch (e: any) {
        console.error("Error processing mock query:", e);
    }
}

async function runTests() {
    const db = getDb();
    const log = createServerLogger(db);
    const churchId = 'ch_v0cjkh0z1';
    const listId = '4942298';
    const verifiedPhone = '4693440785'; // Matthew Hon
    
    // Set API Key from system settings if not in process.env
    if (!process.env.API_KEY && !process.env.GEMINI_API_KEY) {
        const snap = await db.collection('system').doc('settings').get();
        const apiKey = snap.data()?.geminiApiKey;
        if (apiKey) {
            process.env.API_KEY = apiKey;
            process.env.GEMINI_API_KEY = apiKey;
            console.log("Using API Key from Firestore system/settings.");
        } else {
            console.error("No Gemini API Key found in env or Firestore!");
            process.exit(1);
        }
    }

    // Query 1: Giving Last week
    await testExecutiveAiQuery(db, log, churchId, verifiedPhone, "What was the Giving Last week?", listId);

    // Query 2: Absentees in Kids Bible Class last week
    await testExecutiveAiQuery(db, log, churchId, verifiedPhone, "Who were the absentees in the Kids Bible Class last week?", listId);

    // Query 3: Giving to Tithes and Offerings Fund for 2026
    await testExecutiveAiQuery(db, log, churchId, verifiedPhone, "What was the giving to the Tithes and Offerings Fund for 2026?", listId);
    
    process.exit(0);
}

runTests();
