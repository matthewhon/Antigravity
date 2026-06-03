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
import { updatePcoSubscriptionField } from './pcoFieldData';

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

/**
 * After a people sync, attempt to resolve any pending SMS keyword subscriptions
 * whose phone numbers weren't yet matched to a PCO person.
 * For each matched record: write smsKeywordSubscriptions + update PCO checkbox + delete pending doc.
 */
async function processPendingSubscriptions(churchId: string, db: Firestore): Promise<void> {
    const snap = await db.collection('pendingSmsSubscriptions')
        .where('churchId', '==', churchId)
        .get();

    if (snap.empty) return;

    console.log(`[SyncScheduler] Processing ${snap.size} pending subscription(s) for church ${churchId}`);

    const log = { // Minimal logger compatible with createServerLogger interface
        info: (msg: string) => console.log(msg),
        warn: (msg: string) => console.warn(msg),
    };

    for (const pendingDoc of snap.docs) {
        const pending = pendingDoc.data();
        const { phoneNumber, keyword, keywordId, matchedAt } = pending;

        // Look up the person by their E.164 phone number in the freshly-synced people collection
        const personSnap = await db.collection('people')
            .where('churchId', '==', churchId)
            .where('e164Phone', '==', phoneNumber)
            .limit(1)
            .get();

        if (personSnap.empty) {
            // Still unmatched — leave in queue for the next sync
            continue;
        }

        const person = personSnap.docs[0].data();
        const personId: string = person.id;
        const personName: string | null = person.name || null;

        // Write the resolved subscription to smsKeywordSubscriptions
        const subId = `${churchId}_${personId}_${keywordId}`;
        const subRef = db.collection('smsKeywordSubscriptions').doc(subId);
        const existingSnap = await subRef.get().catch(() => null);

        if (!existingSnap?.exists) {
            await subRef.set({
                id: subId,
                churchId,
                personId,
                personName,
                phoneNumber,
                keyword,
                keywordId,
                subscribedAt: matchedAt || Date.now(),
                source: 'sms_inbound',
            }).catch((e: any) => {
                console.warn(`[SyncScheduler] Failed to write subscription ${subId}:`, e.message);
            });

            // Update the PCO checkbox
            await updatePcoSubscriptionField({
                db,
                log: { info: (m: string) => console.log(m), warn: (m: string) => console.warn(m) } as any,
                churchId,
                personId,
                keyword,
            }).catch(() => {});

            console.log(`[SyncScheduler] Resolved pending subscription: ${keyword} → person ${personId} (${personName})`);
        }

        // Remove the pending doc regardless (resolved or was already subscribed)
        await pendingDoc.ref.delete().catch(() => {});
    }
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

        // Fire-and-forget weather data sync (non-critical — don't block the main pipeline)
        const { syncWeatherData } = await import('../services/pcoSyncService.js');
        syncWeatherData(churchId).catch((e: any) => {
            console.warn(`[SyncScheduler] Weather sync failed for ${churchId} (non-fatal):`, e.message);
        });

        // Process any pending SMS keyword subscriptions whose phone numbers may
        // now be matched to a PCO person after the sync updated the people collection.
        processPendingSubscriptions(churchId, db).catch((e) => {
            console.warn(`[SyncScheduler] Pending subscription processor failed for ${churchId}:`, e.message);
        });

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
