import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Bell, BellRing, ChevronLeft, Lock, Loader2, Sparkles } from 'lucide-react';
import { ChatWidgetSnapshotItem, TeamChannel, TeamMessage } from '../../types';
import { useTeamChat } from '../../contexts/TeamChatContext';
import {
    deleteTeamMessage, markTeamChannelRead, reportMessageToAdmins, setChannelNotifyAll,
    subscribeToTeamMessages, toggleTeamMessageReaction, toggleWidgetItemClaim,
} from '../../services/teamChatService';
import { Avatar, formatDaySeparator, isSameDay } from './chatUtils';
import { MessageBubble } from './MessageBubble';
import { ImageViewer, MessageActionsSheet } from './MessageActionsSheet';
import { TeamComposer } from './TeamComposer';
import { WidgetSnapshotCard } from './WidgetSnapshotCard';

const GROUP_WINDOW_MS = 5 * 60 * 1000;

export const ChannelThread: React.FC<{
    channel: TeamChannel;
    isActive: boolean;
    onBack: () => void;
}> = ({ channel, isActive, onBack }) => {
    const {
        currentUser, church, churchUsers, getChannelDisplayName, getChannelParticipants, setViewingChannelId,
    } = useTeamChat();
    const [messages, setMessages] = useState<TeamMessage[]>([]);
    const [loaded, setLoaded] = useState(false);
    const [replyingTo, setReplyingTo] = useState<TeamMessage | null>(null);
    const [editing, setEditing] = useState<TeamMessage | null>(null);
    const [actionsFor, setActionsFor] = useState<TeamMessage | null>(null);
    const [imageUrl, setImageUrl] = useState<string | null>(null);
    const [aiThinking, setAiThinking] = useState(false);
    const [toast, setToast] = useState<string | null>(null);
    const scrollRef = useRef<HTMLDivElement>(null);
    const nearBottom = useRef(true);
    const knownIds = useRef<Set<string> | null>(null);
    const [freshIds, setFreshIds] = useState<Set<string>>(new Set());

    const isDm = channel.type === 'direct';
    const label = isDm ? getChannelDisplayName(channel) : `#${getChannelDisplayName(channel)}`;
    const participants = getChannelParticipants(channel);
    const notifyAll = (channel.notifyUserIds || []).includes(currentUser.id);
    const isRestricted = !!channel.requiredArea || (!channel.isAutoJoinedByRole && (channel.participantIds || []).length > 0);

    // Live messages
    useEffect(() => {
        knownIds.current = null;
        setLoaded(false);
        const unsub = subscribeToTeamMessages(church.id, channel.id, msgs => {
            if (knownIds.current) {
                const fresh = msgs.filter(m => !knownIds.current!.has(m.id)).map(m => m.id);
                if (fresh.length) setFreshIds(new Set(fresh));
            }
            knownIds.current = new Set(msgs.map(m => m.id));
            setMessages(msgs);
            setLoaded(true);
        });
        return () => unsub();
    }, [church.id, channel.id]);

    // Tell the app which thread is on screen (suppresses foreground push toasts)
    useEffect(() => {
        if (!isActive) return;
        setViewingChannelId(channel.id);
        return () => setViewingChannelId(null);
    }, [isActive, channel.id, setViewingChannelId]);

    // Mark read only while the thread is really on screen (tab visible, app in foreground)
    const [appVisible, setAppVisible] = useState(() => document.visibilityState === 'visible');
    useEffect(() => {
        const onVis = () => setAppVisible(document.visibilityState === 'visible');
        document.addEventListener('visibilitychange', onVis);
        return () => document.removeEventListener('visibilitychange', onVis);
    }, []);
    useEffect(() => {
        if (isActive && appVisible && loaded) markTeamChannelRead(channel.id, currentUser.id);
    }, [isActive, appVisible, loaded, messages.length, channel.id, currentUser.id]);

    // Stick to the bottom: first load, own sends, and new messages while at the bottom
    const scrollToBottom = useCallback((smooth = false) => {
        const el = scrollRef.current;
        if (!el) return;
        el.scrollTo({ top: el.scrollHeight, behavior: smooth ? 'smooth' : ('instant' as ScrollBehavior) });
    }, []);

    useLayoutEffect(() => {
        if (!loaded) return;
        const last = messages[messages.length - 1];
        if (nearBottom.current || last?.senderId === currentUser.id) scrollToBottom(knownIds.current !== null && freshIds.size > 0);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [messages, loaded]);

    useLayoutEffect(() => { if (aiThinking && nearBottom.current) scrollToBottom(true); }, [aiThinking, scrollToBottom]);

    // Keyboard open / rotation shrinks the scroller — keep the latest message visible
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => { if (nearBottom.current) scrollToBottom(); });
        ro.observe(el);
        return () => ro.disconnect();
    }, [scrollToBottom]);

    const onScroll = () => {
        const el = scrollRef.current;
        if (!el) return;
        nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
    };

    const mentionTokens = useMemo(() => [
        ...churchUsers.map(u => `@${u.name}`),
        ...messages.flatMap(m => (m.mentionedPeople || []).map(p => `#${p.name}`)),
    ], [churchUsers, messages]);

    const showToast = (text: string) => {
        setToast(text);
        window.setTimeout(() => setToast(null), 2500);
    };

    const handleToggleClaim = (msg: TeamMessage, item: ChatWidgetSnapshotItem) => {
        toggleWidgetItemClaim({
            messageId: msg.id, churchId: church.id, itemId: item.id, user: currentUser,
            existingClaim: msg.widget?.claims?.[item.id],
        }).catch(() => showToast('Could not update claim'));
    };

    const handleDelete = (msg: TeamMessage) => {
        if (!window.confirm('Delete this message for everyone?')) return;
        deleteTeamMessage(msg.id).catch(() => showToast('Could not delete message'));
    };

    const handleReport = async (msg: TeamMessage) => {
        if (!window.confirm(`Report this message from ${msg.senderName} to your church admin?`)) return;
        try {
            const ok = await reportMessageToAdmins({ churchId: church.id, reporter: currentUser, churchUsers, message: msg, channelLabel: label });
            showToast(ok ? 'Reported to your church admin' : 'No church admin found to notify');
        } catch {
            showToast('Could not send report');
        }
    };

    const toggleNotify = () => {
        setChannelNotifyAll(channel.id, currentUser.id, !notifyAll)
            .then(() => showToast(!notifyAll ? `You'll get a notification for every message in ${label}` : `Only DMs and @mentions will notify you`))
            .catch(() => showToast('Could not update notifications'));
    };

    const subtitle = isDm
        ? (participants.length > 2 ? `${participants.length} people` : 'Direct message')
        : channel.description
            ? channel.description
            : `${participants.length} member${participants.length === 1 ? '' : 's'}`;

    const dmOther = isDm ? participants.find(p => p.id !== currentUser.id) : undefined;

    return (
        <div className="flex flex-col h-full min-h-0 bg-slate-50 dark:bg-slate-950 relative">
            {/* Header */}
            <header className="shrink-0 flex items-center gap-2 px-2 py-2 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800">
                <button type="button" onClick={onBack} aria-label="Back to Team"
                    className="flex items-center text-violet-600 dark:text-violet-400 active:opacity-50 pr-1">
                    <ChevronLeft size={28} strokeWidth={2.4} />
                </button>
                {isDm
                    ? <Avatar name={label} id={dmOther?.id || channel.id} size={34} />
                    : <span className="w-[34px] h-[34px] rounded-xl bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-[18px] shrink-0">{channel.icon || '💬'}</span>}
                <div className="flex-1 min-w-0">
                    <p className="text-[15px] font-bold text-slate-900 dark:text-white truncate flex items-center gap-1">
                        {label}
                        {isRestricted && !isDm && <Lock size={12} className="text-amber-500 shrink-0" />}
                    </p>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 truncate">{subtitle}</p>
                </div>
                {!isDm && (
                    <button type="button" onClick={toggleNotify}
                        aria-label={notifyAll ? 'Notifications on for every message' : 'Notify me about every message'}
                        aria-pressed={notifyAll}
                        className={`w-9 h-9 rounded-full flex items-center justify-center ${notifyAll ? 'bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300' : 'text-slate-400'}`}>
                        {notifyAll ? <BellRing size={18} /> : <Bell size={18} />}
                    </button>
                )}
            </header>

            {/* Pinned widgets */}
            {!!channel.pinnedWidgets?.length && (
                <div className="shrink-0 flex gap-2 overflow-x-auto px-3 py-2 border-b border-slate-200/60 dark:border-slate-800 snap-x snap-mandatory" style={{ scrollbarWidth: 'none' }}>
                    {channel.pinnedWidgets.map(w => (
                        <div key={w.widgetId} className="snap-start shrink-0 w-[85%]">
                            <WidgetSnapshotCard widget={w} currentUser={currentUser} compact pinned />
                        </div>
                    ))}
                </div>
            )}

            {/* Messages */}
            <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto overscroll-contain pb-3">
                {!loaded ? (
                    <div className="flex justify-center py-16"><Loader2 className="animate-spin text-slate-400" /></div>
                ) : messages.length === 0 ? (
                    <div className="flex flex-col items-center text-center px-10 py-16 text-slate-500 dark:text-slate-400 anim-fade-up">
                        <span className="text-4xl mb-3">{isDm ? '👋' : channel.icon || '💬'}</span>
                        <p className="font-bold text-slate-800 dark:text-slate-100">{isDm ? `Say hi to ${label}` : `Welcome to ${label}`}</p>
                        <p className="text-[13px] mt-1">{isDm ? 'Messages here are only visible to the people in this conversation.' : channel.description || 'Start the conversation with your team.'}</p>
                    </div>
                ) : (
                    messages.map((m, i) => {
                        const prev = messages[i - 1];
                        const next = messages[i + 1];
                        const newDay = !prev || !isSameDay(prev.createdAt, m.createdAt);
                        const groupedWithPrev = !!prev && !newDay && prev.senderId === m.senderId && m.createdAt - prev.createdAt < GROUP_WINDOW_MS;
                        const groupedWithNext = !!next && isSameDay(next.createdAt, m.createdAt) && next.senderId === m.senderId && next.createdAt - m.createdAt < GROUP_WINDOW_MS;
                        return (
                            <React.Fragment key={m.id}>
                                {newDay && (
                                    <div className="flex justify-center mt-4 mb-1">
                                        <span className="text-[11px] font-semibold text-slate-400 bg-slate-100 dark:bg-slate-900 px-2.5 py-0.5 rounded-full">
                                            {formatDaySeparator(m.createdAt)}
                                        </span>
                                    </div>
                                )}
                                <MessageBubble
                                    msg={m}
                                    currentUser={currentUser}
                                    groupedWithPrev={groupedWithPrev}
                                    groupedWithNext={groupedWithNext}
                                    mentionTokens={mentionTokens}
                                    animate={freshIds.has(m.id)}
                                    onLongPress={setActionsFor}
                                    onToggleReaction={(msg, emoji) => toggleTeamMessageReaction(msg.id, emoji, currentUser.id).catch(() => {})}
                                    onToggleClaim={handleToggleClaim}
                                    onOpenImage={setImageUrl}
                                />
                            </React.Fragment>
                        );
                    })
                )}
                {aiThinking && (
                    <div className="flex items-center gap-2 px-4 mt-3 text-[13px] text-indigo-500 anim-fade-up">
                        <Sparkles size={15} className="animate-pulse" /> @PastorAI is thinking…
                    </div>
                )}
            </div>

            <TeamComposer
                channel={channel}
                channelLabel={label}
                messages={messages}
                replyingTo={replyingTo}
                onCancelReply={() => setReplyingTo(null)}
                editing={editing}
                onCancelEdit={() => setEditing(null)}
                onAiThinking={setAiThinking}
                onSent={() => { nearBottom.current = true; }}
            />

            {toast && (
                <div role="status" className="absolute left-1/2 -translate-x-1/2 bottom-24 px-4 py-2 rounded-full bg-slate-900/90 text-white text-[13px] font-semibold shadow-lg anim-fade-up max-w-[90%] text-center">
                    {toast}
                </div>
            )}

            <MessageActionsSheet
                message={actionsFor}
                currentUser={currentUser}
                onClose={() => setActionsFor(null)}
                onReact={(msg, emoji) => toggleTeamMessageReaction(msg.id, emoji, currentUser.id).catch(() => {})}
                onReply={msg => { setEditing(null); setReplyingTo(msg); }}
                onEdit={msg => { setReplyingTo(null); setEditing(msg); }}
                onDelete={handleDelete}
                onReport={handleReport}
            />
            <ImageViewer url={imageUrl} onClose={() => setImageUrl(null)} />
        </div>
    );
};
