import React, { useState, useEffect } from 'react';
import { db as firebaseDb } from '../../services/firebase';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import { pcoService } from '../../services/pcoService';
import { Church, User, TwilioPhoneNumber, SmsAgentKnowledge } from '../../types';
import {
    CheckCircle, Loader2, AlertTriangle, Zap, Sparkles,
    ChevronRight, Globe2
} from 'lucide-react';
import { Toast } from './Toast';

const API_BASE = '';

export const SmsAgentTab: React.FC<{
    churchId: string;
    church: Church;
    currentUser: User;
    onUpdateChurch?: (updates: Partial<Church>) => void;
    numbers?: TwilioPhoneNumber[];
    activeNumberId?: string | null;
}> = ({ churchId, church, currentUser, onUpdateChurch, numbers = [], activeNumberId }) => {
    const [selectedNumberId, setSelectedNumberId] = useState<string>('');

    useEffect(() => {
        if (activeNumberId) {
            setSelectedNumberId(activeNumberId);
        } else if (numbers.length > 0 && !selectedNumberId) {
            setSelectedNumberId(numbers[0].id);
        }
    }, [activeNumberId, numbers]);

    const selectedNumber = numbers.find(n => n.id === selectedNumberId) || null;

    const isAdmin = currentUser.roles?.includes('Church Admin') || currentUser.roles?.includes('System Administration');

    const agentEnabled = selectedNumber
        ? (selectedNumber.smsAgentEnabled !== undefined ? selectedNumber.smsAgentEnabled : !!(church.smsSettings?.smsAgentEnabled))
        : !!(church.smsSettings?.smsAgentEnabled);

    const execAgentEnabled = selectedNumber
        ? (selectedNumber.executiveAiAgentEnabled !== undefined ? selectedNumber.executiveAiAgentEnabled : !!(church.smsSettings?.executiveAiAgentEnabled))
        : !!(church.smsSettings?.executiveAiAgentEnabled);

    const execAgentKeyword = selectedNumber
        ? (selectedNumber.executiveAiAgentKeyword !== undefined ? selectedNumber.executiveAiAgentKeyword : (church.smsSettings?.executiveAiAgentKeyword || 'AI Agent'))
        : (church.smsSettings?.executiveAiAgentKeyword || 'AI Agent');

    const execListId = selectedNumber
        ? (selectedNumber.executiveAiAgentListId !== undefined ? selectedNumber.executiveAiAgentListId : (church.smsSettings?.executiveAiAgentListId || ''))
        : (church.smsSettings?.executiveAiAgentListId || '');

    const [pcoLists, setPcoLists] = useState<{ id: string; attributes: { name: string; total_people: number } }[]>([]);
    const [loadingLists, setLoadingLists] = useState(false);

    const [kb, setKb] = useState<Partial<SmsAgentKnowledge>>({});
    const [kbLoading, setKbLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [savedAt, setSavedAt] = useState<number | null>(null);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const [testInput, setTestInput] = useState('');
    const [testOutput, setTestOutput] = useState('');
    const [testLoading, setTestLoading] = useState(false);

    const [scanUrl, setScanUrl] = useState(church.smsSettings?.a2pWebsite || church.website || '');
    const [scanLoading, setScanLoading] = useState(false);
    const [scanResult, setScanResult] = useState<Record<string, string> | null>(null);
    const [scanError, setScanError] = useState('');

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type }); setTimeout(() => setToast(null), 3500);
    };

    const handleScanWebsite = async () => {
        const url = scanUrl.trim();
        if (!url) return;
        setScanLoading(true); setScanResult(null); setScanError('');
        try {
            const res = await fetch('/api/messaging/scan-website', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ url }),
            });
            const data = await res.json();
            if (!res.ok || data.error) {
                setScanError(data.error || 'Scan failed. Please try again.');
            } else {
                setScanResult(data.extracted || {});
            }
        } catch {
            setScanError('Could not reach the server. Please try again.');
        } finally {
            setScanLoading(false);
        }
    };

    const handleApplyScanResult = () => {
        if (!scanResult) return;
        setKb(prev => ({ ...prev, ...scanResult }));
        setScanResult(null);
        showToast('Fields applied ... review and save the knowledge base.');
    };

    useEffect(() => {
        getDoc(doc(firebaseDb, 'smsAgentKnowledge', churchId)).then(snap => {
            if (snap.exists()) setKb(snap.data() as SmsAgentKnowledge);
            setKbLoading(false);
        }).catch(() => setKbLoading(false));
    }, [churchId]);

    useEffect(() => {
        if (isAdmin && church.pcoConnected) {
            setLoadingLists(true);
            pcoService.getPeopleLists(churchId)
                .then(raw => setPcoLists(raw))
                .catch(e => console.error(e))
                .finally(() => setLoadingLists(false));
        }
    }, [isAdmin, church.pcoConnected, churchId]);

    const handleToggleExecAgent = async () => {
        const next = !execAgentEnabled;
        try {
            if (selectedNumber) {
                await fetch(`${API_BASE}/api/messaging/number-settings`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        twilioNumberId: selectedNumber.id,
                        executiveAiAgentEnabled: next
                    })
                });
            } else {
                const churchRef = doc(firebaseDb, 'churches', churchId);
                await updateDoc(churchRef, { 'smsSettings.executiveAiAgentEnabled': next });
                if (onUpdateChurch) onUpdateChurch({ smsSettings: { ...church.smsSettings, executiveAiAgentEnabled: next } });
            }
            showToast(next ? 'Executive AI enabled' : 'Executive AI disabled');
        } catch {
            showToast('Failed to update setting', 'error');
        }
    };

    const handleExecKeywordBlur = async (e: React.FocusEvent<HTMLInputElement>) => {
        const keyword = e.target.value.trim() || 'AI Agent';
        if (keyword === execAgentKeyword) return;
        try {
            if (selectedNumber) {
                await fetch(`${API_BASE}/api/messaging/number-settings`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        twilioNumberId: selectedNumber.id,
                        executiveAiAgentKeyword: keyword
                    })
                });
            } else {
                const churchRef = doc(firebaseDb, 'churches', churchId);
                await updateDoc(churchRef, { 'smsSettings.executiveAiAgentKeyword': keyword });
                if (onUpdateChurch) onUpdateChurch({
                    smsSettings: { ...church.smsSettings, executiveAiAgentKeyword: keyword }
                });
            }
            showToast('Keyword updated');
        } catch {
            showToast('Failed to update keyword', 'error');
        }
    };

    const handleExecListSelect = async (e: React.ChangeEvent<HTMLSelectElement>) => {
        const listId = e.target.value;
        const listName = pcoLists.find(l => l.id === listId)?.attributes.name || '';
        try {
            if (selectedNumber) {
                await fetch(`${API_BASE}/api/messaging/number-settings`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        twilioNumberId: selectedNumber.id,
                        executiveAiAgentListId: listId,
                        executiveAiAgentListName: listName
                    })
                });
            } else {
                const churchRef = doc(firebaseDb, 'churches', churchId);
                await updateDoc(churchRef, {
                    'smsSettings.executiveAiAgentListId': listId,
                    'smsSettings.executiveAiAgentListName': listName
                });
                if (onUpdateChurch) onUpdateChurch({
                    smsSettings: { ...church.smsSettings, executiveAiAgentListId: listId, executiveAiAgentListName: listName }
                });
            }
            showToast('Authorized list saved');
        } catch {
            showToast('Failed to save authorized list', 'error');
        }
    };

    const handleToggleAgent = async () => {
        const next = !agentEnabled;
        try {
            if (selectedNumber) {
                await fetch(`${API_BASE}/api/messaging/number-settings`, {
                    method: 'PATCH',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        twilioNumberId: selectedNumber.id,
                        smsAgentEnabled: next
                    })
                });
            } else {
                const churchRef = doc(firebaseDb, 'churches', churchId);
                await updateDoc(churchRef, { 'smsSettings.smsAgentEnabled': next });
                if (onUpdateChurch) onUpdateChurch({ smsSettings: { ...church.smsSettings, smsAgentEnabled: next } });
            }
            showToast(next ? 'SMS Agent enabled' : 'SMS Agent disabled');
        } catch {
            showToast('Failed to update setting', 'error');
        }
    };

    const handleSaveKb = async () => {
        setSaving(true);
        try {
            await setDoc(doc(firebaseDb, 'smsAgentKnowledge', churchId), {
                id: churchId,
                churchId,
                ...kb,
                updatedAt: Date.now(),
                updatedBy: currentUser.name,
            }, { merge: true });
            setSavedAt(Date.now());
            showToast('Knowledge base saved');
        } catch {
            showToast('Save failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleTestMessage = async () => {
        if (!testInput.trim()) return;
        setTestLoading(true); setTestOutput('');
        try {
            const systemPrompt = `You are a friendly, warm church receptionist for ${church.name}.
Your job is to compose a helpful, natural reply to an incoming SMS from a visitor or member.
Only answer based on the church facts below. If the answer is not in the facts, reply with something like "Let me check on that and get back to you!"
Keep replies under 160 characters when possible (1 SMS segment). Return ONLY the reply text.

CHURCH FACTS:
${kb.address ? `Address: ${kb.address}` : ''}
${kb.serviceTimes ? `Service Times: ${kb.serviceTimes}` : ''}
${kb.pastor ? `Lead Pastor: ${kb.pastor}` : ''}
${kb.ministries ? `Ministries: ${kb.ministries}` : ''}
${kb.classes ? `Classes: ${kb.classes}` : ''}
${kb.locations ? `Locations: ${kb.locations}` : ''}
${kb.website ? `Website: ${kb.website}` : ''}
${kb.phone ? `Phone: ${kb.phone}` : ''}
${kb.customFacts ? `Other Info: ${kb.customFacts}` : ''}

INCOMING MESSAGE:
"${testInput}"

Write the reply:`;
            const { getAuthJsonHeaders } = await import('../../services/authHeaders');
            const res = await fetch('/ai/generate', {
                method: 'POST',
                headers: await getAuthJsonHeaders(),
                body: JSON.stringify({ model: 'gemini-2.5-flash', prompt: systemPrompt }),
            });
            const data = await res.json();
            setTestOutput((data.text || '').trim() || 'No reply generated.');
        } catch {
            setTestOutput('Error: could not reach AI service.');
        } finally {
            setTestLoading(false);
        }
    };

    const field = (
        key: keyof SmsAgentKnowledge,
        label: string,
        placeholder: string,
        multiline = false
    ) => (
        <div>
            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-1.5">{label}</label>
            {multiline ? (
                <textarea
                    rows={3}
                    value={(kb as any)[key] || ''}
                    onChange={e => setKb(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    disabled={!isAdmin}
                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none disabled:opacity-50"
                />
            ) : (
                <input
                    type="text"
                    value={(kb as any)[key] || ''}
                    onChange={e => setKb(prev => ({ ...prev, [key]: e.target.value }))}
                    placeholder={placeholder}
                    disabled={!isAdmin}
                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                />
            )}
        </div>
    );

    return (
        <div className="max-w-3xl mx-auto p-6 space-y-8">
            {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

            <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                    <Sparkles size={18} className="text-indigo-500 dark:text-indigo-400" aria-hidden="true" /> SMS AI agent
                </h2>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    When enabled, the agent analyzes every incoming SMS and suggests a contextual reply for your staff ... drawing from your church knowledge base below.
                </p>
            </div>

            {numbers.length > 0 && (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <p className="font-bold text-slate-900 dark:text-white text-sm">Select Phone Line to Configure</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            SMS Agent and Executive AI settings are number-independent.
                        </p>
                    </div>
                    <select
                        value={selectedNumberId}
                        onChange={e => setSelectedNumberId(e.target.value)}
                        title="Phone Line"
                        className="w-full md:w-64 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        {numbers.map(num => (
                            <option key={num.id} value={num.id}>
                                {num.friendlyLabel} ({num.phoneNumber})
                            </option>
                        ))}
                    </select>
                </div>
            )}

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-bold text-slate-900 dark:text-white text-sm">Agent Status</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {agentEnabled
                                ? 'Active — AI suggestions appear in the SMS inbox for every inbound message.'
                                : 'Off — no AI suggestions will be generated.'}
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${agentEnabled ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                            }`}>{agentEnabled ? 'Active' : 'Off'}</span>
                        {isAdmin && (
                            <button
                                onClick={handleToggleAgent}
                                title={agentEnabled ? 'Disable SMS Agent' : 'Enable SMS Agent'}
                                className={`relative w-14 h-7 rounded-full transition-colors ${agentEnabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'
                                    }`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${agentEnabled ? 'translate-x-7' : 'translate-x-0'
                                    }`} />
                            </button>
                        )}
                    </div>
                </div>
                {agentEnabled && Object.values(kb).filter(v => v && typeof v === 'string' && v.trim()).length === 0 && (
                    <div className="mt-3 flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2">
                        <AlertTriangle size={13} className="shrink-0 mt-0.5" />
                        The agent is active but your knowledge base is empty. Fill in the fields below so it can give helpful, accurate replies.
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-bold text-slate-900 dark:text-white text-sm">Executive AI Auto-Responder</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Allows authorized people to text questions about church data (giving, headcount) and get instant answers.
                        </p>
                    </div>
                    <div className="flex items-center gap-3">
                        <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${execAgentEnabled ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400'
                                : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400'
                            }`}>{execAgentEnabled ? 'Active' : 'Off'}</span>
                        {isAdmin && (
                            <button
                                onClick={handleToggleExecAgent}
                                title={execAgentEnabled ? 'Disable Executive AI' : 'Enable Executive AI'}
                                className={`relative w-14 h-7 rounded-full transition-colors ${execAgentEnabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-600'
                                    }`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${execAgentEnabled ? 'translate-x-7' : 'translate-x-0'
                                    }`} />
                            </button>
                        )}
                    </div>
                </div>

                {execAgentEnabled && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-700 space-y-4">
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                                Activation Keyword
                            </label>
                            <input
                                type="text"
                                defaultValue={execAgentKeyword}
                                onBlur={handleExecKeywordBlur}
                                disabled={!isAdmin}
                                placeholder="e.g. AI Agent"
                                className="w-full max-w-sm text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                            <p className="text-[10px] text-slate-400 mt-1">If the incoming text starts with this phrase, it will route to the Executive AI (e.g. "AI Agent how many people gave today?").</p>
                        </div>
                        <div>
                            <label className="block text-xs font-bold uppercase tracking-wide text-slate-500 mb-2">
                                Authorized PCO List
                            </label>
                        {loadingLists ? (
                            <div className="text-xs text-slate-400 flex items-center gap-2"><Loader2 size={12} className="animate-spin" /> Loading lists from PCO...</div>
                        ) : pcoLists.length === 0 ? (
                            <div className="text-xs text-amber-600">No lists found in Planning Center or PCO is not connected.</div>
                        ) : (
                            <div className="flex items-center gap-3">
                                <select
                                    value={execListId}
                                    onChange={handleExecListSelect}
                                    disabled={!isAdmin}
                                    title="Authorized PCO List"
                                    className="flex-1 max-w-sm text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                >
                                    <option value="">-- Select a PCO List --</option>
                                    {pcoLists.map(list => (
                                        <option key={list.id} value={list.id}>
                                            {list.attributes.name} ({list.attributes.total_people} people)
                                        </option>
                                    ))}
                                </select>
                                {!execListId && (
                                    <span className="text-xs text-rose-500 font-medium">Please select a list to authorize access.</span>
                                )}
                            </div>
                        )}
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-5">
                <div className="flex items-center justify-between">
                    <div>
                        <p className="font-bold text-slate-900 dark:text-white text-sm">Church Knowledge Base</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Everything the agent knows about your church. Be as detailed as you like.
                        </p>
                    </div>
                    {savedAt && (
                        <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle size={11} /> Saved
                        </span>
                    )}
                </div>

                {kbLoading ? (
                    <div className="flex items-center gap-2 text-slate-400 text-sm"><Loader2 size={16} className="animate-spin" /> Loading...</div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {field('address', 'Church Address', '123 Main St, Nashville, TN 37201')}
                        {field('pastor', 'Lead Pastor', 'Pastor John Smith')}
                        {field('serviceTimes', 'Service Times', 'Sundays 9am & 11am, Wednesdays 7pm', true)}
                        {field('locations', 'Campus / Meeting Locations', 'Main campus, East campus...', true)}
                        {field('ministries', 'Ministries Offered', "Youth, Worship, Men's / Women's\u2026", true)}
                        {field('classes', 'Classes & Small Groups', 'Life Groups, Alpha Course, Discipleship 101...', true)}
                        {field('website', 'Website', 'https://www.gracechurch.org')}
                        {field('phone', 'Main Phone', '(615) 555-0100')}
                        <div className="md:col-span-2">
                            {field('customFacts', 'Additional Facts', 'Parking info, childcare details, special events, FAQs...', true)}
                        </div>
                    </div>
                )}

                {isAdmin && !kbLoading && (
                    <button
                        onClick={handleSaveKb}
                        disabled={saving}
                        className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition"
                    >
                        {saving ? <><Loader2 size={14} className="animate-spin" /> Saving...</> : <><CheckCircle size={14} /> Save Knowledge Base</>}
                    </button>
                )}
            </div>

            {isAdmin && (
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
                    <div>
                        <p className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2">
                            <Globe2 size={15} className="text-emerald-500" /> Scan from Website
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            Enter your church website URL and we'll automatically extract service times, location, pastor info, ministries, and more.
                        </p>
                    </div>
                    <div className="flex gap-3">
                        <input
                            type="url"
                            value={scanUrl}
                            onChange={e => setScanUrl(e.target.value)}
                            onKeyDown={e => { if (e.key === 'Enter') handleScanWebsite(); }}
                            placeholder="https://www.gracechurch.org"
                            className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                        />
                        <button
                            onClick={handleScanWebsite}
                            disabled={!scanUrl.trim() || scanLoading}
                            className="flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition"
                        >
                            {scanLoading ? <Loader2 size={14} className="animate-spin" /> : <Globe2 size={14} />}
                            {scanLoading ? 'Scanning...' : 'Scan'}
                        </button>
                    </div>

                    {scanError && (
                        <div className="flex items-start gap-2 text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">
                            <AlertTriangle size={12} className="shrink-0 mt-0.5" /> {scanError}
                        </div>
                    )}

                    {scanResult && (
                        <div className="space-y-3">
                            <div className="flex items-center justify-between">
                                <p className="text-[10px] font-bold uppercase tracking-wide text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                    <CheckCircle size={10} /> Extracted from website
                                </p>
                                <button
                                    onClick={handleApplyScanResult}
                                    className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition"
                                >
                                    <ChevronRight size={11} /> Apply to Knowledge Base
                                </button>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-700 rounded-xl p-4 space-y-2 max-h-64 overflow-y-auto">
                                {Object.entries(scanResult).filter(([, v]) => v && String(v).trim()).map(([key, value]) => (
                                    <div key={key}>
                                        <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{key}</p>
                                        <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">{String(value)}</p>
                                    </div>
                                ))}
                                {Object.values(scanResult).filter(v => v && String(v).trim()).length === 0 && (
                                    <p className="text-xs text-slate-400">No structured data could be extracted from this page. Try the church's About or Contact page instead.</p>
                                )}
                            </div>
                        </div>
                    )}

                    <p className="text-[10px] text-slate-400 dark:text-slate-500">
                        Tip: If the home page has limited info, try scanning the church's About, Contact, or Services page directly.
                    </p>
                </div>
            )}

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5 space-y-4">
                <div>
                    <p className="font-bold text-slate-900 dark:text-white text-sm flex items-center gap-2"><Zap size={15} className="text-amber-500" /> Test a Message</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Type a sample SMS and preview what the agent would reply — no message is sent.
                    </p>
                </div>
                <div className="flex gap-3">
                    <input
                        type="text"
                        value={testInput}
                        onChange={e => setTestInput(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') handleTestMessage(); }}
                        placeholder='e.g. "What time is Sunday service?"'
                        className="flex-1 text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                    <button
                        onClick={handleTestMessage}
                        disabled={!testInput.trim() || testLoading}
                        className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-sm font-bold rounded-xl transition"
                    >
                        {testLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                        Test
                    </button>
                </div>
                {testOutput && (
                    <div className="space-y-2">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-indigo-500">Agent Reply Preview</p>
                        <div className="bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-700 rounded-xl p-4">
                            <p className="text-sm text-indigo-900 dark:text-indigo-100 leading-relaxed">{testOutput}</p>
                            <p className={`text-xs font-bold mt-2 ${testOutput.length > 160 ? 'text-amber-600' : 'text-emerald-600'}`}>
                                {testOutput.length} chars • {Math.ceil(testOutput.length / 160)} segment{Math.ceil(testOutput.length / 160) !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {!isAdmin && (
                <div className="flex items-start gap-2 text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-4 py-3">
                    <AlertTriangle size={13} className="shrink-0 mt-0.5" /> Only Church Administrators can edit the knowledge base and toggle the agent.
                </div>
            )}
        </div>
    );
};
