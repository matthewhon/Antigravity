import React, { useState } from 'react';
import { Church, User } from '../types';
import MessagingModule from './MessagingModule';
import { Inbox, MessageSquare, Key, BarChart3, Sparkles, ArrowLeft } from 'lucide-react';

interface MobileSmsLayoutProps {
  churchId: string;
  church: Church;
  currentUser: User;
  onUpdateChurch: (updates: Partial<Church>) => Promise<void>;
  onNavigateHome: () => void;
}

const MobileSmsLayout: React.FC<MobileSmsLayoutProps> = ({
  churchId,
  church,
  currentUser,
  onUpdateChurch,
  onNavigateHome,
}) => {
  const [activeTab, setActiveTab] = useState<'inbox' | 'campaigns' | 'keywords' | 'analytics' | 'agent'>('inbox');

  const tabs = [
    { id: 'inbox', label: 'Inbox', icon: <Inbox size={20} /> },
    { id: 'campaigns', label: 'Broadcast', icon: <MessageSquare size={20} /> },
    { id: 'keywords', label: 'Keywords', icon: <Key size={20} /> },
    { id: 'analytics', label: 'Stats', icon: <BarChart3 size={20} /> },

  ] as const;

  return (
    <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-slate-950">
      {/* Mobile Header */}
      <header className="flex items-center justify-between px-4 py-3 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shrink-0 sticky top-0 z-50 shadow-sm">
        <div className="flex items-center gap-3">
          <button
            title="Back to home"
            onClick={onNavigateHome}
            className="p-1.5 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
          >
            <ArrowLeft size={20} />
          </button>
          <div>
            <h1 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
              {church.name}
            </h1>
            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400">
              SMS Messaging
            </p>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        <MessagingModule
          churchId={churchId}
          church={church}
          currentUser={currentUser}
          onUpdateChurch={onUpdateChurch}
          controlledTab={activeTab}
        />
      </main>

      {/* Bottom Navigation Bar */}
      <nav className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800 pb-safe">
        <div className="flex items-center justify-around px-2 pt-2 pb-1">
          {tabs.map(tab => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex flex-col items-center justify-center w-full py-1 gap-1 transition-colors ${
                  isActive
                    ? 'text-violet-600 dark:text-violet-400'
                    : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'
                }`}
              >
                <div
                  className={`p-1 rounded-full transition-colors ${
                    isActive ? 'bg-violet-100 dark:bg-violet-900/40' : 'bg-transparent'
                  }`}
                >
                  {tab.icon}
                </div>
                <span className={`text-[10px] font-semibold ${isActive ? 'font-black' : ''}`}>
                  {tab.label}
                </span>
              </button>
            );
          })}
        </div>
      </nav>
    </div>
  );
};

export default MobileSmsLayout;
