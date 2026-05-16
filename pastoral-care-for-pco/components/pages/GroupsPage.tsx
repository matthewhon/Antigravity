import React from 'react';
import GroupsView from '../GroupsView';
import { useTenantData } from '../../contexts/TenantDataContext';
import { useGroupsDashboardData, useRiskEnrichedPeople, usePeopleDashboardData } from '../../hooks/useDashboardData';
import { User } from '../../types';

interface GroupsPageProps {
    allowedWidgetIds?: string[];
    onSync: () => void;
    onSyncGroups: () => void;
    isSyncing: boolean;
    onUpdateTheme: (theme: 'traditional' | 'dark') => void;
    onUpdateWidgets: (widgets: string[]) => void;
}

export const GroupsPage: React.FC<GroupsPageProps> = ({
    allowedWidgetIds, onSync, onSyncGroups, isSyncing, onUpdateTheme, onUpdateWidgets
}) => {
    const { 
        user, church, widgets, groups, people, donations, teams, 
        servicesData, recentRiskChanges, recentStatusChanges 
    } = useTenantData();

    const groupsDashboardData = useGroupsDashboardData(groups, people);
    
    // We also need peopleData for GroupsView to show people lists
    const riskEnrichedPeople = useRiskEnrichedPeople(people, groups, donations, servicesData, teams, church?.riskSettings);
    const peopleDashboardData = usePeopleDashboardData(people, riskEnrichedPeople, recentRiskChanges, recentStatusChanges);

    if (!user || !church) return null;

    return (
        <GroupsView 
            data={groupsDashboardData}
            pcoConnected={church.pcoConnected}
            visibleWidgets={widgets}
            onUpdateWidgets={onUpdateWidgets}
            allowedWidgetIds={allowedWidgetIds}
            onSync={onSync}
            onSyncGroups={onSyncGroups}
            isSyncing={isSyncing}
            peopleData={peopleDashboardData}
            onUpdateTheme={onUpdateTheme}
            currentTheme={user.theme}
            groupRiskSettings={church.groupRiskSettings}
        />
    );
};
