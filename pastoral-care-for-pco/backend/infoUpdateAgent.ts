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

async function callGeminiForConversation(params: {
    churchName: string;
    personName: string;
    fieldsToCollect: FieldSpec[];
    collectedData: Record<string, string>;
    remainingFields: string[];
    conversationHistory: { role: string; text: string }[];
    latestMessage: string;
}): Promise<{ replyText: string; extractedFields: Record<string, string> }> {
    const { churchName, personName, fieldsToCollect, collectedData, remainingFields, conversationHistory, latestMessage } = params;

    const remainingLabels = remainingFields.map(key => {
        const spec = fieldsToCollect.find(f => f.key === key);
        return spec ? spec.label : key;
    });
    const collectedSummary = Object.entries(collectedData)
        .map(([key, val]) => {
            const spec = fieldsToCollect.find(f => f.key === key);
            return `${spec?.label || key}: ${val}`;
        })
        .join(', ') || 'None yet';

    const systemInstruction = `You are a friendly assistant for ${churchName}. You are helping update contact information for the church directory for ${personName}.

Fields still needed: ${remainingLabels.length > 0 ? remainingLabels.join(', ') : 'NONE — all collected!'}
Fields already collected: ${collectedSummary}

Rules:
- Be warm, brief, and conversational (this is an SMS/email thread).
- Ask ONLY ONE field at a time — the first one in the "still needed" list.
- When a person provides information, confirm it clearly in your reply before moving on.
- If all fields are collected, thank them warmly and tell them their info has been updated. Do NOT ask more questions.
- If the person says they don't want to provide a field, accept that gracefully and move to the next.
- For dates, accept any natural format (Jan 5, 01/05, etc.).
- Never mention the word "database" or "system" — say "our directory" instead.
- Keep replies under 300 characters when possible.

IMPORTANT: End your reply with a JSON block on a new line in this exact format (fill in any values extracted from the latest message):
###EXTRACTED_DATA###
{"phone_mobile":"","phone_home":"","email_primary":"","address_home":"","birthdate":"","anniversary":"","marital_status":"","gender":"","graduation_year":"","school":"","membership":"","emergency_contact":""}
###END###
Only include fields that the person JUST PROVIDED in this latest message. Leave all others as empty strings.`;

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
    try {
        const jsonStart = fullText.indexOf(jsonMarker) + jsonMarker.length;
        const jsonEnd = fullText.indexOf('###END###');
        if (jsonStart > jsonMarker.length && jsonEnd > jsonStart) {
            const jsonStr = fullText.substring(jsonStart, jsonEnd).trim();
            const parsed = JSON.parse(jsonStr);
            for (const [key, val] of Object.entries(parsed)) {
                if (typeof val === 'string' && val.trim()) {
                    extractedFields[key] = val.trim();
                }
            }
        }
    } catch { /* parsing failure — no extracted fields */ }

    return { replyText, extractedFields };
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
        // Reuse the existing /ai/send-email or direct call pattern
        // For now we use the same internal fetch pattern as the existing inbound handlers
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
        const collectedData: Record<string, string> = { ...(session.collectedData || {}) };
        let remainingFields: string[] = session.remainingFields || fieldsToCollect.map((f: FieldSpec) => f.key);

        // 4. Call Gemini
        const { replyText, extractedFields } = await callGeminiForConversation({
            churchName,
            personName: session.personName,
            fieldsToCollect,
            collectedData,
            remainingFields,
            conversationHistory,
            latestMessage: inboundText,
        });

        // 5. Merge extracted fields
        for (const [key, val] of Object.entries(extractedFields)) {
            if (remainingFields.includes(key)) {
                collectedData[key] = val;
                remainingFields = remainingFields.filter(k => k !== key);
            }
        }

        // 6. Append agent reply to history
        const agentReply = { role: 'agent', text: replyText, channel, ts: Date.now() };
        const isComplete = remainingFields.length === 0;

        await db.collection('people_info_sessions').doc(session.id).update({
            collectedData,
            remainingFields,
            conversationHistory: FieldValue.arrayUnion(agentReply),
            status: isComplete ? 'complete' : 'in_progress',
            ...(isComplete ? { completedAt: Date.now() } : {}),
        });

        // 7. Send reply
        if (channel === 'sms') {
            await sendSmsReply(db, log, session, campaign, replyText);
        } else {
            await sendEmailReply(db, log, session, campaign, replyText);
        }

        log.info(
            `[InfoUpdateAgent] Replied to ${session.personName} | remaining: ${remainingFields.length} | complete: ${isComplete}`,
            'system',
            { churchId: session.churchId, sessionId: session.id, isComplete },
            session.churchId,
        );

        // 8. If complete → write to PCO
        if (isComplete) {
            const writeResult = await writePersonDataToPco({
                db,
                log,
                churchId: session.churchId,
                pcoPersonId: session.pcoPersonId,
                collectedData,
                fieldsToCollect,
            });

            await db.collection('people_info_sessions').doc(session.id).update({
                pcoWriteResult: writeResult,
            });

            // Update campaign stats
            await db.collection('people_info_campaigns').doc(session.campaignId).update({
                'stats.complete': FieldValue.increment(1),
                'stats.inProgress': FieldValue.increment(-1),
            });

            log.info(
                `[InfoUpdateAgent] PCO write complete for ${session.personName}: ${writeResult.success ? 'success' : 'partial errors'}`,
                'system',
                { churchId: session.churchId, sessionId: session.id, writeResult },
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
