
import { DetailedDonation, PcoPerson, DonorLifecycleSettings, GivingAnalytics, LifecycleDonor, GivingFilter, ServicePlanSnapshot, ServicesTeam, AttendanceRecord, ServicesFilter, ServicesDashboardData, SongUsage, AggregatedChurchStats, PcoGroup, GlobalStats, PeopleDashboardData, GroupsDashboardData, RiskChangeRecord, StatusChangeRecord, MembershipHistoryData, MembershipTimeFilter, MembershipMonthlyPoint, MembershipTransitionItem, MembershipTransitionBreakdown, PcoCheckInRecord, NewEngagementSummary } from '../types';

const ONE_DAY = 24 * 60 * 60 * 1000;

const pad2 = (n: number) => String(n).padStart(2, '0');
const toDateStr = (d: Date) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

export const DEFAULT_LIFECYCLE_SETTINGS: DonorLifecycleSettings = {
    newDonorDays: 30,
    activeWindowDays: 90,
    activeMinGifts: 2,
    occasionalWindowDays: 180,
    lapsedWindowDays: 365,
    recoveredGapDays: 180
};

export const calculateGivingAnalytics = (
    donations: DetailedDonation[], 
    filter: GivingFilter, 
    customRange?: { start: string, end: string },
    people: PcoPerson[] = [],
    lifecycleSettings: DonorLifecycleSettings = DEFAULT_LIFECYCLE_SETTINGS
): GivingAnalytics => {
    // 1. Determine Date Range for FINANCIAL Metrics
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (filter === 'Custom' && customRange?.start && customRange?.end) {
        startDate = new Date(customRange.start);
        endDate = new Date(customRange.end);
        endDate.setHours(23, 59, 59, 999);
    } else {
        endDate = new Date(); // Default end is now
        
        if (filter === 'Week') {
            startDate.setDate(now.getDate() - 7);
        } else if (filter === 'This Week') {
            const day = now.getDay(); 
            startDate.setDate(now.getDate() - day); 
        } else if (filter === 'Last Week') {
            const day = now.getDay(); 
            endDate = new Date(now);
            endDate.setDate(now.getDate() - day - 1);
            endDate.setHours(23, 59, 59, 999);
            startDate = new Date(endDate);
            startDate.setDate(endDate.getDate() - 6);
        } else if (filter === 'Month') {
            startDate.setDate(now.getDate() - 30);
        } else if (filter === 'This Month') {
            startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        } else if (filter === 'Last Month') {
            startDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            endDate = new Date(now.getFullYear(), now.getMonth(), 0);
            endDate.setHours(23, 59, 59, 999);
        } else if (filter === 'Quarter') {
            startDate.setDate(now.getDate() - 90);
        } else if (filter === 'This Quarter') {
            const currentMonth = now.getMonth();
            const startMonth = currentMonth - (currentMonth % 3);
            startDate = new Date(now.getFullYear(), startMonth, 1);
        } else if (filter === 'Year') { // Last 365 Days
            startDate.setFullYear(now.getFullYear() - 1);
        } else if (filter === 'This Year') {
            startDate = new Date(now.getFullYear(), 0, 1);
        }
    }

    startDate.setHours(0, 0, 0, 0);
    
    // Calculate Previous Period (Sequential)
    // We calculate based on the exact duration of the current period to ensure fair comparison
    const durationTime = endDate.getTime() - startDate.getTime();
    const previousEndDate = new Date(startDate.getTime() - 1);
    const previousStartDate = new Date(previousEndDate.getTime() - durationTime);

    const formatDateStr = (d: Date) => d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined });
    const currentLabel = startDate.toDateString() === endDate.toDateString() 
        ? formatDateStr(startDate)
        : `${formatDateStr(startDate)} - ${formatDateStr(endDate)}`;

    const previousLabel = previousStartDate.toDateString() === previousEndDate.toDateString() 
        ? formatDateStr(previousStartDate)
        : `${formatDateStr(previousStartDate)} - ${formatDateStr(previousEndDate)}`;
        
    const timePeriodLabel = `${currentLabel} vs. ${previousLabel}`;

    const startDateStr = toDateStr(startDate);
    const endDateStr = toDateStr(endDate);
    const previousStartDateStr = toDateStr(previousStartDate);
    const previousEndDateStr = toDateStr(previousEndDate);

    const currentPeriodDonations = donations.filter(d => {
        const dDateStr = (d.date || '').slice(0, 10);
        return dDateStr >= startDateStr && dDateStr <= endDateStr;
    });

    const previousPeriodDonations = donations.filter(d => {
        const dDateStr = (d.date || '').slice(0, 10);
        return dDateStr >= previousStartDateStr && dDateStr <= previousEndDateStr;
    });

    const totalGiving = currentPeriodDonations.reduce((sum, d) => sum + d.amount, 0);
    const previousTotalGiving = previousPeriodDonations.reduce((sum, d) => sum + d.amount, 0);
    
    const uniqueDonors = new Set(currentPeriodDonations.map(d => d.donorId));
    const contributingPeople = uniqueDonors.size;
    
    const recurringGivers = new Set(currentPeriodDonations.filter(d => d.isRecurring).map(d => d.donorId)).size;
    const averageGift = currentPeriodDonations.length > 0 ? totalGiving / currentPeriodDonations.length : 0;

    // Previous period equivalents for trend indicators
    const previousContributingPeople = new Set(previousPeriodDonations.map(d => d.donorId)).size;
    const previousRecurringGivers = new Set(previousPeriodDonations.filter(d => d.isRecurring).map(d => d.donorId)).size;
    const previousAverageGift = previousPeriodDonations.length > 0 ? previousTotalGiving / previousPeriodDonations.length : 0;

    const amounts = currentPeriodDonations.map(d => d.amount).sort((a,b) => a - b);
    let medianGift = 0;
    if (amounts.length > 0) {
        const mid = Math.floor(amounts.length / 2);
        medianGift = amounts.length % 2 !== 0 ? amounts[mid] : (amounts[mid - 1] + amounts[mid]) / 2;
    }

    const fundMap = new Map<string, number>();
    currentPeriodDonations.forEach(d => {
        fundMap.set(d.fundName, (fundMap.get(d.fundName) || 0) + d.amount);
    });
    const givingByFund = Array.from(fundMap.entries()).map(([name, value]) => ({ name, value })).sort((a, b) => b.value - a.value);

    const trendsMap = new Map<string, number>();
    currentPeriodDonations.forEach(d => {
        const dDateStr = (d.date || '').slice(0, 10);
        let key = '';
        if (filter === 'Year' || filter === 'Quarter' || filter === 'This Year' || filter === 'This Quarter') {
            key = dDateStr.slice(0, 7); 
        } else {
            key = dDateStr; 
        }
        trendsMap.set(key, (trendsMap.get(key) || 0) + d.amount);
    });
    const trends = Array.from(trendsMap.entries()).map(([date, amount]) => ({ date, amount })).sort((a,b) => a.date.localeCompare(b.date));

    // Determine Bucket Type based on Duration
    const durationDays = durationTime / (1000 * 60 * 60 * 24);
    let bucketType: 'day' | 'week' | 'month' = 'day';
    if (durationDays > 60) bucketType = 'month'; 
    else if (durationDays > 12) bucketType = 'week'; 
    else bucketType = 'day'; 

    const comparisonMap = new Map<number, { label: string, current: number, previous: number }>();

    let numBuckets = 0;
    if (bucketType === 'month') {
        numBuckets = (endDate.getFullYear() - startDate.getFullYear()) * 12 + (endDate.getMonth() - startDate.getMonth()) + 1;
    } else if (bucketType === 'week') {
        numBuckets = Math.ceil(durationDays / 7);
    } else {
        numBuckets = Math.ceil(durationDays) + 1;
    }

    const getBucketIndex = (dateStr: string, start: Date): number => {
        const y = parseInt(dateStr.slice(0, 4), 10);
        const m = parseInt(dateStr.slice(5, 7), 10) - 1;
        const d = parseInt(dateStr.slice(8, 10), 10);
        
        const localDate = new Date(y, m, d);
        const localStart = new Date(start.getFullYear(), start.getMonth(), start.getDate());
        const diffTime = localDate.getTime() - localStart.getTime();
        
        if (bucketType === 'month') {
            return (y - start.getFullYear()) * 12 + (m - start.getMonth());
        } else if (bucketType === 'week') {
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            return Math.floor(diffDays / 7);
        } else {
            const diffDays = Math.floor(diffTime / (1000 * 60 * 60 * 24));
            return diffDays;
        }
    };

    for (let i = 0; i < numBuckets; i++) {
        let label = '';
        const d = new Date(startDate);
        if (bucketType === 'month') {
            d.setMonth(d.getMonth() + i);
            label = d.toLocaleString('default', { month: 'short' });
        } else if (bucketType === 'week') {
            label = `Week ${i + 1}`;
        } else {
            d.setDate(d.getDate() + i);
            label = d.toLocaleString('default', { weekday: 'short' });
        }
        comparisonMap.set(i, { label, current: 0, previous: 0 });
    }

    currentPeriodDonations.forEach(d => {
        const idx = getBucketIndex((d.date || '').slice(0, 10), startDate);
        if (comparisonMap.has(idx)) {
            comparisonMap.get(idx)!.current += d.amount;
        }
    });

    previousPeriodDonations.forEach(d => {
        const idx = getBucketIndex((d.date || '').slice(0, 10), previousStartDate);
        if (comparisonMap.has(idx)) {
            comparisonMap.get(idx)!.previous += d.amount;
        }
    });

    const comparisonTrends = Array.from(comparisonMap.values());

    const donorHistory = new Map<string, DetailedDonation[]>();
    donations.forEach(d => {
        if (!donorHistory.has(d.donorId)) donorHistory.set(d.donorId, []);
        donorHistory.get(d.donorId)!.push(d);
    });

    const activeDonors: LifecycleDonor[] = [];
    const newDonors: LifecycleDonor[] = [];
    const lapsedDonors: LifecycleDonor[] = [];
    const recoveredDonors: LifecycleDonor[] = [];
    const occasionalDonors: LifecycleDonor[] = [];
    const inactiveDonors: LifecycleDonor[] = [];
    const secondTimeDonors: LifecycleDonor[] = [];

    donorHistory.forEach((gifts, donorId) => {
        gifts.sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
        
        const lastGift = gifts[gifts.length - 1];
        const firstGift = gifts[0];
        const lastGiftDate = new Date(lastGift.date);
        const daysSinceLastGift = (now.getTime() - lastGiftDate.getTime()) / ONE_DAY;
        
        const person = people.find(p => p.id === donorId);

        let resolvedName = lastGift.donorName;
        if (person && person.name && person.name !== 'Unknown') {
            resolvedName = person.name;
        } else if (donorId === 'anonymous') {
            resolvedName = 'Anonymous';
        }

        // Skip placeholder donors with no real identity — they can't be followed up
        const PLACEHOLDER_NAMES = new Set(['Donor', 'Unknown', 'Anonymous']);
        if (!person && PLACEHOLDER_NAMES.has(resolvedName)) return;

        const totalAmount = gifts.reduce((sum, g) => sum + g.amount, 0);
        // Calculate avg monthly: spread total giving across distinct calendar months
        const distinctMonths = new Set(gifts.map(g => g.date.slice(0, 7))).size;
        const avgMonthlyAmount = distinctMonths > 0 ? totalAmount / distinctMonths : totalAmount;

        const donorObj: LifecycleDonor = {
            id: donorId,
            name: resolvedName,
            totalAmount,
            avgMonthlyAmount,
            firstGiftDate: firstGift.date,
            lastGiftDate: lastGift.date,
            avatar: person?.avatar || null,
            riskProfile: person?.riskProfile
        };

        if (daysSinceLastGift > lifecycleSettings.lapsedWindowDays) {
            inactiveDonors.push(donorObj);
        } else if (daysSinceLastGift > lifecycleSettings.occasionalWindowDays) {
            lapsedDonors.push(donorObj);
        } else {
            const daysSinceFirstGift = (now.getTime() - new Date(firstGift.date).getTime()) / ONE_DAY;
            if (gifts.length === 1 && daysSinceFirstGift <= lifecycleSettings.newDonorDays) {
                newDonors.push(donorObj);
            }
            else if (gifts.length === 2 && daysSinceFirstGift <= lifecycleSettings.newDonorDays * 2) { 
                secondTimeDonors.push(donorObj);
            }
            
            if (gifts.length > 1) {
                const prevGiftDate = new Date(gifts[gifts.length - 2].date);
                const gapDays = (lastGiftDate.getTime() - prevGiftDate.getTime()) / ONE_DAY;
                if (gapDays > lifecycleSettings.recoveredGapDays) {
                    recoveredDonors.push(donorObj);
                }
            }

            const giftsInActiveWindow = gifts.filter(g => (now.getTime() - new Date(g.date).getTime()) / ONE_DAY <= lifecycleSettings.activeWindowDays);
            
            if (daysSinceLastGift <= lifecycleSettings.activeWindowDays && giftsInActiveWindow.length >= lifecycleSettings.activeMinGifts) {
                activeDonors.push(donorObj);
            } else {
                occasionalDonors.push(donorObj);
            }
        }
    });

    const trailingYearStart = new Date();
    trailingYearStart.setFullYear(now.getFullYear() - 1);
    const trailingYearStartStr = toDateStr(trailingYearStart);
    
    const trailingYearTotals = new Map<string, number>();
    donations.filter(d => (d.date || '').slice(0, 10) >= trailingYearStartStr).forEach(d => {
        trailingYearTotals.set(d.donorId, (trailingYearTotals.get(d.donorId) || 0) + d.amount);
    });
    
    const topGiversList = Array.from(trailingYearTotals.entries())
        .map(([id, amount]) => {
            const p = people.find(x => x.id === id);
            let name = 'Unknown';
            if (p) name = p.name;
            else if (id === 'anonymous') name = 'Anonymous';
            
            return { id, name, amount, avatar: p?.avatar };
        })
        .sort((a,b) => b.amount - a.amount)
        .slice(0, 10);

    const top10Sum = topGiversList.reduce((acc, curr) => acc + curr.amount, 0);
    const trailingYearTotal = Array.from(trailingYearTotals.values()).reduce((a,b) => a+b, 0);
    const topGiverConcentration = trailingYearTotal > 0 ? (top10Sum / trailingYearTotal) * 100 : 0;

    const atRiskGiversList = lapsedDonors
        .sort((a,b) => b.totalAmount - a.totalAmount)
        .slice(0, 10);

    const thirtyDaysAgo = new Date(now.getTime() - 30 * ONE_DAY);
    const sixtyDaysAgo = new Date(now.getTime() - 60 * ONE_DAY);
    const thirtyDaysAgoStr = toDateStr(thirtyDaysAgo);
    const sixtyDaysAgoStr = toDateStr(sixtyDaysAgo);
    const nowStr = toDateStr(now);

    const givingThisMonth = new Set(donations.filter(d => {
        const dDateStr = (d.date || '').slice(0, 10);
        return dDateStr >= thirtyDaysAgoStr && dDateStr <= nowStr;
    }).map(d => d.donorId)).size;
    const givingLastMonth = new Set(donations.filter(d => {
        const dDateStr = (d.date || '').slice(0, 10);
        return dDateStr >= sixtyDaysAgoStr && dDateStr < thirtyDaysAgoStr;
    }).map(d => d.donorId)).size;

    return {
        totalGiving,
        previousTotalGiving,
        contributingPeople,
        previousContributingPeople,
        recurringGivers,
        previousRecurringGivers,
        averageGift,
        previousAverageGift,
        medianGift,
        givingByFund,
        trends,
        comparisonTrends,
        donorLifecycle: {
            new: newDonors.length,
            active: activeDonors.length,
            lapsed: lapsedDonors.length,
            recovered: recoveredDonors.length,
            occasional: occasionalDonors.length,
            inactive: inactiveDonors.length,
            secondTime: secondTimeDonors.length
        },
        lists: {
            new: newDonors,
            active: activeDonors,
            lapsed: lapsedDonors,
            recovered: recoveredDonors,
            occasional: occasionalDonors,
            inactive: inactiveDonors,
            secondTime: secondTimeDonors
        },
        topGiversList,
        atRiskGiversList,
        topGiverConcentration,
        progressStats: { thisMonth: givingThisMonth, lastMonth: givingLastMonth },
        timePeriodLabel,
        currentLabel,
        previousLabel
    };
};

export const calculateServicesAnalytics = (
    plans: ServicePlanSnapshot[],
    teams: ServicesTeam[],
    attendance: AttendanceRecord[],
    filter: ServicesFilter,
    checkIns: PcoCheckInRecord[] = [],
    people: PcoPerson[] = []
): ServicesDashboardData => {
    // 1. Determine Date Range
    const now = new Date();
    let startDate = new Date();
    let endDate = new Date();

    if (filter === 'Week') {
        startDate.setDate(now.getDate() - 7);
        endDate = now;
    } else if (filter === 'Month') {
        startDate.setDate(now.getDate() - 30);
        endDate = now;
    } else if (filter === 'Quarter') {
        startDate.setDate(now.getDate() - 90);
        endDate = now;
    } else if (filter === 'Year') {
        startDate.setFullYear(now.getFullYear() - 1);
        endDate = now;
    } else if (filter === 'Next Week') {
        startDate = now;
        endDate = new Date();
        // Expand to 14 days to capture upcoming Sunday if running late in week
        endDate.setDate(now.getDate() + 14); 
    } else if (filter === 'Next Month') {
        startDate = now;
        endDate = new Date();
        endDate.setDate(now.getDate() + 30);
    }

    startDate.setHours(0,0,0,0);
    endDate.setHours(23,59,59,999);

    // 2. Filter Plans
    const filteredPlans = plans.filter(p => {
        const d = new Date(p.sortDate);
        return d >= startDate && d <= endDate;
    });

    // Determine Future Plans (Robust Date Comparison)
    // We use ISO string comparison to avoid local timezone offset issues "hiding" today's plans
    const todayISO = new Date().toISOString().split('T')[0];
    const futurePlans = plans.filter(p => {
        // Assume p.sortDate is ISO "YYYY-MM-DD..."
        const planISO = new Date(p.sortDate).toISOString().split('T')[0];
        return planISO >= todayISO;
    });

    // 3. Calculate Stats from Filtered Plans
    let totalPositions = 0; // Capacity (Filled + Open)
    let filledPositions = 0; // Confirmed + Unconfirmed from data
    let confirmed = 0;
    let pending = 0;
    let declined = 0;
    
    const uniqueVolunteerIds = new Set<string>();
    const songUsage = new Map<string, SongUsage>();

    // Dynamic Team Calculation Logic (Schedule-based)
    // TeamID -> Set<PersonID>
    const activeTeamMembers = new Map<string, Set<string>>(); 
    const activeTeamPositions = new Map<string, Set<string>>(); 
    const teamIdToName = new Map<string, string>(); // To resolve name for final output

    // Map existing teams for metadata lookup
    const teamMap = new Map<string, ServicesTeam>();
    teams.forEach(t => teamMap.set(t.id, t));

    filteredPlans.forEach(plan => {
        // positionsNeeded is 'Open Slots' (from needed_positions endpoint)
        // positionsFilled is 'Confirmed' + 'Unconfirmed' (Filled Count)
        
        let planConfirmed = 0;
        let planPending = 0;

        if (plan.items) {
            plan.items.forEach(item => {
                // Check both explicit song items and text items that might be songs
                if (item.type === 'song' || item.type === 'Song' || item.item_type === 'song') {
                    const cleanTitle = item.title?.trim();
                    if (!cleanTitle) return;
                    
                    const cleanAuthor = item.author?.trim() || 'Unknown';
                    const key = `${cleanTitle.toLowerCase()}|${cleanAuthor.toLowerCase()}`;
                    
                    if (!songUsage.has(key)) {
                        songUsage.set(key, { 
                            id: key, 
                            title: cleanTitle, 
                            author: cleanAuthor, 
                            count: 0 
                        });
                    }
                    songUsage.get(key)!.count++;
                }
            });
        }

        if (plan.teamMembers) {
            plan.teamMembers.forEach(m => {
                if (m.personId) uniqueVolunteerIds.add(m.personId);
                
                // Robust status check
                const status = m.status?.toLowerCase() || '';
                
                if (status === 'confirmed' || status === 'c') {
                    confirmed++;
                    planConfirmed++;
                }
                else if (status === 'unconfirmed' || status === 'u' || status === 'pending') {
                    pending++;
                    planPending++;
                }
                else if (status === 'declined' || status === 'd') declined++;

                // Build Active Roster for Teams Snapshot
                const tKey = m.teamId || m.teamName;
                const isConfirmed = status === 'confirmed' || status === 'c';
                const isPending = status === 'unconfirmed' || status === 'u' || status === 'pending';
                
                if (tKey && m.personId && (isConfirmed || isPending)) {
                    // Try to resolve name from map if missing
                    let teamName = m.teamName;
                    if ((!teamName || teamName === 'Unknown Team') && m.teamId) {
                        teamName = teamMap.get(m.teamId)?.name || 'Unknown Team';
                    }

                    // Skip entries with no meaningful team name — these create phantom "Unknown" teams
                    const resolvedName = teamName || tKey;
                    if (!resolvedName || resolvedName === 'Unknown' || resolvedName === 'Unknown Team') return;
                    
                    teamIdToName.set(tKey, resolvedName);

                    if (!activeTeamMembers.has(tKey)) {
                        activeTeamMembers.set(tKey, new Set());
                    }
                    activeTeamMembers.get(tKey)!.add(m.personId);

                    // Track Position Counts
                    if (m.teamPositionName) {
                        if (!activeTeamPositions.has(tKey)) {
                            activeTeamPositions.set(tKey, new Set());
                        }
                        activeTeamPositions.get(tKey)!.add(m.teamPositionName);
                    }
                }
            });
        }

        const planFilled = planConfirmed + planPending;
        // Total Capacity = Filled + Open
        const openSlots = plan.positionsNeeded || 0;
        const capacity = planFilled + openSlots;
        
        totalPositions += capacity;
        filledPositions += planFilled;
    });

    // Reconstruct teams array for the widget
    const augmentedTeams: ServicesTeam[] = [];
    
    // We want to return ALL teams, but augment them with active/scheduled data
    teams.forEach(existingTeam => {
        const tKey = existingTeam.id;
        const activeMembers = activeTeamMembers.get(tKey) || new Set();
        
        augmentedTeams.push({
            ...existingTeam,
            // Use Source Data for Leaders and Roster Members (from PCO Sync)
            memberIds: existingTeam.memberIds || [], // Roster
            leaderPersonIds: existingTeam.leaderPersonIds || [], // Assigned Leaders
            leaderCount: existingTeam.leaderPersonIds?.length || 0,
            // Use Schedule Data for Active Members and Positions
            scheduledMemberIds: Array.from(activeMembers),
            positionCount: activeTeamPositions.has(tKey) ? activeTeamPositions.get(tKey)!.size : 0
        });
    });

    // Also handle teams found in schedule that might not be in the 'teams' list (edge case)
    activeTeamMembers.forEach((memberSet, tKey) => {
        if (!teamMap.has(tKey)) {
            const resolvedName = teamIdToName.get(tKey) || tKey;
            // Skip phantom "Unknown" teams — these come from plan members with no team assignment
            if (!resolvedName || resolvedName === 'Unknown' || resolvedName === 'Unknown Team') return;
            augmentedTeams.push({
                id: `temp_${tKey.replace(/\s+/g, '_')}`,
                churchId: '',
                name: resolvedName,
                memberIds: [],
                scheduledMemberIds: Array.from(memberSet),
                leaderCount: 0,
                leaderPersonIds: [],
                positionCount: activeTeamPositions.has(tKey) ? activeTeamPositions.get(tKey)!.size : 0
            });
        }
    });

    // Sort by most active (scheduled count)
    augmentedTeams.sort((a, b) => (b.scheduledMemberIds?.length || 0) - (a.scheduledMemberIds?.length || 0));

    // Calculate Church Progress Stats for generic 30/60 days (independent of filter)
    const thirtyDaysAgoIso = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    const sixtyDaysAgoIso = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    
    const servingThisMonth = new Set<string>();
    const servingLastMonth = new Set<string>();

    plans.forEach(plan => {
        const planDate = plan.sortDate.split('T')[0];
        if (planDate > todayISO || planDate < sixtyDaysAgoIso) return;
        
        plan.teamMembers?.forEach(m => {
            const status = m.status?.toLowerCase() || '';
            if ((status === 'confirmed' || status === 'c') && m.personId) {
                if (planDate >= thirtyDaysAgoIso) {
                    servingThisMonth.add(m.personId);
                } else if (planDate >= sixtyDaysAgoIso && planDate < thirtyDaysAgoIso) {
                    servingLastMonth.add(m.personId);
                }
            }
        });
    });

    // 4. Calculate Check-ins Trend
    // IMPORTANT: Do NOT pre-filter attendance by the ServicesFilter date range here.
    // The ServicesView component applies its own independent checkinFilter (Current Week /
    // Last Month / etc.) on top of this data. Pre-filtering here would create a double-filter
    // that silently drops records whenever the two windows don't overlap.
    // Instead, pass ALL stored attendance records through and let the UI filter handle slicing.
    //
    // We also use ISO string comparison (a.date >= startStr) instead of new Date(a.date)
    // to avoid UTC-midnight parsing shifting dates by one day in US timezones.
    const ninetyDaysAgoStr = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
        .toISOString().split('T')[0];

    const checkInTrends = attendance
        .filter(a => a.date >= ninetyDaysAgoStr) // Keep last 90 days, timezone-safe
        .map(a => ({
            date: a.date,
            isoDate: a.date,
            regulars: a.regulars || 0,
            guests: a.guests || 0,
            volunteers: a.volunteers || 0,
            headcount: a.headcount || 0,
            digitalCheckins: a.digitalCheckins || 0,
            customHeadcounts: a.customHeadcounts || [],
            total: a.count,
            events: (a as any).events || []
        }))
        .sort((a,b) => a.date.localeCompare(b.date));

    const totalCheckIns = checkInTrends.reduce((sum, t) => sum + t.total, 0);
    
    const breakdown = {
        regulars: checkInTrends.reduce((sum, t) => sum + t.regulars, 0),
        guests: checkInTrends.reduce((sum, t) => sum + t.guests, 0),
        volunteers: checkInTrends.reduce((sum, t) => sum + t.volunteers, 0)
    };

    const allSongsSorted = Array.from(songUsage.values()).sort((a,b) => b.count - a.count);
    const topSongs = allSongsSorted.slice(0, 5);
    const totalSongPlays = allSongsSorted.reduce((s, x) => s + x.count, 0);
    const uniqueSongs = allSongsSorted.length;
    const top5Plays = topSongs.reduce((s, x) => s + x.count, 0);
    const songStats = {
        uniqueSongs,
        totalPlays: totalSongPlays,
        avgRepeats: uniqueSongs > 0 ? totalSongPlays / uniqueSongs : 0,
        top5Share: totalSongPlays > 0 ? (top5Plays / totalSongPlays) * 100 : 0,
        singles: allSongsSorted.filter(s => s.count === 1).length,
    };

    // Open positions is basically just Total Capacity - Filled, or simple sum of open slots.
    const openPositions = Math.max(0, totalPositions - filledPositions);

    return {
        stats: {
            totalPlans: filteredPlans.length,
            uniqueVolunteers: uniqueVolunteerIds.size,
            positionsFilled: filledPositions,
            positionsOpen: openPositions,
            fillRate: totalPositions > 0 ? (filledPositions / totalPositions) * 100 : 0
        },
        topSongs,
        allSongs: allSongsSorted.slice(0, 50),
        songStats,
        teamStats: {
            totalFilled: filledPositions,
            totalNeeded: totalPositions,
            confirmed,
            pending,
            declined,
            open: openPositions
        },
        teams: augmentedTeams,
        checkIns: {
            totalCheckIns,
            uniqueAttendees: 0, 
            breakdown,
            trends: checkInTrends
        },
        futurePlans,
        recentPlans: plans, // Make all plans available for risk bulk calculation
        progressStats: { thisMonth: servingThisMonth.size, lastMonth: servingLastMonth.size },
        newEngagementsStats: calculateNewServiceEngagements(checkIns, plans, people)
    };
};

export const calculateAggregatedStats = (
    churchId: string,
    people: PcoPerson[],
    donations: DetailedDonation[],
    groups: PcoGroup[],
    teams: ServicesTeam[]
): AggregatedChurchStats => {
    const now = new Date();
    const twelveWeeksAgo = new Date();
    twelveWeeksAgo.setDate(now.getDate() - 84);
    const twelveWeeksAgoStr = toDateStr(twelveWeeksAgo);
    
    const recentDonations = donations.filter(d => (d.date || '').slice(0, 10) >= twelveWeeksAgoStr);
    const totalRecentGiving = recentDonations.reduce((sum, d) => sum + d.amount, 0);
    const avgWeeklyGiving = totalRecentGiving / 12;

    const households = new Map<string, number>(); 
    let looseIndividuals = 0;
    people.forEach(p => {
        if (p.householdId) {
            households.set(p.householdId, (households.get(p.householdId) || 0) + 1);
        } else {
            looseIndividuals++;
        }
    });
    
    let totalPeopleInHouseholds = 0;
    households.forEach(count => totalPeopleInHouseholds += count);
    const avgHouseholdSize = households.size > 0 ? totalPeopleInHouseholds / households.size : 0;

    let totalAttendance = 0;
    let meetingCount = 0;
    groups.forEach(g => {
        g.attendanceHistory?.forEach(h => {
            totalAttendance += h.count;
            meetingCount++;
        });
    });
    const avgGroupAttendance = meetingCount > 0 ? totalAttendance / meetingCount : 0;

    let males = 0;
    let females = 0;
    people.forEach(p => {
        const g = p.gender?.toLowerCase();
        if (g === 'm' || g === 'male') males++;
        else if (g === 'f' || g === 'female') females++;
    });
    const maleFemaleRatio = females > 0 ? males / females : 0;

    const uniqueTeamMembers = new Set<string>();
    teams.forEach(t => t.memberIds.forEach(mid => uniqueTeamMembers.add(mid)));
    const serviceTeamSize = uniqueTeamMembers.size;

    const ageBuckets: Record<string, number> = { '0-18': 0, '19-30': 0, '31-50': 0, '51-70': 0, '70+': 0 };
    const currentYear = new Date().getFullYear();
    let peopleWithBirthdays = 0;
    people.forEach(p => {
        if (p.birthdate) {
            const birthYear = parseInt(p.birthdate.split('-')[0]);
            const age = currentYear - birthYear;
            peopleWithBirthdays++;
            if (age <= 18) ageBuckets['0-18']++;
            else if (age <= 30) ageBuckets['19-30']++;
            else if (age <= 50) ageBuckets['31-50']++;
            else if (age <= 70) ageBuckets['51-70']++;
            else ageBuckets['70+']++;
        }
    });
    
    const ageDistPercentages: Record<string, number> = {};
    Object.keys(ageBuckets).forEach(k => {
        ageDistPercentages[k] = peopleWithBirthdays > 0 ? (ageBuckets[k] / peopleWithBirthdays) * 100 : 0;
    });

    const oneYearAgo = new Date();
    oneYearAgo.setFullYear(now.getFullYear() - 1);
    const oneYearAgoStr = toDateStr(oneYearAgo);
    
    const yearDonations = donations.filter(d => (d.date || '').slice(0, 10) >= oneYearAgoStr);
    const giftsByAgeGroup: Record<string, { total: number, count: number }> = {
        '18-30': { total: 0, count: 0 },
        '31-50': { total: 0, count: 0 },
        '51-65': { total: 0, count: 0 },
        '65+': { total: 0, count: 0 }
    };

    yearDonations.forEach(d => {
        const donor = people.find(p => p.id === d.donorId);
        if (donor && donor.birthdate) {
            const birthYear = parseInt(donor.birthdate.split('-')[0]);
            const age = currentYear - birthYear;
            let group = '';
            if (age >= 18 && age <= 30) group = '18-30';
            else if (age <= 50) group = '31-50';
            else if (age <= 65) group = '51-65';
            else if (age > 65) group = '65+';

            if (group) {
                giftsByAgeGroup[group].total += d.amount;
                giftsByAgeGroup[group].count++;
            }
        }
    });

    const avgGiftByAge: Record<string, number> = {};
    Object.keys(giftsByAgeGroup).forEach(k => {
        avgGiftByAge[k] = giftsByAgeGroup[k].count > 0 ? giftsByAgeGroup[k].total / giftsByAgeGroup[k].count : 0;
    });

    return {
        churchId,
        updatedAt: Date.now(),
        metrics: {
            avgWeeklyGiving,
            avgHouseholdSize,
            avgGroupAttendance,
            maleFemaleRatio,
            serviceTeamSize,
            ageDistribution: ageDistPercentages,
            avgGiftByAge
        }
    };
};

export const calculatePeopleDashboardData = (
    people: PcoPerson[],
    riskEnrichedPeople: PcoPerson[],
    recentRiskChanges: RiskChangeRecord[],
    recentStatusChanges: StatusChangeRecord[],
    donations: DetailedDonation[] = [],
    servicePlans: ServicePlanSnapshot[] = []
): PeopleDashboardData => {
    const total = people.length;
    const members = people.filter(p => p.membership === 'Member').length;
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const newThisMonth = people.filter(p => {
        const d = new Date(p.createdAt);
        return d >= thirtyDaysAgo;
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
            { name: 'Healthy', value: riskEnrichedPeople.filter(p => p.riskProfile?.category === 'Healthy').length },
            { name: 'At Risk', value: riskEnrichedPeople.filter(p => p.riskProfile?.category === 'At Risk').length },
            { name: 'Disconnected', value: riskEnrichedPeople.filter(p => p.riskProfile?.category === 'Disconnected').length }
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
        recentStatusChanges,
        nextGenStats: calculateNextGenStats(riskEnrichedPeople, donations, servicePlans),
    };
};

// ─────────────────────────────────────────────────────────────────────────────
// NextGen Analytics
// Covers ages 0–25 (inclusive). Grade-level breakdown uses PCO's integer grade
// field (0 = Kindergarten, 1–12 = school grades). Ages 19–25 without a grade
// are grouped as "Young Adults".
// ─────────────────────────────────────────────────────────────────────────────

const NEXTGEN_MAX_AGE = 25;

/** Compute a person's age from their birthdate string (YYYY-MM-DD or YYYY). */
function computeAge(birthdate: string): number | null {
    if (!birthdate) return null;
    const birth = new Date(birthdate);
    if (isNaN(birth.getTime())) return null;
    const now = new Date();
    let age = now.getFullYear() - birth.getFullYear();
    if (
        now.getMonth() < birth.getMonth() ||
        (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
    ) age--;
    return age;
}

/** Map an age (0–25) to a display bucket label. */
function ageGroupLabel(age: number): string {
    if (age <= 5)  return '0–5 (Nursery)';
    if (age <= 11) return '6–11 (Elementary)';
    if (age <= 14) return '12–14 (Middle School)';
    if (age <= 18) return '15–18 (High School)';
    return '19–25 (Young Adult)';
}

/** Convert PCO integer grade to a display label. */
function gradeLabel(grade: number): string {
    if (grade === 0) return 'Kindergarten';
    if (grade >= 1 && grade <= 12) return `${grade}th Grade`;
    return 'Unknown';
}

const GRADE_ORDER = [
    'Kindergarten', '1st Grade', '2nd Grade', '3rd Grade', '4th Grade',
    '5th Grade', '6th Grade', '7th Grade', '8th Grade', '9th Grade',
    '10th Grade', '11th Grade', '12th Grade', 'Young Adult', 'Unknown'
];

function gradeDisplayLabel(grade: number): string {
    if (grade === 0) return 'Kindergarten';
    const suffixes: Record<number, string> = { 1: 'st', 2: 'nd', 3: 'rd' };
    const suffix = suffixes[grade] || 'th';
    return `${grade}${suffix} Grade`;
}

export const calculateNextGenStats = (
    people: PcoPerson[],
    donations: DetailedDonation[],
    servicePlans: ServicePlanSnapshot[] = []
): NonNullable<PeopleDashboardData['nextGenStats']> => {

    const currentYear = new Date().getFullYear();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    // ── Identify NextGen people ──────────────────────────────────────────────
    const nextGen = people.filter(p => {
        if (p.child === true) return true;
        if (p.age != null) return p.age <= NEXTGEN_MAX_AGE;
        if (p.birthdate) {
            const age = computeAge(p.birthdate);
            return age != null && age <= NEXTGEN_MAX_AGE;
        }
        return false;
    });

    const totalNextGen = nextGen.length;

    // ── Grade breakdown ──────────────────────────────────────────────────────
    const gradeCounts = new Map<string, number>();
    nextGen.forEach(p => {
        let label: string;
        if (p.grade != null) {
            label = gradeDisplayLabel(p.grade);
        } else {
            const age = p.age ?? (p.birthdate ? computeAge(p.birthdate) : null);
            label = (age != null && age >= 19) ? 'Young Adult' : 'Unknown';
        }
        gradeCounts.set(label, (gradeCounts.get(label) || 0) + 1);
    });
    const gradeBreakdown = GRADE_ORDER
        .filter(g => gradeCounts.has(g))
        .map(g => ({ grade: g, count: gradeCounts.get(g)! }));

    // ── Attendance by age group ──────────────────────────────────────────────
    const ageGroupBuckets = new Map<string, { total: number; count: number; withCheckIn: number }>();
    nextGen.forEach(p => {
        const age = p.age ?? (p.birthdate ? computeAge(p.birthdate) : null);
        if (age == null) return;
        const label = ageGroupLabel(age);
        if (!ageGroupBuckets.has(label)) ageGroupBuckets.set(label, { total: 0, count: 0, withCheckIn: 0 });
        const bucket = ageGroupBuckets.get(label)!;
        bucket.count++;
        const checkIns = p.checkInCount || 0;
        bucket.total += checkIns;
        if (checkIns > 0) bucket.withCheckIn++;
    });
    const ageGroupOrder = ['0–5 (Nursery)', '6–11 (Elementary)', '12–14 (Middle School)', '15–18 (High School)', '19–25 (Young Adult)'];
    const ageGroupAttendance = ageGroupOrder
        .filter(label => ageGroupBuckets.has(label))
        .map(label => {
            const b = ageGroupBuckets.get(label)!;
            return {
                ageGroup: label,
                totalCheckIns: b.total,
                avgCheckIns: b.count > 0 ? Math.round((b.total / b.count) * 10) / 10 : 0,
                withCheckInPct: b.count > 0 ? Math.round((b.withCheckIn / b.count) * 100) : 0,
            };
        });

    // ── Serving in PCO Services ──────────────────────────────────────────────
    const nextGenIds = new Set(nextGen.map(p => p.id));
    const servingIds = new Set<string>();
    servicePlans.forEach(plan => {
        (plan.teamMembers || []).forEach(tm => {
            if (nextGenIds.has(tm.personId)) servingIds.add(tm.personId);
        });
    });
    const servingCount = servingIds.size;

    const servingByAgeGroupMap = new Map<string, number>();
    servingIds.forEach(id => {
        const person = nextGen.find(p => p.id === id);
        if (!person) return;
        const age = person.age ?? (person.birthdate ? computeAge(person.birthdate) : null);
        if (age == null) return;
        const label = ageGroupLabel(age);
        servingByAgeGroupMap.set(label, (servingByAgeGroupMap.get(label) || 0) + 1);
    });
    const servingByAgeGroup = ageGroupOrder
        .filter(label => servingByAgeGroupMap.has(label))
        .map(label => ({ ageGroup: label, count: servingByAgeGroupMap.get(label)! }));

    // ── Direct giving by NextGen individuals ─────────────────────────────────
    const currentYearStr = String(currentYear);
    const directGiversMap = new Map<string, number>(); // personId → YTD total
    donations.forEach(d => {
        if (!nextGenIds.has(d.donorId)) return;
        if (!d.date?.startsWith(currentYearStr)) return;
        directGiversMap.set(d.donorId, (directGiversMap.get(d.donorId) || 0) + (d.amount || 0));
    });
    // Also catch people with givingStats.ytd > 0 even if no donation records loaded
    nextGen.forEach(p => {
        if ((p.givingStats?.ytd ?? 0) > 0 && !directGiversMap.has(p.id)) {
            directGiversMap.set(p.id, p.givingStats!.ytd);
        }
    });
    const directGivingCount = directGiversMap.size;
    const directGivingYtd = Array.from(directGiversMap.values()).reduce((s, v) => s + v, 0);

    // ── Giving households (a NextGen member's household has a giving adult) ──
    const householdToMembers = new Map<string, PcoPerson[]>();
    people.forEach(p => {
        if (!p.householdId) return;
        if (!householdToMembers.has(p.householdId)) householdToMembers.set(p.householdId, []);
        householdToMembers.get(p.householdId)!.push(p);
    });

    let givingHouseholdCount = 0;
    let givingHouseholdTotal = 0;
    const countedHouseholds = new Set<string>();
    nextGen.forEach(p => {
        if (!p.householdId || countedHouseholds.has(p.householdId)) return;
        const members = householdToMembers.get(p.householdId) || [];
        const hasGivingAdult = members.some(m => {
            if (nextGenIds.has(m.id)) return false; // exclude NextGen members themselves
            return m.isDonor === true || (m.givingStats?.ytd ?? 0) > 0;
        });
        if (hasGivingAdult) {
            givingHouseholdCount++;
            countedHouseholds.add(p.householdId);
            // Sum adult giving for that household
            members.forEach(m => {
                if (!nextGenIds.has(m.id)) {
                    givingHouseholdTotal += m.givingStats?.ytd ?? 0;
                }
            });
        }
    });

    // ── Spiritual milestones ─────────────────────────────────────────────────
    let salvations = 0;
    let baptisms = 0;
    nextGen.forEach(p => {
        if (p.spiritualMilestones?.salvationDate || p.salvationDate) salvations++;
        if (p.spiritualMilestones?.baptismDate || p.baptismDate) baptisms++;
    });

    // ── Retention by grade ───────────────────────────────────────────────────
    const retentionMap = new Map<string, { healthy: number; atRisk: number; disconnected: number }>();
    nextGen.forEach(p => {
        let label: string;
        if (p.grade != null) {
            label = gradeDisplayLabel(p.grade);
        } else {
            const age = p.age ?? (p.birthdate ? computeAge(p.birthdate) : null);
            label = (age != null && age >= 19) ? 'Young Adult' : 'Unknown';
        }
        if (!retentionMap.has(label)) retentionMap.set(label, { healthy: 0, atRisk: 0, disconnected: 0 });
        const bucket = retentionMap.get(label)!;
        const cat = p.riskProfile?.category;
        if (cat === 'Healthy') bucket.healthy++;
        else if (cat === 'At Risk') bucket.atRisk++;
        else bucket.disconnected++;
    });
    const retentionByGrade = GRADE_ORDER
        .filter(g => retentionMap.has(g))
        .map(g => ({ grade: g, ...retentionMap.get(g)! }));

    // ── Guardian engagement ──────────────────────────────────────────────────
    let bothEngaged = 0;
    let oneEngaged = 0;
    let neitherEngaged = 0;
    const processedHouseholds = new Set<string>();
    nextGen.forEach(p => {
        if (!p.householdId || processedHouseholds.has(p.householdId)) return;
        processedHouseholds.add(p.householdId);
        const members = householdToMembers.get(p.householdId) || [];
        const guardians = members.filter(m => !nextGenIds.has(m.id));
        if (guardians.length === 0) return;
        const engagedCount = guardians.filter(g => g.riskProfile?.category === 'Healthy').length;
        if (engagedCount >= 2) bothEngaged++;
        else if (engagedCount === 1) oneEngaged++;
        else neitherEngaged++;
    });

    // ── New NextGen this month ────────────────────────────────────────────────
    const newNextGenThisMonth = nextGen.filter(p => new Date(p.createdAt) >= thirtyDaysAgo).length;

    // ── Data quality: % with a birthdate ─────────────────────────────────────
    const withBirthdate = nextGen.filter(p => !!p.birthdate).length;
    const withBirthdatePct = totalNextGen > 0 ? Math.round((withBirthdate / totalNextGen) * 100) : 0;

    return {
        totalNextGen,
        gradeBreakdown,
        ageGroupAttendance,
        servingCount,
        servingByAgeGroup,
        directGivingCount,
        directGivingYtd,
        givingHouseholdCount,
        givingHouseholdTotal,
        newNextGenThisMonth,
        withBirthdatePct,
        milestones: { salvations, baptisms },
        retentionByGrade,
        guardianEngagement: { bothEngaged, oneEngaged, neitherEngaged },
    };
};

export const calculateNewGroupEngagements = (
    groups: PcoGroup[],
    people?: PcoPerson[]
): NewEngagementSummary => {
    const personFirstGroupDate = new Map<string, string>();

    groups.forEach(g => {
        if (g.attendanceHistory) {
            g.attendanceHistory.forEach(h => {
                const dateStr = (h.date || '').split('T')[0];
                if (!dateStr) return;
                if (h.attendeeIds) {
                    h.attendeeIds.forEach(pid => {
                        const existing = personFirstGroupDate.get(pid);
                        if (!existing || dateStr < existing) {
                            personFirstGroupDate.set(pid, dateStr);
                        }
                    });
                }
            });
        }
    });

    if (people) {
        people.forEach(p => {
            if (p.id && (p.joinedAt || p.createdAt)) {
                const inGroup = groups.some(g => g.memberIds?.includes(p.id));
                if (inGroup) {
                    const dateStr = (p.joinedAt || p.createdAt || '').split('T')[0];
                    if (dateStr) {
                        const existing = personFirstGroupDate.get(p.id);
                        if (!existing || dateStr < existing) {
                            personFirstGroupDate.set(p.id, dateStr);
                        }
                    }
                }
            }
        });
    }

    const now = new Date();
    const thisMonthStr = now.toISOString().substring(0, 7);
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = lastMonthDate.toISOString().substring(0, 7);

    const monthlyCounts = new Map<string, number>();

    personFirstGroupDate.forEach((dateStr) => {
        const monthKey = dateStr.substring(0, 7);
        if (monthKey.length === 7) {
            monthlyCounts.set(monthKey, (monthlyCounts.get(monthKey) || 0) + 1);
        }
    });

    const thisMonthCount = monthlyCounts.get(thisMonthStr) || 0;
    const lastMonthCount = monthlyCounts.get(lastMonthStr) || 0;

    let growthRate = '0%';
    if (lastMonthCount > 0) {
        const rate = ((thisMonthCount - lastMonthCount) / lastMonthCount) * 100;
        growthRate = `${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%`;
    } else if (thisMonthCount > 0) {
        growthRate = '+100%';
    }

    const monthlyTrend: { month: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toISOString().substring(0, 7);
        const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        monthlyTrend.push({
            month: label,
            count: monthlyCounts.get(key) || 0
        });
    }

    return {
        thisMonthCount,
        lastMonthCount,
        growthRate,
        monthlyTrend
    };
};

export const calculateNewServiceEngagements = (
    checkIns: PcoCheckInRecord[] = [],
    plans: ServicePlanSnapshot[] = [],
    people: PcoPerson[] = []
): NewEngagementSummary => {
    const personFirstServiceDate = new Map<string, string>();

    if (checkIns) {
        checkIns.forEach(ci => {
            if (ci.personId && ci.createdAt) {
                const dateStr = ci.createdAt.split('T')[0];
                if (dateStr) {
                    const existing = personFirstServiceDate.get(ci.personId);
                    if (!existing || dateStr < existing) {
                        personFirstServiceDate.set(ci.personId, dateStr);
                    }
                }
            }
        });
    }

    if (plans) {
        plans.forEach(plan => {
            const dateStr = (plan.sortDate || '').split('T')[0];
            if (!dateStr) return;
            if (plan.teamMembers) {
                plan.teamMembers.forEach(item => {
                    if (item.personId) {
                        const existing = personFirstServiceDate.get(item.personId);
                        if (!existing || dateStr < existing) {
                            personFirstServiceDate.set(item.personId, dateStr);
                        }
                    }
                });
            }
        });
    }

    const now = new Date();
    const thisMonthStr = now.toISOString().substring(0, 7);
    const lastMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthStr = lastMonthDate.toISOString().substring(0, 7);

    const monthlyCounts = new Map<string, number>();

    personFirstServiceDate.forEach((dateStr) => {
        const monthKey = dateStr.substring(0, 7);
        if (monthKey.length === 7) {
            monthlyCounts.set(monthKey, (monthlyCounts.get(monthKey) || 0) + 1);
        }
    });

    const thisMonthCount = monthlyCounts.get(thisMonthStr) || 0;
    const lastMonthCount = monthlyCounts.get(lastMonthStr) || 0;

    let growthRate = '0%';
    if (lastMonthCount > 0) {
        const rate = ((thisMonthCount - lastMonthCount) / lastMonthCount) * 100;
        growthRate = `${rate >= 0 ? '+' : ''}${rate.toFixed(1)}%`;
    } else if (thisMonthCount > 0) {
        growthRate = '+100%';
    }

    const monthlyTrend: { month: string; count: number }[] = [];
    for (let i = 11; i >= 0; i--) {
        const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
        const key = d.toISOString().substring(0, 7);
        const label = d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' });
        monthlyTrend.push({
            month: label,
            count: monthlyCounts.get(key) || 0
        });
    }

    return {
        thisMonthCount,
        lastMonthCount,
        growthRate,
        monthlyTrend
    };
};

export const calculateGroupsDashboardData = (
    groups: PcoGroup[],
    people: PcoPerson[]
): GroupsDashboardData => {
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
        progressStats: { thisMonth: attendedThisMonth.size, lastMonth: attendedLastMonth.size },
        newEngagementsStats: calculateNewGroupEngagements(groups, people)
    };
};

export const calculateMembershipHistory = (
    people: PcoPerson[],
    statusChanges: StatusChangeRecord[] = [],
    timeFilter: MembershipTimeFilter = '1y'
): MembershipHistoryData => {
    const now = new Date();
    let startDate = new Date();

    if (timeFilter === '3m') {
        startDate.setMonth(now.getMonth() - 3);
    } else if (timeFilter === '6m') {
        startDate.setMonth(now.getMonth() - 6);
    } else if (timeFilter === '1y') {
        startDate.setMonth(now.getMonth() - 12);
    } else if (timeFilter === '3y') {
        startDate.setMonth(now.getMonth() - 36);
    } else {
        // 'all'
        const earliestChange = statusChanges.reduce((min, c) => Math.min(min, c.timestamp || Date.now()), Date.now());
        const earliestCreated = people.reduce((min, p) => {
            const d = p.createdAt ? new Date(p.createdAt).getTime() : Date.now();
            return !isNaN(d) ? Math.min(min, d) : min;
        }, Date.now());
        const earliestTime = Math.min(earliestChange, earliestCreated);
        startDate = new Date(Math.max(earliestTime, new Date('2015-01-01').getTime()));
    }

    startDate.setDate(1);
    startDate.setHours(0, 0, 0, 0);

    const isMemberValue = (v: string | null | undefined): boolean => {
        if (!v) return false;
        const norm = v.trim().toLowerCase();
        return norm === 'member' || norm === 'official member' || norm === 'covenant member';
    };

    // Filter relevant status/membership changes
    const memberChanges = statusChanges.filter(c => {
        return c.type === 'membership' || isMemberValue(c.oldValue) || isMemberValue(c.newValue);
    });

    // Build timeline transitions
    const transitionItems: MembershipTransitionItem[] = [];
    const breakdownCounts: Record<string, { count: number; type: 'inflow' | 'outflow' | 'internal' }> = {};

    memberChanges.forEach(c => {
        const wasMember = isMemberValue(c.oldValue);
        const isMember = isMemberValue(c.newValue);
        let transType: 'joined' | 'departed' | 'status_change' = 'status_change';

        if (!wasMember && isMember) {
            transType = 'joined';
        } else if (wasMember && !isMember) {
            transType = 'departed';
        }

        const label = `${c.oldValue || 'None'} → ${c.newValue || 'None'}`;
        if (!breakdownCounts[label]) {
            breakdownCounts[label] = {
                count: 0,
                type: transType === 'joined' ? 'inflow' : transType === 'departed' ? 'outflow' : 'internal'
            };
        }
        breakdownCounts[label].count++;

        transitionItems.push({
            id: c.id,
            personId: c.personId,
            personName: c.personName || 'Unknown Person',
            date: c.date,
            type: transType,
            oldValue: c.oldValue,
            newValue: c.newValue,
            timestamp: c.timestamp || (c.date ? new Date(c.date).getTime() : Date.now())
        });
    });

    // Also include new people created with membership status if not already recorded in statusChanges
    const personIdsWithStatusChange = new Set(statusChanges.map(s => s.personId));
    people.forEach(p => {
        if (isMemberValue(p.membership) && p.createdAt && !personIdsWithStatusChange.has(p.id)) {
            const createdMs = new Date(p.createdAt).getTime();
            if (!isNaN(createdMs)) {
                transitionItems.push({
                    id: `created_${p.id}`,
                    personId: p.id,
                    personName: p.name || `${p.firstName || ''} ${p.lastName || ''}`.trim() || 'Unknown',
                    date: p.createdAt,
                    type: 'joined',
                    oldValue: 'New Profile',
                    newValue: p.membership || 'Member',
                    timestamp: createdMs
                });
                const label = `New Profile → ${p.membership || 'Member'}`;
                if (!breakdownCounts[label]) {
                    breakdownCounts[label] = { count: 0, type: 'inflow' };
                }
                breakdownCounts[label].count++;
            }
        }
    });

    // Sort transitions newest first
    transitionItems.sort((a, b) => b.timestamp - a.timestamp);

    // Current known active members
    const currentMembers = people.filter(p => isMemberValue(p.membership) || isMemberValue(p.status)).length;

    // Generate monthly sequence
    const monthlyPoints: MembershipMonthlyPoint[] = [];
    let curMonth = new Date(startDate);
    const endMonth = new Date(now.getFullYear(), now.getMonth(), 1);

    // Map transitions to ISO month
    const joinsByMonth: Record<string, number> = {};
    const departsByMonth: Record<string, number> = {};

    transitionItems.forEach(t => {
        if (t.type === 'joined') {
            const key = toDateStr(new Date(t.timestamp)).slice(0, 7);
            joinsByMonth[key] = (joinsByMonth[key] || 0) + 1;
        } else if (t.type === 'departed') {
            const key = toDateStr(new Date(t.timestamp)).slice(0, 7);
            departsByMonth[key] = (departsByMonth[key] || 0) + 1;
        }
    });

    // Build forward tracking
    const monthKeys: string[] = [];
    while (curMonth <= endMonth) {
        const isoMonth = `${curMonth.getFullYear()}-${pad2(curMonth.getMonth() + 1)}`;
        monthKeys.push(isoMonth);
        curMonth.setMonth(curMonth.getMonth() + 1);
    }

    // Calculate total net additions from the end to compute past months:
    let runningTotal = currentMembers;
    const totalsByMonth: Record<string, number> = {};

    for (let i = monthKeys.length - 1; i >= 0; i--) {
        const iso = monthKeys[i];
        totalsByMonth[iso] = runningTotal;
        const joined = joinsByMonth[iso] || 0;
        const departed = departsByMonth[iso] || 0;
        const netChange = joined - departed;
        runningTotal = Math.max(0, runningTotal - netChange);
    }

    let joinedInPeriod = 0;
    let departedInPeriod = 0;

    monthKeys.forEach(iso => {
        const [y, m] = iso.split('-').map(Number);
        const d = new Date(y, m - 1, 1);
        const joined = joinsByMonth[iso] || 0;
        const departed = departsByMonth[iso] || 0;
        joinedInPeriod += joined;
        departedInPeriod += departed;
        monthlyPoints.push({
            month: d.toLocaleDateString('en-US', { month: 'short', year: 'numeric' }),
            isoMonth: iso,
            totalMembers: totalsByMonth[iso] || currentMembers,
            joined,
            departed,
            netChange: joined - departed
        });
    });

    const startTotal = monthlyPoints.length > 0 ? (monthlyPoints[0].totalMembers - monthlyPoints[0].netChange) : currentMembers;
    const netGrowthInPeriod = joinedInPeriod - departedInPeriod;
    const netGrowthRatePercent = startTotal > 0 ? Math.round((netGrowthInPeriod / startTotal) * 100) : 0;
    const retentionRatePercent = (startTotal + joinedInPeriod) > 0
        ? Math.round((1 - (departedInPeriod / (startTotal + joinedInPeriod))) * 100)
        : 100;

    const breakdowns: MembershipTransitionBreakdown[] = Object.entries(breakdownCounts)
        .map(([name, info]) => ({ name, count: info.count, type: info.type }))
        .sort((a, b) => b.count - a.count);

    // Filter transitions within time window
    const startTimeMs = startDate.getTime();
    const filteredTransitions = transitionItems.filter(t => t.timestamp >= startTimeMs);

    return {
        timeFilter,
        chartPoints: monthlyPoints,
        stats: {
            currentMembers,
            joinedInPeriod,
            departedInPeriod,
            netGrowthInPeriod,
            netGrowthRatePercent,
            retentionRatePercent: Math.max(0, Math.min(100, retentionRatePercent))
        },
        breakdowns,
        transitions: filteredTransitions
    };
};
