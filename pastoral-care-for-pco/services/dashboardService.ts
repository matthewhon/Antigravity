/**
 * dashboardService.ts
 *
 * Builds the whole dashboard overview in one pass.
 *
 * The role gate is applied HERE, at computation time, rather than in the view.
 * A figure the user may not see is never put into the returned object, so a
 * section can't accidentally render it and the shape of the result is itself
 * the answer to "what does this user get to see".
 *
 * Note this still runs client-side, which means the *source* collections have
 * already reached the browser. Moving this behind an endpoint is what turns the
 * gate into a real access control rather than a presentation rule — see the
 * implementation plan. Until then it closes the widget-picker leak but is not
 * a security boundary.
 */

import {
    Church, User, PcoPerson, PcoGroup, DetailedDonation, AttendanceRecord,
    PeopleDashboardData, GivingAnalytics, GroupsDashboardData, ServicesDashboardData,
    RiskChangeRecord, EmailCampaign, EmailUnsubscribe, SmsConversation, SmsUsageRecord,
    OutreachSession, OutreachSlot, GroupCareSession, GroupCareSlot,
    NeedsAttentionSettings, DEFAULT_NEEDS_ATTENTION_SETTINGS,
    ServicePlanSnapshot,
} from '../types';
import { canReadArea, isAdmin, ModuleAccessOptions } from './permissionService';
import { calculateOutreachAnalytics, calculateGroupCareAnalytics } from './outreachAnalytics';

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const WEEK = 7 * DAY;

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
const rate = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

/** Normalises the mixed date formats across collections to a comparable YYYY-MM-DD. */
const dayKey = (value: string | number | undefined | null): string => {
    if (!value) return '';
    if (typeof value === 'number') return toDateStr(new Date(value));
    return value.includes('T') ? value.slice(0, 10) : value.slice(0, 10);
};

// ─── Result shape ─────────────────────────────────────────────────────────────

export type Severity = 'ok' | 'warn' | 'critical';

export interface AttentionRow {
    id: string;
    label: string;
    count: number;
    severity: Severity;
    /** Route to open when the row is clicked. */
    href: string;
}

export interface DeltaRow {
    id: string;
    label: string;
    current: number;
    previous: number;
    isCurrency?: boolean;
}

export interface PulseStat {
    id: string;
    label: string;
    value: number;
    isCurrency?: boolean;
    /** Weekly points for the tile's sparkline, when the measure has a history. */
    series?: { weekStart: string; value: number }[];
    /** Previous-period value for the delta chip, when comparable. */
    previous?: number;
    /** False where a rise is the bad direction. */
    higherIsBetter?: boolean;
}

export interface TrendSeries {
    id: string;
    label: string;
    /** Oldest → newest, one point per week. */
    points: { weekStart: string; value: number; count?: number }[];
    isCurrency?: boolean;
}

export interface DashboardOverview {
    generatedAt: number;
    freshness: {
        lastSyncAt: number | null;
        ageMs: number | null;
        /** True past 24h without a completed sync — the quiet-failure tell. */
        isStale: boolean;
    };
    /**
     * Headline stats as tiles. A stat the user may not see is absent from the
     * array rather than null, so the shape itself answers "what do they get".
     */
    pulse: PulseStat[];
    /**
     * Part-to-whole engagement split. These classes mean good/bad, so they wear
     * status colours rather than categorical ones.
     */
    engagement: { label: string; count: number; tone: 'good' | 'warning' | 'critical' }[];
    needsAttention: AttentionRow[];
    thisWeek: DeltaRow[];
    trends: TrendSeries[];
    areas: {
        people?: { total: number; newThisMonth: number; atRisk: number; unconnected: number; avgAge: number | null };
        giving?: { mtd: number; ytd: number; activeDonors: number; lapsedDonors: number };
        groups?: { activeGroups: number; peopleInGroups: number; connectionRate: number; avgAttendance: number; avgLeaderAge: number | null; avgMemberAge: number | null };
        services?: { lastSunday: number; volunteers: number; fillRate: number; nextServiceDate: string | null; avgServingAge: number | null };
        comms?: {
            smsTotal: number; smsSent: number; smsReceived: number;
            activeThreads: number; needsReply: number;
            emailRecipients: number | null; emailCampaignsSent: number | null; emailUnsubscribes: number | null;
            outreachContactRate: number | null; outreachContacted: number | null;
            groupCareCoverage: number | null; groupCareContacted: number | null;
        };
        care?: { openFollowUps: number; prayerRequests: number; touchesThisMonth: number };
    };
    tenantHealth?: {
        lastSyncAt: number | null;
        smsSegmentsThisMonth: number;
        smsSpendThisMonth: number;
        activePeopleCount: number | null;
        planId: string | null;
        subscriptionStatus: string | null;
    };
}

// ─── Inputs ───────────────────────────────────────────────────────────────────

export interface DashboardInputs {
    user: User;
    church: Church;
    access?: ModuleAccessOptions;

    // Already loaded for the existing views
    peopleData: PeopleDashboardData | null;
    givingAnalytics: GivingAnalytics | null;
    groupsData: GroupsDashboardData | null;
    servicesData: ServicesDashboardData | null;
    attendance: AttendanceRecord[];
    donations: DetailedDonation[];
    people: PcoPerson[];
    groups: PcoGroup[];
    recentRiskChanges: RiskChangeRecord[];

    // Communications
    smsConversations?: SmsConversation[];
    smsUsage?: SmsUsageRecord[];
    emailCampaigns?: EmailCampaign[];
    emailUnsubscribes?: EmailUnsubscribe[];
    outreachSessions?: OutreachSession[];
    outreachSlots?: OutreachSlot[];
    groupCareSessions?: GroupCareSession[];
    groupCareSlots?: GroupCareSlot[];

    /** Pastoral care counts, if the caller has them. */
    care?: { openFollowUps: number; prayerRequests: number; touchesThisMonth: number };
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

const severityFor = (count: number, s: NeedsAttentionSettings): Severity => {
    if (count >= s.severity.critical) return 'critical';
    if (count >= s.severity.warn) return 'warn';
    return 'ok';
};

/** Sum of attendance on the most recent past Sunday that has a record. */
const lastSundayAttendance = (attendance: AttendanceRecord[], now: Date): number | null => {
    const cursor = new Date(now);
    cursor.setDate(cursor.getDate() - cursor.getDay()); // back to this week's Sunday
    for (let i = 0; i < 8; i++) {
        const key = toDateStr(cursor);
        const onDay = attendance.filter(a => dayKey(a.date) === key);
        if (onDay.length > 0) return onDay.reduce((sum, a) => sum + (a.count || 0), 0);
        cursor.setDate(cursor.getDate() - 7);
    }
    return null;
};

/** Monday of the week containing `d`, as YYYY-MM-DD. */
const weekStartKey = (d: Date): string => {
    const monday = new Date(d);
    monday.setDate(d.getDate() - ((d.getDay() + 6) % 7));
    return toDateStr(monday);
};

/** Buckets values into the last `weeks` calendar weeks, oldest → newest. */
const weeklySeries = (
    entries: { date: string | number; value: number; count?: number }[],
    weeks: number,
    now: Date
): { weekStart: string; value: number; count: number }[] => {
    const buckets = new Map<string, { value: number; count: number }>();
    const keys: string[] = [];
    for (let i = weeks - 1; i >= 0; i--) {
        const d = new Date(now.getTime() - i * WEEK);
        const k = weekStartKey(d);
        if (!buckets.has(k)) { buckets.set(k, { value: 0, count: 0 }); keys.push(k); }
    }
    const earliest = keys[0];
    entries.forEach(e => {
        const key = dayKey(e.date);
        if (!key || key < earliest) return;
        const wk = weekStartKey(new Date(`${key}T12:00:00`));
        if (buckets.has(wk)) {
            const b = buckets.get(wk)!;
            b.value += e.value;
            b.count += (e.count ?? 1);
        }
    });
    return keys.map(k => {
        const b = buckets.get(k) || { value: 0, count: 0 };
        return { weekStart: k, value: b.value, count: b.count };
    });
};

// ─── Main ─────────────────────────────────────────────────────────────────────

export const calculateDashboardOverview = (inputs: DashboardInputs): DashboardOverview => {
    const {
        user, church, access = {},
        peopleData, givingAnalytics, groupsData, servicesData,
        attendance, donations, people, groups, recentRiskChanges,
        smsConversations = [], smsUsage = [], emailCampaigns = [], emailUnsubscribes = [],
        outreachSessions = [], outreachSlots = [], groupCareSessions = [], groupCareSlots = [],
        care,
    } = inputs;

    const settings: NeedsAttentionSettings = church.needsAttentionSettings || DEFAULT_NEEDS_ATTENTION_SETTINGS;
    const now = new Date();
    const nowMs = now.getTime();

    const can = (area: Parameters<typeof canReadArea>[1]) => canReadArea(user, area, access);
    const canPeople = can('people');
    const canGiving = can('giving');
    const canGroups = can('groups');
    const canServices = can('services');
    const canMessaging = can('messaging');
    const canEmail = can('email');
    const canOutreach = can('outreach');
    const canCare = can('care');
    const admin = isAdmin(user);

    // ── Freshness ────────────────────────────────────────────────────────────
    const lastSyncAt = church.lastSyncTimestamp ?? null;
    const ageMs = lastSyncAt ? nowMs - lastSyncAt : null;

    // ── Pulse ────────────────────────────────────────────────────────────────
    const monthStartKey = toDateStr(new Date(now.getFullYear(), now.getMonth(), 1));
    const yearStartKey = toDateStr(new Date(now.getFullYear(), 0, 1));

    const givingMtd = donations
        .filter(d => dayKey(d.date) >= monthStartKey)
        .reduce((sum, d) => sum + (d.amount || 0), 0);
    const givingYtd = donations
        .filter(d => dayKey(d.date) >= yearStartKey)
        .reduce((sum, d) => sum + (d.amount || 0), 0);

    const activeGroupCount = groups.filter(g => !g.archivedAt).length;

    const WEEKS = 12;
    const attendanceSeries = weeklySeries(
        attendance.map(a => ({ date: a.date, value: a.count || 0 })), WEEKS, now);
    const givingSeries = weeklySeries(
        donations.map(d => ({ date: d.date, value: d.amount || 0, count: 1 })), WEEKS, now);
    const newPeopleSeries = weeklySeries(
        people.map(p => ({ date: p.createdAt, value: 1 })), WEEKS, now);
    const groupAttendanceSeries = weeklySeries(
        groups.flatMap(g => (g.attendanceHistory || []).map(h => ({ date: h.date, value: h.count || 0 }))),
        WEEKS, now);

    /** Second-to-last weekly point — the comparison for a tile's delta chip. */
    const priorWeek = (series: { value: number }[]) =>
        series.length >= 2 ? series[series.length - 2].value : undefined;

    const lastSunday = lastSundayAttendance(attendance, now);

    const pulse: PulseStat[] = [];

    // Church-wide vitals are open tier — no module role required.
    if (church.activePeopleCount !== undefined && church.activePeopleCount !== null) {
        pulse.push({ id: 'active', label: 'Active people · 60d', value: church.activePeopleCount });
    }
    if (lastSunday !== null) {
        pulse.push({
            id: 'attendance', label: 'Last Sunday', value: lastSunday,
            series: attendanceSeries, previous: priorWeek(attendanceSeries),
        });
    }
    // Money is gated.
    if (canGiving) {
        pulse.push({
            id: 'giving', label: 'Giving this month', value: givingMtd, isCurrency: true,
            series: givingSeries, previous: priorWeek(givingSeries),
        });
    }
    pulse.push({ id: 'groups', label: 'Active groups', value: activeGroupCount });
    if (servicesData?.stats.uniqueVolunteers !== undefined) {
        pulse.push({ id: 'volunteers', label: 'Volunteers serving', value: servicesData.stats.uniqueVolunteers });
    }

    // ── Engagement split ─────────────────────────────────────────────────────
    // Healthy / At Risk / Disconnected mean good-to-bad, so these are status
    // classes, not categorical series. Gated with People.
    const engagement: DashboardOverview['engagement'] = [];
    if (canPeople) {
        const counts = { Healthy: 0, 'At Risk': 0, Disconnected: 0 } as Record<string, number>;
        people.forEach(p => {
            const cat = p.historicRiskCategory;
            if (cat && counts[cat] !== undefined) counts[cat]++;
        });
        if (counts.Healthy + counts['At Risk'] + counts.Disconnected > 0) {
            engagement.push({ label: 'Healthy', count: counts.Healthy, tone: 'good' });
            engagement.push({ label: 'At risk', count: counts['At Risk'], tone: 'warning' });
            engagement.push({ label: 'Disconnected', count: counts.Disconnected, tone: 'critical' });
        }
    }

    // ── Needs Attention ──────────────────────────────────────────────────────
    const needsAttention: AttentionRow[] = [];
    const push = (id: string, label: string, count: number, href: string) => {
        if (count > 0) needsAttention.push({ id, label, count, severity: severityFor(count, settings), href });
    };

    if (settings.enabled.riskChanges && canPeople) {
        const since = nowMs - settings.riskChangeWindowDays * DAY;
        // Count distinct PEOPLE, not rows. risk_changes holds one row per detected
        // transition, and concurrent sync runs write near-duplicate rows for the
        // same person — 157 rows covering 83 people on one production tenant.
        const moved = new Set(
            recentRiskChanges
                .filter(c => (c.timestamp || 0) >= since && c.newCategory === 'At Risk' && c.oldCategory !== 'At Risk')
                .map(c => c.personId)
        ).size;
        push('risk_changes', `People moved to At Risk in the last ${settings.riskChangeWindowDays} days`, moved, '/people/risk');
    }

    if (settings.enabled.unansweredTexts && canMessaging) {
        const cutoff = nowMs - settings.unansweredTextHours * HOUR;
        const waiting = smsConversations.filter(
            c => c.lastMessageDirection === 'inbound' && (c.lastMessageAt || 0) < cutoff && !c.isOptedOut
        ).length;
        push('unanswered_texts', `Texts unanswered for over ${settings.unansweredTextHours} hours`, waiting, '/tools/sms/inbox');
    }

    if (settings.enabled.openPositions && canServices) {
        push('open_positions', 'Open serving positions', servicesData?.stats.positionsOpen || 0, '/services/teams');
    }

    if (settings.enabled.groupAttendanceGap && canGroups) {
        const cutoffKey = toDateStr(new Date(nowMs - settings.groupAttendanceGapWeeks * WEEK));
        const stale = groups.filter(g => {
            if (g.archivedAt) return false;
            const history = g.attendanceHistory || [];
            if (history.length === 0) return true;
            const latest = history.reduce((max, h) => (dayKey(h.date) > max ? dayKey(h.date) : max), '');
            return latest < cutoffKey;
        }).length;
        push('group_gap', `Groups with no attendance logged in ${settings.groupAttendanceGapWeeks}+ weeks`, stale, '/groups');
    }

    if (settings.enabled.lapsedDonors && canGiving) {
        const lapsed = givingAnalytics?.donorLifecycle?.lapsed || 0;
        push('lapsed_donors', 'Donors who have lapsed', lapsed, '/giving/donor');
    }

    if (settings.enabled.pendingOutreach && canOutreach) {
        const cutoff = nowMs - settings.pendingOutreachHours * HOUR;
        // Distinct people again — one person can hold a stale slot in more than
        // one session, and that's still one person to chase.
        const stalePending = new Set(
            [...outreachSlots, ...groupCareSlots]
                .filter(s => s.status === 'pending' && (s.assignedAt || 0) < cutoff)
                .map(s => s.assignedPersonId)
        ).size;
        push('pending_outreach', `Outreach assignments pending over ${settings.pendingOutreachHours} hours`, stalePending, '/care/contact');
    }

    if (settings.enabled.neverContacted && canOutreach && canPeople) {
        const everContacted = new Set(
            [...outreachSlots, ...groupCareSlots]
                .filter(s => s.status === 'contacted')
                .map(s => s.assignedPersonId)
        );
        const atRiskNeverReached = people.filter(
            p => p.historicRiskCategory === 'At Risk' && !everContacted.has(p.id)
        ).length;
        push('never_contacted', 'At-risk people never reached by any session', atRiskNeverReached, '/care/contact');
    }

    needsAttention.sort((a, b) => {
        const order: Record<Severity, number> = { critical: 0, warn: 1, ok: 2 };
        return order[a.severity] - order[b.severity] || b.count - a.count;
    });

    // ── This week vs last ────────────────────────────────────────────────────
    const weekAgoKey = toDateStr(new Date(nowMs - WEEK));
    const twoWeeksAgoKey = toDateStr(new Date(nowMs - 2 * WEEK));
    const todayKey = toDateStr(now);

    const inWindow = (key: string, from: string, to: string) => key >= from && key <= to;

    const thisWeek: DeltaRow[] = [];

    if (canPeople) {
        const cur = people.filter(p => inWindow(dayKey(p.createdAt), weekAgoKey, todayKey)).length;
        const prev = people.filter(p => inWindow(dayKey(p.createdAt), twoWeeksAgoKey, weekAgoKey)).length;
        thisWeek.push({ id: 'new_people', label: 'New profiles', current: cur, previous: prev });
    }
    if (canGiving) {
        const sumIn = (from: string, to: string) => donations
            .filter(d => inWindow(dayKey(d.date), from, to))
            .reduce((s, d) => s + (d.amount || 0), 0);
        const donorsIn = (from: string, to: string) => new Set(
            donations.filter(d => inWindow(dayKey(d.date), from, to)).map(d => d.donorId)
        ).size;
        thisWeek.push({ id: 'giving', label: 'Total giving', current: sumIn(weekAgoKey, todayKey), previous: sumIn(twoWeeksAgoKey, weekAgoKey), isCurrency: true });
        thisWeek.push({ id: 'donors', label: 'Donors', current: donorsIn(weekAgoKey, todayKey), previous: donorsIn(twoWeeksAgoKey, weekAgoKey) });
    }
    {
        // Attendance is open tier.
        const sumAtt = (from: string, to: string) => attendance
            .filter(a => inWindow(dayKey(a.date), from, to))
            .reduce((s, a) => s + (a.count || 0), 0);
        thisWeek.push({ id: 'attendance', label: 'Headcount', current: sumAtt(weekAgoKey, todayKey), previous: sumAtt(twoWeeksAgoKey, weekAgoKey) });
    }
    if (canGroups) {
        const sumGroup = (from: string, to: string) => groups.reduce(
            (s, g) => s + (g.attendanceHistory || [])
                .filter(h => inWindow(dayKey(h.date), from, to))
                .reduce((t, h) => t + (h.count || 0), 0),
            0
        );
        thisWeek.push({ id: 'group_attendance', label: 'Group attendance', current: sumGroup(weekAgoKey, todayKey), previous: sumGroup(twoWeeksAgoKey, weekAgoKey) });
    }

    // ── Trends (12 weeks) ────────────────────────────────────────────────────
    // Series were computed above for the pulse tiles; reuse rather than rebuild.
    const trends: TrendSeries[] = [];
    trends.push({ id: 'attendance', label: 'Attendance', points: attendanceSeries });
    if (canGiving) {
        trends.push({ id: 'giving', label: 'Giving', isCurrency: true, points: givingSeries });
    }
    if (canPeople) {
        trends.push({ id: 'new_people', label: 'New people', points: newPeopleSeries });
    }
    if (canGroups) {
        trends.push({ id: 'group_attendance', label: 'Group attendance', points: groupAttendanceSeries });
    }

    // ── Area bands ───────────────────────────────────────────────────────────
    const areas: DashboardOverview['areas'] = {};

    const calcAge = (birthdate?: string | null): number | null => {
        if (!birthdate) return null;
        const bd = new Date(birthdate);
        if (isNaN(bd.getTime())) return null;
        let age = now.getFullYear() - bd.getFullYear();
        const m = now.getMonth() - bd.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < bd.getDate())) {
            age--;
        }
        return age >= 0 && age <= 125 ? age : null;
    };

    const calcAverageAge = (peopleList: (PcoPerson | undefined | null)[]): number | null => {
        const validAges = peopleList
            .map(p => calcAge(p?.birthdate))
            .filter((a): a is number => a !== null);
        if (validAges.length === 0) return null;
        const sum = validAges.reduce((s, a) => s + a, 0);
        return Math.round(sum / validAges.length);
    };

    const peopleMap = new Map(people.map(p => [p.id, p]));

    if (canPeople && peopleData) {
        const inAGroup = new Set(groups.flatMap(g => g.memberIds || []));
        const allChurchPeople = peopleData.allPeople?.length ? peopleData.allPeople : people;
        areas.people = {
            total: peopleData.stats.total,
            newThisMonth: peopleData.stats.newThisMonth,
            atRisk: people.filter(p => p.historicRiskCategory === 'At Risk').length,
            unconnected: people.filter(p => !inAGroup.has(p.id)).length,
            avgAge: calcAverageAge(allChurchPeople),
        };
    }

    if (canGiving) {
        areas.giving = {
            mtd: givingMtd,
            ytd: givingYtd,
            activeDonors: givingAnalytics?.donorLifecycle?.active || 0,
            lapsedDonors: givingAnalytics?.donorLifecycle?.lapsed || 0,
        };
    }

    if (canGroups && groupsData) {
        const inAGroup = new Set(groups.flatMap(g => g.memberIds || []));
        const leaderIdSet = new Set(groups.flatMap(g => g.leaderIds || []));
        const memberIdSet = new Set(groups.flatMap(g => g.memberIds || []));
        const leaderPeople = Array.from(leaderIdSet).map(id => peopleMap.get(id));
        const memberPeople = Array.from(memberIdSet).map(id => peopleMap.get(id));
        areas.groups = {
            activeGroups: activeGroupCount,
            peopleInGroups: inAGroup.size,
            connectionRate: rate(inAGroup.size, people.length),
            avgAttendance: Math.round(groupsData.stats.averageAttendance || 0),
            avgLeaderAge: calcAverageAge(leaderPeople),
            avgMemberAge: calcAverageAge(memberPeople),
        };
    }

    if (canServices && servicesData) {
        const upcoming = (servicesData.futurePlans || [])
            .map((p: ServicePlanSnapshot) => p.sortDate)
            .filter(Boolean)
            .sort();
        const volunteerIdSet = new Set<string>();
        (servicesData.teams || []).forEach(t => {
            (t.scheduledMemberIds || []).forEach(id => volunteerIdSet.add(id));
            (t.memberIds || []).forEach(id => volunteerIdSet.add(id));
        });
        (servicesData.futurePlans || []).forEach((p: any) => {
            (p.teamMembers || []).forEach((m: any) => {
                if (m.personId) volunteerIdSet.add(m.personId);
            });
        });
        const servingPeople = Array.from(volunteerIdSet).map(id => peopleMap.get(id));
        areas.services = {
            lastSunday: lastSunday ?? 0,
            volunteers: servicesData.stats.uniqueVolunteers,
            fillRate: Math.round(servicesData.stats.fillRate || 0),
            nextServiceDate: upcoming[0] || null,
            avgServingAge: calcAverageAge(servingPeople),
        };
    }

    if (canMessaging || canEmail || canOutreach) {
        const smsSince = nowMs - 30 * DAY;
        const recent = smsUsage.filter(u => (u.createdAt || 0) >= smsSince);
        // Inbound records set direction; outbound records omit it.
        const received = recent.filter(u => (u as any).direction === 'inbound').length;
        const sent = recent.length - received;

        const emailSince = nowMs - 30 * DAY;
        const sentCampaigns = emailCampaigns.filter(c => (c.sentAt || 0) >= emailSince);
        const outreach = calculateOutreachAnalytics(outreachSessions, outreachSlots);
        const groupCare = calculateGroupCareAnalytics(groupCareSessions, groupCareSlots);

        areas.comms = {
            smsTotal: canMessaging ? recent.length : 0,
            smsSent: canMessaging ? sent : 0,
            smsReceived: canMessaging ? received : 0,
            activeThreads: canMessaging
                ? smsConversations.filter(c => (c.lastMessageAt || 0) >= nowMs - 7 * DAY).length
                : 0,
            needsReply: canMessaging
                ? smsConversations.filter(c => (c.unreadCount || 0) > 0).length
                : 0,
            emailRecipients: canEmail
                ? sentCampaigns.reduce((s, c) => s + ((c as any).recipientCount || 0), 0)
                : null,
            emailCampaignsSent: canEmail ? sentCampaigns.length : null,
            emailUnsubscribes: canEmail
                ? emailUnsubscribes.filter(u => (u.unsubscribedAt || 0) >= emailSince).length
                : null,
            outreachContactRate: canOutreach ? outreach.contactRate : null,
            outreachContacted: canOutreach ? outreach.totalContacted : null,
            groupCareCoverage: canOutreach ? groupCare.contactRate : null,
            groupCareContacted: canOutreach ? groupCare.totalContacted : null,
        };
    }

    if (canCare && care) areas.care = care;

    // ── Tenant health ────────────────────────────────────────────────────────
    let tenantHealth: DashboardOverview['tenantHealth'];
    if (admin) {
        const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
        const thisMonthUsage = smsUsage.filter(u => (u.createdAt || 0) >= monthStart);
        tenantHealth = {
            lastSyncAt,
            smsSegmentsThisMonth: thisMonthUsage.reduce((s, u) => s + (u.isMms ? 2 : (u.segments || 1)), 0),
            smsSpendThisMonth: Number(thisMonthUsage.reduce((s, u) => s + (u.costUsd || 0), 0).toFixed(2)),
            activePeopleCount: church.activePeopleCount ?? null,
            planId: church.subscription?.planId ?? null,
            subscriptionStatus: church.subscription?.status ?? null,
        };
    }

    return {
        generatedAt: nowMs,
        freshness: { lastSyncAt, ageMs, isStale: ageMs === null || ageMs > DAY },
        pulse,
        engagement,
        needsAttention,
        thisWeek,
        trends,
        areas,
        tenantHealth,
    };
};
