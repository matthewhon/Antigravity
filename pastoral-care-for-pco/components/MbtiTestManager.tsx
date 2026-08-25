import React, { useState, useEffect, useMemo } from 'react';
import { 
  Brain, Users, Sparkles, Send, Copy, QrCode, Download,
  Check, Search, Filter, RefreshCw, ChevronRight, X,
  Trash2, ExternalLink, Award, FileText, ArrowUpDown,
  BookOpen, HelpCircle, CheckCircle2, MessageSquare, AlertCircle
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid
} from 'recharts';
import QRCode from 'qrcode';
import { firestore } from '../services/firestoreService';
import { Church, User, PcoPerson, MbtiTestResponse } from '../types';
import { 
  MBTI_QUESTIONS,
  MBTI_TYPE_PROFILES,
  MBTI_TEMPERAMENT_COLORS,
  MbtiTypeProfile
} from '../constants/mbtiTestData';
import { SendAssessmentModal } from './SendAssessmentModal';

interface MbtiTestManagerProps {
  church: Church;
  user: User;
  allPeople: PcoPerson[];
}

export const MbtiTestManager: React.FC<MbtiTestManagerProps> = ({ church, user, allPeople }) => {
  const [responses, setResponses] = useState<MbtiTestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTemperament, setSelectedTemperament] = useState<string>('all');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('all');

  // Modals
  const [selectedDetailResponse, setSelectedDetailResponse] = useState<MbtiTestResponse | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);

  // Outreach / Share Modal state
  const [targetPersonId, setTargetPersonId] = useState<string>('');
  const [targetPhone, setTargetPhone] = useState<string>('');
  const [shareSmsText, setShareSmsText] = useState<string>('');
  const [sendingSms, setSendingSms] = useState(false);
  const [smsSuccess, setSmsSuccess] = useState(false);
  const [smsError, setSmsError] = useState('');
  const [copiedLink, setCopiedLink] = useState(false);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState<string>('');

  const publicTestUrl = useMemo(() => {
    if (typeof window === 'undefined') return '';
    return `${window.location.origin}/mbti-test/${church.id}`;
  }, [church.id]);

  // Load responses
  const loadResponses = async () => {
    try {
      setLoading(true);
      const data = await firestore.getMbtiResponses(church.id);
      setResponses(data);
    } catch (err) {
      console.error('Failed to load MBTI responses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (church?.id) {
      loadResponses();
    }
  }, [church?.id]);

  // Generate QR Code for sharing
  useEffect(() => {
    if (publicTestUrl) {
      QRCode.toDataURL(publicTestUrl, { width: 400, margin: 2 })
        .then(url => setQrCodeDataUrl(url))
        .catch(err => console.error('Error generating QR code:', err));
    }
  }, [publicTestUrl]);

  // Handle Target Person selection for SMS prefill
  const handleSelectPersonForSms = (pId: string) => {
    setTargetPersonId(pId);
    if (!pId) {
      setTargetPhone('');
      setShareSmsText(`Hi! Please take our church Myers-Briggs Personality Assessment to discover your unique personality profile: ${publicTestUrl}`);
      return;
    }
    const person = allPeople.find(p => p.id === pId);
    if (person) {
      setTargetPhone(person.phone || '');
      const personalizedUrl = `${publicTestUrl}?personId=${person.id}&name=${encodeURIComponent(person.name)}`;
      setShareSmsText(`Hi ${person.name.split(' ')[0]}! Please take our church Myers-Briggs Personality Assessment to discover how God has wired your personality: ${personalizedUrl}`);
    }
  };

  // Send SMS invitation
  const handleSendSmsInvitation = async () => {
    if (!targetPhone.trim()) {
      setSmsError('Please specify a recipient mobile phone number.');
      return;
    }
    setSendingSms(true);
    setSmsError('');
    setSmsSuccess(false);

    try {
      const res = await fetch('/api/messaging/send-sms', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          churchId: church.id,
          recipientPhone: targetPhone.trim(),
          body: shareSmsText,
          personId: targetPersonId || null
        })
      });

      if (!res.ok) {
        const d = await res.json();
        throw new Error(d.error || 'Failed to send SMS invitation.');
      }

      setSmsSuccess(true);
      setTimeout(() => {
        setSmsSuccess(false);
      }, 4000);
    } catch (err: any) {
      setSmsError(err.message || 'Error sending SMS.');
    } finally {
      setSendingSms(false);
    }
  };

  const handleDeleteResponse = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to delete the MBTI test response for ${name}?`)) return;
    try {
      await firestore.deleteMbtiResponse(id);
      setResponses(prev => prev.filter(r => r.id !== id));
      if (selectedDetailResponse?.id === id) {
        setSelectedDetailResponse(null);
      }
    } catch (err) {
      console.error('Failed to delete MBTI response:', err);
      alert('Failed to delete response.');
    }
  };

  // ─── Analytics Aggregations ────────────────────────────────────────────────
  const totalTests = responses.length;

  // Temperament counts
  const temperamentCounts = useMemo(() => {
    const counts: Record<string, number> = {
      'Analyst': 0,
      'Diplomat': 0,
      'Sentinel': 0,
      'Explorer': 0
    };
    responses.forEach(r => {
      const temp = r.temperament || MBTI_TYPE_PROFILES[r.mbtiType]?.temperament;
      if (temp && counts[temp] !== undefined) {
        counts[temp]++;
      }
    });
    return counts;
  }, [responses]);

  // Top Personality Type
  const typeCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    responses.forEach(r => {
      counts[r.mbtiType] = (counts[r.mbtiType] || 0) + 1;
    });
    return counts;
  }, [responses]);

  const topType = useMemo(() => {
    const entries = Object.entries(typeCounts);
    if (!entries.length) return null;
    entries.sort((a, b) => b[1] - a[1]);
    return { type: entries[0][0], count: entries[0][1] };
  }, [typeCounts]);

  const temperamentChartData = useMemo(() => {
    return [
      { name: 'Analysts (NT)', count: temperamentCounts['Analyst'], color: MBTI_TEMPERAMENT_COLORS['Analyst'] },
      { name: 'Diplomats (NF)', count: temperamentCounts['Diplomat'], color: MBTI_TEMPERAMENT_COLORS['Diplomat'] },
      { name: 'Sentinels (SJ)', count: temperamentCounts['Sentinel'], color: MBTI_TEMPERAMENT_COLORS['Sentinel'] },
      { name: 'Explorers (SP)', count: temperamentCounts['Explorer'], color: MBTI_TEMPERAMENT_COLORS['Explorer'] },
    ];
  }, [temperamentCounts]);

  // Filtered respondents
  const filteredResponses = useMemo(() => {
    return responses.filter(r => {
      const q = searchQuery.toLowerCase().trim();
      const matchesSearch = !q || 
        r.firstName?.toLowerCase().includes(q) ||
        r.lastName?.toLowerCase().includes(q) ||
        r.personName?.toLowerCase().includes(q) ||
        r.email?.toLowerCase().includes(q) ||
        r.mbtiType?.toLowerCase().includes(q);

      const matchesTemp = selectedTemperament === 'all' || r.temperament === selectedTemperament || MBTI_TYPE_PROFILES[r.mbtiType]?.temperament === selectedTemperament;
      const matchesType = selectedTypeFilter === 'all' || r.mbtiType === selectedTypeFilter;

      return matchesSearch && matchesTemp && matchesType;
    });
  }, [responses, searchQuery, selectedTemperament, selectedTypeFilter]);

  return (
    <div className="space-y-6">
      {/* ── Header & Action Bar ── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-2xl bg-violet-600 text-white flex items-center justify-center shadow-lg shadow-violet-600/20 shrink-0">
            <Brain className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl font-black text-slate-900 dark:text-white">
                Myers-Briggs (MBTI) Assessments
              </h2>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:text-violet-300">
                16 Types
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Discover personality profiles, cognitive dimensions, and team ministry dynamics.
            </p>
          </div>
        </div>

        <div className="flex items-center flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setShowQuestionsModal(true)}
            className="px-3.5 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-slate-400" />
            <span className="hidden sm:inline">28 Questions</span>
          </button>

          <button
            type="button"
            onClick={() => {
              handleSelectPersonForSms('');
              setShowShareModal(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-md shadow-violet-600/20 cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Send Test Link</span>
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Completed Assessments</span>
            <Brain className="w-4 h-4 text-violet-500" />
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white">
            {totalTests}
          </div>
          <p className="text-xs text-slate-400">Total profiles recorded</p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Top Congregational Type</span>
            <Award className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white">
            {topType ? topType.type : '—'}
          </div>
          <p className="text-xs text-slate-400">
            {topType ? `${topType.count} respondent${topType.count > 1 ? 's' : ''} (${MBTI_TYPE_PROFILES[topType.type]?.name.split('/')[0].trim() || ''})` : 'Awaiting submissions'}
          </p>
        </div>

        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Diplomats & Sentinels</span>
            <Users className="w-4 h-4 text-emerald-500" />
          </div>
          <div className="text-3xl font-black text-slate-900 dark:text-white">
            {(temperamentCounts['Diplomat'] + temperamentCounts['Sentinel'])}
          </div>
          <p className="text-xs text-slate-400">
            NF & SJ temperaments in ministry
          </p>
        </div>
      </div>

      {/* ── Temperament Distribution Chart ── */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div>
          <h3 className="text-sm font-black uppercase tracking-wider text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-violet-500" />
            <span>Congregational Temperament Distribution</span>
          </h3>
          <p className="text-xs text-slate-400 mt-0.5">
            Breakdown across Analysts (NT), Diplomats (NF), Sentinels (SJ), and Explorers (SP).
          </p>
        </div>

        {totalTests === 0 ? (
          <div className="text-center py-10 text-slate-400 text-xs italic">
            No MBTI responses recorded yet. Send test links to start seeing congregational distribution!
          </div>
        ) : (
          <div className="h-64 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={temperamentChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.15} />
                <XAxis dataKey="name" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <YAxis allowDecimals={false} tick={{ fill: '#94a3b8', fontSize: 11 }} />
                <Tooltip
                  contentStyle={{ backgroundColor: '#0f172a', borderColor: '#334155', borderRadius: '12px', fontSize: '12px', color: '#fff' }}
                  cursor={{ fill: 'rgba(139, 92, 246, 0.08)' }}
                />
                <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                  {temperamentChartData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {/* ── Respondents Directory & Search ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-4 p-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Assessment Respondents ({filteredResponses.length})
            </h3>
            <p className="text-xs text-slate-400">
              Browse individual scores, 4-letter personality types, and dimension breakdowns.
            </p>
          </div>

          <div className="flex items-center flex-wrap gap-2">
            {/* Search Input */}
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Search name, email, type..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                className="pl-9 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-800 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-violet-500 w-52 sm:w-64"
              />
            </div>

            {/* Temperament Filter */}
            <select
              value={selectedTemperament}
              onChange={e => setSelectedTemperament(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 font-bold focus:outline-none"
            >
              <option value="all">All Temperaments</option>
              <option value="Analyst">Analysts (NT)</option>
              <option value="Diplomat">Diplomats (NF)</option>
              <option value="Sentinel">Sentinels (SJ)</option>
              <option value="Explorer">Explorers (SP)</option>
            </select>

            {/* Specific Type Filter */}
            <select
              value={selectedTypeFilter}
              onChange={e => setSelectedTypeFilter(e.target.value)}
              className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-700 dark:text-slate-300 font-bold focus:outline-none"
            >
              <option value="all">All 16 Types</option>
              {Object.keys(MBTI_TYPE_PROFILES).map(code => (
                <option key={code} value={code}>{code}</option>
              ))}
            </select>

            <button
              type="button"
              onClick={loadResponses}
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 transition cursor-pointer"
              title="Refresh responses"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-violet-600' : ''}`} />
            </button>
          </div>
        </div>

        {/* Directory Table */}
        <div className="overflow-x-auto -mx-6">
          <table className="w-full text-left border-collapse min-w-[700px]">
            <thead>
              <tr className="border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                <th className="py-3 px-6">Respondent</th>
                <th className="py-3 px-4">MBTI Type</th>
                <th className="py-3 px-4">Temperament</th>
                <th className="py-3 px-4">4 Dimensions</th>
                <th className="py-3 px-4">Submitted</th>
                <th className="py-3 px-6 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
              {filteredResponses.length === 0 ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-400 italic">
                    {loading ? 'Loading assessments...' : 'No assessment responses match your search.'}
                  </td>
                </tr>
              ) : (
                filteredResponses.map(r => {
                  const prof = MBTI_TYPE_PROFILES[r.mbtiType] || MBTI_TYPE_PROFILES['ENFJ'];
                  return (
                    <tr key={r.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/40 transition">
                      <td className="py-3.5 px-6">
                        <div className="font-bold text-slate-900 dark:text-white">
                          {r.firstName} {r.lastName}
                        </div>
                        <div className="text-[11px] text-slate-400 truncate max-w-xs">
                          {r.email} {r.phone ? `• ${r.phone}` : ''}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-black" style={{ backgroundColor: `${prof.color}18`, color: prof.color }}>
                          <span>{r.mbtiType}</span>
                        </div>
                        <div className="text-[10px] text-slate-500 dark:text-slate-400 truncate mt-0.5">
                          {prof.name.split('/')[0].trim()}
                        </div>
                      </td>

                      <td className="py-3.5 px-4">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                          {r.temperament || prof.temperament}
                        </span>
                      </td>

                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-1.5 text-[10px] font-black">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {r.traitPercentages?.energy?.type || r.mbtiType[0]} ({r.traitPercentages?.energy?.percent || 50}%)
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {r.traitPercentages?.information?.type || r.mbtiType[1]} ({r.traitPercentages?.information?.percent || 50}%)
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {r.traitPercentages?.decisions?.type || r.mbtiType[2]} ({r.traitPercentages?.decisions?.percent || 50}%)
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                            {r.traitPercentages?.structure?.type || r.mbtiType[3]} ({r.traitPercentages?.structure?.percent || 50}%)
                          </span>
                        </div>
                      </td>

                      <td className="py-3.5 px-4 text-[11px] text-slate-400">
                        {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : '—'}
                      </td>

                      <td className="py-3.5 px-6 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => setSelectedDetailResponse(r)}
                          className="px-3 py-1.5 rounded-lg bg-violet-50 dark:bg-violet-950/40 text-violet-700 dark:text-violet-300 hover:bg-violet-100 dark:hover:bg-violet-900/60 text-xs font-bold transition cursor-pointer"
                        >
                          View Profile
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteResponse(r.id, `${r.firstName} ${r.lastName}`)}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/40 transition cursor-pointer"
                          title="Delete response"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Detail View Modal ── */}
      {selectedDetailResponse && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div 
                  className="w-10 h-10 rounded-2xl flex items-center justify-center text-white shadow-md font-black text-sm"
                  style={{ backgroundColor: MBTI_TYPE_PROFILES[selectedDetailResponse.mbtiType]?.color || '#8b5cf6' }}
                >
                  {selectedDetailResponse.mbtiType}
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900 dark:text-white">
                    {selectedDetailResponse.firstName} {selectedDetailResponse.lastName}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {MBTI_TYPE_PROFILES[selectedDetailResponse.mbtiType]?.name} • Submitted {new Date(selectedDetailResponse.submittedAt).toLocaleDateString()}
                  </p>
                </div>
              </div>

              <button
                onClick={() => setSelectedDetailResponse(null)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-6">
              {/* Profile Overview */}
              <div className="p-4 rounded-2xl bg-violet-50/70 dark:bg-violet-950/30 border border-violet-100 dark:border-violet-800/40 space-y-2">
                <span className="text-[10px] font-black uppercase text-violet-600 dark:text-violet-400 tracking-wider">
                  Summary & Tagline
                </span>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                  {MBTI_TYPE_PROFILES[selectedDetailResponse.mbtiType]?.tagline}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {MBTI_TYPE_PROFILES[selectedDetailResponse.mbtiType]?.fullDescription}
                </p>
              </div>

              {/* 4 Dimension Percentage Bars */}
              {selectedDetailResponse.traitPercentages && (
                <div className="space-y-3">
                  <h5 className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Cognitive Dimension Breakdown
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {/* E vs I */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span>Extraversion ({selectedDetailResponse.traitPercentages.energy.ePercent}%)</span>
                        <span>Introversion ({selectedDetailResponse.traitPercentages.energy.iPercent}%)</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden flex">
                        <div className="h-full bg-violet-600" style={{ width: `${selectedDetailResponse.traitPercentages.energy.ePercent}%` }} />
                        <div className="h-full bg-indigo-400" style={{ width: `${selectedDetailResponse.traitPercentages.energy.iPercent}%` }} />
                      </div>
                    </div>

                    {/* S vs N */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span>Sensing ({selectedDetailResponse.traitPercentages.information.sPercent}%)</span>
                        <span>Intuition ({selectedDetailResponse.traitPercentages.information.nPercent}%)</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden flex">
                        <div className="h-full bg-sky-600" style={{ width: `${selectedDetailResponse.traitPercentages.information.sPercent}%` }} />
                        <div className="h-full bg-cyan-400" style={{ width: `${selectedDetailResponse.traitPercentages.information.nPercent}%` }} />
                      </div>
                    </div>

                    {/* T vs F */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span>Thinking ({selectedDetailResponse.traitPercentages.decisions.tPercent}%)</span>
                        <span>Feeling ({selectedDetailResponse.traitPercentages.decisions.fPercent}%)</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden flex">
                        <div className="h-full bg-amber-500" style={{ width: `${selectedDetailResponse.traitPercentages.decisions.tPercent}%` }} />
                        <div className="h-full bg-pink-400" style={{ width: `${selectedDetailResponse.traitPercentages.decisions.fPercent}%` }} />
                      </div>
                    </div>

                    {/* J vs P */}
                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 space-y-1">
                      <div className="flex justify-between text-xs font-bold">
                        <span>Judging ({selectedDetailResponse.traitPercentages.structure.jPercent}%)</span>
                        <span>Perceiving ({selectedDetailResponse.traitPercentages.structure.pPercent}%)</span>
                      </div>
                      <div className="w-full bg-slate-200 dark:bg-slate-700 h-2 rounded-full overflow-hidden flex">
                        <div className="h-full bg-emerald-600" style={{ width: `${selectedDetailResponse.traitPercentages.structure.jPercent}%` }} />
                        <div className="h-full bg-teal-400" style={{ width: `${selectedDetailResponse.traitPercentages.structure.pPercent}%` }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* Ministry Strengths & Recommended Roles */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">
                    Ministry Strengths
                  </span>
                  <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {MBTI_TYPE_PROFILES[selectedDetailResponse.mbtiType]?.ministryStrengths.map((s, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/30">
                        • {s}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-wider">
                    Ideal Serving Roles
                  </span>
                  <div className="space-y-1.5 text-xs text-slate-700 dark:text-slate-300">
                    {MBTI_TYPE_PROFILES[selectedDetailResponse.mbtiType]?.idealServingRoles.map((r, idx) => (
                      <div key={idx} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700">
                        ✓ {r}
                      </div>
                    ))}
                  </div>
                </div>
              </div>

              {/* All 28 Answer Ratings */}
              <div className="space-y-3 pt-2">
                <h5 className="text-xs font-black uppercase tracking-wider text-slate-400">
                  Individual Ratings for all 28 Statements (1–5)
                </h5>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                  {MBTI_QUESTIONS.map(q => {
                    const ans = selectedDetailResponse.answers?.[q.id] || 0;
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
        </div>
      )}

      {/* ── Send / Share Modal (Directory Search, PCO List, SMS & Email) ── */}
      <SendAssessmentModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        assessmentType="mbti"
        church={church}
        user={user}
        allPeople={allPeople}
      />

      {/* ── Questions Reference Modal ── */}
      {showQuestionsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-3xl w-full max-h-[90vh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-9 h-9 rounded-xl bg-violet-600 text-white flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-base font-black text-slate-900 dark:text-white">
                    Myers-Briggs 28-Statement Assessment Key
                  </h4>
                  <p className="text-xs text-slate-400">
                    7 statements per cognitive dimension (E/I, S/N, T/F, J/P).
                  </p>
                </div>
              </div>

              <button
                onClick={() => setShowQuestionsModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-400 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {MBTI_QUESTIONS.map(q => (
                  <div key={q.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700/60 space-y-1">
                    <div className="flex items-center justify-between text-[10px] font-black uppercase text-violet-600 dark:text-violet-400">
                      <span>Statement #{q.id}</span>
                      <span>Dimension: {q.dimension} ({q.direction})</span>
                    </div>
                    <p className="text-xs text-slate-800 dark:text-slate-200 font-medium">
                      “{q.text}”
                    </p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
