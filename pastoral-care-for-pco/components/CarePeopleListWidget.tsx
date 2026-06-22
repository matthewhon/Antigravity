import React, { useState, useMemo } from 'react';
import { PcoPerson, PeopleDashboardData, RiskSettings } from '../types';
import { DEFAULT_RISK_SETTINGS } from '../services/riskService';
import { WidgetWrapper } from './SharedUI';

/** Format a ISO date string as "Mon DD" (e.g. "Jun 22"). Returns null if invalid. */
const formatMonthDay = (dateStr?: string | null): string | null => {
    if (!dateStr) return null;
    // Parse as local date to avoid timezone shifts on date-only strings
    const parts = dateStr.split('-');
    if (parts.length < 2) return null;
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2] || '1', 10);
    const d = new Date(2000, month, day);
    if (isNaN(d.getTime())) return null;
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

/** Returns true if the month/day of the given date falls within the next `days` calendar days. */
const isUpcomingAnnual = (dateStr?: string | null, withinDays = 30): boolean => {
    if (!dateStr) return false;
    const parts = dateStr.split('-');
    if (parts.length < 2) return false;
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2] || '1', 10);
    const today = new Date();
    const thisYear = today.getFullYear();
    let upcoming = new Date(thisYear, month, day);
    // If already passed this year, check next year
    if (upcoming < today) upcoming = new Date(thisYear + 1, month, day);
    const diffMs = upcoming.getTime() - today.getTime();
    return diffMs >= 0 && diffMs <= withinDays * 86400000;
};

interface CarePeopleListWidgetProps {
    peopleData: PeopleDashboardData | null;
    settings: RiskSettings;
    onRemove: () => void;
    currentTheme?: 'traditional' | 'dark';
}

export const CarePeopleListWidget: React.FC<CarePeopleListWidgetProps> = ({
    peopleData,
    settings,
    onRemove,
    currentTheme
}) => {
    const [page, setPage] = useState(1);
    const [memberStatusFilter, setMemberStatusFilter] = useState<string>('All');
    const itemsPerPage = 20;

    const filteredPeople = useMemo(() => {
        if (!peopleData) return [];
        let list = peopleData.allPeople.filter(p => {
            // Filter out 'inactive' status from Planning Center
            if (p.status?.toLowerCase() === 'inactive') return false;
            
            // Filter by member status
            if (memberStatusFilter !== 'All') {
                const pMem = p.membership || 'None';
                if (pMem !== memberStatusFilter) return false;
            }
            return true;
        });

        // Sort by risk score (lowest first) or name
        list.sort((a, b) => {
            const scoreA = a.riskProfile?.score ?? 0;
            const scoreB = b.riskProfile?.score ?? 0;
            if (scoreA !== scoreB) return scoreA - scoreB;
            return (a.name || '').localeCompare(b.name || '');
        });

        return list;
    }, [peopleData, memberStatusFilter]);

    // Derive unique membership statuses for the filter
    const memberStatuses = useMemo(() => {
        if (!peopleData) return ['All'];
        const statuses = new Set<string>();
        peopleData.allPeople.forEach(p => {
            if (p.status?.toLowerCase() !== 'inactive') {
                statuses.add(p.membership || 'None');
            }
        });
        return ['All', ...Array.from(statuses).sort()];
    }, [peopleData]);

    const totalPages = Math.ceil(filteredPeople.length / itemsPerPage);
    const displayedPeople = filteredPeople.slice((page - 1) * itemsPerPage, page * itemsPerPage);

    const calculateFactorScore = (person: PcoPerson, factor: 'attendance' | 'groups' | 'serving' | 'giving' | 'membership') => {
        const weight = settings.weights[factor] || 0;
        let score = 0;
        
        switch (factor) {
            case 'attendance':
                const checkIns = person.checkInCount || 0;
                if (checkIns >= 8) score = weight;
                else if (checkIns >= 3) score = weight * 0.7;
                else if (checkIns >= 1) score = Math.round(weight * 0.3);
                break;
            case 'groups':
                if (person.groupIds && person.groupIds.length > 0) score = weight;
                break;
            case 'serving':
                if (person.riskProfile && !person.riskProfile.factors.includes('Not Serving')) {
                    const timesServed = person.servingStats?.last90DaysCount || 0;
                    const targetServing = settings.targets?.serving90Days || 4;
                    if (timesServed >= targetServing) score = weight;
                    else if (timesServed > 0) score = Math.round((timesServed / targetServing) * weight);
                }
                break;
            case 'giving':
                // Check if they are donor
                if (person.isDonor) score = weight;
                break;
            case 'membership':
                if (person.membership === 'Member') score = weight;
                break;
        }
        return score;
    };

    if (!peopleData) return null;

    return (
        <WidgetWrapper 
            title="People Risk List" 
            onRemove={onRemove} 
            source="PCO & Risk Engine"
        >
            <div className="flex flex-col h-[600px]">
                <div className="flex justify-between items-center mb-4 px-2">
                    <div className="flex items-center gap-2">
                        <label className="text-[10px] font-black uppercase text-slate-400">Membership:</label>
                        <select 
                            value={memberStatusFilter}
                            onChange={(e) => { setMemberStatusFilter(e.target.value); setPage(1); }}
                            className="bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-[10px] font-black uppercase rounded-lg px-2 py-1 outline-none border-none"
                        >
                            {memberStatuses.map(s => (
                                <option key={s} value={s}>{s}</option>
                            ))}
                        </select>
                    </div>
                    <div className="text-[10px] font-black uppercase text-slate-400">
                        Total: {filteredPeople.length} People
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse">
                        <thead className="sticky top-0 bg-white dark:bg-slate-850 z-10">
                            <tr>
                                <th className="p-2 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800">Person</th>
                                <th className="p-2 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Status</th>
                                <th className="p-2 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Score</th>
                                <th className="p-2 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Attend</th>
                                <th className="p-2 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Group</th>
                                <th className="p-2 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Serve</th>
                                <th className="p-2 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Give</th>
                                <th className="p-2 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Member</th>
                                <th className="p-2 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Birthday</th>
                                <th className="p-2 text-[10px] font-black uppercase text-slate-400 border-b border-slate-100 dark:border-slate-800 text-center">Anniversary</th>
                            </tr>
                        </thead>
                        <tbody className="text-sm border-b border-slate-100 dark:border-slate-800">
                            {displayedPeople.map(person => {
                                const rawScore = person.riskProfile?.score ?? 0;
                                const category = person.riskProfile?.category ?? 'Disconnected';
                                let scoreColor = 'text-rose-500';
                                if (category === 'Healthy') scoreColor = 'text-emerald-500';
                                else if (category === 'At Risk') scoreColor = 'text-amber-500';

                                const handleRowClick = () => {
                                    window.dispatchEvent(new CustomEvent('openPersonProfile', { detail: person.id }));
                                };

                                let statusBadgeClass = 'bg-rose-100 text-rose-600 dark:bg-rose-950/40 dark:text-rose-400';
                                if (category === 'Healthy') statusBadgeClass = 'bg-emerald-100 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400';
                                else if (category === 'At Risk') statusBadgeClass = 'bg-amber-100 text-amber-700 dark:bg-amber-950/40 dark:text-amber-400';

                                return (
                                    <tr
                                        key={person.id}
                                        onClick={handleRowClick}
                                        className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors border-b border-slate-50 border-dashed dark:border-slate-800/50 cursor-pointer group"
                                        title={`View ${person.name}'s profile`}
                                    >
                                        <td className="p-2 py-3">
                                            <div className="flex items-center gap-3">
                                                {person.avatar ? (
                                                    <img src={person.avatar} alt={person.name} width="32" height="32" loading="lazy" className="w-8 h-8 rounded-full bg-slate-200 group-hover:ring-2 group-hover:ring-indigo-400 transition-all" />
                                                ) : (
                                                    <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs uppercase group-hover:ring-2 group-hover:ring-indigo-400 transition-all">
                                                        {person.name.substring(0, 2)}
                                                    </div>
                                                )}
                                                <div>
                                                    <p className="font-bold text-slate-900 dark:text-white truncate max-w-[140px] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors" title={person.name}>{person.name}</p>
                                                    <p className="text-[10px] text-slate-400 tracking-wider">
                                                        {person.phone || person.email || 'No Contact Info'}
                                                    </p>
                                                </div>
                                            </div>
                                        </td>
                                        <td className="p-2 text-center">
                                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide whitespace-nowrap ${statusBadgeClass}`}>
                                                {category}
                                            </span>
                                        </td>
                                        <td className="p-2 text-center">
                                            <span className={`font-black ${scoreColor}`}>{rawScore}</span>
                                        </td>
                                        <td className="p-2 text-center text-xs font-bold text-slate-600 dark:text-slate-300">
                                            {calculateFactorScore(person, 'attendance')}<span className="text-[9px] text-slate-400">/{settings.weights.attendance}</span>
                                        </td>
                                        <td className="p-2 text-center text-xs font-bold text-slate-600 dark:text-slate-300">
                                            {calculateFactorScore(person, 'groups')}<span className="text-[9px] text-slate-400">/{settings.weights.groups}</span>
                                        </td>
                                        <td className="p-2 text-center">
                                            <div className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                                {calculateFactorScore(person, 'serving')}<span className="text-[9px] text-slate-400">/{settings.weights.serving}</span>
                                            </div>
                                            <div className="text-[9px] text-slate-400 mt-1 whitespace-nowrap" title="Confirmed services in last 90 days / average per week">
                                                {person.servingStats?.last90DaysCount || 0}x ({person.servingStats?.timesPerWeek || 0}/wk)
                                            </div>
                                        </td>
                                        <td className="p-2 text-center text-xs font-bold text-slate-600 dark:text-slate-300">
                                            {calculateFactorScore(person, 'giving')}<span className="text-[9px] text-slate-400">/{settings.weights.giving}</span>
                                        </td>
                                        <td className="p-2 text-center text-xs font-bold text-slate-600 dark:text-slate-300">
                                            {calculateFactorScore(person, 'membership')}<span className="text-[9px] text-slate-400">/{settings.weights.membership}</span>
                                        </td>
                                        <td className="p-2 text-center">
                                            {(() => {
                                                const bd = formatMonthDay(person.birthdate);
                                                const upcoming = isUpcomingAnnual(person.birthdate);
                                                return bd ? (
                                                    <span
                                                        className={`inline-flex items-center gap-1 text-[10px] font-bold whitespace-nowrap ${
                                                            upcoming
                                                                ? 'text-pink-600 dark:text-pink-400'
                                                                : 'text-slate-500 dark:text-slate-400'
                                                        }`}
                                                        title={upcoming ? 'Birthday coming up!' : undefined}
                                                    >
                                                        {upcoming && <span>🎂</span>}{bd}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>
                                                );
                                            })()}
                                        </td>
                                        <td className="p-2 text-center">
                                            {(() => {
                                                const ann = formatMonthDay(person.anniversary);
                                                const upcoming = isUpcomingAnnual(person.anniversary);
                                                return ann ? (
                                                    <span
                                                        className={`inline-flex items-center gap-1 text-[10px] font-bold whitespace-nowrap ${
                                                            upcoming
                                                                ? 'text-rose-600 dark:text-rose-400'
                                                                : 'text-slate-500 dark:text-slate-400'
                                                        }`}
                                                        title={upcoming ? 'Anniversary coming up!' : undefined}
                                                    >
                                                        {upcoming && <span>💍</span>}{ann}
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] text-slate-300 dark:text-slate-600">—</span>
                                                );
                                            })()}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                    {displayedPeople.length === 0 && (
                        <div className="py-10 text-center text-slate-400 text-xs font-bold">No people match your filters.</div>
                    )}
                </div>

                {totalPages > 1 && (
                    <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex justify-between items-center px-4">
                        <button 
                            disabled={page === 1}
                            onClick={() => setPage(p => Math.max(1, p - 1))}
                            className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50 transition-colors"
                        >
                            &larr; Prev
                        </button>
                        <span className="text-xs font-bold text-slate-400">
                            Page {page} of {totalPages}
                        </span>
                        <button 
                            disabled={page === totalPages}
                            onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                            className="bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-600 dark:text-slate-300 px-4 py-2 rounded-xl text-xs font-bold disabled:opacity-50 transition-colors"
                        >
                            Next &rarr;
                        </button>
                    </div>
                )}
            </div>
        </WidgetWrapper>
    );
};
