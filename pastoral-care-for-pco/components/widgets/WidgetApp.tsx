import React, { useEffect, useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';
import { Calendar, Clock, MapPin, ExternalLink, Sparkles, ArrowRight } from 'lucide-react';

const apiBaseUrl = process.env.NODE_ENV === 'production' 
  ? 'https://pastoralcare.barnabassoftware.com' 
  : 'http://localhost:8080';

export default function WidgetApp() {
  const params = new URLSearchParams(window.location.search);
  const type = params.get('type') || 'groups';
  const churchId = params.get('churchId');
  const theme = params.get('theme') || 'light';
  const layout = params.get('layout') || 'grid';
  const color = params.get('color') || 'indigo';
  const gridCols = params.get('gridCols') || '3';
  const groupType = params.get('groupType') || '';
  const showTags = params.get('showTags') !== 'false';
  const dateFilter = params.get('dateFilter') || 'future';
  const tagFilter = params.get('tagFilter') || '';
  const imageRatio = params.get('imageRatio') || '16:9';
  const autoHeight = params.get('autoHeight') === 'true';
  const iframeId = params.get('iframeId');
  const scale = params.get('scale') || '1';
  const maxItems = parseInt(params.get('maxItems') || '0', 10);
  const includeArchived = params.get('includeArchived') === 'true';
  const singleFormId = params.get('singleFormId') || '';  // legacy
  const visibleFormIdsRaw = params.get('visibleFormIds'); // null = param absent, '' = none selected
  const visibleFormIds = visibleFormIdsRaw === null
    ? null  // param not in URL → no filter, show all
    : visibleFormIdsRaw === ''
      ? new Set<string>()  // param present but empty → show nothing
      : new Set(visibleFormIdsRaw.split(',').map(s => s.trim()).filter(Boolean));

  // Single event specifics
  const eventId = params.get('eventId') || '';
  const eventSource = params.get('eventSource') || 'calendar';
  const eventStyle = params.get('eventStyle') || 'card';
  const ctaText = params.get('ctaText') || 'Register Now';
  const showCountdown = params.get('showCountdown') !== 'false';
  const showLocation = params.get('showLocation') !== 'false';

  useEffect(() => {
    if (autoHeight && iframeId) {
      const reportHeight = () => {
        window.parent.postMessage({ 
          type: 'pco-widget-resize', 
          iframeId, 
          height: document.documentElement.scrollHeight 
        }, '*');
      };
      
      const observer = new ResizeObserver(reportHeight);
      observer.observe(document.body);
      
      // Delay initial report slightly to ensure images/fonts calculation
      setTimeout(reportHeight, 100);
      
      return () => observer.disconnect();
    }
  }, [autoHeight, iframeId]);
  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;

    // Apply true proportional zoom to the entire DOM for the widget layout (scales images too)
    (html.style as any).zoom = parseFloat(scale);

    if (theme === 'dark') {
      html.classList.add('dark');
      body.classList.add('dark');
      html.style.colorScheme = 'dark';
    } else {
      html.classList.remove('dark');
      body.classList.remove('dark');
      html.style.colorScheme = 'light';
    }
  }, [theme, scale]);

  if (!churchId) {
    return <div className="p-4 text-center text-slate-500">Error: Missing churchId parameter.</div>;
  }

  return (
    <div className={`min-h-screen bg-transparent p-4 font-sans ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
      {type === 'groups' && <GroupsWidget churchId={churchId} layout={layout} color={color} gridCols={gridCols} groupType={groupType} showTags={showTags} imageRatio={imageRatio} maxItems={maxItems} />}
      {type === 'registrations' && <RegistrationsWidget churchId={churchId} layout={layout} color={color} gridCols={gridCols} dateFilter={dateFilter} tagFilter={tagFilter} imageRatio={imageRatio} maxItems={maxItems} includeArchived={includeArchived} />}
      {(type === 'events' || type === 'calendar') && <EventsWidget churchId={churchId} layout={layout} color={color} gridCols={gridCols} imageRatio={imageRatio} maxItems={maxItems} />}
      {type === 'single_event' && (
        <SingleEventWidget 
          churchId={churchId} 
          eventId={eventId} 
          eventSource={eventSource} 
          eventStyle={eventStyle} 
          color={color} 
          ctaText={ctaText} 
          showCountdown={showCountdown} 
          showLocation={showLocation} 
          imageRatio={imageRatio}
        />
      )}
      {type === 'forms' && <FormsWidget churchId={churchId} layout={layout} color={color} gridCols={gridCols} maxItems={maxItems} singleFormId={singleFormId} visibleFormIds={visibleFormIds} />}
    </div>
  );
}

function getGridClass(layout: string, gridCols: string) {
  if (layout === 'list') return 'grid-cols-1';
  switch (gridCols) {
    case '2': return 'grid-cols-1 sm:grid-cols-2';
    case '3': return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3';
    case '4': return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-4';
    default: return 'grid-cols-1 sm:grid-cols-2 md:grid-cols-3';
  }
}

function GroupsWidget({ churchId, layout, color, gridCols, groupType, showTags, imageRatio, maxItems }: any) {
  const [groups, setGroups] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const queryStr = window.location.search.includes('refresh=true') ? '?refresh=true' : '';
    fetch(`${apiBaseUrl}/api/public/groups/${churchId}${queryStr}`)
      .then(r => r.json().then(data => ({ status: r.status, ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || data.error) throw new Error(data.error || 'Failed to fetch groups');
        setGroups(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [churchId]);

  const filteredGroups = useMemo(() => {
    let result = groups;
    if (groupType) {
      result = result.filter(g => g.groupTypeName?.toLowerCase().includes(groupType.toLowerCase()));
    }
    if (maxItems > 0) result = result.slice(0, maxItems);
    return result;
  }, [groups, groupType, maxItems]);

  if (loading) return <div className="text-center p-8 animate-pulse text-slate-400">Loading Groups...</div>;
  if (error) return <div className="text-center p-8 text-rose-500 border-2 border-dashed border-rose-200 dark:border-rose-900/30 rounded-xl bg-rose-50 dark:bg-rose-900/10"><strong>Connection Error:</strong> {error}. <br/>Please ensure Planning Center is securely connected with the required permissions.</div>;

  if (!filteredGroups.length) return <div className="text-center p-8 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">No groups found matching your criteria.</div>;

  return (
    <div className={`grid gap-4 ${getGridClass(layout, gridCols)}`}>
      {filteredGroups.map(g => (
        <div key={g.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition">
          {g.headerImage && (
             <div className={`w-full ${imageRatio === '1:1' ? 'aspect-square' : 'aspect-video'} bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800`}>
               <img src={g.headerImage} alt={g.name} className="w-full h-full object-cover" />
             </div>
          )}
          <div className="p-5">
            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-1">{g.name || 'Unnamed Group'}</h3>
            {showTags && g.groupTypeName && <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 mb-3">{g.groupTypeName}</span>}
            <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{g.description?.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ') || 'No description provided.'}</p>
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
              <a href={g.publicUrl || '#'} target="_blank" rel="noreferrer" className={`text-sm font-semibold tracking-wide text-${color}-600 dark:text-${color}-400 hover:text-${color}-500 transition`}>
                Join →
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RegistrationsWidget({ churchId, layout, color, gridCols, dateFilter, tagFilter, imageRatio, maxItems, includeArchived }: any) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  useEffect(() => {
    const queryParams = new URLSearchParams();
    if (window.location.search.includes('refresh=true')) queryParams.append('refresh', 'true');
    if (includeArchived) queryParams.append('includeArchived', 'true');
    const queryStr = queryParams.toString() ? `?${queryParams.toString()}` : '';
    fetch(`${apiBaseUrl}/api/public/registrations/${churchId}${queryStr}`)
      .then(r => r.json().then(data => ({ status: r.status, ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || data.error) throw new Error(data.error || 'Failed to fetch registrations');
        setEvents(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [churchId]);

  const filteredEvents = useMemo(() => {
    let result = events;

    // Date Filter
    if (dateFilter === 'future') {
      const today = new Date();
      result = result.filter(e => {
        if (!e.startsAt) return true;
        return new Date(e.startsAt) >= today;
      });
    } else if (dateFilter === 'month') {
      const start = startOfMonth(new Date());
      const end = endOfMonth(new Date());
      result = result.filter(e => {
        if (!e.startsAt) return false;
        const d = new Date(e.startsAt);
        return d >= start && d <= end;
      });
    }

    // Tag / Name Filter
    if (tagFilter) {
      const lowerTag = tagFilter.toLowerCase();
      result = result.filter(e => 
        e.name?.toLowerCase().includes(lowerTag) || 
        e.description?.toLowerCase().includes(lowerTag)
      );
    }
    if (maxItems > 0) result = result.slice(0, maxItems);
    return result;
  }, [events, dateFilter, tagFilter, maxItems]);

  if (loading) return <div className="text-center p-8 animate-pulse text-slate-400">Loading Registrations...</div>;
  if (error) return <div className="text-center p-8 text-rose-500 border-2 border-dashed border-rose-200 dark:border-rose-900/30 rounded-xl bg-rose-50 dark:bg-rose-900/10"><strong>Connection Error:</strong> {error}. <br/>Please ensure Planning Center is securely connected with the required permissions.</div>;

  if (!filteredEvents.length) return <div className="text-center p-8 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">No signups match your criteria.</div>;

  if (selectedEvent) {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm animate-in fade-in zoom-in-95 duration-200">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-950">
            <button 
               onClick={() => setSelectedEvent(null)}
               className="text-sm font-bold text-slate-500 hover:text-slate-900 dark:hover:text-white transition flex items-center gap-2"
            >
               ← Back to List
            </button>
        </div>
        {selectedEvent.logoUrl && <img src={selectedEvent.logoUrl} className="w-full h-64 object-cover border-b border-slate-100 dark:border-slate-800" />}
        <div className="p-6">
            <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">{selectedEvent.name}</h2>
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-6 flex flex-wrap items-center gap-4">
                 {selectedEvent.startsAt && <span className="font-medium">{new Date(selectedEvent.startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                 {selectedEvent.location && <span className="font-medium text-slate-500">{selectedEvent.location}</span>}
            </div>
            {selectedEvent.description && (
                <div className="prose dark:prose-invert max-w-none text-sm mb-8 text-slate-600 dark:text-slate-400 leading-relaxed" dangerouslySetInnerHTML={{ __html: selectedEvent.description }} />
            )}
            
            <a href={selectedEvent.publicUrl || '#'} target="_blank" rel="noreferrer" className={`block w-full text-center px-6 py-4 rounded-xl text-lg font-black text-white bg-${color}-600 hover:bg-${color}-700 transition shadow-lg hover:shadow-xl hover:-translate-y-0.5`}>
               Register on Church Center
            </a>
        </div>
      </div>
    );
  }

  if (layout === 'simplified_list') {
    return (
      <div className="space-y-3">
        {filteredEvents.map(e => (
           <div 
             key={e.id} 
             onClick={() => setSelectedEvent(e)}
             className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 cursor-pointer hover:border-indigo-500 dark:hover:border-indigo-500 transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 group shadow-sm hover:shadow-md"
           >
             <div>
                <h3 className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition text-lg">{e.name}</h3>
                {e.startsAt && (
                   <div className="text-sm text-slate-500 dark:text-slate-400 font-medium mt-1 flex items-center gap-2">
                       <span className="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
                       {new Date(e.startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })}
                   </div>
                )}
             </div>
             <button className={`shrink-0 px-5 py-2.5 rounded-xl text-sm font-bold text-white bg-${color}-500 group-hover:bg-${color}-600 group-hover:shadow-md transition whitespace-nowrap`}>
                More Info
             </button>
           </div>
        ))}
      </div>
    );
  }

  if (layout === 'list') {
    return (
      <div className="space-y-4">
        {filteredEvents.map(e => (
          <div key={e.id} onClick={() => setSelectedEvent(e)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition flex flex-col sm:flex-row cursor-pointer group hover:border-indigo-500 dark:hover:border-indigo-500">
            {e.logoUrl && (
                <div className={`sm:w-2/5 flex-shrink-0 bg-slate-50 dark:bg-slate-950 ${imageRatio === '1:1' ? 'aspect-square' : 'aspect-video sm:aspect-auto'}`}>
                   <img src={e.logoUrl} alt={e.name} className="w-full h-full object-cover" />
                </div>
            )}
            <div className="p-5 flex-1 flex flex-col">
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">{e.name || 'Unnamed Event'}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3 mb-4">{e.description?.replace(/<[^>]+>/g, '').replace(/&amp;nbsp;|&nbsp;/g, ' ').trim() || 'No description provided.'}</p>
              <div className="mt-auto pt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-wide">{e.startsAt ? new Date(e.startsAt).toLocaleDateString() : ''}</span>
                <span className={`text-sm font-bold text-${color}-600 dark:text-${color}-400`}>Details →</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${getGridClass(layout, gridCols)}`}>
      {filteredEvents.map(e => (
        <div key={e.id} onClick={() => setSelectedEvent(e)} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition cursor-pointer group hover:border-indigo-500 dark:hover:border-indigo-500 flex flex-col">
          {e.logoUrl && (
             <div className={`w-full ${imageRatio === '1:1' ? 'aspect-square' : 'aspect-video'} bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800`}>
                <img src={e.logoUrl} alt={e.name} className="w-full h-full object-cover" />
             </div>
          )}
          <div className="p-5 flex-1 flex flex-col">
            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">{e.name || 'Unnamed Event'}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{e.description?.replace(/<[^>]+>/g, '').replace(/&amp;nbsp;|&nbsp;/g, ' ').trim() || 'No description provided.'}</p>
            <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-wide">{e.startsAt ? new Date(e.startsAt).toLocaleDateString() : ''}</span>
              <span className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-${color}-500 group-hover:bg-${color}-600 transition`}>
                Details
              </span>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EventsWidget({ churchId, layout, color, gridCols, imageRatio, maxItems }: any) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  useEffect(() => {
    const queryStr = window.location.search.includes('refresh=true') ? '?refresh=true' : '';
    fetch(`${apiBaseUrl}/api/public/events/${churchId}${queryStr}`)
      .then(r => r.json().then(data => ({ status: r.status, ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || data.error) throw new Error(data.error || 'Failed to fetch events');
        setEvents(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [churchId]);

  if (loading) return <div className="text-center p-8 animate-pulse text-slate-400">Loading Events...</div>;
  if (error) return <div className="text-center p-8 text-rose-500 border-2 border-dashed border-rose-200 dark:border-rose-900/30 rounded-xl bg-rose-50 dark:bg-rose-900/10"><strong>Connection Error:</strong> {error}. <br/>Please ensure Planning Center is securely connected with the required permissions.</div>;
  if (!events.length) return <div className="text-center p-8 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">No events available.</div>;

  const filteredEvents = maxItems > 0 && layout !== 'month' ? events.slice(0, maxItems) : events;

  if (layout === 'month') {
    const today = new Date();
    const start = startOfWeek(startOfMonth(currentDate));
    const end = endOfWeek(endOfMonth(currentDate));
    const days = eachDayOfInterval({ start, end });

    const handlePrevMonth = () => setCurrentDate(prev => subMonths(prev, 1));
    const handleNextMonth = () => setCurrentDate(prev => addMonths(prev, 1));
    const handleToday = () => setCurrentDate(new Date());

    return (
      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
        <div className="p-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50 dark:bg-slate-900/50">
           <h2 className="text-xl font-black text-slate-900 dark:text-white capitalize">{format(currentDate, 'MMMM yyyy')}</h2>
           <div className="flex gap-2">
             <button onClick={handlePrevMonth} className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-sm">←</button>
             <button onClick={handleToday} className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-sm">Today</button>
             <button onClick={handleNextMonth} className="px-3 py-1.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-sm font-bold text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700 transition shadow-sm">→</button>
           </div>
        </div>
        <div className="grid grid-cols-7 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                <div key={day} className="p-2 text-center">
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{day}</span>
                </div>
            ))}
        </div>
        <div className="grid grid-cols-7 auto-rows-[minmax(80px,auto)]">
          {days.map(day => {
            const isCurrentMonth = isSameMonth(day, today);
            const isToday = isSameDay(day, today);
            const dayEvents = events.filter(e => e.startsAt && isSameDay(new Date(e.startsAt), day));

            return (
              <div 
                  key={day.toString()} 
                  className={`border-b border-r border-slate-100 dark:border-slate-800 p-1.5 transition-colors ${
                      !isCurrentMonth ? 'bg-slate-50/50 dark:bg-slate-900/50 opacity-50' : 'bg-white dark:bg-slate-900'
                  } ${isToday ? `bg-${color}-50/30 dark:bg-${color}-900/10` : ''}`}
              >
                  <div className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full mb-1 ${
                      isToday ? `bg-${color}-500 text-white` : 'text-slate-700 dark:text-slate-300'
                  }`}>
                      {format(day, 'd')}
                  </div>
                  <div className="space-y-2">
                      {dayEvents.map(event => (
                          <div 
                              key={event.id}
                              onClick={() => setSelectedEvent(event)}
                              className={`block rounded-lg overflow-hidden border border-slate-100 dark:border-slate-800 transition shadow-sm hover:shadow-md group flex flex-col cursor-pointer`}
                              title={event.name}
                          >
                              {dayEvents.length === 1 && event.imageUrl ? (
                                <div className="w-full aspect-video bg-slate-100 dark:bg-slate-800 relative">
                                    <img src={event.imageUrl} alt={event.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300" />
                                    <div className="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent" />
                                    <div className="absolute bottom-0 left-0 right-0 p-1.5">
                                        <div className="text-[10px] font-bold text-white truncate drop-shadow-md">
                                            {format(new Date(event.startsAt), 'h:mm a')} {event.name}
                                        </div>
                                    </div>
                                </div>
                              ) : (
                                <div className={`px-1.5 py-1.5 truncate text-[10px] font-bold bg-${color}-50 text-${color}-800 dark:bg-${color}-900/20 dark:text-${color}-300 group-hover:bg-${color}-100 dark:group-hover:bg-${color}-900/40 transition`}>
                                    <span className="opacity-75 mr-1">{format(new Date(event.startsAt), 'h:mm a')}</span>
                                    {event.name}
                                </div>
                              )}
                          </div>
                      ))}
                  </div>
              </div>
            );
          })}
        </div>

        {selectedEvent && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-in fade-in duration-200">
                <div className="bg-white dark:bg-slate-900 rounded-2xl w-full max-w-md max-h-[90vh] overflow-y-auto shadow-2xl relative">
                   <button onClick={() => setSelectedEvent(null)} className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-full bg-white dark:bg-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition shadow-sm border border-slate-200 dark:border-slate-700">✕</button>
                   {selectedEvent.imageUrl && <img src={selectedEvent.imageUrl} alt={selectedEvent.name} className="w-full h-48 object-cover rounded-t-2xl" />}
                   <div className="p-6 pt-8">
                       <h3 className="text-xl font-black text-slate-900 dark:text-white mb-2">{selectedEvent.name}</h3>
                       <div className="text-sm font-medium text-slate-500 mb-4">
                           {selectedEvent.startsAt ? format(new Date(selectedEvent.startsAt), 'EEEE, MMMM d, yyyy h:mm a') : 'Time TBD'}
                           {selectedEvent.location && <span className="block mt-1">{selectedEvent.location}</span>}
                       </div>
                       {selectedEvent.description && (
                           <div className="prose dark:prose-invert prose-sm max-w-none text-slate-600 dark:text-slate-400 mb-6" dangerouslySetInnerHTML={{ __html: selectedEvent.description }} />
                       )}
                       {selectedEvent.publicUrl && (
                           <a href={selectedEvent.publicUrl} target="_blank" rel="noreferrer" className={`block w-full text-center px-4 py-3 rounded-xl font-bold text-white bg-${color}-600 hover:bg-${color}-700 transition shadow-md`}>
                               View Event Details
                           </a>
                       )}
                   </div>
                </div>
            </div>
        )}
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${getGridClass(layout, gridCols)}`}>
      {filteredEvents.map(e => (
        <div key={e.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition flex flex-col">
          {e.imageUrl && (
             <div className={`w-full ${imageRatio === '1:1' ? 'aspect-square' : 'aspect-video'} bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800`}>
                <img src={e.imageUrl} alt={e.name} className="w-full h-full object-cover" />
             </div>
          )}
          <div className="p-5 flex-grow flex flex-col">
            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-1">{e.name || 'Unnamed Event'}</h3>
            {(e.featured || e.recurring || e.repeats) && (
                <div className="flex flex-wrap gap-2 mb-3">
                    {e.featured && <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">Featured</span>}
                    {(e.recurring || e.repeats) && <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">Recurring</span>}
                </div>
            )}
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-3 flex flex-wrap items-center gap-2">
                 {e.startsAt && <span className="font-medium whitespace-nowrap">{new Date(e.startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                 {e.startsAt && e.location && <span className="w-1 h-1 flex-shrink-0 rounded-full bg-slate-300 dark:bg-slate-700"/>}
                 {e.location && <span className="truncate max-w-[200px]">{e.location}</span>}
            </div>
            {e.publicUrl && (
                <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
                    <a href={e.publicUrl} target="_blank" rel="noreferrer" className={`text-sm font-bold text-${color}-600 dark:text-${color}-400 hover:text-${color}-700 transition`}>More Info →</a>
                </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function FormsWidget({ churchId, layout, color, gridCols, maxItems, singleFormId, visibleFormIds }: any) {
  const [forms, setForms] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const queryStr = window.location.search.includes('refresh=true') ? '?refresh=true' : '';
    fetch(`${apiBaseUrl}/api/public/forms/${churchId}${queryStr}`)
      .then(r => r.json().then(data => ({ status: r.status, ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || data.error) throw new Error(data.error || 'Failed to fetch forms');
        setForms(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, [churchId]);

  const filteredForms = useMemo(() => {
    let result = forms;
    // Support legacy singleFormId param
    if (singleFormId) {
      result = result.filter(f => f.id === singleFormId);
    } else if (visibleFormIds !== null) {
      // New multi-select: filter to only visible ones
      result = result.filter(f => (visibleFormIds as Set<string>).has(f.id));
    }
    if (maxItems > 0 && !singleFormId) result = result.slice(0, maxItems);
    return result;
  }, [forms, maxItems, singleFormId, visibleFormIds]);

  if (loading) return <div className="text-center p-8 animate-pulse text-slate-400">Loading Forms...</div>;
  if (error) return <div className="text-center p-8 text-rose-500 border-2 border-dashed border-rose-200 dark:border-rose-900/30 rounded-xl bg-rose-50 dark:bg-rose-900/10"><strong>Connection Error:</strong> {error}. <br/>Please ensure Planning Center is securely connected with the required permissions.</div>;
  if (!filteredForms.length) return <div className="text-center p-8 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">No active forms available.</div>;

  if (layout === 'list') {
    return (
      <div className="space-y-4">
        {filteredForms.map(f => (
          <div key={f.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition flex flex-col sm:flex-row group hover:border-indigo-500 dark:hover:border-indigo-500">
            <div className="p-5 flex-1 flex flex-col">
              <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">{f.name || 'Unnamed Form'}</h3>
              <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3 mb-4">{f.description?.replace(/<[^>]+>/g, '').replace(/&amp;nbsp;|&nbsp;/g, ' ').trim() || 'No description provided.'}</p>
              <div className="mt-auto pt-4 flex items-center justify-end border-t border-slate-100 dark:border-slate-800">
                <a href={f.publicUrl || '#'} target="_blank" rel="noreferrer" className={`text-sm font-bold text-${color}-600 dark:text-${color}-400`}>Fill Out Form →</a>
              </div>
            </div>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={`grid gap-4 ${getGridClass(layout, gridCols)}`}>
      {filteredForms.map(f => (
        <div key={f.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition flex flex-col group hover:border-indigo-500 dark:hover:border-indigo-500">
          <div className="p-5 flex-1 flex flex-col">
            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-1 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">{f.name || 'Unnamed Form'}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{f.description?.replace(/<[^>]+>/g, '').replace(/&amp;nbsp;|&nbsp;/g, ' ').trim() || 'No description provided.'}</p>
            <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end">
              <a href={f.publicUrl || '#'} target="_blank" rel="noreferrer" className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-${color}-500 group-hover:bg-${color}-600 transition`}>
                Start
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function SingleEventWidget({ 
  churchId, 
  eventId, 
  eventSource, 
  eventStyle, 
  color, 
  ctaText, 
  showCountdown, 
  showLocation,
  imageRatio 
}: any) {
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState<{ days: number; hours: number; minutes: number; seconds: number } | null>(null);

  useEffect(() => {
    const endpoint = eventSource === 'registrations' ? 'registrations' : 'events';
    const queryStr = window.location.search.includes('refresh=true') ? '?refresh=true' : '';
    fetch(`${apiBaseUrl}/api/public/${endpoint}/${churchId}${queryStr}`)
      .then(r => r.json().then(data => ({ status: r.status, ok: r.ok, data })))
      .then(({ ok, data }) => {
        if (!ok || data.error) throw new Error(data.error || 'Failed to fetch event');
        const list = Array.isArray(data) ? data : [];
        const found = eventId ? list.find((e: any) => String(e.id) === String(eventId)) : list[0];
        setEvent(found || list[0] || null);
        setLoading(false);
      })
      .catch(e => {
        setError(e.message);
        setLoading(false);
      });
  }, [churchId, eventId, eventSource]);

  // Live countdown timer calculation
  useEffect(() => {
    if (!event?.startsAt || !showCountdown) return;

    const calculateTime = () => {
      const target = new Date(event.startsAt).getTime();
      const now = new Date().getTime();
      const diff = target - now;

      if (diff <= 0) {
        setTimeLeft(null);
        return;
      }

      const days = Math.floor(diff / (1000 * 60 * 60 * 24));
      const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((diff % (1000 * 60)) / 1000);
      setTimeLeft({ days, hours, minutes, seconds });
    };

    calculateTime();
    const interval = setInterval(calculateTime, 1000);
    return () => clearInterval(interval);
  }, [event?.startsAt, showCountdown]);

  const COLOR_THEMES: Record<string, { bg: string; hoverBg: string; text: string; ring: string; badge: string }> = {
    indigo: { bg: 'bg-indigo-600', hoverBg: 'hover:bg-indigo-700', text: 'text-indigo-600 dark:text-indigo-400', ring: 'ring-indigo-500', badge: 'bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800' },
    blue: { bg: 'bg-blue-600', hoverBg: 'hover:bg-blue-700', text: 'text-blue-600 dark:text-blue-400', ring: 'ring-blue-500', badge: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800' },
    emerald: { bg: 'bg-emerald-600', hoverBg: 'hover:bg-emerald-700', text: 'text-emerald-600 dark:text-emerald-400', ring: 'ring-emerald-500', badge: 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800' },
    amber: { bg: 'bg-amber-600', hoverBg: 'hover:bg-amber-700', text: 'text-amber-600 dark:text-amber-400', ring: 'ring-amber-500', badge: 'bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800' },
    red: { bg: 'bg-red-600', hoverBg: 'hover:bg-red-700', text: 'text-red-600 dark:text-red-400', ring: 'ring-red-500', badge: 'bg-red-500/10 text-red-700 dark:text-red-300 border-red-200 dark:border-red-800' },
    violet: { bg: 'bg-violet-600', hoverBg: 'hover:bg-violet-700', text: 'text-violet-600 dark:text-violet-400', ring: 'ring-violet-500', badge: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800' },
    fuchsia: { bg: 'bg-fuchsia-600', hoverBg: 'hover:bg-fuchsia-700', text: 'text-fuchsia-600 dark:text-fuchsia-400', ring: 'ring-fuchsia-500', badge: 'bg-fuchsia-500/10 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800' },
    rose: { bg: 'bg-rose-600', hoverBg: 'hover:bg-rose-700', text: 'text-rose-600 dark:text-rose-400', ring: 'ring-rose-500', badge: 'bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800' },
  };

  const activeTheme = COLOR_THEMES[color] || COLOR_THEMES.indigo;

  if (loading) return <div className="text-center p-8 animate-pulse text-slate-400">Loading Featured Event...</div>;
  if (error) return <div className="text-center p-8 text-rose-500 border-2 border-dashed border-rose-200 dark:border-rose-900/30 rounded-xl bg-rose-50 dark:bg-rose-900/10"><strong>Connection Error:</strong> {error}</div>;
  if (!event) return <div className="text-center p-8 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">Event not found. Please select an active event in the widget manager.</div>;

  const imageUrl = event.imageUrl || event.logoUrl || event.headerImage || null;
  const cleanDescription = event.description?.replace(/<[^>]+>/g, '').replace(/&amp;nbsp;|&nbsp;/g, ' ').trim() || '';
  const eventDateStr = event.startsAt ? format(new Date(event.startsAt), 'EEEE, MMMM d, yyyy') : '';
  const eventTimeStr = event.startsAt ? format(new Date(event.startsAt), 'h:mm a') : '';
  
  const rawPublicUrl = event.publicUrl || event.churchCenterUrl || '';
  const hasPublicUrl = Boolean(rawPublicUrl && rawPublicUrl !== '#' && rawPublicUrl !== 'null');
  const publicUrl = hasPublicUrl ? rawPublicUrl : '#';

  // Smart button label default: if ctaText is empty or generic Register Now for calendar event, use Learn More
  const defaultLabel = eventSource === 'calendar' ? 'Learn More' : 'Register Now';
  const buttonLabel = (ctaText && ctaText !== 'Register Now') ? ctaText : (eventSource === 'calendar' ? 'Learn More' : (ctaText || 'Register Now'));

  // 1. HERO STYLE
  if (eventStyle === 'hero') {
    return (
      <div className="relative rounded-2xl overflow-hidden border border-slate-200 dark:border-slate-800 shadow-xl bg-slate-900 text-white min-h-[360px] flex flex-col justify-end group">
        {imageUrl ? (
          <div className="absolute inset-0">
            <img src={imageUrl} alt={event.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700 opacity-60" />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/70 to-slate-950/30" />
          </div>
        ) : (
          <div className="absolute inset-0 bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-950 opacity-95" />
        )}

        <div className="relative z-10 p-6 md:p-8 flex flex-col gap-4">
          <div className="flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-white/10 backdrop-blur-md border border-white/20 text-white shadow-sm">
              <Sparkles size={13} className="text-amber-400" /> Featured Event
            </span>
            {eventDateStr && (
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold bg-black/40 backdrop-blur-md border border-white/10 text-slate-200">
                <Calendar size={13} className="text-indigo-400" /> {eventDateStr} {eventTimeStr ? `• ${eventTimeStr}` : ''}
              </span>
            )}
          </div>

          <h1 className="text-2xl sm:text-3xl md:text-4xl font-black text-white leading-tight tracking-tight drop-shadow-md">
            {event.name}
          </h1>

          {showLocation && event.location && (
            <div className="flex items-center gap-2 text-sm text-slate-300 font-medium">
              <MapPin size={16} className="text-rose-400 shrink-0" />
              <span className="truncate">{event.location}</span>
            </div>
          )}

          {cleanDescription && (
            <p className="text-sm sm:text-base text-slate-300/90 line-clamp-2 max-w-2xl font-normal leading-relaxed">
              {cleanDescription}
            </p>
          )}

          {/* Countdown Ticker */}
          {showCountdown && timeLeft && (
            <div className="grid grid-cols-4 gap-2 sm:gap-3 max-w-xs pt-1">
              {[
                { label: 'Days', val: timeLeft.days },
                { label: 'Hours', val: timeLeft.hours },
                { label: 'Mins', val: timeLeft.minutes },
                { label: 'Secs', val: timeLeft.seconds },
              ].map((t, idx) => (
                <div key={idx} className="flex flex-col items-center justify-center p-2 rounded-xl bg-white/10 backdrop-blur-md border border-white/15">
                  <span className="text-lg sm:text-xl font-black text-white tracking-tight">{String(t.val).padStart(2, '0')}</span>
                  <span className="text-[9px] uppercase font-bold tracking-wider text-slate-300">{t.label}</span>
                </div>
              ))}
            </div>
          )}

          <div className="pt-2">
            {hasPublicUrl ? (
              <a
                href={publicUrl}
                target="_blank"
                rel="noreferrer"
                className={`inline-flex items-center gap-2.5 px-6 py-3.5 rounded-xl font-extrabold text-white text-base shadow-lg hover:shadow-2xl transition transform hover:-translate-y-0.5 ${activeTheme.bg} ${activeTheme.hoverBg}`}
              >
                {buttonLabel} <ArrowRight size={18} />
              </a>
            ) : (
              <span className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-extrabold bg-white/10 backdrop-blur-md border border-white/20 text-slate-200">
                No Registration Required
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // 2. COMPACT STYLE
  if (eventStyle === 'compact') {
    return (
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm hover:shadow-md transition flex flex-col sm:flex-row sm:items-center justify-between gap-4 group">
        <div className="flex items-center gap-4 min-w-0">
          {imageUrl ? (
            <img src={imageUrl} alt={event.name} className="w-14 h-14 rounded-lg object-cover shrink-0 border border-slate-100 dark:border-slate-800" />
          ) : (
            <div className={`w-14 h-14 rounded-lg flex items-center justify-center shrink-0 border ${activeTheme.badge}`}>
              <Calendar size={24} className={activeTheme.text} />
            </div>
          )}
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">Event</span>
              {event.startsAt && <span className="text-xs text-slate-500 font-bold">{format(new Date(event.startsAt), 'MMM d, h:mm a')}</span>}
            </div>
            <h3 className="font-bold text-base sm:text-lg text-slate-900 dark:text-white truncate group-hover:text-indigo-600 transition mt-0.5">{event.name}</h3>
            {showLocation && event.location && (
              <p className="text-xs text-slate-500 dark:text-slate-400 truncate flex items-center gap-1 mt-0.5">
                <MapPin size={12} className="shrink-0 text-slate-400" /> {event.location}
              </p>
            )}
          </div>
        </div>

        <div className="shrink-0 flex items-center gap-3">
          {showCountdown && timeLeft && (
            <div className="hidden md:flex items-center gap-2 text-xs font-mono font-bold text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800 px-3 py-1.5 rounded-lg border border-slate-200 dark:border-slate-700">
              <span>{timeLeft.days}d</span>:<span>{String(timeLeft.hours).padStart(2, '0')}h</span>:<span>{String(timeLeft.minutes).padStart(2, '0')}m</span>
            </div>
          )}
          {hasPublicUrl ? (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className={`inline-flex items-center gap-1.5 px-4 py-2.5 rounded-lg text-sm font-bold text-white transition ${activeTheme.bg} ${activeTheme.hoverBg} shadow-sm whitespace-nowrap`}
            >
              {buttonLabel} <ArrowRight size={14} />
            </a>
          ) : (
            <span className="inline-flex items-center px-3 py-1.5 rounded-lg text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 whitespace-nowrap">
              No Signup Needed
            </span>
          )}
        </div>
      </div>
    );
  }

  // 3. CARD STYLE (Default)
  return (
    <div className="max-w-xl mx-auto bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden shadow-md hover:shadow-xl transition flex flex-col group">
      {imageUrl && (
        <div className={`w-full ${imageRatio === '1:1' ? 'aspect-square' : 'aspect-video'} bg-slate-100 dark:bg-slate-950 relative overflow-hidden border-b border-slate-100 dark:border-slate-800`}>
          <img src={imageUrl} alt={event.name} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" />
          <div className="absolute top-3 right-3">
            <span className="inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider bg-black/60 backdrop-blur-md text-white border border-white/20 shadow">
              <Sparkles size={12} className="text-amber-400" /> Featured
            </span>
          </div>
        </div>
      )}

      <div className="p-6 flex-1 flex flex-col gap-4">
        <div>
          {eventDateStr && (
            <div className="flex items-center gap-2 text-xs font-extrabold uppercase tracking-wider text-indigo-600 dark:text-indigo-400 mb-1.5">
              <Calendar size={14} /> {eventDateStr} {eventTimeStr ? `at ${eventTimeStr}` : ''}
            </div>
          )}
          <h2 className="text-2xl font-black text-slate-900 dark:text-white leading-snug group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">
            {event.name}
          </h2>
        </div>

        {showLocation && event.location && (
          <div className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400 font-medium">
            <MapPin size={15} className="text-rose-500 shrink-0" />
            <span className="truncate">{event.location}</span>
          </div>
        )}

        {cleanDescription && (
          <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed line-clamp-3">
            {cleanDescription}
          </p>
        )}

        {/* Countdown Ticker */}
        {showCountdown && timeLeft && (
          <div className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700/60 rounded-xl p-3 flex items-center justify-around text-center">
            {[
              { label: 'Days', val: timeLeft.days },
              { label: 'Hours', val: timeLeft.hours },
              { label: 'Mins', val: timeLeft.minutes },
              { label: 'Secs', val: timeLeft.seconds },
            ].map((t, idx) => (
              <div key={idx} className="flex flex-col">
                <span className="text-base font-black text-slate-900 dark:text-white">{String(t.val).padStart(2, '0')}</span>
                <span className="text-[9px] uppercase font-bold text-slate-400 tracking-wider">{t.label}</span>
              </div>
            ))}
          </div>
        )}

        <div className="mt-auto pt-2">
          {hasPublicUrl ? (
            <a
              href={publicUrl}
              target="_blank"
              rel="noreferrer"
              className={`w-full inline-flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl font-bold text-white text-sm shadow-md hover:shadow-lg transition ${activeTheme.bg} ${activeTheme.hoverBg}`}
            >
              {buttonLabel} <ArrowRight size={16} />
            </a>
          ) : (
            <div className="w-full text-center px-4 py-3 rounded-xl font-bold text-slate-500 dark:text-slate-400 bg-slate-100 dark:bg-slate-800/80 text-sm">
              No Registration Required
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
