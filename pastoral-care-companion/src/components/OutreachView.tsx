import React, { useState, useEffect, useMemo } from 'react';
import { PcoPerson, User, PastoralNote, OutreachSession, OutreachSlot } from '../types';
import { firestore as serviceFirestore } from '../services/firestoreService';
import { 
  Loader2, Phone, MessageSquare, AlertTriangle, 
  Check, X, Calendar, PhoneOff, Award, RefreshCw,
  Heart, Sparkles, AlertCircle, ArrowLeft, Users, 
  Play, LogOut, CheckCircle2, ChevronRight, Plus, 
  CalendarCheck, History 
} from 'lucide-react';

interface OutreachViewProps {
  churchId: string;
  churchName: string;
  currentUser: User;
  onSelectPerson: (person: PcoPerson) => void;
  people: PcoPerson[];
  notes: PastoralNote[];
  loading: boolean;
  onUpdateNotes: (notes: PastoralNote[]) => void;
}

type Segment = 'queue' | 'followups';

interface QueueItem {
  person: PcoPerson;
  reason: 'birthday' | 'anniversary' | 'inactive' | 'prayer';
  detail: string;
  priority: 'high' | 'medium';
}

function daysUntilAnnual(dateStr?: string | null): number | null {
  if (!dateStr) return null;
  const parts = dateStr.split('-');
  if (parts.length < 2) return null;
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2] || '1', 10);
  const today = new Date();
  const thisYear = today.getFullYear();
  let next = new Date(thisYear, month, day);
  if (next < today) next = new Date(thisYear + 1, month, day);
  return Math.floor((next.getTime() - today.getTime()) / 86400000);
}

export const OutreachView: React.FC<OutreachViewProps> = ({ 
  churchId, churchName, currentUser, onSelectPerson,
  people, notes, loading, onUpdateNotes
}) => {
  const [activeSegment, setActiveSegment] = useState<Segment>('queue');
  
  // Active Campaigns State
  const [sessions, setSessions] = useState<OutreachSession[]>([]);
  const [loadingSessions, setLoadingSessions] = useState(false);
  const [joinedSession, setJoinedSession] = useState<OutreachSession | null>(null);
  const [sessionSlots, setSessionSlots] = useState<OutreachSlot[]>([]);
  const [isClaiming, setIsClaiming] = useState(false);
  
  // Volunteer History State
  const [myHistorySlots, setMyHistorySlots] = useState<OutreachSlot[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  
  // Volunteer Phone Registry
  const [volunteerPhone, setVolunteerPhone] = useState(() => {
    return localStorage.getItem('outreach_volunteer_phone') || '';
  });
  const [showPhonePrompt, setShowPhonePrompt] = useState(false);
  const [tempPhone, setTempPhone] = useState('');
  const [pendingSessionToJoin, setPendingSessionToJoin] = useState<OutreachSession | null>(null);

  // Auto-resolve volunteer phone number from logged-in user email matching
  useEffect(() => {
    if (volunteerPhone) return;

    const matchedPerson = people.find(p => p.email && p.email.toLowerCase() === currentUser.email.toLowerCase());
    if (matchedPerson && matchedPerson.phone) {
      const cleanPhone = matchedPerson.phone.replace(/\D/g, '');
      if (cleanPhone.length >= 10) {
        localStorage.setItem('outreach_volunteer_phone', cleanPhone);
        setVolunteerPhone(cleanPhone);
      }
    }
  }, [people, currentUser, volunteerPhone]);

  // Campaign Creation Modal States
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newCampaignName, setNewCampaignName] = useState('');
  const [targetRiskCategories, setTargetRiskCategories] = useState<string[]>(['At Risk', 'Disconnected']);
  const [targetMembershipStatuses, setTargetMembershipStatuses] = useState<string[]>([]);
  const [newCampaignScript, setNewCampaignScript] = useState('');
  const [newCampaignBatchSize, setNewCampaignBatchSize] = useState(3);
  const [isCreatingCampaign, setIsCreatingCampaign] = useState(false);

  // Outreach Call Interface Modal
  const [selectedContact, setSelectedContact] = useState<PcoPerson | null>(null);
  const [selectedSlot, setSelectedSlot] = useState<OutreachSlot | null>(null);
  const [queueReason, setQueueReason] = useState<string>('');
  const [selectedOutcome, setSelectedOutcome] = useState<'contacted' | 'voicemail' | 'no-answer' | null>(null);
  const [callNotes, setCallNotes] = useState('');
  const [callCategory, setCallCategory] = useState<PastoralNote['type']>('Call');
  const [showScript, setShowScript] = useState(true);
  const [savingOutcome, setSavingOutcome] = useState(false);

  // Extract all unique membership statuses in the church for filter options
  const availableMemberships = useMemo(() => {
    const set = new Set<string>();
    people.forEach(p => {
      if (p.membership) set.add(p.membership);
    });
    return Array.from(set).sort();
  }, [people]);

  // Load online outreach campaigns
  const loadSessions = async () => {
    setLoadingSessions(true);
    try {
      const list = await serviceFirestore.getOutreachSessions(churchId);
      setSessions(list);
    } catch (e) {
      console.error("Failed to load campaigns:", e);
    } finally {
      setLoadingSessions(false);
    }
  };

  const activeSessions = useMemo(() => {
    return sessions.filter(s => s.isActive && !s.closedAt);
  }, [sessions]);

  useEffect(() => {
    if (joinedSession) return;
    loadSessions();
  }, [churchId, joinedSession]);

  // Load Personal Volunteer History
  const loadVolunteerHistory = async () => {
    if (!volunteerPhone) return;
    setLoadingHistory(true);
    try {
      const allSlots = await serviceFirestore.getChurchOutreachSlots(churchId);
      // Filter slots where volunteer phone matches and state is completed (contacted or no-answer)
      const filtered = allSlots
        .filter(s => s.volunteerPhone === volunteerPhone && (s.status === 'contacted' || s.status === 'no-answer'))
        .sort((a, b) => b.assignedAt - a.assignedAt);
      setMyHistorySlots(filtered);
    } catch (e) {
      console.error("Failed to load history slots:", e);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    if (activeSegment === 'followups') {
      loadVolunteerHistory();
    }
  }, [activeSegment, volunteerPhone]);

  // Realtime subscription to claimed slots in active session
  useEffect(() => {
    if (!joinedSession) return;
    const unsub = serviceFirestore.subscribeToOutreachSlots(joinedSession.id, (slots) => {
      setSessionSlots(slots);
    });
    return () => unsub();
  }, [joinedSession]);

  // Compute Queue Items (Automated check-ins)
  const queueItems = useMemo(() => {
    const items: QueueItem[] = [];
    const thirtyDaysAgo = Date.now() - 30 * 24 * 60 * 60 * 1000;

    people.forEach(p => {
      const bdays = daysUntilAnnual(p.birthdate);
      if (bdays !== null && bdays <= 7) {
        items.push({
          person: p,
          reason: 'birthday',
          detail: `Birthday upcoming in ${bdays === 0 ? 'today' : bdays + ' days'} (${p.birthdate})`,
          priority: bdays <= 2 ? 'high' : 'medium'
        });
        return;
      }

      const annivs = daysUntilAnnual(p.anniversary);
      if (annivs !== null && annivs <= 7) {
        items.push({
          person: p,
          reason: 'anniversary',
          detail: `Anniversary upcoming in ${annivs === 0 ? 'today' : annivs + ' days'} (${p.anniversary})`,
          priority: annivs <= 2 ? 'high' : 'medium'
        });
        return;
      }

      const personNotes = notes.filter(n => n.personId === p.id);
      const lastNote = personNotes.length > 0 ? personNotes[0] : null;
      if (!lastNote) {
        items.push({
          person: p,
          reason: 'inactive',
          detail: 'Never had a care note logged',
          priority: 'medium'
        });
      } else {
        const lastNoteMs = new Date(lastNote.date).getTime();
        if (lastNoteMs < thirtyDaysAgo) {
          const days = Math.floor((Date.now() - lastNoteMs) / 86400000);
          items.push({
            person: p,
            reason: 'inactive',
            detail: `No contact recorded in ${days} days`,
            priority: days > 60 ? 'high' : 'medium'
          });
        }
      }
    });

    return items.sort((a, b) => {
      if (a.priority === 'high' && b.priority === 'medium') return -1;
      if (a.priority === 'medium' && b.priority === 'high') return 1;
      return a.person.name.localeCompare(b.person.name);
    });
  }, [people, notes]);

  // Compute current volunteer's claimed batch in this session
  const myPendingSlots = useMemo(() => {
    if (!joinedSession || !volunteerPhone) return [];
    return sessionSlots.filter(s => s.volunteerPhone === volunteerPhone && s.status === 'pending');
  }, [sessionSlots, volunteerPhone, joinedSession]);

  const handleJoinSession = (session: OutreachSession) => {
    if (!volunteerPhone) {
      setPendingSessionToJoin(session);
      setTempPhone('');
      setShowPhonePrompt(true);
    } else {
      setJoinedSession(session);
    }
  };

  const handleSavePhone = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanPhone = tempPhone.replace(/\D/g, '');
    if (cleanPhone.length < 10) {
      alert("Please enter a valid 10-digit phone number.");
      return;
    }
    localStorage.setItem('outreach_volunteer_phone', cleanPhone);
    setVolunteerPhone(cleanPhone);
    setShowPhonePrompt(false);
    if (pendingSessionToJoin) {
      setJoinedSession(pendingSessionToJoin);
      setPendingSessionToJoin(null);
    }
  };

  const handleLeaveSession = async () => {
    if (!joinedSession || !volunteerPhone) return;
    await serviceFirestore.releasePendingSlots(joinedSession.id, volunteerPhone);
    setJoinedSession(null);
    setSessionSlots([]);
  };

  const handleClaimBatch = async () => {
    if (!joinedSession || !volunteerPhone || isClaiming) return;
    setIsClaiming(true);
    try {
      const batchSize = joinedSession.batchSize || 3;
      const claimed = await serviceFirestore.claimBatch(
        joinedSession,
        volunteerPhone,
        joinedSession.eligiblePeople || [],
        batchSize,
        currentUser.name || 'Staff'
      );
      if (claimed.length === 0) {
        alert("No unclaimed contacts remaining in this campaign!");
      }
    } catch (e) {
      console.error("Claim batch failed:", e);
      alert("Failed to claim contacts.");
    } finally {
      setIsClaiming(false);
    }
  };

  // Compile Campaign locally and submit to database
  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newCampaignName.trim() || isCreatingCampaign) return;
    
    setIsCreatingCampaign(true);
    try {
      // 1. Gather all-time completed slots to run tiering logic
      const historySlots = await serviceFirestore.getChurchOutreachSlots(churchId);
      
      // 2. Filter base candidates matching constraints
      const eligibleRaw = people.filter(p => {
        if (p.status?.toLowerCase() === 'inactive') return false;
        if (!p.phone && !p.email) return false;
        if (targetRiskCategories.length > 0 && !targetRiskCategories.includes(p.riskProfile?.category as any)) return false;
        if (targetMembershipStatuses.length > 0 && !targetMembershipStatuses.includes(p.membership || 'None')) return false;
        return true;
      });

      // 3. Map slot history timelines
      const lastContactedAt = new Map<string, number>();
      const lastAttemptedAt = new Map<string, number>();

      for (const slot of historySlots) {
        const ts = slot.completedAt ?? slot.assignedAt;
        if (slot.status === 'contacted') {
          const prev = lastContactedAt.get(slot.assignedPersonId) ?? 0;
          if (ts > prev) lastContactedAt.set(slot.assignedPersonId, ts);
        }
        if (slot.status === 'contacted' || slot.status === 'no-answer') {
          const prev = lastAttemptedAt.get(slot.assignedPersonId) ?? 0;
          if (ts > prev) lastAttemptedAt.set(slot.assignedPersonId, ts);
        }
      }

      const tierOf = (p: PcoPerson) => {
        if (lastContactedAt.has(p.id)) return 2;
        if (lastAttemptedAt.has(p.id)) return 1;
        return 0;
      };

      // 4. Sort eligible candidates (Tier 0 -> Tier 1 -> Tier 2)
      const eligible = eligibleRaw
        .sort((a, b) => {
          const ta = tierOf(a);
          const tb = tierOf(b);
          if (ta !== tb) return ta - tb;
          if (ta === 0) return (a.riskProfile?.score ?? 0) - (b.riskProfile?.score ?? 0);
          if (ta === 1) return (lastAttemptedAt.get(a.id) ?? 0) - (lastAttemptedAt.get(b.id) ?? 0);
          return (lastContactedAt.get(a.id) ?? 0) - (lastContactedAt.get(b.id) ?? 0);
        })
        .map(p => ({
          id: p.id,
          name: p.name,
          phone: p.phone ?? null,
          email: p.email ?? null,
          riskScore: p.riskProfile?.score ?? 0,
          riskCategory: p.riskProfile?.category ?? 'Healthy'
        }));

      // 5. Build member phone lookup
      const memberDirectory = people
        .filter(p => p.status?.toLowerCase() !== 'inactive' && p.phone)
        .map(p => ({ phone: p.phone!.replace(/\D/g, ''), name: p.name }))
        .filter(e => e.phone.length >= 10);

      // 6. Generate and save the campaign session doc
      const sessionId = `os_${churchId}_${Date.now()}`;
      const newSession: OutreachSession = {
        id: sessionId,
        churchId,
        name: newCampaignName.trim(),
        filters: {
          riskCategories: targetRiskCategories as any,
          membershipStatuses: targetMembershipStatuses,
        },
        eligiblePeople: eligible,
        memberDirectory,
        customScript: newCampaignScript.trim() || undefined,
        batchSize: newCampaignBatchSize,
        createdAt: Date.now(),
        createdBy: currentUser.name || 'Staff',
        isActive: true
      };

      await serviceFirestore.createOutreachSession(newSession);
      
      // Reset form variables
      setNewCampaignName('');
      setNewCampaignScript('');
      setShowCreateModal(false);
      
      // Refresh active sessions list and auto-join
      alert("Campaign campaign successfully created!");
      await loadSessions();
      handleJoinSession(newSession);

    } catch (e) {
      console.error("Create campaign failed:", e);
      alert("Error building campaign queue.");
    } finally {
      setIsCreatingCampaign(false);
    }
  };

  const toggleRiskSelection = (cat: string) => {
    setTargetRiskCategories(prev => 
      prev.includes(cat) ? prev.filter(c => c !== cat) : [...prev, cat]
    );
  };

  const toggleMembershipSelection = (status: string) => {
    setTargetMembershipStatuses(prev => 
      prev.includes(status) ? prev.filter(s => s !== status) : [...prev, status]
    );
  };

  // Generate customized script (uses session customScript if available)
  const generatedScript = useMemo(() => {
    if (!selectedContact) return '';
    if (joinedSession && joinedSession.customScript) {
      let script = joinedSession.customScript;
      script = script.replace(/\[Name\]/gi, selectedContact.name.split(' ')[0]);
      script = script.replace(/\[Volunteer\]/gi, currentUser.name?.split(' ')[0] || 'Staff');
      script = script.replace(/\[Church\]/gi, churchName);
      return script;
    }

    const name = selectedContact.name.split(' ')[0];
    const volunteer = currentUser.name?.split(' ')[0] || 'Staff';

    if (queueReason === 'birthday') {
      return `Hi ${name}! This is ${volunteer} from ${churchName}. Reaching out to wish you a very happy birthday this week! We are so glad to have you in our community. How are you celebrating? Is there anything we can pray for you today?`;
    }
    if (queueReason === 'anniversary') {
      return `Hi ${name}! This is ${volunteer} from ${churchName}. I noticed you have an anniversary coming up and just wanted to reach out and say congratulations! We celebrate you and your family. How have you been? Can we support you in prayer today?`;
    }
    return `Hi ${name}! This is ${volunteer} from ${churchName}. Just wanted to reach out, say hi, and see how you are doing! It's been a little while since we last caught up and we want to ensure you're doing well. Is there any way we can pray for you today?`;
  }, [selectedContact, queueReason, currentUser, churchName, joinedSession]);

  const handleSaveOutcome = async () => {
    if (!selectedContact || !selectedOutcome || savingOutcome) return;
    setSavingOutcome(true);

    const now = Date.now();
    const isoDateStr = new Date(now).toISOString();
    let content = '';
    
    if (selectedOutcome === 'voicemail') {
      content = `[Left Voicemail] Sent check-in greeting. Notes: ${callNotes.trim() || 'None'}`;
    } else if (selectedOutcome === 'no-answer') {
      content = `[Couldn't Reach / No Answer] Call attempt logged. Cooldown set. Notes: ${callNotes.trim() || 'None'}`;
    } else {
      content = `[Reached / Reached Them] Call completed. Notes: ${callNotes.trim() || 'None'}`;
    }

    try {
      if (joinedSession && selectedSlot) {
        const slotUpdates: Partial<OutreachSlot> = {
          status: selectedOutcome === 'contacted' ? 'contacted' : 'no-answer',
          notes: callNotes.trim(),
          completedAt: now,
        };
        if (selectedOutcome === 'no-answer') {
          slotUpdates.noAnswerUntil = now + 24 * 60 * 60 * 1000;
        }
        await serviceFirestore.updateOutreachSlot(selectedSlot.id, slotUpdates);

        const updatedSlots = [...sessionSlots].map(s => s.id === selectedSlot.id ? { ...s, ...slotUpdates } : s);
        const contacted = updatedSlots.filter(s => s.status === 'contacted').length;
        const noAnswer = updatedSlots.filter(s => s.status === 'no-answer').length;
        const pending = updatedSlots.filter(s => s.status === 'pending').length;
        
        await serviceFirestore.updateSessionStats(joinedSession.id, {
          contactedCount: contacted,
          noAnswerCount: noAnswer,
          pendingCount: pending,
          totalEligible: joinedSession.eligiblePeople?.length || 0,
        });
      }

      const outcomeNote: PastoralNote = {
        id: `${churchId}_note_${Date.now()}`,
        churchId,
        personId: selectedContact.id,
        personName: selectedContact.name,
        authorId: currentUser.id,
        authorName: currentUser.name || 'Staff',
        date: isoDateStr,
        type: callCategory,
        content: joinedSession ? `[Campaign: ${joinedSession.name}] ${content}` : content,
        isCompleted: false
      };

      await serviceFirestore.savePastoralNote(outcomeNote);
      onUpdateNotes([outcomeNote, ...notes]);
      
      setSelectedContact(null);
      setSelectedSlot(null);
      setSelectedOutcome(null);
      setCallNotes('');
      setCallCategory('Call');
      
      alert("Call outcome successfully logged!");
      // Reload history list if in follow-ups tab
      if (activeSegment === 'followups') {
        loadVolunteerHistory();
      }
    } catch (e) {
      console.error(e);
      alert("Failed to log call outcome.");
    } finally {
      setSavingOutcome(false);
    }
  };

  const getInitials = (name: string) => {
    return name.split(' ').slice(0, 2).map(n => n[0]).join('').toUpperCase();
  };

  const formatPhone = (phoneNum?: string | null) => {
    if (!phoneNum) return '';
    const digits = phoneNum.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phoneNum;
  };

  const formatCreatedBy = (createdBy: string, currentUserId: string) => {
    if (!createdBy) return 'Staff';
    if (createdBy === currentUserId || createdBy === 'You') return 'You';
    if (createdBy.startsWith('u_') || createdBy.length > 15) {
      return 'Staff';
    }
    return createdBy;
  };

  return (
    <div className="h-full w-full flex flex-col bg-slate-50 dark:bg-zinc-950 text-slate-900 dark:text-zinc-100">
      
      {/* Joined Session View Header Override */}
      {joinedSession ? (
        <div className="p-4 bg-indigo-600 text-white shrink-0 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-3">
            <button
              onClick={handleLeaveSession}
              className="w-8 h-8 rounded-full bg-white/10 flex items-center justify-center hover:bg-white/20 transition active:scale-95"
            >
              <ArrowLeft size={16} />
            </button>
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest leading-none text-indigo-200">Active Campaign</h3>
              <h2 className="text-sm min-[375px]:text-base font-black truncate max-w-[200px] mt-0.5">{joinedSession.name}</h2>
            </div>
          </div>

          <button
            onClick={handleLeaveSession}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-500/80 hover:bg-rose-500 rounded-xl text-[10px] font-black uppercase tracking-wider transition"
          >
            <LogOut size={12} /> Exit
          </button>
        </div>
      ) : (
        /* Regular Segmented Toggle Navigation */
        <div className="p-4 bg-white dark:bg-zinc-900 border-b border-slate-200/80 dark:border-zinc-800 shrink-0">
          <div className="flex bg-slate-100 dark:bg-zinc-800 rounded-xl p-1 shrink-0">
            <button
              onClick={() => setActiveSegment('queue')}
              className={`flex-1 py-2 font-black text-xs uppercase tracking-wider rounded-lg transition ${activeSegment === 'queue' ? 'bg-white dark:bg-zinc-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700'}`}
            >
              Calling Queue ({queueItems.length})
            </button>
            <button
              onClick={() => setActiveSegment('followups')}
              className={`flex-1 py-2 font-black text-xs uppercase tracking-wider rounded-lg transition ${activeSegment === 'followups' ? 'bg-white dark:bg-zinc-700 text-slate-800 dark:text-white shadow-sm' : 'text-slate-500 dark:text-zinc-400 hover:text-slate-700'}`}
            >
              Outreach History ({volunteerPhone ? myHistorySlots.length : 0})
            </button>
          </div>
        </div>
      )}

      {/* Main Content Workspace Scroll space */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-4">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
            <p className="text-xs font-bold uppercase tracking-wider">Loading Outreach Data...</p>
          </div>
        ) : joinedSession ? (
          /* ============================================================== */
          /* ================== JOINED CAMPAIGN SESSION VIEW ================== */
          /* ============================================================== */
          <div className="space-y-4">
            
            {/* Campaign Progress Stats Widget */}
            <div className="bg-white dark:bg-zinc-900 border border-slate-200/50 dark:border-zinc-800 rounded-3xl p-5 shadow-sm space-y-2">
              <div className="flex justify-between items-center text-xs font-bold text-slate-400">
                <span className="uppercase tracking-widest leading-none">Campaign Progress</span>
                <span className="text-slate-800 dark:text-zinc-200">
                  {joinedSession.stats?.contactedCount || 0} contacted / {joinedSession.eligiblePeople?.length || 0} total
                </span>
              </div>
              <div className="w-full h-2 bg-slate-100 dark:bg-zinc-800 rounded-full overflow-hidden">
                <div 
                  className="h-full bg-indigo-600 transition-all duration-300"
                  style={{ 
                    width: `${((joinedSession.stats?.contactedCount || 0) / (joinedSession.eligiblePeople?.length || 1)) * 100}%` 
                  }}
                />
              </div>
            </div>

            {/* Campaign Custom Script Card */}
            {joinedSession.customScript && (
              <div className="bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100/50 dark:border-indigo-900/20 rounded-3xl p-4 space-y-2">
                <p className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest">Campaign Talking Script</p>
                <p className="text-xs text-indigo-950 dark:text-indigo-300 font-medium leading-relaxed italic bg-white dark:bg-zinc-900 p-3 rounded-2xl border border-indigo-100/20 shadow-sm">
                  "{joinedSession.customScript}"
                </p>
              </div>
            )}

            {/* Volunteer Claimed Batch List */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Your Assigned Contacts ({myPendingSlots.length})</h3>
              
              {myPendingSlots.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 border border-slate-200/50 dark:border-zinc-800 rounded-3xl p-8 text-center space-y-4">
                  <p className="text-xs text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-wider">No contacts currently claimed</p>
                  <button
                    onClick={handleClaimBatch}
                    disabled={isClaiming}
                    className="mx-auto flex items-center justify-center gap-1.5 px-6 py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-100 dark:shadow-none transition active:scale-[0.98]"
                  >
                    {isClaiming ? 'Claiming batch...' : (
                      <>
                        <Users size={14} /> Claim Next Batch
                      </>
                    )}
                  </button>
                </div>
              ) : (
                <div className="space-y-2">
                  {myPendingSlots.map(slot => {
                    const personRecord = people.find(p => p.id === slot.assignedPersonId);
                    return (
                      <div
                        key={slot.id}
                        onClick={() => {
                          if (personRecord) {
                            setSelectedContact(personRecord);
                            setSelectedSlot(slot);
                            setQueueReason('campaign');
                          }
                        }}
                        className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-3xl p-4 shadow-sm flex items-center justify-between hover:border-indigo-100 dark:hover:border-indigo-900 cursor-pointer transition active:scale-[0.99]"
                      >
                        <div className="flex items-center gap-3">
                          <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs shrink-0">
                            {getInitials(slot.assignedPersonName)}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 dark:text-white leading-none">{slot.assignedPersonName}</p>
                            <span className="inline-block mt-1.5 text-[8px] font-black uppercase tracking-wider text-rose-500 bg-rose-50 dark:bg-rose-950/20 px-1 py-0.5 rounded border border-rose-100 dark:border-rose-900/10">
                              {slot.assignedPersonRiskCategory || 'Contact'}
                            </span>
                          </div>
                        </div>

                        <button className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-sm">
                          <Phone size={14} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

          </div>
        ) : activeSegment === 'queue' ? (
          /* ============================================================== */
          /* ================= AUTOMATED QUEUE & ACTIVE SESSIONS ============= */
          /* ============================================================== */
          <div className="space-y-5">
            
            {/* Active campaigns list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1 shrink-0">
                <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest">Active Campaigns</h3>
                <button
                  onClick={() => setShowCreateModal(true)}
                  className="flex items-center gap-1 text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-wider bg-indigo-50 dark:bg-indigo-950/30 px-3 py-1.5 rounded-xl border border-indigo-100/30 active:scale-95 transition"
                >
                  <Plus size={12} /> Create
                </button>
              </div>

              {loadingSessions ? (
                <div className="py-6 text-center text-slate-400">
                  <Loader2 size={16} className="animate-spin mx-auto text-indigo-500" />
                </div>
              ) : activeSessions.length === 0 ? (
                <div className="bg-white dark:bg-zinc-900 border border-slate-200/50 dark:border-zinc-800 rounded-3xl p-6 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
                  No active campaigns. Tap Create to launch one!
                </div>
              ) : (
                <div className="grid gap-2.5">
                  {activeSessions.map(sess => (
                    <div
                      key={sess.id}
                      className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-3xl p-4 shadow-sm flex items-center justify-between hover:border-indigo-100 dark:hover:border-indigo-900 transition"
                    >
                      <div className="min-w-0 pr-2">
                        <h4 className="text-sm font-black text-slate-900 dark:text-white leading-tight truncate">{sess.name}</h4>
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 mt-1 text-[10px] text-slate-400 dark:text-zinc-500 font-bold uppercase">
                          <span>👤 By: {formatCreatedBy(sess.createdBy, currentUser.id)}</span>
                          <span>•</span>
                          <span>🚀 {sess.stats?.contactedCount || 0}/{sess.eligiblePeople?.length || 0} contacted</span>
                        </div>
                      </div>

                      <button
                        onClick={() => handleJoinSession(sess)}
                        className="flex items-center gap-1 px-3 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-[10px] uppercase tracking-wider rounded-xl shadow-sm transition active:scale-95 shrink-0"
                      >
                        <Play size={10} fill="white" /> Join
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Automated check-ins Queue */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-slate-400 uppercase tracking-widest px-1">Check-in Recommendations ({queueItems.length})</h3>
              
              {queueItems.length === 0 ? (
                <div className="text-center py-20 text-slate-400 text-sm font-medium">
                  Everyone is caught up! No check-ins needed.
                </div>
              ) : (
                <div className="space-y-3">
                  {queueItems.map(item => (
                    <div
                      key={item.person.id}
                      onClick={() => {
                        setSelectedContact(item.person);
                        setQueueReason(item.reason);
                      }}
                      className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-3xl p-4 shadow-sm flex items-center justify-between hover:border-indigo-100 dark:hover:border-indigo-900 cursor-pointer transition active:scale-[0.99]"
                    >
                      <div className="flex items-center gap-3">
                        <div className="shrink-0">
                          {item.person.avatar ? (
                            <img
                              src={item.person.avatar}
                              alt={item.person.name}
                              className="w-11 h-11 rounded-full object-cover"
                              loading="lazy"
                            />
                          ) : (
                            <div className="w-11 h-11 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs">
                              {getInitials(item.person.name)}
                            </div>
                          )}
                        </div>

                        <div>
                          <div className="flex items-center gap-2">
                            <p className="text-sm font-black text-slate-900 dark:text-white">{item.person.name}</p>
                            {item.priority === 'high' && (
                              <span className="w-2 h-2 rounded-full bg-rose-500 animate-ping" />
                            )}
                          </div>
                          <p className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wide leading-none mt-1">
                            {item.reason === 'birthday' ? '🎂 Birthday' : item.reason === 'anniversary' ? '💍 Anniversary' : '🚨 Forgotten Member'}
                          </p>
                          <p className="text-[11px] text-slate-400 dark:text-zinc-500 font-medium leading-none mt-1">
                            {item.detail}
                          </p>
                        </div>
                      </div>

                      <button className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shadow-sm">
                        <Phone size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>
        ) : (
          /* ============================================================== */
          /* ================ VOLUNTEER HISTORY VIEW (FOLLOW-UP TAB) ================ */
          /* ============================================================== */
          !volunteerPhone ? (
            <div className="bg-white dark:bg-zinc-900 border border-slate-200/50 dark:border-zinc-800 rounded-3xl p-8 text-center space-y-4">
              <div className="w-12 h-12 rounded-full bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center mx-auto">
                <History size={24} />
              </div>
              <div>
                <h4 className="text-sm font-black text-slate-900 dark:text-white">Volunteer History Registry</h4>
                <p className="text-xs text-slate-400 dark:text-zinc-500 font-medium mt-1 leading-relaxed">
                  Please register your phone number under the Calling Queue tab. This links your active device to your personal outreach contact history.
                </p>
              </div>
              <button
                onClick={() => {
                  setTempPhone('');
                  setShowPhonePrompt(true);
                }}
                className="flex items-center justify-center gap-1.5 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md mx-auto active:scale-95 transition"
              >
                Sign In As Volunteer
              </button>
            </div>
          ) : loadingHistory ? (
            <div className="py-20 text-center text-slate-400">
              <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mx-auto mb-2" />
              <p className="text-xs font-bold uppercase tracking-wider">Loading History...</p>
            </div>
          ) : myHistorySlots.length === 0 ? (
            <div className="bg-white dark:bg-zinc-900 border border-slate-200/50 dark:border-zinc-800 rounded-3xl p-8 text-center text-xs font-bold text-slate-400 uppercase tracking-wider">
              No contacts logged yet in any campaigns under this number.
            </div>
          ) : (
            <div className="space-y-3">
              <div className="flex justify-between items-center px-1">
                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Your Outreach History</span>
                <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest leading-none">
                  {formatPhone(volunteerPhone)}
                </span>
              </div>
              
              <div className="space-y-3">
                {myHistorySlots.map(slot => {
                  const associatedPerson = people.find(p => p.id === slot.assignedPersonId);
                  const isReached = slot.status === 'contacted';
                  
                  return (
                    <div
                      key={slot.id}
                      onClick={() => associatedPerson && onSelectPerson(associatedPerson)}
                      className="bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-3xl p-4 shadow-sm flex flex-col hover:border-indigo-100 dark:hover:border-indigo-900 cursor-pointer transition active:scale-[0.99]"
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 flex items-center justify-center font-black text-xs shrink-0">
                            {getInitials(slot.assignedPersonName)}
                          </div>
                          <div>
                            <p className="text-sm font-black text-slate-900 dark:text-white leading-none">{slot.assignedPersonName}</p>
                            <span className={`inline-block mt-1.5 text-[8px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded ${isReached ? 'text-emerald-700 bg-emerald-50 dark:text-emerald-300 dark:bg-emerald-900/30' : 'text-rose-700 bg-rose-50 dark:text-rose-300 dark:bg-rose-900/30'}`}>
                              {isReached ? 'Reached / Completed' : 'No Answer'}
                            </span>
                          </div>
                        </div>

                        {slot.assignedPersonPhone && (
                          <div className="flex items-center gap-1.5 shrink-0" onClick={e => e.stopPropagation()}>
                            <a
                              href={`tel:${slot.assignedPersonPhone}`}
                              className="w-7 h-7 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 flex items-center justify-center hover:bg-emerald-100 transition"
                              title="Call"
                            >
                              <Phone size={12} />
                            </a>
                            <a
                              href={`sms:${slot.assignedPersonPhone}`}
                              className="w-7 h-7 rounded-lg bg-indigo-50 dark:bg-indigo-950/30 text-indigo-600 dark:text-indigo-400 flex items-center justify-center hover:bg-indigo-100 transition"
                              title="SMS"
                            >
                              <MessageSquare size={12} />
                            </a>
                          </div>
                        )}
                      </div>

                      {slot.notes && (
                        <p className="text-xs text-slate-700 dark:text-zinc-300 font-medium italic mt-3 bg-slate-50 dark:bg-zinc-800/50 p-2.5 rounded-xl border border-slate-100 dark:border-zinc-800/60">
                          "{slot.notes}"
                        </p>
                      )}

                      <div className="flex justify-between items-center mt-3 pt-2.5 border-t border-slate-100 dark:border-zinc-800/60 text-[9px] text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-wider">
                        <span>📢 {sessions.find(s => s.id === slot.sessionId)?.name || 'Outreach Campaign'}</span>
                        <span>🗓️ {new Date(slot.completedAt || slot.assignedAt).toLocaleDateString()}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )
        )}
      </div>

      {/* --- Campaign Creation Modal Dialog --- */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => setShowCreateModal(false)} />
          
          <div className="relative w-full h-[90vh] bg-white dark:bg-zinc-900 border-t border-slate-200 dark:border-zinc-800 rounded-t-[2.5rem] p-6 shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-250">
            <div className="w-12 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full mx-auto mb-5 shrink-0" />

            <div className="flex justify-between items-center mb-5 shrink-0">
              <div>
                <h3 className="text-lg font-black tracking-tight">Create Campaign</h3>
                <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-wider mt-0.5">Define New Outreach Queue</p>
              </div>
              <button
                onClick={() => setShowCreateModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 flex items-center justify-center hover:bg-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            <form onSubmit={handleCreateCampaign} className="flex-1 min-h-0 overflow-y-auto space-y-6 pb-6 pr-1">
              {/* Campaign Name */}
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest leading-none">Campaign Name</label>
                <input
                  type="text"
                  required
                  value={newCampaignName}
                  onChange={e => setNewCampaignName(e.target.value)}
                  placeholder="e.g. Summer Outreach 2026"
                  className="w-full p-3.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs dark:text-white"
                />
              </div>

              {/* Risk Categories checkboxes */}
              <div className="space-y-3">
                <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest leading-none">Target Risk Profiles</label>
                <div className="flex gap-2">
                  {['At Risk', 'Disconnected', 'Healthy'].map(cat => {
                    const isSelected = targetRiskCategories.includes(cat);
                    return (
                      <button
                        key={cat}
                        type="button"
                        onClick={() => toggleRiskSelection(cat)}
                        className={`flex-1 py-2.5 rounded-xl border font-bold text-xs transition ${isSelected ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'}`}
                      >
                        {cat}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Membership Status checkboxes */}
              <div className="space-y-3">
                <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest leading-none font-bold">Target Memberships</label>
                {availableMemberships.length === 0 ? (
                  <p className="text-[10px] text-slate-400">Loading classifications...</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {availableMemberships.map(status => {
                      const isSelected = targetMembershipStatuses.includes(status);
                      return (
                        <button
                          key={status}
                          type="button"
                          onClick={() => toggleMembershipSelection(status)}
                          className={`px-3 py-2 rounded-xl border text-[10px] font-black uppercase tracking-wider transition ${isSelected ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'}`}
                        >
                          {status}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Custom Script */}
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest leading-none">Campaign Script</label>
                  <span className="text-[8px] text-slate-400 lowercase">Use [Name] or [Volunteer] as placeholders</span>
                </div>
                <textarea
                  value={newCampaignScript}
                  onChange={e => setNewCampaignScript(e.target.value)}
                  placeholder="e.g. Hi [Name], this is [Volunteer] from Grace Church! Just calling to see how we can pray for you today..."
                  rows={4}
                  className="w-full p-3.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-xs dark:text-white resize-none"
                />
              </div>

              {/* Batch Size */}
              <div className="space-y-2">
                <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest leading-none">Batch Size Per Caller</label>
                <div className="flex gap-2">
                  {[1, 3, 5].map(size => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => setNewCampaignBatchSize(size)}
                      className={`flex-1 py-2.5 rounded-xl border font-black text-xs transition ${newCampaignBatchSize === size ? 'bg-indigo-600 text-white border-indigo-600 shadow-sm' : 'bg-slate-50 dark:bg-zinc-800 border-slate-200 dark:border-zinc-700 text-slate-500 dark:text-zinc-400'}`}
                    >
                      {size} Contacts
                    </button>
                  ))}
                </div>
              </div>

              {/* Action Trigger */}
              <button
                type="submit"
                disabled={isCreatingCampaign}
                className="w-full flex items-center justify-center gap-1.5 p-4 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg transition active:scale-[0.98]"
              >
                {isCreatingCampaign ? 'Compiling Campaign Queue...' : 'Compile & Launch Campaign'}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* --- Volunteer Phone Entry Prompt Dialog --- */}
      {showPhonePrompt && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-5">
          <div className="w-full max-w-sm bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-3xl p-6 shadow-2xl space-y-4 animate-in zoom-in-95 duration-200">
            <div>
              <h3 className="text-base font-black tracking-tight text-slate-900 dark:text-white">Caller Identification</h3>
              <p className="text-xs text-slate-400 dark:text-zinc-500 font-medium mt-1 leading-snug">
                Enter your phone number to sign in as a volunteer and claim contact slots in this campaign session:
              </p>
            </div>

            <form onSubmit={handleSavePhone} className="space-y-4">
              <input
                type="tel"
                value={tempPhone}
                onChange={e => setTempPhone(e.target.value)}
                required
                placeholder="(555) 555-5555"
                className="w-full p-3.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 font-bold text-xs dark:text-white"
              />

              <div className="flex gap-2 justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setShowPhonePrompt(false);
                    setPendingSessionToJoin(null);
                  }}
                  className="px-4 py-2 text-slate-500 dark:text-zinc-400 font-black text-xs uppercase tracking-wider"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black text-xs uppercase tracking-wider rounded-xl shadow-md"
                >
                  Confirm
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* --- Premium Outreach Caller Interface Modal --- */}
      {selectedContact && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex flex-col justify-end animate-in fade-in duration-200">
          <div className="absolute inset-0" onClick={() => {
            setSelectedContact(null);
            setSelectedSlot(null);
          }} />

          <div className="relative w-full h-[90vh] bg-slate-50 dark:bg-zinc-950 rounded-t-[2.5rem] p-6 shadow-2xl flex flex-col animate-in slide-in-from-bottom duration-250">
            <div className="w-12 h-1.5 bg-slate-200 dark:bg-zinc-700 rounded-full mx-auto mb-5 shrink-0" />

            <div className="flex justify-between items-center mb-5 shrink-0">
              <div>
                <h3 className="text-lg font-black tracking-tight">{selectedContact.name}</h3>
                <p className="text-[10px] text-slate-400 dark:text-zinc-500 font-bold uppercase tracking-wider mt-0.5">Outreach Companion Guide</p>
              </div>
              <button
                onClick={() => {
                  setSelectedContact(null);
                  setSelectedSlot(null);
                }}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400 flex items-center justify-center hover:bg-slate-200"
              >
                <X size={16} />
              </button>
            </div>

            {/* Content Body */}
            <div className="flex-1 min-h-0 overflow-y-auto space-y-6 pb-6">

              {/* Call Script Box */}
              <div className="bg-indigo-50/70 dark:bg-indigo-950/20 border border-indigo-100/80 dark:border-indigo-900/30 rounded-2xl p-4">
                <div className="flex items-center justify-between text-xs font-bold text-indigo-900 dark:text-indigo-300 mb-2">
                  <span className="flex items-center gap-1.5">
                    <Sparkles size={14} className="text-indigo-500 animate-pulse" />
                    Recommended Call Script
                  </span>
                  <button
                    onClick={() => setShowScript(!showScript)}
                    className="text-[10px] uppercase font-black text-indigo-500 bg-indigo-100/80 dark:bg-indigo-900/40 px-2.5 py-0.5 rounded-full"
                  >
                    {showScript ? 'Hide' : 'Show'}
                  </button>
                </div>
                {showScript && (
                  <p className="text-xs text-indigo-950 dark:text-indigo-300/90 font-medium leading-relaxed mt-2.5 p-3 bg-white dark:bg-zinc-900 border border-indigo-100/50 dark:border-indigo-950/40 rounded-xl whitespace-pre-line italic shadow-sm">
                    "{generatedScript}"
                  </p>
                )}
              </div>

              {/* Contact triggers card */}
              {selectedContact.phone ? (
                <div className="grid grid-cols-2 gap-3 shrink-0">
                  <a
                    href={`tel:${selectedContact.phone}`}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/30 rounded-2xl hover:bg-emerald-100/80 transition"
                  >
                    <div className="w-10 h-10 rounded-full bg-emerald-500 flex items-center justify-center text-white shadow-md">
                      <Phone size={18} />
                    </div>
                    <span className="text-xs font-black uppercase text-emerald-700 dark:text-emerald-400">Call Native</span>
                  </a>

                  <a
                    href={`sms:${selectedContact.phone}?body=${encodeURIComponent(generatedScript)}`}
                    className="flex flex-col items-center justify-center gap-2 p-4 bg-violet-50 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-900/30 rounded-2xl hover:bg-violet-100/80 transition"
                  >
                    <div className="w-10 h-10 rounded-full bg-violet-500 flex items-center justify-center text-white shadow-md">
                      <MessageSquare size={18} />
                    </div>
                    <span className="text-xs font-black uppercase text-violet-700 dark:text-violet-400">Draft SMS</span>
                  </a>
                </div>
              ) : (
                <div className="p-4 bg-slate-100 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl text-center text-xs font-bold text-slate-400 flex items-center justify-center gap-2">
                  <AlertCircle size={16} /> No phone number listed.
                </div>
              )}

              {/* Outcome Logging Section */}
              <div className="space-y-4 pt-2 border-t border-slate-200 dark:border-zinc-800">
                <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest leading-none">Outcome Result</label>
                
                <div className="grid grid-cols-3 gap-2">
                  <button
                    onClick={() => setSelectedOutcome('contacted')}
                    className={`flex flex-col items-center p-3 rounded-xl border-2 font-bold text-[10px] uppercase tracking-wider transition ${selectedOutcome === 'contacted' ? 'bg-emerald-50/70 dark:bg-emerald-950/20 border-emerald-500 text-emerald-700 dark:text-emerald-400 shadow-sm' : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400'}`}
                  >
                    <span className="text-lg mb-1">✅</span>
                    Reached
                  </button>
                  <button
                    onClick={() => setSelectedOutcome('voicemail')}
                    className={`flex flex-col items-center p-3 rounded-xl border-2 font-bold text-[10px] uppercase tracking-wider transition ${selectedOutcome === 'voicemail' ? 'bg-indigo-50/70 dark:bg-indigo-950/20 border-indigo-500 text-indigo-700 dark:text-indigo-400 shadow-sm' : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400'}`}
                  >
                    <span className="text-lg mb-1">📼</span>
                    Voicemail
                  </button>
                  <button
                    onClick={() => setSelectedOutcome('no-answer')}
                    className={`flex flex-col items-center p-3 rounded-xl border-2 font-bold text-[10px] uppercase tracking-wider transition ${selectedOutcome === 'no-answer' ? 'bg-rose-50/70 dark:bg-rose-950/20 border-rose-500 text-rose-700 dark:text-rose-400 shadow-sm' : 'bg-white dark:bg-zinc-900 border-slate-200 dark:border-zinc-800 text-slate-500 dark:text-zinc-400'}`}
                  >
                    <span className="text-lg mb-1">📵</span>
                    No Answer
                  </button>
                </div>

                {selectedOutcome && (
                  <div className="space-y-4 animate-in fade-in slide-in-from-top-4 duration-200">
                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-2">Category</label>
                      <div className="flex flex-wrap gap-1.5">
                        {(['Call', 'Visit', 'Meeting', 'Note', 'Crisis', 'Hospital'] as PastoralNote['type'][]).map(cat => (
                          <button
                            key={cat}
                            type="button"
                            onClick={() => setCallCategory(cat)}
                            className={`px-3 py-1 rounded-lg text-[9px] font-bold tracking-wider uppercase transition ${callCategory === cat ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-200 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400'}`}
                          >
                            {cat}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-black text-slate-400 dark:text-zinc-500 uppercase tracking-widest mb-2">Outcome Details</label>
                      <textarea
                        value={callNotes}
                        onChange={e => setCallNotes(e.target.value)}
                        placeholder={selectedOutcome === 'contacted' ? "Type notes about the conversation..." : "Optional details..."}
                        rows={2}
                        className="w-full p-3 bg-white dark:bg-zinc-900 border border-slate-200 dark:border-zinc-800 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 text-xs font-bold text-slate-800 dark:text-zinc-100 placeholder:font-medium placeholder:text-slate-400 resize-none transition"
                      />
                    </div>

                    <button
                      onClick={handleSaveOutcome}
                      disabled={savingOutcome}
                      className="w-full flex items-center justify-center gap-1.5 p-3.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-black text-xs uppercase tracking-widest rounded-2xl shadow-lg shadow-indigo-100 dark:shadow-none transition active:scale-[0.98]"
                    >
                      {savingOutcome ? 'Logging...' : 'Confirm & Log Outcome'}
                    </button>
                  </div>
                )}
              </div>

            </div>
          </div>
        </div>
      )}
    </div>
  );
};
