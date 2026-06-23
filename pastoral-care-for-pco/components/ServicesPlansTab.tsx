import React, { useMemo, useState } from 'react';
import { ServicePlanSnapshot, ServicesTeam, PcoPerson, Church } from '../types';

interface ServicesPlansTabProps {
  futurePlans: ServicePlanSnapshot[];
  teams: ServicesTeam[];
  people: PcoPerson[];
  pcoConnected?: boolean;
  onSync?: () => Promise<void>;
  isSyncing?: boolean;
  churchId?: string;
  church?: Church;
}

export const ServicesPlansTab: React.FC<ServicesPlansTabProps> = ({
  futurePlans,
  teams,
  people,
  pcoConnected,
  onSync,
  isSyncing,
  churchId,
  church,
}) => {
  // --- States ---
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [serviceTypeFilter, setServiceTypeFilter] = useState<string>('All');
  
  // Date states (default: today to 30 days in future)
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const defaultEndStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split('T')[0];
  }, []);

  const [startDate, setStartDate] = useState<string>(todayStr);
  const [endDate, setEndDate] = useState<string>(defaultEndStr);
  const [activeDetailTab, setActiveDetailTab] = useState<'items' | 'roster' | 'needs'>('items');

  // ── Email state ──────────────────────────────────────────────────────────────
  const [isEmailOpen, setIsEmailOpen]           = useState(false);
  const [isSending, setIsSending]               = useState(false);
  const [emailStatus, setEmailStatus]           = useState<'idle' | 'success' | 'error'>('idle');
  const [emailError, setEmailError]             = useState('');
  const [emailInput, setEmailInput]             = useState('');
  const [showCustomEmail, setShowCustomEmail]   = useState(false);
  const [lastSentCount, setLastSentCount]       = useState(0);

  // --- Helper: get effective plan date ---
  const getPlanDate = (plan: ServicePlanSnapshot): Date => {
    if (plan.planTimes && plan.planTimes.length > 0) {
      return new Date(plan.planTimes[0].startsAt);
    }
    return new Date(plan.sortDate);
  };

  // --- Helper: get person details ---
  const getPersonDetails = (id: string) => {
    return people.find(p => p.id === id);
  };

  // --- Extract Unique Service Types from future plans ---
  const serviceTypes = useMemo(() => {
    const types = new Set<string>();
    futurePlans.forEach(p => {
      if (p.serviceTypeName) {
        types.add(p.serviceTypeName);
      }
    });
    return Array.from(types).sort();
  }, [futurePlans]);

  // --- Filter Plans ---
  const filteredPlans = useMemo(() => {
    return futurePlans
      .filter(plan => {
        const planDate = getPlanDate(plan);
        const planDateStr = planDate.toISOString().split('T')[0];
        
        // 1. Service Type Filter
        if (serviceTypeFilter !== 'All' && plan.serviceTypeName !== serviceTypeFilter) {
          return false;
        }

        // 2. Date Range Filter
        if (startDate && planDateStr < startDate) return false;
        if (endDate && planDateStr > endDate) return false;

        return true;
      })
      .sort((a, b) => getPlanDate(a).getTime() - getPlanDate(b).getTime());
  }, [futurePlans, serviceTypeFilter, startDate, endDate]);

  // --- Get currently selected plan ---
  const selectedPlan = useMemo(() => {
    if (!selectedPlanId) return null;
    return futurePlans.find(p => p.id === selectedPlanId) || null;
  }, [futurePlans, selectedPlanId]);

  // Auto-select first plan when filters change or on initial load
  React.useEffect(() => {
    if (filteredPlans.length > 0) {
      // If no plan selected, or currently selected plan is not in the filtered list
      if (!selectedPlanId || !filteredPlans.some(p => p.id === selectedPlanId)) {
        setSelectedPlanId(filteredPlans[0].id);
      }
    } else {
      setSelectedPlanId(null);
    }
  }, [filteredPlans, selectedPlanId]);

  // ── Email send helper ─────────────────────────────────────────────────────
  const sendPlanEmail = async (toEveryone: boolean, toAddress?: string) => {
    if (!selectedPlan || !churchId) return;
    setIsSending(true);
    setEmailStatus('idle');
    setEmailError('');
    try {
      const res = await fetch('/api/services/email-plan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          churchId,
          plan: selectedPlan,
          toEveryone: toEveryone || undefined,
          toAddress: toAddress || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to send email');
      setLastSentCount(data.sent || 1);
      setEmailStatus('success');
    } catch (e: any) {
      setEmailError(e.message || 'Email send failed');
      setEmailStatus('error');
    } finally {
      setIsSending(false);
    }
  };

  const openEmailModal = () => {
    setIsEmailOpen(true);
    setEmailStatus('idle');
    setEmailError('');
    setEmailInput('');
    setShowCustomEmail(false);
    setLastSentCount(0);
  };

  const closeEmailModal = () => {
    if (isSending) return;
    setIsEmailOpen(false);
    setTimeout(() => setEmailStatus('idle'), 300);
  };

  const rosterCount = selectedPlan?.teamMembers?.length ?? 0;

  return (
    <div className="space-y-8 animate-in fade-in duration-500">
      {/* Header section */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white">Service Plans</h3>
          <p className="text-slate-400 dark:text-slate-500 font-medium uppercase text-[10px] tracking-widest mt-1">
            Order of Service, Schedule Roster &amp; Staffing Needs
          </p>
        </div>
        
        {pcoConnected && onSync && (
          <button 
            onClick={onSync}
            disabled={isSyncing}
            className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-50 cursor-pointer"
          >
            <span className={isSyncing ? 'animate-spin' : ''}>↻</span>
            <span>{isSyncing ? 'Syncing...' : 'Sync Plans'}</span>
          </button>
        )}
      </header>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        
        {/* Left Column: Filters and Plans List */}
        <div className="lg:col-span-1 space-y-6">
          
          {/* Filters Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-4">
            <h4 className="text-xs font-black uppercase text-slate-400 dark:text-slate-400 tracking-wider">Filters</h4>
            
            {/* Service Type Filter */}
            <div className="space-y-1">
              <label htmlFor="service-type" className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">Service Type</label>
              <select
                id="service-type"
                value={serviceTypeFilter}
                onChange={(e) => setServiceTypeFilter(e.target.value)}
                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all cursor-pointer"
              >
                <option value="All">All Service Types</option>
                {serviceTypes.map(type => (
                  <option key={type} value={type}>{type}</option>
                ))}
              </select>
            </div>

            {/* Date Range Filters */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <label htmlFor="start-date" className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">From Date</label>
                <input
                  id="start-date"
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
              <div className="space-y-1">
                <label htmlFor="end-date" className="text-[10px] font-bold text-slate-500 dark:text-slate-300 uppercase tracking-wider">To Date</label>
                <input
                  id="end-date"
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 rounded-xl py-2 px-3 outline-none focus:ring-2 focus:ring-indigo-500 transition-all"
                />
              </div>
            </div>

            {/* Quick Presets */}
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => { setStartDate(todayStr); setEndDate(defaultEndStr); }}
                className="flex-1 text-[9px] font-black uppercase tracking-widest text-indigo-500 bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 rounded-lg py-1.5 transition-colors"
              >
                Next 30 Days
              </button>
              <button 
                onClick={() => {
                  const end = new Date();
                  end.setDate(end.getDate() + 90);
                  setStartDate(todayStr);
                  setEndDate(end.toISOString().split('T')[0]);
                }}
                className="flex-1 text-[9px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-300 bg-slate-50 dark:bg-slate-800 hover:bg-slate-100 rounded-lg py-1.5 transition-colors"
              >
                Next 90 Days
              </button>
            </div>
          </div>

          {/* Plans List Card */}
          <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm flex flex-col max-h-[600px]">
            <div className="flex justify-between items-center mb-4">
              <h4 className="text-xs font-black uppercase text-slate-400 dark:text-slate-400 tracking-wider">
                Upcoming Plans ({filteredPlans.length})
              </h4>
            </div>

            <div className="space-y-3 overflow-y-auto custom-scrollbar pr-1 flex-1">
              {filteredPlans.length > 0 ? (
                filteredPlans.map(plan => {
                  const planDate = getPlanDate(plan);
                  const isSelected = plan.id === selectedPlanId;
                  
                  // Calculate open positions count
                  const neededCount = plan.neededPositions 
                    ? plan.neededPositions.reduce((sum, p) => sum + p.quantity, 0)
                    : (plan.positionsNeeded || 0);

                  const confirmedCount = plan.teamMembers
                    ? plan.teamMembers.filter(m => m.status === 'Confirmed' || m.status === 'C').length
                    : 0;

                  const totalSlots = confirmedCount + neededCount;
                  const fillPercent = totalSlots > 0 ? Math.round((confirmedCount / totalSlots) * 100) : 100;

                  return (
                    <div 
                      key={plan.id}
                      onClick={() => setSelectedPlanId(plan.id)}
                      className={`p-4 rounded-2xl border cursor-pointer transition-all duration-200 ${
                        isSelected 
                          ? 'border-indigo-500 bg-indigo-50/50 dark:bg-indigo-950/20 shadow-md' 
                          : 'border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900/60 bg-slate-50/50 dark:bg-slate-900/50'
                      }`}
                    >
                      <div className="flex items-start gap-4">
                        {/* Calendar Icon Date */}
                        <div className="w-12 h-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col items-center justify-center shrink-0">
                          <span className="text-[8px] font-black text-rose-500 uppercase tracking-widest leading-none">
                            {planDate.toLocaleDateString(undefined, { month: 'short' })}
                          </span>
                          <span className="text-lg font-black text-slate-900 dark:text-white leading-none mt-0.5">
                            {planDate.getDate()}
                          </span>
                        </div>

                        {/* Title and stats */}
                        <div className="min-w-0 flex-1">
                          <h5 className="text-xs font-black text-slate-900 dark:text-white truncate">
                            {plan.serviceTypeName || 'Service Plan'}
                          </h5>
                          {plan.seriesTitle && (
                            <p className="text-[10px] text-indigo-500 dark:text-indigo-400 font-bold truncate mt-0.5">
                              {plan.seriesTitle}
                            </p>
                          )}
                          <p className="text-[9px] text-slate-400 dark:text-slate-400 font-medium mt-1">
                            ⏰ {planDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                          </p>
                        </div>
                      </div>

                      {/* Small staffing stats */}
                      <div className="mt-3 flex items-center justify-between text-[8px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-400">
                        <span>Staffing Load</span>
                        <span className={neededCount > 0 ? 'text-rose-500' : 'text-emerald-500'}>
                          {neededCount > 0 ? `${neededCount} Slots Needed` : 'Fully Staffed'}
                        </span>
                      </div>
                      <div className="h-1 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden mt-1.5">
                        <div 
                          className={`h-full rounded-full transition-all duration-300 ${neededCount > 0 ? 'bg-amber-400' : 'bg-emerald-500'}`} 
                          style={{ width: `${fillPercent}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <div className="py-12 text-center text-slate-400">
                  <span className="text-3xl">📅</span>
                  <p className="text-xs font-bold mt-2">No Service Plans Found</p>
                  <p className="text-[10px] mt-1">Adjust filters or time period.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right Column: Plan Details Pane */}
        <div className="lg:col-span-2">
          {selectedPlan ? (
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-8 shadow-sm flex flex-col h-full min-h-[600px] animate-in slide-in-from-right-4 duration-300">
              
              {/* Detailed Header */}
              <div className="flex flex-col md:flex-row md:items-start justify-between pb-6 border-b border-slate-150 dark:border-slate-800 gap-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] font-black uppercase bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 px-2 py-0.5 rounded-md border border-indigo-100 dark:border-indigo-900/30">
                      {selectedPlan.serviceTypeName}
                    </span>
                    {selectedPlan.seriesTitle && (
                      <span className="text-[10px] font-black uppercase bg-rose-50 dark:bg-rose-900/10 text-rose-500 px-2 py-0.5 rounded-md border border-rose-100/50 dark:border-rose-900/20">
                        Series: {selectedPlan.seriesTitle}
                      </span>
                    )}
                  </div>
                  <h4 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight mt-2">
                    {selectedPlan.title || 'Service Plan'}
                  </h4>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-400 uppercase tracking-widest mt-1">
                    🗓️ {getPlanDate(selectedPlan).toLocaleDateString(undefined, { 
                      weekday: 'long', 
                      year: 'numeric', 
                      month: 'long', 
                      day: 'numeric' 
                    })} 
                    <span className="mx-2">•</span> 
                    ⏰ {getPlanDate(selectedPlan).toLocaleTimeString(undefined, { 
                      hour: 'numeric', 
                      minute: '2-digit' 
                    })}
                  </p>
                </div>

                {/* Right side: stats + email actions */}
                <div className="flex flex-col gap-3 shrink-0">
                  {/* Staffing Load Badge */}
                  <div className="bg-slate-50 dark:bg-slate-800/50 rounded-2xl p-4 border border-slate-100 dark:border-slate-700/60 flex items-center gap-4">
                    <div className="text-center">
                      <span className="block text-2xl font-black text-indigo-600 dark:text-indigo-400 leading-none">
                        {selectedPlan.items?.length || 0}
                      </span>
                      <span className="text-[8px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Plan Items</span>
                    </div>
                    <div className="h-8 w-px bg-slate-200 dark:bg-slate-700" />
                    <div className="text-center">
                      <span className={`block text-2xl font-black leading-none ${
                        (selectedPlan.positionsNeeded || 0) > 0 ? 'text-rose-500' : 'text-emerald-500'
                      }`}>
                        {selectedPlan.positionsNeeded || 0}
                      </span>
                      <span className="text-[8px] font-bold text-slate-400 dark:text-slate-400 uppercase tracking-wider">Needed Slots</span>
                    </div>
                  </div>

                  {/* Email action buttons */}
                  {churchId && (
                    <div className="flex gap-2">
                      <button
                        onClick={openEmailModal}
                        disabled={!selectedPlan || rosterCount === 0}
                        title={rosterCount === 0 ? 'No roster members' : `Email all ${rosterCount} scheduled people`}
                        className="flex-1 flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl
                          bg-gradient-to-r from-indigo-600 to-violet-600 text-white font-black text-[10px]
                          uppercase tracking-widest hover:from-indigo-700 hover:to-violet-700
                          transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-40 disabled:cursor-not-allowed"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d="M21.75 6.75v10.5a2.25 2.25 0 01-2.25 2.25h-15a2.25 2.25 0 01-2.25-2.25V6.75m19.5 0A2.25 2.25 0 0019.5 4.5h-15a2.25 2.25 0 00-2.25 2.25m19.5 0v.243a2.25 2.25 0 01-1.07 1.916l-7.5 4.615a2.25 2.25 0 01-2.36 0L3.32 8.91a2.25 2.25 0 01-1.07-1.916V6.75" />
                        </svg>
                        Email Everyone
                      </button>
                      <button
                        onClick={() => { openEmailModal(); setShowCustomEmail(true); }}
                        title="Send to a specific email address"
                        className="px-4 py-2.5 rounded-xl border-2 border-indigo-300 dark:border-indigo-700
                          text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-widest
                          hover:bg-indigo-50 dark:hover:bg-indigo-900/20 transition-colors"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                          <path strokeLinecap="round" strokeLinejoin="round"
                            d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L6.832 19.82a4.5 4.5 0 01-1.897 1.13l-2.685.8.8-2.685a4.5 4.5 0 011.13-1.897L16.863 4.487z" />
                        </svg>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Sub-tabs inside Pane */}
              <div className="flex border-b border-slate-150 dark:border-slate-800 mt-6">
                <button
                  onClick={() => setActiveDetailTab('items')}
                  className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 -mb-px transition-all ${
                    activeDetailTab === 'items'
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                  }`}
                >
                  📝 Order of Service
                </button>
                <button
                  onClick={() => setActiveDetailTab('roster')}
                  className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 -mb-px transition-all ${
                    activeDetailTab === 'roster'
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                  }`}
                >
                  👥 Scheduled Roster
                </button>
                <button
                  onClick={() => setActiveDetailTab('needs')}
                  className={`px-6 py-3 text-xs font-black uppercase tracking-wider border-b-2 -mb-px transition-all relative ${
                    activeDetailTab === 'needs'
                      ? 'border-indigo-500 text-indigo-600 dark:text-indigo-400'
                      : 'border-transparent text-slate-400 dark:text-slate-400 hover:text-slate-600 dark:hover:text-slate-200'
                  }`}
                >
                  ⚠️ Open Positions
                  {(selectedPlan.positionsNeeded || 0) > 0 && (
                    <span className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-rose-500 animate-pulse" />
                  )}
                </button>
              </div>

              {/* Tab Contents */}
              <div className="flex-1 overflow-y-auto custom-scrollbar pt-6 max-h-[480px]">
                
                {/* 1. ORDER OF SERVICE */}
                {activeDetailTab === 'items' && (
                  <div className="space-y-4 pr-2">
                    {selectedPlan.items && selectedPlan.items.length > 0 ? (
                      <div className="relative pl-6 space-y-4">
                        {/* Timeline Spine */}
                        <div className="absolute left-[7px] top-2 bottom-2 w-0.5 bg-slate-100 dark:bg-slate-800 rounded-full" />
                        
                        {selectedPlan.items.map((item, idx) => {
                          const isSong = item.type === 'song';
                          const isHeader = item.type === 'header';
                          
                          if (isHeader) {
                            return (
                              <div key={idx} className="relative pt-4 pb-2 first:pt-0 group">
                                {/* Timeline Node */}
                                <div className="absolute -left-[23px] top-6 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 bg-slate-350 dark:bg-slate-600 group-hover:bg-indigo-400 transition-colors" />
                                <div className="pl-1">
                                  <h5 className="text-sm font-black text-slate-900 dark:text-white uppercase tracking-wider">
                                    {item.title}
                                  </h5>
                                  {item.description && (
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-semibold mt-0.5">
                                      {item.description}
                                    </p>
                                  )}
                                </div>
                              </div>
                            );
                          }

                          return (
                            <div key={idx} className="relative group">
                              {/* Timeline Node */}
                              <div className={`absolute -left-[24px] top-1.5 w-3.5 h-3.5 rounded-full border-2 border-white dark:border-slate-900 transition-all ${
                                isSong 
                                  ? 'bg-indigo-500 group-hover:scale-125 shadow-sm shadow-indigo-400' 
                                  : 'bg-slate-300 dark:bg-slate-700'
                              }`} />
                              
                              {/* Item Card */}
                              <div className={`p-4 rounded-2xl border transition-all ${
                                isSong 
                                  ? 'bg-indigo-50/40 dark:bg-indigo-950/10 border-indigo-100 dark:border-indigo-900/40 hover:border-indigo-200' 
                                  : 'bg-slate-50/50 dark:bg-slate-900/40 border-slate-100 dark:border-slate-800 hover:border-slate-200'
                              }`}>
                                <div className="flex items-start justify-between gap-4">
                                  <div className="min-w-0">
                                    <div className="flex items-center gap-2">
                                      <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">
                                        Item {idx + 1}
                                      </span>
                                      <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded-md ${
                                        isSong 
                                          ? 'bg-indigo-100 dark:bg-indigo-900 text-indigo-700 dark:text-indigo-300' 
                                          : 'bg-slate-200 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                      }`}>
                                        {item.type}
                                      </span>
                                    </div>
                                    <h6 className="text-xs font-black text-slate-800 dark:text-white mt-1.5">
                                      {item.title}
                                    </h6>
                                    {isSong && item.author && (
                                      <p className="text-[10px] text-indigo-400 font-bold mt-0.5">
                                        by {item.author}
                                      </p>
                                    )}
                                    {item.description && (
                                      <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium mt-2 border-l border-slate-200 dark:border-slate-700 pl-2">
                                        {item.description}
                                      </p>
                                    )}
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    ) : (
                      <div className="py-12 text-center text-slate-400">
                        <span className="text-3xl">🎵</span>
                        <p className="text-xs font-bold mt-2">No Items in this Plan</p>
                        <p className="text-[10px] mt-1">This plan has no elements synced from Planning Center.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 2. SCHEDULED ROSTER */}
                {activeDetailTab === 'roster' && (
                  <div className="space-y-6 pr-2">
                    {selectedPlan.teamMembers && selectedPlan.teamMembers.length > 0 ? (
                      (() => {
                        // Group team members by teamName
                        const teamsMap: Record<string, typeof selectedPlan.teamMembers> = {};
                        selectedPlan.teamMembers.forEach(m => {
                          const tName = m.teamName || 'Other Staff';
                          if (!teamsMap[tName]) teamsMap[tName] = [];
                          teamsMap[tName].push(m);
                        });

                        return Object.entries(teamsMap).map(([teamName, members]) => (
                          <div key={teamName} className="space-y-2">
                            <h5 className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                              📁 {teamName} ({members.length})
                            </h5>
                            
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                              {members.map((m, idx) => {
                                const pDetails = m.personId ? getPersonDetails(m.personId) : null;
                                const status = m.status || 'Pending';
                                
                                // Color classes for badges
                                const badgeClass = 
                                  status === 'Confirmed' || status === 'C'
                                    ? 'bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-950/20 dark:text-emerald-400 dark:border-emerald-900/30'
                                    : status === 'Declined' || status === 'D'
                                      ? 'bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-950/20 dark:text-rose-400 dark:border-rose-900/30'
                                      : 'bg-amber-50 text-amber-600 border border-amber-100 dark:bg-amber-950/20 dark:text-amber-400 dark:border-amber-900/30';

                                return (
                                  <div 
                                    key={idx} 
                                    className="flex items-center justify-between p-3 bg-slate-50/50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800"
                                  >
                                    <div className="flex items-center gap-3 min-w-0">
                                      {pDetails?.avatar ? (
                                        <img 
                                          src={pDetails.avatar} 
                                          alt={m.name} 
                                          className="w-7 h-7 rounded-full object-cover" 
                                          referrerPolicy="no-referrer"
                                        />
                                      ) : (
                                        <div className="w-7 h-7 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[10px] font-black text-slate-500 dark:text-slate-400">
                                          {m.name?.charAt(0)}
                                        </div>
                                      )}
                                      <div className="min-w-0">
                                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                          {m.name}
                                        </p>
                                        <p className="text-[9px] text-slate-400 truncate">
                                          {m.teamPositionName || 'Volunteer'}
                                        </p>
                                      </div>
                                    </div>
                                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${badgeClass}`}>
                                      {status === 'C' ? 'Confirmed' : status === 'U' || status === 'Pending' ? 'Pending' : status === 'D' ? 'Declined' : status}
                                    </span>
                                  </div>
                                );
                              })}
                            </div>
                          </div>
                        ));
                      })()
                    ) : (
                      <div className="py-12 text-center text-slate-400">
                        <span className="text-3xl">👥</span>
                        <p className="text-xs font-bold mt-2">No Team Members Scheduled</p>
                        <p className="text-[10px] mt-1">Try syncing services to pull staff details.</p>
                      </div>
                    )}
                  </div>
                )}

                {/* 3. OPEN POSITIONS / STAFFING NEEDS */}
                {activeDetailTab === 'needs' && (
                  <div className="space-y-4 pr-2">
                    {selectedPlan.neededPositions && selectedPlan.neededPositions.length > 0 ? (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {selectedPlan.neededPositions.map((np, idx) => (
                          <div 
                            key={idx}
                            className="p-4 bg-rose-50/20 dark:bg-rose-950/10 border border-rose-100 dark:border-rose-900/30 rounded-2xl flex items-center justify-between"
                          >
                            <div>
                              <h6 className="text-xs font-black text-rose-700 dark:text-rose-300">
                                {np.teamName}
                              </h6>
                              <p className="text-[9px] text-slate-400 dark:text-slate-500 uppercase tracking-wider font-bold mt-0.5">
                                Unfilled Slot
                              </p>
                            </div>
                            <span className="bg-rose-100 dark:bg-rose-900 text-rose-800 dark:text-white px-3 py-1 rounded-xl text-xs font-black">
                              {np.quantity} Needed
                            </span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="py-12 text-center text-emerald-500">
                        <span className="text-4xl">🎉</span>
                        <p className="text-xs font-bold mt-2">All Clear! Fully Staffed</p>
                        <p className="text-[10px] text-slate-400 mt-1">No open positions are currently needed for this plan.</p>
                      </div>
                    )}

                    {/* Service Plan Notes if available */}
                    {selectedPlan.planNotes && selectedPlan.planNotes.length > 0 && (
                      <div className="mt-8 border-t border-slate-100 dark:border-slate-800 pt-6">
                        <h5 className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-3">
                          📝 Service Notes
                        </h5>
                        <div className="space-y-3">
                          {selectedPlan.planNotes.map((note, i) => (
                            <div key={i} className="p-4 bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl">
                              <span className="text-[9px] font-black uppercase text-slate-400 tracking-wider">{note.category}</span>
                              <p className="text-[10px] text-slate-650 dark:text-slate-350 font-medium mt-1 whitespace-pre-wrap">{note.content}</p>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          ) : (
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-3xl p-8 shadow-sm flex flex-col justify-center items-center h-full min-h-[600px] text-center">
              <span className="text-5xl animate-bounce">🎹</span>
              <h4 className="text-lg font-black text-slate-900 dark:text-white tracking-tight mt-4">
                Select a Service Plan
              </h4>
              <p className="text-slate-400 dark:text-slate-500 text-xs font-medium max-w-[240px] mt-2 leading-relaxed">
                Click on one of the upcoming plans in the list to inspect its ordered items, staffing schedules, and needed roles.
              </p>
            </div>
          )}
        </div>
      </div>

      {/* ── Email Modal ──────────────────────────────────────────────────── */}
      {isEmailOpen && selectedPlan && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          onClick={(e) => { if (e.target === e.currentTarget) closeEmailModal(); }}
        >
          {/* Backdrop */}
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={closeEmailModal} />

          {/* Modal Card */}
          <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
            {/* Header gradient */}
            <div className="bg-gradient-to-r from-indigo-600 via-violet-600 to-purple-600 p-6 pb-8">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-200 mb-1">Service Plan</p>
                  <h2 className="text-xl font-black text-white leading-tight">
                    {selectedPlan.serviceTypeName || 'Service Plan'}
                  </h2>
                  <p className="text-indigo-200 text-xs font-medium mt-1">
                    {rosterCount} people on the roster
                  </p>
                </div>
                <button
                  onClick={closeEmailModal}
                  disabled={isSending}
                  className="w-8 h-8 rounded-full bg-white/20 hover:bg-white/30 text-white flex items-center justify-center transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>

            {/* Body */}
            <div className="p-6">
              {emailStatus === 'success' ? (
                /* Success state */
                <div className="text-center py-6">
                  <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mx-auto mb-4">
                    <svg className="w-8 h-8 text-emerald-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                  </div>
                  <h3 className="text-lg font-black text-slate-900 dark:text-white">Email{lastSentCount > 1 ? 's' : ''} Sent!</h3>
                  <p className="text-slate-500 dark:text-slate-400 text-sm mt-2">
                    Successfully sent to <strong>{lastSentCount}</strong> recipient{lastSentCount !== 1 ? 's' : ''}.
                  </p>
                  <button
                    onClick={closeEmailModal}
                    className="mt-6 px-6 py-2.5 bg-indigo-600 text-white rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-colors"
                  >
                    Done
                  </button>
                </div>
              ) : (
                /* Send options */
                <>
                  {/* Mode toggle */}
                  <div className="flex gap-2 mb-6 p-1 bg-slate-100 dark:bg-slate-800 rounded-2xl">
                    <button
                      onClick={() => setShowCustomEmail(false)}
                      className={`flex-1 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                        !showCustomEmail
                          ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                      }`}
                    >
                      📣 Email Everyone
                    </button>
                    <button
                      onClick={() => setShowCustomEmail(true)}
                      className={`flex-1 py-2 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                        showCustomEmail
                          ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                          : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                      }`}
                    >
                      ✏️ Custom Email
                    </button>
                  </div>

                  {!showCustomEmail ? (
                    /* Email Everyone panel */
                    <div className="space-y-4">
                      <div className="bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl p-4">
                        <p className="text-sm font-bold text-indigo-900 dark:text-indigo-300 mb-1">
                          📨 Send to all {rosterCount} scheduled team members
                        </p>
                        <p className="text-xs text-indigo-700/70 dark:text-indigo-400/70 leading-relaxed">
                          Each person will receive a personalized email with the complete Order of Service, 
                          Scheduled Roster, and Open Positions. Email addresses are pulled from Planning Center.
                        </p>
                      </div>

                      {emailStatus === 'error' && (
                        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl p-3">
                          <p className="text-xs font-bold text-red-600 dark:text-red-400">⚠ {emailError}</p>
                        </div>
                      )}

                      <button
                        onClick={() => sendPlanEmail(true)}
                        disabled={isSending}
                        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white
                          font-black text-sm uppercase tracking-widest hover:from-indigo-700 hover:to-violet-700
                          transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isSending ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                            Sending...
                          </>
                        ) : (
                          <>📧 Send to {rosterCount} People</>
                        )}
                      </button>
                    </div>
                  ) : (
                    /* Custom email panel */
                    <div className="space-y-4">
                      <div>
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2">
                          Email Address
                        </label>
                        <input
                          type="email"
                          value={emailInput}
                          onChange={e => setEmailInput(e.target.value)}
                          onKeyDown={e => { if (e.key === 'Enter' && emailInput.includes('@')) sendPlanEmail(false, emailInput); }}
                          placeholder="pastor@church.com"
                          className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700
                            rounded-xl text-sm text-slate-900 dark:text-white outline-none
                            focus:ring-2 focus:ring-indigo-500 transition-all"
                        />
                        <p className="text-[10px] text-slate-400 mt-1.5">
                          The full plan — Order of Service, Roster, and Open Positions — will be emailed to this address.
                        </p>
                      </div>

                      {emailStatus === 'error' && (
                        <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/30 rounded-xl p-3">
                          <p className="text-xs font-bold text-red-600 dark:text-red-400">⚠ {emailError}</p>
                        </div>
                      )}

                      <button
                        onClick={() => sendPlanEmail(false, emailInput)}
                        disabled={isSending || !emailInput.includes('@')}
                        className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-indigo-600 to-violet-600 text-white
                          font-black text-sm uppercase tracking-widest hover:from-indigo-700 hover:to-violet-700
                          transition-all shadow-lg shadow-indigo-500/30 disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {isSending ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"/>
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
                            </svg>
                            Sending...
                          </>
                        ) : '📧 Send Email'}
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ServicesPlansTab;
