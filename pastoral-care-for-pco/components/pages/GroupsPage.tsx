import React from 'react';
import { useParams } from 'react-router-dom';
import GroupsView from '../GroupsView';
import { GroupAbsenteesReport } from '../GroupAbsenteesReport';
import { useTenantData } from '../../contexts/TenantDataContext';
import { useGroupsDashboardData, useRiskEnrichedPeople, usePeopleDashboardData } from '../../hooks/useDashboardData';

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
    const { '*': subpath } = useParams();
    const activeTab = subpath === 'reports' ? 'reports' : 'dashboard';

    const {
        user, church, widgets, groups, people, donations, teams,
        servicesData, recentRiskChanges, recentStatusChanges
    } = useTenantData();

    const groupsDashboardData = useGroupsDashboardData(groups, people);
    const riskEnrichedPeople = useRiskEnrichedPeople(people, groups, donations, servicesData, teams, church?.riskSettings);
    const peopleDashboardData = usePeopleDashboardData(people, riskEnrichedPeople, recentRiskChanges, recentStatusChanges);

    if (!user || !church) return null;

    return (
        <div className="space-y-6">
            {activeTab === 'dashboard' && (
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
            )}

            {activeTab === 'reports' && (
                <GroupAbsenteesReport
                    groups={groups}
                    people={people}
                />
            )}
        </div>
    );
};
