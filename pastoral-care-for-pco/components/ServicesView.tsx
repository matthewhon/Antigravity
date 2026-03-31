
import React, { useMemo, useState, useRef } from 'react';
import { ServicesDashboardData, ServicesFilter, PcoPerson, GlobalStats, ServicePlanSnapshot } from '../types';
import { 
    ResponsiveContainer,
    PieChart, Pie, Cell, Tooltip,
    CartesianGrid,
    BarChart, Bar, XAxis, YAxis, Legend
} from 'recharts';
import WidgetsController from './WidgetsController';
import { SERVICES_OVERVIEW_WIDGETS, SERVICES_ATTENDANCE_WIDGETS, SERVICES_TEAMS_WIDGETS } from '../constants/widgetRegistry';
import { WidgetWrapper, StatCard } from './SharedUI';
import { syncServicesData, syncCheckInsData } from '../services/pcoSyncService'; 

interface ServicesViewProps {
  data: ServicesDashboardData | null;
  isLoading: boolean;
  filter: ServicesFilter;
  onFilterChange: (filter: ServicesFilter) => void;
  pcoConnected: boolean;
  overviewWidgets: string[];
  attendanceWidgets: string[];
  teamsWidgets: string[];
  onUpdateOverviewWidgets: (widgets: string[]) => void;
  onUpdateAttendanceWidgets: (widgets: string[]) => void;
  onUpdateTeamsWidgets: (widgets: string[]) => void;
  allowedWidgetIds?: string[];
  onSync?: () => void;
  isSyncing?: boolean;
  people: PcoPerson[];
  onUpdateTheme?: (theme: 'traditional' | 'dark') => void;
  currentTheme?: 'traditional' | 'dark';
  globalStats?: GlobalStats | null;
  churchId?: string;
}

type CheckinTrendFilter = 'Last Week' | 'Last Month' | 'Last Quarter' | 'Current Week' | 'Current Month' | 'Current Quarter';

const TOOLTIP_STYLE = {
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#1e293b',
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
};

const ServicesView: React.FC<ServicesViewProps> = ({ 
  data, 
  isLoading, 
  filter, 
  onFilterChange, 
  pcoConnected, 
  overviewWidgets,
  attendanceWidgets, 
  teamsWidgets, 
  onUpdateOverviewWidgets, 
  onUpdateAttendanceWidgets, 
  onUpdateTeamsWidgets, 
  allowedWidgetIds, 
  onSync, 
  isSyncing, 
  people, 
  onUpdateTheme, 
  currentTheme,
  globalStats, 
  churchId
}) => {
  const [activeTab, setActiveTab] = useState<'Overview' | 'Attendance' | 'Teams'>('Overview');
  const [upcomingPlansFilter, setUpcomingPlansFilter] = useState<'7 Days' | '14 Days' | '30 Days'>('14 Days');
  const [checkinFilter, setCheckinFilter] = useState<CheckinTrendFilter>('Current Month');
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [selectedTeamId, setSelectedTeamId] = useState<string | null>(null);
  const [isServicesSyncing, setIsServicesSyncing] = useState(false);
  const [isCheckInsSyncing, setIsCheckInsSyncing] = useState(false);
  const [expandedRosterPersonId, setExpandedRosterPersonId] = useState<string | null>(null);
  const [expandedBurnoutPersonId, setExpandedBurnoutPersonId] = useState<string | null>(null);

  const availableWidgets = useMemo(() => {
    let widgets: any[] = [];
    if (activeTab === 'Overview') widgets = SERVICES_OVERVIEW_WIDGETS;
    else if (activeTab === 'Attendance') widgets = SERVICES_ATTENDANCE_WIDGETS;
    else widgets = SERVICES_TEAMS_WIDGETS;

    if (!allowedWidgetIds) return widgets;
    return widgets.filter(w => 
        allowedWidgetIds.includes(`services:${w.id}`) || 
        allowedWidgetIds.includes(`services_overview:${w.id}`) || 
        allowedWidgetIds.includes(`services_attendance:${w.id}`) ||
        allowedWidgetIds.includes(`services_teams:${w.id}`)
    );
  }, [allowedWidgetIds, activeTab]);

  const visibleWidgets = activeTab === 'Overview' ? overviewWidgets : activeTab === 'Attendance' ? attendanceWidgets : teamsWidgets;
  const onUpdateWidgets = activeTab === 'Overview' ? onUpdateOverviewWidgets : activeTab === 'Attendance' ? onUpdateAttendanceWidgets : onUpdateTeamsWidgets;

  const safeVisibleWidgets = useMemo(() => {
      const currentAvailableIds = availableWidgets.map(w => w.id);
      return visibleWidgets.filter(id => currentAvailableIds.includes(id));
  }, [visibleWidgets, availableWidgets]);

  const handleRemoveWidget = (id: string) => {
    onUpdateWidgets(visibleWidgets.filter(w => w !== id));
  };

  // --- Drag-and-Drop reordering ---
  const dragItem = useRef<number | null>(null);
  const dragOverItem = useRef<number | null>(null);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragItem.current = position;
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnter = (_e: React.DragEvent<HTMLDivElement>, position: number) => {
    dragOverItem.current = position;
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = '1';
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      const copy = [...safeVisibleWidgets];
      const dragged = copy[dragItem.current];
      copy.splice(dragItem.current, 1);
      copy.splice(dragOverItem.current, 0, dragged);
      onUpdateWidgets(copy);
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const getPersonDetails = (id: string) => {
      return people.find(p => p.id === id);
  };

  const getChurchId = () => {
      return churchId || (people.length > 0 ? people[0].churchId : null);
  };

  const handleServiceSync = async () => {
      const cid = getChurchId();
      
      if (cid) {
          setIsServicesSyncing(true);
          try {
              await syncServicesData(cid);
              if (onSync) await onSync();
          } catch (e) {
              console.error("Service Sync Error", e);
              alert("Sync failed. Check console.");
          } finally {
              setIsServicesSyncing(false);
          }
      } else if (onSync) {
          setIsServicesSyncing(true);
          await onSync();
          setIsServicesSyncing(false);
      }
  };

  const handleCheckInsSync = async () => {
      const cid = getChurchId();
      
      if (cid) {
          setIsCheckInsSyncing(true);
          try {
              await syncCheckInsData(cid);
              if (onSync) await onSync();
          } catch (e) {
              console.error("Check-ins Sync Error", e);
              alert("Check-ins sync failed.");
          } finally {
              setIsCheckInsSyncing(false);
          }
      } else {
          alert("Cannot identify church context.");
      }
  };

  // Helper to get effective date
  const getPlanDate = (plan: ServicePlanSnapshot): Date => {
      if (plan.planTimes && plan.planTimes.length > 0) {
          return new Date(plan.planTimes[0].startsAt);
      }
      return new Date(plan.sortDate);
  };

  // Calculate breakdown for upcoming 30 days specifically for the 'positions' widget
  const upcoming30DayStats = useMemo(() => {
      if (!data?.futurePlans) return null;
      
      const now = new Date();
      now.setHours(0,0,0,0);
      const end = new Date(now);
      end.setDate(end.getDate() + 30);
      end.setHours(23, 59, 59, 999);

      let confirmed = 0;
      let pending = 0;
      let declined = 0;
      let totalOpenSlots = 0;
      let plansFound = false;

      data.futurePlans.forEach(plan => {
          const planDate = getPlanDate(plan);
          const isInRange = planDate >= now && planDate <= end;

          if (isInRange) {
              plansFound = true;
              // Prefer neededPositions array (sum of quantities); fall back to scalar positionsNeeded
              const openFromArray = plan.neededPositions && plan.neededPositions.length > 0
                  ? plan.neededPositions.reduce((sum, p) => sum + (p.quantity || 0), 0)
                  : (plan.positionsNeeded || 0);
              totalOpenSlots += openFromArray;
              
              plan.teamMembers?.forEach(m => {
                  // Robust status check against Normalized Data: 'Confirmed', 'Pending', 'Declined'
                  const status = m.status || 'Pending';
                  if (status === 'Confirmed') confirmed++;
                  else if (status === 'Pending') pending++; // Normalized from 'Unconfirmed' to 'Pending'
                  else if (status === 'Declined') declined++;
              });
          }
      });

      if (!plansFound) return null;

      const filled = confirmed + pending;
      // Open slots come from PCO's needed_positions (already accounts for declines re-opening slots)
      const open = totalOpenSlots;
      // Total Capacity = People Scheduled (confirmed + pending) + Open Slots
      const totalCapacity = filled + open;
      const fillRate = totalCapacity > 0 ? Math.round((filled / totalCapacity) * 100) : 0;

      return { confirmed, pending, declined, totalCapacity, open, fillRate };
  }, [data?.futurePlans]);

  const filteredUpcomingPlans = useMemo<ServicePlanSnapshot[]>(() => {
      if (!data?.futurePlans) return [];
      
      const now = new Date();
      const todayISO = now.toISOString().split('T')[0];
      
      const endDate = new Date();
      if (upcomingPlansFilter === '7 Days') endDate.setDate(endDate.getDate() + 7);
      else if (upcomingPlansFilter === '14 Days') endDate.setDate(endDate.getDate() + 14);
      else endDate.setDate(endDate.getDate() + 30);
      endDate.setHours(23, 59, 59, 999);

      return data.futurePlans
        .filter(p => {
            const planDate = getPlanDate(p);
            // We want plans starting from today (or very recent) up to X days.
            return planDate >= new Date(now.setHours(0,0,0,0)) && planDate <= endDate;
        })
        .sort((a,b) => getPlanDate(a).getTime() - getPlanDate(b).getTime());
  }, [data?.futurePlans, upcomingPlansFilter]);

  const needsAttentionPlans = useMemo<ServicePlanSnapshot[]>(() => {
      if (!data?.futurePlans) return [];
      
      const now = new Date();
      now.setHours(0,0,0,0);
      const end = new Date(now);
      end.setDate(end.getDate() + 7);
      end.setHours(23, 59, 59, 999);

      return data.futurePlans.filter(p => {
          const planDate = getPlanDate(p);
          
          // Check date range (Next 7 Days)
          if (planDate < now || planDate > end) return false;

          // Check if it HAS needs (Pending people OR needed positions)
          // Robust checking for all variations of Pending
          const hasUnconfirmed = p.teamMembers?.some(m => {
              const s = m.status?.toLowerCase();
              return s === 'unconfirmed' || s === 'u' || s === 'pending' || !s;
          });
          
          // positionsNeeded > 0 means there are open slots
          const hasOpenPositions = (p.neededPositions && p.neededPositions.length > 0) || (p.positionsNeeded || 0) > 0;
          
          return hasUnconfirmed || hasOpenPositions;
      }).sort((a,b) => getPlanDate(a).getTime() - getPlanDate(b).getTime());
  }, [data?.futurePlans]);

  const filteredCheckinTrends = useMemo(() => {
      if (!data?.checkIns?.trends) return [];
      const now = new Date();

      // Helper: format a Date as local YYYY-MM-DD (avoids UTC-shift from toISOString)
      const toLocalDateStr = (d: Date) => {
          const y = d.getFullYear();
          const m = String(d.getMonth() + 1).padStart(2, '0');
          const day = String(d.getDate()).padStart(2, '0');
          return `${y}-${m}-${day}`;
      };

      let startDate: Date;
      let endDate: Date;

      switch (checkinFilter) {
          case 'Current Week': {
              startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
              endDate   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() + 6);
              break;
          }
          case 'Last Week': {
              startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 7);
              endDate   = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay() - 1);
              break;
          }
          case 'Current Month': {
              startDate = new Date(now.getFullYear(), now.getMonth(), 1);
              endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
              break;
          }
          case 'Last Month': {
              startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
              endDate   = new Date(now.getFullYear(), now.getMonth(), 0);
              break;
          }
          case 'Current Quarter': {
              const qStart = Math.floor(now.getMonth() / 3) * 3;
              startDate = new Date(now.getFullYear(), qStart, 1);
              endDate   = new Date(now.getFullYear(), qStart + 3, 0);
              break;
          }
          case 'Last Quarter': {
              const lqStart = Math.floor(now.getMonth() / 3) * 3 - 3;
              startDate = new Date(now.getFullYear(), lqStart, 1);
              endDate   = new Date(now.getFullYear(), lqStart + 3, 0);
              break;
          }
          default: {
              startDate = new Date(now.getFullYear(), now.getMonth(), 1);
              endDate   = new Date(now.getFullYear(), now.getMonth() + 1, 0);
          }
      }

      const startStr = toLocalDateStr(startDate);
      const endStr   = toLocalDateStr(endDate);

      return data.checkIns.trends.filter(t => {
          const itemDateStr = t.isoDate || t.date;
          return itemDateStr >= startStr && itemDateStr <= endStr;
      });

  }, [data?.checkIns?.trends, checkinFilter]);

  const eventHeadcountsData = useMemo(() => {
      if (!filteredCheckinTrends) return [];
      
      const events: any[] = [];
      filteredCheckinTrends.forEach(trend => {
          if ((trend as any).events && Array.isArray((trend as any).events)) {
              events.push(...(trend as any).events);
          } else {
              events.push({
                  name: `Daily Total`,
                  startsAt: trend.date,
                  guests: trend.guests,
                  regulars: trend.regulars,
                  volunteers: trend.volunteers,
                  headcount: trend.headcount,
                  digitalCheckins: (trend as any).digitalCheckins || 0,
                  customHeadcounts: (trend as any).customHeadcounts || [],
                  total: trend.total
              });
          }
      });
      
      return events.sort((a,b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
  }, [filteredCheckinTrends]);

  // Collect all unique custom headcount names across filtered trends (for dynamic chart bars)
  const customHeadcountNames = useMemo(() => {
      const names = new Set<string>();
      filteredCheckinTrends.forEach(t => {
          ((t as any).customHeadcounts || []).forEach((c: any) => names.add(c.name));
      });
      return Array.from(names);
  }, [filteredCheckinTrends]);


  if (!pcoConnected) {
    return (
      <div className="bg-white dark:bg-slate-850 rounded-[5rem] p-48 text-center border-4 border-dashed border-slate-100 dark:border-slate-800 animate-in zoom-in">
        <div className="text-[140px] mb-14 grayscale opacity-20 drop-shadow-2xl">🎹</div>
        <h3 className="text-5xl font-black text-slate-900 dark:text-white mb-8 tracking-tighter uppercase">Connection Required</h3>
        <p className="text-slate-400 max-w-lg mx-auto font-medium text-2xl leading-relaxed">
          Connect Planning Center to unlock Services analytics and scheduling metrics.
        </p>
      </div>
    );
  }

  const renderWidget = (id: string) => {
    if (!data) return null;

    const gridColor = currentTheme === 'dark' ? '#334155' : '#f1f5f9';
    const axisColor = currentTheme === 'dark' ? '#94a3b8' : '#94a3b8';

    switch(id) {
        case 'services_stats':
            return (
                <div key="services_stats" className="md:col-span-2 lg:col-span-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <StatCard 
                            label="Total Plans" 
                            value={data.stats.totalPlans.toLocaleString()} 
                            color="indigo" 
                            source={`PCO Services (${filter})`}
                        />
                        <StatCard 
                            label="People Engaged" 
                            value={data.stats.uniqueVolunteers.toLocaleString()} 
                            color="violet" 
                            source="Planning Center Services"
                            subValue="Total Team Roster"
                        />
                        <StatCard 
                            label="Positions Filled" 
                            value={data.stats.positionsFilled.toLocaleString()} 
                            color="emerald" 
                            source={`PCO Services (${filter})`}
                            subValue="Completed/Confirmed"
                        />
                        <StatCard 
                            label="Openings" 
                            value={data.stats.positionsOpen.toLocaleString()} 
                            color="rose" 
                            source={`PCO Services (${filter})`}
                            subValue="Unfilled/Needed"
                        />
                    </div>
                </div>
            );
        case 'staffing_needs':
            return (
                <div key="staffing_needs" className="col-span-1 lg:col-span-2">
                    <WidgetWrapper title="Staffing Needs (Next 7 Days)" onRemove={() => handleRemoveWidget('staffing_needs')} source="Upcoming Plans">
                        <div className="overflow-y-auto custom-scrollbar max-h-96 pr-2 space-y-4">
                            {needsAttentionPlans.length > 0 ? (
                                needsAttentionPlans.map(plan => {
                                    const displayDate = getPlanDate(plan);
                                    
                                    const pendingMembers = plan.teamMembers?.filter(m => {
                                        const s = m.status?.toLowerCase();
                                        return s === 'unconfirmed' || s === 'u' || s === 'pending' || !s;
                                    }) || [];

                                    const openPositions = plan.neededPositions || [];
                                    const genericOpenCount = plan.positionsNeeded || 0;

                                    return (
                                        <div key={plan.id} className="bg-slate-50 dark:bg-slate-900 rounded-2xl p-4 border border-slate-100 dark:border-slate-800">
                                            <div className="flex justify-between items-start mb-3 pb-2 border-b border-slate-200 dark:border-slate-800">
                                                <div>
                                                    <h5 className="font-black text-xs text-slate-900 dark:text-white">{plan.serviceTypeName}</h5>
                                                    <p className="text-[9px] text-slate-500 dark:text-slate-400 font-medium">
                                                        {displayDate.toLocaleDateString(undefined, {weekday: 'short', month: 'short', day: 'numeric'})} • {displayDate.toLocaleTimeString(undefined, {hour: 'numeric', minute:'2-digit'})}
                                                    </p>
                                                </div>
                                                <span className={`text-[9px] font-black uppercase px-2 py-1 rounded ${
                                                    (plan.positionsNeeded || 0) > 0 
                                                    ? 'text-rose-500 bg-rose-100 dark:bg-rose-900/20' 
                                                    : 'text-amber-500 bg-amber-100 dark:bg-amber-900/20'
                                                }`}>
                                                    {(plan.positionsNeeded || 0) > 0 ? 'Understaffed' : 'Pending'}
                                                </span>
                                            </div>

                                            <div className="grid grid-cols-2 gap-4">
                                                {/* Pending Section */}
                                                <div>
                                                    <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest mb-2">Pending Responses ({pendingMembers.length})</p>
                                                    {pendingMembers.length > 0 ? (
                                                        <div className="space-y-1.5">
                                                            {pendingMembers.map((m, idx) => (
                                                                <div key={idx} className="flex items-center gap-2">
                                                                    <div className="w-5 h-5 rounded-full bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 flex items-center justify-center text-[8px] font-black">
                                                                        ?
                                                                    </div>
                                                                    <div className="min-w-0">
                                                                        <p className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate">{m.name}</p>
                                                                        <p className="text-[8px] text-slate-400 truncate">{m.teamPositionName || m.teamName}</p>
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-[9px] text-slate-400 italic">No pending requests.</p>
                                                    )}
                                                </div>

                                                {/* Open Positions Section */}
                                                <div>
                                                    <p className="text-[9px] font-bold text-rose-500 uppercase tracking-widest mb-2">Open Positions</p>
                                                    {openPositions.length > 0 ? (
                                                        <div className="space-y-1.5">
                                                            {openPositions.map((op, idx) => (
                                                                <div key={idx} className="flex justify-between items-center bg-white dark:bg-slate-800 px-2 py-1 rounded border border-slate-100 dark:border-slate-700">
                                                                    <span className="text-[9px] font-medium text-slate-600 dark:text-slate-400 truncate max-w-[80px]">{op.teamName}</span>
                                                                    <span className="text-[9px] font-black text-rose-500 bg-rose-50 dark:bg-rose-900/20 px-1.5 rounded">{op.quantity}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : genericOpenCount > 0 ? (
                                                        <div className="flex items-center gap-2">
                                                            <div className="w-5 h-5 rounded-full bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 flex items-center justify-center text-[9px] font-black">!</div>
                                                            <p className="text-[10px] font-medium text-slate-600 dark:text-slate-400">{genericOpenCount} Unfilled Slots</p>
                                                        </div>
                                                    ) : (
                                                        <p className="text-[9px] text-emerald-500 font-bold">All positions filled!</p>
                                                    )}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center py-10">
                                    <div className="text-4xl mb-2">🎉</div>
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">All Clear!</p>
                                    <p className="text-[10px] text-slate-400 max-w-[200px]">No pending requests or open positions found for the next 7 days.</p>
                                </div>
                            )}
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'upcoming_plans_list':
            return (
                <div key="upcoming_plans_list" className="col-span-1 lg:col-span-2">
                    <WidgetWrapper 
                        title="Upcoming Plans" 
                        onRemove={() => handleRemoveWidget('upcoming_plans_list')} 
                        source="Future Schedule"
                        headerControl={
                            <select 
                                value={upcomingPlansFilter} 
                                onChange={(e) => setUpcomingPlansFilter(e.target.value as any)}
                                className="bg-slate-100 dark:bg-slate-800 border-none text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 rounded-lg py-1 px-2 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="7 Days">Next 7 Days</option>
                                <option value="14 Days">Next 14 Days</option>
                                <option value="30 Days">Next 30 Days</option>
                            </select>
                        }
                    >
                        <div className="space-y-3 max-h-[500px] overflow-y-auto custom-scrollbar pr-2">
                            {filteredUpcomingPlans.length > 0 ? (
                                filteredUpcomingPlans.map((plan: ServicePlanSnapshot) => {
                                    const displayDate = getPlanDate(plan);
                                    
                                    const membersList = plan.teamMembers || [];
                                    const confirmed = membersList.filter(m => m.status === 'Confirmed').length;
                                    const pending = membersList.filter(m => m.status === 'Pending').length;
                                    const declined = membersList.filter(m => m.status === 'Declined').length;
                                    
                                    // Calculate open positions from neededPositions array if available, otherwise fallback
                                    const neededCount = plan.neededPositions 
                                        ? plan.neededPositions.reduce((sum, p) => sum + p.quantity, 0)
                                        : (plan.positionsNeeded || 0);

                                    const totalCapacity = confirmed + pending + neededCount; // This is an estimate of total slots
                                    const fillPercent = totalCapacity > 0 ? Math.round((confirmed / totalCapacity) * 100) : 0;
                                    
                                    const isExpanded = expandedPlanId === plan.id;

                                    return (
                                        <div 
                                            key={plan.id} 
                                            className={`bg-slate-50 dark:bg-slate-900 rounded-2xl border transition-all duration-200 overflow-hidden ${
                                                isExpanded ? 'border-indigo-500 shadow-md' : 'border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-900'
                                            }`}
                                        >
                                            <div 
                                                onClick={() => setExpandedPlanId(isExpanded ? null : plan.id)}
                                                className="p-4 cursor-pointer flex flex-col gap-4"
                                            >
                                                {/* Header Row */}
                                                <div className="flex items-start justify-between gap-4">
                                                    <div className="flex items-center gap-4">
                                                        {/* Date Box */}
                                                        <div className="flex flex-col items-center justify-center w-12 h-12 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm shrink-0">
                                                            <span className="text-[9px] font-black text-rose-500 uppercase tracking-wider">
                                                                {displayDate.toLocaleDateString(undefined, { month: 'short' })}
                                                            </span>
                                                            <span className="text-lg font-black text-slate-900 dark:text-white leading-none">
                                                                {displayDate.getDate()}
                                                            </span>
                                                        </div>
                                                        
                                                        {/* Info */}
                                                        <div>
                                                            <h5 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                                                                {plan.serviceTypeName || 'Service Plan'}
                                                            </h5>
                                                            <div className="flex flex-wrap gap-2 mt-1">
                                                                <span className="text-[10px] font-medium text-slate-500 dark:text-slate-400 flex items-center gap-1">
                                                                    <span>⏰</span> {displayDate.toLocaleTimeString(undefined, {hour: 'numeric', minute:'2-digit'})}
                                                                </span>
                                                                {plan.seriesTitle && (
                                                                    <span className="text-[9px] font-bold bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 px-1.5 py-0.5 rounded border border-indigo-100 dark:border-indigo-800/50 truncate max-w-[150px]">
                                                                        {plan.seriesTitle}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    {/* Status Badge */}
                                                    <div className="text-right">
                                                        <span className={`text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-widest ${
                                                            neededCount > 0 
                                                            ? 'bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400' 
                                                            : 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                                        }`}>
                                                            {neededCount > 0 ? `${neededCount} Needed` : 'Ready'}
                                                        </span>
                                                    </div>
                                                </div>

                                                {/* Stats Row */}
                                                <div className="flex items-center gap-4 pl-16">
                                                    <div className="flex-1">
                                                        <div className="flex justify-between items-end mb-1">
                                                            <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">Staffing</span>
                                                            <span className="text-[9px] font-black text-slate-600 dark:text-slate-300">{fillPercent}%</span>
                                                        </div>
                                                        <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden flex">
                                                            <div className="h-full bg-emerald-500" style={{ width: `${(confirmed / totalCapacity) * 100}%` }}></div>
                                                            <div className="h-full bg-amber-400" style={{ width: `${(pending / totalCapacity) * 100}%` }}></div>
                                                            <div className="h-full bg-rose-400" style={{ width: `${(declined / totalCapacity) * 100}%` }}></div>
                                                        </div>
                                                    </div>
                                                    <div className="flex gap-3 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {confirmed}</span>
                                                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> {pending}</span>
                                                        <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-rose-400"></span> {declined}</span>
                                                    </div>
                                                </div>
                                            </div>

                                            {/* Expanded Content */}
                                            {isExpanded && (
                                                <div className="bg-white dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 p-4 pl-20 animate-in slide-in-from-top-2 duration-200">
                                                    {plan.neededPositions && plan.neededPositions.length > 0 && (
                                                        <div className="mb-4">
                                                            <p className="text-[9px] font-black uppercase text-rose-500 tracking-widest mb-2">Needs Attention</p>
                                                            <div className="flex flex-wrap gap-2">
                                                                {plan.neededPositions.map((np, i) => (
                                                                    <div key={i} className="flex items-center gap-2 bg-rose-50 dark:bg-rose-900/20 border border-rose-100 dark:border-rose-800 px-2 py-1 rounded text-[10px]">
                                                                        <span className="font-bold text-rose-700 dark:text-rose-300">{np.teamName}</span>
                                                                        <span className="bg-rose-200 dark:bg-rose-800 text-rose-800 dark:text-white px-1.5 rounded font-black">{np.quantity}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    )}
                                                    
                                                    {membersList.length > 0 ? (
                                                        <div>
                                                            <p className="text-[9px] font-black uppercase text-slate-400 tracking-widest mb-2">Team Status</p>
                                                            <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                                                                {membersList.map((m, i) => (
                                                                    <div key={i} className="flex items-center justify-between text-[10px]">
                                                                        <span className="text-slate-600 dark:text-slate-300 truncate">{m.name}</span>
                                                                        <span className={`font-bold ${
                                                                            m.status === 'Confirmed' ? 'text-emerald-500' : 
                                                                            m.status === 'Pending' ? 'text-amber-500' : 
                                                                            'text-rose-500'
                                                                        }`}>{m.status}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        </div>
                                                    ) : (
                                                        <p className="text-xs text-slate-400 italic">No team members assigned.</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    );
                                })
                            ) : (
                                <div className="h-64 flex flex-col items-center justify-center text-center">
                                    <div className="text-3xl mb-3 grayscale opacity-30">📅</div>
                                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500">No upcoming plans found.</p>
                                    <p className="text-[10px] text-slate-400 max-w-[150px] mt-1">
                                        Check your filter or PCO schedule.
                                    </p>
                                </div>
                            )}
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'top_songs':
            return (
                <div key="top_songs" className="col-span-1 lg:col-span-2">
                    <WidgetWrapper title={`Top Songs (${filter})`} onRemove={() => handleRemoveWidget('top_songs')} source="Services Plans">
                         <div className="space-y-3">
                            {data.topSongs.length > 0 ? (
                                data.topSongs.map((song, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                        <div className="flex items-center gap-3 overflow-hidden">
                                            <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs shrink-0">
                                                {i + 1}
                                            </div>
                                            <div className="min-w-0">
                                                <p className="text-xs font-bold text-slate-900 dark:text-white truncate" title={song.title}>{song.title}</p>
                                                <p className="text-[9px] text-slate-400 truncate">{song.author}</p>
                                            </div>
                                        </div>
                                        <div className="text-right shrink-0">
                                            <span className="text-xs font-black text-indigo-600 dark:text-indigo-400">{song.count}</span>
                                            <p className="text-[8px] text-slate-400 uppercase">Times</p>
                                        </div>
                                    </div>
                                ))
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center p-6">
                                    <div className="text-3xl mb-2 grayscale opacity-20">🎵</div>
                                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500">No Songs Scheduled</p>
                                    <p className="text-[10px] text-slate-400 max-w-[150px] mt-1">No songs found in plans for {filter.toLowerCase()}.</p>
                                </div>
                            )}
                         </div>
                    </WidgetWrapper>
                </div>
            );
        case 'team_breakdown':
            const teamChartData = data.teams
                .filter(t => (t.memberIds?.length || 0) > 0 || (t.scheduledMemberIds?.length || 0) > 0)
                .map(t => ({
                    name: t.name.length > 18 ? t.name.slice(0, 18) + '…' : t.name,
                    Roster: t.memberIds?.length || 0,
                    'Serving (Period)': t.scheduledMemberIds?.length || 0,
                }))
                .sort((a, b) => b['Serving (Period)'] - a['Serving (Period)'])
                .slice(0, 12);

            return (
                <div key="team_breakdown" className="col-span-1 lg:col-span-2">
                    <WidgetWrapper title="Team Roster Breakdown" onRemove={() => handleRemoveWidget('team_breakdown')} source="PCO Services Teams">
                        {teamChartData.length > 0 ? (
                            <div className="h-72">
                                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                    <BarChart data={teamChartData} layout="vertical" margin={{ top: 0, right: 20, left: 10, bottom: 0 }}>
                                        <XAxis type="number" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                        <YAxis type="category" dataKey="name" width={110} axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                        <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                                        <Tooltip
                                            contentStyle={TOOLTIP_STYLE}
                                            itemStyle={{ color: '#fff' }}
                                            cursor={{ fill: currentTheme === 'dark' ? '#334155' : '#f8fafc' }}
                                        />
                                        <Legend verticalAlign="top" height={28} iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 'bold', color: axisColor }} />
                                        <Bar dataKey="Roster" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={10} />
                                        <Bar dataKey="Serving (Period)" fill="#10b981" radius={[0, 4, 4, 0]} barSize={10} />
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        ) : (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6">
                                <div className="text-3xl mb-2 grayscale opacity-20">👥</div>
                                <p className="text-xs font-bold text-slate-400 dark:text-slate-500">No Team Data</p>
                                <p className="text-[10px] text-slate-400 mt-1">Sync Services data to populate team rosters.</p>
                            </div>
                        )}
                    </WidgetWrapper>
                </div>
            );
        case 'positions':
            if (!upcoming30DayStats) {
                return (
                    <div key="positions" className="col-span-1 lg:col-span-2">
                        <WidgetWrapper title="Position Breakdown (Next 30 Days)" onRemove={() => handleRemoveWidget('positions')} source="PCO Services Plans">
                            <div className="h-full flex flex-col items-center justify-center text-center p-6">
                                <div className="text-4xl mb-4 grayscale opacity-20">📅</div>
                                <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">No Scheduled Plans</p>
                                <p className="text-xs text-slate-400 mt-2">No service plans found in the next 30 days to analyze.</p>
                            </div>
                        </WidgetWrapper>
                    </div>
                );
            }

            return (
                <div key="positions" className="col-span-1 lg:col-span-2">
                    <WidgetWrapper title="Position Breakdown (Next 30 Days)" onRemove={() => handleRemoveWidget('positions')} source="PCO Services Plans">
                        <div className="grid grid-cols-2 gap-4 h-full items-center">
                            {/* Confirmed */}
                            <div className="bg-emerald-50 dark:bg-emerald-900/20 p-4 rounded-2xl border border-emerald-100 dark:border-emerald-900/30 flex flex-col justify-center items-center text-center">
                                <span className="text-3xl font-black text-emerald-600 dark:text-emerald-400">
                                    {upcoming30DayStats.confirmed}
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-emerald-600/70 dark:text-emerald-400/70 mt-1">Confirmed</span>
                            </div>

                            {/* Pending */}
                            <div className="bg-amber-50 dark:bg-amber-900/20 p-4 rounded-2xl border border-amber-100 dark:border-amber-900/30 flex flex-col justify-center items-center text-center">
                                <span className="text-3xl font-black text-amber-500 dark:text-amber-400">
                                    {upcoming30DayStats.pending}
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500/70 dark:text-amber-400/70 mt-1">Pending</span>
                            </div>

                            {/* Declined */}
                            <div className="bg-rose-50 dark:bg-rose-900/20 p-4 rounded-2xl border border-rose-100 dark:border-rose-900/30 flex flex-col justify-center items-center text-center">
                                <span className="text-3xl font-black text-rose-500 dark:text-rose-400">
                                    {upcoming30DayStats.declined}
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-rose-500/70 dark:text-rose-400/70 mt-1">Declined</span>
                            </div>

                            {/* Still Needed */}
                            <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-2xl border border-slate-200 dark:border-slate-700 flex flex-col justify-center items-center text-center">
                                <span className="text-3xl font-black text-slate-600 dark:text-slate-300">
                                    {upcoming30DayStats.open}
                                </span>
                                <span className="text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 mt-1">Still Needed</span>
                            </div>
                        </div>
                        <div className="mt-4 space-y-2">
                            <div className="flex justify-between text-[10px] font-bold text-slate-500 dark:text-slate-400">
                                <span>Fill Rate</span>
                                <span className="text-slate-700 dark:text-slate-200">{upcoming30DayStats.fillRate}%</span>
                            </div>
                            <div className="h-2 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden flex">
                                <div className="h-full bg-emerald-500 transition-all" style={{ width: `${(upcoming30DayStats.confirmed / (upcoming30DayStats.totalCapacity || 1)) * 100}%` }} />
                                <div className="h-full bg-amber-400 transition-all" style={{ width: `${(upcoming30DayStats.pending / (upcoming30DayStats.totalCapacity || 1)) * 100}%` }} />
                            </div>
                            <p className="text-[10px] text-slate-400 font-medium text-center">
                                Total Capacity: <span className="text-slate-600 dark:text-slate-300 font-bold">{upcoming30DayStats.totalCapacity.toLocaleString()}</span> positions across upcoming plans.
                            </p>
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'checkin_history': {
            // Build chart data — one row per day, with all headcount categories as keys
            const CUSTOM_COLORS = ['#06b6d4','#f97316','#a855f7','#14b8a6','#ec4899','#84cc16'];
            const checkinData = filteredCheckinTrends.map(t => {
                const row: any = {
                    date: t.date,
                    Regulars: t.regulars,
                    Guests: t.guests,
                    Volunteers: t.volunteers,
                    'Digital Check-Ins': (t as any).digitalCheckins || 0,
                };
                ((t as any).customHeadcounts || []).forEach((c: any) => {
                    row[c.name] = (row[c.name] || 0) + c.total;
                });
                return row;
            });

            // Grand totals for footer
            const grandRegulars = filteredCheckinTrends.reduce((s, t) => s + t.regulars, 0);
            const grandGuests = filteredCheckinTrends.reduce((s, t) => s + t.guests, 0);
            const grandVolunteers = filteredCheckinTrends.reduce((s, t) => s + t.volunteers, 0);
            const grandDigital = filteredCheckinTrends.reduce((s, t) => s + ((t as any).digitalCheckins || 0), 0);
            const grandCustom: Record<string,number> = {};
            customHeadcountNames.forEach(name => {
                grandCustom[name] = filteredCheckinTrends.reduce((s, t) => {
                    const hc = ((t as any).customHeadcounts || []).find((c: any) => c.name === name);
                    return s + (hc?.total || 0);
                }, 0);
            });
            const grandTotal = grandRegulars + grandGuests + grandVolunteers + grandDigital + Object.values(grandCustom).reduce((s,v) => s+v, 0);

            return (
                <div key="checkin_history" className="col-span-1 lg:col-span-4">
                    <WidgetWrapper 
                        title="Check-In Headcounts" 
                        onRemove={() => handleRemoveWidget('checkin_history')} 
                        source="PCO Check-Ins"
                        headerControl={
                            <select 
                                value={checkinFilter} 
                                onChange={(e) => setCheckinFilter(e.target.value as CheckinTrendFilter)}
                                className="bg-slate-100 dark:bg-slate-800 border-none text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 rounded-lg py-1 px-2 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="Current Week">Current Week</option>
                                <option value="Last Week">Last Week</option>
                                <option value="Current Month">Current Month</option>
                                <option value="Last Month">Last Month</option>
                                <option value="Current Quarter">Current Quarter</option>
                                <option value="Last Quarter">Last Quarter</option>
                            </select>
                        }
                    >
                        <div className="h-64">
                            {filteredCheckinTrends.length > 0 ? (
                                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                    <BarChart data={checkinData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                        <XAxis dataKey="date" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                        <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                        <Tooltip 
                                            contentStyle={TOOLTIP_STYLE}
                                            itemStyle={{ color: '#fff' }}
                                            cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}}
                                        />
                                        <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{fontSize: '10px', fontWeight: 'bold', color: axisColor}} />
                                        <Bar dataKey="Regulars" stackId="checkins" fill="#6366f1" radius={[0,0,0,0]} barSize={40} />
                                        <Bar dataKey="Guests" stackId="checkins" fill="#f59e0b" radius={[0,0,0,0]} barSize={40} />
                                        <Bar dataKey="Volunteers" stackId="checkins" fill="#10b981" radius={[0,0,0,0]} barSize={40} />
                                        {customHeadcountNames.map((name, i) => (
                                            <Bar key={name} dataKey={name} stackId="checkins" fill={CUSTOM_COLORS[i % CUSTOM_COLORS.length]} radius={[0,0,0,0]} barSize={40} />
                                        ))}
                                        <Bar dataKey="Digital Check-Ins" stackId="checkins" fill="#3b82f6" radius={[4,4,0,0]} barSize={40} />
                                    </BarChart>
                                </ResponsiveContainer>
                            ) : (
                                <div className="h-full flex items-center justify-center text-slate-400 text-xs font-bold">
                                    No check-in data found for {checkinFilter.toLowerCase()}.
                                </div>
                            )}
                        </div>
                        {/* Grand total footer */}
                        {filteredCheckinTrends.length > 0 && (
                            <div className="mt-3 pt-3 border-t border-slate-100 dark:border-slate-700 flex flex-wrap gap-x-4 gap-y-1">
                                <span className="text-[10px] font-black text-slate-500 dark:text-slate-400 uppercase tracking-widest">Period Total:</span>
                                <span className="text-[10px] font-bold text-indigo-500">Regulars: {grandRegulars.toLocaleString()}</span>
                                <span className="text-[10px] font-bold text-amber-500">Guests: {grandGuests.toLocaleString()}</span>
                                <span className="text-[10px] font-bold text-emerald-500">Volunteers: {grandVolunteers.toLocaleString()}</span>
                                {customHeadcountNames.map((name, i) => (
                                    <span key={name} className="text-[10px] font-bold" style={{color: CUSTOM_COLORS[i % CUSTOM_COLORS.length]}}>{name}: {(grandCustom[name] || 0).toLocaleString()}</span>
                                ))}
                                {grandDigital > 0 && <span className="text-[10px] font-bold text-blue-500">Check-Ins: {grandDigital.toLocaleString()}</span>}
                                <span className="text-[10px] font-black text-slate-700 dark:text-slate-200 ml-auto">Total: {grandTotal.toLocaleString()}</span>
                            </div>
                        )}
                    </WidgetWrapper>
                </div>
            );
        }
        case 'events':
            return (
                <div key="events" className="col-span-1 lg:col-span-2">
                    <WidgetWrapper 
                        title="Events" 
                        onRemove={() => handleRemoveWidget('events')} 
                        source="PCO Check-Ins"
                        headerControl={
                            <select 
                                value={checkinFilter} 
                                onChange={(e) => setCheckinFilter(e.target.value as CheckinTrendFilter)}
                                className="bg-slate-100 dark:bg-slate-800 border-none text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 rounded-lg py-1 px-2 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                <option value="Current Week">Current Week</option>
                                <option value="Last Week">Last Week</option>
                                <option value="Current Month">Current Month</option>
                                <option value="Last Month">Last Month</option>
                                <option value="Current Quarter">Current Quarter</option>
                                <option value="Last Quarter">Last Quarter</option>
                            </select>
                        }
                    >
                        <div className="overflow-x-auto max-h-96 custom-scrollbar">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 sticky top-0 z-10">
                                    <tr>
                                        <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">Event Name</th>
                                        <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">Time</th>
                                        <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest text-right text-indigo-600 dark:text-indigo-400">Check-Ins</th>
                                        <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest text-right text-violet-600 dark:text-violet-400">Headcount</th>
                                        <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest text-right">Total</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                    {eventHeadcountsData.length > 0 ? (
                                        eventHeadcountsData.map((evt, idx) => {
                                            const checkinsCount = (evt.guests || 0) + (evt.regulars || 0) + (evt.volunteers || 0);
                                            const displayDate = new Date(evt.startsAt);
                                            const dateStr = displayDate.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
                                            const timeStr = displayDate.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });

                                            return (
                                                <tr key={`${evt.id}_${idx}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                    <td className="p-3">
                                                        <p className="text-xs font-bold text-slate-900 dark:text-white truncate max-w-[150px]">{evt.name}</p>
                                                    </td>
                                                    <td className="p-3">
                                                        <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400">{dateStr} <span className="mx-1">•</span> {timeStr}</p>
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{checkinsCount}</span>
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{evt.headcount}</span>
                                                    </td>
                                                    <td className="p-3 text-right">
                                                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{evt.total}</span>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400 text-xs font-bold">
                                                No events found for {checkinFilter.toLowerCase()}.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'services_teams_list':
            return (
                <div key="services_teams_list" className="col-span-1 md:col-span-2 lg:col-span-4">
                    <WidgetWrapper title="Teams Directory" onRemove={() => handleRemoveWidget('services_teams_list')} source="PCO Services">
                        <div className="overflow-x-auto max-h-[600px] custom-scrollbar">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 sticky top-0 z-10">
                                    <tr>
                                        <th className="p-4 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">Team Name</th>
                                        <th className="p-4 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">Leaders</th>
                                        <th className="p-4 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest text-center">Members</th>
                                        <th className="p-4 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest text-center">Positions / Serving</th>
                                        <th className="p-4 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest text-right">Action</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                    {data.teams.map(team => {
                                        const leaderNames = team.leaderPersonIds
                                            .map(id => getPersonDetails(id)?.name)
                                            .filter(Boolean)
                                            .join(', ');
                                        
                                        // Use Roster count if available (memberIds), otherwise fallback to scheduled count
                                        const totalMembers = team.memberIds?.length || 0;
                                        const activeMembers = team.scheduledMemberIds?.length || 0;

                                        return (
                                            <tr key={team.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                <td className="p-4 font-bold text-slate-900 dark:text-white text-sm">
                                                    {team.name}
                                                </td>
                                                <td className="p-4 text-xs text-slate-600 dark:text-slate-400">
                                                    {leaderNames || <span className="text-slate-300 italic">No Leaders Assigned</span>}
                                                </td>
                                                <td className="p-4 text-center">
                                                    <div className="flex flex-col items-center">
                                                        <span className="inline-flex items-center justify-center bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-3 py-1 rounded-full text-xs font-black">
                                                            {totalMembers > 0 ? totalMembers : activeMembers}
                                                        </span>
                                                        <span className="text-[8px] text-slate-400 mt-1 uppercase tracking-wider font-bold">
                                                            {activeMembers} Active
                                                        </span>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-center">
                                                    {(() => {
                                                        // positionCount = unique named position roles (e.g. "Drummer").
                                                        // Falls back to scheduled member count when teams don't use named positions.
                                                        const posCount = team.positionCount || 0;
                                                        const servingCount = team.scheduledMemberIds?.length || 0;
                                                        const displayCount = posCount > 0 ? posCount : servingCount;
                                                        const label = posCount > 0 ? 'Named Roles' : 'Serving Now';
                                                        return (
                                                            <div className="flex flex-col items-center">
                                                                <span className="inline-flex items-center justify-center bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1 rounded-full text-xs font-black">
                                                                    {displayCount}
                                                                </span>
                                                                <span className="text-[8px] text-slate-400 mt-1 uppercase tracking-wider font-bold">{label}</span>
                                                            </div>
                                                        );
                                                    })()}
                                                </td>
                                                <td className="p-4 text-right">
                                                    <button 
                                                        onClick={() => setSelectedTeamId(team.id)}
                                                        className="text-[10px] font-bold uppercase tracking-widest text-indigo-600 dark:text-indigo-400 hover:underline"
                                                    >
                                                        View Roster
                                                    </button>
                                                </td>
                                            </tr>
                                        );
                                    })}
                                    {data.teams.length === 0 && (
                                        <tr>
                                            <td colSpan={5} className="p-8 text-center text-slate-400 text-xs italic">
                                                No teams found. Try syncing services data.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'team_roster':
            const selectedTeam = selectedTeamId ? data.teams.find(t => t.id === selectedTeamId) : null;
            const rosterMembers = selectedTeam ? selectedTeam.memberIds.map(id => getPersonDetails(id)).filter(Boolean) : [];

            return (
                <div key="team_roster" className="col-span-1 lg:col-span-2">
                    <WidgetWrapper 
                        title={selectedTeam ? `${selectedTeam.name} Roster` : "Team Roster"} 
                        onRemove={() => handleRemoveWidget('team_roster')} 
                        source="Team Members"
                        headerControl={
                            <select 
                                value={selectedTeamId || ''} 
                                onChange={(e) => setSelectedTeamId(e.target.value)}
                                className="bg-slate-100 dark:bg-slate-800 border-none text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 rounded-lg py-1 px-2 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500 max-w-[150px]"
                            >
                                <option value="">Select Team...</option>
                                {data.teams.map(t => (
                                    <option key={t.id} value={t.id}>{t.name}</option>
                                ))}
                            </select>
                        }
                    >
                        <div className="overflow-y-auto max-h-96 custom-scrollbar pr-2 space-y-2">
                            {selectedTeam ? (
                                rosterMembers.length > 0 ? (
                                    rosterMembers.map((p, idx) => (
                                        <div key={idx} onClick={() => setExpandedRosterPersonId(expandedRosterPersonId === p.id ? null : p.id)} className="flex flex-col bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 overflow-hidden cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
                                            <div className="flex items-center justify-between p-3">
                                                <div className="flex items-center gap-3">
                                                    {p?.avatar ? (
                                                        <img src={p.avatar} alt={p.name} className="w-8 h-8 rounded-full object-cover" referrerPolicy="no-referrer" />
                                                    ) : (
                                                        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400">
                                                            {p?.name.charAt(0)}
                                                        </div>
                                                    )}
                                                    <div>
                                                        <p className="text-xs font-bold text-slate-900 dark:text-white">{p?.name}</p>
                                                        <p className="text-[9px] text-slate-400">{p?.email || 'No Email'}</p>
                                                    </div>
                                                </div>
                                                <div className="text-right flex flex-col items-end gap-1">
                                                    {p?.servingStats?.riskLevel === 'High' && (
                                                        <span className="inline-flex items-center gap-1 bg-rose-100 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400 px-2 py-0.5 rounded text-[9px] font-black uppercase tracking-wider">
                                                            🔥 High Risk
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                            {expandedRosterPersonId === p.id && (
                                                <div className="p-3 bg-white dark:bg-slate-800/50 border-t border-slate-200 dark:border-slate-700 animate-in slide-in-from-top-2">
                                                    <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2">Recent Services (Last 90d)</p>
                                                    {p?.servingStats?.recentServices && p.servingStats.recentServices.length > 0 ? (
                                                        <div className="space-y-1.5">
                                                            {p.servingStats.recentServices.map((rs, i) => (
                                                                <div key={i} className="flex justify-between items-center text-[10px] bg-slate-50 dark:bg-slate-800 px-2 py-1.5 rounded-lg border border-slate-100 dark:border-slate-700">
                                                                    <div className="flex items-center gap-2">
                                                                        <span className="font-bold text-indigo-500 dark:text-indigo-400">
                                                                            {new Date(rs.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                                        </span>
                                                                        <span className="text-slate-600 dark:text-slate-300 font-medium">{rs.teamName}</span>
                                                                    </div>
                                                                    <span className="text-slate-400 truncate max-w-[100px]">{rs.serviceTypeName}</span>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    ) : (
                                                        <p className="text-[10px] text-slate-400 italic">No recent services recorded.</p>
                                                    )}
                                                </div>
                                            )}
                                        </div>
                                    ))
                                ) : (
                                    <div className="text-center py-8 text-slate-400 text-xs italic">No members found in this team.</div>
                                )
                            ) : (
                                <div className="text-center py-12 text-slate-400 text-xs font-bold">
                                    Select a team to view roster.
                                </div>
                            )}
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'burnout_watchlist':
            // Filter people with High Risk
            const atRiskVolunteers = people.filter(p => p.servingStats?.riskLevel === 'High');

            return (
                <div key="burnout_watchlist" className="col-span-1 lg:col-span-2">
                    <WidgetWrapper title="Burnout Watchlist" onRemove={() => handleRemoveWidget('burnout_watchlist')} source="Serving Frequency (90 Days)">
                        <div className="overflow-y-auto max-h-96 custom-scrollbar pr-2 space-y-3">
                            {atRiskVolunteers.length > 0 ? (
                                atRiskVolunteers.map((p, idx) => (
                                    <div key={idx} onClick={() => setExpandedBurnoutPersonId(expandedBurnoutPersonId === p.id ? null : p.id)} className="flex flex-col bg-rose-50 dark:bg-rose-900/10 rounded-xl border border-rose-100 dark:border-rose-900/30 overflow-hidden cursor-pointer transition-colors hover:bg-rose-100 dark:hover:bg-rose-900/20">
                                        <div className="flex items-center justify-between p-3">
                                            <div className="flex items-center gap-3">
                                                {p.avatar ? (
                                                    <img src={p.avatar} alt={p.name} className="w-10 h-10 rounded-full object-cover ring-2 ring-rose-200 dark:ring-rose-800" referrerPolicy="no-referrer" />
                                                ) : (
                                                    <div className="w-10 h-10 rounded-full bg-rose-200 dark:bg-rose-800 flex items-center justify-center text-xs font-bold text-rose-600 dark:text-rose-200">
                                                        {p.name.charAt(0)}
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="text-sm font-bold text-slate-900 dark:text-white">{p.name}</p>
                                                    <p className="text-[10px] text-rose-500 font-medium">High Serving Load</p>
                                                </div>
                                            </div>
                                            <div className="text-center bg-white dark:bg-slate-800 px-3 py-1.5 rounded-lg shadow-sm">
                                                <span className="block text-lg font-black text-rose-600 dark:text-rose-400 leading-none">
                                                    {p.servingStats?.last90DaysCount || 0}
                                                </span>
                                                <span className="text-[8px] font-bold text-slate-400 uppercase tracking-wider">Services (90d)</span>
                                            </div>
                                        </div>
                                        {expandedBurnoutPersonId === p.id && (
                                            <div className="p-3 bg-white dark:bg-slate-800/50 border-t border-rose-100 dark:border-rose-900/30 animate-in slide-in-from-top-2">
                                                <p className="text-[10px] font-black uppercase text-rose-400 tracking-widest mb-2">Recent Services (Last 90d)</p>
                                                {p?.servingStats?.recentServices && p.servingStats.recentServices.length > 0 ? (
                                                    <div className="space-y-1.5">
                                                        {p.servingStats.recentServices.map((rs, i) => (
                                                            <div key={i} className="flex justify-between items-center text-[10px] bg-rose-50/50 dark:bg-rose-900/20 px-2 py-1.5 rounded-lg border border-rose-100/50 dark:border-rose-800/50">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-bold text-rose-600 dark:text-rose-400">
                                                                        {new Date(rs.date).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                                                                    </span>
                                                                    <span className="text-slate-600 dark:text-slate-300 font-medium">{rs.teamName}</span>
                                                                </div>
                                                                <span className="text-slate-500 dark:text-slate-400 truncate max-w-[100px]">{rs.serviceTypeName}</span>
                                                            </div>
                                                        ))}
                                                    </div>
                                                ) : (
                                                    <p className="text-[10px] text-slate-400 italic">No recent services recorded.</p>
                                                )}
                                            </div>
                                        )}
                                    </div>
                                ))
                            ) : (
                                <div className="h-full flex flex-col items-center justify-center text-center py-10">
                                    <div className="text-4xl mb-2">💚</div>
                                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Healthy Roster!</p>
                                    <p className="text-[10px] text-slate-400 max-w-[200px]">No volunteers flagged for high burnout risk based on recent serving frequency.</p>
                                </div>
                            )}
                        </div>
                    </WidgetWrapper>
                </div>
            );
        default: return null;
    }
  }

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white">Services Analytics</h3>
          <p className="text-slate-400 dark:text-slate-500 font-medium uppercase text-[10px] tracking-widest mt-1">Plan, Schedule, & Worship Insights</p>
        </div>
        
        <div className="flex gap-4 items-center">
            {pcoConnected && activeTab === 'Overview' && (
                <button 
                    onClick={handleServiceSync}
                    disabled={isServicesSyncing || isSyncing}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-50"
                >
                    <span className={isServicesSyncing ? 'animate-spin' : ''}>↻</span>
                    <span>{isServicesSyncing ? 'Syncing...' : 'Service Sync'}</span>
                </button>
            )}

            {pcoConnected && activeTab === 'Attendance' && (
                <button 
                    onClick={handleCheckInsSync}
                    disabled={isCheckInsSyncing || isSyncing}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 font-black text-[10px] uppercase tracking-widest hover:bg-emerald-100 dark:hover:bg-emerald-900/30 transition-colors disabled:opacity-50"
                >
                    <span className={isCheckInsSyncing ? 'animate-spin' : ''}>↻</span>
                    <span>{isCheckInsSyncing ? 'Syncing...' : 'Check-ins Sync'}</span>
                </button>
            )}

            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
                <button onClick={() => setActiveTab('Overview')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'Overview' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Overview</button>
                <button onClick={() => setActiveTab('Attendance')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'Attendance' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-300' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Attendance</button>
                <button onClick={() => setActiveTab('Teams')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'Teams' ? 'bg-white dark:bg-slate-700 shadow-sm text-amber-600 dark:text-amber-300' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Teams</button>
            </div>

            <div className="flex items-center bg-white dark:bg-slate-800 p-1.5 rounded-xl border border-slate-200 dark:border-slate-700">
                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest pl-2 pr-2">Period</span>
                <select 
                    value={filter} 
                    onChange={(e) => onFilterChange(e.target.value as ServicesFilter)}
                    className="bg-transparent text-xs font-bold text-indigo-600 dark:text-indigo-400 outline-none cursor-pointer pr-2"
                >
                    <option value="Week">Past Week</option>
                    <option value="Month">Past Month</option>
                    <option value="Quarter">Past Quarter</option>
                    <option value="Year">Past Year</option>
                    <option value="Next Week">Next Week</option>
                    <option value="Next Month">Next Month</option>
                </select>
            </div>
            <WidgetsController 
                availableWidgets={availableWidgets} 
                visibleWidgets={safeVisibleWidgets} 
                onUpdate={onUpdateWidgets} 
                onUpdateTheme={onUpdateTheme}
                currentTheme={currentTheme}
            />
        </div>
      </header>

      {isLoading ? (
          <div className="h-96 flex items-center justify-center">
              <div className="text-center">
                  <div className="text-4xl mb-4 animate-bounce">🎹</div>
                  <p className="text-slate-400 font-bold text-sm uppercase tracking-widest">Analyzing Plans...</p>
              </div>
          </div>
      ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
            {safeVisibleWidgets.map((id, index) => {
                let spanClass = "col-span-1";
                if (['services_stats', 'checkin_history', 'teams', 'services_teams_list'].includes(id)) spanClass = "col-span-1 md:col-span-2 lg:col-span-4";
                else if (['staffing_needs', 'upcoming_plans_list', 'top_songs', 'positions', 'events', 'team_roster', 'burnout_watchlist'].includes(id)) spanClass = "col-span-1 lg:col-span-2";
                
                return (
                    <div
                        key={id}
                        className={`${spanClass} cursor-grab active:cursor-grabbing transition-opacity`}
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragEnter={(e) => handleDragEnter(e, index)}
                        onDragEnd={handleDragEnd}
                        onDragOver={handleDragOver}
                    >
                        {renderWidget(id)}
                    </div>
                );
            })}
            {safeVisibleWidgets.length === 0 && (
              <div className="col-span-full py-20 text-center bg-slate-50 dark:bg-slate-900 rounded-[3rem] border border-dashed border-slate-200 dark:border-slate-700">
                  <p className="text-slate-400 dark:text-slate-500 font-bold">No widgets configured for {activeTab}.</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Use the "Customize Layout" button to add widgets.</p>
              </div>
            )}
          </div>
      )}
    </div>
  );
};

export default ServicesView;
