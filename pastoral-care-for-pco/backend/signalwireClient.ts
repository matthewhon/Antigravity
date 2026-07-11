import { RestClient } from '@signalwire/compatibility-api';
import https from 'https';
import { getDb } from './firebase';

/**
 * Sanitize the SignalWire Space URL to prevent malformed API URLs.
 * Handles common admin input mistakes:
 *   - "https://demo.signalwire.com" → "demo.signalwire.com"
 *   - "demo.signalwire.com/"        → "demo.signalwire.com"
 *   - "  demo.signalwire.com  "      → "demo.signalwire.com"
 *
 * Per SignalWire Core API Base URL spec, the space URL is just the hostname
 * (e.g., "demo.signalwire.com"), and the scheme is added by the caller.
 */
function sanitizeSpaceUrl(raw: string): string {
    return raw
        .trim()
        .replace(/^https?:\/\//i, '')   // Strip scheme if accidentally included
        .replace(/\/+$/, '');            // Strip trailing slashes
}

/**
 * Returns a SignalWire RestClient initialised with credentials stored in
 * Firestore system/settings.  The client exposes the same API surface as the
 * Twilio Node.js SDK — messages.create(), incomingPhoneNumbers.create(),
 * availablePhoneNumbers(), etc. — so all existing call patterns work unchanged.
 */
export async function getSignalWireClient(): Promise<any> {
    if (process.env.MOCK_SMS === 'true') {
        return {
            messages: {
                create: async (params: any) => {
                    console.log('--- [MOCK SMS SENT] ---');
                    console.log('To:', params.to);
                    console.log('From:', params.from);
                    console.log('Body:', params.body);
                    console.log('------------------------');
                    return { sid: 'mock_sid_' + Math.random().toString(36).slice(2, 10), status: 'sent' };
                }
            }
        };
    }

    const snap = await getDb().doc('system/settings').get();
    const data  = snap.data() || {};

    const projectId = (data.signalwireProjectId  || '').trim();
    const apiToken  = (data.signalwireApiToken   || '').trim();
    const spaceUrl  = sanitizeSpaceUrl(data.signalwireSpaceUrl || '');

    if (!projectId || !apiToken || !spaceUrl) {
        throw new Error(
            'SignalWire credentials are not fully configured in System Settings. ' +
            'Please set signalwireProjectId, signalwireApiToken, and signalwireSpaceUrl.'
        );
    }

    return RestClient(projectId, apiToken, { signalwireSpaceUrl: spaceUrl });
}

/**
 * Validates that the configured SignalWire API token has the minimum required
 * permissions. Call on server startup to catch misconfiguration early.
 * Required token scopes: messaging, numbers, management.
 */
export async function validateSignalWireCredentials(): Promise<{ valid: boolean; error?: string }> {
    try {
        const client = await getSignalWireClient();
        // Minimal read-only call to verify the token works and has number-read scope
        await client.incomingPhoneNumbers.list({ limit: 1 });
        return { valid: true };
    } catch (e: any) {
        if (e.status === 401 || e.message?.includes('401')) {
            return {
                valid: false,
                error: 'SignalWire API token is invalid or missing required scopes (messaging, numbers, management). '
                     + 'Check API Credentials in the SignalWire Dashboard.',
            };
        }
        return { valid: false, error: e.message };
    }
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
    const spaceUrl  = sanitizeSpaceUrl(data.signalwireSpaceUrl || '');

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
    const spaceUrl  = sanitizeSpaceUrl(data.signalwireSpaceUrl || '');

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

/**
 * Fetches all pages from a paginated SignalWire REST endpoint.
 * Follows the `links.next` pattern per the Core API paging spec:
 *   { "links": { "self": "...", "next": "...", ... }, "data": [...] }
 *
 * @param path  Initial path (e.g. '/brands')
 * @returns     Flat array of all items across all pages
 */
export async function callRegistryApiPaginated(
    path: string,
): Promise<any[]> {
    const allData: any[] = [];
    let currentPath: string | null = path;

    while (currentPath) {
        const result = await callRegistryApi(currentPath, 'GET');
        if (Array.isArray(result.data)) {
            allData.push(...result.data);
        } else if (result.data) {
            allData.push(result.data);
        }
        // Follow the pagination link if present; stop if there's no next page
        currentPath = result.links?.next || null;
    }

    return allData;
}

/**
 * Downloads a SignalWire MMS media URL with HTTP Basic auth and returns the
 * raw buffer and content-type.  Used to re-host inbound MMS attachments in
 * Firebase Storage so they are accessible without SignalWire credentials.
 *
 * SignalWire's redirect chain for MMS media:
 *   1. Authenticated GET to /api/laml/.../Media/...
 *   2. 302 → https://files.signalwire.com/.../message-media/xxxx.smil
 *   3. The .smil file contains a relative <img src="actualfile.JPG"> reference
 *   4. Actual image at https://files.signalwire.com/.../message-media/actualfile.JPG
 *
 * @param mediaUrl  The raw SignalWire MediaUrl (e.g. https://space.signalwire.com/api/laml/…)
 * @returns  { buffer, contentType } or throws on error
 */
export async function fetchSignalWireMedia(
    mediaUrl: string
): Promise<{ buffer: Buffer; contentType: string }> {
    const data      = await getSystemSettings();
    const projectId = (data.signalwireProjectId || '').trim();
    const apiToken  = (data.signalwireApiToken  || '').trim();

    if (!projectId || !apiToken) {
        throw new Error('SignalWire credentials are not configured — cannot fetch media.');
    }

    const authHeader = 'Basic ' + Buffer.from(`${projectId}:${apiToken}`).toString('base64');

    /** Fetch a URL, optionally with auth. Returns { buffer, contentType, location? } */
    function fetchRaw(url: string, withAuth: boolean): Promise<{ buffer: Buffer; contentType: string; statusCode: number; location?: string }> {
        return new Promise((resolve, reject) => {
            const urlObj = new URL(url);
            const req = https.request({
                hostname: urlObj.hostname,
                path:     urlObj.pathname + urlObj.search,
                method:   'GET',
                headers:  withAuth ? { Authorization: authHeader } : {},
            }, (res) => {
                const statusCode = res.statusCode || 0;
                const contentType = ((res.headers['content-type'] || 'application/octet-stream').split(';')[0]).trim();
                const location = res.headers.location as string | undefined;

                if (statusCode === 301 || statusCode === 302) {
                    res.resume();
                    resolve({ buffer: Buffer.alloc(0), contentType, statusCode, location });
                    return;
                }
                if (statusCode >= 400) {
                    res.resume();
                    reject(new Error(`HTTP ${statusCode} fetching ${url}`));
                    return;
                }
                const chunks: Buffer[] = [];
                res.on('data', (c: Buffer) => chunks.push(c));
                res.on('end', () => resolve({ buffer: Buffer.concat(chunks), contentType, statusCode }));
                res.on('error', reject);
            });
            req.on('error', reject);
            req.end();
        });
    }

    // Step 1: Authenticated fetch of the SignalWire API media URL
    let result = await fetchRaw(mediaUrl, true);

    // Step 2: Follow redirect (302 → files.signalwire.com/.../*.smil or direct image)
    if ((result.statusCode === 301 || result.statusCode === 302) && result.location) {
        const redirectUrl = result.location;
        result = await fetchRaw(redirectUrl, false);

        // Step 3: If the redirect target is a SMIL playlist, parse out the actual image URL
        if (result.contentType.includes('smil') || redirectUrl.endsWith('.smil')) {
            const smilText = result.buffer.toString('utf8');
            // Extract src attribute: <img src="filename.JPG" .../>
            const srcMatch = smilText.match(/<img[^>]+src="([^"]+)"/i)
                          || smilText.match(/<video[^>]+src="([^"]+)"/i);
            if (!srcMatch) {
                throw new Error(`Could not parse media URL from SMIL: ${smilText.slice(0, 200)}`);
            }
            // Resolve relative to the SMIL URL's directory
            const smilBase = redirectUrl.substring(0, redirectUrl.lastIndexOf('/') + 1);
            const actualUrl = srcMatch[1].startsWith('http') ? srcMatch[1] : smilBase + srcMatch[1];
            result = await fetchRaw(actualUrl, false);
        }
    }

    return { buffer: result.buffer, contentType: result.contentType };
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
    const status  = result.state || result.status || 'pending';

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
    const status = (result.state || result.status || 'pending').toLowerCase();

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
    sample3?:        string;
    sample4?:        string;
    sample5?:        string;
    messageFlow:     string;   // opt-in description
    optOutMessage:   string;
    optInMessage?:   string;
    helpMessage:     string;
    consentFormUrl?: string;
    firstMessageConfirmation?: string;
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
        message_flow:      payload.consentFormUrl ? `${payload.messageFlow}\n\nConsent Form Link: ${payload.consentFormUrl}` : payload.messageFlow,
        opt_out_message:   payload.optOutMessage,
        help_message:      payload.helpMessage,
        terms_and_conditions: true,
        number_pooling_required: false,
        direct_lending: false,
        embedded_link: true,
        embedded_phone: true,
        age_gated_content: false,
        lead_generation: false,
    };
    if (payload.optInMessage) body.opt_in_message = payload.optInMessage;
    if (payload.sample2) body.sample2 = payload.sample2;
    if (payload.sample3) body.sample3 = payload.sample3;
    if (payload.sample4) body.sample4 = payload.sample4;
    if (payload.sample5) body.sample5 = payload.sample5;
    if (payload.subUsecases && payload.subUsecases.length > 0) body.sub_use_cases = payload.subUsecases;
    if (webhookUrl) body.webhook_url = webhookUrl;

    const result = await callRegistryApi(`/brands/${payload.brandId}/campaigns`, 'POST', body);

    const campaignId = result.id || result.campaign_id || '';
    const status     = result.state || result.status || 'pending';

    const updateData: Record<string, any> = {
        'smsSettings.campaignId':          campaignId,
        'smsSettings.campaignStatus':       status.toLowerCase(),
        'smsSettings.campaignUsecase':      payload.usecase,
        'smsSettings.campaignSubUsecases':  payload.subUsecases || [],
        'smsSettings.campaignDescription':  payload.description,
        'smsSettings.campaignSample1':     payload.sample1,
        'smsSettings.campaignSample2':     payload.sample2 || null,
        'smsSettings.campaignMessageFlow': payload.messageFlow,
        'smsSettings.campaignSubmittedAt': Date.now(),
    };
    if (payload.firstMessageConfirmation) {
        updateData['smsSettings.firstMessageConfirmation'] = payload.firstMessageConfirmation;
    }

    await db.collection('churches').doc(churchId).update(updateData);

    return { campaignId, status };
}

/**
 * Check the current status of a church's 10DLC Campaign registration.
 * GET /api/relay/rest/registry/beta/campaigns/:campaignId
 * Updates churches/{churchId}.smsSettings.campaignStatus in Firestore.
 */
export async function checkCampaignStatus(churchId: string, campaignId: string): Promise<{ status: string; raw: any }> {
    const result = await callRegistryApi(`/campaigns/${campaignId}`, 'GET');
    const status = (result.state || result.status || 'pending').toLowerCase();

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
    const status  = result.state || result.status || 'pending';

    return { orderId, status };
}

/**
 * Check the status of a specific campaign number assignment order.
 * GET /api/relay/rest/registry/beta/campaigns/:campaignId/orders/:orderId
 */
export async function checkAssignmentOrder(campaignId: string, orderId: string): Promise<{ status: string; raw: any }> {
    const result = await callRegistryApi(`/campaigns/${campaignId}/orders/${orderId}`, 'GET');
    const status = (result.state || result.status || 'pending').toLowerCase();
    return { status, raw: result };
}

