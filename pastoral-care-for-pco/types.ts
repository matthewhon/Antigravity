
export type UserRole = 'Church Admin' | 'Pastor' | 'Pastor AI' | 'People' | 'Services' | 'Groups' | 'Giving' | 'Finance' | 'Pastoral Care' | 'Metrics' | 'System Administration' | 'Messaging';

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
    targets?: { serving90Days: number };
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
    /** SMS / Twilio settings for this church */
    smsSettings?: SmsSettings;
    /** Church-wide logo URL (stored in Firebase Storage, used as default in email templates) */
    logoUrl?: string;
    /** PCO List ID used to identify regular attenders of the church */
    regularAttendersListId?: string;
    /** Display name of the selected regular attenders PCO list */
    regularAttendersListName?: string;
    emailSettings?: {
        /** 'shared' = send from @pastoralcare.barnabassoftware.com; 'custom' = tenant's own domain */
        mode: 'shared' | 'custom';
        /** For 'shared' mode: the prefix before @pastoralcare.barnabassoftware.com, e.g. "grace" */
        sharedPrefix?: string;
        /** Full From email (computed): e.g. grace@pastoralcare.barnabassoftware.com or contact@mychurch.org */
        fromEmail?: string;
        /** Display name for the From field */
        fromName?: string;
        // Custom domain fields
        /** e.g. "mychurch.org" */
        customDomain?: string;
        /** SendGrid Domain Authentication ID for status checking */
        domainAuthId?: string;
        /** The 3 CNAME records the pastor must add to their DNS */
        cnameRecords?: { host: string; type: 'CNAME'; data: string }[];
        /** True once SendGrid confirms DNS has propagated */
        domainVerified?: boolean;
        // SendGrid Subuser isolation
        /** SendGrid Subuser username (for reputation isolation) */
        sendGridSubuserId?: string;
        /** SendGrid API key scoped to this church's Subuser */
        sendGridSubuserApiKey?: string;
    };
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
    historicRiskCategory?: string;
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
        timesPerWeek?: number;
        riskLevel: 'Low' | 'Medium' | 'High';
        nextServiceDate?: string;
        recentServices?: { date: string, planId?: string, teamName?: string, serviceTypeName?: string }[];
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

export interface ProgressStats {
    thisMonth: number;
    lastMonth: number;
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
    progressStats?: ProgressStats;
    recentRiskChanges?: RiskChangeRecord[];
}

export interface GroupsDashboardData {
    stats: { totalGroups: number, totalEnrollment: number, averageGroupSize: number, publicGroups: number, averageAttendance: number };
    groupsByType: { name: string, value: number }[];
    groupsByDay: any[];
    allGroups: PcoGroup[];
    recentGroups: PcoGroup[];
    genderDistribution?: DemographicData[];
    progressStats?: ProgressStats;
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
    progressStats?: ProgressStats;
    timePeriodLabel?: string;
    currentLabel?: string;
    previousLabel?: string;
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
    progressStats?: ProgressStats;
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
    // -- Twilio SMS (Master Account) -------------------------------------------
    /** Twilio master Account SID � used to create per-church sub-accounts */
    twilioMasterAccountSid?: string;
    /** Twilio master Auth Token */
    twilioMasterAuthToken?: string;
    /**
     * Base URL where the backend is reachable by Twilio's webhook callbacks.
     * Defaults to apiBaseUrl.  Example: https://api.pastoralcare.barnabassoftware.com
     */
    twilioWebhookBaseUrl?: string;
    /** Cost per SMS segment in USD, used for the in-app usage estimate (default 0.0079) */
    twilioSegmentCostUsd?: number;
    /** Cost per MMS segment in USD (default 0.0200) */
    twilioMmsSegmentCostUsd?: number;
    /** When true, require A2P 10DLC brand + campaign registration before provisioning numbers */
    twilioRequireA2PRegistration?: boolean;
    /** When true, perform a Carrier Lookup on every inbound number (adds ~$0.005/lookup) */
    twilioEnableCarrierLookup?: boolean;
    /** Twilio API Key SID (alternative to Auth Token for tighter scope) */
    twilioApiKeySid?: string;
    /** Twilio API Key Secret */
    twilioApiKeySecret?: string;
    /**
     * Primary Customer Profile SID (BU...) for Hon Ventures LLC.
     * This is Barnabas Software's master ISV profile in Twilio Trust Hub.
     * It must be assigned as an entity in every secondary (per-church) customer profile
     * so Twilio can validate the ISV chain before approving. Set in System Settings → Twilio SMS.
     */
    primaryCustomerProfileSid?: string;
    /**
     * A2P Profile Bundle SID (BN...) — the ISV master A2P profile bundle for Hon Ventures LLC.
     * Required when submitting brand registrations via the Twilio messaging.v1.brandRegistrations API.
     * Find it at: Twilio Console → Messaging → Regulatory → A2P Registration.
     */
    twilioA2pProfileBundleSid?: string;
}

export interface TemplateSettings {
    primaryColor: string;
    textColor: string;
    backgroundColor: string;
    linkColor: string;
    fontFamily: string;
    header: string;
    footer: string;
    // Church logo (shown in email header)
    /** Whether to display the church logo in the email header. Defaults to true when logoUrl is present. */
    showLogo?: boolean;
    /** Per-campaign logo URL override. Falls back to Church.logoUrl when not set. */
    logoUrl?: string;
    // Social media
    showSocialLinks?: boolean;
    facebookUrl?: string;
    youtubeUrl?: string;
    instagramUrl?: string;
    twitterUrl?: string;
}

/** Tracks an individual who unsubscribed from a church's email list. */
export interface EmailUnsubscribe {
    id: string;           // `{churchId}_{base64email}`
    churchId: string;
    email: string;        // stored lowercase
    unsubscribedAt: number; // epoch ms
    campaignId?: string;
    campaignName?: string;
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
    toGroupId?: string;   // PCO Group ID (alternative to toListId)
    toGroupName?: string; // PCO Group display name
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
    scheduledAt?: number | null;    // Epoch ms � authoritative trigger for the scheduler
    sentAt?: number | null;
    recurringFrequency?: 'daily' | 'weekly' | 'monthly' | null;
    lastSentAt?: number | null;
    sentHistory?: { sentAt: number; recipientCount: number }[];
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
export type GivingFilter = 'Week' | 'This Week' | 'Last Week' | 'Month' | 'This Month' | 'Last Month' | 'Quarter' | 'This Quarter' | 'Year' | 'This Year' | 'Custom';

export interface AggregatedGivingMetric {
    churchId: string;
    month: string; // YYYY_MM format
    totalAmount: number;
    donationCount: number;
    funds: Record<string, number>;
    lastUpdated?: any;
}

/** Synced from PCO Registrations /v2/events */
export interface PcoRegistrationEvent {
    id: string;                    // `${churchId}_${pcoEventId}`
    pcoId: string;                 // raw PCO event ID
    churchId: string;
    name: string;
    description?: string | null;   // HTML description
    logoUrl?: string | null;
    publicUrl?: string | null;
    visibility?: string | null;    // 'public' | 'private' | 'link_only'
    registrationType?: string | null; // 'detailed' | 'simple'
    // Dates
    startsAt?: string | null;      // ISO � first event date
    endsAt?: string | null;
    openAt?: string | null;        // when registration opens
    closeAt?: string | null;       // when registration closes
    // Counts
    signupCount: number;           // confirmed attendee count (active_attendees_count)
    signupLimit?: number | null;
    openSignup: boolean;
    // Aggregated signup data (populated from /registrations sub-resource)
    totalRegistrations?: number;   // distinct registrations (checkouts)
    totalAttendees?: number;       // total attendee records
    waitlistedCount?: number;
    canceledCount?: number;
    // Campus
    campusId?: string | null;
    campusName?: string | null;
    // Sync metadata
    lastSynced: number;
}

/** A single attendee record for a Registration event (from /events/{id}/registrations?include=attendees) */
export interface PcoRegistrationAttendee {
    id: string;                    // `${churchId}_${pcoAttendeeId}`
    pcoId: string;
    churchId: string;
    eventId: string;               // ref to PcoRegistrationEvent.id
    pcoEventId: string;            // raw PCO event ID
    registrationId?: string | null; // PCO registration (checkout) ID
    // Person details
    name: string;
    status: string;                // 'confirmed' | 'waitlisted' | 'canceled'
    isWaitlisted: boolean;
    isCanceled: boolean;
    attendeeTypeName?: string | null; // e.g. 'Adult', 'Child', 'Volunteer'
    // Linked PCO Person
    personId?: string | null;      // PCO People person ID
    // Emergency contact (if collected)
    emergencyContactName?: string | null;
    emergencyContactPhone?: string | null;
    // Financial
    totalCostCents?: number | null;
    balanceDueCents?: number | null;
    // Metadata
    createdAt?: string | null;
    lastSynced: number;
}

/** Campus from PCO Registrations /v2/campuses */
export interface PcoRegistrationCampus {
    id: string;                    // `${churchId}_${pcoCampusId}`
    pcoId: string;
    churchId: string;
    name: string;
    createdAt?: string | null;
    updatedAt?: string | null;
    lastSynced: number;
}

// --- Poll Module --------------------------------------------------------------

export type PollQuestionType = 'single_choice' | 'multiple_choice' | 'text' | 'rating' | 'yes_no';

export interface PollQuestion {
    id: string;
    type: PollQuestionType;
    text: string;
    required: boolean;
    /** Answer choices � used for single_choice and multiple_choice */
    options?: string[];
    /** Maximum value for rating questions (e.g. 5 or 10) */
    ratingMax?: number;
    /** Display order (0-based index) */
    order: number;
}

export type PollStatus = 'draft' | 'active' | 'closed';

export interface Poll {
    id: string;
    churchId: string;
    title: string;
    description?: string;
    status: PollStatus;
    questions: PollQuestion[];
    /** If false, the session token check is skipped (open responses) */
    allowMultipleSubmissions: boolean;
    /** Prompt respondent for their name */
    requireName: boolean;
    /** Prompt respondent for their email address */
    requireEmail: boolean;
    /** Show aggregated results to the respondent after submitting */
    showResultsToRespondents: boolean;
    /** Optional epoch ms timestamp at which the poll auto-closes */
    closesAt?: number | null;
    /** Denormalized total response count � incremented on each submission */
    totalResponses: number;
    createdAt: number;
    updatedAt: number;
    createdBy: string;
}

export interface PollResponse {
    id: string;
    pollId: string;
    churchId: string;
    respondentName?: string;
    respondentEmail?: string;
    /** Map of PollQuestion.id ? answer value or array of values */
    answers: Record<string, string | string[]>;
    submittedAt: number;
    /** Random token generated client-side; stored in localStorage to surface to admin */
    sessionToken: string;
}

export interface RiskChangeRecord {
    id: string;             // e.g. `${churchId}_${personId}_${timestamp}`
    churchId: string;
    personId: string;
    personName: string;
    date: string;           // ISO date string
    oldCategory: string;    // 'Healthy' | 'At Risk' | 'Disconnected'
    newCategory: string;
    timestamp: number;
}

// --- Notes Module ---------------------------------------------------------------

export type NoteStatus = 'draft' | 'published';

export interface ChurchNote {
    id: string;
    churchId: string;
    title: string;
    /** HTML or plain-text content */
    content: string;
    authorId: string;
    authorName: string;
    status: NoteStatus;
    createdAt: number;
    updatedAt: number;
}

// --- SMS / Messaging Module ---------------------------------------------------

export interface SmsSettings {
    /** Whether SMS module is enabled for this tenant */
    smsEnabled?: boolean;
    /** Twilio Sub-Account SID for this church */
    twilioSubAccountSid?: string;
    /** Twilio Sub-Account Auth Token */
    twilioSubAccountAuthToken?: string;
    /** E.164 Twilio number assigned to this church, e.g. +15551234567 */
    twilioPhoneNumber?: string;
    /** Twilio Phone Number SID */
    twilioPhoneSid?: string;

    // -- A2P 10DLC Brand Registration ------------------------------------------
    /** A2P 10DLC registration status */
    twilioA2pStatus?: 'not_started' | 'pending' | 'approved' | 'failed';
    /** Twilio Brand Registration SID (e.g. BN...) */
    twilioBrandSid?: string;
    /** Twilio Messaging Service Campaign SID (e.g. QE...) */
    twilioCampaignSid?: string;
    /** Twilio Messaging Service SID (e.g. MG...) � required for campaigns */
    twilioMessagingServiceSid?: string;
    /** Legal business name (must match IRS / EIN records) */
    a2pBusinessName?: string;
    /** Federal Employer Identification Number (EIN) e.g. 12-3456789 */
    a2pEin?: string;
    /** Business type for 10DLC registration — must match Twilio's exact enum value */
    a2pBusinessType?: 'Sole Proprietorship' | 'Partnership' | 'Limited Liability Corporation' | 'Co-operative' | 'Non-profit Corporation' | 'Corporation';
    /** Industry vertical for TCR brand registration */
    a2pVertical?: string;
    /** Website URL submitted during brand registration */
    a2pWebsite?: string;
    /** Stock ticker (only for publicly traded entities) */
    a2pStockTicker?: string;
    /** Stock exchange (only for publicly traded entities) */
    a2pStockExchange?: string;
    /** Contact first name for brand registration */
    a2pContactFirstName?: string;
    /** Contact last name */
    a2pContactLastName?: string;
    /** Contact email */
    a2pContactEmail?: string;
    /** Contact phone (E.164) */
    a2pContactPhone?: string;
    /**
     * Contact's specific job title, e.g. "Senior Pastor", "Executive Director".
     * Maps to Twilio Trust Hub authorized_representative_1 `business_title`.
     */
    a2pContactJobTitle?: string;
    /**
     * Contact's job level — must be one of Twilio's accepted enum values:
     * Director | VP | GM | CEO | CFO | General Counsel
     * Maps to Twilio Trust Hub authorized_representative_1 `job_position`.
     */
    a2pContactJobPosition?: 'Director' | 'VP' | 'GM' | 'CEO' | 'CFO' | 'General Counsel';
    /** Street address for brand registration */
    a2pAddress?: string;
    /** City */
    a2pCity?: string;
    /** 2-letter state code */
    a2pState?: string;
    /** ZIP code */
    a2pZip?: string;
    /** Use case / campaign type e.g. "MIXED" | "2FA" | "CUSTOMER_CARE" | "DELIVERY_NOTIFICATION" | "MARKETING" | "MIXED" | "POLLING_VOTING" | "PUBLIC_SERVICE_ANNOUNCEMENT" | "SECURITY_ALERT" */
    a2pUseCaseCategory?: string;
    /** Short description of how the church uses SMS (140 chars max) */
    a2pDescription?: string;
    /** Sample message 1 submitted to TCR */
    a2pSampleMessage1?: string;
    /** Sample message 2 submitted to TCR */
    a2pSampleMessage2?: string;
    /** Whether subscribers can opt in via a web form */
    a2pOptInWebForm?: boolean;
    /** Whether subscribers opt in via a text-to-join keyword */
    a2pOptInSmsKeyword?: boolean;
    /** Whether subscribers opt in via a paper / verbal process */
    a2pOptInPaperVoice?: boolean;
    /** Freeform description of opt-in process */
    a2pOptInDescription?: string;
    /** Epoch ms when A2P form was submitted to Twilio */
    a2pSubmittedAt?: number;
    /** Epoch ms of last Twilio status check */
    a2pLastStatusCheck?: number;
    /** Failure reason returned by Twilio (if status = failed) */
    a2pFailureReason?: string | null;
    /** Twilio Customer Profile Bundle SID � required for full brand registration */
    twilioCustomerProfileSid?: string;
    /** Twilio A2P Profile Bundle SID � required for full brand registration */
    twilioA2pProfileSid?: string;
    twilioEndUserSid?: string;
    twilioRepEndUserSid?: string;
    twilioRep2EndUserSid?: string;
    twilioAddressSid?: string;
    twilioSupportingDocSid?: string;
    twilioCustomerProfileStatus?: string;
    twilioCustomerProfileEvaluation?: string;
    twilioCustomerProfileCreatedAt?: number;
    twilioCustomerProfileUpdatedAt?: number;
    a2pRep2FirstName?: string;
    a2pRep2LastName?: string;
    a2pRep2Email?: string;
    a2pRep2Phone?: string;
    a2pRep2JobTitle?: string;
    a2pRep2JobPosition?: string;

    // -- Opt-Out / Sender ID Settings ------------------------------------------
    /** Display name used as sender context in message headers */
    senderName?: string;
    /** Custom opt-out reply (STOP keyword auto-response). If blank, Twilio's default is used. */
    optOutMessage?: string;
    /** Custom opt-in / double-opt-in reply (START keyword) */
    optInMessage?: string;
    /** Custom help reply (HELP keyword) */
    helpMessage?: string;
    /** Whether to prepend the church name to every outbound message */
    prefixMessagesWithName?: boolean;
    /** Footer text appended to every outbound SMS (e.g. "Reply STOP to unsubscribe") */
    messageFooter?: string;
    /** Whether the SMS AI Agent is enabled for this tenant */
    smsAgentEnabled?: boolean;

    // -- Prayer Request Detection (NLP) ----------------------------------------
    /**
     * When true, inbound messages are scanned for natural-language prayer request
     * patterns. Matching conversations are automatically tagged "Needs Prayer".
     */
    prayerDetectionEnabled?: boolean;
    /**
     * The clarifying reply sent when a *generic* prayer ask is detected
     * (e.g. "Will you pray for me?"). Defaults to "What would you like prayer for?"
     */
    prayerClarifyingReply?: string;

    // -- Terms of Service acceptance -------------------------------------------
    /** Epoch ms when an admin accepted the SMS Terms of Service and Privacy Policy */
    termsAcceptedAt?: number;
    /** User ID of the admin who accepted the terms */
    termsAcceptedByUserId?: string;
}

export type SmsDirection = 'inbound' | 'outbound';
export type SmsStatus =
    | 'queued'
    | 'sent'
    | 'delivered'
    | 'failed'
    | 'undelivered'
    | 'received';

export interface SmsMessage {
    id: string;
    conversationId: string;
    churchId: string;
    direction: SmsDirection;
    body: string;
    mediaUrls?: string[];
    status: SmsStatus;
    errorCode?: string | null;
    twilioSid?: string | null;
    /** userId of the staff member who sent it (outbound), or null for inbound / auto-reply */
    sentBy?: string | null;
    sentByName?: string | null;
    /** Campaign that triggered this message, if any */
    campaignId?: string | null;
    createdAt: number;          // epoch ms
    deliveredAt?: number | null;
}

export interface SmsConversation {
    id: string;                 // `${churchId}_${e164phone_no_plus}`
    churchId: string;
    /** Linked PCO People person ID, if we found a match by phone */
    personId?: string | null;
    personName?: string | null;
    personAvatar?: string | null;
    /** E.164 phone number of the contact */
    phoneNumber: string;
    lastMessageAt: number;
    lastMessageBody?: string;
    lastMessageDirection?: SmsDirection;
    /** Unread count for inbox badge */
    unreadCount: number;
    /** True if the contact replied STOP or was manually opted out */
    isOptedOut: boolean;
    /** Staff user ID assigned to handle this thread */
    assignedTo?: string | null;
    tags?: string[];
    /** ID of the TwilioPhoneNumber doc this conversation belongs to */
    twilioNumberId?: string | null;
    /** The Twilio E.164 number that received / will send messages in this thread */
    toPhoneNumber?: string | null;
    /** Named inbox this conversation belongs to (legacy — same value as twilioNumberId) */
    inboxId?: string | null;
    /**
     * Prayer detection follow-up state.
     * Set to 'awaiting_prayer_detail' after the system sends the clarifying reply
     * "What would you like prayer for?" for a generic ask.
     * The next inbound message from this contact will be treated as the prayer detail
     * and will trigger the "Needs Prayer" tag.
     */
    prayerFollowUpState?: 'awaiting_prayer_detail' | null;
}

export type SmsCampaignStatus = 'draft' | 'scheduled' | 'sending' | 'sent' | 'failed';

export interface SmsCampaign {
    id: string;
    churchId: string;
    name: string;
    status: SmsCampaignStatus;
    body: string;
    mediaUrls?: string[];
    // Recipients  one of listId, groupId, or toPhones
    toListId?: string | null;
    toListName?: string | null;
    toGroupId?: string | null;
    toGroupName?: string | null;
    /** Flat array of E.164 numbers for ad-hoc sends */
    toPhones?: string[];
    // Scheduling
    sendAt?: string | null;       // ISO string for UI display
    scheduledAt?: number | null;  // epoch ms  authoritative trigger for the scheduler
    sentAt?: number | null;
    recurringFrequency?: 'daily' | 'weekly' | 'monthly' | null;
    lastSentAt?: number | null;
    sentHistory?: { sentAt: number; recipientCount: number }[];
    // Sending number override
    /** TwilioPhoneNumber doc ID to use for this campaign. Falls back to the church default number. */
    twilioNumberId?: string | null;
    // Analytics
    recipientCount?: number;
    deliveredCount?: number;
    failedCount?: number;
    optOutCount?: number;
    // Retry
    retryCount?: number;
    lastError?: string | null;
    // Metadata
    sentBy?: string | null;
    sentByName?: string | null;
    createdAt: number;
    updatedAt: number;
}

export interface SmsTag {
    id: string;
    churchId: string;
    /** Display name, e.g. "Prayer Request" */
    name: string;
    /** Optional emoji prefix, e.g. "??" */
    emoji?: string;
    /** Color theme for tag chip UI */
    color: 'violet' | 'blue' | 'emerald' | 'amber' | 'red' | 'pink';
    /**
     * Optional auto-reply message sent when this tag is applied to a conversation.
     * Fires on manual tag application from the inbox, or when a keyword's autoTagIds
     * includes this tag's ID. Only fires once per conversation per tag application.
     */
    autoReplyMessage?: string;
    createdAt: number;
}

export interface SmsKeyword {
    id: string;
    churchId: string;
    /** The trigger word (stored uppercase), e.g. "YOUTH" */
    keyword: string;
    /** Auto-reply message body */
    replyMessage: string;
    /** Optionally add the replying contact to this PCO list */
    addToListId?: string | null;
    addToListName?: string | null;
    /** Tag IDs (SmsTag.id) to automatically apply to the conversation when this keyword matches */
    autoTagIds?: string[];
    /**
     * Optional restriction to specific TwilioPhoneNumber doc IDs.
     * Empty / absent = applies to all numbers for the church.
     */
    numberIds?: string[];
    isActive: boolean;
    matchCount: number;
    createdAt: number;
}

export interface SmsOptOut {
    id: string;               // `${churchId}_${e164phone_no_plus}`
    churchId: string;
    phoneNumber: string;      // E.164
    optedOutAt: number;
    campaignId?: string | null;
    source: 'STOP_reply' | 'manual' | 'admin';
}

export interface SmsInbox {
    id: string;
    churchId: string;
    /** Display name, e.g. "Youth Ministry" or "Main Office" */
    name: string;
    assignedUserIds: string[];
    isDefault: boolean;
}

/**
 * A Twilio phone number owned by a church tenant.
 * Stored in the top-level `twilioNumbers` collection (one doc per number).
 * Replaces the single-number pattern in Church.smsSettings.
 */
export interface TwilioPhoneNumber {
    id: string;                   // Firestore doc ID (auto)
    churchId: string;
    /** E.164 phone number, e.g. "+15551234567" */
    phoneNumber: string;
    /** Twilio IncomingPhoneNumber SID */
    phoneSid: string;
    /** Admin-assigned label, e.g. "Main Office", "Youth Line" */
    friendlyLabel: string;
    /** True for the number used by campaigns/workflows when no override is set */
    isDefault: boolean;
    smsEnabled: boolean;
    /**
     * IDs of users who can see this inbox.
     * Empty array = visible to all users in the church.
     * Church Admins always bypass this restriction.
     */
    allowedUserIds: string[];
    /** Webhook URL configured on this number in Twilio */
    webhookUrl?: string;
    /** Twilio Messaging Service SID linked to this number */
    messagingServiceSid?: string;
    /** Sender name prefix shown to recipients */
    senderName?: string;
    createdAt: number;
    updatedAt: number;
}

export interface SmsUsageRecord {
    id: string;
    churchId: string;
    campaignId?: string | null;
    conversationId?: string | null;
    toPhone: string;
    segments: number;
    isMms: boolean;
    costUsd: number;
    twilioSid: string;
    createdAt: number;
}

export interface SmsUsageSummary {
    id: string;             // `${churchId}_${YYYY_MM}`
    churchId: string;
    month: string;          // e.g. "2026_04"
    totalMessages: number;
    totalSegments: number;
    totalCostUsd: number;
    lastUpdated: number;
}

// --- SMS AI Agent -----------------------------------------------------------

/**
 * Church-specific knowledge base used to ground the SMS AI Agent.
 * One document per church, stored at smsAgentKnowledge/{churchId}.
 */
export interface SmsAgentKnowledge {
    id: string;           // churchId
    churchId: string;
    /** Physical address of the main campus */
    address?: string;
    /** Service schedule, e.g. "Sundays 9am & 11am, Wednesdays 7pm" */
    serviceTimes?: string;
    /** Lead pastor name and bio snippet */
    pastor?: string;
    /** Ministries offered (prose or bullet list) */
    ministries?: string;
    /** Classes, small groups, discipleship programs */
    classes?: string;
    /** Additional campus or meeting locations */
    locations?: string;
    /** Church website URL */
    website?: string;
    /** Main phone number */
    phone?: string;
    /** Catch-all freeform facts the admin wants the agent to know */
    customFacts?: string;
    updatedAt: number;
    updatedBy: string;
}

/**
 * An AI-suggested reply stored in the
 * smsConversations/{convId}/aiSuggestions sub-collection.
 * Staff can accept (pre-fills compose box) or dismiss.
 */
export interface SmsAiSuggestion {
    id: string;
    conversationId: string;
    churchId: string;
    /** The inbound message ID this suggestion was generated for */
    inboundMessageId: string;
    /** The AI-generated reply body */
    suggestedBody: string;
    /** pending = not yet acted on | accepted = staff sent it | dismissed = staff dismissed */
    status: 'pending' | 'accepted' | 'dismissed';
    createdAt: number;
}

// --- Workflows ---------------------------------------------------------------

/** Channel used for a single workflow step. */
export type WorkflowChannelType = 'sms' | 'mms' | 'email' | 'staff_sms' | 'staff_email';

export interface SmsWorkflowStep {
    id: string;             // uuid
    order: number;
    /** Days to wait after the previous step (0 = send immediately). Only used when scheduleType = 'relative'. */
    delayDays: number;
    /**
     * Timing mode for this step (default = 'relative').
     * - 'relative'     ? fire delayDays after the previous step completes.
     * - 'day_of_week'  ? fire on the next occurrence of scheduleDayOfWeek after the previous step.
     * - 'day_of_month' ? fire on the next calendar date matching scheduleDayOfMonth.
     */
    scheduleType?: 'relative' | 'day_of_week' | 'day_of_month';
    /** 0 = Sunday  6 = Saturday. Used when scheduleType = 'day_of_week'. Default: 1 (Monday). */
    scheduleDayOfWeek?: number;
    /** 131. Used when scheduleType = 'day_of_month'. */
    scheduleDayOfMonth?: number;
    /** Send time in 'HH:MM' 24-hour format. Used for day_of_week and day_of_month modes. Default '09:00'. */
    scheduleTime?: string;
    /** Channel type for this step. Defaults to 'sms'. */
    channelType: WorkflowChannelType;
    // -- SMS / MMS --------------------------------------------------------------
    message: string;
    mediaUrls?: string[];   // MMS attachments
    // -- Email ------------------------------------------------------------------
    emailSubject?: string;
    emailBody?: string;     // HTML or plain text body for the email step
    // -- Staff Reminder (staff_sms | staff_email) -----------------------------------------
    /** How the staff recipients are resolved. 'individuals' = named list, 'list' = PCO List, 'group' = PCO Group */
    staffTargetType?: 'individuals' | 'list' | 'group';
    /** Explicit staff recipients when staffTargetType = 'individuals' */
    staffRecipients?: { name: string; phone?: string; email?: string }[];
    /** PCO List ID for bulk staff target */
    staffListId?: string | null;
    staffListName?: string | null;
    /** PCO Group ID for bulk staff target */
    staffGroupId?: string | null;
    staffGroupName?: string | null;
}

export type SmsWorkflowTrigger = 'keyword' | 'manual' | 'list_add' | 'birthday' | 'anniversary' | 'event_registration';

export interface SmsWorkflow {
    id: string;
    churchId: string;
    name: string;
    description?: string;
    trigger: SmsWorkflowTrigger;
    /** When trigger = 'keyword', the keyword doc id that fires this workflow */
    triggerKeywordId?: string | null;
    triggerKeywordWord?: string | null;
    /** When trigger = 'list_add', the PCO list id */
    triggerListId?: string | null;
    triggerListName?: string | null;
    /** When trigger = 'event_registration', the PCO Signup/Event ID (PcoRegistrationEvent.pcoId) */
    triggerEventId?: string | null;
    triggerEventName?: string | null;
    /**
     * For 'birthday' and 'anniversary' triggers:
     * Number of days BEFORE the event to send Step 1.
     * 0 = send on the event day (default), 7 = send 1 week early, etc.
     */
    triggerDayOffset?: number;
    /** Legacy flat step array  kept in sync by the editor for the scheduler */
    steps: SmsWorkflowStep[];
    /**
     * New node-based workflow structure used by the editor.
     * Includes Action, Delay, and Branch nodes.
     * When present, takes precedence over `steps` for the UI.
     */
    nodes?: WorkflowNode[];
    isActive: boolean;
    enrolledCount: number;
    completedCount: number;
    createdAt: number;
    updatedAt: number;
}

export interface SmsWorkflowEnrollment {
    id: string;          // `${workflowId}_${e164phone}`
    churchId: string;
    workflowId: string;
    phoneNumber: string;
    personName?: string | null;
    personId?: string | null;
    currentStep: number;
    nextSendAt: number;  // epoch ms
    completed: boolean;
    enrolledAt: number;
    lastStepSentAt?: number | null;
}

// --- New Node-Based Workflow Model --------------------------------------------

/**
 * Condition types available in a branch node.
 * The scheduler currently executes the 'then' path by default;
 * full runtime evaluation is a future enhancement.
 */
export type WorkflowBranchConditionType = 'replied' | 'email_opened' | 'tag_applied' | 'custom';

/**
 * An *action* node  sends a message to the contact (or staff).
 * Equivalent to the legacy SmsWorkflowStep but without timing fields
 * (timing lives in a separate DelayNode that precedes this node).
 */
export interface WorkflowActionNode {
    nodeType: 'action';
    id: string;
    order: number;
    channelType: WorkflowChannelType;
    // -- SMS / MMS ----------------------------------------------------------
    message: string;
    mediaUrls?: string[];
    // -- Email --------------------------------------------------------------
    emailSubject?: string;
    emailBody?: string;
    // -- Staff Reminder -----------------------------------------------------
    staffTargetType?: 'individuals' | 'list' | 'group';
    staffRecipients?: { name: string; phone?: string; email?: string }[];
    staffListId?: string | null;
    staffListName?: string | null;
    staffGroupId?: string | null;
    staffGroupName?: string | null;
}

/**
 * A *delay* node — a pure wait period; no message is sent.
 * Sits in the timeline between action nodes to control timing.
 */
export interface WorkflowDelayNode {
    nodeType: 'delay';
    id: string;
    order: number;
    /** Days to wait in 'relative' mode. */
    delayDays: number;
    scheduleType?: 'relative' | 'day_of_week' | 'day_of_month';
    /** 0 = Sunday — 6 = Saturday. Used when scheduleType = 'day_of_week'. */
    scheduleDayOfWeek?: number;
    /** 1–31. Used when scheduleType = 'day_of_month'. */
    scheduleDayOfMonth?: number;
    /** 'HH:MM' 24-hour send time for day_of_week / day_of_month modes. */
    scheduleTime?: string;
    // ── Recurrence ─────────────────────────────────────────────────────────
    /** 'none' = fire once; 'weekly' = repeat on selected days of week; 'monthly' = repeat on selected dates */
    repeatType?: 'none' | 'weekly' | 'monthly';
    /**
     * Days on which the action repeats.
     * For repeatType 'weekly'  : day-of-week values (0–6, Sunday = 0).
     * For repeatType 'monthly' : day-of-month values (1–31).
     * Leave empty for a single-occurrence send.
     */
    repeatDays?: number[];
    /**
     * Optional end date (epoch ms) after which recurrence stops.
     * Undefined / null means repeat indefinitely.
     */
    repeatUntil?: number | null;
    /** Maximum number of times this recurrence fires (overrides repeatUntil if both set). */
    repeatCount?: number | null;
}

/**
 * A *branch* node  evaluates a condition and routes the enrollment
 * to either the `thenNodes` (condition true) or `elseNodes` (condition false) path.
 * Single-level only; no nested branches.
 */
export interface WorkflowBranchNode {
    nodeType: 'branch';
    id: string;
    order: number;
    /** Short label shown in the timeline, e.g. "Did they reply?" */
    conditionLabel?: string;
    conditionType: WorkflowBranchConditionType;
    /** Tag ID when conditionType = 'tag_applied'. */
    conditionTagId?: string | null;
    conditionTagName?: string | null;
    /** Freeform description when conditionType = 'custom'. */
    conditionCustom?: string;
    /** Action nodes executed when the condition is TRUE. */
    thenNodes: WorkflowActionNode[];
    /** Action nodes executed when the condition is FALSE. */
    elseNodes: WorkflowActionNode[];
}

/** Discriminated union of all workflow node types. */
export type WorkflowNode = WorkflowActionNode | WorkflowDelayNode | WorkflowBranchNode;

// ─── Multi-Number Support ────────────────────────────────────────────────────

/**
 * A Twilio phone number provisioned for a specific church.
 * One church may own multiple numbers (e.g. main line, youth line).
 * Stored in the `twilioNumbers` Firestore collection.
 */
export interface TwilioPhoneNumber {
    id: string;
    churchId: string;
    /** E.164 phone number, e.g. "+16155550100" */
    phoneNumber: string;
    /** Twilio SID for this number */
    phoneSid: string;
    /** Human-friendly label shown in the inbox switcher (e.g. "Main Line", "Youth Ministry") */
    friendlyLabel: string;
    /** Whether this is the church's primary/default number */
    isDefault: boolean;
    /** Whether SMS is enabled for this number */
    smsEnabled: boolean;
    /**
     * User IDs allowed to see and send from this number.
     * Empty array = visible to all users in the church.
     */
    allowedUserIds: string[];
    /** Optional display name shown in outbound message headers */
    senderName?: string;
    createdAt: number;
    updatedAt: number;
}
