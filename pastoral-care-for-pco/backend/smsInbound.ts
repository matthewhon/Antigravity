import http from 'http';
import { createHmac } from 'crypto';
import { sendPushToChurch } from './webPushService';

/**
 * Verify a SignalWire (Twilio-compatible) webhook signature.
 * SignalWire signs with HMAC-SHA1: the key is the signing key, the message
 * is the full webhook URL concatenated with alphabetically-sorted POST params.
 * @see https://developer.signalwire.com/guides/how-to-secure-your-signalwire-webhooks
 */
function validateRequest(signingKey: string, signature: string, webhookUrl: string, params: Record<string, string>): boolean {
    try {
        // Build the signed string: URL + alphabetically sorted param key+value pairs
        const sortedKeys = Object.keys(params).sort();
        const paramStr = sortedKeys.reduce((acc, key) => acc + key + (params[key] ?? ''), '');
        const signedStr = webhookUrl + paramStr;

        const expected = createHmac('sha1', signingKey)
            .update(signedStr, 'utf8')
            .digest('base64');

        // Constant-time comparison to prevent timing attacks
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
import { getDb, getStorage } from './firebase';
import { createServerLogger } from '../services/logService';
import { FieldValue } from 'firebase-admin/firestore';
import { getSignalWireSigningKey, getSmsWebhookBaseUrl, fetchSignalWireMedia } from './signalwireClient';
import { processExecutiveAiQuery } from './executiveAiAgent';
import { updatePcoSubscriptionField } from './pcoFieldData';
import { getPcoSignupQuestions, createPcoPerson, registerPersonForEvent } from './pcoRegistrationsService.js';

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Helpers Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/**
 * Strips quoted history from an incoming SMS/email reply to isolate the latest message.
 */
export function extractLatestMessage(body: string): string {
    let text = body;
    const splitters = [
        /\n\s*On\s+.*wrote:/i,
        /\n\s*-+\s*Original Message\s*-+/i,
        /\n\s*_{10,}/,
        /\n\s*From:\s/i
    ];
    for (const regex of splitters) {
        const match = text.match(regex);
        if (match && match.index !== undefined) {
            text = text.substring(0, match.index);
        }
    }
    return text.trim() || body.trim();
}

/** Normalise an E.164 phone number to a consistent key (strip all non-digits, prefix +1 for US). */
function normaliseE164(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return `+${digits}`;
}

/** Look up a PCO person by phone number to link the conversation. */
async function matchPersonByPhone(db: any, churchId: string, phone: string): Promise<{ personId?: string; personName?: string; personAvatar?: string | null } | null> {
    try {
        const snap = await db.collection('people')
            .where('churchId', '==', churchId)
            .where('e164Phone', '==', phone)
            .limit(1)
            .get();
        if (snap.empty) return null;
        const p = snap.docs[0].data();
        return { personId: p.id, personName: p.name, personAvatar: p.avatar || null };
    } catch {
        return null;
    }
}

/**
 * Add a PCO person to a PCO list via the People API.
 * Fire-and-forget safe — errors are logged but never thrown.
 */
async function addPersonToPcoList(db: any, log: any, churchId: string, personId: string, listId: string): Promise<void> {
    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        const token: string = churchSnap.data()?.pcoAccessToken || '';
        if (!token) {
            log.warn('[Inbound SMS] No PCO token — cannot add person to list', 'system', { churchId, personId, listId }, churchId);
            return;
        }
        const res = await fetch(
            `https://api.planningcenteronline.com/people/v2/lists/${listId}/list_members`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'PastoralCareApp/1.0',
                },
                body: JSON.stringify({
                    data: {
                        type: 'ListMember',
                        attributes: {},
                        relationships: {
                            person: { data: { type: 'Person', id: personId } },
                        },
                    },
                }),
            }
        );
        if (!res.ok) {
            const err = await res.text().catch(() => '');
            log.warn(`[Inbound SMS] PCO list add failed (${res.status}): ${err.slice(0, 200)}`, 'system', { churchId, personId, listId }, churchId);
        } else {
            log.info(`[Inbound SMS] Added person ${personId} to PCO list ${listId}`, 'system', { churchId, personId, listId }, churchId);
        }
    } catch (e: any) {
        log.warn(`[Inbound SMS] Error adding person to PCO list: ${e.message}`, 'system', { churchId, personId, listId }, churchId);
    }
}

/** Check if the church has a matching active keyword for the given body. */
async function matchKeyword(db: any, churchId: string, body: string, smsNumberId?: string): Promise<any | null> {
    try {
        const keyword = body.trim().toUpperCase().split(/\s+/)[0];
        const snap = await db.collection('smsKeywords')
            .where('churchId', '==', churchId)
            .where('keyword', '==', keyword)
            .where('isActive', '==', true)
            .get();
        if (snap.empty) return null;

        const matches = snap.docs.map((d: any) => ({ id: d.id, ...d.data() }));

        // Find the most appropriate keyword match for this phone line
        const validMatch = matches.find((m: any) => {
            if (!smsNumberId) return true;

            if (Array.isArray(m.numberIds) && m.numberIds.length > 0) {
                return m.numberIds.includes(smsNumberId);
            }
            if (m.twilioNumberId) {
                return m.twilioNumberId === smsNumberId;
            }
            return true;
        });

        return validMatch || null;
    } catch {
        return null;
    }
}

/**
 * Fire-and-forget: generate an AI-suggested reply for an inbound message
 * using the church's knowledge base, then store it in Firestore.
 * Never throws —â€ any error is logged and silently swallowed so the
 * Twilio webhook response is never blocked or delayed.
 */
async function generateAiSuggestion(
    db: any,
    log: any,
    churchId: string,
    convId: string,
    inboundMessageId: string,
    inboundBody: string,
    churchName: string,
): Promise<void> {
    try {
        // Load the church knowledge base
        const knowledgeSnap = await db.collection('smsAgentKnowledge').doc(churchId).get();
        const kb = knowledgeSnap.exists ? knowledgeSnap.data() : {};

        const systemPrompt = `You are a friendly, warm church receptionist for ${churchName}.
Your job is to compose a helpful, natural reply to an incoming SMS from a visitor or member.
Only answer based on the church facts below. If the answer is not in the facts, reply with something like "Let me check on that and get back to you!"
Keep replies under 160 characters when possible (1 SMS segment). Do NOT include any explanation, preamble, or quotes —â€ return ONLY the reply text.

CHURCH FACTS:
${kb.address ? `Address: ${kb.address}` : ''}
${kb.serviceTimes ? `Service Times: ${kb.serviceTimes}` : ''}
${kb.pastor ? `Lead Pastor: ${kb.pastor}` : ''}
${kb.ministries ? `Ministries: ${kb.ministries}` : ''}
${kb.classes ? `Classes: ${kb.classes}` : ''}
${kb.locations ? `Locations: ${kb.locations}` : ''}
${kb.website ? `Website: ${kb.website}` : ''}
${kb.phone ? `Phone: ${kb.phone}` : ''}
${kb.customFacts ? `Other Info: ${kb.customFacts}` : ''}

INCOMING MESSAGE:
"${inboundBody}"

Write the reply:`;

        // Call the Gemini proxy endpoint on the same server
        const postBody = JSON.stringify({
            model: 'gemini-2.5-flash',
            prompt: systemPrompt,
        });

        const suggestedBody: string = await new Promise((resolve, reject) => {
            const apiBaseUrl = process.env.API_BASE_URL || 'http://localhost:3000';
            const urlObj = new URL('/ai/generate', apiBaseUrl);
            const options = {
                hostname: urlObj.hostname,
                port: urlObj.port || 80,
                path: urlObj.pathname,
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(postBody),
                },
            };
            const req = http.request(options, (res) => {
                let data = '';
                res.on('data', (chunk) => { data += chunk; });
                res.on('end', () => {
                    try {
                        const parsed = JSON.parse(data);
                        resolve((parsed.text || '').trim());
                    } catch {
                        reject(new Error('Failed to parse Gemini response'));
                    }
                });
            });
            req.on('error', reject);
            req.write(postBody);
            req.end();
        });

        if (!suggestedBody) return; // Nothing to save

        // Persist the suggestion in the aiSuggestions sub-collection
        const suggestionId = `sug_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.collection('smsConversations').doc(convId)
            .collection('aiSuggestions').doc(suggestionId).set({
                id: suggestionId,
                conversationId: convId,
                churchId,
                inboundMessageId,
                suggestedBody,
                status: 'pending',
                createdAt: Date.now(),
            });

        log.info(`[SMS Agent] Generated suggestion for conversation ${convId}`, 'system', { churchId, convId }, churchId);
    } catch (err: any) {
        log.warn(`[SMS Agent] Failed to generate AI suggestion: ${err.message}`, 'system', { churchId, convId }, churchId);
    }
}

// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Prayer Request Detection Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬

/**
 * Classify an inbound SMS body as a prayer request.
 *
 * Returns:
 *   'generic'  —â€ the sender is asking for prayer for themselves with no detail
 *                (triggers the clarifying reply flow)
 *   'specific' —â€ the sender has included a specific request or person
 *                (tag immediately, no clarifying reply needed)
 *   null       —â€ not a prayer request
 *
 * Detection is regex-based (no external API), keeping cost at $0.
 */
export function detectPrayerRequest(body: string): 'generic' | 'specific' | null {
    const text = body.trim().toLowerCase();

    // Ã¢â€â‚¬Ã¢â€â‚¬ Generic patterns Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    // These match requests that ask for prayer for the sender themselves,
    // with no additional detail provided in the message.
    const genericPatterns: RegExp[] = [
        /^(will|can|could|would) (you|someone|anyone|y'all|yall) (please )?pray for me\??\.?$/i,
        /^(please )?pray for me\??\.?$/i,
        /^i need (prayer|your prayers|prayers)\.?$/i,
        /^i('m| am) (in need of|asking for) (prayer|prayers)\.?$/i,
        /^(can|could|would) (i|we) (get|have|request) (a )?(prayer|some prayers)\??\.?$/i,
        /^(i'd|i would) (like|appreciate|love) (a )?(prayer|your prayers|some prayer)\.?$/i,
        /^(please keep me in your prayers?)\.?$/i,
        /^(keep me in your prayers?)\.?$/i,
        /^i need (some )?prayer support\.?$/i,
    ];

    // Ã¢â€â‚¬Ã¢â€â‚¬ Specific patterns Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
    // These match requests that name a person, situation, or topic after the
    // prayer phrase —â€ enough detail that no clarifying reply is needed.
    const specificPatterns: RegExp[] = [
        /\bpray for (my|our|his|her|their|a |the )\w/i,
        /\bpray for [a-z].{3,}/i,           // "pray for [name/situation]"
        /\bprayer (request|need) (for|about|regarding)\b/i,
        /\bplease (pray|keep .+ in prayer|lift up)\b.{5,}/i,
        /\bi need prayer for\b/i,
        /\bkeep .+ in (your )?prayers?\b/i,
        /\blift (up|them|him|her) in prayer\b/i,
        /\bpraying for\b.{4,}/i,
        /\b(unspoken )?prayer request\b/i,
        /\bneed (prayer|prayers) (for|about|with|over|regarding)\b/i,
        /\bintercede for\b/i,
        /\bplease cover .+ in prayer\b/i,
        /\b(stand|agree) in prayer (with|for)\b/i,
    ];

    // Check generic first (shorter, more specific match before the broad specific check)
    for (const re of genericPatterns) {
        if (re.test(text)) return 'generic';
    }

    for (const re of specificPatterns) {
        if (re.test(text)) return 'specific';
    }

    return null;
}

/**
 * Find or create the "Needs Prayer" SmsTag for the given church.
 * Returns the Firestore document ID of the tag.
 */
async function getOrCreatePrayerTag(db: any, churchId: string, log: any): Promise<string> {
    // Try to find an existing tag by name
    const existing = await db.collection('smsTags')
        .where('churchId', '==', churchId)
        .where('name', '==', 'Needs Prayer')
        .limit(1)
        .get();

    if (!existing.empty) {
        return existing.docs[0].id;
    }

    // Auto-create the tag so churches don't need to set it up manually
    const newTag = {
        churchId,
        name: 'Needs Prayer',
        emoji: '🙏',
        color: 'violet',
        createdAt: Date.now(),
    };
    const ref = await db.collection('smsTags').add(newTag);
    log.info(`[Prayer Detection] Auto-created "Needs Prayer" tag for church ${churchId}`, 'system', { churchId }, churchId);
    return ref.id;
}



// Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ POST /api/messaging/inbound Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
// SignalWire sends an HTTP POST to this endpoint on every inbound SMS/MMS.
// Responds with TwiML (200 + empty response body, or keyword auto-reply).

export const handleInboundSms = async (req: any, res: any) => {
    const db = getDb();
    const log = createServerLogger(db);

    // â”€â”€ Webhook signature validation (required for production per SignalWire docs) â”€â”€
    try {
        const signingKey = await getSignalWireSigningKey();
        if (signingKey) {
            const baseUrl = await getSmsWebhookBaseUrl();
            const webhookUrl = `${baseUrl}/api/messaging/inbound`;
            const signature = (req.headers['x-signalwire-signature'] || '') as string;
            const isValid = validateRequest(signingKey, signature, webhookUrl, req.body as Record<string, string> || {});
            if (!isValid) {
                log.warn('[Inbound SMS] Invalid webhook signature â€” request rejected', 'system', { signature }, '');
                return res.status(401).send('Invalid signature');
            }
        } else {
            // Soft-fail: log warning but process the request until the key is added to System Settings
            log.warn('[Inbound SMS] signalwireSigningKey not configured â€” signature validation skipped. Add it in System Settings.', 'system', {}, '');
        }
    } catch (sigErr: any) {
        // Non-blocking â€” log but allow through in case of transient Firestore issue
        log.warn(`[Inbound SMS] Signature validation error: ${sigErr.message}`, 'system', {}, '');
    }

    const {
        From: fromRaw,
        To: toRaw,
        Body: body = '',
        NumMedia: numMedia = '0',
        SmsSid: smsSid, MessageSid: messageSidField,
    } = req.body || {};

    // Collect MMS media URLs (SignalWire sends MediaUrl0, MediaUrl1, …)
    const rawMediaUrls: string[] = [];
    const mediaCount = parseInt(numMedia, 10) || 0;
    for (let i = 0; i < mediaCount; i++) {
        const url = req.body[`MediaUrl${i}`];
        if (url) rawMediaUrls.push(url);
    }

    /**
     * Re-host each SignalWire media URL to Firebase Storage so the stored URL
     * is permanently publicly accessible (no SignalWire credentials required).
     * Falls back to the original URL on any error so the message is never lost.
     */
    async function rehostSignalWireMedia(urls: string[], churchId: string): Promise<string[]> {
        if (urls.length === 0) return [];
        const storage = getStorage();
        const bucket  = storage.bucket();
        const hosted: string[] = [];
        for (const srcUrl of urls) {
            try {
                let { buffer, contentType } = await fetchSignalWireMedia(srcUrl);

                // Guard: if SignalWire returned an HTML error page instead of media
                // (e.g. a 401 auth-redirect that wasn't caught), bail out immediately
                // so we don't store garbage in Firebase Storage.
                if (contentType.startsWith('text/html') || contentType.startsWith('text/plain')) {
                    throw new Error(`SignalWire returned "${contentType}" — likely an auth error page, not media`);
                }

                // If content-type is missing or generic, detect from magic bytes
                if (!contentType || contentType === 'application/octet-stream') {
                    const h = buffer.slice(0, 12);
                    if (h[0] === 0xFF && h[1] === 0xD8)                      contentType = 'image/jpeg';
                    else if (h.slice(0,4).toString('hex') === '89504e47')    contentType = 'image/png';
                    else if (h.slice(0,4).toString('ascii') === 'GIF8')      contentType = 'image/gif';
                    else if (h.slice(0,4).toString('ascii') === 'RIFF')      contentType = 'video/webm';
                    else if (h[0] === 0x25 && h[1] === 0x50)                 contentType = 'application/pdf';
                }

                // Derive a simple extension from the mime type (image/jpeg → .jpg)
                const extMap: Record<string, string> = {
                    'image/jpeg': '.jpg', 'image/jpg': '.jpg', 'image/png': '.png',
                    'image/gif': '.gif',  'image/webp': '.webp', 'image/heic': '.heic',
                    'video/mp4': '.mp4',  'video/quicktime': '.mov', 'audio/mpeg': '.mp3',
                    'audio/ogg': '.ogg',  'application/pdf': '.pdf',
                };
                const ext  = extMap[contentType] || '';
                const name = `sms-media/${churchId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;
                const file = bucket.file(name);
                await file.save(buffer, { metadata: { contentType }, resumable: false });
                await file.makePublic();
                hosted.push(`https://storage.googleapis.com/${bucket.name}/${name}`);
            } catch (err: any) {
                console.error(`[Inbound SMS] Failed to re-host media ${srcUrl}:`, err.message);
                hosted.push(srcUrl); // fallback: keep the original URL
            }
        }
        return hosted;
    }


    // mediaUrls is resolved below after we know the churchId (needed for storage path)
    let mediaUrls: string[] = rawMediaUrls; // will be replaced with hosted URLs inside try block


    try {
        const from = normaliseE164(fromRaw || '');
        const to = normaliseE164(toRaw || '');

        // 1. Find the church via the twilioNumbers collection (new multi-number routing)
        const numSnap = await db.collection('smsNumbers')
            .where('phoneNumber', '==', to)
            .where('smsEnabled', '==', true)
            .limit(1)
            .get();

        // Fallback: legacy single-number lookup on the church doc itself
        let churchId = '';
        let smsNumberId: string | null = null;
        let smsSettings: any = {};
        let numberData: any = null;

        if (!numSnap.empty) {
            const numDoc = numSnap.docs[0];
            numberData = numDoc.data();
            churchId = numberData.churchId;
            smsNumberId = numDoc.id;

            const churchSnap2 = await db.collection('churches').doc(churchId).get();
            smsSettings = churchSnap2.data()?.smsSettings || {};
        } else {
            // Fallback to legacy church field (for churches not yet migrated)
            const legacySnap = await db.collection('churches')
                .where('smsSettings.smsPhoneNumber', '==', to)
                .limit(1)
                .get();

            if (legacySnap.empty) {
                log.warn(`[Inbound SMS] No church found for number ${to}`, 'system', { to, from }, '');
                res.set('Content-Type', 'text/xml');
                return res.status(200).send('<Response></Response>');
            }
            const churchDoc2 = legacySnap.docs[0];
            churchId = churchDoc2.id;
            smsSettings = churchDoc2.data()?.smsSettings || {};
        }

        if (!churchId) {
            log.warn(`[Inbound SMS] Could not resolve churchId for number ${to}`, 'system', { to, from }, '');
            res.set('Content-Type', 'text/xml');
            return res.status(200).send('<Response></Response>');
        }

        // Compute resolved settings, falling back to church-level settings if not defined per-number
        const resolvedSmsAgentEnabled = numberData?.smsAgentEnabled !== undefined
            ? numberData.smsAgentEnabled
            : !!smsSettings?.smsAgentEnabled;

        const resolvedExecutiveAiAgentEnabled = numberData?.executiveAiAgentEnabled !== undefined
            ? numberData.executiveAiAgentEnabled
            : !!smsSettings?.executiveAiAgentEnabled;

        const resolvedExecutiveAiAgentKeyword = numberData?.executiveAiAgentKeyword
            ? numberData.executiveAiAgentKeyword
            : (smsSettings?.executiveAiAgentKeyword || 'AI Agent');

        const resolvedExecutiveAiAgentListId = numberData?.executiveAiAgentListId !== undefined
            ? numberData.executiveAiAgentListId
            : smsSettings?.executiveAiAgentListId;

        // 2. Handle STOP / HELP / START (carrier compliance)
        const upperBody = body.trim().toUpperCase();
        const latestBody = extractLatestMessage(body);
        // Conv ID is scoped per number so each inbox number has separate threads.
        // smsNumberId is known here because the number lookup already resolved above.
        const convIdKeyword = smsNumberId
            ? `${churchId}_${smsNumberId}_${from.replace(/\+/g, '')}`
            : `${churchId}_${from.replace(/\+/g, '')}`; // legacy fallback (no number)

        if (upperBody === 'STOP' || upperBody === 'STOPALL' || upperBody === 'UNSUBSCRIBE' || upperBody === 'CANCEL' || upperBody === 'END' || upperBody === 'QUIT') {
            // Carrier handles STOP automatically; we mirror it in Firestore for UI awareness
            const optOutId = convIdKeyword;
            await db.collection('smsOptOuts').doc(optOutId).set({
                id: optOutId,
                churchId,
                phoneNumber: from,
                optedOutAt: Date.now(),
                source: 'STOP_reply',
            });
            await db.collection('smsConversations').doc(convIdKeyword).set({ isOptedOut: true }, { merge: true });
            log.info(`[Inbound SMS] STOP received from ${from} for church ${churchId}`, 'system', { churchId, from }, churchId);
            res.set('Content-Type', 'text/xml');
            return res.status(200).send('<Response></Response>');
        }

        if (upperBody === 'START' || upperBody === 'UNSTOP' || upperBody === 'YES') {
            // Contact re-opted-in â€” clear our Firestore opt-out record so sends resume
            const optOutId = convIdKeyword;
            await db.collection('smsOptOuts').doc(optOutId).delete().catch(() => { });
            await db.collection('smsConversations').doc(convIdKeyword).set({ isOptedOut: false }, { merge: true });
            log.info(`[Inbound SMS] START/UNSTOP received from ${from} for church ${churchId} â€” opt-out cleared`, 'system', { churchId, from }, churchId);
            // Carrier sends the mandated opt-in confirmation; we return empty TwiML
            res.set('Content-Type', 'text/xml');
            return res.status(200).send('<Response></Response>');
        }

        if (upperBody === 'HELP') {
            // Carrier sends the mandated HELP response automatically; log and return empty TwiML
            log.info(`[Inbound SMS] HELP received from ${from} for church ${churchId}`, 'system', { churchId, from }, churchId);
            res.set('Content-Type', 'text/xml');
            return res.status(200).send('<Response></Response>');
        }

        // Re-host any inbound MMS attachments to Firebase Storage so the stored
        // URLs are permanently publicly accessible (no SignalWire auth required).
        if (rawMediaUrls.length > 0) {
            mediaUrls = await rehostSignalWireMedia(rawMediaUrls, churchId);
        }

        // 3. Find or create the SmsConversation
        // Include smsNumberId so the same contact texting two different church numbers
        // gets separate, isolated conversation threads — not a single merged one.
        const convId = smsNumberId
            ? `${churchId}_${smsNumberId}_${from.replace(/\+/g, '')}`
            : `${churchId}_${from.replace(/\+/g, '')}`; // legacy fallback
        const convRef = db.collection('smsConversations').doc(convId);
        const convSnap = await convRef.get();

        const personMatch = convSnap.exists && convSnap.data()?.personId
            ? null // already linked
            : await matchPersonByPhone(db, churchId, from);

        const now = Date.now();

        if (!convSnap.exists) {
            const convData: any = {
                id: convId,
                churchId,
                phoneNumber: from,
                lastMessageAt: now,
                lastMessageBody: latestBody,
                lastMessageDirection: 'inbound',
                unreadCount: 1,
                isOptedOut: false,
                smsNumberId: smsNumberId,
                twilioNumberId: smsNumberId,   // alias used by twilioSend.ts for reply routing
                inboxId: smsNumberId,   // legacy alias — keep in sync
                toPhoneNumber: to,
            };
            if (personMatch) {
                convData.personId = personMatch.personId;
                convData.personName = personMatch.personName;
                convData.personAvatar = personMatch.personAvatar;
            }
            await convRef.set(convData);
        } else {
            const updateData: any = {
                lastMessageAt: now,
                lastMessageBody: latestBody,
                lastMessageDirection: 'inbound',
                unreadCount: (convSnap.data()?.unreadCount || 0) + 1,
            };
            // Backfill number fields if any alias is missing (handles legacy conversations
            // and conversations created via the fallback church-doc path where smsNumberId
            // was never written). Always write all three aliases so frontend queries work.
            if (smsNumberId) {
                const d = convSnap.data() || {};
                if (!d.smsNumberId || !d.twilioNumberId || !d.inboxId) {
                    updateData.smsNumberId   = smsNumberId;
                    updateData.twilioNumberId = smsNumberId;   // alias for twilioSend.ts
                    updateData.inboxId        = smsNumberId;
                }
                if (!d.toPhoneNumber) updateData.toPhoneNumber = to;
            }
            if (personMatch) {
                updateData.personId = personMatch.personId;
                updateData.personName = personMatch.personName;
                updateData.personAvatar = personMatch.personAvatar;
            }
            await convRef.update(updateData);
        }


        // 4. Save the inbound message
        const messageId = `msg_${now}_${Math.random().toString(36).slice(2, 8)}`;
        await db.collection('smsConversations').doc(convId)
            .collection('messages').doc(messageId).set({
                id: messageId,
                conversationId: convId,
                churchId,
                direction: 'inbound',
                body: latestBody,
                mediaUrls: mediaUrls.length > 0 ? mediaUrls : [],
                status: 'received',
                messageSid: smsSid || messageSidField || null,
                createdAt: now,
            });

        // 4-0. Record inbound SMS usage
        const segmentsStr = req.body.NumSegments || '1';
        const segments = parseInt(segmentsStr, 10) || 1;
        const isMms = mediaUrls.length > 0;
        const costUsd = isMms ? 0.02 : segments * 0.0079; // Defaulting to outbound rates or generic inbound rate
        const usageId = `usage_inbound_${now}_${Math.random().toString(36).slice(2, 8)}`;
        const d = new Date();
        const currentMonth = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
        
        await db.collection('smsUsageRecords').doc(usageId).set({
            id: usageId,
            churchId,
            conversationId: convId,
            toPhone: to,
            fromPhone: from,
            segments,
            isMms,
            costUsd,
            direction: 'inbound',
            messageSid: smsSid || messageSidField || null,
            createdAt: now,
        });

        await db.collection('churches').doc(churchId).set({
            smsUsage: {
                [currentMonth]: FieldValue.increment(segments)
            }
        }, { merge: true }).catch((e: any) => log.warn(`Failed to increment church inbound smsUsage: ${e.message}`, 'system', { churchId }, churchId));

        // 4-A. Push notification — fire-and-forget, must not block the TwiML response
        const senderName = personMatch?.personName || convSnap.data()?.personName || from;
        const preview = body.length > 80 ? body.slice(0, 77) + '...' : body;
        sendPushToChurch({
            churchId,
            numberId: smsNumberId,
            title: `New SMS from ${senderName}`,
            body: preview,
            url: `/mobile/sms?tab=inbox&numberId=${smsNumberId || ''}&conversationId=${convId}`,
            tag: `sms-${convId}`,
        }).catch(() => { });

        // ─── Event Registration Conversational Flow Interceptor ───────────────────
        const regProgressId = smsNumberId
            ? `${churchId}_${smsNumberId}_${from.replace(/\+/g, '')}`
            : `${churchId}_${from.replace(/\+/g, '')}`;
        const regProgressSnap = await db.collection('smsRegistrationProgress').doc(regProgressId).get();
        if (regProgressSnap.exists) {
            const regProgress = regProgressSnap.data() as any;
            if (regProgress.status !== 'completed' && regProgress.status !== 'declined') {
                const twiml = await processRegistrationFlowReply(db, log, churchId, regProgress, latestBody, convId, smsNumberId, to);
                res.set('Content-Type', 'text/xml');
                return res.status(200).send(twiml);
            }
        }

        // 4-B. Executive AI Auto-Responder
        const bodyTrimmed = latestBody.trim();
        const aiAgentPrefix = resolvedExecutiveAiAgentKeyword.toLowerCase();
        const isAiAgentTrigger = bodyTrimmed.toLowerCase().startsWith(aiAgentPrefix);

        const actualPersonId = personMatch?.personId || convSnap.data()?.personId;

        if (resolvedExecutiveAiAgentEnabled && resolvedExecutiveAiAgentListId && isAiAgentTrigger) {
            // Strip the trigger prefix
            let queryBody = bodyTrimmed.substring(aiAgentPrefix.length).trim();
            // If the query body starts with a colon, comma, or dash, strip it
            if (/^[::,\-—–\s]+/.test(queryBody)) {
                queryBody = queryBody.replace(/^[::,\-—–\s]+/, '').trim();
            }

            // Non-blocking
            processExecutiveAiQuery(
                db, log, churchId, from, queryBody,
                resolvedExecutiveAiAgentListId, smsNumberId
            ).catch(() => { });
        }

        // 4-B. SMS AI Agent —â€  fire-and-forget suggestion generation
        //      Runs only when smsAgentEnabled is true and the body is not a carrier keyword.
        if (resolvedSmsAgentEnabled === true) {
            const churchSnap = await db.collection('churches').doc(churchId).get();
            const churchName = churchSnap.data()?.name || 'Church';
            // Non-blocking: do not await so TwiML response is never delayed
            generateAiSuggestion(db, log, churchId, convId, messageId, latestBody, churchName)
                .catch(() => { /* already logged inside */ });
        }

        // 5. Check for "Who Is This" contact card request
        const isWhoIsThis = /^WHO IS THIS\??$/i.test(latestBody.trim());
        let whoIsThisReplyMessage: string | null = null;
        let whoIsThisMediaUrl: string | null = null;

        if (isWhoIsThis) {
            try {
                const churchSnap = await db.collection('churches').doc(churchId).get();
                const churchName = churchSnap.data()?.name || 'Church';
                let lineName = 'Main Line';

                if (smsNumberId) {
                    const numSnap = await db.collection('smsNumbers').doc(smsNumberId).get();
                    if (numSnap.exists) lineName = numSnap.data()?.friendlyLabel || 'Main Line';
                }

                whoIsThisReplyMessage = `This is the ${lineName} line for ${churchName}. Save our contact card!`;
                const baseUrl = await getSmsWebhookBaseUrl();
                if (smsNumberId) {
                    whoIsThisMediaUrl = `${baseUrl}/api/messaging/vcard/${smsNumberId}`;
                }

                // Save outbound message to Firestore
                const replyId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                await db.collection('smsConversations').doc(convId)
                    .collection('messages').doc(replyId).set({
                        id: replyId,
                        conversationId: convId,
                        churchId,
                        direction: 'outbound',
                        body: whoIsThisReplyMessage,
                        mediaUrls: whoIsThisMediaUrl ? [whoIsThisMediaUrl] : [],
                        status: 'sent',
                        sentBy: null,
                        sentByName: 'Auto-Reply (Contact Card)',
                        createdAt: Date.now(),
                    });

                log.info(`[Inbound SMS] "Who Is This" matched from ${from} for church ${churchId}`, 'system', { churchId }, churchId);
            } catch (e: any) {
                log.warn(`[Inbound SMS] Failed to process "Who Is This": ${e.message}`, 'system', { churchId, convId }, churchId);
            }
        }

        // 6. Check for keyword matches
        const kw = await matchKeyword(db, churchId, latestBody, smsNumberId);
        let keywordReplyMessage: string | null = null;

        if (kw) {
            // Build the reply message
            let baseReply = kw.replyMessage || '';
            const actionType = kw.actionType || 'static';

            if (actionType === 'event_registration' && kw.pcoSignupId) {
                try {
                    const { getPcoSignupDetails } = await import('./pcoRegistrationsService.js');
                    const signupDetails = await getPcoSignupDetails(churchId, kw.pcoSignupId);
                    
                    if (signupDetails.isPaid) {
                        const eventLink = signupDetails.publicUrl || 'https://churchcenter.com';
                        baseReply = baseReply ? `${baseReply}\n\nRegister & pay here: ${eventLink}` : `Register & pay here: ${eventLink}`;
                    } else {
                        // Free event: Conversational SMS flow
                        const regProgressId = smsNumberId
                            ? `${churchId}_${smsNumberId}_${from.replace(/\+/g, '')}`
                            : `${churchId}_${from.replace(/\+/g, '')}`;
                        
                        const initialProgress = {
                            id: regProgressId,
                            churchId,
                            smsNumberId,
                            phoneNumber: from,
                            personId: personMatch?.personId || convSnap.data()?.personId || null,
                            personName: personMatch?.personName || convSnap.data()?.personName || 'Guest',
                            signupId: kw.pcoSignupId,
                            eventName: signupDetails.name,
                            status: 'invited',
                            currentQuestionIndex: -1,
                            answers: {},
                            createdAt: Date.now(),
                            updatedAt: Date.now()
                        };
                        
                        await db.collection('smsRegistrationProgress').doc(regProgressId).set(initialProgress);
                        
                        // Increment keyword match count
                        await db.collection('smsKeywords').doc(kw.id).update({
                            matchCount: (kw.matchCount || 0) + 1,
                        }).catch(() => {});
                        
                        const twiml = await processRegistrationFlowReply(db, log, churchId, initialProgress, 'YES', convId, smsNumberId, to);
                        res.set('Content-Type', 'text/xml');
                        return res.status(200).send(twiml);
                    }
                } catch (e: any) {
                    log.error(`Failed to handle keyword event registration: ${e.message}`, 'system', { keyword: kw.keyword }, churchId);
                    baseReply = "Sorry, we encountered a technical issue setting up your registration. Please try again later.";
                }
            } else if (actionType === 'registration_events' || actionType === 'small_groups') {
                try {
                    const churchSnap = await db.collection('churches').doc(churchId).get();
                    const subdomain = churchSnap.data()?.subdomain;
                    if (subdomain) {
                        const path = actionType === 'registration_events' ? 'registrations' : 'groups';
                        const link = `https://${subdomain}.churchcenter.com/${path}`;
                        baseReply = baseReply ? `${baseReply}\n\n${link}` : link;
                    } else {
                        const msg = '(Church Center link unavailable)';
                        baseReply = baseReply ? `${baseReply}\n\n${msg}` : msg;
                    }
                } catch (e) {
                    // Ignore errors
                }
            } else if (actionType === 'giving_ytd') {
                if (personMatch?.personId) {
                    try {
                        const personSnap = await db.collection('people').doc(personMatch.personId).get();
                        const ytd = personSnap.data()?.givingStats?.ytd || 0;
                        const formattedYtd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(ytd);
                        const msg = `Hi ${personMatch.personName?.split(' ')[0] || 'there'}, your year-to-date giving is ${formattedYtd}. Thank you for your generosity!`;
                        baseReply = baseReply ? `${baseReply}\n\n${msg}` : msg;
                    } catch (e) {
                        const msg = '(Unable to retrieve giving information)';
                        baseReply = baseReply ? `${baseReply}\n\n${msg}` : msg;
                    }
                } else {
                    const msg = `We couldn't find a donor profile linked to this phone number.`;
                    baseReply = baseReply ? `${baseReply}\n\n${msg}` : msg;
                }
            }

            // Append poll link if configured
            if ((kw as any).linkedPollId) {
                // Determine the public base URL from system settings (or fall back to host header)
                let pollBase = '';
                try {
                    const sysSnap = await db.collection('system').doc('settings').get();
                    const sysData = sysSnap.data() || {};
                    pollBase = sysData.appBaseUrl || sysData.apiBaseUrl || '';
                    // Strip /api or trailing paths —â€ we want the frontend origin
                    pollBase = pollBase.replace(/\/api.*$/, '').replace(/\/$/, '');
                } catch { /* ignore */ }
                if (!pollBase) pollBase = 'https://pastoralcare.barnabassoftware.com';
                const pollLink = `${pollBase}/poll/${(kw as any).linkedPollId}`;
                baseReply = baseReply ? `${baseReply}\n${pollLink}` : pollLink;
            }
            keywordReplyMessage = baseReply;

            // Increment keyword match count
            await db.collection('smsKeywords').doc(kw.id).update({
                matchCount: (kw.matchCount || 0) + 1,
            });

            // Auto-tag the conversation if the keyword has tag IDs configured
            if (Array.isArray(kw.autoTagIds) && kw.autoTagIds.length > 0) {
                try {
                    await convRef.update({
                        tags: FieldValue.arrayUnion(...kw.autoTagIds),
                    });
                    log.info(`[Inbound SMS] Auto-tagged conversation ${convId} with tags: ${kw.autoTagIds.join(', ')}`, 'system', { churchId, keyword: kw.keyword, autoTagIds: kw.autoTagIds }, churchId);
                } catch (tagErr: any) {
                    log.warn(`[Inbound SMS] Failed to auto-tag conversation: ${tagErr.message}`, 'system', { churchId, convId }, churchId);
                }
            }

            // ─── Pastoral Care: keyword subscription tracking ────────────────
            // Resolve person ID from the fresh match or from an already-linked conversation.
            const resolvedPersonId: string | null =
                personMatch?.personId || convSnap.data()?.personId || null;

            if (resolvedPersonId) {
                // 1. Upsert Firestore subscription record (idempotent — ignore if already exists)
                const subId = `${churchId}_${resolvedPersonId}_${kw.id}`;
                const subRef = db.collection('smsKeywordSubscriptions').doc(subId);
                const subSnap = await subRef.get().catch(() => null);
                if (!subSnap?.exists) {
                    await subRef.set({
                        id: subId,
                        churchId,
                        personId: resolvedPersonId,
                        personName: personMatch?.personName || convSnap.data()?.personName || null,
                        phoneNumber: from,
                        keyword: kw.keyword,
                        keywordId: kw.id,
                        subscribedAt: Date.now(),
                        source: 'sms_inbound',
                    }).catch((e: any) => {
                        log.warn(`[Inbound SMS] Failed to save keyword subscription: ${e.message}`, 'system', { churchId, subId }, churchId);
                    });

                    // 2. Update the PCO "Pastoral Care" tab checkbox (fire-and-forget)
                    updatePcoSubscriptionField({
                        db, log, churchId,
                        personId: resolvedPersonId,
                        keyword: kw.keyword,
                    }).catch(() => { /* already logged inside */ });
                }
                // else: already subscribed — Q2 decision: ignore duplicates

                // 3. Add to PCO list if configured
                if (kw.addToListId) {
                    addPersonToPcoList(db, log, churchId, resolvedPersonId, kw.addToListId)
                        .catch(() => { /* logged inside */ });
                }
            } else {
                // Person not yet in local `people` collection — queue for backfill after next sync
                const pendingId = `${churchId}_${from.replace(/\+/g, '')}_${kw.id}`;
                await db.collection('pendingSmsSubscriptions').doc(pendingId).set({
                    id: pendingId,
                    churchId,
                    phoneNumber: from,
                    keyword: kw.keyword,
                    keywordId: kw.id,
                    matchedAt: Date.now(),
                }, { merge: true }).catch((e: any) => {
                    log.warn(`[Inbound SMS] Failed to save pending subscription: ${e.message}`, 'system', { churchId, pendingId }, churchId);
                });
                log.info(`[Inbound SMS] Keyword "${kw.keyword}" from unmatched number ${from} — queued in pendingSmsSubscriptions`, 'system', { churchId, keyword: kw.keyword }, churchId);
            }
            // ────────────────────────────────────────────────────────────────

            // Save the keyword auto-reply as an outbound message
            const replyId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await db.collection('smsConversations').doc(convId)
                .collection('messages').doc(replyId).set({
                    id: replyId,
                    conversationId: convId,
                    churchId,
                    direction: 'outbound',
                    body: keywordReplyMessage || kw.replyMessage,
                    mediaUrls: [],
                    status: 'sent',
                    sentBy: null,
                    sentByName: 'Auto-Reply',
                    createdAt: Date.now(),
                });

            log.info(`[Inbound SMS] Keyword "${kw.keyword}" matched from ${from} for church ${churchId}`, 'system', { churchId, keyword: kw.keyword }, churchId);
        }

        // 5b. Prayer Request Detection (NLP)
        //     Runs only when:
        //       a) prayerDetectionEnabled is true on the church's smsSettings
        //       b) No keyword matched (keyword pipeline takes priority)
        //       c) The message was not a STOP/HELP/START (already handled above)
        let prayerClarifyingReplyMessage: string | null = null;

        try {
            const prayerDetectionEnabled = !!(smsSettings as any)?.prayerDetectionEnabled;

            if (prayerDetectionEnabled && !kw && !isWhoIsThis) {
                const convData = convSnap.exists ? convSnap.data() : null;
                const prayerFollowUpState = convData?.prayerFollowUpState ?? null;

                if (prayerFollowUpState === 'awaiting_prayer_detail') {
                    // ─── Two-step flow: contact just sent their prayer detail ───
                    // Tag "Needs Prayer" immediately and clear the follow-up state.
                    const prayerTagId = await getOrCreatePrayerTag(db, churchId, log);
                    await convRef.update({
                        tags: FieldValue.arrayUnion(prayerTagId),
                        prayerFollowUpState: null,
                    });
                    log.info(`[Prayer Detection] Tagged conversation ${convId} "Needs Prayer" (follow-up detail received)`, 'system', { churchId, convId }, churchId);
                } else {
                    // ─── Fresh message —â€  run NLP scanner ───
                    const prayerType = detectPrayerRequest(latestBody);

                    if (prayerType === 'generic') {
                        // Send clarifying reply and set follow-up state
                        const clarifyingReply = (smsSettings as any)?.prayerClarifyingReply?.trim()
                            || 'What would you like prayer for?';

                        prayerClarifyingReplyMessage = clarifyingReply;

                        // Persist the clarifying reply as an outbound message
                        const clarifyId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                        await db.collection('smsConversations').doc(convId)
                            .collection('messages').doc(clarifyId).set({
                                id: clarifyId,
                                conversationId: convId,
                                churchId,
                                direction: 'outbound',
                                body: clarifyingReply,
                                mediaUrls: [],
                                status: 'sent',
                                sentBy: null,
                                sentByName: 'Auto-Reply (Prayer)',
                                createdAt: Date.now(),
                            });

                        // Mark conversation as awaiting prayer detail
                        await convRef.update({ prayerFollowUpState: 'awaiting_prayer_detail' });

                        log.info(`[Prayer Detection] Generic prayer ask from ${from} —â€  sent clarifying reply for church ${churchId}`, 'system', { churchId, convId }, churchId);

                    } else if (prayerType === 'specific') {
                        // Specific request — tag immediately, no clarifying reply needed
                        const prayerTagId = await getOrCreatePrayerTag(db, churchId, log);
                        await convRef.update({
                            tags: FieldValue.arrayUnion(prayerTagId),
                        });
                        log.info(`[Prayer Detection] Specific prayer request from ${from} —â€  tagged "Needs Prayer" for church ${churchId}`, 'system', { churchId, convId }, churchId);
                    }
                }
            }
        } catch (prayerErr: any) {
            // Non-fatal —â€ log and continue so the inbound message is always saved
            log.warn(`[Prayer Detection] Error during prayer detection: ${prayerErr.message}`, 'system', { churchId, convId }, churchId);
        }
        // 5c. Custom Tag Auto-Detection (NLP phrase matching)
        //     Each SmsTag may have detectionEnabled=true and detectionPhrases.
        //     Runs only when no keyword matched. Supports immediate tagging or a
        //     two-step clarifying-reply flow via tagFollowUpState on the conversation.
        const customTagReplies: string[] = [];
        if (!kw && !isWhoIsThis) {
            try {
                const freshConvData = convSnap.exists ? convSnap.data() : {} as any;
                const existingTags: string[] = freshConvData?.tags || [];
                const tagFollowUpState: string | null = freshConvData?.tagFollowUpState ?? null;

                const detectionTagsSnap = await db.collection('smsTags')
                    .where('churchId', '==', churchId)
                    .where('detectionEnabled', '==', true)
                    .get();

                if (!detectionTagsSnap.empty) {
                    const lowerBody = latestBody.toLowerCase();

                    for (const tagDoc of detectionTagsSnap.docs) {
                        const tag = tagDoc.data();
                        const tagId = tagDoc.id;

                        // Two-step follow-up: this tag is waiting for the next reply
                        if (tagFollowUpState === `awaiting_tag_${tagId}`) {
                            await convRef.update({
                                tags: FieldValue.arrayUnion(tagId),
                                tagFollowUpState: null,
                            });
                            log.info(`[Tag Detection] Follow-up tag "${tag.name}" applied to conv ${convId}`, 'system', { churchId, convId, tagId }, churchId);
                            if (tag.autoReplyMessage?.trim()) customTagReplies.push(tag.autoReplyMessage.trim());
                            break;
                        }

                        if (existingTags.includes(tagId)) continue;

                        // Scope check: if detectionNumberIds is non-empty, only fire on those lines
                        const scopedNumbers: string[] = tag.detectionNumberIds || [];
                        if (scopedNumbers.length > 0 && smsNumberId && !scopedNumbers.includes(smsNumberId)) continue;

                        const phrases: string[] = (tag.detectionPhrases || '')
                            .split(',').map((p: string) => p.trim().toLowerCase()).filter(Boolean);
                        if (phrases.length === 0) continue;

                        const matched = phrases.some((phrase: string) => lowerBody.includes(phrase));
                        if (!matched) continue;

                        if (tag.clarifyingReply?.trim()) {
                            // Send clarifying reply, defer tag to next message
                            const clarifyId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                            await db.collection('smsConversations').doc(convId)
                                .collection('messages').doc(clarifyId).set({
                                    id: clarifyId, conversationId: convId, churchId,
                                    direction: 'outbound', body: tag.clarifyingReply.trim(),
                                    mediaUrls: [], status: 'sent', sentBy: null,
                                    sentByName: `Auto-Reply (${tag.name})`, createdAt: Date.now(),
                                });
                            await convRef.update({ tagFollowUpState: `awaiting_tag_${tagId}` });
                            customTagReplies.push(tag.clarifyingReply.trim());
                            log.info(`[Tag Detection] Phrase matched "${tag.name}" — clarifying reply sent for conv ${convId}`, 'system', { churchId, convId, tagId }, churchId);
                        } else {
                            await convRef.update({ tags: FieldValue.arrayUnion(tagId) });
                            log.info(`[Tag Detection] Phrase matched — tagged conv ${convId} with "${tag.name}"`, 'system', { churchId, convId, tagId }, churchId);
                            if (tag.autoReplyMessage?.trim()) customTagReplies.push(tag.autoReplyMessage.trim());
                        }
                        break; // only one tag detection match per message
                    }
                }
            } catch (tagDetectErr: any) {
                log.warn(`[Tag Detection] Error: ${tagDetectErr.message}`, 'system', { churchId, convId }, churchId);
            }
        }


        // 6. Check tag auto-replies: look up any tags that were applied (via keyword auto-tag or
        //    already on the conversation) and fire their autoReplyMessage if set.
        //    We only fire tag auto-replies for tags just applied by this keyword match,
        //    so we don't spam repeat messages on every inbound message.
        const tagAutoReplies: string[] = [];
        if (kw && Array.isArray(kw.autoTagIds) && kw.autoTagIds.length > 0) {
            try {
                for (const tagId of kw.autoTagIds) {
                    const tagDoc = await db.collection('smsTags').doc(tagId).get();
                    if (tagDoc.exists) {
                        const tagData = tagDoc.data();
                        if (tagData?.autoReplyMessage && tagData.autoReplyMessage.trim()) {
                            tagAutoReplies.push(tagData.autoReplyMessage.trim());
                        }
                    }
                }
            } catch (tagReplyErr: any) {
                log.warn(`[Inbound SMS] Failed to check tag auto-replies: ${tagReplyErr.message}`, 'system', { churchId, convId }, churchId);
            }
        }

        // Save tag auto-reply messages to Firestore and include in TwiML response
        for (const tagReplyBody of tagAutoReplies) {
            const tagReplyId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
            await db.collection('smsConversations').doc(convId)
                .collection('messages').doc(tagReplyId).set({
                    id: tagReplyId,

                    conversationId: convId,
                    churchId,
                    direction: 'outbound',
                    body: tagReplyBody,
                    mediaUrls: [],
                    status: 'sent',
                    sentBy: null,
                    sentByName: 'Auto-Reply (Tag)',
                    createdAt: Date.now(),
                });
        }

        // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ 5c. SMS Poll Text-to-Vote Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
        // If no keyword matched and body is a single digit 1—â€œ9, check if this
        // church has an active poll with smsVotingEnabled. If so, record the vote.
        let pollVoteReplyMessage: string | null = null;

        try {
            const trimmedBody = latestBody.trim();
            const voteNumber = /^[1-9]$/.test(trimmedBody) ? parseInt(trimmedBody, 10) : null;

            if (!isWhoIsThis && !kw && !prayerClarifyingReplyMessage && voteNumber !== null) {
                // Find any active poll for this church with smsVotingEnabled
                const pollSnap = await db.collection('polls')
                    .where('churchId', '==', churchId)
                    .where('status', '==', 'active')
                    .where('smsVotingEnabled', '==', true)
                    .limit(1)
                    .get();

                if (!pollSnap.empty) {
                    const pollDoc = pollSnap.docs[0];
                    const poll = pollDoc.data();
                    const questions: any[] = poll.questions || [];

                    // Find the currently active question (choice-based)
                    const activeIdx = poll.activeQuestionIndex ?? 0;
                    const activeQuestion = questions[activeIdx];

                    if (activeQuestion && (activeQuestion.type === 'single_choice' || activeQuestion.type === 'multiple_choice' || activeQuestion.type === 'yes_no')) {
                        const opts = activeQuestion.type === 'yes_no' ? ['Yes', 'No'] : (activeQuestion.options || []);
                        const chosenOption = opts[voteNumber - 1];

                        if (chosenOption) {
                            // Record the response
                            const responseId = `resp_sms_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
                            const answerMap: Record<string, any> = {};
                            answerMap[activeQuestion.id] = chosenOption;
                            await db.collection('poll_responses').doc(responseId).set({
                                id: responseId,
                                pollId: pollDoc.id,
                                churchId,
                                respondentName: null,
                                respondentEmail: null,
                                respondentPhone: from,
                                answers: answerMap,
                                submittedAt: Date.now(),
                                sessionToken: `sms_${from}`,
                                source: 'sms',
                            });
                            // Increment total responses
                            await db.collection('polls').doc(pollDoc.id).update({
                                totalResponses: (poll.totalResponses || 0) + 1,
                                updatedAt: Date.now(),
                            });
                            pollVoteReplyMessage = `✅ Your vote for "${chosenOption}" has been recorded! Thank you.`;
                            log.info(`[SMS Poll] Vote recorded: poll=${pollDoc.id} option=${chosenOption} from=${from}`, 'system', { churchId, pollId: pollDoc.id }, churchId);
                        } else {
                            // Out of range
                            pollVoteReplyMessage = `Please reply with a number between 1 and ${opts.length} to vote.`;
                        }
                    }
                }
            }
        } catch (pollVoteErr: any) {
            log.warn(`[SMS Poll] Error during poll vote processing: ${pollVoteErr.message}`, 'system', { churchId }, churchId);
        }

        // Build TwiML â€” keyword reply first, then tag auto-replies, then prayer clarifying reply, then poll vote reply
        // (prayer clarifying reply is mutually exclusive with keyword pipeline)

        const allReplies: { body: string, mediaUrl?: string }[] = [];
        if (whoIsThisReplyMessage) allReplies.push({ body: whoIsThisReplyMessage, mediaUrl: whoIsThisMediaUrl || undefined });
        if (keywordReplyMessage) allReplies.push({ body: keywordReplyMessage });
        for (const r of tagAutoReplies) allReplies.push({ body: r });
        for (const r of customTagReplies) allReplies.push({ body: r });
        if (prayerClarifyingReplyMessage) allReplies.push({ body: prayerClarifyingReplyMessage });
        if (pollVoteReplyMessage) allReplies.push({ body: pollVoteReplyMessage });

        let twiml = '<Response></Response>';
        if (allReplies.length > 0) {
            const msgXml = allReplies
                .map(r => {
                    const safeBody = r.body.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                    const mediaTag = r.mediaUrl ? `<Media>${r.mediaUrl.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')}</Media>` : '';
                    return `<Message><Body>${safeBody}</Body>${mediaTag}</Message>`;
                })
                .join('');
            twiml = `<Response>${msgXml}</Response>`;
        }



        res.set('Content-Type', 'text/xml');
        return res.status(200).send(twiml);
    } catch (e: any) {
        log.error(`[Inbound SMS] Error processing message: ${e.message}`, 'system', { from: fromRaw, to: toRaw }, '');
        // Always return 200 to prevent provider retries for logic errors
        res.set('Content-Type', 'text/xml');
        return res.status(200).send('<Response></Response>');
    }
};

/**
 * Event Registration conversational SMS state machine.
 */
export async function processRegistrationFlowReply(
    db: any,
    log: any,
    churchId: string,
    progress: any,
    replyBody: string,
    convId: string,
    smsNumberId: string | null,
    toPhone: string
): Promise<string> {
    const fromPhone = progress.phoneNumber;
    const regProgressId = progress.id;
    let nextStatus = progress.status;
    let currentQuestionIndex = progress.currentQuestionIndex ?? -1;
    const answers = { ...(progress.answers || {}) };
    let replyText = '';

    const saveOutboundMessage = async (text: string) => {
        const replyId = `msg_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await db.collection('smsConversations').doc(convId)
            .collection('messages').doc(replyId).set({
                id: replyId,
                conversationId: convId,
                churchId,
                direction: 'outbound',
                body: text,
                mediaUrls: [],
                status: 'sent',
                sentBy: null,
                sentByName: 'Auto-Reply (Event Registration)',
                createdAt: Date.now(),
            });
        
        await db.collection('smsConversations').doc(convId).update({
            lastMessageAt: Date.now(),
            lastMessageBody: text,
            lastMessageDirection: 'outbound',
        }).catch(() => {});
    };

    const trimReply = replyBody.trim();
    const upperReply = trimReply.toUpperCase();

    if (progress.status === 'invited') {
        const isYes = ['YES', 'YEAH', 'SURE', 'OK', 'Y', 'SIGN UP', 'SIGNUP'].some(k => upperReply.startsWith(k));
        const isNo = ['NO', 'NOPE', 'N', 'DECLINE'].some(k => upperReply.startsWith(k));

        if (isYes) {
            if (!progress.personId) {
                nextStatus = 'gathering_profile';
                currentQuestionIndex = 0;
                replyText = "Great! Let's get your profile set up first. What is your First Name?";
                
                await db.collection('smsRegistrationProgress').doc(regProgressId).update({
                    status: nextStatus,
                    currentQuestionIndex,
                    updatedAt: Date.now()
                });
            } else {
                try {
                    const questions = await getPcoSignupQuestions(churchId, progress.signupId);
                    
                    if (questions.length === 0) {
                        nextStatus = 'completed';
                        await registerPersonForEvent(churchId, progress.personId, progress.signupId, {});
                        replyText = `Thank you! You have been successfully registered for ${progress.eventName || 'the event'}.`;
                        
                        await db.collection('smsRegistrationProgress').doc(regProgressId).update({
                            status: nextStatus,
                            updatedAt: Date.now()
                        });
                    } else {
                        nextStatus = 'in_progress';
                        currentQuestionIndex = 0;
                        const firstQ = questions[0];
                        
                        let qText = firstQ.label;
                        if (firstQ.options && firstQ.options.length > 0) {
                            qText += '\n' + firstQ.options.map((opt: string, idx: number) => `${idx + 1}. ${opt}`).join('\n');
                        }
                        
                        replyText = `Great! Let's answer a few questions. \n\n${qText}`;
                        
                        await db.collection('smsRegistrationProgress').doc(regProgressId).update({
                            status: nextStatus,
                            currentQuestionIndex,
                            questions,
                            updatedAt: Date.now()
                        });
                    }
                } catch (e: any) {
                    log.error(`Failed to fetch questions for signup ${progress.signupId}: ${e.message}`, 'system', {}, churchId);
                    replyText = "Sorry, we encountered an error setting up your registration. Please try again later or register online.";
                    nextStatus = 'declined';
                    await db.collection('smsRegistrationProgress').doc(regProgressId).update({
                        status: nextStatus,
                        updatedAt: Date.now()
                    });
                }
            }
        } else if (isNo) {
            nextStatus = 'declined';
            replyText = "No problem! We have canceled your registration request.";
            await db.collection('smsRegistrationProgress').doc(regProgressId).update({
                status: nextStatus,
                updatedAt: Date.now()
            });
        } else {
            replyText = `Would you like to register for ${progress.eventName || 'the event'}? Reply YES to sign up, or NO to decline.`;
        }
    } else if (progress.status === 'gathering_profile') {
        let nextQuestionIndex = currentQuestionIndex;
        let tempFirstName = progress.personFirstName || null;
        let tempLastName = progress.personLastName || null;
        let tempEmail = progress.personEmail || null;

        if (currentQuestionIndex === 0) {
            if (!trimReply) {
                replyText = "Please reply with a valid First Name.";
            } else {
                tempFirstName = trimReply;
                nextQuestionIndex = 1;
                replyText = "Got it. What is your Last Name?";
            }
        } else if (currentQuestionIndex === 1) {
            if (!trimReply) {
                replyText = "Please reply with a valid Last Name.";
            } else {
                tempLastName = trimReply;
                nextQuestionIndex = 2;
                replyText = "Thank you. What is your Email Address? (Reply with email, or type SKIP if you don't have one)";
            }
        } else if (currentQuestionIndex === 2) {
            const isSkip = upperReply === 'SKIP';
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            
            if (!isSkip && !emailRegex.test(trimReply)) {
                replyText = "That doesn't look like a valid email. Please reply with a valid email address or reply SKIP.";
            } else {
                tempEmail = isSkip ? null : trimReply;
                
                try {
                    const newPersonId = await createPcoPerson(churchId, tempFirstName, tempLastName, tempEmail, fromPhone);
                    const questions = await getPcoSignupQuestions(churchId, progress.signupId);
                    
                    if (questions.length === 0) {
                        nextStatus = 'completed';
                        await registerPersonForEvent(churchId, newPersonId, progress.signupId, {});
                        replyText = `Thank you, ${tempFirstName}! You have been registered successfully for ${progress.eventName || 'the event'}.`;
                    } else {
                        nextStatus = 'in_progress';
                        nextQuestionIndex = 0;
                        const firstQ = questions[0];
                        let qText = firstQ.label;
                        if (firstQ.options && firstQ.options.length > 0) {
                            qText += '\n' + firstQ.options.map((opt: string, idx: number) => `${idx + 1}. ${opt}`).join('\n');
                        }
                        
                        replyText = `Welcome, ${tempFirstName}! Let's answer a few questions. \n\n${qText}`;
                    }

                    await db.collection('smsRegistrationProgress').doc(regProgressId).update({
                        status: nextStatus,
                        personId: newPersonId,
                        personName: `${tempFirstName} ${tempLastName}`,
                        personFirstName: tempFirstName,
                        personLastName: tempLastName,
                        personEmail: tempEmail,
                        currentQuestionIndex: nextQuestionIndex,
                        questions: nextStatus === 'in_progress' ? questions : [],
                        updatedAt: Date.now()
                    });
                } catch (e: any) {
                    log.error(`Failed to create person or fetch questions in registration: ${e.message}`, 'system', {}, churchId);
                    replyText = "Sorry, we had an issue setting up your profile in our system. Please try again later or register online.";
                    nextStatus = 'declined';
                    await db.collection('smsRegistrationProgress').doc(regProgressId).update({
                        status: nextStatus,
                        updatedAt: Date.now()
                    });
                }
                
                await saveOutboundMessage(replyText);
                const safeBody = replyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
                return `<Response><Message><Body>${safeBody}</Body></Message></Response>`;
            }
        }

        await db.collection('smsRegistrationProgress').doc(regProgressId).update({
            personFirstName: tempFirstName,
            personLastName: tempLastName,
            personEmail: tempEmail,
            currentQuestionIndex: nextQuestionIndex,
            updatedAt: Date.now()
        });

    } else if (progress.status === 'in_progress') {
        const questions = progress.questions || [];
        const currentQ = questions[currentQuestionIndex];

        if (currentQ) {
            let isValid = true;
            let finalValue = trimReply;

            if (currentQ.options && currentQ.options.length > 0) {
                const matchIndex = /^[1-9][0-9]*$/.test(trimReply) ? parseInt(trimReply, 10) - 1 : -1;
                if (matchIndex >= 0 && matchIndex < currentQ.options.length) {
                    finalValue = currentQ.options[matchIndex];
                } else {
                    const matchedOption = currentQ.options.find((opt: string) => opt.toLowerCase() === trimReply.toLowerCase());
                    if (matchedOption) {
                        finalValue = matchedOption;
                    } else {
                        isValid = false;
                    }
                }
            } else if (currentQ.kind === 'number') {
                const isNumber = !isNaN(Number(trimReply));
                if (!isNumber) {
                    isValid = false;
                }
            }

            if (!isValid) {
                let optionsMsg = '';
                if (currentQ.options && currentQ.options.length > 0) {
                    optionsMsg = '\n' + currentQ.options.map((opt: string, idx: number) => `${idx + 1}. ${opt}`).join('\n');
                }
                replyText = `Sorry, that's not a valid response. Please reply to: \n${currentQ.label}${optionsMsg}`;
            } else {
                answers[currentQ.id] = finalValue;
                const nextQuestionIndex = currentQuestionIndex + 1;

                if (nextQuestionIndex >= questions.length) {
                    nextStatus = 'completed';
                    try {
                        await registerPersonForEvent(churchId, progress.personId, progress.signupId, answers);
                        replyText = `Thank you! Your registration for ${progress.eventName || 'the event'} is now complete!`;
                    } catch (e: any) {
                        log.error(`Failed to register person ${progress.personId} on signup ${progress.signupId}: ${e.message}`, 'system', {}, churchId);
                        replyText = "Sorry, we encountered a technical issue submitting your registration to Planning Center. Please contact the church office to confirm.";
                    }
                } else {
                    const nextQ = questions[nextQuestionIndex];
                    let qText = nextQ.label;
                    if (nextQ.options && nextQ.options.length > 0) {
                        qText += '\n' + nextQ.options.map((opt: string, idx: number) => `${idx + 1}. ${opt}`).join('\n');
                    }
                    replyText = qText;
                }

                await db.collection('smsRegistrationProgress').doc(regProgressId).update({
                    status: nextStatus,
                    currentQuestionIndex: nextQuestionIndex,
                    answers,
                    updatedAt: Date.now()
                });
            }
        } else {
            replyText = "Oops! Something went wrong. We couldn't find your registration questionnaire.";
            nextStatus = 'declined';
            await db.collection('smsRegistrationProgress').doc(regProgressId).update({
                status: nextStatus,
                updatedAt: Date.now()
            });
        }
    }

    await saveOutboundMessage(replyText);

    const safeBody = replyText.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    return `<Response><Message><Body>${safeBody}</Body></Message></Response>`;
}

