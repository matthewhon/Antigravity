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
import admin from 'firebase-admin';
import { getDb } from './firebase';
import { FieldValue } from 'firebase-admin/firestore';

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

/** Convert raw APNs hex tokens to FCM registration tokens using Google Batch Import API. */
export async function convertApnsToFcm(apnsTokens: string[], sandbox: boolean): Promise<{ [apnsToken: string]: string }> {
    const app = admin.app();
    const credential = app.options.credential;
    if (!credential || typeof credential.getAccessToken !== 'function') {
        console.warn('[FCM] Credential getAccessToken is not available.');
        return {};
    }

    let accessToken: string;
    try {
        const tokenObj = await credential.getAccessToken();
        accessToken = tokenObj.access_token;
    } catch (tokenErr: any) {
        console.error('[FCM] Failed to get access token for batchImport:', tokenErr?.message || tokenErr);
        return {};
    }

    const bundleId = 'com.barnabassoftware.pcmessaging';
    try {
        const response = await fetch('https://iid.googleapis.com/iid/v1:batchImport', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${accessToken}`,
                'access_token_auth': 'true'
            },
            body: JSON.stringify({
                application: bundleId,
                sandbox: sandbox,
                apns_tokens: apnsTokens
            })
        });

        if (!response.ok) {
            const errText = await response.text();
            console.warn(`[FCM] batchImport returned status ${response.status}: ${errText}`);
            return {};
        }

        const result = await response.json() as any;
        const mapping: { [apnsToken: string]: string } = {};
        if (result.results && Array.isArray(result.results)) {
            for (const item of result.results) {
                if (item.status === 'OK' && item.registration_token) {
                    mapping[item.apns_token] = item.registration_token;
                } else {
                    console.warn(`[FCM] Token mapping item status for ${item.apns_token?.slice(0, 8)}...: ${item.status}`);
                }
            }
        }
        return mapping;
    } catch (e: any) {
        console.error('[FCM] batchImport request failed:', e?.message || e);
        return {};
    }
}

/**
 * Send a push notification to all subscribed users (Web Push and Native FCM) for a given church + phone number.
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

    // ─── 1. Web Push notifications (PWA / browser) ───
    try {
        await configureWebPush();

        // Query subscriptions for this church
        let q = db.collection('pushSubscriptions').where('churchId', '==', opts.churchId);
        const snap = await q.get();

        if (!snap.empty) {
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
        }
    } catch (err: any) {
        console.error('[WebPush] sendPushToChurch web-push error:', err?.message || err);
    }

    // ─── 2. FCM Native Push notifications (iOS / Android) ───
    try {
        const usersSnap = await db.collection('users')
            .where('churchId', '==', opts.churchId)
            .get();

        if (!usersSnap.empty) {
            // Resolve line-specific allowed users if numberId is provided
            let allowedUserIds: string[] = [];
            if (opts.numberId) {
                const numDoc = await db.collection('smsNumbers').doc(opts.numberId).get();
                if (numDoc.exists) {
                    allowedUserIds = numDoc.data()?.allowedUserIds || [];
                }
            }

            const tokensToSend: string[] = [];
            const tokenToUserMap: { [token: string]: string } = {};
            const apnsTokensToConvert: { token: string; userId: string }[] = [];

            for (const userDoc of usersSnap.docs) {
                const userData = userDoc.data();
                const fcmTokens: string[] = userData.fcmTokens || [];
                if (fcmTokens.length === 0) continue;

                // User roles check: must have Messaging, Church Admin, or System Administration
                const roles: string[] = userData.roles || [];
                const hasRole = roles.includes('Messaging') || roles.includes('Church Admin') || roles.includes('System Administration');
                if (!hasRole) continue;

                // Access restriction check for this line
                if (allowedUserIds.length > 0 && !allowedUserIds.includes(userDoc.id)) {
                    continue;
                }

                for (const tok of fcmTokens) {
                    if (/^[0-9a-fA-F]{64}$/.test(tok)) {
                        apnsTokensToConvert.push({ token: tok, userId: userDoc.id });
                    } else {
                        tokensToSend.push(tok);
                        tokenToUserMap[tok] = userDoc.id;
                    }
                }
            }

            // Convert APNs tokens to FCM tokens dynamically
            if (apnsTokensToConvert.length > 0) {
                const uniqueApns = Array.from(new Set(apnsTokensToConvert.map(x => x.token)));
                console.log(`[FCM] Converting ${uniqueApns.length} APNs tokens to FCM tokens...`);
                
                // Try production first (sandbox: false)
                let converted: { [apnsToken: string]: string } = {};
                try {
                    converted = await convertApnsToFcm(uniqueApns, false);
                } catch (e) {
                    console.error('[FCM] APNs conversion (production) failed:', e);
                }

                // Try sandbox second for any that failed or weren't returned
                const remainingApns = uniqueApns.filter(t => !converted[t]);
                if (remainingApns.length > 0) {
                    try {
                        const convertedSandbox = await convertApnsToFcm(remainingApns, true);
                        converted = { ...converted, ...convertedSandbox };
                    } catch (e) {
                        console.error('[FCM] APNs conversion (sandbox) failed:', e);
                    }
                }

                // Add successfully converted tokens and save to Firestore
                for (const item of apnsTokensToConvert) {
                    const apnsToken = item.token;
                    const fcmToken = converted[apnsToken];
                    if (fcmToken) {
                        console.log(`[FCM] Converted APNs token ${apnsToken.slice(0, 8)}... to FCM token ${fcmToken.slice(0, 8)}...`);
                        tokensToSend.push(fcmToken);
                        tokenToUserMap[fcmToken] = item.userId;

                        // Persist FCM token and remove APNs token to avoid repeating conversion next time
                        try {
                            await db.collection('users').doc(item.userId).update({
                                fcmTokens: FieldValue.arrayUnion(fcmToken)
                            });
                            await db.collection('users').doc(item.userId).update({
                                fcmTokens: FieldValue.arrayRemove(apnsToken)
                            });
                            console.log(`[FCM] Swapped APNs token with FCM token for user ${item.userId}`);
                        } catch (dbErr) {
                            console.error(`[FCM] Failed to update Firestore token mapping for user ${item.userId}:`, dbErr);
                        }
                    } else {
                        console.warn(`[FCM] Could not convert APNs token ${apnsToken.slice(0, 8)}... for user ${item.userId}`);
                    }
                }
            }

            if (tokensToSend.length > 0) {
                const uniqueTokens = Array.from(new Set(tokensToSend));
                
                const response = await admin.messaging().sendEachForMulticast({
                    tokens: uniqueTokens,
                    notification: {
                        title: opts.title,
                        body: opts.body,
                    },
                    data: {
                        url: opts.url || '/mobile/sms',
                        tag: opts.tag || 'sms-new',
                    },
                    apns: {
                        payload: {
                            aps: {
                                sound: 'default',
                                badge: 1,
                            }
                        }
                    }
                });

                console.log(`[FCM] Multicast sent. Success count: ${response.successCount}, failure count: ${response.failureCount}`);

                // Clean up stale or unregistered tokens
                const tokensToDelete: { userId: string; token: string }[] = [];
                response.responses.forEach((resp, idx) => {
                    if (!resp.success && resp.error) {
                        const code = resp.error.code;
                        if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token') {
                            const failedToken = uniqueTokens[idx];
                            const uId = tokenToUserMap[failedToken];
                            if (uId) {
                                tokensToDelete.push({ userId: uId, token: failedToken });
                            }
                        }
                    }
                });

                if (tokensToDelete.length > 0) {
                    for (const item of tokensToDelete) {
                        await db.collection('users').doc(item.userId).update({
                            fcmTokens: FieldValue.arrayRemove(item.token)
                        }).catch(err => console.error(`[FCM] Stale token cleanup failed for user ${item.userId}:`, err));
                    }
                    console.log(`[FCM] Cleaned up ${tokensToDelete.length} stale tokens.`);
                }
            }
        }
    } catch (err: any) {
        console.error('[FCM] Native push send error:', err?.message || err);
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
