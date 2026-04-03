import React, { useState, useEffect, useRef, useCallback } from 'react';
import { DndContext, closestCenter, DragOverlay, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { storage } from '../services/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL, listAll } from 'firebase/storage';
import { pcoService } from '../services/pcoService';
import { generateEmailContent } from '../services/geminiService';
import { AnalyticsWidgetBlock, AnalyticsWidgetId } from './DataChartSelector';
import {
  Type, Heading as HeadingIcon, Image as ImageIcon, MousePointerClick, File,
  Minus, Video, Code, Users, Calendar, ClipboardList, GripVertical, Trash2,
  Copy, ChevronRight, ChevronDown, Palette, AlignLeft, AlignCenter, AlignRight, LayoutGrid, Plus,
  AtSign, Search, Loader2, X, ChevronUp, Bold, Italic, List, ListOrdered, Link, Upload, Images,
  Sparkles, Send, RotateCcw, Check, ChevronLeft, MessageSquare
} from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

export type BlockType =
  | 'text' | 'header' | 'image' | 'button' | 'file' | 'divider' | 'video' | 'html'
  | 'pco_group' | 'pco_registration' | 'pco_event'
  | 'pco_groups_widget' | 'pco_registrations_widget'
  | 'pastoral_care_chart' | 'data_chart'
  | 'columns';

export interface ColumnCell {
  id: string;
  blocks: { id: string; type: 'text' | 'image' | 'button'; content: any }[];
}

export type ColumnLayout = '1' | '2' | '3' | '2:1' | '1:2';

export interface EmailBlock {
  id: string;
  type: BlockType;
  content: any;
}

interface EmailBuilderProps {
  blocks: EmailBlock[];
  setBlocks: React.Dispatch<React.SetStateAction<EmailBlock[]>>;
  onImportPco: () => void;
  onOpenPastoralCare: () => void;
  onOpenDataChart: () => void;
  onOpenSettings: () => void;
  onEditBlock?: (id: string) => void;
  churchId?: string;
  campaignSubject?: string;
  churchName?: string;
}

// ─── Block definitions for palette ───────────────────────────────────────────

const BLOCK_DEFS: { type: BlockType; label: string; icon: React.ReactNode; default: any }[] = [
  { type: 'text',    label: 'Text',    icon: <Type size={20} />,            default: { text: '<p>Start typing…</p>' } },
  { type: 'image',   label: 'Image',   icon: <ImageIcon size={20} />,       default: { src: '' } },
  { type: 'button',  label: 'Button',  icon: <MousePointerClick size={20} />, default: { text: 'Click Here', url: '#', align: 'center', size: 'medium', borderRadius: 'rounded', color: '', textColor: '#ffffff' } },
  { type: 'file',    label: 'File',    icon: <File size={20} />,            default: { name: 'document.pdf', url: '#' } },
  { type: 'divider', label: 'Divider', icon: <Minus size={20} />,           default: {} },
  { type: 'video',   label: 'Video',   icon: <Video size={20} />,           default: { src: '' } },
  { type: 'header',  label: 'Header',  icon: <HeadingIcon size={20} />,     default: { text: '<h2>New Heading</h2>' } },
  { type: 'html',    label: 'HTML',    icon: <Code size={20} />,            default: { html: '<p>Custom HTML</p>' } },
];

// ─── Block thumbnail (shown on canvas) ───────────────────────────────────────

const BlockThumbnail: React.FC<{ block: EmailBlock }> = ({ block }) => {
  const c = block.content || {};
  switch (block.type) {
    case 'text':
    case 'header':
      return (
        <div
          className="text-sm text-slate-700 dark:text-slate-300 line-clamp-3 prose prose-sm max-w-none pointer-events-none"
          dangerouslySetInnerHTML={{ __html: c.text || c.html || '' }}
        />
      );
    case 'image':
      return c.src
        ? <img src={c.src} alt="block" className="w-full max-h-48 object-cover rounded-lg" />
        : <div className="w-full h-24 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center text-slate-400"><ImageIcon size={28} /></div>;
    case 'button': {
      const btnBg = c.color || '#6366f1';
      const btnTc = c.textColor || '#ffffff';
      const btnRad = c.borderRadius === 'pill' ? 999 : c.borderRadius === 'square' ? 4 : 8;
      const btnPad = c.size === 'small' ? '4px 12px' : c.size === 'large' ? '12px 32px' : '8px 20px';
      const btnFs = c.size === 'small' ? 11 : c.size === 'large' ? 16 : 13;
      const alignClass = c.align === 'left' ? 'justify-start' : c.align === 'right' ? 'justify-end' : 'justify-center';
      return (
        <div className={`flex py-1 ${alignClass}`}>
          <span style={{ background: btnBg, color: btnTc, borderRadius: btnRad, padding: btnPad, fontSize: btnFs, fontWeight: 600, display: 'inline-block' }}>{c.text || 'Button'}</span>
        </div>
      );
    }
    case 'divider':
      return <hr className="border-t-2 border-slate-200 dark:border-slate-600 my-2" />;
    case 'video':
      return (
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
          <Video size={16} className="text-indigo-400" /> <span className="truncate">{c.src || 'No video URL set'}</span>
        </div>
      );
    case 'file':
      return (
        <div className="flex items-center gap-2 text-slate-500 dark:text-slate-400 text-sm">
          <File size={16} className="text-indigo-400" /> <span className="truncate">{c.name || 'Unnamed file'}</span>
        </div>
      );
    case 'html':
      return <div className="text-xs font-mono text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-900 rounded p-2 line-clamp-2">{c.html || ''}</div>;
    case 'pco_registration':
    case 'pco_group':
    case 'pco_event': {
      const stripTags = (html: string) => html?.replace(/<[^>]*>/g, '').trim() || '';
      return (
        <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800">
          {/* Hero image — full width, natural aspect ratio */}
          {c.imageUrl ? (
            <img
              src={c.imageUrl}
              alt={c.name}
              className="w-full block"
              style={{ maxHeight: 200, objectFit: 'cover', objectPosition: 'center top' }}
              onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
            />
          ) : (
            <div className="w-full h-16 bg-gradient-to-r from-indigo-100 to-indigo-200 dark:from-indigo-900/30 dark:to-indigo-800/30 flex items-center justify-center">
              <Calendar size={20} className="text-indigo-400" />
            </div>
          )}
          {/* Content */}
          <div className="p-3">
            <div className="text-sm font-semibold text-slate-900 dark:text-white">{c.name}</div>
            {c.date && <div className="text-xs text-indigo-600 dark:text-indigo-400 mt-0.5">{c.date}</div>}
            {c.meta && <div className="text-xs text-slate-400 mt-0.5">{stripTags(c.meta)}</div>}
            {c.description && (
              <div
                className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed prose prose-xs max-w-none line-clamp-3 mt-1"
                dangerouslySetInnerHTML={{ __html: c.description }}
              />
            )}
            {c.url && (
              <a
                href={c.url} target="_blank" rel="noopener noreferrer"
                onClick={e => e.stopPropagation()}
                className="inline-flex items-center gap-1 text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline mt-2"
              >
                Learn More →
              </a>
            )}
          </div>
        </div>
      );
    }
    case 'pco_groups_widget':
      return <div className="text-xs text-slate-500 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-2 flex items-center gap-2"><Users size={14} className="text-indigo-500" /> PCO Groups Widget</div>;
    case 'pco_registrations_widget':
      return <div className="text-xs text-slate-500 bg-indigo-50 dark:bg-indigo-900/20 rounded-lg p-2 flex items-center gap-2"><ClipboardList size={14} className="text-indigo-500" /> PCO Registrations Widget</div>;
    case 'pastoral_care_chart':
      return <div className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-900 rounded-lg p-2">📊 Pastoral Care Chart: {c.area}</div>;
    case 'data_chart':
      return (
        <AnalyticsWidgetBlock
          widgetId={c.widgetId as AnalyticsWidgetId}
          label={c.label || c.chartType || 'Analytics'}
          data={c.data || {}}
        />
      );
    case 'columns':
      // BlockThumbnail is read-only; ColumnBlockRenderer (interactive) is rendered directly in SortableCanvasBlock
      return (
        <div className="flex items-center gap-1.5 text-xs text-slate-400">
          <LayoutGrid size={12} />
          <span>Column layout · {block.content?.layout || '2'} columns</span>
        </div>
      );
    default:
      return <div className="text-xs text-slate-400">{block.type}</div>;
  }
};

// ─── Shared upload hook ───────────────────────────────────────────────────────

function useUpload(folder: string) {
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const upload = useCallback(async (file: File): Promise<string> => {
    setUploading(true);
    setProgress(0);
    const path = `${folder}/${Date.now()}_${file.name}`;
    const sRef = storageRef(storage, path);
    await new Promise<void>((resolve, reject) => {
      const task = uploadBytesResumable(sRef, file);
      task.on('state_changed',
        snap => setProgress(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
        reject,
        () => resolve()
      );
    });
    const url = await getDownloadURL(sRef);
    setUploading(false);
    return url;
  }, [folder]);
  return { upload, uploading, progress };
}

// ─── Media library picker ─────────────────────────────────────────────────────

const MediaLibraryPicker: React.FC<{
  onPick: (url: string) => void;
  onClose: () => void;
}> = ({ onPick, onClose }) => {
  const [images, setImages] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const imagesRef = storageRef(storage, 'email_images');
    listAll(imagesRef)
      .then(res => Promise.all(res.items.map(item => getDownloadURL(item))))
      .then(urls => { setImages(urls); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40" onClick={onClose}>
      <div
        className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-[600px] max-h-[70vh] flex flex-col overflow-hidden"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-700">
          <h3 className="font-bold text-slate-900 dark:text-white text-sm">Media Library</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition">
            <X size={18} />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto p-4">
          {loading && <div className="flex justify-center py-10"><Loader2 size={22} className="animate-spin text-indigo-400" /></div>}
          {!loading && images.length === 0 && (
            <div className="text-center py-10 text-slate-400 text-sm">No images uploaded yet.</div>
          )}
          <div className="grid grid-cols-3 gap-3">
            {images.map((url, i) => (
              <button
                key={i}
                onClick={() => onPick(url)}
                className="aspect-square overflow-hidden rounded-xl border-2 border-transparent hover:border-indigo-500 transition group"
              >
                <img src={url} alt="" className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

// ─── Inline text editor (embedded Tiptap) ─────────────────────────────────────

const InlineTextEditor: React.FC<{
  block: EmailBlock;
  onUpdate: (content: any) => void;
}> = ({ block, onUpdate }) => {
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [align, setAlign] = useState<'left' | 'center' | 'right'>(
    block.content?.align || 'left'
  );

  const editor = useEditor({
    extensions: [StarterKit],
    content: block.content?.text || block.content?.html || '',
    onUpdate: ({ editor }) => {
      const html = editor.getHTML();
      onUpdate({ ...block.content, text: html, html, align });
    },
  });

  // Re-sync when block id changes
  useEffect(() => {
    if (editor) {
      const content = block.content?.text || block.content?.html || '';
      if (editor.getHTML() !== content) editor.commands.setContent(content);
    }
    setAlign(block.content?.align || 'left');
  }, [block.id]);

  const handleAlignChange = (a: 'left' | 'center' | 'right') => {
    setAlign(a);
    onUpdate({ ...block.content, text: editor?.getHTML() || '', html: editor?.getHTML() || '', align: a });
  };

  const handleInsertLink = () => {
    if (!editor || !linkUrl) return;
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to);
    if (selectedText) {
      editor.chain().focus().extendMarkRange('bold').unsetAllMarks()
        .insertContentAt({ from, to }, `<a href="${linkUrl}" target="_blank">${selectedText}</a>`)
        .run();
    } else {
      editor.chain().focus().insertContent(`<a href="${linkUrl}" target="_blank">${linkUrl}</a>`).run();
    }
    setLinkUrl('');
    setShowLinkInput(false);
    onUpdate({ ...block.content, text: editor.getHTML(), html: editor.getHTML(), align });
  };

  const btn = (active: boolean) =>
    `p-1 rounded transition text-xs ${
      active ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
             : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'
    }`;

  return (
    <div className="border border-indigo-200 dark:border-indigo-700 rounded-xl overflow-hidden" onClick={e => e.stopPropagation()}>
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-0.5 px-2 py-1.5 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
        {/* Format */}
        <button onClick={() => editor?.chain().focus().toggleBold().run()} className={btn(!!editor?.isActive('bold'))}><Bold size={12} /></button>
        <button onClick={() => editor?.chain().focus().toggleItalic().run()} className={btn(!!editor?.isActive('italic'))}><Italic size={12} /></button>
        <button onClick={() => editor?.chain().focus().toggleHeading({ level: 1 }).run()} className={btn(!!editor?.isActive('heading', { level: 1 }))}><span className="font-bold text-[11px]">H1</span></button>
        <button onClick={() => editor?.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(!!editor?.isActive('heading', { level: 2 }))}><span className="font-bold text-[11px]">H2</span></button>
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
        {/* Lists */}
        <button onClick={() => editor?.chain().focus().toggleBulletList().run()} className={btn(!!editor?.isActive('bulletList'))}><List size={12} /></button>
        <button onClick={() => editor?.chain().focus().toggleOrderedList().run()} className={btn(!!editor?.isActive('orderedList'))}><ListOrdered size={12} /></button>
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
        {/* Alignment (stored in content.align, applied as wrapper style) */}
        <button onClick={() => handleAlignChange('left')} className={btn(align === 'left')} title="Align left"><AlignLeft size={12} /></button>
        <button onClick={() => handleAlignChange('center')} className={btn(align === 'center')} title="Align center"><AlignCenter size={12} /></button>
        <button onClick={() => handleAlignChange('right')} className={btn(align === 'right')} title="Align right"><AlignRight size={12} /></button>
        <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-0.5" />
        {/* Link */}
        <button onClick={() => setShowLinkInput(v => !v)} className={btn(showLinkInput)} title="Insert link"><Link size={12} /></button>
      </div>
      {/* Link input row */}
      {showLinkInput && (
        <div className="flex items-center gap-1.5 px-2 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800">
          <input
            type="url"
            value={linkUrl}
            onChange={e => setLinkUrl(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') handleInsertLink(); if (e.key === 'Escape') setShowLinkInput(false); }}
            placeholder="https://…"
            className="flex-1 text-xs border border-indigo-200 dark:border-indigo-700 rounded px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white outline-none"
            autoFocus
          />
          <button onClick={handleInsertLink} className="text-xs font-semibold text-indigo-600 dark:text-indigo-400 hover:underline px-1">Insert</button>
          <button onClick={() => setShowLinkInput(false)} className="text-slate-400 hover:text-slate-600"><X size={13} /></button>
        </div>
      )}
      {/* Editor area */}
      <div style={{ textAlign: align }}>
        <EditorContent
          editor={editor}
          className="prose prose-sm max-w-none p-3 min-h-[100px] bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus-within:outline-none"
        />
      </div>
    </div>
  );
};

// ─── Inline media editor ───────────────────────────────────────────────────────

const InlineMediaEditor: React.FC<{
  block: EmailBlock;
  onUpdate: (content: any) => void;
  churchId?: string;
}> = ({ block, onUpdate, churchId }) => {
  const [showLibrary, setShowLibrary] = useState(false);
  const imageUpload = useUpload('email_images');
  const fileUpload = useUpload('email_files');
  const imgInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const c = block.content || {};

  if (block.type === 'image') {
    return (
      <div className="space-y-3" onClick={e => e.stopPropagation()}>
        {/* Preview */}
        {c.src && <img src={c.src} alt={c.alt || ''} className="w-full max-h-48 object-cover rounded-lg" />}
        {!c.src && <div className="w-full h-28 bg-slate-100 dark:bg-slate-700 rounded-lg flex items-center justify-center text-slate-400"><ImageIcon size={32} /></div>}

        {/* Upload + Library row */}
        <div className="flex gap-2">
          <input ref={imgInputRef} type="file" accept="image/*" className="hidden" onChange={async e => {
            const file = e.target.files?.[0];
            if (!file) return;
            try {
              const url = await imageUpload.upload(file);
              onUpdate({ ...c, src: url });
            } catch { alert('Upload failed. Please try again.'); }
          }} />
          <button
            onClick={() => imgInputRef.current?.click()}
            disabled={imageUpload.uploading}
            className="flex-1 flex items-center justify-center gap-1.5 text-xs font-semibold border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-lg py-2 hover:border-indigo-400 hover:text-indigo-600 dark:hover:border-indigo-500 dark:hover:text-indigo-400 transition text-slate-500 dark:text-slate-400 disabled:opacity-50"
          >
            {imageUpload.uploading ? <><Loader2 size={13} className="animate-spin" /> {imageUpload.progress}%</> : <><Upload size={13} /> Upload Image</>}
          </button>
          <button
            onClick={() => setShowLibrary(true)}
            className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 border border-slate-200 dark:border-slate-600 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 transition"
          >
            <Images size={13} /> Library
          </button>
        </div>

        {/* URL input */}
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Or paste URL</label>
          <input type="url" value={c.src || ''} onChange={e => onUpdate({ ...c, src: e.target.value })} placeholder="https://…"
            className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Alt text</label>
          <input type="text" value={c.alt || ''} onChange={e => onUpdate({ ...c, alt: e.target.value })} placeholder="Describe the image…"
            className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Link URL (optional)</label>
          <input type="url" value={c.link || ''} onChange={e => onUpdate({ ...c, link: e.target.value })} placeholder="https://…"
            className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>

        {showLibrary && <MediaLibraryPicker onPick={url => { onUpdate({ ...c, src: url }); setShowLibrary(false); }} onClose={() => setShowLibrary(false)} />}
      </div>
    );
  }
  if (block.type === 'video') {
    // Extract YouTube ID for live thumbnail preview
    const extractYtId = (url: string): string | null => {
      if (!url) return null;
      const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
      return m ? m[1] : null;
    };
    const ytId = extractYtId(c.src || '');

    return (
      <div className="space-y-3" onClick={e => e.stopPropagation()}>
        {/* Live thumbnail preview */}
        {ytId ? (
          <div className="relative rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 group/thumb">
            <img
              src={`https://img.youtube.com/vi/${ytId}/hqdefault.jpg`}
              alt="YouTube thumbnail"
              className="w-full block rounded-xl"
              onError={e => { (e.target as HTMLImageElement).style.background = '#000'; }}
            />
            {/* Play button overlay */}
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <div className="w-14 h-14 rounded-full bg-black/65 flex items-center justify-center">
                <svg width={24} height={24} viewBox="0 0 24 24" fill="white">
                  <polygon points="8,6 8,18 18,12" />
                </svg>
              </div>
            </div>
            {/* YouTube badge */}
            <div className="absolute bottom-2 right-2 bg-red-600 text-white text-[9px] font-black px-1.5 py-0.5 rounded pointer-events-none tracking-wide">
              ▶ YouTube
            </div>
            {/* Remove button */}
            <button
              onClick={() => onUpdate({ ...c, src: '' })}
              className="absolute top-2 right-2 p-1 bg-black/50 text-white rounded-full hover:bg-black/70 transition opacity-0 group-hover/thumb:opacity-100"
              title="Remove video"
            >
              <X size={12} />
            </button>
          </div>
        ) : (
          <div className="w-full h-24 bg-slate-100 dark:bg-slate-700 rounded-xl flex flex-col items-center justify-center gap-1.5 text-slate-400">
            <Video size={24} />
            <span className="text-[10px]">Paste a YouTube URL below</span>
          </div>
        )}

        {/* URL input */}
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">YouTube URL</label>
          <input
            type="url"
            value={c.src || ''}
            onChange={e => onUpdate({ ...c, src: e.target.value })}
            placeholder="https://youtube.com/watch?v=…"
            className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
          />
        </div>

        {/* Info note */}
        <p className="text-[10px] text-slate-400 dark:text-slate-500 leading-relaxed">
          📧 Email recipients will see the video thumbnail above. Clicking it opens YouTube in their browser — email clients don't support embedded video.
        </p>
      </div>
    );
  }
  if (block.type === 'button') {
    const btnBg = c.color || '#6366f1';
    const btnTc = c.textColor || '#ffffff';
    const btnRad = c.borderRadius === 'pill' ? 999 : c.borderRadius === 'square' ? 4 : 8;
    const btnPad = c.size === 'small' ? '6px 14px' : c.size === 'large' ? '12px 32px' : '8px 22px';
    const btnFs = c.size === 'small' ? 12 : c.size === 'large' ? 16 : 14;
    const alignClass = c.align === 'left' ? 'justify-start' : c.align === 'right' ? 'justify-end' : 'justify-center';
    const inputCls = 'w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500';
    const labelCls = 'block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1';
    const segBtn = (active: boolean) =>
      `flex-1 text-[11px] font-semibold py-1.5 rounded-lg border transition ${
        active
          ? 'bg-indigo-600 text-white border-indigo-600'
          : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-600 hover:border-indigo-300'
      }`;
    return (
      <div className="space-y-3" onClick={e => e.stopPropagation()}>
        {/* Live preview */}
        <div className={`flex ${alignClass} py-2 px-1 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-700`}>
          <span style={{ background: btnBg, color: btnTc, borderRadius: btnRad, padding: btnPad, fontSize: btnFs, fontWeight: 600, display: 'inline-block' }}>
            {c.text || 'Button'}
          </span>
        </div>

        {/* Label */}
        <div>
          <label className={labelCls}>Button Label</label>
          <input type="text" value={c.text || ''} onChange={e => onUpdate({ ...c, text: e.target.value })} placeholder="Click Here" className={inputCls} />
        </div>

        {/* URL */}
        <div>
          <label className={labelCls}>Link URL</label>
          <input type="url" value={c.url || ''} onChange={e => onUpdate({ ...c, url: e.target.value })} placeholder="https://…" className={inputCls} />
        </div>

        {/* Colors */}
        <div className="grid grid-cols-2 gap-2">
          <div>
            <label className={labelCls}>Button Color</label>
            <div className="flex items-center gap-1.5">
              <input type="color" value={btnBg} onChange={e => onUpdate({ ...c, color: e.target.value })}
                className="w-8 h-7 rounded cursor-pointer border border-slate-200 dark:border-slate-600 p-0" />
              <input type="text" value={btnBg} onChange={e => onUpdate({ ...c, color: e.target.value })}
                className="flex-1 text-[11px] font-mono border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>
          <div>
            <label className={labelCls}>Text Color</label>
            <div className="flex items-center gap-1.5">
              <input type="color" value={btnTc} onChange={e => onUpdate({ ...c, textColor: e.target.value })}
                className="w-8 h-7 rounded cursor-pointer border border-slate-200 dark:border-slate-600 p-0" />
              <input type="text" value={btnTc} onChange={e => onUpdate({ ...c, textColor: e.target.value })}
                className="flex-1 text-[11px] font-mono border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
            </div>
          </div>
        </div>

        {/* Shape */}
        <div>
          <label className={labelCls}>Shape</label>
          <div className="flex gap-1">
            {(['square', 'rounded', 'pill'] as const).map(r => (
              <button key={r} onClick={() => onUpdate({ ...c, borderRadius: r })} className={segBtn((c.borderRadius || 'rounded') === r)}>
                {r === 'pill' ? '● Pill' : r === 'square' ? '■ Square' : '▢ Rounded'}
              </button>
            ))}
          </div>
        </div>

        {/* Size */}
        <div>
          <label className={labelCls}>Size</label>
          <div className="flex gap-1">
            {(['small', 'medium', 'large'] as const).map(s => (
              <button key={s} onClick={() => onUpdate({ ...c, size: s })} className={segBtn((c.size || 'medium') === s)}>
                {s.charAt(0).toUpperCase() + s.slice(1)}
              </button>
            ))}
          </div>
        </div>

        {/* Alignment */}
        <div>
          <label className={labelCls}>Alignment</label>
          <div className="flex gap-1">
            {(['left', 'center', 'right'] as const).map(a => (
              <button key={a} onClick={() => onUpdate({ ...c, align: a })} className={segBtn((c.align || 'center') === a)}>
                {a === 'left' ? '⬅ Left' : a === 'right' ? 'Right ➡' : '↔ Center'}
              </button>
            ))}
          </div>
        </div>
      </div>
    );
  }
  if (block.type === 'file') {
    return (
      <div className="space-y-2" onClick={e => e.stopPropagation()}>
        {/* Upload */}
        <input ref={fileInputRef} type="file" className="hidden" onChange={async e => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            const url = await fileUpload.upload(file);
            onUpdate({ ...c, name: file.name, url });
          } catch { alert('Upload failed. Please try again.'); }
        }} />
        <button
          onClick={() => fileInputRef.current?.click()}
          disabled={fileUpload.uploading}
          className="w-full flex items-center justify-center gap-1.5 text-xs font-semibold border-2 border-dashed border-slate-200 dark:border-slate-600 rounded-lg py-2.5 hover:border-indigo-400 hover:text-indigo-600 dark:hover:border-indigo-500 dark:hover:text-indigo-400 transition text-slate-500 dark:text-slate-400 disabled:opacity-50"
        >
          {fileUpload.uploading ? <><Loader2 size={13} className="animate-spin" /> {fileUpload.progress}%</> : <><Upload size={13} /> Upload File</>}
        </button>

        {c.name && (
          <div className="flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 rounded-lg px-3 py-2">
            <File size={14} className="text-indigo-400" />
            <span className="truncate">{c.name}</span>
          </div>
        )}

        <div>
          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">File Name</label>
          <input type="text" value={c.name || ''} onChange={e => onUpdate({ ...c, name: e.target.value })} placeholder="document.pdf"
            className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
        <div>
          <label className="block text-[10px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">Or paste URL</label>
          <input type="url" value={c.url || ''} onChange={e => onUpdate({ ...c, url: e.target.value })} placeholder="https://…"
            className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-lg px-2.5 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500" />
        </div>
      </div>
    );
  }
  return null;
};

// ─── Sortable canvas block ────────────────────────────────────────────────────

const INLINE_EDITABLE = new Set(['text', 'header', 'html', 'image', 'video', 'button', 'file']);

const SortableCanvasBlock: React.FC<{
  block: EmailBlock;
  isSelected: boolean;
  onSelect: () => void;
  onEdit?: () => void;
  onDelete: () => void;
  onDuplicate: () => void;
  onUpdate: (content: any) => void;
}> = ({ block, isSelected, onSelect, onDelete, onDuplicate, onUpdate }) => {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition, opacity: isDragging ? 0.4 : 1 };
  const isEditable = INLINE_EDITABLE.has(block.type);
  const isTextBlock = ['text', 'header', 'html'].includes(block.type);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group relative rounded-xl border-2 transition-all ${
        isSelected
          ? 'border-indigo-500 shadow-md shadow-indigo-100 dark:shadow-indigo-900/20'
          : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer'
      }`}
      onClick={!isSelected ? onSelect : undefined}
    >
      {/* Drag handle */}
      <div
        {...attributes}
        {...listeners}
        className={`absolute -left-7 top-3 cursor-grab p-1 rounded text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 opacity-0 group-hover:opacity-100 transition ${isSelected ? 'opacity-100' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        <GripVertical size={16} />
      </div>

      {/* Block content — thumbnail normally, inline editor when selected */}
      <div className="bg-white dark:bg-slate-800 rounded-xl min-h-[40px] overflow-hidden">
        {isSelected && isEditable ? (
          <div className="p-3">
            {isTextBlock ? (
              <InlineTextEditor block={block} onUpdate={onUpdate} />
            ) : (
              <InlineMediaEditor block={block} onUpdate={onUpdate} />
            )}
          </div>
        ) : (
          <div className="p-4">
            {block.type === 'columns' ? (
              <ColumnBlockRenderer block={block} onChange={content => onUpdate(content)} />
            ) : (
              <BlockThumbnail block={block} />
            )}
          </div>
        )}
      </div>

      {/* Floating action buttons — top right */}
      <div
        className={`absolute -top-3 right-2 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition ${isSelected ? 'opacity-100' : ''}`}
        onClick={e => e.stopPropagation()}
      >
        {isSelected && (
          <button
            onClick={onSelect}
            className="flex items-center gap-1 px-2 py-1 bg-indigo-600 text-white border border-indigo-600 rounded-lg shadow-sm text-xs font-medium"
          >
            ✓ Done
          </button>
        )}
        <button
          onClick={onDuplicate}
          className="p-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
          title="Duplicate"
        >
          <Copy size={12} />
        </button>
        <button
          onClick={onDelete}
          className="p-1.5 bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 rounded-lg shadow-sm text-slate-400 hover:text-red-500 transition"
          title="Delete"
        >
          <Trash2 size={12} />
        </button>
      </div>
    </div>
  );
};

// ─── Column Layout renderer ──────────────────────────────────────────────────

const COLUMN_GRID: Record<ColumnLayout, string> = {
  '1':   'grid-cols-1',
  '2':   'grid-cols-2',
  '3':   'grid-cols-3',
  '2:1': 'grid-cols-[2fr_1fr]',
  '1:2': 'grid-cols-[1fr_2fr]',
};

const MINI_BLOCK_TYPES = [
  { type: 'text'   as const, label: 'Text',   default: { text: '<p>Type here…</p>' } },
  { type: 'image'  as const, label: 'Image',  default: { src: '' } },
  { type: 'button' as const, label: 'Button', default: { text: 'Click Here', url: '#' } },
];

const MiniBlockView: React.FC<{ b: { id: string; type: string; content: any } }> = ({ b }) => {
  const c = b.content || {};
  if (b.type === 'text') return (
    <div className="text-xs text-slate-700 dark:text-slate-300 prose prose-xs max-w-none pointer-events-none line-clamp-3"
      dangerouslySetInnerHTML={{ __html: c.text || '' }} />
  );
  if (b.type === 'image') return c.src
    ? <img src={c.src} alt="" className="w-full rounded object-cover max-h-24" />
    : <div className="w-full h-12 bg-slate-100 dark:bg-slate-700 rounded flex items-center justify-center text-slate-300"><ImageIcon size={18} /></div>;
  if (b.type === 'button') {
    const btnBg = c.color || '#6366f1';
    const btnTc = c.textColor || '#ffffff';
    const btnRad = c.borderRadius === 'pill' ? 999 : c.borderRadius === 'square' ? 4 : 6;
    const alignClass = c.align === 'left' ? 'justify-start' : c.align === 'right' ? 'justify-end' : 'justify-center';
    return (
      <div className={`flex ${alignClass}`}>
        <span style={{ background: btnBg, color: btnTc, borderRadius: btnRad, padding: '4px 12px', fontSize: 12, fontWeight: 600, display: 'inline-block' }}>{c.text || 'Button'}</span>
      </div>
    );
  }
  return null;
};

const ColumnBlockRenderer: React.FC<{
  block: EmailBlock;
  onChange: (newContent: any) => void;
}> = ({ block, onChange }) => {
  const layout: ColumnLayout = block.content?.layout || '2';
  const cells: ColumnCell[] = block.content?.cells || [];
  const [addingInCell, setAddingInCell] = useState<string | null>(null);
  const [selectedMiniId, setSelectedMiniId] = useState<string | null>(null);

  const addMiniBlock = (cellId: string, type: 'text' | 'image' | 'button') => {
    const def = MINI_BLOCK_TYPES.find(d => d.type === type)!;
    const newMini = { id: `mini_${Date.now()}`, type, content: { ...def.default } };
    const newCells = cells.map(cell =>
      cell.id === cellId ? { ...cell, blocks: [...cell.blocks, newMini] } : cell
    );
    onChange({ ...block.content, cells: newCells });
    setAddingInCell(null);
    setSelectedMiniId(newMini.id);
  };

  const removeMiniBlock = (cellId: string, miniId: string) => {
    const newCells = cells.map(cell =>
      cell.id === cellId ? { ...cell, blocks: cell.blocks.filter(b => b.id !== miniId) } : cell
    );
    onChange({ ...block.content, cells: newCells });
    if (selectedMiniId === miniId) setSelectedMiniId(null);
  };

  const updateMiniBlock = (cellId: string, miniId: string, newContent: any) => {
    const newCells = cells.map(cell =>
      cell.id === cellId
        ? { ...cell, blocks: cell.blocks.map(b => b.id === miniId ? { ...b, content: newContent } : b) }
        : cell
    );
    onChange({ ...block.content, cells: newCells });
  };

  return (
    <div className={`grid gap-3 ${COLUMN_GRID[layout]}`}>
      {cells.map(cell => (
        <div key={cell.id} className="relative border border-dashed border-slate-300 dark:border-slate-600 rounded-lg p-2 min-h-[60px] bg-slate-50 dark:bg-slate-900">
          {/* Mini blocks in this cell */}
          <div className="space-y-2 mb-2">
            {cell.blocks.map(mb => {
              const isSelected = selectedMiniId === mb.id;
              const isTextLike = ['text', 'header', 'html'].includes(mb.type);
              const isMediaLike = ['image', 'video', 'button', 'file'].includes(mb.type);
              const asMiniBlock: EmailBlock = { id: mb.id, type: mb.type as BlockType, content: mb.content };

              return (
                <div
                  key={mb.id}
                  className={`relative group/mini rounded-lg border-2 transition-all ${
                    isSelected
                      ? 'border-indigo-400 bg-white dark:bg-slate-800'
                      : 'border-transparent hover:border-slate-300 dark:hover:border-slate-600 cursor-pointer'
                  }`}
                  onClick={!isSelected ? () => setSelectedMiniId(mb.id) : undefined}
                >
                  {/* Inline editor when selected */}
                  {isSelected && isTextLike && (
                    <div className="p-2" onClick={e => e.stopPropagation()}>
                      <InlineTextEditor
                        block={asMiniBlock}
                        onUpdate={(content) => updateMiniBlock(cell.id, mb.id, content)}
                      />
                    </div>
                  )}
                  {isSelected && isMediaLike && (
                    <div className="p-2" onClick={e => e.stopPropagation()}>
                      <InlineMediaEditor
                        block={asMiniBlock}
                        onUpdate={(content) => updateMiniBlock(cell.id, mb.id, content)}
                      />
                    </div>
                  )}

                  {/* Thumbnail when not selected */}
                  {!isSelected && (
                    <div className="p-2">
                      <MiniBlockView b={mb} />
                    </div>
                  )}

                  {/* Action bar */}
                  <div className="absolute -top-2 right-1 flex items-center gap-1 opacity-0 group-hover/mini:opacity-100 transition" onClick={e => e.stopPropagation()}>
                    {isSelected && (
                      <button
                        onClick={() => setSelectedMiniId(null)}
                        className="px-1.5 py-0.5 bg-indigo-600 text-white rounded text-[9px] font-bold"
                      >
                        ✓ Done
                      </button>
                    )}
                    <button
                      onClick={() => removeMiniBlock(cell.id, mb.id)}
                      className="w-4 h-4 bg-red-500 text-white rounded-full flex items-center justify-center text-[10px]"
                    >×</button>
                  </div>
                </div>
              );
            })}
          </div>
          {/* Add mini block to this cell */}
          <div className="relative">
            {addingInCell === cell.id ? (
              <div className="flex flex-wrap gap-1">
                {MINI_BLOCK_TYPES.map(({ type, label }) => (
                  <button
                    key={type}
                    onClick={() => addMiniBlock(cell.id, type)}
                    className="px-2 py-1 rounded text-[10px] font-medium bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-200 dark:hover:bg-indigo-800/60 transition"
                  >{label}</button>
                ))}
                <button onClick={() => setAddingInCell(null)} className="px-2 py-1 rounded text-[10px] text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition">Cancel</button>
              </div>
            ) : (
              <button
                onClick={() => setAddingInCell(cell.id)}
                className="w-full flex items-center justify-center gap-1 py-1 text-[10px] text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded transition"
              >
                <Plus size={9} /> Add block
              </button>
            )}
          </div>
        </div>
      ))}
    </div>
  );
};


const SidebarSection: React.FC<{ title: string; icon: React.ReactNode; children: React.ReactNode; defaultOpen?: boolean }> = ({
  title, icon, children, defaultOpen = false
}) => {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-slate-100 dark:border-slate-700">
      <button
        onClick={() => setOpen(p => !p)}
        className="w-full flex items-center justify-between px-4 py-3 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
      >
        <span className="flex items-center gap-2">{icon}{title}</span>
        {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronRight size={14} className="text-slate-400" />}
      </button>
      {open && <div className="px-4 pb-4">{children}</div>}
    </div>
  );
};

// ─── PCO Quick Picker (inline, single-item) ──────────────────────────────────

type PcoPickType = 'pco_registration' | 'pco_group' | 'pco_event';

const PCO_PICK_CONFIG: Record<PcoPickType, {
  label: string;
  icon: React.ReactNode;
  fetch: (churchId: string) => Promise<any[]>;
  map: (item: any) => { id: string; name: string; date?: string; imageUrl?: string; description?: string; meta?: string; url?: string };
}> = {
  pco_registration: {
    label: 'Registration',
    icon: <ClipboardList size={14} />,
    fetch: (id) => pcoService.getRegistrations(id),
    map: (item) => {
      // The Signup resource has no top-level starts_at; dates are in included SignupTimes.
      // pcoService.getRegistrations includes signup_times so they'll be in the raw response included array.
      // However since we're mapping raw items (not the full page), use open_at as a fallback date.
      const attrs = item.attributes || {};
      const dateStr = attrs.open_at
        ? new Date(attrs.open_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
        : undefined;
      return {
        id: item.id,
        name: attrs.name || 'Unnamed',
        date: dateStr,
        imageUrl: attrs.logo_url,
        description: attrs.description,
        meta: attrs.archived ? 'Archived' : 'Active',
        url: attrs.new_registration_url || (item.id ? `https://registrations.planningcenteronline.com/events/${item.id}` : undefined)
      };
    }
  },

  pco_group: {
    label: 'Group',
    icon: <Users size={14} />,
    fetch: (id) => pcoService.getGroups(id),
    map: (item) => ({
      id: item.id,
      name: item.attributes?.name || 'Unnamed',
      imageUrl: item.attributes?.header_image?.medium || item.attributes?.header_image?.thumbnail,
      description: item.attributes?.description,
      meta: `${item.attributes?.memberships_count ?? '?'} members`,
      url: item.attributes?.public_church_center_web_url || (item.id ? `https://groups.planningcenteronline.com/groups/${item.id}` : undefined)
    })
  },
  pco_event: {
    label: 'Calendar Event',
    icon: <Calendar size={14} />,
    fetch: (id) => pcoService.getEvents(id),
    map: (item) => ({
      id: item.id,
      name: item.attributes?.name || 'Unnamed',
      date: item.attributes?.starts_at ? new Date(item.attributes.starts_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : undefined,
      imageUrl: item.attributes?.image_url,
      description: item.attributes?.description,
      meta: item.attributes?.location || '',
      url: item.attributes?.registration_url || item.attributes?.app_info?.desktop_url
    })
  }
};

const PcoQuickPicker: React.FC<{
  type: PcoPickType;
  churchId: string;
  onPick: (type: PcoPickType, item: any) => void;
  onClose: () => void;
}> = ({ type, churchId, onPick, onClose }) => {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const config = PCO_PICK_CONFIG[type];

  useEffect(() => {
    config.fetch(churchId)
      .then(raw => {
        // For registrations, exclude events archived in Planning Center
        const filtered = type === 'pco_registration'
          ? (raw || []).filter((item: any) => !item.attributes?.archived)
          : (raw || []);
        setItems(filtered.map(config.map));
        setLoading(false);
      })
      .catch(e => { setError(e?.message || 'Failed to load'); setLoading(false); });
  }, [type, churchId]);

  const filtered = items.filter(i =>
    !search.trim() || i.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="mt-2 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
        <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">{config.icon} Pick a {config.label}</span>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={13} /></button>
      </div>
      {/* Search */}
      <div className="px-2 py-2 border-b border-slate-100 dark:border-slate-700">
        <div className="relative">
          <Search size={11} className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={`Search ${config.label.toLowerCase()}s…`}
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="w-full pl-6 pr-2 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            autoFocus
          />
        </div>
      </div>
      {/* List */}
      <div className="max-h-60 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-6 text-slate-400 gap-2 text-xs">
            <Loader2 size={14} className="animate-spin" /> Loading…
          </div>
        ) : error ? (
          <div className="p-3 space-y-1">
            <div className="text-xs text-red-500 font-medium">{error}</div>
            {(error.toLowerCase().includes('authenticated') || error.toLowerCase().includes('401') || error.toLowerCase().includes('token')) && (
              <div className="text-[10px] text-slate-400">Go to Settings → Planning Center to reconnect your PCO account.</div>
            )}
            {(error.includes('404') || error.toLowerCase().includes('not accessible') || error.includes('[requiresReauth]')) && type === 'pco_registration' && (
              <div className="text-[10px] text-slate-400">
                Your PCO connection needs to be updated to grant Registrations access.
                Go to <strong>Settings → Planning Center</strong> and click <strong>Setup Integration</strong> to reconnect.
              </div>
            )}
          </div>
        ) : filtered.length === 0 ? (
          <div className="text-xs text-slate-400 text-center py-6">No {config.label.toLowerCase()}s found</div>
        ) : (
          filtered.map(item => (
            <button
              key={item.id}
              onClick={() => onPick(type, item)}
              className="w-full flex items-center gap-2.5 px-3 py-2.5 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition text-left border-b border-slate-50 dark:border-slate-700 last:border-0"
            >
              {item.imageUrl ? (
                <img src={item.imageUrl} alt={item.name} className="w-9 h-9 rounded-lg object-cover shrink-0 bg-slate-100"
                  onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }} />
              ) : (
                <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-indigo-100 to-indigo-200 dark:from-indigo-900/40 dark:to-indigo-800/40 shrink-0 flex items-center justify-center">
                  {config.icon}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-xs font-semibold text-slate-900 dark:text-white truncate">{item.name}</div>
                {item.date && <div className="text-[10px] text-indigo-600 dark:text-indigo-400">{item.date}</div>}
                {item.meta && <div className="text-[10px] text-slate-400">{item.meta}</div>}
              </div>
              <Plus size={13} className="text-indigo-500 shrink-0" />
            </button>
          ))
        )}
      </div>
    </div>
  );
};

// ─── AI Writing Panel ────────────────────────────────────────────────────────

type AiMessage = { role: 'user' | 'model'; text: string; html?: string };
const AI_TONES = ['Warm & Pastoral', 'Formal', 'Friendly', 'Inspirational', 'Urgent'] as const;
type AiTone = typeof AI_TONES[number];

const EmailAIPanel: React.FC<{
  isOpen: boolean;
  onClose: () => void;
  selectedBlock: EmailBlock | null;
  campaignSubject?: string;
  churchName?: string;
  onInsert: (html: string, replaceSelectedBlock: boolean) => void;
}> = ({ isOpen, onClose, selectedBlock, campaignSubject, churchName, onInsert }) => {
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [tone, setTone] = useState<AiTone>('Warm & Pastoral');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastHtml, setLastHtml] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Strip HTML tags for display
  const stripHtml = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();

  // Auto-scroll to bottom when messages update
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  // Focus input when panel opens
  useEffect(() => {
    if (isOpen) setTimeout(() => inputRef.current?.focus(), 100);
  }, [isOpen]);

  const selectedBlockText = selectedBlock
    ? stripHtml(selectedBlock.content?.text || selectedBlock.content?.html || '')
    : undefined;

  const handleSend = async () => {
    const trimmed = input.trim();
    if (!trimmed || loading) return;
    setError(null);
    const userMsg: AiMessage = { role: 'user', text: trimmed };
    const newHistory = [...messages, userMsg];
    setMessages(newHistory);
    setInput('');
    setLoading(true);
    try {
      const { html } = await generateEmailContent(
        newHistory.map(m => ({ role: m.role, text: m.text })),
        {
          tone,
          selectedBlockText,
          campaignSubject,
          churchName,
        }
      );
      const modelMsg: AiMessage = { role: 'model', text: stripHtml(html), html };
      setMessages(prev => [...prev, modelMsg]);
      setLastHtml(html);
    } catch (e: any) {
      setError(e?.message || 'Something went wrong.');
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  const handleCopy = () => {
    if (!lastHtml) return;
    navigator.clipboard.writeText(stripHtml(lastHtml));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClear = () => {
    setMessages([]);
    setLastHtml(null);
    setError(null);
  };

  // Suggestion chips shown when the conversation is empty
  const suggestions = selectedBlock
    ? [
        'Make this shorter',
        'Make this more compelling',
        'Add a clear call to action',
        'Rewrite in a more formal tone',
      ]
    : [
        'Write a welcome message for new visitors',
        'Announce our upcoming service series',
        'Write a giving appeal for the general fund',
        'Draft an invitation to our small groups',
      ];

  return (
    <div
      className={`flex flex-col h-full bg-white dark:bg-slate-900 border-l border-slate-200 dark:border-slate-700 transition-all duration-300 ease-in-out overflow-hidden ${
        isOpen ? 'w-80 shrink-0' : 'w-0'
      }`}
    >
      {isOpen && (
        <>
          {/* ── Panel Header ── */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-gradient-to-r from-indigo-600 to-violet-600 shrink-0">
            <div className="flex items-center gap-2">
              <Sparkles size={16} className="text-white/90" />
              <span className="text-sm font-bold text-white">AI Writing Assistant</span>
            </div>
            <div className="flex items-center gap-1">
              {messages.length > 0 && (
                <button
                  onClick={handleClear}
                  title="Clear conversation"
                  className="p-1 rounded text-white/70 hover:text-white hover:bg-white/10 transition"
                >
                  <RotateCcw size={13} />
                </button>
              )}
              <button
                onClick={onClose}
                className="p-1 rounded text-white/70 hover:text-white hover:bg-white/10 transition"
              >
                <X size={15} />
              </button>
            </div>
          </div>

          {/* ── Context badge (selected block) ── */}
          {selectedBlock && (
            <div className="px-3 py-1.5 bg-indigo-50 dark:bg-indigo-900/20 border-b border-indigo-100 dark:border-indigo-800 shrink-0">
              <p className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide mb-0.5">Editing selected block</p>
              <p className="text-[11px] text-slate-600 dark:text-slate-400 truncate">
                {selectedBlockText?.slice(0, 60) || '(empty block)'}…
              </p>
            </div>
          )}

          {/* ── Tone selector ── */}
          <div className="px-3 pt-3 pb-1 shrink-0">
            <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1.5">Tone</p>
            <div className="flex flex-wrap gap-1">
              {AI_TONES.map(t => (
                <button
                  key={t}
                  onClick={() => setTone(t)}
                  className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border transition ${
                    tone === t
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-600 hover:border-indigo-300'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>

          {/* ── Message area ── */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-2 space-y-3">
            {messages.length === 0 && !loading && (
              <>
                <div className="flex flex-col items-center justify-center py-6 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/40 dark:to-violet-900/40 flex items-center justify-center mb-3">
                    <Sparkles size={24} className="text-indigo-500" />
                  </div>
                  <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">What would you like to write?</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">Describe your content and I'll draft it for you.</p>
                </div>
                <div className="space-y-1.5">
                  {suggestions.map(s => (
                    <button
                      key={s}
                      onClick={() => { setInput(s); inputRef.current?.focus(); }}
                      className="w-full text-left text-xs px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-700 dark:hover:text-indigo-300 transition"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </>
            )}

            {messages.map((msg, idx) => (
              <div key={idx} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'user' ? (
                  <div className="max-w-[85%] bg-indigo-600 text-white rounded-2xl rounded-tr-sm px-3 py-2 text-xs leading-relaxed">
                    {msg.text}
                  </div>
                ) : (
                  <div className="max-w-[95%] space-y-2">
                    <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-sm px-3 py-2.5">
                      <div
                        className="text-xs text-slate-700 dark:text-slate-200 leading-relaxed prose prose-xs max-w-none"
                        dangerouslySetInnerHTML={{ __html: msg.html || msg.text }}
                      />
                    </div>
                    {/* Action row for latest model message */}
                    {idx === messages.length - 1 && msg.html && (
                      <div className="flex items-center gap-1.5 px-1">
                        <button
                          onClick={() => onInsert(msg.html!, !!selectedBlock)}
                          className="flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition"
                        >
                          <Plus size={10} />
                          {selectedBlock ? 'Replace block' : 'Insert block'}
                        </button>
                        <button
                          onClick={handleCopy}
                          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:border-indigo-300 hover:text-indigo-600 rounded-lg transition bg-white dark:bg-slate-800"
                        >
                          {copied ? <><Check size={10} /> Copied</> : <><Copy size={10} /> Copy</>}
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}

            {loading && (
              <div className="flex justify-start">
                <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl rounded-tl-sm px-4 py-3 flex items-center gap-2">
                  <span className="flex gap-0.5">
                    {[0,1,2].map(i => (
                      <span
                        key={i}
                        className="w-1.5 h-1.5 rounded-full bg-indigo-400 animate-bounce"
                        style={{ animationDelay: `${i * 150}ms` }}
                      />
                    ))}
                  </span>
                  <span className="text-[11px] text-slate-400">Writing…</span>
                </div>
              </div>
            )}

            {error && (
              <div className="text-[11px] text-red-500 bg-red-50 dark:bg-red-900/20 rounded-xl px-3 py-2 border border-red-200 dark:border-red-800">
                {error}
              </div>
            )}
          </div>

          {/* ── Input row ── */}
          <div className="px-3 pb-3 pt-2 border-t border-slate-100 dark:border-slate-700 shrink-0">
            <div className="flex items-end gap-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-600 rounded-2xl px-3 py-2 focus-within:border-indigo-400 focus-within:ring-1 focus-within:ring-indigo-400 transition">
              <textarea
                ref={inputRef}
                rows={2}
                value={input}
                onChange={e => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder="Describe what to write…"
                className="flex-1 bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 resize-none outline-none leading-relaxed"
                disabled={loading}
              />
              <button
                onClick={handleSend}
                disabled={!input.trim() || loading}
                className="p-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 dark:disabled:bg-slate-600 text-white transition shrink-0 self-end"
              >
                <Send size={13} />
              </button>
            </div>
            <p className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 text-center">Enter to send · Shift+Enter for new line</p>
          </div>
        </>
      )}
    </div>
  );
};

// ─── Main EmailBuilder ────────────────────────────────────────────────────────

export const EmailBuilder: React.FC<EmailBuilderProps> = ({
  blocks, setBlocks, onImportPco, onOpenPastoralCare, onOpenDataChart, onOpenSettings, churchId = '',
  campaignSubject, churchName,
}) => {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [quickPickType, setQuickPickType] = useState<PcoPickType | null>(null);
  const [aiPanelOpen, setAiPanelOpen] = useState(false);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } })
  );

  const handleDragStart = (event: any) => setActiveId(event.active.id);
  const handleDragEnd = (event: any) => {
    setActiveId(null);
    const { active, over } = event;
    if (over && active.id !== over.id) {
      setBlocks(items => {
        const oldIndex = items.findIndex(i => i.id === active.id);
        const newIndex = items.findIndex(i => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const addBlock = (type: BlockType, insertAfterIndex?: number) => {
    const def = BLOCK_DEFS.find(d => d.type === type);
    const newBlock: EmailBlock = { id: `block_${Date.now()}`, type, content: def?.default || {} };
    setBlocks(prev => {
      if (insertAfterIndex !== undefined) {
        const arr = [...prev];
        arr.splice(insertAfterIndex + 1, 0, newBlock);
        return arr;
      }
      return [...prev, newBlock];
    });
    setSelectedId(newBlock.id);
  };

  const deleteBlock = (id: string) => {
    setBlocks(prev => prev.filter(b => b.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateBlock = (id: string) => {
    const block = blocks.find(b => b.id === id);
    if (!block) return;
    const clone: EmailBlock = { ...block, id: `block_${Date.now()}`, content: { ...block.content } };
    setBlocks(prev => {
      const idx = prev.findIndex(b => b.id === id);
      const arr = [...prev];
      arr.splice(idx + 1, 0, clone);
      return arr;
    });
    setSelectedId(clone.id);
  };

  const handleQuickPick = (type: PcoPickType, item: any) => {
    const newBlock: EmailBlock = {
      id: `block_${Date.now()}`,
      type,
      content: {
        name: item.name,
        description: item.description,
        date: item.date,
        imageUrl: item.imageUrl,
        meta: item.meta,
        url: item.url,
        pcoId: item.id
      }
    };
    setBlocks(prev => [...prev, newBlock]);
    setSelectedId(newBlock.id);
    setQuickPickType(null);
  };

  const activeBlock = blocks.find(b => b.id === activeId);
  const selectedBlock = blocks.find(b => b.id === selectedId) ?? null;
  const selectedIsTextBlock = selectedBlock && ['text', 'header', 'html'].includes(selectedBlock.type);

  // Handle AI insert: replace selected text block OR append a new one
  const handleAiInsert = (html: string, replaceSelected: boolean) => {
    if (replaceSelected && selectedId && selectedIsTextBlock) {
      setBlocks(prev => prev.map(b =>
        b.id === selectedId ? { ...b, content: { ...b.content, text: html, html } } : b
      ));
    } else {
      const newBlock: EmailBlock = {
        id: `block_${Date.now()}`,
        type: 'text',
        content: { text: html, html },
      };
      setBlocks(prev => [...prev, newBlock]);
      setSelectedId(newBlock.id);
    }
  };

  return (
    <div className="flex h-full" style={{ minHeight: 600 }}>

      {/* ── Left Sidebar ── */}
      <div className="w-72 shrink-0 bg-white dark:bg-slate-900 border-r border-slate-200 dark:border-slate-700 overflow-y-auto flex flex-col">

        {/* Blocks grid */}
        <div className="p-4">
          <div className="flex items-center gap-1.5 mb-3">
            <LayoutGrid size={13} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Blocks</span>
          </div>
          <div className="grid grid-cols-3 gap-2">
            {BLOCK_DEFS.map(def => (
              <button
                key={def.type}
                onClick={() => addBlock(def.type)}
                className="flex flex-col items-center gap-1.5 p-3 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 text-slate-600 dark:text-slate-400 transition group border border-transparent hover:border-indigo-200 dark:hover:border-indigo-700"
              >
                <span className="group-hover:scale-110 transition">{def.icon}</span>
                <span className="text-[11px] font-medium">{def.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Layouts section */}
        <div className="px-4 pb-3 border-t border-slate-100 dark:border-slate-800 pt-3">
          <div className="flex items-center gap-1.5 mb-2">
            <LayoutGrid size={13} className="text-slate-400" />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Layouts</span>
          </div>
          <div className="grid grid-cols-5 gap-1.5">
            {([
              { layout: '1'   as const, cols: 1, svg: '█' },
              { layout: '2'   as const, cols: 2, svg: '▌▐' },
              { layout: '3'   as const, cols: 3, svg: '▍▍▍' },
              { layout: '2:1' as const, cols: 2, svg: '▌▍' },
              { layout: '1:2' as const, cols: 2, svg: '▍▌' },
            ]).map(({ layout, cols }) => (
              <button
                key={layout}
                title={`${layout} column layout`}
                onClick={() => {
                  const cells = Array.from({ length: cols }, (_, i) => ({
                    id: `cell_${Date.now()}_${i}`, blocks: []
                  }));
                  const newBlock: EmailBlock = {
                    id: `block_${Date.now()}`, type: 'columns',
                    content: { layout, cells }
                  };
                  setBlocks(prev => [...prev, newBlock]);
                  setSelectedId(newBlock.id);
                }}
                className="flex flex-col items-center gap-1 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 hover:text-indigo-700 dark:hover:text-indigo-300 text-slate-500 dark:text-slate-400 border border-transparent hover:border-indigo-200 dark:hover:border-indigo-700 transition"
              >
                {/* Visual column diagram */}
                <div className={`flex gap-0.5 w-full px-2 ${layout === '2:1' ? '' : layout === '1:2' ? '' : ''}`}>
                  {layout === '1'   && <div className="flex-1 h-5 bg-current rounded opacity-30" />}
                  {layout === '2'   && <><div className="flex-1 h-5 bg-current rounded opacity-30" /><div className="flex-1 h-5 bg-current rounded opacity-30" /></>}
                  {layout === '3'   && <><div className="flex-1 h-5 bg-current rounded opacity-30" /><div className="flex-1 h-5 bg-current rounded opacity-30" /><div className="flex-1 h-5 bg-current rounded opacity-30" /></>}
                  {layout === '2:1' && <><div className="grow-[2] h-5 bg-current rounded opacity-30" /><div className="grow-[1] h-5 bg-current rounded opacity-30" /></>}
                  {layout === '1:2' && <><div className="grow-[1] h-5 bg-current rounded opacity-30" /><div className="grow-[2] h-5 bg-current rounded opacity-30" /></>}
                </div>
                <span className="text-[10px] font-mono">{layout}</span>
              </button>
            ))}
          </div>
        </div>

        {/* Planning Center section */}
        <div className="px-4 pb-3">
          <div className="flex items-center gap-1.5 mb-2">
            <img src="https://planningcenter.com/favicon.ico" alt="PCO" className="w-3.5 h-3.5" />
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Planning Center</span>
          </div>
          <div className="space-y-1.5">
            {(['pco_registration', 'pco_group', 'pco_event'] as PcoPickType[]).map(type => {
              const cfg = PCO_PICK_CONFIG[type];
              const isOpen = quickPickType === type;
              return (
                <div key={type}>
                  <button
                    onClick={() => setQuickPickType(isOpen ? null : type)}
                    className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-xs font-medium transition border ${
                      isOpen
                        ? 'bg-indigo-600 text-white border-indigo-600'
                        : 'bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                    }`}
                  >
                    <span className="flex items-center gap-2">{cfg.icon} {cfg.label}</span>
                    {isOpen ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
                  </button>
                  {isOpen && churchId && (
                    <PcoQuickPicker
                      type={type}
                      churchId={churchId}
                      onPick={handleQuickPick}
                      onClose={() => setQuickPickType(null)}
                    />
                  )}
                  {isOpen && !churchId && (
                    <div className="mt-1 px-3 py-2 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 rounded-xl">
                      PCO not connected. Check Settings.
                    </div>
                  )}
                </div>
              );
            })}
            <button
              onClick={onImportPco}
              className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
            >
              <Plus size={11} /> Import multiple items…
            </button>
          </div>
        </div>

        {/* Collapsible sections */}
        <SidebarSection title="Styles" icon={<Palette size={14} />}>
          <button onClick={onOpenSettings} className="w-full text-left text-xs text-indigo-600 dark:text-indigo-400 hover:underline">
            Open Template Settings →
          </button>
        </SidebarSection>

        <SidebarSection title="Pastoral Care" icon={<AtSign size={14} />}>
          <div className="space-y-1.5">
            <button onClick={onOpenPastoralCare} className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition">
              Insert Pastoral Care Chart
            </button>
          </div>
        </SidebarSection>

        <SidebarSection title="Analytics Charts" icon={<AlignLeft size={14} />}>
          <button onClick={onOpenDataChart} className="w-full text-left px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800 text-xs text-slate-700 dark:text-slate-300 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition">
            Insert Data Chart
          </button>
        </SidebarSection>
      </div>

      {/* ── Canvas ── */}
      <div className="flex-1 overflow-y-auto bg-slate-100 dark:bg-slate-950 p-8 relative">
        {/* Floating AI button */}
        {!aiPanelOpen && (
          <button
            onClick={() => setAiPanelOpen(true)}
            title="Open AI Writing Assistant"
            className="fixed right-4 bottom-8 z-40 flex items-center gap-2 px-4 py-2.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-700 hover:to-violet-700 text-white text-sm font-bold shadow-lg hover:shadow-indigo-500/30 transition-all group"
          >
            <Sparkles size={16} className="group-hover:animate-pulse" />
            <span className="hidden sm:inline">AI Writer</span>
          </button>
        )}
        <div className="max-w-2xl mx-auto">

          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragStart={handleDragStart}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={blocks.map(b => b.id)} strategy={verticalListSortingStrategy}>
              {blocks.length === 0 ? (
                <div
                  className="flex flex-col items-center justify-center h-64 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-2xl text-slate-400 dark:text-slate-500 cursor-pointer hover:border-indigo-400 dark:hover:border-indigo-600 hover:text-indigo-500 transition"
                  onClick={() => addBlock('text')}
                >
                  <Plus size={28} className="mb-2" />
                  <p className="text-sm font-medium">Click a block in the sidebar to get started</p>
                  <p className="text-xs mt-1">or click here to add a text block</p>
                </div>
              ) : (
                <div className="space-y-1 pl-8">
                  {blocks.map((block, idx) => (
                    <React.Fragment key={block.id}>
                      <SortableCanvasBlock
                        block={block}
                        isSelected={selectedId === block.id}
                        onSelect={() => setSelectedId(selectedId === block.id ? null : block.id)}
                        onDelete={() => deleteBlock(block.id)}
                        onDuplicate={() => duplicateBlock(block.id)}
                        onUpdate={content => setBlocks(prev => prev.map(b => b.id === block.id ? { ...b, content } : b))}
                      />
                      {/* "+ Add block" between rows — visible on hover */}
                      <div className="flex items-center gap-2 opacity-0 hover:opacity-100 transition h-4 group/add">
                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700 group-hover/add:bg-indigo-300" />
                        <button
                          onClick={() => addBlock('text', idx)}
                          className="flex items-center gap-1 px-2 py-0.5 text-[10px] text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 rounded-full border border-slate-200 dark:border-slate-700 hover:border-indigo-300 transition"
                        >
                          <Plus size={9} /> Add block
                        </button>
                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                      </div>
                    </React.Fragment>
                  ))}
                </div>
              )}
            </SortableContext>

            <DragOverlay>
              {activeBlock && (
                <div className="p-4 bg-white dark:bg-slate-800 rounded-xl border-2 border-indigo-400 shadow-xl opacity-90 max-w-xl">
                  <BlockThumbnail block={activeBlock} />
                </div>
              )}
            </DragOverlay>
          </DndContext>

          {/* Bottom add button (always visible when there are blocks) */}
          {blocks.length > 0 && (
            <div className="pl-8 mt-2">
              <button
                onClick={() => addBlock('text')}
                className="w-full flex items-center justify-center gap-2 py-2.5 text-sm text-slate-400 dark:text-slate-500 hover:text-indigo-600 dark:hover:text-indigo-400 border-2 border-dashed border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600 rounded-xl transition"
              >
                <Plus size={14} /> Add block
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── AI Panel ── */}
      <EmailAIPanel
        isOpen={aiPanelOpen}
        onClose={() => setAiPanelOpen(false)}
        selectedBlock={selectedIsTextBlock ? selectedBlock : null}
        campaignSubject={campaignSubject}
        churchName={churchName}
        onInsert={handleAiInsert}
      />
    </div>
  );
};
