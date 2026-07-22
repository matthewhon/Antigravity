
import { WidgetDefinition } from '../types';

export const DASHBOARD_WIDGETS: WidgetDefinition[] = [
    { id: 'onboarding_tasks', label: 'Setup Guide', icon: '🚀' },
    { id: 'censusHero', label: 'Census Hero', icon: '🏛️' },
    { id: 'ai_insights', label: 'AI Insights', icon: '✨' },
    { id: 'people_stats', label: 'People Stats', icon: '👥' },
    { id: 'keyMetrics', label: 'Giving Metrics', icon: '💰' },
    { id: 'groups_stats', label: 'Groups Stats', icon: '📂' },
    { id: 'services_stats', label: 'Services Stats', icon: '🎹' },
    { id: 'services_timeline', label: 'Church Timeline', icon: '🗓️' },
    { id: 'churchRisk', label: 'Church Health', icon: '🏥' },
    { id: 'church_progress', label: 'Church Progress', icon: '📈' },
    { id: 'people_engagement', label: 'Risk Profiles', icon: '📊' },
    { id: 'gender', label: 'Gender', icon: '🚻' },
    { id: 'age', label: 'Age', icon: '🎂' },
    { id: 'last_week_stats', label: 'Last Week Stats', icon: '📅' },
];

export const PEOPLE_OVERVIEW_WIDGETS: WidgetDefinition[] = [
    { id: 'people_stats', label: 'Key Stats', icon: '📊' },
    { id: 'assimilation_rate', label: 'Connection Rate', icon: '🔗' },
    { id: 'engagement_status', label: 'Engagement Status', icon: '🔥' },
    { id: 'people_engagement', label: 'Risk Profiles', icon: '📈' },
    { id: 'gender', label: 'Gender Dist', icon: '🚻' },
    { id: 'age', label: 'Age Dist', icon: '🎂' },
    { id: 'data_completeness', label: 'Data Completeness', icon: '✅' },
    { id: 'campus_breakdown', label: 'Campus Breakdown', icon: '🏢' },
    { id: 'community_age_comparison', label: 'Community Age Gap', icon: '🏘️' },
    { id: 'benchmark_age', label: 'Age Benchmark', icon: '⚖️' },
    { id: 'benchmark_gender', label: 'Gender Benchmark', icon: '⚖️' },
    { id: 'benchmark_household', label: 'Household Benchmark', icon: '⚖️' },
    { id: 'membership', label: 'Membership', icon: '🆔' },
    { id: 'map', label: 'Geo Map', icon: '🗺️' },
    { id: 'birthdays', label: 'Birthdays', icon: '🎉' },
    { id: 'anniversaries', label: 'Anniversaries', icon: '💍' },
    { id: 'recent', label: 'New People', icon: '✨' },
    { id: 'zip', label: 'Top Zip Codes', icon: '📮' },
    { id: 'upcoming_registrations', label: 'Upcoming Registrations', icon: '🎟️' },
];

export const PEOPLE_HOUSEHOLD_WIDGETS: WidgetDefinition[] = [
    { id: 'householdSummary', label: 'Household Stats', icon: '🏠' },
    { id: 'householdComp', label: 'Composition', icon: '👨‍👩‍👧' },
    { id: 'householdSize', label: 'Size Dist', icon: '🔢' },
    { id: 'householdList', label: 'Largest Households', icon: '📋' },
];

export const PEOPLE_RISK_WIDGETS: WidgetDefinition[] = [
    { id: 'riskDistribution', label: 'Risk Distribution', icon: '⚠️' },
    { id: 'atRiskList', label: 'At Risk List', icon: '📋' },
    { id: 'riskChanges', label: 'Status Changes', icon: '📉' },
    { id: 'risk_factors', label: 'Risk Factors', icon: '🚩' },
    { id: 'people_directory', label: 'Directory', icon: '📒' },
];

export const GROUPS_WIDGETS: WidgetDefinition[] = [
    { id: 'groups_risk_agent', label: 'Risk Consultant', icon: '🩺' },
    { id: 'groups_ai_agent', label: 'Activate Agent', icon: '🚀' },
    { id: 'groups_connection_rate', label: 'Connection Rate', icon: '🔗' },
    { id: 'groups_health_distribution', label: 'Health Distribution', icon: '⚕️' },
    { id: 'groups_action_center', label: 'Action Center', icon: '🚨' },
    { id: 'groups_health', label: 'Groups Health', icon: '❤️' },
    { id: 'groups_stats', label: 'Groups Stats', icon: '📊' },
    { id: 'groups_size_distribution', label: 'Size Distribution', icon: '📏' },
    { id: 'groups_net_growth', label: 'Net Group Growth', icon: '📈' },
    { id: 'groups_meeting_days', label: 'Meeting Days', icon: '📆' },
    { id: 'groups_new_members', label: 'New Members', icon: '🌱' },
    { id: 'groups_unconnected', label: 'Unconnected People', icon: '🧩' },
    { id: 'groups_health_factors', label: 'Health Factors', icon: '🧭' },
    { id: 'groups_type_performance', label: 'Type Performance', icon: '🏆' },
    { id: 'groups_visitor_funnel', label: 'Visitor Engagement', icon: '👋' },
    { id: 'groups_leader_load', label: 'Leader Load', icon: '🧑‍🏫' },
    { id: 'groups_by_campus', label: 'Groups by Campus', icon: '🏢' },
    { id: 'groups_age_demographics', label: 'Age Demographics', icon: '🎂' },
    { id: 'event_attendance', label: 'Group Attendance', icon: '📅' },
    { id: 'groups_gender', label: 'Gender Breakdown', icon: '🚻' },
    { id: 'types', label: 'Group Types', icon: '🏷️' },
    { id: 'recent_groups', label: 'New Groups', icon: '✨' },
    { id: 'group_info', label: 'Group Info', icon: 'ℹ️' },
    { id: 'benchmark_group_att', label: 'Size Benchmark', icon: '⚖️' },
];

export const SERVICES_OVERVIEW_WIDGETS: WidgetDefinition[] = [
    { id: 'services_stats', label: 'Services Stats', icon: '📊' },
    { id: 'attendance_growth', label: 'Attendance Growth', icon: '📈' },
    { id: 'first_time_guests', label: 'First-Time Guests', icon: '🙌' },
    { id: 'volunteer_health', label: 'Volunteer Health', icon: '❤️‍🩹' },
    { id: 'team_fill_rate', label: 'Team Fill Rate', icon: '🪑' },
    { id: 'upcoming_plans_list', label: 'Upcoming Plans', icon: '📅' },
    { id: 'staffing_needs', label: 'Staffing Needs', icon: '🚨' },
    { id: 'serving_frequency', label: 'Serving Frequency', icon: '🔁' },
    { id: 'unscheduled_volunteers', label: 'Unscheduled Volunteers', icon: '🪑' },
    { id: 'volunteer_ratio', label: 'Volunteer Ratio', icon: '⚖️' },
    { id: 'confirmation_health', label: 'Confirmation Health', icon: '✔️' },
    { id: 'staffing_forecast', label: 'Staffing Forecast', icon: '🔮' },
    { id: 'top_songs', label: 'Top Songs', icon: '🎵' },
    { id: 'song_rotation', label: 'Song Rotation', icon: '🎶' },
    { id: 'positions', label: 'Positions', icon: '🪑' },
    { id: 'checkin_history', label: 'Check-ins', icon: '✅' },
];

export const SERVICES_ATTENDANCE_WIDGETS: WidgetDefinition[] = [
    { id: 'checkin_history', label: 'Check-ins', icon: '✅' },
    { id: 'attendance_growth', label: 'Attendance Growth', icon: '📈' },
    { id: 'first_time_guests', label: 'First-Time Guests', icon: '🙌' },
    { id: 'digital_vs_physical', label: 'Digital vs In-Person', icon: '💻' },
    { id: 'attendance_breakdown', label: 'Attendance Breakdown', icon: '🧮' },
    { id: 'volunteer_ratio', label: 'Volunteer Ratio', icon: '⚖️' },
    { id: 'events', label: 'Events', icon: '📅' },
    { id: 'services_stats', label: 'Services Stats', icon: '📊' },
];

export const SERVICES_TEAMS_WIDGETS: WidgetDefinition[] = [
    { id: 'services_teams_list', label: 'Teams Directory', icon: '📋' },
    { id: 'team_roster', label: 'Team Roster', icon: '👥' },
    { id: 'burnout_watchlist', label: 'Burnout Watchlist (>2x Weekly)', icon: '🔥' },
    { id: 'volunteer_health', label: 'Volunteer Health', icon: '❤️‍🩹' },
    { id: 'serving_frequency', label: 'Serving Frequency', icon: '🔁' },
    { id: 'unscheduled_volunteers', label: 'Unscheduled Volunteers', icon: '🪑' },
    { id: 'team_fill_rate', label: 'Team Fill Rate', icon: '🪑' },
    { id: 'confirmation_health', label: 'Confirmation Health', icon: '✔️' },
    { id: 'staffing_forecast', label: 'Staffing Forecast', icon: '🔮' },
];

export const GIVING_WIDGETS: WidgetDefinition[] = [
    { id: 'keyMetrics', label: 'Key Financial Overview', icon: '💰' },
    { id: 'recurring_revenue', label: 'Recurring vs One-Time', icon: '🔄' },
    { id: 'payment_methods', label: 'Payment Methods & Fees', icon: '💳' },
    { id: 'giving_forecast', label: 'Year-End Forecast', icon: '🔮' },
    { id: 'gift_size_distribution', label: 'Gift Size Distribution', icon: '📊' },
    { id: 'batch_summary', label: 'Recent Deposits', icon: '🧾' },
    { id: 'household_giving', label: 'Household Giving', icon: '🏠' },
    { id: 'giving_consistency', label: 'Giving Consistency', icon: '🔁' },
    { id: 'giving_seasonality', label: 'Giving Seasonality', icon: '🗓️' },
    { id: 'lapsed_at_risk', label: 'Lapsed $ at Risk', icon: '⚠️' },
    { id: 'budgetProgress', label: 'Budget Progress', icon: '🌡️' },
    { id: 'trendsComparison', label: 'Trends Comp', icon: '📉' },
    { id: 'funds', label: 'Funds', icon: '🏦' },
    { id: 'avgGift', label: 'Avg Gift Demographics', icon: '🎁' },
    { id: 'benchmark_giving_avg', label: 'Giving Avg Benchmark', icon: '⚖️' },
    { id: 'benchmark_giving_age', label: 'Giving Age Benchmark', icon: '⚖️' },
    { id: 'currentVsPrevious', label: 'Current vs Prev', icon: '🆚' },
    { id: 'fundPerformance', label: 'Fund Perf', icon: '📊' },
    { id: 'cumulativeYTD', label: 'Cumulative YTD', icon: '🗓️' },
    { id: 'donorAcquisition', label: 'Acquisition', icon: '🤝' },
    { id: 'lifecycleHeadline', label: 'Lifecycle', icon: '🔄' },
    { id: 'donorLifecycle', label: 'Lifecycle Chart', icon: '📊' },
    { id: 'topGivers', label: 'Top Donors', icon: '🏆' },
    { id: 'demographics', label: 'Demographics', icon: '👥' },
    { id: 'lifecycleActive', label: 'Active List', icon: '✅' },
    { id: 'lifecycleNew', label: 'New List', icon: '🌱' },
    { id: 'lifecycleLapsed', label: 'Lapsed List', icon: '📉' },
    { id: 'lifecycleOccasional', label: 'Occasional List', icon: '🌤️' },
    { id: 'lifecycleRecovered', label: 'Recovered List', icon: '🔄' },
    { id: 'lifecycleInactive', label: 'Inactive List', icon: '💤' },
    { id: 'lifecycleSecond', label: 'Second Time List', icon: '2️⃣' },
    { id: 'lastWeekFunds', label: 'Last Week by Fund', icon: '📅' },
    { id: 'givingByStatus', label: 'Giving By Status', icon: '🏷️' },
    { id: 'givingAgeDemographics', label: 'Giving - Age Demographics', icon: '🎂' },
    { id: 'averageGiving', label: 'Average Giving', icon: '📊' },
];

export const PASTORAL_CHURCH_WIDGETS: WidgetDefinition[] = [
    { id: 'church_growth_stats', label: 'Growth Stats', icon: '📈' },
    { id: 'church_spiritual_stats', label: 'Spiritual Stats', icon: '🕊️' },
    { id: 'church_attendance_chart', label: 'Attendance Chart', icon: '📊' },
    { id: 'church_guest_funnel', label: 'Guest Funnel', icon: '🔽' },
    { id: 'church_gender_comparison', label: 'Gender Gap', icon: '🚻' },
    { id: 'church_age_comparison', label: 'Age Gap', icon: '🎂' },
];

export const PASTORAL_MEMBERSHIP_WIDGETS: WidgetDefinition[] = [
    { id: 'member_headline_stats', label: 'Member Stats', icon: '📊' },
    { id: 'member_map', label: 'Member Map', icon: '🗺️' },
    { id: 'member_age_chart', label: 'Generational Mix', icon: '🥧' },
    { id: 'member_attrition_chart', label: 'Attrition', icon: '📉' },
    { id: 'member_pastoral_touches', label: 'Pastoral Touches', icon: 'hand' },
    { id: 'member_unconnected', label: 'Unconnected', icon: '🔗' },
    { id: 'member_geo_list', label: 'City Penetration', icon: '🏙️' },
    { id: 'member_missional_gap', label: 'Missional Gap', icon: '🎯' },
];

export const PASTORAL_COMMUNITY_WIDGETS: WidgetDefinition[] = [
    { id: 'censusHero', label: 'Census Hero', icon: '🏛️' },
    { id: 'community_ai_agent', label: 'Community Agent', icon: '🤖' },
    { id: 'culturalMosaic', label: 'Cultural Mosaic', icon: '🎨' },
    { id: 'commute', label: 'Commute', icon: '🚗' },
    { id: 'education', label: 'Education', icon: '🎓' },
    { id: 'economicHealth', label: 'Economy', icon: '💵' },
    { id: 'housingVacancy', label: 'Housing Vacancy', icon: '🏠' },
    { id: 'housingStability', label: 'Housing Stability', icon: '🔑' },
    { id: 'ministrySignals', label: 'Signals', icon: '📡' },
    { id: 'familyStructure', label: 'Families', icon: '👨‍👩‍👧' },
    { id: 'communityAge', label: 'Age', icon: '🎂' },
    { id: 'communityGender', label: 'Gender', icon: '🚻' },
];

export const PASTORAL_CARE_WIDGETS: WidgetDefinition[] = [
    { id: 'care_recommended_followups', label: 'Recommended Follow-Ups', icon: '✨' },
    { id: 'care_log', label: 'Care Log', icon: '📝' },
    { id: 'prayer_requests', label: 'Prayer Requests', icon: '🙏' },
    { id: 'follow_ups', label: 'Follow-ups', icon: '📅' },
    { id: 'care_ai_agent', label: 'Care Advisor', icon: '🤖' },
    { id: 'care_people_list', label: 'People Risk List', icon: '📋' },
];

export const ALL_WIDGETS: Record<string, WidgetDefinition[]> = {
    dashboard: DASHBOARD_WIDGETS,
    people: PEOPLE_OVERVIEW_WIDGETS,
    people_households: PEOPLE_HOUSEHOLD_WIDGETS,
    people_risk: PEOPLE_RISK_WIDGETS,
    groups: GROUPS_WIDGETS,
    services: SERVICES_OVERVIEW_WIDGETS, // Legacy key mapping for backward compat in settings
    services_overview: SERVICES_OVERVIEW_WIDGETS,
    services_attendance: SERVICES_ATTENDANCE_WIDGETS,
    services_teams: SERVICES_TEAMS_WIDGETS,
    giving: GIVING_WIDGETS,
    giving_overview: GIVING_WIDGETS,
    giving_donors: GIVING_WIDGETS,
    pastoral_church: PASTORAL_CHURCH_WIDGETS,
    pastoral_membership: PASTORAL_MEMBERSHIP_WIDGETS,
    pastoral_community: PASTORAL_COMMUNITY_WIDGETS,
    pastoral_care: PASTORAL_CARE_WIDGETS,
};

export const getRoleBasedDefaults = (roles: string[]): Record<string, string[]> => {
    const has = (role: string) => roles.includes(role);
    const isAdmin   = has('Church Admin') || has('System Administration');
    const isPastor  = has('Pastor') || isAdmin;
    const isGiving  = has('Giving') || has('Finance') || isAdmin;
    const isServices = has('Services') || isAdmin;
    const isPeople  = has('People') || isAdmin;
    const isGroups  = has('Groups') || isAdmin;
    const isCare    = has('Pastoral Care') || isPastor;

    // Dashboard — everyone sees it; tailor by primary role
    let dashboard = ['onboarding_tasks', 'ai_insights', 'people_stats', 'last_week_stats'];
    if (isPastor)   dashboard = ['onboarding_tasks', 'ai_insights', 'church_progress', 'last_week_stats', 'people_stats', 'churchRisk', 'keyMetrics', 'groups_stats', 'services_stats'];
    else if (isGiving)  dashboard = ['onboarding_tasks', 'keyMetrics', 'people_stats', 'trends', 'groups_stats', 'last_week_stats'];
    else if (isServices) dashboard = ['onboarding_tasks', 'services_stats', 'people_stats', 'ai_insights', 'last_week_stats'];
    else if (isPeople)  dashboard = ['onboarding_tasks', 'people_stats', 'churchRisk', 'ai_insights', 'last_week_stats'];
    else if (isGroups)  dashboard = ['onboarding_tasks', 'groups_stats', 'people_stats', 'ai_insights', 'last_week_stats'];

    return {
        dashboard,
        // People
        people: isPeople || isPastor
            ? ['people_stats', 'assimilation_rate', 'engagement_status', 'people_engagement', 'gender', 'age', 'riskDistribution', 'map', 'birthdays']
            : ['people_stats', 'assimilation_rate', 'people_engagement', 'gender', 'age', 'map'],
        people_households: ['householdSummary', 'householdComp', 'householdSize'],
        people_risk: isPeople || isPastor
            ? ['riskDistribution', 'atRiskList', 'riskChanges', 'people_directory']
            : ['riskDistribution', 'atRiskList'],
        // Groups
        groups: isGroups || isPastor
            ? ['groups_ai_agent', 'groups_connection_rate', 'groups_health_distribution', 'groups_action_center', 'groups_health', 'groups_stats', 'event_attendance', 'groups_gender']
            : ['groups_connection_rate', 'groups_health_distribution', 'groups_health', 'groups_stats', 'event_attendance'],
        // Services
        services_overview: isServices || isPastor
            ? ['services_stats', 'attendance_growth', 'first_time_guests', 'volunteer_health', 'team_fill_rate', 'upcoming_plans_list', 'staffing_needs', 'checkin_history']
            : ['services_stats', 'attendance_growth', 'first_time_guests', 'upcoming_plans_list'],
        services_attendance: ['checkin_history', 'attendance_growth', 'first_time_guests', 'digital_vs_physical', 'events', 'services_stats'],
        services_teams: isServices
            ? ['services_teams_list', 'volunteer_health', 'burnout_watchlist', 'serving_frequency', 'team_roster']
            : ['services_teams_list', 'volunteer_health'],
        // Giving
        giving_overview: isGiving || isPastor
            ? ['keyMetrics', 'recurring_revenue', 'giving_forecast', 'budgetProgress', 'trendsComparison', 'payment_methods', 'funds', 'topGivers', 'donorLifecycle', 'givingByStatus', 'averageGiving']
            : ['keyMetrics', 'recurring_revenue', 'trendsComparison', 'funds', 'givingByStatus', 'averageGiving'],
        giving_donors: isGiving
            ? ['topGivers', 'demographics', 'donorLifecycle', 'lifecycleNew', 'lifecycleLapsed']
            : ['topGivers', 'demographics'],
        // Pastoral
        pastoral_church: isPastor
            ? ['church_growth_stats', 'church_spiritual_stats', 'church_attendance_chart', 'church_guest_funnel']
            : ['church_growth_stats', 'church_attendance_chart'],
        pastoral_membership: isPastor || isCare
            ? ['member_headline_stats', 'member_map', 'member_age_chart', 'member_unconnected', 'member_pastoral_touches']
            : ['member_headline_stats', 'member_map'],
        pastoral_community: ['censusHero', 'culturalMosaic', 'ministrySignals', 'economicHealth'],
        pastoral_care: isCare
            ? ['care_log', 'prayer_requests', 'follow_ups', 'care_ai_agent', 'care_people_list']
            : ['care_log', 'prayer_requests', 'care_people_list'],
    };
};

export const getDefaultWidgets = (view: string): string[] => {
    switch (view) {
        case 'dashboard': return ['onboarding_tasks', 'ai_insights', 'church_progress', 'last_week_stats', 'people_stats', 'keyMetrics', 'groups_stats', 'services_stats', 'churchRisk'];
        case 'people': return ['people_stats', 'assimilation_rate', 'engagement_status', 'people_engagement', 'gender', 'age', 'community_age_comparison', 'map'];
        case 'people_households': return ['householdSummary', 'householdComp', 'householdSize'];
        case 'people_risk': return ['riskDistribution', 'atRiskList'];
        case 'groups': return ['groups_ai_agent', 'groups_connection_rate', 'groups_health_distribution', 'groups_action_center', 'groups_health', 'groups_stats', 'event_attendance', 'groups_gender'];
        case 'services': return ['services_stats', 'attendance_growth', 'first_time_guests', 'volunteer_health', 'team_fill_rate', 'upcoming_plans_list', 'staffing_needs', 'checkin_history'];
        case 'services_overview': return ['services_stats', 'attendance_growth', 'first_time_guests', 'volunteer_health', 'team_fill_rate', 'upcoming_plans_list', 'staffing_needs', 'checkin_history'];
        case 'services_attendance': return ['checkin_history', 'attendance_growth', 'first_time_guests', 'digital_vs_physical', 'events', 'services_stats'];
        case 'services_teams': return ['services_teams_list', 'volunteer_health', 'burnout_watchlist', 'serving_frequency', 'team_roster'];
        case 'giving': return ['keyMetrics', 'trendsComparison', 'funds'];
        case 'giving_overview': return ['keyMetrics', 'recurring_revenue', 'giving_forecast', 'trendsComparison', 'payment_methods', 'funds', 'givingByStatus', 'averageGiving'];
        case 'giving_donor': return ['topGivers', 'demographics', 'donorLifecycle'];
        case 'pastoral': return ['church_growth_stats', 'church_spiritual_stats', 'member_headline_stats', 'member_map'];
        case 'pastoral_care': return ['care_log', 'prayer_requests', 'follow_ups', 'care_ai_agent', 'care_people_list'];
        case 'metrics': return ['census_pop', 'census_income', 'census_age', 'census_poverty', 'missional_gap', 'city_penetration'];
        default: return [];
    }
};
