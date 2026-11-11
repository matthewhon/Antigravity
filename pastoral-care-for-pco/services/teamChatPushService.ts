import { auth } from './firebase';

/**
 * Ask the backend to send native (FCM) push notifications for a Team Chat
 * message the current user just sent. Fire-and-forget: never throws, never
 * blocks the UI. The server re-validates the sender and derives recipients
 * from Firestore (see backend/teamChatNotify.ts).
 *
 * Only call this for the user's OWN messages — not AI replies or automated
 * briefings (the server ignores those anyway).
 */
export function notifyTeamChatPush(messageId: string): void {
    const user = auth.currentUser;
    if (!user || !messageId) return;

    user.getIdToken()
        .then(token =>
            fetch('/api/team-chat/notify', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({ messageId }),
            })
        )
        .catch(() => {});
}
