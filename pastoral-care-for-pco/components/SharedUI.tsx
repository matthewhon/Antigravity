
import React from 'react';
import { differenceInYears, parseISO, isValid } from 'date-fns';
import { LifecycleDonor, PcoPerson, PastoralNote, PrayerRequest } from '../types';

interface WidgetWrapperProps {
    title: string; 
    onRemove: () => void; 
    children: React.ReactNode; 
    source?: string;
    headerControl?: React.ReactNode;
    locationName?: string;
    isDefault?: boolean;
}

export const WidgetWrapper: React.FC<WidgetWrapperProps> = ({ title, onRemove, children, source, headerControl, locationName, isDefault }) => (
  <div className="bg-white dark:bg-slate-800 p-8 print:p-4 rounded-3xl print:rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm print:shadow-none relative group hover:border-indigo-100 dark:hover:border-slate-600 transition-colors flex flex-col h-full print:break-inside-avoid">
    <div className="flex justify-between items-center mb-8 print:mb-2">
      <div className="flex flex-col">
        <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{title}</h4>
        {locationName && (
            <div className="flex items-center gap-2 mt-1">
                <span className="text-[9px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">{locationName}</span>
                {isDefault && (
                    <span className="text-[8px] font-black bg-indigo-500 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">Default</span>
                )}
            </div>
        )}
      </div>
      <div className="flex items-center gap-3 print:hidden">
          {headerControl}
          <button onClick={onRemove} className="text-slate-300 dark:text-slate-600 hover:text-rose-500 dark:hover:text-rose-500 transition-colors">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
          </button>
      </div>
    </div>
    <div className="flex-1">
        {children}
    </div>
    {source && (
        <div className="mt-8 print:mt-2 flex justify-end items-center gap-1 border-t border-slate-50 dark:border-slate-800 pt-4 print:pt-2">
            <span className="text-[8px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-widest">Source: {source}</span>
        </div>
    )}
  </div>
);

export const StatCard: React.FC<{ label: string; value: string; color: string; source?: string; subValue?: string }> = ({ label, value, color, source, subValue }) => {
  const colorMap: any = {
    indigo: 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400 dark:border-indigo-900/30',
    emerald: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/30',
    amber: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/30',
    violet: 'bg-violet-50 text-violet-600 border-violet-100 dark:bg-violet-900/20 dark:text-violet-400 dark:border-violet-900/30',
    rose: 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:border-rose-900/30',
    cyan: 'bg-cyan-50 text-cyan-600 border-cyan-100 dark:bg-cyan-900/20 dark:text-cyan-400 dark:border-cyan-900/30',
    slate: 'bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-800 dark:text-slate-400 dark:border-slate-700',
  };
  
  // Print override: remove background colors to save ink, use borders instead
  const printClass = "print:bg-white print:border-slate-200 print:text-slate-900";

  return (
    <div className={`p-6 print:p-3 rounded-3xl print:rounded-lg border ${colorMap[color] || colorMap.indigo} ${printClass} flex flex-col justify-between h-full transition-colors duration-300`}>
      <p className="text-[9px] font-black uppercase tracking-widest opacity-60 mb-1">{label}</p>
      <div>
        <p className="text-4xl print:text-xl font-black tracking-tighter">{value}</p>
        {subValue && <p className="text-[9px] font-bold opacity-60 uppercase tracking-wide mt-1">{subValue}</p>}
      </div>
      {source && (
        <div className="relative z-10 mt-auto pt-2 text-right border-t border-black/5 dark:border-white/5 mt-4 print:hidden">
             <span className="text-[8px] font-bold opacity-40 uppercase tracking-widest">Source: {source}</span>
        </div>
      )}
    </div>
  );
};

export const CensusCard: React.FC<{ 
    title: string; 
    onRemove: () => void; 
    children: React.ReactNode;
    locationName?: string;
    isDefault?: boolean;
}> = ({ title, onRemove, children, locationName, isDefault }) => (
    <div className="bg-white dark:bg-slate-800 p-8 print:p-4 rounded-3xl print:rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm print:shadow-none h-full flex flex-col group relative print:break-inside-avoid">
        <button onClick={onRemove} className="absolute top-6 right-6 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 z-10 print:hidden">✕</button>
        <div className="flex justify-between items-center mb-6 print:mb-2">
            <div className="flex flex-col">
                <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest">{title}</h4>
                {locationName && (
                    <div className="flex items-center gap-2 mt-1">
                        <span className="text-[9px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-widest">{locationName}</span>
                        {isDefault && (
                            <span className="text-[8px] font-black bg-indigo-500 text-white px-1.5 py-0.5 rounded uppercase tracking-tighter">Default</span>
                        )}
                    </div>
                )}
            </div>
            <div className="w-2 h-2 rounded-full bg-slate-200 dark:bg-slate-700 print:hidden"></div>
        </div>
        <div className="flex-1">
            {children}
        </div>
    </div>
);

export const DonorListWidget: React.FC<{ title: string; donors: LifecycleDonor[]; color: string; onRemove: () => void }> = ({ title, donors, color, onRemove }) => {
    const colorMap: any = {
        indigo: 'text-indigo-600 bg-indigo-50 border-indigo-100 dark:text-indigo-400 dark:bg-indigo-950 dark:border-indigo-900',
        emerald: 'text-emerald-600 bg-emerald-50 border-emerald-100 dark:text-emerald-400 dark:bg-emerald-950 dark:border-emerald-900',
        cyan: 'text-cyan-600 bg-cyan-50 border-cyan-100 dark:text-cyan-400 dark:bg-cyan-950 dark:border-cyan-900',
        violet: 'text-violet-600 bg-violet-50 border-violet-100 dark:text-violet-400 dark:bg-violet-950 dark:border-violet-900',
        amber: 'text-amber-600 bg-amber-50 border-amber-100 dark:text-amber-400 dark:bg-amber-950 dark:border-amber-900',
        rose: 'text-rose-600 bg-rose-50 border-rose-100 dark:text-rose-400 dark:bg-rose-950 dark:border-rose-900',
        slate: 'text-slate-600 bg-slate-50 border-slate-100 dark:text-slate-400 dark:bg-slate-800 dark:border-slate-700',
    };
    const theme = colorMap[color] || colorMap.indigo;

    return (
        <div className="bg-white dark:bg-slate-800 p-8 print:p-4 rounded-3xl print:rounded-xl border border-slate-100 dark:border-slate-700 shadow-sm print:shadow-none relative group hover:border-indigo-100 dark:hover:border-slate-600 transition-colors flex flex-col h-full print:break-inside-avoid">
            <div className="flex justify-between items-center mb-6 print:mb-2">
                <div className="flex items-center gap-3">
                    <h4 className="text-[11px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-[0.2em]">{title}</h4>
                    <span className={`text-[9px] font-bold px-2 py-0.5 rounded ${theme} print:border print:bg-white`}>{donors.length}</span>
                </div>
                <button onClick={onRemove} className="text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors print:hidden">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
            
            <div className="flex-1 overflow-y-auto pr-2 custom-scrollbar space-y-2 max-h-64 print:max-h-none print:overflow-visible">
                {donors.length > 0 ? (
                    donors.map(d => (
                        <div key={d.id} className="flex items-center justify-between p-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-100 dark:border-slate-800 group/item hover:bg-white dark:hover:bg-slate-800/80 transition-all print:p-1 print:border-b print:rounded-none">
                            <div className="flex items-center gap-3">
                                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black ${theme} print:bg-slate-100 print:text-slate-600 print:w-6 print:h-6`}>
                                    {d.avatar ? <img src={d.avatar} className="w-full h-full rounded-full object-cover" alt={d.name} /> : d.name.charAt(0)}
                                </div>
                                <div>
                                    <p className="text-xs font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
                                        {d.name}
                                        {d.riskProfile && (
                                            <span 
                                                className={`w-2 h-2 rounded-full ${
                                                    d.riskProfile.category === 'Healthy' ? 'bg-emerald-500' : 
                                                    d.riskProfile.category === 'At Risk' ? 'bg-amber-500' : 'bg-rose-500'
                                                }`} 
                                                title={`Risk: ${d.riskProfile.category} (${d.riskProfile.score})`}
                                            />
                                        )}
                                    </p>
                                    <p className="text-[9px] text-slate-400">Avg/mo: ${Math.round(d.avgMonthlyAmount).toLocaleString()}</p>
                                </div>
                            </div>
                            <span className="text-[9px] font-mono text-slate-400">{new Date(d.lastGiftDate).toLocaleDateString()}</span>
                        </div>
                    ))
                ) : (
                    <div className="h-full flex items-center justify-center text-center text-slate-400 dark:text-slate-500 text-xs font-bold p-4">
                        No donors in this category.
                    </div>
                )}
            </div>
        </div>
    );
};

export const PersonList: React.FC<{ people: PcoPerson[]; type: string }> = ({ people, type }) => (
  <div className="space-y-4 print:space-y-2">
    {people.map(p => (
      <div key={p.id} className="flex items-center justify-between p-4 print:p-2 bg-slate-50 dark:bg-slate-900 print:bg-white rounded-2xl print:rounded-lg border border-slate-100 dark:border-slate-800 print:border-slate-200 group/item hover:bg-white dark:hover:bg-slate-800 transition-all">
        <div className="flex items-center gap-4 print:gap-2">
          <a 
            href={`https://people.planningcenteronline.com/people/${p.id}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-10 h-10 print:w-8 print:h-8 rounded-xl overflow-hidden bg-slate-200 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex-shrink-0 relative block hover:ring-2 hover:ring-indigo-500 transition-all"
          >
            {p.avatar ? <img src={p.avatar} alt="" className="w-full h-full object-cover" /> : <div className="w-full h-full flex items-center justify-center font-black text-slate-400 dark:text-slate-500 text-xs">{p.name.charAt(0)}</div>}
            {p.engagementStatus === 'Core' && (
                <div className="absolute bottom-0 right-0 w-3 h-3 bg-emerald-500 border-2 border-white dark:border-slate-900 rounded-full" title="Core Attendee"></div>
            )}
          </a>
          <div className="overflow-hidden">
            <a 
                href={`https://people.planningcenteronline.com/people/${p.id}`}
                target="_blank"
                rel="noopener noreferrer"
                className="font-black text-slate-900 dark:text-slate-100 text-sm truncate hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors block"
            >
                {p.name}
            </a>
            <div className="flex flex-wrap gap-2 items-center mt-0.5">
                <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest truncate">{p.membership || 'Guest'}</p>
                
                {p.riskProfile && (
                    <span className={`text-[8px] font-black uppercase px-1.5 py-0.5 rounded tracking-wider ${
                        p.riskProfile.category === 'Healthy' ? 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400' :
                        p.riskProfile.category === 'At Risk' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                        'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400'
                    }`}>
                        {p.riskProfile.category}
                    </span>
                )}

                {p.checkInCount !== undefined && p.checkInCount > 0 && (
                    <p className="text-[9px] font-black text-emerald-500 uppercase tracking-widest truncate hidden sm:block">
                        • {p.checkInCount} Visits
                    </p>
                )}
            </div>
          </div>
        </div>
        <div className="text-right flex-shrink-0 flex flex-col items-end gap-1">
          <span className="text-[9px] font-black text-indigo-500 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/20 print:bg-transparent print:border print:border-slate-200 px-2 py-1 rounded-lg uppercase tracking-widest">
            {type === 'birthday' ? (p.birthdate?.split('-').slice(1).join('/') || 'Upcoming') : 
             type === 'anniversary' ? (p.anniversary?.split('-').slice(1).join('/') || 'Soon') : 
             type === 'recent' ? (new Date(p.createdAt).toLocaleDateString(undefined, {month:'short', day:'numeric'})) :
             'New'}
          </span>
          {type === 'birthday' && (() => {
            const bd = p.birthdate ? parseISO(p.birthdate) : null;
            const age = bd && isValid(bd) ? differenceInYears(new Date(), bd) : null;
            return age !== null && age < 18 ? (
              <span className="text-[8px] font-black bg-rose-500 text-white px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                Age {age + 1}
              </span>
            ) : null;
          })()}
        </div>
      </div>
    ))}
  </div>
);

export const CareNoteCard: React.FC<{ note: PastoralNote; onRemove?: () => void }> = ({ note, onRemove }) => {
    const typeColors: any = {
        Visit: 'bg-indigo-50 text-indigo-600 border-indigo-100 dark:bg-indigo-900/20 dark:text-indigo-400',
        Call: 'bg-emerald-50 text-emerald-600 border-emerald-100 dark:bg-emerald-900/20 dark:text-emerald-400',
        Meeting: 'bg-violet-50 text-violet-600 border-violet-100 dark:bg-violet-900/20 dark:text-violet-400',
        Note: 'bg-slate-50 text-slate-600 border-slate-100 dark:bg-slate-800 dark:text-slate-400',
        Crisis: 'bg-rose-50 text-rose-600 border-rose-100 dark:bg-rose-900/20 dark:text-rose-400',
        Hospital: 'bg-amber-50 text-amber-600 border-amber-100 dark:bg-amber-900/20 dark:text-amber-400',
    };

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm group relative">
            {onRemove && (
                <button onClick={onRemove} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
            )}
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded tracking-widest border ${typeColors[note.type] || typeColors.Note}`}>
                        {note.type}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">{new Date(note.date).toLocaleDateString()}</span>
                </div>
                <span className="text-[10px] font-black text-slate-900 dark:text-white truncate max-w-[120px]">{note.personName}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4">{note.content}</p>
            <div className="flex justify-between items-center pt-4 border-t border-slate-50 dark:border-slate-800">
                <div className="flex items-center gap-2">
                    <div className="w-5 h-5 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[8px] font-black">
                        {note.authorName.charAt(0)}
                    </div>
                    <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest">{note.authorName}</span>
                </div>
                {note.followUpDate && (
                    <span className="text-[9px] font-black text-rose-500 uppercase tracking-widest flex items-center gap-1">
                        <span className="text-xs">📅</span> {new Date(note.followUpDate).toLocaleDateString()}
                    </span>
                )}
            </div>
        </div>
    );
};

export const PrayerRequestCard: React.FC<{ request: PrayerRequest; onUpdateStatus?: (status: any) => void; onRemove?: () => void }> = ({ request, onUpdateStatus, onRemove }) => {
    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm group relative">
            {onRemove && (
                <button onClick={onRemove} className="absolute top-4 right-4 text-slate-300 hover:text-rose-500 opacity-0 group-hover:opacity-100 transition-opacity">✕</button>
            )}
            <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-3">
                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded tracking-widest border ${
                        request.status === 'Active' ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 
                        request.status === 'Answered' ? 'bg-indigo-50 text-indigo-600 border-indigo-100' : 'bg-slate-50 text-slate-400 border-slate-100'
                    }`}>
                        {request.status}
                    </span>
                    <span className="text-[10px] font-bold text-slate-400">{new Date(request.date).toLocaleDateString()}</span>
                </div>
                <span className="text-[10px] font-black text-slate-900 dark:text-white truncate max-w-[120px]">{request.personName}</span>
            </div>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed mb-4 italic">"{request.request}"</p>
            
            <div className="flex justify-between items-center pt-4 border-t border-slate-50 dark:border-slate-800">
                <div className="flex gap-2">
                    {request.status === 'Active' && onUpdateStatus && (
                        <button onClick={() => onUpdateStatus('Answered')} className="text-[9px] font-black uppercase tracking-widest text-indigo-500 hover:text-indigo-600 transition-colors">Mark Answered</button>
                    )}
                    {request.status !== 'Archived' && onUpdateStatus && (
                        <button onClick={() => onUpdateStatus('Archived')} className="text-[9px] font-black uppercase tracking-widest text-slate-400 hover:text-slate-500 transition-colors">Archive</button>
                    )}
                </div>
                {request.isPublic && <span className="text-[8px] font-black text-emerald-500 uppercase tracking-widest">Public</span>}
            </div>
        </div>
    );
};
