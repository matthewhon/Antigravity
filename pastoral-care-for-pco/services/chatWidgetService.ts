import {
    ChatWidgetAttachment,
    ChatWidgetSnapshotItem,
    Church,
    DetailedDonation,
    LifecycleDonor,
    PastoralNote,
    PcoFund,
    PcoGroup,
    PcoPerson,
    PrayerRequest,
    ServicesDashboardData,
    ServicesTeam,
    TeamChatArea,
    WidgetDefinition,
} from '../types';
import {
    ALL_WIDGETS,
    GIVING_WIDGETS,
    GROUPS_WIDGETS,
    PASTORAL_CARE_WIDGETS,
    PASTORAL_CHURCH_WIDGETS,
    PASTORAL_COMMUNITY_WIDGETS,
    PASTORAL_MEMBERSHIP_WIDGETS,
    PEOPLE_HOUSEHOLD_WIDGETS,
    PEOPLE_OVERVIEW_WIDGETS,
    PEOPLE_RISK_WIDGETS,
    SERVICES_ATTENDANCE_WIDGETS,
    SERVICES_OVERVIEW_WIDGETS,
    SERVICES_TEAMS_WIDGETS,
} from '../constants/widgetRegistry';
import { calculateGivingAnalytics, DEFAULT_LIFECYCLE_SETTINGS } from './analyticsService';

export interface ChatWidgetDataContext {
    church?: Church | null;
    people: PcoPerson[];
    donations: DetailedDonation[];
    funds: PcoFund[];
    groups: PcoGroup[];
    teams: ServicesTeam[];
    servicesData?: ServicesDashboardData | null;
    pastoralNotes: PastoralNote[];
    prayerRequests: PrayerRequest[];
    campusId?: string;
}

export interface ChatSlashCommandOption {
    command: string;
    widgetId: string;
    label: string;
    description: string;
    icon: string;
    area: TeamChatArea;
}

export const CHAT_SLASH_COMMANDS: ChatSlashCommandOption[] = [
    {
        command: '/lapsed',
        widgetId: 'lifecycleLapsed',
        label: 'Lapsed Donors List',
        description: 'Share lapsed donors with monthly $ at risk & 1-click Claim buttons',
        icon: '📉',
        area: 'giving',
    },
    {
        command: '/lapsed-risk',
        widgetId: 'lapsed_at_risk',
        label: 'Lapsed $ at Risk',
        description: 'Giving dollars at risk from lapsing donors and top priority families',
        icon: '⚠️',
        area: 'giving',
    },
    {
        command: '/top-givers',
        widgetId: 'topGivers',
        label: 'Top Donors',
        description: 'Share top contributing donors and stewardship concentration',
        icon: '🏆',
        area: 'giving',
    },
    {
        command: '/new-donors',
        widgetId: 'lifecycleNew',
        label: 'New Donors List',
        description: 'First-time givers to celebrate and thank',
        icon: '🌱',
        area: 'giving',
    },
    {
        command: '/giving',
        widgetId: 'keyMetrics',
        label: 'Key Financial Overview',
        description: 'Headline giving, recurring donors, average gift, and fund breakdown',
        icon: '💰',
        area: 'giving',
    },
    {
        command: '/at-risk',
        widgetId: 'atRiskList',
        label: 'At-Risk People Watchlist',
        description: 'Members currently flagged as At Risk or Critical with Claim buttons',
        icon: '🚨',
        area: 'people',
    },
    {
        command: '/followups',
        widgetId: 'care_recommended_followups',
        label: 'Recommended Care Follow-Ups',
        description: 'High-priority pastoral care follow-ups to claim as a team',
        icon: '✨',
        area: 'care',
    },
    {
        command: '/prayer',
        widgetId: 'prayer_requests',
        label: 'Active Prayer Requests',
        description: 'Share active congregation prayer requests with the care team',
        icon: '🙏',
        area: 'care',
    },
    {
        command: '/struggling-teams',
        widgetId: 'struggling_teams',
        label: 'Struggling Serving Teams',
        description: 'Understaffed or high-burnout volunteer teams needing support',
        icon: '🪑',
        area: 'services',
    },
    {
        command: '/groups-action',
        widgetId: 'groups_action_center',
        label: 'Groups Action Center',
        description: 'Small groups needing leader support or attendance follow-up',
        icon: '📂',
        area: 'groups',
    },
    {
        command: '/birthdays',
        widgetId: 'birthdays',
        label: 'Upcoming Birthdays',
        description: 'Share upcoming member birthdays so staff can celebrate them',
        icon: '🎉',
        area: 'people',
    },
];

const money = (n: number) => '$' + Math.round(n || 0).toLocaleString();

/** Resolve any widget ID or title to its permission area and definition */
export function resolveWidgetMeta(widgetIdOrTitle: string): {
    widgetId: string;
    label: string;
    icon: string;
    area: TeamChatArea;
    description?: string;
} {
    const clean = (widgetIdOrTitle || '').trim();
    const lower = clean.toLowerCase();

    const pools: Array<{ area: TeamChatArea; list: WidgetDefinition[] }> = [
        { area: 'giving', list: GIVING_WIDGETS },
        { area: 'people', list: [...PEOPLE_OVERVIEW_WIDGETS, ...PEOPLE_HOUSEHOLD_WIDGETS, ...PEOPLE_RISK_WIDGETS] },
        { area: 'groups', list: GROUPS_WIDGETS },
        { area: 'services', list: [...SERVICES_OVERVIEW_WIDGETS, ...SERVICES_ATTENDANCE_WIDGETS, ...SERVICES_TEAMS_WIDGETS] },
        { area: 'care', list: [...PASTORAL_CARE_WIDGETS, ...PASTORAL_CHURCH_WIDGETS, ...PASTORAL_MEMBERSHIP_WIDGETS, ...PASTORAL_COMMUNITY_WIDGETS] },
    ];

    for (const pool of pools) {
        const match = pool.list.find(
            w => w.id === clean || w.id.toLowerCase() === lower || w.label.toLowerCase() === lower
        );
        if (match) {
            return {
                widgetId: match.id,
                label: match.label,
                icon: match.icon,
                area: pool.area,
                description: match.description,
            };
        }
    }

    // Heuristics by title if invoked from a generic WidgetWrapper title
    if (lower.includes('lapsed')) {
        return { widgetId: 'lifecycleLapsed', label: clean || 'Lapsed Donors', icon: '📉', area: 'giving' };
    }
    if (lower.includes('donor') || lower.includes('giving') || lower.includes('fund') || lower.includes('gift') || lower.includes('pledge') || lower.includes('budget')) {
        return { widgetId: clean || 'keyMetrics', label: clean || 'Giving Insight', icon: '💰', area: 'giving' };
    }
    if (lower.includes('prayer') || lower.includes('care') || lower.includes('pastoral') || lower.includes('follow')) {
        return { widgetId: clean || 'care_recommended_followups', label: clean || 'Pastoral Care Insight', icon: '🕊️', area: 'care' };
    }
    if (lower.includes('group')) {
        return { widgetId: clean || 'groups_stats', label: clean || 'Groups Insight', icon: '📂', area: 'groups' };
    }
    if (lower.includes('service') || lower.includes('volunteer') || lower.includes('team') || lower.includes('song')) {
        return { widgetId: clean || 'services_stats', label: clean || 'Services Insight', icon: '🎵', area: 'services' };
    }

    return {
        widgetId: clean || 'people_stats',
        label: clean || 'People Insight',
        icon: '📊',
        area: 'people',
    };
}

/** Convert LifecycleDonor[] directly into a ChatWidgetAttachment (used by DonorListWidget Discuss button) */
export function buildDonorListChatWidget(
    title: string,
    donors: LifecycleDonor[],
    people: PcoPerson[] = [],
    explicitWidgetId?: string
): ChatWidgetAttachment {
    const lower = title.toLowerCase();
    const widgetId =
        explicitWidgetId ||
        (lower.includes('lapsed') ? 'lifecycleLapsed' :
         lower.includes('new') ? 'lifecycleNew' :
         lower.includes('active') ? 'lifecycleActive' :
         lower.includes('recovered') ? 'lifecycleRecovered' :
         lower.includes('occasional') ? 'lifecycleOccasional' :
         lower.includes('inactive') ? 'lifecycleInactive' :
         lower.includes('second') ? 'lifecycleSecond' : 'lifecycleLapsed');

    const totalMonthly = donors.reduce((sum, d) => sum + (d.avgMonthlyAmount || 0), 0);
    const totalLifetime = donors.reduce((sum, d) => sum + (d.totalAmount || 0), 0);
    const peopleMap = new Map(people.map(p => [p.id, p]));

    const items: ChatWidgetSnapshotItem[] = donors.slice(0, 25).map(d => {
        const person = peopleMap.get(d.id);
        const lastDateStr = d.lastGiftDate ? new Date(d.lastGiftDate).toLocaleDateString() : 'N/A';
        return {
            id: d.id,
            name: d.name,
            avatar: d.avatar || person?.avatar || null,
            primaryStat: `Avg/mo: ${money(d.avgMonthlyAmount)}`,
            secondaryStat: `Last gift: ${lastDateStr} • Total: ${money(d.totalAmount)}`,
            riskCategory: d.riskProfile?.category || person?.riskProfile?.category,
            phone: person?.phone,
            email: person?.email,
        };
    });

    const isLapsed = widgetId === 'lifecycleLapsed' || lower.includes('lapsed');

    return {
        widgetId,
        area: 'giving',
        title,
        icon: isLapsed ? '📉' : '💰',
        snapshot: {
            capturedAt: Date.now(),
            headlineValue: isLapsed
                ? `${donors.length} Lapsed Donor${donors.length === 1 ? '' : 's'} • ${money(totalMonthly)}/mo at risk`
                : `${donors.length} Donor${donors.length === 1 ? '' : 's'} • ${money(totalMonthly)}/mo avg`,
            subtitle: isLapsed
                ? 'Click any donor to view their profile or click "Claim" to coordinate personal outreach.'
                : 'Click any donor to view their profile or coordinate stewardship follow-up.',
            summaryMetrics: [
                { label: 'Donors', value: String(donors.length), tone: isLapsed ? 'rose' : 'indigo' },
                { label: isLapsed ? 'Monthly $ at Risk' : 'Combined Monthly Avg', value: `${money(totalMonthly)}/mo`, tone: isLapsed ? 'amber' : 'emerald' },
                { label: 'Historical Giving', value: money(totalLifetime), tone: 'slate' },
            ],
            items,
        },
        claims: {},
    };
}

/** Build a rich ChatWidgetAttachment for any widget ID or title using live tenant data */
export function buildChatWidgetAttachment(
    widgetIdOrTitle: string,
    ctx: ChatWidgetDataContext
): ChatWidgetAttachment {
    const meta = resolveWidgetMeta(widgetIdOrTitle);
    const { widgetId, label, icon, area } = meta;
    const peopleMap = new Map(ctx.people.map(p => [p.id, p]));

    // ── 1. GIVING WIDGETS ────────────────────────────────────────────────────
    if (area === 'giving') {
        const givingAnalytics = calculateGivingAnalytics(
            ctx.donations,
            'Year',
            undefined,
            ctx.people,
            ctx.church?.donorLifecycleSettings || DEFAULT_LIFECYCLE_SETTINGS
        );

        if (widgetId === 'lifecycleLapsed' || widgetId === 'lapsed_at_risk') {
            return buildDonorListChatWidget(
                widgetId === 'lapsed_at_risk' ? 'Lapsed $ at Risk' : 'Lapsed Donors List',
                givingAnalytics.lists.lapsed || [],
                ctx.people,
                widgetId
            );
        }
        if (widgetId === 'lifecycleNew') {
            return buildDonorListChatWidget('New Donors List', givingAnalytics.lists.new || [], ctx.people, widgetId);
        }
        if (widgetId === 'lifecycleActive') {
            return buildDonorListChatWidget('Active Donors List', givingAnalytics.lists.active || [], ctx.people, widgetId);
        }
        if (widgetId === 'lifecycleRecovered') {
            return buildDonorListChatWidget('Recovered Donors List', givingAnalytics.lists.recovered || [], ctx.people, widgetId);
        }
        if (widgetId === 'lifecycleOccasional') {
            return buildDonorListChatWidget('Occasional Donors List', givingAnalytics.lists.occasional || [], ctx.people, widgetId);
        }
        if (widgetId === 'lifecycleInactive') {
            return buildDonorListChatWidget('Inactive Donors List', givingAnalytics.lists.inactive || [], ctx.people, widgetId);
        }
        if (widgetId === 'lifecycleSecond') {
            return buildDonorListChatWidget('Second-Time Donors List', givingAnalytics.lists.secondTime || [], ctx.people, widgetId);
        }
        if (widgetId === 'topGivers') {
            const topList = (givingAnalytics.topGiversList || []).slice(0, 20);
            const items: ChatWidgetSnapshotItem[] = topList.map((d: any) => {
                const person = peopleMap.get(d.id);
                return {
                    id: d.id || d.name,
                    name: d.name || 'Donor',
                    avatar: d.avatar || person?.avatar || null,
                    primaryStat: money(d.totalAmount || d.amount || 0),
                    secondaryStat: d.giftCount ? `${d.giftCount} gifts YTD` : 'Top Contributor',
                    riskCategory: person?.riskProfile?.category,
                    phone: person?.phone,
                    email: person?.email,
                };
            });
            return {
                widgetId: 'topGivers',
                area: 'giving',
                title: 'Top Donors (YTD)',
                icon: '🏆',
                snapshot: {
                    capturedAt: Date.now(),
                    headlineValue: `${topList.length} Top Donors • ${Math.round(givingAnalytics.topGiverConcentration || 0)}% of total giving`,
                    subtitle: 'YTD top contributing households & individuals',
                    summaryMetrics: [
                        { label: 'Total Giving YTD', value: money(givingAnalytics.totalGiving), tone: 'emerald' },
                        { label: 'Top 10% Share', value: `${Math.round(givingAnalytics.topGiverConcentration || 0)}%`, tone: 'amber' },
                        { label: 'Active Donors', value: String(givingAnalytics.contributingPeople), tone: 'indigo' },
                    ],
                    items,
                },
                claims: {},
            };
        }

        // Default Giving overview / funds / consistency / etc.
        const lapsedList = givingAnalytics.lists.lapsed || [];
        const lapsedMonthlyRisk = lapsedList.reduce((s, d) => s + (d.avgMonthlyAmount || 0), 0);
        const topFunds = (givingAnalytics.givingByFund || []).slice(0, 5);
        const items: ChatWidgetSnapshotItem[] =
            lapsedList.length > 0
                ? lapsedList.slice(0, 10).map(d => {
                      const person = peopleMap.get(d.id);
                      return {
                          id: d.id,
                          name: d.name,
                          avatar: d.avatar || person?.avatar || null,
                          primaryStat: `Lapsed • ${money(d.avgMonthlyAmount)}/mo`,
                          secondaryStat: `Last gift: ${new Date(d.lastGiftDate).toLocaleDateString()}`,
                          riskCategory: d.riskProfile?.category || person?.riskProfile?.category,
                          phone: person?.phone,
                          email: person?.email,
                      };
                  })
                : topFunds.map((f, i) => ({
                      id: `fund_${i}`,
                      name: f.name,
                      primaryStat: money(f.value),
                      secondaryStat: 'YTD Fund Total',
                  }));

        return {
            widgetId,
            area: 'giving',
            title: label,
            icon,
            snapshot: {
                capturedAt: Date.now(),
                headlineValue: `${money(givingAnalytics.totalGiving)} YTD • ${givingAnalytics.contributingPeople} Donors`,
                subtitle: `${lapsedList.length} lapsed donors (${money(lapsedMonthlyRisk)}/mo at risk)`,
                summaryMetrics: [
                    { label: 'YTD Giving', value: money(givingAnalytics.totalGiving), tone: 'emerald' },
                    { label: 'Recurring Givers', value: String(givingAnalytics.recurringGivers), tone: 'indigo' },
                    { label: 'Lapsed Donors', value: String(lapsedList.length), tone: 'rose' },
                    { label: 'Avg Gift', value: money(givingAnalytics.averageGift), tone: 'slate' },
                ],
                items,
            },
            claims: {},
        };
    }

    // ── 2. PEOPLE & RISK WIDGETS ─────────────────────────────────────────────
    if (area === 'people') {
        const atRiskPeople = ctx.people
            .filter(p => p.riskProfile?.category === 'Disconnected' || p.riskProfile?.category === 'At Risk')
            .sort((a, b) => (a.riskProfile?.score ?? 100) - (b.riskProfile?.score ?? 100));

        if (widgetId === 'birthdays') {
            const now = new Date();
            const currentMonth = now.getMonth() + 1;
            const upcoming = ctx.people
                .filter(p => {
                    if (!p.birthdate) return false;
                    const parts = p.birthdate.split('-');
                    const m = parseInt(parts[1], 10);
                    return m === currentMonth || m === (currentMonth % 12) + 1;
                })
                .slice(0, 20);
            return {
                widgetId,
                area: 'people',
                title: 'Upcoming Birthdays',
                icon: '🎉',
                snapshot: {
                    capturedAt: Date.now(),
                    headlineValue: `${upcoming.length} Upcoming Birthdays`,
                    subtitle: 'Claim a member to send a birthday text or call',
                    summaryMetrics: [
                        { label: 'Upcoming', value: String(upcoming.length), tone: 'indigo' },
                        { label: 'Total Directory', value: String(ctx.people.length), tone: 'slate' },
                    ],
                    items: upcoming.map(p => ({
                        id: p.id,
                        name: p.name,
                        avatar: p.avatar,
                        primaryStat: p.birthdate ? `🎂 ${p.birthdate.slice(5)}` : 'Upcoming',
                        secondaryStat: p.membership || 'Congregation',
                        riskCategory: p.riskProfile?.category,
                        phone: p.phone,
                        email: p.email,
                    })),
                },
                claims: {},
            };
        }

        if (widgetId === 'recent') {
            const recentPeople = [...ctx.people]
                .sort((a, b) => new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime())
                .slice(0, 20);
            return {
                widgetId,
                area: 'people',
                title: 'New People Added',
                icon: '✨',
                snapshot: {
                    capturedAt: Date.now(),
                    headlineValue: `${recentPeople.length} Recent Profiles`,
                    subtitle: 'Claim a newcomer to welcome them and help them connect',
                    summaryMetrics: [
                        { label: 'Recent Profiles', value: String(recentPeople.length), tone: 'emerald' },
                        { label: 'Total People', value: String(ctx.people.length), tone: 'indigo' },
                    ],
                    items: recentPeople.map(p => ({
                        id: p.id,
                        name: p.name,
                        avatar: p.avatar,
                        primaryStat: p.membership || 'New Profile',
                        secondaryStat: p.createdAt ? `Added ${new Date(p.createdAt).toLocaleDateString()}` : 'New',
                        riskCategory: p.riskProfile?.category,
                        phone: p.phone,
                        email: p.email,
                    })),
                },
                claims: {},
            };
        }

        // Default People / At-Risk List
        const criticalCount = ctx.people.filter(p => p.riskProfile?.category === 'Disconnected').length;
        const atRiskCount = ctx.people.filter(p => p.riskProfile?.category === 'At Risk').length;
        const healthyCount = ctx.people.filter(p => p.riskProfile?.category === 'Healthy').length;

        return {
            widgetId,
            area: 'people',
            title: label,
            icon,
            snapshot: {
                capturedAt: Date.now(),
                headlineValue: `${atRiskPeople.length} At-Risk / Critical Members • ${ctx.people.length} Total`,
                subtitle: 'Prioritized by engagement risk score — claim a person to follow up',
                summaryMetrics: [
                    { label: 'Critical', value: String(criticalCount), tone: 'rose' },
                    { label: 'At Risk', value: String(atRiskCount), tone: 'amber' },
                    { label: 'Healthy', value: String(healthyCount), tone: 'emerald' },
                ],
                items: atRiskPeople.slice(0, 20).map(p => ({
                    id: p.id,
                    name: p.name,
                    avatar: p.avatar,
                    primaryStat: `Score: ${p.riskProfile?.score ?? 0} (${p.riskProfile?.category || 'At Risk'})`,
                    secondaryStat: (p.riskProfile?.factors || []).slice(0, 2).join(' • ') || p.membership || 'Member',
                    riskCategory: p.riskProfile?.category,
                    phone: p.phone,
                    email: p.email,
                })),
            },
            claims: {},
        };
    }

    // ── 3. CARE & PASTORAL WIDGETS ───────────────────────────────────────────
    if (area === 'care') {
        if (widgetId === 'prayer_requests') {
            const activePrayers = ctx.prayerRequests.filter(r => r.status === 'Active');
            return {
                widgetId,
                area: 'care',
                title: 'Active Prayer Requests',
                icon: '🙏',
                snapshot: {
                    capturedAt: Date.now(),
                    headlineValue: `${activePrayers.length} Active Prayer Request${activePrayers.length === 1 ? '' : 's'}`,
                    subtitle: 'Claim a prayer request to pray for and follow up with the member',
                    summaryMetrics: [
                        { label: 'Active', value: String(activePrayers.length), tone: 'indigo' },
                        { label: 'Answered', value: String(ctx.prayerRequests.filter(r => r.status === 'Answered').length), tone: 'emerald' },
                    ],
                    items: activePrayers.slice(0, 20).map(r => {
                        const person = peopleMap.get(r.personId);
                        return {
                            id: r.personId || r.id,
                            name: r.personName,
                            avatar: person?.avatar,
                            primaryStat: new Date(r.date).toLocaleDateString(),
                            secondaryStat: r.request,
                            riskCategory: person?.riskProfile?.category,
                            phone: person?.phone,
                            email: person?.email,
                        };
                    }),
                },
                claims: {},
            };
        }

        const highPriorityPeople = ctx.people
            .filter(p => p.riskProfile?.category === 'Disconnected' || p.riskProfile?.category === 'At Risk')
            .sort((a, b) => (a.riskProfile?.score ?? 100) - (b.riskProfile?.score ?? 100))
            .slice(0, 20);

        return {
            widgetId,
            area: 'care',
            title: label,
            icon,
            snapshot: {
                capturedAt: Date.now(),
                headlineValue: `${highPriorityPeople.length} Care Follow-Ups Needed`,
                subtitle: 'Members needing pastoral touchpoints based on attendance, serving, and care notes',
                summaryMetrics: [
                    { label: 'Priority Follow-Ups', value: String(highPriorityPeople.length), tone: 'rose' },
                    { label: 'Recent Care Notes', value: String(ctx.pastoralNotes.length), tone: 'indigo' },
                    { label: 'Active Prayers', value: String(ctx.prayerRequests.filter(r => r.status === 'Active').length), tone: 'emerald' },
                ],
                items: highPriorityPeople.map(p => ({
                    id: p.id,
                    name: p.name,
                    avatar: p.avatar,
                    primaryStat: `${p.riskProfile?.category || 'At Risk'} (${p.riskProfile?.score ?? 0})`,
                    secondaryStat: (p.riskProfile?.factors || []).slice(0, 2).join(' • ') || p.membership || 'Member',
                    riskCategory: p.riskProfile?.category,
                    phone: p.phone,
                    email: p.email,
                })),
            },
            claims: {},
        };
    }

    // ── 4. GROUPS WIDGETS ────────────────────────────────────────────────────
    if (area === 'groups') {
        const totalEnrollment = ctx.groups.reduce((sum, g) => sum + (g.membersCount || 0), 0);
        const lowAttendanceGroups = [...ctx.groups]
            .sort((a, b) => (a.membersCount || 0) - (b.membersCount || 0))
            .slice(0, 15);

        return {
            widgetId,
            area: 'groups',
            title: label,
            icon,
            snapshot: {
                capturedAt: Date.now(),
                headlineValue: `${ctx.groups.length} Active Groups • ${totalEnrollment} Enrolled`,
                subtitle: 'Claim a group below to check in with its leader',
                summaryMetrics: [
                    { label: 'Total Groups', value: String(ctx.groups.length), tone: 'indigo' },
                    { label: 'Total Enrolled', value: String(totalEnrollment), tone: 'emerald' },
                    { label: 'Avg Group Size', value: ctx.groups.length ? String(Math.round(totalEnrollment / ctx.groups.length)) : '0', tone: 'slate' },
                ],
                items: lowAttendanceGroups.map(g => ({
                    id: g.id,
                    name: g.name,
                    primaryStat: `${g.membersCount || 0} members`,
                    secondaryStat: g.groupTypeName || 'Small Group',
                })),
            },
            claims: {},
        };
    }

    // ── 5. SERVICES & TEAMS WIDGETS ──────────────────────────────────────────
    const openPositions = ctx.servicesData?.stats?.positionsOpen ?? 0;
    const uniqueVolunteers = ctx.servicesData?.stats?.uniqueVolunteers ?? 0;
    const teamItems: ChatWidgetSnapshotItem[] = ctx.teams.slice(0, 15).map(t => ({
        id: t.id,
        name: t.name,
        primaryStat: `${(t.memberIds || []).length} volunteers`,
        secondaryStat: t.serviceTypeName || 'Serving Team',
    }));

    return {
        widgetId,
        area: 'services',
        title: label,
        icon,
        snapshot: {
            capturedAt: Date.now(),
            headlineValue: `${ctx.teams.length} Serving Teams • ${openPositions} Open Positions`,
            subtitle: 'Coordinate volunteer recruiting and team leader care',
            summaryMetrics: [
                { label: 'Serving Teams', value: String(ctx.teams.length), tone: 'indigo' },
                { label: 'Active Volunteers', value: String(uniqueVolunteers), tone: 'emerald' },
                { label: 'Open Positions', value: String(openPositions), tone: openPositions > 0 ? 'amber' : 'slate' },
            ],
            items: teamItems,
        },
        claims: {},
    };
}

/** Get the current ISO week key (e.g., "2026-W45") to track automated weekly briefings */
export function getCurrentWeekKey(d = new Date()): string {
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    const dayNum = date.getUTCDay() || 7;
    date.setUTCDate(date.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    const weekNo = Math.ceil((((date.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return `${date.getUTCFullYear()}-W${String(weekNo).padStart(2, '0')}`;
}
