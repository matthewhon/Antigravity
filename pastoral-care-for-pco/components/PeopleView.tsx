import React, { useMemo, useState } from 'react';
import { PeopleDashboardData, GeoInsight, CensusStats, GlobalStats } from '../types';
import { 
  PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend,
  BarChart, Bar, XAxis, YAxis, CartesianGrid
} from 'recharts';
import WidgetsController from './WidgetsController';
import { PEOPLE_OVERVIEW_WIDGETS, PEOPLE_HOUSEHOLD_WIDGETS, PEOPLE_RISK_WIDGETS } from '../constants/widgetRegistry';
import { WidgetWrapper, StatCard, PersonList } from './SharedUI';
import { RiskDistributionWidget, AtRiskListWidget, StatusChangesWidget, RiskFactorsWidget, PeopleDirectoryWidget } from './RiskWidgets';
import { CommunityComparison } from './CommunityComparison';

interface PeopleViewProps {
  data: PeopleDashboardData;
  overviewWidgets: string[];
  householdWidgets: string[];
  riskWidgets: string[];
  onUpdateOverviewWidgets: (widgets: string[]) => void;
  onUpdateHouseholdWidgets: (widgets: string[]) => void;
  onUpdateRiskWidgets: (widgets: string[]) => void;
  geoInsights: GeoInsight | null;
  isGeneratingGeo: boolean;
  onGenerateGeoInsights: () => void;
  censusData: CensusStats | null;
  allowedWidgetIds?: string[];
  onSync?: () => void;
  isSyncing?: boolean;
  pcoConnected: boolean;
  onUpdateTheme?: (theme: 'traditional' | 'dark') => void;
  currentTheme?: 'traditional' | 'dark';
  globalStats?: GlobalStats | null;
  userSettings?: Record<string, any>;
  onUpdateSettings?: (key: string, value: any) => void;
}

const COLORS = ['#6366f1', '#8b5cf6', '#ec4899', '#f43f5e', '#f97316', '#10b981'];
const GENDER_COLORS: Record<string, string> = {
  'Male': '#6366f1',
  'Female': '#ec4899',
  'Unknown': '#94a3b8'
};
const ENGAGEMENT_COLORS: Record<string, string> = {
  'Healthy': '#10b981',      // Emerald
  'At Risk': '#f59e0b',      // Amber
  'Disconnected': '#f43f5e', // Rose
  'Unknown': '#94a3b8',
  'Core': '#6366f1',
  'Regular': '#8b5cf6',
  'Sporadic': '#f43f5e',
  'Inactive': '#94a3b8'
};

const TOOLTIP_STYLE = {
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#1e293b',
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
};

export const PeopleView: React.FC<PeopleViewProps> = ({ 
  data, 
  overviewWidgets = [], 
  householdWidgets = [],
  riskWidgets = [],
  onUpdateOverviewWidgets = (_: string[]) => {},
  onUpdateHouseholdWidgets = (_: string[]) => {},
  onUpdateRiskWidgets = (_: string[]) => {},
  geoInsights,
  isGeneratingGeo,
  onGenerateGeoInsights,
  censusData,
  allowedWidgetIds,
  onSync,
  isSyncing,
  pcoConnected,
  onUpdateTheme,
  currentTheme,
  globalStats,
  userSettings = {},
  onUpdateSettings = (_k: string, _v: any) => {}
}) => {
  const [activeTab, setActiveTab] = useState<'overview' | 'households' | 'risk'>('overview');

  const categoryPrefix = activeTab === 'overview' ? 'people' : activeTab === 'households' ? 'people_households' : 'people_risk';

  const availableWidgets = useMemo(() => {
    let list;
    if (activeTab === 'overview') list = PEOPLE_OVERVIEW_WIDGETS;
    else if (activeTab === 'households') list = PEOPLE_HOUSEHOLD_WIDGETS;
    else list = PEOPLE_RISK_WIDGETS;

    if (!allowedWidgetIds) return list;
    return list.filter(w => allowedWidgetIds.includes(`${categoryPrefix}:${w.id}`));
  }, [allowedWidgetIds, activeTab, categoryPrefix]);

  const visibleWidgets = activeTab === 'overview' ? overviewWidgets : activeTab === 'households' ? householdWidgets : riskWidgets;
  const onUpdateWidgets = activeTab === 'overview' ? onUpdateOverviewWidgets : activeTab === 'households' ? onUpdateHouseholdWidgets : onUpdateRiskWidgets;

  const safeVisibleWidgets = (visibleWidgets || []).filter(id => 
    !allowedWidgetIds || allowedWidgetIds.includes(`${categoryPrefix}:${id}`)
  );

  const handleRemoveWidget = (id: string) => {
    if (onUpdateWidgets) {
        onUpdateWidgets(visibleWidgets.filter(w => w !== id));
    }
  };

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
        <div className="text-[140px] mb-14 grayscale opacity-20 drop-shadow-2xl">👥</div>
        <h3 className="text-5xl font-black text-slate-900 dark:text-white mb-8 tracking-tighter uppercase">Connection Required</h3>
        <p className="text-slate-400 max-w-lg mx-auto font-medium text-2xl leading-relaxed">
          Connect Planning Center to unlock People analytics and insights.
        </p>
      </div>
    );
  }

  const renderWidget = (id: string) => {
    const gridColor = currentTheme === 'dark' ? '#334155' : '#f1f5f9';
    const axisColor = currentTheme === 'dark' ? '#94a3b8' : '#94a3b8';

    switch(id) {
        case 'people_stats':
            return (
                <div key="people_stats" className="col-span-1 md:col-span-2 lg:col-span-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <StatCard label="Total People" value={data.stats.total.toLocaleString()} color="indigo" source="Planning Center" />
                        <StatCard label="Members" value={data.stats.members.toLocaleString()} color="emerald" source="Planning Center" />
                        <StatCard label="New (30d)" value={data.stats.newThisMonth.toLocaleString()} color="violet" source="Planning Center" />
                        <StatCard label="Households" value={data.stats.households.toLocaleString()} color="amber" source="Planning Center" />
                    </div>
                </div>
            );
        case 'people_engagement':
            return (
                <div key="people_engagement" className="col-span-1">
                    <WidgetWrapper title="Engagement" onRemove={() => handleRemoveWidget(id)} source="Check-in Activity">
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                <PieChart>
                                    <Pie data={data.engagementData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                        {data.engagementData.map((entry, i) => (
                                            <Cell key={`e-${i}`} fill={ENGAGEMENT_COLORS[entry.name] || '#94a3b8'} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} />
                                    <Legend layout="vertical" verticalAlign="middle" align="right" />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'gender':
            return (
                <div key="gender" className="col-span-1">
                    <WidgetWrapper title="Gender Dist" onRemove={() => handleRemoveWidget(id)} source="PCO People">
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                <PieChart>
                                    <Pie data={data.genderData} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="value">
                                        {data.genderData.map((d, i) => (
                                            <Cell key={`c-${i}`} fill={GENDER_COLORS[d.name] || '#94a3b8'} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} />
                                    <Legend layout="vertical" verticalAlign="middle" align="right" />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'age':
            return (
                <div key="age" className="col-span-1">
                    <WidgetWrapper title="Age Distribution" onRemove={() => handleRemoveWidget(id)} source="PCO People">
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                <BarChart data={data.ageData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                    <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                    <Tooltip cursor={{ fill: currentTheme === 'dark' ? '#334155' : '#f8fafc' }} contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} />
                                    <Bar dataKey="count" fill="#ec4899" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'community_age_comparison':
            return (
                <div key="community_age_comparison" className="col-span-1 lg:col-span-2">
                    <WidgetWrapper title="Community Age Gap" onRemove={() => handleRemoveWidget(id)} source="Census vs Church">
                        <CommunityComparison 
                            peopleData={data} 
                            censusData={censusData} 
                            type="age" 
                            currentTheme={currentTheme || 'traditional'} 
                        />
                    </WidgetWrapper>
                </div>
            );
        case 'benchmark_age':
            if (!globalStats) return renderBenchmarkPlaceholder("Age Benchmark", id);
            const totalPeople = data.stats.total || 1;
            const ageCompData = data.ageData.map(d => ({
                range: d.range,
                You: (d.count / totalPeople) * 100,
                Benchmark: globalStats.metrics.ageDistribution[d.range] || 0
            }));
            return (
                <div key="benchmark_age" className="col-span-1 lg:col-span-2">
                    <WidgetWrapper title="Age Benchmark" onRemove={() => handleRemoveWidget(id)} source="Community Avg">
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                <BarChart data={ageCompData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                    <XAxis dataKey="range" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} tickFormatter={v => `${v.toFixed(0)}%`} />
                                    <Tooltip cursor={{ fill: currentTheme === 'dark' ? '#334155' : '#f8fafc' }} contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} formatter={(v: number) => `${v.toFixed(1)}%`} />
                                    <Legend iconType="circle" />
                                    <Bar dataKey="You" fill="#6366f1" radius={[4, 4, 0, 0]} />
                                    <Bar dataKey="Benchmark" fill="#94a3b8" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'benchmark_gender':
            if (!globalStats) return renderBenchmarkPlaceholder("Gender Benchmark", id);
            const maleCount = data.genderData.find(d => d.name === 'Male')?.value || 0;
            const femaleCount = data.genderData.find(d => d.name === 'Female')?.value || 0;
            const localRatio = femaleCount > 0 ? maleCount / femaleCount : 0;
            const ratioData = [
                { name: 'You', value: localRatio, fill: '#ec4899' },
                { name: 'Avg', value: globalStats.metrics.maleFemaleRatio, fill: '#94a3b8' }
            ];
            return (
                <div key="benchmark_gender" className="col-span-1">
                    <WidgetWrapper title="Male/Female Ratio" onRemove={() => handleRemoveWidget(id)} source="Benchmarks">
                        <div className="h-64 flex flex-col justify-center">
                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                <BarChart data={ratioData} layout="vertical" margin={{ left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 12, fontWeight: 700, fill: axisColor }} width={40} />
                                    <Tooltip cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}} contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} formatter={(v: number) => v.toFixed(2)} />
                                    <Bar dataKey="value" radius={[0, 10, 10, 0]} barSize={30}>
                                        {ratioData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={entry.fill} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                            <p className="text-center text-[10px] text-slate-400 mt-2">Men per 1 Woman</p>
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'benchmark_household':
            if (!globalStats) return renderBenchmarkPlaceholder("Household Size", id);
            const localSize = data.householdStats?.avgSize || 0;
            const globalSize = globalStats.metrics.avgHouseholdSize;
            return (
                <div key="benchmark_household" className="col-span-1">
                    <WidgetWrapper title="Household Size" onRemove={() => handleRemoveWidget(id)} source="Benchmarks">
                        <div className="h-64 flex flex-col justify-center gap-6 px-4">
                            <div>
                                <div className="flex justify-between text-xs font-bold text-slate-600 dark:text-slate-300 mb-1">
                                    <span>You</span>
                                    <span>{localSize.toFixed(2)}</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-3">
                                    <div className="bg-indigo-500 h-3 rounded-full" style={{width: `${Math.min(100, (localSize / 5) * 100)}%`}}></div>
                                </div>
                            </div>
                            <div>
                                <div className="flex justify-between text-xs font-bold text-slate-400 mb-1">
                                    <span>Global Avg</span>
                                    <span>{globalSize.toFixed(2)}</span>
                                </div>
                                <div className="w-full bg-slate-100 dark:bg-slate-700 rounded-full h-3">
                                    <div className="bg-slate-400 h-3 rounded-full" style={{width: `${Math.min(100, (globalSize / 5) * 100)}%`}}></div>
                                </div>
                            </div>
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'membership':
            return (
                <div key="membership" className="col-span-1">
                    <WidgetWrapper title="Membership Status Breakdown" onRemove={() => handleRemoveWidget(id)} source="Planning Center People">
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                <BarChart data={data.membershipData} layout="vertical" margin={{ left: 20 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: axisColor }} width={80} />
                                    <Tooltip cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}} contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} />
                                    <Bar dataKey="value" radius={[0, 10, 10, 0]} barSize={20}>
                                        {data.membershipData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'map':
            return (
                <div key="map" className="col-span-1 lg:col-span-2">
                    <WidgetWrapper title="Geographic Distribution" onRemove={() => handleRemoveWidget(id)} source="Top Cities">
                        <div className="flex flex-col h-64">
                            <div className="flex-1 space-y-3 overflow-y-auto custom-scrollbar">
                                {data.geoData?.byCity.map((city, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 bg-slate-50 dark:bg-slate-900 rounded-lg">
                                        <div className="flex items-center gap-3">
                                            <span className="text-xs font-bold w-4 text-slate-400">{i+1}</span>
                                            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{city.name}</span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <div className="w-24 h-2 bg-slate-200 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className="h-full bg-indigo-500" style={{ width: `${(city.value / (data.geoData.byCity[0]?.value || 1)) * 100}%` }}></div>
                                            </div>
                                            <span className="text-xs font-black text-slate-900 dark:text-white w-8 text-right">{city.value}</span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center">
                                <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                    {geoInsights ? "Analysis Complete" : "AI Geographic Analysis"}
                                </p>
                                <button 
                                    onClick={onGenerateGeoInsights}
                                    disabled={isGeneratingGeo}
                                    className="text-[10px] font-bold uppercase tracking-widest bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 px-3 py-1.5 rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors disabled:opacity-50"
                                >
                                    {isGeneratingGeo ? 'Analyzing...' : 'Generate Insights'}
                                </button>
                            </div>
                            {geoInsights && (
                                <div className="mt-2 p-3 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-xl text-[10px] text-slate-600 dark:text-slate-400 leading-relaxed">
                                    {geoInsights.text}
                                    {geoInsights.mapLinks.length > 0 && (
                                        <div className="mt-2 flex flex-wrap gap-2">
                                            {geoInsights.mapLinks.map((link, i) => (
                                                <a key={i} href={link.uri} target="_blank" rel="noreferrer" className="text-indigo-600 dark:text-indigo-400 underline decoration-indigo-300">
                                                    {link.title}
                                                </a>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'birthdays':
            return (
                <div key="birthdays" className="col-span-1">
                    <WidgetWrapper title="Upcoming Birthdays" onRemove={() => handleRemoveWidget(id)} source="PCO People">
                        <PersonList people={data.upcomingBirthdays} type="birthday" />
                    </WidgetWrapper>
                </div>
            );
        case 'anniversaries':
            return (
                <div key="anniversaries" className="col-span-1">
                    <WidgetWrapper title="Upcoming Anniversaries" onRemove={() => handleRemoveWidget(id)} source="PCO People">
                        <PersonList people={data.upcomingAnniversaries} type="anniversary" />
                    </WidgetWrapper>
                </div>
            );
        case 'recent':
            return (
                <div key="recent" className="col-span-1">
                    <WidgetWrapper title="New Profiles (30d)" onRemove={() => handleRemoveWidget(id)} source="PCO People">
                        <PersonList people={data.recentPeople} type="recent" />
                    </WidgetWrapper>
                </div>
            );
        case 'riskDistribution':
            return (
                <div key="riskDistribution" className="col-span-1 lg:col-span-2">
                    <div className="h-full relative group">
                        <button onClick={() => handleRemoveWidget(id)} className="absolute top-6 right-6 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 z-10">✕</button>
                        <RiskDistributionWidget people={data.allPeople} currentTheme={currentTheme} />
                    </div>
                </div>
            );
        // ... (rest of Risk widgets same as before)
        case 'atRiskList':
            return (
                <div key="atRiskList" className="col-span-1 lg:col-span-2">
                    <div className="h-full relative group">
                        <button onClick={() => handleRemoveWidget(id)} className="absolute top-6 right-6 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 z-10">✕</button>
                        <AtRiskListWidget people={data.allPeople} />
                    </div>
                </div>
            );
        case 'riskChanges':
            return (
                <div key="riskChanges" className="col-span-1">
                    <div className="h-full relative group">
                        <button onClick={() => handleRemoveWidget(id)} className="absolute top-6 right-6 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 z-10">✕</button>
                        <StatusChangesWidget people={data.allPeople} />
                    </div>
                </div>
            );
        case 'risk_factors':
            return (
                <div key="risk_factors" className="col-span-1 lg:col-span-2">
                    <div className="h-full relative group">
                        <button onClick={() => handleRemoveWidget(id)} className="absolute top-6 right-6 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 z-10">✕</button>
                        <RiskFactorsWidget people={data.allPeople} currentTheme={currentTheme} />
                    </div>
                </div>
            );
        case 'people_directory':
            return (
                <div key="people_directory" className="col-span-1 lg:col-span-4">
                    <div className="h-full relative group">
                        <button onClick={() => handleRemoveWidget(id)} className="absolute top-6 right-6 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 z-10">✕</button>
                        <PeopleDirectoryWidget people={data.allPeople} />
                    </div>
                </div>
            );
        case 'householdSummary':
            return (
                <div key="householdSummary" className="col-span-1 md:col-span-2 lg:col-span-4">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                        <StatCard label="Total Households" value={data.householdStats?.totalHouseholds.toLocaleString() || '0'} color="indigo" source="PCO Households" />
                        <StatCard label="Avg Size" value={data.householdStats?.avgSize.toFixed(2) || '0'} color="violet" source="PCO Households" />
                        <StatCard label="Families" value={data.householdStats?.composition.find(c => c.type === 'Family')?.count.toLocaleString() || '0'} color="emerald" source="> 1 Member" />
                        <StatCard label="Singles" value={data.householdStats?.composition.find(c => c.type === 'Individual')?.count.toLocaleString() || '0'} color="amber" source="1 Member" />
                    </div>
                </div>
            );
        case 'householdComp':
            return (
                <div key="householdComp" className="col-span-1">
                    <WidgetWrapper title="Household Type" onRemove={() => handleRemoveWidget(id)} source="Families vs Singles">
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                <PieChart>
                                    <Pie data={data.householdStats?.composition || []} innerRadius={60} outerRadius={80} paddingAngle={5} dataKey="count" nameKey="type">
                                        {(data.householdStats?.composition || []).map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} />
                                    <Legend verticalAlign="middle" align="right" layout="vertical" />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'householdSize':
            return (
                <div key="householdSize" className="col-span-1">
                    <WidgetWrapper title="Size Distribution" onRemove={() => handleRemoveWidget(id)} source="People per Household">
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                <BarChart data={data.householdStats?.sizeDistribution || []}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                    <XAxis dataKey="size" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                    <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                    <Tooltip cursor={{ fill: currentTheme === 'dark' ? '#334155' : '#f8fafc' }} contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} />
                                    <Bar dataKey="count" fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'householdList':
            return (
                <div key="householdList" className="col-span-1 lg:col-span-2">
                    <WidgetWrapper title="Largest Households" onRemove={() => handleRemoveWidget(id)} source="PCO Households">
                        <div className="space-y-3 max-h-64 overflow-y-auto custom-scrollbar">
                            {data.householdStats?.householdList?.slice(0, 10).map((h, i) => (
                                <div key={i} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center text-xs font-bold text-slate-500 dark:text-slate-400">
                                            {h.memberCount}
                                        </div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-900 dark:text-white">{h.name}</p>
                                            <p className="text-[10px] text-slate-400 truncate max-w-[200px]">
                                                {h.members.map(m => m.name.split(' ')[0]).join(', ')}
                                            </p>
                                        </div>
                                    </div>
                                    <a 
                                        href={`https://people.planningcenteronline.com/households/${h.id}`}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-[10px] font-bold text-indigo-500 hover:text-indigo-700 dark:text-indigo-400 dark:hover:text-indigo-300 uppercase tracking-widest"
                                    >
                                        View
                                    </a>
                                </div>
                            ))}
                        </div>
                    </WidgetWrapper>
                </div>
            );
        case 'zip':
            return (
                <div key="zip" className="col-span-1">
                    <WidgetWrapper title="Top Zip Codes" onRemove={() => handleRemoveWidget(id)} source="PCO Addresses">
                        <div className="h-64">
                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                <BarChart data={data.geoData.byZip} layout="vertical" margin={{ left: 10 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke={gridColor} />
                                    <XAxis type="number" hide />
                                    <YAxis dataKey="name" type="category" axisLine={false} tickLine={false} tick={{ fontSize: 10, fontWeight: 700, fill: axisColor }} width={50} />
                                    <Tooltip cursor={{fill: currentTheme === 'dark' ? '#334155' : '#f8fafc'}} contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} />
                                    <Bar dataKey="value" fill="#6366f1" radius={[0, 4, 4, 0]} barSize={20} />
                                </BarChart>
                            </ResponsiveContainer>
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
          <h3 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white">People Analytics</h3>
          <p className="text-slate-400 dark:text-slate-500 font-medium uppercase text-[10px] tracking-widest mt-1">Demographics & Engagement</p>
        </div>
        
        <div className="flex items-center gap-4">
            {onSync && (
                <button 
                    onClick={onSync}
                    disabled={isSyncing}
                    className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 font-black text-[10px] uppercase tracking-widest hover:bg-indigo-100 dark:hover:bg-indigo-900/30 transition-colors disabled:opacity-50"
                >
                    <span className={isSyncing ? 'animate-spin' : ''}>↻</span>
                    <span>{isSyncing ? 'Refresh from PCO' : 'Refresh from PCO'}</span>
                </button>
            )}

            <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl">
                <button onClick={() => setActiveTab('overview')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'overview' ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Overview</button>
                <button onClick={() => setActiveTab('households')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'households' ? 'bg-white dark:bg-slate-700 shadow-sm text-emerald-600 dark:text-emerald-300' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Households</button>
                <button onClick={() => setActiveTab('risk')} className={`px-6 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all ${activeTab === 'risk' ? 'bg-white dark:bg-slate-700 shadow-sm text-amber-600 dark:text-amber-300' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>Risk Profiles</button>
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

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-8">
          {safeVisibleWidgets.map(id => {
              if (id === 'people_stats' || id === 'householdSummary') return renderWidget(id);
              
              let spanClass = "col-span-1";
              if (id === 'map' || id === 'riskDistribution' || id === 'atRiskList' || id === 'householdList' || id === 'risk_factors' || id === 'benchmark_age') spanClass = "col-span-1 lg:col-span-2";
              if (id === 'people_directory') spanClass = "col-span-1 lg:col-span-4";
              
              return (
                  <div key={id} className={spanClass}>
                      {renderWidget(id)}
                  </div>
              );
          })}
          {safeVisibleWidgets.length === 0 && (
              <div className="col-span-full py-20 text-center bg-slate-50 dark:bg-slate-900 rounded-[3rem] border border-dashed border-slate-200 dark:border-slate-700">
                  <p className="text-slate-400 dark:text-slate-500 font-bold">No widgets configured for this tab.</p>
                  <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Use the "Customize Layout" button to add widgets.</p>
              </div>
          )}
      </div>
    </div>
  );
};
