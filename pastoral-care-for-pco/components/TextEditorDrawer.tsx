import React, { useEffect, useRef, useState } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Drawer } from './Drawer';
import { EmailBlock } from './EmailBuilder';
import {
  Bold, Italic, Heading1, Heading2, List, ListOrdered,
  Type, ChevronDown, AtSign, Plus
} from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  block: EmailBlock | null;
  onUpdate: (id: string, content: any) => void;
}

const MERGE_TAGS = [
  { tag: '@first-name',    label: 'First name' },
  { tag: '@last-name',     label: 'Last name' },
  { tag: '@email',         label: 'Email address' },
  { tag: '@view-in-browser', label: 'View in browser link' },
  { tag: '@current-date',  label: 'Current date' },
  { tag: '@current-month', label: 'Current month' },
  { tag: '@current-year',  label: 'Current year' },
];

const FONT_SIZES = [10, 12, 14, 16, 18, 20, 24, 28, 32, 36, 40, 48];

// ─── Menu Bar ─────────────────────────────────────────────────────────────────

const MenuBar = ({ editor }: { editor: any }) => {
  const [showMergeTags, setShowMergeTags] = useState(false);
  const [fontSize, setFontSize] = useState(16);
  const mergeRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (mergeRef.current && !mergeRef.current.contains(e.target as Node)) {
        setShowMergeTags(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  if (!editor) return null;

  const btn = (active: boolean) =>
    `p-1.5 rounded transition ${active
      ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
      : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'}`;

  const applyFontSize = (size: number) => {
    setFontSize(size);
    // Insert a span with that font size — wrap selected text
    editor.chain().focus().setMark('bold').run(); // focus trick
    editor.chain().focus().unsetMark('bold').run();
    // Use raw HTML insertion for font size via setContent if needed
    // Since StarterKit doesn't have fontSize extension by default,
    // we use a simple workaround: wrapInNode with a span style
    const { from, to } = editor.state.selection;
    if (from !== to) {
      // There's selected text — wrap it
      editor.commands.insertContentAt({ from, to }, `<span style="font-size:${size}px">${editor.state.doc.textBetween(from, to)}</span>`);
    } else {
      // No selection — just set a mark we'll apply going forward using HTML
      editor.chain().focus().insertContent(`<span style="font-size:${size}px">\u200B</span>`).run();
    }
  };

  const insertMergeTag = (tag: string) => {
    editor.chain().focus().insertContent(
      `<span style="background:#e0e7ff;color:#4338ca;border-radius:4px;padding:0 4px;font-family:monospace">${tag}</span>`
    ).run();
    setShowMergeTags(false);
  };

  return (
    <div className="flex flex-wrap items-center gap-1 p-2 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 rounded-t-xl sticky top-0 z-10">
      {/* Format buttons */}
      <button onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))}><Bold size={14} /></button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))}><Italic size={14} /></button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btn(editor.isActive('heading', { level: 1 }))}><Heading1 size={14} /></button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive('heading', { level: 2 }))}><Heading2 size={14} /></button>
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))}><List size={14} /></button>
      <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))}><ListOrdered size={14} /></button>

      {/* Separator */}
      <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

      {/* Font size */}
      <div className="flex items-center gap-0.5">
        <Type size={12} className="text-slate-400 mr-0.5" />
        <button
          onClick={() => {
            const idx = FONT_SIZES.indexOf(fontSize);
            if (idx > 0) applyFontSize(FONT_SIZES[idx - 1]);
          }}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-bold text-sm leading-none"
          title="Decrease font size"
        >−</button>
        <span className="w-8 text-center text-xs text-slate-600 dark:text-slate-400 font-mono">{fontSize}</span>
        <button
          onClick={() => {
            const idx = FONT_SIZES.indexOf(fontSize);
            if (idx < FONT_SIZES.length - 1) applyFontSize(FONT_SIZES[idx + 1]);
          }}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400 font-bold text-sm leading-none"
          title="Increase font size"
        >+</button>
      </div>

      {/* Separator */}
      <div className="w-px h-5 bg-slate-200 dark:bg-slate-700 mx-0.5" />

      {/* Merge Tags dropdown */}
      <div className="relative" ref={mergeRef}>
        <button
          onClick={() => setShowMergeTags(p => !p)}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition ${
            showMergeTags
              ? 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'
              : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-400'
          }`}
          title="Insert merge tag"
        >
          <AtSign size={13} /> Tags <ChevronDown size={11} />
        </button>
        {showMergeTags && (
          <div className="absolute left-0 top-full mt-1 w-52 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl z-50 overflow-hidden">
            <div className="px-3 py-2 border-b border-slate-100 dark:border-slate-700">
              <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider">Merge Tags</p>
            </div>
            {MERGE_TAGS.map(({ tag, label }) => (
              <button
                key={tag}
                onClick={() => insertMergeTag(tag)}
                className="w-full flex items-center gap-2 px-3 py-2 hover:bg-indigo-50 dark:hover:bg-indigo-900/30 transition text-left"
              >
                <Plus size={11} className="text-indigo-400 shrink-0" />
                <div>
                  <div className="text-xs font-mono text-indigo-700 dark:text-indigo-300">{tag}</div>
                  <div className="text-[10px] text-slate-400">{label}</div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

// ─── Main Drawer ──────────────────────────────────────────────────────────────

export const TextEditorDrawer: React.FC<Props> = ({ isOpen, onClose, block, onUpdate }) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: block?.content.text || block?.content.html || '',
    onUpdate: ({ editor }) => {
      if (block) {
        const html = editor.getHTML();
        onUpdate(block.id, { ...block.content, text: html, html });
      }
    },
  });

  useEffect(() => {
    if (editor && block) {
      const content = block.content.text || block.content.html || '';
      if (editor.getHTML() !== content) {
        editor.commands.setContent(content, false);
      }
    }
  }, [block?.id]);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Edit Text">
      <div className="-m-4">
        <MenuBar editor={editor} />
        <EditorContent
          editor={editor}
          className="p-4 min-h-[280px] text-slate-700 dark:text-slate-200 prose prose-sm max-w-none focus-within:outline-none"
        />
        <div className="px-4 pb-3 border-t border-slate-100 dark:border-slate-700 pt-3">
          <p className="text-[10px] text-slate-400 dark:text-slate-500">
            Tip: Select text before changing font size to resize it. Merge tags are replaced with each recipient's real data when sent.
          </p>
        </div>
      </div>
    </Drawer>
  );
};
