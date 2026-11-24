import React, { useState } from 'react';
import { db as firebaseDb } from '../../services/firebase';
import { doc, setDoc } from 'firebase/firestore';
import { Church } from '../../types';
import {
    CheckCircle, Loader2, Phone, Search, AlertTriangle,
    MessageCircle, ScrollText, CircleCheck, PartyPopper,
    MapPin, Plug, Smartphone, Megaphone, Rocket, Hash, ArrowLeft, ArrowRight
} from 'lucide-react';
import { formatPhone } from './smsUtils';

const API_BASE = '';

export const SmsTermsModal: React.FC<{
    churchId: string;
    userId: string;
    onAccepted: (ts: number) => void;
    onCancel: () => void;
}> = ({ churchId, userId, onAccepted, onCancel }) => {
    const [checkedTos, setCheckedTos] = useState(false);
    const [checkedPrivacy, setCheckedPrivacy] = useState(false);
    const [checkedCompliance, setCheckedCompliance] = useState(false);
    const [saving, setSaving] = useState(false);
    const allChecked = checkedTos && checkedPrivacy && checkedCompliance;

    const handleAccept = async () => {
        if (!allChecked) return;
        setSaving(true);
        const ts = Date.now();
        try {
            await setDoc(doc(firebaseDb, 'churches', churchId), {
                smsSettings: { termsAcceptedAt: ts, termsAcceptedByUserId: userId }
            }, { merge: true });
        } catch (e: any) {
            console.error('[SmsTermsModal] Firestore write failed (continuing):', e.message);
        } finally {
            setSaving(false);
            onAccepted(ts);
        }
    };

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm" onClick={onCancel}>
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]" onClick={(e) => e.stopPropagation()}>
                <div className="px-7 pt-7 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-start gap-4 shrink-0">
                    <div className="w-12 h-12 rounded-2xl bg-indigo-100 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0"><ScrollText size={22} aria-hidden="true" /></div>
                    <div>
                        <h2 className="text-lg font-black text-slate-900 dark:text-white">SMS Service Terms of Use</h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Please read and accept before activating your church's SMS line.</p>
                    </div>
                </div>
                <div className="overflow-y-auto flex-1 px-7 py-5 space-y-5 text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                    <section>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white mb-2">1. Terms of Service</h3>
                        <p><strong>Permitted Use.</strong> The SMS service may only be used for legitimate pastoral and ministry communications with individuals who have explicitly opted in. Spam or unsolicited messages are prohibited and may result in immediate account suspension.</p>
                        <p className="mt-1"><strong>A2P 10DLC Compliance.</strong> Your church must complete Twilio's brand and campaign registration with accurate information. Submitting false information violates these terms and federal law.</p>
                        <p className="mt-1"><strong>Opt-Out Management.</strong> You must honor all STOP requests immediately and permanently.</p>
                        <p className="mt-1"><strong>Limitation of Liability.</strong> Barnabas Software is not liable for carrier delivery failures or damages beyond amounts paid in the prior 30 days.</p>
                    </section>
                    <div className="border-t border-slate-100 dark:border-slate-800" />
                    <section>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white mb-2">2. Privacy Policy • SMS Data</h3>
                        <p><strong>Data We Collect.</strong> We collect phone numbers, message content, delivery events, opt-out records, and Twilio credentials for your sub-account, solely to deliver messages on your behalf.</p>
                        <p className="mt-1"><strong>Twilio.</strong> Messages route through Twilio, Inc., subject to their Privacy Policy (twilio.com/en-us/legal/privacy).</p>
                        <p className="mt-1"><strong>Your Responsibilities.</strong> You are the data controller for your congregation's contact information and are responsible for consent and applicable privacy law compliance.</p>
                    </section>
                    <div className="border-t border-slate-100 dark:border-slate-800" />
                    <section>
                        <h3 className="text-sm font-black text-slate-900 dark:text-white mb-2">3. A2P Compliance Acknowledgment</h3>
                        <ul className="list-disc list-inside space-y-1 ml-2">
                            <li>I am authorized to register commercial texting on behalf of this church.</li>
                            <li>We only message recipients who have <strong>explicitly opted in</strong> and will honor all STOP requests.</li>
                            <li>We will submit accurate legal info (name, EIN, address) for brand registration.</li>
                            <li>We understand carrier approval may take 1-10 business days.</li>
                        </ul>
                    </section>
                </div>
                <div className="px-7 py-5 bg-slate-50 dark:bg-slate-800/60 border-t border-slate-200 dark:border-slate-700 shrink-0 space-y-3">
                    {([
                        { id: 'tos', checked: checkedTos, setter: setCheckedTos, label: 'I have read and agree to the Terms of Service.' },
                        { id: 'privacy', checked: checkedPrivacy, setter: setCheckedPrivacy, label: 'I have read and agree to the Privacy Policy for SMS data.' },
                        { id: 'compliance', checked: checkedCompliance, setter: setCheckedCompliance, label: 'I confirm I am an authorized representative and acknowledge the A2P 10DLC requirements.' },
                    ] as const).map(item => (
                        <label key={item.id} className="flex items-start gap-3 cursor-pointer select-none group" onClick={() => item.setter(!item.checked)}>
                            <div className={`mt-0.5 w-5 h-5 rounded-md border-2 flex items-center justify-center shrink-0 transition-all ${item.checked ? 'bg-indigo-600 border-indigo-600' : 'border-slate-300 dark:border-slate-600 group-hover:border-indigo-400'}`}>
                                {item.checked && <svg className="w-3 h-3 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>}
                            </div>
                            <span className={`text-xs leading-relaxed ${item.checked ? 'text-slate-800 dark:text-slate-200 font-semibold' : 'text-slate-600 dark:text-slate-400'}`}>{item.label}</span>
                        </label>
                    ))}
                    <div className="flex gap-3 pt-1">
                        <button onClick={onCancel} className="flex-1 py-2.5 text-sm font-bold text-slate-600 dark:text-slate-400 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-700 transition">Cancel</button>
                        <button onClick={handleAccept} disabled={!allChecked || saving} className="flex-1 inline-flex items-center justify-center gap-1.5 py-2.5 text-sm font-black text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl transition shadow-md shadow-indigo-200 dark:shadow-indigo-900/30">
                            {saving ? 'Saving...' : <>I Accept — Continue <ArrowRight size={14} aria-hidden="true" /></>}
                        </button>
                    </div>
                    {!allChecked && <p className="text-[10px] text-slate-400 text-center">Please check all three boxes above to continue.</p>}
                </div>
            </div>
        </div>
    );
};

export const SmsSetupBanner: React.FC<{ onSetup: () => void }> = ({ onSetup }) => (
    <div className="p-6 max-w-2xl mx-auto mt-12">
        <div className="bg-gradient-to-br from-indigo-600 to-purple-700 rounded-3xl p-8 text-white text-center shadow-2xl shadow-indigo-200 dark:shadow-indigo-900/40">
            <div className="w-16 h-16 bg-white/20 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Phone size={32} className="text-white" />
            </div>
            <h2 className="text-2xl font-black mb-2">Set Up SMS Messaging</h2>
            <p className="text-indigo-100 text-sm mb-6 leading-relaxed">
                Get a dedicated local phone number for your church. Send bulk text campaigns to your Planning Center lists and groups, and manage a full 2-way inbox.
            </p>
            <div className="grid grid-cols-3 gap-4 mb-8 text-center">
                {[
                    { Icon: Smartphone, title: 'Local Number', desc: 'Pick an area code' },
                    { Icon: Megaphone, title: 'Bulk Texts', desc: 'Reach entire lists' },
                    { Icon: MessageCircle, title: '2-Way Inbox', desc: 'Real conversations' },
                ].map(f => (
                    <div key={f.title} className="bg-white/10 rounded-2xl p-3">
                        <f.Icon size={24} className="mx-auto mb-1" aria-hidden="true" />
                        <p className="font-bold text-sm">{f.title}</p>
                        <p className="text-indigo-200 text-xs">{f.desc}</p>
                    </div>
                ))}
            </div>
            <button
                onClick={onSetup}
                className="inline-flex items-center gap-2 px-8 py-3 bg-white text-indigo-700 font-black rounded-2xl hover:bg-indigo-50 transition text-sm shadow-lg"
            >
                Get Started <Rocket size={16} aria-hidden="true" />
            </button>
        </div>
    </div>
);

export const SmsSetupWizard: React.FC<{
    churchId: string;
    church: Church;
    onComplete: () => void;
    onBack: () => void;
    mode?: 'setup' | 'add-number';
    termsAcceptedAt?: number;
    currentUserId?: string;
}> = ({ churchId, church, onComplete, onBack, mode = 'setup', termsAcceptedAt, currentUserId }) => {
    const needsTerms = mode === 'setup' && !termsAcceptedAt;
    const [step, setStep] = useState<'terms' | 'search' | 'pick-number' | 'done'>(needsTerms ? 'terms' : 'search');
    const [, setTermsTs] = useState<number | null>(termsAcceptedAt || null);
    const [searchMode, setSearchMode] = useState<'area-code' | 'city-state' | 'ported'>('city-state');
    const [areaCode, setAreaCode] = useState(church.zip?.slice(0, 3) || '');
    const [city, setCity] = useState(church.city || '');
    const [stateAbbr, setStateAbbr] = useState(church.state || '');
    const [portedNumber, setPortedNumber] = useState('');
    const [numbers, setNumbers] = useState<{ phoneNumber: string; friendlyName: string; locality: string; region: string }[]>([]);
    const [resolvedSearch, setResolvedSearch] = useState('');
    const [canExpand, setCanExpand] = useState(false);
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 10;
    const [loadingNums, setLoadingNums] = useState(false);
    const [selectedNumber, setSelectedNumber] = useState('');
    const [senderName, setSenderName] = useState(church.name || '');
    const [friendlyLabel, setFriendlyLabel] = useState('');
    const [provisioning, setProvisioning] = useState(false);
    const [error, setError] = useState('');

    const US_STATES = [
        ['AL', 'Alabama'], ['AK', 'Alaska'], ['AZ', 'Arizona'], ['AR', 'Arkansas'], ['CA', 'California'],
        ['CO', 'Colorado'], ['CT', 'Connecticut'], ['DE', 'Delaware'], ['FL', 'Florida'], ['GA', 'Georgia'],
        ['HI', 'Hawaii'], ['ID', 'Idaho'], ['IL', 'Illinois'], ['IN', 'Indiana'], ['IA', 'Iowa'],
        ['KS', 'Kansas'], ['KY', 'Kentucky'], ['LA', 'Louisiana'], ['ME', 'Maine'], ['MD', 'Maryland'],
        ['MA', 'Massachusetts'], ['MI', 'Michigan'], ['MN', 'Minnesota'], ['MS', 'Mississippi'], ['MO', 'Missouri'],
        ['MT', 'Montana'], ['NE', 'Nebraska'], ['NV', 'Nevada'], ['NH', 'New Hampshire'], ['NJ', 'New Jersey'],
        ['NM', 'New Mexico'], ['NY', 'New York'], ['NC', 'North Carolina'], ['ND', 'North Dakota'], ['OH', 'Ohio'],
        ['OK', 'Oklahoma'], ['OR', 'Oregon'], ['PA', 'Pennsylvania'], ['RI', 'Rhode Island'], ['SC', 'South Carolina'],
        ['SD', 'South Dakota'], ['TN', 'Tennessee'], ['TX', 'Texas'], ['UT', 'Utah'], ['VT', 'Vermont'],
        ['VA', 'Virginia'], ['WA', 'Washington'], ['WV', 'West Virginia'], ['WI', 'Wisconsin'], ['WY', 'Wyoming'],
    ];

    const fetchNumbers = async (expandToState = false) => {
        setError('');
        setLoadingNums(true);
        try {
            if (searchMode === 'ported') {
                const rawNum = portedNumber.trim();
                let cleanNum = rawNum.replace(/[^\d+]/g, '');
                if (cleanNum.length === 10) {
                    cleanNum = `+1${cleanNum}`;
                } else if (cleanNum.length === 11 && cleanNum.startsWith('1')) {
                    cleanNum = `+${cleanNum}`;
                } else if (!cleanNum.startsWith('+')) {
                    cleanNum = `+${cleanNum}`;
                }
                if (!cleanNum.match(/^\+[1-9]\d{10,14}$/)) {
                    throw new Error('Please enter a valid phone number in E.164 format (e.g. +16155550100).');
                }
                setNumbers([{
                    phoneNumber: cleanNum,
                    friendlyName: formatPhone(cleanNum),
                    locality: 'Ported Number',
                    region: 'SignalWire'
                }]);
                setSelectedNumber(cleanNum);
                setResolvedSearch(cleanNum);
                setPage(0);
                setStep('pick-number');
                return;
            }

            let url = `${API_BASE}/api/messaging/available-numbers?churchId=${encodeURIComponent(churchId)}`;

            if (searchMode === 'area-code') {
                if (!areaCode || areaCode.length < 3) { setError('Please enter a 3-digit area code.'); setLoadingNums(false); return; }
                url += `&areaCode=${encodeURIComponent(areaCode)}`;
            } else {
                if (!stateAbbr) { setError('Please select a state.'); setLoadingNums(false); return; }
                if (!expandToState && city.trim()) url += `&city=${encodeURIComponent(city.trim())}`;
                url += `&state=${encodeURIComponent(stateAbbr)}`;
            }

            const res = await fetch(url);
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
            const endpoint = mode === 'add-number'
                ? `${API_BASE}/api/messaging/add-number`
                : `${API_BASE}/api/messaging/provision`;

            const body: any = { churchId, phoneNumber: selectedNumber, senderName };
            if (mode === 'add-number' && friendlyLabel) body.friendlyLabel = friendlyLabel;

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body),
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
        : searchMode === 'ported'
            ? !!portedNumber.trim()
            : !!stateAbbr;

    return (
        <div className="p-6 max-w-xl mx-auto mt-8">
            <button onClick={onBack} className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 mb-6">
                <ArrowLeft size={14} /> Back
            </button>

            {step === 'terms' && (
                <SmsTermsModal
                    churchId={churchId}
                    userId={currentUserId || ''}
                    onAccepted={(ts) => { setTermsTs(ts); setStep('search'); }}
                    onCancel={onBack}
                />
            )}

            {step !== 'terms' && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-700 p-8 shadow-sm">
                    {mode === 'setup' && (
                        <div className="flex items-center gap-2 mb-6">
                            {(['search', 'pick-number', 'done'] as const).map((s, i) => (
                                <React.Fragment key={s}>
                                    <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-black transition-all ${step === s ? 'bg-indigo-600 text-white' :
                                            ['pick-number', 'done'].indexOf(step) > ['pick-number', 'done'].indexOf(s) || (s === 'search' && step !== 'search')
                                                 ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                                        }`}>
                                        {i + 1}
                                    </div>
                                    {i < 2 && <div className="flex-1 h-0.5 bg-slate-200 dark:bg-slate-700 rounded-full" />}
                                </React.Fragment>
                            ))}
                        </div>
                    )}
                    {step === 'search' && (
                        <>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white mb-1">Find a Local Number</h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-5">Search by city &amp; state, or enter an area code directly.</p>

                            <div className="flex rounded-xl overflow-hidden border border-slate-200 dark:border-slate-700 mb-5">
                                {(['city-state', 'area-code', 'ported'] as const).map(m => (
                                    <button
                                        key={m}
                                        onClick={() => { setSearchMode(m); setError(''); }}
                                        className={`flex-1 inline-flex items-center justify-center gap-1 py-2 text-xs font-black uppercase tracking-wide transition ${searchMode === m
                                                ? 'bg-indigo-600 text-white'
                                                : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-700'
                                            }`}
                                    >
                                        {m === 'city-state' ? <><MapPin size={12} aria-hidden="true" /> City &amp; State</> : m === 'area-code' ? <><Hash size={12} aria-hidden="true" /> Area Code</> : <><Plug size={12} aria-hidden="true" /> Ported Number</>}
                                    </button>
                                ))}
                            </div>

                            {searchMode === 'city-state' && (
                                <div className="space-y-3">
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">City <span className="font-normal normal-case">(optional)</span></label>
                                        <input
                                            type="text"
                                            value={city}
                                            onChange={e => setCity(e.target.value)}
                                            onKeyDown={e => e.key === 'Enter' && canSearch && fetchNumbers()}
                                            placeholder="e.g. Nashville"
                                            className="w-full text-base font-semibold border-2 border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                                        />
                                        <p className="text-[10px] text-slate-400 mt-1">Leave blank to search across the whole state.</p>
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">State <span className="text-red-400">*</span></label>
                                        <select
                                            value={stateAbbr}
                                            onChange={e => setStateAbbr(e.target.value)}
                                            title="State"
                                            className="w-full text-base border-2 border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 appearance-none"
                                        >
                                            <option value="">Select a state...</option>
                                            {US_STATES.map(([abbr, name]) => (
                                                <option key={abbr} value={abbr}>{name} ({abbr})</option>
                                            ))}
                                        </select>
                                    </div>
                                </div>
                            )}

                            {searchMode === 'area-code' && (
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Area Code (3 digits)</label>
                                    <input
                                        type="text"
                                        maxLength={3}
                                        value={areaCode}
                                        onChange={e => setAreaCode(e.target.value.replace(/\D/g, ''))}
                                        onKeyDown={e => e.key === 'Enter' && canSearch && fetchNumbers()}
                                        placeholder="e.g. 615"
                                        className="w-full text-2xl font-black border-2 border-slate-200 dark:border-slate-600 rounded-2xl px-5 py-4 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500 tracking-wide"
                                    />
                                </div>
                            )}

                            {searchMode === 'ported' && (
                                <div>
                                    <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1.5">Ported Phone Number</label>
                                    <input
                                        type="tel"
                                        value={portedNumber}
                                        onChange={e => setPortedNumber(e.target.value)}
                                        onKeyDown={e => e.key === 'Enter' && canSearch && fetchNumbers()}
                                        placeholder="e.g. +1 (615) 555-0100"
                                        className="w-full text-base font-semibold border-2 border-slate-200 dark:border-slate-600 rounded-2xl px-4 py-3 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:border-indigo-500"
                                    />
                                    <p className="text-[10px] text-slate-400 mt-1">Enter the phone number that was ported into SignalWire.</p>
                                </div>
                            )}

                            {error && <p className="text-sm text-red-500 mt-3">{error}</p>}

                            <button
                                onClick={() => fetchNumbers()}
                                disabled={loadingNums || !canSearch}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black rounded-2xl transition mt-5 flex items-center justify-center gap-2"
                            >
                                {loadingNums ? <><Loader2 size={16} className="animate-spin" /> Searching...</> :
                                 searchMode === 'ported' ? <>Verify Ported Number <ArrowRight size={16} aria-hidden="true" /></> : <>Find Available Numbers <Search size={16} aria-hidden="true" /></>}
                            </button>
                        </>
                    )}

                    {step === 'pick-number' && (() => {
                        const totalPages = Math.ceil(numbers.length / PAGE_SIZE);
                        const pageNumbers = numbers.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

                        return (
                            <>
                                <div className="flex items-start justify-between gap-2 mb-1">
                                    <h2 className="text-xl font-black text-slate-900 dark:text-white">Pick a Number</h2>
                                    {numbers.length > 0 && (
                                        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded-full shrink-0">
                                            {numbers.length} found
                                        </span>
                                    )}
                                </div>

                                <p className="text-sm text-slate-500 dark:text-slate-400 mb-2">
                                    {numbers.length > 0
                                        ? <>Numbers for <span className="font-semibold text-indigo-600 dark:text-indigo-400">{resolvedSearch}</span>.</>
                                        : <>No numbers found for <span className="font-semibold text-indigo-600 dark:text-indigo-400">{resolvedSearch}</span>.</>
                                    }
                                </p>

                                {numbers.length > 0 && city && resolvedSearch.includes('(any state)') && (
                                    <p className="flex items-start gap-1.5 text-xs text-amber-600 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl px-3 py-2 mb-3">
                                        <AlertTriangle size={13} className="shrink-0 mt-px" aria-hidden="true" /><span>No numbers found in <strong>{city}, {stateAbbr}</strong> — showing numbers for <strong>{city}</strong> in another state instead.</span>
                                    </p>
                                )}

                                {canExpand && (
                                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-2xl p-4 mb-4 text-center">
                                        <p className="text-sm text-amber-700 dark:text-amber-400 font-semibold mb-1">No local numbers found for "{city}"</p>
                                        <p className="text-xs text-amber-600 dark:text-amber-500 mb-3">Twilio doesn't have numbers available in that specific city. Would you like to search across all of {stateAbbr}?</p>
                                        <button
                                            onClick={() => fetchNumbers(true)}
                                            disabled={loadingNums}
                                            className="px-5 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-black rounded-xl transition flex items-center gap-2 mx-auto"
                                        >
                                            {loadingNums ? <><Loader2 size={12} className="animate-spin" /> Searching...</> : <>Search all of {stateAbbr} <Search size={12} aria-hidden="true" /></>}
                                        </button>
                                    </div>
                                )}

                                {numbers.length > 0 && (
                                    <div className="space-y-2 mb-3">
                                        {pageNumbers.map(n => {
                                            const cityState = [n.locality, n.region].filter(Boolean).join(', ');
                                            return (
                                                <label
                                                    key={n.phoneNumber}
                                                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 cursor-pointer transition ${selectedNumber === n.phoneNumber ? 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20' : 'border-slate-200 dark:border-slate-700 hover:border-indigo-300 dark:hover:border-indigo-600'}`}
                                                >
                                                    <input type="radio" name="number" value={n.phoneNumber} checked={selectedNumber === n.phoneNumber} onChange={() => setSelectedNumber(n.phoneNumber)} className="accent-indigo-600 mt-0.5 shrink-0" />
                                                    <div className="flex-1 min-w-0">
                                                        <p className="font-black text-lg text-slate-900 dark:text-white tracking-wide">{n.friendlyName}</p>
                                                        <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-semibold">
                                                            <MapPin size={11} aria-hidden="true" /> {cityState || `Area code ${areaCode}`}
                                                        </span>
                                                    </div>
                                                    {selectedNumber === n.phoneNumber && (
                                                        <CheckCircle size={18} className="text-indigo-600 shrink-0" />
                                                    )}
                                                </label>
                                            );
                                        })}
                                    </div>
                                )}

                                {totalPages > 1 && (
                                    <div className="flex items-center justify-between mb-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl px-3 py-2">
                                        <button
                                            onClick={() => { setPage(p => Math.max(0, p - 1)); setSelectedNumber(''); }}
                                            disabled={page === 0}
                                            className="flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 transition"
                                        >
                                            ⬅️ Prev
                                        </button>
                                        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                                            Page {page + 1} of {totalPages}
                                            <span className="text-slate-400 dark:text-slate-500 ml-1">({numbers.length} total)</span>
                                        </span>
                                        <button
                                            onClick={() => { setPage(p => Math.min(totalPages - 1, p + 1)); setSelectedNumber(''); }}
                                            disabled={page >= totalPages - 1}
                                            className="flex items-center gap-1 text-xs font-bold text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 disabled:opacity-30 transition"
                                        >
                                            Next <ArrowRight size={12} aria-hidden="true" />
                                        </button>
                                    </div>
                                )}

                                {numbers.length > 0 && (
                                    <>
                                        {(mode === 'add-number' || searchMode === 'ported') && (
                                            <>
                                                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Inbox Label (e.g. "Youth Line")</label>
                                                <input
                                                    type="text"
                                                    value={friendlyLabel}
                                                    onChange={e => setFriendlyLabel(e.target.value)}
                                                    className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
                                                    placeholder="Youth Ministry"
                                                />
                                            </>
                                        )}
                                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">Sender Name (shown in message headers)</label>
                                        <input
                                            type="text"
                                            value={senderName}
                                            onChange={e => setSenderName(e.target.value)}
                                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 mb-4"
                                            placeholder="Grace Community Church"
                                        />
                                    </>
                                )}

                                {error && <p className="text-sm text-red-500 mb-3">{error}</p>}

                                <div className="flex gap-2">
                                    <button onClick={() => setStep('search')} className="flex-1 py-2.5 text-sm font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 rounded-xl hover:bg-slate-200 transition"><span className="inline-flex items-center justify-center gap-1.5"><Search size={14} aria-hidden="true" /> Search Again</span></button>
                                    {numbers.length > 0 && (
                                        <button
                                            onClick={provision}
                                            disabled={provisioning || !selectedNumber}
                                            className="flex-1 py-2.5 text-sm font-black bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white rounded-xl transition flex items-center justify-center gap-2"
                                        >
                                            {provisioning ? <><Loader2 size={14} className="animate-spin" />Provisioning...</> : <>Claim Number <CircleCheck size={14} aria-hidden="true" /></>}
                                        </button>
                                    )}
                                </div>
                            </>
                        );
                    })()}

                    {step === 'done' && (
                        <div className="text-center py-4">
                            <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                                <CheckCircle size={32} className="text-emerald-600 dark:text-emerald-400" />
                            </div>
                            <h2 className="inline-flex items-center gap-2 text-xl font-black text-slate-900 dark:text-white mb-2">You're all set! <PartyPopper size={20} className="text-indigo-500 dark:text-indigo-400" aria-hidden="true" /></h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mb-6">
                                Your church phone number has been provisioned. You can now send text campaigns and receive replies in your inbox.
                            </p>
                            <div className="text-xs text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-3 mb-6 text-left">
                                <strong>Next step:</strong> For high-volume sending (more than 200 msgs/day), complete A2P 10DLC brand registration in your Twilio Console to avoid carrier filtering.
                            </div>
                            <button onClick={onComplete} className="inline-flex items-center gap-2 px-8 py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-2xl transition">
                                Start Messaging <MessageCircle size={16} aria-hidden="true" />
                            </button>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
