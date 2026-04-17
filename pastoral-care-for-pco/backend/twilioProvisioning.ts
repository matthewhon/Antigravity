import twilio from 'twilio';
import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getMasterCredentials(db: any): Promise<{ accountSid: string; authToken: string }> {
    const snap = await db.doc('system/settings').get();
    const data = snap.data() || {};
    const accountSid = data.twilioMasterAccountSid || '';
    const authToken  = data.twilioMasterAuthToken  || '';
    if (!accountSid || !authToken) {
        throw new Error('Twilio master credentials are not configured in System Settings (twilioMasterAccountSid / twilioMasterAuthToken).');
    }
    return { accountSid, authToken };
}

function getMasterClient(accountSid: string, authToken: string) {
    return twilio(accountSid, authToken);
}

// ─── GET /api/messaging/available-numbers ────────────────────────────────────
// Cascading locality search — always tries to stay as close to the city as possible.
//
// City+state search cascade:
//   1. Exact city + state   (inLocality + inRegion)
//   2. If 0: city only      (inLocality, any state)  – maybe the spelling differs by state
//   3. If still 0: returns 0 results + canExpand=true  (frontend offers a manual "try state" button)
//
// Area code search: straightforward, returns up to 100.
//
// Returns full result set (up to 100); frontend handles paging.

export const getAvailableNumbers = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const { areaCode, city, state, churchId } = req.query as Record<string, string>;

    if (!churchId) {
        return res.status(400).json({ error: 'Missing churchId' });
    }
    if (!areaCode && !state && !city) {
        return res.status(400).json({ error: 'Provide areaCode, or city+state, or state.' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const { accountSid, authToken } = await getMasterCredentials(db);
        const master = getMasterClient(accountSid, authToken);
        const phoneApi = master.availablePhoneNumbers('US').local;

        const FETCH_LIMIT = 100; // Twilio allows up to 1000 but 100 is plenty for UX

        let numbers: any[] = [];
        let searchMode     = '';
        let canExpand      = false;   // true when city search returned 0 — frontend shows manual "try state" button

        if (areaCode) {
            // ── Area Code mode ────────────────────────────────────────────
            searchMode = `area code ${areaCode}`;
            numbers = await phoneApi.list({
                areaCode:   Number(areaCode),
                smsEnabled: true,
                limit:      FETCH_LIMIT,
            });

        } else {
            const filterCity  = (city  || '').trim();
            const filterState = (state || '').trim().toUpperCase();

            if (filterCity && filterState) {
                // ── Step 1: exact city + state ────────────────────────────
                searchMode = `${filterCity}, ${filterState}`;
                numbers = await phoneApi.list({
                    inLocality:  filterCity,
                    inRegion:    filterState,
                    smsEnabled:  true,
                    limit:       FETCH_LIMIT,
                });

                if (numbers.length === 0) {
                    // ── Step 2: city only (any state) — handles spelling variants ──
                    searchMode = `${filterCity} (any state)`;
                    numbers = await phoneApi.list({
                        inLocality:  filterCity,
                        smsEnabled:  true,
                        limit:       FETCH_LIMIT,
                    });
                }

                // ── Step 3: still 0 — don't auto-expand, let user decide ──
                if (numbers.length === 0) {
                    searchMode = `${filterCity}, ${filterState}`;
                    canExpand  = true;   // frontend should offer "Search all of {state}" button
                }

            } else if (filterState) {
                // ── State-only search (explicit) ──────────────────────────
                searchMode = `state ${filterState}`;
                numbers = await phoneApi.list({
                    inRegion:   filterState,
                    smsEnabled: true,
                    limit:      FETCH_LIMIT,
                });
            }
        }

        const formatted = numbers.map(n => ({
            phoneNumber:  n.phoneNumber,
            friendlyName: n.friendlyName,
            locality:     n.locality,
            region:       n.region,
            isoCountry:   n.isoCountry,
        }));

        log.info(`[twilioProvisioning] Found ${formatted.length} numbers for "${searchMode}"`, 'system', { searchMode, canExpand }, '');
        return res.json({ success: true, numbers: formatted, searchMode, canExpand, total: formatted.length });

    } catch (e: any) {
        log.error(`[twilioProvisioning] getAvailableNumbers failed: ${e.message}`, 'system', { areaCode, city, state }, '');
        return res.status(500).json({ error: e.message || 'Failed to fetch available numbers' });
    }
};

// ─── POST /api/messaging/provision ──────────────────────────────────────────
// Creates a Twilio sub-account for the church, purchases the chosen number,
// and configures the inbound webhook + status callback.

export const provisionTwilioNumber = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId, phoneNumber, senderName } = req.body || {};
    if (!churchId || !phoneNumber) {
        return res.status(400).json({ error: 'Missing churchId or phoneNumber' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const { accountSid, authToken } = await getMasterCredentials(db);
        const master = getMasterClient(accountSid, authToken);

        // 1. Load existing church data
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const church = churchSnap.data() || {};
        const existingSms = church.smsSettings || {};

        // 2. Create or reuse a Twilio sub-account for this church
        let subAccountSid: string;
        let subAccountAuthToken: string;

        if (existingSms.twilioSubAccountSid) {
            // Reuse existing sub-account
            subAccountSid       = existingSms.twilioSubAccountSid;
            subAccountAuthToken = existingSms.twilioSubAccountAuthToken;
            log.info(`Reusing existing sub-account ${subAccountSid} for church ${churchId}`, 'system', { churchId }, churchId);
        } else {
            // Create a new sub-account
            const subAccount = await master.api.v2010.accounts.create({
                friendlyName: `PastoralCare - ${church.name || churchId}`,
            });
            subAccountSid       = subAccount.sid;
            subAccountAuthToken = subAccount.authToken;
            log.info(`Created Twilio sub-account ${subAccountSid} for church ${churchId}`, 'system', { churchId, subAccountSid }, churchId);
        }

        // 3. Determine inbound webhook URL
        //    Priority: Firestore twilioWebhookBaseUrl → Firestore apiBaseUrl → SERVER_BASE_URL env → error
        const sysSnap = await db.doc('system/settings').get();
        const sysData = sysSnap.data() || {};
        const baseUrl = (
            sysData.twilioWebhookBaseUrl ||
            sysData.apiBaseUrl ||
            process.env.SERVER_BASE_URL ||
            ''
        ).replace(/\/$/, ''); // strip trailing slash

        if (!baseUrl) {
            throw new Error(
                'Webhook Base URL is not configured. ' +
                'Set "twilioWebhookBaseUrl" or "apiBaseUrl" in App Config → Configuration → Twilio SMS, or set the SERVER_BASE_URL environment variable.'
            );
        }
        if (baseUrl.startsWith('http://localhost') || baseUrl.startsWith('http://127.')) {
            throw new Error(
                `Webhook Base URL "${baseUrl}" is a localhost address — Twilio requires a publicly ` +
                'reachable HTTPS URL. Set the correct backend URL in App Config → Configuration → Twilio SMS → Webhook Base URL.'
            );
        }
        if (!baseUrl.startsWith('https://')) {
            throw new Error(
                `Webhook Base URL "${baseUrl}" must use HTTPS. Twilio will not deliver webhooks to plain HTTP or localhost addresses.`
            );
        }

        const inboundUrl     = `${baseUrl}/api/messaging/inbound`;
        const statusCallback = `${baseUrl}/api/messaging/status`;


        // 4. Purchase the phone number under the sub-account
        const subClient = twilio(subAccountSid, subAccountAuthToken);
        const purchased = await subClient.incomingPhoneNumbers.create({
            phoneNumber,
            smsUrl:             inboundUrl,
            smsMethod:          'POST',
            statusCallback:     statusCallback,
            statusCallbackMethod: 'POST',
        });

        log.info(`Purchased number ${phoneNumber} (SID: ${purchased.sid}) for church ${churchId}`, 'system', { churchId, phoneNumber, sid: purchased.sid }, churchId);

        // 5. Save SMS settings to Firestore
        const smsSettings = {
            smsEnabled:               true,
            twilioSubAccountSid:      subAccountSid,
            twilioSubAccountAuthToken: subAccountAuthToken,
            twilioPhoneNumber:        phoneNumber,
            twilioPhoneSid:           purchased.sid,
            twilioA2pStatus:          'not_started' as const,
            senderName:               senderName || church.name || 'Church',
        };

        await db.collection('churches').doc(churchId).update({ smsSettings });

        return res.json({
            success:      true,
            phoneNumber,
            subAccountSid,
            message:      `Phone number ${phoneNumber} provisioned successfully.`,
        });
    } catch (e: any) {
        log.error(`[twilioProvisioning] provisionTwilioNumber failed: ${e.message}`, 'system', { churchId, phoneNumber }, churchId);
        return res.status(500).json({ error: e.message || 'Provisioning failed' });
    }
};

// ─── POST /api/messaging/release ────────────────────────────────────────────
// Releases the phone number from Twilio (and sets smsEnabled = false).

export const releaseTwilioNumber = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const church    = churchSnap.data() || {};
        const smsSettings = church.smsSettings || {};

        const { twilioSubAccountSid, twilioSubAccountAuthToken, twilioPhoneSid } = smsSettings;

        if (twilioSubAccountSid && twilioSubAccountAuthToken && twilioPhoneSid) {
            const subClient = twilio(twilioSubAccountSid, twilioSubAccountAuthToken);
            await subClient.incomingPhoneNumbers(twilioPhoneSid).remove();
            log.info(`Released phone number (SID: ${twilioPhoneSid}) for church ${churchId}`, 'system', { churchId }, churchId);
        }

        await db.collection('churches').doc(churchId).update({
            'smsSettings.smsEnabled':          false,
            'smsSettings.twilioPhoneNumber':   null,
            'smsSettings.twilioPhoneSid':      null,
        });

        return res.json({ success: true, message: 'Phone number released.' });
    } catch (e: any) {
        log.error(`[twilioProvisioning] releaseTwilioNumber failed: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Release failed' });
    }
};

// ─── POST /api/messaging/a2p-register ───────────────────────────────────────
// Submits A2P 10DLC brand registration for the church's sub-account.
// Reads all brand fields from Firestore (saved via handleSmsSave first).
// Twilio Brand Registration is async — we store the brandSid and mark pending.
// Use checkA2pStatus to poll Twilio for the live status.

export const registerA2p = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId } = req.body || {};
    if (!churchId) {
        return res.status(400).json({ error: 'Missing churchId' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const { accountSid, authToken } = await getMasterCredentials(db);
        const master = getMasterClient(accountSid, authToken);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const smsSettings = churchSnap.data()?.smsSettings || {};

        if (!smsSettings.twilioSubAccountSid) {
            return res.status(400).json({
                error: 'No Twilio sub-account provisioned for this church. Complete number setup first.',
            });
        }

        // Validate required brand fields are saved in Firestore
        const required: { key: string; label: string }[] = [
            { key: 'a2pBusinessName',     label: 'Legal Business Name' },
            { key: 'a2pEin',              label: 'Federal EIN' },
            { key: 'a2pBusinessType',     label: 'Business Type' },
            { key: 'a2pVertical',         label: 'Industry Vertical' },
            { key: 'a2pWebsite',          label: 'Website' },
            { key: 'a2pContactFirstName', label: 'Contact First Name' },
            { key: 'a2pContactLastName',  label: 'Contact Last Name' },
            { key: 'a2pContactEmail',     label: 'Contact Email' },
            { key: 'a2pContactPhone',     label: 'Contact Phone' },
            { key: 'a2pAddress',          label: 'Street Address' },
            { key: 'a2pCity',             label: 'City' },
            { key: 'a2pState',            label: 'State' },
            { key: 'a2pZip',              label: 'ZIP Code' },
        ];
        const missing = required.filter(r => !smsSettings[r.key]).map(r => r.label);
        if (missing.length > 0) {
            return res.status(400).json({
                error: `Missing required fields: ${missing.join(', ')}. Save the form first, then submit.`,
            });
        }

        // ── Submit Brand Registration to Twilio ──────────────────────────────────
        // Twilio messaging.v1.brandRegistrations — uses Customer Profile Bundle if available.
        // For low-volume non-profits without a bundle, Twilio still accepts the create()
        // with empty bundle SIDs (returns an error code we surface to the admin).
        let brandSid: string;

        try {
            const brand = await (master as any).messaging.v1.brandRegistrations.create({
                customerProfileBundleSid: smsSettings.twilioCustomerProfileSid || '',
                a2PProfileBundleSid:      smsSettings.twilioA2pProfileSid      || '',
                friendlyName:             smsSettings.a2pBusinessName,
                email:                    smsSettings.a2pContactEmail,
                phone:                    smsSettings.a2pContactPhone,
                website:                  smsSettings.a2pWebsite,
            });
            brandSid = brand.sid;
        } catch (twilioErr: any) {
            // Twilio requires a completed Customer Profile Bundle for full registration.
            // If missing, mark as pending and direct the admin to the Twilio Console.
            log.warn(
                `[registerA2p] Twilio API error for ${churchId}: ${twilioErr.message}`,
                'system', { churchId, code: twilioErr.code }, churchId
            );

            await db.collection('churches').doc(churchId).update({
                'smsSettings.twilioA2pStatus': 'pending',
                'smsSettings.a2pSubmittedAt':  Date.now(),
            });

            return res.json({
                success: false,
                status:  'pending',
                message:
                    'Registration info saved to Firestore. To complete A2P submission, your Twilio account ' +
                    'must have a verified Customer Profile Bundle. Please complete the Business Profile in ' +
                    'the Twilio Console (Console → Messaging → Regulatory Compliance), then enter the ' +
                    'Bundle SID here and re-submit. Low-volume sending continues in the meantime.',
                twilioError: twilioErr.message,
                twilioCode:  twilioErr.code,
            });
        }

        // ── Save brandSid and mark pending ──────────────────────────────────────
        await db.collection('churches').doc(churchId).update({
            'smsSettings.twilioBrandSid':  brandSid,
            'smsSettings.twilioA2pStatus': 'pending',
            'smsSettings.a2pSubmittedAt':  Date.now(),
        });

        log.info(
            `[registerA2p] Brand submitted for ${churchId}: SID=${brandSid}`,
            'system', { churchId, brandSid }, churchId
        );

        return res.json({
            success:  true,
            brandSid,
            status:   'pending',
            message:  'Brand registration submitted to Twilio. Approval typically takes 1–5 business days. Use "Check Status" to refresh.',
        });

    } catch (e: any) {
        log.error(
            `[registerA2p] Unexpected error for ${churchId}: ${e.message}`,
            'system', { churchId }, churchId
        );
        return res.status(500).json({ error: e.message || 'A2P registration failed' });
    }
};

// ─── GET /api/messaging/a2p-status ──────────────────────────────────────────
// Fetches the live A2P brand registration status from Twilio and syncs it
// back to Firestore. Returns brand details + failure reason if applicable.

export const checkA2pStatus = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    // Support both ?churchId= query param and POST body
    const { churchId } = ({ ...req.query, ...req.body } as Record<string, string>);
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const { accountSid, authToken } = await getMasterCredentials(db);
        const master = getMasterClient(accountSid, authToken);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const smsSettings = churchSnap.data()?.smsSettings || {};

        const brandSid = smsSettings.twilioBrandSid as string | undefined;

        if (!brandSid) {
            return res.json({
                status:   'not_started',
                message:  'No brand SID on file. Submit the A2P registration first.',
                brandSid: null,
                failureReason: null,
            });
        }

        // ── Fetch brand status from Twilio ───────────────────────────────────────
        let twilioStatus   = 'pending';
        let failureReason: string | null = null;
        let brandDetails: any = {};

        try {
            const brandReg = await (master as any).messaging.v1.brandRegistrations(brandSid).fetch();
            twilioStatus   = (brandReg.status || 'pending').toLowerCase();
            failureReason  = brandReg.failureReason || null;
            brandDetails   = {
                brandType:   brandReg.brandType,
                identity:    brandReg.identity,
                cspId:       brandReg.cspId,
                dateCreated: brandReg.dateCreated,
                dateUpdated: brandReg.dateUpdated,
            };
        } catch (twErr: any) {
            log.warn(
                `[checkA2pStatus] Could not fetch brand ${brandSid}: ${twErr.message}`,
                'system', { churchId, brandSid }, churchId
            );
            failureReason = `Twilio API error: ${twErr.message}`;
        }

        // Map Twilio's status string → our enum
        const mappedStatus: 'not_started' | 'pending' | 'approved' | 'failed' =
            twilioStatus === 'approved'    ? 'approved' :
            twilioStatus === 'failed'      ? 'failed'   :
            twilioStatus === 'in_review'   ? 'pending'  :
            twilioStatus === 'pending'     ? 'pending'  :
            twilioStatus === 'unverified'  ? 'pending'  :
            'pending';

        // ── Sync back to Firestore ───────────────────────────────────────────────
        const updates: Record<string, any> = {
            'smsSettings.twilioA2pStatus':    mappedStatus,
            'smsSettings.a2pLastStatusCheck': Date.now(),
        };
        if (failureReason) updates['smsSettings.a2pFailureReason'] = failureReason;

        await db.collection('churches').doc(churchId).update(updates);

        log.info(
            `[checkA2pStatus] Brand ${brandSid} → ${twilioStatus} (${mappedStatus}) for ${churchId}`,
            'system', { churchId, brandSid, mappedStatus }, churchId
        );

        return res.json({
            success:       true,
            status:        mappedStatus,
            twilioStatus,
            brandSid,
            failureReason,
            brandDetails,
            checkedAt:     Date.now(),
        });

    } catch (e: any) {
        log.error(
            `[checkA2pStatus] Error for ${churchId}: ${e.message}`,
            'system', { churchId }, churchId
        );
        return res.status(500).json({ error: e.message || 'Status check failed' });
    }
};

// ─── POST /api/messaging/create-customer-profile ────────────────────────────
// Programmatically creates a Twilio Trust Hub Customer Profile Bundle for the
// church's sub-account. This is required before A2P brand registration can
// succeed. Steps:
//   1. Create EndUser (business contact info)
//   2. Create CustomerProfile bundle (using the A2P policy SID)
//   3. Assign EndUser → CustomerProfile
//   4. Submit CustomerProfile for Twilio review
//   5. Save the BU... SID to Firestore → smsSettings.twilioCustomerProfileSid

// Twilio's well-known policy SID for A2P 10DLC Secondary Customer Profiles.
// This is the standard policy used by Twilio ISVs for customer profiles.
const A2P_POLICY_SID = 'RNdfbf3fae0e1107f8aded0e7cead80bf5';

export const createCustomerProfile = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const { accountSid, authToken } = await getMasterCredentials(db);
        const master = getMasterClient(accountSid, authToken);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const sms = churchSnap.data()?.smsSettings || {};

        // Validate required fields
        const required: { key: string; label: string }[] = [
            { key: 'a2pBusinessName',     label: 'Legal Business Name' },
            { key: 'a2pEin',              label: 'Federal EIN' },
            { key: 'a2pWebsite',          label: 'Website' },
            { key: 'a2pContactFirstName', label: 'Contact First Name' },
            { key: 'a2pContactLastName',  label: 'Contact Last Name' },
            { key: 'a2pContactEmail',     label: 'Contact Email' },
            { key: 'a2pContactPhone',     label: 'Contact Phone' },
            { key: 'a2pAddress',          label: 'Street Address' },
            { key: 'a2pCity',             label: 'City' },
            { key: 'a2pState',            label: 'State' },
            { key: 'a2pZip',              label: 'ZIP Code' },
        ];
        const missing = required.filter(r => !sms[r.key]).map(r => r.label);
        if (missing.length) {
            return res.status(400).json({
                error: `Missing required fields: ${missing.join(', ')}. Save the form first.`,
            });
        }

        // ── Step 1a: Business info EndUser (only business fields go here) ──────
        const bizEndUser = await (master as any).trusthub.v1.endUsers.create({
            friendlyName: `Business Info – ${sms.a2pBusinessName}`,
            type: 'customer_profile_business_information',
            attributes: {
                business_name:                    sms.a2pBusinessName,
                business_registration_identifier: 'EIN',
                business_registration_number:     sms.a2pEin,
                business_type:                    sms.a2pBusinessType || 'Non-profit Corporation',
                business_industry:                sms.a2pVertical     || 'RELIGIOUS',
                business_regions_of_operation:    'USA',
                website_url:                      sms.a2pWebsite,
            },
        });
        log.info(`[createCustomerProfile] Created biz EndUser ${bizEndUser.sid}`, 'system', { churchId }, churchId);

        // ── Step 1b: Authorised rep EndUser (personal contact fields) ───────────
        const repEndUser = await (master as any).trusthub.v1.endUsers.create({
            friendlyName: `${sms.a2pContactFirstName} ${sms.a2pContactLastName} – ${sms.a2pBusinessName}`,
            type: 'authorized_representative_1',
            attributes: {
                first_name:   sms.a2pContactFirstName,
                last_name:    sms.a2pContactLastName,
                email:        sms.a2pContactEmail,
                phone_number: sms.a2pContactPhone,
                job_position: 'Director',
            },
        });
        log.info(`[createCustomerProfile] Created rep EndUser ${repEndUser.sid}`, 'system', { churchId }, churchId);

        // ── Step 1c: Create a Twilio Address resource for physical address ───────
        // Addresses are their own object in Trust Hub and must be assigned separately.
        const address = await (master as any).addresses.create({
            friendlyName:  sms.a2pBusinessName,
            customerName:  `${sms.a2pContactFirstName} ${sms.a2pContactLastName}`,
            street:        sms.a2pAddress,
            city:          sms.a2pCity,
            region:        sms.a2pState,
            postalCode:    sms.a2pZip,
            isoCountry:    'US',
        });
        log.info(`[createCustomerProfile] Created Address ${address.sid}`, 'system', { churchId }, churchId);

        // ── Step 2: Create the CustomerProfile bundle ─────────────────────────
        const profile = await (master as any).trusthub.v1.customerProfiles.create({
            friendlyName: sms.a2pBusinessName,
            email:        sms.a2pContactEmail,
            policySid:    A2P_POLICY_SID,
        });
        log.info(`[createCustomerProfile] Created CustomerProfile ${profile.sid}`, 'system', { churchId }, churchId);

        // ── Step 3: Assign biz info, authorised rep, and address to the profile ─
        await (master as any).trusthub.v1
            .customerProfiles(profile.sid)
            .customerProfilesEntityAssignments
            .create({ objectSid: bizEndUser.sid });

        await (master as any).trusthub.v1
            .customerProfiles(profile.sid)
            .customerProfilesEntityAssignments
            .create({ objectSid: repEndUser.sid });

        await (master as any).trusthub.v1
            .customerProfiles(profile.sid)
            .customerProfilesEntityAssignments
            .create({ objectSid: address.sid });

        log.info(`[createCustomerProfile] Assigned all entities to ${profile.sid}`, 'system', { churchId }, churchId);

        // ── Step 4: Submit the profile for Twilio review ───────────────────────
        await (master as any).trusthub.v1
            .customerProfiles(profile.sid)
            .update({ status: 'pending-review' });
        log.info(`[createCustomerProfile] Profile ${profile.sid} submitted for review`, 'system', { churchId }, churchId);

        // ── Step 5: Save to Firestore ──────────────────────────────────────────
        await db.collection('churches').doc(churchId).update({
            'smsSettings.twilioCustomerProfileSid':       profile.sid,
            'smsSettings.twilioEndUserSid':               bizEndUser.sid,
            'smsSettings.twilioRepEndUserSid':            repEndUser.sid,
            'smsSettings.twilioAddressSid':               address.sid,
            'smsSettings.twilioCustomerProfileStatus':    'pending-review',
            'smsSettings.twilioCustomerProfileCreatedAt': Date.now(),
        });

        return res.json({
            success:    true,
            profileSid: profile.sid,
            endUserSid: bizEndUser.sid,
            status:     'pending-review',
            message:    'Customer Profile Bundle created and submitted for Twilio review. ' +
                        'Approval is typically same-day. Once approved, click "Submit to Twilio" ' +
                        'to complete A2P brand registration.',
        });

    } catch (e: any) {
        log.error(`[createCustomerProfile] Failed for ${churchId}: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({
            error: e.message || 'Failed to create Customer Profile',
            twilioCode: (e as any).code || null,
        });
    }
};

