import { getAuth } from 'firebase/auth';

/**
 * Returns headers with `Content-Type: application/json` and, when a Firebase user
 * is signed in on the client, `Authorization: Bearer <ID token>`.
 */
export async function getAuthJsonHeaders(extra: Record<string, string> = {}): Promise<Record<string, string>> {
    const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        ...extra,
    };
    if (typeof window !== 'undefined') {
        try {
            const token = await getAuth().currentUser?.getIdToken();
            if (token) {
                headers.Authorization = `Bearer ${token}`;
            }
        } catch {
            // Leave unauthenticated if Firebase Auth is not initialized or user is signed out
        }
    }
    return headers;
}
