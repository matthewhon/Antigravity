import React, { useRef } from 'react';
import { FileText } from 'lucide-react';
import { ChatWidgetSnapshotItem, TeamMessage, User } from '../../types';
import { Avatar, formatClock } from './chatUtils';
import { renderRichText } from './richText';
import { WidgetSnapshotCard } from './WidgetSnapshotCard';

/** Long-press (touch) + right-click (desktop) without blocking scrolling. */
function useLongPress(onLongPress: () => void, ms = 420) {
    const timer = useRef<number | undefined>(undefined);
    const start = useRef<{ x: number; y: number } | null>(null);
    const clear = () => { window.clearTimeout(timer.current); start.current = null; };
    return {
        onPointerDown: (e: React.PointerEvent) => {
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            start.current = { x: e.clientX, y: e.clientY };
            timer.current = window.setTimeout(() => { clear(); onLongPress(); }, ms);
        },
        onPointerMove: (e: React.PointerEvent) => {
            if (!start.current) return;
            if (Math.abs(e.clientX - start.current.x) > 8 || Math.abs(e.clientY - start.current.y) > 8) clear();
        },
        onPointerUp: clear,
        onPointerCancel: clear,
        onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); clear(); onLongPress(); },
    };
}

interface MessageBubbleProps {
    msg: TeamMessage;
    currentUser: User;
    /** Same sender as the message above (hide name) */
    groupedWithPrev: boolean;
    /** Same sender as the message below (hide avatar + tail) */
    groupedWithNext: boolean;
    mentionTokens: string[];
    animate: boolean;
    onLongPress: (msg: TeamMessage) => void;
    onToggleReaction: (msg: TeamMessage, emoji: string) => void;
    onToggleClaim: (msg: TeamMessage, item: ChatWidgetSnapshotItem) => void;
    onOpenImage: (url: string) => void;
}

export const MessageBubble: React.FC<MessageBubbleProps> = ({
    msg, currentUser, groupedWithPrev, groupedWithNext, mentionTokens, animate,
    onLongPress, onToggleReaction, onToggleClaim, onOpenImage,
}) => {
    const mine = msg.senderId === currentUser.id;
    const isAi = !!msg.isAiResponse || msg.senderId === 'pastor-ai';
    const isBriefing = !!msg.isAutomatedBriefing;
    const press = useLongPress(() => onLongPress(msg));

    const images = (msg.attachments || []).filter(a => a.kind === 'image');
    const videos = (msg.attachments || []).filter(a => a.kind === 'video');
    const docs = (msg.attachments || []).filter(a => a.kind === 'document');
    const reactions = Object.entries(msg.reactions || {}).filter(([, ids]) => ids.length > 0);
    const hasText = !!msg.text?.trim();

    const bubbleTone = mine
        ? 'bg-violet-600 text-white'
        : isAi || isBriefing
            ? 'bg-gradient-to-br from-indigo-50 to-violet-50 dark:from-indigo-950/60 dark:to-violet-950/60 text-slate-900 dark:text-slate-100 border border-indigo-100 dark:border-indigo-900'
            : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 border border-slate-200/70 dark:border-slate-700/70';

    const corner = mine
        ? (groupedWithNext ? 'rounded-[20px] rounded-br-md' : 'rounded-[20px] rounded-br-[6px]')
        : (groupedWithNext ? 'rounded-[20px] rounded-bl-md' : 'rounded-[20px] rounded-bl-[6px]');

    return (
        <div className={`flex gap-2 px-3 ${mine ? 'justify-end' : 'justify-start'} ${groupedWithPrev ? 'mt-0.5' : 'mt-3'} ${animate ? 'anim-bubble-in' : ''}`}>
            {!mine && (
                <div className="w-8 shrink-0 flex items-end">
                    {!groupedWithNext && <Avatar name={msg.senderName} id={msg.senderId} size={30} isAi={isAi} />}
                </div>
            )}

            <div className={`flex flex-col min-w-0 ${mine ? 'items-end' : 'items-start'} ${msg.widget ? 'w-[85%]' : 'max-w-[78%]'}`}>
                {!mine && !groupedWithPrev && (
                    <span className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5 ml-3">
                        {isAi ? '@PastorAI' : msg.senderName}
                    </span>
                )}

                <div
                    {...press}
                    className="flex flex-col select-none [-webkit-touch-callout:none] max-w-full"
                    style={{ WebkitUserSelect: 'none' }}
                >
                    {msg.replyPreview && (
                        <div className={`text-[12px] px-3 py-1.5 mb-0.5 rounded-2xl border-l-2 max-w-full truncate ${mine
                            ? 'self-end bg-violet-100 dark:bg-violet-950/50 border-violet-400 text-violet-900 dark:text-violet-200'
                            : 'self-start bg-slate-100 dark:bg-slate-800/70 border-slate-400 text-slate-600 dark:text-slate-300'}`}>
                            <b>{msg.replyPreview.senderName}</b>: {msg.replyPreview.text}
                        </div>
                    )}

                    {images.length > 0 && (
                        <div className={`grid gap-1 mb-0.5 ${images.length > 1 ? 'grid-cols-2' : 'grid-cols-1'} ${mine ? 'self-end' : 'self-start'}`}>
                            {images.map(img => (
                                <button key={img.id} type="button" onClick={() => onOpenImage(img.url)}
                                    className="block rounded-2xl overflow-hidden bg-slate-200 dark:bg-slate-800">
                                    <img src={img.url} alt={img.name} loading="lazy"
                                        className={`object-cover ${images.length > 1 ? 'w-32 h-32' : 'max-w-[240px] max-h-[300px]'}`} />
                                </button>
                            ))}
                        </div>
                    )}

                    {videos.map(v => (
                        <video key={v.id} src={v.url} controls playsInline preload="metadata"
                            className="max-w-[260px] rounded-2xl mb-0.5 bg-black" />
                    ))}

                    {(hasText || docs.length > 0) && (
                        <div className={`px-3.5 py-2 text-[15px] leading-snug break-words ${bubbleTone} ${corner}`}>
                            {hasText && renderRichText(msg.text, { mine, tokens: mentionTokens })}
                            {docs.map(d => (
                                <a key={d.id} href={d.url} target="_blank" rel="noopener noreferrer"
                                    className={`mt-1 flex items-center gap-2 rounded-xl px-2.5 py-2 ${mine ? 'bg-white/15' : 'bg-slate-100 dark:bg-slate-700/60'}`}>
                                    <FileText size={16} className="shrink-0" />
                                    <span className="text-[13px] font-semibold truncate">{d.name}</span>
                                </a>
                            ))}
                            {msg.editedAt && <span className={`block text-[10px] mt-0.5 ${mine ? 'text-white/70' : 'text-slate-400'}`}>edited</span>}
                        </div>
                    )}
                </div>

                {msg.widget && (
                    <WidgetSnapshotCard
                        widget={msg.widget}
                        currentUser={currentUser}
                        onToggleClaim={item => onToggleClaim(msg, item)}
                    />
                )}

                {msg.mentionedPeople && msg.mentionedPeople.length > 0 && (
                    <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : ''}`}>
                        {msg.mentionedPeople.map(p => (
                            <span key={p.id} className="inline-flex items-center gap-1 pl-0.5 pr-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-[11px] font-semibold text-slate-700 dark:text-slate-300">
                                <Avatar name={p.name} id={p.id} src={p.avatar} size={18} />
                                {p.name}
                            </span>
                        ))}
                    </div>
                )}

                {reactions.length > 0 && (
                    <div className={`mt-1 flex flex-wrap gap-1 ${mine ? 'justify-end' : ''}`}>
                        {reactions.map(([emoji, ids]) => {
                            const reacted = ids.includes(currentUser.id);
                            return (
                                <button key={emoji} type="button" onClick={() => onToggleReaction(msg, emoji)}
                                    className={`press-scale text-[12px] px-2 py-0.5 rounded-full border ${reacted
                                        ? 'bg-violet-100 border-violet-300 text-violet-700 dark:bg-violet-900/40 dark:border-violet-700 dark:text-violet-200'
                                        : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-800 dark:border-slate-700 dark:text-slate-300'}`}>
                                    {emoji} <span className="font-semibold">{ids.length}</span>
                                </button>
                            );
                        })}
                    </div>
                )}

                {!groupedWithNext && (
                    <span className={`text-[10px] text-slate-400 mt-0.5 ${mine ? 'mr-1' : 'ml-3'}`}>{formatClock(msg.createdAt)}</span>
                )}
            </div>
        </div>
    );
};
