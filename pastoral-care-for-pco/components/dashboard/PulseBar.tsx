import React from 'react';
import { DashboardOverview } from '../../services/dashboardService';
import { Card, fmtAgo, fmtCurrency, fmtNumber } from './DashboardPrimitives';

/**
 * The church's vital signs, above the fold.
 *
 * Uses `auto-fit` columns so a hidden stat — giving, for a user without the
 * role — widens the remaining ones instead of leaving a gap.
 */

interface PulseStat {
    key: string;
    label: string;
    value: string;
}

export const PulseBar: React.FC<{
    overview: DashboardOverview;
    churchName: string;
    campusName?: string | null;
}> = ({ overview, churchName, campusName }) => {
    const { pulse, freshness } = overview;

    const stats: PulseStat[] = [];
    const add = (key: string, label: string, value: number | null, fmt = fmtNumber) => {
        if (value !== null && value !== undefined) stats.push({ key, label, value: fmt(value) });
    };

    add('active', `Active people · ${60}d`, pulse.activePeople);
    add('attendance', 'Last Sunday', pulse.lastSundayAttendance);
    add('giving', 'Giving this month', pulse.givingMtd, fmtCurrency);
    add('groups', 'Active groups', pulse.activeGroups);
    add('volunteers', 'Volunteers serving', pulse.volunteersServing);

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
                    className="grid gap-8"
                    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
                >
                    {stats.map(s => (
                        <div key={s.key}>
                            <p className="text-4xl print:text-2xl font-black tracking-tighter tabular-nums text-slate-900 dark:text-white">
                                {s.value}
                            </p>
                            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-2">
                                {s.label}
                            </p>
                        </div>
                    ))}
                </div>
            </Card>
        </section>
    );
};
