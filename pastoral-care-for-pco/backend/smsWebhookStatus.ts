import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';

// ─── POST /api/messaging/status ───────────────────────────────────────────────
// SignalWire calls this URL for every delivery status update:
// queued → sent → delivered / failed / undelivered.
// Payload field names are identical to Twilio's. We update the matching
// SmsMessage document in Firestore using the messageSid field.

export const handleStatusCallback = async (req: any, res: any) => {
    const {
        SmsSid:        smsSid,
        MessageSid:    messageSidAlt,  // SignalWire may send MessageSid instead
        MessageStatus: messageStatus,
        ErrorCode:     errorCode,
        To:            toPhone,
        From:          fromPhone,
    } = req.body || {};

    const sid = smsSid || messageSidAlt;

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

        const updateData: any = { status: messageStatus };
        if (errorCode) updateData.errorCode = errorCode;
        if (messageStatus === 'delivered') updateData.deliveredAt = Date.now();

        await msgDoc.ref.update(updateData);

        // Update campaign counters atomically
        const campaignId = msgData?.campaignId;
        if (campaignId) {
            const campaignRef = db.collection('smsCampaigns').doc(campaignId);
            if (messageStatus === 'delivered') {
                await campaignRef.update({
                    deliveredCount: (await campaignRef.get()).data()?.deliveredCount + 1 || 1,
                });
            } else if (messageStatus === 'failed' || messageStatus === 'undelivered') {
                await campaignRef.update({
                    failedCount: (await campaignRef.get()).data()?.failedCount + 1 || 1,
                });
            }
        }

        return res.status(200).send('OK');
    } catch (e: any) {
        log.error(`[StatusCallback] Error processing status for SID ${sid}: ${e.message}`, 'system', { sid, messageStatus }, '');
        return res.status(200).send('OK'); // Always 200 to prevent provider retries
    }
};
