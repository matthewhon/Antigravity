
import { PcoPerson, DetailedDonation, PcoGroup, ServicePlanSnapshot, RiskSettings, RiskProfile, ServicesTeam, ChurchRiskSettings, PeopleDashboardData, GivingAnalytics, GroupsDashboardData, ServicesDashboardData, AttendanceData, BudgetRecord, GroupRiskSettings } from '../types';

export const DEFAULT_RISK_SETTINGS: RiskSettings = {
    weights: {
        attendance: 30,
        groups: 25,
        serving: 20,
        giving: 15,
        membership: 10
    },
    thresholds: {
        healthyMin: 70,
        atRiskMin: 40
    },
    targets: {
        serving90Days: 4
    }
};

export const DEFAULT_CHURCH_RISK_SETTINGS: ChurchRiskSettings = {
    weights: {
        attendance: 30,
        budget: 25,
        newProfiles: 15,
        groups: 15,
        serving: 15
    },
    thresholds: {
        healthyMin: 75,
        atRiskMin: 50
    }
};

export const DEFAULT_GROUP_RISK_SETTINGS: GroupRiskSettings = {
    weights: {
        attendanceConsistency: 40,
        retention: 25,
        leadershipSpan: 20,
        engagement: 15
    },
    thresholds: {
        thrivingMin: 80,
        warningMin: 60
    }
};

const calculatePersonRisk = (
    person: PcoPerson, 
    settings: RiskSettings, 
    context: { isDonor: boolean, isGroupMember: boolean, timesServed: number }
): RiskProfile => {
    let score = 0;
    const factors: string[] = [];

    // 1. Attendance (Check-ins)
    // Normalized: >8 is Core (100%), >2 is Regular (70%), else low
    const checkIns = person.checkInCount || 0;
    let attendanceScore = 0;
    if (checkIns >= 8) attendanceScore = 1;
    else if (checkIns >= 3) attendanceScore = 0.7;
    else if (checkIns >= 1) attendanceScore = 0.3;
    
    score += attendanceScore * settings.weights.attendance;
    if (attendanceScore < 0.3) factors.push('Low Attendance');

    // 2. Groups
    const groupScore = context.isGroupMember ? 1 : 0;
    score += groupScore * settings.weights.groups;
    if (!context.isGroupMember) factors.push('Not in Group');

    // 3. Serving
    const targetServing = settings.targets?.serving90Days || 4;
    let servingScore = 0;
    if (context.timesServed >= targetServing) servingScore = 1;
    else if (context.timesServed > 0) servingScore = context.timesServed / targetServing;
    
    score += servingScore * settings.weights.serving;
    if (context.timesServed === 0) factors.push('Not Serving');

    // 4. Giving
    const givingScore = context.isDonor ? 1 : 0;
    score += givingScore * settings.weights.giving;
    
    // 5. Membership
    const isMember = person.membership === 'Member';
    score += (isMember ? 1 : 0) * settings.weights.membership;

    // Categorize
    let category: 'Healthy' | 'At Risk' | 'Disconnected' = 'Disconnected';
    if (score >= settings.thresholds.healthyMin) category = 'Healthy';
    else if (score >= settings.thresholds.atRiskMin) category = 'At Risk';

    return {
        score: Math.round(score),
        category,
        factors
    };
};

export const calculateBulkRisk = (
    people: PcoPerson[],
    donations: DetailedDonation[],
    groups: PcoGroup[],
    plans: ServicePlanSnapshot[],
    teams: ServicesTeam[],
    settings: RiskSettings
): PcoPerson[] => {
    // Pre-process context data for speed
    const donorIds = new Set(donations.map(d => d.donorId));
    
    // Determine volunteers based strictly on recent plan scheduling (confirmed positions)
    const volunteerCounts = new Map<string, number>();
    
    // Add recent plan participants (last 3 months)
    // STRICT RULE: Only count if they have a 'Confirmed' status on the plan and it occurred in the last 90 days
    const now = new Date();
    const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const recentPlans = plans.filter(p => {
        const d = new Date(p.sortDate);
        return d >= ninetyDaysAgo && d <= now;
    });
    
    recentPlans.forEach(p => {
        p.teamMembers?.forEach(tm => {
            const status = tm.status?.toLowerCase() || '';
            if (tm.personId && (status === 'confirmed' || status === 'c')) {
                volunteerCounts.set(tm.personId, (volunteerCounts.get(tm.personId) || 0) + 1);
            }
        });
    });

    return people.map(person => {
        const isDonor = donorIds.has(person.id);
        const timesServed = volunteerCounts.get(person.id) || 0;
        const isGroupMember = !!(person.groupIds && person.groupIds.length > 0);

        const profile = calculatePersonRisk(person, settings, { isDonor, isGroupMember, timesServed });
        
        // Calculate Engagement Status based on checkInCount
        const count = person.checkInCount || 0;
        let engagementStatus = 'Inactive';
        if (count > 8) engagementStatus = 'Core';
        else if (count >= 4) engagementStatus = 'Regular';
        else if (count > 0) engagementStatus = 'Sporadic';

        const timesPerWeek = timesServed / (90 / 7);

        return {
            ...person,
            riskProfile: profile,
            isDonor, // Flag person as donor for frontend filtering
            engagementStatus,
            servingStats: {
                ...person.servingStats,
                last90DaysCount: timesServed,
                timesPerWeek: Number(timesPerWeek.toFixed(2)),
                riskLevel: person.servingStats?.riskLevel || 'High',
                nextServiceDate: person.servingStats?.nextServiceDate
            }
        };
    });
};

export const calculateChurchRisk = (
    settings: ChurchRiskSettings = DEFAULT_CHURCH_RISK_SETTINGS,
    people: PeopleDashboardData | null,
    giving: GivingAnalytics | null,
    groups: GroupsDashboardData | null,
    services: ServicesDashboardData | null,
    attendance: AttendanceData[],
    budgets: BudgetRecord[]
) => {
    let rawScore = 0;
    const factors: { name: string, score: number, weight: number, status: 'good' | 'warning' | 'critical', label: string }[] = [];

    // 1. Attendance Factor
    // Logic: Trend of last 4 weeks vs previous 4 weeks
    const sortedAtt = [...attendance].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime());
    let attScore = 0;
    let attLabel = 'No Data';
    if (sortedAtt.length >= 8) {
        const recent4 = sortedAtt.slice(-4).reduce((sum, a) => sum + a.attendance, 0) / 4;
        const prev4 = sortedAtt.slice(-8, -4).reduce((sum, a) => sum + a.attendance, 0) / 4;
        if (recent4 >= prev4) { attScore = 100; attLabel = 'Growing'; }
        else if (recent4 >= prev4 * 0.9) { attScore = 80; attLabel = 'Stable'; }
        else { attScore = 50; attLabel = 'Declining'; }
    } else {
        attScore = 75; // Neutral assumption if not enough data
        attLabel = 'Insufficient Data';
    }
    rawScore += (attScore * settings.weights.attendance) / 100;
    factors.push({ 
        name: 'Attendance', 
        score: attScore, 
        weight: settings.weights.attendance, 
        status: attScore >= 80 ? 'good' : attScore >= 60 ? 'warning' : 'critical',
        label: attLabel
    });

    // 2. Budget Factor
    // Logic: Total Giving vs Total Budget (YTD) or Giving Trend if no budget
    let budgetScore = 0;
    let budgetLabel = 'Stable';
    
    // Calculate Budget Total
    const currentYear = new Date().getFullYear();
    const activeBudgets = budgets.filter(b => b.year === currentYear && b.isActive);
    const totalBudget = activeBudgets.reduce((sum, b) => sum + b.totalAmount, 0);
    
    if (totalBudget > 0 && giving) {
        // Simple pro-ration: Compare total giving to total budget
        if (giving.totalGiving >= totalBudget) { budgetScore = 100; budgetLabel = 'On Target'; }
        else if (giving.totalGiving >= totalBudget * 0.8) { budgetScore = 80; budgetLabel = 'Near Target'; }
        else { budgetScore = 50; budgetLabel = 'Below Target'; }
    } else if (giving) {
        // Fallback to trend
        if (giving.totalGiving >= giving.previousTotalGiving) { budgetScore = 100; budgetLabel = 'Giving Up'; }
        else { budgetScore = 70; budgetLabel = 'Giving Down'; }
    }
    rawScore += (budgetScore * settings.weights.budget) / 100;
    factors.push({ 
        name: 'Budget Health', 
        score: budgetScore, 
        weight: settings.weights.budget, 
        status: budgetScore >= 80 ? 'good' : budgetScore >= 60 ? 'warning' : 'critical',
        label: budgetLabel
    });

    // 3. New Profiles (Growth)
    // Logic: New people this month > 1% of total population
    let growthScore = 0;
    let growthLabel = 'Stagnant';
    if (people && people.stats.total > 0) {
        const rate = (people.stats.newThisMonth / people.stats.total) * 100;
        if (rate >= 2.0) { growthScore = 100; growthLabel = 'High Growth'; }
        else if (rate >= 0.5) { growthScore = 80; growthLabel = 'Steady'; }
        else { growthScore = 50; growthLabel = 'Low Intake'; }
    }
    rawScore += (growthScore * settings.weights.newProfiles) / 100;
    factors.push({ 
        name: 'Acquisition', 
        score: growthScore, 
        weight: settings.weights.newProfiles, 
        status: growthScore >= 80 ? 'good' : growthScore >= 60 ? 'warning' : 'critical',
        label: growthLabel
    });

    // 4. Groups
    // Logic: >40% Participation
    let groupScore = 0;
    let groupLabel = 'Low';
    if (groups && people) {
        const rate = (groups.stats.totalEnrollment / people.stats.total) * 100;
        if (rate >= 50) { groupScore = 100; groupLabel = 'Connected'; }
        else if (rate >= 30) { groupScore = 80; groupLabel = 'Average'; }
        else { groupScore = 50; groupLabel = 'Disconnected'; }
    }
    rawScore += (groupScore * settings.weights.groups) / 100;
    factors.push({ 
        name: 'Community', 
        score: groupScore, 
        weight: settings.weights.groups, 
        status: groupScore >= 80 ? 'good' : groupScore >= 60 ? 'warning' : 'critical',
        label: groupLabel
    });

    // 5. Serving
    // Logic: Volunteer fill rate or unique volunteers %
    let serveScore = 0;
    let serveLabel = 'Low';
    if (services && people) {
        // Use fill rate if available, or volunteer ratio
        if (services.stats.fillRate > 90) { serveScore = 100; serveLabel = 'Fully Staffed'; }
        else if (services.stats.fillRate > 70) { serveScore = 80; serveLabel = 'Healthy'; }
        else { serveScore = 50; serveLabel = 'Needs Help'; }
    }
    rawScore += (serveScore * settings.weights.serving) / 100;
    factors.push({ 
        name: 'Volunteers', 
        score: serveScore, 
        weight: settings.weights.serving, 
        status: serveScore >= 80 ? 'good' : serveScore >= 60 ? 'warning' : 'critical',
        label: serveLabel
    });

    // Final Calc
    // Normalize to 0-100 based on total possible weight (should be 100, but handle variation)
    const totalWeight = Object.values(settings.weights).reduce((a: number, b: number) => a + b, 0);
    const finalScore = totalWeight > 0 ? (rawScore / totalWeight) * 100 : 0; 
    
    let category = 'Critical';
    let color = 'rose';
    if (rawScore >= settings.thresholds.healthyMin) { category = 'Thriving'; color = 'emerald'; }
    else if (rawScore >= settings.thresholds.atRiskMin) { category = 'Warning'; color = 'amber'; }

    return {
        score: Math.round(rawScore),
        category,
        color,
        factors
    };
};

export const calculateGroupHealth = (
    group: PcoGroup,
    settings: GroupRiskSettings,
    peopleMap: Map<string, PcoPerson>
) => {
    // 1. Attendance Consistency (40%)
    let attScore = 0;
    if (group.membersCount > 0 && group.attendanceHistory && group.attendanceHistory.length > 0) {
        const recentEvents = group.attendanceHistory.slice(0, 8); // Last 8 events
        const avgAtt = recentEvents.reduce((sum, e) => sum + e.count, 0) / recentEvents.length;
        const consistency = avgAtt / group.membersCount;
        
        if (consistency > 0.8) attScore = 100;
        else if (consistency > 0.6) attScore = 80;
        else if (consistency > 0.4) attScore = 60;
        else attScore = 40;
    } else if (group.membersCount === 0) {
        attScore = 100; // New/Empty group?
    }

    // 2. Retention (25%) - Proxy using Attendance Trend for now as turnover data is missing
    let retentionScore = 100; // Default optimistic
    // If attendance dropping significantly, penalize
    if (group.attendanceHistory && group.attendanceHistory.length >= 4) {
        const recent = group.attendanceHistory.slice(0, 4).reduce((s, e) => s + e.count, 0);
        const prev = group.attendanceHistory.slice(4, 8).reduce((s, e) => s + e.count, 0);
        if (prev > 0 && recent < prev * 0.8) retentionScore = 60; // 20% drop
    }

    // 3. Leadership Span (20%)
    let leaderScore = 0;
    const leaders = group.leaderIds?.length || 0;
    if (leaders > 0) {
        const ratio = group.membersCount / leaders;
        if (ratio <= 12) leaderScore = 100;
        else if (ratio <= 16) leaderScore = 80;
        else if (ratio <= 20) leaderScore = 60;
        else leaderScore = 40;
    } else {
        leaderScore = 0; // No leader is critical
    }

    // 4. Engagement (15%) - Serving Status
    let engagementScore = 0;
    if (group.memberIds && group.memberIds.length > 0) {
        let volunteers = 0;
        group.memberIds.forEach(mid => {
            const p = peopleMap.get(mid);
            // Check if person is 'Not Serving' flag is ABSENT from risk factors
            // Note: This relies on riskProfile being populated on peopleMap
            if (p && p.riskProfile && !p.riskProfile.factors.includes('Not Serving')) {
                volunteers++;
            }
        });
        const volRate = volunteers / group.memberIds.length;
        engagementScore = Math.min(100, volRate * 100 * 1.5); // Boost score slightly (66% volunteers = 100 score)
    }

    // Weighted Sum
    const totalWeight = settings.weights.attendanceConsistency + settings.weights.retention + settings.weights.leadershipSpan + settings.weights.engagement;
    const rawScore = totalWeight > 0 ? (
        (attScore * settings.weights.attendanceConsistency) +
        (retentionScore * settings.weights.retention) +
        (leaderScore * settings.weights.leadershipSpan) +
        (engagementScore * settings.weights.engagement)
    ) / totalWeight : 0;

    // RAG Status
    let status: 'Thriving' | 'Warning' | 'Critical' = 'Critical';
    if (rawScore >= settings.thresholds.thrivingMin) status = 'Thriving';
    else if (rawScore >= settings.thresholds.warningMin) status = 'Warning';

    return {
        score: Math.round(rawScore),
        status,
        breakdown: {
            attendance: attScore,
            retention: retentionScore,
            leadership: leaderScore,
            engagement: engagementScore
        }
    };
};
