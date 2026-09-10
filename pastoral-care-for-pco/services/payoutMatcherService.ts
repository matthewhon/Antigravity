import { DetailedDonation, GivingBatch, GivingBatchFundBreakdown } from '../types';

export interface PayoutMatchOptions {
    payoutDate: string;
    targetGross?: number;
    targetNet?: number;
    targetFees?: number;
    stripePayoutId?: string;
    searchWindowDays?: number; // default 12 days before payout date
}

export interface PayoutMatchResult {
    isExactMatch: boolean;
    difference: number;
    totalGross: number;
    totalFees: number;
    totalNet: number;
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
    const { payoutDate, targetGross, targetNet, targetFees, stripePayoutId } = options;
    const windowDays = options.searchWindowDays || 14;

    const pDate = new Date(payoutDate);
    const pDateStr = payoutDate.slice(0, 10);
    const minDate = new Date(pDate);
    minDate.setDate(minDate.getDate() - windowDays);
    const minDateStr = minDate.toISOString().slice(0, 10);

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
        const net = gross - fee;
        const first = desigs[0];
        return {
            rootId,
            gross: Math.round(gross * 100) / 100,
            fee: Math.round(fee * 100) / 100,
            net: Math.round(net * 100) / 100,
            date: first.date,
            donorName: first.donorName || 'Donor',
            paymentMethod: first.paymentMethod || 'card',
            designations: desigs
        };
    });

    // Determine target in cents
    const hasTargetGross = targetGross !== undefined && targetGross > 0;
    const hasTargetNet = targetNet !== undefined && targetNet > 0;

    if (!hasTargetGross && !hasTargetNet) {
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
    let minDiffCents = Infinity;

    // First try: Contiguous time-window search
    for (let i = 0; i < parents.length; i++) {
        let currentG = 0;
        let currentF = 0;
        const sub: ParentDonationGroup[] = [];
        for (let j = i; j < parents.length; j++) {
            sub.push(parents[j]);
            currentG += Math.round(parents[j].gross * 100);
            currentF += Math.round(parents[j].fee * 100);
            const currentN = currentG - currentF;

            const diff = hasTargetGross
                ? Math.abs(currentG - targetGrossCents)
                : Math.abs(currentN - targetNetCents);

            if (diff < minDiffCents) {
                minDiffCents = diff;
                bestChosen = [...sub];
                if (diff === 0 && (targetFeeCents === null || Math.abs(currentF - targetFeeCents) <= 2)) {
                    break;
                }
            }
        }
        if (minDiffCents === 0 && (targetFeeCents === null || bestChosen?.reduce((s, p) => s + Math.round(p.fee * 100), 0) === targetFeeCents)) {
            break;
        }
    }

    // Second try: Bounded subset search if contiguous did not find exact match
    if (minDiffCents !== 0 && parents.length <= 45) {
        const items = parents.map(p => ({
            p,
            gCents: Math.round(p.gross * 100),
            fCents: Math.round(p.fee * 100),
            nCents: Math.round(p.net * 100)
        }));

        function searchSubset(idx: number, accG: number, accF: number, chosen: ParentDonationGroup[]) {
            if (minDiffCents === 0) return;

            const accN = accG - accF;
            const diff = hasTargetGross ? Math.abs(accG - targetGrossCents) : Math.abs(accN - targetNetCents);

            if (diff < minDiffCents) {
                minDiffCents = diff;
                bestChosen = [...chosen];
                if (diff === 0 && (targetFeeCents === null || Math.abs(accF - targetFeeCents) <= 2)) {
                    return;
                }
            }

            if (idx >= items.length) return;
            if (hasTargetGross && accG > targetGrossCents + 100) return;
            if (hasTargetNet && accN > targetNetCents + 100) return;

            // Include
            searchSubset(idx + 1, accG + items[idx].gCents, accF + items[idx].fCents, [...chosen, items[idx].p]);
            // Exclude
            searchSubset(idx + 1, accG, accF, chosen);
        }

        searchSubset(0, 0, 0, []);
    }

    if (!bestChosen || bestChosen.length === 0) return null;

    const isExact = minDiffCents === 0;
    return buildResult(bestChosen, pDateStr, stripePayoutId, minDiffCents / 100, isExact);
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

    parents.forEach(p => {
        totalGross += p.gross;
        totalFees += p.fee;
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
        matchedDonations: allDesignations,
        fundsBreakdown,
        recommendedBatchName,
        suggestedPayoutId: payoutId
    };
}
