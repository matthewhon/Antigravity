// ─── Service Worker for Web Push Notifications ───────────────────────────────
// Handles push events (shows notification) and notificationclick (opens the app).
// This file must be served from the root of the domain (public/sw.js → /sw.js).

const APP_URL = self.location.origin;

// ── Push received ─────────────────────────────────────────────────────────────
self.addEventListener('push', (event) => {
    if (!event.data) return;

    let payload = { title: 'New SMS', body: 'You have a new text message.', url: '/mobile/sms', tag: 'sms-new' };
    try {
        payload = { ...payload, ...event.data.json() };
    } catch {
        payload.body = event.data.text();
    }

    event.waitUntil(
        self.registration.showNotification(payload.title, {
            body:    payload.body,
            icon:    '/icon-192.png',
            badge:   '/badge-72.png',
            tag:     payload.tag || 'sms-new',
            data:    { url: payload.url || '/mobile/sms' },
            renotify: true,
            vibrate: [200, 100, 200],
        })
    );
});

// ── Notification clicked → open / focus the app ───────────────────────────────
self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const targetUrl = (event.notification.data && event.notification.data.url)
        ? APP_URL + event.notification.data.url
        : APP_URL + '/mobile/sms';

    event.waitUntil(
        clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windowClients) => {
            // If a tab for this app is already open, focus and navigate it
            for (const client of windowClients) {
                if (client.url.startsWith(APP_URL) && 'focus' in client) {
                    client.navigate(targetUrl);
                    return client.focus();
                }
            }
            // Otherwise open a new window
            if (clients.openWindow) {
                return clients.openWindow(targetUrl);
            }
        })
    );
});

// ── Activate: take control immediately ────────────────────────────────────────
self.addEventListener('activate', (event) => {
    event.waitUntil(clients.claim());
});
