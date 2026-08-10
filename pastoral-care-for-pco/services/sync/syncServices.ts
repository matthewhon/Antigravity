/**
 * syncServices.ts
 * PCO sync for Services: service types, teams, plans, and volunteer serving stats.
 */

import { firestore } from '../firestoreService';
import { PcoPerson, ServicePlanSnapshot, ServicesTeam } from '../../types';
import { logger, fetchAllPages, pcoFetch, delay } from './pcoSyncCore.ts';

export const syncServicesData = async (churchId: string) => {
    logger.info('Syncing services plans & teams...', 'sync', { churchId }, churchId);

    const campuses = await firestore.getCampuses(churchId);
    const campusMap = new Map<string, string>();
    campuses.forEach(c => campusMap.set(c.pcoId, c.name));

    let serviceTypes: any[] = [];
    const serviceTypeCampusMap = new Map<string, { campusId: string | null, campusName: string | null }>();
    try {
        serviceTypes = await fetchAllPages(churchId, 'services/v2/service_types?include=campus', (st: any, included: any[] = []) => {
            const campusId = st.relationships?.campus?.data?.id || null;
            const campusObj = campusId ? included?.find(i => i.type === 'Campus' && i.id === campusId) : null;
            const campusName = campusObj?.attributes?.name || (campusId ? (campusMap.get(campusId) ?? null) : null);
            return { id: st.id, name: st.attributes.name, campusId, campusName };
        });
        serviceTypes.forEach(st => {
            serviceTypeCampusMap.set(st.id, { campusId: st.campusId, campusName: st.campusName });
        });
    } catch (e: any) {
        logger.warn('Service types fetch failed (non-fatal) — Services may be disabled', 'sync', { churchId, error: e?.message }, churchId);
    }

    // 1. Sync Teams
    let teams: ServicesTeam[] = [];
    try {
        teams = await fetchAllPages(churchId, 'services/v2/teams', (t: any) => {
            console.log(`PCO Team: ${t.attributes.name} (ID: ${t.id})`);
            const serviceTypeId = t.relationships?.service_type?.data?.id || null;
            const campusInfo = serviceTypeId ? serviceTypeCampusMap.get(serviceTypeId) : null;
            return {
                id: t.id,
                churchId,
                name: t.attributes.name,
                serviceTypeId,
                memberIds: [],
                leaderPersonIds: [],
                leaderCount: 0,
                campusId: campusInfo?.campusId || null,
                campusName: campusInfo?.campusName || null
            } as ServicesTeam;
        });

        teams = teams.filter(t => t.name && t.name !== 'Unknown');

        console.log(`Fetching details for ${teams.length} teams...`);
        const BATCH_SIZE = 5;
        for (let i = 0; i < teams.length; i += BATCH_SIZE) {
            const batch = teams.slice(i, i + BATCH_SIZE);
            await Promise.all(batch.map(async (team) => {
                try {
                    const leaderRes = await pcoFetch(churchId, `services/v2/teams/${team.id}/team_leaders`);
                    if (leaderRes.data) {
                        const lIds = leaderRes.data.map((l: any) => l.relationships?.person?.data?.id).filter(Boolean);
                        team.leaderPersonIds = lIds;
                        team.leaderCount = lIds.length;
                    }
                    const membersRes = await pcoFetch(churchId, `services/v2/teams/${team.id}/people?per_page=100`);
                    if (membersRes.data) {
                        const mIds = membersRes.data.map((p: any) => p.id).filter(Boolean);
                        team.memberIds = mIds;
                    }
                } catch (e) {
                    console.warn(`Failed to fetch details for team ${team.id}`, e);
                }
            }));
            await delay(50);
        }

        if (teams.length > 0) await firestore.upsertServicesTeams(teams);
        logger.info('Teams sync complete', 'sync', { churchId, count: teams.length }, churchId);
    } catch (e: any) {
        logger.warn('Teams sync failed — Services may be disabled or restricted', 'sync', { churchId, error: e?.message }, churchId);
    }

    // 2. Sync Plans
    let plans: ServicePlanSnapshot[] = [];

    if (serviceTypes.length > 0) {
        console.log(`Fetching plans for ${serviceTypes.length} Service Types...`);
        for (const st of serviceTypes) {
            try {
                const mapPlan = (p: any, included: any[] = []) => {
                    const planTimes = (included || [])
                        .filter(i =>
                            i.type === 'PlanTime' &&
                            p.relationships?.plan_times?.data?.some((rel: any) => rel.id === i.id)
                        )
                        .map(i => ({ id: i.id, startsAt: i.attributes.starts_at, endsAt: i.attributes.ends_at, type: i.attributes.time_type }))
                        .filter(t => t.type === 'service')
                        .sort((a, b) => new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime());

                    return {
                        id: p.id,
                        churchId,
                        sortDate: p.attributes.sort_date,
                        serviceTypeId: st.id,
                        serviceTypeName: st.name,
                        seriesTitle: p.attributes.series_title || null,
                        title: p.attributes.title || null,
                        positionsFilled: 0,
                        positionsNeeded: 0,
                        planTimes: planTimes.length > 0 ? planTimes.map(t => ({ id: t.id, startsAt: t.startsAt, endsAt: t.endsAt })) : undefined,
                        campusId: st.campusId,
                        campusName: st.campusName
                    } as ServicePlanSnapshot;
                };

                const futurePlans = await fetchAllPages(
                    churchId,
                    `services/v2/service_types/${st.id}/plans?filter=future&include=plan_times`,
                    mapPlan
                );

                const pastPlans = await fetchAllPages(
                    churchId,
                    `services/v2/service_types/${st.id}/plans?filter=past&per_page=10&include=plan_times`,
                    mapPlan
                );

                const ninetyDaysAgo = new Date();
                ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
                const recentPastPlans = pastPlans.filter(p => new Date(p.sortDate) >= ninetyDaysAgo);

                plans = [...plans, ...futurePlans, ...recentPastPlans];
                await delay(50);
            } catch (innerE) {
                console.warn(`Could not sync plans for Service Type ${st.id}`, innerE);
            }
        }
    } else {
        logger.warn('Skipping plans fetch because no Service Types were found', 'sync', { churchId }, churchId);
    }

    plans.sort((a, b) => a.sortDate.localeCompare(b.sortDate));

    const now = new Date();
    const futurePlansToDetail = plans.filter(p => new Date(p.sortDate) >= now).slice(0, 15);
    const pastPlansToDetail = plans.filter(p => new Date(p.sortDate) < now).slice(-15);
    const plansToDetail = [...futurePlansToDetail, ...pastPlansToDetail];

    const detailedPlans: ServicePlanSnapshot[] = [];
    const personServingMap = new Map<string, { last90Days: number, nextServiceDate?: string, recentServices: { date: string, planId: string, teamName: string, serviceTypeName: string }[] }>();

    for (const plan of plansToDetail) {
        if (!plan.serviceTypeId) { detailedPlans.push(plan); continue; }

        const membersUrl = `services/v2/service_types/${plan.serviceTypeId}/plans/${plan.id}/team_members?include=team`;
        const neededUrl = `services/v2/service_types/${plan.serviceTypeId}/plans/${plan.id}/needed_positions?include=team`;
        const itemsUrl = `services/v2/service_types/${plan.serviceTypeId}/plans/${plan.id}/items?include=song`;

        try {
            const membersData = await pcoFetch(churchId, membersUrl);
            const members = (membersData.data || []).map((m: any) => {
                const teamId = m.relationships?.team?.data?.id;
                let teamName = null;
                if (teamId) {
                    const teamObj = (membersData.included || []).find((inc: any) => inc.type === 'Team' && String(inc.id) === String(teamId));
                    if (teamObj) teamName = teamObj.attributes?.name || null;
                    if (!teamName) {
                        const team = teams.find(t => String(t.id) === String(teamId));
                        if (team) teamName = team.name;
                    }
                }
                return {
                    personId: m.relationships?.person?.data?.id || null,
                    teamName: teamName || (teamId ? `Team ${teamId}` : 'Unknown'),
                    status: m.attributes.status || 'Pending',
                    teamPositionName: m.attributes.team_position_name || null,
                    name: m.attributes.name || 'Unknown'
                };
            });

            const planDate = new Date(plan.sortDate);
            const isPast = planDate < now;
            const isFuture = planDate >= now;

            members.forEach((m: any) => {
                if (m.personId && (m.status === 'Confirmed' || m.status === 'C')) {
                    const current = personServingMap.get(m.personId) || { last90Days: 0, recentServices: [] };
                    if (isPast) {
                        const ninetyDaysAgo = new Date();
                        ninetyDaysAgo.setDate(ninetyDaysAgo.getDate() - 90);
                        if (planDate >= ninetyDaysAgo) current.last90Days++;
                        current.recentServices.push({
                            date: plan.sortDate,
                            planId: plan.id,
                            teamName: m.teamName,
                            serviceTypeName: plan.serviceTypeName || 'Unknown'
                        });
                    } else if (isFuture) {
                        if (!current.nextServiceDate || planDate < new Date(current.nextServiceDate)) {
                            current.nextServiceDate = plan.sortDate;
                        }
                    }
                    personServingMap.set(m.personId, current);
                }
            });

            const neededData = await pcoFetch(churchId, neededUrl);
            const neededPositions = (neededData.data || []).map((np: any) => {
                let teamName = np.attributes.team_name;
                const teamId = np.relationships?.team?.data?.id;
                if (!teamName || teamName === 'Unknown') {
                    if (teamId) {
                        const teamObj = (neededData.included || []).find((inc: any) => inc.type === 'Team' && String(inc.id) === String(teamId));
                        if (teamObj) teamName = teamObj.attributes?.name || null;
                        if (!teamName) {
                            const team = teams.find(t => String(t.id) === String(teamId));
                            if (team) teamName = team.name;
                        }
                    }
                }
                return { teamName: teamName || (teamId ? `Team ${teamId}` : 'Unnamed Team'), quantity: np.attributes.quantity || 0 };
            });
            const totalNeeded = neededPositions.reduce((sum: number, n: any) => sum + n.quantity, 0);

            let items: { type: string; title: string; author?: string; description?: string; sequence?: number }[] = [];
            try {
                const itemsData = await pcoFetch(churchId, itemsUrl);
                const includedSongs = new Map<string, { title: string; author: string }>();
                (itemsData.included || []).forEach((inc: any) => {
                    if (inc.type === 'Song') {
                        includedSongs.set(inc.id, { title: inc.attributes.title || 'Unknown', author: inc.attributes.author || '' });
                    }
                });
                items = (itemsData.data || [])
                    .map((item: any) => {
                        const songId = item.relationships?.song?.data?.id;
                        const songDetail = songId ? includedSongs.get(songId) : null;
                        const isSong = item.attributes.item_type === 'song' || !!songId;
                        return {
                            type: isSong ? 'song' : (item.attributes.item_type || 'item'),
                            title: songDetail?.title || item.attributes.title || 'Untitled Item',
                            author: songDetail?.author || '',
                            description: item.attributes.description || '',
                            sequence: item.attributes.sequence || 0
                        };
                    })
                    .filter((item: any) => item.title)
                    .sort((a: any, b: any) => a.sequence - b.sequence);
            } catch (itemsErr) {
                console.warn(`Could not fetch items for plan ${plan.id}:`, itemsErr);
            }

            detailedPlans.push({
                ...plan,
                teamMembers: members,
                neededPositions: neededPositions,
                positionsNeeded: totalNeeded,
                positionsFilled: members.length,
                isUnderstaffed: totalNeeded > 0,
                items
            });

            await delay(100);
        } catch (e) {
            console.error(`Failed to fetch details for plan ${plan.id}`, e);
            detailedPlans.push(plan);
        }
    }

    if (personServingMap.size > 0) {
        const peopleUpdates: Partial<PcoPerson>[] = [];
        personServingMap.forEach((stats, personId) => {
            const weekBuckets = new Map<string, number>();
            stats.recentServices.forEach(rs => {
                const d = new Date(rs.date);
                const dayOfWeek = (d.getDay() + 6) % 7;
                const monday = new Date(d);
                monday.setDate(d.getDate() - dayOfWeek);
                const weekKey = monday.toISOString().slice(0, 10);
                weekBuckets.set(weekKey, (weekBuckets.get(weekKey) || 0) + 1);
            });
            const maxWeeklyCount = weekBuckets.size > 0 ? Math.max(...weekBuckets.values()) : 0;
            let riskLevel: 'Low' | 'Medium' | 'High' = 'Low';
            if (maxWeeklyCount > 2) riskLevel = 'High';
            else if (maxWeeklyCount === 2) riskLevel = 'Medium';

            stats.recentServices.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
            peopleUpdates.push({
                id: personId,
                servingStats: {
                    last90DaysCount: stats.last90Days,
                    riskLevel,
                    nextServiceDate: stats.nextServiceDate,
                    recentServices: stats.recentServices.slice(0, 10)
                }
            });
        });

        await firestore.upsertPeople(peopleUpdates as any);
        console.log(`Saved serving stats for ${peopleUpdates.length} people. High risk: ${peopleUpdates.filter((p: any) => p.servingStats?.riskLevel === 'High').length}`);
    }

    const allPlansToSave = plans.map(p => {
        const detailed = detailedPlans.find(dp => dp.id === p.id);
        return detailed || p;
    });

    if (allPlansToSave.length > 0) {
        await firestore.upsertServicePlans(allPlansToSave);
    }
    logger.info('Service plans sync complete', 'sync', { churchId, total: allPlansToSave.length, detailed: detailedPlans.length }, churchId);
};
