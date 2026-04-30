
import React, { useState, useRef, useEffect } from 'react';
import { WidgetDefinition } from '../types';

interface WidgetsControllerProps {
  availableWidgets: WidgetDefinition[];
  visibleWidgets: string[];
  currentTheme?: 'traditional' | 'dark';
  onUpdate?: (newVisibleWidgets: string[]) => void;
  onUpdateTheme?: (theme: 'traditional' | 'dark') => void;
}

const WidgetsController: React.FC<WidgetsControllerProps> = ({ 
  availableWidgets, 
  visibleWidgets, 
  currentTheme,
  onUpdate,
  onUpdateTheme
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'library' | 'organize'>('library');
  const isDark = currentTheme === 'dark';
  
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  // Close on Escape key
  useEffect(() => {
    const handleEsc = (e: KeyboardEvent) => {
        if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, []);

  // -- Derived Data --
  // Active definitions derived from visibleWidgets, filtered by availability
  const activeWidgetDefs = visibleWidgets
    .map(id => availableWidgets.find(w => w.id === id))
    .filter(Boolean) as WidgetDefinition[];

  // -- Handlers --

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragItem.current = position;
    e.currentTarget.style.opacity = '0.5';
    e.currentTarget.style.transform = 'scale(0.98)';
  };

  const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragOverItem.current = position;
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = '1';
    e.currentTarget.style.transform = 'scale(1)';
    
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      // Use the IDs from activeWidgetDefs to ensure the indices match exactly
      const currentIds = activeWidgetDefs.map(w => w.id);
      const copy = [...currentIds];
      const draggedItemContent = copy[dragItem.current];
      
      copy.splice(dragItem.current, 1);
      copy.splice(dragOverItem.current, 0, draggedItemContent);
      
      if (onUpdate) {
        onUpdate(copy);
      }
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const toggleWidget = (id: string) => {
    if (!onUpdate) return;
    if (visibleWidgets.includes(id)) {
      onUpdate(visibleWidgets.filter(w => w !== id));
    } else {
      onUpdate([...visibleWidgets, id]);
    }
  };

  return (
    <>
      {/* Trigger Button */}
      <button 
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-2 px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm ${isOpen ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:text-indigo-600'}`}
      >
        <span>Customize Layout</span>
        <span className="text-lg">⚙️</span>
      </button>

      {/* Drawer Overlay */}
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex justify-end">
            {/* Backdrop */}
            <div 
                className="absolute inset-0 bg-slate-900/20 backdrop-blur-sm animate-in fade-in duration-300"
                onClick={() => setIsOpen(false)}
            />

            {/* Drawer Panel */}
            <div className="relative w-full max-w-md bg-white dark:bg-slate-900 h-full shadow-2xl animate-in slide-in-from-right duration-300 flex flex-col">
                
                {/* Header */}
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-white dark:bg-slate-900 z-10">
                    <div>
                        <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">Dashboard Layout</h3>
                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Manage & Reorder Widgets</p>
                    </div>
                    <button 
                        onClick={() => setIsOpen(false)}
                        className="w-8 h-8 flex items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-rose-100 hover:text-rose-500 transition-colors"
                    >
                        ✕
                    </button>
                </div>

                {/* Theme Selector (Optional) */}
                {onUpdateTheme && (
                    <div className="px-6 pt-6 pb-2 border-b border-slate-100 dark:border-slate-800">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Interface Theme</p>
                        <div className="grid grid-cols-2 gap-3 mb-4">
                            <button
                                onClick={() => onUpdateTheme('traditional')}
                                className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${!isDark ? 'bg-indigo-50 border-indigo-200 text-indigo-700' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}
                            >
                                <div className="w-3 h-3 rounded-full bg-indigo-500"></div>
                                <span className="text-xs font-bold">Traditional</span>
                            </button>
                            <button
                                onClick={() => onUpdateTheme('dark')}
                                className={`flex items-center justify-center gap-2 p-3 rounded-xl border transition-all ${isDark ? 'bg-slate-800 border-indigo-500 text-white' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500'}`}
                            >
                                <div className="w-3 h-3 rounded-full bg-slate-900 border border-slate-600"></div>
                                <span className="text-xs font-bold">Dark</span>
                            </button>
                        </div>
                    </div>
                )}

                {/* Tabs */}
                <div className="px-6 pt-6 pb-2">
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                        <button 
                            onClick={() => setActiveTab('library')}
                            className={`flex-1 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'library' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                        >
                            Add Widgets
                        </button>
                        <button 
                            onClick={() => setActiveTab('organize')}
                            className={`flex-1 py-2.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${activeTab === 'organize' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                        >
                            Reorder
                        </button>
                    </div>
                </div>

                {/* Content Area */}
                <div className="flex-1 overflow-y-auto p-6 custom-scrollbar">
                    
                    {/* LIBRARY TAB: Directory with Toggles */}
                    {activeTab === 'library' && (
                        <div className="space-y-3">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Available Widgets Directory</p>
                            {availableWidgets.map((widget) => {
                                const isEnabled = visibleWidgets.includes(widget.id);
                                return (
                                    <div 
                                        key={widget.id}
                                        onClick={() => toggleWidget(widget.id)}
                                        className={`flex items-center justify-between p-4 rounded-2xl border cursor-pointer transition-all group ${isEnabled ? 'bg-indigo-50/30 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-900/50 hover:bg-indigo-50 dark:hover:bg-indigo-900/20' : 'bg-white dark:bg-slate-800 border-slate-100 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'}`}
                                    >
                                        <div className="flex items-center gap-4">
                                            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shadow-sm transition-colors ${isEnabled ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-600 dark:text-indigo-300' : 'bg-slate-100 dark:bg-slate-700 text-slate-400'}`}>
                                                {widget.icon}
                                            </div>
                                            <div>
                                                <p className={`text-sm font-bold ${isEnabled ? 'text-indigo-900 dark:text-indigo-300' : 'text-slate-700 dark:text-slate-300'}`}>{widget.label}</p>
                                                <p className="text-[10px] text-slate-400 font-medium">Click to {isEnabled ? 'remove' : 'add'}</p>
                                            </div>
                                        </div>
                                        
                                        {/* Toggle Switch Visual */}
                                        <div className={`w-12 h-7 rounded-full p-1 transition-colors duration-300 ${isEnabled ? 'bg-emerald-500' : 'bg-slate-200 dark:bg-slate-600'}`}>
                                            <div className={`w-5 h-5 bg-white rounded-full shadow-md transition-transform duration-300 ${isEnabled ? 'translate-x-5' : 'translate-x-0'}`}></div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* ORGANIZE TAB: Drag and Drop */}
                    {activeTab === 'organize' && (
                        <div className="space-y-3">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">Drag to Reorder Active Widgets</p>
                            {activeWidgetDefs.map((widget, index) => (
                                <div 
                                    key={widget.id}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragEnter={(e) => handleDragEnter(e, index)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={(e) => e.preventDefault()}
                                    className="flex items-center justify-between p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 cursor-move shadow-sm hover:shadow-md hover:border-indigo-300 dark:hover:border-indigo-500 transition-all active:cursor-grabbing"
                                >
                                    <div className="flex items-center gap-4">
                                        <span className="text-slate-300 cursor-grab active:cursor-grabbing px-1">
                                            <svg width="10" height="16" viewBox="0 0 10 16" fill="currentColor">
                                                <circle cx="2" cy="2" r="1.5" />
                                                <circle cx="8" cy="2" r="1.5" />
                                                <circle cx="2" cy="8" r="1.5" />
                                                <circle cx="8" cy="8" r="1.5" />
                                                <circle cx="2" cy="14" r="1.5" />
                                                <circle cx="8" cy="14" r="1.5" />
                                            </svg>
                                        </span>
                                        <div className="w-8 h-8 rounded-lg bg-slate-50 dark:bg-slate-700 flex items-center justify-center text-sm">
                                            {widget.icon}
                                        </div>
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{widget.label}</span>
                                    </div>
                                    <button 
                                        onClick={(e) => { e.stopPropagation(); toggleWidget(widget.id); }}
                                        className="text-slate-300 hover:text-rose-500 p-2 hover:bg-rose-50 dark:hover:bg-rose-900/30 rounded-lg transition-colors"
                                        title="Remove"
                                    >
                                        ✕
                                    </button>
                                </div>
                            ))}
                            {activeWidgetDefs.length === 0 && (
                                <div className="text-center py-10">
                                    <p className="text-sm font-bold text-slate-400">No widgets active.</p>
                                    <button 
                                        onClick={() => setActiveTab('library')}
                                        className="text-xs font-black text-indigo-600 dark:text-indigo-400 mt-2 uppercase tracking-wider hover:underline"
                                    >
                                        Go to Library to add some
                                    </button>
                                </div>
                            )}
                        </div>
                    )}
                </div>

                {/* Footer / Status */}
                <div className="p-6 bg-slate-50 dark:bg-slate-800 border-t border-slate-100 dark:border-slate-700">
                    <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">
                        <span>{activeWidgetDefs.length} Active Widgets</span>
                        <span>{availableWidgets.length - activeWidgetDefs.length} Hidden</span>
                    </div>
                </div>
            </div>
        </div>
      )}
    </>
  );
};

export default WidgetsController;
