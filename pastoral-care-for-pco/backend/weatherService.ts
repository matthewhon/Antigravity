/**
 * weatherService.ts
 * ─────────────────
 * Visual Crossing Timeline API client for historical and forecast weather data.
 * Used by the attendance prediction feature to correlate weather with headcounts.
 *
 * All functions accept a ZIP code directly — Visual Crossing resolves it
 * internally, so no geocoding step is needed.
 *
 * API Docs: https://www.visualcrossing.com/resources/documentation/weather-api/timeline-weather-api/
 */

import type { WeatherRecord } from '../types';

const VC_BASE = 'https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline';

// Shared options for all Visual Crossing requests
const VC_PARAMS = 'unitGroup=us&include=days&contentType=json';

/**
 * Maps a single Visual Crossing "day" object to our WeatherRecord.
 * The `churchId` must be set by the caller since the API doesn't know about tenants.
 */
function mapDayToWeatherRecord(day: any, churchId: string): WeatherRecord {
    return {
        id: `${churchId}_${day.datetime}`,
        churchId,
        date: day.datetime,                              // YYYY-MM-DD
        tempHigh: day.tempmax ?? 0,                      // °F
        tempLow: day.tempmin ?? 0,
        feelsLikeHigh: day.feelslikemax ?? undefined,
        humidity: day.humidity ?? undefined,
        precipProb: day.precipprob ?? 0,                 // 0–100
        precipAmount: day.precip ?? 0,                   // inches
        precipType: Array.isArray(day.preciptype) ? day.preciptype[0] ?? null : day.preciptype ?? null,
        snowDepth: day.snowdepth ?? undefined,
        windSpeed: day.windspeed ?? undefined,
        windGust: day.windgust ?? undefined,
        visibility: day.visibility ?? undefined,
        cloudCover: day.cloudcover ?? undefined,
        uvIndex: day.uvindex ?? undefined,
        conditions: day.conditions ?? 'Unknown',
        icon: day.icon ?? undefined,
        source: 'visual_crossing',
        fetchedAt: Date.now(),
    };
}

/**
 * Fetch weather for a single historical date.
 * Uses the Timeline API: GET /{location}/{date}
 */
export async function fetchHistoricalWeather(
    apiKey: string,
    zip: string,
    date: string,
    churchId: string
): Promise<WeatherRecord> {
    const url = `${VC_BASE}/${encodeURIComponent(zip)}/${date}?${VC_PARAMS}&key=${apiKey}`;
    const res = await fetchWithRetry(url);
    const data = await res.json();

    if (!data.days || data.days.length === 0) {
        throw new Error(`No weather data returned for ${zip} on ${date}`);
    }

    return mapDayToWeatherRecord(data.days[0], churchId);
}

/**
 * Fetch weather for a date range (inclusive). More efficient than individual
 * calls — Visual Crossing supports ranges in a single request.
 *
 * Timeline API: GET /{location}/{startDate}/{endDate}
 */
export async function fetchWeatherRange(
    apiKey: string,
    zip: string,
    startDate: string,
    endDate: string,
    churchId: string
): Promise<WeatherRecord[]> {
    const url = `${VC_BASE}/${encodeURIComponent(zip)}/${startDate}/${endDate}?${VC_PARAMS}&key=${apiKey}`;
    const res = await fetchWithRetry(url);
    const data = await res.json();

    if (!data.days || data.days.length === 0) {
        console.warn(`[WeatherService] No weather data for ${zip} ${startDate}–${endDate}`);
        return [];
    }

    return data.days.map((day: any) => mapDayToWeatherRecord(day, churchId));
}

/**
 * Fetch upcoming weather forecast.
 * Timeline API without a date defaults to a 15-day forecast.
 * We request "next{days}days" to control the window.
 *
 * GET /{location}/next14days
 */
export async function fetchWeatherForecast(
    apiKey: string,
    zip: string,
    days: number,
    churchId: string
): Promise<WeatherRecord[]> {
    const url = `${VC_BASE}/${encodeURIComponent(zip)}/next${days}days?${VC_PARAMS}&key=${apiKey}`;
    const res = await fetchWithRetry(url);
    const data = await res.json();

    if (!data.days || data.days.length === 0) {
        console.warn(`[WeatherService] No forecast data for ${zip}`);
        return [];
    }

    return data.days.map((day: any) => mapDayToWeatherRecord(day, churchId));
}

// ── Retry / rate-limit helper ─────────────────────────────────────────────────

const MAX_RETRIES = 3;
const RETRY_DELAYS = [1000, 3000, 8000]; // exponential-ish backoff

async function fetchWithRetry(url: string, attempt = 0): Promise<Response> {
    const res = await fetch(url);

    // 429 Too Many Requests — Visual Crossing rate limit
    if (res.status === 429 && attempt < MAX_RETRIES) {
        const delay = RETRY_DELAYS[attempt] ?? 8000;
        console.warn(`[WeatherService] Rate limited (429). Retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await new Promise(resolve => setTimeout(resolve, delay));
        return fetchWithRetry(url, attempt + 1);
    }

    if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Visual Crossing API error ${res.status}: ${body.slice(0, 200)}`);
    }

    return res;
}
