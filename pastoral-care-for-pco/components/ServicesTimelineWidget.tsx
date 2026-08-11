
import React, { useMemo, useState, useEffect } from 'react';
import { ServicesDashboardData, DetailedDonation, PcoRegistrationEvent, OutreachSession, OutreachSlot, AttendanceRecord } from '../types';
import { firestore } from '../services/firestoreService';

interface ServicesTimelineWidgetProps {
    servicesData: ServicesDashboardData | null;
    /** All raw donations (unfiltered) — used to build per-batch giving totals */
    donations: DetailedDonation[];
    /** Synced PCO Registrations & Calendar events */
    registrationEvents?: PcoRegistrationEvent[];
    /** Church ID for auto-fetching registrations from Firestore if not provided */
    churchId?: string;
    /**
     * Composite role gate. Services and dates are open to every user, but giving
     * batches are not — when false the day cells render without their BatchCards
     * rather than the whole timeline being hidden.
     */
    showGiving?: boolean;
    outreachSessions?: OutreachSession[];
    outreachSlots?: OutreachSlot[];
    attendanceData?: AttendanceRecord[];
    /** Only supplied when hosted in the legacy widget grid. */
    onRemove?: () => void;
}

interface FundEntry {
    fundName: string;
    amount: number;
    donorCount: number;
}

/** A single PCO giving batch (or a synthetic "unbatched" grouping per date) */
interface BatchEntry {
    batchKey: string;   // batchId, or "date_<YYYY-MM-DD>_unbatched"
    batchName: string;  // e.g. "Sunday Offering 6/8", or "Online Giving"
    date: string;       // YYYY-MM-DD — the earliest received_at in this batch
    totalAmount: number;
    fundBreakdown: FundEntry[]; // sorted by amount desc
}

export interface EventEntry {
    id: string;
    name: string;
    type: 'registration' | 'calendar';
    startsAt?: string | null;
    endsAt?: string | null;
    signupCount?: number;
    signupLimit?: number | null;
    campusName?: string | null;
    publicUrl?: string | null;
    description?: string | null;
    isUpcoming?: boolean;
}

export interface OutreachSummary {
    totalReached: number;
    sessionNames: string[];
}

interface DayEntry {
    /** Calendar date key — used purely for aligning with service plans */
    dateKey: string;
    dayOfWeek: string;
    dayNum: string;
    monthAbbr: string;
    services: {
        id: string;
        name: string;
        time: string;
        volunteersScheduled: number;
        attendance?: number;
        isUpcoming?: boolean;
    }[];
    events: EventEntry[];
    totalHeadcount: number;
    /** Batches that fall on this calendar date */
    batches: BatchEntry[];
    outreachSummary?: OutreachSummary | null;
    isGivingOnly: boolean;
    isToday: boolean;
    isUpcoming: boolean;
    relativeLabel?: string | null;
}

/** Parses time string like "9:00 AM", "11:30 am", "09:00" or ISO string into minutes from midnight */
const parseTimeToMinutes = (timeStr?: string | null): number | null => {
    if (!timeStr) return null;
    if (timeStr.includes('T')) {
        const d = new Date(timeStr);
        if (!isNaN(d.getTime())) return d.getHours() * 60 + d.getMinutes();
    }
    const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(am|pm)?/i);
    if (!match) return null;
    let hours = parseInt(match[1], 10);
    const minutes = parseInt(match[2], 10);
    const ampm = match[3]?.toLowerCase();
    if (ampm === 'pm' && hours < 12) hours += 12;
    if (ampm === 'am' && hours === 12) hours = 0;
    return hours * 60 + minutes;
};

/** Formats a Date to local YYYY-MM-DD without UTC-midnight shift */
const toLocalDateKey = (d: Date): string => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
};

/** Finds the Sunday date key (YYYY-MM-DD) for a given date string */
const getSundayForDateKey = (dateStr: string): string => {
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return dateStr;
    const dayOfWeek = d.getDay(); // 0 = Sunday
    if (dayOfWeek === 0) return dateStr;
    const daysUntilSunday = 7 - dayOfWeek;
    const sunday = new Date(d.getTime() + daysUntilSunday * 24 * 60 * 60 * 1000);
    return toLocalDateKey(sunday);
};

const fmtAmt = (n: number) =>
    n >= 1000 ? `$${(n / 1000).toFixed(1)}k` : `$${n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

/** Registration / Calendar Event card */
const EventCard: React.FC<{ event: EventEntry }> = ({ event }) => {
    return (
        <div className="rounded-xl border border-purple-100 dark:border-purple-800/40 bg-purple-50/70 dark:bg-purple-900/10 p-3 space-y-2">
            <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-xs">🎟️</span>
                    <span className="text-xs font-bold text-purple-900 dark:text-purple-300 truncate">
                        {event.name}
                    </span>
                </div>
                {event.startsAt && (
                    <span className="text-[10px] font-bold text-purple-600 dark:text-purple-400 shrink-0 font-mono">
                        {new Date(event.startsAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                    </span>
                )}
            </div>

            <div className="flex flex-wrap items-center justify-between text-[10px] text-slate-500 dark:text-slate-400 gap-2">
                <div className="flex items-center gap-2 flex-wrap">
                    {event.campusName && (
                        <span className="px-1.5 py-0.5 rounded bg-purple-100 dark:bg-purple-900/40 text-purple-700 dark:text-purple-300 font-semibold text-[9px]">
                            {event.campusName}
                        </span>
                    )}
                    <span className="font-semibold text-purple-800 dark:text-purple-300">
                        {event.signupCount || 0} registered
                        {event.signupLimit ? ` / ${event.signupLimit} max` : ''}
                    </span>
                </div>
                {event.publicUrl && (
                    <a
                        href={event.publicUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-purple-600 hover:text-purple-800 dark:text-purple-400 dark:hover:text-purple-300 font-bold underline"
                    >
                        View Event →
                    </a>
                )}
            </div>
        </div>
    );
};

/** Batch card — always shows fund breakdown inline */
const BatchCard: React.FC<{ batch: BatchEntry; isServiceDay: boolean }> = ({ batch }) => {
    const multiFund = batch.fundBreakdown.length > 1;

    return (
        <div className="rounded-xl border border-emerald-100 dark:border-emerald-800/40 bg-emerald-50/60 dark:bg-emerald-900/10 overflow-hidden">
            {/* Batch header */}
            <div className="flex items-center justify-between px-3 py-2">
                <div className="flex items-center gap-2 min-w-0">
                    <span className="text-[10px]">💰</span>
                    <span className="text-[10px] font-bold text-emerald-700 dark:text-emerald-400 truncate">
                        {batch.batchName}
                    </span>
                </div>
                <span className="text-[10px] font-black text-emerald-700 dark:text-emerald-300 shrink-0 ml-2">
                    {fmtAmt(batch.totalAmount)}
                </span>
            </div>

            {/* Fund breakdown — always visible */}
            {batch.fundBreakdown.length > 0 && (
                <div className="border-t border-emerald-100 dark:border-emerald-800/40 divide-y divide-emerald-100/60 dark:divide-emerald-800/20">
                    {batch.fundBreakdown.map(fund => (
                        <div key={fund.fundName} className="flex items-center justify-between px-3 py-1.5">
                            <div className="flex items-center gap-2 min-w-0">
                                <span className="w-1 h-1 rounded-full bg-emerald-400 shrink-0" />
                                <span className="text-[11px] font-semibold text-emerald-700 dark:text-emerald-400 truncate">
                                    {fund.fundName}
                                </span>
                                <span className="text-[10px] text-slate-400 dark:text-slate-500 whitespace-nowrap shrink-0">
                                    {fund.donorCount} {fund.donorCount === 1 ? 'gift' : 'gifts'}
                                </span>
                            </div>
                            <span className="text-[11px] font-black text-emerald-600 dark:text-emerald-400 shrink-0 ml-2">
                                {fmtAmt(fund.amount)}
                            </span>
                        </div>
                    ))}
                    {multiFund && (
                        <div className="flex items-center justify-between px-3 py-1.5 bg-emerald-100/40 dark:bg-emerald-800/20">
                            <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300 uppercase tracking-wider">
                                Total
                            </span>
                            <span className="text-[11px] font-black text-emerald-800 dark:text-emerald-300">
                                {fmtAmt(batch.totalAmount)}
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};

export const ServicesTimelineWidget: React.FC<ServicesTimelineWidgetProps> = ({
    servicesData,
    donations,
    registrationEvents,
    churchId: propChurchId,
    showGiving = true,
    outreachSessions = [],
    outreachSlots = [],
    attendanceData = [],
    onRemove,
}) => {
    const [fetchedEvents, setFetchedEvents] = useState<PcoRegistrationEvent[]>([]);
    const [rollupToSundays, setRollupToSundays] = useState<boolean>(true);

    useEffect(() => {
        if (registrationEvents && registrationEvents.length > 0) {
            setFetchedEvents(registrationEvents);
            return;
        }
        const cId = propChurchId || donations[0]?.churchId || localStorage.getItem('currentChurchId') || localStorage.getItem('churchId');
        if (cId) {
            firestore.getRegistrations(cId).then(events => {
                if (events && events.length > 0) {
                    setFetchedEvents(events);
                }
            }).catch(() => {});
        }
    }, [donations, propChurchId, registrationEvents]);

    // Drop giving before any batch grouping runs, so no amount reaches the DOM
    // for a user without the role.
    const visibleDonations = showGiving ? donations : [];
    const allEvents = registrationEvents && registrationEvents.length > 0 ? registrationEvents : fetchedEvents;

    const days = useMemo<DayEntry[]>(() => {
        const now = new Date();
        const todayKey = toLocalDateKey(now);

        const upcomingLimitDate = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        const upcomingLimitKey = toLocalDateKey(upcomingLimitDate);

        const pastLimitDate = new Date(now.getTime() - 21 * 24 * 60 * 60 * 1000);
        const pastLimitKey = toLocalDateKey(pastLimitDate);

        // ── 1. Group donations by PCO batch or Sunday Rollup ─────────────────────
        const batchMap: Record<string, {
            batchName: string;
            date: string;
            funds: Record<string, { amount: number; donorCount: number }>;
            totalAmount: number;
        }> = {};

        visibleDonations.forEach(d => {
            const rawDateKey = (d.date || '').slice(0, 10);
            if (rawDateKey.length !== 10) return;

            const targetDateKey = rollupToSundays ? getSundayForDateKey(rawDateKey) : rawDateKey;
            if (targetDateKey > upcomingLimitKey || targetDateKey < pastLimitKey) return;

            let batchKey: string;
            let batchName: string;

            if (rollupToSundays) {
                batchKey = `sunday_rollup_${targetDateKey}`;
                batchName = `Weekly Offering (${targetDateKey})`;
            } else if (d.batchId) {
                batchKey = `batch_${d.batchId}`;
                batchName = d.batchName || `Batch ${d.batchId}`;
            } else {
                const src = (d.paymentSource || 'Unknown').trim();
                batchKey = `date_${targetDateKey}_src_${src}`;
                batchName = src;
            }

            if (!batchMap[batchKey]) {
                batchMap[batchKey] = {
                    batchName,
                    date: targetDateKey,
                    funds: {},
                    totalAmount: 0,
                };
            }

            const entry = batchMap[batchKey];
            entry.totalAmount += d.amount;
            const fundName = d.fundName || 'General';
            if (!entry.funds[fundName]) entry.funds[fundName] = { amount: 0, donorCount: 0 };
            entry.funds[fundName].amount += d.amount;
            entry.funds[fundName].donorCount += 1;
        });

        const batchesByDate: Record<string, BatchEntry[]> = {};
        Object.entries(batchMap).forEach(([batchKey, v]) => {
            const be: BatchEntry = {
                batchKey,
                batchName: v.batchName,
                date: v.date,
                totalAmount: v.totalAmount,
                fundBreakdown: Object.entries(v.funds)
                    .map(([fundName, fv]) => ({ fundName, amount: fv.amount, donorCount: fv.donorCount }))
                    .sort((a, b) => b.amount - a.amount),
            };
            if (!batchesByDate[v.date]) batchesByDate[v.date] = [];
            batchesByDate[v.date].push(be);
        });

        Object.values(batchesByDate).forEach(arr =>
            arr.sort((a, b) => b.totalAmount - a.totalAmount)
        );

        // ── 2. Headcount from checkIns.trends ───────────────────────────────────
        const headcountByDate: Record<string, number> = {};
        const checkTrends: any[] = (servicesData?.checkIns?.trends as any[]) || [];
        checkTrends.forEach((trend: any) => {
            const key = (trend.isoDate || trend.date || '').slice(0, 10);
            if (!key) return;
            const total =
                trend.total != null
                    ? trend.total
                    : (trend.headcount || 0) +
                      (trend.guests || 0) +
                      (trend.regulars || 0) +
                      (trend.volunteers || 0);
            headcountByDate[key] = (headcountByDate[key] || 0) + total;
        });

        // ── 3. Group Service Plans (Past + Future) by date ───────────────────────
        const plansByDate: Record<string, DayEntry['services']> = {};
        const combinedPlans = [
            ...(servicesData?.futurePlans || []),
            ...(servicesData?.recentPlans || []),
            ...(servicesData?.plans || []),
        ];
        const seenPlanIds = new Set<string>();

        combinedPlans.forEach(plan => {
            if (!plan || !plan.id || seenPlanIds.has(plan.id)) return;
            seenPlanIds.add(plan.id);

            const planDate =
                plan.planTimes && plan.planTimes.length > 0
                    ? new Date(plan.planTimes[0].startsAt)
                    : new Date(plan.sortDate);

            const key = toLocalDateKey(planDate);
            if (key < pastLimitKey || key > upcomingLimitKey) return;

            if (!plansByDate[key]) plansByDate[key] = [];

            const timeStr =
                plan.planTimes && plan.planTimes.length > 0
                    ? new Date(plan.planTimes[0].startsAt).toLocaleTimeString(undefined, {
                          hour: 'numeric',
                          minute: '2-digit',
                      })
                    : '';

            const volunteers =
                plan.teamMembers?.filter(m => {
                    const s = (m.status || '').toLowerCase();
                    return s === 'confirmed' || s === 'c';
                }).length || 0;

            plansByDate[key].push({
                id: plan.id,
                name: plan.serviceTypeName || plan.seriesTitle || 'Service',
                time: timeStr,
                volunteersScheduled: volunteers,
                isUpcoming: key > todayKey,
            });
        });

        // ── 3b. Attach per-service attendance numbers ────────────────────────────
        Object.entries(plansByDate).forEach(([dateKey, servicesOnDate]) => {
            if (servicesOnDate.length === 0) return;
            const totalHc = headcountByDate[dateKey] || 0;
            if (totalHc <= 0) return;

            const attRec = (attendanceData || []).find(a => (a.date || '').slice(0, 10) === dateKey);
            const trendRec = checkTrends.find(t => (t.isoDate || t.date || '').slice(0, 10) === dateKey);
            const eventBreakdowns: any[] = attRec?.events || trendRec?.events || [];
            const customBreakdowns: any[] = attRec?.customHeadcounts || trendRec?.customHeadcounts || [];

            if (servicesOnDate.length === 1) {
                servicesOnDate[0].attendance = totalHc;
            } else {
                // Sort services on date chronologically by start time
                const sortedServices = [...servicesOnDate].sort((a, b) => {
                    const tA = parseTimeToMinutes(a.time) ?? 0;
                    const tB = parseTimeToMinutes(b.time) ?? 0;
                    return tA - tB;
                });

                const sortedEvents = [...eventBreakdowns].sort((a, b) => {
                    const tA = parseTimeToMinutes(a.startsAt || a.time) ?? 0;
                    const tB = parseTimeToMinutes(b.startsAt || b.time) ?? 0;
                    return tA - tB;
                });

                const usedEventIndices = new Set<number>();
                let assignedTotal = 0;

                sortedServices.forEach((svc, svcIdx) => {
                    const svcMins = parseTimeToMinutes(svc.time);
                    let matchedEventIdx = -1;

                    // 1. Match by start time (within 45 minutes)
                    if (svcMins !== null && sortedEvents.length > 0) {
                        matchedEventIdx = sortedEvents.findIndex((e, idx) => {
                            if (usedEventIndices.has(idx)) return false;
                            const eMins = parseTimeToMinutes(e.startsAt || e.time);
                            if (eMins === null) return false;
                            return Math.abs(svcMins - eMins) <= 45;
                        });
                    }

                    // 2. Match by name substring
                    if (matchedEventIdx === -1 && sortedEvents.length > 0) {
                        const sName = svc.name.toLowerCase();
                        matchedEventIdx = sortedEvents.findIndex((e, idx) => {
                            if (usedEventIndices.has(idx)) return false;
                            const eName = (e.name || '').toLowerCase();
                            return eName.includes(sName) || sName.includes(eName);
                        });
                    }

                    // 3. Match by ordinal index position if service count equals event breakdown count
                    if (matchedEventIdx === -1 && sortedServices.length === sortedEvents.length) {
                        if (!usedEventIndices.has(svcIdx)) {
                            matchedEventIdx = svcIdx;
                        }
                    }

                    if (matchedEventIdx !== -1) {
                        usedEventIndices.add(matchedEventIdx);
                        const evt = sortedEvents[matchedEventIdx];
                        svc.attendance = evt.total || evt.headcount || 0;
                        assignedTotal += svc.attendance;
                    } else {
                        // Check custom headcounts as backup
                        const sName = svc.name.toLowerCase();
                        const sTime = svc.time.toLowerCase();
                        const matchCust = customBreakdowns.find(c => {
                            const cName = (c.name || '').toLowerCase();
                            return cName.includes(sName) || sName.includes(cName) || (sTime && cName.includes(sTime));
                        });
                        if (matchCust && matchCust.total > 0) {
                            svc.attendance = matchCust.total;
                            assignedTotal += svc.attendance;
                        }
                    }
                });

                // Fallback for any remaining unassigned services if no distinct breakdown was found
                const unassigned = servicesOnDate.filter(s => s.attendance === undefined);
                const remaining = Math.max(0, totalHc - assignedTotal);
                if (unassigned.length > 0 && remaining > 0 && assignedTotal === 0) {
                    const share = Math.round(remaining / unassigned.length);
                    unassigned.forEach(s => { s.attendance = share; });
                }
            }
        });

        // ── 4. Group Registration & Calendar Events by date ──────────────────────
        const eventsByDate: Record<string, EventEntry[]> = {};
        allEvents.forEach(ev => {
            if (!ev) return;
            const dateStr = ev.startsAt || ev.openAt || '';
            if (!dateStr) return;
            const evDate = new Date(dateStr);
            if (isNaN(evDate.getTime())) return;

            const key = toLocalDateKey(evDate);
            if (key < pastLimitKey || key > upcomingLimitKey) return;

            if (!eventsByDate[key]) eventsByDate[key] = [];

            eventsByDate[key].push({
                id: ev.id || ev.pcoId,
                name: ev.name || 'Registration Event',
                type: 'registration',
                startsAt: ev.startsAt,
                endsAt: ev.endsAt,
                signupCount: ev.signupCount || ev.totalAttendees || 0,
                signupLimit: ev.signupLimit,
                campusName: ev.campusName,
                publicUrl: ev.publicUrl,
                description: ev.description,
                isUpcoming: key > todayKey,
            });
        });

        // ── 4b. Group Outreach Contacts by date ──────────────────────────────────
        const outreachByDate: Record<string, { totalReached: number; sessionNames: Set<string> }> = {};
        const sessionNameMap = new Map<string, string>();
        (outreachSessions || []).forEach(s => {
            if (s.id && s.name) sessionNameMap.set(s.id, s.name);
        });
        (outreachSlots || []).forEach(slot => {
            if (!slot || slot.status !== 'contacted') return;
            const timestamp = slot.completedAt || slot.assignedAt;
            if (!timestamp) return;
            const slotDate = new Date(timestamp);
            if (isNaN(slotDate.getTime())) return;
            const key = toLocalDateKey(slotDate);
            if (key < pastLimitKey || key > upcomingLimitKey) return;

            if (!outreachByDate[key]) {
                outreachByDate[key] = { totalReached: 0, sessionNames: new Set<string>() };
            }
            outreachByDate[key].totalReached += 1;
            const sName = sessionNameMap.get(slot.sessionId) || 'Outreach Session';
            outreachByDate[key].sessionNames.add(sName);
        });

        // ── 5. Merge all dates from plans + batches + events + outreach ─────────
        const allDateKeys = Array.from(new Set<string>([
            ...Object.keys(plansByDate),
            ...Object.keys(batchesByDate),
            ...Object.keys(eventsByDate),
            ...Object.keys(outreachByDate),
            todayKey,
        ])).sort().reverse();

        return allDateKeys.map(key => {
            const d = new Date(key + 'T12:00:00');
            const services = plansByDate[key] || [];
            const batches = batchesByDate[key] || [];
            const events = eventsByDate[key] || [];
            const isUpcoming = key > todayKey;
            const isToday = key === todayKey;

            let relativeLabel: string | null = null;
            if (isToday) {
                relativeLabel = 'TODAY';
            } else {
                const todayObj = new Date(todayKey + 'T12:00:00');
                const diffDays = Math.round((d.getTime() - todayObj.getTime()) / (1000 * 60 * 60 * 24));
                if (diffDays === 1) relativeLabel = 'Tomorrow';
                else if (diffDays > 1 && diffDays <= 7) relativeLabel = `In ${diffDays} days (${d.toLocaleDateString(undefined, { weekday: 'short' })})`;
            }

            const outreachInfo = outreachByDate[key];
            const outreachSummary: OutreachSummary | null = outreachInfo
                ? { totalReached: outreachInfo.totalReached, sessionNames: Array.from(outreachInfo.sessionNames) }
                : null;

            return {
                dateKey: key,
                dayOfWeek: d.toLocaleDateString(undefined, { weekday: 'short' }).toUpperCase(),
                dayNum: String(d.getDate()),
                monthAbbr: d.toLocaleDateString(undefined, { month: 'short' }).toUpperCase(),
                services,
                events,
                totalHeadcount: headcountByDate[key] || 0,
                batches,
                outreachSummary,
                isGivingOnly: services.length === 0 && events.length === 0 && !outreachSummary,
                isToday,
                isUpcoming,
                relativeLabel,
            };
        });
    }, [servicesData, visibleDonations, allEvents, rollupToSundays, outreachSessions, outreachSlots, attendanceData]);

    const isEmpty = days.length === 0 || days.every(d => d.services.length === 0 && d.events.length === 0 && d.batches.length === 0 && !d.outreachSummary);

    return (
        <div className="bg-white dark:bg-slate-800 p-6 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm h-full flex flex-col group relative overflow-hidden">
            {/* Remove — only when hosted in the legacy widget grid */}
            {onRemove && (
                <button
                    onClick={onRemove}
                    className="absolute top-5 right-5 text-slate-300 dark:text-slate-600 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100 z-10"
                    aria-label="Remove widget"
                >
                    ✕
                </button>
            )}

            {/* Glow */}
            <div className="absolute -right-12 -top-12 w-48 h-48 bg-indigo-50/40 dark:bg-indigo-900/10 rounded-full blur-3xl pointer-events-none" />

            {/* Header */}
            <div className="relative z-10 flex flex-wrap items-center justify-between gap-2 mb-5">
                <div>
                    <h4 className="text-[11px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-[0.14em]">
                        Church Timeline
                    </h4>
                    <p className="text-[11px] font-bold text-indigo-500 dark:text-indigo-400 uppercase tracking-wide mt-0.5">
                        Next 7 Days &amp; Past Activity · Services, Events &amp; Giving
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setRollupToSundays(prev => !prev)}
                        className={`px-2.5 py-1 text-[10px] font-bold rounded-lg transition-all border ${
                            rollupToSundays
                                ? 'bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
                                : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-700'
                        }`}
                        title="Toggle between Sunday weekly rollups and exact donation dates"
                    >
                        {rollupToSundays ? '📅 Sunday Giving Rollup' : '📅 Exact Donation Dates'}
                    </button>
                    <span className="text-lg">🗓️</span>
                </div>
            </div>

            {isEmpty ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
                    <div className="text-4xl mb-3 grayscale opacity-20">📅</div>
                    <p className="text-xs font-bold text-slate-400 dark:text-slate-500">No Timeline Events</p>
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-1 max-w-[180px]">
                        Sync Planning Center services, registrations, and giving to populate this timeline.
                    </p>
                </div>
            ) : (
                <div className="relative z-10 flex-1 max-h-[600px] overflow-y-auto pr-1 space-y-4">
                    {/* Spine */}
                    <div className="absolute left-[22px] top-3 bottom-3 w-0.5 bg-gradient-to-b from-purple-400 via-indigo-400 to-slate-200 dark:from-purple-600 dark:via-indigo-600 dark:to-slate-800 rounded-full pointer-events-none" />

                    <div className="space-y-4">
                        {days.map((day) => {
                            const hasBatches = day.batches.length > 0;
                            const hasEvents = day.events.length > 0;
                            const hasServices = day.services.length > 0;
                            const hasOutreach = !!(day.outreachSummary && day.outreachSummary.totalReached > 0);

                            if (!hasBatches && !hasEvents && !hasServices && !hasOutreach && !day.isToday) return null;

                            const dotCls = day.isToday
                                ? 'bg-indigo-600 ring-4 ring-indigo-200 dark:ring-indigo-800 shadow shadow-indigo-400 z-20'
                                : day.isUpcoming
                                    ? 'bg-purple-500 ring-2 ring-purple-200 dark:ring-purple-900'
                                    : day.isGivingOnly
                                        ? 'bg-emerald-400 dark:bg-emerald-600'
                                        : day.outreachSummary
                                            ? 'bg-sky-400 dark:bg-sky-600'
                                            : 'bg-slate-300 dark:bg-slate-600';

                            return (
                                <React.Fragment key={day.dateKey}>
                                    {/* Today divider pin */}
                                    {day.isToday && (
                                        <div className="flex items-center gap-3 my-2 pl-2">
                                            <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 animate-pulse" />
                                            <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/60 px-2.5 py-1 rounded-full border border-indigo-200 dark:border-indigo-800">
                                                📍 TODAY — {day.monthAbbr} {day.dayNum}
                                            </span>
                                            <div className="h-px bg-indigo-200 dark:bg-indigo-800/60 flex-1" />
                                        </div>
                                    )}

                                    <div className="flex items-start gap-4">
                                        {/* Dot */}
                                        <div className="shrink-0">
                                            <div className={`w-[11px] h-[11px] rounded-full mt-2 border-2 border-white dark:border-slate-800 z-10 relative ${dotCls}`} />
                                        </div>

                                        {/* Date badge */}
                                        <div className={`shrink-0 w-10 flex flex-col items-center rounded-xl py-1 border ${
                                            day.isToday
                                                ? 'bg-indigo-600 border-indigo-600'
                                                : day.isUpcoming
                                                    ? 'bg-purple-50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-800/40'
                                                    : day.isGivingOnly
                                                        ? 'bg-emerald-50 dark:bg-emerald-900/20 border-emerald-200 dark:border-emerald-800/40'
                                                        : 'bg-indigo-50 dark:bg-indigo-900/20 border-indigo-100 dark:border-indigo-800/40'
                                        }`}>
                                            <span className={`text-[7px] font-black uppercase tracking-wide ${
                                                day.isToday ? 'text-indigo-200' : day.isUpcoming ? 'text-purple-600 dark:text-purple-400' : day.isGivingOnly ? 'text-emerald-500' : 'text-rose-500'
                                            }`}>
                                                {day.monthAbbr}
                                            </span>
                                            <span className={`text-base font-black leading-none ${day.isToday ? 'text-white' : 'text-slate-900 dark:text-white'}`}>
                                                {day.dayNum}
                                            </span>
                                            <span className={`text-[7px] font-bold uppercase ${day.isToday ? 'text-indigo-200' : 'text-slate-400 dark:text-slate-500'}`}>
                                                {day.dayOfWeek}
                                            </span>
                                        </div>

                                        {/* Card */}
                                        <div className={`flex-1 min-w-0 rounded-2xl border p-3 transition-all space-y-3 ${
                                            day.isToday
                                                ? 'bg-indigo-50/80 dark:bg-indigo-950/40 border-indigo-200 dark:border-indigo-800/80 shadow-xs'
                                                : day.isUpcoming
                                                    ? 'bg-purple-50/40 dark:bg-purple-950/20 border-purple-100 dark:border-purple-900/30'
                                                    : day.isGivingOnly
                                                        ? 'bg-emerald-50/60 dark:bg-emerald-900/10 border-emerald-100 dark:border-emerald-900/30'
                                                        : 'bg-slate-50 dark:bg-slate-900/50 border-slate-100 dark:border-slate-800 hover:border-indigo-200 dark:hover:border-indigo-800'
                                        }`}>
                                            {/* Relative timing badge */}
                                            {day.relativeLabel && !day.isToday && (
                                                <div className="flex items-center justify-between border-b border-purple-100 dark:border-purple-900/30 pb-1.5">
                                                    <span className="text-[9px] font-black uppercase tracking-wider text-purple-600 dark:text-purple-400 bg-purple-100 dark:bg-purple-900/40 px-2 py-0.5 rounded-md">
                                                        UPCOMING · {day.relativeLabel}
                                                    </span>
                                                </div>
                                            )}

                                            {/* Registration / Calendar Events */}
                                            {hasEvents && (
                                                <div className="space-y-2">
                                                    {day.events.map(ev => (
                                                        <EventCard key={ev.id} event={ev} />
                                                    ))}
                                                </div>
                                            )}

                                            {/* Outreach Contact Card */}
                                            {hasOutreach && day.outreachSummary && (
                                                <div className="rounded-xl border border-sky-100 dark:border-sky-800/40 bg-sky-50/70 dark:bg-sky-900/10 p-3 space-y-1.5">
                                                    <div className="flex items-center justify-between gap-2">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <span className="text-xs">📞</span>
                                                            <span className="text-xs font-bold text-sky-900 dark:text-sky-300 truncate">
                                                                Outreach Contact
                                                            </span>
                                                        </div>
                                                        <span className="text-[10px] font-black text-sky-700 dark:text-sky-300 px-2 py-0.5 rounded-md bg-sky-100 dark:bg-sky-800/40 font-mono">
                                                            {day.outreachSummary.totalReached} {day.outreachSummary.totalReached === 1 ? 'person' : 'people'} reached
                                                        </span>
                                                    </div>
                                                    {day.outreachSummary.sessionNames.length > 0 && (
                                                        <div className="flex flex-wrap items-center gap-1.5 text-[10px]">
                                                            <span className="font-semibold text-slate-400 dark:text-slate-500 text-[9px] uppercase tracking-wider">Sessions:</span>
                                                            {day.outreachSummary.sessionNames.map(name => (
                                                                <span key={name} className="px-1.5 py-0.5 rounded bg-sky-100/70 dark:bg-sky-800/40 text-sky-800 dark:text-sky-300 font-semibold text-[9px]">
                                                                    {name}
                                                                </span>
                                                            ))}
                                                        </div>
                                                    )}
                                                </div>
                                            )}

                                            {/* Service rows */}
                                            {hasServices && (
                                                <div className="space-y-1.5">
                                                    {day.services.map(svc => (
                                                        <div key={svc.id} className="flex items-center justify-between gap-2 bg-white/60 dark:bg-slate-800/60 p-2 rounded-xl border border-slate-100 dark:border-slate-700/60">
                                                            <div className="flex items-center gap-2 min-w-0">
                                                                <span className="text-xs">⛪</span>
                                                                <span className="text-xs font-bold text-slate-800 dark:text-slate-200 truncate">
                                                                    {svc.name}
                                                                </span>
                                                            </div>
                                                            <div className="flex items-center gap-2 font-mono text-[10px]">
                                                                {svc.time && (
                                                                    <span className="text-slate-400 font-medium whitespace-nowrap">
                                                                        {svc.time}
                                                                    </span>
                                                                )}
                                                                {svc.attendance !== undefined && svc.attendance > 0 && (
                                                                    <span className="px-1.5 py-0.5 rounded bg-violet-50 dark:bg-violet-900/30 text-violet-700 dark:text-violet-300 font-bold whitespace-nowrap">
                                                                        👥 {svc.attendance.toLocaleString()}
                                                                    </span>
                                                                )}
                                                                {svc.volunteersScheduled > 0 && (
                                                                    <span className="px-1.5 py-0.5 rounded bg-amber-50 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300 font-black whitespace-nowrap">
                                                                        🙋 {svc.volunteersScheduled}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    ))}
                                                </div>
                                            )}

                                            {/* Past Headcount + volunteer stat pills */}
                                            {!day.isUpcoming && hasServices && (
                                                <div className="flex flex-wrap items-center gap-1.5">
                                                    {day.totalHeadcount > 0 ? (
                                                        <span className="inline-flex items-center gap-1 bg-violet-50 dark:bg-violet-900/20 border border-violet-100 dark:border-violet-800/30 px-2 py-0.5 rounded-lg text-[11px]">
                                                            <span>👥</span>
                                                            <span className="font-black text-violet-700 dark:text-violet-400">{day.totalHeadcount.toLocaleString()}</span>
                                                            <span className="text-violet-400 dark:text-violet-500 font-medium">total attended</span>
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 px-2 py-0.5 rounded-lg text-[11px] text-slate-400">
                                                            <span>👥</span>
                                                            <span>No headcount</span>
                                                        </span>
                                                    )}
                                                </div>
                                            )}

                                            {/* Giving batches — one card per batch */}
                                            {hasBatches && (
                                                <div className="space-y-1.5">
                                                    {day.batches.map(batch => (
                                                        <BatchCard
                                                            key={batch.batchKey}
                                                            batch={batch}
                                                            isServiceDay={hasServices}
                                                        />
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </React.Fragment>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Legend */}
            {!isEmpty && (
                <div className="relative z-10 mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/50 flex flex-wrap gap-3 text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-purple-500" /> 🎟️ Events</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-indigo-500" /> ⛪ Services</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-400" /> 💰 Giving</span>
                    <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-sky-400" /> 📞 Outreach</span>
                    <span className="ml-auto text-indigo-400">Planning Center Registrations + Services</span>
                </div>
            )}
        </div>
    );
};

export default ServicesTimelineWidget;
