import React from 'react';
import { Link } from 'react-router-dom';
import { AttentionRow, Severity } from '../../services/dashboardService';
import { Card, Section, fmtNumber } from './DashboardPrimitives';

/**
 * The section that makes the page worth opening daily.
 *
 * Rows are already filtered by the service: zero counts and areas the user
 * can't read never arrive here. Nothing is greyed out or padlocked — a user
 * shouldn't be able to learn what data exists that they aren't allowed to see.
 */

const SEVERITY_STYLES: Record<Severity, { dot: string; count: string }> = {
    critical: {
        dot: 'bg-rose-500',
        count: 'text-rose-600 dark:text-rose-400',
    },
    warn: {
        dot: 'bg-amber-500',
        count: 'text-amber-600 dark:text-amber-400',
    },
    ok: {
        dot: 'bg-slate-300 dark:bg-slate-600',
        count: 'text-slate-600 dark:text-slate-300',
    },
};

export const NeedsAttention: React.FC<{ rows: AttentionRow[] }> = ({ rows }) => (
    <Section title="Needs attention">
        <Card className="px-8 py-3 print:px-4">
            {rows.length === 0 ? (
                <div className="flex items-center gap-3 py-6">
                    <span
                        aria-hidden="true"
                        className="w-8 h-8 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400 font-black"
                    >
                        ✓
                    </span>
                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                        Nothing needs your attention right now.
                    </p>
                </div>
            ) : (
                <ul className="divide-y divide-slate-50 dark:divide-slate-700/60">
                    {rows.map(row => {
                        const style = SEVERITY_STYLES[row.severity];
                        return (
                            <li key={row.id}>
                                <Link
                                    to={row.href}
                                    className="flex items-center justify-between gap-4 py-4 group focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded-xl"
                                >
                                    <span className="flex items-center gap-3 min-w-0">
                                        <span aria-hidden="true" className={`w-2 h-2 rounded-full flex-shrink-0 ${style.dot}`} />
                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors truncate">
                                            {row.label}
                                        </span>
                                    </span>
                                    <span className="flex items-center gap-3 flex-shrink-0">
                                        <span className={`text-xl font-black tabular-nums ${style.count}`}>
                                            {fmtNumber(row.count)}
                                        </span>
                                        <span
                                            aria-hidden="true"
                                            className="text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-colors"
                                        >
                                            →
                                        </span>
                                    </span>
                                </Link>
                            </li>
                        );
                    })}
                </ul>
            )}
        </Card>
    </Section>
);
