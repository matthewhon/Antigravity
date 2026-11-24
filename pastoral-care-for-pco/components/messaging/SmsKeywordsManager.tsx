import React, { useState, useEffect } from 'react';
import { db as firebaseDb } from '../../services/firebase';
import {
    collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc,
    query, query as firebaseQuery, where, orderBy, limit, getDocs, getDoc, setDoc,
    startAt, endAt
} from 'firebase/firestore';
import { pcoService } from '../../services/pcoService';
import { firestore } from '../../services/firestoreService';
import { SmsKeyword, SmsKeywordAction, SmsTag, Church, User, TwilioPhoneNumber } from '../../types';
import {
    MessageSquare, Users, Plus, Trash2, Pencil, CheckCircle, Loader2, X,
    Phone, Search, Key, AlertTriangle, Tag, Tv2, UserPlus, Sparkles,
    Info, HandHeart, ArrowRight, Bot
} from 'lucide-react';
import { ToolPage, ToolTabs, ToolButton, ToolEmptyState } from '../tool-shell';
import { useTwilioNumbers } from './NumberManager';
import { countSegments, TAG_COLOR_MAP } from './smsHelpers';
import { SmsTagChip } from './SmsTagChip';

const API_BASE = '';

interface KeywordModalProps {
    initial?: SmsKeyword | null;
    churchId: string;
    pcoLists: { id: string; name: string; total_people: number }[];
    loadingLists: boolean;
    tags: SmsTag[];
    polls: { id: string; title: string }[];
    allSmsNumbers: any[];
    onSave: (kw: Omit<SmsKeyword, 'id' | 'matchCount' | 'createdAt'> & { createWorkflow?: boolean }) => Promise<void>;
    onClose: () => void;
    isBusy: boolean;
    saveError?: string;
}

const KeywordModal: React.FC<KeywordModalProps> = ({ initial, churchId, pcoLists, loadingLists, tags, polls, allSmsNumbers, onSave, onClose, isBusy, saveError }) => {
    const [keyword, setKeyword] = useState(initial?.keyword || '');
    const [actionType, setActionType] = useState<SmsKeywordAction>(initial?.actionType || 'static');
    const [replyMessage, setReplyMessage] = useState(initial?.replyMessage || '');
    const [pcoSignupId, setPcoSignupId] = useState(initial?.pcoSignupId || '');
    const [signups, setSignups] = useState<{ id: string; name: string }[]>([]);
    const [loadingSignups, setLoadingSignups] = useState(false);
    const [addToListId, setAddToListId] = useState(initial?.addToListId || '');
    const [isActive, setIsActive] = useState(initial?.isActive ?? true);
    const [autoTagIds] = useState<string[]>(initial?.autoTagIds || []);
    const [linkedPollId, setLinkedPollId] = useState(initial?.linkedPollId || '');
    const [numberIds, setNumberIds] = useState<string[]>(initial?.numberIds || []);
    const [createWorkflow, setCreateWorkflow] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        if (actionType === 'event_registration' && signups.length === 0) {
            setLoadingSignups(true);
            fetch(`/api/public/registrations/${churchId}`)
                .then(res => res.json())
                .then(data => {
                    if (Array.isArray(data)) {
                        setSignups(data);
                    }
                    setLoadingSignups(false);
                })
                .catch(() => setLoadingSignups(false));
        }
    }, [actionType, churchId, signups.length]);

    const segs = countSegments(replyMessage);
    const isEdit = !!initial;

    const handleSubmit = async () => {
        const kw = keyword.trim().toUpperCase().replace(/\s+/g, '');
        if (!kw) { setError('Keyword is required.'); return; }
        if (actionType === 'static' && !replyMessage.trim()) { setError('Auto-reply message is required.'); return; }
        if (!/^[A-Z0-9]+$/.test(kw)) { setError('Keywords can only contain letters and numbers.'); return; }
        if (actionType === 'event_registration' && !pcoSignupId) { setError('Please select a Planning Center Event Signup.'); return; }
        setError('');
        const selectedList = pcoLists.find(l => l.id === addToListId);
        const selectedPoll = polls.find(p => p.id === linkedPollId);
        await onSave({
            churchId: initial?.churchId || '',
            keyword: kw,
            actionType: actionType,
            pcoSignupId: actionType === 'event_registration' ? pcoSignupId : null,
            replyMessage: replyMessage.trim(),
            addToListId: addToListId || null,
            addToListName: selectedList?.name || null,
            autoTagIds: autoTagIds.length > 0 ? autoTagIds : [],
            linkedPollId: linkedPollId || null,
            linkedPollTitle: selectedPoll?.title || null,
            numberIds,
            isActive,
            createWorkflow: actionType === 'event_registration' ? createWorkflow : false,
        });
    };

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-7 w-full max-w-md mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                <h3 className="text-lg font-black text-slate-900 dark:text-white mb-1 flex items-center gap-2">
                    <Key size={18} className="text-indigo-500" /> {isEdit ? 'Edit Keyword' : 'New Keyword'}
                </h3>
                <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
                    When someone texts this word to your number, we'll auto-reply instantly.
                </p>

                <div className="mb-4">
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Trigger Word</label>
                    <input
                        type="text"
                        value={keyword}
                        onChange={e => setKeyword(e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''))}
                        placeholder="YOUTH"
                        maxLength={30}
                        className="w-full text-xl font-black tracking-wide border-2 border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-300 focus:outline-none focus:border-indigo-500"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">Letters &amp; numbers only, no spaces. Stored as UPPERCASE.</p>
                </div>

                <div className="mb-4">
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Action Type</label>
                    <select
                        value={actionType}
                        onChange={e => setActionType(e.target.value as SmsKeywordAction)}
                        title="Action Type"
                        className="w-full text-sm font-semibold border-2 border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                    >
                        <option value="static">Static Reply Message</option>
                        <option value="registration_events">Send Registration Events</option>
                        <option value="small_groups">Send Small Groups</option>
                        <option value="giving_ytd">Send Giving YTD (by Phone Number)</option>
                        <option value="event_registration">Event Registration Flow</option>
                    </select>
                    {actionType === 'registration_events' && <p className="text-[10px] text-slate-400 mt-1">Replies with a link to your Church Center Registrations page.</p>}
                    {actionType === 'small_groups' && <p className="text-[10px] text-slate-400 mt-1">Replies with a link to your Church Center Groups page.</p>}
                    {actionType === 'giving_ytd' && <p className="text-[10px] text-slate-400 mt-1">Looks up the person by their phone number and replies with their Year-to-Date giving total.</p>}
                    {actionType === 'event_registration' && <p className="text-[10px] text-slate-400 mt-1">Starts an interactive SMS conversational flow to register the sender for a free/paid event.</p>}
                </div>

                {actionType === 'event_registration' && (
                    <>
                        <div className="mb-4 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-2xl p-4">
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">PCO Event Signup</label>
                            {loadingSignups ? (
                                <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={13} className="animate-spin" /> Loading signups...</div>
                            ) : (
                                <select
                                    value={pcoSignupId}
                                    onChange={e => setPcoSignupId(e.target.value)}
                                    title="PCO Event Signup"
                                    className="w-full text-sm font-semibold border-2 border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                                >
                                    <option value="">— Select PCO Event Signup —</option>
                                    {signups.map(s => (
                                        <option key={s.id} value={s.id}>{s.name}</option>
                                    ))}
                                </select>
                            )}
                        </div>

                        <div className="mb-4 bg-indigo-50/20 dark:bg-indigo-950/10 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl p-4">
                            <label className="flex items-start gap-2.5 cursor-pointer text-xs font-bold text-slate-700 dark:text-slate-200 select-none">
                                <input
                                    type="checkbox"
                                    checked={createWorkflow}
                                    onChange={e => setCreateWorkflow(e.target.checked)}
                                    className="mt-0.5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 w-4 h-4 shrink-0"
                                />
                                <span>Automatically create keyword workflow</span>
                            </label>
                            <p className="text-[10px] text-slate-400 pl-6.5 mt-1 leading-snug">
                                Automatically builds an active multi-step follow-up series (invite immediately + reminder in 2 days) tied to this keyword.
                            </p>
                        </div>
                    </>
                )}

                <div className="mb-4">
                    <div className="flex items-center justify-between mb-2">
                        <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                            {actionType === 'static' ? 'Auto-Reply Message' : 'Prefix Message (Optional)'}
                        </label>
                        <span className={`text-xs font-bold ${segs > 3 ? 'text-red-500' : segs > 1 ? 'text-amber-600' : 'text-slate-400'}`}>
                            {replyMessage.length} chars • {segs} seg{segs !== 1 ? 's' : ''}
                        </span>
                    </div>
                    <textarea
                        rows={4}
                        value={replyMessage}
                        onChange={e => setReplyMessage(e.target.value)}
                        placeholder={actionType === 'static' ? `Thanks for texting ${keyword || 'YOUTH'}! Here's what you need to know...` : 'Here is the link you requested:'}
                        className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                    />

                    {replyMessage.trim() && (
                        <div className="mt-2 bg-slate-100 dark:bg-slate-800/60 rounded-2xl p-3 flex justify-end">
                            <div className="bg-indigo-600 text-white text-xs px-3 py-2 rounded-2xl rounded-br-sm max-w-[85%] leading-relaxed whitespace-pre-wrap break-words">
                                {replyMessage}
                                {actionType === 'registration_events' && "\n\nhttps://[your-church].churchcenter.com/registrations"}
                                {actionType === 'small_groups' && "\n\nhttps://[your-church].churchcenter.com/groups"}
                                {actionType === 'giving_ytd' && "\n\nHi John, your year-to-date giving is $1,234.56. Thank you!"}
                            </div>
                        </div>
                    )}
                </div>

                <div className="mb-4">
                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Add to PCO List (optional)</label>
                    <p className="text-[10px] text-slate-400 mb-2">When a match occurs, automatically add the sender to this Planning Center list.</p>
                    {loadingLists ? (
                        <div className="flex items-center gap-2 text-sm text-slate-400"><Loader2 size={13} className="animate-spin" /> Loading...</div>
                    ) : (
                        <select
                            value={addToListId}
                            onChange={e => setAddToListId(e.target.value)}
                            title="Add to PCO list"
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">-- Don't add to a list --</option>
                            {pcoLists.map(l => <option key={l.id} value={l.id}>{l.name} ({l.total_people})</option>)}
                        </select>
                    )}
                </div>

                {polls.length > 0 && (
                    <div className="mb-4">
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Link to Poll (optional)</label>
                        <p className="text-[10px] text-slate-400 mb-2">When this keyword matches, the poll participation link is automatically appended to the auto-reply message.</p>
                        <select
                            value={linkedPollId}
                            onChange={e => setLinkedPollId(e.target.value)}
                            title="Linked Poll"
                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">-- Don't link a poll --</option>
                            {polls.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                        {linkedPollId && (
                            <p className="text-[10px] text-indigo-600 dark:text-indigo-400 mt-1 flex items-center gap-1">
                                <Tv2 size={10} />
                                Poll link will be appended: {window.location.origin}/poll/{linkedPollId}
                            </p>
                        )}
                    </div>
                )}

                {allSmsNumbers.length > 1 && (
                    <div className="mb-5">
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                            Active Phone Lines
                        </label>
                        <p className="text-[10px] text-slate-400 mb-2">
                            Choose which phone lines trigger this keyword. Leave all unchecked to apply to every line.
                        </p>
                        <div className="space-y-1.5">
                            {allSmsNumbers.map(num => {
                                const isChecked = numberIds.includes(num.id);
                                return (
                                    <button
                                        key={num.id}
                                        type="button"
                                        onClick={() => {
                                            setNumberIds(prev =>
                                                prev.includes(num.id)
                                                    ? prev.filter(id => id !== num.id)
                                                    : [...prev, num.id]
                                            );
                                        }}
                                        className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold border transition ${isChecked
                                                ? 'bg-indigo-50 dark:bg-indigo-900/40 border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300'
                                                : 'bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-indigo-300'
                                            }`}
                                    >
                                        <div className={`w-4 h-4 rounded-full border flex items-center justify-center shrink-0 transition-colors ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-600'
                                            }`}>
                                            {isChecked && <CheckCircle size={10} className="text-white" />}
                                        </div>
                                        {num.friendlyLabel}
                                        <span className="text-[10px] text-slate-400 font-normal ml-auto">{num.phoneNumber}</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                )}

                <div className="flex items-center justify-between mb-5 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <div>
                        <p className="text-sm font-bold text-slate-900 dark:text-white">Active</p>
                        <p className="text-xs text-slate-500">Keyword only fires when active</p>
                    </div>
                    <button
                        onClick={() => setIsActive(v => !v)}
                        title={isActive ? 'Deactivate keyword' : 'Activate keyword'}
                        className={`relative w-12 h-6 rounded-full transition-colors ${isActive ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
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
                        className="flex-1 py-2.5 text-sm font-black bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition flex items-center justify-center gap-2"
                    >
                        {isBusy ? <><Loader2 size={14} className="animate-spin" />Saving...</> : <><CheckCircle size={14} />{isEdit ? 'Save Changes' : 'Create Keyword'}</>}
                    </button>
                </div>
            </div>
        </div>
    );
};

const AddSubscriberModal: React.FC<{
    keyword: SmsKeyword;
    churchId: string;
    onClose: () => void;
}> = ({ keyword, churchId, onClose }) => {
    const [queryText, setQueryText] = React.useState('');
    const [results, setResults] = React.useState<{ id: string; name: string; phone?: string }[]>([]);
    const [searching, setSearching] = React.useState(false);
    const [saving, setSaving] = React.useState(false);
    const [saved, setSaved] = React.useState(false);
    const [error, setError] = React.useState<string | null>(null);

    const handleSearch = async (e: React.FormEvent) => {
        e.preventDefault();
        const q = queryText.trim();
        if (!q) return;
        setSearching(true);
        setError(null);
        try {
            const snap = await getDocs(
                firebaseQuery(
                    collection(firebaseDb, 'people'),
                    where('churchId', '==', churchId),
                    orderBy('name'),
                    startAt(q),
                    endAt(q + '\uf8ff'),
                    limit(10)
                )
            );
            setResults(snap.docs.map(d => {
                const data = d.data();
                return { id: data.id || d.id, name: data.name || '', phone: data.phone || data.e164Phone || '' };
            }));
        } catch (e: any) {
            setError('Search failed: ' + (e?.message || String(e)));
        } finally {
            setSearching(false);
        }
    };

    const handleAdd = async (person: { id: string; name: string; phone?: string }) => {
        setSaving(true);
        setError(null);
        try {
            const subId = `${churchId}_${person.id}_${keyword.id}`;
            const subRef = doc(firebaseDb, 'smsKeywordSubscriptions', subId);
            const existing = await getDoc(subRef);
            if (existing.exists()) {
                setError(`${person.name} is already subscribed to ${keyword.keyword}.`);
                setSaving(false);
                return;
            }
            await setDoc(subRef, {
                id: subId,
                churchId,
                personId: person.id,
                personName: person.name,
                phoneNumber: person.phone || '',
                keyword: keyword.keyword,
                keywordId: keyword.id,
                subscribedAt: Date.now(),
                source: 'manual',
            });
            setSaved(true);
            setTimeout(onClose, 1200);
        } catch (e: any) {
            setError('Failed to save: ' + (e?.message || String(e)));
        } finally {
            setSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4" onClick={onClose}>
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-md p-6" onClick={e => e.stopPropagation()}>
                <div className="flex items-center gap-2 mb-4">
                    <div className="w-8 h-8 rounded-xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center">
                        <UserPlus size={15} className="text-indigo-600 dark:text-indigo-300" />
                    </div>
                    <div>
                        <p className="text-sm font-black text-slate-900 dark:text-white">Add Subscriber</p>
                        <p className="text-[10px] text-slate-500">
                            Manually subscribe someone to{' '}
                            <span className="font-black text-indigo-600 tracking-wide">{keyword.keyword}</span>
                        </p>
                    </div>
                    <button onClick={onClose} className="ml-auto p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition">
                        <X size={16} />
                    </button>
                </div>

                {saved ? (
                    <div className="flex items-center gap-2 text-sm text-emerald-600 dark:text-emerald-400 font-semibold py-6 justify-center">
                        <CheckCircle size={18} /> Subscriber added!
                    </div>
                ) : (
                    <>
                        <form onSubmit={handleSearch} className="flex gap-2 mb-3">
                            <input
                                autoFocus
                                type="text"
                                value={queryText}
                                onChange={e => setQueryText(e.target.value)}
                                placeholder="Search by name…"
                                className="flex-1 text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                                type="submit"
                                disabled={searching || !queryText.trim()}
                                className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition flex items-center gap-1.5"
                            >
                                {searching ? <Loader2 size={13} className="animate-spin" /> : <Search size={13} />}
                                Search
                            </button>
                        </form>

                        {error && <p className="text-xs text-red-500 mb-3">{error}</p>}

                        {results.length > 0 && (
                            <div className="space-y-1.5 max-h-60 overflow-y-auto">
                                {results.map(person => (
                                    <button
                                        key={person.id}
                                        onClick={() => handleAdd(person)}
                                        disabled={saving}
                                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-indigo-50 dark:hover:bg-indigo-900/20 text-left transition disabled:opacity-50"
                                    >
                                        <div className="w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center text-xs font-black text-indigo-600 dark:text-indigo-300 shrink-0">
                                            {person.name.charAt(0).toUpperCase()}
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-semibold text-slate-900 dark:text-white truncate">{person.name}</p>
                                            {person.phone && <p className="text-[10px] text-slate-400">{person.phone}</p>}
                                        </div>
                                        <Plus size={13} className="ml-auto text-indigo-400 shrink-0" />
                                    </button>
                                ))}
                            </div>
                        )}

                        {!searching && results.length === 0 && queryText.trim() && (
                            <p className="text-xs text-slate-400 text-center py-4">No people found matching "{queryText}".</p>
                        )}
                    </>
                )}
            </div>
        </div>
    );
};

export const SmsKeywordsManager: React.FC<{
    churchId: string;
    church: Church;
    currentUser: User;
    twilioNumberId?: string | null;
    activeNumber?: TwilioPhoneNumber | null;
    onUpdateChurch?: (updates: Partial<Church>) => void;
}> = ({ churchId, church, currentUser, twilioNumberId, activeNumber, onUpdateChurch }) => {
    const [keywords, setKeywords] = useState<SmsKeyword[]>([]);
    const [isLoading, setIsLoading] = useState(true);
    const [listError, setListError] = useState<string | null>(null);
    const [editKw, setEditKw] = useState<SmsKeyword | null>(null);
    const [modalOpen, setModalOpen] = useState(false);
    const [isBusy, setIsBusy] = useState(false);
    const [saveError, setSaveError] = useState<string | null>(null);
    const [pcoLists, setPcoLists] = useState<{ id: string; name: string; total_people: number }[]>([]);
    const [loadingLists, setLoadingLists] = useState(false);
    const [addSubKw, setAddSubKw] = useState<SmsKeyword | null>(null);

    const [tags, setTags] = useState<SmsTag[]>([]);
    const [tagModalOpen, setTagModalOpen] = useState(false);
    const [editTag, setEditTag] = useState<SmsTag | null>(null);
    const [tagName, setTagName] = useState('');
    const [tagEmoji, setTagEmoji] = useState('');
    const [tagColor, setTagColor] = useState<SmsTag['color']>('violet');
    const [tagAutoReply, setTagAutoReply] = useState('');
    const [tagDetectionEnabled, setTagDetectionEnabled] = useState(false);
    const [tagDetectionPhrases, setTagDetectionPhrases] = useState('');
    const [tagClarifyingReply, setTagClarifyingReply] = useState('');
    const [tagDetectionNumberIds, setTagDetectionNumberIds] = useState<string[]>([]);
    const [tagBusy, setTagBusy] = useState(false);
    const [activeSection, setActiveSection] = useState<'keywords' | 'tags'>('keywords');

    const { numbers: allSmsNumbers } = useTwilioNumbers(churchId);

    const [polls, setPolls] = useState<{ id: string; title: string }[]>([]);
    useEffect(() => {
        firestore.getPolls(churchId)
            .then(ps => setPolls(ps.filter(p => p.status !== 'closed').map(p => ({ id: p.id, title: p.title }))))
            .catch(() => { });
    }, [churchId]);

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

    const [tagLoadError, setTagLoadError] = useState<string | null>(null);
    useEffect(() => {
        const q = query(
            collection(firebaseDb, 'smsTags'),
            where('churchId', '==', churchId),
            orderBy('createdAt', 'asc')
        );
        return onSnapshot(
            q,
            snap => {
                setTags(snap.docs.map(d => ({ id: d.id, ...d.data() } as SmsTag)));
                setTagLoadError(null);
            },
            (err: any) => {
                console.error('[SmsTags] onSnapshot error:', err);
                if (err?.code === 'failed-precondition' || (err?.message || '').toLowerCase().includes('index')) {
                    setTagLoadError(
                        'A Firestore composite index is required for the smsTags collection. ' +
                        'Open the browser console, click the index creation link in the error, then reload.'
                    );
                } else {
                    setTagLoadError('Failed to load tags: ' + (err?.message || String(err)));
                }
            }
        );
    }, [churchId]);

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

    const handleSave = async (data: Omit<SmsKeyword, 'id' | 'matchCount' | 'createdAt'> & { createWorkflow?: boolean }) => {
        setIsBusy(true);
        setSaveError(null);
        try {
            const { createWorkflow, ...kwData } = data;
            let kwId = '';

            if (editKw) {
                kwId = editKw.id;
                await updateDoc(doc(firebaseDb, 'smsKeywords', editKw.id), {
                    ...kwData,
                    churchId,
                    twilioNumberId: twilioNumberId || null,
                });
            } else {
                const now = Date.now();
                const newDocRef = await addDoc(collection(firebaseDb, 'smsKeywords'), {
                    ...kwData,
                    churchId,
                    matchCount: 0,
                    createdAt: now,
                    twilioNumberId: twilioNumberId || null,
                });
                kwId = newDocRef.id;
            }

            if (createWorkflow && kwData.actionType === 'event_registration' && kwData.pcoSignupId) {
                const regSnap = await getDocs(query(
                    collection(firebaseDb, 'pco_registrations'),
                    where('churchId', '==', churchId),
                    where('pcoId', '==', kwData.pcoSignupId)
                ));

                let eventName = 'Event';
                if (!regSnap.empty) {
                    eventName = regSnap.docs[0].data().name || 'Event';
                }

                const steps = [
                    {
                        id: `step_${Date.now()}_1`,
                        order: 0,
                        delayDays: 0,
                        delayHours: 0,
                        channelType: 'sms' as const,
                        message: `Hi {firstName}! Let's get you registered for ${eventName}. Reply YES to sign up!`,
                        scheduleType: 'relative' as const
                    },
                    {
                        id: `step_${Date.now()}_2`,
                        order: 1,
                        delayDays: 2,
                        delayHours: 0,
                        channelType: 'sms' as const,
                        message: `Hi {firstName}, just checking in! Don't forget to register for ${eventName} here: {eventLink}`,
                        scheduleType: 'relative' as const
                    }
                ];

                await addDoc(collection(firebaseDb, 'smsWorkflows'), {
                    churchId,
                    name: `${kwData.keyword} Registration Workflow`,
                    description: `Automated registration flow and follow-up reminders for ${eventName}.`,
                    trigger: 'keyword',
                    triggerKeywordId: kwId,
                    triggerKeywordWord: kwData.keyword,
                    twilioNumberId: twilioNumberId || null,
                    isActive: true,
                    enrolledCount: 0,
                    completedCount: 0,
                    allowReentry: true,
                    steps,
                    createdAt: Date.now(),
                    updatedAt: Date.now()
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

    const openNewTag = () => {
        setEditTag(null); setTagName(''); setTagEmoji(''); setTagColor('violet'); setTagAutoReply('');
        setTagDetectionEnabled(false); setTagDetectionPhrases(''); setTagClarifyingReply('');
        setTagDetectionNumberIds([]); setTagModalOpen(true);
    };
    const openEditTag = (t: SmsTag) => {
        setEditTag(t); setTagName(t.name); setTagEmoji(t.emoji || ''); setTagColor(t.color); setTagAutoReply(t.autoReplyMessage || '');
        setTagDetectionEnabled(t.detectionEnabled ?? false); setTagDetectionPhrases(t.detectionPhrases || ''); setTagClarifyingReply(t.clarifyingReply || '');
        setTagDetectionNumberIds(t.detectionNumberIds || []); setTagModalOpen(true);
    };
    const handleSaveTag = async () => {
        if (!tagName.trim()) return;
        setTagBusy(true);
        try {
            if (editTag) {
                const updatePayload: any = { name: tagName.trim(), color: tagColor };
                if (tagEmoji.trim()) updatePayload.emoji = tagEmoji.trim();
                else updatePayload.emoji = null;
                if (tagAutoReply.trim()) updatePayload.autoReplyMessage = tagAutoReply.trim();
                else updatePayload.autoReplyMessage = null;
                updatePayload.detectionEnabled = tagDetectionEnabled;
                updatePayload.detectionPhrases = tagDetectionEnabled ? tagDetectionPhrases.trim() : null;
                updatePayload.clarifyingReply = tagDetectionEnabled && tagClarifyingReply.trim() ? tagClarifyingReply.trim() : null;
                updatePayload.detectionNumberIds = tagDetectionEnabled ? tagDetectionNumberIds : [];
                await updateDoc(doc(firebaseDb, 'smsTags', editTag.id), updatePayload);
            } else {
                const newTag: any = {
                    churchId,
                    name: tagName.trim(),
                    color: tagColor,
                    createdAt: Date.now(),
                };
                if (tagEmoji.trim()) newTag.emoji = tagEmoji.trim();
                if (tagAutoReply.trim()) newTag.autoReplyMessage = tagAutoReply.trim();
                if (tagDetectionEnabled) {
                    newTag.detectionEnabled = true;
                    newTag.detectionPhrases = tagDetectionPhrases.trim() || null;
                    newTag.clarifyingReply = tagClarifyingReply.trim() || null;
                    newTag.detectionNumberIds = tagDetectionNumberIds;
                }
                await addDoc(collection(firebaseDb, 'smsTags'), newTag);
            }
            setTagModalOpen(false);
            setTagName(''); setTagEmoji(''); setTagColor('violet'); setTagAutoReply('');
            setTagDetectionEnabled(false); setTagDetectionPhrases(''); setTagClarifyingReply('');
            setTagDetectionNumberIds([]);
            setEditTag(null);
        } catch (e: any) {
            const msg = e?.code === 'permission-denied'
                ? 'Permission denied — check your Firestore security rules for the smsTags collection.'
                : 'Failed to save tag: ' + (e?.message || String(e));
            alert(msg);
        } finally {
            setTagBusy(false);
        }
    };
    const handleDeleteTag = async (t: SmsTag) => {
        if (!window.confirm(`Delete tag "${t.name}"? It will be removed from all conversations.`)) return;
        await deleteDoc(doc(firebaseDb, 'smsTags', t.id));
    };

    const isAdmin = currentUser.roles?.includes('Church Admin') || currentUser.roles?.includes('System Administration');
    const prayerEnabled = !!(church.smsSettings?.prayerDetectionEnabled);
    const [draftReply, setDraftReply] = React.useState(church.smsSettings?.prayerClarifyingReply || '');
    const [prayerSaving, setPrayerSaving] = React.useState(false);

    const handleTogglePrayer = async () => {
        if (!onUpdateChurch) return;
        setPrayerSaving(true);
        try {
            await onUpdateChurch({
                smsSettings: {
                    ...church.smsSettings,
                    prayerDetectionEnabled: !prayerEnabled,
                },
            });
        } finally {
            setPrayerSaving(false);
        }
    };

    const handleSaveReply = async () => {
        if (!onUpdateChurch) return;
        setPrayerSaving(true);
        try {
            await onUpdateChurch({
                smsSettings: {
                    ...church.smsSettings,
                    prayerClarifyingReply: draftReply.trim() || undefined,
                },
            });
        } finally {
            setPrayerSaving(false);
        }
    };

    const agentOn = activeNumber
        ? (activeNumber.smsAgentEnabled !== undefined ? activeNumber.smsAgentEnabled : !!(church.smsSettings?.smsAgentEnabled))
        : !!(church.smsSettings?.smsAgentEnabled);
    const [agentSaving, setAgentSaving] = React.useState(false);

    const handleToggleAgent = async () => {
        setAgentSaving(true);
        try {
            if (activeNumber) {
                await fetch(`${API_BASE}/api/messaging/number-settings`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        twilioNumberId: activeNumber.id,
                        smsAgentEnabled: !agentOn
                    })
                });
            } else {
                if (!onUpdateChurch) return;
                await onUpdateChurch({
                    smsSettings: {
                        ...church.smsSettings,
                        smsAgentEnabled: !agentOn,
                    },
                });
            }
        } catch (err) {
            console.error('Failed to toggle agent:', err);
        } finally {
            setAgentSaving(false);
        }
    };

    const filteredKeywords = twilioNumberId
        ? keywords.filter(k => !k.twilioNumberId || k.twilioNumberId === twilioNumberId || (k.numberIds && k.numberIds.includes(twilioNumberId)))
        : keywords;

    return (
        <ToolPage>
            {addSubKw && (
                <AddSubscriberModal
                    keyword={addSubKw}
                    churchId={churchId}
                    onClose={() => setAddSubKw(null)}
                />
            )}
            <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
                <Key size={18} className="text-indigo-500 dark:text-indigo-400" aria-hidden="true" /> Keywords &amp; tags
            </h2>
            <div className="flex flex-wrap items-center gap-3 mb-5">
                <ToolTabs
                    ariaLabel="Keywords or tags"
                    value={activeSection}
                    onChange={setActiveSection}
                    tabs={[
                        { value: 'keywords', label: 'Keywords', icon: Key },
                        { value: 'tags', label: 'Tags', icon: Tag },
                    ]}
                />
                {activeSection === 'keywords' && (
                    <ToolButton variant="primary" icon={Plus} onClick={openNew} className="ml-auto">
                        New Keyword
                    </ToolButton>
                )}
                {activeSection === 'tags' && (
                    <ToolButton variant="primary" icon={Plus} onClick={openNewTag} className="ml-auto">
                        New Tag
                    </ToolButton>
                )}
            </div>

            {activeSection === 'keywords' && (
                <>
                    {listError && (
                        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 mb-4">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
                            <span>{listError}</span>
                        </div>
                    )}
                    {isLoading ? (
                        <div className="flex items-center justify-center h-40 text-slate-400"><Loader2 size={20} className="animate-spin mr-2" /> Loading keywords...</div>
                    ) : filteredKeywords.length === 0 && !listError ? (
                        <ToolEmptyState
                            icon={Key}
                            title="No keywords yet"
                            description="Create your first keyword to start auto-replying to texts."
                            action={
                                <ToolButton variant="primary" icon={Plus} onClick={openNew}>
                                    New Keyword
                                </ToolButton>
                            }
                        />
                    ) : (
                        <div className="space-y-3">
                            {filteredKeywords.map(kw => {
                                const kwTags = tags.filter(t => (kw.autoTagIds || []).includes(t.id));
                                return (
                                    <div
                                        key={kw.id}
                                        className="p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-indigo-200 dark:hover:border-indigo-700 transition"
                                    >
                                        <div className="flex items-start gap-3">
                                            <div className={`shrink-0 px-2.5 py-1.5 rounded-xl text-sm font-black tracking-wide self-start ${kw.isActive ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-200' : 'bg-slate-100 dark:bg-slate-700 text-slate-400 line-through'}`}>
                                                {kw.keyword}
                                            </div>
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm text-slate-700 dark:text-slate-300">{kw.replyMessage}</p>
                                                <div className="flex items-center flex-wrap gap-x-3 gap-y-1 mt-1">
                                                    {kw.addToListName && (
                                                        <span className="text-[10px] text-blue-600 dark:text-blue-400 font-semibold flex items-center gap-1">
                                                            <Users size={10} /> → {kw.addToListName}
                                                        </span>
                                                    )}
                                                    {kw.linkedPollTitle && (
                                                        <span className="text-[10px] text-indigo-600 dark:text-indigo-400 font-semibold flex items-center gap-1">
                                                            <Tv2 size={10} /> Poll: {kw.linkedPollTitle}
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
                                            <div className="flex items-center gap-2 shrink-0">
                                                <div className="text-center hidden sm:block">
                                                    <p className="text-lg font-black text-indigo-600 dark:text-indigo-300">{kw.matchCount}</p>
                                                    <p className="text-[10px] text-slate-400 uppercase tracking-wide">matches</p>
                                                </div>
                                                <button
                                                    onClick={() => setAddSubKw(kw)}
                                                    title="Manually add a subscriber"
                                                    className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition"
                                                >
                                                    <UserPlus size={14} />
                                                </button>
                                                <button
                                                    onClick={() => handleToggleActive(kw)}
                                                    title={kw.isActive ? 'Deactivate' : 'Activate'}
                                                    className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${kw.isActive ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                                                >
                                                    <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${kw.isActive ? 'translate-x-5' : 'translate-x-0'}`} />
                                                </button>
                                                <div className="flex items-center gap-1">
                                                    <button onClick={() => openEdit(kw)} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition" title="Edit">
                                                        <Pencil size={14} />
                                                    </button>
                                                    <button onClick={() => handleDelete(kw)} className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition" title="Delete">
                                                        <Trash2 size={14} />
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    <div className="mt-6 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl p-3">
                        <AlertTriangle size={13} className="text-amber-500 mt-0.5 shrink-0" />
                        <span>
                            <strong>Reserved words:</strong> STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, HELP, and START are reserved by carriers and cannot be used as custom keywords. These responses are handled automatically.
                        </span>
                    </div>
                </>
            )}

            {activeSection === 'tags' && (
                <>
                    <div className="flex items-start gap-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-2xl p-4 mb-6">
                        <Bot size={28} className="shrink-0 text-emerald-600 dark:text-emerald-400 mt-0.5" aria-hidden="true" />
                        <div>
                            <p className="text-sm font-bold text-emerald-800 dark:text-emerald-200 mb-1">Conversation tags</p>
                            <p className="text-xs text-emerald-700 dark:text-emerald-300 leading-relaxed">
                                Tags let you categorise and filter SMS conversations. Apply them manually from any conversation, or automatically when a keyword is matched. Create tags like{' '}
                                <span className="font-bold">Prayer Request 🙏</span>,{' '}<span className="font-bold">Service Times ⏰</span>, or{' '}<span className="font-bold">Pastoral Care 🤝</span>.
                            </p>
                        </div>
                    </div>

                    {tagLoadError && (
                        <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-300 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3 mb-4">
                            <AlertTriangle size={14} className="shrink-0 mt-0.5 text-amber-500" />
                            <span>{tagLoadError}</span>
                        </div>
                    )}

                    {tags.length === 0 ? (
                        <ToolEmptyState
                            icon={Tag}
                            title="No tags yet"
                            description="Tags help you track conversations by topic."
                            action={
                                <ToolButton variant="primary" icon={Plus} onClick={openNewTag}>
                                    New Tag
                                </ToolButton>
                            }
                        />
                    ) : (
                        <div className="space-y-3">
                            {tags.map(t => {
                                const c = TAG_COLOR_MAP[t.color] || TAG_COLOR_MAP.violet;
                                return (
                                    <div key={t.id} className="flex items-center gap-4 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl hover:border-indigo-200 dark:hover:border-indigo-700 transition group">
                                        <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-lg shrink-0 ${c.bg}`}>
                                            {t.emoji || <Tag size={18} className={c.text} />}
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <p className={`font-bold text-sm ${c.text}`}>{t.name}</p>
                                                <span className={`px-2 py-0.5 text-[10px] font-bold rounded-full border capitalize ${c.bg} ${c.text} ${c.border}`}>{t.color}</span>
                                                {t.autoReplyMessage && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700">
                                                        <MessageSquare size={9} /> Auto-Reply
                                                    </span>
                                                )}
                                                {t.detectionEnabled && (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
                                                        <Sparkles size={9} /> Auto-Detect
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-slate-400 mt-0.5">
                                                {t.autoReplyMessage
                                                    ? <span className="text-slate-500 dark:text-slate-400 truncate block max-w-xs">? "{t.autoReplyMessage}"</span>
                                                    : <span>Created {new Date(t.createdAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}</span>
                                                }
                                            </p>
                                        </div>
                                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                                            <button onClick={() => openEditTag(t)} className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700 transition" title="Edit tag">
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

            <div className="mt-8 border-t border-slate-200 dark:border-slate-700 pt-8">
                <div className="flex items-start justify-between gap-4 mb-4">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                            <HandHeart size={18} aria-hidden="true" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900 dark:text-white">Prayer Request Detection</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed max-w-lg">
                                Automatically recognises natural-language prayer requests in incoming SMS messages
                                and tags the conversation{' '}
                                <span className="inline-flex items-center gap-0.5 font-semibold text-indigo-600 dark:text-indigo-400"><Tag size={11} aria-hidden="true" /> Needs Prayer</span>{' '}
                                in your Inbox. Generic asks (e.g. &ldquo;Will you pray for me?&rdquo;) trigger a clarifying reply first.
                            </p>
                        </div>
                    </div>

                    {isAdmin ? (
                        <button
                            onClick={handleTogglePrayer}
                            disabled={prayerSaving}
                            title={prayerEnabled ? 'Disable prayer detection' : 'Enable prayer detection'}
                            className={`relative shrink-0 w-12 h-6 rounded-full transition-colors disabled:opacity-60 ${prayerEnabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${prayerEnabled ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                    ) : (
                        <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${prayerEnabled ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                            {prayerEnabled ? 'On' : 'Off'}
                        </span>
                    )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-5">
                    <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                        <p className="text-xs font-black text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                            <MessageSquare size={12} className="text-indigo-500" /> Specific Request
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed italic">
                            &ldquo;Please pray for my mom&rsquo;s surgery&rdquo;
                        </p>
                        <div className="mt-2 flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                            <CheckCircle size={11} /> Tagged <span className="inline-flex items-center gap-0.5 font-bold ml-0.5"><Tag size={10} aria-hidden="true" /> Needs Prayer</span> immediately
                        </div>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                        <p className="text-xs font-black text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-1.5">
                            <MessageSquare size={12} className="text-amber-500" /> Generic Ask
                        </p>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed italic">
                            &ldquo;Will you pray for me?&rdquo;
                        </p>
                        <div className="mt-2 flex flex-col gap-1">
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                                <MessageSquare size={11} /> Clarifying reply sent first
                            </div>
                            <div className="flex items-center gap-1.5 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                <CheckCircle size={11} /> On reply <ArrowRight size={10} aria-hidden="true" /> tagged <span className="inline-flex items-center gap-0.5 font-bold ml-0.5"><Tag size={10} aria-hidden="true" /> Needs Prayer</span>
                            </div>
                        </div>
                    </div>
                </div>

                {isAdmin && prayerEnabled && (
                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                            Clarifying Reply Message
                        </label>
                        <p className="text-[10px] text-slate-400 mb-3">
                            Sent when a generic ask is detected. Leave blank to use the default.
                        </p>
                        <div className="flex gap-2 items-end">
                            <input
                                type="text"
                                value={draftReply}
                                onChange={e => setDraftReply(e.target.value)}
                                placeholder="What would you like prayer for?"
                                maxLength={160}
                                className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <button
                                onClick={handleSaveReply}
                                disabled={prayerSaving || draftReply.trim() === (church.smsSettings?.prayerClarifyingReply || '')}
                                className="px-3 py-2 text-xs font-bold bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition flex items-center gap-1.5 shrink-0"
                            >
                                {prayerSaving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle size={12} />}
                                Save
                            </button>
                        </div>
                        <div className="mt-3 bg-slate-50 dark:bg-slate-900/60 rounded-2xl p-3 flex justify-end">
                            <div className="bg-indigo-600 text-white text-xs px-3 py-2 rounded-2xl rounded-br-sm max-w-[85%] leading-relaxed">
                                {draftReply.trim() || 'What would you like prayer for?'}
                            </div>
                        </div>
                    </div>
                )}

                <div className="mt-4 flex items-start gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                    <Info size={11} className="shrink-0 mt-0.5 text-indigo-400" />
                    <span>
                        The <span className="inline-flex items-center gap-0.5 font-semibold"><Tag size={10} aria-hidden="true" /> Needs Prayer</span> tag is created automatically the first time a prayer request is detected.
                        Keyword-based auto-replies always take priority over prayer detection.
                    </span>
                </div>
            </div>

            <div className="mt-8 border-t border-slate-200 dark:border-slate-700 pt-8">
                <div className="flex items-start justify-between gap-4">
                    <div className="flex items-start gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-100 dark:bg-indigo-900/40 flex items-center justify-center shrink-0">
                            <Sparkles size={18} className="text-indigo-600 dark:text-indigo-400" />
                        </div>
                        <div>
                            <h3 className="text-sm font-black text-slate-900 dark:text-white">SMS AI Agent</h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 leading-relaxed max-w-lg">
                                When enabled, a ? button appears in the Inbox reply box so staff can
                                request an AI-suggested reply grounded in your church knowledge base.
                                Incoming messages also receive an automatic AI suggestion in real time.
                            </p>
                            <p className="text-[10px] text-indigo-500 dark:text-indigo-400 mt-1.5">
                                Configure the knowledge base and test the agent in the{' '}
                                <span className="font-semibold">SMS ? AI Agent</span> tab.
                            </p>
                        </div>
                    </div>

                    {isAdmin ? (
                        <button
                            onClick={handleToggleAgent}
                            disabled={agentSaving}
                            title={agentOn ? 'Disable SMS AI Agent' : 'Enable SMS AI Agent'}
                            className={`relative shrink-0 w-12 h-6 rounded-full transition-colors disabled:opacity-60 ${agentOn ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                        >
                            <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${agentOn ? 'translate-x-6' : 'translate-x-0'}`} />
                        </button>
                    ) : (
                        <span className={`shrink-0 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide ${agentOn ? 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
                            {agentOn ? 'On' : 'Off'}
                        </span>
                    )}
                </div>

                <div className="mt-4 flex items-start gap-2 text-[10px] text-slate-400 dark:text-slate-500">
                    <Info size={11} className="shrink-0 mt-0.5 text-indigo-400" />
                    <span>
                        The AI never sends messages automatically — it only suggests replies for staff to review and edit.
                    </span>
                </div>
            </div>

            {modalOpen && (
                <KeywordModal
                    initial={editKw}
                    churchId={churchId}
                    pcoLists={pcoLists}
                    loadingLists={loadingLists}
                    tags={tags}
                    polls={polls}
                    allSmsNumbers={allSmsNumbers}
                    onSave={handleSave}
                    onClose={() => { setModalOpen(false); setEditKw(null); setSaveError(null); }}
                    isBusy={isBusy}
                    saveError={saveError || undefined}
                />
            )}

            {tagModalOpen && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 backdrop-blur-sm" onClick={() => setTagModalOpen(false)}>
                    <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl p-7 w-full max-w-sm mx-4 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
                        <h3 className="text-lg font-black text-slate-900 dark:text-white mb-5 flex items-center gap-2">
                            <Tag size={18} className="text-indigo-500" /> {editTag ? 'Edit Tag' : 'New Tag'}
                        </h3>

                        <div className="mb-4">
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Tag Name</label>
                            <input
                                type="text"
                                value={tagName}
                                onChange={e => setTagName(e.target.value)}
                                placeholder="e.g. Prayer Request"
                                maxLength={40}
                                autoFocus
                                className="w-full text-sm border-2 border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2.5 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Emoji (optional)</label>
                            <input
                                type="text"
                                value={tagEmoji}
                                onChange={e => setTagEmoji(e.target.value)}
                                placeholder="👋"
                                maxLength={4}
                                className="w-24 text-xl border-2 border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 text-center"
                            />
                        </div>

                        <div className="mb-4">
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Color</label>
                            <div className="flex gap-2 flex-wrap">
                                {(Object.keys(TAG_COLOR_MAP) as SmsTag['color'][]).map(color => {
                                    const c = TAG_COLOR_MAP[color];
                                    return (
                                        <button
                                            key={color}
                                            type="button"
                                            onClick={() => setTagColor(color)}
                                            title={color}
                                            className={`w-8 h-8 rounded-full border-4 transition ${tagColor === color ? 'border-slate-900 dark:border-white scale-110' : 'border-transparent hover:scale-105'} ${c.dot}`}
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

                        <div className="mb-6">
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                                Auto-Reply Message <span className="text-slate-300 dark:text-slate-600 normal-case font-normal tracking-normal">(optional)</span>
                            </label>
                            <p className="text-[10px] text-slate-400 mb-2">When this tag is applied to a conversation, automatically send this SMS reply to the contact.</p>
                            <textarea
                                rows={3}
                                value={tagAutoReply}
                                onChange={e => setTagAutoReply(e.target.value)}
                                placeholder={`Thanks for reaching out! We've tagged your message as "${tagName || 'this tag'}" and will follow up soon.`}
                                className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                            />
                            {tagAutoReply.trim() && (
                                <div className="mt-2 bg-slate-100 dark:bg-slate-800/60 rounded-2xl p-3 flex justify-end">
                                    <div className="bg-indigo-600 text-white text-xs px-3 py-2 rounded-2xl rounded-br-sm max-w-[85%] leading-relaxed whitespace-pre-wrap break-words">
                                        {tagAutoReply}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="mb-6 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                            <button
                                type="button"
                                onClick={() => setTagDetectionEnabled(v => !v)}
                                className="w-full flex items-center justify-between gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition"
                            >
                                <div className="flex items-center gap-2.5 text-left">
                                    <Sparkles size={14} className={tagDetectionEnabled ? 'text-indigo-500' : 'text-slate-400'} />
                                    <div>
                                        <p className={`text-xs font-black ${tagDetectionEnabled ? 'text-indigo-700 dark:text-indigo-300' : 'text-slate-600 dark:text-slate-300'}`}>
                                            Auto-Detection
                                        </p>
                                        <p className="text-[10px] text-slate-400 leading-tight">
                                            Scan inbound messages for trigger phrases
                                        </p>
                                    </div>
                                </div>
                                <span className={`relative shrink-0 w-10 h-5 rounded-full transition-colors ${tagDetectionEnabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'}`}>
                                    <span className={`absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${tagDetectionEnabled ? 'translate-x-5' : 'translate-x-0'}`} />
                                </span>
                            </button>

                            {tagDetectionEnabled && (
                                <div className="px-4 pt-3 pb-4 space-y-4 bg-white dark:bg-slate-900">
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                                            Trigger Phrases
                                        </label>
                                        <p className="text-[10px] text-slate-400 mb-2">
                                            Comma-separated. Any inbound message containing one of these (case-insensitive) will auto-apply this tag.
                                        </p>
                                        <input
                                            type="text"
                                            value={tagDetectionPhrases}
                                            onChange={e => setTagDetectionPhrases(e.target.value)}
                                            placeholder="counseling, struggling, anxiety, mental health"
                                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                        {tagDetectionPhrases.trim() && (
                                            <div className="flex flex-wrap gap-1.5 mt-2">
                                                {tagDetectionPhrases.split(',').map(p => p.trim()).filter(Boolean).map((phrase, i) => (
                                                    <span key={i} className="px-2 py-0.5 text-[10px] font-semibold rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700">
                                                        {phrase}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {allSmsNumbers.length > 1 && (
                                        <div>
                                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                                                Active Phone Lines
                                            </label>
                                            <p className="text-[10px] text-slate-400 mb-2">
                                                Choose which phone lines trigger this detection. Leave all unchecked to apply to every line.
                                            </p>
                                            <div className="space-y-1.5">
                                                {allSmsNumbers.map(num => {
                                                    const isChecked = tagDetectionNumberIds.includes(num.id);
                                                    return (
                                                        <button
                                                            key={num.id}
                                                            type="button"
                                                            onClick={() => {
                                                                setTagDetectionNumberIds(prev =>
                                                                    prev.includes(num.id)
                                                                        ? prev.filter(id => id !== num.id)
                                                                        : [...prev, num.id]
                                                                );
                                                            }}
                                                            className={`w-full flex items-center gap-2.5 px-3 py-2 rounded-xl text-sm font-semibold border transition ${isChecked
                                                                    ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-200 border-indigo-300 dark:border-indigo-700'
                                                                    : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                                                                }`}
                                                        >
                                                            <span className={`w-4 h-4 rounded border-2 flex items-center justify-center shrink-0 transition ${isChecked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-600'}`}>
                                                                {isChecked && <CheckCircle size={10} className="text-white" />}
                                                            </span>
                                                            <Phone size={12} className="text-slate-400 shrink-0" />
                                                            <span className="flex-1 text-left truncate">{num.friendlyLabel}</span>
                                                            {num.isDefault && (
                                                                <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400">Default</span>
                                                            )}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                            {tagDetectionNumberIds.length === 0 && (
                                                <p className="mt-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                                                    <CheckCircle size={10} /> Applies to all {allSmsNumbers.length} phone lines
                                                </p>
                                            )}
                                        </div>
                                    )}

                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">
                                            Clarifying Reply <span className="text-slate-300 dark:text-slate-600 normal-case font-normal tracking-normal">(optional)</span>
                                        </label>
                                        <p className="text-[10px] text-slate-400 mb-2">
                                            If set, sends this reply and waits for the next message before applying the tag ... like a two-step flow. Leave blank to tag immediately.
                                        </p>
                                        <textarea
                                            rows={2}
                                            value={tagClarifyingReply}
                                            onChange={e => setTagClarifyingReply(e.target.value)}
                                            placeholder="Can you tell us more about what you're going through?"
                                            maxLength={160}
                                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
                                        />
                                        {tagClarifyingReply.trim() && (
                                            <div className="mt-2 bg-slate-50 dark:bg-slate-900/60 rounded-2xl p-3 flex justify-end">
                                                <div className="bg-indigo-600 text-white text-xs px-3 py-2 rounded-2xl rounded-br-sm max-w-[85%] leading-relaxed">
                                                    {tagClarifyingReply}
                                                </div>
                                            </div>
                                        )}
                                        {!tagClarifyingReply.trim() && (
                                            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                                                <CheckCircle size={11} /> Tag applied immediately on match
                                            </div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>

                        <div className="flex gap-2">
                            <button onClick={() => setTagModalOpen(false)} className="flex-1 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 transition">Cancel</button>
                            <button
                                onClick={handleSaveTag}
                                disabled={tagBusy || !tagName.trim()}
                                className="flex-1 py-2.5 text-sm font-black bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition flex items-center justify-center gap-2"
                            >
                                {tagBusy ? <><Loader2 size={14} className="animate-spin" />Saving...</> : <><CheckCircle size={14} />{editTag ? 'Save' : 'Create Tag'}</>}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </ToolPage>
    );
};
