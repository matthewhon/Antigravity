import { PcoPerson, DetailedDonation, PcoGroup, ServicesDashboardData, PcoCheckInRecord, CohortData, CohortRetentionPoint } from '../types';

export interface CohortFilterConfig {
    includeCheckIns: boolean;
    includeGiving: boolean;
    includeGroups: boolean;
    includeServing: boolean;
    selectedGroupId?: string | null;
    membershipStatus?: string | null;
    cohortBasis?: 'created_at' | 'first_check_in' | 'group_joined_at';
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
 * Groups people by their PCO profile creation month (or first check-in / group join date),
 * aggregates activity dates across various signals, and tracks retention percentages from Month 0 to Month 12.
 */
export function calculateCohorts(
    people: PcoPerson[],
    donations: DetailedDonation[],
    groups: PcoGroup[],
    servicesData: ServicesDashboardData | null,
    checkIns: PcoCheckInRecord[],
    config: CohortFilterConfig
): CohortData[] {
    // 1. Identify target people subset based on group & membership status filters
    let targetPeople = people;

    // Filter by group if selected
    let selectedGroup: PcoGroup | undefined;
    const groupMemberJoinDates = new Map<string, string>(); // personId -> YYYY-MM

    if (config.selectedGroupId && groups) {
        selectedGroup = groups.find(g => g.id === config.selectedGroupId);
        if (selectedGroup) {
            const memberIds = new Set<string>();
            if (selectedGroup.memberIds && selectedGroup.memberIds.length > 0) {
                selectedGroup.memberIds.forEach(id => memberIds.add(id));
            }
            if (selectedGroup.leaderIds && selectedGroup.leaderIds.length > 0) {
                selectedGroup.leaderIds.forEach(id => memberIds.add(id));
            }
            if (selectedGroup.memberJoins && selectedGroup.memberJoins.length > 0) {
                selectedGroup.memberJoins.forEach(mj => {
                    memberIds.add(mj.id);
                    if (mj.joinedAt) {
                        groupMemberJoinDates.set(mj.id, mj.joinedAt.substring(0, 7));
                    }
                });
            }
            targetPeople = targetPeople.filter(p => memberIds.has(p.id));
        }
    }

    // Filter by membership status if selected (and not 'all')
    if (config.membershipStatus && config.membershipStatus !== 'all') {
        const targetStatus = config.membershipStatus.toLowerCase();
        targetPeople = targetPeople.filter(p => {
            const mem = (p.membership || 'visitor').toLowerCase();
            if (targetStatus === 'visitor' || targetStatus === 'visitors') {
                return mem.includes('visitor') || mem.includes('guest') || mem.includes('newcomer');
            }
            if (targetStatus === 'member' || targetStatus === 'members') {
                return mem.includes('member');
            }
            if (targetStatus === 'regular attender' || targetStatus === 'attender') {
                return mem.includes('regular') || mem.includes('attender');
            }
            return mem === targetStatus;
        });
    }

    // Build map of earliest check-in month if cohortBasis is 'first_check_in'
    const personFirstCheckInMap = new Map<string, string>();
    if (config.cohortBasis === 'first_check_in' && checkIns) {
        checkIns.forEach(ci => {
            if (ci.personId && ci.createdAt) {
                const checkInMonth = ci.createdAt.substring(0, 7);
                const existing = personFirstCheckInMap.get(ci.personId);
                if (!existing || checkInMonth < existing) {
                    personFirstCheckInMap.set(ci.personId, checkInMonth);
                }
            }
        });
    }

    // 2. Group people into cohort buckets (YYYY-MM)
    const cohortMembersMap = new Map<string, string[]>(); // YYYY-MM -> personIds[]
    const personCohortMap = new Map<string, string>(); // personId -> YYYY-MM

    targetPeople.forEach(person => {
        let cohortMonth: string | undefined;

        if (config.cohortBasis === 'group_joined_at' && groupMemberJoinDates.has(person.id)) {
            cohortMonth = groupMemberJoinDates.get(person.id);
        } else if (config.cohortBasis === 'first_check_in') {
            cohortMonth = personFirstCheckInMap.get(person.id) || (person.createdAt ? person.createdAt.substring(0, 7) : undefined);
        } else {
            cohortMonth = person.createdAt ? person.createdAt.substring(0, 7) : undefined;
        }

        if (!cohortMonth || !cohortMonth.match(/^\d{4}-\d{2}$/)) return;
        
        const list = cohortMembersMap.get(cohortMonth) || [];
        list.push(person.id);
        cohortMembersMap.set(cohortMonth, list);
        personCohortMap.set(person.id, cohortMonth);
    });

    // 3. Aggregate activity months for each person based on active filters
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

    // 4. Compile cohort data list
    const cohortList: CohortData[] = [];
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

                // Month 0 counts if they had any activity, or default active at Month 0
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
