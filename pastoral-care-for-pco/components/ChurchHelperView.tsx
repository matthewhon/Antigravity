// ─── ChurchHelperView.tsx ─────────────────────────────────────────────────────
//
// Admin UI for the Church Helper (People Info Update Agent) feature.
// Lives as the "Church Helper" tab inside ToolsView at /tools/church-helper.
//
// Screens:
//   1. Campaign List (default)
//   2. Campaign Create/Edit (inline slide-over style)
//   3. Campaign Detail (sessions table)
//   4. Session Detail Modal (conversation thread)
// ─────────────────────────────────────────────────────────────────────────────

import React, { useState, useEffect, useCallback } from 'react';
import { Church, User } from '../types';
import { pcoService } from '../services/pcoService';

// ─── Types ────────────────────────────────────────────────────────────────────

interface FieldSpec {
    key: string;
    label: string;
}

const FIELD_CATALOG: FieldSpec[] = [
    { key: 'phone_mobile',      label: 'Mobile Phone'      },
    { key: 'phone_home',        label: 'Home Phone'        },
    { key: 'email_primary',     label: 'Primary Email'     },
    { key: 'address_home',      label: 'Home Address'      },
    { key: 'birthdate',         label: 'Birthday'          },
    { key: 'anniversary',       label: 'Anniversary'       },
    { key: 'marital_status',    label: 'Marital Status'    },
    { key: 'gender',            label: 'Gender'            },
    { key: 'graduation_year',   label: 'Graduation Year'   },
    { key: 'school',            label: 'School'            },
    { key: 'membership',        label: 'Membership Type'   },
    { key: 'emergency_contact', label: 'Emergency Contact' },
];

interface InfoCampaign {
    id: string;
    name: string;
    churchId: string;
    pcoListId: string;
    pcoListName?: string;
    status: 'active' | 'paused' | 'complete' | 'draft';
    fieldsToCollect: FieldSpec[];
    channels: { sms: boolean; email: boolean; smsNumberId?: string };
    schedule: { intervalDays: number; maxAttempts: number; sendWindowStart: string; sendWindowEnd: string };
    messaging?: { introMessage?: string };
    stats: { total: number; pending: number; inProgress: number; complete: number; maxAttempts: number };
    createdAt: number;
}

interface InfoSession {
    id: string;
    campaignId: string;
    churchId: string;
    pcoPersonId: string;
    personName: string;
    phoneE164?: string;
    emailAddress?: string;
    status: 'pending' | 'in_progress' | 'complete' | 'max_attempts' | 'failed';
    attemptCount: number;
    lastContactedAt?: number;
    remainingFields: string[];
    collectedData: Record<string, string>;
    conversationHistory: { role: string; text: string; channel: string; ts: number }[];
    pcoWriteResult?: { success: boolean; errors: string[] };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const STATUS_CONFIG: Record<string, { label: string; color: string; dot: string }> = {
    active:       { label: 'Active',       color: 'text-emerald-700 bg-emerald-50 dark:bg-emerald-900/30 dark:text-emerald-400', dot: 'bg-emerald-500' },
    paused:       { label: 'Paused',       color: 'text-amber-700 bg-amber-50 dark:bg-amber-900/30 dark:text-amber-400',       dot: 'bg-amber-400'   },
    complete:     { label: 'Complete',     color: 'text-slate-600 bg-slate-100 dark:bg-slate-700 dark:text-slate-300',          dot: 'bg-slate-400'   },
    draft:        { label: 'Draft',        color: 'text-slate-500 bg-slate-100 dark:bg-slate-700 dark:text-slate-400',          dot: 'bg-slate-400'   },
    pending:      { label: 'Pending',      color: 'text-sky-700 bg-sky-50 dark:bg-sky-900/30 dark:text-sky-400',                dot: 'bg-sky-400'     },
    in_progress:  { label: 'In Progress',  color: 'text-blue-700 bg-blue-50 dark:bg-blue-900/30 dark:text-blue-400',            dot: 'bg-blue-400'    },
    max_attempts: { label: 'Max Attempts', color: 'text-orange-700 bg-orange-50 dark:bg-orange-900/30 dark:text-orange-400',    dot: 'bg-orange-400'  },
    failed:       { label: 'Failed',       color: 'text-red-700 bg-red-50 dark:bg-red-900/30 dark:text-red-400',                dot: 'bg-red-400'     },
};

function StatusBadge({ status }: { status: string }) {
    const cfg = STATUS_CONFIG[status] || { label: status, color: 'text-slate-500 bg-slate-100', dot: 'bg-slate-400' };
    return (
        <span className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-xs font-semibold ${cfg.color}`}>
            <span className={`w-1.5 h-1.5 rounded-full ${cfg.dot}`} />
            {cfg.label}
        </span>
    );
}

function ProgressBar({ total, complete }: { total: number; complete: number }) {
    const pct = total > 0 ? Math.round((complete / total) * 100) : 0;
    return (
        <div className="flex items-center gap-2">
            <div className="flex-1 h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                <div
                    className="h-full bg-emerald-500 rounded-full transition-all duration-500"
                    style={{ width: `${pct}%` }}
                />
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 shrink-0">{complete}/{total}</span>
        </div>
    );
}

function timeAgo(ts: number | null | undefined): string {
    if (!ts) return '—';
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return `${Math.floor(diff / 86_400_000)}d ago`;
}

// ─── Session Detail Modal ─────────────────────────────────────────────────────

function SessionDetailModal({ session, onClose, onRetry }: {
    session: InfoSession;
    onClose: () => void;
    onRetry: (id: string) => void;
}) {
    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] flex flex-col overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-slate-700">
                    <div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-0.5">Session</p>
                        <h2 className="font-bold text-slate-900 dark:text-white text-lg">{session.personName}</h2>
                    </div>
                    <div className="flex items-center gap-3">
                        <StatusBadge status={session.status} />
                        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200">
                            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                        </button>
                    </div>
                </div>

                {/* Conversation Thread */}
                <div className="flex-1 overflow-y-auto p-5 space-y-3">
                    {session.conversationHistory.length === 0 ? (
                        <p className="text-sm text-slate-500 dark:text-slate-400 text-center py-8">No messages yet</p>
                    ) : (
                        session.conversationHistory.map((msg, i) => (
                            <div key={i} className={`flex ${msg.role === 'agent' ? 'justify-start' : 'justify-end'}`}>
                                <div className={`max-w-xs px-4 py-2.5 rounded-2xl text-sm ${
                                    msg.role === 'agent'
                                        ? 'bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 rounded-tl-sm'
                                        : 'bg-emerald-600 text-white rounded-tr-sm'
                                }`}>
                                    <p className="leading-relaxed">{msg.text}</p>
                                    <p className={`text-xs mt-1 ${msg.role === 'agent' ? 'text-slate-400' : 'text-emerald-200'}`}>
                                        {msg.channel?.toUpperCase()} · {timeAgo(msg.ts)}
                                    </p>
                                </div>
                            </div>
                        ))
                    )}
                </div>

                {/* Collected Data & Actions */}
                <div className="p-5 border-t border-slate-200 dark:border-slate-700 space-y-4">
                    {Object.keys(session.collectedData).length > 0 && (
                        <div>
                            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-2">Collected Data</p>
                            <div className="grid grid-cols-2 gap-1.5">
                                {Object.entries(session.collectedData).map(([key, val]) => (
                                    <div key={key} className="bg-slate-50 dark:bg-slate-800 rounded-lg p-2 text-xs">
                                        <p className="text-slate-500 dark:text-slate-400 capitalize">{key.replace(/_/g, ' ')}</p>
                                        <p className="font-medium text-slate-800 dark:text-slate-200 truncate">{val}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                    {session.pcoWriteResult && (
                        <div className={`text-xs px-3 py-2 rounded-lg ${session.pcoWriteResult.success ? 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400'}`}>
                            <span className="font-semibold">PCO Write:</span> {session.pcoWriteResult.success ? 'Success' : session.pcoWriteResult.errors.join(', ')}
                        </div>
                    )}
                    {(session.status === 'max_attempts' || session.status === 'failed') && (
                        <button
                            onClick={() => { onRetry(session.id); onClose(); }}
                            className="w-full py-2 px-4 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition"
                        >
                            Retry Outreach
                        </button>
                    )}
                </div>
            </div>
        </div>
    );
}

// ─── Campaign Form ────────────────────────────────────────────────────────────

interface CampaignFormProps {
    churchId: string;
    church?: Church | null;
    existing?: InfoCampaign | null;
    onSave: (data: Partial<InfoCampaign>) => void;
    onCancel: () => void;
}

function CampaignForm({ churchId, church, existing, onSave, onCancel }: CampaignFormProps) {
    const [name, setName] = useState(existing?.name || '');
    const [pcoListId, setPcoListId] = useState(existing?.pcoListId || '');
    const [pcoListName, setPcoListName] = useState(existing?.pcoListName || '');
    const [selectedFields, setSelectedFields] = useState<string[]>(existing?.fieldsToCollect.map(f => f.key) || ['phone_mobile', 'email_primary', 'address_home']);
    const [smsEnabled, setSmsEnabled] = useState(existing?.channels?.sms ?? true);
    const [emailEnabled, setEmailEnabled] = useState(existing?.channels?.email ?? true);
    const [intervalDays, setIntervalDays] = useState(existing?.schedule?.intervalDays ?? 3);
    const [maxAttempts, setMaxAttempts] = useState(existing?.schedule?.maxAttempts ?? 3);
    const [sendWindowStart, setSendWindowStart] = useState(existing?.schedule?.sendWindowStart || '09:00');
    const [sendWindowEnd, setSendWindowEnd] = useState(existing?.schedule?.sendWindowEnd || '21:00');
    const [introMessage, setIntroMessage] = useState(existing?.messaging?.introMessage || '');
    const [pcoLists, setPcoLists] = useState<any[]>([]);
    const [listsLoading, setListsLoading] = useState(false);

    useEffect(() => {
        const loadLists = async () => {
            setListsLoading(true);
            try {
                const data = await pcoService.getPeopleLists(churchId);
                setPcoLists(data || []);
            } catch { setPcoLists([]); }
            setListsLoading(false);
        };
        loadLists();
    }, [churchId]);

    const toggleField = (key: string) => {
        setSelectedFields(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    const handleSave = (status: 'active' | 'draft') => {
        const list = pcoLists.find(l => l.id === pcoListId);
        onSave({
            name,
            pcoListId,
            pcoListName: list?.attributes?.name || pcoListName,
            status,
            fieldsToCollect: FIELD_CATALOG.filter(f => selectedFields.includes(f.key)),
            channels: { sms: smsEnabled, email: emailEnabled },
            schedule: { intervalDays, maxAttempts, sendWindowStart, sendWindowEnd },
            messaging: introMessage ? { introMessage } : undefined,
        });
    };

    const FIELD_GROUPS = [
        { title: 'Contact Info', keys: ['phone_mobile', 'phone_home', 'email_primary', 'address_home'] },
        { title: 'Personal Info', keys: ['birthdate', 'anniversary', 'marital_status', 'gender', 'graduation_year', 'school', 'membership'] },
        { title: 'Custom Fields', keys: ['emergency_contact'] },
    ];

    return (
        <div className="p-6 max-w-2xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
                <div>
                    <h2 className="text-xl font-bold text-slate-900 dark:text-white">{existing ? 'Edit Campaign' : 'New Campaign'}</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Configure outreach to collect and update PCO directory info</p>
                </div>
                <button onClick={onCancel} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-2">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
            </div>

            {/* Name */}
            <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Campaign Name</label>
                <input
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="e.g. Spring 2025 Directory Update"
                    className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
            </div>

            {/* PCO List */}
            <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">PCO List</label>
                {listsLoading ? (
                    <div className="text-sm text-slate-400 py-2">Loading lists…</div>
                ) : (
                    <select
                        value={pcoListId}
                        onChange={e => setPcoListId(e.target.value)}
                        className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                    >
                        <option value="">Select a PCO list…</option>
                        {pcoLists.map((l: any) => (
                            <option key={l.id} value={l.id}>{l.attributes?.name || l.id}</option>
                        ))}
                    </select>
                )}
                <p className="text-xs text-slate-400">All people in this list will be contacted. One list per campaign.</p>
            </div>

            {/* Field Picker */}
            <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Fields to Collect</label>
                <div className="space-y-4">
                    {FIELD_GROUPS.map(group => (
                        <div key={group.title}>
                            <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mb-2">{group.title}</p>
                            <div className="grid grid-cols-2 gap-2">
                                {FIELD_CATALOG.filter(f => group.keys.includes(f.key)).map(field => (
                                    <label key={field.key} className={`flex items-center gap-2.5 p-2.5 rounded-xl border cursor-pointer transition ${
                                        selectedFields.includes(field.key)
                                            ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20'
                                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300 dark:hover:border-slate-600'
                                    }`}>
                                        <input
                                            type="checkbox"
                                            checked={selectedFields.includes(field.key)}
                                            onChange={() => toggleField(field.key)}
                                            className="rounded text-emerald-600 focus:ring-emerald-500"
                                        />
                                        <span className={`text-sm ${selectedFields.includes(field.key) ? 'text-emerald-700 dark:text-emerald-400 font-medium' : 'text-slate-700 dark:text-slate-300'}`}>
                                            {field.label}
                                        </span>
                                    </label>
                                ))}
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Channel toggles */}
            <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Outreach Channels</label>
                <div className="flex gap-3">
                    <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition ${smsEnabled ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                        <input type="checkbox" checked={smsEnabled} onChange={e => setSmsEnabled(e.target.checked)} className="rounded text-emerald-600" />
                        <span className="text-sm font-medium">📱 SMS</span>
                    </label>
                    <label className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border cursor-pointer transition ${emailEnabled ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400'}`}>
                        <input type="checkbox" checked={emailEnabled} onChange={e => setEmailEnabled(e.target.checked)} className="rounded text-emerald-600" />
                        <span className="text-sm font-medium">✉️ Email</span>
                    </label>
                </div>
            </div>

            {/* Schedule */}
            <div className="space-y-3">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Retry Schedule</label>
                <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Retry after</p>
                        <div className="flex items-center gap-1.5">
                            <input
                                type="number" min={1} max={30}
                                value={intervalDays}
                                onChange={e => setIntervalDays(Number(e.target.value))}
                                className="w-16 px-2 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                            />
                            <span className="text-sm text-slate-500">days</span>
                        </div>
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Max attempts</p>
                        <input
                            type="number" min={1} max={10}
                            value={maxAttempts}
                            onChange={e => setMaxAttempts(Number(e.target.value))}
                            className="w-16 px-2 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>
                    <div className="space-y-1">
                        <p className="text-xs text-slate-500 dark:text-slate-400">Send window</p>
                        <div className="flex items-center gap-1 text-xs text-slate-600 dark:text-slate-400">
                            <input type="time" value={sendWindowStart} onChange={e => setSendWindowStart(e.target.value)} className="border border-slate-300 dark:border-slate-600 rounded-lg px-1.5 py-1.5 bg-white dark:bg-slate-800 text-xs" />
                            <span>–</span>
                            <input type="time" value={sendWindowEnd} onChange={e => setSendWindowEnd(e.target.value)} className="border border-slate-300 dark:border-slate-600 rounded-lg px-1.5 py-1.5 bg-white dark:bg-slate-800 text-xs" />
                        </div>
                    </div>
                </div>
            </div>

            {/* Intro message override */}
            <div className="space-y-1.5">
                <label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Custom Intro Message <span className="font-normal text-slate-400">(optional)</span></label>
                <textarea
                    value={introMessage}
                    onChange={e => setIntroMessage(e.target.value)}
                    rows={3}
                    placeholder="Hi {{name}}! This is [Church Name]. We're updating our directory and would love to confirm a few things…"
                    className="w-full px-3.5 py-2.5 border border-slate-300 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-800 text-sm text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none"
                />
                <p className="text-xs text-slate-400">Use {'{{name}}'} as a placeholder for the person's first name.</p>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
                <button
                    onClick={() => handleSave('active')}
                    disabled={!name || !pcoListId || selectedFields.length === 0}
                    className="flex-1 py-2.5 px-4 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-semibold rounded-xl transition"
                >
                    ✨ Save & Activate
                </button>
                <button
                    onClick={() => handleSave('draft')}
                    disabled={!name}
                    className="py-2.5 px-4 border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 text-sm font-semibold rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800 transition disabled:opacity-50"
                >
                    Save Draft
                </button>
                <button
                    onClick={onCancel}
                    className="py-2.5 px-4 text-slate-500 dark:text-slate-400 text-sm font-semibold rounded-xl hover:text-slate-700 dark:hover:text-slate-200 transition"
                >
                    Cancel
                </button>
            </div>
        </div>
    );
}

// ─── Campaign Detail (Sessions table) ─────────────────────────────────────────

function CampaignDetail({ campaign, onBack }: { campaign: InfoCampaign; onBack: () => void }) {
    const [sessions, setSessions] = useState<InfoSession[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedSession, setSelectedSession] = useState<InfoSession | null>(null);

    const loadSessions = useCallback(async () => {
        try {
            const res = await fetch(`/api/info-update-sessions?campaignId=${campaign.id}`);
            const data = await res.json();
            setSessions(Array.isArray(data) ? data : []);
        } catch { setSessions([]); }
        setLoading(false);
    }, [campaign.id]);

    useEffect(() => { loadSessions(); }, [loadSessions]);

    const handleRetry = async (sessionId: string) => {
        try {
            await fetch(`/api/info-update-sessions/${sessionId}/retry`, { method: 'POST' });
            await loadSessions();
        } catch { /* ignore */ }
    };

    const stats = campaign.stats;
    const pct = stats.total > 0 ? Math.round((stats.complete / stats.total) * 100) : 0;

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <button onClick={onBack} className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400 hover:underline mb-3">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" /></svg>
                    All Campaigns
                </button>
                <div className="flex items-start justify-between">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white">{campaign.name}</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">PCO list · {campaign.pcoListName || campaign.pcoListId}</p>
                    </div>
                    <StatusBadge status={campaign.status} />
                </div>
                {/* Stats cards */}
                <div className="mt-4 grid grid-cols-5 gap-3">
                    {[
                        { label: 'Total',       value: stats.total,       color: 'text-slate-700 dark:text-slate-300'    },
                        { label: 'Complete',    value: stats.complete,    color: 'text-emerald-600 dark:text-emerald-400' },
                        { label: 'In Progress', value: stats.inProgress,  color: 'text-blue-600 dark:text-blue-400'       },
                        { label: 'Pending',     value: stats.pending,     color: 'text-sky-600 dark:text-sky-400'         },
                        { label: 'Max Attempts',value: stats.maxAttempts, color: 'text-orange-600 dark:text-orange-400'   },
                    ].map(s => (
                        <div key={s.label} className="bg-slate-50 dark:bg-slate-800 rounded-xl p-3 text-center">
                            <p className={`text-2xl font-bold ${s.color}`}>{s.value}</p>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{s.label}</p>
                        </div>
                    ))}
                </div>
                <div className="mt-3">
                    <div className="flex justify-between text-xs text-slate-500 dark:text-slate-400 mb-1">
                        <span>Progress</span><span>{pct}%</span>
                    </div>
                    <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                        <div className="h-full bg-emerald-500 rounded-full transition-all duration-700" style={{ width: `${pct}%` }} />
                    </div>
                </div>
            </div>

            {/* Sessions table */}
            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-16 text-slate-400">
                        <svg className="w-6 h-6 animate-spin mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        Loading sessions…
                    </div>
                ) : sessions.length === 0 ? (
                    <div className="py-16 text-center text-slate-400 dark:text-slate-500">
                        <p className="text-lg font-semibold mb-1">No sessions yet</p>
                        <p className="text-sm">The scheduler will create sessions on its next tick.</p>
                    </div>
                ) : (
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50">
                                <th className="text-left px-6 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Person</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Status</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Attempts</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Last Contact</th>
                                <th className="text-left px-4 py-3 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Remaining</th>
                                <th className="text-right px-6 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {sessions.map(session => (
                                <tr key={session.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition">
                                    <td className="px-6 py-4">
                                        <p className="font-semibold text-slate-900 dark:text-white">{session.personName}</p>
                                        <p className="text-xs text-slate-400 mt-0.5">{session.phoneE164 || session.emailAddress || '—'}</p>
                                    </td>
                                    <td className="px-4 py-4"><StatusBadge status={session.status} /></td>
                                    <td className="px-4 py-4 text-slate-600 dark:text-slate-400">{session.attemptCount}</td>
                                    <td className="px-4 py-4 text-slate-500 dark:text-slate-400">{timeAgo(session.lastContactedAt)}</td>
                                    <td className="px-4 py-4">
                                        {session.remainingFields.length === 0 ? (
                                            <span className="text-emerald-600 dark:text-emerald-400 text-xs font-medium">✓ All collected</span>
                                        ) : (
                                            <span className="text-xs text-slate-500 dark:text-slate-400">
                                                {session.remainingFields.slice(0,3).join(', ')}{session.remainingFields.length > 3 ? ` +${session.remainingFields.length - 3}` : ''}
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-6 py-4 text-right">
                                        <button
                                            onClick={() => setSelectedSession(session)}
                                            className="text-sm font-medium text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300 transition"
                                        >
                                            View
                                        </button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                )}
            </div>

            {selectedSession && (
                <SessionDetailModal
                    session={selectedSession}
                    onClose={() => setSelectedSession(null)}
                    onRetry={handleRetry}
                />
            )}
        </div>
    );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export function ChurchHelperView({ churchId, church, currentUser }: {
    churchId: string;
    church?: Church | null;
    currentUser?: User | null;
}) {
    const [campaigns, setCampaigns] = useState<InfoCampaign[]>([]);
    const [loading, setLoading] = useState(true);
    const [showForm, setShowForm] = useState(false);
    const [editingCampaign, setEditingCampaign] = useState<InfoCampaign | null>(null);
    const [selectedCampaign, setSelectedCampaign] = useState<InfoCampaign | null>(null);

    const loadCampaigns = useCallback(async () => {
        try {
            const res = await fetch(`/api/info-update-campaigns?churchId=${churchId}`);
            const data = await res.json();
            setCampaigns(Array.isArray(data) ? data : []);
        } catch { setCampaigns([]); }
        setLoading(false);
    }, [churchId]);

    useEffect(() => { loadCampaigns(); }, [loadCampaigns]);

    const handleSaveCampaign = async (formData: Partial<InfoCampaign>) => {
        try {
            if (editingCampaign) {
                await fetch(`/api/info-update-campaigns/${editingCampaign.id}`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(formData),
                });
            } else {
                await fetch('/api/info-update-campaigns', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...formData, churchId }),
                });
            }
            setShowForm(false);
            setEditingCampaign(null);
            await loadCampaigns();
        } catch (e) { console.error('Failed to save campaign', e); }
    };

    const handlePauseResume = async (campaign: InfoCampaign, e: React.MouseEvent) => {
        e.stopPropagation();
        const newStatus = campaign.status === 'active' ? 'paused' : 'active';
        await fetch(`/api/info-update-campaigns/${campaign.id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: newStatus }),
        });
        await loadCampaigns();
    };

    const handleDelete = async (campaign: InfoCampaign, e: React.MouseEvent) => {
        e.stopPropagation();
        if (!window.confirm(`Delete "${campaign.name}"? This cannot be undone.`)) return;
        await fetch(`/api/info-update-campaigns/${campaign.id}`, { method: 'DELETE' });
        await loadCampaigns();
    };

    // Show detail view
    if (selectedCampaign) {
        return (
            <CampaignDetail
                campaign={selectedCampaign}
                onBack={() => setSelectedCampaign(null)}
            />
        );
    }

    // Show form
    if (showForm || editingCampaign) {
        return (
            <CampaignForm
                churchId={churchId}
                church={church}
                existing={editingCampaign}
                onSave={handleSaveCampaign}
                onCancel={() => { setShowForm(false); setEditingCampaign(null); }}
            />
        );
    }

    // Campaign list
    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900">
                <div className="flex items-center justify-between">
                    <div>
                        <div className="flex items-center gap-2 mb-1">
                            <span className="text-2xl">✨</span>
                            <h1 className="text-xl font-bold text-slate-900 dark:text-white">Church Helper</h1>
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400">
                            Automated outreach to keep your PCO directory up to date — via SMS and email
                        </p>
                    </div>
                    <button
                        onClick={() => setShowForm(true)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition shadow-sm"
                    >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                        New Campaign
                    </button>
                </div>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto">
                {loading ? (
                    <div className="flex items-center justify-center py-20 text-slate-400">
                        <svg className="w-6 h-6 animate-spin mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/></svg>
                        Loading campaigns…
                    </div>
                ) : campaigns.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-24 px-6 text-center">
                        <div className="text-6xl mb-4">📋</div>
                        <h2 className="text-lg font-bold text-slate-800 dark:text-white mb-2">No campaigns yet</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 max-w-sm mb-6">
                            Create your first Church Helper campaign to start collecting updated contact info from your PCO members automatically.
                        </p>
                        <button
                            onClick={() => setShowForm(true)}
                            className="flex items-center gap-2 px-5 py-3 bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-semibold rounded-xl transition"
                        >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>
                            Create your first campaign
                        </button>
                    </div>
                ) : (
                    <div className="p-6 space-y-4">
                        {campaigns.map(campaign => (
                            <div
                                key={campaign.id}
                                onClick={() => setSelectedCampaign(campaign)}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 cursor-pointer hover:shadow-md hover:border-emerald-300 dark:hover:border-emerald-600 transition group"
                            >
                                <div className="flex items-start justify-between mb-3">
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 mb-1">
                                            <h3 className="font-bold text-slate-900 dark:text-white truncate group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition">{campaign.name}</h3>
                                            <StatusBadge status={campaign.status} />
                                        </div>
                                        <p className="text-sm text-slate-500 dark:text-slate-400">
                                            {campaign.fieldsToCollect.map(f => f.label).join(', ')}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-2 ml-4" onClick={e => e.stopPropagation()}>
                                        <button
                                            onClick={(e) => handlePauseResume(campaign, e)}
                                            className="text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition font-medium"
                                        >
                                            {campaign.status === 'active' ? 'Pause' : 'Resume'}
                                        </button>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setEditingCampaign(campaign); }}
                                            className="text-xs px-3 py-1.5 border border-slate-200 dark:border-slate-600 rounded-lg text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700 transition font-medium"
                                        >
                                            Edit
                                        </button>
                                        <button
                                            onClick={(e) => handleDelete(campaign, e)}
                                            className="text-xs px-3 py-1.5 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition font-medium"
                                        >
                                            Delete
                                        </button>
                                    </div>
                                </div>
                                <ProgressBar total={campaign.stats.total} complete={campaign.stats.complete} />
                                <div className="flex items-center gap-4 mt-2 text-xs text-slate-400 dark:text-slate-500">
                                    <span>📱 {campaign.channels?.sms ? 'SMS' : '—'}{campaign.channels?.email ? ' · ✉️ Email' : ''}</span>
                                    <span>↻ Every {campaign.schedule?.intervalDays ?? 3}d · max {campaign.schedule?.maxAttempts ?? 3} attempts</span>
                                    <span className="ml-auto">{campaign.stats.complete}/{campaign.stats.total} complete</span>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}

export default ChurchHelperView;
