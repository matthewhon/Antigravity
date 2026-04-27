/**
 * syncScheduler.ts
 * ─────────────────
 * Runs every minute, reads each church's `scheduledSyncTime` from Firestore,
 * and triggers a full sync when the current time matches that schedule.
 *
 * ⚠️  TIME ZONE NOTE:
 *   Cloud Run servers run in UTC.  `scheduledSyncTime` stored in Firestore
 *   must therefore be in UTC (e.g. "08:00" for 3 AM US/Eastern).
 *   The admin UI label has been updated to remind admins of this.
 *   We use getUTC* methods explicitly so the behaviour is identical whether
 *   the server's TZ env-var is set or not.
 *
 * ⚠️  SCALING NOTE:
 *   This scheduler relies on the Cloud Run container staying alive.
 *   The cloudbuild.yaml must set --min-instances 1 so the container never
 *   scales to zero between sync windows.
 */

import type { Firestore } from 'firebase-admin/firestore';

let schedulerInterval: ReturnType<typeof setInterval> | null = null;

// Track which churchIds have already been synced today so we don't double-fire
// key = `${churchId}_${UTC-date-string}`
const syncedToday = new Map<string, string>();

/** Returns a UTC date string like "2025-3-15" — resets at UTC midnight */
function getTodayUTCKey(): string {
    const d = new Date();
    return `${d.getUTCFullYear()}-${d.getUTCMonth()}-${d.getUTCDate()}`;
}

/** Returns current UTC time as "HH:MM" */
function getCurrentUTCHHMM(): string {
    const now = new Date();
    const hh = String(now.getUTCHours()).padStart(2, '0');
    const mm = String(now.getUTCMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
}

async function triggerSyncForChurch(churchId: string, db: Firestore): Promise<void> {
    try {
        console.log(`[SyncScheduler] Triggering scheduled sync for church ${churchId}`);

        // Pre-flight: verify the church still has valid PCO tokens before spending
        // time kicking off a full sync that will fail at the proxy layer anyway.
        const churchDoc = await db.collection('churches').doc(churchId).get();
        const churchData = churchDoc.data();
        if (!churchData?.pcoAccessToken || !churchData?.pcoRefreshToken) {
            const msg = 'Scheduled sync skipped — PCO tokens are missing. Reconnect Planning Center in Settings → Planning Center Integration.';
            console.warn(`[SyncScheduler] ${msg} (${churchId})`);
            await db.collection('logs').add({
                level: 'warn',
                source: 'sync',
                message: msg,
                churchId,
                timestamp: Date.now(),
                details: JSON.stringify({ trigger: 'scheduled', reason: 'missing_tokens' }),
            });
            return;
        }

        // Dynamically import the sync function to avoid circular deps at startup
        const { syncAllData } = await import('../services/pcoSyncService.js');
        await syncAllData(churchId);

        console.log(`[SyncScheduler] Scheduled sync complete for church ${churchId}`);

        // Log into Firestore
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

    console.log('[SyncScheduler] Sync scheduler started — checking every minute (UTC comparison).');

    // Bug fix: do NOT capture todayKey at startup — recalculate each tick so the
    // midnight-reset logic works correctly after the server has been running for days.
    let lastDayKey = getTodayUTCKey();
    let tickCount = 0;

    schedulerInterval = setInterval(async () => {
        tickCount++;
        const currentDayKey = getTodayUTCKey();

        // Reset the "already synced" tracker when UTC date rolls over
        if (currentDayKey !== lastDayKey) {
            syncedToday.clear();
            lastDayKey = currentDayKey;
        }

        // Heartbeat log every 10 minutes — proves the scheduler is alive.
        // Visible in Settings → System Configuration → Logging (filter source: sync).
        if (tickCount % 10 === 0) {
            try {
                await db.collection('logs').add({
                    level: 'info',
                    source: 'sync',
                    message: `Sync scheduler heartbeat — tick ${tickCount}, UTC ${getCurrentUTCHHMM()}`,
                    churchId: 'system',
                    timestamp: Date.now(),
                    details: JSON.stringify({ trigger: 'heartbeat', pendingToday: syncedToday.size }),
                });
            } catch { /* best-effort — don't let logging crash the scheduler */ }
        }

        const currentTime = getCurrentUTCHHMM();

        try {
            const snapshot = await db.collection('churches')
                .where('pcoConnected', '==', true)
                .get();

            for (const doc of snapshot.docs) {
                const church = doc.data();
                const churchId = doc.id;

                // `scheduledSyncTime` is the canonical field (set by the Planning Center tab UI).
                // It must be stored in UTC (HH:MM).
                const scheduledTime: string | undefined = church.scheduledSyncTime;

                if (!scheduledTime) continue;

                // Normalize to HH:MM (trim seconds if stored as HH:MM:SS)
                const normalizedSchedule = scheduledTime.substring(0, 5);

                if (normalizedSchedule !== currentTime) continue;

                // Only fire once per UTC day per church
                const alreadySyncedKey = `${churchId}_${currentDayKey}`;
                if (syncedToday.has(alreadySyncedKey)) continue;

                syncedToday.set(alreadySyncedKey, currentTime);

                console.log(`[SyncScheduler] Match! Firing sync for ${churchId} at UTC ${currentTime}`);

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
