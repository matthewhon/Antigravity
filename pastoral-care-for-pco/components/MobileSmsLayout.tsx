import React, { useState, useEffect } from 'react';
import { Church, User, TwilioPhoneNumber } from '../types';
import MessagingModule from './MessagingModule';
import { useTwilioNumbers, canUserSeeNumber, canUserUseFeature } from '../hooks/useTwilioNumbers';
import {
    Inbox, MessageSquare, Key, BarChart3, ArrowLeft, Phone, ChevronDown, Loader2
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

type SmsTab = 'inbox' | 'campaigns' | 'keywords' | 'analytics';

interface MobileSmsLayoutProps {
    churchId: string;
    church: Church;
    currentUser: User;
    onUpdateChurch: (updates: Partial<Church>) => Promise<void>;
    onNavigateHome: () => void;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPhone(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 11 && digits.startsWith('1')) {
        return `(${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
    }
    if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return phone;
}

const SESSION_KEY = 'mobileSms_activeNumberId';
const SESSION_TAB_KEY = 'mobileSms_activeTab';

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS: { id: SmsTab; label: string; icon: React.ReactNode; perm: string }[] = [
    { id: 'inbox',     label: 'Inbox',     icon: <Inbox size={22} />, perm: 'inboxUserIds' },
    { id: 'campaigns', label: 'Broadcast', icon: <MessageSquare size={22} />, perm: 'broadcastUserIds' },
    { id: 'keywords',  label: 'Keywords',  icon: <Key size={22} />, perm: 'keywordsUserIds' },
    { id: 'analytics', label: 'Analytics', icon: <BarChart3 size={22} />, perm: 'analyticsUserIds' },
];

// ─── Number Selector ─────────────────────────────────────────────────────────

interface NumberSelectorProps {
    numbers: TwilioPhoneNumber[];
    activeId: string | null;
    onChange: (id: string) => void;
}

const NumberSelector: React.FC<NumberSelectorProps> = ({ numbers, activeId, onChange }) => {
    if (numbers.length === 0) return null;

    // Single number — show as a static badge
    if (numbers.length === 1) {
        const num = numbers[0];
        return (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded-xl px-2.5 py-1.5">
                <Phone size={11} />
                <span className="truncate max-w-[120px]">{num.friendlyLabel}</span>
            </div>
        );
    }

    // Multiple numbers — show dropdown
    return (
        <div className="relative flex items-center">
            <div className="absolute left-2.5 flex items-center pointer-events-none text-slate-400">
                <Phone size={12} />
            </div>
            <select
                value={activeId || ''}
                onChange={e => onChange(e.target.value)}
                title="Select active phone number"
                className="appearance-none text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl pl-7 pr-7 py-1.5 focus:outline-none focus:ring-2 focus:ring-violet-500 hover:bg-slate-200 dark:hover:bg-slate-700 transition cursor-pointer"
            >
                {numbers.map(num => (
                    <option key={num.id} value={num.id}>
                        {num.friendlyLabel}
                        {num.isDefault ? ' (Default)' : ''}
                        {' – '}
                        {formatPhone(num.phoneNumber)}
                    </option>
                ))}
            </select>
            <div className="absolute right-2 flex items-center pointer-events-none text-slate-400">
                <ChevronDown size={12} />
            </div>
        </div>
    );
};

// ─── Mobile SMS Layout ────────────────────────────────────────────────────────

const MobileSmsLayout: React.FC<MobileSmsLayoutProps> = ({
    churchId,
    church,
    currentUser,
    onUpdateChurch,
    onNavigateHome,
}) => {
    // ── Deep-link: read tab and number from URL query params ──────────────────
    const params = new URLSearchParams(window.location.search);
    const tabParam  = (params.get('tab') as SmsTab | null);
    const numParam  = params.get('numberId');

    // ── Tab state — persisted to sessionStorage ───────────────────────────────
    const [activeTab, setActiveTab] = useState<SmsTab>(() => {
        if (tabParam && TABS.some(t => t.id === tabParam)) return tabParam;
        const saved = sessionStorage.getItem(SESSION_TAB_KEY) as SmsTab | null;
        return saved && TABS.some(t => t.id === saved) ? saved : 'inbox';
    });

    const handleTabChange = (tab: SmsTab) => {
        setActiveTab(tab);
        sessionStorage.setItem(SESSION_TAB_KEY, tab);
    };

    // ── Phone number state ───────────────────────────────────────────────────
    const { numbers: allNumbers, loading: numbersLoading } = useTwilioNumbers(churchId);

    // Filter to only numbers this user can see
    const visibleNumbers = allNumbers.filter(n => canUserSeeNumber(n, currentUser));

    const [activeNumberId, setActiveNumberId] = useState<string | null>(() => {
        // Deep-link param takes priority
        if (numParam) return numParam;
        // Restore from session
        return sessionStorage.getItem(SESSION_KEY) || null;
    });

    // When numbers load, ensure selection is valid; auto-select default if needed
    useEffect(() => {
        if (visibleNumbers.length === 0) return;

        const currentIdValid = activeNumberId && visibleNumbers.some(n => n.id === activeNumberId);
        if (!currentIdValid) {
            const defaultNum = visibleNumbers.find(n => n.isDefault) ?? visibleNumbers[0];
            setActiveNumberId(defaultNum.id);
            sessionStorage.setItem(SESSION_KEY, defaultNum.id);
        }
    }, [visibleNumbers.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleNumberChange = (id: string) => {
        setActiveNumberId(id);
        sessionStorage.setItem(SESSION_KEY, id);
    };

    // ── Active number label for header ───────────────────────────────────────
    const activeNumber = visibleNumbers.find(n => n.id === activeNumberId) ?? null;
    const visibleTabs = TABS.filter(t => canUserUseFeature(activeNumber, currentUser, t.perm as any));

    useEffect(() => {
        if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab)) {
            setActiveTab(visibleTabs[0].id);
        }
    }, [activeNumber, activeTab, currentUser]);

    return (
        <div className="flex flex-col h-[100dvh] bg-white dark:bg-slate-950 overflow-hidden">

            {/* ── Mobile Header ────────────────────────────────────────────── */}
            <header className="shrink-0 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 shadow-sm">
                <div className="flex items-center justify-between px-4 py-3 gap-3">
                    {/* Left: back + church name */}
                    <div className="flex items-center gap-3 min-w-0">
                        <button
                            title="Back to home"
                            onClick={onNavigateHome}
                            className="shrink-0 p-1.5 rounded-full text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800 transition"
                        >
                            <ArrowLeft size={20} />
                        </button>
                        <div className="min-w-0">
                            <h1 className="text-[15px] font-black text-slate-900 dark:text-white leading-tight truncate">
                                {church.name}
                            </h1>
                            <p className="text-[10px] font-bold uppercase tracking-widest text-violet-600 dark:text-violet-400">
                                SMS Messaging
                            </p>
                        </div>
                    </div>

                    {/* Right: number selector */}
                    {numbersLoading ? (
                        <Loader2 size={16} className="animate-spin text-slate-400 shrink-0" />
                    ) : (
                        <div className="shrink-0">
                            <NumberSelector
                                numbers={visibleNumbers}
                                activeId={activeNumberId}
                                onChange={handleNumberChange}
                            />
                        </div>
                    )}
                </div>

                {/* Active number sub-header — shown when a number is selected */}
                {activeNumber && visibleNumbers.length > 1 && (
                    <div className="px-4 pb-2 flex items-center gap-1.5">
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        <span className="text-[11px] text-slate-500 dark:text-slate-400 font-medium">
                            {formatPhone(activeNumber.phoneNumber)}
                            {activeNumber.senderName ? ` · ${activeNumber.senderName}` : ''}
                        </span>
                    </div>
                )}
            </header>

            {/* ── Main Content ─────────────────────────────────────────────── */}
            <main className="flex-1 overflow-hidden relative">
                <MessagingModule
                    churchId={churchId}
                    church={church}
                    currentUser={currentUser}
                    onUpdateChurch={onUpdateChurch}
                    controlledTab={activeTab}
                    initialNumberId={activeNumberId}
                    hideNumberSelector={true}
                />
            </main>

            {/* ── Bottom Navigation Bar ────────────────────────────────────── */}
            <nav
                className="shrink-0 bg-white dark:bg-slate-900 border-t border-slate-200 dark:border-slate-800"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                <div className="flex items-stretch">
                    {visibleTabs.map(tab => {
                        const isActive = activeTab === tab.id;
                        return (
                            <button
                                key={tab.id}
                                id={`mobile-sms-tab-${tab.id}`}
                                onClick={() => handleTabChange(tab.id)}
                                className={`
                                    flex-1 flex flex-col items-center justify-center gap-1 pt-2.5 pb-2
                                    transition-colors relative
                                    ${isActive
                                        ? 'text-violet-600 dark:text-violet-400'
                                        : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                                    }
                                `}
                                aria-label={tab.label}
                                aria-current={isActive ? 'page' : undefined}
                            >
                                {/* Active indicator bar */}
                                {isActive && (
                                    <span className="absolute top-0 left-1/2 -translate-x-1/2 w-8 h-0.5 rounded-full bg-violet-500" />
                                )}
                                {/* Icon with active bg pill */}
                                <span className={`
                                    p-1 rounded-xl transition-colors
                                    ${isActive ? 'bg-violet-100 dark:bg-violet-900/40' : ''}
                                `}>
                                    {tab.icon}
                                </span>
                                <span className={`text-[10px] font-semibold leading-none ${isActive ? 'font-black' : ''}`}>
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
