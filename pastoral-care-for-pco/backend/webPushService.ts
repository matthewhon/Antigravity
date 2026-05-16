/**
 * Web Push notification service.
 *
 * VAPID keys are generated once and stored in Firestore at system/settings:
 *   { vapidPublicKey, vapidPrivateKey }
 *
 * Push subscriptions are stored in Firestore:
 *   pushSubscriptions / {churchId}_{userId} → { churchId, userId, numberId?, subscription }
 */

import webpush from 'web-push';
import { getDb } from './firebase';

const VAPID_SUBJECT = 'mailto:support@barnabassoftware.com';

/** Load (and lazily generate) VAPID keys from Firestore system settings. */
async function getVapidKeys(): Promise<{ publicKey: string; privateKey: string }> {
    const db = getDb();
    const snap = await db.doc('system/settings').get();
    const settings = snap.data() || {};

    if (settings.vapidPublicKey && settings.vapidPrivateKey) {
        return { publicKey: settings.vapidPublicKey, privateKey: settings.vapidPrivateKey };
    }

    // Generate a new pair and persist it
    const keys = webpush.generateVAPIDKeys();
    await db.doc('system/settings').update({
        vapidPublicKey:  keys.publicKey,
        vapidPrivateKey: keys.privateKey,
    });
    console.log('[WebPush] Generated new VAPID key pair and saved to Firestore');
    return { publicKey: keys.publicKey, privateKey: keys.privateKey };
}

/** Configure web-push with VAPID keys. Call before sending. */
async function configureWebPush(): Promise<string> {
    const { publicKey, privateKey } = await getVapidKeys();
    webpush.setVapidDetails(VAPID_SUBJECT, publicKey, privateKey);
    return publicKey;
}

/**
 * Send a push notification to all subscribed users for a given church + phone number.
 * payload fields: title, body, url, tag
 */
export async function sendPushToChurch(opts: {
    churchId: string;
    numberId?: string;   // if provided, only notify users subscribed to this number
    title: string;
    body: string;
    url?: string;
    tag?: string;
}): Promise<void> {
    const db = getDb();

    try {
        await configureWebPush();

        // Query subscriptions for this church
        let q = db.collection('pushSubscriptions').where('churchId', '==', opts.churchId);
        const snap = await q.get();

        if (snap.empty) return;

        const payload = JSON.stringify({
            title: opts.title,
            body:  opts.body,
            url:   opts.url  || '/mobile/sms',
            tag:   opts.tag  || 'sms-new',
        });

        const staleIds: string[] = [];

        await Promise.allSettled(
            snap.docs.map(async (doc) => {
                const data = doc.data();

                // If caller specifies a numberId, skip subscriptions for other numbers
                // (unless the subscription has no numberId filter, meaning "all numbers")
                if (opts.numberId && data.numberId && data.numberId !== opts.numberId) return;

                try {
                    await webpush.sendNotification(data.subscription, payload);
                } catch (err: any) {
                    // 410 Gone = subscription expired/revoked — clean it up
                    if (err.statusCode === 410 || err.statusCode === 404) {
                        staleIds.push(doc.id);
                    } else {
                        console.warn(`[WebPush] Failed to notify ${doc.id}:`, err?.message);
                    }
                }
            })
        );

        // Remove expired subscriptions
        for (const id of staleIds) {
            await db.collection('pushSubscriptions').doc(id).delete();
        }

    } catch (err: any) {
        // Never throw — push is best-effort and must not break the SMS pipeline
        console.error('[WebPush] sendPushToChurch error:', err?.message || err);
    }
}

/** Express route handler: GET /push/vapid-public-key */
export const getVapidPublicKey = async (req: any, res: any) => {
    try {
        const { publicKey } = await getVapidKeys();
        res.json({ publicKey });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

/** Express route handler: POST /push/subscribe */
export const savePushSubscription = async (req: any, res: any) => {
    const { churchId, userId, numberId, subscription } = req.body || {};
    if (!churchId || !userId || !subscription?.endpoint) {
        return res.status(400).json({ error: 'Missing churchId, userId, or subscription' });
    }
    try {
        const db = getDb();
        const docId = `${churchId}_${userId}`;
        await db.collection('pushSubscriptions').doc(docId).set({
            churchId,
            userId,
            numberId: numberId || null,   // null = notify for all numbers
            subscription,
            updatedAt: Date.now(),
        }, { merge: true });
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};

/** Express route handler: DELETE /push/subscribe */
export const removePushSubscription = async (req: any, res: any) => {
    const { churchId, userId } = req.body || {};
    if (!churchId || !userId) return res.status(400).json({ error: 'Missing churchId or userId' });
    try {
        const db = getDb();
        await db.collection('pushSubscriptions').doc(`${churchId}_${userId}`).delete();
        res.json({ success: true });
    } catch (e: any) {
        res.status(500).json({ error: e.message });
    }
};
