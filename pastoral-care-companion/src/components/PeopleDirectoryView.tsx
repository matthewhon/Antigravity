import React, { useState, useEffect, useMemo } from 'react';
import { PcoPerson, User } from '../types';
import { firestore } from '../services/firestoreService';
import { Search, ChevronRight, Loader2 } from 'lucide-react';

interface PeopleDirectoryViewProps {
  churchId: string;
  currentUser: User;
  onSelectPerson: (person: PcoPerson) => void;
  people: PcoPerson[];
  loading: boolean;
}

export const PeopleDirectoryView: React.FC<PeopleDirectoryViewProps> = ({ 
  churchId, onSelectPerson, people, loading
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('All');

  // Filter and sort people list
  const filteredPeople = useMemo(() => {
    return people
      .filter(p => {
        const matchesSearch = p.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
          p.email?.toLowerCase().includes(searchQuery.toLowerCase()) || 
          p.phone?.includes(searchQuery);
        
        const matchesStatus = statusFilter === 'All' || 
          p.membership === statusFilter || 
          p.status === statusFilter;
        
        return matchesSearch && matchesStatus;
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [people, searchQuery, statusFilter]);

  // Get unique status values for filtering
  const statuses = useMemo(() => {
    const set = new Set<string>();
    people.forEach(p => {
      if (p.membership) set.add(p.membership);
      if (p.status) set.add(p.status);
    });
    return ['All', ...Array.from(set)];
  }, [people]);

  const getInitials = (name: string) => {
    return name
      .split(' ')
      .slice(0, 2)
      .map(part => part[0])
      .join('')
      .toUpperCase();
  };

  const formatPhone = (phoneNum?: string) => {
    if (!phoneNum) return '';
    const digits = phoneNum.replace(/\D/g, '');
    if (digits.length === 10) {
      return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phoneNum;
  };

  return (
    <div className="h-full w-full flex flex-col bg-slate-50 dark:bg-zinc-950">
      {/* Search & Filter Section */}
      <div className="p-4 bg-white dark:bg-zinc-900 border-b border-slate-200/80 dark:border-zinc-800 shrink-0 space-y-3">
        <div className="relative">
          <Search size={18} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 dark:text-zinc-500" />
          <input
            type="text"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            placeholder="Search by name, email, or phone..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-zinc-800 border border-slate-200 dark:border-zinc-700 rounded-2xl outline-none focus:ring-2 focus:ring-indigo-500 dark:focus:ring-indigo-400/50 text-sm font-bold placeholder:text-slate-400 placeholder:font-medium dark:text-white transition"
          />
        </div>

        {/* Filter Pills scroll area */}
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar py-0.5">
          {statuses.map(st => (
            <button
              key={st}
              onClick={() => setStatusFilter(st)}
              className={`px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap shrink-0 transition ${statusFilter === st ? 'bg-indigo-600 text-white shadow-sm' : 'bg-slate-100 dark:bg-zinc-800 text-slate-600 dark:text-zinc-400 hover:bg-slate-200 dark:hover:bg-zinc-700'}`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      {/* Directory List */}
      <div className="flex-1 min-h-0 overflow-y-auto p-4 space-y-2">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400">
            <Loader2 className="w-8 h-8 animate-spin text-indigo-500 mb-2" />
            <p className="text-xs font-bold uppercase tracking-wider">Loading Contacts...</p>
          </div>
        ) : filteredPeople.length === 0 ? (
          <div className="text-center py-20 text-slate-400">
            <p className="text-sm font-medium">No directory records found.</p>
          </div>
        ) : (
          filteredPeople.map(p => (
            <div
              key={p.id}
              onClick={() => onSelectPerson(p)}
              className="flex items-center gap-3 p-3 bg-white dark:bg-zinc-900 border border-slate-100 dark:border-zinc-800 rounded-2xl hover:border-indigo-200 dark:hover:border-indigo-900 transition active:scale-[0.99] cursor-pointer shadow-sm shadow-slate-100/50 dark:shadow-none"
            >
              <div className="shrink-0">
                {p.avatar ? (
                  <img
                    src={p.avatar}
                    alt={p.name}
                    className="w-10 h-10 rounded-full object-cover bg-slate-100 dark:bg-zinc-800"
                    loading="lazy"
                  />
                ) : (
                  <div className="w-10 h-10 rounded-full bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-black text-xs">
                    {getInitials(p.name)}
                  </div>
                )}
              </div>

              <div className="flex-1 min-w-0">
                <p className="text-sm font-black truncate text-slate-900 dark:text-white">{p.name}</p>
                <div className="flex items-center gap-1.5 mt-0.5">
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[9px] font-extrabold uppercase tracking-wide bg-slate-100 dark:bg-zinc-800 text-slate-500 dark:text-zinc-400`}>
                    {p.membership || p.status || 'Contact'}
                  </span>
                  {p.phone && (
                    <span className="text-[11px] font-semibold text-slate-400 dark:text-zinc-500 truncate">
                      • {formatPhone(p.phone)}
                    </span>
                  )}
                </div>
              </div>

              <ChevronRight size={16} className="text-slate-400" />
            </div>
          ))
        )}
      </div>
    </div>
  );
};
