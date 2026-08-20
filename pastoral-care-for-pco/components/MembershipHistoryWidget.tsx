import React, { useState, useMemo } from 'react';
import { PcoPerson, StatusChangeRecord, MembershipTimeFilter } from '../types';
import { calculateMembershipHistory } from '../services/analyticsService';
import { 
    AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
    Tooltip, ResponsiveContainer, Legend, ComposedChart, Line
} from 'recharts';
import { 
    TrendingUp, TrendingDown, Users, UserPlus, UserMinus, ShieldCheck, 
    Calendar, Download, Search, Filter, ArrowRight, Activity, PieChart as PieIcon,
    RefreshCw
} from 'lucide-react';

interface MembershipHistoryWidgetProps {
    people: PcoPerson[];
    statusChanges?: StatusChangeRecord[];
    currentTheme?: 'traditional' | 'dark';
    onPersonClick?: (personId: string) => void;
}

export const MembershipHistoryWidget: React.FC<MembershipHistoryWidgetProps> = ({
    people,
    statusChanges = [],
    currentTheme = 'traditional',
    onPersonClick
}) => {
    const [timeFilter, setTimeFilter] = useState<MembershipTimeFilter>('1y');
    const [activeTab, setActiveTab] = useState<'trends' | 'transitions' | 'breakdown'>('trends');
    const [searchQuery, setSearchQuery] = useState('');
    const [typeFilter, setTypeFilter] = useState<'all' | 'joined' | 'departed' | 'status_change'>('all');

    const historyData = useMemo(() => {
        return calculateMembershipHistory(people, statusChanges, timeFilter);
    }, [people, statusChanges, timeFilter]);

    const isDark = currentTheme === 'dark';
    const gridColor = isDark ? '#334155' : '#f1f5f9';
    const axisColor = isDark ? '#94a3b8' : '#64748b';

    const tooltipStyle = {
        borderRadius: '12px',
        border: 'none',
        backgroundColor: '#1e293b',
        color: '#fff',
        boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
        fontSize: '12px'
    };

    const filteredTransitions = useMemo(() => {
        return historyData.transitions.filter(t => {
            const matchesSearch = !searchQuery || 
                t.personName.toLowerCase().includes(searchQuery.toLowerCase()) ||
                (t.oldValue || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
                (t.newValue || '').toLowerCase().includes(searchQuery.toLowerCase());
            
            const matchesType = typeFilter === 'all' || t.type === typeFilter;
            return matchesSearch && matchesType;
        });
    }, [historyData.transitions, searchQuery, typeFilter]);

    const handleExportCsv = () => {
        const headers = ['Date', 'Person ID', 'Person Name', 'Type', 'Previous Status', 'New Status'];
        const rows = historyData.transitions.map(t => [
            t.date ? new Date(t.date).toISOString().split('T')[0] : '',
            t.personId,
            `"${(t.personName || '').replace(/"/g, '""')}"`,
            t.type,
            `"${(t.oldValue || '').replace(/"/g, '""')}"`,
            `"${(t.newValue || '').replace(/"/g, '""')}"`
        ]);

        const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
        const encodedUri = encodeURI(csvContent);
        const link = document.createElement('a');
        link.setAttribute('href', encodedUri);
        link.setAttribute('download', `membership_changes_${timeFilter}_${new Date().toISOString().split('T')[0]}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm overflow-hidden flex flex-col">
            {/* Header & Controls */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-700/60 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <div className="flex items-center gap-2">
                        <span className="p-2 bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 rounded-xl">
                            <Users size={18} />
                        </span>
                        <div>
                            <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                                Membership Over Time
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Track member growth, additions, departures, and retention trends
                            </p>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                    {/* Time Range Selector */}
                    <div className="flex bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                        {(['3m', '6m', '1y', '3y', 'all'] as MembershipTimeFilter[]).map(filter => (
                            <button
                                key={filter}
                                onClick={() => setTimeFilter(filter)}
                                className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all ${
                                    timeFilter === filter
                                        ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                        : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                }`}
                            >
                                {filter === '3m' ? '3M' : filter === '6m' ? '6M' : filter === '1y' ? '1Y' : filter === '3y' ? '3Y' : 'All'}
                            </button>
                        ))}
                    </div>

                    {/* View Switcher */}
                    <div className="flex bg-slate-100 dark:bg-slate-900/80 p-1 rounded-xl border border-slate-200/60 dark:border-slate-700/60">
                        <button
                            onClick={() => setActiveTab('trends')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                activeTab === 'trends'
                                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <Activity size={13} />
                            <span>Growth Curve</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('transitions')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                activeTab === 'transitions'
                                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <RefreshCw size={13} />
                            <span>Transitions ({historyData.transitions.length})</span>
                        </button>
                        <button
                            onClick={() => setActiveTab('breakdown')}
                            className={`px-3 py-1 rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 ${
                                activeTab === 'breakdown'
                                    ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                            }`}
                        >
                            <PieIcon size={13} />
                            <span>Flow Types</span>
                        </button>
                    </div>

                    {/* CSV Export Button */}
                    <button
                        onClick={handleExportCsv}
                        title="Export Membership Changes to CSV"
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 rounded-xl text-xs font-bold transition flex items-center gap-1.5"
                    >
                        <Download size={13} />
                        <span className="hidden sm:inline">Export</span>
                    </button>
                </div>
            </div>

            {/* Headline Metric Summary Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-6 bg-slate-50/50 dark:bg-slate-900/30 border-b border-slate-100 dark:border-slate-700/60">
                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                        <span>Total Members</span>
                        <Users size={14} className="text-indigo-500" />
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">
                        {historyData.stats.currentMembers.toLocaleString()}
                    </div>
                    <div className="flex items-center gap-1 mt-1 text-[11px] font-bold">
                        {historyData.stats.netGrowthInPeriod >= 0 ? (
                            <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-0.5">
                                <TrendingUp size={12} />
                                +{historyData.stats.netGrowthInPeriod} ({historyData.stats.netGrowthRatePercent >= 0 ? `+${historyData.stats.netGrowthRatePercent}%` : `${historyData.stats.netGrowthRatePercent}%`})
                            </span>
                        ) : (
                            <span className="text-rose-600 dark:text-rose-400 flex items-center gap-0.5">
                                <TrendingDown size={12} />
                                {historyData.stats.netGrowthInPeriod} ({historyData.stats.netGrowthRatePercent}%)
                            </span>
                        )}
                        <span className="text-slate-400 font-normal">in period</span>
                    </div>
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                        <span>Joined</span>
                        <UserPlus size={14} className="text-emerald-500" />
                    </div>
                    <div className="text-2xl font-black text-emerald-600 dark:text-emerald-400">
                        +{historyData.stats.joinedInPeriod.toLocaleString()}
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium mt-1">
                        New members added
                    </p>
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                        <span>Departures</span>
                        <UserMinus size={14} className="text-rose-500" />
                    </div>
                    <div className="text-2xl font-black text-rose-600 dark:text-rose-400">
                        -{historyData.stats.departedInPeriod.toLocaleString()}
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium mt-1">
                        Status / membership transitions
                    </p>
                </div>

                <div className="p-4 rounded-xl bg-white dark:bg-slate-800 border border-slate-200/80 dark:border-slate-700/80 shadow-xs">
                    <div className="flex items-center justify-between text-slate-500 dark:text-slate-400 text-[11px] font-bold uppercase tracking-wider mb-1">
                        <span>Retention Rate</span>
                        <ShieldCheck size={14} className="text-indigo-500" />
                    </div>
                    <div className="text-2xl font-black text-indigo-600 dark:text-indigo-400">
                        {historyData.stats.retentionRatePercent}%
                    </div>
                    <p className="text-[11px] text-slate-400 font-medium mt-1">
                        Member stability index
                    </p>
                </div>
            </div>

            {/* Tab 1: Growth Curve & Monthly Flow */}
            {activeTab === 'trends' && (
                <div className="p-6 space-y-6">
                    <div>
                        <div className="flex justify-between items-center mb-3">
                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                Cumulative Members & Monthly Net Movement
                            </h4>
                            <div className="flex items-center gap-4 text-xs font-bold">
                                <span className="flex items-center gap-1 text-indigo-600 dark:text-indigo-400">
                                    <span className="w-3 h-3 rounded-full bg-indigo-600 inline-block" /> Active Members
                                </span>
                                <span className="flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                                    <span className="w-3 h-3 rounded-sm bg-emerald-500 inline-block" /> Joined
                                </span>
                                <span className="flex items-center gap-1 text-rose-500">
                                    <span className="w-3 h-3 rounded-sm bg-rose-500 inline-block" /> Departed
                                </span>
                            </div>
                        </div>

                        <div className="h-72 w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <ComposedChart data={historyData.chartPoints} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="memberGrowthGrad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#6366f1" stopOpacity={0.3}/>
                                            <stop offset="95%" stopColor="#6366f1" stopOpacity={0.0}/>
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} />
                                    <XAxis 
                                        dataKey="month" 
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fontSize: 10, fill: axisColor }} 
                                    />
                                    <YAxis 
                                        yAxisId="left"
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fontSize: 10, fill: axisColor }} 
                                    />
                                    <YAxis 
                                        yAxisId="right" 
                                        orientation="right"
                                        axisLine={false} 
                                        tickLine={false} 
                                        tick={{ fontSize: 10, fill: axisColor }} 
                                    />
                                    <Tooltip contentStyle={tooltipStyle} />
                                    <Bar yAxisId="right" dataKey="joined" name="Joined" fill="#10b981" radius={[3, 3, 0, 0]} maxBarSize={20} />
                                    <Bar yAxisId="right" dataKey="departed" name="Departed" fill="#f43f5e" radius={[3, 3, 0, 0]} maxBarSize={20} />
                                    <Area 
                                        yAxisId="left"
                                        type="monotone" 
                                        dataKey="totalMembers" 
                                        name="Total Members"
                                        stroke="#6366f1" 
                                        strokeWidth={3}
                                        fillOpacity={1} 
                                        fill="url(#memberGrowthGrad)" 
                                    />
                                </ComposedChart>
                            </ResponsiveContainer>
                        </div>
                    </div>

                    {/* Monthly Details Table */}
                    <div className="border border-slate-100 dark:border-slate-700/60 rounded-xl overflow-hidden">
                        <div className="max-h-48 overflow-y-auto custom-scrollbar">
                            <table className="w-full text-left text-xs">
                                <thead className="bg-slate-50 dark:bg-slate-900/60 text-slate-400 font-bold uppercase text-[10px] tracking-wider sticky top-0">
                                    <tr>
                                        <th className="py-2.5 px-4">Month</th>
                                        <th className="py-2.5 px-4 text-right">Active Members</th>
                                        <th className="py-2.5 px-4 text-right text-emerald-600 dark:text-emerald-400">+ Joined</th>
                                        <th className="py-2.5 px-4 text-right text-rose-500">- Departed</th>
                                        <th className="py-2.5 px-4 text-right">Net Change</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-700/60 text-slate-700 dark:text-slate-300">
                                    {historyData.chartPoints.slice().reverse().map((pt, idx) => (
                                        <tr key={idx} className="hover:bg-slate-50/60 dark:hover:bg-slate-700/30 transition">
                                            <td className="py-2 px-4 font-semibold text-slate-900 dark:text-white">{pt.month}</td>
                                            <td className="py-2 px-4 text-right font-black">{pt.totalMembers.toLocaleString()}</td>
                                            <td className="py-2 px-4 text-right font-bold text-emerald-600 dark:text-emerald-400">+{pt.joined}</td>
                                            <td className="py-2 px-4 text-right font-bold text-rose-500">-{pt.departed}</td>
                                            <td className="py-2 px-4 text-right font-bold">
                                                {pt.netChange > 0 ? (
                                                    <span className="text-emerald-600 dark:text-emerald-400">+{pt.netChange}</span>
                                                ) : pt.netChange < 0 ? (
                                                    <span className="text-rose-500">{pt.netChange}</span>
                                                ) : (
                                                    <span className="text-slate-400">0</span>
                                                )}
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 2: Individual Transitions Log */}
            {activeTab === 'transitions' && (
                <div className="p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="relative flex-1 max-w-sm">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                placeholder="Search by person or status…"
                                className="w-full pl-9 pr-3 py-1.5 rounded-xl text-xs bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        <div className="flex items-center gap-1.5">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mr-1">Filter:</span>
                            {(['all', 'joined', 'departed', 'status_change'] as const).map(type => (
                                <button
                                    key={type}
                                    onClick={() => setTypeFilter(type)}
                                    className={`px-2.5 py-1 rounded-lg text-xs font-bold capitalize transition ${
                                        typeFilter === type
                                            ? 'bg-indigo-50 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 border border-indigo-200 dark:border-indigo-800'
                                            : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                    }`}
                                >
                                    {type === 'status_change' ? 'Other Changes' : type}
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="border border-slate-100 dark:border-slate-700/60 rounded-xl overflow-hidden">
                        <div className="max-h-96 overflow-y-auto custom-scrollbar divide-y divide-slate-100 dark:divide-slate-700/60">
                            {filteredTransitions.map(t => (
                                <div 
                                    key={t.id}
                                    onClick={() => onPersonClick?.(t.personId)}
                                    className="p-3.5 flex items-center justify-between gap-4 hover:bg-slate-50/80 dark:hover:bg-slate-700/30 transition cursor-pointer"
                                >
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs shrink-0 ${
                                            t.type === 'joined'
                                                ? 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300'
                                                : t.type === 'departed'
                                                ? 'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300'
                                                : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300'
                                        }`}>
                                            {t.type === 'joined' ? '+' : t.type === 'departed' ? '-' : '•'}
                                        </div>
                                        <div className="min-w-0">
                                            <div className="text-xs font-bold text-slate-900 dark:text-white truncate">
                                                {t.personName}
                                            </div>
                                            <div className="flex items-center gap-1.5 text-[11px] text-slate-400 mt-0.5">
                                                <span className="font-medium">{t.oldValue || 'None'}</span>
                                                <ArrowRight size={11} className="text-slate-300" />
                                                <span className="font-bold text-slate-700 dark:text-slate-300">{t.newValue || 'None'}</span>
                                            </div>
                                        </div>
                                    </div>

                                    <div className="text-right shrink-0">
                                        <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider ${
                                            t.type === 'joined'
                                                ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400'
                                                : t.type === 'departed'
                                                ? 'bg-rose-50 dark:bg-rose-900/30 text-rose-600 dark:text-rose-400'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                                        }`}>
                                            {t.type === 'joined' ? 'Joined Member' : t.type === 'departed' ? 'Transitioned Away' : 'Status Updated'}
                                        </span>
                                        <div className="text-[10px] text-slate-400 mt-1">
                                            {t.date ? new Date(t.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '—'}
                                        </div>
                                    </div>
                                </div>
                            ))}

                            {filteredTransitions.length === 0 && (
                                <div className="p-8 text-center text-slate-400 text-xs">
                                    No membership transitions found matching your filter criteria.
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* Tab 3: Flow Types Breakdown */}
            {activeTab === 'breakdown' && (
                <div className="p-6 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-2">
                        Membership Transition Pathways
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Inflow Pathways */}
                        <div className="p-4 rounded-xl bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-100 dark:border-emerald-900/40">
                            <div className="flex items-center gap-2 mb-3 text-emerald-800 dark:text-emerald-300 font-bold text-xs">
                                <UserPlus size={15} />
                                <span>Member Inflows (Additions)</span>
                            </div>
                            <div className="space-y-2">
                                {historyData.breakdowns.filter(b => b.type === 'inflow').map((b, i) => (
                                    <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-white dark:bg-slate-800 text-xs border border-emerald-100 dark:border-emerald-900/30">
                                        <span className="font-medium text-slate-700 dark:text-slate-300">{b.name}</span>
                                        <span className="font-black text-emerald-600 dark:text-emerald-400">+{b.count}</span>
                                    </div>
                                ))}
                                {historyData.breakdowns.filter(b => b.type === 'inflow').length === 0 && (
                                    <p className="text-xs text-slate-400 italic">No inflow transitions recorded.</p>
                                )}
                            </div>
                        </div>

                        {/* Outflow Pathways */}
                        <div className="p-4 rounded-xl bg-rose-50/50 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40">
                            <div className="flex items-center gap-2 mb-3 text-rose-800 dark:text-rose-300 font-bold text-xs">
                                <UserMinus size={15} />
                                <span>Member Outflows (Departures)</span>
                            </div>
                            <div className="space-y-2">
                                {historyData.breakdowns.filter(b => b.type === 'outflow').map((b, i) => (
                                    <div key={i} className="flex justify-between items-center p-2 rounded-lg bg-white dark:bg-slate-800 text-xs border border-rose-100 dark:border-rose-900/30">
                                        <span className="font-medium text-slate-700 dark:text-slate-300">{b.name}</span>
                                        <span className="font-black text-rose-600 dark:text-rose-400">-{b.count}</span>
                                    </div>
                                ))}
                                {historyData.breakdowns.filter(b => b.type === 'outflow').length === 0 && (
                                    <p className="text-xs text-slate-400 italic">No outflow transitions recorded.</p>
                                )}
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
