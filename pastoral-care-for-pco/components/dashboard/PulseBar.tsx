import React from 'react';
import { DashboardOverview, PulseStat } from '../../services/dashboardService';
import {
    Card, DeltaChip, Sparkline, StatusBar, fmtAgo, fmtValue,
} from './DashboardPrimitives';

/**
 * The church's vital signs, above the fold.
 *
 * Each stat is a tile — value, week-over-week delta, and a sparkline where the
 * measure has a history. That's the right form for "a single current value
 * plus a trend"; a bar chart of five unrelated measures would be worse.
 *
 * The grid uses `auto-fit`, so a stat hidden by role — giving, for someone
 * without it — widens the remaining tiles instead of leaving a gap.
 */

interface PulseBarProps {
    overview: DashboardOverview;
    churchName: string;
    campusName?: string | null;
}

interface StatTileProps {
    stat: PulseStat;
    /** Slot index into the validated categorical order. */
    index: number;
}

const StatTile: React.FC<StatTileProps> = ({ stat, index }: StatTileProps) => (
    <div className="flex flex-col">
        <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500">
            {stat.label}
        </p>
        <div className="flex items-baseline gap-2 mt-2 flex-wrap">
            <p className="text-4xl print:text-2xl font-black tracking-tighter tabular-nums text-slate-900 dark:text-white">
                {fmtValue(stat.value, stat.isCurrency)}
            </p>
            {stat.previous !== undefined && (
                <DeltaChip
                    current={stat.value}
                    previous={stat.previous}
                    isCurrency={stat.isCurrency}
                    higherIsBetter={stat.higherIsBetter}
                />
            )}
        </div>
        {stat.series && stat.series.length > 1 && (
            <div className="mt-3">
                <Sparkline points={stat.series} slot={index} height={40} showEndDot />
            </div>
        )}
    </div>
);

export const PulseBar: React.FC<PulseBarProps> = ({ overview, churchName, campusName }: PulseBarProps) => {
    const { pulse, engagement, freshness } = overview;

    return (
        <section className="mb-10 print:mb-6">
            <div className="flex items-baseline justify-between gap-4 mb-4 flex-wrap">
                <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">
                    {churchName}
                    {campusName && (
                        <span className="ml-3 text-sm font-bold text-indigo-500 dark:text-indigo-400 align-middle">
                            {campusName}
                        </span>
                    )}
                </h2>

                <span
                    className={
                        'inline-flex items-center gap-2 text-[11px] font-bold px-2.5 py-1 rounded-lg ' +
                        (freshness.isStale
                            ? 'text-amber-600 bg-amber-50 dark:bg-amber-900/20 dark:text-amber-400'
                            : 'text-slate-400 bg-slate-50 dark:bg-slate-800 dark:text-slate-500')
                    }
                    title={
                        freshness.lastSyncAt
                            ? new Date(freshness.lastSyncAt).toLocaleString()
                            : 'No completed sync recorded'
                    }
                >
                    <span
                        aria-hidden="true"
                        className={
                            'w-1.5 h-1.5 rounded-full ' +
                            (freshness.isStale ? 'bg-amber-500' : 'bg-emerald-500')
                        }
                    />
                    {freshness.isStale
                        ? `Data last synced ${fmtAgo(freshness.ageMs)}`
                        : `Data current as of ${fmtAgo(freshness.ageMs)}`}
                </span>
            </div>

            <Card className="p-8 print:p-4">
                <div
                    className="grid gap-x-8 gap-y-10"
                    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))' }}
                >
                    {pulse.map((stat, i) => (
                        <StatTile key={stat.id} stat={stat} index={i} />
                    ))}
                </div>

                {engagement.length > 0 && (
                    <div className="mt-8 pt-7 border-t border-slate-100 dark:border-slate-700">
                        <StatusBar
                            title="Congregation engagement"
                            segments={engagement}
                        />
                    </div>
                )}
            </Card>
        </section>
    );
};
