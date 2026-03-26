/**
 * migrateCommentaries.ts  (Cloud Shell edition)
 *
 * Downloads commentary data from HistoricalChristianFaith/Commentaries-Database
 * and uploads it to Firestore as scripture_commentaries/{Book}_{chapter}_{verse}.
 *
 * ── USAGE IN GOOGLE CLOUD SHELL ────────────────────────────────────────────
 * 1. Open Cloud Shell in your Firebase project's GCP console.
 * 2. Upload this file (or clone your repo).
 * 3. Run:
 *      gcloud auth application-default login
 *      npm install firebase-admin node-fetch tsx   (if not installed)
 *      FIREBASE_PROJECT_ID=your-project-id npx tsx migrateCommentaries.ts
 * ────────────────────────────────────────────────────────────────────────────
 *
 * ── USAGE LOCALLY ───────────────────────────────────────────────────────────
 * Set environment variable OR place serviceAccountKey.json in same directory.
 *   npx tsx scripts/migrateCommentaries.ts
 * ────────────────────────────────────────────────────────────────────────────
 */

import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ─── Config ───────────────────────────────────────────────────────────────────

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || (() => {
  // Try to read from .firebaserc
  const rcPath = path.join(__dirname, '..', '.firebaserc');
  if (fs.existsSync(rcPath)) {
    const rc = JSON.parse(fs.readFileSync(rcPath, 'utf8'));
    return rc.projects?.default || rc.projects?.production;
  }
  return null;
})();

const COLLECTION = 'scripture_commentaries';
const CHUNK_SIZE = 450;
const CACHE_PATH = '/tmp/commentaries-cache.json';

// Author folder names → Firestore field names
const AUTHOR_MAP: Record<string, string> = {
  'Albert Barnes':     'barnes',
  'Adam Clarke':       'clarke',
  'John Gill':         'gill',
  'Pulpit Commentary': 'pulpit',
};

// ─── Init Firebase Admin ──────────────────────────────────────────────────────

async function initFirebase() {
  const admin = (await import('firebase-admin')).default;
  if (admin.apps.length) return admin.firestore();

  const keyPath = path.join(__dirname, '..', 'serviceAccountKey.json');

  if (fs.existsSync(keyPath)) {
    // Local: use service account key
    const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
    admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('  Auth: service account key');
  } else if (PROJECT_ID) {
    // Cloud Shell: use Application Default Credentials
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId: PROJECT_ID,
    });
    console.log(`  Auth: Application Default Credentials (project: ${PROJECT_ID})`);
  } else {
    throw new Error(
      'No credentials found. Either:\n' +
      '  (A) Place serviceAccountKey.json in the project root, OR\n' +
      '  (B) Set FIREBASE_PROJECT_ID env var and run: gcloud auth application-default login'
    );
  }

  return admin.firestore();
}

// ─── Fetch commentary data from GitHub API ────────────────────────────────────

interface CommentaryRecord {
  author: string;
  docId: string;  // e.g. "John_3_16"
  text: string;
}

async function fetchAuthorEntries(authorFolder: string, fieldName: string): Promise<CommentaryRecord[]> {
  const records: CommentaryRecord[] = [];
  const apiBase = 'https://api.github.com/repos/HistoricalChristianFaith/Commentaries-Database/contents';
  const headers = { 'User-Agent': 'pastoral-care-migration', Accept: 'application/vnd.github.v3+json' };

  // Fetch book list for this author
  const folderRes = await fetch(`${apiBase}/${encodeURIComponent(authorFolder)}`, { headers });
  if (!folderRes.ok) {
    console.warn(`    Skipping ${authorFolder} — folder not found in repo`);
    return records;
  }

  const bookFolders = await folderRes.json() as any[];
  const booksToProcess = bookFolders.filter((b: any) => b.type === 'dir' || b.type === 'file');

  for (const item of booksToProcess) {
    let files: any[];

    if (item.type === 'dir') {
      // Files are inside a book subdirectory
      const bookRes = await fetch(item.url, { headers });
      if (!bookRes.ok) continue;
      files = await bookRes.json() as any[];
    } else {
      // Flat structure — item is the file
      files = [item];
    }

    for (const file of files) {
      if (!file.name?.endsWith('.toml')) continue;

      // Parse: "John 3_16.toml" or "1 John 3_16.toml"
      const nameNoExt = file.name.replace(/\.toml$/, '');
      // Match "Book Chapter_Verse" or "Book Chapter_Verse-Verse"
      const match = nameNoExt.match(/^(.+?)\s+(\d+)_(\d+)/);
      if (!match) continue;

      const [, bookName, chap, verse] = match;
      const docId = `${bookName.trim().replace(/\s+/g, '_')}_${chap}_${verse}`;

      // Fetch TOML content
      const tomlRes = await fetch(file.download_url, { headers });
      if (!tomlRes.ok) continue;
      const tomlText = await tomlRes.text();

      // Extract text between triple quotes
      const textMatch = tomlText.match(/text\s*=\s*"""([\s\S]*?)"""/);
      if (!textMatch) continue;

      records.push({ author: fieldName, docId, text: textMatch[1].trim() });
    }
  }

  return records;
}

// ─── Group by verse ───────────────────────────────────────────────────────────

function groupByVerse(records: CommentaryRecord[]): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const r of records) {
    if (!out[r.docId]) out[r.docId] = {};
    out[r.docId][r.author] = r.text;
  }
  return out;
}

// ─── Upload to Firestore ──────────────────────────────────────────────────────

async function upload(db: FirebaseFirestore.Firestore, verseMap: Record<string, Record<string, string>>) {
  const entries = Object.entries(verseMap);
  console.log(`\nUploading ${entries.length} verse documents...`);

  for (let i = 0; i < entries.length; i += CHUNK_SIZE) {
    const batch = db.batch();
    const chunk = entries.slice(i, i + CHUNK_SIZE);
    for (const [docId, data] of chunk) {
      batch.set(db.collection(COLLECTION).doc(docId), data, { merge: true });
    }
    await batch.commit();
    console.log(`  ✓ ${Math.min(i + CHUNK_SIZE, entries.length)} / ${entries.length}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n=== Commentary Migration to Firestore ===\n');
  console.log(`Target collection: ${COLLECTION}`);

  // Init Firebase
  const db = await initFirebase();

  // Use cache if available
  let verseMap: Record<string, Record<string, string>>;

  if (fs.existsSync(CACHE_PATH)) {
    console.log(`\nLoading from cache: ${CACHE_PATH}`);
    verseMap = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  } else {
    const allRecords: CommentaryRecord[] = [];

    for (const [folder, field] of Object.entries(AUTHOR_MAP)) {
      console.log(`\nFetching ${folder}...`);
      const records = await fetchAuthorEntries(folder, field);
      console.log(`  → ${records.length} verses`);
      allRecords.push(...records);
    }

    verseMap = groupByVerse(allRecords);
    // Cache for re-runs
    fs.writeFileSync(CACHE_PATH, JSON.stringify(verseMap));
    console.log(`\nCached ${Object.keys(verseMap).length} verses to ${CACHE_PATH}`);
  }

  const total = Object.keys(verseMap).length;
  console.log(`\nReady to upload ${total} unique verses (${Object.values(AUTHOR_MAP).join(', ')})`);

  await upload(db, verseMap);
  console.log(`\n✅ Migration complete! Check Firebase Console → Firestore → ${COLLECTION}`);
}

main().catch(e => { console.error('\n✗ Error:', e.message); process.exit(1); });
