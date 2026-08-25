import React, { useState, useEffect, useMemo } from 'react';
import { 
  Sparkles, Award, Search, Filter, Share2, Copy, Check,
  QrCode, Send, ExternalLink, Eye, Trash2, Download,
  BarChart2, Users, BookOpen, Clock, AlertCircle, X,
  ChevronRight, ArrowUpDown, RefreshCw, MessageSquare, Mail
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip, 
  ResponsiveContainer, PieChart, Pie, Cell, Legend
} from 'recharts';
import { firestore } from '../services/firestoreService';
import { Church, User, PcoPerson, GiftsTestResponse, SpiritualGiftType } from '../types';
import { 
  SPIRITUAL_GIFTS_QUESTIONS,
  SPIRITUAL_GIFTS_DEFINITIONS,
  SPIRITUAL_GIFTS_SCRIPTURES
} from '../constants/spiritualGiftsTestData';
import { PersonProfileDrawer } from './PersonProfileDrawer';
import { SendAssessmentModal } from './SendAssessmentModal';

interface GiftsTestManagerProps {
  churchId: string;
  church: Church;
  user: User;
  people?: PcoPerson[];
}

const GIFT_COLORS: Record<SpiritualGiftType, string> = {
  'Helps': '#0284c7',
  'Teaching': '#8b5cf6',
  'Encouragement': '#10b981',
  'Administration': '#f59e0b',
  'Mercy': '#ec4899',
  'Giving': '#6366f1'
};

export const GiftsTestManager: React.FC<GiftsTestManagerProps> = ({
  churchId,
  church,
  user,
  people = []
}) => {
  const [responses, setResponses] = useState<GiftsTestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [giftFilter, setGiftFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'primary'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modals
  const [selectedResponse, setSelectedResponse] = useState<GiftsTestResponse | null>(null);
  const [selectedPersonIdForProfile, setSelectedPersonIdForProfile] = useState<string | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);

  // SMS Outreach state
  const [sendSmsTargetPersonId, setSendSmsTargetPersonId] = useState<string>('');
  const [sendSmsCustomPhone, setSendSmsCustomPhone] = useState('');
  const [sendSmsBody, setSendSmsBody] = useState('');
  const [sendingSms, setSendingSms] = useState(false);
  const [smsResultToast, setSmsResultToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const testPublicUrl = useMemo(() => {
    if (typeof window !== 'undefined') {
      const origin = window.location.origin;
      return `${origin}/gifts-test/${churchId}`;
    }
    return `https://pastoralcare.barnabassoftware.com/gifts-test/${churchId}`;
  }, [churchId]);

  // Load all responses for this church
  const loadResponses = async () => {
    try {
      setLoading(true);
      const data = await firestore.getGiftsTestResponses(churchId);
      setResponses(data);
    } catch (err) {
      console.error('Failed to load gifts test responses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (churchId) {
      loadResponses();
    }
  }, [churchId]);

  // Initialize SMS Body when opening share modal
  useEffect(() => {
    if (showShareModal) {
      setSendSmsBody(
        `Hi! Please take a few minutes to complete our church Spiritual Gifts Test online to discover how God has uniquely gifted you: ${testPublicUrl}`
      );
    }
  }, [showShareModal, testPublicUrl]);

  // Filtered & Sorted Responses
  const filteredResponses = useMemo(() => {
    let list = [...responses];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(r => 
        (r.personName || `${r.firstName} ${r.lastName}`).toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        (r.phone && r.phone.includes(q))
      );
    }

    if (giftFilter !== 'all') {
      list = list.filter(r => r.primaryGift === giftFilter);
    }

    list.sort((a, b) => {
      if (sortBy === 'date') {
        return sortOrder === 'desc' 
          ? (b.submittedAt || 0) - (a.submittedAt || 0)
          : (a.submittedAt || 0) - (b.submittedAt || 0);
      }
      if (sortBy === 'name') {
        const nameA = a.personName || `${a.firstName} ${a.lastName}`;
        const nameB = b.personName || `${b.firstName} ${b.lastName}`;
        return sortOrder === 'desc' ? nameB.localeCompare(nameA) : nameA.localeCompare(nameB);
      }
      if (sortBy === 'primary') {
        return sortOrder === 'desc' 
          ? (b.primaryGift || '').localeCompare(a.primaryGift || '')
          : (a.primaryGift || '').localeCompare(b.primaryGift || '');
      }
      return 0;
    });

    return list;
  }, [responses, searchQuery, giftFilter, sortBy, sortOrder]);

  // Aggregated Stats
  const stats = useMemo(() => {
    const total = responses.length;
    const giftCounts: Record<SpiritualGiftType, number> = {
      'Helps': 0,
      'Teaching': 0,
      'Encouragement': 0,
      'Administration': 0,
      'Mercy': 0,
      'Giving': 0
    };

    let totalScoreMap: Record<SpiritualGiftType, number> = {
      'Helps': 0,
      'Teaching': 0,
      'Encouragement': 0,
      'Administration': 0,
      'Mercy': 0,
      'Giving': 0
    };

    responses.forEach(r => {
      if (r.primaryGift && giftCounts[r.primaryGift] !== undefined) {
        giftCounts[r.primaryGift]++;
      }
      if (r.scores) {
        totalScoreMap.Helps += r.scores.helps || 0;
        totalScoreMap.Teaching += r.scores.teaching || 0;
        totalScoreMap.Encouragement += r.scores.encouragement || 0;
        totalScoreMap.Administration += r.scores.administration || 0;
        totalScoreMap.Mercy += r.scores.mercy || 0;
        totalScoreMap.Giving += r.scores.giving || 0;
      }
    });

    const sortedPrimaryGifts = (Object.keys(giftCounts) as SpiritualGiftType[])
      .map(gift => ({ gift, count: giftCounts[gift], color: GIFT_COLORS[gift] }))
      .sort((a, b) => b.count - a.count);

    const topGift = sortedPrimaryGifts[0]?.count > 0 ? sortedPrimaryGifts[0].gift : 'None yet';

    const distributionChartData = (Object.keys(giftCounts) as SpiritualGiftType[]).map(gift => ({
      name: gift,
      count: giftCounts[gift],
      avgScore: total > 0 ? Math.round((totalScoreMap[gift] / total) * 10) / 10 : 0,
      color: GIFT_COLORS[gift]
    }));

    return {
      total,
      topGift,
      sortedPrimaryGifts,
      distributionChartData
    };
  }, [responses]);

  const handleCopyLink = (customUrl?: string) => {
    const url = customUrl || testPublicUrl;
    navigator.clipboard.writeText(url);
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2500);
  };

  const handleDeleteResponse = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the test response for ${name}?`)) return;
    try {
      await firestore.deleteGiftsTestResponse(id);
      setResponses(prev => prev.filter(r => r.id !== id));
      if (selectedResponse?.id === id) setSelectedResponse(null);
    } catch (err) {
      console.error('Failed to delete response:', err);
      alert('Failed to delete response.');
    }
  };

  const handleSendSms = async () => {
    let phoneToSend = sendSmsCustomPhone.trim();
    let personNameToSend = 'Congregant';

    if (sendSmsTargetPersonId) {
      const p = people.find(item => item.id === sendSmsTargetPersonId);
      if (p) {
        phoneToSend = p.e164Phone || p.phone || phoneToSend;
        personNameToSend = p.name || personNameToSend;
      }
    }

    if (!phoneToSend) {
      setSmsResultToast({ type: 'error', message: 'Please provide a valid phone number.' });
      return;
    }

    setSendingSms(true);
    setSmsResultToast(null);

    try {
      const res = await fetch('/api/messaging/send-individual', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          churchId,
          toPhone: phoneToSend.replace(/[^\d+]/g, ''),
          body: sendSmsBody.trim(),
          sentBy: user.id,
          sentByName: user.name,
          personId: sendSmsTargetPersonId || null,
          personName: personNameToSend
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to send SMS');
      }

      setSmsResultToast({ type: 'success', message: `Test link sent via SMS to ${phoneToSend}!` });
      setTimeout(() => setShowShareModal(false), 2000);
    } catch (err: any) {
      setSmsResultToast({ type: 'error', message: err.message || 'Error sending SMS.' });
    } finally {
      setSendingSms(false);
    }
  };

  return (
    <div className="space-y-8 animate-in fade-in duration-500 font-sans">
      {/* Header with Title and Actions */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-indigo-600 text-white flex items-center justify-center shadow-lg shadow-indigo-600/20">
              <Sparkles className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-2xl sm:text-3xl font-black tracking-tight text-slate-900 dark:text-white">
                Spiritual Gifts Test
              </h3>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mt-0.5">
                42-Question Assessment • Romans 12:6–8 Survey
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => setShowQuestionsModal(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-indigo-500" />
            <span>View 42 Questions</span>
          </button>

          <button
            onClick={() => setShowQrModal(true)}
            className="px-4 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider flex items-center gap-2 transition cursor-pointer"
          >
            <QrCode className="w-4 h-4 text-indigo-500" />
            <span>QR Code</span>
          </button>

          <button
            onClick={() => setShowShareModal(true)}
            className="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-2 shadow-lg shadow-indigo-600/20 transition cursor-pointer"
          >
            <Share2 className="w-4 h-4" />
            <span>Send Test Link</span>
          </button>
        </div>
      </header>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Completed */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Total Completed</span>
            <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
              <Users className="w-4 h-4" />
            </span>
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white">
            {stats.total.toLocaleString()}
          </div>
          <p className="text-[10px] text-slate-400">Recorded assessment profiles</p>
        </div>

        {/* Top Spiritual Gift */}
        <div className="p-5 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Top Primary Gift</span>
            <span className="p-2 rounded-xl bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400">
              <Award className="w-4 h-4" />
            </span>
          </div>
          <div className="text-2xl font-black text-slate-900 dark:text-white truncate">
            {stats.topGift}
          </div>
          <p className="text-[10px] text-slate-400">Most frequent in congregation</p>
        </div>

        {/* Public Test Link Copy Box */}
        <div className="sm:col-span-2 p-5 rounded-2xl bg-gradient-to-r from-indigo-900 via-indigo-800 to-violet-900 text-white shadow-md flex flex-col justify-between space-y-3">
          <div>
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-black uppercase tracking-wider text-indigo-200">
                Live Public Test Link
              </span>
              <a
                href={testPublicUrl}
                target="_blank"
                rel="noreferrer"
                className="text-[10px] font-bold text-indigo-200 hover:text-white flex items-center gap-1 uppercase"
              >
                <span>Open Preview</span>
                <ExternalLink className="w-3 h-3" />
              </a>
            </div>
            <p className="text-xs text-indigo-100 truncate mt-1">
              {testPublicUrl}
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => handleCopyLink()}
              className="px-4 py-2 rounded-xl bg-white text-indigo-900 font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 shadow hover:bg-indigo-50 transition cursor-pointer"
            >
              {copiedLink ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Copied!</span>
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  <span>Copy Public URL</span>
                </>
              )}
            </button>
            <button
              onClick={() => setShowShareModal(true)}
              className="px-4 py-2 rounded-xl bg-white/20 hover:bg-white/30 text-white font-bold text-xs uppercase tracking-wider flex items-center gap-1.5 transition cursor-pointer"
            >
              <Send className="w-3.5 h-3.5" />
              <span>Send via SMS / Email</span>
            </button>
          </div>
        </div>
      </div>

      {/* Congregational Distribution Chart */}
      {responses.length > 0 && (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 sm:p-8 border border-slate-200/80 dark:border-slate-800 shadow-sm space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-lg font-black text-slate-900 dark:text-white">
                Congregational Spiritual Gifts Distribution
              </h4>
              <p className="text-xs text-slate-400">
                Breakdown of primary spiritual gifts identified across all test submissions.
              </p>
            </div>
          </div>

          <div className="h-64 sm:h-72 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={stats.distributionChartData} margin={{ top: 10, right: 20, left: 0, bottom: 20 }}>
                <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
                <XAxis 
                  dataKey="name" 
                  tick={{ fontSize: 11, fontWeight: 'bold' }} 
                  stroke="#94a3b8" 
                />
                <YAxis 
                  allowDecimals={false} 
                  tick={{ fontSize: 11 }} 
                  stroke="#94a3b8" 
                />
                <RechartsTooltip 
                  contentStyle={{
                    backgroundColor: '#1e293b',
                    borderRadius: '12px',
                    border: 'none',
                    color: '#fff',
                    fontSize: '12px',
                    fontWeight: 'bold'
                  }}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {stats.distributionChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Quick Gift Badges summary */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3 pt-2">
            {stats.sortedPrimaryGifts.map(g => (
              <div 
                key={g.gift} 
                onClick={() => setGiftFilter(giftFilter === g.gift ? 'all' : g.gift)}
                className={`p-3 rounded-2xl border transition cursor-pointer text-center ${
                  giftFilter === g.gift
                    ? 'border-indigo-600 bg-indigo-50/50 dark:bg-indigo-950/40'
                    : 'border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-slate-300'
                }`}
              >
                <span className="w-2.5 h-2.5 rounded-full inline-block mb-1" style={{ backgroundColor: g.color }} />
                <div className="text-xs font-black text-slate-800 dark:text-slate-200">{g.gift}</div>
                <div className="text-sm font-black text-slate-900 dark:text-white mt-0.5">{g.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Respondents Table Section */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm overflow-hidden space-y-4">
        {/* Table Filter Toolbar */}
        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3 w-full sm:w-auto">
            <div className="relative flex-1 sm:w-72">
              <Search className="w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by respondent name, email..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-medium text-slate-900 dark:text-white outline-none focus:border-indigo-600 transition"
              />
            </div>

            <select
              value={giftFilter}
              onChange={e => setGiftFilter(e.target.value)}
              className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 text-xs font-bold text-slate-700 dark:text-slate-300 outline-none focus:border-indigo-600 transition cursor-pointer"
            >
              <option value="all">All Gifts ({responses.length})</option>
              <option value="Helps">Helps</option>
              <option value="Teaching">Teaching</option>
              <option value="Encouragement">Encouragement</option>
              <option value="Administration">Administration</option>
              <option value="Mercy">Mercy</option>
              <option value="Giving">Giving</option>
            </select>
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto">
            <button
              onClick={loadResponses}
              className="p-2.5 rounded-xl text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition cursor-pointer"
              title="Refresh Responses"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Responses Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 dark:text-slate-400 uppercase font-black tracking-wider text-[10px]">
              <tr>
                <th className="py-3 px-6">Respondent</th>
                <th className="py-3 px-6">Primary Gift</th>
                <th className="py-3 px-6">Secondary Gift</th>
                <th className="py-3 px-6">Top Scores</th>
                <th className="py-3 px-6">Date Taken</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredResponses.map(resp => {
                const displayName = resp.personName || `${resp.firstName} ${resp.lastName}`;
                const primDef = SPIRITUAL_GIFTS_DEFINITIONS[resp.primaryGift];
                const secDef = resp.secondaryGift ? SPIRITUAL_GIFTS_DEFINITIONS[resp.secondaryGift] : null;

                return (
                  <tr key={resp.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                    <td className="py-4 px-6">
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 flex items-center justify-center font-bold text-xs uppercase">
                          {displayName.charAt(0)}
                        </div>
                        <div>
                          <button
                            onClick={() => {
                              if (resp.personId) {
                                setSelectedPersonIdForProfile(resp.personId);
                              } else {
                                setSelectedResponse(resp);
                              }
                            }}
                            className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition text-left cursor-pointer"
                          >
                            {displayName}
                          </button>
                          <div className="text-[11px] text-slate-400">{resp.email || 'No email'}</div>
                        </div>
                      </div>
                    </td>

                    <td className="py-4 px-6">
                      <span 
                        className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-black text-[11px] text-white shadow-sm"
                        style={{ backgroundColor: primDef?.color || '#6366f1' }}
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>{resp.primaryGift}</span>
                      </span>
                    </td>

                    <td className="py-4 px-6">
                      {resp.secondaryGift ? (
                        <span 
                          className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full font-bold text-[11px] bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                        >
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: secDef?.color || '#94a3b8' }} />
                          <span>{resp.secondaryGift}</span>
                        </span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="py-4 px-6">
                      <div className="flex items-center gap-1.5 text-[11px] font-bold text-slate-600 dark:text-slate-300">
                        <span>{resp.rankedGifts?.[0]?.gift}: {resp.rankedGifts?.[0]?.score}</span>
                        <span className="text-slate-400">•</span>
                        <span>{resp.rankedGifts?.[1]?.gift}: {resp.rankedGifts?.[1]?.score}</span>
                      </div>
                    </td>

                    <td className="py-4 px-6 text-slate-500 dark:text-slate-400">
                      {new Date(resp.submittedAt).toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                      })}
                    </td>

                    <td className="py-4 px-6 text-right space-x-2">
                      <button
                        onClick={() => setSelectedResponse(resp)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition cursor-pointer"
                        title="View Full Test Breakdown"
                      >
                        <Eye className="w-4 h-4" />
                      </button>

                      <button
                        onClick={() => handleDeleteResponse(resp.id, displayName)}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                        title="Delete Response"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                );
              })}

              {filteredResponses.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-16 text-center text-slate-400">
                    <div className="max-w-sm mx-auto space-y-3">
                      <Sparkles className="w-8 h-8 mx-auto opacity-30 text-indigo-600" />
                      <p className="font-bold text-slate-600 dark:text-slate-300">No test results found</p>
                      <p className="text-xs text-slate-400">
                        {searchQuery ? 'Try adjusting your search criteria.' : 'Share the test link to begin collecting spiritual gifts assessments.'}
                      </p>
                      <button
                        onClick={() => setShowShareModal(true)}
                        className="px-4 py-2 rounded-xl bg-indigo-600 text-white font-bold text-xs uppercase tracking-wider inline-flex items-center gap-2 shadow hover:bg-indigo-700 transition cursor-pointer"
                      >
                        <Share2 className="w-3.5 h-3.5" />
                        <span>Send First Test Link</span>
                      </button>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Modal 1: Individual Response Breakdown ───────────────────────── */}
      {selectedResponse && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md"
                  style={{ backgroundColor: SPIRITUAL_GIFTS_DEFINITIONS[selectedResponse.primaryGift]?.color || '#6366f1' }}
                >
                  <Sparkles className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900 dark:text-white">
                    {selectedResponse.personName || `${selectedResponse.firstName} ${selectedResponse.lastName}`}
                  </h4>
                  <p className="text-xs text-slate-400">
                    Spiritual Gifts Assessment • Completed on {new Date(selectedResponse.submittedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedResponse(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Primary & Secondary Gifts Cards */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-indigo-50/70 dark:bg-indigo-950/40 border border-indigo-200 dark:border-indigo-800 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">Primary Gift</span>
                  <div className="text-xl font-black text-slate-900 dark:text-white">
                    {selectedResponse.primaryGift}
                  </div>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300">
                    {SPIRITUAL_GIFTS_DEFINITIONS[selectedResponse.primaryGift]?.shortDescription}
                  </p>
                </div>

                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 space-y-1">
                  <span className="text-[10px] font-black uppercase tracking-wider text-slate-400">Secondary Gift</span>
                  <div className="text-xl font-black text-slate-900 dark:text-white">
                    {selectedResponse.secondaryGift || 'None'}
                  </div>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400">
                    {selectedResponse.secondaryGift ? SPIRITUAL_GIFTS_DEFINITIONS[selectedResponse.secondaryGift]?.shortDescription : ''}
                  </p>
                </div>
              </div>

              {/* All 6 Gifts Scores */}
              <div className="space-y-3">
                <h5 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Scores by Gift Category (out of 35)
                </h5>
                <div className="space-y-2.5">
                  {selectedResponse.rankedGifts?.map(rg => {
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
              </div>

              {/* All 42 Answer Breakdown Accordion */}
              <div className="space-y-3 pt-2">
                <h5 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  All 42 Question Ratings (1 = Low, 5 = High)
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {SPIRITUAL_GIFTS_QUESTIONS.map(q => {
                    const ans = selectedResponse.answers?.[q.id] || 0;
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
        </div>
      )}

      {/* ─── Modal 2: Send / Share Test Link (Search, PCO List, SMS & Email) ─── */}
      <SendAssessmentModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        assessmentType="gifts"
        church={church}
        user={user}
        allPeople={people}
      />

      {/* ─── Modal 3: View All 42 Questions ───────────────────────────────── */}
      {showQuestionsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div>
                <h4 className="text-lg font-black text-slate-900 dark:text-white">
                  Spiritual Gifts Test (All 42 Statements)
                </h4>
                <p className="text-xs text-slate-400">
                  Scored across 6 categories: Helps, Teaching, Encouragement, Administration, Mercy, Giving (7 questions each).
                </p>
              </div>
              <button
                onClick={() => setShowQuestionsModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-3">
              {SPIRITUAL_GIFTS_QUESTIONS.map(q => (
                <div key={q.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 flex items-start justify-between gap-4">
                  <div className="flex items-start gap-3">
                    <span className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-bold text-xs flex items-center justify-center shrink-0 mt-0.5">
                      {q.id}
                    </span>
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200">
                      {q.text}
                    </p>
                  </div>
                  <span 
                    className="text-[10px] font-black uppercase px-2.5 py-0.5 rounded-full text-white shrink-0"
                    style={{ backgroundColor: GIFT_COLORS[q.category] }}
                  >
                    {q.category}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── Modal 4: QR Code Modal ───────────────────────────────────────── */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-sm w-full p-6 sm:p-8 border border-slate-200 dark:border-slate-800 shadow-2xl text-center space-y-4 animate-in zoom-in-95">
            <div className="flex justify-between items-center">
              <span className="text-xs font-black uppercase tracking-wider text-slate-400">Scan to Take Test</span>
              <button
                onClick={() => setShowQrModal(false)}
                className="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center hover:bg-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 bg-white rounded-2xl shadow-inner inline-block">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(testPublicUrl)}`}
                alt="Spiritual Gifts Test QR Code"
                className="w-56 h-56 mx-auto"
              />
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                {church.name} Spiritual Gifts Test
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Display this on slides or bulletins for easy congregation access.
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => handleCopyLink()}
                className="flex-1 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-bold text-xs uppercase tracking-wider hover:bg-slate-200 transition cursor-pointer"
              >
                {copiedLink ? 'Copied Link!' : 'Copy Link'}
              </button>
              <a
                href={`https://api.qrserver.com/v1/create-qr-code/?size=500x500&data=${encodeURIComponent(testPublicUrl)}`}
                download="gifts-test-qr.png"
                target="_blank"
                rel="noreferrer"
                className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white font-bold text-xs uppercase tracking-wider hover:bg-indigo-700 transition cursor-pointer inline-flex items-center justify-center gap-1"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Save QR</span>
              </a>
            </div>
          </div>
        </div>
      )}

      {/* Person Profile Drawer (if clicked) */}
      {selectedPersonIdForProfile && (
        <PersonProfileDrawer
          personId={selectedPersonIdForProfile}
          churchId={churchId}
          onClose={() => setSelectedPersonIdForProfile(null)}
        />
      )}
    </div>
  );
};
