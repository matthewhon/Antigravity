import type { DayOfWeek, TimeWindow, User, UserCallingPreferences } from '../types';

export interface AvailabilityResult {
    available: boolean;
    reason?: 'dnd' | 'date_override' | 'outside_hours' | 'day_disabled' | 'emergency_bypass';
    dndReason?: string;
}

const WEEKDAY_MAP: Record<string, DayOfWeek> = {
    sun: 'sun',
    mon: 'mon',
    tue: 'tue',
    wed: 'wed',
    thu: 'thu',
    fri: 'fri',
    sat: 'sat',
};

const PREV_DAY: Record<DayOfWeek, DayOfWeek> = {
    sun: 'sat',
    mon: 'sun',
    tue: 'mon',
    wed: 'tue',
    thu: 'wed',
    fri: 'thu',
    sat: 'fri',
};

export function defaultCallingPreferences(timezone = 'America/Chicago'): UserCallingPreferences {
    const weekday = { enabled: true, windows: [{ start: '09:00', end: '17:00' }] };
    const weekend = { enabled: false, windows: [{ start: '09:00', end: '17:00' }] };
    return {
        timezone,
        callingHoursEnabled: false,
        schedule: {
            sun: { ...weekend, windows: [...weekend.windows] },
            mon: { ...weekday, windows: [...weekday.windows] },
            tue: { ...weekday, windows: [...weekday.windows] },
            wed: { ...weekday, windows: [...weekday.windows] },
            thu: { ...weekday, windows: [...weekday.windows] },
            fri: { ...weekday, windows: [...weekday.windows] },
            sat: { ...weekend, windows: [...weekend.windows] },
        },
        dateOverrides: [],
        dndOverride: { active: false, until: null, reason: '' },
        allowEmergencyBypass: false,
        voicemail: {
            enabled: true,
            greetingType: 'tts',
            greetingText: 'Sorry I missed your call. Please leave a message after the tone and I will get back to you soon.',
            maxLengthSec: 120,
            transcribeEnabled: true,
            notifyChannels: { push: true, email: false, sms: false },
        },
    };
}

function parseHhMmToMinutes(hhmm: string): number | null {
    const m = /^(\d{1,2}):(\d{2})$/.exec(String(hhmm || '').trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
}

function getLocalDateParts(nowMs: number, timeZone: string): {
    dateStr: string; // YYYY-MM-DD
    dayKey: DayOfWeek;
    minutesOfDay: number;
} {
    let tz = timeZone || 'America/Chicago';
    let parts: Intl.DateTimeFormatPart[];
    try {
        parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(new Date(nowMs));
    } catch {
        tz = 'UTC';
        parts = new Intl.DateTimeFormat('en-US', {
            timeZone: tz,
            year: 'numeric',
            month: '2-digit',
            day: '2-digit',
            weekday: 'short',
            hour: '2-digit',
            minute: '2-digit',
            hourCycle: 'h23',
        }).formatToParts(new Date(nowMs));
    }

    const get = (type: string) => parts.find((p) => p.type === type)?.value || '';
    const year = get('year');
    const month = get('month');
    const day = get('day');
    const weekdayRaw = get('weekday').toLowerCase().slice(0, 3);
    const hour = Number(get('hour')) % 24;
    const minute = Number(get('minute'));

    return {
        dateStr: `${year}-${month}-${day}`,
        dayKey: WEEKDAY_MAP[weekdayRaw] || 'mon',
        minutesOfDay: hour * 60 + minute,
    };
}

function isTimeInSameDayWindows(minutesOfDay: number, windows: TimeWindow[]): boolean {
    for (const w of windows) {
        const start = parseHhMmToMinutes(w.start);
        const end = parseHhMmToMinutes(w.end);
        if (start === null || end === null) continue;
        if (start <= end) {
            if (minutesOfDay >= start && minutesOfDay < end) return true;
        } else {
            // Overnight window starting today (e.g., 22:00 -> 06:00): active from start..1440
            if (minutesOfDay >= start) return true;
        }
    }
    return false;
}

function isTimeInOvernightTail(minutesOfDay: number, windows: TimeWindow[]): boolean {
    for (const w of windows) {
        const start = parseHhMmToMinutes(w.start);
        const end = parseHhMmToMinutes(w.end);
        if (start === null || end === null) continue;
        if (start > end && minutesOfDay < end) {
            return true;
        }
    }
    return false;
}

export function evaluateScheduleAvailability(params: {
    timezone: string;
    schedule?: Record<DayOfWeek, { enabled: boolean; windows: TimeWindow[] }>;
    dateOverrides?: Array<{
        date: string;
        label?: string;
        available: boolean;
        windows?: TimeWindow[];
    }>;
    nowMs?: number;
}): AvailabilityResult {
    const nowMs = params.nowMs ?? Date.now();
    const { dateStr, dayKey, minutesOfDay } = getLocalDateParts(nowMs, params.timezone);

    // 1. Check specific date override first
    if (Array.isArray(params.dateOverrides)) {
        const override = params.dateOverrides.find((o) => o.date === dateStr);
        if (override) {
            if (!override.available) {
                return { available: false, reason: 'date_override' };
            }
            if (Array.isArray(override.windows) && override.windows.length > 0) {
                const inWin = isTimeInSameDayWindows(minutesOfDay, override.windows);
                return inWin ? { available: true } : { available: false, reason: 'date_override' };
            }
            return { available: true };
        }
    }

    // 2. Check weekly schedule
    const schedule = params.schedule;
    if (!schedule) return { available: true };

    const prevDayConfig = schedule[PREV_DAY[dayKey]];
    if (prevDayConfig?.enabled && Array.isArray(prevDayConfig.windows)) {
        if (isTimeInOvernightTail(minutesOfDay, prevDayConfig.windows)) {
            return { available: true };
        }
    }

    const todayConfig = schedule[dayKey];
    if (!todayConfig || !todayConfig.enabled) {
        return { available: false, reason: 'day_disabled' };
    }

    const windows = Array.isArray(todayConfig.windows) ? todayConfig.windows : [];
    if (windows.length === 0) {
        return { available: false, reason: 'day_disabled' };
    }

    return isTimeInSameDayWindows(minutesOfDay, windows)
        ? { available: true }
        : { available: false, reason: 'outside_hours' };
}

export function evaluateUserAvailability(
    user: Partial<User> | Record<string, any> | null | undefined,
    churchTimezone = 'America/Chicago',
    nowMs = Date.now(),
    options?: { ignoreHoursForEmergency?: boolean }
): AvailabilityResult {
    if (!user) return { available: false, reason: 'dnd' };
    const prefs: UserCallingPreferences | undefined = user.callingPreferences;
    if (!prefs) return { available: true };

    // 1. Do Not Disturb override always takes precedence unless expired
    if (prefs.dndOverride?.active) {
        const until = prefs.dndOverride.until;
        if (!until || until > nowMs) {
            return {
                available: false,
                reason: 'dnd',
                dndReason: prefs.dndOverride.reason || undefined,
            };
        }
    }

    // 2. Emergency bypass check
    if (options?.ignoreHoursForEmergency && prefs.allowEmergencyBypass) {
        return { available: true, reason: 'emergency_bypass' };
    }

    // 3. If calling hours are disabled, user is available 24/7
    if (!prefs.callingHoursEnabled) {
        return { available: true };
    }

    return evaluateScheduleAvailability({
        timezone: prefs.timezone || churchTimezone || 'America/Chicago',
        schedule: prefs.schedule,
        dateOverrides: prefs.dateOverrides,
        nowMs,
    });
}
