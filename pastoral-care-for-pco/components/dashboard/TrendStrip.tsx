import React from 'react';
import { TrendSeries } from '../../services/dashboardService';
import { Card, EmptyNote, Section, SectionControls, Sparkline, fmtValue } from './DashboardPrimitives';

/**
 * Twelve weeks of movement, one sparkline per series.
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

const changeAcross = (points: TrendSeries['points']): number | null => {
    if (points.length < 2) return null;
    const first = points[0].value;
    const last = points[points.length - 1].value;
    if (first === 0) return last === 0 ? 0 : null;
    return Math.round(((last - first) / first) * 100);
};

interface TrendStripProps extends SectionControls {
    series: TrendSeries[];
}

export const TrendStrip: React.FC<TrendStripProps> = ({ series, ...controls }: TrendStripProps) => (
    <Section title="Trends" caption="last 12 weeks" {...controls}>
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
                    const latest = s.points.length ? s.points[s.points.length - 1].value : 0;
                    const pct = changeAcross(s.points);
                    return (
                        <Card key={s.id} className="p-6 print:p-3">
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                                {s.label}
                            </p>
                            <div className="flex items-baseline gap-2 mt-2 mb-3">
                                <p className="text-2xl font-black tracking-tighter tabular-nums text-slate-900 dark:text-white">
                                    {fmtValue(latest, s.isCurrency)}
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
                            <Sparkline points={s.points} slot={SERIES_SLOT[s.id] ?? 0} isCurrency={s.isCurrency} showEndDot height={56} />
                            <p className="text-[10px] font-medium text-slate-300 dark:text-slate-600 mt-1">
                                latest week
                            </p>
                        </Card>
                    );
                })}
            </div>
        )}
    </Section>
);
