import React, { useState, useEffect } from 'react';
import { 
    X, 
    Sparkles, 
    CheckCircle2, 
    AlertCircle, 
    Calendar, 
    DollarSign, 
    CreditCard, 
    Loader2, 
    Check, 
    ArrowRight,
    RefreshCw,
    SlidersHorizontal,
    Building
} from 'lucide-react';
import { DetailedDonation, GivingBatch, GivingBatchFundBreakdown } from '../types';
import { firestore } from '../services/firestoreService';
import { matchDonationsForPayout, PayoutMatchResult } from '../services/payoutMatcherService';

interface SmartPayoutMatcherModalProps {
    churchId: string;
    isOpen: boolean;
    onClose: () => void;
    onBatchCreated: (batch: GivingBatch) => void;
    donations?: DetailedDonation[];
}

export const SmartPayoutMatcherModal: React.FC<SmartPayoutMatcherModalProps> = ({
    churchId,
    isOpen,
    onClose,
    onBatchCreated,
    donations: inMemoryDonations
}) => {
    // Input state
    const [payoutDate, setPayoutDate] = useState(() => new Date().toISOString().slice(0, 10));
    const [startDate, setStartDate] = useState<string>(() => {
        const d = new Date();
        d.setDate(d.getDate() - 14);
        return d.toISOString().slice(0, 10);
    });
    const [endDate, setEndDate] = useState<string>(() => new Date().toISOString().slice(0, 10));
    const [targetAmount, setTargetAmount] = useState<string>('');
    const [targetMode, setTargetMode] = useState<'gross' | 'net'>('net');
    const [targetFees, setTargetFees] = useState<string>('');
    const [targetTitheGross, setTargetTitheGross] = useState<string>('');
    const [stripePayoutId, setStripePayoutId] = useState<string>('');
    const [searchWindowDays, setSearchWindowDays] = useState<number>(14);

    // Matching state
    const [loadingDonations, setLoadingDonations] = useState(false);
    const [matching, setMatching] = useState(false);
    const [matchResult, setMatchResult] = useState<PayoutMatchResult | null>(null);
    const [error, setError] = useState<string | null>(null);

    // Selected donations within result
    const [selectedDonationIds, setSelectedDonationIds] = useState<Set<string>>(new Set());
    const [creatingBatch, setCreatingBatch] = useState(false);

    // Reset when opened
    useEffect(() => {
        if (isOpen) {
            setError(null);
            setMatchResult(null);
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleRunMatch = async () => {
        const numAmount = parseFloat(targetAmount);
        if (isNaN(numAmount) || numAmount <= 0) {
            setError('Please enter a valid target deposit amount.');
            return;
        }

        setError(null);
        setMatching(true);
        setMatchResult(null);

        // Allow UI to update loading state before running calculations
        await new Promise(r => setTimeout(r, 20));

        try {
            let candidateDonations: DetailedDonation[] = [];

            if (inMemoryDonations && inMemoryDonations.length > 0) {
                // Use already loaded in-memory donations (instant, zero network latency)
                candidateDonations = inMemoryDonations.filter(d => !d.batchId);
            } else {
                // Fetch unbatched online donations from Firestore as fallback
                let sinceDate: string;
                if (startDate) {
                    sinceDate = startDate.slice(0, 10);
                } else {
                    const pDate = new Date(payoutDate);
                    const minDate = new Date(pDate);
                    minDate.setDate(minDate.getDate() - (searchWindowDays + 5));
                    sinceDate = minDate.toISOString().slice(0, 10);
                }
                candidateDonations = await firestore.getUnbatchedOnlineDonations(churchId, sinceDate);
            }

            if (candidateDonations.length === 0) {
                setError('No unbatched online donations found within the search window. Please run a Giving sync first or widen the window.');
                setMatching(false);
                return;
            }

            const numFees = targetFees ? parseFloat(targetFees) : undefined;
            const numTithe = targetTitheGross ? parseFloat(targetTitheGross) : undefined;
            const res = matchDonationsForPayout(candidateDonations, {
                payoutDate,
                startDate: startDate.trim() || undefined,
                endDate: endDate.trim() || undefined,
                targetGross: targetMode === 'gross' ? numAmount : undefined,
                targetNet: targetMode === 'net' ? numAmount : undefined,
                targetFees: isNaN(numFees!) ? undefined : numFees,
                targetTitheGross: isNaN(numTithe!) ? undefined : numTithe,
                stripePayoutId: stripePayoutId.trim() || undefined,
                searchWindowDays
            });

            if (!res || res.matchedDonations.length === 0) {
                setError(`Could not find a combination of unbatched online gifts matching ${targetMode === 'gross' ? 'Gross' : 'Net'} $${numAmount.toFixed(2)}. Try widening the search window or adjusting the amount.`);
                setMatching(false);
                return;
            }

            setMatchResult(res);
            // Select all matched donations by default
            setSelectedDonationIds(new Set(res.matchedDonations.map(d => d.id)));
        } catch (err: any) {
            console.error('Matching error:', err);
            setError(err.message || 'An error occurred while matching transactions.');
        } finally {
            setMatching(false);
        }
    };

    // Recalculate dynamic totals if user toggles individual checkboxes
    const activeDonations = matchResult 
        ? matchResult.matchedDonations.filter(d => selectedDonationIds.has(d.id))
        : [];
    const activeGross = Math.round(activeDonations.reduce((s, d) => s + (d.amount || 0), 0) * 100) / 100;
    const activeFees = Math.round(activeDonations.reduce((s, d) => s + Math.abs(d.fee || 0), 0) * 100) / 100;
    const activeNet = Math.round((activeGross - activeFees) * 100) / 100;

    const toggleDonation = (id: string) => {
        setSelectedDonationIds(prev => {
            const next = new Set(prev);
            if (next.has(id)) next.delete(id);
            else next.add(id);
            return next;
        });
    };

    const handleCreateBatch = async () => {
        if (!matchResult || activeDonations.length === 0) return;

        setCreatingBatch(true);
        setError(null);

        try {
            const pDateStr = payoutDate.slice(0, 10);
            const payoutId = stripePayoutId.trim() || matchResult.suggestedPayoutId;
            const batchId = `stripe_${payoutId}`;
            const batchName = `${pDateStr} Stripe ${payoutId}`;

            // Recompute active fund breakdown
            const fundMap = new Map<string, GivingBatchFundBreakdown>();
            activeDonations.forEach(d => {
                const fKey = `${d.fundId || d.fundName}_${d.campusId || 'main'}`;
                if (!fundMap.has(fKey)) {
                    fundMap.set(fKey, {
                        fundId: d.fundId || 'unknown',
                        fundName: d.fundName || 'General Giving',
                        campusId: d.campusId || null,
                        campusName: d.campusName || null,
                        grossAmount: 0,
                        feeAmount: 0,
                        netAmount: 0,
                        donationCount: 0
                    });
                }
                const f = fundMap.get(fKey)!;
                f.grossAmount = Math.round((f.grossAmount + (d.amount || 0)) * 100) / 100;
                f.feeAmount = Math.round((f.feeAmount + Math.abs(d.fee || 0)) * 100) / 100;
                f.netAmount = Math.round((f.grossAmount - f.feeAmount) * 100) / 100;
                f.donationCount += 1;
            });

            const fundsBreakdown = Array.from(fundMap.values()).sort((a, b) => b.grossAmount - a.grossAmount);

            const newBatch: GivingBatch = {
                id: batchId,
                churchId,
                name: batchName,
                date: new Date(payoutDate).toISOString(),
                batchType: 'stripe',
                status: 'committed',
                totalGross: activeGross,
                totalFees: activeFees,
                totalNet: activeNet,
                donationCount: activeDonations.length,
                fundsBreakdown,
                stripePayoutId: payoutId,
                paidOutDate: pDateStr
            };

            await firestore.createCustomPayoutBatch(
                churchId, 
                newBatch, 
                activeDonations.map(d => d.id)
            );

            onBatchCreated(newBatch);
            onClose();
        } catch (err: any) {
            console.error('Error creating payout batch:', err);
            setError(err.message || 'Failed to create payout batch.');
        } finally {
            setCreatingBatch(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto">
            <div className="relative w-full max-w-3xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-8">
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-900/60">
                    <div className="flex items-center gap-2.5">
                        <div className="w-9 h-9 rounded-xl bg-purple-100 dark:bg-purple-950/60 flex items-center justify-center text-purple-600 dark:text-purple-400">
                            <Sparkles className="w-5 h-5" />
                        </div>
                        <div>
                            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                Smart Payout Batch Matcher
                                <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-purple-100 dark:bg-purple-950/60 text-purple-700 dark:text-purple-300">
                                    AI Assist
                                </span>
                            </h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Enter your Stripe payout date and deposit total. The matcher will bundle the exact gifts.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Body */}
                <div className="p-6 space-y-5 max-h-[75vh] overflow-y-auto">
                    {error && (
                        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <span>{error}</span>
                        </div>
                    )}

                    {/* Inputs */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800">
                        {/* Payout Date */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-purple-500" />
                                Stripe Payout Date *
                            </label>
                            <input
                                type="date"
                                value={payoutDate}
                                onChange={(e) => setPayoutDate(e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                        </div>

                        {/* Target Amount & Mode */}
                        <div>
                            <div className="flex items-center justify-between mb-1.5">
                                <label className="text-xs font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
                                    <DollarSign className="w-3.5 h-3.5 text-emerald-500" />
                                    Target Deposit *
                                </label>
                                <div className="flex items-center gap-1 text-[11px]">
                                    <button
                                        type="button"
                                        onClick={() => setTargetMode('net')}
                                        className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                                            targetMode === 'net' 
                                                ? 'bg-purple-600 text-white' 
                                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                        }`}
                                    >
                                        Net Bank
                                    </button>
                                    <span className="text-slate-300 dark:text-slate-700">|</span>
                                    <button
                                        type="button"
                                        onClick={() => setTargetMode('gross')}
                                        className={`px-1.5 py-0.5 rounded font-medium transition-colors ${
                                            targetMode === 'gross' 
                                                ? 'bg-purple-600 text-white' 
                                                : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                        }`}
                                    >
                                        Gross
                                    </button>
                                </div>
                            </div>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder={targetMode === 'gross' ? '10263.91' : '10107.40'}
                                    value={targetAmount}
                                    onChange={(e) => setTargetAmount(e.target.value)}
                                    className="w-full pl-7 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-purple-500 outline-none"
                                />
                            </div>
                        </div>

                        {/* Target Tithe Gross */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                <Building className="w-3.5 h-3.5 text-indigo-500" />
                                Target Tithe Gross <span className="text-slate-400 font-normal">(Optional)</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="e.g. 7655.48"
                                    value={targetTitheGross}
                                    onChange={(e) => setTargetTitheGross(e.target.value)}
                                    className="w-full pl-7 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 outline-none"
                                />
                            </div>
                        </div>

                        {/* Window Start Date */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                Transaction Start Date
                            </label>
                            <input
                                type="date"
                                value={startDate}
                                onChange={(e) => setStartDate(e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                        </div>

                        {/* Window End Date */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                Transaction End Date
                            </label>
                            <input
                                type="date"
                                value={endDate}
                                onChange={(e) => setEndDate(e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                        </div>

                        {/* Optional Expected Fees */}
                        <div>
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                <SlidersHorizontal className="w-3.5 h-3.5 text-slate-400" />
                                Expected Fees <span className="text-slate-400 font-normal">(Optional)</span>
                            </label>
                            <div className="relative">
                                <span className="absolute left-3 top-2.5 text-slate-400 text-sm">$</span>
                                <input
                                    type="number"
                                    step="0.01"
                                    placeholder="e.g. 156.51"
                                    value={targetFees}
                                    onChange={(e) => setTargetFees(e.target.value)}
                                    className="w-full pl-7 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 outline-none"
                                />
                            </div>
                        </div>

                        {/* Optional Stripe Payout ID */}
                        <div className="sm:col-span-2 lg:col-span-3">
                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                                Stripe Payout ID <span className="text-slate-400 font-normal">(Optional)</span>
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. po_1N8... or dep_..."
                                value={stripePayoutId}
                                onChange={(e) => setStripePayoutId(e.target.value)}
                                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono placeholder:font-sans focus:ring-2 focus:ring-purple-500 outline-none"
                            />
                        </div>
                    </div>

                    {/* Find Match Button */}
                    <div className="flex justify-end">
                        <button
                            type="button"
                            onClick={handleRunMatch}
                            disabled={matching || !targetAmount}
                            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all"
                        >
                            {matching ? (
                                <>
                                    <Loader2 className="w-4 h-4 animate-spin" />
                                    Analyzing Unbatched Gifts...
                                </>
                            ) : (
                                <>
                                    <Sparkles className="w-4 h-4" />
                                    Find Matching Transactions
                                </>
                            )}
                        </button>
                    </div>

                    {/* Match Results */}
                    {matchResult && (
                        <div className="space-y-4 pt-4 border-t border-slate-200 dark:border-slate-800">
                            {/* Status Banner */}
                            <div className={`p-4 rounded-xl border flex items-center justify-between gap-3 ${
                                matchResult.isExactMatch
                                    ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
                                    : 'bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
                            }`}>
                                <div className="flex items-center gap-2.5">
                                    {matchResult.isExactMatch ? (
                                        <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                                    ) : (
                                        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0" />
                                    )}
                                    <div>
                                        <h4 className="text-sm font-bold text-slate-900 dark:text-white">
                                            {matchResult.isExactMatch ? 'Exact 100% Match Found' : 'Closest Match Found'}
                                        </h4>
                                        <p className="text-xs text-slate-600 dark:text-slate-400">
                                            {matchResult.isExactMatch 
                                                ? `Identified ${activeDonations.length} gifts summing exactly to your payout.`
                                                : `Difference: $${matchResult.difference.toFixed(2)} from target amount.`}
                                        </p>
                                    </div>
                                </div>

                                <div className="flex items-center gap-4 text-right">
                                    {matchResult.totalTitheGross !== undefined && (
                                        <div>
                                            <span className="text-[10px] uppercase tracking-wider text-indigo-500 font-semibold block">Tithe</span>
                                            <span className="text-sm font-bold text-indigo-600 dark:text-indigo-400">
                                                ${matchResult.totalTitheGross.toFixed(2)}
                                            </span>
                                        </div>
                                    )}
                                    <div>
                                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">Gross</span>
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">
                                            ${activeGross.toFixed(2)}
                                        </span>
                                    </div>
                                    <div>
                                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">Fees</span>
                                        <span className="text-sm font-bold text-rose-600 dark:text-rose-400">
                                            -${activeFees.toFixed(2)}
                                        </span>
                                    </div>
                                    <div className="pl-3 border-l border-slate-200 dark:border-slate-700">
                                        <span className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold block">Net Deposit</span>
                                        <span className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                                            ${activeNet.toFixed(2)}
                                        </span>
                                    </div>
                                </div>
                            </div>

                            {/* Fund Splits Breakdown Chips */}
                            <div>
                                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-2">
                                    Fund Breakdown Allocation
                                </span>
                                <div className="flex flex-wrap gap-1.5">
                                    {matchResult.fundsBreakdown.map(f => (
                                        <span 
                                            key={`${f.fundId}_${f.campusId}`}
                                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 border border-slate-200 dark:border-slate-700"
                                        >
                                            <span className="font-semibold">{f.fundName}:</span>
                                            <span className="text-emerald-600 dark:text-emerald-400 font-bold">${f.grossAmount.toFixed(2)}</span>
                                            <span className="text-slate-400 text-[10px]">({f.donationCount})</span>
                                        </span>
                                    ))}
                                </div>
                            </div>

                            {/* Matched Transactions List */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between text-xs text-slate-500 font-medium">
                                    <span>Matched Gifts ({activeDonations.length} of {matchResult.matchedDonations.length} selected)</span>
                                    <span>Check or uncheck to adjust</span>
                                </div>
                                <div className="max-h-60 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                                    {matchResult.matchedDonations.map(d => {
                                        const isChecked = selectedDonationIds.has(d.id);
                                        return (
                                            <label 
                                                key={d.id}
                                                className={`flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer text-xs transition-colors ${
                                                    isChecked ? 'bg-purple-50/20' : 'opacity-60'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2.5">
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={() => toggleDonation(d.id)}
                                                        className="w-4 h-4 text-purple-600 rounded border-slate-300 dark:border-slate-700 focus:ring-purple-500"
                                                    />
                                                    <div>
                                                        <span className="font-semibold text-slate-900 dark:text-white">
                                                            {d.donorName || 'Donor'}
                                                        </span>
                                                        <div className="text-[10px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                                            <span>{d.date.slice(0, 10)}</span>
                                                            <span>•</span>
                                                            <span className="capitalize">{d.paymentMethod || 'online'}</span>
                                                            <span>•</span>
                                                            <span>{d.fundName}</span>
                                                        </div>
                                                    </div>
                                                </div>

                                                <div className="text-right">
                                                    <div className="font-bold text-slate-900 dark:text-white">
                                                        ${(d.amount || 0).toFixed(2)}
                                                    </div>
                                                    {d.fee ? (
                                                        <div className="text-[10px] text-slate-400">
                                                            fee -${Math.abs(d.fee).toFixed(2)}
                                                        </div>
                                                    ) : null}
                                                </div>
                                            </label>
                                        );
                                    })}
                                </div>
                            </div>

                            {/* Batch Naming & Action */}
                            <div className="p-4 bg-purple-50/50 dark:bg-purple-950/20 rounded-xl border border-purple-200 dark:border-purple-900/50 flex flex-col sm:flex-row items-center justify-between gap-3">
                                <div>
                                    <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider">
                                        Batch To Be Created
                                    </span>
                                    <p className="font-bold text-sm text-slate-900 dark:text-white font-mono">
                                        {payoutDate.slice(0, 10)} Stripe {stripePayoutId.trim() || matchResult.suggestedPayoutId}
                                    </p>
                                </div>

                                <button
                                    type="button"
                                    onClick={handleCreateBatch}
                                    disabled={creatingBatch || activeDonations.length === 0}
                                    className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all"
                                >
                                    {creatingBatch ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Creating Batch...
                                        </>
                                    ) : (
                                        <>
                                            <Check className="w-4 h-4" />
                                            Confirm & Create Batch
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
