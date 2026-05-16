import React from 'react';
import { useParams } from 'react-router-dom';
import ServicesView from '../ServicesView';
import { useTenantData } from '../../contexts/TenantDataContext';
import { User, Church } from '../../types';
import { firestore } from '../../services/firestoreService';

interface ServicesPageProps {
    onUpdateChurch: (updates: Partial<Church>) => void;
    servicesFilter: any;
    onFilterChange: (f: any) => void;
    allowedWidgetIds?: string[];
    onSync: () => void;
    isSyncing: boolean;
    onUpdateTheme: (theme: 'traditional' | 'dark') => void;
    setUser: (user: User) => void;
}

export const ServicesPage: React.FC<ServicesPageProps> = ({
    onUpdateChurch, servicesFilter, onFilterChange, allowedWidgetIds,
    onSync, isSyncing, onUpdateTheme, setUser
}) => {
    const { user, church, servicesData, people } = useTenantData();
    const { '*': subpath } = useParams();

    const activePage = 
        subpath === 'attendance' ? 'Attendance' :
        subpath === 'teams'      ? 'Teams'      :
        subpath === 'reminders'  ? 'Reminders'  :
        'Overview';

    if (!user || !church) return null;

    return (
        <ServicesView 
            church={church}
            onUpdateChurch={onUpdateChurch}
            data={servicesData}
            isLoading={!servicesData}
            filter={servicesFilter}
            onFilterChange={onFilterChange}
            pcoConnected={church.pcoConnected}
            activePage={activePage as any}
            overviewWidgets={user.widgetPreferences?.['services_overview'] || []}
            attendanceWidgets={user.widgetPreferences?.['services_attendance'] || []}
            teamsWidgets={user.widgetPreferences?.['services_teams'] || []}
            onUpdateOverviewWidgets={(w) => {
                const newPrefs = { ...user.widgetPreferences, 'services_overview': w };
                firestore.updateUserPreferences(user.id, newPrefs);
                setUser({ ...user, widgetPreferences: newPrefs });
            }}
            onUpdateAttendanceWidgets={(w) => {
                const newPrefs = { ...user.widgetPreferences, 'services_attendance': w };
                firestore.updateUserPreferences(user.id, newPrefs);
                setUser({ ...user, widgetPreferences: newPrefs });
            }}
            onUpdateTeamsWidgets={(w) => {
                const newPrefs = { ...user.widgetPreferences, 'services_teams': w };
                firestore.updateUserPreferences(user.id, newPrefs);
                setUser({ ...user, widgetPreferences: newPrefs });
            }}
            allowedWidgetIds={allowedWidgetIds}
            onSync={onSync}
            isSyncing={isSyncing}
            people={people}
            onUpdateTheme={onUpdateTheme}
            currentTheme={user.theme}
            churchId={church.id}
        />
    );
};
