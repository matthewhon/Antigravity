import React, { useState, useEffect, useCallback, useRef } from 'react';
import { ChurchNote, NoteStatus, Church, User } from '../types';
import { firestore } from '../services/firestoreService';
import { storage } from '../services/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { pcoService } from '../services/pcoService';
import {
  Plus, ArrowLeft, Trash2, Pencil, FileText,
  CheckCircle, Globe, Lock, Clock, Loader2, Link, Eye,
  Image, CalendarDays, Users, ClipboardList, Search, X,
  CheckSquare, Square,
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

// ─── PCO Item Types ────────────────────────────────────────────────────────────

type PcoTab = 'registrations' | 'groups' | 'calendar';

interface PcoItem {
  id: string;
  name: string;
  description?: string;
  date?: string;
  imageUrl?: string;
  meta?: string;
  raw: any;
}

const formatPcoDate = (iso?: string): string => {
  if (!iso) return '';
  try { return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  catch { return ''; }
};

const mapPcoRegistration = (item: any): PcoItem => ({
  id: item.id,
  name: item.attributes?.name || 'Unnamed Event',
  description: item.attributes?.description || '',
  date: formatPcoDate(item.attributes?.open_at || item.attributes?.close_at),
  imageUrl: item.attributes?.logo_url || item.attributes?.image_url,
  meta: item.attributes?.archived ? 'Archived' : 'Active registration',
  raw: item,
});

const mapPcoGroup = (item: any): PcoItem => ({
  id: item.id,
  name: item.attributes?.name || 'Unnamed Group',
  description: item.attributes?.description || '',
  imageUrl: item.attributes?.header_image?.medium || item.attributes?.header_image?.thumbnail,
  meta: `${item.attributes?.memberships_count ?? '?'} members`,
  raw: item,
});

const mapPcoCalendar = (item: any): PcoItem => ({
  id: item.id,
  name: item.attributes?.name || 'Unnamed Event',
  description: item.attributes?.description || '',
  date: formatPcoDate(item.attributes?.starts_at || item.attributes?.start_time),
  imageUrl: item.attributes?.image_url,
  meta: item.attributes?.location || '',
  raw: item,
});

/** Convert a selected PCO item into an HTML snippet to inject into the note content */
function buildPcoHtml(tab: PcoTab, item: PcoItem): string {
  const typeLabel = tab === 'registrations' ? 'Registration' : tab === 'groups' ? 'Group' : 'Event';
  return `
<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin:16px 0;font-family:inherit;">
  ${item.imageUrl ? `<img src="${item.imageUrl}" alt="${item.name}" style="width:100%;max-height:200px;object-fit:cover;display:block;" />` : ''}
  <div style="padding:16px 20px;">
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.08em;color:#6366f1;margin-bottom:6px;">${typeLabel}</div>
    <div style="font-size:18px;font-weight:800;color:#0f172a;margin-bottom:6px;">${item.name}</div>
    ${item.date ? `<div style="font-size:12px;color:#6366f1;font-weight:600;margin-bottom:6px;">📅 ${item.date}</div>` : ''}
    ${item.meta ? `<div style="font-size:12px;color:#64748b;margin-bottom:8px;">${item.meta}</div>` : ''}
    ${item.description ? `<div style="font-size:14px;color:#334155;line-height:1.6;">${stripHtml(item.description).slice(0, 200)}${item.description.length > 200 ? '…' : ''}</div>` : ''}
  </div>
</div>`;
}

// ─── PCO Import Modal ─────────────────────────────────────────────────────────

const PcoNoteModal: React.FC<{
  churchId: string;
  onInsert: (html: string) => void;
  onClose: () => void;
}> = ({ churchId, onInsert, onClose }) => {
  const [tab, setTab] = useState<PcoTab>('registrations');
  const [items, setItems] = useState<Record<PcoTab, PcoItem[]>>({ registrations: [], groups: [], calendar: [] });
  const [loading, setLoading] = useState<Record<PcoTab, boolean>>({ registrations: false, groups: false, calendar: false });
  const [errors, setErrors] = useState<Record<PcoTab, string>>({ registrations: '', groups: '', calendar: '' });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  useEffect(() => {
    if (items[tab].length > 0 || loading[tab]) return;
    setLoading(p => ({ ...p, [tab]: true }));
    setErrors(p => ({ ...p, [tab]: '' }));

    const load = async () => {
      try {
        let raw: any[] = [];
        if (tab === 'registrations') {
          raw = await pcoService.getRegistrations(churchId);
          const active = (raw || []).filter((i: any) => !i.attributes?.archived);
          setItems(p => ({ ...p, registrations: active.map(mapPcoRegistration) }));
        } else if (tab === 'groups') {
          raw = await pcoService.getGroups(churchId);
          setItems(p => ({ ...p, groups: (raw || []).map(mapPcoGroup) }));
        } else {
          raw = await pcoService.getEvents(churchId);
          setItems(p => ({ ...p, calendar: (raw || []).map(mapPcoCalendar) }));
        }
      } catch (e: any) {
        setErrors(p => ({ ...p, [tab]: e?.message || 'Failed to load PCO data.' }));
      } finally {
        setLoading(p => ({ ...p, [tab]: false }));
      }
    };
    load();
  }, [tab, churchId]);

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleInsert = () => {
    const html = (['registrations', 'groups', 'calendar'] as PcoTab[])
      .flatMap(t => items[t].filter(i => selected.has(i.id)).map(i => buildPcoHtml(t, i)))
      .join('\n');
    onInsert(html);
  };

  const filtered = (items[tab] || []).filter(i =>
    !search.trim() || i.name.toLowerCase().includes(search.toLowerCase())
  );

  const TAB_INFO: Record<PcoTab, { label: string; icon: React.ReactNode }> = {
    registrations: { label: 'Registrations', icon: <ClipboardList size={14} /> },
    groups: { label: 'Groups', icon: <Users size={14} /> },
    calendar: { label: 'Calendar', icon: <CalendarDays size={14} /> },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            <img src="https://planningcenter.com/favicon.ico" alt="PCO" className="w-4 h-4" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Insert from Planning Center</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
            <X size={18} />
          </button>
        </div>

        <p className="text-xs text-slate-500 dark:text-slate-400 px-5 pt-3 pb-0 shrink-0">
          Select items to insert as cards into your note.
        </p>

        {/* Tabs */}
        <div className="flex gap-1 px-5 pt-3 shrink-0">
          {(Object.keys(TAB_INFO) as PcoTab[]).map(t => (
            <button
              key={t}
              onClick={() => { setTab(t); setSearch(''); }}
              className={`flex items-center gap-1.5 px-3 py-2 rounded-t-lg text-sm font-semibold border-b-2 transition ${
                tab === t
                  ? 'border-indigo-600 text-indigo-700 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20'
                  : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
              }`}
            >
              {TAB_INFO[t].icon} {TAB_INFO[t].label}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="px-5 py-3 border-t border-b border-slate-100 dark:border-slate-700 shrink-0">
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              placeholder={`Search ${TAB_INFO[tab].label.toLowerCase()}…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* List */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {loading[tab] ? (
            <div className="flex items-center justify-center h-40 text-slate-400 gap-2">
              <Loader2 size={20} className="animate-spin" /> Loading from Planning Center…
            </div>
          ) : errors[tab] ? (
            <div className="flex flex-col items-center justify-center h-40 text-center">
              <p className="text-red-500 text-sm font-medium">{errors[tab]}</p>
              <button
                onClick={() => { setErrors(p => ({ ...p, [tab]: '' })); setItems(p => ({ ...p, [tab]: [] })); }}
                className="mt-3 px-4 py-1.5 text-xs font-semibold text-indigo-600 dark:text-indigo-400 border border-indigo-300 dark:border-indigo-700 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition"
              >
                Retry
              </button>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <CalendarDays size={36} className="mb-2 text-slate-300" />
              <p className="text-sm">No {TAB_INFO[tab].label.toLowerCase()} found</p>
            </div>
          ) : (
            filtered.map(item => (
              <button
                key={item.id}
                onClick={() => toggleSelected(item.id)}
                className={`w-full flex items-start gap-3 p-3 rounded-xl border transition text-left mb-2 ${
                  selected.has(item.id)
                    ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 dark:border-indigo-500'
                    : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-600'
                }`}
              >
                {item.imageUrl ? (
                  <img src={item.imageUrl} alt={item.name} className="w-14 h-14 rounded-lg object-cover shrink-0 bg-slate-100" onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
                ) : (
                  <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-indigo-100 to-indigo-200 dark:from-indigo-900/40 dark:to-indigo-800/40 flex items-center justify-center shrink-0">
                    <CalendarDays size={22} className="text-indigo-400" />
                  </div>
                )}
                <div className="flex-grow min-w-0">
                  <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">{item.name}</div>
                  {item.date && <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">{item.date}</div>}
                  {item.description && <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{stripHtml(item.description)}</div>}
                  {item.meta && <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{item.meta}</div>}
                </div>
                <div className="shrink-0 mt-0.5">
                  {selected.has(item.id)
                    ? <CheckSquare size={18} className="text-indigo-600 dark:text-indigo-400" />
                    : <Square size={18} className="text-slate-300 dark:text-slate-600" />
                  }
                </div>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-b-2xl shrink-0">
          <span className="text-sm text-slate-500 dark:text-slate-400">
            {selected.size > 0 ? `${selected.size} item${selected.size !== 1 ? 's' : ''} selected` : 'Select items to insert'}
          </span>
          <div className="flex gap-2">
            <button onClick={onClose} className="px-4 py-2 text-sm text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700 rounded-xl transition font-medium">
              Cancel
            </button>
            <button
              onClick={handleInsert}
              disabled={selected.size === 0}
              className="px-4 py-2 text-sm text-white bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 dark:disabled:bg-slate-700 disabled:text-slate-400 dark:disabled:text-slate-500 rounded-xl transition font-semibold"
            >
              Insert {selected.size > 0 ? `(${selected.size})` : ''}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

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
      <div style={{
        position: 'absolute', left: 0, top: 0, bottom: 0, width: 4,
        background: isPublished
          ? 'linear-gradient(180deg, #10b981, #059669)'
          : 'linear-gradient(180deg, #94a3b8, #64748b)',
        borderRadius: '16px 0 0 16px',
      }} />

      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
        <div style={{ flex: 1, minWidth: 0 }}>
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

          <h3 style={{
            fontSize: 16, fontWeight: 700, color: '#0f172a',
            marginBottom: 6, lineHeight: 1.3,
            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
          }}>
            {note.title || 'Untitled Note'}
          </h3>

          {preview && (
            <p style={{
              fontSize: 13, color: '#64748b', lineHeight: 1.55,
              display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical',
              overflow: 'hidden', margin: '0 0 10px',
            }}>
              {preview}
            </p>
          )}

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
      border: '1px solid #e2e8f0', background: 'white',
      color: danger ? '#ef4444' : '#64748b',
      cursor: 'pointer', transition: 'all 0.15s',
    }}
    className={danger ? 'action-btn-danger' : 'action-btn'}
  >
    {icon}
  </button>
);

// ─── Editor Toolbar ───────────────────────────────────────────────────────────

interface ToolbarProps {
  churchId: string;
  onImageInsert: (url: string) => void;
  onPcoInsert: (html: string) => void;
}

const EditorToolbar: React.FC<ToolbarProps> = ({ churchId, onImageInsert, onPcoInsert }) => {
  const imgInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [showPco, setShowPco] = useState(false);

  const handleImageFile = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setIsUploading(true);
    try {
      const ext = file.name.split('.').pop() || 'jpg';
      const path = `note_images/${churchId}/${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
      const sRef = storageRef(storage, path);
      await new Promise<void>((resolve, reject) => {
        const task = uploadBytesResumable(sRef, file);
        task.on('state_changed', () => {}, reject, () => resolve());
      });
      const url = await getDownloadURL(sRef);
      onImageInsert(url);
    } catch (e) {
      console.error('[NotesManager] Image upload failed:', e);
      alert('Image upload failed. Please try again.');
    } finally {
      setIsUploading(false);
    }
  }, [churchId, onImageInsert]);

  return (
    <>
      <div style={{
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '8px 16px',
        background: '#f8fafc',
        borderBottom: '1px solid #e2e8f0',
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em', marginRight: 4 }}>
          Insert
        </span>

        {/* Image upload */}
        <button
          onClick={() => imgInputRef.current?.click()}
          disabled={isUploading}
          title="Upload and insert image"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 8,
            border: '1px solid #e2e8f0', background: 'white',
            fontSize: 12, fontWeight: 600, color: '#475569',
            cursor: isUploading ? 'wait' : 'pointer',
            transition: 'all 0.15s',
          }}
          className="toolbar-btn"
        >
          {isUploading
            ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} />
            : <Image size={13} />
          }
          {isUploading ? 'Uploading…' : 'Image'}
        </button>
        <input
          ref={imgInputRef}
          type="file"
          accept="image/*"
          style={{ display: 'none' }}
          onChange={e => {
            const file = e.target.files?.[0];
            if (file) handleImageFile(file);
            e.target.value = '';
          }}
        />

        {/* PCO insert */}
        <button
          onClick={() => setShowPco(true)}
          title="Insert Planning Center event, group, or registration"
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 12px', borderRadius: 8,
            border: '1px solid #e2e8f0', background: 'white',
            fontSize: 12, fontWeight: 600, color: '#475569',
            cursor: 'pointer', transition: 'all 0.15s',
          }}
          className="toolbar-btn"
        >
          <img src="https://planningcenter.com/favicon.ico" alt="PCO" style={{ width: 13, height: 13 }} />
          Planning Center
        </button>

        <div style={{ marginLeft: 'auto', fontSize: 11, color: '#94a3b8' }}>
          Plain text or HTML · images supported
        </div>
      </div>

      {showPco && (
        <PcoNoteModal
          churchId={churchId}
          onInsert={html => { onPcoInsert(html); setShowPco(false); }}
          onClose={() => setShowPco(false)}
        />
      )}
    </>
  );
};

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
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const update = (patch: Partial<ChurchNote>) => {
    setNote(prev => ({ ...prev, ...patch, updatedAt: Date.now() }));
  };

  /** Insert text/HTML at the current cursor position in the textarea */
  const insertAtCursor = useCallback((insertion: string) => {
    const ta = textareaRef.current;
    if (!ta) {
      update({ content: note.content + '\n' + insertion });
      return;
    }
    const start = ta.selectionStart;
    const end = ta.selectionEnd;
    const newContent = note.content.slice(0, start) + insertion + note.content.slice(end);
    update({ content: newContent });
    // Restore cursor after the inserted text
    requestAnimationFrame(() => {
      ta.focus();
      const pos = start + insertion.length;
      ta.setSelectionRange(pos, pos);
    });
  }, [note.content]);

  const handleImageInsert = useCallback((url: string) => {
    insertAtCursor(`\n<img src="${url}" alt="Image" style="max-width:100%;border-radius:8px;margin:8px 0;" />\n`);
    showToast('Image inserted ✓');
  }, [insertAtCursor, showToast]);

  const handlePcoInsert = useCallback((html: string) => {
    insertAtCursor('\n' + html + '\n');
    showToast('Planning Center content inserted ✓');
  }, [insertAtCursor, showToast]);

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
        padding: '14px 24px', background: 'white', borderBottom: '1px solid #e2e8f0',
        flexShrink: 0, flexWrap: 'wrap', gap: 12,
      }}>
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
            <span style={{ cursor: 'pointer', fontWeight: 500 }} onClick={onBack}>Notes</span>
            <span style={{ margin: '0 6px' }}>›</span>
            <span style={{ fontWeight: 700, color: '#1e293b' }}>{note.title || 'New Note'}</span>
          </div>
          {lastSaved && (
            <span style={{ fontSize: 10, color: '#10b981', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 4 }}>
              <CheckCircle size={10} /> Saved
            </span>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {/* Status pill */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 5,
            fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 20,
            background: isPublished ? '#d1fae5' : '#f1f5f9',
            color: isPublished ? '#065f46' : '#475569',
            border: `1px solid ${isPublished ? '#a7f3d0' : '#e2e8f0'}`,
          }}>
            {isPublished ? <Globe size={11} /> : <Lock size={11} />}
            {isPublished ? 'Published' : 'Draft'}
          </div>

          {isPublished && (
            <button
              onClick={handleCopyLink}
              title="Copy public link"
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 14px', borderRadius: 10,
                border: '1px solid #c7d2fe', background: '#eef2ff', color: '#4338ca',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
              }}
            >
              {copied ? <CheckCircle size={13} /> : <Link size={13} />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          )}

          <button
            onClick={() => save('draft')}
            disabled={isSaving}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 16px', borderRadius: 10,
              border: '1px solid #e2e8f0', background: 'white', color: '#475569',
              fontSize: 12, fontWeight: 600, cursor: 'pointer', opacity: isSaving ? 0.7 : 1,
            }}
          >
            {isSaving ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Clock size={13} />}
            Save Draft
          </button>

          <button
            onClick={handlePublishAndCopy}
            disabled={isSaving}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '8px 18px', borderRadius: 10, border: 'none',
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              color: 'white', fontSize: 12, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 2px 8px rgba(79,70,229,0.3)', opacity: isSaving ? 0.7 : 1,
            }}
          >
            {isSaving ? <Loader2 size={13} style={{ animation: 'spin 0.8s linear infinite' }} /> : <Globe size={13} />}
            Publish & Copy Link
          </button>
        </div>
      </div>

      {/* ── Toolbar ── */}
      <EditorToolbar
        churchId={initialNote.churchId}
        onImageInsert={handleImageInsert}
        onPcoInsert={handlePcoInsert}
      />

      {/* ── Editor Body ── */}
      <div style={{
        flex: 1, overflowY: 'auto', background: '#f8fafc',
        display: 'flex', justifyContent: 'center', padding: '32px 16px',
      }}>
        <div style={{ width: '100%', maxWidth: 720 }}>

          {/* Church/author strip */}
          <div style={{
            display: 'flex', alignItems: 'center', gap: 12,
            marginBottom: 20, padding: '10px 16px',
            background: 'white', borderRadius: 12, border: '1px solid #e2e8f0',
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
                  fontWeight: 700, color: '#1e293b', background: 'transparent', width: '100%',
                }}
              />
              <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>
                {church?.name || 'Your Church'}
              </div>
            </div>
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

          {/* Title */}
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
              lineHeight: 1.3, letterSpacing: '-0.02em', marginBottom: 20,
              fontFamily: 'inherit',
            }}
          />

          {/* Divider */}
          <div style={{
            height: 1, background: 'linear-gradient(90deg, #4f46e5, #7c3aed, transparent)',
            marginBottom: 28, opacity: 0.25,
          }} />

          {/* Content */}
          <textarea
            ref={textareaRef}
            value={note.content}
            onChange={e => update({ content: e.target.value })}
            placeholder={`Write your note here…\n\nUse the toolbar above to insert images or Planning Center events.`}
            style={{
              width: '100%', boxSizing: 'border-box', minHeight: 360,
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
              Use the toolbar above to insert images or Planning Center content cards.
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

  useEffect(() => {
    setIsLoading(true);
    firestore.getNotes(churchId)
      .then(data => { setNotes(data); setIsLoading(false); })
      .catch(() => setIsLoading(false));
  }, [churchId]);

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

  const handleSaved = (updated: ChurchNote) => {
    setNotes(prev => prev.map(n => n.id === updated.id ? updated : n));
  };

  const handleDelete = async (note: ChurchNote) => {
    if (!confirm(`Delete "${note.title || 'this note'}"? This cannot be undone.`)) return;
    await firestore.deleteNote(note.id);
    setNotes(prev => prev.filter(n => n.id !== note.id));
    if (activeNote?.id === note.id) setActiveNote(null);
    showToast('Note deleted');
  };

  const handleCopyLink = async (note: ChurchNote, e?: React.MouseEvent) => {
    e?.stopPropagation();
    try {
      await navigator.clipboard.writeText(publicUrl(note.id));
      showToast('Link copied! Ready to send via SMS ✉️');
    } catch {
      showToast('Could not copy link', 'error');
    }
  };

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

  return (
    <>
      <div style={{ padding: '28px 32px', maxWidth: 900, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
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
              padding: '10px 20px', borderRadius: 12, border: 'none',
              background: 'linear-gradient(135deg, #4f46e5, #7c3aed)',
              color: 'white', fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 2px 12px rgba(79,70,229,0.35)', transition: 'all 0.2s',
            }}
          >
            <Plus size={15} /> Create Note
          </button>
        </div>

        {/* Tabs */}
        <div style={{
          display: 'flex', gap: 4, padding: 4, background: '#f1f5f9', borderRadius: 12,
          marginBottom: 20, width: 'fit-content',
        }}>
          {(['all', 'draft', 'published'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                padding: '7px 16px', borderRadius: 10, border: 'none', cursor: 'pointer',
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
                color: tab === t ? '#4f46e5' : '#94a3b8', fontWeight: 700,
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
            border: '2px dashed #e2e8f0', borderRadius: 20, background: '#f8fafc',
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
                onCopyLink={e => handleCopyLink(note, e)}
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
    zIndex: 9999, padding: '12px 22px', borderRadius: 14,
    background: toast.type === 'error'
      ? 'linear-gradient(135deg, #ef4444, #dc2626)'
      : 'linear-gradient(135deg, #10b981, #059669)',
    color: 'white', fontSize: 13, fontWeight: 700,
    boxShadow: '0 8px 24px rgba(0,0,0,0.2)', whiteSpace: 'nowrap',
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
    .toolbar-btn:hover {
      background: #f1f5f9 !important;
      border-color: #c7d2fe !important;
      color: #4338ca !important;
    }
  `}</style>
);
