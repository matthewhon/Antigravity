import React from 'react';
import { Copy, Flag, Pencil, Reply, Trash2 } from 'lucide-react';
import { TeamMessage, User } from '../../types';
import { BottomSheet } from '../../ui/BottomSheet';

export const QUICK_REACTIONS = ['🙏', '✅', '👀', '❤️', '👍', '🎉'];

export const MessageActionsSheet: React.FC<{
    message: TeamMessage | null;
    currentUser: User;
    onClose: () => void;
    onReact: (msg: TeamMessage, emoji: string) => void;
    onReply: (msg: TeamMessage) => void;
    onEdit: (msg: TeamMessage) => void;
    onDelete: (msg: TeamMessage) => void;
    onReport: (msg: TeamMessage) => void;
}> = ({ message, currentUser, onClose, onReact, onReply, onEdit, onDelete, onReport }) => {
    const mine = message?.senderId === currentUser.id;
    const isAi = !!message?.isAiResponse || message?.senderId === 'pastor-ai';

    const Row: React.FC<{ icon: React.ReactNode; label: string; danger?: boolean; onClick: () => void }> = ({ icon, label, danger, onClick }) => (
        <button type="button" onClick={() => { onClick(); onClose(); }}
            className={`w-full flex items-center gap-3 px-5 py-3.5 text-[16px] text-left active:bg-slate-100 dark:active:bg-slate-800 ${danger ? 'text-rose-600 dark:text-rose-400' : 'text-slate-900 dark:text-white'}`}>
            {icon}
            {label}
        </button>
    );

    return (
        <BottomSheet open={!!message} onClose={onClose}>
            {message && (
                <div className="pb-2">
                    <div className="flex justify-around px-4 py-3">
                        {QUICK_REACTIONS.map(e => {
                            const reacted = message.reactions?.[e]?.includes(currentUser.id);
                            return (
                                <button key={e} type="button" aria-label={`React ${e}`}
                                    onClick={() => { onReact(message, e); onClose(); }}
                                    className={`press-scale w-11 h-11 rounded-full text-[24px] flex items-center justify-center ${reacted ? 'bg-violet-100 dark:bg-violet-900/50' : 'bg-slate-100 dark:bg-slate-800'}`}>
                                    {e}
                                </button>
                            );
                        })}
                    </div>
                    <div className="mx-4 mb-2 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-800/60 text-[13px] text-slate-500 dark:text-slate-400 line-clamp-2">
                        <b className="text-slate-700 dark:text-slate-200">{message.senderName}</b>: {message.text || '[Attachment]'}
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800">
                        <Row icon={<Reply size={19} />} label="Reply" onClick={() => onReply(message)} />
                        {!!message.text && (
                            <Row icon={<Copy size={19} />} label="Copy text" onClick={() => { navigator.clipboard?.writeText(message.text).catch(() => {}); }} />
                        )}
                        {mine && !isAi && !!message.text && (
                            <Row icon={<Pencil size={19} />} label="Edit" onClick={() => onEdit(message)} />
                        )}
                        {mine && (
                            <Row icon={<Trash2 size={19} />} label="Delete" danger onClick={() => onDelete(message)} />
                        )}
                        {!mine && !isAi && (
                            <Row icon={<Flag size={19} />} label="Report to church admin" danger onClick={() => onReport(message)} />
                        )}
                    </div>
                </div>
            )}
        </BottomSheet>
    );
};

export { ImageViewer } from '../../ui/ImageViewer';
