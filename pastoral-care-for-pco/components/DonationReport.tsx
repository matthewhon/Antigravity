import React, { useState, useMemo } from 'react';
import { DetailedDonation, PcoPerson } from '../types';
import { 
    startOfWeek, endOfWeek, startOfMonth, endOfMonth, 
    startOfQuarter, endOfQuarter, startOfYear, endOfYear, 
    format, isWithinInterval, parseISO, getYear, getQuarter 
} from 'date-fns';

interface DonationReportProps {
    donations: DetailedDonation[];
    people: PcoPerson[];
}

type IntervalType = 'Weekly' | 'Monthly' | 'Quarterly' | 'YTD';
type SortField = 'totalAmount' | 'name' | 'lastGiftDate';
type SortDirection = 'asc' | 'desc';

interface FilterState {
    startDate: string;
    endDate: string;
    minAmount: string;
    maxAmount: string;
    interval: IntervalType;
}

interface SortState {
    field: SortField;
    direction: SortDirection;
}

export const DonationReport: React.FC<DonationReportProps> = ({ donations, people }) => {
    // Default to current year
    const [filters, setFilters] = useState<FilterState>({
        startDate: format(startOfYear(new Date()), 'yyyy-MM-dd'),
        endDate: format(endOfYear(new Date()), 'yyyy-MM-dd'),
        minAmount: '',
        maxAmount: '',
        interval: 'Monthly'
    });

    const [sort, setSort] = useState<SortState>({
        field: 'totalAmount',
        direction: 'desc'
    });

    // 1. Filter Donations by Date
    const filteredDonations = useMemo(() => {
        const start = parseISO(filters.startDate);
        const end = parseISO(filters.endDate);
        // Set end of day for the end date to include donations on that day
        end.setHours(23, 59, 59, 999);

        return donations.filter(d => {
            const date = parseISO(d.date);
            return isWithinInterval(date, { start, end });
        });
    }, [donations, filters.startDate, filters.endDate]);

    // 2. Generate Buckets (Columns)
    const buckets = useMemo(() => {
        const start = parseISO(filters.startDate);
        const end = parseISO(filters.endDate);
        end.setHours(23, 59, 59, 999);
        
        const bucketKeys: string[] = [];
        let current = new Date(start);

        while (current <= end) {
            let key = '';
            let nextStep = new Date(current);

            switch (filters.interval) {
                case 'Weekly':
                    key = format(startOfWeek(current), 'yyyy-MM-dd'); // "Week of..."
                    nextStep.setDate(current.getDate() + 7);
                    break;
                case 'Monthly':
                    key = format(current, 'MMM yyyy');
                    nextStep.setMonth(current.getMonth() + 1);
                    nextStep.setDate(1); // Ensure we start at the beginning of the next month
                    break;
                case 'Quarterly':
                    key = `Q${getQuarter(current)} ${getYear(current)}`;
                    nextStep.setMonth(current.getMonth() + 3);
                    nextStep.setDate(1); // Start of next quarter
                    // Align to quarter start if not already (simple increment might drift if not careful, but date-fns helpers are better)
                    // Better approach for loop: use startOfNext...
                    break;
                case 'YTD':
                    key = `${getYear(current)}`;
                    nextStep.setFullYear(current.getFullYear() + 1);
                    nextStep.setMonth(0);
                    nextStep.setDate(1);
                    break;
            }
            
            if (!bucketKeys.includes(key)) {
                bucketKeys.push(key);
            }
            
            // Safety break to prevent infinite loops if logic fails
            if (nextStep <= current) break; 
            current = nextStep;
        }
        return bucketKeys;
    }, [filters.startDate, filters.endDate, filters.interval]);

    // 3. Aggregate Data by Donor
    const aggregatedData = useMemo(() => {
        const donorMap = new Map<string, {
            id: string;
            name: string;
            email: string;
            totalAmount: number;
            lastGiftDate: string;
            buckets: Record<string, number>;
        }>();

        filteredDonations.forEach(d => {
            if (!donorMap.has(d.donorId)) {
                // Find email from people list
                const person = people.find(p => p.id === d.donorId);
                
                donorMap.set(d.donorId, {
                    id: d.donorId,
                    name: d.donorName,
                    email: person?.email || '',
                    totalAmount: 0,
                    lastGiftDate: '',
                    buckets: {}
                });
            }

            const donor = donorMap.get(d.donorId)!;
            donor.totalAmount += d.amount;
            
            if (!donor.lastGiftDate || new Date(d.date) > new Date(donor.lastGiftDate)) {
                donor.lastGiftDate = d.date;
            }

            // Determine Bucket
            const date = parseISO(d.date);
            let bucketKey = '';
            switch (filters.interval) {
                case 'Weekly':
                    bucketKey = format(startOfWeek(date), 'yyyy-MM-dd');
                    break;
                case 'Monthly':
                    bucketKey = format(date, 'MMM yyyy');
                    break;
                case 'Quarterly':
                    bucketKey = `Q${getQuarter(date)} ${getYear(date)}`;
                    break;
                case 'YTD':
                    bucketKey = `${getYear(date)}`;
                    break;
            }

            donor.buckets[bucketKey] = (donor.buckets[bucketKey] || 0) + d.amount;
        });

        // 4. Filter by Threshold
        let results = Array.from(donorMap.values());
        
        if (filters.minAmount) {
            results = results.filter(d => d.totalAmount >= parseFloat(filters.minAmount));
        }
        if (filters.maxAmount) {
            results = results.filter(d => d.totalAmount <= parseFloat(filters.maxAmount));
        }

        // 5. Sort
        results.sort((a, b) => {
            let valA: any = a[sort.field];
            let valB: any = b[sort.field];

            if (sort.field === 'totalAmount') {
                // Numeric sort
            } else {
                // String sort
                valA = valA.toString().toLowerCase();
                valB = valB.toString().toLowerCase();
            }

            if (valA < valB) return sort.direction === 'asc' ? -1 : 1;
            if (valA > valB) return sort.direction === 'asc' ? 1 : -1;
            return 0;
        });

        return results;
    }, [filteredDonations, buckets, filters.interval, filters.minAmount, filters.maxAmount, sort, people]);

    const handleExport = () => {
        // CSV Header
        const header = ['Donor Name', 'Primary Email', 'Total Amount', 'Last Gift Date', ...buckets];
        
        // CSV Rows
        const rows = aggregatedData.map(d => {
            const row = [
                `"${d.name}"`,
                `"${d.email}"`,
                d.totalAmount.toFixed(2),
                d.lastGiftDate,
                ...buckets.map(b => (d.buckets[b] || 0).toFixed(2))
            ];
            return row.join(',');
        });

        const csvContent = [header.join(','), ...rows].join('\n');
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.setAttribute('href', url);
        link.setAttribute('download', `donation_report_${format(new Date(), 'yyyy-MM-dd')}.csv`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    };

    return (
        <div className="space-y-6">
            {/* Controls */}
            <div className="bg-white dark:bg-slate-800 p-6 rounded-2xl border border-slate-100 dark:border-slate-700 shadow-sm flex flex-wrap gap-4 items-end">
                <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Interval</label>
                    <select 
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
                
                <div>
                    <label className="block text-[10px] font-bold uppercase text-slate-400 mb-1">Date Range</label>
                    <div className="flex items-center gap-2">
                        <input 
                            type="date" 
                            value={filters.startDate}
                            onChange={(e) => setFilters(prev => ({ ...prev, startDate: e.target.value }))}
                            className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-3 py-2 text-xs font-bold outline-none"
                        />
                        <span className="text-slate-300">-</span>
                        <input 
                            type="date" 
                            value={filters.endDate}
                            onChange={(e) => setFilters(prev => ({ ...prev, endDate: e.target.value }))}
                            className="bg-slate-50 dark:bg-slate-900 border-none rounded-xl px-3 py-2 text-xs font-bold outline-none"
                        />
                    </div>
                </div>

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

                <div className="ml-auto">
                    <button 
                        onClick={handleExport}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-xl font-bold text-xs uppercase tracking-widest transition-colors flex items-center gap-2"
                    >
                        <span>Download CSV</span>
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>
                    </button>
                </div>
            </div>

            {/* Results Table */}
            <div className="bg-white dark:bg-slate-800 rounded-[2rem] border border-slate-100 dark:border-slate-700 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-100 dark:border-slate-800">
                                <th 
                                    className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer hover:text-indigo-500"
                                    onClick={() => setSort({ field: 'name', direction: sort.field === 'name' && sort.direction === 'asc' ? 'desc' : 'asc' })}
                                >
                                    Donor Name {sort.field === 'name' && (sort.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right cursor-pointer hover:text-indigo-500"
                                    onClick={() => setSort({ field: 'totalAmount', direction: sort.field === 'totalAmount' && sort.direction === 'asc' ? 'desc' : 'asc' })}
                                >
                                    Total Given {sort.field === 'totalAmount' && (sort.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                <th 
                                    className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right cursor-pointer hover:text-indigo-500"
                                    onClick={() => setSort({ field: 'lastGiftDate', direction: sort.field === 'lastGiftDate' && sort.direction === 'asc' ? 'desc' : 'asc' })}
                                >
                                    Last Gift {sort.field === 'lastGiftDate' && (sort.direction === 'asc' ? '↑' : '↓')}
                                </th>
                                {buckets.map(bucket => (
                                    <th key={bucket} className="p-4 text-[10px] font-black uppercase tracking-widest text-slate-400 text-right whitespace-nowrap">
                                        {bucket}
                                    </th>
                                ))}
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50 dark:divide-slate-800">
                            {aggregatedData.map(donor => (
                                <tr key={donor.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                    <td className="p-4 text-xs font-bold text-slate-900 dark:text-white whitespace-nowrap">
                                        {donor.name}
                                    </td>
                                    <td className="p-4 text-xs font-bold text-slate-900 dark:text-white text-right font-mono">
                                        ${donor.totalAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </td>
                                    <td className="p-4 text-xs text-slate-500 dark:text-slate-400 text-right font-mono">
                                        {donor.lastGiftDate ? format(parseISO(donor.lastGiftDate), 'MMM d, yyyy') : '-'}
                                    </td>
                                    {buckets.map(bucket => (
                                        <td key={bucket} className="p-4 text-xs text-slate-500 dark:text-slate-400 text-right font-mono">
                                            {donor.buckets[bucket] ? `$${donor.buckets[bucket].toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '-'}
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
        </div>
    );
};
