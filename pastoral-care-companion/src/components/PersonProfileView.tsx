import React, { useState, useEffect } from 'react';
import { PcoPerson, User, PastoralNote, PcoGroup, PrayerRequest, DetailedDonation } from '../types';
import { firestore } from '../services/firestoreService';
import { 
  Phone, MessageSquare, MapPin, Calendar, 
  Plus, X, Mail, Loader2, Sparkles, CalendarCheck,
  ShieldAlert, Activity, HeartHandshake, Users,
  Church as ChurchIcon, DollarSign, Heart, Clock, Tag,
  CheckSquare
} from 'lucide-react';

function getEngagementStatus(person: PcoPerson): string {
  if (person.engagementStatus) return person.engagementStatus;
  const count = person.checkInCount || 0;
  if (count > 8) return 'Core';
  if (count >= 4) return 'Regular';
  if (count > 0) return 'Sporadic';
  return 'Inactive';
}

function getEngagementBadgeColor(status: string): string {
  switch (status) {
    case 'Core':
      return 'bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 border-indigo-100 dark:border-indigo-900/30';
    case 'Regular':
      return 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-900/30';
    case 'Sporadic':
      return 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30';
    case 'Inactive':
    default:
      return 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700';
  }
}

function getRiskBadgeColor(category?: string): string {
  switch (category) {
    case 'Healthy':
      return 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30';
    case 'At Risk':
      return 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400 border-amber-100 dark:border-amber-900/30';
    case 'Disconnected':
    default:
      return 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border-rose-100 dark:border-rose-900/30';
  }
}

function formatDate(dateStr?: string | null): string {
  if (!dateStr) return 'Not recorded';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatCurrency(amount: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(amount);
}

export function canViewGiving(user?: User | null): boolean {
  if (!user || !user.roles) return false;
  return user.roles.some((role: string) => 
    role === 'System Administration' ||
    role === 'Church Admin' ||
    role === 'Pastor' ||
    role === 'Giving' ||
    role === 'Finance'
  );
}

export function getPersonEmail(person?: PcoPerson | null): string | null {
  if (!person) return null;
  if (person.email && typeof person.email === 'string' && person.email.trim().length > 0) {
    return person.email.trim();
  }
  if (Array.isArray(person.emails) && person.emails.length > 0) {
    const primaryObj = person.emails.find((e: any) => e?.primary && e?.address);
    if (primaryObj?.address) return primaryObj.address.trim();
    const firstObj = person.emails.find((e: any) => e?.address);
    if (firstObj?.address) return firstObj.address.trim();
    const firstStr = person.emails.find((e: any) => typeof e === 'string' && e.trim().length > 0);
    if (firstStr) return (firstStr as string).trim();
  }
  return null;
}

export function getPersonPhone(person?: PcoPerson | null): string | null {
  if (!person) return null;
  if (person.phone && typeof person.phone === 'string' && person.phone.trim().length > 0) {
    return person.phone.trim();
  }
  if (person.e164Phone && typeof person.e164Phone === 'string' && person.e164Phone.trim().length > 0) {
    return person.e164Phone.trim();
  }
  if (Array.isArray(person.phoneNumbers) && person.phoneNumbers.length > 0) {
    const primaryObj = person.phoneNumbers.find((p: any) => p?.primary && p?.number);
    if (primaryObj?.number) return primaryObj.number.trim();
    const firstObj = person.phoneNumbers.find((p: any) => p?.number);
    if (firstObj?.number) return firstObj.number.trim();
  }
  return null;
}

interface PersonProfileViewProps {
  person: PcoPerson;
  onClose: () => void;
  churchId: string;
  currentUser: User;
  onAddNote?: (note: PastoralNote) => void;
  people?: PcoPerson[];
  onSelectPerson?: (person: PcoPerson) => void;
}

export const PersonProfileView: React.FC<PersonProfileViewProps> = ({ 
  person, onClose, churchId, currentUser, onAddNote, people = [], onSelectPerson
}) => {
  const [notes, setNotes] = useState<PastoralNote[]>([]);
  const [groups, setGroups] = useState<PcoGroup[]>([]);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [donations, setDonations] = useState<DetailedDonation[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState<PastoralNote['type']>('Note');
  const [followUpDate, setFollowUpDate] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  const canAccessGiving = canViewGiving(currentUser);

  // Load notes, groups, prayer requests, and donations on mount/change
  useEffect(() => {
    const fetchExtraData = async () => {
      setLoadingNotes(true);
      try {
        const [list, fetchedGroups, fetchedPrayers, fetchedDonations] = await Promise.all([
          firestore.getPastoralNotes(churchId, person.id),
          firestore.getGroups(churchId),
          firestore.getPrayerRequests(churchId),
          canAccessGiving ? firestore.getDetailedDonations(churchId) : Promise.resolve([]),
        ]);
        setNotes(list);
        setGroups(fetchedGroups);
        setPrayerRequests(fetchedPrayers);
        setDonations(fetchedDonations || []);
      } catch (e) {
        console.error("Failed to load profile data:", e);
      } finally {
        setLoadingNotes(false);
      }
    };
    fetchExtraData();
  }, [churchId, person.id, canAccessGiving]);

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!noteContent.trim() || savingNote) return;

    setSavingNote(true);
    const newNote: PastoralNote = {
      id: `${churchId}_note_${Date.now()}`,
      churchId,
      personId: person.id,
      personName: person.name,
      authorId: currentUser.id,
      authorName: currentUser.name || 'Staff',
      date: new Date().toISOString(),
      type: noteType,
      content: noteContent.trim(),
      followUpDate: followUpDate || undefined,
      isCompleted: false
    };

    try {
      await firestore.savePastoralNote(newNote);
      setNotes(prev => [newNote, ...prev]);
      if (onAddNote) {
        onAddNote(newNote);
      }
      setNoteContent('');
      setFollowUpDate('');
      setNoteType('Note');
      alert("Note successfully added!");
    } catch (e) {
      console.error("Failed to save note:", e);
      alert("Error saving note.");
    } finally {
      setSavingNote(false);
    }
  };

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase();
  };

  const formatPhone = (phoneNum?: string) => {
    if (!phoneNum) return '';
    const digits = phoneNum.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phoneNum;
  };

  const riskProfile = person.riskProfile || (person.historicRiskCategory ? {
    category: person.historicRiskCategory as 'Healthy' | 'At Risk' | 'Disconnected',
    score: person.historicRiskScore ?? 0,
    factors: []
  } : undefined);
  const engagementStatus = getEngagementStatus(person);
  const timesServed = person.servingStats?.last90DaysCount ?? 0;
  const servingStats = person.servingStats;

  // Contact resolution
  const resolvedEmail = getPersonEmail(person);
  const resolvedPhone = getPersonPhone(person);

  // Household members
  const householdMembers = person.householdId 
    ? people.filter(m => m.householdId === person.householdId && m.id !== person.id) 
    : [];

  // Groups
  const personGroups = groups.filter(g => 
    person.groupIds?.includes(g.id) || 
    g.memberIds?.includes(person.id) || 
    g.leaderIds?.includes(person.id)
  );

  // Prayer requests
  const personPrayerRequests = prayerRequests.filter(pr => 
    pr.personId === person.id || 
    (pr.personName && person.name && pr.personName.toLowerCase() === person.name.toLowerCase())
  );

  // Donations & Giving calculation
  const personDonations = donations.filter(d => 
    (person?.id && String(d.donorId) === String(person.id)) ||
    (person?.id && d.id?.startsWith(`${person.id}_`)) ||
    (person?.name && d.donorName && d.donorName.toLowerCase() === person.name.toLowerCase())
  );

  const totalDonationsAmount = personDonations.reduce((sum, d) => sum + (d.amount || 0), 0);

  const now = new Date();
  const startOfYear = new Date(now.getFullYear(), 0, 1).toISOString().slice(0, 10);
  const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);

  const ytdFromDonations = personDonations
    .filter(d => d.date && d.date >= startOfYear)
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  const monthlyFromDonations = personDonations
    .filter(d => d.date && d.date >= startOfMonth)
    .reduce((sum, d) => sum + (d.amount || 0), 0);

  const effectiveYtd = (person?.givingStats?.ytd && person.givingStats.ytd > 0)
    ? person.givingStats.ytd
    : (ytdFromDonations > 0 ? ytdFromDonations : totalDonationsAmount);

  const effectiveMonthly = (person?.givingStats?.monthly && person.givingStats.monthly > 0)
    ? person.givingStats.monthly
    : monthlyFromDonations;

  const hasRecurring = personDonations.some(d => d.isRecurring);
  const isDonor = !!(
    person?.isDonor || 
    personDonations.length > 0 || 
    effectiveYtd > 0 || 
    (person?.givingStats && (person.givingStats.ytd > 0 || person.givingStats.monthly > 0 || person.givingStats.weekly > 0))
  );

  const recentDonations = [...personDonations].sort((a, b) => (b.date || '').localeCompare(a.date || ''));
  const lastDonation = recentDonations[0];

  // Touchpoint date calculation
  const lastTouchpointDate = notes.length > 0 ? new Date(notes[0].date) : null;
  const daysSinceLastTouchpoint = lastTouchpointDate 
    ? Math.max(0, Math.floor((Date.now() - lastTouchpointDate.getTime()) / (1000 * 60 * 60 * 24)))
    : null;

  const handleTogglePrayerAnswered = async (pr: PrayerRequest) => {
    const nextStatus = pr.status === 'Answered' ? 'Active' : 'Answered';
    const updated: PrayerRequest = { ...pr, status: nextStatus };
    try {
      await firestore.savePrayerRequest(updated);
      setPrayerRequests(prev => prev.map(p => p.id === pr.id ? updated : p));
    } catch (e) {
      console.error("Failed to update prayer request:", e);
    }
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full h-[90vh] bg-slate-50 dark:bg-zinc-950 rounded-t-[2.5rem] p-6 shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-250">
        {/* Grab Bar */}
        <div className="w-12 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full mx-auto mb-5 shrink-0" />

        {/* Profile Header */}
        <div className="flex justify-between items-start mb-4 shrink-0">
          <div className="flex items-center gap-3">
            {person.avatar ? (
              <img
                src={person.avatar}
                alt={person.name}
                className="w-14 h-14 rounded-full object-cover bg-slate-100 border-2 border-white shadow-md"
              />
            ) : (
              <div className="w-14 h-14 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-base shadow-sm border border-indigo-100 dark:border-indigo-900/30">
                {getInitials(person.name)}
              </div>
            )}
            <div>
              <h2 className="text-lg font-black tracking-tight">{person.name}</h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-0.5">
                <span className="px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 border border-indigo-100 dark:border-indigo-900/20">
                  {person.membership || person.status || 'Contact'}
                </span>
                <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${getEngagementBadgeColor(engagementStatus)}`}>
                  {engagementStatus}
                </span>
                {riskProfile && (
                  <span className={`px-1.5 py-0.5 rounded text-[9px] font-black uppercase tracking-wider border ${getRiskBadgeColor(riskProfile.category)}`}>
                    {riskProfile.category} ({riskProfile.score})
                  </span>
                )}
                {person.gender && (
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold">• {person.gender}</span>
                )}
                {person.age != null && (
                  <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold">• Age {person.age}</span>
                )}
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700"
          >
            <X size={16} />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pb-6">

          {/* ── Care Cadence & Touchpoint Banner ── */}
          <div className={`p-3 rounded-2xl border flex items-center justify-between gap-2.5 text-xs ${
            daysSinceLastTouchpoint === null ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300' :
            daysSinceLastTouchpoint <= 30 ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-300' :
            daysSinceLastTouchpoint <= 60 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300' :
            'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/30 text-rose-800 dark:text-rose-300'
          }`}>
            <div className="flex items-center gap-2 min-w-0">
              <Clock size={15} className="shrink-0" />
              <div className="min-w-0">
                <p className="font-black text-[11px] leading-tight">
                  {daysSinceLastTouchpoint === null 
                    ? 'No pastoral contact logged yet'
                    : `Last touchpoint ${daysSinceLastTouchpoint === 0 ? 'today' : `${daysSinceLastTouchpoint} day${daysSinceLastTouchpoint > 1 ? 's' : ''} ago`}`}
                </p>
                {notes.length > 0 && (
                  <p className="text-[10px] opacity-80 truncate leading-none mt-0.5">
                    {notes[0].type} on {formatDate(notes[0].date)} by {notes[0].authorName}
                  </p>
                )}
              </div>
            </div>
            {person.primaryCampusName && (
              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white dark:bg-zinc-800 shrink-0 border border-current">
                🏛️ {person.primaryCampusName}
              </span>
            )}
          </div>

          {/* ── Status & Engagement Overview Grid ── */}
          <div className="grid grid-cols-3 gap-2">
            {/* Risk Profile Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3 border border-slate-200/50 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                  <ShieldAlert size={11} className="text-indigo-500" />
                  Risk
                </span>
              </div>
              <div>
                <span className={`text-base min-[375px]:text-lg font-black ${
                  riskProfile?.category === 'Healthy' ? 'text-emerald-600 dark:text-emerald-400' :
                  riskProfile?.category === 'At Risk' ? 'text-amber-600 dark:text-amber-400' :
                  riskProfile ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                }`}>
                  {riskProfile ? riskProfile.score : 'N/A'}
                </span>
                <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-bold ml-1">/100</span>
              </div>
              <span className={`text-[8px] font-black uppercase tracking-wider px-1 py-0.5 rounded border inline-block mt-1 truncate ${getRiskBadgeColor(riskProfile?.category)}`}>
                {riskProfile?.category || 'No Data'}
              </span>
            </div>

            {/* Engagement Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3 border border-slate-200/50 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                  <Activity size={11} className="text-indigo-500" />
                  Engage
                </span>
              </div>
              <div>
                <span className="text-sm min-[375px]:text-base font-black text-slate-900 dark:text-white truncate block">
                  {engagementStatus}
                </span>
              </div>
              <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-bold mt-1 truncate">
                {person.checkInCount ? `${person.checkInCount} check-in${person.checkInCount > 1 ? 's' : ''}` : '0 check-ins'}
              </span>
            </div>

            {/* Served Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3 border border-slate-200/50 dark:border-zinc-800 shadow-sm flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-1">
                <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest flex items-center gap-1">
                  <HeartHandshake size={11} className="text-indigo-500" />
                  Served
                </span>
              </div>
              <div>
                <span className="text-base min-[375px]:text-lg font-black text-slate-900 dark:text-white">
                  {timesServed}x
                </span>
              </div>
              <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-bold mt-1 truncate">
                {timesServed > 0 ? 'Last 90 days' : '0 in 90 days'}
              </span>
            </div>
          </div>

          {/* Risk Factors & Serving Details (if available) */}
          {(riskProfile?.factors?.length || servingStats?.recentServices?.length || servingStats?.nextServiceDate) && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-3.5 border border-slate-200/50 dark:border-zinc-800 space-y-2.5 shadow-sm text-xs">
              {riskProfile?.factors && riskProfile.factors.length > 0 && (
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest block mb-1.5">
                    Risk Factors Triggered:
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {riskProfile.factors.map((f, i) => (
                      <span key={i} className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-rose-50 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/20">
                        {f}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {servingStats && (
                <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex justify-between items-center text-[10px] font-bold text-slate-500 dark:text-zinc-400">
                  <span>Avg per week: <span className="text-slate-800 dark:text-zinc-200">{servingStats.timesPerWeek ?? (timesServed / (90 / 7)).toFixed(2)}x</span></span>
                  {servingStats.nextServiceDate ? (
                    <span className="text-indigo-600 dark:text-indigo-400">Next: {new Date(servingStats.nextServiceDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                  ) : (
                    <span>Next: None scheduled</span>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ── Spiritual Milestones ── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200/50 dark:border-zinc-800 space-y-3 shadow-sm">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
              <Sparkles size={13} className="text-amber-500" />
              Spiritual Milestones
            </h3>
            <div className="grid grid-cols-2 min-[375px]:grid-cols-3 gap-2">
              <div className="bg-slate-50 dark:bg-zinc-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-800">
                <span className="text-[9px] font-black text-slate-400 uppercase block">✝️ Salvation</span>
                <span className="font-bold text-xs text-slate-800 dark:text-zinc-200 mt-0.5 block truncate">
                  {formatDate(person.salvationDate)}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-zinc-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-800">
                <span className="text-[9px] font-black text-slate-400 uppercase block">💧 Baptism</span>
                <span className="font-bold text-xs text-slate-800 dark:text-zinc-200 mt-0.5 block truncate">
                  {formatDate(person.baptismDate)}
                </span>
              </div>
              <div className="bg-slate-50 dark:bg-zinc-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-800 col-span-2 min-[375px]:col-span-1">
                <span className="text-[9px] font-black text-slate-400 uppercase block">🏛️ Membership</span>
                <span className="font-bold text-xs text-slate-800 dark:text-zinc-200 mt-0.5 block truncate">
                  {person.membership || 'Contact'}
                </span>
              </div>
            </div>
          </div>

          {/* ── Household & Family ── */}
          {(person.householdName || householdMembers.length > 0) && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200/50 dark:border-zinc-800 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <Users size={13} className="text-indigo-500" />
                  {person.householdName || 'Household Members'}
                </h3>
                {householdMembers.length > 0 && (
                  <span className="text-[9px] font-black bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-full">
                    {householdMembers.length + 1} Members
                  </span>
                )}
              </div>
              {householdMembers.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No other household members recorded.</p>
              ) : (
                <div className="grid grid-cols-1 gap-2">
                  {householdMembers.map(m => (
                    <button
                      key={m.id}
                      onClick={() => onSelectPerson && onSelectPerson(m)}
                      className="flex items-center gap-2.5 p-2 bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-slate-100 dark:border-zinc-800 hover:border-indigo-300 dark:hover:border-indigo-700 transition text-left cursor-pointer active:scale-98"
                    >
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 dark:bg-zinc-700 shrink-0">
                        {m.avatar ? (
                          <img src={m.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-black text-slate-400 text-xs">
                            {m.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 dark:text-zinc-200 truncate">
                          {m.name}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {m.membership || m.status || 'Family Member'}{m.age ? ` • Age ${m.age}` : ''}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Small Groups ── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200/50 dark:border-zinc-800 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Users size={13} className="text-purple-500" />
                Small Groups
              </h3>
              {personGroups.length > 0 && (
                <span className="text-[9px] font-black bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 px-2 py-0.5 rounded-full">
                  {personGroups.length} Group{personGroups.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {personGroups.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Not enrolled in any small groups.</p>
            ) : (
              <div className="space-y-1.5">
                {personGroups.map(g => {
                  const isLeader = g.leaderIds?.includes(person.id);
                  return (
                    <div key={g.id} className="flex justify-between items-center bg-slate-50 dark:bg-zinc-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-800 text-xs">
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-slate-800 dark:text-zinc-200 block truncate">{g.name}</span>
                        <span className="text-[10px] text-slate-400">{g.groupTypeName || 'Group'}{g.membersCount ? ` • ${g.membersCount} members` : ''}</span>
                      </div>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                        isLeader 
                          ? 'bg-amber-50 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400 border-amber-200 dark:border-amber-900/30'
                          : 'bg-slate-100 text-slate-600 dark:bg-zinc-700 dark:text-zinc-300 border-slate-200 dark:border-zinc-600'
                      }`}>
                        {isLeader ? 'Leader' : 'Member'}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* ── Giving Health (Gated by Permission) ── */}
          {canAccessGiving && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200/50 dark:border-zinc-800 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <DollarSign size={13} className="text-emerald-500" />
                  Giving Health
                </h3>
                <span className={`text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  hasRecurring
                    ? 'bg-purple-50 dark:bg-purple-950/40 text-purple-600 dark:text-purple-400 border-purple-100 dark:border-purple-900/30'
                    : isDonor 
                      ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border-emerald-100 dark:border-emerald-900/30'
                      : 'bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 border-slate-200 dark:border-zinc-700'
                }`}>
                  {hasRecurring ? 'Recurring Giver' : isDonor ? 'Active Contributor' : 'Non-Giver'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-slate-50 dark:bg-zinc-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-800">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">YTD Contributions</span>
                  <span className="font-bold text-xs text-slate-800 dark:text-zinc-200 mt-0.5 block truncate">
                    {effectiveYtd > 0 ? formatCurrency(effectiveYtd) : (effectiveMonthly > 0 ? `${formatCurrency(effectiveMonthly)}/mo` : 'No gifts YTD')}
                  </span>
                </div>
                <div className="bg-slate-50 dark:bg-zinc-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-800">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Latest Contribution</span>
                  <span className="font-bold text-xs text-slate-800 dark:text-zinc-200 mt-0.5 block truncate">
                    {lastDonation ? `${formatCurrency(lastDonation.amount)} (${formatDate(lastDonation.date)})` : (isDonor ? 'Active Giver' : 'None logged')}
                  </span>
                </div>
              </div>
              {recentDonations.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-[9px] font-black text-slate-400 uppercase block">Recent Gifts:</span>
                  <div className="space-y-1">
                    {recentDonations.slice(0, 3).map((d, i) => (
                      <div key={d.id || i} className="flex justify-between items-center bg-slate-50 dark:bg-zinc-800/60 px-2.5 py-1 rounded-xl text-xs border border-slate-100 dark:border-zinc-800">
                        <span className="text-[11px] font-medium text-slate-700 dark:text-zinc-300 truncate">{d.fundName || 'General Fund'}</span>
                        <span className="text-[11px] font-bold text-slate-800 dark:text-zinc-200 shrink-0 ml-1">
                          {formatCurrency(d.amount)} <span className="text-[9px] text-slate-400 font-normal">({formatDate(d.date)})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Prayer Requests ── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200/50 dark:border-zinc-800 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Heart size={13} className="text-rose-500" />
                Prayer Requests
              </h3>
              {personPrayerRequests.length > 0 && (
                <span className="text-[9px] font-black bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded-full">
                  {personPrayerRequests.filter(pr => pr.status === 'Active').length} Active
                </span>
              )}
            </div>
            {personPrayerRequests.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No prayer requests recorded.</p>
            ) : (
              <div className="space-y-2">
                {personPrayerRequests.map(pr => (
                  <div key={pr.id} className="bg-slate-50 dark:bg-zinc-800/60 p-3 rounded-xl border border-slate-100 dark:border-zinc-800 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-full ${
                        pr.status === 'Answered' 
                          ? 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-100 dark:border-emerald-900/30'
                          : 'bg-rose-50 dark:bg-rose-950/40 text-rose-600 dark:text-rose-400 border border-rose-100 dark:border-rose-900/30'
                      }`}>
                        {pr.status}
                      </span>
                      <span className="text-[10px] text-slate-400">{formatDate(pr.date)}</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-zinc-300 font-medium">
                      {pr.request}
                    </p>
                    <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-zinc-800">
                      <span className="text-[10px] text-slate-400">{pr.category || 'General'}</span>
                      <button
                        onClick={() => handleTogglePrayerAnswered(pr)}
                        className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        <CheckSquare size={12} />
                        {pr.status === 'Answered' ? 'Re-open' : 'Mark Answered'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Custom Field Data ── */}
          {person.field_data && person.field_data.length > 0 && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200/50 dark:border-zinc-800 space-y-3 shadow-sm">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <Tag size={13} className="text-indigo-500" />
                Custom Profile Attributes
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {person.field_data.map((f, idx) => (
                  <div key={idx} className="bg-slate-50 dark:bg-zinc-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-800 text-xs">
                    <span className="text-[9px] text-slate-400 font-black uppercase block truncate">{f.field_definition?.name || 'Custom Field'}</span>
                    <span className="font-bold text-slate-800 dark:text-zinc-200 mt-0.5 block truncate">{f.value || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
          
          {/* Key details box */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200/50 dark:border-zinc-800 space-y-3 shadow-sm">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Key Profile Data</h3>
            
            {resolvedPhone ? (
              <div className="flex items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2.5 min-w-0">
                  <Phone size={14} className="text-indigo-500 shrink-0" />
                  <a href={`tel:${resolvedPhone}`} className="font-bold text-indigo-600 dark:text-indigo-400 hover:underline truncate">
                    {formatPhone(resolvedPhone)}
                  </a>
                </div>
                <div className="flex gap-1.5 shrink-0">
                  <a
                    href={`tel:${resolvedPhone}`}
                    className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100/10 text-[9px] font-black tracking-widest text-emerald-600 dark:text-emerald-400 uppercase rounded-lg active:scale-95 transition"
                  >
                    Call
                  </a>
                  <a
                    href={`sms:${resolvedPhone}`}
                    className="px-2.5 py-1.5 bg-indigo-50 dark:bg-indigo-950/20 border border-indigo-100/10 text-[9px] font-black tracking-widest text-indigo-600 dark:text-indigo-400 uppercase rounded-lg active:scale-95 transition"
                  >
                    Text
                  </a>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-xs min-w-0 text-slate-400 dark:text-zinc-500 italic">
                <Phone size={14} className="text-slate-300 dark:text-zinc-600 shrink-0" />
                <span>No phone number</span>
              </div>
            )}

            {resolvedEmail ? (
              <div className="flex items-center gap-2.5 text-xs min-w-0">
                <Mail size={14} className="text-indigo-500 shrink-0" />
                <a href={`mailto:${resolvedEmail}`} className="font-bold text-slate-700 dark:text-zinc-300 hover:underline truncate">
                  {resolvedEmail}
                </a>
              </div>
            ) : (
              <div className="flex items-center gap-2.5 text-xs min-w-0 text-slate-400 dark:text-zinc-500 italic">
                <Mail size={14} className="text-slate-300 dark:text-zinc-600 shrink-0" />
                <span>No email address</span>
              </div>
            )}

            {person.addresses && person.addresses[0] && (
              <div className="flex items-start justify-between gap-2 text-xs">
                <div className="flex items-start gap-2.5 min-w-0">
                  <MapPin size={14} className="text-indigo-500 shrink-0 mt-0.5" />
                  <div className="font-medium text-slate-500 dark:text-zinc-400">
                    <p>{person.addresses[0].street}</p>
                    <p>{person.addresses[0].city}, {person.addresses[0].state} {person.addresses[0].zip}</p>
                  </div>
                </div>
                <button
                  onClick={() => {
                    const addr = person.addresses![0];
                    const lat = addr.lat;
                    const lng = addr.lng;
                    const queryStr = encodeURIComponent(`${addr.street || ''}, ${addr.city || ''}, ${addr.state || ''} ${addr.zip || ''}`);
                    const url = (lat != null && lng != null)
                      ? `https://maps.apple.com/?daddr=${lat},${lng}`
                      : `https://maps.apple.com/?daddr=${queryStr}`;
                    window.open(url, '_system');
                  }}
                  className="px-2.5 py-1.5 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100/10 text-[9px] font-black tracking-widest text-emerald-600 dark:text-emerald-400 uppercase rounded-lg active:scale-95 transition shrink-0 self-center"
                >
                  Navigate
                </button>
              </div>
            )}

            {(person.birthdate || person.anniversary) && (
              <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs pt-1 border-t border-slate-100 dark:border-zinc-800">
                {person.birthdate && (
                  <p className="font-semibold text-slate-500 dark:text-zinc-400">
                    🎂 Bday: <span className="font-bold text-slate-800 dark:text-zinc-200">{person.birthdate}</span>
                  </p>
                )}
                {person.anniversary && (
                  <p className="font-semibold text-slate-500 dark:text-zinc-400">
                    💍 Anniv: <span className="font-bold text-slate-800 dark:text-zinc-200">{person.anniversary}</span>
                  </p>
                )}
              </div>
            )}
          </div>

          {/* Add Care Note */}
          <div className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-slate-200/50 dark:border-zinc-800 shadow-sm space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Compose Care Note</h3>
              <Sparkles size={14} className="text-indigo-500 animate-pulse" />
            </div>

            <form onSubmit={handleAddNote} className="space-y-4">
              <div className="flex flex-wrap gap-1.5">
                {(['Note', 'Call', 'Visit', 'Meeting', 'Crisis', 'Hospital'] as PastoralNote['type'][]).map(type => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setNoteType(type)}
                    className={`px-3 py-1.5 rounded-lg text-[10px] font-bold tracking-wider uppercase transition ${noteType === type ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'}`}
                  >
                    {type}
                  </button>
                ))}
              </div>

              <div>
                <textarea
                  value={noteContent}
                  onChange={e => setNoteContent(e.target.value)}
                  placeholder={`Enter notes regarding this ${noteType.toLowerCase()}...`}
                  required
                  rows={3}
                  className="w-full p-3 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400/50 text-xs font-bold text-slate-800 dark:text-zinc-100 placeholder:font-medium placeholder:text-slate-400 resize-none transition"
                />
              </div>

              <div className="flex flex-col min-[350px]:flex-row justify-between items-start min-[350px]:items-center gap-2">
                <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-400 dark:text-zinc-500">
                  <CalendarCheck size={14} className="text-indigo-500" />
                  <span>SCHEDULE FOLLOW-UP:</span>
                </div>
                <input
                  type="date"
                  value={followUpDate}
                  onChange={e => setFollowUpDate(e.target.value)}
                  className="text-xs p-2 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-xl font-bold text-slate-800 dark:text-zinc-100 outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <button
                type="submit"
                disabled={savingNote || !noteContent.trim()}
                className="w-full flex items-center justify-center gap-1.5 p-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-100 dark:shadow-none transition active:scale-[0.98]"
              >
                {savingNote ? 'Saving Entry...' : (
                  <>
                    <Plus size={14} /> Add Care Note
                  </>
                )}
              </button>
            </form>
          </div>

          {/* Historical Logs */}
          <div className="space-y-4">
            <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest leading-none mb-2 px-1">Historical Logs</h3>
            
            {loadingNotes ? (
              <div className="flex justify-center items-center py-10">
                <Loader2 className="w-5 h-5 animate-spin text-slate-400" />
              </div>
            ) : notes.length === 0 ? (
              <div className="bg-white dark:bg-zinc-900 border border-slate-200/50 dark:border-zinc-800 rounded-2xl p-6 text-center text-slate-400 text-xs">
                No historical logs recorded.
              </div>
            ) : (
              <div className="space-y-3">
                {notes.map(n => (
                  <div 
                    key={n.id}
                    className="bg-white dark:bg-zinc-900 border border-slate-200/50 dark:border-zinc-800 rounded-2xl p-4 shadow-sm relative overflow-hidden"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-wider ${
                        n.type === 'Crisis' ? 'bg-rose-100 dark:bg-rose-950/40 text-rose-600' :
                        n.type === 'Hospital' ? 'bg-amber-100 dark:bg-amber-950/40 text-amber-600' :
                        n.type === 'Call' ? 'bg-emerald-100 dark:bg-emerald-950/40 text-emerald-600' :
                        'bg-slate-100 dark:bg-zinc-800 text-slate-500'
                      }`}>
                        {n.type}
                      </span>
                      <span className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold">
                        {new Date(n.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
                      </span>
                    </div>

                    <p className="text-xs text-slate-700 dark:text-zinc-300 font-medium whitespace-pre-line leading-relaxed">
                      {n.content}
                    </p>

                    <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-slate-100 dark:border-zinc-800/60 text-[10px] text-slate-400 dark:text-zinc-500 font-bold">
                      <p>Logged by: <span className="text-slate-500 dark:text-zinc-400">{n.authorName}</span></p>
                      {n.followUpDate && (
                        <p className="text-indigo-600 dark:text-indigo-400 flex items-center gap-1">
                          <Calendar size={10} /> Follow-up: {n.followUpDate}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};
