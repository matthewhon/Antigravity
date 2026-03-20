import React, { useState } from 'react';
import { EmailBuilder } from './EmailBuilder';
import { TemplateSettingsEditor } from './TemplateSettingsEditor';
import { EmailPreview } from './EmailPreview';
import { EmailBlock } from './EmailBuilder';
import { TemplateSettings } from '../types';
import { Drawer } from './Drawer';
import { pcoService } from '../services/pcoService';
import { DataChartSelector } from './DataChartSelector';
import { TextEditorDrawer } from './TextEditorDrawer';
import { MediaEditorDrawer } from './MediaEditorDrawer';

export const CommunicationModule: React.FC<{ churchId: string }> = ({ churchId }) => {
  const [blocks, setBlocks] = useState<EmailBlock[]>([]);
  const [settings, setSettings] = useState<TemplateSettings>({
    primaryColor: '#4f46e5',
    textColor: '#1f2937',
    backgroundColor: '#ffffff',
    linkColor: '#2563eb',
    fontFamily: 'sans-serif',
    header: 'My Newsletter',
    footer: '© 2026 Church Name'
  });
  const [isSettingsDrawerOpen, setIsSettingsDrawerOpen] = useState(false);
  const [isPcoDrawerOpen, setIsPcoDrawerOpen] = useState(false);
  const [isPastoralCareDrawerOpen, setIsPastoralCareDrawerOpen] = useState(false);
  const [isDataChartDrawerOpen, setIsDataChartDrawerOpen] = useState(false);
  const [isTextEditorOpen, setIsTextEditorOpen] = useState(false);
  const [editingBlockId, setEditingBlockId] = useState<string | null>(null);

  const handleEditBlock = (id: string) => {
    setEditingBlockId(id);
    setIsTextEditorOpen(true);
  };

  const importPcoItem = async (type: 'pco_group' | 'pco_registration' | 'pco_event') => {
    let items: any[] = [];
    if (type === 'pco_group') items = await pcoService.getGroups(churchId);
    else if (type === 'pco_registration') items = await pcoService.getRegistrations(churchId);
    else if (type === 'pco_event') items = await pcoService.getEvents(churchId);
    
    if (items.length > 0) {
        const newBlock: EmailBlock = { id: Date.now().toString(), type, content: { name: items[0].attributes.name } };
        setBlocks([...blocks, newBlock]);
    }
    setIsPcoDrawerOpen(false);
  };

  return (
    <div className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Communication Module</h1>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2">
          <EmailBuilder 
            blocks={blocks} 
            setBlocks={setBlocks} 
            onImportPco={() => setIsPcoDrawerOpen(true)}
            onOpenPastoralCare={() => setIsPastoralCareDrawerOpen(true)}
            onOpenDataChart={() => setIsDataChartDrawerOpen(true)}
            onOpenSettings={() => setIsSettingsDrawerOpen(true)}
            onEditBlock={handleEditBlock}
          />
        </div>
        <div className="lg:col-span-1">
          <div className="sticky top-6">
            <h2 className="text-lg font-semibold mb-4">Preview</h2>
            <EmailPreview blocks={blocks} settings={settings} />
          </div>
        </div>
      </div>

      <Drawer isOpen={isSettingsDrawerOpen} onClose={() => setIsSettingsDrawerOpen(false)} title="Template Settings">
        <TemplateSettingsEditor settings={settings} onChange={setSettings} />
      </Drawer>

      <Drawer isOpen={isPcoDrawerOpen} onClose={() => setIsPcoDrawerOpen(false)} title="Import PCO Items">
        <div className="space-y-2">
            <button onClick={() => importPcoItem('pco_group')} className="w-full p-3 bg-indigo-50 hover:bg-indigo-100 rounded-xl text-sm text-indigo-700 transition">Import Group</button>
            <button onClick={() => importPcoItem('pco_registration')} className="w-full p-3 bg-indigo-50 hover:bg-indigo-100 rounded-xl text-sm text-indigo-700 transition">Import Registration</button>
            <button onClick={() => importPcoItem('pco_event')} className="w-full p-3 bg-indigo-50 hover:bg-indigo-100 rounded-xl text-sm text-indigo-700 transition">Import Event</button>
        </div>
      </Drawer>

      <Drawer isOpen={isPastoralCareDrawerOpen} onClose={() => setIsPastoralCareDrawerOpen(false)} title="Pastoral Care Charts">
        <div className="space-y-2">
            <button onClick={() => { setBlocks([...blocks, { id: Date.now().toString(), type: 'pastoral_care_chart', content: { area: 'Visits' } }]); setIsPastoralCareDrawerOpen(false); }} className="w-full p-3 bg-indigo-50 hover:bg-indigo-100 rounded-xl text-sm text-indigo-700 transition">Insert Visits Chart</button>
            <button onClick={() => { setBlocks([...blocks, { id: Date.now().toString(), type: 'pastoral_care_chart', content: { area: 'Prayer Requests' } }]); setIsPastoralCareDrawerOpen(false); }} className="w-full p-3 bg-indigo-50 hover:bg-indigo-100 rounded-xl text-sm text-indigo-700 transition">Insert Prayer Requests Chart</button>
        </div>
      </Drawer>

      <Drawer isOpen={isDataChartDrawerOpen} onClose={() => setIsDataChartDrawerOpen(false)} title="Insert Data Chart">
        <DataChartSelector onInsert={(module, chartType, filters) => { setBlocks([...blocks, { id: Date.now().toString(), type: 'data_chart', content: { module, chartType, filters } }]); setIsDataChartDrawerOpen(false); }} />
      </Drawer>

      <TextEditorDrawer 
        isOpen={isTextEditorOpen && (blocks.find(b => b.id === editingBlockId)?.type === 'text' || blocks.find(b => b.id === editingBlockId)?.type === 'header' || blocks.find(b => b.id === editingBlockId)?.type === 'html')} 
        onClose={() => setIsTextEditorOpen(false)} 
        block={blocks.find(b => b.id === editingBlockId) || null}
        onUpdate={(id, content) => setBlocks(blocks.map(b => b.id === id ? { ...b, content } : b))}
      />

      <MediaEditorDrawer 
        isOpen={isTextEditorOpen && (blocks.find(b => b.id === editingBlockId)?.type === 'image' || blocks.find(b => b.id === editingBlockId)?.type === 'video')}
        onClose={() => setIsTextEditorOpen(false)} 
        block={blocks.find(b => b.id === editingBlockId) || null}
        onUpdate={(id, content) => setBlocks(blocks.map(b => b.id === id ? { ...b, content } : b))}
      />
    </div>
  );
};
