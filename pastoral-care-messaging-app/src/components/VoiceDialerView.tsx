import React, { useState, useEffect } from 'react';
import {
    Phone, PhoneOff, PhoneIncoming, PhoneOutgoing, PhoneMissed, Delete,
    Search, Loader2, AlertCircle, Volume2, User as UserIcon, Voicemail, Check, BellOff, Settings
} from 'lucide-react';
import { collection, query, where, orderBy, limit, onSnapshot, getDocs, doc, updateDoc } from 'firebase/firestore';
import { auth, db as firebaseDb } from '../services/firebase';
import { useSignalWireVoice } from '../hooks/useSignalWireVoice';
import { VoiceSoftphone } from './VoiceSoftphone';
import { CallingPreferencesPanel } from './CallingPreferencesPanel';
import type { Church, TwilioPhoneNumber, User } from '../types';

interface VoiceCallRecord {
    id: string;
    churchId: string;
    smsNumberId: string;
    direction: 'inbound' | 'outbound';
    from: string;
    to: string;
    status: string;
    durationSec?: number;
    recordingUrl?: string | null;
    createdAt: number;
}

interface PersonMatch {
    id: string;
    name: string;
    phone: string;
}

interface VoiceDialerViewProps {
    churchId: string;
    church: Church;
    activeNumber?: TwilioPhoneNumber | null;
    visibleNumbers: TwilioPhoneNumber[];
    apiBaseUrl: string;
}

const DIALPAD_KEYS: { digit: string; sub?: string }[] = [
    { digit: '1' },
    { digit: '2', sub: 'ABC' },
    { digit: '3', sub: 'DEF' },
    { digit: '4', sub: 'GHI' },
    { digit: '5', sub: 'JKL' },
    { digit: '6', sub: 'MNO' },
    { digit: '7', sub: 'PQRS' },
    { digit: '8', sub: 'TUV' },
    { digit: '9', sub: 'WXYZ' },
    { digit: '*' },
    { digit: '0', sub: '+' },
    { digit: '#' },
];

function formatPhoneDisplay(phone: string): string {
    const d = (phone || '').replace(/\D/g, '');
    if (d.length === 11 && d.startsWith('1')) {
        return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
    }
    if (d.length === 10) {
        return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    }
    return phone;
}

export const VoiceDialerView: React.FC<VoiceDialerViewProps> = ({
    churchId,
    church,
    activeNumber,
    visibleNumbers,
    apiBaseUrl,
}) => {
    const voiceNumbers = visibleNumbers.filter((n: any) => n.voiceEnabled);
    const defaultCallerId = (activeNumber as any)?.voiceEnabled ? activeNumber!.id : (voiceNumbers[0]?.id || activeNumber?.id || '');
    const [selectedNumberId, setSelectedNumberId] = useState<string>(defaultCallerId);
    const [dialInput, setDialInput] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [people, setPeople] = useState<PersonMatch[]>([]);
    const [recentCalls, setRecentCalls] = useState<VoiceCallRecord[]>([]);
    const [voicemails, setVoicemails] = useState<any[]>([]);
    const [currentUserDoc, setCurrentUserDoc] = useState<User | null>(null);
    const [dialError, setDialError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'keypad' | 'recents' | 'voicemails' | 'settings'>('keypad');
    const [vmFilter, setVmFilter] = useState<'all' | 'unread' | 'urgent'>('all');

    useEffect(() => {
        if (defaultCallerId && !selectedNumberId) {
            setSelectedNumberId(defaultCallerId);
        }
    }, [defaultCallerId, selectedNumberId]);

    // Temporarily bypass church.voiceAddOn?.enabled for testing
    const voiceAddonEnabled = true || Boolean((church as any).voiceAddOn?.enabled);
    const voice = useSignalWireVoice({ churchId, voiceAddonEnabled, apiBaseUrl });

    // Load recent calls
    useEffect(() => {
        if (!churchId) return;
        const q = query(
            collection(firebaseDb, 'voiceCalls'),
            where('churchId', '==', churchId),
            orderBy('createdAt', 'desc'),
            limit(25)
        );
        const unsub = onSnapshot(q, (snap) => {
            setRecentCalls(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        }, (err) => {
            console.error('[VoiceDialerView] Failed to load voiceCalls:', err);
        });
        return () => unsub();
    }, [churchId]);

    useEffect(() => {
        const uid = auth.currentUser?.uid;
        if (!uid) return;
        const unsub = onSnapshot(doc(firebaseDb, 'users', uid), (snap) => {
            if (snap.exists()) setCurrentUserDoc({ id: snap.id, ...(snap.data() as any) });
        });
        return () => unsub();
    }, []);

    useEffect(() => {
        const uid = auth.currentUser?.uid;
        if (!churchId || !uid) return;
        const isAdmin = Boolean(
            currentUserDoc?.roles?.includes('Church Admin') ||
            currentUserDoc?.roles?.includes('System Administration')
        );
        const q = isAdmin
            ? query(collection(firebaseDb, 'voiceVoicemails'), where('churchId', '==', churchId), orderBy('createdAt', 'desc'), limit(40))
            : query(collection(firebaseDb, 'voiceVoicemails'), where('churchId', '==', churchId), where('targetUserId', 'in', [uid, null]), orderBy('createdAt', 'desc'), limit(40));
        const unsub = onSnapshot(q, (snap) => {
            setVoicemails(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })));
        }, () => {});
        return () => unsub();
    }, [churchId, currentUserDoc?.roles]);

    // Load church people for quick dial search
    useEffect(() => {
        if (!churchId) return;
        getDocs(query(collection(firebaseDb, 'people'), where('churchId', '==', churchId), limit(500)))
            .then((snap) => {
                const list: PersonMatch[] = [];
                snap.docs.forEach((d) => {
                    const data = d.data() as any;
                    if (data.phone) {
                        list.push({ id: d.id, name: data.name || 'Unnamed', phone: data.phone });
                    }
                });
                setPeople(list);
            })
            .catch(() => {});
    }, [churchId]);

    const matchingPeople = searchQuery.trim().length >= 2
        ? people.filter((p) => {
              const q = searchQuery.toLowerCase();
              return p.name.toLowerCase().includes(q) || p.phone.replace(/\D/g, '').includes(q.replace(/\D/g, ''));
          }).slice(0, 5)
        : [];

    const handleDial = async (targetNumber?: string) => {
        const numToDial = (targetNumber || dialInput).trim();
        if (!numToDial) return;
        if (!selectedNumberId) {
            setDialError('No voice-enabled phone number selected.');
            return;
        }
        setDialError(null);
        try {
            await voice.dial(numToDial, selectedNumberId);
        } catch (err: any) {
            setDialError(err?.message || 'Unable to place call.');
        }
    };

    const selectedNumberObj = visibleNumbers.find((n) => n.id === selectedNumberId);

    return (
        <div className="h-full flex flex-col bg-slate-50 dark:bg-slate-950 overflow-y-auto pb-24">
            <VoiceSoftphone
                activeCall={voice.activeCall}
                incomingCall={voice.incomingCall}
                isSpeakerOn={voice.isSpeakerOn}
                onAnswer={voice.answer}
                onReject={voice.reject}
                onHangup={voice.hangup}
                onToggleMute={voice.toggleMute}
                onToggleSpeaker={voice.toggleSpeaker}
            />

            {/* Top Bar: Caller ID & Connection Status */}
            <div className="px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                    <span className={`w-2.5 h-2.5 rounded-full ${
                        voice.status === 'ready' ? 'bg-emerald-500' :
                        voice.status === 'connecting' ? 'bg-amber-500 animate-pulse' : 'bg-rose-500'
                    }`} />
                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                        {voice.status === 'ready' ? 'Phone Ready' : voice.status === 'connecting' ? 'Connecting...' : 'Offline'}
                    </span>
                </div>

                {voiceNumbers.length > 0 ? (
                    <select
                        value={selectedNumberId}
                        onChange={(e) => setSelectedNumberId(e.target.value)}
                        aria-label="Caller ID Number"
                        className="text-xs font-bold bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-slate-800 dark:text-slate-100"
                    >
                        {voiceNumbers.map((n) => (
                            <option key={n.id} value={n.id}>
                                {n.friendlyLabel ? `${n.friendlyLabel} (${formatPhoneDisplay(n.phoneNumber)})` : formatPhoneDisplay(n.phoneNumber)}
                            </option>
                        ))}
                    </select>
                ) : (
                    <span className="text-[11px] font-semibold text-amber-600 dark:text-amber-400">
                        Enable Voice on a number in Settings
                    </span>
                )}
            </div>

            {/* Sub-tabs: Keypad vs Recents */}
            <div className="px-4 pt-3 flex gap-2 justify-center">
                <button
                    onClick={() => setViewMode('keypad')}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                        viewMode === 'keypad'
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                >
                    Keypad
                </button>
                <button
                    onClick={() => setViewMode('recents')}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition ${
                        viewMode === 'recents'
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                >
                    Recents ({recentCalls.length})
                </button>
                <button
                    onClick={() => setViewMode('voicemails')}
                    className={`px-4 py-1.5 rounded-full text-xs font-bold transition inline-flex items-center gap-1.5 ${
                        viewMode === 'voicemails'
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                >
                    <Voicemail size={13} />
                    Voicemails
                    {voicemails.filter((v) => !v.listenedAt).length > 0 && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-black bg-rose-500 text-white">
                            {voicemails.filter((v) => !v.listenedAt).length}
                        </span>
                    )}
                </button>
                <button
                    onClick={() => setViewMode('settings')}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-bold transition inline-flex items-center gap-1 ${
                        viewMode === 'settings'
                            ? 'bg-violet-600 text-white shadow-sm'
                            : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                    }`}
                    title="Edit Voicemail & Calling Hours"
                >
                    <Settings size={13} />
                    Settings
                </button>
                {currentUserDoc && (
                    <button
                        onClick={async () => {
                            const active = Boolean(currentUserDoc.callingPreferences?.dndOverride?.active);
                            await updateDoc(doc(firebaseDb, 'users', currentUserDoc.id), {
                                'callingPreferences.dndOverride': {
                                    active: !active,
                                    until: null,
                                    reason: !active ? 'Mobile DND' : '',
                                },
                            }).catch(() => {});
                        }}
                        className={`px-3 py-1.5 rounded-full text-xs font-bold transition inline-flex items-center gap-1 ${
                            currentUserDoc.callingPreferences?.dndOverride?.active
                                ? 'bg-rose-600 text-white shadow-sm'
                                : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700'
                        }`}
                        title="Toggle Do Not Disturb"
                    >
                        <BellOff size={13} />
                        {currentUserDoc.callingPreferences?.dndOverride?.active ? 'DND On' : 'DND'}
                    </button>
                )}
            </div>

            {(dialError || voice.error) && (
                <div className="mx-4 mt-3 p-3 rounded-xl bg-rose-50 dark:bg-rose-900/20 border border-rose-200 dark:border-rose-800 text-rose-600 dark:text-rose-400 text-xs font-semibold flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" />
                    <span>{dialError || voice.error}</span>
                </div>
            )}

            {viewMode === 'keypad' ? (
                <div className="flex-1 flex flex-col items-center justify-between max-w-sm w-full mx-auto px-5 py-4 gap-4">
                    {/* Member Search */}
                    <div className="w-full relative">
                        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search member by name or phone..."
                            className="w-full pl-9 pr-3 py-2 text-xs rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-violet-500"
                        />
                        {matchingPeople.length > 0 && (
                            <div className="absolute left-0 right-0 top-full mt-1 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-20 overflow-hidden">
                                {matchingPeople.map((p) => (
                                    <button
                                        key={p.id}
                                        onClick={() => {
                                            setDialInput(p.phone);
                                            setSearchQuery('');
                                        }}
                                        className="w-full px-3 py-2.5 flex items-center justify-between text-left hover:bg-slate-50 dark:hover:bg-slate-800 border-b last:border-b-0 border-slate-100 dark:border-slate-800"
                                    >
                                        <span className="flex items-center gap-2 text-xs font-bold text-slate-800 dark:text-slate-100">
                                            <UserIcon size={13} className="text-violet-500" /> {p.name}
                                        </span>
                                        <span className="text-xs font-mono text-slate-500">{formatPhoneDisplay(p.phone)}</span>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Number Display */}
                    <div className="w-full flex items-center gap-2 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl px-4 py-3">
                        <input
                            type="tel"
                            value={dialInput}
                            onChange={(e) => setDialInput(e.target.value)}
                            placeholder="Enter phone number"
                            className="flex-1 bg-transparent text-center text-2xl font-black tracking-wide text-slate-900 dark:text-white outline-none"
                        />
                        {dialInput && (
                            <button
                                onClick={() => setDialInput((prev) => prev.slice(0, -1))}
                                aria-label="Backspace"
                                className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                            >
                                <Delete size={20} />
                            </button>
                        )}
                    </div>

                    {/* Numeric Dialpad */}
                    <div className="grid grid-cols-3 gap-3 w-full max-w-[280px]">
                        {DIALPAD_KEYS.map(({ digit, sub }) => (
                            <button
                                key={digit}
                                onClick={() => {
                                    if (voice.activeCall) {
                                        voice.sendDtmf(digit).catch(() => {});
                                    }
                                    setDialInput((prev) => prev + digit);
                                }}
                                onContextMenu={(e) => {
                                    if (digit === '0') {
                                        e.preventDefault();
                                        setDialInput((prev) => prev + '+');
                                    }
                                }}
                                className="h-16 rounded-2xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm active:scale-95 transition flex flex-col items-center justify-center"
                            >
                                <span className="text-2xl font-black text-slate-900 dark:text-white leading-none">{digit}</span>
                                {sub && <span className="text-[9px] font-bold tracking-widest text-slate-400 mt-1">{sub}</span>}
                            </button>
                        ))}
                    </div>

                    {/* Call / End Call Button */}
                    {voice.activeCall ? (
                        <button
                            onClick={voice.hangup}
                            className="w-16 h-16 rounded-full bg-rose-600 hover:bg-rose-700 text-white shadow-lg flex items-center justify-center active:scale-95 transition"
                            title="End Call"
                        >
                            <PhoneOff size={26} />
                        </button>
                    ) : (
                        <button
                            onClick={() => handleDial()}
                            disabled={!dialInput.trim() || voice.status !== 'ready' || !(selectedNumberObj as any)?.voiceEnabled}
                            className="w-16 h-16 rounded-full bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white shadow-lg flex items-center justify-center active:scale-95 transition"
                            title="Place Call"
                        >
                            {voice.status === 'connecting' ? <Loader2 size={24} className="animate-spin" /> : <Phone size={26} />}
                        </button>
                    )}
                </div>
            ) : (
                <div className="max-w-xl w-full mx-auto p-4 space-y-2">
                    {recentCalls.length === 0 ? (
                        <div className="text-center py-12 text-xs text-slate-400 font-semibold">
                            No recent calls or voicemails yet.
                        </div>
                    ) : (
                        recentCalls.map((call) => {
                            const isMissed = ['no-answer', 'busy', 'failed'].includes(call.status);
                            const remotePhone = call.direction === 'outbound' ? call.to : call.from;
                            return (
                                <div
                                    key={call.id}
                                    className="p-3.5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 space-y-2"
                                >
                                    <div className="flex items-center justify-between gap-3">
                                        <div className="flex items-center gap-3 min-w-0">
                                            <div className={`w-9 h-9 rounded-full flex items-center justify-center shrink-0 ${
                                                isMissed
                                                    ? 'bg-rose-50 text-rose-500 dark:bg-rose-900/30'
                                                    : call.direction === 'inbound'
                                                    ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/30'
                                                    : 'bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30'
                                            }`}>
                                                {isMissed ? <PhoneMissed size={16} /> : call.direction === 'inbound' ? <PhoneIncoming size={16} /> : <PhoneOutgoing size={16} />}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                                    {formatPhoneDisplay(remotePhone)}
                                                </p>
                                                <p className="text-[11px] text-slate-400">
                                                    {call.direction === 'inbound' ? 'Incoming' : 'Outgoing'} · {call.status}
                                                    {call.durationSec ? ` · ${Math.floor(call.durationSec / 60)}m ${call.durationSec % 60}s` : ''}
                                                    {' · '}
                                                    {new Date(call.createdAt).toLocaleString()}
                                                </p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDial(remotePhone)}
                                            disabled={voice.status !== 'ready' || Boolean(voice.activeCall)}
                                            className="p-2.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 disabled:opacity-40"
                                            title={`Call ${remotePhone}`}
                                        >
                                            <Phone size={16} />
                                        </button>
                                    </div>
                                    {call.recordingUrl && (
                                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center gap-2">
                                            <Volume2 size={14} className="text-violet-500 shrink-0" />
                                            <audio controls src={call.recordingUrl} className="w-full h-8" />
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>
            )}

            {viewMode === 'voicemails' && (
                <div className="max-w-md w-full mx-auto px-4 mt-4 space-y-2.5">
                    <div className="flex gap-1.5">
                        {(['all', 'unread', 'urgent'] as const).map((f) => (
                            <button
                                key={f}
                                onClick={() => setVmFilter(f)}
                                className={`px-3 py-1 rounded-full text-[11px] font-bold capitalize border transition ${
                                    vmFilter === f
                                        ? 'bg-violet-600 text-white border-violet-600'
                                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'
                                }`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                    {voicemails.filter((vm) => (vmFilter === 'unread' ? !vm.listenedAt : vmFilter === 'urgent' ? Boolean(vm.urgent) : true)).length === 0 ? (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-8 text-center">
                            <Voicemail size={28} className="mx-auto text-slate-300 mb-2" />
                            <p className="text-sm font-bold text-slate-600 dark:text-slate-300">No voicemails yet</p>
                        </div>
                    ) : (
                        voicemails
                            .filter((vm) => (vmFilter === 'unread' ? !vm.listenedAt : vmFilter === 'urgent' ? Boolean(vm.urgent) : true))
                            .map((vm) => {
                                const markRead = async () => {
                                    if (vm.listenedAt) return;
                                    const token = await auth.currentUser?.getIdToken();
                                    if (!token) return;
                                    await fetch(`${apiBaseUrl}/api/voice/mark-voicemail-read`, {
                                        method: 'POST',
                                        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
                                        body: JSON.stringify({ voicemailId: vm.id }),
                                    }).catch(() => {});
                                };
                                return (
                            <div
                                key={vm.id}
                                className={`bg-white dark:bg-slate-900 border rounded-2xl p-3.5 space-y-2 ${
                                    vm.urgent ? 'border-rose-300 dark:border-rose-800' : !vm.listenedAt ? 'border-violet-300 dark:border-violet-700' : 'border-slate-200 dark:border-slate-800'
                                }`}
                            >
                                <div className="flex items-center justify-between gap-2">
                                    <div className="min-w-0">
                                        <div className="flex items-center gap-1.5 flex-wrap">
                                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate">
                                                {vm.callerName ? `${vm.callerName} (${formatPhoneDisplay(vm.from)})` : formatPhoneDisplay(vm.from)}
                                            </p>
                                            {!vm.listenedAt && <span className="px-1.5 py-0.5 rounded-full bg-violet-100 text-violet-700 text-[10px] font-black">NEW</span>}
                                            {vm.urgent && <span className="px-1.5 py-0.5 rounded-full bg-rose-100 text-rose-700 text-[10px] font-black">URGENT</span>}
                                        </div>
                                        <p className="text-[11px] text-slate-400">
                                            {vm.durationSec ? `${vm.durationSec}s · ` : ''}
                                            {new Date(vm.createdAt).toLocaleString()}
                                        </p>
                                    </div>
                                    <div className="flex items-center gap-1.5 shrink-0">
                                        {!vm.listenedAt && (
                                            <button
                                                onClick={markRead}
                                                className="px-2 py-1 rounded-xl bg-slate-100 dark:bg-slate-800 text-[11px] font-bold inline-flex items-center gap-1"
                                            >
                                                <Check size={12} /> Listened
                                            </button>
                                        )}
                                        <button
                                            onClick={() => handleDial(vm.from)}
                                            disabled={voice.status !== 'ready' || Boolean(voice.activeCall)}
                                            className="p-2 rounded-xl bg-emerald-50 text-emerald-600 disabled:opacity-40"
                                        >
                                            <Phone size={15} />
                                        </button>
                                    </div>
                                </div>
                                {vm.summary && <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-50 dark:bg-slate-800/70 px-3 py-2 rounded-xl">{vm.summary}</p>}
                                {vm.transcript && <p className="text-xs text-slate-500 dark:text-slate-400">&ldquo;{vm.transcript}&rdquo;</p>}
                                <audio
                                    controls
                                    preload="metadata"
                                    playsInline
                                    onPlay={markRead}
                                    src={vm.recordingUrl}
                                    className="w-full h-8"
                                />
                            </div>
                                );
                            })
                    )}
                </div>
            )}

            {viewMode === 'settings' && (
                <div className="max-w-md w-full mx-auto px-4 mt-4">
                    {currentUserDoc ? (
                        <CallingPreferencesPanel
                            user={currentUserDoc}
                            churchId={churchId}
                            churchTimezone={church.timezone || 'America/Chicago'}
                            apiBaseUrl={apiBaseUrl}
                        />
                    ) : (
                        <div className="p-8 text-center text-xs text-slate-400">
                            <Loader2 className="w-5 h-5 animate-spin mx-auto mb-2" />
                            Loading your voicemail settings...
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
