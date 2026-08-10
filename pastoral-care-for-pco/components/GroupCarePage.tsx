import React, { useState, useEffect, useMemo } from 'react';
import { GroupCareSession, GroupCareSlot, PcoPerson, User, Church, PcoGroup } from '../types';
import { firestore } from '../services/firestoreService';
import { getAiRecommendedCallScript } from '../constants/callScript';
import { 
  Users, Plus, Phone, Search, Copy, Check, QrCode, Play, Square, 
  Trash2, RefreshCw, ChevronRight, AlertCircle, MessageSquare, Clock,
  Sparkles, ExternalLink, HeartHandshake, CheckCircle2, PhoneOff, UserCheck
} from 'lucide-react';
import QRCode from 'qrcode';

interface GroupCarePageProps {
  church: Church;
  user: User;
  people: PcoPerson[];
  groups: PcoGroup[];
}

const StatusBadge: React.FC<{ status: GroupCareSlot['status'] }> = ({ status }) => {
  switch (status) {
    case 'contacted':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300">
          <CheckCircle2 size={12} /> Contacted
        </span>
      );
    case 'no-answer':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-300">
          <PhoneOff size={12} /> No Answer
        </span>
      );
    case 'pending':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-100 text-indigo-800 dark:bg-indigo-900/40 dark:text-indigo-300">
          <Clock size={12} /> In Progress
        </span>
      );
    case 'released':
      return (
        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
          Released
        </span>
      );
  }
};

// ─── Modal: Create / Edit Group Care Session ───────────────────────────────────

interface CreateSessionModalProps {
  churchName?: string;
  groups: PcoGroup[];
  people: PcoPerson[];
  onClose: () => void;
  onSave: (draft: { name: string; selectedGroupIds: string[]; customScript: string; batchSize: number }) => Promise<void>;
  initial?: Partial<GroupCareSession>;
}

const CreateSessionModal: React.FC<CreateSessionModalProps> = ({ churchName, groups, people, onClose, onSave, initial }) => {
  const defaultAiScript = getAiRecommendedCallScript(churchName);
  const [name, setName] = useState(initial?.name || '');
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>(initial?.groupIds || []);
  const [customScript, setCustomScript] = useState(initial?.customScript || defaultAiScript);
  const [batchSize, setBatchSize] = useState(initial?.batchSize || 3);
  const [searchTerm, setSearchTerm] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const filteredGroups = useMemo(() => {
    return groups.filter(g => g.name.toLowerCase().includes(searchTerm.toLowerCase()));
  }, [groups, searchTerm]);

  const toggleGroup = (id: string) => {
    setSelectedGroupIds(prev => 
      prev.includes(id) ? prev.filter(gId => gId !== id) : [...prev, id]
    );
  };

  const selectAllGroups = () => {
    if (selectedGroupIds.length === groups.length) {
      setSelectedGroupIds([]);
    } else {
      setSelectedGroupIds(groups.map(g => g.id));
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || selectedGroupIds.length === 0) return;
    setIsSaving(true);
    try {
      await onSave({ name, selectedGroupIds, customScript, batchSize });
      onClose();
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800">
        <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Users size={20} />
            </div>
            <div>
              <h2 className="text-lg font-black text-slate-900 dark:text-white">
                {initial ? 'Edit Group Care Session' : 'New Group Care Session'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                Set up an outreach session for group leaders to contact their group members
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 text-sm font-bold">✕</button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
              Session Title *
            </label>
            <input
              type="text"
              required
              value={name}
              onChange={e => setName(e.target.value)}
              placeholder="e.g. Fall Small Group Touchpoint"
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-sm focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
            />
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Target Groups * ({selectedGroupIds.length} selected)
              </label>
              <button
                type="button"
                onClick={selectAllGroups}
                className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline font-bold"
              >
                {selectedGroupIds.length === groups.length ? 'Deselect All' : 'Select All Groups'}
              </button>
            </div>
            
            <div className="relative mb-3">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                placeholder="Search groups..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-xs text-slate-900 dark:text-white focus:outline-none"
              />
            </div>

            <div className="max-h-48 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
              {filteredGroups.length === 0 ? (
                <div className="p-4 text-center text-xs text-slate-400">No groups found</div>
              ) : (
                filteredGroups.map(g => {
                  const isChecked = selectedGroupIds.includes(g.id);
                  return (
                    <label
                      key={g.id}
                      className={`flex items-center justify-between p-3 cursor-pointer transition-colors ${
                        isChecked ? 'bg-indigo-50/50 dark:bg-indigo-950/20' : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={() => toggleGroup(g.id)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300"
                        />
                        <div>
                          <p className="text-xs font-bold text-slate-800 dark:text-slate-200">{g.name}</p>
                          <p className="text-[10px] text-slate-400">{g.groupTypeName || 'Small Group'}</p>
                        </div>
                      </div>
                      <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded-full">
                        {g.membersCount || g.memberIds?.length || 0} members
                      </span>
                    </label>
                  );
                })
              )}
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block">
                Leader Talking Points & Script
              </label>
              <button
                type="button"
                onClick={() => setCustomScript(getAiRecommendedCallScript(churchName))}
                className="text-[10px] text-indigo-600 dark:text-indigo-400 font-bold hover:underline"
              >
                ✨ Reset to AI Script
              </button>
            </div>
            <textarea
              rows={4}
              value={customScript}
              onChange={e => setCustomScript(e.target.value)}
              placeholder={defaultAiScript}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none font-medium leading-relaxed"
            />
          </div>

          <div>
            <label className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
              Batch Size Per Leader
            </label>
            <select
              value={batchSize}
              onChange={e => setBatchSize(Number(e.target.value))}
              className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-xl text-slate-900 dark:text-white text-xs focus:ring-2 focus:ring-indigo-500 outline-none font-medium"
            >
              <option value={1}>1 contact at a time</option>
              <option value={3}>3 contacts at a time (Recommended)</option>
              <option value={5}>5 contacts at a time</option>
              <option value={10}>10 contacts at a time</option>
            </select>
          </div>

          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-5 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || selectedGroupIds.length === 0 || !name.trim()}
              className="px-6 py-2.5 rounded-xl text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 transition-all shadow-lg shadow-indigo-200 dark:shadow-none"
            >
              {isSaving ? 'Creating...' : 'Create Session'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// ─── Modal: Share QR Code ──────────────────────────────────────────────────────

interface QrModalProps {
  session: GroupCareSession;
  onClose: () => void;
}

const QrModal: React.FC<QrModalProps> = ({ session, onClose }) => {
  const [qrUrl, setQrUrl] = useState<string>('');
  const [copied, setCopied] = useState(false);

  const shareUrl = `${window.location.origin}/group-care/${session.id}`;

  useEffect(() => {
    QRCode.toDataURL(shareUrl, { width: 280, margin: 2 }).then(setQrUrl).catch(console.error);
  }, [shareUrl]);

  const copyLink = () => {
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-fade-in">
      <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl max-w-sm w-full p-6 text-center border border-slate-200 dark:border-slate-800">
        <h3 className="text-lg font-black text-slate-900 dark:text-white mb-1">{session.name}</h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-6">Scan or share this link with group leaders</p>

        {qrUrl ? (
          <img src={qrUrl} alt="QR Code" className="mx-auto rounded-2xl border border-slate-100 shadow-md mb-6" />
        ) : (
          <div className="h-64 flex items-center justify-center text-xs text-slate-400">Generating QR Code...</div>
        )}

        <div className="flex items-center gap-2 mb-6">
          <input
            type="text"
            readOnly
            value={shareUrl}
            className="flex-1 bg-slate-50 dark:bg-slate-800 text-xs px-3 py-2.5 rounded-xl text-slate-600 dark:text-slate-300 font-mono overflow-x-auto outline-none border border-slate-200 dark:border-slate-700"
          />
          <button
            onClick={copyLink}
            className="px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition-colors"
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
        </div>

        <button
          onClick={onClose}
          className="w-full py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors"
        >
          Close
        </button>
      </div>
    </div>
  );
};

// ─── Main GroupCarePage Component ──────────────────────────────────────────────

export const GroupCarePage: React.FC<GroupCarePageProps> = ({ church, user, people, groups }) => {
  const [sessions, setSessions] = useState<GroupCareSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [liveSlots, setLiveSlots] = useState<GroupCareSlot[]>([]);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [qrSession, setQrSession] = useState<GroupCareSession | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Map of personId -> PcoPerson
  const peopleMap = useMemo(() => {
    const map = new Map<string, PcoPerson>();
    people.forEach(p => map.set(p.id, p));
    return map;
  }, [people]);

  // Load Group Care Sessions
  const fetchSessions = async () => {
    setIsLoading(true);
    try {
      const data = await firestore.getGroupCareSessions(church.id);
      setSessions(data.sort((a, b) => b.createdAt - a.createdAt));
      if (data.length > 0 && !selectedSessionId) {
        setSelectedSessionId(data[0].id);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, [church.id]);

  // Subscribe to live slots for selected session
  useEffect(() => {
    if (!selectedSessionId) return;
    const unsub = firestore.subscribeToGroupCareSlots(selectedSessionId, setLiveSlots);
    return () => unsub();
  }, [selectedSessionId]);

  const activeSession = useMemo(() => {
    return sessions.find(s => s.id === selectedSessionId) || null;
  }, [sessions, selectedSessionId]);

  // Build eligible people for a group session
  const handleCreateSession = async (draft: { name: string; selectedGroupIds: string[]; customScript: string; batchSize: number }) => {
    const selectedGroups = groups.filter(g => draft.selectedGroupIds.includes(g.id));
    
    // Aggregate eligible group members
    const eligiblePeopleMap = new Map<string, { id: string; name: string; phone?: string | null; email?: string | null; groupId: string; groupName: string; isLeader?: boolean }>();
    const leaderDirMap = new Map<string, { phone: string; name: string; personId: string; groupIds: string[] }>();

    selectedGroups.forEach(group => {
      const memberIds = group.memberIds || [];
      const leaderIds = group.leaderIds || [];

      // Find people who belong to this group
      people.forEach(person => {
        const isMember = memberIds.includes(person.id) || (person.groupIds && person.groupIds.includes(group.id));
        const isLeader = leaderIds.includes(person.id);

        if (isMember) {
          if (!eligiblePeopleMap.has(person.id)) {
            eligiblePeopleMap.set(person.id, {
              id: person.id,
              name: person.name,
              phone: person.phone || person.e164Phone || null,
              email: person.email || null,
              groupId: group.id,
              groupName: group.name,
              isLeader
            });
          }
        }

        if (isLeader && person.phone) {
          const normPhone = person.phone.replace(/\D/g, '');
          if (normPhone) {
            const existing = leaderDirMap.get(normPhone);
            if (existing) {
              existing.groupIds.push(group.id);
            } else {
              leaderDirMap.set(normPhone, {
                phone: normPhone,
                name: person.name,
                personId: person.id,
                groupIds: [group.id]
              });
            }
          }
        }
      });
    });

    const newSession: GroupCareSession = {
      id: `group_care_${Date.now()}`,
      churchId: church.id,
      name: draft.name,
      groupIds: draft.selectedGroupIds,
      groupDetails: selectedGroups.map(g => ({ id: g.id, name: g.name, leaderIds: g.leaderIds || [] })),
      eligiblePeople: Array.from(eligiblePeopleMap.values()),
      leaderDirectory: Array.from(leaderDirMap.values()),
      customScript: draft.customScript,
      batchSize: draft.batchSize,
      createdAt: Date.now(),
      createdBy: user.id,
      isActive: true,
      stats: {
        contactedCount: 0,
        noAnswerCount: 0,
        pendingCount: 0,
        totalEligible: eligiblePeopleMap.size,
        lastUpdatedAt: Date.now(),
      }
    };

    await firestore.createGroupCareSession(newSession);
    await fetchSessions();
    setSelectedSessionId(newSession.id);
  };

  const handleToggleSession = async (session: GroupCareSession) => {
    if (session.isActive) {
      await firestore.closeGroupCareSession(session.id, user.id);
    } else {
      await firestore.reopenGroupCareSession(session.id);
    }
    await fetchSessions();
  };

  const handleDeleteSession = async (sessionId: string) => {
    if (!confirm('Are you sure you want to delete this Group Care session?')) return;
    await firestore.deleteGroupCareSession(sessionId);
    await fetchSessions();
    if (selectedSessionId === sessionId) {
      setSelectedSessionId(null);
    }
  };

  // Stats calculation for active session
  const stats = useMemo(() => {
    if (!activeSession) return { contacted: 0, noAnswer: 0, pending: 0, total: 0, percent: 0 };
    const contacted = liveSlots.filter(s => s.status === 'contacted').length;
    const noAnswer = liveSlots.filter(s => s.status === 'no-answer').length;
    const pending = liveSlots.filter(s => s.status === 'pending').length;
    const total = activeSession.eligiblePeople?.length || activeSession.stats?.totalEligible || 0;
    const percent = total > 0 ? Math.round((contacted / total) * 100) : 0;
    return { contacted, noAnswer, pending, total, percent };
  }, [activeSession, liveSlots]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-gradient-to-r from-indigo-900 via-indigo-800 to-slate-900 text-white p-6 rounded-3xl shadow-xl">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wider bg-indigo-500/30 text-indigo-200 border border-indigo-400/30">
              Care Center
            </span>
          </div>
          <h1 className="text-2xl font-black tracking-tight">Group Care Sessions</h1>
          <p className="text-xs text-indigo-200 font-medium mt-1">
            Empower small group leaders to contact and care for members of their groups
          </p>
        </div>

        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center justify-center gap-2 px-5 py-3 bg-white text-indigo-900 hover:bg-indigo-50 font-bold rounded-2xl text-xs transition-all shadow-lg hover:shadow-indigo-500/20 active:scale-95"
        >
          <Plus size={16} /> New Group Care Session
        </button>
      </div>

      {/* Main Grid: Sessions List + Live Board */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Sessions List (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl p-5 border border-slate-200 dark:border-slate-800 shadow-sm">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                Sessions ({sessions.length})
              </h2>
              <button
                onClick={fetchSessions}
                className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 p-1.5 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                <RefreshCw size={14} />
              </button>
            </div>

            {isLoading ? (
              <div className="p-8 text-center text-xs text-slate-400 font-medium">Loading sessions...</div>
            ) : sessions.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                <Users size={32} className="mx-auto mb-2 opacity-50" />
                No Group Care sessions created yet. Click "New Group Care Session" above to start!
              </div>
            ) : (
              <div className="space-y-3">
                {sessions.map(s => {
                  const isSelected = s.id === selectedSessionId;
                  const groupNames = s.groupDetails?.map(g => g.name).join(', ') || `${s.groupIds.length} Groups`;
                  return (
                    <div
                      key={s.id}
                      onClick={() => setSelectedSessionId(s.id)}
                      className={`p-4 rounded-2xl border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-indigo-50/70 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800 shadow-sm'
                          : 'bg-slate-50/50 dark:bg-slate-800/30 border-slate-100 dark:border-slate-800 hover:border-slate-200 dark:hover:border-slate-700'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className={`w-2 h-2 rounded-full ${s.isActive ? 'bg-emerald-500' : 'bg-slate-400'}`} />
                            <h3 className="text-xs font-black text-slate-900 dark:text-white">{s.name}</h3>
                          </div>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 mt-1 line-clamp-1">
                            {groupNames}
                          </p>
                        </div>
                        <span className="text-[10px] font-bold text-slate-400">
                          {new Date(s.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      </div>

                      <div className="mt-3 flex items-center justify-between pt-3 border-t border-slate-200/50 dark:border-slate-800">
                        <span className="text-[10px] font-semibold text-indigo-600 dark:text-indigo-400">
                          {s.eligiblePeople?.length || 0} members targeted
                        </span>
                        <div className="flex items-center gap-1">
                          <button
                            onClick={e => { e.stopPropagation(); setQrSession(s); }}
                            title="Share Link & QR Code"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-white dark:hover:bg-slate-800"
                          >
                            <QrCode size={14} />
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleToggleSession(s); }}
                            title={s.isActive ? 'Close Session' : 'Reopen Session'}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-white dark:hover:bg-slate-800"
                          >
                            {s.isActive ? <Square size={14} /> : <Play size={14} />}
                          </button>
                          <button
                            onClick={e => { e.stopPropagation(); handleDeleteSession(s.id); }}
                            title="Delete Session"
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Selected Session Stats & Live Feed (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {activeSession ? (
            <>
              {/* Session Summary Card */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm space-y-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-100 dark:border-slate-800">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-xl font-black text-slate-900 dark:text-white">{activeSession.name}</h2>
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                        activeSession.isActive ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300' : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}>
                        {activeSession.isActive ? 'Active' : 'Closed'}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                      Created {new Date(activeSession.createdAt).toLocaleDateString()} for {activeSession.groupDetails?.map(g => g.name).join(', ')}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setQrSession(activeSession)}
                      className="px-4 py-2.5 bg-indigo-50 dark:bg-indigo-950/50 hover:bg-indigo-100 text-indigo-600 dark:text-indigo-300 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors"
                    >
                      <QrCode size={15} /> Share Leader Link
                    </button>
                    <a
                      href={`/group-care/${activeSession.id}`}
                      target="_blank"
                      rel="noreferrer"
                      className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-700 dark:text-slate-300 text-xs font-bold rounded-xl flex items-center gap-2 transition-colors"
                    >
                      <ExternalLink size={15} /> Open Leader View
                    </a>
                  </div>
                </div>

                {/* Progress bar & Stat Cards */}
                <div>
                  <div className="flex items-center justify-between text-xs font-bold mb-2">
                    <span className="text-slate-600 dark:text-slate-300">Outreach Progress</span>
                    <span className="text-indigo-600 dark:text-indigo-400">{stats.percent}% Complete</span>
                  </div>
                  <div className="w-full h-3 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden flex">
                    <div className="bg-emerald-500 transition-all duration-500" style={{ width: `${stats.total ? (stats.contacted / stats.total) * 100 : 0}%` }} />
                    <div className="bg-amber-500 transition-all duration-500" style={{ width: `${stats.total ? (stats.noAnswer / stats.total) * 100 : 0}%` }} />
                    <div className="bg-indigo-400 transition-all duration-500" style={{ width: `${stats.total ? (stats.pending / stats.total) * 100 : 0}%` }} />
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Total Members</span>
                    <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{stats.total}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-900/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Contacted</span>
                    <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1">{stats.contacted}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-900/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-amber-600 dark:text-amber-400">No Answer</span>
                    <p className="text-xl font-black text-amber-700 dark:text-amber-300 mt-1">{stats.noAnswer}</p>
                  </div>
                  <div className="p-4 rounded-2xl bg-indigo-50/60 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">In Progress</span>
                    <p className="text-xl font-black text-indigo-700 dark:text-indigo-300 mt-1">{stats.pending}</p>
                  </div>
                </div>
              </div>

              {/* Live Activity Board */}
              <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200 dark:border-slate-800 shadow-sm">
                <h3 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider mb-4">
                  Live Activity Stream ({liveSlots.length} logged contacts)
                </h3>

                {liveSlots.length === 0 ? (
                  <div className="p-12 text-center text-xs text-slate-400">
                    <MessageSquare size={32} className="mx-auto mb-2 opacity-40" />
                    No contact attempts recorded yet. Share the Leader Link above with your group leaders to start!
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[500px] overflow-y-auto pr-1">
                    {liveSlots
                      .sort((a, b) => (b.completedAt || b.assignedAt) - (a.completedAt || a.assignedAt))
                      .map(slot => (
                        <div
                          key={slot.id}
                          className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                        >
                          <div className="space-y-1">
                            <div className="flex items-center gap-2">
                              <span className="text-xs font-bold text-slate-900 dark:text-white">
                                {slot.assignedPersonName}
                              </span>
                              <span className="text-[10px] text-slate-400 font-medium">
                                ({slot.groupName})
                              </span>
                              <StatusBadge status={slot.status} />
                            </div>
                            {slot.notes && (
                              <p className="text-xs text-slate-600 dark:text-slate-300 italic bg-white dark:bg-slate-900 p-2 rounded-xl border border-slate-100 dark:border-slate-800">
                                "{slot.notes}"
                              </p>
                            )}
                            <p className="text-[10px] text-slate-400">
                              Contacted by <span className="font-semibold text-slate-700 dark:text-slate-300">{slot.volunteerName || slot.volunteerPhone}</span>
                            </p>
                          </div>

                          <div className="text-right sm:text-right shrink-0">
                            <span className="text-[10px] text-slate-400 font-medium">
                              {slot.completedAt ? new Date(slot.completedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Assigned'}
                            </span>
                          </div>
                        </div>
                      ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <div className="bg-white dark:bg-slate-900 rounded-3xl p-12 text-center text-slate-400 border border-slate-200 dark:border-slate-800">
              Select a Group Care session from the left or create a new session.
            </div>
          )}
        </div>
      </div>

      {/* Modals */}
      {showCreateModal && (
        <CreateSessionModal
          churchName={church.name}
          groups={groups}
          people={people}
          onClose={() => setShowCreateModal(false)}
          onSave={handleCreateSession}
        />
      )}

      {qrSession && (
        <QrModal
          session={qrSession}
          onClose={() => setQrSession(null)}
        />
      )}
    </div>
  );
};
