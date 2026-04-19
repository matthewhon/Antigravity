import React, { useState, useEffect, useCallback } from 'react';
import { ChurchNote, NoteStatus, Church, User } from '../types';
import { firestore } from '../services/firestoreService';
import {
  Plus, ArrowLeft, Copy, Trash2, Pencil, FileText,
  CheckCircle, Globe, Lock, Clock, Loader2, Link, Eye,
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function newNoteId(): string {
  return `note_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
}

function formatRelative(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function publicUrl(noteId: string): string {
  return `${window.location.origin}/note/${noteId}`;
}

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, '').replace(/&nbsp;/g, ' ');
}

// ─── Toast ────────────────────────────────────────────────────────────────────

interface ToastMsg { msg: string; type: 'success' | 'error' }

// ─── Note Card (list view) ────────────────────────────────────────────────────

const NoteCard: React.FC<{
  note: ChurchNote;
  onEdit: () => void;
  onDelete: () => void;
  onCopyLink: () => void;
}> = ({ note, onEdit, onDelete, onCopyLink }) => {
  const preview = stripHtml(note.content).slice(0, 140).trim();
  const isPublished = note.status === 'published';

  return (
    <div
      onClick={onEdit}
      style={{
        background: 'white',
        border: '1px solid #e2e8f0',
        borderRadius: 16,
        padding: '20px 22px',
        cursor: 'pointer',
        transition: 'all 0.18s',
        position: 'relative',
        overflow: 'hidden',
      }}
      className="note-card-hover"
    >
      {/* Left accent bar */}
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
        background: isPublished
          ? 'linear-gradient(180deg, #10b981, #059669)'
          : 'linear-gradient(180deg, #94a3b8, #64748b)',
        borderRadius: '16px 0 0 16px',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        {/* Content */}
        <div style={{ flex: 1, minWidth: 0 }}>
          {/* Status badge */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em',
              padding: '2px 8px', borderRadius: 20,
              background: isPublished ? '#d1fae5' : '#f1f5f9',
              color: isPublished ? '#065f46' : '#475569',
              border: `1px solid ${isPublished ? '#a7f3d0' : '#e2e8f0'}`,
            }}>
              {isPublished ? <Globe size={9} /> : <Lock size={9} />}
              {isPublished ? 'Published' : 'Draft'}
            </span>
            <span style={{ fontSize: 11, color: '#94a3b8' }}>
              {formatRelative(note.updatedAt || note.createdAt)}
            </span>
          </div>

          {/* Title */}
          <h3 style={{
            fontSize: 16, fontWeight: 700, color: '#0f172a',
            marginBottom: 6, lineHeight: 1.3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {note.title || 'Untitled Note'}
          </h3>

          {/* Preview */}
          {preview && (
            <p style={{
              fontSize: 13, color: '#64748b', lineHeight: 1.55,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden',
              margin: '0 0 10px',
            }}>
              {preview}
            </p>
          )}

          {/* Author */}
          <div style={{ fontSize: 12, color: '#94a3b8', display: 'flex', alignItems: 'center', gap: 5 }}>
            <div style={{
              width: 18, height: 18, borderRadius: '50%',
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: 8, fontWeight: 800, flexShrink: 0,
            }}>
              {(note.authorName || 'A').charAt(0).toUpperCase()}
            </div>
            {note.authorName || 'Unknown'}
          </div>
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, flexShrink: 0 }}
          onClick={e => e.stopPropagation()}>
          <ActionBtn title="Edit" onClick={onEdit} icon={<Pencil size={13} />} />
          {isPublished && (
            <ActionBtn title="Copy link" onClick={onCopyLink} icon={<Link size={13} />} />
          )}
          <ActionBtn title="Delete" onClick={onDelete} icon={<Trash2 size={13} />} danger />
        </div>
      </div>
    </div>
  );
};

const ActionBtn: React.FC<{
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  danger?: boolean;
}> = ({ onClick, icon, title, danger }) => (
  <button
    onClick={onClick}
    title={title}
    style={{
      width: 30, height: 30, borderRadius: 8,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      border: '1px solid #e2e8f0',
      background: 'white',
      color: danger ? '#ef4444' : '#64748b',
      cursor: 'pointer',
      transition: 'all 0.15s',
    }}
    className={danger ? 'action-btn-danger' : 'action-btn'}
  >
    {icon}
  </button>
);

// ─── Editor ───────────────────────────────────────────────────────────────────

const NoteEditor: React.FC<{
  note: ChurchNote;
  church?: Church;
  onBack: () => void;
  onSaved: (note: ChurchNote) => void;
  showToast: (msg: string, type?: 'success' | 'error') => void;
}> = ({ note: initialNote, church, onBack, onSaved, showToast }) => {
  const [note, setNote] = useState<ChurchNote>(initialNote);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);

  const update = (patch: Partial<ChurchNote>) => {
    setNote(prev => ({ ...prev, ...patch, updatedAt: Date.now() }));
  };

  const save = useCallback(async (overrideStatus?: NoteStatus) => {
    setIsSaving(true);
    try {
      const toSave: ChurchNote = {
        ...note,
        status: overrideStatus ?? note.status,
        updatedAt: Date.now(),
      };
      await firestore.saveNote(toSave);
      setNote(toSave);
      setLastSaved(Date.now());
      onSaved(toSave);
      showToast(overrideStatus === 'published' ? '🎉 Note published!' : '✓ Saved');
      return toSave;
    } catch (e: any) {
      showToast(e?.message || 'Save failed', 'error');
    } finally {
      setIsSaving(false);
    }
  }, [note, onSaved, showToast]);

  const handlePublishAndCopy = async () => {
    const saved = await save('published');
    if (saved) {
      try {
        await navigator.clipboard.writeText(publicUrl(saved.id));
        setCopied(true);
        setTimeout(() => setCopied(false), 3000);
        showToast('Link copied! Ready to send via SMS ✉️');
      } catch { /* ignore */ }
    }
  };

  const handleCopyLink = async () => {
    try {
      await navigator.clipboard.writeText(publicUrl(note.id));
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
      showToast('Link copied to clipboard!');
    } catch { /* ignore */ }
  };

  const isPublished = note.status === 'published';

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>

      {/* ── Editor Header ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '14px 24px',
        background: 'white',
        borderBottom: '1px solid #e2e8f0',
        flexShrink: 0,
        flexWrap: 'wrap', gap: 12,
      }}>
        {/* Left: back + breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <button
            onClick={onBack}
            style={{
              width: 32, height: 32, borderRadius: 8, border: '1px solid #e2e8f0',
              background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', color: '#64748b',
            }}
          >
            <ArrowLeft size={16} />
          </button>
          <div style={{ fontSize: 13, color: '#64748b' }}>
            <span
              style={{ cursor: 'pointer', fontWeight: 500 }}
              onClick={onBack}
            >Notes</span>
            <span style={{ margin: '0 6px' }}>›</span>
            <span style={{ fontWeight: 700, color: '#1e293b' }}>
              {note.title || 'New Note'}
            </span>
          </div>
          {lastSaved && (
            <span style={{
              fontSize: 10, color: '#10b981', fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 4,
            }}>
              <CheckCircle size={10} /> Saved
            </span>
          )}
        </div>

        {/* Right: actions */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Status pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 700,
            padding: '4px 12px', borderRadius: 20,
            background: isPublished ? '#d1fae5' : '#f1f5f9',
            color: isPublished ? '#065f46' : '#475569',
            border: `1px solid ${isPublished ? '#a7f3d0' : '#e2e8f0'}`,
          }}>
            {isPublished ? <Globe size={11} /> : <Lock size={11} />}
            {isPublished ? 'Published' : 'Draft'}
          </div>

          {/* Copy link (if published) */}
          {isPublished && (
            <button
              onClick={handleCopyLink}
              title="Copy public link"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 10,
                border: '1px solid #c7d2fe',
                background: '#eef2ff', color: '#4338ca',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {copied ? <CheckCircle size={13} /> : <Link size={13} />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          )}

          {/* Save draft */}
          <button
            onClick={() => save('draft')}
            disabled={isSaving}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10,
              border: '1px solid #e2e8f0',
              background: 'white', color: '#475569',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            {isSaving ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Clock size={13} />}
            Save Draft
          </button>

          {/* Publish + copy link */}
          <button
            onClick={handlePublishAndCopy}
            disabled={isSaving}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 10,
              border: 'none',
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              color: 'white',
              fontSize: 12, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
              opacity: isSaving ? 0.7 : 1,
            }}
          >
            {isSaving
              ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
              : <Globe size={13} />
            }
            Publish & Copy Link
          </button>
        </div>
      </div>

      {/* ── Editor Body ── */}
      <div style={{
        flex: 1, overflowY: 'auto',
        background: '#f8fafc',
        display: 'flex', justifyContent: 'center',
        padding: '32px 16px',
      }}>
        <div style={{ width: '100%', maxWidth: 720 }}>

          {/* Church/author preview strip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            marginBottom: 20, padding: '10px 16px',
            background: 'white', borderRadius: 12,
            border: '1px solid #e2e8f0',
            fontSize: 13, color: '#64748b',
          }}>
            <div style={{
              width: 32, height: 32, borderRadius: '50%',
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: 'white', fontSize: 11, fontWeight: 800, flexShrink: 0,
            }}>
              {(note.authorName || 'A').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1 }}>
              <input
                type="text"
                value={note.authorName}
                onChange={e => update({ authorName: e.target.value })}
                placeholder="Author name…"
                style={{
                  border: 'none', outline: 'none', fontSize: 13,
                  fontWeight: 700, color: '#1e293b', background: 'transparent',
                  width: '100%',
                }}
              />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                {church?.name || 'Your Church'}
              </div>
            </div>

            {/* Preview link */}
            <a
              href={publicUrl(note.id)}
              target="_blank"
              rel="noopener noreferrer"
              title="Preview public view"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                fontSize: 11, color: '#4f46e5', fontWeight: 600,
                textDecoration: 'none', flexShrink: 0,
              }}
            >
              <Eye size={12} /> Preview
            </a>
          </div>

          {/* Title input */}
          <textarea
            value={note.title}
            onChange={e => update({ title: e.target.value })}
            placeholder="Note title…"
            rows={2}
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: 'clamp(24px, 4vw, 34px)',
              fontWeight: 800, color: '#0f172a',
              border: 'none', outline: 'none',
              background: 'transparent', resize: 'none',
              lineHeight: 1.3, letterSpacing: '-0.02em',
              marginBottom: 20,
              fontFamily: 'inherit',
            }}
          />

          {/* Divider */}
          <div style={{
            height: 1, background: 'linear-gradient(90deg, #4f46e5, #7c3aed, transparent)',
            marginBottom: 28, opacity: 0.25,
          }} />

          {/* Content textarea */}
          <textarea
            value={note.content}
            onChange={e => update({ content: e.target.value })}
            placeholder="Write your note here…&#10;&#10;You can use plain text or paste HTML for rich formatting."
            style={{
              width: '100%', boxSizing: 'border-box',
              minHeight: 360,
              fontSize: 16, lineHeight: 1.8, color: '#334155',
              border: 'none', outline: 'none',
              background: 'transparent', resize: 'vertical',
              fontFamily: 'inherit',
            }}
          />

          {/* Tip */}
          <div style={{
            marginTop: 20, padding: '10px 14px',
            background: '#eff6ff', borderRadius: 10, border: '1px solid #bfdbfe',
            fontSize: 12, color: '#3b82f6',
            display: 'flex', alignItems: 'flex-start', gap: 8,
          }}>
            <span style={{ flexShrink: 0 }}>💡</span>
            <span>
              Click <strong>Publish &amp; Copy Link</strong> to make this note public and copy the URL for SMS.
              The link works for anyone — no login required.
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Main Notes Manager ────────────────────────────────────────────────────────

interface NotesManagerProps {
  churchId: string;
  currentUser?: User;
  church?: Church;
}

export const NotesManager: React.FC<NotesManagerProps> = ({ churchId, currentUser, church }) => {
  const [notes, setNotes] = useState<ChurchNote[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeNote, setActiveNote] = useState<ChurchNote | null>(null);
  const [tab, setTab] = useState<'all' | 'draft' | 'published'>('all');
  const [toast, setToast] = useState<ToastMsg | null>(null);

  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Load notes
  useEffect(() => {
    setIsLoading(true);
    firestore.getNotes(churchId)
      .then(data => { setNotes(data); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [churchId]);

  // Create new note
  const handleCreate = () => {
    const note: ChurchNote = {
      id: newNoteId(),
      churchId,
      title: '',
      content: '',
      authorId: currentUser?.id || '',
      authorName: currentUser?.name || '',
      status: 'draft',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    setNotes(prev => [note, ...prev]);
    setActiveNote(note);
  };

  // Saved callback from editor
  const handleSaved = (updated: ChurchNote) => {
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
  };

  // Delete
  const handleDelete = async (note: ChurchNote, e?: React.MouseEvent) => {
    e?.stopPropagation();
    if (!confirm(`Delete "${note.title || 'this note'}"? This cannot be undone.`)) return;
    await firestore.deleteNote(note.id);
    setNotes(prev => prev.filter(n => n.id !== note.id));
    if (activeNote?.id === note.id) setActiveNote(null);
    showToast('Note deleted');
  };

  // Copy link
  const handleCopyLink = async (note: ChurchNote, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(publicUrl(note.id));
      showToast('Link copied! Ready to send via SMS ✉️');
    } catch {
      showToast('Could not copy link', 'error');
    }
  };

  // Filtered list
  const filtered = notes.filter(n => {
    if (tab === 'draft') return n.status === 'draft';
    if (tab === 'published') return n.status === 'published';
    return true;
  });

  const counts = {
    all: notes.length,
    draft: notes.filter(n => n.status === 'draft').length,
    published: notes.filter(n => n.status === 'published').length,
  };

  // ── Render editor ──
  if (activeNote) {
    return (
      <>
        <NoteEditor
          note={activeNote}
          church={church}
          onBack={() => setActiveNote(null)}
          onSaved={handleSaved}
          showToast={showToast}
        />
        {toast && <ToastBar toast={toast} />}
        <GlobalStyles />
      </>
    );
  }

  // ── Render list ──
  return (
    <>
      <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          marginBottom: 24
        }}>
          <div>
            <h1 style={{
              fontSize: 26, fontWeight: 800, color: '#0f172a',
              display: 'flex', alignItems: 'center', gap: 10, margin: 0,
            }}>
              <span style={{
                width: 38, height: 38, borderRadius: 10,
                background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                boxShadow: '0 2px 8px rgba(79,70,229,0.3)',
              }}>
                <FileText size={18} color="white" />
              </span>
              Notes
            </h1>
            <p style={{ fontSize: 13, color: '#64748b', margin: '4px 0 0 48px' }}>
              Create shareable notes — send public links via SMS
            </p>
          </div>

          <button
            onClick={handleCreate}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '10px 20px', borderRadius: 12,
              border: 'none',
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              color: 'white', fontSize: 13, fontWeight: 700,
              cursor: 'pointer',
              boxShadow: '0 2px 12px rgba(79,70,229,0.35)',
              transition: 'all 0.2s',
            }}
          >
            <Plus size={15} /> Create Note
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 4,
          padding: 4, background: '#f1f5f9', borderRadius: 12,
          marginBottom: 20, width: 'fit-content',
        }}>
          {(['all', 'draft', 'published'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 10,
                border: 'none', cursor: 'pointer',
                fontSize: 12, fontWeight: 600,
                background: tab === t ? 'white' : 'transparent',
                color: tab === t ? '#1e293b' : '#64748b',
                boxShadow: tab === t ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
                transition: 'all 0.15s',
              }}
            >
              {t === 'all' && <FileText size={12} />}
              {t === 'draft' && <Lock size={12} />}
              {t === 'published' && <Globe size={12} />}
              {t === 'all' ? 'All' : t === 'draft' ? 'Drafts' : 'Published'}
              <span style={{
                fontSize: 10, padding: '1px 6px', borderRadius: 20,
                background: tab === t ? '#eef2ff' : '#e2e8f0',
                color: tab === t ? '#4f46e5' : '#94a3b8',
                fontWeight: 700,
              }}>
                {counts[t]}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
            <Loader2 size={28} style={{ animation: 'spin 0.8s linear infinite', margin: '0 auto 12px', display: 'block' }} />
            <p style={{ fontSize: 13 }}>Loading notes…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div style={{
            textAlign: 'center', padding: '64px 40px',
            border: '2px dashed #e2e8f0', borderRadius: 20,
            background: '#f8fafc',
          }}>
            <div style={{ fontSize: 48, marginBottom: 16 }}>📝</div>
            <p style={{ fontSize: 16, fontWeight: 700, color: '#1e293b', marginBottom: 6 }}>
              {tab === 'published' ? 'No published notes yet' : tab === 'draft' ? 'No drafts' : 'No notes yet'}
            </p>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 20 }}>
              Create your first note to start sharing with your congregation
            </p>
            {tab !== 'published' && (
              <button
                onClick={handleCreate}
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 6,
                  padding: '10px 20px', borderRadius: 12, border: 'none',
                  background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
                  color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer',
                }}
              >
                <Plus size={14} /> Create Note
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {filtered.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                onEdit={() => setActiveNote(note)}
                onDelete={() => handleDelete(note)}
                onCopyLink={() => handleCopyLink(note)}
              />
            ))}
          </div>
        )}
      </div>

      {toast && <ToastBar toast={toast} />}
      <GlobalStyles />
    </>
  );
};

// ─── Toast ────────────────────────────────────────────────────────────────────

const ToastBar: React.FC<{ toast: ToastMsg }> = ({ toast }) => (
  <div style={{
    position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
    zIndex: 9999,
    padding: '12px 22px', borderRadius: 14,
    background: toast.type === 'error'
      ? 'linear-gradient(135deg, #ef4444, #dc2626)'
      : 'linear-gradient(135deg, #10b981, #059669)',
    color: 'white', fontSize: 13, fontWeight: 700,
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)',
    whiteSpace: 'nowrap',
  }}>
    {toast.msg}
  </div>
);

// ─── Global Styles ────────────────────────────────────────────────────────────

const GlobalStyles: React.FC = () => (
  <style>{`
    @keyframes spin { to { transform: rotate(360deg); } }
    .note-card-hover:hover {
      border-color: #c7d2fe !important;
      box-shadow: 0 4px 20px rgba(79,70,229,0.10) !important;
      transform: translateY(-1px);
    }
    .action-btn:hover {
      background: #f1f5f9 !important;
      color: #1e293b !important;
      border-color: #c7d2fe !important;
    }
    .action-btn-danger:hover {
      background: #fef2f2 !important;
      border-color: #fecaca !important;
    }
  `}</style>
);
