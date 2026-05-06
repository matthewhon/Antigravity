import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';
import {
    getSignalWireClient, getSmsWebhookBaseUrl, getChurchCampaignId,
    assignNumbersToCampaign,
    registerTenantBrand, checkBrandStatus,
    registerTenantCampaign, checkCampaignStatus,
    type BrandRegistrationPayload, type CampaignRegistrationPayload,
} from './signalwireClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function resolveWebhookUrls(): Promise<{ inboundUrl: string; statusCallback: string }> {
    const baseUrl = await getSmsWebhookBaseUrl();
    if (!baseUrl) {
        throw new Error(
            'Webhook Base URL is not configured. ' +
            'Set "smsWebhookBaseUrl" or "apiBaseUrl" in System Settings → SignalWire SMS, ' +
            'or set the SERVER_BASE_URL environment variable.'
        );
    }
    if (baseUrl.startsWith('http://localhost') || baseUrl.startsWith('http://127.')) {
        throw new Error(
            `Webhook Base URL "${baseUrl}" is a localhost address — SignalWire requires a publicly ` +
            'reachable HTTPS URL. Set the correct backend URL in System Settings → SignalWire SMS → Webhook Base URL.'
        );
    }
    if (!baseUrl.startsWith('https://')) {
        throw new Error(
            `Webhook Base URL "${baseUrl}" must use HTTPS. SignalWire will not deliver webhooks to plain HTTP addresses.`
        );
    }
    return {
        inboundUrl:     `${baseUrl}/api/messaging/inbound`,
        statusCallback: `${baseUrl}/api/messaging/status`,
    };
}

/**
 * Fire-and-forget: assign a freshly provisioned number to the configured TCR campaign.
 * Non-blocking — a missing or misconfigured campaignId logs a warning but never
 * throws, so provisioning always succeeds regardless of TCR state.
 *
 * Status values written to smsNumbers doc:
 *   campaignAssignmentStatus: 'not_configured' | 'pending' | 'error'
 * Carriers take up to 24h to confirm; mark 'active' via a status webhook or
 * manual update once the number appears in the SignalWire Dashboard as Processed.
 */
async function assignNumberToCampaign(
    db: any,
    log: any,
    numDocId: string,
    phoneNumber: string,
    churchId: string
): Promise<void> {
    const campaignId = await getChurchCampaignId(churchId);

    if (!campaignId) {
        log.warn(
            '[smsProvisioning] No campaign configured for this church — TCR campaign assignment skipped. ' +
            'Complete Brand and Campaign registration in Admin → SMS → Compliance.',
            'system', { numDocId, phoneNumber }, churchId
        );
        await db.collection('smsNumbers').doc(numDocId).update({
            campaignAssigned:         false,
            campaignAssignmentStatus: 'not_configured',
        });
        return;
    }

    try {
        const { orderId } = await assignNumbersToCampaign(campaignId, [phoneNumber]);

        log.info(
            `[smsProvisioning] TCR campaign assignment submitted for ${phoneNumber} (orderId: ${orderId})`,
            'system', { numDocId, phoneNumber, campaignId, orderId }, churchId
        );

        await db.collection('smsNumbers').doc(numDocId).update({
            campaignAssigned:          false,        // true once carrier confirms (~24h)
            campaignAssignmentStatus:  'pending',
            campaignAssignmentOrderId: orderId,
            campaignId,
            campaignAssignedAt:        Date.now(),
        });

    } catch (e: any) {
        log.error(
            `[smsProvisioning] TCR campaign assignment failed for ${phoneNumber}: ${e.message}`,
            'system', { numDocId, phoneNumber, campaignId }, churchId
        );
        await db.collection('smsNumbers').doc(numDocId).update({
            campaignAssigned:         false,
            campaignAssignmentStatus: 'error',
            campaignAssignmentError:  e.message,
        });
    }
}

// ─── GET /api/messaging/available-numbers ─────────────────────────────────────
// Cascading locality search — always tries to stay as close to the city as possible.
//
// City+state search cascade:
//   1. Exact city + state (inLocality + inRegion)
//   2. If 0: city only (inLocality, any state)
//   3. If still 0: returns 0 results + canExpand=true (frontend offers a manual "try state" button)
//
// Area code search: straightforward, returns up to 100.

export const getAvailableNumbers = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const { areaCode, city, state, churchId } = req.query as Record<string, string>;

    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });
    if (!areaCode && !state && !city) {
        return res.status(400).json({ error: 'Provide areaCode, or city+state, or state.' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const client    = await getSignalWireClient();
        const phoneApi  = client.availablePhoneNumbers('US').local;
        const FETCH_LIMIT = 100;

        let numbers:   any[] = [];
        let searchMode = '';
        let canExpand  = false;

        if (areaCode) {
            searchMode = `area code ${areaCode}`;
            numbers = await phoneApi.list({ areaCode: Number(areaCode), smsEnabled: true, limit: FETCH_LIMIT });

        } else {
            const filterCity  = (city  || '').trim();
            const filterState = (state || '').trim().toUpperCase();

            if (filterCity && filterState) {
                searchMode = `${filterCity}, ${filterState}`;
                numbers = await phoneApi.list({ inLocality: filterCity, inRegion: filterState, smsEnabled: true, limit: FETCH_LIMIT });

                if (numbers.length === 0) {
                    searchMode = `${filterCity} (any state)`;
                    numbers = await phoneApi.list({ inLocality: filterCity, smsEnabled: true, limit: FETCH_LIMIT });
                }

                if (numbers.length === 0) {
                    searchMode = `${filterCity}, ${filterState}`;
                    canExpand  = true;
                }

            } else if (filterState) {
                searchMode = `state ${filterState}`;
                numbers = await phoneApi.list({ inRegion: filterState, smsEnabled: true, limit: FETCH_LIMIT });
            }
        }

        const formatted = numbers.map(n => ({
            phoneNumber:  n.phoneNumber,
            friendlyName: n.friendlyName,
            locality:     n.locality,
            region:       n.region,
            isoCountry:   n.isoCountry,
        }));

        log.info(`[smsProvisioning] Found ${formatted.length} numbers for "${searchMode}"`, 'system', { searchMode, canExpand }, '');
        return res.json({ success: true, numbers: formatted, searchMode, canExpand, total: formatted.length });

    } catch (e: any) {
        log.error(`[smsProvisioning] getAvailableNumbers failed: ${e.message}`, 'system', { areaCode, city, state }, '');
        return res.status(500).json({ error: e.message || 'Failed to fetch available numbers' });
    }
};

// ─── POST /api/messaging/provision ───────────────────────────────────────────
// Purchases the chosen number directly on the SignalWire project (no sub-accounts),
// configures the inbound webhook + status callback, and writes to Firestore.

export const provisionSmsNumber = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId, phoneNumber, senderName, friendlyLabel } = req.body || {};
    if (!churchId || !phoneNumber) {
        return res.status(400).json({ error: 'Missing churchId or phoneNumber' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const church = churchSnap.data() || {};

        const { inboundUrl, statusCallback } = await resolveWebhookUrls();
        const client = await getSignalWireClient();

        // Purchase the number directly on the project (no sub-account needed)
        const purchased = await client.incomingPhoneNumbers.create({
            phoneNumber,
            smsUrl:               inboundUrl,
            smsMethod:            'POST',
            statusCallback,
            statusCallbackMethod: 'POST',
        });

        log.info(`[provisionSmsNumber] Purchased ${phoneNumber} (SID: ${purchased.sid}) for church ${churchId}`, 'system', { churchId, phoneNumber, sid: purchased.sid }, churchId);

        const now = Date.now();

        // Write to smsNumbers collection
        const existingNums = await db.collection('smsNumbers')
            .where('churchId', '==', churchId)
            .limit(1)
            .get();
        const isFirstNumber = existingNums.empty;

        const numDocId = `${churchId}_${purchased.sid}`;
        await db.collection('smsNumbers').doc(numDocId).set({
            id:             numDocId,
            churchId,
            phoneNumber,
            phoneSid:       purchased.sid,
            friendlyLabel:  friendlyLabel || 'Main Line',
            isDefault:      isFirstNumber,
            smsEnabled:     true,
            allowedUserIds: [],
            webhookUrl:     inboundUrl,
            senderName:     senderName || church.name || 'Church',
            createdAt:      now,
            updatedAt:      now,
        });

        // Keep smsSettings in sync (merge, don't replace)
        await db.collection('churches').doc(churchId).update({
            'smsSettings.smsEnabled':    true,
            'smsSettings.smsPhoneNumber': isFirstNumber ? phoneNumber : church.smsSettings?.smsPhoneNumber,
            'smsSettings.smsPhoneSid':    isFirstNumber ? purchased.sid : church.smsSettings?.smsPhoneSid,
            'smsSettings.senderName':     senderName || church.name || 'Church',
        });

        log.info(`[provisionSmsNumber] Wrote smsNumbers doc ${numDocId} (isDefault=${isFirstNumber})`, 'system', { churchId, numDocId, isFirstNumber }, churchId);

        // Auto-assign to TCR campaign (non-blocking — logs on failure, never throws)
        assignNumberToCampaign(db, log, numDocId, phoneNumber, churchId).catch(() => {/* already logged inside */});

        return res.json({
            success:      true,
            phoneNumber,
            smsNumberId:  numDocId,
            message:      `Phone number ${phoneNumber} provisioned successfully. Campaign registration is pending carrier approval (up to 24h).`,
        });
    } catch (e: any) {
        log.error(`[provisionSmsNumber] failed: ${e.message}`, 'system', { churchId, phoneNumber }, churchId);
        return res.status(500).json({ error: e.message || 'Provisioning failed' });
    }
};

// ─── POST /api/messaging/add-number ──────────────────────────────────────────
// Adds a second (or Nth) phone number to an already-enabled church.
// SignalWire flat project model — no sub-account needed.
// Body: { churchId, phoneNumber, friendlyLabel? }

export const addSmsNumber = async (req: any, res: any) => {
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

        const { inboundUrl, statusCallback } = await resolveWebhookUrls();
        const client = await getSignalWireClient();

        const purchased = await client.incomingPhoneNumbers.create({
            phoneNumber,
            smsUrl:               inboundUrl,
            smsMethod:            'POST',
            statusCallback,
            statusCallbackMethod: 'POST',
        });

        const now       = Date.now();
        const numDocId  = `${churchId}_${purchased.sid}`;

        const existingNums = await db.collection('smsNumbers')
            .where('churchId', '==', churchId)
            .limit(1)
            .get();
        const isFirstNumber = existingNums.empty;

        await db.collection('smsNumbers').doc(numDocId).set({
            id:             numDocId,
            churchId,
            phoneNumber,
            phoneSid:       purchased.sid,
            friendlyLabel:  friendlyLabel || phoneNumber,
            isDefault:      isFirstNumber,
            smsEnabled:     true,
            allowedUserIds: [],
            webhookUrl:     inboundUrl,
            senderName:     smsSettings.senderName || church.name || 'Church',
            createdAt:      now,
            updatedAt:      now,
        });

        await db.collection('churches').doc(churchId).update({
            'smsSettings.smsEnabled': true,
            ...(isFirstNumber ? {
                'smsSettings.smsPhoneNumber': phoneNumber,
                'smsSettings.smsPhoneSid':    purchased.sid,
            } : {}),
        });

        log.info(`[addSmsNumber] Added ${phoneNumber} (SID: ${purchased.sid}) for church ${churchId}`, 'system', { churchId, numDocId }, churchId);

        // Auto-assign to TCR campaign (non-blocking)
        assignNumberToCampaign(db, log, numDocId, phoneNumber, churchId).catch(() => {/* already logged inside */});

        return res.json({
            success:     true,
            phoneNumber,
            smsNumberId: numDocId,
            message:     `Phone number ${phoneNumber} added successfully. Campaign registration is pending carrier approval (up to 24h).`,
        });

    } catch (e: any) {
        log.error(`[addSmsNumber] Failed for ${churchId}: ${e.message}`, 'system', { churchId, phoneNumber }, churchId);
        return res.status(500).json({ error: e.message || 'Failed to add number' });
    }
};

// ─── POST /api/messaging/release-number ──────────────────────────────────────
// Releases a specific phone number by smsNumberId.
// Body: { churchId, smsNumberId } (also accepts legacy twilioNumberId)

export const releaseSpecificNumber = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId, smsNumberId, twilioNumberId } = req.body || {};
    const numberId = smsNumberId || twilioNumberId;
    if (!churchId || !numberId) {
        return res.status(400).json({ error: 'Missing churchId or smsNumberId' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        // Try smsNumbers first, then fall back to twilioNumbers for legacy docs
        let numSnap = await db.collection('smsNumbers').doc(numberId).get();
        let collection = 'smsNumbers';
        if (!numSnap.exists) {
            numSnap = await db.collection('twilioNumbers').doc(numberId).get();
            collection = 'twilioNumbers';
        }

        if (!numSnap.exists) return res.status(404).json({ error: 'Phone number record not found' });
        const numData = numSnap.data() || {};
        if (numData.churchId !== churchId) return res.status(403).json({ error: 'Forbidden' });

        // Release from SignalWire project
        if (numData.phoneSid) {
            const client = await getSignalWireClient();
            try {
                await client.incomingPhoneNumbers(numData.phoneSid).remove();
            } catch (swErr: any) {
                // If already released at provider level, continue with DB cleanup
                log.warn(`[releaseSpecificNumber] SignalWire release failed (may already be released): ${swErr.message}`, 'system', { churchId, numberId }, churchId);
            }
        }

        // Delete the doc from whichever collection it was in
        await db.collection(collection).doc(numberId).delete();

        // If this was the default number, promote the next one
        if (numData.isDefault) {
            const remaining = await db.collection('smsNumbers')
                .where('churchId', '==', churchId)
                .limit(1)
                .get();
            if (!remaining.empty) {
                await remaining.docs[0].ref.update({ isDefault: true, updatedAt: Date.now() });
            } else {
                // No numbers left — disable SMS
                await db.collection('churches').doc(churchId).update({
                    'smsSettings.smsEnabled':     false,
                    'smsSettings.smsPhoneNumber': null,
                    'smsSettings.smsPhoneSid':    null,
                });
            }
        }

        log.info(`[releaseSpecificNumber] Released ${numData.phoneNumber} for church ${churchId}`, 'system', { churchId, numberId }, churchId);
        return res.json({ success: true, message: `${numData.phoneNumber} released.` });

    } catch (e: any) {
        log.error(`[releaseSpecificNumber] Failed: ${e.message}`, 'system', { churchId, numberId }, churchId);
        return res.status(500).json({ error: e.message || 'Release failed' });
    }
};

// ─── PATCH /api/messaging/number-settings ────────────────────────────────────
// Update label / allowed users / senderName for a specific number.
// Body: { churchId, smsNumberId, friendlyLabel?, allowedUserIds?, senderName? }

export const updateNumberSettings = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId, smsNumberId, twilioNumberId, friendlyLabel, allowedUserIds, senderName } = req.body || {};
    const numberId = smsNumberId || twilioNumberId;
    if (!churchId || !numberId) {
        return res.status(400).json({ error: 'Missing churchId or smsNumberId' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        // Support both collections during transition
        let numSnap = await db.collection('smsNumbers').doc(numberId).get();
        let col = 'smsNumbers';
        if (!numSnap.exists) {
            numSnap = await db.collection('twilioNumbers').doc(numberId).get();
            col = 'twilioNumbers';
        }
        if (!numSnap.exists) return res.status(404).json({ error: 'Number not found' });
        if (numSnap.data()?.churchId !== churchId) return res.status(403).json({ error: 'Forbidden' });

        const patch: Record<string, any> = { updatedAt: Date.now() };
        if (friendlyLabel  !== undefined) patch.friendlyLabel  = friendlyLabel;
        if (allowedUserIds !== undefined) patch.allowedUserIds = allowedUserIds;
        if (senderName     !== undefined) patch.senderName     = senderName;

        await db.collection(col).doc(numberId).update(patch);
        log.info(`[updateNumberSettings] Updated ${numberId} for church ${churchId}`, 'system', { churchId, numberId, patch }, churchId);

        return res.json({ success: true });
    } catch (e: any) {
        log.error(`[updateNumberSettings] Failed: ${e.message}`, 'system', { churchId, numberId }, churchId);
        return res.status(500).json({ error: e.message || 'Update failed' });
    }
};

// ─── POST /api/messaging/set-default-number ──────────────────────────────────
// Atomically marks one number as isDefault=true and all others false.
// Body: { churchId, smsNumberId } (also accepts legacy twilioNumberId)

export const setDefaultNumber = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId, smsNumberId, twilioNumberId } = req.body || {};
    const numberId = smsNumberId || twilioNumberId;
    if (!churchId || !numberId) {
        return res.status(400).json({ error: 'Missing churchId or smsNumberId' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const allNums = await db.collection('smsNumbers')
            .where('churchId', '==', churchId)
            .get();

        const batch = db.batch();
        const now   = Date.now();
        let targetPhone = '';

        allNums.docs.forEach(doc => {
            const isTarget = doc.id === numberId;
            batch.update(doc.ref, { isDefault: isTarget, updatedAt: now });
            if (isTarget) targetPhone = doc.data().phoneNumber || '';
        });

        await batch.commit();

        // Keep smsSettings in sync
        if (targetPhone) {
            const targetDoc = allNums.docs.find(d => d.id === numberId);
            if (targetDoc) {
                await db.collection('churches').doc(churchId).update({
                    'smsSettings.smsPhoneNumber': targetPhone,
                    'smsSettings.smsPhoneSid':    targetDoc.data().phoneSid || null,
                });
            }
        }

        log.info(`[setDefaultNumber] Set ${numberId} as default for church ${churchId}`, 'system', { churchId, numberId }, churchId);
        return res.json({ success: true });

    } catch (e: any) {
        log.error(`[setDefaultNumber] Failed: ${e.message}`, 'system', { churchId, numberId }, churchId);
        return res.status(500).json({ error: e.message || 'Failed to set default' });
    }
};

// ─── POST /api/messaging/register-brand ──────────────────────────────────────
// Registers a 10DLC Brand for a church tenant with the SignalWire Campaign Registry.
// Body: { churchId, legalName, ein, legalEntityType, contactEmail, contactPhone,
//         website, address, city, state, zip }

export const registerSmsBrand = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const {
        churchId, legalName, ein, legalEntityType,
        contactEmail, contactPhone, website,
        address, city, state, zip,
    } = req.body || {};

    if (!churchId)     return res.status(400).json({ error: 'Missing churchId' });
    if (!legalName)    return res.status(400).json({ error: 'Missing legalName' });
    if (!ein)          return res.status(400).json({ error: 'Missing ein (Tax ID)' });
    if (!contactEmail) return res.status(400).json({ error: 'Missing contactEmail' });
    if (!contactPhone) return res.status(400).json({ error: 'Missing contactPhone' });
    if (!website)      return res.status(400).json({ error: 'Missing website' });
    if (!address || !city || !state || !zip) {
        return res.status(400).json({ error: 'Missing address fields (address, city, state, zip)' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });

        const payload: BrandRegistrationPayload = {
            legalName,
            ein: ein.replace(/[^0-9]/g, ''), // strip dashes
            legalEntityType: legalEntityType || 'NON_PROFIT',
            contactEmail,
            contactPhone,
            website,
            address,
            city,
            state,
            zip,
        };

        const { brandId, status } = await registerTenantBrand(churchId, payload);
        log.info(`[registerSmsBrand] Brand submitted for church ${churchId} (brandId: ${brandId})`, 'system', { churchId, brandId, status }, churchId);

        return res.json({
            success: true,
            brandId,
            status,
            message: `Brand registration submitted. Status: ${status}. Approval typically takes a few minutes to several hours.`,
        });
    } catch (e: any) {
        log.error(`[registerSmsBrand] Failed for church ${churchId}: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Brand registration failed' });
    }
};

// ─── POST /api/messaging/register-campaign ────────────────────────────────────
// Registers a 10DLC Campaign for a church tenant after their brand is approved.
// Body: { churchId, name, usecase, description, sample1, sample2?,
//         messageFlow, optOutMessage, helpMessage }

export const registerSmsCampaign = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const {
        churchId, name, usecase, description,
        sample1, sample2, messageFlow, optOutMessage, helpMessage,
    } = req.body || {};

    if (!churchId)     return res.status(400).json({ error: 'Missing churchId' });
    if (!description)  return res.status(400).json({ error: 'Missing description' });
    if (!sample1)      return res.status(400).json({ error: 'Missing sample1 message' });
    if (!messageFlow)  return res.status(400).json({ error: 'Missing messageFlow (opt-in description)' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });

        const smsSettings = churchSnap.data()?.smsSettings || {};
        const brandId = smsSettings.brandId;
        if (!brandId) {
            return res.status(400).json({ error: 'Brand registration must be completed before creating a Campaign. Please register your brand first.' });
        }
        const isBrandReady = smsSettings.brandStatus === 'approved' || smsSettings.brandStatus === 'verified';
        if (!isBrandReady) {
            return res.status(400).json({
                error: `Your brand is currently "${smsSettings.brandStatus || 'unregistered'}". Campaign registration requires a "verified" or "approved" brand status.`,
            });
        }

        const churchName = churchSnap.data()?.name || 'Church';

        const payload: CampaignRegistrationPayload = {
            brandId,
            name:          name || `${churchName} SMS`,
            usecase:       usecase || 'MIXED',
            description,
            sample1,
            sample2:       sample2 || undefined,
            messageFlow,
            optOutMessage: optOutMessage || 'Reply STOP to unsubscribe. Reply HELP for help.',
            helpMessage:   helpMessage || `For assistance contact ${churchName}. Reply STOP to unsubscribe.`,
        };

        const { campaignId, status } = await registerTenantCampaign(churchId, payload);
        log.info(`[registerSmsCampaign] Campaign submitted for church ${churchId} (campaignId: ${campaignId})`, 'system', { churchId, campaignId, status }, churchId);

        // Auto-assign any existing provisioned numbers to this campaign
        const numsSnap = await db.collection('smsNumbers').where('churchId', '==', churchId).get();
        if (!numsSnap.empty && campaignId) {
            const phones = numsSnap.docs.map(d => d.data().phoneNumber).filter(Boolean);
            if (phones.length > 0) {
                try {
                    const { orderId } = await (await import('./signalwireClient')).assignNumbersToCampaign(campaignId, phones);
                    const batch = db.batch();
                    numsSnap.docs.forEach(d => {
                        batch.update(d.ref, {
                            campaignId,
                            campaignAssigned:          false,
                            campaignAssignmentStatus:  'pending',
                            campaignAssignmentOrderId: orderId,
                            campaignAssignedAt:        Date.now(),
                        });
                    });
                    await batch.commit();
                    log.info(`[registerSmsCampaign] Auto-assigned ${phones.length} existing numbers to campaign ${campaignId}`, 'system', { churchId, campaignId }, churchId);
                } catch (assignErr: any) {
                    log.warn(`[registerSmsCampaign] Auto-assign numbers failed (non-fatal): ${assignErr.message}`, 'system', { churchId, campaignId }, churchId);
                }
            }
        }

        return res.json({
            success: true,
            campaignId,
            status,
            message: `Campaign registration submitted. Status: ${status}. Carrier approval takes up to 24 hours.`,
        });
    } catch (e: any) {
        log.error(`[registerSmsCampaign] Failed for church ${churchId}: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Campaign registration failed' });
    }
};

// ─── GET /api/messaging/registration-status ───────────────────────────────────
// Returns current brand and campaign registration status for a church.
// Also re-polls SignalWire for live status and updates Firestore.
// Query: { churchId }

export const getSmsRegistrationStatus = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId } = req.query as Record<string, string>;
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });

        const sms = churchSnap.data()?.smsSettings || {};
        let brandStatus    = sms.brandStatus    || null;
        let campaignStatus = sms.campaignStatus || null;
        let brandRaw: any    = null;
        let campaignRaw: any = null;

        // Re-poll live status from SignalWire if IDs are present
        if (sms.brandId) {
            try {
                const result = await checkBrandStatus(churchId, sms.brandId);
                brandStatus = result.status;
                brandRaw    = result.raw;
            } catch (e: any) {
                log.warn(`[getSmsRegistrationStatus] Brand status check failed: ${e.message}`, 'system', { churchId }, churchId);
            }
        }

        if (sms.campaignId) {
            try {
                const result = await checkCampaignStatus(churchId, sms.campaignId);
                campaignStatus = result.status;
                campaignRaw    = result.raw;
            } catch (e: any) {
                log.warn(`[getSmsRegistrationStatus] Campaign status check failed: ${e.message}`, 'system', { churchId }, churchId);
            }
        }

        return res.json({
            success: true,
            brand: {
                id:          sms.brandId     || null,
                status:      brandStatus,
                submittedAt: sms.brandSubmittedAt || null,
                legalName:   sms.brandLegalName  || null,
                raw:         brandRaw,
            },
            campaign: {
                id:          sms.campaignId     || null,
                status:      campaignStatus,
                submittedAt: sms.campaignSubmittedAt || null,
                usecase:     sms.campaignUsecase     || null,
                raw:         campaignRaw,
            },
        });
    } catch (e: any) {
        log.error(`[getSmsRegistrationStatus] Failed for ${churchId}: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Status check failed' });
    }
};

/**
 * Webhook handler for SignalWire Campaign state changes.
 * Automatically updates the church's campaign status when SignalWire posts an update.
 */
export const handleCampaignStatusWebhook = async (req: any, res: any) => {
    const db = getDb();
    const log = createServerLogger(db);
    
    // Ensure we always return 200 OK quickly to SignalWire
    res.status(200).send('OK');

    try {
        const body = req.body || {};
        const campaignId = body.id || body.campaign_id;
        const newStatus = (body.status || '').toLowerCase();
        const brandId = body.brand_id;

        log.info(`[handleCampaignStatusWebhook] Received webhook`, 'system', { body }, 'system');

        if (!campaignId && !brandId) {
            return;
        }

        // Try to find a church with this campaign ID or brand ID
        let query: any = db.collection('churches');
        if (campaignId) {
            query = query.where('smsSettings.campaignId', '==', campaignId);
        } else if (brandId) {
            query = query.where('smsSettings.brandId', '==', brandId);
        }

        const snap = await query.limit(1).get();
        if (snap.empty) {
            log.warn(`[handleCampaignStatusWebhook] No church found for campaign ${campaignId} / brand ${brandId}`, 'system', { campaignId, brandId }, 'system');
            return;
        }

        const churchDoc = snap.docs[0];
        const churchId = churchDoc.id;
        
        const updates: any = {
            'smsSettings.webhookLastReceivedAt': Date.now(),
        };

        if (campaignId && newStatus) {
            updates['smsSettings.campaignStatus'] = newStatus;
        }
        
        // Sometimes webhooks update brand status too if they are related to the brand
        if (body.type === 'brand' && newStatus) {
             updates['smsSettings.brandStatus'] = newStatus;
        }

        await churchDoc.ref.update(updates);
        log.info(`[handleCampaignStatusWebhook] Updated status for church ${churchId} to ${newStatus}`, 'system', { churchId, campaignId, newStatus }, churchId);

    } catch (e: any) {
        log.error(`[handleCampaignStatusWebhook] Error processing webhook: ${e.message}`, 'system', { body: req.body }, 'system');
    }
};

/**
 * Webhook handler for SignalWire Number Assignment state changes.
 * Updates the campaignAssignmentStatus of smsNumbers documents.
 */
export const handleAssignmentStatusWebhook = async (req: any, res: any) => {
    const db = getDb();
    const log = createServerLogger(db);
    
    // Ensure we always return 200 OK quickly to SignalWire
    res.status(200).send('OK');

    try {
        const body = req.body || {};
        const orderId = body.id || body.order_id;
        const newStatus = (body.status || '').toLowerCase();
        
        log.info(`[handleAssignmentStatusWebhook] Received webhook`, 'system', { body }, 'system');

        if (!orderId && !body.phone_number) {
            return;
        }

        let query: any = db.collection('smsNumbers');
        if (orderId) {
            query = query.where('campaignAssignmentOrderId', '==', orderId);
        } else if (body.phone_number) {
            // SignalWire might send updates for individual numbers
            query = query.where('phoneNumber', '==', body.phone_number);
        }

        const snap = await query.get();
        if (snap.empty) {
            log.warn(`[handleAssignmentStatusWebhook] No smsNumbers found for order ${orderId} / number ${body.phone_number}`, 'system', { orderId }, 'system');
            return;
        }

        for (const doc of snap.docs) {
            const updates: any = {};
            if (newStatus) {
                updates.campaignAssignmentStatus = newStatus;
            }

            if (newStatus === 'successful' || newStatus === 'active') {
                updates.campaignAssigned = true;
            } else if (newStatus === 'failed') {
                updates.campaignAssigned = false;
                updates.campaignAssignmentError = body.error_message || body.reason || 'Assignment failed via webhook';
            }

            if (Object.keys(updates).length > 0) {
                await doc.ref.update(updates);
                log.info(`[handleAssignmentStatusWebhook] Updated number ${doc.data().phoneNumber} to status ${newStatus}`, 'system', { numberId: doc.id, newStatus }, doc.data().churchId);
            }
        }

    } catch (e: any) {
        log.error(`[handleAssignmentStatusWebhook] Error processing webhook: ${e.message}`, 'system', { body: req.body }, 'system');
    }
};
