import React, { useMemo, useState } from 'react';
import { Bell, BellRing, CheckCheck, Lock, Plus, Search, X } from 'lucide-react';
import { TeamChannel } from '../../types';
import { useTeamChat } from '../../contexts/TeamChatContext';
import { markTeamChannelRead, setChannelNotifyAll } from '../../services/teamChatService';
import { SwipeRow } from '../../ui/SwipeRow';
import { Avatar, formatListTime } from './chatUtils';

export const ChannelList: React.FC<{
    onOpen: (channel: TeamChannel) => void;
    onNew: () => void;
}> = ({ onOpen, onNew }) => {
    const {
        channels, loading, currentUser, church, isChannelUnread, getChannelDisplayName, getChannelParticipants,
    } = useTeamChat();
    const [search, setSearch] = useState('');

    const filtered = useMemo(() => {
        const q = search.trim().toLowerCase();
        if (!q) return channels;
        return channels.filter(c =>
            getChannelDisplayName(c).toLowerCase().includes(q) ||
            (c.lastMessagePreview || '').toLowerCase().includes(q));
    }, [channels, search, getChannelDisplayName]);

    const groupChannels = filtered.filter(c => c.type !== 'direct');
    const dms = filtered.filter(c => c.type === 'direct');

    const renderRow = (c: TeamChannel) => {
        const unread = isChannelUnread(c);
        const isDm = c.type === 'direct';
        const name = getChannelDisplayName(c);
        const notifyAll = (c.notifyUserIds || []).includes(currentUser.id);
        const restricted = !!c.requiredArea || (!c.isAutoJoinedByRole && (c.participantIds || []).length > 0);
        const other = isDm ? getChannelParticipants(c).find(p => p.id !== currentUser.id) : undefined;
        const sender = c.lastMessageSenderId === currentUser.id ? 'You' : c.lastMessageSenderName?.replace('🤖 ', '');
        const preview = c.lastMessagePreview
            ? (isDm && c.lastMessageSenderId !== currentUser.id ? c.lastMessagePreview : `${sender}: ${c.lastMessagePreview}`)
            : (c.description || 'No messages yet');

        const trailing = [
            ...(unread ? [{
                key: 'read', label: 'Read', colorClass: 'bg-violet-600', icon: <CheckCheck size={18} />,
                onClick: () => markTeamChannelRead(c.id, currentUser.id),
            }] : []),
            ...(!isDm ? [{
                key: 'notify', label: notifyAll ? 'Quiet' : 'Notify all', colorClass: notifyAll ? 'bg-slate-500' : 'bg-indigo-500',
                icon: notifyAll ? <Bell size={18} /> : <BellRing size={18} />,
                onClick: () => setChannelNotifyAll(c.id, currentUser.id, !notifyAll).catch(() => {}),
            }] : []),
        ];

        return (
            <li key={c.id} className="bg-white dark:bg-slate-900">
                <SwipeRow trailing={trailing} onTap={() => onOpen(c)}>
                    <div className="press-scale flex items-center gap-3 pl-4 pr-3 py-3 bg-white dark:bg-slate-900 cursor-pointer">
                        {isDm
                            ? <Avatar name={name} id={other?.id || c.id} size={46} />
                            : <span className="w-[46px] h-[46px] rounded-2xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-[22px] shrink-0">{c.icon || '💬'}</span>}
                        <div className="flex-1 min-w-0 border-b border-slate-100 dark:border-slate-800 pb-3 -mb-3">
                            <div className="flex items-center gap-2">
                                <span className={`flex-1 truncate text-[16px] ${unread ? 'font-black text-slate-900 dark:text-white' : 'font-semibold text-slate-800 dark:text-slate-100'}`}>
                                    {isDm ? name : `#${name}`}
                                </span>
                                {restricted && !isDm && <Lock size={12} className="text-amber-500 shrink-0" />}
                                {notifyAll && !isDm && <BellRing size={12} className="text-indigo-500 shrink-0" />}
                                <span className={`text-[12px] shrink-0 ${unread ? 'text-violet-600 dark:text-violet-400 font-semibold' : 'text-slate-400'}`}>
                                    {c.lastMessageSenderId ? formatListTime(c.lastMessageAt) : ''}
                                </span>
                            </div>
                            <div className="flex items-center gap-2 mt-0.5">
                                <span className={`flex-1 truncate text-[14px] ${unread ? 'text-slate-700 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
                                    {preview}
                                </span>
                                {unread && <span className="w-2.5 h-2.5 rounded-full bg-violet-600 shrink-0" aria-label="Unread" />}
                            </div>
                        </div>
                    </div>
                </SwipeRow>
            </li>
        );
    };

    return (
        <div className="flex flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-950">
            <div className="shrink-0 px-4 pt-3 pb-2 bg-slate-50 dark:bg-slate-950">
                <div className="flex items-end justify-between">
                    <div className="min-w-0">
                        <h1 className="!m-0 !text-[30px] !font-black !tracking-tight text-slate-900 dark:text-white leading-none">Team</h1>
                        <p className="text-[12px] text-slate-500 dark:text-slate-400 mt-1 truncate">{church.name} staff chat</p>
                    </div>
                    <button type="button" onClick={onNew} aria-label="New message or channel"
                        className="press-scale w-10 h-10 rounded-full bg-violet-600 text-white flex items-center justify-center shadow-md shadow-violet-600/30">
                        <Plus size={22} strokeWidth={2.5} />
                    </button>
                </div>
                <div className="relative mt-3">
                    <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                        type="search"
                        value={search}
                        onChange={e => setSearch(e.target.value)}
                        placeholder="Search"
                        aria-label="Search conversations"
                        className="w-full pl-9 pr-9 py-2 rounded-xl bg-slate-200/70 dark:bg-slate-800 text-[16px] text-slate-900 dark:text-white placeholder:text-slate-500 outline-none focus:ring-2 focus:ring-violet-500"
                    />
                    {search && (
                        <button type="button" aria-label="Clear search" onClick={() => setSearch('')}
                            className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-slate-400"><X size={15} /></button>
                    )}
                </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-6">
                {loading ? (
                    <ul className="mt-2">
                        {Array.from({ length: 6 }).map((_, i) => (
                            <li key={i} className="flex items-center gap-3 px-4 py-3 animate-pulse">
                                <span className="w-[46px] h-[46px] rounded-2xl bg-slate-200 dark:bg-slate-800" />
                                <span className="flex-1 space-y-2">
                                    <span className="block h-3.5 w-1/3 rounded bg-slate-200 dark:bg-slate-800" />
                                    <span className="block h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-800" />
                                </span>
                            </li>
                        ))}
                    </ul>
                ) : (
                    <>
                        {groupChannels.length > 0 && (
                            <section className="mt-2">
                                <h2 className="!m-0 px-4 pb-1.5 !text-[12px] !font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Channels</h2>
                                <ul className="overflow-hidden">{groupChannels.map(renderRow)}</ul>
                            </section>
                        )}
                        <section className="mt-5">
                            <h2 className="!m-0 px-4 pb-1.5 !text-[12px] !font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">Direct Messages</h2>
                            {dms.length > 0 ? (
                                <ul className="overflow-hidden">{dms.map(renderRow)}</ul>
                            ) : (
                                <button type="button" onClick={onNew}
                                    className="mx-4 w-[calc(100%-2rem)] flex items-center gap-3 p-3 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 text-left text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-900">
                                    <Plus size={18} className="text-violet-500" />
                                    <span className="text-[14px]">{search ? 'No matches' : 'Message a teammate'}</span>
                                </button>
                            )}
                        </section>
                        <p className="px-6 pt-6 text-center text-[12px] text-slate-400">Swipe a conversation left for quick actions</p>
                    </>
                )}
            </div>
        </div>
    );
};

