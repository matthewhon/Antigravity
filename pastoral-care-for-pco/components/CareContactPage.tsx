import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import {
    Phone, QrCode, Link2, Plus, Trash2, Copy, Check, ChevronDown,
    Users, Activity, PhoneOff, RefreshCw, Eye, EyeOff, X, ToggleLeft, ToggleRight,
    Clock, Shield
} from 'lucide-react';
import { OutreachSession, OutreachSlot, PcoPerson, User, Church } from '../types';
import { firestore } from '../services/firestoreService';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const maskPhone = (phone: string): string => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length < 7) return phone;
    return `(${digits.slice(0, 3)}) ***-${digits.slice(-4)}`;
};

const formatTime = (ts: number): string =>
    new Date(ts).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

const formatDateTime = (ts: number): string =>
    new Date(ts).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

const timeSince = (ts: number): string => {
    const diff = Date.now() - ts;
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return 'Just now';
    if (mins === 1) return '1 min ago';
    if (mins < 60) return `${mins} mins ago`;
    const hrs = Math.floor(mins / 60);
    return hrs === 1 ? '1 hr ago' : `${hrs} hrs ago`;
};

// ─── Status Badge ─────────────────────────────────────────────────────────────

const StatusBadge: React.FC<{ status: OutreachSlot['status'] }> = ({ status }) => {
    const cfg = {
        pending:   { label: 'In Progress',  cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
        contacted: { label: 'Contacted',    cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
        'no-answer': { label: 'No Answer', cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
    }[status];
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide whitespace-nowrap ${cfg.cls}`}>
            {cfg.label}
        </span>
    );
};

// ─── QR Code Canvas ───────────────────────────────────────────────────────────

const QrCanvas: React.FC<{ url: string; size?: number }> = ({ url, size = 160 }) => {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    useEffect(() => {
        if (!canvasRef.current || !url) return;
        QRCode.toCanvas(canvasRef.current, url, {
            width: size, margin: 1,
            color: { dark: '#1e293b', light: '#ffffff' }
        });
    }, [url, size]);
    return <canvas ref={canvasRef} className="rounded-xl shadow" />;
};

// ─── Create / Edit Session Modal ──────────────────────────────────────────────

const RISK_CATEGORIES: OutreachSession['filters']['riskCategories'] = ['Disconnected', 'At Risk', 'Healthy'];

interface SessionModalProps {
    memberStatuses: string[];
    onSave: (draft: Pick<OutreachSession, 'name' | 'filters'>) => void;
    onClose: () => void;
    initial?: Pick<OutreachSession, 'name' | 'filters'>;
}

const SessionModal: React.FC<SessionModalProps> = ({ memberStatuses, onSave, onClose, initial }) => {
    const [name, setName] = useState(initial?.name ?? '');
    const [riskCats, setRiskCats] = useState<OutreachSession['filters']['riskCategories']>(
        initial?.filters.riskCategories ?? ['Disconnected', 'At Risk']
    );
    const [membershipSels, setMembershipSels] = useState<string[]>(
        initial?.filters.membershipStatuses ?? []
    );

    const toggleRisk = (cat: 'Healthy' | 'At Risk' | 'Disconnected') => {
        setRiskCats(prev => prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]);
    };

    const toggleMembership = (s: string) => {
        setMembershipSels(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);
    };

    const handleSave = () => {
        if (!name.trim()) return;
        onSave({ name: name.trim(), filters: { riskCategories: riskCats, membershipStatuses: membershipSels } });
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-md p-8 animate-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
                <div className="flex items-center justify-between mb-6">
                    <h3 className="text-lg font-black dark:text-white">
                        {initial ? 'Edit Session' : 'New Outreach Session'}
                    </h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-rose-500 transition-colors"><X size={18} /></button>
                </div>

                <div className="space-y-5">
                    {/* Name */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-1.5">Session Name</label>
                        <input
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="e.g. June At-Risk Outreach"
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 text-sm font-medium focus:ring-2 focus:ring-indigo-500 outline-none dark:text-white"
                        />
                    </div>

                    {/* Risk Categories */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Include Risk Categories</label>
                        <div className="flex flex-wrap gap-2">
                            {RISK_CATEGORIES.map(cat => {
                                const active = riskCats.includes(cat);
                                const colorMap = {
                                    Disconnected: active ? 'bg-rose-600 text-white border-rose-600' : 'border-rose-200 text-rose-500 dark:border-rose-900 dark:text-rose-400',
                                    'At Risk':    active ? 'bg-amber-500 text-white border-amber-500' : 'border-amber-200 text-amber-600 dark:border-amber-900 dark:text-amber-400',
                                    Healthy:      active ? 'bg-emerald-600 text-white border-emerald-600' : 'border-emerald-200 text-emerald-600 dark:border-emerald-900 dark:text-emerald-400',
                                };
                                return (
                                    <button key={cat} onClick={() => toggleRisk(cat)}
                                        className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide border-2 transition-all ${colorMap[cat]}`}>
                                        {cat}
                                    </button>
                                );
                            })}
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1.5">Leave Healthy unchecked to focus on people who need outreach.</p>
                    </div>

                    {/* Membership Filter */}
                    {memberStatuses.length > 0 && (
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">
                                Filter by Membership <span className="font-medium text-slate-300">(empty = all)</span>
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {memberStatuses.map(s => {
                                    const active = membershipSels.includes(s);
                                    return (
                                        <button key={s} onClick={() => toggleMembership(s)}
                                            className={`px-3 py-1.5 rounded-lg text-xs font-black uppercase tracking-wide border-2 transition-all ${
                                                active ? 'bg-indigo-600 text-white border-indigo-600' : 'border-slate-200 text-slate-600 dark:border-slate-700 dark:text-slate-300'
                                            }`}>
                                            {s}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}
                </div>

                <button
                    onClick={handleSave}
                    disabled={!name.trim() || riskCats.length === 0}
                    className="mt-6 w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg transition-all"
                >
                    {initial ? 'Save Changes' : 'Create Session'}
                </button>
            </div>
        </div>
    );
};

// ─── Live Contact Board ───────────────────────────────────────────────────────

const LiveBoard: React.FC<{ slots: OutreachSlot[]; totalCount: number }> = ({ slots, totalCount }) => {
    const [showNotes, setShowNotes] = useState<string | null>(null);

    const contacted   = slots.filter(s => s.status === 'contacted').length;
    const noAnswer    = slots.filter(s => s.status === 'no-answer').length;
    const inProgress  = slots.filter(s => s.status === 'pending').length;
    const pct = totalCount > 0 ? Math.round(((contacted + noAnswer) / totalCount) * 100) : 0;

    const staleThreshold = Date.now() - 30 * 60 * 1000; // 30 min

    return (
        <div className="space-y-4">
            {/* Progress Header */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl p-5 border border-slate-100 dark:border-slate-800">
                <div className="flex items-center justify-between mb-3">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Session Progress</p>
                    <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-black">
                        <Activity size={11} className="animate-pulse" />
                        LIVE
                    </div>
                </div>
                <div className="flex items-end gap-2 mb-3">
                    <span className="text-3xl font-black dark:text-white">{contacted + noAnswer}</span>
                    <span className="text-slate-400 text-sm font-bold pb-1">of {totalCount} attempted</span>
                </div>
                <div className="w-full bg-slate-100 dark:bg-slate-800 rounded-full h-2 mb-3 overflow-hidden">
                    <div className="bg-indigo-500 h-2 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                </div>
                <div className="flex gap-4 text-[10px] font-black uppercase tracking-wide">
                    <div className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <Check size={10} /> {contacted} Contacted
                    </div>
                    <div className="flex items-center gap-1 text-rose-500">
                        <PhoneOff size={10} /> {noAnswer} No Answer
                    </div>
                    <div className="flex items-center gap-1 text-amber-500">
                        <Clock size={10} /> {inProgress} Active
                    </div>
                </div>
            </div>

            {/* Slots Table */}
            {slots.length === 0 ? (
                <div className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-8 text-center border border-dashed border-slate-200 dark:border-slate-700">
                    <Phone size={24} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-xs font-bold text-slate-400">No contacts recorded yet.</p>
                    <p className="text-[11px] text-slate-400 mt-1">Share the link below to get started.</p>
                </div>
            ) : (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                    <table className="w-full text-left">
                        <thead>
                            <tr className="border-b border-slate-100 dark:border-slate-800">
                                <th className="p-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Volunteer</th>
                                <th className="p-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Person</th>
                                <th className="p-3 text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">Status</th>
                                <th className="p-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Time</th>
                                <th className="p-3 text-[9px] font-black uppercase tracking-widest text-slate-400">Notes</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[...slots].reverse().map(slot => {
                                const isStale = slot.status === 'pending' && slot.assignedAt < staleThreshold;
                                return (
                                    <tr key={slot.id} className={`border-b border-slate-50 dark:border-slate-800/50 ${isStale ? 'bg-amber-50/50 dark:bg-amber-900/10' : ''}`}>
                                        <td className="p-3">
                                            <div className="flex items-center gap-2">
                                                <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                                                    <Phone size={11} className="text-indigo-500" />
                                                </div>
                                                <span className="text-xs font-mono text-slate-600 dark:text-slate-300">
                                                    {maskPhone(slot.volunteerPhone)}
                                                </span>
                                                {isStale && (
                                                    <span className="text-[9px] font-black uppercase text-amber-600 bg-amber-100 dark:bg-amber-900/40 rounded px-1">Stale</span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-3">
                                            <p className="text-xs font-bold text-slate-900 dark:text-white">{slot.assignedPersonName}</p>
                                            {slot.assignedPersonPhone && (
                                                <p className="text-[10px] text-slate-400">{slot.assignedPersonPhone}</p>
                                            )}
                                        </td>
                                        <td className="p-3 text-center">
                                            <StatusBadge status={slot.status} />
                                            {slot.status === 'no-answer' && slot.noAnswerUntil && (
                                                <p className="text-[9px] text-slate-400 mt-1 whitespace-nowrap">
                                                    Re-queue: {formatDateTime(slot.noAnswerUntil)}
                                                </p>
                                            )}
                                        </td>
                                        <td className="p-3 text-[10px] text-slate-400 whitespace-nowrap">
                                            {formatTime(slot.assignedAt)}
                                        </td>
                                        <td className="p-3">
                                            {slot.notes ? (
                                                <button
                                                    onClick={() => setShowNotes(showNotes === slot.id ? null : slot.id)}
                                                    className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 flex items-center gap-1"
                                                >
                                                    {showNotes === slot.id ? <EyeOff size={10} /> : <Eye size={10} />}
                                                    {showNotes === slot.id ? 'Hide' : 'View'}
                                                </button>
                                            ) : (
                                                <span className="text-[10px] text-slate-300">—</span>
                                            )}
                                            {showNotes === slot.id && slot.notes && (
                                                <div className="mt-1.5 p-2 bg-slate-50 dark:bg-slate-800 rounded-lg text-[11px] text-slate-600 dark:text-slate-300 max-w-[200px]">
                                                    {slot.notes}
                                                </div>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

// ─── Main Component ───────────────────────────────────────────────────────────

interface CareContactPageProps {
    church: Church;
    user: User;
    people: PcoPerson[];
}

export const CareContactPage: React.FC<CareContactPageProps> = ({ church, user, people }) => {
    const [sessions, setSessions]         = useState<OutreachSession[]>([]);
    const [selectedId, setSelectedId]     = useState<string | null>(null);
    const [isModalOpen, setIsModalOpen]   = useState(false);
    const [copied, setCopied]             = useState(false);
    const [isLoading, setIsLoading]       = useState(true);
    const [qrDataUrl, setQrDataUrl]       = useState('');
    const [refreshInterval, setRefreshInterval] = useState(60); // seconds
    const [countdown, setCountdown]       = useState(60);
    // Real-time slots for selected session (used by left counter + queue sort)
    const [liveSlots, setLiveSlots]       = useState<OutreachSlot[]>([]);

    // Load sessions
    useEffect(() => {
        firestore.getOutreachSessions(church.id).then(data => {
            setSessions(data);
            if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
            setIsLoading(false);
        });
    }, [church.id]);

    // Subscribe to slots for selected session (live counter + queue sort)
    useEffect(() => {
        if (!selectedId) { setLiveSlots([]); return; }
        const unsub = firestore.subscribeToOutreachSlots(selectedId, setLiveSlots);
        return () => unsub();
    }, [selectedId]);

    // Auto-refresh countdown — fires handleRefreshQueue via ref to avoid stale closure
    const refreshHandlerRef = useRef<() => void>(() => {});
    useEffect(() => {
        refreshHandlerRef.current = handleRefreshQueue;
    });

    useEffect(() => {
        if (!selectedId) return;
        setCountdown(refreshInterval);
        const tick = setInterval(() => {
            setCountdown(prev => {
                if (prev <= 1) {
                    refreshHandlerRef.current();
                    return refreshInterval;
                }
                return prev - 1;
            });
        }, 1000);
        return () => clearInterval(tick);
    }, [selectedId, refreshInterval]);

    const selectedSession = useMemo(
        () => sessions.find(s => s.id === selectedId) ?? null,
        [sessions, selectedId]
    );

    // Build public URL
    const publicUrl = useMemo(() => {
        if (!selectedSession) return '';
        return `${window.location.protocol}//${window.location.host}/contact/${selectedSession.id}`;
    }, [selectedSession]);

    // Generate QR data URL when session changes
    useEffect(() => {
        if (!publicUrl) { setQrDataUrl(''); return; }
        QRCode.toDataURL(publicUrl, { width: 300, margin: 2, color: { dark: '#1e293b', light: '#ffffff' } })
            .then(setQrDataUrl)
            .catch(() => setQrDataUrl(''));
    }, [publicUrl]);

    // Derive unique membership statuses for the modal
    const memberStatuses = useMemo(() => {
        const s = new Set<string>();
        people.forEach(p => { if (p.status?.toLowerCase() !== 'inactive') s.add(p.membership || 'None'); });
        return Array.from(s).sort();
    }, [people]);

    // Build denormalized eligible people list for a given filter config
    const buildEligiblePeople = useCallback((
        allPeople: typeof people,
        filters: OutreachSession['filters']
    ) => {
        const { riskCategories, membershipStatuses } = filters;
        return allPeople
            .filter(p => {
                if (p.status?.toLowerCase() === 'inactive') return false;
                // Must have at least a phone or email to be contactable
                if (!p.phone && !p.email) return false;
                if (riskCategories.length > 0 && !riskCategories.includes(p.riskProfile?.category as any)) return false;
                if (membershipStatuses.length > 0 && !membershipStatuses.includes(p.membership || 'None')) return false;
                return true;
            })
            .sort((a, b) => (a.riskProfile?.score ?? 0) - (b.riskProfile?.score ?? 0))
            .map(p => ({
                id: p.id,
                name: p.name,
                phone: p.phone ?? null,
                email: p.email ?? null,
                riskScore: p.riskProfile?.score ?? 0,
            }));
    }, []);

    // Filter + sort people for the queue preview using live slot data
    // Order: 1) Never contacted (no slot) sorted by risk score asc
    //        2) No-answer with expired cooldown, sorted by oldest attempt first
    //        3) Active pending (being called right now)
    //        4) On 24h cooldown (greyed out)
    //        5) Already contacted (bottom)
    const filteredPeople = useMemo(() => {
        if (!selectedSession) return [];
        const { riskCategories, membershipStatuses } = selectedSession.filters;
        const base = people.filter(p => {
            if (p.status?.toLowerCase() === 'inactive') return false;
            if (!p.phone && !p.email) return false;
            if (riskCategories.length > 0 && !riskCategories.includes(p.riskProfile?.category as any)) return false;
            if (membershipStatuses.length > 0 && !membershipStatuses.includes(p.membership || 'None')) return false;
            return true;
        });

        const now = Date.now();

        // Build a map of personId -> their most recent slot
        const latestSlot = new Map<string, OutreachSlot>();
        for (const slot of liveSlots) {
            const existing = latestSlot.get(slot.assignedPersonId);
            if (!existing || slot.assignedAt > existing.assignedAt) {
                latestSlot.set(slot.assignedPersonId, slot);
            }
        }

        const getGroup = (p: typeof people[0]): number => {
            const slot = latestSlot.get(p.id);
            if (!slot) return 0;                                          // Never contacted
            if (slot.status === 'pending') return 2;                      // Being worked right now
            if (slot.status === 'no-answer') {
                if (!slot.noAnswerUntil || slot.noAnswerUntil <= now) return 1; // Cooldown expired — re-queue
                return 3;                                                   // On cooldown
            }
            if (slot.status === 'contacted') return 4;                    // Done
            return 0;
        };

        return [...base].sort((a, b) => {
            const ga = getGroup(a);
            const gb = getGroup(b);
            if (ga !== gb) return ga - gb;
            // Within group 0 (never contacted): sort by risk score asc
            if (ga === 0) return (a.riskProfile?.score ?? 0) - (b.riskProfile?.score ?? 0);
            // Within group 1 (expired cooldown): sort by oldest noAnswerUntil first
            if (ga === 1) {
                const sa = latestSlot.get(a.id);
                const sb = latestSlot.get(b.id);
                return (sa?.noAnswerUntil ?? 0) - (sb?.noAnswerUntil ?? 0);
            }
            return (a.riskProfile?.score ?? 0) - (b.riskProfile?.score ?? 0);
        });
    }, [selectedSession, people, liveSlots]);

    const handleCreateSession = async (draft: Pick<OutreachSession, 'name' | 'filters'>) => {
        const id = `os_${church.id}_${Date.now()}`;
        // Build the eligible people list from current people data
        const eligible = buildEligiblePeople(people, draft.filters);
        const newSession: OutreachSession = {
            id, churchId: church.id,
            name: draft.name, filters: draft.filters,
            eligiblePeople: eligible,
            createdAt: Date.now(), createdBy: user.id, isActive: true
        };
        await firestore.createOutreachSession(newSession);
        setSessions(prev => [newSession, ...prev]);
        setSelectedId(id);
        setIsModalOpen(false);
    };

    const handleRefreshQueue = async () => {
        if (!selectedSession) return;
        const eligible = buildEligiblePeople(people, selectedSession.filters);
        const updates = { eligiblePeople: eligible };
        await firestore.updateOutreachSession(selectedSession.id, updates);
        setSessions(prev => prev.map(s => s.id === selectedSession.id ? { ...s, ...updates } : s));
    };

    const handleToggleActive = async (session: OutreachSession) => {
        const updates = { isActive: !session.isActive };
        await firestore.updateOutreachSession(session.id, updates);
        setSessions(prev => prev.map(s => s.id === session.id ? { ...s, ...updates } : s));
    };

    const handleDeleteSession = async (sessionId: string) => {
        if (!confirm('Delete this session? This cannot be undone.')) return;
        await firestore.deleteOutreachSession(sessionId);
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (selectedId === sessionId) setSelectedId(sessions.find(s => s.id !== sessionId)?.id ?? null);
    };

    const handleCopyLink = () => {
        navigator.clipboard.writeText(publicUrl);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    const handleDownloadQr = () => {
        if (!qrDataUrl) return;
        const a = document.createElement('a');
        a.href = qrDataUrl;
        a.download = `outreach-qr-${selectedSession?.name ?? 'session'}.png`;
        a.click();
    };

    if (isLoading) {
        return (
            <div className="flex items-center justify-center py-20">
                <div className="animate-spin w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full" />
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-2xl font-black dark:text-white tracking-tight flex items-center gap-2">
                        <Phone className="text-indigo-500" size={22} />
                        Outreach Contact
                    </h2>
                    <p className="text-xs text-slate-400 font-medium mt-1">
                        Run a distributed call center — share a link so volunteers can contact people from the risk list.
                    </p>
                </div>
                <button
                    onClick={() => setIsModalOpen(true)}
                    className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2.5 rounded-xl text-xs font-black uppercase tracking-widest shadow-lg transition-all"
                >
                    <Plus size={14} /> New Session
                </button>
            </div>

            {sessions.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-24 bg-slate-50 dark:bg-slate-900 rounded-[2rem] border border-dashed border-slate-200 dark:border-slate-700">
                    <Phone size={36} className="text-slate-300 mb-4" />
                    <h3 className="text-lg font-black dark:text-white mb-2">No Outreach Sessions Yet</h3>
                    <p className="text-sm text-slate-400 mb-6 text-center max-w-xs">
                        Create a session to get a shareable link and QR code that volunteers can use to contact people on the risk list.
                    </p>
                    <button
                        onClick={() => setIsModalOpen(true)}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg transition-all"
                    >
                        Create First Session
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">

                    {/* Left: Session List */}
                    <div className="lg:col-span-1 space-y-2">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">Sessions</p>
                        {sessions.map(s => {
                            const isSelected = selectedId === s.id;
                            const contacted  = isSelected ? liveSlots.filter(sl => sl.status === 'contacted').length : null;
                            const noAnswer   = isSelected ? liveSlots.filter(sl => sl.status === 'no-answer').length : null;
                            const total      = isSelected ? (s.eligiblePeople?.length ?? 0) : null;
                            return (
                            <button
                                key={s.id}
                                onClick={() => setSelectedId(s.id)}
                                className={`w-full text-left p-3 rounded-xl border transition-all ${
                                    isSelected
                                        ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
                                        : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-slate-700'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className={`text-xs font-black truncate ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-white'}`}>
                                            {s.name}
                                        </p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                            {new Date(s.createdAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                        s.isActive
                                            ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                            : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                    }`}>
                                        {s.isActive ? 'Active' : 'Paused'}
                                    </span>
                                </div>
                                {/* Filter tags */}
                                <div className="flex flex-wrap gap-1 mt-2">
                                    {s.filters.riskCategories.map(cat => (
                                        <span key={cat} className="text-[8px] font-black uppercase px-1.5 py-0.5 rounded bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400">
                                            {cat}
                                        </span>
                                    ))}
                                </div>
                                {/* Live counters (selected session only) */}
                                {isSelected && total !== null && liveSlots.length > 0 && (
                                    <div className="mt-2.5 flex items-center gap-2">
                                        <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-full h-1 overflow-hidden">
                                            <div
                                                className="bg-emerald-500 h-1 rounded-full transition-all duration-700"
                                                style={{ width: `${total > 0 ? Math.round(((contacted ?? 0) + (noAnswer ?? 0)) / total * 100) : 0}%` }}
                                            />
                                        </div>
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-emerald-600 dark:text-emerald-400">
                                                <Check size={9} /> {contacted}
                                            </span>
                                            <span className="text-slate-300 text-[9px]">·</span>
                                            <span className="inline-flex items-center gap-0.5 text-[9px] font-black text-rose-500">
                                                <PhoneOff size={9} /> {noAnswer}
                                            </span>
                                        </div>
                                    </div>
                                )}
                            </button>
                            );
                        })}
                    </div>

                    {/* Right: Session Detail */}
                    {selectedSession ? (
                        <div className="lg:col-span-3 space-y-5">

                            {/* Session Actions Bar */}
                            <div className="bg-white dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4 flex-wrap">
                                <div>
                                    <h3 className="text-base font-black dark:text-white">{selectedSession.name}</h3>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                        {filteredPeople.length} people in queue &bull; Created {new Date(selectedSession.createdAt).toLocaleDateString()}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        onClick={handleRefreshQueue}
                                        title="Re-sync the eligible people list from current risk data"
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide text-indigo-600 hover:bg-indigo-50 dark:text-indigo-400 dark:hover:bg-indigo-900/20 transition-all border border-indigo-200 dark:border-indigo-800"
                                    >
                                        <RefreshCw size={12} /> Refresh Queue
                                    </button>
                                    <button
                                        onClick={() => handleToggleActive(selectedSession)}
                                        className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide transition-all border ${
                                            selectedSession.isActive
                                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:border-emerald-800 dark:text-emerald-400'
                                                : 'bg-slate-50 text-slate-600 border-slate-200 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'
                                        }`}
                                        title={selectedSession.isActive ? 'Pause session' : 'Activate session'}
                                    >
                                        {selectedSession.isActive ? <ToggleRight size={14} /> : <ToggleLeft size={14} />}
                                        {selectedSession.isActive ? 'Active' : 'Paused'}
                                    </button>
                                    <button
                                        onClick={() => handleDeleteSession(selectedSession.id)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all border border-transparent hover:border-rose-200 dark:hover:border-rose-800"
                                    >
                                        <Trash2 size={12} /> Delete
                                    </button>
                                </div>
                            </div>

                            {/* Share Panel */}
                            <div className="bg-gradient-to-br from-indigo-600 to-violet-700 rounded-2xl p-6 text-white shadow-xl shadow-indigo-200/40 dark:shadow-indigo-900/30">
                                <div className="flex items-start gap-6 flex-wrap">
                                    {/* QR Code */}
                                    <div className="shrink-0">
                                        <div className="bg-white rounded-2xl p-3 shadow-lg">
                                            <QrCanvas url={publicUrl} size={140} />
                                        </div>
                                        <button
                                            onClick={handleDownloadQr}
                                            className="mt-2 text-[10px] font-black uppercase tracking-wide text-indigo-200 hover:text-white transition-colors flex items-center gap-1 w-full justify-center"
                                        >
                                            <QrCode size={10} /> Download QR
                                        </button>
                                    </div>

                                    {/* Link */}
                                    <div className="flex-1 min-w-[200px]">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-1">Share Link</p>
                                        <p className="text-lg font-black leading-tight mb-3">{selectedSession.name}</p>
                                        <p className="text-xs text-indigo-100 mb-4">
                                            Share this link or QR code with your volunteers. They'll enter their phone number and be automatically assigned someone to contact.
                                        </p>

                                        <div className="bg-white/10 rounded-xl px-3 py-2.5 flex items-center gap-2 mb-3">
                                            <Link2 size={12} className="text-indigo-200 shrink-0" />
                                            <span className="text-xs font-mono text-white/80 truncate flex-1">{publicUrl}</span>
                                        </div>

                                        <div className="flex gap-2">
                                            <button
                                                onClick={handleCopyLink}
                                                className="flex-1 flex items-center justify-center gap-2 bg-white text-indigo-700 py-2.5 rounded-xl text-[11px] font-black uppercase tracking-widest hover:bg-indigo-50 transition-all"
                                            >
                                                {copied ? <Check size={13} /> : <Copy size={13} />}
                                                {copied ? 'Copied!' : 'Copy Link'}
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {!selectedSession.isActive && (
                                    <div className="mt-4 bg-amber-400/20 border border-amber-300/30 rounded-xl px-4 py-3 text-xs font-bold text-amber-100 flex items-center gap-2">
                                        <Shield size={14} /> This session is paused. Volunteers who visit the link will see a "Session Paused" message.
                                    </div>
                                )}
                            </div>

                            {/* People Queue Preview */}
                            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden">
                                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex-wrap gap-2">
                                    <div className="flex items-center gap-2">
                                        <Users size={14} className="text-indigo-500" />
                                        <p className="text-xs font-black uppercase tracking-widest text-slate-600 dark:text-slate-300">
                                            Queue Preview ({filteredPeople.length} people)
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-3">
                                        {/* Filter tags */}
                                        <div className="flex flex-wrap gap-1">
                                            {selectedSession.filters.riskCategories.map(cat => (
                                                <span key={cat} className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400">
                                                    {cat}
                                                </span>
                                            ))}
                                            {selectedSession.filters.membershipStatuses.map(s => (
                                                <span key={s} className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                        {/* Auto-refresh control */}
                                        <div className="flex items-center gap-1.5 shrink-0">
                                            {/* Countdown ring */}
                                            <div className="relative w-6 h-6">
                                                <svg className="w-6 h-6 -rotate-90" viewBox="0 0 24 24">
                                                    <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" className="text-slate-100 dark:text-slate-800" />
                                                    <circle
                                                        cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2"
                                                        className="text-indigo-500 transition-all"
                                                        strokeDasharray={`${2 * Math.PI * 10}`}
                                                        strokeDashoffset={`${2 * Math.PI * 10 * (1 - countdown / refreshInterval)}`}
                                                        strokeLinecap="round"
                                                    />
                                                </svg>
                                                <span className="absolute inset-0 flex items-center justify-center text-[7px] font-black text-slate-500 dark:text-slate-400">
                                                    {countdown}
                                                </span>
                                            </div>
                                            <label className="text-[9px] font-black uppercase tracking-wide text-slate-400 whitespace-nowrap">Refresh every</label>
                                            <input
                                                type="number"
                                                min={10}
                                                max={3600}
                                                value={refreshInterval}
                                                onChange={e => {
                                                    const v = Math.max(10, parseInt(e.target.value) || 60);
                                                    setRefreshInterval(v);
                                                }}
                                                className="w-14 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg px-2 py-1 text-[10px] font-black text-center text-slate-700 dark:text-slate-200 outline-none focus:ring-1 focus:ring-indigo-400"
                                            />
                                            <label className="text-[9px] font-black uppercase tracking-wide text-slate-400">sec</label>
                                        </div>
                                    </div>
                                </div>
                                <div className="max-h-[300px] overflow-y-auto">
                                    {filteredPeople.length === 0 ? (
                                        <div className="py-10 text-center text-xs text-slate-400 font-bold">
                                            No people match these filters.
                                        </div>
                                    ) : (
                                        <table className="w-full text-left">
                                            <thead className="sticky top-0 bg-white dark:bg-slate-900 border-b border-slate-100 dark:border-slate-800">
                                                <tr>
                                                    <th className="p-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">#</th>
                                                    <th className="p-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Name</th>
                                                    <th className="p-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Status</th>
                                                    <th className="p-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Risk</th>
                                                    <th className="p-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Phone</th>
                                                    <th className="p-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Email</th>
                                                    <th className="p-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Membership</th>
                                                </tr>
                                            </thead>
                                            <tbody>
                                                {filteredPeople.map((person, idx) => {
                                                    const cat = person.riskProfile?.category ?? 'Disconnected';
                                                    const catColor = cat === 'Healthy' ? 'text-emerald-600' : cat === 'At Risk' ? 'text-amber-600' : 'text-rose-600';
                                                    const now = Date.now();

                                                    // Find latest slot for this person
                                                    const slot = liveSlots
                                                        .filter(sl => sl.assignedPersonId === person.id)
                                                        .sort((a, b) => b.assignedAt - a.assignedAt)[0];

                                                    const isContacted  = slot?.status === 'contacted';
                                                    const isPending    = slot?.status === 'pending';
                                                    const isNoAnswer   = slot?.status === 'no-answer';
                                                    const onCooldown   = isNoAnswer && slot?.noAnswerUntil && slot.noAnswerUntil > now;
                                                    const reQueued     = isNoAnswer && (!slot?.noAnswerUntil || slot.noAnswerUntil <= now);
                                                    const neverContact = !slot;

                                                    const rowBg =
                                                        isContacted ? 'bg-emerald-50/60 dark:bg-emerald-900/10 opacity-60' :
                                                        onCooldown  ? 'bg-slate-50 dark:bg-slate-800/30 opacity-50' :
                                                        isPending   ? 'bg-blue-50/40 dark:bg-blue-900/10' :
                                                        reQueued    ? 'bg-amber-50/50 dark:bg-amber-900/10' :
                                                        '';

                                                    const statusBadge = isContacted ? (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-black text-emerald-600 bg-emerald-100 dark:bg-emerald-900/30 px-1.5 py-0.5 rounded-full">
                                                            <Check size={8} /> Contacted
                                                        </span>
                                                    ) : isPending ? (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-black text-blue-600 bg-blue-100 dark:bg-blue-900/30 px-1.5 py-0.5 rounded-full">
                                                            <Activity size={8} className="animate-pulse" /> In Progress
                                                        </span>
                                                    ) : onCooldown ? (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-black text-slate-400 bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded-full">
                                                            <Clock size={8} /> Cooldown
                                                        </span>
                                                    ) : reQueued ? (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-black text-amber-600 bg-amber-100 dark:bg-amber-900/30 px-1.5 py-0.5 rounded-full">
                                                            <PhoneOff size={8} /> Re-queued
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-[9px] font-black text-slate-400 px-1.5 py-0.5">
                                                            — New
                                                        </span>
                                                    );

                                                    return (
                                                        <tr key={person.id} className={`border-b border-slate-50 dark:border-slate-800/50 ${rowBg}`}>
                                                            <td className="p-2.5 text-[10px] text-slate-400 font-bold">{idx + 1}</td>
                                                            <td className="p-2.5">
                                                                <div className="flex items-center gap-2">
                                                                    {person.avatar ? (
                                                                        <img src={person.avatar} alt={person.name} className="w-6 h-6 rounded-full" />
                                                                    ) : (
                                                                        <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 text-[9px] font-black flex items-center justify-center uppercase">
                                                                            {person.name.slice(0, 2)}
                                                                        </div>
                                                                    )}
                                                                    <span className={`text-xs font-bold ${isContacted || onCooldown ? 'line-through text-slate-400' : 'text-slate-900 dark:text-white'}`}>
                                                                        {person.name}
                                                                    </span>
                                                                </div>
                                                            </td>
                                                            <td className="p-2.5">{statusBadge}</td>
                                                            <td className="p-2.5">
                                                                <span className={`text-[10px] font-black uppercase ${catColor}`}>{cat}</span>
                                                                <span className="text-[9px] text-slate-400 ml-1">({person.riskProfile?.score ?? 0})</span>
                                                            </td>
                                                            <td className="p-2.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium">{person.phone || '—'}</td>
                                                            <td className="p-2.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[140px]">{person.email || '—'}</td>
                                                            <td className="p-2.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium">{person.membership || 'None'}</td>
                                                        </tr>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>

                            {/* Live Board */}
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                                    <Activity size={11} className="text-emerald-500 animate-pulse" /> Live Contact Board
                                </p>
                                <LiveBoard slots={liveSlots} totalCount={filteredPeople.length} />
                            </div>
                        </div>
                    ) : null}
                </div>
            )}

            {/* Create Session Modal */}
            {isModalOpen && (
                <SessionModal
                    memberStatuses={memberStatuses}
                    onSave={handleCreateSession}
                    onClose={() => setIsModalOpen(false)}
                />
            )}
        </div>
    );
};
