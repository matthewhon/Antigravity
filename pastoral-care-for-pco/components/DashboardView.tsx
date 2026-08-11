import React, { useCallback, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import {
    User, PeopleDashboardData, GivingAnalytics, GroupsDashboardData,
    ServicesDashboardData, AttendanceData, CensusStats, BudgetRecord,
    PcoFund, DetailedDonation, ServicesTeam, RiskChangeRecord, StatusChangeRecord
} from '../types';
import { DashboardOverview } from '../services/dashboardService';
import { Eyebrow } from './SharedUI';
import { PastorAIView } from './PastorAIView';
import { ServicesTimelineWidget } from './ServicesTimelineWidget';
import { OnboardingTaskWidget } from './widgets/OnboardingTaskWidget';
import { PulseBar } from './dashboard/PulseBar';
import { NeedsAttention } from './dashboard/NeedsAttention';
import { WeekComparison } from './dashboard/WeekComparison';
import { TrendStrip } from './dashboard/TrendStrip';
import { AreaBands } from './dashboard/AreaBands';
import { TenantHealth } from './dashboard/TenantHealth';
import { Section } from './dashboard/DashboardPrimitives';

/**
 * DashboardView — a designed overview page, not a widget grid.
 *
 * Sections render in a fixed order and are filtered by role upstream: the
 * `overview` object only carries what this user is allowed to see, so there is
 * no per-section permission check here. Because the page is a vertical stack,
 * a hidden section simply closes up behind the ones above it.
 *
 * The other analytics views (People, Groups, Services, Giving) keep their
 * widget system — customisation earns its keep in an analyst's workspace, much
 * less so on a landing page opened twenty times a day.
 */

interface DashboardViewProps {
    user: User;
    overview: DashboardOverview | null;
    /** Section order for this user's primary role. Unknown ids are ignored. */
    sectionOrder?: string[];

    peopleData: PeopleDashboardData | null;
    givingAnalytics: GivingAnalytics | null;
    groupsData: GroupsDashboardData | null;
    servicesData: ServicesDashboardData | null;
    attendanceData: AttendanceData[];
    censusData: CensusStats | null;
    budgets: BudgetRecord[];
    funds: PcoFund[];
    donations: DetailedDonation[];
    teams: ServicesTeam[];
    recentRiskChanges?: RiskChangeRecord[];
    recentStatusChanges?: StatusChangeRecord[];

    pcoConnected: boolean;
    onConnectPco: () => void;
    globalInsights: string;
    isGeneratingInsights: boolean;
    onGenerateInsights: () => void;
    churchName: string;
    campusName?: string | null;
    /** When false (Starter plan), the Pastor AI panel and toggle are hidden. */
    isPastorAIEnabled?: boolean;
    /** Hide the setup checklist once onboarding is finished. */
    showOnboarding?: boolean;
}

const DEFAULT_SECTION_ORDER = [
    'needs_attention',
    'this_week',
    'trends',
    'areas',
    'timeline',
    'tenant_health',
];

export const DashboardView: React.FC<DashboardViewProps> = ({
    user,
    overview,
    sectionOrder,
    peopleData,
    givingAnalytics,
    groupsData,
    servicesData,
    attendanceData,
    censusData,
    budgets,
    funds,
    donations,
    teams,
    recentRiskChanges,
    recentStatusChanges,
    pcoConnected,
    onConnectPco,
    globalInsights,
    isGeneratingInsights,
    onGenerateInsights,
    churchName,
    campusName,
    isPastorAIEnabled = true,
    showOnboarding = true,
}) => {
    const [showAI, setShowAI] = useState<boolean>(() => {
        try {
            const saved = localStorage.getItem('dashboard_showAI');
            return saved === null ? true : saved === 'true';
        } catch {
            return true;
        }
    });

    const toggleShowAI = useCallback(() => {
        setShowAI(v => {
            const next = !v;
            try { localStorage.setItem('dashboard_showAI', String(next)); } catch {}
            return next;
        });
    }, []);

    const aiVisible = showAI && isPastorAIEnabled;

    if (!overview) {
        return (
            <div className="py-24 text-center">
                <p className="text-sm font-bold text-slate-400 dark:text-slate-500">Loading your dashboard…</p>
            </div>
        );
    }

    // The giving half of the timeline is gated: if this user's overview carries
    // no giving band and no giving pulse figure, they may not see batch amounts.
    const maySeeGiving = overview.pulse.givingMtd !== null || !!overview.areas.giving;

    const sections: Record<string, React.ReactNode> = {
        needs_attention: <NeedsAttention key="needs_attention" rows={overview.needsAttention} />,
        this_week: <WeekComparison key="this_week" rows={overview.thisWeek} />,
        trends: <TrendStrip key="trends" series={overview.trends} />,
        areas: <AreaBands key="areas" areas={overview.areas} />,
        timeline: (
            <Section key="timeline" title="Timeline" caption="services, giving and what's coming up">
                <ServicesTimelineWidget
                    servicesData={servicesData}
                    donations={donations}
                    showGiving={maySeeGiving}
                />
            </Section>
        ),
        tenant_health: overview.tenantHealth
            ? <TenantHealth key="tenant_health" health={overview.tenantHealth} pcoConnected={pcoConnected} />
            : null,
    };

    const order = (sectionOrder && sectionOrder.length > 0 ? sectionOrder : DEFAULT_SECTION_ORDER)
        .filter(id => sections[id]);

    return (
        <div className="grid grid-cols-1 xl:grid-cols-4 gap-8 animate-in fade-in duration-500 items-start">
            <div className={`${aiVisible ? 'col-span-1 xl:col-span-3' : 'col-span-1 xl:col-span-4'}`}>
                <header className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                    <div>
                        <h3 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white">Dashboard</h3>
                        <Eyebrow className="block mt-1.5">Executive Overview</Eyebrow>
                    </div>
                    <div className="flex items-center gap-4 print:hidden">
                        {!pcoConnected && (
                            <button
                                data-tour="connect-pco"
                                onClick={onConnectPco}
                                className="bg-amber-500 hover:bg-amber-600 text-white px-6 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wide transition-all shadow-lg shadow-amber-200 dark:shadow-amber-900/20"
                            >
                                Connect Planning Center
                            </button>
                        )}
                        {isPastorAIEnabled && (
                            <button
                                data-tour="ai-toggle"
                                onClick={toggleShowAI}
                                title={showAI ? 'Hide AI Assistant' : 'Show AI Assistant'}
                                className={`flex items-center gap-2 px-4 py-2.5 rounded-2xl text-[10px] font-bold uppercase tracking-wide transition-all border shadow-sm ${
                                    showAI
                                        ? 'bg-indigo-600 text-white border-indigo-600 shadow-indigo-200 dark:shadow-none'
                                        : 'bg-white dark:bg-slate-800 text-slate-500 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-indigo-300 hover:text-indigo-600'
                                }`}
                            >
                                <span aria-hidden="true">🤖</span>
                                <span>{showAI ? 'Hide AI' : 'Show AI'}</span>
                            </button>
                        )}
                    </div>
                </header>

                {showOnboarding && (
                    <div data-tour="setup-guide" className="mb-10">
                        <OnboardingTaskWidget />
                    </div>
                )}

                <PulseBar overview={overview} churchName={churchName} campusName={campusName} />

                {globalInsights && (
                    <Section title="Executive briefing" caption="AI analysis">
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-indigo-100 dark:border-slate-700 shadow-sm relative overflow-hidden">
                            <div aria-hidden="true" className="absolute -right-10 -top-10 w-64 h-64 bg-indigo-50/50 dark:bg-indigo-900/10 rounded-full blur-3xl pointer-events-none" />
                            <div className="relative z-10 prose prose-sm prose-slate dark:prose-invert max-w-none">
                                <ReactMarkdown>{globalInsights}</ReactMarkdown>
                            </div>
                        </div>
                    </Section>
                )}

                {!globalInsights && isPastorAIEnabled && (
                    <Section title="Executive briefing">
                        <div className="bg-white dark:bg-slate-800 p-8 rounded-3xl border border-slate-100 dark:border-slate-700 shadow-sm flex items-center justify-between gap-6 flex-wrap">
                            <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                                Generate an AI summary of what's notable across your church this week.
                            </p>
                            <button
                                onClick={onGenerateInsights}
                                disabled={isGeneratingInsights}
                                className="bg-indigo-600 hover:bg-indigo-700 disabled:opacity-60 text-white px-6 py-2.5 rounded-xl font-bold text-[10px] uppercase tracking-wide transition-all"
                            >
                                {isGeneratingInsights ? 'Generating…' : 'Generate briefing'}
                            </button>
                        </div>
                    </Section>
                )}

                {order.map(id => sections[id])}
            </div>

            {aiVisible && (
                <div className="col-span-1 xl:sticky xl:top-0 h-[600px] xl:h-[calc(100vh-140px)] print:hidden">
                    <PastorAIView
                        peopleData={peopleData}
                        givingAnalytics={givingAnalytics}
                        groupsData={groupsData}
                        servicesData={servicesData}
                        attendanceData={attendanceData}
                        censusData={censusData}
                        churchName={churchName}
                        donations={donations}
                        funds={funds}
                        budgets={budgets}
                        teams={teams}
                        recentRiskChanges={recentRiskChanges}
                        recentStatusChanges={recentStatusChanges}
                    />
                </div>
            )}
        </div>
    );
};
