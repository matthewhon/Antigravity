import React from 'react';
import { useParams } from 'react-router-dom';
import { GivingView } from '../GivingView';
import { useTenantData } from '../../contexts/TenantDataContext';
import { useGivingAnalyticsData } from '../../hooks/useDashboardData';
import { User, BudgetRecord } from '../../types';
import { firestore } from '../../services/firestoreService';

interface GivingPageProps {
    givingFilter: any;
    onFilterChange: (f: any) => void;
    givingDateRange: any;
    onDateRangeChange: (r: any) => void;
    allowedWidgetIds?: string[];
    onSyncRecent: () => void;
    isSyncing: boolean;
    onUpdateTheme: (theme: 'traditional' | 'dark') => void;
    setUser: (user: User) => void;
    onSaveBudget: (budget: BudgetRecord) => void;
}

export const GivingPage: React.FC<GivingPageProps> = ({
    givingFilter, onFilterChange, givingDateRange, onDateRangeChange,
    allowedWidgetIds, onSyncRecent, isSyncing, onUpdateTheme, setUser, onSaveBudget
}) => {
    const { user, church, donations, people, budgets, funds } = useTenantData();
    const { '*': subpath } = useParams();

    const activePage = 
        subpath === 'donor'     ? 'donor'     :
        subpath === 'budgets'   ? 'budgets'   :
        subpath === 'donations' ? 'donations' :
        subpath === 'reports'   ? 'reports'   :
        'overview';

    const givingAnalyticsData = useGivingAnalyticsData(donations, givingFilter, givingDateRange, people, church?.donorLifecycleSettings);

    if (!user || !church) return null;

    return (
        <GivingView 
            analytics={givingAnalyticsData}
            filter={givingFilter}
            onFilterChange={onFilterChange}
            dateRange={givingFilter === 'Custom' ? givingDateRange : undefined}
            onDateRangeChange={onDateRangeChange}
            pcoConnected={church.pcoConnected}
            activePage={activePage as any}
            overviewWidgets={user.widgetPreferences?.['giving_overview'] || []}
            donorWidgets={user.widgetPreferences?.['giving_donors'] || []}
            onUpdateOverviewWidgets={(w) => {
                const newPrefs = { ...user.widgetPreferences, 'giving_overview': w };
                firestore.updateUserPreferences(user.id, newPrefs);
                setUser({ ...user, widgetPreferences: newPrefs });
            }}
            onUpdateDonorWidgets={(w) => {
                const newPrefs = { ...user.widgetPreferences, 'giving_donors': w };
                firestore.updateUserPreferences(user.id, newPrefs);
                setUser({ ...user, widgetPreferences: newPrefs });
            }}
            allowedWidgetIds={allowedWidgetIds}
            onSyncRecent={onSyncRecent}
            isSyncing={isSyncing}
            budgets={budgets}
            funds={funds}
            donations={donations}
            churchId={church.id}
            church={church}
            people={people}
            totalPeople={people.length}
            onUpdateTheme={onUpdateTheme}
            currentTheme={user.theme}
            onSaveBudget={onSaveBudget}
        />
    );
};
