import { RestClient } from '@signalwire/compatibility-api';
import https from 'https';
import { getDb } from './firebase';

/**
 * Returns a SignalWire RestClient initialised with credentials stored in
 * Firestore system/settings.  The client exposes the same API surface as the
 * Twilio Node.js SDK — messages.create(), incomingPhoneNumbers.create(),
 * availablePhoneNumbers(), etc. — so all existing call patterns work unchanged.
 */
export async function getSignalWireClient(): Promise<any> {
    const snap = await getDb().doc('system/settings').get();
    const data  = snap.data() || {};

    const projectId = (data.signalwireProjectId  || '').trim();
    const apiToken  = (data.signalwireApiToken   || '').trim();
    const spaceUrl  = (data.signalwireSpaceUrl   || '').trim();

    if (!projectId || !apiToken || !spaceUrl) {
        throw new Error(
            'SignalWire credentials are not fully configured in System Settings. ' +
            'Please set signalwireProjectId, signalwireApiToken, and signalwireSpaceUrl.'
        );
    }

    return RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });
}

/** Read the webhook base URL (same logic as before, provider-neutral field first). */
export async function getSmsWebhookBaseUrl(): Promise<string | null> {
    try {
        const snap = await getDb().doc('system/settings').get();
        const data  = snap.data() || {};
        const base  = (
            data.smsWebhookBaseUrl  ||   // new field name
            data.twilioWebhookBaseUrl || // legacy fallback during transition
            data.apiBaseUrl             ||
            process.env.SERVER_BASE_URL ||
            ''
        ).replace(/\/$/, '');
        if (!base || !base.startsWith('https://')) return null;
        return base;
    } catch {
        return null;
    }
}

/**
 * Returns the SignalWire Signing Key used to verify inbound webhook signatures.
 * Found in SignalWire Dashboard → API → API Credentials → Signing Key.
 * Store in Firestore system/settings as "signalwireSigningKey".
 * Returns null if not yet configured (signature validation will be skipped with a warning).
 */
export async function getSignalWireSigningKey(): Promise<string | null> {
    try {
        const snap = await getDb().doc('system/settings').get();
        const key  = (snap.data() || {}).signalwireSigningKey || '';
        return key.trim() || null;
    } catch {
        return null;
    }
}

/**
 * Returns the TCR Campaign SID that all provisioned numbers should be auto-assigned to.
 * Set once by Barnabas Software in System Settings after completing brand/campaign registration
 * in the SignalWire Dashboard (Messaging Campaigns tab).
 * Returns null if not yet configured.
 */
export async function getSignalWireCampaignId(): Promise<string | null> {
    try {
        const snap = await getDb().doc('system/settings').get();
        const id   = (snap.data() || {}).signalwireCampaignId || '';
        return id.trim() || null;
    } catch {
        return null;
    }
}

/**
 * Makes an authenticated REST API call to the SignalWire platform API
 * (non-Compatibility endpoints such as TCR campaign assignment).
 *
 * Base URL: https://{spaceUrl}/api/rest/...
 * Auth: HTTP Basic with projectId:apiToken
 */
export async function callSignalWireApi(
    path: string,
    method: 'GET' | 'POST' | 'DELETE' = 'POST',
    body?: Record<string, unknown>
): Promise<any> {
    const snap      = await getDb().doc('system/settings').get();
    const data      = snap.data() || {};
    const projectId = (data.signalwireProjectId || '').trim();
    const apiToken  = (data.signalwireApiToken  || '').trim();
    const spaceUrl  = (data.signalwireSpaceUrl  || '').trim();

    if (!projectId || !apiToken || !spaceUrl) {
        throw new Error('SignalWire credentials are not fully configured in System Settings.');
    }

    const url       = `https://${spaceUrl}/api/rest${path}`;
    const authHeader = 'Basic ' + Buffer.from(`${projectId}:${apiToken}`).toString('base64');
    const payload   = body ? JSON.stringify(body) : undefined;

    return new Promise((resolve, reject) => {
        const urlObj  = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path:     urlObj.pathname + urlObj.search,
            method,
            headers: {
                'Authorization': authHeader,
                'Content-Type':  'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload).toString() } : {}),
            },
        };

        const reqHttp = https.request(options, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(raw);
                    if ((res.statusCode || 0) >= 400) {
                        reject(new Error(`SignalWire API ${method} ${path} returned ${res.statusCode}: ${JSON.stringify(parsed)}`) );
                    } else {
                        resolve(parsed);
                    }
                } catch {
                    reject(new Error(`SignalWire API non-JSON response (${res.statusCode}): ${raw.slice(0, 200)}`));
                }
            });
        });

        reqHttp.on('error', reject);
        if (payload) reqHttp.write(payload);
        reqHttp.end();
    });
}
