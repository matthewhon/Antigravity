import { Capacitor, registerPlugin, PluginListenerHandle } from '@capacitor/core';
import { PcoPerson } from '../types';

export interface CelebrationItem {
  id: string;
  person: PcoPerson;
  type: 'birthday' | 'anniversary';
  dateStr: string;
  formattedDate: string;
  years: number | null;
}

export interface CelebrationNotificationSettings {
  enabled: boolean;
  time: string; // "HH:MM" in 24h format, default "08:00"
}

export interface ScheduledCelebrationPayload {
  id: number;
  dateKey: string; // "YYYY-MM-DD"
  title: string;
  body: string;
  triggerAtMs: number;
}

interface CelebrationNotificationsPluginInterface {
  requestPermissions(): Promise<{ granted: boolean }>;
  scheduleNotifications(options: { notifications: ScheduledCelebrationPayload[] }): Promise<void>;
  cancelAll(): Promise<void>;
  addListener(
    eventName: 'celebrationNotificationTapped',
    listenerFunc: (data: { dateKey?: string }) => void
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'celebrationNotificationReceived',
    listenerFunc: (data: { title?: string; body?: string; dateKey?: string }) => void
  ): Promise<PluginListenerHandle>;
}

export const CelebrationNotificationsNative = registerPlugin<CelebrationNotificationsPluginInterface>(
  'CelebrationNotifications'
);

const SETTINGS_ENABLED_KEY = 'pc_celebration_notifications_enabled';
const SETTINGS_TIME_KEY = 'pc_celebration_notifications_time';
const LAST_NOTIFIED_DATE_KEY = 'pc_celebration_last_notified_date';

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
];

export function getCelebrationSettings(): CelebrationNotificationSettings {
  const rawEnabled = localStorage.getItem(SETTINGS_ENABLED_KEY);
  const enabled = rawEnabled === null ? true : rawEnabled === 'true';
  const rawTime = localStorage.getItem(SETTINGS_TIME_KEY) || '08:00';
  const time = /^\d{2}:\d{2}$/.test(rawTime) ? rawTime : '08:00';
  return { enabled, time };
}

export function saveCelebrationSettings(settings: CelebrationNotificationSettings): void {
  localStorage.setItem(SETTINGS_ENABLED_KEY, String(settings.enabled));
  localStorage.setItem(SETTINGS_TIME_KEY, settings.time);
  window.dispatchEvent(new CustomEvent('celebrationSettingsChanged', { detail: settings }));
}

export function formatTime12Hour(time24: string): string {
  const [hStr, mStr] = (time24 || '08:00').split(':');
  const h = parseInt(hStr, 10);
  const m = parseInt(mStr, 10);
  if (isNaN(h) || isNaN(m)) return '8:00 AM';
  const period = h >= 12 ? 'PM' : 'AM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function toLocalDateKey(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Parse a calendar date string (YYYY-MM-DD, MM/DD/YYYY, or MM-DD) into
 * location-agnostic { year, month, day } integers without UTC timezone shift.
 */
export function parseMonthDayYear(raw?: string | null): { year: number | null; month: number; day: number } | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;

  // ISO YYYY-MM-DD or MM-DD
  if (trimmed.includes('-')) {
    const parts = trimmed.split('T')[0].split('-').map(p => parseInt(p, 10));
    if (parts.length === 3 && !isNaN(parts[0]) && !isNaN(parts[1]) && !isNaN(parts[2])) {
      return { year: parts[0] > 1900 ? parts[0] : null, month: parts[1], day: parts[2] };
    }
    if (parts.length === 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      return { year: null, month: parts[0], day: parts[1] };
    }
  }

  // Slash MM/DD/YYYY or MM/DD
  if (trimmed.includes('/')) {
    const parts = trimmed.split('/').map(p => parseInt(p, 10));
    if (parts.length >= 2 && !isNaN(parts[0]) && !isNaN(parts[1])) {
      const year = parts.length === 3 && !isNaN(parts[2]) && parts[2] > 1900 ? parts[2] : null;
      return { year, month: parts[0], day: parts[1] };
    }
  }

  return null;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function matchesTargetDate(parsed: { month: number; day: number }, targetDate: Date): boolean {
  const targetYear = targetDate.getFullYear();
  const targetMonth = targetDate.getMonth() + 1;
  const targetDay = targetDate.getDate();

  if (parsed.month === targetMonth && parsed.day === targetDay) {
    return true;
  }
  // Handle Feb 29 birthdays/anniversaries on non-leap years on Feb 28
  if (parsed.month === 2 && parsed.day === 29 && !isLeapYear(targetYear)) {
    return targetMonth === 2 && targetDay === 28;
  }
  return false;
}

export function getCelebrationsForDate(people: PcoPerson[], targetDate: Date = new Date()): CelebrationItem[] {
  const items: CelebrationItem[] = [];
  const targetYear = targetDate.getFullYear();

  for (const person of people) {
    const bday = parseMonthDayYear(person.birthdate);
    if (bday && matchesTargetDate(bday, targetDate)) {
      const years = bday.year && targetYear > bday.year ? targetYear - bday.year : null;
      const monthLabel = MONTH_NAMES[bday.month - 1] || '';
      items.push({
        id: `${person.id}_birthday`,
        person,
        type: 'birthday',
        dateStr: person.birthdate || '',
        formattedDate: `${monthLabel} ${bday.day}`,
        years,
      });
    }

    const anniv = parseMonthDayYear(person.anniversary);
    if (anniv && matchesTargetDate(anniv, targetDate)) {
      const years = anniv.year && targetYear > anniv.year ? targetYear - anniv.year : null;
      const monthLabel = MONTH_NAMES[anniv.month - 1] || '';
      items.push({
        id: `${person.id}_anniversary`,
        person,
        type: 'anniversary',
        dateStr: person.anniversary || '',
        formattedDate: `${monthLabel} ${anniv.day}`,
        years,
      });
    }
  }

  return items.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'birthday' ? -1 : 1;
    return a.person.name.localeCompare(b.person.name);
  });
}

function summarizeNames(names: string[], maxShown = 3): string {
  if (names.length === 0) return '';
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  if (names.length <= maxShown) {
    return `${names.slice(0, -1).join(', ')}, and ${names[names.length - 1]}`;
  }
  const shown = names.slice(0, maxShown).join(', ');
  const remaining = names.length - maxShown;
  return `${shown}, and ${remaining} more`;
}

export function buildDailySummaryNotification(items: CelebrationItem[]): { title: string; body: string } {
  const birthdays = items.filter(i => i.type === 'birthday');
  const anniversaries = items.filter(i => i.type === 'anniversary');

  if (birthdays.length > 0 && anniversaries.length === 0) {
    const names = birthdays.map(b => b.person.name);
    if (birthdays.length === 1) {
      return {
        title: `🎂 Today's Birthday`,
        body: `Today is ${names[0]}'s birthday! Tap to view & reach out.`,
      };
    }
    return {
      title: `🎂 Today's Birthdays (${birthdays.length})`,
      body: `${summarizeNames(names)} celebrate birthdays today! Tap to reach out.`,
    };
  }

  if (anniversaries.length > 0 && birthdays.length === 0) {
    const names = anniversaries.map(a => a.person.name);
    if (anniversaries.length === 1) {
      return {
        title: `💍 Today's Anniversary`,
        body: `Today is ${names[0]}'s anniversary! Tap to view & reach out.`,
      };
    }
    return {
      title: `💍 Today's Anniversaries (${anniversaries.length})`,
      body: `${summarizeNames(names)} celebrate anniversaries today! Tap to reach out.`,
    };
  }

  // Both birthdays and anniversaries today
  const total = birthdays.length + anniversaries.length;
  const bdayNames = summarizeNames(birthdays.map(b => b.person.name), 2);
  const annivNames = summarizeNames(anniversaries.map(a => a.person.name), 2);
  return {
    title: `🎉 Today's Celebrations (${total})`,
    body: `🎂 ${bdayNames} • 💍 ${annivNames}. Tap to view & reach out!`,
  };
}

/**
 * Show an interactive in-app celebration banner at the top of the screen.
 */
export function showCelebrationInAppBanner(
  title: string,
  body: string,
  onTap: () => void
): void {
  const existing = document.getElementById('pc-celebration-toast');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'pc-celebration-toast';
  toast.role = 'alert';
  toast.setAttribute('aria-live', 'polite');
  Object.assign(toast.style, {
    position: 'fixed',
    top: 'calc(env(safe-area-inset-top, 0px) + 12px)',
    left: '50%',
    transform: 'translateX(-50%) translateY(-20px)',
    background: 'linear-gradient(135deg, rgba(79,70,229,0.96), rgba(124,58,237,0.96))',
    color: '#fff',
    borderRadius: '16px',
    padding: '13px 18px',
    width: 'min(92vw, 420px)',
    zIndex: '99999',
    boxShadow: '0 12px 28px rgba(79,70,229,0.35)',
    display: 'flex',
    flexDirection: 'column',
    gap: '3px',
    transition: 'transform 0.28s cubic-bezier(.22,1,.36,1), opacity 0.28s ease',
    opacity: '0',
    fontSize: '14px',
    lineHeight: '1.4',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    cursor: 'pointer',
    border: '1px solid rgba(255,255,255,0.2)',
  } as unknown as CSSStyleDeclaration);

  const titleEl = document.createElement('span');
  Object.assign(titleEl.style, {
    fontWeight: '800',
    fontSize: '13.5px',
    letterSpacing: '-0.01em',
  });
  titleEl.textContent = title;

  const bodyEl = document.createElement('span');
  Object.assign(bodyEl.style, {
    opacity: '0.92',
    fontSize: '12.5px',
    fontWeight: '500',
  });
  bodyEl.textContent = body;

  toast.appendChild(titleEl);
  toast.appendChild(bodyEl);
  document.body.appendChild(toast);

  requestAnimationFrame(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(-50%) translateY(0)';
  });

  const dismiss = () => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(-12px)';
    setTimeout(() => toast.remove(), 300);
  };

  const timer = setTimeout(dismiss, 7000);
  toast.addEventListener('click', () => {
    clearTimeout(timer);
    dismiss();
    onTap();
  });
}

/**
 * Sync the next 60 days of daily summary birthday/anniversary notifications
 * with the native iOS/Android scheduler.
 */
export async function syncScheduledCelebrationNotifications(people: PcoPerson[]): Promise<void> {
  const settings = getCelebrationSettings();

  if (!Capacitor.isNativePlatform()) {
    if (settings.enabled && 'Notification' in window && Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {});
    }
    return;
  }

  try {
    if (!settings.enabled || people.length === 0) {
      await CelebrationNotificationsNative.cancelAll().catch(() => {});
      return;
    }

    const perm = await CelebrationNotificationsNative.requestPermissions().catch(() => ({ granted: false }));
    if (!perm.granted) return;

    const [hoursStr, minutesStr] = settings.time.split(':');
    const schedHours = parseInt(hoursStr, 10) || 8;
    const schedMinutes = parseInt(minutesStr, 10) || 0;

    const now = Date.now();
    const notifications: ScheduledCelebrationPayload[] = [];
    const baseDate = new Date();

    // Look ahead 60 days (dayOffset 0 = today, up to 60 days ahead)
    for (let dayOffset = 0; dayOffset <= 60; dayOffset++) {
      const targetDate = new Date(
        baseDate.getFullYear(),
        baseDate.getMonth(),
        baseDate.getDate() + dayOffset,
        schedHours,
        schedMinutes,
        0,
        0
      );

      // Only schedule future moments for OS background triggers
      if (targetDate.getTime() <= now + 5000) {
        continue;
      }

      const items = getCelebrationsForDate(people, targetDate);
      if (items.length === 0) continue;

      const { title, body } = buildDailySummaryNotification(items);
      const dateKey = toLocalDateKey(targetDate);
      const numericId = 700000 + dayOffset;

      notifications.push({
        id: numericId,
        dateKey,
        title,
        body,
        triggerAtMs: targetDate.getTime(),
      });
    }

    await CelebrationNotificationsNative.scheduleNotifications({ notifications });
  } catch (err) {
    console.warn('[Celebrations] Native schedule sync warning:', err);
  }
}

/**
 * Check if today's celebration notification time has arrived and hasn't been
 * displayed yet today; if so, trigger the notification & in-app banner.
 */
export function checkAndFireInAppCelebrationToday(
  people: PcoPerson[],
  onOpenModal: () => void
): void {
  if (!people || people.length === 0) return;

  const settings = getCelebrationSettings();
  if (!settings.enabled) return;

  const now = new Date();
  const todayKey = toLocalDateKey(now);
  const lastNotified = localStorage.getItem(LAST_NOTIFIED_DATE_KEY);
  if (lastNotified === todayKey) return;

  const [hoursStr, minutesStr] = settings.time.split(':');
  const schedHours = parseInt(hoursStr, 10) ?? 8;
  const schedMinutes = parseInt(minutesStr, 10) ?? 0;

  const currentMinutes = now.getHours() * 60 + now.getMinutes();
  const targetMinutes = schedHours * 60 + schedMinutes;

  if (currentMinutes < targetMinutes) return;

  const todayItems = getCelebrationsForDate(people, now);
  if (todayItems.length === 0) return;

  localStorage.setItem(LAST_NOTIFIED_DATE_KEY, todayKey);
  const { title, body } = buildDailySummaryNotification(todayItems);

  // If running in web browser with Notification permission granted, also show OS notification
  if (!Capacitor.isNativePlatform() && 'Notification' in window && Notification.permission === 'granted') {
    try {
      const n = new Notification(title, {
        body,
        tag: `celebrations-${todayKey}`,
      });
      n.onclick = () => {
        window.focus();
        onOpenModal();
        n.close();
      };
    } catch {
      // Ignore web notification constructor errors on mobile browsers
    }
  }

  showCelebrationInAppBanner(title, body, onOpenModal);
}
