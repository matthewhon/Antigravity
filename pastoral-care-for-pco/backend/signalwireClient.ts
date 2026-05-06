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
 * Returns the per-church TCR Campaign ID stored in the church's own smsSettings.
 * Falls back to the global system-level signalwireCampaignId for legacy tenants
 * that haven't yet completed per-tenant registration.
 */
export async function getChurchCampaignId(churchId: string): Promise<string | null> {
    try {
        const db = getDb();

        // Prefer per-church campaign ID
        const churchSnap = await db.collection('churches').doc(churchId).get();
        const churchCampaignId = ((churchSnap.data() || {}).smsSettings?.campaignId || '').trim();
        if (churchCampaignId) return churchCampaignId;

        // Legacy fallback: global shared campaign from System Settings
        const sysSnap = await db.doc('system/settings').get();
        const globalCampaignId = ((sysSnap.data() || {}).signalwireCampaignId || '').trim();
        return globalCampaignId || null;
    } catch {
        return null;
    }
}

/**
 * @deprecated Use getChurchCampaignId(churchId) for per-tenant campaigns.
 * Kept for backward compatibility — reads the global shared campaign ID from System Settings.
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

// ─── System Settings helpers ─────────────────────────────────────────────────

async function getSystemSettings(): Promise<Record<string, any>> {
    const snap = await getDb().doc('system/settings').get();
    return snap.data() || {};
}

// ─── Generic authenticated HTTPS call to SignalWire REST ─────────────────────

/**
 * Makes an authenticated REST API call to the SignalWire Compatibility REST API.
 * Base URL: https://{spaceUrl}/api/rest/...
 * Auth: HTTP Basic with projectId:apiToken
 */
export async function callSignalWireApi(
    path: string,
    method: 'GET' | 'POST' | 'DELETE' = 'POST',
    body?: Record<string, unknown>
): Promise<any> {
    const data      = await getSystemSettings();
    const projectId = (data.signalwireProjectId || '').trim();
    const apiToken  = (data.signalwireApiToken  || '').trim();
    const spaceUrl  = (data.signalwireSpaceUrl  || '').trim();

    if (!projectId || !apiToken || !spaceUrl) {
        throw new Error('SignalWire credentials are not fully configured in System Settings.');
    }

    return _httpsRequest(`https://${spaceUrl}/api/rest${path}`, method, projectId, apiToken, body);
}

/**
 * Makes an authenticated REST API call to the SignalWire Campaign Registry (10DLC) API.
 * Base URL: https://{spaceUrl}/api/relay/rest/registry/beta/...
 * Auth: HTTP Basic with projectId:apiToken
 *
 * @see https://developer.signalwire.com/rest/signalwire-rest/endpoints/campaign-registry/
 */
export async function callRegistryApi(
    path: string,
    method: 'GET' | 'POST' | 'DELETE' = 'POST',
    body?: Record<string, unknown>
): Promise<any> {
    const data      = await getSystemSettings();
    const projectId = (data.signalwireProjectId || '').trim();
    const apiToken  = (data.signalwireApiToken  || '').trim();
    const spaceUrl  = (data.signalwireSpaceUrl  || '').trim();

    if (!projectId || !apiToken || !spaceUrl) {
        throw new Error('SignalWire credentials are not fully configured in System Settings.');
    }

    return _httpsRequest(
        `https://${spaceUrl}/api/relay/rest/registry/beta${path}`,
        method,
        projectId,
        apiToken,
        body
    );
}

/** Shared HTTPS request helper with Basic auth. */
function _httpsRequest(
    url: string,
    method: 'GET' | 'POST' | 'DELETE',
    username: string,
    password: string,
    body?: Record<string, unknown>
): Promise<any> {
    const authHeader = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');
    const payload    = body ? JSON.stringify(body) : undefined;

    return new Promise((resolve, reject) => {
        const urlObj  = new URL(url);
        const options = {
            hostname: urlObj.hostname,
            path:     urlObj.pathname + urlObj.search,
            method,
            headers: {
                'Authorization': authHeader,
                'Content-Type':  'application/json',
                'Accept':        'application/json',
                ...(payload ? { 'Content-Length': Buffer.byteLength(payload).toString() } : {}),
            },
        };

        const req = https.request(options, (res) => {
            let raw = '';
            res.on('data', (chunk) => { raw += chunk; });
            res.on('end', () => {
                try {
                    const parsed = JSON.parse(raw);
                    if ((res.statusCode || 0) >= 400) {
                        reject(new Error(
                            `SignalWire API ${method} ${urlObj.pathname} returned ${res.statusCode}: ${JSON.stringify(parsed)}`
                        ));
                    } else {
                        resolve(parsed);
                    }
                } catch {
                    reject(new Error(
                        `SignalWire API non-JSON response (${res.statusCode}): ${raw.slice(0, 200)}`
                    ));
                }
            });
        });

        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

// ─── 10DLC Brand Registration ─────────────────────────────────────────────────

export interface BrandRegistrationPayload {
    legalName:       string;   // company_name
    ein:             string;
    legalEntityType: 'PRIVATE_PROFIT' | 'PUBLIC_PROFIT' | 'NON_PROFIT' | 'GOVERNMENT' | 'SOLE_PROPRIETOR';
    contactEmail:    string;
    contactPhone:    string;
    website:         string;
    address:         string;
    city:            string;
    state:           string;
    zip:             string;
}

/**
 * Register a 10DLC Brand for a church tenant via the SignalWire Campaign Registry API.
 * Writes brandId and brandStatus to churches/{churchId}.smsSettings on success.
 *
 * POST /api/relay/rest/registry/beta/brands
 */
export async function registerTenantBrand(
    churchId: string,
    payload: BrandRegistrationPayload
): Promise<{ brandId: string; status: string }> {
    const db = getDb();

    const result = await callRegistryApi('/brands', 'POST', {
        name:                payload.legalName,
        company_name:        payload.legalName,
        contact_email:       payload.contactEmail,
        contact_phone:       payload.contactPhone,
        ein_issuing_country: 'United States',
        legal_entity_type:   payload.legalEntityType,
        ein:                 payload.ein,
        company_address:     `${payload.address}, ${payload.city}, ${payload.state} ${payload.zip}`,
        company_website:     payload.website,
    });

    const brandId = result.id || result.brand_id || '';
    const status  = result.status || 'pending';

    await db.collection('churches').doc(churchId).update({
        'smsSettings.brandId':              brandId,
        'smsSettings.brandStatus':          status.toLowerCase(),
        'smsSettings.brandLegalName':       payload.legalName,
        'smsSettings.brandEin':             payload.ein,
        'smsSettings.brandLegalEntityType': payload.legalEntityType,
        'smsSettings.brandContactEmail':    payload.contactEmail,
        'smsSettings.brandContactPhone':    payload.contactPhone,
        'smsSettings.brandWebsite':         payload.website,
        'smsSettings.brandAddress':         payload.address,
        'smsSettings.brandCity':            payload.city,
        'smsSettings.brandState':           payload.state,
        'smsSettings.brandZip':             payload.zip,
        'smsSettings.brandSubmittedAt':     Date.now(),
    });

    return { brandId, status };
}

/**
 * Check the current status of a church's 10DLC Brand registration.
 * GET /api/relay/rest/registry/beta/brands/:brandId
 * Updates churches/{churchId}.smsSettings.brandStatus in Firestore.
 */
export async function checkBrandStatus(churchId: string, brandId: string): Promise<{ status: string; raw: any }> {
    const result = await callRegistryApi(`/brands/${brandId}`, 'GET');
    const status = (result.status || 'pending').toLowerCase();

    await getDb().collection('churches').doc(churchId).update({
        'smsSettings.brandStatus': status,
    });

    return { status, raw: result };
}

// ─── 10DLC Campaign Registration ──────────────────────────────────────────────

export interface CampaignRegistrationPayload {
    brandId:         string;
    name:            string;
    usecase:         string;   // e.g. 'MIXED', 'CUSTOMER_CARE', '2FA'
    subUsecases?:    string[]; // Required if usecase is 'MIXED' or 'LOW_VOLUME'
    description:     string;
    sample1:         string;
    sample2?:        string;
    messageFlow:     string;   // opt-in description
    optOutMessage:   string;
    helpMessage:     string;
}

/**
 * Register a 10DLC Campaign for a church tenant.
 * Writes campaignId and campaignStatus to churches/{churchId}.smsSettings on success.
 *
 * POST /api/relay/rest/registry/beta/brands/:brandId/campaigns
 */
export async function registerTenantCampaign(
    churchId: string,
    payload: CampaignRegistrationPayload
): Promise<{ campaignId: string; status: string }> {
    const db = getDb();

    const baseUrl = await getSmsWebhookBaseUrl();
    const webhookUrl = baseUrl ? `${baseUrl}/api/messaging/campaign-status` : undefined;

    const body: Record<string, unknown> = {
        name:              payload.name,
        brand_id:          payload.brandId,
        sms_use_case:      payload.usecase,
        description:       payload.description,
        sample1:           payload.sample1,
        message_flow:      payload.messageFlow,
        opt_out_message:   payload.optOutMessage,
        help_message:      payload.helpMessage,
        terms_and_conditions: true,
    };
    if (payload.sample2) body.sample2 = payload.sample2;
    if (payload.subUsecases && payload.subUsecases.length > 0) body.sub_usecases = payload.subUsecases;
    if (webhookUrl) body.webhook_url = webhookUrl;

    const result = await callRegistryApi(`/brands/${payload.brandId}/campaigns`, 'POST', body);

    const campaignId = result.id || result.campaign_id || '';
    const status     = result.status || 'pending';

    await db.collection('churches').doc(churchId).update({
        'smsSettings.campaignId':          campaignId,
        'smsSettings.campaignStatus':       status.toLowerCase(),
        'smsSettings.campaignUsecase':      payload.usecase,
        'smsSettings.campaignSubUsecases':  payload.subUsecases || [],
        'smsSettings.campaignDescription':  payload.description,
        'smsSettings.campaignSample1':     payload.sample1,
        'smsSettings.campaignSample2':     payload.sample2 || null,
        'smsSettings.campaignMessageFlow': payload.messageFlow,
        'smsSettings.campaignSubmittedAt': Date.now(),
    });

    return { campaignId, status };
}

/**
 * Check the current status of a church's 10DLC Campaign registration.
 * GET /api/relay/rest/registry/beta/campaigns/:campaignId
 * Updates churches/{churchId}.smsSettings.campaignStatus in Firestore.
 */
export async function checkCampaignStatus(churchId: string, campaignId: string): Promise<{ status: string; raw: any }> {
    const result = await callRegistryApi(`/campaigns/${campaignId}`, 'GET');
    const status = (result.status || 'pending').toLowerCase();

    await getDb().collection('churches').doc(churchId).update({
        'smsSettings.campaignStatus': status,
    });

    return { status, raw: result };
}

/**
 * Assign phone numbers to a church's TCR campaign.
 * POST /api/relay/rest/registry/beta/campaigns/:campaignId/orders
 *
 * @param campaignId  The church's own TCR Campaign UUID
 * @param phoneNumbers  Array of E.164 phone numbers to assign
 */
export async function assignNumbersToCampaign(
    campaignId: string,
    phoneNumbers: string[]
): Promise<{ orderId: string; status: string }> {
    const baseUrl = await getSmsWebhookBaseUrl();
    const webhookUrl = baseUrl ? `${baseUrl}/api/messaging/assignment-status` : undefined;

    const body: Record<string, unknown> = {
        phone_numbers: phoneNumbers,
    };
    if (webhookUrl) body.webhook_url = webhookUrl;

    const result = await callRegistryApi(`/campaigns/${campaignId}/orders`, 'POST', body);

    const orderId = result.id || result.order_id || '';
    const status  = result.status || 'pending';

    return { orderId, status };
}
