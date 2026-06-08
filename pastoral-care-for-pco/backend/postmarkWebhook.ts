// ─── Postmark Bounce & Spam Webhook Handler ───────────────────────────────────
//
// Receives inbound webhook events from Postmark and automatically suppresses
// addresses that hard-bounce or generate spam complaints.
//
// Events handled:
//   Bounce (TypeCode 1  = HardBounce)   → permanent suppression
//   Bounce (TypeCode 2  = SoftBounce)   → logged only (not suppressed)
//   SpamComplaint (TypeCode 512)        → permanent suppression
//   SubscriptionChange (Unsubscribed)   → permanent suppression
//
// Postmark echoes the Metadata we attach at send time (churchId, campaignId)
// back in each webhook payload. We use churchId to write to the correct
// per-tenant email_unsubscribes document. If churchId is absent we attempt to
// locate the tenant by matching the Server ID stored on each church document.
//
// Endpoint: POST /email/webhooks/postmark
// Auth:     No Postmark signature verification needed for inbound webhooks
//           (we trust the source via the unique URL). Optional: add a shared
//           webhook token in the URL as a query param for extra security.

import { getDb } from './firebase.js';
import { createServerLogger } from '../services/logService.js';

// ─── Types ───────────────────────────────────────────────────────────────────

interface PostmarkBouncePayload {
    RecordType: 'Bounce';
    Type: string;           // 'HardBounce', 'SoftBounce', 'Transient', etc.
    TypeCode: number;       // 1 = HardBounce, 2 = SoftBounce, 512 = SpamComplaint
    Email: string;          // bounced address
    From: string;           // sender (our From address)
    MessageID: string;
    ServerID: number;
    BouncedAt: string;
    Description: string;
    Details: string;
    Subject?: string;
    Metadata?: Record<string, string>;
}

interface PostmarkSpamPayload {
    RecordType: 'SpamComplaint';
    Email: string;
    From: string;
    MessageID: string;
    ServerID: number;
    BouncedAt: string;
    Subject?: string;
    Metadata?: Record<string, string>;
}

interface PostmarkSubscriptionPayload {
    RecordType: 'SubscriptionChange';
    RecipientEmail: string;
    ServerID: number;
    ChangedAt: string;
    Metadata?: Record<string, string>;
    SuppressSending: boolean;
    SuppressionReason?: string;
}

type PostmarkWebhookPayload =
    | PostmarkBouncePayload
    | PostmarkSpamPayload
    | PostmarkSubscriptionPayload;

// Hard bounce type codes that warrant permanent suppression
const HARD_BOUNCE_CODES = new Set([
    1,    // HardBounce
    10,   // DNSError
    16,   // DNSConnectFail
    21,   // ManuallyDeactivated
    22,   // Unsubscribe (legacy type)
    25,   // MailboxDoesNotExist
    512,  // SpamComplaint (also handled via SpamComplaint record type)
]);

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Resolve the churchId from webhook Metadata (fastest) or by scanning churches
 * for a matching Postmark Server ID (fallback).
 */
async function resolveChurchId(
    db: any,
    metadata: Record<string, string> | undefined,
    serverId: number | undefined,
): Promise<string | null> {
    // Fast path: churchId embedded in send-time Metadata
    if (metadata?.churchId) {
        return metadata.churchId;
    }

    // Fallback: scan churches for the matching Postmark Server ID
    if (serverId) {
        const snap = await db
            .collection('churches')
            .where('emailSettings.postmarkServerId', '==', serverId)
            .limit(1)
            .get();
        if (!snap.empty) {
            return snap.docs[0].id;
        }
    }

    return null;
}

/**
 * Writes an address to email_unsubscribes for the given church tenant.
 * Safe to call multiple times — uses set() with merge to avoid duplicates.
 */
async function suppressAddress(
    db: any,
    churchId: string,
    email: string,
    reason: 'hard_bounce' | 'spam_complaint' | 'unsubscribed',
    detail: string,
    campaignId?: string,
): Promise<void> {
    const normalised = email.toLowerCase().trim();
    if (!normalised || !normalised.includes('@')) return;

    const id = `${churchId}_${normalised.replace(/[^a-z0-9@._-]/g, '')}`;
    await db.doc(`email_unsubscribes/${id}`).set(
        {
            id,
            churchId,
            email: normalised,
            reason,
            detail,
            ...(campaignId ? { campaignId } : {}),
            unsubscribedAt: Date.now(),
            source: 'postmark_webhook',
        },
        { merge: true },
    );
}

// ─── Request handler ──────────────────────────────────────────────────────────

export const handlePostmarkWebhook = async (req: any, res: any): Promise<void> => {
    // Respond 200 immediately — Postmark will retry if it doesn't get 2xx quickly
    res.status(200).json({ received: true });

    const db = getDb();
    const log = createServerLogger(db);
    const payload: PostmarkWebhookPayload = req.body;

    if (!payload?.RecordType) {
        return; // Ignore malformed payloads
    }

    try {
        // ── Bounce events ─────────────────────────────────────────────────────
        if (payload.RecordType === 'Bounce') {
            const bounce = payload as PostmarkBouncePayload;
            const email  = bounce.Email?.toLowerCase().trim();
            const isHard = HARD_BOUNCE_CODES.has(bounce.TypeCode);

            if (!email) return;

            const churchId = await resolveChurchId(db, bounce.Metadata, bounce.ServerID);
            const campaignId = bounce.Metadata?.campaignId;

            log.info(
                `[PostmarkWebhook] Bounce received: ${email} | TypeCode=${bounce.TypeCode} (${bounce.Type}) | hard=${isHard} | church=${churchId || '?'}`,
                'system',
                { email, typeCode: bounce.TypeCode, type: bounce.Type, churchId },
                churchId || 'system',
            );

            if (isHard && churchId) {
                await suppressAddress(
                    db,
                    churchId,
                    email,
                    'hard_bounce',
                    `${bounce.Type} (TypeCode ${bounce.TypeCode}): ${bounce.Description || ''}`.trim(),
                    campaignId,
                );
                log.info(
                    `[PostmarkWebhook] Hard bounce suppressed: ${email} for church ${churchId}`,
                    'system',
                    { email, churchId, typeCode: bounce.TypeCode },
                    churchId,
                );
            } else if (!isHard) {
                log.info(
                    `[PostmarkWebhook] Soft bounce noted (not suppressed): ${email} | ${bounce.Type}`,
                    'system',
                    { email, churchId },
                    churchId || 'system',
                );
            } else if (!churchId) {
                log.warn(
                    `[PostmarkWebhook] Hard bounce for ${email} but could not resolve churchId (ServerID=${bounce.ServerID}). Add churchId to Metadata at send time.`,
                    'system',
                    { email, serverId: bounce.ServerID },
                    'system',
                );
            }
            return;
        }

        // ── Spam complaint events ─────────────────────────────────────────────
        if (payload.RecordType === 'SpamComplaint') {
            const spam     = payload as PostmarkSpamPayload;
            const email    = spam.Email?.toLowerCase().trim();
            const churchId = await resolveChurchId(db, spam.Metadata, spam.ServerID);
            const campaignId = spam.Metadata?.campaignId;

            if (!email) return;

            log.warn(
                `[PostmarkWebhook] Spam complaint: ${email} | church=${churchId || '?'}`,
                'system',
                { email, churchId },
                churchId || 'system',
            );

            if (churchId) {
                await suppressAddress(
                    db,
                    churchId,
                    email,
                    'spam_complaint',
                    'Recipient reported this email as spam.',
                    campaignId,
                );
                log.info(
                    `[PostmarkWebhook] Spam complaint suppressed: ${email} for church ${churchId}`,
                    'system',
                    { email, churchId },
                    churchId,
                );
            }
            return;
        }

        // ── Subscription change events ────────────────────────────────────────
        if (payload.RecordType === 'SubscriptionChange') {
            const sub      = payload as PostmarkSubscriptionPayload;
            const email    = sub.RecipientEmail?.toLowerCase().trim();
            const churchId = await resolveChurchId(db, sub.Metadata, sub.ServerID);
            const campaignId = sub.Metadata?.campaignId;

            if (!email || !sub.SuppressSending) return;

            log.info(
                `[PostmarkWebhook] Subscription unsubscribe: ${email} | church=${churchId || '?'}`,
                'system',
                { email, churchId },
                churchId || 'system',
            );

            if (churchId) {
                await suppressAddress(
                    db,
                    churchId,
                    email,
                    'unsubscribed',
                    `Postmark SubscriptionChange: ${sub.SuppressionReason || 'ManuallyUnsubscribed'}`,
                    campaignId,
                );
            }
            return;
        }

        // All other record types (Open, Click, Delivery) — ignore silently
    } catch (e: any) {
        log.error(
            `[PostmarkWebhook] Unhandled error processing ${payload.RecordType}: ${e.message}`,
            'system',
            { error: e.message },
            'system',
        );
    }
};
