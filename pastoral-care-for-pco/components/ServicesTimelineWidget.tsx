
import React, { useMemo } from 'react';
import { ServicesDashboardData, GivingAnalytics } from '../types';

interface ServicesTimelineWidgetProps {
    servicesData: ServicesDashboardData | null;
    givingAnalytics: GivingAnalytics | null;
    onRemove: () => void;
}

interface DayEntry {
    dateKey: string;          // YYYY-MM-DD
    dateLabel: string;        // "Sun, Apr 13"
    dayOfWeek: string;        // "SUN"
    dayNum: string;           // "13"
    monthAbbr: string;        // "APR"
    services: {
        id: string;
        name: string;
        time: string;         // "10:00 AM"
        headcount: number;
        volunteersScheduled: number;
    }[];
    totalHeadcount: number;
    givingAmount: number;
    isToday: boolean;
    isPast: boolean;
}

/** Format a Date safely to local YYYY-MM-DD */
const toLocalDateKey = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const ServicesTimelineWidget: React.FC<ServicesTimelineWidgetProps> = ({
    servicesData,
    givingAnalytics,
    onRemove,
}) => {
    const days = useMemo<DayEntry[]>(() => {
        const now = new Date();
        const todayKey = toLocalDateKey(now);

        // --- Build giving lookup by date (YYYY-MM-DD => amount) ---
        const givingByDate: Record<string, number> = {};
        (givingAnalytics?.trends || []).forEach(t => {
            const key = t.date?.slice(0, 10);
            if (key) {
                givingByDate[key] = (givingByDate[key] || 0) + t.amount;
            }
        });

        // --- Build headcount lookup from checkIns.trends ---
        const headcountByDate: Record<string, number> = {};
        const checkTrends: any[] = (servicesData?.checkIns?.trends as any[]) || [];
        checkTrends.forEach((trend: any) => {
            const key = (trend.isoDate || trend.date || '').slice(0, 10);
            if (!key) return;
            const total =
                trend.total ??
                (trend.headcount || 0) +
                    (trend.guests || 0) +
                    (trend.regulars || 0) +
                    (trend.volunteers || 0);
            headcountByDate[key] = (headcountByDate[key] || 0) + total;
        });

        // --- Collect all past plans (including recentPlans + futurePlans before now) ---
        const allPlans = [
            ...(servicesData?.recentPlans || []),
            // futurePlans that ended before today still appear here on the right day
        ];

        // Build a map: dateKey => services array
        const plansByDate: Record<string, DayEntry['services']> = {};

        allPlans.forEach(plan => {
            // Determine plan date
            const planDate =
                plan.planTimes && plan.planTimes.length > 0
                    ? new Date(plan.planTimes[0].startsAt)
                    : new Date(plan.sortDate);

            const key = toLocalDateKey(planDate);

            // Only include past / today
            if (key > todayKey) return;

            if (!plansByDate[key]) plansByDate[key] = [];

            const timeStr = plan.planTimes && plan.planTimes.length > 0
                ? new Date(plan.planTimes[0].startsAt).toLocaleTimeString(undefined, {
                      hour: 'numeric',
                      minute: '2-digit',
                  })
                : '';

            // Headcount: use check-in data first, else team members count
            const volunteers = plan.teamMembers?.filter(m => m.status === 'Confirmed').length || 0;

            // Individual plan headcount from checkins is not per-plan granular in current schema;
            // use per-day total from headcountByDate; individual service will show 0 if multiple on same day
            plansByDate[key].push({
                id: plan.id,
                name: plan.serviceTypeName || plan.seriesTitle || 'Service',
                time: timeStr,
                headcount: 0, // will be set at day level
                volunteersScheduled: volunteers,
            });
        });

        // --- Collect all unique date keys with services ---
        const dateKeys = Object.keys(plansByDate).sort().reverse(); // most recent first
        // Take last 5 distinct days
        const recentKeys = dateKeys.slice(0, 5).reverse(); // chronological for timeline

        // --- Build the DayEntry array ---
        return recentKeys.map(key => {
            const d = new Date(key + 'T12:00:00'); // noon to avoid DST shifts
            const isToday = key === todayKey;
            const isPast = key < todayKey;

            const services = plansByDate[key] || [];
            const totalHeadcount = headcountByDate[key] || 0;
            const givingAmount = givingByDate[key] || 0;

            return {
                dateKey: key,
                dateLabel: d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' }),
                dayOfWeek: d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
                dayNum: String(d.getDate()),
                monthAbbr: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
                services,
                totalHeadcount,
                givingAmount,
                isToday,
                isPast,
            };
        });
    }, [servicesData, givingAnalytics]);

    const isEmpty = days.length === 0;

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm h-full flex flex-col group relative overflow-hidden">
            {/* Remove button */}
            <button
                onClick={onRemove}
                className="absolute top-5 right-5 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 z-10"
                aria-label="Remove widget"
            >
                ✕
            </button>

            {/* Decorative glow */}
            <div className="absolute -right-12 -top-12 w-48 h-48 bg-indigo-50/40 dark:bg-indigo-900/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between mb-5">
                <div>
                    <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                        Services Timeline
                    </h4>
                    <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mt-0.5">
                        Last 5 Service Days
                    </p>
                </div>
                <span className="text-lg">🗓️</span>
            </div>

            {isEmpty ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                    <div className="text-4xl mb-3 grayscale opacity-20">📅</div>
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500">No Recent Services</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 max-w-[160px]">
                        Sync Planning Center services to see your timeline here.
                    </p>
                </div>
            ) : (
                <div className="relative z-10 flex-1 flex flex-col justify-between gap-0">
                    {/* Timeline spine */}
                    <div className="relative">
                        {/* Vertical line */}
                        <div className="absolute left-[22px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-indigo-200 via-violet-200 to-indigo-100 dark:from-indigo-800 dark:via-violet-800/60 dark:to-indigo-900/30 rounded-full" />

                        <div className="space-y-4">
                            {days.map((day, idx) => {
                                const isLast = idx === days.length - 1;
                                const dotColor = isLast
                                    ? 'bg-indigo-500 shadow-indigo-300 dark:shadow-indigo-700 shadow-md'
                                    : 'bg-slate-300 dark:bg-slate-600';

                                return (
                                    <div key={day.dateKey} className="flex items-start gap-4">
                                        {/* Timeline dot */}
                                        <div className="relative shrink-0 flex flex-col items-center">
                                            <div className={`w-[11px] h-[11px] rounded-full mt-2 border-2 border-white dark:border-slate-800 z-10 relative ${dotColor}`} />
                                        </div>

                                        {/* Date badge */}
                                        <div className="shrink-0 w-10 flex flex-col items-center bg-indigo-50 dark:bg-indigo-900/20 rounded-xl py-1 border border-indigo-100 dark:border-indigo-800/40">
                                            <span className="text-[7px] font-black text-rose-500 uppercase tracking-widest">{day.monthAbbr}</span>
                                            <span className="text-base font-black text-slate-900 dark:text-white leading-none">{day.dayNum}</span>
                                            <span className="text-[7px] font-bold text-slate-400 dark:text-slate-500 uppercase">{day.dayOfWeek}</span>
                                        </div>

                                        {/* Content card */}
                                        <div className="flex-1 min-w-0 bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-slate-100 dark:border-slate-800 p-3 transition-all hover:border-indigo-200 dark:hover:border-indigo-800">
                                            {/* Services list */}
                                            <div className="space-y-1.5 mb-2.5">
                                                {day.services.map(svc => (
                                                    <div key={svc.id} className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 dark:bg-indigo-500 shrink-0" />
                                                            <span className="text-[10px] font-bold text-slate-700 dark:text-slate-300 truncate">
                                                                {svc.name}
                                                            </span>
                                                        </div>
                                                        {svc.time && (
                                                            <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
                                                                {svc.time}
                                                            </span>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>

                                            {/* Stats row */}
                                            <div className="flex flex-wrap items-center gap-2">
                                                {/* Headcount */}
                                                {day.totalHeadcount > 0 ? (
                                                    <div className="flex items-center gap-1 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/30 px-2 py-0.5 rounded-lg">
                                                        <span className="text-[9px]">👥</span>
                                                        <span className="text-[9px] font-black text-violet-700 dark:text-violet-400">
                                                            {day.totalHeadcount.toLocaleString()}
                                                        </span>
                                                        <span className="text-[8px] text-violet-400 dark:text-violet-500 font-medium">
                                                            attended
                                                        </span>
                                                    </div>
                                                ) : (
                                                    <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-lg">
                                                        <span className="text-[9px]">👥</span>
                                                        <span className="text-[9px] font-medium text-slate-400 dark:text-slate-500">
                                                            No headcount
                                                        </span>
                                                    </div>
                                                )}

                                                {/* Giving batch */}
                                                {day.givingAmount > 0 ? (
                                                    <div className="flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 px-2 py-0.5 rounded-lg">
                                                        <span className="text-[9px]">💰</span>
                                                        <span className="text-[9px] font-black text-emerald-700 dark:text-emerald-400">
                                                            ${day.givingAmount.toLocaleString()}
                                                        </span>
                                                        <span className="text-[8px] text-emerald-400 dark:text-emerald-500 font-medium">
                                                            giving
                                                        </span>
                                                    </div>
                                                ) : null}

                                                {/* Volunteers confirmed */}
                                                {(() => {
                                                    const totalVols = day.services.reduce((s, sv) => s + sv.volunteersScheduled, 0);
                                                    return totalVols > 0 ? (
                                                        <div className="flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 px-2 py-0.5 rounded-lg">
                                                            <span className="text-[9px]">🙋</span>
                                                            <span className="text-[9px] font-black text-amber-700 dark:text-amber-400">
                                                                {totalVols}
                                                            </span>
                                                            <span className="text-[8px] text-amber-400 dark:text-amber-500 font-medium">
                                                                volunteers
                                                            </span>
                                                        </div>
                                                    ) : null;
                                                })()}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </div>
            )}

            {/* Footer legend */}
            {!isEmpty && (
                <div className="relative z-10 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex flex-wrap gap-3 text-[8px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400"></span> Headcount</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Giving</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400"></span> Volunteers</span>
                    <span className="ml-auto text-indigo-400">PCO Services + Giving</span>
                </div>
            )}
        </div>
    );
};

export default ServicesTimelineWidget;
