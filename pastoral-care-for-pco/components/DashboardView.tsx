
import React, { useCallback, useMemo, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import { 
    User, PeopleDashboardData, GivingAnalytics, GroupsDashboardData, 
    ServicesDashboardData, AttendanceData, CensusStats, BudgetRecord, 
    PcoFund, DetailedDonation, ChurchRiskSettings, GroupRiskSettings,
    ServicesTeam, RiskChangeRecord, StatusChangeRecord
} from '../types';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';
import WidgetsController from './WidgetsController';
import { DASHBOARD_WIDGETS } from '../constants/widgetRegistry';
import { WidgetWrapper, StatCard, EYEBROW, Eyebrow, Meta } from './SharedUI';
import { RiskDistributionWidget } from './RiskWidgets';
import { calculateChurchRisk, DEFAULT_CHURCH_RISK_SETTINGS, calculateAggregateGroupHealth } from '../services/riskService';
import { PastorAIView } from './PastorAIView';
import { ServicesTimelineWidget } from './ServicesTimelineWidget';
import { OnboardingTaskWidget } from './widgets/OnboardingTaskWidget';

interface DashboardViewProps {
  user: User;
  peopleData: PeopleDashboardData | null;
  givingAnalytics: GivingAnalytics | null;
  groupsData: GroupsDashboardData | null;
  servicesData: ServicesDashboardData | null;
  attendanceData: AttendanceData[];
  censusData: CensusStats | null;
  visibleWidgets: string[];
  onUpdateWidgets: (widgets: string[]) => void;
  budgets: BudgetRecord[];
  funds: PcoFund[];
  donations: DetailedDonation[];
  teams: ServicesTeam[];
  recentRiskChanges?: RiskChangeRecord[];
  recentStatusChanges?: StatusChangeRecord[];
  pcoConnected: boolean;
  onConnectPco: () => void;
  allowedWidgetIds?: string[];
  globalInsights: string;
  isGeneratingInsights: boolean;
  onUpdateTheme: (theme: 'traditional' | 'dark') => void;
  churchRiskSettings?: ChurchRiskSettings;
  groupRiskSettings?: GroupRiskSettings;
  onGenerateInsights: () => void;
  // AI Assistant props
  churchName: string;
  /** Pre-computed count of unique people active in the last 60 days (gave, served, checked-in, or attended a group). */
  activePeopleCount?: number;
  /** When false (Starter plan), the Pastor AI panel and toggle are completely hidden. */
  isPastorAIEnabled?: boolean;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#10b981'];
const TOOLTIP_STYLE = {
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#1e293b',
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
};

export const DashboardView: React.FC<DashboardViewProps> = ({ activePeopleCount, 
  user,
  peopleData,
  givingAnalytics,
  groupsData,
  servicesData,
  attendanceData,
  censusData,
  visibleWidgets,
  onUpdateWidgets,
  budgets,
  funds,
  donations,
  teams,
  recentRiskChanges,
  recentStatusChanges,
  pcoConnected,
  onConnectPco,
  allowedWidgetIds,
  globalInsights,
  isGeneratingInsights,
  onUpdateTheme,
  churchRiskSettings,
  groupRiskSettings,
  onGenerateInsights,
  churchName,
  isPastorAIEnabled = true,
}) => {

  const [showAI, setShowAI] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('dashboard_showAI');
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });

  const toggleShowAI = useCallback(() => {
    setShowAI(v => {
      const next = !v;
      try { localStorage.setItem('dashboard_showAI', String(next)); } catch {}
      return next;
    });
  }, []);

  const availableWidgets = useMemo(() => {
    if (!allowedWidgetIds) return DASHBOARD_WIDGETS;
    return DASHBOARD_WIDGETS.filter(w => allowedWidgetIds.includes(`dashboard:${w.id}`));
  }, [allowedWidgetIds]);

  const safeVisibleWidgets = visibleWidgets.filter(id => 
    !allowedWidgetIds || allowedWidgetIds.includes(`dashboard:${id}`)
  );

  const handleRemoveWidget = (id: string) => {
    onUpdateWidgets(visibleWidgets.filter(w => w !== id));
  };

  // --- Drag-and-Drop reordering ---
  const dragItem = useRef<string | null>(null);
  const dragOverItem = useRef<string | null>(null);

  const handleDragStart = (e: React.DragEvent<HTMLDivElement>, id: string) => {
    dragItem.current = id;
    e.currentTarget.style.opacity = '0.5';
  };

  const handleDragEnter = (_e: React.DragEvent<HTMLDivElement>, id: string) => {
    dragOverItem.current = id;
  };

  const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.style.opacity = '1';
    if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
      const copy = [...safeVisibleWidgets];
      const dragIndex = copy.indexOf(dragItem.current);
      const hoverIndex = copy.indexOf(dragOverItem.current);
      if (dragIndex !== -1 && hoverIndex !== -1) {
        const dragged = copy[dragIndex];
        copy.splice(dragIndex, 1);
        copy.splice(hoverIndex, 0, dragged);
        onUpdateWidgets(copy);
      }
    }
    dragItem.current = null;
    dragOverItem.current = null;
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const churchHealth = useMemo(() => {
      return calculateChurchRisk(
          churchRiskSettings || DEFAULT_CHURCH_RISK_SETTINGS,
          peopleData,
          givingAnalytics,
          groupsData,
          servicesData,
          attendanceData,
          budgets
      );
  }, [churchRiskSettings, peopleData, givingAnalytics, groupsData, servicesData, attendanceData, budgets]);

  const groupHealth = useMemo(() => {
      return calculateAggregateGroupHealth(
          groupsData?.allGroups || [],
          peopleData?.allPeople || [],
          groupRiskSettings
      );
  }, [groupRiskSettings, groupsData?.allGroups, peopleData?.allPeople]);

  const fixedWidgetsConfig = ['people_stats', 'services_timeline'];
  const activeFixedWidgets = safeVisibleWidgets.filter(w => fixedWidgetsConfig.includes(w));
  const safeVisibleDraggableWidgets = safeVisibleWidgets.filter(w => !fixedWidgetsConfig.includes(w));

  const renderWidget = (id: string) => {
      const currentTheme = user.theme;
      const gridColor = currentTheme === 'dark' ? '#334155' : '#f1f5f9';
      const axisColor = currentTheme === 'dark' ? '#94a3b8' : '#94a3b8';

      const tooltipStyle = {
          borderRadius: '12px',
          border: currentTheme === 'dark' ? '1px solid #475569' : '1px solid #e2e8f0',
          backgroundColor: currentTheme === 'dark' ? '#1e293b' : '#ffffff',
          color: currentTheme === 'dark' ? '#f1f5f9' : '#0f172a',
          boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)'
      };

      const tooltipItemStyle = {
          color: currentTheme === 'dark' ? '#f1f5f9' : '#0f172a'
      };

      const tooltipLabelStyle = {
          color: currentTheme === 'dark' ? '#94a3b8' : '#475569',
          fontWeight: 'bold'
      };

      switch(id) {
          case 'onboarding_tasks':
              return <OnboardingTaskWidget key={id} onRemove={() => handleRemoveWidget(id)} />;
          case 'ai_insights':
              return (
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-indigo-100 dark:border-slate-700 shadow-sm h-full flex flex-col justify-between group relative overflow-hidden">
                      <button onClick={() => handleRemoveWidget(id)} className="absolute top-6 right-6 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 z-10">✕</button>
                      
                      {/* Decorative Background - Subtle */}
                      <div className="absolute -right-10 -top-10 w-64 h-64 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-full blur-3xl pointer-events-none"></div>
                      <div className="absolute -left-10 -bottom-10 w-40 h-40 bg-violet-50/50 dark:bg-violet-900/10 rounded-full blur-2xl pointer-events-none"></div>

                      <div className="relative z-10">
                          <div className="flex items-center gap-3 mb-6">
                              <div className="w-10 h-10 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl flex items-center justify-center text-xl">✨</div>
                              <div>
                                  <h3 className="font-black text-lg tracking-tight text-slate-900 dark:text-white">Executive Briefing</h3>
                                  <p className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400">AI Analysis</p>
                              </div>
                          </div>

                          {globalInsights ? (
                               <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                                   <ReactMarkdown>{globalInsights}</ReactMarkdown>
                               </div>
                           ) : (
                              <div className="py-8 text-center">
                                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4">Generate a strategic analysis of your current metrics.</p>
                                  <button 
                                      onClick={onGenerateInsights}
                                      disabled={isGeneratingInsights}
                                      className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-lg shadow-indigo-200 dark:shadow-none hover:bg-indigo-700 transition-all disabled:opacity-50"
                                  >
                                      {isGeneratingInsights ? 'Analyzing...' : 'Generate Insights'}
                                  </button>
                              </div>
                          )}
                      </div>
                      
                      {globalInsights && (
                          <div className="relative z-10 mt-6 pt-6 border-t border-slate-100 dark:border-slate-700 flex justify-between items-center">
                              <Meta>Generated just now</Meta>
                              <button onClick={onGenerateInsights} disabled={isGeneratingInsights} className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors flex items-center gap-2">
                                  <span>↻</span> Refresh
                              </button>
                          </div>
                      )}
                  </div>
              );
          case 'censusHero':
              if (!censusData) return null;
              return (
                  <div className="bg-slate-900 text-white p-8 rounded-[2.5rem] border border-slate-800 shadow-xl relative overflow-hidden h-full flex flex-col justify-between group">
                      <button onClick={() => handleRemoveWidget(id)} className="absolute top-6 right-6 text-slate-500 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 z-20">✕</button>
                      <div className="relative z-10">
                          <div className="flex items-center gap-3 mb-6">
                              <span className="text-3xl">🏛️</span>
                              <div>
                                  <div className="flex items-center gap-2">
                                      <h3 className="text-xl font-black">{churchName || censusData.locationName}</h3>
                                  </div>
                                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Primary Ministry Context</p>
                              </div>
                          </div>
                          <div className="grid grid-cols-2 gap-8">
                              <div>
                                  <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">Population</p>
                                  <p className="text-3xl font-black tabular-nums">{censusData.totalPopulation.toLocaleString()}</p>
                              </div>
                              <div>
                                  <p className="text-[11px] font-bold uppercase text-slate-400 tracking-wider mb-1.5">Median Income</p>
                                  <p className="text-3xl font-black text-emerald-400 tabular-nums">${censusData.economics?.medianHouseholdIncome?.toLocaleString() || 'N/A'}</p>
                              </div>
                          </div>
                      </div>
                      {/* Decorative */}
                      <div className="absolute -right-10 -top-10 w-64 h-64 bg-white/5 rounded-full blur-3xl pointer-events-none"></div>
                  </div>
              );
          case 'people_stats':
              return peopleData ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-full">
                      <StatCard label="Total People" value={peopleData.stats.total.toLocaleString()} color="indigo" source="PCO" />
                      <StatCard label="New (30d)" value={peopleData.stats.newThisMonth.toLocaleString()} color="emerald" source="PCO" />
                      <StatCard label="Members" value={peopleData.stats.members.toLocaleString()} color="violet" source="PCO" />
                      <StatCard
                          label="Active People"
                          value={activePeopleCount != null ? activePeopleCount.toLocaleString() : '—'}
                          color="amber"
                          source="60 days"
                          subValue="Gave · Served · Checked In · Attended a Group"
                      />
                  </div>
              ) : null;
          case 'keyMetrics':
              return givingAnalytics ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 h-full">
                      <StatCard label="Total Giving" value={`$${givingAnalytics.totalGiving.toLocaleString()}`} color="emerald" source="PCO" />
                      <StatCard label="Donors" value={givingAnalytics.contributingPeople.toLocaleString()} color="indigo" source="PCO" />
                      <StatCard label="Recurring" value={givingAnalytics.recurringGivers.toLocaleString()} color="cyan" source="PCO" />
                      <StatCard label="Avg Gift" value={`$${Math.round(givingAnalytics.averageGift).toLocaleString()}`} color="violet" source="PCO" />
                  </div>
              ) : null;
          case 'groups_stats':
              return groupsData ? (
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm h-full flex flex-col">
                      <div className="flex justify-between items-center mb-6">
                          <h4 className={EYEBROW}>Groups Health</h4>
                          <button onClick={() => handleRemoveWidget(id)} aria-label="Remove widget" className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors">✕</button>
                      </div>

                      <div className="flex flex-col items-center justify-center flex-1 mb-6">
                          <div className={`w-32 h-32 rounded-full border-[8px] flex items-center justify-center mb-4 ${
                              groupHealth.color === 'emerald' ? 'border-emerald-100 text-emerald-600 dark:border-emerald-900/30 dark:text-emerald-400' : 
                              groupHealth.color === 'amber' ? 'border-amber-100 text-amber-500 dark:border-amber-900/30 dark:text-amber-400' : 
                              groupHealth.color === 'slate' ? 'border-slate-100 text-slate-500 dark:border-slate-700 dark:text-slate-400' :
                              'border-rose-100 text-rose-500 dark:border-rose-900/30 dark:text-rose-400'
                          }`}>
                              <span className="text-4xl font-black">{groupHealth.score}</span>
                          </div>
                          <p className={`text-sm font-black uppercase tracking-widest ${
                              groupHealth.color === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 
                              groupHealth.color === 'amber' ? 'text-amber-500 dark:text-amber-400' : 
                              groupHealth.color === 'slate' ? 'text-slate-500 dark:text-slate-400' :
                              'text-rose-500 dark:text-rose-400'
                          }`}>
                              {groupHealth.category}
                          </p>
                      </div>

                      <div className="space-y-2">
                          {groupHealth.factors.map(f => (
                              <div key={f.name} className="flex justify-between items-center text-xs">
                                  <span className="font-semibold text-slate-500 dark:text-slate-400">{f.name}</span>
                                  <span className={`font-black uppercase ${
                                      f.status === 'good' ? 'text-emerald-500 dark:text-emerald-400' : 
                                      f.status === 'warning' ? 'text-amber-500 dark:text-amber-400' : 'text-rose-500 dark:text-rose-400'
                                  }`}>
                                      {f.label}
                                  </span>
                              </div>
                          ))}
                      </div>
                  </div>
              ) : null;
          case 'services_stats':
              return servicesData ? (
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm h-full flex flex-col">
                      <div className="flex justify-between items-center mb-6">
                          <h4 className={EYEBROW}>Services</h4>
                          <button onClick={() => handleRemoveWidget(id)} aria-label="Remove widget" className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors">✕</button>
                      </div>
                      
                      <div className="flex-1 flex items-center justify-center">
                          <div className="text-center">
                              <p className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter tabular-nums">{servicesData.stats.uniqueVolunteers}</p>
                              <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-2">Active Volunteers</p>
                          </div>
                      </div>
                      
                      <div className="mt-6 pt-6 border-t border-slate-50 dark:border-slate-800 grid grid-cols-2 gap-4">
                          <div>
                              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 tabular-nums">{servicesData.stats.positionsFilled}</p>
                              <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Filled</p>
                          </div>
                          <div className="text-right">
                              <p className="text-xl font-black text-rose-500 dark:text-rose-400 tabular-nums">{servicesData.stats.positionsOpen}</p>
                              <p className="text-[11px] font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wide">Openings</p>
                          </div>
                      </div>
                  </div>
              ) : null;
          case 'churchRisk':
              return (
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm h-full flex flex-col">
                      <div className="flex justify-between items-center mb-6">
                          <h4 className={EYEBROW}>Church Health</h4>
                          <button onClick={() => handleRemoveWidget(id)} aria-label="Remove widget" className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors">✕</button>
                      </div>

                      <div className="flex flex-col items-center justify-center flex-1 mb-6">
                          <div className={`w-32 h-32 rounded-full border-[8px] flex items-center justify-center mb-4 ${
                              churchHealth.color === 'emerald' ? 'border-emerald-100 text-emerald-600 dark:border-emerald-900/30 dark:text-emerald-400' : 
                              churchHealth.color === 'amber' ? 'border-amber-100 text-amber-500 dark:border-amber-900/30 dark:text-amber-400' : 'border-rose-100 text-rose-500 dark:border-rose-900/30 dark:text-rose-400'
                          }`}>
                              <span className="text-4xl font-black">{churchHealth.score}</span>
                          </div>
                          <p className={`text-sm font-black uppercase tracking-widest ${
                              churchHealth.color === 'emerald' ? 'text-emerald-600 dark:text-emerald-400' : 
                              churchHealth.color === 'amber' ? 'text-amber-500 dark:text-amber-400' : 'text-rose-500 dark:text-rose-400'
                          }`}>
                              {churchHealth.category}
                          </p>
                      </div>

                      <div className="space-y-2">
                          {churchHealth.factors.map(f => (
                              <div key={f.name} className="flex justify-between items-center text-xs">
                                  <span className="font-semibold text-slate-500 dark:text-slate-400">{f.name}</span>
                                  <span className={`font-black uppercase ${
                                      f.status === 'good' ? 'text-emerald-500 dark:text-emerald-400' : 
                                      f.status === 'warning' ? 'text-amber-500 dark:text-amber-400' : 'text-rose-500 dark:text-rose-400'
                                  }`}>
                                      {f.label}
                                  </span>
                              </div>
                          ))}
                      </div>
                  </div>
              );
          
          case 'last_week_stats': {
              const now = new Date();
              const todayIso = now.toISOString();
              
              const lastWeekDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
              const lastWeekIso = lastWeekDate.toISOString();
              
              const twoWeeksAgoDate = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
              const twoWeeksAgoIso = twoWeeksAgoDate.toISOString();

              const getStats = () => {
                  let profiles1 = 0, profiles2 = 0;
                  if (peopleData?.allPeople) {
                      peopleData.allPeople.forEach(p => {
                          const date = p.createdAt;
                          if (date >= lastWeekIso && date <= todayIso) profiles1++;
                          else if (date >= twoWeeksAgoIso && date < lastWeekIso) profiles2++;
                      });
                  }

                  let giving1 = 0, giving2 = 0;
                  const donors1 = new Set<string>();
                  const donors2 = new Set<string>();
                  if (donations) {
                      donations.forEach(d => {
                          const date = new Date(d.date).toISOString();
                          if (date >= lastWeekIso && date <= todayIso) {
                              giving1 += d.amount;
                              donors1.add(d.donorId);
                          } else if (date >= twoWeeksAgoIso && date < lastWeekIso) {
                              giving2 += d.amount;
                              donors2.add(d.donorId);
                          }
                      });
                  }

                  let headcount1 = 0, headcount2 = 0;
                  if (attendanceData) {
                      attendanceData.forEach(a => {
                          const isoStr = a.date.includes('T') ? a.date : new Date(a.date).toISOString();
                          if (isoStr >= lastWeekIso && isoStr <= todayIso) headcount1 += (a as any).attendance || (a as any).count || 0;
                          else if (isoStr >= twoWeeksAgoIso && isoStr < lastWeekIso) headcount2 += (a as any).attendance || (a as any).count || 0;
                      });
                  }

                  let groupAtt1 = 0, groupAtt2 = 0;
                  if (groupsData?.allGroups) {
                      groupsData.allGroups.forEach(g => {
                          g.attendanceHistory?.forEach(h => {
                              const isoStr = h.date.includes('T') ? h.date : new Date(h.date).toISOString();
                              if (isoStr >= lastWeekIso && isoStr <= todayIso) groupAtt1 += h.count;
                              else if (isoStr >= twoWeeksAgoIso && isoStr < lastWeekIso) groupAtt2 += h.count;
                          });
                      });
                  }

                  return {
                      profiles: { lw: profiles1, prev: profiles2 },
                      giving: { lw: giving1, prev: giving2 },
                      headcount: { lw: headcount1, prev: headcount2 },
                      groupAtt: { lw: groupAtt1, prev: groupAtt2 },
                      donors: { lw: donors1.size, prev: donors2.size }
                  };
              };

              const stats = getStats();

              const renderRow = (label: string, lw: number = 0, prev: number = 0, isCurrency = false) => {
                  const diff = lw - prev;
                  const absDiff = Math.abs(diff);
                  const isUp = diff >= 0;
                  const colorClass = isUp ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400' : 'text-rose-500 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400';
                  
                  const formatVal = (val: number) => isCurrency ? `$${Math.round(val).toLocaleString()}` : val.toLocaleString();

                  return (
                      <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 last:pb-0">
                          <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{label}</span>
                          <div className="flex items-center gap-4">
                              <span className="text-xl font-black text-slate-900 dark:text-white">{formatVal(lw)}</span>
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-black ${colorClass} w-20 justify-center`}>
                                  <span>{isUp ? '▲' : '▼'}</span>
                                  <span>{formatVal(absDiff)}</span>
                              </div>
                          </div>
                      </div>
                  );
              };

              return (
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm h-full flex flex-col">
                      <div className="flex justify-between items-center mb-6">
                          <div>
                              <h4 className={EYEBROW}>Last Week Stats</h4>
                              <p className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider mt-1">Vs Previous Week</p>
                          </div>
                          <button onClick={() => handleRemoveWidget(id)} aria-label="Remove widget" className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors">✕</button>
                      </div>

                      <div className="flex-1 flex flex-col justify-center">
                          {renderRow('New Profiles', stats.profiles.lw, stats.profiles.prev)}
                          {renderRow('Total Giving', stats.giving.lw, stats.giving.prev, true)}
                          {renderRow('Headcount', stats.headcount.lw, stats.headcount.prev)}
                          {renderRow('Group Attendance', stats.groupAtt.lw, stats.groupAtt.prev)}
                          {renderRow('Number of Donors', stats.donors.lw, stats.donors.prev)}
                      </div>
                  </div>
              );
          }
          
          case 'church_progress': {
              const groupsStats = groupsData?.progressStats;
              const givingStats = givingAnalytics?.progressStats;
              const servicesStats = servicesData?.progressStats;
              
              const renderRow = (label: string, thisMonth: number = 0, lastMonth: number = 0) => {
                  const diff = thisMonth - lastMonth;
                  const absDiff = Math.abs(diff);
                  const isUp = diff >= 0;
                  const colorClass = isUp ? 'text-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400' : 'text-rose-500 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400';
                  
                  return (
                      <div className="flex items-center justify-between py-3 border-b border-slate-100 dark:border-slate-800 last:border-0 last:pb-0">
                          <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{label}</span>
                          <div className="flex items-center gap-4">
                              <span className="text-xl font-black text-slate-900 dark:text-white">{thisMonth.toLocaleString()}</span>
                              <div className={`flex items-center gap-1 px-2 py-1 rounded-lg text-xs font-black ${colorClass} w-16 justify-center`}>
                                  <span>{isUp ? '▲' : '▼'}</span>
                                  <span>{absDiff.toLocaleString()}</span>
                              </div>
                          </div>
                      </div>
                  );
              };

              return (
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm h-full flex flex-col">
                      <div className="flex justify-between items-center mb-6">
                          <div>
                              <h4 className={EYEBROW}>Church Progress</h4>
                              <p className="text-[11px] font-semibold text-indigo-400 uppercase tracking-wider mt-1">Last 30 Days</p>
                          </div>
                          <button onClick={() => handleRemoveWidget(id)} aria-label="Remove widget" className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors">✕</button>
                      </div>

                      <div className="flex-1 flex flex-col justify-center">
                          {renderRow('Group Attendance', groupsStats?.thisMonth, groupsStats?.lastMonth)}
                          {renderRow('Donors', givingStats?.thisMonth, givingStats?.lastMonth)}
                          {renderRow('Volunteers', servicesStats?.thisMonth, servicesStats?.lastMonth)}
                      </div>
                  </div>
              );
          }
          
          case 'people_engagement': {
              const ENGAGEMENT_COLORS: Record<string, string> = {
                  'Healthy': '#10b981', 'At Risk': '#f59e0b', 'Disconnected': '#f43f5e', 'Unknown': '#94a3b8'
              };
              const engagementChartData = (peopleData?.engagementData || []).filter(d => d.value > 0);
              return peopleData ? (
                  <WidgetWrapper title="Risk Profiles" onRemove={() => handleRemoveWidget(id)} source="Risk Profile Analysis">
                      <div className="h-64">
                          {engagementChartData.length > 0 ? (
                              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                  <PieChart>
                                      <Pie
                                          data={engagementChartData}
                                          innerRadius={60}
                                          outerRadius={80}
                                          paddingAngle={5}
                                          dataKey="value"
                                      >
                                          {engagementChartData.map((entry, index) => (
                                              <Cell key={index} fill={ENGAGEMENT_COLORS[entry.name] || COLORS[index % COLORS.length]} />
                                          ))}
                                      </Pie>
                                      <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                                      <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{fontSize: '10px', fontWeight: 'bold', color: axisColor}} />
                                  </PieChart>
                              </ResponsiveContainer>
                          ) : (
                              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 gap-2">
                                  <span className="text-3xl grayscale opacity-30">📊</span>
                                  <p className="text-xs font-bold">No risk profile data available.</p>
                              </div>
                          )}
                      </div>
                  </WidgetWrapper>
              ) : null;
          }

          case 'gender':
              return peopleData ? (
                  <WidgetWrapper title="Church - Gender Distribution" onRemove={() => handleRemoveWidget(id)} source="People">
                      <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <PieChart>
                                  <Pie 
                                    data={peopleData.genderData} 
                                    innerRadius={55} 
                                    outerRadius={75} 
                                    paddingAngle={5} 
                                    dataKey="value"
                                  >
                                      {peopleData.genderData.map((entry, index) => <Cell key={index} fill={COLORS[index % COLORS.length]} />)}
                                  </Pie>
                                  <Tooltip contentStyle={tooltipStyle} itemStyle={tooltipItemStyle} labelStyle={tooltipLabelStyle} />
                                  <Legend verticalAlign="bottom" align="center" iconType="circle" wrapperStyle={{fontSize: '10px', fontWeight: 'bold', color: axisColor, paddingTop: '8px'}} />
                              </PieChart>
                          </ResponsiveContainer>
                      </div>
                  </WidgetWrapper>
              ) : null;

          case 'age':
              return peopleData ? (
                  <WidgetWrapper title="Church - Age Demographics" onRemove={() => handleRemoveWidget(id)} source="People">
                      <div className="h-52">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <BarChart data={peopleData.ageData} margin={{ top: 20, right: 0, left: 0, bottom: 0 }}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                  <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{fontSize: 9, fill: axisColor}} />
                                  <Tooltip 
                                      contentStyle={tooltipStyle} 
                                      itemStyle={tooltipItemStyle}
                                      labelStyle={tooltipLabelStyle}
                                      cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}}
                                  />
                                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 9, fill: axisColor, fontWeight: 'bold' }} />
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </WidgetWrapper>
              ) : null;


          case 'services_timeline':
              return (
                  <ServicesTimelineWidget
                      servicesData={servicesData}
                      donations={donations}
                      onRemove={() => handleRemoveWidget(id)}
                  />
              );


          default:
              return null;
      }
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 animate-in fade-in duration-500 items-start">

      {/* COLUMNS 1–3 (or 1–4 when AI hidden) — Widgets */}
      <div className={`${showAI && isPastorAIEnabled ? 'col-span-1 xl:col-span-3' : 'col-span-1 xl:col-span-4'} space-y-10`}>
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h3 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white">Dashboard</h3>
            <Eyebrow className="block mt-1.5">Executive Overview</Eyebrow>
          </div>
          <div className="flex items-center gap-4">
              {!pcoConnected && (
                  <button 
                      onClick={onConnectPco}
                      className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2.5 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-amber-200 dark:shadow-amber-900/20"
                  >
                      Connect Planning Center
                  </button>
              )}
              {isPastorAIEnabled && (
              <button
                  onClick={toggleShowAI}
                  title={showAI ? 'Hide AI Assistant' : 'Show AI Assistant'}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[10px] font-black uppercase tracking-widest transition-all border shadow-sm ${
                      showAI
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-200 dark:shadow-none'
                          : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:text-indigo-600'
                  }`}
              >
                  <span>🤖</span>
                  <span>{showAI ? 'Hide AI' : 'Show AI'}</span>
              </button>
              )}
              <WidgetsController 
                  availableWidgets={availableWidgets} 
                  visibleWidgets={safeVisibleWidgets} 
                  onUpdate={onUpdateWidgets} 
                  onUpdateTheme={onUpdateTheme}
                  currentTheme={user.theme}
              />
          </div>
        </header>

        <div className="flex flex-col lg:flex-row gap-6 items-start">
            {/* Fixed Column */}
            {activeFixedWidgets.length > 0 && (
                <div className="w-full lg:w-1/3 flex flex-col gap-6">
                    {activeFixedWidgets.map(id => (
                        <div key={id} className="w-full">
                            {renderWidget(id)}
                        </div>
                    ))}
                </div>
            )}

            {/* Draggable Grid */}
            <div className={`w-full ${activeFixedWidgets.length > 0 ? 'lg:w-2/3' : ''} grid grid-cols-1 md:grid-cols-2 gap-6 grid-flow-row-dense content-start`}>
                {safeVisibleDraggableWidgets.map((id) => {
                    return (
                        <div
                            key={id}
                            className="break-inside-avoid cursor-grab active:cursor-grabbing transition-opacity w-full inline-block"
                            draggable
                            onDragStart={(e) => handleDragStart(e, id)}
                            onDragEnter={(e) => handleDragEnter(e, id)}
                            onDragEnd={handleDragEnd}
                            onDragOver={handleDragOver}
                        >
                            {renderWidget(id)}
                        </div>
                    );
                })}
                {safeVisibleWidgets.length === 0 && (
                    <div className="col-span-1 md:col-span-2 py-20 text-center bg-slate-50 dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700 break-inside-avoid w-full inline-block">
                        <p className="text-slate-400 dark:text-slate-500 font-bold">Dashboard is empty.</p>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Use the "Customize Layout" button to add widgets.</p>
                    </div>
                )}
            </div>
        </div>
      </div>

      {/* COLUMN 4 — AI Assistant (sticky, toggleable) */}
      {showAI && isPastorAIEnabled && (
        <div className="col-span-1 xl:sticky xl:top-0 h-[600px] xl:h-[calc(100vh-140px)]">
          <PastorAIView
              peopleData={peopleData}
              givingAnalytics={givingAnalytics}
              groupsData={groupsData}
              servicesData={servicesData}
              attendanceData={attendanceData}
              censusData={censusData}
              churchName={churchName}
              donations={donations}
              funds={funds}
              budgets={budgets}
              teams={teams}
              recentRiskChanges={recentRiskChanges}
              recentStatusChanges={recentStatusChanges}
          />
        </div>
      )}

    </div>
  );
};
