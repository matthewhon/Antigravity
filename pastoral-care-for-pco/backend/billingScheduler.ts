import type { Firestore } from 'firebase-admin/firestore';
import { getStorage } from './firebase.js';

let schedulerInterval: ReturnType<typeof setInterval> | null = null;
const processedToday = new Set<string>();

/** Returns a UTC date string like "2025-03-15" */
function getTodayUTCKey(): string {
    const d = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

async function aggregateStorageForTenant(churchId: string, db: Firestore, todayStr: string): Promise<void> {
    try {
        console.log(`[BillingScheduler] Aggregating storage for church ${churchId}`);
        const filesSnap = await db.collection('tenantFiles').where('churchId', '==', churchId).get();
        
        let totalBytes = 0;
        filesSnap.forEach(doc => {
            totalBytes += doc.data().sizeBytes || 0;
        });

        const usageId = `${churchId}_${todayStr}`;
        const usageRef = db.collection('billingUsage').doc(usageId);
        
        await usageRef.set({
            id: usageId,
            churchId,
            date: todayStr,
            storageBytes: totalBytes
        }, { merge: true }); // Merge so we don't overwrite egressBytes if it already exists

        console.log(`[BillingScheduler] Church ${churchId} storage: ${totalBytes} bytes`);
    } catch (e: any) {
        console.error(`[BillingScheduler] Storage aggregation failed for church ${churchId}:`, e);
    }
}

export function startBillingScheduler(db: Firestore): void {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
    }

    console.log('[BillingScheduler] Started — checking daily at UTC midnight.');

    let lastDayKey = getTodayUTCKey();

    schedulerInterval = setInterval(async () => {
        const currentDayKey = getTodayUTCKey();

        // Run aggregation once per UTC day
        if (currentDayKey !== lastDayKey) {
            processedToday.clear();
            lastDayKey = currentDayKey;
            
            try {
                // Get all active churches
                const snapshot = await db.collection('churches').get();
                for (const doc of snapshot.docs) {
                    const churchId = doc.id;
                    if (processedToday.has(churchId)) continue;
                    
                    processedToday.add(churchId);
                    
                    // Fire without awaiting to not block the loop
                    aggregateStorageForTenant(churchId, db, currentDayKey).catch((e) => {
                        console.error(`[BillingScheduler] Unhandled error for ${churchId}:`, e);
                    });
                }
            } catch (e) {
                console.error('[BillingScheduler] Error querying churches:', e);
            }
        }
    }, 60_000 * 10); // Check every 10 minutes to see if UTC date rolled over
}

export function stopBillingScheduler(): void {
    if (schedulerInterval) {
        clearInterval(schedulerInterval);
        schedulerInterval = null;
        console.log('[BillingScheduler] Stopped.');
    }
}
