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

/** How old (ms) a cached activePeopleCount can be before auto-refreshing. */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

interface DashboardPageProps {
    onUpdateWidgets: (widgets: string[]) => void;
    onConnectPco: () => void;
    allowedWidgetIds?: string[];
    globalInsights: string;
    isGeneratingInsights: boolean;
    onUpdateTheme: (theme: 'traditional' | 'dark') => void;
    onGenerateInsights: () => void;
    givingFilter: any;
    givingDateRange: any;
    censusData: any;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
    onUpdateWidgets, onConnectPco, allowedWidgetIds, globalInsights,
    isGeneratingInsights, onUpdateTheme, onGenerateInsights, givingFilter, givingDateRange, censusData
}) => {
    const { 
        user, church, widgets, people, groups, attendance, donations, 
        funds, budgets, teams, recentRiskChanges, recentStatusChanges, servicesData 
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

    return (
        <DashboardView 
            user={user}
            peopleData={peopleDashboardData}
            givingAnalytics={givingAnalyticsData}
            groupsData={groupsDashboardData}
            servicesData={servicesData}
            attendanceData={attendanceChartData}
            censusData={censusData}
            visibleWidgets={widgets}
            onUpdateWidgets={onUpdateWidgets}
            budgets={budgets}
            funds={funds}
            donations={donations}
            teams={teams}
            recentRiskChanges={recentRiskChanges}
            recentStatusChanges={recentStatusChanges}
            pcoConnected={church.pcoConnected}
            onConnectPco={onConnectPco}
            allowedWidgetIds={allowedWidgetIds}
            globalInsights={globalInsights}
            isGeneratingInsights={isGeneratingInsights}
            onUpdateTheme={onUpdateTheme}
            churchRiskSettings={church.churchRiskSettings}
            groupRiskSettings={church.groupRiskSettings}
            onGenerateInsights={onGenerateInsights}
            churchName={church.name}
            activePeopleCount={activePeopleCount}
            isPastorAIEnabled={isPastorAIEnabled}
        />
    );
};
