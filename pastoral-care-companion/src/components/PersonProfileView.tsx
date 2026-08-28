import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { 
  PcoPerson, User, PastoralNote, PcoGroup, PrayerRequest, 
  DetailedDonation, ServicesTeam, PcoRegistrationEvent, PcoRegistrationAttendee,
  GiftsTestResponse, MbtiTestResponse, DiscTestResponse, RiskChangeRecord, OutreachSlot
} from '../types';
import { firestore } from '../services/firestoreService';
import { 
  Phone, MessageSquare, MapPin, Calendar, 
  Plus, X, Mail, Loader2, Sparkles, CalendarCheck,
  ShieldAlert, Activity, HeartHandshake, Users,
  Church as ChurchIcon, DollarSign, Heart, Clock, Tag,
  CheckSquare, Compass, Copy, ExternalLink, Check, Send,
  Award, Brain, NotebookPen, TrendingUp, History, ShieldCheck,
  AlertCircle, ChevronRight, User as UserIcon
} from 'lucide-react';
import { SPIRITUAL_GIFTS_DEFINITIONS, SPIRITUAL_GIFTS_QUESTIONS } from '../constants/spiritualGiftsTestData';
import { MBTI_TYPE_PROFILES, MBTI_QUESTIONS } from '../constants/mbtiTestData';
import { DISC_PROFILES, DISC_QUESTIONS, DISC_DIMENSIONS_INFO, DiscDimension } from '../constants/discTestData';
import { PastoralEngagementModal } from './PastoralEngagementModal';

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
  const emailsArr = (person as any).emails;
  if (Array.isArray(emailsArr) && emailsArr.length > 0) {
    const primaryObj = emailsArr.find((e: any) => e?.primary && e?.address);
    if (primaryObj?.address) return primaryObj.address.trim();
    const firstObj = emailsArr.find((e: any) => e?.address);
    if (firstObj?.address) return firstObj.address.trim();
    const firstStr = emailsArr.find((e: any) => typeof e === 'string' && e.trim().length > 0);
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
  const phonesArr = (person as any).phoneNumbers;
  if (Array.isArray(phonesArr) && phonesArr.length > 0) {
    const primaryObj = phonesArr.find((p: any) => p?.primary && p?.number);
    if (primaryObj?.number) return primaryObj.number.trim();
    const firstObj = phonesArr.find((p: any) => p?.number);
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
  const [teams, setTeams] = useState<ServicesTeam[]>([]);
  const [registrations, setRegistrations] = useState<PcoRegistrationEvent[]>([]);
  const [attendees, setAttendees] = useState<PcoRegistrationAttendee[]>([]);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [donations, setDonations] = useState<DetailedDonation[]>([]);
  const [timeline, setTimeline] = useState<RiskChangeRecord[]>([]);
  const [outreachSlots, setOutreachSlots] = useState<OutreachSlot[]>([]);
  const [loadingNotes, setLoadingNotes] = useState(false);
  const [noteContent, setNoteContent] = useState('');
  const [noteType, setNoteType] = useState<PastoralNote['type']>('Note');
  const [followUpDate, setFollowUpDate] = useState('');
  const [savingNote, setSavingNote] = useState(false);

  // Assessments state
  const [giftsResponses, setGiftsResponses] = useState<GiftsTestResponse[]>([]);
  const [selectedGiftsModal, setSelectedGiftsModal] = useState<GiftsTestResponse | null>(null);
  const [copiedGiftsLink, setCopiedGiftsLink] = useState(false);

  const [mbtiResponses, setMbtiResponses] = useState<MbtiTestResponse[]>([]);
  const [selectedMbtiModal, setSelectedMbtiModal] = useState<MbtiTestResponse | null>(null);
  const [copiedMbtiLink, setCopiedMbtiLink] = useState(false);

  const [discResponses, setDiscResponses] = useState<DiscTestResponse[]>([]);
  const [selectedDiscModal, setSelectedDiscModal] = useState<DiscTestResponse | null>(null);
  const [copiedDiscLink, setCopiedDiscLink] = useState(false);

  // Pastoral Strategy & Engagement Playbook Modal
  const [showEngagementModal, setShowEngagementModal] = useState<boolean>(false);

  // Suggestion state
  const [showNextStepsModal, setShowNextStepsModal] = useState<boolean>(false);
  const [selectedGroupSuggestion, setSelectedGroupSuggestion] = useState<string>('');
  const [selectedTeamSuggestion, setSelectedTeamSuggestion] = useState<string>('');
  const [selectedEventSuggestion, setSelectedEventSuggestion] = useState<string>('');
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  const canAccessGiving = canViewGiving(currentUser);

  // Load all profile, assessment, team, group, prayer, and donation data
  useEffect(() => {
    const fetchExtraData = async () => {
      setLoadingNotes(true);
      try {
        const [
          list, 
          fetchedGroups, 
          fetchedPrayers, 
          fetchedDonations, 
          fetchedTeams, 
          fetchedRegistrations, 
          fetchedAttendees,
          fetchedGifts,
          fetchedMbti,
          fetchedDisc,
          fetchedTimeline,
          fetchedSlots
        ] = await Promise.all([
          firestore.getPastoralNotes(churchId, person.id),
          firestore.getGroups(churchId),
          firestore.getPrayerRequests(churchId),
          canAccessGiving ? firestore.getDetailedDonations(churchId) : Promise.resolve([]),
          firestore.getServicesTeams(churchId),
          firestore.getRegistrations(churchId),
          firestore.getRegistrationAttendees(churchId),
          firestore.getGiftsTestResponses(churchId),
          firestore.getMbtiResponses(churchId),
          firestore.getDiscResponses(churchId),
          firestore.getPersonRiskTimeline(churchId, person.id),
          firestore.getPersonOutreachSlots(churchId, person.id)
        ]);

        setNotes(list);
        setGroups(fetchedGroups);
        setPrayerRequests(fetchedPrayers);
        setDonations(fetchedDonations || []);
        setTeams(fetchedTeams || []);
        setRegistrations(fetchedRegistrations || []);
        setAttendees(fetchedAttendees || []);
        setTimeline(fetchedTimeline || []);
        setOutreachSlots(fetchedSlots || []);

        const pEmail = getPersonEmail(person);
        const matchedGifts = (fetchedGifts || []).filter(g => 
          g.personId === person.id || 
          (pEmail && g.email && g.email.toLowerCase() === pEmail.toLowerCase())
        );
        setGiftsResponses(matchedGifts);

        const matchedMbti = (fetchedMbti || []).filter(m =>
          m.personId === person.id ||
          (pEmail && m.email && m.email.toLowerCase() === pEmail.toLowerCase())
        );
        setMbtiResponses(matchedMbti);

        const matchedDisc = (fetchedDisc || []).filter(d =>
          d.personId === person.id ||
          (pEmail && d.email && d.email.toLowerCase() === pEmail.toLowerCase())
        );
        setDiscResponses(matchedDisc);

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
      setFeedbackToast("Note successfully recorded!");
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

  // ── Next Steps Suggestions Logic ──
  const isNotInGroup = personGroups.length === 0;
  const hasGroupRiskFactor = riskProfile?.factors?.some(f => 
    f.toLowerCase().includes('group') || f.toLowerCase().includes('connect')
  ) || (riskProfile && riskProfile.category !== 'Healthy' && isNotInGroup);
  const availableGroups = groups.filter(g => !g.archivedAt);

  const isNotServing = (servingStats?.last90DaysCount ?? timesServed ?? 0) === 0 && !teams.some(t => t.memberIds?.includes(person?.id || '') || t.scheduledMemberIds?.includes(person?.id || ''));
  const hasServingRiskFactor = riskProfile?.factors?.some(f => 
    f.toLowerCase().includes('serv') || f.toLowerCase().includes('volunteer')
  ) || (riskProfile && riskProfile.category !== 'Healthy' && isNotServing);
  const availableTeams = teams.filter(t => t.name);

  const nowIso = new Date().toISOString().slice(0, 10);
  const upcomingEvents = registrations.filter(r => {
    if (r.visibility === 'archived') return false;
    const eventDate = r.startsAt || r.openAt;
    if (!eventDate) return true;
    return eventDate.slice(0, 10) >= nowIso || (!r.endsAt || r.endsAt.slice(0, 10) >= nowIso);
  });

  const unregisteredUpcomingEvents = upcomingEvents.filter(ev => {
    const isAttendee = attendees.some(a => 
      (a.eventId === ev.id || a.pcoEventId === ev.pcoId) && 
      ((a.personId && a.personId === person?.id) || (a.name && person?.name && a.name.trim().toLowerCase() === person.name.trim().toLowerCase()))
    );
    return !isAttendee;
  });

  const pendingSuggestionsCount = (isNotInGroup ? 1 : 0) + (isNotServing ? 1 : 0) + (unregisteredUpcomingEvents.length > 0 ? 1 : 0);

  useEffect(() => {
    if (groups.length > 0 && !selectedGroupSuggestion) {
      const firstActive = groups.find(g => !g.archivedAt);
      if (firstActive) setSelectedGroupSuggestion(firstActive.id);
    }
    if (teams.length > 0 && !selectedTeamSuggestion) {
      setSelectedTeamSuggestion(teams[0].id);
    }
  }, [groups, teams, selectedGroupSuggestion, selectedTeamSuggestion]);

  useEffect(() => {
    if (unregisteredUpcomingEvents.length > 0 && !selectedEventSuggestion) {
      setSelectedEventSuggestion(unregisteredUpcomingEvents[0].id);
    }
  }, [unregisteredUpcomingEvents, selectedEventSuggestion]);

  useEffect(() => {
    if (feedbackToast) {
      const timer = setTimeout(() => setFeedbackToast(null), 3500);
      return () => clearTimeout(timer);
    }
  }, [feedbackToast]);

  const activeTargetGroup = groups.find(g => g.id === selectedGroupSuggestion) || groups.find(g => !g.archivedAt) || groups[0];
  const activeTargetTeam = teams.find(t => t.id === selectedTeamSuggestion) || teams[0];
  const activeTargetEvent = unregisteredUpcomingEvents.find(e => e.id === selectedEventSuggestion) || unregisteredUpcomingEvents[0];
  const firstName = person?.name ? person.name.split(' ')[0] : 'there';

  const handleCopyText = (text: string, id: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedItemId(id);
    setFeedbackToast(`${label} copied to clipboard!`);
    setTimeout(() => setCopiedItemId(null), 2500);
  };

  const handleApplySmsTemplate = (templateText: string) => {
    setShowNextStepsModal(false);
    if (resolvedPhone) {
      const cleaned = resolvedPhone.replace(/[^\d+]/g, '');
      const smsUri = `sms:${cleaned}?&body=${encodeURIComponent(templateText)}`;
      window.open(smsUri, '_system');
      setFeedbackToast('Opening SMS messaging app...');
    } else {
      navigator.clipboard.writeText(templateText);
      setFeedbackToast('Message copied to clipboard (no phone on file).');
    }
  };

  const handleApplyNoteTemplate = (content: string, type: PastoralNote['type'] = 'Note') => {
    setShowNextStepsModal(false);
    setNoteType(type);
    setNoteContent(content);
    setFeedbackToast('Care note filled with suggested action.');
    const formEl = document.getElementById('companion-note-box');
    if (formEl) formEl.scrollIntoView({ behavior: 'smooth' });
  };

  // Helper for sending assessment SMS
  const handleSendAssessmentSms = (assessmentName: string, testPath: string) => {
    const testUrl = `${window.location.origin}/${testPath}/${churchId}?personId=${person.id}&name=${encodeURIComponent(person.name)}`;
    const msg = `Hi ${firstName}! Please take our church ${assessmentName} to discover how God has wired and gifted you: ${testUrl}`;
    if (resolvedPhone) {
      const cleaned = resolvedPhone.replace(/[^\d+]/g, '');
      const smsUri = `sms:${cleaned}?&body=${encodeURIComponent(msg)}`;
      window.open(smsUri, '_system');
      setFeedbackToast(`Opening SMS to send ${assessmentName}...`);
    } else {
      navigator.clipboard.writeText(msg);
      setFeedbackToast(`${assessmentName} invite message copied to clipboard.`);
    }
  };

  const handleCopyAssessmentLink = (testPath: string, setCopied: (val: boolean) => void) => {
    const testUrl = `${window.location.origin}/${testPath}/${churchId}?personId=${person.id}&name=${encodeURIComponent(person.name)}`;
    navigator.clipboard.writeText(testUrl);
    setCopied(true);
    setFeedbackToast('Test link copied to clipboard!');
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} />

      <div className="relative w-full h-[92vh] bg-slate-50 dark:bg-zinc-950 rounded-t-[2.5rem] p-4 sm:p-6 shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-250">
        {/* Grab Bar */}
        <div className="w-12 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full mx-auto mb-4 shrink-0" />

        {/* Profile Header */}
        <div className="flex justify-between items-start mb-3 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            {person.avatar ? (
              <img
                src={person.avatar}
                alt={person.name}
                className="w-13 h-13 sm:w-14 sm:h-14 rounded-full object-cover bg-slate-100 border-2 border-white shadow-md shrink-0"
              />
            ) : (
              <div className="w-13 h-13 sm:w-14 sm:h-14 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-base shadow-sm border border-indigo-100 dark:border-indigo-900/30 shrink-0">
                {getInitials(person.name)}
              </div>
            )}
            <div className="min-w-0">
              <h2 className="text-base sm:text-lg font-black tracking-tight truncate">{person.name}</h2>
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
            className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 flex items-center justify-center hover:bg-slate-200 dark:hover:bg-zinc-700 shrink-0 cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Toast Feedback */}
        {feedbackToast && (
          <div className="mb-2 flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-100/90 dark:bg-indigo-950/70 border border-indigo-200 dark:border-indigo-800 rounded-xl p-2.5 animate-in fade-in duration-150 shrink-0">
            <Check size={14} className="text-indigo-600 dark:text-indigo-400 shrink-0" />
            <span className="truncate">{feedbackToast}</span>
          </div>
        )}

        {/* Content Area */}
        <div className="flex-1 min-h-0 overflow-y-auto space-y-4 pb-6">

          {/* ── Care Cadence & Touchpoint Banner ── */}
          <div className={`p-3 rounded-2xl border flex flex-col min-[380px]:flex-row items-start min-[380px]:items-center justify-between gap-2 text-xs ${
            daysSinceLastTouchpoint === null ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300' :
            daysSinceLastTouchpoint <= 30 ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-300' :
            daysSinceLastTouchpoint <= 60 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300' :
            'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/30 text-rose-800 dark:text-rose-300'
          }`}>
            <div className="flex items-center gap-2 min-w-0 flex-1">
              <Clock size={15} className="shrink-0 text-current opacity-80" />
              <div className="min-w-0 flex-1">
                <p className="font-black text-[11px] leading-tight truncate">
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
              <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-white/90 dark:bg-zinc-800/90 shrink-0 border border-current/20 self-start min-[380px]:self-auto">
                🏛️ {person.primaryCampusName}
              </span>
            )}
          </div>

          {/* ── Suggested Next Steps Trigger Banner ── */}
          <div className="p-3.5 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/50 dark:from-indigo-950/30 dark:via-zinc-900 dark:to-purple-950/20 shadow-xs flex flex-col min-[380px]:flex-row items-stretch min-[380px]:items-center justify-between gap-2.5">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-7 h-7 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Compass size={14} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
                  <h3 className="text-xs font-black uppercase text-slate-800 dark:text-zinc-100 tracking-wider">
                    Next Steps
                  </h3>
                  {pendingSuggestionsCount > 0 ? (
                    <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-indigo-600 text-white shrink-0">
                      {pendingSuggestionsCount} Action{pendingSuggestionsCount > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 shrink-0">
                      ✓ Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1 mt-1 flex-wrap">
                  {isNotInGroup && (
                    <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300">
                      Group
                    </span>
                  )}
                  {isNotServing && (
                    <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                      Serving
                    </span>
                  )}
                  {unregisteredUpcomingEvents.length > 0 && (
                    <span className="text-[8px] font-bold px-1 py-0.5 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
                      Event ({unregisteredUpcomingEvents.length})
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowNextStepsModal(true)}
              className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[10px] font-black uppercase tracking-wider flex items-center justify-center gap-1 transition shadow-sm active:scale-95 shrink-0 cursor-pointer"
            >
              <span>View Next Steps</span>
              <ExternalLink size={11} />
            </button>
          </div>

          {/* ── Status & Engagement Overview Grid ── */}
          <div className="grid grid-cols-3 gap-2">
            {/* Risk Profile Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-2.5 min-[375px]:p-3 border border-slate-200/50 dark:border-zinc-800 shadow-xs flex flex-col justify-between overflow-hidden min-w-0">
              <div className="flex items-center justify-between gap-1 mb-1 min-w-0">
                <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1 min-w-0 truncate">
                  <ShieldAlert size={11} className="text-indigo-500 shrink-0" />
                  <span className="truncate">Risk</span>
                </span>
              </div>
              <div className="min-w-0">
                <span className={`text-base min-[375px]:text-lg font-black ${
                  riskProfile?.category === 'Healthy' ? 'text-emerald-600 dark:text-emerald-400' :
                  riskProfile?.category === 'At Risk' ? 'text-amber-600 dark:text-amber-400' :
                  riskProfile ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                }`}>
                  {riskProfile ? riskProfile.score : 'N/A'}
                </span>
                <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-bold ml-0.5">/100</span>
              </div>
              <span className={`text-[8px] font-black uppercase tracking-wider px-1 py-0.5 rounded border inline-block mt-1 truncate ${getRiskBadgeColor(riskProfile?.category)}`}>
                {riskProfile?.category || 'No Data'}
              </span>
            </div>

            {/* Engagement Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-2.5 min-[375px]:p-3 border border-slate-200/50 dark:border-zinc-800 shadow-xs flex flex-col justify-between overflow-hidden min-w-0">
              <div className="flex items-center justify-between gap-1 mb-1 min-w-0">
                <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1 min-w-0 truncate">
                  <Activity size={11} className="text-indigo-500 shrink-0" />
                  <span className="truncate">Engage</span>
                </span>
              </div>
              <div className="min-w-0">
                <span className="text-sm min-[375px]:text-base font-black text-slate-900 dark:text-white truncate block">
                  {engagementStatus}
                </span>
              </div>
              <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-bold mt-1 truncate block">
                {person.checkInCount ? `${person.checkInCount} check-in${person.checkInCount > 1 ? 's' : ''}` : '0 check-ins'}
              </span>
            </div>

            {/* Served Card */}
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-2.5 min-[375px]:p-3 border border-slate-200/50 dark:border-zinc-800 shadow-xs flex flex-col justify-between overflow-hidden min-w-0">
              <div className="flex items-center justify-between gap-1 mb-1 min-w-0">
                <span className="text-[9px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-wider flex items-center gap-1 min-w-0 truncate">
                  <HeartHandshake size={11} className="text-indigo-500 shrink-0" />
                  <span className="truncate">Served</span>
                </span>
              </div>
              <div className="min-w-0">
                <span className="text-base min-[375px]:text-lg font-black text-slate-900 dark:text-white">
                  {timesServed}x
                </span>
              </div>
              <span className="text-[9px] text-slate-400 dark:text-zinc-500 font-bold mt-1 truncate block">
                {timesServed > 0 ? 'Last 90 days' : '0 in 90 days'}
              </span>
            </div>
          </div>

          {/* ── Companion Quick Actions Bar ── */}
          <div className="grid grid-cols-2 min-[420px]:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setShowEngagementModal(true)}
              className="py-2.5 px-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-[11px] font-black uppercase tracking-wider flex items-center justify-center gap-1.5 active:scale-95 transition shadow-sm cursor-pointer col-span-2 min-[420px]:col-span-1"
              title="Open Pastoral Care Recommendations & Strategy Playbook"
            >
              <Sparkles size={13} className="shrink-0 text-amber-300" />
              <span className="truncate">Pastoral Strategy</span>
            </button>

            <button
              type="button"
              onClick={() => setShowNextStepsModal(true)}
              className="py-2.5 px-2 bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/40 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 transition truncate shadow-2xs cursor-pointer"
            >
              <Compass size={12} className="shrink-0" />
              <span className="truncate">Next Steps</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('companion-note-box');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="py-2.5 px-2 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 transition truncate cursor-pointer"
            >
              <NotebookPen size={12} className="shrink-0" />
              <span className="truncate">Add Note</span>
            </button>

            <a
              href={`https://people.planningcenteronline.com/people/${person.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="py-2.5 px-2 bg-slate-100 dark:bg-zinc-800 text-slate-700 dark:text-zinc-300 rounded-xl text-[10px] font-bold flex items-center justify-center gap-1 active:scale-95 transition text-center truncate"
            >
              <span className="truncate">PCO Profile</span>
              <ExternalLink size={10} className="shrink-0 text-slate-400" />
            </a>
          </div>

          {/* ═══════════════════════════════════════════════════════════════════
              ASSESSMENT PROFILES (Spiritual Gifts, MBTI, DISC)
          ═══════════════════════════════════════════════════════════════════ */}

          {/* ── 1. Spiritual Gifts Assessment Card ── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200/50 dark:border-zinc-800 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <Award size={14} className="text-indigo-500" />
                Spiritual Gifts Profile
              </h3>
              {giftsResponses.length > 0 ? (
                <span className="text-[9px] font-black bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                  Completed
                </span>
              ) : (
                <span className="text-[9px] font-black bg-slate-100 dark:bg-zinc-800 text-slate-400 px-2 py-0.5 rounded-full">
                  Pending
                </span>
              )}
            </div>

            {giftsResponses.length > 0 ? (
              <div className="space-y-3">
                {(() => {
                  const latestGifts = giftsResponses[0];
                  const primDef = SPIRITUAL_GIFTS_DEFINITIONS[latestGifts.primaryGift];
                  const secDef = latestGifts.secondaryGift ? SPIRITUAL_GIFTS_DEFINITIONS[latestGifts.secondaryGift] : null;

                  return (
                    <>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div className="p-3 bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-slate-100 dark:border-zinc-800 space-y-1">
                          <span className="text-[9px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">
                            Primary Gift
                          </span>
                          <div className="flex items-center gap-1.5">
                            <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: primDef?.color || '#6366f1' }} />
                            <span className="text-sm font-black text-slate-900 dark:text-white">
                              {latestGifts.primaryGift}
                            </span>
                            <span className="text-xs text-slate-400">
                              ({latestGifts.scores?.[latestGifts.primaryGift.toLowerCase() as keyof typeof latestGifts.scores] || 0}/35)
                            </span>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">
                            {primDef?.shortDescription}
                          </p>
                        </div>

                        <div className="p-3 bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-slate-100 dark:border-zinc-800 space-y-1">
                          <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                            Secondary Gift
                          </span>
                          {latestGifts.secondaryGift ? (
                            <>
                              <div className="flex items-center gap-1.5">
                                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: secDef?.color || '#94a3b8' }} />
                                <span className="text-sm font-black text-slate-900 dark:text-white">
                                  {latestGifts.secondaryGift}
                                </span>
                                <span className="text-xs text-slate-400">
                                  ({latestGifts.scores?.[latestGifts.secondaryGift.toLowerCase() as keyof typeof latestGifts.scores] || 0}/35)
                                </span>
                              </div>
                              <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">
                                {secDef?.shortDescription}
                              </p>
                            </>
                          ) : (
                            <span className="text-xs text-slate-400 block pt-1">None specified</span>
                          )}
                        </div>
                      </div>

                      {/* 6 Gifts Breakdown Bars */}
                      <div className="p-3 bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-slate-100 dark:border-zinc-800 space-y-2">
                        <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                          6 Spiritual Gifts Breakdown
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                          {(['Helps', 'Teaching', 'Encouragement', 'Administration', 'Mercy', 'Giving'] as const).map(g => {
                            const score = latestGifts.scores?.[g.toLowerCase() as keyof typeof latestGifts.scores] || 0;
                            const pct = Math.round((score / 35) * 100);
                            const gDef = SPIRITUAL_GIFTS_DEFINITIONS[g];
                            return (
                              <div key={g} className="space-y-0.5">
                                <div className="flex justify-between text-[10px] font-bold">
                                  <span className="text-slate-700 dark:text-slate-300">{g}</span>
                                  <span className="text-slate-900 dark:text-white">{score}</span>
                                </div>
                                <div className="w-full bg-slate-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden">
                                  <div 
                                    className="h-full rounded-full" 
                                    style={{ width: `${Math.max(4, pct)}%`, backgroundColor: gDef.color }} 
                                  />
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                        <span className="text-[10px] text-slate-400 font-medium">
                          Taken {formatDate(new Date(latestGifts.submittedAt).toISOString())}
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setShowEngagementModal(true)}
                            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <MessageSquare size={13} />
                            <span>Pastoral Strategy</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedGiftsModal(latestGifts)}
                            className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            <Compass size={13} />
                            <span>Full Test (42 Qs)</span>
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="text-center py-3 space-y-2 bg-slate-50 dark:bg-zinc-800/40 rounded-xl border border-dashed border-slate-200 dark:border-zinc-700 p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  No Spiritual Gifts Test on file for {person.name}.
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleCopyAssessmentLink('gifts-test', setCopiedGiftsLink)}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-zinc-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    {copiedGiftsLink ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    <span>{copiedGiftsLink ? 'Link Copied!' : 'Copy Link'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendAssessmentSms('Spiritual Gifts Test', 'gifts-test')}
                    className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Send size={12} />
                    <span>Send via SMS</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── 2. Myers-Briggs (MBTI) Profile Card ── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200/50 dark:border-zinc-800 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <Brain size={14} className="text-violet-500" />
                Myers-Briggs (MBTI) Profile
              </h3>
              {mbtiResponses.length > 0 ? (
                <span className="text-[9px] font-black bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full border border-violet-200 dark:border-violet-800">
                  Completed
                </span>
              ) : (
                <span className="text-[9px] font-black bg-slate-100 dark:bg-zinc-800 text-slate-400 px-2 py-0.5 rounded-full">
                  Pending
                </span>
              )}
            </div>

            {mbtiResponses.length > 0 ? (
              <div className="space-y-3">
                {(() => {
                  const latestMbti = mbtiResponses[0];
                  const mbtiProf = MBTI_TYPE_PROFILES[latestMbti.mbtiType] || MBTI_TYPE_PROFILES['ENFJ'];

                  return (
                    <>
                      <div className="p-3 bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-slate-100 dark:border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span 
                              className="px-2.5 py-1 rounded-lg text-sm font-black text-white shadow-xs"
                              style={{ backgroundColor: mbtiProf.color }}
                            >
                              {latestMbti.mbtiType}
                            </span>
                            <div>
                              <div className="text-xs font-bold text-slate-900 dark:text-white">
                                {mbtiProf.name}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Temperament: {latestMbti.temperament || mbtiProf.temperament}
                              </div>
                            </div>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                          {mbtiProf.tagline}
                        </p>
                      </div>

                      {/* 4 Cognitive Trait Sliders */}
                      {latestMbti.traitPercentages && (
                        <div className="p-3 bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-slate-100 dark:border-zinc-800 space-y-2">
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                            Cognitive Traits
                          </span>
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            {/* E vs I */}
                            <div className="space-y-0.5">
                              <div className="flex justify-between font-bold text-slate-700 dark:text-slate-300">
                                <span>{latestMbti.traitPercentages.energy.type === 'E' ? 'Extravert (E)' : 'Introvert (I)'}</span>
                                <span>{latestMbti.traitPercentages.energy.percent}%</span>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden flex">
                                <div className="h-full bg-violet-600" style={{ width: `${latestMbti.traitPercentages.energy.ePercent}%` }} />
                                <div className="h-full bg-indigo-400" style={{ width: `${latestMbti.traitPercentages.energy.iPercent}%` }} />
                              </div>
                            </div>

                            {/* S vs N */}
                            <div className="space-y-0.5">
                              <div className="flex justify-between font-bold text-slate-700 dark:text-slate-300">
                                <span>{latestMbti.traitPercentages.information.type === 'S' ? 'Sensing (S)' : 'Intuitive (N)'}</span>
                                <span>{latestMbti.traitPercentages.information.percent}%</span>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden flex">
                                <div className="h-full bg-sky-600" style={{ width: `${latestMbti.traitPercentages.information.sPercent}%` }} />
                                <div className="h-full bg-cyan-400" style={{ width: `${latestMbti.traitPercentages.information.nPercent}%` }} />
                              </div>
                            </div>

                            {/* T vs F */}
                            <div className="space-y-0.5">
                              <div className="flex justify-between font-bold text-slate-700 dark:text-slate-300">
                                <span>{latestMbti.traitPercentages.decisions.type === 'T' ? 'Thinking (T)' : 'Feeling (F)'}</span>
                                <span>{latestMbti.traitPercentages.decisions.percent}%</span>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden flex">
                                <div className="h-full bg-amber-500" style={{ width: `${latestMbti.traitPercentages.decisions.tPercent}%` }} />
                                <div className="h-full bg-pink-400" style={{ width: `${latestMbti.traitPercentages.decisions.fPercent}%` }} />
                              </div>
                            </div>

                            {/* J vs P */}
                            <div className="space-y-0.5">
                              <div className="flex justify-between font-bold text-slate-700 dark:text-slate-300">
                                <span>{latestMbti.traitPercentages.structure.type === 'J' ? 'Judging (J)' : 'Perceiving (P)'}</span>
                                <span>{latestMbti.traitPercentages.structure.percent}%</span>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden flex">
                                <div className="h-full bg-emerald-600" style={{ width: `${latestMbti.traitPercentages.structure.jPercent}%` }} />
                                <div className="h-full bg-teal-400" style={{ width: `${latestMbti.traitPercentages.structure.pPercent}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                        <span className="text-[10px] text-slate-400 font-medium">
                          Taken {formatDate(new Date(latestMbti.submittedAt).toISOString())}
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setShowEngagementModal(true)}
                            className="text-xs font-bold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <MessageSquare size={13} />
                            <span>Pastoral Strategy</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedMbtiModal(latestMbti)}
                            className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            <Compass size={13} />
                            <span>Full Test (28 Qs)</span>
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="text-center py-3 space-y-2 bg-slate-50 dark:bg-zinc-800/40 rounded-xl border border-dashed border-slate-200 dark:border-zinc-700 p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  No MBTI Personality Test on file for {person.name}.
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleCopyAssessmentLink('mbti-test', setCopiedMbtiLink)}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-zinc-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    {copiedMbtiLink ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    <span>{copiedMbtiLink ? 'Link Copied!' : 'Copy Link'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendAssessmentSms('MBTI Personality Assessment', 'mbti-test')}
                    className="px-3 py-1.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Send size={12} />
                    <span>Send via SMS</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── 3. Faith-Based DISC Profile Card ── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200/50 dark:border-zinc-800 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider flex items-center gap-1.5">
                <Compass size={14} className="text-emerald-500" />
                Faith-Based DISC Profile (KJV)
              </h3>
              {discResponses.length > 0 ? (
                <span className="text-[9px] font-black bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full border border-emerald-200 dark:border-emerald-800">
                  Completed
                </span>
              ) : (
                <span className="text-[9px] font-black bg-slate-100 dark:bg-zinc-800 text-slate-400 px-2 py-0.5 rounded-full">
                  Pending
                </span>
              )}
            </div>

            {discResponses.length > 0 ? (
              <div className="space-y-3">
                {(() => {
                  const latestDisc = discResponses[0];
                  const discProf = DISC_PROFILES[latestDisc.styleCode] || DISC_PROFILES[latestDisc.primaryDimension] || DISC_PROFILES['D'];

                  return (
                    <>
                      <div className="p-3 bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-slate-100 dark:border-zinc-800 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span 
                              className="px-2.5 py-1 rounded-lg text-sm font-black text-white shadow-xs"
                              style={{ backgroundColor: discProf.color }}
                            >
                              {latestDisc.styleCode}
                            </span>
                            <div>
                              <div className="text-xs font-bold text-slate-900 dark:text-white">
                                {discProf.name}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                Primary: {DISC_DIMENSIONS_INFO[latestDisc.primaryDimension]?.name.split(' ')[0]}
                                {latestDisc.secondaryDimension && ` • Secondary: ${DISC_DIMENSIONS_INFO[latestDisc.secondaryDimension]?.name.split(' ')[0]}`}
                              </div>
                            </div>
                          </div>
                        </div>

                        <p className="text-[11px] text-slate-600 dark:text-slate-400 leading-snug">
                          {discProf.summary}
                        </p>

                        {/* Theme KJV Verse */}
                        {discProf.themeVerseKjv && (
                          <div className="p-2.5 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/30 border-l-3 border-emerald-600 text-[10px] italic text-slate-700 dark:text-slate-300 font-serif">
                            “{discProf.themeVerseKjv.text}” <span className="font-bold font-sans not-italic text-emerald-700 dark:text-emerald-400">— {discProf.themeVerseKjv.verse}</span>
                          </div>
                        )}
                      </div>

                      {/* 4 Dimension Percentage Sliders */}
                      {latestDisc.percentages && (
                        <div className="p-3 bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-slate-100 dark:border-zinc-800 space-y-2">
                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-400 block">
                            DISC Dimension Distribution
                          </span>
                          <div className="grid grid-cols-2 gap-2 text-[10px]">
                            {(['D', 'I', 'S', 'C'] as DiscDimension[]).map(d => {
                              const info = DISC_DIMENSIONS_INFO[d];
                              const pct = latestDisc.percentages[d] || 0;
                              const score = latestDisc.scores?.[d] || 0;
                              return (
                                <div key={d} className="space-y-0.5">
                                  <div className="flex justify-between font-bold text-slate-700 dark:text-slate-300">
                                    <span>{info.name.split(' ')[0]} ({d})</span>
                                    <span className="font-mono">{pct}%</span>
                                  </div>
                                  <div className="w-full bg-slate-200 dark:bg-zinc-700 h-1.5 rounded-full overflow-hidden">
                                    <div className="h-full rounded-full" style={{ width: `${Math.max(5, pct)}%`, backgroundColor: info.color }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-1 flex-wrap gap-2">
                        <span className="text-[10px] text-slate-400 font-medium">
                          Taken {formatDate(new Date(latestDisc.submittedAt).toISOString())}
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setShowEngagementModal(true)}
                            className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <MessageSquare size={13} />
                            <span>Pastoral Strategy</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedDiscModal(latestDisc)}
                            className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            <Compass size={13} />
                            <span>Full Test (28 Statements)</span>
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="text-center py-3 space-y-2 bg-slate-50 dark:bg-zinc-800/40 rounded-xl border border-dashed border-slate-200 dark:border-zinc-700 p-3">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  No Faith-Based DISC Assessment on file for {person.name}.
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => handleCopyAssessmentLink('disc-test', setCopiedDiscLink)}
                    className="px-3 py-1.5 rounded-xl bg-white dark:bg-zinc-800 hover:bg-slate-100 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-zinc-700 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    {copiedDiscLink ? <Check size={12} className="text-emerald-500" /> : <Copy size={12} />}
                    <span>{copiedDiscLink ? 'Link Copied!' : 'Copy Link'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => handleSendAssessmentSms('Faith-Based DISC Assessment (KJV)', 'disc-test')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Send size={12} />
                    <span>Send via SMS</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Serving Involvement & Schedule History ── */}
          <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200/50 dark:border-zinc-800 space-y-3 shadow-sm">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                <HeartHandshake size={14} className="text-emerald-500" />
                Serving Involvement
              </h3>
              <span className="text-[9px] font-black px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-900/30">
                {timesServed}x in 90 Days
              </span>
            </div>

            {/* Serving Teams */}
            {teams.filter(t => t.memberIds?.includes(person.id) || t.scheduledMemberIds?.includes(person.id)).length > 0 ? (
              <div className="space-y-1.5">
                <span className="text-[9px] font-black text-slate-400 uppercase block">Active Teams:</span>
                {teams.filter(t => t.memberIds?.includes(person.id) || t.scheduledMemberIds?.includes(person.id)).map(t => (
                  <div key={t.id} className="flex justify-between items-center bg-slate-50 dark:bg-zinc-800/60 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-800 text-xs">
                    <span className="font-bold text-slate-800 dark:text-zinc-200">{t.name}</span>
                    <span className="text-[10px] text-slate-400 font-medium">
                      {t.scheduledMemberIds?.includes(person.id) ? 'Scheduled' : 'Team Member'}
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">Not actively enrolled in any Services ministry teams.</p>
            )}

            {/* Serving Stats */}
            {servingStats && (
              <div className="pt-2 border-t border-slate-100 dark:border-zinc-800 flex justify-between items-center text-[10px] font-bold text-slate-500 dark:text-zinc-400">
                <span>Avg weekly: <span className="text-slate-800 dark:text-zinc-200">{servingStats.timesPerWeek ?? (timesServed / (90 / 7)).toFixed(2)}x</span></span>
                {servingStats.nextServiceDate ? (
                  <span className="text-indigo-600 dark:text-indigo-400">Next: {formatDate(servingStats.nextServiceDate)}</span>
                ) : (
                  <span>Next: None scheduled</span>
                )}
              </div>
            )}
          </div>

          {/* ── Risk Progression Timeline ── */}
          {(timeline.length > 0 || (riskProfile?.factors && riskProfile.factors.length > 0)) && (
            <div className="bg-white dark:bg-zinc-900 rounded-2xl p-4 border border-slate-200/50 dark:border-zinc-800 space-y-3 shadow-sm">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5">
                  <TrendingUp size={14} className="text-rose-500" />
                  Risk Progression & Factors
                </h3>
                {timeline.length > 0 && (
                  <span className="text-[9px] font-black bg-slate-100 dark:bg-zinc-800 text-slate-500 px-2 py-0.5 rounded-full">
                    {timeline.length} Change{timeline.length > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {/* Active Risk Factors */}
              {riskProfile?.factors && riskProfile.factors.length > 0 && (
                <div>
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block mb-1.5">
                    Triggered Risk Factors:
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

              {/* Timeline Items */}
              {timeline.length > 0 && (
                <div className="space-y-2 pt-1 border-t border-slate-100 dark:border-zinc-800">
                  <span className="text-[9px] font-black text-slate-400 uppercase tracking-wider block">
                    Historical Risk Timeline:
                  </span>
                  <div className="space-y-1.5">
                    {timeline.slice(0, 5).map((t, idx) => (
                      <div key={t.id || idx} className="p-2.5 bg-slate-50 dark:bg-zinc-800/60 rounded-xl border border-slate-100 dark:border-zinc-800 flex items-center justify-between text-xs gap-2">
                        <div>
                          <div className="flex items-center gap-1.5">
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${getRiskBadgeColor(t.oldCategory)}`}>
                              {t.oldCategory}
                            </span>
                            <span className="text-slate-400 text-[10px]">→</span>
                            <span className={`px-1.5 py-0.5 rounded text-[8px] font-black uppercase tracking-wider border ${getRiskBadgeColor(t.newCategory)}`}>
                              {t.newCategory}
                            </span>
                          </div>
                          {t.reasons && t.reasons.length > 0 && (
                            <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1">
                              {t.reasons.join(', ')}
                            </p>
                          )}
                        </div>
                        <span className="text-[10px] text-slate-400 shrink-0 font-medium">
                          {formatDate(t.date)}
                        </span>
                      </div>
                    ))}
                  </div>
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
          <div id="companion-note-box" className="bg-white dark:bg-zinc-900 rounded-3xl p-5 border border-slate-200/50 dark:border-zinc-800 shadow-sm space-y-4">
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
                className="w-full flex items-center justify-center gap-1.5 p-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-100 dark:shadow-none transition active:scale-[0.98] cursor-pointer"
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

      {/* ═══════════════════════════════════════════════════════════════════════
          MODALS & OVERLAYS (Spiritual Gifts, MBTI, DISC, Pastoral Strategy)
      ═══════════════════════════════════════════════════════════════════════ */}

      {/* ── 1. Spiritual Gifts Full Test (42 Qs) Modal ── */}
      {selectedGiftsModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md shrink-0"
                  style={{ backgroundColor: SPIRITUAL_GIFTS_DEFINITIONS[selectedGiftsModal.primaryGift]?.color || '#6366f1' }}
                >
                  <Award className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    Spiritual Gifts: {person.name}
                  </h4>
                  <p className="text-xs text-slate-400">
                    Taken on {new Date(selectedGiftsModal.submittedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedGiftsModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-1">
                  <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">Primary Gift</span>
                  <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    {selectedGiftsModal.primaryGift} ({selectedGiftsModal.scores?.[selectedGiftsModal.primaryGift.toLowerCase() as keyof typeof selectedGiftsModal.scores] || 0}/35)
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    {SPIRITUAL_GIFTS_DEFINITIONS[selectedGiftsModal.primaryGift]?.shortDescription}
                  </p>
                </div>

                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/60 border border-slate-200 dark:border-zinc-700 space-y-1">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Secondary Gift</span>
                  <div className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    {selectedGiftsModal.secondaryGift || 'None'} {selectedGiftsModal.secondaryGift ? `(${selectedGiftsModal.scores?.[selectedGiftsModal.secondaryGift.toLowerCase() as keyof typeof selectedGiftsModal.scores] || 0}/35)` : ''}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {selectedGiftsModal.secondaryGift ? SPIRITUAL_GIFTS_DEFINITIONS[selectedGiftsModal.secondaryGift]?.shortDescription : ''}
                  </p>
                </div>
              </div>

              {/* 6 Gifts Scores */}
              <div className="space-y-2.5">
                <h5 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Scores by Gift (out of 35)
                </h5>
                {selectedGiftsModal.rankedGifts?.map(rg => {
                  const def = SPIRITUAL_GIFTS_DEFINITIONS[rg.gift];
                  return (
                    <div key={rg.gift} className="space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span className="text-slate-800 dark:text-slate-200">{rg.gift}</span>
                        <span className="text-slate-900 dark:text-white">{rg.score} / 35 ({rg.percentage}%)</span>
                      </div>
                      <div className="w-full bg-slate-100 dark:bg-zinc-800 h-2 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.max(5, rg.percentage)}%`,
                            backgroundColor: def?.color || '#6366f1'
                          }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* All 42 Answer Ratings */}
              <div className="space-y-3 pt-2">
                <h5 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Individual Ratings for all 42 Statements
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {SPIRITUAL_GIFTS_QUESTIONS.map(q => {
                    const ans = selectedGiftsModal.answers?.[q.id] || 0;
                    return (
                      <div key={q.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-100 dark:border-zinc-800 flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">
                            #{q.id} • {q.category}
                          </div>
                          <div className="text-slate-700 dark:text-slate-300 text-[11px] leading-snug mt-0.5">
                            {q.text}
                          </div>
                        </div>
                        <span className="w-6 h-6 rounded-lg bg-indigo-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                          {ans}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── 2. Myers-Briggs (MBTI) Full Test (28 Qs) Modal ── */}
      {selectedMbtiModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md font-black text-sm shrink-0"
                  style={{ backgroundColor: MBTI_TYPE_PROFILES[selectedMbtiModal.mbtiType]?.color || '#8b5cf6' }}
                >
                  {selectedMbtiModal.mbtiType}
                </div>
                <div>
                  <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    MBTI Profile: {person.name}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {MBTI_TYPE_PROFILES[selectedMbtiModal.mbtiType]?.name} • Taken {new Date(selectedMbtiModal.submittedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedMbtiModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* Summary */}
              <div className="p-4 rounded-2xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-800/40 space-y-2">
                <span className="text-[10px] font-black uppercase text-violet-600 dark:text-violet-400 tracking-wider">
                  Overview & Temperament ({selectedMbtiModal.temperament || MBTI_TYPE_PROFILES[selectedMbtiModal.mbtiType]?.temperament})
                </span>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                  {MBTI_TYPE_PROFILES[selectedMbtiModal.mbtiType]?.tagline}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {MBTI_TYPE_PROFILES[selectedMbtiModal.mbtiType]?.fullDescription}
                </p>
              </div>

              {/* 4 Dimension Percentage Bars */}
              {selectedMbtiModal.traitPercentages && (
                <div className="space-y-3">
                  <h5 className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Cognitive Dimensions
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    {/* E vs I */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 space-y-1">
                      <div className="flex justify-between font-bold">
                        <span>Extraversion ({selectedMbtiModal.traitPercentages.energy.ePercent}%)</span>
                        <span>Introversion ({selectedMbtiModal.traitPercentages.energy.iPercent}%)</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden flex">
                        <div className="h-full bg-violet-600" style={{ width: `${selectedMbtiModal.traitPercentages.energy.ePercent}%` }} />
                        <div className="h-full bg-indigo-400" style={{ width: `${selectedMbtiModal.traitPercentages.energy.iPercent}%` }} />
                      </div>
                    </div>

                    {/* S vs N */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 space-y-1">
                      <div className="flex justify-between font-bold">
                        <span>Sensing ({selectedMbtiModal.traitPercentages.information.sPercent}%)</span>
                        <span>Intuition ({selectedMbtiModal.traitPercentages.information.nPercent}%)</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden flex">
                        <div className="h-full bg-sky-600" style={{ width: `${selectedMbtiModal.traitPercentages.information.sPercent}%` }} />
                        <div className="h-full bg-cyan-400" style={{ width: `${selectedMbtiModal.traitPercentages.information.nPercent}%` }} />
                      </div>
                    </div>

                    {/* T vs F */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 space-y-1">
                      <div className="flex justify-between font-bold">
                        <span>Thinking ({selectedMbtiModal.traitPercentages.decisions.tPercent}%)</span>
                        <span>Feeling ({selectedMbtiModal.traitPercentages.decisions.fPercent}%)</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden flex">
                        <div className="h-full bg-amber-500" style={{ width: `${selectedMbtiModal.traitPercentages.decisions.tPercent}%` }} />
                        <div className="h-full bg-pink-400" style={{ width: `${selectedMbtiModal.traitPercentages.decisions.fPercent}%` }} />
                      </div>
                    </div>

                    {/* J vs P */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 space-y-1">
                      <div className="flex justify-between font-bold">
                        <span>Judging ({selectedMbtiModal.traitPercentages.structure.jPercent}%)</span>
                        <span>Perceiving ({selectedMbtiModal.traitPercentages.structure.pPercent}%)</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden flex">
                        <div className="h-full bg-emerald-600" style={{ width: `${selectedMbtiModal.traitPercentages.structure.jPercent}%` }} />
                        <div className="h-full bg-teal-400" style={{ width: `${selectedMbtiModal.traitPercentages.structure.pPercent}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* 28 Statements */}
              <div className="space-y-3 pt-2">
                <h5 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Individual Ratings for all 28 Statements (1–5)
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {MBTI_QUESTIONS.map(q => {
                    const ans = selectedMbtiModal.answers?.[q.id] || 0;
                    return (
                      <div key={q.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-100 dark:border-zinc-800 flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">
                            #{q.id} • {q.dimension} ({q.direction})
                          </div>
                          <div className="text-slate-700 dark:text-slate-300 text-[11px] leading-snug mt-0.5">
                            {q.text}
                          </div>
                        </div>
                        <span className="w-6 h-6 rounded-lg bg-violet-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                          {ans}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── 3. Faith-Based DISC Full Test (28 Statements) Modal ── */}
      {selectedDiscModal && typeof document !== 'undefined' && createPortal(
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-3 sm:p-6 overflow-y-auto animate-in fade-in duration-200">
          <div className="bg-white dark:bg-zinc-900 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-zinc-800 shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-4 sm:p-6 border-b border-slate-100 dark:border-zinc-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md font-black text-sm shrink-0"
                  style={{ backgroundColor: DISC_PROFILES[selectedDiscModal.styleCode]?.color || '#10b981' }}
                >
                  {selectedDiscModal.styleCode}
                </div>
                <div>
                  <h4 className="text-base sm:text-lg font-black text-slate-900 dark:text-white">
                    DISC Profile: {person.name}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {DISC_PROFILES[selectedDiscModal.styleCode]?.name} • Taken {new Date(selectedDiscModal.submittedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedDiscModal(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
              {/* Summary */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-800/40 space-y-2">
                <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">
                  Summary & Ministry Overview
                </span>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                  {DISC_PROFILES[selectedDiscModal.styleCode]?.summary}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {DISC_PROFILES[selectedDiscModal.styleCode]?.fullDescription}
                </p>
              </div>

              {/* KJV Theme Verse */}
              {DISC_PROFILES[selectedDiscModal.styleCode]?.themeVerseKjv && (
                <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-zinc-800/50 border-l-4 border-emerald-600 space-y-1">
                  <p className="text-xs italic text-slate-800 dark:text-slate-200 font-serif">
                    “{DISC_PROFILES[selectedDiscModal.styleCode]?.themeVerseKjv.text}”
                  </p>
                  <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 text-right">
                    — {DISC_PROFILES[selectedDiscModal.styleCode]?.themeVerseKjv.verse}
                  </p>
                </div>
              )}

              {/* 4 Dimension Percentage Bars */}
              {selectedDiscModal.percentages && (
                <div className="space-y-3">
                  <h5 className="text-xs font-black uppercase tracking-wider text-slate-400">
                    DISC Dimension Distribution
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(['D', 'I', 'S', 'C'] as DiscDimension[]).map(dim => {
                      const info = DISC_DIMENSIONS_INFO[dim];
                      const score = selectedDiscModal.scores?.[dim] || 0;
                      const pct = selectedDiscModal.percentages?.[dim] || 0;

                      return (
                        <div key={dim} className="p-3 rounded-xl bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 space-y-1.5">
                          <div className="flex justify-between text-xs font-bold">
                            <span>{info.name.split(' ')[0]}</span>
                            <span className="font-mono">{pct}% ({score}/35)</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-zinc-700 h-2 rounded-full overflow-hidden">
                            <div className="h-full rounded-full" style={{ width: `${Math.max(5, pct)}%`, backgroundColor: info.color }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* 28 Statements */}
              <div className="space-y-3 pt-2">
                <h5 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Individual Ratings for all 28 Statements (1–5)
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {DISC_QUESTIONS.map(q => {
                    const ans = selectedDiscModal.answers?.[q.id] || 0;
                    return (
                      <div key={q.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-zinc-800/40 border border-slate-100 dark:border-zinc-800 flex items-start justify-between gap-2">
                        <div>
                          <div className="text-[10px] font-bold text-slate-400 uppercase">
                            #{q.id} • Dimension {q.dimension} ({q.trait})
                          </div>
                          <div className="text-slate-700 dark:text-slate-300 text-[11px] leading-snug mt-0.5">
                            {q.text}
                          </div>
                        </div>
                        <span className="w-6 h-6 rounded-lg bg-emerald-600 text-white font-black text-xs flex items-center justify-center shrink-0">
                          {ans}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* ── 4. Pastoral Engagement & Shepherding Strategy Modal ── */}
      {showEngagementModal && (
        <PastoralEngagementModal
          isOpen={showEngagementModal}
          onClose={() => setShowEngagementModal(false)}
          personName={person.name}
          email={resolvedEmail}
          phone={resolvedPhone}
          personId={person.id}
          churchId={churchId}
          giftsResponse={giftsResponses[0] || null}
          mbtiResponse={mbtiResponses[0] || null}
          discResponse={discResponses[0] || null}
        />
      )}

    </div>
  );
};
