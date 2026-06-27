/**
 * activePeopleService.ts
 *
 * Computes the number of "active people" for a given church — defined as unique
 * individuals who performed at least one of the following in the last 60 days:
 *   1. Gave (DetailedDonation)
 *   2. Served (ServicePlanSnapshot teamMembers, non-declined)
 *   3. Checked in (PcoCheckInRecord)
 *   4. Attended a group (PcoGroup.attendanceHistory)
 *
 * All computation happens client-side using data already in Firestore, so no
 * backend deploy is required.
 */

import {
    collection,
    query,
    where,
    getDocs,
} from 'firebase/firestore';
import { db } from './firebase';
import { DetailedDonation, ServicePlanSnapshot, PcoCheckInRecord, PcoGroup } from '../types';

/** Number of days to look back when determining if a person is "active". */
export const ACTIVE_WINDOW_DAYS = 60;

/**
 * Returns a YYYY-MM-DD string for the cutoff date (today minus ACTIVE_WINDOW_DAYS).
 */
function getCutoffDate(): string {
    const d = new Date();
    d.setDate(d.getDate() - ACTIVE_WINDOW_DAYS);
    return d.toISOString().slice(0, 10); // YYYY-MM-DD
}

/**
 * Computes the number of unique active people for the given church.
 * Fetches data from Firestore in parallel across all four activity signals.
 *
 * @param churchId  The church tenant ID.
 * @returns The count of unique person IDs active in the last ACTIVE_WINDOW_DAYS days.
 */
export async function computeActivePeopleCount(churchId: string): Promise<number> {
    const cutoff = getCutoffDate();
    const activeIds = new Set<string>();

    // Run all four queries in parallel for performance
    const [donations, plans, checkIns, groups] = await Promise.all([
        fetchDonations(churchId),
        fetchServicePlans(churchId),
        fetchCheckIns(churchId),
        fetchGroups(churchId),
    ]);

    // 1. Givers — people who donated on or after the cutoff
    for (const d of donations) {
        if (d.date >= cutoff && d.donorId) {
            activeIds.add(d.donorId);
        }
    }

    // 2. Servers — people scheduled on a service plan on or after the cutoff
    //    Exclude status 'D' (Declined in PCO scheduling API)
    for (const plan of plans) {
        if (!plan.sortDate || plan.sortDate < cutoff) continue;
        for (const member of plan.teamMembers ?? []) {
            if (member.personId && member.status !== 'D') {
                activeIds.add(member.personId);
            }
        }
    }

    // 3. Check-ins — people who checked in on or after the cutoff
    //    PcoCheckInRecord.createdAt is stored as YYYY-MM-DD
    for (const ci of checkIns) {
        if (ci.createdAt >= cutoff && ci.personId) {
            activeIds.add(ci.personId);
        }
    }

    // 4. Group attendees — people who attended a group event on or after the cutoff
    //    attendanceHistory is embedded in each PcoGroup document
    for (const group of groups) {
        for (const event of group.attendanceHistory ?? []) {
            const eventDate = event.date?.slice(0, 10); // normalise to YYYY-MM-DD
            if (eventDate && eventDate >= cutoff) {
                for (const personId of event.attendeeIds ?? []) {
                    if (personId) activeIds.add(personId);
                }
            }
        }
    }

    return activeIds.size;
}

// ---------------------------------------------------------------------------
// Private fetchers
// ---------------------------------------------------------------------------

async function fetchDonations(churchId: string): Promise<DetailedDonation[]> {
    try {
        const snap = await getDocs(
            query(collection(db, 'detailed_donations'), where('churchId', '==', churchId))
        );
        return snap.docs.map(d => d.data() as DetailedDonation);
    } catch {
        return [];
    }
}

async function fetchServicePlans(churchId: string): Promise<ServicePlanSnapshot[]> {
    try {
        const snap = await getDocs(
            query(collection(db, 'service_plans'), where('churchId', '==', churchId))
        );
        return snap.docs.map(d => d.data() as ServicePlanSnapshot);
    } catch {
        return [];
    }
}

async function fetchCheckIns(churchId: string): Promise<PcoCheckInRecord[]> {
    try {
        const snap = await getDocs(
            query(collection(db, 'check_ins'), where('churchId', '==', churchId))
        );
        return snap.docs.map(d => d.data() as PcoCheckInRecord);
    } catch {
        return [];
    }
}

async function fetchGroups(churchId: string): Promise<PcoGroup[]> {
    try {
        const snap = await getDocs(
            query(collection(db, 'groups'), where('churchId', '==', churchId))
        );
        return snap.docs.map(d => d.data() as PcoGroup);
    } catch {
        return [];
    }
}
