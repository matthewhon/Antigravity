import React from 'react';
import { SmsConversation } from '../types';
import { useConversations } from '../hooks/useConversations';
import { User as UserIcon, MessageCircle } from 'lucide-react';

interface ConversationListProps {
    churchId: string;
    twilioNumberId: string;
    onSelectConversation: (convo: SmsConversation) => void;
}

// Simple time formatter
function formatTime(isoStr: string | number) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    const now = new Date();
    if (d.toDateString() === now.toDateString()) {
        return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    }
    return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export const ConversationList: React.FC<ConversationListProps> = ({ churchId, twilioNumberId, onSelectConversation }) => {
    const { conversations, loading } = useConversations(churchId, twilioNumberId);

    if (loading) {
        return <div className="p-8 text-center text-slate-500">Loading conversations...</div>;
    }

    if (conversations.length === 0) {
        return (
            <div className="flex flex-col items-center justify-center p-12 text-center">
                <MessageCircle className="w-12 h-12 text-slate-300 dark:text-slate-700 mb-4" />
                <h3 className="text-lg font-bold text-slate-900 dark:text-white">No Conversations</h3>
                <p className="text-slate-500 text-sm mt-2">There are no messages in this inbox yet.</p>
            </div>
        );
    }

    return (
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {conversations.map(convo => {
                const isUnread = convo.unreadCount > 0;
                return (
                    <div 
                        key={convo.id} 
                        onClick={() => onSelectConversation(convo)}
                        className={`flex items-center gap-3 p-4 cursor-pointer transition-colors active:bg-slate-100 dark:active:bg-slate-800 ${isUnread ? 'bg-violet-50/50 dark:bg-violet-900/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/50'}`}
                    >
                        <div className="relative shrink-0">
                            <div className="w-12 h-12 bg-slate-200 dark:bg-slate-700 rounded-full flex items-center justify-center text-slate-500 dark:text-slate-400 overflow-hidden">
                                {convo.personAvatar ? (
                                    <img src={convo.personAvatar} alt="Avatar" className="w-full h-full object-cover" />
                                ) : (
                                    <UserIcon size={24} />
                                )}
                            </div>
                            {isUnread && (
                                <span className="absolute -top-1 -right-1 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-violet-600 px-1.5 text-[10px] font-bold text-white border-2 border-white dark:border-slate-900">
                                    {convo.unreadCount}
                                </span>
                            )}
                        </div>
                        
                        <div className="flex-1 min-w-0">
                            <div className="flex justify-between items-baseline mb-0.5">
                                <h4 className={`text-base truncate ${isUnread ? 'font-bold text-slate-900 dark:text-white' : 'font-semibold text-slate-700 dark:text-slate-200'}`}>
                                    {convo.personName || convo.phoneNumber}
                                </h4>
                                <span className={`text-[11px] shrink-0 ml-2 ${isUnread ? 'font-bold text-violet-600 dark:text-violet-400' : 'text-slate-400'}`}>
                                    {formatTime(convo.lastMessageAt)}
                                </span>
                            </div>
                            <p className={`text-sm truncate ${isUnread ? 'font-medium text-slate-800 dark:text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>
                                {convo.lastMessageBody || 'Photo/Media attachment'}
                            </p>
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
