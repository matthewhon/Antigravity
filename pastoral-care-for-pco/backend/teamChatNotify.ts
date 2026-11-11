/**
 * Team Chat native push notifications.
 *
 *   POST /api/team-chat/notify
 *   Headers: Authorization: Bearer <Firebase ID token>
 *   Body:    { messageId: string }
 *
 * Called fire-and-forget by a client right after it writes its own message to
 * `team_messages/{messageId}`. The server re-derives everything (sender,
 * channel, recipients) from Firestore, so the client can only ask "notify for
 * my message", never choose recipients or content.
 *
 * Notification rule (product decision) — an eligible recipient gets a push if ANY of:
 *   - the channel is a direct message (type === 'direct')
 *   - the recipient is in message.mentionedUserIds (@mention)
 *   - the recipient is in channel.notifyUserIds ("Notify me for all messages")
 *     and NOT in channel.mutedUserIds
 * Otherwise no push.
 */

import admin from 'firebase-admin';
import { getDb } from './firebase';
import { sendFcmToUsers, FcmUserDoc } from './webPushService';

type TeamChatArea = 'giving' | 'care' | 'people' | 'groups' | 'services' | 'admin';

/**
 * Minimal server-side port of `canReadArea(user, area)`.
 *
 * SOURCE OF TRUTH: services/permissionService.ts (`canReadArea` → `hasModuleAccess`).
 * Keep this in sync if role → area rules change there. Mirrors the client-side
 * channel visibility gate in contexts/TeamChatContext.tsx (`visibleChannels`).
 */
function canReadAreaServer(userData: any, area: string): boolean {
    const roles: string[] = Array.isArray(userData?.roles) ? userData.roles : [];
    const isAdmin = roles.includes('System Administration') || roles.includes('Church Admin');
    if (isAdmin) return true;
    if (area === 'admin') return false;
    if (roles.includes('Pastor')) return true;

    switch (area as TeamChatArea) {
        case 'giving':   return roles.includes('Giving');
        case 'people':   return roles.includes('People');
        case 'groups':   return roles.includes('Groups');
        case 'services': return roles.includes('Services');
        case 'care':     return roles.includes('Pastor') || roles.includes('Pastoral Care');
        default:         return false;
    }
}

/** Whether `userId` can see `channel` — mirrors TeamChatContext `visibleChannels`. */
function canSeeChannel(userId: string, userData: any, channel: any): boolean {
    if (channel.requiredArea && !canReadAreaServer(userData, channel.requiredArea)) return false;

    const participantIds: string[] = Array.isArray(channel.participantIds) ? channel.participantIds : [];
    if (channel.type === 'direct') return participantIds.includes(userId);
    if (channel.isAutoJoinedByRole) return true;

    // Private / invite-only custom channels (empty participant list = open)
    return participantIds.length === 0 || participantIds.includes(userId) || channel.createdBy === userId;
}

function buildBody(message: any): string {
    const text = typeof message.text === 'string' ? message.text.trim() : '';
    if (text) return text.length > 140 ? `${text.slice(0, 139)}…` : text;

    const attachments: any[] = Array.isArray(message.attachments) ? message.attachments : [];
    if (attachments.length > 0) {
        return attachments.some(a => a?.kind === 'image') ? '📷 Sent a photo' : '📎 Sent an attachment';
    }
    if (message.widget?.title) return `📊 Shared ${message.widget.title}`;
    return 'New message';
}

function buildTitle(channel: any, senderName: string): string {
    if (channel.type === 'direct') return senderName;
    const icon = typeof channel.icon === 'string' && channel.icon.trim() ? `${channel.icon.trim()} ` : '';
    const name = channel.name || 'thread';
    return `${icon}#${name} · ${senderName}`;
}

/** Express handler: POST /api/team-chat/notify */
export const notifyTeamChatMessage = async (req: any, res: any) => {
    try {
        // getDb() initializes the Admin app if needed — must run before admin.auth().
        const db = getDb();

        // ── Auth ──────────────────────────────────────────────────────────
        const authHeader: string = req.headers?.authorization || req.headers?.Authorization || '';
        const match = /^Bearer\s+(.+)$/i.exec(authHeader);
        if (!match) return res.status(401).json({ error: 'Missing bearer token' });

        let uid: string;
        try {
            const decoded = await admin.auth().verifyIdToken(match[1]);
            uid = decoded.uid;
        } catch {
            return res.status(401).json({ error: 'Invalid or expired token' });
        }

        const messageId = req.body?.messageId;
        if (!messageId || typeof messageId !== 'string') {
            return res.status(400).json({ error: 'Missing messageId' });
        }

        // ── Message + sender validation ───────────────────────────────────
        const msgRef = db.collection('team_messages').doc(messageId);
        const msgSnap = await msgRef.get();
        if (!msgSnap.exists) return res.status(404).json({ error: 'Message not found' });
        const message: any = msgSnap.data() || {};

        if (message.senderId !== uid) return res.status(403).json({ error: 'Not the sender of this message' });

        const senderSnap = await db.collection('users').doc(uid).get();
        const sender: any = senderSnap.exists ? senderSnap.data() : null;
        if (!sender || !message.churchId || sender.churchId !== message.churchId) {
            return res.status(403).json({ error: 'Sender does not belong to this church' });
        }

        if (message.isAiResponse || message.isAutomatedBriefing || message.senderId === 'pastor-ai') {
            return res.json({ success: true, skipped: 'automated', recipients: 0 });
        }
        if (message.pushNotifiedAt) {
            return res.json({ success: true, skipped: 'already-notified', recipients: 0 });
        }

        // ── Channel ───────────────────────────────────────────────────────
        const channelSnap = await db.collection('team_channels').doc(message.channelId).get();
        if (!channelSnap.exists) return res.status(404).json({ error: 'Channel not found' });
        const channel: any = { id: channelSnap.id, ...(channelSnap.data() || {}) };
        if (channel.churchId !== message.churchId) {
            return res.status(403).json({ error: 'Channel does not belong to this church' });
        }

        // ── Plan gate (Starter plan has no Team Chat) ─────────────────────
        const churchSnap = await db.collection('churches').doc(message.churchId).get();
        const church: any = churchSnap.exists ? churchSnap.data() : {};
        if (church?.subscription?.status === 'active' && church?.subscription?.planId === 'starter') {
            return res.json({ success: true, skipped: 'plan', recipients: 0 });
        }

        // ── Idempotency claim ─────────────────────────────────────────────
        const claimed = await db.runTransaction(async (tx: any) => {
            const fresh = await tx.get(msgRef);
            if (!fresh.exists || fresh.data()?.pushNotifiedAt) return false;
            tx.update(msgRef, { pushNotifiedAt: Date.now() });
            return true;
        });
        if (!claimed) return res.json({ success: true, skipped: 'already-notified', recipients: 0 });

        // ── Recipients ────────────────────────────────────────────────────
        const isDirect = channel.type === 'direct';
        const mentioned = new Set<string>(Array.isArray(message.mentionedUserIds) ? message.mentionedUserIds : []);
        const notifyAll = new Set<string>(Array.isArray(channel.notifyUserIds) ? channel.notifyUserIds : []);
        const muted = new Set<string>(Array.isArray(channel.mutedUserIds) ? channel.mutedUserIds : []);

        const usersSnap = await db.collection('users').where('churchId', '==', message.churchId).get();
        const recipients: FcmUserDoc[] = [];
        for (const doc of usersSnap.docs) {
            const userId = doc.id;
            if (userId === uid) continue;
            const data = doc.data() || {};
            if (!canSeeChannel(userId, data, channel)) continue;

            const wantsPush =
                isDirect ||
                mentioned.has(userId) ||
                (notifyAll.has(userId) && !muted.has(userId));
            if (!wantsPush) continue;

            recipients.push({ id: userId, data });
        }

        if (recipients.length === 0) return res.json({ success: true, recipients: 0 });

        const senderName: string = message.senderName || sender.name || 'Someone';
        const result = await sendFcmToUsers(recipients, {
            title: buildTitle(channel, senderName),
            body: buildBody(message),
            data: {
                type: 'team-chat',
                channelId: String(channel.id),
                messageId: String(messageId),
                churchId: String(message.churchId),
                url: `/?tab=team&channelId=${channel.id}`,
                tag: `team-chat-${channel.id}`,
            },
            badge: 1,
        });

        return res.json({
            success: true,
            recipients: recipients.length,
            delivered: result.successCount,
            failed: result.failureCount,
        });
    } catch (e: any) {
        console.error('[TeamChatNotify] Error:', e?.message || e);
        return res.status(500).json({ error: e?.message || 'Failed to send team chat notification' });
    }
};
