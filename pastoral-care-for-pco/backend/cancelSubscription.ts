
import admin from 'firebase-admin';
import Stripe from 'stripe';
import { getDb } from './firebase';

export const cancelSubscription = async (req: any, res: any) => {
    try {
        const db = getDb();
        const { churchId } = req.body;

        if (!churchId) {
            res.status(400).send({ message: 'Missing churchId' });
            return;
        }

        // 1. Fetch System Settings from Firestore for API Key
        const settingsDoc = await db.doc('system/settings').get();
        const settings = settingsDoc.data() || {};
        // TRIM KEY to prevent whitespace errors
        const secretKey = settings.stripeSecretKey ? settings.stripeSecretKey.trim() : '';

        if (!secretKey) {
            console.error("Stripe Secret Key not found in system/settings");
            res.status(500).send({ message: 'Payment system not configured.' });
            return;
        }

        // 2. Initialize Stripe
        const stripe = new Stripe(secretKey, {
            apiVersion: '2023-10-16' as any,
        });

        // 3. Get Church Customer ID
        const churchDoc = await db.collection('churches').doc(churchId).get();
        if (!churchDoc.exists) {
            res.status(404).send({ message: 'Church not found' });
            return;
        }

        const churchData = churchDoc.data();
        const customerId = churchData?.subscription?.customerId;

        if (!customerId) {
            res.status(400).send({ message: 'No active subscription customer found.' });
            return;
        }

        // 4. Find Active Subscription for Customer
        const subscriptions = await stripe.subscriptions.list({
            customer: customerId,
            status: 'active',
            limit: 1
        });

        if (subscriptions.data.length === 0) {
            // No active subscription found in Stripe, sync local state
            await db.collection('churches').doc(churchId).update({
                'subscription.status': 'canceled'
            });
            res.status(200).send({ message: 'No active subscription found.' });
            return;
        }

        const subscription = subscriptions.data[0];

        // 5. Cancel Subscription (at period end)
        await stripe.subscriptions.update(subscription.id, {
            cancel_at_period_end: true
        });

        res.status(200).json({ message: 'Subscription set to cancel at end of period.' });

    } catch (error: any) {
        console.error('Cancel Subscription Error:', error);
        res.status(500).json({ message: error.message || 'Internal Server Error' });
    }
};
