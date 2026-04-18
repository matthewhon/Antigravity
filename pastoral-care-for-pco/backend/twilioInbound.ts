import twilio from 'twilio';
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

        // 5. Check for keyword matches
        const kw = await matchKeyword(db, churchId, body);
        let twiml = '<Response></Response>';

        if (kw) {
            // Auto-reply with keyword response message
            twiml = `<Response><Message>${kw.replyMessage.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}</Message></Response>`;

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

            // Save the auto-reply as an outbound message
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


        res.set('Content-Type', 'text/xml');
        return res.status(200).send(twiml);
    } catch (e: any) {
        log.error(`[Inbound SMS] Error processing message: ${e.message}`, 'system', { from: fromRaw, to: toRaw }, '');
        // Always return 200 to Twilio to prevent retries for logic errors
        res.set('Content-Type', 'text/xml');
        return res.status(200).send('<Response></Response>');
    }
};
