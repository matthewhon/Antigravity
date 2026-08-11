import React from 'react';
import { Link } from 'react-router-dom';
import { DashboardOverview } from '../../services/dashboardService';
import { Card, Meter, Section, SectionControls, fmtCurrency, fmtNumber } from './DashboardPrimitives';

/**
 * One compact band per ministry area the user can read.
 *
 * `overview.areas` only contains keys the role gate allowed, so this renders
 * whatever it's given — no per-band permission checks needed here.
 */

interface BandFigure {
    label: string;
    value: string;
    /** Muted styling for a figure that's contextual rather than headline. */
    subtle?: boolean;
    /** A ratio against a limit renders as a meter rather than a bare number. */
    meter?: number;
}

interface Band {
    id: string;
    title: string;
    href: string;
    figures: BandFigure[];
}


const dateShort = (iso: string | null) =>
    iso ? new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' }) : '—';

const buildBands = (areas: DashboardOverview['areas']): Band[] => {
    const bands: Band[] = [];

    if (areas.people) {
        bands.push({
            id: 'people', title: 'People', href: '/people',
            figures: [
                { label: 'Total', value: fmtNumber(areas.people.total) },
                { label: 'New this month', value: fmtNumber(areas.people.newThisMonth) },
                { label: 'At risk', value: fmtNumber(areas.people.atRisk) },
                { label: 'Not in a group', value: fmtNumber(areas.people.unconnected) },
            ],
        });
    }

    if (areas.giving) {
        bands.push({
            id: 'giving', title: 'Giving', href: '/giving',
            figures: [
                { label: 'This month', value: fmtCurrency(areas.giving.mtd) },
                { label: 'Year to date', value: fmtCurrency(areas.giving.ytd) },
                { label: 'Active donors', value: fmtNumber(areas.giving.activeDonors) },
                { label: 'Lapsed', value: fmtNumber(areas.giving.lapsedDonors) },
            ],
        });
    }

    if (areas.groups) {
        bands.push({
            id: 'groups', title: 'Groups', href: '/groups',
            figures: [
                { label: 'Active groups', value: fmtNumber(areas.groups.activeGroups) },
                { label: 'People in a group', value: fmtNumber(areas.groups.peopleInGroups) },
                { label: 'Connection rate', value: '', meter: areas.groups.connectionRate },
                { label: 'Avg attendance', value: fmtNumber(areas.groups.avgAttendance) },
            ],
        });
    }

    if (areas.services) {
        bands.push({
            id: 'services', title: 'Services', href: '/services',
            figures: [
                { label: 'Last Sunday', value: fmtNumber(areas.services.lastSunday) },
                { label: 'Volunteers', value: fmtNumber(areas.services.volunteers) },
                { label: 'Fill rate', value: '', meter: areas.services.fillRate },
                { label: 'Next service', value: dateShort(areas.services.nextServiceDate), subtle: true },
            ],
        });
    }

    if (areas.comms) {
        const c = areas.comms;
        const figures: BandFigure[] = [];
        // Each half of this band has its own gate — a Messaging-only user sees
        // the SMS figures and nothing else.
        if (c.smsTotal || c.activeThreads || c.needsReply) {
            figures.push({ label: 'SMS · 30 days', value: fmtNumber(c.smsTotal) });
            figures.push({ label: 'Awaiting reply', value: fmtNumber(c.needsReply) });
        }
        if (c.emailRecipients !== null) {
            figures.push({ label: 'Emails · 30 days', value: fmtNumber(c.emailRecipients) });
        }
        if (c.outreachContactRate !== null) {
            figures.push({ label: 'Outreach reached', value: '', meter: c.outreachContactRate });
        }
        if (c.groupCareCoverage !== null) {
            figures.push({ label: 'Group care', value: '', meter: c.groupCareCoverage });
        }
        if (figures.length > 0) {
            bands.push({ id: 'comms', title: 'Communications', href: '/tools/sms/inbox', figures });
        }
    }

    if (areas.care) {
        bands.push({
            id: 'care', title: 'Care', href: '/care/care',
            figures: [
                { label: 'Open follow-ups', value: fmtNumber(areas.care.openFollowUps) },
                { label: 'Prayer requests', value: fmtNumber(areas.care.prayerRequests) },
                { label: 'Touches this month', value: fmtNumber(areas.care.touchesThisMonth) },
            ],
        });
    }

    return bands;
};

interface AreaBandsProps extends SectionControls {
    areas: DashboardOverview['areas'];
}

export const AreaBands: React.FC<AreaBandsProps> = ({ areas, ...controls }: AreaBandsProps) => {
    const bands = buildBands(areas);
    if (bands.length === 0) return null;

    return (
        <Section title="By area" {...controls}>
            <div className="flex flex-col gap-4">
                {bands.map(band => (
                    <Card key={band.id} className="p-6 print:p-3">
                        <div className="flex items-baseline justify-between gap-4 mb-5">
                            <h4 className="text-base font-black tracking-tight text-slate-900 dark:text-white">
                                {band.title}
                            </h4>
                            <Link
                                to={band.href}
                                className="text-[11px] font-bold uppercase tracking-wider text-indigo-500 dark:text-indigo-400 hover:text-indigo-700 dark:hover:text-indigo-300 transition-colors print:hidden focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400 rounded"
                            >
                                Open {band.title} →
                            </Link>
                        </div>
                        <div
                            className="grid gap-6"
                            style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(130px, 1fr))' }}
                        >
                            {band.figures.map((f, i) => f.meter !== undefined ? (
                                <Meter key={f.label} value={f.meter} label={f.label} slot={i} />
                            ) : (
                                <div key={f.label}>
                                    <p
                                        className={
                                            'font-black tracking-tighter tabular-nums ' +
                                            (f.subtle
                                                ? 'text-xl text-slate-500 dark:text-slate-400'
                                                : 'text-2xl text-slate-900 dark:text-white')
                                        }
                                    >
                                        {f.value}
                                    </p>
                                    <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-1.5">
                                        {f.label}
                                    </p>
                                </div>
                            ))}
                        </div>
                    </Card>
                ))}
            </div>
        </Section>
    );
};
