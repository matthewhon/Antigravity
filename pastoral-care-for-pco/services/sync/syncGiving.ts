/**
 * syncGiving.ts
 * PCO sync for Giving: funds, labels, donations, and donor stats.
 *
 * Fund resolution comes from ONE source: the fundMap pre-fetched from
 * giving/v2/funds. There is deliberately no `included`-array fallback —
 * PCO's giving/v2/donations endpoint silently ignores `include=fund`
 * (as it does `payment_source` and `batch`), so no Fund resource ever
 * arrives in the response and such a fallback is dead code.
 *
 * Because a missing fundMap would silently relabel every donation, the funds
 * fetch is strict: if it fails, the whole giving sync aborts rather than
 * overwriting good fund names with a placeholder.
 */

import { firestore } from '../firestoreService';
import { DetailedDonation, PcoFund, PcoPerson, GivingBatch, GivingBatchFundBreakdown } from '../../types';
import { logger, fetchAllPages, delay } from './pcoSyncCore.ts';

/** Used when a donation has no resolvable fund. Never invent a real-sounding fund name. */
const UNKNOWN_FUND = 'Unspecified';

export const syncRecentGiving = async (churchId: string, startDate?: Date) => {
    logger.info('Syncing giving...', 'sync', { churchId }, churchId);
    const since = startDate
        ? startDate.toISOString()
        : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch Funds first to build the lookup map.
    // STRICT: a partial or failed funds fetch must abort the sync. Continuing with
    // an empty map would rewrite every donation's fundName to a placeholder and
    // clobber correct data already in Firestore (merge:true overwrites the field).
    const fundMap = new Map<string, string>();
    const funds = await fetchAllPages(
        churchId,
        'giving/v2/funds',
        (f: any) => ({ id: f.id, churchId, name: f.attributes.name } as PcoFund),
        100,
        { strict: true }
    );

    if (funds.length > 0) {
        await firestore.upsertFunds(funds);
        funds.forEach(f => fundMap.set(f.id, f.name));
        logger.info(`Synced ${funds.length} funds`, 'sync', { churchId, count: funds.length }, churchId);
    } else {
        // A tenant with no funds also has no donations, so this is not inherently
        // an error — but it is worth surfacing, and the guard below catches the
        // case where donations arrive anyway.
        logger.warn('PCO returned no giving funds', 'sync', { churchId }, churchId);
    }

    // 1a. Fetch Labels to build a lookup map
    const labelMap = new Map<string, string>();
    try {
        const labelsData = await fetchAllPages(churchId, 'giving/v2/labels', (l: any) => ({
            id: l.id,
            name: l.attributes.slug || l.attributes.name
        }));

        if (labelsData.length > 0) {
            labelsData.forEach(l => labelMap.set(l.id, l.name));
            console.log(`Synced ${labelsData.length} labels.`);
        }
    } catch (e) {
        console.error('Labels sync error', e);
    }

    // 1b. Fetch Campuses and People to build donor-campus lookup maps
    const campuses = await firestore.getCampuses(churchId).catch(() => []);
    const campusMap = new Map<string, string>();
    campuses.forEach(c => campusMap.set(c.pcoId, c.name));

    const people = await firestore.getPeople(churchId).catch(() => []);
    const donorCampusMap = new Map<string, { id: string; name: string }>();
    people.forEach(p => {
        if (p.primaryCampusId) {
            const name = p.primaryCampusName || campusMap.get(p.primaryCampusId) || 'Campus';
            donorCampusMap.set(p.id, { id: p.primaryCampusId, name });
        }
    });

    // 2. Fetch Donations
    // NOTE: PCO accepts and then ignores `payment_source` and `batch` here — they
    // never appear in `included`. Do not add `fund` for the same reason (see header).
    const donations: DetailedDonation[] = await fetchAllPages(
        churchId,
        `giving/v2/donations?where[received_at][gte]=${since}&include=designations,labels,payment_source,batch,campus`,
        (d: any, included: any[] = []) => {
            const donationDate = d.attributes.received_at;
            const donorId = d.relationships?.person?.data?.id || 'anonymous';
            const isRecurring = !!d.relationships?.recurring_donation?.data;
            const donationFee = (d.attributes?.fee_cents || 0) / 100;
            const donationGross = (d.attributes?.amount_cents || 0) / 100;

            // Resolve Campus Attribution:
            // 1. Direct campus relationship on donation (from PCO campus selector/stamp)
            // 2. Fallback to donor's primary campus from People profile
            let campusId: string | null = null;
            let campusName: string | null = null;
            const campusRef = d.relationships?.campus?.data;
            if (campusRef) {
                campusId = String(campusRef.id);
                const campusObj = included.find(i => (i.type === 'Campus' || i.type === 'campus') && String(i.id) === campusId);
                campusName = campusObj?.attributes?.name || campusMap.get(campusId) || null;
            } else if (donorCampusMap.has(donorId)) {
                const dc = donorCampusMap.get(donorId)!;
                campusId = dc.id;
                campusName = dc.name;
            }

            // Resolve Payment Source
            let paymentSource = 'Unknown';
            const paymentSourceRef = d.relationships?.payment_source?.data;
            if (paymentSourceRef) {
                const ps = included.find(i => i.type === 'PaymentSource' && String(i.id) === String(paymentSourceRef.id));
                if (ps) {
                    paymentSource = ps.attributes?.name || ps.attributes?.method || 'Unknown';
                }
            }

            // Resolve Batch
            let batchId: string | undefined;
            let batchName: string | undefined;
            const batchRef = d.relationships?.batch?.data;
            if (batchRef) {
                batchId = String(batchRef.id);
                const batchObj = included.find(i => i.type === 'Batch' && String(i.id) === batchId);
                if (batchObj) {
                    batchName = batchObj.attributes?.description || batchObj.attributes?.name || undefined;
                }
            }

            const labelRefs = d.relationships?.labels?.data || [];
            const labels = labelRefs
                .map((ref: any) => {
                    const idStr = String(ref.id);
                    if (labelMap.has(idStr)) return labelMap.get(idStr);
                    const labelObj = included.find(i => i.type === 'Label' && String(i.id) === idStr);
                    return labelObj?.attributes?.slug || labelObj?.attributes?.name;
                })
                .filter(Boolean) as string[];

            // Designations map specific amounts to funds
            const designationRefs = d.relationships?.designations?.data || [];

            if (designationRefs.length === 0) {
                // Minimal fallback for donation without designations (rare).
                // There is no fund to attribute this to — say so rather than
                // guessing a name that may collide with a real fund.
                return [{
                    id: `${d.id}_0`,
                    churchId,
                    amount: donationGross,
                    date: donationDate,
                    fundName: UNKNOWN_FUND,
                    fundId: undefined,
                    donorId,
                    donorName: 'Donor',
                    isRecurring,
                    labels,
                    paymentSource,
                    batchId,
                    batchName,
                    fee: donationFee,
                    campusId,
                    campusName
                }] as DetailedDonation[];
            }

            const results: DetailedDonation[] = [];

            designationRefs.forEach((ref: any, index: number) => {
                const designation = included.find(i => i.type === 'Designation' && String(i.id) === String(ref.id));
                if (designation) {
                    const amount = (designation.attributes.amount_cents || 0) / 100;
                    let fundName = UNKNOWN_FUND;
                    let fundId: string | undefined = undefined;

                    // Resolve Fund Name & ID from the pre-fetched fundMap.
                    const fundRef = designation.relationships?.fund?.data;
                    if (fundRef) {
                        fundId = String(fundRef.id);

                        if (fundMap.has(fundId)) {
                            fundName = fundMap.get(fundId)!;
                        } else {
                            // Fund exists on the designation but not in giving/v2/funds —
                            // typically an archived fund. Keep the ID and flag it.
                            logger.warn(
                                `Fund ${fundId} on donation ${d.id} is not in the funds list — storing as '${UNKNOWN_FUND}'`,
                                'sync',
                                { churchId, donationId: d.id, fundId },
                                churchId
                            );
                        }
                    }

                    const fee = designationRefs.length === 1
                        ? donationFee
                        : Math.round((donationFee * (amount / (donationGross || 1))) * 100) / 100;

                    results.push({
                        id: `${d.id}_${index}`,
                        churchId,
                        amount,
                        date: donationDate,
                        fundName,
                        fundId,
                        donorId,
                        donorName: 'Donor',
                        isRecurring,
                        labels,
                        paymentSource,
                        batchId,
                        batchName,
                        fee,
                        campusId,
                        campusName
                    });
                }
            });

            return results;
        },
        100,
        // STRICT: a truncated donation set combined with merge-writes would leave
        // Firestore holding a silently incomplete picture of giving.
        { strict: true }
    );

    // Belt-and-braces: if donations came back but the fund map is empty, the
    // funds endpoint succeeded-but-empty while giving data clearly exists.
    // Writing now would relabel every donation, so bail before touching Firestore.
    if (donations.length > 0 && fundMap.size === 0) {
        throw new Error(
            `Giving sync aborted: ${donations.length} donations fetched but the fund map is empty — ` +
            `writing would overwrite existing fund names`
        );
    }

    if (donations.length > 0) {
        await firestore.upsertDetailedDonations(donations);

        // Calculate and Update Giving Stats for People
        console.log('Calculating Giving Stats...');
        const donorStats = new Map<string, { weekly: number, monthly: number, quarterly: number, ytd: number }>();
        const now = new Date();

        const pad2 = (n: number) => String(n).padStart(2, '0');
        const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

        const startOfYear = new Date(now.getFullYear(), 0, 1);
        const startOfQuarter = new Date(now.getFullYear(), Math.floor(now.getMonth() / 3) * 3, 1);
        const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
        const startOfWeek = new Date(now);
        startOfWeek.setDate(now.getDate() - now.getDay()); // Sunday

        const startOfYearStr = toDateStr(startOfYear);
        const startOfQuarterStr = toDateStr(startOfQuarter);
        const startOfMonthStr = toDateStr(startOfMonth);
        const startOfWeekStr = toDateStr(startOfWeek);

        donations.forEach(d => {
            if (!d.donorId || d.donorId === 'anonymous') return;

            const current = donorStats.get(d.donorId) || { weekly: 0, monthly: 0, quarterly: 0, ytd: 0 };
            const dateStr = (d.date || '').slice(0, 10);
            const amount = d.amount;

            if (dateStr >= startOfWeekStr) current.weekly += amount;
            if (dateStr >= startOfMonthStr) current.monthly += amount;
            if (dateStr >= startOfQuarterStr) current.quarterly += amount;
            if (dateStr >= startOfYearStr) current.ytd += amount;

            donorStats.set(d.donorId, current);
        });

        const peopleUpdates: Partial<PcoPerson>[] = [];
        donorStats.forEach((stats, personId) => {
            peopleUpdates.push({
                id: personId,
                givingStats: {
                    ...stats,
                    lastUpdated: Date.now()
                }
            });
        });

        if (peopleUpdates.length > 0) {
            await firestore.upsertPeople(peopleUpdates as any);
            console.log(`Updated giving stats for ${peopleUpdates.length} donors.`);
        }

        // 3. Sync Batches and Aggregate Funds Breakdown & Stripe Fees
        console.log('Syncing and aggregating Giving Batches...');
        let pcoBatches: any[] = [];
        try {
            pcoBatches = await fetchAllPages(
                churchId,
                'giving/v2/batches',
                (b: any) => ({
                    id: String(b.id),
                    name: b.attributes?.description || b.attributes?.name || `Batch #${b.id}`,
                    status: b.attributes?.status === 'committed' ? 'committed' : 'open',
                    date: b.attributes?.committed_at || b.attributes?.created_at || new Date().toISOString(),
                    totalGross: (b.attributes?.total_cents || 0) / 100,
                }),
                100
            );
        } catch (err: any) {
            logger.warn('Error fetching batches from PCO Giving (non-fatal)', 'sync', { churchId, error: err.message }, churchId);
        }

        // Fetch existing batches from Firestore to preserve QBO sync state
        const existingBatches = await firestore.getGivingBatches(churchId);
        const existingBatchMap = new Map<string, GivingBatch>();
        existingBatches.forEach(eb => existingBatchMap.set(eb.id, eb));

        // Group donations by batchId (or date for unbatched Stripe donations)
        const batchDonationMap = new Map<string, DetailedDonation[]>();
        const batchNameMap = new Map<string, string>();
        const batchDateMap = new Map<string, string>();

        pcoBatches.forEach(pb => {
            batchNameMap.set(pb.id, pb.name);
            batchDateMap.set(pb.id, pb.date);
            if (!batchDonationMap.has(pb.id)) batchDonationMap.set(pb.id, []);
        });

        donations.forEach(d => {
            let key = d.batchId;
            if (!key) {
                // If donation has fees or card/Stripe paymentSource and no batch, group by day
                const isOnline = (d.fee && d.fee > 0) || (d.paymentSource && /stripe|card|ach/i.test(d.paymentSource));
                const dateKey = (d.date || '').slice(0, 10);
                key = isOnline ? `online_${dateKey}` : `manual_unbatched_${dateKey}`;
                if (!batchNameMap.has(key)) {
                    batchNameMap.set(key, isOnline ? `Online Giving Payout (${dateKey})` : `Unbatched Giving (${dateKey})`);
                    batchDateMap.set(key, d.date);
                }
            } else if (d.batchName && !batchNameMap.has(key)) {
                batchNameMap.set(key, d.batchName);
            }
            if (!batchDateMap.has(key)) batchDateMap.set(key, d.date);

            const list = batchDonationMap.get(key) || [];
            list.push(d);
            batchDonationMap.set(key, list);
        });

        const batchesToSave: GivingBatch[] = [];

        batchDonationMap.forEach((batchDonations, batchKey) => {
            if (batchDonations.length === 0) return;

            // Calculate fund breakdown (by Fund and optionally Campus)
            const fundGroups = new Map<string, { 
                fundId: string;
                fundName: string;
                campusId?: string | null;
                campusName?: string | null;
                gross: number; 
                fee: number; 
                count: number;
            }>();
            let batchTotalGross = 0;
            let batchTotalFee = 0;

            batchDonations.forEach(d => {
                const fId = d.fundId || 'unassigned';
                const fName = d.fundName || 'Unassigned';
                const cId = d.campusId || null;
                const cName = d.campusName || null;
                // Group by campus + fund if campus is assigned, else by fundId
                const groupKey = cId ? `${cId}_${fId}` : fId;

                const cur = fundGroups.get(groupKey) || { 
                    fundId: fId,
                    fundName: fName, 
                    campusId: cId,
                    campusName: cName,
                    gross: 0, 
                    fee: 0, 
                    count: 0 
                };
                cur.gross += d.amount || 0;
                cur.fee += d.fee || 0;
                cur.count += 1;
                fundGroups.set(groupKey, cur);

                batchTotalGross += d.amount || 0;
                batchTotalFee += d.fee || 0;
            });

            const fundsBreakdown: GivingBatchFundBreakdown[] = Array.from(fundGroups.values()).map(data => ({
                fundId: data.fundId,
                fundName: data.fundName,
                campusId: data.campusId,
                campusName: data.campusName,
                grossAmount: Math.round(data.gross * 100) / 100,
                feeAmount: Math.round(data.fee * 100) / 100,
                netAmount: Math.round((data.gross - data.fee) * 100) / 100,
                donationCount: data.count
            })).sort((a, b) => b.grossAmount - a.grossAmount);

            const round2 = (n: number) => Math.round(n * 100) / 100;
            const gross = round2(batchTotalGross);
            const fees = round2(batchTotalFee);
            const net = round2(gross - fees);

            const existing = existingBatchMap.get(batchKey);
            const isStripe = fees > 0 || batchKey.startsWith('online_') || batchDonations.some(d => /stripe|card|ach/i.test(d.paymentSource || ''));

            batchesToSave.push({
                id: batchKey,
                churchId,
                name: batchNameMap.get(batchKey) || `Batch ${batchKey}`,
                date: batchDateMap.get(batchKey) || new Date().toISOString(),
                batchType: isStripe ? 'stripe' : 'manual',
                status: existing?.status === 'synced_to_qbo' ? 'synced_to_qbo' : 'committed',
                totalGross: gross,
                totalFees: fees,
                totalNet: net,
                donationCount: batchDonations.length,
                fundsBreakdown,
                quickbooksDepositId: existing?.quickbooksDepositId,
                quickbooksDepositDocNumber: existing?.quickbooksDepositDocNumber,
                quickbooksDepositBankAccountId: existing?.quickbooksDepositBankAccountId,
                quickbooksDepositBankAccountName: existing?.quickbooksDepositBankAccountName,
                syncedAt: existing?.syncedAt,
                syncedBy: existing?.syncedBy,
                readyNotifiedAt: existing?.readyNotifiedAt,
                syncedNotifiedAt: existing?.syncedNotifiedAt
            });
        });

        if (batchesToSave.length > 0) {
            await firestore.upsertGivingBatches(batchesToSave);
            console.log(`Saved ${batchesToSave.length} giving batches.`);

            // Trigger batch-ready email notifications if configured
            try {
                const qboMapping = await firestore.getQuickbooksMapping(churchId);
                if (qboMapping?.emailNotificationsEnabled && qboMapping?.notifyOnBatchReady !== false) {
                    const cutoffDate = qboMapping.cutoffDate;
                    const batchesToNotify = batchesToSave.filter(b => {
                        if (b.status === 'synced_to_qbo') return false;
                        if (b.readyNotifiedAt) return false;
                        if (cutoffDate && b.date && b.date.slice(0, 10) < cutoffDate) return false;
                        return true;
                    });

                    for (const b of batchesToNotify) {
                        try {
                            const port = typeof process !== 'undefined' ? process.env?.PORT || 8080 : 8080;
                            const baseUrl = typeof window === 'undefined' ? `http://127.0.0.1:${port}` : '';
                            const res = await fetch(`${baseUrl}/api/quickbooks/notify/batch-ready`, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ churchId, batchId: b.id })
                            });
                            if (res.ok) {
                                b.readyNotifiedAt = new Date().toISOString();
                            }
                        } catch (e: any) {
                            logger.warn(`Failed to send batch ready notification for ${b.id}: ${e.message}`, 'sync', { churchId, batchId: b.id }, churchId);
                        }
                    }
                }
            } catch (notifErr: any) {
                logger.warn(`Non-fatal error checking QuickBooks batch notifications: ${notifErr.message}`, 'sync', { churchId }, churchId);
            }
        }
    }
    logger.info(
        `Giving sync complete`,
        'sync',
        { churchId, funds: funds.length, donationRows: donations.length },
        churchId
    );
};
