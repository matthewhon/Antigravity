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
  <div className="min-h-screen font-sans" style={{
    background: 'linear-gradient(135deg, #fdf4ff 0%, #fef9ec 35%, #eff6ff 70%, #f0fdf4 100%)',
  }}>
    {/* Header */}
    <header style={{
      background: 'rgba(255,255,255,0.85)',
      backdropFilter: 'blur(12px)',
      borderBottom: '1px solid rgba(0,0,0,0.07)',
      padding: '14px 24px',
    }}>
      <div style={{ maxWidth: 680, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        {/* Brand icon */}
        <div style={{
          width: 32, height: 32, borderRadius: 10,
          background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 2px 8px rgba(79,70,229,0.35)',
          flexShrink: 0,
        }}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z" />
          </svg>
        </div>
        <div>
          {churchName && (
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>
              {churchName}
            </div>
          )}
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Church Note
          </div>
        </div>
      </div>
    </header>

    {/* Content */}
    <div style={{ padding: '40px 16px 80px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 680 }}>
        {children}
      </div>
    </div>

    {/* Footer */}
    <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', paddingBottom: 24 }}>
      Powered by{' '}
      <span style={{ fontWeight: 700, color: '#64748b' }}>Barnabas</span>
    </div>
  </div>
);

// ─── Loading State ─────────────────────────────────────────────────────────────

const LoadingCard: React.FC = () => (
  <Shell>
    <div style={{ textAlign: 'center', padding: '80px 0', color: '#94a3b8' }}>
      <div style={{
        width: 40, height: 40, margin: '0 auto 16px',
        border: '3px solid #e2e8f0', borderTopColor: '#4f46e5',
        borderRadius: '50%', animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ fontSize: 14 }}>Loading note…</p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  </Shell>
);

// ─── Not Found State ───────────────────────────────────────────────────────────

const NotFoundCard: React.FC = () => (
  <Shell>
    <div style={{
      background: 'white', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      border: '1px solid rgba(0,0,0,0.06)', padding: '56px 40px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>Note Not Found</h2>
      <p style={{ fontSize: 14, color: '#64748b' }}>
        This link may be invalid or the note has been removed.
      </p>
    </div>
  </Shell>
);

// ─── Error State ───────────────────────────────────────────────────────────────

const ErrorCard: React.FC = () => (
  <Shell>
    <div style={{
      background: 'white', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)',
      border: '1px solid rgba(239,68,68,0.15)', padding: '56px 40px', textAlign: 'center',
    }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>⚠️</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#1e293b', marginBottom: 8 }}>Something went wrong</h2>
      <p style={{ fontSize: 14, color: '#64748b' }}>Unable to load this note. Please try again later.</p>
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
        // Fetch church name for branding
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
        <div style={{
          background: 'linear-gradient(90deg, #fef3c7, #fde68a)',
          border: '1px solid #fbbf24',
          borderRadius: 12,
          padding: '10px 18px',
          marginBottom: 20,
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          fontSize: 13,
          fontWeight: 600,
          color: '#92400e',
        }}>
          <span>✏️</span>
          <span>Preview — this note hasn't been published yet</span>
        </div>
      )}

      {/* Main note card */}
      <div style={{
        background: 'white',
        borderRadius: 24,
        boxShadow: '0 8px 40px rgba(0,0,0,0.10), 0 1px 3px rgba(0,0,0,0.06)',
        border: '1px solid rgba(0,0,0,0.05)',
        overflow: 'hidden',
      }}>

        {/* Decorative top bar */}
        <div style={{
          height: 5,
          background: 'linear-gradient(90deg, #4f46e5, #7c3aed, #a855f7, #ec4899)',
        }} />

        {/* Card body */}
        <div style={{ padding: '40px 44px 44px' }}>

          {/* Church + date meta */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: 28,
            flexWrap: 'wrap', gap: 8,
          }}>
            {churchName && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                background: 'linear-gradient(135deg, #eef2ff, #f5f3ff)',
                border: '1px solid #c7d2fe',
                borderRadius: 20, padding: '4px 12px',
                fontSize: 11, fontWeight: 700, color: '#4338ca',
                textTransform: 'uppercase', letterSpacing: '0.08em',
              }}>
                <span>⛪</span> {churchName}
              </div>
            )}
            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 500 }}>
              {formatDate(note.updatedAt || note.createdAt)}
            </div>
          </div>

          {/* Title */}
          <h1 style={{
            fontSize: 'clamp(26px, 5vw, 36px)',
            fontWeight: 800,
            color: '#0f172a',
            lineHeight: 1.2,
            marginBottom: 28,
            letterSpacing: '-0.02em',
          }}>
            {note.title || 'Untitled Note'}
          </h1>

          {/* Author byline */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            marginBottom: 36,
            paddingBottom: 28,
            borderBottom: '1px solid #f1f5f9',
          }}>
            {/* Avatar */}
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontWeight: 800, fontSize: 14,
              boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
              flexShrink: 0,
            }}>
              {getInitials(note.authorName || 'A')}
            </div>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>
                {note.authorName || 'Church Staff'}
              </div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                {churchName || 'Church Leader'}
              </div>
            </div>
          </div>

          {/* Content */}
          <div
            className="note-content"
            style={{
              fontSize: 16,
              lineHeight: 1.8,
              color: '#334155',
            }}
            // Safe: content is authored by admin, not user-submitted
            dangerouslySetInnerHTML={{ __html: note.content.replace(/\n/g, '<br/>') }}
          />
        </div>

        {/* Card footer */}
        <div style={{
          padding: '20px 44px',
          background: '#f8fafc',
          borderTop: '1px solid #f1f5f9',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          flexWrap: 'wrap', gap: 12,
        }}>
          <div style={{ fontSize: 12, color: '#94a3b8' }}>
            Shared by {note.authorName || 'Church Staff'}
            {churchName ? ` · ${churchName}` : ''}
          </div>

          <button
            onClick={handleCopyLink}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '8px 18px',
              background: copied
                ? 'linear-gradient(135deg, #10b981, #059669)'
                : 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              color: 'white',
              border: 'none',
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              cursor: 'pointer',
              boxShadow: copied
                ? '0 2px 8px rgba(16,185,129,0.35)'
                : '0 2px 8px rgba(79,70,229,0.35)',
              transition: 'all 0.2s',
            }}
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

      {/* Style overrides for note content */}
      <style>{`
        .note-content h1, .note-content h2, .note-content h3 {
          font-weight: 700; color: #0f172a; margin: 1.5em 0 0.5em;
        }
        .note-content h1 { font-size: 1.6em; }
        .note-content h2 { font-size: 1.3em; }
        .note-content h3 { font-size: 1.1em; }
        .note-content p { margin: 0 0 1em; }
        .note-content ul, .note-content ol { padding-left: 1.5em; margin: 0.5em 0 1em; }
        .note-content li { margin-bottom: 0.3em; }
        .note-content strong { font-weight: 700; color: #1e293b; }
        .note-content em { font-style: italic; }
        .note-content blockquote {
          border-left: 4px solid #c7d2fe; margin: 1em 0; padding: 8px 16px;
          background: #eef2ff; border-radius: 0 8px 8px 0; color: #4338ca;
          font-style: italic;
        }
        .note-content a { color: #4f46e5; text-decoration: underline; }
      `}</style>
    </Shell>
  );
};
