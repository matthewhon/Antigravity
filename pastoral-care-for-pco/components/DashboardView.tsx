
import React, { useMemo, useRef, useState } from 'react';
import { 
    User, PeopleDashboardData, GivingAnalytics, GroupsDashboardData, 
    ServicesDashboardData, AttendanceData, CensusStats, BudgetRecord, 
    PcoFund, DetailedDonation, ChurchRiskSettings 
} from '../types';
import { 
    AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    BarChart, Bar, Cell, PieChart, Pie, Legend
} from 'recharts';
import WidgetsController from './WidgetsController';
import { DASHBOARD_WIDGETS } from '../constants/widgetRegistry';
import { WidgetWrapper, StatCard } from './SharedUI';
import { RiskDistributionWidget } from './RiskWidgets';
import { calculateChurchRisk, DEFAULT_CHURCH_RISK_SETTINGS } from '../services/riskService';
import { PastorAIView } from './PastorAIView';

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
  pcoConnected: boolean;
  onConnectPco: () => void;
  allowedWidgetIds?: string[];
  globalInsights: string;
  isGeneratingInsights: boolean;
  onUpdateTheme: (theme: 'traditional' | 'dark') => void;
  churchRiskSettings?: ChurchRiskSettings;
  onGenerateInsights: () => void;
  // AI Assistant props
  churchName: string;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#10b981'];
const TOOLTIP_STYLE = {
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#1e293b',
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
};

export const DashboardView: React.FC<DashboardViewProps> = ({ 
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
  pcoConnected,
  onConnectPco,
  allowedWidgetIds,
  globalInsights,
  isGeneratingInsights,
  onUpdateTheme,
  churchRiskSettings,
  onGenerateInsights,
  churchName,
}) => {

  const [showAI, setShowAI] = useState(true);

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

  const renderWidget = (id: string) => {
      const currentTheme = user.theme;
      const gridColor = currentTheme === 'dark' ? '#334155' : '#f1f5f9';
      const axisColor = currentTheme === 'dark' ? '#94a3b8' : '#94a3b8';

      switch(id) {
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
                                  <p className="text-[10px] font-bold uppercase tracking-widest text-indigo-500 dark:text-indigo-400">AI Analysis</p>
                              </div>
                          </div>

                          {globalInsights ? (
                              <div className="prose prose-sm prose-slate dark:prose-invert max-w-none">
                                  <div dangerouslySetInnerHTML={{ __html: globalInsights.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
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
                              <span className="text-[10px] text-slate-400 dark:text-slate-500">Generated just now</span>
                              <button onClick={onGenerateInsights} disabled={isGeneratingInsights} className="text-[10px] font-black uppercase tracking-widest text-indigo-500 dark:text-indigo-400 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors flex items-center gap-2">
                                  <span>↻</span> Refresh
                              </button>
                          </div>
                      )}
                  </div>
              );
          case 'people_stats':
              return peopleData ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                      <StatCard label="Total People" value={peopleData.stats.total.toLocaleString()} color="indigo" source="PCO" />
                      <StatCard label="New (30d)" value={peopleData.stats.newThisMonth.toLocaleString()} color="emerald" source="PCO" />
                      <StatCard label="Members" value={peopleData.stats.members.toLocaleString()} color="violet" source="PCO" />
                      <StatCard label="Visitors" value={peopleData.stats.nonMembers.toLocaleString()} color="amber" source="PCO" />
                  </div>
              ) : null;
          case 'keyMetrics':
              return givingAnalytics ? (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 h-full">
                      <StatCard label="Total Giving" value={`$${givingAnalytics.totalGiving.toLocaleString()}`} color="emerald" source="PCO" />
                      <StatCard label="Donors" value={givingAnalytics.contributingPeople.toLocaleString()} color="indigo" source="PCO" />
                      <StatCard label="Recurring" value={givingAnalytics.recurringGivers.toLocaleString()} color="cyan" source="PCO" />
                      <StatCard label="Avg Gift" value={`$${Math.round(givingAnalytics.averageGift).toLocaleString()}`} color="violet" source="PCO" />
                  </div>
              ) : null;
          case 'groups_stats':
              return groupsData ? (
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm h-full flex flex-col justify-between">
                        <div className="flex justify-between items-center mb-6">
                            <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Groups Health</h4>
                            <button onClick={() => handleRemoveWidget(id)} className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors">✕</button>
                        </div>
                        
                        <div className="grid grid-cols-2 gap-8 mb-8">
                            <div>
                                <p className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{groupsData.stats.totalGroups}</p>
                                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Active Groups</p>
                            </div>
                            <div className="text-right">
                                <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter">{groupsData.stats.totalEnrollment}</p>
                                <p className="text-[10px] font-bold text-indigo-300 dark:text-indigo-700 uppercase tracking-widest mt-1">Enrolled</p>
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between items-end mb-3">
                                <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Participation Rate</span>
                                <span className="text-3xl font-black text-slate-900 dark:text-white">
                                    {Math.round((groupsData.stats.averageAttendance / (groupsData.stats.totalEnrollment || 1)) * 100)}%
                                </span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-6 overflow-hidden border border-slate-200 dark:border-slate-600">
                                <div 
                                    className="bg-indigo-500 h-full rounded-full transition-all duration-1000 ease-out shadow-sm" 
                                    style={{width: `${Math.min(100, (groupsData.stats.averageAttendance / (groupsData.stats.totalEnrollment || 1)) * 100)}%`}}
                                ></div>
                            </div>
                        </div>
                  </div>
              ) : null;
          case 'services_stats':
              return servicesData ? (
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm h-full flex flex-col">
                      <div className="flex justify-between items-center mb-6">
                          <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Services</h4>
                          <button onClick={() => handleRemoveWidget(id)} className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors">✕</button>
                      </div>
                      
                      <div className="flex-1 flex items-center justify-center">
                          <div className="text-center">
                              <p className="text-5xl font-black text-slate-900 dark:text-white tracking-tighter">{servicesData.stats.uniqueVolunteers}</p>
                              <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-2">Active Volunteers</p>
                          </div>
                      </div>
                      
                      <div className="mt-6 pt-6 border-t border-slate-50 dark:border-slate-800 grid grid-cols-2 gap-4">
                          <div>
                              <p className="text-xl font-black text-emerald-600 dark:text-emerald-400">{servicesData.stats.positionsFilled}</p>
                              <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Filled</p>
                          </div>
                          <div className="text-right">
                              <p className="text-xl font-black text-rose-500 dark:text-rose-400">{servicesData.stats.positionsOpen}</p>
                              <p className="text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase">Openings</p>
                          </div>
                      </div>
                  </div>
              ) : null;
          case 'churchRisk':
              return (
                  <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm h-full flex flex-col">
                      <div className="flex justify-between items-center mb-6">
                          <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Church Health</h4>
                          <button onClick={() => handleRemoveWidget(id)} className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors">✕</button>
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
                              <div key={f.name} className="flex justify-between items-center text-[10px]">
                                  <span className="font-bold text-slate-500 dark:text-slate-400">{f.name}</span>
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
          
          case 'people_engagement': {
              const ENGAGEMENT_COLORS: Record<string, string> = {
                  'Core': '#6366f1', 'Regular': '#8b5cf6', 'Sporadic': '#f43f5e', 'Inactive': '#94a3b8'
              };
              const engagementChartData = (peopleData?.engagementData || []).filter(d => d.value > 0);
              return peopleData ? (
                  <WidgetWrapper title="Engagement" onRemove={() => handleRemoveWidget(id)} source="Check-in Activity">
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
                                      <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} />
                                      <Legend verticalAlign="middle" align="right" layout="vertical" iconType="circle" wrapperStyle={{fontSize: '10px', fontWeight: 'bold', color: axisColor}} />
                                  </PieChart>
                              </ResponsiveContainer>
                          ) : (
                              <div className="h-full flex flex-col items-center justify-center text-center text-slate-400 gap-2">
                                  <span className="text-3xl grayscale opacity-30">📊</span>
                                  <p className="text-xs font-bold">No check-in data available.</p>
                                  <p className="text-[10px]">Sync check-in records to populate this widget.</p>
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
                                  <Tooltip contentStyle={TOOLTIP_STYLE} />
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
                                      contentStyle={TOOLTIP_STYLE} 
                                      cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}}
                                  />
                                  <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} label={{ position: 'top', fontSize: 9, fill: axisColor, fontWeight: 'bold' }} />
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </WidgetWrapper>
              ) : null;

          case 'trends':
              return givingAnalytics ? (
                  <WidgetWrapper title="Giving Trends" onRemove={() => handleRemoveWidget(id)} source="Giving">
                      <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                              <BarChart data={givingAnalytics.trends}>
                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                  <XAxis 
                                    dataKey="date" 
                                    axisLine={false} 
                                    tickLine={false} 
                                    tick={{fontSize: 10, fill: axisColor}}
                                    tickFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
                                  />
                                  <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                  <Tooltip 
                                    contentStyle={TOOLTIP_STYLE} 
                                    labelFormatter={(val) => new Date(val).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}
                                    formatter={(value: number) => `$${value.toLocaleString()}`}
                                    cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}}
                                  />
                                  <Bar dataKey="amount" fill="#10b981" radius={[4, 4, 0, 0]} />
                              </BarChart>
                          </ResponsiveContainer>
                      </div>
                  </WidgetWrapper>
              ) : null;

          default:
              return null;
      }
  };

  return (
    <div className="grid grid-cols-4 gap-8 animate-in fade-in duration-500 items-start">

      {/* COLUMNS 1–3 (or 1–4 when AI hidden) — Widgets */}
      <div className={`${showAI ? 'col-span-3' : 'col-span-4'} space-y-10`}>
        <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div>
            <h3 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white">Dashboard</h3>
            <p className="text-slate-400 dark:text-slate-500 font-medium uppercase text-[10px] tracking-widest mt-1">Executive Overview</p>
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
              <button
                  onClick={() => setShowAI(v => !v)}
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
              <WidgetsController 
                  availableWidgets={availableWidgets} 
                  visibleWidgets={safeVisibleWidgets} 
                  onUpdate={onUpdateWidgets} 
                  onUpdateTheme={onUpdateTheme}
                  currentTheme={user.theme}
              />
          </div>
        </header>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {safeVisibleWidgets.map((id, index) => {
                let spanClass = "col-span-1";
                if (['people_stats', 'keyMetrics', 'ai_insights'].includes(id)) {
                    spanClass = "col-span-1 md:col-span-2 lg:col-span-2";
                }
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
                <div className="col-span-full py-20 text-center bg-slate-50 dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-700">
                    <p className="text-slate-400 dark:text-slate-500 font-bold">Dashboard is empty.</p>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Use the "Customize Layout" button to add widgets.</p>
                </div>
            )}
        </div>
      </div>

      {/* COLUMN 4 — AI Assistant (sticky, toggleable) */}
      {showAI && (
        <div className="col-span-1 sticky top-0" style={{ height: 'calc(100vh - 140px)' }}>
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
          />
        </div>
      )}

    </div>
  );
};
