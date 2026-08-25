import React, { useState, useEffect, useMemo } from 'react';
import { 
  Compass, Users, Sparkles, Send, Copy, QrCode, Download,
  Check, Search, Filter, RefreshCw, ChevronRight, X,
  Trash2, ExternalLink, Award, FileText, ArrowUpDown,
  BookOpen, HelpCircle, CheckCircle2, MessageSquare, AlertCircle,
  Scale, Shield, Heart, Target
} from 'lucide-react';
import { 
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell, CartesianGrid
} from 'recharts';
import { firestore } from '../services/firestoreService';
import { Church, User, PcoPerson, DiscTestResponse } from '../types';
import { 
  DISC_QUESTIONS,
  DISC_PROFILES,
  DISC_DIMENSIONS_INFO,
  DiscDimension,
  DiscStyleProfile
} from '../constants/discTestData';
import { SendAssessmentModal } from './SendAssessmentModal';

interface DiscTestManagerProps {
  church: Church;
  user: User;
  allPeople: PcoPerson[];
  onOpenPersonProfile?: (personId: string) => void;
}

export const DiscTestManager: React.FC<DiscTestManagerProps> = ({ 
  church, 
  user, 
  allPeople,
  onOpenPersonProfile 
}) => {
  const [responses, setResponses] = useState<DiscTestResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [dimensionFilter, setDimensionFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date' | 'name' | 'style'>('date');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Modals
  const [selectedDetailResponse, setSelectedDetailResponse] = useState<DiscTestResponse | null>(null);
  const [showShareModal, setShowShareModal] = useState(false);
  const [showQuestionsModal, setShowQuestionsModal] = useState(false);

  // Load responses
  const loadResponses = async () => {
    try {
      setLoading(true);
      const data = await firestore.getDiscResponses(church.id);
      setResponses(data);
    } catch (err) {
      console.error('Error loading DISC assessment responses:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (church?.id) {
      loadResponses();
    }
  }, [church?.id]);

  // Analytics
  const stats = useMemo(() => {
    const total = responses.length;
    if (total === 0) {
      return {
        total: 0,
        dCount: 0,
        iCount: 0,
        sCount: 0,
        cCount: 0,
        topDimension: 'None',
        topStyle: 'None',
        chartData: []
      };
    }

    let dCount = 0;
    let iCount = 0;
    let sCount = 0;
    let cCount = 0;

    const styleMap: Record<string, number> = {};

    responses.forEach(r => {
      if (r.primaryDimension === 'D') dCount++;
      if (r.primaryDimension === 'I') iCount++;
      if (r.primaryDimension === 'S') sCount++;
      if (r.primaryDimension === 'C') cCount++;

      const code = r.styleCode || r.primaryDimension;
      styleMap[code] = (styleMap[code] || 0) + 1;
    });

    const dimCounts = [
      { dim: 'Dominance (D)', count: dCount, color: '#ef4444' },
      { dim: 'Influence (I)', count: iCount, color: '#f59e0b' },
      { dim: 'Steadiness (S)', count: sCount, color: '#10b981' },
      { dim: 'Conscientiousness (C)', count: cCount, color: '#3b82f6' }
    ];

    const sortedDims = [...dimCounts].sort((a, b) => b.count - a.count);
    const topDimension = sortedDims[0]?.count > 0 ? sortedDims[0].dim : 'None';

    const sortedStyles = Object.entries(styleMap).sort((a, b) => b[1] - a[1]);
    const topStyle = sortedStyles[0] ? `${sortedStyles[0][0]} (${sortedStyles[0][1]})` : 'None';

    return {
      total,
      dCount,
      iCount,
      sCount,
      cCount,
      topDimension,
      topStyle,
      chartData: dimCounts
    };
  }, [responses]);

  // Filter and sort responses
  const filteredResponses = useMemo(() => {
    let list = [...responses];

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(r => 
        (r.personName || `${r.firstName} ${r.lastName}`).toLowerCase().includes(q) ||
        r.email.toLowerCase().includes(q) ||
        r.styleCode.toLowerCase().includes(q) ||
        r.styleName.toLowerCase().includes(q) ||
        (r.phone && r.phone.includes(q))
      );
    }

    if (dimensionFilter !== 'all') {
      list = list.filter(r => r.primaryDimension === dimensionFilter);
    }

    list.sort((a, b) => {
      if (sortBy === 'date') {
        const timeA = a.submittedAt || 0;
        const timeB = b.submittedAt || 0;
        return sortOrder === 'desc' ? timeB - timeA : timeA - timeB;
      }
      if (sortBy === 'name') {
        const nameA = (a.personName || `${a.firstName} ${a.lastName}`).toLowerCase();
        const nameB = (b.personName || `${b.firstName} ${b.lastName}`).toLowerCase();
        return sortOrder === 'asc' ? nameA.localeCompare(nameB) : nameB.localeCompare(nameA);
      }
      if (sortBy === 'style') {
        const styleA = a.styleCode || '';
        const styleB = b.styleCode || '';
        return sortOrder === 'asc' ? styleA.localeCompare(styleB) : styleB.localeCompare(styleA);
      }
      return 0;
    });

    return list;
  }, [responses, searchQuery, dimensionFilter, sortBy, sortOrder]);

  const handleDeleteResponse = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete the DISC assessment response for ${name}?`)) {
      try {
        await firestore.deleteDiscResponse(id);
        setResponses(prev => prev.filter(r => r.id !== id));
        if (selectedDetailResponse?.id === id) {
          setSelectedDetailResponse(null);
        }
      } catch (err) {
        console.error('Failed to delete response:', err);
        alert('Failed to delete response.');
      }
    }
  };

  return (
    <div className="p-4 sm:p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* ── Top Header ── */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm">
        <div className="flex items-center gap-3.5">
          <div className="w-12 h-12 rounded-2xl bg-emerald-600 text-white flex items-center justify-center shadow-lg shadow-emerald-600/20">
            <Compass className="w-6 h-6" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white">
                Faith-Based DISC Assessment
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                KJV Scriptures
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Equipping believers for ministry and leadership according to their God-given biblical temperament.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowQuestionsModal(true)}
            className="px-3.5 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition flex items-center gap-1.5 cursor-pointer"
          >
            <BookOpen className="w-4 h-4 text-emerald-600" />
            <span>28 Statements Bank</span>
          </button>

          <button
            type="button"
            onClick={() => setShowShareModal(true)}
            className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase tracking-wider flex items-center gap-1.5 shadow-md shadow-emerald-600/20 transition cursor-pointer"
          >
            <Send className="w-4 h-4" />
            <span>Send Test Link</span>
          </button>
        </div>
      </div>

      {/* ── KPI Cards ── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Completed Tests</span>
            <Users className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-slate-900 dark:text-white">
            {stats.total}
          </div>
          <p className="text-[11px] text-slate-400">
            Across congregation members
          </p>
        </div>

        {/* Dominance */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>High Dominance (D)</span>
            <Shield className="w-4 h-4 text-red-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-red-600 dark:text-red-400">
            {stats.dCount} <span className="text-xs text-slate-400 font-normal">({stats.total > 0 ? Math.round((stats.dCount / stats.total) * 100) : 0}%)</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Bold, pioneering leaders
          </p>
        </div>

        {/* Influence & Steadiness */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Influence (I) & Steadiness (S)</span>
            <Heart className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-amber-600 dark:text-amber-400">
            {stats.iCount + stats.sCount} <span className="text-xs text-slate-400 font-normal">({stats.total > 0 ? Math.round(((stats.iCount + stats.sCount) / stats.total) * 100) : 0}%)</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Relational, encouraging servants
          </p>
        </div>

        {/* Conscientiousness */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-2">
          <div className="flex items-center justify-between text-slate-400 text-xs font-bold uppercase tracking-wider">
            <span>Conscientiousness (C)</span>
            <Scale className="w-4 h-4 text-blue-500" />
          </div>
          <div className="text-2xl sm:text-3xl font-black text-blue-600 dark:text-blue-400">
            {stats.cCount} <span className="text-xs text-slate-400 font-normal">({stats.total > 0 ? Math.round((stats.cCount / stats.total) * 100) : 0}%)</span>
          </div>
          <p className="text-[11px] text-slate-400">
            Orderly, doctrinally sound stewards
          </p>
        </div>
      </div>

      {/* ── Chart & Distribution ── */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-base font-black text-slate-900 dark:text-white">
              Congregational DISC Dimension Distribution
            </h3>
            <p className="text-xs text-slate-400">
              Primary dimension breakdown across all respondents
            </p>
          </div>
          <button
            type="button"
            onClick={loadResponses}
            className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 transition cursor-pointer"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>

        <div className="h-48 w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={stats.chartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" opacity={0.15} />
              <XAxis dataKey="dim" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} tick={{ fontSize: 11 }} />
              <Tooltip 
                contentStyle={{ 
                  borderRadius: '16px', 
                  border: '1px solid #e2e8f0',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }} 
              />
              <Bar dataKey="count" radius={[8, 8, 0, 0]}>
                {stats.chartData.map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={entry.color} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ── Directory Table & Filters ── */}
      <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden space-y-4">
        {/* Controls */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="relative w-full md:w-80">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search by name, email, or DISC style..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2.5 w-full md:w-auto flex-wrap">
            {/* Dimension Filter */}
            <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl text-xs font-bold">
              {(['all', 'D', 'I', 'S', 'C'] as const).map(d => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDimensionFilter(d)}
                  className={`px-3 py-1.5 rounded-lg transition cursor-pointer ${
                    dimensionFilter === d
                      ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                      : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  {d === 'all' ? 'All' : d}
                </button>
              ))}
            </div>

            {/* Sort Order */}
            <button
              type="button"
              onClick={() => setSortOrder(prev => prev === 'asc' ? 'desc' : 'asc')}
              className="p-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition cursor-pointer"
              title={`Sort ${sortOrder === 'asc' ? 'Descending' : 'Ascending'}`}
            >
              <ArrowUpDown className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-slate-50 dark:bg-slate-800/40 text-slate-400 font-bold uppercase tracking-wider border-b border-slate-100 dark:border-slate-800">
                <th className="py-3 px-4">Participant</th>
                <th className="py-3 px-4">Primary Style</th>
                <th className="py-3 px-4">Dimension Breakdown</th>
                <th className="py-3 px-4">Date Taken</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredResponses.length === 0 ? (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400 italic">
                    {loading ? 'Loading assessments...' : 'No DISC assessment responses found.'}
                  </td>
                </tr>
              ) : (
                filteredResponses.map(r => {
                  const fullName = r.personName || `${r.firstName} ${r.lastName}`;
                  const styleInfo = DISC_PROFILES[r.styleCode] || DISC_PROFILES[r.primaryDimension] || DISC_PROFILES['D'];

                  return (
                    <tr key={r.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40 transition">
                      {/* Participant */}
                      <td className="py-3.5 px-4">
                        <div className="flex items-center gap-3">
                          <div className="w-8 h-8 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 font-black flex items-center justify-center shrink-0">
                            {r.firstName?.charAt(0) || fullName?.charAt(0) || 'P'}
                          </div>
                          <div>
                            <div className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                              <span>{fullName}</span>
                              {r.personId && onOpenPersonProfile && (
                                <button
                                  type="button"
                                  onClick={() => onOpenPersonProfile(r.personId!)}
                                  className="text-slate-400 hover:text-emerald-600 transition"
                                  title="Open Profile Drawer"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </button>
                              )}
                            </div>
                            <div className="text-[11px] text-slate-400 truncate max-w-[200px]">
                              {r.email} {r.phone ? `• ${r.phone}` : ''}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Primary Style Badge */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-xl text-white font-black text-xs shadow-xs"
                            style={{ backgroundColor: styleInfo.color }}
                          >
                            <span>{r.styleCode}</span>
                          </div>
                          <div className="text-[11px] font-bold text-slate-700 dark:text-slate-300">
                            {styleInfo.name.split('(')[0]}
                          </div>
                        </div>
                      </td>

                      {/* 4 Dimension Bars */}
                      <td className="py-3.5 px-4">
                        <div className="w-44 space-y-1">
                          <div className="flex justify-between text-[10px] font-mono font-bold text-slate-500">
                            <span>D: {r.percentages?.D}%</span>
                            <span>I: {r.percentages?.I}%</span>
                            <span>S: {r.percentages?.S}%</span>
                            <span>C: {r.percentages?.C}%</span>
                          </div>
                          <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden flex">
                            <div className="h-full bg-red-500" style={{ width: `${(r.percentages?.D || 0) * 0.25}%` }} />
                            <div className="h-full bg-amber-500" style={{ width: `${(r.percentages?.I || 0) * 0.25}%` }} />
                            <div className="h-full bg-emerald-500" style={{ width: `${(r.percentages?.S || 0) * 0.25}%` }} />
                            <div className="h-full bg-blue-500" style={{ width: `${(r.percentages?.C || 0) * 0.25}%` }} />
                          </div>
                        </div>
                      </td>

                      {/* Date */}
                      <td className="py-3.5 px-4 text-slate-500 dark:text-slate-400 font-mono">
                        {r.submittedAt ? new Date(r.submittedAt).toLocaleDateString() : 'N/A'}
                      </td>

                      {/* Actions */}
                      <td className="py-3.5 px-4 text-right space-x-2">
                        <button
                          type="button"
                          onClick={() => setSelectedDetailResponse(r)}
                          className="px-3 py-1.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/60 text-xs font-bold transition cursor-pointer"
                        >
                          View Profile
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteResponse(r.id, fullName)}
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
                  style={{ backgroundColor: DISC_PROFILES[selectedDetailResponse.styleCode]?.color || '#10b981' }}
                >
                  {selectedDetailResponse.styleCode}
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900 dark:text-white">
                    {selectedDetailResponse.personName || `${selectedDetailResponse.firstName} ${selectedDetailResponse.lastName}`}
                  </h4>
                  <p className="text-xs text-slate-400">
                    {DISC_PROFILES[selectedDetailResponse.styleCode]?.name} • Submitted {new Date(selectedDetailResponse.submittedAt).toLocaleDateString()}
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
              {/* Summary */}
              <div className="p-4 rounded-2xl bg-emerald-50/70 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-800/40 space-y-2">
                <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">
                  Summary & Ministry Overview
                </span>
                <p className="text-xs text-slate-700 dark:text-slate-300 font-medium leading-relaxed">
                  {DISC_PROFILES[selectedDetailResponse.styleCode]?.summary}
                </p>
                <p className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed">
                  {DISC_PROFILES[selectedDetailResponse.styleCode]?.fullDescription}
                </p>
              </div>

              {/* KJV Theme Verse */}
              {DISC_PROFILES[selectedDetailResponse.styleCode]?.themeVerseKjv && (
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-800/50 border-l-4 border-emerald-600 space-y-1">
                  <p className="text-xs italic text-slate-800 dark:text-slate-200 font-serif">
                    “{DISC_PROFILES[selectedDetailResponse.styleCode]?.themeVerseKjv.text}”
                  </p>
                  <p className="text-[11px] font-bold text-emerald-700 dark:text-emerald-400 text-right">
                    — {DISC_PROFILES[selectedDetailResponse.styleCode]?.themeVerseKjv.verse}
                  </p>
                </div>
              )}

              {/* 4 Dimension Percentage Bars */}
              {selectedDetailResponse.percentages && (
                <div className="space-y-3">
                  <h5 className="text-xs font-black uppercase tracking-wider text-slate-400">
                    Dimension Breakdown (Max 35 pts per dimension)
                  </h5>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {(['D', 'I', 'S', 'C'] as DiscDimension[]).map(dim => {
                      const info = DISC_DIMENSIONS_INFO[dim];
                      const score = selectedDetailResponse.scores?.[dim] || 0;
                      const pct = selectedDetailResponse.percentages?.[dim] || 0;

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
                    {DISC_PROFILES[selectedDetailResponse.styleCode]?.baptistMinistryStrengths.map((s, idx) => (
                      <li key={idx}>• {s}</li>
                    ))}
                  </ul>
                </div>

                <div className="p-4 rounded-2xl bg-indigo-50/50 dark:bg-indigo-950/20 border border-indigo-100 dark:border-indigo-900/30 space-y-2">
                  <h6 className="text-[11px] font-black uppercase text-indigo-700 dark:text-indigo-300">
                    Serving Areas
                  </h6>
                  <ul className="text-xs space-y-1 text-slate-700 dark:text-slate-300">
                    {DISC_PROFILES[selectedDetailResponse.styleCode]?.idealServingRoles.map((r, idx) => (
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
                    const ans = selectedDetailResponse.answers?.[q.id] || 0;
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
        </div>
      )}

      {/* ── Questions Reference Modal ── */}
      {showQuestionsModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white dark:bg-slate-900 rounded-3xl max-w-2xl w-full max-h-[85vh] flex flex-col border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden animate-in zoom-in-95">
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-2xl bg-emerald-600 text-white flex items-center justify-center">
                  <BookOpen className="w-5 h-5" />
                </div>
                <div>
                  <h4 className="text-lg font-black text-slate-900 dark:text-white">
                    Faith-Based DISC Question Bank (28 Statements)
                  </h4>
                  <p className="text-xs text-slate-400">
                    7 statements per dimension (D, I, S, C) with KJV Scripture citations
                  </p>
                </div>
              </div>
              <button
                onClick={() => setShowQuestionsModal(false)}
                className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-500 flex items-center justify-center transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-4">
              {DISC_QUESTIONS.map(q => (
                <div key={q.id} className="p-3.5 rounded-2xl bg-slate-50 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black uppercase text-emerald-600 dark:text-emerald-400">
                      Statement #{q.id} • Dimension {q.dimension} ({q.trait})
                    </span>
                    <span className="text-[11px] font-bold text-slate-500 font-mono">
                      {q.kjvReference}
                    </span>
                  </div>
                  <p className="text-xs font-bold text-slate-900 dark:text-white leading-relaxed">
                    “{q.text}”
                  </p>
                  <p className="text-[11px] text-slate-500 dark:text-slate-400 italic">
                    Context: {q.biblicalContext}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── Send / Share Modal (Directory Search, PCO List, SMS & Email) ── */}
      <SendAssessmentModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        assessmentType="disc"
        church={church}
        user={user}
        allPeople={allPeople}
      />
    </div>
  );
};
