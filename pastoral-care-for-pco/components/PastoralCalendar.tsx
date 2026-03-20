import React, { useState, useMemo } from 'react';
import { PcoPerson } from '../types';
import { 
    format, startOfMonth, endOfMonth, startOfWeek, endOfWeek, 
    eachDayOfInterval, isSameMonth, isSameDay, addMonths, subMonths, 
    addWeeks, subWeeks, getYear, getMonth, getDate, differenceInYears, 
    parseISO, isValid, setYear, isWithinInterval
} from 'date-fns';

interface PastoralCalendarProps {
    people: PcoPerson[];
}

type EventType = 'birthday' | 'anniversary' | 'salvation' | 'baptism';

interface CalendarEvent {
    id: string;
    personId: string;
    personName: string;
    householdName?: string;
    date: Date; // Normalized to current view year
    originalDate: Date;
    type: EventType;
    years?: number; // Turning age or years since event
    phone?: string;
    email?: string;
    avatar?: string | null;
}

export const PastoralCalendar: React.FC<PastoralCalendarProps> = ({ people }) => {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [viewMode, setViewMode] = useState<'month' | 'week'>('month');

    const events = useMemo(() => {
        const allEvents: CalendarEvent[] = [];
        const year = getYear(currentDate);

        people.forEach(person => {
            // Helper to add event if date exists
            const addEvent = (dateStr: string | null | undefined, type: EventType) => {
                if (!dateStr) return;
                const date = parseISO(dateStr);
                if (!isValid(date)) return;

                // Normalize to current year
                const normalizedDate = setYear(date, year);
                
                // Calculate years/age
                const years = differenceInYears(normalizedDate, date);

                allEvents.push({
                    id: `${person.id}-${type}`,
                    personId: person.id,
                    personName: person.name,
                    householdName: person.householdName,
                    date: normalizedDate,
                    originalDate: date,
                    type,
                    years: type === 'birthday' ? years : years, // "Turning Age" or "Anniversary Year"
                    phone: person.phone,
                    email: person.email,
                    avatar: person.avatar
                });
            };

            addEvent(person.birthdate, 'birthday');
            addEvent(person.anniversary, 'anniversary');
            addEvent(person.salvationDate, 'salvation');
            addEvent(person.baptismDate, 'baptism');
        });

        return allEvents.sort((a, b) => a.date.getTime() - b.date.getTime());
    }, [people, currentDate]);

    const filteredEvents = useMemo(() => {
        let start, end;
        if (viewMode === 'month') {
            start = startOfMonth(currentDate);
            end = endOfMonth(currentDate);
        } else {
            start = startOfWeek(currentDate);
            end = endOfWeek(currentDate);
        }

        return events.filter(event => 
            isWithinInterval(event.date, { start, end })
        );
    }, [events, viewMode, currentDate]);

    const days = useMemo(() => {
        let start, end;
        if (viewMode === 'month') {
            start = startOfWeek(startOfMonth(currentDate));
            end = endOfWeek(endOfMonth(currentDate));
        } else {
            start = startOfWeek(currentDate);
            end = endOfWeek(currentDate);
        }
        return eachDayOfInterval({ start, end });
    }, [currentDate, viewMode]);

    const next = () => {
        if (viewMode === 'month') {
            setCurrentDate(addMonths(currentDate, 1));
        } else {
            setCurrentDate(addWeeks(currentDate, 1));
        }
    };

    const prev = () => {
        if (viewMode === 'month') {
            setCurrentDate(subMonths(currentDate, 1));
        } else {
            setCurrentDate(subWeeks(currentDate, 1));
        }
    };

    const getEventColor = (type: EventType) => {
        switch (type) {
            case 'birthday': return 'bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800';
            case 'anniversary': return 'bg-amber-100 text-amber-700 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800';
            case 'salvation': return 'bg-indigo-100 text-indigo-700 border-indigo-200 dark:bg-indigo-900/30 dark:text-indigo-300 dark:border-indigo-800';
            case 'baptism': return 'bg-cyan-100 text-cyan-700 border-cyan-200 dark:bg-cyan-900/30 dark:text-cyan-300 dark:border-cyan-800';
            default: return 'bg-slate-100 text-slate-700 border-slate-200';
        }
    };

    const getEventIcon = (type: EventType) => {
        switch (type) {
            case 'birthday': return '🎂';
            case 'anniversary': return '💍';
            case 'salvation': return '✝️';
            case 'baptism': return '🌊';
            default: return '📅';
        }
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden h-full flex flex-col">
            {/* Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row justify-between items-center gap-4">
                <div className="flex items-center gap-4">
                    <h2 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                        {format(currentDate, viewMode === 'month' ? 'MMMM yyyy' : "'Week of' MMM d, yyyy")}
                    </h2>
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-1 rounded-xl">
                        <button 
                            onClick={() => setViewMode('month')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${viewMode === 'month' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                        >
                            Month
                        </button>
                        <button 
                            onClick={() => setViewMode('week')}
                            className={`px-4 py-1.5 rounded-lg text-xs font-black uppercase tracking-wider transition-all ${viewMode === 'week' ? 'bg-white dark:bg-slate-700 text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                        >
                            Week
                        </button>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button onClick={prev} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
                    </button>
                    <button onClick={() => setCurrentDate(new Date())} className="px-4 py-2 bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 text-xs font-black uppercase tracking-widest rounded-lg hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition-colors">
                        Today
                    </button>
                    <button onClick={next} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>
                    </button>
                </div>
            </div>

            {/* Calendar Grid */}
            <div className="flex-1 overflow-y-auto">
                <div className={`grid ${viewMode === 'month' ? 'grid-cols-7' : 'grid-cols-1'} h-full`}>
                    {/* Weekday Headers for Month View */}
                    {viewMode === 'month' && ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map(day => (
                        <div key={day} className="p-4 text-center border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                            <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">{day}</span>
                        </div>
                    ))}

                    {/* Days */}
                    {days.map(day => {
                        const dayEvents = filteredEvents.filter(e => isSameDay(e.date, day));
                        const isCurrentMonth = isSameMonth(day, currentDate);
                        const isToday = isSameDay(day, new Date());

                        if (viewMode === 'week') {
                            return (
                                <div key={day.toString()} className="flex border-b border-slate-100 dark:border-slate-800 p-6 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors group">
                                    <div className="w-32 flex-shrink-0">
                                        <p className={`text-sm font-bold uppercase tracking-widest mb-1 ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400'}`}>
                                            {format(day, 'EEEE')}
                                        </p>
                                        <div className={`text-3xl font-black ${isToday ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-900 dark:text-white'}`}>
                                            {format(day, 'd')}
                                        </div>
                                    </div>
                                    <div className="flex-1 space-y-3">
                                        {dayEvents.length > 0 ? (
                                            dayEvents.map(event => (
                                                <div key={event.id} className={`flex items-center justify-between p-4 rounded-2xl border ${getEventColor(event.type)}`}>
                                                    <div className="flex items-center gap-4">
                                                        <div className="text-2xl">{getEventIcon(event.type)}</div>
                                                        <div>
                                                            <p className="font-bold text-sm">
                                                                {event.personName}
                                                                <span className="opacity-60 font-normal ml-2">
                                                                    {event.type === 'birthday' ? `turning ${event.years}` : 
                                                                     event.type === 'anniversary' ? `${event.years} years` : 
                                                                     `${event.years} years ago`}
                                                                </span>
                                                            </p>
                                                            {event.householdName && (
                                                                <p className="text-[10px] font-bold opacity-60 uppercase tracking-widest mt-0.5">
                                                                    {event.householdName} Household
                                                                </p>
                                                            )}
                                                        </div>
                                                    </div>
                                                    <div className="flex items-center gap-3">
                                                        {event.phone && (
                                                            <a href={`tel:${event.phone}`} className="p-2 bg-white/50 hover:bg-white rounded-lg transition-colors" title="Call">
                                                                📞
                                                            </a>
                                                        )}
                                                        {event.email && (
                                                            <a href={`mailto:${event.email}`} className="p-2 bg-white/50 hover:bg-white rounded-lg transition-colors" title="Email">
                                                                ✉️
                                                            </a>
                                                        )}
                                                    </div>
                                                </div>
                                            ))
                                        ) : (
                                            <p className="text-sm text-slate-400 italic py-2">No events scheduled</p>
                                        )}
                                    </div>
                                </div>
                            );
                        }

                        return (
                            <div 
                                key={day.toString()} 
                                className={`min-h-[120px] border-b border-r border-slate-100 dark:border-slate-800 p-2 transition-colors ${
                                    !isCurrentMonth ? 'bg-slate-50/50 dark:bg-slate-900/50' : 'bg-white dark:bg-slate-900'
                                } ${isToday ? 'bg-indigo-50/30 dark:bg-indigo-900/10' : ''}`}
                            >
                                <div className="flex justify-between items-start mb-2">
                                    <span className={`text-xs font-bold w-6 h-6 flex items-center justify-center rounded-full ${
                                        isToday 
                                            ? 'bg-indigo-600 text-white' 
                                            : !isCurrentMonth ? 'text-slate-300 dark:text-slate-600' : 'text-slate-700 dark:text-slate-300'
                                    }`}>
                                        {format(day, 'd')}
                                    </span>
                                </div>
                                <div className="space-y-1">
                                    {dayEvents.map(event => (
                                        <div 
                                            key={event.id} 
                                            className={`px-2 py-1 rounded-lg border text-[10px] font-bold truncate flex items-center gap-1.5 ${getEventColor(event.type)}`}
                                            title={`${event.personName} - ${event.type} (${event.years} years)`}
                                        >
                                            <span>{getEventIcon(event.type)}</span>
                                            <span className="truncate">{event.personName}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
