import React, { useMemo, useState } from 'react';
import { PeopleDashboardData, PcoGroup, GivingAnalytics, SmsConversation, SmsTag, LifecycleDonor } from '../types';
import { WidgetWrapper } from './SharedUI';
import { MessageSquare } from 'lucide-react';

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
    /** Short human-readable reason shown in the badge */
    badgeLabel: string;
    /** Supporting detail line, e.g. "Birthday Jun 29" */
    detail: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Days until the next occurrence of a month/day, relative to today. */
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

// ---------------------------------------------------------------------------
// Signal configs
// ---------------------------------------------------------------------------

const SIGNAL_META: Record<SignalType, {
    label: string;
    emoji: string;
    badgeBg: string;
    badgeText: string;
    filterLabel: string;
}> = {
    prayer:        { label: 'Needs Prayer',    emoji: '🙏', badgeBg: 'bg-violet-100 dark:bg-violet-950/40', badgeText: 'text-violet-700 dark:text-violet-300', filterLabel: 'Prayer' },
    inactive:      { label: 'Inactive Donor',  emoji: '🚨', badgeBg: 'bg-rose-100 dark:bg-rose-950/40',    badgeText: 'text-rose-700 dark:text-rose-400',   filterLabel: 'Inactive Donor' },
    group_absence: { label: 'Group Absence',   emoji: '👥', badgeBg: 'bg-amber-100 dark:bg-amber-950/40',  badgeText: 'text-amber-700 dark:text-amber-400', filterLabel: 'Group Absence' },
    lapsed:        { label: 'Lapsed Donor',    emoji: '📉', badgeBg: 'bg-orange-100 dark:bg-orange-950/40',badgeText: 'text-orange-700 dark:text-orange-400',filterLabel: 'Lapsed Donor' },
    birthday:      { label: 'Birthday',        emoji: '🎂', badgeBg: 'bg-pink-100 dark:bg-pink-950/40',    badgeText: 'text-pink-700 dark:text-pink-400',   filterLabel: 'Birthday' },
    anniversary:   { label: 'Anniversary',     emoji: '💍', badgeBg: 'bg-indigo-100 dark:bg-indigo-950/40',badgeText: 'text-indigo-700 dark:text-indigo-400',filterLabel: 'Anniversary' },
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
// Props
// ---------------------------------------------------------------------------

interface RecommendedFollowUpsWidgetProps {
    peopleData: PeopleDashboardData | null;
    groups: PcoGroup[];
    givingAnalytics: GivingAnalytics | null;
    conversations: SmsConversation[];
    smsTags: SmsTag[];
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
    onRemove,
}) => {
    const [activeFilter, setActiveFilter] = useState<FilterType>('all');

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
            .map(c => ({
                personId: c.personId || c.id,
                personName: c.personName || c.phoneNumber,
                personAvatar: c.personAvatar,
                signal: 'prayer' as SignalType,
                priority: 'high' as Priority,
                badgeLabel: 'Needs Prayer',
                detail: c.lastMessageBody
                    ? `"${c.lastMessageBody.slice(0, 60)}${c.lastMessageBody.length > 60 ? '…' : ''}"`
                    : 'Awaiting response',
            }));
    }, [conversations, smsTags]);

    // -----------------------------------------------------------------------
    // 2. Birthdays — within next 7 days
    // -----------------------------------------------------------------------
    const birthdayItems = useMemo<FollowUpItem[]>(() => {
        if (!peopleData) return [];
        return peopleData.upcomingBirthdays
            .filter(p => {
                const d = daysUntilAnnual(p.birthdate);
                return d !== null && d <= 7;
            })
            .map(p => {
                const d = daysUntilAnnual(p.birthdate)!;
                return {
                    personId: p.id,
                    personName: p.name,
                    personAvatar: p.avatar,
                    signal: 'birthday' as SignalType,
                    priority: 'medium' as Priority,
                    badgeLabel: 'Birthday',
                    detail: d === 0
                        ? `🎉 Today! ${formatMonthDay(p.birthdate)}`
                        : d === 1
                        ? `Tomorrow — ${formatMonthDay(p.birthdate)}`
                        : `${formatMonthDay(p.birthdate)} (in ${d} days)`,
                };
            });
    }, [peopleData]);

    // -----------------------------------------------------------------------
    // 3. Anniversaries — within next 7 days
    // -----------------------------------------------------------------------
    const anniversaryItems = useMemo<FollowUpItem[]>(() => {
        if (!peopleData) return [];
        return peopleData.upcomingAnniversaries
            .filter(p => {
                const d = daysUntilAnnual(p.anniversary);
                return d !== null && d <= 7;
            })
            .map(p => {
                const d = daysUntilAnnual(p.anniversary)!;
                return {
                    personId: p.id,
                    personName: p.name,
                    personAvatar: p.avatar,
                    signal: 'anniversary' as SignalType,
                    priority: 'medium' as Priority,
                    badgeLabel: 'Anniversary',
                    detail: d === 0
                        ? `🎉 Today! ${formatMonthDay(p.anniversary)}`
                        : d === 1
                        ? `Tomorrow — ${formatMonthDay(p.anniversary)}`
                        : `${formatMonthDay(p.anniversary)} (in ${d} days)`,
                };
            });
    }, [peopleData]);

    // -----------------------------------------------------------------------
    // 4. Lapsed donors — from Donor Lifecycle lists
    // -----------------------------------------------------------------------
    const lapsedItems = useMemo<FollowUpItem[]>(() => {
        if (!givingAnalytics?.lists?.lapsed) return [];
        return givingAnalytics.lists.lapsed.map((d: LifecycleDonor) => ({
            personId: d.id,
            personName: d.name,
            personAvatar: d.avatar,
            signal: 'lapsed' as SignalType,
            priority: 'medium_high' as Priority,
            badgeLabel: 'Lapsed Donor',
            detail: `Last gift ${new Date(d.lastGiftDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · Avg $${d.avgMonthlyAmount.toLocaleString()}/mo`,
        }));
    }, [givingAnalytics]);

    // -----------------------------------------------------------------------
    // 5. Inactive donors — from Donor Lifecycle lists (higher priority)
    // -----------------------------------------------------------------------
    const inactiveItems = useMemo<FollowUpItem[]>(() => {
        if (!givingAnalytics?.lists?.inactive) return [];
        return givingAnalytics.lists.inactive.map((d: LifecycleDonor) => ({
            personId: d.id,
            personName: d.name,
            personAvatar: d.avatar,
            signal: 'inactive' as SignalType,
            priority: 'high' as Priority,
            badgeLabel: 'Inactive Donor',
            detail: `Last gift ${new Date(d.lastGiftDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })} · Avg $${d.avgMonthlyAmount.toLocaleString()}/mo`,
        }));
    }, [givingAnalytics]);

    // -----------------------------------------------------------------------
    // 6. Group absentees — missed 2 of last 3 events in any group
    // -----------------------------------------------------------------------
    const groupAbsenceItems = useMemo<FollowUpItem[]>(() => {
        const seen = new Map<string, FollowUpItem>(); // deduplicate by personId

        groups
            .filter(g => !g.archivedAt && (g.memberIds?.length ?? 0) > 0)
            .forEach(group => {
                const history = (group.attendanceHistory || [])
                    .slice()
                    .sort((a, b) => (b.date > a.date ? 1 : -1))
                    .slice(0, 3); // last 3 events only

                if (history.length < 2) return; // need at least 2 events to flag

                (group.memberIds || []).forEach(memberId => {
                    const attended = history.filter(
                        e => Array.isArray(e.attendeeIds) && e.attendeeIds.includes(memberId)
                    ).length;
                    const missed = history.length - attended;
                    if (missed < 2) return;

                    if (seen.has(memberId)) return; // already flagged from another group

                    // Look up person details from peopleData
                    const person = peopleData?.allPeople.find(p => p.id === memberId);
                    const name = person?.name || `Member ${memberId}`;
                    const avatar = person?.avatar;

                    seen.set(memberId, {
                        personId: memberId,
                        personName: name,
                        personAvatar: avatar,
                        signal: 'group_absence',
                        priority: 'medium_high',
                        badgeLabel: 'Group Absence',
                        detail: `Missed ${missed} of last ${history.length} events in ${group.name}`,
                    });
                });
            });

        return Array.from(seen.values());
    }, [groups, peopleData]);

    // -----------------------------------------------------------------------
    // Merge, deduplicate by personId (keep highest priority), sort
    // -----------------------------------------------------------------------
    const allItems = useMemo<FollowUpItem[]>(() => {
        const combined = [
            ...prayerItems,
            ...inactiveItems,
            ...groupAbsenceItems,
            ...lapsedItems,
            ...birthdayItems,
            ...anniversaryItems,
        ];

        // Keep the highest-priority signal per person
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

    const filtered = useMemo(
        () => activeFilter === 'all' ? allItems : allItems.filter(i => i.signal === activeFilter),
        [allItems, activeFilter]
    );

    // Count per signal for badge counts on filter pills
    const counts = useMemo(() => {
        const c: Partial<Record<FilterType, number>> = { all: allItems.length };
        allItems.forEach(item => {
            c[item.signal] = (c[item.signal] || 0) + 1;
        });
        return c;
    }, [allItems]);

    const handlePersonClick = (personId: string) => {
        window.dispatchEvent(new CustomEvent('openPersonProfile', { detail: personId }));
    };

    return (
        <WidgetWrapper
            title="Recommended Follow-Ups"
            onRemove={onRemove}
            source="Care Engine"
        >
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
                                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest transition-all ${
                                    isActive
                                        ? 'bg-indigo-600 text-white shadow-sm'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'
                                }`}
                            >
                                {f.label}
                                {count != null && (
                                    <span className={`px-1.5 py-0.5 rounded-full text-[9px] font-black ${
                                        isActive
                                            ? 'bg-white/20 text-white'
                                            : 'bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300'
                                    }`}>
                                        {count}
                                    </span>
                                )}
                            </button>
                        );
                    })}
                </div>

                {/* List */}
                <div className="space-y-2 max-h-[520px] overflow-y-auto custom-scrollbar pr-1">
                    {filtered.length === 0 ? (
                        <div className="py-14 flex flex-col items-center gap-3 text-center">
                            <span className="text-4xl">🎉</span>
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400">No follow-ups needed right now.</p>
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">Check back after syncing fresh data.</p>
                        </div>
                    ) : (
                        filtered.map(item => {
                            const meta = SIGNAL_META[item.signal];
                            return (
                                <div
                                    key={`${item.signal}-${item.personId}`}
                                    onClick={() => handlePersonClick(item.personId)}
                                    className="group flex items-center gap-3 p-3 rounded-2xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/50 hover:border-indigo-200 dark:hover:border-indigo-800 hover:shadow-sm cursor-pointer transition-all"
                                >
                                    {/* Avatar */}
                                    <div className="flex-shrink-0">
                                        {item.personAvatar ? (
                                            <img
                                                src={item.personAvatar}
                                                alt={item.personName}
                                                width="36"
                                                height="36"
                                                loading="lazy"
                                                className="w-9 h-9 rounded-full bg-slate-200 group-hover:ring-2 group-hover:ring-indigo-400 transition-all object-cover"
                                            />
                                        ) : (
                                            <div className="w-9 h-9 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-xs uppercase group-hover:ring-2 group-hover:ring-indigo-400 transition-all flex-shrink-0">
                                                {item.personName.substring(0, 2)}
                                            </div>
                                        )}
                                    </div>

                                    {/* Content */}
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                                {item.personName}
                                            </p>
                                            <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[9px] font-black uppercase tracking-wide whitespace-nowrap ${meta.badgeBg} ${meta.badgeText}`}>
                                                {meta.emoji} {meta.label}
                                            </span>
                                        </div>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
                                            {item.detail}
                                        </p>
                                    </div>

                                    {/* Quick action */}
                                    <button
                                        onClick={e => { e.stopPropagation(); handlePersonClick(item.personId); }}
                                        title="Open profile"
                                        className="flex-shrink-0 w-8 h-8 rounded-xl bg-slate-100 dark:bg-slate-800 hover:bg-indigo-600 text-slate-400 hover:text-white flex items-center justify-center transition-all opacity-0 group-hover:opacity-100"
                                    >
                                        <MessageSquare size={14} />
                                    </button>
                                </div>
                            );
                        })
                    )}
                </div>

                {filtered.length > 0 && (
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest text-center">
                        {filtered.length} person{filtered.length !== 1 ? 's' : ''} need{filtered.length === 1 ? 's' : ''} attention
                    </p>
                )}
            </div>
        </WidgetWrapper>
    );
};
