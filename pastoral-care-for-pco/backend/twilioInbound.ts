import twilio from 'twilio';
import http from 'http';
import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';

// ─── Helpers ────────────────────────────────────────────────────────────────

/** Normalise an E.164 phone number to a consistent key (strip all non-digits, prefix +1 for US). */
function normaliseE164(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return `+${digits}`;
}

/** Look up a PCO person by phone number to link the conversation. */
async function matchPersonByPhone(db: any, churchId: string, phone: string): Promise<{ personId?: string; personName?: string; personAvatar?: string | null } | null> {
    try {
        const snap = await db.collection('people')
            .where('churchId', '==', churchId)
            .where('phone', '==', phone)
            .limit(1)
            .get();
        if (snap.empty) return null;
        const p = snap.docs[0].data();
        return { personId: p.id, personName: p.name, personAvatar: p.avatar || null };
    } catch {
        return null;
    }
}

/** Check if the church has a matching active keyword for the given body. */
async function matchKeyword(db: any, churchId: string, body: string): Promise<any | null> {
    try {
        const keyword = body.trim().toUpperCase().split(/\s+/)[0];
        const snap = await db.collection('smsKeywords')
            .where('churchId', '==', churchId)
            .where('keyword', '==', keyword)
            .where('isActive', '==', true)
            .limit(1)
            .get();
        if (snap.empty) return null;
        return { id: snap.docs[0].id, ...snap.docs[0].data() };
    } catch {
        return null;
    }
}

/**
 * Fire-and-forget: generate an AI-suggested reply for an inbound message
 * using the church's knowledge base, then store it in Firestore.
 * Never throws — any error is logged and silently swallowed so the
 * Twilio webhook response is never blocked or delayed.
 */
async function generateAiSuggestion(
    db: any,
    log: any,
    churchId: string,
    convId: string,
    inboundMessageId: string,
    inboundBody: string,
    churchName: string,
): Promise<void> {
    try {
        // Load the church knowledge base
        const knowledgeSnap = await db.collection('smsAgentKnowledge').doc(churchId).get();
        const kb = knowledgeSnap.exists ? knowledgeSnap.data() : {};

        const systemPrompt = `You are a friendly, warm church receptionist for ${churchName}.
Your job is to compose a helpful, natural reply to an incoming SMS from a visitor or member.
Only answer based on the church facts below. If the answer is not in the facts, reply with something like "Let me check on that and get back to you!"
Keep replies under 160 characters when possible (1 SMS segment). Do NOT include any explanation, preamble, or quotes — return ONLY the reply text.

CHURCH FACTS:
${kb.address       ? `Address: ${kb.address}`             : ''}
${kb.serviceTimes  ? `Service Times: ${kb.serviceTimes}`   : ''}
${kb.pastor        ? `Lead Pastor: ${kb.pastor}`           : ''}
${kb.ministries    ? `Ministries: ${kb.ministries}`        : ''}
${kb.classes       ? `Classes: ${kb.classes}`              : ''}
${kb.locations     ? `Locations: ${kb.locations}`          : ''}
${kb.website       ? `Website: ${kb.website}`              : ''}
${kb.phone         ? `Phone: ${kb.phone}`                  : ''}
${kb.customFacts   ? `Other Info: ${kb.customFacts}`       : ''}

INCOMING MESSAGE:
"${inboundBody}"

Write the reply:`;

        // Call the Gemini proxy endpoint on the same server
        const postBody = JSON.stringify({
            model: 'gemini-2.5-flash',
            prompt: systemPrompt,
        });

        const suggestedBody: string = await new Promise((resolve, reject) => {
            const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
            const urlObj = new URL('/ai/generate', apiBaseUrl);
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || 80,
                path: urlObj.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postBody),
                },
            };
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve((parsed.text || '').trim());
                    } catch {
                        reject(new Error('Failed to parse Gemini response'));
                    }
                });
            });
            req.on('error', reject);
            req.write(postBody);
            req.end();
        });

        if (!suggestedBody) return; // Nothing to save

        // Persist the suggestion in the aiSuggestions sub-collection
        const suggestionId = `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.collection('smsConversations').doc(convId)
            .collection('aiSuggestions').doc(suggestionId).set({
                id:                suggestionId,
                conversationId:    convId,
                churchId,
                inboundMessageId,
                suggestedBody,
                status:            'pending',
                createdAt:         Date.now(),
            });

        log.info(`[SMS Agent] Generated suggestion for conversation ${convId}`, 'system', { churchId, convId }, churchId);
    } catch (err: any) {
        log.warn(`[SMS Agent] Failed to generate AI suggestion: ${err.message}`, 'system', { churchId, convId }, churchId);
    }
}

// ─── Prayer Request Detection ────────────────────────────────────────────────

/**
 * Classify an inbound SMS body as a prayer request.
 *
 * Returns:
 *   'generic'  — the sender is asking for prayer for themselves with no detail
 *                (triggers the clarifying reply flow)
 *   'specific' — the sender has included a specific request or person
 *                (tag immediately, no clarifying reply needed)
 *   null       — not a prayer request
 *
 * Detection is regex-based (no external API), keeping cost at $0.
 */
export function detectPrayerRequest(body: string): 'generic' | 'specific' | null {
    const text = body.trim().toLowerCase();

    // ── Generic patterns ─────────────────────────────────────────────────────
    // These match requests that ask for prayer for the sender themselves,
    // with no additional detail provided in the message.
    const genericPatterns: RegExp[] = [
        /^(will|can|could|would) (you|someone|anyone|y'all|yall) (please )?pray for me\??\.?$/i,
        /^(please )?pray for me\??\.?$/i,
        /^i need (prayer|your prayers|prayers)\.?$/i,
        /^i('m| am) (in need of|asking for) (prayer|prayers)\.?$/i,
        /^(can|could|would) (i|we) (get|have|request) (a )?(prayer|some prayers)\??\.?$/i,
        /^(i'd|i would) (like|appreciate|love) (a )?(prayer|your prayers|some prayer)\.?$/i,
        /^(please keep me in your prayers?)\.?$/i,
        /^(keep me in your prayers?)\.?$/i,
        /^i need (some )?prayer support\.?$/i,
    ];

    // ── Specific patterns ─────────────────────────────────────────────────────
    // These match requests that name a person, situation, or topic after the
    // prayer phrase — enough detail that no clarifying reply is needed.
    const specificPatterns: RegExp[] = [
        /\bpray for (my|our|his|her|their|a |the )\w/i,
        /\bpray for [a-z].{3,}/i,           // "pray for [name/situation]"
        /\bprayer (request|need) (for|about|regarding)\b/i,
        /\bplease (pray|keep .+ in prayer|lift up)\b.{5,}/i,
        /\bi need prayer for\b/i,
        /\bkeep .+ in (your )?prayers?\b/i,
        /\blift (up|them|him|her) in prayer\b/i,
        /\bpraying for\b.{4,}/i,
        /\b(unspoken )?prayer request\b/i,
        /\bneed (prayer|prayers) (for|about|with|over|regarding)\b/i,
        /\bintercede for\b/i,
        /\bplease cover .+ in prayer\b/i,
        /\b(stand|agree) in prayer (with|for)\b/i,
    ];

    // Check generic first (shorter, more specific match before the broad specific check)
    for (const re of genericPatterns) {
        if (re.test(text)) return 'generic';
    }

    for (const re of specificPatterns) {
        if (re.test(text)) return 'specific';
    }

    return null;
}

/**
 * Find or create the "Needs Prayer" SmsTag for the given church.
 * Returns the Firestore document ID of the tag.
 */
async function getOrCreatePrayerTag(db: any, churchId: string, log: any): Promise<string> {
    // Try to find an existing tag by name
    const existing = await db.collection('smsTags')
        .where('churchId', '==', churchId)
        .where('name', '==', 'Needs Prayer')
        .limit(1)
        .get();

    if (!existing.empty) {
        return existing.docs[0].id;
    }

    // Auto-create the tag so churches don't need to set it up manually
    const newTag = {
        churchId,
        name:      'Needs Prayer',
        emoji:     '🙏',
        color:     'violet',
        createdAt: Date.now(),
    };
    const ref = await db.collection('smsTags').add(newTag);
    log.info(`[Prayer Detection] Auto-created "Needs Prayer" tag for church ${churchId}`, 'system', { churchId }, churchId);
    return ref.id;
}



// ─── POST /api/messaging/inbound ─────────────────────────────────────────────
// Twilio sends an HTTP POST to this endpoint on every inbound SMS/MMS.
// Responds with TwiML (200 + empty response body, or keyword auto-reply).

export const handleInboundSms = async (req: any, res: any) => {
    const {
        From: fromRaw,
        To: toRaw,
        Body: body = '',
        NumMedia: numMedia = '0',
        SmsSid: smsSid,
    } = req.body || {};

    // Collect MMS media URLs (Twilio sends MediaUrl0, MediaUrl1, …)
    const mediaUrls: string[] = [];
    const mediaCount = parseInt(numMedia, 10) || 0;
    for (let i = 0; i < mediaCount; i++) {
        const url = req.body[`MediaUrl${i}`];
        if (url) mediaUrls.push(url);
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const from = normaliseE164(fromRaw || '');
        const to   = normaliseE164(toRaw   || '');

        // 1. Find the church via the twilioNumbers collection (new multi-number routing)
        const numSnap = await db.collection('twilioNumbers')
            .where('phoneNumber', '==', to)
            .where('smsEnabled', '==', true)
            .limit(1)
            .get();

        // Fallback: legacy single-number lookup on the church doc itself
        let churchId    = '';
        let twilioNumberId: string | null = null;
        let smsSettings: any = {};

        if (!numSnap.empty) {
            const numDoc    = numSnap.docs[0];
            churchId        = numDoc.data().churchId;
            twilioNumberId  = numDoc.id;

            const churchSnap2 = await db.collection('churches').doc(churchId).get();
            smsSettings       = churchSnap2.data()?.smsSettings || {};
        } else {
            // Fallback to legacy church field (for churches not yet migrated)
            const legacySnap = await db.collection('churches')
                .where('smsSettings.twilioPhoneNumber', '==', to)
                .limit(1)
                .get();

            if (legacySnap.empty) {
                log.warn(`[Inbound SMS] No church found for number ${to}`, 'system', { to, from }, '');
                res.set('Content-Type', 'text/xml');
                return res.status(200).send('<Response></Response>');
            }
            const churchDoc2  = legacySnap.docs[0];
            churchId          = churchDoc2.id;
            smsSettings       = churchDoc2.data()?.smsSettings || {};
        }

        if (!churchId) {
            log.warn(`[Inbound SMS] Could not resolve churchId for number ${to}`, 'system', { to, from }, '');
            res.set('Content-Type', 'text/xml');
            return res.status(200).send('<Response></Response>');
        }

        // 2. Handle STOP / HELP / START (carrier compliance)
        const upperBody = body.trim().toUpperCase();
        if (upperBody === 'STOP' || upperBody === 'STOPALL' || upperBody === 'UNSUBSCRIBE' || upperBody === 'CANCEL' || upperBody === 'END' || upperBody === 'QUIT') {
            // Carrier handles STOP automatically; we mirror it in Firestore for UI awareness
            const optOutId = `${churchId}_${from.replace(/\+/g, '')}`;
            await db.collection('smsOptOuts').doc(optOutId).set({
                id:          optOutId,
                churchId,
                phoneNumber: from,
                optedOutAt:  Date.now(),
                source:      'STOP_reply',
            });
            // Update conversation opt-out flag
            const convId = `${churchId}_${from.replace(/\+/g, '')}`;
            await db.collection('smsConversations').doc(convId).set({ isOptedOut: true }, { merge: true });

            log.info(`[Inbound SMS] STOP received from ${from} for church ${churchId}`, 'system', { churchId, from }, churchId);
            // Let Twilio's automatic STOP handling send the carrier-mandated response
            res.set('Content-Type', 'text/xml');
            return res.status(200).send('<Response></Response>');
        }

        // 3. Find or create the SmsConversation
        const convId = `${churchId}_${from.replace(/\+/g, '')}`;
        const convRef = db.collection('smsConversations').doc(convId);
        const convSnap = await convRef.get();

        const personMatch = convSnap.exists && convSnap.data()?.personId
            ? null // already linked
            : await matchPersonByPhone(db, churchId, from);

        const now = Date.now();

        if (!convSnap.exists) {
            const convData: any = {
                id:                  convId,
                churchId,
                phoneNumber:         from,
                lastMessageAt:       now,
                lastMessageBody:     body,
                lastMessageDirection:'inbound',
                unreadCount:         1,
                isOptedOut:          false,
                twilioNumberId:      twilioNumberId,
                inboxId:             twilioNumberId,   // keep legacy field in sync
                toPhoneNumber:       to,
            };
            if (personMatch) {
                convData.personId     = personMatch.personId;
                convData.personName   = personMatch.personName;
                convData.personAvatar = personMatch.personAvatar;
            }
            await convRef.set(convData);
        } else {
            const updateData: any = {
                lastMessageAt:       now,
                lastMessageBody:     body,
                lastMessageDirection:'inbound',
                unreadCount:         (convSnap.data()?.unreadCount || 0) + 1,
            };
            // Backfill twilioNumberId if not set (migration)
            if (!convSnap.data()?.twilioNumberId && twilioNumberId) {
                updateData.twilioNumberId = twilioNumberId;
                updateData.inboxId        = twilioNumberId;
                updateData.toPhoneNumber  = to;
            }
            if (personMatch) {
                updateData.personId     = personMatch.personId;
                updateData.personName   = personMatch.personName;
                updateData.personAvatar = personMatch.personAvatar;
            }
            await convRef.update(updateData);
        }


        // 4. Save the inbound message
        const messageId = `msg_${now}_${Math.random().toString(36).slice(2, 8)}`;
        await db.collection('smsConversations').doc(convId)
            .collection('messages').doc(messageId).set({
                id:             messageId,
                conversationId: convId,
                churchId,
                direction:      'inbound',
                body,
                mediaUrls:      mediaUrls.length > 0 ? mediaUrls : [],
                status:         'received',
                twilioSid:      smsSid || null,
                createdAt:      now,
            });

        // 4-A. SMS AI Agent — fire-and-forget suggestion generation
        //      Runs only when smsAgentEnabled is true and the body is not a carrier keyword.
        if (smsSettings?.smsAgentEnabled === true) {
            const churchSnap = await db.collection('churches').doc(churchId).get();
            const churchName = churchSnap.data()?.name || 'Church';
            // Non-blocking: do not await so TwiML response is never delayed
            generateAiSuggestion(db, log, churchId, convId, messageId, body, churchName)
                .catch(() => { /* already logged inside */ });
        }

        // 5. Check for keyword matches
        const kw = await matchKeyword(db, churchId, body);
        let keywordReplyMessage: string | null = null;

        if (kw) {
            keywordReplyMessage = kw.replyMessage;

            // Increment keyword match count
            await db.collection('smsKeywords').doc(kw.id).update({
                matchCount: (kw.matchCount || 0) + 1,
            });

            // Auto-tag the conversation if the keyword has tag IDs configured
            if (Array.isArray(kw.autoTagIds) && kw.autoTagIds.length > 0) {
                try {
                    const { FieldValue } = require('firebase-admin/firestore');
                    await convRef.update({
                        tags: FieldValue.arrayUnion(...kw.autoTagIds),
                    });
                    log.info(`[Inbound SMS] Auto-tagged conversation ${convId} with tags: ${kw.autoTagIds.join(', ')}`, 'system', { churchId, keyword: kw.keyword, autoTagIds: kw.autoTagIds }, churchId);
                } catch (tagErr: any) {
                    log.warn(`[Inbound SMS] Failed to auto-tag conversation: ${tagErr.message}`, 'system', { churchId, convId }, churchId);
                }
            }

            // Optionally add person to a PCO list
            if (kw.addToListId && personMatch?.personId) {
                log.info(`[Inbound SMS] Keyword "${kw.keyword}" matched — would add ${personMatch.personId} to list ${kw.addToListId}`, 'system', { churchId, keyword: kw.keyword }, churchId);
                // The PCO list add is handled asynchronously; full implementation in Phase 3.
            }

            // Save the keyword auto-reply as an outbound message
            const replyId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await db.collection('smsConversations').doc(convId)
                .collection('messages').doc(replyId).set({
                    id:             replyId,
                    conversationId: convId,
                    churchId,
                    direction:      'outbound',
                    body:           kw.replyMessage,
                    mediaUrls:      [],
                    status:         'sent',
                    sentBy:         null,
                    sentByName:     'Auto-Reply',
                    createdAt:      Date.now(),
                });

            log.info(`[Inbound SMS] Keyword "${kw.keyword}" matched from ${from} for church ${churchId}`, 'system', { churchId, keyword: kw.keyword }, churchId);
        }

        // 5b. Prayer Request Detection (NLP)
        //     Runs only when:
        //       a) prayerDetectionEnabled is true on the church's smsSettings
        //       b) No keyword matched (keyword pipeline takes priority)
        //       c) The message was not a STOP/HELP/START (already handled above)
        let prayerClarifyingReplyMessage: string | null = null;

        try {
            const prayerDetectionEnabled = !!(smsSettings as any)?.prayerDetectionEnabled;

            if (prayerDetectionEnabled && !kw) {
                const convData = convSnap.exists ? convSnap.data() : null;
                const prayerFollowUpState = convData?.prayerFollowUpState ?? null;

                if (prayerFollowUpState === 'awaiting_prayer_detail') {
                    // ── Two-step flow: contact just sent their prayer detail ──────────
                    // Tag "Needs Prayer" immediately and clear the follow-up state.
                    const { FieldValue } = require('firebase-admin/firestore');
                    const prayerTagId = await getOrCreatePrayerTag(db, churchId, log);
                    await convRef.update({
                        tags:               FieldValue.arrayUnion(prayerTagId),
                        prayerFollowUpState: null,
                    });
                    log.info(`[Prayer Detection] Tagged conversation ${convId} "Needs Prayer" (follow-up detail received)`, 'system', { churchId, convId }, churchId);
                } else {
                    // ── Fresh message — run NLP scanner ──────────────────────────────
                    const prayerType = detectPrayerRequest(body);

                    if (prayerType === 'generic') {
                        // Send clarifying reply and set follow-up state
                        const clarifyingReply = (smsSettings as any)?.prayerClarifyingReply?.trim()
                            || 'What would you like prayer for?';

                        prayerClarifyingReplyMessage = clarifyingReply;

                        // Persist the clarifying reply as an outbound message
                        const clarifyId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                        await db.collection('smsConversations').doc(convId)
                            .collection('messages').doc(clarifyId).set({
                                id:             clarifyId,
                                conversationId: convId,
                                churchId,
                                direction:      'outbound',
                                body:           clarifyingReply,
                                mediaUrls:      [],
                                status:         'sent',
                                sentBy:         null,
                                sentByName:     'Auto-Reply (Prayer)',
                                createdAt:      Date.now(),
                            });

                        // Mark conversation as awaiting prayer detail
                        await convRef.update({ prayerFollowUpState: 'awaiting_prayer_detail' });

                        log.info(`[Prayer Detection] Generic prayer ask from ${from} — sent clarifying reply for church ${churchId}`, 'system', { churchId, convId }, churchId);

                    } else if (prayerType === 'specific') {
                        // Specific request — tag immediately, no clarifying reply needed
                        const { FieldValue } = require('firebase-admin/firestore');
                        const prayerTagId = await getOrCreatePrayerTag(db, churchId, log);
                        await convRef.update({
                            tags: FieldValue.arrayUnion(prayerTagId),
                        });
                        log.info(`[Prayer Detection] Specific prayer request from ${from} — tagged "Needs Prayer" for church ${churchId}`, 'system', { churchId, convId }, churchId);
                    }
                }
            }
        } catch (prayerErr: any) {
            // Non-fatal — log and continue so the inbound message is always saved
            log.warn(`[Prayer Detection] Error during prayer detection: ${prayerErr.message}`, 'system', { churchId, convId }, churchId);
        }

        // 6. Check tag auto-replies: look up any tags that were applied (via keyword auto-tag or
        //    already on the conversation) and fire their autoReplyMessage if set.
        //    We only fire tag auto-replies for tags just applied by this keyword match,
        //    so we don't spam repeat messages on every inbound message.
        const tagAutoReplies: string[] = [];
        if (kw && Array.isArray(kw.autoTagIds) && kw.autoTagIds.length > 0) {
            try {
                for (const tagId of kw.autoTagIds) {
                    const tagDoc = await db.collection('smsTags').doc(tagId).get();
                    if (tagDoc.exists) {
                        const tagData = tagDoc.data();
                        if (tagData?.autoReplyMessage && tagData.autoReplyMessage.trim()) {
                            tagAutoReplies.push(tagData.autoReplyMessage.trim());
                        }
                    }
                }
            } catch (tagReplyErr: any) {
                log.warn(`[Inbound SMS] Failed to check tag auto-replies: ${tagReplyErr.message}`, 'system', { churchId, convId }, churchId);
            }
        }

        // Save tag auto-reply messages to Firestore and include in TwiML response
        for (const tagReplyBody of tagAutoReplies) {
            const tagReplyId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await db.collection('smsConversations').doc(convId)
                .collection('messages').doc(tagReplyId).set({
                    id:             tagReplyId,
                    conversationId: convId,
                    churchId,
                    direction:      'outbound',
                    body:           tagReplyBody,
                    mediaUrls:      [],
                    status:         'sent',
                    sentBy:         null,
                    sentByName:     'Auto-Reply (Tag)',
                    createdAt:      Date.now(),
                });
        }

        // Build TwiML — keyword reply first, then tag auto-replies, then prayer clarifying reply
        // (prayer clarifying reply is mutually exclusive with keyword pipeline)
        const allReplies: string[] = [];
        if (keywordReplyMessage) allReplies.push(keywordReplyMessage);
        for (const r of tagAutoReplies) allReplies.push(r);
        if (prayerClarifyingReplyMessage) allReplies.push(prayerClarifyingReplyMessage);

        let twiml = '<Response></Response>';
        if (allReplies.length > 0) {
            const msgXml = allReplies
                .map(r => `<Message>${r.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</Message>`)
                .join('');
            twiml = `<Response>${msgXml}</Response>`;
        }



        res.set('Content-Type', 'text/xml');
        return res.status(200).send(twiml);
    } catch (e: any) {
        log.error(`[Inbound SMS] Error processing message: ${e.message}`, 'system', { from: fromRaw, to: toRaw }, '');
        // Always return 200 to Twilio to prevent retries for logic errors
        res.set('Content-Type', 'text/xml');
        return res.status(200).send('<Response></Response>');
    }
};
