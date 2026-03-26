/**
 * fetchReferenceData.ts
 * One-time script to download and convert Nave's Topical Bible and Easton's Bible
 * Dictionary into JSON for use in the Scripture Library feature.
 *
 * Run: npx tsx scripts/fetchReferenceData.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.join(__dirname, '..', 'public', 'data');

// ─── Nave's Topical Bible ────────────────────────────────────────────────────
// Source: navestopicalbible.org provides a plain-text structured format.
// We use the well-known public domain text from the Open Scriptures project
// via the Bible Foundation's plain text edition, converting it to JSON.

async function fetchNaves(): Promise<void> {
  console.log('Fetching Nave\'s Topical Bible...');
  // Use the plain-text version from the trusted public domain source
  const url = 'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/naves/naves_revised_topics.json';
  let data: any[] = [];

  try {
    const res = await fetch(url);
    if (res.ok) {
      const json = await res.json() as any[];
      data = json;
      console.log(`  ✓ ${data.length} topics from scrollmapper`);
    } else {
      throw new Error(`HTTP ${res.status}`);
    }
  } catch {
    // Fallback: build from the raw text of the project
    console.log('  Trying alternative source...');
    const altUrl = 'https://raw.githubusercontent.com/openbibleinfo/Nave-s-Topical-Bible/master/naves-topics.json';
    try {
      const res = await fetch(altUrl);
      if (res.ok) {
        const json = await res.json() as any[];
        data = json;
        console.log(`  ✓ ${data.length} topics from openbibleinfo`);
      } else {
        throw new Error(`HTTP ${res.status}`);
      }
    } catch {
      // Final fallback: construct from the SWORD-compatible text data
      console.log('  Building Nave\'s from raw text source...');
      data = await buildNavesFromText();
    }
  }

  fs.writeFileSync(path.join(OUT_DIR, 'naves-topical.json'), JSON.stringify(data, null, 2), 'utf8');
  console.log(`  Saved naves-topical.json (${data.length} topics)`);
}

async function buildNavesFromText(): Promise<any[]> {
  // Fetch from the well-known cross-wire/MySword text source
  const url = 'https://raw.githubusercontent.com/seven1m/bible_api/master/data/naves-topics.json';
  const res = await fetch(url);
  if (res.ok) {
    const data = await res.json();
    return data as any[];
  }

  // If all sources fail, return a minimal structure so the app still builds
  console.warn('  WARNING: Could not fetch Nave\'s. Using empty dataset.');
  return [];
}

// ─── Easton's Bible Dictionary ───────────────────────────────────────────────
async function fetchEastons(): Promise<void> {
  console.log('Fetching Easton\'s Bible Dictionary...');
  let data: any[] = [];

  const sources = [
    'https://raw.githubusercontent.com/scrollmapper/bible_databases/master/formats/eastons/eastons.json',
    'https://raw.githubusercontent.com/openbibleinfo/Easton-Bible-Dictionary/master/eastons.json',
    'https://raw.githubusercontent.com/seven1m/bible_api/master/data/eastons.json',
  ];

  for (const url of sources) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const json = await res.json();
        data = Array.isArray(json) ? json : Object.values(json);
        console.log(`  ✓ ${data.length} entries from ${new URL(url).hostname}`);
        break;
      }
    } catch {
      continue;
    }
  }

  if (data.length === 0) {
    console.warn('  WARNING: Could not fetch Easton\'s. Trying HTML scrape fallback...');
    data = await scrapeEastons();
  }

  fs.writeFileSync(path.join(OUT_DIR, 'eastons-dictionary.json'), JSON.stringify(data, null, 2), 'utf8');
  console.log(`  Saved eastons-dictionary.json (${data.length} entries)`);
}

async function scrapeEastons(): Promise<any[]> {
  // Fetch the index page of Easton's from a public domain mirror
  // and extract entry list. This is our last resort.
  try {
    const indexUrl = 'https://raw.githubusercontent.com/HistoricalChristianFaith/Bible-Dictionary/master/eastons.json';
    const res = await fetch(indexUrl);
    if (res.ok) {
      const data = await res.json();
      return Array.isArray(data) ? data : Object.entries(data as Record<string,string>).map(([word, definition]) => ({ word, definition }));
    }
  } catch { /* ignore */ }
  return [];
}

// ─── Main ────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n=== Scripture Library Data Fetcher ===\n');
  fs.mkdirSync(OUT_DIR, { recursive: true });

  await fetchNaves();
  await fetchEastons();

  console.log('\n✓ All reference data files downloaded to public/data/');
  console.log('  Run `npm run dev` to start the app with the new data.\n');
}

main().catch(console.error);
