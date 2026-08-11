import React from 'react';
import { DashboardOverview } from '../../services/dashboardService';
import { Card, Section, SectionControls, fmtAgo, fmtNumber } from './DashboardPrimitives';

/**
 * Operational state of the tenant itself — admin only.
 *
 * Sync freshness leads because a silently failing sync is the failure mode that
 * makes every other number on this page quietly wrong.
 */
interface TenantHealthProps extends SectionControls {
    health: NonNullable<DashboardOverview['tenantHealth']>;
    pcoConnected: boolean;
}

export const TenantHealth: React.FC<TenantHealthProps> = ({ health, pcoConnected, ...controls }: TenantHealthProps) => {
    const syncAge = health.lastSyncAt ? Date.now() - health.lastSyncAt : null;
    const syncStale = syncAge === null || syncAge > 24 * 60 * 60 * 1000;

    const items: { label: string; value: string; tone?: 'ok' | 'warn' }[] = [
        {
            label: 'Planning Center',
            value: pcoConnected ? 'Connected' : 'Not connected',
            tone: pcoConnected ? 'ok' : 'warn',
        },
        {
            label: 'Last sync',
            value: fmtAgo(syncAge),
            tone: syncStale ? 'warn' : 'ok',
        },
        {
            label: 'SMS segments · this month',
            value: fmtNumber(health.smsSegmentsThisMonth),
        },
        {
            label: 'SMS spend · this month',
            value: `$${health.smsSpendThisMonth.toFixed(2)}`,
        },
        {
            label: 'Active people',
            value: health.activePeopleCount === null ? '—' : fmtNumber(health.activePeopleCount),
        },
        {
            label: 'Plan',
            value: health.planId
                ? `${health.planId}${health.subscriptionStatus && health.subscriptionStatus !== 'active' ? ` · ${health.subscriptionStatus}` : ''}`
                : '—',
        },
    ];

    return (
        <Section title="Tenant health" caption="visible to church admins only" {...controls}>
            <Card className="p-6 print:p-3">
                <div
                    className="grid gap-6"
                    style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))' }}
                >
                    {items.map(item => (
                        <div key={item.label}>
                            <p
                                className={
                                    'text-xl font-black tracking-tight tabular-nums ' +
                                    (item.tone === 'warn'
                                        ? 'text-amber-600 dark:text-amber-400'
                                        : item.tone === 'ok'
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : 'text-slate-900 dark:text-white')
                                }
                            >
                                {item.value}
                            </p>
                            <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-1.5">
                                {item.label}
                            </p>
                        </div>
                    ))}
                </div>
            </Card>
        </Section>
    );
};
