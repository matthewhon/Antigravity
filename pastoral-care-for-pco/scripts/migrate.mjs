/**
 * migrate.mjs — Self-contained commentary migration for Google Cloud Shell
 * Project: preachit-8733a
 *
 * REPO STRUCTURE (HistoricalChristianFaith/Commentaries-Database):
 *   /{Author Name}/{Book Chapter_Verse.toml}
 *   Each TOML file contains one or more [[commentary]] blocks with fields:
 *     quote = '''...text...'''
 *     source_url = '...'
 *     source_title = '...'
 *
 * Run in Cloud Shell:
 *   npm install firebase-admin
 *   node migrate.mjs
 *
 * Prerequisites (run once):
 *   gcloud auth application-default login
 */

import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync, readFileSync, writeFileSync } from 'fs';

const PROJECT_ID = 'preachit-8733a';
const COLLECTION = 'scripture_commentaries';
const CACHE = '/tmp/commentary-cache.json';
const HEADERS = { 'User-Agent': 'pastoral-care-migration', Accept: 'application/vnd.github.v3+json' };
const BASE = 'https://api.github.com/repos/HistoricalChristianFaith/Commentaries-Database/contents';

// Authors to include — these are the EXACT folder names in the repo.
// Change/add to this list to include more authors.
const AUTHORS = {
  'John Calvin':        'calvin',
  'John Chrysostom':    'chrysostom',
  'John Wesley':        'wesley',
  'Augustine of Hippo': 'augustine',
  'Jerome':             'jerome',
  'Thomas Aquinas':     'aquinas',
};

// ─── Init Firebase ─────────────────────────────────────────────────────────────
initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
console.log(`Auth: Application Default Credentials → ${PROJECT_ID}`);
const db = getFirestore();

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** "Matthew 1_25.toml" → "Matthew_1_25" */
function parseDocId(filename) {
  const base = filename.replace(/\.toml$/, '');
  // Match "Book Chapter_Verse" or "Book Chapter_VerseRange"
  const m = base.match(/^(.+?)\s+(\d+)_(\d+.*?)$/);
  if (!m) return null;
  const book = m[1].trim().replace(/\s+/g, '_');
  const ch   = m[2];
  const vs   = m[3].replace(/[^0-9]/g, '') || m[3]; // keep first number only
  return `${book}_${ch}_${vs}`;
}

/** Extract all [[commentary]] quote texts from a TOML string */
function parseCommentaryBlocks(toml) {
  const results = [];
  // Split on [[commentary]] delimiters
  const blocks = toml.split(/\[\[commentary\]\]/);
  for (const block of blocks.slice(1)) {
    // Try triple-single-quote first, then triple-double-quote
    let quoteMatch = block.match(/quote\s*=\s*'''([\s\S]*?)'''/);
    if (!quoteMatch) {
      quoteMatch = block.match(/quote\s*=\s*"""([\s\S]*?)"""/);
    }
    if (quoteMatch) {
      const text = quoteMatch[1].trim();
      if (text.length > 10) results.push(text);
    }
  }
  return results;
}

async function fetchJSON(url) {
  const r = await fetch(url, { headers: HEADERS });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`HTTP ${r.status} on ${url}`);
  return r.json();
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ─── Fetch all entries for one author ─────────────────────────────────────────
async function fetchAuthor(folder, field) {
  const records = [];
  console.log(`  Fetching ${folder}...`);

  const items = await fetchJSON(`${BASE}/${encodeURIComponent(folder)}`);
  if (!items) {
    console.log(`  ⚠ ${folder} not found — skipping`);
    return records;
  }

  // Paginate if needed (GitHub API returns max 1000 items per request)
  let allFiles = items.filter(i => i.name?.endsWith('.toml') && i.name !== 'metadata.toml');
  console.log(`    Found ${allFiles.length} TOML files`);

  let count = 0;
  for (const file of allFiles) {
    const docId = parseDocId(file.name);
    if (!docId) continue;

    try {
      const resp = await fetch(file.download_url, { headers: HEADERS });
      if (!resp.ok) continue;
      const toml = await resp.text();
      const quotes = parseCommentaryBlocks(toml);
      if (quotes.length > 0) {
        // Join multiple commentary blocks with separator
        const text = quotes.join('\n\n---\n\n');
        records.push({ docId, field, text });
        count++;
      }
    } catch (e) {
      // skip individual fetch errors
    }

    // Rate limit: small delay every 20 requests
    if (count % 20 === 0 && count > 0) {
      await sleep(500);
    }
  }

  console.log(`    → ${count} verses with commentary`);
  return records;
}

// ─── Group & upload ───────────────────────────────────────────────────────────
async function upload(verseMap) {
  const entries = Object.entries(verseMap);
  console.log(`\nUploading ${entries.length} verse documents to ${COLLECTION}...`);
  const CHUNK = 450;
  for (let i = 0; i < entries.length; i += CHUNK) {
    const batch = db.batch();
    for (const [id, data] of entries.slice(i, i + CHUNK)) {
      batch.set(db.collection(COLLECTION).doc(id), data, { merge: true });
    }
    await batch.commit();
    console.log(`  ✓ ${Math.min(i + CHUNK, entries.length)} / ${entries.length}`);
  }
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== Commentary Migration ===');
  console.log(`Target: ${PROJECT_ID} / ${COLLECTION}`);
  console.log(`Authors: ${Object.keys(AUTHORS).join(', ')}\n`);

  let verseMap = {};

  if (existsSync(CACHE)) {
    console.log(`Loading cached data from ${CACHE}`);
    verseMap = JSON.parse(readFileSync(CACHE, 'utf8'));
    console.log(`  Loaded ${Object.keys(verseMap).length} cached verses`);
  } else {
    for (const [folder, field] of Object.entries(AUTHORS)) {
      const records = await fetchAuthor(folder, field);
      for (const { docId, field: f, text } of records) {
        if (!verseMap[docId]) verseMap[docId] = {};
        verseMap[docId][f] = text;
      }
      // Pause between authors to avoid rate-limiting
      await sleep(1000);
    }
    writeFileSync(CACHE, JSON.stringify(verseMap));
    console.log(`\nCached ${Object.keys(verseMap).length} verses → ${CACHE}`);
  }

  if (Object.keys(verseMap).length === 0) {
    console.log('\n⚠ No data found! Check author names match repo folders exactly.');
    console.log('  Browse: https://github.com/HistoricalChristianFaith/Commentaries-Database');
    process.exit(1);
  }

  await upload(verseMap);
  console.log(`\n✅ Done! Open Firebase Console → Firestore → ${COLLECTION}`);
  console.log(`   https://console.firebase.google.com/project/${PROJECT_ID}/firestore`);
}

main().catch(e => { console.error('\n✗ Error:', e.message); process.exit(1); });
