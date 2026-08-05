import React, { useMemo, useState, useCallback, useEffect } from 'react';
import { 
    PcoPerson, PeopleDashboardData, PastoralNote, CareFollowUpLog, 
    RiskSettings, Church, OutreachSession, OutreachSlot 
} from '../types';
import { DEFAULT_RISK_SETTINGS } from '../services/riskService';
import { firestore } from '../services/firestoreService';
import { 
    Download, Search, ChevronUp, ChevronDown, ChevronsUpDown, MessageSquare, 
    Filter, X, Phone, CheckCircle2, Trash2, Send, Users, PhoneOff, BarChart3, 
    Clock, Award, TrendingUp, Calendar, Check, RefreshCw, FileText, ChevronRight, 
    UserCheck, Flame, ExternalLink, Activity
} from 'lucide-react';

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

function fmtDurationSeconds(seconds: number | null | undefined): string {
    if (!seconds || seconds <= 0) return '—';
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
}

function maskPhone(phone?: string | null): string {
    if (!phone) return 'Unknown';
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) return phone;
    return `(${digits.slice(0, 3)}) ***-${digits.slice(-4)}`;
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
    church?: Church;
    onAddNote?: (personId: string, type: PastoralNote['type'], content: string) => Promise<void>;
    onMarkFollowedUp?: (personId: string) => void;
    onDismiss?: (personId: string, signal: string) => void;
}

// ---------------------------------------------------------------------------
// CSV Exports
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

function exportOutreachSessionsCSV(sessions: OutreachSession[], slots: OutreachSlot[]) {
    const today = new Date().toISOString().split('T')[0];
    const headers = [
        'Session Name', 'Status', 'Created Date', 'Closed Date',
        'Target Risk Categories', 'Target Members', 'Reached (Contacted)',
        'No Answer', 'Pending Queue', 'Contact Rate (%)', 'Callers Count', 'Avg Call Handle Time (sec)'
    ];

    const slotsBySession = new Map<string, OutreachSlot[]>();
    slots.forEach(s => {
        if (!slotsBySession.has(s.sessionId)) slotsBySession.set(s.sessionId, []);
        slotsBySession.get(s.sessionId)!.push(s);
    });

    const csvRows = sessions.map(sess => {
        const sessSlots = slotsBySession.get(sess.id) || [];
        const contacted = sessSlots.filter(s => s.status === 'contacted').length;
        const noAnswer = sessSlots.filter(s => s.status === 'no-answer').length;
        const pending = sessSlots.filter(s => s.status === 'pending').length;
        const totalEligible = sess.eligiblePeople?.length || sess.stats?.totalEligible || sessSlots.length;
        const contactedRate = totalEligible > 0 ? Math.round((contacted / totalEligible) * 100) : 0;
        const uniqueCallers = Array.from(new Set(sessSlots.map(s => s.volunteerPhone || s.volunteerName || 'Unknown'))).filter(Boolean);
        const handleTimes = sessSlots.filter(s => s.completedAt && s.assignedAt && s.completedAt > s.assignedAt).map(s => (s.completedAt! - s.assignedAt) / 1000);
        const avgHandleTimeSec = handleTimes.length > 0 ? Math.round(handleTimes.reduce((a, b) => a + b, 0) / handleTimes.length) : '';

        return [
            escapeCsvCell(sess.name),
            escapeCsvCell(sess.closedAt ? 'Closed' : sess.isActive ? 'Active' : 'Inactive'),
            escapeCsvCell(formatDate(new Date(sess.createdAt).toISOString())),
            escapeCsvCell(sess.closedAt ? formatDate(new Date(sess.closedAt).toISOString()) : 'N/A'),
            escapeCsvCell((sess.filters?.riskCategories || []).join('; ') || 'All'),
            escapeCsvCell(totalEligible),
            escapeCsvCell(contacted),
            escapeCsvCell(noAnswer),
            escapeCsvCell(pending),
            escapeCsvCell(`${contactedRate}%`),
            escapeCsvCell(uniqueCallers.length),
            escapeCsvCell(avgHandleTimeSec),
        ].join(',');
    });

    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `outreach-sessions-report-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

function exportCallersCSV(callers: any[]) {
    const today = new Date().toISOString().split('T')[0];
    const headers = [
        'Volunteer Name', 'Phone Number', 'Sessions Participated',
        'Total Calls Handled', 'Reached (Contacted)', 'No Answer',
        'Success Rate (%)', 'Avg Handle Time (sec)', 'Notes Logged', 'Last Active'
    ];

    const csvRows = callers.map(c => [
        escapeCsvCell(c.name),
        escapeCsvCell(c.phone),
        escapeCsvCell(c.sessionCount),
        escapeCsvCell(c.totalCalls),
        escapeCsvCell(c.contacted),
        escapeCsvCell(c.noAnswer),
        escapeCsvCell(`${c.successRate}%`),
        escapeCsvCell(c.avgHandleTimeSec ?? ''),
        escapeCsvCell(c.notesLogged),
        escapeCsvCell(c.lastActiveAt ? formatDate(new Date(c.lastActiveAt).toISOString()) : 'N/A'),
    ].join(','));

    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `callers-volunteer-report-${today}.csv`;
    link.click();
    URL.revokeObjectURL(url);
}

function exportCallLogsCSV(slots: OutreachSlot[], sessions: OutreachSession[]) {
    const today = new Date().toISOString().split('T')[0];
    const sessMap = new Map(sessions.map(s => [s.id, s.name]));
    const headers = [
        'Call Date', 'Session Name', 'Volunteer Name', 'Volunteer Phone',
        'Contacted Member', 'Member Phone', 'Outcome Status', 'Handle Time (sec)', 'Call Notes'
    ];

    const csvRows = slots.map(s => {
        const handleTime = (s.completedAt && s.assignedAt && s.completedAt > s.assignedAt)
            ? Math.round((s.completedAt - s.assignedAt) / 1000)
            : '';
        return [
            escapeCsvCell(s.completedAt ? formatDate(new Date(s.completedAt).toISOString()) : formatDate(new Date(s.assignedAt).toISOString())),
            escapeCsvCell(sessMap.get(s.sessionId) || 'Outreach Session'),
            escapeCsvCell(s.volunteerName || 'Volunteer'),
            escapeCsvCell(s.volunteerPhone),
            escapeCsvCell(s.assignedPersonName),
            escapeCsvCell(s.assignedPersonPhone),
            escapeCsvCell(s.status),
            escapeCsvCell(handleTime),
            escapeCsvCell(s.notes),
        ].join(',');
    });

    const csv = [headers.join(','), ...csvRows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `outreach-call-log-${today}.csv`;
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
// Inline Contact Form
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
                    <div className="flex items-center gap-2">
                        {person.avatar
                            ? <img src={person.avatar} alt={person.name} className="w-6 h-6 rounded-full object-cover" />
                            : <div className="w-6 h-6 rounded-full bg-indigo-200 dark:bg-indigo-800 flex items-center justify-center text-[11px] font-black text-indigo-700 dark:text-indigo-300">{person.name.substring(0, 2).toUpperCase()}</div>
                        }
                        <span className="text-xs font-black text-slate-700 dark:text-slate-200">
                            Log Contact — <span className="text-indigo-600 dark:text-indigo-400">{person.name}</span>
                        </span>
                    </div>

                    <div className="flex flex-wrap gap-3 items-start">
                        <div className="flex flex-col gap-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Contact Type</span>
                            <div className="flex flex-wrap gap-1">
                                {NOTE_TYPES.map(t => (
                                    <button
                                        key={t}
                                        onClick={() => setContactType(t)}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${
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

                        <div className="flex-1 min-w-[240px] flex flex-col gap-1.5">
                            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Note (optional)</span>
                            <textarea
                                value={content}
                                onChange={e => setContent(e.target.value)}
                                placeholder="Brief note about this contact…"
                                rows={2}
                                autoFocus
                                className="w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs text-slate-700 dark:text-slate-200 resize-none outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
                            />
                        </div>

                        <div className="flex items-end gap-2 pb-0.5">
                            <button
                                onClick={handleSave}
                                disabled={saving || !content.trim()}
                                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-[10px] font-bold uppercase tracking-wide transition-all"
                            >
                                {saving ? <span className="animate-spin text-xs">⏳</span> : <Send size={11} />}
                                {saving ? 'Saving…' : 'Save'}
                            </button>
                            <button
                                onClick={onCancel}
                                className="flex items-center gap-1 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[10px] font-bold uppercase tracking-wide hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
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
    church,
    onAddNote,
    onMarkFollowedUp,
    onDismiss,
}) => {
    // --- Report Tab Selection ---
    const [activeReportTab, setActiveReportTab] = useState<'directory' | 'sessions' | 'callers'>(() => {
        const search = window.location.search;
        if (search.includes('tab=sessions') || search.includes('tab=outreach')) return 'sessions';
        if (search.includes('tab=callers')) return 'callers';
        return 'directory';
    });

    // --- Outreach Sessions & Slots State ---
    const [sessions, setSessions] = useState<OutreachSession[]>([]);
    const [slots, setSlots] = useState<OutreachSlot[]>([]);
    const [isLoadingOutreach, setIsLoadingOutreach] = useState(false);

    // Filters for Outreach Reports
    const [outreachSessionFilter, setOutreachSessionFilter] = useState<string>('all');
    const [outreachSearch, setOutreachSearch] = useState<string>('');
    const [callerSearch, setCallerSearch] = useState<string>('');
    const [callerOutcomeFilter, setCallerOutcomeFilter] = useState<'all' | 'contacted' | 'no-answer'>('all');
    const [selectedSessionDetail, setSelectedSessionDetail] = useState<OutreachSession | null>(null);

    // Fetch outreach data from firestore
    useEffect(() => {
        if (!church?.id) return;
        setIsLoadingOutreach(true);
        Promise.all([
            firestore.getOutreachSessions(church.id),
            firestore.getAllChurchOutreachSlots(church.id),
        ]).then(([sessData, slotData]) => {
            setSessions(sessData);
            setSlots(slotData);
        }).catch(err => {
            console.error('Failed to load outreach reports data:', err);
        }).finally(() => {
            setIsLoadingOutreach(false);
        });
    }, [church?.id]);

    // --- Care Directory Filters & Sort ---
    const [search, setSearch] = useState('');
    const [riskFilter, setRiskFilter] = useState<'all' | 'Healthy' | 'At Risk' | 'Disconnected'>('all');
    const [membershipFilter, setMembershipFilter] = useState('all');
    const [lastContactFilter, setLastContactFilter] = useState<LastContactFilter>('all');
    const [hasNotesFilter, setHasNotesFilter] = useState<'all' | 'has' | 'none'>('all');
    const [upcomingOnly, setUpcomingOnly] = useState(false);
    const [showDismissed, setShowDismissed] = useState(false);
    const [filtersOpen, setFiltersOpen] = useState(true);

    const [sortKey, setSortKey] = useState<SortKey>('urgency');
    const [sortDir, setSortDir] = useState<SortDir>('desc');
    const [activeFormPersonId, setActiveFormPersonId] = useState<string | null>(null);

    const handleSort = useCallback((key: SortKey) => {
        setSortKey(prev => {
            if (prev === key) { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); return key; }
            setSortDir('desc');
            return key;
        });
    }, []);

    // Index notes by personId
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
            if (n.tags?.includes('no-answer')) return;
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

    const filteredRows = useMemo(() => {
        return allRows.filter(({ person, lastNote, noteCount, daysSinceContact, dismissed }) => {
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

    const directoryStats = useMemo(() => {
        const never = filteredRows.filter(r => r.daysSinceContact === 9999).length;
        const over90 = filteredRows.filter(r => r.daysSinceContact >= 90 && r.daysSinceContact < 9999).length;
        const withDays = filteredRows.filter(r => r.daysSinceContact < 9999);
        const avg = withDays.length > 0
            ? Math.round(withDays.reduce((s, r) => s + r.daysSinceContact, 0) / withDays.length)
            : null;
        const dismissed = allRows.filter(r => r.dismissed).length;
        return { never, over90, avg, total: filteredRows.length, dismissed };
    }, [filteredRows, allRows]);

    // --- Outreach Sessions Metrics Computation ---
    const sessionMetrics = useMemo(() => {
        const activeCount = sessions.filter(s => s.isActive && !s.closedAt).length;
        const closedCount = sessions.filter(s => !!s.closedAt).length;

        const slotsBySession = new Map<string, OutreachSlot[]>();
        slots.forEach(s => {
            if (!slotsBySession.has(s.sessionId)) slotsBySession.set(s.sessionId, []);
            slotsBySession.get(s.sessionId)!.push(s);
        });

        const rows = sessions.map(sess => {
            const sessSlots = slotsBySession.get(sess.id) || [];
            const contacted = sessSlots.filter(s => s.status === 'contacted').length;
            const noAnswer = sessSlots.filter(s => s.status === 'no-answer').length;
            const pending = sessSlots.filter(s => s.status === 'pending').length;
            const released = sessSlots.filter(s => s.status === 'released').length;
            const totalEligible = sess.eligiblePeople?.length || sess.stats?.totalEligible || sessSlots.length;
            const contactedRate = totalEligible > 0 ? Math.round((contacted / totalEligible) * 100) : 0;
            const noAnswerRate = totalEligible > 0 ? Math.round((noAnswer / totalEligible) * 100) : 0;
            
            const uniqueCallers = Array.from(new Set(sessSlots.map(s => s.volunteerPhone || s.volunteerName || 'Unknown'))).filter(Boolean);
            
            const handleTimes = sessSlots
                .filter(s => s.completedAt && s.assignedAt && s.completedAt > s.assignedAt)
                .map(s => (s.completedAt! - s.assignedAt) / 1000);
            const avgHandleTimeSec = handleTimes.length > 0 ? Math.round(handleTimes.reduce((a, b) => a + b, 0) / handleTimes.length) : null;

            return {
                session: sess,
                slots: sessSlots,
                contacted,
                noAnswer,
                pending,
                released,
                totalEligible,
                contactedRate,
                noAnswerRate,
                callerCount: uniqueCallers.length,
                avgHandleTimeSec
            };
        });

        const filteredRows = rows.filter(r => {
            if (outreachSearch) {
                const q = outreachSearch.toLowerCase();
                if (!r.session.name.toLowerCase().includes(q)) return false;
            }
            if (outreachSessionFilter !== 'all') {
                if (outreachSessionFilter === 'active' && (r.session.closedAt || !r.session.isActive)) return false;
                if (outreachSessionFilter === 'closed' && !r.session.closedAt) return false;
            }
            return true;
        });

        const totalEligibleAll = rows.reduce((acc, r) => acc + r.totalEligible, 0);
        const totalContactedAll = rows.reduce((acc, r) => acc + r.contacted, 0);
        const totalNoAnswerAll = rows.reduce((acc, r) => acc + r.noAnswer, 0);
        const overallContactRate = totalEligibleAll > 0 ? Math.round((totalContactedAll / totalEligibleAll) * 100) : 0;

        const allHandleTimes = slots
            .filter(s => s.completedAt && s.assignedAt && s.completedAt > s.assignedAt)
            .map(s => (s.completedAt! - s.assignedAt) / 1000);
        const overallAvgHandleTimeSec = allHandleTimes.length > 0 ? Math.round(allHandleTimes.reduce((a, b) => a + b, 0) / allHandleTimes.length) : null;

        return {
            rows: filteredRows,
            totalSessions: sessions.length,
            activeCount,
            closedCount,
            totalEligibleAll,
            totalContactedAll,
            totalNoAnswerAll,
            overallContactRate,
            overallAvgHandleTimeSec,
        };
    }, [sessions, slots, outreachSearch, outreachSessionFilter]);

    // --- Callers Metrics Computation ---
    const callerMetrics = useMemo(() => {
        const callerMap = new Map<string, {
            phone: string;
            name: string;
            sessions: Set<string>;
            contacted: number;
            noAnswer: number;
            notesLogged: number;
            handleTimesSec: number[];
            lastActiveAt: number;
            firstActiveAt: number;
            slots: OutreachSlot[];
        }>();

        slots.forEach(slot => {
            const phone = slot.volunteerPhone || 'Unknown';
            const name = slot.volunteerName || (phone !== 'Unknown' ? `Volunteer (${phone.slice(-4)})` : 'Anonymous Volunteer');
            
            if (!callerMap.has(phone)) {
                callerMap.set(phone, {
                    phone,
                    name,
                    sessions: new Set(),
                    contacted: 0,
                    noAnswer: 0,
                    notesLogged: 0,
                    handleTimesSec: [],
                    lastActiveAt: 0,
                    firstActiveAt: Infinity,
                    slots: [],
                });
            }

            const c = callerMap.get(phone)!;
            c.slots.push(slot);
            if (slot.sessionId) c.sessions.add(slot.sessionId);
            if (slot.status === 'contacted') c.contacted++;
            if (slot.status === 'no-answer') c.noAnswer++;
            if (slot.notes && slot.notes.trim()) c.notesLogged++;

            const activeTs = slot.completedAt || slot.assignedAt;
            if (activeTs > c.lastActiveAt) c.lastActiveAt = activeTs;
            if (activeTs < c.firstActiveAt) c.firstActiveAt = activeTs;

            if (slot.completedAt && slot.assignedAt && slot.completedAt > slot.assignedAt) {
                c.handleTimesSec.push((slot.completedAt - slot.assignedAt) / 1000);
            }
        });

        const rows = Array.from(callerMap.values()).map(c => {
            const totalCalls = c.contacted + c.noAnswer;
            const successRate = totalCalls > 0 ? Math.round((c.contacted / totalCalls) * 100) : 0;
            const avgHandleTimeSec = c.handleTimesSec.length > 0 ? Math.round(c.handleTimesSec.reduce((a, b) => a + b, 0) / c.handleTimesSec.length) : null;
            const totalDurationSec = c.handleTimesSec.reduce((a, b) => a + b, 0);

            return {
                phone: c.phone,
                name: c.name,
                sessionCount: c.sessions.size,
                contacted: c.contacted,
                noAnswer: c.noAnswer,
                totalCalls,
                successRate,
                notesLogged: c.notesLogged,
                avgHandleTimeSec,
                totalDurationSec,
                lastActiveAt: c.lastActiveAt === 0 ? null : c.lastActiveAt,
                firstActiveAt: c.firstActiveAt === Infinity ? null : c.firstActiveAt,
                slots: c.slots
            };
        }).sort((a, b) => b.totalCalls - a.totalCalls);

        const filteredRows = rows.filter(r => {
            if (callerSearch) {
                const q = callerSearch.toLowerCase();
                if (!r.name.toLowerCase().includes(q) && !r.phone.includes(q)) return false;
            }
            return true;
        });

        // Filtered completed call log
        const filteredCallLog = slots.filter(s => {
            if (s.status !== 'contacted' && s.status !== 'no-answer') return false;
            if (callerOutcomeFilter !== 'all' && s.status !== callerOutcomeFilter) return false;
            if (callerSearch) {
                const q = callerSearch.toLowerCase();
                const vName = (s.volunteerName || '').toLowerCase();
                const pName = (s.assignedPersonName || '').toLowerCase();
                if (!vName.includes(q) && !pName.includes(q) && !s.volunteerPhone.includes(q)) return false;
            }
            return true;
        }).sort((a, b) => (b.completedAt || b.assignedAt) - (a.completedAt || a.assignedAt));

        const totalUniqueCallers = rows.length;
        const totalCompletedCalls = rows.reduce((acc, r) => acc + r.totalCalls, 0);
        const topByVolume = rows.length > 0 ? rows[0] : null;
        const topByRate = rows.filter(r => r.totalCalls >= 3).sort((a, b) => b.successRate - a.successRate)[0] || null;

        return {
            rows: filteredRows,
            callLog: filteredCallLog,
            totalUniqueCallers,
            totalCompletedCalls,
            topByVolume,
            topByRate
        };
    }, [slots, callerSearch, callerOutcomeFilter]);

    const ThCol: React.FC<{ label: string; col: SortKey; className?: string }> = ({ label, col, className }) => (
        <th
            onClick={() => handleSort(col)}
            className={`p-2 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 cursor-pointer select-none hover:text-indigo-500 transition-colors whitespace-nowrap ${className ?? ''}`}
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
                <p className="text-sm font-bold uppercase tracking-wide">Loading pastoral care data…</p>
            </div>
        );
    }

    return (
        <div className="space-y-6 animate-in fade-in duration-300">

            {/* ── Top Navigation & Page Header ── */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
                <div>
                    <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                        <FileText className="text-indigo-600 dark:text-indigo-400" size={24} />
                        Pastoral Care & Reports
                    </h2>
                    <p className="text-xs font-medium text-slate-400 mt-1">
                        Monitor care follow-ups, outreach contact campaigns, and volunteer caller performance.
                    </p>
                </div>

                {/* Tab selector */}
                <div className="flex bg-slate-100 dark:bg-slate-800 p-1.5 rounded-2xl gap-1">
                    <button
                        onClick={() => setActiveReportTab('directory')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
                            activeReportTab === 'directory'
                                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                    >
                        <Users size={14} /> Care Directory
                    </button>
                    <button
                        onClick={() => setActiveReportTab('sessions')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
                            activeReportTab === 'sessions'
                                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                    >
                        <BarChart3 size={14} /> Outreach Sessions
                    </button>
                    <button
                        onClick={() => setActiveReportTab('callers')}
                        className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
                            activeReportTab === 'callers'
                                ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                    >
                        <Phone size={14} /> Callers & Volunteers
                    </button>
                </div>
            </div>

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* TAB 1: CARE DIRECTORY & FOLLOW-UPS                               */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {activeReportTab === 'directory' && (
                <div className="space-y-6">
                    {/* Header Controls */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Care Directory Follow-ups</h3>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-0.5">
                                Church roster sorted by follow-up urgency and last contact touchpoint
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => setFiltersOpen(f => !f)}
                                className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
                                    filtersOpen
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                <Filter size={13} /> Filters {hasActiveFilter && <span className="bg-white/30 text-white px-1.5 py-0.5 rounded-full text-[11px]">ON</span>}
                            </button>
                            <button
                                onClick={() => exportToCSV(sortedRows, 'care-report')}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold uppercase tracking-wide transition-all shadow-sm"
                            >
                                <Download size={13} /> Export CSV
                            </button>
                        </div>
                    </div>

                    {/* Summary cards */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        {[
                            { label: 'Never Contacted', value: directoryStats.never, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/30' },
                            { label: '90+ Days Ago', value: directoryStats.over90, color: 'text-amber-500', bg: 'bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30' },
                            { label: 'Avg Days Since', value: directoryStats.avg !== null ? `${directoryStats.avg}d` : '—', color: 'text-indigo-500', bg: 'bg-indigo-50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/30' },
                            { label: 'In View', value: directoryStats.total, color: 'text-slate-700 dark:text-slate-200', bg: 'bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-700' },
                            { label: 'Cleared', value: directoryStats.dismissed, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30' },
                        ].map(card => (
                            <div key={card.label} className={`p-4 rounded-2xl border ${card.bg} flex flex-col gap-1`}>
                                <p className={`text-2xl font-black ${card.color}`}>{card.value}</p>
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{card.label}</p>
                            </div>
                        ))}
                    </div>

                    {/* Filter panel */}
                    {filtersOpen && (
                        <div className="bg-white dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 space-y-3 shadow-sm">
                            <div className="flex flex-wrap gap-3 items-end">
                                <div className="flex-1 min-w-[180px]">
                                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Search</label>
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

                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Risk</label>
                                    <div className="flex gap-1">
                                        {(['all', 'Healthy', 'At Risk', 'Disconnected'] as const).map(v => (
                                            <button
                                                key={v}
                                                onClick={() => setRiskFilter(v)}
                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${
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

                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Membership</label>
                                    <select
                                        value={membershipFilter}
                                        onChange={e => setMembershipFilter(e.target.value)}
                                        className="bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-bold uppercase rounded-xl px-3 py-2 outline-none border border-slate-100 dark:border-slate-700 focus:ring-2 focus:ring-indigo-400 transition-all"
                                    >
                                        <option value="all">All</option>
                                        {membershipOptions.map(m => <option key={m} value={m}>{m}</option>)}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Last Contact</label>
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
                                                className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${
                                                    lastContactFilter === v ? 'bg-indigo-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                                }`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>

                                {hasActiveFilter && (
                                    <button
                                        onClick={resetFilters}
                                        className="px-3 py-2 rounded-xl bg-rose-50 dark:bg-rose-950/30 text-rose-500 hover:bg-rose-100 text-[10px] font-black uppercase tracking-wide transition-all flex items-center gap-1"
                                    >
                                        <X size={11} /> Reset
                                    </button>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Table */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                                        <ThCol label="Person" col="name" className="pl-4" />
                                        <th className="p-2 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">Contact</th>
                                        <ThCol label="Membership" col="membership" />
                                        <ThCol label="Risk" col="riskCategory" className="text-center" />
                                        <ThCol label="Risk Score" col="riskScore" className="text-center" />
                                        <ThCol label="Last Care Contact" col="lastContact" />
                                        <th className="p-2 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">Last Touchpoint</th>
                                        <ThCol label="Days Since" col="daysSince" className="text-center" />
                                        <ThCol label="Notes" col="notesCount" className="text-center" />
                                        <ThCol label="Urgency" col="urgency" className="text-center" />
                                        <th className="p-2 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Birthday</th>
                                        <th className="p-2 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Anniversary</th>
                                        <th className="p-2 pr-4 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-right">Actions</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sortedRows.length === 0 ? (
                                        <tr>
                                            <td colSpan={COL_COUNT} className="py-12 text-center text-slate-400 font-bold uppercase tracking-wide">
                                                No people match the selected filters
                                            </td>
                                        </tr>
                                    ) : sortedRows.map(({ person, lastNote, lastTouchpoint, noteCount, daysSinceContact, urgencyScore, followedUpRecently, dismissed, allNotes }) => {
                                        const isFormOpen = activeFormPersonId === person.id;
                                        const cat = person.riskProfile?.category ?? 'Healthy';
                                        const catColor = cat === 'Healthy' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                            : cat === 'At Risk' ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                                            : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400';

                                        const score = person.riskProfile?.score ?? 100;
                                        const scoreColor = score >= 80 ? 'text-emerald-600 dark:text-emerald-400'
                                            : score >= 50 ? 'text-amber-600 dark:text-amber-400'
                                            : 'text-rose-600 dark:text-rose-400';

                                        const maxUrgency = 9999 * 2;
                                        const urgencyPct = Math.min(100, Math.round((urgencyScore / maxUrgency) * 100));
                                        const urgencyColor = daysSinceContact === 9999 ? 'bg-rose-500'
                                            : daysSinceContact >= 90 ? 'bg-amber-500'
                                            : 'bg-indigo-500';

                                        const bd = formatMonthDay(person.birthdate);
                                        const bdUpcoming = isUpcomingAnnual(person.birthdate);
                                        const ann = formatMonthDay(person.anniversary);
                                        const annUpcoming = isUpcomingAnnual(person.anniversary);

                                        return (
                                            <React.Fragment key={person.id}>
                                                <tr className={`group border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors ${dismissed ? 'opacity-40 bg-slate-50/40 dark:bg-slate-900/40' : ''}`}>
                                                    <td className="p-2 pl-4">
                                                        <div className="flex items-center gap-2.5">
                                                            {person.avatar ? (
                                                                <img src={person.avatar} alt={person.name} className="w-7 h-7 rounded-full object-cover shrink-0" />
                                                            ) : (
                                                                <div className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-[10px] font-black text-slate-500 dark:text-slate-400 shrink-0">
                                                                    {person.name.substring(0, 2).toUpperCase()}
                                                                </div>
                                                            )}
                                                            <div className="min-w-0">
                                                                <button
                                                                    onClick={() => window.dispatchEvent(new CustomEvent('openPersonProfile', { detail: person.id }))}
                                                                    className="font-bold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors truncate text-left block max-w-[140px]"
                                                                >
                                                                    {person.name}
                                                                </button>
                                                                {followedUpRecently && (
                                                                    <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-600 dark:text-emerald-400 uppercase tracking-wide">
                                                                        <CheckCircle2 size={9} /> Recent Contact
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </td>

                                                    <td className="p-2 text-slate-500 dark:text-slate-400">
                                                        <div className="flex flex-col text-[10px]">
                                                            {person.phone && <span className="font-mono text-slate-600 dark:text-slate-300">{person.phone}</span>}
                                                            {person.email && <span className="text-slate-400 truncate max-w-[120px]">{person.email}</span>}
                                                            {!person.phone && !person.email && <span className="text-slate-300 dark:text-slate-600">—</span>}
                                                        </div>
                                                    </td>

                                                    <td className="p-2 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                                                        {person.membership || '—'}
                                                    </td>

                                                    <td className="p-2 text-center">
                                                        <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide ${catColor}`}>
                                                            {cat}
                                                        </span>
                                                    </td>

                                                    <td className="p-2 text-center">
                                                        <span className={`font-mono font-black text-xs ${scoreColor}`}>
                                                            {score}
                                                        </span>
                                                    </td>

                                                    <td className="p-2">
                                                        {lastNote ? (
                                                            <div className="flex flex-col text-[10px]">
                                                                <span className="font-bold text-slate-700 dark:text-slate-300 flex items-center gap-1">
                                                                    <span>{noteTypeEmoji[lastNote.type] || '📝'}</span>
                                                                    {lastNote.type}
                                                                </span>
                                                                <span className="text-slate-400">{formatDate(lastNote.date)}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300 dark:text-slate-600 text-[10px]">—</span>
                                                        )}
                                                    </td>

                                                    <td className="p-2">
                                                        {lastTouchpoint ? (
                                                            <div className="flex flex-col text-[10px]">
                                                                <span className="font-bold text-slate-600 dark:text-slate-300">
                                                                    {lastTouchpoint.tags?.includes('no-answer') ? '📞 No Answer' : `${noteTypeEmoji[lastTouchpoint.type] || '📝'} ${lastTouchpoint.type}`}
                                                                </span>
                                                                <span className="text-slate-400">{formatDate(lastTouchpoint.date)}</span>
                                                            </div>
                                                        ) : (
                                                            <span className="text-slate-300 dark:text-slate-600 text-[10px]">—</span>
                                                        )}
                                                    </td>

                                                    <td className="p-2 text-center">
                                                        {daysSinceContact === 9999 ? (
                                                            <span className="px-2 py-0.5 rounded-full bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400 text-[9px] font-black uppercase tracking-wide">Never</span>
                                                        ) : (
                                                            <span className={`font-mono text-xs font-bold ${daysSinceContact >= 90 ? 'text-amber-600 dark:text-amber-400' : 'text-slate-600 dark:text-slate-300'}`}>
                                                                {daysSinceContact}d
                                                            </span>
                                                        )}
                                                    </td>

                                                    <td className="p-2 text-center">
                                                        <span className="font-mono text-xs font-bold text-slate-600 dark:text-slate-300">
                                                            {noteCount}
                                                        </span>
                                                    </td>

                                                    <td className="p-2 text-center">
                                                        <div className="w-16 h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden mx-auto">
                                                            <div className={`h-full rounded-full ${urgencyColor} transition-all`} style={{ width: `${urgencyPct}%` }} />
                                                        </div>
                                                    </td>

                                                    <td className="p-2 text-center">
                                                        {bd ? <span className={`text-[10px] font-bold whitespace-nowrap ${bdUpcoming ? 'text-pink-600 dark:text-pink-400' : 'text-slate-400'}`}>{bdUpcoming && '🎂 '}{bd}</span>
                                                            : <span className="text-slate-300 dark:text-slate-600 text-[10px]">—</span>}
                                                    </td>

                                                    <td className="p-2 text-center">
                                                        {ann ? <span className={`text-[10px] font-bold whitespace-nowrap ${annUpcoming ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'}`}>{annUpcoming && '💍 '}{ann}</span>
                                                            : <span className="text-slate-300 dark:text-slate-600 text-[10px]">—</span>}
                                                    </td>

                                                    <td className="p-2 pr-4">
                                                        <div className="flex items-center justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
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

                                                            {onMarkFollowedUp && !followedUpRecently && !dismissed && (
                                                                <button
                                                                    onClick={() => onMarkFollowedUp(person.id)}
                                                                    title="Mark as contacted"
                                                                    className="w-7 h-7 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 hover:bg-emerald-600 text-emerald-500 hover:text-white flex items-center justify-center transition-all"
                                                                >
                                                                    <CheckCircle2 size={12} />
                                                                </button>
                                                            )}

                                                            <button
                                                                onClick={() => window.dispatchEvent(new CustomEvent('openPersonProfile', { detail: person.id }))}
                                                                title={`Open ${person.name}'s profile`}
                                                                className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-600 hover:text-white text-slate-400 flex items-center justify-center transition-all"
                                                            >
                                                                <MessageSquare size={12} />
                                                            </button>

                                                            {onDismiss && (
                                                                dismissed ? (
                                                                    <button
                                                                        onClick={() => onMarkFollowedUp?.(person.id)}
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

                        <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                {sortedRows.length} of {allRows.length} people
                                {directoryStats.dismissed > 0 && !showDismissed && (
                                    <button onClick={() => setShowDismissed(true)} className="ml-3 text-emerald-500 hover:underline">{directoryStats.dismissed} cleared (show)</button>
                                )}
                            </p>
                            <p className="text-[10px] text-slate-300 dark:text-slate-600">
                                Sorted by {sortKey} · {sortDir === 'desc' ? '↓' : '↑'}
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* TAB 2: OUTREACH SESSIONS REPORT                                   */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {activeReportTab === 'sessions' && (
                <div className="space-y-6">
                    {/* Header controls */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Outreach Contact Sessions Report</h3>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-0.5">
                                Campaign effectiveness, queue contact rates, and target member coverage
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <a
                                href="/care/contact"
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold uppercase tracking-wide transition-all shadow-sm"
                            >
                                <Phone size={13} /> Manage Sessions
                            </a>
                            <button
                                onClick={() => exportOutreachSessionsCSV(sessions, slots)}
                                disabled={sessions.length === 0}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wide transition-all shadow-sm"
                            >
                                <Download size={13} /> Export Sessions CSV
                            </button>
                        </div>
                    </div>

                    {/* Summary KPI Cards */}
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                        <div className="p-4 rounded-2xl border bg-indigo-50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/30 flex flex-col gap-1">
                            <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400">{sessionMetrics.totalSessions}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total Campaigns</p>
                            <p className="text-[10px] text-slate-500">{sessionMetrics.activeCount} active · {sessionMetrics.closedCount} closed</p>
                        </div>

                        <div className="p-4 rounded-2xl border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30 flex flex-col gap-1">
                            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400">{sessionMetrics.totalContactedAll}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Total Reached</p>
                            <p className="text-[10px] text-emerald-600 dark:text-emerald-400 font-bold">{sessionMetrics.overallContactRate}% contact rate</p>
                        </div>

                        <div className="p-4 rounded-2xl border bg-rose-50 dark:bg-rose-950/20 border-rose-100 dark:border-rose-900/30 flex flex-col gap-1">
                            <p className="text-2xl font-black text-rose-600 dark:text-rose-400">{sessionMetrics.totalNoAnswerAll}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">No Answers</p>
                            <p className="text-[10px] text-slate-500">Attempted contacts</p>
                        </div>

                        <div className="p-4 rounded-2xl border bg-slate-50 dark:bg-slate-800/60 border-slate-100 dark:border-slate-700 flex flex-col gap-1">
                            <p className="text-2xl font-black text-slate-700 dark:text-slate-200">{sessionMetrics.totalEligibleAll}</p>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Target Members</p>
                            <p className="text-[10px] text-slate-500">Total queue size</p>
                        </div>

                        <div className="p-4 rounded-2xl border bg-violet-50 dark:bg-violet-950/20 border-violet-100 dark:border-violet-900/30 flex flex-col gap-1">
                            <p className="text-2xl font-black text-violet-600 dark:text-violet-400">
                                {sessionMetrics.overallAvgHandleTimeSec ? fmtDurationSeconds(sessionMetrics.overallAvgHandleTimeSec) : '—'}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Avg Call Time</p>
                            <p className="text-[10px] text-slate-500">Per completed call</p>
                        </div>
                    </div>

                    {/* Filter bar */}
                    <div className="bg-white dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                        <div className="flex flex-wrap items-center gap-3 flex-1 min-w-[200px]">
                            <div className="relative flex-1 min-w-[180px]">
                                <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                <input
                                    type="text"
                                    value={outreachSearch}
                                    onChange={e => setOutreachSearch(e.target.value)}
                                    placeholder="Search campaign name…"
                                    className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
                                />
                            </div>

                            <div className="flex gap-1">
                                {(['all', 'active', 'closed'] as const).map(status => (
                                    <button
                                        key={status}
                                        onClick={() => setOutreachSessionFilter(status)}
                                        className={`px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${
                                            outreachSessionFilter === status
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                        }`}
                                    >
                                        {status === 'all' ? 'All Status' : status}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            Showing {sessionMetrics.rows.length} of {sessions.length} sessions
                        </span>
                    </div>

                    {/* Sessions Table */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/50 dark:bg-slate-800/50">
                                        <th className="p-3 pl-4 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">Campaign Session</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Status</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Created</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Target List</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Reached</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">No Answer</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Contact Progress</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Callers</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Avg Speed</th>
                                        <th className="p-3 pr-4 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {sessionMetrics.rows.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} className="py-12 text-center text-slate-400 font-bold uppercase tracking-wide">
                                                No outreach sessions found
                                            </td>
                                        </tr>
                                    ) : sessionMetrics.rows.map(({ session: s, contacted, noAnswer, pending, totalEligible, contactedRate, callerCount, avgHandleTimeSec }) => {
                                        const isClosed = !!s.closedAt;
                                        const filtersList = (s.filters?.riskCategories || []).join(', ') || 'All Members';

                                        return (
                                            <tr key={s.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="p-3 pl-4">
                                                    <div className="flex flex-col">
                                                        <span className="font-bold text-slate-800 dark:text-slate-100 text-sm">{s.name}</span>
                                                        <span className="text-[10px] text-slate-400">Target: {filtersList}</span>
                                                    </div>
                                                </td>

                                                <td className="p-3 text-center">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wide ${
                                                        isClosed 
                                                            ? 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                                            : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400 animate-pulse'
                                                    }`}>
                                                        {isClosed ? 'Closed' : 'Live Active'}
                                                    </span>
                                                </td>

                                                <td className="p-3 text-center text-slate-500 text-[11px] font-medium">
                                                    {formatDate(new Date(s.createdAt).toISOString())}
                                                </td>

                                                <td className="p-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                                                    {totalEligible}
                                                </td>

                                                <td className="p-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                                    {contacted}
                                                </td>

                                                <td className="p-3 text-center font-mono font-bold text-rose-500">
                                                    {noAnswer}
                                                </td>

                                                <td className="p-3 text-center">
                                                    <div className="flex flex-col items-center gap-1 w-28 mx-auto">
                                                        <div className="flex justify-between w-full text-[10px] font-bold text-slate-500">
                                                            <span>{contactedRate}%</span>
                                                            <span>{contacted}/{totalEligible}</span>
                                                        </div>
                                                        <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                            <div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${contactedRate}%` }} />
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="p-3 text-center">
                                                    <span className="inline-flex items-center gap-1 font-mono font-bold text-indigo-600 dark:text-indigo-400">
                                                        <Users size={12} /> {callerCount}
                                                    </span>
                                                </td>

                                                <td className="p-3 text-center font-mono text-slate-600 dark:text-slate-300">
                                                    {fmtDurationSeconds(avgHandleTimeSec)}
                                                </td>

                                                <td className="p-3 pr-4 text-right">
                                                    <button
                                                        onClick={() => setSelectedSessionDetail(selectedSessionDetail?.id === s.id ? null : s)}
                                                        className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 hover:text-white text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-wide transition-all"
                                                    >
                                                        {selectedSessionDetail?.id === s.id ? 'Hide Details' : 'View Session'}
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Selected Session Drilldown Drawer / Card */}
                    {selectedSessionDetail && (
                        <div className="bg-indigo-50/60 dark:bg-indigo-950/20 border border-indigo-200 dark:border-indigo-800/60 rounded-2xl p-6 space-y-4 animate-in slide-in-from-top-4 duration-300">
                            <div className="flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                    <BarChart3 className="text-indigo-600" size={20} />
                                    <h4 className="text-base font-black text-slate-800 dark:text-white">
                                        Session Detail Breakdown: <span className="text-indigo-600">{selectedSessionDetail.name}</span>
                                    </h4>
                                </div>
                                <button
                                    onClick={() => setSelectedSessionDetail(null)}
                                    className="p-1 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                >
                                    <X size={16} />
                                </button>
                            </div>

                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Script Preview</p>
                                    <p className="text-xs text-slate-700 dark:text-slate-300 italic mt-1 line-clamp-2">
                                        {selectedSessionDetail.customScript || 'Standard Care Script'}
                                    </p>
                                </div>
                                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Share URL</p>
                                    <a
                                        href={`/contact/${selectedSessionDetail.id}`}
                                        target="_blank" rel="noreferrer"
                                        className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 mt-1 truncate"
                                    >
                                        /contact/{selectedSessionDetail.id.slice(0, 8)}… <ExternalLink size={11} />
                                    </a>
                                </div>
                                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Batch Size</p>
                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                                        {selectedSessionDetail.batchSize || 3} contacts / volunteer
                                    </p>
                                </div>
                                <div className="bg-white dark:bg-slate-900 p-3 rounded-xl border border-indigo-100 dark:border-indigo-900">
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">Created Timestamp</p>
                                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1">
                                        {new Date(selectedSessionDetail.createdAt).toLocaleString()}
                                    </p>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ═════════════════════════════════════════════════════════════════ */}
            {/* TAB 3: CALLERS & VOLUNTEERS REPORT                                */}
            {/* ═════════════════════════════════════════════════════════════════ */}
            {activeReportTab === 'callers' && (
                <div className="space-y-6">
                    {/* Header controls */}
                    <div className="flex flex-wrap items-center justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-black text-slate-800 dark:text-slate-100">Callers & Volunteers Performance</h3>
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mt-0.5">
                                Leaderboard, volunteer call volume, contact success rates, and call logs
                            </p>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                onClick={() => exportCallersCSV(callerMetrics.rows)}
                                disabled={callerMetrics.rows.length === 0}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wide transition-all shadow-sm"
                            >
                                <Download size={13} /> Export Callers CSV
                            </button>
                            <button
                                onClick={() => exportCallLogsCSV(slots, sessions)}
                                disabled={slots.length === 0}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-xs font-bold uppercase tracking-wide transition-all shadow-sm"
                            >
                                <FileText size={13} /> Export Call Log CSV
                            </button>
                        </div>
                    </div>

                    {/* Top Callers Leaderboard Spotlight */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        <div className="p-4 rounded-2xl border bg-indigo-50 dark:bg-indigo-950/20 border-indigo-100 dark:border-indigo-900/30 flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-indigo-600">
                                <Users size={16} />
                                <span className="text-[10px] font-black uppercase tracking-wide">Active Callers</span>
                            </div>
                            <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">{callerMetrics.totalUniqueCallers}</p>
                            <p className="text-[10px] text-slate-500">Volunteers & team callers</p>
                        </div>

                        <div className="p-4 rounded-2xl border bg-emerald-50 dark:bg-emerald-950/20 border-emerald-100 dark:border-emerald-900/30 flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-emerald-600">
                                <Phone size={16} />
                                <span className="text-[10px] font-black uppercase tracking-wide">Completed Calls</span>
                            </div>
                            <p className="text-2xl font-black text-emerald-600 dark:text-emerald-400 mt-1">{callerMetrics.totalCompletedCalls}</p>
                            <p className="text-[10px] text-slate-500">Total attempts logged</p>
                        </div>

                        <div className="p-4 rounded-2xl border bg-amber-50 dark:bg-amber-950/20 border-amber-100 dark:border-amber-900/30 flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-amber-600">
                                <Award size={16} />
                                <span className="text-[10px] font-black uppercase tracking-wide">Top Volume Caller</span>
                            </div>
                            <p className="text-base font-black text-slate-800 dark:text-slate-100 mt-1 truncate">
                                {callerMetrics.topByVolume ? callerMetrics.topByVolume.name : '—'}
                            </p>
                            <p className="text-[10px] text-amber-600 font-bold">
                                {callerMetrics.topByVolume ? `${callerMetrics.topByVolume.totalCalls} calls handled` : 'No calls yet'}
                            </p>
                        </div>

                        <div className="p-4 rounded-2xl border bg-violet-50 dark:bg-violet-950/20 border-violet-100 dark:border-violet-900/30 flex flex-col gap-1">
                            <div className="flex items-center gap-2 text-violet-600">
                                <Flame size={16} />
                                <span className="text-[10px] font-black uppercase tracking-wide">Top Contact Success</span>
                            </div>
                            <p className="text-base font-black text-slate-800 dark:text-slate-100 mt-1 truncate">
                                {callerMetrics.topByRate ? callerMetrics.topByRate.name : '—'}
                            </p>
                            <p className="text-[10px] text-violet-600 font-bold">
                                {callerMetrics.topByRate ? `${callerMetrics.topByRate.successRate}% reach rate` : 'No data'}
                            </p>
                        </div>
                    </div>

                    {/* Caller Search Bar */}
                    <div className="bg-white dark:bg-slate-900/60 border border-slate-100 dark:border-slate-800 rounded-2xl p-4 flex flex-wrap items-center justify-between gap-3 shadow-sm">
                        <div className="relative flex-1 min-w-[200px]">
                            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={callerSearch}
                                onChange={e => setCallerSearch(e.target.value)}
                                placeholder="Search volunteer name or phone…"
                                className="w-full pl-8 pr-3 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 border border-slate-100 dark:border-slate-700 outline-none focus:ring-2 focus:ring-indigo-400 transition-all"
                            />
                        </div>
                        <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wide">
                            {callerMetrics.rows.length} Callers Ranked
                        </span>
                    </div>

                    {/* Callers Leaderboard Table */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between">
                            <h4 className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                <Award size={14} className="text-amber-500" /> Volunteer Caller Leaderboard
                            </h4>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/30 dark:bg-slate-800/30">
                                        <th className="p-3 pl-4 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">Rank & Caller</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">Phone Identity</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Sessions</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Total Calls</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Reached</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">No Answer</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Success Rate</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Avg Call Time</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Notes Logged</th>
                                        <th className="p-3 pr-4 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-right">Last Active</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {callerMetrics.rows.length === 0 ? (
                                        <tr>
                                            <td colSpan={10} className="py-12 text-center text-slate-400 font-bold uppercase tracking-wide">
                                                No caller data recorded yet
                                            </td>
                                        </tr>
                                    ) : callerMetrics.rows.map((caller, idx) => {
                                        const medal = idx === 0 ? '🥇' : idx === 1 ? '🥈' : idx === 2 ? '🥉' : `#${idx + 1}`;

                                        return (
                                            <tr key={caller.phone + idx} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="p-3 pl-4">
                                                    <div className="flex items-center gap-2.5">
                                                        <span className="text-sm font-black text-slate-400 w-6 text-center">{medal}</span>
                                                        <div className="flex flex-col">
                                                            <span className="font-bold text-slate-800 dark:text-slate-100">{caller.name}</span>
                                                        </div>
                                                    </div>
                                                </td>

                                                <td className="p-3 font-mono text-slate-600 dark:text-slate-400 text-[11px]">
                                                    {caller.phone !== 'Unknown' ? maskPhone(caller.phone) : '—'}
                                                </td>

                                                <td className="p-3 text-center font-mono font-bold text-slate-700 dark:text-slate-300">
                                                    {caller.sessionCount}
                                                </td>

                                                <td className="p-3 text-center font-mono font-bold text-slate-800 dark:text-slate-100 text-sm">
                                                    {caller.totalCalls}
                                                </td>

                                                <td className="p-3 text-center font-mono font-bold text-emerald-600 dark:text-emerald-400">
                                                    {caller.contacted}
                                                </td>

                                                <td className="p-3 text-center font-mono font-bold text-rose-500">
                                                    {caller.noAnswer}
                                                </td>

                                                <td className="p-3 text-center">
                                                    <span className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-black font-mono ${
                                                        caller.successRate >= 60 ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                                        : caller.successRate >= 30 ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400'
                                                        : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                                    }`}>
                                                        {caller.successRate}%
                                                    </span>
                                                </td>

                                                <td className="p-3 text-center font-mono text-slate-600 dark:text-slate-300">
                                                    {fmtDurationSeconds(caller.avgHandleTimeSec)}
                                                </td>

                                                <td className="p-3 text-center font-mono font-bold text-slate-600 dark:text-slate-300">
                                                    {caller.notesLogged}
                                                </td>

                                                <td className="p-3 pr-4 text-right text-slate-400 text-[10px] font-medium">
                                                    {caller.lastActiveAt ? formatDate(new Date(caller.lastActiveAt).toISOString()) : '—'}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* Detailed Call Log Section */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-wrap items-center justify-between gap-3">
                            <h4 className="text-xs font-black uppercase tracking-wide text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                <Activity size={14} className="text-indigo-500" /> Live Completed Call Log
                            </h4>

                            <div className="flex items-center gap-2">
                                {(['all', 'contacted', 'no-answer'] as const).map(out => (
                                    <button
                                        key={out}
                                        onClick={() => setCallerOutcomeFilter(out)}
                                        className={`px-2.5 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${
                                            callerOutcomeFilter === out
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-white dark:bg-slate-800 text-slate-500 border border-slate-200 dark:border-slate-700 hover:text-indigo-600'
                                        }`}
                                    >
                                        {out === 'all' ? 'All Outcomes' : out}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left text-xs border-collapse">
                                <thead>
                                    <tr className="bg-slate-50/30 dark:bg-slate-800/30">
                                        <th className="p-3 pl-4 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">Time & Date</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">Volunteer Caller</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">Target Member</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Outcome</th>
                                        <th className="p-3 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Handle Speed</th>
                                        <th className="p-3 pr-4 text-[10px] font-black uppercase tracking-wide text-slate-400 border-b border-slate-100 dark:border-slate-800">Caller Note</th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {callerMetrics.callLog.length === 0 ? (
                                        <tr>
                                            <td colSpan={6} className="py-10 text-center text-slate-400 font-bold uppercase tracking-wide">
                                                No call records match the current filter
                                            </td>
                                        </tr>
                                    ) : callerMetrics.callLog.slice(0, 50).map(slot => {
                                        const ts = slot.completedAt || slot.assignedAt;
                                        const durSec = slot.completedAt && slot.assignedAt && slot.completedAt > slot.assignedAt
                                            ? Math.round((slot.completedAt - slot.assignedAt) / 1000)
                                            : null;

                                        return (
                                            <tr key={slot.id} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="p-3 pl-4 font-mono text-slate-500 text-[11px]">
                                                    {new Date(ts).toLocaleString()}
                                                </td>

                                                <td className="p-3 font-bold text-slate-800 dark:text-slate-200">
                                                    {slot.volunteerName || maskPhone(slot.volunteerPhone)}
                                                </td>

                                                <td className="p-3 font-bold text-indigo-600 dark:text-indigo-400">
                                                    {slot.assignedPersonName}
                                                </td>

                                                <td className="p-3 text-center">
                                                    <span className={`inline-block px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide ${
                                                        slot.status === 'contacted'
                                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-400'
                                                            : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-400'
                                                    }`}>
                                                        {slot.status === 'contacted' ? 'Reached' : 'No Answer'}
                                                    </span>
                                                </td>

                                                <td className="p-3 text-center font-mono text-slate-600 dark:text-slate-400">
                                                    {fmtDurationSeconds(durSec)}
                                                </td>

                                                <td className="p-3 pr-4 text-slate-600 dark:text-slate-300 italic text-[11px]">
                                                    {slot.notes || <span className="text-slate-300 dark:text-slate-600 not-italic">No note recorded</span>}
                                                </td>
                                            </tr>
                                        );
                                    })}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
