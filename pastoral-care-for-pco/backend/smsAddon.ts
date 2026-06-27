import Stripe from 'stripe';
import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';

const MAX_ADDONS = 8; // 2 base + 8 add-ons = 10 numbers max

async function getStripeAndSettings(db: any): Promise<{ stripe: Stripe; settings: any; addonPriceId: string }> {
    const settingsDoc = await db.doc('system/settings').get();
    const settings = settingsDoc.data() || {};
    const secretKey = (settings.stripeSecretKey || '').trim();
    if (!secretKey) throw { status: 500, message: 'Stripe Secret Key not configured.' };

    const addonPriceId = (settings.stripePriceIds?.smsAddon || '').trim();
    if (!addonPriceId) throw { status: 500, message: 'SMS Add-On price ID not configured in System Settings (stripePriceIds.smsAddon).' };

    const stripe = new Stripe(secretKey, { apiVersion: '2023-10-16' as any });
    return { stripe, settings, addonPriceId };
}

// ─── POST /api/billing/add-sms-addon ─────────────────────────────────────────
// Adds one SMS add-on unit to the church's Growth subscription.
// Each add-on: +$20/mo applied to next invoice, +1 phone number, +1,500 SMS segments/mo.
// Body: { churchId }

export const addSmsAddon = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const church = churchSnap.data() || {};

        // Verify the church is on the Growth plan
        if (church.subscription?.planId !== 'growth' || church.subscription?.status !== 'active') {
            return res.status(403).json({ error: 'SMS add-ons are only available on the Growth plan.' });
        }

        const currentQty: number = church.smsAddOns?.quantity ?? 0;
        if (currentQty >= MAX_ADDONS) {
            return res.status(400).json({
                error: `You have reached the maximum of ${MAX_ADDONS} SMS add-ons (10 phone numbers total). ` +
                       'Upgrade to the Kingdom plan for unlimited SMS.',
            });
        }

        const subscriptionId: string = church.subscription?.subscriptionId;
        if (!subscriptionId) return res.status(400).json({ error: 'No active Stripe subscription found for this church.' });

        const { stripe, addonPriceId } = await getStripeAndSettings(db);

        const existingItemId: string | undefined = church.smsAddOns?.stripeItemId;
        let newItemId: string;
        const newQty = currentQty + 1;

        if (existingItemId) {
            // Update existing add-on line item — increase quantity by 1
            const updated = await stripe.subscriptionItems.update(existingItemId, {
                quantity: newQty,
                proration_behavior: 'none', // Apply to next invoice
            });
            newItemId = updated.id;
        } else {
            // Create a new add-on line item on the subscription
            const created = await stripe.subscriptionItems.create({
                subscription: subscriptionId,
                price: addonPriceId,
                quantity: 1,
                proration_behavior: 'none', // Apply to next invoice
            });
            newItemId = created.id;
        }

        await db.collection('churches').doc(churchId).update({
            'smsAddOns.quantity':      newQty,
            'smsAddOns.stripeItemId':  newItemId,
        });

        log.info(`[SmsAddon] Added add-on for church ${churchId}. New qty: ${newQty}`, 'system', { churchId }, churchId);

        return res.json({
            success:        true,
            quantity:       newQty,
            maxSmsPerMonth: 1500 + newQty * 1500,
            maxSmsNumbers:  2    + newQty,
            message:        `SMS add-on added. Your plan now includes ${1500 + newQty * 1500} SMS segments/mo and ${2 + newQty} phone numbers. Applied to next invoice.`,
        });
    } catch (e: any) {
        log.error(`[SmsAddon] addSmsAddon failed for ${churchId}: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(e.status || 500).json({ error: e.message || 'Failed to add SMS add-on' });
    }
};

// ─── POST /api/billing/remove-sms-addon ──────────────────────────────────────
// Removes one SMS add-on unit from the church's Growth subscription.
// Body: { churchId }

export const removeSmsAddon = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const church = churchSnap.data() || {};

        const currentQty: number = church.smsAddOns?.quantity ?? 0;
        if (currentQty <= 0) {
            return res.status(400).json({ error: 'No SMS add-ons to remove.' });
        }

        const existingItemId: string | undefined = church.smsAddOns?.stripeItemId;
        if (!existingItemId) {
            return res.status(400).json({ error: 'No Stripe add-on item found. Contact support.' });
        }

        const { stripe } = await getStripeAndSettings(db);
        const newQty = currentQty - 1;

        if (newQty === 0) {
            // Remove the subscription item entirely
            await stripe.subscriptionItems.del(existingItemId, {
                proration_behavior: 'none', // Apply to next invoice
            } as any);
            await db.collection('churches').doc(churchId).update({
                smsAddOns: { quantity: 0, stripeItemId: null },
            });
        } else {
            // Decrease quantity by 1
            await stripe.subscriptionItems.update(existingItemId, {
                quantity: newQty,
                proration_behavior: 'none', // Apply to next invoice
            });
            await db.collection('churches').doc(churchId).update({
                'smsAddOns.quantity': newQty,
            });
        }

        log.info(`[SmsAddon] Removed add-on for church ${churchId}. New qty: ${newQty}`, 'system', { churchId }, churchId);

        return res.json({
            success:        true,
            quantity:       newQty,
            maxSmsPerMonth: 1500 + newQty * 1500,
            maxSmsNumbers:  2    + newQty,
            message:        `SMS add-on removed. Applied to next invoice.`,
        });
    } catch (e: any) {
        log.error(`[SmsAddon] removeSmsAddon failed for ${churchId}: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(e.status || 500).json({ error: e.message || 'Failed to remove SMS add-on' });
    }
};
