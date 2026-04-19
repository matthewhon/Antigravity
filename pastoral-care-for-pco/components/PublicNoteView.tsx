import React, { useState, useEffect } from 'react';
import { ChurchNote } from '../types';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

// ─── Shell (shared chrome) ────────────────────────────────────────────────────

const Shell: React.FC<{ children: React.ReactNode; churchName?: string }> = ({ children, churchName }) => (
  <div className="pnv-bg min-h-screen font-sans">
    {/* Header */}
    <header className="pnv-header px-6 py-3.5">
      <div className="max-w-[680px] mx-auto flex items-center gap-3">
        {/* Brand icon */}
        <div className="pnv-brand-icon w-8 h-8 rounded-[10px] flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </div>
        <div>
          {churchName && (
            <div className="text-[13px] font-bold text-slate-800 leading-tight">{churchName}</div>
          )}
          <div className="text-[10px] text-slate-400 font-semibold uppercase tracking-[0.1em]">Church Note</div>
        </div>
      </div>
    </header>

    {/* Content */}
    <div className="px-4 pt-10 pb-20 flex justify-center">
      <div className="w-full max-w-[680px]">
        {children}
      </div>
    </div>

    {/* Footer */}
    <div className="text-center text-[11px] text-slate-400 pb-6">
      Powered by{' '}
      <span className="font-bold text-slate-500">Barnabas</span>
    </div>
  </div>
);

// ─── Loading State ─────────────────────────────────────────────────────────────

const LoadingCard: React.FC = () => (
  <Shell>
    <div className="text-center py-20 text-slate-400">
      <div className="pnv-spinner" />
      <p className="text-[14px]">Loading note…</p>
    </div>
  </Shell>
);

// ─── Not Found State ───────────────────────────────────────────────────────────

const NotFoundCard: React.FC = () => (
  <Shell>
    <div className="bg-white rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-black/[0.06] px-10 py-14 text-center">
      <div className="text-5xl mb-4">🔍</div>
      <h2 className="text-[22px] font-extrabold text-slate-900 mb-2">Note Not Found</h2>
      <p className="text-[14px] text-slate-500">
        This link may be invalid or the note has been removed.
      </p>
    </div>
  </Shell>
);

// ─── Error State ───────────────────────────────────────────────────────────────

const ErrorCard: React.FC = () => (
  <Shell>
    <div className="bg-white rounded-[20px] shadow-[0_4px_24px_rgba(0,0,0,0.08)] border border-red-500/15 px-10 py-14 text-center">
      <div className="text-5xl mb-4">⚠️</div>
      <h2 className="text-[22px] font-extrabold text-slate-900 mb-2">Something went wrong</h2>
      <p className="text-[14px] text-slate-500">Unable to load this note. Please try again later.</p>
    </div>
  </Shell>
);

// ─── Main Public Note View ─────────────────────────────────────────────────────

export const PublicNoteView: React.FC<{ noteId: string }> = ({ noteId }) => {
  const [note, setNote] = useState<ChurchNote | null>(null);
  const [churchName, setChurchName] = useState<string>('');
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'not_found' | 'error'>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const loadNote = async () => {
      try {
        const { firestore } = await import('../services/firestoreService');
        const data = await firestore.getNote(noteId);
        if (!data) {
          setLoadState('not_found');
          return;
        }
        setNote(data);
        try {
          const church = await firestore.getChurch(data.churchId);
          if (church?.name) setChurchName(church.name);
        } catch { /* non-fatal */ }
        setLoadState('ready');
      } catch {
        setLoadState('error');
      }
    };
    loadNote();
  }, [noteId]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {
      // fallback
    }
  };

  if (loadState === 'loading') return <LoadingCard />;
  if (loadState === 'not_found') return <NotFoundCard />;
  if (loadState === 'error') return <ErrorCard />;
  if (!note) return null;

  const isDraft = note.status === 'draft';

  return (
    <Shell churchName={churchName}>
      {/* Draft banner */}
      {isDraft && (
        <div className="pnv-draft-banner border border-amber-400 rounded-xl px-[18px] py-2.5 mb-5 flex items-center gap-2.5 text-[13px] font-semibold text-amber-900">
          <span>✏️</span>
          <span>Preview — this note hasn't been published yet</span>
        </div>
      )}

      {/* Main note card */}
      <div className="pnv-card bg-white rounded-3xl border border-black/[0.05] overflow-hidden">

        {/* Rainbow top bar */}
        <div className="pnv-card-top-bar" />

        {/* Card body */}
        <div className="px-11 pt-10 pb-11">

          {/* Church + date meta */}
          <div className="flex items-center justify-between mb-7 flex-wrap gap-2">
            {churchName && (
              <div className="pnv-church-pill inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold text-indigo-700 uppercase tracking-widest">
                <span>⛪</span> {churchName}
              </div>
            )}
            <div className="text-xs text-slate-400 font-medium">
              {formatDate(note.updatedAt || note.createdAt)}
            </div>
          </div>

          {/* Title */}
          <h1 className="text-[clamp(26px,5vw,36px)] font-extrabold text-slate-900 leading-tight mb-7 tracking-tight">
            {note.title || 'Untitled Note'}
          </h1>

          {/* Author byline */}
          <div className="flex items-center gap-3 mb-9 pb-7 border-b border-slate-100">
            {/* Avatar */}
            <div className="pnv-avatar w-11 h-11 rounded-full flex items-center justify-center text-white font-extrabold text-sm shrink-0">
              {getInitials(note.authorName || 'A')}
            </div>
            <div>
              <div className="text-[14px] font-bold text-slate-800">{note.authorName || 'Church Staff'}</div>
              <div className="text-xs text-slate-400 mt-0.5">{churchName || 'Church Leader'}</div>
            </div>
          </div>

          {/* Content */}
          <div
            className="note-content"
            // Safe: content is authored by admin, not user-submitted
            dangerouslySetInnerHTML={{ __html: note.content.replace(/\n/g, '<br/>') }}
          />
        </div>

        {/* Card footer */}
        <div className="px-11 py-5 bg-slate-50 border-t border-slate-100 flex items-center justify-between flex-wrap gap-3">
          <div className="text-xs text-slate-400">
            Shared by {note.authorName || 'Church Staff'}
            {churchName ? ` · ${churchName}` : ''}
          </div>

          <button
            onClick={handleCopyLink}
            className={`flex items-center gap-1.5 px-[18px] py-2 rounded-full text-xs font-bold text-white cursor-pointer border-none ${
              copied ? 'pnv-btn-copied' : 'pnv-btn-copy'
            }`}
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              {copied
                ? <path d="M20 6L9 17l-5-5" />
                : <><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 01-2-2V4a2 2 0 012-2h9a2 2 0 012 2v1" /></>
              }
            </svg>
            {copied ? 'Copied!' : 'Copy Link'}
          </button>
        </div>
      </div>
    </Shell>
  );
};
