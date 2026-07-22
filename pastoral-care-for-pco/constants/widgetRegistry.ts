
import { WidgetDefinition } from '../types';

export const DASHBOARD_WIDGETS: WidgetDefinition[] = [
    { id: 'onboarding_tasks', label: 'Setup Guide', icon: '🚀', size: 'full', description: 'Checklist of setup steps to get your church fully connected.' },
    { id: 'censusHero', label: 'Census Hero', icon: '🏛️', size: 'full', description: 'Community census snapshot around your church.' },
    { id: 'ai_insights', label: 'AI Insights', icon: '✨', size: 'full', description: "AI-written summary of what's notable across your church this week." },
    { id: 'people_stats', label: 'People Stats', icon: '👥', size: 'lg', description: 'Headline people counts — total, active, new, and at-risk.' },
    { id: 'keyMetrics', label: 'Giving Metrics', icon: '💰', size: 'lg', description: 'Giving totals and key financial indicators at a glance.' },
    { id: 'groups_stats', label: 'Groups Stats', icon: '📂', size: 'lg', description: 'Group counts, health, and connection summary.' },
    { id: 'services_stats', label: 'Services Stats', icon: '🎹', size: 'lg', description: 'Weekend attendance and serving-team headline numbers.' },
    { id: 'services_timeline', label: 'Church Timeline', icon: '🗓️', size: 'full', description: 'Upcoming services and events on a single timeline.' },
    { id: 'churchRisk', label: 'Church Health', icon: '🏥', size: 'lg', description: 'Overall church health score and its biggest risk drivers.' },
    { id: 'church_progress', label: 'Church Progress', icon: '📈', size: 'lg', description: 'Growth and momentum trends over time.' },
    { id: 'people_engagement', label: 'Risk Profiles', icon: '📊', size: 'md', description: 'Distribution of people across engagement and risk levels.' },
    { id: 'gender', label: 'Gender', icon: '🚻', size: 'md', description: 'Gender breakdown of your congregation.' },
    { id: 'age', label: 'Age', icon: '🎂', size: 'md', description: 'Age distribution of your congregation.' },
    { id: 'last_week_stats', label: 'Last Week Stats', icon: '📅', size: 'full', description: 'Key numbers from the past week across ministries.' },
];

export const PEOPLE_OVERVIEW_WIDGETS: WidgetDefinition[] = [
    { id: 'people_stats', label: 'Key Stats', icon: '📊', size: 'full', description: 'Headline people counts and trends.' },
    { id: 'assimilation_rate', label: 'Connection Rate', icon: '🔗', size: 'md', description: 'How well newcomers are connecting into the church.' },
    { id: 'engagement_status', label: 'Engagement Status', icon: '🔥', size: 'md', description: 'Active vs. at-risk vs. disengaged breakdown.' },
    { id: 'people_engagement', label: 'Risk Profiles', icon: '📈', size: 'md', description: 'People grouped by risk and engagement score.' },
    { id: 'gender', label: 'Gender Dist', icon: '🚻', size: 'md', description: 'Gender distribution.' },
    { id: 'age', label: 'Age Dist', icon: '🎂', size: 'md', description: 'Age distribution.' },
    { id: 'data_completeness', label: 'Data Completeness', icon: '✅', size: 'sm', description: 'How complete your people records are.' },
    { id: 'campus_breakdown', label: 'Campus Breakdown', icon: '🏢', size: 'sm', description: 'People counts by campus.' },
    { id: 'community_age_comparison', label: 'Community Age Gap', icon: '🏘️', size: 'md', description: 'Your age mix vs. the surrounding community.' },
    { id: 'benchmark_age', label: 'Age Benchmark', icon: '⚖️', size: 'md', description: 'Age profile vs. comparable churches.' },
    { id: 'benchmark_gender', label: 'Gender Benchmark', icon: '⚖️', size: 'sm', description: 'Gender profile vs. comparable churches.' },
    { id: 'benchmark_household', label: 'Household Benchmark', icon: '⚖️', size: 'sm', description: 'Household profile vs. comparable churches.' },
    { id: 'membership', label: 'Membership', icon: '🆔', size: 'sm', description: 'Membership status breakdown.' },
    { id: 'map', label: 'Geo Map', icon: '🗺️', size: 'md', description: 'Geographic map of where people live.' },
    { id: 'birthdays', label: 'Birthdays', icon: '🎉', size: 'sm', description: 'Upcoming birthdays.' },
    { id: 'anniversaries', label: 'Anniversaries', icon: '💍', size: 'sm', description: 'Upcoming anniversaries.' },
    { id: 'recent', label: 'New People', icon: '✨', size: 'sm', description: 'Recently added people.' },
    { id: 'zip', label: 'Top Zip Codes', icon: '📮', size: 'sm', description: 'Top ZIP codes by number of people.' },
    { id: 'upcoming_registrations', label: 'Upcoming Registrations', icon: '🎟️', size: 'md', description: 'Upcoming event registrations.' },
];

export const PEOPLE_HOUSEHOLD_WIDGETS: WidgetDefinition[] = [
    { id: 'householdSummary', label: 'Household Stats', icon: '🏠', size: 'full', description: 'Household count and size headline stats.' },
    { id: 'householdComp', label: 'Composition', icon: '👨‍👩‍👧', size: 'md', description: 'Household composition breakdown.' },
    { id: 'householdSize', label: 'Size Dist', icon: '🔢', size: 'md', description: 'Distribution of household sizes.' },
    { id: 'householdList', label: 'Largest Households', icon: '📋', size: 'md', description: 'Your largest households.' },
];

export const PEOPLE_RISK_WIDGETS: WidgetDefinition[] = [
    { id: 'riskDistribution', label: 'Risk Distribution', icon: '⚠️', size: 'md', description: 'How people are spread across risk levels.' },
    { id: 'atRiskList', label: 'At Risk List', icon: '📋', size: 'md', description: 'People currently flagged as at-risk.' },
    { id: 'riskChanges', label: 'Status Changes', icon: '📉', size: 'md', description: 'Recent moves between risk levels.' },
    { id: 'risk_factors', label: 'Risk Factors', icon: '🚩', size: 'md', description: 'Most common factors driving risk.' },
    { id: 'people_directory', label: 'Directory', icon: '📒', size: 'full', description: 'Searchable directory of all people.' },
];

export const GROUPS_WIDGETS: WidgetDefinition[] = [
    { id: 'groups_risk_agent', label: 'Risk Consultant', icon: '🩺', size: 'lg', description: 'AI consultant that flags struggling groups.' },
    { id: 'groups_ai_agent', label: 'Activate Agent', icon: '🚀', size: 'lg', description: 'Activate the AI groups assistant.' },
    { id: 'groups_connection_rate', label: 'Connection Rate', icon: '🔗', size: 'sm', description: 'Share of people connected to a group.' },
    { id: 'groups_health_distribution', label: 'Health Distribution', icon: '⚕️', size: 'sm', description: 'Groups by health status.' },
    { id: 'groups_action_center', label: 'Action Center', icon: '🚨', size: 'lg', description: 'Prioritized group actions to take now.' },
    { id: 'groups_health', label: 'Groups Health', icon: '❤️', size: 'sm', description: 'Overall group health summary.' },
    { id: 'groups_stats', label: 'Groups Stats', icon: '📊', size: 'full', description: 'Headline group counts and health.' },
    { id: 'groups_size_distribution', label: 'Size Distribution', icon: '📏', size: 'lg', description: 'Distribution of group sizes.' },
    { id: 'groups_net_growth', label: 'Net Group Growth', icon: '📈', size: 'lg', description: 'Groups gained vs. lost over time.' },
    { id: 'groups_meeting_days', label: 'Meeting Days', icon: '📆', size: 'lg', description: 'When groups meet across the week.' },
    { id: 'groups_new_members', label: 'New Members', icon: '🌱', size: 'sm', description: 'Recently added group members.' },
    { id: 'groups_unconnected', label: 'Unconnected People', icon: '🧩', size: 'sm', description: 'People not yet in any group.' },
    { id: 'groups_health_factors', label: 'Health Factors', icon: '🧭', size: 'sm', description: 'Factors driving group health scores.' },
    { id: 'groups_type_performance', label: 'Type Performance', icon: '🏆', size: 'lg', description: 'How each group type is performing.' },
    { id: 'groups_visitor_funnel', label: 'Visitor Engagement', icon: '👋', size: 'sm', description: 'Visitor-to-member group journey.' },
    { id: 'groups_leader_load', label: 'Leader Load', icon: '🧑‍🏫', size: 'sm', description: 'How many groups each leader carries.' },
    { id: 'groups_by_campus', label: 'Groups by Campus', icon: '🏢', size: 'lg', description: 'Group counts by campus.' },
    { id: 'groups_age_demographics', label: 'Age Demographics', icon: '🎂', size: 'lg', description: 'Age mix within groups.' },
    { id: 'event_attendance', label: 'Group Attendance', icon: '📅', size: 'lg', description: 'Group attendance over time.' },
    { id: 'groups_gender', label: 'Gender Breakdown', icon: '🚻', size: 'sm', description: 'Gender mix within groups.' },
    { id: 'types', label: 'Group Types', icon: '🏷️', size: 'sm', description: 'Breakdown of group types.' },
    { id: 'recent_groups', label: 'New Groups', icon: '✨', size: 'sm', description: 'Recently created groups.' },
    { id: 'group_info', label: 'Group Info', icon: 'ℹ️', size: 'full', description: 'Detailed group information table.' },
    { id: 'benchmark_group_att', label: 'Size Benchmark', icon: '⚖️', size: 'sm', description: 'Group size vs. comparable churches.' },
];

export const SERVICES_OVERVIEW_WIDGETS: WidgetDefinition[] = [
    { id: 'services_stats', label: 'Services Stats', icon: '📊', size: 'full', description: 'Weekend attendance and serving headline numbers.' },
    { id: 'attendance_growth', label: 'Attendance Growth', icon: '📈', size: 'sm', description: 'Attendance trend over recent weeks.' },
    { id: 'first_time_guests', label: 'First-Time Guests', icon: '🙌', size: 'sm', description: 'First-time guests each week.' },
    { id: 'volunteer_health', label: 'Volunteer Health', icon: '❤️‍🩹', size: 'sm', description: 'Health of your volunteer base.' },
    { id: 'team_fill_rate', label: 'Team Fill Rate', icon: '🪑', size: 'lg', description: 'How fully serving teams are staffed.' },
    { id: 'upcoming_plans_list', label: 'Upcoming Plans', icon: '📅', size: 'lg', description: 'Upcoming service plans.' },
    { id: 'staffing_needs', label: 'Staffing Needs', icon: '🚨', size: 'lg', description: 'Open serving positions that need filling.' },
    { id: 'serving_frequency', label: 'Serving Frequency', icon: '🔁', size: 'lg', description: 'How often volunteers are serving.' },
    { id: 'unscheduled_volunteers', label: 'Unscheduled Volunteers', icon: '🪑', size: 'sm', description: 'Volunteers not yet scheduled.' },
    { id: 'volunteer_ratio', label: 'Volunteer Ratio', icon: '⚖️', size: 'sm', description: 'Volunteers per attendee.' },
    { id: 'confirmation_health', label: 'Confirmation Health', icon: '✔️', size: 'sm', description: 'Serving confirmation rates.' },
    { id: 'staffing_forecast', label: 'Staffing Forecast', icon: '🔮', size: 'lg', description: 'Projected staffing needs ahead.' },
    { id: 'top_songs', label: 'Top Songs', icon: '🎵', size: 'lg', description: 'Most-used worship songs.' },
    { id: 'song_rotation', label: 'Song Rotation', icon: '🎶', size: 'lg', description: 'How songs are rotating over time.' },
    { id: 'positions', label: 'Positions', icon: '🪑', size: 'lg', description: 'Serving positions overview.' },
    { id: 'checkin_history', label: 'Check-ins', icon: '✅', size: 'full', description: 'Attendance check-in history.' },
];

export const SERVICES_ATTENDANCE_WIDGETS: WidgetDefinition[] = [
    { id: 'checkin_history', label: 'Check-ins', icon: '✅', size: 'full', description: 'Attendance check-in history.' },
    { id: 'attendance_growth', label: 'Attendance Growth', icon: '📈', size: 'sm', description: 'Attendance trend over recent weeks.' },
    { id: 'first_time_guests', label: 'First-Time Guests', icon: '🙌', size: 'sm', description: 'First-time guests each week.' },
    { id: 'digital_vs_physical', label: 'Digital vs In-Person', icon: '💻', size: 'sm', description: 'Online vs. in-person attendance.' },
    { id: 'attendance_breakdown', label: 'Attendance Breakdown', icon: '🧮', size: 'lg', description: 'Attendance broken down by segment.' },
    { id: 'volunteer_ratio', label: 'Volunteer Ratio', icon: '⚖️', size: 'sm', description: 'Volunteers per attendee.' },
    { id: 'events', label: 'Events', icon: '📅', size: 'lg', description: 'Attendance by event.' },
    { id: 'services_stats', label: 'Services Stats', icon: '📊', size: 'full', description: 'Weekend attendance headline numbers.' },
];

export const SERVICES_TEAMS_WIDGETS: WidgetDefinition[] = [
    { id: 'services_teams_list', label: 'Teams Directory', icon: '📋', size: 'full', description: 'Directory of all serving teams.' },
    { id: 'team_roster', label: 'Team Roster', icon: '👥', size: 'lg', description: 'Roster for a serving team.' },
    { id: 'burnout_watchlist', label: 'Burnout Watchlist (>2x Weekly)', icon: '🔥', size: 'lg', description: 'Volunteers serving too frequently.' },
    { id: 'volunteer_health', label: 'Volunteer Health', icon: '❤️‍🩹', size: 'sm', description: 'Health of your volunteer base.' },
    { id: 'serving_frequency', label: 'Serving Frequency', icon: '🔁', size: 'lg', description: 'How often volunteers are serving.' },
    { id: 'unscheduled_volunteers', label: 'Unscheduled Volunteers', icon: '🪑', size: 'sm', description: 'Volunteers not yet scheduled.' },
    { id: 'team_fill_rate', label: 'Team Fill Rate', icon: '🪑', size: 'lg', description: 'How fully serving teams are staffed.' },
    { id: 'confirmation_health', label: 'Confirmation Health', icon: '✔️', size: 'sm', description: 'Serving confirmation rates.' },
    { id: 'staffing_forecast', label: 'Staffing Forecast', icon: '🔮', size: 'lg', description: 'Projected staffing needs ahead.' },
];

export const GIVING_WIDGETS: WidgetDefinition[] = [
    { id: 'keyMetrics', label: 'Key Financial Overview', icon: '💰', size: 'md', description: 'Total giving and key financial indicators.' },
    { id: 'recurring_revenue', label: 'Recurring vs One-Time', icon: '🔄', size: 'sm', description: 'Recurring vs. one-time giving.' },
    { id: 'payment_methods', label: 'Payment Methods & Fees', icon: '💳', size: 'md', description: 'Payment methods and processing fees.' },
    { id: 'giving_forecast', label: 'Year-End Forecast', icon: '🔮', size: 'sm', description: 'Projected year-end giving.' },
    { id: 'gift_size_distribution', label: 'Gift Size Distribution', icon: '📊', size: 'md', description: 'Distribution of gift sizes.' },
    { id: 'batch_summary', label: 'Recent Deposits', icon: '🧾', size: 'sm', description: 'Recent deposit batches.' },
    { id: 'household_giving', label: 'Household Giving', icon: '🏠', size: 'sm', description: 'Giving by household.' },
    { id: 'giving_consistency', label: 'Giving Consistency', icon: '🔁', size: 'sm', description: 'How consistently people give.' },
    { id: 'giving_seasonality', label: 'Giving Seasonality', icon: '🗓️', size: 'md', description: 'Seasonal giving patterns.' },
    { id: 'lapsed_at_risk', label: 'Lapsed $ at Risk', icon: '⚠️', size: 'sm', description: 'Giving dollars at risk from lapsing donors.' },
    { id: 'budgetProgress', label: 'Budget Progress', icon: '🌡️', size: 'md', description: 'Progress against budget.' },
    { id: 'trendsComparison', label: 'Trends Comp', icon: '📉', size: 'md', description: 'Giving trends vs. prior periods.' },
    { id: 'funds', label: 'Funds', icon: '🏦', size: 'sm', description: 'Giving by fund.' },
    { id: 'avgGift', label: 'Avg Gift Demographics', icon: '🎁', size: 'sm', description: 'Average gift by demographic.' },
    { id: 'benchmark_giving_avg', label: 'Giving Avg Benchmark', icon: '⚖️', size: 'md', description: 'Average giving vs. comparable churches.' },
    { id: 'benchmark_giving_age', label: 'Giving Age Benchmark', icon: '⚖️', size: 'sm', description: 'Giving by age vs. comparable churches.' },
    { id: 'currentVsPrevious', label: 'Current vs Prev', icon: '🆚', size: 'sm', description: 'Current vs. previous period.' },
    { id: 'fundPerformance', label: 'Fund Perf', icon: '📊', size: 'md', description: 'Performance by fund.' },
    { id: 'cumulativeYTD', label: 'Cumulative YTD', icon: '🗓️', size: 'md', description: 'Cumulative giving year-to-date.' },
    { id: 'donorAcquisition', label: 'Acquisition', icon: '🤝', size: 'md', description: 'New donor acquisition over time.' },
    { id: 'lifecycleHeadline', label: 'Lifecycle', icon: '🔄', size: 'sm', description: 'Donor lifecycle summary.' },
    { id: 'donorLifecycle', label: 'Lifecycle Chart', icon: '📊', size: 'md', description: 'Donors across lifecycle stages.' },
    { id: 'topGivers', label: 'Top Donors', icon: '🏆', size: 'sm', description: 'Top donors.' },
    { id: 'demographics', label: 'Demographics', icon: '👥', size: 'sm', description: 'Donor demographics.' },
    { id: 'lifecycleActive', label: 'Active List', icon: '✅', size: 'sm', description: 'Active donors list.' },
    { id: 'lifecycleNew', label: 'New List', icon: '🌱', size: 'sm', description: 'New donors list.' },
    { id: 'lifecycleLapsed', label: 'Lapsed List', icon: '📉', size: 'sm', description: 'Lapsed donors list.' },
    { id: 'lifecycleOccasional', label: 'Occasional List', icon: '🌤️', size: 'sm', description: 'Occasional donors list.' },
    { id: 'lifecycleRecovered', label: 'Recovered List', icon: '🔄', size: 'sm', description: 'Recovered donors list.' },
    { id: 'lifecycleInactive', label: 'Inactive List', icon: '💤', size: 'sm', description: 'Inactive donors list.' },
    { id: 'lifecycleSecond', label: 'Second Time List', icon: '2️⃣', size: 'sm', description: 'Second-time donors list.' },
    { id: 'lastWeekFunds', label: 'Last Week by Fund', icon: '📅', size: 'sm', description: "Last week's giving by fund." },
    { id: 'givingByStatus', label: 'Giving By Status', icon: '🏷️', size: 'md', description: 'Giving by membership status.' },
    { id: 'givingAgeDemographics', label: 'Giving - Age Demographics', icon: '🎂', size: 'md', description: 'Giving by age group.' },
    { id: 'averageGiving', label: 'Average Giving', icon: '📊', size: 'md', description: 'Average giving over time.' },
];

export const PASTORAL_CHURCH_WIDGETS: WidgetDefinition[] = [
    { id: 'church_growth_stats', label: 'Growth Stats', icon: '📈', size: 'full', description: 'Church growth headline stats.' },
    { id: 'church_spiritual_stats', label: 'Spiritual Stats', icon: '🕊️', size: 'lg', description: 'Spiritual health indicators.' },
    { id: 'church_attendance_chart', label: 'Attendance Chart', icon: '📊', size: 'sm', description: 'Attendance over time.' },
    { id: 'church_guest_funnel', label: 'Guest Funnel', icon: '🔽', size: 'sm', description: 'Guest-to-member funnel.' },
    { id: 'church_gender_comparison', label: 'Gender Gap', icon: '🚻', size: 'sm', description: 'Gender gap vs. community.' },
    { id: 'church_age_comparison', label: 'Age Gap', icon: '🎂', size: 'sm', description: 'Age gap vs. community.' },
];

export const PASTORAL_MEMBERSHIP_WIDGETS: WidgetDefinition[] = [
    { id: 'member_headline_stats', label: 'Member Stats', icon: '📊', size: 'full', description: 'Membership headline stats.' },
    { id: 'member_map', label: 'Member Map', icon: '🗺️', size: 'full', description: 'Map of where members live.' },
    { id: 'member_age_chart', label: 'Generational Mix', icon: '🥧', size: 'sm', description: 'Generational mix of members.' },
    { id: 'member_attrition_chart', label: 'Attrition', icon: '📉', size: 'lg', description: 'Membership attrition over time.' },
    { id: 'member_pastoral_touches', label: 'Pastoral Touches', icon: 'hand', size: 'sm', description: 'Pastoral care touches logged.' },
    { id: 'member_unconnected', label: 'Unconnected', icon: '🔗', size: 'sm', description: 'Members not connected to groups.' },
    { id: 'member_geo_list', label: 'City Penetration', icon: '🏙️', size: 'lg', description: 'City-by-city membership penetration.' },
    { id: 'member_missional_gap', label: 'Missional Gap', icon: '🎯', size: 'sm', description: 'Gap between members and community need.' },
];

export const PASTORAL_COMMUNITY_WIDGETS: WidgetDefinition[] = [
    { id: 'censusHero', label: 'Census Hero', icon: '🏛️', size: 'lg', description: 'Community census snapshot.' },
    { id: 'community_ai_agent', label: 'Community Agent', icon: '🤖', size: 'lg', description: 'AI community insights assistant.' },
    { id: 'culturalMosaic', label: 'Cultural Mosaic', icon: '🎨', size: 'sm', description: 'Cultural makeup of the community.' },
    { id: 'commute', label: 'Commute', icon: '🚗', size: 'sm', description: 'Commute patterns.' },
    { id: 'education', label: 'Education', icon: '🎓', size: 'sm', description: 'Education levels.' },
    { id: 'economicHealth', label: 'Economy', icon: '💵', size: 'sm', description: 'Local economic health.' },
    { id: 'housingVacancy', label: 'Housing Vacancy', icon: '🏠', size: 'sm', description: 'Housing vacancy rates.' },
    { id: 'housingStability', label: 'Housing Stability', icon: '🔑', size: 'sm', description: 'Housing stability.' },
    { id: 'ministrySignals', label: 'Signals', icon: '📡', size: 'lg', description: 'Signals pointing to ministry opportunities.' },
    { id: 'familyStructure', label: 'Families', icon: '👨‍👩‍👧', size: 'sm', description: 'Family structures in the community.' },
    { id: 'communityAge', label: 'Age', icon: '🎂', size: 'sm', description: 'Community age distribution.' },
    { id: 'communityGender', label: 'Gender', icon: '🚻', size: 'sm', description: 'Community gender distribution.' },
];

export const PASTORAL_CARE_WIDGETS: WidgetDefinition[] = [
    { id: 'care_recommended_followups', label: 'Recommended Follow-Ups', icon: '✨', size: 'full', description: 'AI-recommended people to follow up with.' },
    { id: 'care_log', label: 'Care Log', icon: '📝', size: 'lg', description: 'Log of pastoral care interactions.' },
    { id: 'prayer_requests', label: 'Prayer Requests', icon: '🙏', size: 'lg', description: 'Incoming prayer requests.' },
    { id: 'follow_ups', label: 'Follow-ups', icon: '📅', size: 'sm', description: 'Scheduled follow-ups.' },
    { id: 'care_ai_agent', label: 'Care Advisor', icon: '🤖', size: 'lg', description: 'AI pastoral care advisor.' },
    { id: 'care_people_list', label: 'People Risk List', icon: '📋', size: 'full', description: 'People needing care, ranked by risk.' },
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

// ---------------------------------------------------------------------------
// Shared widget-sizing system
//
// Every analytics view renders widgets into the same 4-column grid
// (`grid-cols-1 md:grid-cols-2 lg:grid-cols-4`). A widget's width is declared
// once via `size` on its WidgetDefinition and resolved here, so all views stay
// visually consistent and the AI/role-suggested ordering lays out cleanly.
// ---------------------------------------------------------------------------

const SPAN_CLASS_BY_SIZE: Record<NonNullable<WidgetDefinition['size']>, string> = {
    sm:   'col-span-1',
    md:   'col-span-1 lg:col-span-2',
    lg:   'col-span-1 lg:col-span-2',
    full: 'col-span-1 md:col-span-2 lg:col-span-4',
};

/** Tailwind col-span classes for a given widget size (defaults to `md`). */
export const getWidgetSpanClass = (size?: WidgetDefinition['size']): string =>
    SPAN_CLASS_BY_SIZE[size ?? 'md'];

/** Look up a widget's declared size within a specific view. */
export const getWidgetSize = (view: string, id: string): WidgetDefinition['size'] =>
    (ALL_WIDGETS[view] || []).find(w => w.id === id)?.size;

/** Convenience: resolve the col-span classes for a widget within a view. */
export const getWidgetSpan = (view: string, id: string): string =>
    getWidgetSpanClass(getWidgetSize(view, id));

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
