import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowUp, Camera, Loader2, Paperclip, Pencil, Reply, Sparkles, X } from 'lucide-react';
import { ChatFileAttachment, ChatPersonMention, PcoPerson, TeamChannel, TeamMessage, User } from '../../types';
import { useTeamChat } from '../../contexts/TeamChatContext';
import {
    generateTeamChatAiReply, newMessageId, notifyTeamChatPush, sendTeamMessage,
    updateTeamMessage, uploadChatAttachment, widgetContextForAi,
} from '../../services/teamChatService';
import { Avatar } from './chatUtils';

/** Match "@Full Name" tokens to user IDs (longest names first). Mirrors the web helper. */
export function extractMentionedUserIds(text: string, candidates: User[], excludeUserId: string): string[] {
    let haystack = ` ${text.toLowerCase()} `;
    const ids: string[] = [];
    [...candidates]
        .filter(u => u.id !== excludeUserId && u.id !== 'pastor-ai' && u.name)
        .sort((a, b) => b.name.length - a.name.length)
        .forEach(u => {
            const token = `@${u.name.toLowerCase()}`;
            const idx = haystack.indexOf(token);
            if (idx === -1) return;
            const next = haystack.charAt(idx + token.length);
            if (next && /[\p{L}\p{N}_]/u.test(next)) return; // "@Jo" must not match "@Joe"
            ids.push(u.id);
            haystack = haystack.slice(0, idx) + ' '.repeat(token.length) + haystack.slice(idx + token.length);
        });
    return ids;
}

type Trigger = { type: '@' | '#'; query: string; start: number } | null;

interface StagedUpload {
    localId: string;
    name: string;
    previewUrl?: string;
    progress: number;
    attachment?: ChatFileAttachment;
    error?: boolean;
}

interface TeamComposerProps {
    channel: TeamChannel;
    channelLabel: string;
    messages: TeamMessage[];
    replyingTo: TeamMessage | null;
    onCancelReply: () => void;
    editing: TeamMessage | null;
    onCancelEdit: () => void;
    onAiThinking: (thinking: boolean) => void;
    onSent: () => void;
}

const PASTOR_AI: User = { id: 'pastor-ai', name: 'PastorAI', email: 'AI Ministry Assistant', roles: ['Pastor AI'], churchId: '' };

export const TeamComposer: React.FC<TeamComposerProps> = ({
    channel, channelLabel, messages, replyingTo, onCancelReply, editing, onCancelEdit, onAiThinking, onSent,
}) => {
    const { currentUser, church, people, getChannelParticipants } = useTeamChat();
    const [text, setText] = useState('');
    const [trigger, setTrigger] = useState<Trigger>(null);
    const [stagedPeople, setStagedPeople] = useState<ChatPersonMention[]>([]);
    const [uploads, setUploads] = useState<StagedUpload[]>([]);
    const [sending, setSending] = useState(false);
    const taRef = useRef<HTMLTextAreaElement>(null);
    const photoRef = useRef<HTMLInputElement>(null);
    const fileRef = useRef<HTMLInputElement>(null);

    const participants = useMemo(
        () => getChannelParticipants(channel).filter(u => u.id !== currentUser.id),
        [channel, getChannelParticipants, currentUser.id],
    );

    // Load the message into the box when editing starts
    useEffect(() => {
        if (editing) {
            setText(editing.text || '');
            requestAnimationFrame(() => { autoGrow(); taRef.current?.focus(); });
        }
    }, [editing]);

    useEffect(() => { if (replyingTo) taRef.current?.focus(); }, [replyingTo]);

    const autoGrow = () => {
        const ta = taRef.current;
        if (!ta) return;
        ta.style.height = 'auto';
        ta.style.height = `${Math.min(ta.scrollHeight, 140)}px`;
    };

    const detectTrigger = (value: string, caret: number) => {
        const m = value.slice(0, caret).match(/(^|\s)([@#])([^\s@#]{0,30})$/);
        setTrigger(m ? { type: m[2] as '@' | '#', query: m[3], start: caret - m[3].length - 1 } : null);
    };

    const staffResults = useMemo(() => {
        if (trigger?.type !== '@') return [];
        const q = trigger.query.toLowerCase();
        return [PASTOR_AI, ...participants].filter(u => u.name.toLowerCase().includes(q)).slice(0, 6);
    }, [trigger, participants]);

    const personResults = useMemo<PcoPerson[]>(() => {
        if (trigger?.type !== '#' || trigger.query.length < 1) return [];
        const q = trigger.query.toLowerCase();
        return people.filter(p => p.name?.toLowerCase().includes(q)).slice(0, 6);
    }, [trigger, people]);

    const insertToken = (token: string) => {
        if (!trigger) return;
        const before = text.slice(0, trigger.start);
        const after = text.slice(trigger.start + trigger.query.length + 1);
        const next = `${before}${token} ${after.replace(/^\s+/, '')}`;
        setText(next);
        setTrigger(null);
        requestAnimationFrame(() => {
            const ta = taRef.current;
            if (!ta) return;
            const pos = before.length + token.length + 1;
            ta.focus();
            ta.setSelectionRange(pos, pos);
            autoGrow();
        });
    };

    const selectPerson = (p: PcoPerson) => {
        insertToken(`#${p.name}`);
        setStagedPeople(prev => prev.some(x => x.id === p.id) ? prev : [...prev, {
            id: p.id, name: p.name, avatar: p.avatar, membership: p.membership || undefined,
            riskCategory: p.riskProfile?.category as ChatPersonMention['riskCategory'],
        }]);
    };

    const handleFiles = (files: FileList | null) => {
        if (!files || files.length === 0) return;
        Array.from(files).forEach(file => {
            const localId = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
            const previewUrl = file.type.startsWith('image/') ? URL.createObjectURL(file) : undefined;
            setUploads(prev => [...prev, { localId, name: file.name, previewUrl, progress: 0 }]);
            uploadChatAttachment(church.id, currentUser.id, file, pct =>
                setUploads(prev => prev.map(u => u.localId === localId ? { ...u, progress: pct } : u)),
            ).then(attachment => {
                setUploads(prev => prev.map(u => u.localId === localId ? { ...u, attachment, progress: 100 } : u));
            }).catch(() => {
                setUploads(prev => prev.map(u => u.localId === localId ? { ...u, error: true } : u));
            });
        });
        if (photoRef.current) photoRef.current.value = '';
        if (fileRef.current) fileRef.current.value = '';
    };

    const removeUpload = (localId: string) => {
        setUploads(prev => {
            const u = prev.find(x => x.localId === localId);
            if (u?.previewUrl) URL.revokeObjectURL(u.previewUrl);
            return prev.filter(x => x.localId !== localId);
        });
    };

    const uploading = uploads.some(u => !u.attachment && !u.error);
    const readyAttachments = uploads.filter(u => u.attachment).map(u => u.attachment!);
    const canSend = !sending && !uploading && (text.trim().length > 0 || readyAttachments.length > 0);

    const triggerPastorAi = async (prompt: string) => {
        onAiThinking(true);
        try {
            const widgets = [
                ...(channel.pinnedWidgets || []),
                ...messages.filter(m => m.widget).map(m => m.widget!),
            ];
            const aiText = await generateTeamChatAiReply({
                churchName: church.name,
                channelName: channelLabel.replace(/^#/, ''),
                userQuery: prompt,
                senderName: currentUser.name,
                recentMessages: messages.slice(-8).map(m => ({ senderName: m.senderName, text: m.text, widgetTitle: m.widget?.title })),
                activeWidgetsContext: widgets.length ? widgetContextForAi(widgets) : undefined,
            });
            await sendTeamMessage({
                id: `msg_${Date.now()}_ai`,
                channelId: channel.id,
                churchId: church.id,
                senderId: 'pastor-ai',
                senderName: '🤖 @PastorAI',
                isAiResponse: true,
                text: aiText,
                createdAt: Date.now(),
            });
        } finally {
            onAiThinking(false);
        }
    };

    const handleSend = async () => {
        if (!canSend) return;
        const trimmed = text.trim();
        setSending(true);
        try {
            if (editing) {
                await updateTeamMessage(editing.id, { text: trimmed, editedAt: Date.now() });
                onCancelEdit();
                setText('');
                return;
            }

            const mentionedUserIds = extractMentionedUserIds(trimmed, participants, currentUser.id);
            const mentionedPeople = stagedPeople.filter(p => trimmed.includes(`#${p.name}`));
            const msg: TeamMessage = {
                id: newMessageId(channel.id),
                channelId: channel.id,
                churchId: church.id,
                senderId: currentUser.id,
                senderName: currentUser.name,
                senderRoles: currentUser.roles,
                text: trimmed,
                createdAt: Date.now(),
                ...(replyingTo ? {
                    replyToMessageId: replyingTo.id,
                    replyPreview: {
                        id: replyingTo.id,
                        senderName: replyingTo.senderName,
                        text: replyingTo.text || (replyingTo.widget ? `[Widget: ${replyingTo.widget.title}]` : '[Attachment]'),
                    },
                } : {}),
                ...(readyAttachments.length ? { attachments: readyAttachments } : {}),
                ...(mentionedPeople.length ? { mentionedPeople } : {}),
                ...(mentionedUserIds.length ? { mentionedUserIds } : {}),
            };

            // Clear immediately for a snappy feel
            setText('');
            setStagedPeople([]);
            uploads.forEach(u => u.previewUrl && URL.revokeObjectURL(u.previewUrl));
            setUploads([]);
            onCancelReply();
            setTrigger(null);
            requestAnimationFrame(autoGrow);

            await sendTeamMessage(msg);
            notifyTeamChatPush(msg.id);
            onSent();

            if (/@pastorai\b/i.test(trimmed)) await triggerPastorAi(trimmed);
        } catch (e) {
            console.error('[TeamChat] send failed', e);
            alert('Message could not be sent. Please check your connection and try again.');
        } finally {
            setSending(false);
        }
    };

    const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        // Hardware keyboards (iPad / desktop): Enter sends, Shift+Enter = newline. IME-safe.
        const finePointer = window.matchMedia?.('(pointer: fine)').matches;
        if (finePointer && e.key === 'Enter' && !e.shiftKey) {
            if (e.nativeEvent.isComposing || e.keyCode === 229) return;
            e.preventDefault();
            handleSend();
        }
    };

    const showSuggestions = (trigger?.type === '@' && staffResults.length > 0) || (trigger?.type === '#' && personResults.length > 0);

    return (
        <div className="shrink-0 relative border-t border-slate-200/80 dark:border-slate-800 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl"
            style={{ paddingBottom: 'max(8px, env(safe-area-inset-bottom))' }}>

            {/* Mention suggestions */}
            {showSuggestions && (
                <div className="absolute bottom-full left-2 right-2 mb-2 rounded-2xl bg-white dark:bg-slate-800 shadow-xl border border-slate-200 dark:border-slate-700 overflow-hidden anim-fade-up">
                    {trigger?.type === '@' && staffResults.map(u => (
                        <button key={u.id} type="button" onMouseDown={e => e.preventDefault()}
                            onClick={() => insertToken(u.id === 'pastor-ai' ? '@PastorAI' : `@${u.name}`)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-100 dark:active:bg-slate-700">
                            <Avatar name={u.name} id={u.id} size={28} isAi={u.id === 'pastor-ai'} />
                            <span className="text-[14px] font-semibold text-slate-900 dark:text-white truncate">{u.id === 'pastor-ai' ? '@PastorAI' : u.name}</span>
                            {u.id === 'pastor-ai' && <span className="ml-auto text-[11px] text-indigo-500 font-semibold">AI assistant</span>}
                        </button>
                    ))}
                    {trigger?.type === '#' && personResults.map(p => (
                        <button key={p.id} type="button" onMouseDown={e => e.preventDefault()} onClick={() => selectPerson(p)}
                            className="w-full flex items-center gap-2.5 px-3 py-2.5 text-left active:bg-slate-100 dark:active:bg-slate-700">
                            <Avatar name={p.name} id={p.id} src={p.avatar} size={28} />
                            <span className="text-[14px] font-semibold text-slate-900 dark:text-white truncate">{p.name}</span>
                            {p.membership && <span className="ml-auto text-[11px] text-slate-400 truncate">{p.membership}</span>}
                        </button>
                    ))}
                </div>
            )}

            {/* Reply / edit banner */}
            {(replyingTo || editing) && (
                <div className="flex items-center gap-2 px-3 pt-2 text-[12px] text-slate-500 dark:text-slate-400 anim-fade-up">
                    {editing ? <Pencil size={13} className="text-violet-500" /> : <Reply size={13} className="text-violet-500" />}
                    <span className="flex-1 truncate">
                        {editing ? 'Editing message' : <>Replying to <b className="text-slate-700 dark:text-slate-200">{replyingTo!.senderName}</b>: {replyingTo!.text || '[Attachment]'}</>}
                    </span>
                    <button type="button" aria-label="Cancel" onClick={() => { if (editing) { onCancelEdit(); setText(''); } else onCancelReply(); }}
                        className="p-1 rounded-full text-slate-400 active:bg-slate-100 dark:active:bg-slate-800">
                        <X size={14} />
                    </button>
                </div>
            )}

            {/* Staged attachments */}
            {uploads.length > 0 && (
                <div className="flex gap-2 px-3 pt-2 overflow-x-auto" style={{ scrollbarWidth: 'none' }}>
                    {uploads.map(u => (
                        <div key={u.localId} className="relative shrink-0 w-16 h-16 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700">
                            {u.previewUrl
                                ? <img src={u.previewUrl} alt="" className="w-full h-full object-cover" />
                                : <span className="absolute inset-0 p-1 text-[9px] font-semibold text-slate-500 break-all leading-tight">{u.name}</span>}
                            {!u.attachment && !u.error && (
                                <span className="absolute inset-0 bg-black/40 flex items-center justify-center text-white text-[11px] font-bold">{u.progress}%</span>
                            )}
                            {u.error && <span className="absolute inset-0 bg-rose-600/70 flex items-center justify-center text-white text-[10px] font-bold">Failed</span>}
                            <button type="button" aria-label={`Remove ${u.name}`} onClick={() => removeUpload(u.localId)}
                                className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-black/60 text-white flex items-center justify-center">
                                <X size={11} />
                            </button>
                        </div>
                    ))}
                </div>
            )}

            <div className="flex items-end gap-1.5 px-2 pt-2">
                {!editing && (
                    <>
                        <button type="button" aria-label="Take or choose a photo" onClick={() => photoRef.current?.click()}
                            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800">
                            <Camera size={20} />
                        </button>
                        <button type="button" aria-label="Attach a file" onClick={() => fileRef.current?.click()}
                            className="w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 active:bg-slate-100 dark:active:bg-slate-800">
                            <Paperclip size={19} />
                        </button>
                    </>
                )}
                <input ref={photoRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />
                <input ref={fileRef} type="file" multiple className="hidden" onChange={e => handleFiles(e.target.files)} />

                <div className="flex-1 min-w-0 flex items-end rounded-[20px] border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 pl-3.5 pr-1 py-1">
                    <textarea
                        ref={taRef}
                        rows={1}
                        value={text}
                        aria-label={`Message ${channelLabel}`}
                        placeholder={`Message ${channelLabel}`}
                        onChange={e => { setText(e.target.value); detectTrigger(e.target.value, e.target.selectionStart ?? e.target.value.length); autoGrow(); }}
                        onSelect={e => detectTrigger((e.target as HTMLTextAreaElement).value, (e.target as HTMLTextAreaElement).selectionStart ?? 0)}
                        onKeyDown={onKeyDown}
                        className="flex-1 min-w-0 resize-none bg-transparent outline-none text-[16px] leading-[22px] py-1 text-slate-900 dark:text-white placeholder:text-slate-400 max-h-[140px]"
                    />
                    {!editing && !text.includes('@PastorAI') && (
                        <button type="button" aria-label="Ask @PastorAI"
                            onClick={() => { setText(t => `${t}${t && !t.endsWith(' ') ? ' ' : ''}@PastorAI `); requestAnimationFrame(() => taRef.current?.focus()); }}
                            className="w-8 h-8 shrink-0 rounded-full flex items-center justify-center text-indigo-500 active:bg-indigo-50 dark:active:bg-indigo-950">
                            <Sparkles size={17} />
                        </button>
                    )}
                </div>

                <button type="button" onClick={handleSend} disabled={!canSend} aria-label={editing ? 'Save edit' : 'Send'}
                    className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center transition-all duration-200 ${canSend
                        ? 'bg-violet-600 text-white scale-100'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-400 scale-90'}`}>
                    {sending || uploading ? <Loader2 size={17} className="animate-spin" /> : <ArrowUp size={19} strokeWidth={2.6} />}
                </button>
            </div>
        </div>
    );
};

