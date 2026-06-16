import { useEffect, useRef } from 'react';
import { PushNotifications } from '@capacitor/push-notifications';
import { Capacitor } from '@capacitor/core';
import { doc, updateDoc, arrayUnion } from 'firebase/firestore';
import { db } from '../services/firebase';
import { User } from '../types';

// ─── Foreground notification toast ──────────────────────────────────────────

function showInAppToast(title: string, body: string) {
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

    toast.innerHTML = `
        <span style="font-weight:700;font-size:13px;letter-spacing:-0.01em">${title}</span>
        <span style="opacity:0.8;font-size:13px">${body}</span>
    `;

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
    toast.addEventListener('click', () => { clearTimeout(timer); dismiss(); });
}

// ─── Deep-link navigation ────────────────────────────────────────────────────

function navigateToInbox(data?: Record<string, string>) {
    const numberId = data?.numberId;
    const conversationId = data?.conversationId;
    let hash = '#/?tab=inbox';
    if (numberId) hash += `&numberId=${encodeURIComponent(numberId)}`;
    if (conversationId) hash += `&conversationId=${encodeURIComponent(conversationId)}`;
    // HashRouter: set the hash directly so React Router picks it up
    window.location.hash = hash.replace('#/', '');
    window.dispatchEvent(new PopStateEvent('popstate'));
}

// ─── Hook ────────────────────────────────────────────────────────────────────

export function usePushNotifications(user: User | null) {
    // Keep a stable ref to the latest user so listeners don't go stale
    const userRef = useRef(user);
    userRef.current = user;

    useEffect(() => {
        if (!user || !Capacitor.isNativePlatform()) {
            return;
        }

        const registerPush = async () => {
            let permStatus = await PushNotifications.checkPermissions();

            if (permStatus.receive === 'prompt') {
                permStatus = await PushNotifications.requestPermissions();
            }

            if (permStatus.receive !== 'granted') {
                return;
            }

            // Register with Google (FCM)
            await PushNotifications.register();
        };

        // On success, store the FCM token against the user doc so the backend
        // can send targeted pushes to this device.
        const registrationListener = PushNotifications.addListener('registration', async (token) => {
            const currentUser = userRef.current;
            if (!currentUser) return;
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
            const title = notification.title || 'New Message';
            const body  = notification.body  || '';
            showInAppToast(title, body);
        });

        // User tapped a notification → deep-link into the inbox.
        const actionListener = PushNotifications.addListener('pushNotificationActionPerformed', (action) => {
            const data = action.notification.data as Record<string, string> | undefined;
            navigateToInbox(data);
        });

        registerPush();

        return () => {
            registrationListener.then(l => l.remove());
            errorListener.then(l => l.remove());
            foregroundListener.then(l => l.remove());
            actionListener.then(l => l.remove());
        };
    }, [user]);
}
