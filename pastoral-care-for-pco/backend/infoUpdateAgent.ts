// ─── infoUpdateAgent.ts ───────────────────────────────────────────────────────
//
// Gemini-powered conversation handler for Church Helper campaigns.
// Called when an inbound SMS or email is matched to an active people_info_session.
//
// Flow:
//   1. Load session + campaign from Firestore
//   2. Append inbound message to conversationHistory
//   3. Call Gemini with full history + system prompt
//   4. Parse collected field values from Gemini's structured response
//   5. Update session in Firestore
//   6. Send Gemini's reply back via SMS or email
//   7. If all fields complete → write to PCO, mark session complete
// ─────────────────────────────────────────────────────────────────────────────

import { createServerLogger } from '../services/logService';
import { sendIndividualInternal } from './smsSend';
import { writePersonDataToPco } from './pcoPersonUpdate';
import type { FieldSpec } from './pcoPersonUpdate';
import { FieldValue } from 'firebase-admin/firestore';
import { GoogleGenAI } from '@google/genai';
import { getDb } from './firebase';

// ─── Active-session lookup helpers ───────────────────────────────────────────

export async function findActiveInfoSessionBySms(
    db: any,
    churchId: string,
    phoneE164: string,
): Promise<any | null> {
    const snap = await db.collection('people_info_sessions')
        .where('churchId', '==', churchId)
        .where('phoneE164', '==', phoneE164)
        .where('status', 'in', ['pending', 'in_progress'])
        .limit(1)
        .get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

export async function findActiveInfoSessionByEmail(
    db: any,
    churchId: string,
    emailAddress: string,
): Promise<any | null> {
    const snap = await db.collection('people_info_sessions')
        .where('churchId', '==', churchId)
        .where('emailAddress', '==', emailAddress.toLowerCase().trim())
        .where('status', 'in', ['pending', 'in_progress'])
        .limit(1)
        .get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...snap.docs[0].data() };
}

// ─── Gemini call ──────────────────────────────────────────────────────────────

// ─── Gemini call ──────────────────────────────────────────────────────────────

async function callGeminiForConversation(params: {
    churchName: string;
    personName: string;
    fieldsToCollect: FieldSpec[];
    childFieldsToCollect?: FieldSpec[];
    collectedData: Record<string, string>;
    existingPcoData?: Record<string, string>;
    remainingFields: string[];
    children?: any[];
    conversationHistory: { role: string; text: string }[];
    latestMessage: string;
}): Promise<{
    replyText: string;
    extractedFields: Record<string, string>;
    extractedChildFields: Record<string, Record<string, string>>;
}> {
    const {
        churchName,
        personName,
        fieldsToCollect,
        childFieldsToCollect = [],
        collectedData,
        existingPcoData = {},
        remainingFields,
        children = [],
        conversationHistory,
        latestMessage
    } = params;

    const remainingDetails = remainingFields.map(key => {
        const spec = fieldsToCollect.find(f => f.key === key);
        const label = spec ? spec.label : key;
        const currentVal = existingPcoData[key];
        return currentVal ? `${label} (currently on file: "${currentVal}")` : `${label} (currently empty)`;
    });
    const collectedSummary = Object.entries(collectedData)
        .map(([key, val]) => {
            const spec = fieldsToCollect.find(f => f.key === key);
            return `${spec?.label || key}: ${val}`;
        })
        .join(', ') || 'None yet';

    let childSection = '';
    if (children.length > 0) {
        const childDetails = children.map(c => {
            const rem = (c.remainingFields || []).map((key: string) => {
                const spec = childFieldsToCollect.find(f => f.key === key) || { label: key };
                const currentVal = c.existingPcoData?.[key];
                return currentVal ? `${spec.label} (currently on file: "${currentVal}")` : `${spec.label} (currently empty)`;
            });
            const coll = Object.entries(c.collectedData || {})
                .map(([k, v]) => `${k}: ${v}`)
                .join(', ') || 'None yet';
            return `- Child: ${c.personName} (ID: "${c.pcoPersonId}"): Needed: [${rem.length > 0 ? rem.join('; ') : 'ALL COMPLETED'}]; Updated: [${coll}]`;
        }).join('\n');

        childSection = `
CHILDREN INFORMATION TO UPDATE WITH THIS PARENT:
${childDetails}

CHILD CONVERSATION RULES:
1. You are communicating with the parent (${personName}) to collect/confirm information for their children.
2. Clearly mention the child's first name when asking (e.g. "What is Timmy's birthday and school grade?").
3. If the parent provides information for multiple children at once (e.g. "Timmy was born 5/12/2015 and Sarah on 8/19/2018"), extract each child's data into their corresponding child ID in the ###EXTRACTED_DATA### JSON!
4. Normalize date values to MM/DD/YYYY or YYYY-MM-DD whenever provided.`;
    }

    const systemInstruction = `You are a friendly assistant for ${churchName}. You are helping update directory and family contact information with ${personName}.

Parent fields still needed / to confirm: ${remainingDetails.length > 0 ? remainingDetails.join('; ') : 'NONE — all parent fields completed!'}
Parent fields already updated: ${collectedSummary}
${childSection}

CRITICAL CONFIRMATION & RESPONSE RULES:
1. "YES" / "CORRECT" / "YEAH" / "THAT'S RIGHT" / "SAME":
   - If the member responds with "YES", "correct", "yep", or any affirmative phrase when asked to confirm an existing field value, treat that field as CONFIRMED.
   - Extract the existing value currently on file into ###EXTRACTED_DATA### JSON so it is saved and marked complete.
   - Reply warmly confirming verification, then move to the next field or child if any remain.

2. "NO" / "WRONG" / "INCORRECT" / "IT CHANGED":
   - If the member responds with "NO", "nope", or says it is incorrect without providing the new value yet, politely ask them to provide their new/correct information.
   - Do NOT mark the field complete until they provide the new value.

3. "NO EMAIL" / "I DON'T HAVE ONE" / "N/A":
   - If the member states they do not have an email or phone, DO NOT put their explanation into the email field. Leave the string empty so it's not written as invalid data.

4. NEW VALUE PROVIDED:
   - If they reply with new data (e.g., "123 Main St" or "05/12/1985" or "3rd grade"), extract that value into ###EXTRACTED_DATA### JSON and confirm it warmly.

5. GENERAL BEHAVIOR:
   - Be warm, brief, and conversational (this is an SMS/email thread).
   - Ask ONLY ONE item at a time (e.g. ask for the parent's missing item, or the first child's missing item).
   - If all parent and child fields are collected/confirmed, thank them warmly and tell them their profile and family records have been updated in our directory. Do NOT ask more questions.
   - Keep replies under 300 characters.

IMPORTANT: End your reply with a JSON block on a new line in this exact format (fill in any values extracted from the latest message):
###EXTRACTED_DATA###
{
  "parent": {"phone_mobile":"","phone_home":"","email_primary":"","address_home":"","birthdate":"","anniversary":"","marital_status":"","gender":"","graduation_year":"","school":"","membership":"","emergency_contact":""},
  "children": {
    ${children.map(c => `"${c.pcoPersonId}": {"birthdate":"","grade":"","school":"","medical_notes":"","gender":"","emergency_contact":""}`).join(',\n    ')}
  }
}
###END###
Only include fields that the person JUST PROVIDED or CONFIRMED in this latest message. Leave all others as empty strings.`;

    const historyText = conversationHistory.slice(-10).map(h =>
        `${h.role === 'agent' ? 'Assistant' : personName}: ${h.text}`
    ).join('\n');
    const prompt = historyText ? `${historyText}\n${personName}: ${latestMessage}` : `${personName}: ${latestMessage}`;

    const db = getDb();
    let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    try {
        const snap = await db.doc('system/settings').get();
        const data = snap.data() || {};
        if (data.geminiApiKey) apiKey = data.geminiApiKey.trim();
    } catch { /* best-effort */ }

    if (!apiKey) throw new Error('Gemini API key not configured');

    const ai = new GoogleGenAI({ apiKey });
    const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt,
        config: { systemInstruction },
    });

    const fullText = (response.text || '').trim();

    // Extract the reply text (before the JSON block)
    const jsonMarker = '###EXTRACTED_DATA###';
    const replyText = fullText.includes(jsonMarker)
        ? fullText.substring(0, fullText.indexOf(jsonMarker)).trim()
        : fullText;

    // Extract the JSON block
    const extractedFields: Record<string, string> = {};
    const extractedChildFields: Record<string, Record<string, string>> = {};

    try {
        const jsonStart = fullText.indexOf(jsonMarker) + jsonMarker.length;
        const jsonEnd = fullText.indexOf('###END###');
        if (jsonStart > jsonMarker.length && jsonEnd > jsonStart) {
            const jsonStr = fullText.substring(jsonStart, jsonEnd).trim();
            const parsed = JSON.parse(jsonStr);

            if (parsed.parent && typeof parsed.parent === 'object') {
                for (const [key, val] of Object.entries(parsed.parent)) {
                    if (typeof val === 'string' && val.trim()) {
                        extractedFields[key] = val.trim();
                    }
                }
            }

            if (parsed.children && typeof parsed.children === 'object') {
                for (const [childId, childObj] of Object.entries(parsed.children)) {
                    if (childObj && typeof childObj === 'object') {
                        extractedChildFields[childId] = {};
                        for (const [key, val] of Object.entries(childObj as Record<string, any>)) {
                            if (typeof val === 'string' && val.trim()) {
                                extractedChildFields[childId][key] = val.trim();
                            }
                        }
                    }
                }
            }

            // Flat fallback (if top-level keys without parent wrapper)
            for (const [key, val] of Object.entries(parsed)) {
                if (key !== 'parent' && key !== 'children' && typeof val === 'string' && val.trim()) {
                    extractedFields[key] = val.trim();
                }
            }
        }
    } catch { /* parsing failure — no extracted fields */ }

    return { replyText, extractedFields, extractedChildFields };
}

// ─── Send reply helpers ───────────────────────────────────────────────────────

async function sendSmsReply(db: any, log: any, session: any, campaign: any, text: string): Promise<void> {
    if (!session.phoneE164) return;
    await sendIndividualInternal({
        db,
        log,
        churchId: session.churchId,
        toPhone: session.phoneE164,
        body: text,
        smsNumberId: campaign.channels?.smsNumberId,
        sentBy: 'church-helper-agent',
        sentByName: 'Church Helper',
    });
}

async function sendEmailReply(db: any, log: any, session: any, campaign: any, text: string): Promise<void> {
    if (!session.emailAddress) return;
    try {
        const apiBase = process.env.API_BASE_URL || 'http://localhost:3000';
        await fetch(`${apiBase}/api/info-update/send-email-reply`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                churchId: session.churchId,
                to: session.emailAddress,
                personName: session.personName,
                body: text,
                campaignName: campaign.name,
            }),
        });
    } catch (e: any) {
        log.warn(`[InfoUpdateAgent] Failed to send email reply: ${e.message}`, 'system', { churchId: session.churchId }, session.churchId);
    }
}

// ─── Main handler ─────────────────────────────────────────────────────────────

export async function handleInfoUpdateReply(
    db: any,
    log: any,
    session: any,
    inboundText: string,
    channel: 'sms' | 'email',
): Promise<void> {
    try {
        // 1. Load campaign
        const campaignSnap = await db.collection('people_info_campaigns').doc(session.campaignId).get();
        if (!campaignSnap.exists) {
            log.warn(`[InfoUpdateAgent] Campaign ${session.campaignId} not found`, 'system', { churchId: session.churchId }, session.churchId);
            return;
        }
        const campaign = { id: campaignSnap.id, ...campaignSnap.data() };

        // 2. Load church name
        const churchSnap = await db.collection('churches').doc(session.churchId).get();
        const churchName = churchSnap.data()?.name || 'Our Church';

        // 3. Append inbound to history
        const newInbound = { role: 'person', text: inboundText, channel, ts: Date.now() };
        await db.collection('people_info_sessions').doc(session.id).update({
            status: 'in_progress',
            conversationHistory: FieldValue.arrayUnion(newInbound),
        });

        const conversationHistory = [...(session.conversationHistory || []), newInbound];
        const fieldsToCollect: FieldSpec[] = campaign.fieldsToCollect || [];
        const childFieldsToCollect: FieldSpec[] = campaign.childFieldsToCollect || [
            { key: 'birthdate', label: 'Birthday', required: false, pcoPath: 'person', fieldType: 'standard' },
            { key: 'grade', label: 'School Grade', required: false, pcoPath: 'person', fieldType: 'standard' },
            { key: 'school', label: 'School Name', required: false, pcoPath: 'person', fieldType: 'standard' },
            { key: 'medical_notes', label: 'Medical / Allergy Notes', required: false, pcoPath: 'person', fieldType: 'standard' },
        ];
        const collectedData: Record<string, string> = { ...(session.collectedData || {}) };
        let remainingFields: string[] = session.remainingFields || fieldsToCollect.map((f: FieldSpec) => f.key);
        const children: any[] = [...(session.children || [])];

        // 4. Call Gemini
        const { replyText, extractedFields, extractedChildFields } = await callGeminiForConversation({
            churchName,
            personName: session.personName,
            fieldsToCollect,
            childFieldsToCollect,
            collectedData,
            existingPcoData: session.existingPcoData || {},
            remainingFields,
            children,
            conversationHistory,
            latestMessage: inboundText,
        });

        // 5. Merge extracted fields for parent
        for (const [key, val] of Object.entries(extractedFields)) {
            if (remainingFields.includes(key)) {
                collectedData[key] = val;
                remainingFields = remainingFields.filter(k => k !== key);
            }
        }

        // 6. Merge extracted fields for children
        for (let i = 0; i < children.length; i++) {
            const childId = children[i].pcoPersonId;
            const childExtracted = extractedChildFields[childId] || {};
            const childCollected = { ...(children[i].collectedData || {}) };
            let childRemaining = [...(children[i].remainingFields || [])];

            for (const [key, val] of Object.entries(childExtracted)) {
                if (childRemaining.includes(key)) {
                    childCollected[key] = val;
                    childRemaining = childRemaining.filter(k => k !== key);
                }
            }

            children[i] = {
                ...children[i],
                collectedData: childCollected,
                remainingFields: childRemaining,
            };
        }

        // 7. Check completion
        const totalChildRemaining = children.reduce((acc, c) => acc + (c.remainingFields?.length || 0), 0);
        const isComplete = (remainingFields.length === 0) && (totalChildRemaining === 0);

        // 8. Append agent reply to history & update session
        const agentReply = { role: 'agent', text: replyText, channel, ts: Date.now() };

        await db.collection('people_info_sessions').doc(session.id).update({
            collectedData,
            remainingFields,
            children,
            conversationHistory: FieldValue.arrayUnion(agentReply),
            status: isComplete ? 'complete' : 'in_progress',
            ...(isComplete ? { completedAt: Date.now() } : {}),
        });

        // 9. Send reply
        if (channel === 'sms') {
            await sendSmsReply(db, log, session, campaign, replyText);
        } else {
            await sendEmailReply(db, log, session, campaign, replyText);
        }

        log.info(
            `[InfoUpdateAgent] Replied to ${session.personName} | parent remaining: ${remainingFields.length} | child remaining: ${totalChildRemaining} | complete: ${isComplete}`,
            'system',
            { churchId: session.churchId, sessionId: session.id, isComplete },
            session.churchId,
        );

        // 10. If complete → write to PCO for parent and each child
        if (isComplete) {
            let parentWriteResult = null;
            if (Object.keys(collectedData).length > 0) {
                parentWriteResult = await writePersonDataToPco({
                    db,
                    log,
                    churchId: session.churchId,
                    pcoPersonId: session.pcoPersonId,
                    collectedData,
                    fieldsToCollect,
                });
            }

            // Write child data to PCO
            for (let i = 0; i < children.length; i++) {
                if (Object.keys(children[i].collectedData || {}).length > 0) {
                    const childWriteResult = await writePersonDataToPco({
                        db,
                        log,
                        churchId: session.churchId,
                        pcoPersonId: children[i].pcoPersonId,
                        collectedData: children[i].collectedData,
                        fieldsToCollect: childFieldsToCollect,
                    });
                    children[i].pcoWriteResult = childWriteResult;
                    log.info(
                        `[InfoUpdateAgent] Child PCO write for ${children[i].personName}: ${childWriteResult.success ? 'success' : 'errors'}`,
                        'system',
                        { churchId: session.churchId, childPcoPersonId: children[i].pcoPersonId, childWriteResult },
                        session.churchId,
                    );
                }
            }

            await db.collection('people_info_sessions').doc(session.id).update({
                pcoWriteResult: parentWriteResult,
                children,
            });

            // Update campaign stats
            await db.collection('people_info_campaigns').doc(session.campaignId).update({
                'stats.complete': FieldValue.increment(1),
                'stats.inProgress': FieldValue.increment(-1),
            });

            log.info(
                `[InfoUpdateAgent] Completed all PCO writes for session ${session.id} (${session.personName})`,
                'system',
                { churchId: session.churchId, sessionId: session.id },
                session.churchId,
            );
        }

    } catch (e: any) {
        log.warn(
            `[InfoUpdateAgent] Error handling reply for session ${session.id}: ${e.message}`,
            'system',
            { churchId: session.churchId, sessionId: session.id, error: e.message },
            session.churchId,
        );
    }
}
