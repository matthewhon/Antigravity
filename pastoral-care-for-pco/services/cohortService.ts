import { PcoPerson, DetailedDonation, PcoGroup, ServicesDashboardData, PcoCheckInRecord, CohortData, CohortRetentionPoint } from '../types';

export interface CohortFilterConfig {
    includeCheckIns: boolean;
    includeGiving: boolean;
    includeGroups: boolean;
    includeServing: boolean;
}

/**
 * Calculates the number of months between two YYYY-MM strings.
 */
function getMonthDiff(startStr: string, activeStr: string): number {
    const [startY, startM] = startStr.split('-').map(Number);
    const [activeY, activeM] = activeStr.split('-').map(Number);
    return (activeY - startY) * 12 + (activeM - startM);
}

/**
 * Formats a YYYY-MM string to a human-readable label (e.g., "Jan 2026").
 */
function formatCohortLabel(yyyyMm: string): string {
    const [year, month] = yyyyMm.split('-');
    const date = new Date(Number(year), Number(month) - 1, 1);
    return date.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
}

/**
 * Computes cohort retention analytics.
 * Groups people by their PCO profile creation month, aggregates activity dates across 
 * various signals, and tracks retention percentages from Month 0 to Month 12.
 */
export function calculateCohorts(
    people: PcoPerson[],
    donations: DetailedDonation[],
    groups: PcoGroup[],
    servicesData: ServicesDashboardData | null,
    checkIns: PcoCheckInRecord[],
    config: CohortFilterConfig
): CohortData[] {
    // 1. Group people by profile creation month (e.g., "2026-01")
    const cohortMembersMap = new Map<string, string[]>(); // YYYY-MM -> personIds[]
    const personCohortMap = new Map<string, string>(); // personId -> YYYY-MM

    people.forEach(person => {
        if (!person.createdAt) return;
        const cohortMonth = person.createdAt.substring(0, 7); // "YYYY-MM"
        
        const list = cohortMembersMap.get(cohortMonth) || [];
        list.push(person.id);
        cohortMembersMap.set(cohortMonth, list);
        personCohortMap.set(person.id, cohortMonth);
    });

    // 2. Aggregate activity months for each person based on active filters
    const personActivityMonths = new Map<string, Set<string>>(); // personId -> Set of "YYYY-MM"

    const addActivity = (personId: string, dateStr: string) => {
        if (!dateStr || !personCohortMap.has(personId)) return;
        const activeMonth = dateStr.substring(0, 7); // "YYYY-MM"
        
        // Only track activities at or after the cohort start month
        const startMonth = personCohortMap.get(personId)!;
        if (activeMonth >= startMonth) {
            const months = personActivityMonths.get(personId) || new Set<string>();
            months.add(activeMonth);
            personActivityMonths.set(personId, months);
        }
    };

    // A. Check-ins activity
    if (config.includeCheckIns && checkIns) {
        checkIns.forEach(ci => {
            if (ci.personId && ci.createdAt) {
                addActivity(ci.personId, ci.createdAt);
            }
        });
    }

    // B. Giving activity
    if (config.includeGiving && donations) {
        donations.forEach(d => {
            if (d.donorId && d.date) {
                addActivity(d.donorId, d.date);
            }
        });
    }

    // C. Groups activity (from group attendance history)
    if (config.includeGroups && groups) {
        groups.forEach(g => {
            if (g.attendanceHistory) {
                g.attendanceHistory.forEach(hist => {
                    if (hist.date && hist.attendeeIds) {
                        hist.attendeeIds.forEach(pid => {
                            addActivity(pid, hist.date);
                        });
                    }
                });
            }
        });
    }

    // D. Serving activity (from confirmed positions on service plans)
    if (config.includeServing && servicesData && servicesData.plans) {
        servicesData.plans.forEach(plan => {
            if (plan.sortDate && plan.teamMembers) {
                plan.teamMembers.forEach(member => {
                    const status = member.status?.toLowerCase() || '';
                    if (member.personId && (status === 'confirmed' || status === 'c')) {
                        addActivity(member.personId, plan.sortDate);
                    }
                });
            }
        });
    }

    // 3. Compile cohort data list
    const cohortList: CohortData[] = [];

    // Sort cohorts chronologically (newest first for display, or oldest first? Let's do chronological oldest-first or newest-first. Heatmaps typically show chronological oldest-first so they read top-to-bottom, or newest at the top. Let's sort oldest-first.)
    const sortedCohortMonths = Array.from(cohortMembersMap.keys()).sort();

    sortedCohortMonths.forEach(cohortMonth => {
        const memberIds = cohortMembersMap.get(cohortMonth) || [];
        const cohortSize = memberIds.length;
        if (cohortSize === 0) return;

        // We track retention up to 12 months (Month 0 to Month 12)
        const maxMonths = 12;
        const retentionPoints: CohortRetentionPoint[] = [];

        for (let m = 0; m <= maxMonths; m++) {
            let activeCount = 0;

            memberIds.forEach(personId => {
                const activities = personActivityMonths.get(personId);
                if (!activities) return;

                // Month 0 always counts if they had any activity, or we assume they are active at Month 0
                if (m === 0) {
                    activeCount++;
                    return;
                }

                // Check if they were active in the specific target calendar month
                // Target month is startMonth + m months
                const [startYear, startMonthVal] = cohortMonth.split('-').map(Number);
                const targetDate = new Date(startYear, startMonthVal - 1 + m, 1);
                const targetMonthStr = `${targetDate.getFullYear()}-${String(targetDate.getMonth() + 1).padStart(2, '0')}`;

                if (activities.has(targetMonthStr)) {
                    activeCount++;
                }
            });

            // Calculate percentage
            const percentage = cohortSize > 0 ? Math.round((activeCount / cohortSize) * 100) : 0;

            retentionPoints.push({
                monthIndex: m,
                activeCount,
                percentage,
                monthLabel: `Month ${m}`
            });
        }

        cohortList.push({
            cohortName: formatCohortLabel(cohortMonth),
            startDate: cohortMonth,
            cohortSize,
            retention: retentionPoints,
            peopleIds: memberIds
        });
    });

    return cohortList;
}
