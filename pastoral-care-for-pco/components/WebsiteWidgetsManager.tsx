import React, { useState } from 'react';
import { Loader2, RefreshCw, Copy, CheckCircle, Code, LayoutGrid, MonitorPlay, Eye, EyeOff, TriangleAlert, Info, Monitor, Tablet, Smartphone, Save, Trash2, Bookmark } from 'lucide-react';
import { ToolHeader, ToolButton } from './tool-shell';
import { db } from '../services/firebase';
import { collection, query, where, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';

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
  const [includeArchived, setIncludeArchived] = useState(false);
  const [imageRatio, setImageRatio] = useState('16:9'); // 16:9, 1:1
  const [autoHeight, setAutoHeight] = useState(false);  
  const [scale, setScale] = useState<number>(1);
  const [maxItems, setMaxItems] = useState('0');
  const [isSyncing, setIsSyncing] = useState(false);
  const [toast, setToast] = useState('');
  const [copiedScript, setCopiedScript] = useState(false);
  const [copiedIframe, setCopiedIframe] = useState(false);
  
  // Forms specifics
  const [forms, setForms] = useState<any[]>([]);
  const [visibleFormIds, setVisibleFormIds] = useState<Set<string>>(new Set());
  const [formsLoaded, setFormsLoaded] = useState(false);

  // Single Event specifics
  const [singleEventId, setSingleEventId] = useState('');
  const [singleEventSource, setSingleEventSource] = useState<'calendar' | 'registrations'>('calendar');
  const [singleEventStyle, setSingleEventStyle] = useState<'hero' | 'card' | 'compact'>('card');
  const [singleEventCtaText, setSingleEventCtaText] = useState('Register Now');
  const [singleEventShowCountdown, setSingleEventShowCountdown] = useState(true);
  const [singleEventShowLocation, setSingleEventShowLocation] = useState(true);
  const [singleEvents, setSingleEvents] = useState<any[]>([]);
  const [singleEventsLoading, setSingleEventsLoading] = useState(false);
  const [singleEventsLoaded, setSingleEventsLoaded] = useState(false);
  const [singleEventIsDynamic, setSingleEventIsDynamic] = useState(false);
  const [isSavingDynamic, setIsSavingDynamic] = useState(false);

  // Popup specifics (legacy Church Center popup)
  const [popupUrl, setPopupUrl] = useState('');
  const [popupText, setPopupText] = useState('Open Form');

  // Bubble Popup specifics (new)
  const [bubbleFormId, setBubbleFormId] = useState('');
  const [bubbleMode, setBubbleMode] = useState<'text' | 'icon'>('text');
  const [bubbleText, setBubbleText] = useState('Plan a Visit');
  const [bubbleHoverText, setBubbleHoverText] = useState('Plan a Visit with us!');
  const [bubbleIcon, setBubbleIcon] = useState('👋');
  const [bubblePosition, setBubblePosition] = useState<'right' | 'left'>('right');
  const [customForms, setCustomForms] = useState<any[]>([]);
  const [customFormsLoaded, setCustomFormsLoaded] = useState(false);

  // Upcoming Events Table specifics
  const [tableMaxEvents, setTableMaxEvents] = useState('10');
  const [tableEventSource, setTableEventSource] = useState<'calendar' | 'registrations'>('calendar');
  const [tableStyle, setTableStyle] = useState<'clean' | 'striped' | 'bordered' | 'card'>('clean');
  const [tableHeaderStyle, setTableHeaderStyle] = useState<'accent' | 'tinted' | 'minimal' | 'hidden'>('accent');
  const [tableDensity, setTableDensity] = useState<'compact' | 'comfortable' | 'spacious'>('comfortable');
  const [tableRadius, setTableRadius] = useState<'none' | 'md' | 'xl'>('md');
  const [tableDateFormat, setTableDateFormat] = useState<'badge' | 'short' | 'numeric'>('badge');
  const [tableShowTime, setTableShowTime] = useState(true);
  const [tableShowLocation, setTableShowLocation] = useState(true);
  const [tableShowDescription, setTableShowDescription] = useState(false);
  const [tableShowAction, setTableShowAction] = useState(true);
  const [tableCtaText, setTableCtaText] = useState('Details');
  const [tableTitle, setTableTitle] = useState('');

  // Enhanced Event Directory options (opt-in)
  const [eventShowFilters, setEventShowFilters] = useState(false);
  const [eventShowTagFilters, setEventShowTagFilters] = useState(false);
  const [eventShowLocationFilters, setEventShowLocationFilters] = useState(false);
  const [eventShowFeaturedHero, setEventShowFeaturedHero] = useState(false);
  const [eventAllowViewSwitch, setEventAllowViewSwitch] = useState(false);
  const [eventShowCalendarLink, setEventShowCalendarLink] = useState(false);
  const [eventTagFilter, setEventTagFilter] = useState('');
  const [eventShowWeeklyRhythm, setEventShowWeeklyRhythm] = useState(false);
  const [eventWeeklyRhythmText, setEventWeeklyRhythmText] = useState('Sundays: 9:00 AM & 11:00 AM | Wednesdays: 6:00 PM');
  const [eventPlanVisitUrl, setEventPlanVisitUrl] = useState('');
  const [posterCtaText, setPosterCtaText] = useState('Register');
  const [posterCtaAccent, setPosterCtaAccent] = useState(false);

  // Groups / Registrations / Forms opt-in options
  const [widgetShowFilters, setWidgetShowFilters] = useState(false);
  const [formsOpenInModal, setFormsOpenInModal] = useState(false);

  // Preview viewport & Saved Presets
  const [previewDevice, setPreviewDevice] = useState<'desktop' | 'tablet' | 'mobile'>('desktop');
  const [presets, setPresets] = useState<any[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [presetName, setPresetName] = useState('');
  const [isSavingPreset, setIsSavingPreset] = useState(false);

  React.useEffect(() => {
    const loadPresets = async () => {
      try {
        const q = query(collection(db, 'website_widget_presets'), where('churchId', '==', churchId));
        const snap = await getDocs(q);
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        list.sort((a: any, b: any) => (b.createdAt || '').localeCompare(a.createdAt || ''));
        setPresets(list);
      } catch (err) {
        console.error('Failed to load widget presets', err);
      }
    };
    loadPresets();
  }, [churchId]);

  React.useEffect(() => {
    if (type === 'bubble_form' && !customFormsLoaded) {
      const fetchCustomForms = async () => {
        try {
          const q = query(collection(db, 'pco_forms'), where('churchId', '==', churchId));
          const snapshot = await getDocs(q);
          const list = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
          setCustomForms(list);
          if (list.length > 0 && !bubbleFormId) {
            setBubbleFormId(list[0].id);
          }
          setCustomFormsLoaded(true);
        } catch (error) {
          console.error('Failed to fetch custom forms for bubble widget', error);
        }
      };
      fetchCustomForms();
    }
  }, [type, churchId, customFormsLoaded, bubbleFormId]);

  React.useEffect(() => {
    if ((type === 'forms' || type === 'popup') && !formsLoaded) {
      const apiBaseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://pastoralcare.barnabassoftware.com' 
        : 'http://localhost:8080';
      fetch(`${apiBaseUrl}/api/public/forms/${churchId}`)
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            setForms(data);
            // Default: all forms visible
            setVisibleFormIds(new Set(data.map((f: any) => f.id)));
            setFormsLoaded(true);
          }
        })
        .catch(console.error);
    }
  }, [type, churchId, formsLoaded]);

  React.useEffect(() => {
    if (type === 'single_event') {
      setSingleEventsLoading(true);
      const apiBaseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://pastoralcare.barnabassoftware.com' 
        : 'http://localhost:8080';
      const endpoint = singleEventSource === 'calendar' ? 'events' : 'registrations';
      fetch(`${apiBaseUrl}/api/public/${endpoint}/${churchId}`)
        .then(r => r.json())
        .then(data => {
          if (Array.isArray(data)) {
            setSingleEvents(data);
            setSingleEventsLoaded(true);
            if (data.length > 0 && !singleEventId) {
              setSingleEventId(data[0].id);
            }
          }
        })
        .catch(console.error)
        .finally(() => setSingleEventsLoading(false));
    }
  }, [type, churchId, singleEventSource]);

  const toggleFormVisibility = (id: string) => {
    setVisibleFormIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const selectAllForms = () => setVisibleFormIds(new Set(forms.map(f => f.id)));
  const selectNoForms = () => setVisibleFormIds(new Set());

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(''), 3000);
  };

  const handleSavePreset = async () => {
    const trimmed = presetName.trim();
    if (!trimmed) {
      showToast('Please enter a name for this preset');
      return;
    }
    setIsSavingPreset(true);
    try {
      const config = {
        type, theme, color, layout, gridCols, groupType, showTags,
        dateFilter, tagFilter, includeArchived, imageRatio, autoHeight, scale, maxItems,
        tableMaxEvents, tableEventSource, tableStyle, tableHeaderStyle, tableDensity,
        tableRadius, tableDateFormat, tableShowTime, tableShowLocation, tableShowDescription,
        tableShowAction, tableCtaText, tableTitle,
        eventShowFilters, eventShowTagFilters, eventShowLocationFilters, eventShowFeaturedHero,
        eventAllowViewSwitch, eventShowCalendarLink, eventTagFilter, eventShowWeeklyRhythm,
        eventWeeklyRhythmText, eventPlanVisitUrl, posterCtaText, posterCtaAccent,
        widgetShowFilters, formsOpenInModal,
      };
      const docRef = await addDoc(collection(db, 'website_widget_presets'), {
        churchId,
        name: trimmed,
        config,
        createdAt: new Date().toISOString(),
      });
      const newPreset = { id: docRef.id, churchId, name: trimmed, config, createdAt: new Date().toISOString() };
      setPresets(prev => [newPreset, ...prev]);
      setSelectedPresetId(docRef.id);
      setPresetName('');
      showToast(`Saved preset "${trimmed}"`);
    } catch (err: any) {
      showToast(`Failed to save preset: ${err.message}`);
    } finally {
      setIsSavingPreset(false);
    }
  };

  const handleLoadPreset = (id: string) => {
    setSelectedPresetId(id);
    const found = presets.find(p => p.id === id);
    if (!found?.config) return;
    const c = found.config;
    if (c.type !== undefined) setType(c.type);
    if (c.theme !== undefined) setTheme(c.theme);
    if (c.color !== undefined) setColor(c.color);
    if (c.layout !== undefined) setLayout(c.layout);
    if (c.gridCols !== undefined) setGridCols(c.gridCols);
    if (c.groupType !== undefined) setGroupType(c.groupType);
    if (c.showTags !== undefined) setShowTags(c.showTags);
    if (c.dateFilter !== undefined) setDateFilter(c.dateFilter);
    if (c.tagFilter !== undefined) setTagFilter(c.tagFilter);
    if (c.includeArchived !== undefined) setIncludeArchived(c.includeArchived);
    if (c.imageRatio !== undefined) setImageRatio(c.imageRatio);
    if (c.autoHeight !== undefined) setAutoHeight(c.autoHeight);
    if (c.scale !== undefined) setScale(c.scale);
    if (c.maxItems !== undefined) setMaxItems(c.maxItems);
    if (c.tableMaxEvents !== undefined) setTableMaxEvents(c.tableMaxEvents);
    if (c.tableEventSource !== undefined) setTableEventSource(c.tableEventSource);
    if (c.tableStyle !== undefined) setTableStyle(c.tableStyle);
    if (c.tableHeaderStyle !== undefined) setTableHeaderStyle(c.tableHeaderStyle);
    if (c.tableDensity !== undefined) setTableDensity(c.tableDensity);
    if (c.tableRadius !== undefined) setTableRadius(c.tableRadius);
    if (c.tableDateFormat !== undefined) setTableDateFormat(c.tableDateFormat);
    if (c.tableShowTime !== undefined) setTableShowTime(c.tableShowTime);
    if (c.tableShowLocation !== undefined) setTableShowLocation(c.tableShowLocation);
    if (c.tableShowDescription !== undefined) setTableShowDescription(c.tableShowDescription);
    if (c.tableShowAction !== undefined) setTableShowAction(c.tableShowAction);
    if (c.tableCtaText !== undefined) setTableCtaText(c.tableCtaText);
    if (c.tableTitle !== undefined) setTableTitle(c.tableTitle);
    if (c.eventShowFilters !== undefined) setEventShowFilters(c.eventShowFilters);
    if (c.eventShowTagFilters !== undefined) setEventShowTagFilters(c.eventShowTagFilters);
    if (c.eventShowLocationFilters !== undefined) setEventShowLocationFilters(c.eventShowLocationFilters);
    if (c.eventShowFeaturedHero !== undefined) setEventShowFeaturedHero(c.eventShowFeaturedHero);
    if (c.eventAllowViewSwitch !== undefined) setEventAllowViewSwitch(c.eventAllowViewSwitch);
    if (c.eventShowCalendarLink !== undefined) setEventShowCalendarLink(c.eventShowCalendarLink);
    if (c.eventTagFilter !== undefined) setEventTagFilter(c.eventTagFilter);
    if (c.eventShowWeeklyRhythm !== undefined) setEventShowWeeklyRhythm(c.eventShowWeeklyRhythm);
    if (c.eventWeeklyRhythmText !== undefined) setEventWeeklyRhythmText(c.eventWeeklyRhythmText);
    if (c.eventPlanVisitUrl !== undefined) setEventPlanVisitUrl(c.eventPlanVisitUrl);
    if (c.posterCtaText !== undefined) setPosterCtaText(c.posterCtaText);
    if (c.posterCtaAccent !== undefined) setPosterCtaAccent(c.posterCtaAccent);
    if (c.widgetShowFilters !== undefined) setWidgetShowFilters(c.widgetShowFilters);
    if (c.formsOpenInModal !== undefined) setFormsOpenInModal(c.formsOpenInModal);
    showToast(`Loaded preset "${found.name}"`);
  };

  const handleDeletePreset = async () => {
    if (!selectedPresetId) return;
    try {
      await deleteDoc(doc(db, 'website_widget_presets', selectedPresetId));
      setPresets(prev => prev.filter(p => p.id !== selectedPresetId));
      setSelectedPresetId('');
      showToast('Preset deleted');
    } catch (err: any) {
      showToast(`Failed to delete preset: ${err.message}`);
    }
  };

  const handleSync = async () => {
    setIsSyncing(true);
    try {
      const apiBaseUrl = process.env.NODE_ENV === 'production' 
        ? 'https://pastoralcare.barnabassoftware.com' 
        : 'http://localhost:8080';
        
      const { getAuthJsonHeaders } = await import('../services/authHeaders');
      const res = await fetch(`${apiBaseUrl}/pco/sync`, {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({
          churchId,
          area:
            type === 'events_table'
              ? tableEventSource === 'registrations'
                ? 'registrations'
                : 'events'
              : type === 'calendar' || type === 'single_event'
              ? 'events'
              : type,
        })
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
  const visibleFormIdsArray = Array.from(visibleFormIds);
  const allFormsVisible = forms.length > 0 && visibleFormIds.size === forms.length;
  const effectiveMaxItems = type === 'events_table' ? tableMaxEvents : maxItems;
  const isEventDirectoryType = type === 'events' || type === 'calendar' || type === 'events_table';
  const commonParams = `type=${type}&churchId=${churchId}&theme=${theme}&color=${color}&layout=${layout}` 
      + ((layout === 'grid' || layout === 'poster') && type !== 'events_table' ? `&gridCols=${gridCols}` : '')
      + (type === 'groups' && groupType ? `&groupType=${encodeURIComponent(groupType)}` : '')
      + (type === 'groups' ? `&showTags=${showTags}` : '')
      + ((type === 'groups' || type === 'registrations' || type === 'forms') && widgetShowFilters ? `&showFilters=true` : '')
      + (type === 'forms' && formsOpenInModal ? `&openInModal=true` : '')
      + (type === 'registrations' ? `&dateFilter=${dateFilter}&tagFilter=${encodeURIComponent(tagFilter)}&includeArchived=${includeArchived}` : '')
      + (type === 'forms' && formsLoaded && !allFormsVisible ? `&visibleFormIds=${encodeURIComponent(visibleFormIdsArray.join(','))}` : '')
      + (type === 'single_event' ? `&eventId=${singleEventIsDynamic ? 'dynamic' : singleEventId}&eventSource=${singleEventSource}&eventStyle=${singleEventStyle}&ctaText=${encodeURIComponent(singleEventCtaText)}&showCountdown=${singleEventShowCountdown}&showLocation=${singleEventShowLocation}` : '')
      + (type === 'events_table' ? `&eventSource=${tableEventSource}&tableStyle=${tableStyle}&tableHeaderStyle=${tableHeaderStyle}&tableDensity=${tableDensity}&tableRadius=${tableRadius}&tableDateFormat=${tableDateFormat}&showTime=${tableShowTime}&showLocation=${tableShowLocation}&showDescription=${tableShowDescription}&showAction=${tableShowAction}&tableCtaText=${encodeURIComponent(tableCtaText)}&tableTitle=${encodeURIComponent(tableTitle)}` : '')
      + (isEventDirectoryType && eventShowFilters ? `&showFilters=true` : '')
      + (isEventDirectoryType && eventShowFilters && eventShowTagFilters ? `&showTagFilters=true` : '')
      + (isEventDirectoryType && eventShowFilters && eventShowLocationFilters ? `&showLocationFilters=true` : '')
      + (isEventDirectoryType && eventTagFilter.trim() ? `&tagFilter=${encodeURIComponent(eventTagFilter.trim())}` : '')
      + (isEventDirectoryType && eventShowFeaturedHero ? `&showFeaturedHero=true` : '')
      + (type === 'events' && eventAllowViewSwitch ? `&allowViewSwitch=true` : '')
      + (isEventDirectoryType && eventShowCalendarLink ? `&showCalendarLink=true` : '')
      + (isEventDirectoryType && eventShowWeeklyRhythm ? `&showWeeklyRhythm=true&weeklyRhythmText=${encodeURIComponent(eventWeeklyRhythmText)}${eventPlanVisitUrl.trim() ? `&planVisitUrl=${encodeURIComponent(eventPlanVisitUrl.trim())}` : ''}` : '')
      + (type === 'events' && layout === 'poster' && posterCtaText !== 'Register' ? `&posterCtaText=${encodeURIComponent(posterCtaText)}` : '')
      + (type === 'events' && layout === 'poster' && posterCtaAccent ? `&posterCtaAccent=true` : '')
      + (type === 'bubble_form' ? `&formId=${bubbleFormId}&bubbleMode=${bubbleMode}&bubbleText=${encodeURIComponent(bubbleText)}&bubbleHoverText=${encodeURIComponent(bubbleHoverText)}&bubbleIcon=${encodeURIComponent(bubbleIcon)}&bubblePosition=${bubblePosition}` : '')
      + `&imageRatio=${imageRatio}`
      + (autoHeight ? `&autoHeight=true` : '')
      + (scale !== 1 ? `&scale=${scale}` : '')
      + (effectiveMaxItems && effectiveMaxItems !== '0' ? `&maxItems=${effectiveMaxItems}` : '');

  const iframeUrl = type === 'newsletter'
    ? `${domain}/newsletter/${churchId}?embedded=true`
    : `${domain}/?widget=true&${commonParams}`;
  const scriptUrl = `${domain}/widget.js?${commonParams}`;

  const iframeEmbedCode = type === 'newsletter'
    ? `<iframe src="${iframeUrl}" width="100%" height="650" style="border:none; border-radius:16px; overflow:hidden;" allow="clipboard-write"></iframe>`
    : `<iframe src="${iframeUrl}" width="100%" height="800" style="border:none; border-radius:12px; overflow:hidden;" allow="clipboard-write"></iframe>`;
  const scriptEmbedCode = `<script src="${scriptUrl}" async></script>`;

  const colorMap: Record<string, string> = {
      'indigo': '#4F46E5', 'blue': '#2563EB', 'emerald': '#10B981', 'amber': '#F59E0B',
      'red': '#EF4444', 'violet': '#8B5CF6', 'fuchsia': '#D946EF', 'rose': '#F43F5E'
  };
  const btnColor = colorMap[color] || '#4F46E5';
  
  const popupHtml = popupUrl ? `<a href="${popupUrl}" data-open-in-church-center-modal="true" style="display:inline-block; padding:12px 24px; background-color:${btnColor}; color:#ffffff; font-family:sans-serif; font-weight:bold; border-radius:8px; text-decoration:none; cursor:pointer;">${popupText || 'Open Form'}</a>\n<script src="https://js.churchcenter.com/modal/v1"></script>` : 'Please enter a Church Center URL first.';

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
    <div className="flex flex-col h-full min-h-0">
      {/* Header */}
      <ToolHeader
        tool="website"
        className="shrink-0"
        description="Configure beautiful, live-updating widgets for your church website."
        actions={
          <ToolButton variant="secondary" onClick={handleSync} disabled={isSyncing}>
            {isSyncing
              ? <Loader2 size={16} className="animate-spin" aria-hidden="true" />
              : <RefreshCw size={16} aria-hidden="true" />}
            {isSyncing ? 'Syncing...' : 'Sync Now'}
          </ToolButton>
        }
      />

      <div className="flex flex-col flex-1 min-h-0 bg-slate-50 dark:bg-slate-900 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-800">
      <div className="flex flex-grow overflow-hidden">
        {/* Left Config Panel */}
        <div className="w-80 border-r border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-y-auto p-6 space-y-6">
          <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-700/50 rounded-xl p-3 text-xs text-amber-800 dark:text-amber-400">
            <strong>Note:</strong> Changes made here do not automatically update existing widgets on your real website. If you change a setting like Widget Size, you must copy the embed code below and replace it on your website.
          </div>

          {/* Saved Presets */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/50 space-y-2.5">
            <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600 dark:text-slate-300 tracking-wider uppercase">
              <Bookmark size={12} /> Saved Presets
            </label>
            {presets.length > 0 && (
              <div className="flex gap-1.5">
                <select
                  value={selectedPresetId}
                  onChange={e => handleLoadPreset(e.target.value)}
                  className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium"
                >
                  <option value="">Load a saved preset...</option>
                  {presets.map(p => (
                    <option key={p.id} value={p.id}>{p.name}</option>
                  ))}
                </select>
                {selectedPresetId && (
                  <button
                    type="button"
                    onClick={handleDeletePreset}
                    title="Delete selected preset"
                    className="p-1.5 rounded-lg border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-900/30 transition"
                  >
                    <Trash2 size={14} />
                  </button>
                )}
              </div>
            )}
            <div className="flex gap-1.5">
              <input
                type="text"
                placeholder="Preset name (e.g. Homepage Events)"
                value={presetName}
                onChange={e => setPresetName(e.target.value)}
                className="flex-1 min-w-0 px-2.5 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
              />
              <button
                type="button"
                onClick={handleSavePreset}
                disabled={isSavingPreset}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition disabled:opacity-50 shrink-0"
              >
                <Save size={12} />
                {isSavingPreset ? 'Saving' : 'Save'}
              </button>
            </div>
          </div>
            
          <div>
            <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Widget Type</label>
            <div className="grid grid-cols-1 gap-2">
              {[
                { id: 'groups', label: 'Small Groups' },
                { id: 'registrations', label: 'Registrations' },
                { id: 'events', label: 'Calendar/Events' },
                { id: 'events_table', label: 'Upcoming Events Table' },
                { id: 'single_event', label: 'Featured Single Event' },
                { id: 'forms', label: 'Forms' },
                { id: 'newsletter', label: 'Newsletter Signup' },
                { id: 'bubble_form', label: 'Bubble Popup Form' },
                { id: 'popup', label: 'Legacy Pop Up Form' }
              ].map(opt => (
                <button 
                  key={opt.id}
                  onClick={() => {
                    setType(opt.id);
                    if (opt.id === 'events') setLayout('month');
                    else if (opt.id === 'single_event') setLayout('card');
                    else if (opt.id === 'events_table') setLayout('table');
                    else if (layout === 'month' || layout === 'table') setLayout('grid');
                  }}
                  className={`text-left px-4 py-2.5 rounded-lg border text-sm font-semibold transition ${type === opt.id ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 text-indigo-700 dark:text-indigo-400 dark:border-indigo-800' : 'bg-transparent border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300'}`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {type !== 'popup' && type !== 'bubble_form' && type !== 'newsletter' && (
            <div>
               <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Theme Mode</label>
               <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                 <button onClick={() => setTheme('light')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${theme==='light'?'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white':'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Light</button>
                 <button onClick={() => setTheme('dark')} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${theme==='dark'?'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white':'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>Dark</button>
               </div>
            </div>
          )}

          {type !== 'popup' && type !== 'bubble_form' && type !== 'newsletter' && type !== 'events_table' && (
            <div>
               <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Layout</label>
               <div className="flex gap-2">
                 {type === 'events' && (
                   <button onClick={() => setLayout('month')} className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition ${layout==='month'?'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400':'border-slate-200 text-slate-500 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                     <LayoutGrid size={20} />
                     <span className="text-[10px] uppercase font-bold tracking-wide">Month</span>
                   </button>
                 )}
                 {type === 'events' && (
                   <button onClick={() => setLayout('poster')} className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition ${layout==='poster'?'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400':'border-slate-200 text-slate-500 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                     <LayoutGrid size={20} />
                     <span className="text-[10px] uppercase font-bold tracking-wide">Poster</span>
                   </button>
                 )}
                 <button onClick={() => setLayout('grid')} className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition ${layout==='grid'?'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400':'border-slate-200 text-slate-500 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                   <LayoutGrid size={20} />
                   <span className="text-[10px] uppercase font-bold tracking-wide">{(type === 'registrations' || type === 'events' || type === 'forms') ? 'Tiles' : 'Grid'}</span>
                 </button>
                 <button onClick={() => setLayout('list')} className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition ${layout==='list'?'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400':'border-slate-200 text-slate-500 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                   <MonitorPlay size={20} />
                   <span className="text-[10px] uppercase font-bold tracking-wide">{(type === 'registrations' || type === 'events' || type === 'forms') ? 'Detailed' : 'List'}</span>
                 </button>
                 {type === 'registrations' && (
                   <button onClick={() => setLayout('simplified_list')} className={`flex-1 flex flex-col items-center gap-1.5 py-3 rounded-xl border transition ${layout==='simplified_list'?'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400':'border-slate-200 text-slate-500 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'}`}>
                     <MonitorPlay size={20} />
                     <span className="text-[10px] uppercase font-bold tracking-wide">Simple</span>
                   </button>
                 )}
               </div>
            </div>
          )}

          {type !== 'popup' && type !== 'bubble_form' && type !== 'newsletter' && (
            <>
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

              {/* Max Items Limit */}
              {type !== 'events_table' && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Max Items to Display</label>
                  <input 
                    type="number" 
                    min="0"
                    placeholder="0 for unlimited" 
                    value={maxItems} 
                    onChange={e => setMaxItems(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                  <p className="text-[10px] text-slate-500 mt-1">Leave as 0 to show all items.</p>
                </div>
              )}
            </>
          )}

          {type !== 'popup' && type !== 'bubble_form' && type !== 'events_table' && (layout === 'grid' || layout === 'poster') && (
            <div>
               <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Grid Columns</label>
               <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                 {['2', '3', '4'].map(cols => (
                   <button key={cols} onClick={() => setGridCols(cols)} className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${gridCols===cols?'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white':'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}>{cols}</button>
                 ))}
               </div>
            </div>
          )}

          {type !== 'popup' && type !== 'bubble_form' && type !== 'events_table' && (layout === 'grid' || layout === 'list' || layout === 'poster') && (
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
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={widgetShowFilters}
                  onChange={e => setWidgetShowFilters(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show Search &amp; Type Filter Bar</span>
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
              <label className="flex items-center gap-3 cursor-pointer">
                <input 
                  type="checkbox" 
                  checked={includeArchived} 
                  onChange={e => setIncludeArchived(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Include Archived</span>
              </label>
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
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={widgetShowFilters}
                  onChange={e => setWidgetShowFilters(e.target.checked)}
                  className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show Search &amp; Month Filter Bar</span>
              </label>
            </div>
          )}

          {type === 'forms' && (
            <div className="space-y-3 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-slate-500 tracking-wider uppercase">Show / Hide Forms</label>
                <div className="flex gap-2">
                  <button onClick={selectAllForms} className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline">All</button>
                  <span className="text-slate-300 dark:text-slate-600">|</span>
                  <button onClick={selectNoForms} className="text-[10px] font-bold text-slate-500 hover:underline">None</button>
                </div>
              </div>
              {!formsLoaded ? (
                <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                  <Loader2 size={12} className="animate-spin" /> Loading forms from Planning Center...
                </div>
              ) : forms.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No active forms found in Planning Center.</p>
              ) : (
                <div className="space-y-1 max-h-64 overflow-y-auto pr-1">
                  {forms.map(f => {
                    const isVisible = visibleFormIds.has(f.id);
                    return (
                      <div
                        key={f.id}
                        onClick={() => toggleFormVisibility(f.id)}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-lg border cursor-pointer transition-all ${
                          isVisible
                            ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
                            : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-80'
                        }`}
                      >
                        <span className={`shrink-0 transition-colors ${ isVisible ? 'text-indigo-500' : 'text-slate-400' }`}>
                          {isVisible ? <Eye size={14} /> : <EyeOff size={14} />}
                        </span>
                        <span className={`text-sm font-semibold flex-1 truncate ${ isVisible ? 'text-slate-900 dark:text-white' : 'text-slate-500 dark:text-slate-400 line-through' }`}>
                          {f.name}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
              <p className="text-[10px] text-slate-400 leading-relaxed">Toggle which forms appear in your embedded widget. Click a form to show or hide it.</p>
              {visibleFormIds.size === 0 && forms.length > 0 && (
                <p className="flex items-center gap-1 text-[10px] text-amber-600 dark:text-amber-400 font-semibold"><TriangleAlert size={12} className="shrink-0" aria-hidden="true" /> No forms selected — the widget will show nothing.</p>
              )}
              <div className="space-y-2.5 pt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={widgetShowFilters}
                    onChange={e => setWidgetShowFilters(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show Search Bar</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formsOpenInModal}
                    onChange={e => setFormsOpenInModal(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Open Forms in Church Center Modal</span>
                </label>
              </div>
            </div>
          )}

          {(type === 'events' || type === 'events_table') && (
            <div className="space-y-2.5 pt-4 border-t border-slate-200 dark:border-slate-700">
              <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase">Event Directory Features (Optional)</label>
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={eventShowFilters}
                  onChange={e => setEventShowFilters(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show Search &amp; Month Filter Bar</span>
              </label>
              {eventShowFilters && (
                <>
                  <label className="flex items-center gap-3 cursor-pointer pl-6">
                    <input
                      type="checkbox"
                      checked={eventShowTagFilters}
                      onChange={e => setEventShowTagFilters(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Show Ministry / Tag Pills</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer pl-6">
                    <input
                      type="checkbox"
                      checked={eventShowLocationFilters}
                      onChange={e => setEventShowLocationFilters(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Show Campus / Location Pills</span>
                  </label>
                </>
              )}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={eventShowFeaturedHero}
                  onChange={e => setEventShowFeaturedHero(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show Featured Event Hero Banner</span>
              </label>
              {type === 'events' && (
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={eventAllowViewSwitch}
                    onChange={e => setEventAllowViewSwitch(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Allow Visitor View Switcher</span>
                </label>
              )}
              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={eventShowCalendarLink}
                  onChange={e => setEventShowCalendarLink(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show &quot;Open Live Calendar&quot; Link</span>
              </label>

              <label className="flex items-center gap-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={eventShowWeeklyRhythm}
                  onChange={e => setEventShowWeeklyRhythm(e.target.checked)}
                  className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                />
                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show Weekly Rhythm / Service Times</span>
              </label>
              {eventShowWeeklyRhythm && (
                <div className="space-y-2 pl-6 pt-1">
                  <input
                    type="text"
                    placeholder="Sundays: 9:00 AM & 11:00 AM | Wednesdays: 6:00 PM"
                    value={eventWeeklyRhythmText}
                    onChange={e => setEventWeeklyRhythmText(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                  <input
                    type="url"
                    placeholder="Plan Your Visit URL (optional)"
                    value={eventPlanVisitUrl}
                    onChange={e => setEventPlanVisitUrl(e.target.value)}
                    className="w-full px-3 py-1.5 border border-slate-200 dark:border-slate-700 rounded-lg text-xs bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                  <p className="text-[10px] text-slate-400">Separate schedule items with a pipe (|).</p>
                </div>
              )}

              <div className="pt-2">
                <label className="block text-[11px] font-bold text-slate-500 tracking-wider uppercase mb-1.5">Pre-Filter by Ministry / Tag</label>
                <input
                  type="text"
                  placeholder="e.g. Youth, Women (optional)"
                  value={eventTagFilter}
                  onChange={e => setEventTagFilter(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              {type === 'events' && layout === 'poster' && (
                <div className="space-y-2.5 pt-2 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-500 tracking-wider uppercase mb-1.5">Poster Register Pill Label</label>
                    <input
                      type="text"
                      placeholder="Register"
                      value={posterCtaText}
                      onChange={e => setPosterCtaText(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                    />
                  </div>
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={posterCtaAccent}
                      onChange={e => setPosterCtaAccent(e.target.checked)}
                      className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                    />
                    <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">Use Accent Color for Poster Register Pill</span>
                  </label>
                </div>
              )}
            </div>
          )}

          {type === 'events_table' && (
            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Number of Upcoming Events</label>
                <div className="grid grid-cols-5 gap-1.5 mb-2">
                  {[
                    { value: '5', label: '5' },
                    { value: '10', label: '10' },
                    { value: '15', label: '15' },
                    { value: '25', label: '25' },
                    { value: '0', label: 'All' },
                  ].map(preset => (
                    <button
                      key={preset.value}
                      type="button"
                      onClick={() => setTableMaxEvents(preset.value)}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition ${
                        tableMaxEvents === preset.value
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400'
                          : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
                <input
                  type="number"
                  min="0"
                  placeholder="0 for all upcoming events"
                  value={tableMaxEvents}
                  onChange={e => setTableMaxEvents(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
                <p className="text-[10px] text-slate-500 mt-1">Enter 0 to show all upcoming events.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Event Source</label>
                <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setTableEventSource('calendar')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${tableEventSource === 'calendar' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    Calendar
                  </button>
                  <button
                    type="button"
                    onClick={() => setTableEventSource('registrations')}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${tableEventSource === 'registrations' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    Registrations
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Table Heading (Optional)</label>
                <input
                  type="text"
                  placeholder="e.g. Upcoming Events"
                  value={tableTitle}
                  onChange={e => setTableTitle(e.target.value)}
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Table Style</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'clean', label: 'Clean' },
                    { id: 'striped', label: 'Striped' },
                    { id: 'bordered', label: 'Bordered' },
                    { id: 'card', label: 'Card Rows' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTableStyle(opt.id as any)}
                      className={`py-2 px-3 rounded-lg border text-xs font-bold transition ${
                        tableStyle === opt.id
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400'
                          : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Header Style</label>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { id: 'accent', label: 'Solid Accent' },
                    { id: 'tinted', label: 'Soft Tinted' },
                    { id: 'minimal', label: 'Minimal' },
                    { id: 'hidden', label: 'Hidden' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTableHeaderStyle(opt.id as any)}
                      className={`py-2 px-3 rounded-lg border text-xs font-bold transition ${
                        tableHeaderStyle === opt.id
                          ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-900/30 dark:border-indigo-800 dark:text-indigo-400'
                          : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Row Density</label>
                <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                  {[
                    { id: 'compact', label: 'Compact' },
                    { id: 'comfortable', label: 'Normal' },
                    { id: 'spacious', label: 'Spacious' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTableDensity(opt.id as any)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                        tableDensity === opt.id
                          ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Corner Radius</label>
                <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                  {[
                    { id: 'none', label: 'Sharp' },
                    { id: 'md', label: 'Rounded' },
                    { id: 'xl', label: 'Pill' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTableRadius(opt.id as any)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                        tableRadius === opt.id
                          ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Date Display</label>
                <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                  {[
                    { id: 'badge', label: 'Badge' },
                    { id: 'short', label: 'Text' },
                    { id: 'numeric', label: 'Numeric' },
                  ].map(opt => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => setTableDateFormat(opt.id as any)}
                      className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${
                        tableDateFormat === opt.id
                          ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white'
                          : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="space-y-2.5">
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase">Columns & Details</label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tableShowTime}
                    onChange={e => setTableShowTime(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show Event Time</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tableShowLocation}
                    onChange={e => setTableShowLocation(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show Location Column</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tableShowDescription}
                    onChange={e => setTableShowDescription(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show Description Snippet</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={tableShowAction}
                    onChange={e => setTableShowAction(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show Action Button</span>
                </label>
              </div>

              {tableShowAction && (
                <div>
                  <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Action Button Text</label>
                  <input
                    type="text"
                    placeholder="Details"
                    value={tableCtaText}
                    onChange={e => setTableCtaText(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                  />
                </div>
              )}
            </div>
          )}

          {type === 'single_event' && (
            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Event Source</label>
                <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                  <button 
                    onClick={() => { 
                      setSingleEventSource('calendar'); 
                      setSingleEventId(''); 
                      if (singleEventCtaText === 'Register Now') setSingleEventCtaText('Learn More');
                    }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${singleEventSource==='calendar'?'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white':'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    Calendar
                  </button>
                  <button 
                    onClick={() => { 
                      setSingleEventSource('registrations'); 
                      setSingleEventId(''); 
                      if (singleEventCtaText === 'Learn More') setSingleEventCtaText('Register Now');
                    }}
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${singleEventSource==='registrations'?'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white':'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    Registrations
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Select Event</label>
                {singleEventsLoading ? (
                  <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                    <Loader2 size={14} className="animate-spin text-indigo-500" /> Loading events...
                  </div>
                ) : singleEvents.length === 0 ? (
                  <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 p-2.5 rounded-lg border border-amber-200 dark:border-amber-800">
                    No active {singleEventSource === 'calendar' ? 'calendar events' : 'registrations'} found in Planning Center.
                  </p>
                ) : (
                  <>
                    <select
                      value={singleEventId}
                      onChange={e => setSingleEventId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white font-medium mb-3"
                    >
                      {singleEvents.map(ev => (
                        <option key={ev.id} value={ev.id}>
                          {ev.name || 'Unnamed Event'} {ev.startsAt ? `(${new Date(ev.startsAt).toLocaleDateString()})` : ''}
                        </option>
                      ))}
                    </select>

                    <label className="flex items-center gap-3 cursor-pointer mb-3">
                      <input 
                        type="checkbox" 
                        checked={singleEventIsDynamic} 
                        onChange={e => setSingleEventIsDynamic(e.target.checked)}
                        className="w-5 h-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                      />
                      <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Dynamic Embed (Updates automatically)</span>
                    </label>
                    {singleEventIsDynamic && (
                       <button
                          onClick={async () => {
                             setIsSavingDynamic(true);
                             try {
                                const apiBaseUrl = process.env.NODE_ENV === 'production' ? 'https://pastoralcare.barnabassoftware.com' : 'http://localhost:8080';
                                const res = await fetch(`${apiBaseUrl}/api/public/featured-event/${churchId}`, {
                                   method: 'POST',
                                   headers: { 'Content-Type': 'application/json' },
                                   body: JSON.stringify({ eventId: singleEventId, eventSource: singleEventSource })
                                });
                                if (!res.ok) throw new Error('Failed to save');
                                showToast('Saved as Featured Event! Website widgets using Dynamic Embed will now show this event.');
                             } catch (e) {
                                showToast('Error saving featured event.');
                             } finally {
                                setIsSavingDynamic(false);
                             }
                          }}
                          disabled={isSavingDynamic}
                          className="w-full py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-lg text-sm transition disabled:opacity-50"
                       >
                          {isSavingDynamic ? 'Saving...' : 'Set as Featured Event'}
                       </button>
                    )}

                    {(() => {
                      const sel = singleEvents.find(e => String(e.id) === String(singleEventId)) || singleEvents[0];
                      const hasUrl = Boolean(sel?.publicUrl || sel?.churchCenterUrl);
                      if (sel && !hasUrl) {
                        return (
                          <p className="text-[11px] font-semibold text-amber-600 dark:text-amber-400 mt-2 flex items-start gap-1">
                            <Info size={12} className="shrink-0 mt-px" aria-hidden="true" /> Note: This event has no public URL in Planning Center. The widget will display "No Registration Required".
                          </p>
                        );
                      }
                      return null;
                    })()}
                  </>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Card Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'hero', label: 'Hero' },
                    { id: 'card', label: 'Card' },
                    { id: 'compact', label: 'Compact' },
                  ].map(st => (
                    <button
                      key={st.id}
                      onClick={() => setSingleEventStyle(st.id as any)}
                      className={`py-2 px-1 text-xs font-bold rounded-lg border text-center transition ${singleEventStyle === st.id ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 font-bold' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'}`}
                    >
                      {st.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Button Text</label>
                <input
                  type="text"
                  value={singleEventCtaText}
                  onChange={e => setSingleEventCtaText(e.target.value)}
                  placeholder="e.g. Register Now, Learn More"
                  className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                />
              </div>

              <div className="space-y-3 pt-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={singleEventShowCountdown} 
                    onChange={e => setSingleEventShowCountdown(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show Countdown Ticker</span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer">
                  <input 
                    type="checkbox" 
                    checked={singleEventShowLocation} 
                    onChange={e => setSingleEventShowLocation(e.target.checked)}
                    className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-600"
                  />
                  <span className="text-sm font-semibold text-slate-700 dark:text-slate-300">Show Location / Address</span>
                </label>
              </div>
            </div>
          )}

          {type === 'popup' && (
            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div>
                 <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Select a Form</label>
                 <select 
                    value={forms.find(f => f.publicUrl === popupUrl)?.id || ''}
                    onChange={e => {
                        const selected = forms.find(f => f.id === e.target.value);
                        if (selected && selected.publicUrl) {
                            setPopupUrl(selected.publicUrl);
                            if (popupText === 'Open Form') setPopupText(`Open ${selected.name}`);
                        } else if (!e.target.value) {
                            setPopupUrl('');
                            if (popupText.startsWith('Open ')) setPopupText('Open Form');
                        }
                    }}
                    className="w-full px-3 py-2 mb-4 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                 >
                    <option value="">-- Choose from Planning Center --</option>
                    {forms.map(f => (
                      <option key={f.id} value={f.id}>{f.name}</option>
                    ))}
                 </select>

                 <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Or paste a custom Church Center URL</label>
                 <input 
                    type="url"
                    placeholder="https://yourchurch.churchcenter.com/people/forms/123" 
                    value={popupUrl}
                    onChange={e => setPopupUrl(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                 />
                 <p className="text-[10px] text-slate-400 mt-1">Select a form above or paste any Church Center link here.</p>
              </div>
              <div>
                 <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Button Text</label>
                 <input 
                    type="text"
                    placeholder="Open Form" 
                    value={popupText}
                    onChange={e => setPopupText(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                 />
              </div>
            </div>
          )}

          {type === 'bubble_form' && (
            <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-700">
              <div>
                 <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Select a Custom Form</label>
                 {!customFormsLoaded ? (
                   <div className="flex items-center gap-2 text-xs text-slate-400 py-2">
                     <Loader2 size={12} className="animate-spin" /> Loading custom forms...
                   </div>
                 ) : customForms.length === 0 ? (
                   <p className="text-xs text-slate-400 italic">No custom forms found. Create one in the Forms tab.</p>
                 ) : (
                   <select 
                      value={bubbleFormId}
                      onChange={e => setBubbleFormId(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                   >
                      {customForms.map(f => (
                        <option key={f.id} value={f.id}>{f.name}</option>
                      ))}
                   </select>
                 )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Display Mode</label>
                <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                  <button 
                    onClick={() => setBubbleMode('text')} 
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${bubbleMode === 'text' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    Text Label
                  </button>
                  <button 
                    onClick={() => setBubbleMode('icon')} 
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${bubbleMode === 'icon' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    Icon Only
                  </button>
                </div>
              </div>

              {bubbleMode === 'text' ? (
                <div>
                   <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Button Text</label>
                   <input 
                      type="text"
                      placeholder="Plan a Visit" 
                      value={bubbleText}
                      onChange={e => setBubbleText(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                   />
                </div>
              ) : (
                <div>
                  <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Select Icon</label>
                  <div className="grid grid-cols-4 gap-2">
                    {['👋', '⛪️', '✝️', '☕️', '💬', '📅', '✨', '📝'].map(icon => (
                      <button
                        key={icon}
                        onClick={() => setBubbleIcon(icon)}
                        className={`py-2 text-xl rounded-lg border transition ${bubbleIcon === icon ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-300 dark:border-indigo-600' : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 hover:border-slate-300'}`}
                      >
                        {icon}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              <div>
                 <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Hover Tooltip Text</label>
                 <input 
                    type="text"
                    placeholder="Plan a Visit with us!" 
                    value={bubbleHoverText}
                    onChange={e => setBubbleHoverText(e.target.value)}
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-lg text-sm bg-white dark:bg-slate-900 text-slate-900 dark:text-white"
                 />
                 <p className="text-[10px] text-slate-400 mt-1">This text appears when visitors hover over the button.</p>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-500 tracking-wider uppercase mb-2">Screen Position</label>
                <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                  <button 
                    onClick={() => setBubblePosition('left')} 
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${bubblePosition === 'left' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    Bottom Left
                  </button>
                  <button 
                    onClick={() => setBubblePosition('right')} 
                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition ${bubblePosition === 'right' ? 'bg-white dark:bg-slate-700 shadow-sm text-slate-900 dark:text-white' : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'}`}
                  >
                    Bottom Right
                  </button>
                </div>
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
                    <span className="text-xs font-bold tracking-wide uppercase">Live Preview</span>
                    <div className="flex items-center gap-1 bg-white dark:bg-slate-900 p-1 rounded-lg border border-slate-200 dark:border-slate-800">
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('desktop')}
                        title="Desktop width"
                        className={`p-1.5 rounded-md transition ${previewDevice === 'desktop' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                      >
                        <Monitor size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('tablet')}
                        title="Tablet width"
                        className={`p-1.5 rounded-md transition ${previewDevice === 'tablet' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                      >
                        <Tablet size={14} />
                      </button>
                      <button
                        type="button"
                        onClick={() => setPreviewDevice('mobile')}
                        title="Mobile width"
                        className={`p-1.5 rounded-md transition ${previewDevice === 'mobile' ? 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                      >
                        <Smartphone size={14} />
                      </button>
                    </div>
                 </div>
                 <div className={`flex-1 rounded-2xl border-4 border-slate-200 dark:border-slate-800 overflow-hidden shadow-2xl bg-white dark:bg-slate-900 flex items-center justify-center transition-all duration-200 mx-auto ${
                   previewDevice === 'mobile'
                     ? 'w-full max-w-[390px]'
                     : previewDevice === 'tablet'
                     ? 'w-full max-w-[768px]'
                     : layout === 'list' && type !== 'popup'
                     ? 'max-w-3xl w-full'
                     : 'w-full'
                 }`}>
                    {type === 'popup' ? (
                        <div className="text-center p-8">
                            <a href={popupUrl || '#'} target="_blank" rel="noreferrer" style={{ display: 'inline-block', padding: '12px 24px', backgroundColor: btnColor, color: '#ffffff', fontFamily: 'sans-serif', fontWeight: 'bold', borderRadius: '8px', textDecoration: 'none', cursor: 'pointer' }}>
                                {popupText || 'Open Form'}
                            </a>
                            <p className="mt-6 max-w-sm mx-auto text-xs text-slate-400">Note: The popup won't trigger in this dashboard. When added to your real website, clicking this will dim the background and securely open the form inside a Church Center modal.</p>
                        </div>
                    ) : type === 'bubble_form' ? (
                        <div className="w-full h-full relative bg-slate-50 dark:bg-slate-900 border-none rounded-xl">
                           <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 text-slate-400 text-sm">
                             (Website Content Preview)
                           </div>
                           <div 
                             className={`absolute bottom-6 ${bubblePosition === 'left' ? 'left-6' : 'right-6'} flex items-center justify-center shadow-2xl cursor-pointer`}
                             title={bubbleHoverText}
                             style={{ 
                               backgroundColor: btnColor, 
                               color: '#ffffff', 
                               borderRadius: bubbleMode === 'icon' ? '50%' : '24px',
                               padding: bubbleMode === 'icon' ? '0' : '12px 24px',
                               width: bubbleMode === 'icon' ? '60px' : 'auto',
                               height: bubbleMode === 'icon' ? '60px' : 'auto',
                               fontSize: bubbleMode === 'icon' ? '28px' : '16px',
                               fontWeight: 'bold',
                               fontFamily: 'sans-serif'
                             }}
                           >
                             {bubbleMode === 'icon' ? bubbleIcon : bubbleText || 'Plan a Visit'}
                           </div>
                        </div>
                    ) : (
                        <iframe 
                          id="widget-preview"
                          src={iframeUrl}
                          title="Widget Preview"
                          className="w-full h-full border-none"
                        />
                    )}
                 </div>
             </div>

             {/* Code Snippets */}
             <div className="shrink-0 bg-white dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700 p-6 space-y-4">
                
              {type === 'popup' ? (
                <div className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 rounded-xl relative group">
                    <span className="absolute top-0 right-0 -translate-y-1/2 translate-x-2 bg-indigo-100 text-indigo-800 dark:bg-indigo-900/50 dark:text-indigo-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">HTML Embed</span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                        <Code size={16} className="text-slate-400" />
                        Pop Up Link Snippet
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Copy and paste this HTML anywhere on your website. It includes the button and the required Church Center modal script.</p>
                    <div className="bg-slate-900 p-3 rounded-lg break-all text-[11px] text-slate-300 font-mono">
                        {popupHtml}
                    </div>
                    <button 
                        onClick={() => copyToClipboard(popupHtml, true)}
                        className="absolute bottom-4 right-4 p-2 bg-white/10 hover:bg-white/20 text-white rounded-lg transition"
                    >
                        {copiedScript ? <CheckCircle size={16} className="text-emerald-400" /> : <Copy size={16} />}
                    </button>
                </div>
              ) : type === 'bubble_form' ? (
                <div className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 rounded-xl relative group">
                    <span className="absolute top-0 right-0 -translate-y-1/2 translate-x-2 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">Recommended</span>
                    <h4 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-2">
                        <Code size={16} className="text-slate-400" />
                        Bubble Script Embed
                    </h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mb-3">Add this script to the <code>&lt;body&gt;</code> of your website. It will automatically create the floating button and handle the form popup.</p>
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
              ) : (
                <div className="flex items-start gap-4">
                    <div className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 p-4 rounded-xl relative group">
                        <span className="absolute top-0 right-0 -translate-y-1/2 translate-x-2 bg-emerald-100 text-emerald-800 dark:bg-emerald-900/50 dark:text-emerald-400 px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide">Recommended</span>
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
              )}

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
