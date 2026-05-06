import { RestClient } from '@signalwire/compatibility-api';
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
