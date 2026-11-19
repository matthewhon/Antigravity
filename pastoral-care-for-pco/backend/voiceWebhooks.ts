import { createHmac, createSign } from 'crypto';
import http2 from 'http2';
import { getAuth } from 'firebase-admin/auth';
import { getMessaging } from 'firebase-admin/messaging';
import { FieldValue } from 'firebase-admin/firestore';
import { getDb, getStorage } from './firebase';
import { createServerLogger } from '../services/logService';
import {
    fetchSignalWireMedia,
    getSignalWireSigningKey,
    getVoiceWebhookBaseUrl,
    mintVoiceSubscriberToken
} from './signalwireClient';
import { getSmsPricingConfig } from './smsSend';
import { sendPushToChurch } from './webPushService';

// Temporarily bypass paid add-on subscription check for testing (set to false before production billing)
const VOICE_SUBSCRIPTION_BYPASS = true;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function normaliseE164(phone: string): string {
    const digits = String(phone || '').replace(/\D/g, '');
    if (!digits) return '';
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return `+${digits}`;
}

function escapeXml(str: string): string {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

function sendLaml(res: any, innerXml: string): void {
    res.set('Content-Type', 'application/xml');
    res.status(200).send(`<?xml version="1.0" encoding="UTF-8"?><Response>${innerXml}</Response>`);
}

function validateSignalWireSignature(
    signingKey: string,
    signature: string,
    webhookUrl: string,
    params: Record<string, string>
): boolean {
    try {
        const sortedKeys = Object.keys(params).sort();
        const paramStr = sortedKeys.reduce((acc, key) => acc + key + (params[key] ?? ''), '');
        const signedStr = webhookUrl + paramStr;
        const expected = createHmac('sha1', signingKey).update(signedStr, 'utf8').digest('base64');
        if (expected.length !== signature.length) return false;
        let diff = 0;
        for (let i = 0; i < expected.length; i++) {
            diff |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
        }
        return diff === 0;
    } catch {
        return false;
    }
}

async function verifySignatureOrSkip(req: any, path: string): Promise<boolean> {
    const signingKey = await getSignalWireSigningKey();
    if (!signingKey) return true; // Not configured yet
    const sig = String(req.headers['x-signalwire-signature'] || req.headers['x-twilio-signature'] || '');
    if (!sig) return false;
    const baseUrl = await getVoiceWebhookBaseUrl();
    if (!baseUrl) return true;
    const fullUrl = `${baseUrl}${path}`;
    return validateSignalWireSignature(signingKey, sig, fullUrl, req.body || {});
}

async function verifyBearerUser(req: any): Promise<{ uid: string; email?: string; name?: string } | null> {
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) return null;
    const idToken = authHeader.slice(7).trim();
    if (!idToken) return null;
    try {
        const decoded = await getAuth().verifyIdToken(idToken);
        return { uid: decoded.uid, email: decoded.email, name: decoded.name };
    } catch {
        return null;
    }
}

async function findNumberByPhone(db: any, e164Phone: string): Promise<{ id: string; data: any } | null> {
    const snap = await db.collection('smsNumbers').where('phoneNumber', '==', e164Phone).limit(1).get();
    if (!snap.empty) return { id: snap.docs[0].id, data: snap.docs[0].data() };
    return null;
}

/**
 * Dispatches native iOS PushKit VoIP pushes (when APNs VoIP credentials are configured)
 * and Android high-priority FCM data messages to authorized staff devices.
 */
async function dispatchVoipPushes(params: {
    db: any;
    churchId: string;
    numberDoc: any;
    callSid: string;
    fromPhone: string;
    toPhone: string;
}): Promise<void> {
    const { db, churchId, numberDoc, callSid, fromPhone, toPhone } = params;
    const allowedUserIds: string[] = Array.isArray(numberDoc.allowedUserIds) ? numberDoc.allowedUserIds : [];

    // Resolve target user IDs
    let targetUids: string[] = allowedUserIds;
    if (targetUids.length === 0) {
        const usersSnap = await db.collection('users').where('churchId', '==', churchId).get();
        targetUids = usersSnap.docs.map((d: any) => d.id);
    }

    const fcmTokens: string[] = [];
    const iosVoipTokens: string[] = [];

    for (const uid of targetUids) {
        const devSnap = await db.collection('users').doc(uid).collection('voipDevices').get();
        devSnap.docs.forEach((d: any) => {
            const dev = d.data();
            if (dev.platform === 'android' && dev.fcmToken) fcmTokens.push(dev.fcmToken);
            if (dev.platform === 'ios' && dev.voipToken) iosVoipTokens.push(dev.voipToken);
        });
    }

    // 1. Android high-priority FCM data message (wakes ConnectionService)
    if (fcmTokens.length > 0) {
        try {
            await getMessaging().sendEachForMulticast({
                tokens: fcmTokens,
                android: { priority: 'high', ttl: 30000 },
                data: {
                    type: 'incoming_call',
                    callSid,
                    churchId,
                    from: fromPhone,
                    to: toPhone,
                    callerName: fromPhone,
                },
            });
        } catch (err: any) {
            console.warn('[voiceWebhooks] FCM VoIP push failed:', err.message);
        }
    }

    // 2. iOS PushKit VoIP push via APNs HTTP/2
    if (iosVoipTokens.length > 0) {
        const settingsSnap = await db.doc('system/settings').get();
        const settings = settingsSnap.data() || {};
        const keyId = (settings.apnsKeyId || process.env.APNS_KEY_ID || '').trim();
        const teamId = (settings.apnsTeamId || process.env.APNS_TEAM_ID || '').trim();
        const authKey = (settings.apnsAuthKey || process.env.APNS_AUTH_KEY || '').trim();
        const bundleId = (settings.iosBundleId || process.env.IOS_BUNDLE_ID || 'com.barnabassoftware.pastoralcaremessaging').trim();

        if (keyId && teamId && authKey) {
            const header = Buffer.from(JSON.stringify({ alg: 'ES256', kid: keyId })).toString('base64url');
            const claims = Buffer.from(JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) })).toString('base64url');
            const signer = createSign('sha256');
            signer.update(`${header}.${claims}`);
            const jwt = `${header}.${claims}.${signer.sign(authKey).toString('base64url')}`;

            const apnsHost = process.env.APNS_SANDBOX === 'true' ? 'https://api.sandbox.push.apple.com' : 'https://api.push.apple.com';
            const client = http2.connect(apnsHost);
            client.on('error', () => {});

            await Promise.all(
                iosVoipTokens.map(
                    (token) =>
                        new Promise<void>((resolve) => {
                            const req = client.request({
                                ':method': 'POST',
                                ':path': `/3/device/${token}`,
                                authorization: `bearer ${jwt}`,
                                'apns-topic': `${bundleId}.voip`,
                                'apns-push-type': 'voip',
                                'apns-priority': '10',
                                'apns-expiration': String(Math.floor(Date.now() / 1000) + 30),
                            });
                            req.setEncoding('utf8');
                            req.on('end', () => resolve());
                            req.on('error', () => resolve());
                            req.write(JSON.stringify({
                                callSid,
                                churchId,
                                from: fromPhone,
                                to: toPhone,
                                callerName: fromPhone,
                            }));
                            req.end();
                        })
                )
            ).finally(() => client.close());
        }
    }

    // 3. Web Push fallback for browser tabs
    await sendPushToChurch({
        churchId,
        title: 'Incoming Call',
        body: `Call from ${fromPhone} to ${numberDoc.friendlyLabel || toPhone}`,
        url: '/messaging',
        tag: `voice_${callSid}`,
    }).catch(() => {});
}

// ─── Authenticated Client Endpoints ──────────────────────────────────────────

/**
 * POST /api/voice/token
 * Mints a short-lived SignalWire Call Fabric Subscriber Token for WebRTC.
 * Gated on Church.voiceAddOn.enabled === true.
 */
export const mintVoiceToken = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const user = await verifyBearerUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { churchId } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

    const db = getDb();
    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const church = churchSnap.data() || {};

        if (!VOICE_SUBSCRIPTION_BYPASS && !church.voiceAddOn?.enabled) {
            return res.status(403).json({
                error: 'Voice Calling add-on is not enabled for this church.',
                code: 'VOICE_ADDON_REQUIRED',
            });
        }

        const result = await mintVoiceSubscriberToken({
            userId: user.uid,
            churchId,
            displayName: user.name || user.email || 'Staff',
            email: user.email,
        });

        return res.json({
            success: true,
            token: result.token,
            spaceUrl: result.spaceUrl,
            subscriberReference: result.reference,
        });
    } catch (e: any) {
        return res.status(500).json({ error: e.message || 'Failed to mint voice token' });
    }
};

/**
 * POST /api/voice/register-voip-device
 * Registers a native iOS PushKit or Android FCM token for background call ringing.
 * Body: { churchId, deviceId, platform: 'ios' | 'android', voipToken?, fcmToken? }
 */
export const registerVoipDevice = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const user = await verifyBearerUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { churchId, deviceId, platform, voipToken, fcmToken } = req.body || {};
    if (!churchId || !deviceId || !platform) {
        return res.status(400).json({ error: 'Missing churchId, deviceId, or platform' });
    }

    const db = getDb();
    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists || (!VOICE_SUBSCRIPTION_BYPASS && !churchSnap.data()?.voiceAddOn?.enabled)) {
            return res.status(403).json({ error: 'Voice Calling add-on is not enabled.' });
        }

        await db
            .collection('users')
            .doc(user.uid)
            .collection('voipDevices')
            .doc(String(deviceId))
            .set(
                {
                    platform,
                    churchId,
                    ...(voipToken ? { voipToken } : {}),
                    ...(fcmToken ? { fcmToken } : {}),
                    updatedAt: Date.now(),
                },
                { merge: true }
            );

        return res.json({ success: true });
    } catch (e: any) {
        return res.status(500).json({ error: e.message || 'Failed to register VoIP device' });
    }
};

// ─── SignalWire LaML Voice Webhooks ──────────────────────────────────────────

/**
 * POST /api/voice/inbound
 * Handles incoming PSTN calls to a church's SignalWire phone number.
 */
export const handleVoiceInbound = async (req: any, res: any) => {
    const valid = await verifySignatureOrSkip(req, '/api/voice/inbound');
    if (!valid) return res.status(403).send('Invalid signature');

    const db = getDb();
    const log = createServerLogger(db);
    const body = req.body || {};
    const callSid = String(body.CallSid || `call_${Date.now()}`);
    const fromPhone = normaliseE164(body.From || '');
    const toPhone = normaliseE164(body.To || '');

    try {
        const found = await findNumberByPhone(db, toPhone);
        if (!found) {
            return sendLaml(res, '<Say>The number you have dialed is not in service.</Say><Hangup/>');
        }

        const { id: smsNumberId, data: numData } = found;
        const churchId = numData.churchId;
        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church = churchSnap.data() || {};

        if ((!VOICE_SUBSCRIPTION_BYPASS && !church.voiceAddOn?.enabled) || !numData.voiceEnabled) {
            return sendLaml(res, '<Say>Voice calling is not enabled on this number. Please send a text message instead.</Say><Hangup/>');
        }

        const baseUrl = await getVoiceWebhookBaseUrl();

        // Record initial call document
        await db.collection('voiceCalls').doc(callSid).set({
            id: callSid,
            churchId,
            smsNumberId,
            direction: 'inbound',
            from: fromPhone,
            to: toPhone,
            status: 'ringing',
            createdAt: Date.now(),
        });

        // Wake mobile & browser clients
        dispatchVoipPushes({
            db,
            churchId,
            numberDoc: numData,
            callSid,
            fromPhone,
            toPhone,
        }).catch((err) => log.warn(`[voiceInbound] Push dispatch error: ${err.message}`, 'system', { callSid }, churchId));

        // Build target SIP/Fabric endpoints for authorized staff
        const allowedUids: string[] = Array.isArray(numData.allowedUserIds) ? numData.allowedUserIds : [];
        let staffUids = allowedUids;
        if (staffUids.length === 0) {
            const usersSnap = await db.collection('users').where('churchId', '==', churchId).limit(10).get();
            staffUids = usersSnap.docs.map((d: any) => d.id);
        }

        const dialAction = baseUrl ? ` action="${escapeXml(`${baseUrl}/api/voice/no-answer?numberId=${encodeURIComponent(smsNumberId)}`)}"` : '';
        const recordAttr = numData.recordCalls ? ' record="record-from-answer"' : '';
        const recordingCb = baseUrl && numData.recordCalls
            ? ` recordingStatusCallback="${escapeXml(`${baseUrl}/api/voice/recording-status`)}"`
            : '';

        if (staffUids.length > 0) {
            const clientsXml = staffUids
                .slice(0, 10)
                .map((uid) => `<Client>church_${escapeXml(churchId)}_user_${escapeXml(uid)}</Client>`)
                .join('');
            return sendLaml(res, `<Dial timeout="25"${dialAction}${recordAttr}${recordingCb}>${clientsXml}</Dial>`);
        }

        if (numData.voiceForwardingNumber) {
            return sendLaml(
                res,
                `<Dial timeout="25"${dialAction}${recordAttr}${recordingCb}><Number>${escapeXml(normaliseE164(numData.voiceForwardingNumber))}</Number></Dial>`
            );
        }

        return sendLaml(res, '<Say>No one is available to take your call. Goodbye.</Say><Hangup/>');
    } catch (e: any) {
        log.error(`[voiceInbound] Error: ${e.message}`, 'system', { callSid, toPhone });
        return sendLaml(res, '<Say>We are unable to complete your call right now.</Say><Hangup/>');
    }
};

/**
 * POST /api/voice/outbound
 * Handles outbound calls initiated by a WebRTC/mobile client.
 */
export const handleVoiceOutbound = async (req: any, res: any) => {
    const valid = await verifySignatureOrSkip(req, '/api/voice/outbound');
    if (!valid) return res.status(403).send('Invalid signature');

    const db = getDb();
    const log = createServerLogger(db);
    const body = req.body || {};
    const callSid = String(body.CallSid || `call_${Date.now()}`);
    const toPhone = normaliseE164(body.To || body.to || '');
    const smsNumberId = String(body.smsNumberId || body.FromNumberId || '');
    const churchId = String(body.churchId || '');
    const userId = String(body.userId || '');

    try {
        if (!toPhone || !smsNumberId || !churchId) {
            return sendLaml(res, '<Say>Missing destination or caller ID.</Say><Hangup/>');
        }

        const [churchSnap, numSnap] = await Promise.all([
            db.collection('churches').doc(churchId).get(),
            db.collection('smsNumbers').doc(smsNumberId).get(),
        ]);

        const church = churchSnap.data() || {};
        const numData = numSnap.data() || {};

        if (!churchSnap.exists || (!VOICE_SUBSCRIPTION_BYPASS && !church.voiceAddOn?.enabled)) {
            return sendLaml(res, '<Say>Voice calling is not enabled for this church.</Say><Hangup/>');
        }
        if (!numSnap.exists || numData.churchId !== churchId || !numData.voiceEnabled) {
            return sendLaml(res, '<Say>Voice calling is not enabled on this phone number.</Say><Hangup/>');
        }
        if (Array.isArray(numData.allowedUserIds) && numData.allowedUserIds.length > 0 && userId && !numData.allowedUserIds.includes(userId)) {
            return sendLaml(res, '<Say>You are not authorized to place calls from this number.</Say><Hangup/>');
        }

        await db.collection('voiceCalls').doc(callSid).set({
            id: callSid,
            churchId,
            smsNumberId,
            direction: 'outbound',
            from: numData.phoneNumber,
            to: toPhone,
            status: 'initiated',
            handledByUserId: userId || null,
            createdAt: Date.now(),
        });

        const baseUrl = await getVoiceWebhookBaseUrl();
        const recordAttr = numData.recordCalls ? ' record="record-from-answer"' : '';
        const recordingCb = baseUrl && numData.recordCalls
            ? ` recordingStatusCallback="${escapeXml(`${baseUrl}/api/voice/recording-status`)}"`
            : '';

        return sendLaml(
            res,
            `<Dial callerId="${escapeXml(numData.phoneNumber)}"${recordAttr}${recordingCb}><Number>${escapeXml(toPhone)}</Number></Dial>`
        );
    } catch (e: any) {
        log.error(`[voiceOutbound] Error: ${e.message}`, 'system', { callSid, churchId }, churchId);
        return sendLaml(res, '<Say>Unable to place your call.</Say><Hangup/>');
    }
};

/**
 * POST /api/voice/no-answer
 * Handles unanswered inbound calls: tries voiceForwardingNumber, then opt-in voicemail.
 */
export const handleVoiceNoAnswer = async (req: any, res: any) => {
    const db = getDb();
    const body = req.body || {};
    const dialStatus = String(body.DialCallStatus || '').toLowerCase();

    if (dialStatus === 'completed' || dialStatus === 'answered') {
        return sendLaml(res, '<Hangup/>');
    }

    const numberId = String(req.query.numberId || '');
    const forwarded = req.query.forwarded === '1';
    if (!numberId) return sendLaml(res, '<Hangup/>');

    const numSnap = await db.collection('smsNumbers').doc(numberId).get();
    const numData = numSnap.data() || {};
    const baseUrl = await getVoiceWebhookBaseUrl();

    if (!forwarded && numData.voiceForwardingNumber) {
        const nextAction = baseUrl
            ? ` action="${escapeXml(`${baseUrl}/api/voice/no-answer?numberId=${encodeURIComponent(numberId)}&forwarded=1`)}"`
            : '';
        return sendLaml(
            res,
            `<Dial timeout="20"${nextAction}><Number>${escapeXml(normaliseE164(numData.voiceForwardingNumber))}</Number></Dial>`
        );
    }

    if (numData.voicemailEnabled) {
        const greeting = numData.voicemailGreetingText || 'No one is available to take your call. Please leave a message after the tone.';
        const recCb = baseUrl ? ` recordingStatusCallback="${escapeXml(`${baseUrl}/api/voice/recording-status`)}"` : '';
        return sendLaml(
            res,
            `<Say>${escapeXml(greeting)}</Say><Record maxLength="120" playBeep="true"${recCb}/><Hangup/>`
        );
    }

    return sendLaml(res, '<Say>No one is available to take your call. Goodbye.</Say><Hangup/>');
};

/**
 * POST /api/voice/recording-status
 * Downloads completed call/voicemail recordings from SignalWire to Firebase Storage.
 */
export const handleVoiceRecordingStatus = async (req: any, res: any) => {
    const db = getDb();
    const log = createServerLogger(db);
    const body = req.body || {};
    const callSid = String(body.CallSid || '');
    const recordingUrl = String(body.RecordingUrl || '');
    const recordingStatus = String(body.RecordingStatus || 'completed').toLowerCase();

    if (!callSid || !recordingUrl || recordingStatus !== 'completed') {
        return res.status(200).send('OK');
    }

    try {
        const callSnap = await db.collection('voiceCalls').doc(callSid).get();
        if (!callSnap.exists) return res.status(200).send('OK');
        const callData = callSnap.data() || {};
        const churchId = callData.churchId;

        const media = await fetchSignalWireMedia(recordingUrl);
        if (media?.buffer) {
            const bucket = getStorage().bucket();
            const filePath = `voiceRecordings/${churchId}/${callSid}.mp3`;
            const file = bucket.file(filePath);
            await file.save(media.buffer, { contentType: media.contentType || 'audio/mpeg' });
            const [signedUrl] = await file.getSignedUrl({
                action: 'read',
                expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 5,
            });
            await callSnap.ref.update({ recordingUrl: signedUrl });
        }
    } catch (e: any) {
        log.error(`[voiceRecordingStatus] Failed for ${callSid}: ${e.message}`, 'system', { callSid });
    }

    return res.status(200).send('OK');
};

/**
 * POST /api/voice/status
 * Receives final call status callbacks, logs call timeline items, and records per-minute billing.
 */
export const handleVoiceStatus = async (req: any, res: any) => {
    const valid = await verifySignatureOrSkip(req, '/api/voice/status');
    if (!valid) return res.status(403).send('Invalid signature');

    const db = getDb();
    const log = createServerLogger(db);
    const body = req.body || {};
    const callSid = String(body.CallSid || '');
    const callStatus = String(body.CallStatus || '').toLowerCase();
    const durationSec = Number(body.CallDuration || body.Duration || 0);

    if (!callSid) return res.status(200).send('OK');

    try {
        const callRef = db.collection('voiceCalls').doc(callSid);
        const callSnap = await callRef.get();
        if (!callSnap.exists) return res.status(200).send('OK');
        const callData = callSnap.data() || {};

        const isTerminal = ['completed', 'busy', 'no-answer', 'failed', 'canceled'].includes(callStatus);
        await callRef.update({
            status: callStatus,
            ...(durationSec > 0 ? { durationSec } : {}),
            ...(isTerminal ? { endedAt: Date.now() } : {}),
        });

        // Bill per-minute usage on terminal call with duration > 0
        if (isTerminal && durationSec > 0 && !callData.billed) {
            const minutes = Math.max(1, Math.ceil(durationSec / 60));
            const pricing = await getSmsPricingConfig(db);
            const isOutbound = callData.direction === 'outbound';
            const unitCost = isOutbound ? pricing.voiceOutboundCostUsd : pricing.voiceInboundCostUsd;
            const unitPrice = isOutbound ? pricing.voiceOutboundPriceUsd : pricing.voiceInboundPriceUsd;
            const costUsd = Number((minutes * unitCost).toFixed(6));
            const customerChargeUsd = Number((minutes * unitPrice).toFixed(6));

            const now = new Date();
            const monthKey = `${now.getFullYear()}_${String(now.getMonth() + 1).padStart(2, '0')}`;

            await db.collection('smsUsageRecords').add({
                churchId: callData.churchId,
                toPhone: callData.to,
                fromPhone: callData.from,
                direction: callData.direction,
                segments: minutes,
                isMms: false,
                isVoice: true,
                durationSec,
                costUsd,
                customerChargeUsd,
                twilioSid: callSid,
                source: 'voice',
                createdAt: Date.now(),
            });

            await db.collection('churches').doc(callData.churchId).set(
                {
                    smsUsageDetails: {
                        [monthKey]: {
                            voiceMinutes: FieldValue.increment(minutes),
                            providerCostUsd: FieldValue.increment(costUsd),
                            customerChargeUsd: FieldValue.increment(customerChargeUsd),
                        },
                    },
                },
                { merge: true }
            );

            await callRef.update({ billed: true });
        }
    } catch (e: any) {
        log.error(`[voiceStatus] Failed for ${callSid}: ${e.message}`, 'system', { callSid });
    }

    return res.status(200).send('OK');
};
