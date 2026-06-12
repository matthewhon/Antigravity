import React, { useState, useMemo } from 'react';
import { DetailedDonation, PcoPerson } from '../types';
import { 
    startOfWeek, startOfYear, endOfYear,
    startOfMonth, endOfMonth, subMonths, startOfQuarter, endOfQuarter, subYears,
    format, isWithinInterval, parseISO, getYear, getQuarter
} from 'date-fns';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, LineChart, Line
} from 'recharts';

interface DonationReportProps {
    donations: DetailedDonation[];
    people: PcoPerson[];
}

type IntervalType = 'Weekly' | 'Monthly' | 'Quarterly' | 'YTD';
type SortField = 'totalAmount' | 'name' | 'lastGiftDate';
type SortDirection = 'asc' | 'desc';
type ReportTab = 'donors' | 'age_trends' | 'status_trends' | 'avg_giving' | 'giving_by_label';

interface FilterState {
    startDate: string;
    endDate: string;
    minAmount: string;
    maxAmount: string;
    interval: IntervalType;
    selectedLabel: string;
    selectedFund: string;
    selectedPaymentSource: string;
    timePeriod: string;
}

interface SortState {
    field: SortField;
    direction: SortDirection;
}

const TOOLTIP_STYLE = {
    borderRadius: '12px',
    border: 'none',
    backgroundColor: '#1e293b',
    color: '#fff',
    boxShadow: '0 4px 6px -1px rgba(0,0,0,0.1)',
};

// ── Age bucket config ──────────────────────────────────────────────────────────
const AGE_RANGES = [
    { label: 'Under 18', min: 0,   max: 17,  color: '#8b5cf6' },
    { label: '18–25',    min: 18,  max: 25,  color: '#6366f1' },
    { label: '26–35',    min: 26,  max: 35,  color: '#06b6d4' },
    { label: '36–50',    min: 36,  max: 50,  color: '#10b981' },
    { label: '51–65',    min: 51,  max: 65,  color: '#f59e0b' },
    { label: '65+',      min: 66,  max: 999, color: '#f43f5e' },
];
const AGE_UNKNOWN_COLOR = '#94a3b8';

// ── Status config ──────────────────────────────────────────────────────────────
const STATUSES = [
    { key: 'Active',      label: 'Active',       color: '#10b981' },
    { key: 'New',         label: 'New',           color: '#6366f1' },
    { key: 'Occasional',  label: 'Occasional',    color: '#f59e0b' },
    { key: 'Recovered',   label: 'Recovered',     color: '#06b6d4' },
    { key: 'Second Time', label: 'Second Time',   color: '#8b5cf6' },
];

// Classify a donor's status relative to a given "as-of" date using their full history.
// This mirrors the logic in analyticsService.ts / GivingView.tsx givingByStatusData.
const ONE_DAY_MS = 24 * 60 * 60 * 1000;
const LIFECYCLE = {
    newDonorDays:       30,
    activeWindowDays:   90,
    activeMinGifts:     2,
    occasionalWindowDays: 180,
    lapsedWindowDays:   365,
    recoveredGapDays:   180,
};

function classifyDonorStatus(allGifts: DetailedDonation[], asOf: Date): string | null {
    if (allGifts.length === 0) return null;
    const sorted = [...allGifts].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    const lastGiftDate = new Date(sorted[sorted.length - 1].date);
    const firstGiftDate = new Date(sorted[0].date);
    const daysSinceLast = (asOf.getTime() - lastGiftDate.getTime()) / ONE_DAY_MS;

    if (daysSinceLast > LIFECYCLE.lapsedWindowDays) return null;           // inactive — hide from totals
    if (daysSinceLast > LIFECYCLE.occasionalWindowDays) return null;       // lapsed    — hide

    const daysSinceFirst = (asOf.getTime() - firstGiftDate.getTime()) / ONE_DAY_MS;

    if (sorted.length === 1 && daysSinceFirst <= LIFECYCLE.newDonorDays) return 'New';
    if (sorted.length === 2 && daysSinceFirst <= LIFECYCLE.newDonorDays * 2) return 'Second Time';

    if (sorted.length > 1) {
        const prevGiftDate = new Date(sorted[sorted.length - 2].date);
        const gapDays = (lastGiftDate.getTime() - prevGiftDate.getTime()) / ONE_DAY_MS;
        if (gapDays > LIFECYCLE.recoveredGapDays) return 'Recovered';
    }

    const giftsInWindow = sorted.filter(g =>
        (asOf.getTime() - new Date(g.date).getTime()) / ONE_DAY_MS <= LIFECYCLE.activeWindowDays
    );
    if (daysSinceLast <= LIFECYCLE.activeWindowDays && giftsInWindow.length >= LIFECYCLE.activeMinGifts) {
        return 'Active';
    }
    return 'Occasional';
}

// ── Helper: build time-bucket keys ────────────────────────────────────────────
function getBucketKey(date: Date, interval: IntervalType): string {
    switch (interval) {
        case 'Weekly':    return format(startOfWeek(date), 'yyyy-MM-dd');
        case 'Monthly':   return format(date, 'MMM yyyy');
        case 'Quarterly': return `Q${getQuarter(date)} ${getYear(date)}`;
        case 'YTD':       return `${getYear(date)}`;
    }
}

function getBucketLabel(key: string, interval: IntervalType): string {
    if (interval === 'Weekly') {
        try { return format(parseISO(key), 'MMM d'); } catch { return key; }
    }
    return key;
}

// ── Main Component ─────────────────────────────────────────────────────────────
export const DonationReport: React.FC<DonationReportProps> = ({ donations, people }) => {
    const [activeTab, setActiveTab] = useState<ReportTab>('donors');
    const [filters, setFilters] = useState<FilterState>({
        startDate: format(startOfYear(new Date()), 'yyyy-MM-dd'),
        endDate:   format(new Date(getYear(new Date()), 11, 31), 'yyyy-MM-dd'),
        minAmount: '',
        maxAmount: '',
        interval:  'Monthly',
        selectedLabel: '',
        selectedFund: '',
        selectedPaymentSource: '',
        timePeriod: 'ytd',
    });

    const handleTimePeriodChange = (period: string) => {
        const now = new Date();
        let start = now;
        let end = now;
        
        switch (period) {
            case 'this_month':
                start = startOfMonth(now);
                end = endOfMonth(now);
                break;
            case 'last_month': {
                const lastMo = subMonths(now, 1);
                start = startOfMonth(lastMo);
                end = endOfMonth(lastMo);
                break;
            }
            case 'this_quarter':
                start = startOfQuarter(now);
                end = endOfQuarter(now);
                break;
            case 'ytd':
                start = startOfYear(now);
                end = endOfYear(now);
                break;
            case 'last_year': {
                const lastYr = subYears(now, 1);
                start = startOfYear(lastYr);
                end = endOfYear(lastYr);
                break;
            }
            default:
                break;
        }
        
        if (period !== 'custom') {
            setFilters(prev => ({
                ...prev,
                timePeriod: period,
                startDate: format(start, 'yyyy-MM-dd'),
                endDate: format(end, 'yyyy-MM-dd'),
                selectedFund: '',
                selectedPaymentSource: '',
                selectedLabel: '',
            }));
        } else {
            setFilters(prev => ({ ...prev, timePeriod: period, selectedFund: '', selectedPaymentSource: '', selectedLabel: '' }));
        }
    };
    const [sort, setSort] = useState<SortState>({ field: 'totalAmount', direction: 'desc' });

    const currentYear = new Date().getFullYear();

    // Build a stable people map
    const peopleMap = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);

    // Build all-time donor history map (for status classification)
    const donorAllHistory = useMemo(() => {
        const map = new Map<string, DetailedDonation[]>();
        donations.forEach(d => {
            if (!map.has(d.donorId)) map.set(d.donorId, []);
            map.get(d.donorId)!.push(d);
        });
        return map;
    }, [donations]);

    // Donations filtered by date only (used to derive available funds/labels for the period)
    const dateFilteredDonations = useMemo(() => {
        const start = parseISO(filters.startDate);
        const end   = parseISO(filters.endDate);
        end.setHours(23, 59, 59, 999);
        return donations.filter(d => isWithinInterval(parseISO(d.date), { start, end }));
    }, [donations, filters.startDate, filters.endDate]);

    // Available funds in the selected time period
    const availableFunds = useMemo(() => {
        const funds = new Set<string>();
        dateFilteredDonations.forEach(d => funds.add(d.fundName));
        return Array.from(funds).sort();
    }, [dateFilteredDonations]);

    // Available payment sources in the selected time period
    const availablePaymentSources = useMemo(() => {
        const sources = new Set<string>();
        dateFilteredDonations.forEach(d => {
            if (d.paymentSource) sources.add(d.paymentSource);
        });
        return Array.from(sources).sort();
    }, [dateFilteredDonations]);

    // Available labels in the selected time period (optionally scoped to selected fund)
    const availableLabels = useMemo(() => {
        const tags = new Set<string>();
        const source = filters.selectedFund
            ? dateFilteredDonations.filter(d => d.fundName === filters.selectedFund)
            : dateFilteredDonations;
        source.forEach(d => {
            if (d.labels) d.labels.forEach(l => tags.add(l));
        });
        return Array.from(tags).sort();
    }, [dateFilteredDonations, filters.selectedFund]);

    // 1a. Filter Donations by Date, Fund, Payment Source, and Label
    const filteredDonations = useMemo(() => {
        let filtered = dateFilteredDonations;
        if (filters.selectedFund) {
            filtered = filtered.filter(d => d.fundName === filters.selectedFund);
        }
        if (filters.selectedPaymentSource) {
            filtered = filtered.filter(d => d.paymentSource === filters.selectedPaymentSource);
        }
        if (filters.selectedLabel) {
            filtered = filtered.filter(d => d.labels?.includes(filters.selectedLabel));
        }
        return filtered;
    }, [dateFilteredDonations, filters.selectedFund, filters.selectedPaymentSource, filters.selectedLabel]);

    // 1b. Generate ordered bucket list
    const buckets = useMemo(() => {
        const start = parseISO(filters.startDate);
        const end   = parseISO(filters.endDate);
        end.setHours(23, 59, 59, 999);

        const keys: string[] = [];
        let current = new Date(start);

        while (current <= end) {
            const key = getBucketKey(current, filters.interval);
            if (!keys.includes(key)) keys.push(key);

            const next = new Date(current);
            switch (filters.interval) {
                case 'Weekly':    next.setDate(current.getDate() + 7); break;
                case 'Monthly':   next.setMonth(current.getMonth() + 1); next.setDate(1); break;
                case 'Quarterly': next.setMonth(current.getMonth() + 3); next.setDate(1); break;
                case 'YTD':       next.setFullYear(current.getFullYear() + 1); next.setMonth(0); next.setDate(1); break;
            }
            if (next <= current) break;
            current = next;
        }
        return keys;
    }, [filters.startDate, filters.endDate, filters.interval]);

    // 2. Aggregate donor table
    const aggregatedData = useMemo(() => {
        const donorMap = new Map<string, {
            id: string; name: string; email: string;
            totalAmount: number; lastGiftDate: string;
            buckets: Record<string, number>;
        }>();

        filteredDonations.forEach(d => {
            if (!donorMap.has(d.donorId)) {
                donorMap.set(d.donorId, {
                    id: d.donorId, name: d.donorName,
                    email: peopleMap.get(d.donorId)?.email || '',
                    totalAmount: 0, lastGiftDate: '', buckets: {},
                });
            }
            const rec = donorMap.get(d.donorId)!;
            rec.totalAmount += d.amount;
            if (!rec.lastGiftDate || new Date(d.date) > new Date(rec.lastGiftDate)) rec.lastGiftDate = d.date;
            const bk = getBucketKey(parseISO(d.date), filters.interval);
            rec.buckets[bk] = (rec.buckets[bk] || 0) + d.amount;
        });

        let results = Array.from(donorMap.values());
        if (filters.minAmount) results = results.filter(d => d.totalAmount >= parseFloat(filters.minAmount));
        if (filters.maxAmount) results = results.filter(d => d.totalAmount <= parseFloat(filters.maxAmount));

        results.sort((a, b) => {
            let va: any = a[sort.field], vb: any = b[sort.field];
            if (sort.field !== 'totalAmount') { va = va.toString().toLowerCase(); vb = vb.toString().toLowerCase(); }
            if (va < vb) return sort.direction === 'asc' ? -1 : 1;
            if (va > vb) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });
        return results;
    }, [filteredDonations, buckets, filters.interval, filters.minAmount, filters.maxAmount, sort, peopleMap]);

    // 3. Age Trends — per bucket, sum giving by age group
    const ageTrendData = useMemo(() => {
        return buckets.map(bk => {
            const row: Record<string, any> = { bucket: getBucketLabel(bk, filters.interval) };
            AGE_RANGES.forEach(r => { row[r.label] = 0; });
            row['Unknown Age'] = 0;

            filteredDonations.forEach(d => {
                if (getBucketKey(parseISO(d.date), filters.interval) !== bk) return;
                const person = peopleMap.get(d.donorId);
                if (!person?.birthdate) { row['Unknown Age'] += d.amount; return; }
                const birthYear = parseInt(person.birthdate.split('-')[0], 10);
                if (isNaN(birthYear)) { row['Unknown Age'] += d.amount; return; }
                const age = currentYear - birthYear;
                const bucket = AGE_RANGES.find(r => age >= r.min && age <= r.max);
                if (bucket) row[bucket.label] += d.amount;
                else row['Unknown Age'] += d.amount;
            });

            return row;
        });
    }, [buckets, filteredDonations, filters.interval, peopleMap, currentYear]);

    // 4. Status Trends — per bucket, sum giving by lifecycle status (classified as of bucket end)
    const statusTrendData = useMemo(() => {
        return buckets.map((bk, bkIdx) => {
            // Determine the "as-of" date for this bucket (end of the bucket window)
            const start = parseISO(filters.startDate);
            let asOfDate = parseISO(filters.startDate);
            switch (filters.interval) {
                case 'Weekly': {
                    const base = new Date(start);
                    base.setDate(base.getDate() + bkIdx * 7 + 6);
                    asOfDate = base;
                    break;
                }
                case 'Monthly': {
                    const base = new Date(start);
                    base.setMonth(base.getMonth() + bkIdx + 1);
                    base.setDate(0); // last day of that month
                    asOfDate = base;
                    break;
                }
                case 'Quarterly': {
                    const base = new Date(start);
                    base.setMonth(base.getMonth() + (bkIdx + 1) * 3);
                    base.setDate(0);
                    asOfDate = base;
                    break;
                }
                case 'YTD': {
                    const base = new Date(start);
                    base.setFullYear(base.getFullYear() + bkIdx + 1);
                    base.setDate(0);
                    asOfDate = base;
                    break;
                }
            }
            asOfDate.setHours(23, 59, 59, 999);

            const row: Record<string, any> = { bucket: getBucketLabel(bk, filters.interval) };
            STATUSES.forEach(s => { row[s.key] = 0; });

            filteredDonations.forEach(d => {
                if (getBucketKey(parseISO(d.date), filters.interval) !== bk) return;
                const allHistory = donorAllHistory.get(d.donorId) || [];
                const status = classifyDonorStatus(allHistory, asOfDate);
                if (status && row[status] !== undefined) row[status] += d.amount;
            });

            return row;
        });
    }, [buckets, filteredDonations, filters.interval, filters.startDate, donorAllHistory]);

    // 5b. Giving by Label — total given per label, broken down by fund
    const givingByLabelData = useMemo(() => {
        const COLORS = ['#10b981', '#f59e0b', '#06b6d4', '#f43f5e', '#8b5cf6', '#ec4899', '#14b8a6', '#6366f1'];

        const allLabelsSet = new Set<string>();
        filteredDonations.forEach(d => {
            if (d.labels) d.labels.forEach(l => allLabelsSet.add(l));
        });
        const allLabels = Array.from(allLabelsSet).sort();

        const labelData = allLabels.map((labelName, idx) => {
            const color = COLORS[idx % COLORS.length];

            const labelDonations = filteredDonations.filter(d => d.labels?.includes(labelName));
            const totalGiven = labelDonations.reduce((s, d) => s + d.amount, 0);

            const fundsMap = new Map<string, number>();
            labelDonations.forEach(d => {
                fundsMap.set(d.fundName, (fundsMap.get(d.fundName) || 0) + d.amount);
            });
            const funds = Array.from(fundsMap.entries())
                .map(([fundName, amount]) => ({ fundName, amount }))
                .sort((a, b) => b.amount - a.amount);

            return { labelName, color, totalGiven, funds };
        });

        const overallTotal = labelData.reduce((s, t) => s + t.totalGiven, 0);

        return { labelData, overallTotal };
    }, [filteredDonations]);

    // 5. Avg Giving by Fund — total given per fund ÷ weeks in period
    const avgGivingByQuarter = useMemo(() => {
        const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#f43f5e', '#8b5cf6', '#ec4899', '#14b8a6'];

        // Number of weeks in the selected date range
        const start = parseISO(filters.startDate);
        const end   = parseISO(filters.endDate);
        const daysDiff = Math.max((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24), 1);
        const totalWeeks = Math.max(daysDiff / 7, 1);

        // Split into two halves to compute trend (first half vs second half)
        const midPoint = new Date((start.getTime() + end.getTime()) / 2);

        const allFundNames = Array.from(new Set(filteredDonations.map(d => d.fundName))).sort();

        const fundData = allFundNames.map((fundName, idx) => {
            const color = COLORS[idx % COLORS.length];

            const fundDonations = filteredDonations.filter(d => d.fundName === fundName);
            const totalGiven = fundDonations.reduce((s, d) => s + d.amount, 0);
            const avgPerWeek = totalGiven / totalWeeks;

            // Trend: second half vs first half of the period
            const firstHalf  = fundDonations.filter(d => parseISO(d.date) <= midPoint).reduce((s, d) => s + d.amount, 0) / (totalWeeks / 2);
            const secondHalf = fundDonations.filter(d => parseISO(d.date) >  midPoint).reduce((s, d) => s + d.amount, 0) / (totalWeeks / 2);
            const trendPct   = firstHalf > 0 ? ((secondHalf - firstHalf) / firstHalf) * 100 : null;
            const trend: 'up' | 'down' | 'flat' =
                trendPct === null ? 'flat' : trendPct > 3 ? 'up' : trendPct < -3 ? 'down' : 'flat';

            return { fundName, color, totalGiven, avgPerWeek, trendPct, trend };
        });

        const overallAvgPerWeek = fundData.reduce((s, f) => s + f.avgPerWeek, 0);
        const overallTotal      = fundData.reduce((s, f) => s + f.totalGiven, 0);

        return { fundData, overallAvgPerWeek, overallTotal, totalWeeks };
    }, [filteredDonations, filters.startDate, filters.endDate]);

    // Donor concentration calculation for risk planning
    const donorConcentration = useMemo(() => {
        const total = filteredDonations.reduce((sum, d) => sum + d.amount, 0);

        if (total === 0) {
            return {
                total: 0,
                donorsCount: 0,
                top1: { sum: 0, pct: 0 },
                top2: { sum: 0, pct: 0 },
                top5: { sum: 0, pct: 0 },
                top10: { sum: 0, pct: 0 },
                segments: [],
            };
        }

        const donorMap = new Map<string, number>();
        filteredDonations.forEach(d => {
            donorMap.set(d.donorId, (donorMap.get(d.donorId) || 0) + d.amount);
        });

        const sortedAmounts = Array.from(donorMap.values()).sort((a, b) => b - a);
        const donorsCount = sortedAmounts.length;

        const top1Sum = sortedAmounts[0] || 0;
        const top2Sum = sortedAmounts.slice(0, 2).reduce((sum, v) => sum + v, 0);
        const top5Sum = sortedAmounts.slice(0, 5).reduce((sum, v) => sum + v, 0);
        const top10Sum = sortedAmounts.slice(0, 10).reduce((sum, v) => sum + v, 0);

        const seg1 = top1Sum;
        const seg2 = (sortedAmounts[1] || 0);
        const seg3 = sortedAmounts.slice(2, 5).reduce((sum, v) => sum + v, 0);
        const seg4 = sortedAmounts.slice(5, 10).reduce((sum, v) => sum + v, 0);
        const seg5 = sortedAmounts.slice(10).reduce((sum, v) => sum + v, 0);

        return {
            total,
            donorsCount,
            top1: { sum: top1Sum, pct: (top1Sum / total) * 100 },
            top2: { sum: top2Sum, pct: (top2Sum / total) * 100 },
            top5: { sum: top5Sum, pct: (top5Sum / total) * 100 },
            top10: { sum: top10Sum, pct: (top10Sum / total) * 100 },
            segments: [
                { label: 'Top Giver', sum: seg1, pct: (seg1 / total) * 100, color: '#4f46e5', class: 'bg-indigo-600' },
                { label: 'Giver #2', sum: seg2, pct: (seg2 / total) * 100, color: '#3b82f6', class: 'bg-blue-500' },
                { label: 'Givers 3-5', sum: seg3, pct: (seg3 / total) * 100, color: '#06b6d4', class: 'bg-cyan-500' },
                { label: 'Givers 6-10', sum: seg4, pct: (seg4 / total) * 100, color: '#10b981', class: 'bg-emerald-500' },
                { label: 'Other Givers', sum: seg5, pct: (seg5 / total) * 100, color: '#94a3b8', class: 'bg-slate-400 dark:bg-slate-500' },
            ].filter(seg => seg.sum > 0),
        };
    }, [filteredDonations]);

    // ── CSV Export ──────────────────────────────────────────────────────────────
    const handleExport = () => {
        const escapeCsv = (str: string) => {
            if (!str) return '""';
            return `"${String(str).replace(/"/g, '""')}"`;
        };

        let csv = "";
        let filename = "";

        if (activeTab === 'donors') {
            const header = ['Donor Name', 'Primary Email', 'Total Given', 'Last Gift Date', ...buckets];
            const rows = aggregatedData.map(d => [
                escapeCsv(d.name), escapeCsv(d.email),
                d.totalAmount.toFixed(2),
                d.lastGiftDate,
                ...buckets.map(b => (d.buckets[b] || 0).toFixed(2)),
            ].join(','));
            csv = [header.join(','), ...rows].join('\n');
            filename = `donor_report_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        } else if (activeTab === 'age_trends') {
            const header = ['Period', 'Under 18', '18-25', '26-35', '36-50', '51-65', '65+', 'Unknown Age'];
            const rows = ageTrendData.map(d => [
                escapeCsv(d.bucket),
                d['Under 18']?.toFixed(2) || '0.00',
                d['18–25']?.toFixed(2) || '0.00',
                d['26–35']?.toFixed(2) || '0.00',
                d['36–50']?.toFixed(2) || '0.00',
                d['51–65']?.toFixed(2) || '0.00',
                d['65+']?.toFixed(2) || '0.00',
                d['Unknown Age']?.toFixed(2) || '0.00'
            ].join(','));
            csv = [header.join(','), ...rows].join('\n');
            filename = `age_demographics_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        } else if (activeTab === 'status_trends') {
            const header = ['Period', 'Active', 'New', 'Occasional', 'Recovered', 'Second Time'];
            const rows = statusTrendData.map(d => [
                escapeCsv(d.bucket),
                d['Active']?.toFixed(2) || '0.00',
                d['New']?.toFixed(2) || '0.00',
                d['Occasional']?.toFixed(2) || '0.00',
                d['Recovered']?.toFixed(2) || '0.00',
                d['Second Time']?.toFixed(2) || '0.00'
            ].join(','));
            csv = [header.join(','), ...rows].join('\n');
            filename = `giving_by_status_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        } else if (activeTab === 'avg_giving') {
            const header = ['Fund Name', 'Total Given', 'Avg Per Week', 'Trend %', 'Trend'];
            const rows = avgGivingByQuarter.fundData.map(d => [
                escapeCsv(d.fundName),
                d.totalGiven.toFixed(2),
                d.avgPerWeek.toFixed(2),
                d.trendPct !== null ? d.trendPct.toFixed(2) : '',
                d.trend
            ].join(','));
            csv = [header.join(','), ...rows].join('\n');
            filename = `avg_giving_by_fund_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        } else if (activeTab === 'giving_by_label') {
            const allFunds = new Set<string>();
            givingByLabelData.labelData.forEach(d => {
                d.funds.forEach(f => allFunds.add(f.fundName));
            });
            const fundNames = Array.from(allFunds).sort();

            const header = ['Label', 'Total Given', ...fundNames.map(escapeCsv)];
            const rows = givingByLabelData.labelData.map(d => {
                const fundMap = new Map<string, number>(d.funds.map(f => [f.fundName, f.amount]));
                const fundAmounts = fundNames.map(fn => (fundMap.get(fn) || 0).toFixed(2));
                return [
                    escapeCsv(d.labelName),
                    d.totalGiven.toFixed(2),
                    ...fundAmounts
                ].join(',');
            });
            csv = [header.join(','), ...rows].join('\n');
            filename = `giving_by_label_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        }

        if (!csv) return;

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url  = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    const axisColor = '#94a3b8';

    // ── Rendering ───────────────────────────────────────────────────────────────
    return (
        <div className="space-y-6">

            {/* ── Controls ───────────────────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-wrap gap-4 items-end">
                {/* Shared filters for all tabs */}
                <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Time Period</label>
                    <select
                        aria-label="Time period"
                        value={filters.timePeriod}
                        onChange={(e) => handleTimePeriodChange(e.target.value)}
                        className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                    >
                        <option value="this_month">This Month</option>
                        <option value="last_month">Last Month</option>
                        <option value="this_quarter">This Quarter</option>
                        <option value="ytd">Year To Date</option>
                        <option value="last_year">Last Year</option>
                        <option value="custom">Custom Range</option>
                    </select>
                </div>

                {filters.timePeriod === 'custom' && (
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Date Range</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="date"
                                aria-label="Start date"
                                value={filters.startDate}
                                onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value, timePeriod: 'custom' }))}
                                className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-3 py-2 text-xs font-bold outline-none"
                            />
                            <span className="text-slate-300">-</span>
                            <input
                                type="date"
                                aria-label="End date"
                                value={filters.endDate}
                                onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value, timePeriod: 'custom' }))}
                                className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-3 py-2 text-xs font-bold outline-none"
                            />
                        </div>
                    </div>
                )}

                <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Fund</label>
                    <select
                        aria-label="Filter by Fund"
                        value={filters.selectedFund}
                        onChange={(e) => setFilters(prev => ({ ...prev, selectedFund: e.target.value }))}
                        className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 min-w-[120px]"
                    >
                        <option value="">All Funds</option>
                        {availableFunds.map(fund => (
                            <option key={fund} value={fund}>{fund}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Payment Source</label>
                    <select
                        aria-label="Filter by Payment Source"
                        value={filters.selectedPaymentSource}
                        onChange={(e) => setFilters(prev => ({ ...prev, selectedPaymentSource: e.target.value }))}
                        className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 min-w-[140px]"
                    >
                        <option value="">All Sources</option>
                        {availablePaymentSources.map(source => (
                            <option key={source} value={source}>{source}</option>
                        ))}
                    </select>
                </div>

                <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Label</label>
                    <select
                        aria-label="Filter by Label"
                        value={filters.selectedLabel}
                        onChange={(e) => setFilters(prev => ({ ...prev, selectedLabel: e.target.value }))}
                        className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 min-w-[120px]"
                    >
                        <option value="">All Labels</option>
                        {availableLabels.map(tag => (
                            <option key={tag} value={tag}>{tag}</option>
                        ))}
                    </select>
                </div>

                {activeTab !== 'giving_by_label' && (
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Interval</label>
                        <select
                            aria-label="Reporting interval"
                            value={filters.interval}
                            onChange={(e) => setFilters(prev => ({ ...prev, interval: e.target.value as IntervalType }))}
                            className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="Weekly">Weekly</option>
                            <option value="Monthly">Monthly</option>
                            <option value="Quarterly">Quarterly</option>
                            <option value="YTD">Yearly (YTD)</option>
                        </select>
                    </div>
                )}

                {activeTab === 'donors' && (
                    <div>
                        <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Total Given ($)</label>
                        <div className="flex items-center gap-2">
                            <input
                                type="number"
                                placeholder="Min"
                                value={filters.minAmount}
                                onChange={(e) => setFilters(prev => ({ ...prev, minAmount: e.target.value }))}
                                className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-3 py-2 text-xs font-bold outline-none w-20"
                            />
                            <span className="text-slate-300">-</span>
                            <input
                                type="number"
                                placeholder="Max"
                                value={filters.maxAmount}
                                onChange={(e) => setFilters(prev => ({ ...prev, maxAmount: e.target.value }))}
                                className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-3 py-2 text-xs font-bold outline-none w-20"
                            />
                        </div>
                    </div>
                )}

                <div className="ml-auto">
                    <button
                        onClick={handleExport}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold text-xs uppercase tracking-widest transition-colors flex items-center gap-2"
                    >
                        <span>Download CSV</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </button>
                </div>
            </div>

            {/* ── Tab Bar ────────────────────────────────────────────────────── */}
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-2xl w-fit border border-slate-200 dark:border-slate-700">
                {([
                    { id: 'donors',        label: '👤 Donor Report' },
                    { id: 'age_trends',    label: '🎂 Age Demographics' },
                    { id: 'status_trends', label: '🏷️ Giving By Status' },
                    { id: 'avg_giving',    label: '📊 Avg Giving by Fund' },
                    { id: 'giving_by_label', label: '🏷️ Giving by Label' },
                ] as { id: ReportTab; label: string }[]).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                            activeTab === tab.id
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
                        }`}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* ── Donor Concentration & Risk Planning Panel ──────────────────── */}
            {activeTab === 'donors' && (
                <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm space-y-6">
                    <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                        <div>
                            <h3 className="text-lg font-black text-slate-900 dark:text-white">Donor Concentration & Risk Planning</h3>
                            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                                Understand giving distribution and the financial impact of losing key contributors
                            </p>
                        </div>
                        <div className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-3 py-1.5 rounded-xl text-xs font-bold w-fit">
                            Total: <span className="font-black text-indigo-600 dark:text-indigo-400">${donorConcentration.total.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span> ({donorConcentration.donorsCount} Donors)
                        </div>
                    </div>

                    {donorConcentration.total === 0 ? (
                        <div className="flex flex-col items-center justify-center py-6 text-center gap-2">
                            <span className="text-3xl opacity-20">📊</span>
                            <p className="text-xs font-bold text-slate-400">No giving data available for the selected filters</p>
                        </div>
                    ) : (
                        <>
                            {/* Metric Cards Grid */}
                            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                                {[
                                    { title: 'Top Giver', data: donorConcentration.top1, colorCls: 'bg-indigo-600', textCls: 'text-indigo-600 dark:text-indigo-400' },
                                    { title: 'Top 2 Givers', data: donorConcentration.top2, colorCls: 'bg-blue-500', textCls: 'text-blue-500 dark:text-blue-400' },
                                    { title: 'Top 5 Givers', data: donorConcentration.top5, colorCls: 'bg-cyan-500', textCls: 'text-cyan-500 dark:text-cyan-400' },
                                    { title: 'Top 10 Givers', data: donorConcentration.top10, colorCls: 'bg-emerald-500', textCls: 'text-emerald-500 dark:text-emerald-400' },
                                ].map((card, i) => (
                                    <div key={i} className="p-5 rounded-2xl bg-slate-50/60 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/80 flex flex-col justify-between space-y-3">
                                        <div>
                                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">{card.title}</span>
                                            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono">
                                                ${card.data.sum.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
                                            </p>
                                        </div>
                                        <div className="space-y-1.5">
                                            <div className="flex items-center justify-between text-[11px] font-bold">
                                                <span className="text-slate-400 dark:text-slate-500">Share of Total</span>
                                                <span className={card.textCls}>{card.data.pct.toFixed(1)}%</span>
                                            </div>
                                            <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div className={`h-full ${card.colorCls} rounded-full`} style={{ width: `${card.data.pct}%` }} />
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>

                            {/* Cumulative Distribution Stacked Bar */}
                            <div className="space-y-3 pt-2">
                                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">Cumulative Distribution Bar</span>
                                <div className="h-4 flex rounded-full overflow-hidden bg-slate-100 dark:bg-slate-700/60">
                                    {donorConcentration.segments.map((seg, i) => (
                                        <div
                                            key={i}
                                            className={`${seg.class} h-full relative transition-all duration-300 first:rounded-l-full last:rounded-r-full group`}
                                            style={{ width: `${seg.pct}%` }}
                                            title={`${seg.label}: $${seg.sum.toLocaleString()} (${seg.pct.toFixed(1)}%)`}
                                        />
                                    ))}
                                </div>
                                {/* Legend */}
                                <div className="flex flex-wrap gap-x-6 gap-y-2 pt-1">
                                    {donorConcentration.segments.map((seg, i) => (
                                        <div key={i} className="flex items-center gap-2">
                                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: seg.color }} />
                                            <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                                {seg.label}
                                                <span className="text-slate-400 dark:text-slate-500 font-medium ml-1">
                                                    (${seg.sum.toLocaleString(undefined, { maximumFractionDigits: 0 })} · {seg.pct.toFixed(1)}%)
                                                </span>
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Risk Advisory Callout */}
                            {(() => {
                                const isHighConcentration = donorConcentration.top10.pct > 50;
                                return isHighConcentration ? (
                                    <div className="p-4 rounded-2xl bg-amber-50 dark:bg-amber-955/20 border border-amber-100 dark:border-amber-900/30 flex items-start gap-3">
                                        <span className="text-base">⚠️</span>
                                        <div className="space-y-1">
                                            <p className="text-xs font-black text-amber-800 dark:text-amber-400 uppercase tracking-wider">High Dependency Risk</p>
                                            <p className="text-xs text-amber-700 dark:text-amber-300/80 leading-relaxed font-medium">
                                                The top 10 givers contribute <strong className="text-amber-900 dark:text-amber-300">{donorConcentration.top10.pct.toFixed(1)}%</strong> of your total giving (${donorConcentration.top10.sum.toLocaleString(undefined, { maximumFractionDigits: 0 })}). Your organization is highly sensitive to the loss or reduction of any of these top contributors. Consider strategies to diversify and expand your active donor base to mitigate this dependency risk.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-955/20 border border-emerald-100 dark:border-emerald-900/30 flex items-start gap-3">
                                        <span className="text-base">✅</span>
                                        <div className="space-y-1">
                                            <p className="text-xs font-black text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">Healthy Giving Distribution</p>
                                            <p className="text-xs text-emerald-700 dark:text-emerald-300/80 leading-relaxed font-medium">
                                                The top 10 givers contribute <strong className="text-emerald-900 dark:text-emerald-300">{donorConcentration.top10.pct.toFixed(1)}%</strong> of your total giving. A well-distributed donor base ensures that financial viability is not overly dependent on a few key contributors, reducing your overall organizational risk.
                                            </p>
                                        </div>
                                    </div>
                                );
                            })()}
                        </>
                    )}
                </div>
            )}

            {/* ── Donor Table ────────────────────────────────────────────────── */}
            {activeTab === 'donors' && (
                <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                    <div className="overflow-x-auto">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer hover:text-indigo-500"
                                        onClick={() => setSort({ field: 'name', direction: sort.field === 'name' && sort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        Donor Name {sort.field === 'name' && (sort.direction === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right cursor-pointer hover:text-indigo-500"
                                        onClick={() => setSort({ field: 'totalAmount', direction: sort.field === 'totalAmount' && sort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        Total Given {sort.field === 'totalAmount' && (sort.direction === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right cursor-pointer hover:text-indigo-500"
                                        onClick={() => setSort({ field: 'lastGiftDate', direction: sort.field === 'lastGiftDate' && sort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        Last Gift {sort.field === 'lastGiftDate' && (sort.direction === 'asc' ? '↑' : '↓')}
                                    </th>
                                    {buckets.map(b => (
                                        <th key={b} className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right whitespace-nowrap">{b}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                {aggregatedData.map(donor => (
                                    <tr key={donor.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                        <td className="p-4 text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">{donor.name}</td>
                                        <td className="p-4 text-xs font-bold text-slate-900 dark:text-white text-right font-mono">
                                            ${donor.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-4 text-xs text-slate-500 dark:text-slate-400 text-right font-mono">
                                            {donor.lastGiftDate ? format(parseISO(donor.lastGiftDate), 'MMM d, yyyy') : '-'}
                                        </td>
                                        {buckets.map(b => (
                                            <td key={b} className="p-4 text-xs text-slate-500 dark:text-slate-400 text-right font-mono">
                                                {donor.buckets[b] ? `$${donor.buckets[b].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
                                            </td>
                                        ))}
                                    </tr>
                                ))}
                                {aggregatedData.length === 0 && (
                                    <tr>
                                        <td colSpan={3 + buckets.length} className="p-8 text-center text-slate-400 text-xs italic">
                                            No donations found matching the selected criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Age Demographics Over Time ─────────────────────────────────── */}
            {activeTab === 'age_trends' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm p-8">
                        <div className="mb-6">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white">Giving by Age Group Over Time</h3>
                            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                                Total given per age demographic · {filters.interval} buckets
                            </p>
                        </div>

                        {ageTrendData.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                                <span className="text-4xl opacity-20">🎂</span>
                                <p className="text-xs font-bold text-slate-400">No data in selected range</p>
                            </div>
                        ) : (
                            <>
                                <div className="h-72">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                        <BarChart data={ageTrendData} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="bucket" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                            <YAxis
                                                axisLine={false} tickLine={false}
                                                tick={{ fontSize: 9, fill: axisColor }}
                                                tickFormatter={(v: number) => `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                                            />
                                            <Tooltip
                                                contentStyle={TOOLTIP_STYLE}
                                                itemStyle={{ color: '#fff' }}
                                                cursor={{ fill: '#f8fafc' }}
                                                formatter={(value: number, name: string) => [`$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, name]}
                                            />
                                            <Legend verticalAlign="top" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 700, paddingBottom: '16px' }} />
                                            {AGE_RANGES.map(r => (
                                                <Bar key={r.label} dataKey={r.label} stackId="age" fill={r.color} radius={AGE_RANGES.indexOf(r) === AGE_RANGES.length - 1 ? [4,4,0,0] : [0,0,0,0]} />
                                            ))}
                                            <Bar dataKey="Unknown Age" stackId="age" fill={AGE_UNKNOWN_COLOR} radius={[4,4,0,0]} />
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Summary table */}
                                <div className="mt-8 overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-slate-100 dark:border-slate-700">
                                                <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Age Group</th>
                                                {buckets.map(b => (
                                                    <th key={b} className="pb-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right whitespace-nowrap">{b}</th>
                                                ))}
                                                <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-emerald-500 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                            {[...AGE_RANGES.map(r => ({ label: r.label, color: r.color })), { label: 'Unknown Age', color: AGE_UNKNOWN_COLOR }].map(({ label, color }) => {
                                                const rowTotal = ageTrendData.reduce((s, row) => s + (row[label] || 0), 0);
                                                if (rowTotal === 0) return null;
                                                return (
                                                    <tr key={label} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                        <td className="py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                                            <span className="report-dot" style={{ '--dot-color': color } as React.CSSProperties} />
                                                            {label}
                                                        </td>
                                                        {buckets.map(b => {
                                                            const val = ageTrendData.find(row => row.bucket === getBucketLabel(b, filters.interval))?.[label] || 0;
                                                            return (
                                                                <td key={b} className="py-2.5 text-xs font-mono text-slate-500 dark:text-slate-400 text-right">
                                                                    {val > 0 ? `$${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="py-2.5 text-xs font-black text-emerald-600 dark:text-emerald-400 text-right font-mono">
                                                            ${rowTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* ── Giving By Status Over Time ─────────────────────────────────── */}
            {activeTab === 'status_trends' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm p-8">
                        <div className="mb-6">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white">Giving by Donor Status Over Time</h3>
                            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                                Total given per lifecycle status · {filters.interval} buckets
                            </p>
                        </div>

                        {statusTrendData.length === 0 ? (
                            <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                                <span className="text-4xl opacity-20">🏷️</span>
                                <p className="text-xs font-bold text-slate-400">No data in selected range</p>
                            </div>
                        ) : (
                            <>
                                {/* Stacked bar chart */}
                                <div className="h-72">
                                    <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                        <BarChart data={statusTrendData} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
                                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                            <XAxis dataKey="bucket" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                            <YAxis
                                                axisLine={false} tickLine={false}
                                                tick={{ fontSize: 9, fill: axisColor }}
                                                tickFormatter={(v: number) => `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                                            />
                                            <Tooltip
                                                contentStyle={TOOLTIP_STYLE}
                                                itemStyle={{ color: '#fff' }}
                                                cursor={{ fill: '#f8fafc' }}
                                                formatter={(value: number, name: string) => [`$${value.toLocaleString(undefined, { maximumFractionDigits: 0 })}`, name]}
                                            />
                                            <Legend verticalAlign="top" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 700, paddingBottom: '16px' }} />
                                            {STATUSES.map((s, i) => (
                                                <Bar key={s.key} dataKey={s.key} name={s.label} stackId="status" fill={s.color}
                                                    radius={i === STATUSES.length - 1 ? [4,4,0,0] : [0,0,0,0]} />
                                            ))}
                                        </BarChart>
                                    </ResponsiveContainer>
                                </div>

                                {/* Trend lines (% share) */}
                                <div className="mt-8">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Share of Giving (%) Over Time</p>
                                    <div className="h-48">
                                        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                            <LineChart
                                                data={statusTrendData.map(row => {
                                                    const total = STATUSES.reduce((s, st) => s + (row[st.key] || 0), 0);
                                                    const out: Record<string, any> = { bucket: row.bucket };
                                                    STATUSES.forEach(st => {
                                                        out[st.key] = total > 0 ? Math.round(((row[st.key] || 0) / total) * 100) : 0;
                                                    });
                                                    return out;
                                                })}
                                                margin={{ left: 8, right: 8, top: 4, bottom: 4 }}
                                            >
                                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                                <XAxis dataKey="bucket" axisLine={false} tickLine={false} tick={{ fontSize: 10, fill: axisColor }} />
                                                <YAxis axisLine={false} tickLine={false} tick={{ fontSize: 9, fill: axisColor }} tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
                                                <Tooltip
                                                    contentStyle={TOOLTIP_STYLE}
                                                    itemStyle={{ color: '#fff' }}
                                                    formatter={(value: number, name: string) => [`${value}%`, name]}
                                                />
                                                {STATUSES.map(s => (
                                                    <Line key={s.key} type="monotone" dataKey={s.key} name={s.label} stroke={s.color} strokeWidth={2.5} dot={{ r: 3 }} activeDot={{ r: 5 }} />
                                                ))}
                                            </LineChart>
                                        </ResponsiveContainer>
                                    </div>
                                </div>

                                {/* Summary table */}
                                <div className="mt-8 overflow-x-auto">
                                    <table className="w-full text-left border-collapse">
                                        <thead>
                                            <tr className="border-b border-slate-100 dark:border-slate-700">
                                                <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-slate-400">Status</th>
                                                {buckets.map(b => (
                                                    <th key={b} className="pb-3 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right whitespace-nowrap">{b}</th>
                                                ))}
                                                <th className="pb-3 text-[10px] font-black uppercase tracking-widest text-emerald-500 text-right">Total</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                            {STATUSES.map(s => {
                                                const rowTotal = statusTrendData.reduce((sum, row) => sum + (row[s.key] || 0), 0);
                                                if (rowTotal === 0) return null;
                                                return (
                                                    <tr key={s.key} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                        <td className="py-2.5 text-xs font-bold text-slate-700 dark:text-slate-300 flex items-center gap-2">
                                                            <span className="report-dot" style={{ '--dot-color': s.color } as React.CSSProperties} />
                                                            {s.label}
                                                        </td>
                                                        {buckets.map(b => {
                                                            const val = statusTrendData.find(row => row.bucket === getBucketLabel(b, filters.interval))?.[s.key] || 0;
                                                            return (
                                                                <td key={b} className="py-2.5 text-xs font-mono text-slate-500 dark:text-slate-400 text-right">
                                                                    {val > 0 ? `$${val.toLocaleString(undefined, { maximumFractionDigits: 0 })}` : '—'}
                                                                </td>
                                                            );
                                                        })}
                                                        <td className="py-2.5 text-xs font-black text-emerald-600 dark:text-emerald-400 text-right font-mono">
                                                            ${rowTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                        </td>
                                                    </tr>
                                                );
                                            })}
                                        </tbody>
                                    </table>
                                </div>
                            </>
                        )}
                    </div>
                </div>
            )}
            {/* ── Average Giving by Fund ─────────────────────────────── */}
            {activeTab === 'avg_giving' && (() => {
                const { fundData, overallAvgPerWeek, overallTotal, totalWeeks } = avgGivingByQuarter;
                const hasFunds = fundData.length > 0;

                const trendIcon = (t: 'up' | 'down' | 'flat') => t === 'up' ? '↑' : t === 'down' ? '↓' : '→';
                const trendCls  = (t: 'up' | 'down' | 'flat') =>
                    t === 'up'   ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-400'
                    : t === 'down' ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-400'
                    : 'bg-slate-100 text-slate-500 dark:bg-slate-700 dark:text-slate-400';

                return (
                    <div className="space-y-6">
                        <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm p-8">
                            {/* Header */}
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
                                <div>
                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">Average Giving by Fund</h3>
                                    <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                                        Avg weekly giving per fund · {Math.round(totalWeeks)} weeks
                                    </p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{filters.startDate} – {filters.endDate}</p>
                                </div>
                                {hasFunds && (
                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Avg / Week (All Funds)</p>
                                        <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
                                            ${overallAvgPerWeek.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                        </p>
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                            ${overallTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })} total
                                        </p>
                                    </div>
                                )}
                            </div>

                            {!hasFunds ? (
                                <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                                    <span className="text-4xl opacity-20">📊</span>
                                    <p className="text-xs font-bold text-slate-400">No giving data in selected range</p>
                                    <p className="text-[10px] text-slate-400">Adjust the date range filter above.</p>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                        Avg / Week by Fund — {filters.startDate} to {filters.endDate}
                                    </p>
                                    {fundData
                                        .slice()
                                        .sort((a, b) => b.avgPerWeek - a.avgPerWeek)
                                        .map(f => {
                                            const maxAvg = Math.max(...fundData.map(d => d.avgPerWeek), 1);
                                            const barPct = (f.avgPerWeek / maxAvg) * 100;
                                            return (
                                                <div key={f.fundName} className="space-y-2">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="report-dot" style={{ '--dot-color': f.color } as React.CSSProperties} />
                                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">{f.fundName}</span>
                                                        </div>
                                                        <div className="flex items-center gap-3 flex-shrink-0">
                                                            <div className="text-right">
                                                                <span className="text-sm font-black text-slate-900 dark:text-white font-mono">
                                                                    ${f.avgPerWeek.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                                    <span className="text-xs font-semibold text-slate-400">/wk</span>
                                                                </span>
                                                                <p className="text-[9px] text-slate-400 dark:text-slate-500 text-right">
                                                                    ${f.totalGiven.toLocaleString(undefined, { maximumFractionDigits: 0 })} total
                                                                </p>
                                                            </div>
                                                            <span className={`inline-flex items-center gap-0.5 text-xs font-black px-2.5 py-1 rounded-full ${trendCls(f.trend)}`}>
                                                                {trendIcon(f.trend)}
                                                                {f.trendPct !== null && Math.abs(f.trendPct) >= 1
                                                                    ? ` ${Math.abs(Math.round(f.trendPct))}%`
                                                                    : ''}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="relative h-2.5 bg-slate-100 dark:bg-slate-700/60 rounded-full overflow-hidden">
                                                        <div
                                                            className="gv-bar-fill"
                                                            style={{ '--bar-w': `${barPct}%`, '--bar-color': f.color, '--bar-opacity': '0.85' } as React.CSSProperties}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}
            {/* ── Giving by Label ─────────────────────────────── */}
            {activeTab === 'giving_by_label' && (() => {
                const { labelData, overallTotal } = givingByLabelData;
                const hasLabels = labelData.length > 0;

                return (
                    <div className="space-y-6">
                        <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm p-8">
                            {/* Header */}
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4 mb-8">
                                <div>
                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">Giving by Label</h3>
                                    <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mt-1">
                                        Total giving per label
                                    </p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{filters.startDate} – {filters.endDate}</p>
                                </div>
                                {hasLabels && (
                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Total Given</p>
                                        <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400">
                                            ${overallTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                    </div>
                                )}
                            </div>

                            {!hasLabels ? (
                                <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                                    <span className="text-4xl opacity-20">🏷️</span>
                                    <p className="text-xs font-bold text-slate-400">No labels found in selected range</p>
                                    <p className="text-[10px] text-slate-400">Only donations with labels will appear here.</p>
                                </div>
                            ) : (
                                <div className="space-y-6">
                                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">
                                        Total Given by Label — {filters.startDate} to {filters.endDate}
                                    </p>
                                    {labelData
                                        .slice()
                                        .sort((a, b) => b.totalGiven - a.totalGiven)
                                        .map(t => {
                                            const maxTotal = Math.max(...labelData.map(d => d.totalGiven), 1);
                                            const barPct = (t.totalGiven / maxTotal) * 100;
                                            return (
                                                <div key={t.labelName} className="space-y-3">
                                                    <div className="flex items-center justify-between gap-3">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="report-dot" style={{ '--dot-color': t.color } as React.CSSProperties} />
                                                            <span className="text-sm font-bold text-slate-700 dark:text-slate-300 truncate">{t.labelName}</span>
                                                        </div>
                                                        <div className="flex items-center gap-3 flex-shrink-0">
                                                            <span className="text-sm font-black text-slate-900 dark:text-white font-mono">
                                                                ${t.totalGiven.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="relative h-2.5 bg-slate-100 dark:bg-slate-700/60 rounded-full overflow-hidden">
                                                        <div
                                                            className="gv-bar-fill"
                                                            style={{ '--bar-w': `${barPct}%`, '--bar-color': t.color, '--bar-opacity': '0.85' } as React.CSSProperties}
                                                        />
                                                    </div>
                                                    {t.funds.length > 0 && (
                                                        <div className="pl-6 pt-1">
                                                            <table className="w-full text-left text-xs">
                                                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                                                    {t.funds.map(f => (
                                                                        <tr key={f.fundName}>
                                                                            <td className="py-1 text-slate-500 dark:text-slate-400">{f.fundName}</td>
                                                                            <td className="py-1 text-right text-slate-600 dark:text-slate-300 font-mono">
                                                                                ${f.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                            </td>
                                                                        </tr>
                                                                    ))}
                                                                </tbody>
                                                            </table>
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                </div>
                            )}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};
