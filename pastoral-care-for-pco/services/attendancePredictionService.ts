/**
 * Attendance Prediction Service
 *
 * A pure-function analytics module (no database calls, no side effects) that
 * takes historical attendance data paired with weather observations and
 * produces forward-looking attendance predictions for each day in a supplied
 * weather forecast window.
 *
 * Algorithm overview:
 *   1. **Baseline** – Exponentially-weighted average attendance by day-of-week
 *      (weight = 0.9^weeksAgo so recent data dominates).
 *   2. **Weather coefficients** – Measured % deltas from baseline for rain,
 *      snow/ice, extreme heat, extreme cold, and high wind.  Falls back to
 *      sensible defaults when insufficient data points exist.
 *   3. **Trend adjustment** – Simple linear regression over the 90-day window
 *      to capture upward or downward momentum.
 *   4. **Prediction** – Combines baseline + weather + trend for each forecast
 *      day with confidence bands (±15 % near-term, ±25 % mid-term).
 */

import type { AttendanceRecord, WeatherRecord, AttendancePrediction } from '../types';

// ────────────────────────────────────────────────────────────────────────────
// Helpers
// ────────────────────────────────────────────────────────────────────────────

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Parse a YYYY-MM-DD date string into a local Date at midnight. */
const parseDate = (s: string): Date => {
    const [y, m, d] = s.split('-').map(Number);
    return new Date(y, m - 1, d);
};

/** Format a Date as YYYY-MM-DD. */
const toDateStr = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// ────────────────────────────────────────────────────────────────────────────
// Default weather coefficients (used when not enough data to measure)
// ────────────────────────────────────────────────────────────────────────────

const DEFAULT_RAIN_COEFF = -0.10;         // −10 %
const DEFAULT_SNOW_ICE_COEFF = -0.20;     // −20 %
const DEFAULT_EXTREME_HEAT_COEFF = -0.08; // −8 %
const DEFAULT_EXTREME_COLD_COEFF = -0.12; // −12 %
const DEFAULT_HIGH_WIND_COEFF = -0.07;    // −7 %

/** Minimum data points before we trust a measured coefficient over the default. */
const MIN_DATA_POINTS = 3;

// ────────────────────────────────────────────────────────────────────────────
// Step 1 – Baseline by day-of-week (exponential decay weighting)
// ────────────────────────────────────────────────────────────────────────────

interface DayOfWeekBaseline {
    /** Weighted average attendance for this day-of-week. */
    average: number;
    /** Number of raw data points used. */
    dataPoints: number;
}

function buildBaselines(attendance: AttendanceRecord[]): Map<number, DayOfWeekBaseline> {
    if (attendance.length === 0) return new Map();

    // Find the most recent date to compute weeksAgo
    const dates = attendance.map(a => parseDate(a.date));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

    // Buckets: dayOfWeek → { weightedSum, totalWeight, count }
    const buckets = new Map<number, { weightedSum: number; totalWeight: number; count: number }>();

    attendance.forEach(a => {
        const d = parseDate(a.date);
        const dow = d.getDay(); // 0=Sun … 6=Sat
        const weeksAgo = Math.max(0, (maxDate.getTime() - d.getTime()) / (7 * ONE_DAY_MS));
        const weight = Math.pow(0.9, weeksAgo);

        if (!buckets.has(dow)) buckets.set(dow, { weightedSum: 0, totalWeight: 0, count: 0 });
        const b = buckets.get(dow)!;
        b.weightedSum += a.count * weight;
        b.totalWeight += weight;
        b.count++;
    });

    const baselines = new Map<number, DayOfWeekBaseline>();
    buckets.forEach((b, dow) => {
        baselines.set(dow, {
            average: b.totalWeight > 0 ? b.weightedSum / b.totalWeight : 0,
            dataPoints: b.count,
        });
    });

    return baselines;
}

// ────────────────────────────────────────────────────────────────────────────
// Step 2 – Weather coefficient calculation
// ────────────────────────────────────────────────────────────────────────────

interface WeatherCoefficients {
    rain: number;
    snowIce: number;
    extremeHeat: number;
    extremeCold: number;
    highWind: number;
}

function computeWeatherCoefficients(
    attendance: AttendanceRecord[],
    weather: WeatherRecord[],
    baselines: Map<number, DayOfWeekBaseline>,
): WeatherCoefficients {
    // Build a weather lookup by date
    const weatherByDate = new Map<string, WeatherRecord>();
    weather.forEach(w => weatherByDate.set(w.date, w));

    // Accumulators: { totalDelta, count }
    const acc = {
        rain:        { totalDelta: 0, count: 0 },
        snowIce:     { totalDelta: 0, count: 0 },
        extremeHeat: { totalDelta: 0, count: 0 },
        extremeCold: { totalDelta: 0, count: 0 },
        highWind:    { totalDelta: 0, count: 0 },
    };

    attendance.forEach(a => {
        const w = weatherByDate.get(a.date);
        if (!w) return;

        const dow = parseDate(a.date).getDay();
        const baseline = baselines.get(dow);
        if (!baseline || baseline.average === 0) return;

        const pctChange = (a.count - baseline.average) / baseline.average;

        // Rain: precipProb > 50 %
        if (w.precipProb > 50) {
            acc.rain.totalDelta += pctChange;
            acc.rain.count++;
        }

        // Snow / Ice
        if (w.precipType && (w.precipType.includes('snow') || w.precipType.includes('ice'))) {
            acc.snowIce.totalDelta += pctChange;
            acc.snowIce.count++;
        }

        // Extreme heat: tempHigh > 95 °F
        if (w.tempHigh > 95) {
            acc.extremeHeat.totalDelta += pctChange;
            acc.extremeHeat.count++;
        }

        // Extreme cold: tempLow < 25 °F
        if (w.tempLow < 25) {
            acc.extremeCold.totalDelta += pctChange;
            acc.extremeCold.count++;
        }

        // High wind: windSpeed > 25 mph
        if ((w.windSpeed ?? 0) > 25) {
            acc.highWind.totalDelta += pctChange;
            acc.highWind.count++;
        }
    });

    const resolve = (a: { totalDelta: number; count: number }, fallback: number): number =>
        a.count >= MIN_DATA_POINTS ? a.totalDelta / a.count : fallback;

    return {
        rain:        resolve(acc.rain,        DEFAULT_RAIN_COEFF),
        snowIce:     resolve(acc.snowIce,     DEFAULT_SNOW_ICE_COEFF),
        extremeHeat: resolve(acc.extremeHeat, DEFAULT_EXTREME_HEAT_COEFF),
        extremeCold: resolve(acc.extremeCold, DEFAULT_EXTREME_COLD_COEFF),
        highWind:    resolve(acc.highWind,    DEFAULT_HIGH_WIND_COEFF),
    };
}

// ────────────────────────────────────────────────────────────────────────────
// Step 3 – Linear-regression trend (slope per week)
// ────────────────────────────────────────────────────────────────────────────

function computeTrendSlopePerWeek(attendance: AttendanceRecord[]): number {
    if (attendance.length < 2) return 0;

    const sorted = [...attendance].sort((a, b) => a.date.localeCompare(b.date));
    const epoch0 = parseDate(sorted[0].date).getTime();

    // x = days since first record, y = count
    const xs = sorted.map(a => (parseDate(a.date).getTime() - epoch0) / ONE_DAY_MS);
    const ys = sorted.map(a => a.count);

    const n = xs.length;
    const sumX = xs.reduce((s, v) => s + v, 0);
    const sumY = ys.reduce((s, v) => s + v, 0);
    const sumXY = xs.reduce((s, v, i) => s + v * ys[i], 0);
    const sumX2 = xs.reduce((s, v) => s + v * v, 0);

    const denom = n * sumX2 - sumX * sumX;
    if (denom === 0) return 0;

    const slopePerDay = (n * sumXY - sumX * sumY) / denom;
    return slopePerDay * 7; // convert to per-week
}

// ────────────────────────────────────────────────────────────────────────────
// Step 4 – Prediction generation
// ────────────────────────────────────────────────────────────────────────────

/**
 * Given the applicable weather coefficients for a single forecast day, return
 * a combined multiplier and an array of human-readable factor strings.
 */
function applyWeatherFactors(
    w: WeatherRecord,
    coeffs: WeatherCoefficients,
): { multiplier: number; factors: string[] } {
    let multiplier = 1;
    const factors: string[] = [];

    // Rain
    if (w.precipProb > 50) {
        multiplier += coeffs.rain;
        factors.push(`Rain expected (${Math.round(w.precipProb)}% chance) → ${formatPct(coeffs.rain)}`);
    }

    // Snow / Ice
    if (w.precipType && (w.precipType.includes('snow') || w.precipType.includes('ice'))) {
        multiplier += coeffs.snowIce;
        factors.push(`Snow/ice forecast → ${formatPct(coeffs.snowIce)}`);
    }

    // Extreme heat
    if (w.tempHigh > 95) {
        multiplier += coeffs.extremeHeat;
        factors.push(`Extreme heat (${Math.round(w.tempHigh)}°F high) → ${formatPct(coeffs.extremeHeat)}`);
    }

    // Extreme cold
    if (w.tempLow < 25) {
        multiplier += coeffs.extremeCold;
        factors.push(`Extreme cold (${Math.round(w.tempLow)}°F low) → ${formatPct(coeffs.extremeCold)}`);
    }

    // High wind
    if ((w.windSpeed ?? 0) > 25) {
        multiplier += coeffs.highWind;
        factors.push(`High wind (${Math.round(w.windSpeed!)} mph) → ${formatPct(coeffs.highWind)}`);
    }

    if (factors.length === 0) {
        factors.push('Clear skies, mild temps → baseline');
    }

    return { multiplier, factors };
}

/** Format a fractional coefficient as a signed percentage string (e.g. "-10%"). */
function formatPct(value: number): string {
    const pct = Math.round(value * 100);
    return pct >= 0 ? `+${pct}%` : `${pct}%`;
}

// ────────────────────────────────────────────────────────────────────────────
// Main export
// ────────────────────────────────────────────────────────────────────────────

/**
 * Predict future attendance for each day in `forecastWeather`.
 *
 * @param attendance   Last 90 days of attendance records.
 * @param weather      Historical weather observations matched to attendance dates.
 * @param forecastWeather  Next 14 days of forecast weather.
 * @returns Sorted array of `AttendancePrediction` objects, one per forecast day.
 */
export function predictAttendance(
    attendance: AttendanceRecord[],
    weather: WeatherRecord[],
    forecastWeather: WeatherRecord[],
): AttendancePrediction[] {
    // Edge case: not enough attendance data
    if (attendance.length < 4) return [];

    // Step 1 – Build day-of-week baselines
    const baselines = buildBaselines(attendance);

    // Step 2 – Compute weather coefficients
    const coefficients = computeWeatherCoefficients(attendance, weather, baselines);

    // Step 3 – Compute linear trend (slope per week)
    const trendPerWeek = computeTrendSlopePerWeek(attendance);

    // Determine "today" for calculating days-out and weeks-out
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Overall average attendance (fallback when a day-of-week has no baseline)
    const overallAvg = attendance.reduce((s, a) => s + a.count, 0) / attendance.length;

    const predictions: AttendancePrediction[] = forecastWeather.map(fw => {
        const forecastDate = parseDate(fw.date);
        const dow = forecastDate.getDay();
        const daysOut = Math.max(0, Math.round((forecastDate.getTime() - today.getTime()) / ONE_DAY_MS));
        const weeksOut = daysOut / 7;

        // Baseline for this day-of-week (fallback to overall average)
        const baseline = baselines.get(dow)?.average ?? overallAvg;

        // Weather adjustment
        const { multiplier, factors } = applyWeatherFactors(fw, coefficients);

        // Trend adjustment (per-week slope × weeks out)
        const trendAdjustment = trendPerWeek * weeksOut;

        // Combined prediction
        const predicted = Math.round(baseline * multiplier + trendAdjustment);

        // Trend factor description
        if (Math.abs(trendPerWeek) >= 0.5) {
            const trendPct = baseline > 0 ? (trendPerWeek / baseline) * 100 : 0;
            const sign = trendPct >= 0 ? '+' : '';
            factors.push(`Attendance trending ${trendPct >= 0 ? 'up' : 'down'} ${sign}${trendPct.toFixed(1)}%/week`);
        }

        // Confidence range
        const confidencePct = daysOut <= 3 ? 0.15 : 0.25;
        const low = Math.max(0, Math.round(predicted * (1 - confidencePct)));
        const high = Math.round(predicted * (1 + confidencePct));

        return {
            date: fw.date,
            predictedAttendance: Math.max(0, predicted),
            confidenceRange: { low, high },
            weatherForecast: fw,
            factors,
        };
    });

    // Sort by date ascending
    predictions.sort((a, b) => a.date.localeCompare(b.date));

    return predictions;
}

// ────────────────────────────────────────────────────────────────────────────
// Helper: Weather severity (for UI display)
// ────────────────────────────────────────────────────────────────────────────

/**
 * Get weather condition severity for display purposes.
 *
 * - **good**: Clear/partly cloudy, moderate temps (40–90 °F), low precip (< 30 %).
 * - **moderate**: Overcast, light rain/drizzle, precip 30–60 %, slightly outside moderate temps.
 * - **severe**: Heavy rain/snow/ice, precip > 60 %, extreme temps, high wind > 25 mph.
 */
export function getWeatherSeverity(weather: WeatherRecord): 'good' | 'moderate' | 'severe' {
    const hasSnowOrIce = weather.precipType &&
        (weather.precipType.includes('snow') || weather.precipType.includes('ice'));

    // ── Severe ──────────────────────────────────────────────────────────
    if (hasSnowOrIce) return 'severe';
    if (weather.precipProb > 60) return 'severe';
    if (weather.tempHigh > 95 || weather.tempLow < 25) return 'severe';
    if ((weather.windSpeed ?? 0) > 25) return 'severe';

    // ── Moderate ────────────────────────────────────────────────────────
    if (weather.precipProb >= 30) return 'moderate';
    if (weather.tempHigh > 90 || weather.tempLow < 40) return 'moderate';

    // ── Good ────────────────────────────────────────────────────────────
    return 'good';
}
