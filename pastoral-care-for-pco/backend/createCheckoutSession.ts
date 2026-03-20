
import * as admin from 'firebase-admin';
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

        // 4. Create Session
        const session = await stripe.checkout.sessions.create({
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
            customer_email: email, // Pre-fill email if provided
            success_url: `${returnUrl || 'https://app.pastoral.care'}?success=true`,
            cancel_url: `${returnUrl || 'https://app.pastoral.care'}?canceled=true`,
            metadata: {
                churchId: churchId,
                planId: planId
            }
        });

        res.status(200).json({ sessionId: session.id });
    } catch (error: any) {
        console.error('Stripe Session Error:', error);
        res.status(500).json({ message: error.message });
    }
};
