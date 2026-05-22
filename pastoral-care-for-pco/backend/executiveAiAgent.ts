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
            recentStatusChanges
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
