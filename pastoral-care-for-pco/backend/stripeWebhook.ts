
import * as admin from 'firebase-admin';
import Stripe from 'stripe';
import { getDb } from './firebase';

// Note: In production, fetch these securely. 
// For this setup, we fetch the secret key from Firestore similar to other endpoints, 
// OR you must set them as Firebase Function Environment variables.
// Here we assume environment variables for the webhook secret as it's static per deployment.

export const handleStripeWebhook = async (req: any, res: any) => {
    const db = getDb();
    const sig = req.headers['stripe-signature'];
    
    // Fetch settings to get keys
    const settingsDoc = await db.doc('system/settings').get();
    const settings = settingsDoc.data() || {};
    
    // TRIM KEY to prevent whitespace errors
    const secretKey = settings.stripeSecretKey ? settings.stripeSecretKey.trim() : '';

    if (!secretKey) {
        console.error("Stripe Secret Key missing in settings");
        res.status(500).send("Configuration Error");
        return;
    }

    const stripe = new Stripe(secretKey, {
        apiVersion: '2023-10-16' as any,
    });
    
    const endpointSecret = settings.stripeWebhookSecret ? settings.stripeWebhookSecret.trim() : '';

    if (!endpointSecret) {
        console.error("Stripe Webhook Secret not found in system/settings");
        res.status(500).send("Webhook configuration missing");
        return;
    }

    let event: Stripe.Event;

    try {
        event = stripe.webhooks.constructEvent(req.rawBody, sig, endpointSecret);
    } catch (err: any) {
        console.error(`Webhook Error: ${err.message}`);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    // Handle the event
    switch (event.type) {
        case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session;
            const churchId = session.client_reference_id; // Passed during creation
            
            if (churchId) {
                console.log(`Processing checkout for church: ${churchId}`);
                
                // Retrieve subscription details
                if (session.subscription) {
                    const subscriptionId = session.subscription as string;
                    const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                    
                    // Identify the plan based on metadata or price
                    const planId = session.metadata?.planId || 'growth'; 
                    
                    // Update Firestore
                    await db.collection('churches').doc(churchId).update({
                        subscription: {
                            status: 'active',
                            planId: planId,
                            currentPeriodEnd: (subscription as any).current_period_end * 1000,
                            customerId: session.customer as string
                        }
                    });
                }
            }
            break;
        }

        case 'customer.subscription.updated': {
            const subscription = event.data.object as Stripe.Subscription;
            // Find church by customerId
            const churchesSnapshot = await db.collection('churches')
                .where('subscription.customerId', '==', subscription.customer)
                .limit(1)
                .get();

            if (!churchesSnapshot.empty) {
                const churchDoc = churchesSnapshot.docs[0];
                await churchDoc.ref.update({
                    'subscription.status': subscription.status,
                    'subscription.currentPeriodEnd': (subscription as any).current_period_end * 1000
                });
            }
            break;
        }

        case 'customer.subscription.deleted': {
            const subscription = event.data.object as Stripe.Subscription;
            const churchesSnapshot = await db.collection('churches')
                .where('subscription.customerId', '==', subscription.customer)
                .limit(1)
                .get();

            if (!churchesSnapshot.empty) {
                const churchDoc = churchesSnapshot.docs[0];
                await churchDoc.ref.update({
                    'subscription.status': 'canceled',
                    'subscription.currentPeriodEnd': Date.now()
                });
            }
            break;
        }

        default:
            console.log(`Unhandled event type ${event.type}`);
    }

    res.json({received: true});
};
