import { useMemo } from 'react';
import { 
    PcoPerson, PcoGroup, DetailedDonation, ServicesTeam, RiskSettings, 
    RiskChangeRecord, StatusChangeRecord, ServicesDashboardData, AttendanceRecord,
    PeopleDashboardData, GroupsDashboardData, AttendanceData, GivingFilter, DonorLifecycleSettings
} from '../types';
import { calculateBulkRisk, DEFAULT_RISK_SETTINGS } from '../services/riskService';
import { calculateGivingAnalytics, DEFAULT_LIFECYCLE_SETTINGS, calculatePeopleDashboardData, calculateGroupsDashboardData } from '../services/analyticsService';

export function useRiskEnrichedPeople(
    people: PcoPerson[],
    groups: PcoGroup[],
    donations: DetailedDonation[],
    servicesData: ServicesDashboardData | null,
    teams: ServicesTeam[],
    riskSettings?: RiskSettings
) {
    return useMemo(() => {
        const personGroupsMap = new Map<string, string[]>();
        if (groups) {
            groups.forEach(g => {
                if (g.memberIds) {
                    g.memberIds.forEach(mid => {
                        const list = personGroupsMap.get(mid) || [];
                        list.push(g.id);
                        personGroupsMap.set(mid, list);
                    });
                }
            });
        }

        const peopleWithGroups = people.map(p => ({
            ...p,
            groupIds: personGroupsMap.get(p.id) || [] 
        }));

        if (!peopleWithGroups || peopleWithGroups.length === 0) return [];
        return calculateBulkRisk(
            peopleWithGroups, 
            donations, 
            groups, 
            servicesData?.recentPlans || [], 
            teams, 
            riskSettings || DEFAULT_RISK_SETTINGS
        );
    }, [people, donations, groups, servicesData, teams, riskSettings]);
}

export function usePeopleDashboardData(
    people: PcoPerson[],
    riskEnrichedPeople: PcoPerson[],
    recentRiskChanges: RiskChangeRecord[],
    recentStatusChanges: StatusChangeRecord[]
) {
    return useMemo<PeopleDashboardData>(() => {
        return calculatePeopleDashboardData(people, riskEnrichedPeople, recentRiskChanges, recentStatusChanges);
    }, [people, riskEnrichedPeople, recentRiskChanges, recentStatusChanges]);
}

export function useGivingAnalyticsData(
    donations: DetailedDonation[],
    givingFilter: GivingFilter,
    givingDateRange: {start: string, end: string},
    people: PcoPerson[],
    donorLifecycleSettings?: DonorLifecycleSettings
) {
    return useMemo(() => {
        return calculateGivingAnalytics(
            donations, 
            givingFilter, 
            givingDateRange.start && givingDateRange.end ? givingDateRange : undefined, 
            people,
            donorLifecycleSettings || DEFAULT_LIFECYCLE_SETTINGS
        );
    }, [donations, givingFilter, givingDateRange, people, donorLifecycleSettings]);
}

export function useGroupsDashboardData(
    groups: PcoGroup[],
    people: PcoPerson[]
) {
    return useMemo<GroupsDashboardData>(() => {
        return calculateGroupsDashboardData(groups, people);
    }, [groups, people]);
}

export function useAttendanceChartData(attendance: AttendanceRecord[]) {
    return useMemo<AttendanceData[]>(() => {
        return attendance.map(a => ({
            date: a.date,
            attendance: a.count,
            newComers: a.guests
        }));
    }, [attendance]);
}
