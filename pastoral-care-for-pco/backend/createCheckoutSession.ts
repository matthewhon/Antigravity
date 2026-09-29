
import admin from 'firebase-admin';
import Stripe from 'stripe';
import { getDb } from './firebase';

export const createCheckoutSession = async (req: any, res: any) => {
    try {
        const db = getDb();
        const { churchId, planId, email, returnUrl } = req.body;

        if (!churchId || !planId) {
            res.status(400).send({ message: 'Missing churchId or planId' });
            return;
        }

        // 1. Fetch System Settings from Firestore
        const settingsDoc = await db.doc('system/settings').get();
        const settings = settingsDoc.data() || {};
        // TRIM KEY to prevent whitespace errors
        const secretKey = settings.stripeSecretKey ? settings.stripeSecretKey.trim() : '';

        if (!secretKey) {
            console.error("Stripe Secret Key not found in system/settings");
            res.status(500).send({ message: 'Payment system not configured.' });
            return;
        }

        // 2. Initialize Stripe with the dynamic key
        const stripe = new Stripe(secretKey, {
            apiVersion: '2023-10-16' as any,
        });

        // 3. Resolve Price ID
        const priceMap = settings.stripePriceIds || {};
        const priceId = priceMap[planId];

        if (!priceId) {
            console.error(`Price ID not found for plan: ${planId}`);
            res.status(400).send({ message: `Invalid Plan ID: ${planId} (No price configured)` });
            return;
        }

        // 4. Fetch Church Subscription Data
        const churchDoc = await db.collection('churches').doc(churchId).get();
        const churchData = churchDoc.exists ? (churchDoc.data() || {}) : {};
        const currentSub = churchData.subscription || {};

        // 5. If church already has an active subscription, update it in-place with proration
        if (currentSub.status === 'active' && currentSub.subscriptionId) {
            if (currentSub.planId === planId) {
                res.status(200).json({
                    success: true,
                    upgraded: true,
                    planId,
                    message: `Already subscribed to ${planId} plan.`
                });
                return;
            }

            try {
                const existingSub = await stripe.subscriptions.retrieve(currentSub.subscriptionId);
                if (existingSub && existingSub.status === 'active') {
                    const addonPriceId = (settings.stripePriceIds?.smsAddon || '').trim();
                    const planItem = existingSub.items.data.find((item: any) => item.price.id !== addonPriceId);

                    if (planItem) {
                        const itemsToUpdate: any[] = [
                            {
                                id: planItem.id,
                                price: priceId,
                            }
                        ];

                        const updatesForChurch: Record<string, any> = {
                            'subscription.planId': planId,
                            'subscription.status': 'active',
                            'subscription.currentPeriodEnd': (existingSub as any).current_period_end * 1000,
                        };

                        // If downgrading to starter, remove any SMS add-on item
                        if (planId === 'starter') {
                            const addonItem = existingSub.items.data.find((item: any) => item.price.id === addonPriceId);
                            if (addonItem) {
                                itemsToUpdate.push({
                                    id: addonItem.id,
                                    deleted: true,
                                });
                            }
                            updatesForChurch['smsAddOns'] = { quantity: 0, stripeItemId: null };
                        }

                        await stripe.subscriptions.update(currentSub.subscriptionId, {
                            items: itemsToUpdate,
                            proration_behavior: 'always_invoice',
                            metadata: {
                                churchId,
                                planId,
                            }
                        });

                        await db.collection('churches').doc(churchId).update(updatesForChurch);

                        console.log(`[createCheckoutSession] Direct subscription upgrade/downgrade for church ${churchId} to ${planId}`);
                        res.status(200).json({
                            success: true,
                            upgraded: true,
                            planId,
                            message: `Successfully switched to ${planId} plan.`
                        });
                        return;
                    }
                }
            } catch (directUpdateErr: any) {
                console.warn(`[createCheckoutSession] Direct subscription update failed, falling back to Checkout session:`, directUpdateErr.message);
            }
        }

        // 6. Create Checkout Session (for new subscriptions or fallback)
        const sessionParams: any = {
            payment_method_types: ['card'],
            line_items: [
                {
                    price: priceId,
                    quantity: 1,
                },
            ],
            mode: 'subscription',
            allow_promotion_codes: true, // ENABLE COUPON CODES
            client_reference_id: churchId,
            success_url: `${returnUrl || 'https://app.pastoral.care'}?success=true`,
            cancel_url: `${returnUrl || 'https://app.pastoral.care'}?canceled=true`,
            metadata: {
                churchId: churchId,
                planId: planId,
                previousSubscriptionId: currentSub.subscriptionId || '',
            }
        };

        // If church already has a customer ID in Stripe, attach to it so no duplicate customer is created
        if (currentSub.customerId) {
            sessionParams.customer = currentSub.customerId;
            sessionParams.customer_update = {
                name: 'auto',
                address: 'auto',
            };
        } else if (email) {
            sessionParams.customer_email = email;
        }

        const session = await stripe.checkout.sessions.create(sessionParams);

        res.status(200).json({ sessionId: session.id });
    } catch (error: any) {
        console.error('Stripe Session Error:', error);
        res.status(500).json({ message: error.message });
    }
};
