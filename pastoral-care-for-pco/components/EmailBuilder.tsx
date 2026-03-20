import React, { useState, useEffect } from 'react';
import { DndContext, closestCenter } from '@dnd-kit/core';
import { arrayMove, SortableContext, verticalListSortingStrategy, useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { pcoService } from '../services/pcoService';
import { Type, Heading, Image, Users, Calendar, ClipboardList, GripVertical, Code, Video, File, Minus, MousePointerClick, Edit2 } from 'lucide-react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';

export type BlockType = 'text' | 'header' | 'image' | 'pco_group' | 'pco_registration' | 'pco_event' | 'html' | 'video' | 'file' | 'divider' | 'button' | 'pastoral_care_chart' | 'data_chart' | 'pco_groups_widget' | 'pco_registrations_widget';

export interface EmailBlock {
  id: string;
  type: BlockType;
  content: any;
}

const SortableBlock = ({ block, onUpdate, onEdit }: { block: EmailBlock, onUpdate: (id: string, content: any) => void, onEdit: () => void }) => {
  const { attributes, listeners, setNodeRef, transform, transition } = useSortable({ id: block.id });
  const style = { transform: CSS.Transform.toString(transform), transition };
  
  return (
    <div ref={setNodeRef} style={style} className="p-4 bg-white border border-slate-200 rounded-xl shadow-sm mb-3 flex items-center gap-3">
      <div {...attributes} {...listeners} className="cursor-grab text-slate-400">
        <GripVertical size={18} />
      </div>
      <div className="flex-grow">
        <div className="cursor-pointer">
          {block.type === 'text' && <div dangerouslySetInnerHTML={{ __html: block.content.text }} className="text-slate-700" />}
          {block.type === 'header' && <h2 className="text-lg font-semibold text-slate-900" dangerouslySetInnerHTML={{ __html: block.content.text }} />}
          {block.type === 'image' && <img src={block.content.src} alt="Block" className="max-w-full rounded-lg" />}
          {block.type === 'html' && <div className="text-xs font-mono text-slate-500 bg-slate-100 p-2 rounded-lg" dangerouslySetInnerHTML={{ __html: block.content.html }} />}
          {block.type === 'video' && <div className="flex items-center gap-2 text-slate-600"><Video size={16} /> Video: {block.content.src}</div>}
          {block.type === 'file' && <div className="flex items-center gap-2 text-slate-600"><File size={16} /> File: {block.content.name}</div>}
          {block.type === 'divider' && <hr className="w-full border-t-2 border-slate-300" />}
          {block.type === 'button' && <button className="px-4 py-2 bg-indigo-600 text-white rounded-lg text-sm">{block.content.text}</button>}
          {block.type === 'pastoral_care_chart' && <div className="font-mono text-xs text-slate-600 bg-slate-100 p-2 rounded-lg">Pastoral Care Chart: {block.content.area}</div>}
          {block.type === 'data_chart' && <div className="font-mono text-xs text-slate-600 bg-slate-100 p-2 rounded-lg">Data Chart: {block.content.module} - {block.content.chartType} ({block.content.filters})</div>}
          {block.type === 'pco_groups_widget' && <div className="font-mono text-xs text-slate-600 bg-slate-100 p-2 rounded-lg">PCO Groups Widget</div>}
          {block.type === 'pco_registrations_widget' && <div className="font-mono text-xs text-slate-600 bg-slate-100 p-2 rounded-lg">PCO Registrations Widget</div>}
          {block.type.startsWith('pco_') && block.type !== 'pco_groups_widget' && block.type !== 'pco_registrations_widget' && <div className="font-mono text-xs text-slate-600 bg-slate-100 p-2 rounded-lg">PCO Block: {block.type} - {block.content.name}</div>}
        </div>
      </div>
      {(block.type === 'text' || block.type === 'header' || block.type === 'html' || block.type === 'image' || block.type === 'video') && (
        <button onClick={onEdit} className="text-slate-400 hover:text-indigo-600">
          <Edit2 size={16} />
        </button>
      )}
    </div>
  );
};

export const EmailBuilder: React.FC<{ 
  blocks: EmailBlock[], 
  setBlocks: React.Dispatch<React.SetStateAction<EmailBlock[]>>, 
  onImportPco: () => void,
  onOpenPastoralCare: () => void,
  onOpenDataChart: () => void,
  onOpenSettings: () => void,
  onEditBlock: (id: string) => void
}> = ({ blocks, setBlocks, onImportPco, onOpenPastoralCare, onOpenDataChart, onOpenSettings, onEditBlock }) => {

  const handleDragEnd = (event: any) => {
    const { active, over } = event;
    if (active.id !== over.id) {
      setBlocks((items) => {
        const oldIndex = items.findIndex((i) => i.id === active.id);
        const newIndex = items.findIndex((i) => i.id === over.id);
        return arrayMove(items, oldIndex, newIndex);
      });
    }
  };

  const updateBlockContent = (id: string, content: any) => {
    setBlocks(blocks.map(b => b.id === id ? { ...b, content } : b));
  };

  const addBlock = (type: BlockType, content: any = {}) => {
    let defaultContent = {};
    if (type === 'text') defaultContent = { text: 'New Text' };
    else if (type === 'header') defaultContent = { text: 'New Header' };
    else if (type === 'button') defaultContent = { text: 'Click Me' };
    else if (type === 'html') defaultContent = { html: '<div>HTML</div>' };
    else if (type === 'video') defaultContent = { src: 'video.mp4' };
    else if (type === 'file') defaultContent = { name: 'document.pdf' };
    
    const newBlock: EmailBlock = { id: Date.now().toString(), type, content: { ...defaultContent, ...content } };
    setBlocks([...blocks, newBlock]);
  };

  return (
    <div className="flex gap-6 p-6 bg-slate-50 rounded-2xl">
      <div className="w-1/4 p-5 bg-white border border-slate-200 rounded-2xl shadow-sm">
        <h3 className="font-semibold text-sm text-slate-900 mb-4 uppercase tracking-wider">Blocks</h3>
        <button onClick={() => addBlock('text')} className="flex items-center gap-2 w-full p-3 mb-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm text-slate-700 transition"><Type size={16} /> Text</button>
        <button onClick={() => addBlock('header')} className="flex items-center gap-2 w-full p-3 mb-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm text-slate-700 transition"><Heading size={16} /> Header</button>
        <button onClick={() => addBlock('image')} className="flex items-center gap-2 w-full p-3 mb-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm text-slate-700 transition"><Image size={16} /> Image</button>
        <button onClick={() => addBlock('html')} className="flex items-center gap-2 w-full p-3 mb-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm text-slate-700 transition"><Code size={16} /> HTML</button>
        <button onClick={() => addBlock('video')} className="flex items-center gap-2 w-full p-3 mb-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm text-slate-700 transition"><Video size={16} /> Video</button>
        <button onClick={() => addBlock('pco_groups_widget')} className="flex items-center gap-2 w-full p-3 mb-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm text-slate-700 transition"><Users size={16} /> PCO Groups Widget</button>
        <button onClick={() => addBlock('pco_registrations_widget')} className="flex items-center gap-2 w-full p-3 mb-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm text-slate-700 transition"><Calendar size={16} /> PCO Registrations Widget</button>
        <button onClick={() => addBlock('file')} className="flex items-center gap-2 w-full p-3 mb-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm text-slate-700 transition"><File size={16} /> File</button>
        <button onClick={() => addBlock('divider')} className="flex items-center gap-2 w-full p-3 mb-2 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm text-slate-700 transition"><Minus size={16} /> Divider</button>
        <button onClick={() => addBlock('button')} className="flex items-center gap-2 w-full p-3 mb-4 bg-slate-100 hover:bg-slate-200 rounded-xl text-sm text-slate-700 transition"><MousePointerClick size={16} /> Button</button>
        
        <button onClick={onImportPco} className="w-full p-3 mb-2 bg-indigo-600 text-white rounded-xl text-sm font-semibold hover:bg-indigo-700 transition">Import PCO Items</button>
        <button onClick={onOpenPastoralCare} className="w-full p-3 mb-2 bg-slate-200 text-slate-800 rounded-xl text-sm font-semibold hover:bg-slate-300 transition">Pastoral Care</button>
        <button onClick={onOpenDataChart} className="w-full p-3 mb-2 bg-slate-200 text-slate-800 rounded-xl text-sm font-semibold hover:bg-slate-300 transition">Data Chart</button>
        <button onClick={onOpenSettings} className="w-full p-3 bg-slate-200 text-slate-800 rounded-xl text-sm font-semibold hover:bg-slate-300 transition">Template Settings</button>
      </div>
      <div className="w-3/4 p-6 bg-white border border-slate-200 rounded-2xl shadow-sm min-h-[400px]">
        <DndContext collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
          <SortableContext items={blocks} strategy={verticalListSortingStrategy}>
            {blocks.map((block) => <SortableBlock key={block.id} block={block} onUpdate={updateBlockContent} onEdit={() => onEditBlock(block.id)} />)}
          </SortableContext>
        </DndContext>
      </div>
    </div>
  );
};
