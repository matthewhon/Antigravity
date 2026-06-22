import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { OutreachSession, OutreachSlot } from '../types';
import { firestore } from '../services/firestoreService';
import {
    Phone, Mail, CheckCircle2, PhoneOff, ArrowRight, LogOut,
    Loader2, Heart, Users, ChevronRight
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
    isSaving: boolean;
}

const ContactCard: React.FC<ContactCardProps> = ({ slot, onComplete, isSaving }) => {
    const [notes, setNotes] = useState('');
    const [selectedOutcome, setSelectedOutcome] = useState<Outcome | null>(null);
    const [confirmed, setConfirmed] = useState(false);

    const handleConfirm = () => {
        if (!selectedOutcome) return;
        setConfirmed(true);
        onComplete(selectedOutcome, notes);
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
                                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600 mb-0.5">Phone</p>
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
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-0.5">Phone</p>
                                    <p className="text-sm font-bold text-slate-400">No phone on file</p>
                                </div>
                            </div>
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
                    disabled={isSaving || confirmed}
                    className={`w-full py-4 rounded-2xl font-black uppercase tracking-widest text-sm shadow-lg transition-all flex items-center justify-center gap-2 ${
                        selectedOutcome === 'contacted'
                            ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-200'
                            : 'bg-rose-600 hover:bg-rose-700 text-white shadow-rose-200'
                    } disabled:opacity-60`}
                >
                    {isSaving || confirmed
                        ? <><Loader2 size={16} className="animate-spin" /> Saving…</>
                        : <>{selectedOutcome === 'contacted' ? 'Save & Get Next Person' : 'Record & Get Next Person'} <ArrowRight size={16} /></>
                    }
                </button>
            )}
        </div>
    );
};

// ─── All Done Card ────────────────────────────────────────────────────────────

const AllDoneCard: React.FC<{ sessionName: string; count: number; reason: 'exhausted' | 'ended' }> = ({
    sessionName, count, reason
}) => (
    <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-10 text-center">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-400 to-indigo-500 flex items-center justify-center mx-auto mb-5 shadow-xl shadow-emerald-200/50">
            {reason === 'ended' ? <LogOut size={32} className="text-white" /> : <Heart size={32} fill="white" className="text-white" />}
        </div>
        <h2 className="text-2xl font-black text-slate-900 mb-2">
            {reason === 'ended' ? 'Session Ended' : 'Amazing Work!'}
        </h2>
        <p className="text-sm text-slate-500 mb-3">
            {reason === 'ended'
                ? `Thanks for helping with "${sessionName}". You made ${count} contact${count !== 1 ? 's' : ''} today.`
                : `You've worked through everyone available in "${sessionName}". Thanks for your faithfulness!`
            }
        </p>
        {count > 0 && (
            <div className="inline-flex items-center gap-2 bg-indigo-50 text-indigo-600 px-4 py-2 rounded-full font-black text-sm">
                <Users size={14} /> {count} {count === 1 ? 'person' : 'people'} contacted
            </div>
        )}
    </div>
);

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

// ─── Not Found Card ───────────────────────────────────────────────────────────

const NotFoundCard: React.FC = () => (
    <div className="bg-white rounded-[2rem] shadow-xl border border-slate-100 p-10 text-center">
        <div className="text-5xl mb-4">🔍</div>
        <h2 className="text-xl font-black text-slate-900 mb-2">Session Not Found</h2>
        <p className="text-sm text-slate-500">This link may be invalid or the session has been removed.</p>
    </div>
);

// ─── Main Public View ─────────────────────────────────────────────────────────

type ViewState = 'loading' | 'phone' | 'assigning' | 'contact' | 'done-exhausted' | 'done-ended' | 'not-found' | 'paused';

export const PublicContactView: React.FC<{ sessionId: string }> = ({ sessionId }) => {

    const [session, setSession] = useState<OutreachSession | null>(null);
    const [viewState, setViewState] = useState<ViewState>('loading');
    const [volunteerPhone, setVolunteerPhone] = useState('');
    const [currentSlot, setCurrentSlot] = useState<OutreachSlot | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [contactCount, setContactCount] = useState(0);

    // Load session on mount
    useEffect(() => {
        if (!sessionId) { setViewState('not-found'); return; }
        firestore.getOutreachSession(sessionId).then(s => {
            if (!s) { setViewState('not-found'); return; }
            setSession(s);
            // Check for stored volunteer phone
            const stored = sessionStorage.getItem(STORAGE_KEY(sessionId));
            if (stored) {
                setVolunteerPhone(stored);
                // Don't auto-advance — let user confirm they want to continue
            }
            setViewState(s.isActive ? 'phone' : 'paused');
        });
    }, [sessionId]);

    // Get sorted filtered people for the session, using the denormalized list stored in the session doc
    const getFilteredPeople = useCallback(async (): Promise<{ id: string; name: string; phone?: string | null; email?: string | null }[]> => {
        if (!session) return [];
        const allSlots = await firestore.getOutreachSlots(session.id);
        const now = Date.now();

        // Build sets of blocked person IDs
        const alreadyDone = new Set<string>();
        const onCooldown = new Set<string>();
        for (const slot of allSlots) {
            if (slot.status === 'contacted' || slot.status === 'pending') {
                alreadyDone.add(slot.assignedPersonId);
            } else if (slot.status === 'no-answer') {
                if (slot.noAnswerUntil && slot.noAnswerUntil > now) {
                    onCooldown.add(slot.assignedPersonId);
                }
            }
        }

        // Use the denormalized eligiblePeople list stored in the session doc
        const allPeople = session.eligiblePeople ?? [];

        // Primary queue: never attempted and not on cooldown (sorted by riskScore asc)
        const primary = allPeople.filter(p => !alreadyDone.has(p.id) && !onCooldown.has(p.id));

        // Re-queued after cooldown: were no-answer but cooldown expired
        const reQueued = allPeople.filter(p => {
            if (alreadyDone.has(p.id) || onCooldown.has(p.id)) return false;
            // Was previously no-answer but now eligible
            return allSlots.some(s => s.assignedPersonId === p.id && s.status === 'no-answer');
        });

        // primary is already sorted by riskScore from when the admin built the list
        // Remove reQueued from primary to avoid duplicates, then append reQueued at bottom
        const primaryFiltered = primary.filter(p => !reQueued.find(r => r.id === p.id));

        return [...primaryFiltered, ...reQueued];
    }, [session]);

    const handlePhoneSubmit = async (phone: string) => {
        if (!session || !sessionId) return;
        setVolunteerPhone(phone);
        sessionStorage.setItem(STORAGE_KEY(sessionId), phone);
        setViewState('assigning');

        const eligible = await getFilteredPeople();
        if (eligible.length === 0) {
            setViewState('done-exhausted');
            return;
        }

        const slot = await firestore.claimNextPerson(session, phone, eligible);
        if (!slot) {
            setViewState('done-exhausted');
            return;
        }
        setCurrentSlot(slot);
        setViewState('contact');
    };

    const handleComplete = async (outcome: Outcome, notes: string) => {
        if (!currentSlot || !session) return;
        setIsSaving(true);

        const now = Date.now();
        const updates: any = {
            status: outcome,
            notes,
            completedAt: now,
        };
        if (outcome === 'no-answer') {
            updates.noAnswerUntil = now + 24 * 60 * 60 * 1000; // 24 hours
        }

        await firestore.updateOutreachSlot(currentSlot.id, updates);
        setContactCount(prev => prev + 1);

        // Brief pause before advancing
        await new Promise(r => setTimeout(r, 800));
        setIsSaving(false);
        setCurrentSlot(null);
        setViewState('assigning');

        // Get next assignment
        const eligible = await getFilteredPeople();
        if (eligible.length === 0) {
            setViewState('done-exhausted');
            return;
        }

        const nextSlot = await firestore.claimNextPerson(session, volunteerPhone, eligible);
        if (!nextSlot) {
            setViewState('done-exhausted');
            return;
        }
        setCurrentSlot(nextSlot);
        setViewState('contact');
    };

    const handleEndSession = () => {
        if (!confirm('Are you sure you want to end your session?')) return;
        if (sessionId) sessionStorage.removeItem(STORAGE_KEY(sessionId));
        setViewState('done-ended');
    };

    const sessionName = session?.name ?? '';

    return (
        <Shell
            churchName={undefined} // Could be fetched if needed
            sessionName={sessionName || undefined}
            onEnd={viewState === 'contact' || viewState === 'assigning' ? handleEndSession : undefined}
        >
            {viewState === 'loading' && <LoadingCard />}
            {viewState === 'not-found' && <NotFoundCard />}
            {viewState === 'paused' && <PausedCard sessionName={sessionName} />}
            {viewState === 'phone' && (
                <PhoneStep
                    sessionName={sessionName}
                    onSubmit={handlePhoneSubmit}
                    isLoading={false}
                />
            )}
            {viewState === 'assigning' && <AssigningCard />}
            {viewState === 'contact' && currentSlot && (
                <ContactCard
                    slot={currentSlot}
                    onComplete={handleComplete}
                    isSaving={isSaving}
                />
            )}
            {viewState === 'done-exhausted' && (
                <AllDoneCard sessionName={sessionName} count={contactCount} reason="exhausted" />
            )}
            {viewState === 'done-ended' && (
                <AllDoneCard sessionName={sessionName} count={contactCount} reason="ended" />
            )}
        </Shell>
    );
};
