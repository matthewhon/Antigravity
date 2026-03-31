
import { DetailedDonation, PcoPerson, DonorLifecycleSettings, GivingAnalytics, LifecycleDonor, GivingFilter, ServicePlanSnapshot, ServicesTeam, AttendanceRecord, ServicesFilter, ServicesDashboardData, SongUsage, AggregatedChurchStats, PcoGroup, GlobalStats } from '../types';

const ONE_DAY = 24 * 60 * 60 * 1000;

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

    const currentPeriodDonations = donations.filter(d => {
        const dDate = new Date(d.date);
        return dDate >= startDate && dDate <= endDate;
    });

    const previousPeriodDonations = donations.filter(d => {
        const dDate = new Date(d.date);
        return dDate >= previousStartDate && dDate <= previousEndDate;
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
        const dDate = new Date(d.date);
        let key = '';
        if (filter === 'Year' || filter === 'Quarter' || filter === 'This Year' || filter === 'This Quarter') {
            key = dDate.toISOString().slice(0, 7); 
        } else {
            key = dDate.toISOString().slice(0, 10); 
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

    const getBucketIndex = (date: Date, start: Date): number => {
        const diffTime = date.getTime() - start.getTime();
        
        if (bucketType === 'month') {
            return (date.getFullYear() - start.getFullYear()) * 12 + (date.getMonth() - start.getMonth());
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
        const idx = getBucketIndex(new Date(d.date), startDate);
        if (comparisonMap.has(idx)) {
            comparisonMap.get(idx)!.current += d.amount;
        }
    });

    previousPeriodDonations.forEach(d => {
        const idx = getBucketIndex(new Date(d.date), previousStartDate);
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

        const totalAmount = gifts.reduce((sum, g) => sum + g.amount, 0);
        // Calculate avg monthly: spread total giving across distinct calendar months
        const distinctMonths = new Set(gifts.map(g => g.date.slice(0, 7))).size;
        const avgMonthlyAmount = distinctMonths > 0 ? totalAmount / distinctMonths : totalAmount;

        const donorObj: LifecycleDonor = {
            id: donorId,
            name: resolvedName,
            totalAmount,
            avgMonthlyAmount,
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
    
    const trailingYearTotals = new Map<string, number>();
    donations.filter(d => new Date(d.date) >= trailingYearStart).forEach(d => {
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
    const givingThisMonth = new Set(donations.filter(d => {
        const dDate = new Date(d.date);
        return dDate >= thirtyDaysAgo && dDate <= now;
    }).map(d => d.donorId)).size;
    const givingLastMonth = new Set(donations.filter(d => {
        const dDate = new Date(d.date);
        return dDate >= sixtyDaysAgo && dDate < thirtyDaysAgo;
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
    filter: ServicesFilter
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

    const topSongs = Array.from(songUsage.values()).sort((a,b) => b.count - a.count).slice(0, 5);

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
        progressStats: { thisMonth: servingThisMonth.size, lastMonth: servingLastMonth.size }
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
    
    const recentDonations = donations.filter(d => new Date(d.date) >= twelveWeeksAgo);
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
    
    const yearDonations = donations.filter(d => new Date(d.date) >= oneYearAgo);
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
