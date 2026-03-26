import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  getGreekLexicon, getHebrewLexicon, getNaves, getEastons, getCommentary,
  searchStrongs, searchNaves, searchEastons,
  StrongsEntry, NavesTopic, EastonsEntry, VerseCommentary,
  BIBLE_BOOKS, VERSE_COUNTS
} from '../services/scriptureLibraryService';
import { firestore, SermonVerseRecord } from '../services/firestoreService';

// ─── Types ────────────────────────────────────────────────────────────────────

type Tab = 'greek' | 'hebrew' | 'naves' | 'eastons' | 'commentaries';

const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: 'greek',        label: "Strong's Greek",   icon: 'Ἑ' },
  { id: 'hebrew',       label: "Strong's Hebrew",  icon: 'ע' },
  { id: 'naves',        label: "Nave's Topics",    icon: '📋' },
  { id: 'eastons',      label: "Easton's Dict.",   icon: '📖' },
  { id: 'commentaries', label: 'Commentaries',     icon: '✍️'  },
];

const ALPHA = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split('');

// ─── Shared Components ────────────────────────────────────────────────────────

const LoadingSpinner: React.FC<{ text?: string }> = ({ text = 'Loading...' }) => (
  <div className="flex flex-col items-center justify-center py-16 gap-3">
    <div className="w-8 h-8 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" />
    <p className="text-sm text-slate-400">{text}</p>
  </div>
);

const EmptyState: React.FC<{ text: string }> = ({ text }) => (
  <div className="text-center py-16 text-slate-400">
    <div className="text-4xl mb-3">📚</div>
    <p className="text-sm">{text}</p>
  </div>
);

const AlphaNav: React.FC<{ onSelect: (letter: string) => void; active?: string }> = ({ onSelect, active }) => (
  <div className="flex flex-wrap gap-1 mb-4">
    {ALPHA.map(l => (
      <button
        key={l}
        onClick={() => onSelect(l)}
        className={`w-7 h-7 text-xs font-bold rounded transition-all ${
          active === l
            ? 'bg-indigo-600 text-white'
            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40'
        }`}
      >
        {l}
      </button>
    ))}
    <button
      onClick={() => onSelect('')}
      className="px-2 h-7 text-xs font-bold rounded bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
    >
      All
    </button>
  </div>
);

// ─── Strong's Lexicon Tab (Greek & Hebrew) ────────────────────────────────────

const StrongsTab: React.FC<{ type: 'G' | 'H' }> = ({ type }) => {
  const [data, setData] = useState<Record<string, StrongsEntry> | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [alphaFilter, setAlphaFilter] = useState('');
  const [selected, setSelected] = useState<[string, StrongsEntry] | null>(null);

  useEffect(() => {
    setLoading(true);
    setData(null);
    setSelected(null);
    const loader = type === 'G' ? getGreekLexicon : getHebrewLexicon;
    loader().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, [type]);

  const results = useMemo<Array<[string, StrongsEntry]>>(() => {
    if (!data) return [];
    if (query.trim()) return searchStrongs(data, query, type);
    if (alphaFilter) {
      return Object.entries(data)
        .filter(([, e]) => ((e as StrongsEntry).strongs_def || '').trim().toUpperCase().startsWith(alphaFilter))
        .slice(0, 60) as Array<[string, StrongsEntry]>;
    }
    return Object.entries(data).slice(0, 60) as Array<[string, StrongsEntry]>;
  }, [data, query, alphaFilter, type]);

  if (loading) return <LoadingSpinner text={`Loading Strong's ${type === 'G' ? 'Greek' : 'Hebrew'}...`} />;
  if (!data) return <EmptyState text="Data not available. Run npm run fetch-data to download." />;

  return (
    <div className="flex gap-6 h-full min-h-0">
      {/* List Panel */}
      <div className="w-64 flex-none flex flex-col min-h-0">
        <input
          type="text"
          placeholder={`Search by ${type}# or word...`}
          value={query}
          onChange={e => { setQuery(e.target.value); setAlphaFilter(''); }}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {!query && <AlphaNav onSelect={setAlphaFilter} active={alphaFilter} />}
        <div className="flex-1 overflow-y-auto space-y-1 pr-1">
          {results.length === 0 && (
            <p className="text-xs text-slate-400 text-center py-8">No results</p>
          )}
          {results.map(([key, entry]) => (
            <button
              key={key}
              onClick={() => setSelected([key, entry])}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                selected?.[0] === key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-slate-700 dark:text-slate-300'
              }`}
            >
              <div className="font-black text-xs mb-0.5">{key}</div>
              <div className="truncate opacity-75 text-xs">{entry.translit}</div>
            </button>
          ))}
        </div>
      </div>

      {/* Detail Panel */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-slate-300 dark:text-slate-600">
            <div className="text-center">
              <div className="text-6xl mb-4 opacity-40">{type === 'G' ? 'Ἑ' : 'ע'}</div>
              <p className="text-sm">Select an entry to view its definition</p>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-start gap-4 mb-6">
              <div>
                <span className="inline-block bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 text-xs font-black px-2 py-1 rounded-full mb-2">
                  {selected[0]}
                </span>
                <h2 className="text-3xl font-bold text-slate-900 dark:text-white">
                  {selected[1].lemma}
                </h2>
                <p className="text-lg text-slate-500 dark:text-slate-400 mt-1">
                  {selected[1].translit}
                </p>
              </div>
            </div>
            <div className="space-y-4">
              <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                  Strong's Definition
                </h3>
                <p className="text-slate-800 dark:text-slate-200 leading-relaxed">
                  {selected[1].strongs_def}
                </p>
              </div>
              <div className="bg-amber-50 dark:bg-amber-900/20 rounded-lg p-4 border border-amber-100 dark:border-amber-900/30">
                <h3 className="text-xs font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-2">
                  KJV Usage
                </h3>
                <p className="text-slate-800 dark:text-slate-200">{selected[1].kjv_def}</p>
              </div>
              {selected[1].derivation && (
                <div className="bg-slate-50 dark:bg-slate-700/40 rounded-lg p-4">
                  <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">
                    Derivation
                  </h3>
                  <p className="text-slate-600 dark:text-slate-400 text-sm leading-relaxed">
                    {selected[1].derivation}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Nave's Topical Bible Tab ─────────────────────────────────────────────────

const NavesTab: React.FC = () => {
  const [data, setData] = useState<NavesTopic[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [alphaFilter, setAlphaFilter] = useState('');
  const [selected, setSelected] = useState<NavesTopic | null>(null);

  useEffect(() => {
    getNaves().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const results = useMemo(() => {
    if (!data) return [];
    if (query.trim()) return searchNaves(data, query);
    if (alphaFilter) return data.filter(t => t.topic?.toUpperCase().startsWith(alphaFilter)).slice(0, 80);
    return data.slice(0, 80);
  }, [data, query, alphaFilter]);

  if (loading) return <LoadingSpinner text="Loading Nave's Topical Bible..." />;
  if (!data || data.length === 0) return (
    <div className="text-center py-16">
      <div className="text-4xl mb-3">📋</div>
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">Nave's data not yet downloaded.</p>
      <p className="text-xs text-slate-400">Run <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">npx tsx scripts/fetchReferenceData.ts</code> to populate this data.</p>
    </div>
  );

  return (
    <div className="flex gap-6 h-full min-h-0">
      <div className="w-64 flex-none flex flex-col min-h-0">
        <input
          type="text"
          placeholder="Search topics..."
          value={query}
          onChange={e => { setQuery(e.target.value); setAlphaFilter(''); }}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {!query && <AlphaNav onSelect={setAlphaFilter} active={alphaFilter} />}
        <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
          {results.map((topic, i) => (
            <button
              key={i}
              onClick={() => setSelected(topic)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                selected?.topic === topic.topic
                  ? 'bg-indigo-600 text-white'
                  : 'hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-slate-700 dark:text-slate-300'
              }`}
            >
              {topic.topic}
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-slate-300 dark:text-slate-600">
            <div className="text-center">
              <div className="text-5xl mb-3 opacity-40">📋</div>
              <p className="text-sm">Select a topic to view references</p>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-4">
              {selected.topic}
            </h2>
            <div className="space-y-2">
              {(selected.references || selected.refs || []).map((ref: string, i: number) => (
                <div key={i} className="flex items-start gap-3 py-1.5 border-b border-slate-100 dark:border-slate-700/50 last:border-0">
                  <span className="text-xs font-black text-indigo-500 shrink-0 mt-0.5">▸</span>
                  <span className="text-sm text-slate-700 dark:text-slate-300">{ref}</span>
                </div>
              ))}
              {!(selected.references || selected.refs) && (
                <p className="text-slate-400 text-sm">No verse references found for this topic.</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Easton's Bible Dictionary Tab ────────────────────────────────────────────

const EastonsTab: React.FC = () => {
  const [data, setData] = useState<EastonsEntry[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [alphaFilter, setAlphaFilter] = useState('');
  const [selected, setSelected] = useState<EastonsEntry | null>(null);

  useEffect(() => {
    getEastons().then(d => { setData(d); setLoading(false); }).catch(() => setLoading(false));
  }, []);

  const results = useMemo(() => {
    if (!data) return [];
    if (query.trim()) return searchEastons(data, query);
    if (alphaFilter) return data.filter(e => e.word?.toUpperCase().startsWith(alphaFilter)).slice(0, 80);
    return data.slice(0, 80);
  }, [data, query, alphaFilter]);

  if (loading) return <LoadingSpinner text="Loading Easton's Bible Dictionary..." />;
  if (!data || data.length === 0) return (
    <div className="text-center py-16">
      <div className="text-4xl mb-3">📖</div>
      <p className="text-slate-500 dark:text-slate-400 text-sm mb-2">Easton's data not yet downloaded.</p>
      <p className="text-xs text-slate-400">Run <code className="bg-slate-100 dark:bg-slate-800 px-1 rounded">npx tsx scripts/fetchReferenceData.ts</code> to populate.</p>
    </div>
  );

  return (
    <div className="flex gap-6 h-full min-h-0">
      <div className="w-72 flex-none flex flex-col min-h-0">
        <input
          type="text"
          placeholder="Search words..."
          value={query}
          onChange={e => { setQuery(e.target.value); setAlphaFilter(''); }}
          className="w-full px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white mb-3 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        />
        {!query && <AlphaNav onSelect={setAlphaFilter} active={alphaFilter} />}
        <div className="flex-1 overflow-y-auto space-y-0.5 pr-1">
          {results.map((entry, i) => (
            <button
              key={i}
              onClick={() => setSelected(entry)}
              className={`w-full text-left px-3 py-2 rounded-lg text-sm transition-all ${
                selected?.word === entry.word
                  ? 'bg-indigo-600 text-white'
                  : 'hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-slate-700 dark:text-slate-300'
              }`}
            >
              <span className="font-semibold">{entry.word}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto">
        {!selected ? (
          <div className="flex items-center justify-center h-full text-slate-300 dark:text-slate-600">
            <div className="text-center">
              <div className="text-5xl mb-3 opacity-40">📖</div>
              <p className="text-sm">Select an entry to view its article</p>
            </div>
          </div>
        ) : (
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-4">{selected.word}</h2>
            <div className="prose prose-sm max-w-none dark:prose-invert">
              <p className="text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                {selected.definition}
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Commentaries Tab ─────────────────────────────────────────────────────────

const AUTHORS = [
  { key: 'barnes',  label: "Albert Barnes' Notes",  color: 'indigo'  },
  { key: 'clarke',  label: 'Adam Clarke',            color: 'emerald' },
  { key: 'gill',    label: "John Gill's Exposition", color: 'amber'   },
  { key: 'pulpit',  label: 'Pulpit Commentary',      color: 'rose'    },
] as const;

const CommentariesTab: React.FC<{ churchId?: string }> = ({ churchId }) => {
  const [book, setBook] = useState('John');
  const [chapter, setChapter] = useState(3);
  const [verse, setVerse] = useState(16);
  const [loading, setLoading] = useState(false);
  const [commentary, setCommentary] = useState<VerseCommentary | null>(null);
  const [activeAuthors, setActiveAuthors] = useState<Set<string>>(new Set(['barnes', 'clarke', 'gill', 'pulpit']));
  const [hasSearched, setHasSearched] = useState(false);

  // Sermon usage state
  const [sermonUsage, setSermonUsage] = useState<SermonVerseRecord[]>([]);
  const [sermonUsageLoading, setSermonUsageLoading] = useState(false);
  const [showSermonList, setShowSermonList] = useState(false);
  const [showLogForm, setShowLogForm] = useState(false);
  const [logTitle, setLogTitle] = useState('');
  const [logPreacher, setLogPreacher] = useState('');
  const [logDate, setLogDate] = useState(new Date().toISOString().split('T')[0]);
  const [isSavingSermon, setIsSavingSermon] = useState(false);
  const [sermonSaved, setSermonSaved] = useState(false);

  const bookData = BIBLE_BOOKS.find(b => b.name === book);
  const chapterCount = bookData?.chapters || 50;
  const verseCount = VERSE_COUNTS[book]?.[chapter - 1] || 40;

  // Auto-fetch sermon usage whenever the verse selection changes
  useEffect(() => {
    let cancelled = false;
    setSermonUsageLoading(true);
    setSermonUsage([]);
    setShowSermonList(false);
    firestore.getSermonVerseUsage(book, chapter, verse)
      .then(sermons => { if (!cancelled) { setSermonUsage(sermons); setSermonUsageLoading(false); } })
      .catch(() => { if (!cancelled) setSermonUsageLoading(false); });
    return () => { cancelled = true; };
  }, [book, chapter, verse]);

  const handleLookup = useCallback(async () => {
    setLoading(true);
    setHasSearched(true);
    setShowSermonList(false);
    setShowLogForm(false);
    setSermonSaved(false);
    try {
      const [data, sermons] = await Promise.all([
        getCommentary(book, chapter, verse),
        firestore.getSermonVerseUsage(book, chapter, verse),
      ]);
      setCommentary(data);
      setSermonUsage(sermons);
    } catch {
      setCommentary({});
    } finally {
      setLoading(false);
    }
  }, [book, chapter, verse]);

  const handleLogSermon = async () => {
    if (!logTitle.trim() || !logPreacher.trim() || !logDate) return;
    setIsSavingSermon(true);
    try {
      await firestore.addSermonVerseUsage(book, chapter, verse, churchId || 'global', logTitle.trim(), logPreacher.trim(), logDate);
      const updated = await firestore.getSermonVerseUsage(book, chapter, verse);
      setSermonUsage(updated);
      setShowLogForm(false);
      setLogTitle('');
      setSermonSaved(true);
      setTimeout(() => setSermonSaved(false), 3000);
    } finally {
      setIsSavingSermon(false);
    }
  };

  const toggleAuthor = (key: string) => {
    setActiveAuthors(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const colorMap: Record<string, string> = {
    indigo:  'border-indigo-400 bg-indigo-50 dark:bg-indigo-900/20',
    emerald: 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20',
    amber:   'border-amber-400 bg-amber-50 dark:bg-amber-900/20',
    rose:    'border-rose-400 bg-rose-50 dark:bg-rose-900/20',
  };
  const badgeMap: Record<string, string> = {
    indigo:  'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
    emerald: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    amber:   'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
    rose:    'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300',
  };

  return (
    <div className="flex flex-col gap-4 h-full min-h-0">
      {/* Controls */}
      <div className="flex flex-wrap items-end gap-3 p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700">
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Book</label>
          <select
            value={book}
            onChange={e => { setBook(e.target.value); setChapter(1); setVerse(1); setCommentary(null); setHasSearched(false); }}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <optgroup label="Old Testament">
              {BIBLE_BOOKS.filter(b => b.ot).map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
            </optgroup>
            <optgroup label="New Testament">
              {BIBLE_BOOKS.filter(b => !b.ot).map(b => <option key={b.name} value={b.name}>{b.name}</option>)}
            </optgroup>
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Chapter</label>
          <select
            value={chapter}
            onChange={e => { setChapter(parseInt(e.target.value)); setVerse(1); setCommentary(null); setHasSearched(false); }}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {Array.from({ length: chapterCount }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Verse</label>
          <select
            value={verse}
            onChange={e => { setVerse(parseInt(e.target.value)); setCommentary(null); setHasSearched(false); }}
            className="px-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            {Array.from({ length: verseCount }, (_, i) => (
              <option key={i + 1} value={i + 1}>{i + 1}</option>
            ))}
          </select>
        </div>
        <button
          onClick={handleLookup}
          disabled={loading}
          className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-black rounded-lg transition-colors"
        >
          {loading ? 'Looking up...' : 'Look Up'}
        </button>

        {/* Sermon usage pill — visible immediately when browsing verses */}
        <div className="flex items-center">
          {sermonUsageLoading ? (
            <span className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-700 text-slate-400 border border-slate-200 dark:border-slate-600">
              <span className="w-3 h-3 border border-slate-400 border-t-transparent rounded-full animate-spin" />
              Checking...
            </span>
          ) : sermonUsage.length > 0 ? (
            <button
              onClick={() => setShowSermonList(v => !v)}
              title={`Used in ${sermonUsage.length} sermon${sermonUsage.length === 1 ? '' : 's'} — click to view`}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-black bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 hover:bg-amber-200 dark:hover:bg-amber-900/60 transition-all shadow-sm"
            >
              🎤 Preached {sermonUsage.length}×
              <span className="text-[10px] opacity-60">{showSermonList ? '▲' : '▼'}</span>
            </button>
          ) : (
            <span
              title="This verse has not been logged in any sermon"
              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-500 border border-slate-200 dark:border-slate-700"
            >
              <span className="text-[10px]">🎤</span> Never preached
            </span>
          )}
        </div>

        {/* Author filters */}
        <div className="flex items-center gap-2 ml-auto flex-wrap">
          {AUTHORS.map(a => (
            <button
              key={a.key}
              onClick={() => toggleAuthor(a.key)}
              className={`px-3 py-1.5 text-xs font-bold rounded-full border-2 transition-all ${
                activeAuthors.has(a.key)
                  ? `border-${a.color}-400 bg-${a.color}-100 dark:bg-${a.color}-900/30 text-${a.color}-700 dark:text-${a.color}-300`
                  : 'border-slate-200 dark:border-slate-700 text-slate-400'
              }`}
            >
              {a.label.split("'")[0].trim()}
            </button>
          ))}
        </div>
      </div>

      {/* Sermon list panel — shown directly from controls bar pill click */}
      {showSermonList && sermonUsage.length > 0 && !hasSearched && (
        <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-2">
          <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-3">Sermon History — {book} {chapter}:{verse}</p>
          {sermonUsage.map((s, i) => (
            <div key={i} className="flex items-center justify-between gap-4 text-sm">
              <div>
                <span className="font-bold text-slate-900 dark:text-white">{s.sermonTitle}</span>
                <span className="text-slate-500 dark:text-slate-400 ml-2">by {s.preacher}</span>
              </div>
              <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
            </div>
          ))}
        </div>
      )}

      {/* Results */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {loading && <LoadingSpinner text={`Looking up ${book} ${chapter}:${verse}...`} />}
        {!loading && !hasSearched && (
          <div className="flex items-center justify-center h-full text-slate-300 dark:text-slate-600">
            <div className="text-center">
              <div className="text-5xl mb-3 opacity-40">✍️</div>
              <p className="text-sm">Select a verse and click Look Up</p>
            </div>
          </div>
        )}
        {!loading && hasSearched && commentary && (
          <div className="space-y-4">
            {/* Verse header + sermon indicator */}
            <div className="flex items-center gap-3 flex-wrap">
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                {book} {chapter}:{verse}
              </h2>

              {/* Sermon usage badge */}
              {sermonUsage.length > 0 ? (
                <button
                  onClick={() => setShowSermonList(v => !v)}
                  className="flex items-center gap-1.5 px-3 py-1 bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 border border-amber-300 dark:border-amber-700 rounded-full text-xs font-black hover:bg-amber-200 dark:hover:bg-amber-900/50 transition-all"
                  title="This verse has been used in a sermon"
                >
                  🎤 Preached {sermonUsage.length}×
                  <span className="text-[10px] opacity-70">{showSermonList ? '▲' : '▼'}</span>
                </button>
              ) : (
                <span className="text-[10px] text-slate-400 italic">Never preached</span>
              )}

              {/* Log sermon button */}
              {!showLogForm && (
                <button
                  onClick={() => setShowLogForm(true)}
                  className="ml-auto flex items-center gap-1 px-3 py-1 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 rounded-full text-xs font-bold hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 transition-all"
                >
                  + Log Sermon
                </button>
              )}

              {sermonSaved && (
                <span className="text-xs text-emerald-600 dark:text-emerald-400 font-bold">✓ Saved!</span>
              )}
            </div>

            {/* Sermon list */}
            {showSermonList && sermonUsage.length > 0 && (
              <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-amber-600 dark:text-amber-400 mb-3">Sermon History</p>
                {sermonUsage.map((s, i) => (
                  <div key={i} className="flex items-center justify-between gap-4 text-sm">
                    <div>
                      <span className="font-bold text-slate-900 dark:text-white">{s.sermonTitle}</span>
                      <span className="text-slate-500 dark:text-slate-400 ml-2">by {s.preacher}</span>
                    </div>
                    <span className="text-xs text-slate-400 whitespace-nowrap">{new Date(s.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                  </div>
                ))}
              </div>
            )}

            {/* Log sermon form */}
            {showLogForm && (
              <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-xl p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Log Sermon Usage</p>
                  <button onClick={() => setShowLogForm(false)} className="text-slate-400 hover:text-slate-600 text-xs">✕</button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Sermon Title</label>
                    <input
                      type="text"
                      value={logTitle}
                      onChange={e => setLogTitle(e.target.value)}
                      placeholder="e.g. God So Loved"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Preacher</label>
                    <input
                      type="text"
                      value={logPreacher}
                      onChange={e => setLogPreacher(e.target.value)}
                      placeholder="Name"
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Date</label>
                    <input
                      type="date"
                      value={logDate}
                      onChange={e => setLogDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handleLogSermon}
                    disabled={isSavingSermon || !logTitle.trim() || !logPreacher.trim()}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black rounded-lg transition-colors"
                  >
                    {isSavingSermon ? 'Saving...' : 'Save'}
                  </button>
                </div>
              </div>
            )}

            {AUTHORS.filter(a => activeAuthors.has(a.key)).map(author => {
              const text = commentary[author.key as keyof VerseCommentary];
              if (!text) return (
                <div key={author.key} className={`rounded-xl border-l-4 p-5 ${colorMap[author.color]} opacity-50`}>
                  <div className={`text-xs font-black uppercase tracking-widest mb-2 ${badgeMap[author.color]} inline-block px-2 py-0.5 rounded-full`}>
                    {author.label}
                  </div>
                  <p className="text-sm text-slate-400 italic">No commentary available for this verse.</p>
                </div>
              );
              return (
                <div key={author.key} className={`rounded-xl border-l-4 p-5 ${colorMap[author.color]}`}>
                  <div className={`text-xs font-black uppercase tracking-widest mb-3 ${badgeMap[author.color]} inline-block px-2 py-0.5 rounded-full`}>
                    {author.label}
                  </div>
                  <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                    {text}
                  </p>
                </div>
              );
            })}
            {AUTHORS.every(a => !commentary[a.key as keyof VerseCommentary]) && (
              <div className="text-center py-8 text-slate-400">
                <p className="text-sm mb-2">No commentaries found for {book} {chapter}:{verse}.</p>
                <p className="text-xs">Run the migration script in Cloud Shell, or try a New Testament verse (these authors focused primarily on NT).</p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main LibraryView ─────────────────────────────────────────────────────────

const LibraryView: React.FC<{ churchId?: string }> = ({ churchId }) => {
  const [activeTab, setActiveTab] = useState<Tab>('greek');

  return (
    <div className="flex flex-col h-full min-h-0 gap-4">
      {/* Header */}
      <div className="flex items-center gap-4">
        <div>
          <h1 className="text-2xl font-black text-slate-900 dark:text-white">Scripture Library</h1>
          <p className="text-sm text-slate-400 mt-0.5">
            Public domain Bible reference works — Strong's Lexicons, Nave's Topics, Easton's Dictionary, and classic commentaries.
          </p>
        </div>
      </div>

      {/* Tab Bar */}
      <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-xl overflow-x-auto shrink-0">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
              activeTab === tab.id
                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
            }`}
          >
            <span className="text-base">{tab.icon}</span>
            <span className="hidden sm:inline text-xs font-black uppercase tracking-widest">{tab.label}</span>
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="flex-1 min-h-0 overflow-hidden">
        {activeTab === 'greek'        && <StrongsTab type="G" />}
        {activeTab === 'hebrew'       && <StrongsTab type="H" />}
        {activeTab === 'naves'        && <NavesTab />}
        {activeTab === 'eastons'      && <EastonsTab />}
        {activeTab === 'commentaries' && <CommentariesTab churchId={churchId} />}
      </div>
    </div>
  );
};

export default LibraryView;
