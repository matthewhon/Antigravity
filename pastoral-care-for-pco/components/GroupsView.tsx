
import React, { useMemo, useState, useRef } from 'react';
import { GroupsDashboardData, GlobalStats, PeopleDashboardData, PcoPerson, GroupRiskSettings } from '../types';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import WidgetsController from './WidgetsController';
import { GROUPS_WIDGETS } from '../constants/widgetRegistry';
import { WidgetWrapper, StatCard } from './SharedUI';
import { generateGroupsStrategy, generateGroupRiskAnalysis } from '../services/geminiService';
import { calculateGroupHealth, DEFAULT_GROUP_RISK_SETTINGS } from '../services/riskService';

interface GroupsViewProps {
  data: GroupsDashboardData;
  pcoConnected: boolean;
  visibleWidgets: string[];
  onUpdateWidgets: (widgets: string[]) => void;
  allowedWidgetIds?: string[];
  onSync?: () => void;
  onSyncGroups?: () => void;
  isSyncing?: boolean;
  onUpdateTheme?: (theme: 'traditional' | 'dark') => void;
  currentTheme?: 'traditional' | 'dark';
  globalStats?: GlobalStats | null;
  peopleData?: PeopleDashboardData | null;
  groupRiskSettings?: GroupRiskSettings;
}

type EventAttendanceFilterType = 'This Week' | 'Last Week' | 'This Month' | 'Last Month' | 'Last Quarter';
type GroupInfoFilterType = 'Current Month' | 'Last Month' | 'Last Quarter';

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#10b981'];
const GENDER_COLORS: Record<string, string> = {
  'Male': '#6366f1',
  'Female': '#ec4899',
  'Unknown': '#94a3b8'
};

const TOOLTIP_STYLE = {
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#1e293b',
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
};

const GroupsView: React.FC<GroupsViewProps> = ({ 
  data, 
  pcoConnected, 
  visibleWidgets,
  onUpdateWidgets,
  allowedWidgetIds,
  onSync,
  onSyncGroups,
  isSyncing,
  onUpdateTheme,
  currentTheme,
  globalStats,
  peopleData,
  groupRiskSettings
}) => {
  const [eventAttendanceFilter, setEventAttendanceFilter] = useState<EventAttendanceFilterType>('Last Month');
  const [groupInfoFilter, setGroupInfoFilter] = useState<GroupInfoFilterType>('Last Month');
  
  // AI State
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [strategyReport, setStrategyReport] = useState('');
  
  // Risk AI State
  const [isAnalyzingRisk, setIsAnalyzingRisk] = useState(false);
  const [riskReport, setRiskReport] = useState('');

  const availableWidgets = useMemo(() => {
    if (!allowedWidgetIds) return GROUPS_WIDGETS;
    return GROUPS_WIDGETS.filter(w => allowedWidgetIds.includes(`groups:${w.id}`));
  }, [allowedWidgetIds]);

  const safeVisibleWidgets = visibleWidgets.filter(id => 
    !allowedWidgetIds || allowedWidgetIds.includes(`groups:${id}`)
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

  const getPersonDetails = (id: string) => {
      return peopleData?.allPeople.find(p => p.id === id);
  };

  const handleGenerateStrategy = async () => {
      if (!data) return;
      setIsAnalyzing(true);
      try {
          const report = await generateGroupsStrategy(data, peopleData || null);
          setStrategyReport(report);
      } catch (e) {
          console.error(e);
          setStrategyReport("Failed to generate strategy.");
      } finally {
          setIsAnalyzing(false);
      }
  };

  // Pre-calculate Group Health for all groups
  const enrichedGroups = useMemo(() => {
      if (!data?.allGroups) return [];
      
      const peopleMap = new Map<string, PcoPerson>();
      if (peopleData?.allPeople) {
          peopleData.allPeople.forEach(p => peopleMap.set(p.id, p));
      }

      return data.allGroups.map(g => {
          const health = calculateGroupHealth(
              g, 
              groupRiskSettings || DEFAULT_GROUP_RISK_SETTINGS, 
              peopleMap
          );
          return { ...g, health };
      });
  }, [data?.allGroups, peopleData, groupRiskSettings]);

  const handleGenerateRiskAnalysis = async () => {
      if (!enrichedGroups.length) return;
      setIsAnalyzingRisk(true);
      try {
          const report = await generateGroupRiskAnalysis(enrichedGroups, groupRiskSettings || DEFAULT_GROUP_RISK_SETTINGS);
          setRiskReport(report);
      } catch (e) {
          console.error(e);
          setRiskReport("Failed to analyze risks.");
      } finally {
          setIsAnalyzingRisk(false);
      }
  };

  const eventAttendanceData = useMemo(() => {
      if (!data?.allGroups) return [];
      
      const now = new Date();
      let start = new Date();
      let end = new Date();
      start.setHours(0,0,0,0);
      end.setHours(23,59,59,999);

      if (eventAttendanceFilter === 'This Week') {
          const day = start.getDay();
          start.setDate(start.getDate() - day);
      } else if (eventAttendanceFilter === 'Last Week') {
          start.setDate(start.getDate() - start.getDay() - 7);
          end = new Date(start);
          end.setDate(start.getDate() + 6);
          end.setHours(23,59,59,999);
      } else if (eventAttendanceFilter === 'This Month') {
          start.setDate(1);
      } else if (eventAttendanceFilter === 'Last Month') {
          start.setDate(1);
          start.setMonth(start.getMonth() - 1);
          end = new Date(start);
          end.setMonth(end.getMonth() + 1);
          end.setDate(0);
          end.setHours(23,59,59,999);
      } else if (eventAttendanceFilter === 'Last Quarter') {
          start.setDate(start.getDate() - 90);
      }

      const aggMap = new Map<string, { date: string, timestamp: number, members: number, visitors: number }>();

      data.allGroups.forEach(g => {
          if (!g.attendanceHistory) return;
          
          g.attendanceHistory.forEach(h => {
              const hDate = new Date(h.date);
              if (hDate >= start && hDate <= end) {
                  // Use stable ISO date grouping (YYYY-MM-DD) to prevent timezone locale shifts
                  const year = hDate.getFullYear();
                  const month = String(hDate.getMonth() + 1).padStart(2, '0');
                  const day = String(hDate.getDate()).padStart(2, '0');
                  const dateKey = `${year}-${month}-${day}`;
                  
                  if (!aggMap.has(dateKey)) {
                      aggMap.set(dateKey, { date: dateKey, timestamp: hDate.getTime(), members: 0, visitors: 0 });
                  }
                  const entry = aggMap.get(dateKey)!;
                  entry.members += (h.members || 0);
                  entry.visitors += (h.visitors || 0);
              }
          });
      });

      return Array.from(aggMap.values())
          .sort((a,b) => a.timestamp - b.timestamp)
          .map(d => {
              // Convert stored YYYY-MM-DD to a JS Date for formatting
              const [y, m, day] = d.date.split('-').map(Number);
              const dateObj = new Date(y, m - 1, day);
              
              return {
                  name: dateObj.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
                  Members: d.members,
                  Visitors: d.visitors,
                  Total: d.members + d.visitors
              };
          });
  }, [data.allGroups, eventAttendanceFilter]);

  // Gender Demographics Calculation
  const groupsGenderData = useMemo(() => {
      if (!peopleData || !data?.allGroups) return [];

      const activeGroupMemberIds = new Set<string>();
      data.allGroups.forEach(g => {
          // Collect all unique member IDs from active groups
          if (!g.archivedAt && g.memberIds) {
              g.memberIds.forEach(mid => activeGroupMemberIds.add(mid));
          }
      });

      let male = 0;
      let female = 0;

      peopleData.allPeople.forEach(p => {
          if (activeGroupMemberIds.has(p.id)) {
              const g = p.gender?.toLowerCase();
              if (g === 'm' || g === 'male') male++;
              else if (g === 'f' || g === 'female') female++;
          }
      });

      return [
          { name: 'Male', value: male },
          { name: 'Female', value: female }
      ].filter(d => d.value > 0);
  }, [peopleData, data.allGroups]);

  // New Calculation for Age Demographics
  const groupsAgeData = useMemo(() => {
      if (!peopleData || !data?.allGroups) return [];

      // 1. Build a Set of all active group members from the Groups Data
      // This ensures we are analyzing the people actually counted in the Groups Dashboard
      const activeGroupMemberIds = new Set<string>();
      data.allGroups.forEach(g => {
          // Only count active groups? Usually yes for current demographics.
          if (!g.archivedAt && g.memberIds) {
              g.memberIds.forEach(mid => activeGroupMemberIds.add(mid));
          }
      });

      const currentYear = new Date().getFullYear();
      
      const buckets = ['0-18', '19-30', '31-50', '51-70', '70+'];
      
      const counts = {
          church: { total: 0, buckets: {} as Record<string, number> },
          inGroup: { total: 0, buckets: {} as Record<string, number> }
      };

      // Initialize buckets
      buckets.forEach(b => {
          counts.church.buckets[b] = 0;
          counts.inGroup.buckets[b] = 0;
      });

      peopleData.allPeople.forEach(p => {
          if (!p.birthdate) return;
          
          const birthYear = parseInt(p.birthdate.split('-')[0]);
          const age = currentYear - birthYear;
          let bucket = '';

          if (age <= 18) bucket = '0-18';
          else if (age <= 30) bucket = '19-30';
          else if (age <= 50) bucket = '31-50';
          else if (age <= 70) bucket = '51-70';
          else bucket = '70+';

          // 1. Church Totals
          counts.church.buckets[bucket]++;
          counts.church.total++;

          // 2. Group Member Totals
          if (activeGroupMemberIds.has(p.id)) {
              counts.inGroup.buckets[bucket]++;
              counts.inGroup.total++;
          }
      });

      // Convert to Percentages for Chart
      return buckets.map(range => ({
          range,
          "Church": counts.church.total > 0 ? (counts.church.buckets[range] / counts.church.total) * 100 : 0,
          "Group Members": counts.inGroup.total > 0 ? (counts.inGroup.buckets[range] / counts.inGroup.total) * 100 : 0,
      }));
  }, [peopleData, data.allGroups]);

  const renderBenchmarkPlaceholder = (title: string, removeId: string) => (
      <div className="col-span-1">
          <WidgetWrapper title={title} onRemove={() => handleRemoveWidget(removeId)} source="Benchmarks">
              <div className="h-full flex flex-col items-center justify-center text-center p-6 space-y-4">
                  <div className="text-4xl grayscale opacity-30">⚖️</div>
                  <p className="text-xs font-bold text-slate-400 dark:text-slate-500">Benchmark Data Unavailable</p>
                  <p className="text-[10px] text-slate-400 max-w-xs">Enable data sharing in Settings {'>'} Organization to unlock aggregated community benchmarks.</p>
              </div>
          </WidgetWrapper>
      </div>
  );

  if (!pcoConnected) {
    return (
      <div className="bg-white dark:bg-slate-850 rounded-[5rem] p-48 text-center border-4 border-dashed border-slate-100 dark:border-slate-800 animate-in zoom-in">
        <div className="text-[140px] mb-14 grayscale opacity-20 drop-shadow-2xl">📂</div>
        <h3 className="text-5xl font-black text-slate-900 dark:text-white mb-8 tracking-tighter uppercase">Connection Required</h3>
        <p className="text-slate-400 max-w-lg mx-auto font-medium text-2xl leading-relaxed">
          Connect Planning Center to unlock Groups analytics and engagement metrics.
        </p>
      </div>
    );
  }

  const renderWidget = (id: string) => {
      const gridColor = currentTheme === 'dark' ? '#334155' : '#f1f5f9';
      const axisColor = currentTheme === 'dark' ? '#94a3b8' : '#94a3b8';

      switch(id) {
          case 'groups_risk_agent':
              return (
                  <div key="groups_risk_agent" className="col-span-1 lg:col-span-2">
                      <div className="bg-gradient-to-br from-violet-50 to-fuchsia-50 dark:from-violet-900/20 dark:to-fuchsia-900/20 p-8 rounded-[2.5rem] border border-violet-100 dark:border-violet-900/30 shadow-sm relative overflow-hidden h-full flex flex-col">
                          <button onClick={() => handleRemoveWidget(id)} className="absolute top-6 right-6 text-violet-300 dark:text-violet-400 hover:text-violet-500 dark:hover:text-violet-300 transition-colors z-20">✕</button>
                          
                          <div className="flex justify-between items-start mb-6">
                              <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 bg-violet-600 rounded-2xl flex items-center justify-center text-2xl text-white shadow-lg shadow-violet-200 dark:shadow-violet-900/50">
                                      🩺
                                  </div>
                                  <div>
                                      <h3 className="text-lg font-black text-violet-900 dark:text-violet-300 tracking-tight">Risk Consultant</h3>
                                      <p className="text-[10px] font-bold text-violet-500 dark:text-violet-400 uppercase tracking-widest">Health Diagnostic & Triage</p>
                                  </div>
                              </div>
                          </div>

                          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                              {riskReport ? (
                                  <div className="prose prose-sm prose-violet dark:prose-invert max-w-none bg-white/60 dark:bg-slate-800/60 p-4 rounded-xl shadow-inner border border-white/50 dark:border-slate-700">
                                      <div dangerouslySetInnerHTML={{ __html: riskReport.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                  </div>
                              ) : (
                                  <div className="flex flex-col items-center justify-center h-48 text-center p-4">
                                      <p className="text-sm font-bold text-violet-800 dark:text-violet-300 mb-2">Identify systemic risks in your Small Groups.</p>
                                      <p className="text-xs text-violet-600 dark:text-violet-400 mb-6 max-w-md">
                                          This consultant analyzes scores across Attendance, Retention, Leadership Span, and Engagement to pinpoint why groups are struggling.
                                      </p>
                                      <button 
                                          onClick={handleGenerateRiskAnalysis}
                                          disabled={isAnalyzingRisk}
                                          className="bg-violet-600 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-violet-700 transition-all disabled:opacity-50 flex items-center gap-2"
                                      >
                                          {isAnalyzingRisk ? (
                                              <>
                                                  <span className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin"></span>
                                                  <span>Diagnosing...</span>
                                              </>
                                          ) : (
                                              <>
                                                  <span>🔍</span>
                                                  <span>Run Diagnostics</span>
                                              </>
                                          )}
                                      </button>
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>
              );
          case 'groups_ai_agent':
              return (
                  <div key="groups_ai_agent" className="col-span-1 lg:col-span-2">
                      <div className="bg-gradient-to-r from-orange-50 to-amber-50 dark:from-orange-900/20 dark:to-amber-900/20 p-8 rounded-[2.5rem] border border-orange-100 dark:border-orange-900/30 shadow-sm relative overflow-hidden h-full flex flex-col">
                          <button onClick={() => handleRemoveWidget(id)} className="absolute top-6 right-6 text-orange-300 dark:text-orange-400 hover:text-orange-500 dark:hover:text-orange-300 transition-colors z-20">✕</button>
                          
                          <div className="flex justify-between items-start mb-6">
                              <div className="flex items-center gap-4">
                                  <div className="w-12 h-12 bg-orange-500 rounded-2xl flex items-center justify-center text-2xl text-white shadow-lg shadow-orange-200 dark:shadow-orange-900/50">
                                      🚀
                                  </div>
                                  <div>
                                      <h3 className="text-lg font-black text-orange-900 dark:text-orange-300 tracking-tight">Activate Agent</h3>
                                      <p className="text-[10px] font-bold text-orange-500 dark:text-orange-400 uppercase tracking-widest">Strategies for 100% Participation</p>
                                  </div>
                              </div>
                          </div>

                          <div className="flex-1 overflow-y-auto custom-scrollbar pr-2 space-y-4">
                              {strategyReport ? (
                                  <div className="prose prose-sm prose-orange dark:prose-invert max-w-none bg-white/60 dark:bg-slate-800/60 p-4 rounded-xl shadow-inner border border-white/50 dark:border-slate-700">
                                      <div dangerouslySetInnerHTML={{ __html: strategyReport.replace(/\n/g, '<br/>').replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>') }} />
                                  </div>
                              ) : (
                                  <div className="flex flex-col items-center justify-center h-48 text-center p-4">
                                      <p className="text-sm font-bold text-orange-800 dark:text-orange-300 mb-2">Analyze your Groups Health using "Activate" Principles.</p>
                                      <p className="text-xs text-orange-600 dark:text-orange-400 mb-6 max-w-md">
                                          This agent analyzes participation rates, group types, and attendance to provide a customized strategy for moving toward 100% engagement.
                                      </p>
                                      <button 
                                          onClick={handleGenerateStrategy}
                                          disabled={isAnalyzing}
                                          className="bg-orange-600 text-white px-6 py-3 rounded-xl font-black text-xs uppercase tracking-widest shadow-xl hover:bg-orange-700 transition-all disabled:opacity-50 flex items-center gap-2"
                                      >
                                          {isAnalyzing ? (
                                              <>
                                                  <span className="w-3 h-3 border-2 border-white/50 border-t-white rounded-full animate-spin"></span>
                                                  <span>Analyzing Data...</span>
                                              </>
                                          ) : (
                                              <>
                                                  <span>🔍</span>
                                                  <span>Generate Strategy</span>
                                              </>
                                          )}
                                      </button>
                                  </div>
                              )}
                          </div>
                      </div>
                  </div>
              );
          case 'groups_age_demographics':
              return (
                  <div key="groups_age_demographics" className="col-span-1 lg:col-span-2">
                      <WidgetWrapper title="Groups Age Demographics" onRemove={() => handleRemoveWidget(id)} source="People & Groups">
                          <div className="h-64 w-full">
                              {peopleData ? (
                                  <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                      <BarChart data={groupsAgeData} barGap={0}>
                                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} strokeOpacity={0.2} />
                                          <XAxis 
                                              dataKey="range" 
                                              axisLine={false} 
                                              tickLine={false} 
                                              tick={{fontSize: 10, fill: axisColor}} 
                                          />
                                          <YAxis 
                                              axisLine={false} 
                                              tickLine={false} 
                                              tick={{fontSize: 10, fill: axisColor}}
                                              tickFormatter={(val) => `${Math.round(val)}%`}
                                          />
                                          <Tooltip 
                                              cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}}
                                              contentStyle={TOOLTIP_STYLE}
                                              itemStyle={{ color: '#fff' }}
                                              formatter={(val: number) => [`${val.toFixed(1)}%`]}
                                          />
                                          <Legend iconType="circle" wrapperStyle={{fontSize: '10px', fontWeight: 'bold', paddingTop: '10px', color: axisColor}} />
                                          <Bar dataKey="Church" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                                          <Bar dataKey="Group Members" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                      </BarChart>
                                  </ResponsiveContainer>
                              ) : (
                                  <div className="h-full flex items-center justify-center text-slate-400 text-xs">
                                      People data required for demographics.
                                  </div>
                              )}
                          </div>
                      </WidgetWrapper>
                  </div>
              );
          case 'groups_health':
              return data ? (
                  <div key="groups_health" className="col-span-1 lg:col-span-2">
                      <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm h-full flex flex-col justify-between relative">
                            <div className="flex justify-between items-center mb-6">
                                <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">Groups Health</h4>
                                <button onClick={() => handleRemoveWidget(id)} className="absolute top-6 right-6 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors z-20">✕</button>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-8 mb-8">
                                <div>
                                    <p className="text-4xl font-black text-slate-900 dark:text-white tracking-tighter">{data.stats.totalGroups}</p>
                                    <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">Active Groups</p>
                                </div>
                                <div className="text-right">
                                    <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400 tracking-tighter">{data.stats.totalEnrollment}</p>
                                    <p className="text-[10px] font-bold text-indigo-300 dark:text-indigo-700 uppercase tracking-widest mt-1">Enrolled</p>
                                </div>
                            </div>

                            <div>
                                <div className="flex justify-between items-end mb-3">
                                    <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Participation Rate</span>
                                    <span className="text-3xl font-black text-slate-900 dark:text-white">
                                        {Math.round((data.stats.averageAttendance / (data.stats.totalEnrollment || 1)) * 100)}%
                                    </span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-6 overflow-hidden border border-slate-200 dark:border-slate-600">
                                    <div 
                                        className="bg-indigo-500 h-full rounded-full transition-all duration-1000 ease-out shadow-sm" 
                                        style={{width: `${Math.min(100, (data.stats.averageAttendance / (data.stats.totalEnrollment || 1)) * 100)}%`}}
                                    ></div>
                                </div>
                            </div>
                      </div>
                  </div>
              ) : null;
          case 'groups_stats':
              return (
                  <div key="groups_stats" className="col-span-1 md:col-span-2 lg:col-span-4">
                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                          <StatCard label="Total Groups" value={data.stats.totalGroups.toLocaleString()} color="indigo" source="Planning Center" />
                          <StatCard label="Members & Leaders" value={data.stats.totalEnrollment.toLocaleString()} color="emerald" source="Planning Center" />
                          <StatCard label="Avg Size" value={data.stats.averageGroupSize.toLocaleString()} color="violet" source="Planning Center" />
                          <StatCard label="Public Groups" value={data.stats.publicGroups.toLocaleString()} color="amber" source="Planning Center" />
                      </div>
                  </div>
              );
          case 'event_attendance':
              const totalMembers = eventAttendanceData.reduce((acc, curr) => acc + curr.Members, 0);
              const totalVisitors = eventAttendanceData.reduce((acc, curr) => acc + curr.Visitors, 0);
              const totalAttendance = totalMembers + totalVisitors;

              return (
                  <div key="event_attendance" className="col-span-1 lg:col-span-2">
                      <WidgetWrapper 
                          title="Group Attendance" 
                          onRemove={() => handleRemoveWidget(id)} 
                          source="Group Events"
                          headerControl={
                              <select 
                                  value={eventAttendanceFilter} 
                                  onChange={(e) => setEventAttendanceFilter(e.target.value as EventAttendanceFilterType)}
                                  className="bg-slate-100 dark:bg-slate-800 border-none text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 rounded-lg py-1 px-2 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                  <option value="This Week">This Week</option>
                                  <option value="Last Week">Last Week</option>
                                  <option value="This Month">This Month</option>
                                  <option value="Last Month">Last Month</option>
                                  <option value="Last Quarter">Last Quarter</option>
                              </select>
                          }
                      >
                          <div className="flex flex-col h-64">
                              {eventAttendanceData.length > 0 ? (
                                  <>
                                      <div className="flex gap-6 mb-4 px-2">
                                          <div>
                                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total</p>
                                              <p className="text-xl font-black text-slate-900 dark:text-white">{totalAttendance.toLocaleString()}</p>
                                          </div>
                                          <div>
                                              <p className="text-[10px] font-bold text-indigo-400 uppercase tracking-widest">Members</p>
                                              <p className="text-xl font-black text-indigo-600 dark:text-indigo-400">{totalMembers.toLocaleString()}</p>
                                          </div>
                                          <div>
                                              <p className="text-[10px] font-bold text-amber-400 uppercase tracking-widest">Visitors</p>
                                              <p className="text-xl font-black text-amber-500 dark:text-amber-400">{totalVisitors.toLocaleString()}</p>
                                          </div>
                                      </div>
                                      <div className="flex-1 min-h-0">
                                          <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                              <BarChart data={eventAttendanceData}>
                                                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                                  <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                                  <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                                  <Tooltip 
                                                      cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}}
                                                      contentStyle={TOOLTIP_STYLE}
                                                      itemStyle={{ color: '#fff' }}
                                                  />
                                                  <Legend verticalAlign="top" height={36} iconType="circle" wrapperStyle={{fontSize: '10px', fontWeight: 'bold', color: axisColor}} />
                                                  
                                                  <Bar dataKey="Members" stackId="a" fill="#6366f1" radius={[0, 0, 0, 0]} barSize={30} />
                                                  <Bar dataKey="Visitors" stackId="a" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={30} />
                                              </BarChart>
                                          </ResponsiveContainer>
                                      </div>
                                  </>
                              ) : (
                                  <div className="h-full flex flex-col items-center justify-center text-slate-400">
                                      <p className="text-xs font-bold mb-2">No event data found for {eventAttendanceFilter}.</p>
                                      <button onClick={onSyncGroups} className="text-[10px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-600 border border-indigo-100 px-3 py-1.5 rounded-lg transition-colors">
                                          Sync Recent Attendance
                                      </button>
                                  </div>
                              )}
                          </div>
                      </WidgetWrapper>
                  </div>
              );
          case 'groups_gender':
              const totalGenderCount = groupsGenderData.reduce((acc, curr) => acc + curr.value, 0);
              return (
                  <div key="groups_gender" className="col-span-1">
                      <WidgetWrapper title="Group Gender Dist" onRemove={() => handleRemoveWidget(id)} source="Group Members">
                          <div className="h-64 relative">
                              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                  <PieChart>
                                      <Pie data={groupsGenderData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                          {groupsGenderData.map((d, i) => (
                                              <Cell key={`g-${i}`} fill={GENDER_COLORS[d.name] || '#94a3b8'} />
                                          ))}
                                      </Pie>
                                      <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} />
                                      <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{fontSize: '10px', fontWeight: 'bold', color: axisColor}} />
                                  </PieChart>
                              </ResponsiveContainer>
                              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none pr-14">
                                  {totalGenderCount > 0 ? (
                                      <>
                                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Ratio</span>
                                          <span className="text-xl font-black text-slate-900 dark:text-white">
                                              {Math.round((groupsGenderData.find(d => d.name === 'Male')?.value || 0) / totalGenderCount * 100)}% M
                                          </span>
                                      </>
                                  ) : (
                                      <span className="text-xs font-bold text-slate-300">No Data</span>
                                  )}
                              </div>
                          </div>
                      </WidgetWrapper>
                  </div>
              );
          case 'types':
              return (
                  <div key="types" className="col-span-1">
                      <WidgetWrapper title="Groups by Type" onRemove={() => handleRemoveWidget(id)} source="PCO Groups">
                          <div className="h-64">
                              <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                  <PieChart>
                                      <Pie data={data.groupsByType} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                          {data.groupsByType.map((entry, index) => (
                                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                          ))}
                                      </Pie>
                                      <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} />
                                      <Legend layout="vertical" verticalAlign="middle" align="right" wrapperStyle={{fontSize: '10px', fontWeight: 'bold', color: axisColor}} />
                                  </PieChart>
                              </ResponsiveContainer>
                          </div>
                      </WidgetWrapper>
                  </div>
              );
          case 'recent_groups':
              return (
                  <div key="recent_groups" className="col-span-1">
                      <WidgetWrapper title="Newest Groups" onRemove={() => handleRemoveWidget(id)} source="PCO Groups">
                          <div className="space-y-4">
                              {data.recentGroups.map(group => (
                                  <div key={group.id} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                      <div>
                                          <p className="text-xs font-bold text-slate-900 dark:text-white">{group.name}</p>
                                          <p className="text-[9px] text-slate-400">{group.groupTypeName}</p>
                                      </div>
                                      <span className="text-[9px] font-black bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-2 py-1 rounded">
                                          {new Date(group.createdAt).toLocaleDateString()}
                                      </span>
                                  </div>
                              ))}
                          </div>
                      </WidgetWrapper>
                  </div>
              );
          case 'group_leader_age':
              const uniqueLeaderIds = Array.from(new Set(data.allGroups.flatMap(g => g.leaderIds || []))) as string[];
              const leadersWithAge = uniqueLeaderIds.map(id => getPersonDetails(id)).filter(p => p && p.birthdate);
              
              let totalLeaderAge = 0;
              const currentYear = new Date().getFullYear();
              
              leadersWithAge.forEach(p => {
                  if (p && p.birthdate) {
                      const birthYear = parseInt(p.birthdate.split('-')[0]);
                      totalLeaderAge += (currentYear - birthYear);
                  }
              });
              
              const avgLeaderAge = leadersWithAge.length > 0 ? (totalLeaderAge / leadersWithAge.length).toFixed(1) : 'N/A';

              return (
                  <div key="group_leader_age" className="col-span-1">
                      <WidgetWrapper title="Leader Avg Age" onRemove={() => handleRemoveWidget(id)} source="Group Leaders">
                          <div className="h-full flex flex-col justify-center items-center pb-6">
                              <span className="text-5xl font-black text-cyan-600 dark:text-cyan-400">{avgLeaderAge}</span>
                              <span className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Years Old</span>
                          </div>
                      </WidgetWrapper>
                  </div>
              );
          case 'group_leaders':
              return (
                  <div key="group_leaders" className="col-span-1 lg:col-span-2">
                      <WidgetWrapper title="Group Leaders" onRemove={() => handleRemoveWidget(id)} source="Group Memberships">
                          <div className="overflow-x-auto max-h-96 custom-scrollbar">
                              <table className="w-full text-left">
                                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 sticky top-0 z-10">
                                      <tr>
                                          <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest w-1/2">Group Details</th>
                                          <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">Leaders</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                      {enrichedGroups.slice(0, 50).map(group => {
                                          const leaders = (group.leaderIds || [])
                                              .map(id => getPersonDetails(id))
                                              .filter((p): p is PcoPerson => !!p);

                                          return (
                                              <tr key={group.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                  <td className="p-3">
                                                      <div className="flex justify-between items-start">
                                                          <p className="text-xs font-bold text-slate-900 dark:text-white">{group.name}</p>
                                                          <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider ${
                                                              group.health.status === 'Thriving' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                                              group.health.status === 'Warning' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                                                              'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                                                          }`}>
                                                              {group.health.status}
                                                          </span>
                                                      </div>
                                                      <div className="flex flex-wrap gap-1.5 mt-1.5">
                                                          <span className="text-[9px] font-medium text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-700 px-2 py-0.5 rounded border border-slate-200 dark:border-slate-600">
                                                              {group.groupTypeName}
                                                          </span>
                                                          <span className="text-[9px] font-bold text-indigo-600 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-900/30 px-2 py-0.5 rounded border border-indigo-100 dark:border-indigo-800 flex items-center gap-1" title="Total Members (includes leaders)">
                                                              <span className="text-[8px]">👥</span>
                                                              {group.membersCount} Members
                                                          </span>
                                                      </div>
                                                  </td>
                                                  <td className="p-3">
                                                      {leaders.length > 0 ? (
                                                          <div className="flex flex-col gap-1.5">
                                                              {leaders.map(p => (
                                                                  <div key={p.id} className="flex items-center gap-2">
                                                                      <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center text-[8px] font-black overflow-hidden flex-shrink-0">
                                                                          {p.avatar ? (
                                                                              <img src={p.avatar} alt={p.name} className="w-full h-full object-cover" />
                                                                          ) : (
                                                                              <span>{p.name.charAt(0)}</span>
                                                                          )}
                                                                      </div>
                                                                      <span className="text-[10px] font-medium text-slate-700 dark:text-slate-300 truncate max-w-[150px]">
                                                                          {p.name}
                                                                      </span>
                                                                  </div>
                                                              ))}
                                                          </div>
                                                      ) : (
                                                          <span className="text-[9px] text-slate-400 italic">No Leaders Assigned</span>
                                                      )}
                                                  </td>
                                              </tr>
                                          );
                                      })}
                                      {data.allGroups.length === 0 && (
                                          <tr>
                                              <td colSpan={2} className="p-6 text-center text-slate-400 text-xs italic">
                                                  No active groups found.
                                              </td>
                                          </tr>
                                      )}
                                  </tbody>
                              </table>
                          </div>
                      </WidgetWrapper>
                  </div>
              );
          case 'group_info':
              const ranges = (() => {
                  const now = new Date();
                  const s = new Date(now);
                  const e = new Date(now);
                  const ps = new Date(now);
                  const pe = new Date(now);

                  // Reset hours to ensure full day coverage
                  s.setHours(0,0,0,0); e.setHours(23,59,59,999);
                  ps.setHours(0,0,0,0); pe.setHours(23,59,59,999);

                  // Helper to safely set month
                  const setToStartOfMonth = (d: Date, monthOffset: number) => {
                      d.setDate(1);
                      d.setMonth(now.getMonth() + monthOffset);
                  };
                  const setToEndOfMonth = (d: Date, monthOffset: number) => {
                      d.setDate(1); // Go to 1st of current month
                      d.setMonth(now.getMonth() + monthOffset + 1); // Go to next month
                      d.setDate(0); // Go back one day to end of target month
                  };

                  if (groupInfoFilter === 'Current Month') {
                      // Current: 1st of this month to End of this month
                      setToStartOfMonth(s, 0);
                      setToEndOfMonth(e, 0);
                      
                      // Prev: 1st of last month to End of last month
                      setToStartOfMonth(ps, -1);
                      setToEndOfMonth(pe, -1);
                  } else if (groupInfoFilter === 'Last Month') {
                      // Current: 1st of last month to End of last month
                      setToStartOfMonth(s, -1);
                      setToEndOfMonth(e, -1);
                      
                      // Prev: 1st of 2 months ago to End of 2 months ago
                      setToStartOfMonth(ps, -2);
                      setToEndOfMonth(pe, -2);
                  } else { // Last Quarter
                      // Current: 90 days ago to Today
                      s.setDate(now.getDate() - 90);
                      e.setDate(now.getDate()); // End of today
                      
                      // Prev: 180 days ago to 91 days ago
                      ps.setDate(now.getDate() - 180);
                      pe.setDate(now.getDate() - 91);
                  }
                  return { start: s, end: e, prevStart: ps, prevEnd: pe };
              })();

              const groupInfoData = enrichedGroups.map(g => {
                  const history = g.attendanceHistory || [];
                  
                  const currEvents = history.filter(h => {
                      const d = new Date(h.date);
                      return d >= ranges.start && d <= ranges.end;
                  });
                  
                  const prevEvents = history.filter(h => {
                      const d = new Date(h.date);
                      return d >= ranges.prevStart && d <= ranges.prevEnd;
                  });

                  // Robust average calculation:
                  // Sum of counts divided by number of events.
                  // Prefer explicit members + visitors if available, fallback to total count.
                  const currAvg = currEvents.length > 0 
                      ? Math.round(currEvents.reduce((sum, e) => {
                          const val = (e.count || 0) > 0 ? e.count : ((e.members || 0) + (e.visitors || 0));
                          return sum + val;
                      }, 0) / currEvents.length) 
                      : 0;
                  
                  const prevAvg = prevEvents.length > 0 
                      ? Math.round(prevEvents.reduce((sum, e) => {
                          const val = (e.count || 0) > 0 ? e.count : ((e.members || 0) + (e.visitors || 0));
                          return sum + val;
                      }, 0) / prevEvents.length) 
                      : 0;

                  const leaderId = g.leaderIds?.[0];
                  const leaderName = leaderId 
                      ? getPersonDetails(leaderId)?.name || 'Multiple' 
                      : 'No Leader';

                  return {
                      id: g.id,
                      name: g.name,
                      members: g.membersCount,
                      leader: leaderName,
                      avg: currAvg,
                      prevAvg: prevAvg,
                      trend: currAvg - prevAvg,
                      health: g.health
                  };
              })
              .sort((a,b) => b.avg - a.avg);

              return (
                  <div key="group_info" className="col-span-1 lg:col-span-4">
                      <WidgetWrapper 
                          title="Group Info" 
                          onRemove={() => handleRemoveWidget(id)} 
                          source="PCO Groups"
                          headerControl={
                              <select 
                                  value={groupInfoFilter} 
                                  onChange={(e) => setGroupInfoFilter(e.target.value as GroupInfoFilterType)}
                                  className="bg-slate-100 dark:bg-slate-800 border-none text-[10px] font-bold uppercase tracking-widest text-slate-500 dark:text-slate-400 rounded-lg py-1 px-2 cursor-pointer outline-none focus:ring-2 focus:ring-indigo-500"
                              >
                                  <option>Current Month</option>
                                  <option>Last Month</option>
                                  <option>Last Quarter</option>
                              </select>
                          }
                      >
                          <div className="overflow-x-auto max-h-96 custom-scrollbar">
                              <table className="w-full text-left">
                                  <thead className="bg-slate-50 dark:bg-slate-800 border-b border-slate-100 dark:border-slate-700 sticky top-0 z-10">
                                      <tr>
                                          <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">Group Name</th>
                                          <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest">Leader</th>
                                          <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest text-center">Total Members</th>
                                          <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest text-center">Health</th>
                                          <th className="p-3 text-[9px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest text-right">Avg Attendance</th>
                                      </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                      {groupInfoData.length > 0 ? (
                                          groupInfoData.map(group => (
                                              <tr key={group.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                                  <td className="p-3">
                                                      <span className="text-xs font-bold text-slate-900 dark:text-white">{group.name}</span>
                                                  </td>
                                                  <td className="p-3">
                                                      <span className="text-xs font-medium text-slate-600 dark:text-slate-400">{group.leader}</span>
                                                  </td>
                                                  <td className="p-3 text-center">
                                                      <span className="text-xs font-black text-slate-900 dark:text-white">{group.members ?? 0}</span>
                                                  </td>
                                                  <td className="p-3 text-center">
                                                      <span className={`text-[9px] font-black uppercase px-2 py-1 rounded tracking-wider ${
                                                          group.health.status === 'Thriving' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' :
                                                          group.health.status === 'Warning' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                                                          'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                                                      }`}>
                                                          {group.health.status} ({group.health.score})
                                                      </span>
                                                  </td>
                                                  <td className="p-3 text-right">
                                                      <div className="flex items-center justify-end gap-2">
                                                          <span className="text-xs font-black text-slate-900 dark:text-white">{group.avg}</span>
                                                          <span className={`text-[9px] font-bold ${group.trend > 0 ? 'text-emerald-500' : group.trend < 0 ? 'text-rose-500' : 'text-slate-400'}`}>
                                                              {group.trend > 0 ? '↑' : group.trend < 0 ? '↓' : '–'}
                                                              {Math.abs(group.trend) > 0 ? Math.abs(group.trend) : ''}
                                                          </span>
                                                      </div>
                                                  </td>
                                              </tr>
                                          ))
                                      ) : (
                                          <tr>
                                              <td colSpan={5} className="p-6 text-center text-slate-400 text-xs italic">
                                                  No groups data available for this period.
                                              </td>
                                          </tr>
                                      )}
                                  </tbody>
                              </table>
                          </div>
                      </WidgetWrapper>
                  </div>
              );
          case 'benchmark_group_att':
              if (!globalStats) return renderBenchmarkPlaceholder("Avg Group Size", id);
              
              const localAvg = data.stats.averageGroupSize;
              const globalAvg = globalStats.metrics.avgGroupAttendance;

              return (
                  <div key="benchmark_group_att" className="col-span-1">
                      <WidgetWrapper title="Avg Group Size" onRemove={() => handleRemoveWidget(id)} source="Benchmarks">
                          <div className="h-64 flex flex-col justify-center gap-6 px-4">
                              <div>
                                  <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                                      <span>You</span>
                                      <span>{localAvg.toFixed(1)}</span>
                                  </div>
                                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-3">
                                      <div className="bg-indigo-500 h-3 rounded-full" style={{width: `${Math.min(100, (localAvg / (Math.max(localAvg, globalAvg) || 1)) * 100)}%`}}></div>
                                  </div>
                              </div>
                              <div>
                                  <div className="flex justify-between text-xs font-bold text-slate-400 mb-1">
                                      <span>Global Avg</span>
                                      <span>{globalAvg.toFixed(1)}</span>
                                  </div>
                                  <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-3">
                                      <div className="bg-slate-400 h-3 rounded-full" style={{width: `${Math.min(100, (globalAvg / (Math.max(localAvg, globalAvg) || 1)) * 100)}%`}}></div>
                                  </div>
                              </div>
                          </div>
                      </WidgetWrapper>
                  </div>
              );
          default:
              return null;
      }
  };

  return (
    <div className="space-y-10 animate-in fade-in duration-500">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <h3 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white">Groups Analytics</h3>
          <p className="text-slate-400 dark:text-slate-500 font-medium uppercase text-[10px] tracking-widest mt-1">Small Group Health & Participation</p>
        </div>
        
        <div className="flex gap-4 items-center">
            {pcoConnected && onSyncGroups && (
                <button 
                    onClick={onSyncGroups}
                    disabled={isSyncing}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-50"
                >
                    <span className={isSyncing ? 'animate-spin' : ''}>↻</span>
                    <span>{isSyncing ? 'Syncing (Deep Scan)...' : 'Groups Sync'}</span>
                </button>
            )}
            
            <WidgetsController 
                availableWidgets={availableWidgets} 
                visibleWidgets={safeVisibleWidgets} 
                onUpdate={onUpdateWidgets} 
                onUpdateTheme={onUpdateTheme}
                currentTheme={currentTheme}
            />
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {safeVisibleWidgets.map((id, index) => {
              let spanClass = "col-span-1";
              if (id === 'groups_stats') spanClass = "col-span-1 md:col-span-2 lg:col-span-4";
              if (id === 'groups_ai_agent' || id === 'groups_risk_agent' || id === 'event_attendance' || id === 'group_leaders' || id === 'groups_age_demographics') spanClass = "col-span-1 lg:col-span-2";
              if (id === 'group_info') spanClass = "col-span-1 lg:col-span-4";
              
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
                  <p className="text-slate-400 dark:text-slate-500 font-bold">No widgets configured.</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Use the "Customize Layout" button to add widgets.</p>
              </div>
          )}
      </div>
    </div>
  );
};

export default GroupsView;
