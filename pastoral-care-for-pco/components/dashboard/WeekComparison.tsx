import React from 'react';
import { DeltaRow } from '../../services/dashboardService';
import { Card, DeltaChip, EmptyNote, Section, fmtValue } from './DashboardPrimitives';

/**
 * Last seven days against the seven before.
 *
 * Rows arrive pre-filtered by role, so a user without Giving simply has fewer
 * lines rather than blanked-out ones.
 */
export const WeekComparison: React.FC<{ rows: DeltaRow[] }> = ({ rows }) => (
    <Section title="This week" caption="vs. the previous seven days">
        <Card className="px-8 py-3 print:px-4">
            {rows.length === 0 ? (
                <EmptyNote>No comparable activity in the last two weeks.</EmptyNote>
            ) : (
                <ul className="divide-y divide-slate-50 dark:divide-slate-700/60">
                    {rows.map(row => (
                        <li key={row.id} className="flex items-center justify-between gap-4 py-4">
                            <span className="text-sm font-bold text-slate-600 dark:text-slate-300">{row.label}</span>
                            <span className="flex items-center gap-4">
                                <span className="text-xl font-black tabular-nums text-slate-900 dark:text-white">
                                    {fmtValue(row.current, row.isCurrency)}
                                </span>
                                <DeltaChip
                                    current={row.current}
                                    previous={row.previous}
                                    isCurrency={row.isCurrency}
                                />
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </Card>
    </Section>
);
