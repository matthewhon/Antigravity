import { executeSend } from './sendEmail';
import { createServerLogger } from '../services/logService';
import { calculateGivingAnalytics, DEFAULT_LIFECYCLE_SETTINGS } from '../services/analyticsService';
import { syncAllData } from '../services/pcoSyncService';

// ─── Analytics data refresher (server-side) ─────────────────────────────────

/**
 * For each analytics block in the campaign (type === 'analytics_block'),
 * re-fetch the data using the same configuration (widgetId + config) that the
 * user set at insert time and replace the stored `data` payload with fresh numbers.
 */
const toTimestampMs = (raw: any): number => {
    if (!raw) return 0;
    if (typeof raw === 'number') return raw;
    if (typeof raw === 'object' && typeof raw.toDate === 'function') {
        return raw.toDate().getTime();
    }
    if (typeof raw === 'object' && typeof raw._seconds === 'number') {
        return raw._seconds * 1000 + (raw._nanoseconds ? raw._nanoseconds / 1e6 : 0);
    }
    if (raw instanceof Date) return raw.getTime();
    if (typeof raw === 'string') {
        const parsed = new Date(raw).getTime();
        return isNaN(parsed) ? 0 : parsed;
    }
    return 0;
};

export async function refreshCampaignBlocks(
    db: any,
    churchId: string,
    blocks: any[]
): Promise<{ blocks: any[]; refreshed: number }> {
    let refreshed = 0;

    const updated = await Promise.all(
        blocks.map(async (block: any) => {
            if (block.type === 'analytics_block' || block.type === 'data_chart') {
                const widgetId: string = block.content?.widgetId;
                // Config is stored inside content.data._config by DataChartSelector at insert time
                const config: any   = block.content?.config || block.content?.data?._config || {};  // fundName, dayRange, pcoListId, etc.

                if (!widgetId) return block;

                try {
                    const freshData = await fetchWidgetData(db, churchId, widgetId, config);
                    refreshed++;
                    return {
                        ...block,
                        content: {
                            ...block.content,
                            data: {
                                ...freshData,
                                _config: config
                            },
                            refreshedAt: Date.now(),
                        },
                    };
                } catch (e: any) {
                    // Non-fatal: keep old data, log the failure
                    console.warn(`[Scheduler] Failed to refresh chart widget "${widgetId}" for church ${churchId}:`, e?.message);
                    return block;
                }
            }

            if (block.type === 'pastoral_care_chart') {
                const area = block.content?.area || 'Visits'; // 'Visits' or 'Prayer Requests'
                try {
                    const now = Date.now();
                    const thirtyDaysAgo = now - (30 * 24 * 60 * 60 * 1000);
                    let data: any = {};
                    
                    if (area.toLowerCase().includes('visit') || area.toLowerCase().includes('care') || area.toLowerCase().includes('contact')) {
                        const snap = await db.collection('pastoral_notes')
                            .where('churchId', '==', churchId)
                            .get();
                        const notes: any[] = snap.docs.map((d: any) => d.data());
                        const recent = notes.filter(n => {
                            const t = toTimestampMs(n.date) || toTimestampMs(n.createdAt) || toTimestampMs(n.timestamp);
                            return t >= thirtyDaysAgo;
                        });
                        data = { 
                            recentCount: recent.length, 
                            totalCount: notes.length,
                            period: 'Last 30 Days'
                        };
                    } else if (area.toLowerCase().includes('prayer')) {
                        const snap = await db.collection('prayer_requests')
                            .where('churchId', '==', churchId)
                            .get();
                        const reqs: any[] = snap.docs.map((d: any) => d.data());
                        const recent = reqs.filter(r => {
                            const t = toTimestampMs(r.date) || toTimestampMs(r.createdAt) || toTimestampMs(r.timestamp);
                            return t >= thirtyDaysAgo;
                        });
                        const answered = reqs.filter(r => (r.status || '').toLowerCase() === 'answered').length;
                        data = { 
                            recentCount: recent.length, 
                            answeredCount: answered,
                            totalCount: reqs.length,
                            period: 'Last 30 Days'
                        };
                    } else {
                        const [notesSnap, reqsSnap] = await Promise.all([
                            db.collection('pastoral_notes').where('churchId', '==', churchId).get(),
                            db.collection('prayer_requests').where('churchId', '==', churchId).get()
                        ]);
                        const notes = notesSnap.docs.map((d: any) => d.data());
                        const recentNotes = notes.filter((n: any) => (toTimestampMs(n.date) || toTimestampMs(n.createdAt)) >= thirtyDaysAgo);
                        data = {
                            recentCount: recentNotes.length,
                            totalCount: notes.length,
                            period: 'Last 30 Days'
                        };
                    }
                    
                    refreshed++;
                    return {
                        ...block,
                        content: {
                            ...block.content,
                            data,
                            refreshedAt: Date.now()
                        }
                    };
                } catch (e: any) {
                    console.warn(`[Scheduler] Failed to refresh pastoral care chart for church ${churchId}:`, e?.message);
                    return block;
                }
            }

            return block;
        })
    );

    return { blocks: updated, refreshed };
}

/**
 * Server-side analytics data fetcher.
 * Mirrors the client-side `fetchWidgetSnapshot` in DataChartSelector.tsx
 * but uses the Firebase Admin SDK via `db` instead of the client SDK.
 */
const pad2 = (n: number) => String(n).padStart(2, '0');
const toYYYYMMDD = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

async function fetchWidgetData(
    db: any,
    churchId: string,
    widgetId: string,
    config: { fundName?: string; dayRange?: number; timePeriod?: string; pcoListId?: string; pcoListName?: string } = {}
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
            const [donationsSnap, budgetsSnap] = await Promise.all([
                db.collection('detailed_donations').where('churchId', '==', churchId).get(),
                widgetId === 'giving_cumulative_ytd'
                    ? db.collection('budgets').where('churchId', '==', churchId).get()
                    : Promise.resolve({ docs: [] })
            ]);

            let donations: any[] = donationsSnap.docs.map(d => d.data());
            const budgets: any[] = budgetsSnap.docs.map(d => d.data());
            if (fundFilter) donations = donations.filter(d => d.fundName === fundFilter);

            // Build grouped analytics in-memory
            const now = new Date();
            const nowStr = toYYYYMMDD(now);

            if (widgetId === 'giving_cumulative_ytd') {
                const yearNow = now.getFullYear();
                const currentMonth = now.getMonth(); // 0-indexed
                const activeBudgets = budgets.filter(
                    (b: any) => b.year === yearNow && b.isActive && (!fundFilter || b.fundName === fundFilter)
                );

                const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
                let runningActual = 0;
                let runningBudget = 0;
                const months = MONTHS.map((label, i) => {
                    const monthStart = new Date(yearNow, i, 1);
                    const monthEnd = new Date(yearNow, i + 1, 0, 23, 59, 59, 999);
                    const monthStartStr = toYYYYMMDD(monthStart);
                    const monthEndStr = toYYYYMMDD(monthEnd);
                    const actualInMonth = donations
                        .filter(d => {
                            const ddStr = (d.date || '').slice(0, 10);
                            return ddStr >= monthStartStr && ddStr <= monthEndStr;
                        })
                        .reduce((s, d) => s + Number(d.amount || 0), 0);
                    // Only add actual for months that have passed or are current
                    if (i <= currentMonth) runningActual += actualInMonth;
                    const budgetInMonth = activeBudgets.reduce(
                        (s: number, b: any) => s + (b.monthlyAmounts?.[i] || 0), 0
                    );
                    runningBudget += budgetInMonth;
                    return {
                        label,
                        actual: i <= currentMonth ? runningActual : null,
                        budget: runningBudget,
                        isPast: i <= currentMonth,
                    };
                });

                const totalAnnualBudget = activeBudgets.reduce((s: number, b: any) => s + (b.totalAmount || 0), 0);
                const pctOfBudget = totalAnnualBudget > 0
                    ? Math.round((runningActual / totalAnnualBudget) * 100)
                    : null;
                const pctOfYtdBudget = runningBudget > 0
                    ? Math.round((runningActual / runningBudget) * 100)
                    : null;

                return {
                    months,
                    totalYTD: runningActual,
                    totalAnnualBudget,
                    pctOfBudget,
                    pctOfYtdBudget,
                    hasBudget: activeBudgets.length > 0,
                    fundFilter: fundFilter || null,
                };
            }

            // For all other giving widgets: last 365 days
            const yearAgo = new Date(now);
            yearAgo.setFullYear(now.getFullYear() - 1);
            const yearAgoStr = toYYYYMMDD(yearAgo);
            const current = donations.filter(d => {
                const ddStr = (d.date || '').slice(0, 10);
                return ddStr >= yearAgoStr && ddStr <= nowStr;
            });

            const totalGiving = current.reduce((s, d) => s + Number(d.amount || 0), 0);
            const uniqueDonors = new Set(current.map(d => d.donorId)).size;
            const recurringGivers = new Set(current.filter(d => d.isRecurring).map(d => d.donorId)).size;
            const averageGift = current.length > 0 ? totalGiving / current.length : 0;

            if (widgetId === 'giving_key_metrics') {
                // Previous period giving
                const prevYearAgo = new Date(yearAgo);
                prevYearAgo.setFullYear(prevYearAgo.getFullYear() - 1);
                const prevYearAgoStr = toYYYYMMDD(prevYearAgo);
                const prev = donations.filter(d => {
                    const dd = new Date(d.date);
                    const ddStr = (d.date || '').slice(0, 10);
                    return ddStr >= prevYearAgoStr && ddStr < yearAgoStr;
                });
                const previousTotalGiving = prev.reduce((s, d) => s + Number(d.amount || 0), 0);
                return { totalGiving, previousTotalGiving, contributingPeople: uniqueDonors, recurringGivers, averageGift };
            }

            if (widgetId === 'giving_fund_performance') {
                const fundMap = new Map<string, number>();
                current.forEach(d => fundMap.set(d.fundName || 'General', (fundMap.get(d.fundName || 'General') || 0) + Number(d.amount || 0)));
                const givingByFund = Array.from(fundMap.entries())
                    .map(([name, value]) => ({ name, value }))
                    .sort((a, b) => b.value - a.value)
                    .slice(0, 8);
                return { givingByFund, fundFilter: fundFilter || null };
            }

            if (widgetId === 'giving_donor_lifecycle' || widgetId === 'giving_donor_acquisition') {
                const churchSnap = await db.collection('churches').doc(churchId).get();
                const church = churchSnap.data();
                const lifecycleSettings = church?.donorLifecycleSettings || DEFAULT_LIFECYCLE_SETTINGS;
                const analytics = calculateGivingAnalytics(donations, 'Year', undefined, [], lifecycleSettings);
                
                if (widgetId === 'giving_donor_lifecycle') {
                    return { donorLifecycle: analytics.donorLifecycle };
                }
                return { 
                    newDonors: analytics.donorLifecycle.new, 
                    recoveredDonors: analytics.donorLifecycle.recovered, 
                    lapsedDonors: analytics.donorLifecycle.lapsed, 
                    secondTimeDonors: analytics.donorLifecycle.secondTime 
                };
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

        case 'people_age': {
            const snap = await db.collection('people').where('churchId', '==', churchId).get();
            const people = snap.docs.map(d => d.data());
            const now = new Date();
            const buckets: Record<string, number> = {
                '0–17': 0, '18–29': 0, '30–44': 0, '45–59': 0, '60–74': 0, '75+': 0, 'Unknown': 0
            };
            people.forEach(p => {
                if (!p.birthdate) { buckets['Unknown']++; return; }
                const age = Math.floor((now.getTime() - new Date(p.birthdate).getTime()) / (365.25 * 24 * 60 * 60 * 1000));
                if (age < 18) buckets['0–17']++;
                else if (age < 30) buckets['18–29']++;
                else if (age < 45) buckets['30–44']++;
                else if (age < 60) buckets['45–59']++;
                else if (age < 75) buckets['60–74']++;
                else buckets['75+']++;
            });
            return {
                ageData: Object.entries(buckets).map(([range, count]) => ({ range, count }))
            };
        }

        case 'people_gender': {
            const snap = await db.collection('people').where('churchId', '==', churchId).get();
            const people = snap.docs.map(d => d.data());
            const counts: Record<string, number> = { Male: 0, Female: 0, Unknown: 0 };
            people.forEach(p => {
                const g = p.gender || 'Unknown';
                counts[g] = (counts[g] || 0) + 1;
            });
            return {
                genderData: Object.entries(counts).map(([name, value]) => ({ name, value }))
            };
        }

        case 'people_membership': {
            const snap = await db.collection('people').where('churchId', '==', churchId).get();
            const people = snap.docs.map(d => d.data());
            const counts: Record<string, number> = {};
            people.forEach(p => {
                const s = p.status || 'Unknown';
                counts[s] = (counts[s] || 0) + 1;
            });
            return {
                membershipData: Object.entries(counts)
                    .map(([name, value]) => ({ name, value }))
                    .sort((a, b) => b.value - a.value)
            };
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

            const lwStartStr = toYYYYMMDD(lwStart);
            const lwEndStr = toYYYYMMDD(lwEnd);

            const fundTotals: Record<string, number> = {};
            allDonations.forEach(d => {
                const dDateStr = (d.date || '').slice(0, 10);
                if (dDateStr >= lwStartStr && dDateStr <= lwEndStr) {
                    fundTotals[d.fundName] = (fundTotals[d.fundName] || 0) + Number(d.amount || 0);
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
            
            const yearStartStr = toYYYYMMDD(yearStart);
            const now2Str = toYYYYMMDD(now2);

            const fundActuals: Record<string, number> = {};
            allDonations.forEach((d: any) => {
                const dDateStr = (d.date || '').slice(0, 10);
                if (dDateStr >= yearStartStr && dDateStr <= now2Str) {
                    fundActuals[d.fundName] = (fundActuals[d.fundName] || 0) + Number(d.amount || 0);
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
            const thirtyStr = toYYYYMMDD(thirtyDaysAgo);
            const sixtyStr  = toYYYYMMDD(sixtyDaysAgo);
            const todayStr  = toYYYYMMDD(now);

            const [donSnap, planSnap, groupSnap] = await Promise.all([
                db.collection('detailed_donations').where('churchId', '==', churchId).get(),
                db.collection('service_plans').where('churchId', '==', churchId).get(),
                db.collection('groups').where('churchId', '==', churchId).get(),
            ]);

            const donations: any[] = donSnap.docs.map((d: any) => d.data());
            const givingThis = new Set(donations.filter((d: any) => {
                const dDateStr = (d.date || '').slice(0, 10);
                return dDateStr >= thirtyStr && dDateStr <= todayStr;
            }).map((d: any) => d.donorId)).size;
            const givingLast = new Set(donations.filter((d: any) => {
                const dDateStr = (d.date || '').slice(0, 10);
                return dDateStr >= sixtyStr && dDateStr < thirtyStr;
            }).map((d: any) => d.donorId)).size;

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

        case 'group_attendance': {
            const period = config.timePeriod || 'This Month';
            const now = new Date();
            let start = new Date();
            let end = new Date();
            start.setHours(0, 0, 0, 0);
            end.setHours(23, 59, 59, 999);

            if (period === 'This Week') {
                start.setDate(start.getDate() - start.getDay());
            } else if (period === 'Last Week') {
                start.setDate(start.getDate() - start.getDay() - 7);
                end = new Date(start);
                end.setDate(start.getDate() + 6);
                end.setHours(23, 59, 59, 999);
            } else if (period === 'This Month') {
                start.setDate(1);
            } else if (period === 'Last Month') {
                start.setDate(1);
                start.setMonth(start.getMonth() - 1);
                end = new Date(start);
                end.setMonth(end.getMonth() + 1);
                end.setDate(0);
                end.setHours(23, 59, 59, 999);
            } else if (period === 'Last Quarter') {
                start.setDate(start.getDate() - 90);
            }

            const groupSnap = await db.collection('groups').where('churchId', '==', churchId).get();
            const groups: any[] = groupSnap.docs.map((d: any) => d.data());

            const aggMap = new Map<string, { date: string; timestamp: number; members: number; visitors: number }>();
            groups.forEach((g: any) => {
                (g.attendanceHistory || []).forEach((h: any) => {
                    const hDate = new Date(h.date);
                    if (hDate >= start && hDate <= end) {
                        const y = hDate.getFullYear();
                        const mo = String(hDate.getMonth() + 1).padStart(2, '0');
                        const dy = String(hDate.getDate()).padStart(2, '0');
                        const key = `${y}-${mo}-${dy}`;
                        if (!aggMap.has(key)) aggMap.set(key, { date: key, timestamp: hDate.getTime(), members: 0, visitors: 0 });
                        const entry = aggMap.get(key)!;
                        entry.members += h.members || 0;
                        entry.visitors += h.visitors || 0;
                    }
                });
            });

            const rows = Array.from(aggMap.values()).sort((a, b) => a.timestamp - b.timestamp).map(d => {
                const [y, m, dy] = d.date.split('-').map(Number);
                const dateObj = new Date(y, m - 1, dy);
                return {
                    name: dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
                    members: d.members,
                    visitors: d.visitors,
                    total: d.members + d.visitors,
                };
            });

            return {
                period,
                rows,
                periodTotal:    rows.reduce((s, r) => s + r.total,    0),
                periodMembers:  rows.reduce((s, r) => s + r.members,  0),
                periodVisitors: rows.reduce((s, r) => s + r.visitors, 0),
            };
        }

        case 'events': {
            const period = config.timePeriod || 'This Month';
            const now2 = new Date();
            let start2 = new Date();
            let end2 = new Date();
            start2.setHours(0, 0, 0, 0);
            end2.setHours(23, 59, 59, 999);

            if (period === 'This Week') {
                const day2 = start2.getDay();
                start2.setDate(start2.getDate() - day2);
            } else if (period === 'Last Week') {
                start2.setDate(start2.getDate() - start2.getDay() - 7);
                end2 = new Date(start2);
                end2.setDate(start2.getDate() + 6);
                end2.setHours(23, 59, 59, 999);
            } else if (period === 'This Month') {
                start2.setDate(1);
            } else if (period === 'Last 30 Days') {
                start2.setDate(start2.getDate() - 30);
            } else if (period === 'Last Month') {
                start2.setDate(1);
                start2.setMonth(start2.getMonth() - 1);
                end2 = new Date(start2);
                end2.setMonth(end2.getMonth() + 1);
                end2.setDate(0);
                end2.setHours(23, 59, 59, 999);
            } else if (period === 'Last Quarter') {
                start2.setDate(start2.getDate() - 90);
            }

            const toLocalDateStr = (d: Date) => {
                const y = d.getFullYear();
                const m = String(d.getMonth() + 1).padStart(2, '0');
                const day = String(d.getDate()).padStart(2, '0');
                return `${y}-${m}-${day}`;
            };

            // Helper: normalise a Firestore date field (may be a Timestamp object, a string, or a Date)
            const toDateStr = (raw: any): string => {
                if (!raw) return '';
                // Firestore Admin Timestamp: { _seconds, toDate() }
                if (typeof raw === 'object' && typeof raw.toDate === 'function') {
                    return toLocalDateStr(raw.toDate());
                }
                // Already a string like 'YYYY-MM-DD'
                if (typeof raw === 'string') return raw.slice(0, 10);
                // JS Date
                if (raw instanceof Date) return toLocalDateStr(raw);
                return '';
            };

            const attendanceSnap = await db.collection('attendance').where('churchId', '==', churchId).get();
            const attendance: any[] = attendanceSnap.docs.map((d: any) => d.data());
            const startStr = toLocalDateStr(start2);
            const endStr   = toLocalDateStr(end2);
            console.log(`[Scheduler/events] churchId=${churchId} period=${period} range=${startStr}→${endStr} totalAttendanceDocs=${attendance.length}`);

            const checkInTrends = attendance
                .map(a => ({ ...a, _dateStr: toDateStr(a.date) }))
                .filter(a => a._dateStr >= startStr && a._dateStr <= endStr)
                .map(a => ({
                    date: a._dateStr,
                    isoDate: a._dateStr,
                    guests: a.guests || 0,
                    regulars: a.regulars || 0,
                    volunteers: a.volunteers || 0,
                    headcount: a.headcount || a.count || 0,
                    total: a.count || a.headcount || 0,
                    events: Array.isArray(a.events) ? a.events : []
                }));
            console.log(`[Scheduler/events] matchingDocs=${checkInTrends.length} samples=${checkInTrends.slice(0,3).map((t: any)=>`${t.date}:total=${t.total},evts=${t.events.length}`).join(' | ')}`);

            const eventsData: any[] = [];
            checkInTrends.forEach((trend: any) => {
                // Prefer per-event breakdown but only include events with real headcounts
                const validEvents = trend.events.filter((ev: any) => (ev.total || ev.headcount || 0) > 0);
                if (validEvents.length > 0) {
                    eventsData.push(...validEvents);
                } else if (trend.total > 0) {
                    // Only add daily-total fallback if there's actual headcount data
                    eventsData.push({
                        name: 'Daily Total',
                        startsAt: trend.date,
                        guests: trend.guests,
                        regulars: trend.regulars,
                        volunteers: trend.volunteers,
                        headcount: trend.headcount,
                        total: trend.total
                    });
                }
            });

            // ── Deep fallback: if attendance has no useful data, query check_ins directly ──
            if (eventsData.length === 0) {
                console.log(`[Scheduler/events] No data from attendance — falling back to check_ins collection`);
                try {
                    const ciSnap = await db.collection('check_ins').where('churchId', '==', churchId).get();
                    const allCi: any[] = ciSnap.docs.map((d: any) => d.data());
                    const dateMap = new Map<string, number>();
                    allCi.forEach((ci: any) => {
                        const d = toDateStr(ci.date || ci.checkedInAt || ci.createdAt);
                        if (d && d >= startStr && d <= endStr) {
                            dateMap.set(d, (dateMap.get(d) || 0) + 1);
                        }
                    });
                    dateMap.forEach((count, date) => {
                        eventsData.push({ name: 'Check-Ins', startsAt: date, total: count, headcount: count });
                    });
                    console.log(`[Scheduler/events] Fallback found ${eventsData.length} date groups from check_ins`);
                } catch (fbErr: any) {
                    console.warn(`[Scheduler/events] check_ins fallback failed: ${fbErr.message}`);
                }
            }

            // Sort descending → keep most recent events → re-sort ascending for email display
            eventsData.sort((a: any, b: any) => new Date(b.startsAt).getTime() - new Date(a.startsAt).getTime());
            const recentEvents = eventsData.slice(0, 20);
            recentEvents.sort((a: any, b: any) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());
            console.log(`[Scheduler/events] Final eventsData count=${recentEvents.length}`);
            return { period, events: recentEvents };
        }

        // ── Average Giving (12-week rolling) ────────────────────────────────
        case 'giving_average_giving': {
            const snap = await db.collection('detailed_donations').where('churchId', '==', churchId).get();
            const donations: any[] = snap.docs.map((d: any) => d.data());
            const now = new Date();
            now.setHours(23, 59, 59, 999);

            // Monday-align current week, then go back 12 weeks
            const todayMonday = new Date(now);
            todayMonday.setDate(now.getDate() - (now.getDay() === 0 ? 6 : now.getDay() - 1));
            todayMonday.setHours(0, 0, 0, 0);

            const weeks: { start: Date; end: Date; label: string }[] = [];
            for (let i = 11; i >= 0; i--) {
                const wStart = new Date(todayMonday);
                wStart.setDate(todayMonday.getDate() - i * 7);
                const wEnd = new Date(wStart);
                wEnd.setDate(wStart.getDate() + 6);
                wEnd.setHours(23, 59, 59, 999);
                const label = wStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
                weeks.push({ start: wStart, end: wEnd, label });
            }

            const windowStartStr = toYYYYMMDD(weeks[0].start);
            const nowStr = toYYYYMMDD(now);
            const fundSet = new Set<string>();
            donations.forEach((d: any) => {
                const ddStr = (d.date || '').slice(0, 10);
                if (ddStr >= windowStartStr && ddStr <= nowStr) fundSet.add(d.fundName);
            });
            const fundNames = Array.from(fundSet).sort();

            const weekData = weeks.map(w => {
                const wStartStr = toYYYYMMDD(w.start);
                const wEndStr = toYYYYMMDD(w.end);
                const byFund: Record<string, number> = {};
                fundNames.forEach(f => (byFund[f] = 0));
                donations.forEach((d: any) => {
                    const ddStr = (d.date || '').slice(0, 10);
                    if (ddStr >= wStartStr && ddStr <= wEndStr) {
                        byFund[d.fundName] = (byFund[d.fundName] || 0) + Number(d.amount || 0);
                    }
                });
                const total = Object.values(byFund).reduce((s: number, v: number) => s + v, 0);
                return { label: w.label, byFund, total };
            });

            const fundAverages = fundNames.map(f => ({
                name: f,
                average: weekData.reduce((s, w) => s + (w.byFund[f] || 0), 0) / 12,
            })).sort((a, b) => b.average - a.average);

            const overallWeeklyAverage = weekData.reduce((s, w) => s + w.total, 0) / 12;

            return { weeks: weekData, fundNames, fundAverages, overallWeeklyAverage };
        }

        // ── Birthdays / Anniversaries ────────────────────────────────────────
        case 'people_birthdays':
        case 'people_anniversaries': {
            let pcoListPeopleIds: Set<string> | null = null;
            if (config.pcoListId) {
                const churchSnap = await db.collection('churches').doc(churchId).get();
                const token = churchSnap.data()?.pcoAccessToken;
                if (token) {
                    try {
                        const ids = new Set<string>();
                        let pcoPage = 1;
                        let hasMore = true;
                        while (hasMore) {
                            const res = await fetch(`https://api.planningcenteronline.com/people/v2/lists/${config.pcoListId}/people?per_page=100&offset=${(pcoPage - 1) * 100}`, {
                                headers: { 
                                    Authorization: `Bearer ${token}`,
                                    'Connection': 'close'
                                }
                            });
                            if (!res.ok) break;
                            const data = await res.json();
                            const items = data.data || [];
                            for (const item of items) ids.add(item.id);
                            hasMore = !!data.meta?.next?.offset && items.length === 100;
                            pcoPage++;
                        }
                        pcoListPeopleIds = ids;
                    } catch (e) {
                        console.warn('Failed to fetch PCO list for widget', e);
                    }
                }
            }

            const snap = await db.collection('people').where('churchId', '==', churchId).get();
            let people: any[] = snap.docs.map((d: any) => d.data());
            
            if (pcoListPeopleIds) {
                people = people.filter((p: any) => pcoListPeopleIds!.has(p.id));
            }

            const EXCLUDED = ['Inactive', 'Archived'];
            const now = new Date();

            if (widgetId === 'people_birthdays') {
                const upcoming = people
                    .filter((p: any) => !!p.birthdate && !EXCLUDED.includes(p.status || ''))
                    .map((p: any) => {
                        const bd = new Date(p.birthdate);
                        const thisYear = new Date(now.getFullYear(), bd.getMonth(), bd.getDate());
                        if (thisYear < now) thisYear.setFullYear(now.getFullYear() + 1);
                        const daysUntil = Math.ceil((thisYear.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
                        return { name: p.name, daysUntil, dateStr: thisYear.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) };
                    })
                    .filter((p: any) => p.daysUntil <= 30)
                    .sort((a: any, b: any) => a.daysUntil - b.daysUntil)
                    .slice(0, 15);
                return { upcoming, listFilter: config.pcoListName || null };
            } else {
                const upcoming = people
                    .filter((p: any) => !!p.anniversary && !EXCLUDED.includes(p.status || ''))
                    .map((p: any) => {
                        const ann = new Date(p.anniversary);
                        const thisYear = new Date(now.getFullYear(), ann.getMonth(), ann.getDate());
                        if (thisYear < now) thisYear.setFullYear(now.getFullYear() + 1);
                        const daysUntil = Math.ceil((thisYear.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
                        const years = now.getFullYear() - ann.getFullYear();
                        return { name: p.name, daysUntil, dateStr: thisYear.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }), years };
                    })
                    .filter((p: any) => p.daysUntil <= 30)
                    .sort((a: any, b: any) => a.daysUntil - b.daysUntil)
                    .slice(0, 15);
                return { upcoming, listFilter: config.pcoListName || null };
            }
        }

        default:
            return {};
    }
    return {};
}

// ─── Scheduler ───────────────────────────────────────────────────────────────

const MAX_RETRIES = 5;

/**
 * How fresh PCO data must be to skip the pre-send sync.
 *
 * `syncAllData` is a multi-hundred-request crawl of the whole PCO org. Running it
 * unconditionally per due campaign, on every tick, across every server instance
 * saturates PCO's rate limit and makes the crawls fail — which is how giving data
 * ended up mislabeled. Campaign analytics do not need minute-fresh data.
 */
const PRE_SEND_SYNC_MAX_AGE_MS = 60 * 60 * 1000; // 1 hour

/** A campaign claimed for longer than this is assumed to belong to a dead instance. */
const STALE_CLAIM_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Starts the email scheduler.  Call once on server startup.
 * Polls Firestore every 60 seconds for campaigns due to send.
 */
export function startEmailScheduler(db: any): void {
    const log = createServerLogger(db as any);

    const tick = async () => {
        try {
            const now = Date.now();

            // Release claims from instances that died mid-send, so a crash doesn't
            // wedge a campaign in 'sending' forever.
            try {
                const stale = await db.collection('email_campaigns')
                    .where('status', '==', 'sending')
                    .where('claimedAt', '<=', now - STALE_CLAIM_MS)
                    .get();
                if (!stale.empty) {
                    await Promise.all(stale.docs.map((d: any) =>
                        d.ref.update({ status: 'scheduled', updatedAt: Date.now() })
                    ));
                    log.warn(`[Scheduler] Released ${stale.size} stale campaign claim(s)`, 'system', {}, '');
                }
            } catch (staleErr: any) {
                console.warn('[EmailScheduler] Stale claim sweep failed:', staleErr?.message);
            }

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

                // Claim the campaign atomically. Multiple server instances each run
                // this scheduler, so without a claim they all process the same due
                // campaign on every tick — each one kicking off its own full PCO sync.
                const claimed = await db.runTransaction(async (tx: any) => {
                    const ref = db.collection('email_campaigns').doc(campaignId);
                    const fresh = await tx.get(ref);
                    if (!fresh.exists || fresh.data().status !== 'scheduled') return false;
                    tx.update(ref, { status: 'sending', claimedAt: Date.now(), updatedAt: Date.now() });
                    return true;
                });

                if (!claimed) {
                    // Another instance got there first.
                    return;
                }

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
                    const hasRefreshable = blocks.some((b: any) => 
                        b.type === 'analytics_block' || 
                        b.type === 'data_chart' || 
                        b.type === 'pastoral_care_chart'
                    );

                    let finalBlocks = blocks;
                    if (hasRefreshable) {
                        // Only sync if the tenant's PCO data is actually stale.
                        const churchSnap = await db.collection('churches').doc(churchId).get();
                        const lastSync = churchSnap.data()?.lastSyncTimestamp || 0;
                        const age = Date.now() - lastSync;

                        if (age > PRE_SEND_SYNC_MAX_AGE_MS) {
                            log.info(`[Scheduler] PCO data is ${Math.round(age / 60000)}m old — syncing before refreshing blocks for campaign ${campaignId}`, 'system', { campaignId }, churchId);
                            try {
                                await syncAllData(churchId);
                                log.info(`[Scheduler] Successfully synced PCO data for campaign ${campaignId}`, 'system', { campaignId }, churchId);
                            } catch (syncErr: any) {
                                log.warn(`[Scheduler] PCO sync failed before refreshing blocks for campaign ${campaignId}: ${syncErr.message}`, 'system', { campaignId }, churchId);
                            }
                        } else {
                            log.info(`[Scheduler] Skipping pre-send sync for campaign ${campaignId} — PCO data is ${Math.round(age / 60000)}m old`, 'system', { campaignId }, churchId);
                        }

                        log.info(`[Scheduler] Refreshing dynamic blocks for campaign ${campaignId}`, 'system', { campaignId }, churchId);
                        const { blocks: refreshed, refreshed: count } = await refreshCampaignBlocks(db, churchId, blocks);
                        finalBlocks = refreshed;

                        // Persist refreshed blocks back to Firestore before sending
                        await db.collection('email_campaigns').doc(campaignId).update({
                            blocks: finalBlocks,
                            analyticsRefreshedAt: Date.now(),
                            updatedAt: Date.now(),
                        });

                        log.info(`[Scheduler] Refreshed ${count} dynamic block(s) for campaign ${campaignId}`, 'system', { campaignId }, churchId);
                    }

                    // 1.5 Auto-refresh PCO Smart Lists (if applicable) BEFORE send
                    if (campaign.toListId) {
                        try {
                            log.info(`[Scheduler] Triggering PCO list refresh for list ${campaign.toListId}`, 'system', { campaignId }, churchId);
                            const churchSnap = await db.collection('churches').doc(churchId).get();
                            const token = churchSnap.data()?.pcoAccessToken;
                            if (token) {
                                // PCO API: POST /people/v2/lists/{id}/run
                                await fetch(`https://api.planningcenteronline.com/people/v2/lists/${campaign.toListId}/run`, {
                                    method: 'POST',
                                    headers: { 
                                        Authorization: `Bearer ${token}`,
                                        'Connection': 'close'
                                    }
                                });
                                // Wait 4 seconds for PCO to process the list before fetching members
                                log.info(`[Scheduler] Waiting 4s for PCO list ${campaign.toListId} to process...`, 'system', { campaignId }, churchId);
                                await new Promise(r => setTimeout(r, 4000));
                            }
                        } catch (e: any) {
                            log.warn(`[Scheduler] Failed to trigger PCO list refresh: ${e.message}`, 'system', { campaignId }, churchId);
                        }
                    }

                    // 2. Execute send (skip status update if recurring)
                    const isRecurring = !!campaign.recurringFrequency;
                    const result = await executeSend(db as any, campaignId, churchId, undefined, isRecurring, 'email_campaigns', true);

                    log.info(
                        `[Scheduler] Campaign ${campaignId} sent successfully: ${result.message}`,
                        'system', { campaignId, churchId }, churchId
                    );

                    // 3. Handle recurring reschedule
                    if (isRecurring) {
                        const nowTime = Date.now();
                        const d = new Date(campaign.scheduledAt || nowTime);

                        // Advance until the next occurrence is in the future. Adding a
                        // single interval to a schedule that has fallen behind leaves it
                        // still due, so the campaign re-sends on every tick until it
                        // catches up — one send per tick, each with its own PCO sync.
                        const advance = () => {
                            if (campaign.recurringFrequency === 'daily') d.setDate(d.getDate() + 1);
                            else if (campaign.recurringFrequency === 'weekly') d.setDate(d.getDate() + 7);
                            else if (campaign.recurringFrequency === 'monthly') d.setMonth(d.getMonth() + 1);
                            else d.setDate(d.getDate() + 1); // fallback
                        };
                        advance();
                        let guard = 0;
                        while (d.getTime() <= nowTime && guard++ < 1000) advance();

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
            // Top-level scheduler error (e.g. Firestore query failed, missing index, etc.)
            console.error('[EmailScheduler] Tick error:', e?.message);
            // Also surface in the admin log portal so it isn't silently swallowed
            try { log.error(`[EmailScheduler] Tick failed: ${e?.message}`, 'system', {}, ''); } catch {}
        }
    };

    // Run immediately on start, then every 60 seconds
    tick();
    setInterval(tick, 60_000);

    console.log('[EmailScheduler] Started — polling every 60 seconds');
}
