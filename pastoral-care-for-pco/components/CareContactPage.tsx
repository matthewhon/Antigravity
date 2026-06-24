import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import QRCode from 'qrcode';
import {
    Phone, QrCode, Link2, Plus, Trash2, Copy, Check, ChevronDown,
    Users, Activity, PhoneOff, RefreshCw, Eye, EyeOff, X, ToggleLeft, ToggleRight,
    Clock, Shield, Download, LockKeyhole, RotateCcw, CheckCircle2,
    Star, Timer, Award, BarChart3
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
        pending:    { label: 'In Progress', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
        contacted:  { label: 'Contacted',   cls: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
        'no-answer':{ label: 'No Answer',  cls: 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400' },
        released:   { label: 'Released',   cls: 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400' },
    }[status] ?? { label: status, cls: 'bg-slate-100 text-slate-500' };
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

// ─── Session Summary (Close Stats) Modal ──────────────────────────────────────

interface CloseStats {
    sessionName: string;
    totalEligible: number;
    contacted: number;
    noAnswer: number;
    notContacted: number;
    callerCount: number;
    avgHandleSeconds: number | null; // avg seconds between assignedAt → completedAt
    callers: { name: string; phone: string; contacted: number; noAnswer: number }[];
    closedAt: number;
    createdAt: number;
}

const fmtDuration = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const m = Math.floor(seconds / 60);
    const s = Math.round(seconds % 60);
    return s > 0 ? `${m}m ${s}s` : `${m}m`;
};

const SessionSummaryModal: React.FC<{ stats: CloseStats; onClose: () => void }> = ({ stats, onClose }) => {
    const contactRate  = stats.totalEligible > 0 ? Math.round((stats.contacted  / stats.totalEligible) * 100) : 0;
    const coverageRate = stats.totalEligible > 0 ? Math.round(((stats.contacted + stats.noAnswer) / stats.totalEligible) * 100) : 0;
    const duration = stats.closedAt - stats.createdAt;
    const durationHrs  = Math.floor(duration / 3_600_000);
    const durationMins = Math.floor((duration % 3_600_000) / 60_000);
    const durationStr  = durationHrs > 0 ? `${durationHrs}h ${durationMins}m` : `${durationMins}m`;
    const topCaller = [...stats.callers].sort((a, b) => b.contacted - a.contacted)[0] ?? null;

    return (
        <div className="fixed inset-0 bg-slate-900/70 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto" onClick={onClose}>
            <div
                className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-2xl w-full max-w-2xl my-6 overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header gradient */}
                <div className="bg-gradient-to-br from-violet-600 to-indigo-700 px-8 py-7 text-white relative">
                    <button onClick={onClose} className="absolute top-4 right-4 text-violet-200 hover:text-white transition-colors"><X size={18} /></button>
                    <div className="flex items-center gap-3 mb-1">
                        <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                            <CheckCircle2 size={20} className="text-white" />
                        </div>
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-violet-200">Session Closed</p>
                            <h2 className="text-xl font-black leading-tight">{stats.sessionName}</h2>
                        </div>
                    </div>
                    <p className="text-xs text-violet-200 mt-2">
                        Ran for {durationStr} &bull; Closed {new Date(stats.closedAt).toLocaleString()}
                    </p>
                </div>

                <div className="p-7 space-y-6">
                    {/* Top stat tiles */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                        {[
                            {
                                label: 'People Reached',
                                value: stats.contacted,
                                sub: `${contactRate}% contact rate`,
                                color: 'bg-emerald-50 dark:bg-emerald-900/20',
                                text: 'text-emerald-600 dark:text-emerald-400',
                                icon: <Check size={14} className="text-emerald-500" />
                            },
                            {
                                label: 'No Answer',
                                value: stats.noAnswer,
                                sub: 'attempted',
                                color: 'bg-rose-50 dark:bg-rose-900/20',
                                text: 'text-rose-600 dark:text-rose-400',
                                icon: <PhoneOff size={14} className="text-rose-500" />
                            },
                            {
                                label: 'Not Contacted',
                                value: stats.notContacted,
                                sub: 'remain in queue',
                                color: 'bg-slate-50 dark:bg-slate-800',
                                text: 'text-slate-600 dark:text-slate-300',
                                icon: <Users size={14} className="text-slate-400" />
                            },
                            {
                                label: 'Coverage',
                                value: `${coverageRate}%`,
                                sub: 'of queue attempted',
                                color: 'bg-indigo-50 dark:bg-indigo-900/20',
                                text: 'text-indigo-600 dark:text-indigo-400',
                                icon: <BarChart3 size={14} className="text-indigo-500" />
                            },
                        ].map(tile => (
                            <div key={tile.label} className={`${tile.color} rounded-2xl p-4`}>
                                <div className="flex items-center gap-1.5 mb-2">{tile.icon}<p className="text-[10px] font-black uppercase tracking-widest text-slate-400">{tile.label}</p></div>
                                <p className={`text-2xl font-black ${tile.text}`}>{tile.value}</p>
                                <p className="text-[10px] text-slate-400 mt-0.5">{tile.sub}</p>
                            </div>
                        ))}
                    </div>

                    {/* Secondary stats row */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                        <div className="bg-amber-50 dark:bg-amber-900/10 rounded-2xl p-4 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-900/40 flex items-center justify-center shrink-0">
                                <Users size={16} className="text-amber-600" />
                            </div>
                            <div>
                                <p className="text-xl font-black text-amber-600 dark:text-amber-400">{stats.callerCount}</p>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Volunteers</p>
                            </div>
                        </div>

                        <div className="bg-sky-50 dark:bg-sky-900/10 rounded-2xl p-4 flex items-center gap-3">
                            <div className="w-9 h-9 rounded-xl bg-sky-100 dark:bg-sky-900/40 flex items-center justify-center shrink-0">
                                <Timer size={16} className="text-sky-600" />
                            </div>
                            <div>
                                <p className="text-xl font-black text-sky-600 dark:text-sky-400">
                                    {stats.avgHandleSeconds !== null ? fmtDuration(stats.avgHandleSeconds) : '—'}
                                </p>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Avg. Handle Time</p>
                            </div>
                        </div>

                        {topCaller && (
                            <div className="bg-violet-50 dark:bg-violet-900/10 rounded-2xl p-4 flex items-center gap-3">
                                <div className="w-9 h-9 rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center shrink-0">
                                    <Award size={16} className="text-violet-600" />
                                </div>
                                <div className="min-w-0">
                                    <p className="text-sm font-black text-violet-600 dark:text-violet-400 truncate">{topCaller.name || topCaller.phone}</p>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                                        Top Caller &bull; {topCaller.contacted} reached
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Caller leaderboard */}
                    {stats.callers.length > 0 && (
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                                <Star size={10} className="text-amber-400" /> Volunteer Leaderboard
                            </p>
                            <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl overflow-hidden">
                                <table className="w-full text-left">
                                    <thead>
                                        <tr className="border-b border-slate-100 dark:border-slate-700">
                                            <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">#</th>
                                            <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Volunteer</th>
                                            <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">Reached</th>
                                            <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">No Answer</th>
                                            <th className="px-4 py-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400 text-center">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {[...stats.callers]
                                            .sort((a, b) => (b.contacted + b.noAnswer) - (a.contacted + a.noAnswer))
                                            .map((caller, i) => (
                                            <tr key={caller.phone} className="border-b border-slate-100 dark:border-slate-700 last:border-0">
                                                <td className="px-4 py-2.5">
                                                    {i === 0 ? (
                                                        <span className="text-base">🥇</span>
                                                    ) : i === 1 ? (
                                                        <span className="text-base">🥈</span>
                                                    ) : i === 2 ? (
                                                        <span className="text-base">🥉</span>
                                                    ) : (
                                                        <span className="text-[10px] text-slate-400 font-bold">{i + 1}</span>
                                                    )}
                                                </td>
                                                <td className="px-4 py-2.5">
                                                    <p className="text-xs font-black text-slate-800 dark:text-white">{caller.name || '—'}</p>
                                                    <p className="text-[10px] font-mono text-slate-400">{caller.phone}</p>
                                                </td>
                                                <td className="px-4 py-2.5 text-center">
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-black text-emerald-600 dark:text-emerald-400">
                                                        <Check size={9} /> {caller.contacted}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-center">
                                                    <span className="inline-flex items-center gap-1 text-[10px] font-black text-rose-500">
                                                        <PhoneOff size={9} /> {caller.noAnswer}
                                                    </span>
                                                </td>
                                                <td className="px-4 py-2.5 text-center">
                                                    <span className="text-[10px] font-black text-slate-600 dark:text-slate-300">{caller.contacted + caller.noAnswer}</span>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    )}

                    <button
                        onClick={onClose}
                        className="w-full bg-indigo-600 hover:bg-indigo-700 text-white py-3.5 rounded-2xl font-black uppercase tracking-widest text-xs shadow-lg transition-all"
                    >
                        Done
                    </button>
                </div>
            </div>
        </div>
    );
};

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
                                                <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                                                    <Phone size={11} className="text-indigo-500" />
                                                </div>
                                                <div>
                                                    {slot.volunteerName ? (
                                                        <p className="text-xs font-black text-slate-800 dark:text-white leading-tight">{slot.volunteerName}</p>
                                                    ) : null}
                                                    <span className="text-[10px] font-mono text-slate-400">
                                                        {maskPhone(slot.volunteerPhone)}
                                                    </span>
                                                    {isStale && (
                                                        <span className="ml-1 text-[9px] font-black uppercase text-amber-600 bg-amber-100 dark:bg-amber-900/40 rounded px-1">Stale</span>
                                                    )}
                                                </div>
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
    // All completed slots across all sessions for this church (for history view)
    const [allTimeSlots, setAllTimeSlots] = useState<OutreachSlot[]>([]);
    // Which person row is expanded to show history
    const [expandedPersonId, setExpandedPersonId] = useState<string | null>(null);
    // Close / export in-flight states
    const [isClosing, setIsClosing]       = useState(false);
    const [isExporting, setIsExporting]   = useState(false);
    // Post-close stats modal
    const [closeStats, setCloseStats]     = useState<CloseStats | null>(null);

    // Load sessions and all-time slot history
    useEffect(() => {
        firestore.getOutreachSessions(church.id).then(data => {
            setSessions(data);
            if (data.length > 0 && !selectedId) setSelectedId(data[0].id);
            setIsLoading(false);
        });
        firestore.getChurchOutreachSlots(church.id).then(setAllTimeSlots);
    }, [church.id]);

    // Subscribe to slots for selected session (live counter + queue sort)
    useEffect(() => {
        if (!selectedId) { setLiveSlots([]); return; }
        const unsub = firestore.subscribeToOutreachSlots(selectedId, setLiveSlots);
        return () => unsub();
    }, [selectedId]);

    // Persist stats snapshot whenever liveSlots change (debounced)
    useEffect(() => {
        if (!selectedId || liveSlots.length === 0) return;
        const session = sessions.find(s => s.id === selectedId);
        if (!session) return;
        const timer = setTimeout(() => {
            const contactedCount = liveSlots.filter(s => s.status === 'contacted').length;
            const noAnswerCount  = liveSlots.filter(s => s.status === 'no-answer').length;
            const pendingCount   = liveSlots.filter(s => s.status === 'pending').length;
            const totalEligible  = session.eligiblePeople?.length ?? 0;
            firestore.updateSessionStats(session.id, {
                contactedCount, noAnswerCount, pendingCount, totalEligible
            });
        }, 2000); // debounce 2s
        return () => clearTimeout(timer);
    }, [liveSlots, selectedId, sessions]);

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
        filters: OutreachSession['filters'],
        historySlots: OutreachSlot[]
    ) => {
        const { riskCategories, membershipStatuses } = filters;
        const eligible = allPeople.filter(p => {
            if (p.status?.toLowerCase() === 'inactive') return false;
            if (!p.phone && !p.email) return false;
            if (riskCategories.length > 0 && !riskCategories.includes(p.riskProfile?.category as any)) return false;
            if (membershipStatuses.length > 0 && !membershipStatuses.includes(p.membership || 'None')) return false;
            return true;
        });

        // Build per-person contact history from all-time slots across ALL sessions.
        // We care about two timestamps:
        //   lastContactedAt  — most recent 'contacted' slot completedAt (successfully reached)
        //   lastAttemptedAt  — most recent slot of any completed status (no-answer / contacted)
        const lastContactedAt  = new Map<string, number>();
        const lastAttemptedAt  = new Map<string, number>();

        for (const slot of historySlots) {
            const ts = slot.completedAt ?? slot.assignedAt;
            if (slot.status === 'contacted') {
                const prev = lastContactedAt.get(slot.assignedPersonId) ?? 0;
                if (ts > prev) lastContactedAt.set(slot.assignedPersonId, ts);
            }
            if (slot.status === 'contacted' || slot.status === 'no-answer') {
                const prev = lastAttemptedAt.get(slot.assignedPersonId) ?? 0;
                if (ts > prev) lastAttemptedAt.set(slot.assignedPersonId, ts);
            }
        }

        // Tier 0: never attempted in any session — sort most at-risk (lowest score) first
        // Tier 1: attempted but never successfully contacted — oldest attempt first
        // Tier 2: successfully contacted at least once — oldest successful contact first
        //
        // This ensures volunteers always call the neediest / longest-forgotten people first.
        const tierOf = (p: typeof eligible[0]) => {
            if (lastContactedAt.has(p.id)) return 2;  // reached before
            if (lastAttemptedAt.has(p.id)) return 1;  // tried but no answer
            return 0;                                  // brand new, never tried
        };

        return eligible
            .sort((a, b) => {
                const ta = tierOf(a);
                const tb = tierOf(b);
                if (ta !== tb) return ta - tb; // lower tier = higher priority

                if (ta === 0) {
                    // Both never tried — most at-risk (lowest score) first
                    return (a.riskProfile?.score ?? 0) - (b.riskProfile?.score ?? 0);
                }
                if (ta === 1) {
                    // Both attempted-only — oldest attempt first
                    return (lastAttemptedAt.get(a.id) ?? 0) - (lastAttemptedAt.get(b.id) ?? 0);
                }
                // Both previously contacted — oldest successful contact first
                return (lastContactedAt.get(a.id) ?? 0) - (lastContactedAt.get(b.id) ?? 0);
            })
            .map(p => ({
                id: p.id,
                name: p.name,
                phone: p.phone ?? null,
                email: p.email ?? null,
                riskScore: p.riskProfile?.score ?? 0,
            }));
    }, []);

    // Build phone → name directory from all non-inactive people
    const buildMemberDirectory = useCallback((allPeople: typeof people) => {
        return allPeople
            .filter(p => p.status?.toLowerCase() !== 'inactive' && p.phone)
            .map(p => ({ phone: p.phone!.replace(/\D/g, ''), name: p.name }))
            .filter(e => e.phone.length >= 10);
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
            if (slot.status === 'released') return 0;                     // Released batch slot — back to front
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

    // All-time per-person contact history (across all sessions).
    // Merges the persistent allTimeSlots with any freshly completed liveSlots
    // so the history updates in real-time within the current session too.
    const personHistory = useMemo(() => {
        const map = new Map<string, OutreachSlot[]>();
        const addSlot = (slot: OutreachSlot) => {
            if (slot.status !== 'contacted' && slot.status !== 'no-answer') return;
            const list = map.get(slot.assignedPersonId) ?? [];
            // Avoid duplicates (same slotId)
            if (!list.some(s => s.id === slot.id)) list.push(slot);
            map.set(slot.assignedPersonId, list);
        };
        allTimeSlots.forEach(addSlot);
        liveSlots.forEach(addSlot);   // real-time current session
        // Sort each person's list newest first
        map.forEach((list, id) => {
            map.set(id, list.sort((a, b) => (b.completedAt ?? b.assignedAt) - (a.completedAt ?? a.assignedAt)));
        });
        return map;
    }, [allTimeSlots, liveSlots]);

    const handleCreateSession = async (draft: Pick<OutreachSession, 'name' | 'filters'>) => {
        const id = `os_${church.id}_${Date.now()}`;
        const eligible = buildEligiblePeople(people, draft.filters, allTimeSlots);
        const memberDirectory = buildMemberDirectory(people);
        const newSession: OutreachSession = {
            id, churchId: church.id,
            name: draft.name, filters: draft.filters,
            eligiblePeople: eligible,
            memberDirectory,
            batchSize: 3, // default
            createdAt: Date.now(), createdBy: user.id, isActive: true
        };
        await firestore.createOutreachSession(newSession);
        setSessions(prev => [newSession, ...prev]);
        setSelectedId(id);
        setIsModalOpen(false);
    };

    const handleRefreshQueue = async () => {
        if (!selectedSession) return;
        const eligible = buildEligiblePeople(people, selectedSession.filters, allTimeSlots);
        const memberDirectory = buildMemberDirectory(people);
        const updates = { eligiblePeople: eligible, memberDirectory };
        await firestore.updateOutreachSession(selectedSession.id, updates);
        setSessions(prev => prev.map(s => s.id === selectedSession.id ? { ...s, ...updates } : s));
    };

    const handleToggleActive = async (session: OutreachSession) => {
        const updates = { isActive: !session.isActive };
        await firestore.updateOutreachSession(session.id, updates);
        setSessions(prev => prev.map(s => s.id === session.id ? { ...s, ...updates } : s));
    };

    const handleUpdateBatchSize = async (session: OutreachSession, size: number) => {
        const batchSize = Math.max(1, Math.min(10, size));
        await firestore.updateOutreachSession(session.id, { batchSize });
        setSessions(prev => prev.map(s => s.id === session.id ? { ...s, batchSize } : s));
    };

    const handleDeleteSession = async (sessionId: string) => {
        if (!confirm('Delete this session? This cannot be undone.')) return;
        await firestore.deleteOutreachSession(sessionId);
        setSessions(prev => prev.filter(s => s.id !== sessionId));
        if (selectedId === sessionId) setSelectedId(sessions.find(s => s.id !== sessionId)?.id ?? null);
    };

    const handleCloseSession = async (session: OutreachSession) => {
        const confirmed = window.confirm(
            `Close "${session.name}"?\n\nThis will release any pending volunteer slots and mark the session as read-only. You can reopen it at any time.`
        );
        if (!confirmed) return;
        setIsClosing(true);
        try {
            // Snapshot all slots BEFORE closing (includes still-pending)
            const allSlots = await firestore.getOutreachSlots(session.id);
            const closedAt = Date.now();
            await firestore.closeOutreachSession(session.id, user.id);

            // Build stats from slot data
            const completed = allSlots.filter(s => s.status === 'contacted' || s.status === 'no-answer');
            const contacted  = completed.filter(s => s.status === 'contacted').length;
            const noAnswer   = completed.filter(s => s.status === 'no-answer').length;
            const totalEligible = session.eligiblePeople?.length ?? filteredPeople.length;
            const notContacted  = Math.max(0, totalEligible - contacted - noAnswer);

            // Avg handle time — only completed slots with both timestamps
            const withTime = completed.filter(s => s.completedAt && s.assignedAt);
            const avgHandleSeconds = withTime.length > 0
                ? withTime.reduce((sum, s) => sum + ((s.completedAt! - s.assignedAt) / 1000), 0) / withTime.length
                : null;

            // Per-caller stats
            const callerMap = new Map<string, { name: string; phone: string; contacted: number; noAnswer: number }>();
            for (const slot of completed) {
                if (!callerMap.has(slot.volunteerPhone)) {
                    callerMap.set(slot.volunteerPhone, {
                        name: slot.volunteerName ?? '',
                        phone: slot.volunteerPhone,
                        contacted: 0,
                        noAnswer: 0,
                    });
                }
                const entry = callerMap.get(slot.volunteerPhone)!;
                if (slot.status === 'contacted') entry.contacted++;
                else entry.noAnswer++;
            }

            setCloseStats({
                sessionName: session.name,
                totalEligible,
                contacted,
                noAnswer,
                notContacted,
                callerCount: callerMap.size,
                avgHandleSeconds,
                callers: Array.from(callerMap.values()),
                closedAt,
                createdAt: session.createdAt,
            });

            setSessions(prev => prev.map(s =>
                s.id === session.id
                    ? { ...s, isActive: false, closedAt, closedBy: user.id }
                    : s
            ));
        } finally {
            setIsClosing(false);
        }
    };

    const handleReopenSession = async (session: OutreachSession) => {
        await firestore.reopenOutreachSession(session.id);
        setSessions(prev => prev.map(s =>
            s.id === session.id
                ? { ...s, isActive: true, closedAt: null, closedBy: null }
                : s
        ));
    };

    /**
     * Export all contact outcomes for the selected session as a CSV.
     * Fetches slots on demand if viewing a non-active session.
     */
    const handleExportCsv = async () => {
        if (!selectedSession) return;
        setIsExporting(true);
        try {
            // For the currently-watched session liveSlots is already in memory.
            // For others (or to get the definitive snapshot) we fetch from Firestore.
            let slots = liveSlots;
            if (selectedId !== selectedSession.id || liveSlots.length === 0) {
                slots = await firestore.getOutreachSlots(selectedSession.id);
            }

            const contactedOrNo = slots.filter(s => s.status === 'contacted' || s.status === 'no-answer');
            // Map personId -> best slot outcome (contacted > no-answer)
            const byPerson = new Map<string, OutreachSlot[]>();
            for (const slot of contactedOrNo) {
                const list = byPerson.get(slot.assignedPersonId) ?? [];
                list.push(slot);
                byPerson.set(slot.assignedPersonId, list);
            }

            const header = [
                'Person Name', 'Phone', 'Email', 'Membership', 'Risk Category', 'Risk Score',
                'Outcome', 'Contacted By', 'Contact Date/Time', 'Notes'
            ];

            const rows: string[][] = [];

            // First: all people in the eligible list with their outcome(s)
            const eligible = selectedSession.eligiblePeople ?? [];
            const eligibleIds = new Set(eligible.map(p => p.id));

            for (const person of eligible) {
                const pcoMatch = people.find(p => p.id === person.id);
                const attempts = byPerson.get(person.id) ?? [];

                if (attempts.length === 0) {
                    // Never contacted within this session
                    rows.push([
                        person.name,
                        pcoMatch?.phone ?? '',
                        pcoMatch?.email ?? '',
                        pcoMatch?.membership ?? 'None',
                        pcoMatch?.riskProfile?.category ?? '',
                        String(pcoMatch?.riskProfile?.score ?? person.riskScore),
                        'Not Contacted', '', '', ''
                    ]);
                } else {
                    // One row per attempt (handles multiple no-answer + final contact)
                    const sorted = [...attempts].sort((a, b) => (a.completedAt ?? a.assignedAt) - (b.completedAt ?? b.assignedAt));
                    for (const slot of sorted) {
                        rows.push([
                            person.name,
                            pcoMatch?.phone ?? slot.assignedPersonPhone ?? '',
                            pcoMatch?.email ?? slot.assignedPersonEmail ?? '',
                            pcoMatch?.membership ?? 'None',
                            pcoMatch?.riskProfile?.category ?? '',
                            String(pcoMatch?.riskProfile?.score ?? person.riskScore),
                            slot.status === 'contacted' ? 'Contacted' : 'No Answer',
                            slot.volunteerName ?? slot.volunteerPhone,
                            slot.completedAt ? new Date(slot.completedAt).toLocaleString() : new Date(slot.assignedAt).toLocaleString(),
                            slot.notes?.trim() ?? ''
                        ]);
                    }
                }
            }

            // Safety net: include any slots for people NOT in the eligible snapshot
            for (const [personId, attempts] of byPerson.entries()) {
                if (eligibleIds.has(personId)) continue;
                for (const slot of attempts) {
                    rows.push([
                        slot.assignedPersonName,
                        slot.assignedPersonPhone ?? '',
                        slot.assignedPersonEmail ?? '',
                        '', '', '',
                        slot.status === 'contacted' ? 'Contacted' : 'No Answer',
                        slot.volunteerName ?? slot.volunteerPhone,
                        slot.completedAt ? new Date(slot.completedAt).toLocaleString() : new Date(slot.assignedAt).toLocaleString(),
                        slot.notes?.trim() ?? ''
                    ]);
                }
            }

            const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
            const csv = [
                header.map(escape).join(','),
                ...rows.map(r => r.map(escape).join(','))
            ].join('\n');

            const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
            const url  = URL.createObjectURL(blob);
            const a    = document.createElement('a');
            const safeName = selectedSession.name.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            a.href     = url;
            a.download = `outreach_${safeName}_${new Date().toISOString().slice(0, 10)}.csv`;
            a.click();
            URL.revokeObjectURL(url);
        } finally {
            setIsExporting(false);
        }
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
                            const isClosed   = !!s.closedAt;
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
                                        : isClosed
                                            ? 'bg-slate-50 dark:bg-slate-900/60 border-slate-100 dark:border-slate-800 opacity-70 hover:opacity-100 hover:border-slate-200'
                                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-slate-700'
                                }`}
                            >
                                <div className="flex items-start justify-between gap-2">
                                    <div className="min-w-0">
                                        <p className={`text-xs font-black truncate ${isSelected ? 'text-indigo-600 dark:text-indigo-400' : isClosed ? 'text-slate-400 dark:text-slate-500' : 'text-slate-900 dark:text-white'}`}>
                                            {s.name}
                                        </p>
                                        <p className="text-[10px] text-slate-400 mt-0.5">
                                            {isClosed
                                                ? `Closed ${new Date(s.closedAt!).toLocaleDateString()}`
                                                : new Date(s.createdAt).toLocaleDateString()
                                            }
                                        </p>
                                    </div>
                                    <span className={`shrink-0 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full text-[9px] font-black uppercase ${
                                        isClosed
                                            ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400'
                                            : s.isActive
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
                                    }`}>
                                        {isClosed ? <><LockKeyhole size={8} /> Closed</> : s.isActive ? 'Active' : 'Paused'}
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
                                    <h3 className="text-base font-black dark:text-white flex items-center gap-2">
                                        {selectedSession.name}
                                        {selectedSession.closedAt && (
                                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                                                <LockKeyhole size={9} /> Closed
                                            </span>
                                        )}
                                    </h3>
                                    <p className="text-[11px] text-slate-400 mt-0.5">
                                        {filteredPeople.length} people in queue &bull; Created {new Date(selectedSession.createdAt).toLocaleDateString()}
                                        {selectedSession.closedAt && (
                                            <> &bull; Closed {new Date(selectedSession.closedAt).toLocaleDateString()}</>
                                        )}
                                    </p>
                                </div>
                                <div className="flex items-center gap-2 flex-wrap">
                                    {/* Export CSV — available for open sessions; closed sessions have it in the compact card */}
                                    {!selectedSession.closedAt && (
                                        <button
                                            onClick={handleExportCsv}
                                            disabled={isExporting}
                                            title="Download all contact outcomes as a CSV file"
                                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide text-emerald-700 hover:bg-emerald-50 dark:text-emerald-400 dark:hover:bg-emerald-900/20 transition-all border border-emerald-200 dark:border-emerald-800 disabled:opacity-50"
                                        >
                                            <Download size={12} /> {isExporting ? 'Exporting…' : 'Export CSV'}
                                        </button>
                                    )}

                                    {selectedSession.closedAt ? (
                                        /* ── CLOSED SESSION: no extra buttons; compact card handles actions ── */
                                        null
                                    ) : (
                                        /* ── ACTIVE / PAUSED SESSION ACTIONS ── */
                                        <>
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
                                                onClick={() => handleCloseSession(selectedSession)}
                                                disabled={isClosing}
                                                title="Close this session — releases pending slots and makes it read-only"
                                                className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide text-violet-600 hover:bg-violet-50 dark:text-violet-400 dark:hover:bg-violet-900/20 transition-all border border-violet-200 dark:border-violet-800 disabled:opacity-50"
                                            >
                                                <CheckCircle2 size={12} /> {isClosing ? 'Closing…' : 'Close Session'}
                                            </button>
                                            <div className="flex items-center gap-1.5 shrink-0 border border-slate-200 dark:border-slate-700 rounded-xl px-2.5 py-1.5">
                                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400 whitespace-nowrap">Batch</label>
                                                <input
                                                    type="number"
                                                    min={1}
                                                    max={10}
                                                    value={selectedSession.batchSize ?? 3}
                                                    onChange={e => handleUpdateBatchSize(selectedSession, parseInt(e.target.value) || 3)}
                                                    className="w-10 bg-transparent text-[11px] font-black text-center text-slate-700 dark:text-slate-200 outline-none"
                                                    title="Pre-assign this many contacts per volunteer at once (1–10)"
                                                />
                                                <label className="text-[9px] font-black uppercase tracking-widest text-slate-400">/ caller</label>
                                            </div>
                                        </>
                                    )}

                                    {/* Delete — always available */}
                                    <button
                                        onClick={() => handleDeleteSession(selectedSession.id)}
                                        className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all border border-transparent hover:border-rose-200 dark:hover:border-rose-800"
                                    >
                                        <Trash2 size={12} /> Delete
                                    </button>
                                </div>
                            </div>

                            {selectedSession.closedAt ? (
                                /* ══ CLOSED SESSION: Compact Summary Card ══ */
                                (() => {
                                    const totalEligible = selectedSession.eligiblePeople?.length ?? filteredPeople.length;
                                    const contacted  = liveSlots.filter(s => s.status === 'contacted').length;
                                    const noAnswer   = liveSlots.filter(s => s.status === 'no-answer').length;
                                    const notContacted = Math.max(0, totalEligible - contacted - noAnswer);
                                    const contactRate  = totalEligible > 0 ? Math.round(contacted / totalEligible * 100) : 0;
                                    const coverageRate = totalEligible > 0 ? Math.round((contacted + noAnswer) / totalEligible * 100) : 0;
                                    const closedDate   = new Date(selectedSession.closedAt).toLocaleString();
                                    const duration     = selectedSession.closedAt - selectedSession.createdAt;
                                    const durationHrs  = Math.floor(duration / 3_600_000);
                                    const durationMins = Math.floor((duration % 3_600_000) / 60_000);
                                    const durationStr  = durationHrs > 0 ? `${durationHrs}h ${durationMins}m` : `${durationMins}m`;

                                    // Per-caller from liveSlots
                                    const callerMap = new Map<string, { name: string; phone: string; contacted: number; noAnswer: number }>();
                                    for (const slot of liveSlots.filter(s => s.status === 'contacted' || s.status === 'no-answer')) {
                                        if (!callerMap.has(slot.volunteerPhone)) {
                                            callerMap.set(slot.volunteerPhone, { name: slot.volunteerName ?? '', phone: slot.volunteerPhone, contacted: 0, noAnswer: 0 });
                                        }
                                        const e = callerMap.get(slot.volunteerPhone)!;
                                        if (slot.status === 'contacted') e.contacted++; else e.noAnswer++;
                                    }
                                    const callers = [...callerMap.values()].sort((a, b) => (b.contacted + b.noAnswer) - (a.contacted + a.noAnswer));

                                    return (
                                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-violet-100 dark:border-violet-900/40 overflow-hidden shadow-sm">
                                            {/* Gradient header */}
                                            <div className="bg-gradient-to-br from-violet-600 to-indigo-700 px-6 py-5 text-white">
                                                <div className="flex items-center justify-between gap-4 flex-wrap">
                                                    <div>
                                                        <div className="flex items-center gap-2 mb-1">
                                                            <LockKeyhole size={13} className="text-violet-200" />
                                                            <p className="text-[10px] font-black uppercase tracking-widest text-violet-200">Session Closed</p>
                                                        </div>
                                                        <p className="text-xs text-violet-200">{closedDate} &bull; Ran {durationStr}</p>
                                                    </div>
                                                    {/* Quick actions */}
                                                    <div className="flex items-center gap-2 flex-wrap">
                                                        <button
                                                            onClick={handleExportCsv}
                                                            disabled={isExporting}
                                                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide bg-white/20 hover:bg-white/30 text-white transition-all border border-white/20 disabled:opacity-50"
                                                        >
                                                            <Download size={12} /> {isExporting ? 'Exporting…' : 'Export CSV'}
                                                        </button>
                                                        <button
                                                            onClick={() => handleReopenSession(selectedSession)}
                                                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-wide bg-white text-indigo-700 hover:bg-indigo-50 transition-all"
                                                        >
                                                            <RotateCcw size={12} /> Reopen
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Progress bar */}
                                                <div className="mt-4">
                                                    <div className="flex items-center justify-between mb-1.5">
                                                        <span className="text-[10px] font-black uppercase tracking-widest text-violet-200">Coverage</span>
                                                        <span className="text-[10px] font-black text-white">{coverageRate}% attempted</span>
                                                    </div>
                                                    <div className="bg-white/20 rounded-full h-2 overflow-hidden">
                                                        <div
                                                            className="h-2 rounded-full bg-white transition-all duration-700"
                                                            style={{ width: `${Math.min(100, coverageRate)}%` }}
                                                        />
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Stat strip */}
                                            <div className="grid grid-cols-2 sm:grid-cols-4 divide-x divide-y sm:divide-y-0 divide-slate-100 dark:divide-slate-800 border-b border-slate-100 dark:border-slate-800">
                                                {[
                                                    { label: 'Reached', value: contacted, sub: `${contactRate}% rate`, icon: <Check size={12} className="text-emerald-500" />, color: 'text-emerald-600 dark:text-emerald-400' },
                                                    { label: 'No Answer', value: noAnswer, sub: 'attempted', icon: <PhoneOff size={12} className="text-rose-400" />, color: 'text-rose-500' },
                                                    { label: 'Not Contacted', value: notContacted, sub: 'remaining', icon: <Users size={12} className="text-slate-400" />, color: 'text-slate-600 dark:text-slate-300' },
                                                    { label: 'Volunteers', value: callers.length, sub: 'made calls', icon: <Award size={12} className="text-violet-500" />, color: 'text-violet-600 dark:text-violet-400' },
                                                ].map(tile => (
                                                    <div key={tile.label} className="px-5 py-4">
                                                        <div className="flex items-center gap-1.5 mb-1">{tile.icon}<p className="text-[9px] font-black uppercase tracking-widest text-slate-400">{tile.label}</p></div>
                                                        <p className={`text-2xl font-black ${tile.color}`}>{tile.value}</p>
                                                        <p className="text-[9px] text-slate-400 mt-0.5">{tile.sub}</p>
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Volunteer leaderboard */}
                                            {callers.length > 0 && (
                                                <div className="px-5 py-4">
                                                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                                                        <Star size={9} className="text-amber-400" /> Volunteer Results
                                                    </p>
                                                    <div className="space-y-1.5">
                                                        {callers.map((c, i) => {
                                                            const total = c.contacted + c.noAnswer;
                                                            const pct = total > 0 ? Math.round(c.contacted / total * 100) : 0;
                                                            return (
                                                                <div key={c.phone} className="flex items-center gap-3">
                                                                    <span className="w-6 shrink-0 text-center">
                                                                        {i === 0 ? '🥇' : i === 1 ? '🥈' : i === 2 ? '🥉' : <span className="text-[10px] text-slate-400 font-bold">{i + 1}</span>}
                                                                    </span>
                                                                    <div className="flex-1 min-w-0">
                                                                        <div className="flex items-center justify-between mb-1">
                                                                            <span className="text-xs font-black text-slate-800 dark:text-white truncate">{c.name || c.phone}</span>
                                                                            <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 shrink-0 ml-2">
                                                                                <span className="text-emerald-600 dark:text-emerald-400">{c.contacted}</span>
                                                                                <span className="text-slate-300 mx-1">·</span>
                                                                                <span className="text-rose-500">{c.noAnswer}</span>
                                                                            </span>
                                                                        </div>
                                                                        <div className="bg-slate-100 dark:bg-slate-800 rounded-full h-1 overflow-hidden">
                                                                            <div
                                                                                className="bg-emerald-500 h-1 rounded-full transition-all duration-500"
                                                                                style={{ width: `${pct}%` }}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                </div>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    );
                                })()
                            ) : (
                                /* ══ OPEN SESSION: Full Share Panel + Live Board ══ */
                                <>

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

                                {!selectedSession.isActive && !selectedSession.closedAt && (
                                    <div className="mt-4 bg-amber-400/20 border border-amber-300/30 rounded-xl px-4 py-3 text-xs font-bold text-amber-100 flex items-center gap-2">
                                        <Shield size={14} /> This session is paused. Volunteers who visit the link will see a &ldquo;Session Paused&rdquo; message.
                                    </div>
                                )}
                            </div>

                            {/* Live Contact Board — directly under share panel */}
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 flex items-center gap-1.5">
                                    <Activity size={11} className="text-emerald-500 animate-pulse" /> Session Progress
                                </p>
                                <LiveBoard slots={liveSlots} totalCount={filteredPeople.length} />
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
                                                    <th className="p-2.5 text-[9px] font-black uppercase tracking-widest text-slate-400">Last Contact</th>
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

                                                    // Current-session slot (for status badge & row colour)
                                                    const slot = liveSlots
                                                        .filter(sl => sl.assignedPersonId === person.id)
                                                        .sort((a, b) => b.assignedAt - a.assignedAt)[0];

                                                    const isContacted  = slot?.status === 'contacted';
                                                    const isPending    = slot?.status === 'pending';
                                                    const isNoAnswer   = slot?.status === 'no-answer';
                                                    const onCooldown   = isNoAnswer && slot?.noAnswerUntil && slot.noAnswerUntil > now;
                                                    const reQueued     = isNoAnswer && (!slot?.noAnswerUntil || slot.noAnswerUntil <= now);

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

                                                    // All-time history for this person
                                                    const history = personHistory.get(person.id) ?? [];
                                                    const mostRecent = history[0];
                                                    const isExpanded = expandedPersonId === person.id;

                                                    return (
                                                        <React.Fragment key={person.id}>
                                                        <tr
                                                            className={`border-b border-slate-50 dark:border-slate-800/50 ${rowBg} ${history.length > 0 ? 'cursor-pointer hover:bg-indigo-50/30 dark:hover:bg-indigo-900/10' : ''} transition-colors`}
                                                            onClick={() => history.length > 0 && setExpandedPersonId(isExpanded ? null : person.id)}
                                                        >
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
                                                            {/* Last Contact — all-time */}
                                                            <td className="p-2.5 text-[10px] font-medium whitespace-nowrap">
                                                                {mostRecent ? (
                                                                    <div className="flex items-center gap-1.5">
                                                                        <span className={`${mostRecent.status === 'contacted' ? 'text-emerald-600' : 'text-rose-500'}`}>
                                                                            {timeSince(mostRecent.completedAt ?? mostRecent.assignedAt)}
                                                                        </span>
                                                                        <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 text-[8px] font-black" title={`${history.length} total contact attempt${history.length !== 1 ? 's' : ''}`}>
                                                                            {history.length}
                                                                        </span>
                                                                        <ChevronDown size={10} className={`text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                                                    </div>
                                                                ) : (
                                                                    <span className="text-slate-300 dark:text-slate-600">—</span>
                                                                )}
                                                            </td>
                                                            <td className="p-2.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium">{person.phone || '—'}</td>
                                                            <td className="p-2.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate max-w-[140px]">{person.email || '—'}</td>
                                                            <td className="p-2.5 text-[10px] text-slate-500 dark:text-slate-400 font-medium">{person.membership || 'None'}</td>
                                                        </tr>
                                                        {/* History accordion */}
                                                        {isExpanded && history.length > 0 && (
                                                            <tr className="border-b border-slate-100 dark:border-slate-800">
                                                                <td colSpan={8} className="p-0">
                                                                    <div className="bg-slate-50 dark:bg-slate-800/40 px-6 py-3 space-y-2">
                                                                        <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-2">Contact History ({history.length} attempt{history.length !== 1 ? 's' : ''})</p>
                                                                        {history.map(h => (
                                                                            <div key={h.id} className="flex items-start gap-3 text-[10px]">
                                                                                <span className={`shrink-0 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full font-black ${h.status === 'contacted' ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' : 'bg-rose-100 text-rose-700 dark:bg-rose-900/30 dark:text-rose-400'}`}>
                                                                                    {h.status === 'contacted' ? <Check size={7} /> : <PhoneOff size={7} />}
                                                                                    {h.status === 'contacted' ? 'Reached' : 'No Answer'}
                                                                                </span>
                                                                                <span className="text-slate-500 dark:text-slate-400 shrink-0">
                                                                                    {formatDateTime(h.completedAt ?? h.assignedAt)}
                                                                                </span>
                                                                                {h.volunteerName && (
                                                                                    <span className="text-slate-400 shrink-0">by <span className="font-bold text-slate-600 dark:text-slate-300">{h.volunteerName}</span></span>
                                                                                )}
                                                                                {h.notes?.trim() && (
                                                                                    <span className="text-slate-500 dark:text-slate-400 italic truncate">— {h.notes.trim()}</span>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </td>
                                                            </tr>
                                                        )}
                                                        </React.Fragment>
                                                    );
                                                })}
                                            </tbody>
                                        </table>
                                    )}
                                </div>
                            </div>

                            </>
                        )}

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

            {/* Post-close Stats Modal */}
            {closeStats && (
                <SessionSummaryModal
                    stats={closeStats}
                    onClose={() => setCloseStats(null)}
                />
            )}
        </div>
    );
};
