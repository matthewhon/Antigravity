import { firestore } from './firestoreService';
import { doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';

// Helper to get the backend proxy URL
const getProxyUrl = async () => {
    if (import.meta.env.DEV) {
        return '/pco/proxy';
    }
    const settings = await firestore.getSystemSettings();
    const baseUrl = settings.apiBaseUrl || 'https://pastoral-care-for-pco-u3gnt7kb5a-uc.a.run.app';
    return `${baseUrl}/pco/proxy`;
};

// Helper to fetch from PCO via the backend proxy
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

/**
 * PCO Webhooks v2 Structure:
 * - Each `Subscription` resource represents ONE event type.
 * - The `name` attribute is the event topic (e.g. 'people.v2.events.person.created').
 * - The `url` attribute is the callback endpoint.
 * - To subscribe to 5 topics, we create 5 separate Subscription objects.
 *
 * Correct POST body:
 * {
 *   data: {
 *     type: 'Subscription',
 *     attributes: { name: 'people.v2.events.person.created', url: '...', active: true }
 *   }
 * }
 */
export const initializeWebhooks = async (churchId: string) => {
    const settings = await firestore.getSystemSettings();
    const backendUrl = settings.apiBaseUrl || 'https://pastoral-care-for-pco-u3gnt7kb5a-uc.a.run.app';

    // Webhooks must point to the BACKEND server endpoint, not the frontend SPA URL
    const webhookUrl = `${backendUrl}/pco/webhook`;

    // PCO Webhooks v2 event topic names
    const topics = [
        'people.v2.events.person.created',
        'people.v2.events.person.updated',
        'giving.v2.events.donation.created',
        'services.v2.events.plan_person.updated',
        // Real-time incremental sync — avoids full re-syncs after first load
        'check_ins.v2.events.check_in.created',
        'groups.v2.events.group_attendance.created',
    ];

    console.log(`[Webhooks] Initializing subscriptions → ${webhookUrl}`);

    try {
        // 1. Fetch all existing subscriptions for this account
        const existingResponse = await pcoFetch(churchId, 'webhooks/v2/subscriptions');
        const existingSubs: any[] = existingResponse?.data || [];

        // Build a set of already-subscribed topic+url combos
        const alreadySubscribed = new Set(
            existingSubs
                .filter((s: any) => s.attributes.url === webhookUrl)
                .map((s: any) => s.attributes.name)
        );

        console.log(`[Webhooks] Found ${existingSubs.length} existing subscriptions. Already subscribed topics:`, [...alreadySubscribed]);

        const createdSecrets: Record<string, string> = {};
        let subscriptionCount = 0;

        // 2. For each topic, create a subscription if not already subscribed
        for (const topic of topics) {
            if (alreadySubscribed.has(topic)) {
                console.log(`[Webhooks] Already subscribed to: ${topic}`);
                continue;
            }

            try {
                console.log(`[Webhooks] Subscribing to: ${topic}`);
                const createResponse = await pcoFetch(churchId, 'webhooks/v2/subscriptions', 'POST', {
                    data: {
                        type: 'Subscription',
                        attributes: {
                            name: topic,
                            url: webhookUrl,
                            active: true
                        }
                    }
                });

                const newSub = createResponse?.data;
                const secret = newSub?.attributes?.authenticity_secret;
                if (secret) {
                    createdSecrets[topic] = secret;
                }
                subscriptionCount++;
                console.log(`[Webhooks] ✓ Subscribed to: ${topic}`);
            } catch (err: any) {
                console.warn(`[Webhooks] Failed to subscribe to ${topic}:`, err.message);
            }
        }

        // 3. Store the first secret we received (all topics under same app share the same secret)
        const secret = Object.values(createdSecrets)[0];
        if (secret) {
            await setDoc(doc(db, 'system_settings', 'pco_webhooks'), {
                secret,
                updatedAt: new Date().toISOString(),
                endpoint: webhookUrl,
            }, { merge: true });
            console.log('[Webhooks] Secret stored successfully.');
        }

        if (subscriptionCount > 0) {
            console.log(`[Webhooks] Created ${subscriptionCount} new subscription(s).`);
        } else {
            console.log('[Webhooks] All topics already subscribed.');
        }

    } catch (error) {
        console.error('[Webhooks] Failed to initialize webhooks:', error);
        throw error;
    }
};
