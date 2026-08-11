import React, { useEffect, useState } from 'react';
import { DashboardView } from '../DashboardView';
import { useTenantData } from '../../contexts/TenantDataContext';
import { 
    useRiskEnrichedPeople, 
    usePeopleDashboardData, 
    useGivingAnalyticsData, 
    useGroupsDashboardData, 
    useAttendanceChartData 
} from '../../hooks/useDashboardData';
import { computeActivePeopleCount, ACTIVE_WINDOW_DAYS } from '../../services/activePeopleService';
import { firestore } from '../../services/firestoreService';
import { calculateDashboardOverview } from '../../services/dashboardService';
import { getSectionOrder } from '../../constants/dashboardSections';

/** How old (ms) a cached activePeopleCount can be before auto-refreshing. */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DashboardPageProps {
    onConnectPco: () => void;
    onUpdateDashboardPreferences: (next: import('../../types').DashboardPreferences) => void;
    globalInsights: string;
    isGeneratingInsights: boolean;
    onGenerateInsights: () => void;
    givingFilter: any;
    givingDateRange: any;
    censusData: any;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
    onConnectPco, onUpdateDashboardPreferences, globalInsights,
    isGeneratingInsights, onGenerateInsights, givingFilter, givingDateRange, censusData
}) => {
    const {
        user, church, people, groups, attendance, donations,
        funds, budgets, teams, recentRiskChanges, recentStatusChanges, servicesData,
        campuses, selectedCampusId,
        smsConversations, smsUsage, emailCampaigns, emailUnsubscribes,
        outreachSessions, outreachSlots, groupCareSessions, groupCareSlots
    } = useTenantData();

    // Local state so the widget updates immediately after computation without
    // waiting for a Firestore listener round-trip.
    const [activePeopleCount, setActivePeopleCount] = useState<number | undefined>(
        church?.activePeopleCount
    );

    // Auto-compute on mount (or when church loads) if count is missing or stale.
    useEffect(() => {
        if (!church?.id) return;

        const lastCalc = church.activePeopleLastCalculatedAt ?? 0;
        const isStale = !church.activePeopleCount || (Date.now() - lastCalc > STALE_THRESHOLD_MS);

        if (!isStale) {
            // Already fresh — just make sure local state is in sync
            setActivePeopleCount(church.activePeopleCount);
            return;
        }

        // Run silently in the background
        let cancelled = false;
        computeActivePeopleCount(church.id)
            .then(count => {
                if (cancelled) return;
                setActivePeopleCount(count);
                firestore.updateActivePeopleCount(church.id, count);
            })
            .catch(err => {
                console.warn('[DashboardPage] activePeopleCount computation failed:', err);
            });

        return () => { cancelled = true; };
    }, [church?.id]); // eslint-disable-line react-hooks/exhaustive-deps

    const riskEnrichedPeople = useRiskEnrichedPeople(people, groups, donations, servicesData, teams, church?.riskSettings);
    const peopleDashboardData = usePeopleDashboardData(people, riskEnrichedPeople, recentRiskChanges, recentStatusChanges);
    const givingAnalyticsData = useGivingAnalyticsData(donations, givingFilter, givingDateRange, people, church?.donorLifecycleSettings);
    const groupsDashboardData = useGroupsDashboardData(groups, people);
    const attendanceChartData = useAttendanceChartData(attendance);

    if (!user || !church) return null;

    const isStarterPlan = church.subscription?.status === 'active' && church.subscription?.planId === 'starter';
    const isPastorAIEnabled = !isStarterPlan;

    // One pass builds every figure on the page, with the role gate applied at
    // computation time — a value this user may not see never enters the object.
    const overview = calculateDashboardOverview({
        user,
        church: { ...church, activePeopleCount: activePeopleCount ?? church.activePeopleCount },
        access: { isStarterPlan },
        peopleData: peopleDashboardData,
        givingAnalytics: givingAnalyticsData,
        groupsData: groupsDashboardData,
        servicesData,
        attendance,
        donations,
        people,
        groups,
        recentRiskChanges,
        smsConversations,
        smsUsage,
        emailCampaigns,
        emailUnsubscribes,
        outreachSessions,
        outreachSlots,
        groupCareSessions,
        groupCareSlots,
    });

    const campusName = campuses.find(c => c.pcoId === selectedCampusId)?.name ?? null;

    return (
        <DashboardView
            user={user}
            overview={overview}
            sectionOrder={getSectionOrder(user.roles as string[])}
            preferences={user.dashboardPreferences}
            onUpdatePreferences={onUpdateDashboardPreferences}
            campusName={campusName}
            peopleData={peopleDashboardData}
            givingAnalytics={givingAnalyticsData}
            groupsData={groupsDashboardData}
            servicesData={servicesData}
            attendanceData={attendanceChartData}
            censusData={censusData}
            budgets={budgets}
            funds={funds}
            donations={donations}
            teams={teams}
            recentRiskChanges={recentRiskChanges}
            recentStatusChanges={recentStatusChanges}
            pcoConnected={church.pcoConnected}
            onConnectPco={onConnectPco}
            globalInsights={globalInsights}
            isGeneratingInsights={isGeneratingInsights}
            onGenerateInsights={onGenerateInsights}
            churchName={church.name}
            isPastorAIEnabled={isPastorAIEnabled}
        />
    );
};
