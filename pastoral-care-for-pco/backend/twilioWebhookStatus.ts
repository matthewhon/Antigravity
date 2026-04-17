import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';

// ─── POST /api/messaging/status ───────────────────────────────────────────────
// Twilio calls this URL for every delivery status update:
// queued → sent → delivered / failed / undelivered.
// We update the matching SmsMessage document in Firestore.

export const handleStatusCallback = async (req: any, res: any) => {
    const {
        SmsSid:        smsSid,
        MessageStatus: messageStatus,
        ErrorCode:     errorCode,
        To:            toPhone,
        From:          fromPhone,
    } = req.body || {};

    if (!smsSid || !messageStatus) {
        return res.status(200).send('OK'); // Twilio requires 200 even on bad data
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        // Find the SmsMessage by twilioSid across all conversations.
        // We use a collectionGroup query on the 'messages' sub-collection.
        const msgSnap = await db.collectionGroup('messages')
            .where('twilioSid', '==', smsSid)
            .limit(1)
            .get();

        if (msgSnap.empty) {
            // Could be a keyword auto-reply or a message outside our system — ignore
            return res.status(200).send('OK');
        }

        const msgDoc = msgSnap.docs[0];
        const msgData = msgDoc.data();

        const updateData: any = {
            status: messageStatus,
        };

        if (errorCode) {
            updateData.errorCode = errorCode;
        }

        if (messageStatus === 'delivered') {
            updateData.deliveredAt = Date.now();
        }

        await msgDoc.ref.update(updateData);

        // Also update the campaign deliveredCount atomically when delivered/failed
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
        log.error(`[StatusCallback] Error processing status for SID ${smsSid}: ${e.message}`, 'system', { smsSid, messageStatus }, '');
        return res.status(200).send('OK'); // Always 200 to prevent Twilio retries
    }
};
