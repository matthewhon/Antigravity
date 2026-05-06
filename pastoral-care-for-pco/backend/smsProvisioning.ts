import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';
import { getSignalWireClient, getSmsWebhookBaseUrl, getSignalWireCampaignId, callSignalWireApi } from './signalwireClient';

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
    const campaignId = await getSignalWireCampaignId();

    if (!campaignId) {
        log.warn(
            '[smsProvisioning] signalwireCampaignId not set in System Settings — TCR campaign assignment skipped. ' +
            'Set it after completing brand/campaign registration in the SignalWire Dashboard.',
            'system', { numDocId, phoneNumber }, churchId
        );
        await db.collection('smsNumbers').doc(numDocId).update({
            campaignAssigned:         false,
            campaignAssignmentStatus: 'not_configured',
        });
        return;
    }

    try {
        const result = await callSignalWireApi('/campaign-registry/phone-number-assignments', 'POST', {
            campaign_id:  campaignId,
            phone_number: phoneNumber,
        });

        const orderId = result?.id || result?.order_id || result?.assignment_id || '';
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
