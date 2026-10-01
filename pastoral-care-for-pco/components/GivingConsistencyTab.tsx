import React, { useState, useMemo } from 'react';
import {
    GivingConsistencyAnalytics,
    DonorConsistencyProfile,
    DonorConsistencySegment,
} from '../types';
import {
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    Tooltip,
    LineChart,
    Line,
    XAxis,
    YAxis,
    CartesianGrid,
    Legend,
    BarChart,
    Bar,
} from 'recharts';

// ---------------------------------------------------------------------------
// Helpers & constants
// ---------------------------------------------------------------------------

const money = (n: number) => '$' + Math.round(n).toLocaleString();

const TOOLTIP_STYLE = {
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#1e293b',
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0, 0, 0, 0.1)',
};

const SEGMENT_META: Record<DonorConsistencySegment, { color: string; bg: string; text: string; description: string }> = {
    Champion:   { color: '#10b981', bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-600 dark:text-emerald-400', description: 'Gives nearly every month with stable amounts' },
    Consistent: { color: '#6366f1', bg: 'bg-indigo-50 dark:bg-indigo-900/20',   text: 'text-indigo-600 dark:text-indigo-400',   description: 'Gives most months with modest variance' },
    Sporadic:   { color: '#f59e0b', bg: 'bg-amber-50 dark:bg-amber-900/20',     text: 'text-amber-600 dark:text-amber-400',     description: 'Irregular frequency or high amount variance' },
    Irregular:  { color: '#ef4444', bg: 'bg-rose-50 dark:bg-rose-900/20',       text: 'text-rose-600 dark:text-rose-400',       description: 'Rare giving or very erratic pattern' },
    Inactive:   { color: '#94a3b8', bg: 'bg-slate-100 dark:bg-slate-800',       text: 'text-slate-500 dark:text-slate-400',     description: 'No gifts in the analysis window' },
};

const TREND_ICON: Record<DonorConsistencyProfile['trend'], string> = {
    Improving: '↑',
    Stable:    '→',
    Declining: '↓',
};
const TREND_COLOR: Record<DonorConsistencyProfile['trend'], string> = {
    Improving: 'text-emerald-500',
    Stable:    'text-slate-400',
    Declining: 'text-rose-500',
};

/** 12-bar mini sparkline showing the donor's monthly giving amounts */
function Sparkline({ pattern }: { pattern: { month: string; amount: number }[] }) {
    const max = Math.max(...pattern.map(p => p.amount), 1);
    return (
        <div className="flex items-end gap-[2px] h-6 w-20">
            {pattern.map((p, i) => (
                <div
                    key={i}
                    title={`${p.month}: ${money(p.amount)}`}
                    className="flex-1 rounded-sm transition-all"
                    style={{
                        height: `${Math.max(2, (p.amount / max) * 24)}px`,
                        backgroundColor: p.amount > 0 ? '#6366f1' : '#e2e8f0',
                    }}
                />
            ))}
        </div>
    );
}

/** Circular score badge */
function ScoreBadge({ score }: { score: number }) {
    const color =
        score >= 85 ? '#10b981' :
        score >= 65 ? '#6366f1' :
        score >= 40 ? '#f59e0b' :
        score > 0   ? '#ef4444' :
        '#94a3b8';

    const radius = 18;
    const circumference = 2 * Math.PI * radius;
    const offset = circumference - (score / 100) * circumference;

    return (
        <div className="relative inline-flex items-center justify-center w-12 h-12 flex-shrink-0">
            <svg width="48" height="48" className="-rotate-90">
                <circle cx="24" cy="24" r={radius} fill="none" stroke="#e2e8f0" strokeWidth="4" />
                <circle
                    cx="24" cy="24" r={radius}
                    fill="none"
                    stroke={color}
                    strokeWidth="4"
                    strokeDasharray={circumference}
                    strokeDashoffset={offset}
                    strokeLinecap="round"
                    style={{ transition: 'stroke-dashoffset 0.5s ease' }}
                />
            </svg>
            <span className="absolute text-[11px] font-black tabular-nums" style={{ color }}>{score}</span>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Section: Consistency Index hero card
// ---------------------------------------------------------------------------

function ConsistencyIndexCard({ data }: { data: GivingConsistencyAnalytics }) {
    const trendPoint = data.trend.length >= 2 ? data.trend[data.trend.length - 2] : null;
    const prevIndex = trendPoint?.avgScore ?? null;
    const delta = prevIndex !== null ? data.consistencyIndex - prevIndex : null;

    return (
        <div className="bg-slate-900 text-white p-10 rounded-[3rem] shadow-2xl relative overflow-hidden col-span-1 md:col-span-2">
            <div className="absolute top-0 right-0 p-8 opacity-10 text-[10rem] font-black leading-none select-none">{data.consistencyIndex}</div>
            <div className="relative z-10">
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-1">Church Consistency Index</p>
                <div className="flex items-end gap-4 mb-2">
                    <span className="text-6xl font-black tracking-tighter tabular-nums">{data.consistencyIndex}</span>
                    <span className="text-slate-400 text-lg font-bold mb-1">/ 100</span>
                    {delta !== null && (
                        <span className={`text-lg font-black mb-1 ${delta >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                            {delta >= 0 ? '▲' : '▼'} {Math.abs(delta)} pts vs last mo
                        </span>
                    )}
                </div>
                <p className="text-slate-400 text-sm font-medium">
                    Donation-weighted average score across {data.donors.length} donor{data.donors.length !== 1 ? 's' : ''} · {data.windowMonths}-month window
                </p>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Section: Segment donut
// ---------------------------------------------------------------------------

function SegmentDonut({
    data,
    view,
    onViewChange,
}: {
    data: GivingConsistencyAnalytics;
    view: 'count' | 'amount';
    onViewChange?: (view: 'count' | 'amount') => void;
}) {
    const SEGMENTS: DonorConsistencySegment[] = ['Champion', 'Consistent', 'Sporadic', 'Irregular', 'Inactive'];
    const totalDonors = data.donors.length;
    const totalGiving = Object.values(data.segmentAmounts).reduce((s, x) => s + x, 0);

    const pieData = SEGMENTS
        .map(s => ({
            name: s,
            value: view === 'count' ? data.segmentCounts[s] : Math.round(data.segmentAmounts[s]),
            color: SEGMENT_META[s].color,
        }))
        .filter(x => x.value > 0);

    return (
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col justify-between">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                <div>
                    <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Segments By Donors & Giving</h4>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-medium mt-0.5">
                        <span className="font-bold text-slate-800 dark:text-white">{totalDonors}</span> donors · <span className="font-bold text-slate-800 dark:text-white">{money(totalGiving)}</span> total given
                    </p>
                </div>
                {onViewChange && (
                    <div className="flex bg-slate-100 dark:bg-slate-800 p-0.5 rounded-xl self-start sm:self-auto">
                        <button
                            type="button"
                            onClick={() => onViewChange('count')}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${
                                view === 'count'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            By Donors
                        </button>
                        <button
                            type="button"
                            onClick={() => onViewChange('amount')}
                            className={`px-3 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wide transition-all ${
                                view === 'amount'
                                    ? 'bg-indigo-600 text-white shadow-sm'
                                    : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                            }`}
                        >
                            By Giving $
                        </button>
                    </div>
                )}
            </div>
            <div className="h-60 relative">
                {totalDonors > 0 ? (
                    <>
                        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="38%"
                                    cy="50%"
                                    innerRadius={58}
                                    outerRadius={80}
                                    paddingAngle={4}
                                    dataKey="value"
                                >
                                    {pieData.map((x, i) => <Cell key={i} fill={x.color} />)}
                                </Pie>
                                <Tooltip
                                    content={({ active, payload }) => {
                                        if (!active || !payload || !payload.length) return null;
                                        const item = payload[0].payload;
                                        const seg = item.name as DonorConsistencySegment;
                                        const count = data.segmentCounts[seg] || 0;
                                        const amt = data.segmentAmounts[seg] || 0;
                                        const countPct = totalDonors > 0 ? Math.round((count / totalDonors) * 100) : 0;
                                        const amtPct = totalGiving > 0 ? Math.round((amt / totalGiving) * 100) : 0;
                                        return (
                                            <div style={TOOLTIP_STYLE} className="p-3 text-xs space-y-1.5 min-w-[160px]">
                                                <div className="flex items-center gap-2 font-black">
                                                    <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: item.color }} />
                                                    <span>{seg}</span>
                                                </div>
                                                <div className="text-slate-200 space-y-0.5">
                                                    <div className="flex justify-between gap-4 font-semibold">
                                                        <span className="text-slate-400">Donors:</span>
                                                        <span>{count} ({countPct}%)</span>
                                                    </div>
                                                    <div className="flex justify-between gap-4 font-semibold">
                                                        <span className="text-slate-400">Giving Total:</span>
                                                        <span>{money(amt)} ({amtPct}%)</span>
                                                    </div>
                                                </div>
                                                <div className="text-[10px] text-slate-400 pt-1 border-t border-slate-700">
                                                    {SEGMENT_META[seg]?.description}
                                                </div>
                                            </div>
                                        );
                                    }}
                                />
                                <Legend
                                    layout="vertical"
                                    verticalAlign="middle"
                                    align="right"
                                    iconType="circle"
                                    wrapperStyle={{ fontSize: '11px', fontWeight: 'bold' }}
                                    formatter={(value) => {
                                        const seg = value as DonorConsistencySegment;
                                        const count = data.segmentCounts[seg] || 0;
                                        const amt = data.segmentAmounts[seg] || 0;
                                        return (
                                            <span className="text-slate-700 dark:text-slate-300">
                                                {value}: <span className="text-slate-900 dark:text-white font-black">{view === 'count' ? `${count}` : money(amt)}</span>
                                            </span>
                                        );
                                    }}
                                />
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="absolute top-0 bottom-0 left-0 w-[76%] flex flex-col items-center justify-center pointer-events-none text-center">
                            <span className="text-2xl font-black text-slate-900 dark:text-white tabular-nums leading-none mb-1">
                                {view === 'count' ? totalDonors : money(totalGiving)}
                            </span>
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                                {view === 'count' ? 'Donors' : 'Total Given'}
                            </span>
                            <span className="text-[11px] font-bold text-indigo-500 dark:text-indigo-400 tabular-nums mt-1">
                                {view === 'count' ? money(totalGiving) : `${totalDonors} donors`}
                            </span>
                        </div>
                    </>
                ) : (
                    <div className="h-full flex items-center justify-center text-slate-400 text-xs font-bold">No giving data in this window.</div>
                )}
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Section: 6-month trend line
// ---------------------------------------------------------------------------

function ConsistencyTrendChart({ data }: { data: GivingConsistencyAnalytics }) {
    const chartData = data.trend.map(t => ({ month: t.month.slice(5), score: t.avgScore }));
    return (
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] p-8 shadow-sm border border-slate-100 dark:border-slate-800 col-span-1 md:col-span-2">
            <h4 className="text-[10px] font-bold uppercase tracking-widest text-slate-400 mb-4">Avg Consistency Score — Rolling 6 Months</h4>
            <div className="h-52">
                <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                    <LineChart data={chartData}>
                        <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                        <XAxis dataKey="month" axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                        <YAxis domain={[0, 100]} axisLine={false} tickLine={false} tick={{ fontSize: 11, fill: '#94a3b8' }} />
                        <Tooltip contentStyle={TOOLTIP_STYLE} itemStyle={{ color: '#fff' }} formatter={(v: number) => [`${v}`, 'Avg Score']} />
                        <Line
                            type="monotone"
                            dataKey="score"
                            name="Avg Score"
                            stroke="#6366f1"
                            strokeWidth={3}
                            dot={{ fill: '#6366f1', strokeWidth: 0, r: 5 }}
                            activeDot={{ r: 7 }}
                        />
                    </LineChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Section: Segment summary cards
// ---------------------------------------------------------------------------

function SegmentSummaryCards({ data }: { data: GivingConsistencyAnalytics }) {
    const SEGMENTS: DonorConsistencySegment[] = ['Champion', 'Consistent', 'Sporadic', 'Irregular'];
    return (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {SEGMENTS.map(seg => {
                const meta = SEGMENT_META[seg];
                const count = data.segmentCounts[seg];
                const amt = data.segmentAmounts[seg];
                return (
                    <div key={seg} className={`rounded-2xl p-5 ${meta.bg}`}>
                        <p className={`text-[10px] font-bold uppercase tracking-widest ${meta.text} mb-1`}>{seg}</p>
                        <p className="text-2xl font-black text-slate-900 dark:text-white tabular-nums">{count}</p>
                        <p className="text-xs text-slate-500 dark:text-slate-400 font-semibold mt-0.5">{money(amt)}</p>
                        <p className="text-[10px] text-slate-400 mt-1">{meta.description}</p>
                    </div>
                );
            })}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Section: Donor table
// ---------------------------------------------------------------------------

type SortKey = 'consistencyScore' | 'donorName' | 'totalGiven' | 'daysSinceLastGift' | 'trend' | 'avgMonthlyAmount' | 'frequencyRatio';

function DonorConsistencyTable({ donors }: { donors: DonorConsistencyProfile[] }) {
    const [search, setSearch] = useState('');
    const [segmentFilter, setSegmentFilter] = useState<DonorConsistencySegment | 'All'>('All');
    const [sortKey, setSortKey] = useState<SortKey>('consistencyScore');
    const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
    const [page, setPage] = useState(0);
    const PAGE_SIZE = 25;

    const filtered = useMemo(() => {
        let list = [...donors];
        if (segmentFilter !== 'All') list = list.filter(d => d.segment === segmentFilter);
        if (search.trim()) {
            const q = search.trim().toLowerCase();
            list = list.filter(d => d.donorName.toLowerCase().includes(q));
        }
        list.sort((a, b) => {
            let av: string | number;
            let bv: string | number;
            switch (sortKey) {
                case 'donorName':        av = a.donorName;        bv = b.donorName; break;
                case 'trend':            av = a.trend;            bv = b.trend; break;
                case 'avgMonthlyAmount': av = a.avgMonthlyAmount; bv = b.avgMonthlyAmount; break;
                case 'frequencyRatio':   av = a.frequencyRatio;   bv = b.frequencyRatio; break;
                default:                 av = a[sortKey];         bv = b[sortKey]; break;
            }
            if (typeof av === 'string' && typeof bv === 'string') {
                return sortDir === 'asc' ? av.localeCompare(bv) : bv.localeCompare(av);
            }
            return sortDir === 'asc' ? (av as number) - (bv as number) : (bv as number) - (av as number);
        });
        return list;
    }, [donors, segmentFilter, search, sortKey, sortDir]);

    const totalPages = Math.ceil(filtered.length / PAGE_SIZE);
    const visible = filtered.slice(page * PAGE_SIZE, (page + 1) * PAGE_SIZE);

    const handleSort = (key: SortKey) => {
        if (sortKey === key) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
        else { setSortKey(key); setSortDir('desc'); }
        setPage(0);
    };

    const SortHeader = ({ label, k }: { label: string; k: SortKey }) => (
        <th
            onClick={() => handleSort(k)}
            className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400 cursor-pointer hover:text-slate-600 dark:hover:text-slate-200 select-none whitespace-nowrap"
        >
            {label} {sortKey === k ? (sortDir === 'desc' ? '↓' : '↑') : ''}
        </th>
    );

    const handleExportCSV = () => {
        const header = 'Name,Score,Segment,Frequency %,Avg/mo,Total Given,Days Since Last Gift,Trend';
        const rows = filtered.map(d => [
            `"${d.donorName}"`,
            d.consistencyScore,
            d.segment,
            Math.round(d.frequencyRatio * 100),
            Math.round(d.avgMonthlyAmount),
            Math.round(d.totalGiven),
            d.daysSinceLastGift,
            d.trend,
        ].join(','));
        const csv = [header, ...rows].join('\n');
        const link = document.createElement('a');
        link.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
        link.download = 'donor_consistency.csv';
        link.click();
    };

    const SEGMENTS: DonorConsistencySegment[] = ['Champion', 'Consistent', 'Sporadic', 'Irregular', 'Inactive'];

    return (
        <div className="bg-white dark:bg-slate-900 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800 overflow-hidden">
            {/* Toolbar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-6 border-b border-slate-100 dark:border-slate-800">
                <div className="flex items-center gap-2 flex-wrap">
                    {(['All', ...SEGMENTS] as const).map(s => (
                        <button
                            key={s}
                            onClick={() => { setSegmentFilter(s); setPage(0); }}
                            className={`px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wide transition-colors ${
                                segmentFilter === s
                                    ? 'bg-indigo-600 text-white'
                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                            }`}
                        >
                            {s}
                            {s !== 'All' && <span className="ml-1 opacity-70">{donors.filter(d => d.segment === s).length}</span>}
                        </button>
                    ))}
                </div>
                <div className="flex items-center gap-3">
                    <input
                        type="text"
                        placeholder="Search donors…"
                        value={search}
                        onChange={e => { setSearch(e.target.value); setPage(0); }}
                        className="text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 px-4 py-2 outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-white w-48"
                    />
                    <button
                        onClick={handleExportCSV}
                        className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 font-bold text-[10px] uppercase tracking-wide hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors whitespace-nowrap"
                    >
                        ⬇ Export CSV
                    </button>
                </div>
            </div>

            {/* Table */}
            <div className="overflow-x-auto">
                <table className="w-full text-left">
                    <thead className="border-b border-slate-100 dark:border-slate-800">
                        <tr>
                            <th className="px-3 py-3 text-[10px] font-bold uppercase tracking-widest text-slate-400 w-10">#</th>
                            <SortHeader label="Donor" k="donorName" />
                            <SortHeader label="Score" k="consistencyScore" />
                            <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Segment</th>
                            <SortHeader label="Frequency" k="frequencyRatio" />
                            <SortHeader label="Avg/Mo" k="avgMonthlyAmount" />
                            <SortHeader label="Total Given" k="totalGiven" />
                            <SortHeader label="Last Gift" k="daysSinceLastGift" />
                            <th className="px-3 py-3 text-left text-[10px] font-bold uppercase tracking-widest text-slate-400">Pattern</th>
                            <SortHeader label="Trend" k="trend" />
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                        {visible.map((d, i) => {
                            const meta = SEGMENT_META[d.segment];
                            return (
                                <tr key={d.donorId} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="px-3 py-3 text-[11px] text-slate-400 font-bold tabular-nums">{page * PAGE_SIZE + i + 1}</td>
                                    <td className="px-3 py-3">
                                        <div className="flex items-center gap-2.5">
                                            {d.avatar
                                                ? <img src={d.avatar} alt="" className="w-8 h-8 rounded-full object-cover flex-shrink-0" />
                                                : <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center text-[11px] font-black text-slate-500 flex-shrink-0">
                                                    {d.donorName.charAt(0).toUpperCase()}
                                                  </div>
                                            }
                                            <span className="text-sm font-bold text-slate-900 dark:text-white whitespace-nowrap">{d.donorName}</span>
                                        </div>
                                    </td>
                                    <td className="px-3 py-3">
                                        <ScoreBadge score={d.consistencyScore} />
                                    </td>
                                    <td className="px-3 py-3">
                                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${meta.bg} ${meta.text}`}>
                                            {d.segment}
                                        </span>
                                    </td>
                                    <td className="px-3 py-3 text-sm tabular-nums text-slate-600 dark:text-slate-300 font-semibold">
                                        {Math.round(d.frequencyRatio * 100)}%
                                    </td>
                                    <td className="px-3 py-3 text-sm tabular-nums text-slate-600 dark:text-slate-300 font-semibold">
                                        {money(d.avgMonthlyAmount)}
                                    </td>
                                    <td className="px-3 py-3 text-sm tabular-nums text-slate-900 dark:text-white font-bold">
                                        {money(d.totalGiven)}
                                    </td>
                                    <td className="px-3 py-3 text-sm tabular-nums text-slate-500 dark:text-slate-400 font-semibold whitespace-nowrap">
                                        {d.daysSinceLastGift === 0 ? 'Today' : `${d.daysSinceLastGift}d ago`}
                                    </td>
                                    <td className="px-3 py-3">
                                        <Sparkline pattern={d.monthlyPattern} />
                                    </td>
                                    <td className={`px-3 py-3 text-sm font-black ${TREND_COLOR[d.trend]}`}>
                                        {TREND_ICON[d.trend]} {d.trend}
                                    </td>
                                </tr>
                            );
                        })}
                        {visible.length === 0 && (
                            <tr>
                                <td colSpan={10} className="px-6 py-12 text-center text-slate-400 text-sm font-semibold">
                                    No donors match your filters.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>

            {/* Pagination */}
            {totalPages > 1 && (
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[11px] text-slate-400 font-semibold">
                        {filtered.length} donors · page {page + 1} of {totalPages}
                    </span>
                    <div className="flex gap-2">
                        <button
                            disabled={page === 0}
                            onClick={() => setPage(p => p - 1)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                            ← Prev
                        </button>
                        <button
                            disabled={page === totalPages - 1}
                            onClick={() => setPage(p => p + 1)}
                            className="px-3 py-1.5 rounded-lg text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 disabled:opacity-40 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                            Next →
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Top-level tab export
// ---------------------------------------------------------------------------

interface GivingConsistencyTabProps {
    data: GivingConsistencyAnalytics;
}

export const GivingConsistencyTab: React.FC<GivingConsistencyTabProps> = ({ data }) => {
    const [donutView, setDonutView] = useState<'count' | 'amount'>('count');

    return (
        <div className="space-y-8 animate-in fade-in duration-500">
            {/* Header row */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                {/* Hero index card — spans 2 cols */}
                <ConsistencyIndexCard data={data} />

                {/* Segment donut — spans 2 cols */}
                <div className="col-span-1 md:col-span-2">
                    <SegmentDonut data={data} view={donutView} onViewChange={setDonutView} />
                </div>
            </div>

            {/* Trend line — full width */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                <ConsistencyTrendChart data={data} />
                {/* Segment summary cards — 2 cols */}
                <div className="col-span-1 md:col-span-2 flex flex-col justify-end">
                    <SegmentSummaryCards data={data} />
                </div>
            </div>

            {/* Donor table — full width */}
            <DonorConsistencyTable donors={data.donors} />
        </div>
    );
};
