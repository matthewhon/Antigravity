import React, { useState, useEffect, useRef } from 'react';
import { Church, SmsConversation, User } from '../types';
import { useMessages } from '../hooks/useMessages';
import { useAiSuggestions } from '../hooks/useAiSuggestions';
import { ChevronLeft, Send, Sparkles, Image as ImageIcon, User as UserIcon } from 'lucide-react';
import { updateDoc, doc } from 'firebase/firestore';
import { db } from '../services/firebase';

interface ChatViewProps {
    church: Church;
    currentUser: User;
    conversation: SmsConversation;
    onBack: () => void;
}

export const ChatView: React.FC<ChatViewProps> = ({ church, currentUser, conversation, onBack }) => {
    const { messages, loading } = useMessages(church.id, conversation.id);
    const { suggestion } = useAiSuggestions(church.id, conversation.id);
    const [draft, setDraft] = useState('');
    const [sending, setSending] = useState(false);
    const scrollRef = useRef<HTMLDivElement>(null);

    // Auto-scroll to bottom
    useEffect(() => {
        if (scrollRef.current) {
            scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
        }
    }, [messages]);

    const handleAcceptSuggestion = async () => {
        if (!suggestion) return;
        setDraft(suggestion.suggestedBody);
        try {
            await updateDoc(doc(db, `smsConversations/${conversation.id}/aiSuggestions`, suggestion.id), {
                status: 'accepted'
            });
        } catch (e) {
            console.error("Failed to update suggestion status", e);
        }
    };

    const handleSend = async () => {
        if (!draft.trim()) return;
        setSending(true);
        
        try {
            // Note: Sending requires calling the backend Cloud Function/API.
            // In a real implementation, you'd do: `fetch('/api/messaging/send-message', ...)`
            // Here we just simulate adding to the draft or call the actual endpoint.
            const payload = {
                churchId: church.id,
                conversationId: conversation.id,
                body: draft.trim(),
                sentBy: currentUser.id,
                sentByName: currentUser.name
            };
            
            // Simulating API call
            console.log("Sending SMS:", payload);
            setDraft('');
            // Optional: reset suggestion status to dismissed if unused
            if (suggestion) {
                updateDoc(doc(db, `smsConversations/${conversation.id}/aiSuggestions`, suggestion.id), {
                    status: 'dismissed'
                }).catch(console.error);
            }
        } catch (error) {
            console.error("Failed to send message", error);
            alert("Failed to send message");
        } finally {
            setSending(false);
        }
    };

    return (
        <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-slate-950">
            {/* Header */}
            <header className="flex items-center gap-3 px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 sticky top-0 z-50 shadow-sm pt-safe">
                <button 
                    onClick={onBack}
                    className="p-2 -ml-2 text-violet-600 dark:text-violet-400 hover:bg-violet-50 dark:hover:bg-violet-900/30 rounded-full transition-colors"
                >
                    <ChevronLeft size={28} />
                </button>
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-slate-200 dark:bg-slate-800 rounded-full flex items-center justify-center text-slate-500 overflow-hidden">
                        {conversation.personAvatar ? (
                            <img src={conversation.personAvatar} alt="Avatar" className="w-full h-full object-cover" />
                        ) : (
                            <UserIcon size={20} />
                        )}
                    </div>
                    <div className="flex flex-col">
                        <h2 className="text-lg font-bold text-slate-900 dark:text-white leading-tight">
                            {conversation.personName || conversation.phoneNumber}
                        </h2>
                        {conversation.personName && (
                            <span className="text-xs text-slate-500 font-medium">{conversation.phoneNumber}</span>
                        )}
                    </div>
                </div>
            </header>

            {/* Messages Area */}
            <main ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4">
                {loading && messages.length === 0 && (
                    <div className="text-center text-slate-400 p-4">Loading messages...</div>
                )}
                
                {messages.map(msg => {
                    const isOutbound = msg.direction === 'outbound';
                    return (
                        <div key={msg.id} className={`flex flex-col ${isOutbound ? 'items-end' : 'items-start'}`}>
                            <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-[15px] leading-relaxed shadow-sm ${
                                isOutbound 
                                    ? 'bg-violet-600 text-white rounded-tr-sm' 
                                    : 'bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 rounded-tl-sm border border-slate-100 dark:border-slate-700'
                            }`}>
                                {msg.body}
                                {msg.mediaUrls && msg.mediaUrls.map((url, i) => (
                                    <img key={i} src={url} alt="Attachment" className="mt-2 rounded-xl max-w-full" />
                                ))}
                            </div>
                            <div className="flex items-center gap-2 mt-1 px-1">
                                <span className="text-[10px] font-semibold text-slate-400">
                                    {new Date(msg.createdAt).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}
                                </span>
                                {isOutbound && msg.sentByName && (
                                    <span className="text-[10px] font-semibold text-slate-400">
                                         {msg.sentByName.split(' ')[0]}
                                    </span>
                                )}
                            </div>
                        </div>
                    );
                })}
            </main>

            {/* Composer Area */}
            <div className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-safe">
                {/* AI Suggestion Banner */}
                {suggestion && suggestion.status === 'pending' && !draft && (
                    <div className="px-4 py-3 bg-violet-50 dark:bg-violet-900/20 border-b border-violet-100 dark:border-violet-900/50 flex flex-col gap-2">
                        <div className="flex items-center gap-1.5 text-violet-700 dark:text-violet-300">
                            <Sparkles size={14} className="animate-pulse" />
                            <span className="text-xs font-bold uppercase tracking-wider">Pastor AI Suggestion</span>
                        </div>
                        <p className="text-sm text-slate-700 dark:text-slate-300 italic">"{suggestion.suggestedBody}"</p>
                        <button 
                            onClick={handleAcceptSuggestion}
                            className="self-start mt-1 px-4 py-1.5 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-full transition-colors shadow-sm"
                        >
                            Use Draft
                        </button>
                    </div>
                )}

                {/* Input box */}
                <div className="flex items-end gap-2 p-3">
                    <button className="p-2 text-slate-400 hover:text-violet-600 transition-colors rounded-full mb-1">
                        <ImageIcon size={24} strokeWidth={2} />
                    </button>
                    <div className="flex-1 bg-slate-100 dark:bg-slate-800 rounded-3xl min-h-[44px] flex items-center px-4 py-2 border border-transparent focus-within:border-violet-500 transition-colors">
                        <textarea
                            value={draft}
                            onChange={(e) => setDraft(e.target.value)}
                            placeholder="Message..."
                            className="w-full bg-transparent border-none p-0 focus:ring-0 resize-none max-h-32 text-[15px] dark:text-white"
                            rows={1}
                            onInput={(e) => {
                                const target = e.target as HTMLTextAreaElement;
                                target.style.height = 'auto';
                                target.style.height = target.scrollHeight + 'px';
                            }}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                        />
                    </div>
                    <button 
                        onClick={handleSend}
                        disabled={!draft.trim() || sending}
                        className={`p-2.5 rounded-full mb-0.5 transition-colors ${
                            draft.trim() && !sending 
                                ? 'bg-violet-600 text-white shadow-md hover:bg-violet-700' 
                                : 'bg-slate-200 dark:bg-slate-700 text-slate-400'
                        }`}
                    >
                        <Send size={20} className={draft.trim() && !sending ? 'translate-x-0.5' : ''} />
                    </button>
                </div>
            </div>
        </div>
    );
};
