import React, { useState } from 'react';
import { TrendSeries } from '../../services/dashboardService';
import { Card, EmptyNote, Section, SectionControls, Sparkline, fmtValue } from './DashboardPrimitives';

/**
 * Movement trends with a user-configurable lookback period (defaults to 30 days).
 *
 * The point of putting them in one strip is comparability — four series on the
 * same baseline is the thing a grid of independent cards can't express. Each
 * carries its latest value and the change across the window, because a shape
 * without a magnitude is only half the story.
 */

/**
 * Fixed slot per series so colour follows the entity, not its position in a
 * filtered list — a role that hides Giving must not repaint the survivors.
 */
const SERIES_SLOT: Record<string, number> = {
    attendance: 0,
    giving: 1,
    new_people: 2,
    group_attendance: 3,
};

export type LookbackPeriod = '30d' | '60d' | '90d' | '12w';

export interface LookbackOption {
    id: LookbackPeriod;
    label: string;
    caption: string;
    weeks: number;
}

export const LOOKBACK_OPTIONS: LookbackOption[] = [
    { id: '30d', label: '30 Days', caption: 'last 30 days', weeks: 4 },
    { id: '60d', label: '60 Days', caption: 'last 60 days', weeks: 8 },
    { id: '90d', label: '90 Days', caption: 'last 90 days', weeks: 12 },
    { id: '12w', label: '12 Weeks', caption: 'last 12 weeks', weeks: 12 },
];

const changeAcross = (points: TrendSeries['points']): number | null => {
    if (points.length < 2) return null;
    const first = points[0].value;
    const last = points[points.length - 1].value;
    if (first === 0) return last === 0 ? 0 : null;
    return Math.round(((last - first) / first) * 100);
};

interface TrendStripProps extends SectionControls {
    series: TrendSeries[];
    lookback?: LookbackPeriod;
    onLookbackChange?: (next: LookbackPeriod) => void;
}

export const TrendStrip: React.FC<TrendStripProps> = ({
    series,
    lookback: externalLookback,
    onLookbackChange,
    ...controls
}: TrendStripProps) => {
    const [internalLookback, setInternalLookback] = useState<LookbackPeriod>('30d');
    const activeLookback = externalLookback || internalLookback;

    const handleSelect = (period: LookbackPeriod) => {
        setInternalLookback(period);
        onLookbackChange?.(period);
    };

    const selectedOption = LOOKBACK_OPTIONS.find(o => o.id === activeLookback) || LOOKBACK_OPTIONS[0];

    const lookbackAction = (
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl print:hidden">
            {LOOKBACK_OPTIONS.map(opt => {
                const isActive = activeLookback === opt.id;
                return (
                    <button
                        key={opt.id}
                        type="button"
                        onClick={() => handleSelect(opt.id)}
                        className={
                            'px-2.5 py-1 text-[11px] font-bold rounded-lg transition-all ' +
                            (isActive
                                ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-200')
                        }
                    >
                        {opt.label}
                    </button>
                );
            })}
        </div>
    );

    return (
        <Section title="Trends" caption={selectedOption.caption} action={lookbackAction} {...controls}>
            {series.length === 0 ? (
                <Card className="px-8 py-6">
                    <EmptyNote>No trend data available yet.</EmptyNote>
                </Card>
            ) : (
                <div
                    className="grid gap-4"
                    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}
                >
                    {series.map(s => {
                        const windowedPoints = s.points.slice(-selectedOption.weeks);
                        const hasPoints = windowedPoints.length > 0;
                        const lastPoint = hasPoints ? windowedPoints[windowedPoints.length - 1] : null;
                        const prevPoint = windowedPoints.length >= 2 ? windowedPoints[windowedPoints.length - 2] : null;

                        // If the latest week bucket is 0 (e.g. current week before Sunday services), fall back to latest completed week
                        const isCurrentWeekEmpty = !!(lastPoint && lastPoint.value === 0 && prevPoint && prevPoint.value > 0);
                        const displayPoint = isCurrentWeekEmpty ? prevPoint! : (lastPoint || { weekStart: '', value: 0 });

                        // Compute change percentage over completed weeks to prevent partial mid-week zeros from skewing to -100%
                        const evalPoints = isCurrentWeekEmpty ? windowedPoints.slice(0, -1) : windowedPoints;
                        const pct = changeAcross(evalPoints);

                        const periodTotal = windowedPoints.reduce((sum, p) => sum + p.value, 0);
                        const avgPerWeek = windowedPoints.length > 0 ? periodTotal / windowedPoints.length : 0;

                        return (
                            <Card key={s.id} className="p-6 print:p-3 flex flex-col justify-between">
                                <div>
                                    <div className="flex items-center justify-between gap-2">
                                        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                            {s.label}
                                        </p>
                                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 font-mono">
                                            Total: {fmtValue(periodTotal, s.isCurrency)}
                                        </span>
                                    </div>
                                    <div className="flex items-baseline gap-2 mt-2 mb-3">
                                        <p className="text-2xl font-black tracking-tighter tabular-nums text-slate-900 dark:text-white">
                                            {fmtValue(displayPoint.value, s.isCurrency)}
                                        </p>
                                        {pct !== null && pct !== 0 && (
                                            <span
                                                className={
                                                    'text-[11px] font-black tabular-nums ' +
                                                    (pct > 0
                                                        ? 'text-emerald-600 dark:text-emerald-400'
                                                        : 'text-rose-500 dark:text-rose-400')
                                                }
                                            >
                                                {pct > 0 ? '+' : ''}{pct}%
                                            </span>
                                        )}
                                    </div>
                                </div>

                                <div>
                                    <Sparkline points={windowedPoints} slot={SERIES_SLOT[s.id] ?? 0} isCurrency={s.isCurrency} showEndDot height={56} />
                                    <div className="flex items-center justify-between text-[10px] font-medium text-slate-400 dark:text-slate-500 mt-2 pt-2 border-t border-slate-100 dark:border-slate-800/60">
                                        <span>{isCurrentWeekEmpty ? 'latest completed week' : 'latest week'}</span>
                                        <span>avg {fmtValue(Math.round(avgPerWeek), s.isCurrency)}/wk</span>
                                    </div>
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </Section>
    );
};
