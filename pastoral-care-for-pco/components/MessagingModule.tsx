import React, { useState, useEffect, useCallback, useRef } from 'react';
import { db as firebaseDb } from '../services/firebase';
import {
    collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
    query, where, orderBy, limit, getDocs, getDoc, setDoc,
    Timestamp, collectionGroup
} from 'firebase/firestore';
import { pcoService } from '../services/pcoService';
import { SmsCampaign, SmsConversation, SmsMessage, SmsKeyword, SmsOptOut, SmsWorkflow, SmsWorkflowStep, SmsWorkflowEnrollment, SmsTag, Church, User, WorkflowChannelType } from '../types';
import {
    MessageSquare, Send, Clock, Users, Plus, ArrowLeft, Trash2,
    Eye, Pencil, ChevronDown, CheckCircle, Circle, Loader2, X,
    Calendar, Phone, Search, RefreshCw, Settings, Key, AlertTriangle,
    Inbox, BarChart3, Copy, Zap, MessageCircle, TrendingUp, TrendingDown,
    Activity, DollarSign, UserX, Edit3, UserCheck, List, Layers,
    Smile, Image as ImageIcon, Link, Sparkles, ChevronRight, RotateCcw,
    Mail, Tag, Filter, Hash
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

const ALL_MERGE_TAGS: { tag: string; label: string }[] = [
    { tag: '{firstName}',   label: 'First Name'   },
    { tag: '{lastName}',    label: 'Last Name'    },
    { tag: '{fullName}',    label: 'Full Name'    },
    { tag: '{email}',       label: 'Email'        },
    { tag: '{phone}',       label: 'Phone'        },
    { tag: '{city}',        label: 'City'         },
    { tag: '{state}',       label: 'State'        },
    { tag: '{birthday}',    label: 'Birthday'     },
    { tag: '{anniversary}', label: 'Anniversary'  },
];

const COMMON_EMOJIS = [
    '😊','🙏','❤️','✝️','🎉','👋','📖','⭐','🔥','💫',
    '🌟','🕊️','🏠','📅','📣','💬','🎵','🤝','💜','🌈',
];

// ─── Tag colour map ───────────────────────────────────────────────────────────

const TAG_COLOR_MAP: Record<SmsTag['color'], { bg: string; text: string; border: string; dot: string }> = {
    violet:  { bg: 'bg-violet-100 dark:bg-violet-900/40',  text: 'text-violet-700 dark:text-violet-300',  border: 'border-violet-300 dark:border-violet-700',  dot: 'bg-violet-500' },
    blue:    { bg: 'bg-blue-100 dark:bg-blue-900/40',       text: 'text-blue-700 dark:text-blue-300',       border: 'border-blue-300 dark:border-blue-700',       dot: 'bg-blue-500' },
    emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-700', dot: 'bg-emerald-500' },
    amber:   { bg: 'bg-amber-100 dark:bg-amber-900/40',     text: 'text-amber-700 dark:text-amber-300',     border: 'border-amber-300 dark:border-amber-700',     dot: 'bg-amber-500' },
    red:     { bg: 'bg-red-100 dark:bg-red-900/40',         text: 'text-red-700 dark:text-red-300',         border: 'border-red-300 dark:border-red-700',         dot: 'bg-red-500' },
    pink:    { bg: 'bg-pink-100 dark:bg-pink-900/40',       text: 'text-pink-700 dark:text-pink-300',       border: 'border-pink-300 dark:border-pink-700',       dot: 'bg-pink-500' },
};

const SmsTagChip: React.FC<{ tag: SmsTag; onRemove?: () => void; size?: 'sm' | 'xs' }> = ({ tag, onRemove, size = 'xs' }) => {
    const c = TAG_COLOR_MAP[tag.color] || TAG_COLOR_MAP.violet;
    const sizeClass = size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]';
    return (
        <span className={`inline-flex items-center gap-1 rounded-full border font-semibold ${sizeClass} ${c.bg} ${c.text} ${c.border}`}>
            {tag.emoji && <span>{tag.emoji}</span>}
            {tag.name}
            {onRemove && (
                <button
                    type="button"
                    onClick={e => { e.stopPropagation(); onRemove(); }}
                    title={`Remove ${tag.name} tag`}
                    className="ml-0.5 opacity-60 hover:opacity-100 transition"
                >
                    <X size={9} />
                </button>
            )}
        </span>
    );
};

// ─── Helpers ─────────────────────────────────────────────────────────────────


function countSegments(body: string): number {
    if (!body) return 0;
    if (body.length <= 160) return 1;
    return Math.ceil(body.length / 153);
}

/** Call the Gemini AI proxy to suggest a shorter SMS message. */
async function getSmsAiSuggestion(messageBody: string): Promise<string> {
    const res = await fetch('/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: 'gemini-2.5-flash',
            prompt: `You are an SMS copywriting expert for a church. 
Rewrite the following SMS message to be shorter (ideally under 160 characters — 1 SMS segment) while keeping the full meaning, warmth, and any merge tags like {firstName}, {email}, {phone}, {city}, {state}, {birthday}, {anniversary} exactly as-is.
Return ONLY the rewritten message text, no explanation or quotes.

Original message:
${messageBody}`,
        }),
    });
    if (!res.ok) throw new Error('AI request failed');
    const data = await res.json();
    return (data.text || '').trim();
}

/** Shape the AI returns for a generated workflow. */
interface AiWorkflowDraft {
    name: string;
    description: string;
    steps: {
        channelType: 'sms' | 'mms' | 'email';
        delayDays: number;
        message?: string;
        emailSubject?: string;
        emailBody?: string;
    }[];
}

/** Call the AI to build a full workflow from a natural-language prompt. */
async function generateWorkflowWithAi(prompt: string): Promise<AiWorkflowDraft> {
    const systemPrompt = `You are an expert church communications strategist helping a pastor build automated message workflows.
The user will describe the workflow they want in plain English.
You must respond with ONLY a valid JSON object (no markdown, no explanation) matching this exact schema:
{
  "name": string,          // Short, descriptive workflow name
  "description": string,   // 1-2 sentence description of what the workflow does
  "steps": [
    {
      "channelType": "sms" | "mms" | "email",
      "delayDays": number,     // Days to wait after the previous step. Step 0 is always 0.
      "message": string,       // Required for sms and mms steps. Keep SMS under 160 chars. Use {firstName} for personalisation.
      "emailSubject": string,  // Required only for email steps
      "emailBody": string      // Required only for email steps. Use {firstName} for personalisation.
    }
  ]
}

Guidelines:
- Use warm, pastoral, encouraging language appropriate for a church audience.
- For SMS steps, keep "message" under 160 characters when possible (1 segment).
- Include real content (actual Bible verses, actual prayer encouragements, etc.) — do NOT use placeholders like "[verse here]".
- Use {firstName} to personalise messages where natural.
- delayDays for the first step is always 0. For subsequent steps, use the delay the user specified or infer a sensible one (e.g. 1 day between daily texts).
- If the user asks for emails, set channelType to "email" and provide both emailSubject and emailBody.
- If the user asks for texts, set channelType to "sms".
- If the user asks for picture/image messages, set channelType to "mms" and still write a message caption.
- Infer the number of steps and channel mix from the user's description.

User's workflow request:
${prompt}`;

    const res = await fetch('/ai/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model: 'gemini-2.5-flash', prompt: systemPrompt }),
    });
    if (!res.ok) throw new Error('AI request failed');
    const data = await res.json();
    const raw = (data.text || '').trim();
    // Strip any accidental markdown code fences
    const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    try {
        return JSON.parse(cleaned) as AiWorkflowDraft;
    } catch {
        throw new Error('AI returned an unexpected format. Please try again.');
    }
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
        <button onClick={onClose} title="Close notification" className="ml-1 opacity-70 hover:opacity-100"><X size={14} /></button>
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
                    title="Send date and time"
                    placeholder="Select date and time"
                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 mb-4"
                />
                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Repeat</label>
                <select
                    value={frequency}
                    onChange={e => setFrequency(e.target.value as any)}
                    title="Repeat frequency"
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

    // Composer extras
    const [showEmojis, setShowEmojis]   = useState(false);
    const [showLinkDlg, setShowLinkDlg] = useState(false);
    const [linkUrl, setLinkUrl]         = useState('');
    const [imageUrl, setImageUrl]       = useState((local.mediaUrls && local.mediaUrls[0]) || '');
    const [aiSuggestion, setAiSuggestion]   = useState('');
    const [aiLoading, setAiLoading]         = useState(false);
    const [showAiPanel, setShowAiPanel]     = useState(false);
    const textareaRef = useRef<HTMLTextAreaElement>(null);

    const segments = countSegments(local.body || '');
    const canSend  = !!(local.body?.trim()) && !!(local.toListId || local.toGroupId);

    const update = useCallback((patch: Partial<SmsCampaign>) => {
        setLocal(prev => ({ ...prev, ...patch }));
        onSave(patch).then(() => setLastSaved(Date.now()));
    }, [onSave]);

    /** Insert text at cursor position in the textarea */
    const insertAtCursor = (text: string) => {
        const el = textareaRef.current;
        if (!el) { update({ body: (local.body || '') + text }); return; }
        const start = el.selectionStart ?? (local.body || '').length;
        const end   = el.selectionEnd   ?? start;
        const before = (local.body || '').slice(0, start);
        const after  = (local.body || '').slice(end);
        const newBody = before + text + after;
        update({ body: newBody });
        requestAnimationFrame(() => {
            el.focus();
            const pos = start + text.length;
            el.setSelectionRange(pos, pos);
        });
    };

    const handleAiSuggest = async () => {
        if (!local.body?.trim()) return;
        setAiLoading(true);
        setShowAiPanel(true);
        setAiSuggestion('');
        try {
            const suggestion = await getSmsAiSuggestion(local.body);
            setAiSuggestion(suggestion);
        } catch {
            setAiSuggestion('Unable to get AI suggestion. Please try again.');
        } finally {
            setAiLoading(false);
        }
    };

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
                    <button onClick={onBack} title="Back to campaigns" className="p-1.5 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
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
                                        title="Select a PCO list"
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
                                        title="Select a PCO group"
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
                                ref={textareaRef}
                                rows={8}
                                value={local.body || ''}
                                onChange={e => update({ body: e.target.value })}
                                placeholder="Type your message here…"
                                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none font-medium leading-relaxed"
                            />
                            {/* Composer toolbar */}
                            <div className="flex items-center gap-1 mt-2 flex-wrap">
                                {/* Emoji picker */}
                                <div className="relative">
                                    <button
                                        type="button"
                                        title="Insert emoji"
                                        onClick={() => { setShowEmojis(v => !v); setShowLinkDlg(false); }}
                                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
                                    >
                                        <Smile size={13} /> Emoji
                                    </button>
                                    {showEmojis && (
                                        <div className="absolute top-full left-0 mt-1 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 grid grid-cols-10 gap-1 min-w-[260px]">
                                            {COMMON_EMOJIS.map(em => (
                                                <button key={em} onClick={() => { insertAtCursor(em); setShowEmojis(false); }}
                                                    className="text-xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg p-1 transition leading-none"
                                                    title={em}>
                                                    {em}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                                {/* Link inserter */}
                                <div className="relative">
                                    <button
                                        type="button"
                                        title="Insert link"
                                        onClick={() => { setShowLinkDlg(v => !v); setShowEmojis(false); }}
                                        className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
                                    >
                                        <Link size={13} /> Link
                                    </button>
                                    {showLinkDlg && (
                                        <div className="absolute top-full left-0 mt-1 z-30 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 w-72">
                                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Insert Link URL</p>
                                            <div className="flex gap-2">
                                                <input
                                                    type="url"
                                                    value={linkUrl}
                                                    onChange={e => setLinkUrl(e.target.value)}
                                                    placeholder="https://example.com"
                                                    className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                                />
                                                <button
                                                    onClick={() => { if (linkUrl.trim()) { insertAtCursor(' ' + linkUrl.trim()); setLinkUrl(''); setShowLinkDlg(false); } }}
                                                    className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition"
                                                >Insert</button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                                {/* Image URL */}
                                <button
                                    type="button"
                                    title="Attach image (MMS)"
                                    onClick={() => {
                                        const url = window.prompt('Enter image URL (MMS — may incur additional carrier fees):');
                                        if (url) { setImageUrl(url); update({ mediaUrls: [url] }); }
                                    }}
                                    className={`flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border transition ${
                                        imageUrl ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                        : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
                                    }`}
                                >
                                    <ImageIcon size={13} /> {imageUrl ? 'Image ✓' : 'Image'}
                                </button>
                                {imageUrl && (
                                    <button
                                        type="button"
                                        title="Remove image"
                                        onClick={() => { setImageUrl(''); update({ mediaUrls: [] }); }}
                                        className="p-1.5 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"
                                    >
                                        <X size={13} />
                                    </button>
                                )}
                                <div className="flex-1" />
                                {/* AI Helper */}
                                <button
                                    type="button"
                                    title="AI SMS helper — suggest shorter message"
                                    onClick={handleAiSuggest}
                                    disabled={!local.body?.trim() || aiLoading}
                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/40 disabled:opacity-50 transition"
                                >
                                    {aiLoading ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
                                    AI Shorten
                                </button>
                            </div>
                            {/* Image preview */}
                            {imageUrl && (
                                <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 max-w-[200px]">
                                    <img src={imageUrl} alt="MMS attachment" className="w-full h-auto object-cover" onError={() => setImageUrl('')} />
                                </div>
                            )}
                            {/* AI suggestion panel */}
                            {showAiPanel && (
                                <div className="mt-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-2xl p-4">
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="text-[10px] font-black uppercase tracking-widest text-violet-500 flex items-center gap-1.5"><Sparkles size={11} /> AI Suggestion</span>
                                        <button onClick={() => setShowAiPanel(false)} title="Dismiss AI suggestion" className="text-violet-400 hover:text-violet-600"><X size={14} /></button>
                                    </div>
                                    {aiLoading ? (
                                        <div className="flex items-center gap-2 text-sm text-violet-500"><Loader2 size={14} className="animate-spin" /> Analyzing your message…</div>
                                    ) : (
                                        <>
                                            <p className="text-sm text-violet-800 dark:text-violet-200 leading-relaxed whitespace-pre-wrap mb-3">{aiSuggestion}</p>
                                            <div className="flex items-center gap-2">
                                                <span className={`text-xs font-bold ${ countSegments(aiSuggestion) > 1 ? 'text-amber-600' : 'text-emerald-600' }`}>
                                                    {aiSuggestion.length} chars · {countSegments(aiSuggestion)} seg
                                                </span>
                                                <div className="flex-1" />
                                                <button
                                                    onClick={() => { update({ body: aiSuggestion }); setShowAiPanel(false); }}
                                                    className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition"
                                                >
                                                    <ChevronRight size={12} /> Use This
                                                </button>
                                                <button
                                                    onClick={handleAiSuggest}
                                                    title="Regenerate AI suggestion"
                                                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-xs font-semibold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-xl hover:bg-violet-200 transition"
                                                >
                                                    <RotateCcw size={11} /> Retry
                                                </button>
                                            </div>
                                        </>
                                    )}
                                </div>
                            )}
                            <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">{SEGMENT_NOTE}</p>
                        </div>

                        {/* Merge tag quick-inserts */}
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Merge Tags</label>
                            <div className="flex flex-wrap gap-2">
                                {ALL_MERGE_TAGS.map(({ tag, label }) => (
                                    <button
                                        key={tag}
                                        title={`Insert ${label} merge tag`}
                                        onClick={() => insertAtCursor(tag)}
                                        className="px-3 py-1.5 text-xs font-mono font-semibold bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded-xl hover:bg-violet-100 dark:hover:bg-violet-900/40 border border-violet-200 dark:border-violet-800 transition"
                                    >
                                        {tag}
                                    </button>
                                ))}
                            </div>
                            <p className="text-[10px] text-slate-400 mt-1.5">
                                Tags will be replaced with each recipient's actual data at send time.
                            </p>
                        </div>

                        {/* Phone preview */}
                        <div>
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Preview</label>
                            <div className="bg-slate-100 dark:bg-slate-800 rounded-3xl p-4 max-w-[260px] shadow-inner">
                                {imageUrl && (
                                    <div className="mb-2 rounded-xl overflow-hidden max-w-[220px]">
                                        <img src={imageUrl} alt="MMS preview" className="w-full h-auto object-cover" />
                                    </div>
                                )}
                                <div className="bg-violet-600 text-white text-sm px-3 py-2 rounded-2xl rounded-bl-sm shadow-sm max-w-[220px] leading-relaxed whitespace-pre-wrap break-words font-medium">
                                    {(local.body || '')
                                        .replace('{firstName}', 'John').replace('{lastName}', 'Smith')
                                        .replace('{fullName}', 'John Smith').replace('{email}', 'john@example.com')
                                        .replace('{phone}', '(615) 555-0100').replace('{city}', 'Nashville')
                                        .replace('{state}', 'TN').replace('{birthday}', 'Jan 15')
                                        .replace('{anniversary}', 'Jun 10')
                                    || <span className="opacity-50 italic">Your message will appear here…</span>}
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

// ─── New Message Composer ────────────────────────────────────────────────────

type RecipientMode = 'individual' | 'list' | 'group';

const NewMessageComposer: React.FC<{
    churchId: string;
    currentUser: User;
    onClose: () => void;
    onSent: () => void;
}> = ({ churchId, currentUser, onClose, onSent }) => {
    const [mode, setMode]             = useState<RecipientMode>('individual');
    const [body, setBody]             = useState('');
    const [sending, setSending]       = useState(false);
    const [error, setError]           = useState('');
    const [sentCount, setSentCount]   = useState<number | null>(null);

    // Individual — PCO person search
    const [personSearch, setPersonSearch]     = useState('');
    const [personResults, setPersonResults]   = useState<{ id: string; name: string; phone?: string; avatar?: string | null; membership?: string | null }[]>([]);
    const [personLoading, setPersonLoading]   = useState(false);
    const [selectedPerson, setSelectedPerson] = useState<{ id: string; name: string; phone: string; avatar?: string | null } | null>(null);
    const [manualEntry, setManualEntry]       = useState(false);
    const [phone, setPhone]                   = useState('');
    const [recipientName, setRecipientName]   = useState('');

    // PCO Lists
    const [pcoLists, setPcoLists]     = useState<{ id: string; name: string; total_people: number }[]>([]);
    const [listSearch, setListSearch] = useState('');
    const [selectedList, setSelectedList] = useState<{ id: string; name: string; total_people: number } | null>(null);
    const [loadingLists, setLoadingLists] = useState(false);

    // PCO Groups
    const [pcoGroups, setPcoGroups]   = useState<{ id: string; name: string; memberCount: number }[]>([]);
    const [groupSearch, setGroupSearch] = useState('');
    const [selectedGroup, setSelectedGroup] = useState<{ id: string; name: string; memberCount: number } | null>(null);
    const [loadingGroups, setLoadingGroups] = useState(false);

    // Composer extras
    const [showEmojisNM, setShowEmojisNM]     = useState(false);
    const [showLinkDlgNM, setShowLinkDlgNM]   = useState(false);
    const [linkUrlNM, setLinkUrlNM]           = useState('');
    const [imageUrlNM, setImageUrlNM]         = useState('');
    const [aiSuggestionNM, setAiSuggestionNM] = useState('');
    const [aiLoadingNM, setAiLoadingNM]       = useState(false);
    const [showAiPanelNM, setShowAiPanelNM]   = useState(false);
    const textareaRefNM = useRef<HTMLTextAreaElement>(null);

    const MAX_CHARS  = 1600;
    const segCount   = Math.ceil((body.length || 1) / 160);
    const charLeft   = MAX_CHARS - body.length;

    const insertAtCursorNM = (text: string) => {
        const el = textareaRefNM.current;
        if (!el) { setBody(b => b + text); return; }
        const start = el.selectionStart ?? body.length;
        const end   = el.selectionEnd ?? start;
        const newBody = body.slice(0, start) + text + body.slice(end);
        setBody(newBody);
        requestAnimationFrame(() => {
            el.focus();
            const pos = start + text.length;
            el.setSelectionRange(pos, pos);
        });
    };

    const handleAiSuggestNM = async () => {
        if (!body.trim()) return;
        setAiLoadingNM(true);
        setShowAiPanelNM(true);
        setAiSuggestionNM('');
        try {
            const suggestion = await getSmsAiSuggestion(body);
            setAiSuggestionNM(suggestion);
        } catch {
            setAiSuggestionNM('Unable to get AI suggestion. Please try again.');
        } finally {
            setAiLoadingNM(false);
        }
    };

    // Debounced people search (fires when personSearch changes)
    useEffect(() => {
        if (mode !== 'individual' || manualEntry) return;
        const q = personSearch.trim();
        if (q.length < 2) { setPersonResults([]); return; }
        setPersonLoading(true);
        // Search the Firestore people cache — only surface people who have a phone on file.
        // Fetch a larger window (25) so the client-side phone filter still leaves useful results.
        const isPhone = /^[\d\s+()\-]{4,}$/.test(q);
        const col = collection(firebaseDb, 'people');
        const constraints = isPhone
            ? [where('churchId', '==', churchId), where('phone', '>=', q), where('phone', '<=', q + '\uffff'), limit(20)]
            : [where('churchId', '==', churchId), where('name', '>=', q), where('name', '<=', q + '\uffff'), limit(25)];
        getDocs(query(col, ...constraints as any))
            .then(snap => {
                const results = snap.docs
                    .map(d => {
                        const p = d.data() as any;
                        return { id: d.id, name: p.name || '', phone: (p.phone || '').trim(), avatar: p.avatar || null, membership: p.membership || null };
                    })
                    // Only show people with a valid phone number — no point surfacing un-textable contacts
                    .filter(p => p.phone && p.phone.replace(/\D/g, '').length >= 10);
                setPersonResults(results);
            })
            .catch(() => setPersonResults([]))
            .finally(() => setPersonLoading(false));
    }, [personSearch, mode, manualEntry, churchId]);

    useEffect(() => {
        if (mode !== 'list' || pcoLists.length > 0) return;
        setLoadingLists(true);
        pcoService.getPeopleLists(churchId)
            .then(raw => setPcoLists(raw.map((l: any) => ({
                id:          l.id,
                name:        l.attributes?.name || l.name || 'Unnamed List',
                total_people: l.attributes?.total_people ?? l.total_people ?? 0,
            }))))
            .catch(() => {})
            .finally(() => setLoadingLists(false));
    }, [mode]);

    // Load PCO groups when mode switches
    useEffect(() => {
        if (mode !== 'group' || pcoGroups.length > 0) return;
        setLoadingGroups(true);
        pcoService.getGroups(churchId)
            .then((raw: any[]) => setPcoGroups(raw.map(x => ({
                id:          x.id,
                name:        x.attributes?.name || x.name || 'Unnamed Group',
                memberCount: x.attributes?.members_count ?? x.attributes?.member_count ?? x.memberCount ?? 0,
            }))))
            .catch(() => {})
            .finally(() => setLoadingGroups(false));
    }, [mode]);

    const filteredLists  = pcoLists.filter(l  => l.name.toLowerCase().includes(listSearch.toLowerCase()));
    const filteredGroups = pcoGroups.filter(g => g.name.toLowerCase().includes(groupSearch.toLowerCase()));

    const canSend = body.trim().length > 0 && (
        (mode === 'individual' && (
            (selectedPerson && selectedPerson.phone.replace(/\D/g,'').length >= 10) ||
            (manualEntry && phone.replace(/\D/g,'').length >= 10)
        )) ||
        (mode === 'list'  && !!selectedList) ||
        (mode === 'group' && !!selectedGroup)
    );

    /** Safe JSON parser — reads raw text first so non-JSON bodies never throw a parse error. */
    const safeJson = async (res: Response): Promise<any> => {
        const text = await res.text();
        try {
            return JSON.parse(text);
        } catch {
            // Server returned HTML (e.g. a 404 or 500 error page) — surface the HTTP status
            throw new Error(`Server error ${res.status}: ${text.slice(0, 120) || res.statusText}`);
        }
    };

    const handleSend = async () => {
        if (!canSend || sending) return;
        setError('');
        setSending(true);
        try {
            if (mode === 'individual') {
                const toPhone = selectedPerson ? selectedPerson.phone : phone;
                const toName  = selectedPerson ? selectedPerson.name  : recipientName.trim();
                const res = await fetch(`${API_BASE}/api/messaging/send-individual`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        toPhone:    toPhone.replace(/[^\d+]/g, ''),
                        body,
                        sentBy:     currentUser.id,
                        sentByName: currentUser.name,
                        personName: toName || undefined,
                        personId:   selectedPerson?.id || undefined,
                    }),
                });
                const data = await safeJson(res);
                if (!data.success) throw new Error(data.error || `Send failed (HTTP ${res.status})`);
                setSentCount(1);
            } else if (mode === 'list' && selectedList) {
                const res = await fetch(`${API_BASE}/api/messaging/send-to-list`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        pcoListId:   selectedList.id,
                        listName:    selectedList.name,
                        body,
                        sentBy:      currentUser.id,
                        sentByName:  currentUser.name,
                    }),
                });
                const data = await safeJson(res);
                if (!data.success) throw new Error(data.error || `Send failed (HTTP ${res.status})`);
                setSentCount(data.sent || selectedList.total_people);
            } else if (mode === 'group' && selectedGroup) {
                const res = await fetch(`${API_BASE}/api/messaging/send-to-group`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        pcoGroupId:  selectedGroup.id,
                        groupName:   selectedGroup.name,
                        body,
                        sentBy:      currentUser.id,
                        sentByName:  currentUser.name,
                    }),
                });
                const data = await safeJson(res);
                if (!data.success) throw new Error(data.error || `Send failed (HTTP ${res.status})`);
                setSentCount(data.sent || selectedGroup.memberCount);
            }
        } catch (e: any) {
            setError(e.message || 'Send failed');
        } finally {
            setSending(false);
        }
    };

    // Success screen
    if (sentCount !== null) {
        return (
            <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
                <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 w-full max-w-sm text-center shadow-2xl">
                    <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 rounded-full flex items-center justify-center mx-auto mb-4">
                        <CheckCircle size={32} className="text-emerald-600" />
                    </div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white mb-1">Message Sent!</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                        {sentCount === 1
                            ? 'Your message was delivered.'
                            : `Queued for ${sentCount.toLocaleString()} recipient${sentCount !== 1 ? 's' : ''}.`
                        }
                    </p>
                    <button onClick={onSent} className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-black rounded-2xl transition">
                        Done
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg shadow-2xl flex flex-col max-h-[90vh]">

                {/* Header */}
                <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-200 dark:border-slate-700 shrink-0">
                    <h2 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <Edit3 size={18} className="text-violet-500" /> New Message
                    </h2>
                    <button onClick={onClose} title="Close" className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
                        <X size={20} />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto px-6 py-5 space-y-5">

                    {/* Recipient Mode */}
                    <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Send To</p>
                        <div className="grid grid-cols-3 gap-2">
                            {([
                                { key: 'individual', icon: <UserCheck size={16} />, label: 'Individual' },
                                { key: 'list',       icon: <List     size={16} />, label: 'PCO List'   },
                                { key: 'group',      icon: <Layers   size={16} />, label: 'PCO Group'  },
                            ] as { key: RecipientMode; icon: React.ReactNode; label: string }[]).map(opt => (
                                <button
                                    key={opt.key}
                                    onClick={() => setMode(opt.key)}
                                    className={`flex flex-col items-center gap-1.5 py-3 px-2 rounded-2xl border-2 transition text-xs font-black ${
                                        mode === opt.key
                                            ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400'
                                            : 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-violet-300'
                                    }`}
                                >
                                    {opt.icon}
                                    {opt.label}
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* Individual — PCO person search */}
                    {mode === 'individual' && (
                        <div className="space-y-3">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block">Recipient</label>

                            {/* Selected person card */}
                            {selectedPerson ? (
                                <div className="flex items-center gap-3 p-3 bg-violet-50 dark:bg-violet-900/20 border-2 border-violet-500 rounded-2xl">
                                    <div className="w-10 h-10 rounded-full bg-violet-200 dark:bg-violet-800 overflow-hidden flex items-center justify-center shrink-0">
                                        {selectedPerson.avatar
                                            ? <img src={selectedPerson.avatar} alt={selectedPerson.name} className="w-full h-full object-cover" />
                                            : <span className="text-sm font-black text-violet-600 dark:text-violet-300">{selectedPerson.name.charAt(0)}</span>
                                        }
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <p className="text-sm font-bold text-violet-800 dark:text-violet-200 truncate">{selectedPerson.name}</p>
                                        <p className="text-xs text-violet-500 font-mono">{formatPhone(selectedPerson.phone)}</p>
                                    </div>
                                    <button
                                        onClick={() => { setSelectedPerson(null); setPersonSearch(''); setManualEntry(false); }}
                                        title="Change recipient"
                                        className="text-violet-400 hover:text-violet-600 transition shrink-0"
                                    >
                                        <X size={16} />
                                    </button>
                                </div>
                            ) : manualEntry ? (
                                /* Manual phone entry */
                                <div className="space-y-2">
                                    <div className="relative">
                                        <Phone size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="tel"
                                            value={phone}
                                            onChange={e => setPhone(e.target.value)}
                                            placeholder="+1 (615) 555-0100"
                                            autoFocus
                                            className="w-full pl-8 pr-3 text-sm border-2 border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                                        />
                                    </div>
                                    <div className="relative">
                                        <UserCheck size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            value={recipientName}
                                            onChange={e => setRecipientName(e.target.value)}
                                            placeholder="Name (optional)"
                                            className="w-full pl-8 pr-3 text-sm border-2 border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                                        />
                                    </div>
                                    <button
                                        onClick={() => { setManualEntry(false); setPhone(''); setRecipientName(''); }}
                                        className="text-xs text-violet-500 hover:text-violet-700 font-semibold"
                                    >← Search PCO people instead</button>
                                </div>
                            ) : (
                                /* Search box */
                                <div>
                                    <div className="relative">
                                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        {personLoading && <Loader2 size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-violet-400 animate-spin" />}
                                        <input
                                            type="text"
                                            value={personSearch}
                                            onChange={e => setPersonSearch(e.target.value)}
                                            placeholder="Search by name or phone number…"
                                            autoFocus
                                            className="w-full pl-8 pr-8 text-sm border-2 border-slate-200 dark:border-slate-600 rounded-xl px-4 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                                        />
                                    </div>
                                    {/* Results dropdown */}
                                    {personResults.length > 0 && (
                                        <div className="mt-1 border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden shadow-lg max-h-48 overflow-y-auto">
                                            {personResults.map(p => (
                                                <button
                                                    key={p.id}
                                                    onClick={() => {
                                                        if (!p.phone) return;
                                                        setSelectedPerson({ id: p.id, name: p.name, phone: p.phone, avatar: p.avatar });
                                                        setPersonSearch('');
                                                        setPersonResults([]);
                                                    }}
                                                    disabled={!p.phone}
                                                    className={`w-full flex items-center gap-3 px-3 py-2.5 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition text-left ${
                                                        !p.phone ? 'opacity-40 cursor-not-allowed' : ''
                                                    }`}
                                                >
                                                    <div className="w-8 h-8 rounded-full bg-violet-100 dark:bg-violet-900/40 overflow-hidden flex items-center justify-center shrink-0">
                                                        {p.avatar
                                                            ? <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                                                            : <span className="text-xs font-black text-violet-600 dark:text-violet-300">{p.name.charAt(0)}</span>
                                                        }
                                                    </div>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{p.name}</p>
                                                        <p className="text-xs text-slate-400 truncate">
                                                            {p.phone ? formatPhone(p.phone) : <span className="text-amber-500 text-[10px]">No phone number</span>}
                                                            {p.membership && <span className="ml-2 text-[10px] text-slate-400">· {p.membership}</span>}
                                                        </p>
                                                    </div>
                                                    {p.phone && <ChevronRight size={14} className="text-violet-400 shrink-0" />}
                                                </button>
                                            ))}
                                        </div>
                                    )}
                                    {personSearch.trim().length >= 2 && !personLoading && personResults.length === 0 && (
                                        <p className="text-xs text-slate-400 text-center py-2">
                                            No PCO people found matching &ldquo;{personSearch}&rdquo;
                                        </p>
                                    )}
                                    <button
                                        onClick={() => setManualEntry(true)}
                                        className="mt-2 text-xs text-slate-400 hover:text-violet-600 font-semibold transition"
                                    >
                                        + Enter phone number manually
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* PCO List picker */}
                    {mode === 'list' && (
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Select Planning Center List</label>
                            {selectedList ? (
                                <div className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-900/20 border-2 border-violet-500 rounded-2xl">
                                    <div>
                                        <p className="font-bold text-sm text-violet-700 dark:text-violet-300">{selectedList.name}</p>
                                        <p className="text-xs text-violet-500">{selectedList.total_people.toLocaleString()} people</p>
                                    </div>
                                    <button onClick={() => setSelectedList(null)} title="Clear selected list" className="text-violet-400 hover:text-violet-600 transition"><X size={16} /></button>
                                </div>
                            ) : (
                                <div className="border-2 border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                                    <div className="relative">
                                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Search lists…"
                                            value={listSearch}
                                            onChange={e => setListSearch(e.target.value)}
                                            className="w-full pl-8 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                                        />
                                    </div>
                                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                                        {loadingLists ? (
                                            <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-slate-400" /></div>
                                        ) : filteredLists.length === 0 ? (
                                            <p className="text-center text-sm text-slate-400 py-4">No lists found</p>
                                        ) : filteredLists.map(l => (
                                            <button key={l.id} onClick={() => setSelectedList(l)} className="w-full text-left px-4 py-2.5 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition flex items-center justify-between">
                                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{l.name}</span>
                                                <span className="text-xs text-slate-400">{l.total_people.toLocaleString()}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* PCO Group picker */}
                    {mode === 'group' && (
                        <div>
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">Select Planning Center Group</label>
                            {selectedGroup ? (
                                <div className="flex items-center justify-between p-3 bg-violet-50 dark:bg-violet-900/20 border-2 border-violet-500 rounded-2xl">
                                    <div>
                                        <p className="font-bold text-sm text-violet-700 dark:text-violet-300">{selectedGroup.name}</p>
                                        <p className="text-xs text-violet-500">{selectedGroup.memberCount.toLocaleString()} members</p>
                                    </div>
                                    <button onClick={() => setSelectedGroup(null)} title="Clear selected group" className="text-violet-400 hover:text-violet-600 transition"><X size={16} /></button>
                                </div>
                            ) : (
                                <div className="border-2 border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                                    <div className="relative">
                                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                                        <input
                                            type="text"
                                            placeholder="Search groups…"
                                            value={groupSearch}
                                            onChange={e => setGroupSearch(e.target.value)}
                                            className="w-full pl-8 pr-3 py-2.5 text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none"
                                        />
                                    </div>
                                    <div className="max-h-40 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700">
                                        {loadingGroups ? (
                                            <div className="flex justify-center py-4"><Loader2 size={16} className="animate-spin text-slate-400" /></div>
                                        ) : filteredGroups.length === 0 ? (
                                            <p className="text-center text-sm text-slate-400 py-4">No groups found</p>
                                        ) : filteredGroups.map(g => (
                                            <button key={g.id} onClick={() => setSelectedGroup(g)} className="w-full text-left px-4 py-2.5 hover:bg-violet-50 dark:hover:bg-violet-900/20 transition flex items-center justify-between">
                                                <span className="text-sm font-semibold text-slate-800 dark:text-slate-200">{g.name}</span>
                                                <span className="text-xs text-slate-400">{g.memberCount.toLocaleString()}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Message editor */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Message</label>
                            <span className={`text-[10px] font-semibold ${
                                charLeft < 0 ? 'text-red-500' : charLeft < 50 ? 'text-amber-500' : 'text-slate-400'
                            }`}>
                                {body.length}/{MAX_CHARS} · {segCount} segment{segCount !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <textarea
                            ref={textareaRefNM}
                            rows={5}
                            value={body}
                            onChange={e => setBody(e.target.value)}
                            maxLength={MAX_CHARS}
                            placeholder={mode === 'individual'
                                ? 'Type your message…'
                                : 'Type your message… Use merge tags to personalize.'}
                            className="w-full text-sm border-2 border-slate-200 dark:border-slate-600 rounded-xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-violet-500 resize-none"
                        />
                        {/* Composer toolbar */}
                        <div className="flex items-center gap-1 mt-2 flex-wrap">
                            {/* Emoji */}
                            <div className="relative">
                                <button type="button" title="Insert emoji"
                                    onClick={() => { setShowEmojisNM(v => !v); setShowLinkDlgNM(false); }}
                                    className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
                                ><Smile size={12} /> Emoji</button>
                                {showEmojisNM && (
                                    <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 grid grid-cols-10 gap-1 min-w-[260px]">
                                        {COMMON_EMOJIS.map(em => (
                                            <button key={em} onClick={() => { insertAtCursorNM(em); setShowEmojisNM(false); }}
                                                className="text-xl hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg p-1 transition leading-none" title={em}>{em}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {/* Link */}
                            <div className="relative">
                                <button type="button" title="Insert link"
                                    onClick={() => { setShowLinkDlgNM(v => !v); setShowEmojisNM(false); }}
                                    className="flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-200 dark:border-slate-700 transition"
                                ><Link size={12} /> Link</button>
                                {showLinkDlgNM && (
                                    <div className="absolute top-full left-0 mt-1 z-50 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 w-72">
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Insert Link URL</p>
                                        <div className="flex gap-2">
                                            <input type="url" value={linkUrlNM} onChange={e => setLinkUrlNM(e.target.value)}
                                                placeholder="https://example.com"
                                                className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                            />
                                            <button onClick={() => { if (linkUrlNM.trim()) { insertAtCursorNM(' ' + linkUrlNM.trim()); setLinkUrlNM(''); setShowLinkDlgNM(false); } }}
                                                className="px-3 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl transition">Insert</button>
                                        </div>
                                    </div>
                                )}
                            </div>
                            {/* Image */}
                            <button type="button" title="Attach image (MMS)" onClick={() => {
                                const url = window.prompt('Enter image URL (MMS):');
                                if (url) setImageUrlNM(url);
                            }} className={`flex items-center gap-1 px-2 py-1 text-xs font-semibold rounded-lg border transition ${
                                imageUrlNM ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 border-emerald-300 dark:border-emerald-700'
                                : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 border-slate-200 dark:border-slate-700'
                            }`}>
                                <ImageIcon size={12} /> {imageUrlNM ? 'Image ✓' : 'Image'}
                            </button>
                            {imageUrlNM && (
                                <button type="button" title="Remove image" onClick={() => setImageUrlNM('')}
                                    className="p-1 text-red-400 hover:text-red-600 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"><X size={12} /></button>
                            )}
                            <div className="flex-1" />
                            {/* AI Helper */}
                            <button type="button" title="AI SMS helper" onClick={handleAiSuggestNM}
                                disabled={!body.trim() || aiLoadingNM}
                                className="flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border border-violet-200 dark:border-violet-700 hover:bg-violet-100 dark:hover:bg-violet-900/40 disabled:opacity-50 transition"
                            >
                                {aiLoadingNM ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />} AI Shorten
                            </button>
                        </div>
                        {/* Image preview NM */}
                        {imageUrlNM && (
                            <div className="mt-2 rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 max-w-[180px]">
                                <img src={imageUrlNM} alt="MMS attachment" className="w-full h-auto object-cover" onError={() => setImageUrlNM('')} />
                            </div>
                        )}
                        {/* AI panel NM */}
                        {showAiPanelNM && (
                            <div className="mt-3 bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-700 rounded-2xl p-3">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-[10px] font-black uppercase tracking-widest text-violet-500 flex items-center gap-1"><Sparkles size={10} /> AI Suggestion</span>
                                    <button onClick={() => setShowAiPanelNM(false)} title="Dismiss" className="text-violet-400 hover:text-violet-600"><X size={13} /></button>
                                </div>
                                {aiLoadingNM ? (
                                    <div className="flex items-center gap-2 text-sm text-violet-500"><Loader2 size={13} className="animate-spin" /> Analyzing…</div>
                                ) : (
                                    <>
                                        <p className="text-sm text-violet-800 dark:text-violet-200 leading-relaxed whitespace-pre-wrap mb-2">{aiSuggestionNM}</p>
                                        <div className="flex items-center gap-2">
                                            <span className={`text-xs font-bold ${ countSegments(aiSuggestionNM) > 1 ? 'text-amber-600' : 'text-emerald-600' }`}>
                                                {aiSuggestionNM.length} chars · {countSegments(aiSuggestionNM)} seg
                                            </span>
                                            <div className="flex-1" />
                                            <button onClick={() => { setBody(aiSuggestionNM); setShowAiPanelNM(false); }}
                                                className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold bg-violet-600 hover:bg-violet-700 text-white rounded-xl transition"
                                            ><ChevronRight size={11} /> Use This</button>
                                            <button onClick={handleAiSuggestNM} title="Retry" className="flex items-center gap-1 px-2 py-1.5 text-xs font-semibold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 rounded-xl hover:bg-violet-200 transition">
                                                <RotateCcw size={10} /> Retry
                                            </button>
                                        </div>
                                    </>
                                )}
                            </div>
                        )}
                        {/* Merge tags hint */}
                        {mode !== 'individual' && (
                            <div className="mt-2">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Merge Tags</p>
                                <div className="flex flex-wrap gap-1.5">
                                    {ALL_MERGE_TAGS.map(({ tag, label }) => (
                                        <button key={tag} type="button" title={`Insert ${label}`}
                                            onClick={() => insertAtCursorNM(tag)}
                                            className="px-2 py-1 text-[10px] font-mono font-semibold bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded-lg hover:bg-violet-100 dark:hover:bg-violet-900/40 border border-violet-200 dark:border-violet-800 transition"
                                        >{tag}</button>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
                            <AlertTriangle size={14} className="shrink-0" />{error}
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 pb-6 pt-4 border-t border-slate-200 dark:border-slate-700 shrink-0 flex gap-3">
                    <button onClick={onClose} className="flex-1 py-3 text-sm font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-2xl transition">
                        Cancel
                    </button>
                    <button
                        onClick={handleSend}
                        disabled={!canSend || sending}
                        className="flex-[2] py-3 text-sm font-black bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-2xl transition flex items-center justify-center gap-2"
                    >
                        {sending
                            ? <><Loader2 size={16} className="animate-spin" /> Sending…</>
                            : mode === 'individual'
                                ? <><Send size={15} /> Send Message</>
                                : <><Send size={15} /> Send to {mode === 'list' ? selectedList?.name : selectedGroup?.name}</>}
                    </button>
                </div>
            </div>
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
    const [showComposer, setShowComposer]   = useState(false);

    // Tags
    const [tags, setTags]               = useState<SmsTag[]>([]);
    const [tagFilter, setTagFilter]     = useState<string | null>(null); // tag id to filter by
    const [showTagPicker, setShowTagPicker] = useState(false);

    // Load church tags
    useEffect(() => {
        const q = query(
            collection(firebaseDb, 'smsTags'),
            where('churchId', '==', churchId),
            orderBy('createdAt', 'asc')
        );
        return onSnapshot(q, snap => {
            setTags(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsTag)));
        });
    }, [churchId]);

    // Load conversations
    useEffect(() => {
        const q = query(
            collection(firebaseDb, 'smsConversations'),
            where('churchId', '==', churchId),
            orderBy('lastMessageAt', 'desc'),
            limit(100)
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

    // Toggle a tag on the active conversation
    const handleToggleConvTag = async (conv: SmsConversation, tagId: string) => {
        const current: string[] = conv.tags || [];
        const next = current.includes(tagId)
            ? current.filter(t => t !== tagId)
            : [...current, tagId];
        await updateDoc(doc(firebaseDb, 'smsConversations', conv.id), { tags: next }).catch(() => {});
        // If it's the active conversation, keep the activeConv in sync
        if (activeConv?.id === conv.id) {
            setActiveConv(prev => prev ? { ...prev, tags: next } : prev);
        }
    };

    const filtered = conversations.filter(c => {
        const matchSearch = !search || c.phoneNumber.includes(search) || (c.personName || '').toLowerCase().includes(search.toLowerCase());
        const matchTag = !tagFilter || (c.tags || []).includes(tagFilter);
        return matchSearch && matchTag;
    });

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
            {/* New Message Composer modal */}
            {showComposer && (
                <NewMessageComposer
                    churchId={churchId}
                    currentUser={currentUser}
                    onClose={() => setShowComposer(false)}
                    onSent={() => setShowComposer(false)}
                />
            )}

            {/* Conversation list */}
            <div className="w-[320px] shrink-0 border-r border-slate-200 dark:border-slate-700 flex flex-col bg-white dark:bg-slate-900">
                <div className="p-4 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between mb-3">
                        <h2 className="font-black text-slate-900 dark:text-white text-sm flex items-center gap-2">
                            <Inbox size={16} className="text-violet-500" /> Inbox
                        </h2>
                        <button
                            onClick={() => setShowComposer(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 bg-violet-600 hover:bg-violet-700 text-white rounded-xl text-[10px] font-black uppercase tracking-widest transition shadow-sm"
                        >
                            <Plus size={12} /> New
                        </button>
                    </div>
                    <div className="relative mb-2">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            placeholder="Search…"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-8 pr-3 py-2 text-sm bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        />
                    </div>

                    {/* Tag filter chips */}
                    {tags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-1">
                            <button
                                onClick={() => setTagFilter(null)}
                                className={`px-2 py-0.5 text-[10px] font-bold rounded-full border transition ${
                                    tagFilter === null
                                        ? 'bg-violet-600 text-white border-violet-600'
                                        : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-violet-400'
                                }`}
                            >All</button>
                            {tags.map(t => {
                                const c = TAG_COLOR_MAP[t.color] || TAG_COLOR_MAP.violet;
                                const isActive = tagFilter === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => setTagFilter(isActive ? null : t.id)}
                                        className={`inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full border transition ${
                                            isActive ? `${c.bg} ${c.text} ${c.border}` : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-violet-400'
                                        }`}
                                    >
                                        {t.emoji && <span>{t.emoji}</span>}
                                        {t.name}
                                    </button>
                                );
                            })}
                        </div>
                    )}
                </div>
                <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-700/60">
                    {filtered.length === 0 && (
                        <div className="text-center py-12 text-slate-400">
                            <MessageCircle size={28} className="mx-auto mb-2 opacity-40" />
                            <p className="text-sm">{tagFilter ? 'No conversations with this tag' : 'No conversations yet'}</p>
                        </div>
                    )}
                    {filtered.map(conv => {
                        const isUnread = (conv.unreadCount || 0) > 0;
                        const isActive = activeConv?.id === conv.id;
                        const convTags = tags.filter(t => (conv.tags || []).includes(t.id));
                        return (
                            <button
                                key={conv.id}
                                className={`w-full text-left px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800 transition relative ${
                                    isActive ? 'bg-violet-50 dark:bg-violet-900/20' : ''
                                }`}
                                onClick={() => setActiveConv(conv)}
                            >
                                {/* Unread left accent bar */}
                                {isUnread && !isActive && (
                                    <span className="absolute left-0 top-2 bottom-2 w-0.5 bg-violet-500 rounded-full" />
                                )}
                                <div className="flex items-start justify-between gap-2">
                                    <div className="flex items-center gap-2.5 min-w-0">
                                        {conv.personAvatar ? (
                                            <img
                                                src={conv.personAvatar}
                                                alt={conv.personName || conv.phoneNumber}
                                                className="w-9 h-9 rounded-full object-cover shrink-0 ring-2 ring-white dark:ring-slate-900"
                                                onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement)!.style.display = 'flex'; }}
                                            />
                                        ) : null}
                                        <div className={`w-9 h-9 rounded-full text-violet-600 dark:text-violet-300 items-center justify-center font-black text-sm shrink-0 ${
                                            isUnread
                                                ? 'bg-violet-200 dark:bg-violet-700'
                                                : 'bg-violet-100 dark:bg-violet-900/40'
                                        } ${conv.personAvatar ? 'hidden' : 'flex'}`}>
                                            {(conv.personName || conv.phoneNumber).charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className={`text-sm truncate ${
                                                isUnread ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-200'
                                            }`}>{conv.personName || formatPhone(conv.phoneNumber)}</p>
                                            {conv.personName && <p className={`text-[10px] ${ isUnread ? 'text-slate-500' : 'text-slate-400' }`}>{formatPhone(conv.phoneNumber)}</p>}
                                            <p className={`text-xs truncate mt-0.5 ${
                                                isUnread ? 'text-slate-600 dark:text-slate-300 font-medium' : 'text-slate-400 dark:text-slate-500'
                                            }`}>{conv.lastMessageBody || '…'}</p>
                                            {/* Tag chips */}
                                            {convTags.length > 0 && (
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    {convTags.slice(0, 3).map(t => (
                                                        <SmsTagChip key={t.id} tag={t} />
                                                    ))}
                                                    {convTags.length > 3 && (
                                                        <span className="text-[10px] text-slate-400 font-semibold">+{convTags.length - 3}</span>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="shrink-0 flex flex-col items-end gap-1">
                                        <span className={`text-[10px] ${ isUnread ? 'text-violet-500 font-semibold' : 'text-slate-400' }`}>{timeAgo(conv.lastMessageAt)}</span>
                                        {isUnread && (
                                            <span className="min-w-[18px] h-[18px] bg-violet-600 text-white text-[10px] font-black rounded-full flex items-center justify-center px-1">
                                                {conv.unreadCount}
                                            </span>
                                        )}
                                        {conv.isOptedOut && <span className="text-[9px] text-red-500 font-bold">OPT-OUT</span>}
                                    </div>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Message thread */}
            {activeConv ? (
                <div className="flex-1 flex flex-col">
                    {/* Thread header */}
                    <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 flex items-center gap-3">
                        <div className="relative shrink-0">
                            {activeConv.personAvatar ? (
                                <img
                                    src={activeConv.personAvatar}
                                    alt={activeConv.personName || activeConv.phoneNumber}
                                    className="w-9 h-9 rounded-full object-cover ring-2 ring-violet-100 dark:ring-violet-900/40"
                                    onError={e => { (e.currentTarget as HTMLImageElement).style.display = 'none'; (e.currentTarget.nextElementSibling as HTMLElement)!.style.display = 'flex'; }}
                                />
                            ) : null}
                            <div className={`w-9 h-9 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-600 dark:text-violet-300 items-center justify-center font-black text-sm ${activeConv.personAvatar ? 'hidden' : 'flex'}`}>
                                {(activeConv.personName || activeConv.phoneNumber).charAt(0).toUpperCase()}
                            </div>
                        </div>
                        <div className="flex-1 min-w-0">
                            <p className="font-bold text-slate-900 dark:text-white text-sm">{activeConv.personName || formatPhone(activeConv.phoneNumber)}</p>
                            <p className="text-xs text-slate-400">{formatPhone(activeConv.phoneNumber)}</p>
                        </div>
                        {activeConv.isOptedOut && (
                            <span className="text-xs font-bold text-red-500 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-full px-2 py-0.5">OPTED OUT</span>
                        )}
                        {/* Active tags on conversation */}
                        {tags.filter(t => (activeConv.tags || []).includes(t.id)).map(t => (
                            <SmsTagChip
                                key={t.id}
                                tag={t}
                                size="sm"
                                onRemove={() => handleToggleConvTag(activeConv, t.id)}
                            />
                        ))}
                        {/* Tag picker button */}
                        {tags.length > 0 && (
                            <div className="relative shrink-0">
                                <button
                                    onClick={() => setShowTagPicker(v => !v)}
                                    title="Add or remove tags"
                                    className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-xs font-semibold text-slate-500 dark:text-slate-400 border border-slate-200 dark:border-slate-700 hover:border-violet-400 hover:text-violet-600 dark:hover:text-violet-300 transition"
                                >
                                    <Tag size={12} /> Tags
                                </button>
                                {showTagPicker && (
                                    <div
                                        className="absolute right-0 top-full mt-2 z-40 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl p-3 w-56"
                                        onClick={e => e.stopPropagation()}
                                    >
                                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Tag This Conversation</p>
                                        <div className="space-y-1">
                                            {tags.map(t => {
                                                const isOn = (activeConv.tags || []).includes(t.id);
                                                const c = TAG_COLOR_MAP[t.color] || TAG_COLOR_MAP.violet;
                                                return (
                                                    <button
                                                        key={t.id}
                                                        onClick={() => handleToggleConvTag(activeConv, t.id)}
                                                        className={`w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl transition text-sm font-semibold ${
                                                            isOn
                                                                ? `${c.bg} ${c.text}`
                                                                : 'hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-300'
                                                        }`}
                                                    >
                                                        <span className={`w-4 h-4 rounded-full border-2 flex items-center justify-center shrink-0 ${
                                                            isOn ? `${c.dot.replace('bg-', 'border-')} ${c.dot}` : 'border-slate-300 dark:border-slate-600'
                                                        }`}>
                                                            {isOn && <CheckCircle size={10} className="text-white" />}
                                                        </span>
                                                        {t.emoji && <span>{t.emoji}</span>}
                                                        {t.name}
                                                    </button>
                                                );
                                            })}
                                        </div>
                                        <button
                                            onClick={() => setShowTagPicker(false)}
                                            className="w-full mt-2 py-1.5 text-xs font-bold text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 transition"
                                        >Done</button>
                                    </div>
                                )}
                            </div>
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
                                        <div className={`text-[10px] mt-1 flex items-center gap-1 flex-wrap ${msg.direction === 'outbound' ? 'text-violet-200' : 'text-slate-400'}`}>
                                            {new Date(msg.createdAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                                            {msg.direction === 'outbound' && msg.sentByName && ` · ${msg.sentByName}`}
                                            {msg.direction === 'outbound' && msg.status && (() => {
                                                const s = msg.status;
                                                if (s === 'delivered')    return <span className="text-emerald-300 font-semibold" title="Delivered">✓✓ delivered</span>;
                                                if (s === 'sent')         return <span className="text-violet-300" title="Accepted by carrier">✓ sent</span>;
                                                if (s === 'queued')       return <span className="text-violet-300/70" title="Queued by Twilio">· queued</span>;
                                                if (s === 'failed')       return <span className="text-red-400 font-bold" title="Failed — not delivered">⚠ failed</span>;
                                                if (s === 'undelivered')  return <span className="text-red-400 font-bold" title="Undelivered — carrier rejected">⚠ undelivered</span>;
                                                return <span className="opacity-60">· {s}</span>;
                                            })()}
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
    tags: SmsTag[];
    onSave: (kw: Omit<SmsKeyword, 'id' | 'matchCount' | 'createdAt'>) => Promise<void>;
    onClose: () => void;
    isBusy: boolean;
    saveError?: string;
}

const KeywordModal: React.FC<KeywordModalProps> = ({ initial, pcoLists, loadingLists, tags, onSave, onClose, isBusy, saveError }) => {
    const [keyword, setKeyword]           = useState(initial?.keyword || '');
    const [replyMessage, setReplyMessage] = useState(initial?.replyMessage || '');
    const [addToListId, setAddToListId]   = useState(initial?.addToListId || '');
    const [isActive, setIsActive]         = useState(initial?.isActive ?? true);
    const [autoTagIds, setAutoTagIds]     = useState<string[]>(initial?.autoTagIds || []);
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
            autoTagIds:    autoTagIds.length > 0 ? autoTagIds : [],
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
                            title="Add to PCO list"
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                        >
                            <option value="">— Don't add to a list —</option>
                            {pcoLists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.total_people})</option>)}
                        </select>
                    )}
                </div>

                {/* Auto-tag conversations */}
                {tags.length > 0 && (
                    <div className="mb-4">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Auto-Tag Conversations</label>
                        <p className="text-[10px] text-slate-400 mb-2">When this keyword matches, automatically apply these tags to the conversation.</p>
                        <div className="flex flex-wrap gap-2">
                            {tags.map(t => {
                                const isOn = autoTagIds.includes(t.id);
                                const c = TAG_COLOR_MAP[t.color] || TAG_COLOR_MAP.violet;
                                return (
                                    <button
                                        key={t.id}
                                        type="button"
                                        onClick={() => setAutoTagIds(prev =>
                                            isOn ? prev.filter(id => id !== t.id) : [...prev, t.id]
                                        )}
                                        className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold border-2 transition ${
                                            isOn
                                                ? `${c.bg} ${c.text} ${c.border}`
                                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 hover:border-violet-300'
                                        }`}
                                    >
                                        {isOn && <CheckCircle size={11} />}
                                        {t.emoji && <span>{t.emoji}</span>}
                                        {t.name}
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Active toggle */}
                <div className="flex items-center justify-between mb-5 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">Active</p>
                        <p className="text-xs text-slate-500">Keyword only fires when active</p>
                    </div>
                    <button
                        onClick={() => setIsActive(v => !v)}
                        title={isActive ? 'Deactivate keyword' : 'Activate keyword'}
                        className={`relative w-12 h-6 rounded-full transition-colors ${isActive ? 'bg-violet-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                    >
                        <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${isActive ? 'translate-x-6' : 'translate-x-0'}`} />
                    </button>
                </div>

                {error && <p className="text-sm text-red-500 mb-3">{error}</p>}
                {saveError && !error && (
                    <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2.5 mb-3">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        <span>{saveError}</span>
                    </div>
                )}

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
    const [listError, setListError] = useState<string | null>(null);
    const [editKw, setEditKw]       = useState<SmsKeyword | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [isBusy, setIsBusy]       = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [pcoLists, setPcoLists]   = useState<{ id: string; name: string; total_people: number }[]>([]);
    const [loadingLists, setLoadingLists] = useState(false);

    // Tags
    const [tags, setTags]                       = useState<SmsTag[]>([]);
    const [tagModalOpen, setTagModalOpen]       = useState(false);
    const [editTag, setEditTag]                 = useState<SmsTag | null>(null);
    const [tagName, setTagName]                 = useState('');
    const [tagEmoji, setTagEmoji]               = useState('');
    const [tagColor, setTagColor]               = useState<SmsTag['color']>('violet');
    const [tagBusy, setTagBusy]                 = useState(false);
    const [activeSection, setActiveSection]     = useState<'keywords' | 'tags'>('keywords');

    // Real-time keyword listener
    useEffect(() => {
        const q = query(
            collection(firebaseDb, 'smsKeywords'),
            where('churchId', '==', churchId),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(
            q,
            snap => {
                setKeywords(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsKeyword)));
                setIsLoading(false);
                setListError(null);
            },
            (err: any) => {
                console.error('[SmsKeywords] onSnapshot error:', err);
                setIsLoading(false);
                // Missing composite index shows up as code 'failed-precondition'
                if (err?.code === 'failed-precondition' || (err?.message || '').toLowerCase().includes('index')) {
                    setListError(
                        'A Firestore index is required to display keywords. ' +
                        'Open the browser console, click the index creation link in the error, then reload this page.'
                    );
                } else {
                    setListError('Failed to load keywords: ' + (err?.message || String(err)));
                }
            }
        );
        return unsub;
    }, [churchId]);

    // Load tags
    useEffect(() => {
        const q = query(
            collection(firebaseDb, 'smsTags'),
            where('churchId', '==', churchId),
            orderBy('createdAt', 'asc')
        );
        return onSnapshot(q, snap => {
            setTags(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsTag)));
        });
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
        setSaveError(null);
        try {
            if (editKw) {
                // Editing existing keyword
                await updateDoc(doc(firebaseDb, 'smsKeywords', editKw.id), {
                    ...data,
                    churchId,
                });
            } else {
                // Creating new keyword
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
            console.error('[SmsKeywords] Save error:', e);
            setSaveError(
                e?.code === 'permission-denied'
                    ? 'Permission denied — check your Firestore security rules for the smsKeywords collection.'
                    : 'Failed to save keyword: ' + (e?.message || String(e))
            );
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

    const openNew = () => { setSaveError(null); setEditKw(null); setModalOpen(true); };
    const openEdit = (kw: SmsKeyword) => { setSaveError(null); setEditKw(kw); setModalOpen(true); };

    // Tag CRUD
    const openNewTag = () => { setEditTag(null); setTagName(''); setTagEmoji(''); setTagColor('violet'); setTagModalOpen(true); };
    const openEditTag = (t: SmsTag) => { setEditTag(t); setTagName(t.name); setTagEmoji(t.emoji || ''); setTagColor(t.color); setTagModalOpen(true); };
    const handleSaveTag = async () => {
        if (!tagName.trim()) return;
        setTagBusy(true);
        try {
            if (editTag) {
                await updateDoc(doc(firebaseDb, 'smsTags', editTag.id), { name: tagName.trim(), emoji: tagEmoji.trim() || null, color: tagColor });
            } else {
                await addDoc(collection(firebaseDb, 'smsTags'), {
                    churchId, name: tagName.trim(), emoji: tagEmoji.trim() || null, color: tagColor, createdAt: Date.now(),
                });
            }
            setTagModalOpen(false);
        } catch (e: any) {
            alert('Failed to save tag: ' + e.message);
        } finally {
            setTagBusy(false);
        }
    };
    const handleDeleteTag = async (t: SmsTag) => {
        if (!window.confirm(`Delete tag "${t.name}"? It will be removed from all conversations.`)) return;
        await deleteDoc(doc(firebaseDb, 'smsTags', t.id));
    };

    return (
        <div className="p-6 max-w-4xl mx-auto">
            {/* Section toggle */}
            <div className="flex items-center gap-4 mb-6">
                <div className="flex gap-1 p-1 bg-slate-100 dark:bg-slate-800 rounded-xl">
                    <button
                        onClick={() => setActiveSection('keywords')}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
                            activeSection === 'keywords' ? 'bg-white dark:bg-slate-700 text-violet-600 dark:text-violet-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                        }`}
                    ><Key size={13} /> Keywords</button>
                    <button
                        onClick={() => setActiveSection('tags')}
                        className={`flex items-center gap-1.5 px-4 py-1.5 rounded-lg text-sm font-semibold transition ${
                            activeSection === 'tags' ? 'bg-white dark:bg-slate-700 text-violet-600 dark:text-violet-300 shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700'
                        }`}
                    ><Tag size={13} /> Tags</button>
                </div>
                {activeSection === 'keywords' && (
                    <button onClick={openNew} className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition shadow-md shadow-violet-200 dark:shadow-violet-900/40">
                        <Plus size={16} /> New Keyword
                    </button>
                )}
                {activeSection === 'tags' && (
                    <button onClick={openNewTag} className="ml-auto flex items-center gap-2 px-4 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition shadow-md shadow-violet-200 dark:shadow-violet-900/40">
                        <Plus size={16} /> New Tag
                    </button>
                )}
            </div>

            {/* ─── KEYWORDS section ─────────────────────────────────────────── */}
            {activeSection === 'keywords' && (
            <>
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
            {listError && (
                <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 mb-4">
                    <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
                    <span>{listError}</span>
                </div>
            )}
            {isLoading ? (
                <div className="flex items-center justify-center h-40 text-slate-400"><Loader2 size={20} className="animate-spin mr-2" /> Loading keywords…</div>
            ) : keywords.length === 0 && !listError ? (
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
                    {keywords.map(kw => {
                        const kwTags = tags.filter(t => (kw.autoTagIds || []).includes(t.id));
                        return (
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
                                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-0.5">
                                    {kw.addToListName && (
                                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
                                            <Users size={10} /> → {kw.addToListName}
                                        </span>
                                    )}
                                    {kwTags.map(t => (
                                        <SmsTagChip key={t.id} tag={t} />
                                    ))}
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
                        );
                    })}
                </div>
            )}

            {/* Carrier reserved keywords note */}
            <div className="mt-6 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                <span>
                    <strong>Reserved words:</strong> STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, HELP, and START are reserved by carriers and cannot be used as custom keywords. These responses are handled automatically.
                </span>
            </div>
            </>
            )}

            {/* ─── TAGS section ─────────────────────────────────────────────── */}
            {activeSection === 'tags' && (
            <>
            <div className="flex items-start gap-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 mb-6">
                <div className="text-3xl">🏷️</div>
                <div>
                    <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200 mb-1">Conversation Tags</p>
                    <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
                        Tags let you categorise and filter SMS conversations. Apply them manually from any conversation, or automatically when a keyword is matched. Create tags like{' '}
                        <span className="font-bold">Prayer Request 🙏</span>,{' '}<span className="font-bold">Service Times 📅</span>, or{' '}<span className="font-bold">Pastoral Care ❤️</span>.
                    </p>
                </div>
            </div>

            {tags.length === 0 ? (
                <div className="text-center py-20 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                    <Tag size={40} className="mx-auto text-slate-300 dark:text-slate-600 mb-3" />
                    <p className="text-slate-600 dark:text-slate-400 font-semibold">No tags yet</p>
                    <p className="text-sm text-slate-400 dark:text-slate-500 mt-1 mb-4">Tags help you track conversations by topic.</p>
                    <button onClick={openNewTag} className="px-4 py-2 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition">
                        <span className="flex items-center gap-1.5"><Plus size={14} /> New Tag</span>
                    </button>
                </div>
            ) : (
                <div className="space-y-3">
                    {tags.map(t => {
                        const c = TAG_COLOR_MAP[t.color] || TAG_COLOR_MAP.violet;
                        return (
                            <div key={t.id} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-violet-200 dark:hover:border-violet-700 transition group">
                                <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${c.bg}`}>
                                    {t.emoji || <Tag size={18} className={c.text} />}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <p className={`font-bold text-sm ${c.text}`}>{t.name}</p>
                                        <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border capitalize ${c.bg} ${c.text} ${c.border}`}>{t.color}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400 mt-0.5">
                                        Created {new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                    <button onClick={() => openEditTag(t)} className="p-1.5 text-slate-400 hover:text-violet-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition" title="Edit tag">
                                        <Pencil size={14} />
                                    </button>
                                    <button onClick={() => handleDeleteTag(t)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition" title="Delete tag">
                                        <Trash2 size={14} />
                                    </button>
                                </div>
                            </div>
                        );
                    })}
                </div>
            )}
            </>
            )}

            {/* Keyword modal */}
            {modalOpen && (
                <KeywordModal
                    initial={editKw}
                    pcoLists={pcoLists}
                    loadingLists={loadingLists}
                    tags={tags}
                    onSave={handleSave}
                    onClose={() => { setModalOpen(false); setEditKw(null); setSaveError(null); }}
                    isBusy={isBusy}
                    saveError={saveError || undefined}
                />
            )}

            {/* Tag modal */}
            {tagModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setTagModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-7 w-full max-w-sm mx-4" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white mb-5 flex items-center gap-2">
                            <Tag size={18} className="text-violet-500" /> {editTag ? 'Edit Tag' : 'New Tag'}
                        </h3>

                        <div className="mb-4">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Tag Name</label>
                            <input
                                type="text"
                                value={tagName}
                                onChange={e => setTagName(e.target.value)}
                                placeholder="e.g. Prayer Request"
                                maxLength={40}
                                autoFocus
                                className="w-full text-sm border-2 border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Emoji (optional)</label>
                            <input
                                type="text"
                                value={tagEmoji}
                                onChange={e => setTagEmoji(e.target.value)}
                                placeholder="🙏"
                                maxLength={4}
                                className="w-24 text-xl border-2 border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-violet-500 text-center"
                            />
                        </div>

                        <div className="mb-6">
                            <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Color</label>
                            <div className="flex gap-2 flex-wrap">
                                {(Object.keys(TAG_COLOR_MAP) as SmsTag['color'][]).map(color => {
                                    const c = TAG_COLOR_MAP[color];
                                    return (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setTagColor(color)}
                                            title={color}
                                            className={`w-8 h-8 rounded-full border-4 transition ${
                                                tagColor === color ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent hover:scale-105'
                                            } ${c.dot}`}
                                        />
                                    );
                                })}
                            </div>
                            {tagName && (
                                <div className="mt-3">
                                    <p className="text-[10px] text-slate-400 mb-1">Preview:</p>
                                    <SmsTagChip
                                        tag={{ id: '', churchId: '', name: tagName, emoji: tagEmoji || undefined, color: tagColor, createdAt: 0 }}
                                        size="sm"
                                    />
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => setTagModalOpen(false)} className="flex-1 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 transition">Cancel</button>
                            <button
                                onClick={handleSaveTag}
                                disabled={tagBusy || !tagName.trim()}
                                className="flex-1 py-2.5 text-sm font-black bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl transition flex items-center justify-center gap-2"
                            >
                                {tagBusy ? <><Loader2 size={14} className="animate-spin" />Saving…</> : <><CheckCircle size={14} />{editTag ? 'Save' : 'Create Tag'}</>}
                            </button>
                        </div>
                    </div>
                </div>
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

// Channel metadata
const CHANNEL_CONFIG: Record<WorkflowChannelType, { label: string; icon: React.ReactNode; color: string; badge: string }> = {
    sms:        { label: 'SMS',        icon: <MessageSquare size={13} />, color: 'bg-violet-600 text-white hover:bg-violet-700',   badge: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300' },
    mms:        { label: 'MMS',        icon: <ImageIcon size={13} />,     color: 'bg-blue-600 text-white hover:bg-blue-700',       badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300'       },
    email:      { label: 'Email',      icon: <Mail size={13} />,           color: 'bg-emerald-600 text-white hover:bg-emerald-700', badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
    staff_sms:  { label: 'Staff SMS',  icon: <Users size={13} />,          color: 'bg-amber-500 text-white hover:bg-amber-600',     badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300'     },
    staff_email:{ label: 'Staff Email',icon: <Mail size={13} />,           color: 'bg-rose-500 text-white hover:bg-rose-600',       badge: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'         },
};

// ─── Step Editor Row ─────────────────────────────────────────────────────────

const StepRow: React.FC<{
    step: SmsWorkflowStep;
    index: number;
    total: number;
    onChange: (patch: Partial<SmsWorkflowStep>) => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    pcoLists: { id: string; name: string }[];
    pcoGroups: { id: string; name: string }[];
}> = ({ step, index, total, onChange, onDelete, onMoveUp, onMoveDown, pcoLists, pcoGroups }) => {
    const channel = step.channelType ?? 'sms';
    const segs = countSegments(step.message);
    const [mmsUrl, setMmsUrl] = React.useState((step.mediaUrls && step.mediaUrls[0]) || '');

    // Keep mmsUrl in sync when external step changes (e.g. on first load)
    React.useEffect(() => {
        setMmsUrl((step.mediaUrls && step.mediaUrls[0]) || '');
    }, [step.id]);

    const handleMmsUrl = (url: string) => {
        setMmsUrl(url);
        onChange({ mediaUrls: url ? [url] : [] });
    };

    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
            {/* Step header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                    <span className="w-7 h-7 rounded-full bg-violet-600 text-white text-xs font-black flex items-center justify-center shrink-0">{index + 1}</span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Step {index + 1}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={onMoveUp} disabled={index === 0} title="Move step up" className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"><ChevronDown size={14} className="rotate-180" /></button>
                    <button onClick={onMoveDown} disabled={index === total - 1} title="Move step down" className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"><ChevronDown size={14} /></button>
                    <button onClick={onDelete} title="Delete step" className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"><Trash2 size={14} /></button>
                </div>
            </div>

            {/* Channel picker — split into two rows: Contact | Staff */}
            <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Channel</p>
                {/* Contact channels */}
                <div className="flex rounded-t-xl overflow-hidden border border-b-0 border-slate-200 dark:border-slate-600">
                    {(['sms', 'mms', 'email'] as WorkflowChannelType[]).map(ch => (
                        <button
                            key={ch}
                            type="button"
                            onClick={() => onChange({ channelType: ch })}
                            title={`Use ${CHANNEL_CONFIG[ch].label} channel`}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold transition border-r last:border-r-0 border-slate-200 dark:border-slate-600 ${
                                channel === ch
                                    ? CHANNEL_CONFIG[ch].color
                                    : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-600'
                            }`}
                        >
                            {CHANNEL_CONFIG[ch].icon} {CHANNEL_CONFIG[ch].label}
                        </button>
                    ))}
                </div>
                {/* Staff channels */}
                <div className="flex rounded-b-xl overflow-hidden border border-slate-200 dark:border-slate-600">
                    {(['staff_sms', 'staff_email'] as WorkflowChannelType[]).map(ch => (
                        <button
                            key={ch}
                            type="button"
                            onClick={() => onChange({ channelType: ch })}
                            title={`Use ${CHANNEL_CONFIG[ch].label} channel`}
                            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold transition border-r last:border-r-0 border-slate-200 dark:border-slate-600 ${
                                channel === ch
                                    ? CHANNEL_CONFIG[ch].color
                                    : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-600'
                            }`}
                        >
                            {CHANNEL_CONFIG[ch].icon} {CHANNEL_CONFIG[ch].label}
                            {(ch === 'staff_sms' || ch === 'staff_email') && (
                                <span className="text-[8px] opacity-60 ml-0.5">(internal)</span>
                            )}
                        </button>
                    ))}
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
                        title="Delay in days"
                        placeholder="0"
                        className="w-16 text-center text-sm font-black border border-slate-200 dark:border-slate-600 rounded-xl px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    <span className="text-xs text-slate-500 dark:text-slate-400">
                        {step.delayDays === 0 ? 'days (immediate)' : `day${step.delayDays !== 1 ? 's' : ''}`}
                    </span>
                </div>
            </div>

            {/* ── SMS fields ── */}
            {channel === 'sms' && (
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
                        placeholder="Type your message… Use {firstName} for personalisation."
                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 resize-none"
                    />
                    <div className="flex gap-1.5 mt-1.5 flex-wrap">
                        {ALL_MERGE_TAGS.map(({ tag }) => (
                            <button key={tag} onClick={() => onChange({ message: step.message + tag })}
                                className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 rounded-lg border border-violet-200 dark:border-violet-800 hover:bg-violet-100 transition"
                            >{tag}</button>
                        ))}
                    </div>
                    {step.message.trim() && (
                        <div className="bg-slate-100 dark:bg-slate-900/40 rounded-2xl p-3 flex justify-end mt-2">
                            <div className="bg-violet-600 text-white text-xs px-3 py-2 rounded-2xl rounded-br-sm max-w-[85%] leading-relaxed whitespace-pre-wrap break-words">
                                {step.message
                                    .split('{firstName}').join('John').split('{lastName}').join('Smith')
                                    .split('{fullName}').join('John Smith').split('{email}').join('john@example.com')
                                    .split('{phone}').join('(615) 555-0100').split('{birthday}').join('Jan 15')
                                    .split('{anniversary}').join('Jun 10').split('{city}').join('Nashville')
                                    .split('{state}').join('TN')
                                }
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* ── MMS fields ── */}
            {channel === 'mms' && (
                <div className="space-y-3">
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
                            placeholder="Caption for the image… Use {firstName} for personalisation."
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            {ALL_MERGE_TAGS.map(({ tag }) => (
                                <button key={tag} onClick={() => onChange({ message: step.message + tag })}
                                    className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition"
                                >{tag}</button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Image URL (MMS)</label>
                        <input
                            type="url"
                            value={mmsUrl}
                            onChange={e => handleMmsUrl(e.target.value)}
                            placeholder="https://example.com/image.jpg"
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                        />
                        <p className="text-[10px] text-slate-400 mt-1">Publicly accessible URL — JPG, PNG, GIF, or WebP. MMS may incur additional carrier fees.</p>
                    </div>
                    {mmsUrl && (
                        <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 max-w-[180px]">
                            <img src={mmsUrl} alt="MMS preview" className="w-full h-auto object-cover" onError={() => handleMmsUrl('')} />
                        </div>
                    )}
                </div>
            )}

            {/* ── Email fields ── */}
            {channel === 'email' && (
                <div className="space-y-3">
                    <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300">
                        <Mail size={13} className="mt-0.5 shrink-0" />
                        <span>Email steps are sent using your church's Email settings (from name, address, template). The recipient must have an email on file in Planning Center.</span>
                    </div>
                    <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Subject Line</label>
                        <input
                            type="text"
                            value={step.emailSubject || ''}
                            onChange={e => onChange({ emailSubject: e.target.value })}
                            placeholder="e.g. Welcome to Grace Church! 🙏"
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] font-black uppercase tracking-widest text-slate-400">Email Body</label>
                            <span className="text-[10px] text-slate-400">{(step.emailBody || '').length} chars</span>
                        </div>
                        <textarea
                            rows={6}
                            value={step.emailBody || ''}
                            onChange={e => onChange({ emailBody: e.target.value })}
                            placeholder={`Dear {firstName},\n\nWe're so glad you joined us…`}
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-medium leading-relaxed"
                        />
                        <div className="flex gap-1.5 mt-1.5 flex-wrap">
                            {ALL_MERGE_TAGS.map(({ tag }) => (
                                <button key={tag} onClick={() => onChange({ emailBody: (step.emailBody || '') + tag })}
                                    className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition"
                                >{tag}</button>
                            ))}
                        </div>
                    </div>
                    {(step.emailSubject?.trim() || step.emailBody?.trim()) && (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                            <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2 border-b border-slate-200 dark:border-slate-700">
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Preview</p>
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{step.emailSubject?.replace('{firstName}', 'John') || '(no subject)'}</p>
                            </div>
                            <div className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                {(step.emailBody || '')
                                    .split('{firstName}').join('John').split('{lastName}').join('Smith')
                                    .split('{fullName}').join('John Smith').split('{email}').join('john@example.com')
                                    .split('{phone}').join('(615) 555-0100').split('{birthday}').join('Jan 15')
                                    .split('{anniversary}').join('Jun 10').split('{city}').join('Nashville')
                                    .split('{state}').join('TN')
                                || <span className="opacity-40 italic">No body yet</span>}
                            </div>
                        </div>
                    )}
                </div>
            )}

            {/* Staff SMS / Staff Email: internal notification step */}
            {(channel === 'staff_sms' || channel === 'staff_email') && (() => {
                const isEmail = channel === 'staff_email';
                const targetType = step.staffTargetType ?? 'individuals';
                const recipients = step.staffRecipients ?? [];
                const [addName, setAddName] = React.useState('');
                const [addContact, setAddContact] = React.useState('');
                const addRecipient = () => {
                    if (!addName.trim() && !addContact.trim()) return;
                    onChange({ staffRecipients: [...recipients, isEmail ? { name: addName.trim() || addContact.trim(), email: addContact.trim() } : { name: addName.trim() || addContact.trim(), phone: addContact.trim() }] });
                    setAddName(''); setAddContact('');
                };
                return (
                    <div className={`space-y-3 p-4 rounded-2xl border ${isEmail ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800' : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'}`}>
                        {/* Info */}
                        <div className={`flex items-start gap-2 text-xs ${isEmail ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>
                            <Users size={13} className='mt-0.5 shrink-0' />
                            <span><strong>Internal step</strong> — notifies <strong>staff</strong> only. Use {'{contact.firstName}'}, {'{contact.phone}'}, {'{contact.email}'} for the enrolled person.</span>
                        </div>
                        {/* Who to notify */}
                        <div>
                            <p className='text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5'>Notify</p>
                            <div className='flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600'>
                                {(['individuals', 'list', 'group'] as const).map(t => (
                                    <button key={t} type='button' onClick={() => onChange({ staffTargetType: t })}
                                        className={`flex-1 py-1.5 text-xs font-bold transition border-r last:border-r-0 border-slate-200 dark:border-slate-600 ${targetType === t ? (isEmail ? 'bg-rose-500 text-white' : 'bg-amber-500 text-white') : 'bg-white dark:bg-slate-700 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-600'}`}>
                                        {t === 'individuals' ? 'Specific People' : t === 'list' ? 'PCO List' : 'PCO Group'}
                                    </button>
                                ))}
                            </div>
                        </div>
                        {/* Specific individuals */}
                        {targetType === 'individuals' && (
                            <div className='space-y-2'>
                                {recipients.map((r, ri) => (
                                    <div key={ri} className='flex items-center justify-between bg-white/60 dark:bg-slate-700/40 rounded-xl px-3 py-2'>
                                        <div><p className='text-xs font-semibold text-slate-800 dark:text-slate-200'>{r.name}</p><p className='text-[10px] text-slate-500'>{r.email || r.phone}</p></div>
                                        <button type='button' onClick={() => onChange({ staffRecipients: recipients.filter((_, i) => i !== ri) })} className='p-1 text-slate-400 hover:text-red-500 rounded' title='Remove'><Trash2 size={12} /></button>
                                    </div>
                                ))}
                                <div className='flex gap-2'>
                                    <input type='text' value={addName} onChange={e => setAddName(e.target.value)} placeholder='Name' className='flex-1 text-xs border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400' />
                                    <input type={isEmail ? 'email' : 'tel'} value={addContact} onChange={e => setAddContact(e.target.value)} onKeyDown={e => e.key === 'Enter' && addRecipient()} placeholder={isEmail ? 'Email' : 'Phone'} className='flex-1 text-xs border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400' />
                                    <button type='button' onClick={addRecipient} className={`px-3 py-2 rounded-xl text-white text-xs font-bold ${isEmail ? 'bg-rose-500 hover:bg-rose-600' : 'bg-amber-500 hover:bg-amber-600'}`}><Plus size={13} /></button>
                                </div>
                                {recipients.length === 0 && <p className='text-[10px] text-slate-400 text-center'>No recipients — add at least one.</p>}
                            </div>
                        )}
                        {/* PCO List */}
                        {targetType === 'list' && (
                            <div>
                                <label className='block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5'>PCO List</label>
                                <select value={step.staffListId || ''} onChange={e => { const l = pcoLists.find(x => x.id === e.target.value); onChange({ staffListId: e.target.value || null, staffListName: l?.name || null }); }} title='Staff PCO list' className='w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-900 dark:text-white'>
                                    <option value=''>— Select a list —</option>
                                    {pcoLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                                <p className='text-[10px] text-slate-400 mt-1'>All members with a valid {isEmail ? 'email' : 'phone'} are notified.</p>
                            </div>
                        )}
                        {/* PCO Group */}
                        {targetType === 'group' && (
                            <div>
                                <label className='block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5'>PCO Group</label>
                                <select value={step.staffGroupId || ''} onChange={e => { const g = pcoGroups.find(x => x.id === e.target.value); onChange({ staffGroupId: e.target.value || null, staffGroupName: g?.name || null }); }} title='Staff PCO group' className='w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-900 dark:text-white'>
                                    <option value=''>— Select a group —</option>
                                    {pcoGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                </select>
                                <p className='text-[10px] text-slate-400 mt-1'>All members with a valid {isEmail ? 'email' : 'phone'} are notified.</p>
                            </div>
                        )}
                        {/* Content */}
                        {isEmail ? (
                            <div className='space-y-2'>
                                <input type='text' value={step.emailSubject || ''} onChange={e => onChange({ emailSubject: e.target.value })} placeholder='Subject: Action needed — {contact.firstName} is at Step 3' className='w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-400' />
                                <textarea rows={5} value={step.emailBody || ''} onChange={e => onChange({ emailBody: e.target.value })} placeholder={'Hi team,\n\nJust a heads-up: {contact.firstName} ({contact.phone}) is progressing through the workflow. Please follow up today.'} className='w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none' />
                            </div>
                        ) : (
                            <textarea rows={3} value={step.message} onChange={e => onChange({ message: e.target.value })} placeholder='FYI: {contact.firstName} ({contact.phone}) just hit this workflow step. Please reach out!' className='w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none' />
                        )}
                        {/* Contact merge tags */}
                        <div className='flex gap-1.5 flex-wrap'>
                            {['{contact.firstName}','{contact.lastName}','{contact.name}','{contact.phone}','{contact.email}'].map(t => (
                                <button key={t} type='button' onClick={() => isEmail ? onChange({ emailBody: (step.emailBody || '') + t }) : onChange({ message: step.message + t })}
                                    className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded-lg border transition ${isEmail ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 border-rose-200 hover:bg-rose-100' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
                                >{t}</button>
                            ))}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};

// ─── AI Workflow Builder Panel ──────────────────────────────────────────────────

const EXAMPLE_PROMPTS = [
    'Send a text once a day for 5 days with a Bible verse about prayer. On the last day, remind them the church is praying for them.',
    'Create a 3-step new visitor follow-up: a welcome text on day 0, an email on day 3 about getting connected, and an SMS on day 7 inviting them back.',
    'Build a 7-day Easter devotional series with daily SMS scripture and a final email summarising the Resurrection story.',
    'Send 4 weekly SMS giving encouragements reminding donors of the church mission.',
];

const AiWorkflowBuilderPanel: React.FC<{
    onApply: (draft: AiWorkflowDraft) => void;
    onClose: () => void;
}> = ({ onApply, onClose }) => {
    const [prompt, setPrompt]  = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError]    = useState('');
    const [draft, setDraft]    = useState<AiWorkflowDraft | null>(null);

    const handleGenerate = async () => {
        if (!prompt.trim()) return;
        setLoading(true);
        setError('');
        setDraft(null);
        try {
            const result = await generateWorkflowWithAi(prompt);
            setDraft(result);
        } catch (e: any) {
            setError(e.message || 'Generation failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleKeyDown = (e: React.KeyboardEvent) => {
        if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') handleGenerate();
    };

    const chBadgeClass: Record<string, string> = {
        sms:   'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300',
        mms:   'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
        email: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
    };

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="relative w-full max-w-2xl bg-white dark:bg-slate-900 flex flex-col shadow-2xl overflow-hidden rounded-3xl max-h-[90vh]"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="shrink-0 px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between bg-gradient-to-r from-violet-600 to-purple-600">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 bg-white/20 rounded-2xl flex items-center justify-center text-white">
                            <Sparkles size={18} />
                        </div>
                        <div>
                            <h2 className="text-white font-black text-base">AI Workflow Builder</h2>
                            <p className="text-violet-200 text-xs">Describe your workflow — AI writes every step for you</p>
                        </div>
                    </div>
                    <button onClick={onClose} title="Close" className="p-1.5 rounded-xl text-white/70 hover:text-white hover:bg-white/20 transition">
                        <X size={18} />
                    </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 space-y-5">

                    {/* Prompt input */}
                    <div>
                        <label className="block text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2">Describe Your Workflow</label>
                        <textarea
                            rows={4}
                            value={prompt}
                            onChange={e => setPrompt(e.target.value)}
                            onKeyDown={handleKeyDown}
                            placeholder="e.g. Send a text once a day for 5 days with a Bible verse about prayer. On the last day, remind them the church has them on the prayer list."
                            className="w-full text-sm border-2 border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-violet-500 dark:focus:border-violet-400 resize-none leading-relaxed"
                        />
                        <p className="text-[10px] text-slate-400 mt-1.5">Tip: ⌘ / Ctrl + Enter to generate</p>
                    </div>

                    {/* Example prompts */}
                    {!draft && !loading && (
                        <div>
                            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Try an example</p>
                            <div className="space-y-2">
                                {EXAMPLE_PROMPTS.map((ep, i) => (
                                    <button
                                        key={i}
                                        onClick={() => setPrompt(ep)}
                                        className="w-full text-left text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-violet-50 dark:hover:bg-violet-900/20 hover:text-violet-700 dark:hover:text-violet-300 border border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-700 rounded-xl px-3 py-2.5 transition leading-relaxed"
                                    >
                                        "{ep}"
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Loading state */}
                    {loading && (
                        <div className="flex flex-col items-center justify-center py-16 gap-4 text-slate-400">
                            <div className="relative">
                                <div className="w-16 h-16 rounded-full bg-violet-100 dark:bg-violet-900/30 flex items-center justify-center">
                                    <Sparkles size={28} className="text-violet-500 animate-pulse" />
                                </div>
                                <Loader2 size={48} className="absolute inset-0 m-auto text-violet-400 animate-spin opacity-40" />
                            </div>
                            <div className="text-center">
                                <p className="font-bold text-slate-700 dark:text-slate-300">Building your workflow…</p>
                                <p className="text-xs mt-1">AI is writing every step with real content</p>
                            </div>
                        </div>
                    )}

                    {/* Error */}
                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
                            <AlertTriangle size={16} className="shrink-0" /> {error}
                        </div>
                    )}

                    {/* Draft preview */}
                    {draft && !loading && (
                        <div className="space-y-4">
                            <div className="flex items-center justify-between">
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Generated Workflow</p>
                                    <h3 className="font-black text-slate-900 dark:text-white text-base">{draft.name}</h3>
                                    {draft.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{draft.description}</p>}
                                </div>
                                <span className="text-xs font-bold bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 px-2.5 py-1 rounded-full">{draft.steps.length} step{draft.steps.length !== 1 ? 's' : ''}</span>
                            </div>

                            {/* Step cards */}
                            <div className="space-y-3">
                                {draft.steps.map((step, idx) => (
                                    <div key={idx} className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className="w-6 h-6 rounded-full bg-violet-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${chBadgeClass[step.channelType] ?? chBadgeClass.sms}`}>{step.channelType.toUpperCase()}</span>
                                            <span className="text-[10px] text-slate-400">
                                                {idx === 0 ? 'Sends immediately' : `After ${step.delayDays} day${step.delayDays !== 1 ? 's' : ''}`}
                                            </span>
                                        </div>
                                        {step.channelType === 'email' ? (
                                            <div className="space-y-1">
                                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Subject: {step.emailSubject}</p>
                                                <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed line-clamp-4">{step.emailBody}</p>
                                            </div>
                                        ) : (
                                            <div className="flex justify-end">
                                                <div className="bg-violet-600 text-white text-xs px-3 py-2 rounded-2xl rounded-br-sm max-w-[90%] leading-relaxed whitespace-pre-wrap break-words font-medium shadow-sm">
                                                    {step.message}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="shrink-0 px-6 py-4 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex items-center gap-3">
                    {draft && !loading ? (
                        <>
                            <button
                                onClick={handleGenerate}
                                disabled={loading || !prompt.trim()}
                                className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                            >
                                <RotateCcw size={13} /> Regenerate
                            </button>
                            <div className="flex-1" />
                            <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition">Cancel</button>
                            <button
                                onClick={() => { onApply(draft); onClose(); }}
                                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold rounded-xl transition shadow-md shadow-violet-200 dark:shadow-violet-900/40"
                            >
                                <ChevronRight size={15} /> Apply to Editor
                            </button>
                        </>
                    ) : (
                        <>
                            <div className="flex-1" />
                            <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition">Cancel</button>
                            <button
                                onClick={handleGenerate}
                                disabled={loading || !prompt.trim()}
                                className="flex items-center gap-2 px-5 py-2.5 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition shadow-md shadow-violet-200 dark:shadow-violet-900/40"
                            >
                                {loading ? <><Loader2 size={14} className="animate-spin" /> Generating…</> : <><Sparkles size={14} /> Generate Workflow</>}
                            </button>
                        </>
                    )}
                </div>
            </div>
        </div>
    );
};

// ─── Workflow Editor ─────────────────────────────────────────────────────────

const WorkflowEditor: React.FC<{
    initial: SmsWorkflow | null;
    churchId: string;
    keywords: SmsKeyword[];
    pcoLists: { id: string; name: string }[];
    pcoGroups: { id: string; name: string }[];
    onSave: (wf: SmsWorkflow) => Promise<void>;
    onBack: () => void;
    isBusy: boolean;
}> = ({ initial, churchId, keywords, pcoLists, pcoGroups, onSave, onBack, isBusy }) => {
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
        steps: [{ id: uid(), order: 0, delayDays: 0, channelType: 'sms', message: '' }],
        isActive: true,
        enrolledCount: 0,
        completedCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
    });

    const [wf, setWf] = useState<SmsWorkflow>(initial ?? makeBlank());
    const [error, setError] = useState('');
    const [showAiBuilder, setShowAiBuilder] = useState(false);

    const handleApplyAiDraft = (draft: AiWorkflowDraft) => {
        const steps: SmsWorkflowStep[] = draft.steps.map((s, i) => ({
            id: uid(),
            order: i,
            delayDays: i === 0 ? 0 : (s.delayDays ?? 1),
            channelType: (s.channelType ?? 'sms') as WorkflowChannelType,
            message: s.message || '',
            emailSubject: s.emailSubject,
            emailBody: s.emailBody,
        }));
        setWf(prev => ({
            ...prev,
            name: draft.name || prev.name,
            description: draft.description || prev.description,
            steps,
        }));
    };

    const patch = (p: Partial<SmsWorkflow>) => setWf(prev => ({ ...prev, ...p }));

    const addStep = () => {
        const steps = [...wf.steps, { id: uid(), order: wf.steps.length, delayDays: 1, channelType: 'sms' as WorkflowChannelType, message: '' }];
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
        const badStep = wf.steps.find(s => {
            const ch = s.channelType ?? 'sms';
            if (ch === 'email') return !s.emailSubject?.trim() || !s.emailBody?.trim();
            if (ch === 'staff_email') {
                if (!s.emailSubject?.trim() || !s.emailBody?.trim()) return true;
                // must have at least one target
                const tt = s.staffTargetType ?? 'individuals';
                if (tt === 'individuals') return !s.staffRecipients?.length;
                if (tt === 'list') return !s.staffListId;
                if (tt === 'group') return !s.staffGroupId;
            }
            if (ch === 'staff_sms') {
                if (!s.message.trim()) return true;
                const tt = s.staffTargetType ?? 'individuals';
                if (tt === 'individuals') return !s.staffRecipients?.length;
                if (tt === 'list') return !s.staffListId;
                if (tt === 'group') return !s.staffGroupId;
            }
            return !s.message.trim();
        });
        if (badStep) {
            const ch = badStep.channelType ?? 'sms';
            if (ch === 'staff_email' || ch === 'email') setError('All Email steps need a subject, body, and at least one recipient or target.');
            else if (ch === 'staff_sms') setError('All Staff SMS steps need a message and at least one recipient or target.');
            else setError('All SMS / MMS steps must have a message.');
            return;
        }
        if (wf.trigger === 'keyword'  && !wf.triggerKeywordId) { setError('Select a keyword trigger.'); return; }
        if (wf.trigger === 'list_add' && !wf.triggerListId)     { setError('Select a PCO list trigger.'); return; }
        setError('');
        await onSave({ ...wf, updatedAt: Date.now() });
    };

    const triggerLabel: Record<string, string> = {
        manual:      'Staff manually enrolls a contact',
        keyword:     'Contact texts a keyword',
        list_add:    'Contact added to a PCO List',
        birthday:    'Fires each year on birthdays',
        anniversary: 'Fires each year on anniversaries',
    };

    return (
        <div className="flex flex-col h-full">
            {/* Editor header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} title="Back to workflows" className="p-1.5 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                        <span className="cursor-pointer hover:text-violet-600 font-medium" onClick={onBack}>Workflows</span>
                        <span className="mx-1.5 text-slate-300 dark:text-slate-600">/</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{wf.name || 'New Workflow'}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* AI Builder button */}
                    <button
                        onClick={() => setShowAiBuilder(true)}
                        title="Build this workflow with AI"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-violet-300 dark:border-violet-600 bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/40 transition"
                    >
                        <Sparkles size={12} /> AI Build
                    </button>
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

            {/* AI Builder modal */}
            {showAiBuilder && (
                <AiWorkflowBuilderPanel
                    onApply={handleApplyAiDraft}
                    onClose={() => setShowAiBuilder(false)}
                />
            )}

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

                        {/* Row 1 — basic triggers */}
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

                        {/* Row 2 — date-based triggers */}
                        <div className="grid grid-cols-2 gap-2">
                            {(['birthday', 'anniversary'] as const).map(t => (
                                <button
                                    key={t}
                                    onClick={() => patch({ trigger: t })}
                                    className={`p-3 rounded-xl border-2 text-left transition ${
                                        wf.trigger === t
                                            ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
                                            : 'border-slate-200 dark:border-slate-700 hover:border-pink-300'
                                    }`}
                                >
                                    <p className="text-xs font-black text-slate-900 dark:text-white mb-0.5">
                                        {t === 'birthday' ? '🎂 Birthday' : '💍 Anniversary'}
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
                                        title="Trigger keyword"
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
                                    title="Trigger PCO list"
                                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500"
                                >
                                    <option value="">— Select a list —</option>
                                    {pcoLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                </select>
                                <p className="text-[10px] text-slate-400 mt-1">Contacts are enrolled whenever the scheduler detects them added to this list.</p>
                            </div>
                        )}

                        {/* Birthday / Anniversary options */}
                        {(wf.trigger === 'birthday' || wf.trigger === 'anniversary') && (
                            <div className="space-y-3">
                                {/* Day offset */}
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">
                                        Send how many days before?
                                    </label>
                                    <div className="flex items-center gap-3">
                                        <select
                                            value={wf.triggerDayOffset ?? 0}
                                            onChange={e => patch({ triggerDayOffset: Number(e.target.value) })}
                                            title="Days before event to send"
                                            className="w-48 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                                        >
                                            <option value={0}>On the day (0 days before)</option>
                                            <option value={1}>1 day before</option>
                                            <option value={2}>2 days before</option>
                                            <option value={3}>3 days before</option>
                                            <option value={7}>1 week before</option>
                                            <option value={14}>2 weeks before</option>
                                            <option value={30}>1 month before</option>
                                        </select>
                                        <span className="text-xs text-slate-400">
                                            Step 1 fires {(wf.triggerDayOffset ?? 0) === 0
                                                ? `on their ${wf.trigger}`
                                                : `${wf.triggerDayOffset} day${wf.triggerDayOffset !== 1 ? 's' : ''} before their ${wf.trigger}`
                                            }
                                        </span>
                                    </div>
                                </div>
                                {/* Info banner */}
                                <div className="flex items-start gap-2.5 p-3.5 bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800 rounded-xl">
                                    <span className="text-lg shrink-0 mt-0.5">{wf.trigger === 'birthday' ? '🎂' : '💍'}</span>
                                    <div className="text-xs text-pink-700 dark:text-pink-300 leading-relaxed">
                                        <p className="font-bold mb-0.5">
                                            Automatically fires every year
                                        </p>
                                        <p>
                                            The daily scanner checks all people in your Planning Center database each morning and enrolls anyone whose {wf.trigger} matches today's date{(wf.triggerDayOffset ?? 0) > 0 ? ` (adjusted ${wf.triggerDayOffset} day${wf.triggerDayOffset !== 1 ? 's' : ''} early)` : ''}. Each person is only enrolled once per calendar year. Use <span className="font-mono bg-pink-100 dark:bg-pink-900/40 px-1 rounded">{'{'}birthday{'}'}</span> or <span className="font-mono bg-pink-100 dark:bg-pink-900/40 px-1 rounded">{'{'}firstName{'}'}</span> in your message to personalize it.
                                        </p>
                                    </div>
                                </div>
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
                                        pcoLists={pcoLists}
                                        pcoGroups={pcoGroups}
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
                    <button onClick={onClose} title="Close" className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"><X size={16} /></button>
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
    const [pcoGroups, setPcoGroups] = useState<{ id: string; name: string }[]>([]);
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

    // Load keywords, PCO lists and PCO groups for the editor
    useEffect(() => {
        getDocs(query(collection(firebaseDb, 'smsKeywords'), where('churchId', '==', churchId)))
            .then(snap => setKeywords(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsKeyword))));
        pcoService.getPeopleLists(churchId)
            .then((raw: any[]) => setPcoLists(raw.map(r => ({ id: r.id, name: r.attributes?.name || 'Unnamed' }))))
            .catch(() => {});
        pcoService.getGroups(churchId)
            .then((raw: any[]) => setPcoGroups(raw.map(r => ({ id: r.id, name: r.attributes?.name || 'Unnamed' }))))
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
        manual:      { label: 'Manual',      color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300',    icon: '✍️' },
        keyword:     { label: 'Keyword',     color: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300', icon: '💬' },
        list_add:    { label: 'List Add',    color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',      icon: '📝' },
        birthday:    { label: 'Birthday',    color: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300',      icon: '🎂' },
        anniversary: { label: 'Anniversary', color: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300',      icon: '💍' },
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
                    pcoGroups={pcoGroups}
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
                        Build a multi-step message sequence with custom delays between each step. Triggered automatically by a keyword text, a PCO List add, a <strong>🎂 birthday</strong>, or a <strong>💍 anniversary</strong> — or manually by staff. Once enrolled, contacts move through each step on schedule. Birthday and anniversary workflows auto-enroll the right people every year.
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
                                                {/* Per-step channel badges */}
                                                <div className="flex gap-1 flex-wrap">
                                                    {wf.steps.map((s, si) => {
                                                        const ch = s.channelType ?? 'sms';
                                                        const cfg = CHANNEL_CONFIG[ch];
                                                        return (
                                                            <span key={si} className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
                                                                {cfg.label}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
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
    const [step, setStep]               = useState<'search' | 'pick-number' | 'done'>('search');
    const [searchMode, setSearchMode]   = useState<'area-code' | 'city-state'>('city-state');
    const [areaCode, setAreaCode]       = useState(church.zip?.slice(0, 3) || '');
    const [city, setCity]               = useState(church.city || '');
    const [stateAbbr, setStateAbbr]     = useState(church.state || '');
    const [numbers, setNumbers]         = useState<{ phoneNumber: string; friendlyName: string; locality: string; region: string }[]>([]);
    const [resolvedSearch, setResolvedSearch] = useState('');
    const [canExpand, setCanExpand]     = useState(false); // backend says 0 city results, offer state search
    const [page, setPage]               = useState(0);
    const PAGE_SIZE                     = 10;
    const [loadingNums, setLoadingNums] = useState(false);
    const [selectedNumber, setSelectedNumber] = useState('');
    const [senderName, setSenderName]   = useState(church.name || '');
    const [provisioning, setProvisioning] = useState(false);
    const [error, setError]             = useState('');

    const US_STATES = [
        ['AL','Alabama'],['AK','Alaska'],['AZ','Arizona'],['AR','Arkansas'],['CA','California'],
        ['CO','Colorado'],['CT','Connecticut'],['DE','Delaware'],['FL','Florida'],['GA','Georgia'],
        ['HI','Hawaii'],['ID','Idaho'],['IL','Illinois'],['IN','Indiana'],['IA','Iowa'],
        ['KS','Kansas'],['KY','Kentucky'],['LA','Louisiana'],['ME','Maine'],['MD','Maryland'],
        ['MA','Massachusetts'],['MI','Michigan'],['MN','Minnesota'],['MS','Mississippi'],['MO','Missouri'],
        ['MT','Montana'],['NE','Nebraska'],['NV','Nevada'],['NH','New Hampshire'],['NJ','New Jersey'],
        ['NM','New Mexico'],['NY','New York'],['NC','North Carolina'],['ND','North Dakota'],['OH','Ohio'],
        ['OK','Oklahoma'],['OR','Oregon'],['PA','Pennsylvania'],['RI','Rhode Island'],['SC','South Carolina'],
        ['SD','South Dakota'],['TN','Tennessee'],['TX','Texas'],['UT','Utah'],['VT','Vermont'],
        ['VA','Virginia'],['WA','Washington'],['WV','West Virginia'],['WI','Wisconsin'],['WY','Wyoming'],
    ];

    const fetchNumbers = async (expandToState = false) => {
        setError('');
        setLoadingNums(true);
        try {
            let url = `${API_BASE}/api/messaging/available-numbers?churchId=${encodeURIComponent(churchId)}`;

            if (searchMode === 'area-code') {
                if (!areaCode || areaCode.length < 3) { setError('Please enter a 3-digit area code.'); setLoadingNums(false); return; }
                url += `&areaCode=${encodeURIComponent(areaCode)}`;
            } else {
                if (!stateAbbr) { setError('Please select a state.'); setLoadingNums(false); return; }
                if (!expandToState && city.trim()) url += `&city=${encodeURIComponent(city.trim())}`;
                url += `&state=${encodeURIComponent(stateAbbr)}`;
            }

            const res  = await fetch(url);
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Failed to fetch numbers');
            setNumbers(data.numbers || []);
            setResolvedSearch(data.searchMode || '');
            setCanExpand(!!data.canExpand);
            setPage(0);
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

    const canSearch = searchMode === 'area-code'
        ? areaCode.length === 3
        : !!stateAbbr;

    return (
        <div className="p-6 max-w-xl mx-auto mt-8">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6">
                <ArrowLeft size={14} /> Back
            </button>

            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
                {step === 'search' && (
                    <>
                        <h2 className="text-xl font-black text-slate-900 dark:text-white mb-1">Find a Local Number</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Search by city &amp; state, or enter an area code directly.</p>

                        {/* Mode toggle */}
                        <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 mb-5">
                            {(['city-state', 'area-code'] as const).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => { setSearchMode(mode); setError(''); }}
                                    className={`flex-1 py-2 text-xs font-black uppercase tracking-widest transition ${
                                        searchMode === mode
                                            ? 'bg-violet-600 text-white'
                                            : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    {mode === 'city-state' ? '🏙 City & State' : '# Area Code'}
                                </button>
                            ))}
                        </div>

                        {searchMode === 'city-state' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">City <span className="font-normal normal-case">(optional)</span></label>
                                    <input
                                        type="text"
                                        value={city}
                                        onChange={e => setCity(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && canSearch && fetchNumbers()}
                                        placeholder="e.g. Nashville"
                                        className="w-full text-base font-semibold border-2 border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-violet-500"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">Leave blank to search across the whole state.</p>
                                </div>
                                <div>
                                    <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">State <span className="text-red-400">*</span></label>
                                    <select
                                        value={stateAbbr}
                                        onChange={e => setStateAbbr(e.target.value)}
                                        title="State"
                                        className="w-full text-base border-2 border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-violet-500 appearance-none"
                                    >
                                        <option value="">Select a state…</option>
                                        {US_STATES.map(([abbr, name]) => (
                                            <option key={abbr} value={abbr}>{name} ({abbr})</option>
                                        ))}
                                    </select>
                                </div>
                            </div>
                        )}

                        {searchMode === 'area-code' && (
                            <div>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Area Code (3 digits)</label>
                                <input
                                    type="text"
                                    maxLength={3}
                                    value={areaCode}
                                    onChange={e => setAreaCode(e.target.value.replace(/\D/g, ''))}
                                    onKeyDown={e => e.key === 'Enter' && canSearch && fetchNumbers()}
                                    placeholder="e.g. 615"
                                    className="w-full text-2xl font-black border-2 border-slate-200 dark:border-slate-600 rounded-2xl px-5 py-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-violet-500 tracking-widest"
                                />
                            </div>
                        )}

                        {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

                        <button
                            onClick={fetchNumbers}
                            disabled={loadingNums || !canSearch}
                            className="w-full py-3 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white font-black rounded-2xl transition mt-5 flex items-center justify-center gap-2"
                        >
                            {loadingNums ? <><Loader2 size={16} className="animate-spin" /> Searching…</> : 'Find Available Numbers →'}
                        </button>
                    </>
                )}

                {step === 'pick-number' && (() => {
                    const totalPages  = Math.ceil(numbers.length / PAGE_SIZE);
                    const pageNumbers = numbers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

                    return (
                    <>
                        {/* Header */}
                        <div className="flex items-start justify-between gap-2 mb-1">
                            <h2 className="text-xl font-black text-slate-900 dark:text-white">Pick a Number</h2>
                            {numbers.length > 0 && (
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full shrink-0">
                                    {numbers.length} found
                                </span>
                            )}
                        </div>

                        {/* Results context */}
                        <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                            {numbers.length > 0
                                ? <>Numbers for <span className="font-semibold text-violet-600 dark:text-violet-400">{resolvedSearch}</span>.</>
                                : <>No numbers found for <span className="font-semibold text-violet-600 dark:text-violet-400">{resolvedSearch}</span>.</>
                            }
                        </p>

                        {/* Cross-state fallback notice (city found in a different state) */}
                        {numbers.length > 0 && city && resolvedSearch.includes('(any state)') && (
                            <p className="text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 mb-3">
                                ℹ️ No numbers found in <strong>{city}, {stateAbbr}</strong> — showing numbers for <strong>{city}</strong> in another state instead.
                            </p>
                        )}

                        {/* canExpand: city search returned 0, offer explicit state-wide search */}
                        {canExpand && (
                            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 mb-4 text-center">
                                <p className="text-sm text-amber-700 dark:text-amber-400 font-semibold mb-1">No local numbers found for "{city}"</p>
                                <p className="text-xs text-amber-600 dark:text-amber-500 mb-3">Twilio doesn't have numbers available in that specific city. Would you like to search across all of {stateAbbr}?</p>
                                <button
                                    onClick={() => fetchNumbers(true)}
                                    disabled={loadingNums}
                                    className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl transition flex items-center gap-2 mx-auto"
                                >
                                    {loadingNums ? <><Loader2 size={12} className="animate-spin" /> Searching…</> : `Search all of ${stateAbbr} →`}
                                </button>
                            </div>
                        )}

                        {/* Number list */}
                        {numbers.length > 0 && (
                            <div className="space-y-2 mb-3">
                                {pageNumbers.map(n => {
                                    const cityState = [n.locality, n.region].filter(Boolean).join(', ');
                                    return (
                                        <label
                                            key={n.phoneNumber}
                                            className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition ${selectedNumber === n.phoneNumber ? 'border-violet-500 bg-violet-50 dark:bg-violet-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-violet-300 dark:hover:border-violet-600'}`}
                                        >
                                            <input type="radio" name="number" value={n.phoneNumber} checked={selectedNumber === n.phoneNumber} onChange={() => setSelectedNumber(n.phoneNumber)} className="accent-violet-600 mt-0.5 shrink-0" />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-black text-lg text-slate-900 dark:text-white tracking-wide">{n.friendlyName}</p>
                                                <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold">
                                                    📍 {cityState || `Area code ${areaCode}`}
                                                </span>
                                            </div>
                                            {selectedNumber === n.phoneNumber && (
                                                <CheckCircle size={18} className="text-violet-600 shrink-0" />
                                            )}
                                        </label>
                                    );
                                })}
                            </div>
                        )}

                        {/* Pagination */}
                        {totalPages > 1 && (
                            <div className="flex items-center justify-between mb-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2">
                                <button
                                    onClick={() => { setPage(p => Math.max(0, p - 1)); setSelectedNumber(''); }}
                                    disabled={page === 0}
                                    className="flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-30 transition"
                                >
                                    ← Prev
                                </button>
                                <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                    Page {page + 1} of {totalPages}
                                    <span className="text-slate-400 dark:text-slate-500 ml-1">({numbers.length} total)</span>
                                </span>
                                <button
                                    onClick={() => { setPage(p => Math.min(totalPages - 1, p + 1)); setSelectedNumber(''); }}
                                    disabled={page >= totalPages - 1}
                                    className="flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-violet-600 dark:hover:text-violet-400 disabled:opacity-30 transition"
                                >
                                    Next →
                                </button>
                            </div>
                        )}

                        {/* Sender Name */}
                        {numbers.length > 0 && (
                            <>
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">Sender Name (shown in message headers)</label>
                                <input
                                    type="text"
                                    value={senderName}
                                    onChange={e => setSenderName(e.target.value)}
                                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-violet-500 mb-4"
                                    placeholder="Grace Community Church"
                                />
                            </>
                        )}

                        {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

                        <div className="flex gap-2">
                            <button onClick={() => setStep('search')} className="flex-1 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 transition">← Search Again</button>
                            {numbers.length > 0 && (
                                <button
                                    onClick={provision}
                                    disabled={provisioning || !selectedNumber}
                                    className="flex-1 py-2.5 text-sm font-black bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white rounded-xl transition flex items-center justify-center gap-2"
                                >
                                    {provisioning ? <><Loader2 size={14} className="animate-spin" />Provisioning…</> : 'Claim Number →'}
                                </button>
                            )}
                        </div>
                    </>
                    );
                })()}

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
