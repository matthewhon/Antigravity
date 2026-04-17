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
// Returns available local numbers for a given US area code.

export const getAvailableNumbers = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const { areaCode, churchId } = req.query;
    if (!churchId || !areaCode) {
        return res.status(400).json({ error: 'Missing churchId or areaCode' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const { accountSid, authToken } = await getMasterCredentials(db);
        const master = getMasterClient(accountSid, authToken);

        const numbers = await master.availablePhoneNumbers('US')
            .local.list({ areaCode: Number(areaCode), smsEnabled: true, limit: 10 });

        const formatted = numbers.map(n => ({
            phoneNumber:    n.phoneNumber,
            friendlyName:   n.friendlyName,
            locality:       n.locality,
            region:         n.region,
            isoCountry:     n.isoCountry,
        }));

        return res.json({ success: true, numbers: formatted });
    } catch (e: any) {
        log.error(`[twilioProvisioning] getAvailableNumbers failed: ${e.message}`, 'system', { areaCode }, '');
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

        // 3. Determine inbound webhook URL (use Cloud Run URL from env, or localhost for dev)
        const baseUrl = process.env.SERVER_BASE_URL || `http://localhost:${process.env.PORT || 8080}`;
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
// Submits A2P 10DLC brand + campaign registration for the church's sub-account.
// NOTE: A2P registration is an asynchronous process. We submit and store the
// pending SIDs; status is checked via a separate status poll endpoint.

export const registerA2p = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId, brandInfo } = req.body || {};
    // brandInfo: { legalName, ein, website, contactPhone, contactEmail, vertical }
    if (!churchId || !brandInfo) {
        return res.status(400).json({ error: 'Missing churchId or brandInfo' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const { accountSid, authToken } = await getMasterCredentials(db);
        const master = getMasterClient(accountSid, authToken);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const smsSettings = churchSnap.data()?.smsSettings || {};
        const { twilioSubAccountSid } = smsSettings;

        if (!twilioSubAccountSid) {
            return res.status(400).json({ error: 'No Twilio sub-account provisioned for this church. Complete number setup first.' });
        }

        // Submit A2P brand registration via the master account acting on behalf of sub-account
        // Twilio A2P 10DLC: Create a BrandRegistration object
        const brand = await (master as any).messaging.v1.brandRegistrations.create({
            customerProfileBundleSid: '', // Placeholder — full regulatory bundle flow needed for production
            a2PProfileBundleSid: '',
            // We surface a simplified version: Twilio's "Starter" use case doesn't require a bundle
            // For the MVP, we set the status manually and note the church must complete Twilio's
            // Business Profile in the console if they need high-volume (15,000+ msg/day).
        });

        const brandSid = brand?.sid || 'PENDING';

        await db.collection('churches').doc(churchId).update({
            'smsSettings.twilioA2pStatus': 'pending',
            'smsSettings.twilioBrandSid':  brandSid,
        });

        log.info(`A2P brand registration submitted for church ${churchId}: ${brandSid}`, 'system', { churchId, brandSid }, churchId);

        return res.json({
            success: true,
            brandSid,
            status:  'pending',
            message: 'A2P brand registration submitted. This typically takes 3–5 business days for approval.',
        });
    } catch (e: any) {
        // A2P API is complex — log and return a helpful message
        log.warn(`[twilioProvisioning] registerA2p: ${e.message}`, 'system', { churchId }, churchId);

        // For MVP: If A2P API fails (e.g. missing bundle), we mark status as 'pending' with
        // a note that the church needs to complete registration in the Twilio console.
        await db.collection('churches').doc(churchId).update({
            'smsSettings.twilioA2pStatus': 'pending',
        }).catch(() => {});

        return res.json({
            success: false,
            status:  'pending',
            message: 'Please complete A2P registration in the Twilio Console. Low-volume (trial) sending is available in the meantime.',
            error:   e.message,
        });
    }
};
