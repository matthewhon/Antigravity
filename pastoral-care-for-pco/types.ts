
export type UserRole = 'Church Admin' | 'Pastor' | 'Pastor AI' | 'People' | 'Services' | 'Groups' | 'Giving' | 'Finance' | 'Pastoral Care' | 'Metrics' | 'System Administration';

export interface User {
    id: string;
    churchId: string;
    name: string;
    email: string;
    roles: UserRole[];
    lastLogin?: number;
    widgetPreferences?: Record<string, string[]>;
    theme?: 'traditional' | 'dark';
}

export interface RiskSettings {
    weights: { attendance: number, groups: number, serving: number, giving: number, membership: number };
    thresholds: { healthyMin: number, atRiskMin: number };
}

export interface ChurchRiskSettings {
    weights: { attendance: number, budget: number, newProfiles: number, groups: number, serving: number };
    thresholds: { healthyMin: number, atRiskMin: number };
}

export interface GroupRiskSettings {
    weights: { 
        attendanceConsistency: number; 
        retention: number; 
        leadershipSpan: number; 
        engagement: number; 
    };
    thresholds: { 
        thrivingMin: number; // 80-100
        warningMin: number;  // 60-79 (Below this is Critical)
    };
}

export interface DonorLifecycleSettings {
    newDonorDays: number;
    activeWindowDays: number;
    activeMinGifts: number;
    occasionalWindowDays: number;
    lapsedWindowDays: number;
    recoveredGapDays: number;
}

export interface CommunityLocation {
    id: string;
    name: string;
    city: string;
    state: string;
    zip?: string;
    isDefault: boolean;
}

export interface Church {
    id: string;
    name: string;
    subdomain: string;
    pcoConnected: boolean;
    lastSyncTimestamp?: number | null;
    pcoClientId?: string;
    pcoClientSecret?: string;
    pcoAccessToken?: string | null;
    pcoRefreshToken?: string | null;
    pcoTokenExpiry?: number;
    googleMapsApiKey?: string;
    censusApiKey?: string;
    censusCache?: any;
    enabledWidgets?: string[] | null;
    riskSettings?: RiskSettings;
    churchRiskSettings?: ChurchRiskSettings;
    groupRiskSettings?: GroupRiskSettings;
    donorLifecycleSettings?: DonorLifecycleSettings;
    subscription?: { status: string, planId: string, currentPeriodEnd?: number, customerId?: string };
    metricsSettings?: { showCensusWidgets?: boolean, showCityPenetration?: boolean, showMissionalGap?: boolean, dashboardOrder?: string[] };
    address?: string;
    city?: string;
    state?: string;
    zip?: string;
    phone?: string;
    website?: string;
    email?: string;
    trialEndsAt?: number;
    primaryContact?: string;
    metricsSharingEnabled?: boolean;
    allowSignups?: boolean;
    scheduledSyncTime?: string;
    communityLocations?: CommunityLocation[];
}

export interface AttendanceData {
    date: string;
    attendance: number;
    newComers?: number;
}

export interface GivingData {
    month: string;
    amount: number;
    donors: number;
}

export interface DemographicData {
    name: string;
    value: number;
}

export interface RiskProfile {
    score: number;
    category: 'Healthy' | 'At Risk' | 'Disconnected';
    factors: string[];
}

export interface PcoPerson {
    id: string;
    churchId: string;
    name: string;
    email?: string;
    phone?: string;
    avatar?: string | null;
    membership?: string | null;
    status?: string | null;
    gender?: string | null;
    birthdate?: string | null;
    anniversary?: string | null;
    salvationDate?: string | null;
    baptismDate?: string | null;
    createdAt: string;
    addresses?: { city?: string, state?: string, zip?: string, location?: string }[];
    checkInCount?: number;
    householdId?: string;
    householdName?: string;
    groupIds?: string[];
    lastUpdated?: number;
    riskProfile?: RiskProfile;
    isDonor?: boolean;
    engagementStatus?: string;
    spiritualMilestones?: {
        salvationDate?: string | null;
        baptismDate?: string | null;
        isBaptizedAfterSalvation?: boolean;
    };
    age?: number;
    givingStats?: {
        weekly: number;
        monthly: number;
        quarterly: number;
        ytd: number;
        lastUpdated: number;
    };
    servingStats?: {
        last90DaysCount: number;
        riskLevel: 'Low' | 'Medium' | 'High';
        nextServiceDate?: string;
    };
    field_data?: { field_definition: { name: string }, value: string }[];
}

export interface PcoGroup {
    id: string;
    churchId: string;
    name: string;
    groupTypeName: string;
    membersCount: number;
    isPublic: boolean;
    createdAt: string;
    archivedAt?: string | null;
    lastUpdated: number;
    leaderIds?: string[];
    memberIds?: string[];
    attendanceHistory?: { eventId: string, date: string, count: number, members: number, visitors: number, attendeeIds: string[] }[];
}

export interface PeopleDashboardData {
    stats: { total: number, members: number, nonMembers: number, newThisMonth: number, households: number };
    genderData: DemographicData[];
    membershipData: DemographicData[];
    ageData: { range: string, count: number }[];
    engagementData: DemographicData[];
    upcomingBirthdays: PcoPerson[];
    upcomingAnniversaries: PcoPerson[];
    recentPeople: PcoPerson[];
    geoData: { byCity: {name: string, value: number}[], byZip: {name: string, value: number}[] };
    allPeople: PcoPerson[];
    householdStats?: { totalHouseholds: number, pcoHouseholds: number, avgSize: number, sizeDistribution: any[], composition: any[], householdList: any[] };
}

export interface GroupsDashboardData {
    stats: { totalGroups: number, totalEnrollment: number, averageGroupSize: number, publicGroups: number };
    groupsByType: { name: string, value: number }[];
    groupsByDay: any[];
    allGroups: PcoGroup[];
    recentGroups: PcoGroup[];
    genderDistribution?: DemographicData[];
}

export interface LifecycleDonor {
    id: string;
    name: string;
    totalAmount: number;
    avgMonthlyAmount: number;
    lastGiftDate: string;
    avatar?: string | null;
    riskProfile?: RiskProfile;
}

export interface GivingAnalytics {
    totalGiving: number;
    previousTotalGiving: number;
    contributingPeople: number;
    previousContributingPeople: number;
    recurringGivers: number;
    previousRecurringGivers: number;
    averageGift: number;
    previousAverageGift: number;
    medianGift: number;
    givingByFund: { name: string, value: number }[];
    trends: { date: string, amount: number }[];
    comparisonTrends: { label: string, current: number, previous: number }[];
    donorLifecycle: { new: number, active: number, lapsed: number, recovered: number, occasional: number, inactive: number, secondTime: number };
    lists: { new: LifecycleDonor[], active: LifecycleDonor[], lapsed: LifecycleDonor[], recovered: LifecycleDonor[], occasional: LifecycleDonor[], inactive: LifecycleDonor[], secondTime: LifecycleDonor[] };
    topGiversList: any[];
    atRiskGiversList: any[];
    topGiverConcentration: number;
}

export interface ServicePlanSnapshot {
    id: string;
    churchId: string;
    serviceTypeId?: string;
    sortDate: string;
    seriesTitle?: string;
    serviceTypeName?: string;
    teamMembers?: { 
        teamName: string; 
        teamId?: string; 
        personId: string; 
        status: string; 
        teamPositionName?: string;
        name?: string;
        photoThumbnail?: string;
    }[];
    items?: { type: string; title: string; author?: string; item_type?: string }[];
    planTimes?: { id: string; startsAt: string; endsAt: string }[];
    positionsFilled?: number;
    positionsNeeded?: number;
    isUnderstaffed?: boolean;
    neededPositions?: { teamName: string; quantity: number }[];
    planNotes?: { category: string; content: string }[];
}

export interface ServicesTeam {
    id: string;
    churchId: string;
    name: string;
    serviceTypeId?: string;
    serviceTypeName?: string;
    memberIds: string[];
    leaderPersonIds: string[];
    leaderCount: number;
    scheduledMemberIds?: string[];
    positionCount?: number;
}

export interface SongUsage {
    id: string;
    title: string;
    author: string;
    count: number;
}

export interface ServicesDashboardData {
    stats: { totalPlans: number, uniqueVolunteers: number, positionsFilled: number, positionsOpen: number, fillRate: number };
    topSongs: SongUsage[];
    teamStats: any;
    teams: ServicesTeam[];
    checkIns: { totalCheckIns: number, uniqueAttendees: number, breakdown: any, trends: any[] };
    futurePlans: ServicePlanSnapshot[];
    recentPlans?: ServicePlanSnapshot[];
}

export interface CensusStats {
    locationName: string;
    totalPopulation: number;
    economics?: { medianHouseholdIncome: number, povertyRate: number, unemploymentRate: number };
    demographics?: { medianAge: number, marriedPop: number, nonEnglishPrimary: number };
    ethnicity?: { white: number, black: number, hispanic: number, asian: number, other: number };
    gender?: { male: number, female: number };
    age?: { under18: number, youngAdults: number, adults: number, seniors: number };
    housing?: { ownerOccupied: number, vacancyRate: number, totalHousing: number, totalHouseholds: number };
    education?: { bachelorsPlus: number };
    commute?: { longCommuteRate: number, veryLongCommuteRate: number };
    families?: { totalFamilies: number, singleParentRate: number, singleMotherRate: number, singleFatherRate: number };
}

export interface GeoInsight {
    text: string;
    mapLinks: { title: string, uri: string }[];
}

export interface BudgetRecord {
    id: string;
    churchId: string;
    year: number;
    fundName: string;
    totalAmount: number;
    monthlyAmounts: number[];
    isActive: boolean;
}

export interface PcoFund {
    id: string;
    churchId: string;
    name: string;
}

export interface DetailedDonation {
    id: string;
    churchId: string;
    amount: number;
    date: string;
    fundName: string;
    fundId?: string;
    donorId: string;
    donorName: string;
    isRecurring: boolean;
}

export interface AttendanceEventSummary {
    id: string;
    name: string;
    startsAt: string;
    guests: number;
    regulars: number;
    volunteers: number;
    headcount: number;
    digitalCheckins: number;
    customHeadcounts: { name: string; total: number }[];
    total: number;
}

export interface CheckInRecord {
    id: string;
    churchId: string;
    personId: string;
    eventId: string;
    date: string;
    createdAt: string;
    checkedInAt: string;
    securityCode?: string;
    kind: 'Regular' | 'Guest' | 'Volunteer';
}

export interface AttendanceRecord {
    id: string;
    churchId: string;
    date: string;
    count: number;          // Grand total: digital check-ins + all headcounts
    guests?: number;        // Standard: Guest headcount
    regulars?: number;      // Standard: Regular headcount
    volunteers?: number;    // Standard: Volunteer headcount
    headcount?: number;     // Legacy / unlabeled manual headcount
    digitalCheckins?: number; // People who actually checked in via PCO Check-Ins app
    customHeadcounts?: { name: string; total: number }[]; // Custom attendance types
    events?: AttendanceEventSummary[];
}

export interface GivingRecord {
    id: string;
    churchId: string;
    month: string;
    amount: number;
    donors: number;
}

export interface SystemSettings {
    apiBaseUrl?: string;
    pcoClientId?: string;
    pcoClientSecret?: string;
    googleMapsApiKey?: string;
    censusApiKey?: string;
    stripePublishableKey?: string;
    stripeSecretKey?: string;
    stripeWebhookSecret?: string;
    stripePriceIds?: { starter?: string, growth?: string, kingdom?: string };
    enabledModules?: { pastoral: boolean, people: boolean, groups: boolean, services: boolean, giving: boolean, metrics: boolean, communication: boolean };
    allowSignups?: boolean;
    scheduledSyncTime?: string;
    // SendGrid Email Delivery
    sendGridApiKey?: string;
    sendGridFromEmail?: string; // Must be a verified sender in SendGrid (e.g. hello@mychurch.org)
    sendGridFromName?: string;  // Default "From Name" if campaign doesn't specify one
    // Scripture Library feature flag
    enableLibrary?: boolean;
}

export interface TemplateSettings {
    primaryColor: string;
    textColor: string;
    backgroundColor: string;
    linkColor: string;
    fontFamily: string;
    header: string;
    footer: string;
    // Social media
    showSocialLinks?: boolean;
    facebookUrl?: string;
    youtubeUrl?: string;
    instagramUrl?: string;
    twitterUrl?: string;
}

export interface PcoList {
    id: string;
    name: string;
    totalPeople: number;
    status: string;
}

export type EmailCampaignStatus = 'draft' | 'scheduled' | 'sent' | 'failed';

export interface EmailCampaign {
    id: string;
    churchId: string;
    name: string;
    status: EmailCampaignStatus;
    // Recipients
    toListId?: string;
    toListName?: string;
    // Sender
    fromName?: string;
    fromEmail?: string;
    replyTo?: string;
    // Content
    subject?: string;
    blocks?: any[];
    templateSettings?: TemplateSettings;
    // Scheduling
    sendAt?: string | null;         // ISO string display value set by UI
    scheduledAt?: number | null;    // Epoch ms — authoritative trigger for the scheduler
    sentAt?: number | null;
    // Analytics refresh tracking
    analyticsRefreshedAt?: number | null;
    // Retry logic
    retryCount?: number;            // How many send attempts have been made
    lastError?: string | null;      // Last failure message (shown in UI)
    // Metadata
    createdAt: number;
    updatedAt: number;
}

export interface Ministry {
    id: string;
    churchId: string;
    name: string;
    isActive: boolean;
}

export interface MetricDefinition {
    id: string;
    churchId: string;
    ministryId: string;
    name: string;
    type: 'number' | 'currency';
    isActive: boolean;
}

export interface MetricEntry {
    id: string;
    churchId: string;
    date: string;
    ministryId: string;
    values: Record<string, number>;
    updatedAt: number;
    updatedBy: string;
}

export interface LogEntry {
    id: string;
    churchId: string;
    timestamp: number;
    level: 'info' | 'warn' | 'error';
    /** Which subsystem generated this log: sync, webhook, proxy, auth, app, system */
    source?: 'sync' | 'webhook' | 'proxy' | 'auth' | 'app' | 'system';
    message: string;
    /** JSON-serialized context object for quick display */
    details?: string;
    /** Structured metadata for programmatic filtering (e.g. { endpoint, statusCode, retryCount }) */
    context?: Record<string, any>;
}

export interface GlobalStats {
    churchId: string;
    updatedAt: number;
    metrics: { 
        avgWeeklyGiving: number; 
        avgHouseholdSize: number; 
        avgGroupAttendance: number; 
        maleFemaleRatio: number; 
        serviceTeamSize: number; 
        ageDistribution: Record<string, number>;
        avgGiftByAge: Record<string, number>;
    };
}

export type AggregatedChurchStats = GlobalStats;

export interface WidgetDefinition {
    id: string;
    label: string;
    icon: string;
}

export interface PastoralNote {
    id: string;
    churchId: string;
    personId: string;
    personName: string;
    authorId: string;
    authorName: string;
    date: string;
    type: 'Visit' | 'Call' | 'Meeting' | 'Note' | 'Crisis' | 'Hospital';
    content: string;
    followUpDate?: string;
    isCompleted: boolean;
    tags?: string[];
}

export interface PrayerRequest {
    id: string;
    churchId: string;
    personId?: string;
    personName: string;
    request: string;
    date: string;
    status: 'Active' | 'Answered' | 'Archived';
    isPublic: boolean;
    category?: string;
}

export type ServicesFilter = 'Week' | 'Month' | 'Quarter' | 'Year' | 'Next Week' | 'Next Month';
export type GivingFilter = 'Week' | 'This Week' | 'Month' | 'This Month' | 'Last Month' | 'Quarter' | 'This Quarter' | 'Year' | 'This Year' | 'Custom';

export interface AggregatedGivingMetric {
    churchId: string;
    month: string; // YYYY_MM format
    totalAmount: number;
    donationCount: number;
    funds: Record<string, number>;
    lastUpdated?: any;
}
