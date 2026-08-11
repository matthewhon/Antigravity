/**
 * outreachAnalytics.ts
 *
 * Rolled-up metrics for Outreach and Group Care sessions.
 *
 * Both features store the same shape — a session holding an eligible-people
 * list, and one slot per (volunteer, assigned person) pair — so one set of
 * functions serves both. Extracted out of CareReportPage so the report and the
 * dashboard can't drift apart on what "contact rate" means.
 */

import { OutreachSession, OutreachSlot, GroupCareSession, GroupCareSlot } from '../types';

/** The fields both slot types share, so the maths can be written once. */
type AnySlot = {
    sessionId: string;
    status: 'pending' | 'contacted' | 'no-answer' | 'released';
    volunteerPhone: string;
    volunteerName?: string | null;
    assignedPersonId: string;
    assignedAt: number;
    completedAt?: number | null;
};

/** The session fields both types share. */
type AnySession = {
    id: string;
    name: string;
    isActive: boolean;
    closedAt?: number | null;
    eligiblePeople?: unknown[];
    stats?: { totalEligible: number };
};

export interface SessionMetrics {
    sessionId: string;
    name: string;
    isOpen: boolean;
    contacted: number;
    noAnswer: number;
    pending: number;
    released: number;
    totalEligible: number;
    /** contacted / totalEligible, 0–100. */
    contactRate: number;
    /** Distinct volunteers who worked at least one slot. */
    volunteerCount: number;
    /** Mean seconds between assignment and completion, or null if nothing completed. */
    avgHandleTimeSec: number | null;
}

export interface OutreachRollup {
    totalSessions: number;
    activeSessions: number;
    closedSessions: number;
    totalEligible: number;
    totalContacted: number;
    totalNoAnswer: number;
    totalPending: number;
    /** Overall contacted / eligible across every session, 0–100. */
    contactRate: number;
    /** Distinct volunteers across every session. */
    volunteerCount: number;
    avgHandleTimeSec: number | null;
    perSession: SessionMetrics[];
}

const rate = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0);

const meanHandleTime = (slots: AnySlot[]): number | null => {
    const times = slots
        .filter(s => s.completedAt && s.assignedAt && s.completedAt > s.assignedAt)
        .map(s => (s.completedAt! - s.assignedAt) / 1000);
    if (times.length === 0) return null;
    return Math.round(times.reduce((a, b) => a + b, 0) / times.length);
};

/**
 * Roll up sessions and their slots.
 *
 * `totalEligible` prefers the session's denormalised people list, falls back to
 * its persisted stats snapshot, and finally to the slot count — matching what
 * the Care report already does, so the two agree.
 */
export const rollUpSessions = (
    sessions: AnySession[],
    slots: AnySlot[]
): OutreachRollup => {
    const slotsBySession = new Map<string, AnySlot[]>();
    slots.forEach(s => {
        const list = slotsBySession.get(s.sessionId);
        if (list) list.push(s);
        else slotsBySession.set(s.sessionId, [s]);
    });

    const perSession: SessionMetrics[] = sessions.map(session => {
        const own = slotsBySession.get(session.id) || [];
        const contacted = own.filter(s => s.status === 'contacted').length;
        const noAnswer = own.filter(s => s.status === 'no-answer').length;
        const pending = own.filter(s => s.status === 'pending').length;
        const released = own.filter(s => s.status === 'released').length;
        const totalEligible =
            session.eligiblePeople?.length || session.stats?.totalEligible || own.length;

        return {
            sessionId: session.id,
            name: session.name,
            isOpen: session.isActive && !session.closedAt,
            contacted,
            noAnswer,
            pending,
            released,
            totalEligible,
            contactRate: rate(contacted, totalEligible),
            volunteerCount: new Set(own.map(s => s.volunteerPhone).filter(Boolean)).size,
            avgHandleTimeSec: meanHandleTime(own),
        };
    });

    const sum = (pick: (m: SessionMetrics) => number) =>
        perSession.reduce((acc, m) => acc + pick(m), 0);

    const totalEligible = sum(m => m.totalEligible);
    const totalContacted = sum(m => m.contacted);

    return {
        totalSessions: sessions.length,
        activeSessions: perSession.filter(m => m.isOpen).length,
        closedSessions: sessions.filter(s => !!s.closedAt).length,
        totalEligible,
        totalContacted,
        totalNoAnswer: sum(m => m.noAnswer),
        totalPending: sum(m => m.pending),
        contactRate: rate(totalContacted, totalEligible),
        volunteerCount: new Set(slots.map(s => s.volunteerPhone).filter(Boolean)).size,
        avgHandleTimeSec: meanHandleTime(slots),
        perSession,
    };
};

export const calculateOutreachAnalytics = (
    sessions: OutreachSession[],
    slots: OutreachSlot[]
): OutreachRollup => rollUpSessions(sessions, slots);

export interface GroupCareRollup extends OutreachRollup {
    /** Distinct leaders who have worked at least one slot. */
    activeLeaders: number;
    /** Distinct leaders listed across all session leader directories. */
    totalLeaders: number;
    /** Per-group coverage, worst-covered first. */
    perGroup: {
        groupId: string;
        groupName: string;
        contacted: number;
        totalAssigned: number;
        coverage: number;
    }[];
}

export const calculateGroupCareAnalytics = (
    sessions: GroupCareSession[],
    slots: GroupCareSlot[]
): GroupCareRollup => {
    const base = rollUpSessions(sessions, slots);

    const byGroup = new Map<string, { groupName: string; contacted: number; total: number }>();
    slots.forEach(s => {
        if (!s.groupId) return;
        const entry = byGroup.get(s.groupId) || { groupName: s.groupName || 'Unnamed group', contacted: 0, total: 0 };
        entry.total++;
        if (s.status === 'contacted') entry.contacted++;
        byGroup.set(s.groupId, entry);
    });

    const perGroup = Array.from(byGroup.entries())
        .map(([groupId, v]) => ({
            groupId,
            groupName: v.groupName,
            contacted: v.contacted,
            totalAssigned: v.total,
            coverage: rate(v.contacted, v.total),
        }))
        .sort((a, b) => a.coverage - b.coverage);

    const allLeaders = new Set<string>();
    sessions.forEach(s => (s.leaderDirectory || []).forEach(l => l.phone && allLeaders.add(l.phone)));

    return {
        ...base,
        activeLeaders: base.volunteerCount,
        totalLeaders: allLeaders.size,
        perGroup,
    };
};
