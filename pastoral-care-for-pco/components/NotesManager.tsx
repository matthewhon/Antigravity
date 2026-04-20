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
          <button
            onClick={onClose}
            title="Close"
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
          >
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
              title={`Search ${TAB_INFO[tab].label.toLowerCase()}`}
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
      className="nm-card-hover bg-white border border-slate-200 rounded-2xl px-[22px] py-5 cursor-pointer relative overflow-hidden"
    >
      {/* Coloured left accent */}
      <div className={`absolute left-0 top-0 bottom-0 w-1 rounded-l-2xl ${isPublished ? 'nm-card-accent-published' : 'nm-card-accent-draft'}`} />

      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          {/* Status + timestamp */}
          <div className="flex items-center gap-2 mb-2">
            <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest px-2 py-0.5 rounded-full border ${
              isPublished
                ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
                : 'bg-slate-100 text-slate-500 border-slate-200'
            }`}>
              {isPublished ? <Globe size={9} /> : <Lock size={9} />}
              {isPublished ? 'Published' : 'Draft'}
            </span>
            <span className="text-[11px] text-slate-400">
              {formatRelative(note.updatedAt || note.createdAt)}
            </span>
          </div>

          {/* Title */}
          <h3 className="text-base font-bold text-slate-900 mb-1.5 leading-snug truncate">
            {note.title || 'Untitled Note'}
          </h3>

          {/* Preview */}
          {preview && (
            <p className="text-[13px] text-slate-500 leading-relaxed line-clamp-2 mb-2.5">
              {preview}
            </p>
          )}

          {/* Author */}
          <div className="flex items-center gap-1.5 text-xs text-slate-400">
            <div className="nm-avatar w-[18px] h-[18px] rounded-full flex items-center justify-center text-white text-[8px] font-extrabold shrink-0">
              {(note.authorName || 'A').charAt(0).toUpperCase()}
            </div>
            {note.authorName || 'Unknown'}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-1 shrink-0" onClick={e => e.stopPropagation()}>
          <ActionBtn title="Edit"      onClick={onEdit}      icon={<Pencil size={13} />} />
          {isPublished && (
            <ActionBtn title="Copy link" onClick={onCopyLink}  icon={<Link size={13} />} />
          )}
          <ActionBtn title="Delete"    onClick={onDelete}    icon={<Trash2 size={13} />} danger />
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
    className={`nm-action-btn w-[30px] h-[30px] rounded-lg flex items-center justify-center border border-slate-200 bg-white cursor-pointer ${
      danger ? 'text-red-500 nm-action-btn-danger' : 'text-slate-500'
    }`}
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
      <div className="flex items-center gap-1.5 px-4 py-2 bg-slate-50 border-b border-slate-200 shrink-0">
        <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide mr-1">Insert</span>

        {/* Image upload */}
        <button
          onClick={() => imgInputRef.current?.click()}
          disabled={isUploading}
          title="Upload and insert image"
          className="nm-toolbar-btn flex items-center gap-1.5 px-3 py-[5px] rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 disabled:opacity-60 disabled:cursor-wait cursor-pointer"
        >
          {isUploading
            ? <Loader2 size={13} className="nm-spin" />
            : <Image size={13} />
          }
          {isUploading ? 'Uploading…' : 'Image'}
        </button>
        <input
          ref={imgInputRef}
          type="file"
          aria-label="Upload image"
          accept="image/*"
          className="hidden"
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
          className="nm-toolbar-btn flex items-center gap-1.5 px-3 py-[5px] rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-600 cursor-pointer"
        >
          <img src="https://planningcenter.com/favicon.ico" alt="PCO" className="w-[13px] h-[13px]" />
          Planning Center
        </button>

        <div className="ml-auto text-[11px] text-slate-400">
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
  const [editorMode, setEditorMode] = useState<'edit' | 'preview'>('edit');
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
    setEditorMode('preview');
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
    <div className="flex flex-col h-full">

      {/* ── Editor Header ── */}
      <div className="flex items-center justify-between px-6 py-3.5 bg-white border-b border-slate-200 shrink-0 flex-wrap gap-3">
        <div className="flex items-center gap-2.5">
          <button
            onClick={onBack}
            title="Back to notes"
            className="w-8 h-8 rounded-lg border border-slate-200 bg-white flex items-center justify-center cursor-pointer text-slate-500 hover:bg-slate-50 transition"
          >
            <ArrowLeft size={16} />
          </button>
          <div className="text-[13px] text-slate-500">
            <span className="cursor-pointer font-medium hover:text-slate-700 transition" onClick={onBack}>Notes</span>
            <span className="mx-1.5">›</span>
            <span className="font-bold text-slate-800">{note.title || 'New Note'}</span>
          </div>
          {lastSaved && (
            <span className="text-[10px] text-emerald-600 font-bold flex items-center gap-1">
              <CheckCircle size={10} /> Saved
            </span>
          )}
        </div>

        <div className="flex items-center gap-2">
          {/* Status pill */}
          <div className={`flex items-center gap-1 text-[11px] font-bold px-3 py-1 rounded-full border ${
            isPublished
              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
              : 'bg-slate-100 text-slate-500 border-slate-200'
          }`}>
            {isPublished ? <Globe size={11} /> : <Lock size={11} />}
            {isPublished ? 'Published' : 'Draft'}
          </div>

          {isPublished && (
            <button
              onClick={handleCopyLink}
              title="Copy public link"
              className="nm-btn-copy-link flex items-center gap-1.5 px-3.5 py-[7px] rounded-[10px] text-xs font-semibold cursor-pointer"
            >
              {copied ? <CheckCircle size={13} /> : <Link size={13} />}
              {copied ? 'Copied!' : 'Copy Link'}
            </button>
          )}

          <button
            onClick={() => save('draft')}
            disabled={isSaving}
            className="flex items-center gap-1.5 px-4 py-2 rounded-[10px] border border-slate-200 bg-white text-slate-600 text-xs font-semibold cursor-pointer disabled:opacity-70 hover:bg-slate-50 transition"
          >
            {isSaving ? <Loader2 size={13} className="nm-spin" /> : <Clock size={13} />}
            Save Draft
          </button>

          <button
            onClick={handlePublishAndCopy}
            disabled={isSaving}
            className="nm-btn-publish flex items-center gap-1.5 px-4 py-2 rounded-[10px] border-none text-white text-xs font-bold cursor-pointer disabled:opacity-70"
          >
            {isSaving ? <Loader2 size={13} className="nm-spin" /> : <Globe size={13} />}
            Publish &amp; Copy Link
          </button>
        </div>
      </div>

      {/* ── Edit / Preview Toggle + Toolbar ── */}
      <div className="flex items-center bg-slate-50 border-b border-slate-200 shrink-0">
        <div className="flex gap-0.5 p-1.5 bg-slate-100 rounded-lg mx-4 my-2">
          <button
            onClick={() => setEditorMode('edit')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
              editorMode === 'edit'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            Edit
          </button>
          <button
            onClick={() => setEditorMode('preview')}
            className={`px-3 py-1 rounded-md text-xs font-semibold transition ${
              editorMode === 'preview'
                ? 'bg-white text-slate-800 shadow-sm'
                : 'text-slate-500 hover:text-slate-700'
            }`}
          >
            <Eye size={11} className="inline mr-1 -mt-0.5" />
            Preview
          </button>
        </div>
        {editorMode === 'edit' && (
          <EditorToolbar
            churchId={initialNote.churchId}
            onImageInsert={handleImageInsert}
            onPcoInsert={handlePcoInsert}
          />
        )}
      </div>

      {/* ── Editor Body ── */}
      <div className="flex-1 overflow-y-auto bg-slate-50 flex justify-center px-4 py-8">
        <div className="w-full max-w-[720px]">

          {/* Church/author strip */}
          <div className="flex items-center gap-3 mb-5 px-4 py-2.5 bg-white rounded-xl border border-slate-200 text-[13px] text-slate-500">
            <div className="nm-avatar w-8 h-8 rounded-full flex items-center justify-center text-white text-[11px] font-extrabold shrink-0">
              {(note.authorName || 'A').charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <input
                type="text"
                value={note.authorName}
                onChange={e => update({ authorName: e.target.value })}
                placeholder="Author name…"
                title="Author name"
                className="border-none outline-none text-[13px] font-bold text-slate-800 bg-transparent w-full"
              />
              <div className="text-[11px] text-slate-400 mt-px">
                {church?.name || 'Your Church'}
              </div>
            </div>
            <a
              href={publicUrl(note.id)}
              target="_blank"
              rel="noopener noreferrer"
              title="Preview public view"
              className="flex items-center gap-1 text-[11px] text-indigo-600 font-semibold no-underline shrink-0 hover:underline"
            >
              <Eye size={12} /> Preview
            </a>
          </div>

          {/* Title */}
          <textarea
            value={note.title}
            onChange={e => update({ title: e.target.value })}
            placeholder="Note title…"
            title="Note title"
            rows={2}
            className="w-full box-border text-[clamp(24px,4vw,34px)] font-extrabold text-slate-900 border-none outline-none bg-transparent resize-none leading-snug tracking-tight mb-5 font-[inherit]"
          />

          {/* Divider */}
          <div className="nm-title-divider mb-7" />

          {/* Content — Edit or Preview */}
          {editorMode === 'edit' ? (
            <textarea
              ref={textareaRef}
              value={note.content}
              onChange={e => update({ content: e.target.value })}
              placeholder={`Write your note here…\n\nUse the toolbar above to insert images or Planning Center events.`}
              title="Note content"
              className="w-full box-border min-h-[360px] text-base leading-[1.8] text-slate-600 border-none outline-none bg-transparent resize-y font-[inherit]"
            />
          ) : (
            <div
              className="w-full min-h-[360px] text-base leading-[1.8] text-slate-600"
              dangerouslySetInnerHTML={{ __html: note.content || '<p style="color:#94a3b8;">Nothing to preview yet.</p>' }}
            />
          )}

          {/* Tip */}
          {editorMode === 'edit' && (
            <div className="mt-5 px-3.5 py-2.5 bg-blue-50 rounded-[10px] border border-blue-200 text-xs text-blue-500 flex items-start gap-2">
              <span className="shrink-0">💡</span>
              <span>
                Click <strong>Publish &amp; Copy Link</strong> to make this note public and copy the URL for SMS.
                Use the toolbar above to insert images or Planning Center content cards.
              </span>
            </div>
          )}
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
      </>
    );
  }

  return (
    <>
      <div className="px-8 py-7 max-w-[900px] mx-auto">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-[26px] font-extrabold text-slate-900 flex items-center gap-2.5 m-0">
              <span className="nm-icon-gradient w-[38px] h-[38px] rounded-[10px] inline-flex items-center justify-center">
                <FileText size={18} color="white" />
              </span>
              Notes
            </h1>
            <p className="text-[13px] text-slate-500 mt-1 ml-12">
              Create shareable notes — send public links via SMS
            </p>
          </div>
          <button
            onClick={handleCreate}
            className="nm-btn-create flex items-center gap-1.5 px-5 py-2.5 rounded-xl border-none text-white text-[13px] font-bold cursor-pointer transition-opacity hover:opacity-90"
          >
            <Plus size={15} /> Create Note
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 p-1 bg-slate-100 rounded-xl mb-5 w-fit">
          {(['all', 'draft', 'published'] as const).map(t => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`flex items-center gap-1.5 px-4 py-[7px] rounded-[10px] border-none cursor-pointer text-xs font-semibold transition-all ${
                tab === t
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'bg-transparent text-slate-500 hover:text-slate-700'
              }`}
            >
              {t === 'all' && <FileText size={12} />}
              {t === 'draft' && <Lock size={12} />}
              {t === 'published' && <Globe size={12} />}
              {t === 'all' ? 'All' : t === 'draft' ? 'Drafts' : 'Published'}
              <span className={`text-[10px] px-1.5 py-px rounded-full font-bold ${
                tab === t ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-200 text-slate-400'
              }`}>
                {counts[t]}
              </span>
            </button>
          ))}
        </div>

        {/* Content */}
        {isLoading ? (
          <div className="text-center py-16 text-slate-400">
            <Loader2 size={28} className="nm-spin mx-auto mb-3 block" />
            <p className="text-[13px]">Loading notes…</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 px-10 border-2 border-dashed border-slate-200 rounded-2xl bg-slate-50">
            <div className="text-5xl mb-4">📝</div>
            <p className="text-base font-bold text-slate-900 mb-1.5">
              {tab === 'published' ? 'No published notes yet' : tab === 'draft' ? 'No drafts' : 'No notes yet'}
            </p>
            <p className="text-[13px] text-slate-400 mb-5">
              Create your first note to start sharing with your congregation
            </p>
            {tab !== 'published' && (
              <button
                onClick={handleCreate}
                className="nm-btn-create inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl border-none text-white text-[13px] font-bold cursor-pointer"
              >
                <Plus size={14} /> Create Note
              </button>
            )}
          </div>
        ) : (
          <div className="flex flex-col gap-3">
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
    </>
  );
};

// ─── Toast ────────────────────────────────────────────────────────────────────

const ToastBar: React.FC<{ toast: ToastMsg }> = ({ toast }) => (
  <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-[9999] px-[22px] py-3 rounded-2xl text-white text-[13px] font-bold shadow-2xl whitespace-nowrap ${
    toast.type === 'error' ? 'nm-toast-error' : 'nm-toast-success'
  }`}>
    {toast.msg}
  </div>
);
