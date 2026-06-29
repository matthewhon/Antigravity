import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { OutreachSession, OutreachSlot } from '../types';
import { firestore } from '../services/firestoreService';
import {
    Phone, Mail, CheckCircle2, PhoneOff, ArrowRight, LogOut,
    Loader2, Heart, Users, ChevronRight, Award, TrendingUp, MessageSquare,
    Search, Edit3, Send, Clock as ClockIcon
} from 'lucide-react';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = (sessionId: string) => `outreach_volunteer_phone_${sessionId}`;

const formatPhone = (raw: string): string => {
    const d = raw.replace(/\D/g, '');
    if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
    if (d.length === 11 && d[0] === '1') return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
    return raw;
};

const normalizePhone = (raw: string) => raw.replace(/\D/g, '');

// ─── Shell (shared chrome for public pages) ───────────────────────────────────

const Shell: React.FC<{
    children: React.ReactNode;
    churchName?: string;
    sessionName?: string;
    onEnd?: () => void;
}> = ({ children, churchName, sessionName, onEnd }) => (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30 font-sans">
        <header className="bg-white border-b border-slate-100 shadow-sm px-6 py-4">
            <div className="max-w-lg mx-auto flex items-center justify-between">
                <div className="flex items-center gap-3">
                    <div className="w-9 h-9 rounded-[12px] bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-200">
                        <Heart size={18} fill="white" className="text-white" />
                    </div>
                    <div>
                        {churchName && <p className="text-sm font-black text-slate-900 leading-tight">{churchName}</p>}
                        {sessionName && <p className="text-[10px] text-indigo-500 font-black uppercase tracking-widest">{sessionName}</p>}
                    </div>
                </div>
                {onEnd && (
                    <button
                        onClick={onEnd}
                        className="flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400 hover:text-rose-500 transition-colors px-3 py-2 rounded-xl hover:bg-rose-50"
                    >
                        <LogOut size={13} /> End Session
                    </button>
                )}
            </div>
        </header>
        <main className="px-4 py-10 flex justify-center">
            <div className="w-full max-w-lg">
                {children}
            </div>
        </main>
        <footer className="text-center text-[11px] text-slate-400 pb-8">
            Powered by <span className="font-bold text-slate-500">Barnabas</span>
        </footer>
    </div>
);

// ─── Loading State ─────────────────────────────────────────────────────────────

const LoadingCard: React.FC<{ message?: string }> = ({ message = 'Loading…' }) => (
    <div className="text-center py-16">
        <Loader2 size={32} className="mx-auto text-indigo-400 animate-spin mb-4" />
        <p className="text-sm text-slate-400 font-medium">{message}</p>
    </div>
);

// ─── Step 1: Phone Entry ───────────────────────────────────────────────────────

const PhoneStep: React.FC<{ sessionName: string; onSubmit: (phone: string) => void; isLoading: boolean }> = ({
    sessionName, onSubmit, isLoading
}) => {
    const [phone, setPhone] = useState('');
    const inputRef = useRef<HTMLInputElement>(null);

    useEffect(() => { inputRef.current?.focus(); }, []);

    const handleSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        const normalized = normalizePhone(phone);
        if (normalized.length < 10) return;
        onSubmit(normalized);
    };

    return (
        <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/50 border border-slate-100 p-8">
            <div className="text-center mb-8">
                <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
                    <Phone size={28} className="text-white" />
                </div>
                <h1 className="text-2xl font-black text-slate-900 mb-2">Welcome!</h1>
                <p className="text-sm text-slate-500">
                    You're helping with <span className="font-bold text-slate-700">{sessionName}</span>.
                    Enter your phone number to get started — it tracks who made each contact.
                </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">
                        Your Cell Phone Number
                    </label>
                    <input
                        ref={inputRef}
                        type="tel"
                        inputMode="tel"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        placeholder="(555) 000-0000"
                        className="w-full text-2xl font-black text-slate-900 tracking-widest text-center bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 rounded-2xl px-4 py-4 outline-none transition-colors placeholder:text-slate-300 placeholder:font-normal placeholder:text-xl"
                    />
                    <p className="text-[10px] text-slate-400 text-center mt-2 font-medium">
                        Your number is only visible to the session coordinator.
                    </p>
                </div>

                <button
                    type="submit"
                    disabled={normalizePhone(phone).length < 10 || isLoading}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
                >
                    {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ChevronRight size={18} />}
                    {isLoading ? 'Finding your assignment…' : 'Get My Assignment'}
                </button>
            </form>
        </div>
    );
};

// ─── Step 2: Assigning Animation ──────────────────────────────────────────────

const AssigningCard: React.FC = () => (
    <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-12 text-center">
        <div className="flex justify-center gap-1 mb-6">
            {[0, 1, 2].map(i => (
                <div
                    key={i}
                    className="w-3 h-3 rounded-full bg-indigo-500"
                    style={{ animation: `bounce 1.2s ease-in-out ${i * 0.2}s infinite` }}
                />
            ))}
        </div>
        <p className="text-lg font-black text-slate-900 mb-2">Finding your next person…</p>
        <p className="text-sm text-slate-400">We're assigning someone from the list just for you.</p>
        <style>{`
            @keyframes bounce {
                0%, 80%, 100% { transform: translateY(0); opacity: 0.5; }
                40% { transform: translateY(-12px); opacity: 1; }
            }
        `}</style>
    </div>
);

// ─── Step 3: Contact Card ─────────────────────────────────────────────────────

type Outcome = 'contacted' | 'no-answer';

interface ContactCardProps {
    slot: OutreachSlot;
    onComplete: (outcome: Outcome, notes: string) => void;
}

const ContactCard: React.FC<ContactCardProps> = ({ slot, onComplete }) => {
    const [notes, setNotes] = useState('');
    const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
    const [confirmed, setConfirmed] = useState(false);

    // Reset internal state when the slot changes (next person in batch)
    useEffect(() => {
        setNotes('');
        setSelectedOutcome(null);
        setConfirmed(false);
    }, [slot.id]);

    const handleConfirm = () => {
        if (!selectedOutcome || confirmed) return;
        setConfirmed(true); // disable button immediately
        onComplete(selectedOutcome, notes);
        // Parent advances instantly; React will unmount this or swap slot.id
    };

    return (
        <div className="space-y-4">
            {/* Contact Person Card */}
            <div className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden">
                {/* Top stripe */}
                <div className="h-2 bg-gradient-to-r from-indigo-500 to-violet-500" />

                <div className="p-8">
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-400 mb-3">Your Contact</p>

                    {/* Avatar & Name */}
                    <div className="flex items-center gap-4 mb-6">
                        <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-indigo-400 to-violet-500 flex items-center justify-center text-white font-black text-2xl shadow-lg shadow-indigo-200">
                            {slot.assignedPersonName.slice(0, 1).toUpperCase()}
                        </div>
                        <div>
                            <h2 className="text-2xl font-black text-slate-900 leading-tight">{slot.assignedPersonName}</h2>
                            <p className="text-[11px] text-slate-400 font-medium mt-0.5">Reach out and check in on them</p>
                        </div>
                    </div>

                    {/* Contact Links */}
                    <div className="space-y-2 mb-6">
                        {slot.assignedPersonPhone ? (
                            <a
                                href={`tel:${slot.assignedPersonPhone}`}
                                className="flex items-center gap-3 bg-emerald-50 hover:bg-emerald-100 border border-emerald-100 rounded-2xl px-5 py-4 transition-all group"
                            >
                                <div className="w-10 h-10 rounded-xl bg-emerald-500 flex items-center justify-center shadow-md shadow-emerald-200 group-hover:scale-110 transition-transform">
                                    <Phone size={18} className="text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-0.5">Call</p>
                                    <p className="text-base font-black text-slate-900 tracking-wide">{formatPhone(slot.assignedPersonPhone)}</p>
                                </div>
                                <ArrowRight size={16} className="text-emerald-400 group-hover:translate-x-1 transition-transform" />
                            </a>
                        ) : (
                            <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4">
                                <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center">
                                    <Phone size={18} className="text-slate-400" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Call</p>
                                    <p className="text-sm font-bold text-slate-400">No phone on file</p>
                                </div>
                            </div>
                        )}

                        {/* Text / SMS */}
                        {slot.assignedPersonPhone && (
                            <a
                                href={`sms:${slot.assignedPersonPhone.replace(/\D/g, '').replace(/^(\d{10})$/, '+1$1')}`}
                                className="flex items-center gap-3 bg-violet-50 hover:bg-violet-100 border border-violet-100 rounded-2xl px-5 py-4 transition-all group"
                            >
                                <div className="w-10 h-10 rounded-xl bg-violet-500 flex items-center justify-center shadow-md shadow-violet-200 group-hover:scale-110 transition-transform">
                                    <MessageSquare size={18} className="text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-violet-600 mb-0.5">Text</p>
                                    <p className="text-base font-black text-slate-900 tracking-wide">{formatPhone(slot.assignedPersonPhone)}</p>
                                </div>
                                <ArrowRight size={16} className="text-violet-400 group-hover:translate-x-1 transition-transform" />
                            </a>
                        )}

                        {slot.assignedPersonEmail ? (
                            <a
                                href={`mailto:${slot.assignedPersonEmail}`}
                                className="flex items-center gap-3 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-2xl px-5 py-4 transition-all group"
                            >
                                <div className="w-10 h-10 rounded-xl bg-indigo-500 flex items-center justify-center shadow-md shadow-indigo-200 group-hover:scale-110 transition-transform">
                                    <Mail size={18} className="text-white" />
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-0.5">Email</p>
                                    <p className="text-sm font-black text-slate-900 truncate">{slot.assignedPersonEmail}</p>
                                </div>
                                <ArrowRight size={16} className="text-indigo-400 group-hover:translate-x-1 transition-transform" />
                            </a>
                        ) : (
                            <div className="flex items-center gap-3 bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4">
                                <div className="w-10 h-10 rounded-xl bg-slate-200 flex items-center justify-center">
                                    <Mail size={18} className="text-slate-400" />
                                </div>
                                <div>
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Email</p>
                                    <p className="text-sm font-bold text-slate-400">No email on file</p>
                                </div>
                            </div>
                        )}
                    </div>

                    {/* Notes */}
                    <div>
                        <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 block mb-2">
                            Notes <span className="font-medium text-slate-300">(Optional)</span>
                        </label>
                        <textarea
                            value={notes}
                            onChange={e => setNotes(e.target.value)}
                            placeholder="Add any notes about your conversation…"
                            rows={3}
                            className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-400 rounded-2xl px-4 py-3 text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-100 resize-none transition-colors"
                        />
                    </div>
                </div>
            </div>

            {/* Outcome Selection */}
            <div className="space-y-2">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 px-1">What happened?</p>

                <button
                    onClick={() => setSelectedOutcome(selectedOutcome === 'contacted' ? null : 'contacted')}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                        selectedOutcome === 'contacted'
                            ? 'bg-emerald-50 border-emerald-400 shadow-md shadow-emerald-100'
                            : 'bg-white border-slate-200 hover:border-emerald-200'
                    }`}
                >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                        selectedOutcome === 'contacted' ? 'bg-emerald-500 shadow-lg shadow-emerald-200' : 'bg-slate-100'
                    }`}>
                        <CheckCircle2 size={22} className={selectedOutcome === 'contacted' ? 'text-white' : 'text-slate-400'} />
                    </div>
                    <div className="text-left">
                        <p className={`text-sm font-black transition-colors ${selectedOutcome === 'contacted' ? 'text-emerald-700' : 'text-slate-700'}`}>
                            ✅ I Reached Them
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium">Successfully made contact</p>
                    </div>
                </button>

                <button
                    onClick={() => setSelectedOutcome(selectedOutcome === 'no-answer' ? null : 'no-answer')}
                    className={`w-full flex items-center gap-4 p-4 rounded-2xl border-2 transition-all ${
                        selectedOutcome === 'no-answer'
                            ? 'bg-rose-50 border-rose-400 shadow-md shadow-rose-100'
                            : 'bg-white border-slate-200 hover:border-rose-200'
                    }`}
                >
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-all ${
                        selectedOutcome === 'no-answer' ? 'bg-rose-500 shadow-lg shadow-rose-200' : 'bg-slate-100'
                    }`}>
                        <PhoneOff size={22} className={selectedOutcome === 'no-answer' ? 'text-white' : 'text-slate-400'} />
                    </div>
                    <div className="text-left">
                        <p className={`text-sm font-black transition-colors ${selectedOutcome === 'no-answer' ? 'text-rose-700' : 'text-slate-700'}`}>
                            📵 Couldn't Reach Them
                        </p>
                        <p className="text-[11px] text-slate-400 font-medium">No answer — they'll be re-queued in 24 hours</p>
                    </div>
                </button>
            </div>

            {/* Confirm Button */}
            {selectedOutcome && (
                <button
                    onClick={handleConfirm}
                    disabled={confirmed}
                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${
                        selectedOutcome === 'contacted'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
                            : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200'
                    } disabled:opacity-60`}
                >
                    {confirmed
                        ? <><Loader2 size={16} className="animate-spin" /> Loading next…</>
                        : (selectedOutcome === 'contacted' ? '✅ Mark as Reached' : '📵 Mark as No Answer')
                    }
                </button>
            )}
        </div>
    );
};

// ─── Live Stats Strip ─────────────────────────────────────────────────────────

const StatsStrip: React.FC<{
    myContacted: number;
    myNoAnswer: number;
    sessionContacted: number;
    sessionTotal: number;
}> = ({ myContacted, myNoAnswer, sessionContacted, sessionTotal }) => (
    <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4 mb-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
            <div className="text-center">
                <p className="text-2xl font-black text-emerald-600">{myContacted}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Reached</p>
            </div>
            <div className="w-px h-8 bg-slate-100" />
            <div className="text-center">
                <p className="text-2xl font-black text-rose-500">{myNoAnswer}</p>
                <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">No Answer</p>
            </div>
        </div>
        {sessionTotal > 0 && (
            <div className="flex-1 max-w-[140px]">
                <div className="flex items-center justify-between mb-1">
                    <p className="text-[9px] font-black uppercase tracking-widest text-slate-400">Session</p>
                    <p className="text-[9px] font-black text-indigo-600">{Math.round(sessionContacted / sessionTotal * 100)}%</p>
                </div>
                <div className="bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                        className="bg-indigo-500 h-1.5 rounded-full transition-all duration-700"
                        style={{ width: `${Math.min(100, Math.round(sessionContacted / sessionTotal * 100))}%` }}
                    />
                </div>
                <p className="text-[9px] text-slate-400 mt-1 text-right">{sessionContacted}/{sessionTotal} attempted</p>
            </div>
        )}
    </div>
);

// ─── All Done Card ────────────────────────────────────────────────────────────

interface AllDoneCardProps {
    sessionName: string;
    myContacted: number;
    myNoAnswer: number;
    sessionContacted: number;
    sessionNoAnswer: number;
    sessionTotal: number;
    reason: 'exhausted' | 'ended';
}

const AllDoneCard: React.FC<AllDoneCardProps> = ({
    sessionName, myContacted, myNoAnswer,
    sessionContacted, sessionNoAnswer, sessionTotal, reason
}) => {
    const myTotal = myContacted + myNoAnswer;
    const sessionAttempted = sessionContacted + sessionNoAnswer;
    const pct = sessionTotal > 0 ? Math.round(sessionAttempted / sessionTotal * 100) : 0;
    return (
        <div className="space-y-4">
            <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-8 text-center">
                <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center mx-auto mb-4 shadow-xl shadow-emerald-200/50">
                    {reason === 'ended' ? <Award size={32} className="text-white" /> : <Heart size={32} fill="white" className="text-white" />}
                </div>
                <h2 className="text-2xl font-black text-slate-900 mb-1">
                    {reason === 'ended' ? 'Great Work!' : 'All Done!'}
                </h2>
                <p className="text-sm text-slate-500">
                    {reason === 'ended'
                        ? `You've finished your session for "${sessionName}".`
                        : `You've worked through everyone available in "${sessionName}".`}
                </p>
            </div>
            <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-6">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-1.5">
                    <Award size={11} className="text-indigo-500" /> Your Contribution
                </p>
                <div className="grid grid-cols-2 gap-4 mb-4">
                    <div className="bg-emerald-50 rounded-2xl p-4 text-center">
                        <p className="text-4xl font-black text-emerald-600 mb-1">{myContacted}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-emerald-500">✅ Reached</p>
                    </div>
                    <div className="bg-rose-50 rounded-2xl p-4 text-center">
                        <p className="text-4xl font-black text-rose-500 mb-1">{myNoAnswer}</p>
                        <p className="text-[10px] font-black uppercase tracking-widest text-rose-400">📵 No Answer</p>
                    </div>
                </div>
                {myTotal > 0 && (
                    <div className="bg-indigo-50 rounded-xl px-4 py-2.5 text-center">
                        <p className="text-sm font-black text-indigo-700">
                            You attempted {myTotal} {myTotal === 1 ? 'contact' : 'contacts'} — thank you!
                        </p>
                    </div>
                )}
            </div>
            {sessionTotal > 0 && (
                <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-6">
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4 flex items-center gap-1.5">
                        <TrendingUp size={11} className="text-indigo-500" /> Session Progress
                    </p>
                    <div className="flex items-center justify-between mb-2">
                        <p className="text-sm font-black text-slate-700">{pct}% attempted</p>
                        <p className="text-xs text-slate-400">{sessionAttempted} of {sessionTotal}</p>
                    </div>
                    <div className="bg-slate-100 rounded-full h-3 overflow-hidden mb-4">
                        <div
                            className="bg-gradient-to-r from-indigo-500 to-emerald-500 h-3 rounded-full transition-all duration-700"
                            style={{ width: `${Math.min(100, pct)}%` }}
                        />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <div className="text-center">
                            <p className="text-xl font-black text-emerald-600">{sessionContacted}</p>
                            <p className="text-[9px] uppercase font-black text-slate-400 tracking-widest">Total Reached</p>
                        </div>
                        <div className="text-center">
                            <p className="text-xl font-black text-rose-500">{sessionNoAnswer}</p>
                            <p className="text-[9px] uppercase font-black text-slate-400 tracking-widest">No Answer</p>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

// ─── Paused Session Card ──────────────────────────────────────────────────────

const PausedCard: React.FC<{ sessionName: string }> = ({ sessionName }) => (
    <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-10 text-center">
        <div className="text-5xl mb-4">⏸️</div>
        <h2 className="text-xl font-black text-slate-900 mb-2">Session Paused</h2>
        <p className="text-sm text-slate-500">
            <span className="font-bold">{sessionName}</span> is currently paused by the coordinator. Please check back later.
        </p>
    </div>
);

// ─── Closed Session Card ────────────────────────────────────────────────────────────────────────────────────

const ClosedCard: React.FC<{ sessionName: string; sessionId: string }> = ({ sessionName, sessionId }) => {
    const followUpUrl = `${window.location.protocol}//${window.location.host}/contact/${sessionId}/followup`;
    return (
        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-10 text-center">
            <div className="w-16 h-16 rounded-2xl bg-violet-100 flex items-center justify-center mx-auto mb-5">
                <CheckCircle2 size={32} className="text-violet-500" />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Session Ended</h2>
            <p className="text-sm text-slate-500 mb-4">
                <span className="font-bold">{sessionName}</span> has been closed by the coordinator. Thank you for helping!
            </p>
            <div className="border-t border-slate-100 pt-5 mt-5">
                <p className="text-xs text-slate-400 mb-3">Need to add follow-up notes for someone who called back?</p>
                <a
                    href={followUpUrl}
                    className="inline-flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 rounded-2xl text-sm font-black uppercase tracking-wide shadow-lg shadow-indigo-200 transition-all"
                >
                    <Edit3 size={15} />
                    Open Follow-Up Notes
                </a>
            </div>
        </div>
    );
};

// ─── Not Found Card ───────────────────────────────────────────────────────────

const NotFoundCard: React.FC = () => (
    <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-10 text-center">
        <div className="text-5xl mb-4">🔍</div>
        <h2 className="text-xl font-black text-slate-900 mb-2">Session Not Found</h2>
        <p className="text-sm text-slate-500">This link may be invalid or the session has been removed.</p>
    </div>
);

// ─── Main Public View ─────────────────────────────────────────────────────────

// ─── Follow-Up View (post-session note editing) ──────────────────────────────

const FollowUpView: React.FC<{ sessionId: string }> = ({ sessionId }) => {
    const [session, setSession] = useState<OutreachSession | null>(null);
    const [viewState, setViewState] = useState<'loading' | 'phone' | 'list' | 'not-found'>('loading');
    const [volunteerPhone, setVolunteerPhone] = useState('');
    const [slots, setSlots] = useState<OutreachSlot[]>([]);
    const [searchQuery, setSearchQuery] = useState('');
    const [expandedSlotId, setExpandedSlotId] = useState<string | null>(null);
    const [noteText, setNoteText] = useState('');
    const [saving, setSaving] = useState(false);
    const [savedSlotId, setSavedSlotId] = useState<string | null>(null);

    // Load session on mount
    useEffect(() => {
        if (!sessionId) { setViewState('not-found'); return; }
        firestore.getOutreachSession(sessionId).then(s => {
            if (!s) { setViewState('not-found'); return; }
            setSession(s);
            // Check for stored phone
            const stored = sessionStorage.getItem(STORAGE_KEY(sessionId));
            if (stored) setVolunteerPhone(stored);
            setViewState('phone');
        });
    }, [sessionId]);

    const handlePhoneSubmit = async (phone: string) => {
        if (!session) return;
        setVolunteerPhone(phone);
        sessionStorage.setItem(STORAGE_KEY(sessionId), phone);
        setViewState('loading');
        const mySlots = await firestore.getVolunteerSlots(sessionId, phone);
        setSlots(mySlots);
        setViewState('list');
    };

    const handleSaveNote = async (slot: OutreachSlot) => {
        if (!noteText.trim() || saving) return;
        setSaving(true);
        try {
            const resp = await fetch('/api/outreach/followup-note', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId,
                    slotId: slot.id,
                    followUpNote: noteText.trim(),
                    volunteerPhone,
                }),
            });
            if (!resp.ok) {
                const data = await resp.json().catch(() => ({ error: 'Failed' }));
                throw new Error(data.error || 'Failed to save note');
            }
            // Update local state
            setSlots(prev => prev.map(s => {
                if (s.id !== slot.id) return s;
                const updated = { ...s };
                updated.followUpNotes = [...(updated.followUpNotes || []), { note: noteText.trim(), addedAt: Date.now() }];
                return updated;
            }));
            setNoteText('');
            setExpandedSlotId(null);
            setSavedSlotId(slot.id);
            setTimeout(() => setSavedSlotId(null), 3000);
        } catch (err: any) {
            alert(err.message || 'Failed to save note');
        } finally {
            setSaving(false);
        }
    };

    const filteredSlots = useMemo(() => {
        if (!searchQuery.trim()) return slots;
        const q = searchQuery.toLowerCase();
        const qDigits = q.replace(/\D/g, '');
        return slots.filter(s =>
            s.assignedPersonName.toLowerCase().includes(q) ||
            (qDigits && s.assignedPersonPhone?.replace(/\D/g, '').includes(qDigits))
        );
    }, [slots, searchQuery]);

    const sessionName = session?.name ?? '';

    return (
        <Shell sessionName={sessionName || undefined}>
            {viewState === 'loading' && <LoadingCard message="Loading your contacts…" />}
            {viewState === 'not-found' && <NotFoundCard />}
            {viewState === 'phone' && (
                <div>
                    <div className="bg-indigo-50 border border-indigo-100 rounded-2xl p-4 mb-4 text-center">
                        <Edit3 size={20} className="mx-auto text-indigo-500 mb-2" />
                        <p className="text-sm font-bold text-indigo-800">Follow-Up Notes</p>
                        <p className="text-xs text-indigo-600 mt-1">
                            Enter your phone number to view the people you contacted and add follow-up notes.
                        </p>
                    </div>
                    <PhoneStep sessionName={sessionName} onSubmit={handlePhoneSubmit} isLoading={false} />
                </div>
            )}
            {viewState === 'list' && (
                <div className="space-y-4">
                    {/* Header */}
                    <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-6">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-200">
                                <Edit3 size={18} className="text-white" />
                            </div>
                            <div>
                                <h2 className="text-lg font-black text-slate-900">Follow-Up Notes</h2>
                                <p className="text-[11px] text-slate-400 font-medium">
                                    {slots.length} {slots.length === 1 ? 'contact' : 'contacts'} from your session
                                </p>
                            </div>
                        </div>

                        {/* Search */}
                        {slots.length > 3 && (
                            <div className="relative">
                                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-300" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder="Search by name or phone…"
                                    className="w-full pl-10 pr-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:border-indigo-400 focus:ring-2 focus:ring-indigo-100 transition-colors"
                                />
                            </div>
                        )}
                    </div>

                    {/* Empty state */}
                    {slots.length === 0 && (
                        <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-10 text-center">
                            <Users size={32} className="mx-auto text-slate-300 mb-3" />
                            <h3 className="text-lg font-black text-slate-700 mb-2">No Contacts Found</h3>
                            <p className="text-sm text-slate-400">We couldn't find any completed contacts for your phone number in this session.</p>
                        </div>
                    )}

                    {/* Contact cards */}
                    {filteredSlots.map(slot => {
                        const isExpanded = expandedSlotId === slot.id;
                        const justSaved = savedSlotId === slot.id;
                        return (
                            <div key={slot.id} className="bg-white rounded-[2rem] shadow-xl shadow-slate-200/40 border border-slate-100 overflow-hidden">
                                {/* Status stripe */}
                                <div className={`h-1.5 ${slot.status === 'contacted' ? 'bg-emerald-400' : 'bg-rose-400'}`} />

                                <div className="p-5">
                                    {/* Person info */}
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-3">
                                            <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-lg shadow-md ${
                                                slot.status === 'contacted'
                                                    ? 'bg-gradient-to-br from-emerald-400 to-emerald-600 shadow-emerald-200'
                                                    : 'bg-gradient-to-br from-rose-400 to-rose-600 shadow-rose-200'
                                            }`}>
                                                {slot.assignedPersonName.slice(0, 1).toUpperCase()}
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-900 leading-tight">{slot.assignedPersonName}</p>
                                                <div className="flex items-center gap-2 mt-0.5">
                                                    <span className={`inline-flex items-center gap-1 text-[9px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${
                                                        slot.status === 'contacted'
                                                            ? 'bg-emerald-100 text-emerald-700'
                                                            : 'bg-rose-100 text-rose-700'
                                                    }`}>
                                                        {slot.status === 'contacted' ? '✅ Reached' : '📵 No Answer'}
                                                    </span>
                                                    {slot.completedAt && (
                                                        <span className="text-[9px] text-slate-400">
                                                            {new Date(slot.completedAt).toLocaleDateString()}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {/* Original notes */}
                                    {slot.notes && (
                                        <div className="bg-slate-50 rounded-xl px-4 py-2.5 mb-3">
                                            <p className="text-[9px] font-black uppercase tracking-widest text-slate-400 mb-1">Original Notes</p>
                                            <p className="text-sm text-slate-600">{slot.notes}</p>
                                        </div>
                                    )}

                                    {/* Existing follow-up notes */}
                                    {slot.followUpNotes && slot.followUpNotes.length > 0 && (
                                        <div className="space-y-2 mb-3">
                                            {slot.followUpNotes.map((fn, i) => (
                                                <div key={i} className="bg-indigo-50 rounded-xl px-4 py-2.5">
                                                    <div className="flex items-center gap-1.5 mb-1">
                                                        <Edit3 size={10} className="text-indigo-500" />
                                                        <p className="text-[9px] font-black uppercase tracking-widest text-indigo-500">Follow-Up</p>
                                                        <span className="text-[9px] text-slate-400 ml-auto">
                                                            {new Date(fn.addedAt).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                    <p className="text-sm text-slate-700">{fn.note}</p>
                                                </div>
                                            ))}
                                        </div>
                                    )}

                                    {/* Just saved indicator */}
                                    {justSaved && (
                                        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-2.5 mb-3">
                                            <CheckCircle2 size={14} className="text-emerald-500" />
                                            <p className="text-xs font-bold text-emerald-700">Note saved successfully!</p>
                                        </div>
                                    )}

                                    {/* Add note button / form */}
                                    {isExpanded ? (
                                        <div className="space-y-2">
                                            <textarea
                                                value={noteText}
                                                onChange={e => setNoteText(e.target.value)}
                                                placeholder="Type your follow-up note…"
                                                rows={3}
                                                autoFocus
                                                className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-400 rounded-xl px-4 py-3 text-sm text-slate-700 placeholder:text-slate-300 outline-none focus:ring-2 focus:ring-indigo-100 resize-none transition-colors"
                                            />
                                            <div className="flex gap-2">
                                                <button
                                                    onClick={() => handleSaveNote(slot)}
                                                    disabled={!noteText.trim() || saving}
                                                    className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-2.5 rounded-xl text-xs font-black uppercase tracking-wide shadow-md shadow-indigo-200 transition-all"
                                                >
                                                    {saving
                                                        ? <><Loader2 size={14} className="animate-spin" /> Saving…</>
                                                        : <><Send size={14} /> Save Note</>}
                                                </button>
                                                <button
                                                    onClick={() => { setExpandedSlotId(null); setNoteText(''); }}
                                                    className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-500 rounded-xl text-xs font-bold transition-colors"
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        <button
                                            onClick={() => { setExpandedSlotId(slot.id); setNoteText(''); }}
                                            className="w-full flex items-center justify-center gap-2 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 py-3 rounded-xl text-xs font-black uppercase tracking-wide transition-all"
                                        >
                                            <Edit3 size={14} />
                                            Add Follow-Up Note
                                        </button>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* No search results */}
                    {filteredSlots.length === 0 && slots.length > 0 && (
                        <div className="bg-white rounded-2xl border border-slate-100 p-6 text-center">
                            <Search size={24} className="mx-auto text-slate-300 mb-2" />
                            <p className="text-sm text-slate-400">No contacts match "{searchQuery}"</p>
                        </div>
                    )}
                </div>
            )}
        </Shell>
    );
};

// ─── Main Public View ─────────────────────────────────────────────────────────

type ViewState = 'loading' | 'phone' | 'assigning' | 'contact' | 'done-exhausted' | 'done-ended' | 'not-found' | 'paused' | 'closed';

export const PublicContactView: React.FC<{ sessionId: string; mode?: 'followup' }> = ({ sessionId, mode }) => {

    // If follow-up mode, render the dedicated view
    if (mode === 'followup') return <FollowUpView sessionId={sessionId} />;

    const [session, setSession] = useState<OutreachSession | null>(null);
    const [viewState, setViewState] = useState<ViewState>('loading');
    const [volunteerPhone, setVolunteerPhone] = useState('');
    const [volunteerName, setVolunteerName] = useState<string | null>(null);
    // Batch of pre-assigned slots; batchIdx is the current position
    const [batch, setBatch] = useState<OutreachSlot[]>([]);
    const [batchIdx, setBatchIdx] = useState(0);
    // Personal stats for this volunteer
    const [myContacted, setMyContacted] = useState(0);
    const [myNoAnswer, setMyNoAnswer] = useState(0);
    // Live session-wide slots
    const [liveSlots, setLiveSlots] = useState<OutreachSlot[]>([]);
    // Pre-fetching next batch in background
    const nextBatchRef = useRef<OutreachSlot[] | null>(null);

    const currentSlot = batch[batchIdx] ?? null;

    // Load session on mount
    useEffect(() => {
        if (!sessionId) { setViewState('not-found'); return; }
        firestore.getOutreachSession(sessionId).then(s => {
            if (!s) { setViewState('not-found'); return; }
            setSession(s);
            const stored = sessionStorage.getItem(STORAGE_KEY(sessionId));
            if (stored) setVolunteerPhone(stored);
            // Determine initial view: closed > paused > active
            if (s.closedAt) {
                setViewState('closed');
            } else if (!s.isActive) {
                setViewState('paused');
            } else {
                setViewState('phone');
            }
        });
    }, [sessionId]);

    // Subscribe to all slots for live session stats
    useEffect(() => {
        if (!sessionId) return;
        const unsub = firestore.subscribeToOutreachSlots(sessionId, setLiveSlots);
        return () => unsub();
    }, [sessionId]);

    const sessionContacted = liveSlots.filter(s => s.status === 'contacted').length;
    const sessionNoAnswer  = liveSlots.filter(s => s.status === 'no-answer').length;
    const sessionTotal     = session?.eligiblePeople?.length ?? 0;

    // Get eligible sorted list (for passing to claimBatch).
    //
    // Three categories (evaluated from slot data):
    //   'contacted'  → permanently excluded; those people are DONE.
    //   'no-answer'  with active noAnswerUntil → on cooldown, hidden until timer expires.
    //   everything else (uncalled, released, no-answer with expired/null cooldown) → AVAILABLE.
    //
    // Priority order: uncalled people first, then no-answer retries at the end.
    // When this returns [] the session is effectively exhausted (all contacted or all cooling down).
    const getFilteredPeople = useCallback(async (): Promise<{ id: string; name: string; phone?: string | null; email?: string | null }[]> => {
        if (!session) return [];
        const allSlots = await firestore.getOutreachSlots(session.id);
        const now = Date.now();

        const contacted  = new Set<string>(); // done — never re-assign
        const pending    = new Set<string>(); // currently claimed by another volunteer
        const onCooldown = new Set<string>(); // no-answer but cooldown still active
        const triedBefore = new Set<string>(); // no-answer with expired cooldown (re-queue at end)

        for (const slot of allSlots) {
            if (slot.status === 'contacted') {
                contacted.add(slot.assignedPersonId);
            } else if (slot.status === 'pending') {
                pending.add(slot.assignedPersonId);
            } else if (slot.status === 'no-answer') {
                const cooldownActive = slot.noAnswerUntil && slot.noAnswerUntil > now;
                if (cooldownActive) {
                    onCooldown.add(slot.assignedPersonId);
                } else {
                    // Cooldown expired (or cleared on reopen) → re-queue, but at end
                    triedBefore.add(slot.assignedPersonId);
                }
            }
            // 'released' → uncalled for now, available
        }

        const allPeople = session.eligiblePeople ?? [];

        // Fresh contacts: never attempted (no slot at all, or only released slots)
        const fresh = allPeople.filter(p =>
            !contacted.has(p.id) &&
            !pending.has(p.id) &&
            !onCooldown.has(p.id) &&
            !triedBefore.has(p.id)
        );

        // Retries: previously got no-answer, cooldown now clear
        const retries = allPeople.filter(p =>
            triedBefore.has(p.id) &&
            !contacted.has(p.id) &&
            !pending.has(p.id) &&
            !onCooldown.has(p.id)
        );

        // Fresh people first, then retries — so new contacts aren't delayed by retries
        return [...fresh, ...retries];
    }, [session]);

    // Fetch a fresh batch and return it (or [] if queue exhausted)
    const fetchBatch = useCallback(async (phone: string, name: string | null, sess: OutreachSession): Promise<OutreachSlot[]> => {
        const eligible = await getFilteredPeople();
        if (eligible.length === 0) return [];
        const size = sess.batchSize ?? 3;
        return firestore.claimBatch(sess, phone, eligible, size, name);
    }, [getFilteredPeople]);

    const handlePhoneSubmit = async (phone: string) => {
        if (!session || !sessionId) return;
        setVolunteerPhone(phone);
        sessionStorage.setItem(STORAGE_KEY(sessionId), phone);

        // Resolve volunteer name from member directory
        const normalised = phone.replace(/\D/g, '');
        const match = session.memberDirectory?.find(e => e.phone === normalised);
        const resolvedName = match?.name ?? null;
        setVolunteerName(resolvedName);

        setViewState('assigning');
        const newBatch = await fetchBatch(phone, resolvedName, session);
        if (newBatch.length === 0) { setViewState('done-exhausted'); return; }
        setBatch(newBatch);
        setBatchIdx(0);
        setViewState('contact');
    };

    const handleComplete = async (outcome: Outcome, notes: string) => {
        if (!currentSlot || !session) return;

        // 1. Firestore slot update — fire-and-forget
        const now = Date.now();
        const updates: any = { status: outcome, notes, completedAt: now };
        if (outcome === 'no-answer') updates.noAnswerUntil = now + 24 * 60 * 60 * 1000;
        firestore.updateOutreachSlot(currentSlot.id, updates);

        // 2. PCO note — fire-and-forget to the server endpoint
        fetch('/api/outreach/log-contact', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                sessionId: session.id,
                slotId: currentSlot.id,
                outcome,
                notes: notes?.trim() || '',
                volunteerName,
            }),
        }).catch(() => { /* non-blocking */ });

        // 3. Update personal stats immediately
        if (outcome === 'contacted') setMyContacted(p => p + 1);
        else setMyNoAnswer(p => p + 1);

        const nextIdx = batchIdx + 1;

        // 3. When we're on the second-to-last item in the batch, pre-fetch the next batch
        if (nextIdx === batch.length - 1 && nextBatchRef.current === null) {
            nextBatchRef.current = []; // sentinel — fetching
            fetchBatch(volunteerPhone, volunteerName, session).then(nb => {
                nextBatchRef.current = nb;
            });
        }

        // 4. Advance immediately — no wait
        if (nextIdx < batch.length) {
            setBatchIdx(nextIdx);
            // viewState stays 'contact' — new slot shown instantly
        } else {
            // Batch exhausted — check pre-fetched or fetch now
            setViewState('assigning');
            let nextBatch = nextBatchRef.current;
            nextBatchRef.current = null;
            if (nextBatch === null) {
                nextBatch = await fetchBatch(volunteerPhone, volunteerName, session);
            } else if (nextBatch.length === 0) {
                // Pre-fetch returned empty — try once more in case of timing
                nextBatch = await fetchBatch(volunteerPhone, volunteerName, session);
            }
            if (nextBatch.length === 0) { setViewState('done-exhausted'); return; }
            setBatch(nextBatch);
            setBatchIdx(0);
            setViewState('contact');
        }
    };

    const handleEndSession = async () => {
        if (!confirm('Are you sure you want to end your session?')) return;
        if (sessionId) sessionStorage.removeItem(STORAGE_KEY(sessionId));
        // Release any unworked pending slots back to the queue
        if (sessionId && volunteerPhone) {
            firestore.releasePendingSlots(sessionId, volunteerPhone); // fire-and-forget
        }
        setViewState('done-ended');
    };

    const sessionName = session?.name ?? '';
    const isActive = viewState === 'contact' || viewState === 'assigning';
    const isDone = viewState === 'done-exhausted' || viewState === 'done-ended';
    // Progress within current batch: e.g. "2 / 3"
    const batchProgress = batch.length > 0 ? { current: batchIdx + 1, total: batch.length } : null;

    return (
        <Shell sessionName={sessionName || undefined} onEnd={isActive ? handleEndSession : undefined}>
            {viewState === 'loading' && <LoadingCard />}
            {viewState === 'not-found' && <NotFoundCard />}
            {viewState === 'paused' && <PausedCard sessionName={sessionName} />}
            {viewState === 'closed' && <ClosedCard sessionName={sessionName} sessionId={sessionId} />}
            {viewState === 'phone' && (
                <PhoneStep sessionName={sessionName} onSubmit={handlePhoneSubmit} isLoading={false} />
            )}
            {viewState === 'assigning' && <AssigningCard />}
            {/* Personal stats strip — shows after first outcome */}
            {isActive && (myContacted + myNoAnswer > 0) && (
                <StatsStrip
                    myContacted={myContacted}
                    myNoAnswer={myNoAnswer}
                    sessionContacted={sessionContacted}
                    sessionTotal={sessionTotal}
                />
            )}
            {/* Batch progress indicator */}
            {viewState === 'contact' && batchProgress && batchProgress.total > 1 && (
                <div className="flex items-center gap-2 mb-3 px-1">
                    {Array.from({ length: batchProgress.total }).map((_, i) => (
                        <div
                            key={i}
                            className={`flex-1 h-1 rounded-full transition-all duration-300 ${
                                i < batchIdx ? 'bg-emerald-400' :
                                i === batchIdx ? 'bg-indigo-500' :
                                'bg-slate-200 dark:bg-slate-700'
                            }`}
                        />
                    ))}
                    <span className="text-[9px] font-black text-slate-400 whitespace-nowrap">
                        {batchProgress.current}/{batchProgress.total}
                    </span>
                </div>
            )}
            {viewState === 'contact' && currentSlot && (
                <ContactCard slot={currentSlot} onComplete={handleComplete} />
            )}
            {isDone && (
                <AllDoneCard
                    sessionName={sessionName}
                    myContacted={myContacted}
                    myNoAnswer={myNoAnswer}
                    sessionContacted={sessionContacted}
                    sessionNoAnswer={sessionNoAnswer}
                    sessionTotal={sessionTotal}
                    reason={viewState === 'done-ended' ? 'ended' : 'exhausted'}
                />
            )}
        </Shell>
    );
};
