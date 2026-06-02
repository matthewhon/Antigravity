import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';
import { getSignalWireClient, getSmsWebhookBaseUrl } from './signalwireClient';
import { fireAndForgetSmsNote } from './pcoNotes';


// ─── Segment cost constants (adjust to match SignalWire pricing) ──────────────
const SMS_COST_PER_SEGMENT = 0.0079;  // USD per outbound SMS segment
const MMS_COST_PER_MESSAGE = 0.02;    // USD per outbound MMS

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normaliseE164(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return `+${digits}`;
}

/** Count SMS segments (GSM-7: 160 limit, 153 multi-segment limit. Unicode: 70 limit, 67 multi-segment limit). */
function countSegments(body: string): number {
    if (!body) return 0;
    // Check if the message contains any character outside the standard GSM-7 basic & extension set.
    const isUnicode = !/^[\n\r a-zA-Z0-9@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\[~\]|€]*$/.test(body);
    if (isUnicode) {
        if (body.length <= 70) return 1;
        return Math.ceil(body.length / 67);
    } else {
        let gsmLength = 0;
        const gsmExtensions = '^{}\\[~]|€';
        for (let i = 0; i < body.length; i++) {
            gsmLength += gsmExtensions.includes(body[i]) ? 2 : 1;
        }
        if (gsmLength <= 160) return 1;
        return Math.ceil(gsmLength / 153);
    }
}

/** All data about a person used for merge-tag resolution. */
export interface PersonInfo {
    personName?: string;
    email?:      string;
    phone?:      string;
    birthday?:   string;
    anniversary?: string;
    city?:       string;
    state?:      string;
    /** PCO People person ID — used to write notes back to Planning Center after send. */
    pcoPersonId?: string | null;
}

/** Replace merge tags with person-specific values. */
function resolveMergeTags(body: string, person: PersonInfo, church?: any): string {
    const parts = (person.personName || '').split(' ');
    const firstName = parts[0] || '';
    const lastName  = parts.slice(1).join(' ') || '';
    const rawPhone = (person.phone || '').replace(/^\+1/, '');
    const formattedPhone = rawPhone.length === 10
        ? `(${rawPhone.slice(0,3)}) ${rawPhone.slice(3,6)}-${rawPhone.slice(6)}`
        : rawPhone;

    const rawChurchPhone = (church?.phone || '').replace(/^\+1/, '');
    const formattedChurchPhone = rawChurchPhone.length === 10
        ? `(${rawChurchPhone.slice(0,3)}) ${rawChurchPhone.slice(3,6)}-${rawChurchPhone.slice(6)}`
        : rawChurchPhone;

    return body
        .replace(/\{contact\.firstName\}|\{firstName\}/gi,   firstName)
        .replace(/\{contact\.lastName\}|\{lastName\}/gi,    lastName)
        .replace(/\{contact\.fullName\}|\{contact\.name\}|\{fullName\}/gi,    person.personName || '')
        .replace(/\{contact\.email\}|\{email\}/gi,       person.email      || '')
        .replace(/\{contact\.phone\}|\{phone\}/gi,       formattedPhone)
        .replace(/\{contact\.birthday\}|\{birthday\}/gi,    person.birthday   || '')
        .replace(/\{contact\.anniversary\}|\{anniversary\}/gi, person.anniversary || '')
        .replace(/\{contact\.city\}|\{city\}/gi,        person.city       || '')
        .replace(/\{contact\.state\}|\{state\}/gi,       person.state      || '')
        .replace(/\{church\.name\}|\{churchName\}/gi,       church?.name || '')
        .replace(/\{church\.phone\}|\{churchPhone\}/gi,       formattedChurchPhone)
        .replace(/\{church\.address\}|\{churchAddress\}/gi,   church?.address || '')
        .replace(/\{church\.website\}|\{churchWebsite\}/gi,   church?.website || '');
}

async function resolveDefaultNumberId(db: any, churchId: string): Promise<string | null> {
    const defaultSnap = await db.collection('smsNumbers')
        .where('churchId', '==', churchId)
        .where('isDefault', '==', true)
        .limit(1)
        .get();
    if (!defaultSnap.empty) return defaultSnap.docs[0].id;

    const anySnap = await db.collection('smsNumbers')
        .where('churchId', '==', churchId)
        .limit(1)
        .get();
    if (!anySnap.empty) return anySnap.docs[0].id;

    const defaultTwilioSnap = await db.collection('twilioNumbers')
        .where('churchId', '==', churchId)
        .where('isDefault', '==', true)
        .limit(1)
        .get();
    if (!defaultTwilioSnap.empty) return defaultTwilioSnap.docs[0].id;

    const anyTwilioSnap = await db.collection('twilioNumbers')
        .where('churchId', '==', churchId)
        .limit(1)
        .get();
    if (!anyTwilioSnap.empty) return anyTwilioSnap.docs[0].id;

    return null;
}

/**
 * Get a SignalWire client and the correct from-number for a church.
 * Unlike the old Twilio pattern there is no sub-account — a single flat project
 * serves all churches.  The from-number is resolved by looking up the church's
 * smsNumbers collection, falling back to smsSettings.smsPhoneNumber.
 */
async function getSmsClient(
    db: any,
    churchId: string,
    smsNumberId?: string | null
): Promise<{ client: any; fromNumber: string }> {
    const snap = await db.collection('churches').doc(churchId).get();
    if (!snap.exists) throw new Error(`Church ${churchId} not found`);
    const sms = snap.data()?.smsSettings || {};
    if (!sms.smsEnabled) throw new Error('SMS is not enabled for this church.');

    const client = await getSignalWireClient();

    // Resolve from-number
    let fromNumber = sms.smsPhoneNumber as string | undefined;

    if (smsNumberId) {
        // Specific number override — lookup smsNumbers collection
        const numSnap = await db.collection('smsNumbers').doc(smsNumberId).get();
        if (numSnap.exists && numSnap.data()?.churchId === churchId) {
            fromNumber = numSnap.data()!.phoneNumber;
        } else {
            // Doc not found or church mismatch — surface the error so sends don't silently
            // go out from the wrong (default) number.
            throw new Error(`SMS number ${smsNumberId} not found or does not belong to church ${churchId}.`);
        }
    } else if (!fromNumber) {
        // Fall back to default smsNumbers doc for this church
        const defaultSnap = await db.collection('smsNumbers')
            .where('churchId', '==', churchId)
            .where('isDefault', '==', true)
            .limit(1)
            .get();
        if (!defaultSnap.empty) {
            fromNumber = defaultSnap.docs[0].data().phoneNumber;
        } else {
            const anySnap = await db.collection('smsNumbers')
                .where('churchId', '==', churchId)
                .limit(1)
                .get();
            if (!anySnap.empty) {
                fromNumber = anySnap.docs[0].data().phoneNumber;
            }
        }
    }

    if (!fromNumber) throw new Error('No SMS phone number configured for this church.');
    return { client, fromNumber };
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
    messageSid:     string;
    numberId?:      string | null;
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
        messageSid:      params.messageSid,   // renamed from twilioSid
        numberId:        params.numberId || null,
        createdAt:       Date.now(),
    });
}

// ─── POST /api/messaging/send-individual ─────────────────────────────────────

export async function sendIndividualInternal(params: {
    db: any;
    log: any;
    churchId: string;
    toPhone: string;
    body: string;
    mediaUrls?: string[];
    sentBy?: string;
    sentByName?: string;
    smsNumberId?: string;
    twilioNumberId?: string;
    conversationId?: string;
    attachVcard?: boolean;
    /** PCO People person ID — if provided, a note will be written to this person's PCO profile after send. */
    personId?: string | null;
    /** Display name of the recipient (used in the PCO note body). */
    personName?: string | null;
}) {
    const { db, log, churchId, toPhone, body, mediaUrls = [], sentBy, sentByName, smsNumberId, twilioNumberId, conversationId: existingConvId, attachVcard, personId, personName } = params;

    const to = normaliseE164(toPhone);

    if (await isOptedOut(db, churchId, to)) {
        throw { status: 403, message: `${to} has opted out of messages from this church.` };
    }

    // Resolve number ID (accept both new and legacy field names).
    // The frontend sends 'twilioNumberId' (which is actually the smsNumbers doc ID for
    // SignalWire tenants); 'smsNumberId' is the canonical field name on this backend.
    let resolvedNumberId = smsNumberId || twilioNumberId || null;
    if (!resolvedNumberId && existingConvId) {
        const convSnap = await db.collection('smsConversations').doc(existingConvId).get();
        if (convSnap.exists) {
            const cd = convSnap.data();
            resolvedNumberId = cd?.smsNumberId || cd?.inboxId || cd?.twilioNumberId || null;
        }
    }
    if (!resolvedNumberId) {
        resolvedNumberId = await resolveDefaultNumberId(db, churchId);
    }

    log.info(
        `[Send] Resolved numberId=${resolvedNumberId || 'default'} for church ${churchId} → to ${to}`,
        'system', { churchId, resolvedNumberId, to }, churchId
    );

    const { client, fromNumber } = await getSmsClient(db, churchId, resolvedNumberId);

    const localMediaUrls = [...mediaUrls];
    if (attachVcard && resolvedNumberId) {
        const baseUrl = await getSmsWebhookBaseUrl();
        if (baseUrl) {
            const vcardUrl = `${baseUrl}/api/messaging/vcard/${resolvedNumberId}`;
            if (!localMediaUrls.includes(vcardUrl)) {
                localMediaUrls.push(vcardUrl);
            }
        }
    }

    const isMms    = localMediaUrls.length > 0;
    const segments = isMms ? 1 : countSegments(body);

    const baseUrl = await getSmsWebhookBaseUrl();
    const statusCallbackUrl = baseUrl ? `${baseUrl}/api/messaging/status` : null;

    const msgParams: any = { from: fromNumber, to, body };
    if (isMms) msgParams.mediaUrl = localMediaUrls;
    if (statusCallbackUrl) {
        msgParams.statusCallback       = statusCallbackUrl;
        msgParams.statusCallbackMethod = 'POST';
    }

    const msg = await client.messages.create(msgParams);

    await recordUsage(db, { churchId, toPhone: to, segments, isMms, messageSid: msg.sid, numberId: resolvedNumberId });

    const convId  = existingConvId || `${churchId}_${to.replace(/\+/g, '')}`;
    const convRef = db.collection('smsConversations').doc(convId);
    const now     = Date.now();

    const convPatch: any = {
        id: convId, churchId, phoneNumber: to,
        lastMessageAt: now, lastMessageBody: body,
        lastMessageDirection: 'outbound',
        isOptedOut: false, unreadCount: 0,
    };
    if (resolvedNumberId) {
        convPatch.smsNumberId   = resolvedNumberId;
        convPatch.twilioNumberId = resolvedNumberId;  // alias for inbox filter
        convPatch.inboxId       = resolvedNumberId;
        convPatch.toPhoneNumber = fromNumber;
    }
    await convRef.set(convPatch, { merge: true });

    const messageId = `msg_${now}_${Math.random().toString(36).slice(2, 8)}`;
    await convRef.collection('messages').doc(messageId).set({
        id: messageId, conversationId: convId, churchId,
        direction: 'outbound', body,
        mediaUrls: localMediaUrls, status: msg.status || 'queued',
        messageSid: msg.sid,        // renamed from twilioSid
        sentBy: sentBy || null, sentByName: sentByName || null,
        createdAt: now,
    });

    log.info(`[Send] 1:1 message to ${to} from church ${churchId} (SID: ${msg.sid})`, 'system', { churchId, to }, churchId);

    // Write a note to Planning Center for the recipient (fire-and-forget — never blocks the send).
    // Prefer the explicitly-supplied personId; fall back to the personId stored on the conversation doc
    // (set by inbound handler / backfill) so replies in threads also get logged.
    let resolvedPersonId: string | null = personId || null;
    let resolvedPersonName: string | undefined = personName || undefined;
    if (!resolvedPersonId) {
        try {
            const convSnap = await db.collection('smsConversations').doc(convId).get();
            if (convSnap.exists) {
                const cd = convSnap.data();
                resolvedPersonId = cd?.personId || null;
                if (!resolvedPersonName) resolvedPersonName = cd?.personName || undefined;
            }
        } catch { /* ignore — fallback is to skip note */ }
    }
    fireAndForgetSmsNote({
        db,
        churchId,
        personId: resolvedPersonId,
        recipientName: resolvedPersonName,
        recipientPhone: to,
        senderName: sentByName || undefined,
        messageBody: body,
    });

    return { messageSid: msg.sid, segments };
}

export const sendIndividual = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    const {
        churchId, toPhone, body, mediaUrls = [],
        sentBy, sentByName,
        smsNumberId,
        twilioNumberId,
        conversationId,
        attachVcard,
        personId,
        personName,
    } = req.body || {};

    if (!churchId || !toPhone || !body) {
        return res.status(400).json({ error: 'Missing churchId, toPhone, or body' });
    }

    const db  = getDb();
    const log = createServerLogger(db);

    try {
        const result = await sendIndividualInternal({
            db, log, churchId, toPhone, body, mediaUrls,
            sentBy, sentByName, smsNumberId, twilioNumberId, conversationId, attachVcard,
            personId: personId || null,
            personName: personName || null,
        });
        return res.json({ success: true, ...result });
    } catch (e: any) {
        const errorCode   = e.code || e.errorCode || null;
        const errorStatus = e.status || null;

        log.error(
            `[Send] sendIndividual failed: ${e.message}`,
            'system',
            { churchId, toPhone, errorCode, errorStatus },
            churchId
        );
        return res.status(errorStatus || 500).json({
            error: e.message || 'Send failed',
            errorCode,
        });
    }
};

// ─── sendBulkInternal ─────────────────────────────────────────────────────────

export async function sendBulkInternal(params: {
    db:           any;
    churchId:     string;
    campaignId?:  string;
    phones:       string[];
    body:         string;
    mediaUrls?:   string[];
    sentBy?:      string;
    sentByName?:  string;
    personMap?:   Record<string, PersonInfo>;
    smsNumberId?: string | null;
    /** Legacy alias — still accepted */
    twilioNumberId?: string | null;
    attachVcard?:  boolean;
}): Promise<{ sent: number; failed: number; optedOut: number; skipped: number; errors: { phone: string; error: string }[] }> {
    const {
        db, churchId, campaignId, phones, body,
        mediaUrls = [], sentBy, sentByName, personMap = {},
        smsNumberId, twilioNumberId, attachVcard,
    } = params as any;

    const log    = createServerLogger(db);
    let numberId = smsNumberId || twilioNumberId || null;
    if (!numberId) {
        numberId = await resolveDefaultNumberId(db, churchId);
    }
    const { client, fromNumber } = await getSmsClient(db, churchId, numberId);

    const churchSnap = await db.collection('churches').doc(churchId).get();
    const church = churchSnap.exists ? churchSnap.data() : null;

    const localMediaUrls = [...mediaUrls];
    if (attachVcard && numberId) {
        const baseUrl = await getSmsWebhookBaseUrl();
        if (baseUrl) {
            const vcardUrl = `${baseUrl}/api/messaging/vcard/${numberId}`;
            if (!localMediaUrls.includes(vcardUrl)) {
                localMediaUrls.push(vcardUrl);
            }
        }
    }

    const isMms  = localMediaUrls.length > 0;
    const baseUrl = await getSmsWebhookBaseUrl();
    const cbUrl   = baseUrl ? `${baseUrl}/api/messaging/status` : null;

    let sent = 0, failed = 0, optedOut = 0, skipped = 0;
    const errors: { phone: string; error: string }[] = [];

    const BATCH_SIZE     = 10;
    const BATCH_DELAY_MS = 1000;

    for (let i = 0; i < phones.length; i += BATCH_SIZE) {
        const batch = phones.slice(i, i + BATCH_SIZE);

        await Promise.all(batch.map(async (rawPhone: string) => {
            if (!rawPhone) { skipped++; return; }

            const to = normaliseE164(rawPhone);
            if (await isOptedOut(db, churchId, to)) { optedOut++; return; }

            const resolved = resolveMergeTags(body, (personMap as any)[to] || {}, church);
            const segments = isMms ? 1 : countSegments(resolved);

            try {
                const msgParams: any = { from: fromNumber, to, body: resolved };
                if (isMms) msgParams.mediaUrl = localMediaUrls;
                if (cbUrl) {
                    msgParams.statusCallback       = cbUrl;
                    msgParams.statusCallbackMethod = 'POST';
                }

                const msg = await client.messages.create(msgParams);

                await recordUsage(db, { churchId, campaignId, toPhone: to, segments, isMms, messageSid: msg.sid, numberId });

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
                    mediaUrls: localMediaUrls, status: msg.status || 'queued',
                    messageSid: msg.sid,
                    sentBy: sentBy || null, sentByName: sentByName || null,
                    campaignId: campaignId || null, createdAt: now,
                });

                sent++;

                // Write PCO note for this recipient (fire-and-forget)
                const pInfo = (personMap as any)[to] as PersonInfo | undefined;
                if (pInfo?.pcoPersonId) {
                    fireAndForgetSmsNote({
                        db,
                        churchId,
                        personId: pInfo.pcoPersonId,
                        recipientName: pInfo.personName || undefined,
                        recipientPhone: to,
                        senderName: sentByName || undefined,
                        messageBody: resolved,
                    });
                }

            } catch (e: any) {
                failed++;
                const errorCode = e.code || e.errorCode || null;
                errors.push({ phone: to, error: e.message, ...(errorCode ? { errorCode } : {}) } as any);
                log.warn(`[BulkSend] Failed to send to ${to}: ${e.message} (code: ${errorCode || 'none'})`, 'system', { campaignId, to, errorCode }, churchId);
            }
        }));

        if (i + BATCH_SIZE < phones.length) {
            await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
        }
    }

    if (campaignId && !campaignId.startsWith('wf_') && !campaignId.startsWith('services_')) {
        await db.collection('smsCampaigns').doc(campaignId).update({
            status: 'sent', sentAt: Date.now(),
            recipientCount: phones.length,
            deliveredCount: sent,
            failedCount:    failed,
            optOutCount:    optedOut,
            updatedAt:      Date.now(),
        }).catch((e: any) => {
            log.warn(`[BulkSend] Failed to update campaign doc ${campaignId}: ${e.message}`, 'system', { campaignId }, churchId);
        });
    }

    log.info(
        `[BulkSend] ${campaignId || 'adhoc'}: sent=${sent}, failed=${failed}, optedOut=${optedOut}, skipped=${skipped}`,
        'system', { campaignId, sent, failed, optedOut, skipped }, churchId
    );

    return { sent, failed, optedOut, skipped, errors: errors.slice(0, 20) };
}

// ─── POST /api/messaging/send-bulk ───────────────────────────────────────────

export const sendBulk = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');

    let { churchId, campaignId, phones = [], body, mediaUrls = [], sentBy, sentByName, personMap = {}, resolveFromList, resolveFromGroup, smsNumberId, twilioNumberId, attachVcard } = req.body || {};

    const db = getDb();

    if (!churchId || !body) {
        return res.status(400).json({ error: 'Missing churchId or body' });
    }

    try {
        if (phones.length === 0 && (resolveFromList || resolveFromGroup)) {
            const { resolvePcoRecipients } = await import('./smsCampaignScheduler.js');
            const resolved = await resolvePcoRecipients(db, churchId, resolveFromList, resolveFromGroup, 'sms');
            phones = resolved.destinations;
            personMap = resolved.personMap;
        }

        if (!Array.isArray(phones) || phones.length === 0) {
            return res.status(400).json({ error: 'No phone numbers provided or resolved for this campaign.' });
        }

        const result = await sendBulkInternal({ db, churchId, campaignId, phones, body, mediaUrls, sentBy, sentByName, personMap, smsNumberId, twilioNumberId, attachVcard });
        return res.json({ success: true, ...result });
    } catch (e: any) {
        const log = createServerLogger(db);
        const errorCode = e.code || e.errorCode || null;
        log.error(`[BulkSend] sendBulk HTTP failed: ${e.message} (code: ${errorCode || 'none'})`, 'system', { churchId, campaignId, errorCode }, churchId);
        return res.status(e.status || 500).json({ error: e.message || 'Bulk send failed', errorCode });
    }
};
