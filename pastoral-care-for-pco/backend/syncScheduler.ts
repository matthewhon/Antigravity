/**
 * syncScheduler.ts
 * ─────────────────
 * Runs every minute, reads each church's `scheduledSyncTime` from Firestore,
 * and triggers a full sync when the current time matches that schedule.
 *
 * Mirrors the pattern used by emailScheduler.ts.
 */

import type { Firestore } from 'firebase-admin/firestore';

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

// Track which churchIds have already been synced today so we don't double-fire
const syncedToday = new Map<string, string>(); // churchId → "HH:MM" last fired

function getTodayKey(): string {
    const d = new Date();
    return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

function getCurrentHHMM(): string {
    const now = new Date();
    const hh = String(now.getHours()).padStart(2, '0');
    const mm = String(now.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

async function triggerSyncForChurch(churchId: string, db: Firestore): Promise<void> {
    try {
        console.log(`[SyncScheduler] Triggering scheduled sync for church ${churchId}`);

        // Dynamically import the sync function to avoid circular deps at startup
        const { syncAllData } = await import('../services/pcoSyncService.js');
        await syncAllData(churchId);

        console.log(`[SyncScheduler] Scheduled sync complete for church ${churchId}`);

        // Log into system logs
        await db.collection('logs').add({
            level: 'info',
            source: 'sync',
            message: 'Scheduled automated sync completed',
            churchId,
            timestamp: Date.now(),
            details: JSON.stringify({ trigger: 'scheduled' }),
        });
    } catch (e: any) {
        console.error(`[SyncScheduler] Sync failed for church ${churchId}:`, e);
        try {
            await db.collection('logs').add({
                level: 'error',
                source: 'sync',
                message: `Scheduled sync failed: ${e.message}`,
                churchId,
                timestamp: Date.now(),
                details: JSON.stringify({ trigger: 'scheduled', error: e.message }),
            });
        } catch { /* best-effort logging */ }
    }
}

export function startSyncScheduler(db: Firestore): void {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
    }

    console.log('[SyncScheduler] Sync scheduler started — checking every minute.');

    // Reset the "already synced" map at midnight
    const todayKey = getTodayKey();

    schedulerInterval = setInterval(async () => {
        const currentKey = getTodayKey();
        // Reset tracker if a new day has started
        if (currentKey !== todayKey) {
            syncedToday.clear();
        }

        const currentTime = getCurrentHHMM();

        try {
            const snapshot = await db.collection('churches')
                .where('pcoConnected', '==', true)
                .get();

            for (const doc of snapshot.docs) {
                const church = doc.data();
                const churchId = doc.id;
                const scheduledTime: string | undefined = church.scheduledSyncTime;

                if (!scheduledTime) continue;

                // Normalize to HH:MM (trim seconds if someone stored HH:MM:SS)
                const normalizedSchedule = scheduledTime.substring(0, 5);

                if (normalizedSchedule !== currentTime) continue;

                // Only fire once per day per church
                const alreadySyncedKey = `${churchId}_${currentKey}`;
                if (syncedToday.has(alreadySyncedKey)) continue;

                syncedToday.set(alreadySyncedKey, currentTime);

                // Fire without awaiting — do not block the scheduler loop
                triggerSyncForChurch(churchId, db).catch((e) => {
                    console.error(`[SyncScheduler] Unhandled sync error for ${churchId}:`, e);
                });
            }
        } catch (e) {
            console.error('[SyncScheduler] Error querying churches:', e);
        }
    }, 60_000); // Check once per minute
}

export function stopSyncScheduler(): void {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('[SyncScheduler] Scheduler stopped.');
    }
}
