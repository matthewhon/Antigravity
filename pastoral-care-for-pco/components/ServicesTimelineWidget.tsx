
import React, { useMemo } from 'react';
import { ServicesDashboardData, DetailedDonation } from '../types';

interface ServicesTimelineWidgetProps {
    servicesData: ServicesDashboardData | null;
    /** All raw donations (unfiltered) — used to build per-day giving totals */
    donations: DetailedDonation[];
    onRemove: () => void;
}

interface DayEntry {
    dateKey: string;
    dayOfWeek: string;    // "SUN"
    dayNum: string;       // "13"
    monthAbbr: string;    // "APR"
    services: {
        id: string;
        name: string;
        time: string;
        volunteersScheduled: number;
    }[];
    totalHeadcount: number;
    givingAmount: number;
    isToday: boolean;
}

/** Formats a Date to local YYYY-MM-DD without UTC-midnight shift */
const toLocalDateKey = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

export const ServicesTimelineWidget: React.FC<ServicesTimelineWidgetProps> = ({
    servicesData,
    donations,
    onRemove,
}) => {
    const days = useMemo<DayEntry[]>(() => {
        const now = new Date();
        const todayKey = toLocalDateKey(now);

        // ── 1. Build giving totals from the raw DetailedDonation[] ──────────────
        // We bypass givingAnalytics.trends (which is filter-scoped and may exclude
        // service dates outside the currently selected giving window). Instead we
        // scan ALL donations so every service day shows real giving data.
        const givingByDate: Record<string, number> = {};
        donations.forEach(d => {
            // d.date is "YYYY-MM-DD" or a full ISO string — take the date part only.
            const key = (d.date || '').slice(0, 10);
            if (key.length === 10) {
                givingByDate[key] = (givingByDate[key] || 0) + d.amount;
            }
        });

        // ── 2. Headcount from checkIns.trends ───────────────────────────────────
        const headcountByDate: Record<string, number> = {};
        const checkTrends: any[] = (servicesData?.checkIns?.trends as any[]) || [];
        checkTrends.forEach((trend: any) => {
            const key = (trend.isoDate || trend.date || '').slice(0, 10);
            if (!key) return;
            const total =
                trend.total != null
                    ? trend.total
                    : (trend.headcount || 0) +
                      (trend.guests || 0) +
                      (trend.regulars || 0) +
                      (trend.volunteers || 0);
            headcountByDate[key] = (headcountByDate[key] || 0) + total;
        });

        // ── 3. Group past service plans by calendar date ─────────────────────────
        const plansByDate: Record<string, DayEntry['services']> = {};

        (servicesData?.recentPlans || []).forEach(plan => {
            const planDate =
                plan.planTimes && plan.planTimes.length > 0
                    ? new Date(plan.planTimes[0].startsAt)
                    : new Date(plan.sortDate);

            const key = toLocalDateKey(planDate);
            if (key > todayKey) return; // skip future

            if (!plansByDate[key]) plansByDate[key] = [];

            const timeStr =
                plan.planTimes && plan.planTimes.length > 0
                    ? new Date(plan.planTimes[0].startsAt).toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                      })
                    : '';

            const volunteers =
                plan.teamMembers?.filter(m => {
                    const s = (m.status || '').toLowerCase();
                    return s === 'confirmed' || s === 'c';
                }).length || 0;

            plansByDate[key].push({
                id: plan.id,
                name: plan.serviceTypeName || plan.seriesTitle || 'Service',
                time: timeStr,
                volunteersScheduled: volunteers,
            });
        });

        // ── 4. 5 most-recent days, newest first ──────────────────────────────────
        const recentKeys = Object.keys(plansByDate).sort().reverse().slice(0, 5);

        return recentKeys.map(key => {
            const d = new Date(key + 'T12:00:00'); // noon prevents DST day drift
            return {
                dateKey: key,
                dayOfWeek: d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
                dayNum: String(d.getDate()),
                monthAbbr: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
                services: plansByDate[key] || [],
                totalHeadcount: headcountByDate[key] || 0,
                givingAmount: givingByDate[key] || 0,
                isToday: key === todayKey,
            };
        });
    }, [servicesData, donations]);

    const isEmpty = days.length === 0;

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm h-full flex flex-col group relative overflow-hidden">
            {/* Remove */}
            <button
                onClick={onRemove}
                className="absolute top-5 right-5 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 z-10"
                aria-label="Remove widget"
            >
                ✕
            </button>

            {/* Glow */}
            <div className="absolute -right-12 -top-12 w-48 h-48 bg-indigo-50/40 dark:bg-indigo-900/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="relative z-10 flex items-center justify-between mb-5">
                <div>
                    <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">
                        Services Timeline
                    </h4>
                    <p className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest mt-0.5">
                        Last 5 Service Days · Most Recent First
                    </p>
                </div>
                <span className="text-lg">🗓️</span>
            </div>

            {isEmpty ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                    <div className="text-4xl mb-3 grayscale opacity-20">📅</div>
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500">No Recent Services</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 max-w-[160px]">
                        Sync Planning Center services to populate this timeline.
                    </p>
                </div>
            ) : (
                <div className="relative z-10 flex-1">
                    {/* Spine */}
                    <div className="absolute left-[22px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-indigo-400 via-violet-300 to-indigo-100 dark:from-indigo-600 dark:via-violet-700/60 dark:to-indigo-900/20 rounded-full" />

                    <div className="space-y-4">
                        {days.map((day, idx) => {
                            const isFirst = idx === 0; // most recent
                            const dotCls = isFirst
                                ? 'bg-indigo-500 ring-2 ring-indigo-200 dark:ring-indigo-800 shadow shadow-indigo-300 dark:shadow-indigo-700'
                                : 'bg-slate-300 dark:bg-slate-600';

                            return (
                                <div key={day.dateKey} className="flex items-start gap-4">
                                    {/* Dot */}
                                    <div className="shrink-0">
                                        <div className={`w-[11px] h-[11px] rounded-full mt-2 border-2 border-white dark:border-slate-800 z-10 relative ${dotCls}`} />
                                    </div>

                                    {/* Date badge */}
                                    <div className={`shrink-0 w-10 flex flex-col items-center rounded-xl py-1 border ${
                                        isFirst
                                            ? 'bg-indigo-500 border-indigo-500'
                                            : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800/40'
                                    }`}>
                                        <span className={`text-[7px] font-black uppercase tracking-widest ${isFirst ? 'text-indigo-200' : 'text-rose-500'}`}>
                                            {day.monthAbbr}
                                        </span>
                                        <span className={`text-base font-black leading-none ${isFirst ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                                            {day.dayNum}
                                        </span>
                                        <span className={`text-[7px] font-bold uppercase ${isFirst ? 'text-indigo-200' : 'text-slate-400 dark:text-slate-500'}`}>
                                            {day.dayOfWeek}
                                        </span>
                                    </div>

                                    {/* Card */}
                                    <div className={`flex-1 min-w-0 rounded-2xl border p-3 transition-all ${
                                        isFirst
                                            ? 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800'
                                            : 'bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800'
                                    }`}>
                                        {/* Service rows */}
                                        <div className="space-y-1 mb-2.5">
                                            {day.services.map(svc => (
                                                <div key={svc.id} className="flex items-center justify-between gap-2">
                                                    <div className="flex items-center gap-2 min-w-0">
                                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
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

                                        {/* Stat pills */}
                                        <div className="flex flex-wrap items-center gap-1.5">
                                            {/* Headcount */}
                                            {day.totalHeadcount > 0 ? (
                                                <span className="inline-flex items-center gap-1 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/30 px-2 py-0.5 rounded-lg text-[9px]">
                                                    <span>👥</span>
                                                    <span className="font-black text-violet-700 dark:text-violet-400">{day.totalHeadcount.toLocaleString()}</span>
                                                    <span className="text-violet-400 dark:text-violet-500 font-medium">attended</span>
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-lg text-[9px] text-slate-400">
                                                    <span>👥</span>
                                                    <span>No headcount</span>
                                                </span>
                                            )}

                                            {/* Giving */}
                                            {day.givingAmount > 0 && (
                                                <span className="inline-flex items-center gap-1 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-100 dark:border-emerald-800/30 px-2 py-0.5 rounded-lg text-[9px]">
                                                    <span>💰</span>
                                                    <span className="font-black text-emerald-700 dark:text-emerald-400">
                                                        ${day.givingAmount.toLocaleString()}
                                                    </span>
                                                    <span className="text-emerald-400 dark:text-emerald-500 font-medium">giving</span>
                                                </span>
                                            )}

                                            {/* Volunteers */}
                                            {(() => {
                                                const v = day.services.reduce((s, sv) => s + sv.volunteersScheduled, 0);
                                                return v > 0 ? (
                                                    <span className="inline-flex items-center gap-1 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-800/30 px-2 py-0.5 rounded-lg text-[9px]">
                                                        <span>🙋</span>
                                                        <span className="font-black text-amber-700 dark:text-amber-400">{v}</span>
                                                        <span className="text-amber-400 dark:text-amber-500 font-medium">volunteers</span>
                                                    </span>
                                                ) : null;
                                            })()}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Legend */}
            {!isEmpty && (
                <div className="relative z-10 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex flex-wrap gap-3 text-[8px] font-bold uppercase tracking-widest text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-violet-400" /> Headcount</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> Giving</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-amber-400" /> Volunteers</span>
                    <span className="ml-auto text-indigo-400">PCO Services + Giving</span>
                </div>
            )}
        </div>
    );
};

export default ServicesTimelineWidget;
