import Stripe from 'stripe';
import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';

async function getStripeAndVoicePrice(db: any): Promise<{ stripe: Stripe; settings: any; voicePriceId: string }> {
    const settingsDoc = await db.doc('system/settings').get();
    const settings = settingsDoc.data() || {};
    const secretKey = (settings.stripeSecretKey || '').trim();
    if (!secretKey) throw { status: 500, message: 'Stripe Secret Key not configured.' };

    const voicePriceId = (settings.stripePriceIds?.voiceAddon || '').trim();
    if (!voicePriceId) {
        throw {
            status: 500,
            message: 'Voice Calling Add-On price ID not configured in System Settings (stripePriceIds.voiceAddon).'
        };
    }

    const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' as any });
    return { stripe, settings, voicePriceId };
}

/**
 * POST /api/billing/add-voice-addon
 * Subscribes a church to the optional Voice Calling paid add-on.
 * Body: { churchId }
 */
export const addVoiceAddon = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db = getDb();
    const log = createServerLogger(db);

    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const church = churchSnap.data() || {};

        if (church.voiceAddOn?.enabled) {
            return res.json({
                success: true,
                enabled: true,
                message: 'Voice Calling add-on is already active.'
            });
        }

        const subscriptionId = church.subscription?.subscriptionId;
        if (!subscriptionId) {
            return res.status(400).json({
                error: 'An active paid subscription is required before adding Voice Calling.'
            });
        }

        const { stripe, voicePriceId } = await getStripeAndVoicePrice(db);
        const subscription = await stripe.subscriptions.retrieve(subscriptionId);
        if (!['active', 'trialing'].includes(subscription.status)) {
            return res.status(400).json({
                error: `Subscription is ${subscription.status}. Please reactivate your plan first.`
            });
        }

        // Check if the item already exists on the subscription
        const existingItem = subscription.items.data.find(
            (item) => item.price?.id === voicePriceId
        );

        let stripeItemId: string;
        if (existingItem) {
            stripeItemId = existingItem.id;
        } else {
            const created = await stripe.subscriptionItems.create({
                subscription: subscriptionId,
                price: voicePriceId,
                quantity: 1,
                proration_behavior: 'create_prorations'
            });
            stripeItemId = created.id;
        }

        const now = Date.now();
        await db.collection('churches').doc(churchId).update({
            voiceAddOn: {
                enabled: true,
                stripeItemId,
                subscribedAt: now,
                canceledAt: null
            }
        });

        log.info(`[VoiceAddon] Enabled Voice Calling add-on for church ${churchId}`, 'system', { churchId, stripeItemId }, churchId);

        return res.json({
            success: true,
            enabled: true,
            stripeItemId,
            message: 'Voice Calling add-on enabled! You can now opt in individual phone numbers in Messaging Settings.'
        });
    } catch (e: any) {
        const status = e.status || 500;
        log.error(`[VoiceAddon] addVoiceAddon failed for ${churchId}: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(status).json({ error: e.message || 'Failed to enable Voice Calling add-on.' });
    }
};

/**
 * POST /api/billing/remove-voice-addon
 * Cancels the optional Voice Calling paid add-on for a church.
 * Body: { churchId }
 */
export const removeVoiceAddon = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db = getDb();
    const log = createServerLogger(db);

    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const church = churchSnap.data() || {};

        const existingItemId: string | undefined = church.voiceAddOn?.stripeItemId;
        if (existingItemId) {
            const { stripe } = await getStripeAndVoicePrice(db);
            try {
                await stripe.subscriptionItems.del(existingItemId, {
                    proration_behavior: 'none'
                } as any);
            } catch (stripeErr: any) {
                if (stripeErr?.code !== 'resource_missing') {
                    throw stripeErr;
                }
            }
        }

        const now = Date.now();
        await db.collection('churches').doc(churchId).update({
            voiceAddOn: {
                enabled: false,
                stripeItemId: null,
                subscribedAt: church.voiceAddOn?.subscribedAt || null,
                canceledAt: now
            }
        });

        // Disable voiceEnabled on all church numbers when add-on is removed
        const numsSnap = await db.collection('smsNumbers').where('churchId', '==', churchId).get();
        const batch = db.batch();
        numsSnap.docs.forEach((docSnap) => {
            if (docSnap.data()?.voiceEnabled) {
                batch.update(docSnap.ref, { voiceEnabled: false, updatedAt: now });
            }
        });
        if (!numsSnap.empty) {
            await batch.commit();
        }

        log.info(`[VoiceAddon] Disabled Voice Calling add-on for church ${churchId}`, 'system', { churchId }, churchId);

        return res.json({
            success: true,
            enabled: false,
            message: 'Voice Calling add-on removed. Changes apply to your next invoice.'
        });
    } catch (e: any) {
        const status = e.status || 500;
        log.error(`[VoiceAddon] removeVoiceAddon failed for ${churchId}: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(status).json({ error: e.message || 'Failed to remove Voice Calling add-on.' });
    }
};

/**
 * Syncs voiceAddOn state from a Stripe subscription webhook event.
 */
export async function syncVoiceAddonFromSubscription(
    db: any,
    churchId: string,
    subscription: Stripe.Subscription
): Promise<void> {
    const settingsDoc = await db.doc('system/settings').get();
    const voicePriceId = (settingsDoc.data()?.stripePriceIds?.voiceAddon || '').trim();
    if (!voicePriceId) return;

    const churchSnap = await db.collection('churches').doc(churchId).get();
    const church = churchSnap.data() || {};
    if (church.voiceAddOn?.comped) return; // Never revoke comped access via Stripe webhook

    const isSubActive = ['active', 'trialing'].includes(subscription.status);
    const voiceItem = subscription.items?.data?.find((item) => item.price?.id === voicePriceId);
    const shouldBeEnabled = isSubActive && !!voiceItem;

    if (Boolean(church.voiceAddOn?.enabled) !== shouldBeEnabled) {
        await db.collection('churches').doc(churchId).update({
            'voiceAddOn.enabled': shouldBeEnabled,
            'voiceAddOn.stripeItemId': voiceItem?.id || null,
            ...(shouldBeEnabled ? { 'voiceAddOn.subscribedAt': Date.now() } : { 'voiceAddOn.canceledAt': Date.now() })
        });
    }
}
