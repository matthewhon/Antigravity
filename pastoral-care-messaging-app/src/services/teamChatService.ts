/**
 * teamChatService.ts
 *
 * Mobile port of the Team Chat Firestore operations from the web app
 * (pastoral-care-for-pco/services/firestoreService.ts, "Internal Team Chat").
 * Both apps share the `team_channels` / `team_messages` collections, so the
 * document shapes written here MUST match the web app exactly.
 */
import {
    collection, doc, onSnapshot, query, where, getDoc, setDoc, updateDoc,
    deleteDoc, deleteField, arrayUnion, arrayRemove, Unsubscribe,
} from 'firebase/firestore';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { Capacitor } from '@capacitor/core';
import { auth, db, storage } from './firebase';
import { firestore } from './firestoreService';
import {
    ChatFileAttachment, ChatWidgetAttachment, ChatWidgetItemClaim,
    TeamChannel, TeamMessage, User,
} from '../types';

const CHANNELS = 'team_channels';
const MESSAGES = 'team_messages';

/**
 * The Team Chat thread currently on screen. Read by usePushNotifications to
 * skip foreground toasts for messages the user is already looking at.
 */
export const activeTeamChat: { channelId: string | null } = { channelId: null };

/** Firestore rejects `undefined`; the web app strips it the same way. */
const clean = <T,>(v: T): T => JSON.parse(JSON.stringify(v));

// ─── API base (same resolution as the rest of the mobile app) ───────────────

let apiBasePromise: Promise<string> | null = null;
export function getApiBase(): Promise<string> {
    if (!apiBasePromise) {
        const fallback = Capacitor.isNativePlatform() ? 'https://pastoralcare.barnabassoftware.com' : '';
        apiBasePromise = firestore.getSystemSettings()
            .then((s: any) => (s?.apiBaseUrl ? String(s.apiBaseUrl).replace(/\/$/, '') : fallback))
            .catch(() => fallback);
    }
    return apiBasePromise;
}

// ─── Channels ───────────────────────────────────────────────────────────────

/** Same default department channels as the web app (idempotent). */
export async function ensureDefaultTeamChannels(churchId: string): Promise<void> {
    if (!churchId) return;
    const defaults: Array<Omit<TeamChannel, 'createdAt' | 'lastMessageAt'>> = [
        { id: `dept_${churchId}_general`, churchId, type: 'department', name: 'general', icon: '💬', description: 'Church-wide staff announcements, encouragement, and general collaboration', participantIds: [], isAutoJoinedByRole: true, createdBy: 'system' },
        { id: `dept_${churchId}_giving`, churchId, type: 'department', name: 'giving-and-finance', icon: '💰', description: 'Role-gated channel for Lapsed Donors, Top Givers, batches, and financial stewardship (Giving / Finance / Pastor / Admin only)', requiredArea: 'giving', participantIds: [], isAutoJoinedByRole: true, createdBy: 'system' },
        { id: `dept_${churchId}_care`, churchId, type: 'department', name: 'pastoral-care', icon: '🕊️', description: 'Role-gated channel for at-risk members, prayer requests, and pastoral care coordination (Care / Pastor / Admin only)', requiredArea: 'care', participantIds: [], isAutoJoinedByRole: true, createdBy: 'system' },
        { id: `dept_${churchId}_services`, churchId, type: 'department', name: 'sunday-services', icon: '🎵', description: 'Role-gated channel for weekend service plans, volunteer teams, and staffing needs (Services / Pastor / Admin only)', requiredArea: 'services', participantIds: [], isAutoJoinedByRole: true, createdBy: 'system' },
        { id: `dept_${churchId}_groups`, churchId, type: 'department', name: 'groups-ministry', icon: '📂', description: 'Role-gated channel for small group health, leader care, and assimilation (Groups / Pastor / Admin only)', requiredArea: 'groups', participantIds: [], isAutoJoinedByRole: true, createdBy: 'system' },
    ];
    try {
        await Promise.all(defaults.map(async def => {
            const ref = doc(db, CHANNELS, def.id);
            const snap = await getDoc(ref);
            if (!snap.exists()) {
                const now = Date.now();
                await setDoc(ref, { ...def, createdAt: now, lastMessageAt: now });
            }
        }));
    } catch (e) {
        console.warn('[TeamChat] ensureDefaultTeamChannels failed:', e);
    }
}

export function subscribeToTeamChannels(churchId: string, onUpdate: (channels: TeamChannel[]) => void): Unsubscribe {
    const q = query(collection(db, CHANNELS), where('churchId', '==', churchId));
    return onSnapshot(q, snap => {
        const channels = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }) as TeamChannel);
        channels.sort((a, b) => (b.lastMessageAt || b.createdAt || 0) - (a.lastMessageAt || a.createdAt || 0));
        onUpdate(channels);
    }, err => console.warn('[TeamChat] subscribeToTeamChannels error:', err));
}

export async function saveTeamChannel(channel: TeamChannel): Promise<void> {
    await setDoc(doc(db, CHANNELS, channel.id), clean(channel), { merge: true });
}

export async function findOrCreateDirectChannel(churchId: string, currentUser: User, targetUsers: User[]): Promise<TeamChannel> {
    const allIds = Array.from(new Set([currentUser.id, ...targetUsers.map(u => u.id)])).sort();
    const dmId = `dm_${churchId}_${allIds.join('_')}`;
    const ref = doc(db, CHANNELS, dmId);
    const snap = await getDoc(ref);
    if (snap.exists()) return { id: snap.id, ...(snap.data() as Record<string, any>) } as TeamChannel;
    const now = Date.now();
    const channel: TeamChannel = {
        id: dmId, churchId, type: 'direct', participantIds: allIds, isAutoJoinedByRole: false,
        createdBy: currentUser.id, createdAt: now, lastMessageAt: now, lastReadAt: { [currentUser.id]: now },
    };
    await saveTeamChannel(channel);
    return channel;
}

export async function markTeamChannelRead(channelId: string, userId: string): Promise<void> {
    if (!channelId || !userId) return;
    try {
        await updateDoc(doc(db, CHANNELS, channelId), { [`lastReadAt.${userId}`]: Date.now() });
    } catch { /* non-fatal */ }
}

/** "Notify me about every message" toggle (read by the push backend). */
export async function setChannelNotifyAll(channelId: string, userId: string, enabled: boolean): Promise<void> {
    await updateDoc(doc(db, CHANNELS, channelId), {
        notifyUserIds: enabled ? arrayUnion(userId) : arrayRemove(userId),
    });
}

// ─── Messages ───────────────────────────────────────────────────────────────

export function subscribeToTeamMessages(churchId: string, channelId: string, onUpdate: (messages: TeamMessage[]) => void): Unsubscribe {
    const q = query(collection(db, MESSAGES), where('churchId', '==', churchId), where('channelId', '==', channelId));
    return onSnapshot(q, snap => {
        const msgs = snap.docs.map(d => ({ id: d.id, ...(d.data() as Record<string, any>) }) as TeamMessage);
        msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        onUpdate(msgs);
    }, err => console.warn('[TeamChat] subscribeToTeamMessages error:', err));
}

export function previewForMessage(message: Pick<TeamMessage, 'text' | 'widget' | 'attachments'>): string {
    if (message.text?.trim()) return message.text.trim().slice(0, 90);
    if (message.widget) return `📊 Shared widget: ${message.widget.title}`;
    if (message.attachments && message.attachments.length > 0) {
        return `📎 Shared ${message.attachments.length} attachment${message.attachments.length > 1 ? 's' : ''}`;
    }
    return 'New message';
}

export async function sendTeamMessage(message: TeamMessage): Promise<void> {
    await setDoc(doc(db, MESSAGES, message.id), clean(message));
    await updateDoc(doc(db, CHANNELS, message.channelId), {
        lastMessageAt: message.createdAt,
        lastMessagePreview: previewForMessage(message),
        lastMessageSenderId: message.senderId,
        lastMessageSenderName: message.senderName,
        [`lastReadAt.${message.senderId}`]: message.createdAt,
    }).catch(() => {});
}

export async function updateTeamMessage(messageId: string, updates: Partial<TeamMessage>): Promise<void> {
    await updateDoc(doc(db, MESSAGES, messageId), clean(updates) as Record<string, any>);
}

export async function deleteTeamMessage(messageId: string): Promise<void> {
    await deleteDoc(doc(db, MESSAGES, messageId));
}

export async function toggleTeamMessageReaction(messageId: string, emoji: string, userId: string): Promise<void> {
    const ref = doc(db, MESSAGES, messageId);
    const snap = await getDoc(ref);
    if (!snap.exists()) return;
    const reactions = { ...((snap.data() as TeamMessage).reactions || {}) };
    const current = reactions[emoji] || [];
    if (current.includes(userId)) {
        const next = current.filter(id => id !== userId);
        if (next.length === 0) delete reactions[emoji];
        else reactions[emoji] = next;
    } else {
        reactions[emoji] = [...current, userId];
    }
    await updateDoc(ref, { reactions });
}

export async function claimWidgetItemInMessage(messageId: string, itemId: string, claim: ChatWidgetItemClaim | null): Promise<void> {
    await updateDoc(doc(db, MESSAGES, messageId), {
        [`widget.claims.${itemId}`]: claim ? claim : deleteField(),
    });
}

/**
 * "Claim & Care" toggle, same as the web: claiming also records a
 * care_followup_log entry so the Pastoral Care module reflects the outreach.
 */
export async function toggleWidgetItemClaim(params: {
    messageId: string;
    churchId: string;
    itemId: string;
    user: User;
    existingClaim?: ChatWidgetItemClaim;
}): Promise<void> {
    const { messageId, churchId, itemId, user, existingClaim } = params;
    if (existingClaim?.claimedByUserId === user.id) {
        await claimWidgetItemInMessage(messageId, itemId, null);
        return;
    }
    await claimWidgetItemInMessage(messageId, itemId, {
        claimedByUserId: user.id,
        claimedByUserName: user.name,
        claimedAt: Date.now(),
        status: 'claimed',
    });
    await setDoc(doc(db, 'care_followup_log', `${churchId}_${itemId}`), {
        id: `${churchId}_${itemId}`, churchId, personId: itemId,
        followedUpAt: Date.now(), dismissedAt: null, dismissedSignal: null,
    }, { merge: true }).catch(() => {});
}

export const newMessageId = (channelId: string) =>
    `msg_${channelId}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ─── Push notifications (backend fan-out) ───────────────────────────────────

/** Ask the backend to push this message to the right teammates. Fire-and-forget. */
export async function notifyTeamChatPush(messageId: string): Promise<void> {
    try {
        const token = await auth.currentUser?.getIdToken();
        if (!token) return;
        const base = await getApiBase();
        await fetch(`${base}/api/team-chat/notify`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ messageId }),
        });
    } catch {
        // Non-fatal: the message is already saved and visible in-app.
    }
}

// ─── File & photo uploads ───────────────────────────────────────────────────

/** Downscale photos to 1600px JPEG so uploads are fast on cellular. */
function compressImage(file: File): Promise<File> {
    return new Promise(resolve => {
        if (!file.type.startsWith('image/') || file.type === 'image/gif') { resolve(file); return; }
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            const MAX = 1600;
            let { width, height } = img;
            if (width > MAX || height > MAX) {
                const scale = MAX / Math.max(width, height);
                width = Math.round(width * scale);
                height = Math.round(height * scale);
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) { resolve(file); return; }
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob(blob => {
                if (!blob) { resolve(file); return; }
                resolve(new File([blob], file.name.replace(/\.[^/.]+$/, '') + '.jpg', { type: 'image/jpeg' }));
            }, 'image/jpeg', 0.85);
        };
        img.onerror = () => resolve(file);
    });
}

/**
 * Upload a chat attachment to the same Storage location the web app uses.
 * On native, File objects from the WebView picker must be re-wrapped as a Blob
 * before uploadBytesResumable (same workaround as the SMS image upload).
 */
export async function uploadChatAttachment(
    churchId: string,
    uploaderUid: string,
    file: File,
    onProgress?: (pct: number) => void,
): Promise<ChatFileAttachment> {
    const processed = file.type.startsWith('image/') ? await compressImage(file) : file;
    const fileId = `chatfile_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    const cleanName = processed.name.replace(/[^a-zA-Z0-9._-]/g, '_');
    const gcsPath = `tenants/${churchId}/uploads/${fileId}_${cleanName}`;
    const sRef = storageRef(storage, gcsPath);

    let data: Blob | File = processed;
    if (Capacitor.isNativePlatform()) {
        try {
            const buffer = await processed.arrayBuffer();
            data = new Blob([buffer], { type: processed.type || 'application/octet-stream' });
        } catch { /* fall back to the File */ }
    }

    const task = uploadBytesResumable(sRef, data, { contentType: processed.type || 'application/octet-stream' });
    await new Promise<void>((resolve, reject) => {
        task.on('state_changed',
            s => onProgress?.(Math.round((s.bytesTransferred / s.totalBytes) * 100)),
            reject,
            () => resolve());
    });
    const url = await getDownloadURL(task.snapshot.ref);
    const mimeType = processed.type || 'application/octet-stream';
    const kind: ChatFileAttachment['kind'] = mimeType.startsWith('image/')
        ? 'image' : mimeType.startsWith('video/') ? 'video' : 'document';

    // Same as web: also register the file in the File Manager under "Team Chat"
    await firestore.saveTenantFile({
        id: fileId, churchId, uploaderUid, originalName: processed.name, mimeType,
        sizeBytes: processed.size, publicUrl: url, gcsPath, createdAt: Date.now(),
        folder: 'Team Chat', tags: ['team-chat'],
    }).catch(() => {});

    return { id: fileId, kind, name: processed.name, mimeType, sizeBytes: processed.size, url, gcsPath, tenantFileId: fileId };
}

// ─── @PastorAI ──────────────────────────────────────────────────────────────

/** Port of web generateTeamChatAiReply (same prompt) via the /ai/generate proxy. */
export async function generateTeamChatAiReply(params: {
    churchName: string;
    channelName: string;
    userQuery: string;
    senderName: string;
    recentMessages: Array<{ senderName: string; text: string; widgetTitle?: string }>;
    activeWidgetsContext?: string;
}): Promise<string> {
    const transcript = params.recentMessages.slice(-10)
        .map(m => `${m.senderName}: ${m.text}${m.widgetTitle ? ` [Attached Widget: ${m.widgetTitle}]` : ''}`)
        .join('\n');

    const systemInstruction = `You are @PastorAI, an empathetic, strategic, and data-aware ministry assistant embedded inside the internal staff Team Chat for ${params.churchName} (Channel: #${params.channelName}).
Rules:
1. Keep your response concise, warm, and actionable for church leaders (under 180 words unless drafting outreach messages).
2. Reference specific names, metrics, or trends from the attached widgets or church summary context when answering.
3. When asked to draft outreach texts or emails (e.g., for Lapsed Donors or At-Risk members), keep the tone pastoral, caring, and relationship-first—never transactional or guilt-inducing about money.
4. Use clean Markdown formatting (bullet points, bold text).`;

    const prompt = `Recent Channel Conversation:
${transcript || '(Start of conversation)'}

${params.activeWidgetsContext ? `Active Widgets in Thread / Channel:\n${params.activeWidgetsContext}\n` : ''}

Staff Member (${params.senderName}) asks @PastorAI:
"${params.userQuery}"`;

    try {
        const base = await getApiBase();
        const res = await fetch(`${base}/ai/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'gemini-2.5-flash', prompt, systemInstruction }),
        });
        if (!res.ok) throw new Error(`AI request failed (${res.status})`);
        const data = await res.json();
        return (data.text || '').trim() || 'I analyzed the thread, but could not generate a response right now.';
    } catch (err: any) {
        return `🙏 **@PastorAI Note:** I'm having trouble connecting to the AI service right now (${err?.message || 'connection error'}). Please try again in a moment.`;
    }
}

export function widgetContextForAi(widgets: ChatWidgetAttachment[]): string {
    return widgets.slice(-3).map(w => {
        const metrics = (w.snapshot.summaryMetrics || []).map(m => `${m.label}: ${m.value}`).join(', ');
        const items = (w.snapshot.items || []).slice(0, 8).map(i => `${i.name} (${i.primaryStat})`).join('; ');
        return `- ${w.title}${w.snapshot.headlineValue ? ` — ${w.snapshot.headlineValue}` : ''}${metrics ? ` [${metrics}]` : ''}${items ? `\n  People: ${items}` : ''}`;
    }).join('\n');
}

// ─── Report to admin (App Store Guideline 1.2) ──────────────────────────────

/** Sends a DM to the church admins quoting the reported message. */
export async function reportMessageToAdmins(params: {
    churchId: string;
    reporter: User;
    churchUsers: User[];
    message: TeamMessage;
    channelLabel: string;
}): Promise<boolean> {
    const admins = params.churchUsers.filter(u =>
        u.id !== params.reporter.id && u.roles?.includes('Church Admin'));
    if (admins.length === 0) return false;
    const dm = await findOrCreateDirectChannel(params.churchId, params.reporter, admins);
    const now = Date.now();
    const quoted = (params.message.text || previewForMessage(params.message)).slice(0, 400);
    const report: TeamMessage = {
        id: newMessageId(dm.id),
        channelId: dm.id,
        churchId: params.churchId,
        senderId: params.reporter.id,
        senderName: params.reporter.name,
        senderRoles: params.reporter.roles,
        text: `🚩 **Reported message** from ${params.message.senderName} in ${params.channelLabel}:\n> ${quoted}`,
        createdAt: now,
    };
    await sendTeamMessage(report);
    notifyTeamChatPush(report.id);
    return true;
}
