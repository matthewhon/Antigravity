import React, { useState, useEffect } from 'react';
import { DigitalBulletin, ChurchNote, Poll } from '../types';
import { EmailPreview } from './EmailPreview';
import { EmailBlock } from './EmailBuilder';
import { TemplateSettings } from '../types';

// ─── Default template settings ────────────────────────────────────────────────

const DEFAULT_TEMPLATE: TemplateSettings = {
  primaryColor: '#4f46e5',
  headerText: '',
  footerText: '',
  showLogo: false,
  font: 'Inter, sans-serif',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ─── Shell (matching PublicNoteView chrome) ────────────────────────────────────

const Shell: React.FC<{ children: React.ReactNode; churchName?: string; churchLogoUrl?: string; title?: string }> = ({
  children, churchName, churchLogoUrl, title,
}) => (
  <div className="pbv-bg min-h-screen font-sans" style={{ background: '#f8fafc' }}>
    {/* Header */}
    <header style={{ background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '14px 24px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', alignItems: 'center', gap: 12 }}>
        {churchLogoUrl ? (
          <img src={churchLogoUrl} alt={churchName || 'Church'} style={{ height: 36, width: 'auto', objectFit: 'contain', borderRadius: 8 }} />
        ) : (
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'linear-gradient(135deg,#4f46e5,#7c3aed)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              <polyline points="9 22 9 12 15 12 15 22" />
            </svg>
          </div>
        )}
        <div>
          {churchName && (
            <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b', lineHeight: 1.2 }}>{churchName}</div>
          )}
          <div style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.1em' }}>
            Digital Bulletin
          </div>
        </div>
      </div>
    </header>

    {/* Content */}
    <div style={{ padding: '32px 16px 80px', display: 'flex', justifyContent: 'center' }}>
      <div style={{ width: '100%', maxWidth: 720 }}>
        {children}
      </div>
    </div>

    {/* Footer */}
    <div style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', paddingBottom: 24 }}>
      Powered by <span style={{ fontWeight: 700, color: '#64748b' }}>Barnabas</span>
    </div>
  </div>
);

// ─── Loading ──────────────────────────────────────────────────────────────────

const LoadingCard: React.FC = () => (
  <Shell>
    <div style={{ textAlign: 'center', padding: '80px 0', color: '#94a3b8' }}>
      <div style={{ width: 32, height: 32, border: '3px solid #e2e8f0', borderTopColor: '#4f46e5', borderRadius: '50%', animation: 'spin 0.8s linear infinite', margin: '0 auto 12px' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>
      <p style={{ fontSize: 14 }}>Loading bulletin…</p>
    </div>
  </Shell>
);

// ─── Not Found ────────────────────────────────────────────────────────────────

const NotFoundCard: React.FC = () => (
  <Shell>
    <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.06)', padding: '56px 40px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>🔍</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>Bulletin Not Found</h2>
      <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>This link may be invalid or the bulletin has been removed.</p>
    </div>
  </Shell>
);

// ─── Not Published ────────────────────────────────────────────────────────────

const DraftCard: React.FC = () => (
  <Shell>
    <div style={{ background: '#fff', borderRadius: 20, boxShadow: '0 4px 24px rgba(0,0,0,0.08)', border: '1px solid rgba(0,0,0,0.06)', padding: '56px 40px', textAlign: 'center' }}>
      <div style={{ fontSize: 48, marginBottom: 16 }}>✏️</div>
      <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>Not Yet Published</h2>
      <p style={{ fontSize: 14, color: '#64748b', margin: 0 }}>This bulletin hasn't been published yet. Check back soon.</p>
    </div>
  </Shell>
);

// ─── Embedded Note Block ──────────────────────────────────────────────────────

const EmbeddedNote: React.FC<{ itemId: string }> = ({ itemId }) => {
  const [note, setNote] = useState<ChurchNote | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const { firestore } = await import('../services/firestoreService');
        const data = await firestore.getNote(itemId);
        setNote(data);
      } catch { /* non-fatal */ } finally {
        setLoading(false);
      }
    };
    if (itemId) load();
    else setLoading(false);
  }, [itemId]);

  if (loading) return (
    <div style={{ padding: '20px', background: '#f8faff', borderRadius: 12, border: '1px solid #e0e7ff', color: '#6366f1', fontSize: 13 }}>
      Loading note…
    </div>
  );
  if (!note) return (
    <div style={{ padding: '20px', background: '#f8faff', borderRadius: 12, border: '1px solid #e0e7ff', color: '#94a3b8', fontSize: 13 }}>
      Note not found.
    </div>
  );

  return (
    <div style={{ background: '#f8faff', borderRadius: 14, border: '1px solid #c7d2fe', overflow: 'hidden', marginBottom: 4 }}>
      <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid #e0e7ff', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>📝</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#4338ca' }}>{note.title}</span>
      </div>
      <div
        style={{ padding: '16px 20px', fontSize: 14, color: '#334155', lineHeight: 1.7 }}
        // Safe: note content is admin-authored, not user-submitted
        dangerouslySetInnerHTML={{ __html: note.content }}
      />
    </div>
  );
};

// ─── Embedded Poll Block ──────────────────────────────────────────────────────

const EmbeddedPoll: React.FC<{ itemId: string }> = ({ itemId }) => {
  const [poll, setPoll] = useState<Poll | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitted, setSubmitted] = useState(false);
  const [answers, setAnswers] = useState<Record<string, string | string[]>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { firestore } = await import('../services/firestoreService');
        const data = await firestore.getPoll(itemId);
        setPoll(data);
      } catch { /* non-fatal */ } finally {
        setLoading(false);
      }
    };
    if (itemId) load();
    else setLoading(false);
  }, [itemId]);

  const handleSubmit = async () => {
    if (!poll) return;
    setSubmitting(true);
    try {
      const { firestore } = await import('../services/firestoreService');
      const response = {
        id: `resp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
        pollId: poll.id,
        churchId: poll.churchId,
        answers: Object.entries(answers).map(([questionId, value]) => ({ questionId, value: Array.isArray(value) ? value : [value] })),
        submittedAt: Date.now(),
        sessionToken: Math.random().toString(36).slice(2),
      };
      await firestore.submitPollResponse(response as any);
      setSubmitted(true);
    } catch (e) {
      console.error('Poll submission error:', e);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return (
    <div style={{ padding: '20px', background: '#faf5ff', borderRadius: 12, border: '1px solid #e9d5ff', color: '#7c3aed', fontSize: 13 }}>
      Loading poll…
    </div>
  );
  if (!poll) return (
    <div style={{ padding: '20px', background: '#faf5ff', borderRadius: 12, border: '1px solid #e9d5ff', color: '#94a3b8', fontSize: 13 }}>
      Poll not found.
    </div>
  );

  if (poll.status === 'closed') return (
    <div style={{ background: '#faf5ff', borderRadius: 14, border: '1px solid #d8b4fe', padding: '20px' }}>
      <div style={{ fontWeight: 700, color: '#7c3aed', fontSize: 14, marginBottom: 4 }}>📊 {poll.title}</div>
      <div style={{ fontSize: 13, color: '#94a3b8' }}>This poll is now closed.</div>
    </div>
  );

  if (submitted) return (
    <div style={{ background: '#f0fdf4', borderRadius: 14, border: '1px solid #bbf7d0', padding: '24px', textAlign: 'center' }}>
      <div style={{ fontSize: 28, marginBottom: 8 }}>✅</div>
      <div style={{ fontWeight: 700, color: '#15803d', fontSize: 15 }}>Thank you for responding!</div>
    </div>
  );

  return (
    <div style={{ background: '#faf5ff', borderRadius: 14, border: '1px solid #d8b4fe', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid #e9d5ff', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>📊</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#7c3aed' }}>{poll.title}</span>
      </div>
      <div style={{ padding: '16px 20px' }}>
        {poll.description && <p style={{ fontSize: 13, color: '#64748b', marginBottom: 16 }}>{poll.description}</p>}
        {poll.questions.map(q => (
          <div key={q.id} style={{ marginBottom: 20 }}>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e293b', marginBottom: 10 }}>
              {q.text}{q.required && <span style={{ color: '#ef4444', marginLeft: 2 }}>*</span>}
            </div>
            {(q.type === 'single_choice' || q.type === 'yes_no' || q.type === 'thumbs_up_down') && q.options && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {q.options.map((opt: string) => (
                  <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: '#334155' }}>
                    <input
                      type="radio"
                      name={q.id}
                      value={opt}
                      checked={answers[q.id] === opt}
                      onChange={() => setAnswers(prev => ({ ...prev, [q.id]: opt }))}
                      style={{ accentColor: '#7c3aed' }}
                    />
                    {opt}
                  </label>
                ))}
              </div>
            )}
            {q.type === 'multiple_choice' && q.options && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {q.options.map((opt: string) => {
                  const selected = (answers[q.id] as string[] || []);
                  return (
                    <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', fontSize: 14, color: '#334155' }}>
                      <input
                        type="checkbox"
                        checked={selected.includes(opt)}
                        onChange={e => {
                          const next = e.target.checked ? [...selected, opt] : selected.filter(v => v !== opt);
                          setAnswers(prev => ({ ...prev, [q.id]: next }));
                        }}
                        style={{ accentColor: '#7c3aed' }}
                      />
                      {opt}
                    </label>
                  );
                })}
              </div>
            )}
            {q.type === 'text' && (
              <textarea
                placeholder="Your answer…"
                value={(answers[q.id] as string) || ''}
                onChange={e => setAnswers(prev => ({ ...prev, [q.id]: e.target.value }))}
                style={{ width: '100%', minHeight: 80, padding: '10px 12px', borderRadius: 8, border: '1px solid #d8b4fe', fontSize: 14, color: '#1e293b', boxSizing: 'border-box', resize: 'vertical', outline: 'none', fontFamily: 'inherit' }}
              />
            )}
            {q.type === 'rating' && (
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Array.from({ length: q.ratingMax || 5 }, (_, i) => i + 1).map(n => (
                  <button
                    key={n}
                    onClick={() => setAnswers(prev => ({ ...prev, [q.id]: String(n) }))}
                    style={{ width: 40, height: 40, borderRadius: 8, border: answers[q.id] === String(n) ? '2px solid #7c3aed' : '1px solid #d8b4fe', background: answers[q.id] === String(n) ? '#7c3aed' : '#fff', color: answers[q.id] === String(n) ? '#fff' : '#7c3aed', fontWeight: 700, cursor: 'pointer', fontSize: 15 }}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}
        <button
          onClick={handleSubmit}
          disabled={submitting}
          style={{ background: '#7c3aed', color: '#fff', border: 'none', borderRadius: 8, padding: '10px 24px', fontSize: 14, fontWeight: 700, cursor: submitting ? 'wait' : 'pointer', opacity: submitting ? 0.7 : 1, marginTop: 4 }}
        >
          {submitting ? 'Submitting…' : 'Submit Response'}
        </button>
      </div>
    </div>
  );
};

// ─── Embedded Form Block ──────────────────────────────────────────────────────

const EmbeddedForm: React.FC<{ itemId: string; churchId: string }> = ({ itemId, churchId }) => {
  // Render as a link-out to the existing PublicFormView to keep parity with existing form logic
  const formUrl = `${window.location.origin}/form/${churchId}/${itemId}`;
  return (
    <div style={{ background: '#f0fdf4', borderRadius: 14, border: '1px solid #bbf7d0', overflow: 'hidden' }}>
      <div style={{ padding: '14px 20px 10px', borderBottom: '1px solid #bbf7d0', display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ fontSize: 14 }}>📋</span>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#15803d' }}>Form</span>
      </div>
      <div style={{ padding: '16px 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ fontSize: 13, color: '#334155' }}>Click below to fill out this form.</span>
        <a
          href={formUrl}
          target="_blank"
          rel="noopener noreferrer"
          style={{ background: '#16a34a', color: '#fff', borderRadius: 8, padding: '8px 18px', fontSize: 13, fontWeight: 700, textDecoration: 'none', whiteSpace: 'nowrap' }}
        >
          Open Form →
        </a>
      </div>
    </div>
  );
};

// ─── Block Renderer — handles embedded types, delegates rest to EmailPreview ───

const BulletinBlockRenderer: React.FC<{ blocks: EmailBlock[]; settings: TemplateSettings; churchId: string; churchLogoUrl?: string }> = ({
  blocks, settings, churchId, churchLogoUrl,
}) => {
  // Separate blocks into segments: runs of regular blocks and individual embedded blocks
  const segments: Array<{ type: 'regular'; blocks: EmailBlock[] } | { type: 'embedded'; block: EmailBlock }> = [];

  let regularRun: EmailBlock[] = [];
  for (const block of blocks) {
    if (['embedded_note', 'embedded_poll', 'embedded_form'].includes(block.type)) {
      if (regularRun.length) {
        segments.push({ type: 'regular', blocks: regularRun });
        regularRun = [];
      }
      segments.push({ type: 'embedded', block });
    } else {
      regularRun.push(block);
    }
  }
  if (regularRun.length) segments.push({ type: 'regular', blocks: regularRun });

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {segments.map((seg, i) => {
        if (seg.type === 'regular') {
          return (
            <div key={i} style={{ borderRadius: 12, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.06)' }}>
              <EmailPreview
                blocks={seg.blocks}
                settings={settings}
                churchLogoUrl={churchLogoUrl}
                contentType="blocks"
                content=""
              />
            </div>
          );
        }
        const block = seg.block;
        const c = block.content || {};
        if (block.type === 'embedded_note') {
          return <EmbeddedNote key={i} itemId={c.itemId || ''} />;
        }
        if (block.type === 'embedded_poll') {
          return <EmbeddedPoll key={i} itemId={c.itemId || ''} />;
        }
        if (block.type === 'embedded_form') {
          return <EmbeddedForm key={i} itemId={c.itemId || ''} churchId={churchId} />;
        }
        return null;
      })}
    </div>
  );
};

// ─── Main Public Bulletin View ─────────────────────────────────────────────────

export const PublicBulletinView: React.FC<{ bulletinId: string }> = ({ bulletinId }) => {
  const [bulletin, setBulletin] = useState<DigitalBulletin | null>(null);
  const [churchName, setChurchName] = useState('');
  const [churchLogoUrl, setChurchLogoUrl] = useState<string | undefined>();
  const [loadState, setLoadState] = useState<'loading' | 'ready' | 'not_found' | 'draft'>('loading');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const { firestore } = await import('../services/firestoreService');
        const data = await firestore.getBulletin(bulletinId);
        if (!data) { setLoadState('not_found'); return; }
        if (data.status !== 'published') { setLoadState('draft'); return; }
        setBulletin(data);
        try {
          const church = await firestore.getChurch(data.churchId);
          if (church?.name) setChurchName(church.name);
          if (church?.logoUrl) setChurchLogoUrl(church.logoUrl);
        } catch { /* non-fatal */ }
        setLoadState('ready');
      } catch {
        setLoadState('not_found');
      }
    };
    load();
  }, [bulletinId]);

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* fallback */ }
  };

  if (loadState === 'loading') return <LoadingCard />;
  if (loadState === 'not_found') return <NotFoundCard />;
  if (loadState === 'draft') return <DraftCard />;
  if (!bulletin) return null;

  const blocks = (bulletin.blocks || []) as EmailBlock[];
  const settings: TemplateSettings = bulletin.templateSettings || DEFAULT_TEMPLATE;

  return (
    <Shell churchName={churchName} churchLogoUrl={churchLogoUrl} title={bulletin.title}>
      {/* Title card */}
      <div style={{ background: '#fff', borderRadius: 16, boxShadow: '0 2px 12px rgba(0,0,0,0.06)', border: '1px solid #e2e8f0', padding: '28px 32px 24px', marginBottom: 20 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
          <div>
            {churchName && (
              <div style={{ fontSize: 11, fontWeight: 700, color: '#6366f1', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>
                ⛪ {churchName}
              </div>
            )}
            <h1 style={{ fontSize: 'clamp(22px, 5vw, 30px)', fontWeight: 800, color: '#0f172a', margin: 0, lineHeight: 1.2 }}>
              {bulletin.title}
            </h1>
            {bulletin.publishedAt && (
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 6 }}>
                {formatDate(bulletin.publishedAt)}
              </div>
            )}
          </div>
          <button
            onClick={handleCopyLink}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 20, border: 'none', cursor: 'pointer',
              fontSize: 12, fontWeight: 700, color: '#fff',
              background: copied ? '#16a34a' : '#4f46e5',
              transition: 'background 0.2s',
              whiteSpace: 'nowrap',
              flexShrink: 0,
            }}
          >
            {copied ? '✓ Copied!' : '🔗 Share'}
          </button>
        </div>
      </div>

      {/* Content blocks */}
      {blocks.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: '#94a3b8', fontSize: 14 }}>
          No content yet.
        </div>
      ) : (
        <BulletinBlockRenderer
          blocks={blocks}
          settings={settings}
          churchId={bulletin.churchId}
          churchLogoUrl={churchLogoUrl}
        />
      )}
    </Shell>
  );
};
