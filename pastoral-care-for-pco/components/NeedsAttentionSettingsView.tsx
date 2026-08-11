import React, { useEffect, useState } from 'react';
import { NeedsAttentionSettings, DEFAULT_NEEDS_ATTENTION_SETTINGS } from '../types';

/**
 * Thresholds for the dashboard's "Needs Attention" section.
 *
 * These are church-configurable because "overdue" means different things at
 * different sizes — three weeks without group attendance is a crisis in a
 * 60-person church and a rounding error in a 3,000-person one.
 */

interface NeedsAttentionSettingsViewProps {
    settings?: NeedsAttentionSettings;
    onSave: (next: NeedsAttentionSettings) => void;
}

type RowKey = keyof NeedsAttentionSettings['enabled'];

interface RowSpec {
    key: RowKey;
    icon: string;
    title: string;
    /** The threshold field this row reads, if it has one. */
    field?: keyof Omit<NeedsAttentionSettings, 'enabled' | 'severity'>;
    unit?: string;
    hint: string;
}

const ROWS: RowSpec[] = [
    {
        key: 'riskChanges', icon: '⚠️', title: 'Newly at risk',
        field: 'riskChangeWindowDays', unit: 'days',
        hint: 'Flag people who moved into the At Risk category within this window.',
    },
    {
        key: 'unansweredTexts', icon: '💬', title: 'Unanswered texts',
        field: 'unansweredTextHours', unit: 'hours',
        hint: 'Flag inbound messages with no reply after this long.',
    },
    {
        key: 'groupAttendanceGap', icon: '📂', title: 'Group attendance gap',
        field: 'groupAttendanceGapWeeks', unit: 'weeks',
        hint: 'Flag active groups with no attendance logged for this long.',
    },
    {
        key: 'openPositions', icon: '🪑', title: 'Open serving positions',
        field: 'openPositionsLookaheadDays', unit: 'days ahead',
        hint: 'How far ahead to look for unfilled positions.',
    },
    {
        key: 'pendingOutreach', icon: '📞', title: 'Pending outreach',
        field: 'pendingOutreachHours', unit: 'hours',
        hint: 'Flag calling assignments left unworked for this long.',
    },
    {
        key: 'lapsedDonors', icon: '📉', title: 'Lapsed donors',
        hint: 'Uses the window set under Donor Lifecycle, so the two can\'t disagree.',
    },
    {
        key: 'neverContacted', icon: '🧩', title: 'Never contacted',
        hint: 'At-risk people no outreach session has ever reached.',
    },
];

const NeedsAttentionSettingsView: React.FC<NeedsAttentionSettingsViewProps> = ({ settings, onSave }) => {
    const [local, setLocal] = useState<NeedsAttentionSettings>(settings || DEFAULT_NEEDS_ATTENTION_SETTINGS);
    const [isDirty, setIsDirty] = useState(false);

    useEffect(() => {
        if (settings) setLocal(settings);
    }, [settings]);

    const setNumber = (field: keyof NeedsAttentionSettings, value: string) => {
        const n = parseInt(value, 10);
        setLocal(prev => ({ ...prev, [field]: isNaN(n) || n < 0 ? 0 : n }));
        setIsDirty(true);
    };

    const setSeverity = (which: 'warn' | 'critical', value: string) => {
        const n = parseInt(value, 10);
        setLocal(prev => ({
            ...prev,
            severity: { ...prev.severity, [which]: isNaN(n) || n < 0 ? 0 : n },
        }));
        setIsDirty(true);
    };

    const toggle = (key: RowKey) => {
        setLocal(prev => ({ ...prev, enabled: { ...prev.enabled, [key]: !prev.enabled[key] } }));
        setIsDirty(true);
    };

    const handleSave = () => {
        onSave(local);
        setIsDirty(false);
    };

    const handleReset = () => {
        setLocal(DEFAULT_NEEDS_ATTENTION_SETTINGS);
        setIsDirty(true);
    };

    const severityInvalid = local.severity.critical <= local.severity.warn;

    return (
        <div className="bg-slate-50 dark:bg-slate-900 p-8 rounded-[3rem] border border-slate-200 dark:border-slate-800 mt-8 transition-colors">
            <div className="flex justify-between items-start mb-8 gap-6 flex-wrap">
                <div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Needs Attention</h3>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-wide mt-1">
                        What the dashboard flags, and when
                    </p>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-3 max-w-xl">
                        Each row only appears on someone's dashboard if they have access to that area
                        and the count is above zero. Turn a row off entirely if your church doesn't
                        use that part of the app.
                    </p>
                </div>
                <div className="flex items-center gap-3">
                    <button
                        onClick={handleReset}
                        className="text-[10px] font-bold uppercase tracking-wide text-slate-500 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 px-3 py-2 rounded-lg transition-colors"
                    >
                        Reset to defaults
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!isDirty || severityInvalid}
                        className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold text-xs uppercase tracking-wide hover:bg-indigo-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-lg shadow-indigo-200 dark:shadow-none"
                    >
                        Save Thresholds
                    </button>
                </div>
            </div>

            <div className="space-y-3">
                {ROWS.map(row => {
                    const on = local.enabled[row.key];
                    return (
                        <div
                            key={row.key}
                            className={
                                'bg-white dark:bg-slate-850 p-5 rounded-2xl border shadow-sm transition-colors flex items-center gap-5 flex-wrap ' +
                                (on
                                    ? 'border-slate-100 dark:border-slate-800'
                                    : 'border-slate-100 dark:border-slate-800 opacity-55')
                            }
                        >
                            <span className="text-2xl" aria-hidden="true">{row.icon}</span>

                            <div className="flex-1 min-w-[220px]">
                                <h4 className="font-bold text-slate-900 dark:text-white text-sm">{row.title}</h4>
                                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">{row.hint}</p>
                            </div>

                            {row.field && (
                                <div className="flex items-center gap-2">
                                    <input
                                        type="number"
                                        min={0}
                                        aria-label={`${row.title} threshold in ${row.unit}`}
                                        value={local[row.field] as number}
                                        disabled={!on}
                                        onChange={e => setNumber(row.field!, e.target.value)}
                                        className="w-24 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50 tabular-nums"
                                    />
                                    <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 w-20">
                                        {row.unit}
                                    </span>
                                </div>
                            )}
                            {!row.field && <div className="w-[184px] hidden md:block" aria-hidden="true" />}

                            <button
                                role="switch"
                                aria-checked={on}
                                aria-label={`${on ? 'Disable' : 'Enable'} ${row.title}`}
                                onClick={() => toggle(row.key)}
                                className={
                                    'relative w-12 h-7 rounded-full transition-colors flex-shrink-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 ' +
                                    (on ? 'bg-indigo-600' : 'bg-slate-200 dark:bg-slate-700')
                                }
                            >
                                <span
                                    aria-hidden="true"
                                    className={
                                        'absolute top-1 w-5 h-5 rounded-full bg-white shadow transition-all ' +
                                        (on ? 'left-6' : 'left-1')
                                    }
                                />
                            </button>
                        </div>
                    );
                })}
            </div>

            {/* Severity */}
            <div className="bg-white dark:bg-slate-850 p-6 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm mt-6">
                <h4 className="font-bold text-slate-900 dark:text-white text-sm">Severity</h4>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 mb-5">
                    A row turns amber at the first number and red at the second, so the urgent items sort to the top.
                </p>
                <div className="flex items-end gap-6 flex-wrap">
                    <div>
                        <label className="block text-[11px] font-bold uppercase text-amber-500 tracking-wide mb-2">
                            Amber at
                        </label>
                        <input
                            type="number"
                            min={0}
                            value={local.severity.warn}
                            onChange={e => setSeverity('warn', e.target.value)}
                            className="w-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-amber-500 tabular-nums"
                        />
                    </div>
                    <div>
                        <label className="block text-[11px] font-bold uppercase text-rose-500 tracking-wide mb-2">
                            Red at
                        </label>
                        <input
                            type="number"
                            min={0}
                            value={local.severity.critical}
                            onChange={e => setSeverity('critical', e.target.value)}
                            className="w-28 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 font-black text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-rose-500 tabular-nums"
                        />
                    </div>
                    {severityInvalid && (
                        <p className="text-[11px] font-bold text-rose-500 pb-3">
                            Red must be a higher count than amber.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
};

export default NeedsAttentionSettingsView;
