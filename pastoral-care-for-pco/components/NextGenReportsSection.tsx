import React from 'react';
import { PeopleDashboardData } from '../types';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Legend, PieChart, Pie, Cell
} from 'recharts';

interface NextGenReportsSectionProps {
    data: PeopleDashboardData;
}

const AGE_COLORS: Record<string, string> = {
    '0\u20135 (Nursery)':         '#38bdf8',
    '6\u201311 (Elementary)':     '#34d399',
    '12\u201314 (Middle School)': '#fbbf24',
    '15\u201318 (High School)':   '#f87171',
    '19\u201325 (Young Adult)':   '#a78bfa',
};
const RETENTION_COLORS = { healthy: '#10b981', atRisk: '#f59e0b', disconnected: '#f43f5e' };
const GUARDIAN_COLORS = ['#10b981', '#f59e0b', '#f43f5e'];

const tooltipStyle = {
    contentStyle: {
        backgroundColor: '#1e293b', border: 'none', borderRadius: '12px',
        color: '#f8fafc', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)',
    },
    itemStyle: { fontSize: '13px', fontWeight: 600 },
};
const axisStyle = { axisLine: false as const, tickLine: false as const, tick: { fontSize: 12, fill: '#64748b' } };

function StatCard({ label, value, sub, color = 'indigo' }: { label: string; value: string | number; sub?: string; color?: string }) {
    const colorMap: Record<string, string> = {
        indigo:  'bg-indigo-50  dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400',
        emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400',
        rose:    'bg-rose-50    dark:bg-rose-900/20    text-rose-600    dark:text-rose-400',
        amber:   'bg-amber-50   dark:bg-amber-900/20   text-amber-600   dark:text-amber-400',
        sky:     'bg-sky-50     dark:bg-sky-900/20     text-sky-600     dark:text-sky-400',
        violet:  'bg-violet-50  dark:bg-violet-900/20  text-violet-600  dark:text-violet-400',
    };
    return (
        <div className={`rounded-2xl p-5 ${colorMap[color] ?? colorMap.indigo}`}>
            <p className="text-sm font-semibold opacity-70">{label}</p>
            <p className="text-3xl font-black mt-1">{value}</p>
            {sub && <p className="text-xs font-medium opacity-60 mt-1">{sub}</p>}
        </div>
    );
}

function ChartCard({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
    return (
        <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 lg:p-8 shadow-sm">
            <div className="mb-6">
                <h4 className="text-xl font-black text-slate-900 dark:text-white">{title}</h4>
                {subtitle && <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">{subtitle}</p>}
            </div>
            {children}
        </div>
    );
}

function EmptyState({ message }: { message: string }) {
    return (
        <div className="h-32 flex items-center justify-center text-sm text-slate-400 dark:text-slate-600 text-center px-4">
            {message}
        </div>
    );
}

export const NextGenReportsSection: React.FC<NextGenReportsSectionProps> = ({ data }) => {
    const ng = data.nextGenStats;

    if (!ng) {
        return (
            <div className="text-center py-16 text-slate-400 dark:text-slate-600">
                NextGen data is unavailable — ensure people have birthdates or are marked as children in Planning Center.
            </div>
        );
    }

    const guardianPieData = [
        { name: 'Both Engaged',    value: ng.guardianEngagement.bothEngaged },
        { name: 'One Engaged',     value: ng.guardianEngagement.oneEngaged },
        { name: 'Neither Engaged', value: ng.guardianEngagement.neitherEngaged },
    ].filter(d => d.value > 0);

    const retentionChartData = ng.retentionByGrade.map(r => ({
        grade:        r.grade.replace(' Grade', '').replace('Kindergarten', 'K'),
        Healthy:      r.healthy,
        'At Risk':    r.atRisk,
        Disconnected: r.disconnected,
    }));

    return (
        <div className="space-y-8">
            {/* Section header */}
            <div className="flex items-center gap-3 pt-4">
                <div className="h-8 w-1 rounded-full bg-indigo-500" />
                <div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white">NextGen Ministry</h3>
                    <p className="text-sm text-slate-500 dark:text-slate-400">
                        Ages 0\u201325 &middot; {ng.totalNextGen.toLocaleString()} people
                    </p>
                </div>
            </div>

            {/* Row 1: Quick stats */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
                <StatCard label="Total NextGen" value={ng.totalNextGen.toLocaleString()} color="indigo" />
                <StatCard label="New This Month" value={ng.newNextGenThisMonth.toLocaleString()} color="sky" />
                <StatCard label="Serving in PCO Services" value={ng.servingCount.toLocaleString()} color="emerald" />
                <StatCard
                    label="Birthdate Coverage"
                    value={`${ng.withBirthdatePct}%`}
                    sub="of NextGen have a birthdate"
                    color={ng.withBirthdatePct >= 80 ? 'emerald' : ng.withBirthdatePct >= 50 ? 'amber' : 'rose'}
                />
            </div>

            {/* Panel 1: Grade breakdown */}
            <ChartCard
                title="NextGen by Grade"
                subtitle="Count per school grade. People aged 19\u201325 without a PCO grade appear as 'Young Adult'."
            >
                {ng.gradeBreakdown.length > 0 ? (
                    <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={ng.gradeBreakdown} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                                <XAxis dataKey="grade" {...axisStyle} dy={8}
                                    tickFormatter={g => (g as string).replace(' Grade', '').replace('Kindergarten', 'K')} />
                                <YAxis {...axisStyle} allowDecimals={false} />
                                <Tooltip {...tooltipStyle} />
                                <Bar dataKey="count" name="People" fill="#6366f1" radius={[6, 6, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <EmptyState message="No grade data found. Grade syncs from PCO \u2014 ensure children have a grade set in Planning Center." />
                )}
            </ChartCard>

            {/* Panel 2: Attendance by age group */}
            <ChartCard
                title="Attendance by Age Group"
                subtitle="Percentage of NextGen with at least one check-in and average check-in count, by age bracket."
            >
                {ng.ageGroupAttendance.length > 0 ? (
                    <div className="space-y-4">
                        {ng.ageGroupAttendance.map(group => {
                            const color = AGE_COLORS[group.ageGroup] ?? '#94a3b8';
                            return (
                                <div key={group.ageGroup} className="flex items-center gap-4">
                                    <span className="w-44 text-sm font-semibold text-slate-700 dark:text-slate-300 shrink-0">
                                        {group.ageGroup}
                                    </span>
                                    <div className="flex-1 relative h-7 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                        <div
                                            className="absolute inset-y-0 left-0 rounded-full transition-all duration-500"
                                            style={{ width: `${group.withCheckInPct}%`, backgroundColor: color, opacity: 0.85 }}
                                        />
                                    </div>
                                    <div className="shrink-0 text-right min-w-[140px]">
                                        <span className="text-sm font-black" style={{ color }}>{group.withCheckInPct}%</span>
                                        <span className="text-xs text-slate-400 ml-2">avg {group.avgCheckIns} check-ins</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                ) : (
                    <EmptyState message="No check-in data found for NextGen individuals." />
                )}
            </ChartCard>

            {/* Panel 3: Serving */}
            <ChartCard
                title="Serving in PCO Services"
                subtitle="NextGen individuals who appear on a scheduled team in PCO Services \u2014 actual volunteer placement, not group membership."
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                    <div className="rounded-2xl bg-emerald-50 dark:bg-emerald-900/20 p-6 text-center">
                        <p className="text-5xl font-black text-emerald-600 dark:text-emerald-400">
                            {ng.servingCount.toLocaleString()}
                        </p>
                        <p className="text-sm font-semibold text-emerald-700 dark:text-emerald-300 mt-2">
                            NextGen volunteers scheduled
                        </p>
                        {ng.totalNextGen > 0 && (
                            <p className="text-xs text-emerald-600/70 dark:text-emerald-400/70 mt-1">
                                {Math.round((ng.servingCount / ng.totalNextGen) * 100)}% of all NextGen
                            </p>
                        )}
                    </div>
                    {ng.servingByAgeGroup.length > 0 ? (
                        <div className="h-[200px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={ng.servingByAgeGroup} layout="vertical"
                                    margin={{ top: 0, right: 8, left: 8, bottom: 0 }}>
                                    <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#334155" opacity={0.2} />
                                    <XAxis type="number" {...axisStyle} allowDecimals={false} />
                                    <YAxis type="category" dataKey="ageGroup" width={140} {...axisStyle}
                                        tickFormatter={g => (g as string).split(' (')[0]} />
                                    <Tooltip {...tooltipStyle} />
                                    <Bar dataKey="count" name="Serving" radius={[0, 6, 6, 0]}>
                                        {ng.servingByAgeGroup.map(entry => (
                                            <Cell key={entry.ageGroup} fill={AGE_COLORS[entry.ageGroup] ?? '#10b981'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <div className="flex items-center justify-center text-sm text-slate-400">
                            No age-group breakdown yet
                        </div>
                    )}
                </div>
            </ChartCard>

            {/* Panels 4 & 5: Giving */}
            <ChartCard
                title="Giving"
                subtitle="Direct giving by NextGen individuals (in their own name) and financial engagement of NextGen families."
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="rounded-2xl bg-violet-50 dark:bg-violet-900/20 p-6">
                        <p className="text-sm font-semibold text-violet-700 dark:text-violet-300">Direct NextGen Giving</p>
                        <p className="text-4xl font-black text-violet-600 dark:text-violet-400 mt-2">
                            {ng.directGivingCount.toLocaleString()}
                        </p>
                        <p className="text-xs font-medium text-violet-600/70 dark:text-violet-400/70 mt-1">
                            individuals gave directly this year
                        </p>
                        {ng.directGivingYtd > 0 && (
                            <p className="text-lg font-black text-violet-600 dark:text-violet-400 mt-3">
                                ${ng.directGivingYtd.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                <span className="text-xs font-semibold ml-1 opacity-70">YTD</span>
                            </p>
                        )}
                    </div>
                    <div className="rounded-2xl bg-indigo-50 dark:bg-indigo-900/20 p-6">
                        <p className="text-sm font-semibold text-indigo-700 dark:text-indigo-300">Giving Families</p>
                        <p className="text-4xl font-black text-indigo-600 dark:text-indigo-400 mt-2">
                            {ng.givingHouseholdCount.toLocaleString()}
                        </p>
                        <p className="text-xs font-medium text-indigo-600/70 dark:text-indigo-400/70 mt-1">
                            households with NextGen member &amp; a giving parent/guardian
                        </p>
                        {ng.givingHouseholdTotal > 0 && (
                            <p className="text-lg font-black text-indigo-600 dark:text-indigo-400 mt-3">
                                ${ng.givingHouseholdTotal.toLocaleString(undefined, { maximumFractionDigits: 0 })}
                                <span className="text-xs font-semibold ml-1 opacity-70">family YTD</span>
                            </p>
                        )}
                    </div>
                </div>
            </ChartCard>

            {/* Panel 6: Spiritual milestones */}
            <ChartCard
                title="Spiritual Milestones"
                subtitle="Salvations and baptisms recorded for NextGen individuals in Planning Center."
            >
                <div className="grid grid-cols-2 gap-4">
                    <StatCard label="Salvations" value={ng.milestones.salvations.toLocaleString()} color="emerald" />
                    <StatCard label="Baptisms"   value={ng.milestones.baptisms.toLocaleString()}   color="sky" />
                </div>
                {ng.milestones.salvations === 0 && ng.milestones.baptisms === 0 && (
                    <p className="text-xs text-slate-400 mt-4 text-center">
                        No milestone dates recorded. Add them in PCO People profiles.
                    </p>
                )}
            </ChartCard>

            {/* Panel 7: Retention by grade */}
            <ChartCard
                title="Retention by Grade"
                subtitle="Risk profile breakdown per grade \u2014 Healthy, At Risk, and Disconnected. Surfaces which cohorts are disengaging."
            >
                {retentionChartData.length > 0 ? (
                    <div className="h-[320px]">
                        <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={retentionChartData} margin={{ top: 4, right: 8, left: -20, bottom: 0 }}>
                                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#334155" opacity={0.2} />
                                <XAxis dataKey="grade" {...axisStyle} dy={8} />
                                <YAxis {...axisStyle} allowDecimals={false} />
                                <Tooltip {...tooltipStyle} />
                                <Legend verticalAlign="top" height={36} iconType="circle"
                                    wrapperStyle={{ fontSize: '12px', fontWeight: 600, color: '#64748b' }} />
                                <Bar dataKey="Healthy"      stackId="a" fill={RETENTION_COLORS.healthy} />
                                <Bar dataKey="At Risk"      stackId="a" fill={RETENTION_COLORS.atRisk} />
                                <Bar dataKey="Disconnected" stackId="a" fill={RETENTION_COLORS.disconnected} radius={[4, 4, 0, 0]} />
                            </BarChart>
                        </ResponsiveContainer>
                    </div>
                ) : (
                    <EmptyState message="No retention data available. Risk scores calculate automatically once check-in data is synced." />
                )}
            </ChartCard>

            {/* Panel 8: Guardian engagement */}
            <ChartCard
                title="Guardian Engagement"
                subtitle="For households with NextGen members \u2014 how many guardians are Healthy in their own engagement score?"
            >
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 items-center">
                    {guardianPieData.length > 0 ? (
                        <div className="h-[220px]">
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie data={guardianPieData} cx="50%" cy="50%"
                                        innerRadius={60} outerRadius={90} paddingAngle={3} dataKey="value">
                                        {guardianPieData.map((_, i) => (
                                            <Cell key={i} fill={GUARDIAN_COLORS[i]} />
                                        ))}
                                    </Pie>
                                    <Tooltip {...tooltipStyle} />
                                </PieChart>
                            </ResponsiveContainer>
                        </div>
                    ) : (
                        <EmptyState message="No household data available." />
                    )}
                    <div className="space-y-4">
                        {[
                            { label: 'Both Engaged',    value: ng.guardianEngagement.bothEngaged,    color: GUARDIAN_COLORS[0] },
                            { label: 'One Engaged',     value: ng.guardianEngagement.oneEngaged,     color: GUARDIAN_COLORS[1] },
                            { label: 'Neither Engaged', value: ng.guardianEngagement.neitherEngaged, color: GUARDIAN_COLORS[2] },
                        ].map(item => (
                            <div key={item.label} className="flex items-center gap-3">
                                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: item.color }} />
                                <span className="text-sm font-semibold text-slate-700 dark:text-slate-300 flex-1">{item.label}</span>
                                <span className="text-xl font-black" style={{ color: item.color }}>
                                    {item.value.toLocaleString()}
                                </span>
                            </div>
                        ))}
                        <p className="text-xs text-slate-400 dark:text-slate-600 pt-2">
                            Households where kids attend but parents are disengaged may need pastoral outreach.
                        </p>
                    </div>
                </div>
            </ChartCard>

            {/* Data quality alert */}
            {ng.withBirthdatePct < 80 && (
                <div className="rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-5">
                    <p className="text-sm font-black text-amber-700 dark:text-amber-400">&#9888; Data Quality Alert</p>
                    <p className="text-sm text-amber-700/80 dark:text-amber-400/80 mt-1">
                        Only <strong>{ng.withBirthdatePct}%</strong> of NextGen records have a birthdate.
                        Age-based reports may be incomplete. Use the <strong>Church Helper</strong> to collect
                        missing birthdate information from families via SMS.
                    </p>
                </div>
            )}
        </div>
    );
};
