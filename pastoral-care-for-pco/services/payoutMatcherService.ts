import { DetailedDonation, GivingBatch, GivingBatchFundBreakdown } from '../types';

export interface PayoutMatchOptions {
    payoutDate: string;
    startDate?: string;
    endDate?: string;
    targetGross?: number;
    targetNet?: number;
    targetFees?: number;
    targetTitheGross?: number;
    stripePayoutId?: string;
    searchWindowDays?: number; // default 14 days before payout date
    paymentMethodFilter?: 'all' | 'card' | 'ach';
    includeBatched?: boolean;
}

export interface PayoutMatchResult {
    isExactMatch: boolean;
    difference: number;
    totalGross: number;
    totalFees: number;
    totalNet: number;
    totalTitheGross?: number;
    matchedDonations: DetailedDonation[];
    fundsBreakdown: GivingBatchFundBreakdown[];
    recommendedBatchName: string;
    suggestedPayoutId: string;
    matchLogs?: string[];
    closestMatchSummary?: string;
    searchStrategy?: string;
}

export interface ParentDonationGroup {
    rootId: string;
    gross: number;
    fee: number;
    net: number;
    tithe: number;
    date: string;
    donorName: string;
    paymentMethod: string;
    paymentSource: string;
    batchId?: string | null;
    designations: DetailedDonation[];
}

export interface CandidateFilterAudit {
    totalRawDonations: number;
    excludedBatchedPCO: number;
    excludedTithely: number;
    excludedCashOrCheck: number;
    excludedPaymentMethod: number;
    excludedDateWindow: number;
    excludedNotOnline: number;
    candidateCount: number;
    totalCandidateGross: number;
    totalCandidateFees: number;
    totalCandidateNet: number;
    totalCandidateTithe: number;
}

/**
 * Filter and group all matching candidate donations for a payout window.
 */
export function getCandidateGiftsForPayout(
    allDonations: DetailedDonation[],
    options: PayoutMatchOptions,
    auditOut?: CandidateFilterAudit
): ParentDonationGroup[] {
    const { payoutDate, startDate, endDate, paymentMethodFilter = 'all', includeBatched = false } = options;
    const windowDays = options.searchWindowDays || 14;

    const pDateStr = (endDate || payoutDate).slice(0, 10);
    let minDateStr: string;
    if (startDate) {
        minDateStr = startDate.slice(0, 10);
    } else {
        const pDate = new Date(payoutDate);
        const minDate = new Date(pDate);
        minDate.setDate(minDate.getDate() - windowDays);
        minDateStr = minDate.toISOString().slice(0, 10);
    }

    let excludedBatchedPCO = 0;
    let excludedTithely = 0;
    let excludedCashOrCheck = 0;
    let excludedPaymentMethod = 0;
    let excludedDateWindow = 0;
    let excludedNotOnline = 0;

    // Filter online donations within window
    const candidates = allDonations.filter(d => {
        // Exclude donations already in a Planning Center batch or custom batch unless explicitly requested
        if (!includeBatched && d.batchId) {
            excludedBatchedPCO++;
            return false;
        }

        const src = `${d.paymentSource || ''} ${d.paymentMethod || ''} ${d.batchName || ''}`.toLowerCase();

        // Exclude Tithely transactions (Tithely has separate deposits and is not part of Stripe payouts)
        const isTithely = /tithely|tithe\.ly/i.test(d.paymentMethod || '') ||
            /tithely|tithe\.ly/i.test(d.paymentSource || '') ||
            /tithely|tithe\.ly/i.test(d.batchName || '') ||
            /tithely|tithe\.ly/i.test((d as any).batchType || '') ||
            /tithely|tithe\.ly/i.test((d as any).paymentType || '') ||
            (d.labels && d.labels.some(l => /tithely|tithe\.ly/i.test(l)));
        if (isTithely) {
            excludedTithely++;
            return false;
        }

        const isCashOrCheck = /cash|check/i.test(d.paymentSource || '') || /cash|check/i.test(d.paymentMethod || '');
        if (isCashOrCheck) {
            excludedCashOrCheck++;
            return false;
        }

        const isCard = /card|visa|mastercard|discover|amex|credit|debit|apple pay|google pay/i.test(src);
        const isAch = /ach|bank|checking|savings|union|fcu|wells|chase|bokf/i.test(src);

        if (paymentMethodFilter === 'card') {
            if (!isCard && isAch) {
                excludedPaymentMethod++;
                return false;
            }
        } else if (paymentMethodFilter === 'ach') {
            if (!isAch && isCard) {
                excludedPaymentMethod++;
                return false;
            }
        }

        const isOnline = (d.fee != null && Math.abs(d.fee) > 0) ||
            /stripe|card|ach|online|visa|mastercard/i.test(src) ||
            !!d.stripe_payout_id || !!d.stripePayoutId;
        if (!isOnline) {
            excludedNotOnline++;
            return false;
        }

        let dDateStr = '';
        if (d.paid_out_date || d.payoutDate) {
            dDateStr = (d.paid_out_date || d.payoutDate)!.slice(0, 10);
        } else if (d.date) {
            try {
                const parsed = new Date(d.date);
                if (!isNaN(parsed.getTime())) {
                    const y = parsed.getFullYear();
                    const m = String(parsed.getMonth() + 1).padStart(2, '0');
                    const day = String(parsed.getDate()).padStart(2, '0');
                    dDateStr = `${y}-${m}-${day}`;
                } else {
                    dDateStr = d.date.slice(0, 10);
                }
            } catch {
                dDateStr = d.date.slice(0, 10);
            }
        }

        if (!dDateStr || dDateStr < minDateStr || dDateStr > pDateStr) {
            excludedDateWindow++;
            return false;
        }

        return true;
    });

    // Group designations by parent donation ID
    const parentMap = new Map<string, DetailedDonation[]>();
    candidates.forEach(d => {
        const rootId = d.id.includes('_') ? d.id.split('_')[0] : d.id;
        if (!parentMap.has(rootId)) parentMap.set(rootId, []);
        parentMap.get(rootId)!.push(d);
    });

    let totalCandidateGross = 0;
    let totalCandidateFees = 0;
    let totalCandidateTithe = 0;

    const parents: ParentDonationGroup[] = Array.from(parentMap.entries()).map(([rootId, desigs]) => {
        const gross = desigs.reduce((s, d) => s + (d.amount || 0), 0);
        const fee = desigs.reduce((s, d) => s + Math.abs(d.fee || 0), 0);
        // Match Tithe funds broadly: "Tithe", "Tithes", "General", "General Fund", "Operating", "Tithe & Offering", etc.
        const tithe = desigs
            .filter(d => /tithe|general|operating|budget|tithes|offering/i.test(d.fundName || ''))
            .reduce((s, d) => s + (d.amount || 0), 0);
        const net = gross - fee;
        const first = desigs[0];

        totalCandidateGross += gross;
        totalCandidateFees += fee;
        totalCandidateTithe += tithe;

        return {
            rootId,
            gross: Math.round(gross * 100) / 100,
            fee: Math.round(fee * 100) / 100,
            net: Math.round(net * 100) / 100,
            tithe: Math.round(tithe * 100) / 100,
            date: first.date,
            donorName: first.donorName || 'Donor',
            paymentMethod: first.paymentMethod || 'card',
            paymentSource: first.paymentSource || 'Online',
            batchId: first.batchId || null,
            designations: desigs
        };
    });

    if (auditOut) {
        auditOut.totalRawDonations = allDonations.length;
        auditOut.excludedBatchedPCO = excludedBatchedPCO;
        auditOut.excludedTithely = excludedTithely;
        auditOut.excludedCashOrCheck = excludedCashOrCheck;
        auditOut.excludedPaymentMethod = excludedPaymentMethod;
        auditOut.excludedDateWindow = excludedDateWindow;
        auditOut.excludedNotOnline = excludedNotOnline;
        auditOut.candidateCount = parents.length;
        auditOut.totalCandidateGross = Math.round(totalCandidateGross * 100) / 100;
        auditOut.totalCandidateFees = Math.round(totalCandidateFees * 100) / 100;
        auditOut.totalCandidateNet = Math.round((totalCandidateGross - totalCandidateFees) * 100) / 100;
        auditOut.totalCandidateTithe = Math.round(totalCandidateTithe * 100) / 100;
    }

    parents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    return parents;
}

/**
 * Intelligent multi-pass matcher for Stripe bank payouts.
 * Groups designations by parent donation (so split gifts stay intact)
 * and evaluates combinations against target Gross, Tithe, and Fees.
 */
export function matchDonationsForPayout(
    allDonations: DetailedDonation[],
    options: PayoutMatchOptions
): PayoutMatchResult | null {
    const logs: string[] = [];
    const log = (msg: string) => {
        logs.push(msg);
    };

    const { payoutDate, endDate, startDate, targetGross, targetNet, targetFees, targetTitheGross, stripePayoutId } = options;
    const pDateStr = (endDate || payoutDate).slice(0, 10);
    const sDateStr = startDate ? startDate.slice(0, 10) : 'Auto';

    log(`🚀 Starting AI Stripe Payout Matcher`);
    log(`📅 Payout Date: ${pDateStr} | Search Window: [${sDateStr} to ${pDateStr}]`);
    log(`🎯 Target Criteria: ${targetGross ? `Gross $${targetGross.toFixed(2)}` : ''} ${targetNet ? `Net $${targetNet.toFixed(2)}` : ''} ${targetTitheGross ? `| Tithe $${targetTitheGross.toFixed(2)}` : ''} ${targetFees ? `| Fees $${Math.abs(targetFees).toFixed(2)}` : ''}`);
    log(`⚙️ Filter Settings: Method=${options.paymentMethodFilter || 'all'}, IncludeBatched=${!!options.includeBatched}`);

    const audit: CandidateFilterAudit = {
        totalRawDonations: 0,
        excludedBatchedPCO: 0,
        excludedTithely: 0,
        excludedCashOrCheck: 0,
        excludedPaymentMethod: 0,
        excludedDateWindow: 0,
        excludedNotOnline: 0,
        candidateCount: 0,
        totalCandidateGross: 0,
        totalCandidateFees: 0,
        totalCandidateNet: 0,
        totalCandidateTithe: 0
    };

    const parents = getCandidateGiftsForPayout(allDonations, options, audit);

    log(`📊 Candidate Audit: Evaluated ${audit.totalRawDonations} total records`);
    if (audit.excludedBatchedPCO > 0) {
        log(`   🚫 Filtered out ${audit.excludedBatchedPCO} gifts already assigned to Planning Center batches`);
    }
    if (audit.excludedDateWindow > 0) {
        log(`   📅 Filtered out ${audit.excludedDateWindow} gifts outside date window`);
    }
    if (audit.excludedPaymentMethod > 0) {
        log(`   💳 Filtered out ${audit.excludedPaymentMethod} gifts due to payment method filter (${options.paymentMethodFilter})`);
    }
    if (audit.excludedCashOrCheck > 0 || audit.excludedTithely > 0) {
        log(`   💵 Filtered out ${audit.excludedCashOrCheck} cash/checks and ${audit.excludedTithely} Tithe.ly gifts`);
    }
    log(`✅ Candidate Pool: ${parents.length} parent donation groups (Gross: $${audit.totalCandidateGross.toFixed(2)}, Tithe: $${audit.totalCandidateTithe.toFixed(2)}, Fees: $${audit.totalCandidateFees.toFixed(2)}, Net: $${audit.totalCandidateNet.toFixed(2)})`);

    if (parents.length === 0) {
        log(`⚠️ No unbatched online candidate donations found in the specified window.`);
        return null;
    }

    // Determine target in cents
    const hasTargetGross = targetGross !== undefined && targetGross > 0;
    const hasTargetNet = targetNet !== undefined && targetNet > 0;
    const targetTitheCents = targetTitheGross !== undefined && targetTitheGross > 0
        ? Math.round(targetTitheGross * 100)
        : null;

    if (!hasTargetGross && !hasTargetNet && !targetTitheCents) {
        log(`ℹ️ No target amount provided — returning all ${parents.length} candidate gifts in window.`);
        const res = buildResult(parents, pDateStr, stripePayoutId, 0, true);
        res.matchLogs = logs;
        res.searchStrategy = 'All Candidates';
        return res;
    }

    const targetGrossCents = hasTargetGross ? Math.round(targetGross! * 100) : 0;
    const targetNetCents = hasTargetNet ? Math.round(targetNet! * 100) : 0;
    const targetFeeCents = targetFees !== undefined ? Math.round(Math.abs(targetFees) * 100) : null;

    // Candidate items representation in integer cents
    const candidateItems = parents.map(p => ({
        p,
        gCents: Math.round(p.gross * 100),
        fCents: Math.round(p.fee * 100),
        nCents: Math.round(p.net * 100),
        tCents: Math.round(p.tithe * 100)
    }));

    let bestChosen: ParentDonationGroup[] | null = null;
    let minScore = Infinity;
    let bestDiffCents = Infinity;
    let bestGrossDeltaCents = Infinity;
    let bestTitheDeltaCents = Infinity;
    let bestFeeDeltaCents = Infinity;
    let matchedStrategy = '';

    /**
     * Scoring function:
     * Primary constraint is Gross (or Net) difference.
     * We scale diff by 1,000,000 so that ANY closer gross match strictly beats a worse gross match,
     * while Tithe and Fees serve as optimal tie-breakers and ranking guidance.
     */
    function evaluateSubset(chosen: ParentDonationGroup[], accG: number, accF: number, accT: number, strategy: string) {
        const accN = accG - accF;
        let diff = 0;
        if (hasTargetGross) {
            diff = Math.abs(accG - targetGrossCents);
        } else if (hasTargetNet) {
            diff = Math.abs(accN - targetNetCents);
        }

        const titheDiff = targetTitheCents !== null ? Math.abs(accT - targetTitheCents) : 0;
        const feeDiff = targetFeeCents !== null ? Math.abs(accF - targetFeeCents) : 0;

        // Dominant score: gross/net diff dominates completely, with tithe and fee acting as tiebreakers
        const score = (diff * 1000000) + (titheDiff * 2) + feeDiff;

        if (score < minScore) {
            minScore = score;
            bestDiffCents = diff;
            bestGrossDeltaCents = hasTargetGross ? (accG - targetGrossCents) : 0;
            bestTitheDeltaCents = targetTitheCents !== null ? (accT - targetTitheCents) : 0;
            bestFeeDeltaCents = targetFeeCents !== null ? (accF - targetFeeCents) : 0;
            bestChosen = [...chosen];
            matchedStrategy = strategy;
        }
    }

    // ─── PASS 1: Contiguous Time Window Search ──────────────────────────────
    // 95%+ of Stripe payouts are contiguous time batches
    log(`🔍 Pass 1: Testing contiguous time-window slices...`);
    const n = candidateItems.length;
    for (let i = 0; i < n; i++) {
        let currentG = 0;
        let currentF = 0;
        let currentT = 0;
        const sub: ParentDonationGroup[] = [];
        for (let j = i; j < n; j++) {
            sub.push(candidateItems[j].p);
            currentG += candidateItems[j].gCents;
            currentF += candidateItems[j].fCents;
            currentT += candidateItems[j].tCents;
            evaluateSubset(sub, currentG, currentF, currentT, 'Contiguous Time Window');
            if (bestDiffCents === 0 && (targetTitheCents === null || bestTitheDeltaCents === 0) && (targetFeeCents === null || bestFeeDeltaCents === 0)) {
                break;
            }
        }
        if (minScore === 0) break;
    }

    if (bestDiffCents === 0) {
        log(`✨ Pass 1 Succeeded: Found exact contiguous window match! (${bestChosen?.length} gifts)`);
    } else {
        log(`ℹ️ Pass 1 closest contiguous diff: $${(bestDiffCents / 100).toFixed(2)}`);
    }

    // ─── PASS 2: Dynamic Branch-and-Bound Subset Search ─────────────────────
    // If not exact or if search can improve secondary criteria
    if (bestDiffCents > 0 || (targetTitheCents !== null && Math.abs(bestTitheDeltaCents) > 0)) {
        log(`🔍 Pass 2: Running branch-and-bound subset search across all ${n} candidate gifts...`);

        // Compute suffix sums for exact bounding
        const suffixG = new Array<number>(n + 1).fill(0);
        const suffixN = new Array<number>(n + 1).fill(0);
        const suffixT = new Array<number>(n + 1).fill(0);
        for (let i = n - 1; i >= 0; i--) {
            suffixG[i] = suffixG[i + 1] + candidateItems[i].gCents;
            suffixN[i] = suffixN[i + 1] + candidateItems[i].nCents;
            suffixT[i] = suffixT[i + 1] + candidateItems[i].tCents;
        }

        const stack: ParentDonationGroup[] = [];
        let iterations = 0;
        const MAX_ITERATIONS = 150000;
        const startTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();

        function searchSubset(idx: number, accG: number, accF: number, accT: number) {
            if (minScore === 0) return;
            iterations++;
            if (iterations > MAX_ITERATIONS) return;
            if (iterations % 1000 === 0) {
                const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
                if (now - startTime > 1500) return; // 1500ms safety guard
            }

            if (idx >= n) {
                if (stack.length > 0) {
                    evaluateSubset(stack, accG, accF, accT, 'Subset Combination Match');
                }
                return;
            }

            const accN = accG - accF;

            // Pruning if we overshoot primary target
            if (hasTargetGross && accG > targetGrossCents) return;
            if (hasTargetNet && accN > targetNetCents) return;

            // Pruning if remaining items cannot reach target
            if (hasTargetGross && (accG + suffixG[idx]) < targetGrossCents) {
                // Record the best we can do with remaining, then prune
                evaluateSubset(stack, accG, accF, accT, 'Partial Subset');
                return;
            }
            if (hasTargetNet && (accN + suffixN[idx]) < targetNetCents) {
                evaluateSubset(stack, accG, accF, accT, 'Partial Subset');
                return;
            }

            // Include current candidate item
            stack.push(candidateItems[idx].p);
            searchSubset(
                idx + 1,
                accG + candidateItems[idx].gCents,
                accF + candidateItems[idx].fCents,
                accT + candidateItems[idx].tCents
            );
            stack.pop();

            // Exclude current candidate item
            searchSubset(idx + 1, accG, accF, accT);
        }

        searchSubset(0, 0, 0, 0);
        log(`ℹ️ Pass 2 completed ${iterations} search iterations in ${Math.round(((typeof performance !== 'undefined' ? performance.now() : Date.now()) - startTime))}ms`);
    }

    if (!bestChosen || bestChosen.length === 0) {
        log(`❌ No matching transaction combinations found.`);
        return null;
    }

    const isExact = bestDiffCents === 0;
    const diffDollars = Math.round(bestDiffCents) / 100;
    const grossDeltaDollars = Math.round(bestGrossDeltaCents) / 100;
    const titheDeltaDollars = Math.round(bestTitheDeltaCents) / 100;
    const feeDeltaDollars = Math.round(bestFeeDeltaCents) / 100;

    log(`🏁 Match Results Summary:`);
    log(`   🎯 Match Type: ${isExact ? 'EXACT MATCH ($0.00 difference)' : `APPROXIMATE MATCH (difference: $${diffDollars.toFixed(2)})`}`);
    log(`   📦 Selected Gifts: ${bestChosen.length} parent donations`);
    log(`   ⚙️ Strategy: ${matchedStrategy}`);
    if (targetGross) log(`   💵 Target Gross: $${targetGross.toFixed(2)} | Matched Gross Delta: ${grossDeltaDollars >= 0 ? '+' : ''}$${grossDeltaDollars.toFixed(2)}`);
    if (targetTitheGross) log(`   🏛️ Target Tithe: $${targetTitheGross.toFixed(2)} | Matched Tithe Delta: ${titheDeltaDollars >= 0 ? '+' : ''}$${titheDeltaDollars.toFixed(2)}`);
    if (targetFees) log(`   💳 Expected Fees: $${Math.abs(targetFees).toFixed(2)} | Matched Fees Delta: ${feeDeltaDollars >= 0 ? '+' : ''}$${feeDeltaDollars.toFixed(2)}`);

    const result = buildResult(bestChosen, pDateStr, stripePayoutId, diffDollars, isExact);
    result.matchLogs = logs;
    result.searchStrategy = matchedStrategy;
    if (!isExact) {
        result.closestMatchSummary = `Closest match found is off by $${diffDollars.toFixed(2)} (${matchedStrategy}). You can manually toggle gifts below to reconcile.`;
    }

    // Print styled console log table for browser debugging
    try {
        if (typeof console !== 'undefined' && console.groupCollapsed) {
            console.groupCollapsed(`🔍 AI Stripe Matcher [${pDateStr}] — ${isExact ? '✅ EXACT MATCH' : '⚠️ CLOSEST APPROXIMATION'}`);
            console.log(logs.join('\n'));
            console.table(bestChosen.map(p => ({
                Date: p.date.slice(0, 10),
                Donor: p.donorName,
                Method: p.paymentMethod,
                Gross: `$${p.gross.toFixed(2)}`,
                Fee: `-$${p.fee.toFixed(2)}`,
                Net: `$${p.net.toFixed(2)}`,
                Tithe: `$${p.tithe.toFixed(2)}`,
                Funds: p.designations.map(d => d.fundName).join(', ')
            })));
            console.groupEnd();
        }
    } catch {
        // Safe fallback in non-browser environments
    }

    return result;
}

function buildResult(
    parents: ParentDonationGroup[],
    pDateStr: string,
    stripePayoutId?: string,
    diff: number = 0,
    isExact: boolean = true
): PayoutMatchResult {
    const allDesignations: DetailedDonation[] = [];
    const fundMap = new Map<string, {
        fundId: string;
        fundName: string;
        campusId?: string | null;
        campusName?: string | null;
        gross: number;
        fee: number;
        count: number;
    }>();

    let totalGross = 0;
    let totalFees = 0;
    let totalTithe = 0;

    parents.forEach(p => {
        totalGross += p.gross;
        totalFees += p.fee;
        totalTithe += p.tithe;
        p.designations.forEach(d => {
            allDesignations.push(d);
            const fKey = `${d.fundId || d.fundName}_${d.campusId || 'main'}`;
            if (!fundMap.has(fKey)) {
                fundMap.set(fKey, {
                    fundId: d.fundId || 'unknown',
                    fundName: d.fundName || 'General Giving',
                    campusId: d.campusId || null,
                    campusName: d.campusName || null,
                    gross: 0,
                    fee: 0,
                    count: 0
                });
            }
            const grp = fundMap.get(fKey)!;
            grp.gross += d.amount || 0;
            grp.fee += Math.abs(d.fee || 0);
            grp.count += 1;
        });
    });

    const round2 = (n: number) => Math.round(n * 100) / 100;
    const finalGross = round2(totalGross);
    const finalFees = round2(totalFees);
    const finalNet = round2(finalGross - finalFees);
    const finalTithe = round2(totalTithe);

    const fundsBreakdown: GivingBatchFundBreakdown[] = Array.from(fundMap.values()).map(f => ({
        fundId: f.fundId,
        fundName: f.fundName,
        campusId: f.campusId,
        campusName: f.campusName,
        grossAmount: round2(f.gross),
        feeAmount: round2(f.fee),
        netAmount: round2(f.gross - f.fee),
        donationCount: f.count
    })).sort((a, b) => b.grossAmount - a.grossAmount);

    const payoutId = stripePayoutId || `payout_${pDateStr.replace(/-/g, '')}`;
    const recommendedBatchName = `${pDateStr} Stripe ${payoutId}`;

    return {
        isExactMatch: isExact,
        difference: round2(diff),
        totalGross: finalGross,
        totalFees: finalFees,
        totalNet: finalNet,
        totalTitheGross: finalTithe,
        matchedDonations: allDesignations,
        fundsBreakdown,
        recommendedBatchName,
        suggestedPayoutId: payoutId
    };
}

