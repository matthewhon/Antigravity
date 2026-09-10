import React, { useState, useEffect, useMemo } from 'react';
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
    SlidersHorizontal,
    Building,
    Search,
    RotateCcw,
    Terminal,
    ChevronDown,
    ChevronUp,
    Copy,
    Info
} from 'lucide-react';
import { DetailedDonation, GivingBatch, GivingBatchFundBreakdown } from '../types';
import { firestore } from '../services/firestoreService';
import { 
    matchDonationsForPayout, 
    getCandidateGiftsForPayout,
    PayoutMatchResult, 
    ParentDonationGroup 
} from '../services/payoutMatcherService';

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
    const [targetMode, setTargetMode] = useState<'net' | 'gross'>('gross');
    const [targetFees, setTargetFees] = useState<string>('');
    const [targetTitheGross, setTargetTitheGross] = useState<string>('');
    const [stripePayoutId, setStripePayoutId] = useState<string>('');
    const [searchWindowDays, setSearchWindowDays] = useState<number>(14);

    // Filter controls: default to 'all' methods and exclude already-batched Planning Center gifts
    const [paymentMethodFilter, setPaymentMethodFilter] = useState<'card' | 'ach' | 'all'>('all');
    const [includeBatched, setIncludeBatched] = useState<boolean>(false);
    const [candidateSearchQuery, setCandidateSearchQuery] = useState<string>('');

    // Matching state & Diagnostics
    const [matching, setMatching] = useState(false);
    const [matchResult, setMatchResult] = useState<PayoutMatchResult | null>(null);
    const [matchLogs, setMatchLogs] = useState<string[]>([]);
    const [showDiagnostics, setShowDiagnostics] = useState(false);
    const [copiedLogs, setCopiedLogs] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // Selected parent donation IDs (keeps designations grouped)
    const [selectedParentIds, setSelectedParentIds] = useState<Set<string>>(new Set());
    const [creatingBatch, setCreatingBatch] = useState(false);

    // When modal opens or dates change, reset error and match
    useEffect(() => {
        if (isOpen) {
            setError(null);
            setMatchResult(null);
            setSelectedParentIds(new Set());
        }
    }, [isOpen]);

    // When payoutDate changes, optionally adjust default window end date
    const handlePayoutDateChange = (newPayoutDate: string) => {
        setPayoutDate(newPayoutDate);
        setEndDate(newPayoutDate);
        const d = new Date(newPayoutDate);
        if (!isNaN(d.getTime())) {
            d.setDate(d.getDate() - searchWindowDays);
            setStartDate(d.toISOString().slice(0, 10));
        }
    };

    // Candidate parent donation groups in current date window & filters
    const candidateGroups: ParentDonationGroup[] = useMemo(() => {
        if (!isOpen) return [];
        const sourceDonations = inMemoryDonations || [];
        if (sourceDonations.length === 0) return [];

        return getCandidateGiftsForPayout(sourceDonations, {
            payoutDate,
            startDate: startDate.trim() || undefined,
            endDate: endDate.trim() || undefined,
            paymentMethodFilter,
            includeBatched,
            searchWindowDays
        });
    }, [isOpen, inMemoryDonations, payoutDate, startDate, endDate, paymentMethodFilter, includeBatched, searchWindowDays]);

    // Filtered candidate groups based on candidate search box
    const visibleCandidateGroups = useMemo(() => {
        if (!candidateSearchQuery.trim()) return candidateGroups;
        const q = candidateSearchQuery.toLowerCase();
        return candidateGroups.filter(p => {
            const donor = (p.donorName || '').toLowerCase();
            const date = (p.date || '').toLowerCase();
            const method = (p.paymentMethod || '').toLowerCase();
            const funds = p.designations.map(d => (d.fundName || '').toLowerCase()).join(' ');
            const amount = p.gross.toString();
            return donor.includes(q) || date.includes(q) || method.includes(q) || funds.includes(q) || amount.includes(q);
        });
    }, [candidateGroups, candidateSearchQuery]);

    // Compute live aggregates from selectedParentIds
    const { activeGross, activeFees, activeNet, activeTithe, activeDonations, activeParentCount } = useMemo(() => {
        let gross = 0;
        let fees = 0;
        let tithe = 0;
        let parentCount = 0;
        const selectedGifts: DetailedDonation[] = [];

        candidateGroups.forEach(p => {
            if (selectedParentIds.has(p.rootId)) {
                parentCount += 1;
                gross += p.gross;
                fees += p.fee;
                tithe += p.tithe;
                selectedGifts.push(...p.designations);
            }
        });

        return {
            activeGross: Math.round(gross * 100) / 100,
            activeFees: Math.round(fees * 100) / 100,
            activeNet: Math.round((gross - fees) * 100) / 100,
            activeTithe: Math.round(tithe * 100) / 100,
            activeDonations: selectedGifts,
            activeParentCount: parentCount
        };
    }, [candidateGroups, selectedParentIds]);

    // Dynamic fund breakdown from active donations
    const activeFundsBreakdown: GivingBatchFundBreakdown[] = useMemo(() => {
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

        return Array.from(fundMap.values()).sort((a, b) => b.grossAmount - a.grossAmount);
    }, [activeDonations]);

    if (!isOpen) return null;

    // Run smart algorithmic matcher
    const handleRunMatch = async () => {
        const numAmount = parseFloat(targetAmount);
        if (isNaN(numAmount) || numAmount <= 0) {
            setError('Please enter a valid target deposit amount.');
            return;
        }

        setError(null);
        setMatching(true);
        setMatchResult(null);

        // Yield to allow UI spinner
        await new Promise(r => setTimeout(r, 20));

        try {
            let candidateDonations: DetailedDonation[] = [];

            if (inMemoryDonations && inMemoryDonations.length > 0) {
                candidateDonations = inMemoryDonations;
            } else {
                let sinceDate: string;
                if (startDate) {
                    sinceDate = startDate.slice(0, 10);
                } else {
                    const pDate = new Date(payoutDate);
                    const minDate = new Date(pDate);
                    minDate.setDate(minDate.getDate() - (searchWindowDays + 5));
                    sinceDate = minDate.toISOString().slice(0, 10);
                }
                candidateDonations = await firestore.getUnbatchedOnlineDonations(churchId, sinceDate, includeBatched);
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
                searchWindowDays,
                paymentMethodFilter,
                includeBatched
            });

            if (res && res.matchLogs) {
                setMatchLogs(res.matchLogs);
            }

            if (!res || res.matchedDonations.length === 0) {
                setError(`Could not find a combination of online gifts matching ${targetMode === 'gross' ? 'Gross' : 'Net'} $${numAmount.toFixed(2)} with the selected filters. Check the Match Diagnostics below for candidate details.`);
                setShowDiagnostics(true);
                setMatching(false);
                return;
            }

            setMatchResult(res);
            // Select all matched parent donations
            const matchedParentIds = new Set<string>();
            res.matchedDonations.forEach(d => {
                const rootId = d.id.includes('_') ? d.id.split('_')[0] : d.id;
                matchedParentIds.add(rootId);
            });
            setSelectedParentIds(matchedParentIds);
        } catch (err: any) {
            console.error('Matching error:', err);
            setError(err.message || 'An error occurred while matching transactions.');
        } finally {
            setMatching(false);
        }
    };

    // Toggle individual parent donation
    const toggleParentDonation = (rootId: string) => {
        setSelectedParentIds(prev => {
            const next = new Set(prev);
            if (next.has(rootId)) {
                next.delete(rootId);
            } else {
                next.add(rootId);
            }
            return next;
        });
    };

    // Bulk selection helpers
    const selectAllVisible = () => {
        setSelectedParentIds(prev => {
            const next = new Set(prev);
            visibleCandidateGroups.forEach(p => next.add(p.rootId));
            return next;
        });
    };

    const deselectAllVisible = () => {
        setSelectedParentIds(prev => {
            const next = new Set(prev);
            visibleCandidateGroups.forEach(p => next.delete(p.rootId));
            return next;
        });
    };

    const resetSelection = () => {
        setSelectedParentIds(new Set());
        setMatchResult(null);
    };

    // Calculate difference metrics against target inputs
    const numTargetAmount = parseFloat(targetAmount) || 0;
    const numTargetFees = parseFloat(targetFees) || 0;
    const numTargetTithe = parseFloat(targetTitheGross) || 0;

    const targetGrossVal = targetMode === 'gross' ? numTargetAmount : (numTargetAmount > 0 && numTargetFees > 0 ? numTargetAmount + numTargetFees : 0);
    const targetNetVal = targetMode === 'net' ? numTargetAmount : (targetGrossVal > 0 && numTargetFees > 0 ? targetGrossVal - numTargetFees : 0);

    const grossDiff = targetGrossVal > 0 ? Math.round((activeGross - targetGrossVal) * 100) / 100 : 0;
    const netDiff = targetNetVal > 0 ? Math.round((activeNet - targetNetVal) * 100) / 100 : 0;
    const feesDiff = numTargetFees > 0 ? Math.round((activeFees - numTargetFees) * 100) / 100 : 0;
    const titheDiff = numTargetTithe > 0 ? Math.round((activeTithe - numTargetTithe) * 100) / 100 : 0;

    const isExactMatchActive = (
        (targetMode === 'net' && numTargetAmount > 0 && Math.abs(netDiff) < 0.005) ||
        (targetMode === 'gross' && numTargetAmount > 0 && Math.abs(grossDiff) < 0.005)
    ) && (numTargetTithe === 0 || Math.abs(titheDiff) < 0.005);

    const handleCreateBatch = async () => {
        if (activeDonations.length === 0) return;

        setCreatingBatch(true);
        setError(null);

        try {
            const pDateStr = payoutDate.slice(0, 10);
            const payoutId = stripePayoutId.trim() || (matchResult ? matchResult.suggestedPayoutId : `payout_${pDateStr.replace(/-/g, '')}`);
            const batchId = `stripe_${payoutId}`;
            const batchName = `${pDateStr} Stripe ${payoutId}`;

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
                fundsBreakdown: activeFundsBreakdown,
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/75 backdrop-blur-sm p-3 sm:p-4 overflow-y-auto">
            <div className="relative w-full max-w-4xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden my-4 sm:my-8 flex flex-col max-h-[90vh]">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-purple-100 dark:bg-purple-950/60 flex items-center justify-center text-purple-600 dark:text-purple-400 shadow-sm">
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
                                Match Stripe bank payouts with exact donor gifts, with support for Card/ACH schedules, fees, and multi-fund tithes.
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

                {/* Body Content */}
                <div className="p-6 space-y-5 overflow-y-auto flex-1">
                    {error && (
                        <div className="p-3.5 bg-rose-50 dark:bg-rose-950/40 border border-rose-200 dark:border-rose-900 rounded-xl text-xs text-rose-700 dark:text-rose-300 flex items-start gap-2">
                            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                            <div className="flex-1">
                                <span className="font-semibold">Match Notice: </span>
                                {error}
                            </div>
                        </div>
                    )}

                    {/* Primary Controls Grid */}
                    <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-4">
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {/* Payout Date */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-purple-500" />
                                    Stripe Payout Date *
                                </label>
                                <input
                                    type="date"
                                    value={payoutDate}
                                    onChange={(e) => handlePayoutDateChange(e.target.value)}
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
                                    <div className="flex items-center bg-slate-200 dark:bg-slate-700/60 p-0.5 rounded-md text-[11px]">
                                        <button
                                            type="button"
                                            onClick={() => setTargetMode('net')}
                                            className={`px-2 py-0.5 rounded font-semibold transition-all ${
                                                targetMode === 'net' 
                                                    ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs' 
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                            }`}
                                        >
                                            Net Bank
                                        </button>
                                        <button
                                            type="button"
                                            onClick={() => setTargetMode('gross')}
                                            className={`px-2 py-0.5 rounded font-semibold transition-all ${
                                                targetMode === 'gross' 
                                                    ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs' 
                                                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                            }`}
                                        >
                                            Gross
                                        </button>
                                    </div>
                                </div>
                                <div className="relative">
                                    <span className="absolute left-3 top-2.5 text-slate-400 text-sm font-semibold">$</span>
                                    <input
                                        type="number"
                                        step="0.01"
                                        placeholder={targetMode === 'gross' ? '10264.99' : '10107.40'}
                                        value={targetAmount}
                                        onChange={(e) => setTargetAmount(e.target.value)}
                                        className="w-full pl-7 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-bold focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                </div>
                                {numTargetAmount > 0 && numTargetFees > 0 && (
                                    <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-1 flex items-center justify-between">
                                        <span>{targetMode === 'gross' ? 'Est. Net Bank Deposit:' : 'Est. Gross Deposit:'}</span>
                                        <span className="font-semibold text-emerald-600 dark:text-emerald-400">
                                            ${targetMode === 'gross' ? (Math.max(0, numTargetAmount - numTargetFees)).toFixed(2) : (numTargetAmount + numTargetFees).toFixed(2)}
                                        </span>
                                    </div>
                                )}
                            </div>

                            {/* Payment Method Selector (Card vs ACH vs All) */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center justify-between">
                                    <span className="flex items-center gap-1.5">
                                        <CreditCard className="w-3.5 h-3.5 text-blue-500" />
                                        Payment Method
                                    </span>
                                    <span className="text-[10px] text-slate-400 font-normal">All online methods default</span>
                                </label>
                                <div className="grid grid-cols-3 gap-1 bg-slate-200/80 dark:bg-slate-700/60 p-1 rounded-lg text-xs font-semibold">
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethodFilter('all')}
                                        className={`py-1.5 px-2 rounded-md transition-all text-center ${
                                            paymentMethodFilter === 'all'
                                                ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs'
                                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                        }`}
                                    >
                                        All Online
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethodFilter('card')}
                                        className={`py-1.5 px-2 rounded-md transition-all text-center ${
                                            paymentMethodFilter === 'card'
                                                ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs'
                                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                        }`}
                                    >
                                        Card Only
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setPaymentMethodFilter('ach')}
                                        className={`py-1.5 px-2 rounded-md transition-all text-center ${
                                            paymentMethodFilter === 'ach'
                                                ? 'bg-white dark:bg-slate-900 text-purple-700 dark:text-purple-300 shadow-xs'
                                                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900'
                                        }`}
                                    >
                                        ACH Only
                                    </button>
                                </div>
                            </div>

                            {/* Transaction Start Date */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                    Window Start Date
                                </label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 outline-none"
                                />
                            </div>

                            {/* Transaction End Date */}
                            <div>
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                    <Calendar className="w-3.5 h-3.5 text-slate-400" />
                                    Window End Date
                                </label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 outline-none"
                                />
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
                                        placeholder="e.g. 157.59"
                                        value={targetFees}
                                        onChange={(e) => setTargetFees(e.target.value)}
                                        className="w-full pl-7 pr-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-medium focus:ring-2 focus:ring-purple-500 outline-none"
                                    />
                                </div>
                            </div>

                            {/* Optional Stripe Payout ID */}
                            <div className="sm:col-span-1 lg:col-span-2">
                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                    <CreditCard className="w-3.5 h-3.5 text-slate-400" />
                                    Stripe Payout ID <span className="text-slate-400 font-normal">(Optional)</span>
                                </label>
                                <input
                                    type="text"
                                    placeholder="e.g. po_1S2K4s... or dep_..."
                                    value={stripePayoutId}
                                    onChange={(e) => setStripePayoutId(e.target.value)}
                                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white font-mono placeholder:font-sans focus:ring-2 focus:ring-purple-500 outline-none"
                                />
                            </div>
                        </div>

                        {/* Additional Options & Action Bar */}
                        <div className="pt-3 border-t border-slate-200 dark:border-slate-700/60 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300 select-none">
                                <input
                                    type="checkbox"
                                    checked={includeBatched}
                                    onChange={(e) => setIncludeBatched(e.target.checked)}
                                    className="w-4 h-4 text-purple-600 rounded border-slate-300 dark:border-slate-700 focus:ring-purple-500"
                                />
                                <span>Include already-batched gifts</span>
                                <span className="text-[11px] text-slate-400 font-normal">(allows re-bundling gifts synced with PCO batches)</span>
                            </label>

                            <div className="flex items-center gap-2">
                                {matchLogs.length > 0 && (
                                    <button
                                        type="button"
                                        onClick={() => setShowDiagnostics(!showDiagnostics)}
                                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-purple-700 dark:text-purple-300 bg-purple-50 dark:bg-purple-950/40 hover:bg-purple-100 dark:hover:bg-purple-900/40 border border-purple-200 dark:border-purple-800/60 transition-colors"
                                    >
                                        <Terminal className="w-3.5 h-3.5 text-purple-500" />
                                        {showDiagnostics ? 'Hide Diagnostics' : 'View Diagnostics'}
                                    </button>
                                )}
                                {selectedParentIds.size > 0 && (
                                    <button
                                        type="button"
                                        onClick={resetSelection}
                                        className="inline-flex items-center gap-1 px-3 py-2 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-400 hover:bg-slate-200/60 dark:hover:bg-slate-700/60 transition-colors"
                                    >
                                        <RotateCcw className="w-3.5 h-3.5" />
                                        Clear Selection
                                    </button>
                                )}
                                <button
                                    type="button"
                                    onClick={handleRunMatch}
                                    disabled={matching || !targetAmount}
                                    className="inline-flex items-center gap-2 px-5 py-2 rounded-xl text-sm font-semibold text-white bg-purple-600 hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition-all shrink-0"
                                >
                                    {matching ? (
                                        <>
                                            <Loader2 className="w-4 h-4 animate-spin" />
                                            Analyzing Gifts...
                                        </>
                                    ) : (
                                        <>
                                            <Sparkles className="w-4 h-4" />
                                            Find Matching Transactions
                                        </>
                                    )}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Diagnostics Drawer (Collapsible) */}
                    {showDiagnostics && (
                        <div className="rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-900 text-slate-100 overflow-hidden text-xs font-mono shadow-sm">
                            <div className="flex items-center justify-between px-4 py-2.5 bg-slate-950/80 border-b border-slate-800 select-none">
                                <div className="flex items-center gap-2">
                                    <Terminal className="w-4 h-4 text-purple-400" />
                                    <span className="font-bold text-slate-200">AI Matcher Diagnostics & Trace Log</span>
                                    {matchResult?.searchStrategy && (
                                        <span className="px-2 py-0.5 rounded text-[10px] bg-purple-900/60 text-purple-300 border border-purple-800">
                                            {matchResult.searchStrategy}
                                        </span>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <button
                                        type="button"
                                        onClick={() => {
                                            navigator.clipboard.writeText(matchLogs.join('\n'));
                                            setCopiedLogs(true);
                                            setTimeout(() => setCopiedLogs(false), 2000);
                                        }}
                                        className="p-1 px-2 rounded bg-slate-800 hover:bg-slate-700 text-slate-300 text-[10px] flex items-center gap-1 transition-colors"
                                    >
                                        <Copy className="w-3 h-3" />
                                        {copiedLogs ? 'Copied!' : 'Copy Logs'}
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => setShowDiagnostics(false)}
                                        className="p-1 rounded text-slate-400 hover:text-slate-200"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>
                                </div>
                            </div>
                            <div className="p-3.5 space-y-1 max-h-52 overflow-y-auto bg-slate-950 text-[11px] leading-relaxed select-text">
                                {matchLogs.length === 0 ? (
                                    <div className="text-slate-500 italic">Click "Find Matching Transactions" to run the matcher and generate diagnostic trace logs.</div>
                                ) : (
                                    matchLogs.map((logLine, idx) => (
                                        <div 
                                            key={idx} 
                                            className={
                                                logLine.includes('EXACT MATCH') || logLine.includes('✨') ? 'text-emerald-400 font-semibold' :
                                                logLine.includes('❌') || logLine.includes('⚠️') ? 'text-rose-400 font-semibold' :
                                                logLine.includes('🚫') ? 'text-amber-400' :
                                                logLine.includes('🎯') || logLine.includes('🚀') ? 'text-purple-300' :
                                                'text-slate-300'
                                            }
                                        >
                                            {logLine}
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Running Scoreboard / Comparison Summary */}
                    {(candidateGroups.length > 0 || selectedParentIds.size > 0) && (
                        <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-xs space-y-4">
                            {/* Scoreboard Metrics Row */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                {/* Gross Scorecard */}
                                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-1">
                                        <span>SELECTED GROSS</span>
                                        {targetGrossVal > 0 && (
                                            <span className={Math.abs(grossDiff) < 0.005 ? 'text-emerald-600 font-bold' : 'text-amber-600'}>
                                                {grossDiff === 0 ? '✓ Matched' : `${grossDiff > 0 ? '+' : ''}$${grossDiff.toFixed(2)}`}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-base font-bold text-slate-900 dark:text-white">
                                        ${activeGross.toFixed(2)}
                                    </div>
                                    {targetGrossVal > 0 && (
                                        <div className="text-[10px] text-slate-400 mt-0.5">
                                            Target: ${targetGrossVal.toFixed(2)}
                                        </div>
                                    )}
                                </div>

                                {/* Fees Scorecard */}
                                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400 font-semibold mb-1">
                                        <span>FEES</span>
                                        {numTargetFees > 0 && (
                                            <span className={Math.abs(feesDiff) < 0.005 ? 'text-emerald-600 font-bold' : 'text-amber-600'}>
                                                {feesDiff === 0 ? '✓ Matched' : `${feesDiff > 0 ? '+' : ''}$${feesDiff.toFixed(2)}`}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-base font-bold text-rose-600 dark:text-rose-400">
                                        -${activeFees.toFixed(2)}
                                    </div>
                                    {numTargetFees > 0 && (
                                        <div className="text-[10px] text-slate-400 mt-0.5">
                                            Expected: ${numTargetFees.toFixed(2)}
                                        </div>
                                    )}
                                </div>

                                {/* Tithe Scorecard (if provided or present) */}
                                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800">
                                    <div className="flex items-center justify-between text-[11px] text-indigo-500 font-semibold mb-1">
                                        <span>TITHE GROSS</span>
                                        {numTargetTithe > 0 && (
                                            <span className={Math.abs(titheDiff) < 0.005 ? 'text-emerald-600 font-bold' : 'text-amber-600'}>
                                                {titheDiff === 0 ? '✓ Matched' : `${titheDiff > 0 ? '+' : ''}$${titheDiff.toFixed(2)}`}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-base font-bold text-indigo-600 dark:text-indigo-400">
                                        ${activeTithe.toFixed(2)}
                                    </div>
                                    {numTargetTithe > 0 && (
                                        <div className="text-[10px] text-slate-400 mt-0.5">
                                            Target: ${numTargetTithe.toFixed(2)}
                                        </div>
                                    )}
                                </div>

                                {/* Net Bank Deposit Scorecard */}
                                <div className={`p-3 rounded-lg border ${
                                    isExactMatchActive 
                                        ? 'bg-emerald-50/80 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800' 
                                        : 'bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'
                                }`}>
                                    <div className="flex items-center justify-between text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold mb-1">
                                        <span>NET BANK DEPOSIT</span>
                                        {targetNetVal > 0 && (
                                            <span className={Math.abs(netDiff) < 0.005 ? 'text-emerald-600 font-bold' : 'text-amber-600'}>
                                                {netDiff === 0 ? '✓ Matched' : `${netDiff > 0 ? '+' : ''}$${netDiff.toFixed(2)}`}
                                            </span>
                                        )}
                                    </div>
                                    <div className="text-base font-extrabold text-emerald-600 dark:text-emerald-400">
                                        ${activeNet.toFixed(2)}
                                    </div>
                                    {targetNetVal > 0 && (
                                        <div className="text-[10px] text-slate-400 mt-0.5">
                                            Target: ${targetNetVal.toFixed(2)}
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Fund Allocation Breakdown Chips */}
                            {activeFundsBreakdown.length > 0 && (
                                <div>
                                    <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400 block mb-1.5">
                                        Fund Allocation ({activeDonations.length} total gift designations)
                                    </span>
                                    <div className="flex flex-wrap gap-1.5">
                                        {activeFundsBreakdown.map(f => (
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
                            )}

                            {/* Candidate Gift Inspector Header & Search */}
                            <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-2.5">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-bold text-slate-900 dark:text-white">
                                            Candidate Gifts ({activeParentCount} of {candidateGroups.length} selected)
                                        </span>
                                        <span className="text-[11px] text-slate-400">
                                            • Method: <span className="capitalize font-semibold text-slate-600 dark:text-slate-300">{paymentMethodFilter}</span>
                                        </span>
                                    </div>

                                    {/* Action buttons & Search */}
                                    <div className="flex items-center gap-2">
                                        <div className="relative">
                                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="Search donor, fund..."
                                                value={candidateSearchQuery}
                                                onChange={(e) => setCandidateSearchQuery(e.target.value)}
                                                className="pl-8 pr-2.5 py-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white outline-none focus:ring-1 focus:ring-purple-500 w-36 sm:w-48"
                                            />
                                        </div>

                                        <button
                                            type="button"
                                            onClick={selectAllVisible}
                                            className="px-2.5 py-1 text-xs font-semibold text-purple-600 dark:text-purple-400 hover:bg-purple-50 dark:hover:bg-purple-950/40 rounded-lg transition-colors"
                                        >
                                            Select All
                                        </button>
                                        <button
                                            type="button"
                                            onClick={deselectAllVisible}
                                            className="px-2.5 py-1 text-xs font-semibold text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors"
                                        >
                                            Deselect All
                                        </button>
                                    </div>
                                </div>

                                {/* Transaction List */}
                                <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800">
                                    {visibleCandidateGroups.length === 0 ? (
                                        <div className="p-8 text-center text-xs text-slate-400">
                                            No candidate donations found matching the current filters and date window.
                                        </div>
                                    ) : (
                                        visibleCandidateGroups.map(p => {
                                            const isChecked = selectedParentIds.has(p.rootId);
                                            return (
                                                <label 
                                                    key={p.rootId}
                                                    className={`flex items-center justify-between px-3.5 py-2.5 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer text-xs transition-colors ${
                                                        isChecked ? 'bg-purple-50/25 dark:bg-purple-950/20' : 'opacity-60'
                                                    }`}
                                                >
                                                    <div className="flex items-center gap-3">
                                                        <input
                                                            type="checkbox"
                                                            checked={isChecked}
                                                            onChange={() => toggleParentDonation(p.rootId)}
                                                            className="w-4 h-4 text-purple-600 rounded border-slate-300 dark:border-slate-700 focus:ring-purple-500 cursor-pointer"
                                                        />
                                                        <div>
                                                            <div className="flex items-center gap-2">
                                                                <span className="font-bold text-slate-900 dark:text-white">
                                                                    {p.donorName || 'Donor'}
                                                                </span>
                                                                <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 uppercase">
                                                                    {p.paymentMethod || p.paymentSource || 'Online'}
                                                                </span>
                                                                {p.batchId && (
                                                                    <span className="px-1.5 py-0.2 rounded text-[10px] font-semibold bg-amber-100 dark:bg-amber-950 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                                                        Batch #{p.batchId}
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-[11px] text-slate-400 flex items-center gap-1.5 mt-0.5">
                                                                <span>{p.date ? p.date.slice(0, 10) : ''}</span>
                                                                <span>•</span>
                                                                <span>
                                                                    {p.designations.map(d => d.fundName).join(', ')}
                                                                </span>
                                                                {p.tithe > 0 && (
                                                                    <>
                                                                        <span>•</span>
                                                                        <span className="text-indigo-600 dark:text-indigo-400 font-medium">Tithe: ${p.tithe.toFixed(2)}</span>
                                                                    </>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>

                                                    <div className="text-right">
                                                        <div className="font-bold text-slate-900 dark:text-white">
                                                            ${p.gross.toFixed(2)}
                                                        </div>
                                                        <div className="text-[10px] text-slate-400 flex items-center justify-end gap-1.5">
                                                            {p.fee > 0 && <span className="text-rose-500 font-medium">fee -${p.fee.toFixed(2)}</span>}
                                                            <span>•</span>
                                                            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">net ${p.net.toFixed(2)}</span>
                                                        </div>
                                                    </div>
                                                </label>
                                            );
                                        })
                                    )}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Batch Confirmation & Create Button */}
                    {activeDonations.length > 0 && (
                        <div className="p-4 bg-purple-50/60 dark:bg-purple-950/30 rounded-xl border border-purple-200 dark:border-purple-900/50 flex flex-col sm:flex-row items-center justify-between gap-4">
                            <div>
                                <span className="text-[11px] font-semibold text-purple-700 dark:text-purple-300 uppercase tracking-wider block">
                                    Batch Summary To Be Created
                                </span>
                                <p className="font-bold text-sm text-slate-900 dark:text-white font-mono mt-0.5">
                                    {payoutDate.slice(0, 10)} Stripe {stripePayoutId.trim() || (matchResult ? matchResult.suggestedPayoutId : `payout_${payoutDate.slice(0, 10).replace(/-/g, '')}`)}
                                </p>
                                <div className="text-xs text-slate-600 dark:text-slate-400 flex items-center gap-2 mt-1">
                                    <span>{activeDonations.length} gifts</span>
                                    <span>•</span>
                                    <span>Gross: ${activeGross.toFixed(2)}</span>
                                    <span>•</span>
                                    <span>Fees: -${activeFees.toFixed(2)}</span>
                                    <span>•</span>
                                    <span className="text-emerald-600 dark:text-emerald-400 font-bold">Net: ${activeNet.toFixed(2)}</span>
                                </div>
                            </div>

                            <button
                                type="button"
                                onClick={handleCreateBatch}
                                disabled={creatingBatch || activeDonations.length === 0}
                                className="w-full sm:w-auto inline-flex items-center justify-center gap-2 px-6 py-2.5 rounded-xl text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed shadow-md transition-all shrink-0"
                            >
                                {creatingBatch ? (
                                    <>
                                        <Loader2 className="w-4 h-4 animate-spin" />
                                        Creating Batch...
                                    </>
                                ) : (
                                    <>
                                        <Check className="w-4 h-4" />
                                        Confirm & Create Batch ({activeDonations.length} Gifts)
                                    </>
                                )}
                            </button>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

