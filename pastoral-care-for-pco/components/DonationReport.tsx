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
type ReportTab = 'donors' | 'giving_by_fund' | 'age_trends' | 'status_trends' | 'avg_giving' | 'giving_by_label' | 'fund_label_pivot' | 'lapsed_donors';
type LapsedSortField = 'priorTotal' | 'name' | 'giftCount' | 'lastGiftDate' | 'lifetimeTotal';

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
    const [pivotPrimary, setPivotPrimary] = useState<'fund' | 'label'>('fund');
    const [pivotViewMode, setPivotViewMode] = useState<'nested' | 'matrix'>('nested');
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

    // Available donation years for prior vs current year comparison
    const availableYears = useMemo(() => {
        const years = new Set<number>();
        years.add(currentYear);
        years.add(currentYear - 1);
        donations.forEach(d => {
            if (d.date) {
                const yr = parseInt(d.date.slice(0, 4), 10);
                if (!isNaN(yr) && yr > 1900 && yr < 2100) years.add(yr);
            }
        });
        return Array.from(years).sort((a, b) => b - a);
    }, [donations, currentYear]);

    // State for Prior Year Donors Not Given (LYBUNT) report
    const [priorYear, setPriorYear] = useState<number>(() => currentYear - 1);
    const [comparisonYear, setComparisonYear] = useState<number>(() => currentYear);
    const [lapsedFundFilter, setLapsedFundFilter] = useState<string>('');
    const [lapsedMinAmount, setLapsedMinAmount] = useState<string>('');
    const [lapsedSearchQuery, setLapsedSearchQuery] = useState<string>('');
    const [lapsedTierFilter, setLapsedTierFilter] = useState<string>('all');
    const [lapsedRecurringOnly, setLapsedRecurringOnly] = useState<boolean>(false);
    const [lapsedSort, setLapsedSort] = useState<{ field: LapsedSortField; direction: SortDirection }>({
        field: 'priorTotal',
        direction: 'desc'
    });
    const [copiedEmails, setCopiedEmails] = useState<boolean>(false);

    const handleCopyLapsedEmails = (emails: string[]) => {
        if (!emails.length) return;
        navigator.clipboard.writeText(emails.join(', '));
        setCopiedEmails(true);
        setTimeout(() => setCopiedEmails(false), 2500);
    };

    const handleOpenPersonProfile = (personId: string) => {
        window.dispatchEvent(new CustomEvent('openPersonProfile', { detail: personId }));
    };

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

    // 5b. Giving by Fund — total given, donor count, tx count, avg gift, % share, and bucket breakdown per fund
    const givingByFundData = useMemo(() => {
        const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#f43f5e', '#ec4899', '#14b8a6', '#3b82f6', '#10b981'];

        const overallTotal = filteredDonations.reduce((s, d) => s + d.amount, 0);
        const allFundNames = Array.from(new Set(filteredDonations.map(d => d.fundName))).sort();

        const fundData = allFundNames.map((fundName, idx) => {
            const color = COLORS[idx % COLORS.length];

            const fundDonations = filteredDonations.filter(d => d.fundName === fundName);
            const totalGiven = fundDonations.reduce((s, d) => s + d.amount, 0);
            const donorCount = new Set(fundDonations.map(d => d.donorId)).size;
            const txCount = fundDonations.length;
            const avgGift = txCount > 0 ? totalGiven / txCount : 0;
            const pctOfTotal = overallTotal > 0 ? (totalGiven / overallTotal) * 100 : 0;

            const bucketTotals: Record<string, number> = {};
            buckets.forEach((b: string) => { bucketTotals[b] = 0; });
            fundDonations.forEach(d => {
                const bkKey = getBucketKey(parseISO(d.date), filters.interval);
                if (bucketTotals[bkKey] !== undefined) {
                    bucketTotals[bkKey] += d.amount;
                }
            });

            return {
                fundName,
                color,
                totalGiven,
                donorCount,
                txCount,
                avgGift,
                pctOfTotal,
                bucketTotals,
            };
        }).sort((a, b) => b.totalGiven - a.totalGiven);

        // Chart data for buckets across funds
        const chartData = buckets.map((bk: any) => {
            const row: Record<string, any> = { bucket: getBucketLabel(bk, filters.interval) };
            fundData.forEach(f => {
                row[f.fundName as string] = f.bucketTotals[bk as string] || 0;
            });
            return row;
        });

        return { fundData, overallTotal, chartData };
    }, [filteredDonations, buckets, filters.interval]);

    // 7. Fund & Label Pivot — Cross-tabulation & bi-directional mapping between funds and labels
    const fundLabelPivotData = useMemo(() => {
        const COLORS = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#f43f5e', '#ec4899', '#14b8a6', '#3b82f6', '#10b981'];

        const overallTotal = filteredDonations.reduce((s, d) => s + d.amount, 0);

        // Collect all distinct fund names
        const fundsList = Array.from(new Set(filteredDonations.map(d => d.fundName || 'General'))).sort();

        // Collect all distinct labels (including '(Unlabeled)' if any donation has no labels)
        const labelsSet = new Set<string>();
        let hasUnlabeled = false;
        filteredDonations.forEach(d => {
            if (d.labels && d.labels.length > 0) {
                d.labels.forEach(l => labelsSet.add(l));
            } else {
                hasUnlabeled = true;
            }
        });
        const labelsList = Array.from(labelsSet).sort();
        if (hasUnlabeled) {
            labelsList.push('(Unlabeled)');
        }

        // Matrix mapping: [fundName][labelName] -> { amount, txCount, givers: Set<string> }
        const matrixMap = new Map<string, Map<string, { amount: number; txCount: number; givers: Set<string> }>>();
        
        fundsList.forEach((f: string) => {
            const rowMap = new Map<string, { amount: number; txCount: number; givers: Set<string> }>();
            labelsList.forEach((l: string) => {
                rowMap.set(l, { amount: 0, txCount: 0, givers: new Set() });
            });
            matrixMap.set(f, rowMap);
        });

        filteredDonations.forEach(d => {
            const fName = d.fundName || 'General';
            const tags = d.labels && d.labels.length > 0 ? d.labels : ['(Unlabeled)'];
            
            tags.forEach((tag: string) => {
                const cell = matrixMap.get(fName)?.get(tag);
                if (cell) {
                    cell.amount += d.amount;
                    cell.txCount += 1;
                    if (d.donorId) cell.givers.add(d.donorId);
                }
            });
        });

        // 1. Grouped by Fund (Fund -> Labels)
        const byFund = fundsList.map((fundName: string, idx: number) => {
            const color = COLORS[idx % COLORS.length];
            const fundDonations = filteredDonations.filter(d => (d.fundName || 'General') === fundName);
            const totalGiven = fundDonations.reduce((s, d) => s + d.amount, 0);
            const txCount = fundDonations.length;
            const donorCount = new Set(fundDonations.map(d => d.donorId)).size;
            const pctOfTotal = overallTotal > 0 ? (totalGiven / overallTotal) * 100 : 0;

            const labelBreakdown = labelsList.map((labelName: string) => {
                const cell = matrixMap.get(fundName)?.get(labelName);
                const amount = cell ? cell.amount : 0;
                const cellTx = cell ? cell.txCount : 0;
                const cellGivers = cell ? cell.givers.size : 0;
                const pctOfFund = totalGiven > 0 ? (amount / totalGiven) * 100 : 0;
                return { labelName, amount, txCount: cellTx, giversCount: cellGivers, pctOfFund };
            }).filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount);

            return { fundName, color, totalGiven, txCount, donorCount, pctOfTotal, labelBreakdown };
        }).sort((a, b) => b.totalGiven - a.totalGiven);

        // 2. Grouped by Label (Label -> Funds)
        const byLabel = labelsList.map((labelName: string, idx: number) => {
            const color = COLORS[idx % COLORS.length];
            let labelDonations = filteredDonations;
            if (labelName === '(Unlabeled)') {
                labelDonations = filteredDonations.filter(d => !d.labels || d.labels.length === 0);
            } else {
                labelDonations = filteredDonations.filter(d => d.labels?.includes(labelName));
            }

            const totalGiven = labelDonations.reduce((s, d) => s + d.amount, 0);
            const txCount = labelDonations.length;
            const donorCount = new Set(labelDonations.map(d => d.donorId)).size;
            const pctOfTotal = overallTotal > 0 ? (totalGiven / overallTotal) * 100 : 0;

            const fundBreakdown = fundsList.map((fundName: string) => {
                const cell = matrixMap.get(fundName)?.get(labelName);
                const amount = cell ? cell.amount : 0;
                const cellTx = cell ? cell.txCount : 0;
                const cellGivers = cell ? cell.givers.size : 0;
                const pctOfLabel = totalGiven > 0 ? (amount / totalGiven) * 100 : 0;
                return { fundName, amount, txCount: cellTx, giversCount: cellGivers, pctOfLabel };
            }).filter(item => item.amount > 0).sort((a, b) => b.amount - a.amount);

            return { labelName, color, totalGiven, txCount, donorCount, pctOfTotal, fundBreakdown };
        }).sort((a, b) => b.totalGiven - a.totalGiven);

        // Find labels spanning multiple funds
        const multiFundLabels = byLabel.filter(l => l.fundBreakdown.length > 1);

        return {
            fundsList,
            labelsList,
            matrixMap,
            byFund,
            byLabel,
            overallTotal,
            multiFundLabels,
        };
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

    // ── Prior Year Donors Not Given (LYBUNT) Calculation ──────────────────────
    const lapsedReportData = useMemo(() => {
        const donorYearMap = new Map<string, {
            prior: DetailedDonation[];
            current: DetailedDonation[];
            currentOverall: DetailedDonation[];
            all: DetailedDonation[];
            donorName: string;
        }>();

        donations.forEach(d => {
            if (!d.donorId) return;
            if (!donorYearMap.has(d.donorId)) {
                donorYearMap.set(d.donorId, {
                    prior: [],
                    current: [],
                    currentOverall: [],
                    all: [],
                    donorName: d.donorName || '',
                });
            }
            const rec = donorYearMap.get(d.donorId)!;
            rec.all.push(d);
            if (d.donorName && !rec.donorName) {
                rec.donorName = d.donorName;
            }

            const dYear = parseInt(d.date ? d.date.slice(0, 4) : '0', 10);
            if (dYear === priorYear) {
                if (!lapsedFundFilter || d.fundName === lapsedFundFilter) {
                    rec.prior.push(d);
                }
            }
            if (dYear === comparisonYear) {
                rec.currentOverall.push(d);
                if (!lapsedFundFilter || d.fundName === lapsedFundFilter) {
                    rec.current.push(d);
                }
            }
        });

        let totalPriorYearDonorsCount = 0;
        let totalPriorYearGivingSum = 0;

        donorYearMap.forEach(rec => {
            const pTotal = rec.prior.reduce((s, d) => s + d.amount, 0);
            if (pTotal > 0) {
                totalPriorYearDonorsCount++;
                totalPriorYearGivingSum += pTotal;
            }
        });

        const lapsedList: {
            id: string;
            name: string;
            email: string;
            phone: string;
            membership: string;
            avatar?: string | null;
            status?: string | null;
            priorTotal: number;
            priorCount: number;
            priorAvg: number;
            priorLastDate: string;
            priorFunds: { fundName: string; amount: number }[];
            priorWasRecurring: boolean;
            currentTotal: number;
            currentTotalOverall: number;
            lifetimeTotal: number;
            tier: string;
        }[] = [];

        donorYearMap.forEach((rec, donorId) => {
            const priorTotal = rec.prior.reduce((s, d) => s + d.amount, 0);
            const currentTotal = rec.current.reduce((s, d) => s + d.amount, 0);
            const currentTotalOverall = rec.currentOverall.reduce((s, d) => s + d.amount, 0);

            // Qualified Lapsed: Contributed in prior year (> 0) and $0 in current year
            if (priorTotal > 0 && currentTotal === 0) {
                const person = peopleMap.get(donorId);
                const name = person?.name || rec.donorName || 'Unknown Contributor';
                const email = person?.email || '';
                const phone = person?.phone || '';
                const membership = person?.membership || person?.status || 'Contributor';
                const avatar = person?.avatar || null;
                const status = person?.status || null;

                const priorCount = rec.prior.length;
                const priorAvg = priorCount > 0 ? priorTotal / priorCount : 0;
                const priorWasRecurring = rec.prior.some(d => d.isRecurring);

                let priorLastDate = '';
                rec.prior.forEach(d => {
                    if (!priorLastDate || new Date(d.date) > new Date(priorLastDate)) {
                        priorLastDate = d.date;
                    }
                });

                const fundsMap = new Map<string, number>();
                rec.prior.forEach(d => {
                    fundsMap.set(d.fundName, (fundsMap.get(d.fundName) || 0) + d.amount);
                });
                const priorFunds = Array.from(fundsMap.entries())
                    .map(([fundName, amount]) => ({ fundName, amount }))
                    .sort((a, b) => b.amount - a.amount);

                const lifetimeTotal = rec.all.reduce((s, d) => s + d.amount, 0);

                let tier = '< $100';
                if (priorTotal >= 10000) tier = '$10,000+';
                else if (priorTotal >= 5000) tier = '$5,000 - $9,999';
                else if (priorTotal >= 1000) tier = '$1,000 - $4,999';
                else if (priorTotal >= 500) tier = '$500 - $999';
                else if (priorTotal >= 100) tier = '$100 - $499';

                lapsedList.push({
                    id: donorId,
                    name,
                    email,
                    phone,
                    membership,
                    avatar,
                    status,
                    priorTotal,
                    priorCount,
                    priorAvg,
                    priorLastDate,
                    priorFunds,
                    priorWasRecurring,
                    currentTotal,
                    currentTotalOverall,
                    lifetimeTotal,
                    tier,
                });
            }
        });

        const totalLapsedDonors = lapsedList.length;
        const totalLapsedGiving = lapsedList.reduce((s, d) => s + d.priorTotal, 0);
        const avgLapsedGift = totalLapsedDonors > 0 ? totalLapsedGiving / totalLapsedDonors : 0;
        const recurringLapsedCount = lapsedList.filter(d => d.priorWasRecurring).length;
        const recurringLapsedGiving = lapsedList.filter(d => d.priorWasRecurring).reduce((s, d) => s + d.priorTotal, 0);
        const lapseRateDonors = totalPriorYearDonorsCount > 0 ? (totalLapsedDonors / totalPriorYearDonorsCount) * 100 : 0;
        const lapseRateGiving = totalPriorYearGivingSum > 0 ? (totalLapsedGiving / totalPriorYearGivingSum) * 100 : 0;

        const sortedByPrior = [...lapsedList].sort((a, b) => b.priorTotal - a.priorTotal);
        const topLapsedDonor = sortedByPrior.length > 0 ? sortedByPrior[0] : null;

        const TIERS_CONFIG = [
            { label: '$10,000+', min: 10000, max: Infinity, color: '#4338ca' },
            { label: '$5,000 - $9,999', min: 5000, max: 9999.99, color: '#6366f1' },
            { label: '$1,000 - $4,999', min: 1000, max: 4999.99, color: '#3b82f6' },
            { label: '$500 - $999', min: 500, max: 999.99, color: '#06b6d4' },
            { label: '$100 - $499', min: 100, max: 499.99, color: '#10b981' },
            { label: '< $100', min: 0, max: 99.99, color: '#94a3b8' },
        ];

        const tierBreakdown = TIERS_CONFIG.map(t => {
            const matches = lapsedList.filter(d => d.priorTotal >= t.min && d.priorTotal <= t.max);
            const sum = matches.reduce((s, d) => s + d.priorTotal, 0);
            return {
                tier: t.label,
                count: matches.length,
                sum,
                pct: totalLapsedGiving > 0 ? (sum / totalLapsedGiving) * 100 : 0,
                color: t.color,
            };
        });

        const fundsImpactMap = new Map<string, { sum: number; count: number }>();
        lapsedList.forEach(d => {
            d.priorFunds.forEach(f => {
                const cur = fundsImpactMap.get(f.fundName) || { sum: 0, count: 0 };
                cur.sum += f.amount;
                cur.count += 1;
                fundsImpactMap.set(f.fundName, cur);
            });
        });
        const fundsImpactList = Array.from(fundsImpactMap.entries())
            .map(([fundName, val]) => ({
                fundName,
                sum: val.sum,
                count: val.count,
                pct: totalLapsedGiving > 0 ? (val.sum / totalLapsedGiving) * 100 : 0,
            }))
            .sort((a, b) => b.sum - a.sum);

        let filteredList = [...lapsedList];

        if (lapsedMinAmount) {
            const minVal = parseFloat(lapsedMinAmount);
            if (!isNaN(minVal)) {
                filteredList = filteredList.filter(d => d.priorTotal >= minVal);
            }
        }

        if (lapsedTierFilter !== 'all') {
            filteredList = filteredList.filter(d => d.tier === lapsedTierFilter);
        }

        if (lapsedRecurringOnly) {
            filteredList = filteredList.filter(d => d.priorWasRecurring);
        }

        if (lapsedSearchQuery.trim()) {
            const q = lapsedSearchQuery.toLowerCase().trim();
            filteredList = filteredList.filter(d =>
                d.name.toLowerCase().includes(q) ||
                d.email.toLowerCase().includes(q) ||
                d.membership.toLowerCase().includes(q) ||
                d.phone.toLowerCase().includes(q)
            );
        }

        filteredList.sort((a, b) => {
            let va: any = a[lapsedSort.field];
            let vb: any = b[lapsedSort.field];
            if (lapsedSort.field === 'name') {
                va = (va || '').toLowerCase();
                vb = (vb || '').toLowerCase();
            } else if (lapsedSort.field === 'giftCount') {
                va = a.priorCount;
                vb = b.priorCount;
            } else if (lapsedSort.field === 'lastGiftDate') {
                va = a.priorLastDate ? new Date(a.priorLastDate).getTime() : 0;
                vb = b.priorLastDate ? new Date(b.priorLastDate).getTime() : 0;
            }
            if (va < vb) return lapsedSort.direction === 'asc' ? -1 : 1;
            if (va > vb) return lapsedSort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return {
            allLapsedDonors: lapsedList,
            filteredList,
            totalPriorYearDonorsCount,
            totalPriorYearGivingSum,
            totalLapsedDonors,
            totalLapsedGiving,
            avgLapsedGift,
            recurringLapsedCount,
            recurringLapsedGiving,
            lapseRateDonors,
            lapseRateGiving,
            topLapsedDonor,
            tierBreakdown,
            fundsImpactList,
        };
    }, [
        donations, peopleMap, priorYear, comparisonYear, lapsedFundFilter,
        lapsedMinAmount, lapsedTierFilter, lapsedRecurringOnly, lapsedSearchQuery, lapsedSort
    ]);

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
        } else if (activeTab === 'giving_by_fund') {
            const header = ['Fund Name', 'Total Given', 'Share (%)', 'Givers', 'Transactions', 'Avg Gift ($)', ...buckets.map((b: string) => getBucketLabel(b, filters.interval)).map(escapeCsv)];
            const rows = givingByFundData.fundData.map(f => [
                escapeCsv(f.fundName),
                f.totalGiven.toFixed(2),
                f.pctOfTotal.toFixed(1) + '%',
                f.donorCount,
                f.txCount,
                f.avgGift.toFixed(2),
                ...buckets.map((b: string) => (f.bucketTotals[b] || 0).toFixed(2))
            ].join(','));
            csv = [header.join(','), ...rows].join('\n');
            filename = `giving_by_fund_${format(new Date(), 'yyyy-MM-dd')}.csv`;
        } else if (activeTab === 'fund_label_pivot') {
            if (pivotPrimary === 'fund') {
                const header = ['Fund Name', 'Total Given', ...fundLabelPivotData.labelsList.map(escapeCsv), 'Total Givers'];
                const rows = fundLabelPivotData.byFund.map(f => {
                    const labelAmounts = fundLabelPivotData.labelsList.map(lbl => {
                        const cell = fundLabelPivotData.matrixMap.get(f.fundName)?.get(lbl);
                        return (cell?.amount || 0).toFixed(2);
                    });
                    return [
                        escapeCsv(f.fundName),
                        f.totalGiven.toFixed(2),
                        ...labelAmounts,
                        f.donorCount
                    ].join(',');
                });
                csv = [header.join(','), ...rows].join('\n');
                filename = `fund_label_pivot_by_fund_${format(new Date(), 'yyyy-MM-dd')}.csv`;
            } else {
                const header = ['Label Name', 'Total Given', ...fundLabelPivotData.fundsList.map(escapeCsv), 'Total Givers'];
                const rows = fundLabelPivotData.byLabel.map(l => {
                    const fundAmounts = fundLabelPivotData.fundsList.map(fnd => {
                        const cell = fundLabelPivotData.matrixMap.get(fnd)?.get(l.labelName);
                        return (cell?.amount || 0).toFixed(2);
                    });
                    return [
                        escapeCsv(l.labelName),
                        l.totalGiven.toFixed(2),
                        ...fundAmounts,
                        l.donorCount
                    ].join(',');
                });
                csv = [header.join(','), ...rows].join('\n');
                filename = `fund_label_pivot_by_label_${format(new Date(), 'yyyy-MM-dd')}.csv`;
            }
        } else if (activeTab === 'lapsed_donors') {
            const header = [
                'Donor Name',
                'Email',
                'Phone',
                'Membership / Status',
                `Prior Year (${priorYear}) Total Given ($)`,
                `Prior Year (${priorYear}) Gift Count`,
                `Prior Year (${priorYear}) Avg Gift ($)`,
                `Prior Year (${priorYear}) Last Gift Date`,
                `Prior Year (${priorYear}) Funds Supported`,
                `Prior Year (${priorYear}) Was Recurring`,
                `Current Year (${comparisonYear}) Total Given ($)`,
                'Lifetime Total Given ($)',
                'Giving Bracket'
            ];
            const rows = lapsedReportData.filteredList.map(d => [
                escapeCsv(d.name),
                escapeCsv(d.email),
                escapeCsv(d.phone),
                escapeCsv(d.membership),
                d.priorTotal.toFixed(2),
                d.priorCount,
                d.priorAvg.toFixed(2),
                d.priorLastDate,
                escapeCsv(d.priorFunds.map(f => `${f.fundName}: $${f.amount.toFixed(2)}`).join('; ')),
                d.priorWasRecurring ? 'Yes' : 'No',
                d.currentTotal.toFixed(2),
                d.lifetimeTotal.toFixed(2),
                escapeCsv(d.tier),
            ].join(','));
            csv = [header.join(','), ...rows].join('\n');
            filename = `lapsed_donors_${priorYear}_to_${comparisonYear}_${format(new Date(), 'yyyy-MM-dd')}.csv`;
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
                {activeTab === 'lapsed_donors' ? (
                    <>
                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Previous Year (Base)</label>
                            <select
                                aria-label="Previous Year"
                                value={priorYear}
                                onChange={(e) => setPriorYear(parseInt(e.target.value, 10))}
                                className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                {availableYears.map(yr => (
                                    <option key={yr} value={yr}>{yr}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Current Year (Comparison)</label>
                            <select
                                aria-label="Current Year"
                                value={comparisonYear}
                                onChange={(e) => setComparisonYear(parseInt(e.target.value, 10))}
                                className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                                {availableYears.map(yr => (
                                    <option key={yr} value={yr}>{yr}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Fund</label>
                            <select
                                aria-label="Filter by Fund"
                                value={lapsedFundFilter}
                                onChange={(e) => setLapsedFundFilter(e.target.value)}
                                className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 min-w-[130px]"
                            >
                                <option value="">All Funds</option>
                                {availableFunds.map(fund => (
                                    <option key={fund} value={fund}>{fund}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Min Prior Given ($)</label>
                            <input
                                type="number"
                                placeholder="Min $"
                                value={lapsedMinAmount}
                                onChange={(e) => setLapsedMinAmount(e.target.value)}
                                className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-3 py-2 text-xs font-bold outline-none w-28"
                            />
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Giving Tier</label>
                            <select
                                aria-label="Giving Tier"
                                value={lapsedTierFilter}
                                onChange={(e) => setLapsedTierFilter(e.target.value)}
                                className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 min-w-[130px]"
                            >
                                <option value="all">All Tiers</option>
                                <option value="$10,000+">$10,000+</option>
                                <option value="$5,000 - $9,999">$5,000 - $9,999</option>
                                <option value="$1,000 - $4,999">$1,000 - $4,999</option>
                                <option value="$500 - $999">$500 - $999</option>
                                <option value="$100 - $499">$100 - $499</option>
                                <option value="< $100">&lt; $100</option>
                            </select>
                        </div>

                        <div className="flex items-center gap-2 pb-2">
                            <label className="flex items-center gap-2 cursor-pointer select-none text-xs font-bold text-slate-600 dark:text-slate-300">
                                <input
                                    type="checkbox"
                                    checked={lapsedRecurringOnly}
                                    onChange={(e) => setLapsedRecurringOnly(e.target.checked)}
                                    className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900"
                                />
                                <span>Prior Recurring Only</span>
                            </label>
                        </div>

                        <div className="flex-1 min-w-[200px]">
                            <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Search Contributor</label>
                            <div className="relative">
                                <input
                                    type="text"
                                    placeholder="Search by name, email, or membership..."
                                    value={lapsedSearchQuery}
                                    onChange={(e) => setLapsedSearchQuery(e.target.value)}
                                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-xl pl-9 pr-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                                <span className="absolute left-3 top-2.5 text-slate-400 text-xs">🔍</span>
                            </div>
                        </div>
                    </>
                ) : (
                    <>
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
                    </>
                )}

                <div className="ml-auto">
                    <button
                        onClick={handleExport}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold text-xs uppercase tracking-wide transition-colors flex items-center gap-2"
                    >
                        <span>Download CSV</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    </button>
                </div>
            </div>

            {/* ── Tab Bar ────────────────────────────────────────────────────── */}
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800/60 p-1 rounded-2xl w-fit border border-slate-200 dark:border-slate-700">
                {([
                    { id: 'donors',          label: '👤 Donor Report' },
                    { id: 'lapsed_donors',   label: '📉 Prior Year Not Given' },
                    { id: 'giving_by_fund',  label: '🏛️ Giving by Fund' },
                    { id: 'fund_label_pivot', label: '🔄 Fund & Label Pivot' },
                    { id: 'age_trends',      label: '🎂 Age Demographics' },
                    { id: 'status_trends',   label: '🏷️ Giving By Status' },
                    { id: 'avg_giving',      label: '📊 Avg Giving by Fund' },
                    { id: 'giving_by_label', label: '🏷️ Giving by Label' },
                ] as { id: ReportTab; label: string }[]).map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`px-5 py-2 rounded-xl text-xs font-black uppercase tracking-wide transition-all ${
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
                            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1">
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
                                            <span className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide">{card.title}</span>
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
                                <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Cumulative Distribution Bar</span>
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
                                            <p className="text-xs font-bold text-amber-800 dark:text-amber-400 uppercase tracking-wider">High Dependency Risk</p>
                                            <p className="text-xs text-amber-700 dark:text-amber-300/80 leading-relaxed font-medium">
                                                The top 10 givers contribute <strong className="text-amber-900 dark:text-amber-300">{donorConcentration.top10.pct.toFixed(1)}%</strong> of your total giving (${donorConcentration.top10.sum.toLocaleString(undefined, { maximumFractionDigits: 0 })}). Your organization is highly sensitive to the loss or reduction of any of these top contributors. Consider strategies to diversify and expand your active donor base to mitigate this dependency risk.
                                            </p>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-955/20 border border-emerald-100 dark:border-emerald-900/30 flex items-start gap-3">
                                        <span className="text-base">✅</span>
                                        <div className="space-y-1">
                                            <p className="text-xs font-bold text-emerald-800 dark:text-emerald-400 uppercase tracking-wider">Healthy Giving Distribution</p>
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
                                    <th className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 cursor-pointer hover:text-indigo-500"
                                        onClick={() => setSort({ field: 'name', direction: sort.field === 'name' && sort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        Donor Name {sort.field === 'name' && (sort.direction === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right cursor-pointer hover:text-indigo-500"
                                        onClick={() => setSort({ field: 'totalAmount', direction: sort.field === 'totalAmount' && sort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        Total Given {sort.field === 'totalAmount' && (sort.direction === 'asc' ? '↑' : '↓')}
                                    </th>
                                    <th className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right cursor-pointer hover:text-indigo-500"
                                        onClick={() => setSort({ field: 'lastGiftDate', direction: sort.field === 'lastGiftDate' && sort.direction === 'asc' ? 'desc' : 'asc' })}>
                                        Last Gift {sort.field === 'lastGiftDate' && (sort.direction === 'asc' ? '↑' : '↓')}
                                    </th>
                                    {buckets.map(b => (
                                        <th key={b} className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right whitespace-nowrap">{b}</th>
                                    ))}
                                    <th className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right whitespace-nowrap">% of Total</th>
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
                                        <td className="p-4 text-xs text-indigo-600 dark:text-indigo-400 text-right font-mono font-bold">
                                            {donorConcentration.total > 0 ? ((donor.totalAmount / donorConcentration.total) * 100).toFixed(1) + '%' : '0.0%'}
                                        </td>
                                    </tr>
                                ))}
                                {aggregatedData.length === 0 && (
                                    <tr>
                                        <td colSpan={4 + buckets.length} className="p-8 text-center text-slate-400 text-xs italic">
                                            No donations found matching the selected criteria.
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* ── Prior Year Donors Not Given in Current Year (LYBUNT) ──────────── */}
            {activeTab === 'lapsed_donors' && (
                <div className="space-y-6">
                    {/* Header & Pastoral Outreach Banner */}
                    <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm">
                        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                            <div>
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">📉</span>
                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">
                                        Prior Year Contributors Not Given in Current Year
                                    </h3>
                                    <span className="bg-amber-100 dark:bg-amber-950/60 text-amber-800 dark:text-amber-400 text-[10px] font-black uppercase tracking-wider px-2.5 py-0.5 rounded-full border border-amber-200 dark:border-amber-800">
                                        LYBUNT Report
                                    </span>
                                </div>
                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-2xl leading-relaxed">
                                    Contributors who gave in <strong className="text-slate-700 dark:text-slate-200">{priorYear}</strong> but have not yet contributed in <strong className="text-slate-700 dark:text-slate-200">{comparisonYear}</strong>. Use this data to identify lapsed supporters, coordinate pastoral check-ins, and deploy targeted renewal campaigns.
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-3 flex-shrink-0">
                                <button
                                    onClick={() => handleCopyLapsedEmails(lapsedReportData.filteredList.map(d => d.email).filter(Boolean))}
                                    disabled={lapsedReportData.filteredList.filter(d => Boolean(d.email)).length === 0}
                                    className="px-4 py-2 rounded-xl text-xs font-bold uppercase tracking-wider bg-slate-100 hover:bg-slate-200 dark:bg-slate-700 dark:hover:bg-slate-600 text-slate-700 dark:text-slate-200 transition-colors flex items-center gap-2 disabled:opacity-50"
                                >
                                    <span>{copiedEmails ? '✓ Copied Emails!' : '📋 Copy Filtered Emails'}</span>
                                </button>
                                <div className="bg-slate-100 dark:bg-slate-900 text-slate-700 dark:text-slate-300 px-3.5 py-1.5 rounded-xl text-xs font-bold">
                                    Showing <span className="font-black text-indigo-600 dark:text-indigo-400">{lapsedReportData.filteredList.length}</span> of {lapsedReportData.totalLapsedDonors} Lapsed Donors
                                </div>
                            </div>
                        </div>

                        {/* Top KPI Cards Grid */}
                        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mt-6">
                            {/* Card 1: Lapsed Donors */}
                            <div className="p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 flex flex-col justify-between space-y-2">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Lapsed Donors</span>
                                    <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono">
                                        {lapsedReportData.totalLapsedDonors}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                        <span>Lapse Rate</span>
                                        <span className="text-amber-600 dark:text-amber-400 font-bold">{lapsedReportData.lapseRateDonors.toFixed(1)}%</span>
                                    </div>
                                    <div className="h-1.5 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                        <div className="h-full bg-amber-500 rounded-full" style={{ width: `${Math.min(100, lapsedReportData.lapseRateDonors)}%` }} />
                                    </div>
                                    <p className="text-[10px] text-slate-400">Of {lapsedReportData.totalPriorYearDonorsCount} {priorYear} givers</p>
                                </div>
                            </div>

                            {/* Card 2: Unrenewed Giving at Risk */}
                            <div className="p-5 rounded-2xl bg-rose-50/60 dark:bg-rose-950/20 border border-rose-100 dark:border-rose-900/40 flex flex-col justify-between space-y-2">
                                <div>
                                    <span className="text-[10px] font-bold text-rose-500 dark:text-rose-400 uppercase tracking-wide">Prior Giving at Risk</span>
                                    <p className="text-2xl font-black text-rose-600 dark:text-rose-400 mt-1 font-mono">
                                        ${lapsedReportData.totalLapsedGiving.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </p>
                                </div>
                                <div className="space-y-1">
                                    <div className="flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
                                        <span>Prior Revenue Lost</span>
                                        <span className="text-rose-600 dark:text-rose-400">{lapsedReportData.lapseRateGiving.toFixed(1)}%</span>
                                    </div>
                                    <div className="h-1.5 bg-rose-200 dark:bg-rose-900/60 rounded-full overflow-hidden">
                                        <div className="h-full bg-rose-500 rounded-full" style={{ width: `${Math.min(100, lapsedReportData.lapseRateGiving)}%` }} />
                                    </div>
                                    <p className="text-[10px] text-slate-400">${lapsedReportData.totalPriorYearGivingSum.toLocaleString(undefined, { maximumFractionDigits: 0 })} total in {priorYear}</p>
                                </div>
                            </div>

                            {/* Card 3: Average Prior Gift */}
                            <div className="p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 flex flex-col justify-between space-y-2">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Avg Prior Giving</span>
                                    <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono">
                                        ${lapsedReportData.avgLapsedGift.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                    </p>
                                </div>
                                <p className="text-[11px] font-bold text-slate-400 mt-auto">
                                    Average contribution in {priorYear} per lapsed giver
                                </p>
                            </div>

                            {/* Card 4: Prior Recurring Givers */}
                            <div className="p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 flex flex-col justify-between space-y-2">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Lapsed Recurring</span>
                                    <p className="text-2xl font-black text-indigo-600 dark:text-indigo-400 mt-1 font-mono">
                                        {lapsedReportData.recurringLapsedCount}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-[11px] font-bold text-indigo-600 dark:text-indigo-400">
                                        ${lapsedReportData.recurringLapsedGiving.toLocaleString(undefined, { maximumFractionDigits: 0 })} lost
                                    </p>
                                    <p className="text-[10px] text-slate-400">Key target for card updates</p>
                                </div>
                            </div>

                            {/* Card 5: Top Lapsed Contributor */}
                            <div className="p-5 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-100 dark:border-slate-800 flex flex-col justify-between space-y-2">
                                <div>
                                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Top Lapsed Contributor</span>
                                    <p className="text-base font-black text-slate-900 dark:text-white mt-1 truncate" title={lapsedReportData.topLapsedDonor?.name || 'None'}>
                                        {lapsedReportData.topLapsedDonor?.name || 'None'}
                                    </p>
                                </div>
                                <div>
                                    <p className="text-lg font-black text-indigo-600 dark:text-indigo-400 font-mono">
                                        ${lapsedReportData.topLapsedDonor ? lapsedReportData.topLapsedDonor.priorTotal.toLocaleString(undefined, { maximumFractionDigits: 0 }) : '0'}
                                    </p>
                                    <p className="text-[10px] text-slate-400">
                                        {lapsedReportData.topLapsedDonor?.priorLastDate ? `Last: ${format(parseISO(lapsedReportData.topLapsedDonor.priorLastDate), 'MMM d, yyyy')}` : 'No previous date'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Visual Analytics Breakdown Grid */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                        {/* 1. Giving Tier Distribution */}
                        <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm space-y-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-base font-black text-slate-900 dark:text-white">Lapsed Donors by Giving Tier</h4>
                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">
                                        Breakdown by {priorYear} contribution volume (click to filter)
                                    </p>
                                </div>
                                {lapsedTierFilter !== 'all' && (
                                    <button
                                        onClick={() => setLapsedTierFilter('all')}
                                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 uppercase tracking-wider underline"
                                    >
                                        Clear Tier Filter
                                    </button>
                                )}
                            </div>

                            <div className="space-y-3">
                                {lapsedReportData.tierBreakdown.map(tier => {
                                    const isSelected = lapsedTierFilter === tier.tier;
                                    return (
                                        <div
                                            key={tier.tier}
                                            onClick={() => setLapsedTierFilter(isSelected ? 'all' : tier.tier)}
                                            className={`p-3.5 rounded-2xl cursor-pointer transition-all border ${
                                                isSelected
                                                    ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700 ring-2 ring-indigo-500/20'
                                                    : 'bg-slate-50/70 hover:bg-slate-100 dark:bg-slate-900/40 dark:hover:bg-slate-900/80 border-slate-100 dark:border-slate-800'
                                            }`}
                                        >
                                            <div className="flex items-center justify-between gap-2 text-xs mb-2">
                                                <div className="flex items-center gap-2">
                                                    <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: tier.color }} />
                                                    <span className="font-bold text-slate-900 dark:text-white">{tier.tier}</span>
                                                    <span className="text-[10px] font-bold text-slate-400">
                                                        ({tier.count} {tier.count === 1 ? 'donor' : 'donors'})
                                                    </span>
                                                </div>
                                                <div className="text-right font-mono">
                                                    <span className="font-black text-slate-900 dark:text-white">${tier.sum.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                    <span className="text-[11px] text-slate-400 ml-1.5">({tier.pct.toFixed(1)}%)</span>
                                                </div>
                                            </div>
                                            <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                <div
                                                    className="h-full rounded-full transition-all duration-300"
                                                    style={{ width: `${tier.pct}%`, backgroundColor: tier.color }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        </div>

                        {/* 2. Impact by Fund */}
                        <div className="bg-white dark:bg-slate-800 p-6 md:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm space-y-5">
                            <div className="flex items-center justify-between">
                                <div>
                                    <h4 className="text-base font-black text-slate-900 dark:text-white">Funds Most Impacted</h4>
                                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">
                                        Where lapsed givers directed their gifts in {priorYear} (click to filter)
                                    </p>
                                </div>
                                {lapsedFundFilter && (
                                    <button
                                        onClick={() => setLapsedFundFilter('')}
                                        className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 uppercase tracking-wider underline"
                                    >
                                        Show All Funds
                                    </button>
                                )}
                            </div>

                            {lapsedReportData.fundsImpactList.length === 0 ? (
                                <div className="flex flex-col items-center justify-center h-48 text-center gap-2">
                                    <span className="text-3xl opacity-20">🏛️</span>
                                    <p className="text-xs font-bold text-slate-400">No fund history for lapsed contributors</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {lapsedReportData.fundsImpactList.map(fund => {
                                        const isSelected = lapsedFundFilter === fund.fundName;
                                        return (
                                            <div
                                                key={fund.fundName}
                                                onClick={() => setLapsedFundFilter(isSelected ? '' : fund.fundName)}
                                                className={`p-3.5 rounded-2xl cursor-pointer transition-all border ${
                                                    isSelected
                                                        ? 'bg-indigo-50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700 ring-2 ring-indigo-500/20'
                                                        : 'bg-slate-50/70 hover:bg-slate-100 dark:bg-slate-900/40 dark:hover:bg-slate-900/80 border-slate-100 dark:border-slate-800'
                                                }`}
                                            >
                                                <div className="flex items-center justify-between gap-2 text-xs mb-2">
                                                    <div className="flex items-center gap-2">
                                                        <span className="font-bold text-slate-900 dark:text-white truncate max-w-[200px]">{fund.fundName}</span>
                                                        <span className="text-[10px] font-bold text-slate-400">
                                                            ({fund.count} gifts)
                                                        </span>
                                                    </div>
                                                    <div className="text-right font-mono">
                                                        <span className="font-black text-rose-600 dark:text-rose-400">${fund.sum.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                        <span className="text-[11px] text-slate-400 ml-1.5">({fund.pct.toFixed(1)}%)</span>
                                                    </div>
                                                </div>
                                                <div className="h-2 bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-rose-500 rounded-full transition-all duration-300"
                                                        style={{ width: `${fund.pct}%` }}
                                                    />
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Detailed Contributor Table */}
                    <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                        {/* Table Header Controls */}
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                            <div>
                                <h4 className="text-base font-black text-slate-900 dark:text-white">Lapsed Contributors Directory</h4>
                                <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wide mt-0.5">
                                    Click any contributor to view pastoral profile and care history
                                </p>
                            </div>
                            <div className="flex flex-wrap items-center gap-2">
                                {(lapsedMinAmount || lapsedTierFilter !== 'all' || lapsedRecurringOnly || lapsedSearchQuery || lapsedFundFilter) && (
                                    <button
                                        onClick={() => {
                                            setLapsedMinAmount('');
                                            setLapsedTierFilter('all');
                                            setLapsedRecurringOnly(false);
                                            setLapsedSearchQuery('');
                                            setLapsedFundFilter('');
                                        }}
                                        className="text-xs font-bold text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 px-3 py-1 rounded-lg bg-slate-100 dark:bg-slate-700 transition-colors"
                                    >
                                        Reset Filters ✕
                                    </button>
                                )}
                            </div>
                        </div>

                        <div className="overflow-x-auto">
                            <table className="w-full text-left border-collapse">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                        <th
                                            className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 cursor-pointer hover:text-indigo-500 whitespace-nowrap"
                                            onClick={() => setLapsedSort({ field: 'name', direction: lapsedSort.field === 'name' && lapsedSort.direction === 'asc' ? 'desc' : 'asc' })}
                                        >
                                            Contributor {lapsedSort.field === 'name' && (lapsedSort.direction === 'asc' ? '↑' : '↓')}
                                        </th>
                                        <th className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">
                                            Contact Info
                                        </th>
                                        <th className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">
                                            Membership
                                        </th>
                                        <th
                                            className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right cursor-pointer hover:text-indigo-500 whitespace-nowrap"
                                            onClick={() => setLapsedSort({ field: 'priorTotal', direction: lapsedSort.field === 'priorTotal' && lapsedSort.direction === 'asc' ? 'desc' : 'asc' })}
                                        >
                                            {priorYear} Giving {lapsedSort.field === 'priorTotal' && (lapsedSort.direction === 'asc' ? '↑' : '↓')}
                                        </th>
                                        <th
                                            className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right cursor-pointer hover:text-indigo-500 whitespace-nowrap"
                                            onClick={() => setLapsedSort({ field: 'giftCount', direction: lapsedSort.field === 'giftCount' && lapsedSort.direction === 'asc' ? 'desc' : 'asc' })}
                                        >
                                            {priorYear} Gifts {lapsedSort.field === 'giftCount' && (lapsedSort.direction === 'asc' ? '↑' : '↓')}
                                        </th>
                                        <th className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right whitespace-nowrap">
                                            Avg Gift
                                        </th>
                                        <th
                                            className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right cursor-pointer hover:text-indigo-500 whitespace-nowrap"
                                            onClick={() => setLapsedSort({ field: 'lastGiftDate', direction: lapsedSort.field === 'lastGiftDate' && lapsedSort.direction === 'asc' ? 'desc' : 'asc' })}
                                        >
                                            Last Gift ({priorYear}) {lapsedSort.field === 'lastGiftDate' && (lapsedSort.direction === 'asc' ? '↑' : '↓')}
                                        </th>
                                        <th className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 whitespace-nowrap">
                                            Funds Supported
                                        </th>
                                        <th className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-center whitespace-nowrap">
                                            {comparisonYear} Giving
                                        </th>
                                        <th
                                            className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right cursor-pointer hover:text-indigo-500 whitespace-nowrap"
                                            onClick={() => setLapsedSort({ field: 'lifetimeTotal', direction: lapsedSort.field === 'lifetimeTotal' && lapsedSort.direction === 'asc' ? 'desc' : 'asc' })}
                                        >
                                            Lifetime {lapsedSort.field === 'lifetimeTotal' && (lapsedSort.direction === 'asc' ? '↑' : '↓')}
                                        </th>
                                        <th className="p-4 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-center whitespace-nowrap">
                                            Action
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                    {lapsedReportData.filteredList.map(donor => (
                                        <tr key={donor.id} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                                            {/* Contributor Name & Avatar */}
                                            <td className="p-4 whitespace-nowrap">
                                                <div className="flex items-center gap-3">
                                                    <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-[11px] font-black uppercase shadow-sm">
                                                        {donor.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                                    </div>
                                                    <div>
                                                        <button
                                                            onClick={() => handleOpenPersonProfile(donor.id)}
                                                            className="text-xs font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left"
                                                        >
                                                            {donor.name}
                                                        </button>
                                                        <div className="text-[10px] text-slate-400">{donor.tier}</div>
                                                    </div>
                                                </div>
                                            </td>

                                            {/* Contact Info */}
                                            <td className="p-4 text-xs whitespace-nowrap">
                                                {donor.email ? (
                                                    <div className="flex items-center gap-1.5">
                                                        <a href={`mailto:${donor.email}`} className="text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 font-medium">
                                                            {donor.email}
                                                        </a>
                                                        <button
                                                            onClick={() => handleCopyLapsedEmails([donor.email])}
                                                            title="Copy email"
                                                            className="text-slate-300 hover:text-slate-600 dark:hover:text-slate-200 text-xs"
                                                        >
                                                            📋
                                                        </button>
                                                    </div>
                                                ) : (
                                                    <span className="text-slate-400 text-[11px] italic">No email</span>
                                                )}
                                                {donor.phone && (
                                                    <div className="text-[11px] text-slate-400 mt-0.5">
                                                        <a href={`tel:${donor.phone}`} className="hover:text-slate-600 dark:hover:text-slate-200">
                                                            {donor.phone}
                                                        </a>
                                                    </div>
                                                )}
                                            </td>

                                            {/* Membership */}
                                            <td className="p-4 whitespace-nowrap">
                                                <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                                    {donor.membership}
                                                </span>
                                            </td>

                                            {/* Prior Year Giving */}
                                            <td className="p-4 text-xs font-black text-rose-600 dark:text-rose-400 text-right font-mono whitespace-nowrap">
                                                ${donor.priorTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>

                                            {/* Prior Year Gifts Count */}
                                            <td className="p-4 text-xs text-slate-700 dark:text-slate-300 text-right font-mono whitespace-nowrap">
                                                <div className="flex items-center justify-end gap-1.5">
                                                    <span>{donor.priorCount}</span>
                                                    {donor.priorWasRecurring && (
                                                        <span className="text-[9px] font-extrabold uppercase px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300" title="Recurring donor in prior year">
                                                            Rec
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Prior Year Avg Gift */}
                                            <td className="p-4 text-xs text-slate-500 dark:text-slate-400 text-right font-mono whitespace-nowrap">
                                                ${donor.priorAvg.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>

                                            {/* Last Gift Date */}
                                            <td className="p-4 text-xs text-slate-500 dark:text-slate-400 text-right font-mono whitespace-nowrap">
                                                {donor.priorLastDate ? format(parseISO(donor.priorLastDate), 'MMM d, yyyy') : '-'}
                                            </td>

                                            {/* Funds Supported */}
                                            <td className="p-4 text-xs whitespace-nowrap">
                                                <div className="flex flex-wrap gap-1 max-w-[220px]">
                                                    {donor.priorFunds.slice(0, 2).map(f => (
                                                        <span
                                                            key={f.fundName}
                                                            className="text-[10px] font-bold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
                                                            title={`${f.fundName}: $${f.amount.toLocaleString()}`}
                                                        >
                                                            {f.fundName}
                                                        </span>
                                                    ))}
                                                    {donor.priorFunds.length > 2 && (
                                                        <span className="text-[10px] text-slate-400 font-bold self-center">
                                                            +{donor.priorFunds.length - 2} more
                                                        </span>
                                                    )}
                                                </div>
                                            </td>

                                            {/* Comparison Year Giving */}
                                            <td className="p-4 text-center whitespace-nowrap">
                                                <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-400 border border-rose-200 dark:border-rose-900/60">
                                                    $0.00 Not Given
                                                </span>
                                            </td>

                                            {/* Lifetime Total */}
                                            <td className="p-4 text-xs text-slate-500 dark:text-slate-400 text-right font-mono whitespace-nowrap font-bold">
                                                ${donor.lifetimeTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                            </td>

                                            {/* Profile Action */}
                                            <td className="p-4 text-center whitespace-nowrap">
                                                <button
                                                    onClick={() => handleOpenPersonProfile(donor.id)}
                                                    className="px-3 py-1 rounded-xl text-[11px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                                                >
                                                    Profile →
                                                </button>
                                            </td>
                                        </tr>
                                    ))}

                                    {lapsedReportData.filteredList.length === 0 && (
                                        <tr>
                                            <td colSpan={11} className="p-12 text-center text-slate-400">
                                                <div className="flex flex-col items-center justify-center gap-2">
                                                    <span className="text-3xl">🎉</span>
                                                    <p className="text-sm font-bold text-slate-600 dark:text-slate-300">
                                                        {lapsedReportData.totalLapsedDonors === 0
                                                            ? `All contributors from ${priorYear} have renewed their giving in ${comparisonYear}!`
                                                            : 'No lapsed contributors match your selected filters.'}
                                                    </p>
                                                    <p className="text-xs text-slate-400">
                                                        Try adjusting the fund filter, minimum amount, or search query.
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
            )}

            {/* ── Age Demographics Over Time ─────────────────────────────────── */}
            {activeTab === 'age_trends' && (
                <div className="space-y-6">
                    <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm p-8">
                        <div className="mb-6">
                            <h3 className="text-lg font-black text-slate-900 dark:text-white">Giving by Age Group Over Time</h3>
                            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1">
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
                                                <th className="pb-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Age Group</th>
                                                {buckets.map(b => (
                                                    <th key={b} className="pb-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right whitespace-nowrap">{b}</th>
                                                ))}
                                                <th className="pb-3 text-[10px] font-bold uppercase tracking-wide text-emerald-500 text-right">Total</th>
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
                            <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1">
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
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-4">Share of Giving (%) Over Time</p>
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
                                                <th className="pb-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Status</th>
                                                {buckets.map(b => (
                                                    <th key={b} className="pb-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right whitespace-nowrap">{b}</th>
                                                ))}
                                                <th className="pb-3 text-[10px] font-bold uppercase tracking-wide text-emerald-500 text-right">Total</th>
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
                                    <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1">
                                        Avg weekly giving per fund · {Math.round(totalWeeks)} weeks
                                    </p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{filters.startDate} – {filters.endDate}</p>
                                </div>
                                {hasFunds && (
                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Avg / Week (All Funds)</p>
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
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
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
                                                                <p className="text-[11px] text-slate-400 dark:text-slate-500 text-right">
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
                                    <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1">
                                        Total giving per label
                                    </p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{filters.startDate} – {filters.endDate}</p>
                                </div>
                                {hasLabels && (
                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Total Given</p>
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
                                    <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
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

            {/* ── Giving By Fund Report ────────────────────────────────────────── */}
            {activeTab === 'giving_by_fund' && (() => {
                const { fundData, overallTotal, chartData } = givingByFundData;
                const hasFunds = fundData.length > 0;

                return (
                    <div className="space-y-6">
                        <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm p-8 space-y-8">
                            {/* Header */}
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                <div>
                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">Giving by Fund</h3>
                                    <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1">
                                        Total giving per fund · {filters.interval} buckets
                                    </p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{filters.startDate} – {filters.endDate}</p>
                                </div>
                                {hasFunds && (
                                    <div className="flex flex-col items-end gap-1 flex-shrink-0">
                                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wide">Total Given (All Funds)</p>
                                        <p className="text-3xl font-black text-indigo-600 dark:text-indigo-400 font-mono">
                                            ${overallTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </p>
                                        <p className="text-[10px] text-slate-400 dark:text-slate-500">
                                            {fundData.length} Fund{fundData.length === 1 ? '' : 's'} · {filteredDonations.length} Gifts
                                        </p>
                                    </div>
                                )}
                            </div>

                            {!hasFunds ? (
                                <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                                    <span className="text-4xl opacity-20">🏛️</span>
                                    <p className="text-xs font-bold text-slate-400">No fund giving data available for the selected filters</p>
                                    <p className="text-[10px] text-slate-400">Adjust the date range or filters above to view giving by fund.</p>
                                </div>
                            ) : (
                                <>
                                    {/* Fund Metrics Summary Cards */}
                                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
                                        {fundData.slice(0, 4).map(f => (
                                            <div key={f.fundName} className="p-5 rounded-2xl bg-slate-50/60 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/80 space-y-3">
                                                <div className="flex items-center justify-between gap-2">
                                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 truncate flex items-center gap-2">
                                                        <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: f.color }} />
                                                        {f.fundName}
                                                    </span>
                                                    <span className="text-[10px] font-black px-2 py-0.5 rounded-md bg-indigo-50 text-indigo-600 dark:bg-indigo-900/30 dark:text-indigo-400 font-mono">
                                                        {f.pctOfTotal.toFixed(1)}%
                                                    </span>
                                                </div>
                                                <div>
                                                    <p className="text-2xl font-black text-slate-900 dark:text-white font-mono">
                                                        ${f.totalGiven.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                    </p>
                                                    <div className="flex items-center justify-between text-[11px] text-slate-400 dark:text-slate-500 mt-2 font-medium">
                                                        <span>{f.donorCount} Giver{f.donorCount === 1 ? '' : 's'}</span>
                                                        <span>Avg ${f.avgGift.toLocaleString(undefined, { maximumFractionDigits: 0 })}/gift</span>
                                                    </div>
                                                </div>
                                                <div className="h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                    <div className="h-full rounded-full transition-all duration-300" style={{ width: `${f.pctOfTotal}%`, backgroundColor: f.color }} />
                                                </div>
                                            </div>
                                        ))}
                                    </div>

                                    {/* Stacked Bar Chart */}
                                    <div className="space-y-4 pt-4">
                                        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Fund Giving Over Time</h4>
                                        <div className="h-72">
                                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                                <BarChart data={chartData} margin={{ left: 8, right: 8, top: 4, bottom: 4 }}>
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
                                                        formatter={(value: number, name: string) => [`$${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`, name]}
                                                    />
                                                    <Legend verticalAlign="top" iconType="circle" wrapperStyle={{ fontSize: '10px', fontWeight: 700, paddingBottom: '16px' }} />
                                                    {fundData.map((f, i) => (
                                                        <Bar
                                                            key={f.fundName}
                                                            dataKey={f.fundName}
                                                            stackId="fund"
                                                            fill={f.color}
                                                            radius={i === fundData.length - 1 ? [4,4,0,0] : [0,0,0,0]}
                                                        />
                                                    ))}
                                                </BarChart>
                                            </ResponsiveContainer>
                                        </div>
                                    </div>

                                    {/* Detailed Breakdown Table */}
                                    <div className="space-y-4 pt-4">
                                        <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">Detailed Fund Breakdown</h4>
                                        <div className="overflow-x-auto">
                                            <table className="w-full text-left border-collapse">
                                                <thead>
                                                    <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
                                                        <th className="p-3 text-[10px] font-bold uppercase tracking-wide text-slate-400">Fund Name</th>
                                                        <th className="p-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right">Total Given</th>
                                                        <th className="p-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right">% of Total</th>
                                                        <th className="p-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right">Givers</th>
                                                        <th className="p-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right">Avg Gift</th>
                                                        {buckets.map(b => (
                                                            <th key={b} className="p-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right whitespace-nowrap">
                                                                {getBucketLabel(b, filters.interval)}
                                                            </th>
                                                        ))}
                                                    </tr>
                                                </thead>
                                                <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                                    {fundData.map(f => (
                                                        <tr key={f.fundName} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                            <td className="p-3 text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2 whitespace-nowrap">
                                                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: f.color }} />
                                                                {f.fundName}
                                                            </td>
                                                            <td className="p-3 text-xs font-black text-slate-900 dark:text-white text-right font-mono">
                                                                ${f.totalGiven.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </td>
                                                            <td className="p-3 text-xs font-bold text-indigo-600 dark:text-indigo-400 text-right font-mono">
                                                                {f.pctOfTotal.toFixed(1)}%
                                                            </td>
                                                            <td className="p-3 text-xs text-slate-600 dark:text-slate-300 text-right font-mono">
                                                                {f.donorCount}
                                                            </td>
                                                            <td className="p-3 text-xs text-slate-600 dark:text-slate-300 text-right font-mono">
                                                                ${f.avgGift.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </td>
                                                            {buckets.map(b => {
                                                                const amount = f.bucketTotals[b] || 0;
                                                                return (
                                                                    <td key={b} className="p-3 text-xs font-mono text-slate-500 dark:text-slate-400 text-right">
                                                                        {amount > 0 ? `$${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '—'}
                                                                    </td>
                                                                );
                                                            })}
                                                        </tr>
                                                    ))}
                                                </tbody>
                                                <tfoot>
                                                    <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-bold bg-slate-50/80 dark:bg-slate-900/60">
                                                        <td className="p-3 text-xs font-black text-slate-900 dark:text-white uppercase tracking-wide">Total</td>
                                                        <td className="p-3 text-xs font-black text-emerald-600 dark:text-emerald-400 text-right font-mono">
                                                            ${overallTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                        </td>
                                                        <td className="p-3 text-xs font-black text-indigo-600 dark:text-indigo-400 text-right font-mono">100.0%</td>
                                                        <td className="p-3 text-xs font-bold text-slate-700 dark:text-slate-300 text-right font-mono">
                                                            {new Set(filteredDonations.map(d => d.donorId)).size}
                                                        </td>
                                                        <td className="p-3 text-xs font-bold text-slate-700 dark:text-slate-300 text-right font-mono">
                                                            ${filteredDonations.length > 0 ? (overallTotal / filteredDonations.length).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'}
                                                        </td>
                                                        {buckets.map(b => {
                                                            const bucketTotal = fundData.reduce((s, f) => s + (f.bucketTotals[b] || 0), 0);
                                                            return (
                                                                <td key={b} className="p-3 text-xs font-black text-emerald-600 dark:text-emerald-400 text-right font-mono">
                                                                    ${bucketTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                </td>
                                                            );
                                                        })}
                                                    </tr>
                                                </tfoot>
                                            </table>
                                        </div>
                                    </div>
                                </>
                            )}
                        </div>
                    </div>
                );
            })()}

            {/* ── Fund & Label Pivot Report ─────────────────────────────────── */}
            {activeTab === 'fund_label_pivot' && (() => {
                const { fundsList, labelsList, matrixMap, byFund, byLabel, overallTotal, multiFundLabels } = fundLabelPivotData;
                const hasData = filteredDonations.length > 0;

                return (
                    <div className="space-y-6">
                        <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm p-8 space-y-8">
                            {/* Header & Controls */}
                            <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                                <div>
                                    <h3 className="text-lg font-black text-slate-900 dark:text-white">Fund & Label Pivot Analysis</h3>
                                    <p className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wide mt-1">
                                        Cross-analyze giving by Fund and Label to spot miscategorizations
                                    </p>
                                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-0.5">{filters.startDate} – {filters.endDate}</p>
                                </div>

                                {/* Controls: Primary Pivot Switcher & View Mode Toggle */}
                                {hasData && (
                                    <div className="flex flex-wrap items-center gap-3">
                                        {/* Primary Grouping Toggle */}
                                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                                            <button
                                                type="button"
                                                onClick={() => setPivotPrimary('fund')}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                                    pivotPrimary === 'fund'
                                                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                                                }`}
                                            >
                                                Fund → Labels
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPivotPrimary('label')}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                                    pivotPrimary === 'label'
                                                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                                                }`}
                                            >
                                                Label → Funds (Reverse)
                                            </button>
                                        </div>

                                        {/* View Mode Toggle */}
                                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                                            <button
                                                type="button"
                                                onClick={() => setPivotViewMode('nested')}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                                    pivotViewMode === 'nested'
                                                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                                                }`}
                                            >
                                                Breakdown Cards
                                            </button>
                                            <button
                                                type="button"
                                                onClick={() => setPivotViewMode('matrix')}
                                                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                                                    pivotViewMode === 'matrix'
                                                        ? 'bg-white dark:bg-slate-700 text-indigo-600 dark:text-indigo-400 shadow-xs'
                                                        : 'text-slate-500 dark:text-slate-400 hover:text-slate-800'
                                                }`}
                                            >
                                                2D Matrix Table
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>

                            {!hasData ? (
                                <div className="flex flex-col items-center justify-center h-48 text-center gap-3">
                                    <span className="text-4xl opacity-20">🔄</span>
                                    <p className="text-xs font-bold text-slate-400">No pivot data available for the selected filters</p>
                                    <p className="text-[10px] text-slate-400">Adjust the filters above to inspect Fund & Label relationships.</p>
                                </div>
                            ) : (
                                <>
                                    {/* Multi-Fund Label Warning Alert */}
                                    {multiFundLabels.length > 0 && (
                                        <div className="p-4 rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-100 dark:border-indigo-900/40 flex items-start gap-3">
                                            <span className="text-lg">💡</span>
                                            <div className="space-y-1">
                                                <p className="text-xs font-bold text-indigo-900 dark:text-indigo-300 uppercase tracking-wider">
                                                    Cross-Fund Label Observations ({multiFundLabels.length} Label{multiFundLabels.length === 1 ? '' : 's'} span multiple funds)
                                                </p>
                                                <p className="text-xs text-indigo-800 dark:text-indigo-300/80 leading-relaxed">
                                                    The following labels appear across more than one fund: {multiFundLabels.map(m => m.labelName).join(', ')}. Inspect the pivot matrix below to confirm whether donations were properly designated or if funds were misassigned.
                                                </p>
                                            </div>
                                        </div>
                                    )}

                                    {/* ── View 1: Nested Breakdown Cards ── */}
                                    {pivotViewMode === 'nested' && (
                                        <div className="space-y-6">
                                            {(pivotPrimary === 'fund' ? byFund : byLabel).map(primary => {
                                                const title = pivotPrimary === 'fund' ? primary.fundName : primary.labelName;
                                                const breakdown = pivotPrimary === 'fund' ? primary.labelBreakdown : primary.fundBreakdown;

                                                return (
                                                    <div key={title} className="p-6 rounded-2xl bg-slate-50/70 dark:bg-slate-900/40 border border-slate-100 dark:border-slate-800/80 space-y-4">
                                                        {/* Primary Header */}
                                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200/60 dark:border-slate-800 pb-3">
                                                            <div className="flex items-center gap-2">
                                                                <span className="w-3 h-3 rounded-full flex-shrink-0" style={{ backgroundColor: primary.color }} />
                                                                <span className="text-base font-black text-slate-900 dark:text-white">{title}</span>
                                                                <span className="text-xs font-bold text-slate-400 font-mono">({primary.pctOfTotal.toFixed(1)}% of total)</span>
                                                            </div>
                                                            <div className="flex items-center gap-4 text-xs font-mono">
                                                                <span className="font-black text-indigo-600 dark:text-indigo-400 text-sm">
                                                                    ${primary.totalGiven.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                </span>
                                                                <span className="text-slate-400 font-medium">
                                                                    {primary.donorCount} Giver{primary.donorCount === 1 ? '' : 's'} · {primary.txCount} Gift{primary.txCount === 1 ? '' : 's'}
                                                                </span>
                                                            </div>
                                                        </div>

                                                        {/* Secondary Items list */}
                                                        {breakdown.length === 0 ? (
                                                            <p className="text-xs italic text-slate-400">No secondary items attached.</p>
                                                        ) : (
                                                            <div className="space-y-3 pt-1">
                                                                {breakdown.map(sec => {
                                                                    const secTitle = pivotPrimary === 'fund' ? (sec as any).labelName : (sec as any).fundName;
                                                                    const pctVal = pivotPrimary === 'fund' ? (sec as any).pctOfFund : (sec as any).pctOfLabel;

                                                                    return (
                                                                        <div key={secTitle} className="space-y-1.5">
                                                                            <div className="flex items-center justify-between text-xs font-bold">
                                                                                <span className="text-slate-700 dark:text-slate-300">{secTitle}</span>
                                                                                <div className="flex items-center gap-3 font-mono">
                                                                                    <span className="text-slate-900 dark:text-white">
                                                                                        ${sec.amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                                                    </span>
                                                                                    <span className="text-indigo-600 dark:text-indigo-400 text-[11px]">
                                                                                        {pctVal.toFixed(1)}%
                                                                                    </span>
                                                                                </div>
                                                                            </div>
                                                                            <div className="h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                                                <div className="h-full rounded-full transition-all duration-300 bg-indigo-500" style={{ width: `${pctVal}%` }} />
                                                                            </div>
                                                                        </div>
                                                                    );
                                                                })}
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    )}

                                    {/* ── View 2: 2D Matrix Table ── */}
                                    {pivotViewMode === 'matrix' && (
                                        <div className="space-y-4">
                                            <div className="flex items-center justify-between">
                                                <h4 className="text-xs font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                                                    Cross-Tabulation Matrix ({pivotPrimary === 'fund' ? 'Rows: Fund, Columns: Label' : 'Rows: Label, Columns: Fund'})
                                                </h4>
                                            </div>
                                            <div className="overflow-x-auto">
                                                <table className="w-full text-left border-collapse">
                                                    <thead>
                                                        <tr className="border-b border-slate-100 dark:border-slate-700 bg-slate-50/50 dark:bg-slate-900/30">
                                                            <th className="p-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 min-w-[150px]">
                                                                {pivotPrimary === 'fund' ? 'Fund Name ↓ / Label →' : 'Label Name ↓ / Fund →'}
                                                            </th>
                                                            {(pivotPrimary === 'fund' ? labelsList : fundsList).map((col: string) => (
                                                                <th key={col} className="p-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 text-right whitespace-nowrap min-w-[100px]">
                                                                    {col}
                                                                </th>
                                                            ))}
                                                            <th className="p-3 text-[10px] font-bold uppercase tracking-wide text-emerald-500 text-right whitespace-nowrap min-w-[120px]">
                                                                Total Row
                                                            </th>
                                                        </tr>
                                                    </thead>
                                                    <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                                                        {(pivotPrimary === 'fund' ? fundsList : labelsList).map((rowItem: string) => {
                                                            const rowTotal = (pivotPrimary === 'fund' ? labelsList : fundsList).reduce((sum: number, colItem: string) => {
                                                                const fName = pivotPrimary === 'fund' ? rowItem : colItem;
                                                                const lName = pivotPrimary === 'fund' ? colItem : rowItem;
                                                                const cell = matrixMap.get(fName)?.get(lName);
                                                                return sum + (cell?.amount || 0);
                                                            }, 0);

                                                            return (
                                                                <tr key={rowItem} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                                    <td className="p-3 text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                                                        {rowItem}
                                                                    </td>
                                                                    {(pivotPrimary === 'fund' ? labelsList : fundsList).map((colItem: string) => {
                                                                        const fName = pivotPrimary === 'fund' ? rowItem : colItem;
                                                                        const lName = pivotPrimary === 'fund' ? colItem : rowItem;
                                                                        const cell = matrixMap.get(fName)?.get(lName);
                                                                        const amount = cell?.amount || 0;
                                                                        const tx = cell?.txCount || 0;

                                                                        return (
                                                                            <td key={colItem} className={`p-3 text-xs font-mono text-right ${amount > 0 ? 'text-slate-900 dark:text-white font-bold' : 'text-slate-300 dark:text-slate-600'}`}>
                                                                                {amount > 0 ? (
                                                                                    <div>
                                                                                        <span>${amount.toLocaleString(undefined, { maximumFractionDigits: 0 })}</span>
                                                                                        <p className="text-[9px] font-medium text-slate-400 font-sans">{tx} gift{tx === 1 ? '' : 's'}</p>
                                                                                    </div>
                                                                                ) : '—'}
                                                                            </td>
                                                                        );
                                                                    })}
                                                                    <td className="p-3 text-xs font-black text-indigo-600 dark:text-indigo-400 text-right font-mono">
                                                                        ${rowTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                                    </td>
                                                                </tr>
                                                            );
                                                        })}
                                                    </tbody>
                                                    <tfoot>
                                                        <tr className="border-t-2 border-slate-200 dark:border-slate-700 font-bold bg-slate-50/80 dark:bg-slate-900/60">
                                                            <td className="p-3 text-xs font-black text-slate-900 dark:text-white uppercase tracking-wide">Total Column</td>
                                                            {(pivotPrimary === 'fund' ? labelsList : fundsList).map((colItem: string) => {
                                                                const colTotal = (pivotPrimary === 'fund' ? fundsList : labelsList).reduce((sum: number, rowItem: string) => {
                                                                    const fName = pivotPrimary === 'fund' ? rowItem : colItem;
                                                                    const lName = pivotPrimary === 'fund' ? colItem : rowItem;
                                                                    const cell = matrixMap.get(fName)?.get(lName);
                                                                    return sum + (cell?.amount || 0);
                                                                }, 0);

                                                                return (
                                                                    <td key={colItem} className="p-3 text-xs font-black text-emerald-600 dark:text-emerald-400 text-right font-mono">
                                                                        ${colTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                                    </td>
                                                                );
                                                            })}
                                                            <td className="p-3 text-xs font-black text-emerald-600 dark:text-emerald-400 text-right font-mono">
                                                                ${overallTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                                            </td>
                                                        </tr>
                                                    </tfoot>
                                                </table>
                                            </div>
                                        </div>
                                    )}
                                </>
                            )}
                        </div>
                    </div>
                );
            })()}
        </div>
    );
};
