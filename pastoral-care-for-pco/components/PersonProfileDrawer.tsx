import React, { useEffect, useState, useCallback } from 'react';
import { Drawer } from './Drawer';
import { firestore } from '../services/firestoreService';
import { pcoService } from '../services/pcoService';
import { PcoPerson, RiskChangeRecord, PastoralNote, PcoGroup, PrayerRequest, DetailedDonation, User, ServicesTeam, PcoRegistrationEvent, PcoRegistrationAttendee } from '../types';
import { useTenantData } from '../contexts/TenantDataContext';
import {
  Mail, Phone, Send, Loader2, CheckCircle, AlertCircle,
  NotebookPen, ChevronDown, ChevronUp, Plus, X,
  ShieldAlert, Activity, HeartHandshake, CalendarCheck, UserCheck,
  Users, Church as ChurchIcon, Sparkles, DollarSign,
  Heart, Clock, Tag, Check, Calendar, CheckSquare,
  Compass, ExternalLink, Copy, Share2
} from 'lucide-react';

const API_BASE = '';

const NOTE_TYPES: PastoralNote['type'][] = ['Call', 'Visit', 'Meeting', 'Note', 'Crisis', 'Hospital'];

const NOTE_TYPE_COLORS: Record<string, string> = {
  Call:     'bg-blue-100 text-blue-700 dark:bg-blue-950/40 dark:text-blue-300',
  Visit:    'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300',
  Meeting:  'bg-violet-100 text-violet-700 dark:bg-violet-950/40 dark:text-violet-300',
  Note:     'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  Crisis:   'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300',
  Hospital: 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300',
};

function formatDate(dateStr?: string | null) {
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

function getEngagementStatus(person: PcoPerson): string {
  if (person.engagementStatus) return person.engagementStatus;
  const count = person.effectiveCheckInCount ?? (person.checkInCount || 0);
  if (count > 8) return 'Core';
  if (count >= 4) return 'Regular';
  if (count > 0) return 'Sporadic';
  return 'Inactive';
}

function getEngagementBadgeColor(status: string): string {
  switch (status) {
    case 'Core':
      return 'bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800/40';
    case 'Regular':
      return 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800/40';
    case 'Sporadic':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800/40';
    case 'Inactive':
    default:
      return 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700';
  }
}

function getRiskCategoryBadgeColor(category?: string): string {
  switch (category) {
    case 'Healthy':
      return 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40';
    case 'At Risk':
      return 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800/40';
    case 'Disconnected':
    default:
      return 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300 border-rose-200 dark:border-rose-800/40';
  }
}

interface PersonProfileDrawerProps {
  personId: string | null;
  churchId: string;
  onClose: () => void;
}

export const PersonProfileDrawer: React.FC<PersonProfileDrawerProps> = ({ personId, churchId, onClose }) => {
  const { user, church } = useTenantData();
  const pcoConnected = !!(church?.pcoAccessToken);

  const [person, setPerson] = useState<PcoPerson | null>(null);
  const [allPeople, setAllPeople] = useState<PcoPerson[]>([]);
  const [groups, setGroups] = useState<PcoGroup[]>([]);
  const [teams, setTeams] = useState<ServicesTeam[]>([]);
  const [registrations, setRegistrations] = useState<PcoRegistrationEvent[]>([]);
  const [attendees, setAttendees] = useState<PcoRegistrationAttendee[]>([]);
  const [prayerRequests, setPrayerRequests] = useState<PrayerRequest[]>([]);
  const [donations, setDonations] = useState<DetailedDonation[]>([]);
  const [timeline, setTimeline] = useState<RiskChangeRecord[]>([]);
  const [notes, setNotes] = useState<PastoralNote[]>([]);
  const [loading, setLoading] = useState(false);

  // Suggestion selections & actions
  const [showNextStepsModal, setShowNextStepsModal] = useState<boolean>(false);
  const [selectedGroupSuggestion, setSelectedGroupSuggestion] = useState<string>('');
  const [selectedTeamSuggestion, setSelectedTeamSuggestion] = useState<string>('');
  const [selectedEventSuggestion, setSelectedEventSuggestion] = useState<string>('');
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // SMS state
  const [smsBody, setSmsBody] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [smsError, setSmsError] = useState('');
  const [smsSuccess, setSmsSuccess] = useState(false);

  // Note form state
  const [showNoteForm, setShowNoteForm] = useState(false);
  const [noteType, setNoteType] = useState<PastoralNote['type']>('Call');
  const [noteContent, setNoteContent] = useState('');
  const [noteFollowUp, setNoteFollowUp] = useState('');
  const [savingNote, setSavingNote] = useState(false);
  const [noteSaveError, setNoteSaveError] = useState('');
  const [noteSaveSuccess, setNoteSaveSuccess] = useState(false);
  const [showAllNotes, setShowAllNotes] = useState(false);

  useEffect(() => {
    if (smsSuccess) {
      const t = setTimeout(() => setSmsSuccess(false), 5000);
      return () => clearTimeout(t);
    }
  }, [smsSuccess]);

  useEffect(() => {
    if (noteSaveSuccess) {
      const t = setTimeout(() => setNoteSaveSuccess(false), 4000);
      return () => clearTimeout(t);
    }
  }, [noteSaveSuccess]);

  useEffect(() => {
    if (feedbackToast) {
      const t = setTimeout(() => setFeedbackToast(null), 4000);
      return () => clearTimeout(t);
    }
  }, [feedbackToast]);

  const handleSendSms = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPhone = getPersonPhone(person);
    if (!targetPhone || !smsBody.trim()) return;
    setSendingSms(true);
    setSmsError('');
    setSmsSuccess(false);
    try {
      const cleanedPhone = targetPhone.replace(/[^\d+]/g, '');
      const res = await fetch(`${API_BASE}/api/messaging/send-individual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          churchId,
          toPhone: cleanedPhone,
          body: smsBody.trim(),
          sentBy: user?.id || null,
          sentByName: user?.name || null,
          personId: person?.id,
          personName: person?.name,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.error || `Send failed (HTTP ${res.status})`);
      setSmsSuccess(true);
      setSmsBody('');
      if (person?.id) {
        window.dispatchEvent(new CustomEvent('careFollowUpCompleted', { detail: person.id }));
      }
    } catch (err: any) {
      setSmsError(err.message || 'An error occurred while sending the message.');
    } finally {
      setSendingSms(false);
    }
  };

  const handleSaveNote = useCallback(async () => {
    if (!person || !noteContent.trim()) return;
    setSavingNote(true);
    setNoteSaveError('');

    try {
      const now = new Date();
      const note: PastoralNote = {
        id: `note_${Date.now()}`,
        churchId,
        personId:   person.id,
        personName: person.name,
        authorId:   user?.id   || 'system',
        authorName: user?.name || 'Staff',
        date:       now.toISOString().split('T')[0],
        type:       noteType,
        content:    noteContent.trim(),
        followUpDate: noteFollowUp || null,
        isCompleted: false,
        tags: [],
      } as any;

      await firestore.savePastoralNote(note);

      // Sync to Planning Center profile if connected
      if (pcoConnected) {
        try {
          let pcoText = `[Pastoral Care: ${noteType}]\n${noteContent.trim()}`;
          if (noteFollowUp) {
            pcoText += `\n\nFollow-up needed by: ${new Date(noteFollowUp).toLocaleDateString()}`;
          }
          await pcoService.addNoteToPerson(churchId, person.id, pcoText);
        } catch (syncErr) {
          console.warn('PCO note sync failed (note was still saved locally):', syncErr);
        }
      }

      // Prepend to local notes list
      setNotes(prev => [note, ...prev]);
      setNoteContent('');
      setNoteFollowUp('');
      setNoteType('Call');
      setShowNoteForm(false);
      setNoteSaveSuccess(true);
    } catch (err: any) {
      setNoteSaveError(err.message || 'Failed to save note. Please try again.');
    } finally {
      setSavingNote(false);
    }
  }, [person, noteContent, noteType, noteFollowUp, churchId, user, pcoConnected]);

  const canAccessGiving = canViewGiving(user);

  useEffect(() => {
    if (!personId || !churchId) return;
    const loadData = async () => {
      setLoading(true);
      setPerson(null);
      setNotes([]);
      setTimeline([]);
      try {
        const [people, changes, personNotes, outreachSlots, fetchedGroups, fetchedPrayers, fetchedDonations, fetchedTeams, fetchedRegistrations, fetchedAttendees] = await Promise.all([
          firestore.getPeople(churchId),
          firestore.getPersonRiskTimeline(churchId, personId),
          firestore.getPastoralNotes(churchId, personId),
          firestore.getPersonOutreachSlots(churchId, personId),
          firestore.getGroups(churchId),
          firestore.getPrayerRequests(churchId),
          canAccessGiving ? firestore.getDetailedDonations(churchId) : Promise.resolve([]),
          firestore.getServicesTeams(churchId),
          firestore.getRegistrations(churchId),
          firestore.getRegistrationAttendees(churchId),
        ]);
        setAllPeople(people);
        setGroups(fetchedGroups);
        setPrayerRequests(fetchedPrayers);
        setDonations(fetchedDonations || []);
        setTeams(fetchedTeams || []);
        setRegistrations(fetchedRegistrations || []);
        setAttendees(fetchedAttendees || []);
        const p = people.find(p => p.id === personId);
        if (p) setPerson(p);
        setTimeline(changes);

        const outreachNotes: PastoralNote[] = outreachSlots
            .filter(s => s.status === 'contacted' && !!s.notes)
            .map(s => {
                const noteStr = s.followUpNotes?.length
                  ? s.notes + '\n\n' + s.followUpNotes.map(f => `Follow-up: ${f.note}`).join('\n')
                  : s.notes;

                return {
                    id: s.id,
                    churchId: s.churchId,
                    personId: s.assignedPersonId,
                    personName: s.assignedPersonName,
                    authorId: s.volunteerPhone,
                    authorName: s.volunteerName || 'Volunteer',
                    date: new Date(s.completedAt || s.assignedAt).toISOString(),
                    type: 'Call',
                    content: noteStr,
                    isCompleted: true,
                    isOutreach: true
                } as PastoralNote;
            });

        const combined = [...personNotes, ...outreachNotes].sort((a, b) => b.date.localeCompare(a.date));
        setNotes(combined);
      } catch (e) {
        console.error('Failed to load person details', e);
      } finally {
        setLoading(false);
      }
    };
    loadData();
  }, [personId, churchId]);

  if (!personId) return null;

  const visibleNotes = showAllNotes ? notes : notes.slice(0, 3);

  const riskProfile = person?.riskProfile || (person?.historicRiskCategory ? {
    category: person.historicRiskCategory as 'Healthy' | 'At Risk' | 'Disconnected',
    score: person.historicRiskScore ?? 0,
    factors: []
  } : undefined);
  const engagementStatus = person ? getEngagementStatus(person) : 'Inactive';
  const timesServed = person?.servingStats?.last90DaysCount ?? 0;
  const servingStats = person?.servingStats;

  // Contact resolution
  const resolvedEmail = getPersonEmail(person);
  const resolvedPhone = getPersonPhone(person);

  // Household members
  const householdMembers = person?.householdId 
    ? allPeople.filter(m => m.householdId === person.householdId && m.id !== person.id) 
    : [];

  // Groups
  const personGroups = groups.filter(g => 
    person?.groupIds?.includes(g.id) || 
    g.memberIds?.includes(person?.id || '') || 
    g.leaderIds?.includes(person?.id || '')
  );

  // Prayer requests
  const personPrayerRequests = prayerRequests.filter(pr => 
    pr.personId === person?.id || 
    (pr.personName && person?.name && pr.personName.toLowerCase() === person.name.toLowerCase())
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

  const handleSelectPerson = (targetPersonId: string) => {
    window.dispatchEvent(new CustomEvent('openPersonProfile', { detail: targetPersonId }));
  };

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
    setSmsBody(templateText);
    setFeedbackToast('Message template loaded into SMS composer below.');
    const el = document.getElementById('person-sms-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  const handleApplyNoteTemplate = (content: string, type: PastoralNote['type'] = 'Note') => {
    setShowNoteForm(true);
    setNoteType(type);
    setNoteContent(content);
    setFeedbackToast('Care note form opened with suggested action prefilled.');
    const el = document.getElementById('person-notes-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <Drawer isOpen={!!personId} onClose={onClose} title="Person Profile">
      {loading ? (
        <div className="flex justify-center p-8 text-slate-400">Loading...</div>
      ) : person ? (
        <div className="space-y-6">

          {/* ── Header ── */}
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl overflow-hidden bg-slate-200 flex-shrink-0">
              {person.avatar ? (
                <img src={person.avatar} alt="" width="64" height="64" className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center font-black text-slate-400 text-xl">
                  {person.name.charAt(0)}
                </div>
              )}
            </div>
            <div>
              <h2 className="text-xl font-black text-slate-900 dark:text-white">{person.name}</h2>
              <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                <span className="text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  {person.membership || 'Guest'}
                </span>
                <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${getEngagementBadgeColor(engagementStatus)}`}>
                  {engagementStatus}
                </span>
                {riskProfile && (
                  <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full border ${getRiskCategoryBadgeColor(riskProfile.category)}`}>
                    {riskProfile.category} ({riskProfile.score})
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* ── Care Cadence & Touchpoint Banner ── */}
          <div className={`p-3 rounded-2xl border flex items-center justify-between gap-3 text-xs ${
            daysSinceLastTouchpoint === null ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300' :
            daysSinceLastTouchpoint <= 30 ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-300' :
            daysSinceLastTouchpoint <= 60 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300' :
            'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/30 text-rose-800 dark:text-rose-300'
          }`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <Clock className="w-4 h-4 shrink-0" />
              <div className="min-w-0">
                <span className="font-bold">
                  {daysSinceLastTouchpoint === null 
                    ? 'No pastoral contact logged yet'
                    : `Last touchpoint ${daysSinceLastTouchpoint === 0 ? 'today' : `${daysSinceLastTouchpoint} day${daysSinceLastTouchpoint > 1 ? 's' : ''} ago`}`}
                </span>
                {notes.length > 0 && (
                  <span className="text-[11px] opacity-80 block truncate">
                    ({notes[0].type} on {formatDate(notes[0].date)} by {notes[0].authorName})
                  </span>
                )}
              </div>
            </div>
            {person.primaryCampusName && (
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-white dark:bg-slate-800 shrink-0 border border-current shadow-xs">
                🏛️ {person.primaryCampusName}
              </span>
            )}
          </div>

          {/* ── Suggested Next Steps Trigger Banner ── */}
          <div className="p-3.5 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 bg-gradient-to-r from-indigo-50/80 via-white to-purple-50/50 dark:from-indigo-950/30 dark:via-slate-900 dark:to-purple-950/20 shadow-xs flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Compass className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h3 className="text-xs font-black uppercase text-slate-900 dark:text-white tracking-wider">
                    Suggested Next Steps
                  </h3>
                  {pendingSuggestionsCount > 0 ? (
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-600 text-white shrink-0">
                      {pendingSuggestionsCount} Action{pendingSuggestionsCount > 1 ? 's' : ''}
                    </span>
                  ) : (
                    <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 shrink-0">
                      ✓ All Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1.5 mt-1 flex-wrap">
                  {isNotInGroup && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-950/50 text-purple-700 dark:text-purple-300">
                      🌱 Small Group
                    </span>
                  )}
                  {isNotServing && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-emerald-100 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300">
                      🤝 Service Team
                    </span>
                  )}
                  {unregisteredUpcomingEvents.length > 0 && (
                    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300">
                      🎟️ Event Signup ({unregisteredUpcomingEvents.length})
                    </span>
                  )}
                  {!isNotInGroup && !isNotServing && unregisteredUpcomingEvents.length === 0 && (
                    <span className="text-[10px] text-slate-500 dark:text-slate-400">
                      Connected across groups, serving, and events
                    </span>
                  )}
                </div>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setShowNextStepsModal(true)}
              className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center gap-1.5 transition shadow-sm active:scale-95 shrink-0 cursor-pointer"
            >
              <span>View Next Steps</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ── Suggested Next Steps Popout Window Modal ── */}
          {showNextStepsModal && (
            <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="absolute inset-0" onClick={() => setShowNextStepsModal(false)} />
              <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[85vh] z-10 animate-in zoom-in-95 duration-200">
                {/* Popout Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-sm shrink-0">
                      <Compass className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-base font-black text-slate-900 dark:text-white">
                          Suggested Next Steps for {person.name}
                        </h3>
                        <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
                          Discipleship Pathways
                        </span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Proactive outreach recommendations based on risk factors & ministry involvement
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => setShowNextStepsModal(false)}
                    className="w-8 h-8 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Feedback Toast */}
                {feedbackToast && (
                  <div className="my-3 flex items-center gap-2 text-xs font-bold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-950/50 border border-indigo-200 dark:border-indigo-800 rounded-xl p-3 animate-in fade-in">
                    <CheckCircle className="w-4 h-4 shrink-0 text-indigo-600 dark:text-indigo-400" />
                    <span>{feedbackToast}</span>
                  </div>
                )}

                {/* Popout Scrollable Content */}
                <div className="flex-1 min-h-0 overflow-y-auto py-3 space-y-4 pr-1">
                  {/* Suggestion 1: Small Group */}
                  {isNotInGroup ? (
                    <div className="bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
                            <Users className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Invite to Small Group</h4>
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${hasGroupRiskFactor ? 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-300 border border-rose-200 dark:border-rose-900/40' : 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300'}`}>
                                {hasGroupRiskFactor ? 'Risk Factor Priority' : 'Community'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Not enrolled in any small group. Connecting with a group builds vital community and discipleship support.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        {availableGroups.length > 0 ? (
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <label className="text-xs font-bold text-slate-400 uppercase shrink-0">Group:</label>
                            <select
                              value={selectedGroupSuggestion || (activeTargetGroup?.id || '')}
                              onChange={e => setSelectedGroupSuggestion(e.target.value)}
                              className="text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 outline-none w-full truncate shadow-xs"
                            >
                              {availableGroups.map(g => (
                                <option key={g.id} value={g.id}>
                                  {g.name} ({g.membersCount || 0} members)
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No public groups listed</span>
                        )}

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const groupName = activeTargetGroup?.name || 'one of our community groups';
                              const msg = `Hi ${firstName}, we'd love to invite you to connect with a small group! Are you interested in checking out ${groupName}?`;
                              handleApplySmsTemplate(msg);
                              setShowNextStepsModal(false);
                            }}
                            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                            title="Prefill SMS invite in drawer"
                          >
                            <Send className="w-3.5 h-3.5" /> Text Invite
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const groupName = activeTargetGroup?.name || 'Small Group';
                              handleApplyNoteTemplate(`Invited ${person.name} to join ${groupName}. Follow up in 1-2 weeks.`, 'Call');
                              setShowNextStepsModal(false);
                            }}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition cursor-pointer"
                            title="Log note in drawer"
                          >
                            <NotebookPen className="w-3.5 h-3.5" /> Log Note
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Suggestion 2: Service Team */}
                  {isNotServing ? (
                    <div className="bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                            <HeartHandshake className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Connect to a Service Team</h4>
                              <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded ${hasServingRiskFactor ? 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40' : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'}`}>
                                {hasServingRiskFactor ? 'Serving Need' : 'Ministry'}
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Not currently serving on any ministry team (0 times in last 90 days). Serving deepens relationships and engagement.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        {availableTeams.length > 0 ? (
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <label className="text-xs font-bold text-slate-400 uppercase shrink-0">Team:</label>
                            <select
                              value={selectedTeamSuggestion || (activeTargetTeam?.id || '')}
                              onChange={e => setSelectedTeamSuggestion(e.target.value)}
                              className="text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 outline-none w-full truncate shadow-xs"
                            >
                              {availableTeams.map(t => (
                                <option key={t.id} value={t.id}>
                                  {t.name}
                                </option>
                              ))}
                            </select>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400 italic">No service teams configured</span>
                        )}

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const teamName = activeTargetTeam?.name || 'our service ministry';
                              const msg = `Hi ${firstName}, we'd love to connect you with our ministry team! Would you be open to exploring serving with our ${teamName} team?`;
                              handleApplySmsTemplate(msg);
                              setShowNextStepsModal(false);
                            }}
                            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                            title="Prefill SMS serving invitation in drawer"
                          >
                            <Send className="w-3.5 h-3.5" /> Text Opportunity
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const teamName = activeTargetTeam?.name || 'Service Team';
                              handleApplyNoteTemplate(`Reached out to ${person.name} regarding serving opportunities on the ${teamName} team.`, 'Meeting');
                              setShowNextStepsModal(false);
                            }}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition cursor-pointer"
                            title="Log note in drawer"
                          >
                            <NotebookPen className="w-3.5 h-3.5" /> Log Note
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Suggestion 3: Event Registration */}
                  {unregisteredUpcomingEvents.length > 0 ? (
                    <div className="bg-slate-50/80 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                            <CalendarCheck className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h4 className="text-sm font-bold text-slate-900 dark:text-white">Invite to Registration Event</h4>
                              <span className="text-[9px] font-black uppercase px-2 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border border-amber-200 dark:border-amber-900/40">
                                Upcoming Event
                              </span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                              Not registered for upcoming church event{unregisteredUpcomingEvents.length > 1 ? ` (${unregisteredUpcomingEvents.length} available)` : ''}.
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <label className="text-xs font-bold text-slate-400 uppercase shrink-0">Event:</label>
                          <select
                            value={selectedEventSuggestion || (activeTargetEvent?.id || '')}
                            onChange={e => setSelectedEventSuggestion(e.target.value)}
                            className="text-xs font-medium bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-slate-800 dark:text-slate-200 outline-none w-full truncate shadow-xs"
                          >
                            {unregisteredUpcomingEvents.map(ev => (
                              <option key={ev.id} value={ev.id}>
                                {ev.name} {ev.startsAt ? `(${formatDate(ev.startsAt)})` : ''}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            onClick={() => {
                              const eventName = activeTargetEvent?.name || 'our upcoming church event';
                              const link = activeTargetEvent?.publicUrl ? ` ${activeTargetEvent.publicUrl}` : '';
                              const msg = `Hi ${firstName}, registration is open for ${eventName}! We'd love to see you there.${link ? ` You can register here: ${link}` : ''}`;
                              handleApplySmsTemplate(msg);
                              setShowNextStepsModal(false);
                            }}
                            className="px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                            title="Prefill SMS event invitation in drawer"
                          >
                            <Send className="w-3.5 h-3.5" /> Text Invite
                          </button>

                          {activeTargetEvent?.publicUrl && (
                            <button
                              type="button"
                              onClick={() => handleCopyText(activeTargetEvent.publicUrl!, `event_${activeTargetEvent.id}`, 'Event link')}
                              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition cursor-pointer"
                              title="Copy registration link"
                            >
                              {copiedItemId === `event_${activeTargetEvent.id}` ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                            </button>
                          )}

                          {activeTargetEvent?.publicUrl && (
                            <a
                              href={activeTargetEvent.publicUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition cursor-pointer"
                              title="Open registration page"
                            >
                              <ExternalLink className="w-3.5 h-3.5" />
                            </a>
                          )}

                          <button
                            type="button"
                            onClick={() => {
                              const eventName = activeTargetEvent?.name || 'Registration Event';
                              handleApplyNoteTemplate(`Invited ${person.name} to attend ${eventName}.`, 'Note');
                              setShowNextStepsModal(false);
                            }}
                            className="px-3 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition cursor-pointer"
                            title="Log note in drawer"
                          >
                            <NotebookPen className="w-3.5 h-3.5" /> Log Note
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : null}

                  {/* Celebration state if all 3 are in place */}
                  {!isNotInGroup && !isNotServing && unregisteredUpcomingEvents.length === 0 && (
                    <div className="bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/30 rounded-2xl p-4 flex items-center gap-3">
                      <CheckCircle className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
                      <div>
                        <h4 className="text-sm font-black text-emerald-900 dark:text-emerald-300">All Core Next Steps Active</h4>
                        <p className="text-xs text-emerald-700 dark:text-emerald-400/80 mt-0.5">
                          This person is actively connected in a small group, participating in serving, and up to date on church events.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                {/* Popout Footer */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex justify-end shrink-0">
                  <button
                    type="button"
                    onClick={() => setShowNextStepsModal(false)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                  >
                    Done
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ── Status & Engagement Overview Grid ── */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            {/* Risk Profile Card */}
            <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1">
                  <ShieldAlert className="w-3.5 h-3.5 text-indigo-500" />
                  Risk Profile
                </span>
                {riskProfile && (
                  <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase ${getRiskCategoryBadgeColor(riskProfile.category)}`}>
                    {riskProfile.category}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-2">
                <span className={`text-2xl font-black ${
                  riskProfile?.category === 'Healthy' ? 'text-emerald-600 dark:text-emerald-400' :
                  riskProfile?.category === 'At Risk' ? 'text-amber-600 dark:text-amber-400' :
                  riskProfile ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                }`}>
                  {riskProfile ? riskProfile.score : 'N/A'}
                </span>
                <span className="text-[11px] text-slate-400 font-medium">/ 100 score</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium line-clamp-1" title={riskProfile?.factors?.join(', ') || 'No risk factors'}>
                {riskProfile?.factors && riskProfile.factors.length > 0 ? riskProfile.factors.join(', ') : 'No active risk factors'}
              </p>
            </div>

            {/* Engagement Status Card */}
            <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1">
                  <Activity className="w-3.5 h-3.5 text-indigo-500" />
                  Engagement
                </span>
                <span className={`text-[9px] font-black px-1.5 py-0.5 rounded border uppercase ${getEngagementBadgeColor(engagementStatus)}`}>
                  {engagementStatus}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-xl font-black text-slate-800 dark:text-white">
                  {engagementStatus}
                </span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium">
                {person.effectiveCheckInCount !== undefined ? (
                  person.effectiveCheckInCount > 0 ? (
                    person.childCheckInCount && person.effectiveCheckInCount > (person.checkInCount || 0) ? (
                      <span>
                        {person.effectiveCheckInCount} check-ins{' '}
                        <span className="text-indigo-600 dark:text-indigo-400 font-semibold" title="Direct + Child check-ins">
                          ({person.checkInCount || 0} direct + child)
                        </span>
                      </span>
                    ) : (
                      `${person.effectiveCheckInCount} check-in${person.effectiveCheckInCount > 1 ? 's' : ''}`
                    )
                  ) : 'No recent check-ins'
                ) : person.checkInCount ? `${person.checkInCount} check-in${person.checkInCount > 1 ? 's' : ''}` : 'No recent check-ins'}
              </p>
            </div>

            {/* Recently Served Card */}
            <div className="p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col justify-between">
              <div className="flex items-center justify-between gap-1 mb-2">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1">
                  <HeartHandshake className="w-3.5 h-3.5 text-indigo-500" />
                  Recently Served
                </span>
                {timesServed > 0 && (
                  <span className="text-[9px] font-black px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800/40 uppercase">
                    Active
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1.5">
                <span className="text-2xl font-black text-slate-800 dark:text-white">
                  {timesServed}x
                </span>
                <span className="text-[11px] text-slate-400 font-medium">last 90 days</span>
              </div>
              <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 font-medium truncate">
                {servingStats?.recentServices && servingStats.recentServices.length > 0 
                  ? `Last: ${servingStats.recentServices[0].teamName || 'Service'} (${formatDate(servingStats.recentServices[0].date)})`
                  : servingStats?.nextServiceDate 
                    ? `Next: ${formatDate(servingStats.nextServiceDate)}`
                    : timesServed === 0 ? 'Not served recently' : `${timesServed} service plans`}
              </p>
            </div>
          </div>

          {/* ── Quick Actions ── */}
          <div className="flex gap-2">
            <a
              href={`https://people.planningcenteronline.com/people/${person.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 bg-slate-100 hover:bg-slate-200 text-slate-700 dark:bg-slate-800 dark:hover:bg-slate-700 dark:text-slate-200 text-xs font-bold py-2 rounded-xl text-center transition-colors"
            >
              View in PCO
            </a>
          </div>

          {/* ── Spiritual Milestones ── */}
          <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-amber-500" />
              Spiritual Milestones & Journey
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">✝️ Salvation</span>
                <span className="font-bold text-xs text-slate-800 dark:text-white mt-0.5 block truncate">
                  {person.salvationDate ? formatDate(person.salvationDate) : 'Not recorded'}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">💧 Baptism</span>
                <span className="font-bold text-xs text-slate-800 dark:text-white mt-0.5 block truncate">
                  {person.baptismDate ? formatDate(person.baptismDate) : 'Not recorded'}
                </span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60 col-span-2 sm:col-span-1">
                <span className="text-[10px] font-bold text-slate-400 uppercase block">🏛️ Membership</span>
                <span className="font-bold text-xs text-slate-800 dark:text-white mt-0.5 block truncate">
                  {person.membership || 'Non-Member'}
                </span>
              </div>
            </div>
          </div>

          {/* ── Household & Family ── */}
          {(person.householdName || householdMembers.length > 0) && (
            <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide flex items-center gap-1.5">
                  <Users className="w-4 h-4 text-indigo-500" />
                  {person.householdName || 'Household Members'}
                </h3>
                {householdMembers.length > 0 && (
                  <span className="text-[10px] font-black bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                    {householdMembers.length + 1} Members
                  </span>
                )}
              </div>
              {householdMembers.length === 0 ? (
                <p className="text-xs text-slate-400 italic">No other household members recorded.</p>
              ) : (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {householdMembers.map(m => (
                    <button
                      key={m.id}
                      onClick={() => handleSelectPerson(m.id)}
                      className="flex items-center gap-2.5 p-2 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700/60 hover:border-indigo-300 dark:hover:border-indigo-700 transition text-left cursor-pointer group"
                    >
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-slate-200 shrink-0">
                        {m.avatar ? (
                          <img src={m.avatar} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center font-bold text-slate-400 text-xs">
                            {m.name.charAt(0)}
                          </div>
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-xs font-bold text-slate-800 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
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
          <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide flex items-center gap-1.5">
                <Users className="w-4 h-4 text-purple-500" />
                Small Groups & Community
              </h3>
              {personGroups.length > 0 && (
                <span className="text-[10px] font-black bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 px-2 py-0.5 rounded-full">
                  {personGroups.length} Group{personGroups.length > 1 ? 's' : ''}
                </span>
              )}
            </div>
            {personGroups.length === 0 ? (
              <p className="text-xs text-slate-400 italic">Not currently enrolled in any small groups.</p>
            ) : (
              <div className="space-y-1.5">
                {personGroups.map(g => {
                  const isLeader = g.leaderIds?.includes(person.id);
                  return (
                    <div key={g.id} className="flex justify-between items-center bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60 text-xs">
                      <div className="min-w-0 pr-2">
                        <span className="font-bold text-slate-800 dark:text-white block truncate">{g.name}</span>
                        <span className="text-[10px] text-slate-400">{g.groupTypeName || 'Group'}{g.membersCount ? ` • ${g.membersCount} members` : ''}</span>
                      </div>
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full border shrink-0 ${
                        isLeader 
                          ? 'bg-amber-50 text-amber-700 dark:bg-amber-950/40 dark:text-amber-300 border-amber-200 dark:border-amber-800/40'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-600'
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
            <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide flex items-center gap-1.5">
                  <DollarSign className="w-4 h-4 text-emerald-500" />
                  Giving Health & Donor Status
                </h3>
                <span className={`text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full border ${
                  hasRecurring
                    ? 'bg-purple-100 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border-purple-200 dark:border-purple-800/40'
                    : isDonor 
                      ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}>
                  {hasRecurring ? 'Recurring Giver' : isDonor ? 'Active Contributor' : 'Non-Giver'}
                </span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">YTD Contributions</span>
                  <span className="font-bold text-xs text-slate-800 dark:text-white mt-0.5 block">
                    {effectiveYtd > 0 ? formatCurrency(effectiveYtd) : (effectiveMonthly > 0 ? `${formatCurrency(effectiveMonthly)}/mo` : 'No gifts YTD')}
                  </span>
                </div>
                <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60">
                  <span className="text-[10px] text-slate-400 font-bold uppercase block">Latest Contribution</span>
                  <span className="font-bold text-xs text-slate-800 dark:text-white mt-0.5 block truncate">
                    {lastDonation ? `${formatCurrency(lastDonation.amount)} (${formatDate(lastDonation.date)})` : (isDonor ? 'Active Giver' : 'None logged')}
                  </span>
                </div>
              </div>
              {recentDonations.length > 0 && (
                <div className="space-y-1 pt-1">
                  <span className="text-[10px] font-bold uppercase text-slate-400 block">Recent Gifts:</span>
                  <div className="space-y-1">
                    {recentDonations.slice(0, 3).map((d, i) => (
                      <div key={d.id || i} className="flex justify-between items-center bg-white dark:bg-slate-800 px-3 py-1.5 rounded-xl text-xs border border-slate-100 dark:border-slate-700/60">
                        <span className="font-medium text-slate-700 dark:text-slate-300 truncate">{d.fundName || 'General Fund'}</span>
                        <span className="font-bold text-slate-800 dark:text-white shrink-0 ml-2">
                          {formatCurrency(d.amount)} <span className="text-[10px] text-slate-400 font-normal">({formatDate(d.date)})</span>
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {/* ── Prayer Requests ── */}
          <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide flex items-center gap-1.5">
                <Heart className="w-4 h-4 text-rose-500" />
                Prayer Requests
              </h3>
              {personPrayerRequests.length > 0 && (
                <span className="text-[10px] font-black bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 px-2 py-0.5 rounded-full">
                  {personPrayerRequests.filter(pr => pr.status === 'Active').length} Active
                </span>
              )}
            </div>
            {personPrayerRequests.length === 0 ? (
              <p className="text-xs text-slate-400 italic">No prayer requests recorded.</p>
            ) : (
              <div className="space-y-2">
                {personPrayerRequests.map(pr => (
                  <div key={pr.id} className="bg-white dark:bg-slate-800 p-3 rounded-xl border border-slate-100 dark:border-slate-700/60 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className={`text-[9px] font-black uppercase px-2 py-0.5 rounded-full ${
                        pr.status === 'Answered' 
                          ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300'
                          : 'bg-rose-100 text-rose-700 dark:bg-rose-950/40 dark:text-rose-300'
                      }`}>
                        {pr.status}
                      </span>
                      <span className="text-[10px] text-slate-400">{formatDate(pr.date)}</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed font-medium">
                      {pr.request}
                    </p>
                    <div className="flex justify-between items-center pt-1 border-t border-slate-100 dark:border-slate-700/60">
                      <span className="text-[10px] text-slate-400">{pr.category || 'General'}</span>
                      <button
                        onClick={() => handleTogglePrayerAnswered(pr)}
                        className="flex items-center gap-1 text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
                      >
                        <CheckSquare className="w-3 h-3" />
                        {pr.status === 'Answered' ? 'Re-open Request' : 'Mark Answered'}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── Custom Field Data ── */}
          {person.field_data && person.field_data.length > 0 && (
            <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide flex items-center gap-1.5">
                <Tag className="w-4 h-4 text-indigo-500" />
                Custom Profile Attributes
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {person.field_data.map((f, idx) => (
                  <div key={idx} className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60 text-xs">
                    <span className="text-[10px] text-slate-400 font-bold uppercase block truncate">{f.field_definition?.name || 'Custom Field'}</span>
                    <span className="font-semibold text-slate-800 dark:text-white mt-0.5 block truncate">{f.value || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* ── Contact Details ── */}
          <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide">Contact Information</h3>
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-sm">
                <Mail className="w-4 h-4 text-slate-400 flex-shrink-0" />
                {resolvedEmail ? (
                  <a href={`mailto:${resolvedEmail}`} className="text-indigo-600 dark:text-indigo-400 hover:underline break-all font-semibold">
                    {resolvedEmail}
                  </a>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 italic">No email address</span>
                )}
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Phone className="w-4 h-4 text-slate-400 flex-shrink-0" />
                {resolvedPhone ? (
                  <a href={`tel:${resolvedPhone}`} className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold">
                    {resolvedPhone}
                  </a>
                ) : (
                  <span className="text-slate-400 dark:text-slate-500 italic">No phone number</span>
                )}
              </div>
            </div>
          </div>

          {/* ── Pastoral Care Notes ── */}
          <div id="person-notes-section" className="p-4 rounded-2xl border border-indigo-100 dark:border-indigo-900/40 bg-indigo-50/50 dark:bg-indigo-950/10 space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <NotebookPen className="w-4 h-4 text-indigo-500" />
                <h3 className="text-xs font-bold uppercase text-slate-500 dark:text-slate-400 tracking-wide">
                  Pastoral Care Notes
                </h3>
                {notes.length > 0 && (
                  <span className="text-[10px] font-black bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                    {notes.length}
                  </span>
                )}
              </div>
              {!showNoteForm && (
                <button
                  onClick={() => setShowNoteForm(true)}
                  className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide text-white bg-indigo-600 hover:bg-indigo-700 px-3 py-1.5 rounded-lg transition-colors"
                >
                  <Plus className="w-3 h-3" /> Add Note
                </button>
              )}
            </div>

            {/* Success banner */}
            {noteSaveSuccess && (
              <div className="flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-3">
                <CheckCircle className="w-4 h-4 flex-shrink-0" />
                <span>Note saved{pcoConnected ? ' and synced to Planning Center' : ''}!</span>
              </div>
            )}

            {/* Add Note Form */}
            {showNoteForm && (
              <div className="bg-white dark:bg-slate-800 border border-indigo-200 dark:border-indigo-800/50 rounded-2xl p-4 space-y-3 shadow-sm">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">New Care Note</span>
                  <button
                    onClick={() => { setShowNoteForm(false); setNoteContent(''); setNoteSaveError(''); }}
                    className="text-slate-400 hover:text-rose-500 transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Type selector */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-1.5">
                    Type
                  </label>
                  <div className="flex flex-wrap gap-1.5">
                    {NOTE_TYPES.map(t => (
                      <button
                        key={t}
                        onClick={() => setNoteType(t)}
                        className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-wide transition-all ${
                          noteType === t
                            ? 'bg-indigo-600 text-white shadow-sm'
                            : 'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-600'
                        }`}
                      >
                        {t}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Content */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-1.5">
                    Notes <span className="text-rose-400">*</span>
                  </label>
                  <textarea
                    value={noteContent}
                    onChange={e => { setNoteContent(e.target.value); if (noteSaveError) setNoteSaveError(''); }}
                    placeholder={`What happened in this ${noteType.toLowerCase()}?`}
                    rows={4}
                    className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 p-3 outline-none resize-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors placeholder:text-slate-400"
                    disabled={savingNote}
                  />
                </div>

                {/* Follow-up date (optional) */}
                <div>
                  <label className="text-[10px] font-bold uppercase tracking-wide text-slate-400 block mb-1.5">
                    Follow-up Date <span className="text-slate-300 dark:text-slate-600 font-medium normal-case tracking-normal">(optional)</span>
                  </label>
                  <input
                    type="date"
                    value={noteFollowUp}
                    onChange={e => setNoteFollowUp(e.target.value)}
                    className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 p-3 outline-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors"
                    disabled={savingNote}
                  />
                </div>

                {noteSaveError && (
                  <div className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl p-3">
                    <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>{noteSaveError}</span>
                  </div>
                )}

                {pcoConnected && (
                  <p className="text-[10px] text-slate-400 font-medium">
                    ✓ This note will also be synced to this person's Planning Center profile.
                  </p>
                )}

                <button
                  onClick={handleSaveNote}
                  disabled={savingNote || !noteContent.trim()}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-xs"
                >
                  {savingNote ? (
                    <><Loader2 className="w-4 h-4 animate-spin" /> Saving...</>
                  ) : (
                    <><NotebookPen className="w-4 h-4" /> Save Note</>
                  )}
                </button>
              </div>
            )}

            {/* Notes list */}
            {notes.length === 0 && !showNoteForm ? (
              <p className="text-xs text-slate-400 italic text-center py-2">
                No care notes yet. Add the first one above.
              </p>
            ) : notes.length > 0 ? (
              <div className="space-y-3">
                {visibleNotes.map(note => (
                  <div key={note.id} className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-3 space-y-1.5 shadow-sm">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <span className={`text-[10px] font-black uppercase tracking-wide px-2 py-0.5 rounded-full ${NOTE_TYPE_COLORS[note.type] || NOTE_TYPE_COLORS['Note']}`}>
                        {note.type}
                      </span>
                      <span className="text-[10px] text-slate-400 font-medium">{formatDate(note.date)}</span>
                    </div>
                    <p className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed whitespace-pre-wrap">
                      {note.content}
                    </p>
                    {note.followUpDate && (
                      <p className="text-[10px] text-amber-600 dark:text-amber-400 font-bold">
                        ↪ Follow-up by {formatDate(note.followUpDate)}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 font-medium">— {note.authorName}</p>
                  </div>
                ))}

                {notes.length > 3 && (
                  <button
                    onClick={() => setShowAllNotes(v => !v)}
                    className="w-full flex items-center justify-center gap-1.5 text-[10px] font-bold uppercase tracking-wide text-indigo-500 hover:text-indigo-600 transition-colors py-1"
                  >
                    {showAllNotes ? (
                      <><ChevronUp className="w-3.5 h-3.5" /> Show less</>
                    ) : (
                      <><ChevronDown className="w-3.5 h-3.5" /> Show {notes.length - 3} more</>
                    )}
                  </button>
                )}
              </div>
            ) : null}
          </div>

          {/* ── Send SMS ── */}
          {church?.smsSettings?.smsEnabled && (
            <div id="person-sms-section" className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide">Send SMS Message</h3>
              {!person.phone ? (
                <p className="text-xs text-slate-500 italic">SMS sending is unavailable because this person has no phone number.</p>
              ) : (
                <form onSubmit={handleSendSms} className="space-y-3">
                  <div>
                    <textarea
                      value={smsBody}
                      onChange={e => { setSmsBody(e.target.value); if (smsError) setSmsError(''); if (smsSuccess) setSmsSuccess(false); }}
                      placeholder={`Type a message to ${person.name}...`}
                      rows={3}
                      maxLength={1600}
                      className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 p-3 outline-none resize-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors"
                      disabled={sendingSms}
                    />
                    <div className="flex justify-between items-center mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-wide px-1">
                      <span>{smsBody.length} characters</span>
                      <span>{Math.ceil(smsBody.length / 160) || 0} segment{Math.ceil(smsBody.length / 160) !== 1 ? 's' : ''}</span>
                    </div>
                  </div>

                  {smsError && (
                    <div className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl p-3">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>{smsError}</span>
                    </div>
                  )}
                  {smsSuccess && (
                    <div className="flex items-start gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-3">
                      <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" /><span>Message sent successfully!</span>
                    </div>
                  )}

                  <button
                    type="submit"
                    disabled={sendingSms || !smsBody.trim()}
                    className="w-full bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer disabled:cursor-not-allowed"
                  >
                    {sendingSms ? (
                      <><Loader2 className="w-4 h-4 animate-spin" />Sending...</>
                    ) : (
                      <><Send className="w-4 h-4" />Send SMS</>
                    )}
                  </button>
                </form>
              )}
            </div>
          )}

          {/* ── Current Risk Status ── */}
          {riskProfile && (
            <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide mb-3">Current Risk Profile</h3>
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-black ${
                  riskProfile.category === 'Healthy'       ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400' :
                  riskProfile.category === 'At Risk'       ? 'bg-amber-100 text-amber-600 dark:bg-amber-950/40 dark:text-amber-400' :
                  'bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400'
                }`}>
                  {riskProfile.score}
                </div>
                <div>
                  <span className={`text-sm font-black ${
                    riskProfile.category === 'Healthy'     ? 'text-emerald-600 dark:text-emerald-400' :
                    riskProfile.category === 'At Risk'     ? 'text-amber-600 dark:text-amber-400' :
                    'text-rose-600 dark:text-rose-400'
                  }`}>
                    {riskProfile.category}
                  </span>
                </div>
              </div>
              {riskProfile.factors && riskProfile.factors.length > 0 && (
                <ul className="space-y-1">
                  {riskProfile.factors.map((f, i) => (
                    <li key={i} className="text-xs text-slate-600 dark:text-slate-300 flex gap-2">
                      <span className="text-rose-500">•</span> {f}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* ── Serving Involvement ── */}
          <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide flex items-center gap-1.5">
                <HeartHandshake className="w-4 h-4 text-indigo-500" />
                Serving Involvement
              </h3>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
                {timesServed} in last 90 days
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Weekly Serving Avg</span>
                <span className="font-bold text-slate-800 dark:text-white mt-0.5 block">
                  {servingStats?.timesPerWeek ?? (timesServed / (90 / 7)).toFixed(2)}x / week
                </span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60">
                <span className="text-[10px] text-slate-400 font-bold uppercase block">Next Service Date</span>
                <span className="font-bold text-slate-800 dark:text-white mt-0.5 block">
                  {servingStats?.nextServiceDate ? formatDate(servingStats.nextServiceDate) : 'None scheduled'}
                </span>
              </div>
            </div>

            {servingStats?.recentServices && servingStats.recentServices.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Recent Confirmed Services:</span>
                <div className="space-y-1">
                  {servingStats.recentServices.slice(0, 5).map((srv, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-white dark:bg-slate-800 px-3 py-2 rounded-xl text-xs border border-slate-100 dark:border-slate-700/60">
                      <span className="font-medium text-slate-700 dark:text-slate-300">{srv.teamName || srv.serviceTypeName || 'Service Team'}</span>
                      <span className="text-[10px] font-bold text-slate-400">{formatDate(srv.date)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* ── Risk Timeline ── */}
          <div>
            <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide mb-4">Risk Progression Timeline</h3>
            {timeline.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No historical risk changes recorded.</p>
            ) : (
              <div className="relative border-l-2 border-slate-200 dark:border-slate-800 ml-3 space-y-6 pb-4">
                {timeline.map(record => (
                  <div key={record.id} className="relative pl-6">
                    <div className={`absolute -left-[9px] top-1 w-4 h-4 rounded-full border-2 border-white dark:border-slate-900 ${
                      record.newCategory === 'Healthy'   ? 'bg-emerald-500' :
                      record.newCategory === 'At Risk'   ? 'bg-amber-500'   :
                      'bg-rose-500'
                    }`} />
                    <div className="bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 rounded-xl p-4 shadow-sm">
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                          {new Date(record.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                        </span>
                        <span className="text-xs font-black text-slate-600 dark:text-slate-350">
                          {record.oldCategory} ➝ <span className={
                            record.newCategory === 'Healthy'   ? 'text-emerald-600 dark:text-emerald-400' :
                            record.newCategory === 'At Risk'   ? 'text-amber-600 dark:text-amber-400'   :
                            'text-rose-600 dark:text-rose-400'
                          }>{record.newCategory}</span>
                        </span>
                      </div>
                      {record.oldScore !== undefined && record.newScore !== undefined && (
                        <div className="text-xs text-slate-500 dark:text-slate-400 mb-2 font-medium">
                          Score changed from {record.oldScore} to {record.newScore}
                        </div>
                      )}
                      {record.reasons && record.reasons.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide mb-1">Triggered by:</p>
                          <ul className="space-y-1">
                            {record.reasons.map((r, i) => (
                              <li key={i} className="text-xs text-slate-600 dark:text-slate-300">• {r}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>
      ) : (
        <div className="text-sm text-slate-500">Person not found.</div>
      )}
    </Drawer>
  );
};
