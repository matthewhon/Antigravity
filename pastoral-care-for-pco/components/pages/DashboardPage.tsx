import React from 'react';
import { DashboardView } from '../DashboardView';
import { useTenantData } from '../../contexts/TenantDataContext';
import { 
    useRiskEnrichedPeople, 
    usePeopleDashboardData, 
    useGivingAnalyticsData, 
    useGroupsDashboardData, 
    useAttendanceChartData 
} from '../../hooks/useDashboardData';

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
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
    onUpdateWidgets, onConnectPco, allowedWidgetIds, globalInsights,
    isGeneratingInsights, onUpdateTheme, onGenerateInsights, givingFilter, givingDateRange
}) => {
    const { 
        user, church, widgets, people, groups, attendance, donations, 
        funds, budgets, teams, recentRiskChanges, recentStatusChanges, servicesData 
    } = useTenantData();

    const riskEnrichedPeople = useRiskEnrichedPeople(people, groups, donations, servicesData, teams, church?.riskSettings);
    const peopleDashboardData = usePeopleDashboardData(people, riskEnrichedPeople, recentRiskChanges, recentStatusChanges);
    const givingAnalyticsData = useGivingAnalyticsData(donations, givingFilter, givingDateRange, people, church?.donorLifecycleSettings);
    const groupsDashboardData = useGroupsDashboardData(groups, people);
    const attendanceChartData = useAttendanceChartData(attendance);

    if (!user || !church) return null;

    return (
        <DashboardView 
            user={user}
            peopleData={peopleDashboardData}
            givingAnalytics={givingAnalyticsData}
            groupsData={groupsDashboardData}
            servicesData={servicesData}
            attendanceData={attendanceChartData}
            censusData={null} // Pass census data if needed later
            visibleWidgets={widgets}
            onUpdateWidgets={onUpdateWidgets}
            budgets={budgets}
            funds={funds}
            donations={donations}
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
        />
    );
};
