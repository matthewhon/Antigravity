#!/usr/bin/env node
/**
 * fix_conversation_person_links.mjs
 *
 * Re-links smsConversations to the correct person based on phone number.
 *
 * The birthday/anniversary workflow bug caused staff members' conversation
 * records to be overwritten with the birthday/anniversary person's name and
 * personId. This script rebuilds the correct phone → person mapping from the
 * `people` collection and patches any mismatched conversations.
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync } from 'fs';

const CHURCH_ID  = 'ch_v0cjkh0z1';
const DATABASE   = 'pcforpco';
const DRY_RUN    = process.argv.includes('--dry-run');

// ── Init ──────────────────────────────────────────────────────────────────────
const KEY_PATH = new URL('../serviceAccountKey.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const credential = existsSync(KEY_PATH) ? cert(KEY_PATH) : applicationDefault();

const app = initializeApp({ credential, projectId: 'pastoral-care-for-pco' });
const db  = getFirestore(app);
db.settings({ databaseId: DATABASE, ignoreUndefinedProperties: true });

function normalisePhone(raw) {
    if (!raw) return null;
    const digits = String(raw).replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    if (digits.length > 10) return `+${digits}`;
    return null;
}

async function main() {
    console.log(`\n🔧 Fix conversation person links for ${CHURCH_ID} (${DRY_RUN ? 'DRY RUN' : 'LIVE'})\n`);

    // ── 1. Load all people for the church, build phone → person map ───────────
    console.log('📋 Loading people...');
    const peopleSnap = await db.collection('people')
        .where('churchId', '==', CHURCH_ID)
        .get();

    // phone (E.164) → { id, name, avatar }
    const phoneToPersonMap = new Map();

    for (const doc of peopleSnap.docs) {
        const p = doc.data();
        const personId   = p.id || doc.id;
        const personName = p.name || '';
        const avatar     = p.avatar || p.personAvatar || null;

        const phones = [];

        // Primary phone field
        const primary = normalisePhone(p.phone);
        if (primary) phones.push(primary);

        // phoneNumbers array (may contain objects or strings)
        if (Array.isArray(p.phoneNumbers)) {
            for (const pn of p.phoneNumbers) {
                const n = normalisePhone(typeof pn === 'object' ? (pn.number || pn.value || pn.phone) : pn);
                if (n && !phones.includes(n)) phones.push(n);
            }
        }

        for (const phone of phones) {
            if (!phoneToPersonMap.has(phone)) {
                phoneToPersonMap.set(phone, { personId, personName, avatar });
            }
        }
    }

    console.log(`   → Loaded ${peopleSnap.size} people, ${phoneToPersonMap.size} unique phone numbers\n`);

    // ── 2. Load all conversations for the church ──────────────────────────────
    console.log('💬 Loading conversations...');
    const convSnap = await db.collection('smsConversations')
        .where('churchId', '==', CHURCH_ID)
        .get();

    console.log(`   → ${convSnap.size} conversations found\n`);

    // ── 3. Find and fix mismatches ────────────────────────────────────────────
    let fixed = 0, alreadyCorrect = 0, unknown = 0;
    let currentBatch = db.batch();
    let batchCount = 0;

    for (const doc of convSnap.docs) {
        const conv = doc.data();
        const rawPhone = conv.phoneNumber;
        const e164 = normalisePhone(rawPhone);

        if (!e164) { unknown++; continue; }

        const correctPerson = phoneToPersonMap.get(e164);

        if (!correctPerson) {
            // Phone not found in people — leave alone
            unknown++;
            continue;
        }

        const currentPersonId   = conv.personId   || null;
        const currentPersonName = conv.personName || null;

        const needsFix =
            currentPersonId   !== correctPerson.personId ||
            currentPersonName !== correctPerson.personName;

        if (!needsFix) {
            alreadyCorrect++;
            continue;
        }

        console.log(`  ⚠️  ${doc.id}`);
        console.log(`       phone:        ${e164}`);
        console.log(`       was:          ${currentPersonName} (${currentPersonId})`);
        console.log(`       correct:      ${correctPerson.personName} (${correctPerson.personId})`);

        if (!DRY_RUN) {
            const patch = {
                personId:   correctPerson.personId,
                personName: correctPerson.personName,
            };
            if (correctPerson.avatar) patch.personAvatar = correctPerson.avatar;
            currentBatch.update(doc.ref, patch);
            batchCount++;

            // Firestore batches have a 500-op limit — commit and start fresh
            if (batchCount === 490) {
                await currentBatch.commit();
                console.log('\n   ✅ Intermediate batch committed (490 ops)\n');
                currentBatch = db.batch();
                batchCount = 0;
            }
        }

        fixed++;
    }

    if (!DRY_RUN && batchCount > 0) {
        await currentBatch.commit();
    }

    console.log('\n─────────────────────────────────────────');
    console.log(`  Already correct: ${alreadyCorrect}`);
    console.log(`  Fixed:           ${fixed}`);
    console.log(`  Unknown phone:   ${unknown}`);
    console.log(`  Total:           ${convSnap.size}`);
    if (DRY_RUN) console.log('\n  ⚠️  DRY RUN — no changes written. Remove --dry-run to apply.');
    else          console.log('\n  ✅ Done — all mismatched conversations re-linked.');
    console.log('─────────────────────────────────────────\n');
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
