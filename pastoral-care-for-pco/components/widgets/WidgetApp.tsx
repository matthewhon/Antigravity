import React, { useEffect, useState, useMemo } from 'react';
import { format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths } from 'date-fns';

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

    // Apply proportional scaling to root element
    html.style.fontSize = `${16 * parseFloat(scale)}px`;

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
      {type === 'registrations' && <RegistrationsWidget churchId={churchId} layout={layout} color={color} gridCols={gridCols} dateFilter={dateFilter} tagFilter={tagFilter} imageRatio={imageRatio} maxItems={maxItems} />}
      {(type === 'events' || type === 'calendar') && <EventsWidget churchId={churchId} layout={layout} color={color} gridCols={gridCols} imageRatio={imageRatio} maxItems={maxItems} />}
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

function RegistrationsWidget({ churchId, layout, color, gridCols, dateFilter, tagFilter, imageRatio, maxItems }: any) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<any>(null);

  useEffect(() => {
    const queryStr = window.location.search.includes('refresh=true') ? '?refresh=true' : '';
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
      <div className="space-y-2">
        {filteredEvents.map(e => (
           <div 
             key={e.id} 
             onClick={() => setSelectedEvent(e)}
             className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-lg p-4 cursor-pointer hover:border-indigo-500 dark:hover:border-indigo-500 transition flex items-center justify-between group"
           >
             <div>
                <h3 className="font-bold text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition">{e.name}</h3>
                {e.startsAt && <span className="text-xs text-slate-500 font-medium mt-1 inline-block">{new Date(e.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric'})}</span>}
             </div>
             <span className={`text-slate-300 group-hover:text-${color}-500 transition font-bold`}>→</span>
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
              <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-3 mb-4">{e.description?.replace(/<[^>]+>/g, '') || 'No description provided.'}</p>
              <div className="mt-auto pt-4 flex items-center justify-between border-t border-slate-100 dark:border-slate-800">
                <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">{e.startsAt ? new Date(e.startsAt).toLocaleDateString() : ''}</span>
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
            <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{e.description?.replace(/<[^>]+>/g, '') || 'No description provided.'}</p>
            <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-bold uppercase tracking-widest">{e.startsAt ? new Date(e.startsAt).toLocaleDateString() : ''}</span>
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
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{day}</span>
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
