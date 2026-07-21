import React, { useMemo, useState, useEffect } from 'react';
import { PcoGroup, PcoPerson } from '../types';
import { Search, Download, Users, Calendar, AlertTriangle, ChevronDown, Loader2 } from 'lucide-react';
import { pcoService } from '../services/pcoService';

interface GroupAbsenteesReportProps {
    groups: PcoGroup[];
    people: PcoPerson[];
    churchId?: string;
}

const TOOLTIP_STYLE = {
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#1e293b',
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
};

function getDateRange(preset: string, customFrom: string, customTo: string): { start: Date; end: Date; label: string } {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999);

    if (preset === 'custom') {
        const s = customFrom ? new Date(customFrom + 'T00:00:00') : new Date(now.getFullYear(), now.getMonth(), 1);
        const e = customTo ? new Date(customTo + 'T23:59:59') : today;
        return { start: s, end: e, label: `${s.toLocaleDateString()} – ${e.toLocaleDateString()}` };
    }
    if (preset === 'this_month') {
        const s = new Date(now.getFullYear(), now.getMonth(), 1);
        return { start: s, end: today, label: 'This Month' };
    }
    if (preset === 'last_month') {
        const s = new Date(now.getFullYear(), now.getMonth() - 1, 1);
        const e = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999);
        return { start: s, end: e, label: 'Last Month' };
    }
    if (preset === 'last_30') {
        const s = new Date(today);
        s.setDate(s.getDate() - 30);
        return { start: s, end: today, label: 'Last 30 Days' };
    }
    if (preset === 'last_90') {
        const s = new Date(today);
        s.setDate(s.getDate() - 90);
        return { start: s, end: today, label: 'Last 90 Days' };
    }
    if (preset === 'last_quarter') {
        const q = Math.floor(now.getMonth() / 3);
        const s = new Date(now.getFullYear(), (q - 1) * 3, 1);
        const e = new Date(now.getFullYear(), q * 3, 0, 23, 59, 59, 999);
        return { start: s, end: e, label: 'Last Quarter' };
    }
    // Default: this month
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: today, label: 'This Month' };
}

export const GroupAbsenteesReport: React.FC<GroupAbsenteesReportProps> = ({ groups, people, churchId }) => {
    const [selectedGroupId, setSelectedGroupId] = useState<string>('all');
    const [datePreset, setDatePreset] = useState('last_30');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [search, setSearch] = useState('');

    const [pcoLists, setPcoLists] = useState<{ id: string; name: string }[]>([]);
    const [selectedListId, setSelectedListId] = useState<string>('all');
    const [listMemberIds, setListMemberIds] = useState<Set<string> | null>(null);
    const [isLoadingList, setIsLoadingList] = useState(false);

    useEffect(() => {
        if (!churchId) return;
        pcoService.getPeopleLists(churchId)
            .then(raw => {
                const lists = (raw || []).map((item: any) => ({
                    id: item.id,
                    name: item.attributes?.name || 'Unnamed List'
                })).sort((a: any, b: any) => a.name.localeCompare(b.name));
                setPcoLists(lists);
            })
            .catch(console.error);
    }, [churchId]);

    useEffect(() => {
        if (selectedListId === 'all' || !churchId) {
            setListMemberIds(null);
            return;
        }
        setIsLoadingList(true);
        pcoService.getListPeopleIds(churchId, selectedListId)
            .then(ids => {
                setListMemberIds(new Set(ids));
            })
            .catch(console.error)
            .finally(() => setIsLoadingList(false));
    }, [selectedListId, churchId]);

    const activeGroups = useMemo(() =>
        groups.filter(g => !g.archivedAt).sort((a, b) => a.name.localeCompare(b.name)),
        [groups]
    );

    const { start, end, label: rangeLabel } = useMemo(
        () => getDateRange(datePreset, customFrom, customTo),
        [datePreset, customFrom, customTo]
    );

    // Build a people lookup map
    const peopleMap = useMemo(() => {
        const m = new Map<string, PcoPerson>();
        people.forEach(p => m.set(p.id, p));
        return m;
    }, [people]);

    // For each relevant group, find events in range and determine absentees
    const reportRows = useMemo(() => {
        const targetGroups = selectedGroupId === 'all'
            ? activeGroups
            : activeGroups.filter(g => g.id === selectedGroupId);

        const rows: {
            groupId: string;
            groupName: string;
            personId: string;
            personName: string;
            email?: string;
            phone?: string;
            eventsInRange: number;
            eventsAttended: number;
            eventsAbsent: number;
            absenceRate: number;
            lastAttended?: string;
        }[] = [];

        targetGroups.forEach(group => {
            const history = group.attendanceHistory || [];
            const memberIds = group.memberIds || [];
            if (memberIds.length === 0) return;

            // Events in range
            const eventsInRange = history.filter(h => {
                const d = new Date(h.date);
                return d >= start && d <= end;
            });

            if (eventsInRange.length === 0) return;

            // For each member, count attended vs absent
            memberIds.forEach(memberId => {
                if (listMemberIds && !listMemberIds.has(memberId)) return;

                const attended = eventsInRange.filter(e =>
                    Array.isArray(e.attendeeIds) && e.attendeeIds.includes(memberId)
                );
                const absent = eventsInRange.length - attended.length;
                if (absent === 0) return; // Only show absentees

                const person = peopleMap.get(memberId);
                const name = person?.name || `Member ${memberId}`;

                // Last attended date across all history
                const allAttended = history
                    .filter(e => Array.isArray(e.attendeeIds) && e.attendeeIds.includes(memberId))
                    .map(e => e.date)
                    .sort()
                    .reverse();

                rows.push({
                    groupId: group.id,
                    groupName: group.name,
                    personId: memberId,
                    personName: name,
                    email: person?.email,
                    phone: person?.phone,
                    eventsInRange: eventsInRange.length,
                    eventsAttended: attended.length,
                    eventsAbsent: absent,
                    absenceRate: Math.round((absent / eventsInRange.length) * 100),
                    lastAttended: allAttended[0],
                });
            });
        });

        return rows.sort((a, b) => b.absenceRate - a.absenceRate);
    }, [activeGroups, selectedGroupId, start, end, peopleMap, listMemberIds]);

    const filtered = useMemo(() => {
        if (!search.trim()) return reportRows;
        const q = search.toLowerCase();
        return reportRows.filter(r =>
            r.personName.toLowerCase().includes(q) ||
            r.groupName.toLowerCase().includes(q) ||
            (r.email || '').toLowerCase().includes(q)
        );
    }, [reportRows, search]);

    // Summary stats
    const totalAbsentees = new Set(filtered.map(r => r.personId)).size;
    const totalGroups = new Set(filtered.map(r => r.groupId)).size;
    const avgAbsenceRate = filtered.length > 0
        ? Math.round(filtered.reduce((s, r) => s + r.absenceRate, 0) / filtered.length)
        : 0;

    const exportCsv = () => {
        const header = 'Group,Member Name,Email,Phone,Events in Period,Attended,Missed,Absence Rate,Last Attended\n';
        const rows = filtered.map(r =>
            `"${r.groupName}","${r.personName}","${r.email || ''}","${r.phone || ''}",${r.eventsInRange},${r.eventsAttended},${r.eventsAbsent},${r.absenceRate}%,"${r.lastAttended ? new Date(r.lastAttended).toLocaleDateString() : 'Never'}"`
        ).join('\n');
        const blob = new Blob([header + rows], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `group-absentees-${rangeLabel.replace(/\s/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h3 className="text-2xl font-black tracking-tighter text-slate-900 dark:text-white">
                        Group Absentees Report
                    </h3>
                    <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
                        Members who missed one or more group events in the selected period
                    </p>
                </div>
                <button
                    onClick={exportCsv}
                    disabled={filtered.length === 0}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-40 text-white text-sm font-bold transition-colors"
                >
                    <Download size={14} /> Export CSV
                </button>
            </div>

            {/* Filters */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Group filter */}
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
                            Group
                        </label>
                        <div className="relative">
                            <select
                                value={selectedGroupId}
                                onChange={e => setSelectedGroupId(e.target.value)}
                                className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-medium rounded-xl px-4 py-2.5 pr-8 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                                <option value="all">All Active Groups</option>
                                {activeGroups.map(g => (
                                    <option key={g.id} value={g.id}>{g.name}</option>
                                ))}
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* PCO List filter */}
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
                            PCO List Filter
                        </label>
                        <div className="relative">
                            <select
                                value={selectedListId}
                                onChange={e => setSelectedListId(e.target.value)}
                                disabled={pcoLists.length === 0}
                                className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-medium rounded-xl px-4 py-2.5 pr-8 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer disabled:opacity-50"
                            >
                                <option value="all">All People</option>
                                {pcoLists.map(l => (
                                    <option key={l.id} value={l.id}>{l.name}</option>
                                ))}
                            </select>
                            {isLoadingList ? (
                                <Loader2 size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 animate-spin pointer-events-none" />
                            ) : (
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            )}
                        </div>
                    </div>

                    {/* Date preset */}
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
                            Date Range
                        </label>
                        <div className="relative">
                            <select
                                value={datePreset}
                                onChange={e => setDatePreset(e.target.value)}
                                className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-medium rounded-xl px-4 py-2.5 pr-8 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                            >
                                <option value="this_month">This Month</option>
                                <option value="last_month">Last Month</option>
                                <option value="last_30">Last 30 Days</option>
                                <option value="last_90">Last 90 Days</option>
                                <option value="last_quarter">Last Quarter</option>
                                <option value="custom">Custom Range</option>
                            </select>
                            <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                        </div>
                    </div>

                    {/* Search */}
                    <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
                            Search
                        </label>
                        <div className="relative">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Name, group, email…"
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded-xl pl-9 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                </div>

                {/* Custom date pickers */}
                {datePreset === 'custom' && (
                    <div className="grid grid-cols-2 gap-4 mt-4">
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">From</label>
                            <input
                                type="date"
                                value={customFrom}
                                onChange={e => setCustomFrom(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">To</label>
                            <input
                                type="date"
                                value={customTo}
                                onChange={e => setCustomTo(e.target.value)}
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>
                )}
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {[
                    { label: 'Absentees Found', value: totalAbsentees, color: 'text-rose-600 dark:text-rose-400', icon: <Users size={18} className="text-rose-400" /> },
                    { label: 'Groups Affected', value: totalGroups, color: 'text-amber-600 dark:text-amber-400', icon: <AlertTriangle size={18} className="text-amber-400" /> },
                    { label: 'Avg Absence Rate', value: `${avgAbsenceRate}%`, color: 'text-indigo-600 dark:text-indigo-400', icon: <Calendar size={18} className="text-indigo-400" /> },
                ].map(s => (
                    <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-4 shadow-sm">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0">
                            {s.icon}
                        </div>
                        <div>
                            <p className={`text-2xl font-black ${s.color}`}>{s.value}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{s.label}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div>
                        <h4 className="text-sm font-black text-slate-900 dark:text-white">Absentee Details</h4>
                        <p className="text-xs text-slate-400 mt-0.5">{rangeLabel} · {filtered.length} records</p>
                    </div>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left">
                        <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-700">
                            <tr>
                                {['Member', 'Group', 'Events', 'Attended', 'Missed', 'Absence Rate', 'Last Attended'].map(col => (
                                    <th key={col} className="px-4 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 whitespace-nowrap">
                                        {col}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                            {filtered.length > 0 ? filtered.map((row, i) => (
                                <tr key={`${row.groupId}-${row.personId}-${i}`} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                    <td className="px-4 py-3">
                                        <p className="text-xs font-bold text-slate-900 dark:text-white">{row.personName}</p>
                                        {row.email && <p className="text-[10px] text-slate-400 truncate max-w-[160px]">{row.email}</p>}
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs text-slate-600 dark:text-slate-300 font-medium">{row.groupName}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="text-xs font-black text-slate-900 dark:text-white">{row.eventsInRange}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="text-xs font-black text-emerald-600 dark:text-emerald-400">{row.eventsAttended}</span>
                                    </td>
                                    <td className="px-4 py-3 text-center">
                                        <span className="text-xs font-black text-rose-600 dark:text-rose-400">{row.eventsAbsent}</span>
                                    </td>
                                    <td className="px-4 py-3">
                                        <div className="flex items-center gap-2">
                                            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden min-w-[60px]">
                                                <div
                                                    className={`h-full rounded-full ${row.absenceRate >= 75 ? 'bg-rose-500' : row.absenceRate >= 50 ? 'bg-amber-500' : 'bg-indigo-500'}`}
                                                    style={{ width: `${row.absenceRate}%` }}
                                                />
                                            </div>
                                            <span className={`text-[10px] font-black ${row.absenceRate >= 75 ? 'text-rose-600 dark:text-rose-400' : row.absenceRate >= 50 ? 'text-amber-600 dark:text-amber-400' : 'text-indigo-600 dark:text-indigo-400'}`}>
                                                {row.absenceRate}%
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-4 py-3">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">
                                            {row.lastAttended
                                                ? new Date(row.lastAttended).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
                                                : <span className="text-rose-400 font-semibold">Never</span>
                                            }
                                        </span>
                                    </td>
                                </tr>
                            )) : (
                                <tr>
                                    <td colSpan={7} className="px-4 py-16 text-center">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="text-4xl opacity-20">🎉</div>
                                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No absentees found</p>
                                            <p className="text-xs text-slate-400">
                                                {reportRows.length === 0
                                                    ? 'No attendance data with attendee tracking for this period. Try syncing your groups.'
                                                    : 'Everyone attended at least one event in this period.'}
                                            </p>
                                        </div>
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
};
