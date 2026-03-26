import React from 'react';
import { User } from '../types';
import { ALL_WIDGETS } from '../constants/widgetRegistry';

interface WelcomeLayoutModalProps {
    user: User;
    suggestedLayout: Record<string, string[]>;
    isLoading: boolean;
    onAccept: (layout: Record<string, string[]>) => void;
    onCustomize: (layout: Record<string, string[]>) => void;
}

// Human-friendly view labels
const VIEW_LABELS: Record<string, string> = {
    dashboard: 'Dashboard',
    people: 'People Overview',
    people_households: 'Households',
    people_risk: 'Risk',
    groups: 'Groups',
    services_overview: 'Services',
    services_attendance: 'Attendance',
    services_teams: 'Teams',
    giving_overview: 'Giving',
    giving_donors: 'Donors',
    pastoral_church: 'Church Health',
    pastoral_membership: 'Membership',
    pastoral_community: 'Community',
    pastoral_care: 'Pastoral Care',
};

// Role → friendly description
const ROLE_DESCRIPTIONS: Record<string, string> = {
    'Church Admin': 'church-wide leadership',
    'Pastor': 'pastoral oversight',
    'Pastor AI': 'AI-powered ministry intelligence',
    'People': 'people management',
    'Services': 'service planning & teams',
    'Groups': 'small group health',
    'Giving': 'stewardship & finances',
    'Finance': 'financial oversight',
    'Pastoral Care': 'member care & prayer',
    'Metrics': 'ministry metrics',
    'System Administration': 'platform administration',
};

const getRoleDescription = (roles: string[]): string => {
    const descs = roles.map(r => ROLE_DESCRIPTIONS[r]).filter(Boolean);
    if (descs.length === 0) return 'your role';
    if (descs.length === 1) return descs[0];
    return descs.slice(0, -1).join(', ') + ' & ' + descs[descs.length - 1];
};

const getWidgetLabel = (viewKey: string, widgetId: string): string => {
    const widgets = ALL_WIDGETS[viewKey] || [];
    return widgets.find(w => w.id === widgetId)?.label || widgetId;
};

// Prioritized views to show in the preview (skip empty/trivial views)
const PREVIEW_VIEWS = ['dashboard', 'giving_overview', 'services_overview', 'people', 'groups', 'pastoral_care'];

const WelcomeLayoutModal: React.FC<WelcomeLayoutModalProps> = ({
    user,
    suggestedLayout,
    isLoading,
    onAccept,
    onCustomize,
}) => {
    const roleDesc = getRoleDescription(user.roles);

    return (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm" />

            {/* Modal */}
            <div className="relative w-full max-w-lg bg-white dark:bg-slate-900 rounded-3xl shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-300">

                {/* Header gradient bar */}
                <div className="h-1.5 w-full bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500" />

                {/* Body */}
                <div className="p-8">
                    {/* Icon + Title */}
                    <div className="flex items-start gap-4 mb-6">
                        <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-2xl shadow-lg flex-shrink-0">
                            ✨
                        </div>
                        <div>
                            <h2 className="text-xl font-black text-slate-900 dark:text-white tracking-tight">
                                Welcome, {user.name.split(' ')[0]}!
                            </h2>
                            <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                We've customized your layout for <span className="font-semibold text-indigo-600 dark:text-indigo-400">{roleDesc}</span>.
                            </p>
                        </div>
                    </div>

                    {/* Layout Preview */}
                    {isLoading ? (
                        <div className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-6 flex flex-col items-center justify-center gap-3 min-h-[160px]">
                            <div className="w-8 h-8 border-4 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                            <p className="text-sm font-semibold text-slate-400 dark:text-slate-500">
                                AI is personalizing your layout…
                            </p>
                        </div>
                    ) : (
                        <div className="bg-slate-50 dark:bg-slate-800/60 rounded-2xl p-4 space-y-3 max-h-60 overflow-y-auto custom-scrollbar mb-6">
                            <p className="text-[10px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-2">
                                Your suggested widgets
                            </p>
                            {PREVIEW_VIEWS.map(viewKey => {
                                const widgetIds = suggestedLayout[viewKey];
                                if (!widgetIds || widgetIds.length === 0) return null;
                                return (
                                    <div key={viewKey}>
                                        <p className="text-[10px] font-black uppercase tracking-wider text-indigo-500 dark:text-indigo-400 mb-1">
                                            {VIEW_LABELS[viewKey] || viewKey}
                                        </p>
                                        <div className="flex flex-wrap gap-1.5">
                                            {widgetIds.map(id => (
                                                <span
                                                    key={id}
                                                    className="px-2 py-0.5 rounded-full bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-[11px] font-semibold text-slate-600 dark:text-slate-300"
                                                >
                                                    {getWidgetLabel(viewKey, id)}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button
                            onClick={() => onAccept(suggestedLayout)}
                            disabled={isLoading}
                            className="flex-1 py-3 px-6 rounded-2xl bg-gradient-to-r from-indigo-600 to-purple-600 text-white text-sm font-black tracking-wide shadow-lg hover:shadow-indigo-500/30 hover:scale-[1.02] transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            {isLoading ? 'Generating…' : '✓ Use This Layout'}
                        </button>
                        <button
                            onClick={() => onCustomize(suggestedLayout)}
                            disabled={isLoading}
                            className="flex-1 py-3 px-6 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-black tracking-wide hover:border-indigo-300 dark:hover:border-indigo-500 hover:text-indigo-600 dark:hover:text-indigo-400 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                            ⚙️ Customize
                        </button>
                    </div>

                    <p className="text-center text-[11px] text-slate-400 dark:text-slate-500 mt-4">
                        You can always change your layout later using the <strong>Customize Layout</strong> button on any view.
                    </p>
                </div>
            </div>
        </div>
    );
};

export default WelcomeLayoutModal;
