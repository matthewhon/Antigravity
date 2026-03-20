import { firestore } from './firestoreService';
import { doc, setDoc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

// Helper to get system settings and proxy URL
const getProxyUrl = async () => {
    // In development, always use the local server
    if (import.meta.env.DEV) {
        return '/pco/proxy';
    }

    const settings = await firestore.getSystemSettings();
    // Use the configured URL or fallback to default
    const baseUrl = settings.apiBaseUrl || 'https://api.pastoralcare.barnabassoftware.com';
    return `${baseUrl}/pco/proxy`;
};

// Helper to fetch from PCO via proxy
async function pcoFetch(churchId: string, endpoint: string, method: string = 'GET', body?: any) {
    const proxyUrl = await getProxyUrl();
    // Ensure no double slashes if endpoint has leading slash
    const cleanEndpoint = endpoint.startsWith('/') ? endpoint.substring(1) : endpoint;

    const response = await fetch(proxyUrl, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            churchId,
            url: `https://api.planningcenteronline.com/${cleanEndpoint}`,
            method,
            body // Pass the body for POST/PATCH
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
    // Ensure we use the correct backend URL for webhooks
    // If we are in dev, we might need a tunnel, but for this environment, we use the appUrl.
    // However, if the appUrl is the frontend URL, and the backend is on the same domain (which it is for this setup),
    // then /pco/webhook is correct.
    const webhookEndpoint = `${appUrl}/pco/webhook`; 

    const topics = [
        'people.v2.events.person.created',
        'people.v2.events.person.updated',
        'giving.v2.events.donation.created',
        'services.v2.events.plan_person.updated',
        'services.v2.events.needed_position.updated'
    ];

    console.log(`Initializing Webhooks for endpoint: ${webhookEndpoint}`);

    try {
        // 1. Check existing subscriptions
        const existingSubsResponse = await pcoFetch(churchId, 'webhooks/v2/subscriptions');
        const existingSubs = existingSubsResponse.data || [];

        // Filter for our endpoint
        const mySub = existingSubs.find((sub: any) => sub.attributes.url === webhookEndpoint || sub.attributes.endpoint_url === webhookEndpoint);

        if (mySub) {
            console.log('Found existing subscription:', mySub.id);
            // Check if active
            if (!mySub.attributes.active) {
                console.log('Subscription inactive, activating...');
                await pcoFetch(churchId, `webhooks/v2/subscriptions/${mySub.id}`, 'PATCH', {
                    data: {
                        type: 'Subscription',
                        id: mySub.id,
                        attributes: { active: true }
                    }
                });
            }
            
            // Check if we have the secret stored locally
            const settingsDoc = await getDoc(doc(db, 'system_settings', 'pco_webhooks'));
            if (!settingsDoc.exists() || !settingsDoc.data().secret) {
                console.warn('Existing subscription found but no local secret. Re-creating subscription...');
                // Delete and Re-create to get a new secret
                await pcoFetch(churchId, `webhooks/v2/subscriptions/${mySub.id}`, 'DELETE');
                // Proceed to create new (fall through to else block logic by setting mySub to null? No, better to just run creation logic)
                // We'll just continue to creation logic below
            } else {
                console.log('Subscription exists and secret is stored. Verifying topics...');
                // Ideally we verify topics here, but for now we assume they are correct or handled manually if changed.
                return; 
            }
        }

        // 2. Create new subscription (or re-create)
        console.log('Creating new subscription...');
        const payload = {
            data: {
                type: 'Subscription',
                attributes: {
                    url: webhookEndpoint,
                    active: true
                },
                relationships: {
                    events: {
                        data: topics.map(topic => ({ type: 'Event', id: topic }))
                    }
                }
            }
        };

        const createResponse = await pcoFetch(churchId, 'webhooks/v2/subscriptions', 'POST', payload);
        const newSub = createResponse.data;
        
        // 3. Store the secret
        // The secret is in attributes.authenticity_secret
        const secret = newSub.attributes?.authenticity_secret;
        
        if (secret) {
            console.log('Received Webhook Secret. Storing...');
            // Store in Firestore
            await setDoc(doc(db, 'system_settings', 'pco_webhooks'), {
                secret: secret,
                updatedAt: new Date().toISOString(),
                endpoint: webhookEndpoint
            }, { merge: true });
            console.log('Webhook secret stored successfully.');
        } else {
            console.warn('No authenticity_secret found in response. Webhook verification might fail.');
        }

    } catch (error) {
        console.error('Failed to initialize webhooks:', error);
        throw error;
    }
};
