/**
 * syncGiving.ts
 * PCO sync for Giving: funds, labels, donations, and donor stats.
 *
 * Bug fix (2026-08-09): Fund resolution now has two layers of fallback:
 *   1. Pre-fetched fundMap (primary — built from giving/v2/funds)
 *   2. `included` array from the donation response (catches fund-fetch failures
 *      and archived/inactive funds missing from the funds list)
 * A warning is logged whenever a fund ID cannot be resolved so the issue
 * is visible in the sync log without crashing the pipeline.
 */

import { firestore } from '../firestoreService';
import { DetailedDonation, PcoFund, PcoPerson } from '../../types';
import { logger, fetchAllPages, delay } from './pcoSyncCore.ts';

export const syncRecentGiving = async (churchId: string, startDate?: Date) => {
    logger.info('Syncing giving...', 'sync', { churchId }, churchId);
    const since = startDate
        ? startDate.toISOString()
        : new Date(Date.now() - 365 * 24 * 60 * 60 * 1000).toISOString();

    // 1. Fetch Funds First to build a lookup map
    // This is more reliable than relying on 'included' funds in donation responses,
    // but we also keep the included-array fallback for resilience.
    const fundMap = new Map<string, string>();
    try {
        const funds = await fetchAllPages(churchId, 'giving/v2/funds', (f: any) => ({
            id: f.id,
            churchId,
            name: f.attributes.name
        } as PcoFund));

        if (funds.length > 0) {
            await firestore.upsertFunds(funds);
            funds.forEach(f => fundMap.set(f.id, f.name));
            console.log(`Synced ${funds.length} funds.`);
        }
    } catch (e) {
        // Non-fatal: fundMap will be empty; the included-array fallback below will
        // resolve fund names from the donation response where possible.
        console.error('Funds sync error', e);
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

    // 2. Fetch Donations
    // Include `fund` so the included array can serve as a fallback when fundMap is empty.
    let donations: DetailedDonation[] = [];
    try {
        donations = await fetchAllPages(
            churchId,
            `giving/v2/donations?where[received_at][gte]=${since}&include=designations,labels,payment_source,batch,fund`,
            (d: any, included: any[] = []) => {
                const donationDate = d.attributes.received_at;
                const donorId = d.relationships?.person?.data?.id || 'anonymous';
                const isRecurring = !!d.relationships?.recurring_donation?.data;

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
                    // Minimal fallback for donation without designations (rare)
                    return [{
                        id: `${d.id}_0`,
                        churchId,
                        amount: (d.attributes.amount_cents || 0) / 100,
                        date: donationDate,
                        fundName: 'General',
                        fundId: undefined,
                        donorId,
                        donorName: 'Donor',
                        isRecurring,
                        labels,
                        paymentSource,
                        batchId,
                        batchName
                    }] as DetailedDonation[];
                }

                const results: DetailedDonation[] = [];

                designationRefs.forEach((ref: any, index: number) => {
                    const designation = included.find(i => i.type === 'Designation' && String(i.id) === String(ref.id));
                    if (designation) {
                        const amount = (designation.attributes.amount_cents || 0) / 100;
                        let fundName = 'General';
                        let fundId: string | undefined = undefined;

                        // Resolve Fund Name & ID
                        const fundRef = designation.relationships?.fund?.data;
                        if (fundRef) {
                            fundId = fundRef.id;

                            // Layer 1: pre-fetched fundMap (primary path)
                            if (fundMap.has(fundId)) {
                                fundName = fundMap.get(fundId)!;
                            } else {
                                // Layer 2: scan included array (fallback for fund-fetch failures
                                // and archived/inactive funds not returned by giving/v2/funds)
                                const fundObj = included.find(
                                    i => i.type === 'Fund' && String(i.id) === String(fundId)
                                );
                                if (fundObj?.attributes?.name) {
                                    fundName = fundObj.attributes.name;
                                } else {
                                    // Both layers failed — log so the issue is visible in logs
                                    logger.warn(
                                        `Could not resolve fund name for fundId ${fundId} on donation ${d.id} — defaulting to 'General'`,
                                        'sync',
                                        { churchId, donationId: d.id, fundId },
                                        churchId
                                    );
                                }
                            }
                        }

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
                            batchName
                        });
                    }
                });

                return results;
            }
        );

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
        }
        console.log(`Synced ${donations.length} donation entries.`);
    } catch (e) {
        console.error('Giving sync error (Check permissions)', e);
    }
};
