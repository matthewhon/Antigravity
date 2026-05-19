import React, { useState } from 'react';
import GroupsView from '../GroupsView';
import { GroupAbsenteesReport } from '../GroupAbsenteesReport';
import { useTenantData } from '../../contexts/TenantDataContext';
import { useGroupsDashboardData, useRiskEnrichedPeople, usePeopleDashboardData } from '../../hooks/useDashboardData';
import { BarChart2, FileText } from 'lucide-react';

interface GroupsPageProps {
    allowedWidgetIds?: string[];
    onSync: () => void;
    onSyncGroups: () => void;
    isSyncing: boolean;
    onUpdateTheme: (theme: 'traditional' | 'dark') => void;
    onUpdateWidgets: (widgets: string[]) => void;
}

type GroupsTab = 'dashboard' | 'reports';

export const GroupsPage: React.FC<GroupsPageProps> = ({
    allowedWidgetIds, onSync, onSyncGroups, isSyncing, onUpdateTheme, onUpdateWidgets
}) => {
    const [activeTab, setActiveTab] = useState<GroupsTab>('dashboard');

    const {
        user, church, widgets, groups, people, donations, teams,
        servicesData, recentRiskChanges, recentStatusChanges
    } = useTenantData();

    const groupsDashboardData = useGroupsDashboardData(groups, people);
    const riskEnrichedPeople = useRiskEnrichedPeople(people, groups, donations, servicesData, teams, church?.riskSettings);
    const peopleDashboardData = usePeopleDashboardData(people, riskEnrichedPeople, recentRiskChanges, recentStatusChanges);

    if (!user || !church) return null;

    const tabs: { id: GroupsTab; label: string; icon: React.ReactNode }[] = [
        { id: 'dashboard', label: 'Dashboard', icon: <BarChart2 size={14} /> },
        { id: 'reports',   label: 'Reports',   icon: <FileText size={14} /> },
    ];

    return (
        <div className="space-y-6">
            {/* Tab bar */}
            <div className="flex gap-1 bg-slate-100 dark:bg-slate-800 p-1 rounded-2xl w-fit">
                {tabs.map(tab => (
                    <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex items-center gap-2 px-5 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${
                            activeTab === tab.id
                                ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                                : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-300'
                        }`}
                    >
                        {tab.icon}
                        {tab.label}
                    </button>
                ))}
            </div>

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
