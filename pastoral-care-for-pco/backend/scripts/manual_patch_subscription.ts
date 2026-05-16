/**
 * ONE-TIME SCRIPT: Manually patches the subscription for ch_v0cjkh0z1
 * Run with: npx ts-node --esm backend/scripts/manual_patch_subscription.ts
 *
 * Stripe data (confirmed from dashboard):
 *   Customer:     cus_UWoSZTA41fNHdz
 *   Subscription: sub_1TXkq0Gw5Orc3zIZiBhiEGep
 *   Plan:         starter (price_1SmgRTGw5Orc3zIZ9zTjJFxg)
 *   Period end:   1781626396 (June 16, 2026)
 */

import { getDb } from '../firebase.js';

const CHURCH_ID        = 'ch_v0cjkh0z1';
const CUSTOMER_ID      = 'cus_UWoSZTA41fNHdz';
const SUBSCRIPTION_ID  = 'sub_1TXkq0Gw5Orc3zIZiBhiEGep';
const PLAN_ID          = 'starter';
const PERIOD_END_UNIX  = 1781626396; // seconds

async function patch() {
    const db = getDb();
    const churchRef = db.collection('churches').doc(CHURCH_ID);
    const snap = await churchRef.get();

    if (!snap.exists) {
        console.error(`❌  Church ${CHURCH_ID} not found in Firestore`);
        process.exit(1);
    }

    const before = snap.data()?.subscription;
    console.log('📋  Current subscription:', JSON.stringify(before, null, 2));

    await churchRef.update({
        subscription: {
            status:           'active',
            planId:           PLAN_ID,
            customerId:       CUSTOMER_ID,
            subscriptionId:   SUBSCRIPTION_ID,
            currentPeriodEnd: PERIOD_END_UNIX * 1000, // convert to ms
        }
    });

    const after = (await churchRef.get()).data()?.subscription;
    console.log('✅  Patched subscription:', JSON.stringify(after, null, 2));
}

patch().catch(e => { console.error(e); process.exit(1); });
