import React, { useState, useEffect, useCallback } from 'react';
import { db as firebaseDb } from '../services/firebase';
import {
    collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
    query, where, orderBy, limit, getDocs, getDoc, setDoc,
    Timestamp, collectionGroup
} from 'firebase/firestore';
import { pcoService } from '../services/pcoService';
import { SmsCampaign, SmsConversation, SmsMessage, SmsKeyword, SmsOptOut, SmsWorkflow, SmsWorkflowStep, SmsWorkflowEnrollment, Church, User } from '../types';
import {
    MessageSquare, Send, Clock, Users, Plus, ArrowLeft, Trash2,
    Eye, Pencil, ChevronDown, CheckCircle, Circle, Loader2, X,
    Calendar, Phone, Search, RefreshCw, Settings, Key, AlertTriangle,
    Inbox, BarChart3, Copy, Zap, MessageCircle, TrendingUp, TrendingDown,
    Activity, DollarSign, UserX
} from 'lucide-react';

// ─── Constants ──────────────────────────────────────────────────────────────

const API_BASE = ''; // Relative — same origin

const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    draft:     { label: 'Draft',    color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
    scheduled: { label: 'Scheduled',color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    sending:   { label: 'Sending…', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    sent:      { label: 'Sent',     color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    failed:    { label: 'Failed',   color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

const SEGMENT_NOTE = 'SMS segments: 1 segment = 160 chars. Merge tags like {firstName} count toward length.';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function countSegments(body: string): number {
    if (!body) return 0;
    if (body.length <= 160) return 1;
    return Math.ceil(body.length / 153);
}

function formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
        return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}–${digits.slice(7)}`;
    }
    if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}–${digits.slice(6)}`;
    }
    return phone;
}

function timeAgo(ts: number): string {
    const diffMs = Date.now() - ts;
    const mins   = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}

// ─── Sub-components ──────────────────────────────────────────────────────────

const Toast: React.FC<{ msg: string; type: 'success' | 'error'; onClose: () => void }> = ({ msg, type, onClose }) => (
    <div className={`fixed top-5 left-1/2 -translate-x-1/2 z-[200] flex items-center gap-3 px-5 py-3 rounded-2xl shadow-2xl text-sm font-semibold text-white transition-all ${type === 'success' ? 'bg-emerald-600' : 'bg-red-600'}`}>
        {msg}
        <button onClick={onClose} className="ml-1 opacity-70 hover:opacity-100"><X size={14} /></button>
    </div>
);

// ─── Schedule Modal ──────────────────────────────────────────────────────────

const ScheduleModal: React.FC<{
    onConfirm: (scheduledAt: number, recurringFrequency?: 'daily' | 'weekly' | 'monthly') => void;
    onCancel: () => void;
    isBusy: boolean;
}> = ({ onConfirm, onCancel, isBusy }) => {
    const defaultDt = () => {
        const d = new Date();
        d.setDate(d.getDate() + 1);
        d.setHours(9, 0, 0, 0);
        const pad = (n: number) => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
    };
    const [dateTime, setDateTime]   = useState(defaultDt);
    const [frequency, setFrequency] = useState<'none' | 'daily' | 'weekly' | 'monthly'>('none');

    const handleConfirm = () => {
        const ts = new Date(dateTime).getTime();
        if (isNaN(ts) || ts <= Date.now()) { alert('Please choose a future time.'); return; }
        onConfirm(ts, frequency === 'none' ? undefined : frequency);
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onCancel}>
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl p-6 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
                <h3 className="text-base font-bold text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                    <Clock size={16} className="text-amber-500" /> Schedule Text Blast
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-4">
                    Recipients will be resolved from your PCO list or group at send time.
                </p>
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Send Date &amp; Time</label>
                <input
                    type="datetime-local"
                    value={dateTime}
                    onChange={e => setDateTime(e.target.value)}
                    min={new Date().toISOString().slice(0, 16)}
                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 mb-4"
                />
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Repeat</label>
                <select
                    value={frequency}
                    onChange={e => setFrequency(e.target.value as any)}
                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 mb-6"
                >
                    <option value="none">Does not repeat</option>
                    <option value="daily">Daily</option>
                    <option value="weekly">Weekly</option>
                    <option value="monthly">Monthly</option>
                </select>
                <div className="flex gap-2">
                    <button onClick={onCancel} className="flex-1 py-2.5 text-sm text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-700 transition font-semibold">Cancel</button>
                    <button onClick={handleConfirm} disabled={isBusy} className="flex-1 flex items-center justify-center gap-2 py-2.5 text-sm font-semibold bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl transition">
                        {isBusy ? <><Loader2 size={13} className="animate-spin" />Scheduling…</> : <><Calendar size={13} />Schedule</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

// ─── Campaign Composer ────────────────────────────────────────────────────────

interface ComposerProps {
    campaign: SmsCampaign;
    churchId: string;
    apiBase: string;
    onBack: () => void;
    onSave: (updates: Partial<SmsCampaign>) => Promise<void>;
    onSend: () => void;
    onSchedule: (scheduledAt: number, freq?: 'daily' | 'weekly' | 'monthly') => void;
    isSending: boolean;
}

const CampaignComposer: React.FC<ComposerProps> = ({
    campaign, churchId, onBack, onSave, onSend, onSchedule, isSending,
}) => {
    const [local, setLocal]         = useState<SmsCampaign>(campaign);
    const [pcoLists, setPcoLists]   = useState<{ id: string; name: string; total_people: number }[]>([]);
    const [pcoGroups, setPcoGroups] = useState<{ id: string; name: string; memberCount: number }[]>([]);
    const [toTab, setToTab]         = useState<'lists' | 'groups'>('lists');
    const [loadingLists, setLoadingLists]   = useState(false);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [showSchedule, setShowSchedule]   = useState(false);
    const [lastSaved, setLastSaved]         = useState<number | null>(null);

    const segments = countSegments(local.body || '');
    const canSend  = !!(local.body?.trim()) && !!(local.toListId || local.toGroupId);

    const update = useCallback((patch: Partial<SmsCampaign>) => {
        setLocal(prev => ({ ...prev, ...patch }));
        onSave(patch).then(() => setLastSaved(Date.now()));
    }, [onSave]);

    useEffect(() => {
        setLoadingLists(true);
        pcoService.getPeopleLists(churchId).then((raw: any[]) => {
            setPcoLists(raw.map(r => ({
                id: r.id,
                name: r.attributes?.name || 'Unnamed',
                total_people: r.attributes?.total_people ?? 0,
            })));
            setLoadingLists(false);
        }).catch(() => setLoadingLists(false));
    }, [churchId]);

    useEffect(() => {
        if (toTab === 'groups' && pcoGroups.length === 0) {
            setLoadingGroups(true);
            pcoService.getGroups(churchId).then((raw: any[]) => {
                setPcoGroups(raw.map(r => ({
                    id: r.id,
                    name: r.attributes?.name || 'Unnamed',
                    memberCount: r.attributes?.memberships_count ?? r.attributes?.member_count ?? 0,
                })));
                setLoadingGroups(false);
            }).catch(() => setLoadingGroups(false));
        }
    }, [toTab, churchId, pcoGroups.length]);

    const recipientLabel = local.toGroupName ? `Group: ${local.toGroupName}` : local.toListName || '';

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-1.5 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
                        <span className="cursor-pointer hover:text-violet-600 font-medium" onClick={onBack}>Campaigns</span>
                        <ChevronDown size={14} className="-rotate-90" />
                        <span className="font-semibold text-slate-900 dark:text-white truncate max-w-[200px]">{local.name}</span>
                    </div>
                    {lastSaved && (
                        <span className="text-[10px] font-medium text-emerald-500 flex items-center gap-1">
                            <CheckCircle size={11} /> Saved
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-2">
                    {local.status !== 'scheduled' && (
                        <button
                            onClick={() => setShowSchedule(true)}
                            disabled={!canSend || isSending}
                            className={`flex items-center gap-2 px-3 py-2 text-sm font-semibold rounded-xl transition border ${canSend && !isSending ? 'border-amber-400 text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100' : 'border-slate-200 dark:border-slate-700 text-slate-400 cursor-not-allowed'}`}
                        >
                            <Clock size={14} /> Schedule
                        </button>
                    )}
                    <button
                        onClick={onSend}
                        disabled={!canSend || isSending}
                        className={`flex items-center gap-2 px-4 py-2 text-sm font-bold rounded-xl transition ${canSend && !isSending ? 'bg-violet-600 hover:bg-violet-700 text-white shadow-md shadow-violet-200 dark:shadow-violet-900/40' : 'bg-slate-200 dark:bg-slate-700 text-slate-400 cursor-not-allowed'}`}
                    >
                        {isSending ? <><Loader2 size={14} className="animate-spin" />Sending…</> : <><Send size={14} />Send Now</>}
                    </button>
                </div>
            </div>

            {/* Body — side by side on large screens */}
            <div className="flex flex-1 overflow-hidden">
                {/* Left: Config column */}
                <div className="w-[420px] shrink-0 overflow-y-auto border-r border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 p-5 space-y-4">

                    {/* Campaign name */}
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Campaign Name</label>
                        <input
                            type="text"
                            value={local.name}
                            onChange={e => update({ name: e.target.value })}
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                            placeholder="e.g. Sunday Service Reminder"
                        />
                    </div>

                    {/* Recipients */}
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Recipients</label>
                        {/* Tab toggle */}
                        <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600 mb-3">
                            {(['lists', 'groups'] as const).map(tab => (
                                <button
                                    key={tab}
                                    onClick={() => setToTab(tab)}
                                    className={`flex-1 py-1.5 text-xs font-bold capitalize transition ${toTab === tab ? 'bg-violet-600 text-white' : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'}`}
                                >
                                    PCO {tab === 'lists' ? 'Lists' : 'Groups'}
                                </button>
                            ))}
                        </div>

                        {toTab === 'lists' && (
                            <>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">Recipients missing a phone number will be skipped and logged.</p>
                                {loadingLists ? (
                                    <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={13} className="animate-spin" /> Loading lists…</div>
                                ) : (
                                    <select
                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        value={local.toListId || ''}
                                        onChange={e => {
                                            const sel = pcoLists.find(l => l.id === e.target.value);
                                            update({ toListId: sel?.id ?? null, toListName: sel?.name, toGroupId: null, toGroupName: undefined });
                                        }}
                                    >
                                        <option value="">— Select a PCO List —</option>
                                        {pcoLists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.total_people})</option>)}
                                    </select>
                                )}
                            </>
                        )}

                        {toTab === 'groups' && (
                            <>
                                {loadingGroups ? (
                                    <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={13} className="animate-spin" /> Loading groups…</div>
                                ) : (
                                    <select
                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                        value={local.toGroupId || ''}
                                        onChange={e => {
                                            const sel = pcoGroups.find(g => g.id === e.target.value);
                                            update({ toGroupId: sel?.id ?? null, toGroupName: sel?.name, toListId: null, toListName: undefined });
                                        }}
                                    >
                                        <option value="">— Select a PCO Group —</option>
                                        {pcoGroups.map(g => <option key={g.id} value={g.id}>{g.name}{g.memberCount > 0 ? ` (${g.memberCount})` : ''}</option>)}
                                    </select>
                                )}
                            </>
                        )}

                        {(local.toListId || local.toGroupId) && (
                            <div className="flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 mt-2">
                                <CheckCircle size={12} /> {recipientLabel}
                            </div>
                        )}
                    </div>

                    {/* Analytics (readonly for sent campaigns) */}
                    {local.status === 'sent' && (
                        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 p-4 space-y-3">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Send Results</p>
                            <div className="grid grid-cols-2 gap-3">
                                {[
                                    { label: 'Sent', value: local.deliveredCount ?? '—', color: 'text-emerald-600' },
                                    { label: 'Failed', value: local.failedCount ?? '—', color: 'text-red-500' },
                                    { label: 'Opt-Outs', value: local.optOutCount ?? '—', color: 'text-amber-600' },
                                    { label: 'Total', value: local.recipientCount ?? '—', color: 'text-slate-700 dark:text-slate-300' },
                                ].map(s => (
                                    <div key={s.label} className="text-center p-2 bg-slate-50 dark:bg-slate-900/50 rounded-xl">
                                        <p className={`text-xl font-black ${s.color}`}>{s.value}</p>
                                        <p className="text-[10px] text-slate-400 font-semibold uppercase tracking-widest">{s.label}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Right: Message composer */}
                <div className="flex-1 overflow-y-auto p-6">
                    <div className="max-w-xl mx-auto space-y-4">

                        {/* Message body */}
                        <div>
                            <div className="flex items-center justify-between mb-2">
                                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Message</label>
                                <span className={`text-xs font-bold ${segments > 3 ? 'text-red-500' : segments > 1 ? 'text-amber-600' : 'text-slate-400'}`}>
                                    {local.body?.length ?? 0} chars · {segments} segment{segments !== 1 ? 's' : ''}
                                </span>
                            </div>
                            <textarea
                                rows={8}
                                value={local.body || ''}
                                onChange={e => update({ body: e.target.value })}
                                placeholder="Type your message here…"
                                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none font-medium leading-relaxed"
                            />
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">{SEGMENT_NOTE}</p>
                        </div>

                        {/* Merge tag quick-inserts */}
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Merge Tags</label>
                            <div className="flex flex-wrap gap-2">
                                {['{firstName}', '{lastName}', '{fullName}'].map(tag => (
                                    <button
                                        key={tag}
                                        onClick={() => update({ body: (local.body || '') + tag })}
                                        className="px-3 py-1.5 text-xs font-mono font-semibold bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded-xl hover:bg-violet-100 dark:hover:bg-violet-900/40 border border-violet-200 dark:border-violet-800 transition"
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Phone preview */}
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Preview</label>
                            <div className="bg-slate-100 dark:bg-slate-800 rounded-3xl p-4 max-w-[260px] shadow-inner">
                                <div className="bg-violet-600 text-white text-sm px-3 py-2 rounded-2xl rounded-bl-sm shadow-sm max-w-[220px] leading-relaxed whitespace-pre-wrap break-words font-medium">
                                    {(local.body || '').replace('{firstName}', 'John').replace('{lastName}', 'Smith').replace('{fullName}', 'John Smith') || <span className="opacity-50 italic">Your message will appear here…</span>}
                                </div>
                            </div>
                        </div>

                        {/* Compliance note */}
                        <div className="flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3">
                            <AlertTriangle size={14} className="text-amber-500 mt-0.5 shrink-0" />
                            <span>All outbound messages require an opt-out mechanism. Recipients who reply STOP are automatically excluded from future sends.</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Schedule modal */}
            {showSchedule && (
                <ScheduleModal
                    onConfirm={(ts, freq) => { setShowSchedule(false); onSchedule(ts, freq); }}
                    onCancel={() => setShowSchedule(false)}
                    isBusy={isSending}
                />
            )}
        </div>
    );
};

// ─── Campaign List ────────────────────────────────────────────────────────────

const CampaignList: React.FC<{
    campaigns: SmsCampaign[];
    isLoading: boolean;
    onOpen: (c: SmsCampaign) => void;
    onDelete: (id: string) => void;
    onDuplicate: (c: SmsCampaign) => void;
    onCreate: () => void;
}> = ({ campaigns, isLoading, onOpen, onDelete, onDuplicate, onCreate }) => {
    const [tab, setTab] = useState<'all' | 'draft' | 'sent'>('all');
    const filtered = tab === 'all' ? campaigns : campaigns.filter(c => tab === 'sent' ? c.status === 'sent' : (c.status === 'draft' || c.status === 'scheduled'));
    const counts = {
        all: campaigns.length,
        draft: campaigns.filter(c => c.status === 'draft' || c.status === 'scheduled').length,
        sent: campaigns.filter(c => c.status === 'sent').length,
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                        <MessageSquare size={26} className="text-violet-500" /> Text Campaigns
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Send bulk SMS to your Planning Center audience</p>
                </div>
                <button onClick={onCreate} className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition shadow-md shadow-violet-200 dark:shadow-violet-900/40">
                    <Plus size={16} /> New Campaign
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl mb-5 w-fit">
                {(['all', 'draft', 'sent'] as const).map(t => (
                    <button
                        key={t}
                        onClick={() => setTab(t)}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition ${tab === t ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                    >
                        {t === 'all' ? 'All' : t === 'draft' ? 'Drafts' : 'Sent'}
                        <span className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${tab === t ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>{counts[t]}</span>
                    </button>
                ))}
            </div>

            {/* List */}
            {isLoading ? (
                <div className="flex items-center justify-center h-40 text-slate-400"><Loader2 size={22} className="animate-spin mr-2" /> Loading campaigns…</div>
            ) : filtered.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                    <MessageSquare size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-slate-600 dark:text-slate-400 font-semibold">{tab === 'sent' ? 'No sent campaigns yet' : 'No text campaigns yet'}</p>
                    {tab !== 'sent' && (
                        <button onClick={onCreate} className="mt-4 px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition">
                            <span className="flex items-center gap-1.5"><Plus size={14} /> Create Campaign</span>
                        </button>
                    )}
                </div>
            ) : (
                <div className="space-y-3">
                    {filtered.map(c => {
                        const si = STATUS_LABELS[c.status] || STATUS_LABELS.draft;
                        return (
                            <div
                                key={c.id}
                                className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-violet-300 dark:hover:border-violet-600 transition cursor-pointer group"
                                onClick={() => onOpen(c)}
                            >
                                <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center shrink-0">
                                    <MessageSquare size={18} className="text-violet-500" />
                                </div>
                                <div className="flex-grow min-w-0">
                                    <div className="font-bold text-slate-900 dark:text-white truncate">{c.name}</div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex flex-wrap gap-x-2">
                                        {c.toListName && <span>· List: {c.toListName}</span>}
                                        {c.toGroupName && <span>· Group: {c.toGroupName}</span>}
                                        {c.status === 'sent' && c.sentAt && (
                                            <span className="text-emerald-600 dark:text-emerald-400">
                                                · Sent {new Date(c.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · {c.deliveredCount ?? 0} delivered
                                            </span>
                                        )}
                                        {c.status === 'scheduled' && c.scheduledAt && (
                                            <span className="text-amber-600 dark:text-amber-400">
                                                {c.recurringFrequency ? `· Repeats ${c.recurringFrequency}. Next: ` : '· Scheduled: '}
                                                {new Date(c.scheduledAt).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}
                                            </span>
                                        )}
                                        {c.status === 'failed' && c.lastError && <span className="text-red-500">· Failed</span>}
                                    </div>
                                </div>
                                <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${si.color}`}>{si.label}</span>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition shrink-0">
                                    <button onClick={e => { e.stopPropagation(); onDuplicate(c); }} className="p-1.5 text-slate-400 hover:text-violet-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition" title="Duplicate"><Copy size={14} /></button>
                                    <button onClick={e => { e.stopPropagation(); onDelete(c.id); }} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition" title="Delete"><Trash2 size={14} /></button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// ─── Inbox ────────────────────────────────────────────────────────────────────

const SmsInbox: React.FC<{
    churchId: string;
    currentUser: User;
    church: Church;
}> = ({ churchId, currentUser, church }) => {
    const [conversations, setConversations] = useState<SmsConversation[]>([]);
    const [activeConv, setActiveConv]       = useState<SmsConversation | null>(null);
    const [messages, setMessages]           = useState<SmsMessage[]>([]);
    const [replyBody, setReplyBody]         = useState('');
    const [loadingMsgs, setLoadingMsgs]     = useState(false);
    const [isSending, setIsSending]         = useState(false);
    const [search, setSearch]               = useState('');

    // Load conversations
    useEffect(() => {
        const q = query(
            collection(firebaseDb, 'smsConversations'),
            where('churchId', '==', churchId),
            orderBy('lastMessageAt', 'desc'),
            limit(50)
        );
        const unsub = onSnapshot(q, snap => {
            setConversations(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsConversation)));
        });
        return unsub;
    }, [churchId]);

    // Load messages for active conversation
    useEffect(() => {
        if (!activeConv) return;
        setLoadingMsgs(true);
        const q = query(
            collection(firebaseDb, 'smsConversations', activeConv.id, 'messages'),
            orderBy('createdAt', 'asc'),
            limit(100)
        );
        const unsub = onSnapshot(q, snap => {
            setMessages(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsMessage)));
            setLoadingMsgs(false);
        });
        // Mark as read
        updateDoc(doc(firebaseDb, 'smsConversations', activeConv.id), { unreadCount: 0 }).catch(() => {});
        return unsub;
    }, [activeConv?.id]);

    const filtered = conversations.filter(c =>
        !search || c.phoneNumber.includes(search) || (c.personName || '').toLowerCase().includes(search.toLowerCase())
    );

    const handleSendReply = async () => {
        if (!replyBody.trim() || !activeConv || isSending) return;
        setIsSending(true);
        try {
            const res = await fetch(`${API_BASE}/api/messaging/send-individual`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    churchId,
                    toPhone: activeConv.phoneNumber,
                    body: replyBody,
                    sentBy: currentUser.id,
                    sentByName: currentUser.name,
                }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Send failed');
            setReplyBody('');
        } catch (e: any) {
            alert('Failed to send: ' + e.message);
        } finally {
            setIsSending(false);
        }
    };

    return (
        <div className="flex h-full">
            {/* Conversation list */}
            <div className="w-[320px] shrink-0 border-r border-slate-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-900">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                    <h2 className="font-black text-slate-900 dark:text-white text-sm mb-3 flex items-center gap-2">
                        <Inbox size={16} className="text-violet-500" /> Inbox
                    </h2>
                    <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                    </div>
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                    {filtered.length === 0 && (
                        <div className="text-center py-12 text-slate-400">
                            <MessageCircle size={28} className="mx-auto mb-2 opacity-40" />
                            <p className="text-sm">No conversations yet</p>
                        </div>
                    )}
                    {filtered.map(conv => (
                        <button
                            key={conv.id}
                            className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition ${activeConv?.id === conv.id ? 'bg-violet-50 dark:bg-violet-900/20' : ''}`}
                            onClick={() => setActiveConv(conv)}
                        >
                            <div className="flex items-start justify-between gap-2">
                                <div className="flex items-center gap-2.5 min-w-0">
                                    <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 flex items-center justify-center font-black text-sm shrink-0">
                                        {(conv.personName || conv.phoneNumber).charAt(0).toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{conv.personName || formatPhone(conv.phoneNumber)}</p>
                                        {conv.personName && <p className="text-[10px] text-slate-400">{formatPhone(conv.phoneNumber)}</p>}
                                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{conv.lastMessageBody || '…'}</p>
                                    </div>
                                </div>
                                <div className="shrink-0 flex flex-col items-end gap-1">
                                    <span className="text-[10px] text-slate-400">{timeAgo(conv.lastMessageAt)}</span>
                                    {(conv.unreadCount || 0) > 0 && (
                                        <span className="w-4.5 h-4.5 bg-violet-600 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1.5">
                                            {conv.unreadCount}
                                        </span>
                                    )}
                                    {conv.isOptedOut && <span className="text-[9px] text-red-500 font-bold">OPT-OUT</span>}
                                </div>
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Message thread */}
            {activeConv ? (
                <div className="flex-1 flex flex-col">
                    {/* Thread header */}
                    <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center gap-3">
                        <div className="w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 flex items-center justify-center font-black text-sm">
                            {(activeConv.personName || activeConv.phoneNumber).charAt(0).toUpperCase()}
                        </div>
                        <div>
                            <p className="font-bold text-slate-900 dark:text-white text-sm">{activeConv.personName || formatPhone(activeConv.phoneNumber)}</p>
                            <p className="text-xs text-slate-400">{formatPhone(activeConv.phoneNumber)}</p>
                        </div>
                        {activeConv.isOptedOut && (
                            <span className="ml-2 text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-full px-2 py-0.5">OPTED OUT</span>
                        )}
                    </div>

                    {/* Messages */}
                    <div className="flex-1 overflow-y-auto p-5 space-y-3 bg-slate-50 dark:bg-slate-950">
                        {loadingMsgs ? (
                            <div className="flex justify-center py-12 text-slate-400"><Loader2 size={20} className="animate-spin" /></div>
                        ) : messages.length === 0 ? (
                            <div className="text-center py-12 text-slate-400 text-sm">No messages yet</div>
                        ) : (
                            messages.map(msg => (
                                <div key={msg.id} className={`flex ${msg.direction === 'outbound' ? 'justify-end' : 'justify-start'}`}>
                                    <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl text-sm leading-relaxed ${msg.direction === 'outbound' ? 'bg-violet-600 text-white rounded-br-sm' : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white border border-slate-200 dark:border-slate-700 rounded-bl-sm'}`}>
                                        <p className="whitespace-pre-wrap break-words">{msg.body}</p>
                                        {msg.mediaUrls && msg.mediaUrls.length > 0 && (
                                            <div className="mt-2 space-y-1">
                                                {msg.mediaUrls.map((url, i) => (
                                                    <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block text-xs underline opacity-70">Media {i + 1}</a>
                                                ))}
                                            </div>
                                        )}
                                        <div className={`text-[10px] mt-1 ${msg.direction === 'outbound' ? 'text-violet-200' : 'text-slate-400'}`}>
                                            {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                            {msg.direction === 'outbound' && msg.sentByName && ` · ${msg.sentByName}`}
                                            {msg.direction === 'outbound' && msg.status && ` · ${msg.status}`}
                                        </div>
                                    </div>
                                </div>
                            ))
                        )}
                    </div>

                    {/* Reply box */}
                    <div className="p-4 border-t border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                        {activeConv.isOptedOut ? (
                            <div className="flex items-center gap-2 text-xs text-red-500 font-semibold p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl">
                                <AlertTriangle size={13} /> This contact has opted out. You cannot send them messages.
                            </div>
                        ) : (
                            <div className="flex items-end gap-2">
                                <textarea
                                    rows={2}
                                    value={replyBody}
                                    onChange={e => setReplyBody(e.target.value)}
                                    placeholder="Type a reply…"
                                    onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendReply(); }}}
                                    className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                                />
                                <button
                                    onClick={handleSendReply}
                                    disabled={!replyBody.trim() || isSending}
                                    className="px-4 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl transition font-bold shrink-0"
                                >
                                    {isSending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                                </button>
                            </div>
                        )}
                    </div>
                </div>
            ) : (
                <div className="flex-1 flex flex-col items-center justify-center text-slate-400">
                    <MessageSquare size={48} className="mb-3 opacity-20" />
                    <p className="font-semibold">Select a conversation</p>
                </div>
            )}
        </div>
    );
};

// ─── SMS Keywords Manager ────────────────────────────────────────────────────

interface KeywordModalProps {
    initial?: SmsKeyword | null;
    pcoLists: { id: string; name: string; total_people: number }[];
    loadingLists: boolean;
    onSave: (kw: Omit<SmsKeyword, 'id' | 'matchCount' | 'createdAt'>) => Promise<void>;
    onClose: () => void;
    isBusy: boolean;
}

const KeywordModal: React.FC<KeywordModalProps> = ({ initial, pcoLists, loadingLists, onSave, onClose, isBusy }) => {
    const [keyword, setKeyword]           = useState(initial?.keyword || '');
    const [replyMessage, setReplyMessage] = useState(initial?.replyMessage || '');
    const [addToListId, setAddToListId]   = useState(initial?.addToListId || '');
    const [isActive, setIsActive]         = useState(initial?.isActive ?? true);
    const [error, setError]               = useState('');

    const segs    = countSegments(replyMessage);
    const isEdit  = !!initial;

    const handleSubmit = async () => {
        const kw = keyword.trim().toUpperCase().replace(/\s+/g, '');
        if (!kw)            { setError('Keyword is required.'); return; }
        if (!replyMessage.trim()) { setError('Auto-reply message is required.'); return; }
        if (!/^[A-Z0-9]+$/.test(kw)) { setError('Keywords can only contain letters and numbers.'); return; }
        setError('');
        const selectedList = pcoLists.find(l => l.id === addToListId);
        await onSave({
            churchId:      initial?.churchId || '',   // parent will fill in
            keyword:       kw,
            replyMessage:  replyMessage.trim(),
            addToListId:   addToListId || null,
            addToListName: selectedList?.name || null,
            isActive,
        });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-7 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                    <Key size={18} className="text-violet-500" /> {isEdit ? 'Edit Keyword' : 'New Keyword'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                    When someone texts this word to your number, we'll auto-reply instantly.
                </p>

                {/* Keyword trigger */}
                <div className="mb-4">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Trigger Word</label>
                    <input
                        type="text"
                        value={keyword}
                        onChange={e => setKeyword(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                        placeholder="YOUTH"
                        maxLength={30}
                        className="w-full text-xl font-black tracking-widest border-2 border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-violet-600 dark:text-violet-300 focus:outline-none focus:border-violet-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Letters &amp; numbers only, no spaces. Stored as UPPERCASE.</p>
                </div>

                {/* Auto-reply message */}
                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Auto-Reply Message</label>
                        <span className={`text-xs font-bold ${segs > 3 ? 'text-red-500' : segs > 1 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {replyMessage.length} chars · {segs} seg{segs !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <textarea
                        rows={4}
                        value={replyMessage}
                        onChange={e => setReplyMessage(e.target.value)}
                        placeholder={`Thanks for texting ${keyword || 'YOUTH'}! Here's what you need to know…`}
                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                    />

                    {/* Phone bubble preview */}
                    {replyMessage.trim() && (
                        <div className="mt-2 bg-slate-100 dark:bg-slate-800/60 rounded-2xl p-3 flex justify-end">
                            <div className="bg-violet-600 text-white text-xs px-3 py-2 rounded-2xl rounded-br-sm max-w-[85%] leading-relaxed whitespace-pre-wrap break-words">
                                {replyMessage}
                            </div>
                        </div>
                    )}
                </div>

                {/* Optional PCO list */}
                <div className="mb-4">
                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Add to PCO List (optional)</label>
                    <p className="text-[10px] text-slate-400 mb-2">When a match occurs, automatically add the sender to this Planning Center list.</p>
                    {loadingLists ? (
                        <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={13} className="animate-spin" /> Loading…</div>
                    ) : (
                        <select
                            value={addToListId}
                            onChange={e => setAddToListId(e.target.value)}
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        >
                            <option value="">— Don't add to a list —</option>
                            {pcoLists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.total_people})</option>)}
                        </select>
                    )}
                </div>

                {/* Active toggle */}
                <div className="flex items-center justify-between mb-5 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">Active</p>
                        <p className="text-xs text-slate-500">Keyword only fires when active</p>
                    </div>
                    <button
                        onClick={() => setIsActive(v => !v)}
                        className={`relative w-12 h-6 rounded-full transition-colors ${isActive ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                    >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isActive ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>

                {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

                <div className="flex gap-2">
                    <button onClick={onClose} className="flex-1 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 transition">Cancel</button>
                    <button
                        onClick={handleSubmit}
                        disabled={isBusy}
                        className="flex-1 py-2.5 text-sm font-black bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl transition flex items-center justify-center gap-2"
                    >
                        {isBusy ? <><Loader2 size={14} className="animate-spin" />Saving…</> : <><CheckCircle size={14} />{isEdit ? 'Save Changes' : 'Create Keyword'}</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

const SmsKeywordsManager: React.FC<{ churchId: string }> = ({ churchId }) => {
    const [keywords, setKeywords]   = useState<SmsKeyword[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editKw, setEditKw]       = useState<SmsKeyword | null | 'new'>('new' as any);
    const [modalOpen, setModalOpen] = useState(false);
    const [isBusy, setIsBusy]       = useState(false);
    const [pcoLists, setPcoLists]   = useState<{ id: string; name: string; total_people: number }[]>([]);
    const [loadingLists, setLoadingLists] = useState(false);

    // Real-time keyword listener
    useEffect(() => {
        const q = query(
            collection(firebaseDb, 'smsKeywords'),
            where('churchId', '==', churchId),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, snap => {
            setKeywords(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsKeyword)));
            setIsLoading(false);
        });
        return unsub;
    }, [churchId]);

    // Load PCO lists for the modal picker
    useEffect(() => {
        setLoadingLists(true);
        pcoService.getPeopleLists(churchId).then((raw: any[]) => {
            setPcoLists(raw.map(r => ({
                id: r.id,
                name: r.attributes?.name || 'Unnamed',
                total_people: r.attributes?.total_people ?? 0,
            })));
            setLoadingLists(false);
        }).catch(() => setLoadingLists(false));
    }, [churchId]);

    const handleSave = async (data: Omit<SmsKeyword, 'id' | 'matchCount' | 'createdAt'>) => {
        setIsBusy(true);
        try {
            const editing = editKw !== 'new' ? editKw as SmsKeyword : null;
            if (editing) {
                await updateDoc(doc(firebaseDb, 'smsKeywords', editing.id), {
                    ...data,
                    churchId,
                });
            } else {
                const now = Date.now();
                await addDoc(collection(firebaseDb, 'smsKeywords'), {
                    ...data,
                    churchId,
                    matchCount: 0,
                    createdAt: now,
                });
            }
            setModalOpen(false);
            setEditKw(null);
        } catch (e: any) {
            alert('Failed to save keyword: ' + e.message);
        } finally {
            setIsBusy(false);
        }
    };

    const handleToggleActive = async (kw: SmsKeyword) => {
        await updateDoc(doc(firebaseDb, 'smsKeywords', kw.id), { isActive: !kw.isActive });
    };

    const handleDelete = async (kw: SmsKeyword) => {
        if (!window.confirm(`Delete keyword "${kw.keyword}"? This cannot be undone.`)) return;
        await deleteDoc(doc(firebaseDb, 'smsKeywords', kw.id));
    };

    const openNew = () => { setEditKw('new' as any); setModalOpen(true); };
    const openEdit = (kw: SmsKeyword) => { setEditKw(kw); setModalOpen(true); };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                        <Key size={26} className="text-violet-500" /> Keywords
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Auto-reply when someone texts a trigger word. Great for RSVP flows, info requests, and more.
                    </p>
                </div>
                <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition shadow-md shadow-violet-200 dark:shadow-violet-900/40">
                    <Plus size={16} /> New Keyword
                </button>
            </div>

            {/* How it works banner */}
            <div className="flex items-start gap-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-2xl p-4 mb-6">
                <div className="text-3xl">💡</div>
                <div>
                    <p className="text-sm font-bold text-violet-800 dark:text-violet-200 mb-1">How Keywords Work</p>
                    <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed">
                        When someone texts your church number with just the keyword (e.g. <span className="font-mono font-bold bg-violet-100 dark:bg-violet-900/60 px-1 rounded">YOUTH</span>), they receive your auto-reply instantly. Carrier-mandated STOP/HELP responses take priority and cannot be overridden. Each keyword is matched against the first word of any inbound message.
                    </p>
                </div>
            </div>

            {/* List */}
            {isLoading ? (
                <div className="flex items-center justify-center h-40 text-slate-400"><Loader2 size={20} className="animate-spin mr-2" /> Loading keywords…</div>
            ) : keywords.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                    <Key size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-slate-600 dark:text-slate-400 font-semibold">No keywords yet</p>
                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 mb-4">Create your first keyword to start auto-replying to texts.</p>
                    <button onClick={openNew} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition">
                        <span className="flex items-center gap-1.5"><Plus size={14} /> New Keyword</span>
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {keywords.map(kw => (
                        <div
                            key={kw.id}
                            className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-violet-200 dark:hover:border-violet-700 transition group"
                        >
                            {/* Keyword badge */}
                            <div className={`shrink-0 px-3 py-2 rounded-xl text-sm font-black tracking-widest ${kw.isActive ? 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-200' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 line-through'}`}>
                                {kw.keyword}
                            </div>

                            {/* Reply preview */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm text-slate-700 dark:text-slate-300 truncate">{kw.replyMessage}</p>
                                <div className="flex items-center gap-3 mt-0.5">
                                    {kw.addToListName && (
                                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
                                            <Users size={10} /> → {kw.addToListName}
                                        </span>
                                    )}
                                    <span className="text-[10px] text-slate-400">
                                        {new Date(kw.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </span>
                                </div>
                            </div>

                            {/* Match count */}
                            <div className="text-center shrink-0">
                                <p className="text-xl font-black text-violet-600 dark:text-violet-300">{kw.matchCount}</p>
                                <p className="text-[10px] text-slate-400 uppercase tracking-widest">matches</p>
                            </div>

                            {/* Toggle + actions */}
                            <div className="flex items-center gap-2 shrink-0">
                                {/* Active toggle */}
                                <button
                                    onClick={() => handleToggleActive(kw)}
                                    title={kw.isActive ? 'Deactivate' : 'Activate'}
                                    className={`relative w-11 h-6 rounded-full transition-colors ${kw.isActive ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                                >
                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${kw.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                                </button>

                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                    <button onClick={() => openEdit(kw)} className="p-1.5 text-slate-400 hover:text-violet-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition" title="Edit">
                                        <Pencil size={14} />
                                    </button>
                                    <button onClick={() => handleDelete(kw)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition" title="Delete">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Carrier reserved keywords note */}
            <div className="mt-6 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                <span>
                    <strong>Reserved words:</strong> STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, HELP, and START are reserved by carriers and cannot be used as custom keywords. These responses are handled automatically.
                </span>
            </div>

            {/* Keyword modal */}
            {modalOpen && (
                <KeywordModal
                    initial={editKw !== 'new' ? editKw as SmsKeyword : null}
                    pcoLists={pcoLists}
                    loadingLists={loadingLists}
                    onSave={handleSave}
                    onClose={() => { setModalOpen(false); setEditKw(null); }}
                    isBusy={isBusy}
                />
            )}
        </div>
    );
};

// ─── Analytics Dashboard ──────────────────────────────────────────────────

interface UsageSummary {
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    totalBulk: number;
    totalReplies: number;
    totalOptOuts: number;
    estimatedCostUsd: number;
    deliveryRate: number;
}

const MONTH_NAMES = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

function currentMonthKey(): string {
    const d = new Date();
    return `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2,'0')}`;
}

const StatCard: React.FC<{
    label: string;
    value: string | number;
    sub?: string;
    icon: React.ReactNode;
    color?: string;
    trend?: 'up' | 'down' | 'neutral';
}> = ({ label, value, sub, icon, color = 'violet', trend }) => {
    const colorMap: Record<string, string> = {
        violet: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300',
        emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300',
        amber:   'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
        red:     'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400',
        blue:    'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300',
        slate:   'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
    };
    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color] || colorMap.violet}`}>
                    {icon}
                </div>
                {trend && (
                    <span className={`text-xs font-bold flex items-center gap-0.5 ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-slate-400'}`}>
                        {trend === 'up' ? <TrendingUp size={12} /> : trend === 'down' ? <TrendingDown size={12} /> : null}
                    </span>
                )}
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mb-0.5">{value}</p>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest">{label}</p>
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
    );
};

const MiniBar: React.FC<{ pct: number; color?: string }> = ({ pct, color = 'bg-violet-500' }) => (
    <div className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${Math.min(100, Math.max(0, pct))}%` }} />
    </div>
);

const SmsAnalytics: React.FC<{ churchId: string; campaigns: SmsCampaign[] }> = ({ churchId, campaigns }) => {
    const [summary, setSummary]     = useState<UsageSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [optOuts, setOptOuts]     = useState(0);
    const [monthlyData, setMonthlyData] = useState<{ month: string; label: string; sent: number; delivered: number }[]>([]);
    const [period, setPeriod]       = useState<'30d' | '90d' | 'all'>('30d');

    useEffect(() => {
        let active = true;
        setIsLoading(true);

        const fetchData = async () => {
            try {
                // Opt-outs count
                const optSnap = await getDocs(
                    query(collection(firebaseDb, 'smsOptOuts'), where('churchId', '==', churchId))
                );
                const optOutCount = optSnap.size;

                // Usage records (per-message billing log)
                const usageSnap = await getDocs(
                    query(
                        collection(firebaseDb, 'smsUsageRecords'),
                        where('churchId', '==', churchId),
                        orderBy('createdAt', 'desc'),
                        limit(5000)
                    )
                );
                const usageRecords: any[] = usageSnap.docs.map(d => d.data());

                // Derive summary from sent campaigns + usage records
                const sentCampaigns = campaigns.filter(c => c.status === 'sent');
                const totalSent       = sentCampaigns.reduce((s, c) => s + (c.recipientCount ?? 0), 0);
                const totalDelivered  = sentCampaigns.reduce((s, c) => s + (c.deliveredCount ?? 0), 0);
                const totalFailed     = sentCampaigns.reduce((s, c) => s + (c.failedCount ?? 0), 0);
                const totalOptOutC    = sentCampaigns.reduce((s, c) => s + (c.optOutCount ?? 0), 0);
                const totalCost       = usageRecords.reduce((s, r) => s + (r.costUsd ?? 0), 0);

                // Inbound conversation count as proxy for replies
                const convSnap = await getDocs(
                    query(collection(firebaseDb, 'smsConversations'), where('churchId', '==', churchId))
                );
                const totalReplies = convSnap.size;

                // Build monthly bars (last 6 months from campaigns)
                const monthMap: Record<string, { sent: number; delivered: number }> = {};
                const now = new Date();
                for (let i = 5; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const key = `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2,'0')}`;
                    monthMap[key] = { sent: 0, delivered: 0 };
                }
                for (const c of sentCampaigns) {
                    if (!c.sentAt) continue;
                    const d = new Date(c.sentAt);
                    const key = `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2,'0')}`;
                    if (monthMap[key]) {
                        monthMap[key].sent      += c.recipientCount  ?? 0;
                        monthMap[key].delivered += c.deliveredCount  ?? 0;
                    }
                }
                const monthly = Object.entries(monthMap).map(([key, v]) => {
                    const [yr, mo] = key.split('_');
                    return { month: key, label: `${MONTH_NAMES[parseInt(mo) - 1]} '${String(yr).slice(2)}`, ...v };
                });

                if (!active) return;
                setOptOuts(Math.max(optOutCount, totalOptOutC));
                setMonthlyData(monthly);
                setSummary({
                    totalSent,
                    totalDelivered,
                    totalFailed,
                    totalBulk:       sentCampaigns.length,
                    totalReplies,
                    totalOptOuts:    Math.max(optOutCount, totalOptOutC),
                    estimatedCostUsd: totalCost,
                    deliveryRate:    totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
                });
            } catch (e) {
                console.error('[SmsAnalytics] failed', e);
            } finally {
                if (active) setIsLoading(false);
            }
        };

        fetchData();
        return () => { active = false; };
    }, [churchId, campaigns]);

    // Filter campaigns by period
    const cutoff = period === '30d' ? Date.now() - 30 * 86400_000
                  : period === '90d' ? Date.now() - 90 * 86400_000
                  : 0;
    const periodCampaigns = campaigns.filter(c => c.status === 'sent' && (c.sentAt ?? 0) >= cutoff);

    const maxSent = Math.max(...monthlyData.map(m => m.sent), 1);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64 text-slate-400">
                <Loader2 size={22} className="animate-spin mr-2" /> Loading analytics…
            </div>
        );
    }

    return (
        <div className="p-6 max-w-5xl mx-auto space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                        <BarChart3 size={26} className="text-violet-500" /> Analytics
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Message performance, delivery rates, and usage overview</p>
                </div>
                {/* Period selector */}
                <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    {(['30d', '90d', 'all'] as const).map(p => (
                        <button
                            key={p}
                            onClick={() => setPeriod(p)}
                            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                period === p ? 'bg-white dark:bg-slate-700 text-violet-600 dark:text-violet-300 shadow-sm' : 'text-slate-500 dark:text-slate-400'
                            }`}
                        >
                            {p === '30d' ? 'Last 30d' : p === '90d' ? 'Last 90d' : 'All time'}
                        </button>
                    ))}
                </div>
            </div>

            {/* KPI Cards */}
            {summary && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        label="Total Sent"
                        value={summary.totalSent.toLocaleString()}
                        sub={`${summary.totalBulk} campaign${summary.totalBulk !== 1 ? 's' : ''}`}
                        icon={<Send size={18} />}
                        color="violet"
                    />
                    <StatCard
                        label="Delivery Rate"
                        value={`${summary.deliveryRate}%`}
                        sub={`${summary.totalDelivered.toLocaleString()} delivered`}
                        icon={<CheckCircle size={18} />}
                        color={summary.deliveryRate >= 90 ? 'emerald' : summary.deliveryRate >= 70 ? 'amber' : 'red'}
                        trend={summary.deliveryRate >= 90 ? 'up' : summary.deliveryRate < 70 ? 'down' : 'neutral'}
                    />
                    <StatCard
                        label="Conversations"
                        value={summary.totalReplies.toLocaleString()}
                        sub="2-way inbox threads"
                        icon={<MessageCircle size={18} />}
                        color="blue"
                    />
                    <StatCard
                        label="Opt-Outs"
                        value={summary.totalOptOuts.toLocaleString()}
                        sub="STOP replies received"
                        icon={<UserX size={18} />}
                        color={summary.totalOptOuts > 0 ? 'red' : 'emerald'}
                        trend={summary.totalOptOuts > 10 ? 'down' : 'neutral'}
                    />
                </div>
            )}

            {/* Two-column: Bar chart + cost */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                {/* Monthly volume bars */}
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Monthly Volume (last 6 months)</p>
                    {monthlyData.every(m => m.sent === 0) ? (
                        <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                            <Activity size={28} className="mb-2 opacity-30" />
                            <p className="text-sm">No sent campaigns yet</p>
                        </div>
                    ) : (
                        <div className="flex items-end gap-3 h-36">
                            {monthlyData.map(m => {
                                const heightPct = (m.sent / maxSent) * 100;
                                const delivPct  = m.sent > 0 ? (m.delivered / m.sent) * 100 : 0;
                                return (
                                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5">
                                        <div className="w-full flex flex-col items-center group relative">
                                            {/* Tooltip */}
                                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 dark:bg-slate-700 text-white text-[10px] font-bold px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none z-10">
                                                {m.sent.toLocaleString()} sent · {m.delivered.toLocaleString()} delivered
                                            </div>
                                            {/* Bar outer */}
                                            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden" style={{ height: '120px' }}>
                                                {/* Sent fill */}
                                                <div
                                                    className="w-full bg-violet-200 dark:bg-violet-900/40 rounded-xl transition-all duration-500 flex flex-col justify-end"
                                                    style={{ height: `${heightPct}%`, position: 'relative', marginTop: `${100 - heightPct}%` }}
                                                >
                                                    {/* Delivered overlay */}
                                                    <div
                                                        className="w-full bg-violet-600 rounded-b-xl transition-all duration-500"
                                                        style={{ height: `${delivPct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-semibold">{m.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    {/* Legend */}
                    <div className="flex items-center gap-4 mt-3">
                        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                            <span className="w-3 h-3 rounded-sm bg-violet-200 dark:bg-violet-900/40" /> Sent
                        </span>
                        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                            <span className="w-3 h-3 rounded-sm bg-violet-600" /> Delivered
                        </span>
                    </div>
                </div>

                {/* Cost card */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 flex flex-col">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Estimated Cost</p>
                    <div className="flex-1 flex flex-col items-center justify-center">
                        <div className="w-16 h-16 rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center mb-3">
                            <DollarSign size={28} className="text-emerald-600 dark:text-emerald-400" />
                        </div>
                        <p className="text-3xl font-black text-slate-900 dark:text-white">
                            ${(summary?.estimatedCostUsd ?? 0).toFixed(2)}
                        </p>
                        <p className="text-xs text-slate-400 text-center mt-2">
                            Based on tracked usage records at ~$0.0075/segment. Actual billing is in your Twilio Console.
                        </p>
                    </div>
                    <div className="mt-4 p-3 bg-slate-50 dark:bg-slate-700/50 rounded-xl">
                        <div className="flex justify-between text-xs mb-1">
                            <span className="text-slate-500">Failed messages</span>
                            <span className="font-bold text-slate-700 dark:text-slate-300">{summary?.totalFailed ?? 0}</span>
                        </div>
                        <div className="flex justify-between text-xs">
                            <span className="text-slate-500">Opt-outs (total)</span>
                            <span className="font-bold text-red-500">{summary?.totalOptOuts ?? 0}</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Campaign performance table */}
            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400">Campaign Performance</p>
                    <span className="text-xs text-slate-400">{periodCampaigns.length} campaigns</span>
                </div>
                {periodCampaigns.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                        <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No sent campaigns in this period</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-700">
                        {periodCampaigns
                            .sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0))
                            .slice(0, 10)
                            .map(c => {
                                const total     = c.recipientCount ?? 0;
                                const delivered = c.deliveredCount ?? 0;
                                const failed    = c.failedCount ?? 0;
                                const rate      = total > 0 ? Math.round((delivered / total) * 100) : 0;
                                return (
                                    <div key={c.id} className="px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition">
                                        <div className="flex items-start justify-between gap-4 mb-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{c.name}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">
                                                    {c.sentAt ? new Date(c.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                                    {c.toListName ? ` · ${c.toListName}` : ''}
                                                    {c.toGroupName ? ` · ${c.toGroupName}` : ''}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-4 shrink-0 text-right">
                                                <div>
                                                    <p className="text-sm font-black text-slate-900 dark:text-white">{total.toLocaleString()}</p>
                                                    <p className="text-[10px] text-slate-400">sent</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-emerald-600">{delivered.toLocaleString()}</p>
                                                    <p className="text-[10px] text-slate-400">delivered</p>
                                                </div>
                                                {failed > 0 && (
                                                    <div>
                                                        <p className="text-sm font-black text-red-500">{failed.toLocaleString()}</p>
                                                        <p className="text-[10px] text-slate-400">failed</p>
                                                    </div>
                                                )}
                                                <div className="w-16">
                                                    <p className={`text-sm font-black ${rate >= 90 ? 'text-emerald-600' : rate >= 70 ? 'text-amber-600' : 'text-red-500'}`}>{rate}%</p>
                                                    <MiniBar pct={rate} color={rate >= 90 ? 'bg-emerald-500' : rate >= 70 ? 'bg-amber-400' : 'bg-red-500'} />
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        }
                    </div>
                )}
            </div>

            {/* Compliance / health */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                {/* Opt-out breakdown */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Compliance Health</p>
                    <div className="space-y-3">
                        {[
                            { label: 'Delivery rate', pct: summary?.deliveryRate ?? 0,
                              color: (summary?.deliveryRate ?? 0) >= 90 ? 'bg-emerald-500' : 'bg-amber-400',
                              note: (summary?.deliveryRate ?? 0) >= 90 ? 'Excellent' : 'Needs attention' },
                            { label: 'Opt-out rate',
                              pct: summary && summary.totalSent > 0 ? Math.round((summary.totalOptOuts / summary.totalSent) * 100) : 0,
                              color: 'bg-red-400',
                              note: summary && summary.totalSent > 0 ? `${((summary.totalOptOuts / summary.totalSent) * 100).toFixed(1)}% of recipients` : 'No data' },
                            { label: 'Failed rate',
                              pct: summary && summary.totalSent > 0 ? Math.round((summary.totalFailed / summary.totalSent) * 100) : 0,
                              color: 'bg-slate-400',
                              note: summary && summary.totalSent > 0 ? `${((summary.totalFailed / summary.totalSent) * 100).toFixed(1)}% of sends` : 'No data' },
                        ].map(row => (
                            <div key={row.label}>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="font-semibold text-slate-700 dark:text-slate-300">{row.label}</span>
                                    <span className="text-slate-400">{row.note}</span>
                                </div>
                                <MiniBar pct={row.pct} color={row.color} />
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 flex items-start gap-2 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-2.5">
                        <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                        <span>Carriers may filter messages if opt-out rates exceed 1% or delivery rates fall below 85%.</span>
                    </div>
                </div>

                {/* Quick stats */}
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                    <p className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Quick Stats</p>
                    <div className="space-y-3">
                        {[
                            { label: 'Avg. recipients per campaign', value: summary && summary.totalBulk > 0 ? Math.round(summary.totalSent / summary.totalBulk).toLocaleString() : '—' },
                            { label: 'Total 2-way conversations', value: summary?.totalReplies.toLocaleString() ?? '—' },
                            { label: 'Total opt-outs (all time)', value: summary?.totalOptOuts.toLocaleString() ?? '—' },
                            { label: 'Campaigns sent', value: summary?.totalBulk.toLocaleString() ?? '—' },
                            { label: 'Est. cost per delivered msg', value: summary && summary.totalDelivered > 0 ? `$${((summary.estimatedCostUsd / summary.totalDelivered)).toFixed(4)}` : '—' },
                        ].map(row => (
                            <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
                                <span className="text-xs text-slate-500 dark:text-slate-400">{row.label}</span>
                                <span className="text-sm font-black text-slate-900 dark:text-white">{row.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
};

// ─── Workflows Manager ──────────────────────────────────────────────────

// ---- tiny uuid (no dep) ----
function uid(): string {
    return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

// ─── Step Editor Row ─────────────────────────────────────────────────────────

const StepRow: React.FC<{
    step: SmsWorkflowStep;
    index: number;
    total: number;
    onChange: (patch: Partial<SmsWorkflowStep>) => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
}> = ({ step, index, total, onChange, onDelete, onMoveUp, onMoveDown }) => {
    const segs = countSegments(step.message);

    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
            {/* Step header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-violet-600 text-white text-xs font-black flex items-center justify-center shrink-0">{index + 1}</span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Step {index + 1}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={onMoveUp} disabled={index === 0} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"><ChevronDown size={14} className="rotate-180" /></button>
                    <button onClick={onMoveDown} disabled={index === total - 1} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"><ChevronDown size={14} /></button>
                    <button onClick={onDelete} className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"><Trash2 size={14} /></button>
                </div>
            </div>

            {/* Delay */}
            <div className="flex items-center gap-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-600 dark:text-slate-400">
                    <Clock size={13} className="text-violet-400" /> Send after
                </div>
                <div className="flex items-center gap-2">
                    <input
                        type="number"
                        min={0}
                        max={365}
                        value={step.delayDays}
                        onChange={e => onChange({ delayDays: Math.max(0, parseInt(e.target.value) || 0) })}
                        className="w-16 text-center text-sm font-black border border-slate-200 dark:border-slate-600 rounded-xl px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        {step.delayDays === 0 ? 'days (immediate)' : `day${step.delayDays !== 1 ? 's' : ''}`}
                    </span>
                </div>
            </div>

            {/* Message */}
            <div>
                <div className="flex items-center justify-between mb-1.5">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Message</label>
                    <span className={`text-[10px] font-bold ${
                        segs > 3 ? 'text-red-500' : segs > 1 ? 'text-amber-600' : 'text-slate-400'
                    }`}>{step.message.length} chars · {segs} seg{segs !== 1 ? 's' : ''}</span>
                </div>
                <textarea
                    rows={3}
                    value={step.message}
                    onChange={e => onChange({ message: e.target.value })}
                    placeholder="Type your message… Use {firstName} for personalization."
                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                />
                {/* Merge tag buttons */}
                <div className="flex gap-1.5 mt-1.5">
                    {['{firstName}', '{lastName}'].map(t => (
                        <button
                            key={t}
                            onClick={() => onChange({ message: step.message + t })}
                            className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded-lg border border-violet-200 dark:border-violet-800 hover:bg-violet-100 transition"
                        >{t}</button>
                    ))}
                </div>
            </div>

            {/* Bubble preview */}
            {step.message.trim() && (
                <div className="bg-slate-100 dark:bg-slate-900/40 rounded-2xl p-3 flex justify-end">
                    <div className="bg-violet-600 text-white text-xs px-3 py-2 rounded-2xl rounded-br-sm max-w-[85%] leading-relaxed whitespace-pre-wrap break-words">
                        {step.message.replace('{firstName}', 'John').replace('{lastName}', 'Smith')}
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Workflow Editor ─────────────────────────────────────────────────────────

const WorkflowEditor: React.FC<{
    initial: SmsWorkflow | null;
    churchId: string;
    keywords: SmsKeyword[];
    pcoLists: { id: string; name: string }[];
    onSave: (wf: SmsWorkflow) => Promise<void>;
    onBack: () => void;
    isBusy: boolean;
}> = ({ initial, churchId, keywords, pcoLists, onSave, onBack, isBusy }) => {
    const makeBlank = (): SmsWorkflow => ({
        id: uid(),
        churchId,
        name: '',
        description: '',
        trigger: 'manual',
        triggerKeywordId: null,
        triggerKeywordWord: null,
        triggerListId: null,
        triggerListName: null,
        steps: [{ id: uid(), order: 0, delayDays: 0, message: '' }],
        isActive: true,
        enrolledCount: 0,
        completedCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });

    const [wf, setWf] = useState<SmsWorkflow>(initial ?? makeBlank());
    const [error, setError] = useState('');

    const patch = (p: Partial<SmsWorkflow>) => setWf(prev => ({ ...prev, ...p }));

    const addStep = () => {
        const steps = [...wf.steps, { id: uid(), order: wf.steps.length, delayDays: 1, message: '' }];
        patch({ steps });
    };

    const updateStep = (idx: number, p: Partial<SmsWorkflowStep>) => {
        const steps = wf.steps.map((s, i) => i === idx ? { ...s, ...p } : s);
        patch({ steps });
    };

    const deleteStep = (idx: number) => {
        patch({ steps: wf.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i })) });
    };

    const moveStep = (idx: number, dir: 'up' | 'down') => {
        const steps = [...wf.steps];
        const swap = dir === 'up' ? idx - 1 : idx + 1;
        [steps[idx], steps[swap]] = [steps[swap], steps[idx]];
        patch({ steps: steps.map((s, i) => ({ ...s, order: i })) });
    };

    const handleSave = async () => {
        if (!wf.name.trim()) { setError('Workflow name is required.'); return; }
        if (wf.steps.length === 0) { setError('Add at least one step.'); return; }
        if (wf.steps.some(s => !s.message.trim())) { setError('All steps must have a message.'); return; }
        if (wf.trigger === 'keyword' && !wf.triggerKeywordId) { setError('Select a keyword trigger.'); return; }
        if (wf.trigger === 'list_add' && !wf.triggerListId) { setError('Select a PCO list trigger.'); return; }
        setError('');
        await onSave({ ...wf, updatedAt: Date.now() });
    };

    const triggerLabel: Record<string, string> = {
        manual: 'Staff manually enrolls a contact',
        keyword: 'Contact texts a keyword',
        list_add: 'Contact added to a PCO List',
    };

    return (
        <div className="flex flex-col h-full">
            {/* Editor header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} className="p-1.5 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                        <span className="cursor-pointer hover:text-violet-600 font-medium" onClick={onBack}>Workflows</span>
                        <span className="mx-1.5 text-slate-300 dark:text-slate-600">/</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{wf.name || 'New Workflow'}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Active toggle */}
                    <button
                        onClick={() => patch({ isActive: !wf.isActive })}
                        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-xl border transition ${
                            wf.isActive ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 dark:border-slate-600 text-slate-500'
                        }`}
                    >
                        <span className={`w-2 h-2 rounded-full ${ wf.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {wf.isActive ? 'Active' : 'Paused'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isBusy}
                        className="flex items-center gap-2 px-4 py-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition"
                    >
                        {isBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                        {initial ? 'Save Changes' : 'Create Workflow'}
                    </button>
                </div>
            </div>

            {/* Editor body */}
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto p-6 space-y-6">

                    {/* Name + description */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Workflow Details</p>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Name</label>
                            <input
                                type="text"
                                value={wf.name}
                                onChange={e => patch({ name: e.target.value })}
                                placeholder="e.g. New Visitor Follow-Up"
                                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Description <span className="font-normal opacity-60">(optional)</span></label>
                            <textarea
                                rows={2}
                                value={wf.description || ''}
                                onChange={e => patch({ description: e.target.value })}
                                placeholder="What does this workflow do?"
                                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                            />
                        </div>
                    </div>

                    {/* Trigger */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Trigger</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">What event starts enrolling a contact into this workflow?</p>

                        <div className="grid grid-cols-3 gap-2">
                            {(['manual', 'keyword', 'list_add'] as const).map(t => (
                                <button
                                    key={t}
                                    onClick={() => patch({ trigger: t })}
                                    className={`p-3 rounded-xl border-2 text-left transition ${
                                        wf.trigger === t ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-violet-300'
                                    }`}
                                >
                                    <p className="text-xs font-black text-slate-900 dark:text-white mb-0.5">
                                        {t === 'manual' ? '✍️ Manual' : t === 'keyword' ? '💬 Keyword' : '📝 List Add'}
                                    </p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{triggerLabel[t]}</p>
                                </button>
                            ))}
                        </div>

                        {/* Keyword picker */}
                        {wf.trigger === 'keyword' && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Trigger Keyword</label>
                                {keywords.length === 0 ? (
                                    <p className="text-xs text-amber-600 dark:text-amber-400">No keywords found. Create a keyword first in the Keywords tab.</p>
                                ) : (
                                    <select
                                        value={wf.triggerKeywordId || ''}
                                        onChange={e => {
                                            const kw = keywords.find(k => k.id === e.target.value);
                                            patch({ triggerKeywordId: e.target.value || null, triggerKeywordWord: kw?.keyword || null });
                                        }}
                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                    >
                                        <option value="">— Select a keyword —</option>
                                        {keywords.filter(k => k.isActive).map(k => (
                                            <option key={k.id} value={k.id}>{k.keyword}</option>
                                        ))}
                                    </select>
                                )}
                                <p className="text-[10px] text-slate-400 mt-1">When someone texts this keyword, they're immediately enrolled and Step 1 runs.</p>
                            </div>
                        )}

                        {/* List Add picker */}
                        {wf.trigger === 'list_add' && (
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">PCO List</label>
                                <select
                                    value={wf.triggerListId || ''}
                                    onChange={e => {
                                        const l = pcoLists.find(x => x.id === e.target.value);
                                        patch({ triggerListId: e.target.value || null, triggerListName: l?.name || null });
                                    }}
                                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                >
                                    <option value="">— Select a list —</option>
                                    {pcoLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                                <p className="text-[10px] text-slate-400 mt-1">Contacts are enrolled whenever the scheduler detects them added to this list.</p>
                            </div>
                        )}

                        {wf.trigger === 'manual' && (
                            <div className="flex items-start gap-2 p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-xs text-blue-700 dark:text-blue-300">
                                <Users size={13} className="mt-0.5 shrink-0" />
                                <span>Staff can enroll any contact by phone number from the workflow's detail page after saving.</span>
                            </div>
                        )}
                    </div>

                    {/* Steps */}
                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Steps ({wf.steps.length})</p>
                            <button
                                onClick={addStep}
                                className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition"
                            >
                                <Plus size={12} /> Add Step
                            </button>
                        </div>

                        {/* Timeline connector */}
                        <div className="relative">
                            {wf.steps.map((step, idx) => (
                                <div key={step.id} className="relative">
                                    {/* Connector line between steps */}
                                    {idx > 0 && (
                                        <div className="flex items-center gap-3 mb-2 ml-3">
                                            <div className="w-0.5 h-6 bg-violet-200 dark:bg-violet-800 ml-2.5" />
                                            <span className="text-[10px] text-slate-400 font-semibold">
                                                {step.delayDays === 0 ? 'immediately after' : `wait ${step.delayDays} day${step.delayDays !== 1 ? 's' : ''}`}
                                            </span>
                                        </div>
                                    )}
                                    <StepRow
                                        step={step}
                                        index={idx}
                                        total={wf.steps.length}
                                        onChange={p => updateStep(idx, p)}
                                        onDelete={() => deleteStep(idx)}
                                        onMoveUp={() => moveStep(idx, 'up')}
                                        onMoveDown={() => moveStep(idx, 'down')}
                                    />
                                </div>
                            ))}
                        </div>

                        {wf.steps.length === 0 && (
                            <div className="text-center py-10 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-slate-400">
                                <Zap size={28} className="mx-auto mb-2 opacity-30" />
                                <p className="text-sm">No steps yet. Add your first message step.</p>
                            </div>
                        )}

                        <button onClick={addStep} className="w-full py-2.5 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-sm font-bold text-slate-400 hover:border-violet-400 hover:text-violet-500 transition flex items-center justify-center gap-2">
                            <Plus size={14} /> Add Another Step
                        </button>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                            <AlertTriangle size={14} /> {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Enrollment Pane ─────────────────────────────────────────────────────────

const EnrollmentPane: React.FC<{
    workflow: SmsWorkflow;
    churchId: string;
    onClose: () => void;
}> = ({ workflow, churchId, onClose }) => {
    const [enrollments, setEnrollments] = useState<SmsWorkflowEnrollment[]>([]);
    const [isLoading, setIsLoading]     = useState(true);
    const [phone, setPhone]             = useState('');
    const [name, setName]               = useState('');
    const [enrolling, setEnrolling]     = useState(false);
    const [errMsg, setErrMsg]           = useState('');

    useEffect(() => {
        const q = query(
            collection(firebaseDb, 'smsWorkflowEnrollments'),
            where('workflowId', '==', workflow.id),
            orderBy('enrolledAt', 'desc'),
            limit(50)
        );
        const unsub = onSnapshot(q, snap => {
            setEnrollments(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsWorkflowEnrollment)));
            setIsLoading(false);
        });
        return unsub;
    }, [workflow.id]);

    const handleEnroll = async () => {
        const digits = phone.replace(/\D/g, '');
        const e164   = digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : '';
        if (!e164) { setErrMsg('Enter a valid US phone number.'); return; }
        setErrMsg('');
        setEnrolling(true);
        try {
            const enrollId = `${workflow.id}_${e164.replace(/\+/g, '')}`;
            const enrollment: SmsWorkflowEnrollment = {
                id:           enrollId,
                churchId,
                workflowId:   workflow.id,
                phoneNumber:  e164,
                personName:   name.trim() || null,
                personId:     null,
                currentStep:  0,
                nextSendAt:   Date.now(),   // scheduler picks it up immediately
                completed:    false,
                enrolledAt:   Date.now(),
                lastStepSentAt: null,
            };
            await setDoc(doc(firebaseDb, 'smsWorkflowEnrollments', enrollId), enrollment, { merge: false });
            // Increment enrolledCount on the workflow
            await updateDoc(doc(firebaseDb, 'smsWorkflows', workflow.id), { enrolledCount: (workflow.enrolledCount || 0) + 1 });
            setPhone('');
            setName('');
        } catch (e: any) {
            setErrMsg('Enrollment failed: ' + e.message);
        } finally {
            setEnrolling(false);
        }
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md mx-4 max-h-[80vh] flex flex-col" onClick={e => e.stopPropagation()}>
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
                    <div>
                        <h3 className="text-base font-black text-slate-900 dark:text-white">Enroll Contact</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{workflow.name}</p>
                    </div>
                    <button onClick={onClose} className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"><X size={16} /></button>
                </div>

                {/* Enroll form */}
                <div className="p-5 space-y-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Phone Number</label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder="(615) 555-0100"
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Name <span className="font-normal opacity-60">(optional)</span></label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Jane Smith"
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                    </div>
                    {errMsg && <p className="text-xs text-red-500">{errMsg}</p>}
                    <button
                        onClick={handleEnroll}
                        disabled={!phone.trim() || enrolling}
                        className="w-full py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition flex items-center justify-center gap-2"
                    >
                        {enrolling ? <><Loader2 size={13} className="animate-spin" />Enrolling…</> : <><Plus size={13} />Enroll in Workflow</>}
                    </button>
                </div>

                {/* Enrollment list */}
                <div className="flex-1 overflow-y-auto">
                    {isLoading ? (
                        <div className="flex justify-center py-8 text-slate-400"><Loader2 size={18} className="animate-spin" /></div>
                    ) : enrollments.length === 0 ? (
                        <div className="text-center py-10 text-slate-400 text-xs">No enrollments yet</div>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-700">
                            {enrollments.map(en => (
                                <div key={en.id} className="px-5 py-3 flex items-center justify-between">
                                    <div>
                                        <p className="text-sm font-bold text-slate-900 dark:text-white">{en.personName || formatPhone(en.phoneNumber)}</p>
                                        {en.personName && <p className="text-[10px] text-slate-400">{formatPhone(en.phoneNumber)}</p>}
                                        <p className="text-[10px] text-slate-500 mt-0.5">
                                            Step {en.currentStep + 1} of {workflow.steps.length} · enrolled {timeAgo(en.enrolledAt)}
                                        </p>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${
                                        en.completed ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300'
                                    }`}>{en.completed ? 'Done' : 'Active'}</span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Workflows List + Manager ─────────────────────────────────────────────────

const SmsWorkflowsManager: React.FC<{ churchId: string }> = ({ churchId }) => {
    const [workflows, setWorkflows] = useState<SmsWorkflow[]>([]);
    const [keywords, setKeywords]   = useState<SmsKeyword[]>([]);
    const [pcoLists, setPcoLists]   = useState<{ id: string; name: string }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editing, setEditing]     = useState<SmsWorkflow | null | 'new'>('new' as any);
    const [viewMode, setViewMode]   = useState<'list' | 'editor'>('list');
    const [isBusy, setIsBusy]       = useState(false);
    const [enrollTarget, setEnrollTarget] = useState<SmsWorkflow | null>(null);

    // Live listener
    useEffect(() => {
        const q = query(
            collection(firebaseDb, 'smsWorkflows'),
            where('churchId', '==', churchId),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, snap => {
            setWorkflows(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsWorkflow)));
            setIsLoading(false);
        });
        return unsub;
    }, [churchId]);

    // Load keywords and PCO lists for the editor
    useEffect(() => {
        getDocs(query(collection(firebaseDb, 'smsKeywords'), where('churchId', '==', churchId)))
            .then(snap => setKeywords(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsKeyword))));
        pcoService.getPeopleLists(churchId)
            .then((raw: any[]) => setPcoLists(raw.map(r => ({ id: r.id, name: r.attributes?.name || 'Unnamed' }))))
            .catch(() => {});
    }, [churchId]);

    const handleSave = async (wf: SmsWorkflow) => {
        setIsBusy(true);
        try {
            const isNew = editing === 'new' as any;
            if (isNew) {
                const { id: _id, ...rest } = wf;
                const ref = await addDoc(collection(firebaseDb, 'smsWorkflows'), rest);
                // nothing else needed; listener picks it up
            } else {
                await setDoc(doc(firebaseDb, 'smsWorkflows', wf.id), wf, { merge: true });
            }
            setViewMode('list');
        } finally {
            setIsBusy(false);
        }
    };

    const handleToggleActive = async (wf: SmsWorkflow) => {
        await updateDoc(doc(firebaseDb, 'smsWorkflows', wf.id), { isActive: !wf.isActive });
    };

    const handleDelete = async (wf: SmsWorkflow) => {
        if (!window.confirm(`Delete workflow "${wf.name}"?`)) return;
        await deleteDoc(doc(firebaseDb, 'smsWorkflows', wf.id));
    };

    const openNew = () => { setEditing('new' as any); setViewMode('editor'); };
    const openEdit = (wf: SmsWorkflow) => { setEditing(wf); setViewMode('editor'); };

    const TRIGGER_BADGE: Record<string, { label: string; color: string; icon: string }> = {
        manual:   { label: 'Manual',   color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',  icon: '✍️' },
        keyword:  { label: 'Keyword',  color: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300', icon: '💬' },
        list_add: { label: 'List Add', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',   icon: '📝' },
    };

    // Show editor view
    if (viewMode === 'editor') {
        return (
            <div className="h-full">
                <WorkflowEditor
                    initial={editing !== 'new' as any ? editing as SmsWorkflow : null}
                    churchId={churchId}
                    keywords={keywords}
                    pcoLists={pcoLists}
                    onSave={handleSave}
                    onBack={() => setViewMode('list')}
                    isBusy={isBusy}
                />
            </div>
        );
    }

    // List view
    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-3">
                        <Zap size={26} className="text-violet-500" /> Workflows
                    </h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Automated drip sequences — the right message at the right time.
                    </p>
                </div>
                <button onClick={openNew} className="flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition shadow-md shadow-violet-200 dark:shadow-violet-900/40">
                    <Plus size={16} /> New Workflow
                </button>
            </div>

            {/* Explainer */}
            <div className="flex items-start gap-4 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800 rounded-2xl p-4 mb-6">
                <div className="text-3xl">⚡</div>
                <div>
                    <p className="text-sm font-bold text-violet-800 dark:text-violet-200 mb-1">How Workflows Work</p>
                    <p className="text-xs text-violet-700 dark:text-violet-300 leading-relaxed">
                        Build a multi-step message sequence with custom delays between each step. Triggered automatically by a keyword text, a PCO List add, or manually by staff. Once enrolled, contacts move through each step on schedule — and stop automatically if they reply STOP.
                    </p>
                </div>
            </div>

            {/* Workflow cards */}
            {isLoading ? (
                <div className="flex items-center justify-center h-40 text-slate-400"><Loader2 size={20} className="animate-spin mr-2" />Loading workflows…</div>
            ) : workflows.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                    <Zap size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-slate-600 dark:text-slate-400 font-semibold">No workflows yet</p>
                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 mb-4">Build your first automated text sequence.</p>
                    <button onClick={openNew} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition">
                        <span className="flex items-center gap-1.5"><Plus size={14} />New Workflow</span>
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {workflows.map(wf => {
                        const tb  = TRIGGER_BADGE[wf.trigger] || TRIGGER_BADGE.manual;
                        return (
                            <div key={wf.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 hover:border-violet-200 dark:hover:border-violet-700 transition group">
                                <div className="flex items-start justify-between gap-4">
                                    {/* Left: info */}
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-xl bg-violet-50 dark:bg-violet-900/30 flex items-center justify-center shrink-0 text-lg">
                                            {tb.icon}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className="font-bold text-slate-900 dark:text-white truncate">{wf.name}</p>
                                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${tb.color}`}>{tb.label}</span>
                                                {!wf.isActive && <span className="text-[10px] font-bold bg-slate-100 dark:bg-slate-700 text-slate-500 px-2 py-0.5 rounded-full">Paused</span>}
                                            </div>
                                            {wf.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">{wf.description}</p>}
                                            <div className="flex items-center gap-4 mt-1.5">
                                                <span className="text-xs text-slate-500 dark:text-slate-400">
                                                    {wf.steps.length} step{wf.steps.length !== 1 ? 's' : ''}
                                                </span>
                                                {wf.trigger === 'keyword' && wf.triggerKeywordWord && (
                                                    <span className="text-[10px] font-mono font-bold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 px-1.5 py-0.5 rounded">{wf.triggerKeywordWord}</span>
                                                )}
                                                {wf.trigger === 'list_add' && wf.triggerListName && (
                                                    <span className="text-[10px] text-blue-600 dark:text-blue-400">{wf.triggerListName}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: stats + actions */}
                                    <div className="flex items-center gap-3 shrink-0">
                                        {/* Enrolled / completed */}
                                        <div className="text-right hidden sm:block">
                                            <p className="text-lg font-black text-violet-600 dark:text-violet-300">{wf.enrolledCount}</p>
                                            <p className="text-[10px] text-slate-400 uppercase tracking-widest">enrolled</p>
                                        </div>
                                        <div className="text-right hidden sm:block">
                                            <p className="text-lg font-black text-emerald-600">{wf.completedCount}</p>
                                            <p className="text-[10px] text-slate-400 uppercase tracking-widest">done</p>
                                        </div>

                                        {/* Active toggle */}
                                        <button
                                            onClick={() => handleToggleActive(wf)}
                                            title={wf.isActive ? 'Pause' : 'Activate'}
                                            className={`relative w-11 h-6 rounded-full transition-colors ${wf.isActive ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                                        >
                                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${wf.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>

                                        {/* Actions on hover */}
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                            {wf.trigger === 'manual' && (
                                                <button onClick={() => setEnrollTarget(wf)} className="p-1.5 text-slate-400 hover:text-violet-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition" title="Enroll contact">
                                                    <Users size={14} />
                                                </button>
                                            )}
                                            <button onClick={() => openEdit(wf)} className="p-1.5 text-slate-400 hover:text-violet-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition" title="Edit">
                                                <Pencil size={14} />
                                            </button>
                                            <button onClick={() => handleDelete(wf)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition" title="Delete">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {/* Step timeline preview */}
                                {wf.steps.length > 0 && (
                                    <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
                                        {wf.steps.map((step, i) => (
                                            <React.Fragment key={step.id}>
                                                {i > 0 && (
                                                    <div className="flex items-center gap-1 shrink-0">
                                                        <div className="h-px w-4 bg-violet-200 dark:bg-violet-800" />
                                                        <span className="text-[9px] text-slate-400 whitespace-nowrap">
                                                            {step.delayDays === 0 ? 'same day' : `+${step.delayDays}d`}
                                                        </span>
                                                        <div className="h-px w-4 bg-violet-200 dark:bg-violet-800" />
                                                    </div>
                                                )}
                                                <div className="w-6 h-6 rounded-full bg-violet-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">{i + 1}</div>
                                            </React.Fragment>
                                        ))}
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Enrollment pane modal */}
            {enrollTarget && (
                <EnrollmentPane
                    workflow={enrollTarget}
                    churchId={churchId}
                    onClose={() => setEnrollTarget(null)}
                />
            )}
        </div>
    );
};

// ─── SMS Setup Banner ────────────────────────────────────────────────────────

const SmsSetupBanner: React.FC<{ onSetup: () => void }> = ({ onSetup }) => (
    <div className="p-6 max-w-2xl mx-auto mt-12">
        <div className="bg-gradient-to-br from-violet-600 to-purple-700 rounded-3xl p-8 text-white text-center shadow-2xl shadow-violet-200 dark:shadow-violet-900/40">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Phone size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-black mb-2">Set Up SMS Messaging</h2>
            <p className="text-violet-100 text-sm mb-6 leading-relaxed">
                Get a dedicated local phone number for your church. Send bulk text campaigns to your Planning Center lists and groups, and manage a full 2-way inbox.
            </p>
            <div className="grid grid-cols-3 gap-4 mb-8 text-center">
                {[
                    { icon: '📱', title: 'Local Number', desc: 'Pick an area code' },
                    { icon: '📣', title: 'Bulk Texts', desc: 'Reach entire lists' },
                    { icon: '💬', title: '2-Way Inbox', desc: 'Real conversations' },
                ].map(f => (
                    <div key={f.title} className="bg-white/10 rounded-2xl p-3">
                        <div className="text-2xl mb-1">{f.icon}</div>
                        <p className="font-bold text-sm">{f.title}</p>
                        <p className="text-violet-200 text-xs">{f.desc}</p>
                    </div>
                ))}
            </div>
            <button
                onClick={onSetup}
                className="px-8 py-3 bg-white text-violet-700 font-black rounded-2xl hover:bg-violet-50 transition text-sm shadow-lg"
            >
                Get Started →
            </button>
        </div>
    </div>
);

// ─── Setup Wizard (Inline) ────────────────────────────────────────────────────

const SmsSetupWizard: React.FC<{
    churchId: string;
    church: Church;
    onComplete: () => void;
    onBack: () => void;
}> = ({ churchId, church, onComplete, onBack }) => {
    const [step, setStep]             = useState<'area-code' | 'pick-number' | 'done'>('area-code');
    const [areaCode, setAreaCode]     = useState(church.zip?.slice(0, 3) || '');
    const [numbers, setNumbers]       = useState<{ phoneNumber: string; friendlyName: string; locality: string; region: string }[]>([]);
    const [loadingNums, setLoadingNums] = useState(false);
    const [selectedNumber, setSelectedNumber] = useState('');
    const [senderName, setSenderName] = useState(church.name || '');
    const [provisioning, setProvisioning]     = useState(false);
    const [error, setError]           = useState('');

    const fetchNumbers = async () => {
        if (!areaCode || areaCode.length < 3) { setError('Please enter a 3-digit area code.'); return; }
        setError('');
        setLoadingNums(true);
        try {
            const res = await fetch(`${API_BASE}/api/messaging/available-numbers?churchId=${churchId}&areaCode=${areaCode}`);
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Failed to fetch numbers');
            setNumbers(data.numbers || []);
            setStep('pick-number');
        } catch (e: any) {
            setError(e.message || 'Failed to fetch numbers');
        } finally {
            setLoadingNums(false);
        }
    };

    const provision = async () => {
        if (!selectedNumber) { setError('Please select a number.'); return; }
        setError('');
        setProvisioning(true);
        try {
            const res = await fetch(`${API_BASE}/api/messaging/provision`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ churchId, phoneNumber: selectedNumber, senderName }),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Provisioning failed');
            setStep('done');
        } catch (e: any) {
            setError(e.message || 'Provisioning failed');
        } finally {
            setProvisioning(false);
        }
    };

    return (
        <div className="p-6 max-w-xl mx-auto mt-8">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6">
                <ArrowLeft size={14} /> Back
            </button>

            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
                {step === 'area-code' && (
                    <>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white mb-1">Choose Your Area Code</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">We'll find available local numbers in that area.</p>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Area Code (3 digits)</label>
                        <input
                            type="text"
                            maxLength={3}
                            value={areaCode}
                            onChange={e => setAreaCode(e.target.value.replace(/\D/g, ''))}
                            placeholder="e.g. 615"
                            className="w-full text-2xl font-black border-2 border-slate-200 dark:border-slate-600 rounded-2xl px-5 py-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-violet-500 mb-2 tracking-widest"
                        />
                        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
                        <button
                            onClick={fetchNumbers}
                            disabled={loadingNums || areaCode.length < 3}
                            className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-black rounded-2xl transition mt-4 flex items-center justify-center gap-2"
                        >
                            {loadingNums ? <><Loader2 size={16} className="animate-spin" /> Searching…</> : 'Find Available Numbers →'}
                        </button>
                    </>
                )}

                {step === 'pick-number' && (
                    <>
                        {/* Header + location context */}
                        <h2 className="text-xl font-black text-slate-900 dark:text-white mb-1">Pick a Number</h2>
                        {numbers.length > 0 && (() => {
                            const sample = numbers[0];
                            const loc = [sample.locality, sample.region].filter(Boolean).join(', ');
                            return (
                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">
                                    Showing <span className="font-semibold text-slate-700 dark:text-slate-200">{numbers.length} local number{numbers.length !== 1 ? 's' : ''}</span>
                                    {loc ? <> in <span className="font-semibold text-violet-600 dark:text-violet-400">{loc}</span></> : <> for area code <span className="font-semibold text-violet-600 dark:text-violet-400">{areaCode}</span></>}
                                    . Select the one that will be your church's SMS identity.
                                </p>
                            );
                        })()}
                        {numbers.length === 0 && (
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">Select the number that will be your church's SMS identity.</p>
                        )}

                        <div className="space-y-2 mb-5">
                            {numbers.length === 0 ? (
                                <p className="text-sm text-slate-500 text-center py-8">No numbers found for area code {areaCode}. Try a different code.</p>
                            ) : numbers.map(n => {
                                const cityState = [n.locality, n.region].filter(Boolean).join(', ');
                                return (
                                <label
                                    key={n.phoneNumber}
                                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition ${selectedNumber === n.phoneNumber ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-600'}`}
                                >
                                    <input type="radio" name="number" value={n.phoneNumber} checked={selectedNumber === n.phoneNumber} onChange={() => setSelectedNumber(n.phoneNumber)} className="accent-violet-600 mt-0.5 shrink-0" />
                                    <div className="flex-1 min-w-0">
                                        <p className="font-black text-lg text-slate-900 dark:text-white tracking-wide">{n.friendlyName}</p>
                                        {cityState ? (
                                            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold">
                                                📍 {cityState}
                                            </span>
                                        ) : (
                                            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs">
                                                📍 Area code {areaCode}
                                            </span>
                                        )}
                                    </div>
                                    {selectedNumber === n.phoneNumber && (
                                        <CheckCircle size={18} className="text-violet-600 shrink-0" />
                                    )}
                                </label>
                                );
                            })}
                        </div>

                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Sender Name (shown in message headers)</label>
                        <input
                            type="text"
                            value={senderName}
                            onChange={e => setSenderName(e.target.value)}
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 mb-4"
                            placeholder="Grace Community Church"
                        />

                        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

                        <div className="flex gap-2">
                            <button onClick={() => setStep('area-code')} className="flex-1 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 transition">← Back</button>
                            <button
                                onClick={provision}
                                disabled={provisioning || !selectedNumber}
                                className="flex-1 py-2.5 text-sm font-black bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl transition flex items-center justify-center gap-2"
                            >
                                {provisioning ? <><Loader2 size={14} className="animate-spin" />Provisioning…</> : 'Claim Number →'}
                            </button>
                        </div>
                    </>
                )}

                {step === 'done' && (
                    <div className="text-center py-4">
                        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle size={32} className="text-emerald-600" />
                        </div>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white mb-2">You're All Set! 🎉</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                            Your church phone number has been provisioned. You can now send text campaigns and receive replies in your inbox.
                        </p>
                        <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-6 text-left">
                            <strong>Next step:</strong> For high-volume sending (more than 200 msgs/day), complete A2P 10DLC brand registration in your Twilio Console to avoid carrier filtering.
                        </div>
                        <button onClick={onComplete} className="px-8 py-3 bg-violet-600 hover:bg-violet-700 text-white font-black rounded-2xl transition">
                            Start Messaging →
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
};

// ─── Main MessagingModule ─────────────────────────────────────────────────────

interface MessagingModuleProps {
    churchId:    string;
    church:      Church;
    currentUser: User;
    onUpdateChurch?: (updates: Partial<Church>) => void;
}

const MessagingModule: React.FC<MessagingModuleProps> = ({ churchId, church, currentUser, onUpdateChurch }) => {
    const smsEnabled = church.smsSettings?.smsEnabled;

    type Tab = 'campaigns' | 'inbox' | 'keywords' | 'analytics' | 'workflows';
    const [activeTab, setActiveTab]   = useState<Tab>('campaigns');
    const [campaigns, setCampaigns]   = useState<SmsCampaign[]>([]);
    const [isLoading, setIsLoading]   = useState(true);
    const [activeCampaign, setActiveCampaign] = useState<SmsCampaign | null>(null);
    const [toast, setToast]           = useState<{ msg: string; type: 'success' | 'error' } | null>(null);
    const [isSending, setIsSending]   = useState(false);
    const [showSetup, setShowSetup]   = useState(false);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 4000);
    };

    // Hook into the Firestore campaigns collection with a live listener
    useEffect(() => {
        if (!smsEnabled) { setIsLoading(false); return; }
        const q = query(
            collection(firebaseDb, 'smsCampaigns'),
            where('churchId', '==', churchId),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, snap => {
            setCampaigns(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsCampaign)));
            setIsLoading(false);
        });
        return unsub;
    }, [churchId, smsEnabled]);

    const handleCreate = async () => {
        const name = `Text Campaign ${new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`;
        const now  = Date.now();
        const data: Omit<SmsCampaign, 'id'> = {
            churchId, name, status: 'draft', body: '',
            toListId: null, toGroupId: null,
            createdAt: now, updatedAt: now,
        };
        const ref = await addDoc(collection(firebaseDb, 'smsCampaigns'), data);
        setActiveCampaign({ id: ref.id, ...data });
    };

    const handleSave = async (updates: Partial<SmsCampaign>) => {
        if (!activeCampaign) return;
        const patch = { ...updates, updatedAt: Date.now() };
        await updateDoc(doc(firebaseDb, 'smsCampaigns', activeCampaign.id), patch);
        setActiveCampaign(prev => prev ? { ...prev, ...patch } : null);
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Delete this campaign?')) return;
        await deleteDoc(doc(firebaseDb, 'smsCampaigns', id));
        if (activeCampaign?.id === id) setActiveCampaign(null);
        showToast('Campaign deleted');
    };

    const handleDuplicate = async (c: SmsCampaign) => {
        const now  = Date.now();
        const data = { ...c, name: `Copy of ${c.name}`, status: 'draft' as const, sentAt: null, scheduledAt: null, createdAt: now, updatedAt: now };
        delete (data as any).id;
        await addDoc(collection(firebaseDb, 'smsCampaigns'), data);
        showToast('Campaign duplicated');
    };

    const handleSendNow = async () => {
        if (!activeCampaign) return;
        setIsSending(true);
        try {
            const res = await fetch(`${API_BASE}/api/messaging/send-bulk`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    churchId,
                    campaignId:  activeCampaign.id,
                    phones:      [],          // Scheduler / backend resolves from listId/groupId
                    body:        activeCampaign.body,
                    mediaUrls:   activeCampaign.mediaUrls || [],
                    sentBy:      currentUser.id,
                    sentByName:  currentUser.name,
                    // Signal the backend to resolve phones itself via PCO:
                    resolveFromList:  activeCampaign.toListId  || null,
                    resolveFromGroup: activeCampaign.toGroupId || null,
                }),
            });
            const data = await res.json();
            if (!data.success && data.error && !data.sent) throw new Error(data.error);
            showToast(`Sent to ${data.sent} recipients (${data.failed} failed)`);
            setActiveCampaign(null);
        } catch (e: any) {
            showToast(e.message || 'Send failed', 'error');
        } finally {
            setIsSending(false);
        }
    };

    const handleSchedule = async (scheduledAt: number, recurringFrequency?: 'daily' | 'weekly' | 'monthly') => {
        if (!activeCampaign) return;
        await updateDoc(doc(firebaseDb, 'smsCampaigns', activeCampaign.id), {
            status: 'scheduled',
            scheduledAt,
            sendAt: new Date(scheduledAt).toISOString(),
            recurringFrequency: recurringFrequency ?? null,
            updatedAt: Date.now(),
        });
        showToast('Campaign scheduled ✓');
        setActiveCampaign(null);
    };

    // ── Not yet set up ──
    if (!smsEnabled && !showSetup) {
        return <SmsSetupBanner onSetup={() => setShowSetup(true)} />;
    }

    if (showSetup) {
        return (
            <SmsSetupWizard
                churchId={churchId}
                church={church}
                onBack={() => setShowSetup(false)}
                onComplete={() => {
                    setShowSetup(false);
                    if (onUpdateChurch) onUpdateChurch({ smsSettings: { ...church.smsSettings, smsEnabled: true } });
                }}
            />
        );
    }

    return (
        <div className="flex flex-col h-full">
            {/* Toast */}
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            {/* Top section: tabs + phone number badge */}
            {!activeCampaign && (
                <div className="flex items-center justify-between px-6 pt-2 shrink-0">
                    <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                        {([
                            { key: 'campaigns', label: 'Campaigns', icon: <MessageSquare size={13} /> },
                            { key: 'inbox',     label: 'Inbox',     icon: <Inbox size={13} /> },
                            { key: 'keywords',  label: 'Keywords',  icon: <Key size={13} /> },
                            { key: 'workflows', label: 'Workflows', icon: <Zap size={13} /> },
                            { key: 'analytics', label: 'Analytics', icon: <BarChart3 size={13} /> },
                        ] as const).map(t => (
                            <button
                                key={t.key}
                                onClick={() => setActiveTab(t.key)}
                                className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition ${activeTab === t.key ? 'bg-white dark:bg-slate-700 text-violet-600 dark:text-violet-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'}`}
                            >
                                {t.icon} {t.label}
                            </button>
                        ))}
                    </div>
                    {church.smsSettings?.twilioPhoneNumber && (
                        <div className="flex items-center gap-2 text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-full px-3 py-1.5">
                            <Phone size={12} />
                            {formatPhone(church.smsSettings.twilioPhoneNumber)}
                            <span className="text-[10px] opacity-70">· SMS Active</span>
                        </div>
                    )}
                </div>
            )}

            <div className="flex-1 overflow-hidden">
                {/* Campaigns tab */}
                {activeTab === 'campaigns' && !activeCampaign && (
                    <div className="h-full overflow-y-auto">
                        <CampaignList
                            campaigns={campaigns}
                            isLoading={isLoading}
                            onOpen={c => setActiveCampaign(c)}
                            onDelete={handleDelete}
                            onDuplicate={handleDuplicate}
                            onCreate={handleCreate}
                        />
                    </div>
                )}

                {activeTab === 'campaigns' && activeCampaign && (
                    <div className="h-full">
                        <CampaignComposer
                            campaign={activeCampaign}
                            churchId={churchId}
                            apiBase={API_BASE}
                            onBack={() => setActiveCampaign(null)}
                            onSave={handleSave}
                            onSend={handleSendNow}
                            onSchedule={handleSchedule}
                            isSending={isSending}
                        />
                    </div>
                )}

                {/* Inbox tab */}
                {activeTab === 'inbox' && (
                    <div className="h-full">
                        <SmsInbox churchId={churchId} currentUser={currentUser} church={church} />
                    </div>
                )}

                {/* Keywords tab */}
                {activeTab === 'keywords' && (
                    <div className="h-full overflow-y-auto">
                        <SmsKeywordsManager churchId={churchId} />
                    </div>
                )}

                {/* Workflows tab */}
                {activeTab === 'workflows' && (
                    <div className="h-full">
                        <SmsWorkflowsManager churchId={churchId} />
                    </div>
                )}

                {/* Analytics tab */}
                {activeTab === 'analytics' && (
                    <div className="h-full overflow-y-auto">
                        <SmsAnalytics churchId={churchId} campaigns={campaigns} />
                    </div>
                )}
            </div>
        </div>
    );
};

export default MessagingModule;
