import twilio from 'twilio';
import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';

// ─── Master credentials helper ────────────────────────────────────────────────
// All Twilio operations use the master account acting on behalf of the
// church's sub-account via the accountSid option.  This avoids any
// dependency on the stored twilioSubAccountAuthToken, which can go stale.
//
// The correct pattern per Twilio Node.js SDK docs:
//   twilio(masterSid, masterToken, { accountSid: subAccountSid })
// This creates a full client that sends requests authenticated as the master
// but scoped to the sub-account's resources.

async function getMasterClient(db: any, subAccountSid?: string): Promise<any> {
    const snap = await db.doc('system/settings').get();
    const data = snap.data() || {};
    const accountSid = data.twilioMasterAccountSid || '';
    const authToken  = data.twilioMasterAuthToken  || '';
    if (!accountSid || !authToken) {
        throw new Error('Twilio master credentials are not configured in System Settings.');
    }
    // When subAccountSid is provided, the client will act on behalf of that sub-account
    return subAccountSid
        ? twilio(accountSid, authToken, { accountSid: subAccountSid })
        : twilio(accountSid, authToken);
}

// ─── Segment cost constants (US pricing, adjust as needed) ───────────────────
const SMS_COST_PER_SEGMENT = 0.0079;  // USD per outbound SMS segment
const MMS_COST_PER_MESSAGE = 0.02;    // USD per outbound MMS

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normaliseE164(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return `+${digits}`;
}

/** Count SMS segments (160 chars = 1 segment; 153 chars per segment after that). */
function countSegments(body: string): number {
    if (body.length <= 160) return 1;
    return Math.ceil(body.length / 153);
}

/** All data about a person used for merge-tag resolution. */
export interface PersonInfo {
    personName?: string;
    email?:      string;
    phone?:      string;
    birthday?:   string;  // e.g. "Jan 15" or "January 15"
    anniversary?: string; // e.g. "Jun 10"
    city?:       string;
    state?:      string;
}

/** Replace merge tags with person-specific values. */
function resolveMergeTags(body: string, person: PersonInfo): string {
    const parts = (person.personName || '').split(' ');
    const firstName = parts[0] || '';
    const lastName  = parts.slice(1).join(' ') || '';
    return body
        .replace(/\{firstName\}/gi,   firstName)
        .replace(/\{lastName\}/gi,    lastName)
        .replace(/\{fullName\}/gi,    person.personName || '')
        .replace(/\{email\}/gi,       person.email      || '')
        .replace(/\{phone\}/gi,       person.phone      || '')
        .replace(/\{birthday\}/gi,    person.birthday   || '')
        .replace(/\{anniversary\}/gi, person.anniversary || '')
        .replace(/\{city\}/gi,        person.city       || '')
        .replace(/\{state\}/gi,       person.state      || '');
}

/** Get the public base URL for webhooks from Firestore system settings or env. */
async function getStatusCallbackUrl(db: any): Promise<string | null> {
    try {
        const snap = await db.doc('system/settings').get();
        const data = snap.data() || {};
        const base = (
            data.twilioWebhookBaseUrl ||
            data.apiBaseUrl           ||
            process.env.SERVER_BASE_URL ||
            ''
        ).replace(/\/$/, '');
        if (!base || !base.startsWith('https://')) return null;
        return `${base}/api/messaging/status`;
    } catch {
        return null;
    }
}

/**
 * Get a scoped Twilio client and the correct from-number for a church.
 * Uses twilio(masterSid, masterToken, { accountSid: subSid }) so all API
 * calls are authenticated with master credentials but scoped to the
 * sub-account — no stored twilioSubAccountAuthToken needed.
 * If twilioNumberId is provided, uses that specific number.
 * Otherwise falls back to the church's smsSettings.twilioPhoneNumber.
 */
async function getSubClient(
    db: any,
    churchId: string,
    twilioNumberId?: string | null
): Promise<{ client: any; fromNumber: string }> {
    const snap = await db.collection('churches').doc(churchId).get();
    if (!snap.exists) throw new Error(`Church ${churchId} not found`);
    const sms = snap.data()?.smsSettings || {};
    if (!sms.smsEnabled)          throw new Error('SMS is not enabled for this church.');
    if (!sms.twilioSubAccountSid) throw new Error('No Twilio sub-account configured.');

    // Full Twilio client scoped to the sub-account via master credentials
    const client = await getMasterClient(db, sms.twilioSubAccountSid);

    // Resolve the from-number
    let fromNumber = sms.twilioPhoneNumber as string | undefined;

    if (twilioNumberId) {
        // Specific number override — simple single-doc lookup, no index needed
        const numSnap = await db.collection('twilioNumbers').doc(twilioNumberId).get();
        if (numSnap.exists && numSnap.data()?.churchId === churchId) {
            fromNumber = numSnap.data()!.phoneNumber;
        }
    } else if (!fromNumber) {
        // Fall back to the default twilioNumber from the collection.
        // This handles churches where smsSettings.twilioPhoneNumber was not
        // set (e.g. claimed via addTwilioNumber or after data migration).
        const defaultSnap = await db.collection('twilioNumbers')
            .where('churchId', '==', churchId)
            .where('isDefault', '==', true)
            .limit(1)
            .get();
        if (!defaultSnap.empty) {
            fromNumber = defaultSnap.docs[0].data().phoneNumber;
        } else {
            // Last resort: any number for this church
            const anySnap = await db.collection('twilioNumbers')
                .where('churchId', '==', churchId)
                .limit(1)
                .get();
            if (!anySnap.empty) {
                fromNumber = anySnap.docs[0].data().phoneNumber;
            }
        }
    }

    if (!fromNumber) throw new Error('No Twilio phone number configured for this church.');
    return { client, fromNumber, messagingServiceSid: (sms.twilioMessagingServiceSid as string | undefined) || null };
}

/** Check if a phone number is opted out. */
async function isOptedOut(db: any, churchId: string, phone: string): Promise<boolean> {
    const optOutId = `${churchId}_${phone.replace(/\+/g, '')}`;
    const snap = await db.collection('smsOptOuts').doc(optOutId).get();
    return snap.exists;
}

/** Record a usage entry and update conversation / campaign. */
async function recordUsage(db: any, params: {
    churchId:       string;
    campaignId?:    string;
    conversationId?: string;
    toPhone:        string;
    segments:       number;
    isMms:          boolean;
    twilioSid:      string;
}) {
    const costUsd = params.isMms
        ? MMS_COST_PER_MESSAGE
        : params.segments * SMS_COST_PER_SEGMENT;

    const usageId = `usage_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    await db.collection('smsUsageRecords').doc(usageId).set({
        id:              usageId,
        churchId:        params.churchId,
        campaignId:      params.campaignId    || null,
        conversationId:  params.conversationId || null,
        toPhone:         params.toPhone,
        segments:        params.segments,
        isMms:           params.isMms,
        costUsd,
        twilioSid:       params.twilioSid,
        createdAt:       Date.now(),
    });
}

// ─── POST /api/messaging/send-individual ────────────────────────────────────
// Send a single SMS/MMS to one person. Creates/updates SmsConversation.

export const sendIndividual = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const {
        churchId, toPhone, body, mediaUrls = [],
        sentBy, sentByName,
        twilioNumberId,     // optional: override which number to send from
        conversationId: existingConvId,
    } = req.body || {};
    if (!churchId || !toPhone || !body) {
        return res.status(400).json({ error: 'Missing churchId, toPhone, or body' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const to = normaliseE164(toPhone);

        // Opt-out check
        if (await isOptedOut(db, churchId, to)) {
            return res.status(403).json({ error: `${to} has opted out of messages from this church.` });
        }

        // If caller provides a conversationId, read the twilioNumberId from there
        let resolvedNumberId = twilioNumberId || null;
        if (!resolvedNumberId && existingConvId) {
            const convSnap = await db.collection('smsConversations').doc(existingConvId).get();
            if (convSnap.exists) resolvedNumberId = convSnap.data()?.twilioNumberId || null;
        }

        const { client, fromNumber, messagingServiceSid } = await getSubClient(db, churchId, resolvedNumberId);

        const isMms    = (mediaUrls as string[]).length > 0;
        const segments = isMms ? 1 : countSegments(body);

        // Send via Twilio — prefer messagingServiceSid (A2P compliance) over bare from:
        const statusCallbackUrl = await getStatusCallbackUrl(db);
        const msgParams: any = messagingServiceSid
            ? { messagingServiceSid, to, body }
            : { from: fromNumber, to, body };
        if (isMms) msgParams.mediaUrl = mediaUrls;
        if (statusCallbackUrl) {
            msgParams.statusCallback       = statusCallbackUrl;
            msgParams.statusCallbackMethod = 'POST';
        }

        const msg = await client.messages.create(msgParams);

        // Record in smsUsageRecords
        await recordUsage(db, { churchId, toPhone: to, segments, isMms, twilioSid: msg.sid });

        // Write to conversation
        const convId  = existingConvId || `${churchId}_${to.replace(/\+/g, '')}`;
        const convRef = db.collection('smsConversations').doc(convId);
        const now     = Date.now();

        const convPatch: any = {
            id:                  convId,
            churchId,
            phoneNumber:         to,
            lastMessageAt:       now,
            lastMessageBody:     body,
            lastMessageDirection:'outbound',
            isOptedOut:          false,
            unreadCount:         0,
        };
        if (resolvedNumberId) {
            convPatch.twilioNumberId = resolvedNumberId;
            convPatch.inboxId        = resolvedNumberId;
            convPatch.toPhoneNumber  = fromNumber;
        }
        await convRef.set(convPatch, { merge: true });

        // Save the outbound message
        const messageId = `msg_${now}_${Math.random().toString(36).slice(2, 8)}`;
        await convRef.collection('messages').doc(messageId).set({
            id:             messageId,
            conversationId: convId,
            churchId,
            direction:      'outbound',
            body,
            mediaUrls:      mediaUrls || [],
            status:         msg.status || 'queued',
            twilioSid:      msg.sid,
            sentBy:         sentBy     || null,
            sentByName:     sentByName || null,
            createdAt:      now,
        });

        log.info(`[Send] 1:1 message to ${to} from church ${churchId} (SID: ${msg.sid})`, 'system', { churchId, to }, churchId);

        return res.json({ success: true, messageSid: msg.sid, segments });
    } catch (e: any) {
        log.error(`[Send] sendIndividual failed: ${e.message}`, 'system', { churchId, toPhone }, churchId);
        return res.status(500).json({ error: e.message || 'Send failed' });
    }
};

// ─── sendBulkInternal ────────────────────────────────────────────────────────
// Core bulk-send logic — callable directly from the scheduler without HTTP.

export async function sendBulkInternal(params: {
    db:              any;
    churchId:        string;
    campaignId?:     string;
    phones:          string[];
    body:            string;
    mediaUrls?:      string[];
    sentBy?:         string;
    sentByName?:     string;
    personMap?:      Record<string, PersonInfo>;
    /** Optional: send from a specific number instead of the church default */
    twilioNumberId?: string | null;
}): Promise<{ sent: number; failed: number; optedOut: number; skipped: number; errors: { phone: string; error: string }[] }> {
    const { db, churchId, campaignId, phones, body, mediaUrls = [], sentBy, sentByName, personMap = {}, twilioNumberId } = params as any;
    const log   = createServerLogger(db);
    const isMms = (mediaUrls as string[]).length > 0;
    const { client, fromNumber, messagingServiceSid } = await getSubClient(db, churchId, twilioNumberId || null);

    let sent = 0, failed = 0, optedOut = 0, skipped = 0;
    const errors: { phone: string; error: string }[] = [];

    const BATCH_SIZE    = 10;
    const BATCH_DELAY_MS = 1000;

    for (let i = 0; i < phones.length; i += BATCH_SIZE) {
        const batch = phones.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (rawPhone: string) => {
            if (!rawPhone) {
                skipped++;
                log.info(`[BulkSend] Skipped — no phone (campaign ${campaignId})`, 'system', { campaignId }, churchId);
                return;
            }

            const to = normaliseE164(rawPhone);

            if (await isOptedOut(db, churchId, to)) { optedOut++; return; }

            const resolved = resolveMergeTags(body, (personMap as any)[to] || {});
            const segments = isMms ? 1 : countSegments(resolved);

            try {
                // Lazily fetch statusCallback URL once for the whole batch
                if (typeof (sendBulkInternal as any)._cbUrl === 'undefined') {
                    (sendBulkInternal as any)._cbUrl = await getStatusCallbackUrl(db);
                }
                const cbUrl = (sendBulkInternal as any)._cbUrl as string | null;

                const msgParams: any = messagingServiceSid
                    ? { messagingServiceSid, to, body: resolved }
                    : { from: fromNumber, to, body: resolved };
                if (isMms) msgParams.mediaUrl = mediaUrls;
                if (cbUrl) {
                    msgParams.statusCallback       = cbUrl;
                    msgParams.statusCallbackMethod = 'POST';
                }

                const msg = await client.messages.create(msgParams);

                await recordUsage(db, { churchId, campaignId, toPhone: to, segments, isMms, twilioSid: msg.sid });

                const convId  = `${churchId}_${to.replace(/\+/g, '')}`;
                const convRef = db.collection('smsConversations').doc(convId);
                const now     = Date.now();

                await convRef.set({
                    id: convId, churchId, phoneNumber: to,
                    lastMessageAt: now, lastMessageBody: resolved,
                    lastMessageDirection: 'outbound', isOptedOut: false,
                }, { merge: true });

                const messageId = `msg_${now}_${Math.random().toString(36).slice(2, 8)}`;
                await convRef.collection('messages').doc(messageId).set({
                    id: messageId, conversationId: convId, churchId,
                    direction: 'outbound', body: resolved,
                    mediaUrls: mediaUrls || [], status: msg.status || 'queued',
                    twilioSid: msg.sid, sentBy: sentBy || null,
                    sentByName: sentByName || null,
                    campaignId: campaignId || null, createdAt: now,
                });

                sent++;
            } catch (e: any) {
                failed++;
                errors.push({ phone: to, error: e.message });
                log.warn(`[BulkSend] Failed to send to ${to}: ${e.message}`, 'system', { campaignId, to }, churchId);
            }
        }));

        if (i + BATCH_SIZE < phones.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
    }

    // Update campaign analytics
    if (campaignId) {
        await db.collection('smsCampaigns').doc(campaignId).update({
            status: 'sent', sentAt: Date.now(),
            recipientCount: phones.length,
            deliveredCount: sent,
            failedCount:    failed,
            optOutCount:    optedOut,
            updatedAt:      Date.now(),
        });
    }

    log.info(
        `[BulkSend] ${campaignId || 'adhoc'}: sent=${sent}, failed=${failed}, optedOut=${optedOut}, skipped=${skipped}`,
        'system', { campaignId, sent, failed, optedOut, skipped }, churchId
    );

    return { sent, failed, optedOut, skipped, errors: errors.slice(0, 20) };
}

// ─── POST /api/messaging/send-bulk ──────────────────────────────────────────
// HTTP handler — thin wrapper around sendBulkInternal.

export const sendBulk = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const { churchId, campaignId, phones, body, mediaUrls = [], sentBy, sentByName, personMap = {} } = req.body || {};

    if (!churchId || !body || !Array.isArray(phones) || phones.length === 0) {
        return res.status(400).json({ error: 'Missing churchId, body, or phones array' });
    }

    const db = getDb();
    try {
        const result = await sendBulkInternal({ db, churchId, campaignId, phones, body, mediaUrls, sentBy, sentByName, personMap });
        return res.json({ success: true, ...result });
    } catch (e: any) {
        const log = createServerLogger(db);
        log.error(`[BulkSend] sendBulk HTTP failed: ${e.message}`, 'system', { churchId, campaignId }, churchId);
        return res.status(500).json({ error: e.message || 'Bulk send failed' });
    }
};
