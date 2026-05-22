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

export async function processExecutiveAiQuery(
    db: Firestore,
    log: ReturnType<typeof createServerLogger>,
    churchId: string,
    personId: string,
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
        
        let listData;
        try {
            const listUrl = `https://api.planningcenteronline.com/people/v2/lists/${listId}/people?where[id]=${personId}`;
            listData = await fetchFromPco(churchId, listUrl);
        } catch (err: any) {
            log.warn(`[Executive AI] Failed to fetch PCO list ${listId}: ${err.message}`, 'system', { churchId }, churchId);
            return;
        }

        const isInList = listData.data && listData.data.length > 0;

        if (!isInList) {
            log.info(`[Executive AI] Person ${personId} is not in authorized list ${listId}. Ignoring.`, 'system', { churchId }, churchId);
            return;
        }

        // 2. Gather Context
        log.info(`[Executive AI] Authorized query received from ${phoneNumber}: ${body}`, 'system', { churchId }, churchId);
        
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
