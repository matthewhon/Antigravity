import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';
import { FieldValue } from 'firebase-admin/firestore';

// ─── POST /api/messaging/status ───────────────────────────────────────────────
// SignalWire calls this URL for every delivery status update:
// queued → initiated → sent → delivered / failed / undelivered / read.
//
// Supports BOTH payload formats:
//   • Compatibility SDK (Twilio-style):  PascalCase, form-encoded
//     e.g. { SmsSid, MessageStatus, ErrorCode, To, From }
//   • Native SignalWire REST API:        snake_case, JSON
//     e.g. { id, status, error_code, to, from, timestamp, error_message }
//
// This dual-format approach ensures the handler works regardless of which
// SignalWire sending method is used (compatibility SDK vs native REST).

export const handleStatusCallback = async (req: any, res: any) => {
    const body = req.body || {};

    // ── Dual-format field extraction ──────────────────────────────────────
    // Compatibility (PascalCase) fields first, native (snake_case) fallback.
    const sid           = body.SmsSid || body.MessageSid || body.id || null;
    const messageStatus = body.MessageStatus || body.status || null;
    const errorCode     = body.ErrorCode || body.error_code || null;
    const errorMessage  = body.ErrorMessage || body.error_message || null;
    const timestamp     = body.Timestamp || body.timestamp || null;

    if (!sid || !messageStatus) {
        return res.status(200).send('OK'); // Always 200 to stop provider retries
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        // Find the SmsMessage by messageSid across all conversations.
        const msgSnap = await db.collectionGroup('messages')
            .where('messageSid', '==', sid)
            .limit(1)
            .get();

        if (msgSnap.empty) {
            // Could be a keyword auto-reply or a message outside our system — ignore
            return res.status(200).send('OK');
        }

        const msgDoc  = msgSnap.docs[0];
        const msgData = msgDoc.data();

        // ── Build the update payload ─────────────────────────────────────
        const updateData: Record<string, any> = { status: messageStatus };

        if (errorCode)    updateData.errorCode    = errorCode;
        if (errorMessage) updateData.errorMessage = errorMessage;

        // Capture the SignalWire-reported timestamp for accurate delivery timing
        if (timestamp) updateData.statusChangedAt = new Date(timestamp).getTime();

        // Status-specific timestamps
        if (messageStatus === 'delivered')   updateData.deliveredAt = Date.now();
        if (messageStatus === 'read')        updateData.readAt      = Date.now();
        if (messageStatus === 'sent')        updateData.sentAt      = Date.now();
        if (messageStatus === 'failed' || messageStatus === 'undelivered') {
            updateData.failedAt = Date.now();
        }

        await msgDoc.ref.update(updateData);

        // ── Update campaign counters atomically ──────────────────────────
        // Uses FieldValue.increment() to prevent race conditions when
        // multiple status callbacks arrive concurrently for the same campaign.
        const campaignId = msgData?.campaignId;
        if (campaignId) {
            const campaignRef = db.collection('smsCampaigns').doc(campaignId);
            if (messageStatus === 'delivered') {
                await campaignRef.update({
                    deliveredCount: FieldValue.increment(1),
                });
            } else if (messageStatus === 'failed' || messageStatus === 'undelivered') {
                await campaignRef.update({
                    failedCount: FieldValue.increment(1),
                });
            }
        }

        return res.status(200).send('OK');
    } catch (e: any) {
        log.error(`[StatusCallback] Error processing status for SID ${sid}: ${e.message}`, 'system', { sid, messageStatus }, '');
        return res.status(200).send('OK'); // Always 200 to prevent provider retries
    }
};
