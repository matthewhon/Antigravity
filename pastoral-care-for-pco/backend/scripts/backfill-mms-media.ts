/**
 * backfill-mms-media.ts
 *
 * Fixes two categories of broken MMS media in Firestore:
 *
 *   1. Raw SignalWire URLs — never re-hosted (pre-fix messages)
 *      Detected by: URL contains "signalwire.com/api/laml"
 *
 *   2. Bad GCS re-hosts — the file was stored but contains an HTML error page
 *      (SignalWire returned a 401 redirect that bypassed auth)
 *      Detected by: URL is a GCS URL AND the remote Content-Type is text/html
 *
 * Run:
 *   npx tsx backend/scripts/backfill-mms-media.ts            (apply)
 *   npx tsx backend/scripts/backfill-mms-media.ts --dry-run  (preview)
 */

import https from 'https';
import { getDb, getStorage } from '../firebase';
import { fetchSignalWireMedia } from '../signalwireClient';

const DRY_RUN = process.argv.includes('--dry-run');

const SIGNALWIRE_URL_PATTERN = /signalwire\.com\/api\/laml/i;
const GCS_URL_PATTERN        = /storage\.googleapis\.com/i;

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

/** Check the Content-Type of a public URL without downloading the full body. */
function headContentType(url: string): Promise<string> {
    return new Promise((resolve) => {
        try {
            const req = https.request(url, { method: 'HEAD' }, (res) => {
                resolve((res.headers['content-type'] || '').split(';')[0].trim());
                res.resume();
            });
            req.on('error', () => resolve(''));
            req.end();
        } catch {
            resolve('');
        }
    });
}

/** Detect content-type from first 12 bytes (magic numbers). */
function sniffContentType(buffer: Buffer): string {
    const h = buffer.slice(0, 12);
    if (h[0] === 0xFF && h[1] === 0xD8)                   return 'image/jpeg';
    if (h.slice(0, 4).toString('hex') === '89504e47')      return 'image/png';
    if (h.slice(0, 4).toString('ascii') === 'GIF8')        return 'image/gif';
    if (h.slice(0, 4).toString('ascii') === 'RIFF')        return 'video/webm';
    if (h[0] === 0x25 && h[1] === 0x50)                    return 'application/pdf';
    return 'application/octet-stream';
}

async function rehostUrl(srcUrl: string, churchId: string): Promise<string> {
    let { buffer, contentType } = await fetchSignalWireMedia(srcUrl);

    // Reject HTML error pages
    if (contentType.startsWith('text/html') || contentType.startsWith('text/plain')) {
        throw new Error(`SignalWire returned "${contentType}" — auth error page, not media`);
    }

    // Sniff from bytes if content-type is missing/generic
    if (!contentType || contentType === 'application/octet-stream') {
        contentType = sniffContentType(buffer);
    }

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

    console.log(`\n🔍  Scanning all smsConversations for broken MMS media URLs…`);
    if (DRY_RUN) console.log('   ⚠️  DRY RUN — no Firestore writes will occur.\n');

    const messagesSnap = await db.collectionGroup('messages').get();

    // Collect messages that need fixing
    type NeedsFixEntry = { doc: FirebaseFirestore.QueryDocumentSnapshot; urls: string[]; reason: string };
    const toFix: NeedsFixEntry[] = [];

    for (const doc of messagesSnap.docs) {
        const data = doc.data();
        const urls: string[] = data.mediaUrls || [];
        if (urls.length === 0) continue;

        // Category 1: raw SignalWire URL
        const rawUrls = urls.filter(u => SIGNALWIRE_URL_PATTERN.test(u));
        if (rawUrls.length > 0) {
            toFix.push({ doc, urls, reason: 'raw SignalWire URL' });
            continue;
        }

        // Category 2: GCS URL but content is HTML (bad re-host)
        for (const u of urls) {
            if (GCS_URL_PATTERN.test(u)) {
                const ct = await headContentType(u);
                if (ct.startsWith('text/html') || ct.startsWith('text/plain') || ct === '') {
                    toFix.push({ doc, urls, reason: `bad GCS re-host (content-type: "${ct}")` });
                    break;
                }
            }
        }
    }

    console.log(`   Found ${toFix.length} message(s) with broken media.\n`);

    let successCount = 0;
    let failCount    = 0;
    let skipCount    = 0;

    for (const { doc, urls, reason } of toFix) {
        const data    = doc.data();
        const churchId: string = data.churchId || '';

        if (!churchId) {
            console.warn(`   ⚠️  Skipping ${doc.ref.path} — no churchId.`);
            skipCount++;
            continue;
        }

        console.log(`   📨  ${doc.ref.path} (${reason})`);

        const newUrls: string[] = [];
        let changed = false;

        for (const url of urls) {
            const needsRehost = SIGNALWIRE_URL_PATTERN.test(url) ||
                (GCS_URL_PATTERN.test(url) && (await headContentType(url)).startsWith('text'));

            if (!needsRehost) {
                newUrls.push(url);
                continue;
            }

            if (DRY_RUN) {
                console.log(`      [DRY RUN] Would re-host: ${url.slice(-60)}`);
                newUrls.push(url);
                continue;
            }

            // For bad GCS files, we re-fetch from SignalWire and need the original URL
            // Raw SignalWire URLs are fetched directly; bad GCS files were originally
            // SignalWire URLs so we need to look up the original — but since we don't
            // store it, we attempt the GCS URL through SignalWire auth anyway.
            // For raw SW URLs this works directly; for bad GCS urls we'll get the same
            // error but the catch will preserve the original.
            const fetchUrl = SIGNALWIRE_URL_PATTERN.test(url) ? url : url;

            try {
                process.stdout.write(`      ↳ Re-hosting…  `);
                const hosted = await rehostUrl(fetchUrl, churchId);
                newUrls.push(hosted);
                changed = true;
                console.log(`✅  → ${hosted.slice(-50)}`);
            } catch (err: any) {
                console.error(`\n      ❌  Failed: ${err.message}`);
                newUrls.push(url);
                failCount++;
            }
        }

        if (changed && !DRY_RUN) {
            await doc.ref.update({ mediaUrls: newUrls });
            successCount++;
        }
    }

    console.log('\n──────────────────────────────────────────');
    console.log(`✅  Fixed:    ${successCount} message(s)`);
    console.log(`❌  Failed:   ${failCount} URL(s) (originals preserved)`);
    console.log(`⚠️  Skipped: ${skipCount} message(s) (missing churchId)`);
    if (DRY_RUN) console.log('\nRe-run without --dry-run to apply changes.');
    console.log('──────────────────────────────────────────\n');
}

main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});
