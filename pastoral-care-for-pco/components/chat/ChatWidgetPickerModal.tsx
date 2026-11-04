import React, { useState, useMemo } from 'react';
import {
    TeamChannel,
    TeamChatArea,
    User,
    WidgetDefinition,
} from '../../types';
import {
    GIVING_WIDGETS,
    PEOPLE_OVERVIEW_WIDGETS,
    PEOPLE_RISK_WIDGETS,
    PASTORAL_CARE_WIDGETS,
    GROUPS_WIDGETS,
    SERVICES_OVERVIEW_WIDGETS,
} from '../../constants/widgetRegistry';
import { canReadArea, DashboardArea } from '../../services/permissionService';
import { Search, X, Lock, CheckCircle2, Sparkles } from 'lucide-react';

interface ChatWidgetPickerModalProps {
    isOpen: boolean;
    onClose: () => void;
    currentUser: User;
    activeChannel?: TeamChannel | null;
    allUsers: User[];
    onSelectWidget: (widgetId: string, area: TeamChatArea, switchToRoleChannelArea?: TeamChatArea) => void;
}

const FEATURED_WIDGET_IDS = new Set([
    'lifecycleLapsed',
    'lapsed_at_risk',
    'topGivers',
    'keyMetrics',
    'giving_consistency',
    'lifecycleNew',
    'atRiskList',
    'care_recommended_followups',
    'prayer_requests',
    'struggling_teams',
    'groups_action_center',
    'birthdays',
]);

export const ChatWidgetPickerModal: React.FC<ChatWidgetPickerModalProps> = ({
    isOpen,
    onClose,
    currentUser,
    activeChannel,
    allUsers,
    onSelectWidget,
}) => {
    const [search, setSearch] = useState('');
    const [selectedCategory, setSelectedCategory] = useState<'featured' | TeamChatArea>('featured');

    const categories = useMemo(() => {
        const list: Array<{ id: 'featured' | TeamChatArea; label: string; icon: string; widgets: Array<WidgetDefinition & { area: TeamChatArea }> }> = [];

        const givingAllowed = canReadArea(currentUser, 'giving');
        const peopleAllowed = canReadArea(currentUser, 'people');
        const careAllowed = canReadArea(currentUser, 'care');
        const groupsAllowed = canReadArea(currentUser, 'groups');
        const servicesAllowed = canReadArea(currentUser, 'services');

        const allAvailable: Array<WidgetDefinition & { area: TeamChatArea }> = [];

        if (givingAllowed) {
            const w = GIVING_WIDGETS.map(item => ({ ...item, area: 'giving' as TeamChatArea }));
            allAvailable.push(...w);
            list.push({ id: 'giving', label: 'Giving & Donors', icon: '💰', widgets: w });
        }
        if (peopleAllowed) {
            const merged = [...PEOPLE_RISK_WIDGETS, ...PEOPLE_OVERVIEW_WIDGETS];
            const seen = new Set<string>();
            const w = merged
                .filter(item => {
                    if (seen.has(item.id)) return false;
                    seen.add(item.id);
                    return true;
                })
                .map(item => ({ ...item, area: 'people' as TeamChatArea }));
            allAvailable.push(...w);
            list.push({ id: 'people', label: 'People & Risk', icon: '👥', widgets: w });
        }
        if (careAllowed) {
            const w = PASTORAL_CARE_WIDGETS.map(item => ({ ...item, area: 'care' as TeamChatArea }));
            allAvailable.push(...w);
            list.push({ id: 'care', label: 'Pastoral Care', icon: '🕊️', widgets: w });
        }
        if (groupsAllowed) {
            const w = GROUPS_WIDGETS.map(item => ({ ...item, area: 'groups' as TeamChatArea }));
            allAvailable.push(...w);
            list.push({ id: 'groups', label: 'Small Groups', icon: '📂', widgets: w });
        }
        if (servicesAllowed) {
            const w = SERVICES_OVERVIEW_WIDGETS.map(item => ({ ...item, area: 'services' as TeamChatArea }));
            allAvailable.push(...w);
            list.push({ id: 'services', label: 'Services & Teams', icon: '🎵', widgets: w });
        }

        const featured = allAvailable.filter(w => FEATURED_WIDGET_IDS.has(w.id));
        return [
            { id: 'featured' as const, label: 'Recommended for Chat', icon: '✨', widgets: featured },
            ...list,
        ];
    }, [currentUser]);

    const visibleWidgets = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (q) {
            const all = categories
                .filter(c => c.id !== 'featured')
                .flatMap(c => c.widgets);
            return all.filter(
                w =>
                    w.label.toLowerCase().includes(q) ||
                    (w.description || '').toLowerCase().includes(q) ||
                    w.id.toLowerCase().includes(q)
            );
        }
        const cat = categories.find(c => c.id === selectedCategory) || categories[0];
        return cat ? cat.widgets : [];
    }, [categories, selectedCategory, search]);

    // Check if the current active channel has members without access to a sensitive area
    const checkChannelCompatibility = (area: TeamChatArea): { allHaveAccess: boolean; restrictedCount: number } => {
        if (!activeChannel) return { allHaveAccess: true, restrictedCount: 0 };
        if (activeChannel.requiredArea === area) return { allHaveAccess: true, restrictedCount: 0 };

        const channelUsers =
            activeChannel.participantIds && activeChannel.participantIds.length > 0
                ? allUsers.filter(u => activeChannel.participantIds.includes(u.id))
                : allUsers;

        const unauthorized = channelUsers.filter(u => !canReadArea(u, area as DashboardArea));
        return {
            allHaveAccess: unauthorized.length === 0,
            restrictedCount: unauthorized.length,
        };
    };

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs animate-in fade-in duration-150">
            <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-3xl shadow-2xl w-full max-w-2xl max-h-[82vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-indigo-600/10 dark:bg-indigo-500/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h3 className="text-base font-black text-slate-900 dark:text-white tracking-tight">
                                Add Interactive Widget to Chat
                            </h3>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Share live metrics, Lapsed Donors, or At-Risk lists with 1-click follow-up claiming
                            </p>
                        </div>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        className="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 hover:text-rose-500 flex items-center justify-center transition"
                    >
                        <X size={16} />
                    </button>
                </div>

                {/* Search + Category Pills */}
                <div className="px-6 pt-4 pb-3 border-b border-slate-100 dark:border-slate-800 space-y-3">
                    <div className="relative">
                        <Search size={15} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
                        <input
                            type="text"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            placeholder="Search widgets (e.g., Lapsed Donors, At Risk, Top Donors, Prayer Requests)..."
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold text-slate-900 dark:text-white placeholder-slate-400 outline-none focus:ring-2 focus:ring-indigo-500"
                            autoFocus
                        />
                    </div>

                    {!search && (
                        <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-1">
                            {categories.map(cat => (
                                <button
                                    key={cat.id}
                                    type="button"
                                    onClick={() => setSelectedCategory(cat.id)}
                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold shrink-0 transition ${
                                        selectedCategory === cat.id
                                            ? 'bg-indigo-600 text-white shadow-xs'
                                            : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    <span>{cat.icon}</span>
                                    <span>{cat.label}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>

                {/* Widget Grid */}
                <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {visibleWidgets.map(w => {
                        const compat = checkChannelCompatibility(w.area);
                        const isSensitive = w.area === 'giving' || w.area === 'care';

                        return (
                            <div
                                key={`${w.area}_${w.id}`}
                                className="flex flex-col justify-between p-4 rounded-2xl border border-slate-200 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/40 hover:border-indigo-400 dark:hover:border-indigo-500 hover:bg-white dark:hover:bg-slate-800 transition group"
                            >
                                <div>
                                    <div className="flex items-start justify-between gap-2">
                                        <div className="flex items-center gap-2.5">
                                            <span className="w-9 h-9 rounded-xl bg-white dark:bg-slate-700 shadow-2xs border border-slate-100 dark:border-slate-600 flex items-center justify-center text-lg">
                                                {w.icon}
                                            </span>
                                            <div>
                                                <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                                                    {w.area}
                                                </span>
                                                <h4 className="text-xs font-black text-slate-900 dark:text-white">
                                                    {w.label}
                                                </h4>
                                            </div>
                                        </div>
                                    </div>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">
                                        {w.description || `Interactive ${w.label} card for team chat.`}
                                    </p>
                                </div>

                                <div className="mt-4 pt-3 border-t border-slate-200/60 dark:border-slate-700/60 flex items-center justify-between gap-2">
                                    {isSensitive && !compat.allHaveAccess ? (
                                        <button
                                            type="button"
                                            onClick={() => {
                                                onSelectWidget(w.id, w.area, w.area);
                                                onClose();
                                            }}
                                            className="flex items-center gap-1 text-[10px] font-bold text-amber-700 dark:text-amber-300 bg-amber-100/80 dark:bg-amber-950/60 hover:bg-amber-200 px-2.5 py-1.5 rounded-lg transition"
                                            title="Switch to the role-gated channel where only authorized staff can view this widget"
                                        >
                                            <Lock size={11} />
                                            <span>Share in #{w.area === 'giving' ? 'giving-and-finance' : 'pastoral-care'}</span>
                                        </button>
                                    ) : (
                                        <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600 dark:text-emerald-400">
                                            <CheckCircle2 size={11} />
                                            <span>Channel authorized</span>
                                        </span>
                                    )}

                                    <button
                                        type="button"
                                        onClick={() => {
                                            onSelectWidget(w.id, w.area);
                                            onClose();
                                        }}
                                        className="px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-[11px] font-bold transition shadow-xs"
                                    >
                                        Attach Here
                                    </button>
                                </div>
                            </div>
                        );
                    })}

                    {visibleWidgets.length === 0 && (
                        <div className="col-span-full py-12 text-center text-slate-400 text-xs font-bold">
                            No matching widgets found for your search.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
