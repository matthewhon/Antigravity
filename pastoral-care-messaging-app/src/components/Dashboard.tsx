import React, { useState, useMemo } from 'react';
import { Church, User, SmsConversation } from '../types';
import { useTwilioNumbers, canUserSeeNumber } from '../hooks/useTwilioNumbers';
import { ConversationList } from './ConversationList';
import { BroadcastView } from './BroadcastView';
import { Inbox, MessageSquare, Settings } from 'lucide-react';
import { ChatView } from './ChatView';

interface DashboardProps {
    user: User;
    church: Church;
}

export const Dashboard: React.FC<DashboardProps> = ({ user, church }) => {
    const { numbers, loading } = useTwilioNumbers(church.id);
    const [activeTab, setActiveTab] = useState<'inbox' | 'broadcast'>('inbox');
    const [selectedNumberId, setSelectedNumberId] = useState<string | null>(null);
    const [activeConversation, setActiveConversation] = useState<SmsConversation | null>(null);

    const visibleNumbers = useMemo(() => {
        return numbers.filter(n => canUserSeeNumber(n, user));
    }, [numbers, user]);

    // Automatically select the first visible number if none is selected
    React.useEffect(() => {
        if (!selectedNumberId && visibleNumbers.length > 0) {
            setSelectedNumberId(visibleNumbers[0].id);
        }
    }, [visibleNumbers, selectedNumberId]);

    const activeNumber = visibleNumbers.find(n => n.id === selectedNumberId) || visibleNumbers[0];

    // If viewing a conversation, render the chat view instead of dashboard
    if (activeConversation) {
        return (
            <ChatView 
                church={church} 
                currentUser={user} 
                conversation={activeConversation} 
                onBack={() => setActiveConversation(null)} 
            />
        );
    }

    if (loading) {
        return <div className="flex h-[100dvh] items-center justify-center">Loading Inboxes...</div>;
    }

    if (visibleNumbers.length === 0) {
        return (
            <div className="flex flex-col h-[100dvh] items-center justify-center p-8 text-center bg-slate-50 dark:bg-slate-950">
                <Inbox className="w-12 h-12 text-slate-300 mb-4" />
                <h2 className="text-xl font-bold text-slate-900 dark:text-white">No Inboxes Available</h2>
                <p className="text-slate-500 mt-2">You have not been assigned to any SMS inboxes, or your church has not provisioned a number yet.</p>
            </div>
        );
    }

    return (
        <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-slate-950">
            {/* Header / Inbox Switcher */}
            <header className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 sticky top-0 z-50 shadow-sm pt-safe">
                <div className="flex flex-col">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400">
                        {church.name}
                    </p>
                    <select 
                        value={selectedNumberId || ''} 
                        onChange={(e) => setSelectedNumberId(e.target.value)}
                        className="text-lg font-black text-slate-900 dark:text-white bg-transparent border-none p-0 focus:ring-0 outline-none appearance-none cursor-pointer"
                    >
                        {visibleNumbers.map(n => (
                            <option key={n.id} value={n.id}>
                                {n.friendlyLabel || 'Main Line'} ({n.phoneNumber})
                            </option>
                        ))}
                    </select>
                </div>
                <button className="p-2 text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition">
                    <Settings size={20} />
                </button>
            </header>

            {/* Main Content Area */}
            <main className="flex-1 overflow-y-auto relative">
                {activeTab === 'inbox' && activeNumber && (
                    <ConversationList 
                        churchId={church.id}
                        twilioNumberId={activeNumber.id}
                        onSelectConversation={setActiveConversation}
                    />
                )}
                
                {activeTab === 'broadcast' && activeNumber && (
                    <BroadcastView church={church} twilioNumber={activeNumber} />
                )}
            </main>

            {/* Bottom Navigation */}
            <nav className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-safe">
                <div className="flex items-center justify-around px-2 pt-2 pb-1">
                    <button
                        onClick={() => setActiveTab('inbox')}
                        className={`flex flex-col items-center justify-center w-full py-1 gap-1 transition-colors ${
                            activeTab === 'inbox' ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'
                        }`}
                    >
                        <div className={`p-1 rounded-full ${activeTab === 'inbox' ? 'bg-violet-100 dark:bg-violet-900/40' : ''}`}>
                            <Inbox size={24} strokeWidth={activeTab === 'inbox' ? 2.5 : 2} />
                        </div>
                        <span className={`text-[10px] ${activeTab === 'inbox' ? 'font-black' : 'font-semibold'}`}>Inbox</span>
                    </button>
                    
                    <button
                        onClick={() => setActiveTab('broadcast')}
                        className={`flex flex-col items-center justify-center w-full py-1 gap-1 transition-colors ${
                            activeTab === 'broadcast' ? 'text-violet-600 dark:text-violet-400' : 'text-slate-400'
                        }`}
                    >
                        <div className={`p-1 rounded-full ${activeTab === 'broadcast' ? 'bg-violet-100 dark:bg-violet-900/40' : ''}`}>
                            <MessageSquare size={24} strokeWidth={activeTab === 'broadcast' ? 2.5 : 2} />
                        </div>
                        <span className={`text-[10px] ${activeTab === 'broadcast' ? 'font-black' : 'font-semibold'}`}>Broadcast</span>
                    </button>
                </div>
            </nav>
        </div>
    );
};
