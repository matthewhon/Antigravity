import React from 'react';
import { useParams } from 'react-router-dom';
import { PeopleView } from '../PeopleView';
import { useTenantData } from '../../contexts/TenantDataContext';
import { useRiskEnrichedPeople, usePeopleDashboardData } from '../../hooks/useDashboardData';
import { GeoInsight, CensusStats, User } from '../../types';
import { firestore } from '../../services/firestoreService';

interface PeoplePageProps {
    geoInsights: GeoInsight | null;
    isGeneratingGeo: boolean;
    onGenerateGeoInsights: () => void;
    censusData: CensusStats | null;
    allowedWidgetIds?: string[];
    onSync: () => void;
    isSyncing: boolean;
    apiBaseUrl: string;
    onUpdateTheme: (theme: 'traditional' | 'dark') => void;
    setUser: (user: User) => void;
    onUpdateWidgets: (widgets: string[]) => void;
}

export const PeoplePage: React.FC<PeoplePageProps> = ({
    geoInsights, isGeneratingGeo, onGenerateGeoInsights, censusData,
    allowedWidgetIds, onSync, isSyncing, apiBaseUrl, onUpdateTheme,
    setUser, onUpdateWidgets
}) => {
    const { 
        user, church, widgets, people, groups, donations, 
        teams, recentRiskChanges, recentStatusChanges, servicesData 
    } = useTenantData();

    // The wildcard in the route gives us the subpath
    const { '*': subpath } = useParams();
    
    const activePage = 
        subpath === 'households' ? 'households' :
        subpath === 'risk'       ? 'risk'       :
        subpath === 'reports'    ? 'reports'    :
        'overview';

    const riskEnrichedPeople = useRiskEnrichedPeople(people, groups, donations, servicesData, teams, church?.riskSettings);
    const peopleDashboardData = usePeopleDashboardData(people, riskEnrichedPeople, recentRiskChanges, recentStatusChanges);

    if (!user || !church) return null;

    return (
        <PeopleView 
            data={peopleDashboardData}
            activePage={activePage as any}
            overviewWidgets={widgets}
            householdWidgets={user.widgetPreferences?.['people_households'] || []}
            riskWidgets={user.widgetPreferences?.['people_risk'] || []}
            onUpdateOverviewWidgets={onUpdateWidgets}
            onUpdateHouseholdWidgets={(w) => {
                const newPrefs = { ...user.widgetPreferences, 'people_households': w };
                firestore.updateUserPreferences(user.id, newPrefs);
                setUser({ ...user, widgetPreferences: newPrefs });
            }}
            onUpdateRiskWidgets={(w) => {
                const newPrefs = { ...user.widgetPreferences, 'people_risk': w };
                firestore.updateUserPreferences(user.id, newPrefs);
                setUser({ ...user, widgetPreferences: newPrefs });
            }}
            geoInsights={geoInsights}
            isGeneratingGeo={isGeneratingGeo}
            onGenerateGeoInsights={onGenerateGeoInsights}
            censusData={censusData}
            allowedWidgetIds={allowedWidgetIds}
            onSync={onSync}
            isSyncing={isSyncing}
            pcoConnected={church.pcoConnected}
            churchId={church.id}
            apiBaseUrl={apiBaseUrl}
            onUpdateTheme={onUpdateTheme}
            currentTheme={user.theme}
        />
    );
};
