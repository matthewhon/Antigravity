import React, { useMemo, useState, useEffect } from 'react';
import { PeopleDashboardData, PcoGroup, GivingAnalytics, SmsConversation, SmsTag, LifecycleDonor, CareFollowUpLog } from '../types';
import { WidgetWrapper } from './SharedUI';
import { MessageSquare, Check, X, RotateCcw, Mail, Phone, User } from 'lucide-react';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SignalType = 'prayer' | 'birthday' | 'anniversary' | 'lapsed' | 'inactive' | 'group_absence';
type FilterType = 'all' | SignalType;
type Priority = 'high' | 'medium_high' | 'medium';

interface FollowUpItem {
    personId: string;
    personName: string;
    personAvatar?: string | null;
    signal: SignalType;
    priority: Priority;
    badgeLabel: string;
    detail: string;
    memberStatus?: string | null;
    email?: string | null;
    phone?: string | null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function daysUntilAnnual(dateStr?: string | null): number | null {
    if (!dateStr) return null;
    const parts = dateStr.split('-');
    if (parts.length < 2) return null;
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2] || '1', 10);
    const today = new Date();
    const thisYear = today.getFullYear();
    let next = new Date(thisYear, month, day);
    if (next < today) next = new Date(thisYear + 1, month, day);
    return Math.floor((next.getTime() - today.getTime()) / 86400000);
}

function formatMonthDay(dateStr?: string | null): string {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length < 2) return '';
    const month = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2] || '1', 10);
    return new Date(2000, month, day).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

// ---------------------------------------------------------------------------
// Signal configs
// ---------------------------------------------------------------------------

const SIGNAL_META: Record<SignalType, {
    label: string;
    emoji: string;
    badgeBg: string;
    badgeText: string;
}> = {
    prayer:        { label: 'Needs Prayer',   emoji: '🙏', badgeBg: 'bg-violet-100 dark:bg-violet-950/40', badgeText: 'text-violet-700 dark:text-violet-300' },
    inactive:      { label: 'Inactive Donor', emoji: '🚨', badgeBg: 'bg-rose-100 dark:bg-rose-950/40',    badgeText: 'text-rose-700 dark:text-rose-400'   },
    group_absence: { label: 'Group Absence',  emoji: '👥', badgeBg: 'bg-amber-100 dark:bg-amber-950/40',  badgeText: 'text-amber-700 dark:text-amber-400' },
    lapsed:        { label: 'Lapsed Donor',   emoji: '📉', badgeBg: 'bg-orange-100 dark:bg-orange-950/40',badgeText: 'text-orange-700 dark:text-orange-400'},
    birthday:      { label: 'Birthday',       emoji: '🎂', badgeBg: 'bg-pink-100 dark:bg-pink-950/40',    badgeText: 'text-pink-700 dark:text-pink-400'   },
    anniversary:   { label: 'Anniversary',    emoji: '💍', badgeBg: 'bg-indigo-100 dark:bg-indigo-950/40',badgeText: 'text-indigo-700 dark:text-indigo-400'},
};

const PRIORITY_ORDER: Record<Priority, number> = { high: 0, medium_high: 1, medium: 2 };

const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'all',          label: 'All' },
    { key: 'prayer',       label: '🙏 Prayer' },
    { key: 'inactive',     label: '🚨 Inactive Donor' },
    { key: 'group_absence',label: '👥 Group Absence' },
    { key: 'lapsed',       label: '📉 Lapsed Donor' },
    { key: 'birthday',     label: '🎂 Birthday' },
    { key: 'anniversary',  label: '💍 Anniversary' },
];

// ---------------------------------------------------------------------------
// Row component (module-level to avoid TypeScript 'key' prop issues)
// ---------------------------------------------------------------------------

interface FollowUpRowProps {
    item: FollowUpItem;
    isDone: boolean;
    onMarkFollowedUp: (personId: string) => void;
    onDismiss: (personId: string, signal: SignalType) => void;
}

const FollowUpRow: React.FC<FollowUpRowProps> = ({ item, isDone, onMarkFollowedUp, onDismiss }) => {
    const meta = SIGNAL_META[item.signal];

    const handlePersonClick = (personId: string) => {
        window.dispatchEvent(new CustomEvent('openPersonProfile', { detail: personId }));
    };

    return (
        <div
            onClick={() => !isDone && handlePersonClick(item.personId)}
            className={`group flex items-center gap-3 p-3 rounded-2xl border transition-all ${
                isDone
                    ? 'border-slate-100 dark:border-slate-800/60 bg-slate-50/50 dark:bg-slate-900/20 opacity-60'
                    : 'border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-sm cursor-pointer'
            }`}
        >
            {/* Avatar */}
            <div className="flex-shrink-0">
                {item.personAvatar ? (
                    <img
                        src={item.personAvatar}
                        alt={item.personName}
                        width="36" height="36"
                        loading="lazy"
                        className={`w-9 h-9 rounded-full object-cover bg-slate-200 ${!isDone ? 'group-hover:ring-2 group-hover:ring-indigo-400' : ''} transition-all`}
                    />
                ) : (
                    <div className={`w-9 h-9 rounded-full flex items-center justify-center font-bold text-xs uppercase flex-shrink-0 transition-all ${
                        isDone
                            ? 'bg-slate-100 dark:bg-slate-800 text-slate-400'
                            : 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 group-hover:ring-2 group-hover:ring-indigo-400'
                    }`}>
                        {item.personName.substring(0, 2)}
                    </div>
                )}
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                    <p className={`text-sm font-bold truncate transition-colors ${
                        isDone
                            ? 'text-slate-400 dark:text-slate-500 line-through'
                            : 'text-slate-900 dark:text-white group-hover:text-indigo-600 dark:group-hover:text-indigo-400'
                    }`}>
                        {item.personName}
                    </p>
                    {isDone ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold uppercase tracking-wide bg-emerald-100 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 whitespace-nowrap">
                            <Check size={8} strokeWidth={3} /> Followed Up
                        </span>
                    ) : (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-black uppercase tracking-wide whitespace-nowrap ${meta.badgeBg} ${meta.badgeText}`}>
                            {meta.emoji} {meta.label}
                        </span>
                    )}
                </div>
                <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5 truncate">
                    {item.detail}
                </p>
                {/* Member status / contact chips */}
                {(item.memberStatus || item.email || item.phone) && (
                    <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                        {item.memberStatus && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                <User size={8} strokeWidth={2.5} />
                                {item.memberStatus}
                            </span>
                        )}
                        {item.email && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 truncate max-w-[140px]">
                                <Mail size={8} strokeWidth={2} className="flex-shrink-0" />
                                <span className="truncate">{item.email}</span>
                            </span>
                        )}
                        {item.phone && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[11px] font-medium bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 whitespace-nowrap">
                                <Phone size={8} strokeWidth={2} />
                                {item.phone}
                            </span>
                        )}
                    </div>
                )}
            </div>

            {/* Actions */}
            {!isDone ? (
                <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all">
                    <button
                        onClick={e => { e.stopPropagation(); handlePersonClick(item.personId); }}
                        title="Open profile & send message"
                        className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                    >
                        <MessageSquare size={12} />
                    </button>
                    <button
                        onClick={e => { e.stopPropagation(); onMarkFollowedUp(item.personId); }}
                        title="Mark as followed up"
                        className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-emerald-500 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                    >
                        <Check size={12} strokeWidth={2.5} />
                    </button>
                    <button
                        onClick={e => { e.stopPropagation(); onDismiss(item.personId, item.signal); }}
                        title="Dismiss from list"
                        className="w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-rose-500 text-slate-400 hover:text-white flex items-center justify-center transition-all"
                    >
                        <X size={12} strokeWidth={2.5} />
                    </button>
                </div>
            ) : (
                <button
                    onClick={e => { e.stopPropagation(); onMarkFollowedUp(item.personId); }}
                    title="Un-mark as followed up"
                    className="flex-shrink-0 w-7 h-7 rounded-lg bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-300 dark:text-slate-600 hover:text-slate-500 dark:hover:text-slate-400 flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                >
                    <RotateCcw size={11} />
                </button>
            )}
        </div>
    );
};

// ---------------------------------------------------------------------------
// Main widget
// ---------------------------------------------------------------------------

interface RecommendedFollowUpsWidgetProps {
    peopleData: PeopleDashboardData | null;
    groups: PcoGroup[];
    givingAnalytics: GivingAnalytics | null;
    conversations: SmsConversation[];
    smsTags: SmsTag[];
    followUpLog: CareFollowUpLog[];
    onMarkFollowedUp: (personId: string) => void;
    onDismiss: (personId: string, signal: SignalType) => void;
    onRemove: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const RecommendedFollowUpsWidget: React.FC<RecommendedFollowUpsWidgetProps> = ({
    peopleData,
    groups,
    givingAnalytics,
    conversations,
    smsTags,
    followUpLog,
    onMarkFollowedUp,
    onDismiss,
    onRemove,
}) => {
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');

    // -----------------------------------------------------------------------
    // Build a log lookup map: personId → CareFollowUpLog
    // -----------------------------------------------------------------------
    const logMap = useMemo(() => {
        const m = new Map<string, CareFollowUpLog>();
        followUpLog.forEach(entry => m.set(entry.personId, entry));
        return m;
    }, [followUpLog]);

    // -----------------------------------------------------------------------
    // Build a person lookup map: personId → PcoPerson (for contact details)
    // -----------------------------------------------------------------------
    const personMap = useMemo(() => {
        const m = new Map<string, { memberStatus?: string | null; email?: string | null; phone?: string | null }>();
        (peopleData?.allPeople || []).forEach(p => m.set(p.id, { memberStatus: p.membership, email: p.email, phone: p.phone }));
        return m;
    }, [peopleData]);

    // -----------------------------------------------------------------------
    // Listen for careFollowUpCompleted events (fired by PersonProfileDrawer)
    // -----------------------------------------------------------------------
    useEffect(() => {
        const handler = (e: Event) => {
            const personId = (e as CustomEvent).detail as string;
            if (personId) onMarkFollowedUp(personId);
        };
        window.addEventListener('careFollowUpCompleted', handler);
        return () => window.removeEventListener('careFollowUpCompleted', handler);
    }, [onMarkFollowedUp]);

    // -----------------------------------------------------------------------
    // 1. Prayer — conversations tagged "Needs Prayer" with last message inbound
    // -----------------------------------------------------------------------
    const prayerItems = useMemo<FollowUpItem[]>(() => {
        const prayerTag = smsTags.find(t => t.name === 'Needs Prayer');
        if (!prayerTag) return [];
        return conversations
            .filter(c =>
                Array.isArray(c.tags) &&
                c.tags.includes(prayerTag.id) &&
                c.lastMessageDirection === 'inbound' &&
                !c.isOptedOut
            )
            .map(c => {
                const pid = c.personId || c.id;
                const contact = personMap.get(pid);
                return {
                    personId: pid,
                    personName: c.personName || c.phoneNumber,
                    personAvatar: c.personAvatar,
                    signal: 'prayer' as SignalType,
                    priority: 'high' as Priority,
                    badgeLabel: 'Needs Prayer',
                    detail: c.lastMessageBody
                        ? `"${c.lastMessageBody.slice(0, 60)}${c.lastMessageBody.length > 60 ? '…' : ''}"`
                        : 'Awaiting response',
                    ...contact,
                };
            });
    }, [conversations, smsTags, personMap]);

    // -----------------------------------------------------------------------
    // 2. Birthdays — within next 7 days
    // -----------------------------------------------------------------------
    const birthdayItems = useMemo<FollowUpItem[]>(() => {
        if (!peopleData) return [];
        return peopleData.upcomingBirthdays
            .filter(p => { const d = daysUntilAnnual(p.birthdate); return d !== null && d <= 7; })
            .map(p => {
                const d = daysUntilAnnual(p.birthdate)!;
                const contact = personMap.get(p.id);
                return {
                    personId: p.id,
                    personName: p.name,
                    personAvatar: p.avatar,
                    signal: 'birthday' as SignalType,
                    priority: 'medium' as Priority,
                    badgeLabel: 'Birthday',
                    detail: d === 0 ? `🎉 Today! ${formatMonthDay(p.birthdate)}`
                          : d === 1 ? `Tomorrow — ${formatMonthDay(p.birthdate)}`
                          : `${formatMonthDay(p.birthdate)} (in ${d} days)`,
                    ...contact,
                };
            });
    }, [peopleData, personMap]);

    // -----------------------------------------------------------------------
    // 3. Anniversaries — within next 7 days
    // -----------------------------------------------------------------------
    const anniversaryItems = useMemo<FollowUpItem[]>(() => {
        if (!peopleData) return [];
        return peopleData.upcomingAnniversaries
            .filter(p => { const d = daysUntilAnnual(p.anniversary); return d !== null && d <= 7; })
            .map(p => {
                const d = daysUntilAnnual(p.anniversary)!;
                const contact = personMap.get(p.id);
                return {
                    personId: p.id,
                    personName: p.name,
                    personAvatar: p.avatar,
                    signal: 'anniversary' as SignalType,
                    priority: 'medium' as Priority,
                    badgeLabel: 'Anniversary',
                    detail: d === 0 ? `🎉 Today! ${formatMonthDay(p.anniversary)}`
                          : d === 1 ? `Tomorrow — ${formatMonthDay(p.anniversary)}`
                          : `${formatMonthDay(p.anniversary)} (in ${d} days)`,
                    ...contact,
                };
            });
    }, [peopleData, personMap]);

    // -----------------------------------------------------------------------
    // 4. Lapsed donors
    // -----------------------------------------------------------------------
    const lapsedItems = useMemo<FollowUpItem[]>(() => {
        if (!givingAnalytics?.lists?.lapsed) return [];
        return givingAnalytics.lists.lapsed.map((d: LifecycleDonor) => {
            const contact = personMap.get(d.id);
            return {
                personId: d.id,
                personName: d.name,
                personAvatar: d.avatar,
                signal: 'lapsed' as SignalType,
                priority: 'medium_high' as Priority,
                badgeLabel: 'Lapsed Donor',
                detail: `Last gift ${new Date(d.lastGiftDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
                ...contact,
            };
        });
    }, [givingAnalytics, personMap]);

    // -----------------------------------------------------------------------
    // 5. Inactive donors
    // -----------------------------------------------------------------------
    const inactiveItems = useMemo<FollowUpItem[]>(() => {
        if (!givingAnalytics?.lists?.inactive) return [];
        return givingAnalytics.lists.inactive.map((d: LifecycleDonor) => {
            const contact = personMap.get(d.id);
            return {
                personId: d.id,
                personName: d.name,
                personAvatar: d.avatar,
                signal: 'inactive' as SignalType,
                priority: 'high' as Priority,
                badgeLabel: 'Inactive Donor',
                detail: `Last gift ${new Date(d.lastGiftDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`,
                ...contact,
            };
        });
    }, [givingAnalytics, personMap]);

    // -----------------------------------------------------------------------
    // 6. Group absentees — missed 2 of last 3 events
    // -----------------------------------------------------------------------
    const groupAbsenceItems = useMemo<FollowUpItem[]>(() => {
        const seen = new Map<string, FollowUpItem>();
        groups
            .filter(g => !g.archivedAt && (g.memberIds?.length ?? 0) > 0)
            .forEach(group => {
                const history = (group.attendanceHistory || [])
                    .slice().sort((a, b) => b.date > a.date ? 1 : -1).slice(0, 3);
                if (history.length < 2) return;
                (group.memberIds || []).forEach(memberId => {
                    if (seen.has(memberId)) return;
                    const attended = history.filter(
                        e => Array.isArray(e.attendeeIds) && e.attendeeIds.includes(memberId)
                    ).length;
                    if (history.length - attended < 2) return;
                    const person = peopleData?.allPeople.find(p => p.id === memberId);
                    const contact = personMap.get(memberId);
                    seen.set(memberId, {
                        personId: memberId,
                        personName: person?.name || `Member ${memberId}`,
                        personAvatar: person?.avatar,
                        signal: 'group_absence',
                        priority: 'medium_high',
                        badgeLabel: 'Group Absence',
                        detail: `Missed ${history.length - attended} of last ${history.length} events in ${group.name}`,
                        ...contact,
                    });
                });
            });
        return Array.from(seen.values());
    }, [groups, peopleData, personMap]);

    // -----------------------------------------------------------------------
    // Merge & deduplicate — highest priority signal per person
    // -----------------------------------------------------------------------
    const allItems = useMemo<FollowUpItem[]>(() => {
        const combined = [
            ...prayerItems, ...inactiveItems, ...groupAbsenceItems,
            ...lapsedItems, ...birthdayItems, ...anniversaryItems,
        ];
        const byPerson = new Map<string, FollowUpItem>();
        combined.forEach(item => {
            const existing = byPerson.get(item.personId);
            if (!existing || PRIORITY_ORDER[item.priority] < PRIORITY_ORDER[existing.priority]) {
                byPerson.set(item.personId, item);
            }
        });
        return Array.from(byPerson.values()).sort(
            (a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
        );
    }, [prayerItems, inactiveItems, groupAbsenceItems, lapsedItems, birthdayItems, anniversaryItems]);

    // -----------------------------------------------------------------------
    // Apply follow-up / dismiss filtering
    //   - Dismissed: hide entirely (unless signal changed since dismissal)
    //   - Followed-up within 7 days: show with done indicator, keep in list
    // -----------------------------------------------------------------------
    const now = Date.now();

    const { activeItems, followedUpItems } = useMemo(() => {
        const active: FollowUpItem[] = [];
        const done: FollowUpItem[] = [];

        allItems.forEach(item => {
            const log = logMap.get(item.personId);

            // Dismissed? Hide unless signal changed
            if (log?.dismissedAt && log.dismissedSignal === item.signal) return;

            // Followed up within 7 days? Shunt to done section
            if (log?.followedUpAt && (now - log.followedUpAt) < SEVEN_DAYS_MS) {
                done.push(item);
                return;
            }

            active.push(item);
        });

        return { activeItems: active, followedUpItems: done };
    }, [allItems, logMap, now]);

    const filteredActive = useMemo(
        () => activeFilter === 'all' ? activeItems : activeItems.filter(i => i.signal === activeFilter),
        [activeItems, activeFilter]
    );

    // Counts shown on pills (active only — not followed-up)
    const counts = useMemo(() => {
        const c: Partial<Record<FilterType, number>> = { all: activeItems.length };
        activeItems.forEach(item => { c[item.signal] = (c[item.signal] || 0) + 1; });
        return c;
    }, [activeItems]);

    const handlePersonClick = (personId: string) => {
        window.dispatchEvent(new CustomEvent('openPersonProfile', { detail: personId }));
    };

    // (FollowUpRow is a module-level component — rendered below)

    // -----------------------------------------------------------------------
    // Render
    // -----------------------------------------------------------------------
    return (
        <WidgetWrapper title="Recommended Follow-Ups" onRemove={onRemove} source="Care Engine">
            <div className="flex flex-col gap-4">
                {/* Filter pills */}
                <div className="flex flex-wrap gap-1.5">
                    {FILTERS.map(f => {
                        const count = counts[f.key];
                        if (f.key !== 'all' && !count) return null;
                        const isActive = activeFilter === f.key;
                        return (
                            <button
                                key={f.key}
                                onClick={() => setActiveFilter(f.key)}
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wide transition-all ${
                                    isActive
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                {f.label}
                                {count != null && (
                                    <span className={`px-1.5 py-0.5 rounded-full text-[11px] font-black ${
                                        isActive ? 'bg-white/20 text-white' : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                    }`}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* Active list */}
                <div className="space-y-2 max-h-[480px] overflow-y-auto custom-scrollbar pr-1">
                    {filteredActive.length === 0 && followedUpItems.length === 0 ? (
                        <div className="py-14 flex flex-col items-center gap-3 text-center">
                            <span className="text-4xl">🎉</span>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No follow-ups needed right now.</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Check back after syncing fresh data.</p>
                        </div>
                    ) : filteredActive.length === 0 && followedUpItems.length > 0 ? (
                        <div className="py-8 flex flex-col items-center gap-2 text-center">
                            <span className="text-3xl">✅</span>
                            <p className="text-sm font-bold text-emerald-600 dark:text-emerald-400">All caught up!</p>
                        </div>
                    ) : (
                        filteredActive.map(item => (
                            <FollowUpRow
                                key={`active-${item.signal}-${item.personId}`}
                                item={item}
                                isDone={false}
                                onMarkFollowedUp={onMarkFollowedUp}
                                onDismiss={onDismiss}
                            />
                        ))
                    )}
                </div>

                {/* Footer stats */}
                {(filteredActive.length > 0 || followedUpItems.length > 0) && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wide text-center">
                        {filteredActive.length > 0
                            ? `${filteredActive.length} need${filteredActive.length === 1 ? 's' : ''} attention`
                            : ''}
                        {filteredActive.length > 0 && followedUpItems.length > 0 ? ' · ' : ''}
                        {followedUpItems.length > 0 ? `${followedUpItems.length} followed up` : ''}
                    </p>
                )}

                {/* Followed-up section — collapsible */}
                {followedUpItems.length > 0 && (
                    <details className="group/done">
                        <summary className="cursor-pointer list-none flex items-center gap-2 py-1">
                            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                            <span className="text-[10px] font-bold uppercase tracking-wide text-slate-400 dark:text-slate-500 select-none flex items-center gap-1.5 whitespace-nowrap">
                                <Check size={10} strokeWidth={3} className="text-emerald-500" />
                                {followedUpItems.length} Followed Up
                                <span className="text-slate-300 dark:text-slate-600 group-open/done:rotate-180 transition-transform inline-block">▾</span>
                            </span>
                            <div className="flex-1 h-px bg-slate-100 dark:bg-slate-800" />
                        </summary>
                        <div className="space-y-2 mt-2">
                            {followedUpItems.map(item => (
                                <FollowUpRow
                                    key={`done-${item.signal}-${item.personId}`}
                                    item={item}
                                    isDone={true}
                                    onMarkFollowedUp={onMarkFollowedUp}
                                    onDismiss={onDismiss}
                                />
                            ))}
                        </div>
                    </details>
                )}
            </div>
        </WidgetWrapper>
    );
};
