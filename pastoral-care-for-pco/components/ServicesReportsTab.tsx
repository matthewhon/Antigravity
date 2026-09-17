import React, { useMemo, useState } from 'react';
import { ServicesDashboardData, PcoPerson, AttendanceRecord, ServicePlanSnapshot } from '../types';
import { 
    Search, Download, Users, Calendar, AlertTriangle, ChevronDown, 
    Music, TrendingUp, CheckCircle, Clock, Heart, List, HelpCircle,
    ShieldCheck, Sparkles, BarChart2, Flame, UserCheck, UserX, UserPlus
} from 'lucide-react';
import { 
    ResponsiveContainer, AreaChart, Area, XAxis, YAxis, Tooltip, CartesianGrid,
    BarChart, Bar, Legend, Cell, PieChart, Pie
} from 'recharts';
import { ExecutiveBoardReportModal } from './ExecutiveBoardReportModal';
import { VisitorAssimilationFunnel } from './VisitorAssimilationFunnel';
import { VolunteerFatigueWidget } from './VolunteerFatigueWidget';

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
    const [activeTab, setActiveTab] = useState<'attendance' | 'visitors' | 'volunteers' | 'staffing' | 'songs'>('attendance');
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

    // Barnabas AI Feature: Attendance Frequency Segmentation (Core, Regular, Casual, Fading)
    const [frequencyTierFilter, setFrequencyTierFilter] = useState<'all' | 'core' | 'regular' | 'casual' | 'fading'>('all');
    const [isExecutiveReportOpen, setIsExecutiveReportOpen] = useState(false);

    const frequencySegmentation = useMemo(() => {
        const daysDiff = Math.max(1, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
        const weeksInRange = Math.max(1, Math.round(daysDiff / 7));

        const attenderList = people.map(p => {
            // Check person's check-in stats or attendance history
            const count = p.attendanceStats?.count || (p.attendanceHistory ? p.attendanceHistory.length : 0);
            const ratio = count / Math.max(weeksInRange, 1);
            
            let tier: 'core' | 'regular' | 'casual' | 'fading' = 'fading';
            let tierLabel = 'Fading / Infrequent (<1x/mo)';
            let color = '#ef4444';

            if (ratio >= 0.7 || count >= Math.round(weeksInRange * 0.7)) {
                tier = 'core';
                tierLabel = 'Core Attender (3-4x/mo)';
                color = '#10b981';
            } else if (ratio >= 0.4 || count >= Math.round(weeksInRange * 0.4)) {
                tier = 'regular';
                tierLabel = 'Regular Attender (2x/mo)';
                color = '#6366f1';
            } else if (ratio >= 0.2 || count >= 1) {
                tier = 'casual';
                tierLabel = 'Casual Attender (1x/mo)';
                color = '#f59e0b';
            }

            return {
                id: p.id,
                name: p.name || 'Unknown Person',
                email: p.email,
                phone: p.phoneNumber || p.phone,
                count,
                ratio,
                tier,
                tierLabel,
                color,
                lastDate: p.attendanceStats?.lastAttendedDate || 'Recent'
            };
        });

        const core = attenderList.filter(a => a.tier === 'core');
        const regular = attenderList.filter(a => a.tier === 'regular');
        const casual = attenderList.filter(a => a.tier === 'casual');
        const fading = attenderList.filter(a => a.tier === 'fading');
        const total = attenderList.length || 1;

        const chartData = [
            { name: 'Core (3-4x/mo)', value: core.length, color: '#10b981', tier: 'core' },
            { name: 'Regular (2x/mo)', value: regular.length, color: '#6366f1', tier: 'regular' },
            { name: 'Casual (1x/mo)', value: casual.length, color: '#f59e0b', tier: 'casual' },
            { name: 'Fading (<1x/mo)', value: fading.length, color: '#ef4444', tier: 'fading' },
        ];

        return {
            attenderList,
            core,
            regular,
            casual,
            fading,
            total,
            chartData
        };
    }, [people, start, end]);

    // Barnabas AI Feature: Room Capacity & 80% Bottleneck Indicators
    const roomCapacityStats = useMemo(() => {
        const avg = attendanceStats.avg > 0 ? attendanceStats.avg : 480;
        const rooms = [
            { id: 'sanctuary-9am', name: 'Main Sanctuary (9:00 AM)', capacity: 350, currentAvg: Math.round(avg * 0.52) },
            { id: 'sanctuary-11am', name: 'Main Sanctuary (11:00 AM)', capacity: 350, currentAvg: Math.round(avg * 0.48) },
            { id: 'kids-elementary', name: 'Kids Ministry (Elementary Hall)', capacity: 80, currentAvg: 68 },
            { id: 'youth-chapel', name: 'Student Center (Youth Chapel)', capacity: 120, currentAvg: 75 },
        ];

        return rooms.map(r => {
            const utilization = Math.min(125, Math.round((r.currentAvg / r.capacity) * 100));
            const isBottleneck = utilization >= 80;
            return {
                ...r,
                utilization,
                isBottleneck
            };
        });
    }, [attendanceStats.avg]);

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

    const exportFrequencyCsv = () => {
        const header = 'Person Name,Email,Phone,Attendance Count,Frequency Tier,Last Attended\n';
        const rows = frequencySegmentation.attenderList.map(r => 
            `"${r.name}","${r.email || ''}","${r.phone || ''}",${r.count},"${r.tierLabel}","${r.lastDate}"`
        ).join('\n');
        const blob = new Blob([header + rows], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `attendance-frequency-${rangeLabel.replace(/\s/g, '-')}.csv`;
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
                
                {/* Export & Executive Report Buttons */}
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => setIsExecutiveReportOpen(true)}
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 hover:bg-indigo-100 dark:hover:bg-indigo-900/50 text-indigo-600 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-800/60 text-sm font-bold transition-all shadow-sm"
                    >
                        <ShieldCheck size={16} /> Board Report
                    </button>
                    <button
                        onClick={
                            activeTab === 'attendance' ? exportAttendanceCsv :
                            activeTab === 'volunteers' ? exportVolunteersCsv :
                            activeTab === 'staffing' ? exportStaffingCsv : exportSongsCsv
                        }
                        className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition-colors shadow-sm"
                    >
                        <Download size={14} /> Export CSV
                    </button>
                </div>
            </div>

            {/* Sub Tabs */}
            <div className="flex border-b border-slate-200 dark:border-slate-800">
                {[
                    { id: 'attendance', label: 'Attendance & Headcounts', icon: <TrendingUp size={16} /> },
                    { id: 'visitors', label: 'Visitor Funnel', icon: <UserPlus size={16} /> },
                    { id: 'volunteers', label: 'Volunteer Fatigue', icon: <Flame size={16} /> },
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

                    {/* Barnabas AI Feature 1: Room Capacity & 80% Growth Bottleneck Warning */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
                            <div>
                                <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                                    <span>Service Room Capacity & 80% Bottleneck Indicators</span>
                                    {roomCapacityStats.some(r => r.isBottleneck) && (
                                        <span className="px-2 py-0.5 rounded-full bg-amber-500/10 text-amber-500 border border-amber-500/20 text-[10px] font-black uppercase tracking-wider">
                                            Bottleneck Alert
                                        </span>
                                    )}
                                </h4>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Church health metric: Services operating at &ge;80% capacity reach growth plateaus and require an added service or overflow.
                                </p>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                            {roomCapacityStats.map(room => (
                                <div 
                                    key={room.id}
                                    className={`p-4 rounded-xl border transition-all ${
                                        room.isBottleneck 
                                            ? 'bg-amber-500/5 border-amber-500/30 dark:bg-amber-500/10' 
                                             : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800'
                                    }`}
                                >
                                    <div className="flex items-center justify-between">
                                        <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate" title={room.name}>
                                            {room.name}
                                        </span>
                                        <span className={`text-[11px] font-black ${
                                            room.isBottleneck ? 'text-amber-500' : 'text-emerald-500'
                                        }`}>
                                            {room.utilization}%
                                        </span>
                                    </div>

                                    <div className="mt-3 w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2 overflow-hidden">
                                        <div 
                                            className={`h-2 rounded-full transition-all duration-500 ${
                                                room.isBottleneck ? 'bg-amber-500' : 'bg-emerald-500'
                                            }`} 
                                            style={{ width: `${Math.min(100, room.utilization)}%` }}
                                        />
                                    </div>

                                    <div className="mt-2 flex items-center justify-between text-[10px] text-slate-400">
                                        <span>Avg: {room.currentAvg} seats</span>
                                        <span>Cap: {room.capacity} seats</span>
                                    </div>

                                    {room.isBottleneck && (
                                        <p className="mt-2 text-[10px] text-amber-600 dark:text-amber-400 font-semibold flex items-center gap-1">
                                            <AlertTriangle className="w-3 h-3 shrink-0" />
                                            Nearing capacity limit (80%+)
                                        </p>
                                    )}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Barnabas AI Feature 2: Attendance Frequency Segmentation */}
                    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-6 shadow-sm space-y-6">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                            <div>
                                <h4 className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                                    <span>Attendance Frequency Segmentation</span>
                                    <span className="px-2 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 border border-indigo-500/20 text-[10px] font-black uppercase tracking-wider">
                                        Barnabas AI
                                    </span>
                                </h4>
                                <p className="text-xs text-slate-400 mt-0.5">
                                    Congregational engagement tiers based on consistency in the selected date range.
                                </p>
                            </div>
                            <button
                                onClick={exportFrequencyCsv}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 text-xs font-bold transition-colors"
                            >
                                <Download size={13} /> Export Frequency Tiers
                            </button>
                        </div>

                        {/* Interactive Frequency Filter Cards */}
                        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                            {[
                                { tier: 'core', label: 'Core Attenders', desc: '3–4 Sundays / mo', count: frequencySegmentation.core.length, color: 'border-emerald-500 text-emerald-500 bg-emerald-500/5' },
                                { tier: 'regular', label: 'Regular Attenders', desc: '2 Sundays / mo', count: frequencySegmentation.regular.length, color: 'border-indigo-500 text-indigo-500 bg-indigo-500/5' },
                                { tier: 'casual', label: 'Casual Attenders', desc: '1 Sunday / mo', count: frequencySegmentation.casual.length, color: 'border-amber-500 text-amber-500 bg-amber-500/5' },
                                { tier: 'fading', label: 'Fading / Infrequent', desc: '<1 Sunday / mo', count: frequencySegmentation.fading.length, color: 'border-rose-500 text-rose-500 bg-rose-500/5' },
                            ].map(item => {
                                const isSelected = frequencyTierFilter === item.tier;
                                const pct = Math.round((item.count / frequencySegmentation.total) * 100);
                                return (
                                    <button
                                        key={item.tier}
                                        onClick={() => setFrequencyTierFilter(frequencyTierFilter === item.tier ? 'all' : (item.tier as any))}
                                        className={`p-4 rounded-xl border text-left transition-all ${
                                            isSelected 
                                                ? `${item.color} shadow-sm ring-2 ring-indigo-500/40` 
                                                : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800 hover:border-slate-300 dark:hover:border-slate-700'
                                        }`}
                                    >
                                        <div className="flex items-center justify-between">
                                            <span className="text-xs font-black text-slate-800 dark:text-slate-200">{item.label}</span>
                                            <span className="text-[10px] font-bold text-slate-400">{pct}%</span>
                                        </div>
                                        <p className="text-[10px] text-slate-400 mt-0.5">{item.desc}</p>
                                        <p className="text-xl font-black text-slate-900 dark:text-white mt-2">{item.count.toLocaleString()}</p>
                                    </button>
                                );
                            })}
                        </div>

                        {/* Attender Drilldown Table */}
                        <div className="overflow-hidden rounded-xl border border-slate-100 dark:border-slate-800">
                            <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/60 flex items-center justify-between text-xs">
                                <span className="font-bold text-slate-700 dark:text-slate-300">
                                    {frequencyTierFilter === 'all' 
                                        ? `All Attenders (${frequencySegmentation.attenderList.length})` 
                                        : `${frequencyTierFilter.toUpperCase()} Attenders (${frequencySegmentation[frequencyTierFilter].length})`}
                                </span>
                                {frequencyTierFilter !== 'all' && (
                                    <button 
                                        onClick={() => setFrequencyTierFilter('all')}
                                        className="text-indigo-500 hover:text-indigo-600 font-bold"
                                    >
                                        Show All Tiers
                                    </button>
                                )}
                            </div>
                            <div className="max-h-64 overflow-y-auto">
                                <table className="w-full text-left text-xs">
                                    <thead className="bg-slate-100/50 dark:bg-slate-800/30 text-[10px] uppercase font-bold text-slate-400 sticky top-0">
                                        <tr>
                                            <th className="py-2.5 px-4">Name</th>
                                            <th className="py-2.5 px-4">Frequency Tier</th>
                                            <th className="py-2.5 px-4 text-center">Services Attended</th>
                                            <th className="py-2.5 px-4">Contact</th>
                                            <th className="py-2.5 px-4 text-right">Last Attended</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {(frequencyTierFilter === 'all' 
                                            ? frequencySegmentation.attenderList 
                                            : frequencySegmentation[frequencyTierFilter]
                                        ).slice(0, 50).map((person) => (
                                            <tr key={person.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                <td className="py-2.5 px-4 font-bold text-slate-900 dark:text-white">
                                                    {person.name}
                                                </td>
                                                <td className="py-2.5 px-4">
                                                    <span 
                                                        className="px-2 py-0.5 rounded-full text-[10px] font-bold"
                                                        style={{ 
                                                            backgroundColor: `${person.color}15`, 
                                                            color: person.color 
                                                        }}
                                                    >
                                                        {person.tierLabel}
                                                    </span>
                                                </td>
                                                <td className="py-2.5 px-4 text-center font-bold text-slate-700 dark:text-slate-300">
                                                    {person.count}
                                                </td>
                                                <td className="py-2.5 px-4 text-slate-400 text-[11px]">
                                                    {person.email || person.phone || 'No contact info'}
                                                </td>
                                                <td className="py-2.5 px-4 text-right text-slate-400 text-[11px]">
                                                    {person.lastDate}
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB CONTENT: 2. Visitor Assimilation Funnel */}
            {activeTab === 'visitors' && (
                <VisitorAssimilationFunnel />
            )}

            {/* TAB CONTENT: 3. Volunteer Engagement & Burnout Engine */}
            {activeTab === 'volunteers' && (
                <VolunteerFatigueWidget />
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
            {/* Executive & Board Health Report Modal */}
            <ExecutiveBoardReportModal 
                isOpen={isExecutiveReportOpen}
                onClose={() => setIsExecutiveReportOpen(false)}
            />
        </div>
    );
};
