/**
 * scriptureLibraryService.ts
 * Lazy-loading, in-memory cached service for all Scripture Library data.
 * Reference books (JSON) are served from /public/data/ on the local app server.
 * Commentaries are fetched per-verse from Firestore.
 */

import { getDoc, doc } from 'firebase/firestore';
import { db } from './firebase';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface StrongsEntry {
  strongs_def: string;
  kjv_def: string;
  translit: string;
  lemma: string;
  derivation: string;
}

export interface NavesTopic {
  topic: string;
  references?: string[];
  [key: string]: any;
}

export interface EastonsEntry {
  word: string;
  definition: string;
  [key: string]: any;
}

export interface VerseCommentary {
  barnes?: string;
  clarke?: string;
  gill?: string;
  pulpit?: string;
}

// ─── In-memory caches ─────────────────────────────────────────────────────────

let _greek: Record<string, StrongsEntry> | null = null;
let _hebrew: Record<string, StrongsEntry> | null = null;
let _naves: NavesTopic[] | null = null;
let _eastons: EastonsEntry[] | null = null;
const _commentaryCache = new Map<string, VerseCommentary>();

// ─── Helpers ─────────────────────────────────────────────────────────────────

function normalizeKey(entry: any): { word?: string; topic?: string; definition?: string } {
  // Handles various JSON shapes from different source formats
  if (entry.word !== undefined) return entry; // Easton's standard
  if (entry.topic !== undefined) return entry; // Nave's standard
  // Try common alternative field names
  const word = entry.Word || entry.title || entry.name || entry.entry || '';
  const definition = entry.Definition || entry.content || entry.text || entry.body || '';
  const topic = entry.Topic || entry.heading || '';
  if (topic) return { topic, ...entry };
  return { word, definition, ...entry };
}

// ─── Reference Book Loaders ───────────────────────────────────────────────────

export async function getGreekLexicon(): Promise<Record<string, StrongsEntry>> {
  if (!_greek) {
    const res = await fetch('/data/strongs-greek.json');
    if (!res.ok) throw new Error('Strong\'s Greek data not found. Run npm run fetch-data.');
    _greek = await res.json();
  }
  return _greek!;
}

export async function getHebrewLexicon(): Promise<Record<string, StrongsEntry>> {
  if (!_hebrew) {
    const res = await fetch('/data/strongs-hebrew.json');
    if (!res.ok) throw new Error('Strong\'s Hebrew data not found. Run npm run fetch-data.');
    _hebrew = await res.json();
  }
  return _hebrew!;
}

export async function getNaves(): Promise<NavesTopic[]> {
  if (!_naves) {
    const res = await fetch('/data/naves-topical.json');
    if (!res.ok) {
      console.warn('Nave\'s data not found — returning empty set. Run npm run fetch-data.');
      _naves = [];
      return _naves;
    }
    const raw = await res.json();
    // Normalize to array regardless of source format
    _naves = Array.isArray(raw)
      ? raw.map(normalizeKey).filter(e => e.topic) as NavesTopic[]
      : Object.entries(raw).map(([topic, data]: [string, any]) => ({
          topic,
          ...(typeof data === 'object' ? data : { references: [String(data)] })
        }));
  }
  return _naves!;
}

export async function getEastons(): Promise<EastonsEntry[]> {
  if (!_eastons) {
    const res = await fetch('/data/eastons-dictionary.json');
    if (!res.ok) {
      console.warn('Easton\'s data not found — returning empty set. Run npm run fetch-data.');
      _eastons = [];
      return _eastons;
    }
    const raw = await res.json();
    _eastons = Array.isArray(raw)
      ? raw.map(normalizeKey).filter(e => e.word) as EastonsEntry[]
      : Object.entries(raw).map(([word, definition]) => ({
          word,
          definition: typeof definition === 'string' ? definition : JSON.stringify(definition)
        }));
  }
  return _eastons!;
}

// ─── Commentary Loader (Firestore) ────────────────────────────────────────────

export async function getCommentary(
  book: string,
  chapter: number,
  verse: number
): Promise<VerseCommentary> {
  // Normalize book name: "1 John" → "1_John", "John" → "John"
  const docId = `${book.replace(/\s+/g, '_')}_${chapter}_${verse}`;
  
  if (_commentaryCache.has(docId)) {
    return _commentaryCache.get(docId)!;
  }
  
  try {
    const snap = await getDoc(doc(db, 'scripture_commentaries', docId));
    const data: VerseCommentary = snap.exists() ? (snap.data() as VerseCommentary) : {};
    _commentaryCache.set(docId, data);
    return data;
  } catch (e) {
    console.error('Error fetching commentary:', e);
    return {};
  }
}

// ─── Search Helpers ───────────────────────────────────────────────────────────

export function searchStrongs(
  data: Record<string, StrongsEntry>,
  query: string,
  prefix: 'G' | 'H'
): Array<[string, StrongsEntry]> {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  
  return Object.entries(data).filter(([key, entry]) => {
    const numQuery = q.replace(/^[gh]/i, '');
    // Match by Strong's number
    if (q.match(/^[gh]?\d+/i)) {
      const num = key.replace(/^[GH]/, '');
      return num.startsWith(numQuery);
    }
    // Match by Greek/Hebrew word or any field
    return (
      entry.lemma?.toLowerCase().includes(q) ||
      entry.translit?.toLowerCase().includes(q) ||
      entry.strongs_def?.toLowerCase().includes(q) ||
      entry.kjv_def?.toLowerCase().includes(q)
    );
  }).slice(0, 50); // Limit results for performance
}

export function searchNaves(data: NavesTopic[], query: string): NavesTopic[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return data.filter(t => t.topic?.toLowerCase().includes(q)).slice(0, 80);
}

export function searchEastons(data: EastonsEntry[], query: string): EastonsEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return data.filter(e =>
    e.word?.toLowerCase().includes(q) ||
    e.definition?.toLowerCase().includes(q)
  ).slice(0, 80);
}

// ─── Bible Book List for Commentary Picker ────────────────────────────────────

export const BIBLE_BOOKS = [
  { name: 'Genesis', abbr: 'Gen', chapters: 50, ot: true },
  { name: 'Exodus', abbr: 'Exo', chapters: 40, ot: true },
  { name: 'Leviticus', abbr: 'Lev', chapters: 27, ot: true },
  { name: 'Numbers', abbr: 'Num', chapters: 36, ot: true },
  { name: 'Deuteronomy', abbr: 'Deu', chapters: 34, ot: true },
  { name: 'Joshua', abbr: 'Jos', chapters: 24, ot: true },
  { name: 'Judges', abbr: 'Jdg', chapters: 21, ot: true },
  { name: 'Ruth', abbr: 'Rut', chapters: 4, ot: true },
  { name: '1 Samuel', abbr: '1Sa', chapters: 31, ot: true },
  { name: '2 Samuel', abbr: '2Sa', chapters: 24, ot: true },
  { name: '1 Kings', abbr: '1Ki', chapters: 22, ot: true },
  { name: '2 Kings', abbr: '2Ki', chapters: 25, ot: true },
  { name: '1 Chronicles', abbr: '1Ch', chapters: 29, ot: true },
  { name: '2 Chronicles', abbr: '2Ch', chapters: 36, ot: true },
  { name: 'Ezra', abbr: 'Ezr', chapters: 10, ot: true },
  { name: 'Nehemiah', abbr: 'Neh', chapters: 13, ot: true },
  { name: 'Esther', abbr: 'Est', chapters: 10, ot: true },
  { name: 'Job', abbr: 'Job', chapters: 42, ot: true },
  { name: 'Psalms', abbr: 'Psa', chapters: 150, ot: true },
  { name: 'Proverbs', abbr: 'Pro', chapters: 31, ot: true },
  { name: 'Ecclesiastes', abbr: 'Ecc', chapters: 12, ot: true },
  { name: 'Song of Solomon', abbr: 'Son', chapters: 8, ot: true },
  { name: 'Isaiah', abbr: 'Isa', chapters: 66, ot: true },
  { name: 'Jeremiah', abbr: 'Jer', chapters: 52, ot: true },
  { name: 'Lamentations', abbr: 'Lam', chapters: 5, ot: true },
  { name: 'Ezekiel', abbr: 'Eze', chapters: 48, ot: true },
  { name: 'Daniel', abbr: 'Dan', chapters: 12, ot: true },
  { name: 'Hosea', abbr: 'Hos', chapters: 14, ot: true },
  { name: 'Joel', abbr: 'Joe', chapters: 3, ot: true },
  { name: 'Amos', abbr: 'Amo', chapters: 9, ot: true },
  { name: 'Obadiah', abbr: 'Oba', chapters: 1, ot: true },
  { name: 'Jonah', abbr: 'Jon', chapters: 4, ot: true },
  { name: 'Micah', abbr: 'Mic', chapters: 7, ot: true },
  { name: 'Nahum', abbr: 'Nah', chapters: 3, ot: true },
  { name: 'Habakkuk', abbr: 'Hab', chapters: 3, ot: true },
  { name: 'Zephaniah', abbr: 'Zep', chapters: 3, ot: true },
  { name: 'Haggai', abbr: 'Hag', chapters: 2, ot: true },
  { name: 'Zechariah', abbr: 'Zec', chapters: 14, ot: true },
  { name: 'Malachi', abbr: 'Mal', chapters: 4, ot: true },
  { name: 'Matthew', abbr: 'Mat', chapters: 28, ot: false },
  { name: 'Mark', abbr: 'Mar', chapters: 16, ot: false },
  { name: 'Luke', abbr: 'Luk', chapters: 24, ot: false },
  { name: 'John', abbr: 'Joh', chapters: 21, ot: false },
  { name: 'Acts', abbr: 'Act', chapters: 28, ot: false },
  { name: 'Romans', abbr: 'Rom', chapters: 16, ot: false },
  { name: '1 Corinthians', abbr: '1Co', chapters: 16, ot: false },
  { name: '2 Corinthians', abbr: '2Co', chapters: 13, ot: false },
  { name: 'Galatians', abbr: 'Gal', chapters: 6, ot: false },
  { name: 'Ephesians', abbr: 'Eph', chapters: 6, ot: false },
  { name: 'Philippians', abbr: 'Phi', chapters: 4, ot: false },
  { name: 'Colossians', abbr: 'Col', chapters: 4, ot: false },
  { name: '1 Thessalonians', abbr: '1Th', chapters: 5, ot: false },
  { name: '2 Thessalonians', abbr: '2Th', chapters: 3, ot: false },
  { name: '1 Timothy', abbr: '1Ti', chapters: 6, ot: false },
  { name: '2 Timothy', abbr: '2Ti', chapters: 4, ot: false },
  { name: 'Titus', abbr: 'Tit', chapters: 3, ot: false },
  { name: 'Philemon', abbr: 'Phm', chapters: 1, ot: false },
  { name: 'Hebrews', abbr: 'Heb', chapters: 13, ot: false },
  { name: 'James', abbr: 'Jam', chapters: 5, ot: false },
  { name: '1 Peter', abbr: '1Pe', chapters: 5, ot: false },
  { name: '2 Peter', abbr: '2Pe', chapters: 3, ot: false },
  { name: '1 John', abbr: '1Jo', chapters: 5, ot: false },
  { name: '2 John', abbr: '2Jo', chapters: 1, ot: false },
  { name: '3 John', abbr: '3Jo', chapters: 1, ot: false },
  { name: 'Jude', abbr: 'Jud', chapters: 1, ot: false },
  { name: 'Revelation', abbr: 'Rev', chapters: 22, ot: false },
];

// Verse counts per chapter per book (approximate for common books; others default to 40)
export const VERSE_COUNTS: Record<string, number[]> = {
  'John': [51,25,36,54,47,71,53,59,41,42,57,50,38,31,27,33,26,40,42,31,25],
  'Matthew': [25,23,17,25,48,34,29,34,38,42,45,27,53,52,31,84,28,47,33,20,61,45,24,23,17,14,18,20,20,11,30,21,34,12,20,19,25,22,51],
  'Mark': [45,28,35,41,43,56,37,38,50,52,33,44,37,72,47,20],
  'Luke': [80,52,38,44,39,49,50,56,62,42,54,59,35,35,32,31,37,43,48,47,38,71,56,53],
  'Genesis': [31,25,24,26,32,22,24,22,29,32,32,20,18,24,21,16,27,33,38,18,34,24,20,67,34,35,46,22,35,43,55,32,20,31,29,43,36,30,23,23,57,38,34,34,28,34,31,22,33,26],
  'Psalms': [6,12,8,8,12,10,17,9,20,18,7,8,6,7,5,11,15,50,14,9,13,31,6,10,22,12,14,9,11,13,25,11,22,23,28,13,40,23,14,18,14,12,5,27,18,12,10,15,21,23,21,11,7,9,24,14,12,12,18,14,9,13,12,11,14,20,8,36,37,6,24,20,28,23,11,13,21,12,14,23,14,12,13,10,14,11,18,14,15,8,14,10,8,13,16,10,12,11,13,16,9,9,23,20,9,16,21,13,10,11,22,11,11,18,12,9,8,13,27,6,13,14,15,8,9,13,11,11,13,12,17,5,17,12,18,7,27,15,12,10,18,17,9,13,12,14,5,23,13,10,14,8,7,8,21,15,10,11,13,10,10,18,18,21,18,10,11,10],
};
