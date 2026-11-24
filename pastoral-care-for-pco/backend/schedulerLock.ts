import type { Firestore } from 'firebase-admin/firestore';

/**
 * Acquires a distributed Firestore lease lock in `system_locks/{lockKey}`.
 * Returns `true` if this instance acquired the lock (and should run the job),
 * or `false` if another instance already holds a valid unexpired lease.
 */
export async function acquireDistributedLock(
    db: Firestore,
    lockKey: string,
    ttlMs: number
): Promise<boolean> {
    const lockRef = db.collection('system_locks').doc(lockKey);
    const now = Date.now();
    try {
        return await db.runTransaction(async (tx) => {
            const snap = await tx.get(lockRef);
            const data = snap.data();
            if (snap.exists && data && typeof data.expiresAt === 'number' && data.expiresAt > now) {
                return false;
            }
            tx.set(lockRef, {
                acquiredAt: now,
                expiresAt: now + ttlMs,
            });
            return true;
        });
    } catch (e) {
        console.warn(`[SchedulerLock] Failed to acquire lock ${lockKey}:`, e);
        return false;
    }
}
