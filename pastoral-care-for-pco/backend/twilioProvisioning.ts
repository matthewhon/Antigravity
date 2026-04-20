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

    const { churchId, phoneNumber, senderName, friendlyLabel } = req.body || {};
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
        const now = Date.now();
        const smsSettings = {
            smsEnabled:               true,
            twilioSubAccountSid:      subAccountSid,
            twilioSubAccountAuthToken: subAccountAuthToken,
            // Keep these on smsSettings for backward-compat (A2P, send, etc.)
            twilioPhoneNumber:        phoneNumber,
            twilioPhoneSid:           purchased.sid,
            twilioA2pStatus:          'not_started' as const,
            senderName:               senderName || church.name || 'Church',
        };

        await db.collection('churches').doc(churchId).update({ smsSettings });

        // 5b. Write to the new twilioNumbers collection
        // Check if this is the first number for the church
        const existingNums = await db.collection('twilioNumbers')
            .where('churchId', '==', churchId)
            .limit(1)
            .get();
        const isFirstNumber = existingNums.empty;

        const numDocId = `${churchId}_${purchased.sid}`;
        await db.collection('twilioNumbers').doc(numDocId).set({
            id:             numDocId,
            churchId,
            phoneNumber,
            phoneSid:       purchased.sid,
            friendlyLabel:  friendlyLabel || 'Main Line',
            isDefault:      isFirstNumber,
            smsEnabled:     true,
            allowedUserIds: [],          // open to all users
            webhookUrl:     inboundUrl,
            senderName:     senderName || church.name || 'Church',
            createdAt:      now,
            updatedAt:      now,
        });

        log.info(`[twilioProvisioning] Wrote twilioNumbers doc ${numDocId} for church ${churchId}`, 'system', { churchId, numDocId, isFirstNumber }, churchId);

        return res.json({
            success:      true,
            phoneNumber,
            subAccountSid,
            twilioNumberId: numDocId,
            message:      `Phone number ${phoneNumber} provisioned successfully.`,
        });
    } catch (e: any) {
        log.error(`[twilioProvisioning] provisionTwilioNumber failed: ${e.message}`, 'system', { churchId, phoneNumber }, churchId);
        return res.status(500).json({ error: e.message || 'Provisioning failed' });
    }
};

// ─── POST /api/messaging/release ────────────────────────────────────────────
// Releases the FIRST / only phone number (legacy single-number flow).
// For multi-number tenants, use /api/messaging/release-number instead.

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

// ─── POST /api/messaging/add-number ─────────────────────────────────────────
// Adds a SECOND (or Nth) phone number to an already-enabled church.
// Reuses the existing Twilio sub-account — no new sub-account is created.
// Body: { churchId, phoneNumber, friendlyLabel? }

export const addTwilioNumber = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId, phoneNumber, friendlyLabel } = req.body || {};
    if (!churchId || !phoneNumber) {
        return res.status(400).json({ error: 'Missing churchId or phoneNumber' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const church     = churchSnap.data() || {};
        const smsSettings = church.smsSettings || {};

        if (!smsSettings.twilioSubAccountSid || !smsSettings.twilioSubAccountAuthToken) {
            return res.status(400).json({
                error: 'No Twilio sub-account found. Complete the initial SMS setup first.',
            });
        }

        // Build inbound webhook URL
        const sysSnap = await db.doc('system/settings').get();
        const sysData = sysSnap.data() || {};
        const baseUrl = (
            sysData.twilioWebhookBaseUrl ||
            sysData.apiBaseUrl ||
            process.env.SERVER_BASE_URL || ''
        ).replace(/\/$/, '');
        if (!baseUrl) throw new Error('Webhook Base URL is not configured.');

        const inboundUrl     = `${baseUrl}/api/messaging/inbound`;
        const statusCallback = `${baseUrl}/api/messaging/status`;

        const subClient = twilio(smsSettings.twilioSubAccountSid, smsSettings.twilioSubAccountAuthToken);

        // Purchase the additional number
        const purchased = await subClient.incomingPhoneNumbers.create({
            phoneNumber,
            smsUrl:              inboundUrl,
            smsMethod:           'POST',
            statusCallback,
            statusCallbackMethod: 'POST',
        });

        const now      = Date.now();
        const numDocId = `${churchId}_${purchased.sid}`;

        await db.collection('twilioNumbers').doc(numDocId).set({
            id:             numDocId,
            churchId,
            phoneNumber,
            phoneSid:       purchased.sid,
            friendlyLabel:  friendlyLabel || phoneNumber,
            isDefault:      false,   // never default — use set-default-number to change
            smsEnabled:     true,
            allowedUserIds: [],
            webhookUrl:     inboundUrl,
            senderName:     smsSettings.senderName || church.name || 'Church',
            createdAt:      now,
            updatedAt:      now,
        });

        log.info(`[addTwilioNumber] Added number ${phoneNumber} (SID: ${purchased.sid}) for church ${churchId}`, 'system', { churchId, numDocId }, churchId);

        return res.json({
            success:      true,
            phoneNumber,
            twilioNumberId: numDocId,
            message:      `Phone number ${phoneNumber} added successfully.`,
        });

    } catch (e: any) {
        log.error(`[addTwilioNumber] Failed for ${churchId}: ${e.message}`, 'system', { churchId, phoneNumber }, churchId);
        return res.status(500).json({ error: e.message || 'Failed to add number' });
    }
};

// ─── POST /api/messaging/release-number ─────────────────────────────────────
// Releases a specific phone number by twilioNumberId.
// Body: { churchId, twilioNumberId }

export const releaseSpecificNumber = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId, twilioNumberId } = req.body || {};
    if (!churchId || !twilioNumberId) {
        return res.status(400).json({ error: 'Missing churchId or twilioNumberId' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const numSnap = await db.collection('twilioNumbers').doc(twilioNumberId).get();
        if (!numSnap.exists) return res.status(404).json({ error: 'Phone number record not found' });
        const numData = numSnap.data() || {};
        if (numData.churchId !== churchId) return res.status(403).json({ error: 'Forbidden' });

        // Fetch sub-account credentials
        const churchSnap = await db.collection('churches').doc(churchId).get();
        const sms = churchSnap.data()?.smsSettings || {};

        if (sms.twilioSubAccountSid && sms.twilioSubAccountAuthToken && numData.phoneSid) {
            const subClient = twilio(sms.twilioSubAccountSid, sms.twilioSubAccountAuthToken);
            try {
                await subClient.incomingPhoneNumbers(numData.phoneSid).remove();
            } catch (twilioErr: any) {
                // If the number was already released in Twilio, continue with DB cleanup
                log.warn(`[releaseSpecificNumber] Twilio release failed (may already be released): ${twilioErr.message}`, 'system', { churchId, twilioNumberId }, churchId);
            }
        }

        // Delete the twilioNumbers doc
        await db.collection('twilioNumbers').doc(twilioNumberId).delete();

        // If this was the default number, promote the next one
        if (numData.isDefault) {
            const remaining = await db.collection('twilioNumbers')
                .where('churchId', '==', churchId)
                .limit(1)
                .get();
            if (!remaining.empty) {
                await remaining.docs[0].ref.update({ isDefault: true, updatedAt: Date.now() });
            } else {
                // No numbers left — disable SMS
                await db.collection('churches').doc(churchId).update({
                    'smsSettings.smsEnabled':        false,
                    'smsSettings.twilioPhoneNumber': null,
                    'smsSettings.twilioPhoneSid':    null,
                });
            }
        }

        log.info(`[releaseSpecificNumber] Released ${numData.phoneNumber} for church ${churchId}`, 'system', { churchId, twilioNumberId }, churchId);
        return res.json({ success: true, message: `${numData.phoneNumber} released.` });

    } catch (e: any) {
        log.error(`[releaseSpecificNumber] Failed: ${e.message}`, 'system', { churchId, twilioNumberId }, churchId);
        return res.status(500).json({ error: e.message || 'Release failed' });
    }
};

// ─── PATCH /api/messaging/number-settings ────────────────────────────────────
// Updates label, user restrictions, or senderName for a specific number.
// Body: { churchId, twilioNumberId, friendlyLabel?, allowedUserIds?, senderName? }

export const updateNumberSettings = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId, twilioNumberId, friendlyLabel, allowedUserIds, senderName } = req.body || {};
    if (!churchId || !twilioNumberId) {
        return res.status(400).json({ error: 'Missing churchId or twilioNumberId' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const numSnap = await db.collection('twilioNumbers').doc(twilioNumberId).get();
        if (!numSnap.exists) return res.status(404).json({ error: 'Number not found' });
        if (numSnap.data()?.churchId !== churchId) return res.status(403).json({ error: 'Forbidden' });

        const patch: Record<string, any> = { updatedAt: Date.now() };
        if (friendlyLabel  !== undefined) patch.friendlyLabel  = friendlyLabel;
        if (allowedUserIds !== undefined) patch.allowedUserIds = allowedUserIds;
        if (senderName     !== undefined) patch.senderName     = senderName;

        await db.collection('twilioNumbers').doc(twilioNumberId).update(patch);
        log.info(`[updateNumberSettings] Updated ${twilioNumberId} for church ${churchId}`, 'system', { churchId, twilioNumberId, patch }, churchId);

        return res.json({ success: true });
    } catch (e: any) {
        log.error(`[updateNumberSettings] Failed: ${e.message}`, 'system', { churchId, twilioNumberId }, churchId);
        return res.status(500).json({ error: e.message || 'Update failed' });
    }
};

// ─── POST /api/messaging/set-default-number ──────────────────────────────────
// Atomically marks one number as isDefault=true and all others false.
// Body: { churchId, twilioNumberId }

export const setDefaultNumber = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId, twilioNumberId } = req.body || {};
    if (!churchId || !twilioNumberId) {
        return res.status(400).json({ error: 'Missing churchId or twilioNumberId' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const allNums = await db.collection('twilioNumbers')
            .where('churchId', '==', churchId)
            .get();

        const batch = db.batch();
        const now   = Date.now();
        let targetPhone = '';

        allNums.docs.forEach(doc => {
            const isTarget = doc.id === twilioNumberId;
            batch.update(doc.ref, { isDefault: isTarget, updatedAt: now });
            if (isTarget) targetPhone = doc.data().phoneNumber || '';
        });

        await batch.commit();

        // Also update smsSettings.twilioPhoneNumber to keep backward-compat
        if (targetPhone) {
            const targetDoc = allNums.docs.find(d => d.id === twilioNumberId);
            if (targetDoc) {
                await db.collection('churches').doc(churchId).update({
                    'smsSettings.twilioPhoneNumber': targetPhone,
                    'smsSettings.twilioPhoneSid':    targetDoc.data().phoneSid || null,
                });
            }
        }

        log.info(`[setDefaultNumber] Set ${twilioNumberId} as default for church ${churchId}`, 'system', { churchId, twilioNumberId }, churchId);
        return res.json({ success: true });

    } catch (e: any) {
        log.error(`[setDefaultNumber] Failed: ${e.message}`, 'system', { churchId, twilioNumberId }, churchId);
        return res.status(500).json({ error: e.message || 'Failed to set default' });
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
            { key: 'a2pBusinessName',        label: 'Legal Business Name' },
            { key: 'a2pEin',                 label: 'Federal EIN' },
            { key: 'a2pBusinessType',        label: 'Business Type' },
            { key: 'a2pVertical',            label: 'Industry Vertical' },
            { key: 'a2pWebsite',             label: 'Website' },
            { key: 'a2pContactFirstName',    label: 'Contact First Name' },
            { key: 'a2pContactLastName',     label: 'Contact Last Name' },
            { key: 'a2pContactEmail',        label: 'Contact Email' },
            { key: 'a2pContactPhone',        label: 'Contact Phone' },
            { key: 'a2pContactJobTitle',     label: 'Contact Job Title' },
            { key: 'a2pContactJobPosition',  label: 'Contact Job Level' },
            { key: 'a2pAddress',             label: 'Street Address' },
            { key: 'a2pCity',                label: 'City' },
            { key: 'a2pState',               label: 'State' },
            { key: 'a2pZip',                 label: 'ZIP Code' },
            // Note: Rep 2 fields are required for createCustomerProfile, NOT for registerA2p
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

        // Validate required fields (Rep 2 is optional — added in Step 1e if present)
        const required: { key: string; label: string }[] = [
            { key: 'a2pBusinessName',        label: 'Legal Business Name' },
            { key: 'a2pEin',                 label: 'Federal EIN' },
            { key: 'a2pBusinessType',        label: 'Business Type' },
            { key: 'a2pVertical',            label: 'Industry Vertical' },
            { key: 'a2pWebsite',             label: 'Website' },
            { key: 'a2pContactFirstName',    label: 'Contact First Name' },
            { key: 'a2pContactLastName',     label: 'Contact Last Name' },
            { key: 'a2pContactEmail',        label: 'Contact Email' },
            { key: 'a2pContactPhone',        label: 'Contact Phone' },
            { key: 'a2pContactJobTitle',     label: 'Contact Job Title' },
            { key: 'a2pContactJobPosition',  label: 'Contact Job Level' },
            { key: 'a2pAddress',             label: 'Street Address' },
            { key: 'a2pCity',                label: 'City' },
            { key: 'a2pState',               label: 'State' },
            { key: 'a2pZip',                 label: 'ZIP Code' },
        ];
        const missing = required.filter(r => !sms[r.key]).map(r => r.label);
        if (missing.length) {
            return res.status(400).json({
                error: `Missing required fields: ${missing.join(', ')}. Save the form first.`,
            });
        }

        // ── Step 1a: Create a Twilio Address resource for the business ───────────
        // Twilio requires a proper Address object (AD... SID) — raw address fields
        // are NOT accepted as attributes on customer_profile_business_information.
        // The AD... SID is referenced via address_sids_attest in the EndUser below.
        // NOTE: The Address SID must NOT be added as a bundle entity assignment —
        // only EndUser (IT...) and SupportingDocument (SD...) SIDs are valid there.
        const bizAddress = await (master as any).addresses.create({
            customerName: sms.a2pBusinessName,
            street:       sms.a2pAddress,
            city:         sms.a2pCity,
            region:       sms.a2pState,
            postalCode:   sms.a2pZip,
            isoCountry:   'US',
            friendlyName: `${sms.a2pBusinessName} – Business Address`,
        });
        log.info(`[createCustomerProfile] Created Address ${bizAddress.sid}`, 'system', { churchId }, churchId);

        // ── Step 1b: Business info EndUser (business fields only — NO address fields) ──
        // customer_profile_business_information does NOT accept address attributes.
        // The address will be added as a separate SupportingDocument (Step 1c).
        const bizEndUser = await (master as any).trusthub.v1.endUsers.create({
            friendlyName: `Business Info – ${sms.a2pBusinessName}`,
            type: 'customer_profile_business_information',
            attributes: {
                business_name:                    sms.a2pBusinessName,
                business_registration_identifier: 'EIN',
                business_registration_number:     sms.a2pEin,
                business_type:                    sms.a2pBusinessType || 'Non-profit Corporation',
                business_industry:                sms.a2pVertical     || 'Religion',
                business_regions_of_operation:    'USA_AND_CANADA',
                website_url:                      sms.a2pWebsite,
            },
        });
        log.info(`[createCustomerProfile] Created biz EndUser ${bizEndUser.sid}`, 'system', { churchId }, churchId);

        // ── Step 1c: Wrap the Address as a SupportingDocument (customer_profile_address) ──
        // This produces an RD... SID that CAN be assigned to the CustomerProfile bundle.
        // The address_sids attribute on this SupportingDocument type is valid and required.
        const addrDoc = await (master as any).trusthub.v1.supportingDocuments.create({
            friendlyName: `Business Address – ${sms.a2pBusinessName}`,
            type: 'customer_profile_address',
            attributes: {
                address_sids: [bizAddress.sid],  // AD... SID wrapped in an array
            },
        });
        log.info(`[createCustomerProfile] Created address SupportingDocument ${addrDoc.sid}`, 'system', { churchId }, churchId);

        // ── Step 1d: Authorised rep 1 EndUser (personal contact fields) ─────────
        const repEndUser = await (master as any).trusthub.v1.endUsers.create({
            friendlyName: `${sms.a2pContactFirstName} ${sms.a2pContactLastName} – ${sms.a2pBusinessName}`,
            type: 'authorized_representative_1',
            attributes: {
                first_name:     sms.a2pContactFirstName,
                last_name:      sms.a2pContactLastName,
                email:          sms.a2pContactEmail,
                phone_number:   sms.a2pContactPhone,
                job_position:   sms.a2pContactJobPosition || 'Director',
                business_title: sms.a2pContactJobTitle    || sms.a2pContactJobPosition || 'Director',
            },
        });
        log.info(`[createCustomerProfile] Created rep1 EndUser ${repEndUser.sid}`, 'system', { churchId }, churchId);

        // ── Step 1e: Authorised rep 2 EndUser (optional — required for full TrustHub compliance) ──
        let rep2EndUser: any = null;
        const hasRep2 = sms.a2pRep2FirstName && sms.a2pRep2LastName && sms.a2pRep2Email && sms.a2pRep2Phone;
        if (hasRep2) {
            rep2EndUser = await (master as any).trusthub.v1.endUsers.create({
                friendlyName: `${sms.a2pRep2FirstName} ${sms.a2pRep2LastName} – ${sms.a2pBusinessName} (Rep 2)`,
                type: 'authorized_representative_2',
                attributes: {
                    first_name:     sms.a2pRep2FirstName,
                    last_name:      sms.a2pRep2LastName,
                    email:          sms.a2pRep2Email,
                    phone_number:   sms.a2pRep2Phone,
                    job_position:   sms.a2pRep2JobPosition || 'Director',
                    business_title: sms.a2pRep2JobTitle    || sms.a2pRep2JobPosition || 'Director',
                },
            });
            log.info(`[createCustomerProfile] Created rep2 EndUser ${rep2EndUser.sid}`, 'system', { churchId }, churchId);
        } else {
            log.info(`[createCustomerProfile] Rep 2 fields not provided — skipping rep2 EndUser (profile may still be approved as a sole-authorized profile)`, 'system', { churchId }, churchId);
        }

        // ── Step 2: Create the CustomerProfile bundle ─────────────────────────
        const sysSnap = await db.doc('system/settings').get();
        const sysData = sysSnap.data() || {};
        const baseUrl = (
            sysData.twilioWebhookBaseUrl ||
            sysData.apiBaseUrl ||
            process.env.SERVER_BASE_URL || ''
        ).replace(/\/$/, '');

        const profile = await (master as any).trusthub.v1.customerProfiles.create({
            friendlyName:   sms.a2pBusinessName,
            email:          sms.a2pContactEmail,
            policySid:      A2P_POLICY_SID,
            statusCallback: baseUrl ? `${baseUrl}/api/messaging/trust-hub-status` : undefined,
        });
        log.info(`[createCustomerProfile] Created CustomerProfile ${profile.sid}`, 'system', { churchId }, churchId);

        // ── Step 3: Assign biz EndUser, rep1 EndUser, rep2 EndUser, and address SupportingDocument ──
        // Valid object types for customerProfilesEntityAssignments:
        //   IT... (EndUser)  |  RD... (SupportingDocument)
        // AD... (Address) objects are NOT valid — the address must be wrapped as RD... first.
        await (master as any).trusthub.v1
            .customerProfiles(profile.sid)
            .customerProfilesEntityAssignments
            .create({ objectSid: bizEndUser.sid });

        await (master as any).trusthub.v1
            .customerProfiles(profile.sid)
            .customerProfilesEntityAssignments
            .create({ objectSid: repEndUser.sid });

        if (rep2EndUser) {
            await (master as any).trusthub.v1
                .customerProfiles(profile.sid)
                .customerProfilesEntityAssignments
                .create({ objectSid: rep2EndUser.sid });
        }

        await (master as any).trusthub.v1
            .customerProfiles(profile.sid)
            .customerProfilesEntityAssignments
            .create({ objectSid: addrDoc.sid });  // RD... SupportingDocument for the address

        const assignedCount = rep2EndUser ? 4 : 3;
        log.info(`[createCustomerProfile] Assigned ${assignedCount} components to ${profile.sid}${rep2EndUser ? '' : ' (no Rep 2)'}`, 'system', { churchId }, churchId);

        // ── Step 3b: Evaluate bundle compliance before submitting ──────────────
        let evaluationStatus = 'unknown';
        let evaluationResults: any[] = [];
        try {
            const evaluation = await (master as any).trusthub.v1
                .customerProfiles(profile.sid)
                .customerProfilesEvaluations
                .create({ policySid: A2P_POLICY_SID });
            evaluationStatus = evaluation.status || 'unknown';
            evaluationResults = evaluation.results || [];
            log.info(
                `[createCustomerProfile] Evaluation ${evaluationStatus} for ${profile.sid}`,
                'system', { churchId, evaluationStatus }, churchId
            );
        } catch (evalErr: any) {
            log.warn(
                `[createCustomerProfile] Evaluation failed (non-fatal): ${evalErr.message}`,
                'system', { churchId }, churchId
            );
        }

        // ── Step 4: Submit the profile for Twilio review ───────────────────────
        await (master as any).trusthub.v1
            .customerProfiles(profile.sid)
            .update({ status: 'pending-review' });
        log.info(`[createCustomerProfile] Profile ${profile.sid} submitted for review`, 'system', { churchId }, churchId);

        // ── Step 5: Save to Firestore ──────────────────────────────────────────
        const firestoreUpdate: Record<string, any> = {
            'smsSettings.twilioCustomerProfileSid':        profile.sid,
            'smsSettings.twilioEndUserSid':                bizEndUser.sid,
            'smsSettings.twilioRepEndUserSid':             repEndUser.sid,
            'smsSettings.twilioAddressSid':                bizAddress.sid,
            'smsSettings.twilioSupportingDocSid':          addrDoc.sid,
            'smsSettings.twilioCustomerProfileStatus':     'pending-review',
            'smsSettings.twilioCustomerProfileEvaluation': evaluationStatus,
            'smsSettings.twilioCustomerProfileCreatedAt':  Date.now(),
        };
        if (rep2EndUser) {
            firestoreUpdate['smsSettings.twilioRep2EndUserSid'] = rep2EndUser.sid;
        }
        await db.collection('churches').doc(churchId).update(firestoreUpdate);

        const isCompliant = evaluationStatus === 'compliant';
        return res.json({
            success:           true,
            profileSid:        profile.sid,
            endUserSid:        bizEndUser.sid,
            rep2EndUserSid:    rep2EndUser.sid,
            evaluationStatus,
            evaluationResults: isCompliant ? [] : evaluationResults,
            status:            'pending-review',
            message:           isCompliant
                ? 'Customer Profile Bundle created, passed compliance evaluation, and submitted for Twilio review. ' +
                  'Approval is typically same-day. Once approved, click "Submit to Twilio" to complete A2P brand registration.'
                : `Customer Profile Bundle created and submitted, but the compliance evaluation returned "${evaluationStatus}". ` +
                  'Twilio may still approve it. Check the evaluation results for details.',
        });

    } catch (e: any) {
        log.error(`[createCustomerProfile] Failed for ${churchId}: ${e.message}`, 'system', { churchId }, churchId);

        const msg: string = (e.message || '').toLowerCase();
        const needsPrimaryProfile =
            msg.includes('no primary customer profile') ||
            msg.includes('primary customer profile') ||
            (e as any).code === 20429;

        return res.status(500).json({
            error: e.message || 'Failed to create Customer Profile',
            twilioCode: (e as any).code || null,
            needsPrimaryProfile,
        });
    }
};


// ─── POST /api/messaging/trust-hub-status ──────────────────────────────────────
// Twilio webhook called when a CustomerProfile bundle status changes.
// Body (application/x-www-form-urlencoded): AccountSid, BundleSid, Status
// We find the church by BundleSid and sync the status to Firestore.

export const trustHubStatusCallback = async (req: any, res: any) => {
    const { BundleSid, Status } = req.body || {};
    if (!BundleSid || !Status) return res.sendStatus(400);

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const snap = await db
            .collection('churches')
            .where('smsSettings.twilioCustomerProfileSid', '==', BundleSid)
            .limit(1)
            .get();

        if (snap.empty) {
            log.warn(`[trustHubStatusCallback] No church found for BundleSid ${BundleSid}`, 'system', {}, '');
            return res.sendStatus(200); // ACK so Twilio does not retry
        }

        const churchId  = snap.docs[0].id;
        const newStatus = (Status as string).toLowerCase();

        await db.collection('churches').doc(churchId).update({
            'smsSettings.twilioCustomerProfileStatus':    newStatus,
            'smsSettings.twilioCustomerProfileUpdatedAt': Date.now(),
        });

        log.info(
            `[trustHubStatusCallback] Profile ${BundleSid} → ${newStatus} for church ${churchId}`,
            'system', { churchId, BundleSid, newStatus }, churchId
        );

        return res.sendStatus(200);
    } catch (e: any) {
        log.error(`[trustHubStatusCallback] Error: ${e.message}`, 'system', { BundleSid }, '');
        return res.sendStatus(500);
    }
};
