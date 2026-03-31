import { executeSend } from './sendEmail';
import { createServerLogger } from '../services/logService';

// ─── Analytics data refresher (server-side) ─────────────────────────────────

/**
 * For each analytics block in the campaign (type === 'analytics_block'),
 * re-fetch the data using the same configuration (widgetId + config) that the
 * user set at insert time and replace the stored `data` payload with fresh numbers.
 */
async function refreshAnalyticsBlocks(
    db: any,
    churchId: string,
    blocks: any[]
): Promise<{ blocks: any[]; refreshed: number }> {
    let refreshed = 0;

    const updated = await Promise.all(
        blocks.map(async (block: any) => {
            if (block.type !== 'analytics_block') return block;

            const widgetId: string = block.content?.widgetId;
            const config: any   = block.content?.config || {};  // fundName, dayRange, etc.

            if (!widgetId) return block;

            try {
                const freshData = await fetchWidgetData(db, churchId, widgetId, config);
                refreshed++;
                return {
                    ...block,
                    content: {
                        ...block.content,
                        data: freshData,
                        refreshedAt: Date.now(),
                    },
                };
            } catch (e: any) {
                // Non-fatal: keep old data, log the failure
                console.warn(`[Scheduler] Failed to refresh widget "${widgetId}" for church ${churchId}:`, e?.message);
                return block;
            }
        })
    );

    return { blocks: updated, refreshed };
}

/**
 * Server-side analytics data fetcher.
 * Mirrors the client-side `fetchWidgetSnapshot` in DataChartSelector.tsx
 * but uses the Firebase Admin SDK via `db` instead of the client SDK.
 */
async function fetchWidgetData(
    db: any,
    churchId: string,
    widgetId: string,
    config: { fundName?: string; dayRange?: number } = {}
): Promise<any> {
    const fundFilter = config.fundName?.trim() || '';
    const dayRange   = config.dayRange  || 14;

    switch (widgetId) {
        // ── Giving widgets ──────────────────────────────────────────────────
        case 'giving_key_metrics':
        case 'giving_fund_performance':
        case 'giving_donor_lifecycle':
        case 'giving_donor_acquisition':
        case 'giving_cumulative_ytd': {
            let donationsSnap = await db.collection('detailed_donations')
                .where('churchId', '==', churchId)
                .get();

            let donations: any[] = donationsSnap.docs.map(d => d.data());
            if (fundFilter) donations = donations.filter(d => d.fundName === fundFilter);

            // Build grouped analytics in-memory
            const now = new Date();
            const yearStart = new Date(now.getFullYear(), 0, 1);

            if (widgetId === 'giving_cumulative_ytd') {
                const ytd = donations.filter(d => new Date(d.date) >= yearStart);
                // Group by month
                const monthMap = new Map<string, number>();
                ytd.forEach(d => {
                    const m = d.date.slice(0, 7);
                    monthMap.set(m, (monthMap.get(m) || 0) + d.amount);
                });
                const months = Array.from(monthMap.entries()).sort((a, b) => a[0].localeCompare(b[0]));
                let running = 0;
                const cumulative = months.map(([date, amount]) => {
                    running += amount;
                    return { date, amount: running };
                });
                return { cumulative, totalYTD: running, fundFilter: fundFilter || null };
            }

            // For all other giving widgets: last 365 days
            const yearAgo = new Date(now);
            yearAgo.setFullYear(now.getFullYear() - 1);
            const current = donations.filter(d => new Date(d.date) >= yearAgo);

            const totalGiving = current.reduce((s, d) => s + d.amount, 0);
            const uniqueDonors = new Set(current.map(d => d.donorId)).size;
            const recurringGivers = new Set(current.filter(d => d.isRecurring).map(d => d.donorId)).size;
            const averageGift = current.length > 0 ? totalGiving / current.length : 0;

            if (widgetId === 'giving_key_metrics') {
                // Previous period giving
                const prevYearAgo = new Date(yearAgo);
                prevYearAgo.setFullYear(prevYearAgo.getFullYear() - 1);
                const prev = donations.filter(d => {
                    const dd = new Date(d.date);
                    return dd >= prevYearAgo && dd < yearAgo;
                });
                const previousTotalGiving = prev.reduce((s, d) => s + d.amount, 0);
                return { totalGiving, previousTotalGiving, contributingPeople: uniqueDonors, recurringGivers, averageGift };
            }

            if (widgetId === 'giving_fund_performance') {
                const fundMap = new Map<string, number>();
                current.forEach(d => fundMap.set(d.fundName || 'General', (fundMap.get(d.fundName || 'General') || 0) + d.amount));
                const givingByFund = Array.from(fundMap.entries())
                    .map(([name, value]) => ({ name, value }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 8);
                return { givingByFund, fundFilter: fundFilter || null };
            }

            if (widgetId === 'giving_donor_lifecycle' || widgetId === 'giving_donor_acquisition') {
                // Simplified lifecycle count
                const donorHistory = new Map<string, any[]>();
                donations.forEach(d => {
                    if (!donorHistory.has(d.donorId)) donorHistory.set(d.donorId, []);
                    donorHistory.get(d.donorId)!.push(d);
                });
                let newDonors = 0, activeDonors = 0, lapsedDonors = 0, recoveredDonors = 0;
                donorHistory.forEach(gifts => {
                    const sorted = gifts.sort((a, b) => a.date.localeCompare(b.date));
                    const lastGift = new Date(sorted[sorted.length - 1].date);
                    const daysSince = (now.getTime() - lastGift.getTime()) / 86400000;
                    if (daysSince <= 30) newDonors++;
                    else if (daysSince <= 90) activeDonors++;
                    else if (daysSince <= 365) lapsedDonors++;
                    else recoveredDonors++;
                });
                if (widgetId === 'giving_donor_lifecycle') {
                    return { donorLifecycle: { new: newDonors, active: activeDonors, lapsed: lapsedDonors, recovered: recoveredDonors, occasional: 0, inactive: 0, secondTime: 0 } };
                }
                return { newDonors, recoveredDonors, lapsedDonors, secondTimeDonors: 0 };
            }
            break;
        }

        // ── People widgets ──────────────────────────────────────────────────
        case 'people_stats': {
            const snap = await db.collection('people').where('churchId', '==', churchId).get();
            const people = snap.docs.map(d => d.data());
            const total = people.length;
            const members = people.filter(p => p.status === 'Member').length;
            const thirtyDaysAgo = new Date(Date.now() - 30 * 86400000).toISOString();
            const newThisMonth = people.filter(p => p.createdAt && p.createdAt >= thirtyDaysAgo).length;
            const households = new Set(people.map(p => p.householdId).filter(Boolean)).size;
            return { total, members, newThisMonth, households };
        }

        // ── Services widget ─────────────────────────────────────────────────
        case 'services_upcoming_events': {
            const snap = await db.collection('service_plans').where('churchId', '==', churchId).get();
            const plans: any[] = snap.docs.map(d => d.data());
            const now = new Date();
            now.setHours(0, 0, 0, 0);
            const end = new Date();
            end.setDate(end.getDate() + dayRange);
            end.setHours(23, 59, 59, 999);

            const upcoming = plans
                .filter(p => {
                    const d = p.planTimes?.[0] ? new Date(p.planTimes[0].startsAt) : new Date(p.sortDate);
                    return d >= now && d <= end;
                })
                .sort((a, b) => {
                    const da = a.planTimes?.[0] ? new Date(a.planTimes[0].startsAt) : new Date(a.sortDate);
                    const db2 = b.planTimes?.[0] ? new Date(b.planTimes[0].startsAt) : new Date(b.sortDate);
                    return da.getTime() - db2.getTime();
                })
                .slice(0, 10)
                .map(p => {
                    const d = p.planTimes?.[0] ? new Date(p.planTimes[0].startsAt) : new Date(p.sortDate);
                    const members = p.teamMembers || [];
                    const confirmed = members.filter((m: any) => m.status === 'Confirmed').length;
                    const pending   = members.filter((m: any) => m.status === 'Pending').length;
                    const needed    = p.positionsNeeded || 0;
                    return {
                        id: p.id,
                        serviceTypeName: p.serviceTypeName || 'Service',
                        seriesTitle: p.seriesTitle || null,
                        dateStr: d.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }),
                        timeStr: d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
                        confirmed, pending, needed,
                        status: needed > 0 ? 'Understaffed' : pending > 0 ? 'Pending' : 'Ready',
                    };
                });
            return { upcoming, dayRange };
        }

        case 'giving_last_week_by_fund': {
            const snap = await db.collection('detailed_donations').where('churchId', '==', churchId).get();
            const allDonations: any[] = snap.docs.map((d: any) => d.data());

            const now = new Date();
            const day = now.getDay(); // 0 = Sun
            const lwEnd = new Date(now);
            lwEnd.setDate(now.getDate() - day - 1); // last Saturday
            lwEnd.setHours(23, 59, 59, 999);
            const lwStart = new Date(lwEnd);
            lwStart.setDate(lwEnd.getDate() - 6); // previous Monday
            lwStart.setHours(0, 0, 0, 0);

            const weekLabel = `${lwStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${lwEnd.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`;

            const fundTotals: Record<string, number> = {};
            allDonations.forEach(d => {
                const dDate = new Date(d.date);
                if (dDate >= lwStart && dDate <= lwEnd) {
                    fundTotals[d.fundName] = (fundTotals[d.fundName] || 0) + d.amount;
                }
            });

            const fundRows = Object.entries(fundTotals).sort(([, a], [, b]) => b - a);
            const weekTotal = fundRows.reduce((s, [, v]) => s + v, 0);
            return {
                weekLabel,
                weekTotal,
                funds: fundRows.map(([name, amount]) => ({
                    name,
                    amount,
                    pct: weekTotal > 0 ? Math.round((amount / weekTotal) * 100) : 0,
                })),
            };
        }

        case 'giving_budget_progress': {
            const [donationsSnap, budgetsSnap] = await Promise.all([
                db.collection('detailed_donations').where('churchId', '==', churchId).get(),
                db.collection('budgets').where('churchId', '==', churchId).get(),
            ]);
            const allDonations: any[] = donationsSnap.docs.map((d: any) => d.data());
            const allBudgets: any[]   = budgetsSnap.docs.map((d: any) => d.data());
            const yearNow = new Date().getFullYear();
            const now2 = new Date();
            const yearBudgets = allBudgets.filter((b: any) => b.year === yearNow && b.isActive);
            const yearStart = new Date(yearNow, 0, 1);
            const fundActuals: Record<string, number> = {};
            allDonations.forEach((d: any) => {
                const dDate = new Date(d.date);
                if (dDate >= yearStart && dDate <= now2) {
                    fundActuals[d.fundName] = (fundActuals[d.fundName] || 0) + d.amount;
                }
            });
            const totalBudget = yearBudgets.reduce((s: number, b: any) => s + b.totalAmount, 0);
            const totalActual = yearBudgets.reduce((s: number, b: any) => s + (fundActuals[b.fundName] || 0), 0);
            const funds = yearBudgets
                .sort((a: any, b: any) => b.totalAmount - a.totalAmount)
                .map((b: any) => ({
                    name: b.fundName,
                    actual: fundActuals[b.fundName] || 0,
                    budget: b.totalAmount,
                    pct: b.totalAmount > 0 ? Math.min(Math.round(((fundActuals[b.fundName] || 0) / b.totalAmount) * 100), 100) : 0,
                }));
            return { year: yearNow, totalBudget, totalActual, totalPct: totalBudget > 0 ? Math.min(Math.round((totalActual / totalBudget) * 100), 100) : 0, funds };
        }

        case 'church_progress': {
            const now = new Date();
            const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
            const sixtyDaysAgo  = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000);
            const thirtyStr = thirtyDaysAgo.toISOString().split('T')[0];
            const sixtyStr  = sixtyDaysAgo.toISOString().split('T')[0];
            const todayStr  = now.toISOString().split('T')[0];

            const [donSnap, planSnap, groupSnap] = await Promise.all([
                db.collection('detailed_donations').where('churchId', '==', churchId).get(),
                db.collection('service_plans').where('churchId', '==', churchId).get(),
                db.collection('groups').where('churchId', '==', churchId).get(),
            ]);

            const donations: any[] = donSnap.docs.map((d: any) => d.data());
            const givingThis = new Set(donations.filter((d: any) => d.date >= thirtyStr && d.date <= todayStr).map((d: any) => d.donorId)).size;
            const givingLast = new Set(donations.filter((d: any) => d.date >= sixtyStr && d.date < thirtyStr).map((d: any) => d.donorId)).size;

            const plans: any[] = planSnap.docs.map((d: any) => d.data());
            const servingThis = new Set<string>();
            const servingLast = new Set<string>();
            plans.forEach((p: any) => {
                const planDate = (p.sortDate || '').split('T')[0];
                if (planDate > todayStr || planDate < sixtyStr) return;
                (p.teamMembers || []).forEach((m: any) => {
                    const status = m.status?.toLowerCase() || '';
                    if ((status === 'confirmed' || status === 'c') && m.personId) {
                        if (planDate >= thirtyStr) servingThis.add(m.personId);
                        else servingLast.add(m.personId);
                    }
                });
            });

            const groups: any[] = groupSnap.docs.map((d: any) => d.data());
            let groupThis = 0, groupLast = 0;
            groups.forEach((g: any) => {
                (g.attendanceHistory || []).forEach((h: any) => {
                    const hDate = new Date(h.date || h.startedAt || 0);
                    if (hDate >= thirtyDaysAgo) groupThis += h.count || 0;
                    else if (hDate >= sixtyDaysAgo) groupLast += h.count || 0;
                });
            });

            return {
                rows: [
                    { label: 'Group Attendance', thisMonth: groupThis, lastMonth: groupLast },
                    { label: 'Donors',           thisMonth: givingThis, lastMonth: givingLast },
                    { label: 'Volunteers',       thisMonth: servingThis.size, lastMonth: servingLast.size },
                ],
            };
        }

        case 'upcoming_registrations': {
            const snap = await db.collection('pco_registrations').where('churchId', '==', churchId).get();
            const allRegs: any[] = snap.docs.map((d: any) => d.data());
            const cutoff = new Date();
            cutoff.setDate(cutoff.getDate() - 14);
            const upcoming = allRegs
                .filter((e: any) => !e.startsAt || new Date(e.startsAt) >= cutoff)
                .sort((a: any, b: any) => {
                    if (!a.startsAt) return 1;
                    if (!b.startsAt) return -1;
                    return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
                })
                .slice(0, 8)
                .map((e: any) => {
                    const confirmed = ((e.totalAttendees ?? e.signupCount) - (e.waitlistedCount ?? 0) - (e.canceledCount ?? 0));
                    const displayCount = confirmed > 0 ? confirmed : (e.signupCount || 0);
                    const fillPct = e.signupLimit && e.signupLimit > 0
                        ? Math.min(100, Math.round((displayCount / e.signupLimit) * 100))
                        : null;
                    return {
                        id: e.id,
                        name: e.name,
                        dateStr: e.startsAt
                            ? new Date(e.startsAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
                            : 'Date TBD',
                        signupCount: displayCount,
                        signupLimit: e.signupLimit || null,
                        fillPct,
                        isFull: fillPct !== null && fillPct >= 100,
                        waitlistedCount: e.waitlistedCount || 0,
                        publicUrl: e.publicUrl || null,
                    };
                });
            return { upcoming };
        }

        default:
            return {};
    }
    return {};
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

const MAX_RETRIES = 5;

/**
 * Starts the email scheduler.  Call once on server startup.
 * Polls Firestore every 60 seconds for campaigns due to send.
 */
export function startEmailScheduler(db: any): void {
    const log = createServerLogger(db as any);

    const tick = async () => {
        try {
            const now = Date.now();

            // Find campaigns that are scheduled and due
            const snap = await db.collection('email_campaigns')
                .where('status', '==', 'scheduled')
                .where('scheduledAt', '<=', now)
                .get();

            if (snap.empty) return;

            log.info(`[Scheduler] Found ${snap.size} campaign(s) due to send`, 'system', {}, '');

            await Promise.all(snap.docs.map(async docSnap => {
                const campaign = docSnap.data() as any;
                const campaignId = docSnap.id;
                const churchId   = campaign.churchId;
                const retryCount = campaign.retryCount || 0;

                if (retryCount >= MAX_RETRIES) {
                    // Give up — mark failed permanently
                    log.error(
                        `[Scheduler] Campaign ${campaignId} exceeded max retries (${MAX_RETRIES}), marking failed`,
                        'system', { campaignId, churchId, retryCount }, churchId
                    );
                    await db.collection('email_campaigns').doc(campaignId).update({
                        status: 'failed',
                        lastError: `Max retries (${MAX_RETRIES}) exceeded`,
                        updatedAt: Date.now(),
                    });
                    return;
                }

                try {
                    // 1. Refresh analytics blocks with live data
                    const blocks: any[] = campaign.blocks || [];
                    const hasAnalytics = blocks.some((b: any) => b.type === 'analytics_block');

                    let finalBlocks = blocks;
                    if (hasAnalytics) {
                        log.info(`[Scheduler] Refreshing analytics blocks for campaign ${campaignId}`, 'system', { campaignId }, churchId);
                        const { blocks: refreshed, refreshed: count } = await refreshAnalyticsBlocks(db, churchId, blocks);
                        finalBlocks = refreshed;

                        // Persist refreshed blocks back to Firestore before sending
                        await db.collection('email_campaigns').doc(campaignId).update({
                            blocks: finalBlocks,
                            analyticsRefreshedAt: Date.now(),
                            updatedAt: Date.now(),
                        });

                        log.info(`[Scheduler] Refreshed ${count} analytics block(s) for campaign ${campaignId}`, 'system', { campaignId }, churchId);
                    }

                    // 2. Execute send (skip status update if recurring)
                    const isRecurring = !!campaign.recurringFrequency;
                    const result = await executeSend(db as any, campaignId, churchId, undefined, isRecurring);

                    log.info(
                        `[Scheduler] Campaign ${campaignId} sent successfully: ${result.message}`,
                        'system', { campaignId, churchId }, churchId
                    );

                    // 3. Handle recurring reschedule
                    if (isRecurring) {
                        const nowTime = Date.now();
                        const d = new Date(campaign.scheduledAt || nowTime);
                        if (campaign.recurringFrequency === 'daily') d.setDate(d.getDate() + 1);
                        else if (campaign.recurringFrequency === 'weekly') d.setDate(d.getDate() + 7);
                        else if (campaign.recurringFrequency === 'monthly') d.setMonth(d.getMonth() + 1);
                        else d.setDate(d.getDate() + 1); // fallback
                        
                        const nextEpoch = d.getTime();
                        const history = campaign.sentHistory || [];
                        history.push({ sentAt: nowTime, recipientCount: result.recipientCount });

                        await db.collection('email_campaigns').doc(campaignId).update({
                            status: 'scheduled',
                            scheduledAt: nextEpoch,
                            sendAt: d.toISOString(),
                            lastSentAt: nowTime,
                            sentHistory: history,
                            retryCount: 0,
                            lastError: null,
                            updatedAt: Date.now(),
                        });
                        
                        log.info(`[Scheduler] Recurring campaign ${campaignId} rescheduled to ${d.toISOString()}`, 'system', { campaignId, nextEpoch }, churchId);
                    }

                } catch (e: any) {
                    const errMsg = e?.message || 'Unknown error';
                    const newRetryCount = retryCount + 1;

                    log.warn(
                        `[Scheduler] Campaign ${campaignId} send failed (attempt ${newRetryCount}/${MAX_RETRIES}): ${errMsg}`,
                        'system', { campaignId, churchId, retryCount: newRetryCount }, churchId
                    );

                    // Mark as scheduled again with incremented retry count so it retries next tick
                    await db.collection('email_campaigns').doc(campaignId).update({
                        status: 'scheduled',  // keep scheduled — retry on next tick
                        retryCount: newRetryCount,
                        lastError: errMsg,
                        updatedAt: Date.now(),
                    });
                }
            }));

        } catch (e: any) {
            // Top-level scheduler error (e.g. Firestore query failed)
            console.error('[EmailScheduler] Tick error:', e?.message);
        }
    };

    // Run immediately on start, then every 60 seconds
    tick();
    setInterval(tick, 60_000);

    console.log('[EmailScheduler] Started — polling every 60 seconds');
}
