import React, { useMemo, useState, useCallback } from 'react';
import { PcoPerson, PeopleDashboardData, PastoralNote, CareFollowUpLog, RiskSettings } from '../types';
import { DEFAULT_RISK_SETTINGS } from '../services/riskService';
import { Download, Search, ChevronUp, ChevronDown, ChevronsUpDown, MessageSquare, Filter, X, Phone, CheckCircle2, Trash2, Send } from 'lucide-react';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

function daysSince(dateStr?: string | null): number | null {
    if (!dateStr) return null;
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return null;
    return Math.floor((Date.now() - d.getTime()) / 86400000);
}

function formatDate(dateStr?: string | null): string {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMonthDay(dateStr?: string | null): string | null {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length < 2) return null;
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2] || '1', 10);
    const d = new Date(2000, month, day);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function isUpcomingAnnual(dateStr?: string | null, withinDays = 30): boolean {
    if (!dateStr) return false;
    const parts = dateStr.split('-');
    if (parts.length < 2) return false;
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2] || '1', 10);
    const today = new Date();
    let next = new Date(today.getFullYear(), month, day);
    if (next < today) next = new Date(today.getFullYear() + 1, month, day);
    const diff = next.getTime() - today.getTime();
    return diff >= 0 && diff <= withinDays * 86400000;
}

function escapeCsvCell(val: string | number | null | undefined): string {
    if (val === null || val === undefined) return '';
    const s = String(val);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
        return `"${s.replace(/"/g, '""')}"`;
    }
    return s;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SortKey =
    | 'name' | 'urgency' | 'riskScore' | 'riskCategory'
    | 'lastContact' | 'daysSince' | 'notesCount' | 'membership';

type SortDir = 'asc' | 'desc';

type LastContactFilter = 'all' | 'never' | '30plus' | '90plus' | '1yearplus';

const NOTE_TYPES: PastoralNote['type'][] = ['Call', 'Visit', 'Meeting', 'Note', 'Crisis', 'Hospital'];

const noteTypeEmoji: Record<string, string> = {
    Visit: '🏠', Call: '📞', Meeting: '🤝',
    Note: '📝', Crisis: '🚨', Hospital: '🏥',
};

interface EnrichedRow {
    person: PcoPerson;
    lastNote: PastoralNote | null;
    lastTouchpoint: PastoralNote | null;
    noteCount: number;
    daysSinceContact: number; // 9999 = never
    urgencyScore: number;
    followedUpRecently: boolean;
    dismissed: boolean;
    allNotes: PastoralNote[];
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface CareReportPageProps {
    peopleData: PeopleDashboardData | null;
    notes: PastoralNote[];
    followUpLog: CareFollowUpLog[];
    riskSettings?: RiskSettings;
    onAddNote?: (personId: string, type: PastoralNote['type'], content: string) => Promise<void>;
    onMarkFollowedUp?: (personId: string) => void;
    onDismiss?: (personId: string, signal: string) => void;
}

// ---------------------------------------------------------------------------
// CSV Export
// ---------------------------------------------------------------------------

function exportToCSV(rows: EnrichedRow[], filename: string) {
    const today = new Date().toISOString().split('T')[0];
    const headers = [
        'Name', 'Email', 'Phone', 'Membership', 'Status',
        'Risk Category', 'Risk Score',
        'Last Care Contact', 'Contact Type', 'Days Since Contact',
        'Last Touchpoint', 'Touchpoint Type',
        'Notes Count', 'Last Note', 'All Notes', 'Followed Up Recently', 'Birthday', 'Anniversary',
    ];
    const csvRows = rows.map(({ person, lastNote, lastTouchpoint, daysSinceContact, noteCount, allNotes, followedUpRecently }) => {
        const notesStr = allNotes.map(n => `[${formatDate(n.date)} - ${n.type}] ${n.content}`).join('\n\n');
        return [
            escapeCsvCell(person.name),
            escapeCsvCell(person.email),
            escapeCsvCell(person.phone),
            escapeCsvCell(person.membership),
            escapeCsvCell(person.status),
            escapeCsvCell(person.riskProfile?.category),
            escapeCsvCell(person.riskProfile?.score),
            escapeCsvCell(lastNote?.date),
            escapeCsvCell(lastNote?.type),
            escapeCsvCell(daysSinceContact === 9999 ? 'Never' : daysSinceContact),
            escapeCsvCell(lastTouchpoint?.date),
            escapeCsvCell(lastTouchpoint?.tags?.includes('no-answer') ? 'No Answer' : lastTouchpoint?.type),
            escapeCsvCell(noteCount),
            escapeCsvCell(lastNote?.content),
            escapeCsvCell(notesStr),
            escapeCsvCell(followedUpRecently ? 'Yes' : 'No'),
            escapeCsvCell(person.birthdate),
            escapeCsvCell(person.anniversary),
        ].join(',');
    });

    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

// ---------------------------------------------------------------------------
// Sort icon
// ---------------------------------------------------------------------------

const SortIcon: React.FC<{ col: SortKey; active: SortKey; dir: SortDir }> = ({ col, active, dir }) => {
    if (active !== col) return <ChevronsUpDown size={11} className="text-slate-300 dark:text-slate-600 ml-1 inline-block" />;
    return dir === 'asc'
        ? <ChevronUp size={11} className="text-indigo-500 ml-1 inline-block" />
        : <ChevronDown size={11} className="text-indigo-500 ml-1 inline-block" />;
};

// ---------------------------------------------------------------------------
// Inline Contact Form (renders as an extra row below the target person)
// ---------------------------------------------------------------------------

interface InlineContactFormProps {
    person: PcoPerson;
    onSave: (type: PastoralNote['type'], content: string) => Promise<void>;
    onCancel: () => void;
    colSpan: number;
}

const InlineContactForm: React.FC<InlineContactFormProps> = ({ person, onSave, onCancel, colSpan }) => {
    const [contactType, setContactType] = useState<PastoralNote['type']>('Call');
    const [content, setContent] = useState('');
    const [saving, setSaving] = useState(false);

    const handleSave = async () => {
        if (!content.trim()) return;
        setSaving(true);
        try { await onSave(contactType, content); } finally { setSaving(false); }
    };

    return (
        <tr className="bg-indigo-50/60 dark:bg-indigo-950/20 border-b border-indigo-100 dark:border-indigo-900/30">
            <td colSpan={colSpan} className="px-4 py-4">
                <div className="flex flex-col gap-3">
                    {/* Header */}
                    <div className="flex items-center gap-2">
                        {person.avatar
                            ? <img src={person.avatar} alt={person.name} className="w-6 h-6 rounded-full object-cover" />
                            : <div className="w-6 h-6 rounded-full bg-indigo-200 dark:bg-indigo-800 flex items-center justify-center text-[9px] font-black text-indigo-700 dark:text-indigo-300">{person.name.substring(0, 2).toUpperCase()}</div>
                        }
                        <span className="text-xs font-black text-slate-700 dark:text-slate-200">
                            Log Contact — <span className="text-indigo-600 dark:text-indigo-400">{person.name}</span>
                        </span>
                    </div>

                    <div className="flex flex-wrap gap-3 items-start">
                        {/* Contact type picker */}
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Contact Type</span>
                            <div className="flex flex-wrap gap-1">
                                {NOTE_TYPES.map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setContactType(t)}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                            contactType === t
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-indigo-400 hover:text-indigo-600'
                                        }`}
                                    >
                                        {noteTypeEmoji[t]} {t}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Note textarea */}
                        <div className="flex-1 min-w-[240px] flex flex-col gap-1.5">
                            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Note (optional)</span>
                            <textarea
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                placeholder="Brief note about this contact…"
                                rows={2}
                                autoFocus
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 resize-none outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
                            />
                        </div>

                        {/* Actions */}
                        <div className="flex items-end gap-2 pb-0.5">
                            <button
                                onClick={handleSave}
                                disabled={saving || !content.trim()}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[10px] font-black uppercase tracking-widest transition-all"
                            >
                                {saving ? <span className="animate-spin text-xs">⏳</span> : <Send size={11} />}
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                                onClick={onCancel}
                                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-black uppercase tracking-widest hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                            >
                                <X size={11} /> Cancel
                            </button>
                        </div>
                    </div>
                </div>
            </td>
        </tr>
    );
};

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export const CareReportPage: React.FC<CareReportPageProps> = ({
    peopleData,
    notes,
    followUpLog,
    riskSettings = DEFAULT_RISK_SETTINGS,
    onAddNote,
    onMarkFollowedUp,
    onDismiss,
}) => {
    // --- Filters ---
    const [search, setSearch] = useState('');
    const [riskFilter, setRiskFilter] = useState<'all' | 'Healthy' | 'At Risk' | 'Disconnected'>('all');
    const [membershipFilter, setMembershipFilter] = useState('all');
    const [lastContactFilter, setLastContactFilter] = useState<LastContactFilter>('all');
    const [hasNotesFilter, setHasNotesFilter] = useState<'all' | 'has' | 'none'>('all');
    const [upcomingOnly, setUpcomingOnly] = useState(false);
    const [showDismissed, setShowDismissed] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(true);

    // --- Sort ---
    const [sortKey, setSortKey] = useState<SortKey>('urgency');
    const [sortDir, setSortDir] = useState<SortDir>('desc');

    // --- Active inline form: personId or null ---
    const [activeFormPersonId, setActiveFormPersonId] = useState<string | null>(null);

    const handleSort = useCallback((key: SortKey) => {
        setSortKey(prev => {
            if (prev === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return key; }
            setSortDir('desc');
            return key;
        });
    }, []);

    // --- Build last-note map and count map ---
    //
    // Notes saved at different points in time may have personId stored as either:
    //   - raw PCO ID:       "12345678"
    //   - composite ID:     "churchABC_12345678"  (older format)
    //
    // person.id from allPeople is always the raw PCO ID.
    // To tolerate both formats we index each note under BOTH keys so the
    // lookup (person.id → note) always hits regardless of what was saved.
    const allNotesMap = useMemo(() => {
        const m = new Map<string, PastoralNote[]>();
        notes.forEach(n => {
            const raw = n.personId;
            const bare = raw.includes('_') ? raw.split('_').slice(1).join('_') : raw;
            if (!m.has(raw)) m.set(raw, []);
            m.get(raw)!.push(n);
            if (bare !== raw) {
                if (!m.has(bare)) m.set(bare, []);
                m.get(bare)!.push(n);
            }
        });
        return m;
    }, [notes]);

    const lastNoteMap = useMemo(() => {
        const m = new Map<string, PastoralNote>();
        notes.forEach(n => {
            if (n.tags?.includes('no-answer')) return; // skip no-answers
            const raw = n.personId;
            const bare = raw.includes('_') ? raw.split('_').slice(1).join('_') : raw;
            if (!m.has(raw))  m.set(raw,  n);
            if (!m.has(bare)) m.set(bare, n);
        });
        return m;
    }, [notes]);

    const lastTouchpointMap = useMemo(() => {
        const m = new Map<string, PastoralNote>();
        notes.forEach(n => {
            const raw = n.personId;
            const bare = raw.includes('_') ? raw.split('_').slice(1).join('_') : raw;
            if (!m.has(raw))  m.set(raw,  n);
            if (!m.has(bare)) m.set(bare, n);
        });
        return m;
    }, [notes]);

    const noteCountMap = useMemo(() => {
        const m = new Map<string, number>();
        notes.forEach(n => {
            const raw  = n.personId;
            const bare = raw.includes('_') ? raw.split('_').slice(1).join('_') : raw;
            m.set(raw,  (m.get(raw)  || 0) + 1);
            // Only count once — don't double-count if raw === bare
            if (bare !== raw) m.set(bare, (m.get(bare) || 0) + 1);
        });
        return m;
    }, [notes]);

    const followUpMap = useMemo(() => {
        const m = new Map<string, CareFollowUpLog>();
        followUpLog.forEach(e => m.set(e.personId, e));
        return m;
    }, [followUpLog]);

    const membershipOptions = useMemo(() => {
        if (!peopleData) return [];
        const s = new Set<string>();
        peopleData.allPeople.forEach(p => {
            if (p.status?.toLowerCase() !== 'inactive') s.add(p.membership || 'None');
        });
        return Array.from(s).sort();
    }, [peopleData]);

    // --- Build enriched rows ---
    const allRows = useMemo<EnrichedRow[]>(() => {
        if (!peopleData) return [];
        const now = Date.now();
        return peopleData.allPeople
            .filter(p => p.status?.toLowerCase() !== 'inactive')
            .map(person => {
                const lastNote = lastNoteMap.get(person.id) ?? null;
                const lastTouchpoint = lastTouchpointMap.get(person.id) ?? null;
                const noteCount = noteCountMap.get(person.id) ?? 0;
                const raw = lastNote ? daysSince(lastNote.date) : null;
                const days = raw ?? 9999;
                const riskScore = person.riskProfile?.score ?? 0;
                const urgency = days * (1 + (100 - riskScore) / 100);
                const logEntry = followUpMap.get(person.id);
                const followedUpRecently = !!(logEntry?.followedUpAt && (now - logEntry.followedUpAt) < SEVEN_DAYS_MS);
                const dismissed = !!(logEntry?.dismissedAt);
                const allNotes = allNotesMap.get(person.id) || [];
                return { person, lastNote, lastTouchpoint, noteCount, daysSinceContact: days, urgencyScore: urgency, followedUpRecently, dismissed, allNotes };
            });
    }, [peopleData, lastNoteMap, lastTouchpointMap, noteCountMap, followUpMap, allNotesMap]);

    // --- Filter rows ---
    const filteredRows = useMemo(() => {
        return allRows.filter(({ person, lastNote, noteCount, daysSinceContact, dismissed }) => {
            // Dismissal filter
            if (dismissed && !showDismissed) return false;
            if (search) {
                const q = search.toLowerCase();
                if (!person.name.toLowerCase().includes(q)
                    && !(person.email || '').toLowerCase().includes(q)
                    && !(person.phone || '').includes(q)) return false;
            }
            if (riskFilter !== 'all' && person.riskProfile?.category !== riskFilter) return false;
            if (membershipFilter !== 'all' && (person.membership || 'None') !== membershipFilter) return false;
            if (lastContactFilter !== 'all') {
                if (lastContactFilter === 'never' && daysSinceContact !== 9999) return false;
                if (lastContactFilter === '30plus' && daysSinceContact < 30) return false;
                if (lastContactFilter === '90plus' && daysSinceContact < 90) return false;
                if (lastContactFilter === '1yearplus' && daysSinceContact < 365) return false;
            }
            if (hasNotesFilter === 'has' && noteCount === 0) return false;
            if (hasNotesFilter === 'none' && noteCount > 0) return false;
            if (upcomingOnly && !isUpcomingAnnual(person.birthdate) && !isUpcomingAnnual(person.anniversary)) return false;
            return true;
        });
    }, [allRows, search, riskFilter, membershipFilter, lastContactFilter, hasNotesFilter, upcomingOnly, showDismissed]);

    // --- Sort ---
    const sortedRows = useMemo(() => {
        const mult = sortDir === 'asc' ? 1 : -1;
        return [...filteredRows].sort((a, b) => {
            switch (sortKey) {
                case 'name': return mult * a.person.name.localeCompare(b.person.name);
                case 'urgency': return mult * (a.urgencyScore - b.urgencyScore);
                case 'riskScore': return mult * ((a.person.riskProfile?.score ?? 0) - (b.person.riskProfile?.score ?? 0));
                case 'riskCategory': {
                    const o = { Healthy: 0, 'At Risk': 1, Disconnected: 2 };
                    return mult * ((o[a.person.riskProfile?.category as keyof typeof o] ?? 1) - (o[b.person.riskProfile?.category as keyof typeof o] ?? 1));
                }
                case 'lastContact': case 'daysSince': return mult * (a.daysSinceContact - b.daysSinceContact);
                case 'notesCount': return mult * (a.noteCount - b.noteCount);
                case 'membership': return mult * (a.person.membership || '').localeCompare(b.person.membership || '');
                default: return 0;
            }
        });
    }, [filteredRows, sortKey, sortDir]);

    // --- Summary stats ---
    const stats = useMemo(() => {
        const never = filteredRows.filter(r => r.daysSinceContact === 9999).length;
        const over90 = filteredRows.filter(r => r.daysSinceContact >= 90 && r.daysSinceContact < 9999).length;
        const withDays = filteredRows.filter(r => r.daysSinceContact < 9999);
        const avg = withDays.length > 0
            ? Math.round(withDays.reduce((s, r) => s + r.daysSinceContact, 0) / withDays.length)
            : null;
        const dismissed = allRows.filter(r => r.dismissed).length;
        return { never, over90, avg, total: filteredRows.length, dismissed };
    }, [filteredRows, allRows]);

    const ThCol: React.FC<{ label: string; col: SortKey; className?: string }> = ({ label, col, className }) => (
        <th
            onClick={() => handleSort(col)}
            className={`p-2 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800 cursor-pointer select-none hover:text-indigo-500 transition-colors whitespace-nowrap ${className ?? ''}`}
        >
            {label}<SortIcon col={col} active={sortKey} dir={sortDir} />
        </th>
    );

    const resetFilters = () => {
        setSearch(''); setRiskFilter('all'); setMembershipFilter('all');
        setLastContactFilter('all'); setHasNotesFilter('all');
        setUpcomingOnly(false); setShowDismissed(false);
    };

    const hasActiveFilter = search || riskFilter !== 'all' || membershipFilter !== 'all'
        || lastContactFilter !== 'all' || hasNotesFilter !== 'all' || upcomingOnly || showDismissed;

    const COL_COUNT = 13;

    if (!peopleData) {
        return (
            <div className="py-20 flex flex-col items-center gap-3 text-slate-400">
                <div className="animate-spin text-3xl">⏳</div>
                <p className="text-sm font-bold uppercase tracking-widest">Loading people data…</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">

            {/* ── Page header ── */}
            <div className="flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Care Report</h2>
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mt-0.5">
                        Who needs to be contacted — and when did we last reach out?
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setFiltersOpen(f => !f)}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                            filtersOpen
                                ? 'bg-indigo-600 text-white'
                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                        }`}
                    >
                        <Filter size={13} /> Filters {hasActiveFilter && <span className="bg-white/30 text-white px-1.5 py-0.5 rounded-full text-[9px]">ON</span>}
                    </button>
                    <button
                        onClick={() => exportToCSV(sortedRows, 'care-report')}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-widest transition-all shadow-sm"
                    >
                        <Download size={13} /> Export CSV
                    </button>
                </div>
            </div>

            {/* ── Summary cards ── */}
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                {[
                    { label: 'Never Contacted', value: stats.never, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/30' },
                    { label: '90+ Days Ago', value: stats.over90, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30' },
                    { label: 'Avg Days Since', value: stats.avg !== null ? `${stats.avg}d` : '—', color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/30' },
                    { label: 'In View', value: stats.total, color: 'text-slate-700 dark:text-slate-200', bg: 'bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-700' },
                    { label: 'Cleared', value: stats.dismissed, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30' },
                ].map(card => (
                    <div key={card.label} className={`p-4 rounded-2xl border ${card.bg} flex flex-col gap-1`}>
                        <p className={`text-2xl font-black ${card.color}`}>{card.value}</p>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">{card.label}</p>
                    </div>
                ))}
            </div>

            {/* ── Filter panel ── */}
            {filtersOpen && (
                <div className="bg-white dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 space-y-3 shadow-sm">
                    <div className="flex flex-wrap gap-3 items-end">
                        {/* Search */}
                        <div className="flex-1 min-w-[180px]">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Search</label>
                            <div className="relative">
                                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={search}
                                    onChange={e => setSearch(e.target.value)}
                                    placeholder="Name, email, phone…"
                                    className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
                                />
                            </div>
                        </div>

                        {/* Risk */}
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Risk</label>
                            <div className="flex gap-1">
                                {(['all', 'Healthy', 'At Risk', 'Disconnected'] as const).map(v => (
                                    <button
                                        key={v}
                                        onClick={() => setRiskFilter(v)}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                            riskFilter === v
                                                ? v === 'Healthy' ? 'bg-emerald-500 text-white'
                                                : v === 'At Risk' ? 'bg-amber-500 text-white'
                                                : v === 'Disconnected' ? 'bg-rose-500 text-white'
                                                : 'bg-indigo-600 text-white'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        {v === 'all' ? 'All' : v}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Membership */}
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Membership</label>
                            <select
                                value={membershipFilter}
                                onChange={e => setMembershipFilter(e.target.value)}
                                className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-black uppercase rounded-xl px-3 py-2 outline-none border border-slate-100 dark:border-slate-700 focus:ring-2 focus:ring-indigo-400 transition-all"
                            >
                                <option value="all">All</option>
                                {membershipOptions.map(m => <option key={m} value={m}>{m}</option>)}
                            </select>
                        </div>

                        {/* Last Contact */}
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Last Contact</label>
                            <div className="flex gap-1 flex-wrap">
                                {([
                                    { v: 'all', label: 'All' },
                                    { v: 'never', label: 'Never' },
                                    { v: '30plus', label: '30+ days' },
                                    { v: '90plus', label: '90+ days' },
                                    { v: '1yearplus', label: '1 year+' },
                                ] as { v: LastContactFilter; label: string }[]).map(({ v, label }) => (
                                    <button
                                        key={v}
                                        onClick={() => setLastContactFilter(v)}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                            lastContactFilter === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Has Notes */}
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Notes</label>
                            <div className="flex gap-1">
                                {([{ v: 'all', label: 'All' }, { v: 'has', label: 'Has Notes' }, { v: 'none', label: 'No Notes' }] as const).map(({ v, label }) => (
                                    <button
                                        key={v}
                                        onClick={() => setHasNotesFilter(v)}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                            hasNotesFilter === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        {label}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Upcoming */}
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Celebrations</label>
                            <button
                                onClick={() => setUpcomingOnly(u => !u)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                    upcomingOnly ? 'bg-pink-500 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                🎂 Upcoming 30 days
                            </button>
                        </div>

                        {/* Show cleared */}
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Cleared</label>
                            <button
                                onClick={() => setShowDismissed(d => !d)}
                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${
                                    showDismissed ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                ✓ Show Cleared
                            </button>
                        </div>

                        {/* Reset */}
                        {hasActiveFilter && (
                            <button
                                onClick={resetFilters}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-950/20 transition-all border border-rose-200 dark:border-rose-900/40"
                            >
                                <X size={11} /> Clear Filters
                            </button>
                        )}
                    </div>
                </div>
            )}

            {/* ── Table ── */}
            <div className="bg-white dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-2xl overflow-hidden shadow-sm">
                <div className="overflow-x-auto overflow-y-auto max-h-[calc(100vh-420px)] min-h-[300px]">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-white dark:bg-slate-900 z-10 shadow-sm">
                            <tr>
                                <ThCol label="Person" col="name" className="pl-4 min-w-[180px]" />
                                <ThCol label="Risk" col="riskCategory" />
                                <ThCol label="Score" col="riskScore" />
                                <ThCol label="Membership" col="membership" />
                                <ThCol label="Last Contact" col="lastContact" />
                                <th className="p-2 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">Type</th>
                                <ThCol label="Days Since" col="daysSince" />
                                <ThCol label="Notes" col="notesCount" />
                                <ThCol label="Urgency" col="urgency" />
                                <th className="p-2 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">Birthday</th>
                                <th className="p-2 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800 whitespace-nowrap">Anniversary</th>
                                <th className="p-2 text-[10px] font-black uppercase tracking-widest text-slate-400 border-b border-slate-100 dark:border-slate-800 text-right pr-4 whitespace-nowrap">Actions</th>
                            </tr>
                        </thead>
                        <tbody>
                            {sortedRows.length === 0 ? (
                                <tr>
                                    <td colSpan={COL_COUNT} className="py-16 text-center text-slate-400 text-sm font-bold">
                                        No people match your current filters.
                                    </td>
                                </tr>
                            ) : sortedRows.map(({ person, lastNote, lastTouchpoint, noteCount, daysSinceContact, urgencyScore, followedUpRecently, dismissed }) => {
                                const category = person.riskProfile?.category ?? 'Disconnected';
                                const score = person.riskProfile?.score ?? 0;
                                const isFormOpen = activeFormPersonId === person.id;

                                const riskBadge =
                                    category === 'Healthy' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400' :
                                    category === 'At Risk' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400' :
                                    'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400';

                                const scoreColor =
                                    category === 'Healthy' ? 'text-emerald-500' :
                                    category === 'At Risk' ? 'text-amber-500' :
                                    'text-rose-500';

                                const isOverdue = (category === 'Disconnected' || category === 'At Risk') && daysSinceContact >= 90;
                                const isNever = daysSinceContact === 9999;

                                const daysDisplay = isNever ? 'Never'
                                    : daysSinceContact === 0 ? 'Today'
                                    : daysSinceContact === 1 ? 'Yesterday'
                                    : `${daysSinceContact}d`;

                                const daysColor = isNever ? 'text-rose-500 font-black'
                                    : daysSinceContact >= 90 ? 'text-amber-500 font-black'
                                    : 'text-slate-600 dark:text-slate-300 font-bold';

                                const urgencyPct = Math.min(100, Math.round(urgencyScore / 50));
                                const urgencyColor = urgencyPct >= 70 ? 'bg-rose-400' : urgencyPct >= 40 ? 'bg-amber-400' : 'bg-emerald-400';

                                const bd = formatMonthDay(person.birthdate);
                                const ann = formatMonthDay(person.anniversary);
                                const bdUpcoming = isUpcomingAnnual(person.birthdate);
                                const annUpcoming = isUpcomingAnnual(person.anniversary);

                                const rowOpacity = dismissed ? 'opacity-40' : '';

                                return (
                                    <React.Fragment key={person.id}>
                                        <tr
                                            className={`group border-b border-slate-50 dark:border-slate-800/50 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${rowOpacity} ${
                                                isFormOpen ? 'bg-indigo-50/40 dark:bg-indigo-950/10' : ''
                                            } ${isNever && !dismissed ? 'border-l-2 border-l-rose-300 dark:border-l-rose-800/60' : ''}`}
                                        >
                                            {/* Person */}
                                            <td className="p-2 py-3 pl-4">
                                                <div className="flex items-center gap-3">
                                                    {person.avatar
                                                        ? <img src={person.avatar} alt={person.name} width="32" height="32" loading="lazy" className="w-8 h-8 rounded-full object-cover bg-slate-200 flex-shrink-0" />
                                                        : <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs uppercase flex-shrink-0">{person.name.substring(0, 2)}</div>
                                                    }
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-1.5 flex-wrap">
                                                            <button
                                                            onClick={() => window.dispatchEvent(new CustomEvent('openPersonProfile', { detail: person.id }))}
                                                            title={`Open ${person.name}'s profile`}
                                                            className="text-sm font-bold text-slate-900 dark:text-white truncate max-w-[140px] hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left"
                                                        >{person.name}</button>
                                                            {followedUpRecently && <span className="text-[9px] font-black uppercase tracking-wide bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 px-1.5 py-0.5 rounded-full whitespace-nowrap">✓ Contacted</span>}
                                                            {dismissed && <span className="text-[9px] font-black uppercase tracking-wide bg-slate-100 dark:bg-slate-800 text-slate-400 px-1.5 py-0.5 rounded-full whitespace-nowrap">Cleared</span>}
                                                            {isOverdue && !followedUpRecently && !dismissed && <span className="text-[9px] font-black uppercase tracking-wide bg-amber-100 dark:bg-amber-950/40 text-amber-700 dark:text-amber-400 px-1.5 py-0.5 rounded-full whitespace-nowrap">⚠️ Overdue</span>}
                                                        </div>
                                                        <p className="text-[10px] text-slate-400 truncate max-w-[160px]">{person.phone || person.email || 'No Contact Info'}</p>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Risk */}
                                            <td className="p-2 text-center">
                                                <span className={`inline-flex px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide whitespace-nowrap ${riskBadge}`}>{category}</span>
                                            </td>

                                            {/* Score */}
                                            <td className="p-2 text-center">
                                                <span className={`text-sm font-black ${scoreColor}`}>{score}</span>
                                            </td>

                                            {/* Membership */}
                                            <td className="p-2 text-center text-[11px] font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">{person.membership || '—'}</td>

                                            {/* Last Contact */}
                                            <td className="p-2 text-center text-[11px] font-bold text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                                <div>
                                                    {lastNote ? formatDate(lastNote.date) : <span className="text-rose-400 font-black text-[10px]">Never</span>}
                                                </div>
                                                {lastTouchpoint && lastTouchpoint.tags?.includes('no-answer') && (
                                                    <div className="text-[9px] text-rose-500/80 font-black mt-0.5" title={`Last attempt: ${lastTouchpoint.content || 'No Answer'}`}>
                                                        📵 No Answer: {formatDate(lastTouchpoint.date)}
                                                    </div>
                                                )}
                                            </td>

                                            {/* Type */}
                                            <td className="p-2 text-center text-[11px] text-slate-500 whitespace-nowrap">
                                                {lastNote
                                                    ? <span title={lastNote.type} className="cursor-default">{noteTypeEmoji[lastNote.type] || '📋'} {lastNote.type}</span>
                                                    : <span className="text-slate-300 dark:text-slate-600">—</span>
                                                }
                                            </td>

                                            {/* Days since */}
                                            <td className={`p-2 text-center text-sm ${daysColor} whitespace-nowrap`}>{daysDisplay}</td>

                                            {/* Notes count */}
                                            <td className="p-2 text-center">
                                                {noteCount > 0
                                                    ? <span title={lastNote?.content ? `Last: "${lastNote.content.slice(0, 80)}…"` : undefined} className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 text-[10px] font-black cursor-default">{noteCount}</span>
                                                    : <span className="text-[10px] text-slate-300 dark:text-slate-600">0</span>
                                                }
                                            </td>

                                            {/* Urgency bar */}
                                            <td className="p-2 text-center">
                                                <div className="w-16 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mx-auto">
                                                    <div className={`h-full rounded-full ${urgencyColor} transition-all`} style={{ width: `${urgencyPct}%` }} />
                                                </div>
                                            </td>

                                            {/* Birthday */}
                                            <td className="p-2 text-center">
                                                {bd ? <span className={`text-[10px] font-bold whitespace-nowrap ${bdUpcoming ? 'text-pink-600 dark:text-pink-400' : 'text-slate-400'}`}>{bdUpcoming && '🎂 '}{bd}</span>
                                                    : <span className="text-slate-300 dark:text-slate-600 text-[10px]">—</span>}
                                            </td>

                                            {/* Anniversary */}
                                            <td className="p-2 text-center">
                                                {ann ? <span className={`text-[10px] font-bold whitespace-nowrap ${annUpcoming ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>{annUpcoming && '💍 '}{ann}</span>
                                                    : <span className="text-slate-300 dark:text-slate-600 text-[10px]">—</span>}
                                            </td>

                                            {/* Actions */}
                                            <td className="p-2 pr-4">
                                                <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                                    {/* Log contact / toggle form */}
                                                    {onAddNote && !dismissed && (
                                                        <button
                                                            onClick={() => setActiveFormPersonId(isFormOpen ? null : person.id)}
                                                            title={isFormOpen ? 'Cancel' : 'Log a contact or note'}
                                                            className={`w-7 h-7 rounded-lg flex items-center justify-center transition-all ${
                                                                isFormOpen
                                                                    ? 'bg-indigo-600 text-white'
                                                                    : 'bg-indigo-100 dark:bg-indigo-900/40 hover:bg-indigo-600 text-indigo-500 hover:text-white'
                                                            }`}
                                                        >
                                                            {isFormOpen ? <X size={12} /> : <Phone size={12} />}
                                                        </button>
                                                    )}

                                                    {/* Mark as contacted (no note) */}
                                                    {onMarkFollowedUp && !followedUpRecently && !dismissed && (
                                                        <button
                                                            onClick={() => onMarkFollowedUp(person.id)}
                                                            title="Mark as contacted"
                                                            className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-600 text-emerald-500 hover:text-white flex items-center justify-center transition-all"
                                                        >
                                                            <CheckCircle2 size={12} />
                                                        </button>
                                                    )}

                                                    {/* Open profile */}
                                                    <button
                                                        onClick={() => window.dispatchEvent(new CustomEvent('openPersonProfile', { detail: person.id }))}
                                                        title={`Open ${person.name}'s profile`}
                                                        className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-600 hover:text-white text-slate-400 flex items-center justify-center transition-all"
                                                    >
                                                        <MessageSquare size={12} />
                                                    </button>

                                                    {/* Clear / restore */}
                                                    {onDismiss && (
                                                        dismissed ? (
                                                            <button
                                                                onClick={() => {
                                                                    // Restore: call onDismiss with null-like signal to un-dismiss
                                                                    // We reuse the followedUp pathway to effectively clear the dismissal
                                                                    onMarkFollowedUp?.(person.id);
                                                                }}
                                                                title="Restore to list"
                                                                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-amber-500 hover:text-white text-slate-400 flex items-center justify-center transition-all text-[10px]"
                                                            >
                                                                ↩
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => { onDismiss(person.id, 'report_cleared'); setActiveFormPersonId(null); }}
                                                                title="Clear from list"
                                                                className="w-7 h-7 rounded-lg bg-rose-100 dark:bg-rose-900/40 hover:bg-rose-600 text-rose-400 hover:text-white flex items-center justify-center transition-all"
                                                            >
                                                                <Trash2 size={12} />
                                                            </button>
                                                        )
                                                    )}
                                                </div>
                                            </td>
                                        </tr>

                                        {/* Inline contact form */}
                                        {isFormOpen && onAddNote && (
                                            <InlineContactForm
                                                person={person}
                                                colSpan={COL_COUNT}
                                                onSave={async (type, content) => {
                                                    await onAddNote(person.id, type, content);
                                                    setActiveFormPersonId(null);
                                                }}
                                                onCancel={() => setActiveFormPersonId(null)}
                                            />
                                        )}
                                    </React.Fragment>
                                );
                            })}
                        </tbody>
                    </table>
                </div>

                {/* Footer */}
                <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
                        {sortedRows.length} of {allRows.length} people
                        {stats.dismissed > 0 && !showDismissed && (
                            <button onClick={() => setShowDismissed(true)} className="ml-3 text-emerald-500 hover:underline">{stats.dismissed} cleared (show)</button>
                        )}
                    </p>
                    <p className="text-[10px] text-slate-300 dark:text-slate-600">
                        Sorted by {sortKey} · {sortDir === 'desc' ? '↓' : '↑'}
                    </p>
                </div>
            </div>
        </div>
    );
};
