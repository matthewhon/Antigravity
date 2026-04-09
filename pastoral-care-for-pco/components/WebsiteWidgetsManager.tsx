import React, { useState } from 'react';
import { Loader2, RefreshCw, Copy, CheckCircle, Globe, Settings, Code, LayoutGrid, MonitorPlay } from 'lucide-react';

interface WebsiteWidgetsManagerProps {
  churchId: string;
}

export const WebsiteWidgetsManager: React.FC<WebsiteWidgetsManagerProps> = ({ churchId }) => {
  const [type, setType] = useState('groups');
  const [theme, setTheme] = useState('light');
  const [color, setColor] = useState('indigo');
  const [layout, setLayout] = useState('grid');
  const [gridCols, setGridCols] = useState('3');
  const [groupType, setGroupType] = useState('');
  const [showTags, setShowTags] = useState(true);
  
  // Registration specifics
  const [dateFilter, setDateFilter] = useState('future'); // future, month, all
  const [tagFilter, setTagFilter] = useState('');
  const [imageRatio, setImageRatio] = useState('16:9'); // 16:9, 1:1
  const [autoHeight, setAutoHeight] = useState(false);  
  const [scale, setScale] = useState<number>(1);
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const apiBaseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://pastoralcare.barnabassoftware.com' 
        : 'http://localhost:8080';
        
      const res = await fetch(`${apiBaseUrl}/pco/sync`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ churchId, area: type === 'calendar' ? 'events' : type })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      
      // Force iframe reload
      const iframe = document.getElementById('widget-preview') as HTMLIFrameElement;
      if (iframe) {
          const newUrl = new URL(iframe.src);
          newUrl.searchParams.set('refresh', 'true');
          newUrl.searchParams.set('t', Date.now().toString());
          iframe.src = newUrl.toString();
      }
      showToast(`${type} synced successfully`);
    } catch (e: any) {
      showToast(`Sync failed: ${e.message}`);
    } finally {
      setIsSyncing(false);
    }
  };

  // The base paths
  const domain = process.env.NODE_ENV === 'production' 
    ? 'https://pastoralcare.barnabassoftware.com'
    : window.location.origin;
  const commonParams = `type=${type}&churchId=${churchId}&theme=${theme}&color=${color}&layout=${layout}` 
      + (layout === 'grid' ? `&gridCols=${gridCols}` : '')
      + (type === 'groups' && groupType ? `&groupType=${encodeURIComponent(groupType)}` : '')
      + (type === 'groups' ? `&showTags=${showTags}` : '')
      + (type === 'registrations' ? `&dateFilter=${dateFilter}&tagFilter=${encodeURIComponent(tagFilter)}` : '')
      + `&imageRatio=${imageRatio}`
      + (autoHeight ? `&autoHeight=true` : '')
      + (scale !== 1 ? `&scale=${scale}` : '');

  const iframeUrl = `${domain}/?widget=true&${commonParams}`;
  const scriptUrl = `${domain}/widget.js?${commonParams}`;

  const iframeEmbedCode = `<iframe src="${iframeUrl}" width="100%" height="800" style="border:none; border-radius:12px; overflow:hidden;" allow="clipboard-write"></iframe>`;
  const scriptEmbedCode = `<script src="${scriptUrl}" async></script>`;

  const copyToClipboard = (text: string, isScript: boolean) => {
    navigator.clipboard.writeText(text);
    if (isScript) {
      setCopiedScript(true);
      setTimeout(() => setCopiedScript(false), 2000);
    } else {
      setCopiedIframe(true);
      setTimeout(() => setCopiedIframe(false), 2000);
    }
  };

  return (
    <div className="flex flex-col h-full bg-slate-50 dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Globe className="text-indigo-500" size={24} /> Website Embeds
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
            Configure beautiful, live-updating widgets for your church website.
          </p>
        </div>
        <button
          onClick={handleSync}
          disabled={isSyncing}
          className="flex items-center gap-2 px-4 py-2 border border-slate-200 dark:border-slate-600 rounded-lg text-sm font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-750 transition disabled:opacity-50"
        >
          {isSyncing ? <Loader2 size={16} className="animate-spin" /> : <RefreshCw size={16} />} 
          {isSyncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      <div className="flex flex-grow overflow-hidden">
        {/* Left Config Panel */}
        <div className="w-80 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-y-auto p-6 space-y-6">
            
          <div>
            <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Widget Type</label>
            <div className="grid grid-cols-1 gap-2">
              {[
                { id: 'groups', label: 'Small Groups' },
                { id: 'registrations', label: 'Registrations' },
                { id: 'events', label: 'Calendar/Events' }
              ].map(opt => (
                <button 
                  key={opt.id}
                  onClick={() => {
                    setType(opt.id);
                    if (opt.id === 'events') setLayout('month');
                    else if (layout === 'month') setLayout('grid');
                  }}
                  className={`text-left px-4 py-2.5 rounded-lg border text-sm font-semibold transition ${type === opt.id ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 text-indigo-700 dark:text-indigo-400 dark:border-indigo-800' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          <div>
             <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Theme Mode</label>
             <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
               <button onClick={() => setTheme('light')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${theme==='light'?'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white':'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Light</button>
               <button onClick={() => setTheme('dark')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${theme==='dark'?'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white':'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Dark</button>
             </div>
          </div>

          <div>
             <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Layout</label>
             <div className="flex gap-2">
               {type === 'events' && (
                 <button onClick={() => setLayout('month')} className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition ${layout==='month'?'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400':'border-slate-200 text-slate-500 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                   <LayoutGrid size={20} />
                   <span className="text-[10px] uppercase font-bold tracking-widest">Month</span>
                 </button>
               )}
               <button onClick={() => setLayout('grid')} className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition ${layout==='grid'?'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400':'border-slate-200 text-slate-500 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                 <LayoutGrid size={20} />
                 <span className="text-[10px] uppercase font-bold tracking-widest">{(type === 'registrations' || type === 'events') ? 'Tiles' : 'Grid'}</span>
               </button>
               <button onClick={() => setLayout('list')} className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition ${layout==='list'?'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400':'border-slate-200 text-slate-500 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                 <MonitorPlay size={20} />
                 <span className="text-[10px] uppercase font-bold tracking-widest">{(type === 'registrations' || type === 'events') ? 'Detailed' : 'List'}</span>
               </button>
               {type === 'registrations' && (
                 <button onClick={() => setLayout('simplified_list')} className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition ${layout==='simplified_list'?'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400':'border-slate-200 text-slate-500 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                   <MonitorPlay size={20} />
                   <span className="text-[10px] uppercase font-bold tracking-widest">Simple</span>
                 </button>
               )}
             </div>
          </div>

          <div>
             <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Display Mode</label>
             <label className="flex items-center gap-3 cursor-pointer">
               <input 
                 type="checkbox" 
                 checked={autoHeight} 
                 onChange={e => setAutoHeight(e.target.checked)}
                 className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600 bg-white dark:bg-slate-900"
               />
               <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Auto Height (No Scrollbar)</span>
             </label>
             <p className="text-[10px] text-slate-500 mt-2 leading-relaxed">Checking this will make the widget grow to fit all its content without showing an internal scrollbar. (Recommended to use the Script Embed for this feature)</p>
           </div>

          {/* Widget Sizing Scale Slider */}
          <div>
             <label className="flex items-center justify-between text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">
                Widget Size <span className="text-indigo-600 dark:text-indigo-400">{Math.round(scale * 100)}%</span>
             </label>
             <input 
                type="range" 
                min="0.75" 
                max="1.25" 
                step="0.05" 
                value={scale} 
                onChange={e => setScale(parseFloat(e.target.value))}
                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer dark:bg-slate-700 accent-indigo-600"
             />
             <div className="flex justify-between text-[10px] text-slate-400 mt-1 font-bold">
                <span>Smaller</span>
                <span>Default</span>
                <span>Larger</span>
             </div>
          </div>

          {layout === 'grid' && (
            <div>
               <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Grid Columns</label>
               <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                 {['2', '3', '4'].map(cols => (
                   <button key={cols} onClick={() => setGridCols(cols)} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${gridCols===cols?'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white':'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>{cols}</button>
                 ))}
               </div>
            </div>
          )}

          {(layout === 'grid' || layout === 'list') && (
            <div>
               <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Image Ratio</label>
               <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                 <button onClick={() => setImageRatio('16:9')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${imageRatio==='16:9'?'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white':'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>16:9 Widescreen</button>
                 <button onClick={() => setImageRatio('1:1')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${imageRatio==='1:1'?'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white':'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>1:1 Square</button>
               </div>
            </div>
          )}

          {type === 'groups' && (
            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Filter Group Type</label>
                <input 
                  type="text" 
                  placeholder="e.g. Adult, Youth (optional)" 
                  value={groupType} 
                  onChange={e => setGroupType(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={showTags} 
                  onChange={e => setShowTags(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show Tags</span>
              </label>
            </div>
          )}

          {type === 'registrations' && (
            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div>
                 <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Date Filter</label>
                 <select 
                    value={dateFilter}
                    onChange={e => setDateFilter(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                 >
                    <option value="future">Future Events</option>
                    <option value="month">This Month</option>
                    <option value="all">All Registrations</option>
                 </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Filter By Tags</label>
                <input 
                  type="text" 
                  placeholder="e.g. Women, Men, Kids" 
                  value={tagFilter} 
                  onChange={e => setTagFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <p className="text-[10px] text-slate-400 mt-1">Leave empty to show all tags.</p>
              </div>
            </div>
          )}

          <div>
             <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Accent Color</label>
             <div className="flex flex-wrap gap-2">
                {['indigo', 'blue', 'emerald', 'amber', 'red', 'violet', 'fuchsia', 'rose'].map(c => (
                    <button 
                        key={c}
                        onClick={() => setColor(c)}
                        title={c}
                        className={`w-8 h-8 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center p-0.5 ${color === c ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent'}`}
                    >
                        <div className={`w-full h-full rounded-full bg-${c}-500`} />
                    </button>
                ))}
            </div>
          </div>

        </div>

        {/* Right Preview Panel */}
        <div className="flex-1 flex flex-col bg-slate-100 dark:bg-slate-950 max-h-full overflow-hidden">
             
             {/* Live Preview Pane */}
             <div className="flex-1 p-6 flex flex-col">
                 <div className="flex items-center justify-between mb-3 text-slate-500 dark:text-slate-400">
                    <span className="text-xs font-bold tracking-widest uppercase">Live Preview</span>
                 </div>
                 <div className={`flex-1 rounded-2xl border-4 border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl bg-white dark:bg-slate-900 ${layout === 'list' ? 'max-w-3xl mx-auto w-full' : 'w-full'}`}>
                    <iframe 
                      id="widget-preview"
                      src={iframeUrl}
                      title="Widget Preview"
                      className="w-full h-full border-none"
                    />
                 </div>
             </div>

             {/* Code Snippets */}
             <div className="shrink-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-6 space-y-4">
                
                <div className="flex items-start gap-4">
                    <div className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 rounded-xl relative group">
                        <span className="absolute top-0 right-0 -translate-y-1/2 translate-x-2 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-400 px-2 py-0.5 rounded text-[10px] font-black uppercase tracking-widest">Recommended</span>
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                            <Code size={16} className="text-slate-400" />
                            Script Embed
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Dynamically injects the iframe for cleaner markup.</p>
                        <div className="bg-slate-900 p-3 rounded-lg break-all text-[11px] text-slate-300 font-mono">
                            {scriptEmbedCode}
                        </div>
                        <button 
                            onClick={() => copyToClipboard(scriptEmbedCode, true)}
                            className="absolute bottom-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition"
                        >
                            {copiedScript ? <CheckCircle size={16} className="text-emerald-400" /> : <Copy size={16} />}
                        </button>
                    </div>

                    <div className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 rounded-xl relative group">
                        <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                            <LayoutGrid size={16} className="text-slate-400" />
                            Iframe Embed
                        </h4>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">A standard iframe element. Works on restrictive CMSs.</p>
                        <div className="bg-slate-900 p-3 rounded-lg break-all text-[11px] text-slate-300 font-mono">
                            {iframeEmbedCode}
                        </div>
                        <button 
                            onClick={() => copyToClipboard(iframeEmbedCode, false)}
                            className="absolute bottom-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition"
                        >
                            {copiedIframe ? <CheckCircle size={16} className="text-emerald-400" /> : <Copy size={16} />}
                        </button>
                    </div>
                </div>

             </div>
        </div>
      </div>

      {toast && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 bg-slate-900 text-white px-4 py-2 rounded-lg shadow-xl text-sm font-semibold z-50">
          {toast}
        </div>
      )}
    </div>
  );
};
