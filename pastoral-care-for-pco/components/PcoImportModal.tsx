import React, { useState, useEffect } from 'react';
import { X, Search, Loader2, CalendarDays, Users, ClipboardList, CheckSquare, Square } from 'lucide-react';
import { pcoService } from '../services/pcoService';
import { EmailBlock } from './EmailBuilder';

// ─── Types ───────────────────────────────────────────────────────────────────

type PcoTab = 'registrations' | 'groups' | 'calendar';

interface PcoItem {
  id: string;
  name: string;
  description?: string;
  date?: string;       // formatted display date
  imageUrl?: string;
  meta?: string;       // e.g. "32 members", "Public"
  raw: any;
}

interface Props {
  churchId: string;
  onInsert: (blocks: EmailBlock[]) => void;
  onClose: () => void;
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const formatDate = (iso?: string): string => {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  } catch { return ''; }
};

const firstImageUrl = (attrs: any): string | undefined => {
  // Registrations: logo_url or image_url
  if (attrs?.logo_url) return attrs.logo_url;
  if (attrs?.image_url) return attrs.image_url;
  // Calendar events: image_url
  if (attrs?.image?.thumbnail) return attrs.image.thumbnail;
  return undefined;
};

// Map a raw PCO API item into our flat PcoItem shape for each tab
const mapRegistration = (item: any): PcoItem => ({
  id: item.id,
  name: item.attributes?.name || 'Unnamed Event',
  description: item.attributes?.description || '',
  date: (() => {
    const start = item.attributes?.starts_at || item.attributes?.start;
    return start ? formatDate(start) : '';
  })(),
  imageUrl: firstImageUrl(item.attributes),
  meta: item.attributes?.open_signup ? 'Open registration' : 'Closed',
  raw: item
});

const mapGroup = (item: any): PcoItem => ({
  id: item.id,
  name: item.attributes?.name || 'Unnamed Group',
  description: item.attributes?.description || '',
  imageUrl: item.attributes?.header_image?.medium || item.attributes?.header_image?.thumbnail,
  meta: `${item.attributes?.memberships_count ?? '?'} members · ${item.attributes?.schedule || 'No schedule'}`,
  raw: item
});

const mapCalendar = (item: any): PcoItem => ({
  id: item.id,
  name: item.attributes?.name || 'Unnamed Event',
  description: item.attributes?.description || '',
  date: (() => {
    const start = item.attributes?.starts_at || item.attributes?.start_time;
    return start ? formatDate(start) : '';
  })(),
  imageUrl: item.attributes?.image_url,
  meta: item.attributes?.location || '',
  raw: item
});

// Build an EmailBlock from a selected item
const buildBlock = (tab: PcoTab, item: PcoItem, selected: boolean): EmailBlock => {
  const type = tab === 'registrations' ? 'pco_registration' :
               tab === 'groups'        ? 'pco_group' :
                                         'pco_event';
  return {
    id: `pco_${item.id}_${Date.now()}`,
    type,
    content: {
      name: item.name,
      description: item.description,
      date: item.date,
      imageUrl: item.imageUrl,
      meta: item.meta,
      pcoId: item.id
    }
  };
};

// ─── Item Card ───────────────────────────────────────────────────────────────

const ItemCard: React.FC<{
  item: PcoItem;
  isSelected: boolean;
  onToggle: () => void;
}> = ({ item, isSelected, onToggle }) => {
  const stripTags = (html: string) => html?.replace(/<[^>]*>/g, '').trim() || '';
  return (
  <button
    onClick={onToggle}
    className={`w-full flex items-start gap-3 p-3 rounded-xl border transition text-left mb-2 ${
      isSelected
        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/30 dark:border-indigo-500'
        : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:border-indigo-300 dark:hover:border-indigo-600'
    }`}
  >
    {/* Thumbnail */}
    {item.imageUrl ? (
      <img
        src={item.imageUrl}
        alt={item.name}
        className="w-14 h-14 rounded-lg object-cover shrink-0 bg-slate-100"
        onError={e => { (e.target as HTMLImageElement).style.display = 'none'; }}
      />
    ) : (
      <div className="w-14 h-14 rounded-lg bg-gradient-to-br from-indigo-100 to-indigo-200 dark:from-indigo-900/40 dark:to-indigo-800/40 shrink-0 flex items-center justify-center">
        <CalendarDays size={22} className="text-indigo-400" />
      </div>
    )}

    {/* Info */}
    <div className="flex-grow min-w-0">
      <div className="font-semibold text-sm text-slate-900 dark:text-white truncate">{item.name}</div>
      {item.date && (
        <div className="text-xs text-indigo-600 dark:text-indigo-400 font-medium mt-0.5">{item.date}</div>
      )}
      {item.description && (
        <div className="text-xs text-slate-500 dark:text-slate-400 mt-1 line-clamp-2">{stripTags(item.description)}</div>
      )}
      {item.meta && (
        <div className="text-xs text-slate-400 dark:text-slate-500 mt-1">{stripTags(item.meta)}</div>
      )}
    </div>

    {/* Checkbox */}
    <div className="shrink-0 mt-0.5">
      {isSelected
        ? <CheckSquare size={18} className="text-indigo-600 dark:text-indigo-400" />
        : <Square size={18} className="text-slate-300 dark:text-slate-600" />
      }
    </div>
  </button>
  );
};

// ─── Main Modal ──────────────────────────────────────────────────────────────

export const PcoImportModal: React.FC<Props> = ({ churchId, onInsert, onClose }) => {
  const [tab, setTab] = useState<PcoTab>('registrations');
  const [items, setItems] = useState<Record<PcoTab, PcoItem[]>>({
    registrations: [], groups: [], calendar: []
  });
  const [loading, setLoading] = useState<Record<PcoTab, boolean>>({
    registrations: false, groups: false, calendar: false
  });
  const [errors, setErrors] = useState<Record<PcoTab, string>>({
    registrations: '', groups: '', calendar: ''
  });
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [search, setSearch] = useState('');

  // Fetch on tab change (lazy, cached)
  useEffect(() => {
    if (items[tab].length > 0 || loading[tab]) return;
    setLoading(p => ({ ...p, [tab]: true }));
    setErrors(p => ({ ...p, [tab]: '' }));

    const fetch = async () => {
      try {
        let raw: any[] = [];
        if (tab === 'registrations') {
          raw = await pcoService.getRegistrations(churchId);
          setItems(p => ({ ...p, registrations: (raw || []).map(mapRegistration) }));
        } else if (tab === 'groups') {
          raw = await pcoService.getGroups(churchId);
          setItems(p => ({ ...p, groups: (raw || []).map(mapGroup) }));
        } else {
          raw = await pcoService.getEvents(churchId);
          setItems(p => ({ ...p, calendar: (raw || []).map(mapCalendar) }));
        }
      } catch (e: any) {
        setErrors(p => ({ ...p, [tab]: e?.message || 'Failed to load PCO data.' }));
      } finally {
        setLoading(p => ({ ...p, [tab]: false }));
      }
    };

    fetch();
  }, [tab, churchId]);

  const toggleSelected = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const handleInsert = () => {
    const newBlocks: EmailBlock[] = [];
    // Maintain insertion order by tab
    (['registrations', 'groups', 'calendar'] as PcoTab[]).forEach(t => {
      items[t].filter(i => selected.has(i.id)).forEach(i => {
        newBlocks.push(buildBlock(t, i, true));
      });
    });
    onInsert(newBlocks);
  };

  const filtered = (items[tab] || []).filter(i =>
    !search.trim() || i.name.toLowerCase().includes(search.toLowerCase())
  );

  const TAB_INFO: Record<PcoTab, { label: string; icon: React.ReactNode }> = {
    registrations: { label: 'Registrations', icon: <ClipboardList size={14} /> },
    groups:        { label: 'Groups',        icon: <Users size={14} /> },
    calendar:      { label: 'Calendar',      icon: <CalendarDays size={14} /> },
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[85vh]">

        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
          <div className="flex items-center gap-2">
            <img src="https://planningcenter.com/favicon.ico" alt="PCO" className="w-4 h-4" />
            <h2 className="text-base font-bold text-slate-900 dark:text-white">Import Content from Planning Center</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-700 transition">
            <X size={18} />
          </button>
        </div>

        {/* Sub-header description */}
        <p className="text-xs text-slate-500 dark:text-slate-400 px-5 pt-3 pb-0 shrink-0">
          Select Calendar Events, Groups, and Registrations to insert into your email.
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
              placeholder={`Search ${TAB_INFO[tab].label.toLowerCase()}…`}
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full pl-8 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
        </div>

        {/* Item list */}
        <div className="flex-1 overflow-y-auto px-5 py-4 min-h-0">
          {loading[tab] ? (
            <div className="flex items-center justify-center h-40 text-slate-400 gap-2">
              <Loader2 size={20} className="animate-spin" /> Loading from Planning Center…
            </div>
          ) : errors[tab] ? (
            <div className="flex items-center justify-center h-40 text-center">
              <div>
                <p className="text-red-500 text-sm font-medium">{errors[tab]}</p>
                {(errors[tab].includes('404') || errors[tab].includes('Not Found')) && tab === 'registrations' ? (
                  <p className="text-slate-400 text-xs mt-2 max-w-xs">
                    Your Planning Center account needs to be reconnected to grant Registrations access.
                    Go to <strong>Settings → Planning Center</strong> and click <strong>Setup Integration</strong> to reconnect.
                  </p>
                ) : (
                  <p className="text-slate-400 text-xs mt-1">Make sure PCO is connected in Settings.</p>
                )}
              </div>
            </div>
          ) : filtered.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-40 text-slate-400">
              <CalendarDays size={36} className="mb-2 text-slate-300" />
              <p className="text-sm">No {TAB_INFO[tab].label.toLowerCase()} found</p>
            </div>
          ) : (
            filtered.map(item => (
              <ItemCard
                key={item.id}
                item={item}
                isSelected={selected.has(item.id)}
                onToggle={() => toggleSelected(item.id)}
              />
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
