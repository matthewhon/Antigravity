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

/** Master client. Pass subAccountSid to scope all operations to that sub-account. */
function getMasterClient(accountSid: string, authToken: string, subAccountSid?: string) {
    return subAccountSid
        ? twilio(accountSid, authToken, { accountSid: subAccountSid })
        : twilio(accountSid, authToken);
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
            // Verify the existing sub-account is still active before reusing it.
            // Sub-accounts can become suspended/inactive after creation.
            try {
                const existing = await master.api.v2010
                    .accounts(existingSms.twilioSubAccountSid)
                    .fetch();

                if (existing.status === 'active') {
                    subAccountSid       = existingSms.twilioSubAccountSid;
                    subAccountAuthToken = existingSms.twilioSubAccountAuthToken || '';
                    log.info(`Reusing active sub-account ${subAccountSid} for church ${churchId}`, 'system', { churchId }, churchId);
                } else {
                    // Sub-account exists but is suspended or closed — create a fresh one
                    log.warn(`Sub-account ${existingSms.twilioSubAccountSid} is ${existing.status} — creating a new one for church ${churchId}`, 'system', { churchId }, churchId);
                    const subAccount    = await master.api.v2010.accounts.create({
                        friendlyName: `PastoralCare - ${church.name || churchId}`,
                    });
                    subAccountSid       = subAccount.sid;
                    subAccountAuthToken = subAccount.authToken;
                    // Update Firestore with the new sub-account right away
                    await db.collection('churches').doc(churchId).update({
                        'smsSettings.twilioSubAccountSid':       subAccountSid,
                        'smsSettings.twilioSubAccountAuthToken': subAccountAuthToken,
                    });
                    log.info(`Created replacement sub-account ${subAccountSid} for church ${churchId}`, 'system', { churchId, subAccountSid }, churchId);
                }
            } catch (fetchErr: any) {
                // Could not fetch sub-account (e.g. it was fully deleted) — create a new one
                log.warn(`Could not fetch sub-account ${existingSms.twilioSubAccountSid}: ${fetchErr.message} — creating new`, 'system', { churchId }, churchId);
                const subAccount    = await master.api.v2010.accounts.create({
                    friendlyName: `PastoralCare - ${church.name || churchId}`,
                });
                subAccountSid       = subAccount.sid;
                subAccountAuthToken = subAccount.authToken;
                await db.collection('churches').doc(churchId).update({
                    'smsSettings.twilioSubAccountSid':       subAccountSid,
                    'smsSettings.twilioSubAccountAuthToken': subAccountAuthToken,
                });
                log.info(`Created fallback sub-account ${subAccountSid} for church ${churchId}`, 'system', { churchId, subAccountSid }, churchId);
            }
        } else {
            // No sub-account on file — create a brand new one
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
        // Use the master client acting on behalf of the sub-account.
        // This avoids relying on the stored sub-account auth token, which can
        // become stale or was never persisted correctly.
        const purchased = await master.api.v2010
            .accounts(subAccountSid)
            .incomingPhoneNumbers
            .create({
                phoneNumber,
                smsUrl:               inboundUrl,
                smsMethod:            'POST',
                statusCallback:       statusCallback,
                statusCallbackMethod: 'POST',
            });

        log.info(`Purchased number ${phoneNumber} (SID: ${purchased.sid}) for church ${churchId}`, 'system', { churchId, phoneNumber, sid: purchased.sid }, churchId);

        // 5. Save SMS settings to Firestore
        // Use dot-notation so we MERGE fields rather than replacing the entire smsSettings map.
        // This preserves termsAcceptedAt, twilioCustomerProfileSid, twilioA2pStatus, etc.
        const now = Date.now();
        await db.collection('churches').doc(churchId).update({
            'smsSettings.smsEnabled':               true,
            'smsSettings.twilioSubAccountSid':       subAccountSid,
            'smsSettings.twilioSubAccountAuthToken': subAccountAuthToken,
            'smsSettings.twilioPhoneNumber':         phoneNumber,
            'smsSettings.twilioPhoneSid':            purchased.sid,
            'smsSettings.twilioA2pStatus':           existingSms.twilioA2pStatus || 'not_started',
            'smsSettings.senderName':                senderName || church.name || 'Church',
        });

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

        if (twilioSubAccountSid && twilioPhoneSid) {
            try {
                const { accountSid, authToken } = await getMasterCredentials(db);
                const masterForRelease = getMasterClient(accountSid, authToken);
                await masterForRelease.api.v2010
                    .accounts(twilioSubAccountSid)
                    .incomingPhoneNumbers(twilioPhoneSid)
                    .remove();
                log.info(`Released phone number (SID: ${twilioPhoneSid}) for church ${churchId}`, 'system', { churchId }, churchId);
            } catch (releaseErr: any) {
                log.warn(`[releaseTwilioNumber] Twilio release error (continuing): ${releaseErr.message}`, 'system', { churchId }, churchId);
            }
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

        if (!smsSettings.twilioSubAccountSid) {
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

        // Use master credentials acting on behalf of the sub-account.
        // The master Twilio account can always manage its own sub-accounts
        // without needing the sub-account's own auth token.
        const { accountSid, authToken } = await getMasterCredentials(db);
        const master = getMasterClient(accountSid, authToken);

        // Purchase the additional number under the sub-account
        const purchased = await master.api.v2010
            .accounts(smsSettings.twilioSubAccountSid)
            .incomingPhoneNumbers
            .create({
                phoneNumber,
                smsUrl:               inboundUrl,
                smsMethod:            'POST',
                statusCallback,
                statusCallbackMethod: 'POST',
            });

        const now      = Date.now();
        const numDocId = `${churchId}_${purchased.sid}`;

        // Check if this is the first number for this church
        const existingNums = await db.collection('twilioNumbers')
            .where('churchId', '==', churchId)
            .limit(1)
            .get();
        const isFirstNumber = existingNums.empty;

        await db.collection('twilioNumbers').doc(numDocId).set({
            id:             numDocId,
            churchId,
            phoneNumber,
            phoneSid:       purchased.sid,
            friendlyLabel:  friendlyLabel || phoneNumber,
            isDefault:      isFirstNumber,   // first number becomes the default
            smsEnabled:     true,
            allowedUserIds: [],
            webhookUrl:     inboundUrl,
            senderName:     smsSettings.senderName || church.name || 'Church',
            createdAt:      now,
            updatedAt:      now,
        });

        // Also keep smsSettings in sync so getSubClient can find the from-number
        // Use dot-notation to avoid overwriting other smsSettings fields
        await db.collection('churches').doc(churchId).update({
            'smsSettings.smsEnabled':         true,
            'smsSettings.twilioSubAccountSid': smsSettings.twilioSubAccountSid,
            ...(isFirstNumber ? {
                'smsSettings.twilioPhoneNumber': phoneNumber,
                'smsSettings.twilioPhoneSid':    purchased.sid,
            } : {}),
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

        if (sms.twilioSubAccountSid && numData.phoneSid) {
            // Use master credentials acting on behalf of the sub-account
            const { accountSid: masterSid, authToken: masterToken } = await getMasterCredentials(db);
            const masterClient = getMasterClient(masterSid, masterToken);
            try {
                await masterClient.api.v2010
                    .accounts(sms.twilioSubAccountSid)
                    .incomingPhoneNumbers(numData.phoneSid)
                    .remove();
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

// ─── GET /api/messaging/customer-profile-status ──────────────────────────────
// Pulls the current CustomerProfile status directly from Twilio and syncs
// it back to Firestore.  Called from the UI "Refresh Status" button.
// Query: ?churchId=xxx

export const refreshCustomerProfileStatus = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const churchId = req.query.churchId as string;
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        // Load church settings
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const sms: any = (churchSnap.data() as any)?.smsSettings || {};

        const profileSid = sms.twilioCustomerProfileSid || '';
        if (!profileSid || !profileSid.startsWith('BU')) {
            return res.status(400).json({ error: 'No Customer Profile SID on file for this church.' });
        }

        // Fetch status from Twilio — use sub-account credentials so Trust Hub returns the
        // correct profile. Trust Hub authenticates by credential identity, not URL path.
        const { accountSid, authToken } = await getMasterCredentials(db);
        const subAccountSid       = sms.twilioSubAccountSid       as string | undefined;
        const subAccountAuthToken = sms.twilioSubAccountAuthToken as string | undefined;
        const master = subAccountSid && subAccountAuthToken
            ? getMasterClient(subAccountSid, subAccountAuthToken)
            : getMasterClient(accountSid, authToken, subAccountSid);

        const profile = await (master as any).trusthub.v1
            .customerProfiles(profileSid)
            .fetch();

        const newStatus = (profile.status || 'unknown').toLowerCase();

        // Sync to Firestore
        await db.collection('churches').doc(churchId).update({
            'smsSettings.twilioCustomerProfileStatus':    newStatus,
            'smsSettings.twilioCustomerProfileUpdatedAt': Date.now(),
        });

        log.info(
            `[refreshCustomerProfileStatus] ${profileSid} → ${newStatus} (manual refresh)`,
            'system', { churchId, profileSid, newStatus }, churchId
        );

        return res.json({ success: true, status: newStatus, profileSid });

    } catch (e: any) {
        log.error(`[refreshCustomerProfileStatus] ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Refresh failed' });
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


// NOTE: registerA2p() was deprecated and removed — the canonical path is:
//   createCustomerProfile → registerBrand → createMessagingService → registerCampaign → assignNumbersToService
// The /api/messaging/a2p-register route was decommissioned from server.ts.


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

        // Brand lives on the sub-account — scope the client accordingly.
        // messaging.twilio.com uses auth identity to determine account context.
        const subAccountSid = smsSettings.twilioSubAccountSid as string | undefined;
        const master = getMasterClient(accountSid, authToken, subAccountSid);

        // ── Fetch brand status from Twilio ───────────────────────────────────────
        let twilioStatus   = 'pending';
        let failureReason: string | null = null;
        let brandDetails: any = {};

        // Also capture the associated SIDs from the brand object
        let customerProfileBundleSidFromBrand: string | null = null;
        let a2pProfileBundleSidFromBrand: string | null = null;

        try {
            const brandReg = await (master as any).messaging.v1.brandRegistrations(brandSid).fetch();
            twilioStatus   = (brandReg.status || 'pending').toLowerCase();
            failureReason  = brandReg.failureReason || null;
            // Capture associated profile SIDs — Twilio returns these on the brand object
            customerProfileBundleSidFromBrand = brandReg.customerProfileBundleSid || null;
            a2pProfileBundleSidFromBrand      = brandReg.a2PProfileBundleSid      || null;
            brandDetails   = {
                brandType:               brandReg.brandType,
                identity:                brandReg.identity,
                cspId:                   brandReg.cspId,
                dateCreated:             brandReg.dateCreated,
                dateUpdated:             brandReg.dateUpdated,
                customerProfileBundleSid: customerProfileBundleSidFromBrand,
                a2PProfileBundleSid:      a2pProfileBundleSidFromBrand,
            };
        } catch (twErr: any) {
            log.warn(
                `[checkA2pStatus] Could not fetch brand ${brandSid}: ${twErr.message}`,
                'system', { churchId, brandSid }, churchId
            );
            failureReason = `Twilio API error: ${twErr.message}`;
        }

        // Map Twilio's raw status string → our internal enum.
        // Twilio Brand Registration statuses (lowercased after fetch):
        //   approved, failed, in_review, pending, pending_review,
        //   unverified, draft, suspended
        const mappedStatus: 'not_started' | 'pending' | 'in_review' | 'approved' | 'failed' =
            twilioStatus === 'approved'       ? 'approved'  :
            twilioStatus === 'failed'         ? 'failed'    :
            twilioStatus === 'suspended'      ? 'failed'    :
            twilioStatus === 'in_review'      ? 'in_review' :
            twilioStatus === 'pending_review' ? 'in_review' :
            twilioStatus === 'pending'        ? 'pending'   :
            twilioStatus === 'unverified'     ? 'pending'   :
            twilioStatus === 'draft'          ? 'pending'   :
            'pending';

        // ── Sync back to Firestore ───────────────────────────────────────────────
        const updates: Record<string, any> = {
            'smsSettings.twilioA2pStatus':       mappedStatus,
            'smsSettings.twilioA2pRawStatus':    twilioStatus,   // raw Twilio string for debugging
            'smsSettings.a2pLastStatusCheck':    Date.now(),
        };
        if (failureReason) updates['smsSettings.a2pFailureReason'] = failureReason;
        // Auto-save SIDs surfaced from the brand object if not already stored
        const smsAtCheck = churchSnap.data()?.smsSettings || {};
        if (customerProfileBundleSidFromBrand && !smsAtCheck.twilioCustomerProfileSid) {
            updates['smsSettings.twilioCustomerProfileSid'] = customerProfileBundleSidFromBrand;
            log.info(`[checkA2pStatus] Auto-saved customerProfileBundleSid ${customerProfileBundleSidFromBrand} from brand`, 'system', { churchId }, churchId);
        }
        if (a2pProfileBundleSidFromBrand && !smsAtCheck.twilioA2pProfileSid) {
            updates['smsSettings.twilioA2pProfileSid'] = a2pProfileBundleSidFromBrand;
            log.info(`[checkA2pStatus] Auto-saved a2PProfileBundleSid ${a2pProfileBundleSidFromBrand} from brand`, 'system', { churchId }, churchId);
        }

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

// ── Helpers for Twilio field normalization ────────────────────────────────────

/** Convert any US phone string to E.164 (+1XXXXXXXXXX). Returns original if already E.164. */
function toE164(phone: string): string {
    if (!phone) return phone;
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    if (phone.startsWith('+')) return phone; // already E.164
    return `+1${digits}`; // best-effort
}

/**
 * Map human-readable industry/vertical names to Twilio's accepted
 * business_industry enum values (ALL-CAPS exactly as Twilio requires).
 * Full valid list from Twilio Trust Hub docs:
 * AGRICULTURE, AUTOMOTIVE, BANKING, CONSUMER, EDUCATION, ELECTRONICS,
 * ENERGY, ENGINEERING, FAST_MOVING_CONSUMER_GOODS, FINANCIAL, FINTECH,
 * FOOD_AND_BEVERAGE, GOVERNMENT, HEALTHCARE, HOSPITALITY, INSURANCE,
 * JEWELRY, LEGAL, MANUFACTURING, MEDIA, NOT_FOR_PROFIT, OIL_AND_GAS,
 * ONLINE, RAW_MATERIALS, REAL_ESTATE, RELIGION, RETAIL, TECHNOLOGY,
 * TELECOMMUNICATIONS, TRANSPORTATION, TRAVEL
 */
function toTwilioIndustry(vertical: string): string {
    const map: Record<string, string> = {
        // Already correct Twilio values – pass through
        'religion':              'RELIGION',
        'not_for_profit':        'NOT_FOR_PROFIT',
        'not for profit':        'NOT_FOR_PROFIT',
        'nonprofit':             'NOT_FOR_PROFIT',
        'non-profit':            'NOT_FOR_PROFIT',
        'ngo':                   'NOT_FOR_PROFIT',
        'education':             'EDUCATION',
        'healthcare':            'HEALTHCARE',
        'government':            'GOVERNMENT',
        'online':                'ONLINE',
        'media':                 'MEDIA',
        'consumer':              'CONSUMER',
        'agriculture':           'AGRICULTURE',
        'automotive':            'AUTOMOTIVE',
        'banking':               'BANKING',
        'construction':          'ENGINEERING',
        'energy':                'ENERGY',
        'entertainment':         'MEDIA',
        'financial':             'FINANCIAL',
        'fintech':               'FINTECH',
        'food':                  'FOOD_AND_BEVERAGE',
        'food and beverage':     'FOOD_AND_BEVERAGE',
        'hospitality':           'HOSPITALITY',
        'insurance':             'INSURANCE',
        'jewelry':               'JEWELRY',
        'legal':                 'LEGAL',
        'manufacturing':         'MANUFACTURING',
        'oil':                   'OIL_AND_GAS',
        'oil and gas':           'OIL_AND_GAS',
        'real estate':           'REAL_ESTATE',
        'retail':                'RETAIL',
        'technology':            'TECHNOLOGY',
        'telecommunications':    'TELECOMMUNICATIONS',
        'telecom':               'TELECOMMUNICATIONS',
        'transportation':        'TRANSPORTATION',
        'travel':                'TRAVEL',
        'professional services': 'TECHNOLOGY', // closest match
    };
    const key = (vertical || '').toLowerCase().trim();
    // If it's already an all-caps Twilio enum value, pass through
    if (/^[A-Z_]+$/.test(vertical.trim())) return vertical.trim();
    return map[key] || 'RELIGION'; // default for churches
}

/**
 * Map job level dropdown labels to Twilio's accepted job_position enum values.
 * Twilio accepts: Director, GM, VP, CEO, CFO, General Counsel, Other
 */
function toTwilioJobPosition(pos: string): string {
    const map: Record<string, string> = {
        'director':        'Director',
        'vp':              'VP',
        'gm':              'GM',
        'ceo':             'CEO',
        'cfo':             'CFO',
        'general counsel': 'General Counsel',
        'technician':      'Director', // map to closest valid value
        'other':           'Other',
    };
    return map[(pos || '').toLowerCase().trim()] || 'Director';
}

export const createCustomerProfile = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const { accountSid, authToken } = await getMasterCredentials(db);

        // Load church data first so we can extract sub-account credentials
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const sms = churchSnap.data()?.smsSettings || {};

        // ISV Architecture #1: Trust Hub resources MUST be created on the church's sub-account.
        // The Trust Hub API (trusthub.twilio.com) determines account ownership by credential
        // identity — not by URL path. Master credentials always create resources on the master
        // account regardless of any sub-account scoping option on the SDK client.
        // Solution: authenticate as the sub-account directly using its stored auth token.
        const subAccountSid       = sms.twilioSubAccountSid       as string | undefined;
        const subAccountAuthToken = sms.twilioSubAccountAuthToken as string | undefined;
        if (!subAccountSid || !subAccountAuthToken) {
            return res.status(400).json({
                error: 'No Twilio sub-account provisioned for this church. ' +
                    'Complete number setup first (Step 1) to create the sub-account.',
            });
        }
        // Sub-account native client — all Trust Hub calls land on the church's sub-account
        const master = getMasterClient(subAccountSid, subAccountAuthToken);

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

        // ── Step 1a: Create a Twilio Address resource ─────────────────────────────
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

        // ── Step 1b: Business info EndUser ────────────────────────────────────────
        // customer_profile_business_information does NOT accept address fields inline.
        // Address is referenced through a separate SupportingDocument (Step 1c).
        const bizEndUser = await (master as any).trusthub.v1.endUsers.create({
            friendlyName: `Business Info – ${sms.a2pBusinessName}`,
            type: 'customer_profile_business_information',
            attributes: JSON.stringify({
                business_name:                    sms.a2pBusinessName,
                business_registration_identifier: 'EIN',
                business_registration_number:     sms.a2pEin,
                business_type:                    sms.a2pBusinessType || 'Non-profit Corporation',
                business_industry:                toTwilioIndustry(sms.a2pVertical || 'RELIGION'),
                business_identity:                'direct_customer',
                business_regions_of_operation:    'USA_AND_CANADA',
                website_url:                      sms.a2pWebsite,
            }),
        });
        log.info(`[createCustomerProfile] Created biz EndUser ${bizEndUser.sid}`, 'system', { churchId }, churchId);

        // ── Step 1c: Create SupportingDocument for the address via direct REST API ──
        // The Twilio Node SDK double-encodes "attributes" for SupportingDocuments,
        // so we bypass it and make a raw form-encoded POST to the TrustHub API.
        // Raw fetch uses sub-account credentials — matching the SDK client above
        const subAuth = Buffer.from(`${subAccountSid}:${subAccountAuthToken}`).toString('base64');
        const addrDocResp = await fetch('https://trusthub.twilio.com/v1/SupportingDocuments', {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${subAuth}`,
                'Content-Type':  'application/x-www-form-urlencoded',
            },
            body: new URLSearchParams({
                FriendlyName: `Business Address - ${sms.a2pBusinessName}`,
                Type:         'customer_profile_address',
                Attributes:   JSON.stringify({ address_sids: bizAddress.sid }),
            }).toString(),
        });
        const addrDocData = await addrDocResp.json() as any;
        if (!addrDocData.sid) {
            throw new Error(
                `Failed to create address SupportingDocument: ${addrDocData.message || addrDocData.code || JSON.stringify(addrDocData)}`
            );
        }
        log.info(`[createCustomerProfile] Created address SupportingDocument ${addrDocData.sid}`, 'system', { churchId }, churchId);

        // ── Step 1d: Authorised rep 1 EndUser ────────────────────────────────────
        const repEndUser = await (master as any).trusthub.v1.endUsers.create({
            friendlyName: `${sms.a2pContactFirstName} ${sms.a2pContactLastName} – ${sms.a2pBusinessName}`,
            type: 'authorized_representative_1',
            attributes: JSON.stringify({
                first_name:     sms.a2pContactFirstName,
                last_name:      sms.a2pContactLastName,
                email:          sms.a2pContactEmail,
                phone_number:   toE164(sms.a2pContactPhone),
                job_position:   toTwilioJobPosition(sms.a2pContactJobPosition),
                business_title: sms.a2pContactJobTitle || sms.a2pContactJobPosition || 'Director',
            }),
        });
        log.info(`[createCustomerProfile] Created rep1 EndUser ${repEndUser.sid}`, 'system', { churchId }, churchId);

        // ── Step 1e: Authorised rep 2 EndUser (optional) ──────────────────────────
        let rep2EndUser: any = null;
        const hasRep2 = sms.a2pRep2FirstName && sms.a2pRep2LastName && sms.a2pRep2Email && sms.a2pRep2Phone;
        if (hasRep2) {
            rep2EndUser = await (master as any).trusthub.v1.endUsers.create({
                friendlyName: `${sms.a2pRep2FirstName} ${sms.a2pRep2LastName} – ${sms.a2pBusinessName} (Rep 2)`,
                type: 'authorized_representative_2',
                attributes: JSON.stringify({
                    first_name:     sms.a2pRep2FirstName,
                    last_name:      sms.a2pRep2LastName,
                    email:          sms.a2pRep2Email,
                    phone_number:   toE164(sms.a2pRep2Phone),
                    job_position:   toTwilioJobPosition(sms.a2pRep2JobPosition),
                    business_title: sms.a2pRep2JobTitle || sms.a2pRep2JobPosition || 'Director',
                }),
            });
            log.info(`[createCustomerProfile] Created rep2 EndUser ${rep2EndUser.sid}`, 'system', { churchId }, churchId);
        } else {
            log.info(`[createCustomerProfile] Rep 2 not provided – skipping`, 'system', { churchId }, churchId);
        }

        // ── Step 2: Create the CustomerProfile bundle ──────────────────────────────
        const sysSnap = await db.doc('system/settings').get();
        const sysData = sysSnap.data() || {};
        const baseUrl = (
            sysData.twilioWebhookBaseUrl ||
            sysData.apiBaseUrl ||
            process.env.SERVER_BASE_URL || ''
        ).replace(/\/$/, '');

        // Primary Customer Profile SID (Hon Ventures LLC / the ISV master account profile)
        // This BU... SID must be assigned as an entity in every secondary profile.
        const primaryCpSid: string = sysData.primaryCustomerProfileSid || '';
        if (!primaryCpSid || !primaryCpSid.startsWith('BU')) {
            return res.status(400).json({
                error: 'Primary Customer Profile SID is not configured. ' +
                    'Go to Settings → SMS → A2P Registration and save the Primary Customer Profile SID ' +
                    '(the BU... SID for Hon Ventures LLC from the Twilio Console).',
            });
        }

        const profile = await (master as any).trusthub.v1.customerProfiles.create({
            friendlyName:   sms.a2pBusinessName,
            email:          sms.a2pContactEmail,
            policySid:      A2P_POLICY_SID,
            statusCallback: baseUrl ? `${baseUrl}/api/messaging/trust-hub-status` : undefined,
        });
        log.info(`[createCustomerProfile] Created CustomerProfile ${profile.sid}`, 'system', { churchId }, churchId);

        // ── Step 3: Assign entities to the bundle ─────────────────────────────────
        // Required entity types for a secondary customer profile:
        //   BU... (Primary Customer Profile — links this secondary to Hon Ventures LLC)
        //   IT... (EndUser: bizEndUser + repEndUser + optional rep2EndUser)
        //   RD... (SupportingDocument: address)

        // 3a: Link to the Primary Customer Profile (Hon Ventures LLC)
        await (master as any).trusthub.v1
            .customerProfiles(profile.sid)
            .customerProfilesEntityAssignments
            .create({ objectSid: primaryCpSid });
        log.info(`[createCustomerProfile] Linked primary CP ${primaryCpSid} → ${profile.sid}`, 'system', { churchId }, churchId);

        // 3b: Business info EndUser
        await (master as any).trusthub.v1
            .customerProfiles(profile.sid)
            .customerProfilesEntityAssignments
            .create({ objectSid: bizEndUser.sid });

        // 3c: Address SupportingDocument
        await (master as any).trusthub.v1
            .customerProfiles(profile.sid)
            .customerProfilesEntityAssignments
            .create({ objectSid: addrDocData.sid });   // RD... address

        // 3d: Authorized rep 1
        await (master as any).trusthub.v1
            .customerProfiles(profile.sid)
            .customerProfilesEntityAssignments
            .create({ objectSid: repEndUser.sid });

        // 3e: Authorized rep 2 (optional)
        if (rep2EndUser) {
            await (master as any).trusthub.v1
                .customerProfiles(profile.sid)
                .customerProfilesEntityAssignments
                .create({ objectSid: rep2EndUser.sid });
        }

        const assignedCount = rep2EndUser ? 5 : 4;
        log.info(`[createCustomerProfile] Assigned ${assignedCount} entities to ${profile.sid}`, 'system', { churchId }, churchId);

        // ── Step 3b: Compliance evaluation (non-fatal) ────────────────────────────
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
                `[createCustomerProfile] Evaluation: ${evaluationStatus}`,
                'system', { churchId, evaluationStatus }, churchId
            );
        } catch (evalErr: any) {
            log.warn(
                `[createCustomerProfile] Evaluation failed (non-fatal): ${evalErr.message}`,
                'system', { churchId }, churchId
            );
        }

        // ── Step 4: Submit for Twilio review ──────────────────────────────────────
        await (master as any).trusthub.v1
            .customerProfiles(profile.sid)
            .update({ status: 'pending-review' });
        log.info(`[createCustomerProfile] Submitted profile ${profile.sid} for review`, 'system', { churchId }, churchId);

        // ── Step 5: Persist to Firestore ──────────────────────────────────────────
        const firestoreUpdate: Record<string, any> = {
            'smsSettings.twilioCustomerProfileSid':        profile.sid,
            'smsSettings.twilioEndUserSid':                bizEndUser.sid,
            'smsSettings.twilioRepEndUserSid':             repEndUser.sid,
            'smsSettings.twilioAddressSid':                bizAddress.sid,
            'smsSettings.twilioSupportingDocSid':          addrDocData.sid,
            'smsSettings.twilioSupportingDocCreatedAt':     Date.now(),   // tracks 30-day PII MTL
            'smsSettings.twilioPrimaryCustomerProfileSid': primaryCpSid,
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
            rep2EndUserSid:    rep2EndUser?.sid ?? null,
            evaluationStatus,
            evaluationResults: isCompliant ? [] : evaluationResults,
            status:            'pending-review',
            message:           isCompliant
                ? 'Customer Profile Bundle created, passed compliance evaluation, and submitted for Twilio review. ' +
                  'Approval is typically same-day. Once approved, click "Submit to Twilio" to complete A2P brand registration.'
                : `Customer Profile Bundle created and submitted, but compliance evaluation returned "${evaluationStatus}". ` +
                  'Twilio may still approve it manually.',
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


// ─── DELETE /api/messaging/customer-profile ─────────────────────────────────
// Deletes the Twilio TrustHub Customer Profile Bundle and all associated
// entities (EndUsers, Address, SupportingDocument) for the church.
// IMPORTANT: Twilio only allows deletion of profiles in 'draft' or
// 'twilio-rejected' status. Pending/approved profiles cannot be deleted
// via API — only via Twilio Support.
// Body: { churchId }

export const deleteCustomerProfile = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const { accountSid, authToken } = await getMasterCredentials(db);

        // Load church first so we can use sub-account credentials for Trust Hub operations
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const sms = churchSnap.data()?.smsSettings || {};

        // Use sub-account credentials for Trust Hub (profiles, EndUsers, SupportingDocuments)
        const subAccountSid       = sms.twilioSubAccountSid       as string | undefined;
        const subAccountAuthToken = sms.twilioSubAccountAuthToken as string | undefined;
        const master = subAccountSid && subAccountAuthToken
            ? getMasterClient(subAccountSid, subAccountAuthToken)
            : getMasterClient(accountSid, authToken, subAccountSid);
        const masterAuth = subAccountSid && subAccountAuthToken
            ? Buffer.from(`${subAccountSid}:${subAccountAuthToken}`).toString('base64')
            : Buffer.from(`${accountSid}:${authToken}`).toString('base64');

        const profileSid = sms.twilioCustomerProfileSid as string | undefined;
        if (!profileSid) {
            return res.status(400).json({ error: 'No Customer Profile SID on file for this church.' });
        }

        // ── Check current profile status ─────────────────────────────────────
        // Only draft / twilio-rejected can be deleted via API.
        let currentStatus = (sms.twilioCustomerProfileStatus || '').toLowerCase();

        // Re-fetch live status from Twilio to be sure
        try {
            const liveProfile = await (master as any).trusthub.v1.customerProfiles(profileSid).fetch();
            currentStatus = (liveProfile.status || '').toLowerCase();
        } catch (fetchErr: any) {
            log.warn(`[deleteCustomerProfile] Could not fetch live status for ${profileSid}: ${fetchErr.message}`, 'system', { churchId }, churchId);
        }

        const isDeletable = currentStatus === 'draft' || currentStatus === 'twilio-rejected';
        if (!isDeletable) {
            return res.status(409).json({
                error: `Customer Profile cannot be deleted while in "${currentStatus}" status. ` +
                    'Twilio only allows deletion of profiles in draft or twilio-rejected status. ' +
                    'To remove an approved or pending profile, please contact Twilio Support.',
                status: currentStatus,
            });
        }

        const errors: string[] = [];

        // ── Step 1: Delete the Customer Profile bundle ────────────────────────
        try {
            await (master as any).trusthub.v1.customerProfiles(profileSid).remove();
            log.info(`[deleteCustomerProfile] Deleted profile ${profileSid}`, 'system', { churchId }, churchId);
        } catch (e: any) {
            errors.push(`Profile delete error: ${e.message}`);
            log.warn(`[deleteCustomerProfile] Could not delete profile ${profileSid}: ${e.message}`, 'system', { churchId }, churchId);
        }

        // ── Step 2: Delete EndUser SIDs ───────────────────────────────────────
        const endUserSids = [
            sms.twilioEndUserSid,
            sms.twilioRepEndUserSid,
            sms.twilioRep2EndUserSid,
        ].filter(Boolean) as string[];

        for (const sid of endUserSids) {
            try {
                await (master as any).trusthub.v1.endUsers(sid).remove();
                log.info(`[deleteCustomerProfile] Deleted EndUser ${sid}`, 'system', { churchId }, churchId);
            } catch (e: any) {
                errors.push(`EndUser ${sid} delete error: ${e.message}`);
                log.warn(`[deleteCustomerProfile] Could not delete EndUser ${sid}: ${e.message}`, 'system', { churchId }, churchId);
            }
        }

        // ── Step 3: Delete SupportingDocument ────────────────────────────────
        if (sms.twilioSupportingDocSid) {
            try {
                const delResp = await fetch(`https://trusthub.twilio.com/v1/SupportingDocuments/${sms.twilioSupportingDocSid}`, {
                    method: 'DELETE',
                    headers: { 'Authorization': `Basic ${masterAuth}` },
                });
                if (delResp.ok || delResp.status === 404) {
                    log.info(`[deleteCustomerProfile] Deleted SupportingDocument ${sms.twilioSupportingDocSid}`, 'system', { churchId }, churchId);
                } else {
                    const body = await delResp.text();
                    errors.push(`SupportingDoc delete error (HTTP ${delResp.status}): ${body.slice(0, 100)}`);
                }
            } catch (e: any) {
                errors.push(`SupportingDoc delete error: ${e.message}`);
            }
        }

        // ── Step 4: Delete Address ────────────────────────────────────────────
        if (sms.twilioAddressSid) {
            try {
                await (master as any).addresses(sms.twilioAddressSid).remove();
                log.info(`[deleteCustomerProfile] Deleted Address ${sms.twilioAddressSid}`, 'system', { churchId }, churchId);
            } catch (e: any) {
                errors.push(`Address delete error: ${e.message}`);
                log.warn(`[deleteCustomerProfile] Could not delete Address ${sms.twilioAddressSid}: ${e.message}`, 'system', { churchId }, churchId);
            }
        }

        // ── Step 5: Clear Firestore fields ────────────────────────────────────
        await db.collection('churches').doc(churchId).update({
            'smsSettings.twilioCustomerProfileSid':        null,
            'smsSettings.twilioCustomerProfileStatus':     null,
            'smsSettings.twilioCustomerProfileEvaluation': null,
            'smsSettings.twilioCustomerProfileCreatedAt':  null,
            'smsSettings.twilioEndUserSid':                null,
            'smsSettings.twilioRepEndUserSid':             null,
            'smsSettings.twilioRep2EndUserSid':            null,
            'smsSettings.twilioAddressSid':                null,
            'smsSettings.twilioSupportingDocSid':          null,
        });

        log.info(`[deleteCustomerProfile] Cleared Firestore profile fields for church ${churchId}`, 'system', { churchId, errors }, churchId);

        return res.json({
            success: true,
            message: 'Customer Profile Bundle and associated entities have been deleted.',
            warnings: errors.length > 0 ? errors : undefined,
        });

    } catch (e: any) {
        log.error(`[deleteCustomerProfile] Failed for ${churchId}: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Failed to delete Customer Profile' });
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

// ─── POST /api/messaging/register-brand ─────────────────────────────────────
// Idempotent brand registration. If twilioBrandSid already exists, refreshes
// its status from Twilio instead of creating a duplicate. The Customer Profile
// Bundle must be approved before Twilio will accept the brand.
// Body: { churchId }

export const registerBrand = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const { churchId } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const { accountSid, authToken } = await getMasterCredentials(db);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const sms = churchSnap.data()?.smsSettings || {};

        // Brand registration must be scoped to the church's sub-account — the account
        // that will own the phone numbers and send messages. Twilio requires all A2P
        // resources (brand, service, campaign) to live on the same account as the numbers.
        const subAccountSid = sms.twilioSubAccountSid as string | undefined;
        if (!subAccountSid) {
            return res.status(400).json({
                error: 'No Twilio sub-account SID found for this church. Provision a phone number first (Step 1/2) to create the sub-account.',
            });
        }
        // Authenticate with master creds but scope all API calls to the sub-account
        const client = getMasterClient(accountSid, authToken, subAccountSid);

        // ── Idempotency: brand already registered → refresh status ────────────────
        if (sms.twilioBrandSid) {
            let twilioStatus = 'pending';
            let failureReason: string | null = null;
            try {
                const brandReg = await (client as any).messaging.v1
                    .brandRegistrations(sms.twilioBrandSid).fetch();
                twilioStatus  = (brandReg.status || 'pending').toLowerCase();
                failureReason = brandReg.failureReason || null;
            } catch (fetchErr: any) {
                log.warn(`[registerBrand] Could not fetch existing brand: ${fetchErr.message}`, 'system', { churchId }, churchId);
            }
            const mapped: 'approved' | 'failed' | 'in_review' | 'pending' =
                twilioStatus === 'approved'       ? 'approved'
              : twilioStatus === 'failed'         ? 'failed'
              : twilioStatus === 'suspended'      ? 'failed'
              : twilioStatus === 'in_review'      ? 'in_review'
              : twilioStatus === 'pending_review' ? 'in_review'
              : 'pending';
            await db.collection('churches').doc(churchId).update({
                'smsSettings.twilioA2pStatus':    mapped,
                'smsSettings.a2pLastStatusCheck': Date.now(),
                ...(failureReason ? { 'smsSettings.a2pFailureReason': failureReason } : {}),
            });
            return res.json({
                success: true, brandSid: sms.twilioBrandSid,
                status: mapped, twilioStatus, failureReason,
                alreadyRegistered: true,
                message: mapped === 'approved'
                    ? 'Brand already approved. Proceed to create a Messaging Service.'
                    : `Brand registration is ${mapped}. Approval typically takes 1–5 business days.`,
            });
        }

        // ── Validate prerequisites ────────────────────────────────────────────────
        const profileSid = sms.twilioCustomerProfileSid as string | undefined;
        if (!profileSid) {
            return res.status(400).json({
                error: 'Customer Profile Bundle (BU...) not found. Complete Step 3 (Create Customer Profile) first.',
            });
        }
        if (!sms.a2pBusinessName || !sms.a2pContactEmail) {
            return res.status(400).json({
                error: 'Business name and contact email are required. Save the Registration Info form first.',
            });
        }

        // ── Read A2P Profile Bundle SID from system settings ──────────────────────
        // Twilio requires a2PProfileBundleSid (BN...) — the ISV master A2P profile bundle.
        // Set this in System Settings → Twilio SMS → A2P Profile Bundle SID.
        const sysSnap = await db.doc('system/settings').get();
        const sysData = sysSnap.data() || {};
        const a2pProfileSid: string = sysData.twilioA2pProfileBundleSid || sms.twilioA2pProfileSid || '';
        if (!a2pProfileSid || !a2pProfileSid.startsWith('BN')) {
            return res.status(400).json({
                error: 'A2P Profile Bundle SID (BN...) is not configured. ' +
                    'Go to System Settings → Twilio SMS → A2P Profile Bundle SID and click "Fetch from Twilio" or paste it manually.',
            });
        }

        // ── Submit brand registration (scoped to sub-account) ────────────────────
        const brand = await (client as any).messaging.v1.brandRegistrations.create({
            customerProfileBundleSid: profileSid,
            a2PProfileBundleSid:      a2pProfileSid,
            friendlyName: sms.a2pBusinessName,
            email:        sms.a2pContactEmail,
            phone:        toE164(sms.a2pContactPhone || ''),
            website:      sms.a2pWebsite || '',
            // mock: true can be passed in body during dev to test without live billing
            ...(req.body.mockMode === true && process.env.NODE_ENV !== 'production'
                ? { mock: true } : {}),
        });

        await db.collection('churches').doc(churchId).update({
            'smsSettings.twilioBrandSid':  brand.sid,
            'smsSettings.twilioA2pStatus': 'pending',
            'smsSettings.a2pSubmittedAt':  Date.now(),
        });

        log.info(`[registerBrand] Brand ${brand.sid} submitted for ${churchId} under sub-account ${subAccountSid}`, 'system', { churchId, brandSid: brand.sid, subAccountSid }, churchId);

        return res.json({
            success:  true,
            brandSid: brand.sid,
            status:   'pending',
            message:  'Brand registration submitted to Twilio. Approval typically takes 1–5 business days.',
        });

    } catch (e: any) {
        log.error(`[registerBrand] Failed for ${churchId}: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Brand registration failed', twilioCode: (e as any).code });
    }
};


// ─── POST /api/messaging/create-messaging-service ────────────────────────────
// Creates a Twilio Messaging Service (MG...) which is the container that links
// phone numbers to an A2P campaign for compliance routing.
// Body: { churchId }

export const createMessagingService = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const { churchId } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const { accountSid, authToken } = await getMasterCredentials(db);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const sms    = churchSnap.data()?.smsSettings || {};
        const church = churchSnap.data() || {};

        // Messaging Service must live on the church's sub-account
        const subAccountSid = sms.twilioSubAccountSid as string | undefined;
        if (!subAccountSid) {
            return res.status(400).json({
                error: 'No Twilio sub-account SID found for this church. Provision a phone number first.',
            });
        }
        const client = getMasterClient(accountSid, authToken, subAccountSid);

        // ── Idempotency ───────────────────────────────────────────────────────────
        if (sms.twilioMessagingServiceSid) {
            return res.json({
                success: true,
                messagingServiceSid: sms.twilioMessagingServiceSid,
                alreadyCreated: true,
                message: 'Messaging Service already created. Proceed to register the A2P campaign.',
            });
        }

        // ── Build webhook URLs ────────────────────────────────────────────────────
        const sysSnap = await db.doc('system/settings').get();
        const sysData = sysSnap.data() || {};
        const baseUrl = (
            sysData.twilioWebhookBaseUrl || sysData.apiBaseUrl ||
            process.env.SERVER_BASE_URL || ''
        ).replace(/\/$/, '');
        if (!baseUrl) throw new Error('Webhook Base URL is not configured in System Settings.');

        const inboundUrl     = `${baseUrl}/api/messaging/inbound`;
        const statusCallback = `${baseUrl}/api/messaging/status`;

        // ── Create Messaging Service (scoped to sub-account) ─────────────────────
        const svc = await (client as any).messaging.v1.services.create({
            friendlyName:      `${church.name || sms.a2pBusinessName || 'Church'} – PastoralCare`,
            inboundRequestUrl: inboundUrl,
            inboundMethod:     'POST',
            statusCallback,
            usecase:           'mixed',
            smartEncoding:     true,
            mmsConverter:      true,
        });

        await db.collection('churches').doc(churchId).update({
            'smsSettings.twilioMessagingServiceSid': svc.sid,
        });

        log.info(`[createMessagingService] Created MG ${svc.sid} for ${churchId} under sub-account ${subAccountSid}`, 'system', { churchId, sid: svc.sid, subAccountSid }, churchId);

        return res.json({
            success:             true,
            messagingServiceSid: svc.sid,
            message:             'Messaging Service created. Now register the A2P campaign.',
        });

    } catch (e: any) {
        log.error(`[createMessagingService] Failed for ${churchId}: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Failed to create Messaging Service', twilioCode: (e as any).code });
    }
};


// ─── POST /api/messaging/register-campaign ───────────────────────────────────
// Registers an A2P Use Case (campaign) under the Messaging Service.
// Twilio requires the Brand Registration to be in APPROVED status first.
// Body: { churchId }

function mapUseCase(category: string): string {
    const map: Record<string, string> = {
        'low_volume':     'LOW_VOLUME',
        'low volume':     'LOW_VOLUME',
        'mixed':          'MIXED',
        'notification':   'NOTIFICATION',
        'notifications':  'NOTIFICATION',
        'marketing':      'MARKETING',
        '2fa':            '2FA',
        'charity':        'CHARITY',
        'emergency':      'EMERGENCY_ALERTS',
        'religious':      'MIXED',
        'religion':       'MIXED',
        'non-profit':     'MIXED',
        'nonprofit':      'MIXED',
        'not_for_profit': 'MIXED',
    };
    const key = (category || 'LOW_VOLUME').toLowerCase().replace(/\s+/g, '_');
    return map[key] || 'LOW_VOLUME';
}

export const registerCampaign = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const { churchId } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const { accountSid, authToken } = await getMasterCredentials(db);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const sms    = churchSnap.data()?.smsSettings || {};
        const church = churchSnap.data() || {};

        // Campaign must be registered on the sub-account that owns the messaging service
        const subAccountSid = sms.twilioSubAccountSid as string | undefined;
        if (!subAccountSid) {
            return res.status(400).json({
                error: 'No Twilio sub-account SID found for this church. Provision a phone number first.',
            });
        }
        const client = getMasterClient(accountSid, authToken, subAccountSid);

        // ── Idempotency ───────────────────────────────────────────────────────────
        if (sms.twilioUsAppToPersonSid) {
            return res.json({
                success: true,
                usAppToPersonSid: sms.twilioUsAppToPersonSid,
                alreadyRegistered: true,
                message: 'A2P campaign already registered. Proceed to link phone numbers.',
            });
        }

        // ── Validate prerequisites ────────────────────────────────────────────────
        if (!sms.twilioBrandSid) {
            return res.status(400).json({ error: 'Brand Registration (BN...) is required. Complete Step 4 first.' });
        }
        if (!sms.twilioMessagingServiceSid) {
            return res.status(400).json({ error: 'Messaging Service (MG...) is required. Complete Step 5 first.' });
        }

        // Verify brand is APPROVED — fetch live status (can be fetched on sub-account)
        let brandStatus = (sms.twilioA2pStatus || 'pending').toLowerCase();
        try {
            const brandReg = await (client as any).messaging.v1
                .brandRegistrations(sms.twilioBrandSid).fetch();
            brandStatus = (brandReg.status || 'pending').toLowerCase();
            // Sync back
            await db.collection('churches').doc(churchId).update({
                'smsSettings.twilioA2pStatus': brandStatus === 'approved' ? 'approved'
                    : brandStatus === 'failed' ? 'failed' : 'pending',
            });
        } catch { /* use cached */ }

        if (brandStatus !== 'approved') {
            return res.status(400).json({
                error: `Brand Registration is "${brandStatus}" — Twilio requires APPROVED status before you can register a campaign. Check back after Twilio approves your brand (1–5 business days).`,
                brandStatus,
            });
        }

        // Validate sample messages (required by Twilio)
        const sample1   = (sms.a2pSampleMessage1 || sms.a2pMessageSample1 || '').trim();
        const sample2   = (sms.a2pSampleMessage2 || sms.a2pMessageSample2 || '').trim();
        if (!sample1 || !sample2) {
            return res.status(400).json({
                error: 'Two sample messages are required. Add them in Step 3 (Campaign Registration) of the A2P form and save before registering the campaign.',
            });
        }

        const churchName = church.name || sms.a2pBusinessName || 'Our Church';
        const optInMsg   = (sms.a2pUseCaseOptIn || sms.a2pOptInDescription || `You have opted in to receive messages from ${churchName}. Reply STOP to unsubscribe.`).trim();
        const useCase    = mapUseCase(sms.a2pUseCaseCategory || 'LOW_VOLUME');

        // ── Register the A2P campaign (scoped to sub-account) ───────────────────
        const campaign = await (client as any).messaging.v1
            .services(sms.twilioMessagingServiceSid)
            .usAppToPerson
            .create({
                brandRegistrationSid: sms.twilioBrandSid,
                description:          `Pastoral care, prayer requests, event notifications, and community outreach for ${churchName}.`,
                messageSamples:       [sample1, sample2],
                usAppToPersonUsecase: useCase,
                hasEmbeddedLinks:     false,
                hasEmbeddedPhone:     false,
                optInMessage:         optInMsg,
                optInKeywords:        ['JOIN', 'YES', 'START', 'SUBSCRIBE'],
                optOutMessage:        'You have been unsubscribed. Reply JOIN to re-subscribe.',
                optOutKeywords:       ['STOP', 'UNSUBSCRIBE', 'CANCEL', 'QUIT', 'END'],
                helpMessage:          `For help, contact ${churchName}. Reply STOP to unsubscribe.`,
                helpKeywords:         ['HELP', 'INFO'],
            });

        await db.collection('churches').doc(churchId).update({
            'smsSettings.twilioUsAppToPersonSid':  campaign.sid,
            'smsSettings.twilioA2pCampaignStatus': 'pending',
            'smsSettings.a2pCampaignSubmittedAt':  Date.now(),
        });

        log.info(`[registerCampaign] Campaign ${campaign.sid} registered for ${churchId} under sub-account ${subAccountSid}`, 'system', { churchId, sid: campaign.sid, subAccountSid }, churchId);

        return res.json({
            success:          true,
            usAppToPersonSid: campaign.sid,
            status:           'pending',
            message:          'A2P campaign registered. Now link your phone numbers to complete setup.',
        });

    } catch (e: any) {
        log.error(`[registerCampaign] Failed for ${churchId}: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Campaign registration failed', twilioCode: (e as any).code });
    }
};


// ─── POST /api/messaging/assign-numbers-to-service ───────────────────────────
// Links all twilioNumbers docs (by phoneSid) for the church to the Messaging
// Service. Falls back to smsSettings.twilioPhoneSid if no collection docs exist.
// Body: { churchId }

export const assignNumbersToService = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const { churchId } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const { accountSid, authToken } = await getMasterCredentials(db);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const sms = churchSnap.data()?.smsSettings || {};

        // Phone numbers and the messaging service live on the sub-account
        const subAccountSid = sms.twilioSubAccountSid as string | undefined;
        if (!subAccountSid) {
            return res.status(400).json({
                error: 'No Twilio sub-account SID found for this church. Provision a phone number first.',
            });
        }
        const client = getMasterClient(accountSid, authToken, subAccountSid);

        if (!sms.twilioMessagingServiceSid) {
            return res.status(400).json({ error: 'Messaging Service (MG...) not found. Complete Step 5 first.' });
        }

        const mgSid = sms.twilioMessagingServiceSid as string;

        // Gather phone SIDs (prefer twilioNumbers collection, fall back to smsSettings)
        const numsSnap = await db.collection('twilioNumbers')
            .where('churchId', '==', churchId).get();

        const targets: { docRef: any; sid: string; phone: string }[] = [];
        if (!numsSnap.empty) {
            numsSnap.docs.forEach(d => {
                const phoneSid = d.data().phoneSid as string | undefined;
                if (phoneSid) targets.push({ docRef: d.ref, sid: phoneSid, phone: d.data().phoneNumber || '' });
            });
        } else if (sms.twilioPhoneSid) {
            targets.push({ docRef: null, sid: sms.twilioPhoneSid, phone: sms.twilioPhoneNumber || '' });
        }

        if (targets.length === 0) {
            return res.status(400).json({ error: 'No phone numbers found to link. Provision a number first.' });
        }

        const results: { sid: string; phone: string; success: boolean; error?: string }[] = [];

        for (const { docRef, sid, phone } of targets) {
            try {
                await (client as any).messaging.v1
                    .services(mgSid)
                    .phoneNumbers
                    .create({ phoneNumberSid: sid });

                if (docRef) await docRef.update({ messagingServiceSid: mgSid, updatedAt: Date.now() });
                results.push({ sid, phone, success: true });
                log.info(`[assignNumbersToService] Linked ${sid} → ${mgSid} on sub-account ${subAccountSid}`, 'system', { churchId }, churchId);

            } catch (e: any) {
                // Error code 21710 = number already linked to this service
                if ((e as any).code === 21710 || (e.message || '').includes('already')) {
                    if (docRef) await docRef.update({ messagingServiceSid: mgSid, updatedAt: Date.now() });
                    results.push({ sid, phone, success: true });
                } else {
                    results.push({ sid, phone, success: false, error: e.message });
                    log.warn(`[assignNumbersToService] Failed to link ${sid}: ${e.message}`, 'system', { churchId }, churchId);
                }
            }
        }

        // Mark setup complete
        await db.collection('churches').doc(churchId).update({
            'smsSettings.twilioNumbersLinked':   true,
            'smsSettings.twilioNumbersLinkedAt': Date.now(),
        });

        const allSuccess = results.every(r => r.success);
        log.info(`[assignNumbersToService] Linked ${results.filter(r => r.success).length}/${results.length} numbers for ${churchId}`, 'system', { churchId }, churchId);

        return res.json({
            success: allSuccess,
            results,
            message: allSuccess
                ? `All ${results.length} number(s) linked to the Messaging Service. SMS setup is complete! ✅`
                : `${results.filter(r => r.success).length}/${results.length} numbers linked. See errors above.`,
        });

    } catch (e: any) {
        log.error(`[assignNumbersToService] Failed for ${churchId}: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Failed to assign numbers', twilioCode: (e as any).code });
    }
};


// ─── GET /api/messaging/campaign-status ──────────────────────────────────────
// Fetches the live A2P campaign (UsAppToPerson) status from Twilio and syncs
// it back to Firestore. Query: ?churchId=xxx

export const checkCampaignStatus = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const churchId = (req.query.churchId || req.body?.churchId) as string;
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const { accountSid, authToken } = await getMasterCredentials(db);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const sms = churchSnap.data()?.smsSettings || {};

        if (!sms.twilioUsAppToPersonSid || !sms.twilioMessagingServiceSid) {
            return res.json({ status: 'not_registered', message: 'Campaign not yet registered.' });
        }

        // Campaign status must be looked up on the sub-account that owns the messaging service
        const subAccountSid = sms.twilioSubAccountSid as string | undefined;
        const client = getMasterClient(accountSid, authToken, subAccountSid);

        const campaign = await (client as any).messaging.v1
            .services(sms.twilioMessagingServiceSid)
            .usAppToPerson(sms.twilioUsAppToPersonSid)
            .fetch();

        // Twilio campaign statuses: PENDING, IN_PROGRESS, VERIFIED, FAILED, EXPIRED, ACTIVE
        const twilioStatus = (campaign.campaignStatus || 'PENDING').toUpperCase();
        const mapped = (twilioStatus === 'VERIFIED' || twilioStatus === 'ACTIVE') ? 'approved'
                     : twilioStatus === 'FAILED'    ? 'failed'
                     : 'pending';

        await db.collection('churches').doc(churchId).update({
            'smsSettings.twilioA2pCampaignStatus':      mapped,
            'smsSettings.a2pCampaignStatusCheckedAt':   Date.now(),
        });

        log.info(`[checkCampaignStatus] Campaign ${sms.twilioUsAppToPersonSid} → ${twilioStatus} for ${churchId}`, 'system', { churchId }, churchId);

        return res.json({
            success:          true,
            status:           mapped,
            twilioStatus,
            usAppToPersonSid: sms.twilioUsAppToPersonSid,
        });

    } catch (e: any) {
        log.error(`[checkCampaignStatus] ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Campaign status check failed' });
    }
};

// ─── GET /api/messaging/primary-profile-sid ──────────────────────────────────
// Fetches the list of Customer Profiles from the master Twilio account and
// returns the BU... SID of the first approved / pending-review one. The admin
// can then save it into System Settings without opening the Twilio Console.
export const fetchPrimaryProfileSid = async (req: any, res: any) => {
    const db = getDb();
    const log = createServerLogger(db);
    try {
        const { accountSid, authToken } = await getMasterCredentials(db);
        const master = getMasterClient(accountSid, authToken);

        // Also read system settings so we can match the ISV company name if stored
        const sysSnap = await db.doc('system/settings').get();
        const sysData = sysSnap.data() || {};
        const isvName: string = (sysData.organizationName || sysData.isvName || 'Hon Ventures').toLowerCase();

        // List all customer profiles on the master account
        const profiles = await (master as any).trusthub.v1.customerProfiles.list({ pageSize: 50 });

        if (!profiles || profiles.length === 0) {
            return res.status(404).json({
                error: 'No Customer Profiles found on this Twilio master account. Create a Primary Customer Profile at: https://console.twilio.com/us1/develop/trust-hub/customer-profiles',
            });
        }

        const allProfiles = profiles.map((p: any) => ({
            sid:          p.sid,
            friendlyName: p.friendlyName,
            status:       p.status,
            policySid:    p.policySid,
        }));

        // ── Selection strategy ────────────────────────────────────────────────
        // On this master account, all church secondary profiles share the same
        // policySid (RNdfbf3fae0e1107f8aded0e7cead80bf5). The ISV primary profile
        // has a different, unique policySid. We identify the church secondary policy
        // by finding the policySid used by the majority of profiles, then exclude it.

        // Count how many profiles use each policySid
        const policyCounts: Record<string, number> = {};
        for (const p of profiles) {
            const ps = p.policySid || 'none';
            policyCounts[ps] = (policyCounts[ps] || 0) + 1;
        }
        // The "church secondary" policy is the one used by more than 1 profile
        const churchPolicySids = new Set(
            Object.entries(policyCounts)
                .filter(([, count]) => count > 1)
                .map(([sid]) => sid)
        );

        // Step 1: exclude profiles that use the church secondary policy
        let candidates = profiles.filter((p: any) =>
            !churchPolicySids.has(p.policySid || 'none')
        );

        // Step 2: among remaining, prefer the one whose name matches the ISV name
        const nameMatch = candidates.find((p: any) =>
            (p.friendlyName || '').toLowerCase().includes(isvName)
        );
        if (nameMatch) {
            const best = nameMatch;
            log.info(`[fetchPrimaryProfileSid] Selected by ISV name match: ${best.sid} "${best.friendlyName}"`, 'system', {}, 'system');
            return res.json({
                success:      true,
                primarySid:   best.sid,
                friendlyName: best.friendlyName,
                status:       best.status,
                policySid:    best.policySid,
                allProfiles,
                note: allProfiles.length > 1
                    ? `Found ${allProfiles.length} profiles. Selected ISV primary by name match (${best.sid}). If wrong, paste the correct BU... SID manually.`
                    : undefined,
            });
        }

        // Step 3: among non-church candidates, prefer approved status
        if (candidates.length === 0) candidates = profiles; // final fallback
        const priorityOrder = ['twilio-approved', 'approved', 'pending-review', 'draft'];
        let best: any = null;
        for (const status of priorityOrder) {
            best = candidates.find((p: any) => p.status === status);
            if (best) break;
        }
        if (!best) best = candidates[0];

        log.info(`[fetchPrimaryProfileSid] Selected by status: ${best.sid} "${best.friendlyName}"`, 'system', {}, 'system');

        return res.json({
            success:        true,
            primarySid:     best.sid,
            friendlyName:   best.friendlyName,
            status:         best.status,
            policySid:      best.policySid,
            allProfiles,
            note: allProfiles.length > 1
                ? `Found ${allProfiles.length} profiles. Selected the Primary Customer Profile (${best.sid}). If this is wrong, paste the correct BU... SID manually.`
                : undefined,
        });
    } catch (e: any) {
        log.error(`[fetchPrimaryProfileSid] ${e.message}`, 'system', {}, 'system');
        return res.status(500).json({ error: e.message || 'Failed to fetch Customer Profiles' });
    }
};

// ─── GET /api/messaging/secondary-profiles ───────────────────────────────────
// Lists all Customer Profile Bundles on the MASTER Twilio account, excluding
// the primary ISV profile. Used in App Config to identify and clean up profiles
// that were accidentally created on the master instead of a church sub-account.
export const listSecondaryProfiles = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const db  = getDb();
    const log = createServerLogger(db);
    try {
        const { accountSid, authToken } = await getMasterCredentials(db);
        const master = getMasterClient(accountSid, authToken);

        // Load system settings to get the primary profile SID to exclude
        const settingsSnap = await db.collection('system').doc('settings').get();
        const primarySid   = settingsSnap.data()?.primaryCustomerProfileSid as string | undefined;

        // Fetch all Customer Profiles from Trust Hub on the master account
        const profiles: any[] = await (master as any).trusthub.v1.customerProfiles.list({ pageSize: 50 });

        // Load all churches once to correlate profiles to church names
        const churchesSnap = await db.collection('churches').get();
        const profileToChurch: Record<string, { id: string; name: string }> = {};
        churchesSnap.forEach((doc: any) => {
            const sms = doc.data()?.smsSettings || {};
            if (sms.twilioCustomerProfileSid) {
                profileToChurch[sms.twilioCustomerProfileSid] = {
                    id:   doc.id,
                    name: doc.data()?.name || doc.id,
                };
            }
        });

        const secondary = profiles
            .filter((p: any) => p.sid !== primarySid)
            .map((p: any) => ({
                sid:          p.sid,
                friendlyName: p.friendlyName,
                status:       p.status,
                policySid:    p.policySid,
                dateCreated:  p.dateCreated,
                church:       profileToChurch[p.sid] || null,
                canDelete:    p.status === 'draft' || p.status === 'twilio-rejected',
            }));

        log.info(`[listSecondaryProfiles] Found ${secondary.length} secondary profiles on master account`, 'system', {}, 'system');
        return res.json({ success: true, profiles: secondary, primarySid: primarySid || null });

    } catch (e: any) {
        log.error(`[listSecondaryProfiles] ${e.message}`, 'system', {}, 'system');
        return res.status(500).json({ error: e.message || 'Failed to list profiles' });
    }
};

// ─── DELETE /api/messaging/secondary-profile ─────────────────────────────────
// Deletes a specific Customer Profile Bundle from the MASTER Twilio account.
// Safety checks: cannot delete the primary ISV profile, and Twilio only allows
// deletion of profiles in draft or twilio-rejected status.
export const deleteSecondaryProfile = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const { profileSid } = req.body || {};
    if (!profileSid?.startsWith('BU')) {
        return res.status(400).json({ error: 'Invalid or missing profileSid (must start with BU)' });
    }

    const db  = getDb();
    const log = createServerLogger(db);
    try {
        const { accountSid, authToken } = await getMasterCredentials(db);
        const master = getMasterClient(accountSid, authToken);

        // Safety: refuse to delete the primary ISV profile
        const settingsSnap = await db.collection('system').doc('settings').get();
        const primarySid   = settingsSnap.data()?.primaryCustomerProfileSid as string | undefined;
        if (primarySid && profileSid === primarySid) {
            return res.status(400).json({
                error: 'Cannot delete the primary ISV Customer Profile. This SID is configured in App Config as the master platform profile.',
            });
        }

        // Fetch the profile first to confirm it's in a deletable state
        let profile: any;
        try {
            profile = await (master as any).trusthub.v1.customerProfiles(profileSid).fetch();
        } catch (fetchErr: any) {
            return res.status(404).json({ error: `Profile ${profileSid} not found on master account: ${fetchErr.message}` });
        }

        const status = (profile.status || '').toLowerCase();
        if (status !== 'draft' && status !== 'twilio-rejected') {
            return res.status(400).json({
                error: `Profile "${profile.friendlyName}" is in "${status}" status and cannot be deleted via API. ` +
                    'Only draft or twilio-rejected profiles can be deleted programmatically. ' +
                    'Contact Twilio Support to cancel approved or pending profiles.',
                status,
                friendlyName: profile.friendlyName,
            });
        }

        // Delete the profile (Twilio cascades EndUsers and assignments)
        await (master as any).trusthub.v1.customerProfiles(profileSid).remove();

        // Also clear the Firestore reference if any church is pointing to this SID
        const churchesSnap = await db.collection('churches').get();
        const batch = db.batch();
        let cleared = 0;
        churchesSnap.forEach((doc: any) => {
            if (doc.data()?.smsSettings?.twilioCustomerProfileSid === profileSid) {
                batch.update(doc.ref, {
                    'smsSettings.twilioCustomerProfileSid':        null,
                    'smsSettings.twilioCustomerProfileStatus':     null,
                    'smsSettings.twilioCustomerProfileEvaluation': null,
                });
                cleared++;
            }
        });
        if (cleared > 0) await batch.commit();

        log.info(`[deleteSecondaryProfile] Deleted profile ${profileSid} from master account (cleared ${cleared} Firestore church refs)`, 'system', { profileSid, cleared }, 'system');

        return res.json({
            success: true,
            message: `Profile ${profileSid} ("${profile.friendlyName}") deleted from master account.${cleared > 0 ? ` Cleared Firestore reference from ${cleared} church(es).` : ''}`,
            clearedChurches: cleared,
        });

    } catch (e: any) {
        log.error(`[deleteSecondaryProfile] ${e.message}`, 'system', { profileSid }, 'system');
        return res.status(500).json({ error: e.message || 'Delete failed' });
    }
};

// ─── GET /api/messaging/a2p-profile-sid ──────────────────────────────────────

// Fetches the ISV A2P Profile Bundle (BN...) from the master Twilio account.
// This is the ISV-level A2P Trust Product — one per platform, shared across all
// church brand registrations via the a2PProfileBundleSid parameter.
//
// Twilio API: trusthub.v1.trustProducts (not messaging.v1.a2PProfileBundles)
// Filter by policy_sid = RN670d5d2e282a6130ae063b234b6019c8 (A2P Messaging Policy)
export const fetchA2pProfileSid = async (req: any, res: any) => {
    const db = getDb();
    const log = createServerLogger(db);
    try {
        const { accountSid, authToken } = await getMasterCredentials(db);
        const master = getMasterClient(accountSid, authToken);

        // A2P Profile Bundles are TrustProducts with the A2P Messaging Policy SID.
        // Twilio's constant policy SID for A2P Messaging: RN670d5d2e282a6130ae063b234b6019c8
        const A2P_POLICY_SID = 'RN670d5d2e282a6130ae063b234b6019c8';

        let bundles: any[] = [];

        // Strategy 1: list trustProducts filtered by A2P policy (most reliable)
        try {
            bundles = await (master as any).trusthub.v1.trustProducts.list({
                policySid: A2P_POLICY_SID,
                pageSize: 50,
            });
        } catch (e1: any) {
            log.warn(`[fetchA2pProfileSid] trustProducts filtered list failed: ${e1.message}`, 'system', {}, 'system');
        }

        // Strategy 2: list all trustProducts and filter client-side
        if (!bundles || bundles.length === 0) {
            try {
                const all = await (master as any).trusthub.v1.trustProducts.list({ pageSize: 50 });
                bundles = (all || []).filter((b: any) => b.policySid === A2P_POLICY_SID);
            } catch (e2: any) {
                log.warn(`[fetchA2pProfileSid] trustProducts unfiltered list failed: ${e2.message}`, 'system', {}, 'system');
            }
        }

        if (!bundles || bundles.length === 0) {
            return res.status(404).json({
                error: 'No A2P Profile Bundles (BN...) found on this master Twilio account. ' +
                    'Create one at: https://console.twilio.com/us1/develop/sms/regulatory/a2p-registration. ' +
                    'As an ISV you need an A2P Messaging Profile Bundle on your master account before you can register church brands.',
            });
        }

        // Among the found bundles, prefer twilio-approved > approved > pending-review > draft
        const priorityOrder = ['twilio-approved', 'approved', 'pending-review', 'draft'];
        let best: any = null;
        for (const status of priorityOrder) {
            best = bundles.find((b: any) => b.status === status);
            if (best) break;
        }
        if (!best) best = bundles[0];

        log.info(`[fetchA2pProfileSid] Found ${bundles.length} A2P bundle(s), selected ${best.sid} (${best.status})`, 'system', {}, 'system');

        return res.json({
            success:      true,
            primarySid:   best.sid,
            friendlyName: best.friendlyName,
            status:       best.status,
            policySid:    best.policySid,
            allProfiles:  bundles.map((b: any) => ({ sid: b.sid, friendlyName: b.friendlyName, status: b.status })),
            note: bundles.length > 1
                ? `Found ${bundles.length} A2P bundles. Selected the best-status one (${best.sid}). If wrong, paste the correct BN... SID manually.`
                : undefined,
        });
    } catch (e: any) {
        log.error(`[fetchA2pProfileSid] ${e.message}`, 'system', {}, 'system');
        return res.status(500).json({ error: e.message || 'Failed to fetch A2P Profile Bundles' });
    }
};

// ─── GET /api/messaging/lookup-profile-sids ──────────────────────────────────
// Given a churchId, resolves the Customer Profile Bundle SID (BU...) for
// that church's secondary profile by:
//   1. Reading customerProfileBundleSid directly from the stored Brand Registration
//   2. Falling back to listing TrustHub Customer Profiles and matching by name
// Saves discovered SIDs back to Firestore so the admin doesn't need to find them manually.
// Query: ?churchId=xxx
export const lookupProfileSidsForChurch = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const churchId = req.query.churchId as string;
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const sms: any = (churchSnap.data() as any)?.smsSettings || {};

        const { accountSid, authToken } = await getMasterCredentials(db);
        const master = getMasterClient(accountSid, authToken);

        const discovered: Record<string, string> = {};
        const sources:    Record<string, string> = {};

        // ── Strategy 1: Pull SIDs directly from the stored Brand Registration ──
        if (sms.twilioBrandSid) {
            try {
                const brandReg = await (master as any).messaging.v1
                    .brandRegistrations(sms.twilioBrandSid).fetch();
                if (brandReg.customerProfileBundleSid) {
                    discovered.twilioCustomerProfileSid = brandReg.customerProfileBundleSid;
                    sources.twilioCustomerProfileSid    = `brand:${sms.twilioBrandSid}`;
                }
                if (brandReg.a2PProfileBundleSid) {
                    discovered.twilioA2pProfileSid = brandReg.a2PProfileBundleSid;
                    sources.twilioA2pProfileSid    = `brand:${sms.twilioBrandSid}`;
                }
                log.info(`[lookupProfileSids] Strategy 1 (brand fetch): found ${Object.keys(discovered).join(', ')}`, 'system', { churchId }, churchId);
            } catch (brandErr: any) {
                log.warn(`[lookupProfileSids] Brand fetch failed: ${brandErr.message}`, 'system', { churchId }, churchId);
            }
        }

        // ── Strategy 2: List TrustHub Customer Profiles and match by name ──────
        // Only runs if we still haven't found the Customer Profile SID
        if (!discovered.twilioCustomerProfileSid) {
            try {
                const profiles: any[] = await (master as any).trusthub.v1.customerProfiles.list({ pageSize: 100 });
                const businessName = (sms.a2pBusinessName || '').toLowerCase().trim();

                // Match preference: exact friendlyName match → partial name match → sub-account SID in entities
                const exactMatch   = businessName ? profiles.find((p: any) => (p.friendlyName || '').toLowerCase() === businessName) : null;
                const partialMatch = businessName ? profiles.find((p: any) => (p.friendlyName || '').toLowerCase().includes(businessName)) : null;

                const match = exactMatch || partialMatch;
                if (match) {
                    discovered.twilioCustomerProfileSid = match.sid;
                    sources.twilioCustomerProfileSid    = `trusthub-list:friendlyName=${match.friendlyName}`;
                    log.info(`[lookupProfileSids] Strategy 2 (name match): ${match.sid} (${match.friendlyName})`, 'system', { churchId }, churchId);
                } else if (profiles.length > 0) {
                    // Return the full list so the admin can pick manually
                    return res.json({
                        success:      false,
                        discovered,
                        sources,
                        allProfiles:  profiles.map((p: any) => ({
                            sid:          p.sid,
                            friendlyName: p.friendlyName,
                            status:       p.status,
                        })),
                        message: `Found ${profiles.length} Customer Profile(s) on this Twilio account but none matched "${sms.a2pBusinessName || '(no business name saved)'}". Select the correct one from allProfiles and save its SID manually.`,
                    });
                }
            } catch (listErr: any) {
                log.warn(`[lookupProfileSids] TrustHub list failed: ${listErr.message}`, 'system', { churchId }, churchId);
            }
        }

        // ── Strategy 3: Use sub-account SID to fetch its own TrustHub profiles ─
        // Twilio allows sub-accounts to have their own profiles — query with sub-account creds
        if (!discovered.twilioCustomerProfileSid && sms.twilioSubAccountSid && sms.twilioSubAccountAuthToken) {
            try {
                const subClient = getMasterClient(sms.twilioSubAccountSid, sms.twilioSubAccountAuthToken);
                const subProfiles: any[] = await (subClient as any).trusthub.v1.customerProfiles.list({ pageSize: 20 });
                if (subProfiles.length > 0) {
                    const best = subProfiles.find((p: any) => p.status === 'approved')
                               || subProfiles.find((p: any) => p.status === 'twilio-approved')
                               || subProfiles.find((p: any) => p.status === 'pending-review')
                               || subProfiles[0];
                    discovered.twilioCustomerProfileSid = best.sid;
                    sources.twilioCustomerProfileSid    = `sub-account-trusthub:${sms.twilioSubAccountSid}`;
                    log.info(`[lookupProfileSids] Strategy 3 (sub-account): ${best.sid}`, 'system', { churchId }, churchId);
                }
            } catch (subErr: any) {
                log.warn(`[lookupProfileSids] Sub-account TrustHub lookup failed: ${subErr.message}`, 'system', { churchId }, churchId);
            }
        }

        if (Object.keys(discovered).length === 0) {
            return res.json({
                success:   false,
                discovered,
                sources,
                message:   'Could not automatically resolve any SIDs. Ensure the business name is saved and a Brand Registration or Customer Profile exists on this Twilio account.',
            });
        }

        // ── Save discovered SIDs back to Firestore (only if not already set) ───
        const firestoreUpdates: Record<string, any> = { 'smsSettings.a2pLastStatusCheck': Date.now() };
        const savedSids: string[] = [];

        if (discovered.twilioCustomerProfileSid && !sms.twilioCustomerProfileSid) {
            firestoreUpdates['smsSettings.twilioCustomerProfileSid'] = discovered.twilioCustomerProfileSid;
            savedSids.push(`Customer Profile SID: ${discovered.twilioCustomerProfileSid}`);
        }
        if (discovered.twilioA2pProfileSid && !sms.twilioA2pProfileSid) {
            firestoreUpdates['smsSettings.twilioA2pProfileSid'] = discovered.twilioA2pProfileSid;
            savedSids.push(`A2P Profile SID: ${discovered.twilioA2pProfileSid}`);
        }

        if (savedSids.length > 0) {
            await db.collection('churches').doc(churchId).update(firestoreUpdates);
            log.info(`[lookupProfileSids] Saved to Firestore: ${savedSids.join(', ')}`, 'system', { churchId }, churchId);
        }

        return res.json({
            success:   true,
            discovered,
            sources,
            savedSids,
            message:   savedSids.length > 0
                ? `Auto-saved: ${savedSids.join('; ')}`
                : 'SIDs already on file — no update needed.',
        });

    } catch (e: any) {
        log.error(`[lookupProfileSids] ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Lookup failed' });
    }
};


// ─── POST /api/messaging/diagnose-repair ─────────────────────────────────────
// Diagnostic + repair tool for churches with a corrupted A2P pipeline.
// Checks every A2P SID stored in Firestore against both the master account and
// the church sub-account to determine where each resource actually lives.
//
// If repair=true in the body, it will:
//   - Delete the Messaging Service from whichever account it's on (if not sub-acct)
//   - Delete the A2P Campaign from whichever account it's on (if not sub-acct)
//   - Clear the Firestore fields for those resources so the pipeline can restart
//
// Brand Registrations CANNOT be deleted via Twilio API. If the brand is on the
// wrong account it will be surfaced in the report as requiring Twilio Support.
//
// Body: { churchId, repair?: boolean }

export const diagnoseAndRepairA2p = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const { churchId, repair = false } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const { accountSid: masterSid, authToken } = await getMasterCredentials(db);
        const masterClient = getMasterClient(masterSid, authToken);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const sms = churchSnap.data()?.smsSettings || {};

        const subAccountSid = sms.twilioSubAccountSid as string | undefined;
        const subClient = subAccountSid
            ? getMasterClient(masterSid, authToken, subAccountSid)
            : null;

        // ── Helper: try fetching a resource on both accounts ───────────────────
        async function locateResource(
            label: string,
            fetchOnMaster: () => Promise<any>,
            fetchOnSub: (() => Promise<any>) | null,
        ): Promise<{ found: boolean; account: 'master' | 'sub' | 'not_found'; sid: string; data?: any }> {
            const sid = label; // just used for logging
            // Try sub-account first (correct location)
            if (fetchOnSub) {
                try {
                    const data = await fetchOnSub();
                    return { found: true, account: 'sub', sid, data };
                } catch { /* not on sub */ }
            }
            // Try master account
            try {
                const data = await fetchOnMaster();
                return { found: true, account: 'master', sid, data };
            } catch { /* not on master either */ }
            return { found: false, account: 'not_found', sid };
        }

        const report: Record<string, any> = {
            churchId,
            subAccountSid: subAccountSid || '⚠ MISSING — no sub-account provisioned',
            resources: {},
        };

        // ── 1. Customer Profile (BU...) — always on master ────────────────────
        const cpSid = sms.twilioCustomerProfileSid as string | undefined;
        if (cpSid) {
            try {
                const cp = await (masterClient as any).trusthub.v1.customerProfiles(cpSid).fetch();
                report.resources.customerProfile = {
                    sid: cpSid, account: 'master', status: cp.status,
                    note: cp.status === 'twilio-approved' ? '✅ Correct' : `⚠ Status: ${cp.status}`,
                };
            } catch (e: any) {
                report.resources.customerProfile = { sid: cpSid, account: 'not_found', error: e.message };
            }
        } else {
            report.resources.customerProfile = { sid: null, account: 'not_found', note: '⚠ No Customer Profile SID on file' };
        }

        // ── 2. Brand Registration (BN-style twilioBrandSid) ───────────────────
        const brandSid = sms.twilioBrandSid as string | undefined;
        if (brandSid) {
            const brandResult = await locateResource(
                brandSid,
                () => (masterClient as any).messaging.v1.brandRegistrations(brandSid).fetch(),
                subClient ? () => (subClient as any).messaging.v1.brandRegistrations(brandSid).fetch() : null,
            );
            report.resources.brandRegistration = {
                sid: brandSid,
                account: brandResult.account,
                status: brandResult.data?.status,
                note: brandResult.account === 'sub'
                    ? '✅ Correct (on sub-account)'
                    : brandResult.account === 'master'
                    ? '❌ WRONG ACCOUNT — on master. Brand registrations cannot be deleted via API. Contact Twilio Support to transfer or delete it, then clear twilioBrandSid from Firestore and re-register.'
                    : '⚠ Not found on either account',
            };
        } else {
            report.resources.brandRegistration = { sid: null, account: 'not_found', note: '⚠ No Brand SID on file' };
        }

        // ── 3. Messaging Service (MG...) ──────────────────────────────────────
        const mgSid = sms.twilioMessagingServiceSid as string | undefined;
        if (mgSid) {
            const mgResult = await locateResource(
                mgSid,
                () => (masterClient as any).messaging.v1.services(mgSid).fetch(),
                subClient ? () => (subClient as any).messaging.v1.services(mgSid).fetch() : null,
            );
            report.resources.messagingService = {
                sid: mgSid,
                account: mgResult.account,
                friendlyName: mgResult.data?.friendlyName,
                note: mgResult.account === 'sub' ? '✅ Correct' : mgResult.account === 'master' ? '❌ On master account — needs to move to sub-account' : '⚠ Not found',
            };

            // Repair: delete messaging service from wrong account
            if (repair && mgResult.account === 'master') {
                try {
                    await (masterClient as any).messaging.v1.services(mgSid).remove();
                    report.resources.messagingService.repaired = '🔧 Deleted from master account';
                    log.info(`[diagnoseRepair] Deleted MG ${mgSid} from master for ${churchId}`, 'system', { churchId }, churchId);
                } catch (delErr: any) {
                    report.resources.messagingService.repairError = `Could not delete: ${delErr.message}`;
                }
            }
        } else {
            report.resources.messagingService = { sid: null, account: 'not_found', note: '⚠ No Messaging Service SID on file' };
        }

        // ── 4. A2P Campaign (UsAppToPerson) ───────────────────────────────────
        const campaignSid = sms.twilioUsAppToPersonSid as string | undefined;
        if (campaignSid && mgSid) {
            const campaignResult = await locateResource(
                campaignSid,
                async () => {
                    // Campaign SID is looked up under its messaging service
                    return await (masterClient as any).messaging.v1.services(mgSid).usAppToPerson(campaignSid).fetch();
                },
                subClient ? async () => {
                    const subMgSid = report.resources.messagingService?.account === 'sub' ? mgSid : null;
                    if (!subMgSid) throw new Error('MG not on sub-account');
                    return await (subClient as any).messaging.v1.services(subMgSid).usAppToPerson(campaignSid).fetch();
                } : null,
            );
            report.resources.campaign = {
                sid: campaignSid,
                account: campaignResult.account,
                status: campaignResult.data?.campaignStatus,
                note: campaignResult.account === 'sub' ? '✅ Correct' : campaignResult.account === 'master' ? '❌ On master account — needs to move to sub-account' : '⚠ Not found',
            };

            // Repair: delete campaign from wrong account
            if (repair && campaignResult.account === 'master') {
                try {
                    await (masterClient as any).messaging.v1.services(mgSid).usAppToPerson(campaignSid).remove();
                    report.resources.campaign.repaired = '🔧 Deleted from master account';
                    log.info(`[diagnoseRepair] Deleted campaign ${campaignSid} from master for ${churchId}`, 'system', { churchId }, churchId);
                } catch (delErr: any) {
                    report.resources.campaign.repairError = `Could not delete: ${delErr.message}`;
                }
            }
        } else {
            report.resources.campaign = { sid: null, account: 'not_found', note: '⚠ No Campaign SID on file' };
        }

        // ── Repair: clear Firestore fields for resources deleted/invalid ───────
        if (repair) {
            const clearFields: Record<string, any> = {};

            const mgOnMaster = report.resources.messagingService?.account === 'master';
            const campaignOnMaster = report.resources.campaign?.account === 'master';
            const brandOnMaster = report.resources.brandRegistration?.account === 'master';

            if (mgOnMaster) {
                clearFields['smsSettings.twilioMessagingServiceSid'] = null;
                clearFields['smsSettings.twilioNumbersLinked'] = null;
                clearFields['smsSettings.twilioNumbersLinkedAt'] = null;
            }
            if (campaignOnMaster) {
                clearFields['smsSettings.twilioUsAppToPersonSid'] = null;
                clearFields['smsSettings.twilioA2pCampaignStatus'] = null;
                clearFields['smsSettings.a2pCampaignSubmittedAt'] = null;
            }
            // Brand cannot be auto-deleted — but if user explicitly wants to clear the Firestore pointer
            // (after manually handling it with Twilio Support), they can use the brand reset endpoint.
            // We do NOT auto-clear the brand SID here since the SID itself is useful for Support reference.

            if (Object.keys(clearFields).length > 0) {
                await db.collection('churches').doc(churchId).update(clearFields);
                report.firestore = {
                    cleared: Object.keys(clearFields),
                    note: 'Firestore fields cleared. Re-run the pipeline steps that were on the wrong account.',
                };
            } else {
                report.firestore = { cleared: [], note: 'Nothing needed clearing.' };
            }

            // Summarize what still needs manual action
            if (brandOnMaster) {
                report.manualActionRequired = {
                    brandRegistration: brandSid,
                    instructions: [
                        '1. Contact Twilio Support and ask them to delete or cancel brand registration ' + brandSid,
                        '2. Once confirmed deleted, clear "twilioBrandSid" from Firestore for church ' + churchId,
                        '3. Re-run Step 4 (Brand Registration) from the admin panel — it will now correctly register on the sub-account ' + subAccountSid,
                    ],
                };
            }
        }

        // ── Build action plan ─────────────────────────────────────────────────
        const issues = Object.values(report.resources).filter((r: any) => r.account === 'master' || r.account === 'not_found');
        report.status = issues.length === 0 ? '✅ All resources are on the correct sub-account' : `⚠ ${issues.length} issue(s) found`;
        report.nextSteps = repair
            ? 'Repair attempted. Check the report above for any manual actions still required.'
            : 'Run again with { repair: true } to auto-delete misplaced Messaging Service and Campaign, and clear Firestore fields.';

        log.info(`[diagnoseRepair] Diagnosis complete for ${churchId}: ${report.status}`, 'system', { churchId, repair }, churchId);

        return res.json({ success: true, report });

    } catch (e: any) {
        log.error(`[diagnoseRepair] Failed for ${churchId}: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Diagnosis failed' });
    }
};
