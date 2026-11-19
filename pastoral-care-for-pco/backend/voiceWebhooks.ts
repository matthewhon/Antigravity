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
import { getSmsPricingConfig, sendIndividualInternal } from './smsSend';
import { sendPushToChurch } from './webPushService';
import { evaluateUserAvailability } from './voiceAvailability';
import { executeFlowNode, renderUserVoicemailLaml } from './voiceFlowEngine';
import { transcribeVoicemailWithGemini } from './voiceAudioService';

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

async function lookupPersonByPhone(
    db: any,
    churchId: string,
    e164Phone: string
): Promise<{ personId: string; callerName: string } | null> {
    if (!churchId || !e164Phone) return null;
    try {
        const digits = e164Phone.replace(/\D/g, '');
        const last10 = digits.length >= 10 ? digits.slice(-10) : digits;
        const formatted = last10.length === 10 ? `(${last10.slice(0, 3)}) ${last10.slice(3, 6)}-${last10.slice(6)}` : '';
        const candidates = Array.from(new Set([e164Phone, last10, formatted].filter(Boolean)));
        for (const candidate of candidates) {
            const snap = await db
                .collection('people')
                .where('churchId', '==', churchId)
                .where('phone', '==', candidate)
                .limit(1)
                .get();
            if (!snap.empty) {
                const doc = snap.docs[0];
                const d = doc.data() || {};
                return { personId: doc.id, callerName: d.name || e164Phone };
            }
        }
    } catch {
        // non-fatal
    }
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
    explicitTargetUids?: string[];
    callerName?: string;
}): Promise<void> {
    const { db, churchId, numberDoc, callSid, fromPhone, toPhone, explicitTargetUids, callerName } = params;

    let targetUids: string[];
    if (Array.isArray(explicitTargetUids)) {
        targetUids = explicitTargetUids;
    } else {
        const allowedUserIds: string[] = Array.isArray(numberDoc.allowedUserIds) ? numberDoc.allowedUserIds : [];
        targetUids = allowedUserIds;
        if (targetUids.length === 0) {
            const usersSnap = await db.collection('users').where('churchId', '==', churchId).get();
            targetUids = usersSnap.docs.map((d: any) => d.id);
        }
    }

    if (targetUids.length === 0) return;

    const displayCaller = callerName || fromPhone;
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
                    callerName: displayCaller,
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
        const bundleId = (settings.iosBundleId || process.env.IOS_BUNDLE_ID || 'com.barnabassoftware.pcmessaging').trim();

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
                                callerName: displayCaller,
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

        const baseUrl = (await getVoiceWebhookBaseUrl()) || '';
        const churchTimezone = church.timezone || 'America/Chicago';
        const personMatch = await lookupPersonByPhone(db, churchId, fromPhone);

        // Record initial call document
        await db.collection('voiceCalls').doc(callSid).set({
            id: callSid,
            churchId,
            smsNumberId,
            personId: personMatch?.personId || null,
            callerName: personMatch?.callerName || null,
            direction: 'inbound',
            from: fromPhone,
            to: toPhone,
            status: 'ringing',
            createdAt: Date.now(),
        });

        // 1. Visual Calling Configurator Flow Mode
        if (numData.voiceFlowId) {
            const flowSnap = await db.collection('voiceFlows').doc(String(numData.voiceFlowId)).get();
            const flowData = flowSnap.data();
            const graph = flowData?.publishedGraph || flowData?.draftGraph;
            if (flowSnap.exists && flowData?.churchId === churchId && graph?.entryNodeId) {
                const laml = await executeFlowNode(
                    {
                        db,
                        churchId,
                        churchTimezone,
                        smsNumberId,
                        numData,
                        flowId: flowSnap.id,
                        graph,
                        callSid,
                        fromPhone,
                        toPhone,
                        callerName: personMatch?.callerName || null,
                        baseUrl,
                        pushDispatcher: async (targetUids: string[]) => {
                            await dispatchVoipPushes({
                                db,
                                churchId,
                                numberDoc: numData,
                                callSid,
                                fromPhone,
                                toPhone,
                                explicitTargetUids: targetUids,
                                callerName: personMatch?.callerName,
                            });
                        },
                        smsSender: async (message: string) => {
                            await sendIndividualInternal({
                                db,
                                log,
                                churchId,
                                toPhone: fromPhone,
                                body: message,
                                smsNumberId,
                                sentBy: 'voice_flow',
                                sentByName: 'Voice Call Flow',
                                personId: personMatch?.personId || null,
                                personName: personMatch?.callerName || null,
                                preventIdentityOverwrite: true,
                            });
                        },
                    },
                    graph.entryNodeId
                );
                return sendLaml(res, laml);
            }
        }

        // 2. Legacy Flat Mode (with per-user calling hours enforcement)
        const allowedUids: string[] = Array.isArray(numData.allowedUserIds) ? numData.allowedUserIds : [];
        let candidateDocs: Array<{ id: string; data: any }> = [];
        if (allowedUids.length > 0) {
            const snaps = await Promise.all(
                allowedUids.slice(0, 20).map((uid) => db.collection('users').doc(uid).get())
            );
            candidateDocs = snaps.filter((s: any) => s.exists).map((s: any) => ({ id: s.id, data: s.data() || {} }));
        } else {
            const usersSnap = await db.collection('users').where('churchId', '==', churchId).limit(20).get();
            candidateDocs = usersSnap.docs.map((d: any) => ({ id: d.id, data: d.data() || {} }));
        }

        const availableUids = candidateDocs
            .filter((u) => evaluateUserAvailability(u.data, churchTimezone).available)
            .map((u) => u.id)
            .slice(0, 10);

        const singleTargetUserId = candidateDocs.length === 1 ? candidateDocs[0].id : null;
        const dialAction = baseUrl
            ? ` action="${escapeXml(`${baseUrl}/api/voice/no-answer?numberId=${encodeURIComponent(smsNumberId)}${singleTargetUserId ? `&targetUserId=${encodeURIComponent(singleTargetUserId)}` : ''}`)}"`
            : '';
        const recordAttr = numData.recordCalls ? ' record="record-from-answer"' : '';
        const recordingCb = baseUrl && numData.recordCalls
            ? ` recordingStatusCallback="${escapeXml(`${baseUrl}/api/voice/recording-status`)}"`
            : '';

        if (availableUids.length > 0) {
            dispatchVoipPushes({
                db,
                churchId,
                numberDoc: numData,
                callSid,
                fromPhone,
                toPhone,
                explicitTargetUids: availableUids,
                callerName: personMatch?.callerName,
            }).catch((err) => log.warn(`[voiceInbound] Push dispatch error: ${err.message}`, 'system', { callSid }, churchId));

            const ringTimeout = Math.max(6, Math.min(60, Number(numData.voiceRingTimeoutSec || 24)));
            const clientsXml = availableUids
                .map((uid) => `<Client>church_${escapeXml(churchId)}_user_${escapeXml(uid)}</Client>`)
                .join('');
            return sendLaml(res, `<Dial timeout="${ringTimeout}"${dialAction}${recordAttr}${recordingCb}>${clientsXml}</Dial>`);
        }

        // All targeted users are outside calling hours or on DND -> immediate fallback
        if (numData.voiceForwardingNumber) {
            return sendLaml(
                res,
                `<Dial timeout="25"${dialAction}${recordAttr}${recordingCb}><Number>${escapeXml(normaliseE164(numData.voiceForwardingNumber))}</Number></Dial>`
            );
        }

        const vmLaml = await renderUserVoicemailLaml({
            db,
            churchId,
            targetUserId: singleTargetUserId,
            numData,
            baseUrl,
        });
        return sendLaml(res, vmLaml);
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
    const targetUserId = req.query.targetUserId ? String(req.query.targetUserId) : null;
    const forwarded = req.query.forwarded === '1';
    if (!numberId) return sendLaml(res, '<Hangup/>');

    const numSnap = await db.collection('smsNumbers').doc(numberId).get();
    const numData = numSnap.data() || {};
    const baseUrl = (await getVoiceWebhookBaseUrl()) || '';

    if (!forwarded && !targetUserId && numData.voiceForwardingNumber) {
        const nextAction = baseUrl
            ? ` action="${escapeXml(`${baseUrl}/api/voice/no-answer?numberId=${encodeURIComponent(numberId)}&forwarded=1`)}"`
            : '';
        return sendLaml(
            res,
            `<Dial timeout="20"${nextAction}><Number>${escapeXml(normaliseE164(numData.voiceForwardingNumber))}</Number></Dial>`
        );
    }

    const vmLaml = await renderUserVoicemailLaml({
        db,
        churchId: numData.churchId,
        targetUserId,
        numData,
        baseUrl,
    });
    return sendLaml(res, vmLaml);
};

/**
 * POST /api/voice/recording-status
 * Downloads completed call/voicemail recordings from SignalWire to Firebase Storage,
 * transcribes voicemails with Gemini, and writes private voicemail docs to `voiceVoicemails`.
 */
export const handleVoiceRecordingStatus = async (req: any, res: any) => {
    const db = getDb();
    const log = createServerLogger(db);
    const body = req.body || {};
    const callSid = String(body.CallSid || '');
    const recordingUrl = String(body.RecordingUrl || '');
    const recordingStatus = String(body.RecordingStatus || 'completed').toLowerCase();
    const isVoicemail = req.query.isVoicemail === '1';
    const targetUserId = req.query.targetUserId ? String(req.query.targetUserId) : null;
    const recordingDurationSec = Number(body.RecordingDuration || 0);

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

            if (isVoicemail) {
                const geminiResult = await transcribeVoicemailWithGemini(media.buffer, media.contentType || 'audio/mpeg');
                const vmDoc = {
                    id: callSid,
                    callSid,
                    churchId,
                    smsNumberId: callData.smsNumberId || null,
                    personId: callData.personId || null,
                    callerName: callData.callerName || null,
                    from: callData.from || '',
                    to: callData.to || '',
                    targetUserId: targetUserId || null,
                    recordingUrl: signedUrl,
                    durationSec: recordingDurationSec || callData.durationSec || 0,
                    transcript: geminiResult?.transcript || null,
                    summary: geminiResult?.summary || null,
                    urgent: Boolean(geminiResult?.urgent),
                    listenedAt: null,
                    createdAt: Date.now(),
                };
                await db.collection('voiceVoicemails').doc(callSid).set(vmDoc);
                await callSnap.ref.update({
                    isVoicemail: true,
                    targetUserId: targetUserId || null,
                    voicemailUrgent: Boolean(geminiResult?.urgent),
                    ...(targetUserId ? {} : { recordingUrl: signedUrl }),
                });

                const title = geminiResult?.urgent ? 'Urgent Voicemail' : 'New Voicemail';
                const callerLabel = callData.callerName || callData.from || 'Unknown caller';
                const bodyText = geminiResult?.summary
                    ? `From ${callerLabel}: ${geminiResult.summary}`
                    : `New voicemail from ${callerLabel}`;

                if (targetUserId) {
                    const devSnap = await db.collection('users').doc(targetUserId).collection('voipDevices').get();
                    const fcmTokens: string[] = [];
                    devSnap.docs.forEach((d: any) => {
                        const dev = d.data();
                        if (dev.fcmToken) fcmTokens.push(dev.fcmToken);
                    });
                    if (fcmTokens.length > 0) {
                        await getMessaging()
                            .sendEachForMulticast({
                                tokens: fcmTokens,
                                notification: { title, body: bodyText },
                                data: { type: 'voicemail', callSid, churchId, targetUserId },
                            })
                            .catch(() => {});
                    }
                } else {
                    await sendPushToChurch({
                        churchId,
                        title,
                        body: bodyText,
                        url: '/messaging',
                        tag: `vm_${callSid}`,
                    }).catch(() => {});
                }
            } else {
                await callSnap.ref.update({ recordingUrl: signedUrl });
            }
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

/**
 * POST /api/voice/log-call
 * Authenticated client fallback to record/update outbound or inbound WebRTC calls in `voiceCalls`
 * so Recent Calls stays populated even when SignalWire Call Fabric bypasses LaML webhooks.
 */
export const logClientCall = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const user = await verifyBearerUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const {
        churchId,
        callId,
        smsNumberId,
        direction = 'outbound',
        to,
        from,
        status = 'initiated',
        durationSec,
    } = req.body || {};

    if (!churchId || !callId) {
        return res.status(400).json({ error: 'Missing churchId or callId' });
    }

    const db = getDb();
    try {
        const userSnap = await db.collection('users').doc(user.uid).get();
        const userData = userSnap.data() || {};
        if (userData.churchId && userData.churchId !== churchId && !userData.roles?.includes('System Administration')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const callRef = db.collection('voiceCalls').doc(String(callId));
        const existing = await callRef.get();

        if (!existing.exists) {
            let fromPhone = from || '';
            if (!fromPhone && smsNumberId) {
                const numSnap = await db.collection('smsNumbers').doc(String(smsNumberId)).get();
                fromPhone = numSnap.data()?.phoneNumber || '';
            }
            await callRef.set({
                id: String(callId),
                churchId,
                smsNumberId: smsNumberId || null,
                direction: direction === 'inbound' ? 'inbound' : 'outbound',
                from: normaliseE164(fromPhone) || fromPhone,
                to: normaliseE164(String(to || '')) || String(to || ''),
                status: String(status),
                ...(typeof durationSec === 'number' && durationSec > 0 ? { durationSec } : {}),
                handledByUserId: user.uid,
                createdAt: Date.now(),
            });
        } else {
            const isTerminal = ['completed', 'ended', 'busy', 'no-answer', 'failed', 'canceled'].includes(String(status).toLowerCase());
            await callRef.update({
                status: String(status),
                ...(typeof durationSec === 'number' && durationSec > 0 ? { durationSec } : {}),
                ...(isTerminal ? { endedAt: Date.now() } : {}),
            });
        }

        return res.json({ success: true });
    } catch (e: any) {
        return res.status(500).json({ error: e.message || 'Failed to log call' });
    }
};

/**
 * POST /api/voice/flow-step
 * Stateless SignalWire LaML callback that advances a published VoiceFlow graph.
 */
export const handleVoiceFlowStep = async (req: any, res: any) => {
    const db = getDb();
    const log = createServerLogger(db);
    const body = req.body || {};

    const flowId = String(req.query.flowId || '');
    const nodeId = String(req.query.nodeId || '');
    const callSid = String(req.query.callSid || body.CallSid || '');
    const attempt = Number(req.query.attempt || 1);
    const targetUserId = req.query.targetUserId ? String(req.query.targetUserId) : null;
    const seqIdx = req.query.seqIdx !== undefined ? Number(req.query.seqIdx) : undefined;

    if (!flowId || !nodeId) {
        return sendLaml(res, '<Say>Call routing configuration error. Goodbye.</Say><Hangup/>');
    }

    try {
        const [flowSnap, callSnap] = await Promise.all([
            db.collection('voiceFlows').doc(flowId).get(),
            callSid ? db.collection('voiceCalls').doc(callSid).get() : Promise.resolve(null),
        ]);

        if (!flowSnap.exists) {
            return sendLaml(res, '<Say>Call flow not found. Goodbye.</Say><Hangup/>');
        }

        const flowData = flowSnap.data() || {};
        const graph = flowData.publishedGraph || flowData.draftGraph;
        if (!graph) {
            return sendLaml(res, '<Say>Call flow is empty. Goodbye.</Say><Hangup/>');
        }

        const callData = callSnap?.exists ? callSnap.data() || {} : {};
        const churchId = flowData.churchId || callData.churchId;
        const smsNumberId = callData.smsNumberId || '';

        const [churchSnap, numSnap] = await Promise.all([
            churchId ? db.collection('churches').doc(churchId).get() : Promise.resolve(null),
            smsNumberId ? db.collection('smsNumbers').doc(smsNumberId).get() : Promise.resolve(null),
        ]);

        const church = churchSnap?.exists ? churchSnap.data() || {} : {};
        const numData = numSnap?.exists ? numSnap.data() || {} : {};
        const baseUrl = (await getVoiceWebhookBaseUrl()) || '';

        const digits = body.Digits !== undefined ? String(body.Digits) : undefined;
        const dialStatus = body.DialCallStatus !== undefined ? String(body.DialCallStatus) : undefined;

        const laml = await executeFlowNode(
            {
                db,
                churchId,
                churchTimezone: church.timezone || 'America/Chicago',
                smsNumberId,
                numData,
                flowId,
                graph,
                callSid,
                fromPhone: callData.from || normaliseE164(body.From || ''),
                toPhone: callData.to || normaliseE164(body.To || ''),
                callerName: callData.callerName || null,
                baseUrl,
                pushDispatcher: async (targetUids: string[]) => {
                    await dispatchVoipPushes({
                        db,
                        churchId,
                        numberDoc: numData,
                        callSid,
                        fromPhone: callData.from || '',
                        toPhone: callData.to || '',
                        explicitTargetUids: targetUids,
                        callerName: callData.callerName,
                    });
                },
                smsSender: async (message: string) => {
                    const callerPhone = callData.from || normaliseE164(body.From || '');
                    if (!callerPhone || !smsNumberId) return;
                    await sendIndividualInternal({
                        db,
                        log,
                        churchId,
                        toPhone: callerPhone,
                        body: message,
                        smsNumberId,
                        sentBy: 'voice_flow',
                        sentByName: 'Voice Call Flow',
                        personId: callData.personId || null,
                        personName: callData.callerName || null,
                        preventIdentityOverwrite: true,
                    });
                },
            },
            nodeId,
            { digits, dialStatus, attempt, targetUserId, seqIdx }
        );

        return sendLaml(res, laml);
    } catch (e: any) {
        log.error(`[voiceFlowStep] Error: ${e.message}`, 'system', { flowId, nodeId, callSid });
        return sendLaml(res, '<Say>We are unable to complete your call right now.</Say><Hangup/>');
    }
};

/**
 * POST /api/voice/whisper
 * Call-screening whisper played to a forwarded PSTN number before bridging.
 */
export const handleVoiceWhisper = async (req: any, res: any) => {
    const callerName = String(req.query.callerName || 'a caller');
    const digits = req.body?.Digits !== undefined ? String(req.body.Digits).trim() : undefined;

    if (digits === '1') {
        return sendLaml(res, '<Say>Connecting now.</Say>');
    }
    if (digits !== undefined) {
        return sendLaml(res, '<Hangup/>');
    }

    const baseUrl = (await getVoiceWebhookBaseUrl()) || '';
    const actionUrl = `${baseUrl}/api/voice/whisper?callerName=${encodeURIComponent(callerName)}`;
    return sendLaml(
        res,
        `<Gather numDigits="1" timeout="8" action="${escapeXml(actionUrl)}" method="POST"><Say>Incoming church call from ${escapeXml(callerName)}. Press 1 to accept.</Say></Gather><Hangup/>`
    );
};

/**
 * POST /api/voice/mark-voicemail-read
 * Marks a voicemail as listened (restricted to target user or Church Admin).
 */
export const handleMarkVoicemailRead = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const user = await verifyBearerUser(req);
    if (!user) return res.status(401).json({ error: 'Unauthorized' });

    const { voicemailId } = req.body || {};
    if (!voicemailId) return res.status(400).json({ error: 'Missing voicemailId' });

    const db = getDb();
    try {
        const [vmSnap, userSnap] = await Promise.all([
            db.collection('voiceVoicemails').doc(String(voicemailId)).get(),
            db.collection('users').doc(user.uid).get(),
        ]);

        if (!vmSnap.exists) return res.status(404).json({ error: 'Voicemail not found' });
        const vm = vmSnap.data() || {};
        const uData = userSnap.data() || {};
        const isAdmin =
            Array.isArray(uData.roles) &&
            (uData.roles.includes('Church Admin') || uData.roles.includes('System Administration'));

        if (uData.churchId !== vm.churchId && !uData.roles?.includes('System Administration')) {
            return res.status(403).json({ error: 'Forbidden' });
        }
        if (vm.targetUserId && vm.targetUserId !== user.uid && !isAdmin) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const now = Date.now();
        await vmSnap.ref.update({ listenedAt: now });
        await db.collection('voiceCalls').doc(String(voicemailId)).update({ voicemailListenedAt: now }).catch(() => {});

        return res.json({ success: true, listenedAt: now });
    } catch (e: any) {
        return res.status(500).json({ error: e.message || 'Failed to mark voicemail as read' });
    }
};


