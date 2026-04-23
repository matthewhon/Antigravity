import React, { useEffect, forwardRef, useImperativeHandle } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Bold, Italic, List, ListOrdered, Link as LinkIcon, Image as ImageIcon } from 'lucide-react';

export interface SimpleRichTextEditorRef {
    insertHtml: (html: string) => void;
}

export const SimpleRichTextEditor = forwardRef<SimpleRichTextEditorRef, {
    value: string;
    onChange: (html: string) => void;
    placeholder?: string;
    minHeight?: string;
    onImageClick?: () => void;
    onPcoClick?: () => void;
}>(({ value, onChange, placeholder, minHeight = '150px', onImageClick, onPcoClick }, ref) => {
    const editor = useEditor({
        extensions: [StarterKit],
        content: value,
        onUpdate: ({ editor }) => {
            onChange(editor.getHTML());
        },
        editorProps: {
            attributes: {
                class: `prose prose-sm max-w-none text-slate-900 dark:text-white focus:outline-none flex-1`,
                style: `min-height: ${minHeight}; padding: 1rem;`
            }
        }
    });

    useEffect(() => {
        if (editor && editor.getHTML() !== value) {
            // Only update if the value actually changed from the outside and differs from our internal state
            editor.commands.setContent(value);
        }
    }, [value, editor]);

    useImperativeHandle(ref, () => ({
        insertHtml: (html: string) => {
            if (editor) {
                editor.chain().focus().insertContent(html).run();
            }
        }
    }));

    if (!editor) return null;

    const btn = (active: boolean) =>
        `p-1.5 rounded transition text-xs flex items-center justify-center ${
            active ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300'
                   : 'hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400'
        }`;

    return (
        <div className="w-full border border-slate-200 dark:border-slate-600 rounded-2xl bg-white dark:bg-slate-800 focus-within:ring-2 focus-within:ring-violet-500 overflow-hidden flex flex-col">
            <div className="flex flex-wrap items-center gap-1 p-2 bg-slate-50 dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700">
                <button type="button" onClick={() => editor.chain().focus().toggleBold().run()} className={btn(editor.isActive('bold'))}><Bold size={14} /></button>
                <button type="button" onClick={() => editor.chain().focus().toggleItalic().run()} className={btn(editor.isActive('italic'))}><Italic size={14} /></button>
                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
                <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={btn(editor.isActive('heading', { level: 1 }))}><span className="font-bold text-[11px] leading-none">H1</span></button>
                <button type="button" onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={btn(editor.isActive('heading', { level: 2 }))}><span className="font-bold text-[11px] leading-none">H2</span></button>
                <div className="w-px h-4 bg-slate-200 dark:bg-slate-700 mx-1" />
                <button type="button" onClick={() => editor.chain().focus().toggleBulletList().run()} className={btn(editor.isActive('bulletList'))}><List size={14} /></button>
                <button type="button" onClick={() => editor.chain().focus().toggleOrderedList().run()} className={btn(editor.isActive('orderedList'))}><ListOrdered size={14} /></button>
                
                {(onImageClick || onPcoClick) && (
                    <>
                        <div className="flex-1" />
                        {onImageClick && (
                            <button type="button" onClick={onImageClick} className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition">
                                <ImageIcon size={14} /> Image
                            </button>
                        )}
                        {onPcoClick && (
                            <button type="button" onClick={onPcoClick} className="flex items-center gap-1.5 px-2 py-1 text-xs font-semibold rounded-lg text-slate-500 hover:text-slate-700 hover:bg-slate-100 transition">
                                <img src="https://planningcenter.com/favicon.ico" alt="PCO" className="w-[14px] h-[14px]" /> PCO
                            </button>
                        )}
                    </>
                )}
            </div>
            <EditorContent editor={editor} className="flex-1 overflow-y-auto" />
        </div>
    );
});
