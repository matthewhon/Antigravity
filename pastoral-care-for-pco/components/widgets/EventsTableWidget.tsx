import React, { useEffect, useMemo, useState } from 'react';
import { format } from 'date-fns';
import { Calendar, Clock, ExternalLink, MapPin } from 'lucide-react';

const apiBaseUrl = process.env.NODE_ENV === 'production'
  ? 'https://pastoralcare.barnabassoftware.com'
  : 'http://localhost:8080';

export interface EventsTableWidgetProps {
  churchId: string;
  color?: string;
  maxItems?: number;
  eventSource?: string;
  tableStyle?: string;
  tableHeaderStyle?: string;
  tableDensity?: string;
  tableRadius?: string;
  tableDateFormat?: string;
  showTime?: boolean;
  showLocation?: boolean;
  showDescription?: boolean;
  showAction?: boolean;
  tableCtaText?: string;
  tableTitle?: string;
}

interface ColorTheme {
  headerSolid: string;
  headerTinted: string;
  badgeTop: string;
  badgeBorder: string;
  badgeText: string;
  button: string;
  link: string;
  rowHover: string;
}

const COLOR_THEMES: Record<string, ColorTheme> = {
  indigo: {
    headerSolid: 'bg-indigo-600 text-white',
    headerTinted: 'bg-indigo-50 text-indigo-900 dark:bg-indigo-950/60 dark:text-indigo-200',
    badgeTop: 'bg-indigo-600 text-white',
    badgeBorder: 'border-indigo-200 dark:border-indigo-800/60',
    badgeText: 'text-indigo-700 dark:text-indigo-300',
    button: 'bg-indigo-600 hover:bg-indigo-700 text-white',
    link: 'text-indigo-600 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300',
    rowHover: 'hover:bg-indigo-50/40 dark:hover:bg-indigo-950/20',
  },
  blue: {
    headerSolid: 'bg-blue-600 text-white',
    headerTinted: 'bg-blue-50 text-blue-900 dark:bg-blue-950/60 dark:text-blue-200',
    badgeTop: 'bg-blue-600 text-white',
    badgeBorder: 'border-blue-200 dark:border-blue-800/60',
    badgeText: 'text-blue-700 dark:text-blue-300',
    button: 'bg-blue-600 hover:bg-blue-700 text-white',
    link: 'text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300',
    rowHover: 'hover:bg-blue-50/40 dark:hover:bg-blue-950/20',
  },
  emerald: {
    headerSolid: 'bg-emerald-600 text-white',
    headerTinted: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200',
    badgeTop: 'bg-emerald-600 text-white',
    badgeBorder: 'border-emerald-200 dark:border-emerald-800/60',
    badgeText: 'text-emerald-700 dark:text-emerald-300',
    button: 'bg-emerald-600 hover:bg-emerald-700 text-white',
    link: 'text-emerald-600 dark:text-emerald-400 hover:text-emerald-700 dark:hover:text-emerald-300',
    rowHover: 'hover:bg-emerald-50/40 dark:hover:bg-emerald-950/20',
  },
  amber: {
    headerSolid: 'bg-amber-500 text-white',
    headerTinted: 'bg-amber-50 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200',
    badgeTop: 'bg-amber-500 text-white',
    badgeBorder: 'border-amber-200 dark:border-amber-800/60',
    badgeText: 'text-amber-700 dark:text-amber-300',
    button: 'bg-amber-500 hover:bg-amber-600 text-white',
    link: 'text-amber-600 dark:text-amber-400 hover:text-amber-700 dark:hover:text-amber-300',
    rowHover: 'hover:bg-amber-50/40 dark:hover:bg-amber-950/20',
  },
  red: {
    headerSolid: 'bg-red-600 text-white',
    headerTinted: 'bg-red-50 text-red-900 dark:bg-red-950/60 dark:text-red-200',
    badgeTop: 'bg-red-600 text-white',
    badgeBorder: 'border-red-200 dark:border-red-800/60',
    badgeText: 'text-red-700 dark:text-red-300',
    button: 'bg-red-600 hover:bg-red-700 text-white',
    link: 'text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300',
    rowHover: 'hover:bg-red-50/40 dark:hover:bg-red-950/20',
  },
  violet: {
    headerSolid: 'bg-violet-600 text-white',
    headerTinted: 'bg-violet-50 text-violet-900 dark:bg-violet-950/60 dark:text-violet-200',
    badgeTop: 'bg-violet-600 text-white',
    badgeBorder: 'border-violet-200 dark:border-violet-800/60',
    badgeText: 'text-violet-700 dark:text-violet-300',
    button: 'bg-violet-600 hover:bg-violet-700 text-white',
    link: 'text-violet-600 dark:text-violet-400 hover:text-violet-700 dark:hover:text-violet-300',
    rowHover: 'hover:bg-violet-50/40 dark:hover:bg-violet-950/20',
  },
  fuchsia: {
    headerSolid: 'bg-fuchsia-600 text-white',
    headerTinted: 'bg-fuchsia-50 text-fuchsia-900 dark:bg-fuchsia-950/60 dark:text-fuchsia-200',
    badgeTop: 'bg-fuchsia-600 text-white',
    badgeBorder: 'border-fuchsia-200 dark:border-fuchsia-800/60',
    badgeText: 'text-fuchsia-700 dark:text-fuchsia-300',
    button: 'bg-fuchsia-600 hover:bg-fuchsia-700 text-white',
    link: 'text-fuchsia-600 dark:text-fuchsia-400 hover:text-fuchsia-700 dark:hover:text-fuchsia-300',
    rowHover: 'hover:bg-fuchsia-50/40 dark:hover:bg-fuchsia-950/20',
  },
  rose: {
    headerSolid: 'bg-rose-600 text-white',
    headerTinted: 'bg-rose-50 text-rose-900 dark:bg-rose-950/60 dark:text-rose-200',
    badgeTop: 'bg-rose-600 text-white',
    badgeBorder: 'border-rose-200 dark:border-rose-800/60',
    badgeText: 'text-rose-700 dark:text-rose-300',
    button: 'bg-rose-600 hover:bg-rose-700 text-white',
    link: 'text-rose-600 dark:text-rose-400 hover:text-rose-700 dark:hover:text-rose-300',
    rowHover: 'hover:bg-rose-50/40 dark:hover:bg-rose-950/20',
  },
};

function stripHtml(html: string | null | undefined): string {
  if (!html) return '';
  return html.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
}

export const EventsTableWidget: React.FC<EventsTableWidgetProps> = ({
  churchId,
  color = 'indigo',
  maxItems = 10,
  eventSource = 'calendar',
  tableStyle = 'clean',
  tableHeaderStyle = 'accent',
  tableDensity = 'comfortable',
  tableRadius = 'md',
  tableDateFormat = 'badge',
  showTime = true,
  showLocation = true,
  showDescription = false,
  showAction = true,
  tableCtaText = 'Details',
  tableTitle = '',
}) => {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    const endpoint = eventSource === 'registrations' ? 'registrations' : 'events';
    const queryStr = window.location.search.includes('refresh=true') ? '?refresh=true' : '';
    fetch(`${apiBaseUrl}/api/public/${endpoint}/${churchId}${queryStr}`)
      .then(r => r.json().then(data => ({ ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || data.error) throw new Error(data.error || 'Failed to fetch upcoming events');
        setEvents(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e: any) => {
        setError(e.message || 'Failed to load events');
        setLoading(false);
      });
  }, [churchId, eventSource]);

  const upcomingEvents = useMemo(() => {
    const now = new Date();
    const upcoming = events.filter(e => {
      const compareDate = e.endsAt || e.startsAt;
      if (!compareDate) return true;
      return new Date(compareDate) >= now;
    });

    upcoming.sort((a, b) => {
      if (!a.startsAt && !b.startsAt) return 0;
      if (!a.startsAt) return 1;
      if (!b.startsAt) return -1;
      return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
    });

    return maxItems > 0 ? upcoming.slice(0, maxItems) : upcoming;
  }, [events, maxItems]);

  const themeColors = COLOR_THEMES[color] || COLOR_THEMES.indigo;

  const radiusClass =
    tableRadius === 'none'
      ? 'rounded-none'
      : tableRadius === 'xl'
      ? 'rounded-2xl'
      : 'rounded-xl';

  const cellPadding =
    tableDensity === 'compact'
      ? 'px-3 py-2 text-xs'
      : tableDensity === 'spacious'
      ? 'px-5 py-4 text-sm'
      : 'px-4 py-3 text-sm';

  const headerPadding =
    tableDensity === 'compact'
      ? 'px-3 py-2.5 text-[11px]'
      : tableDensity === 'spacious'
      ? 'px-5 py-3.5 text-xs'
      : 'px-4 py-3 text-xs';

  const headerClasses =
    tableHeaderStyle === 'accent'
      ? themeColors.headerSolid
      : tableHeaderStyle === 'tinted'
      ? themeColors.headerTinted
      : tableHeaderStyle === 'hidden'
      ? 'sr-only'
      : 'bg-slate-50 dark:bg-slate-800/70 text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700';

  if (loading) {
    return (
      <div className="p-8 text-center animate-pulse text-slate-400">
        Loading Upcoming Events...
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 text-center text-rose-500 border-2 border-dashed border-rose-200 dark:border-rose-900/30 rounded-xl bg-rose-50 dark:bg-rose-900/10">
        <strong>Connection Error:</strong> {error}.<br />
        Please ensure Planning Center is securely connected with the required permissions.
      </div>
    );
  }

  if (!upcomingEvents.length) {
    return (
      <div className="p-8 text-center text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">
        No upcoming events scheduled.
      </div>
    );
  }

  const isCardRows = tableStyle === 'card';
  const isBordered = tableStyle === 'bordered';
  const isStriped = tableStyle === 'striped';

  return (
    <div className="w-full">
      {tableTitle && (
        <div className="mb-3 flex items-center gap-2">
          <Calendar size={18} className={themeColors.link} />
          <h2 className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
            {tableTitle}
          </h2>
        </div>
      )}

      <div
        className={`w-full overflow-x-auto ${
          isCardRows
            ? ''
            : `bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm ${radiusClass} overflow-hidden`
        }`}
      >
        <table
          className={`w-full text-left ${
            isCardRows ? 'border-separate border-spacing-y-2.5' : 'border-collapse'
          }`}
        >
          <thead className={tableHeaderStyle === 'hidden' ? 'sr-only' : ''}>
            <tr className={isCardRows ? '' : headerClasses}>
              <th
                scope="col"
                className={`${headerPadding} font-bold uppercase tracking-wider whitespace-nowrap ${
                  isCardRows
                    ? `${headerClasses} first:${radiusClass === 'rounded-none' ? 'rounded-none' : 'rounded-l-lg'}`
                    : ''
                } ${isBordered ? 'border-r border-slate-200/30 dark:border-slate-700/60' : ''}`}
              >
                Date
              </th>
              <th
                scope="col"
                className={`${headerPadding} font-bold uppercase tracking-wider ${
                  isCardRows ? headerClasses : ''
                } ${isBordered ? 'border-r border-slate-200/30 dark:border-slate-700/60' : ''}`}
              >
                Event
              </th>
              {showLocation && (
                <th
                  scope="col"
                  className={`${headerPadding} font-bold uppercase tracking-wider whitespace-nowrap ${
                    isCardRows ? headerClasses : ''
                  } ${isBordered ? 'border-r border-slate-200/30 dark:border-slate-700/60' : ''}`}
                >
                  Location
                </th>
              )}
              {showAction && (
                <th
                  scope="col"
                  className={`${headerPadding} font-bold uppercase tracking-wider text-right whitespace-nowrap ${
                    isCardRows
                      ? `${headerClasses} last:${radiusClass === 'rounded-none' ? 'rounded-none' : 'rounded-r-lg'}`
                      : ''
                  }`}
                >
                  Action
                </th>
              )}
            </tr>
          </thead>

          <tbody className={isCardRows ? '' : 'divide-y divide-slate-100 dark:divide-slate-800'}>
            {upcomingEvents.map((ev, idx) => {
              const startDate = ev.startsAt ? new Date(ev.startsAt) : null;
              const eventUrl = ev.publicUrl || ev.churchCenterUrl || null;
              const plainDesc = showDescription ? stripHtml(ev.description) : '';

              const rowBgClass = isCardRows
                ? `bg-white dark:bg-slate-900 shadow-sm ${themeColors.rowHover} transition-colors`
                : `${
                    isStriped && idx % 2 === 1
                      ? 'bg-slate-50/80 dark:bg-slate-800/40'
                      : 'bg-white dark:bg-slate-900'
                  } ${themeColors.rowHover} transition-colors`;

              const cellBorderClass = isCardRows
                ? `border-y border-slate-200 dark:border-slate-800 first:border-l last:border-r ${
                    tableRadius === 'none'
                      ? 'first:rounded-l-none last:rounded-r-none'
                      : tableRadius === 'xl'
                      ? 'first:rounded-l-2xl last:rounded-r-2xl'
                      : 'first:rounded-l-xl last:rounded-r-xl'
                  }`
                : isBordered
                ? 'border border-slate-200 dark:border-slate-800'
                : '';

              return (
                <tr key={ev.id || idx} className={rowBgClass}>
                  {/* Date Column */}
                  <td className={`${cellPadding} ${cellBorderClass} whitespace-nowrap align-middle`}>
                    {startDate ? (
                      tableDateFormat === 'badge' ? (
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-11 shrink-0 overflow-hidden rounded-lg border ${themeColors.badgeBorder} bg-white dark:bg-slate-950 text-center shadow-xs`}
                          >
                            <div className={`${themeColors.badgeTop} py-0.5 text-[9px] font-bold uppercase tracking-wider`}>
                              {format(startDate, 'MMM')}
                            </div>
                            <div className={`py-0.5 text-sm font-black leading-tight ${themeColors.badgeText}`}>
                              {format(startDate, 'd')}
                            </div>
                          </div>
                          <div>
                            <div className="font-semibold text-slate-800 dark:text-slate-200">
                              {format(startDate, 'EEE')}
                            </div>
                            {showTime && (
                              <div className="flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
                                <Clock size={11} className="shrink-0 opacity-75" />
                                <span>{format(startDate, 'h:mm a')}</span>
                              </div>
                            )}
                          </div>
                        </div>
                      ) : tableDateFormat === 'numeric' ? (
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {format(startDate, 'M/d/yyyy')}
                          </div>
                          {showTime && (
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {format(startDate, 'h:mm a')}
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="font-semibold text-slate-800 dark:text-slate-200">
                            {format(startDate, 'EEE, MMM d')}
                          </div>
                          {showTime && (
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {format(startDate, 'h:mm a')}
                            </div>
                          )}
                        </div>
                      )
                    ) : (
                      <span className="text-xs font-medium text-slate-400">TBD</span>
                    )}
                  </td>

                  {/* Event Name & Optional Description */}
                  <td className={`${cellPadding} ${cellBorderClass} align-middle`}>
                    <div className="font-bold text-slate-900 dark:text-slate-100">
                      {ev.name || 'Unnamed Event'}
                    </div>
                    {plainDesc && (
                      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400 line-clamp-2 max-w-md">
                        {plainDesc}
                      </p>
                    )}
                  </td>

                  {/* Location Column */}
                  {showLocation && (
                    <td className={`${cellPadding} ${cellBorderClass} align-middle text-slate-600 dark:text-slate-400`}>
                      {ev.location ? (
                        <div className="flex items-center gap-1.5 max-w-[220px]">
                          <MapPin size={13} className="shrink-0 opacity-70" />
                          <span className="truncate">{ev.location}</span>
                        </div>
                      ) : (
                        <span className="text-slate-300 dark:text-slate-600">—</span>
                      )}
                    </td>
                  )}

                  {/* Action Column */}
                  {showAction && (
                    <td className={`${cellPadding} ${cellBorderClass} text-right whitespace-nowrap align-middle`}>
                      {eventUrl ? (
                        <a
                          href={eventUrl}
                          target="_blank"
                          rel="noreferrer"
                          className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition shadow-xs ${themeColors.button}`}
                        >
                          <span>{tableCtaText || 'Details'}</span>
                          <ExternalLink size={12} />
                        </a>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setSelectedEvent(ev)}
                          className={`inline-flex items-center gap-1 text-xs font-bold transition ${themeColors.link}`}
                        >
                          {tableCtaText || 'Details'}
                        </button>
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Fallback detail modal for events without a public URL */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl relative border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setSelectedEvent(null)}
              className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition shadow-sm border border-slate-200 dark:border-slate-700"
            >
              ✕
            </button>
            {selectedEvent.imageUrl && (
              <img
                src={selectedEvent.imageUrl}
                alt={selectedEvent.name}
                className="w-full h-48 object-cover rounded-t-2xl"
              />
            )}
            <div className="p-6">
              <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2 pr-8">
                {selectedEvent.name}
              </h3>
              <div className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-4 space-y-1">
                <div>
                  {selectedEvent.startsAt
                    ? format(new Date(selectedEvent.startsAt), 'EEEE, MMMM d, yyyy h:mm a')
                    : 'Time TBD'}
                </div>
                {selectedEvent.location && (
                  <div className="flex items-center gap-1.5">
                    <MapPin size={14} />
                    <span>{selectedEvent.location}</span>
                  </div>
                )}
              </div>
              {selectedEvent.description && (
                <div
                  className="prose dark:prose-invert prose-sm max-w-none text-slate-600 dark:text-slate-400"
                  dangerouslySetInnerHTML={{ __html: selectedEvent.description }}
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
