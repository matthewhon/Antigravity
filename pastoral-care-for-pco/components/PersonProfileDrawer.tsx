import React, { useEffect, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { Drawer } from './Drawer';
import { firestore } from '../services/firestoreService';
import { pcoService } from '../services/pcoService';
import { PcoPerson, RiskChangeRecord, PastoralNote, PcoGroup, PrayerRequest, DetailedDonation, User, ServicesTeam, PcoRegistrationEvent, PcoRegistrationAttendee, GiftsTestResponse, MbtiTestResponse, DiscTestResponse } from '../types';
import { SPIRITUAL_GIFTS_DEFINITIONS, SPIRITUAL_GIFTS_QUESTIONS } from '../constants/spiritualGiftsTestData';
import { MBTI_TYPE_PROFILES, MBTI_QUESTIONS } from '../constants/mbtiTestData';
import { DISC_PROFILES, DISC_QUESTIONS, DISC_DIMENSIONS_INFO, DiscDimension } from '../constants/discTestData';
import { useTenantData } from '../contexts/TenantDataContext';
import { PastoralEngagementModal } from './PastoralEngagementModal';
import {
  Mail, Phone, Send, Loader2, CheckCircle, AlertCircle,
  NotebookPen, ChevronDown, ChevronUp, Plus, X,
  ShieldAlert, Activity, HeartHandshake, CalendarCheck, UserCheck,
  Users, Church as ChurchIcon, Sparkles, DollarSign,
  Heart, Clock, Tag, Check, Calendar, CheckSquare,
  Compass, ExternalLink, Copy, Share2, Award, QrCode, Brain,
  MessageSquare
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
  const [giftsResponses, setGiftsResponses] = useState<GiftsTestResponse[]>([]);
  const [selectedGiftsModal, setSelectedGiftsModal] = useState<GiftsTestResponse | null>(null);
  const [copiedGiftsLink, setCopiedGiftsLink] = useState(false);
  const [mbtiResponses, setMbtiResponses] = useState<MbtiTestResponse[]>([]);
  const [selectedMbtiModal, setSelectedMbtiModal] = useState<MbtiTestResponse | null>(null);
  const [copiedMbtiLink, setCopiedMbtiLink] = useState(false);
  const [discResponses, setDiscResponses] = useState<DiscTestResponse[]>([]);
  const [selectedDiscModal, setSelectedDiscModal] = useState<DiscTestResponse | null>(null);
  const [copiedDiscLink, setCopiedDiscLink] = useState(false);
  const [showEngagementModal, setShowEngagementModal] = useState<boolean>(false);
  const [loading, setLoading] = useState(false);

  // Suggestion selections & actions
  const [showNextStepsModal, setShowNextStepsModal] = useState<boolean>(false);
  const [selectedGroupSuggestion, setSelectedGroupSuggestion] = useState<string>('');
  const [selectedTeamSuggestion, setSelectedTeamSuggestion] = useState<string>('');
  const [selectedEventSuggestion, setSelectedEventSuggestion] = useState<string>('');
  const [copiedItemId, setCopiedItemId] = useState<string | null>(null);
  const [feedbackToast, setFeedbackToast] = useState<string | null>(null);

  // Next Steps direct SMS composer box
  const [activeSmsPathway, setActiveSmsPathway] = useState<{
    pathway: 'group' | 'team' | 'event';
    targetName: string;
    messageText: string;
    autoLogNote: boolean;
  } | null>(null);
  const [sendingPathwaySms, setSendingPathwaySms] = useState(false);
  const [pathwaySmsError, setPathwaySmsError] = useState('');
  const [pathwaySmsSuccess, setPathwaySmsSuccess] = useState(false);

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

  const handleOpenNativeSms = (textToSend?: string) => {
    const targetPhone = getPersonPhone(person);
    const msg = (textToSend !== undefined ? textToSend : smsBody).trim();
    if (!targetPhone) {
      if (msg) {
        navigator.clipboard.writeText(msg);
        setFeedbackToast('Message copied to clipboard (no phone number on file).');
      }
      return;
    }
    const cleaned = targetPhone.replace(/[^\d+]/g, '');
    const smsUri = `sms:${cleaned}?&body=${encodeURIComponent(msg)}`;
    window.open(smsUri, '_system');
    setFeedbackToast('Opening messaging app...');
  };

  const handleSendSms = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetPhone = getPersonPhone(person);
    if (!targetPhone) {
      setSmsError('This person has no phone number on file.');
      return;
    }
    if (!smsBody.trim()) {
      setSmsError('Please enter a message to send.');
      return;
    }
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
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Send failed (HTTP ${res.status})`);
      }
      setSmsSuccess(true);
      setSmsBody('');
      if (person?.id) {
        window.dispatchEvent(new CustomEvent('careFollowUpCompleted', { detail: person.id }));
      }
      setFeedbackToast(`SMS successfully sent to ${person.name}!`);
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
      setGiftsResponses([]);
      setMbtiResponses([]);
      setDiscResponses([]);
      try {
        const [people, changes, personNotes, outreachSlots, fetchedGroups, fetchedPrayers, fetchedDonations, fetchedTeams, fetchedRegistrations, fetchedAttendees, fetchedGifts, fetchedMbti, fetchedDisc] = await Promise.all([
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
          firestore.getGiftsTestResponses(churchId),
          firestore.getMbtiResponses(churchId),
          firestore.getDiscResponses(churchId),
        ]);
        setAllPeople(people);
        setGroups(fetchedGroups);
        setPrayerRequests(fetchedPrayers);
        setDonations(fetchedDonations || []);
        setTeams(fetchedTeams || []);
        setRegistrations(fetchedRegistrations || []);
        setAttendees(fetchedAttendees || []);
        const p = people.find(p => p.id === personId);
        if (p) {
          setPerson(p);
          const pEmail = getPersonEmail(p);
          const matchedGifts = (fetchedGifts || []).filter(g => 
            g.personId === personId || 
            (pEmail && g.email && g.email.toLowerCase() === pEmail.toLowerCase())
          );
          setGiftsResponses(matchedGifts);

          const matchedMbti = (fetchedMbti || []).filter(m =>
            m.personId === personId ||
            (pEmail && m.email && m.email.toLowerCase() === pEmail.toLowerCase())
          );
          setMbtiResponses(matchedMbti);

          const matchedDisc = (fetchedDisc || []).filter(d =>
            d.personId === personId ||
            (pEmail && d.email && d.email.toLowerCase() === pEmail.toLowerCase())
          );
          setDiscResponses(matchedDisc);
        }
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

  const handleOpenPathwaySms = (pathway: 'group' | 'team' | 'event', targetName: string, defaultText: string) => {
    setPathwaySmsError('');
    setPathwaySmsSuccess(false);
    setActiveSmsPathway({
      pathway,
      targetName,
      messageText: defaultText,
      autoLogNote: true,
    });
  };

  const handleSendPathwaySms = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeSmsPathway) return;
    const targetPhone = getPersonPhone(person);
    if (!targetPhone) {
      setPathwaySmsError('This person has no phone number on file.');
      return;
    }
    if (!activeSmsPathway.messageText.trim()) {
      setPathwaySmsError('Please enter an SMS message.');
      return;
    }

    setSendingPathwaySms(true);
    setPathwaySmsError('');
    setPathwaySmsSuccess(false);

    try {
      const cleanedPhone = targetPhone.replace(/[^\d+]/g, '');
      const res = await fetch(`${API_BASE}/api/messaging/send-individual`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          churchId,
          toPhone: cleanedPhone,
          body: activeSmsPathway.messageText.trim(),
          sentBy: user?.id || null,
          sentByName: user?.name || null,
          personId: person?.id,
          personName: person?.name,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || `Failed to send SMS (HTTP ${res.status})`);
      }

      setPathwaySmsSuccess(true);

      // Auto-log pastoral note if checked
      if (activeSmsPathway.autoLogNote && person) {
        try {
          const now = new Date();
          const noteTypeVal: PastoralNote['type'] = 
            activeSmsPathway.pathway === 'group' ? 'Call' : 
            activeSmsPathway.pathway === 'team' ? 'Meeting' : 'Note';

          const pathwayTitle = 
            activeSmsPathway.pathway === 'group' ? 'Small Group Invite' :
            activeSmsPathway.pathway === 'team' ? 'Service Team Outreach' : 'Event Registration Invite';

          const autoNote: PastoralNote = {
            id: `note_${Date.now()}`,
            churchId,
            personId: person.id,
            personName: person.name,
            authorId: user?.id || 'system',
            authorName: user?.name || 'Staff',
            date: now.toISOString().split('T')[0],
            type: noteTypeVal,
            content: `[SMS Outreach: ${pathwayTitle}]\nTarget: ${activeSmsPathway.targetName}\nMessage: "${activeSmsPathway.messageText.trim()}"`,
            isCompleted: true,
            tags: ['Next Steps', 'SMS Outreach'],
          } as any;

          await firestore.savePastoralNote(autoNote);
          setNotes(prev => [autoNote, ...prev]);

          if (pcoConnected) {
            try {
              await pcoService.addNoteToPerson(churchId, person.id, `[Pastoral Care SMS: ${pathwayTitle}]\n${autoNote.content}`);
            } catch (pcoErr) {
              console.warn('PCO note sync failed:', pcoErr);
            }
          }
        } catch (noteErr) {
          console.warn('Auto-logging note failed:', noteErr);
        }
      }

      if (person?.id) {
        window.dispatchEvent(new CustomEvent('careFollowUpCompleted', { detail: person.id }));
      }

      setFeedbackToast(`SMS sent to ${person.name} via church messaging system!`);
    } catch (err: any) {
      setPathwaySmsError(err.message || 'An error occurred while sending the message.');
    } finally {
      setSendingPathwaySms(false);
    }
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
          <div className={`p-3.5 rounded-2xl border flex flex-col min-[480px]:flex-row items-start min-[480px]:items-center justify-between gap-2.5 text-xs ${
            daysSinceLastTouchpoint === null ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300' :
            daysSinceLastTouchpoint <= 30 ? 'bg-emerald-50 dark:bg-emerald-950/20 border-emerald-200 dark:border-emerald-900/30 text-emerald-800 dark:text-emerald-300' :
            daysSinceLastTouchpoint <= 60 ? 'bg-amber-50 dark:bg-amber-950/20 border-amber-200 dark:border-amber-900/30 text-amber-800 dark:text-amber-300' :
            'bg-rose-50 dark:bg-rose-950/20 border-rose-200 dark:border-rose-900/30 text-rose-800 dark:text-rose-300'
          }`}>
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <Clock className="w-4 h-4 shrink-0 text-current opacity-80" />
              <div className="min-w-0 flex-1">
                <span className="font-bold block truncate">
                  {daysSinceLastTouchpoint === null 
                    ? 'No pastoral contact logged yet'
                    : `Last touchpoint ${daysSinceLastTouchpoint === 0 ? 'today' : `${daysSinceLastTouchpoint} day${daysSinceLastTouchpoint > 1 ? 's' : ''} ago`}`}
                </span>
                {notes.length > 0 && (
                  <span className="text-[11px] opacity-80 block truncate">
                    {notes[0].type} on {formatDate(notes[0].date)} by {notes[0].authorName}
                  </span>
                )}
              </div>
            </div>
            {person.primaryCampusName && (
              <span className="text-[10px] font-black uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/90 dark:bg-slate-800/90 shrink-0 border border-current/20 shadow-xs self-start min-[480px]:self-auto">
                🏛️ {person.primaryCampusName}
              </span>
            )}
          </div>

          {/* ── Suggested Next Steps Trigger Banner ── */}
          <div className="p-3.5 sm:p-4 rounded-2xl border border-indigo-200/80 dark:border-indigo-900/60 bg-gradient-to-br from-indigo-50/80 via-white to-purple-50/50 dark:from-indigo-950/30 dark:via-slate-900 dark:to-purple-950/20 shadow-xs flex flex-col min-[480px]:flex-row items-stretch min-[480px]:items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0 flex-1">
              <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                <Compass className="w-4 h-4" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5 flex-wrap">
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
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
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
              className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-black uppercase tracking-wider flex items-center justify-center gap-1.5 transition shadow-sm active:scale-95 shrink-0 cursor-pointer"
            >
              <span>View Next Steps</span>
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* ── Suggested Next Steps Popout Window Modal (Rendered via React Portal) ── */}
          {showNextStepsModal && typeof document !== 'undefined' && createPortal(
            <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-6 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
              <div className="absolute inset-0" onClick={() => setShowNextStepsModal(false)} />
              <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-2xl flex flex-col max-h-[90vh] z-10 animate-in zoom-in-95 duration-200">
                {/* Popout Header */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-11 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-md shrink-0">
                      <Compass className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="text-lg font-black text-slate-900 dark:text-white">
                          Suggested Next Steps for {person.name}
                        </h3>
                        <span className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300">
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
                    className="w-9 h-9 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-500 dark:text-slate-400 flex items-center justify-center transition cursor-pointer"
                  >
                    <X className="w-5 h-5" />
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
                  {/* Direct SMS Outreach Box on the Popout Window */}
                  {activeSmsPathway && (
                    <div className="p-4 sm:p-5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/30 border-2 border-indigo-300 dark:border-indigo-700/60 space-y-3 animate-in slide-in-from-top-2 duration-200">
                      <div className="flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
                            <Send className="w-4 h-4" />
                          </div>
                          <div>
                            <h4 className="text-sm font-black text-slate-900 dark:text-white">
                              Send SMS via Church System
                            </h4>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                              Recipient: <span className="font-bold text-slate-800 dark:text-slate-200">{person.name}</span>{' '}
                              {resolvedPhone ? (
                                <span className="text-indigo-600 dark:text-indigo-400 font-bold">({resolvedPhone})</span>
                              ) : (
                                <span className="text-rose-500 font-bold">(No Phone on file)</span>
                              )}
                            </p>
                          </div>
                        </div>
                        <span className="text-[10px] font-black uppercase px-2.5 py-1 rounded-full bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800">
                          {activeSmsPathway.pathway === 'group' ? `🌱 Group: ${activeSmsPathway.targetName}` :
                           activeSmsPathway.pathway === 'team' ? `🤝 Team: ${activeSmsPathway.targetName}` :
                           `🎟️ Event: ${activeSmsPathway.targetName}`}
                        </span>
                      </div>

                      <form onSubmit={handleSendPathwaySms} className="space-y-3">
                        <div>
                          <textarea
                            value={activeSmsPathway.messageText}
                            onChange={e => {
                              const val = e.target.value;
                              setActiveSmsPathway(prev => prev ? { ...prev, messageText: val } : null);
                              if (pathwaySmsError) setPathwaySmsError('');
                              if (pathwaySmsSuccess) setPathwaySmsSuccess(false);
                            }}
                            placeholder="Type your SMS message..."
                            rows={4}
                            maxLength={1600}
                            disabled={sendingPathwaySms || !resolvedPhone}
                            className="w-full text-xs sm:text-sm rounded-xl border border-indigo-200 dark:border-indigo-800 focus:border-indigo-600 focus:ring-1 focus:ring-indigo-600 p-3 outline-none resize-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors disabled:opacity-50"
                          />
                          <div className="flex justify-between items-center mt-1 text-[10px] text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide px-1">
                            <span>{activeSmsPathway.messageText.length} characters</span>
                            <span>{Math.ceil(activeSmsPathway.messageText.length / 160) || 0} SMS segment{Math.ceil(activeSmsPathway.messageText.length / 160) !== 1 ? 's' : ''}</span>
                          </div>
                        </div>

                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            id="auto-log-pathway-note"
                            checked={activeSmsPathway.autoLogNote}
                            onChange={e => setActiveSmsPathway(prev => prev ? { ...prev, autoLogNote: e.target.checked } : null)}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700"
                          />
                          <label htmlFor="auto-log-pathway-note" className="text-xs text-slate-700 dark:text-slate-300 font-medium cursor-pointer">
                            Automatically record a pastoral care note & sync to PCO
                          </label>
                        </div>

                        {pathwaySmsError && (
                          <div className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl p-3">
                            <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>{pathwaySmsError}</span>
                          </div>
                        )}

                        {pathwaySmsSuccess && (
                          <div className="flex items-start gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-3">
                            <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                            <span>Message sent successfully through our church SMS system!</span>
                          </div>
                        )}

                        <div className="flex items-center justify-end gap-2 pt-1">
                          <button
                            type="button"
                            onClick={() => setActiveSmsPathway(null)}
                            disabled={sendingPathwaySms}
                            className="px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold transition cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="submit"
                            disabled={sendingPathwaySms || !resolvedPhone || !activeSmsPathway.messageText.trim()}
                            className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl text-xs font-bold uppercase tracking-wider flex items-center gap-2 transition shadow-sm cursor-pointer"
                          >
                            {sendingPathwaySms ? (
                              <>
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                <span>Sending via SMS System...</span>
                              </>
                            ) : (
                              <>
                                <Send className="w-3.5 h-3.5" />
                                <span>Send SMS Now</span>
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Suggestion 1: Small Group */}
                  {isNotInGroup ? (
                    <div className="bg-slate-50/90 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 text-purple-600 dark:text-purple-400 flex items-center justify-center shrink-0">
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

                      <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
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
                              const msg = `Hi ${firstName}, we'd love to invite you to connect with a small group at church! Are you interested in checking out ${groupName}?`;
                              handleOpenPathwaySms('group', groupName, msg);
                            }}
                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                            title="Open SMS composer to invite via church system"
                          >
                            <Send className="w-3.5 h-3.5" /> Send SMS Invite
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const groupName = activeTargetGroup?.name || 'Small Group';
                              handleApplyNoteTemplate(`Invited ${person.name} to join ${groupName}. Follow up in 1-2 weeks.`, 'Call');
                              setShowNextStepsModal(false);
                            }}
                            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition cursor-pointer"
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
                    <div className="bg-slate-50/90 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
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

                      <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
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
                              handleOpenPathwaySms('team', teamName, msg);
                            }}
                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                            title="Open SMS composer to invite to service team via church system"
                          >
                            <Send className="w-3.5 h-3.5" /> Send SMS Outreach
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const teamName = activeTargetTeam?.name || 'Service Team';
                              handleApplyNoteTemplate(`Reached out to ${person.name} regarding serving opportunities on the ${teamName} team.`, 'Meeting');
                              setShowNextStepsModal(false);
                            }}
                            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition cursor-pointer"
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
                    <div className="bg-slate-50/90 dark:bg-slate-800/80 border border-slate-200/80 dark:border-slate-700/80 rounded-2xl p-4 sm:p-5 space-y-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
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

                      <div className="pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
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
                              handleOpenPathwaySms('event', eventName, msg);
                            }}
                            className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition shadow-sm cursor-pointer"
                            title="Open SMS composer to invite to event via church system"
                          >
                            <Send className="w-3.5 h-3.5" /> Send SMS Invite
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
                            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold uppercase tracking-wide flex items-center gap-1.5 transition cursor-pointer"
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
                    <div className="bg-emerald-50/80 dark:bg-emerald-950/20 border border-emerald-200/80 dark:border-emerald-900/30 rounded-2xl p-4 sm:p-5 flex items-center gap-3">
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
            </div>,
            document.body
          )}

          {/* ── Status & Engagement Overview Grid ── */}
          <div className="grid grid-cols-1 min-[420px]:grid-cols-3 gap-2.5">
            {/* Risk Profile Card */}
            <div className="p-3 sm:p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col justify-between overflow-hidden min-w-0">
              <div className="flex items-center justify-between gap-1 mb-1.5 min-w-0">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1 min-w-0 truncate">
                  <ShieldAlert className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">Risk</span>
                </span>
                {riskProfile && (
                  <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 ${getRiskCategoryBadgeColor(riskProfile.category)}`}>
                    {riskProfile.category}
                  </span>
                )}
              </div>
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className={`text-xl sm:text-2xl font-black shrink-0 ${
                  riskProfile?.category === 'Healthy' ? 'text-emerald-600 dark:text-emerald-400' :
                  riskProfile?.category === 'At Risk' ? 'text-amber-600 dark:text-amber-400' :
                  riskProfile ? 'text-rose-600 dark:text-rose-400' : 'text-slate-400'
                }`}>
                  {riskProfile ? riskProfile.score : 'N/A'}
                </span>
                <span className="text-[10px] text-slate-400 font-medium truncate">/ 100 score</span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate mt-1 block">
                {riskProfile?.factors && riskProfile.factors.length > 0 
                  ? `${riskProfile.factors.length} factor${riskProfile.factors.length > 1 ? 's' : ''} active` 
                  : 'Healthy status'}
              </span>
            </div>

            {/* Engagement Status Card */}
            <div className="p-3 sm:p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col justify-between overflow-hidden min-w-0">
              <div className="flex items-center justify-between gap-1 mb-1.5 min-w-0">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1 min-w-0 truncate">
                  <Activity className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">Engagement</span>
                </span>
                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 ${getEngagementBadgeColor(engagementStatus)}`}>
                  {engagementStatus}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-lg sm:text-xl font-black text-slate-800 dark:text-white truncate block">
                  {engagementStatus}
                </span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate mt-1 block">
                {person.checkInCount ? `${person.checkInCount} check-in${person.checkInCount > 1 ? 's' : ''} (90d)` : '0 check-ins (90d)'}
              </span>
            </div>

            {/* Recently Served Card */}
            <div className="p-3 sm:p-3.5 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex flex-col justify-between overflow-hidden min-w-0">
              <div className="flex items-center justify-between gap-1 mb-1.5 min-w-0">
                <span className="text-[10px] font-bold uppercase text-slate-400 tracking-wider flex items-center gap-1 min-w-0 truncate">
                  <HeartHandshake className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
                  <span className="truncate">Serving</span>
                </span>
                <span className={`text-[8px] font-black px-1.5 py-0.5 rounded border uppercase shrink-0 ${
                  timesServed > 0 
                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/40'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400 border-slate-200 dark:border-slate-700'
                }`}>
                  {timesServed > 0 ? 'Active' : 'Inactive'}
                </span>
              </div>
              <div className="flex items-baseline gap-1.5 min-w-0">
                <span className="text-xl sm:text-2xl font-black text-slate-800 dark:text-white shrink-0">
                  {timesServed}x
                </span>
                <span className="text-[10px] text-slate-400 font-medium truncate">last 90 days</span>
              </div>
              <span className="text-[10px] text-slate-500 dark:text-slate-400 font-medium truncate mt-1 block">
                {timesServed > 0 
                  ? (servingStats?.nextServiceDate ? `Next: ${formatDate(servingStats.nextServiceDate)}` : `${timesServed} service plans`)
                  : 'Not served recently'}
              </span>
            </div>
          </div>

          {/* ── Active Risk Factors Breakdown (if present) ── */}
          {riskProfile?.factors && riskProfile.factors.length > 0 && (
            <div className="p-3 rounded-2xl border border-rose-100 dark:border-rose-900/30 bg-rose-50/60 dark:bg-rose-950/20 space-y-1.5">
              <span className="text-[9px] font-black uppercase tracking-wider text-rose-500 block">
                Active Risk Factors Triggered:
              </span>
              <div className="flex flex-wrap gap-1.5">
                {riskProfile.factors.map((f, idx) => (
                  <span key={idx} className="px-2 py-0.5 rounded-lg text-[9px] font-black uppercase tracking-wider bg-white dark:bg-slate-900 text-rose-600 dark:text-rose-400 border border-rose-200 dark:border-rose-900/40 shadow-xs">
                    ⚠️ {f}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* ── Quick Actions Bar ── */}
          <div className="grid grid-cols-2 min-[440px]:grid-cols-4 gap-2">
            <button
              type="button"
              onClick={() => setShowNextStepsModal(true)}
              className="p-2.5 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950/40 dark:hover:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-900/40 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 shadow-2xs truncate"
              title="View Discipleship Pathways & Next Steps"
            >
              <Compass className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0" />
              <span className="truncate">Next Steps</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setShowNoteForm(true);
                const el = document.getElementById('person-notes-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 truncate"
              title="Add Pastoral Care Note"
            >
              <NotebookPen className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="truncate">Add Note</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const el = document.getElementById('person-sms-section');
                if (el) el.scrollIntoView({ behavior: 'smooth' });
              }}
              className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer active:scale-95 truncate"
              title="Send SMS Message"
            >
              <Send className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span className="truncate">Send SMS</span>
            </button>

            <a
              href={`https://people.planningcenteronline.com/people/${person.id}`}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition text-center active:scale-95 truncate"
              title="Open profile in Planning Center"
            >
              <span className="truncate">PCO Profile</span>
              <ExternalLink className="w-3 h-3 text-slate-400 shrink-0" />
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

          {/* ── Spiritual Gifts Assessment ── */}
          <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide flex items-center gap-1.5">
                <Award className="w-4 h-4 text-indigo-500" />
                Spiritual Gifts Profile
              </h3>
              {giftsResponses.length > 0 && (
                <span className="text-[10px] font-black bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full">
                  Completed
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
                        <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700/60 space-y-1">
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

                        <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700/60 space-y-1">
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

                      {/* Mini Score Bars */}
                      <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700/60 space-y-2">
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
                                <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
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
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-400 font-medium">
                          Taken on {new Date(latestGifts.submittedAt).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setShowEngagementModal(true)}
                            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Pastoral Strategy</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedGiftsModal(latestGifts)}
                            className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            <Compass className="w-3.5 h-3.5" />
                            <span>Full Test (42 Qs)</span>
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="text-center py-4 space-y-2 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  No Spiritual Gifts Test on file for {person.name}.
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const testUrl = `${window.location.origin}/gifts-test/${churchId}?personId=${person.id}&name=${encodeURIComponent(person.name)}`;
                      navigator.clipboard.writeText(testUrl);
                      setCopiedGiftsLink(true);
                      setTimeout(() => setCopiedGiftsLink(false), 2500);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    {copiedGiftsLink ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedGiftsLink ? 'Link Copied!' : 'Copy Test Link'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const testUrl = `${window.location.origin}/gifts-test/${churchId}?personId=${person.id}&name=${encodeURIComponent(person.name)}`;
                      setSmsBody(`Hi ${person.name.split(' ')[0]}! Please take our church Spiritual Gifts Test to discover how God has gifted you: ${testUrl}`);
                      setFeedbackToast('Spiritual gifts test link loaded into SMS composer below.');
                      const smsElem = document.getElementById('person-sms-section');
                      if (smsElem) smsElem.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    <span>Send via SMS</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Myers-Briggs (MBTI) Personality ── */}
          <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-violet-500" />
                Myers-Briggs (MBTI) Profile
              </h3>
              {mbtiResponses.length > 0 && (
                <span className="text-[10px] font-black bg-violet-100 dark:bg-violet-950/60 text-violet-700 dark:text-violet-300 px-2 py-0.5 rounded-full">
                  Completed
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
                      <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700/60 space-y-2">
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

                      {/* Mini 4-Dimension Percentage Sliders */}
                      {latestMbti.traitPercentages && (
                        <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700/60 space-y-2">
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
                              <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden flex">
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
                              <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden flex">
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
                              <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden flex">
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
                              <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden flex">
                                <div className="h-full bg-emerald-600" style={{ width: `${latestMbti.traitPercentages.structure.jPercent}%` }} />
                                <div className="h-full bg-teal-400" style={{ width: `${latestMbti.traitPercentages.structure.pPercent}%` }} />
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-400 font-medium">
                          Taken on {new Date(latestMbti.submittedAt).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setShowEngagementModal(true)}
                            className="text-xs font-bold text-violet-600 dark:text-violet-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Pastoral Strategy</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedMbtiModal(latestMbti)}
                            className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            <Compass className="w-3.5 h-3.5" />
                            <span>Full Test (28 Qs)</span>
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="text-center py-4 space-y-2 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  No MBTI Personality Test on file for {person.name}.
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const testUrl = `${window.location.origin}/mbti-test/${churchId}?personId=${person.id}&name=${encodeURIComponent(person.name)}`;
                      navigator.clipboard.writeText(testUrl);
                      setCopiedMbtiLink(true);
                      setTimeout(() => setCopiedMbtiLink(false), 2500);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    {copiedMbtiLink ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedMbtiLink ? 'Link Copied!' : 'Copy Test Link'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const testUrl = `${window.location.origin}/mbti-test/${churchId}?personId=${person.id}&name=${encodeURIComponent(person.name)}`;
                      setSmsBody(`Hi ${person.name.split(' ')[0]}! Please take our church Myers-Briggs Personality Assessment to discover your 16 personality profile: ${testUrl}`);
                      setFeedbackToast('MBTI test link loaded into SMS composer below.');
                      const smsElem = document.getElementById('person-sms-section');
                      if (smsElem) smsElem.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    <span>Send via SMS</span>
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Faith-Based DISC Personality (KJV) ── */}
          <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide flex items-center gap-1.5">
                <Compass className="w-4 h-4 text-emerald-500" />
                Faith-Based DISC Profile (KJV)
              </h3>
              {discResponses.length > 0 && (
                <span className="text-[10px] font-black bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 px-2 py-0.5 rounded-full">
                  Completed
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
                      <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700/60 space-y-2">
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
                          <div className="p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border-l-2 border-emerald-600 text-[10px] italic text-slate-700 dark:text-slate-300 font-serif">
                            “{discProf.themeVerseKjv.text}” <span className="font-bold font-sans not-italic text-emerald-700 dark:text-emerald-400">— {discProf.themeVerseKjv.verse}</span>
                          </div>
                        )}
                      </div>

                      {/* 4 Dimension Percentage Sliders */}
                      {latestDisc.percentages && (
                        <div className="p-3 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700/60 space-y-2">
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
                                  <div className="w-full bg-slate-100 dark:bg-slate-700 h-1.5 rounded-full overflow-hidden">
                                    <div className="h-full" style={{ width: `${Math.max(5, pct)}%`, backgroundColor: info.color }} />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center justify-between pt-1">
                        <span className="text-[10px] text-slate-400 font-medium">
                          Taken on {new Date(latestDisc.submittedAt).toLocaleDateString()}
                        </span>
                        <div className="flex items-center gap-3">
                          <button
                            type="button"
                            onClick={() => setShowEngagementModal(true)}
                            className="text-xs font-bold text-emerald-600 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>Pastoral Strategy</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => setSelectedDiscModal(latestDisc)}
                            className="text-xs font-bold text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-white flex items-center gap-1 cursor-pointer"
                          >
                            <Compass className="w-3.5 h-3.5" />
                            <span>Full Test (28 Statements)</span>
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            ) : (
              <div className="text-center py-4 space-y-2 bg-white dark:bg-slate-800 rounded-xl border border-dashed border-slate-200 dark:border-slate-700 p-4">
                <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                  No Faith-Based DISC Assessment on file for {person.name}.
                </p>
                <div className="flex items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      const testUrl = `${window.location.origin}/disc-test/${churchId}?personId=${person.id}&name=${encodeURIComponent(person.name)}`;
                      navigator.clipboard.writeText(testUrl);
                      setCopiedDiscLink(true);
                      setTimeout(() => setCopiedDiscLink(false), 2500);
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold transition flex items-center gap-1 cursor-pointer"
                  >
                    {copiedDiscLink ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedDiscLink ? 'Link Copied!' : 'Copy Test Link'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      const testUrl = `${window.location.origin}/disc-test/${churchId}?personId=${person.id}&name=${encodeURIComponent(person.name)}`;
                      setSmsBody(`Hi ${person.name.split(' ')[0]}! Please take our church Faith-Based DISC Personality Assessment (KJV) to discover your biblical leadership & ministry style: ${testUrl}`);
                      setFeedbackToast('DISC test link loaded into SMS composer below.');
                      const smsElem = document.getElementById('person-sms-section');
                      if (smsElem) smsElem.scrollIntoView({ behavior: 'smooth' });
                    }}
                    className="px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition flex items-center gap-1 shadow-xs cursor-pointer"
                  >
                    <Send className="w-3 h-3" />
                    <span>Send via SMS</span>
                  </button>
                </div>
              </div>
            )}
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

          {/* ── Send SMS Message ── */}
          <div id="person-sms-section" className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5 text-indigo-500" />
                Send SMS Message
              </h3>
              {resolvedPhone ? (
                <span className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                  To: <span className="text-indigo-600 dark:text-indigo-400 font-bold">{resolvedPhone}</span>
                </span>
              ) : (
                <span className="text-[10px] font-bold text-rose-500 uppercase tracking-wide">
                  No Phone on File
                </span>
              )}
            </div>

            {!resolvedPhone ? (
              <div className="p-3 bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-900/30 rounded-xl text-xs text-amber-800 dark:text-amber-300 space-y-1">
                <p className="font-bold">No phone number on record for {person.name}.</p>
                <p className="text-[11px] text-amber-700 dark:text-amber-400">
                  Add a phone number in Planning Center People to send SMS outreach.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSendSms} className="space-y-3">
                <div>
                  <textarea
                    value={smsBody}
                    onChange={e => { 
                      setSmsBody(e.target.value); 
                      if (smsError) setSmsError(''); 
                      if (smsSuccess) setSmsSuccess(false); 
                    }}
                    placeholder={`Type a personal SMS message to ${person.name}...`}
                    rows={3}
                    maxLength={1600}
                    className="w-full text-sm rounded-xl border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 p-3 outline-none resize-none bg-white dark:bg-slate-900 text-slate-900 dark:text-white transition-colors"
                    disabled={sendingSms}
                  />
                  <div className="flex justify-between items-center mt-1 text-[10px] text-slate-400 font-bold uppercase tracking-wide px-1">
                    <span>{smsBody.length} characters</span>
                    <span>{Math.ceil(smsBody.length / 160) || 0} SMS segment{Math.ceil(smsBody.length / 160) !== 1 ? 's' : ''}</span>
                  </div>
                </div>

                {smsError && (
                  <div className="space-y-2">
                    <div className="flex items-start gap-2 text-xs text-rose-600 dark:text-rose-400 bg-rose-50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/30 rounded-xl p-3">
                      <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                      <div>
                        <span className="font-bold block">Church SMS Send Failed:</span>
                        <span>{smsError}</span>
                      </div>
                    </div>
                    {resolvedPhone && (
                      <button
                        type="button"
                        onClick={() => handleOpenNativeSms()}
                        className="w-full py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-800 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Send className="w-3.5 h-3.5 text-indigo-500" />
                        <span>Send via Device Messaging App (`sms:`) instead</span>
                      </button>
                    )}
                  </div>
                )}

                {smsSuccess && (
                  <div className="flex items-start gap-2 text-xs text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 rounded-xl p-3">
                    <CheckCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                    <span>Message sent successfully via church SMS system!</span>
                  </div>
                )}

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  {church?.smsSettings?.smsEnabled ? (
                    <>
                      <button
                        type="submit"
                        disabled={sendingSms || !smsBody.trim()}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer disabled:cursor-not-allowed shadow-xs"
                      >
                        {sendingSms ? (
                          <><Loader2 className="w-4 h-4 animate-spin" />Sending via Church SMS...</>
                        ) : (
                          <><Send className="w-4 h-4" />Send via Church SMS</>
                        )}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleOpenNativeSms()}
                        disabled={!smsBody.trim()}
                        className="py-2.5 px-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                        title="Open device messaging app with this message"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                        <span>Text from Device</span>
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => handleOpenNativeSms()}
                        disabled={!smsBody.trim()}
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-bold py-2.5 px-4 rounded-xl flex items-center justify-center gap-2 transition-colors text-xs cursor-pointer disabled:cursor-not-allowed shadow-xs"
                      >
                        <Send className="w-4 h-4" />
                        <span>Send via Device Messaging App (`sms:`)</span>
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          navigator.clipboard.writeText(smsBody);
                          setFeedbackToast('Message copied to clipboard!');
                        }}
                        disabled={!smsBody.trim()}
                        className="py-2.5 px-3.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 disabled:opacity-50 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition cursor-pointer"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span>Copy</span>
                      </button>
                    </>
                  )}
                </div>
              </form>
            )}
          </div>

          {/* ── Serving Involvement & History ── */}
          <div className="p-4 rounded-2xl border border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-xs font-bold uppercase text-slate-400 tracking-wide flex items-center gap-1.5 min-w-0">
                <HeartHandshake className="w-4 h-4 text-indigo-500 shrink-0" />
                <span className="truncate">Serving Involvement</span>
              </h3>
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300 shrink-0">
                {timesServed} in last 90 days
              </span>
            </div>

            <div className="grid grid-cols-2 gap-2 text-xs">
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60 min-w-0 overflow-hidden">
                <span className="text-[10px] text-slate-400 font-bold uppercase block truncate">Weekly Avg</span>
                <span className="font-bold text-slate-800 dark:text-white mt-0.5 block truncate">
                  {servingStats?.timesPerWeek ?? (timesServed / (90 / 7)).toFixed(2)}x / week
                </span>
              </div>
              <div className="bg-white dark:bg-slate-800 p-2.5 rounded-xl border border-slate-100 dark:border-slate-700/60 min-w-0 overflow-hidden">
                <span className="text-[10px] text-slate-400 font-bold uppercase block truncate">Next Service</span>
                <span className="font-bold text-slate-800 dark:text-white mt-0.5 block truncate">
                  {servingStats?.nextServiceDate ? formatDate(servingStats.nextServiceDate) : 'None scheduled'}
                </span>
              </div>
            </div>

            {servingStats?.recentServices && servingStats.recentServices.length > 0 && (
              <div className="space-y-1.5 pt-1">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">Recent Confirmed Services:</span>
                <div className="space-y-1">
                  {servingStats.recentServices.slice(0, 5).map((srv, idx) => (
                    <div key={idx} className="flex justify-between items-center bg-white dark:bg-slate-800 px-3 py-2 rounded-xl text-xs border border-slate-100 dark:border-slate-700/60 min-w-0">
                      <span className="font-medium text-slate-700 dark:text-slate-300 truncate mr-2">{srv.teamName || srv.serviceTypeName || 'Service Team'}</span>
                      <span className="text-[10px] font-bold text-slate-400 shrink-0">{formatDate(srv.date)}</span>
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

          {/* ── Spiritual Gifts Modal Breakdown ── */}
          {selectedGiftsModal && createPortal(
            <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md"
                      style={{ backgroundColor: SPIRITUAL_GIFTS_DEFINITIONS[selectedGiftsModal.primaryGift]?.color || '#6366f1' }}
                    >
                      <Award className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-slate-900 dark:text-white">
                        Spiritual Gifts: {person.name}
                      </h4>
                      <p className="text-xs text-slate-400">
                        Taken on {new Date(selectedGiftsModal.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedGiftsModal(null)}
                    className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="p-3.5 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-1">
                      <span className="text-[10px] font-black uppercase text-indigo-600 dark:text-indigo-400 tracking-wider">Primary Gift</span>
                      <div className="text-lg font-black text-slate-900 dark:text-white">
                        {selectedGiftsModal.primaryGift} ({selectedGiftsModal.scores?.[selectedGiftsModal.primaryGift.toLowerCase() as keyof typeof selectedGiftsModal.scores] || 0}/35)
                      </div>
                      <p className="text-[11px] text-slate-600 dark:text-slate-300">
                        {SPIRITUAL_GIFTS_DEFINITIONS[selectedGiftsModal.primaryGift]?.shortDescription}
                      </p>
                    </div>

                    <div className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                      <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">Secondary Gift</span>
                      <div className="text-lg font-black text-slate-900 dark:text-white">
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
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden">
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
                          <div key={q.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start justify-between gap-2">
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

          {/* ── Myers-Briggs (MBTI) Modal Breakdown ── */}
          {selectedMbtiModal && createPortal(
            <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md font-black text-sm"
                      style={{ backgroundColor: MBTI_TYPE_PROFILES[selectedMbtiModal.mbtiType]?.color || '#8b5cf6' }}
                    >
                      {selectedMbtiModal.mbtiType}
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-slate-900 dark:text-white">
                        MBTI Profile: {person.name}
                      </h4>
                      <p className="text-xs text-slate-400">
                        {MBTI_TYPE_PROFILES[selectedMbtiModal.mbtiType]?.name} • Taken {new Date(selectedMbtiModal.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedMbtiModal(null)}
                    className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                          <div className="flex justify-between font-bold">
                            <span>Extraversion ({selectedMbtiModal.traitPercentages.energy.ePercent}%)</span>
                            <span>Introversion ({selectedMbtiModal.traitPercentages.energy.iPercent}%)</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden flex">
                            <div className="h-full bg-violet-600" style={{ width: `${selectedMbtiModal.traitPercentages.energy.ePercent}%` }} />
                            <div className="h-full bg-indigo-400" style={{ width: `${selectedMbtiModal.traitPercentages.energy.iPercent}%` }} />
                          </div>
                        </div>

                        {/* S vs N */}
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                          <div className="flex justify-between font-bold">
                            <span>Sensing ({selectedMbtiModal.traitPercentages.information.sPercent}%)</span>
                            <span>Intuition ({selectedMbtiModal.traitPercentages.information.nPercent}%)</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden flex">
                            <div className="h-full bg-sky-600" style={{ width: `${selectedMbtiModal.traitPercentages.information.sPercent}%` }} />
                            <div className="h-full bg-cyan-400" style={{ width: `${selectedMbtiModal.traitPercentages.information.nPercent}%` }} />
                          </div>
                        </div>

                        {/* T vs F */}
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                          <div className="flex justify-between font-bold">
                            <span>Thinking ({selectedMbtiModal.traitPercentages.decisions.tPercent}%)</span>
                            <span>Feeling ({selectedMbtiModal.traitPercentages.decisions.fPercent}%)</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden flex">
                            <div className="h-full bg-amber-500" style={{ width: `${selectedMbtiModal.traitPercentages.decisions.tPercent}%` }} />
                            <div className="h-full bg-pink-400" style={{ width: `${selectedMbtiModal.traitPercentages.decisions.fPercent}%` }} />
                          </div>
                        </div>

                        {/* J vs P */}
                        <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                          <div className="flex justify-between font-bold">
                            <span>Judging ({selectedMbtiModal.traitPercentages.structure.jPercent}%)</span>
                            <span>Perceiving ({selectedMbtiModal.traitPercentages.structure.pPercent}%)</span>
                          </div>
                          <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden flex">
                            <div className="h-full bg-emerald-600" style={{ width: `${selectedMbtiModal.traitPercentages.structure.jPercent}%` }} />
                            <div className="h-full bg-teal-400" style={{ width: `${selectedMbtiModal.traitPercentages.structure.pPercent}%` }} />
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Ministry Strengths */}
                  <div className="space-y-2">
                    <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">
                      Ministry Strengths
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-700 dark:text-slate-300">
                      {MBTI_TYPE_PROFILES[selectedMbtiModal.mbtiType]?.ministryStrengths.map((s, idx) => (
                        <div key={idx} className="p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                          • {s}
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* 28 Statements */}
                  <div className="space-y-3 pt-2">
                    <h5 className="text-xs font-black uppercase tracking-wider text-slate-400">
                      Individual Ratings for all 28 Statements (1–5)
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {MBTI_QUESTIONS.map(q => {
                        const ans = selectedMbtiModal.answers?.[q.id] || 0;
                        return (
                          <div key={q.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start justify-between gap-2">
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

          {/* ── Faith-Based DISC Modal Breakdown ── */}
          {selectedDiscModal && createPortal(
            <div className="fixed inset-0 z-[100] bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
              <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95">
                <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div 
                      className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md font-black text-sm"
                      style={{ backgroundColor: DISC_PROFILES[selectedDiscModal.styleCode]?.color || '#10b981' }}
                    >
                      {selectedDiscModal.styleCode}
                    </div>
                    <div>
                      <h4 className="text-lg font-black text-slate-900 dark:text-white">
                        DISC Profile: {person.name}
                      </h4>
                      <p className="text-xs text-slate-400">
                        {DISC_PROFILES[selectedDiscModal.styleCode]?.name} • Taken {new Date(selectedDiscModal.submittedAt).toLocaleDateString()}
                      </p>
                    </div>
                  </div>

                  <button
                    onClick={() => setSelectedDiscModal(null)}
                    className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-6">
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
                    <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border-l-4 border-emerald-600 space-y-1">
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
                            <div key={dim} className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1.5">
                              <div className="flex justify-between text-xs font-bold">
                                <span>{info.name.split(' ')[0]}</span>
                                <span className="font-mono">{pct}% ({score}/35)</span>
                              </div>
                              <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden">
                                <div className="h-full rounded-full" style={{ width: `${Math.max(5, pct)}%`, backgroundColor: info.color }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Baptist Ministry Strengths & Roles */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="p-4 rounded-2xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30 space-y-2">
                      <h6 className="text-[11px] font-black uppercase text-emerald-700 dark:text-emerald-300">
                        Ministry Strengths
                      </h6>
                      <ul className="text-xs space-y-1 text-slate-700 dark:text-slate-300">
                        {DISC_PROFILES[selectedDiscModal.styleCode]?.baptistMinistryStrengths.map((s, idx) => (
                          <li key={idx}>• {s}</li>
                        ))}
                      </ul>
                    </div>

                    <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 space-y-2">
                      <h6 className="text-[11px] font-black uppercase text-indigo-700 dark:text-indigo-300">
                        Serving Areas
                      </h6>
                      <ul className="text-xs space-y-1 text-slate-700 dark:text-slate-300">
                        {DISC_PROFILES[selectedDiscModal.styleCode]?.idealServingRoles.map((r, idx) => (
                          <li key={idx}>• {r}</li>
                        ))}
                      </ul>
                    </div>
                  </div>

                  {/* All 28 Statement Ratings */}
                  <div className="space-y-3 pt-2">
                    <h5 className="text-xs font-black uppercase tracking-wider text-slate-400">
                      Individual Ratings for all 28 Statements (1–5 Scale)
                    </h5>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                      {DISC_QUESTIONS.map(q => {
                        const ans = selectedDiscModal.answers?.[q.id] || 0;
                        return (
                          <div key={q.id} className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex items-start justify-between gap-2">
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

          {/* ── Pastoral Engagement & Communication Strategy Modal ── */}
          {showEngagementModal && (
            <PastoralEngagementModal
              isOpen={showEngagementModal}
              onClose={() => setShowEngagementModal(false)}
              personName={person.name}
              email={person.primary_email}
              phone={person.primary_phone}
              personId={person.id}
              churchId={churchId}
              giftsResponse={giftsResponses[0] || null}
              mbtiResponse={mbtiResponses[0] || null}
              discResponse={discResponses[0] || null}
            />
          )}

        </div>
      ) : (
        <div className="text-sm text-slate-500">Person not found.</div>
      )}
    </Drawer>
  );
};
