/**
 * Seed script: Create/update the Apple review user (test@test.com) for Tenant C1.
 *
 * - Looks up Firebase Auth UID by email
 * - Creates/merges the `users/{uid}` Firestore document with Church Admin role
 * - Seeds the `smsAgentKnowledge/c1` document for the AI Agent tab
 *
 * Run with:
 *   npx tsx backend/scripts/seed-c1-user-demo.ts
 */

import { getDb } from '../firebase';
import admin from 'firebase-admin';

const CHURCH_ID = 'c1';
const DEMO_EMAIL = 'test@test.com';

async function seed() {
    // Ensure Firebase Admin is initialised (getDb() handles this)
    const db = getDb();

    console.log(`\n🌱  Seeding Apple review user for church: ${CHURCH_ID}\n`);

    // ── 1. Look up Firebase Auth UID ─────────────────────────────────────────
    console.log(`── Looking up Firebase Auth user: ${DEMO_EMAIL} ──`);
    let uid: string;
    try {
        const authUser = await admin.auth().getUserByEmail(DEMO_EMAIL);
        uid = authUser.uid;
        console.log(`  ✔ Found UID: ${uid}`);
    } catch (e: any) {
        console.error(`  ✗ Could not find Firebase Auth user with email ${DEMO_EMAIL}:`, e.message);
        console.error('    Make sure the user is created in Firebase Authentication first.');
        process.exit(1);
    }

    // ── 2. Create/update Firestore user document ──────────────────────────────
    console.log('\n── users collection ──');
    await db.collection('users').doc(uid).set({
        id: uid,
        churchId: CHURCH_ID,
        email: DEMO_EMAIL,
        name: 'Apple Reviewer',
        // Church Admin gives access to every module (all nav items, all SMS tabs)
        roles: ['Church Admin', 'Messaging'],
        theme: 'traditional',
        // Pre-set lastLogin so the first-login AI layout modal never fires
        lastLogin: 1748000000000,
        // Pre-set widgetPreferences so the modal is skipped entirely
        widgetPreferences: {
            dashboard: ['attendance', 'giving', 'people', 'groups'],
        },
    }, { merge: true });
    console.log(`  ✔ users/${uid}  (${DEMO_EMAIL})`);

    // ── 3. Seed smsAgentKnowledge for the AI Agent tab ────────────────────────
    console.log('\n── smsAgentKnowledge ──');
    await db.collection('smsAgentKnowledge').doc(CHURCH_ID).set({
        churchId: CHURCH_ID,
        // Core church facts the AI uses to answer incoming texts
        churchName: 'Grace Community Church',
        address: '123 Grace Ave, Springfield, TX 75001',
        phone: '(555) 001-0001',
        website: 'https://gracecc.com',
        serviceTimes: 'Sundays 9 AM & 11 AM · Wednesdays 7 PM',
        pastor: 'Pastor James Wilson — 15 years at Grace Community',
        ministries: [
            'Youth Ministry (Grades 6–12)',
            "Women's Ministry",
            "Men's Bible Study",
            'Young Adults (Ages 18–30)',
            'Kids Church (Ages 4–11)',
            'Community Food Pantry (Thursdays 10 AM–2 PM)',
        ],
        parkingInfo: 'Free on-site parking. Accessible spaces near main entrance.',
        kidsMinistry: 'Kids Church available at both Sunday services (ages 4–11). Nursery available for infants.',
        customFacts: [
            'First-time visitors receive a free Welcome Gift at the Welcome Center.',
            'Online giving available at gracecc.com/give or text GIVE to (555) 001-0001.',
            'Prayer requests can be submitted by texting PRAYER to (555) 001-0001.',
            'Our live-stream is at gracecc.com/live every Sunday at 11 AM.',
        ],
        // AI agent behaviour settings
        agentEnabled: true,
        agentPersonality: 'warm, welcoming, concise',
        agentSignature: '— Grace Community',
        updatedAt: Date.now(),
    }, { merge: true });
    console.log(`  ✔ smsAgentKnowledge/${CHURCH_ID}`);

    // ── Done ──────────────────────────────────────────────────────────────────
    console.log(`
✅  Done! Apple review account is ready.

   Email : ${DEMO_EMAIL}
   UID   : ${uid}
   Church: ${CHURCH_ID} (Grace Community)
   Roles : Church Admin, Messaging

   The user will land on /mobile/sms and see:
     • 5 pre-loaded inbox conversations
     • 3 broadcast campaigns
     • 4 keywords
     • 2 workflows
     • AI Agent knowledge base populated
`);
    process.exit(0);
}

seed().catch(e => {
    console.error('\n❌  Error:', e?.message || e);
    process.exit(1);
});
