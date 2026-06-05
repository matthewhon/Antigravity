/**
 * Migration script: Fix corrupted "Needs Prayer" tag emoji
 *
 * The smsInbound.ts handler previously stored the praying-hands emoji as
 * mojibake ('Ã°Å¸â„¢Â' or similar garbled text) due to a UTF-8 encoding issue.
 * This script finds all "Needs Prayer" tags across every church and replaces
 * any non-🙏 emoji value with the correct '🙏' character.
 *
 * Usage:
 *   npx ts-node backend/scripts/fix-prayer-tag-emoji.ts
 *
 * Safe to run multiple times — it only updates docs that need fixing.
 */

import { getDb } from '../firebase';

async function main() {
    const db = getDb();

    // Find all "Needs Prayer" tags across all churches
    const snap = await db.collection('smsTags')
        .where('name', '==', 'Needs Prayer')
        .get();

    if (snap.empty) {
        console.log('No "Needs Prayer" tags found in Firestore. Nothing to fix.');
        return;
    }

    let fixed = 0;
    let alreadyCorrect = 0;

    for (const doc of snap.docs) {
        const data = doc.data();
        const currentEmoji = data.emoji;

        if (currentEmoji === '🙏') {
            alreadyCorrect++;
            console.log(`  ✓ ${doc.id} (church: ${data.churchId}) — already correct`);
            continue;
        }

        // Fix the corrupted emoji
        await db.collection('smsTags').doc(doc.id).update({ emoji: '🙏' });
        fixed++;
        console.log(`  🔧 ${doc.id} (church: ${data.churchId}) — fixed: "${currentEmoji}" → "🙏"`);
    }

    console.log(`\nDone! ${fixed} tag(s) fixed, ${alreadyCorrect} already correct.`);
}

main().catch(console.error);
