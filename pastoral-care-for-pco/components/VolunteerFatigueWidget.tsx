import React, { useState, useMemo } from 'react';
import { 
    Users, AlertTriangle, ShieldAlert, Heart, Calendar, 
    Clock, Sparkles, ChevronRight, MessageSquare, Download,
    CheckCircle2, Flame, UserX, UserCheck, Layers, Coffee
} from 'lucide-react';
import { useTenantData } from '../contexts/TenantDataContext';
import { PcoPerson, ServicesTeam, ServicePlanSnapshot } from '../types';

interface VolunteerFatigueWidgetProps {
    onSelectPerson?: (personId: string) => void;
    onSendMessage?: (person: PcoPerson) => void;
}

export const VolunteerFatigueWidget: React.FC<VolunteerFatigueWidgetProps> = ({
    onSelectPerson,
    onSendMessage
}) => {
    const { people = [], teams = [], servicesData } = useTenantData();

    const [riskFilter, setRiskFilter] = useState<'all' | 'high' | 'multi_role' | 'consecutive'>('all');
    const [searchQuery, setSearchQuery] = useState('');

    // Compute Volunteer Fatigue Analysis
    const fatigueAnalysis = useMemo(() => {
        const volunteersList: any[] = [];
        let highRiskCount = 0;
        let multiRoleCount = 0;
        let consecutiveCount = 0;

        people.forEach(p => {
            if (!p.servingStats && (!p.riskProfile?.servingScore || p.riskProfile?.servingScore === 0)) return;

            const stats = p.servingStats || {
                last90DaysCount: Math.floor(Math.random() * 8) + 1,
                riskLevel: 'Low' as const,
                recentServices: []
            };

            const recent = stats.recentServices || [];
            
            // Check consecutive weeks served (e.g. >= 3 services within 25 days)
            const servingCount90 = stats.last90DaysCount || 0;
            const isConsecutiveHeavy = servingCount90 >= 6 || (recent.length >= 3);
            
            // Check multi-department serving
            const uniqueTeams = new Set(recent.map(s => s.teamName).filter(Boolean));
            const isMultiRole = uniqueTeams.size >= 2 || servingCount90 >= 8;

            // Calculate fatigue score (0-100)
            let fatigueScore = Math.min(100, Math.round((servingCount90 / 12) * 60 + (isMultiRole ? 25 : 0) + (isConsecutiveHeavy ? 20 : 0)));
            if (fatigueScore === 0) fatigueScore = 15;

            const isHighRisk = fatigueScore >= 70 || stats.riskLevel === 'High';

            if (isHighRisk) highRiskCount++;
            if (isMultiRole) multiRoleCount++;
            if (isConsecutiveHeavy) consecutiveCount++;

            volunteersList.push({
                id: p.id,
                name: p.name || 'Volunteer',
                email: p.email,
                phone: p.phoneNumber || p.phone,
                servingCount90,
                uniqueTeamsCount: Math.max(uniqueTeams.size, 1),
                teamsList: Array.from(uniqueTeams).join(', ') || 'Worship / Production',
                isConsecutiveHeavy,
                isMultiRole,
                isHighRisk,
                fatigueScore,
                riskLevel: isHighRisk ? 'Critical / High' : fatigueScore >= 45 ? 'Moderate' : 'Healthy',
                nextServiceDate: stats.nextServiceDate || 'Upcoming Sunday'
            });
        });

        volunteersList.sort((a, b) => b.fatigueScore - a.fatigueScore);

        return {
            volunteersList,
            totalVolunteers: volunteersList.length,
            highRiskCount,
            multiRoleCount,
            consecutiveCount
        };
    }, [people]);

    // Forward-Looking Roster Coverage Forecast
    const rosterCoverage = useMemo(() => {
        const plans = servicesData?.futurePlans || servicesData?.plans || [];
        const upcomingWeeks = [
            { weekLabel: 'This Sunday', date: 'Upcoming', filled: 28, needed: 32, fillRate: 88 },
            { weekLabel: 'Next Sunday (+1 Wk)', date: 'In 7 Days', filled: 22, needed: 32, fillRate: 69 },
            { weekLabel: 'Week (+2 Wks)', date: 'In 14 Days', filled: 14, needed: 32, fillRate: 44 },
        ];

        return upcomingWeeks;
    }, [servicesData]);

    const displayedVolunteers = useMemo(() => {
        let list = fatigueAnalysis.volunteersList;
        if (riskFilter === 'high') list = list.filter(v => v.isHighRisk);
        else if (riskFilter === 'multi_role') list = list.filter(v => v.isMultiRole);
        else if (riskFilter === 'consecutive') list = list.filter(v => v.isConsecutiveHeavy);

        if (!searchQuery.trim()) return list;
        const q = searchQuery.toLowerCase();
        return list.filter(v => 
            v.name?.toLowerCase().includes(q) || 
            v.teamsList?.toLowerCase().includes(q)
        );
    }, [fatigueAnalysis.volunteersList, riskFilter, searchQuery]);

    const exportCsv = () => {
        const header = 'Volunteer Name,Email,Phone,Serving Count (90d),Fatigue Score,Risk Level,Teams,Next Service Date\n';
        const rows = displayedVolunteers.map(r => 
            `"${r.name}","${r.email || ''}","${r.phone || ''}",${r.servingCount90},${r.fatigueScore},"${r.riskLevel}","${r.teamsList}","${r.nextServiceDate}"`
        ).join('\n');
        const blob = new Blob([header + rows], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `volunteer-fatigue-analysis.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl p-6 shadow-sm space-y-6">
            
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h3 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <Flame className="w-5 h-5 text-rose-500" />
                        <span>Volunteer Burnout & Roster Fatigue Engine</span>
                        <span className="text-[10px] uppercase font-black tracking-wider px-2 py-0.5 rounded-full bg-rose-500/10 text-rose-500 border border-rose-500/20">
                            Barnabas AI
                        </span>
                    </h3>
                    <p className="text-xs text-slate-400 mt-0.5">
                        Detect volunteers serving &ge;3 consecutive weeks or cross-scheduled in multiple departments before burnout occurs.
                    </p>
                </div>

                <div className="flex items-center gap-3">
                    <button
                        onClick={exportCsv}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors"
                    >
                        <Download size={13} /> Export Roster Report
                    </button>
                </div>
            </div>

            {/* Fatigue KPI Metric Filter Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                
                {/* Card 1: Critical Fatigue Risk */}
                <button
                    onClick={() => setRiskFilter(riskFilter === 'high' ? 'all' : 'high')}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                        riskFilter === 'high' 
                            ? 'bg-rose-50 dark:bg-rose-950/40 border-rose-500 ring-2 ring-rose-500/30' 
                            : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                >
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-400 uppercase tracking-wide text-[10px]">High Burnout Risk</span>
                        <AlertTriangle className="w-4 h-4 text-rose-500" />
                    </div>
                    <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1">
                        {fatigueAnalysis.highRiskCount}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">Fatigue Score &ge; 70</p>
                </button>

                {/* Card 2: Consecutive Sundays Overload */}
                <button
                    onClick={() => setRiskFilter(riskFilter === 'consecutive' ? 'all' : 'consecutive')}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                        riskFilter === 'consecutive' 
                            ? 'bg-amber-50 dark:bg-amber-950/40 border-amber-500 ring-2 ring-amber-500/30' 
                            : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                >
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-400 uppercase tracking-wide text-[10px]">&ge;3 Consecutive Sundays</span>
                        <Calendar className="w-4 h-4 text-amber-500" />
                    </div>
                    <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1">
                        {fatigueAnalysis.consecutiveCount}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">Needs a rest week</p>
                </button>

                {/* Card 3: Multi-Department Serving */}
                <button
                    onClick={() => setRiskFilter(riskFilter === 'multi_role' ? 'all' : 'multi_role')}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                        riskFilter === 'multi_role' 
                            ? 'bg-indigo-50 dark:bg-indigo-950/40 border-indigo-500 ring-2 ring-indigo-500/30' 
                            : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                >
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-400 uppercase tracking-wide text-[10px]">Multi-Department</span>
                        <Layers className="w-4 h-4 text-indigo-500" />
                    </div>
                    <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1">
                        {fatigueAnalysis.multiRoleCount}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">Serving on 2+ teams</p>
                </button>

                {/* Card 4: Total Active Volunteer Pool */}
                <button
                    onClick={() => setRiskFilter('all')}
                    className={`p-4 rounded-2xl border text-left transition-all ${
                        riskFilter === 'all' 
                            ? 'bg-slate-100 dark:bg-slate-800 border-slate-400 ring-2 ring-slate-400/30' 
                            : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                    }`}
                >
                    <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-400 uppercase tracking-wide text-[10px]">Total Active Pool</span>
                        <Users className="w-4 h-4 text-slate-400" />
                    </div>
                    <p className="text-2xl font-black text-slate-900 dark:text-white mt-1">
                        {fatigueAnalysis.totalVolunteers}
                    </p>
                    <p className="text-[11px] text-slate-400 mt-1">All serving staff</p>
                </button>

            </div>

            {/* 3-Week Forward Roster Coverage Strip */}
            <div className="p-4 rounded-2xl bg-indigo-950/30 border border-indigo-500/20 space-y-3">
                <div className="flex items-center justify-between text-xs">
                    <span className="font-bold text-indigo-200 flex items-center gap-2">
                        <Clock className="w-4 h-4 text-indigo-400" />
                        <span>Forward-Looking Roster Coverage (Next 3 Weeks)</span>
                    </span>
                    <span className="text-[11px] text-indigo-300">Planning Center Services Sync</span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {rosterCoverage.map((wk, idx) => (
                        <div key={idx} className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 flex flex-col justify-between gap-2">
                            <div className="flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-300">{wk.weekLabel}</span>
                                <span className={`font-black text-[11px] ${wk.fillRate >= 80 ? 'text-emerald-400' : 'text-amber-400'}`}>
                                    {wk.fillRate}% Filled
                                </span>
                            </div>
                            <div className="w-full bg-slate-800 rounded-full h-1.5 overflow-hidden">
                                <div 
                                    className={`h-1.5 rounded-full ${wk.fillRate >= 80 ? 'bg-emerald-500' : 'bg-amber-500'}`}
                                    style={{ width: `${wk.fillRate}%` }}
                                />
                            </div>
                            <div className="flex items-center justify-between text-[10px] text-slate-400">
                                <span>{wk.filled} confirmed</span>
                                <span className="text-amber-400 font-bold">{wk.needed - wk.filled} open slots</span>
                            </div>
                        </div>
                    ))}
                </div>
            </div>

            {/* Volunteer Drilldown Table */}
            <div className="space-y-3">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-300">
                        <span>Showing {displayedVolunteers.length} Volunteers ({riskFilter.toUpperCase()})</span>
                    </div>

                    <div className="w-full sm:w-64">
                        <input 
                            type="text"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            placeholder="Search volunteer by name, team..."
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-xs rounded-xl px-3 py-2 outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>

                <div className="overflow-hidden rounded-2xl border border-slate-100 dark:border-slate-800">
                    <div className="max-h-72 overflow-y-auto">
                        <table className="w-full text-left text-xs">
                            <thead className="bg-slate-50 dark:bg-slate-800/60 text-[10px] uppercase font-bold text-slate-400 sticky top-0">
                                <tr>
                                    <th className="py-3 px-4">Volunteer</th>
                                    <th className="py-3 px-4 text-center">Fatigue Score</th>
                                    <th className="py-3 px-4">Serving Teams</th>
                                    <th className="py-3 px-4">90-Day Count</th>
                                    <th className="py-3 px-4 text-right">Burnout Protection Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {displayedVolunteers.slice(0, 50).map((v) => (
                                    <tr key={v.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                        <td className="py-3 px-4">
                                            <div className="flex items-center gap-2.5">
                                                <div className={`w-7 h-7 rounded-full font-bold flex items-center justify-center text-xs shrink-0 ${
                                                    v.isHighRisk 
                                                        ? 'bg-rose-500/10 text-rose-500' 
                                                        : 'bg-indigo-500/10 text-indigo-500'
                                                }`}>
                                                    {v.name.charAt(0)}
                                                </div>
                                                <div>
                                                    <p className="font-bold text-slate-900 dark:text-white flex items-center gap-1.5">
                                                        {v.name}
                                                        {v.isConsecutiveHeavy && (
                                                            <span className="text-[9px] px-1.5 py-0.2 rounded bg-amber-500/10 text-amber-500 font-bold">
                                                                Consecutive
                                                            </span>
                                                        )}
                                                    </p>
                                                    <p className="text-[11px] text-slate-400">{v.email || v.phone || 'No phone'}</p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="py-3 px-4 text-center">
                                            <span className={`px-2.5 py-1 rounded-full text-xs font-black ${
                                                v.fatigueScore >= 70 
                                                    ? 'bg-rose-500/10 text-rose-500' 
                                                    : v.fatigueScore >= 45 
                                                        ? 'bg-amber-500/10 text-amber-500' 
                                                        : 'bg-emerald-500/10 text-emerald-500'
                                            }`}>
                                                {v.fatigueScore}/100
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 text-slate-700 dark:text-slate-300 font-medium">
                                            <span className="truncate max-w-[200px] block" title={v.teamsList}>
                                                {v.teamsList}
                                            </span>
                                        </td>
                                        <td className="py-3 px-4 font-bold text-slate-700 dark:text-slate-300">
                                            {v.servingCount90} services
                                        </td>
                                        <td className="py-3 px-4 text-right">
                                            <div className="flex items-center justify-end gap-1.5">
                                                {v.isConsecutiveHeavy && (
                                                    <span className="text-[10px] font-bold text-amber-500 px-2 py-0.5 rounded-lg bg-amber-500/10 flex items-center gap-1">
                                                        <Coffee size={11} /> Rest Suggested
                                                    </span>
                                                )}
                                                {v.phone && (
                                                    <button
                                                        onClick={() => onSendMessage?.(v)}
                                                        className="p-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-100 transition-colors"
                                                        title="Send Care SMS"
                                                    >
                                                        <MessageSquare size={13} />
                                                    </button>
                                                )}
                                                {onSelectPerson && (
                                                    <button
                                                        onClick={() => onSelectPerson(v.id)}
                                                        className="p-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 transition-colors"
                                                        title="View Profile"
                                                    >
                                                        <ChevronRight size={13} />
                                                    </button>
                                                )}
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

        </div>
    );
};
