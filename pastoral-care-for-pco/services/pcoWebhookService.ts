import { firestore } from './firestoreService';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// Helper to get system settings and proxy URL
const getProxyUrl = async () => {
    if (import.meta.env.DEV) {
        return '/pco/proxy';
    }
    const settings = await firestore.getSystemSettings();
    const baseUrl = settings.apiBaseUrl || 'https://pastoral-care-for-pco-u3gnt7kb5a-uc.a.run.app';
    return `${baseUrl}/pco/proxy`;
};

// Helper to fetch from PCO via proxy
async function pcoFetch(churchId: string, endpoint: string, method: string = 'GET', body?: any) {
    const proxyUrl = await getProxyUrl();
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;

    const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            churchId,
            url: `https://api.planningcenteronline.com/${cleanEndpoint}`,
            method,
            body
        })
    });

    if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`PCO API Error: ${response.status} ${response.statusText} - ${errorText}`);
    }

    return response.json();
}

export const initializeWebhooks = async (churchId: string) => {
    const appUrl = window.location.origin;
    // Webhooks must point to the backend server, not the frontend SPA
    const settings = await firestore.getSystemSettings();
    const backendUrl = settings.apiBaseUrl || 'https://pastoral-care-for-pco-u3gnt7kb5a-uc.a.run.app';
    const webhookEndpoint = `${backendUrl}/pco/webhook`;

    // PCO Webhooks v2 event topic names to subscribe to
    const topics = [
        'people.v2.events.person.created',
        'people.v2.events.person.updated',
        'giving.v2.events.donation.created',
        'services.v2.events.plan_person.updated',
        'services.v2.events.needed_position.updated'
    ];

    console.log(`Initializing Webhooks for endpoint: ${webhookEndpoint}`);

    try {
        // 1. Check for an existing subscription for our endpoint
        const existingSubsResponse = await pcoFetch(churchId, 'webhooks/v2/subscriptions');
        const existingSubs = existingSubsResponse?.data || [];
        const mySub = existingSubs.find((sub: any) =>
            sub.attributes.url === webhookEndpoint ||
            sub.attributes.endpoint_url === webhookEndpoint
        );

        let subscriptionId: string | null = null;

        if (mySub) {
            console.log('Found existing subscription:', mySub.id);
            subscriptionId = mySub.id;

            // Reactivate if inactive
            if (!mySub.attributes.active) {
                console.log('Subscription inactive, reactivating...');
                await pcoFetch(churchId, `webhooks/v2/subscriptions/${subscriptionId}`, 'PATCH', {
                    data: { type: 'Subscription', id: subscriptionId, attributes: { active: true } }
                });
            }

            // Check if secret is stored
            const settingsDoc = await getDoc(doc(db, 'system_settings', 'pco_webhooks'));
            if (settingsDoc.exists() && settingsDoc.data()?.secret) {
                console.log('Webhook subscription OK — secret already stored.');
                return;
            }

            // No local secret — delete and re-create to get a fresh one
            console.warn('No local secret stored. Deleting and re-creating subscription...');
            await pcoFetch(churchId, `webhooks/v2/subscriptions/${subscriptionId}`, 'DELETE');
            subscriptionId = null;
        }

        // 2. Create new subscription with ONLY the url attribute.
        //    PCO Webhooks v2 does NOT accept event topics during creation —
        //    topics must be added separately via /event_subscriptions.
        console.log('Creating new webhook subscription...');
        const createResponse = await pcoFetch(churchId, 'webhooks/v2/subscriptions', 'POST', {
            data: {
                type: 'Subscription',
                attributes: {
                    url: webhookEndpoint,
                    active: true
                }
            }
        });
        const newSub = createResponse?.data;
        subscriptionId = newSub?.id;

        if (!subscriptionId) {
            throw new Error('Failed to create webhook subscription — no ID returned.');
        }

        // 3. Add each event topic individually via event_subscriptions
        console.log(`Adding ${topics.length} event topics to subscription ${subscriptionId}...`);
        for (const topic of topics) {
            try {
                await pcoFetch(churchId, `webhooks/v2/subscriptions/${subscriptionId}/event_subscriptions`, 'POST', {
                    data: {
                        type: 'EventSubscription',
                        attributes: { name: topic }
                    }
                });
                console.log(`Subscribed to topic: ${topic}`);
            } catch (topicErr: any) {
                // Don't fail the entire init if one topic errors (e.g. unsupported/already subscribed)
                console.warn(`Failed to subscribe to topic ${topic}:`, topicErr.message);
            }
        }

        // 4. Store the authenticity secret for webhook signature verification
        const secret = newSub?.attributes?.authenticity_secret;
        if (secret) {
            console.log('Storing webhook secret...');
            await setDoc(doc(db, 'system_settings', 'pco_webhooks'), {
                secret,
                updatedAt: new Date().toISOString(),
                endpoint: webhookEndpoint,
                subscriptionId
            }, { merge: true });
            console.log('Webhook secret stored successfully.');
        } else {
            console.warn('No authenticity_secret in response. Webhook verification may fail.');
        }

    } catch (error) {
        console.error('Failed to initialize webhooks:', error);
        throw error;
    }
};
