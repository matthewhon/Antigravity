import React, { useEffect, useState, useMemo } from 'react';
import { 
  Target, Award, Calendar, DollarSign, Users, Clock, ArrowRight, 
  CheckCircle2, Sparkles, Heart, AlertCircle, Loader2, X, ExternalLink 
} from 'lucide-react';
import { format, differenceInDays } from 'date-fns';

const apiBaseUrl = typeof window !== 'undefined' && window.location.origin && window.location.origin !== 'null'
  ? window.location.origin
  : (process.env.NODE_ENV === 'production'
    ? 'https://pastoralcare.barnabassoftware.com'
    : 'http://localhost:8080');

interface PledgeCampaignWidgetProps {
  churchId: string;
  campaignId?: string;
  graphicStyle?: 'progress_bar' | 'thermometer' | 'radial_gauge' | 'card_hero' | 'minimal';
  color?: string;
  theme?: string;
  givingEmbedMode?: 'modal' | 'direct_link' | 'inline';
  givingButtonText?: string;
  pledgeButtonText?: string;
  allowOnlinePledging?: boolean;
  scale?: string;
}

export function PledgeCampaignWidget({
  churchId,
  campaignId,
  graphicStyle: propGraphicStyle,
  color: propColor,
  theme: propTheme,
  givingEmbedMode: propGivingEmbedMode,
  givingButtonText: propGivingButtonText,
  pledgeButtonText: propPledgeButtonText,
  allowOnlinePledging: propAllowOnlinePledging
}: PledgeCampaignWidgetProps) {
  const params = new URLSearchParams(window.location.search);
  const activeCampaignId = campaignId || params.get('campaignId') || '';
  
  const [campaign, setCampaign] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Pledge Form Modal State
  const [showPledgeModal, setShowPledgeModal] = useState(false);
  const [pledgeForm, setPledgeForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    amount: '',
    frequency: 'one_time',
    jointGiverType: 'none',
    notes: ''
  });
  const [isSubmittingPledge, setIsSubmittingPledge] = useState(false);
  const [pledgeSubmitted, setPledgeSubmitted] = useState(false);
  const [pledgeError, setPledgeError] = useState<string | null>(null);

  // Load Church Center modal script if in modal mode
  useEffect(() => {
    const existing = document.querySelector('script[src="https://js.churchcenter.com/modal/v1"]');
    if (!existing) {
      const s = document.createElement('script');
      s.src = 'https://js.churchcenter.com/modal/v1';
      s.async = true;
      document.body.appendChild(s);
    }
  }, []);

  // Fetch campaign data
  useEffect(() => {
    const fetchCampaign = async () => {
      setLoading(true);
      try {
        const url = activeCampaignId && activeCampaignId !== 'dynamic'
          ? `${apiBaseUrl}/api/public/pledge-campaign/${churchId}/${activeCampaignId}`
          : `${apiBaseUrl}/api/public/pledge-campaigns/${churchId}`;
        
        const res = await fetch(url, { cache: 'no-store' });
        const data = await res.json();
        if (!res.ok || data.error) throw new Error(data.error || 'Failed to load campaign');

        if (Array.isArray(data)) {
          const selected = activeCampaignId 
            ? data.find(c => String(c.id) === String(activeCampaignId)) || data[0]
            : data[0];
          setCampaign(selected || null);
        } else {
          setCampaign(data);
        }
      } catch (e: any) {
        setError(e.message);
      } finally {
        setLoading(false);
      }
    };

    fetchCampaign();
  }, [churchId, activeCampaignId]);

  // Color themes
  const color = propColor || params.get('color') || campaign?.colorTheme || 'indigo';
  const COLOR_THEMES: Record<string, { bg: string; text: string; ring: string; border: string; bar: string; glow: string }> = {
    indigo: { bg: 'bg-indigo-600', text: 'text-indigo-600 dark:text-indigo-400', ring: 'ring-indigo-500', border: 'border-indigo-500', bar: 'from-indigo-600 to-indigo-400', glow: 'shadow-indigo-500/20' },
    blue:   { bg: 'bg-blue-600',   text: 'text-blue-600 dark:text-blue-400',     ring: 'ring-blue-500',   border: 'border-blue-500',   bar: 'from-blue-600 to-blue-400',     glow: 'shadow-blue-500/20' },
    emerald:{ bg: 'bg-emerald-600',text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500',border: 'border-emerald-500',bar: 'from-emerald-600 to-emerald-400', glow: 'shadow-emerald-500/20' },
    amber:  { bg: 'bg-amber-600',  text: 'text-amber-600 dark:text-amber-400',   ring: 'ring-amber-500',  border: 'border-amber-500',  bar: 'from-amber-600 to-amber-400',   glow: 'shadow-amber-500/20' },
    rose:   { bg: 'bg-rose-600',   text: 'text-rose-600 dark:text-rose-400',     ring: 'ring-rose-500',   border: 'border-rose-500',   bar: 'from-rose-600 to-rose-400',     glow: 'shadow-rose-500/20' },
    violet: { bg: 'bg-violet-600', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-500', border: 'border-violet-500', bar: 'from-violet-600 to-violet-400', glow: 'shadow-violet-500/20' },
  };
  const activeTheme = COLOR_THEMES[color] || COLOR_THEMES.indigo;

  const graphicStyle = propGraphicStyle || params.get('graphicStyle') || campaign?.graphicStyle || 'progress_bar';
  const givingMode = propGivingEmbedMode || params.get('givingMode') || campaign?.givingEmbedMode || 'modal';
  const givingBtnText = propGivingButtonText || params.get('givingBtnText') || campaign?.givingButtonText || 'Give to Campaign';
  const pledgeBtnText = propPledgeButtonText || params.get('pledgeBtnText') || campaign?.pledgeButtonText || 'Pledge Now';
  const allowPledges = propAllowOnlinePledging ?? (params.get('allowPledges') !== 'false' && campaign?.allowOnlinePledging !== false);
  const progressBasis = campaign?.progressBasis || 'both';

  // Calculations
  const goalDollars = (campaign?.goalCents || 0) / 100;
  const pledgedDollars = (campaign?.totalPledgedCents || 0) / 100;
  const receivedDollars = (campaign?.totalReceivedCents || 0) / 100;

  const pledgedPercentNum = goalDollars > 0 ? Math.min(100, Math.round((pledgedDollars / goalDollars) * 100)) : 0;
  const receivedPercentNum = goalDollars > 0 ? Math.min(100, Math.round((receivedDollars / goalDollars) * 100)) : 0;
  const pledgedPercentStr = goalDollars > 0 ? ((pledgedDollars / goalDollars) * 100).toFixed(1) : '0';
  const receivedPercentStr = goalDollars > 0 ? ((receivedDollars / goalDollars) * 100).toFixed(1) : '0';

  const daysLeft = useMemo(() => {
    const end = campaign?.endDate || campaign?.endsAt;
    if (!end) return null;
    const diff = differenceInDays(new Date(end), new Date());
    return Math.max(0, diff);
  }, [campaign?.endDate, campaign?.endsAt]);

  const handlePledgeSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmittingPledge(true);
    setPledgeError(null);

    try {
      const res = await fetch(`${apiBaseUrl}/api/public/pledge-campaign/${churchId}/${campaign.id}/pledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pledgeForm)
      });
      const data = await res.json();
      if (!res.ok || data.error) throw new Error(data.error || 'Failed to submit pledge');

      setPledgeSubmitted(true);
      // Update local state numbers
      const addedCents = Math.round(parseFloat(pledgeForm.amount) * 100);
      setCampaign((prev: any) => ({
        ...prev,
        totalPledgedCents: (prev.totalPledgedCents || 0) + addedCents,
        pledgeCount: (prev.pledgeCount || 0) + 1
      }));
    } catch (err: any) {
      setPledgeError(err.message || 'Submission failed');
    } finally {
      setIsSubmittingPledge(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center p-12 text-slate-400">
        <Loader2 size={32} className="animate-spin mb-3 text-indigo-500" />
        <span className="text-sm font-medium">Loading Campaign Pledges...</span>
      </div>
    );
  }

  if (error || !campaign) {
    return (
      <div className="p-8 text-center border-2 border-dashed border-rose-200 dark:border-rose-900/30 rounded-2xl bg-rose-50 dark:bg-rose-900/10">
        <AlertCircle size={32} className="mx-auto text-rose-500 mb-2" />
        <h3 className="font-bold text-rose-700 dark:text-rose-400">Campaign Not Found</h3>
        <p className="text-xs text-rose-600 dark:text-rose-300 mt-1">{error || 'Please select an active pledge campaign.'}</p>
      </div>
    );
  }

  const heroImage = campaign.bannerUrl || campaign.imageUrl || null;

  return (
    <div className="w-full max-w-4xl mx-auto rounded-3xl overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 transition-all">
      {/* ─── Hero / Header Section ─────────────────────────────────── */}
      <div className="relative overflow-hidden bg-slate-950 text-white min-h-[220px] flex flex-col justify-end p-6 md:p-8">
        {heroImage ? (
          <div className="absolute inset-0 z-0">
            <img src={heroImage} alt={campaign.name} className="w-full h-full object-cover opacity-45" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-slate-950/20" />
          </div>
        ) : (
          <div className="absolute inset-0 z-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950" />
        )}

        <div className="relative z-10 space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-black uppercase tracking-wider bg-white/15 backdrop-blur-md border border-white/20 text-white">
              <Sparkles size={13} className="text-amber-400" /> Pledge Campaign
            </span>
            {campaign.fundName && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-black/40 backdrop-blur-md border border-white/10 text-slate-200">
                <Target size={13} className="text-indigo-400" /> {campaign.fundName}
              </span>
            )}
            {(campaign.startDate || campaign.endDate) && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-black/40 backdrop-blur-md border border-white/10 text-slate-300">
                <Calendar size={13} className="text-indigo-300" /> 
                {campaign.startDate || 'Start'} → {campaign.endDate || 'Ongoing'}
              </span>
            )}
            {daysLeft !== null && (
              <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-bold bg-black/40 backdrop-blur-md border border-white/10 text-amber-300">
                <Clock size={13} /> {daysLeft === 0 ? 'Last Day' : `${daysLeft} Days Left`}
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-4xl font-black tracking-tight drop-shadow-md text-white">
            {campaign.headline || campaign.name}
          </h1>

          {campaign.description && (
            <p className="text-sm sm:text-base text-slate-300 max-w-2xl leading-relaxed font-normal line-clamp-3">
              {campaign.description.replace(/<[^>]+>/g, '')}
            </p>
          )}
        </div>
      </div>

      {/* ─── Main Progress & Graphics Body ─────────────────────────── */}
      <div className="p-6 md:p-8 space-y-8">
        
        {/* 1. VISUAL GRAPHIC: GIVING THERMOMETER */}
        {graphicStyle === 'thermometer' && (
          <div className="bg-slate-50 dark:bg-slate-800/60 p-6 md:p-8 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col md:flex-row items-center gap-8">
            {/* SVG Thermometer */}
            <div className="relative w-32 h-72 shrink-0 flex items-center justify-center">
              <svg viewBox="0 0 100 240" className="w-full h-full filter drop-shadow-lg">
                {/* Outer Glass Tube */}
                <rect x="35" y="20" width="30" height="160" rx="15" fill="#e2e8f0" className="dark:fill-slate-700" stroke="#cbd5e1" strokeWidth="2" />
                {/* Outer Glass Bulb */}
                <circle cx="50" cy="195" r="30" fill="#e2e8f0" className="dark:fill-slate-700" stroke="#cbd5e1" strokeWidth="2" />
                
                {/* Mercury Liquid Fill */}
                <defs>
                  <linearGradient id="mercuryGrad" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#10b981" />
                    <stop offset="100%" stopColor="#34d399" />
                  </linearGradient>
                  <linearGradient id="pledgeGrad" x1="0" y1="1" x2="0" y2="0">
                    <stop offset="0%" stopColor="#6366f1" />
                    <stop offset="100%" stopColor="#818cf8" />
                  </linearGradient>
                </defs>

                {/* Bulb Liquid (Received) */}
                <circle cx="50" cy="195" r="24" fill="url(#mercuryGrad)" />

                {/* Pledged Column (Translucent background) */}
                {pledgedPercentNum > 0 && (
                  <rect 
                    x="40" 
                    y={170 - (Math.min(100, pledgedPercentNum) / 100) * 140} 
                    width="20" 
                    height={(Math.min(100, pledgedPercentNum) / 100) * 140 + 10} 
                    rx="10" 
                    fill="url(#pledgeGrad)" 
                    opacity="0.6"
                    className="transition-all duration-1000"
                  />
                )}

                {/* Given / Received Liquid (Solid Foreground) */}
                {receivedPercentNum > 0 && (
                  <rect 
                    x="40" 
                    y={170 - (Math.min(100, receivedPercentNum) / 100) * 140} 
                    width="20" 
                    height={(Math.min(100, receivedPercentNum) / 100) * 140 + 10} 
                    rx="10" 
                    fill="url(#mercuryGrad)" 
                    className="transition-all duration-1000"
                  />
                )}

                {/* Tick marks */}
                {[0, 25, 50, 75, 100].map((t) => {
                  const y = 170 - (t / 100) * 140;
                  return (
                    <g key={t}>
                      <line x1="68" y1={y} x2="78" y2={y} stroke="#94a3b8" strokeWidth="2" />
                      <text x="82" y={y + 3} fontSize="8" fontWeight="bold" fill="#64748b">{t}%</text>
                    </g>
                  );
                })}
              </svg>
            </div>

            {/* Thermometer Stats Breakdown */}
            <div className="flex-1 space-y-4 text-center md:text-left">
              <div>
                <span className="text-xs font-extrabold uppercase tracking-widest text-emerald-600 dark:text-emerald-400">Total Given Toward Fund</span>
                <div className="text-4xl sm:text-5xl font-black text-slate-900 dark:text-white tracking-tight mt-1">
                  ${Math.round(receivedDollars).toLocaleString()}
                </div>
                <div className="flex flex-wrap items-center justify-center md:justify-start gap-2 mt-2">
                  <span className="text-sm font-bold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/50 px-2.5 py-1 rounded-lg border border-emerald-200 dark:border-emerald-800">
                    {receivedPercentStr}% Given
                  </span>
                  <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-1 rounded-lg border border-indigo-200 dark:border-indigo-800">
                    {pledgedPercentStr}% Pledged
                  </span>
                  <span className="text-sm text-slate-500 dark:text-slate-400">
                    Target: <strong>${Math.round(goalDollars).toLocaleString()}</strong>
                  </span>
                </div>
              </div>

              {/* Stats Grid */}
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
                <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Total Pledged</div>
                  <div className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-0.5">${Math.round(pledgedDollars).toLocaleString()}</div>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Pledges Count</div>
                  <div className="text-lg font-black text-slate-800 dark:text-slate-200 mt-0.5">{campaign.pledgeCount || 0}</div>
                </div>
                <div className="p-3 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 col-span-2 sm:col-span-1">
                  <div className="text-[10px] font-bold text-slate-400 uppercase">Goal Target</div>
                  <div className="text-lg font-black text-slate-800 dark:text-slate-200 mt-0.5">${Math.round(goalDollars).toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* 2. VISUAL GRAPHIC: PROGRESS BAR & DUAL PROGRESS TRACKS */}
        {(graphicStyle === 'progress_bar' || graphicStyle === 'card_hero') && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row justify-between sm:items-end gap-3">
              <div>
                <span className="text-xs font-black uppercase tracking-wider text-slate-400">Campaign Giving & Pledge Progress</span>
                <div className="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white mt-0.5">
                  ${Math.round(receivedDollars).toLocaleString()}{' '}
                  <span className="text-base sm:text-lg font-medium text-slate-400">Given</span>
                  {' · '}
                  <span className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400">
                    ${Math.round(pledgedDollars).toLocaleString()}
                  </span>{' '}
                  <span className="text-base sm:text-lg font-medium text-slate-400">Pledged</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <div className="text-right">
                  <span className="text-xl sm:text-2xl font-black text-emerald-600 dark:text-emerald-400">{receivedPercentStr}%</span>
                  <span className="block text-[10px] uppercase font-bold text-slate-400">Given</span>
                </div>
                <div className="text-right border-l pl-3 border-slate-200 dark:border-slate-700">
                  <span className="text-xl sm:text-2xl font-black text-indigo-600 dark:text-indigo-400">{pledgedPercentStr}%</span>
                  <span className="block text-[10px] uppercase font-bold text-slate-400">Pledged</span>
                </div>
              </div>
            </div>

            {/* Dual Multi-layer Progress Bar */}
            <div className="space-y-1.5">
              <div className="relative w-full h-8 bg-slate-100 dark:bg-slate-800 rounded-full p-1 border border-slate-200 dark:border-slate-700 overflow-hidden shadow-inner flex items-center">
                {/* Pledged bar (outer/behind) */}
                {pledgedPercentNum > 0 && (
                  <div 
                    className="absolute top-1 bottom-1 left-1 rounded-full bg-indigo-400/40 dark:bg-indigo-500/40 transition-all duration-1000 border-r-2 border-indigo-500"
                    style={{ width: `calc(${Math.min(100, Math.max(4, pledgedPercentNum))}% - 8px)` }}
                  />
                )}
                {/* Given / Received bar (inner solid) */}
                {receivedPercentNum > 0 && (
                  <div 
                    className={`relative h-full rounded-full bg-gradient-to-r ${activeTheme.bar} transition-all duration-1000 shadow-md flex items-center justify-end pr-2`}
                    style={{ width: `${Math.min(100, Math.max(5, receivedPercentNum))}%` }}
                  >
                    <div className="w-2 h-2 rounded-full bg-white animate-ping" />
                  </div>
                )}
              </div>

              <div className="flex justify-between items-center text-[11px] font-bold text-slate-400 px-1">
                <div className="flex items-center gap-3">
                  <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                    <span className="w-2 h-2 rounded-full bg-emerald-500" /> Given: ${Math.round(receivedDollars).toLocaleString()}
                  </span>
                  <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                    <span className="w-2 h-2 rounded-full bg-indigo-500" /> Pledged: ${Math.round(pledgedDollars).toLocaleString()}
                  </span>
                </div>
                <span>Goal: ${Math.round(goalDollars).toLocaleString()}</span>
              </div>
            </div>
          </div>
        )}

        {/* 3. VISUAL GRAPHIC: RADIAL GAUGE */}
        {graphicStyle === 'radial_gauge' && (
          <div className="flex flex-col sm:flex-row items-center justify-around gap-6 p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl border border-slate-200 dark:border-slate-700">
            <div className="relative w-48 h-48 flex items-center justify-center">
              <svg className="w-full h-full transform -rotate-90" viewBox="0 0 120 120">
                {/* Background Ring */}
                <circle cx="60" cy="60" r="50" stroke="currentColor" strokeWidth="12" className="text-slate-200 dark:text-slate-700 fill-none" />
                {/* Pledged Ring */}
                <circle 
                  cx="60" 
                  cy="60" 
                  r="50" 
                  stroke="currentColor" 
                  strokeWidth="12" 
                  strokeDasharray="314.159" 
                  strokeDashoffset={314.159 - (314.159 * Math.min(100, pledgedPercentNum)) / 100}
                  strokeLinecap="round" 
                  className="text-indigo-300 dark:text-indigo-500/50 fill-none transition-all duration-1000"
                />
                {/* Given Ring */}
                <circle 
                  cx="60" 
                  cy="60" 
                  r="50" 
                  stroke="currentColor" 
                  strokeWidth="12" 
                  strokeDasharray="314.159" 
                  strokeDashoffset={314.159 - (314.159 * Math.min(100, receivedPercentNum)) / 100}
                  strokeLinecap="round" 
                  className="text-emerald-500 dark:text-emerald-400 fill-none transition-all duration-1000"
                />
              </svg>
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                <span className="text-3xl font-black text-slate-900 dark:text-white">{receivedPercentStr}%</span>
                <span className="text-[10px] font-extrabold uppercase text-emerald-600 dark:text-emerald-400 tracking-wider">Given</span>
              </div>
            </div>

            <div className="space-y-3 text-center sm:text-left">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase">Given Toward Fund</span>
                <div className="text-3xl font-black text-emerald-600 dark:text-emerald-400">${Math.round(receivedDollars).toLocaleString()}</div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Pledged ({pledgedPercentStr}%)</span>
                  <div className="text-lg font-black text-indigo-600 dark:text-indigo-400">${Math.round(pledgedDollars).toLocaleString()}</div>
                </div>
                <div>
                  <span className="text-[11px] font-bold text-slate-400 uppercase">Target Goal</span>
                  <div className="text-lg font-bold text-slate-700 dark:text-slate-300">${Math.round(goalDollars).toLocaleString()}</div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─── Campaign Milestones Timeline (If defined) ───────────────── */}
        {campaign.milestones && campaign.milestones.length > 0 && (
          <div className="space-y-3 pt-2">
            <h3 className="text-xs font-extrabold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Award size={14} className="text-amber-500" /> Campaign Milestones
            </h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
              {campaign.milestones.map((m: any, idx: number) => {
                const targetAmt = parseFloat(m.amount) || 0;
                const isReached = pledgedDollars >= targetAmt;
                return (
                  <div 
                    key={idx} 
                    className={`p-3.5 rounded-xl border flex items-center gap-3 transition ${
                      isReached 
                        ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' 
                        : 'bg-slate-50 dark:bg-slate-800/40 border-slate-200 dark:border-slate-700 opacity-75'
                    }`}
                  >
                    <div className={`p-2 rounded-lg ${isReached ? 'bg-emerald-500 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-400'}`}>
                      <CheckCircle2 size={16} />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs font-bold text-slate-900 dark:text-white truncate">{m.title}</div>
                      <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400">${targetAmt.toLocaleString()}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* ─── Call to Action Buttons ─────────────────────────────────── */}
        <div className="flex flex-col sm:flex-row items-center gap-4 pt-4 border-t border-slate-200 dark:border-slate-800">
          {allowPledges && (
            <button
              onClick={() => { setShowPledgeModal(true); setPledgeSubmitted(false); }}
              className={`flex-1 w-full py-4 px-6 rounded-2xl text-white font-extrabold text-base transition shadow-lg flex items-center justify-center gap-2 hover:opacity-95 ${activeTheme.bg}`}
            >
              <Heart size={18} /> {pledgeBtnText}
            </button>
          )}

          {/* Giving Action Button */}
          {givingMode === 'modal' ? (
            <a
              href={campaign.churchCenterUrl || 'https://churchcenter.com/giving'}
              data-open-in-church-center-modal="true"
              className="flex-1 w-full py-4 px-6 rounded-2xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-extrabold text-base transition shadow-md flex items-center justify-center gap-2 text-center"
            >
              <DollarSign size={18} className="text-emerald-400" /> {givingBtnText}
            </a>
          ) : (
            <a
              href={campaign.churchCenterUrl || 'https://churchcenter.com/giving'}
              target="_blank"
              rel="noopener noreferrer"
              className="flex-1 w-full py-4 px-6 rounded-2xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-extrabold text-base transition shadow-md flex items-center justify-center gap-2 text-center"
            >
              <ExternalLink size={18} className="text-emerald-400" /> {givingBtnText}
            </a>
          )}
        </div>
      </div>

      {/* ─── Pledge Modal (Take Pledges & Send to PCO Giving) ─────────── */}
      {showPledgeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-lg p-6 sm:p-8 shadow-2xl border border-slate-200 dark:border-slate-800 relative max-h-[90vh] overflow-y-auto">
            <button 
              onClick={() => setShowPledgeModal(false)} 
              className="absolute top-5 right-5 text-slate-400 hover:text-slate-600 dark:hover:text-white p-1 rounded-full transition"
            >
              <X size={20} />
            </button>

            {pledgeSubmitted ? (
              <div className="text-center py-8 space-y-4 animate-in zoom-in-95">
                <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-950/50 text-emerald-600 rounded-full flex items-center justify-center mx-auto shadow-inner">
                  <CheckCircle2 size={36} />
                </div>
                <h3 className="text-2xl font-black text-slate-900 dark:text-white">Thank You for Your Pledge!</h3>
                <p className="text-sm text-slate-600 dark:text-slate-300 max-w-sm mx-auto leading-relaxed">
                  Your pledge of <strong>${parseFloat(pledgeForm.amount).toLocaleString()}</strong> towards <strong>{campaign.name}</strong> has been securely recorded.
                </p>
                <button
                  onClick={() => setShowPledgeModal(false)}
                  className="w-full py-3 bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 text-white font-bold rounded-xl text-sm transition"
                >
                  Close
                </button>
              </div>
            ) : (
              <form onSubmit={handlePledgeSubmit} className="space-y-4">
                <div>
                  <span className="text-[11px] font-extrabold uppercase tracking-widest text-indigo-600 dark:text-indigo-400">Make a Commitment</span>
                  <h3 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white mt-0.5">{campaign.name}</h3>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
                    Fill out the details below to submit your campaign pledge.
                  </p>
                </div>

                {pledgeError && (
                  <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 rounded-xl text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
                    <AlertCircle size={14} className="shrink-0" /> {pledgeError}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">First Name *</label>
                    <input 
                      type="text" 
                      required 
                      value={pledgeForm.firstName}
                      onChange={e => setPledgeForm({ ...pledgeForm, firstName: e.target.value })}
                      placeholder="John" 
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Last Name *</label>
                    <input 
                      type="text" 
                      required 
                      value={pledgeForm.lastName}
                      onChange={e => setPledgeForm({ ...pledgeForm, lastName: e.target.value })}
                      placeholder="Doe" 
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Email Address *</label>
                    <input 
                      type="email" 
                      required 
                      value={pledgeForm.email}
                      onChange={e => setPledgeForm({ ...pledgeForm, email: e.target.value })}
                      placeholder="john@example.com" 
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Phone Number</label>
                    <input 
                      type="tel" 
                      value={pledgeForm.phone}
                      onChange={e => setPledgeForm({ ...pledgeForm, phone: e.target.value })}
                      placeholder="(555) 000-0000" 
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Pledge Amount ($) *</label>
                  <div className="relative">
                    <span className="absolute left-3.5 top-2.5 font-black text-slate-400 text-base">$</span>
                    <input 
                      type="number" 
                      required 
                      min="1" 
                      step="any"
                      value={pledgeForm.amount}
                      onChange={e => setPledgeForm({ ...pledgeForm, amount: e.target.value })}
                      placeholder="500.00" 
                      className="w-full pl-8 pr-4 py-2.5 border border-slate-200 dark:border-slate-700 rounded-xl text-lg font-black bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Frequency</label>
                    <select
                      value={pledgeForm.frequency}
                      onChange={e => setPledgeForm({ ...pledgeForm, frequency: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="one_time">One-Time Pledge</option>
                      <option value="weekly">Weekly</option>
                      <option value="monthly">Monthly</option>
                      <option value="annually">Annually</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Pledge As</label>
                    <select
                      value={pledgeForm.jointGiverType}
                      onChange={e => setPledgeForm({ ...pledgeForm, jointGiverType: e.target.value })}
                      className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-sm bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-indigo-500 outline-none"
                    >
                      <option value="none">Individual</option>
                      <option value="joint">Joint / Household</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1">Optional Notes</label>
                  <textarea
                    rows={2}
                    value={pledgeForm.notes}
                    onChange={e => setPledgeForm({ ...pledgeForm, notes: e.target.value })}
                    placeholder="In memory of, or dedicated to..."
                    className="w-full px-3 py-2 border border-slate-200 dark:border-slate-700 rounded-xl text-xs bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:ring-2 focus:ring-indigo-500 outline-none"
                  />
                </div>

                <button
                  type="submit"
                  disabled={isSubmittingPledge}
                  className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white font-black rounded-xl text-sm transition shadow-lg flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  {isSubmittingPledge ? <Loader2 size={16} className="animate-spin" /> : <Heart size={16} />}
                  {isSubmittingPledge ? 'Submitting to Planning Center...' : 'Confirm Pledge'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
