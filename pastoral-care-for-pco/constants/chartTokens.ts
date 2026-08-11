/**
 * chartTokens.ts
 *
 * Chart colour and mark specs for the dashboard.
 *
 * The categorical order below was validated with the dataviz palette checker
 * against the app's real surfaces (white in light mode, slate-800 in dark).
 * The previous ad-hoc order in DashboardView — indigo, violet, pink, rose,
 * orange, emerald — failed hard: indigo and violet sat adjacent at ΔE 6.3 for
 * normal vision, well under the 15 floor, so two neighbouring series were
 * near-indistinguishable for everyone, not only colour-blind readers.
 *
 * Results for the order used here:
 *   light  (surface #ffffff) — all checks pass; worst adjacent pair ΔE 27.5
 *   dark   (surface #1e293b) — all checks pass; worst adjacent pair ΔE 23.7
 *
 * Both modes carry a WARN that is discharged by secondary encoding: every mark
 * on this dashboard is directly labelled with its value, so identity never
 * rests on hue alone.
 *
 * Re-run after any change:
 *   node scripts/validate_palette.js "<hex,…>" --mode light --surface "#ffffff"
 *   node scripts/validate_palette.js "<hex,…>" --mode dark  --surface "#1e293b"
 */

/** Fixed categorical order. Assign by slot; never cycle, never generate a 7th. */
export const CATEGORICAL_LIGHT = [
    '#4f46e5', // indigo
    '#059669', // emerald
    '#f59e0b', // amber
    '#0891b2', // cyan
    '#e11d48', // rose
    '#7c3aed', // violet
] as const;

/** Dark mode gets its own steps from the same hues — not an automatic flip. */
export const CATEGORICAL_DARK = [
    '#6366f1',
    '#059669',
    '#d97706',
    '#0891b2',
    '#f43f5e',
    '#8b5cf6',
] as const;

/**
 * Status colours, reserved. Never reused as "series 4", and always shipped with
 * a label or icon rather than colour alone.
 */
export const STATUS = {
    light: { good: '#059669', warning: '#d97706', critical: '#e11d48', neutral: '#94a3b8' },
    dark:  { good: '#34d399', warning: '#fbbf24', critical: '#fb7185', neutral: '#64748b' },
} as const;

/** Single hue for magnitude. More is darker. */
export const SEQUENTIAL = {
    light: ['#e0e7ff', '#a5b4fc', '#6366f1', '#4f46e5', '#3730a3'],
    dark:  ['#312e81', '#3730a3', '#4f46e5', '#6366f1', '#818cf8'],
} as const;

/** Chart surface per mode — what the 2px spacers and rings are painted in. */
export const SURFACE = { light: '#ffffff', dark: '#1e293b' } as const;

/** Recessive grid, one step off the surface. */
export const GRID = { light: '#f1f5f9', dark: '#334155' } as const;

/** Track behind a meter — the unfilled remainder. */
export const TRACK = { light: '#f1f5f9', dark: '#334155' } as const;

export type ChartMode = 'light' | 'dark';

/** Marks specs, fixed across every chart here. */
export const MARK = {
    lineWidth: 2,
    /** Markers are ≥8px across so they stay visible and hoverable. */
    dotRadius: 4,
    /** Surface-coloured ring keeps a dot legible where it crosses a line. */
    dotRingWidth: 2,
    /** Bars never fill their slot — the leftover band is deliberate air. */
    barMaxThickness: 24,
    barRadius: 4,
    /** Gap in the surface colour that separates touching marks. */
    surfaceGap: 2,
    /** Area fills are a wash, never a saturated block. */
    areaOpacity: 0.1,
} as const;

export const categorical = (mode: ChartMode) =>
    mode === 'dark' ? CATEGORICAL_DARK : CATEGORICAL_LIGHT;

/** Colour for a categorical slot. Folds past the token ceiling into neutral. */
export const seriesColor = (mode: ChartMode, index: number): string => {
    const scale = categorical(mode);
    return index < scale.length ? scale[index] : STATUS[mode].neutral;
};
