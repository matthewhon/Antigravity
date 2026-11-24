import React, { useState, useEffect, useRef } from 'react';
import { db as firebaseDb, storage } from '../../services/firebase';
import { ref as storageRef, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import {
    collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
    query, where, orderBy, limit, getDocs, setDoc
} from 'firebase/firestore';
import { pcoService } from '../../services/pcoService';
import {
    SmsKeyword, SmsWorkflow, SmsWorkflowStep, SmsWorkflowEnrollment, SmsTag,
    WorkflowChannelType, WorkflowNode, WorkflowActionNode, WorkflowDelayNode,
    WorkflowBranchNode, TwilioPhoneNumber
} from '../../types';
import {
    MessageSquare, Users, Plus, ArrowLeft, Trash2, Pencil, ChevronDown,
    CheckCircle, Circle, Loader2, X, Calendar, Clock, RefreshCw, Settings,
    AlertTriangle, Zap, MessageCircle, Smile, Image as ImageIcon, Sparkles,
    ChevronRight, RotateCcw, Mail, Tag, Upload, GitBranch, Info, ListPlus,
    Play, Beaker, Hand, ClipboardList, Cake, Gem, Ticket, Lightbulb,
    User as UserIcon, CircleCheck, Ban, Megaphone, Bell, Target, CalendarDays,
    MailOpen, StickyNote, Timer, CalendarClock, Cog
} from 'lucide-react';
import { ToolPage, ToolHeader, ToolButton, ToolEmptyState } from '../tool-shell';
import { useTwilioNumbers } from './NumberManager';
import { formatPhone } from './smsUtils';
import {
    compressSmsImage, ALL_MERGE_TAGS, COMMON_EMOJIS, countSegments,
    AiWorkflowDraft, AiBuilderContext, generateWorkflowWithAi,
    generateWorkflowFromContext, timeAgo
} from './smsHelpers';

const API_BASE = '';

// ---- tiny uuid (no dep) ----
function uid(): string {
    return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

// Channel metadata
const CHANNEL_CONFIG: Record<WorkflowChannelType, { label: string; icon: React.ReactNode; color: string; badge: string }> = {
    sms: { label: 'SMS', icon: <MessageSquare size={13} />, color: 'bg-violet-600 text-white hover:bg-violet-700', badge: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300' },
    mms: { label: 'MMS', icon: <ImageIcon size={13} />, color: 'bg-blue-600 text-white hover:bg-blue-700', badge: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300' },
    email: { label: 'Email', icon: <Mail size={13} />, color: 'bg-emerald-600 text-white hover:bg-emerald-700', badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300' },
    staff_sms: { label: 'Staff SMS', icon: <Users size={13} />, color: 'bg-amber-500 text-white hover:bg-amber-600', badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300' },
    staff_email: { label: 'Staff Email', icon: <Mail size={13} />, color: 'bg-rose-500 text-white hover:bg-rose-600', badge: 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300' },
};

// --- Staff Step Editor (extracted to avoid hooks-in-IIFE violation) ---------

const StaffStepEditor: React.FC<{
    step: WorkflowActionNode;
    onChange: (patch: Partial<WorkflowActionNode>) => void;
    pcoLists: { id: string; name: string }[];
    pcoGroups: { id: string; name: string }[];
}> = ({ step, onChange, pcoLists, pcoGroups }) => {
    const isEmail = step.channelType === 'staff_email';
    const targetType = step.staffTargetType ?? 'individuals';
    const recipients = step.staffRecipients ?? [];
    const [addName, setAddName] = useState('');
    const [addContact, setAddContact] = useState('');

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [showEmojis, setShowEmojis] = useState(false);

    const insertAtCursor = (text: string, field: 'message' | 'emailBody' = isEmail ? 'emailBody' : 'message') => {
        const el = textareaRef.current;
        const currentVal = (step[field] as string) || '';
        if (!el) {
            onChange({ [field]: currentVal + text });
            return;
        }
        const start = el.selectionStart ?? currentVal.length;
        const end = el.selectionEnd ?? start;
        const before = currentVal.slice(0, start);
        const after = currentVal.slice(end);
        const newVal = before + text + after;
        onChange({ [field]: newVal });
        requestAnimationFrame(() => {
            el.focus();
            const pos = start + text.length;
            el.setSelectionRange(pos, pos);
        });
    };

    const addRecipient = () => {
        if (!addName.trim() && !addContact.trim()) return;
        const rec = isEmail
            ? { name: addName.trim() || addContact.trim(), email: addContact.trim() }
            : { name: addName.trim() || addContact.trim(), phone: addContact.trim() };
        onChange({ staffRecipients: [...recipients, rec] });
        setAddName(''); setAddContact('');
    };

    return (
        <div className={`space-y-3 p-4 rounded-2xl border ${isEmail ? 'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-800' : 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-800'}`}>
            {/* Info */}
            <div className={`flex items-start gap-2 text-xs ${isEmail ? 'text-rose-700 dark:text-rose-300' : 'text-amber-700 dark:text-amber-300'}`}>
                <Users size={13} className='mt-0.5 shrink-0' />
                <span><strong>Internal step</strong> — notifies <strong>staff</strong> only. Use contact (e.g. {'{contact.firstName}'}) and church (e.g. {'{church.name}'}) tags.</span>
            </div>
            {/* Who to notify */}
            <div>
                <p className='text-[10px] font-black uppercase tracking-wide text-slate-400 mb-1.5'>Notify</p>
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
                        <button type='button' title='Add recipient' onClick={addRecipient} className={`px-3 py-2 rounded-xl text-white text-xs font-bold ${isEmail ? 'bg-rose-500 hover:bg-rose-600' : 'bg-amber-500 hover:bg-amber-600'}`}><Plus size={13} /></button>
                    </div>
                    {recipients.length === 0 && <p className='text-[10px] text-slate-400 text-center'>No recipients — add at least one.</p>}
                </div>
            )}
            {/* PCO List */}
            {targetType === 'list' && (
                <div>
                    <label className='block text-[10px] font-black uppercase tracking-wide text-slate-400 mb-1.5'>PCO List</label>
                    <select value={step.staffListId || ''} onChange={e => { const l = pcoLists.find(x => x.id === e.target.value); onChange({ staffListId: e.target.value || null, staffListName: l?.name || null }); }} title='Staff PCO list' className='w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-900 dark:text-white'>
                        <option value=''>- Select a list -</option>
                        {pcoLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                    </select>
                    <p className='text-[10px] text-slate-400 mt-1'>All members with a valid {isEmail ? 'email' : 'phone'} are notified.</p>
                </div>
            )}
            {/* PCO Group */}
            {targetType === 'group' && (
                <div>
                    <label className='block text-[10px] font-black uppercase tracking-wide text-slate-400 mb-1.5'>PCO Group</label>
                    <select value={step.staffGroupId || ''} onChange={e => { const g = pcoGroups.find(x => x.id === e.target.value); onChange({ staffGroupId: e.target.value || null, staffGroupName: g?.name || null }); }} title='Staff PCO group' className='w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-amber-400 text-slate-900 dark:text-white'>
                        <option value=''>- Select a group -</option>
                        {pcoGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                    </select>
                    <p className='text-[10px] text-slate-400 mt-1'>All members with a valid {isEmail ? 'email' : 'phone'} are notified.</p>
                </div>
            )}
            {/* Content */}
            {isEmail ? (
                <div className='space-y-2'>
                    <input type='text' value={step.emailSubject || ''} onChange={e => onChange({ emailSubject: e.target.value })} placeholder='Subject: Action needed - {contact.firstName} is at Step 3' className='w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-400' />
                    <textarea ref={textareaRef} rows={5} value={step.emailBody || ''} onChange={e => onChange({ emailBody: e.target.value })} placeholder={'Hi team,\nJust a heads-up: {contact.firstName} ({contact.phone}) is progressing through the workflow.'} className='w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-rose-400 resize-none' />
                </div>
            ) : (
                <textarea ref={textareaRef} rows={3} value={step.message} onChange={e => onChange({ message: e.target.value })} placeholder='FYI: {contact.firstName} ({contact.phone}) just hit this workflow step. Please reach out!' className='w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 resize-none' />
            )}
            {/* Contact merge tags & Emoji picker */}
            <div className='flex gap-1.5 flex-wrap items-center'>
                <div className="relative">
                    <button
                        type="button"
                        title="Insert emoji"
                        onClick={() => setShowEmojis(v => !v)}
                        className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-lg border transition ${isEmail ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 border-rose-200 hover:bg-rose-100' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
                    >
                        <Smile size={12} /> Emoji
                    </button>
                    {showEmojis && (
                        <div className="absolute left-0 bottom-full mb-1 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl flex gap-1.5 z-20 flex-wrap max-w-[200px]">
                            {COMMON_EMOJIS.map(em => (
                                <button key={em} type="button" onClick={() => { insertAtCursor(em); setShowEmojis(false); }}
                                    className="text-base hover:scale-125 transition p-1 cursor-pointer"
                                >{em}</button>
                            ))}
                        </div>
                    )}
                </div>
                {['{contact.firstName}', '{contact.lastName}', '{contact.name}', '{contact.phone}', '{contact.email}', '{church.name}', '{church.phone}', '{church.address}', '{church.website}'].map(t => (
                    <button key={t} type='button' onClick={() => insertAtCursor(t)}
                        className={`px-2 py-0.5 text-[10px] font-mono font-semibold rounded-lg border transition ${isEmail ? 'bg-rose-50 dark:bg-rose-900/20 text-rose-700 border-rose-200 hover:bg-rose-100' : 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 border-amber-200 hover:bg-amber-100'}`}
                    >{t}</button>
                ))}
            </div>
        </div>
    );
};

// --- Step timing helpers -----------------------------------------------------

/** Convert HH:MM (24-hour) -> H:MM AM/PM */
function fmt12(hhmm: string): string {
    const [h, m] = hhmm.split(':').map(Number);
    const ampm = h < 12 ? 'AM' : 'PM';
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

const DOW_LABELS_LONG = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DOW_LABELS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const ORDINAL_SUFFIX = (n: number) => n === 1 ? 'st' : n === 2 ? 'nd' : n === 3 ? 'rd' : 'th';

/** Human-readable timing label used in the delay connector between nodes. */
function stepTimingLabel(node: WorkflowDelayNode): string {
    const sType = node.scheduleType ?? 'relative';
    const repeat = node.repeatType && node.repeatType !== 'none';

    if (sType === 'day_of_week') {
        const day = DOW_LABELS_LONG[node.scheduleDayOfWeek ?? 1];
        const time = node.scheduleTime ? ` at ${fmt12(node.scheduleTime)}` : '';
        if (repeat && node.repeatType === 'weekly' && (node.repeatDays?.length ?? 0) > 0) {
            const days = node.repeatDays!.map(d => DOW_LABELS_SHORT[d]).join(', ');
            return `every ${days}${time}`;
        }
        return `next ${day}${time}`;
    }
    if (sType === 'specific_date') {
        const d = node.scheduleDate || 'No date set';
        const time = node.scheduleTime ? ` at ${fmt12(node.scheduleTime)}` : '';
        return `on ${d}${time}`;
    }
    if (sType === 'day_of_month') {
        const d = node.scheduleDayOfMonth ?? 1;
        const time = node.scheduleTime ? ` at ${fmt12(node.scheduleTime)}` : '';
        if (repeat && node.repeatType === 'monthly' && (node.repeatDays?.length ?? 0) > 0) {
            const dates = node.repeatDays!.map(v => `${v}${ORDINAL_SUFFIX(v)}`).join(', ');
            return `every month on the ${dates}${time}`;
        }
        return `on the ${d}${ORDINAL_SUFFIX(d)}${time}`;
    }
    // relative
    if (repeat && node.repeatType === 'weekly' && (node.repeatDays?.length ?? 0) > 0) {
        const days = node.repeatDays!.map(d => DOW_LABELS_SHORT[d]).join(', ');
        const time = node.scheduleTime ? ` at ${fmt12(node.scheduleTime)}` : '';
        return `every ${days}${time}`;
    }
    const days = node.delayDays || 0;
    const hours = node.delayHours || 0;
    const time = node.scheduleTime ? ` at ${fmt12(node.scheduleTime)}` : '';
    if (days === 0 && hours === 0) return `immediately${time}`;
    const parts = [];
    if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
    if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
    return `after ${parts.join(' and ')}${time}`;
}

// --- Delay Node Card ----------------------------------------------------------

const DelayNodeCard: React.FC<{
    node: WorkflowDelayNode;
    onChange: (patch: Partial<WorkflowDelayNode>) => void;
    onDelete: () => void;
}> = ({ node, onChange, onDelete }) => {
    const schedType = node.scheduleType ?? 'relative';
    const repeatType = node.repeatType ?? 'none';
    const repeatDays = node.repeatDays ?? [];
    const summary = stepTimingLabel(node);
    const isRepeating = repeatType !== 'none';

    const toggleRepeatDay = (day: number) => {
        const next = repeatDays.includes(day)
            ? repeatDays.filter(d => d !== day)
            : [...repeatDays, day].sort((a, b) => a - b);
        onChange({ repeatDays: next });
    };

    return (
        <div className="bg-amber-50 dark:bg-amber-950/20 border-2 border-dashed border-amber-300 dark:border-amber-700 rounded-2xl p-4 space-y-3">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                    <Clock size={14} className="text-amber-500 shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 shrink-0">
                        {isRepeating ? 'Repeat' : 'Wait'}
                    </span>
                    <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold truncate">{summary}</span>
                    {isRepeating && (
                        <span className="shrink-0 text-[11px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">
                            Recurring
                        </span>
                    )}
                </div>
                <button onClick={onDelete} title="Delete delay" className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                    <Trash2 size={13} />
                </button>
            </div>

            {/* Schedule type toggle */}
            <div className="flex rounded-xl overflow-hidden border border-amber-200 dark:border-amber-700">
                {([
                    { id: 'relative', label: 'Relative', Icon: Timer },
                    { id: 'day_of_week', label: 'Weekday', Icon: CalendarDays },
                    { id: 'day_of_month', label: 'Month Day', Icon: Calendar },
                    { id: 'specific_date', label: 'Specific Date', Icon: CalendarClock },
                ] as const).map(({ id, label, Icon }) => (
                    <button key={id} type="button" onClick={() => onChange({ scheduleType: id, repeatType: 'none', repeatDays: [] })}
                        className={`flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold transition border-r last:border-r-0 border-amber-200 dark:border-amber-700 ${schedType === id ? 'bg-amber-500 text-white' : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-amber-50 dark:hover:bg-slate-600'}`}
                    ><Icon size={11} aria-hidden="true" />{label}</button>
                ))}
            </div>

            {/* Relative: day and hour counter */}
            {schedType === 'relative' && (
                <div className="space-y-3">
                    <div className="flex items-center gap-4 flex-wrap">
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Wait</span>
                            <input
                                type="number" min={0} max={365}
                                value={node.delayDays}
                                onChange={e => onChange({ delayDays: Math.max(0, parseInt(e.target.value) || 0) })}
                                title="Delay in days"
                                className="w-16 text-center text-sm font-black border border-amber-200 dark:border-amber-700 rounded-xl px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                                day{node.delayDays !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">and</span>
                            <input
                                type="number" min={0} max={23}
                                value={node.delayHours ?? 0}
                                onChange={e => onChange({ delayHours: Math.max(0, parseInt(e.target.value) || 0) })}
                                title="Delay in hours"
                                className="w-16 text-center text-sm font-black border border-amber-200 dark:border-amber-700 rounded-xl px-2 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                            />
                            <span className="text-xs text-slate-500 dark:text-slate-400 font-semibold">
                                hour{(node.delayHours ?? 0) !== 1 ? 's' : ''}
                            </span>
                        </div>
                    </div>

                    <div className="flex items-center gap-3 pt-1">
                        <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                                type="checkbox"
                                checked={node.scheduleTime !== undefined && node.scheduleTime !== ''}
                                onChange={e => {
                                    if (e.target.checked) {
                                        onChange({ scheduleTime: '09:00' });
                                    } else {
                                        onChange({ scheduleTime: undefined });
                                    }
                                }}
                                className="rounded text-amber-500 focus:ring-amber-400 border-amber-200 dark:border-amber-700 bg-white dark:bg-slate-700"
                            />
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                <Clock size={12} className="text-amber-400 shrink-0" />
                                Send at specific time of day
                            </span>
                        </label>
                        {node.scheduleTime !== undefined && node.scheduleTime !== '' && (
                            <div className="flex items-center gap-1.5">
                                <input
                                    type="time"
                                    value={node.scheduleTime}
                                    onChange={e => onChange({ scheduleTime: e.target.value })}
                                    title="Send time (24-hour)"
                                    className="text-xs border border-amber-200 dark:border-amber-700 rounded-xl px-2.5 py-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400 font-semibold"
                                />
                                <span className="text-[10px] text-slate-400">server time</span>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Day-of-week: single day picker (used when not recurring) */}
            {schedType === 'day_of_week' && !isRepeating && (
                <div className="space-y-1.5">
                    <p className="text-[10px] text-slate-400">Fire on the next occurrence of:</p>
                    <div className="flex gap-1">
                        {DOW_LABELS_SHORT.map((d, i) => (
                            <button key={i} type="button" onClick={() => onChange({ scheduleDayOfWeek: i })} title={DOW_LABELS_LONG[i]}
                                className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition ${(node.scheduleDayOfWeek ?? 1) === i
                                        ? 'bg-amber-500 text-white shadow-sm'
                                        : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-amber-100 dark:hover:bg-amber-900/30'
                                    }`}
                            >{d}</button>
                        ))}
                    </div>
                </div>
            )}

            {/* Day-of-month: single select (used when not recurring) */}
            {schedType === 'day_of_month' && !isRepeating && (
                <div className="space-y-1.5">
                    <p className="text-[10px] text-slate-400">Fire on the next occurrence of:</p>
                    <select value={node.scheduleDayOfMonth ?? 1}
                        onChange={e => onChange({ scheduleDayOfMonth: Number(e.target.value) })}
                        title="Day of month"
                        className="w-full text-sm border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    >
                        {Array.from({ length: 31 }, (_, i) => i + 1).map(d => (
                            <option key={d} value={d}>{d}{ORDINAL_SUFFIX(d)} of the month</option>
                        ))}
                    </select>
                </div>
            )}

            {/* Specific date: single select (used when not recurring) */}
            {schedType === 'specific_date' && !isRepeating && (
                <div className="space-y-1.5">
                    <p className="text-[10px] text-slate-400">Fire on this specific date:</p>
                    <input type="date" value={node.scheduleDate || ''}
                        onChange={e => onChange({ scheduleDate: e.target.value })}
                        title="Specific Date"
                        className="w-full text-sm border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                </div>
            )}

            {/* Time picker for weekday/month-day modes */}
            {schedType !== 'relative' && (
                <div className="flex items-center gap-2">
                    <Clock size={12} className="text-amber-400 shrink-0" />
                    <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">Send at</span>
                    <input type="time" value={node.scheduleTime ?? '09:00'}
                        onChange={e => onChange({ scheduleTime: e.target.value })}
                        title="Send time (24-hour)"
                        className="text-sm border border-amber-200 dark:border-amber-700 rounded-xl px-3 py-1.5 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-amber-400"
                    />
                    <span className="text-[10px] text-slate-400">server time</span>
                </div>
            )}

            <div className="pt-1 border-t border-amber-200 dark:border-amber-700">
                <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] font-bold uppercase tracking-wide text-amber-600 dark:text-amber-400 flex items-center gap-1">
                        <RefreshCw size={10} /> Recurrence
                    </span>
                    <div className="flex rounded-lg overflow-hidden border border-amber-200 dark:border-amber-700 text-[10px] font-bold">
                        {(['none', 'weekly', 'monthly'] as const).map(rt => (
                            <button key={rt} type="button"
                                onClick={() => onChange({ repeatType: rt, repeatDays: [] })}
                                className={`px-3 py-1 transition border-r last:border-r-0 border-amber-200 dark:border-amber-700 capitalize ${repeatType === rt
                                        ? 'bg-indigo-600 text-white'
                                        : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-slate-600'
                                    }`}
                            >{rt}</button>
                        ))}
                    </div>
                </div>

                {repeatType === 'weekly' && (
                    <div className="space-y-2">
                        <p className="text-[10px] text-slate-400">Fire every week on these day(s):</p>
                        <div className="flex gap-1">
                            {DOW_LABELS_SHORT.map((d, i) => {
                                const active = repeatDays.includes(i);
                                return (
                                    <button key={i} type="button"
                                        onClick={() => toggleRepeatDay(i)}
                                        title={DOW_LABELS_LONG[i]}
                                        className={`flex-1 py-1.5 text-[10px] font-bold rounded-lg transition ${active
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30'
                                            }`}
                                    >{d}</button>
                                );
                            })}
                        </div>
                        {repeatDays.length > 0 && (
                            <div className="flex items-center gap-2">
                                <Clock size={11} className="text-indigo-400 shrink-0" />
                                <span className="text-[10px] text-slate-400">Send at</span>
                                <input type="time" value={node.scheduleTime ?? '09:00'}
                                    onChange={e => onChange({ scheduleTime: e.target.value })}
                                    title="Recurring send time"
                                    className="text-sm border border-indigo-200 dark:border-indigo-700 rounded-xl px-3 py-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                            </div>
                        )}
                    </div>
                )}

                {repeatType === 'monthly' && (
                    <div className="space-y-2">
                        <p className="text-[10px] text-slate-400">Fire every month on these date(s):</p>
                        <div className="flex flex-wrap gap-1">
                            {Array.from({ length: 31 }, (_, i) => i + 1).map(d => {
                                const active = repeatDays.includes(d);
                                return (
                                    <button key={d} type="button"
                                        onClick={() => toggleRepeatDay(d)}
                                        title={`${d}${ORDINAL_SUFFIX(d)} of the month`}
                                        className={`w-8 h-8 text-[10px] font-bold rounded-lg transition ${active
                                                ? 'bg-indigo-600 text-white shadow-sm'
                                                : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/30'
                                            }`}
                                    >{d}</button>
                                );
                            })}
                        </div>
                        {repeatDays.length > 0 && (
                            <div className="flex items-center gap-2">
                                <Clock size={11} className="text-indigo-400 shrink-0" />
                                <span className="text-[10px] text-slate-400">Send at</span>
                                <input type="time" value={node.scheduleTime ?? '09:00'}
                                    onChange={e => onChange({ scheduleTime: e.target.value })}
                                    title="Recurring send time"
                                    className="text-sm border border-indigo-200 dark:border-indigo-700 rounded-xl px-3 py-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                            </div>
                        )}
                    </div>
                )}

                {isRepeating && repeatDays.length > 0 && (
                    <div className="mt-3 pt-2 border-t border-indigo-100 dark:border-indigo-800 space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">Stop after</p>
                        <div className="flex items-center gap-2 flex-wrap">
                            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
                                <input type="checkbox"
                                    checked={!!node.repeatCount}
                                    onChange={e => onChange({ repeatCount: e.target.checked ? 4 : null })}
                                    className="accent-indigo-600"
                                />
                                Max
                            </label>
                            {node.repeatCount != null && (
                                <>
                                    <input type="number" min={1} max={520}
                                        value={node.repeatCount}
                                        onChange={e => onChange({ repeatCount: Math.max(1, parseInt(e.target.value) || 1) })}
                                        title="Max repeat count"
                                        className="w-14 text-center text-sm font-black border border-indigo-200 dark:border-indigo-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                    />
                                    <span className="text-xs text-slate-400">sends</span>
                                </>
                            )}
                            <label className="flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400 ml-2">
                                <input type="checkbox"
                                    checked={!!node.repeatUntil}
                                    onChange={e => onChange({ repeatUntil: e.target.checked ? Date.now() + 30 * 86_400_000 : null })}
                                    className="accent-indigo-600"
                                />
                                Until
                            </label>
                            {node.repeatUntil != null && (
                                <input type="date"
                                    value={new Date(node.repeatUntil).toISOString().slice(0, 10)}
                                    onChange={e => onChange({ repeatUntil: new Date(e.target.value).getTime() })}
                                    title="Repeat until this date"
                                    className="text-sm border border-indigo-200 dark:border-indigo-700 rounded-lg px-2 py-1 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-400"
                                />
                            )}
                            {!node.repeatCount && !node.repeatUntil && (
                                <span className="text-[10px] text-slate-400 italic">indefinitely (no limit set)</span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Branch Node Card ---------------------------------------------------------

const BranchNodeCard: React.FC<{
    node: WorkflowBranchNode;
    onChange: (patch: Partial<WorkflowBranchNode>) => void;
    onDelete: () => void;
    pcoLists: { id: string; name: string }[];
    pcoGroups: { id: string; name: string }[];
    smsTags: SmsTag[];
    churchId: string;
}> = ({ node, onChange, onDelete, pcoLists, pcoGroups, smsTags, churchId }) => {
    const [expanded, setExpanded] = useState(true);
    const condType = node.conditionType;

    const addThenAction = () => onChange({
        thenNodes: [...node.thenNodes, { nodeType: 'action', id: uid(), order: node.thenNodes.length, channelType: 'sms', message: '' }]
    });
    const addElseAction = () => onChange({
        elseNodes: [...node.elseNodes, { nodeType: 'action', id: uid(), order: node.elseNodes.length, channelType: 'sms', message: '' }]
    });
    const updateThenNode = (idx: number, p: Partial<WorkflowActionNode>) =>
        onChange({ thenNodes: node.thenNodes.map((n, i) => i === idx ? { ...n, ...p } : n) });
    const deleteThenNode = (idx: number) =>
        onChange({ thenNodes: node.thenNodes.filter((_, i) => i !== idx).map((n, i) => ({ ...n, order: i })) });
    const updateElseNode = (idx: number, p: Partial<WorkflowActionNode>) =>
        onChange({ elseNodes: node.elseNodes.map((n, i) => i === idx ? { ...n, ...p } : n) });
    const deleteElseNode = (idx: number) =>
        onChange({ elseNodes: node.elseNodes.filter((_, i) => i !== idx).map((n, i) => ({ ...n, order: i })) });

    const conditionSummary = () => {
        switch (condType) {
            case 'replied': return 'Contact replied to previous message';
            case 'email_opened': return 'Contact opened previous email';
            case 'tag_applied': return node.conditionTagName ? `Tag "${node.conditionTagName}" applied` : 'Tag is applied';
            case 'custom': return node.conditionCustom || 'Custom condition';
        }
    };

    return (
        <div className="bg-white dark:bg-slate-800 border-2 border-blue-300 dark:border-blue-600 rounded-2xl overflow-hidden shadow-sm">
            {/* Branch header */}
            <div className="flex items-center justify-between px-4 py-3 bg-blue-50 dark:bg-blue-950/30 border-b border-blue-200 dark:border-blue-700">
                <div className="flex items-center gap-2 min-w-0">
                    <GitBranch size={14} className="text-blue-500 shrink-0" />
                    <span className="text-xs font-bold uppercase tracking-wide text-blue-600 dark:text-blue-400 shrink-0">Branch</span>
                    <span className="text-xs text-slate-400 shrink-0">·</span>
                    <span className="text-xs font-semibold text-slate-700 dark:text-slate-300 truncate">IF: {conditionSummary()}</span>
                </div>
                <div className="flex items-center gap-1 shrink-0 ml-2">
                    <button onClick={() => setExpanded(e => !e)} title={expanded ? 'Collapse' : 'Expand'}
                        className="p-1 text-slate-400 hover:text-blue-600 rounded-lg transition">
                        <ChevronDown size={14} className={`transition-transform ${expanded ? '' : '-rotate-90'}`} />
                    </button>
                    <button onClick={onDelete} title="Delete branch"
                        className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition">
                        <Trash2 size={14} />
                    </button>
                </div>
            </div>

            {expanded && (
                <div className="p-4 space-y-4">
                    {/* Condition editor */}
                    <div className="space-y-3">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Condition (IF)</p>
                        <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-600">
                            {([
                                { id: 'replied', label: 'Replied', Icon: MessageCircle },
                                { id: 'email_opened', label: 'Email Opened', Icon: MailOpen },
                                { id: 'tag_applied', label: 'Tag Applied', Icon: Tag },
                                { id: 'custom', label: 'Custom', Icon: Cog },
                            ] as const).map(({ id, label, Icon }) => (
                                <button key={id} type="button" onClick={() => onChange({ conditionType: id })}
                                    className={`flex-1 inline-flex items-center justify-center gap-1 py-1.5 text-[10px] font-bold transition border-r last:border-r-0 border-slate-200 dark:border-slate-600 ${condType === id ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-blue-50 dark:hover:bg-slate-600'}`}
                                ><Icon size={11} aria-hidden="true" />{label}</button>
                            ))}
                        </div>
                        {condType === 'tag_applied' && (
                            <select value={node.conditionTagId || ''} title="Select tag"
                                onChange={e => {
                                    const tag = smsTags.find(t => t.id === e.target.value);
                                    onChange({ conditionTagId: e.target.value || null, conditionTagName: tag?.name || null });
                                }}
                                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            >
                                <option value="">-- Select a tag --</option>
                                {smsTags.map(t => <option key={t.id} value={t.id}>{t.emoji} {t.name}</option>)}
                            </select>
                        )}
                        {condType === 'custom' && (
                            <input type="text" value={node.conditionCustom || ''}
                                onChange={e => onChange({ conditionCustom: e.target.value })}
                                placeholder="Describe the condition, e.g. 'Attended Sunday service'"
                                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                        )}
                        <div className="flex items-start gap-2 text-[10px] text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl p-2.5">
                            <Info size={11} className="mt-0.5 shrink-0" />
                            <span>Branch conditions are evaluated at runtime. During this preview phase the THEN path always executes; full condition evaluation is a future update.</span>
                        </div>
                    </div>

                    {/* Two sub-timelines: THEN / ELSE */}
                    <div className="grid grid-cols-2 gap-3">
                        <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                                <CheckCircle size={12} className="text-emerald-500" />
                                <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">Then (True)</span>
                            </div>
                            <div className="p-2 border border-emerald-200 dark:border-emerald-800 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/10 space-y-2 min-h-[60px]">
                                {node.thenNodes.map((an, i) => (
                                    <div key={an.id}>
                                        {i > 0 && <div className="w-0.5 h-3 bg-emerald-200 dark:bg-emerald-800 mx-auto" />}
                                        <ActionNodeCard
                                            step={an} index={i} total={node.thenNodes.length}
                                            onChange={p => updateThenNode(i, p)}
                                            onDelete={() => deleteThenNode(i)}
                                            onMoveUp={() => { }} onMoveDown={() => { }}
                                            pcoLists={pcoLists} pcoGroups={pcoGroups} churchId={churchId} isSubStep
                                        />
                                    </div>
                                ))}
                                <button onClick={addThenAction}
                                    className="w-full py-1.5 border-2 border-dashed border-emerald-300 dark:border-emerald-700 rounded-xl text-[10px] font-bold text-emerald-500 hover:border-emerald-500 transition flex items-center justify-center gap-1">
                                    <Plus size={10} /> Add Action
                                </button>
                            </div>
                        </div>
                        <div className="space-y-2">
                            <div className="flex items-center gap-1.5">
                                <Circle size={12} className="text-slate-400" />
                                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400">Else (False)</span>
                            </div>
                            <div className="p-2 border border-slate-200 dark:border-slate-700 rounded-xl bg-slate-50 dark:bg-slate-800/50 space-y-2 min-h-[60px]">
                                {node.elseNodes.map((an, i) => (
                                    <div key={an.id}>
                                        {i > 0 && <div className="w-0.5 h-3 bg-slate-200 dark:bg-slate-700 mx-auto" />}
                                        <ActionNodeCard
                                            step={an} index={i} total={node.elseNodes.length}
                                            onChange={p => updateElseNode(i, p)}
                                            onDelete={() => deleteElseNode(i)}
                                            onMoveUp={() => { }} onMoveDown={() => { }}
                                            pcoLists={pcoLists} pcoGroups={pcoGroups} churchId={churchId} isSubStep
                                        />
                                    </div>
                                ))}
                                <button onClick={addElseAction}
                                    className="w-full py-1.5 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl text-[10px] font-bold text-slate-400 hover:border-slate-500 transition flex items-center justify-center gap-1">
                                    <Plus size={10} /> Add Action
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// --- Workflow MMS Image Uploader ---------------------------------------------

const WorkflowMmsUploader: React.FC<{
    mmsUrl: string;
    churchId: string;
    onUrlChange: (url: string) => void;
}> = ({ mmsUrl, churchId, onUrlChange }) => {
    const [uploading, setUploading] = useState(false);
    const [uploadPct, setUploadPct] = useState(0);
    const [urlInput, setUrlInput] = useState(mmsUrl);
    const fileInputRef = useRef<HTMLInputElement>(null);

    React.useEffect(() => { setUrlInput(mmsUrl); }, [mmsUrl]);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setUploadPct(0);
        try {
            const compressedFile = await compressSmsImage(file) as File;
            const cleanName = compressedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `sms-media/${churchId}/workflow/${Date.now()}_${cleanName}`;
            const fileRef = storageRef(storage, path);
            const task = uploadBytesResumable(fileRef, compressedFile);
            await new Promise<void>((resolve, reject) => {
                task.on('state_changed',
                    snap => setUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
                    reject,
                    async () => {
                        const url = await getDownloadURL(task.snapshot.ref);
                        onUrlChange(url);
                        setUrlInput(url);
                        resolve();
                    }
                );
            });
        } catch {
            alert('Image upload failed. Please try again.');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="space-y-2">
            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400">Image (MMS)</label>
            <div className="flex gap-2 items-center">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/gif,image/webp"
                    className="hidden"
                    title="Upload image"
                    onChange={handleFileChange}
                />
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    title="Upload image from your device"
                    className="flex items-center gap-1.5 px-3 py-2 text-xs font-bold rounded-xl border border-blue-300 dark:border-blue-700 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 hover:bg-blue-100 dark:hover:bg-blue-900/40 transition disabled:opacity-50 shrink-0"
                >
                    {uploading ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                    {uploading ? `${uploadPct}%` : 'Upload'}
                </button>
                <input
                    type="url"
                    value={urlInput}
                    onChange={e => { setUrlInput(e.target.value); onUrlChange(e.target.value); }}
                    placeholder="or paste URL..."
                    className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                {mmsUrl && (
                    <button
                        type="button"
                        title="Remove image"
                        onClick={() => { onUrlChange(''); setUrlInput(''); }}
                        className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition shrink-0"
                    >
                        <X size={14} />
                    </button>
                )}
            </div>
            {uploading && (
                <div className="h-1.5 bg-blue-100 dark:bg-blue-900/40 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${uploadPct}%` }}
                    />
                </div>
            )}
            {mmsUrl && !uploading && (
                <div className="rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 max-w-[180px]">
                    <img src={mmsUrl} alt="MMS preview" className="w-full h-auto object-cover" onError={() => onUrlChange('')} />
                </div>
            )}
            <p className="text-[10px] text-slate-400">JPG, PNG, GIF, or WebP · MMS may incur additional carrier fees.</p>
        </div>
    );
};

// --- Also add upload support to SMS steps in the workflow --------------------

const WorkflowSmsImageAttachment: React.FC<{
    mmsUrl: string;
    churchId: string;
    onUrlChange: (url: string) => void;
}> = ({ mmsUrl, churchId, onUrlChange }) => {
    const [uploading, setUploading] = useState(false);
    const [uploadPct, setUploadPct] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        setUploading(true);
        setUploadPct(0);
        try {
            const compressedFile = await compressSmsImage(file) as File;
            const cleanName = compressedFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `sms-media/${churchId}/workflow/${Date.now()}_${cleanName}`;
            const fileRef = storageRef(storage, path);
            const task = uploadBytesResumable(fileRef, compressedFile);
            await new Promise<void>((resolve, reject) => {
                task.on('state_changed',
                    snap => setUploadPct(Math.round((snap.bytesTransferred / snap.totalBytes) * 100)),
                    reject,
                    async () => {
                        const url = await getDownloadURL(task.snapshot.ref);
                        onUrlChange(url);
                        resolve();
                    }
                );
            });
        } catch {
            alert('Image upload failed. Please try again.');
        } finally {
            setUploading(false);
            if (fileInputRef.current) fileInputRef.current.value = '';
        }
    };

    return (
        <div className="mt-2 space-y-1.5">
            <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/gif,image/webp"
                className="hidden"
                title="Upload image"
                onChange={handleFileChange}
            />
            {mmsUrl ? (
                <div className="flex items-center gap-2 p-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl">
                    <img src={mmsUrl} alt="Attached image" className="w-10 h-10 object-cover rounded-lg shrink-0 border border-indigo-200 dark:border-indigo-700" />
                    <div className="flex-1 min-w-0">
                        <p className="text-[10px] font-semibold text-indigo-700 dark:text-indigo-300 truncate">Image attached (MMS)</p>
                    </div>
                    <button
                        type="button"
                        title="Remove image"
                        onClick={() => onUrlChange('')}
                        className="p-1 text-indigo-400 hover:text-red-500 rounded-lg transition shrink-0"
                    >
                        <X size={13} />
                    </button>
                </div>
            ) : (
                <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={uploading}
                    title="Attach image — converts this step to MMS"
                    className="flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-bold rounded-lg border border-slate-200 dark:border-slate-600 text-slate-500 dark:text-slate-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-600 hover:border-indigo-300 dark:hover:border-indigo-700 transition disabled:opacity-50"
                >
                    {uploading ? <Loader2 size={12} className="animate-spin" /> : <ImageIcon size={12} />}
                    {uploading ? `Uploading ${uploadPct}%...` : 'Attach Image (MMS)'}
                </button>
            )}
            {uploading && (
                <div className="h-1 bg-indigo-100 dark:bg-indigo-900/40 rounded-full overflow-hidden">
                    <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${uploadPct}%` }} />
                </div>
            )}
        </div>
    );
};

const ActionNodeCard: React.FC<{
    step: WorkflowActionNode;
    index: number;
    total: number;
    onChange: (patch: Partial<WorkflowActionNode>) => void;
    onDelete: () => void;
    onMoveUp: () => void;
    onMoveDown: () => void;
    pcoLists: { id: string; name: string }[];
    pcoGroups: { id: string; name: string }[];
    churchId: string;
    isSubStep?: boolean;
}> = ({ step, index, total, onChange, onDelete, onMoveUp, onMoveDown, pcoLists, pcoGroups, churchId, isSubStep }) => {
    const channel = step.channelType ?? 'sms';
    const segs = countSegments(step.message);
    const [mmsUrl, setMmsUrl] = React.useState((step.mediaUrls && step.mediaUrls[0]) || '');

    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const [showEmojis, setShowEmojis] = React.useState(false);

    const insertAtCursor = (text: string, field: 'message' | 'emailBody' = 'message') => {
        const el = textareaRef.current;
        const currentVal = (step[field] as string) || '';
        if (!el) {
            onChange({ [field]: currentVal + text });
            return;
        }
        const start = el.selectionStart ?? currentVal.length;
        const end = el.selectionEnd ?? start;
        const before = currentVal.slice(0, start);
        const after = currentVal.slice(end);
        const newVal = before + text + after;
        onChange({ [field]: newVal });
        requestAnimationFrame(() => {
            el.focus();
            const pos = start + text.length;
            el.setSelectionRange(pos, pos);
        });
    };

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
                    <span className="w-7 h-7 rounded-full bg-indigo-600 text-white text-xs font-black flex items-center justify-center shrink-0">{index + 1}</span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wide">Step {index + 1}</span>
                </div>
                <div className="flex items-center gap-1">
                    <button onClick={onMoveUp} disabled={index === 0} title="Move step up" className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"><ChevronDown size={14} className="rotate-180" /></button>
                    <button onClick={onMoveDown} disabled={index === total - 1} title="Move step down" className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-300 disabled:opacity-30 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"><ChevronDown size={14} /></button>
                    <button onClick={onDelete} title="Delete step" className="p-1 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition"><Trash2 size={14} /></button>
                </div>
            </div>

            {!isSubStep ? (
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Channel</p>
                    <div className="flex rounded-t-xl overflow-hidden border border-b-0 border-slate-200 dark:border-slate-600">
                        {(['sms', 'mms', 'email'] as WorkflowChannelType[]).map(ch => (
                            <button key={ch} type="button" onClick={() => onChange({ channelType: ch })}
                                title={`Use ${CHANNEL_CONFIG[ch].label} channel`}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold transition border-r last:border-r-0 border-slate-200 dark:border-slate-600 ${channel === ch ? CHANNEL_CONFIG[ch].color : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-600'}`}>
                                {CHANNEL_CONFIG[ch].icon} {CHANNEL_CONFIG[ch].label}
                            </button>
                        ))}
                    </div>
                    <div className="flex rounded-b-xl overflow-hidden border border-slate-200 dark:border-slate-600">
                        {(['staff_sms', 'staff_email'] as WorkflowChannelType[]).map(ch => (
                            <button key={ch} type="button" onClick={() => onChange({ channelType: ch })}
                                title={`Use ${CHANNEL_CONFIG[ch].label} channel`}
                                className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 text-xs font-bold transition border-r last:border-r-0 border-slate-200 dark:border-slate-600 ${channel === ch ? CHANNEL_CONFIG[ch].color : 'bg-white dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-600'}`}>
                                {CHANNEL_CONFIG[ch].icon} {CHANNEL_CONFIG[ch].label}
                                {(ch === 'staff_sms' || ch === 'staff_email') && <span className="text-[10px] opacity-60 ml-0.5">(internal)</span>}
                            </button>
                        ))}
                    </div>
                </div>
            ) : (
                <div className="flex items-center gap-1 flex-wrap">
                    {(['sms', 'mms', 'email', 'staff_sms', 'staff_email'] as WorkflowChannelType[]).map(ch => (
                        <button key={ch} type="button" onClick={() => onChange({ channelType: ch })} title={CHANNEL_CONFIG[ch].label}
                            className={`flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold rounded-full border transition ${channel === ch ? CHANNEL_CONFIG[ch].color + ' border-transparent' : 'bg-slate-100 dark:bg-slate-700 text-slate-500 border-slate-200 hover:bg-slate-200'}`}>
                            {CHANNEL_CONFIG[ch].icon} {CHANNEL_CONFIG[ch].label}
                        </button>
                    ))}
                </div>
            )}

            {channel === 'sms' && (
                <div>
                    <div className="flex items-center justify-between mb-1.5">
                        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Message</label>
                        <span className={`text-[10px] font-bold ${segs > 3 ? 'text-red-500' : segs > 1 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {step.message.length} chars • {segs} seg{segs !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <textarea
                        ref={textareaRef}
                        rows={3}
                        value={step.message}
                        onChange={e => onChange({ message: e.target.value })}
                        placeholder="Type your message... Use {firstName} for personalisation."
                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />
                    <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
                        <div className="relative">
                            <button
                                type="button"
                                title="Insert emoji"
                                onClick={() => setShowEmojis(v => !v)}
                                className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 transition border border-slate-200 dark:border-slate-600"
                            >
                                <Smile size={12} /> Emoji
                            </button>
                            {showEmojis && (
                                <div className="absolute left-0 bottom-full mb-1 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl flex gap-1.5 z-20 flex-wrap max-w-[200px]">
                                    {COMMON_EMOJIS.map(em => (
                                        <button key={em} type="button" onClick={() => { insertAtCursor(em, 'message'); setShowEmojis(false); }}
                                            className="text-base hover:scale-125 transition p-1 cursor-pointer"
                                        >{em}</button>
                                    ))}
                                </div>
                            )}
                        </div>
                        {ALL_MERGE_TAGS.map(({ tag }) => (
                            <button key={tag} type="button" onClick={() => insertAtCursor(tag, 'message')}
                                className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 rounded-lg border border-indigo-200 dark:border-indigo-800 hover:bg-indigo-100 transition"
                            >{tag}</button>
                        ))}
                    </div>
                    {step.message.trim() && (
                        <div className="bg-slate-100 dark:bg-slate-900/40 rounded-2xl p-3 flex justify-end mt-2">
                            <div className="bg-indigo-600 text-white text-xs px-3 py-2 rounded-2xl rounded-br-sm max-w-[85%] leading-relaxed whitespace-pre-wrap break-words">
                                {step.message
                                    .split('{firstName}').join('John').split('{lastName}').join('Smith')
                                    .split('{fullName}').join('John Smith').split('{email}').join('john@example.com')
                                    .split('{phone}').join('(615) 555-0100').split('{birthday}').join('Jan 15')
                                    .split('{anniversary}').join('Jun 10').split('{city}').join('Nashville')
                                    .split('{state}').join('TN')
                                    .split('{church.name}').join('Grace Church').split('{churchName}').join('Grace Church')
                                    .split('{church.phone}').join('(615) 555-0199').split('{churchPhone}').join('(615) 555-0199')
                                    .split('{church.address}').join('123 Church St, Nashville, TN').split('{churchAddress}').join('123 Church St, Nashville, TN')
                                    .split('{church.website}').join('https://gracechurch.org').split('{churchWebsite}').join('https://gracechurch.org')
                                }
                            </div>
                        </div>
                    )}
                    <WorkflowSmsImageAttachment
                        mmsUrl={mmsUrl}
                        churchId={churchId}
                        onUrlChange={handleMmsUrl}
                    />
                </div>
            )}

            {channel === 'mms' && (
                <div className="space-y-3">
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Message</label>
                            <span className={`text-[10px] font-bold ${segs > 3 ? 'text-red-500' : segs > 1 ? 'text-amber-600' : 'text-slate-400'}`}>
                                {step.message.length} chars • {segs} seg{segs !== 1 ? 's' : ''}
                            </span>
                        </div>
                        <textarea
                            ref={textareaRef}
                            rows={3}
                            value={step.message}
                            onChange={e => onChange({ message: e.target.value })}
                            placeholder="Caption for the image... Use {firstName} for personalisation."
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        />
                        <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
                            <div className="relative">
                                <button
                                    type="button"
                                    title="Insert emoji"
                                    onClick={() => setShowEmojis(v => !v)}
                                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 transition border border-slate-200 dark:border-slate-600"
                                >
                                    <Smile size={12} /> Emoji
                                </button>
                                {showEmojis && (
                                    <div className="absolute left-0 bottom-full mb-1 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl flex gap-1.5 z-20 flex-wrap max-w-[200px]">
                                        {COMMON_EMOJIS.map(em => (
                                            <button key={em} type="button" onClick={() => { insertAtCursor(em, 'message'); setShowEmojis(false); }}
                                                className="text-base hover:scale-125 transition p-1 cursor-pointer"
                                            >{em}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {ALL_MERGE_TAGS.map(({ tag }) => (
                                <button key={tag} type="button" onClick={() => insertAtCursor(tag, 'message')}
                                    className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg border border-blue-200 dark:border-blue-800 hover:bg-blue-100 transition"
                                >{tag}</button>
                            ))}
                        </div>
                    </div>
                    <WorkflowMmsUploader
                        mmsUrl={mmsUrl}
                        churchId={churchId}
                        onUrlChange={handleMmsUrl}
                    />
                </div>
            )}

            {channel === 'email' && (
                <div className="space-y-3">
                    <div className="flex items-start gap-2 p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-xs text-emerald-700 dark:text-emerald-300">
                        <Mail size={13} className="mt-0.5 shrink-0" />
                        <span>Email steps are sent using your church's Email settings (from name, address, template). The recipient must have an email on file in Planning Center.</span>
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Subject Line</label>
                        <input
                            type="text"
                            value={step.emailSubject || ''}
                            onChange={e => onChange({ emailSubject: e.target.value })}
                            placeholder="e.g. Welcome to Grace Church! 👋"
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                    </div>
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Email Body</label>
                            <span className="text-[10px] text-slate-400">{(step.emailBody || '').length} chars</span>
                        </div>
                        <textarea
                            ref={textareaRef}
                            rows={6}
                            value={step.emailBody || ''}
                            onChange={e => onChange({ emailBody: e.target.value })}
                            placeholder={`Dear {firstName},\n\nWe're so glad you joined us...`}
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-700 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 resize-none font-medium leading-relaxed"
                        />
                        <div className="flex gap-1.5 mt-1.5 flex-wrap items-center">
                            <div className="relative">
                                <button
                                    type="button"
                                    title="Insert emoji"
                                    onClick={() => setShowEmojis(v => !v)}
                                    className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 bg-slate-100 dark:bg-slate-700 rounded-lg hover:bg-slate-200 transition border border-slate-200 dark:border-slate-600"
                                >
                                    <Smile size={12} /> Emoji
                                </button>
                                {showEmojis && (
                                    <div className="absolute left-0 bottom-full mb-1 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-xl flex gap-1.5 z-20 flex-wrap max-w-[200px]">
                                        {COMMON_EMOJIS.map(em => (
                                            <button key={em} type="button" onClick={() => { insertAtCursor(em, 'emailBody'); setShowEmojis(false); }}
                                                className="text-base hover:scale-125 transition p-1 cursor-pointer"
                                            >{em}</button>
                                        ))}
                                    </div>
                                )}
                            </div>
                            {ALL_MERGE_TAGS.map(({ tag }) => (
                                <button key={tag} type="button" onClick={() => insertAtCursor(tag, 'emailBody')}
                                    className="px-2 py-0.5 text-[10px] font-mono font-semibold bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300 rounded-lg border border-emerald-200 dark:border-emerald-800 hover:bg-emerald-100 transition"
                                >{tag}</button>
                            ))}
                        </div>
                    </div>
                    {(step.emailSubject?.trim() || step.emailBody?.trim()) && (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                            <div className="bg-slate-50 dark:bg-slate-800 px-4 py-2 border-b border-slate-200 dark:border-slate-700">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Preview</p>
                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{step.emailSubject?.replace('{firstName}', 'John') || '(no subject)'}</p>
                            </div>
                            <div className="px-4 py-3 text-xs text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed">
                                {(step.emailBody || '')
                                    .split('{firstName}').join('John').split('{lastName}').join('Smith')
                                    .split('{fullName}').join('John Smith').split('{email}').join('john@example.com')
                                    .split('{phone}').join('(615) 555-0100').split('{birthday}').join('Jan 15')
                                    .split('{anniversary}').join('Jun 10').split('{city}').join('Nashville')
                                    .split('{state}').join('TN')
                                    .split('{church.name}').join('Grace Church').split('{churchName}').join('Grace Church')
                                    .split('{church.phone}').join('(615) 555-0199').split('{churchPhone}').join('(615) 555-0199')
                                    .split('{church.address}').join('123 Church St, Nashville, TN').split('{churchAddress}').join('123 Church St, Nashville, TN')
                                    .split('{church.website}').join('https://gracechurch.org').split('{churchWebsite}').join('https://gracechurch.org')
                                    || <span className="opacity-40 italic">No body yet</span>}
                            </div>
                        </div>
                    )}
                </div>
            )}
            {(channel === 'staff_sms' || channel === 'staff_email') && (
                <StaffStepEditor step={step} onChange={onChange} pcoLists={pcoLists} pcoGroups={pcoGroups} />
            )}
        </div>
    );
};

const EXAMPLE_PROMPTS = [
    'Send a text once a day for 5 days with a Bible verse about prayer. On the last day, remind them the church is praying for them.',
    'Create a 3-step new visitor follow-up: a welcome text on day 0, an email on day 3 about getting connected, and an SMS on day 7 inviting them back.',
    'Build a 7-day Easter devotional series with daily SMS scripture and a final email summarising the Resurrection story.',
    'Send 4 weekly SMS giving encouragements reminding donors of the church mission.',
    'New member onboarding: welcome SMS immediately, then a staff email alerting the pastor to call them, then a check-in SMS on day 7.',
    'Birthday workflow: send a warm birthday SMS to the contact, then alert the pastor via staff SMS so they can call to say happy birthday.',
];

// ─── Shared draft preview component (used by both Guided and Custom tabs) ─────

const AiDraftPreview: React.FC<{ draft: AiWorkflowDraft; onRegenerate: () => void; onApply: () => void; onClose: () => void; loading: boolean; prompt?: string }> = ({ draft, onRegenerate, onApply, onClose, loading }) => {
    const chBadgeClass: Record<string, string> = {
        sms: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
        mms: 'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300',
        email: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
        staff_sms: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
        staff_email: 'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300',
    };
    const chLabel: Record<string, string> = { sms: 'SMS', mms: 'MMS', email: 'Email', staff_sms: 'Staff SMS', staff_email: 'Staff Email' };

    return (
        <div className="space-y-4">
            <div className="flex items-center justify-between">
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-0.5">Generated Workflow</p>
                    <h3 className="font-black text-slate-900 dark:text-white text-base">{draft.name}</h3>
                    {draft.description && <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{draft.description}</p>}
                </div>
                <span className="text-xs font-bold bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2.5 py-1 rounded-full">{draft.steps.length} step{draft.steps.length !== 1 ? 's' : ''}</span>
            </div>
            <div className="space-y-3">
                {draft.steps.map((step, idx) => {
                    const isStaff = step.channelType === 'staff_sms' || step.channelType === 'staff_email';
                    const isEmail = step.channelType === 'email' || step.channelType === 'staff_email';
                    const delayLabel = (() => {
                        if (idx === 0) return 'Sends immediately';
                        if (step.scheduleType === 'day_of_week') {
                            const days = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
                            return `Next ${days[step.scheduleDayOfWeek ?? 1]} at ${step.scheduleTime ?? '09:00'}`;
                        }
                        if (step.scheduleType === 'day_of_month') return `On day ${step.scheduleDayOfMonth ?? 1} of the month`;
                        const d = step.delayDays ?? 0;
                        const h = step.delayHours ?? 0;
                        if (d === 0 && h > 0) return `After ${h} hour${h !== 1 ? 's' : ''}`;
                        if (h > 0) return `After ${d}d ${h}h`;
                        return `After ${d} day${d !== 1 ? 's' : ''}`;
                    })();
                    return (
                        <div key={idx} className={`border rounded-2xl p-4 ${isStaff ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800' : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'}`}>
                            <div className="flex items-center gap-2 mb-2">
                                <span className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center shrink-0">{idx + 1}</span>
                                <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${chBadgeClass[step.channelType] ?? chBadgeClass.sms}`}>
                                    {chLabel[step.channelType] ?? step.channelType.toUpperCase()}
                                </span>
                                {isStaff && <span className="text-[10px] font-bold text-amber-600 dark:text-amber-400">Staff Alert</span>}
                                <span className="text-[10px] text-slate-400">{delayLabel}</span>
                            </div>
                            {isEmail ? (
                                <div className="space-y-1">
                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Subject: {step.emailSubject}</p>
                                    <p className="text-xs text-slate-600 dark:text-slate-400 whitespace-pre-wrap leading-relaxed line-clamp-4">{step.emailBody}</p>
                                </div>
                            ) : (
                                <div className={`flex ${isStaff ? 'justify-start' : 'justify-end'}`}>
                                    <div className={`text-xs px-3 py-2 rounded-2xl max-w-[90%] leading-relaxed whitespace-pre-wrap break-words font-medium shadow-sm ${
                                        isStaff
                                            ? 'bg-amber-200 dark:bg-amber-800 text-amber-900 dark:text-amber-100 rounded-bl-sm'
                                            : 'bg-indigo-600 text-white rounded-br-sm'
                                    }`}>
                                        {step.message}
                                    </div>
                                </div>
                            )}
                            {step.staffNote && (
                                <p className="flex items-start gap-1 text-[10px] text-amber-600 dark:text-amber-400 mt-2 italic"><StickyNote size={11} className="shrink-0 mt-px" aria-hidden="true" /> <span>{step.staffNote}</span></p>
                            )}
                        </div>
                    );
                })}
            </div>
            {/* Footer */}
            <div className="flex items-center gap-3 pt-2">
                <button
                    onClick={onRegenerate}
                    disabled={loading}
                    className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                >
                    <RotateCcw size={13} /> Regenerate
                </button>
                <div className="flex-1" />
                <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition">Cancel</button>
                <button
                    onClick={onApply}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition shadow-md shadow-indigo-200 dark:shadow-indigo-900/40"
                >
                    <ChevronRight size={15} /> Apply to Editor
                </button>
            </div>
        </div>
    );
};

// ─── Guided wizard tab ────────────────────────────────────────────────────────

const GuidedBuilderTab: React.FC<{
    pcoRegistrationEvents: { id: string; pcoId: string; name: string; startsAt?: string | null }[];
    onApply: (draft: AiWorkflowDraft, ctx: AiBuilderContext) => void;
    onSaveDirectly?: (draft: AiWorkflowDraft, ctx: AiBuilderContext) => Promise<void>;
    onClose: () => void;
}> = ({ pcoRegistrationEvents, onApply, onSaveDirectly, onClose }) => {
    const TOTAL_STEPS = 5;
    const [step, setStep] = useState(1);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [draft, setDraft] = useState<AiWorkflowDraft | null>(null);
    const [draftPair, setDraftPair] = useState<{ invite: AiWorkflowDraft; remind: AiWorkflowDraft } | null>(null);
    const [appliedPair, setAppliedPair] = useState<{ invite: boolean; remind: boolean }>({ invite: false, remind: false });

    const [eventType, setEventType] = useState<'registration' | 'calendar' | null>(null);
    const [goal, setGoal] = useState<'invite' | 'remind' | 'both' | null>(null);
    const [selectedPcoEvent, setSelectedPcoEvent] = useState<{ id: string; pcoId: string; name: string; startsAt?: string | null } | null>(null);
    const [manualMode, setManualMode] = useState(false);
    const [manualName, setManualName] = useState('');
    const [manualDate, setManualDate] = useState('');

    const [touchpointCount, setTouchpointCount] = useState(3);
    const [timingMode, setTimingMode] = useState<'before_event' | 'after_registration'>('before_event');
    const [daysBefore, setDaysBefore] = useState(14);
    const [spacing, setSpacing] = useState<'even' | 'closer_to_event' | 'ai_decides'>('even');

    const [tone, setTone] = useState('');

    const [includeStaffAlert, setIncludeStaffAlert] = useState(true);
    const [staffAlertTiming, setStaffAlertTiming] = useState<'with_first' | 'with_last' | 'day_of_event'>('with_first');
    const [includeRegistrantCount, setIncludeRegistrantCount] = useState(true);

    const [customContent, setCustomContent] = useState('');

    const buildCtx = (goalOverride?: 'invite' | 'remind'): AiBuilderContext => {
        const isManual = manualMode || eventType === 'calendar';
        const eventName = isManual ? manualName : (selectedPcoEvent?.name ?? '');
        const eventDate = isManual ? manualDate : (selectedPcoEvent?.startsAt ? selectedPcoEvent.startsAt.substring(0, 10) : undefined);
        return {
            eventType: eventType ?? 'registration',
            eventName,
            eventDate: eventDate || undefined,
            eventPcoId: selectedPcoEvent?.pcoId,
            isManualEntry: isManual,
            goal: goalOverride ?? (goal as 'invite' | 'remind' | 'both'),
            touchpointCount,
            timingMode: goalOverride === 'invite' ? 'before_event' : timingMode,
            firstMessageDaysBefore: timingMode === 'before_event' || goalOverride === 'invite' ? daysBefore : undefined,
            spacing,
            tone,
            includeStaffAlert,
            staffAlertTiming: includeStaffAlert ? staffAlertTiming : undefined,
            includeRegistrantCount: includeStaffAlert && includeRegistrantCount,
            customContent: customContent.trim() || undefined,
        };
    };

    const handleGenerate = async () => {
        setLoading(true);
        setError('');
        setDraft(null);
        setDraftPair(null);
        setAppliedPair({ invite: false, remind: false });
        try {
            if (goal === 'both') {
                const [inviteDraft, remindDraft] = await Promise.all([
                    generateWorkflowFromContext(buildCtx('invite')),
                    generateWorkflowFromContext(buildCtx('remind')),
                ]);
                setDraftPair({ invite: inviteDraft, remind: remindDraft });
            } else {
                const ctx = buildCtx();
                const result = await generateWorkflowFromContext(ctx);
                setDraft(result);
            }
        } catch (e: any) {
            setError(e.message || 'Generation failed. Please try again.');
        } finally {
            setLoading(false);
        }
    };

    const handleRegenerate = async () => {
        setDraft(null);
        setDraftPair(null);
        setAppliedPair({ invite: false, remind: false });
        await handleGenerate();
    };

    const canProceed = () => {
        if (step === 1) {
            if (!eventType || !goal) return false;
            if (manualMode || eventType === 'calendar') return manualName.trim().length > 0;
            return !!selectedPcoEvent;
        }
        if (step === 2) return touchpointCount >= 1;
        if (step === 3) return tone.trim().length > 0;
        return true;
    };

    const eventDisplayName = manualMode || eventType === 'calendar' ? manualName : selectedPcoEvent?.name;
    const eventDisplayDate = manualMode || eventType === 'calendar'
        ? (manualDate ? new Date(manualDate + 'T12:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')
        : (selectedPcoEvent?.startsAt ? new Date(selectedPcoEvent.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '');

    const inputBase = 'w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500';
    const radioCard = (active: boolean) => `flex items-start gap-3 p-3.5 rounded-xl border-2 cursor-pointer transition ${
        active ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700'
    }`;

    if (draftPair) {
        const PairCard = ({
            label, emoji, draft: d, goalKey, borderColor, headerBg, labelColor, subColor,
        }: {
            label: string; emoji: React.ReactNode; draft: AiWorkflowDraft;
            goalKey: 'invite' | 'remind';
            borderColor: string; headerBg: string; labelColor: string; subColor: string;
        }) => {
            const applied = appliedPair[goalKey];
            const [saving, setSaving] = useState(false);
            const chBadge: Record<string, string> = {
                sms: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
                email: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
                staff_sms: 'bg-amber-100 text-amber-700',
                staff_email: 'bg-orange-100 text-orange-700',
            };
            const chLabel: Record<string, string> = { sms: 'SMS', email: 'Email', staff_sms: 'Staff SMS', staff_email: 'Staff Email' };

            const handleApply = async () => {
                if (applied || saving) return;
                setSaving(true);
                try {
                    if (onSaveDirectly) {
                        await onSaveDirectly(d, buildCtx(goalKey));
                    } else {
                        onApply(d, buildCtx(goalKey));
                    }
                    setAppliedPair(prev => ({ ...prev, [goalKey]: true }));
                } finally {
                    setSaving(false);
                }
            };

            return (
                <div className={`border-2 ${borderColor} rounded-2xl overflow-hidden`}>
                    <div className={`${headerBg} px-4 py-2.5 flex items-center gap-2`}>
                        <span className={`shrink-0 ${labelColor}`}>{emoji}</span>
                        <div className="flex-1">
                            <p className={`font-black text-sm ${labelColor}`}>{label}</p>
                            <p className={`text-[10px] ${subColor}`}>{d.name}</p>
                        </div>
                        {applied && (
                            <span className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/30 border border-emerald-200 dark:border-emerald-700 px-2 py-0.5 rounded-full">
                                ✓ Saved
                            </span>
                        )}
                    </div>
                    <div className="p-4 space-y-3">
                        {d.description && <p className="text-xs text-slate-500 dark:text-slate-400 italic">{d.description}</p>}
                        <div className="space-y-2">
                            {d.steps.map((s, i) => {
                                const isStaff = s.channelType === 'staff_sms' || s.channelType === 'staff_email';
                                const isEmail = s.channelType === 'email' || s.channelType === 'staff_email';
                                const delay = i === 0 ? 'Immediately' : (s.delayDays ?? 0) > 0 ? `After ${s.delayDays}d` : `After ${s.delayHours ?? 0}h`;
                                return (
                                    <div key={i} className={`rounded-xl border p-3 text-xs ${
                                        isStaff ? 'bg-amber-50 dark:bg-amber-900/10 border-amber-200 dark:border-amber-800'
                                            : 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700'
                                    }`}>
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="w-5 h-5 rounded-full bg-indigo-600 text-white text-[11px] font-black flex items-center justify-center shrink-0">{i + 1}</span>
                                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase ${chBadge[s.channelType] ?? chBadge.sms}`}>{chLabel[s.channelType] ?? s.channelType}</span>
                                            <span className="text-slate-400 text-[10px]">{delay}</span>
                                        </div>
                                        {isEmail
                                            ? <p className="text-slate-600 dark:text-slate-400 line-clamp-2"><span className="font-bold">Subj:</span> {s.emailSubject}</p>
                                            : <p className="text-slate-600 dark:text-slate-400 line-clamp-2">{s.message}</p>
                                        }
                                    </div>
                                );
                            })}
                        </div>
                        <button
                            onClick={handleApply}
                            disabled={applied || saving}
                            className={`w-full flex items-center justify-center gap-2 py-2.5 text-sm font-bold rounded-xl transition disabled:opacity-60 ${
                                applied
                                    ? 'bg-emerald-50 dark:bg-emerald-900/20 border-2 border-emerald-400 text-emerald-700 dark:text-emerald-300'
                                    : 'bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-200 dark:shadow-indigo-900/40'
                            }`}
                        >
                            {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</>
                                : applied ? '✓ Workflow Created'
                                : <><ChevronRight size={14} /> Create Workflow</>}
                        </button>
                    </div>
                </div>
            );
        };

        const bothApplied = appliedPair.invite && appliedPair.remind;
        const [savingBoth, setSavingBoth] = useState(false);

        const handleApplyBoth = async () => {
            setSavingBoth(true);
            try {
                if (onSaveDirectly) {
                    await Promise.all([
                        !appliedPair.invite ? onSaveDirectly(draftPair.invite, buildCtx('invite')) : Promise.resolve(),
                        !appliedPair.remind ? onSaveDirectly(draftPair.remind, buildCtx('remind')) : Promise.resolve(),
                    ]);
                } else {
                    if (!appliedPair.invite) onApply(draftPair.invite, buildCtx('invite'));
                    if (!appliedPair.remind) onApply(draftPair.remind, buildCtx('remind'));
                }
                setAppliedPair({ invite: true, remind: true });
            } finally {
                setSavingBoth(false);
            }
        };

        return (
            <div className="space-y-5">
                <div className="text-center">
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Two Workflows Generated</p>
                    <h3 className="text-base font-black text-slate-900 dark:text-white">Apply each workflow to the editor</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Apply each one separately — the editor loads one workflow at a time.</p>
                </div>

                <PairCard
                    label="Workflow 1 — Invitation" emoji={<Megaphone size={16} aria-hidden="true" />}
                    draft={draftPair.invite} goalKey="invite"
                    borderColor="border-blue-200 dark:border-blue-800"
                    headerBg="bg-blue-50 dark:bg-blue-900/20"
                    labelColor="text-blue-700 dark:text-blue-300"
                    subColor="text-blue-500 dark:text-blue-400"
                />

                <PairCard
                    label="Workflow 2 — Reminders" emoji={<Bell size={16} aria-hidden="true" />}
                    draft={draftPair.remind} goalKey="remind"
                    borderColor="border-indigo-200 dark:border-indigo-800"
                    headerBg="bg-indigo-50 dark:bg-indigo-900/20"
                    labelColor="text-indigo-700 dark:text-indigo-300"
                    subColor="text-indigo-500 dark:text-indigo-400"
                />

                <div className="flex items-center gap-3 pt-1">
                    <button
                        onClick={() => { setDraftPair(null); setAppliedPair({ invite: false, remind: false }); }}
                        className="flex items-center gap-2 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    >
                        <RotateCcw size={13} /> Regenerate
                    </button>
                    <div className="flex-1" />
                    {!bothApplied && (
                        <button
                            onClick={handleApplyBoth}
                            disabled={savingBoth}
                            className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 disabled:opacity-60 text-white text-sm font-bold rounded-xl transition"
                        >
                            {savingBoth ? <><Loader2 size={13} className="animate-spin" /> Saving...</> : 'Create Both Workflows'}
                        </button>
                    )}
                    <button
                        onClick={onClose}
                        className={`px-5 py-2.5 text-sm font-bold rounded-xl transition ${
                            bothApplied
                                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-md'
                                : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                        }`}
                    >
                        {bothApplied ? 'Done ✓' : 'Close'}
                    </button>
                </div>
            </div>
        );
    }

    if (draft) {
        return (
            <div className="space-y-4">
                <AiDraftPreview
                    draft={draft}
                    loading={loading}
                    onRegenerate={handleRegenerate}
                    onApply={() => onApply(draft, buildCtx())}
                    onClose={onClose}
                />
            </div>
        );
    }

    if (loading) {
        return (
            <div className="flex flex-col items-center justify-center py-16 gap-4 text-slate-400">
                <div className="relative">
                    <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                        <Sparkles size={28} className="text-indigo-500 animate-pulse" />
                    </div>
                    <Loader2 size={48} className="absolute inset-0 m-auto text-indigo-400 animate-spin opacity-40" />
                </div>
                <div className="text-center">
                    <p className="font-bold text-slate-700 dark:text-slate-300">Building your workflow...</p>
                    <p className="text-xs mt-1">AI is crafting every step with real content</p>
                </div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Progress bar */}
            <div className="space-y-1.5">
                <div className="flex justify-between text-[10px] font-bold uppercase tracking-wide text-slate-400">
                    <span>Step {step} of {TOTAL_STEPS}</span>
                    <span>{Math.round((step / TOTAL_STEPS) * 100)}%</span>
                </div>
                <div className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden">
                    <div
                        className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                        style={{ width: `${(step / TOTAL_STEPS) * 100}%` }}
                    />
                </div>
            </div>

            {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
                    <AlertTriangle size={16} className="shrink-0" /> {error}
                </div>
            )}

            {step === 1 && (
                <div className="space-y-5">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Step 1</p>
                        <h3 className="text-base font-black text-slate-900 dark:text-white">Tell me about the event</h3>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">What kind of event?</label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                onClick={() => { setEventType('registration'); setManualMode(false); }}
                                className={`p-4 rounded-2xl border-2 text-left transition ${eventType === 'registration' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}
                            >
                                <ClipboardList size={24} className="mb-1 text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
                                <p className="font-bold text-sm text-slate-900 dark:text-white">Registration Event</p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">People sign up via PCO Registrations</p>
                            </button>
                            <button
                                onClick={() => { setEventType('calendar'); setManualMode(true); setSelectedPcoEvent(null); }}
                                className={`p-4 rounded-2xl border-2 text-left transition ${eventType === 'calendar' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}
                            >
                                <CalendarDays size={24} className="mb-1 text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
                                <p className="font-bold text-sm text-slate-900 dark:text-white">Calendar Event</p>
                                <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-tight">A service, retreat, or campus event</p>
                            </button>
                        </div>
                    </div>

                    {eventType && (
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">What's the goal of this workflow?</label>
                            <div className="space-y-2">
                                <button
                                    onClick={() => setGoal('invite')}
                                    className={`w-full p-3.5 rounded-xl border-2 text-left transition ${
                                        goal === 'invite' ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-blue-300'
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <Megaphone size={20} className="shrink-0 text-blue-500 dark:text-blue-400" aria-hidden="true" />
                                        <div>
                                            <p className="font-bold text-sm text-slate-900 dark:text-white">Invite people to sign up</p>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">Messages go to a list of people who haven't registered yet — build excitement and drive signups</p>
                                        </div>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setGoal('remind')}
                                    className={`w-full p-3.5 rounded-xl border-2 text-left transition ${
                                        goal === 'remind' ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <Bell size={20} className="shrink-0 text-indigo-500 dark:text-indigo-400" aria-hidden="true" />
                                        <div>
                                            <p className="font-bold text-sm text-slate-900 dark:text-white">Remind registered attendees</p>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">Messages go to people who are already signed up — prepare them and build anticipation</p>
                                        </div>
                                    </div>
                                </button>
                                <button
                                    onClick={() => setGoal('both')}
                                    className={`w-full p-3.5 rounded-xl border-2 text-left transition ${
                                        goal === 'both' ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-emerald-300'
                                    }`}
                                >
                                    <div className="flex items-start gap-3">
                                        <Target size={20} className="shrink-0 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
                                        <div>
                                            <p className="font-bold text-sm text-slate-900 dark:text-white">Both — build two workflows</p>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 leading-snug">AI generates an Invitation workflow AND a Reminder workflow — apply each one separately</p>
                                        </div>
                                    </div>
                                </button>
                            </div>
                        </div>
                    )}

                    {eventType === 'registration' && !manualMode && (
                        <div className="space-y-3">
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Select event</label>
                            {pcoRegistrationEvents.length > 0 ? (
                                <select
                                    value={selectedPcoEvent?.pcoId ?? ''}
                                    onChange={e => {
                                        const ev = pcoRegistrationEvents.find(x => x.pcoId === e.target.value);
                                        setSelectedPcoEvent(ev ?? null);
                                    }}
                                    className={inputBase}
                                >
                                    <option value="">— Choose a PCO event —</option>
                                    {pcoRegistrationEvents.map(ev => (
                                        <option key={ev.pcoId} value={ev.pcoId}>
                                            {ev.name}{ev.startsAt ? ` · ${new Date(ev.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}` : ''}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <p className="text-xs text-slate-500 dark:text-slate-400 italic">No PCO events loaded — enter manually below.</p>
                            )}
                            <button
                                onClick={() => setManualMode(true)}
                                className="text-xs text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:no-underline transition"
                            >
                                Or enter event details manually →
                            </button>
                        </div>
                    )}

                    {(eventType === 'calendar' || manualMode) && (
                        <div className="space-y-3">
                            {eventType === 'registration' && (
                                <button
                                    onClick={() => setManualMode(false)}
                                    className="text-xs text-indigo-600 dark:text-indigo-400 underline underline-offset-2 hover:no-underline transition"
                                >
                                    ← Back to PCO event list
                                </button>
                            )}
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Event name</label>
                                <input
                                    type="text"
                                    value={manualName}
                                    onChange={e => setManualName(e.target.value)}
                                    placeholder="e.g. Easter Sunday Service"
                                    className={inputBase}
                                />
                            </div>
                            <div>
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1">Event date</label>
                                <input
                                    type="date"
                                    value={manualDate}
                                    onChange={e => setManualDate(e.target.value)}
                                    className={inputBase}
                                />
                            </div>
                        </div>
                    )}

                    {eventDisplayName && goal && (
                        <div className="flex items-center gap-2 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl px-3 py-2">
                            <span className="shrink-0 text-indigo-500 dark:text-indigo-400" aria-hidden="true">{eventType === 'registration' ? <ClipboardList size={14} /> : <CalendarDays size={14} />}</span>
                            <span className="text-xs font-bold text-indigo-700 dark:text-indigo-300">{eventDisplayName}</span>
                            {eventDisplayDate && <span className="text-xs text-slate-500 dark:text-slate-400">· {eventDisplayDate}</span>}
                            <span className="ml-auto inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-indigo-500 dark:text-indigo-400">
                                {goal === 'invite' ? <><Megaphone size={11} aria-hidden="true" /> Invite</> : goal === 'remind' ? <><Bell size={11} aria-hidden="true" /> Remind</> : <><Target size={11} aria-hidden="true" /> Both</>}
                            </span>
                        </div>
                    )}
                </div>
            )}

            {step === 2 && (
                <div className="space-y-5">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Step 2</p>
                        <h3 className="text-base font-black text-slate-900 dark:text-white">How many messages?</h3>
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-2">Number of messages to send</label>
                        <div className="flex items-center gap-3">
                            <button
                                onClick={() => setTouchpointCount(Math.max(1, touchpointCount - 1))}
                                className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition font-bold text-lg flex items-center justify-center"
                            >−</button>
                            <span className="w-10 text-center font-black text-xl text-slate-900 dark:text-white">{touchpointCount}</span>
                            <button
                                onClick={() => setTouchpointCount(Math.min(10, touchpointCount + 1))}
                                className="w-9 h-9 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition font-bold text-lg flex items-center justify-center"
                            >+</button>
                            <span className="text-xs text-slate-500 dark:text-slate-400">messages (max 10)</span>
                        </div>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">When should the first message go out?</label>
                        <label className={radioCard(timingMode === 'before_event')} onClick={() => setTimingMode('before_event')}>
                            <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                                timingMode === 'before_event' ? 'border-indigo-500' : 'border-slate-300 dark:border-slate-600'
                            }`}>
                                {timingMode === 'before_event' && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                            </div>
                            <div className="flex-1">
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">Days before the event</p>
                                {timingMode === 'before_event' && (
                                    <div className="flex items-center gap-2 mt-2">
                                        <input
                                            type="number"
                                            min={1} max={90}
                                            value={daysBefore}
                                            onChange={e => setDaysBefore(parseInt(e.target.value) || 1)}
                                            onClick={e => e.stopPropagation()}
                                            className="w-16 text-sm border border-slate-200 dark:border-slate-600 rounded-lg px-2 py-1 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                        <span className="text-xs text-slate-500">days before the event</span>
                                    </div>
                                )}
                            </div>
                        </label>
                        <label className={radioCard(timingMode === 'after_registration')} onClick={() => setTimingMode('after_registration')}>
                            <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                                timingMode === 'after_registration' ? 'border-indigo-500' : 'border-slate-300 dark:border-slate-600'
                            }`}>
                                {timingMode === 'after_registration' && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                            </div>
                            <div>
                                <p className="text-sm font-semibold text-slate-900 dark:text-white">Immediately after they register</p>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">First message sends right when they sign up</p>
                            </div>
                        </label>
                    </div>

                    <div className="space-y-2">
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">How should messages be spaced?</label>
                        {(['even', 'closer_to_event', 'ai_decides'] as const).map(s => (
                            <label key={s} className={radioCard(spacing === s)} onClick={() => setSpacing(s)}>
                                <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                                    spacing === s ? 'border-indigo-500' : 'border-slate-300 dark:border-slate-600'
                                }`}>
                                    {spacing === s && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                                </div>
                                <div>
                                    <p className="text-sm font-semibold text-slate-900 dark:text-white">
                                        {s === 'even' ? 'Evenly spread' : s === 'closer_to_event' ? 'Closer together near the event' : 'Let AI decide spacing'}
                                    </p>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                                        {s === 'even' ? 'Equal time between each message' : s === 'closer_to_event' ? 'More frequent reminders as the day approaches' : 'AI will choose the best cadence'}
                                    </p>
                                </div>
                            </label>
                        ))}
                    </div>
                </div>
            )}

            {step === 3 && (
                <div className="space-y-4">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Step 3</p>
                        <h3 className="text-base font-black text-slate-900 dark:text-white">What tone should these messages have?</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Be as specific as you like. This guides every word the AI writes.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                        {[
                            { label: 'Warm & Encouraging', value: 'Warm and encouraging, with a spiritual focus and personal touch' },
                            { label: 'Practical & Clear', value: 'Practical and clear — focus on logistics and next steps, keep it concise' },
                            { label: 'Excited & Celebratory', value: 'Excited and celebratory — high energy, enthusiastic, creates anticipation' },
                            { label: 'Reverent & Prayerful', value: 'Reverent and prayerful — scripture-rich, quiet, spiritually contemplative' },
                        ].map(t => (
                            <button
                                key={t.value}
                                onClick={() => setTone(t.value)}
                                className={`p-3 text-left rounded-xl border-2 transition text-xs font-semibold ${
                                    tone === t.value
                                        ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300'
                                        : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
                                }`}
                            >
                                {t.label}
                            </button>
                        ))}
                    </div>

                    <div>
                        <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Or describe the tone in your own words</label>
                        <textarea
                            rows={3}
                            value={tone}
                            onChange={e => setTone(e.target.value)}
                            placeholder='e.g. "Casual and friendly, like a text from a friend — include a relevant Bible verse in each message"'
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed"
                        />
                    </div>
                </div>
            )}

            {step === 4 && (
                <div className="space-y-5">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Step 4</p>
                        <h3 className="text-base font-black text-slate-900 dark:text-white">Staff follow-up alert?</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Automatically notify your pastor or staff team during the workflow.</p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                        <button
                            onClick={() => setIncludeStaffAlert(true)}
                            className={`p-4 rounded-2xl border-2 text-left transition ${includeStaffAlert ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}
                        >
                            <CircleCheck size={20} className="mb-1 text-emerald-500 dark:text-emerald-400" aria-hidden="true" />
                            <p className="font-bold text-sm text-slate-900 dark:text-white">Yes, alert staff</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Send a staff reminder email</p>
                        </button>
                        <button
                            onClick={() => setIncludeStaffAlert(false)}
                            className={`p-4 rounded-2xl border-2 text-left transition ${!includeStaffAlert ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}
                        >
                            <Ban size={20} className="mb-1 text-slate-400 dark:text-slate-500" aria-hidden="true" />
                            <p className="font-bold text-sm text-slate-900 dark:text-white">No staff alert</p>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Contacts only</p>
                        </button>
                    </div>

                    {includeStaffAlert && (
                        <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-4">
                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">When should the staff alert go out?</label>
                                {([
                                    { value: 'with_first', label: 'With the first message', desc: 'Staff notified as soon as the workflow starts' },
                                    { value: 'with_last', label: 'With the final message', desc: 'Staff alert fires alongside the last touchpoint' },
                                    { value: 'day_of_event', label: 'On the day of the event', desc: 'Last-minute heads-up for your team' },
                                ] as const).map(opt => (
                                    <label key={opt.value} className={radioCard(staffAlertTiming === opt.value)} onClick={() => setStaffAlertTiming(opt.value)}>
                                        <div className={`w-4 h-4 rounded-full border-2 mt-0.5 shrink-0 flex items-center justify-center ${
                                            staffAlertTiming === opt.value ? 'border-indigo-500' : 'border-slate-300 dark:border-slate-600'
                                        }`}>
                                            {staffAlertTiming === opt.value && <div className="w-2 h-2 rounded-full bg-indigo-500" />}
                                        </div>
                                        <div>
                                            <p className="text-sm font-semibold text-slate-900 dark:text-white">{opt.label}</p>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{opt.desc}</p>
                                        </div>
                                    </label>
                                ))}
                            </div>

                            <div className="space-y-2">
                                <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400">Include registrant count in the staff message?</label>
                                <div className="grid grid-cols-2 gap-2">
                                    <button
                                        onClick={() => setIncludeRegistrantCount(true)}
                                        className={`p-3 rounded-xl border-2 text-left text-xs font-semibold transition ${
                                            includeRegistrantCount ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
                                        }`}
                                    >
                                        Yes — show <span className="font-black">{'{registrantCount}'}</span> people registered
                                    </button>
                                    <button
                                        onClick={() => setIncludeRegistrantCount(false)}
                                        className={`p-3 rounded-xl border-2 text-left text-xs font-semibold transition ${
                                            !includeRegistrantCount ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-indigo-300'
                                        }`}
                                    >
                                        No — just the alert
                                    </button>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            )}

            {step === 5 && (
                <div className="space-y-4">
                    <div>
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Step 5</p>
                        <h3 className="text-base font-black text-slate-900 dark:text-white">Anything specific to include?</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Optional — the AI will handle everything, but you can guide it here.</p>
                    </div>

                    <textarea
                        rows={5}
                        value={customContent}
                        onChange={e => setCustomContent(e.target.value)}
                        placeholder={'e.g. "Mention parking is on the east side, include John 3:16 in the final message, and remind them to bring a friend"'}
                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none leading-relaxed"
                    />

                    <div className="bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-2 text-xs">
                        <p className="font-bold text-[10px] uppercase tracking-wide text-slate-400 mb-2">Summary</p>
                        <div className="grid grid-cols-2 gap-x-4 gap-y-1.5">
                            <div><span className="text-slate-500">Event:</span> <span className="font-semibold text-slate-800 dark:text-slate-200">{eventDisplayName || '—'}</span></div>
                            <div><span className="text-slate-500">Date:</span> <span className="font-semibold text-slate-800 dark:text-slate-200">{eventDisplayDate || '—'}</span></div>
                            <div><span className="text-slate-500">Messages:</span> <span className="font-semibold text-slate-800 dark:text-slate-200">{touchpointCount}</span></div>
                            <div><span className="text-slate-500">Timing:</span> <span className="font-semibold text-slate-800 dark:text-slate-200">{timingMode === 'before_event' ? `${daysBefore}d before` : 'After registration'}</span></div>
                            <div><span className="text-slate-500">Channels:</span> <span className="font-semibold text-slate-800 dark:text-slate-200">SMS + Email mix</span></div>
                            <div><span className="text-slate-500">Staff alert:</span> <span className="font-semibold text-slate-800 dark:text-slate-200">{includeStaffAlert ? 'Yes' : 'No'}</span></div>
                        </div>
                        <div className="pt-1"><span className="text-slate-500">Tone:</span> <span className="font-semibold text-slate-800 dark:text-slate-200 italic">{tone}</span></div>
                    </div>
                </div>
            )}

            {/* Navigation */}
            <div className="flex items-center gap-3 pt-2">
                {step > 1 ? (
                    <button
                        onClick={() => setStep(s => s - 1)}
                        className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-600 text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    >
                        <ArrowLeft size={14} /> Back
                    </button>
                ) : (
                    <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition">Cancel</button>
                )}
                <div className="flex-1" />
                {step < TOTAL_STEPS ? (
                    <button
                        onClick={() => setStep(s => s + 1)}
                        disabled={!canProceed()}
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition"
                    >
                        Next <ChevronRight size={15} />
                    </button>
                ) : (
                    <button
                        onClick={handleGenerate}
                        disabled={loading}
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition shadow-md shadow-indigo-200 dark:shadow-indigo-900/40"
                    >
                        <Sparkles size={14} /> Generate Workflow
                    </button>
                )}
            </div>
        </div>
    );
};

// ─── Custom prompt tab ────────────────────────────────────────────────────────

const CustomPromptTab: React.FC<{
    onApply: (draft: AiWorkflowDraft) => void;
    onClose: () => void;
}> = ({ onApply, onClose }) => {
    const [prompt, setPrompt] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [draft, setDraft] = useState<AiWorkflowDraft | null>(null);

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

    if (draft) {
        return (
            <AiDraftPreview
                draft={draft}
                loading={loading}
                prompt={prompt}
                onRegenerate={async () => { setDraft(null); setLoading(true); try { const r = await generateWorkflowWithAi(prompt); setDraft(r); } catch(e:any){setError(e.message);} finally{setLoading(false);} }}
                onApply={() => onApply(draft)}
                onClose={onClose}
            />
        );
    }

    return (
        <div className="space-y-5">
            <div>
                <label className="block text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">Describe Your Workflow</label>
                <textarea
                    rows={5}
                    value={prompt}
                    onChange={e => setPrompt(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder="e.g. Send a text once a day for 5 days with a Bible verse about prayer. On the last day, remind them the church has them on the prayer list."
                    className="w-full text-sm border-2 border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 dark:focus:border-indigo-400 resize-none leading-relaxed"
                />
                <p className="text-[10px] text-slate-400 mt-1.5">Tip: ⌘ / Ctrl + Enter to generate</p>
            </div>

            {!loading && (
                <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Try an example</p>
                    <div className="space-y-2">
                        {EXAMPLE_PROMPTS.map((ep, i) => (
                            <button
                                key={i}
                                onClick={() => setPrompt(ep)}
                                className="w-full text-left text-xs text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 hover:text-indigo-700 dark:hover:text-indigo-300 border border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-700 rounded-xl px-3 py-2.5 transition leading-relaxed"
                            >
                                "{ep}"
                            </button>
                        ))}
                    </div>
                </div>
            )}

            {loading && (
                <div className="flex flex-col items-center justify-center py-12 gap-4 text-slate-400">
                    <div className="relative">
                        <div className="w-16 h-16 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center">
                            <Sparkles size={28} className="text-indigo-500 animate-pulse" />
                        </div>
                        <Loader2 size={48} className="absolute inset-0 m-auto text-indigo-400 animate-spin opacity-40" />
                    </div>
                    <div className="text-center">
                        <p className="font-bold text-slate-700 dark:text-slate-300">Building your workflow...</p>
                        <p className="text-xs mt-1">AI is writing every step with real content</p>
                    </div>
                </div>
            )}

            {error && (
                <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-2xl p-4">
                    <AlertTriangle size={16} className="shrink-0" /> {error}
                </div>
            )}

            <div className="flex items-center gap-3 pt-1">
                <div className="flex-1" />
                <button onClick={onClose} className="px-4 py-2.5 text-sm font-semibold rounded-xl text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700 transition">Cancel</button>
                <button
                    onClick={handleGenerate}
                    disabled={loading || !prompt.trim()}
                    className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition shadow-md shadow-indigo-200 dark:shadow-indigo-900/40"
                >
                    {loading ? <><Loader2 size={14} className="animate-spin" /> Generating...</> : <><Sparkles size={14} /> Generate Workflow</>}
                </button>
            </div>
        </div>
    );
};

// ─── Main AI Workflow Builder modal (tabs) ────────────────────────────────────

const AiWorkflowBuilderPanel: React.FC<{
    onApply: (draft: AiWorkflowDraft, ctx?: AiBuilderContext) => void;
    onSaveDirectly?: (draft: AiWorkflowDraft, ctx: AiBuilderContext) => Promise<void>;
    onClose: () => void;
    pcoRegistrationEvents?: { id: string; pcoId: string; name: string; startsAt?: string | null }[];
}> = ({ onApply, onSaveDirectly, onClose, pcoRegistrationEvents = [] }) => {
    const [activeTab, setActiveTab] = useState<'guided' | 'custom'>('guided');

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
            <div
                className="relative w-full max-w-2xl bg-white dark:bg-slate-900 flex flex-col shadow-2xl overflow-hidden rounded-3xl max-h-[92vh]"
                onClick={e => e.stopPropagation()}
            >
                <div className="shrink-0 px-6 pt-5 pb-0 bg-gradient-to-r from-indigo-600 to-purple-600">
                    <div className="flex items-center justify-between mb-4">
                        <div className="flex items-center gap-3">
                            <div className="w-9 h-9 bg-white/20 rounded-2xl flex items-center justify-center text-white">
                                <Sparkles size={18} />
                            </div>
                            <div>
                                <h2 className="text-white font-black text-base">AI Workflow Builder</h2>
                                <p className="text-indigo-200 text-xs">Let AI write every step — guided or freeform</p>
                            </div>
                        </div>
                        <button onClick={onClose} title="Close" className="p-1.5 rounded-xl text-white/70 hover:text-white hover:bg-white/20 transition">
                            <X size={18} />
                        </button>
                    </div>
                    <div className="flex">
                        <button
                            onClick={() => setActiveTab('guided')}
                            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-t-xl transition ${
                                activeTab === 'guided'
                                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300'
                                    : 'text-white/70 hover:text-white hover:bg-white/10'
                            }`}
                        >
                            <Sparkles size={13} /> Guided
                        </button>
                        <button
                            onClick={() => setActiveTab('custom')}
                            className={`flex items-center gap-1.5 px-5 py-2.5 text-sm font-bold rounded-t-xl transition ${
                                activeTab === 'custom'
                                    ? 'bg-white dark:bg-slate-900 text-indigo-700 dark:text-indigo-300'
                                    : 'text-white/70 hover:text-white hover:bg-white/10'
                            }`}
                        >
                            <MessageCircle size={13} /> Custom Prompt
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-6">
                    {activeTab === 'guided' ? (
                        <GuidedBuilderTab
                            pcoRegistrationEvents={pcoRegistrationEvents}
                            onApply={(draft, ctx) => { onApply(draft, ctx); onClose(); }}
                            onSaveDirectly={onSaveDirectly}
                            onClose={onClose}
                        />
                    ) : (
                        <CustomPromptTab
                            onApply={draft => { onApply(draft); onClose(); }}
                            onClose={onClose}
                        />
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Workflow Editor ---------------------------------------------------------

const WorkflowEditor: React.FC<{
    initial: SmsWorkflow | null;
    churchId: string;
    keywords: SmsKeyword[];
    pcoLists: { id: string; name: string }[];
    pcoGroups: { id: string; name: string }[];
    smsTags: SmsTag[];
    pcoRegistrationEvents: { id: string; pcoId: string; name: string; startsAt?: string | null }[];
    twilioNumbers: TwilioPhoneNumber[];
    onSave: (wf: SmsWorkflow) => Promise<void>;
    onBack: () => void;
    isBusy: boolean;
}> = ({ initial, churchId, keywords, pcoLists, pcoGroups, smsTags, pcoRegistrationEvents, twilioNumbers, onSave, onBack, isBusy }) => {

    const stepsToNodes = (steps: SmsWorkflowStep[]): WorkflowNode[] => {
        const nodes: WorkflowNode[] = [];
        steps.forEach((s, i) => {
            if (i > 0 && (s.delayDays > 0 || (s.delayHours && s.delayHours > 0) || s.scheduleType !== undefined)) {
                const delay: WorkflowDelayNode = {
                    nodeType: 'delay', id: uid(), order: nodes.length,
                    delayDays: s.delayDays ?? 1,
                    delayHours: s.delayHours ?? 0,
                    scheduleType: s.scheduleType,
                    scheduleDayOfWeek: s.scheduleDayOfWeek,
                    scheduleDayOfMonth: s.scheduleDayOfMonth,
                    scheduleTime: s.scheduleTime,
                };
                nodes.push(delay);
            }
            const action: WorkflowActionNode = {
                nodeType: 'action', id: s.id, order: nodes.length,
                channelType: s.channelType ?? 'sms',
                message: s.message,
                mediaUrls: s.mediaUrls,
                emailSubject: s.emailSubject,
                emailBody: s.emailBody,
                staffTargetType: s.staffTargetType,
                staffRecipients: s.staffRecipients,
                staffListId: s.staffListId,
                staffListName: s.staffListName,
                staffGroupId: s.staffGroupId,
                staffGroupName: s.staffGroupName,
            };
            nodes.push(action);
        });
        return nodes;
    };

    const nodesToSteps = (nodes: WorkflowNode[]): SmsWorkflowStep[] => {
        const steps: SmsWorkflowStep[] = [];
        let pendingDelay: WorkflowDelayNode | null = null;
        let order = 0;

        const pushAction = (an: WorkflowActionNode, delay: WorkflowDelayNode | null) => {
            steps.push({
                id: an.id,
                order: order++,
                channelType: an.channelType,
                message: an.message,
                mediaUrls: an.mediaUrls,
                emailSubject: an.emailSubject,
                emailBody: an.emailBody,
                staffTargetType: an.staffTargetType,
                staffRecipients: an.staffRecipients,
                staffListId: an.staffListId,
                staffListName: an.staffListName,
                staffGroupId: an.staffGroupId,
                staffGroupName: an.staffGroupName,
                delayDays: delay?.delayDays ?? 0,
                delayHours: delay?.delayHours ?? 0,
                scheduleType: delay?.scheduleType,
                scheduleDayOfWeek: delay?.scheduleDayOfWeek,
                scheduleDayOfMonth: delay?.scheduleDayOfMonth,
                scheduleDate: delay?.scheduleDate,
                scheduleTime: delay?.scheduleTime,
            });
        };

        for (const node of nodes) {
            if (node.nodeType === 'delay') {
                pendingDelay = node;
            } else if (node.nodeType === 'action') {
                pushAction(node, pendingDelay);
                pendingDelay = null;
            } else if (node.nodeType === 'branch') {
                for (const an of node.thenNodes) pushAction(an, null);
                pendingDelay = null;
            }
        }
        return steps;
    };

    const buildInitialNodes = (): WorkflowNode[] => {
        if (initial?.nodes && initial.nodes.length > 0) return initial.nodes;
        if (initial?.steps && initial.steps.length > 0) return stepsToNodes(initial.steps);
        return [{ nodeType: 'action', id: uid(), order: 0, channelType: 'sms', message: '' }];
    };

    const makeBlank = (): SmsWorkflow => ({
        id: uid(),
        churchId,
        name: '',
        description: '',
        twilioNumberId: null,
        trigger: 'manual',
        triggerKeywordId: null,
        triggerKeywordWord: null,
        triggerListId: null,
        triggerListName: null,
        triggerEventId: null,
        triggerEventName: null,
        steps: [],
        nodes: [{ nodeType: 'action', id: uid(), order: 0, channelType: 'sms', message: '' }],
        isActive: true,
        enrolledCount: 0,
        completedCount: 0,
        createdAt: Date.now(),
        updatedAt: Date.now(),
        allowReentry: false,
    });

    const [wf, setWf] = useState<SmsWorkflow>(initial ?? makeBlank());
    const [nodes, setNodes] = useState<WorkflowNode[]>(buildInitialNodes);
    const [error, setError] = useState('');
    const [showAiBuilder, setShowAiBuilder] = useState(false);
    const [showTestDrawer, setShowTestDrawer] = useState(false);

    const handleApplyAiDraft = (draft: AiWorkflowDraft, ctx?: AiBuilderContext) => {
        const newNodes: WorkflowNode[] = [];
        draft.steps.forEach((s, i) => {
            if (i > 0) {
                const schedType = s.scheduleType ?? 'relative';
                const delayNode: WorkflowDelayNode = {
                    nodeType: 'delay',
                    id: uid(),
                    order: newNodes.length,
                    delayDays: s.delayDays ?? (schedType === 'relative' ? 1 : 0),
                    delayHours: s.delayHours ?? 0,
                    scheduleType: schedType,
                    ...(schedType === 'day_of_week' && { scheduleDayOfWeek: s.scheduleDayOfWeek ?? 1 }),
                    ...(schedType === 'day_of_month' && { scheduleDayOfMonth: s.scheduleDayOfMonth ?? 1 }),
                    ...(schedType !== 'relative' ? { scheduleTime: s.scheduleTime ?? '09:00' } : (s.scheduleTime ? { scheduleTime: s.scheduleTime } : {})),
                };
                newNodes.push(delayNode);
            }
            newNodes.push({
                nodeType: 'action',
                id: uid(),
                order: newNodes.length,
                channelType: (s.channelType ?? 'sms') as WorkflowChannelType,
                message: s.message || '',
                emailSubject: s.emailSubject,
                emailBody: s.emailBody,
            });
        });
        setNodes(newNodes);

        const wfPatch: Partial<SmsWorkflow> = {
            name: draft.name || wf.name,
            description: draft.description || wf.description,
        };

        if (ctx) {
            const effectiveGoal = ctx.goal;
            if (effectiveGoal === 'remind' && ctx.eventType === 'registration' && ctx.eventPcoId) {
                wfPatch.trigger = 'event_registration';
                wfPatch.triggerEventId = ctx.eventPcoId;
                wfPatch.triggerEventName = ctx.eventName;
            }
        }

        setWf(prev => ({ ...prev, ...wfPatch }));
    };

    const handleSaveAiDraftDirectly = async (draft: AiWorkflowDraft, ctx: AiBuilderContext): Promise<void> => {
        const newNodes: WorkflowNode[] = [];
        draft.steps.forEach((s, i) => {
            if (i > 0) {
                const schedType = s.scheduleType ?? 'relative';
                newNodes.push({
                    nodeType: 'delay', id: uid(), order: newNodes.length,
                    delayDays: s.delayDays ?? (schedType === 'relative' ? 1 : 0),
                    delayHours: s.delayHours ?? 0,
                    scheduleType: schedType,
                    ...(schedType === 'day_of_week' && { scheduleDayOfWeek: s.scheduleDayOfWeek ?? 1 }),
                    ...(schedType === 'day_of_month' && { scheduleDayOfMonth: s.scheduleDayOfMonth ?? 1 }),
                    ...(schedType !== 'relative' ? { scheduleTime: s.scheduleTime ?? '09:00' } : (s.scheduleTime ? { scheduleTime: s.scheduleTime } : {})),
                } as WorkflowDelayNode);
            }
            newNodes.push({
                nodeType: 'action', id: uid(), order: newNodes.length,
                channelType: (s.channelType ?? 'sms') as WorkflowChannelType,
                message: s.message || '',
                emailSubject: s.emailSubject,
                emailBody: s.emailBody,
            } as WorkflowActionNode);
        });

        const newWf: SmsWorkflow = {
            ...makeBlank(),
            name: draft.name || ctx.eventName,
            description: draft.description || '',
            nodes: newNodes,
            steps: nodesToSteps(newNodes),
            isActive: false,
        };

        if (ctx.goal === 'remind' && ctx.eventType === 'registration' && ctx.eventPcoId) {
            newWf.trigger = 'event_registration';
            newWf.triggerEventId = ctx.eventPcoId;
            newWf.triggerEventName = ctx.eventName;
        }

        await onSave(newWf);
    };

    const patch = (p: Partial<SmsWorkflow>) => setWf(prev => ({ ...prev, ...p }));
    const reorder = (ns: WorkflowNode[]) => ns.map((n, i) => ({ ...n, order: i }));

    const addActionNode = () => setNodes(ns => reorder([...ns, {
        nodeType: 'action', id: uid(), order: ns.length, channelType: 'sms', message: ''
    }]));

    const addDelayNode = () => setNodes(ns => reorder([...ns, {
        nodeType: 'delay', id: uid(), order: ns.length, delayDays: 1, delayHours: 0, scheduleType: 'relative'
    }]));

    const addBranchNode = () => setNodes(ns => reorder([...ns, {
        nodeType: 'branch', id: uid(), order: ns.length,
        conditionType: 'replied', thenNodes: [], elseNodes: []
    }]));

    const updateNode = (idx: number, p: Partial<WorkflowNode>) =>
        setNodes(ns => ns.map((n, i) => i === idx ? { ...n, ...p } as WorkflowNode : n));

    const deleteNode = (idx: number) =>
        setNodes(ns => reorder(ns.filter((_, i) => i !== idx)));

    const moveNode = (idx: number, dir: 'up' | 'down') =>
        setNodes(ns => {
            const arr = [...ns];
            const swap = dir === 'up' ? idx - 1 : idx + 1;
            [arr[idx], arr[swap]] = [arr[swap], arr[idx]];
            return reorder(arr);
        });

    const validateActionNode = (an: WorkflowActionNode): string | null => {
        const ch = an.channelType ?? 'sms';
        if (ch === 'email') {
            if (!an.emailSubject?.trim() || !an.emailBody?.trim()) return 'All Email steps need a subject and body.';
        } else if (ch === 'staff_email') {
            if (!an.emailSubject?.trim() || !an.emailBody?.trim()) return 'All Staff Email steps need a subject and body.';
            const tt = an.staffTargetType ?? 'individuals';
            if (tt === 'individuals' && !an.staffRecipients?.length) return 'Staff Email step needs at least one recipient.';
            if (tt === 'list' && !an.staffListId) return 'Staff Email step needs a list target.';
            if (tt === 'group' && !an.staffGroupId) return 'Staff Email step needs a group target.';
        } else if (ch === 'staff_sms') {
            if (!an.message.trim()) return 'All Staff SMS steps must have a message.';
            const tt = an.staffTargetType ?? 'individuals';
            if (tt === 'individuals' && !an.staffRecipients?.length) return 'Staff SMS step needs at least one recipient.';
            if (tt === 'list' && !an.staffListId) return 'Staff SMS step needs a list target.';
            if (tt === 'group' && !an.staffGroupId) return 'Staff SMS step needs a group target.';
        } else {
            if (!an.message.trim()) return 'All SMS / MMS steps must have a message.';
        }
        return null;
    };

    const handleSave = async () => {
        if (!wf.name.trim()) { setError('Workflow name is required.'); return; }
        const actionNodes = nodes.filter(n => n.nodeType === 'action') as WorkflowActionNode[];
        const branchNodes = nodes.filter(n => n.nodeType === 'branch') as WorkflowBranchNode[];
        const allActions = [
            ...actionNodes,
            ...branchNodes.flatMap(b => [...b.thenNodes, ...b.elseNodes]),
        ];
        if (allActions.length === 0 && branchNodes.length === 0) {
            setError('Add at least one Action step.'); return;
        }
        for (const an of allActions) {
            const err = validateActionNode(an);
            if (err) { setError(err); return; }
        }
        if (wf.trigger === 'keyword' && !wf.triggerKeywordId) { setError('Select a keyword trigger.'); return; }
        if (wf.trigger === 'list_add' && !wf.triggerListId) { setError('Select a PCO list trigger.'); return; }
        if (wf.trigger === 'event_registration' && !wf.triggerEventId) { setError('Select a PCO event trigger.'); return; }
        setError('');
        const flatSteps = nodesToSteps(nodes);
        await onSave({ ...wf, nodes, steps: flatSteps, updatedAt: Date.now() });
    };

    const triggerLabel: Record<string, string> = {
        manual: 'Staff manually enrolls a contact',
        keyword: 'Contact texts a keyword',
        list_add: 'Contact added to a PCO List',
        birthday: 'Fires each year on birthdays',
        anniversary: 'Fires each year on anniversaries',
        event_registration: 'Contact registers for a PCO event',
    };

    return (
        <div className="flex flex-col h-full">
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
                <div className="flex items-center gap-3">
                    <button onClick={onBack} title="Back to workflows" className="p-1.5 rounded-xl text-slate-500 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                        <ArrowLeft size={18} />
                    </button>
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                        <span className="cursor-pointer hover:text-indigo-600 font-medium" onClick={onBack}>Workflows</span>
                        <span className="mx-1.5 text-slate-300 dark:text-slate-600">/</span>
                        <span className="font-semibold text-slate-900 dark:text-white">{wf.name || 'New Workflow'}</span>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setShowAiBuilder(true)}
                        title="Build this workflow with AI"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-indigo-300 dark:border-indigo-600 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition"
                    >
                        <Sparkles size={12} /> AI Build
                    </button>
                    <button
                        onClick={() => setShowTestDrawer(true)}
                        title="Simulate / Test this workflow"
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl border border-slate-300 dark:border-slate-600 bg-slate-50 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                    >
                        <Beaker size={12} /> Test Simulator
                    </button>
                    <button
                        onClick={() => patch({ isActive: !wf.isActive })}
                        className={`flex items-center gap-2 px-3 py-1.5 text-xs font-bold rounded-xl border transition ${wf.isActive ? 'border-emerald-400 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-300' : 'border-slate-300 dark:border-slate-600 text-slate-500'}`}
                    >
                        <span className={`w-2 h-2 rounded-full ${wf.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                        {wf.isActive ? 'Active' : 'Paused'}
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={isBusy}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition"
                    >
                        {isBusy ? <Loader2 size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                        {initial ? 'Save Changes' : 'Create Workflow'}
                    </button>
                </div>
            </div>

            {showAiBuilder && (
                <AiWorkflowBuilderPanel
                    onApply={handleApplyAiDraft}
                    onSaveDirectly={handleSaveAiDraftDirectly}
                    onClose={() => setShowAiBuilder(false)}
                    pcoRegistrationEvents={pcoRegistrationEvents}
                />
            )}

            <div className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto p-6 space-y-6">
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Workflow Details</p>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Name</label>
                            <input
                                type="text"
                                value={wf.name}
                                onChange={e => patch({ name: e.target.value })}
                                placeholder="e.g. New Visitor Follow-Up"
                                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Description <span className="font-normal opacity-60">(optional)</span></label>
                            <textarea
                                rows={2}
                                value={wf.description || ''}
                                onChange={e => patch({ description: e.target.value })}
                                placeholder="What does this workflow do?"
                                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Sending Phone Number</label>
                            <select
                                value={wf.twilioNumberId || ''}
                                onChange={e => patch({ twilioNumberId: e.target.value || null })}
                                title="Sending Phone Number"
                                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="">(Default Church Number)</option>
                                {twilioNumbers.map(num => (
                                    <option key={num.id} value={num.id}>{num.friendlyLabel} ({num.phoneNumber})</option>
                                ))}
                            </select>
                            <p className="text-[10px] text-slate-400 mt-1">If set, all steps in this workflow will be sent from this specific number instead of your church's default number.</p>
                        </div>
                        <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-col gap-1">
                            <label className="flex items-center gap-2 cursor-pointer select-none">
                                <input
                                    type="checkbox"
                                    checked={!!wf.allowReentry}
                                    onChange={e => patch({ allowReentry: e.target.checked })}
                                    className="w-4 h-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500 bg-white dark:bg-slate-800"
                                />
                                <span className="text-xs font-bold text-slate-700 dark:text-slate-300">Allow Re-entry (Recurrence)</span>
                            </label>
                            <p className="text-[10px] text-slate-400 leading-normal">If enabled, contacts can be enrolled into this workflow multiple times (e.g. on registering for different events or texting a keyword repeatedly). If disabled, they are skipped if already enrolled.</p>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Trigger</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">What event starts enrolling a contact into this workflow?</p>

                        <div className="grid grid-cols-3 gap-2">
                            {(['manual', 'keyword', 'list_add'] as const).map(t => (
                                <button
                                    key={t}
                                    onClick={() => patch({ trigger: t })}
                                    className={`p-3 rounded-xl border-2 text-left transition ${wf.trigger === t ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300'}`}
                                >
                                    <p className="flex items-center gap-1 text-xs font-black text-slate-900 dark:text-white mb-0.5">
                                        {t === 'manual' ? <><Hand size={12} aria-hidden="true" /> Manual</> : t === 'keyword' ? <><MessageCircle size={12} aria-hidden="true" /> Keyword</> : <><ClipboardList size={12} aria-hidden="true" /> List Add</>}
                                    </p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{triggerLabel[t]}</p>
                                </button>
                            ))}
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            {(['birthday', 'anniversary'] as const).map(t => (
                                <button
                                    key={t}
                                    onClick={() => patch({ trigger: t })}
                                    className={`p-3 rounded-xl border-2 text-left transition ${wf.trigger === t
                                            ? 'border-pink-500 bg-pink-50 dark:bg-pink-900/20'
                                            : 'border-slate-200 dark:border-slate-700 hover:border-pink-300'
                                        }`}
                                >
                                    <p className="flex items-center gap-1 text-xs font-black text-slate-900 dark:text-white mb-0.5">
                                        {t === 'birthday' ? <><Cake size={12} aria-hidden="true" /> Birthday</> : <><Gem size={12} aria-hidden="true" /> Anniversary</>}
                                    </p>
                                    <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{triggerLabel[t]}</p>
                                </button>
                            ))}
                        </div>

                        <button
                            onClick={() => patch({ trigger: 'event_registration' })}
                            className={`w-full p-3 rounded-xl border-2 text-left transition ${wf.trigger === 'event_registration'
                                    ? 'border-teal-500 bg-teal-50 dark:bg-teal-900/20'
                                    : 'border-slate-200 dark:border-slate-700 hover:border-teal-300'
                                }`}
                        >
                            <p className="flex items-center gap-1 text-xs font-black text-slate-900 dark:text-white mb-0.5"><Ticket size={12} aria-hidden="true" /> Event Registration</p>
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-tight">{triggerLabel.event_registration}</p>
                        </button>

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
                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">-- Select a keyword --</option>
                                        {keywords.filter(k => k.isActive).map(k => (
                                            <option key={k.id} value={k.id}>{k.keyword}</option>
                                        ))}
                                    </select>
                                )}
                                <p className="text-[10px] text-slate-400 mt-1">When someone texts this keyword, they're immediately enrolled and Step 1 runs.</p>
                            </div>
                        )}

                        {wf.trigger === 'list_add' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">PCO List</label>
                                    <select
                                        value={wf.triggerListId || ''}
                                        onChange={e => {
                                            const l = pcoLists.find(x => x.id === e.target.value);
                                            patch({ triggerListId: e.target.value || null, triggerListName: l?.name || null });
                                        }}
                                        title="Trigger PCO list"
                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">-- Select a list --</option>
                                        {pcoLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                    </select>
                                    <p className="text-[10px] text-slate-400 mt-1">New members are enrolled automatically each day. Existing enrollees are never re-enrolled.</p>
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">PCO Group <span className="font-normal text-slate-400">(optional — also enroll from a group)</span></label>
                                    <select
                                        value={wf.triggerGroupId || ''}
                                        onChange={e => {
                                            const g = pcoGroups.find(x => x.id === e.target.value);
                                            patch({ triggerGroupId: e.target.value || null, triggerGroupName: g?.name || null });
                                        }}
                                        title="Additional PCO group to daily-sync"
                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">-- None --</option>
                                        {pcoGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                    </select>
                                </div>
                            </div>
                        )}

                        {wf.trigger === 'event_registration' && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">PCO Event</label>
                                    {pcoRegistrationEvents.length === 0 ? (
                                        <p className="text-xs text-amber-600 dark:text-amber-400">No registration events found. Run a PCO sync first, or ensure your account has the Registrations module.</p>
                                    ) : (
                                        <select
                                            value={wf.triggerEventId || ''}
                                            onChange={e => {
                                                const ev = pcoRegistrationEvents.find(x => x.pcoId === e.target.value);
                                                patch({ triggerEventId: e.target.value || null, triggerEventName: ev?.name || null });
                                            }}
                                            title="Trigger PCO registration event"
                                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                                        >
                                            <option value="">-- Select an event --</option>
                                            {pcoRegistrationEvents.map(ev => (
                                                <option key={ev.pcoId} value={ev.pcoId}>
                                                    {ev.name}{ev.startsAt ? ` (${new Date(ev.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })})` : ''}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                                </div>
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Send at what time?</label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="time"
                                            value={wf.triggerTime ?? '09:00'}
                                            onChange={e => patch({ triggerTime: e.target.value })}
                                            title="Trigger time"
                                            className="w-48 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-teal-500"
                                        />
                                        <span className="text-xs text-slate-400">
                                            Step 1 will fire at {(() => {
                                                const [h, m] = (wf.triggerTime ?? '09:00').split(':').map(Number);
                                                const ampm = h >= 12 ? 'PM' : 'AM';
                                                const h12 = h % 12 || 12;
                                                return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
                                            })()}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2.5 p-3.5 bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800 rounded-xl">
                                    <Ticket size={18} className="shrink-0 mt-0.5 text-teal-600 dark:text-teal-400" aria-hidden="true" />
                                    <div className="text-xs text-teal-700 dark:text-teal-300 leading-relaxed">
                                        <p className="font-bold mb-0.5">Enrolls once per person</p>
                                        <p>The daily scanner checks confirmed registrants for this event and enrolls anyone not yet in the workflow. Each person is only enrolled once, regardless of how many times the scanner runs. Use <span className="font-mono bg-teal-100 dark:bg-teal-900/40 px-1 rounded">{'{firstName}'}</span> in your messages to personalize them.</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        {(wf.trigger === 'birthday' || wf.trigger === 'anniversary') && (
                            <div className="space-y-3">
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Send how many days before?</label>
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
                                <div>
                                    <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 mb-1.5">Send at what time?</label>
                                    <div className="flex items-center gap-3">
                                        <input
                                            type="time"
                                            value={wf.triggerTime ?? '09:00'}
                                            onChange={e => patch({ triggerTime: e.target.value })}
                                            title="Trigger time"
                                            className="w-48 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-pink-500"
                                        />
                                        <span className="text-xs text-slate-400">
                                            Step 1 will fire at {(() => {
                                                const [h, m] = (wf.triggerTime ?? '09:00').split(':').map(Number);
                                                const ampm = h >= 12 ? 'PM' : 'AM';
                                                const h12 = h % 12 || 12;
                                                return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
                                            })()}
                                        </span>
                                    </div>
                                </div>
                                <div className="flex items-start gap-2.5 p-3.5 bg-pink-50 dark:bg-pink-900/20 border border-pink-200 dark:border-pink-800 rounded-xl">
                                    <span className="shrink-0 mt-0.5 text-pink-600 dark:text-pink-400" aria-hidden="true">{wf.trigger === 'birthday' ? <Cake size={18} /> : <Gem size={18} />}</span>
                                    <div className="text-xs text-pink-700 dark:text-pink-300 leading-relaxed">
                                        <p className="font-bold mb-0.5">Automatically fires every year</p>
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

                    <div className="space-y-3">
                        <div className="flex items-center justify-between">
                            <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                Sequence ({nodes.filter(n => n.nodeType === 'action').length} step{nodes.filter(n => n.nodeType === 'action').length !== 1 ? 's' : ''})
                            </p>
                            <div className="flex items-center gap-1.5">
                                <button onClick={addActionNode}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-[10px] font-bold rounded-xl transition">
                                    <Plus size={11} /> Action
                                </button>
                                <button onClick={addDelayNode}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white text-[10px] font-bold rounded-xl transition">
                                    <Clock size={11} /> Delay
                                </button>
                                <button onClick={addBranchNode}
                                    className="flex items-center gap-1 px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[10px] font-bold rounded-xl transition">
                                    <GitBranch size={11} /> Branch
                                </button>
                            </div>
                        </div>

                        <div className="space-y-2">
                            {nodes.map((node, idx) => (
                                <div key={node.id}>
                                    {idx > 0 && node.nodeType !== 'delay' && nodes[idx - 1]?.nodeType !== 'delay' && (
                                        <div className="w-0.5 h-4 bg-slate-200 dark:bg-slate-700 mx-auto mb-2" />
                                    )}
                                    {node.nodeType === 'delay' && (
                                        <>
                                            <div className="w-0.5 h-3 bg-amber-300 dark:bg-amber-700 mx-auto" />
                                            <DelayNodeCard
                                                node={node}
                                                onChange={p => updateNode(idx, p)}
                                                onDelete={() => deleteNode(idx)}
                                            />
                                            <div className="w-0.5 h-3 bg-amber-300 dark:bg-amber-700 mx-auto" />
                                        </>
                                    )}
                                    {node.nodeType === 'action' && (() => {
                                        const actionIndex = nodes.slice(0, idx).filter(n => n.nodeType === 'action').length;
                                        const actionTotal = nodes.filter(n => n.nodeType === 'action').length;
                                        return (
                                            <ActionNodeCard
                                                step={node}
                                                index={actionIndex}
                                                total={actionTotal}
                                                onChange={p => updateNode(idx, p)}
                                                onDelete={() => deleteNode(idx)}
                                                onMoveUp={() => moveNode(idx, 'up')}
                                                onMoveDown={() => moveNode(idx, 'down')}
                                                pcoLists={pcoLists}
                                                pcoGroups={pcoGroups}
                                                churchId={churchId}
                                            />
                                        );
                                    })()}
                                    {node.nodeType === 'branch' && (
                                        <BranchNodeCard
                                            node={node}
                                            onChange={p => updateNode(idx, p)}
                                            onDelete={() => deleteNode(idx)}
                                            pcoLists={pcoLists}
                                            pcoGroups={pcoGroups}
                                            smsTags={smsTags}
                                            churchId={churchId}
                                        />
                                    )}
                                </div>
                            ))}
                        </div>

                        {nodes.length === 0 && (
                            <div className="text-center py-10 border-2 border-dashed border-slate-200 dark:border-slate-700 rounded-2xl text-slate-400">
                                <Zap size={28} className="mx-auto mb-2 opacity-30" />
                                <p className="text-sm font-semibold mb-3">No nodes yet. Add your first step below.</p>
                            </div>
                        )}

                        <div className="flex items-center gap-2 pt-1">
                            <button onClick={addActionNode}
                                className="flex-1 py-2.5 border-2 border-dashed border-indigo-300 dark:border-indigo-700 rounded-2xl text-xs font-bold text-indigo-500 hover:border-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition flex items-center justify-center gap-1.5">
                                <Plus size={13} /> Action
                            </button>
                            <button onClick={addDelayNode}
                                className="flex-1 py-2.5 border-2 border-dashed border-amber-300 dark:border-amber-700 rounded-2xl text-xs font-bold text-amber-500 hover:border-amber-500 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition flex items-center justify-center gap-1.5">
                                <Clock size={13} /> Delay
                            </button>
                            <button onClick={addBranchNode}
                                className="flex-1 py-2.5 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-2xl text-xs font-bold text-blue-500 hover:border-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition flex items-center justify-center gap-1.5">
                                <GitBranch size={13} /> Branch
                            </button>
                        </div>
                    </div>

                    {error && (
                        <div className="flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                            <AlertTriangle size={14} /> {error}
                        </div>
                    )}
                </div>
            </div>
            {showTestDrawer && (
                <WorkflowTestDrawer
                    workflow={{ ...wf, steps: nodesToSteps(nodes) }}
                    churchId={churchId}
                    pcoLists={pcoLists}
                    pcoGroups={pcoGroups}
                    pcoRegistrationEvents={pcoRegistrationEvents}
                    onClose={() => setShowTestDrawer(false)}
                />
            )}
        </div>
    );
};

// --- Workflow Test Drawer ----------------------------------------------------

interface WorkflowTestDrawerProps {
    workflow: SmsWorkflow;
    churchId: string;
    pcoLists?: { id: string; name: string }[];
    pcoGroups?: { id: string; name: string }[];
    pcoRegistrationEvents?: { id: string; pcoId: string; name: string; startsAt?: string | null }[];
    onClose: () => void;
}

const WorkflowTestDrawer: React.FC<WorkflowTestDrawerProps> = ({
    workflow,
    pcoLists = [],
    pcoGroups = [],
    pcoRegistrationEvents = [],
    onClose
}) => {
    const todayStr = new Date().toISOString().split('T')[0];
    const defaultBirthdayStr = `${new Date().getFullYear()}-06-15`;
    const defaultAnniversaryStr = `${new Date().getFullYear()}-10-20`;

    const [simDate, setSimDate] = useState(todayStr);
    const [simTime, setSimTime] = useState('09:00');
    const [mockName, setMockName] = useState('Jane Doe');
    const [mockPhone, setMockPhone] = useState('(555) 019-2834');
    const [mockEmail, setMockEmail] = useState('jane.doe@example.com');
    const [mockCity, setMockCity] = useState('Atlanta');
    const [mockState, setMockState] = useState('GA');

    const [mockBirthday, setMockBirthday] = useState(defaultBirthdayStr);
    const [mockAnniversary, setMockAnniversary] = useState(defaultAnniversaryStr);
    const [mockEventStartsAt, setMockEventStartsAt] = useState(`${todayStr}T18:00`);

    const [isSimulating, setIsSimulating] = useState(false);
    const [revealedCount, setRevealedCount] = useState(workflow.steps?.length || 0);

    useEffect(() => {
        setRevealedCount(workflow.steps?.length || 0);
        setIsSimulating(false);
    }, [workflow.steps?.length]);

    useEffect(() => {
        if (!isSimulating) return;
        if (revealedCount >= (workflow.steps?.length || 0)) {
            setIsSimulating(false);
            return;
        }
        const timer = setTimeout(() => {
            setRevealedCount(prev => prev + 1);
        }, 2000);
        return () => clearTimeout(timer);
    }, [isSimulating, revealedCount, workflow.steps?.length]);

    const startSimulation = () => {
        setRevealedCount(0);
        setIsSimulating(true);
    };

    const triggerEventName = workflow.triggerEventName ||
        pcoRegistrationEvents.find(e => e.pcoId === workflow.triggerEventId)?.name ||
        'Sunday Worship Service';

    const triggerListName = workflow.triggerListName ||
        pcoLists.find(l => l.id === workflow.triggerListId)?.name ||
        pcoGroups.find(g => g.id === workflow.triggerGroupId)?.name ||
        'PCO List';

    const formatSimDate = (ms: number) => {
        const d = new Date(ms);
        return d.toLocaleDateString('en-US', {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            year: 'numeric'
        }) + ' at ' + d.toLocaleTimeString('en-US', {
            hour: '2-digit',
            minute: '2-digit'
        });
    };

    const steps = workflow.steps || [];

    let baseMs = new Date(`${simDate}T${simTime}`).getTime();
    if (isNaN(baseMs)) {
        baseMs = Date.now();
    }

    const calculateStepNextSendAt = (step: any, fromMs: number): number => {
        const scheduleType = step.scheduleType || 'relative';
        const timeParts = (step.scheduleTime || '09:00').split(':').map(Number);
        const schedHours = timeParts[0] ?? 9;
        const schedMinutes = timeParts[1] ?? 0;

        if (scheduleType === 'day_of_week') {
            const targetDay = step.scheduleDayOfWeek ?? 1;
            const candidate = new Date(fromMs);
            candidate.setHours(schedHours, schedMinutes, 0, 0);
            for (let i = 0; i <= 7; i++) {
                if (candidate.getDay() === targetDay && candidate.getTime() > fromMs) {
                    return candidate.getTime();
                }
                candidate.setDate(candidate.getDate() + 1);
            }
        }
        if (scheduleType === 'day_of_month') {
            const targetDate = step.scheduleDayOfMonth ?? 1;
            const ref = new Date(fromMs);
            let year = ref.getFullYear();
            let month = ref.getMonth();
            while (true) {
                const daysInMonth = new Date(year, month + 1, 0).getDate();
                if (targetDate <= daysInMonth) {
                    const candidate = new Date(year, month, targetDate, schedHours, schedMinutes, 0, 0);
                    if (candidate.getTime() > fromMs) return candidate.getTime();
                }
                month++;
                if (month > 11) { month = 0; year++; }
            }
        }
        return fromMs + (step.delayDays || 0) * 86_400_000 + (step.delayHours || 0) * 3_600_000;
    };

    const resolveMessage = (msg: string | undefined) => {
        if (!msg) return '';
        let text = msg;

        const firstName = mockName.split(' ')[0] || '';
        const lastName = mockName.split(' ').slice(1).join(' ') || '';
        const formattedBday = mockBirthday ? new Date(mockBirthday + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';
        const formattedAnn = mockAnniversary ? new Date(mockAnniversary + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '';

        const rules = [
            { regex: /\{contact\.firstName\}|\{firstName\}|\{\{firstName\}\}|\[firstName\]/gi, value: firstName },
            { regex: /\{contact\.lastName\}|\{lastName\}|\{\{lastName\}\}|\[lastName\]/gi, value: lastName },
            { regex: /\{contact\.fullName\}|\{contact\.name\}|\{fullName\}|\{\{fullName\}\}|\[fullName\]/gi, value: mockName },
            { regex: /\{contact\.email\}|\{email\}|\{\{email\}\}|\[email\]/gi, value: mockEmail },
            { regex: /\{contact\.phone\}|\{phone\}|\{\{phone\}\}|\[phone\]/gi, value: mockPhone },
            { regex: /\{contact\.birthday\}|\{birthday\}|\{\{birthday\}\}|\[birthday\]/gi, value: formattedBday },
            { regex: /\{contact\.anniversary\}|\{anniversary\}|\{\{anniversary\}\}|\[anniversary\]/gi, value: formattedAnn },
            { regex: /\{contact\.city\}|\{city\}|\{\{city\}\}|\[city\]/gi, value: mockCity },
            { regex: /\{contact\.state\}|\{state\}|\{\{state\}\}|\[state\]/gi, value: mockState },
            { regex: /\{eventName\}|\{event_name\}|\{\{eventName\}\}|\[eventName\]/gi, value: triggerEventName },
            { regex: /\{churchName\}|\{church\.name\}|\{\{churchName\}\}|\[churchName\]/gi, value: 'Our Church' },
        ];

        rules.forEach(rule => {
            text = text.replace(rule.regex, rule.value);
        });

        const simpleReplacements: Record<string, string> = {
            'name': mockName,
            'first_name': firstName,
            'last_name': lastName,
            'phone': mockPhone,
            'email': mockEmail,
            'city': mockCity,
            'state': mockState,
            'eventname': triggerEventName,
            'birthday': formattedBday || 'Jun 15',
            'anniversary': formattedAnn || 'Oct 20',
        };
        Object.entries(simpleReplacements).forEach(([tag, val]) => {
            const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex1 = new RegExp(`\\[${escapedTag}\\]`, 'gi');
            const regex2 = new RegExp(`\\{\\{${escapedTag}\\}\\}`, 'gi');
            const regex3 = new RegExp(`\\{${escapedTag}\\}`, 'gi');
            text = text.replace(regex1, val).replace(regex2, val).replace(regex3, val);
        });

        return text;
    };

    const timeline: {
        stepIndex: number;
        scheduledMs: number;
        step: SmsWorkflowStep;
        delayText: string;
        resolvedMessage: string;
        resolvedEmailBody?: string;
    }[] = [];

    let currentMs = baseMs;

    if (workflow.trigger === 'birthday' && mockBirthday) {
        const offset = workflow.triggerDayOffset || 0;
        const parts = (workflow.triggerTime || '09:00').split(':').map(Number);
        const bday = new Date(mockBirthday + 'T00:00:00');
        bday.setDate(bday.getDate() - offset);
        bday.setHours(parts[0] ?? 9, parts[1] ?? 0, 0, 0);
        currentMs = bday.getTime();
    } else if (workflow.trigger === 'anniversary' && mockAnniversary) {
        const offset = workflow.triggerDayOffset || 0;
        const parts = (workflow.triggerTime || '09:00').split(':').map(Number);
        const ann = new Date(mockAnniversary + 'T00:00:00');
        ann.setDate(ann.getDate() - offset);
        ann.setHours(parts[0] ?? 9, parts[1] ?? 0, 0, 0);
        currentMs = ann.getTime();
    }

    steps.forEach((step, idx) => {
        currentMs = calculateStepNextSendAt(step, currentMs);

        let delayText = 'Immediately upon enrollment';
        const st = step.scheduleType || 'relative';
        if (idx > 0 || step.delayDays > 0 || (step.delayHours && step.delayHours > 0) || step.scheduleType) {
            if (st === 'day_of_week') {
                const dow = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][step.scheduleDayOfWeek ?? 1];
                delayText = `On the next ${dow} at ${step.scheduleTime || '09:00'}`;
            } else if (st === 'day_of_month') {
                const day = step.scheduleDayOfMonth ?? 1;
                delayText = `On the next ${day}${day === 1 ? 'st' : day === 2 ? 'nd' : day === 3 ? 'rd' : 'th'} of the month at ${step.scheduleTime || '09:00'}`;
            } else {
                const days = step.delayDays || 0;
                const hours = step.delayHours || 0;
                const parts = [];
                if (days > 0) parts.push(`${days} day${days !== 1 ? 's' : ''}`);
                if (hours > 0) parts.push(`${hours} hour${hours !== 1 ? 's' : ''}`);
                delayText = parts.length > 0 ? `Delayed by ${parts.join(' and ')}` : 'Immediately';
            }
        }

        timeline.push({
            stepIndex: idx,
            scheduledMs: currentMs,
            step,
            delayText,
            resolvedMessage: resolveMessage(step.message),
            resolvedEmailBody: resolveMessage(step.emailBody),
        });
    });

    const getChannelBadgeColor = (ch?: string) => {
        switch (ch) {
            case 'email': return 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300';
            case 'staff_sms': return 'bg-teal-100 text-teal-800 dark:bg-teal-900/30 dark:text-teal-300';
            case 'staff_email': return 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300';
            default: return 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900/30 dark:text-indigo-300';
        }
    };

    const getChannelLabel = (ch?: string) => {
        switch (ch) {
            case 'email': return 'Email to Contact';
            case 'staff_sms': return 'SMS to Staff';
            case 'staff_email': return 'Email to Staff';
            default: return 'SMS to Contact';
        }
    };

    const getTargetText = (step: SmsWorkflowStep) => {
        const ch = step.channelType || 'sms';
        if (ch === 'staff_sms' || ch === 'staff_email') {
            const targetType = step.staffTargetType || 'individuals';
            if (targetType === 'individuals') {
                const count = step.staffRecipients?.length || 0;
                return `Staff: ${count} individual${count !== 1 ? 's' : ''}`;
            }
            if (targetType === 'list') return `Staff List: ${step.staffListName || 'Selected List'}`;
            if (targetType === 'group') return `Staff Group: ${step.staffGroupName || 'Selected Group'}`;
        }
        return `${mockName} (${mockPhone})`;
    };

    return (
        <div className="fixed inset-0 z-[120] flex justify-end bg-black/55 backdrop-blur-xs" onClick={onClose}>
            <div className="w-full max-w-xl bg-slate-50 dark:bg-slate-900 h-full shadow-2xl flex flex-col border-l border-slate-200 dark:border-slate-800" onClick={e => e.stopPropagation()}>

                <div className="px-6 py-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                            <Beaker size={20} className="text-indigo-600 dark:text-indigo-300" />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-slate-900 dark:text-white">Workflow Simulator</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">Trigger: {workflow.trigger === 'birthday' ? 'Birthday' : workflow.trigger === 'anniversary' ? 'Anniversary' : workflow.trigger === 'keyword' ? `Keyword ("${workflow.triggerKeywordWord || 'hello'}")` : workflow.trigger === 'list_add' ? `List Add (${triggerListName})` : workflow.trigger === 'event_registration' ? `Event Registration (${triggerEventName})` : 'Manual'}</p>
                        </div>
                    </div>
                    <button onClick={onClose} title="Close" className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"><X size={18} /></button>
                </div>

                <div className="flex-1 overflow-y-auto p-5 space-y-6">

                    <div className="bg-white dark:bg-slate-800 rounded-2xl p-4 border border-slate-200 dark:border-slate-700 space-y-3">
                        <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                            <Settings size={12} /> Simulation Inputs
                        </h4>

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">Start Date</label>
                                <input
                                    type="date"
                                    value={simDate}
                                    onChange={e => setSimDate(e.target.value)}
                                    className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">Start Time</label>
                                <input
                                    type="time"
                                    value={simTime}
                                    onChange={e => setSimTime(e.target.value)}
                                    className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                        </div>

                        <div className="border-t border-slate-100 dark:border-slate-700/50 my-2" />

                        <div className="grid grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">Mock Contact Name</label>
                                <input
                                    type="text"
                                    value={mockName}
                                    onChange={e => setMockName(e.target.value)}
                                    className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">Mock Contact Phone</label>
                                <input
                                    type="text"
                                    value={mockPhone}
                                    onChange={e => setMockPhone(e.target.value)}
                                    className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold text-slate-500 mb-1">Mock Contact Email</label>
                                <input
                                    type="text"
                                    value={mockEmail}
                                    onChange={e => setMockEmail(e.target.value)}
                                    className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-2">
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">City</label>
                                    <input
                                        type="text"
                                        value={mockCity}
                                        onChange={e => setMockCity(e.target.value)}
                                        className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                </div>
                                <div>
                                    <label className="block text-[10px] font-bold text-slate-500 mb-1">State</label>
                                    <input
                                        type="text"
                                        value={mockState}
                                        onChange={e => setMockState(e.target.value)}
                                        className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                    />
                                </div>
                            </div>
                        </div>

                        {(workflow.trigger === 'birthday' || workflow.trigger === 'anniversary' || workflow.trigger === 'event_registration') && (
                            <>
                                <div className="border-t border-slate-100 dark:border-slate-700/50 my-2" />
                                <div>
                                    {workflow.trigger === 'birthday' && (
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Mock Contact Birthday Date</label>
                                            <input
                                                type="date"
                                                value={mockBirthday}
                                                onChange={e => setMockBirthday(e.target.value)}
                                                className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            />
                                        </div>
                                    )}
                                    {workflow.trigger === 'anniversary' && (
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Mock Contact Anniversary Date</label>
                                            <input
                                                type="date"
                                                value={mockAnniversary}
                                                onChange={e => setMockAnniversary(e.target.value)}
                                                className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            />
                                        </div>
                                    )}
                                    {workflow.trigger === 'event_registration' && (
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-500 mb-1">Mock Event Start Date & Time</label>
                                            <input
                                                type="datetime-local"
                                                value={mockEventStartsAt}
                                                onChange={e => setMockEventStartsAt(e.target.value)}
                                                className="w-full text-xs border border-slate-200 dark:border-slate-700 rounded-lg px-2.5 py-1.5 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                                            />
                                        </div>
                                    )}
                                </div>
                            </>
                        )}
                    </div>

                    <div className="space-y-4">
                        <div className="flex items-center justify-between">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                                <Clock size={12} /> Simulated Flow Timeline
                            </h4>
                            {timeline.length > 0 && (
                                <button
                                    onClick={isSimulating ? () => setIsSimulating(false) : startSimulation}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-xl transition ${
                                        isSimulating
                                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300 border border-amber-200 dark:border-amber-800'
                                            : 'bg-indigo-600 text-white hover:bg-indigo-700 shadow-md shadow-indigo-200 dark:shadow-none'
                                    }`}
                                >
                                    {isSimulating ? (
                                        <>
                                            <Loader2 size={11} className="animate-spin" />
                                            Stop Playback
                                        </>
                                    ) : (
                                        <>
                                            <Play size={11} />
                                            Play Simulation
                                        </>
                                    )}
                                </button>
                            )}
                        </div>

                        {timeline.length === 0 ? (
                            <div className="text-center py-10 bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 text-slate-400 text-sm">
                                No steps added to this workflow yet.
                            </div>
                        ) : (
                            <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-3.5 pl-6 space-y-6">
                                {timeline.map((item, index) => {
                                    const ch = item.step.channelType || 'sms';
                                    const isEmail = ch === 'email' || ch === 'staff_email';

                                    const isSent = index < revealedCount;
                                    const isCurrent = index === revealedCount;
                                    const isQueued = index > revealedCount;

                                    let bulletClass = 'bg-slate-200 text-slate-400 dark:bg-slate-700 dark:text-slate-500';
                                    if (isSent) bulletClass = 'bg-emerald-500 text-white';
                                    else if (isCurrent) bulletClass = 'bg-indigo-600 text-white animate-pulse ring-4 ring-indigo-200 dark:ring-indigo-900';

                                    let cardClass = 'bg-white dark:bg-slate-800 border rounded-2xl p-4 shadow-xs transition duration-300';
                                    if (isSent) cardClass += ' border-slate-200 dark:border-slate-700';
                                    else if (isCurrent) cardClass += ' border-indigo-500 dark:border-indigo-500 shadow-md ring-1 ring-indigo-500 scale-[1.01]';
                                    else if (isQueued) cardClass += ' opacity-35 select-none pointer-events-none border-dashed border-slate-200 dark:border-slate-700';

                                    return (
                                        <div key={item.step.id} className="relative group">
                                            <div className={`absolute -left-[35px] top-1.5 w-6.5 h-6.5 rounded-full text-[11px] font-bold flex items-center justify-center ring-4 ring-slate-50 dark:ring-slate-900 shadow ${bulletClass}`}>
                                                {index + 1}
                                            </div>

                                            <div className={cardClass}>
                                                <div className="flex items-center justify-between gap-2 mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-full ${getChannelBadgeColor(ch)}`}>
                                                            {getChannelLabel(ch)}
                                                        </span>
                                                        <span className="text-[10px] text-slate-400 italic">
                                                            {item.delayText}
                                                        </span>
                                                    </div>

                                                    {isSent && (
                                                        <span className="flex items-center gap-1 text-[11px] font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/30 px-2 py-0.5 rounded-full shrink-0">
                                                            <CheckCircle size={10} /> Dispatched
                                                        </span>
                                                    )}
                                                    {isCurrent && (
                                                        <span className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/30 px-2 py-0.5 rounded-full shrink-0 animate-pulse">
                                                            <Loader2 size={10} className="animate-spin" /> Simulating...
                                                        </span>
                                                    )}
                                                    {isQueued && (
                                                        <span className="flex items-center gap-1 text-[11px] font-bold text-slate-400 dark:text-slate-500 bg-slate-50 dark:bg-slate-900/30 px-2 py-0.5 rounded-full shrink-0">
                                                            <Clock size={10} /> Queued
                                                        </span>
                                                    )}
                                                </div>

                                                <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                                    Scheduled Time
                                                </h5>
                                                <p className="text-xs font-bold text-slate-700 dark:text-slate-200 mb-3 flex items-center gap-1.5">
                                                    <Calendar size={12} className="text-indigo-500" />
                                                    {formatSimDate(item.scheduledMs)}
                                                </p>

                                                <h5 className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">
                                                    To Recipient
                                                </h5>
                                                <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 mb-3">
                                                    {getTargetText(item.step)}
                                                </p>

                                                <div className="border border-slate-100 dark:border-slate-700/60 rounded-xl bg-slate-50/50 dark:bg-slate-900/30 p-3">
                                                    {isEmail ? (
                                                        <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                                                            <div className="flex gap-2 pb-1.5 border-b border-slate-100 dark:border-slate-700/50">
                                                                <span className="font-bold text-slate-400">Subject:</span>
                                                                <span className="font-semibold">{resolveMessage(item.step.emailSubject || '(no subject)')}</span>
                                                            </div>
                                                            <div className="pt-1.5 max-h-40 overflow-y-auto font-mono text-[11px] whitespace-pre-wrap leading-relaxed">
                                                                {item.resolvedEmailBody || <span className="text-slate-400 italic">(no email content)</span>}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <div className="text-xs font-mono text-slate-800 dark:text-slate-200 whitespace-pre-wrap leading-relaxed">
                                                            {item.resolvedMessage || <span className="text-slate-400 italic">(no message text)</span>}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 shrink-0">
                    <button
                        onClick={onClose}
                        className="w-full py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold rounded-xl transition text-sm flex items-center justify-center gap-1.5"
                    >
                        <X size={15} /> Close Simulator
                    </button>
                </div>
            </div>
        </div>
    );
};

// --- Enrollment Pane ---------------------------------------------------------

const EnrollmentPane: React.FC<{
    workflow: SmsWorkflow;
    churchId: string;
    onClose: () => void;
}> = ({ workflow, churchId, onClose }) => {
    const [enrollments, setEnrollments] = useState<SmsWorkflowEnrollment[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [phone, setPhone] = useState('');
    const [name, setName] = useState('');
    const [enrolling, setEnrolling] = useState(false);
    const [errMsg, setErrMsg] = useState('');

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
        const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : '';
        if (!e164) { setErrMsg('Enter a valid US phone number.'); return; }
        setErrMsg('');
        setEnrolling(true);
        try {
            const baseId = `${workflow.id}_${e164.replace(/\+/g, '')}`;
            const enrollId = workflow.allowReentry
                ? `${baseId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
                : baseId;
            const enrollment: SmsWorkflowEnrollment = {
                id: enrollId,
                churchId,
                workflowId: workflow.id,
                phoneNumber: e164,
                personName: name.trim() || null,
                personId: null,
                currentStep: 0,
                nextSendAt: Date.now(),
                completed: false,
                enrolledAt: Date.now(),
                lastStepSentAt: null,
            };
            await setDoc(doc(firebaseDb, 'smsWorkflowEnrollments', enrollId), enrollment, { merge: false });
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
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
                    <div>
                        <h3 className="text-base font-black text-slate-900 dark:text-white">Enroll Contact</h3>
                        <p className="text-xs text-slate-500 dark:text-slate-400">{workflow.name}</p>
                    </div>
                    <button onClick={onClose} title="Close" className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"><X size={16} /></button>
                </div>

                <div className="p-5 space-y-3 border-b border-slate-200 dark:border-slate-700 shrink-0">
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Phone Number</label>
                        <input
                            type="tel"
                            value={phone}
                            onChange={e => setPhone(e.target.value)}
                            placeholder="(615) 555-0100"
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Name <span className="font-normal opacity-60">(optional)</span></label>
                        <input
                            type="text"
                            value={name}
                            onChange={e => setName(e.target.value)}
                            placeholder="Jane Smith"
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                    {errMsg && <p className="text-xs text-red-500">{errMsg}</p>}
                    <button
                        onClick={handleEnroll}
                        disabled={!phone.trim() || enrolling}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition flex items-center justify-center gap-2"
                    >
                        {enrolling ? <><Loader2 size={13} className="animate-spin" />Enrolling...</> : <><Plus size={13} />Enroll in Workflow</>}
                    </button>
                </div>

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
                                            Step {en.currentStep + 1} of {workflow.steps.length} • enrolled {timeAgo(en.enrolledAt)}
                                        </p>
                                    </div>
                                    <span className={`text-[10px] font-bold px-2 py-1 rounded-full ${en.completed ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300' : 'bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300'}`}>
                                        {en.completed ? 'Done' : 'Active'}
                                    </span>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

// --- Bulk Enroll from PCO List / Group --------------------------------------

const BulkEnrollFromListModal: React.FC<{
    workflow: SmsWorkflow;
    churchId: string;
    onClose: () => void;
}> = ({ workflow, churchId, onClose }) => {
    type AudienceTab = 'lists' | 'groups';
    const [tab, setTab] = useState<AudienceTab>('lists');
    const [pcoLists, setPcoLists] = useState<{ id: string; name: string }[]>([]);
    const [pcoGroups, setPcoGroups] = useState<{ id: string; name: string }[]>([]);
    const [loadingLists, setLoadingLists] = useState(false);
    const [loadingGroups, setLoadingGroups] = useState(false);
    const [selectedListId, setSelectedListId] = useState('');
    const [selectedGroupId, setSelectedGroupId] = useState('');
    const [memberCount, setMemberCount] = useState<number | null>(null);
    const [loadingCount, setLoadingCount] = useState(false);
    const [enrolling, setEnrolling] = useState(false);
    const [result, setResult] = useState<{ enrolled: number; skipped: number } | null>(null);
    const [errMsg, setErrMsg] = useState('');

    useEffect(() => {
        setLoadingLists(true);
        pcoService.getPeopleLists(churchId)
            .then(raw => setPcoLists(raw.map((r: any) => ({ id: r.id, name: r.attributes?.name || 'Unnamed List' }))))
            .catch(() => { })
            .finally(() => setLoadingLists(false));
    }, [churchId]);

    useEffect(() => {
        if (tab !== 'groups' || pcoGroups.length > 0) return;
        setLoadingGroups(true);
        pcoService.getGroups(churchId)
            .then(raw => setPcoGroups(raw.map((r: any) => ({ id: r.id, name: r.attributes?.name || 'Unnamed Group' }))))
            .catch(() => { })
            .finally(() => setLoadingGroups(false));
    }, [tab, churchId, pcoGroups.length]);

    useEffect(() => {
        const id = tab === 'lists' ? selectedListId : selectedGroupId;
        if (!id) { setMemberCount(null); return; }
        setLoadingCount(true);
        setMemberCount(null);
        const body = tab === 'lists'
            ? { churchId, listId: selectedListId }
            : { churchId, groupId: selectedGroupId };
        fetch('/api/messaging/workflow-enroll-preview', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        })
            .then(r => r.json())
            .then(d => { if (d.success) setMemberCount(d.totalCount); })
            .catch(() => { })
            .finally(() => setLoadingCount(false));
    }, [selectedListId, selectedGroupId, tab, churchId]);

    const handleEnroll = async () => {
        const id = tab === 'lists' ? selectedListId : selectedGroupId;
        if (!id) { setErrMsg('Please select a list or group first.'); return; }
        setErrMsg('');
        setEnrolling(true);
        try {
            const body = tab === 'lists'
                ? { churchId, workflowId: workflow.id, listId: selectedListId }
                : { churchId, workflowId: workflow.id, groupId: selectedGroupId };
            const res = await fetch('/api/messaging/workflow-enroll-list', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Enrollment failed');
            setResult({ enrolled: data.enrolled, skipped: data.skipped });
        } catch (e: any) {
            setErrMsg(e.message || 'Enrollment failed');
        } finally {
            setEnrolling(false);
        }
    };

    const selectedId = tab === 'lists' ? selectedListId : selectedGroupId;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md mx-4 overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>

                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                            <ListPlus size={17} className="text-indigo-600 dark:text-indigo-300" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900 dark:text-white">Start Workflow from List</h3>
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[240px]">{workflow.name}</p>
                        </div>
                    </div>
                    <button onClick={onClose} title="Close" aria-label="Close" className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition"><X size={16} /></button>
                </div>

                {result ? (
                    <div className="p-6 text-center">
                        <div className="w-14 h-14 rounded-2xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                            <CheckCircle size={28} className="text-emerald-500" />
                        </div>
                        <p className="font-black text-slate-900 dark:text-white text-base mb-1">Workflow Started!</p>
                        <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                            <span className="font-bold text-indigo-600 dark:text-indigo-300">{result.enrolled}</span> contact{result.enrolled !== 1 ? 's' : ''} enrolled.
                            {result.skipped > 0 && <span className="text-slate-400"> {result.skipped} already enrolled (skipped).</span>}
                        </p>
                        <p className="text-xs text-slate-400 mt-3">The workflow scheduler will fire Step 1 within 60 seconds.</p>
                        <button
                            onClick={onClose}
                            className="mt-5 px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold rounded-xl transition"
                        >
                            Done
                        </button>
                    </div>
                ) : (
                    <div className="p-5 space-y-4">
                        <div className="flex items-start gap-3 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-100 dark:border-indigo-800 rounded-2xl p-3">
                            <Zap size={14} className="text-indigo-500 mt-0.5 shrink-0" />
                            <p className="text-[11px] text-indigo-700 dark:text-indigo-300 leading-relaxed">
                                Every person on the selected list with a phone number will be enrolled in <strong>{workflow.name}</strong> immediately. Step 1 fires within 60 seconds.
                            </p>
                        </div>

                        <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700">
                            {(['lists', 'groups'] as AudienceTab[]).map(t => (
                                <button
                                    key={t}
                                    onClick={() => setTab(t)}
                                    className={`flex-1 py-2 text-xs font-bold transition ${tab === t
                                            ? 'bg-indigo-600 text-white'
                                            : 'bg-white dark:bg-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-700'
                                        }`}
                                >
                                    PCO {t === 'lists' ? 'Lists' : 'Groups'}
                                </button>
                            ))}
                        </div>

                        {tab === 'lists' ? (
                            loadingLists ? (
                                <div className="flex items-center gap-2 text-slate-400 text-xs py-2"><Loader2 size={13} className="animate-spin" /> Loading PCO Lists...</div>
                            ) : (
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">PCO List</label>
                                    <select
                                        value={selectedListId}
                                        onChange={e => { setSelectedListId(e.target.value); setResult(null); setErrMsg(''); }}
                                        title="Select a PCO List"
                                        aria-label="Select a PCO List"
                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">— Select a PCO List —</option>
                                        {pcoLists.length === 0 && <option disabled>No lists found (connect PCO first)</option>}
                                        {pcoLists.map(l => <option key={l.id} value={l.id}>{l.name}</option>)}
                                    </select>
                                </div>
                            )
                        ) : (
                            loadingGroups ? (
                                <div className="flex items-center gap-2 text-slate-400 text-xs py-2"><Loader2 size={13} className="animate-spin" /> Loading PCO Groups...</div>
                            ) : (
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">PCO Group</label>
                                    <select
                                        value={selectedGroupId}
                                        onChange={e => { setSelectedGroupId(e.target.value); setResult(null); setErrMsg(''); }}
                                        title="Select a PCO Group"
                                        aria-label="Select a PCO Group"
                                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    >
                                        <option value="">— Select a PCO Group —</option>
                                        {pcoGroups.length === 0 && <option disabled>No groups found (connect PCO first)</option>}
                                        {pcoGroups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
                                    </select>
                                </div>
                            )
                        )}

                        {selectedId && (
                            <div className="flex items-center gap-2">
                                {loadingCount ? (
                                    <span className="flex items-center gap-1.5 text-xs text-slate-400"><Loader2 size={11} className="animate-spin" /> Fetching count...</span>
                                ) : memberCount !== null ? (
                                    <span className="flex items-center gap-1.5 text-xs font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-2.5 py-1 rounded-full">
                                        <Users size={11} /> {memberCount.toLocaleString()} member{memberCount !== 1 ? 's' : ''}
                                    </span>
                                ) : null}
                            </div>
                        )}

                        {errMsg && (
                            <div className="flex items-center gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3">
                                <AlertTriangle size={12} className="shrink-0" /> {errMsg}
                            </div>
                        )}

                        <div className="flex gap-3 pt-1">
                            <button
                                onClick={onClose}
                                className="flex-1 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-700 transition"
                            >
                                Cancel
                            </button>
                            <button
                                onClick={handleEnroll}
                                disabled={!selectedId || enrolling}
                                className="flex-1 py-2.5 text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition shadow-md shadow-indigo-200 dark:shadow-indigo-900/30 flex items-center justify-center gap-2"
                            >
                                {enrolling
                                    ? <><Loader2 size={13} className="animate-spin" /> Enrolling...</>
                                    : <><ListPlus size={13} /> Start Workflow</>}
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};

// --- Workflows List + Manager -------------------------------------------------

const WorkflowEnrollmentsModal: React.FC<{
    workflow: SmsWorkflow;
    churchId: string;
    onClose: () => void;
}> = ({ workflow, churchId, onClose }) => {
    const [enrollments, setEnrollments] = useState<SmsWorkflowEnrollment[]>([]);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchEnrollments = async () => {
            try {
                const q = query(
                    collection(firebaseDb, 'smsWorkflowEnrollments'),
                    where('churchId', '==', churchId),
                    where('workflowId', '==', workflow.id)
                );
                const snap = await getDocs(q);
                const data = snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsWorkflowEnrollment));
                data.sort((a, b) => b.enrolledAt - a.enrolledAt);
                setEnrollments(data);
            } catch (err) {
                console.error('Failed to fetch enrollments:', err);
            } finally {
                setLoading(false);
            }
        };
        fetchEnrollments();
    }, [workflow.id, churchId]);

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-2xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[80vh]" onClick={e => e.stopPropagation()}>
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
                            <Users size={20} className="text-indigo-500" />
                            Enrolled People
                        </h2>
                        <p className="text-xs text-slate-500 mt-1">Workflow: {workflow.name}</p>
                    </div>
                    <button onClick={onClose} className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition">
                        <X size={20} />
                    </button>
                </div>
                <div className="p-6 overflow-y-auto">
                    {loading ? (
                        <div className="flex items-center justify-center h-40 text-slate-400">
                            <Loader2 size={24} className="animate-spin" />
                        </div>
                    ) : enrollments.length === 0 ? (
                        <div className="text-center py-12 text-slate-500">
                            No one is currently enrolled in this workflow.
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {enrollments.map(e => (
                                <div key={e.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800">
                                    <div>
                                        <p className="font-bold text-slate-900 dark:text-white">
                                            {e.personName || 'Unknown Person'}
                                        </p>
                                        <p className="text-xs text-slate-500 font-mono mt-0.5">
                                            {e.phoneNumber}
                                        </p>
                                    </div>
                                    <div className="text-right">
                                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300">
                                            {e.completed ? (
                                                <>
                                                    <CheckCircle size={12} />
                                                    Completed
                                                </>
                                            ) : (
                                                <>
                                                    <ChevronRight size={12} />
                                                    Step {e.currentStep + 1}
                                                </>
                                            )}
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-1">
                                            Enrolled {new Date(e.enrolledAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

export const SmsWorkflowsManager: React.FC<{ churchId: string }> = ({ churchId }) => {
    const { numbers: twilioNumbers } = useTwilioNumbers(churchId);
    const [workflows, setWorkflows] = useState<SmsWorkflow[]>([]);
    const [keywords, setKeywords] = useState<SmsKeyword[]>([]);
    const [pcoLists, setPcoLists] = useState<{ id: string; name: string }[]>([]);
    const [pcoGroups, setPcoGroups] = useState<{ id: string; name: string }[]>([]);
    const [smsTags, setSmsTags] = useState<SmsTag[]>([]);
    const [pcoRegistrationEvents, setPcoRegistrationEvents] = useState<{ id: string; pcoId: string; name: string; startsAt?: string | null }[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [editing, setEditing] = useState<SmsWorkflow | null>(null);
    const [viewMode, setViewMode] = useState<'list' | 'editor'>('list');
    const [isBusy, setIsBusy] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [enrollTarget, setEnrollTarget] = useState<SmsWorkflow | null>(null);
    const [listEnrollTarget, setListEnrollTarget] = useState<SmsWorkflow | null>(null);
    const [testTarget, setTestTarget] = useState<SmsWorkflow | null>(null);
    const [viewingEnrollments, setViewingEnrollments] = useState<SmsWorkflow | null>(null);
    const [stepCountsMap, setStepCountsMap] = useState<Record<string, { stepCounts: Record<number, number>; totalActive: number }>>({});
    const [reSyncState, setReSyncState] = useState<Record<string, { loading: boolean; result: string | null }>>({});

    useEffect(() => {
        const q = query(
            collection(firebaseDb, 'smsWorkflows'),
            where('churchId', '==', churchId),
            orderBy('createdAt', 'desc')
        );
        const unsub = onSnapshot(q, snap => {
            const wfs = snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsWorkflow));
            setWorkflows(wfs);
            setIsLoading(false);
            const apiBase = (import.meta as any).env?.VITE_API_BASE_URL || '';
            Promise.all(
                wfs.map(wf =>
                    fetch(`${apiBase}/api/messaging/workflow-step-counts/${churchId}/${wf.id}`)
                        .then(r => r.ok ? r.json() : null)
                        .then(data => data ? ({ id: wf.id, stepCounts: data.stepCounts, totalActive: data.totalActive }) : null)
                        .catch(() => null)
                )
            ).then(results => {
                const map: Record<string, { stepCounts: Record<number, number>; totalActive: number }> = {};
                for (const r of results) {
                    if (r) map[r.id] = { stepCounts: r.stepCounts, totalActive: r.totalActive };
                }
                setStepCountsMap(map);
            });
        });
        return unsub;
    }, [churchId]);

    useEffect(() => {
        getDocs(query(collection(firebaseDb, 'smsKeywords'), where('churchId', '==', churchId)))
            .then(snap => setKeywords(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsKeyword))));
        getDocs(query(collection(firebaseDb, 'smsTags'), where('churchId', '==', churchId)))
            .then(snap => setSmsTags(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsTag))));
        pcoService.getPeopleLists(churchId)
            .then((raw: any[]) => setPcoLists(raw.map(r => ({ id: r.id, name: r.attributes?.name || 'Unnamed' }))))
            .catch(() => { });
        pcoService.getGroups(churchId)
            .then((raw: any[]) => setPcoGroups(raw.map(r => ({ id: r.id, name: r.attributes?.name || 'Unnamed' }))))
            .catch(() => { });
        getDocs(query(collection(firebaseDb, 'pco_registrations'), where('churchId', '==', churchId)))
            .then(snap => setPcoRegistrationEvents(
                snap.docs
                    .filter(d => {
                        const data = d.data() as any;
                        return data.openSignup !== false && data.visibility !== 'archived';
                    })
                    .map(d => {
                        const data = d.data() as any;
                        return { id: d.id, pcoId: data.pcoId, name: data.name || 'Unnamed Event', startsAt: data.startsAt || null };
                    }).sort((a, b) => (a.startsAt || '').localeCompare(b.startsAt || ''))
            ))
            .catch(() => { });
    }, [churchId]);

    const stripUndefined = (obj: any): any => {
        if (Array.isArray(obj)) return obj.map(stripUndefined);
        if (obj !== null && typeof obj === 'object') {
            return Object.fromEntries(
                Object.entries(obj)
                    .filter(([, v]) => v !== undefined)
                    .map(([k, v]) => [k, stripUndefined(v)])
            );
        }
        return obj;
    };

    const handleSave = async (wf: SmsWorkflow) => {
        setIsBusy(true);
        setSaveError(null);
        try {
            const isNew = editing === null;
            if (isNew) {
                const { id: _id, ...rest } = wf;
                await addDoc(collection(firebaseDb, 'smsWorkflows'), stripUndefined(rest));
            } else {
                await setDoc(doc(firebaseDb, 'smsWorkflows', wf.id), stripUndefined(wf), { merge: true });
            }
            setSaveError(null);
            setViewMode('list');
        } catch (err: any) {
            console.error('[WorkflowSave] failed:', err);
            setSaveError(err?.message || 'Failed to save workflow. Please try again.');
        } finally {
            setIsBusy(false);
        }
    };

    const handleToggleActive = async (wf: SmsWorkflow) => {
        const newlyActive = !wf.isActive;
        await updateDoc(doc(firebaseDb, 'smsWorkflows', wf.id), { isActive: newlyActive });

        if (newlyActive) {
            if (wf.trigger === 'list_add' && wf.triggerListId) {
                fetch(`${API_BASE}/api/messaging/workflow-enroll-list`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        workflowId: wf.id,
                        listId: wf.triggerListId,
                    })
                }).catch(e => console.error('Failed to trigger list enrollment:', e));
            } else if (wf.trigger === 'event_registration' || wf.trigger === 'birthday' || wf.trigger === 'anniversary') {
                fetch(`${API_BASE}/api/messaging/workflow-force-scan`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ churchId })
                }).catch(e => console.error('Failed to trigger force scan:', e));
            }
        }
    };

    const handleDelete = async (wf: SmsWorkflow) => {
        if (!window.confirm(`Delete workflow "${wf.name}"?`)) return;
        await deleteDoc(doc(firebaseDb, 'smsWorkflows', wf.id));
    };

    const openNew = () => { setEditing(null); setSaveError(null); setViewMode('editor'); };
    const openEdit = (wf: SmsWorkflow) => { setEditing(wf); setSaveError(null); setViewMode('editor'); };

    const TRIGGER_BADGE: Record<string, { label: string; color: string; icon: React.ElementType }> = {
        manual: { label: 'Manual', color: 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300', icon: Hand },
        keyword: { label: 'Keyword', color: 'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300', icon: MessageCircle },
        list_add: { label: 'List Add', color: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300', icon: ClipboardList },
        birthday: { label: 'Birthday', color: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-300', icon: Cake },
        anniversary: { label: 'Anniversary', color: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-300', icon: Gem },
        event_registration: { label: 'Event Registration', color: 'bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300', icon: Ticket },
    };

    if (viewMode === 'editor') {
        return (
            <div className="h-full flex flex-col">
                <WorkflowEditor
                    initial={editing}
                    churchId={churchId}
                    keywords={keywords}
                    pcoLists={pcoLists}
                    pcoGroups={pcoGroups}
                    smsTags={smsTags}
                    pcoRegistrationEvents={pcoRegistrationEvents}
                    twilioNumbers={twilioNumbers}
                    onSave={handleSave}
                    onBack={() => { setViewMode('list'); setSaveError(null); }}
                    isBusy={isBusy}
                />
                {saveError && (
                    <div className="shrink-0 mx-6 mb-4 flex items-center gap-2 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-4 py-3">
                        <span className="font-bold">Save failed:</span> {saveError}
                    </div>
                )}
            </div>
        );
    }

    return (
        <div className="h-full overflow-y-auto w-full">
            <ToolPage>
            <ToolHeader
                tool="workflows"
                description="Automated drip sequences — the right message at the right time."
                actions={
                    <ToolButton variant="primary" icon={Plus} onClick={openNew}>
                        New Workflow
                    </ToolButton>
                }
            />

            <div className="flex items-start gap-4 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-4 mb-6">
                <Lightbulb size={24} className="shrink-0 text-indigo-500 dark:text-indigo-400 mt-0.5" aria-hidden="true" />
                <div>
                    <p className="text-sm font-bold text-indigo-800 dark:text-indigo-200 mb-1">How workflows work</p>
                    <p className="text-xs text-indigo-700 dark:text-indigo-300 leading-relaxed">
                        Build a multi-step message sequence with custom delays between each step. Triggered automatically by a keyword text, a PCO List add, a <strong className="inline-flex items-center gap-0.5"><Cake size={12} aria-hidden="true" /> birthday</strong>, a <strong className="inline-flex items-center gap-0.5"><Gem size={12} aria-hidden="true" /> anniversary</strong>, a <strong className="inline-flex items-center gap-0.5"><Ticket size={12} aria-hidden="true" /> PCO event registration</strong> — or manually by staff. Once enrolled, contacts move through each step on schedule.
                    </p>
                </div>
            </div>

            {isLoading ? (
                <div className="flex items-center justify-center h-40 text-slate-400"><Loader2 size={20} className="animate-spin mr-2" />Loading workflows...</div>
            ) : workflows.length === 0 ? (
                <ToolEmptyState
                    icon={Zap}
                    title="No workflows yet"
                    description="Build your first automated text sequence."
                    action={
                        <ToolButton variant="primary" icon={Plus} onClick={openNew}>
                            New Workflow
                        </ToolButton>
                    }
                />
            ) : (
                <div className="space-y-3">
                    {workflows.map(wf => {
                        const tb = TRIGGER_BADGE[wf.trigger] || TRIGGER_BADGE.manual;
                        const TriggerIcon = tb.icon;
                        return (
                            <div key={wf.id} className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 hover:border-indigo-200 dark:hover:border-indigo-700 transition group">
                                <div className="flex items-start justify-between gap-4">
                                    <div className="flex items-start gap-3 min-w-0">
                                        <div className="w-10 h-10 rounded-xl bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-300 flex items-center justify-center shrink-0">
                                            <TriggerIcon size={18} aria-hidden="true" />
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
                                                <div className="flex gap-1 flex-wrap">
                                                    {wf.steps.map((s, si) => {
                                                        const ch = s.channelType ?? 'sms';
                                                        const cfg = CHANNEL_CONFIG[ch];
                                                        return (
                                                            <span key={si} className={`text-[11px] font-bold px-1.5 py-0.5 rounded-full ${cfg.badge}`}>
                                                                {cfg.label}
                                                            </span>
                                                        );
                                                    })}
                                                </div>
                                                {wf.trigger === 'keyword' && wf.triggerKeywordWord && (
                                                    <span className="text-[10px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 px-1.5 py-0.5 rounded">{wf.triggerKeywordWord}</span>
                                                )}
                                                {wf.trigger === 'list_add' && wf.triggerListName && (
                                                    <span className="text-[10px] text-blue-600 dark:text-blue-400">{wf.triggerListName}</span>
                                                )}
                                                {wf.trigger === 'event_registration' && wf.triggerEventName && (
                                                    <span className="text-[10px] text-teal-600 dark:text-teal-400">{wf.triggerEventName}</span>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="flex items-center gap-3 shrink-0">
                                        <div className="text-right hidden sm:block">
                                            <button onClick={() => setViewingEnrollments(wf)} className="group/enroll flex flex-col items-end hover:bg-indigo-50 dark:hover:bg-indigo-900/20 px-2 py-1 rounded-lg transition-colors">
                                                <p className="text-lg font-black text-indigo-600 dark:text-indigo-300 group-hover/enroll:text-indigo-700 dark:group-hover/enroll:text-indigo-200 transition-colors">{wf.enrolledCount}</p>
                                                <p className="text-[10px] text-slate-400 uppercase tracking-wide group-hover/enroll:text-indigo-500 transition-colors">enrolled</p>
                                            </button>
                                        </div>
                                        <div className="text-right hidden sm:block">
                                            <p className="text-lg font-black text-emerald-600">{wf.completedCount}</p>
                                            <p className="text-[10px] text-slate-400 uppercase tracking-wide">done</p>
                                        </div>
                                        {stepCountsMap[wf.id]?.totalActive > 0 && (
                                            <div className="text-right hidden sm:block">
                                                <p className="text-lg font-black text-amber-500">{stepCountsMap[wf.id].totalActive}</p>
                                                <p className="text-[10px] text-slate-400 uppercase tracking-wide">active</p>
                                            </div>
                                        )}

                                        <button
                                            onClick={() => handleToggleActive(wf)}
                                            title={wf.isActive ? 'Pause' : 'Activate'}
                                            className={`relative w-11 h-6 rounded-full transition-colors ${wf.isActive ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                                        >
                                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${wf.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                                        </button>

                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                            <button
                                                onClick={() => setTestTarget(wf)}
                                                className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                                                title="Test / Simulate Workflow"
                                            >
                                                <Beaker size={14} />
                                            </button>
                                            <button
                                                onClick={() => setListEnrollTarget(wf)}
                                                className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition"
                                                title="Start workflow from PCO List"
                                            >
                                                <ListPlus size={14} />
                                            </button>
                                            {(wf.triggerListId || wf.triggerGroupId) && (() => {
                                                const rs = reSyncState[wf.id];
                                                return (
                                                    <button
                                                        onClick={async () => {
                                                            setReSyncState(prev => ({ ...prev, [wf.id]: { loading: true, result: null } }));
                                                            try {
                                                                const apiBase = (import.meta as any).env?.VITE_API_BASE_URL || '';
                                                                const resp = await fetch(`${apiBase}/api/messaging/workflow-resync`, {
                                                                    method: 'POST',
                                                                    headers: { 'Content-Type': 'application/json' },
                                                                    body: JSON.stringify({ churchId, workflowId: wf.id }),
                                                                });
                                                                const data = await resp.json();
                                                                if (!resp.ok) throw new Error(data.error || 'Re-sync failed');
                                                                const msg = data.enrolled > 0
                                                                    ? `✓ ${data.enrolled} new, ${data.skipped} already enrolled`
                                                                    : `✓ Up to date — ${data.skipped} already enrolled`;
                                                                setReSyncState(prev => ({ ...prev, [wf.id]: { loading: false, result: msg } }));
                                                                setTimeout(() => setReSyncState(prev => ({ ...prev, [wf.id]: { loading: false, result: null } })), 8000);
                                                            } catch (err: any) {
                                                                setReSyncState(prev => ({ ...prev, [wf.id]: { loading: false, result: `✗ ${err.message}` } }));
                                                                setTimeout(() => setReSyncState(prev => ({ ...prev, [wf.id]: { loading: false, result: null } })), 8000);
                                                            }
                                                        }}
                                                        disabled={rs?.loading}
                                                        className="p-1.5 text-slate-400 hover:text-teal-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition disabled:opacity-50"
                                                        title="Force sync from PCO list/group now"
                                                    >
                                                        {rs?.loading
                                                            ? <svg className="animate-spin" width={14} height={14} viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" strokeDasharray="31.4" strokeDashoffset="10" strokeLinecap="round"/></svg>
                                                            : <RefreshCw size={14} />}
                                                    </button>
                                                );
                                            })()}
                                            {wf.trigger === 'manual' && (
                                                <button onClick={() => setEnrollTarget(wf)} className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition" title="Enroll contact">
                                                    <Users size={14} />
                                                </button>
                                            )}
                                            <button onClick={() => openEdit(wf)} className="p-1.5 text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition" title="Edit">
                                                <Pencil size={14} />
                                            </button>
                                            <button onClick={() => handleDelete(wf)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition" title="Delete">
                                                <Trash2 size={14} />
                                            </button>
                                        </div>
                                    </div>
                                </div>

                                {wf.steps.length > 0 && (
                                    <div className="mt-3 flex items-center gap-1 overflow-x-auto pb-1">
                                        {wf.steps.map((step, i) => {
                                            const countAtStep = stepCountsMap[wf.id]?.stepCounts?.[i] ?? 0;
                                            return (
                                                <React.Fragment key={step.id}>
                                                    {i > 0 && (
                                                        <div className="flex items-center gap-1 shrink-0">
                                                            <div className="h-px w-4 bg-indigo-200 dark:bg-indigo-800" />
                                                            <span className="text-[11px] text-slate-400 whitespace-nowrap">
                                                                {(() => {
                                                                    const st = step.scheduleType ?? 'relative';
                                                                    if (st === 'day_of_week') return DOW_LABELS_SHORT[step.scheduleDayOfWeek ?? 1];
                                                                    if (st === 'day_of_month') return `${step.scheduleDayOfMonth ?? 1}${ORDINAL_SUFFIX(step.scheduleDayOfMonth ?? 1)}`;
                                                                    const days = step.delayDays || 0;
                                                                    const hours = step.delayHours || 0;
                                                                    if (days === 0 && hours === 0) return 'now';
                                                                    const parts = [];
                                                                    if (days > 0) parts.push(`${days}d`);
                                                                    if (hours > 0) parts.push(`${hours}h`);
                                                                    return `+${parts.join(' ')}`;
                                                                })()}
                                                            </span>
                                                            <div className="h-px w-4 bg-indigo-200 dark:bg-indigo-800" />
                                                        </div>
                                                    )}
                                                    <div className="flex flex-col items-center gap-0.5 shrink-0">
                                                        <div className="w-6 h-6 rounded-full bg-indigo-600 text-white text-[10px] font-black flex items-center justify-center">{i + 1}</div>
                                                        {countAtStep > 0 && (
                                                            <span className="inline-flex items-center gap-0.5 text-[11px] font-bold text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 px-1.5 py-0.5 rounded-full whitespace-nowrap">
                                                                <UserIcon size={10} aria-hidden="true" /> {countAtStep}
                                                            </span>
                                                        )}
                                                    </div>
                                                </React.Fragment>
                                            );
                                        })}
                                    </div>
                                )}
                                {reSyncState[wf.id]?.result && (
                                    <div className={`mt-2 text-[11px] font-semibold px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 ${
                                        reSyncState[wf.id].result!.startsWith('✓')
                                            ? 'bg-teal-50 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 border border-teal-200 dark:border-teal-800'
                                            : 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 border border-red-200 dark:border-red-800'
                                    }`}>
                                        {reSyncState[wf.id].result}
                                    </div>
                                )}
                                {wf.lastListSyncAt && !reSyncState[wf.id]?.result && (
                                    <p className="mt-1.5 text-[10px] text-slate-400 dark:text-slate-500">
                                        Last synced: {new Date(wf.lastListSyncAt).toLocaleString()}
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}

            {enrollTarget && (
                <EnrollmentPane
                    workflow={enrollTarget}
                    churchId={churchId}
                    onClose={() => setEnrollTarget(null)}
                />
            )}

            {listEnrollTarget && (
                <BulkEnrollFromListModal
                    workflow={listEnrollTarget}
                    churchId={churchId}
                    onClose={() => setListEnrollTarget(null)}
                />
            )}

            {testTarget && (
                <WorkflowTestDrawer
                    workflow={testTarget}
                    churchId={churchId}
                    pcoLists={pcoLists}
                    pcoGroups={pcoGroups}
                    pcoRegistrationEvents={pcoRegistrationEvents}
                    onClose={() => setTestTarget(null)}
                />
            )}

            {viewingEnrollments && (
                <WorkflowEnrollmentsModal
                    workflow={viewingEnrollments}
                    churchId={churchId}
                    onClose={() => setViewingEnrollments(null)}
                />
            )}
            </ToolPage>
        </div>
    );
};
