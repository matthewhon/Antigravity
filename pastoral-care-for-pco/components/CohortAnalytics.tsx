import React, { useState, useMemo } from 'react';
import { PcoPerson, DetailedDonation, PcoGroup, ServicesDashboardData, PcoCheckInRecord } from '../types';
import { calculateCohorts, CohortFilterConfig } from '../services/cohortService';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';

interface CohortAnalyticsProps {
    people: PcoPerson[];
    donations: DetailedDonation[];
    groups: PcoGroup[];
    services: ServicesDashboardData | null;
    checkIns: PcoCheckInRecord[];
}

// ─── Colour helpers ──────────────────────────────────────────────────────────
const LINE_COLORS = [
    '#6366f1', '#10b981', '#ec4899', '#f59e0b',
    '#3b82f6', '#8b5cf6', '#ef4444', '#14b8a6'
];

function heatmapBg(pct: number): string {
    const alpha = Math.min(1, pct / 100);
    return `rgba(99, 102, 241, ${(alpha * 0.85).toFixed(2)})`;
}

function heatmapText(pct: number): string {
    return pct > 45 ? '#ffffff' : '';
}

// ─── Metric Card ─────────────────────────────────────────────────────────────
const MetricCard: React.FC<{
    label: string;
    value: string;
    valueColor?: string;
    sub?: string;
    tooltip?: string;
}> = ({ label, value, valueColor = 'text-slate-900 dark:text-white', sub, tooltip }) => (
    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 p-5 flex flex-col gap-3 shadow-sm relative group" title={tooltip}>
        <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400">{label}</span>
            {tooltip && (
                <span className="text-[11px] text-slate-400 cursor-help hover:text-slate-600">ⓘ</span>
            )}
        </div>
        <span className={`text-4xl font-black leading-none ${valueColor}`}>{value}</span>
        {sub && <span className="text-[10px] text-slate-400 font-semibold">{sub}</span>}
    </div>
);

// ─── Signal Toggle (checkbox pill) ───────────────────────────────────────────
const SignalToggle: React.FC<{
    label: string;
    icon?: string;
    checked: boolean;
    onChange: (v: boolean) => void;
}> = ({ label, icon, checked, onChange }) => (
    <label className={`flex items-center gap-2 px-3.5 py-1.5 rounded-xl border cursor-pointer transition-all select-none text-xs font-bold ${
        checked
            ? 'bg-indigo-50 border-indigo-200 text-indigo-700 dark:bg-indigo-950/30 dark:border-indigo-800/50 dark:text-indigo-300'
            : 'bg-white border-slate-200 text-slate-400 hover:border-slate-300 dark:bg-slate-900 dark:border-slate-800'
    }`}>
        <input
            type="checkbox"
            checked={checked}
            onChange={e => onChange(e.target.checked)}
            className="sr-only"
        />
        <span className={`w-3.5 h-3.5 rounded-sm border-2 flex items-center justify-center transition-colors ${
            checked ? 'bg-indigo-500 border-indigo-500' : 'border-slate-300 dark:border-slate-700'
        }`}>
            {checked && (
                <svg className="w-2.5 h-2.5 text-white" viewBox="0 0 10 10" fill="none">
                    <path d="M2 5l2.5 2.5L8 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
            )}
        </span>
        {icon && <span className="text-xs">{icon}</span>}
        {label}
    </label>
);

const MONTH_LABELS: { [key: number]: { label: string; desc: string } } = {
    0: { label: 'M0', desc: 'Month 0: Starting / Joining Month (Baseline)' },
    1: { label: 'M1', desc: 'Month 1: 30 days after starting' },
    2: { label: 'M2', desc: 'Month 2: 60 days after starting' },
    3: { label: 'M3', desc: 'Month 3: 90 days after starting (Key retention milestone)' },
    4: { label: 'M4', desc: 'Month 4: 120 days after starting' },
    5: { label: 'M5', desc: 'Month 5: 150 days after starting' },
    6: { label: 'M6', desc: 'Month 6: 180 days after starting (Half-year retention)' },
    7: { label: 'M7', desc: 'Month 7: 210 days after starting' },
    8: { label: 'M8', desc: 'Month 8: 240 days after starting' },
    9: { label: 'M9', desc: 'Month 9: 270 days after starting' },
    10: { label: 'M10', desc: 'Month 10: 300 days after starting' },
    11: { label: 'M11', desc: 'Month 11: 330 days after starting' },
    12: { label: 'M12', desc: 'Month 12: 1 full year retention' },
};

// ─── Main Component ───────────────────────────────────────────────────────────
export const CohortAnalytics: React.FC<CohortAnalyticsProps> = ({
    people,
    donations,
    groups = [],
    services,
    checkIns = []
}) => {
    const [config, setConfig] = useState<CohortFilterConfig>({
        includeCheckIns: true,
        includeGiving: true,
        includeGroups: true,
        includeServing: true,
        selectedGroupId: null,
        membershipStatus: 'all',
        cohortBasis: 'created_at'
    });

    const [showGuide, setShowGuide] = useState<boolean>(true);
    const [selectedCohortName, setSelectedCohortName] = useState<string | null>(null);
    const [visibleLineCohorts, setVisibleLineCohorts] = useState<Record<string, boolean>>({});

    const cohorts = useMemo(
        () => calculateCohorts(people, donations, groups, services, checkIns, config),
        [people, donations, groups, services, checkIns, config]
    );

    const toggleLineCohort = (name: string) =>
        setVisibleLineCohorts(prev => ({ ...prev, [name]: !(prev[name] ?? true) }));

    const handleResetFilters = () => {
        setConfig({
            includeCheckIns: true,
            includeGiving: true,
            includeGroups: true,
            includeServing: true,
            selectedGroupId: null,
            membershipStatus: 'all',
            cohortBasis: 'created_at'
        });
        setSelectedCohortName(null);
    };

    // Sort available groups by name for dropdown
    const sortedGroups = useMemo(() => {
        return [...groups].sort((a, b) => a.name.localeCompare(b.name));
    }, [groups]);

    // Active audience description
    const activeGroupName = useMemo(() => {
        if (!config.selectedGroupId) return null;
        const g = groups.find(item => item.id === config.selectedGroupId);
        return g ? g.name : null;
    }, [config.selectedGroupId, groups]);

    const totalAudienceSize = useMemo(() => {
        return cohorts.reduce((acc, c) => acc + c.cohortSize, 0);
    }, [cohorts]);

    // ── Aggregate metrics ──────────────────────────────────────────────────
    const metrics = useMemo(() => {
        if (cohorts.length === 0) return { avgSize: 0, m1: 0, m3: 0, m6: 0 };
        let totalSize = 0, sumM1 = 0, sumM3 = 0, sumM6 = 0;
        let cM1 = 0, cM3 = 0, cM6 = 0;
        cohorts.forEach(c => {
            totalSize += c.cohortSize;
            const at = (idx: number) => c.retention.find(p => p.monthIndex === idx);
            const p1 = at(1); if (p1) { sumM1 += p1.percentage; cM1++; }
            const p3 = at(3); if (p3) { sumM3 += p3.percentage; cM3++; }
            const p6 = at(6); if (p6) { sumM6 += p6.percentage; cM6++; }
        });
        return {
            avgSize: Math.round(totalSize / cohorts.length),
            m1: cM1 > 0 ? Math.round(sumM1 / cM1) : 0,
            m3: cM3 > 0 ? Math.round(sumM3 / cM3) : 0,
            m6: cM6 > 0 ? Math.round(sumM6 / cM6) : 0
        };
    }, [cohorts]);

    // ── Chart data ─────────────────────────────────────────────────────────
    const chartData = useMemo(() => {
        return Array.from({ length: 13 }, (_, m) => {
            const pt: Record<string, number | string> = { monthIndex: m, name: `M${m}` };
            cohorts.forEach(c => {
                if (visibleLineCohorts[c.cohortName] === false) return;
                const found = c.retention.find(p => p.monthIndex === m);
                if (found) pt[c.cohortName] = found.percentage;
            });
            return pt;
        });
    }, [cohorts, visibleLineCohorts]);

    // ── Drill-down people ──────────────────────────────────────────────────
    const activeCohortDetails = useMemo(() => {
        if (!selectedCohortName) return null;
        const cohort = cohorts.find(c => c.cohortName === selectedCohortName);
        if (!cohort) return null;
        return {
            name: cohort.cohortName,
            size: cohort.cohortSize,
            people: people
                .filter(p => cohort.peopleIds.includes(p.id))
                .map(p => ({
                    id: p.id,
                    name: p.name,
                    membership: p.membership || 'Visitor',
                    riskCategory: p.riskProfile?.category || 'Disconnected',
                    checkIns: p.checkInCount || 0
                }))
        };
    }, [selectedCohortName, cohorts, people]);

    const riskBadge = (cat: string) => {
        if (['Healthy', 'Thriving'].includes(cat))
            return 'bg-emerald-50 text-emerald-700 border border-emerald-100 dark:bg-emerald-950/20 dark:border-emerald-900/30';
        if (['At Risk', 'Warning'].includes(cat))
            return 'bg-amber-50 text-amber-700 border border-amber-100 dark:bg-amber-950/20 dark:border-amber-900/30';
        return 'bg-rose-50 text-rose-700 border border-rose-100 dark:bg-rose-950/20 dark:border-rose-900/30';
    };

    return (
        <div className="space-y-6">

            {/* ── 0. Educational Guide (Collapsible) ──────────────────────────────── */}
            <div className="bg-gradient-to-r from-indigo-900/90 via-slate-900 to-slate-900 text-white rounded-2xl border border-indigo-800/40 p-5 shadow-sm overflow-hidden">
                <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-xl bg-indigo-500/30 border border-indigo-400/40 flex items-center justify-center text-indigo-300 text-sm">
                            💡
                        </div>
                        <div>
                            <h4 className="text-sm font-black tracking-tight text-white">How Cohort Retention Works</h4>
                            <p className="text-xs text-indigo-200/80">Understand how newcomer classes & member engagement are tracked over 12 months</p>
                        </div>
                    </div>
                    <button
                        onClick={() => setShowGuide(prev => !prev)}
                        className="px-3 py-1 rounded-xl bg-white/10 hover:bg-white/20 text-xs font-bold transition-all text-indigo-100 flex items-center gap-1.5 cursor-pointer"
                    >
                        {showGuide ? 'Hide Guide' : 'Show Guide'}
                        <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showGuide ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
                        </svg>
                    </button>
                </div>

                {showGuide && (
                    <div className="mt-4 pt-4 border-t border-white/10 grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                        <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                            <div className="font-black text-indigo-300 flex items-center gap-1.5 mb-1.5">
                                <span>📅</span> 1. Monthly Cohorts
                            </div>
                            <p className="text-slate-300 leading-relaxed">
                                People are grouped into cohorts by the calendar month they joined (or first visited / registered). Each row in the heatmap represents one monthly intake class.
                            </p>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                            <div className="font-black text-indigo-300 flex items-center gap-1.5 mb-1.5">
                                <span>📈</span> 2. Timeline (M0 → M12)
                            </div>
                            <p className="text-slate-300 leading-relaxed">
                                <strong className="text-white">M0</strong> is the starting month. <strong className="text-white">M1, M3, M6, M12</strong> measure what % of that cohort remained active 30 days, 90 days, 180 days, and 1 year later.
                            </p>
                        </div>

                        <div className="bg-white/5 border border-white/10 rounded-xl p-3.5">
                            <div className="font-black text-indigo-300 flex items-center gap-1.5 mb-1.5">
                                <span>⚡</span> 3. Active Engagement Signals
                            </div>
                            <p className="text-slate-300 leading-relaxed">
                                A person is counted as retained in a month if they had at least one selected activity: Check-ins, Giving, Small Groups, or Serving.
                            </p>
                        </div>

                        <div className="md:col-span-3 bg-indigo-950/60 border border-indigo-500/30 rounded-xl p-3 flex items-start gap-2.5">
                            <span className="text-sm">🎯</span>
                            <p className="text-indigo-200/90 text-xs">
                                <strong>Assimilation Tip:</strong> Filter by <span className="underline font-bold text-white">Visitors Only</span> or select a specific <span className="underline font-bold text-white">PCO Group</span> (e.g. <em>Alpha Course</em>, <em>New Members</em>) below to evaluate assimilation without long-time church members skewing the historical data.
                            </p>
                        </div>
                    </div>
                )}
            </div>

            {/* ── 1. Audience & Filter Controls Bar ───────────────────────────────── */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-5 shadow-sm space-y-4">
                
                {/* Scope Filters */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    {/* Group Filter */}
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                            👥 PCO Group Filter
                        </label>
                        <select
                            value={config.selectedGroupId || ''}
                            onChange={e => setConfig(p => ({
                                ...p,
                                selectedGroupId: e.target.value || null,
                                cohortBasis: e.target.value ? p.cohortBasis : (p.cohortBasis === 'group_joined_at' ? 'created_at' : p.cohortBasis)
                            }))}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="">All Church (All Profiles)</option>
                            {sortedGroups.map(g => (
                                <option key={g.id} value={g.id}>
                                    {g.name} ({g.membersCount || g.memberIds?.length || 0} members)
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* Membership Status Filter */}
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                            🏷️ Membership Status
                        </label>
                        <select
                            value={config.membershipStatus || 'all'}
                            onChange={e => setConfig(p => ({ ...p, membershipStatus: e.target.value }))}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="all">All Membership Statuses</option>
                            <option value="visitor">Visitors & Guests Only (True Assimilation)</option>
                            <option value="member">Members Only</option>
                            <option value="regular attender">Regular Attenders</option>
                        </select>
                    </div>

                    {/* Cohort Grouping Basis */}
                    <div>
                        <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-1.5">
                            🗓️ Cohort Start Basis
                        </label>
                        <select
                            value={config.cohortBasis || 'created_at'}
                            onChange={e => setConfig(p => ({ ...p, cohortBasis: e.target.value as any }))}
                            className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200 text-xs font-bold rounded-xl px-3 py-2.5 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="created_at">PCO Profile Created Date (Default)</option>
                            <option value="first_check_in">First Check-in Date (First Visit)</option>
                            {config.selectedGroupId && (
                                <option value="group_joined_at">Group Join Date</option>
                            )}
                        </select>
                    </div>
                </div>

                {/* Activity Signals & Quick Actions */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex flex-wrap items-center gap-2">
                        <span className="text-[11px] font-bold uppercase tracking-wide text-slate-400 mr-1">Activity Signals:</span>
                        <SignalToggle label="Check-ins" icon="🏷️" checked={config.includeCheckIns} onChange={v => setConfig(p => ({ ...p, includeCheckIns: v }))} />
                        <SignalToggle label="Giving" icon="💳" checked={config.includeGiving} onChange={v => setConfig(p => ({ ...p, includeGiving: v }))} />
                        <SignalToggle label="Groups" icon="👥" checked={config.includeGroups} onChange={v => setConfig(p => ({ ...p, includeGroups: v }))} />
                        <SignalToggle label="Serving" icon="🤝" checked={config.includeServing} onChange={v => setConfig(p => ({ ...p, includeServing: v }))} />
                    </div>

                    {(config.selectedGroupId || config.membershipStatus !== 'all' || config.cohortBasis !== 'created_at' || !config.includeCheckIns || !config.includeGiving || !config.includeGroups || !config.includeServing) && (
                        <button
                            onClick={handleResetFilters}
                            className="px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-1.5 cursor-pointer"
                        >
                            <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                            </svg>
                            Reset Filters
                        </button>
                    )}
                </div>
            </div>

            {/* Scope Summary Banner */}
            <div className="flex items-center justify-between px-1">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500 dark:text-slate-400">
                    <span>Analyzing <strong className="text-slate-800 dark:text-white font-black">{totalAudienceSize} people</strong> across <strong className="text-slate-800 dark:text-white font-black">{cohorts.length} cohorts</strong></span>
                    {activeGroupName && (
                        <span className="px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-950/40 text-indigo-600 dark:text-indigo-400 font-bold border border-indigo-100 dark:border-indigo-900/40">
                            Group: {activeGroupName}
                        </span>
                    )}
                    {config.membershipStatus && config.membershipStatus !== 'all' && (
                        <span className="px-2 py-0.5 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 font-bold border border-emerald-100 dark:border-emerald-900/40 capitalize">
                            Status: {config.membershipStatus}
                        </span>
                    )}
                </div>
            </div>

            {/* ── 2. Metric Summary Row ──────────────────────────────────────────── */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <MetricCard 
                    label="Total Cohorts" 
                    value={String(cohorts.length)} 
                    valueColor="text-slate-900 dark:text-white"
                    sub="Monthly intakes"
                    tooltip="Number of monthly cohort buckets with at least one person"
                />
                <MetricCard 
                    label="Avg Month 1 Retention" 
                    value={`${metrics.m1}%`} 
                    valueColor="text-rose-500" 
                    sub="30-day engagement" 
                    tooltip="Average percentage of people who remained active 1 month after joining"
                />
                <MetricCard 
                    label="Avg Month 3 Retention" 
                    value={`${metrics.m3}%`} 
                    valueColor="text-amber-500" 
                    sub="90-day engagement" 
                    tooltip="Average percentage of people who remained active 3 months after joining"
                />
                <MetricCard 
                    label="Avg Month 6 Retention" 
                    value={`${metrics.m6}%`} 
                    valueColor="text-emerald-500" 
                    sub="180-day engagement" 
                    tooltip="Average percentage of people who remained active 6 months after joining"
                />
            </div>

            {/* ── Empty State if No Data ────────────────────────────────────────── */}
            {cohorts.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-2xl p-12 flex flex-col items-center justify-center text-center gap-3">
                    <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl">
                        🔍
                    </div>
                    <p className="text-base font-black text-slate-800 dark:text-white">No cohort records match this filter</p>
                    <p className="text-xs text-slate-400 max-w-sm">Try broadening your group, membership status, or date basis selection.</p>
                    <button
                        onClick={handleResetFilters}
                        className="mt-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold transition-all shadow-sm cursor-pointer"
                    >
                        Reset All Filters
                    </button>
                </div>
            ) : (
                <>
                    {/* ── 3. Retention Heatmap (full width, horizontal scroll) ───────────── */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                            <div>
                                <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">Retention Heatmap</h3>
                                <p className="text-xs text-slate-400 mt-0.5">Click any cohort row to inspect its members below. Hover over column headers for month details.</p>
                            </div>
                            {/* Colour legend */}
                            <div className="hidden sm:flex items-center gap-2 shrink-0">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">0%</span>
                                <div className="flex gap-0.5">
                                    {[0.08, 0.22, 0.38, 0.55, 0.72, 0.88].map((a, i) => (
                                        <div key={i} className="w-5 h-4 rounded" style={{ backgroundColor: `rgba(99,102,241,${a})` }} />
                                    ))}
                                </div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">100%</span>
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full border-collapse" style={{ minWidth: '760px' }}>
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-850">
                                        <th className="sticky left-0 bg-slate-50 dark:bg-slate-850 z-10 px-6 py-3 text-left text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">Cohort</th>
                                        <th className="px-4 py-3 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">Size</th>
                                        {Array.from({ length: 13 }, (_, i) => (
                                            <th 
                                                key={i} 
                                                className="px-3 py-3 text-center text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap cursor-help hover:text-indigo-600 transition-colors"
                                                title={MONTH_LABELS[i]?.desc || `Month ${i}`}
                                            >
                                                {MONTH_LABELS[i]?.label || `M${i}`}
                                            </th>
                                        ))}
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                    {cohorts.map((cohort) => (
                                        <tr
                                            key={cohort.startDate}
                                            onClick={() => setSelectedCohortName(
                                                selectedCohortName === cohort.cohortName ? null : cohort.cohortName
                                            )}
                                            className={`cursor-pointer transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40 ${
                                                selectedCohortName === cohort.cohortName
                                                    ? 'bg-indigo-50/60 dark:bg-indigo-950/20'
                                                    : ''
                                            }`}
                                        >
                                            <td className="sticky left-0 bg-inherit z-10 px-6 py-4 whitespace-nowrap">
                                                <div className="flex items-center gap-2.5">
                                                    {selectedCohortName === cohort.cohortName && (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 shrink-0" />
                                                    )}
                                                    <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{cohort.cohortName}</span>
                                                </div>
                                            </td>
                                            <td className="px-4 py-4 text-center text-sm font-bold text-slate-500">{cohort.cohortSize}</td>
                                            {cohort.retention.map(point => (
                                                <td
                                                    key={point.monthIndex}
                                                    title={`${point.percentage}% (${point.activeCount} of ${cohort.cohortSize} active at ${point.monthLabel})`}
                                                    style={{
                                                        backgroundColor: point.percentage > 0 ? heatmapBg(point.percentage) : undefined,
                                                        color: heatmapText(point.percentage) || undefined
                                                    }}
                                                    className="px-3 py-4 text-center text-xs font-black tabular-nums whitespace-nowrap"
                                                >
                                                    {point.percentage > 0 ? `${point.percentage}%` : (
                                                        <span className="text-slate-300 dark:text-slate-700">—</span>
                                                    )}
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>

                    {/* ── 4. Retention Curves ────────────────────────────────────────────── */}
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="px-6 pt-6 pb-4 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">Retention Curves</h3>
                            <p className="text-xs text-slate-400 mt-0.5">Month 0 → 12 retention progression. Toggle cohorts in the legend below.</p>
                        </div>

                        {/* Chart area */}
                        <div className="p-6 pb-4">
                            <div style={{ height: 360 }}>
                                <ResponsiveContainer width="100%" height="100%">
                                    <LineChart data={chartData} margin={{ left: 0, right: 24, top: 8, bottom: 0 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.15)" />
                                        <XAxis
                                            dataKey="name"
                                            stroke="#94a3b8"
                                            fontSize={11}
                                            fontWeight="700"
                                            tickLine={false}
                                            axisLine={false}
                                        />
                                        <YAxis
                                            stroke="#94a3b8"
                                            fontSize={11}
                                            fontWeight="700"
                                            domain={[0, 100]}
                                            tickFormatter={v => `${v}%`}
                                            tickLine={false}
                                            axisLine={false}
                                            width={40}
                                        />
                                        <Tooltip
                                            contentStyle={{
                                                borderRadius: '12px',
                                                backgroundColor: '#1e293b',
                                                border: 'none',
                                                color: '#fff',
                                                fontSize: '11px',
                                                fontWeight: 'bold',
                                                padding: '10px 14px',
                                                boxShadow: '0 10px 25px -5px rgba(0,0,0,0.3)'
                                            }}
                                            formatter={(val: number) => [`${val}%`]}
                                        />
                                        {cohorts.map((c, i) => {
                                            if (visibleLineCohorts[c.cohortName] === false) return null;
                                            return (
                                                <Line
                                                    key={c.cohortName}
                                                    type="monotone"
                                                    dataKey={c.cohortName}
                                                    stroke={LINE_COLORS[i % LINE_COLORS.length]}
                                                    strokeWidth={2.5}
                                                    dot={{ r: 3.5, strokeWidth: 0 }}
                                                    activeDot={{ r: 6, strokeWidth: 0 }}
                                                    connectNulls={false}
                                                />
                                            );
                                        })}
                                    </LineChart>
                                </ResponsiveContainer>
                            </div>
                        </div>

                        {/* Cohort toggles as pills inside the same card */}
                        <div className="px-6 pb-6 flex flex-wrap gap-2 border-t border-slate-50 dark:border-slate-800 pt-4">
                            {cohorts.map((c, i) => {
                                const visible = visibleLineCohorts[c.cohortName] !== false;
                                const color = LINE_COLORS[i % LINE_COLORS.length];
                                return (
                                    <button
                                        key={c.cohortName}
                                        onClick={() => toggleLineCohort(c.cohortName)}
                                        className={`flex items-center gap-2 px-3 py-1.5 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                                            visible
                                                ? 'bg-slate-50 border-slate-200 text-slate-700 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-200'
                                                : 'bg-white border-dashed border-slate-200 text-slate-400 opacity-50 dark:bg-slate-900 dark:border-slate-800'
                                        }`}
                                    >
                                        <span
                                            className="w-2.5 h-2.5 rounded-full shrink-0"
                                            style={{ backgroundColor: visible ? color : '#94a3b8' }}
                                        />
                                        {c.cohortName}
                                        <span className="text-[10px] text-slate-400 font-semibold ml-0.5">({c.cohortSize})</span>
                                    </button>
                                );
                            })}
                        </div>
                    </div>

                    {/* ── 5. Drill-down Panel ────────────────────────────────────────────── */}
                    {activeCohortDetails && (
                        <div className="bg-white dark:bg-slate-900 border border-indigo-100 dark:border-indigo-900/30 rounded-2xl shadow-sm overflow-hidden">
                            {/* Panel header */}
                            <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                                <div>
                                    <h3 className="text-base font-black text-slate-900 dark:text-white">
                                        {activeCohortDetails.name}
                                        <span className="ml-2 text-xs font-bold text-slate-400">· {activeCohortDetails.size} members</span>
                                    </h3>
                                    <p className="text-xs text-slate-400 mt-0.5">Individual retention profiles for this cohort.</p>
                                </div>
                                <button
                                    onClick={() => setSelectedCohortName(null)}
                                    className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-800 text-xs font-bold text-slate-500 hover:text-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all cursor-pointer"
                                >
                                    <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                                    </svg>
                                    Close
                                </button>
                            </div>

                            {/* People grid */}
                            <div className="p-6">
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 max-h-[480px] overflow-y-auto pr-1">
                                    {activeCohortDetails.people.map(person => (
                                        <div
                                            key={person.id}
                                            className="bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-800 p-4 flex flex-col gap-3"
                                        >
                                            <div className="flex items-start justify-between gap-2">
                                                <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-950/40 flex items-center justify-center text-xs font-black text-indigo-600 dark:text-indigo-400 shrink-0">
                                                    {person.name.charAt(0).toUpperCase()}
                                                </div>
                                                <span className={`px-2 py-0.5 rounded-lg text-[11px] font-black uppercase tracking-wide ${riskBadge(person.riskCategory)}`}>
                                                    {person.riskCategory}
                                                </span>
                                            </div>
                                            <div>
                                                <p className="text-xs font-black text-slate-800 dark:text-slate-200 leading-snug">{person.name}</p>
                                                <p className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mt-0.5">{person.membership}</p>
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-auto">
                                                <svg className="w-3 h-3 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z" />
                                                </svg>
                                                <span className="text-[10px] font-bold text-slate-500">{person.checkIns} check-ins</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}
        </div>
    );
};
