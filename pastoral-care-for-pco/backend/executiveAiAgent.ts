import { Firestore } from '@google-cloud/firestore';
import { Logger } from '../services/logService';
import { askPastorAI } from '../services/geminiService';
import fetch from 'node-fetch';
import { sendIndividualInternal } from './smsSend';

export async function processExecutiveAiQuery(
    db: Firestore,
    log: Logger,
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
        
        const port = process.env.PORT || 8080;
        const proxyUrl = `http://127.0.0.1:${port}/pco/proxy`;
        
        const pcoListRes = await fetch(proxyUrl, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                churchId,
                url: `https://api.planningcenteronline.com/people/v2/lists/${listId}/people?where[id]=${personId}`,
                method: 'GET'
            })
        });

        if (!pcoListRes.ok) {
            log.warn(`[Executive AI] Failed to fetch PCO list ${listId}: ${pcoListRes.statusText}`, 'system', { churchId }, churchId);
            return;
        }

        const listData = await pcoListRes.json();
        const isInList = listData.data && listData.data.length > 0;

        if (!isInList) {
            log.info(`[Executive AI] Person ${personId} is not in authorized list ${listId}. Ignoring.`, 'system', { churchId }, churchId);
            return;
        }

        // 2. Gather Context
        log.info(`[Executive AI] Authorized query received from ${phoneNumber}: ${body}`, 'system', { churchId }, churchId);
        
        const [peopleSnap, givingSnap, groupsSnap, servicesSnap, attendanceSnap] = await Promise.all([
            db.collection('peopleDashboard').doc(churchId).get(),
            db.collection('givingAnalytics').doc(churchId).get(),
            db.collection('groupsDashboard').doc(churchId).get(),
            db.collection('servicesDashboard').doc(churchId).get(),
            db.collection('attendanceRecords').where('churchId', '==', churchId).orderBy('date', 'desc').limit(12).get()
        ]);

        const context = {
            churchName: churchData.name || 'Church',
            people: peopleSnap.exists ? peopleSnap.data() as any : null,
            giving: givingSnap.exists ? givingSnap.data() as any : null,
            groups: groupsSnap.exists ? groupsSnap.data() as any : null,
            services: servicesSnap.exists ? servicesSnap.data() as any : null,
            attendance: attendanceSnap.docs.map(d => d.data() as any)
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
