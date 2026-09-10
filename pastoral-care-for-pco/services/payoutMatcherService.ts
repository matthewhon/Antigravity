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
}

interface ParentDonationGroup {
    rootId: string;
    gross: number;
    fee: number;
    net: number;
    tithe: number;
    date: string;
    donorName: string;
    paymentMethod: string;
    designations: DetailedDonation[];
}

/**
 * Intelligent subset matcher for Stripe payouts.
 * Groups by parent donation (so multi-fund split gifts are kept intact),
 * and uses branch-and-bound optimization to find the combination matching target amounts.
 */
export function matchDonationsForPayout(
    allDonations: DetailedDonation[],
    options: PayoutMatchOptions
): PayoutMatchResult | null {
    const { payoutDate, startDate, endDate, targetGross, targetNet, targetFees, targetTitheGross, stripePayoutId } = options;
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

    // 1. Filter online unbatched donations within window
    const candidates = allDonations.filter(d => {
        if (d.batchId) return false;
        const isOnline = (d.fee != null && Math.abs(d.fee) > 0) ||
            (d.paymentSource && /stripe|card|ach|online/i.test(d.paymentSource)) ||
            (d.paymentMethod && /card|ach|stripe/i.test(d.paymentMethod)) ||
            !!d.stripe_payout_id || !!d.stripePayoutId;
        if (!isOnline) return false;

        const dDateStr = (d.paid_out_date || d.payoutDate || d.date || '').slice(0, 10);
        return dDateStr >= minDateStr && dDateStr <= pDateStr;
    });

    if (candidates.length === 0) return null;

    // 2. Group designations by parent donation ID
    const parentMap = new Map<string, DetailedDonation[]>();
    candidates.forEach(d => {
        const rootId = d.id.includes('_') ? d.id.split('_')[0] : d.id;
        if (!parentMap.has(rootId)) parentMap.set(rootId, []);
        parentMap.get(rootId)!.push(d);
    });

    const parents: ParentDonationGroup[] = Array.from(parentMap.entries()).map(([rootId, desigs]) => {
        const gross = desigs.reduce((s, d) => s + (d.amount || 0), 0);
        const fee = desigs.reduce((s, d) => s + Math.abs(d.fee || 0), 0);
        const tithe = desigs
            .filter(d => /tithe/i.test(d.fundName || ''))
            .reduce((s, d) => s + (d.amount || 0), 0);
        const net = gross - fee;
        const first = desigs[0];
        return {
            rootId,
            gross: Math.round(gross * 100) / 100,
            fee: Math.round(fee * 100) / 100,
            net: Math.round(net * 100) / 100,
            tithe: Math.round(tithe * 100) / 100,
            date: first.date,
            donorName: first.donorName || 'Donor',
            paymentMethod: first.paymentMethod || 'card',
            designations: desigs
        };
    });

    // Determine target in cents
    const hasTargetGross = targetGross !== undefined && targetGross > 0;
    const hasTargetNet = targetNet !== undefined && targetNet > 0;
    const targetTitheCents = targetTitheGross !== undefined && targetTitheGross > 0
        ? Math.round(targetTitheGross * 100)
        : null;

    if (!hasTargetGross && !hasTargetNet && !targetTitheCents) {
        // If neither is specified, sum all candidates in window
        return buildResult(parents, pDateStr, stripePayoutId, 0, true);
    }

    const targetGrossCents = hasTargetGross ? Math.round(targetGross! * 100) : 0;
    const targetNetCents = hasTargetNet ? Math.round(targetNet! * 100) : 0;
    const targetFeeCents = targetFees !== undefined ? Math.round(targetFees * 100) : null;

    // Sort by date descending (most recent first)
    parents.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    // 3. Search for best subset
    let bestChosen: ParentDonationGroup[] | null = null;
    let minScore = Infinity;
    let bestDiffCents = Infinity;

    function evaluateSubset(chosen: ParentDonationGroup[], accG: number, accF: number, accT: number) {
        const accN = accG - accF;
        let diff = 0;
        if (hasTargetGross) diff = Math.abs(accG - targetGrossCents);
        else if (hasTargetNet) diff = Math.abs(accN - targetNetCents);

        let score = diff;
        if (targetTitheCents !== null) {
            const titheDiff = Math.abs(accT - targetTitheCents);
            score += titheDiff * 20; // heavily weight tithe match
        }
        if (targetFeeCents !== null) {
            score += Math.abs(accF - targetFeeCents) * 5;
        }

        if (score < minScore) {
            minScore = score;
            bestDiffCents = diff;
            bestChosen = [...chosen];
        }
    }

    // Pass 1: Contiguous time-window search (covers ~95% of standard daily/weekly Stripe payouts)
    for (let i = 0; i < parents.length; i++) {
        let currentG = 0;
        let currentF = 0;
        let currentT = 0;
        const sub: ParentDonationGroup[] = [];
        for (let j = i; j < parents.length; j++) {
            sub.push(parents[j]);
            currentG += Math.round(parents[j].gross * 100);
            currentF += Math.round(parents[j].fee * 100);
            currentT += Math.round(parents[j].tithe * 100);
            evaluateSubset(sub, currentG, currentF, currentT);
            if (minScore === 0) break;
        }
        if (minScore === 0) break;
    }

    // Pass 2: Bounded Branch & Bound subset search if contiguous window did not find an exact match
    if (minScore > 0 && parents.length > 0) {
        // Cap candidates to at most 22 items to guarantee instantaneous execution (<10ms)
        const candidateItems = (parents.length > 22 ? parents.slice(0, 22) : parents).map(p => ({
            p,
            gCents: Math.round(p.gross * 100),
            fCents: Math.round(p.fee * 100),
            nCents: Math.round(p.net * 100),
            tCents: Math.round(p.tithe * 100)
        }));

        const n = candidateItems.length;
        // Precompute suffix sums for aggressive lower-bound pruning
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
        const MAX_ITERATIONS = 15000;
        const startTime = (typeof performance !== 'undefined') ? performance.now() : Date.now();

        function searchSubset(idx: number, accG: number, accF: number, accT: number) {
            if (minScore === 0) return;
            iterations++;
            if (iterations > MAX_ITERATIONS) return;
            if (iterations % 500 === 0) {
                const now = (typeof performance !== 'undefined') ? performance.now() : Date.now();
                if (now - startTime > 30) return; // Hard 30ms guard to never freeze main thread
            }

            evaluateSubset(stack, accG, accF, accT);

            if (idx >= n) return;

            const accN = accG - accF;
            // Upper bound pruning
            if (hasTargetGross && accG > targetGrossCents + 100) return;
            if (hasTargetNet && accN > targetNetCents + 100) return;
            if (targetTitheCents !== null && accT > targetTitheCents + 100) return;

            // Lower bound pruning: if taking ALL remaining items still can't reach target, prune
            if (hasTargetGross && (accG + suffixG[idx]) < targetGrossCents - 100) return;
            if (hasTargetNet && (accN + suffixN[idx]) < targetNetCents - 100) return;
            if (targetTitheCents !== null && (accT + suffixT[idx]) < targetTitheCents - 100) return;

            // Include current item
            stack.push(candidateItems[idx].p);
            searchSubset(
                idx + 1,
                accG + candidateItems[idx].gCents,
                accF + candidateItems[idx].fCents,
                accT + candidateItems[idx].tCents
            );
            stack.pop();

            // Exclude current item
            searchSubset(idx + 1, accG, accF, accT);
        }

        searchSubset(0, 0, 0, 0);
    }

    if (!bestChosen || bestChosen.length === 0) return null;

    const isExact = bestDiffCents === 0;
    return buildResult(bestChosen, pDateStr, stripePayoutId, bestDiffCents / 100, isExact);
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
