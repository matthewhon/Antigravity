import React, { useEffect } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Drawer } from './Drawer';
import { EmailBlock } from './EmailBuilder';
import { Bold, Italic, Heading1, Heading2, List, ListOrdered } from 'lucide-react';

interface Props {
  isOpen: boolean;
  onClose: () => void;
  block: EmailBlock | null;
  onUpdate: (id: string, content: any) => void;
}

const MenuBar = ({ editor }: { editor: any }) => {
  if (!editor) return null;

  return (
    <div className="flex gap-2 mb-4 p-2 border-b border-slate-200 bg-slate-50 rounded-t-lg">
      <button onClick={() => editor.chain().focus().toggleBold().run()} className={`p-2 rounded ${editor.isActive('bold') ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-200'}`}><Bold size={16} /></button>
      <button onClick={() => editor.chain().focus().toggleItalic().run()} className={`p-2 rounded ${editor.isActive('italic') ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-200'}`}><Italic size={16} /></button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()} className={`p-2 rounded ${editor.isActive('heading', { level: 1 }) ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-200'}`}><Heading1 size={16} /></button>
      <button onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()} className={`p-2 rounded ${editor.isActive('heading', { level: 2 }) ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-200'}`}><Heading2 size={16} /></button>
      <button onClick={() => editor.chain().focus().toggleBulletList().run()} className={`p-2 rounded ${editor.isActive('bulletList') ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-200'}`}><List size={16} /></button>
      <button onClick={() => editor.chain().focus().toggleOrderedList().run()} className={`p-2 rounded ${editor.isActive('orderedList') ? 'bg-indigo-100 text-indigo-700' : 'hover:bg-slate-200'}`}><ListOrdered size={16} /></button>
    </div>
  );
};

export const TextEditorDrawer: React.FC<Props> = ({ isOpen, onClose, block, onUpdate }) => {
  const editor = useEditor({
    extensions: [StarterKit],
    content: block?.content.text || block?.content.html || '',
    onUpdate: ({ editor }) => {
      if (block) {
        onUpdate(block.id, { ...block.content, text: editor.getHTML(), html: editor.getHTML() });
      }
    },
  });

  useEffect(() => {
    if (editor && block) {
      editor.commands.setContent(block.content.text || block.content.html || '');
    }
  }, [block, editor]);

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Edit Text">
      <div className="p-4">
        <MenuBar editor={editor} />
        <EditorContent editor={editor} className="border border-slate-200 p-4 rounded-lg min-h-[300px] text-slate-700" />
      </div>
    </Drawer>
  );
};
