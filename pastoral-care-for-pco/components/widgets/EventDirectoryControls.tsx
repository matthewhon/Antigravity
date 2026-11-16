import React from 'react';
import { format, isSameDay } from 'date-fns';
import { Calendar, CalendarPlus, Clock, Download, ExternalLink, MapPin, Search, Sparkles, Tag, X } from 'lucide-react';

export interface EventAccentTheme {
  pillActive: string;
  button: string;
  link: string;
  fallbackBg: string;
  fallbackIcon: string;
  badgeText: string;
  badgeBg: string;
  ringFocus: string;
}

export const EVENT_ACCENT_THEMES: Record<string, EventAccentTheme> = {
  indigo: {
    pillActive: 'bg-indigo-600 text-white border-indigo-600 shadow-xs',
    button: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    link: 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300',
    fallbackBg: 'from-indigo-50 via-slate-50 to-indigo-100/80 dark:from-indigo-950/60 dark:via-slate-900 dark:to-indigo-900/40',
    fallbackIcon: 'text-indigo-400 dark:text-indigo-500',
    badgeText: 'text-indigo-700 dark:text-indigo-300',
    badgeBg: 'bg-indigo-50 dark:bg-indigo-950/60',
    ringFocus: 'focus:ring-indigo-500 focus:border-indigo-500',
  },
  blue: {
    pillActive: 'bg-blue-600 text-white border-blue-600 shadow-xs',
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
    link: 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300',
    fallbackBg: 'from-blue-50 via-slate-50 to-blue-100/80 dark:from-blue-950/60 dark:via-slate-900 dark:to-blue-900/40',
    fallbackIcon: 'text-blue-400 dark:text-blue-500',
    badgeText: 'text-blue-700 dark:text-blue-300',
    badgeBg: 'bg-blue-50 dark:bg-blue-950/60',
    ringFocus: 'focus:ring-blue-500 focus:border-blue-500',
  },
  emerald: {
    pillActive: 'bg-emerald-600 text-white border-emerald-600 shadow-xs',
    button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    link: 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300',
    fallbackBg: 'from-emerald-50 via-slate-50 to-emerald-100/80 dark:from-emerald-950/60 dark:via-slate-900 dark:to-emerald-900/40',
    fallbackIcon: 'text-emerald-400 dark:text-emerald-500',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    badgeBg: 'bg-emerald-50 dark:bg-emerald-950/60',
    ringFocus: 'focus:ring-emerald-500 focus:border-emerald-500',
  },
  amber: {
    pillActive: 'bg-amber-500 text-white border-amber-500 shadow-xs',
    button: 'bg-amber-500 hover:bg-amber-600 text-white',
    link: 'text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300',
    fallbackBg: 'from-amber-50 via-slate-50 to-amber-100/80 dark:from-amber-950/60 dark:via-slate-900 dark:to-amber-900/40',
    fallbackIcon: 'text-amber-400 dark:text-amber-500',
    badgeText: 'text-amber-700 dark:text-amber-300',
    badgeBg: 'bg-amber-50 dark:bg-amber-950/60',
    ringFocus: 'focus:ring-amber-500 focus:border-amber-500',
  },
  red: {
    pillActive: 'bg-red-600 text-white border-red-600 shadow-xs',
    button: 'bg-red-600 hover:bg-red-700 text-white',
    link: 'text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300',
    fallbackBg: 'from-red-50 via-slate-50 to-red-100/80 dark:from-red-950/60 dark:via-slate-900 dark:to-red-900/40',
    fallbackIcon: 'text-red-400 dark:text-red-500',
    badgeText: 'text-red-700 dark:text-red-300',
    badgeBg: 'bg-red-50 dark:bg-red-950/60',
    ringFocus: 'focus:ring-red-500 focus:border-red-500',
  },
  violet: {
    pillActive: 'bg-violet-600 text-white border-violet-600 shadow-xs',
    button: 'bg-violet-600 hover:bg-violet-700 text-white',
    link: 'text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300',
    fallbackBg: 'from-violet-50 via-slate-50 to-violet-100/80 dark:from-violet-950/60 dark:via-slate-900 dark:to-violet-900/40',
    fallbackIcon: 'text-violet-400 dark:text-violet-500',
    badgeText: 'text-violet-700 dark:text-violet-300',
    badgeBg: 'bg-violet-50 dark:bg-violet-950/60',
    ringFocus: 'focus:ring-violet-500 focus:border-violet-500',
  },
  fuchsia: {
    pillActive: 'bg-fuchsia-600 text-white border-fuchsia-600 shadow-xs',
    button: 'bg-fuchsia-600 hover:bg-fuchsia-700 text-white',
    link: 'text-fuchsia-600 dark:text-fuchsia-400 hover:text-fuchsia-700 dark:hover:text-fuchsia-300',
    fallbackBg: 'from-fuchsia-50 via-slate-50 to-fuchsia-100/80 dark:from-fuchsia-950/60 dark:via-slate-900 dark:to-fuchsia-900/40',
    fallbackIcon: 'text-fuchsia-400 dark:text-fuchsia-500',
    badgeText: 'text-fuchsia-700 dark:text-fuchsia-300',
    badgeBg: 'bg-fuchsia-50 dark:bg-fuchsia-950/60',
    ringFocus: 'focus:ring-fuchsia-500 focus:border-fuchsia-500',
  },
  rose: {
    pillActive: 'bg-rose-600 text-white border-rose-600 shadow-xs',
    button: 'bg-rose-600 hover:bg-rose-700 text-white',
    link: 'text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300',
    fallbackBg: 'from-rose-50 via-slate-50 to-rose-100/80 dark:from-rose-950/60 dark:via-slate-900 dark:to-rose-900/40',
    fallbackIcon: 'text-rose-400 dark:text-rose-500',
    badgeText: 'text-rose-700 dark:text-rose-300',
    badgeBg: 'bg-rose-50 dark:bg-rose-950/60',
    ringFocus: 'focus:ring-rose-500 focus:border-rose-500',
  },
};

export function formatEventDatePill(startsAt?: string | null, endsAt?: string | null): string {
  if (!startsAt) return 'Upcoming';
  const start = new Date(startsAt);
  if (Number.isNaN(start.getTime())) return 'Upcoming';
  if (endsAt) {
    const end = new Date(endsAt);
    if (!Number.isNaN(end.getTime()) && !isSameDay(start, end)) {
      if (start.getMonth() === end.getMonth()) {
        return `${format(start, 'MMM d')}–${format(end, 'd')}`;
      }
      return `${format(start, 'MMM d')}–${format(end, 'MMM d')}`;
    }
  }
  return format(start, 'MMM d');
}

export interface MonthBucket {
  key: string; // e.g. '2026-11'
  label: string; // e.g. 'November'
  count: number;
}

export function getMonthBuckets(events: any[]): MonthBucket[] {
  const map = new Map<string, MonthBucket>();
  for (const ev of events) {
    if (!ev.startsAt) continue;
    const d = new Date(ev.startsAt);
    if (Number.isNaN(d.getTime())) continue;
    const key = format(d, 'yyyy-MM');
    const existing = map.get(key);
    if (existing) {
      existing.count += 1;
    } else {
      map.set(key, { key, label: format(d, 'MMMM'), count: 1 });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.key.localeCompare(b.key));
}

export function getUniqueEventTags(events: any[]): string[] {
  const set = new Set<string>();
  for (const ev of events) {
    if (Array.isArray(ev.tags)) {
      for (const t of ev.tags) {
        if (typeof t === 'string' && t.trim()) set.add(t.trim());
      }
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

export function getUniqueEventLocations(events: any[]): string[] {
  const set = new Set<string>();
  for (const ev of events) {
    if (typeof ev.location === 'string' && ev.location.trim()) {
      set.add(ev.location.trim());
    }
  }
  return Array.from(set).sort((a, b) => a.localeCompare(b));
}

function toIcsTimestamp(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
}

export const AddToCalendarButtons: React.FC<{ event: any }> = ({ event }) => {
  if (!event?.startsAt) return null;
  const start = new Date(event.startsAt);
  if (Number.isNaN(start.getTime())) return null;
  const end = event.endsAt ? new Date(event.endsAt) : new Date(start.getTime() + 60 * 60 * 1000);
  const validEnd = Number.isNaN(end.getTime()) ? new Date(start.getTime() + 60 * 60 * 1000) : end;

  const title = event.name || 'Church Event';
  const plainDesc = (event.description || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
  const location = event.location || '';

  const googleParams = new URLSearchParams({
    action: 'TEMPLATE',
    text: title,
    dates: `${toIcsTimestamp(start)}/${toIcsTimestamp(validEnd)}`,
    details: plainDesc,
    location,
  });
  const googleUrl = `https://calendar.google.com/calendar/render?${googleParams.toString()}`;

  const handleDownloadIcs = () => {
    const escapeIcs = (str: string) =>
      str.replace(/\\/g, '\\\\').replace(/\n/g, '\\n').replace(/,/g, '\\,').replace(/;/g, '\\;');
    const ics = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      'PRODID:-//Pastoral Care//Events Widget//EN',
      'BEGIN:VEVENT',
      `UID:${event.id || Date.now()}@pastoralcare`,
      `DTSTAMP:${toIcsTimestamp(new Date())}`,
      `DTSTART:${toIcsTimestamp(start)}`,
      `DTEND:${toIcsTimestamp(validEnd)}`,
      `SUMMARY:${escapeIcs(title)}`,
      location ? `LOCATION:${escapeIcs(location)}` : '',
      plainDesc ? `DESCRIPTION:${escapeIcs(plainDesc)}` : '',
      'END:VEVENT',
      'END:VCALENDAR',
    ]
      .filter(Boolean)
      .join('\r\n');

    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 40) || 'event'}.ics`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-wrap items-center gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
      <a
        href={googleUrl}
        target="_blank"
        rel="noreferrer"
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
      >
        <CalendarPlus size={13} />
        Google Calendar
      </a>
      <button
        type="button"
        onClick={handleDownloadIcs}
        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
      >
        <Download size={13} />
        Download .ics
      </button>
    </div>
  );
};

export const EventWeeklyRhythm: React.FC<{
  weeklyRhythmText: string;
  planVisitUrl?: string;
  color: string;
}> = ({ weeklyRhythmText, planVisitUrl, color }) => {
  if (!weeklyRhythmText.trim() && !planVisitUrl?.trim()) return null;
  const theme = EVENT_ACCENT_THEMES[color] || EVENT_ACCENT_THEMES.indigo;
  const items = weeklyRhythmText
    .split('|')
    .map(s => s.trim())
    .filter(Boolean);

  return (
    <div className="mt-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 p-5 sm:p-6 shadow-xs flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-1.5 flex items-center gap-1.5">
          <Clock size={12} />
          Weekly Rhythm
        </div>
        {items.length > 0 && (
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm font-semibold text-slate-800 dark:text-slate-200">
            {items.map((item, idx) => (
              <span key={idx} className="inline-flex items-center gap-2">
                {idx > 0 && <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />}
                <span>{item}</span>
              </span>
            ))}
          </div>
        )}
      </div>
      {planVisitUrl?.trim() && (
        <a
          href={planVisitUrl}
          target="_blank"
          rel="noreferrer"
          className={`shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs font-bold transition shadow-xs ${theme.button}`}
        >
          <span>Plan Your Visit</span>
          <ExternalLink size={12} />
        </a>
      )}
    </div>
  );
};

export const EventFallbackArtwork: React.FC<{ color: string; className?: string }> = ({ color, className = '' }) => {
  const theme = EVENT_ACCENT_THEMES[color] || EVENT_ACCENT_THEMES.indigo;
  return (
    <div className={`w-full h-full bg-gradient-to-br ${theme.fallbackBg} flex items-center justify-center relative overflow-hidden ${className}`}>
      <div className="absolute -right-6 -bottom-6 opacity-10">
        <Calendar size={120} />
      </div>
      <div className={`w-12 h-12 rounded-2xl bg-white/80 dark:bg-slate-900/80 backdrop-blur-xs shadow-xs flex items-center justify-center ${theme.fallbackIcon}`}>
        <Sparkles size={24} />
      </div>
    </div>
  );
};

interface EventFeaturedHeroProps {
  event: any;
  color: string;
  onSelectEvent?: (event: any) => void;
}

export const EventFeaturedHero: React.FC<EventFeaturedHeroProps> = ({ event, color, onSelectEvent }) => {
  if (!event) return null;
  const theme = EVENT_ACCENT_THEMES[color] || EVENT_ACCENT_THEMES.indigo;
  const datePill = formatEventDatePill(event.startsAt, event.endsAt);
  const ctaUrl = event.registrationUrl || event.publicUrl || null;
  const ctaLabel = event.registrationUrl ? 'Register' : 'View Event';

  return (
    <div className="mb-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden grid grid-cols-1 md:grid-cols-2">
      <div className="p-6 md:p-8 flex flex-col justify-center">
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className={`px-2.5 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wider ${theme.badgeBg} ${theme.badgeText}`}>
            {event.featured ? 'Featured Event' : 'Next Upcoming'}
          </span>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
            {datePill}
          </span>
        </div>

        <h2 className="text-xl md:text-2xl font-black text-slate-900 dark:text-white leading-tight mb-2">
          {event.name || 'Unnamed Event'}
        </h2>

        <div className="text-sm text-slate-500 dark:text-slate-400 flex flex-wrap items-center gap-x-2 gap-y-1 mb-5">
          {event.startsAt && (
            <span>{format(new Date(event.startsAt), 'EEE, MMM d · h:mm a')}</span>
          )}
          {event.location && (
            <>
              <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-700" />
              <span className="inline-flex items-center gap-1">
                <MapPin size={13} className="shrink-0" />
                {event.location}
              </span>
            </>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {ctaUrl ? (
            <a
              href={ctaUrl}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-bold transition shadow-sm ${theme.button}`}
            >
              <span>{ctaLabel}</span>
              <ExternalLink size={14} />
            </a>
          ) : onSelectEvent ? (
            <button
              type="button"
              onClick={() => onSelectEvent(event)}
              className={`inline-flex items-center gap-1.5 px-5 py-2.5 rounded-full text-sm font-bold transition shadow-sm ${theme.button}`}
            >
              <span>Event Details</span>
            </button>
          ) : null}
        </div>
      </div>

      <div className="aspect-video md:aspect-auto md:min-h-[240px] bg-slate-100 dark:bg-slate-950 border-t md:border-t-0 md:border-l border-slate-100 dark:border-slate-800">
        {event.imageUrl ? (
          <img src={event.imageUrl} alt={event.name} className="w-full h-full object-cover" />
        ) : (
          <EventFallbackArtwork color={color} />
        )}
      </div>
    </div>
  );
};

interface EventFilterBarProps {
  color: string;
  totalCount: number;
  filteredCount: number;
  monthBuckets: MonthBucket[];
  selectedMonth: string;
  onSelectMonth: (monthKey: string) => void;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  tags: string[];
  showTagFilters: boolean;
  selectedTag: string;
  onSelectTag: (tag: string) => void;
  locations?: string[];
  showLocationFilters?: boolean;
  selectedLocation?: string;
  onSelectLocation?: (loc: string) => void;
}

export const EventFilterBar: React.FC<EventFilterBarProps> = ({
  color,
  totalCount,
  filteredCount,
  monthBuckets,
  selectedMonth,
  onSelectMonth,
  searchQuery,
  onSearchChange,
  tags,
  showTagFilters,
  selectedTag,
  onSelectTag,
  locations = [],
  showLocationFilters = false,
  selectedLocation = '',
  onSelectLocation,
}) => {
  const theme = EVENT_ACCENT_THEMES[color] || EVENT_ACCENT_THEMES.indigo;

  return (
    <div className="mb-6 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-4 sm:p-5 shadow-xs space-y-4">
      {/* Month Pills */}
      {monthBuckets.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2">
            Events by month
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onSelectMonth('all')}
              className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition ${
                selectedMonth === 'all'
                  ? theme.pillActive
                  : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
              }`}
            >
              All upcoming ({totalCount})
            </button>
            {monthBuckets.map(bucket => (
              <button
                key={bucket.key}
                type="button"
                onClick={() => onSelectMonth(bucket.key)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-bold border transition ${
                  selectedMonth === bucket.key
                    ? theme.pillActive
                    : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                }`}
              >
                {bucket.label} ({bucket.count})
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative max-w-md">
        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          type="search"
          value={searchQuery}
          onChange={e => onSearchChange(e.target.value)}
          placeholder="Name or ministry"
          className={`w-full pl-9 pr-8 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-950 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 ${theme.ringFocus}`}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearchChange('')}
            aria-label="Clear search"
            className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Ministry / Tag Pills */}
      {showTagFilters && tags.length > 0 && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <Tag size={11} />
            Filter by ministry
          </div>
          <div className="flex flex-wrap gap-2">
            {tags.map(tag => {
              const active = selectedTag === tag;
              return (
                <button
                  key={tag}
                  type="button"
                  onClick={() => onSelectTag(active ? '' : tag)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                    active
                      ? theme.pillActive
                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  {tag}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Campus / Location Pills */}
      {showLocationFilters && locations.length > 0 && onSelectLocation && (
        <div>
          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 mb-2 flex items-center gap-1.5">
            <MapPin size={11} />
            Filter by campus / location
          </div>
          <div className="flex flex-wrap gap-2">
            {locations.map(loc => {
              const active = selectedLocation === loc;
              return (
                <button
                  key={loc}
                  type="button"
                  onClick={() => onSelectLocation(active ? '' : loc)}
                  className={`px-3 py-1 rounded-full text-xs font-semibold border transition ${
                    active
                      ? theme.pillActive
                      : 'bg-white dark:bg-slate-950 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300'
                  }`}
                >
                  {loc}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Result Counter */}
      <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
        {selectedMonth === 'all' && !searchQuery && !selectedTag && !selectedLocation
          ? `Showing all ${filteredCount} ${filteredCount === 1 ? 'event' : 'events'}.`
          : `Showing ${filteredCount} ${filteredCount === 1 ? 'event' : 'events'}.`}
      </div>
    </div>
  );
};
