import { useEffect, useRef } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User } from '../types';
import { activeTeamChat } from '../services/teamChatService';

// ─── Foreground notification toast ──────────────────────────────────────────

function showInAppToast(title: string, body: string, onTap?: () => void) {
    const toast = document.createElement('div');
    toast.role = 'alert';
    toast.setAttribute('aria-live', 'assertive');
    Object.assign(toast.style, {
        position: 'fixed',
        top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
        left: '50%',
        transform: 'translateX(-50%) translateY(-20px)',
        background: 'rgba(30,27,75,0.95)',
        color: '#fff',
        borderRadius: '14px',
        padding: '12px 18px',
        maxWidth: '90vw',
        zIndex: '99999',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        display: 'flex',
        flexDirection: 'column',
        gap: '2px',
        transition: 'transform 0.28s cubic-bezier(.22,1,.36,1), opacity 0.28s ease',
        opacity: '0',
        fontSize: '14px',
        lineHeight: '1.4',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        cursor: 'pointer',
    } as unknown as CSSStyleDeclaration);

    // Build with text nodes, never innerHTML: titles/bodies can contain
    // user-written chat text.
    const titleEl = document.createElement('span');
    titleEl.style.cssText = 'font-weight:700;font-size:13px;letter-spacing:-0.01em';
    titleEl.textContent = title;
    const bodyEl = document.createElement('span');
    bodyEl.style.cssText = 'opacity:0.8;font-size:13px';
    bodyEl.textContent = body;
    toast.append(titleEl, bodyEl);

    document.body.appendChild(toast);
    // Animate in
    requestAnimationFrame(() => {
        toast.style.opacity = '1';
        toast.style.transform = 'translateX(-50%) translateY(0)';
    });

    // Auto-dismiss after 4 s
    const dismiss = () => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(-50%) translateY(-12px)';
        setTimeout(() => toast.remove(), 300);
    };
    const timer = setTimeout(dismiss, 4000);
    toast.addEventListener('click', () => { clearTimeout(timer); dismiss(); onTap?.(); });
}

// ─── Deep-link navigation ────────────────────────────────────────────────────

/** Open the Team tab (and a specific channel) from a team-chat push. */
function navigateToTeamChat(data?: Record<string, string>) {
    const channelId = data?.channelId;
    let hashPath = '/?tab=team';
    if (channelId) hashPath += `&channelId=${encodeURIComponent(channelId)}`;
    window.location.hash = hashPath;
    window.dispatchEvent(new CustomEvent('pushDeepLink', {
        detail: { tab: 'team', channelId },
    }));
}

function navigateToInbox(data?: Record<string, string>) {
    const numberId = data?.numberId;
    const conversationId = data?.conversationId;
    // HashRouter treats `window.location.hash` as the path after `#`.
    // Assigning to `.hash` automatically prepends `#`, so we provide `/?...`
    // which results in the full URL fragment `#/?tab=inbox&...`.
    let hashPath = '/?tab=inbox';
    if (numberId) hashPath += `&numberId=${encodeURIComponent(numberId)}`;
    if (conversationId) hashPath += `&conversationId=${encodeURIComponent(conversationId)}`;
    window.location.hash = hashPath;

    // Fire a custom event so MobileSmsLayout can re-read the new params
    // even when the component is already mounted (app was in background/foreground).
    window.dispatchEvent(new CustomEvent('pushDeepLink', {
        detail: { tab: 'inbox', numberId, conversationId },
    }));
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePushNotifications(user: User | null) {
    // Keep a stable ref to the latest user so listeners don't go stale
    const userRef = useRef(user);
    userRef.current = user;
    const registeredTokenRef = useRef<string | null>(null);
    const prevUserIdRef = useRef<string | null>(null);

    useEffect(() => {
        const prevUid = prevUserIdRef.current;
        const nextUid = user?.id ?? null;
        prevUserIdRef.current = nextUid;

        // Remove the registered push token from the previous user on logout/switch
        if (prevUid && prevUid !== nextUid && registeredTokenRef.current) {
            const staleToken = registeredTokenRef.current;
            registeredTokenRef.current = null;
            import('firebase/firestore').then(({ arrayRemove }) =>
                updateDoc(doc(db, 'users', prevUid), { fcmTokens: arrayRemove(staleToken) })
            ).catch(() => {});
        }

        if (!user || !Capacitor.isNativePlatform()) {
            return;
        }

        let cancelled = false;

        const registerPush = async () => {
            let permStatus = await PushNotifications.checkPermissions();
            if (cancelled) return;

            if (permStatus.receive === 'prompt') {
                permStatus = await PushNotifications.requestPermissions();
            }

            if (cancelled || permStatus.receive !== 'granted') {
                return;
            }

            if (Capacitor.getPlatform() === 'android') {
                await PushNotifications.createChannel({
                    id: 'pc_messages_channel',
                    name: 'Messages & Team Chat',
                    description: 'Incoming SMS, MMS, and Team Chat notifications',
                    importance: 4,
                    visibility: 1,
                    sound: 'default',
                }).catch(() => {});
            }

            // Register with Google (FCM) / APNs
            await PushNotifications.register();
        };

        // On success, store the FCM token against the user doc so the backend
        // can send targeted pushes to this device.
        const registrationListener = PushNotifications.addListener('registration', async (token) => {
            const currentUser = userRef.current;
            if (!currentUser) return;
            registeredTokenRef.current = token.value;
            try {
                const userDocRef = doc(db, 'users', currentUser.id);
                await updateDoc(userDocRef, {
                    fcmTokens: arrayUnion(token.value),
                });
            } catch (err) {
                // Silently log — non-fatal
                if (import.meta.env.DEV) {
                    // eslint-disable-next-line no-console
                    console.error('[Push] Failed to save FCM token:', err);
                }
            }
        });

        const errorListener = PushNotifications.addListener('registrationError', (_error) => {
            // Non-fatal — app still works without push
        });

        // Notification received while app is in the foreground → show in-app toast.
        const foregroundListener = PushNotifications.addListener('pushNotificationReceived', (notification) => {
            const data = notification.data as Record<string, string> | undefined;
            if (data?.type === 'incoming_call') return;
            // Team chat: no toast for the thread the user is already reading
            if (data?.type === 'team-chat' && data.channelId && data.channelId === activeTeamChat.channelId) return;
            const title = notification.title || 'New Message';
            const body  = notification.body  || '';
            showInAppToast(title, body, data?.type === 'team-chat' ? () => navigateToTeamChat(data) : undefined);
        });

        // User tapped a notification → deep-link into the inbox, Team Chat, Voice, or Today's Celebrations.
        const actionListener = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            const data = action.notification.data as Record<string, string> | undefined;
            if (data?.type === 'incoming_call') {
                window.dispatchEvent(new CustomEvent('voice:answerPendingCall'));
                return;
            }
            if (data?.tag === 'daily-celebrations' || data?.type === 'celebrations') {
                window.dispatchEvent(new CustomEvent('openCelebrationsModal'));
                return;
            }
            if (data?.type === 'team-chat') {
                navigateToTeamChat(data);
                return;
            }
            navigateToInbox(data);
        });

        registerPush();

        return () => {
            cancelled = true;
            registrationListener.then(l => l.remove());
            errorListener.then(l => l.remove());
            foregroundListener.then(l => l.remove());
            actionListener.then(l => l.remove());
        };
    }, [user?.id]);
}
