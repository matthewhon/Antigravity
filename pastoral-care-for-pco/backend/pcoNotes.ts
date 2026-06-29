import { createServerLogger } from '../services/logService';

// ─── PCO Notes — Backend Direct Writer ───────────────────────────────────────
//
// This module writes notes directly to the Planning Center People API using the
// church's stored OAuth access token (no browser proxy involved).
//
// Usage:
//   • After a successful individual SMS send — call writePcoNoteForSms once.
//   • After a successful bulk SMS/email send — call writePcoNoteForSms or
//     writePcoNoteForEmail for each person in the recipient list (fan-out).
//
// All writes are fire-and-forget: failures are logged but never block the send.
//
// PCO Note Category:
//   Notes can optionally be placed in a named category (e.g. "Communication Log").
//   The category must already exist in PCO People → Profile notes → Manage note categories.
//   We look up the category by name on first use per church and cache the ID in Firestore.
// ─────────────────────────────────────────────────────────────────────────────

const MAX_NOTE_BODY = 2000; // PCO doesn't document a hard limit, but we cap at 2k chars

// In-process cache: churchId → { id, name, fetchedAt }
// This avoids hammering the PCO API on every send in the same server process lifetime.
const categoryCache = new Map<string, { id: string | null; fetchedAt: number }>();
const CATEGORY_CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Look up the PCO note category ID for a given church.
 * Returns null if no category is configured or if the named category doesn't exist in PCO.
 */
async function resolveCategoryId(
    db: any,
    churchId: string,
    token: string,
    log: any
): Promise<string | null> {
    // 1. Check in-process cache
    const cached = categoryCache.get(churchId);
    if (cached && Date.now() - cached.fetchedAt < CATEGORY_CACHE_TTL_MS) {
        return cached.id;
    }

    // 2. Load configured category name from Firestore
    let categoryName: string | null = null;

    try {
        // Check church-level override first
        const churchSnap = await db.collection('churches').doc(churchId).get();
        const churchData = churchSnap.data() || {};
        categoryName = churchData.pcoNoteCategory || null;

        // Fall back to system-level setting
        if (!categoryName) {
            const systemSnap = await db.doc('system/settings').get();
            categoryName = (systemSnap.data() || {}).pcoNoteCategory || null;
        }
    } catch (e: any) {
        log.warn('[PCONotes] Could not load note category config from Firestore', 'system', { churchId, error: e.message }, churchId);
    }

    if (!categoryName) {
        // No category configured — write uncategorized notes
        categoryCache.set(churchId, { id: null, fetchedAt: Date.now() });
        return null;
    }

    // 3. Look up category ID from PCO
    try {
        const pcoRes = await fetch(
            'https://api.planningcenteronline.com/people/v2/note_categories?per_page=100',
            { headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } }
        );
        if (!pcoRes.ok) {
            log.warn('[PCONotes] Failed to fetch note categories from PCO', 'system', { churchId, status: pcoRes.status }, churchId);
            categoryCache.set(churchId, { id: null, fetchedAt: Date.now() });
            return null;
        }
        const data = await pcoRes.json();
        const categories: any[] = data.data || [];
        const match = categories.find(
            (c: any) => (c.attributes?.name || '').toLowerCase() === categoryName!.toLowerCase()
        );
        const resolvedId = match?.id || null;
        if (resolvedId) {
            log.info(`[PCONotes] Resolved note category "${categoryName}" → id ${resolvedId}`, 'system', { churchId }, churchId);
        } else {
            log.warn(`[PCONotes] Note category "${categoryName}" not found in PCO — writing uncategorized notes`, 'system', { churchId }, churchId);
        }
        categoryCache.set(churchId, { id: resolvedId, fetchedAt: Date.now() });
        return resolvedId;
    } catch (e: any) {
        log.warn('[PCONotes] Error resolving note category', 'system', { churchId, error: e.message }, churchId);
        categoryCache.set(churchId, { id: null, fetchedAt: Date.now() });
        return null;
    }
}

/**
 * Write a single note to a PCO person using the church's stored OAuth token.
 * Returns true on success, false on failure.
 */
export async function writePcoNote(params: {
    db: any;
    log: any;
    churchId: string;
    personId: string;  // PCO person ID
    noteContent: string;
}): Promise<boolean> {
    const { db, log, churchId, personId, noteContent } = params;

    try {
        // Load the church's current PCO access token
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return false;
        const token: string = churchSnap.data()?.pcoAccessToken || '';
        if (!token) {
            log.warn('[PCONotes] No PCO access token — skipping note write', 'system', { churchId, personId }, churchId);
            return false;
        }

        // Resolve note category
        const categoryId = await resolveCategoryId(db, churchId, token, log);

        // Build the JSON:API payload
        const payload: any = {
            data: {
                type: 'Note',
                attributes: {
                    note: noteContent.slice(0, MAX_NOTE_BODY),
                },
            },
        };
        if (categoryId) {
            payload.data.relationships = {
                note_category: {
                    data: { type: 'NoteCategory', id: categoryId },
                },
            };
        }

        const pcoRes = await fetch(
            `https://api.planningcenteronline.com/people/v2/people/${personId}/notes`,
            {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${token}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'PastoralCareApp/1.0',
                },
                body: JSON.stringify(payload),
            }
        );

        if (!pcoRes.ok) {
            const errText = await pcoRes.text().catch(() => '');
            log.warn('[PCONotes] PCO note write failed', 'system', { churchId, personId, status: pcoRes.status, error: errText.slice(0, 300) }, churchId);
            return false;
        }

        log.info('[PCONotes] Note written to PCO person', 'system', { churchId, personId }, churchId);
        return true;
    } catch (e: any) {
        log.warn('[PCONotes] Unexpected error writing PCO note', 'system', { churchId, personId, error: e.message }, churchId);
        return false;
    }
}

// ─── Note Content Builders ────────────────────────────────────────────────────

function formatDate(): string {
    return new Date().toLocaleString('en-US', {
        month: 'short', day: 'numeric', year: 'numeric',
        hour: 'numeric', minute: '2-digit', hour12: true,
        timeZoneName: 'short',
    });
}

export function buildSmsNoteContent(params: {
    recipientName?: string;
    recipientPhone: string;
    senderName?: string;
    messageBody: string;
    groupContext?: { name: string; totalRecipients: number };
}): string {
    const { recipientName, recipientPhone, senderName, messageBody, groupContext } = params;
    const lines: string[] = [];
    lines.push('📱 SMS sent via Pastoral Care app');
    if (groupContext) {
        lines.push(`Group: ${groupContext.name} (${groupContext.totalRecipients} recipients)`);
    }
    lines.push(`To: ${recipientName ? `${recipientName} (${recipientPhone})` : recipientPhone}`);
    if (senderName) lines.push(`Sent by: ${senderName}`);
    lines.push(`Date: ${formatDate()}`);
    lines.push('');
    lines.push('---');
    lines.push(messageBody);
    return lines.join('\n');
}

export function buildEmailNoteContent(params: {
    recipientName?: string;
    recipientEmail: string;
    subject: string;
    senderName?: string;
    htmlBody?: string;
    groupContext?: { name: string; totalRecipients: number };
}): string {
    const { recipientName, recipientEmail, subject, senderName, htmlBody, groupContext } = params;

    // Strip HTML tags for a plain-text preview
    const plainBody = (htmlBody || '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"')
        .replace(/\s{3,}/g, '\n')
        .trim()
        .slice(0, 500);

    const lines: string[] = [];
    lines.push('📧 Email sent via Pastoral Care app');
    if (groupContext) {
        lines.push(`Group: ${groupContext.name} (${groupContext.totalRecipients} recipients)`);
    }
    lines.push(`To: ${recipientName ? `${recipientName} (${recipientEmail})` : recipientEmail}`);
    lines.push(`Subject: ${subject}`);
    if (senderName) lines.push(`Sent by: ${senderName}`);
    lines.push(`Date: ${formatDate()}`);
    if (plainBody) {
        lines.push('');
        lines.push('---');
        lines.push(plainBody + (plainBody.length >= 500 ? '…' : ''));
    }
    return lines.join('\n');
}

// ─── Public Fire-and-Forget Helpers ──────────────────────────────────────────

/**
 * Write a PCO note for an individual SMS send (fire-and-forget).
 * Does nothing if personId is not provided.
 */
export function fireAndForgetSmsNote(params: {
    db: any;
    churchId: string;
    personId: string | null | undefined;
    recipientName?: string;
    recipientPhone: string;
    senderName?: string;
    messageBody: string;
    groupContext?: { name: string; totalRecipients: number };
}): void {
    if (!params.personId) return;
    const log = createServerLogger(params.db);
    const noteContent = buildSmsNoteContent({
        recipientName: params.recipientName,
        recipientPhone: params.recipientPhone,
        senderName: params.senderName,
        messageBody: params.messageBody,
        groupContext: params.groupContext,
    });
    writePcoNote({ db: params.db, log, churchId: params.churchId, personId: params.personId, noteContent })
        .catch(() => { /* silently swallow — already logged inside writePcoNote */ });
}

/**
 * Write PCO notes for all recipients in a bulk SMS/email send (fire-and-forget fan-out).
 * Entries without a pcoPersonId are silently skipped.
 */
export function fireAndForgetBulkNotes(params: {
    db: any;
    churchId: string;
    /** Map of destination (phone or email) → { pcoPersonId, recipientName, resolvedBody } */
    recipients: Record<string, {
        pcoPersonId?: string | null;
        recipientName?: string;
        resolvedBody: string;
    }>;
    senderName?: string;
    subject?: string;            // email only
    channelType: 'sms' | 'email';
    groupContext?: { name: string; totalRecipients: number };
}): void {
    const { db, churchId, recipients, senderName, subject, channelType, groupContext } = params;
    const log = createServerLogger(db);

    const noteWritePromises: Promise<boolean>[] = [];
    for (const [dest, info] of Object.entries(recipients)) {
        if (!info.pcoPersonId) continue;

        let noteContent: string;
        if (channelType === 'sms') {
            noteContent = buildSmsNoteContent({
                recipientName: info.recipientName,
                recipientPhone: dest,
                senderName,
                messageBody: info.resolvedBody,
                groupContext,
            });
        } else {
            noteContent = buildEmailNoteContent({
                recipientName: info.recipientName,
                recipientEmail: dest,
                subject: subject || '(no subject)',
                senderName,
                htmlBody: info.resolvedBody,
                groupContext,
            });
        }

        noteWritePromises.push(
            writePcoNote({ db, log, churchId, personId: info.pcoPersonId, noteContent })
        );
    }

    if (noteWritePromises.length === 0) return;

    Promise.allSettled(noteWritePromises)
        .then(results => {
            const failed = results.filter(r => r.status === 'rejected').length;
            if (failed > 0) {
                log.warn(`[PCONotes] ${failed} of ${noteWritePromises.length} PCO note write(s) failed during bulk send`, 'system', { churchId }, churchId);
            }
        })
        .catch(() => { /* never throws */ });
}

/**
 * Write a PCO note for a single email recipient (fire-and-forget).
 * Does nothing if personId is not provided.
 */
export function fireAndForgetEmailNote(params: {
    db: any;
    churchId: string;
    personId: string | null | undefined;
    recipientName?: string;
    recipientEmail: string;
    subject: string;
    senderName?: string;
    htmlBody?: string;
    groupContext?: { name: string; totalRecipients: number };
}): void {
    if (!params.personId) return;
    const log = createServerLogger(params.db);
    const noteContent = buildEmailNoteContent({
        recipientName: params.recipientName,
        recipientEmail: params.recipientEmail,
        subject: params.subject,
        senderName: params.senderName,
        htmlBody: params.htmlBody,
        groupContext: params.groupContext,
    });
    writePcoNote({ db: params.db, log, churchId: params.churchId, personId: params.personId, noteContent })
        .catch(() => { /* silently swallow — already logged inside writePcoNote */ });
}
