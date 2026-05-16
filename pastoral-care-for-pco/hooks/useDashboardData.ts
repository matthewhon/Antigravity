import { useMemo } from 'react';
import { 
    PcoPerson, PcoGroup, DetailedDonation, ServicesTeam, RiskSettings, 
    RiskChangeRecord, StatusChangeRecord, ServicesDashboardData, AttendanceRecord,
    PeopleDashboardData, GroupsDashboardData, AttendanceData, GivingFilter, DonorLifecycleSettings
} from '../types';
import { calculateBulkRisk, DEFAULT_RISK_SETTINGS } from '../services/riskService';
import { calculateGivingAnalytics, DEFAULT_LIFECYCLE_SETTINGS } from '../services/analyticsService';

export function useRiskEnrichedPeople(
    people: PcoPerson[],
    groups: PcoGroup[],
    donations: DetailedDonation[],
    servicesData: ServicesDashboardData | null,
    teams: ServicesTeam[],
    riskSettings?: RiskSettings
) {
    return useMemo(() => {
        const groupMemberMap = new Set<string>();
        if (groups) {
            groups.forEach(g => {
                if (g.memberIds) {
                    g.memberIds.forEach(mid => groupMemberMap.add(mid));
                }
            });
        }

        const peopleWithGroups = people.map(p => ({
            ...p,
            groupIds: groupMemberMap.has(p.id) ? ['exists'] : [] 
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
        const total = people.length;
        const members = people.filter(p => p.membership === 'Member').length;
        const newThisMonth = people.filter(p => {
            const d = new Date(p.createdAt);
            const now = new Date();
            return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
        }).length;
        
        const genderData = [
            { name: 'Male', value: people.filter(p => p.gender === 'M' || p.gender === 'Male').length },
            { name: 'Female', value: people.filter(p => p.gender === 'F' || p.gender === 'Female').length },
        ].filter(d => d.value > 0);

        const membershipCounts: Record<string, number> = {};
        people.forEach(p => {
            const m = p.membership || 'No Status';
            membershipCounts[m] = (membershipCounts[m] || 0) + 1;
        });
        const membershipData = Object.entries(membershipCounts)
            .map(([name, value]) => ({ name, value }))
            .sort((a, b) => b.value - a.value);

        const cityMap = new Map<string, number>();
        const zipMap = new Map<string, number>();
        people.forEach(p => {
            if (p.addresses && p.addresses.length > 0) {
                const addr = p.addresses[0];
                if (addr.city) cityMap.set(addr.city, (cityMap.get(addr.city) || 0) + 1);
                if (addr.zip) zipMap.set(addr.zip, (zipMap.get(addr.zip) || 0) + 1);
            }
        });

        const ageBuckets: Record<string, number> = { '0-18': 0, '19-30': 0, '31-50': 0, '51-70': 0, '70+': 0 };
        const currentYear = new Date().getFullYear();
        people.forEach(p => {
            if (p.birthdate) {
                const birthYear = parseInt(p.birthdate.split('-')[0]);
                const age = currentYear - birthYear;
                if (age <= 18) ageBuckets['0-18']++;
                else if (age <= 30) ageBuckets['19-30']++;
                else if (age <= 50) ageBuckets['31-50']++;
                else if (age <= 70) ageBuckets['51-70']++;
                else ageBuckets['70+']++;
            }
        });
        const ageData = Object.entries(ageBuckets).map(([range, count]) => ({ range, count }));

        const householdMap = new Map<string, PcoPerson[]>();
        people.forEach(p => {
            if (p.householdId) {
                if (!householdMap.has(p.householdId)) householdMap.set(p.householdId, []);
                householdMap.get(p.householdId)?.push(p);
            }
        });
        const pcoHouseholds = householdMap.size;
        const looseCount = people.filter(p => !p.householdId).length;
        const totalHouseholds = pcoHouseholds + looseCount;
        const avgSize = totalHouseholds > 0 ? total / totalHouseholds : 0;

        let familyCount = 0;
        householdMap.forEach(members => { if (members.length > 1) familyCount++; });
        const composition = [{ type: 'Family', count: familyCount }, { type: 'Individual', count: looseCount + (pcoHouseholds - familyCount) }];

        const sizeDist: Record<string, number> = {};
        householdMap.forEach(m => {
            const s = m.length;
            sizeDist[s] = (sizeDist[s] || 0) + 1;
        });
        if (looseCount > 0) sizeDist['1'] = (sizeDist['1'] || 0) + looseCount;
        const sizeDistribution = Object.entries(sizeDist).map(([size, count]) => ({ size: `${size} Person`, count })).sort((a,b) => parseInt(a.size) - parseInt(b.size));

        const householdList = Array.from(householdMap.entries()).map(([id, members]) => {
            let name = members[0].householdName || '';
            if (!name) {
                const lastName = members[0].name.split(' ').pop() || 'Unknown';
                name = `${lastName} Household`;
            }
            return { id, name, memberCount: members.length, members };
        }).sort((a,b) => b.memberCount - a.memberCount);

        const today = new Date();
        today.setHours(0,0,0,0);

        const getNextDate = (dateStr: string) => {
            const [y, m, d] = dateStr.split('-').map(Number);
            const currentYear = today.getFullYear();
            const target = new Date(currentYear, m - 1, d);
            
            if (target < today) {
                target.setFullYear(currentYear + 1);
            }
            return target;
        };

        return {
            stats: {
                total,
                members,
                nonMembers: total - members,
                newThisMonth,
                households: totalHouseholds
            },
            genderData,
            membershipData,
            ageData,
            engagementData: [
                { name: 'Core', value: people.filter(p => p.checkInCount && p.checkInCount > 8).length },
                { name: 'Regular', value: people.filter(p => p.checkInCount && p.checkInCount >= 4 && p.checkInCount <= 8).length },
                { name: 'Sporadic', value: people.filter(p => p.checkInCount && p.checkInCount > 0 && p.checkInCount < 4).length },
                { name: 'Inactive', value: people.filter(p => !p.checkInCount || p.checkInCount === 0).length }
            ],
            upcomingBirthdays: riskEnrichedPeople
                .filter(p => p.birthdate && p.status !== 'inactive')
                .sort((a, b) => getNextDate(a.birthdate!).getTime() - getNextDate(b.birthdate!).getTime())
                .slice(0, 8),
            upcomingAnniversaries: riskEnrichedPeople
                .filter(p => p.anniversary && p.status !== 'inactive')
                .sort((a, b) => getNextDate(a.anniversary!).getTime() - getNextDate(b.anniversary!).getTime())
                .slice(0, 8),
            recentPeople: [...riskEnrichedPeople]
                .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
                .slice(0, 10),
            geoData: {
                byCity: Array.from(cityMap.entries()).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 20),
                byZip: Array.from(zipMap.entries()).map(([name, value]) => ({ name, value })).sort((a,b) => b.value - a.value).slice(0, 10)
            },
            allPeople: riskEnrichedPeople,
            householdStats: {
                totalHouseholds,
                pcoHouseholds,
                avgSize,
                sizeDistribution,
                composition,
                householdList
            },
            recentRiskChanges,
            recentStatusChanges
        };
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
        const totalEnrollment = groups.reduce((sum, g) => sum + g.membersCount, 0);
        const groupTypeMap = new Map<string, number>();
        let totalAverageAttendance = 0;

        groups.forEach(g => {
            groupTypeMap.set(g.groupTypeName || 'Unknown', (groupTypeMap.get(g.groupTypeName || 'Unknown') || 0) + 1);
            
            if (g.attendanceHistory && g.attendanceHistory.length > 0) {
                const events = [...g.attendanceHistory].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
                const recentEvents = events.slice(0, 4);
                const sum = recentEvents.reduce((acc, ev) => acc + (ev.count || 0), 0);
                if (recentEvents.length > 0) {
                    totalAverageAttendance += sum / recentEvents.length;
                }
            }
        });

        totalAverageAttendance = Math.round(totalAverageAttendance);

        let male = 0;
        let female = 0;
        
        const allGroupMemberIds = new Set<string>();
        groups.forEach(g => {
            if (g.memberIds) {
                g.memberIds.forEach(mid => allGroupMemberIds.add(mid));
            }
        });

        if (people) {
            people.forEach(p => {
                if (allGroupMemberIds.has(p.id)) {
                    const g = p.gender?.toLowerCase();
                    if (g === 'm' || g === 'male') male++;
                    else if (g === 'f' || g === 'female') female++;
                }
            });
        }

        const genderDistribution = [
            { name: 'Male', value: male },
            { name: 'Female', value: female }
        ].filter(d => d.value > 0);

        const now = new Date();
        const thirtyDaysAgoIso = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const sixtyDaysAgoIso = new Date(now.getTime() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
        const todayIso = now.toISOString().split('T')[0];

        const attendedThisMonth = new Set<string>();
        const attendedLastMonth = new Set<string>();

        groups.forEach(g => {
            if (g.attendanceHistory) {
                g.attendanceHistory.forEach(h => {
                    const eventDate = h.date.split('T')[0];
                    if (eventDate > todayIso || eventDate < sixtyDaysAgoIso) return;
                    
                    if (h.attendeeIds) {
                        h.attendeeIds.forEach(id => {
                            if (eventDate >= thirtyDaysAgoIso) {
                                attendedThisMonth.add(id);
                            } else if (eventDate >= sixtyDaysAgoIso && eventDate < thirtyDaysAgoIso) {
                                attendedLastMonth.add(id);
                            }
                        });
                    }
                });
            }
        });

        return {
            stats: {
                totalGroups: groups.length,
                totalEnrollment,
                averageGroupSize: groups.length > 0 ? Math.round(totalEnrollment / groups.length) : 0,
                publicGroups: groups.filter(g => g.isPublic).length,
                averageAttendance: totalAverageAttendance
            },
            groupsByType: Array.from(groupTypeMap.entries()).map(([name, value]) => ({ name, value })),
            groupsByDay: [],
            allGroups: groups,
            recentGroups: groups.slice(0, 5),
            genderDistribution,
            progressStats: { thisMonth: attendedThisMonth.size, lastMonth: attendedLastMonth.size }
        };
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
