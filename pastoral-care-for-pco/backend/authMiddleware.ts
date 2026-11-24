import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { getAuth } from 'firebase-admin/auth';
import { getDb } from './firebase';

// Per-process secret used only by in-process server sync loops (never exposed to clients)
const INTERNAL_SYNC_TOKEN = crypto.randomBytes(32).toString('hex');
(globalThis as any).__internalSyncToken = INTERNAL_SYNC_TOKEN;

function isValidInternalSyncRequest(req: Request): boolean {
    const headerVal = String(req.headers['x-internal-sync'] || '');
    if (!headerVal || headerVal.length !== INTERNAL_SYNC_TOKEN.length) return false;
    return crypto.timingSafeEqual(Buffer.from(headerVal, 'utf8'), Buffer.from(INTERNAL_SYNC_TOKEN, 'utf8'));
}

export interface AuthUser {
    uid: string;
    email?: string;
    name?: string;
}

/**
 * Verifies a Firebase ID token from the `Authorization: Bearer <token>` header.
 * Returns null if the header is missing, malformed, or invalid.
 */
export async function verifyBearerUser(req: Request): Promise<AuthUser | null> {
    const authHeader = String(req.headers?.authorization || (req.headers as any)?.Authorization || '');
    if (!authHeader.startsWith('Bearer ')) return null;
    const idToken = authHeader.slice(7).trim();
    if (!idToken) return null;
    try {
        // Ensure Firebase Admin app is initialized before calling getAuth()
        getDb();
        const decoded = await getAuth().verifyIdToken(idToken);
        return { uid: decoded.uid, email: decoded.email, name: decoded.name };
    } catch {
        return null;
    }
}

/**
 * Express middleware requiring a valid Firebase ID token.
 * Attaches the decoded user to `(req as any).authUser`.
 */
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
    const user = await verifyBearerUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized: valid Firebase ID token required' });
    }
    (req as any).authUser = user;
    return next();
}

/**
 * Express middleware requiring a valid Firebase ID token AND the `System Administration` role
 * on the caller's Firestore `users/{uid}` document.
 */
export async function requireSystemAdmin(req: Request, res: Response, next: NextFunction) {
    const user = await verifyBearerUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized: valid Firebase ID token required' });
    }
    try {
        const userSnap = await getDb().collection('users').doc(user.uid).get();
        const roles: string[] = Array.isArray(userSnap.data()?.roles) ? userSnap.data()!.roles : [];
        if (!roles.includes('System Administration')) {
            return res.status(403).json({ error: 'Forbidden: System Administration role required' });
        }
        (req as any).authUser = user;
        return next();
    } catch (e: any) {
        console.error('[authMiddleware] Failed to verify System Administration role:', e?.message || e);
        return res.status(500).json({ error: 'Failed to verify user permissions' });
    }
}

/**
 * Express middleware requiring a valid Firebase ID token AND membership in the target `churchId`
 * (or the `System Administration` role). Reads `churchId` from `req.body.churchId` or `req.query.churchId`.
 */
export async function requireChurchMember(req: Request, res: Response, next: NextFunction) {
    if (isValidInternalSyncRequest(req)) {
        return next();
    }
    const user = await verifyBearerUser(req);
    if (!user) {
        return res.status(401).json({ error: 'Unauthorized: valid Firebase ID token required' });
    }
    const churchId = String(req.body?.churchId || req.query?.churchId || '').trim();
    if (!churchId) {
        return res.status(400).json({ error: 'Missing churchId' });
    }
    try {
        const userSnap = await getDb().collection('users').doc(user.uid).get();
        const userData = userSnap.data();
        const roles: string[] = Array.isArray(userData?.roles) ? userData!.roles : [];
        const isSysAdmin = roles.includes('System Administration');
        if (!isSysAdmin && userData?.churchId !== churchId) {
            return res.status(403).json({ error: 'Forbidden: you do not have access to this church' });
        }
        (req as any).authUser = user;
        return next();
    } catch (e: any) {
        console.error('[authMiddleware] Failed to verify church membership:', e?.message || e);
        return res.status(500).json({ error: 'Failed to verify church membership' });
    }
}
