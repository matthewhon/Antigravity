import React, { useState, useEffect, useMemo, useRef } from 'react';
import { GroupCareSession, GroupCareSlot } from '../types';
import { firestore } from '../services/firestoreService';
import { renderCallScript } from '../constants/callScript';
import {
  Phone, Mail, CheckCircle2, PhoneOff, ArrowRight, LogOut,
  Loader2, Heart, Users, ChevronRight, Award, TrendingUp, MessageSquare,
  Search, Edit3, Send, Clock as ClockIcon, AlertTriangle, ShieldCheck
} from 'lucide-react';

const NOTE_CATEGORIES = ['General Check-in', 'Prayer Request', 'Life Event', 'Needs Pastoral Visit'];

const normalizePhone = (raw: string) => raw.replace(/\D/g, '');

const formatPhone = (raw: string): string => {
  const d = raw.replace(/\D/g, '');
  if (d.length === 10) return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 11 && d[0] === '1') return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  return raw;
};

const Shell: React.FC<{
  children: React.ReactNode;
  sessionName?: string;
  onEnd?: () => void;
}> = ({ children, sessionName, onEnd }) => (
  <div className="min-h-screen bg-gradient-to-br from-slate-50 to-indigo-50/30 font-sans text-slate-900">
    <header className="bg-white border-b border-slate-100 shadow-sm px-6 py-4">
      <div className="max-w-lg mx-auto flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-indigo-600 flex items-center justify-center shadow-md shadow-indigo-200">
            <Users size={18} fill="white" className="text-white" />
          </div>
          <div>
            <p className="text-sm font-black text-slate-900 leading-tight">Group Care</p>
            {sessionName && <p className="text-[10px] text-indigo-600 font-bold uppercase tracking-wide">{sessionName}</p>}
          </div>
        </div>
        {onEnd && (
          <button
            onClick={onEnd}
            className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-slate-400 hover:text-rose-500 transition-colors px-3 py-2 rounded-xl hover:bg-rose-50"
          >
            <LogOut size={13} /> Exit
          </button>
        )}
      </div>
    </header>
    <main className="px-4 py-8 flex justify-center">
      <div className="w-full max-w-lg">
        {children}
      </div>
    </main>
    <footer className="text-center text-[11px] text-slate-400 pb-8">
      Powered by <span className="font-bold text-slate-600">Pastoral Care</span>
    </footer>
  </div>
);

// ─── Step 1: Leader Phone Entry ───────────────────────────────────────────────

const PhoneStep: React.FC<{
  sessionName: string;
  onSubmit: (phone: string) => void;
  isLoading: boolean;
  error?: string | null;
}> = ({ sessionName, onSubmit, isLoading, error }) => {
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
    <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 text-center">
      <div className="w-16 h-16 rounded-2xl bg-indigo-600 flex items-center justify-center mx-auto mb-4 shadow-lg shadow-indigo-200">
        <Phone size={28} className="text-white" />
      </div>
      <h1 className="text-2xl font-black text-slate-900 mb-2">Welcome Leader!</h1>
      <p className="text-xs text-slate-500 mb-6">
        You are leading care for <span className="font-bold text-slate-700">{sessionName}</span>.
        Enter your cell phone number to access your group member care queue.
      </p>

      {error && (
        <div className="mb-4 p-3 bg-rose-50 border border-rose-100 text-rose-700 text-xs rounded-2xl font-semibold">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
            Your Cell Phone Number
          </label>
          <input
            ref={inputRef}
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={e => setPhone(e.target.value)}
            placeholder="(555) 000-0000"
            className="w-full text-2xl font-black text-slate-900 tracking-wide text-center bg-slate-50 border-2 border-slate-200 focus:border-indigo-500 rounded-2xl px-4 py-4 outline-none transition-colors placeholder:text-slate-300 placeholder:font-normal placeholder:text-xl"
          />
          <p className="text-[10px] text-slate-400 text-center mt-2 font-medium">
            Used to identify you as a group leader and assign your group members.
          </p>
        </div>

        <button
          type="submit"
          disabled={normalizePhone(phone).length < 10 || isLoading}
          className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white py-4 rounded-2xl font-bold uppercase tracking-wide text-xs shadow-lg shadow-indigo-200 transition-all flex items-center justify-center gap-2"
        >
          {isLoading ? <Loader2 size={18} className="animate-spin" /> : <ChevronRight size={18} />}
          {isLoading ? 'Finding your group members...' : 'Get My Group Members'}
        </button>
      </form>
    </div>
  );
};

// ─── Main Public Group Care View Component ─────────────────────────────────────

export const PublicGroupCareView: React.FC<{ sessionId: string }> = ({ sessionId }) => {
  const [session, setSession] = useState<GroupCareSession | null>(null);
  const [volunteerPhone, setVolunteerPhone] = useState<string | null>(() => {
    return localStorage.getItem(`group_care_leader_phone_${sessionId}`);
  });
  const [volunteerName, setVolunteerName] = useState<string | null>(null);
  const [activeSlot, setActiveSlot] = useState<GroupCareSlot | null>(null);
  const [completedCount, setCompletedCount] = useState(0);
  const [selectedCategory, setSelectedCategory] = useState<string>('General Check-in');
  const [notes, setNotes] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load Session
  useEffect(() => {
    firestore.getGroupCareSession(sessionId).then(data => {
      setSession(data);
      setIsLoading(false);
    });
  }, [sessionId]);

  // Subscribe to Leader's active pending slot
  useEffect(() => {
    if (!sessionId || !volunteerPhone) return;
    const unsub = firestore.subscribeToActiveGroupCareSlot(sessionId, volunteerPhone, slot => {
      setActiveSlot(slot);
    });
    return () => unsub();
  }, [sessionId, volunteerPhone]);

  const handlePhoneSubmit = async (phone: string) => {
    setIsLoading(true);
    setError(null);
    try {
      if (!session) return;
      
      // Look up leader in directory or member list
      const normPhone = normalizePhone(phone);
      const leaderMatch = session.leaderDirectory?.find(l => normalizePhone(l.phone) === normPhone);
      const name = leaderMatch?.name || 'Group Leader';

      setVolunteerPhone(normPhone);
      setVolunteerName(name);
      localStorage.setItem(`group_care_leader_phone_${sessionId}`, normPhone);

      // Claim next batch of group members
      const eligible = session.eligiblePeople || [];
      await firestore.claimGroupCareBatch(session, normPhone, eligible, session.batchSize || 3, name);
    } catch (e: any) {
      setError(e.message || 'Error assigning group members');
    } finally {
      setIsLoading(false);
    }
  };

  const handleLogContact = async (status: 'contacted' | 'no-answer') => {
    if (!activeSlot) return;
    setIsSubmitting(true);
    try {
      const fullNotes = `[${selectedCategory}] ${notes.trim()}`;
      await firestore.updateGroupCareSlot(activeSlot.id, {
        status,
        notes: fullNotes,
        completedAt: Date.now(),
        noAnswerUntil: status === 'no-answer' ? Date.now() + 24 * 60 * 60 * 1000 : null,
      });

      setNotes('');
      setCompletedCount(prev => prev + 1);

      // Fetch next member in batch if available, otherwise claim next batch
      if (session && volunteerPhone) {
        const eligible = session.eligiblePeople || [];
        await firestore.claimGroupCareBatch(session, volunteerPhone, eligible, session.batchSize || 3, volunteerName);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleEndSession = async () => {
    if (session && volunteerPhone) {
      await firestore.releasePendingGroupCareSlots(session.id, volunteerPhone);
    }
    localStorage.removeItem(`group_care_leader_phone_${sessionId}`);
    setVolunteerPhone(null);
    setActiveSlot(null);
  };

  if (isLoading && !session) {
    return (
      <Shell>
        <div className="text-center py-16">
          <Loader2 size={32} className="mx-auto text-indigo-500 animate-spin mb-4" />
          <p className="text-xs text-slate-400 font-medium">Loading Group Care session...</p>
        </div>
      </Shell>
    );
  }

  if (!session) {
    return (
      <Shell>
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg border border-slate-100">
          <AlertTriangle size={36} className="mx-auto text-amber-500 mb-3" />
          <h2 className="text-lg font-black text-slate-900 mb-1">Session Not Found</h2>
          <p className="text-xs text-slate-500">This Group Care session does not exist or has been removed.</p>
        </div>
      </Shell>
    );
  }

  if (!session.isActive) {
    return (
      <Shell sessionName={session.name}>
        <div className="bg-white rounded-3xl p-8 text-center shadow-lg border border-slate-100">
          <CheckCircle2 size={36} className="mx-auto text-emerald-500 mb-3" />
          <h2 className="text-lg font-black text-slate-900 mb-1">Session Completed</h2>
          <p className="text-xs text-slate-500">This Group Care outreach session has ended. Thank you for your leadership!</p>
        </div>
      </Shell>
    );
  }

  if (!volunteerPhone) {
    return (
      <Shell sessionName={session.name}>
        <PhoneStep
          sessionName={session.name}
          onSubmit={handlePhoneSubmit}
          isLoading={isLoading}
          error={error}
        />
      </Shell>
    );
  }

  return (
    <Shell sessionName={session.name} onEnd={handleEndSession}>
      {activeSlot ? (
        <div className="space-y-6">
          {/* Member Card */}
          <div className="bg-white rounded-3xl p-6 shadow-xl border border-slate-100">
            <div className="flex items-center justify-between mb-4">
              <span className="px-3 py-1 bg-indigo-50 text-indigo-700 text-[10px] font-bold rounded-full uppercase tracking-wider">
                {activeSlot.groupName}
              </span>
              <span className="text-[10px] font-bold text-slate-400">
                Logged: {completedCount}
              </span>
            </div>

            <h2 className="text-2xl font-black text-slate-900 text-center mb-1">
              {activeSlot.assignedPersonName}
            </h2>
            <p className="text-xs text-slate-400 text-center mb-6">Group Member</p>

            {/* Communication Action Buttons */}
            <div className="grid grid-cols-2 gap-3 mb-6">
              {activeSlot.assignedPersonPhone ? (
                <>
                  <a
                    href={`tel:${activeSlot.assignedPersonPhone}`}
                    className="flex items-center justify-center gap-2 p-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-emerald-200 transition-all"
                  >
                    <Phone size={16} /> Call Member
                  </a>
                  <a
                    href={`sms:${activeSlot.assignedPersonPhone}`}
                    className="flex items-center justify-center gap-2 p-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl text-xs font-bold shadow-md shadow-indigo-200 transition-all"
                  >
                    <MessageSquare size={16} /> Text Member
                  </a>
                </>
              ) : (
                <div className="col-span-2 text-center text-xs text-slate-400 italic p-3 bg-slate-50 rounded-xl">
                  No phone number listed
                </div>
              )}
            </div>

            {/* Call Script & Talking Points */}
            <div className="p-4 bg-indigo-50/70 border border-indigo-100 rounded-2xl mb-6">
              <p className="text-[10px] font-bold uppercase tracking-wider text-indigo-500 mb-1 flex items-center gap-1.5">
                <MessageSquare size={12} className="text-indigo-600" /> Recommended Call Script & Talking Points
              </p>
              <p className="text-xs text-indigo-950 leading-relaxed font-medium whitespace-pre-line">
                {renderCallScript(session.customScript, {
                  churchName: session.churchName,
                  callerName: volunteerName || 'Group Leader',
                  personName: activeSlot.assignedPersonName.split(' ')[0],
                })}
              </p>
            </div>

            {/* Note & Outcome Form */}
            <div className="space-y-4 pt-2 border-t border-slate-100">
              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-2">
                  Care Category
                </label>
                <div className="flex flex-wrap gap-2">
                  {NOTE_CATEGORIES.map(cat => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-all ${
                        selectedCategory === cat
                          ? 'bg-indigo-600 text-white shadow-md shadow-indigo-200'
                          : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block mb-1">
                  Care Notes / Prayer Requests
                </label>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Enter details from your conversation..."
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-2xl text-xs text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleLogContact('no-answer')}
                  className="py-3 px-4 bg-amber-500 hover:bg-amber-600 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-amber-200"
                >
                  <PhoneOff size={16} /> No Answer
                </button>
                <button
                  type="button"
                  disabled={isSubmitting}
                  onClick={() => handleLogContact('contacted')}
                  className="py-3 px-4 bg-emerald-600 hover:bg-emerald-700 text-white rounded-2xl text-xs font-bold flex items-center justify-center gap-2 transition-all shadow-md shadow-emerald-200"
                >
                  <CheckCircle2 size={16} /> Contacted
                </button>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Queue Empty Screen */
        <div className="bg-white rounded-3xl p-8 text-center shadow-xl border border-slate-100 space-y-4">
          <Award size={48} className="mx-auto text-indigo-600" />
          <h2 className="text-xl font-black text-slate-900">All Set for Now!</h2>
          <p className="text-xs text-slate-500">
            You've completed your assigned care contacts for this session. Great job reaching out to your group members!
          </p>
          <div className="p-4 bg-indigo-50 rounded-2xl text-indigo-700 text-xs font-bold">
            Total Contacts Made: {completedCount}
          </div>
          <button
            onClick={handleEndSession}
            className="w-full py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-2xl transition-colors"
          >
            Exit Group Care Session
          </button>
        </div>
      )}
    </Shell>
  );
};
