/**
 * backfill-mms-media.ts
 *
 * One-shot migration: finds every smsConversation message that still has a raw
 * SignalWire media URL (i.e. contains "signalwire.com/api/laml") and re-hosts
 * it to Firebase Storage, then updates the Firestore document in place.
 *
 * Run with:
 *   npx ts-node -e "require('./backend/scripts/backfill-mms-media.ts')"
 *   OR via the npm script shortcut:
 *   npx tsx backend/scripts/backfill-mms-media.ts
 */

import { getDb, getStorage } from '../firebase';
import { fetchSignalWireMedia } from '../signalwireClient';

const DRY_RUN = process.argv.includes('--dry-run'); // pass --dry-run to preview without writing

const SIGNALWIRE_URL_PATTERN = /signalwire\.com\/api\/laml/i;

const EXT_MAP: Record<string, string> = {
    'image/jpeg':       '.jpg',
    'image/jpg':        '.jpg',
    'image/png':        '.png',
    'image/gif':        '.gif',
    'image/webp':       '.webp',
    'image/heic':       '.heic',
    'video/mp4':        '.mp4',
    'video/quicktime':  '.mov',
    'audio/mpeg':       '.mp3',
    'audio/ogg':        '.ogg',
    'application/pdf':  '.pdf',
};

async function rehostUrl(srcUrl: string, churchId: string): Promise<string> {
    const { buffer, contentType } = await fetchSignalWireMedia(srcUrl);
    const ext  = EXT_MAP[contentType] || '';
    const name = `sms-media/${churchId}/${Date.now()}_${Math.random().toString(36).slice(2, 8)}${ext}`;

    const storage = getStorage();
    const bucket  = storage.bucket();
    const file    = bucket.file(name);

    await file.save(buffer, { metadata: { contentType }, resumable: false });
    await file.makePublic();

    return `https://storage.googleapis.com/${bucket.name}/${name}`;
}

async function main() {
    const db = getDb();

    console.log(`\n🔍  Scanning all smsConversations for raw SignalWire media URLs…`);
    if (DRY_RUN) console.log('   ⚠️  DRY RUN — no Firestore writes will occur.\n');

    // Fetch all messages across all conversations (no index needed — filter in JS)
    const messagesSnap = await db.collectionGroup('messages').get();

    const affected: FirebaseFirestore.QueryDocumentSnapshot[] = [];

    for (const doc of messagesSnap.docs) {
        const data = doc.data();
        const urls: string[] = data.mediaUrls || [];
        // Only inbound messages can have raw SignalWire URLs; outbound use Firebase Storage already
        if (data.direction === 'inbound' && urls.some(u => SIGNALWIRE_URL_PATTERN.test(u))) {
            affected.push(doc);
        }
    }

    console.log(`   Found ${affected.length} message(s) with raw SignalWire URLs.\n`);

    let successCount = 0;
    let failCount    = 0;
    let skipCount    = 0;

    for (const doc of affected) {
        const data    = doc.data();
        const urls: string[] = data.mediaUrls || [];
        const churchId: string = data.churchId || '';

        if (!churchId) {
            console.warn(`   ⚠️  Skipping ${doc.ref.path} — no churchId on document.`);
            skipCount++;
            continue;
        }

        const newUrls: string[] = [];
        let changed = false;

        for (const url of urls) {
            if (!SIGNALWIRE_URL_PATTERN.test(url)) {
                // Already a public URL (GCS or otherwise) — keep as-is
                newUrls.push(url);
                continue;
            }

            try {
                if (DRY_RUN) {
                    console.log(`   [DRY RUN] Would re-host: ${url}`);
                    newUrls.push(url);
                } else {
                    process.stdout.write(`   ↳ Re-hosting ${url.slice(-40)}… `);
                    const hosted = await rehostUrl(url, churchId);
                    newUrls.push(hosted);
                    changed = true;
                    console.log(`✅  → ${hosted}`);
                }
            } catch (err: any) {
                console.error(`\n   ❌  Failed to re-host ${url}: ${err.message}`);
                newUrls.push(url); // keep original so message isn't corrupted
                failCount++;
            }
        }

        if (changed && !DRY_RUN) {
            await doc.ref.update({ mediaUrls: newUrls });
            successCount++;
        }
    }

    console.log('\n──────────────────────────────────────────');
    console.log(`✅  Re-hosted:  ${successCount} message(s)`);
    console.log(`❌  Failed:     ${failCount} URL(s) (originals preserved)`);
    console.log(`⚠️  Skipped:   ${skipCount} message(s) (missing churchId)`);
    if (DRY_RUN) console.log('\nRe-run without --dry-run to apply changes.');
    console.log('──────────────────────────────────────────\n');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
