import React from 'react';
import { Area, AreaChart, ReferenceDot, ResponsiveContainer, Tooltip, YAxis } from 'recharts';
import { EYEBROW } from '../SharedUI';
import { ChartMode, GRID, MARK, STATUS, SURFACE, TRACK, seriesColor } from '../../constants/chartTokens';

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

/** Collapse wiring every section accepts and forwards to `Section`. */
export interface SectionControls {
    isCollapsed?: boolean;
    onToggleCollapse?: () => void;
}

interface SectionProps extends SectionControls {
    title: string;
    /** Optional short line under the title. */
    caption?: React.ReactNode;
    /** Rendered at the far right of the header — usually a link into the module. */
    action?: React.ReactNode;
    children: React.ReactNode;
}

export const Section: React.FC<SectionProps> = ({
    title, caption, action, onToggleCollapse, isCollapsed = false, children,
}: SectionProps) => {
    const heading = (
        <div className="flex items-baseline gap-3 flex-wrap">
            <h3 className={EYEBROW}>{title}</h3>
            {caption && !isCollapsed && (
                <span className="text-[11px] font-medium text-slate-400 dark:text-slate-500">{caption}</span>
            )}
        </div>
    );

    return (
        <section className="mb-10 print:mb-6 print:break-inside-avoid">
            <div className="flex items-baseline justify-between gap-4 mb-4 flex-wrap">
                {onToggleCollapse ? (
                    <button
                        type="button"
                        onClick={onToggleCollapse}
                        aria-expanded={!isCollapsed}
                        className="flex items-baseline gap-2 group focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded print:hidden"
                    >
                        <span
                            aria-hidden="true"
                            className={
                                'text-slate-300 dark:text-slate-600 group-hover:text-indigo-500 transition-all text-[10px] ' +
                                (isCollapsed ? '-rotate-90' : '')
                            }
                        >
                            ▼
                        </span>
                        {heading}
                    </button>
                ) : (
                    heading
                )}
                {!isCollapsed && action}
            </div>
            {!isCollapsed && children}
        </section>
    );
};

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

// ─── Theme detection ──────────────────────────────────────────────────────────

/**
 * Charts need their palette as values, not classes, so they can't lean on
 * Tailwind's `dark:` variants. Dark mode gets its own validated steps.
 */
export const useChartMode = (): ChartMode => {
    const [mode, setMode] = React.useState<ChartMode>(() =>
        typeof document !== 'undefined' && document.documentElement.classList.contains('dark')
            ? 'dark' : 'light'
    );

    React.useEffect(() => {
        if (typeof document === 'undefined') return;
        const root = document.documentElement;
        const sync = () => setMode(root.classList.contains('dark') ? 'dark' : 'light');
        sync();
        const observer = new MutationObserver(sync);
        observer.observe(root, { attributes: true, attributeFilter: ['class'] });
        return () => observer.disconnect();
    }, []);

    return mode;
};

// ─── Sparkline ────────────────────────────────────────────────────────────────

interface SparklineProps {
    points: { weekStart: string; value: number }[];
    /** Slot in the fixed categorical order. */
    slot?: number;
    height?: number;
    /** Emphasised end marker — the "you are here" of a trend line. */
    showEndDot?: boolean;
    isCurrency?: boolean;
}

/**
 * A small filled trend line: 2px stroke, 10% area wash, and an end-dot with a
 * surface ring so it stays legible where it meets the line. Deliberately
 * axis-free — the magnitude lives in the number beside it.
 */
export const Sparkline: React.FC<SparklineProps> = ({
    points, slot = 0, height = 44, showEndDot = false, isCurrency,
}: SparklineProps) => {
    const mode = useChartMode();
    const stroke = seriesColor(mode, slot);
    const gradientId = React.useId();

    if (points.length === 0) {
        return (
            <div style={{ height }} className="flex items-end text-[11px] text-slate-300 dark:text-slate-600">
                No data
            </div>
        );
    }

    const last = points[points.length - 1];

    return (
        <div style={{ height }}>
            <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={points} margin={{ top: 4, right: 5, bottom: 0, left: 0 }}>
                    <defs>
                        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
                            <stop offset="0%" stopColor={stroke} stopOpacity={MARK.areaOpacity * 2.8} />
                            <stop offset="100%" stopColor={stroke} stopOpacity={0} />
                        </linearGradient>
                    </defs>
                    {/* From 0 so a flat series doesn't render as a dramatic swing. */}
                    <YAxis hide domain={[0, 'dataMax']} />
                    <Tooltip
                        cursor={{ stroke: GRID[mode], strokeWidth: 1 }}
                        content={({ active, payload }) => {
                            if (!active || !payload?.length) return null;
                            const p = payload[0].payload as { weekStart: string; value: number };
                            return (
                                <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg px-3 py-2 shadow-lg">
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">
                                        week of {p.weekStart}
                                    </p>
                                    <p className="text-sm font-black tabular-nums text-slate-900 dark:text-white">
                                        {fmtValue(p.value, isCurrency)}
                                    </p>
                                </div>
                            );
                        }}
                    />
                    <Area
                        type="monotone"
                        dataKey="value"
                        stroke={stroke}
                        strokeWidth={MARK.lineWidth}
                        strokeLinejoin="round"
                        strokeLinecap="round"
                        fill={`url(#${gradientId})`}
                        isAnimationActive={false}
                        dot={false}
                        activeDot={{ r: MARK.dotRadius + 1, fill: stroke, stroke: SURFACE[mode], strokeWidth: MARK.dotRingWidth }}
                    />
                    {showEndDot && (
                        <ReferenceDot
                            x={last.weekStart}
                            y={last.value}
                            r={MARK.dotRadius}
                            fill={stroke}
                            stroke={SURFACE[mode]}
                            strokeWidth={MARK.dotRingWidth}
                            isFront
                        />
                    )}
                </AreaChart>
            </ResponsiveContainer>
        </div>
    );
};

// ─── Meter ────────────────────────────────────────────────────────────────────

/**
 * A single ratio against a limit — the right form for a rate, where a pie of
 * two slices would be wrong. Same-hue track, value labelled directly.
 */
export const Meter: React.FC<{ value: number; label: string; slot?: number }> = ({
    value, label, slot = 0,
}) => {
    const mode = useChartMode();
    const pct = Math.max(0, Math.min(100, value));
    return (
        <div>
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-2xl font-black tracking-tighter tabular-nums text-slate-900 dark:text-white">
                    {pct}%
                </p>
            </div>
            <div
                className="mt-2 h-1.5 w-full rounded-full overflow-hidden"
                style={{ background: TRACK[mode] }}
                role="img"
                aria-label={`${label}: ${pct} percent`}
            >
                <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: seriesColor(mode, slot) }}
                />
            </div>
            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-1.5">
                {label}
            </p>
        </div>
    );
};

// ─── Magnitude bar ────────────────────────────────────────────────────────────

/**
 * Relative magnitude within a list, in the status hue for its severity. Gives a
 * severity-ordered list a shape to scan as well as numbers to read.
 */
export const MagnitudeBar: React.FC<{
    value: number;
    max: number;
    tone: 'good' | 'warning' | 'critical' | 'neutral';
}> = ({ value, max, tone }) => {
    const mode = useChartMode();
    const pct = max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 0;
    return (
        <div className="h-1 w-full rounded-full overflow-hidden" style={{ background: TRACK[mode] }} aria-hidden="true">
            <div className="h-full rounded-full" style={{ width: `${pct}%`, background: STATUS[mode][tone] }} />
        </div>
    );
};

// ─── Status bar (part-to-whole) ───────────────────────────────────────────────

interface StatusSegment {
    label: string;
    count: number;
    tone: 'good' | 'warning' | 'critical';
}

/**
 * A horizontal stacked bar for classes that mean good→bad, so they wear status
 * colours rather than categorical ones. Segments are separated by a 2px gap in
 * the surface colour, and every segment carries a labelled legend key — colour
 * is never the only channel.
 */
export const StatusBar: React.FC<{ title: string; segments: StatusSegment[] }> = ({ title, segments }) => {
    const mode = useChartMode();
    const total = segments.reduce((sum, s) => sum + s.count, 0);
    if (total === 0) return null;

    return (
        <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mb-3">
                {title}
            </p>
            <div
                className="flex w-full h-3 rounded-full overflow-hidden"
                style={{ gap: MARK.surfaceGap, background: TRACK[mode] }}
                role="img"
                aria-label={segments.map(s => `${s.label} ${s.count}`).join(', ')}
            >
                {segments.filter(s => s.count > 0).map(s => (
                    <div
                        key={s.label}
                        style={{ width: `${(s.count / total) * 100}%`, background: STATUS[mode][s.tone] }}
                        title={`${s.label}: ${s.count.toLocaleString()}`}
                    />
                ))}
            </div>
            <div className="flex gap-5 mt-3 flex-wrap">
                {segments.map(s => (
                    <span key={s.label} className="inline-flex items-center gap-2">
                        <span
                            aria-hidden="true"
                            className="w-2 h-2 rounded-full flex-shrink-0"
                            style={{ background: STATUS[mode][s.tone] }}
                        />
                        <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400">
                            {s.label}
                        </span>
                        <span className="text-[11px] font-black tabular-nums text-slate-900 dark:text-white">
                            {fmtNumber(s.count)}
                        </span>
                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 tabular-nums">
                            {Math.round((s.count / total) * 100)}%
                        </span>
                    </span>
                ))}
            </div>
        </div>
    );
};

// ─── Empty state ──────────────────────────────────────────────────────────────

export const EmptyNote: React.FC<{ children: React.ReactNode }> = ({ children }) => (
    <p className="text-sm font-medium text-slate-400 dark:text-slate-500 py-2">{children}</p>
);
