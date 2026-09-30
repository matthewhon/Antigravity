import React, { useState, useMemo } from 'react';
import { DetailedDonation, PcoPerson } from '../types';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer, Legend, LineChart, Line, AreaChart, Area
} from 'recharts';
import {
    format, parseISO, startOfYear, endOfYear, startOfMonth, endOfMonth,
    subMonths, subYears, startOfQuarter, endOfQuarter, addDays, addMonths,
    differenceInCalendarDays, isWithinInterval, isValid
} from 'date-fns';
import {
    Calendar, ArrowRight, ArrowUpRight, ArrowDownRight, Filter, Download,
    TrendingUp, TrendingDown, Users, DollarSign, Receipt, Sparkles,
    BarChart2, Layers, RefreshCw, ChevronRight, Search, CheckCircle2,
    CalendarRange, Repeat, HelpCircle
} from 'lucide-react';

interface GivingPeriodReportProps {
    donations: DetailedDonation[];
    people: PcoPerson[];
    initialFund?: string;
    onOpenPersonProfile?: (personId: string) => void;
}

type PeriodPreset =
    | 'ytd_vs_prior_ytd'
    | 'this_month_vs_last_month'
    | 'this_quarter_vs_last_quarter'
    | 'this_year_vs_last_year'
    | 'last_30_vs_prior_30'
    | 'last_90_vs_prior_90'
    | 'custom';

type IntervalGranularity = 'auto' | 'daily' | 'weekly' | 'monthly';
type ChartMode = 'interval' | 'cumulative';
type DonorShiftFilter = 'all' | 'increased' | 'decreased' | 'new' | 'lapsed';

const TOOLTIP_STYLE = {
    borderRadius: '16px',
    border: 'none',
    backgroundColor: '#0f172a',
    color: '#fff',
    boxShadow: '0 10px 25px -5px rgba(0, 0, 0, 0.3)',
    padding: '12px 16px',
};

const escapeCsv = (val: any) => {
    if (val === null || val === undefined) return '""';
    const s = String(val).replace(/"/g, '""');
    return `"${s}"`;
};

// Safe date formatter
const safeFormat = (date: Date | string, fmt: string) => {
    try {
        const d = typeof date === 'string' ? parseISO(date) : date;
        return isValid(d) ? format(d, fmt) : '';
    } catch {
        return '';
    }
};

export const GivingPeriodReport: React.FC<GivingPeriodReportProps> = ({
    donations,
    people,
    initialFund = '',
    onOpenPersonProfile
}) => {
    const today = useMemo(() => new Date(), []);
    const currentYear = today.getFullYear();

    // ── Presets & Dates Calculation ─────────────────────────────────────────────
    const getPresetDates = (preset: PeriodPreset) => {
        const now = new Date();
        switch (preset) {
            case 'this_month_vs_last_month': {
                const p1S = startOfMonth(now);
                const p1E = endOfMonth(now);
                const lastMo = subMonths(now, 1);
                const p2S = startOfMonth(lastMo);
                const p2E = endOfMonth(lastMo);
                return {
                    p1Start: format(p1S, 'yyyy-MM-dd'),
                    p1End: format(p1E, 'yyyy-MM-dd'),
                    p2Start: format(p2S, 'yyyy-MM-dd'),
                    p2End: format(p2E, 'yyyy-MM-dd'),
                };
            }
            case 'this_quarter_vs_last_quarter': {
                const p1S = startOfQuarter(now);
                const p1E = endOfQuarter(now);
                const lastQ = subMonths(now, 3);
                const p2S = startOfQuarter(lastQ);
                const p2E = endOfQuarter(lastQ);
                return {
                    p1Start: format(p1S, 'yyyy-MM-dd'),
                    p1End: format(p1E, 'yyyy-MM-dd'),
                    p2Start: format(p2S, 'yyyy-MM-dd'),
                    p2End: format(p2E, 'yyyy-MM-dd'),
                };
            }
            case 'this_year_vs_last_year': {
                const p1S = startOfYear(now);
                const p1E = endOfYear(now);
                const lastYr = subYears(now, 1);
                const p2S = startOfYear(lastYr);
                const p2E = endOfYear(lastYr);
                return {
                    p1Start: format(p1S, 'yyyy-MM-dd'),
                    p1End: format(p1E, 'yyyy-MM-dd'),
                    p2Start: format(p2S, 'yyyy-MM-dd'),
                    p2End: format(p2E, 'yyyy-MM-dd'),
                };
            }
            case 'last_30_vs_prior_30': {
                const p1S = addDays(now, -29);
                const p1E = now;
                const p2S = addDays(now, -59);
                const p2E = addDays(now, -30);
                return {
                    p1Start: format(p1S, 'yyyy-MM-dd'),
                    p1End: format(p1E, 'yyyy-MM-dd'),
                    p2Start: format(p2S, 'yyyy-MM-dd'),
                    p2End: format(p2E, 'yyyy-MM-dd'),
                };
            }
            case 'last_90_vs_prior_90': {
                const p1S = addDays(now, -89);
                const p1E = now;
                const p2S = addDays(now, -179);
                const p2E = addDays(now, -90);
                return {
                    p1Start: format(p1S, 'yyyy-MM-dd'),
                    p1End: format(p1E, 'yyyy-MM-dd'),
                    p2Start: format(p2S, 'yyyy-MM-dd'),
                    p2End: format(p2E, 'yyyy-MM-dd'),
                };
            }
            case 'ytd_vs_prior_ytd':
            default: {
                const p1S = startOfYear(now);
                const p1E = now;
                const p2S = startOfYear(subYears(now, 1));
                const p2E = subYears(now, 1);
                return {
                    p1Start: format(p1S, 'yyyy-MM-dd'),
                    p1End: format(p1E, 'yyyy-MM-dd'),
                    p2Start: format(p2S, 'yyyy-MM-dd'),
                    p2End: format(p2E, 'yyyy-MM-dd'),
                };
            }
        }
    };

    const initialDates = getPresetDates('ytd_vs_prior_ytd');
    const [preset, setPreset] = useState<PeriodPreset>('ytd_vs_prior_ytd');
    const [p1Start, setP1Start] = useState<string>(initialDates.p1Start);
    const [p1End, setP1End] = useState<string>(initialDates.p1End);
    const [p2Start, setP2Start] = useState<string>(initialDates.p2Start);
    const [p2End, setP2End] = useState<string>(initialDates.p2End);

    const [selectedFund, setSelectedFund] = useState<string>(initialFund);
    const [granularity, setGranularity] = useState<IntervalGranularity>('auto');
    const [chartMode, setChartMode] = useState<ChartMode>('interval');
    const [donorShiftFilter, setDonorShiftFilter] = useState<DonorShiftFilter>('all');
    const [donorSearch, setDonorSearch] = useState<string>('');

    // Handle preset changes
    const handlePresetChange = (newPreset: PeriodPreset) => {
        setPreset(newPreset);
        if (newPreset !== 'custom') {
            const dates = getPresetDates(newPreset);
            setP1Start(dates.p1Start);
            setP1End(dates.p1End);
            setP2Start(dates.p2Start);
            setP2End(dates.p2End);
        }
    };

    // Helper: Shift Period 2 to same duration immediately preceding Period 1
    const handleMatchPriorDuration = () => {
        try {
            const s1 = parseISO(p1Start);
            const e1 = parseISO(p1End);
            const days = differenceInCalendarDays(e1, s1) + 1;
            const newP2End = addDays(s1, -1);
            const newP2Start = addDays(newP2End, -(days - 1));
            setP2Start(format(newP2Start, 'yyyy-MM-dd'));
            setP2End(format(newP2End, 'yyyy-MM-dd'));
            setPreset('custom');
        } catch {
            // no-op
        }
    };

    // Helper: Shift Period 2 to same dates 1 year earlier
    const handleShiftOneYearPrior = () => {
        try {
            const s1 = parseISO(p1Start);
            const e1 = parseISO(p1End);
            setP2Start(format(subYears(s1, 1), 'yyyy-MM-dd'));
            setP2End(format(subYears(e1, 1), 'yyyy-MM-dd'));
            setPreset('custom');
        } catch {
            // no-op
        }
    };

    // Helper: Swap Period 1 and Period 2
    const handleSwapPeriods = () => {
        setP1Start(p2Start);
        setP1End(p2End);
        setP2Start(p1Start);
        setP2End(p1End);
        setPreset('custom');
    };

    // People map lookup
    const peopleMap = useMemo(() => new Map(people.map(p => [p.id, p])), [people]);

    // All available funds extracted from entire donation dataset
    const availableFunds = useMemo(() => {
        const set = new Set<string>();
        donations.forEach(d => {
            if (d.fundName && d.fundName.trim()) set.add(d.fundName.trim());
        });
        return Array.from(set).sort();
    }, [donations]);

    // Donor all-time first gift lookup (for detecting new donors during periods)
    const donorFirstGiftDateMap = useMemo(() => {
        const map = new Map<string, string>();
        donations.forEach(d => {
            if (!d.donorId || !d.date) return;
            const existing = map.get(d.donorId);
            if (!existing || new Date(d.date) < new Date(existing)) {
                map.set(d.donorId, d.date);
            }
        });
        return map;
    }, [donations]);

    // ── Filtered Donations for Period 1 & Period 2 ──────────────────────────────
    const { p1AllDonations, p2AllDonations, p1FilteredDonations, p2FilteredDonations } = useMemo(() => {
        let p1S = parseISO(p1Start);
        let p1E = parseISO(p1End);
        p1E.setHours(23, 59, 59, 999);

        let p2S = parseISO(p2Start);
        let p2E = parseISO(p2End);
        p2E.setHours(23, 59, 59, 999);

        const p1All = donations.filter(d => isWithinInterval(parseISO(d.date), { start: p1S, end: p1E }));
        const p2All = donations.filter(d => isWithinInterval(parseISO(d.date), { start: p2S, end: p2E }));

        const p1Filtered = selectedFund ? p1All.filter(d => d.fundName === selectedFund) : p1All;
        const p2Filtered = selectedFund ? p2All.filter(d => d.fundName === selectedFund) : p2All;

        return {
            p1AllDonations: p1All,
            p2AllDonations: p2All,
            p1FilteredDonations: p1Filtered,
            p2FilteredDonations: p2Filtered
        };
    }, [donations, p1Start, p1End, p2Start, p2End, selectedFund]);

    // ── Primary Summary Metrics ────────────────────────────────────────────────
    const metrics = useMemo(() => {
        const p1Total = p1FilteredDonations.reduce((sum, d) => sum + d.amount, 0);
        const p2Total = p2FilteredDonations.reduce((sum, d) => sum + d.amount, 0);
        const totalDiff = p1Total - p2Total;
        const totalPctChange = p2Total > 0 ? (totalDiff / p2Total) * 100 : p1Total > 0 ? 100 : 0;

        const p1Donors = new Set(p1FilteredDonations.map(d => d.donorId));
        const p2Donors = new Set(p2FilteredDonations.map(d => d.donorId));
        const donorDiff = p1Donors.size - p2Donors.size;
        const donorPctChange = p2Donors.size > 0 ? (donorDiff / p2Donors.size) * 100 : p1Donors.size > 0 ? 100 : 0;

        const p1Gifts = p1FilteredDonations.length;
        const p2Gifts = p2FilteredDonations.length;
        const giftsDiff = p1Gifts - p2Gifts;
        const giftsPctChange = p2Gifts > 0 ? (giftsDiff / p2Gifts) * 100 : p1Gifts > 0 ? 100 : 0;

        const p1AvgGift = p1Gifts > 0 ? p1Total / p1Gifts : 0;
        const p2AvgGift = p2Gifts > 0 ? p2Total / p2Gifts : 0;
        const avgGiftDiff = p1AvgGift - p2AvgGift;
        const avgGiftPctChange = p2AvgGift > 0 ? (avgGiftDiff / p2AvgGift) * 100 : p1AvgGift > 0 ? 100 : 0;

        const p1AvgPerDonor = p1Donors.size > 0 ? p1Total / p1Donors.size : 0;
        const p2AvgPerDonor = p2Donors.size > 0 ? p2Total / p2Donors.size : 0;

        // First-time givers in each period (whose earliest donation was in that period)
        const p1StartIso = parseISO(p1Start);
        const p1EndIso = parseISO(p1End);
        p1EndIso.setHours(23, 59, 59, 999);
        const p2StartIso = parseISO(p2Start);
        const p2EndIso = parseISO(p2End);
        p2EndIso.setHours(23, 59, 59, 999);

        let p1NewDonors = 0;
        p1Donors.forEach(id => {
            const firstDate = donorFirstGiftDateMap.get(id);
            if (firstDate && isWithinInterval(parseISO(firstDate), { start: p1StartIso, end: p1EndIso })) {
                p1NewDonors++;
            }
        });

        let p2NewDonors = 0;
        p2Donors.forEach(id => {
            const firstDate = donorFirstGiftDateMap.get(id);
            if (firstDate && isWithinInterval(parseISO(firstDate), { start: p2StartIso, end: p2EndIso })) {
                p2NewDonors++;
            }
        });
        const newDonorsDiff = p1NewDonors - p2NewDonors;

        // Share of total church giving (if filtered by fund)
        const p1ChurchTotal = p1AllDonations.reduce((sum, d) => sum + d.amount, 0);
        const p2ChurchTotal = p2AllDonations.reduce((sum, d) => sum + d.amount, 0);
        const p1FundShare = p1ChurchTotal > 0 ? (p1Total / p1ChurchTotal) * 100 : 0;
        const p2FundShare = p2ChurchTotal > 0 ? (p2Total / p2ChurchTotal) * 100 : 0;

        return {
            p1Total,
            p2Total,
            totalDiff,
            totalPctChange,
            p1DonorsCount: p1Donors.size,
            p2DonorsCount: p2Donors.size,
            donorDiff,
            donorPctChange,
            p1Gifts,
            p2Gifts,
            giftsDiff,
            giftsPctChange,
            p1AvgGift,
            p2AvgGift,
            avgGiftDiff,
            avgGiftPctChange,
            p1AvgPerDonor,
            p2AvgPerDonor,
            p1NewDonors,
            p2NewDonors,
            newDonorsDiff,
            p1FundShare,
            p2FundShare,
            p1ChurchTotal,
            p2ChurchTotal
        };
    }, [p1FilteredDonations, p2FilteredDonations, p1AllDonations, p2AllDonations, p1Start, p1End, p2Start, p2End, donorFirstGiftDateMap]);

    // ── Determine Granularity & Bucket Intervals ────────────────────────────────
    const resolvedGranularity = useMemo((): 'daily' | 'weekly' | 'monthly' => {
        if (granularity !== 'auto') return granularity;
        const days = differenceInCalendarDays(parseISO(p1End), parseISO(p1Start)) + 1;
        if (days <= 45) return 'daily';
        if (days <= 180) return 'weekly';
        return 'monthly';
    }, [granularity, p1Start, p1End]);

    // ── Comparison Chart & Interval Bucket Data ─────────────────────────────────
    const { chartData, intervalBuckets } = useMemo(() => {
        const s1 = parseISO(p1Start);
        const e1 = parseISO(p1End);
        const s2 = parseISO(p2Start);
        const e2 = parseISO(p2End);

        const days1 = differenceInCalendarDays(e1, s1) + 1;
        const days2 = differenceInCalendarDays(e2, s2) + 1;
        const maxDays = Math.max(days1, days2, 1);

        interface BucketSlice {
            index: number;
            label: string;
            p1Label: string;
            p2Label: string;
            p1Amount: number;
            p2Amount: number;
            p1Cumulative: number;
            p2Cumulative: number;
            diff: number;
            diffPct: number;
            p1Gifts: number;
            p2Gifts: number;
            p1Donors: number;
            p2Donors: number;
        }

        const slices: BucketSlice[] = [];
        let p1Running = 0;
        let p2Running = 0;

        if (resolvedGranularity === 'monthly') {
            const monthsCount = Math.max(
                (e1.getFullYear() - s1.getFullYear()) * 12 + (e1.getMonth() - s1.getMonth()) + 1,
                (e2.getFullYear() - s2.getFullYear()) * 12 + (e2.getMonth() - s2.getMonth()) + 1,
                1
            );

            for (let i = 0; i < monthsCount; i++) {
                const p1SliceStart = addMonths(startOfMonth(s1), i);
                const p1SliceEnd = endOfMonth(p1SliceStart);
                p1SliceEnd.setHours(23, 59, 59, 999);

                const p2SliceStart = addMonths(startOfMonth(s2), i);
                const p2SliceEnd = endOfMonth(p2SliceStart);
                p2SliceEnd.setHours(23, 59, 59, 999);

                // Check donations in slices
                const p1DonationsInSlice = p1FilteredDonations.filter(d => {
                    const dt = parseISO(d.date);
                    return dt >= p1SliceStart && dt <= p1SliceEnd;
                });
                const p2DonationsInSlice = p2FilteredDonations.filter(d => {
                    const dt = parseISO(d.date);
                    return dt >= p2SliceStart && dt <= p2SliceEnd;
                });

                const p1Amt = p1DonationsInSlice.reduce((s, d) => s + d.amount, 0);
                const p2Amt = p2DonationsInSlice.reduce((s, d) => s + d.amount, 0);
                p1Running += p1Amt;
                p2Running += p2Amt;

                const diff = p1Amt - p2Amt;
                const diffPct = p2Amt > 0 ? (diff / p2Amt) * 100 : p1Amt > 0 ? 100 : 0;

                // Month label (e.g. Jan, Feb if same year alignment or Month 1..N)
                const monthName = format(p1SliceStart, 'MMM');
                const label = monthsCount <= 12 ? monthName : `${monthName} (${i + 1})`;

                slices.push({
                    index: i,
                    label,
                    p1Label: format(p1SliceStart, 'MMM yyyy'),
                    p2Label: format(p2SliceStart, 'MMM yyyy'),
                    p1Amount: p1Amt,
                    p2Amount: p2Amt,
                    p1Cumulative: p1Running,
                    p2Cumulative: p2Running,
                    diff,
                    diffPct,
                    p1Gifts: p1DonationsInSlice.length,
                    p2Gifts: p2DonationsInSlice.length,
                    p1Donors: new Set(p1DonationsInSlice.map(d => d.donorId)).size,
                    p2Donors: new Set(p2DonationsInSlice.map(d => d.donorId)).size,
                });
            }
        } else if (resolvedGranularity === 'weekly') {
            const weeksCount = Math.ceil(maxDays / 7);

            for (let i = 0; i < weeksCount; i++) {
                const p1SliceStart = addDays(s1, i * 7);
                const p1SliceEnd = addDays(p1SliceStart, 6);
                p1SliceEnd.setHours(23, 59, 59, 999);

                const p2SliceStart = addDays(s2, i * 7);
                const p2SliceEnd = addDays(p2SliceStart, 6);
                p2SliceEnd.setHours(23, 59, 59, 999);

                const p1DonationsInSlice = p1FilteredDonations.filter(d => {
                    const dt = parseISO(d.date);
                    return dt >= p1SliceStart && dt <= p1SliceEnd;
                });
                const p2DonationsInSlice = p2FilteredDonations.filter(d => {
                    const dt = parseISO(d.date);
                    return dt >= p2SliceStart && dt <= p2SliceEnd;
                });

                const p1Amt = p1DonationsInSlice.reduce((s, d) => s + d.amount, 0);
                const p2Amt = p2DonationsInSlice.reduce((s, d) => s + d.amount, 0);
                p1Running += p1Amt;
                p2Running += p2Amt;

                const diff = p1Amt - p2Amt;
                const diffPct = p2Amt > 0 ? (diff / p2Amt) * 100 : p1Amt > 0 ? 100 : 0;

                slices.push({
                    index: i,
                    label: `Wk ${i + 1}`,
                    p1Label: `${format(p1SliceStart, 'MMM d')} – ${format(p1SliceEnd, 'MMM d')}`,
                    p2Label: `${format(p2SliceStart, 'MMM d')} – ${format(p2SliceEnd, 'MMM d')}`,
                    p1Amount: p1Amt,
                    p2Amount: p2Amt,
                    p1Cumulative: p1Running,
                    p2Cumulative: p2Running,
                    diff,
                    diffPct,
                    p1Gifts: p1DonationsInSlice.length,
                    p2Gifts: p2DonationsInSlice.length,
                    p1Donors: new Set(p1DonationsInSlice.map(d => d.donorId)).size,
                    p2Donors: new Set(p2DonationsInSlice.map(d => d.donorId)).size,
                });
            }
        } else {
            // Daily granularity
            const daysCount = maxDays;

            for (let i = 0; i < daysCount; i++) {
                const p1SliceStart = addDays(s1, i);
                const p1SliceEnd = new Date(p1SliceStart);
                p1SliceEnd.setHours(23, 59, 59, 999);

                const p2SliceStart = addDays(s2, i);
                const p2SliceEnd = new Date(p2SliceStart);
                p2SliceEnd.setHours(23, 59, 59, 999);

                const p1DonationsInSlice = p1FilteredDonations.filter(d => {
                    const dt = parseISO(d.date);
                    return dt >= p1SliceStart && dt <= p1SliceEnd;
                });
                const p2DonationsInSlice = p2FilteredDonations.filter(d => {
                    const dt = parseISO(d.date);
                    return dt >= p2SliceStart && dt <= p2SliceEnd;
                });

                const p1Amt = p1DonationsInSlice.reduce((s, d) => s + d.amount, 0);
                const p2Amt = p2DonationsInSlice.reduce((s, d) => s + d.amount, 0);
                p1Running += p1Amt;
                p2Running += p2Amt;

                const diff = p1Amt - p2Amt;
                const diffPct = p2Amt > 0 ? (diff / p2Amt) * 100 : p1Amt > 0 ? 100 : 0;

                slices.push({
                    index: i,
                    label: `Day ${i + 1}`,
                    p1Label: format(p1SliceStart, 'MMM d, yyyy'),
                    p2Label: format(p2SliceStart, 'MMM d, yyyy'),
                    p1Amount: p1Amt,
                    p2Amount: p2Amt,
                    p1Cumulative: p1Running,
                    p2Cumulative: p2Running,
                    diff,
                    diffPct,
                    p1Gifts: p1DonationsInSlice.length,
                    p2Gifts: p2DonationsInSlice.length,
                    p1Donors: new Set(p1DonationsInSlice.map(d => d.donorId)).size,
                    p2Donors: new Set(p2DonationsInSlice.map(d => d.donorId)).size,
                });
            }
        }

        return {
            chartData: slices,
            intervalBuckets: slices
        };
    }, [resolvedGranularity, p1Start, p1End, p2Start, p2End, p1FilteredDonations, p2FilteredDonations]);

    // ── Breakdown By Fund Comparison ───────────────────────────────────────────
    const fundComparisonData = useMemo(() => {
        const FUND_PALETTE = ['#6366f1', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6', '#f43f5e', '#ec4899', '#14b8a6', '#3b82f6', '#84cc16'];

        const fundList = availableFunds.map((fundName, idx) => {
            const p1Gifts = p1AllDonations.filter(d => d.fundName === fundName);
            const p2Gifts = p2AllDonations.filter(d => d.fundName === fundName);

            const p1Total = p1Gifts.reduce((s, d) => s + d.amount, 0);
            const p2Total = p2Gifts.reduce((s, d) => s + d.amount, 0);
            const diff = p1Total - p2Total;
            const pctChange = p2Total > 0 ? (diff / p2Total) * 100 : p1Total > 0 ? 100 : 0;

            const p1Share = metrics.p1ChurchTotal > 0 ? (p1Total / metrics.p1ChurchTotal) * 100 : 0;
            const p2Share = metrics.p2ChurchTotal > 0 ? (p2Total / metrics.p2ChurchTotal) * 100 : 0;

            const p1Donors = new Set(p1Gifts.map(d => d.donorId)).size;
            const p2Donors = new Set(p2Gifts.map(d => d.donorId)).size;

            return {
                fundName,
                color: FUND_PALETTE[idx % FUND_PALETTE.length],
                p1Total,
                p2Total,
                diff,
                pctChange,
                p1Share,
                p2Share,
                p1GiftsCount: p1Gifts.length,
                p2GiftsCount: p2Gifts.length,
                p1Donors,
                p2Donors,
            };
        }).filter(f => f.p1Total > 0 || f.p2Total > 0);

        // Sort descending by Period 1 total
        fundList.sort((a, b) => b.p1Total - a.p1Total);

        return fundList;
    }, [availableFunds, p1AllDonations, p2AllDonations, metrics.p1ChurchTotal, metrics.p2ChurchTotal]);

    // ── Donor Shift & Retention Analysis ───────────────────────────────────────
    const { donorShiftSummary, filteredDonorShiftList } = useMemo(() => {
        const donorMap = new Map<string, {
            donorId: string;
            name: string;
            email: string;
            phone: string;
            membership: string;
            p1Total: number;
            p2Total: number;
            p1Count: number;
            p2Count: number;
            firstGiftDate?: string;
        }>();

        p1FilteredDonations.forEach(d => {
            if (!donorMap.has(d.donorId)) {
                const person = peopleMap.get(d.donorId);
                donorMap.set(d.donorId, {
                    donorId: d.donorId,
                    name: d.donorName || person?.name || 'Anonymous',
                    email: person?.email || '',
                    phone: person?.phone_numbers?.[0]?.number || '',
                    membership: (person as any)?.membershipStatus || (person as any)?.membership || 'Member',
                    p1Total: 0,
                    p2Total: 0,
                    p1Count: 0,
                    p2Count: 0,
                    firstGiftDate: donorFirstGiftDateMap.get(d.donorId),
                });
            }
            const rec = donorMap.get(d.donorId)!;
            rec.p1Total += d.amount;
            rec.p1Count += 1;
        });

        p2FilteredDonations.forEach(d => {
            if (!donorMap.has(d.donorId)) {
                const person = peopleMap.get(d.donorId);
                donorMap.set(d.donorId, {
                    donorId: d.donorId,
                    name: d.donorName || person?.name || 'Anonymous',
                    email: person?.email || '',
                    phone: person?.phone_numbers?.[0]?.number || '',
                    membership: (person as any)?.membershipStatus || (person as any)?.membership || 'Member',
                    p1Total: 0,
                    p2Total: 0,
                    p1Count: 0,
                    p2Count: 0,
                    firstGiftDate: donorFirstGiftDateMap.get(d.donorId),
                });
            }
            const rec = donorMap.get(d.donorId)!;
            rec.p2Total += d.amount;
            rec.p2Count += 1;
        });

        let increasedCount = 0;
        let decreasedCount = 0;
        let newCount = 0;
        let lapsedCount = 0;
        let maintainedCount = 0;

        const allDonorsList = Array.from(donorMap.values()).map(d => {
            const diff = d.p1Total - d.p2Total;
            const pctChange = d.p2Total > 0 ? (diff / d.p2Total) * 100 : d.p1Total > 0 ? 100 : 0;

            let category: 'new' | 'lapsed' | 'increased' | 'decreased' | 'maintained';
            if (d.p2Total === 0 && d.p1Total > 0) {
                category = 'new';
                newCount++;
            } else if (d.p1Total === 0 && d.p2Total > 0) {
                category = 'lapsed';
                lapsedCount++;
            } else if (diff > 1) {
                category = 'increased';
                increasedCount++;
            } else if (diff < -1) {
                category = 'decreased';
                decreasedCount++;
            } else {
                category = 'maintained';
                maintainedCount++;
            }

            return {
                ...d,
                diff,
                pctChange,
                category,
            };
        });

        // Filter by shift status & search query
        let filtered = allDonorsList;
        if (donorShiftFilter !== 'all') {
            filtered = filtered.filter(d => d.category === donorShiftFilter);
        }
        if (donorSearch.trim()) {
            const q = donorSearch.toLowerCase().trim();
            filtered = filtered.filter(d =>
                d.name.toLowerCase().includes(q) ||
                d.email.toLowerCase().includes(q) ||
                d.membership.toLowerCase().includes(q)
            );
        }

        // Sort descending by variance absolute or P1 total
        filtered.sort((a, b) => Math.abs(b.diff) - Math.abs(a.diff));

        return {
            donorShiftSummary: {
                totalActiveDonors: allDonorsList.length,
                increasedCount,
                decreasedCount,
                newCount,
                lapsedCount,
                maintainedCount,
            },
            filteredDonorShiftList: filtered,
        };
    }, [p1FilteredDonations, p2FilteredDonations, peopleMap, donorFirstGiftDateMap, donorShiftFilter, donorSearch]);

    // ── CSV Export Function ─────────────────────────────────────────────────────
    const handleDownloadCSV = () => {
        const p1Title = `Period 1 (${p1Start} to ${p1End})`;
        const p2Title = `Period 2 (${p2Start} to ${p2End})`;
        const fundLabel = selectedFund ? `Fund: ${selectedFund}` : 'All Funds';

        const lines: string[] = [
            `"GIVING PERIOD COMPARISON REPORT"`,
            `"Generated: ${format(new Date(), 'yyyy-MM-dd HH:mm')}"`,
            `"Filter: ${fundLabel}"`,
            `"Period 1: ${p1Start} to ${p1End}"`,
            `"Period 2: ${p2Start} to ${p2End}"`,
            '',
            `"EXECUTIVE SUMMARY METRICS"`,
            `"Metric","${p1Title}","${p2Title}","Variance ($)","Growth (%)"`,
            `"Total Giving","$${metrics.p1Total.toFixed(2)}","$${metrics.p2Total.toFixed(2)}","$${metrics.totalDiff.toFixed(2)}","${metrics.totalPctChange.toFixed(1)}%"`,
            `"Unique Givers","${metrics.p1DonorsCount}","${metrics.p2DonorsCount}","${metrics.donorDiff}","${metrics.donorPctChange.toFixed(1)}%"`,
            `"Total Gifts","${metrics.p1Gifts}","${metrics.p2Gifts}","${metrics.giftsDiff}","${metrics.giftsPctChange.toFixed(1)}%"`,
            `"Avg Gift Size","$${metrics.p1AvgGift.toFixed(2)}","$${metrics.p2AvgGift.toFixed(2)}","$${metrics.avgGiftDiff.toFixed(2)}","${metrics.avgGiftPctChange.toFixed(1)}%"`,
            `"First-Time Donors","${metrics.p1NewDonors}","${metrics.p2NewDonors}","${metrics.newDonorsDiff}","-"`,
            '',
            `"TIMELINE INTERVAL COMPARISON (${resolvedGranularity.toUpperCase()})"`,
            `"Interval","Period 1 Dates","Period 1 Amount ($)","Period 2 Dates","Period 2 Amount ($)","Net Variance ($)","Change (%)"`,
            ...intervalBuckets.map(b => [
                escapeCsv(b.label),
                escapeCsv(b.p1Label),
                b.p1Amount.toFixed(2),
                escapeCsv(b.p2Label),
                b.p2Amount.toFixed(2),
                b.diff.toFixed(2),
                escapeCsv(b.diffPct.toFixed(1) + '%')
            ].join(',')),
            '',
            `"FUND COMPARISON BREAKDOWN"`,
            `"Fund Name","Period 1 Total ($)","Period 1 Share (%)","Period 2 Total ($)","Period 2 Share (%)","Variance ($)","Change (%)","Period 1 Donors","Period 2 Donors"`,
            ...fundComparisonData.map(f => [
                escapeCsv(f.fundName),
                f.p1Total.toFixed(2),
                escapeCsv(f.p1Share.toFixed(1) + '%'),
                f.p2Total.toFixed(2),
                escapeCsv(f.p2Share.toFixed(1) + '%'),
                f.diff.toFixed(2),
                escapeCsv(f.pctChange.toFixed(1) + '%'),
                f.p1Donors,
                f.p2Donors
            ].join(',')),
            '',
            `"DONOR PARTICIPATION & MOVEMENT"`,
            `"Donor Name","Email","Membership","Period 1 Giving ($)","Period 2 Giving ($)","Variance ($)","Change (%)","Movement Category"`,
            ...filteredDonorShiftList.map(d => [
                escapeCsv(d.name),
                escapeCsv(d.email),
                escapeCsv(d.membership),
                d.p1Total.toFixed(2),
                d.p2Total.toFixed(2),
                d.diff.toFixed(2),
                escapeCsv(d.pctChange.toFixed(1) + '%'),
                escapeCsv(d.category)
            ].join(','))
        ];

        const csvContent = lines.join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `giving_period_comparison_${selectedFund ? selectedFund.toLowerCase().replace(/\s+/g, '_') + '_' : ''}${format(new Date(), 'yyyyMMdd')}.csv`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    // Styling constants
    const axisColor = '#94a3b8';
    const p1Color = '#6366f1'; // Indigo
    const p2Color = '#f59e0b'; // Amber

    return (
        <div className="space-y-8 animate-in fade-in duration-300">
            {/* ── Top Header & Controls Panel ──────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm p-6 lg:p-8 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <span className="p-2 rounded-xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400">
                                <CalendarRange size={22} strokeWidth={2.5} />
                            </span>
                            <h3 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                                Giving Period Comparison
                            </h3>
                        </div>
                        <p className="text-xs font-semibold text-slate-400 dark:text-slate-500 uppercase tracking-wider mt-1.5 ml-1">
                            Compare giving performance, donor retention, and fund pacing across time periods
                        </p>
                    </div>

                    <div className="flex items-center gap-3">
                        <button
                            onClick={handleDownloadCSV}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl font-bold text-xs uppercase tracking-wide transition-all shadow-sm hover:shadow-indigo-500/20 flex items-center gap-2"
                        >
                            <Download size={15} strokeWidth={2.5} />
                            <span>Download CSV</span>
                        </button>
                    </div>
                </div>

                {/* Filter and Period Selection Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 pt-2 border-t border-slate-100 dark:border-slate-700/60">
                    {/* 1. Comparison Preset Selector */}
                    <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1.5">
                            Comparison Preset
                        </label>
                        <select
                            value={preset}
                            onChange={(e) => handlePresetChange(e.target.value as PeriodPreset)}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="ytd_vs_prior_ytd">YTD vs. Prior Year YTD</option>
                            <option value="this_month_vs_last_month">This Month vs. Last Month</option>
                            <option value="this_quarter_vs_last_quarter">This Quarter vs. Last Quarter</option>
                            <option value="this_year_vs_last_year">This Year vs. Last Year</option>
                            <option value="last_30_vs_prior_30">Last 30 Days vs. Prior 30 Days</option>
                            <option value="last_90_vs_prior_90">Last 90 Days vs. Prior 90 Days</option>
                            <option value="custom">Custom Date Comparison</option>
                        </select>
                    </div>

                    {/* 2. Fund Filter Dropdown (Crucial Requirement!) */}
                    <div>
                        <div className="flex items-center justify-between mb-1.5">
                            <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider">
                                Filter by Fund
                            </label>
                            {selectedFund && (
                                <button
                                    onClick={() => setSelectedFund('')}
                                    className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                >
                                    Clear
                                </button>
                            )}
                        </div>
                        <select
                            aria-label="Filter by Fund"
                            value={selectedFund}
                            onChange={(e) => setSelectedFund(e.target.value)}
                            className={`w-full border rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 transition-all ${
                                selectedFund
                                    ? 'bg-indigo-50/50 dark:bg-indigo-950/30 border-indigo-300 dark:border-indigo-700 text-indigo-900 dark:text-indigo-200 ring-1 ring-indigo-500/20'
                                    : 'bg-slate-50 dark:bg-slate-900 border-slate-200 dark:border-slate-700 text-slate-800 dark:text-slate-200'
                            }`}
                        >
                            <option value="">🏛️ All Funds (Combined)</option>
                            {availableFunds.map(fund => (
                                <option key={fund} value={fund}>
                                    {fund}
                                </option>
                            ))}
                        </select>
                    </div>

                    {/* 3. Granularity Selector */}
                    <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1.5">
                            Chart Interval
                        </label>
                        <select
                            value={granularity}
                            onChange={(e) => setGranularity(e.target.value as IntervalGranularity)}
                            className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3.5 py-2.5 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value="auto">Auto ({resolvedGranularity})</option>
                            <option value="daily">Daily</option>
                            <option value="weekly">Weekly</option>
                            <option value="monthly">Monthly</option>
                        </select>
                    </div>

                    {/* 4. Chart Visualization Mode */}
                    <div>
                        <label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-wider mb-1.5">
                            Chart Visualization
                        </label>
                        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl border border-slate-200/80 dark:border-slate-700">
                            <button
                                onClick={() => setChartMode('interval')}
                                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                                    chartMode === 'interval'
                                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                                }`}
                            >
                                <BarChart2 size={14} />
                                <span>Interval Bars</span>
                            </button>
                            <button
                                onClick={() => setChartMode('cumulative')}
                                className={`flex-1 py-1.5 px-3 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-all ${
                                    chartMode === 'cumulative'
                                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                                }`}
                            >
                                <TrendingUp size={14} />
                                <span>Cumulative</span>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Period 1 & Period 2 Date Pickers with Quick-Action Shortcuts */}
                <div className="p-4 rounded-2xl bg-slate-50/70 dark:bg-slate-900/50 border border-slate-200/70 dark:border-slate-700/60 flex flex-col lg:flex-row items-center justify-between gap-4">
                    {/* Period 1 Picker */}
                    <div className="flex items-center gap-3 w-full lg:w-auto">
                        <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded-full bg-indigo-600 shadow-sm" />
                            <span className="text-xs font-black uppercase text-indigo-700 dark:text-indigo-300 tracking-wide">
                                Period 1 (Base):
                            </span>
                        </div>
                        <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                            <input
                                type="date"
                                aria-label="Period 1 Start Date"
                                value={p1Start}
                                onChange={(e) => { setP1Start(e.target.value); setPreset('custom'); }}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none"
                            />
                            <span className="text-slate-400 font-bold">to</span>
                            <input
                                type="date"
                                aria-label="Period 1 End Date"
                                value={p1End}
                                onChange={(e) => { setP1End(e.target.value); setPreset('custom'); }}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none"
                            />
                        </div>
                    </div>

                    {/* Middle Indicator */}
                    <div className="flex items-center gap-2 text-slate-400 text-xs font-black uppercase tracking-widest">
                        <span>VS</span>
                    </div>

                    {/* Period 2 Picker */}
                    <div className="flex items-center gap-3 w-full lg:w-auto">
                        <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded-full bg-amber-500 shadow-sm" />
                            <span className="text-xs font-black uppercase text-amber-600 dark:text-amber-400 tracking-wide">
                                Period 2 (Comparison):
                            </span>
                        </div>
                        <div className="flex items-center gap-2 flex-1 sm:flex-initial">
                            <input
                                type="date"
                                aria-label="Period 2 Start Date"
                                value={p2Start}
                                onChange={(e) => { setP2Start(e.target.value); setPreset('custom'); }}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none"
                            />
                            <span className="text-slate-400 font-bold">to</span>
                            <input
                                type="date"
                                aria-label="Period 2 End Date"
                                value={p2End}
                                onChange={(e) => { setP2End(e.target.value); setPreset('custom'); }}
                                className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-1.5 text-xs font-bold text-slate-800 dark:text-slate-200 outline-none"
                            />
                        </div>
                    </div>

                    {/* Quick Shift Helper Buttons */}
                    <div className="flex items-center gap-1.5 self-end lg:self-center ml-auto">
                        <button
                            type="button"
                            onClick={handleShiftOneYearPrior}
                            title="Set Period 2 to exact same dates 1 year prior"
                            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 transition-colors shadow-xs"
                        >
                            ⏪ 1 Yr Prior
                        </button>
                        <button
                            type="button"
                            onClick={handleMatchPriorDuration}
                            title="Set Period 2 to preceding window of identical duration"
                            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 transition-colors shadow-xs"
                        >
                            ⏱️ Preceding Window
                        </button>
                        <button
                            type="button"
                            onClick={handleSwapPeriods}
                            title="Swap Period 1 and Period 2"
                            className="px-2.5 py-1.5 rounded-lg bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[11px] font-bold text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 hover:bg-slate-100 transition-colors shadow-xs"
                        >
                            ⇄ Swap
                        </button>
                    </div>
                </div>

                {/* Filter info badge */}
                {selectedFund && (
                    <div className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 text-indigo-700 dark:text-indigo-300 text-xs font-bold w-fit border border-indigo-100 dark:border-indigo-900/50">
                        <span>Filtered by Fund: <strong>{selectedFund}</strong></span>
                        <span className="text-slate-400">·</span>
                        <span className="text-[11px] text-slate-500 dark:text-slate-400">
                            {metrics.p1FundShare.toFixed(1)}% of church giving in Period 1 ({metrics.p2FundShare.toFixed(1)}% in Period 2)
                        </span>
                        <button
                            onClick={() => setSelectedFund('')}
                            className="ml-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 font-black"
                        >
                            ✕
                        </button>
                    </div>
                )}
            </div>

            {/* ── Key Financial KPI Metric Cards ───────────────────────────────────── */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                {/* 1. Total Giving */}
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Total Giving
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                            metrics.totalDiff >= 0
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                        }`}>
                            {metrics.totalDiff >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            {metrics.totalPctChange >= 0 ? '+' : ''}{metrics.totalPctChange.toFixed(1)}%
                        </span>
                    </div>

                    <div>
                        <div className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                            ${metrics.p1Total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
                            <span>Period 2: ${metrics.p2Total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span className={`font-mono font-bold ${metrics.totalDiff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {metrics.totalDiff >= 0 ? '+' : ''}${metrics.totalDiff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                            </span>
                        </div>
                    </div>
                </div>

                {/* 2. Active Donors */}
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Active Givers (Donors)
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                            metrics.donorDiff >= 0
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                        }`}>
                            {metrics.donorDiff >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            {metrics.donorPctChange >= 0 ? '+' : ''}{metrics.donorPctChange.toFixed(1)}%
                        </span>
                    </div>

                    <div>
                        <div className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                            {metrics.p1DonorsCount} <span className="text-base font-normal text-slate-400">givers</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
                            <span>Period 2: {metrics.p2DonorsCount} givers</span>
                            <span className={`font-mono font-bold ${metrics.donorDiff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {metrics.donorDiff >= 0 ? '+' : ''}{metrics.donorDiff} givers
                            </span>
                        </div>
                    </div>
                </div>

                {/* 3. Total Gifts / Transactions */}
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Gift Transactions
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                            metrics.giftsDiff >= 0
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                        }`}>
                            {metrics.giftsDiff >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            {metrics.giftsPctChange >= 0 ? '+' : ''}{metrics.giftsPctChange.toFixed(1)}%
                        </span>
                    </div>

                    <div>
                        <div className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                            {metrics.p1Gifts} <span className="text-base font-normal text-slate-400">gifts</span>
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
                            <span>Period 2: {metrics.p2Gifts} gifts</span>
                            <span className={`font-mono font-bold ${metrics.giftsDiff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'}`}>
                                {metrics.giftsDiff >= 0 ? '+' : ''}{metrics.giftsDiff} gifts
                            </span>
                        </div>
                    </div>
                </div>

                {/* 4. Average Gift & New Donors */}
                <div className="p-6 rounded-3xl bg-white dark:bg-slate-800 border border-slate-100 dark:border-slate-700 shadow-sm flex flex-col justify-between space-y-4">
                    <div className="flex items-center justify-between">
                        <span className="text-[10px] font-black uppercase tracking-wider text-slate-400 dark:text-slate-500">
                            Average Gift Size
                        </span>
                        <span className={`inline-flex items-center gap-1 text-[11px] font-black px-2.5 py-0.5 rounded-full ${
                            metrics.avgGiftDiff >= 0
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-400'
                                : 'bg-rose-100 text-rose-700 dark:bg-rose-950/60 dark:text-rose-400'
                        }`}>
                            {metrics.avgGiftDiff >= 0 ? <ArrowUpRight size={14} /> : <ArrowDownRight size={14} />}
                            {metrics.avgGiftPctChange >= 0 ? '+' : ''}{metrics.avgGiftPctChange.toFixed(1)}%
                        </span>
                    </div>

                    <div>
                        <div className="text-3xl font-black text-slate-900 dark:text-white font-mono tracking-tight">
                            ${metrics.p1AvgGift.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                        </div>
                        <div className="flex items-center justify-between text-xs text-slate-500 dark:text-slate-400 mt-2 font-medium">
                            <span>Period 2: ${metrics.p2AvgGift.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span className="text-indigo-600 dark:text-indigo-400 font-bold">
                                {metrics.p1NewDonors} New Givers
                            </span>
                        </div>
                    </div>
                </div>
            </div>

            {/* ── Main Comparison Chart Section ────────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm p-6 lg:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h4 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                            <span>{chartMode === 'interval' ? 'Interval Giving Comparison' : 'Cumulative Giving Pacing'}</span>
                            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                {resolvedGranularity.toUpperCase()}
                            </span>
                        </h4>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            {chartMode === 'interval'
                                ? `Giving dollars per ${resolvedGranularity} interval aligned side-by-side`
                                : `Cumulative dollar trajectory tracking Period 1 against Period 2`}
                        </p>
                    </div>

                    {/* Chart Legend with Color Swatches */}
                    <div className="flex items-center gap-6 text-xs font-bold">
                        <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded-md bg-indigo-600 shadow-sm" />
                            <span className="text-slate-800 dark:text-slate-200">
                                Period 1 ({p1Start.slice(0, 4)}): <strong className="font-mono">${metrics.p1Total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                            </span>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="w-3.5 h-3.5 rounded-md bg-amber-500 shadow-sm" />
                            <span className="text-slate-800 dark:text-slate-200">
                                Period 2 ({p2Start.slice(0, 4)}): <strong className="font-mono">${metrics.p2Total.toLocaleString(undefined, { maximumFractionDigits: 0 })}</strong>
                            </span>
                        </div>
                    </div>
                </div>

                {chartData.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-64 text-center gap-2">
                        <span className="text-4xl opacity-20">📊</span>
                        <p className="text-xs font-bold text-slate-400">No giving data found in the selected periods</p>
                        <p className="text-[11px] text-slate-400">Try adjusting the dates or selecting a different fund.</p>
                    </div>
                ) : (
                    <div className="h-80 w-full pt-4">
                        <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                            {chartMode === 'interval' ? (
                                <BarChart data={chartData} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="label"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 11, fill: axisColor, fontWeight: 600 }}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fill: axisColor, fontWeight: 600 }}
                                        tickFormatter={(v: number) => `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                                    />
                                    <Tooltip
                                        contentStyle={TOOLTIP_STYLE}
                                        cursor={{ fill: 'rgba(241, 245, 249, 0.4)' }}
                                        content={({ active, payload }) => {
                                            if (!active || !payload || !payload.length) return null;
                                            const d = payload[0].payload;
                                            return (
                                                <div className="space-y-3 min-w-[220px]">
                                                    <div className="border-b border-slate-700/80 pb-2">
                                                        <span className="text-xs font-black text-white">{d.label}</span>
                                                    </div>
                                                    <div className="space-y-1.5 text-xs">
                                                        <div className="flex items-center justify-between gap-4">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" />
                                                                <span className="text-slate-300 font-medium">Period 1 ({d.p1Label})</span>
                                                            </div>
                                                            <span className="font-mono font-bold text-white">
                                                                ${d.p1Amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-4">
                                                            <div className="flex items-center gap-1.5">
                                                                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" />
                                                                <span className="text-slate-300 font-medium">Period 2 ({d.p2Label})</span>
                                                            </div>
                                                            <span className="font-mono font-bold text-white">
                                                                ${d.p2Amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="border-t border-slate-700/80 pt-2 flex items-center justify-between text-xs">
                                                        <span className="text-slate-400 font-medium">Variance:</span>
                                                        <span className={`font-mono font-black ${d.diff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                            {d.diff >= 0 ? '+' : ''}${d.diff.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({d.diffPct >= 0 ? '+' : ''}{d.diffPct.toFixed(1)}%)
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Bar
                                        dataKey="p1Amount"
                                        name="Period 1"
                                        fill={p1Color}
                                        radius={[6, 6, 0, 0]}
                                        maxBarSize={40}
                                    />
                                    <Bar
                                        dataKey="p2Amount"
                                        name="Period 2"
                                        fill={p2Color}
                                        radius={[6, 6, 0, 0]}
                                        maxBarSize={40}
                                    />
                                </BarChart>
                            ) : (
                                <AreaChart data={chartData} margin={{ left: 10, right: 10, top: 10, bottom: 5 }}>
                                    <defs>
                                        <linearGradient id="p1Grad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={p1Color} stopOpacity={0.4} />
                                            <stop offset="95%" stopColor={p1Color} stopOpacity={0.0} />
                                        </linearGradient>
                                        <linearGradient id="p2Grad" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor={p2Color} stopOpacity={0.3} />
                                            <stop offset="95%" stopColor={p2Color} stopOpacity={0.0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                                    <XAxis
                                        dataKey="label"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 11, fill: axisColor, fontWeight: 600 }}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 10, fill: axisColor, fontWeight: 600 }}
                                        tickFormatter={(v: number) => `$${v >= 1000 ? `${Math.round(v / 1000)}k` : v}`}
                                    />
                                    <Tooltip
                                        contentStyle={TOOLTIP_STYLE}
                                        content={({ active, payload }) => {
                                            if (!active || !payload || !payload.length) return null;
                                            const d = payload[0].payload;
                                            const cumDiff = d.p1Cumulative - d.p2Cumulative;
                                            const cumDiffPct = d.p2Cumulative > 0 ? (cumDiff / d.p2Cumulative) * 100 : 0;
                                            return (
                                                <div className="space-y-3 min-w-[220px]">
                                                    <div className="border-b border-slate-700/80 pb-2">
                                                        <span className="text-xs font-black text-white">Cumulative through {d.label}</span>
                                                    </div>
                                                    <div className="space-y-1.5 text-xs">
                                                        <div className="flex items-center justify-between gap-4">
                                                            <span className="text-slate-300 font-medium">Period 1 Running Total:</span>
                                                            <span className="font-mono font-bold text-indigo-400">
                                                                ${d.p1Cumulative.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                        <div className="flex items-center justify-between gap-4">
                                                            <span className="text-slate-300 font-medium">Period 2 Running Total:</span>
                                                            <span className="font-mono font-bold text-amber-400">
                                                                ${d.p2Cumulative.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="border-t border-slate-700/80 pt-2 flex items-center justify-between text-xs">
                                                        <span className="text-slate-400 font-medium">Pacing Variance:</span>
                                                        <span className={`font-mono font-black ${cumDiff >= 0 ? 'text-emerald-400' : 'text-rose-400'}`}>
                                                            {cumDiff >= 0 ? '+' : ''}${cumDiff.toLocaleString(undefined, { maximumFractionDigits: 0 })} ({cumDiffPct >= 0 ? '+' : ''}{cumDiffPct.toFixed(1)}%)
                                                        </span>
                                                    </div>
                                                </div>
                                            );
                                        }}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="p1Cumulative"
                                        name="Period 1 Cumulative"
                                        stroke={p1Color}
                                        strokeWidth={3}
                                        fillOpacity={1}
                                        fill="url(#p1Grad)"
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="p2Cumulative"
                                        name="Period 2 Cumulative"
                                        stroke={p2Color}
                                        strokeWidth={2.5}
                                        strokeDasharray="4 4"
                                        fillOpacity={1}
                                        fill="url(#p2Grad)"
                                    />
                                </AreaChart>
                            )}
                        </ResponsiveContainer>
                    </div>
                )}
            </div>

            {/* ── Fund Comparison Breakdown Table ──────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm p-6 lg:p-8 space-y-6">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <h4 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                            <span>Fund Giving Breakdown & Comparison</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                {fundComparisonData.length} Funds
                            </span>
                        </h4>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            Comparing fund performance, % share of total church revenue, and donor counts
                        </p>
                    </div>

                    {selectedFund && (
                        <button
                            onClick={() => setSelectedFund('')}
                            className="text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:text-indigo-800 dark:hover:text-indigo-300 px-3 py-1.5 rounded-xl bg-indigo-50 dark:bg-indigo-950/40 transition-colors w-fit"
                        >
                            ← View All Funds
                        </button>
                    )}
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                <th className="p-4">Fund Name</th>
                                <th className="p-4 text-right">Period 1 Total</th>
                                <th className="p-4 text-right">P1 Share</th>
                                <th className="p-4 text-right">Period 2 Total</th>
                                <th className="p-4 text-right">P2 Share</th>
                                <th className="p-4 text-right">Difference ($)</th>
                                <th className="p-4 text-right">Growth (%)</th>
                                <th className="p-4 text-right">Givers (P1 vs P2)</th>
                                <th className="p-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                            {fundComparisonData.map(fund => {
                                const isCurrentFiltered = selectedFund === fund.fundName;
                                return (
                                    <tr
                                        key={fund.fundName}
                                        className={`transition-colors ${
                                            isCurrentFiltered
                                                ? 'bg-indigo-50/40 dark:bg-indigo-950/20'
                                                : 'hover:bg-slate-50/80 dark:hover:bg-slate-800/50'
                                        }`}
                                    >
                                        <td className="p-4 font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                            <div className="flex items-center gap-2.5">
                                                <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: fund.color }} />
                                                <span>{fund.fundName}</span>
                                                {isCurrentFiltered && (
                                                    <span className="text-[9px] uppercase px-1.5 py-0.5 rounded bg-indigo-100 dark:bg-indigo-900/60 text-indigo-700 dark:text-indigo-300 font-extrabold">
                                                        Active Filter
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="p-4 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                            ${fund.p1Total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-4 text-right font-mono text-slate-500 whitespace-nowrap">
                                            {fund.p1Share.toFixed(1)}%
                                        </td>
                                        <td className="p-4 text-right font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                            ${fund.p2Total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-4 text-right font-mono text-slate-500 whitespace-nowrap">
                                            {fund.p2Share.toFixed(1)}%
                                        </td>
                                        <td className={`p-4 text-right font-mono font-bold whitespace-nowrap ${
                                            fund.diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                        }`}>
                                            {fund.diff >= 0 ? '+' : ''}${fund.diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        </td>
                                        <td className="p-4 text-right whitespace-nowrap">
                                            <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black ${
                                                fund.pctChange >= 0
                                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                                                    : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                                            }`}>
                                                {fund.pctChange >= 0 ? '↑' : '↓'}
                                                {Math.abs(fund.pctChange).toFixed(1)}%
                                            </span>
                                        </td>
                                        <td className="p-4 text-right font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                            <span className="font-bold text-slate-900 dark:text-white">{fund.p1Donors}</span>
                                            <span className="text-slate-400 mx-1">vs</span>
                                            <span>{fund.p2Donors}</span>
                                        </td>
                                        <td className="p-4 text-center whitespace-nowrap">
                                            {isCurrentFiltered ? (
                                                <button
                                                    onClick={() => setSelectedFund('')}
                                                    className="text-[11px] font-bold text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"
                                                >
                                                    Show All
                                                </button>
                                            ) : (
                                                <button
                                                    onClick={() => setSelectedFund(fund.fundName)}
                                                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 px-2.5 py-1 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                                                >
                                                    Filter Fund →
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Timeline Interval Breakdown Table ────────────────────────────────── */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm p-6 lg:p-8 space-y-6">
                <div>
                    <h4 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <span>Timeline Intervals Detail</span>
                        <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                            {intervalBuckets.length} Slices
                        </span>
                    </h4>
                    <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                        Pacing breakdown for each interval slice across both periods
                    </p>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                <th className="p-4">Interval</th>
                                <th className="p-4">Period 1 Dates</th>
                                <th className="p-4 text-right">Period 1 Amount</th>
                                <th className="p-4">Period 2 Dates</th>
                                <th className="p-4 text-right">Period 2 Amount</th>
                                <th className="p-4 text-right">Net Difference</th>
                                <th className="p-4 text-right">Change (%)</th>
                                <th className="p-4 text-right">Givers (P1 vs P2)</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                            {intervalBuckets.map(b => (
                                <tr key={b.index} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="p-4 font-black text-slate-900 dark:text-white whitespace-nowrap">
                                        {b.label}
                                    </td>
                                    <td className="p-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                        {b.p1Label}
                                    </td>
                                    <td className="p-4 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                        ${b.p1Amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="p-4 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                        {b.p2Label}
                                    </td>
                                    <td className="p-4 text-right font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                        ${b.p2Amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className={`p-4 text-right font-mono font-bold whitespace-nowrap ${
                                        b.diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                    }`}>
                                        {b.diff >= 0 ? '+' : ''}${b.diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="p-4 text-right whitespace-nowrap">
                                        <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[10px] font-black ${
                                            b.diffPct >= 0
                                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400'
                                                : 'bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400'
                                        }`}>
                                            {b.diffPct >= 0 ? '+' : ''}{b.diffPct.toFixed(1)}%
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-mono text-slate-600 dark:text-slate-300 whitespace-nowrap">
                                        <span className="font-bold text-slate-900 dark:text-white">{b.p1Donors}</span>
                                        <span className="text-slate-400 mx-1">vs</span>
                                        <span>{b.p2Donors}</span>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* ── Donor Participation & Shift Analysis ─────────────────────────────── */}
            <div className="bg-white dark:bg-slate-800 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm p-6 lg:p-8 space-y-6">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h4 className="text-lg font-black text-slate-900 dark:text-white flex items-center gap-2">
                            <span>Donor Participation & Giving Shifts</span>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300">
                                {donorShiftSummary.totalActiveDonors} Total Donors Analyzed
                            </span>
                        </h4>
                        <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
                            Identify who gave more, who reduced their giving, new donors, and lapsed donors between periods
                        </p>
                    </div>

                    {/* Shift Filter Pills */}
                    <div className="flex flex-wrap items-center gap-1.5 bg-slate-100 dark:bg-slate-900/60 p-1 rounded-2xl border border-slate-200 dark:border-slate-700">
                        {[
                            { key: 'all', label: 'All Donors', count: donorShiftSummary.totalActiveDonors },
                            { key: 'increased', label: 'Increased', count: donorShiftSummary.increasedCount, color: 'text-emerald-600' },
                            { key: 'decreased', label: 'Decreased', count: donorShiftSummary.decreasedCount, color: 'text-rose-600' },
                            { key: 'new', label: 'New in P1', count: donorShiftSummary.newCount, color: 'text-indigo-600' },
                            { key: 'lapsed', label: 'Lapsed in P1', count: donorShiftSummary.lapsedCount, color: 'text-amber-600' },
                        ].map(tab => (
                            <button
                                key={tab.key}
                                onClick={() => setDonorShiftFilter(tab.key as DonorShiftFilter)}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 ${
                                    donorShiftFilter === tab.key
                                        ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                                        : 'text-slate-500 hover:text-slate-800 dark:text-slate-400'
                                }`}
                            >
                                <span>{tab.label}</span>
                                <span className={`text-[10px] font-black opacity-80 ${tab.color || ''}`}>
                                    ({tab.count})
                                </span>
                            </button>
                        ))}
                    </div>
                </div>

                {/* Search Bar for Donors */}
                <div className="relative max-w-md">
                    <input
                        type="text"
                        placeholder="Search donors by name, email, or membership..."
                        value={donorSearch}
                        onChange={(e) => setDonorSearch(e.target.value)}
                        className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl pl-9 pr-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-800 dark:text-slate-200"
                    />
                    <Search size={14} className="absolute left-3 top-3 text-slate-400" />
                </div>

                {/* Donors Shift Table */}
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/70 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800 text-[10px] font-black uppercase tracking-wider text-slate-400">
                                <th className="p-4">Contributor</th>
                                <th className="p-4">Membership</th>
                                <th className="p-4 text-right">Period 1 Giving</th>
                                <th className="p-4 text-right">Period 2 Giving</th>
                                <th className="p-4 text-right">Net Change</th>
                                <th className="p-4 text-center">Movement Status</th>
                                <th className="p-4 text-center">Action</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 text-xs">
                            {filteredDonorShiftList.slice(0, 50).map(donor => (
                                <tr key={donor.donorId} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="p-4 whitespace-nowrap">
                                        <div className="flex items-center gap-3">
                                            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-indigo-500 to-purple-500 flex items-center justify-center text-white text-[11px] font-black uppercase shadow-xs">
                                                {donor.name.split(' ').map(n => n[0]).join('').slice(0, 2)}
                                            </div>
                                            <div>
                                                <button
                                                    onClick={() => {
                                                        if (onOpenPersonProfile) onOpenPersonProfile(donor.donorId);
                                                        else window.dispatchEvent(new CustomEvent('openPersonProfile', { detail: donor.donorId }));
                                                    }}
                                                    className="font-bold text-slate-900 dark:text-white hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors text-left"
                                                >
                                                    {donor.name}
                                                </button>
                                                {donor.email && (
                                                    <div className="text-[11px] text-slate-400">{donor.email}</div>
                                                )}
                                            </div>
                                        </div>
                                    </td>
                                    <td className="p-4 whitespace-nowrap">
                                        <span className="inline-block px-2.5 py-1 rounded-full text-[10px] font-bold bg-slate-100 dark:bg-slate-700/60 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                                            {donor.membership}
                                        </span>
                                    </td>
                                    <td className="p-4 text-right font-mono font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                        ${donor.p1Total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="p-4 text-right font-mono text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                        ${donor.p2Total.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className={`p-4 text-right font-mono font-bold whitespace-nowrap ${
                                        donor.diff >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400'
                                    }`}>
                                        {donor.diff >= 0 ? '+' : ''}${donor.diff.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                        <span className="text-[10px] text-slate-400 ml-1 font-normal">
                                            ({donor.pctChange >= 0 ? '+' : ''}{donor.pctChange.toFixed(0)}%)
                                        </span>
                                    </td>
                                    <td className="p-4 text-center whitespace-nowrap">
                                        {donor.category === 'new' && (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-indigo-100 text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                                                ✨ New Giver
                                            </span>
                                        )}
                                        {donor.category === 'lapsed' && (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-400">
                                                ⚠️ Lapsed in P1
                                            </span>
                                        )}
                                        {donor.category === 'increased' && (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-400">
                                                ↑ Increased
                                            </span>
                                        )}
                                        {donor.category === 'decreased' && (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-rose-100 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400">
                                                ↓ Decreased
                                            </span>
                                        )}
                                        {donor.category === 'maintained' && (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[10px] font-extrabold bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300">
                                                → Consistent
                                            </span>
                                        )}
                                    </td>
                                    <td className="p-4 text-center whitespace-nowrap">
                                        <button
                                            onClick={() => {
                                                if (onOpenPersonProfile) onOpenPersonProfile(donor.donorId);
                                                else window.dispatchEvent(new CustomEvent('openPersonProfile', { detail: donor.donorId }));
                                            }}
                                            className="px-3 py-1 rounded-xl text-[11px] font-bold text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-950/40 transition-colors"
                                        >
                                            Profile →
                                        </button>
                                    </td>
                                </tr>
                            ))}
                            {filteredDonorShiftList.length === 0 && (
                                <tr>
                                    <td colSpan={7} className="p-10 text-center text-slate-400">
                                        No contributors match the selected shift filter or search term.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>

                {filteredDonorShiftList.length > 50 && (
                    <div className="text-center pt-2">
                        <span className="text-xs font-bold text-slate-400">
                            Showing first 50 of {filteredDonorShiftList.length} donors. Download CSV for the full export.
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};
