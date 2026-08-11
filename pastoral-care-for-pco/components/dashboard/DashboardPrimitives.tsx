import React from 'react';
import { Area, AreaChart, ResponsiveContainer, YAxis } from 'recharts';
import { EYEBROW } from '../SharedUI';

/**
 * Shared building blocks for the dashboard overview page.
 *
 * The page is a vertical stack of sections rather than a widget grid, so a
 * section that a user may not see simply doesn't render and the ones below
 * close up behind it. Nothing here needs reflow logic.
 */

// ─── Formatting ───────────────────────────────────────────────────────────────

export const fmtNumber = (n: number): string => n.toLocaleString();

export const fmtCurrency = (n: number): string => {
    const abs = Math.abs(n);
    if (abs >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}m`;
    if (abs >= 10_000) return `$${Math.round(n / 1000)}k`;
    if (abs >= 1_000) return `$${(n / 1000).toFixed(1)}k`;
    return `$${Math.round(n).toLocaleString()}`;
};

export const fmtValue = (n: number, isCurrency?: boolean): string =>
    isCurrency ? fmtCurrency(n) : fmtNumber(n);

/** "14 minutes ago" / "3 days ago" — for the data-freshness line. */
export const fmtAgo = (ms: number | null): string => {
    if (ms === null) return 'never';
    const mins = Math.floor(ms / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins} minute${mins === 1 ? '' : 's'} ago`;
    const hours = Math.floor(mins / 60);
    if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
    const days = Math.floor(hours / 24);
    return `${days} day${days === 1 ? '' : 's'} ago`;
};

// ─── Section shell ────────────────────────────────────────────────────────────

interface SectionProps {
    title: string;
    /** Optional short line under the title. */
    caption?: React.ReactNode;
    /** Rendered at the far right of the header — usually a link into the module. */
    action?: React.ReactNode;
    children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({ title, caption, action, children }) => (
    <section className="mb-10 print:mb-6 print:break-inside-avoid">
        <div className="flex items-baseline justify-between gap-4 mb-4 flex-wrap">
            <div className="flex items-baseline gap-3 flex-wrap">
                <h3 className={EYEBROW}>{title}</h3>
                {caption && (
                    <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{caption}</span>
                )}
            </div>
            {action}
        </div>
        {children}
    </section>
);

/** The standard card surface used across the page. */
export const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
    <div
        className={
            'bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 ' +
            'shadow-sm print:shadow-none print:border-slate-200 ' + className
        }
    >
        {children}
    </div>
);

// ─── Delta chip ───────────────────────────────────────────────────────────────

/**
 * Week-over-week movement. Direction alone isn't meaning — a drop in "people
 * moved to At Risk" is good — so callers pass `higherIsBetter: false` where up
 * is the bad direction.
 */
export const DeltaChip: React.FC<{
    current: number;
    previous: number;
    isCurrency?: boolean;
    higherIsBetter?: boolean;
}> = ({ current, previous, isCurrency, higherIsBetter = true }) => {
    const diff = current - previous;
    if (diff === 0) {
        return (
            <span className="inline-flex items-center px-2 py-1 rounded-lg text-[11px] font-black bg-slate-50 text-slate-400 dark:bg-slate-800 dark:text-slate-500">
                —
            </span>
        );
    }
    const isUp = diff > 0;
    const isGood = higherIsBetter ? isUp : !isUp;
    const tone = isGood
        ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-900/20 dark:text-emerald-400'
        : 'text-rose-500 bg-rose-50 dark:bg-rose-900/20 dark:text-rose-400';

    return (
        <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-lg text-[11px] font-black tabular-nums ${tone}`}>
            <span aria-hidden="true">{isUp ? '▲' : '▼'}</span>
            <span>{fmtValue(Math.abs(diff), isCurrency)}</span>
            <span className="sr-only">{isUp ? 'up' : 'down'} from last week</span>
        </span>
    );
};

// ─── Sparkline ────────────────────────────────────────────────────────────────

const SPARK_COLORS: Record<string, string> = {
    indigo: '#6366f1',
    emerald: '#10b981',
    amber: '#f59e0b',
    violet: '#8b5cf6',
    cyan: '#06b6d4',
    rose: '#f43f5e',
};

/**
 * A small filled trend line. Deliberately axis-free — it reads as a shape, and
 * the exact figures live in the number beside it.
 */
export const Sparkline: React.FC<{
    points: { weekStart: string; value: number }[];
    color?: keyof typeof SPARK_COLORS | string;
    height?: number;
}> = ({ points, color = 'indigo', height = 44 }) => {
    const stroke = SPARK_COLORS[color] || SPARK_COLORS.indigo;
    const gradientId = React.useId();

    if (points.length === 0) {
        return <div style={{ height }} className="flex items-end text-[11px] text-slate-300 dark:text-slate-600">No data</div>;
    }

    return (
        <div style={{ height }} aria-hidden="true">
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 2, right: 0, bottom: 0, left: 0 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={stroke} stopOpacity={0.28} />
                            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    {/* Domain from 0 so a flat series doesn't render as a dramatic swing. */}
                    <YAxis hide domain={[0, 'dataMax']} />
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke={stroke}
                        strokeWidth={2}
                        fill={`url(#${gradientId})`}
                        isAnimationActive={false}
                        dot={false}
                    />
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

// ─── Empty state ──────────────────────────────────────────────────────────────

export const EmptyNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="text-sm font-medium text-slate-400 dark:text-slate-500 py-2">{children}</p>
);
