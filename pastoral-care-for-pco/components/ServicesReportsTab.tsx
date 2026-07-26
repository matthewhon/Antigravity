import React, { useMemo, useState } from 'react';
import { ServicesDashboardData, PcoPerson, AttendanceRecord, ServicePlanSnapshot } from '../types';
import { 
    Search, Download, Users, Calendar, AlertTriangle, ChevronDown, 
    Music, TrendingUp, CheckCircle, Clock, Heart, List, HelpCircle
} from 'lucide-react';
import { 
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
    BarChart, Bar, Legend, Cell, PieChart, Pie
} from 'recharts';

interface ServicesReportsTabProps {
    servicesData: ServicesDashboardData | null;
    people: PcoPerson[];
    churchId?: string;
    pcoConnected: boolean;
}

const TOOLTIP_STYLE = {
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#1e293b',
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)'
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
    return { start: new Date(now.getFullYear(), now.getMonth(), 1), end: today, label: 'This Month' };
}

export const ServicesReportsTab: React.FC<ServicesReportsTabProps> = ({
    servicesData,
    people,
    churchId,
    pcoConnected
}) => {
    const [activeTab, setActiveTab] = useState<'attendance' | 'volunteers' | 'staffing' | 'songs'>('attendance');
    const [datePreset, setDatePreset] = useState('last_90');
    const [customFrom, setCustomFrom] = useState('');
    const [customTo, setCustomTo] = useState('');
    const [searchQuery, setSearchQuery] = useState('');
    const [serviceTypeFilter, setServiceTypeFilter] = useState('all');

    const { start, end, label: rangeLabel } = useMemo(
        () => getDateRange(datePreset, customFrom, customTo),
        [datePreset, customFrom, customTo]
    );

    // Get list of service types for filter dropdown
    const serviceTypes = useMemo(() => {
        if (!servicesData?.plans && !servicesData?.recentPlans) return [];
        const plansList = servicesData.plans || servicesData.recentPlans || [];
        const types = new Set<string>();
        plansList.forEach(p => {
            if (p.serviceTypeName) types.add(p.serviceTypeName);
        });
        return Array.from(types).sort();
    }, [servicesData]);

    // ----------------------------------------------------
    // Sub-Report 1: Attendance & Headcounts
    // ----------------------------------------------------
    const attendanceDataFiltered = useMemo(() => {
        const trends = servicesData?.checkIns?.trends || [];
        return trends.filter(t => {
            const d = new Date(t.date);
            return d >= start && d <= end;
        });
    }, [servicesData, start, end]);

    const attendanceStats = useMemo(() => {
        let total = 0;
        let guests = 0;
        let regulars = 0;
        let volunteers = 0;
        let digitalCheckins = 0;
        let headcounts = 0;

        attendanceDataFiltered.forEach(t => {
            total += t.total;
            guests += t.guests || 0;
            regulars += t.regulars || 0;
            volunteers += t.volunteers || 0;
            digitalCheckins += t.digitalCheckins || 0;
            headcounts += (t.headcount || 0);
        });

        const count = attendanceDataFiltered.length;
        const avg = count > 0 ? Math.round(total / count) : 0;

        return { total, avg, guests, regulars, volunteers, digitalCheckins, headcounts };
    }, [attendanceDataFiltered]);

    const exportAttendanceCsv = () => {
        const header = 'Date,Regulars,Guests,Volunteers,Digital Check-ins,Manual Headcounts,Total\n';
        const rows = attendanceDataFiltered.map(r => 
            `"${r.date}",${r.regulars || 0},${r.guests || 0},${r.volunteers || 0},${r.digitalCheckins || 0},${r.headcount || 0},${r.total}`
        ).join('\n');
        const blob = new Blob([header + rows], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `services-attendance-${rangeLabel.replace(/\s/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ----------------------------------------------------
    // Sub-Report 2: Volunteer Engagement & Burnout
    // ----------------------------------------------------
    const volunteerRows = useMemo(() => {
        const query = searchQuery.trim().toLowerCase();
        
        return people
            .filter(p => {
                // Ensure they have serving stats
                if (!p.servingStats) return false;
                if (query) {
                    const matchesName = p.name?.toLowerCase().includes(query);
                    const matchesEmail = p.email?.toLowerCase().includes(query);
                    const matchesTeam = p.servingStats.recentServices?.some(s => s.teamName?.toLowerCase().includes(query));
                    if (!matchesName && !matchesEmail && !matchesTeam) return false;
                }
                return true;
            })
            .map(p => {
                const stats = p.servingStats!;
                return {
                    id: p.id,
                    name: p.name || 'Unknown Volunteer',
                    email: p.email,
                    servingCount: stats.last90DaysCount || 0,
                    riskLevel: stats.riskLevel || 'Low',
                    nextServiceDate: stats.nextServiceDate,
                    recentServices: stats.recentServices || []
                };
            })
            .sort((a, b) => b.servingCount - a.servingCount);
    }, [people, searchQuery]);

    const volunteerStats = useMemo(() => {
        let totalActive = volunteerRows.length;
        let highRisk = volunteerRows.filter(v => v.riskLevel === 'High').length;
        let medRisk = volunteerRows.filter(v => v.riskLevel === 'Medium').length;
        let lowRisk = volunteerRows.filter(v => v.riskLevel === 'Low').length;

        // Bucket distribution
        let count1x = volunteerRows.filter(v => v.servingCount === 1).length;
        let count2to3x = volunteerRows.filter(v => v.servingCount >= 2 && v.servingCount <= 3).length;
        let count4to6x = volunteerRows.filter(v => v.servingCount >= 4 && v.servingCount <= 6).length;
        let count7plus = volunteerRows.filter(v => v.servingCount >= 7).length;

        const avgServed = totalActive > 0 
            ? parseFloat((volunteerRows.reduce((sum, v) => sum + v.servingCount, 0) / totalActive).toFixed(1))
            : 0;

        return { totalActive, highRisk, medRisk, lowRisk, avgServed, count1x, count2to3x, count4to6x, count7plus };
    }, [volunteerRows]);

    const exportVolunteersCsv = () => {
        const header = 'Volunteer Name,Email,Serving Count (Last 90 Days),Risk Level,Next Service Date,Recent Services\n';
        const rows = volunteerRows.map(r => {
            const teamNames = r.recentServices.map(s => s.teamName).join(' | ');
            return `"${r.name}","${r.email || ''}",${r.servingCount},"${r.riskLevel}","${r.nextServiceDate || 'NoneScheduled'}","${teamNames}"`;
        }).join('\n');
        const blob = new Blob([header + rows], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `volunteer-engagement-${rangeLabel.replace(/\s/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ----------------------------------------------------
    // Sub-Report 3: Service Plans & Staffing
    // ----------------------------------------------------
    const plansFiltered = useMemo(() => {
        const allPlans = servicesData?.plans || servicesData?.recentPlans || [];
        return allPlans.filter(p => {
            const d = new Date(p.sortDate);
            if (d < start || d > end) return false;
            if (serviceTypeFilter !== 'all' && p.serviceTypeName !== serviceTypeFilter) return false;
            if (searchQuery) {
                const q = searchQuery.toLowerCase();
                const titleMatch = p.title?.toLowerCase().includes(q);
                const typeMatch = p.serviceTypeName?.toLowerCase().includes(q);
                const seriesMatch = p.seriesTitle?.toLowerCase().includes(q);
                if (!titleMatch && !typeMatch && !seriesMatch) return false;
            }
            return true;
        }).sort((a, b) => b.sortDate.localeCompare(a.sortDate));
    }, [servicesData, start, end, serviceTypeFilter, searchQuery]);

    const staffingStats = useMemo(() => {
        let totalPlans = plansFiltered.length;
        let filled = 0;
        let open = 0;
        let understaffedCount = 0;

        plansFiltered.forEach(p => {
            filled += p.positionsFilled || 0;
            open += p.positionsNeeded || 0;
            if (p.isUnderstaffed) understaffedCount++;
        });

        const totalCapacity = filled + open;
        const fillRate = totalCapacity > 0 ? Math.round((filled / totalCapacity) * 100) : 0;

        return { totalPlans, filled, open, understaffedCount, fillRate };
    }, [plansFiltered]);

    const exportStaffingCsv = () => {
        const header = 'Plan Date,Service Type,Plan Title,Series,Positions Filled,Positions Needed,Understaffed?\n';
        const rows = plansFiltered.map(p => {
            const dateStr = new Date(p.sortDate).toLocaleDateString();
            return `"${dateStr}","${p.serviceTypeName || ''}","${p.title || ''}","${p.seriesTitle || ''}",${p.positionsFilled || 0},${p.positionsNeeded || 0},"${p.isUnderstaffed ? 'Yes' : 'No'}"`;
        }).join('\n');
        const blob = new Blob([header + rows], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `service-plans-staffing-${rangeLabel.replace(/\s/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    // ----------------------------------------------------
    // Sub-Report 4: Song Rotation & Worship Analytics
    // ----------------------------------------------------
    const songUsageList = useMemo(() => {
        const allPlans = servicesData?.plans || servicesData?.recentPlans || [];
        const songMap = new Map<string, { title: string; author: string; count: number }>();

        // Recompute based on date filter and service type filter
        allPlans.forEach(p => {
            const d = new Date(p.sortDate);
            if (d < start || d > end) return;
            if (serviceTypeFilter !== 'all' && p.serviceTypeName !== serviceTypeFilter) return;

            p.items?.forEach(item => {
                if (item.type === 'song' || item.type === 'Song' || item.item_type === 'song') {
                    const title = item.title?.trim();
                    if (!title) return;
                    const author = item.author?.trim() || 'Unknown';
                    const key = `${title.toLowerCase()}|${author.toLowerCase()}`;

                    if (!songMap.has(key)) {
                        songMap.set(key, { title, author, count: 0 });
                    }
                    songMap.get(key)!.count++;
                }
            });
        });

        const list = Array.from(songMap.values()).sort((a, b) => b.count - a.count);

        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            return list.filter(s => s.title.toLowerCase().includes(q) || s.author.toLowerCase().includes(q));
        }
        return list;
    }, [servicesData, start, end, serviceTypeFilter, searchQuery]);

    const songStats = useMemo(() => {
        const unique = songUsageList.length;
        const total = songUsageList.reduce((sum, s) => sum + s.count, 0);
        const avg = unique > 0 ? parseFloat((total / unique).toFixed(1)) : 0;
        const singles = songUsageList.filter(s => s.count === 1).length;

        return { unique, total, avg, singles };
    }, [songUsageList]);

    const exportSongsCsv = () => {
        const header = 'Song Title,Author,Play Count\n';
        const rows = songUsageList.map(s => `"${s.title}","${s.author}",${s.count}`).join('\n');
        const blob = new Blob([header + rows], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `worship-song-rotation-${rangeLabel.replace(/\s/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="space-y-6 animate-in fade-in duration-500">
            {/* Header Title & Secondary Sub-tabs Selector */}
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                    <h3 className="text-2xl font-black tracking-tighter text-slate-900 dark:text-white">
                        Services area Reports
                    </h3>
                    <p className="text-slate-400 dark:text-slate-500 text-sm mt-1">
                        Detailed reporting on check-ins, volunteer serving stats, service plan staffing, and worship song rotation.
                    </p>
                </div>
                
                {/* Export Button */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={
                            activeTab === 'attendance' ? exportAttendanceCsv :
                            activeTab === 'volunteers' ? exportVolunteersCsv :
                            activeTab === 'staffing' ? exportStaffingCsv : exportSongsCsv
                        }
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors"
                    >
                        <Download size={14} /> Export CSV
                    </button>
                </div>
            </div>

            {/* Sub Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800">
                {[
                    { id: 'attendance', label: 'Attendance & Headcounts', icon: <TrendingUp size={16} /> },
                    { id: 'volunteers', label: 'Volunteer Engagement', icon: <Users size={16} /> },
                    { id: 'staffing', label: 'Service Staffing', icon: <CheckCircle size={16} /> },
                    { id: 'songs', label: 'Song Rotation', icon: <Music size={16} /> }
                ].map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => {
                            setActiveTab(tab.id as any);
                            setSearchQuery('');
                        }}
                        className={`flex items-center gap-2 px-5 py-3 border-b-2 font-bold text-sm transition-all -mb-px ${
                            activeTab === tab.id 
                                ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' 
                                : 'border-transparent text-slate-400 dark:text-slate-500 hover:text-slate-600'
                        }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Filter Bar */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                    {/* Date presets */}
                    {activeTab !== 'volunteers' && (
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
                    )}

                    {/* Service Type filter */}
                    {(activeTab === 'staffing' || activeTab === 'songs') && (
                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
                                Service Type
                            </label>
                            <div className="relative">
                                <select
                                    value={serviceTypeFilter}
                                    onChange={e => setServiceTypeFilter(e.target.value)}
                                    className="w-full appearance-none bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm font-medium rounded-xl px-4 py-2.5 pr-8 outline-none focus:ring-2 focus:ring-indigo-500 cursor-pointer"
                                >
                                    <option value="all">All Service Types</option>
                                    {serviceTypes.map(t => (
                                        <option key={t} value={t}>{t}</option>
                                    ))}
                                </select>
                                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                            </div>
                        </div>
                    )}

                    {/* Search Field */}
                    {activeTab !== 'attendance' && (
                        <div className={(activeTab === 'volunteers') ? 'col-span-2' : ''}>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 mb-2">
                                Search
                            </label>
                            <div className="relative">
                                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                                <input
                                    type="text"
                                    value={searchQuery}
                                    onChange={e => setSearchQuery(e.target.value)}
                                    placeholder={
                                        activeTab === 'volunteers' ? 'Search by volunteer or team...' :
                                        activeTab === 'staffing' ? 'Search plan name, title, series...' :
                                        'Search song title or author...'
                                    }
                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white text-sm rounded-xl pl-9 pr-4 py-2.5 outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Custom date range picker option */}
                {datePreset === 'custom' && activeTab !== 'volunteers' && (
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

            {/* TAB CONTENT: 1. Attendance & Headcounts */}
            {activeTab === 'attendance' && (
                <div className="space-y-6">
                    {/* Summary cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Total Check-ins', value: attendanceStats.total, color: 'text-indigo-600 dark:text-indigo-400', icon: <TrendingUp size={18} /> },
                            { label: 'Average Per Week', value: attendanceStats.avg, color: 'text-emerald-600 dark:text-emerald-400', icon: <Calendar size={18} /> },
                            { label: 'Guests Tracked', value: attendanceStats.guests, color: 'text-amber-600 dark:text-amber-400', icon: <Users size={18} /> },
                            { label: 'Regulars Tracked', value: attendanceStats.regulars, color: 'text-rose-600 dark:text-rose-400', icon: <Heart size={18} /> },
                        ].map(s => (
                            <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-4 shadow-sm">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
                                    {s.icon}
                                </div>
                                <div>
                                    <p className={`text-2xl font-black tracking-tight ${s.color}`}>{s.value.toLocaleString()}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{s.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Chart */}
                    {attendanceDataFiltered.length > 0 ? (
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                            <h4 className="text-sm font-black text-slate-900 dark:text-white mb-4">Check-ins Trend over Time</h4>
                            <div className="h-72">
                                <ResponsiveContainer width="100%" height="100%">
                                    <AreaChart data={attendanceDataFiltered}>
                                        <defs>
                                            <linearGradient id="colorCheckins" x1="0" y1="0" x2="0" y2="1">
                                                <stop offset="5%" stopColor="#4f46e5" stopOpacity={0.2}/>
                                                <stop offset="95%" stopColor="#4f46e5" stopOpacity={0}/>
                                            </linearGradient>
                                        </defs>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                                        <XAxis dataKey="date" tickFormatter={d => new Date(d).toLocaleDateString(undefined, {month: 'short', day: 'numeric'})} tick={{fontSize: 10}} stroke="#94a3b8" />
                                        <YAxis tick={{fontSize: 10}} stroke="#94a3b8" />
                                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                                        <Area type="monotone" dataKey="total" name="Total Check-ins" stroke="#4f46e5" strokeWidth={2} fillOpacity={1} fill="url(#colorCheckins)" />
                                    </AreaChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    ) : null}

                    {/* Table */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h4 className="text-sm font-black text-slate-900 dark:text-white">Attendance Details</h4>
                            <p className="text-xs text-slate-400 mt-0.5">{rangeLabel} · {attendanceDataFiltered.length} records</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-700">
                                    <tr>
                                        {['Date', 'Regulars', 'Guests', 'Volunteers', 'Digital check-ins', 'Manual Headcounts', 'Total'].map(col => (
                                            <th key={col} className="px-6 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 whitespace-nowrap">
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                    {attendanceDataFiltered.length > 0 ? (
                                        attendanceDataFiltered.map((row, i) => (
                                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="px-6 py-3 text-xs font-bold text-slate-900 dark:text-white">
                                                    {new Date(row.date).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                                                </td>
                                                <td className="px-6 py-3 text-xs text-slate-600 dark:text-slate-300 font-medium">
                                                    {row.regulars || 0}
                                                </td>
                                                <td className="px-6 py-3 text-xs text-slate-600 dark:text-slate-300 font-medium">
                                                    {row.guests || 0}
                                                </td>
                                                <td className="px-6 py-3 text-xs text-slate-600 dark:text-slate-300 font-medium">
                                                    {row.volunteers || 0}
                                                </td>
                                                <td className="px-6 py-3 text-xs text-indigo-600 dark:text-indigo-400 font-bold">
                                                    {row.digitalCheckins || 0}
                                                </td>
                                                <td className="px-6 py-3 text-xs text-slate-600 dark:text-slate-300 font-medium">
                                                    {row.headcount || 0}
                                                </td>
                                                <td className="px-6 py-3 text-xs font-black text-slate-900 dark:text-white">
                                                    {row.total}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-16 text-center text-slate-400 dark:text-slate-500">
                                                No attendance data found in selected period.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: 2. Volunteer Engagement & Burnout */}
            {activeTab === 'volunteers' && (
                <div className="space-y-6">
                    {/* Summary cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Active Volunteers', value: volunteerStats.totalActive, color: 'text-indigo-600 dark:text-indigo-400', icon: <Users size={18} /> },
                            { label: 'Avg serving count (90d)', value: volunteerStats.avgServed, color: 'text-emerald-600 dark:text-emerald-400', icon: <Calendar size={18} /> },
                            { label: 'At Burnout Risk', value: volunteerStats.highRisk, color: 'text-rose-600 dark:text-rose-400', icon: <AlertTriangle size={18} /> },
                            { label: 'Medium Risk', value: volunteerStats.medRisk, color: 'text-amber-600 dark:text-amber-400', icon: <Clock size={18} /> },
                        ].map(s => (
                            <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-4 shadow-sm">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
                                    {s.icon}
                                </div>
                                <div>
                                    <p className={`text-2xl font-black tracking-tight ${s.color}`}>{s.value}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{s.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Chart layout grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Serving Frequency Distribution */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                            <h4 className="text-sm font-black text-slate-900 dark:text-white mb-4">Serving Frequency (Last 90 Days)</h4>
                            <div className="h-64">
                                <ResponsiveContainer width="100%" height="100%">
                                    <BarChart data={[
                                        { range: '1 time', count: volunteerStats.count1x },
                                        { range: '2-3 times', count: volunteerStats.count2to3x },
                                        { range: '4-6 times', count: volunteerStats.count4to6x },
                                        { range: '7+ times', count: volunteerStats.count7plus }
                                    ]}>
                                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                                        <XAxis dataKey="range" tick={{fontSize: 10}} stroke="#94a3b8" />
                                        <YAxis tick={{fontSize: 10}} stroke="#94a3b8" />
                                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                                        <Bar dataKey="count" fill="#4f46e5" radius={[4, 4, 0, 0]}>
                                            <Cell fill="#6366f1" />
                                            <Cell fill="#4f46e5" />
                                            <Cell fill="#3730a3" />
                                            <Cell fill="#1e1b4b" />
                                        </Bar>
                                    </BarChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Risk level distribution */}
                        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                            <h4 className="text-sm font-black text-slate-900 dark:text-white mb-4">Burnout Risk Distribution</h4>
                            <div className="h-64 flex items-center justify-center">
                                <ResponsiveContainer width="100%" height="100%">
                                    <PieChart>
                                        <Pie
                                            data={[
                                                { name: 'Low Risk', value: volunteerStats.lowRisk, color: '#10b981' },
                                                { name: 'Medium Risk', value: volunteerStats.medRisk, color: '#f59e0b' },
                                                { name: 'High Risk', value: volunteerStats.highRisk, color: '#ef4444' }
                                            ].filter(v => v.value > 0)}
                                            cx="50%"
                                            cy="50%"
                                            innerRadius={60}
                                            outerRadius={80}
                                            paddingAngle={5}
                                            dataKey="value"
                                        >
                                            {[
                                                { name: 'Low Risk', value: volunteerStats.lowRisk, color: '#10b981' },
                                                { name: 'Medium Risk', value: volunteerStats.medRisk, color: '#f59e0b' },
                                                { name: 'High Risk', value: volunteerStats.highRisk, color: '#ef4444' }
                                            ].filter(v => v.value > 0).map((entry, index) => (
                                                <Cell key={`cell-${index}`} fill={entry.color} />
                                            ))}
                                        </Pie>
                                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                                        <Legend />
                                    </PieChart>
                                </ResponsiveContainer>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h4 className="text-sm font-black text-slate-900 dark:text-white">Volunteer Serving Stats</h4>
                            <p className="text-xs text-slate-400 mt-0.5">{volunteerRows.length} active roster volunteers</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-700">
                                    <tr>
                                        {['Volunteer', 'Serving Count (90d)', 'Burnout Risk', 'Next scheduled', 'Recent Teams'].map(col => (
                                            <th key={col} className="px-6 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 whitespace-nowrap">
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                    {volunteerRows.length > 0 ? (
                                        volunteerRows.map((row, i) => (
                                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="px-6 py-3">
                                                    <p className="text-xs font-bold text-slate-900 dark:text-white">{row.name}</p>
                                                    {row.email && <p className="text-[10px] text-slate-400">{row.email}</p>}
                                                </td>
                                                <td className="px-6 py-3 text-xs font-black text-slate-900 dark:text-white">
                                                    {row.servingCount} times
                                                </td>
                                                <td className="px-6 py-3">
                                                    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                                        row.riskLevel === 'High' ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' :
                                                        row.riskLevel === 'Medium' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                                                        'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'
                                                    }`}>
                                                        {row.riskLevel} Risk
                                                    </span>
                                                </td>
                                                <td className="px-6 py-3 text-xs text-slate-500 dark:text-slate-400 font-medium">
                                                    {row.nextServiceDate 
                                                        ? new Date(row.nextServiceDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'}) 
                                                        : <span className="text-slate-300 dark:text-slate-600">—</span>}
                                                </td>
                                                <td className="px-6 py-3 text-xs text-slate-600 dark:text-slate-300 truncate max-w-[240px]">
                                                    {row.recentServices.map(s => s.teamName).filter(Boolean).filter((v, idx, arr) => arr.indexOf(v) === idx).join(', ') || 'No team'}
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={5} className="px-6 py-16 text-center text-slate-400 dark:text-slate-500">
                                                No volunteers found. Make sure PCO is connected and volunteer serving history is synced.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: 3. Service Staffing */}
            {activeTab === 'staffing' && (
                <div className="space-y-6">
                    {/* Summary cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Plans Scoped', value: staffingStats.totalPlans, color: 'text-indigo-600 dark:text-indigo-400', icon: <List size={18} /> },
                            { label: 'Average Fill Rate', value: `${staffingStats.fillRate}%`, color: 'text-emerald-600 dark:text-emerald-400', icon: <TrendingUp size={18} /> },
                            { label: 'Confirmed Positions', value: staffingStats.filled, color: 'text-indigo-600 dark:text-indigo-400', icon: <CheckCircle size={18} /> },
                            { label: 'Understaffed Plans', value: staffingStats.understaffedCount, color: 'text-rose-600 dark:text-rose-400', icon: <AlertTriangle size={18} /> },
                        ].map(s => (
                            <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-4 shadow-sm">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
                                    {s.icon}
                                </div>
                                <div>
                                    <p className={`text-2xl font-black tracking-tight ${s.color}`}>{s.value}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{s.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Table */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h4 className="text-sm font-black text-slate-900 dark:text-white">Service Plans details</h4>
                            <p className="text-xs text-slate-400 mt-0.5">{plansFiltered.length} service plans in selected period</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-700">
                                    <tr>
                                        {['Date', 'Service Type', 'Plan Title / Series', 'Positions Filled', 'Positions Open', 'Fill Rate'].map(col => (
                                            <th key={col} className="px-6 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 whitespace-nowrap">
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                    {plansFiltered.length > 0 ? (
                                        plansFiltered.map((row, i) => {
                                            const filled = row.positionsFilled || 0;
                                            const open = row.positionsNeeded || 0;
                                            const total = filled + open;
                                            const fillRate = total > 0 ? Math.round((filled / total) * 100) : 0;
                                            return (
                                                <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                    <td className="px-6 py-3 text-xs font-bold text-slate-900 dark:text-white">
                                                        {new Date(row.sortDate).toLocaleDateString(undefined, {month: 'short', day: 'numeric', year: 'numeric'})}
                                                    </td>
                                                    <td className="px-6 py-3 text-xs text-slate-600 dark:text-slate-300 font-medium">
                                                        {row.serviceTypeName || 'Worship Service'}
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <p className="text-xs font-bold text-slate-900 dark:text-white">{row.title || 'Sunday Worship'}</p>
                                                        {row.seriesTitle && <p className="text-[10px] text-slate-400">Series: {row.seriesTitle}</p>}
                                                    </td>
                                                    <td className="px-6 py-3 text-xs text-emerald-600 dark:text-emerald-400 font-black">
                                                        {filled} filled
                                                    </td>
                                                    <td className="px-6 py-3 text-xs font-black">
                                                        {open > 0 ? (
                                                            <span className="text-rose-500 dark:text-rose-400">{open} open</span>
                                                        ) : (
                                                            <span className="text-slate-400 dark:text-slate-600">—</span>
                                                        )}
                                                    </td>
                                                    <td className="px-6 py-3">
                                                        <div className="flex items-center gap-2">
                                                            <div className="flex-1 h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden min-w-[50px]">
                                                                <div
                                                                    className={`h-full rounded-full ${fillRate >= 90 ? 'bg-emerald-500' : fillRate >= 70 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                                                    style={{ width: `${fillRate}%` }}
                                                                />
                                                            </div>
                                                            <span className={`text-[10px] font-black ${
                                                                fillRate >= 90 ? 'text-emerald-600 dark:text-emerald-400' :
                                                                fillRate >= 70 ? 'text-amber-600 dark:text-amber-400' :
                                                                'text-rose-600 dark:text-rose-400'
                                                            }`}>
                                                                {fillRate}%
                                                            </span>
                                                        </div>
                                                    </td>
                                                </tr>
                                            );
                                        })
                                    ) : (
                                        <tr>
                                            <td colSpan={6} className="px-6 py-16 text-center text-slate-400 dark:text-slate-500">
                                                No service plans scheduled in the selected period.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: 4. Song Rotation */}
            {activeTab === 'songs' && (
                <div className="space-y-6">
                    {/* Summary cards */}
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Unique Songs Played', value: songStats.unique, color: 'text-indigo-600 dark:text-indigo-400', icon: <Music size={18} /> },
                            { label: 'Total Song Plays', value: songStats.total, color: 'text-indigo-600 dark:text-indigo-400', icon: <TrendingUp size={18} /> },
                            { label: 'Average repeats', value: songStats.avg, color: 'text-emerald-600 dark:text-emerald-400', icon: <Calendar size={18} /> },
                            { label: 'Played Only Once', value: songStats.singles, color: 'text-rose-600 dark:text-rose-400', icon: <HelpCircle size={18} /> },
                        ].map(s => (
                            <div key={s.label} className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 flex items-center gap-4 shadow-sm">
                                <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center shrink-0">
                                    {s.icon}
                                </div>
                                <div>
                                    <p className={`text-2xl font-black tracking-tight ${s.color}`}>{s.value}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">{s.label}</p>
                                </div>
                            </div>
                        ))}
                    </div>

                    {/* Chart layout grid */}
                    <div className="grid grid-cols-1 gap-6">
                        {/* Top 10 Songs Played chart */}
                        {songUsageList.length > 0 ? (
                            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 shadow-sm">
                                <h4 className="text-sm font-black text-slate-900 dark:text-white mb-4">Most Played Songs in Selected Period</h4>
                                <div className="h-72">
                                    <ResponsiveContainer width="100%" height="100%">
                                        <BarChart 
                                            data={songUsageList.slice(0, 10)} 
                                            layout="vertical"
                                            margin={{ top: 5, right: 30, left: 40, bottom: 5 }}
                                        >
                                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#f1f5f9" className="dark:stroke-slate-800" />
                                            <XAxis type="number" tick={{fontSize: 10}} stroke="#94a3b8" />
                                            <YAxis type="category" dataKey="title" width={120} tick={{fontSize: 9}} stroke="#94a3b8" />
                                            <Tooltip contentStyle={TOOLTIP_STYLE} />
                                            <Bar dataKey="count" fill="#4f46e5" radius={[0, 4, 4, 0]} name="Plays" />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>
                            </div>
                        ) : null}
                    </div>

                    {/* Table */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl shadow-sm overflow-hidden">
                        <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h4 className="text-sm font-black text-slate-900 dark:text-white">Worship Song Rotation Index</h4>
                            <p className="text-xs text-slate-400 mt-0.5">{songUsageList.length} unique songs identified</p>
                        </div>
                        <div className="overflow-x-auto">
                            <table className="w-full text-left">
                                <thead className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-100 dark:border-slate-700">
                                    <tr>
                                        {['Rank', 'Song Title', 'Author', 'Play Count'].map(col => (
                                            <th key={col} className="px-6 py-3 text-[11px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 whitespace-nowrap">
                                                {col}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                    {songUsageList.length > 0 ? (
                                        songUsageList.map((row, i) => (
                                            <tr key={i} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                                <td className="px-6 py-3 text-xs font-black text-slate-400 dark:text-slate-600">
                                                    #{i + 1}
                                                </td>
                                                <td className="px-6 py-3 text-xs font-bold text-slate-900 dark:text-white">
                                                    {row.title}
                                                </td>
                                                <td className="px-6 py-3 text-xs text-slate-600 dark:text-slate-300 font-medium">
                                                    {row.author}
                                                </td>
                                                <td className="px-6 py-3 text-xs font-black text-indigo-600 dark:text-indigo-400">
                                                    {row.count} plays
                                                </td>
                                            </tr>
                                        ))
                                    ) : (
                                        <tr>
                                            <td colSpan={4} className="px-6 py-16 text-center text-slate-400 dark:text-slate-500">
                                                No songs found in plan items. Make sure your service plans are fully synced from PCO.
                                            </td>
                                        </tr>
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};
