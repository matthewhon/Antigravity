import React, { useEffect, useState } from 'react';

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

  useEffect(() => {
    const html = document.documentElement;
    const body = document.body;
    if (theme === 'dark') {
      html.classList.add('dark');
      body.classList.add('dark');
      html.style.colorScheme = 'dark';
    } else {
      html.classList.remove('dark');
      body.classList.remove('dark');
      html.style.colorScheme = 'light';
    }
  }, [theme]);

  if (!churchId) {
    return <div className="p-4 text-center text-slate-500">Error: Missing churchId parameter.</div>;
  }

  return (
    <div className={`min-h-screen bg-transparent p-4 font-sans ${theme === 'dark' ? 'text-slate-200' : 'text-slate-800'}`}>
      {type === 'groups' && <GroupsWidget churchId={churchId} layout={layout} color={color} />}
      {type === 'registrations' && <RegistrationsWidget churchId={churchId} layout={layout} color={color} />}
      {(type === 'events' || type === 'calendar') && <EventsWidget churchId={churchId} layout={layout} color={color} />}
    </div>
  );
}

function GroupsWidget({ churchId, layout, color }: any) {
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

  if (loading) return <div className="text-center p-8 animate-pulse text-slate-400">Loading Groups...</div>;
  if (error) return <div className="text-center p-8 text-rose-500 border-2 border-dashed border-rose-200 dark:border-rose-900/30 rounded-xl bg-rose-50 dark:bg-rose-900/10"><strong>Connection Error:</strong> {error}. <br/>Please ensure Planning Center is securely connected with the required permissions.</div>;
  if (!groups.length) return <div className="text-center p-8 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">No groups found.</div>;

  return (
    <div className={`grid gap-4 ${layout === 'list' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
      {groups.map(g => (
        <div key={g.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition">
          {g.headerImage && <img src={g.headerImage} alt={g.name} className="w-full h-48 object-contain object-center bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800" />}
          <div className="p-5">
            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-1">{g.name || 'Unnamed Group'}</h3>
            {g.groupTypeName && <span className="inline-block px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-slate-100 dark:bg-slate-800 text-slate-500 mb-3">{g.groupTypeName}</span>}
            <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{g.description || 'No description provided.'}</p>
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500 dark:text-slate-500 font-medium">{g.membersCount || 0} members</span>
              <a href={g.publicUrl || '#'} target="_blank" rel="noreferrer" className={`text-sm font-semibold tracking-wide text-${color}-600 dark:text-${color}-400 hover:text-${color}-500 transition`}>
                Join â†’
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function RegistrationsWidget({ churchId, layout, color }: any) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  if (loading) return <div className="text-center p-8 animate-pulse text-slate-400">Loading Registrations...</div>;
  if (error) return <div className="text-center p-8 text-rose-500 border-2 border-dashed border-rose-200 dark:border-rose-900/30 rounded-xl bg-rose-50 dark:bg-rose-900/10"><strong>Connection Error:</strong> {error}. <br/>Please ensure Planning Center is securely connected with the required permissions.</div>;
  if (!events.length) return <div className="text-center p-8 text-slate-400 border-2 border-dashed border-slate-200 dark:border-slate-800 rounded-xl">No signups available.</div>;

  return (
    <div className={`grid gap-4 ${layout === 'list' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
      {events.map(e => (
        <div key={e.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition">
          {e.logoUrl && <img src={e.logoUrl} alt={e.name} className="w-full h-48 object-contain object-center bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800" />}
          <div className="p-5">
            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-1">{e.name || 'Unnamed Event'}</h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 line-clamp-2">{e.description || 'No description provided.'}</p>
            <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <span className="text-xs text-slate-500 font-medium">{e.signupsCount || 0} registered</span>
              <a href={e.publicUrl || '#'} target="_blank" rel="noreferrer" className={`px-4 py-1.5 rounded-lg text-xs font-bold text-white bg-${color}-500 hover:bg-${color}-600 transition`}>
                Register
              </a>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function EventsWidget({ churchId, layout, color }: any) {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className={`grid gap-4 ${layout === 'list' ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3'}`}>
      {events.map(e => (
        <div key={e.id} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden shadow-sm hover:shadow-md transition flex flex-col">
          {e.imageUrl && <img src={e.imageUrl} alt={e.name} className="w-full h-48 object-contain object-center bg-slate-50 dark:bg-slate-950 border-b border-slate-100 dark:border-slate-800" />}
          <div className="p-5 flex-grow flex flex-col">
            <h3 className="font-bold text-lg text-slate-900 dark:text-slate-100 mb-1">{e.name || 'Unnamed Event'}</h3>
            <div className="text-sm text-slate-600 dark:text-slate-400 mb-3 flex flex-wrap items-center gap-2">
                 {e.startsAt && <span className="font-medium whitespace-nowrap">{new Date(e.startsAt).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                 {e.startsAt && e.location && <span className="w-1 h-1 flex-shrink-0 rounded-full bg-slate-300 dark:bg-slate-700"/>}
                 {e.location && <span className="truncate max-w-[200px]">{e.location}</span>}
            </div>
            {e.publicUrl && (
                <div className="mt-auto pt-4 border-t border-slate-100 dark:border-slate-800">
                    <a href={e.publicUrl} target="_blank" rel="noreferrer" className={`text-sm font-bold text-${color}-600 dark:text-${color}-400 hover:text-${color}-700 transition`}>More Info â†’</a>
                </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
