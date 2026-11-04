import React, { useState, useMemo } from 'react';
import {
    ChatWidgetAttachment,
    ChatWidgetItemClaim,
    ChatWidgetSnapshotItem,
    User,
} from '../../types';
import { canReadArea, DashboardArea } from '../../services/permissionService';
import { useTenantData } from '../../contexts/TenantDataContext';
import { buildChatWidgetAttachment } from '../../services/chatWidgetService';
import {
    Lock,
    Pin,
    Sparkles,
    ChevronDown,
    ChevronUp,
    UserCheck,
    Hand,
    ExternalLink,
    RefreshCw,
    Camera,
} from 'lucide-react';

interface ChatWidgetCardProps {
    widget: ChatWidgetAttachment;
    currentUser: User;
    messageId?: string;
    onClaimItem?: (item: ChatWidgetSnapshotItem, existingClaim?: ChatWidgetItemClaim) => void;
    onPinWidget?: (widget: ChatWidgetAttachment) => void;
    onAskPastorAiAboutWidget?: (widget: ChatWidgetAttachment) => void;
    isPinnedView?: boolean;
    compact?: boolean;
}

const TONE_CLASSES: Record<string, string> = {
    emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-800/60',
    amber: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/50 dark:text-amber-300 dark:border-amber-800/60',
    rose: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/50 dark:text-rose-300 dark:border-rose-800/60',
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-950/50 dark:text-indigo-300 dark:border-indigo-800/60',
    slate: 'bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:border-slate-700',
};

export const ChatWidgetCard: React.FC<ChatWidgetCardProps> = ({
    widget,
    currentUser,
    onClaimItem,
    onPinWidget,
    onAskPastorAiAboutWidget,
    isPinnedView = false,
    compact = false,
}) => {
    const [mode, setMode] = useState<'snapshot' | 'live'>('snapshot');
    const [expanded, setExpanded] = useState(false);

    const tenantData = useTenantData();

    const hasAccess = useMemo(() => {
        return canReadArea(currentUser, (widget.area || 'people') as DashboardArea);
    }, [currentUser, widget.area]);

    const liveWidget = useMemo(() => {
        if (mode !== 'live' || !hasAccess) return null;
        try {
            return buildChatWidgetAttachment(widget.widgetId || widget.title, {
                church: tenantData.church,
                people: tenantData.people,
                donations: tenantData.donations,
                funds: tenantData.funds,
                groups: tenantData.groups,
                teams: tenantData.teams,
                servicesData: tenantData.servicesData,
                pastoralNotes: tenantData.pastoralNotes,
                prayerRequests: tenantData.prayerRequests,
                campusId: tenantData.selectedCampusId,
            });
        } catch (e) {
            return null;
        }
    }, [mode, hasAccess, widget.widgetId, widget.title, tenantData]);

    const activeSnapshot = (mode === 'live' && liveWidget?.snapshot) ? liveWidget.snapshot : widget.snapshot;
    const items = activeSnapshot?.items || [];
    const claims = widget.claims || {};

    const claimedCount = useMemo(() => {
        return Object.keys(claims).length;
    }, [claims]);

    // ── Permission Redacted View ────────────────────────────────────────────
    if (!hasAccess) {
        return (
            <div className="my-2 rounded-2xl border border-amber-200 dark:border-amber-900/50 bg-amber-50/60 dark:bg-amber-950/20 p-4 flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
                    <Lock size={18} />
                </div>
                <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-amber-200/70 dark:bg-amber-900/60 text-amber-800 dark:text-amber-300">
                            Protected {widget.area} Widget
                        </span>
                    </div>
                    <p className="text-xs font-bold text-slate-800 dark:text-slate-200 mt-1 truncate">
                        {widget.title}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        Requires <strong className="capitalize">{widget.area}</strong> or <strong>Pastor</strong> role permissions to view individual donor/member records.
                    </p>
                </div>
            </div>
        );
    }

    const visibleItems = expanded ? items : items.slice(0, compact ? 3 : 5);

    const handleOpenProfile = (id: string) => {
        if (!id || id.startsWith('fund_')) return;
        window.dispatchEvent(new CustomEvent('openPersonProfile', { detail: id }));
    };

    return (
        <div className="my-2 rounded-2xl border border-indigo-100 dark:border-slate-700/80 bg-white dark:bg-slate-900 shadow-sm overflow-hidden transition-all">
            {/* Top Accent Header */}
            <div className="px-4 py-3 bg-gradient-to-r from-indigo-50/80 via-white to-violet-50/60 dark:from-slate-800/90 dark:via-slate-900 dark:to-indigo-950/30 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-300 flex items-center justify-center text-base shrink-0">
                        {widget.icon || '📊'}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                                {widget.area} Widget
                            </span>
                            {claimedCount > 0 && (
                                <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300">
                                    ✓ {claimedCount} Claimed
                                </span>
                            )}
                        </div>
                        <h4 className="text-xs font-black text-slate-900 dark:text-white truncate">
                            {widget.title}
                        </h4>
                    </div>
                </div>

                {/* Controls: Snapshot vs Live, Ask @PastorAI, Pin */}
                <div className="flex items-center gap-1.5 shrink-0">
                    <div className="inline-flex rounded-lg bg-slate-100 dark:bg-slate-800 p-0.5 border border-slate-200/70 dark:border-slate-700">
                        <button
                            type="button"
                            onClick={() => setMode('snapshot')}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition ${
                                mode === 'snapshot'
                                    ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-xs'
                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                            }`}
                            title="Point-in-time snapshot when shared"
                        >
                            <Camera size={10} />
                            Snapshot
                        </button>
                        <button
                            type="button"
                            onClick={() => setMode('live')}
                            className={`flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-bold transition ${
                                mode === 'live'
                                    ? 'bg-indigo-600 text-white shadow-xs'
                                    : 'text-slate-500 hover:text-slate-700 dark:text-slate-400'
                            }`}
                            title="View live current data"
                        >
                            <RefreshCw size={10} />
                            Live
                        </button>
                    </div>

                    {onAskPastorAiAboutWidget && (
                        <button
                            type="button"
                            onClick={() => onAskPastorAiAboutWidget(widget)}
                            className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-violet-50 hover:bg-violet-100 text-violet-700 dark:bg-violet-950/60 dark:hover:bg-violet-900/60 dark:text-violet-300 border border-violet-200/70 dark:border-violet-800/60 transition"
                            title="Ask @PastorAI to analyze this widget or draft outreach"
                        >
                            <Sparkles size={11} />
                            <span className="hidden sm:inline">@PastorAI</span>
                        </button>
                    )}

                    {onPinWidget && !isPinnedView && (
                        <button
                            type="button"
                            onClick={() => onPinWidget(widget)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 dark:hover:bg-slate-800 transition"
                            title="Pin widget to channel"
                        >
                            <Pin size={12} />
                        </button>
                    )}
                </div>
            </div>

            {/* Body */}
            <div className="p-4 space-y-3">
                {/* Headline */}
                {activeSnapshot?.headlineValue && (
                    <div>
                        <p className="text-sm font-black text-slate-900 dark:text-white tracking-tight">
                            {activeSnapshot.headlineValue}
                        </p>
                        {activeSnapshot.subtitle && (
                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                {activeSnapshot.subtitle}
                            </p>
                        )}
                    </div>
                )}

                {/* Summary KPI Pills */}
                {activeSnapshot?.summaryMetrics && activeSnapshot.summaryMetrics.length > 0 && (
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        {activeSnapshot.summaryMetrics.map((m, idx) => (
                            <div
                                key={idx}
                                className={`px-3 py-2 rounded-xl border ${TONE_CLASSES[m.tone || 'slate']}`}
                            >
                                <span className="block text-[9px] font-bold uppercase tracking-wider opacity-75">
                                    {m.label}
                                </span>
                                <span className="text-sm font-black tabular-nums">
                                    {m.value}
                                </span>
                            </div>
                        ))}
                    </div>
                )}

                {/* Interactive List Rows with "Claim & Care" (Idea 1) */}
                {visibleItems.length > 0 && (
                    <div className="space-y-1.5 pt-1">
                        {visibleItems.map((item) => {
                            const claim = claims[item.id];
                            const isClaimedByMe = claim?.claimedByUserId === currentUser.id;
                            const isPersonRow = !item.id.startsWith('fund_') && widget.area !== 'groups' && widget.area !== 'services';

                            return (
                                <div
                                    key={item.id}
                                    className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border transition ${
                                        claim
                                            ? 'bg-emerald-50/40 dark:bg-emerald-950/20 border-emerald-200/70 dark:border-emerald-900/50'
                                            : 'bg-slate-50/80 dark:bg-slate-800/60 border-slate-100 dark:border-slate-800 hover:bg-white dark:hover:bg-slate-800'
                                    }`}
                                >
                                    <div className="flex items-center gap-2.5 min-w-0 flex-1">
                                        {/* Avatar */}
                                        <button
                                            type="button"
                                            onClick={() => isPersonRow && handleOpenProfile(item.id)}
                                            disabled={!isPersonRow}
                                            className={`w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-[11px] font-black shrink-0 overflow-hidden ${
                                                isPersonRow ? 'cursor-pointer hover:ring-2 hover:ring-indigo-500' : 'cursor-default'
                                            }`}
                                        >
                                            {item.avatar ? (
                                                <img src={item.avatar} alt={item.name} className="w-full h-full object-cover" />
                                            ) : (
                                                (item.name || '?').charAt(0)
                                            )}
                                        </button>

                                        <div className="min-w-0 flex-1">
                                            <div className="flex items-center gap-1.5">
                                                {isPersonRow ? (
                                                    <button
                                                        type="button"
                                                        onClick={() => handleOpenProfile(item.id)}
                                                        className="text-xs font-bold text-slate-900 dark:text-slate-100 hover:text-indigo-600 dark:hover:text-indigo-400 truncate flex items-center gap-1 group/name"
                                                        title="Click to open full profile drawer"
                                                    >
                                                        <span className="truncate">{item.name}</span>
                                                        <ExternalLink size={10} className="opacity-0 group-hover/name:opacity-100 shrink-0 text-indigo-500 transition-opacity" />
                                                    </button>
                                                ) : (
                                                    <span className="text-xs font-bold text-slate-900 dark:text-slate-100 truncate">
                                                        {item.name}
                                                    </span>
                                                )}

                                                {item.riskCategory && (
                                                    <span
                                                        className={`w-2 h-2 rounded-full shrink-0 ${
                                                            item.riskCategory === 'Healthy'
                                                                ? 'bg-emerald-500'
                                                                : item.riskCategory === 'At Risk'
                                                                ? 'bg-amber-500'
                                                                : 'bg-rose-500'
                                                        }`}
                                                        title={`Risk Status: ${item.riskCategory}`}
                                                    />
                                                )}
                                            </div>
                                            <div className="flex items-center gap-2 text-[10px] text-slate-500 dark:text-slate-400 truncate">
                                                <span className="font-bold text-slate-700 dark:text-slate-300">{item.primaryStat}</span>
                                                {item.secondaryStat && (
                                                    <>
                                                        <span>•</span>
                                                        <span className="truncate">{item.secondaryStat}</span>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>

                                    {/* Right: Claim & Care Action Button (Idea 1) */}
                                    {onClaimItem && (
                                        <div className="shrink-0">
                                            {claim ? (
                                                <button
                                                    type="button"
                                                    onClick={() => onClaimItem(item, claim)}
                                                    title={
                                                        isClaimedByMe
                                                            ? 'Click to unclaim this follow-up'
                                                            : `Claimed by ${claim.claimedByUserName}`
                                                    }
                                                    className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold border transition ${
                                                        isClaimedByMe
                                                            ? 'bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700'
                                                            : 'bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-800 dark:text-emerald-300 border-emerald-300 dark:border-emerald-800'
                                                    }`}
                                                >
                                                    <UserCheck size={11} />
                                                    <span className="max-w-[95px] truncate">
                                                        {isClaimedByMe ? 'Claimed by You' : claim.claimedByUserName.split(' ')[0]}
                                                    </span>
                                                </button>
                                            ) : (
                                                <button
                                                    type="button"
                                                    onClick={() => onClaimItem(item, undefined)}
                                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-bold bg-white dark:bg-slate-800 hover:bg-indigo-600 hover:text-white dark:hover:bg-indigo-600 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:border-indigo-600 transition shadow-2xs"
                                                    title="Claim this follow-up so your team knows you're reaching out"
                                                >
                                                    <Hand size={11} />
                                                    <span>Claim</span>
                                                </button>
                                            )}
                                        </div>
                                    )}
                                </div>
                            );
                        })}

                        {/* Expand / Collapse toggle if more items exist */}
                        {items.length > (compact ? 3 : 5) && (
                            <button
                                type="button"
                                onClick={() => setExpanded(!expanded)}
                                className="w-full py-1.5 text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50/60 dark:hover:bg-slate-800/60 rounded-xl flex items-center justify-center gap-1 transition"
                            >
                                {expanded ? (
                                    <>
                                        <ChevronUp size={13} />
                                        <span>Show Fewer</span>
                                    </>
                                ) : (
                                    <>
                                        <ChevronDown size={13} />
                                        <span>Show All {items.length} Records</span>
                                    </>
                                )}
                            </button>
                        )}
                    </div>
                )}

                {/* Footer timestamp */}
                <div className="pt-1 flex items-center justify-between text-[10px] text-slate-400 dark:text-slate-500 border-t border-slate-100 dark:border-slate-800/80">
                    <span>
                        {mode === 'live'
                            ? '⚡ Showing live real-time church data'
                            : `📸 Snapshot captured ${new Date(widget.snapshot?.capturedAt || Date.now()).toLocaleString([], {
                                  month: 'short',
                                  day: 'numeric',
                                  hour: 'numeric',
                                  minute: '2-digit',
                              })}`}
                    </span>
                    {items.length > 0 && (
                        <span>
                            {claimedCount}/{items.length} claimed
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
