import React, { useState, useMemo } from 'react';
import { PcoPerson, DetailedDonation, PcoGroup, ServicesDashboardData, PcoCheckInRecord } from '../types';
import { calculateCohorts, CohortFilterConfig } from '../services/cohortService';
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

interface CohortAnalyticsProps {
    people: PcoPerson[];
    donations: DetailedDonation[];
    groups: PcoGroup[];
    services: ServicesDashboardData | null;
    checkIns: PcoCheckInRecord[];
}

export const CohortAnalytics: React.FC<CohortAnalyticsProps> = ({
    people,
    donations,
    groups,
    services,
    checkIns
}) => {
    // Config filters
    const [config, setConfig] = useState<CohortFilterConfig>({
        includeCheckIns: true,
        includeGiving: true,
        includeGroups: true,
        includeServing: true
    });

    // Drill-down selected cohort
    const [selectedCohortName, setSelectedCohortName] = useState<string | null>(null);

    // Calculate cohorts based on active configuration
    const cohorts = useMemo(() => {
        return calculateCohorts(people, donations, groups, services, checkIns, config);
    }, [people, donations, groups, services, checkIns, config]);

    // Default visible lines (show most recent 5 active cohorts in the line chart)
    const [visibleLineCohorts, setVisibleLineCohorts] = useState<Record<string, boolean>>({});

    const toggleLineCohort = (name: string) => {
        setVisibleLineCohorts(prev => ({
            ...prev,
            [name]: !prev[name]
        }));
    };

    // Calculate aggregated metrics
    const metrics = useMemo(() => {
        if (cohorts.length === 0) return { avgSize: 0, m1: 0, m3: 0, m6: 0 };
        
        let totalSize = 0;
        let sumM1 = 0;
        let sumM3 = 0;
        let sumM6 = 0;
        let countM1 = 0;
        let countM3 = 0;
        let countM6 = 0;

        cohorts.forEach(c => {
            totalSize += c.cohortSize;
            
            // Month 1
            const m1Pt = c.retention.find(p => p.monthIndex === 1);
            if (m1Pt) {
                sumM1 += m1Pt.percentage;
                countM1++;
            }
            // Month 3
            const m3Pt = c.retention.find(p => p.monthIndex === 3);
            if (m3Pt) {
                sumM3 += m3Pt.percentage;
                countM3++;
            }
            // Month 6
            const m6Pt = c.retention.find(p => p.monthIndex === 6);
            if (m6Pt) {
                sumM6 += m6Pt.percentage;
                countM6++;
            }
        });

        return {
            avgSize: Math.round(totalSize / cohorts.length),
            m1: countM1 > 0 ? Math.round(sumM1 / countM1) : 0,
            m3: countM3 > 0 ? Math.round(sumM3 / countM3) : 0,
            m6: countM6 > 0 ? Math.round(sumM6 / countM6) : 0
        };
    }, [cohorts]);

    // Prepare line chart data: Month index vs percentage for selected cohorts
    const chartData = useMemo(() => {
        const points = [];
        for (let m = 0; m <= 12; m++) {
            const dataPoint: any = { monthIndex: m, name: `Month ${m}` };
            cohorts.forEach(c => {
                const isVisible = visibleLineCohorts[c.cohortName] ?? true;
                if (isVisible) {
                    const pt = c.retention.find(p => p.monthIndex === m);
                    if (pt) {
                        dataPoint[c.cohortName] = pt.percentage;
                    }
                }
            });
            points.push(dataPoint);
        }
        return points;
    }, [cohorts, visibleLineCohorts]);

    // Colors for Recharts lines
    const lineColors = ['#6366f1', '#10b981', '#ec4899', '#f59e0b', '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'];

    // Retrieve selected cohort details
    const activeCohortDetails = useMemo(() => {
        if (!selectedCohortName) return null;
        const cohort = cohorts.find(c => c.cohortName === selectedCohortName);
        if (!cohort) return null;

        const cohortPeople = people
            .filter(p => cohort.peopleIds.includes(p.id))
            .map(p => {
                // Determine current status or activity indicators
                return {
                    id: p.id,
                    name: p.name,
                    membership: p.membership || 'Visitor',
                    riskCategory: p.riskProfile?.category || 'Disconnected',
                    riskScore: p.riskProfile?.score || 0,
                    checkIns: p.checkInCount || 0
                };
            });

        return {
            name: cohort.cohortName,
            size: cohort.cohortSize,
            people: cohortPeople
        };
    }, [selectedCohortName, cohorts, people]);

    return (
        <div className="space-y-6">
            {/* Control Filters */}
            <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-3xl p-5 flex flex-wrap gap-6 items-center justify-between shadow-sm">
                <div className="space-y-1">
                    <h4 className="text-xs font-black uppercase text-slate-400 tracking-wider">Cohort Activity Signals</h4>
                    <p className="text-[10px] text-slate-500">Select which interactions mark a member as &quot;active&quot; during a month.</p>
                </div>
                <div className="flex flex-wrap gap-4">
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={config.includeCheckIns}
                            onChange={(e) => setConfig(prev => ({ ...prev, includeCheckIns: e.target.checked }))}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        Check-ins
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={config.includeGiving}
                            onChange={(e) => setConfig(prev => ({ ...prev, includeGiving: e.target.checked }))}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        Giving
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={config.includeGroups}
                            onChange={(e) => setConfig(prev => ({ ...prev, includeGroups: e.target.checked }))}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        Small Groups
                    </label>
                    <label className="flex items-center gap-2 text-xs font-bold text-slate-600 dark:text-slate-300 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={config.includeServing}
                            onChange={(e) => setConfig(prev => ({ ...prev, includeServing: e.target.checked }))}
                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950"
                        />
                        Serving
                    </label>
                </div>
            </div>

            {/* Overview Stats */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total Cohorts</span>
                    <span className="text-3xl font-black text-slate-900 dark:text-white mt-2">{cohorts.length}</span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Avg Month 1 Retention</span>
                    <span className="text-3xl font-black text-rose-500 mt-2">{metrics.m1}%</span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Avg Month 3 Retention</span>
                    <span className="text-3xl font-black text-amber-500 mt-2">{metrics.m3}%</span>
                </div>
                <div className="bg-white dark:bg-slate-900 p-5 rounded-3xl border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col justify-between">
                    <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Avg Month 6 Retention</span>
                    <span className="text-3xl font-black text-emerald-500 mt-2">{metrics.m6}%</span>
                </div>
            </div>

            {/* Heatmap Grid & Line Chart Tabs */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
                
                {/* Cohort Heatmap table */}
                <div className="xl:col-span-2 bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm overflow-hidden flex flex-col">
                    <div className="flex items-center justify-between mb-4">
                        <div>
                            <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">Retention Heatmap</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">Click a cohort row to view the members list</p>
                        </div>
                    </div>
                    <div className="overflow-x-auto no-scrollbar">
                        <table className="w-full text-left border-collapse text-xs">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-850">
                                    <th className="py-2.5 font-black uppercase text-slate-400 text-[10px] min-w-[100px]">Cohort</th>
                                    <th className="py-2.5 font-black uppercase text-slate-400 text-[10px] text-center min-w-[50px]">Size</th>
                                    {Array.from({ length: 13 }).map((_, i) => (
                                        <th key={i} className="py-2.5 font-black uppercase text-slate-400 text-[10px] text-center min-w-[42px]">M{i}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                {cohorts.map((cohort) => (
                                    <tr 
                                        key={cohort.startDate}
                                        onClick={() => setSelectedCohortName(cohort.cohortName)}
                                        className={`border-b border-slate-50 dark:border-slate-850 hover:bg-slate-50 dark:hover:bg-slate-900/50 cursor-pointer transition-colors ${
                                            selectedCohortName === cohort.cohortName ? 'bg-indigo-50/30 dark:bg-indigo-950/20' : ''
                                        }`}
                                    >
                                        <td className="py-3 font-bold text-slate-700 dark:text-slate-300">{cohort.cohortName}</td>
                                        <td className="py-3 font-bold text-slate-500 text-center">{cohort.cohortSize}</td>
                                        {cohort.retention.map((point) => {
                                            const bgOpacity = point.percentage / 100;
                                            const textDark = point.percentage > 45;
                                            return (
                                                <td 
                                                    key={point.monthIndex} 
                                                    style={{ 
                                                        backgroundColor: `rgba(99, 102, 241, ${bgOpacity})`,
                                                        color: textDark ? '#ffffff' : 'inherit'
                                                    }}
                                                    className={`py-3 text-center font-black rounded-lg transition-all ${
                                                        textDark ? 'shadow-sm font-black' : 'text-slate-600 dark:text-slate-450'
                                                    }`}
                                                >
                                                    {point.percentage}%
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>

                {/* Legend & Toggles for chart */}
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm flex flex-col justify-between">
                    <div>
                        <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight mb-1">Visual Curves</h3>
                        <p className="text-[10px] text-slate-450 mb-4 uppercase tracking-wider font-bold">Toggle cohorts to display in chart</p>
                        <div className="space-y-2 max-h-[300px] overflow-y-auto pr-2 no-scrollbar">
                            {cohorts.map((c, i) => {
                                const isVisible = visibleLineCohorts[c.cohortName] ?? true;
                                const color = lineColors[i % lineColors.length];
                                return (
                                    <button
                                        key={c.cohortName}
                                        onClick={() => toggleLineCohort(c.cohortName)}
                                        className={`w-full flex items-center justify-between p-2.5 rounded-2xl border text-xs font-bold transition-all ${
                                            isVisible 
                                                ? 'bg-slate-50/50 border-slate-100 dark:bg-slate-850/50 dark:border-slate-800' 
                                                : 'bg-white border-dashed border-slate-200 opacity-40 text-slate-400 dark:bg-slate-950 dark:border-slate-900'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2">
                                            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }}></div>
                                            <span>{c.cohortName}</span>
                                        </div>
                                        <span className="text-[10px] font-black text-slate-400">{c.cohortSize} members</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>
                </div>
            </div>

            {/* Line Chart Visualizer */}
            {cohorts.length > 0 && (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-100 dark:border-slate-800 p-6 shadow-sm">
                    <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight mb-4">Retention Curves (Month 0 to Month 12)</h3>
                    <div className="h-[300px] w-full">
                        <ResponsiveContainer width="100%" height="100%">
                            <LineChart data={chartData} margin={{ left: -20, right: 10, top: 10, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                                <XAxis dataKey="name" stroke="#94a3b8" fontSize={10} fontWeight="bold" />
                                <YAxis stroke="#94a3b8" fontSize={10} fontWeight="bold" domain={[0, 100]} tickFormatter={(v) => `${v}%`} />
                                <Tooltip 
                                    contentStyle={{ 
                                        borderRadius: '12px',
                                        backgroundColor: '#1e293b',
                                        border: 'none',
                                        color: '#fff',
                                        fontSize: '11px',
                                        fontWeight: 'bold',
                                        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
                                    }}
                                />
                                {cohorts.map((c, i) => {
                                    const isVisible = visibleLineCohorts[c.cohortName] ?? true;
                                    if (!isVisible) return null;
                                    return (
                                        <Line
                                            key={c.cohortName}
                                            type="monotone"
                                            dataKey={c.cohortName}
                                            stroke={lineColors[i % lineColors.length]}
                                            strokeWidth={3}
                                            dot={{ r: 4, strokeWidth: 1 }}
                                            activeDot={{ r: 6 }}
                                        />
                                    );
                                })}
                            </LineChart>
                        </ResponsiveContainer>
                    </div>
                </div>
            )}

            {/* Drill-down Drawer/Panel */}
            {activeCohortDetails && (
                <div className="bg-slate-50 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 rounded-3xl p-6 shadow-sm animate-in fade-in slide-in-from-bottom-4 duration-300">
                    <div className="flex items-center justify-between mb-4 border-b border-slate-100 dark:border-slate-800 pb-3">
                        <div>
                            <h3 className="text-base font-black text-slate-900 dark:text-white">Cohort Details: {activeCohortDetails.name}</h3>
                            <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">{activeCohortDetails.size} Total Profiles Registered</p>
                        </div>
                        <button 
                            onClick={() => setSelectedCohortName(null)}
                            className="px-3 py-1.5 bg-white border border-slate-200 dark:bg-slate-950 dark:border-slate-800 rounded-xl text-[10px] font-bold text-slate-500 hover:text-slate-700 transition-all"
                        >
                            Close Details
                        </button>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 max-h-[350px] overflow-y-auto pr-2 no-scrollbar">
                        {activeCohortDetails.people.map(person => {
                            let riskBadgeColor = 'bg-slate-100 text-slate-650';
                            if (person.riskCategory === 'Healthy' || person.riskCategory === 'Thriving') {
                                riskBadgeColor = 'bg-emerald-50 text-emerald-600 border border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/30';
                            } else if (person.riskCategory === 'At Risk' || person.riskCategory === 'Warning') {
                                riskBadgeColor = 'bg-amber-50 text-amber-600 border border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/30';
                            } else if (person.riskCategory === 'Disconnected' || person.riskCategory === 'Critical') {
                                riskBadgeColor = 'bg-rose-50 text-rose-600 border border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/30';
                            }

                            return (
                                <div 
                                    key={person.id}
                                    className="bg-white dark:bg-slate-950 p-4 rounded-2xl border border-slate-100 dark:border-slate-850 shadow-sm flex items-center justify-between"
                                >
                                    <div className="space-y-1">
                                        <p className="text-xs font-black text-slate-800 dark:text-slate-200">{person.name}</p>
                                        <p className="text-[9px] font-bold uppercase tracking-widest text-slate-400">{person.membership}</p>
                                    </div>
                                    <div className="text-right space-y-1.5">
                                        <span className={`px-2 py-0.5 rounded text-[8px] font-black uppercase tracking-widest ${riskBadgeColor}`}>
                                            {person.riskCategory}
                                        </span>
                                        <p className="text-[9px] text-slate-450 font-bold">Total Check-ins: {person.checkIns}</p>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}
        </div>
    );
};
