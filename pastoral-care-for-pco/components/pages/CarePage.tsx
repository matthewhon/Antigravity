import React from 'react';
import { useParams } from 'react-router-dom';
import { PastoralView } from '../PastoralView';
import { useTenantData } from '../../contexts/TenantDataContext';
import { 
    usePeopleDashboardData, 
    useGivingAnalyticsData, 
    useGroupsDashboardData, 
    useAttendanceChartData,
    useRiskEnrichedPeople
} from '../../hooks/useDashboardData';
import { User, CensusStats } from '../../types';
import { firestore } from '../../services/firestoreService';

interface CarePageProps {
    censusData: CensusStats | null;
    censusError: string;
    allowedWidgetIds?: string[];
    onUpdateTheme: (theme: 'traditional' | 'dark') => void;
    setUser: (user: User) => void;
    givingFilter: any;
    givingDateRange: any;
}

export const CarePage: React.FC<CarePageProps> = ({
    censusData, censusError, allowedWidgetIds, onUpdateTheme, setUser, givingFilter, givingDateRange
}) => {
    const { 
        user, church, people, groups, attendance, donations, 
        teams, recentRiskChanges, recentStatusChanges, servicesData,
        systemSettings, checkIns
    } = useTenantData();
    const { '*': subpath } = useParams();

    const activePage = 
        subpath === 'membership' ? 'Membership' :
        subpath === 'community'  ? 'Community'  :
        subpath === 'care'       ? 'Care'       :
        subpath === 'calendar'   ? 'Calendar'   :
        subpath === 'reports'    ? 'Reports'    :
        'Church';

    const riskEnrichedPeople = useRiskEnrichedPeople(people, groups, donations, servicesData, teams, church?.riskSettings);
    const peopleDashboardData = usePeopleDashboardData(people, riskEnrichedPeople, recentRiskChanges, recentStatusChanges);
    const givingAnalyticsData = useGivingAnalyticsData(donations, givingFilter, givingDateRange, people, church?.donorLifecycleSettings);
    const groupsDashboardData = useGroupsDashboardData(groups, people);
    const attendanceChartData = useAttendanceChartData(attendance);

    if (!user || !church) return null;

    return (
        <PastoralView 
            user={user}
            church={church}
            attendanceData={attendanceChartData}
            peopleData={peopleDashboardData}
            givingAnalytics={givingAnalyticsData}
            groupsData={groupsDashboardData}
            pcoConnected={church.pcoConnected}
            censusData={censusData}
            churchConfig={{ city: church.city, state: church.state }}
            censusError={censusError}
            activePage={activePage as any}
            donations={donations}
            servicesData={servicesData}
            checkIns={checkIns}
            churchWidgets={user.widgetPreferences?.['pastoral_church'] || []}
            membershipWidgets={user.widgetPreferences?.['pastoral_membership'] || []}
            communityWidgets={user.widgetPreferences?.['pastoral_community'] || []}
            careWidgets={user.widgetPreferences?.['pastoral_care'] ?? ['care_recommended_followups', 'care_log', 'prayer_requests', 'follow_ups', 'care_ai_agent', 'care_people_list']}
            onUpdateChurchWidgets={(w) => {
                const newPrefs = { ...user.widgetPreferences, 'pastoral_church': w };
                firestore.updateUserPreferences(user.id, newPrefs);
                setUser({ ...user, widgetPreferences: newPrefs });
            }}
            onUpdateMembershipWidgets={(w) => {
                const newPrefs = { ...user.widgetPreferences, 'pastoral_membership': w };
                firestore.updateUserPreferences(user.id, newPrefs);
                setUser({ ...user, widgetPreferences: newPrefs });
            }}
            onUpdateCommunityWidgets={(w) => {
                const newPrefs = { ...user.widgetPreferences, 'pastoral_community': w };
                firestore.updateUserPreferences(user.id, newPrefs);
                setUser({ ...user, widgetPreferences: newPrefs });
            }}
            onUpdateCareWidgets={(w) => {
                const newPrefs = { ...user.widgetPreferences, 'pastoral_care': w };
                firestore.updateUserPreferences(user.id, newPrefs);
                setUser({ ...user, widgetPreferences: newPrefs });
            }}
            allowedWidgetIds={allowedWidgetIds}
            googleMapsApiKey={systemSettings?.googleMapsApiKey || church.googleMapsApiKey}
            onUpdateTheme={onUpdateTheme}
        />
    );
};
