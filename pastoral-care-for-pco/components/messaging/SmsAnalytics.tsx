import React, { useState, useEffect } from 'react';
import { db as firebaseDb } from '../../services/firebase';
import { collection, query, where, orderBy, limit, getDocs } from 'firebase/firestore';
import { SmsCampaign } from '../../types';
import {
    MessageSquare, Send, CheckCircle, Loader2,
    BarChart3, MessageCircle, TrendingUp, TrendingDown,
    Activity, UserX, AlertTriangle, ArrowLeft, ChevronRight,
    Users, Clock, DollarSign
} from 'lucide-react';
import { ToolPage, ToolTabs } from '../tool-shell';

interface UsageSummary {
    totalSent: number;
    totalDelivered: number;
    totalFailed: number;
    totalBulk: number;
    totalReplies: number;
    totalOptOuts: number;
    estimatedCostUsd: number;
    deliveryRate: number;
}

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const StatCard: React.FC<{
    label: string;
    value: string | number;
    sub?: string;
    icon: React.ReactNode;
    color?: string;
    trend?: 'up' | 'down' | 'neutral';
}> = ({ label, value, sub, icon, color = 'violet', trend }) => {
    const colorMap: Record<string, string> = {
        violet: 'bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-300',
        emerald: 'bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-300',
        amber: 'bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400',
        red: 'bg-red-50 dark:bg-red-900/20 text-red-500 dark:text-red-400',
        blue: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-300',
        slate: 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300',
    };
    return (
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
            <div className="flex items-start justify-between mb-3">
                <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${colorMap[color] || colorMap.violet}`}>
                    {icon}
                </div>
                {trend && (
                    <span className={`text-xs font-bold flex items-center gap-0.5 ${trend === 'up' ? 'text-emerald-600' : trend === 'down' ? 'text-red-500' : 'text-slate-400'}`}>
                        {trend === 'up' ? <TrendingUp size={12} /> : trend === 'down' ? <TrendingDown size={12} /> : null}
                    </span>
                )}
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mb-0.5">{value}</p>
            <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">{label}</p>
            {sub && <p className="text-xs text-slate-400 mt-1">{sub}</p>}
        </div>
    );
};

const MiniBar: React.FC<{ pct: number; color?: string; label?: string }> = ({ pct, color = 'bg-indigo-500', label }) => (
    <div
        className="w-full h-2 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"
        title={label ?? `${Math.round(pct)}%`}
        aria-label={label ?? `${Math.round(pct)}%`}
    >
        <div className={`bar-fill ${color}`} ref={el => el?.style.setProperty('--bar-w', `${Math.min(100, Math.max(0, pct))}%`)} />
    </div>
);

export const SmsAnalytics: React.FC<{
    churchId: string;
    campaigns: SmsCampaign[];
    smsNumberId?: string | null;
    onSelectCampaign?: (campaign: SmsCampaign) => void;
    embedded?: boolean;
}> = ({ churchId, campaigns, smsNumberId, onSelectCampaign, embedded = false }) => {
    const [summary, setSummary] = useState<UsageSummary | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [, setOptOuts] = useState(0);
    const [monthlyData, setMonthlyData] = useState<{ month: string; label: string; sent: number; delivered: number }[]>([]);
    const [period, setPeriod] = useState<'30d' | '90d' | 'all'>('30d');

    useEffect(() => {
        let active = true;
        setIsLoading(true);

        const fetchData = async () => {
            try {
                const optSnap = await getDocs(
                    query(collection(firebaseDb, 'smsOptOuts'), where('churchId', '==', churchId))
                );
                const optOutCount = optSnap.size;

                const usageSnap = await getDocs(
                    query(
                        collection(firebaseDb, 'smsUsageRecords'),
                        where('churchId', '==', churchId),
                        orderBy('createdAt', 'desc'),
                        limit(5000)
                    )
                );
                let usageRecords: any[] = usageSnap.docs.map(d => d.data());

                if (smsNumberId) {
                    usageRecords = usageRecords.filter(r => r.smsNumberId === smsNumberId || r.numberId === smsNumberId || r.twilioNumberId === smsNumberId);
                }

                let sentCampaigns = campaigns.filter(c => c.status === 'sent');

                if (smsNumberId) {
                    sentCampaigns = sentCampaigns.filter(c => c.smsNumberId === smsNumberId || c.twilioNumberId === smsNumberId);
                }

                const totalSent = sentCampaigns.reduce((s, c) => s + (c.recipientCount ?? 0), 0);
                const totalDelivered = sentCampaigns.reduce((s, c) => s + (c.deliveredCount ?? 0), 0);
                const totalFailed = sentCampaigns.reduce((s, c) => s + (c.failedCount ?? 0), 0);
                const totalOptOutC = sentCampaigns.reduce((s, c) => s + (c.optOutCount ?? 0), 0);
                const totalCost = usageRecords.reduce(
                    (s, r) => s + (typeof r.customerChargeUsd === 'number' ? r.customerChargeUsd : (r.costUsd ?? 0) * 1.2),
                    0
                );

                const convSnap = await getDocs(
                    query(collection(firebaseDb, 'smsConversations'), where('churchId', '==', churchId))
                );
                let convs = convSnap.docs.map(d => d.data());

                if (smsNumberId) {
                    convs = convs.filter(c => c.smsNumberId === smsNumberId || c.inboxId === smsNumberId || c.twilioNumberId === smsNumberId);
                }
                const totalReplies = convs.length;

                const monthMap: Record<string, { sent: number; delivered: number }> = {};
                const now = new Date();
                for (let i = 5; i >= 0; i--) {
                    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
                    const key = `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}`;
                    monthMap[key] = { sent: 0, delivered: 0 };
                }
                for (const c of sentCampaigns) {
                    if (!c.sentAt) continue;
                    const d = new Date(c.sentAt);
                    const key = `${d.getFullYear()}_${String(d.getMonth() + 1).padStart(2, '0')}`;
                    if (monthMap[key]) {
                        monthMap[key].sent += c.recipientCount ?? 0;
                        monthMap[key].delivered += c.deliveredCount ?? 0;
                    }
                }
                const monthly = Object.entries(monthMap).map(([key, v]) => {
                    const [yr, mo] = key.split('_');
                    return { month: key, label: `${MONTH_NAMES[parseInt(mo) - 1]} '${String(yr).slice(2)}`, ...v };
                });

                if (!active) return;
                setOptOuts(Math.max(optOutCount, totalOptOutC));
                setMonthlyData(monthly);
                setSummary({
                    totalSent,
                    totalDelivered,
                    totalFailed,
                    totalBulk: sentCampaigns.length,
                    totalReplies,
                    totalOptOuts: Math.max(optOutCount, totalOptOutC),
                    estimatedCostUsd: totalCost,
                    deliveryRate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
                });
            } catch (e) {
                console.error('[SmsAnalytics] failed', e);
            } finally {
                if (active) setIsLoading(false);
            }
        };

        fetchData();
        return () => { active = false; };
    }, [churchId, campaigns, smsNumberId]);

    const cutoff = period === '30d' ? Date.now() - 30 * 86400_000
        : period === '90d' ? Date.now() - 90 * 86400_000
            : 0;
    const periodCampaigns = campaigns.filter(c => c.status === 'sent' && (c.sentAt ?? 0) >= cutoff);

    const maxSent = Math.max(...monthlyData.map(m => m.sent), 1);

    if (isLoading) {
        return (
            <div className="flex items-center justify-center h-64 text-slate-400">
                <Loader2 size={22} className="animate-spin mr-2" /> Loading analytics...
            </div>
        );
    }

    const Wrapper = embedded ? 'div' : ToolPage;

    return (
        <Wrapper className="space-y-6">
            {!embedded && (
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-slate-900 dark:text-white flex items-center gap-2">
                            <BarChart3 size={18} className="text-indigo-500 dark:text-indigo-400" aria-hidden="true" /> Analytics
                        </h2>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Message performance, delivery rates, and usage overview</p>
                    </div>
                    <ToolTabs
                        ariaLabel="Analytics period"
                        value={period}
                        onChange={setPeriod}
                        tabs={[
                            { value: '30d', label: 'Last 30d' },
                            { value: '90d', label: 'Last 90d' },
                            { value: 'all', label: 'All time' },
                        ]}
                    />
                </div>
            )}
            {embedded && (
                <div className="flex items-center justify-between gap-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400">Message performance, delivery rates, and usage overview</p>
                    <ToolTabs
                        ariaLabel="Analytics period"
                        value={period}
                        onChange={setPeriod}
                        tabs={[
                            { value: '30d', label: 'Last 30d' },
                            { value: '90d', label: 'Last 90d' },
                            { value: 'all', label: 'All time' },
                        ]}
                    />
                </div>
            )}

            {summary && (
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                    <StatCard
                        label="Total Sent"
                        value={summary.totalSent.toLocaleString()}
                        sub={`${summary.totalBulk} campaign${summary.totalBulk !== 1 ? 's' : ''}`}
                        icon={<Send size={18} />}
                        color="violet"
                    />
                    <StatCard
                        label="Delivery Rate"
                        value={`${summary.deliveryRate}%`}
                        sub={`${summary.totalDelivered.toLocaleString()} delivered`}
                        icon={<CheckCircle size={18} />}
                        color={summary.deliveryRate >= 90 ? 'emerald' : summary.deliveryRate >= 70 ? 'amber' : 'red'}
                        trend={summary.deliveryRate >= 90 ? 'up' : summary.deliveryRate < 70 ? 'down' : 'neutral'}
                    />
                    <StatCard
                        label="Conversations"
                        value={summary.totalReplies.toLocaleString()}
                        sub="2-way inbox threads"
                        icon={<MessageCircle size={18} />}
                        color="blue"
                    />
                    <StatCard
                        label="Opt-Outs"
                        value={summary.totalOptOuts.toLocaleString()}
                        sub="STOP replies received"
                        icon={<UserX size={18} />}
                        color={summary.totalOptOuts > 0 ? 'red' : 'emerald'}
                        trend={summary.totalOptOuts > 10 ? 'down' : 'neutral'}
                    />
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                <div className="lg:col-span-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-4">Monthly Volume (last 6 months)</p>
                    {monthlyData.every(m => m.sent === 0) ? (
                        <div className="flex flex-col items-center justify-center h-40 text-slate-400">
                            <Activity size={28} className="mb-2 opacity-30" />
                            <p className="text-sm">No sent campaigns yet</p>
                        </div>
                    ) : (
                        <div className="flex items-end gap-3 h-36">
                            {monthlyData.map(m => {
                                const heightPct = (m.sent / maxSent) * 100;
                                const delivPct = m.sent > 0 ? (m.delivered / m.sent) * 100 : 0;
                                return (
                                    <div key={m.month} className="flex-1 flex flex-col items-center gap-1.5">
                                        <div className="w-full flex flex-col items-center group relative">
                                            <div className="absolute -top-10 left-1/2 -translate-x-1/2 bg-slate-800 dark:bg-slate-700 text-white text-[10px] font-bold px-2 py-1 rounded-lg opacity-0 group-hover:opacity-100 transition whitespace-nowrap pointer-events-none z-10">
                                                {m.sent.toLocaleString()} sent • {m.delivered.toLocaleString()} delivered
                                            </div>
                                            <div
                                                className="w-full h-[120px] bg-slate-100 dark:bg-slate-700 rounded-xl overflow-hidden"
                                                role="img"
                                                aria-label={`${m.label}: ${m.sent} sent, ${m.delivered} delivered`}
                                            >
                                                <div
                                                    className="msg-col-sent bg-indigo-200 dark:bg-indigo-900/40 flex flex-col justify-end" ref={el => { if (el) { el.style.setProperty('--col-h', `${heightPct}%`); el.style.setProperty('--col-mt', `${100 - heightPct}%`); } }}
                                                >
                                                    <div
                                                        className="msg-col-deliv bg-indigo-600" ref={el => el?.style.setProperty('--col-deliv-h', `${delivPct}%`)}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                        <span className="text-[10px] text-slate-400 font-semibold">{m.label}</span>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                    <div className="flex items-center gap-4 mt-3">
                        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                            <span className="w-3 h-3 rounded-sm bg-indigo-200 dark:bg-indigo-900/40" /> Sent
                        </span>
                        <span className="flex items-center gap-1.5 text-[10px] text-slate-500">
                            <span className="w-3 h-3 rounded-sm bg-indigo-600" /> Delivered
                        </span>
                    </div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400">Campaign Performance</p>
                    <span className="text-xs text-slate-400">{periodCampaigns.length} campaigns</span>
                </div>
                {periodCampaigns.length === 0 ? (
                    <div className="text-center py-12 text-slate-400">
                        <MessageSquare size={28} className="mx-auto mb-2 opacity-30" />
                        <p className="text-sm">No sent campaigns in this period</p>
                    </div>
                ) : (
                    <div className="divide-y divide-slate-100 dark:divide-slate-700">
                        {periodCampaigns
                            .sort((a, b) => (b.sentAt ?? 0) - (a.sentAt ?? 0))
                            .slice(0, 10)
                            .map(c => {
                                const total = c.recipientCount ?? 0;
                                const delivered = c.deliveredCount ?? 0;
                                const failed = c.failedCount ?? 0;
                                const rate = total > 0 ? Math.round((delivered / total) * 100) : 0;
                                return (
                                    <div
                                        key={c.id}
                                        onClick={onSelectCampaign ? () => onSelectCampaign(c) : undefined}
                                        className={`px-5 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition ${onSelectCampaign ? 'cursor-pointer' : ''}`}
                                    >
                                        <div className="flex items-start justify-between gap-4 mb-2">
                                            <div className="min-w-0">
                                                <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{c.name}</p>
                                                <p className="text-[10px] text-slate-400 mt-0.5">
                                                    {c.sentAt ? new Date(c.sentAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '...'}
                                                    {c.toListName ? ` • ${c.toListName}` : ''}
                                                    {c.toGroupName ? ` • ${c.toGroupName}` : ''}
                                                </p>
                                            </div>
                                            <div className="flex items-center gap-4 shrink-0 text-right">
                                                <div>
                                                    <p className="text-sm font-black text-slate-900 dark:text-white">{total.toLocaleString()}</p>
                                                    <p className="text-[10px] text-slate-400">sent</p>
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-emerald-600">{delivered.toLocaleString()}</p>
                                                    <p className="text-[10px] text-slate-400">delivered</p>
                                                </div>
                                                {failed > 0 && (
                                                    <div>
                                                        <p className="text-sm font-black text-red-500">{failed.toLocaleString()}</p>
                                                        <p className="text-[10px] text-slate-400">failed</p>
                                                    </div>
                                                )}
                                                <div className="w-16">
                                                    <p className={`text-sm font-black ${rate >= 90 ? 'text-emerald-600' : rate >= 70 ? 'text-amber-600' : 'text-red-500'}`}>{rate}%</p>
                                                    <MiniBar pct={rate} color={rate >= 90 ? 'bg-emerald-500' : rate >= 70 ? 'bg-amber-400' : 'bg-red-500'} />
                                                </div>
                                                {onSelectCampaign && (
                                                    <ChevronRight size={15} className="text-slate-400 shrink-0" />
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                );
                            })
                        }
                    </div>
                )}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-4">Compliance Health</p>
                    <div className="space-y-3">
                        {[
                            {
                                label: 'Delivery rate', pct: summary?.deliveryRate ?? 0,
                                color: (summary?.deliveryRate ?? 0) >= 90 ? 'bg-emerald-500' : 'bg-amber-400',
                                note: (summary?.deliveryRate ?? 0) >= 90 ? 'Excellent' : 'Needs attention'
                            },
                            {
                                label: 'Opt-out rate',
                                pct: summary && summary.totalSent > 0 ? Math.round((summary.totalOptOuts / summary.totalSent) * 100) : 0,
                                color: 'bg-red-400',
                                note: summary && summary.totalSent > 0 ? `${((summary.totalOptOuts / summary.totalSent) * 100).toFixed(1)}% of recipients` : 'No data'
                            },
                            {
                                label: 'Failed rate',
                                pct: summary && summary.totalSent > 0 ? Math.round((summary.totalFailed / summary.totalSent) * 100) : 0,
                                color: 'bg-slate-400',
                                note: summary && summary.totalSent > 0 ? `${((summary.totalFailed / summary.totalSent) * 100).toFixed(1)}% of sends` : 'No data'
                            },
                        ].map(row => (
                            <div key={row.label}>
                                <div className="flex justify-between text-xs mb-1">
                                    <span className="font-semibold text-slate-700 dark:text-slate-300">{row.label}</span>
                                    <span className="text-slate-400">{row.note}</span>
                                </div>
                                <MiniBar pct={row.pct} color={row.color} />
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 flex items-start gap-2 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-2.5">
                        <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                        <span>Carriers may filter messages if opt-out rates exceed 1% or delivery rates fall below 85%.</span>
                    </div>
                </div>

                <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                    <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-4">Quick Stats</p>
                    <div className="space-y-3">
                        {[
                            { label: 'Avg. recipients per campaign', value: summary && summary.totalBulk > 0 ? Math.round(summary.totalSent / summary.totalBulk).toLocaleString() : '...' },
                            { label: 'Total 2-way conversations', value: summary?.totalReplies.toLocaleString() ?? '—' },
                            { label: 'Total opt-outs (all time)', value: summary?.totalOptOuts.toLocaleString() ?? '—' },
                            { label: 'Campaigns sent', value: summary?.totalBulk.toLocaleString() ?? '—' },
                            { label: 'Est. cost per delivered msg', value: summary && summary.totalDelivered > 0 ? `$${((summary.estimatedCostUsd / summary.totalDelivered)).toFixed(4)}` : '...' },
                        ].map(row => (
                            <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
                                <span className="text-xs text-slate-500 dark:text-slate-400">{row.label}</span>
                                <span className="text-sm font-black text-slate-900 dark:text-white">{row.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </Wrapper>
    );
};

export const BroadcastAnalyticsDetail: React.FC<{
    churchId: string;
    campaign: SmsCampaign;
    onBack: () => void;
    onOpenBroadcast?: () => void;
}> = ({ churchId, campaign, onBack, onOpenBroadcast }) => {
    const [usageCostUsd, setUsageCostUsd] = useState<number | null>(null);
    const [totalSegments, setTotalSegments] = useState<number | null>(null);
    const [loadingUsage, setLoadingUsage] = useState(true);

    useEffect(() => {
        let active = true;
        setLoadingUsage(true);
        getDocs(
            query(
                collection(firebaseDb, 'smsUsageRecords'),
                where('churchId', '==', churchId),
                orderBy('createdAt', 'desc'),
                limit(5000)
            )
        )
            .then(snap => {
                if (!active) return;
                const records = snap.docs
                    .map(d => d.data())
                    .filter(r => r.campaignId === campaign.id);
                if (records.length > 0) {
                    const cost = records.reduce(
                        (s, r) => s + (typeof r.customerChargeUsd === 'number' ? r.customerChargeUsd : (r.costUsd ?? 0) * 1.2),
                        0
                    );
                    const segs = records.reduce((s, r) => s + (r.segments ?? 1), 0);
                    setUsageCostUsd(cost);
                    setTotalSegments(segs);
                } else {
                    setUsageCostUsd(null);
                    setTotalSegments(null);
                }
            })
            .catch(e => {
                console.error('[BroadcastAnalyticsDetail] failed to load usage records', e);
            })
            .finally(() => {
                if (active) setLoadingUsage(false);
            });
        return () => { active = false; };
    }, [churchId, campaign.id]);

    const totalSent = campaign.recipientCount ?? 0;
    const delivered = campaign.deliveredCount ?? 0;
    const failed = campaign.failedCount ?? 0;
    const optOuts = campaign.optOutCount ?? 0;
    const deliveryRate = totalSent > 0 ? Math.round((delivered / totalSent) * 100) : 0;
    const failRate = totalSent > 0 ? Math.round((failed / totalSent) * 100) : 0;
    const optOutRate = totalSent > 0 ? Math.round((optOuts / totalSent) * 100) : 0;

    const audienceLabel = campaign.toGroupName
        ? `Group: ${campaign.toGroupName}`
        : campaign.toListName
            ? `List: ${campaign.toListName}`
            : campaign.toPhones?.length
                ? `${campaign.toPhones.length} phone number${campaign.toPhones.length !== 1 ? 's' : ''}`
                : 'Congregation';

    return (
        <div className="flex flex-col h-full">
            <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                    <button
                        onClick={onBack}
                        title="Back to Broadcasts"
                        className="p-1.5 rounded-xl text-slate-500 hover:text-slate-700 dark:hover:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
                    >
                        <ArrowLeft size={18} />
                    </button>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-slate-900 dark:text-white truncate">{campaign.name}</h2>
                            <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400 shrink-0">
                                Sent
                            </span>
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 truncate">
                            {campaign.sentAt
                                ? new Date(campaign.sentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                                : 'Sent'}
                            {' • '}
                            {audienceLabel}
                            {campaign.sentByName ? ` • Sent by ${campaign.sentByName}` : ''}
                        </p>
                    </div>
                </div>
                {onOpenBroadcast && (
                    <button
                        onClick={onOpenBroadcast}
                        className="px-3 py-1.5 text-xs font-semibold rounded-xl border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition shrink-0"
                    >
                        Open Broadcast
                    </button>
                )}
            </div>

            <div className="flex-1 overflow-y-auto">
                <ToolPage className="space-y-6">
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <StatCard
                            label="Total Recipients"
                            value={totalSent.toLocaleString()}
                            sub={audienceLabel}
                            icon={<Users size={18} />}
                            color="violet"
                        />
                        <StatCard
                            label="Delivered"
                            value={delivered.toLocaleString()}
                            sub={`${deliveryRate}% delivery rate`}
                            icon={<CheckCircle size={18} />}
                            color={deliveryRate >= 90 ? 'emerald' : deliveryRate >= 70 ? 'amber' : 'red'}
                            trend={deliveryRate >= 90 ? 'up' : deliveryRate < 70 ? 'down' : 'neutral'}
                        />
                        <StatCard
                            label="Failed"
                            value={failed.toLocaleString()}
                            sub={totalSent > 0 ? `${((failed / totalSent) * 100).toFixed(1)}% failure rate` : '0%'}
                            icon={<AlertTriangle size={18} />}
                            color={failed > 0 ? 'red' : 'slate'}
                        />
                        <StatCard
                            label="Opt-Outs"
                            value={optOuts.toLocaleString()}
                            sub={totalSent > 0 ? `${((optOuts / totalSent) * 100).toFixed(1)}% opt-out rate` : '0%'}
                            icon={<UserX size={18} />}
                            color={optOuts > 0 ? 'amber' : 'emerald'}
                        />
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-4">Delivery &amp; Compliance Health</p>
                            <div className="space-y-3">
                                {[
                                    {
                                        label: 'Delivery rate',
                                        pct: deliveryRate,
                                        color: deliveryRate >= 90 ? 'bg-emerald-500' : deliveryRate >= 70 ? 'bg-amber-400' : 'bg-red-500',
                                        note: totalSent > 0 ? `${deliveryRate}% (${delivered.toLocaleString()} of ${totalSent.toLocaleString()})` : 'No data',
                                    },
                                    {
                                        label: 'Opt-out rate',
                                        pct: optOutRate,
                                        color: 'bg-amber-400',
                                        note: totalSent > 0 ? `${((optOuts / totalSent) * 100).toFixed(1)}%` : 'No data',
                                    },
                                    {
                                        label: 'Failed rate',
                                        pct: failRate,
                                        color: 'bg-red-400',
                                        note: totalSent > 0 ? `${((failed / totalSent) * 100).toFixed(1)}%` : 'No data',
                                    },
                                ].map(row => (
                                    <div key={row.label}>
                                        <div className="flex justify-between text-xs mb-1">
                                            <span className="font-semibold text-slate-700 dark:text-slate-300">{row.label}</span>
                                            <span className="text-slate-400">{row.note}</span>
                                        </div>
                                        <MiniBar pct={row.pct} color={row.color} />
                                    </div>
                                ))}
                            </div>
                            <div className="mt-4 flex items-start gap-2 text-[10px] text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-2.5">
                                <AlertTriangle size={11} className="mt-0.5 shrink-0" />
                                <span>Carriers may filter messages if opt-out rates exceed 1% or delivery rates fall below 85%.</span>
                            </div>
                        </div>

                        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                            <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-4">Broadcast Details &amp; Usage</p>
                            <div className="space-y-3">
                                {[
                                    {
                                        label: 'Channel',
                                        value: campaign.channelType === 'email'
                                            ? 'Email'
                                            : (campaign.mediaUrls && campaign.mediaUrls.length > 0) ? 'MMS' : 'SMS',
                                    },
                                    {
                                        label: 'Sent at',
                                        value: campaign.sentAt
                                            ? new Date(campaign.sentAt).toLocaleString('en-US', { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
                                            : '—',
                                    },
                                    {
                                        label: 'Total segments',
                                        value: loadingUsage ? 'Loading...' : (totalSegments !== null ? totalSegments.toLocaleString() : '—'),
                                    },
                                    {
                                        label: 'Estimated cost',
                                        value: loadingUsage ? 'Loading...' : (usageCostUsd !== null ? `$${usageCostUsd.toFixed(4)}` : '—'),
                                    },
                                    {
                                        label: 'Cost per delivered msg',
                                        value: loadingUsage
                                            ? 'Loading...'
                                            : (usageCostUsd !== null && delivered > 0 ? `$${(usageCostUsd / delivered).toFixed(4)}` : '—'),
                                    },
                                ].map(row => (
                                    <div key={row.label} className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-slate-700 last:border-0">
                                        <span className="text-xs text-slate-500 dark:text-slate-400">{row.label}</span>
                                        <span className="text-sm font-bold text-slate-900 dark:text-white">{row.value}</span>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-5">
                        <p className="text-xs font-bold uppercase tracking-wide text-slate-400 mb-3">Message Content</p>
                        {campaign.channelType === 'email' && campaign.emailSubject && (
                            <p className="text-sm font-bold text-slate-900 dark:text-white mb-2">
                                Subject: {campaign.emailSubject}
                            </p>
                        )}
                        <div className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-wrap bg-slate-50 dark:bg-slate-900/50 rounded-xl p-4 border border-slate-100 dark:border-slate-700/60">
                            {campaign.body || 'No message content'}
                        </div>
                        {campaign.mediaUrls && campaign.mediaUrls.length > 0 && (
                            <p className="text-xs text-slate-400 mt-2">
                                {campaign.mediaUrls.length} media attachment{campaign.mediaUrls.length !== 1 ? 's' : ''}
                            </p>
                        )}
                    </div>
                </ToolPage>
            </div>
        </div>
    );
};
