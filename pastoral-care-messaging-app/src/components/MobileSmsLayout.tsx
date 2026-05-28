import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Church, User, TwilioPhoneNumber } from '../types';
import MessagingModule from './MessagingModule';
import { useTwilioNumbers, canUserSeeNumber, canUserUseFeature } from '../hooks/useTwilioNumbers';
import {
    Inbox, MessageSquare, Key, BarChart3, Phone, ChevronDown,
    Loader2, Bell, BellOff, Folder,
    Zap, Sparkles, Shield, Mail
} from 'lucide-react';
import { firestore } from '../services/firestoreService';
import { QuickSendModal } from './QuickSendModal';
import logoIconTransparent from '../assets/logo-icon-transparent.png';


// ─── Web Push helper ──────────────────────────────────────────────────────────

function urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64  = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw     = atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

async function getApiBase(): Promise<string> {
    try {
        const s = await firestore.getSystemSettings();
        return (s.apiBaseUrl || 'https://pastoralcare.barnabassoftware.com').replace(/\/$/, '');
    } catch { return 'https://pastoralcare.barnabassoftware.com'; }
}

const safeJson = async (res: Response): Promise<any> => {
    const text = await res.text();
    try {
        return JSON.parse(text);
    } catch {
        throw new Error(`Server error ${res.status}: ${text.slice(0, 120) || res.statusText}`);
    }
};


// ─── Types ────────────────────────────────────────────────────────────────────

type SmsTab = 'inbox' | 'campaigns' | 'workflows' | 'keywords' | 'agent' | 'files' | 'analytics' | 'permissions';

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

const SESSION_KEY     = 'mobileSms_activeNumberId';
const SESSION_TAB_KEY = 'mobileSms_activeTab';

// ─── Tab definitions ──────────────────────────────────────────────────────────

const TABS: { id: SmsTab; label: string; icon: React.ReactNode; activeIcon: React.ReactNode; perm: string }[] = [
    {
        id: 'inbox', label: 'Inbox', perm: 'inboxUserIds',
        icon:       <Inbox size={24} strokeWidth={1.6} />,
        activeIcon: <Inbox size={24} strokeWidth={2.5} />,
    },
    {
        id: 'campaigns', label: 'Broadcast', perm: 'broadcastUserIds',
        icon:       <MessageSquare size={24} strokeWidth={1.6} />,
        activeIcon: <MessageSquare size={24} strokeWidth={2.5} />,
    },
    {
        id: 'workflows', label: 'Workflows', perm: 'broadcastUserIds',
        icon:       <Zap size={24} strokeWidth={1.6} />,
        activeIcon: <Zap size={24} strokeWidth={2.5} />,
    },
    {
        id: 'keywords', label: 'Keywords', perm: 'keywordsUserIds',
        icon:       <Key size={24} strokeWidth={1.6} />,
        activeIcon: <Key size={24} strokeWidth={2.5} />,
    },
    {
        id: 'agent', label: 'AI Agent', perm: 'aiAgentUserIds',
        icon:       <Sparkles size={24} strokeWidth={1.6} />,
        activeIcon: <Sparkles size={24} strokeWidth={2.5} />,
    },
    {
        id: 'files', label: 'Files', perm: '',
        icon:       <Folder size={24} strokeWidth={1.6} />,
        activeIcon: <Folder size={24} strokeWidth={2.5} />,
    },
    {
        id: 'analytics', label: 'Analytics', perm: 'analyticsUserIds',
        icon:       <BarChart3 size={24} strokeWidth={1.6} />,
        activeIcon: <BarChart3 size={24} strokeWidth={2.5} />,
    },
    {
        id: 'permissions', label: 'Permissions', perm: 'adminOnly',
        icon:       <Shield size={24} strokeWidth={1.6} />,
        activeIcon: <Shield size={24} strokeWidth={2.5} />,
    },
];

// ─── Number Selector ─────────────────────────────────────────────────────────

const NumberSelector: React.FC<{
    numbers: TwilioPhoneNumber[];
    activeId: string | null;
    onChange: (id: string) => void;
}> = ({ numbers, activeId, onChange }) => {
    if (numbers.length === 0) return null;

    const activeNum = numbers.find(num => num.id === activeId) || numbers[0];

    if (numbers.length === 1) {
        return (
            <div className="flex items-center gap-1.5 text-xs font-semibold text-violet-600 dark:text-violet-400 bg-violet-50 dark:bg-violet-900/30 border border-violet-200 dark:border-violet-700 rounded-full px-3 py-1.5">
                <Phone size={11} />
                <span className="truncate max-w-[120px]">{activeNum.friendlyLabel}</span>
            </div>
        );
    }

    return (
        <div className="relative flex items-center">
            {/* Styled custom pill overlay (compact and truncates friendly label) */}
            <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-full px-3 py-1.5 pr-6 transition-all duration-150">
                <Phone size={11} className="text-slate-400" />
                <span className="truncate max-w-[100px]">{activeNum.friendlyLabel}</span>
                <div className="absolute right-2 flex items-center pointer-events-none text-slate-400">
                    <ChevronDown size={11} />
                </div>
            </div>
            
            {/* Invisible native select overlay to trigger native choice menus */}
            <select
                value={activeId || ''}
                onChange={e => onChange(e.target.value)}
                title="Select active phone number"
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer appearance-none"
            >
                {numbers.map(num => (
                    <option key={num.id} value={num.id}>
                        {num.friendlyLabel}{num.isDefault ? ' ✓' : ''} – {formatPhone(num.phoneNumber)}
                    </option>
                ))}
            </select>
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
    const params   = new URLSearchParams(window.location.search);
    const tabParam = params.get('tab') as SmsTab | null;
    const numParam = params.get('numberId');

    // ── Tab state ─────────────────────────────────────────────────────────────
    const [activeTab, setActiveTab] = useState<SmsTab>(() => {
        if (tabParam && TABS.some(t => t.id === tabParam)) return tabParam;
        return 'inbox';
    });

    const [pressedTab, setPressedTab] = useState<SmsTab | null>(null);
    
    // Responsive states
    const [isTablet, setIsTablet] = useState(() => window.innerWidth >= 640);
    const [showEmailModal, setShowEmailModal] = useState(false);

    useEffect(() => {
        const handleResize = () => {
            const tablet = window.innerWidth >= 640;
            setIsTablet(tablet);
        };
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    const handleTabChange = (tab: SmsTab) => {
        setPressedTab(tab);
        setTimeout(() => setPressedTab(null), 150);
        setActiveTab(tab);
        sessionStorage.setItem(SESSION_TAB_KEY, tab);
    };

    // ── Phone number state ────────────────────────────────────────────────────
    const { numbers: allNumbers, loading: numbersLoading } = useTwilioNumbers(churchId);
    const visibleNumbers = allNumbers.filter(n => canUserSeeNumber(n, currentUser));

    const [activeNumberId, setActiveNumberId] = useState<string | null>(() => {
        if (numParam) return numParam;
        return sessionStorage.getItem(SESSION_KEY) || null;
    });

    useEffect(() => {
        if (visibleNumbers.length === 0) return;
        const valid = activeNumberId && visibleNumbers.some(n => n.id === activeNumberId);
        if (!valid) {
            const def = visibleNumbers.find(n => n.isDefault) ?? visibleNumbers[0];
            setActiveNumberId(def.id);
            sessionStorage.setItem(SESSION_KEY, def.id);
        }
    }, [visibleNumbers.length]); // eslint-disable-line react-hooks/exhaustive-deps

    const handleNumberChange = (id: string) => {
        setActiveNumberId(id);
        sessionStorage.setItem(SESSION_KEY, id);
    };

    // ── Derived state ─────────────────────────────────────────────────────────
    const activeNumber = visibleNumbers.find(n => n.id === activeNumberId) ?? null;
    
    const isAdmin = currentUser.roles?.includes('Church Admin') || currentUser.roles?.includes('System Administration');
    
    const visibleTabs = TABS.filter(t => {
        if (!isTablet && ['workflows', 'keywords', 'agent', 'permissions'].includes(t.id)) {
            return false;
        }
        if (t.id === 'files') return true;
        if (t.id === 'permissions') return isAdmin;
        return canUserUseFeature(activeNumber, currentUser, t.perm as any);
    });

    useEffect(() => {
        if (numbersLoading || !activeNumber) return;
        if (visibleTabs.length > 0 && !visibleTabs.some(t => t.id === activeTab)) {
            setActiveTab(visibleTabs[0].id);
        }
    }, [activeNumber, activeTab, currentUser, isTablet, visibleTabs, numbersLoading]); // eslint-disable-line react-hooks/exhaustive-deps





    // ── Push notifications ────────────────────────────────────────────────────
    const [pushEnabled,  setPushEnabled]  = useState(false);
    const [pushLoading,  setPushLoading]  = useState(false);

    // On mount: check if we already have a push subscription registered
    useEffect(() => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
        navigator.serviceWorker.register('/sw.js').then(reg => {
            reg.pushManager.getSubscription().then(sub => {
                setPushEnabled(!!sub);
            });
        }).catch(() => {});
    }, []);

    const togglePushNotifications = useCallback(async () => {
        if (!('serviceWorker' in navigator) || !('PushManager' in window)) {
            alert('Push notifications are not supported in this browser. Try adding the app to your home screen.');
            return;
        }
        setPushLoading(true);
        try {
            const reg = await navigator.serviceWorker.register('/sw.js');
            const existing = await reg.pushManager.getSubscription();

            if (existing) {
                // Unsubscribe
                await existing.unsubscribe();
                const base = await getApiBase();
                await fetch(`${base}/push/subscribe`, {
                    method: 'DELETE',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ churchId, userId: currentUser.id }),
                });
                setPushEnabled(false);
            } else {
                // Request permission
                const permission = await Notification.requestPermission();
                if (permission !== 'granted') {
                    alert('Please allow notifications in your browser settings to receive SMS alerts.');
                    return;
                }
                // Get VAPID public key
                const base = await getApiBase();
                const keyRes = await fetch(`${base}/push/vapid-public-key`);
                const { publicKey } = await safeJson(keyRes);
                // Subscribe
                const sub = await reg.pushManager.subscribe({
                    userVisibleOnly: true,
                    applicationServerKey: urlBase64ToUint8Array(publicKey) as any,
                });
                // Save subscription
                await fetch(`${base}/push/subscribe`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        churchId,
                        userId:      currentUser.id,
                        numberId:    activeNumberId || null,
                        subscription: sub.toJSON(),
                    }),
                });
                setPushEnabled(true);
            }
        } catch (err: any) {
            console.error('[Push]', err);
            alert('Could not enable notifications: ' + (err?.message || 'Unknown error'));
        } finally {
            setPushLoading(false);
        }
    }, [churchId, currentUser.id, activeNumberId]);

    const canSendEmail = currentUser.roles?.includes('Email') || 
                         currentUser.roles?.includes('Church Admin') || 
                         currentUser.roles?.includes('System Administration');

    const handleSendQuickEmail = async (campaign: any) => {
        await firestore.saveEmailCampaign(campaign);
        const sysSettings = await firestore.getSystemSettings();
        const apiBaseUrl = sysSettings.apiBaseUrl || 'https://pastoralcare.barnabassoftware.com';
        const res = await fetch(`${apiBaseUrl}/email/send`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ campaignId: campaign.id, churchId, sentBy: currentUser.id })
        });
        const data = await safeJson(res);
        if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
        
        await firestore.updateEmailCampaign(campaign.id, { status: 'sent', sentAt: Date.now() });
        alert(data.message || 'Quick email sent successfully!');
    };

    return (
        <div className="flex flex-col h-[100dvh] bg-slate-50 dark:bg-slate-950 overflow-hidden">

            {/* ── iOS-style Header ─────────────────────────────────────────── */}
            <header
                className="shrink-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800"
                style={{ paddingTop: 'env(safe-area-inset-top)' }}
            >
                <div className="flex items-center justify-between px-4 py-3 gap-3">
                    {/* Left: logo */}
                    <div className="flex items-center gap-2.5 min-w-0">
                        <img src={logoIconTransparent} alt="Logo" className="w-8 h-8 object-contain shrink-0" />
                        <h1 className="text-[17px] font-black text-slate-900 dark:text-white leading-tight truncate">
                            Pastoral Care
                        </h1>
                    </div>

                    {/* Right: notifications + share + number selector */}
                    <div className="flex items-center gap-2 shrink-0">
                        {/* Push notification bell */}
                        {'Notification' in window && (
                            <button
                                onClick={togglePushNotifications}
                                disabled={pushLoading}
                                title={pushEnabled ? 'Disable notifications' : 'Enable notifications'}
                                className="w-8 h-8 flex items-center justify-center rounded-full transition active:opacity-60"
                                style={{
                                    color: pushEnabled ? 'rgb(124 58 237)' : 'rgb(148 163 184)',
                                    background: pushEnabled ? 'rgb(237 233 254)' : 'transparent',
                                }}
                            >
                                {pushLoading
                                    ? <Loader2 size={16} className="animate-spin" />
                                    : pushEnabled
                                        ? <Bell size={17} strokeWidth={2} />
                                        : <BellOff size={17} strokeWidth={1.7} />
                                }
                            </button>
                        )}




                        {numbersLoading ? (
                            <Loader2 size={16} className="animate-spin text-slate-400" />
                        ) : (
                            <NumberSelector
                                numbers={visibleNumbers}
                                activeId={activeNumberId}
                                onChange={handleNumberChange}
                            />
                        )}
                    </div>
                </div>

                {/* Active number pill — multi-number only */}
                {activeNumber && visibleNumbers.length > 1 && (
                    <div className="px-4 pb-2.5 flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse shrink-0" />
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

            {/* ── iOS-style Bottom Tab Bar ──────────────────────────────────── */}
            <nav
                className="shrink-0 bg-white/90 dark:bg-slate-900/90 backdrop-blur-xl border-t border-slate-200/80 dark:border-slate-800"
                style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}
            >
                <div className="flex items-stretch h-[49px]">
                    {isTablet ? (
                        // Tablet/iPad Layout: Show all 8 tabs inline
                        visibleTabs.map(tab => {
                            const isActive  = activeTab === tab.id;
                            const isPressed = pressedTab === tab.id;
                            return (
                                <button
                                    key={tab.id}
                                    id={`mobile-sms-tab-${tab.id}`}
                                    onClick={() => handleTabChange(tab.id)}
                                    aria-label={tab.label}
                                    aria-current={isActive ? 'page' : undefined}
                                    className="flex-1 flex flex-col items-center justify-center gap-[3px] select-none"
                                    style={{ WebkitTapHighlightColor: 'transparent' }}
                                >
                                    {/* Icon container with iOS pill highlight */}
                                    <span
                                        className="flex items-center justify-center rounded-2xl transition-all duration-150"
                                        style={{
                                            width: 44,
                                            height: 28,
                                            background: isActive ? 'rgb(237 233 254)' : 'transparent',
                                            transform: isPressed ? 'scale(0.88)' : 'scale(1)',
                                            color: isActive ? 'rgb(124 58 237)' : 'rgb(148 163 184)',
                                        }}
                                    >
                                        {isActive ? tab.activeIcon : tab.icon}
                                    </span>
                                    {/* Label */}
                                    <span
                                        className="leading-none"
                                        style={{
                                            fontSize: 10,
                                            fontWeight: isActive ? 700 : 500,
                                            color: isActive ? 'rgb(124 58 237)' : 'rgb(148 163 184)',
                                            letterSpacing: 0.1,
                                        }}
                                    >
                                        {tab.label}
                                    </span>
                                </button>
                            );
                        })
                    ) : (
                        // Phone Layout: Show Inbox, Broadcast, Email, Files, Analytics inline
                        visibleTabs.map(tab => {
                            const isActive  = activeTab === tab.id;
                            const isPressed = pressedTab === tab.id;
                            return (
                                <React.Fragment key={tab.id}>
                                    <button
                                        id={`mobile-sms-tab-${tab.id}`}
                                        onClick={() => handleTabChange(tab.id)}
                                        aria-label={tab.label}
                                        aria-current={isActive ? 'page' : undefined}
                                        className="flex-1 flex flex-col items-center justify-center gap-[3px] select-none"
                                        style={{ WebkitTapHighlightColor: 'transparent' }}
                                    >
                                        <span
                                            className="flex items-center justify-center rounded-2xl transition-all duration-150"
                                            style={{
                                                width: 44,
                                                height: 28,
                                                background: isActive ? 'rgb(237 233 254)' : 'transparent',
                                                transform: isPressed ? 'scale(0.88)' : 'scale(1)',
                                                color: isActive ? 'rgb(124 58 237)' : 'rgb(148 163 184)',
                                            }}
                                        >
                                            {isActive ? tab.activeIcon : tab.icon}
                                        </span>
                                        <span
                                            className="leading-none"
                                            style={{
                                                fontSize: 10,
                                                fontWeight: isActive ? 700 : 500,
                                                color: isActive ? 'rgb(124 58 237)' : 'rgb(148 163 184)',
                                                letterSpacing: 0.1,
                                            }}
                                        >
                                            {tab.label}
                                        </span>
                                    </button>

                                    {/* Inject Email action button directly after Broadcast (campaigns) tab */}
                                    {tab.id === 'campaigns' && canSendEmail && (
                                        <button
                                            onClick={() => setShowEmailModal(true)}
                                            className="flex-1 flex flex-col items-center justify-center gap-[3px] select-none"
                                            style={{ WebkitTapHighlightColor: 'transparent' }}
                                        >
                                            <span
                                                className="flex items-center justify-center rounded-2xl transition-all duration-150"
                                                style={{
                                                    width: 44,
                                                    height: 28,
                                                    background: 'transparent',
                                                    transform: 'scale(1)',
                                                    color: 'rgb(148 163 184)',
                                                }}
                                            >
                                                <Mail size={24} strokeWidth={1.6} />
                                            </span>
                                            <span
                                                className="leading-none"
                                                style={{
                                                    fontSize: 10,
                                                    fontWeight: 500,
                                                    color: 'rgb(148 163 184)',
                                                    letterSpacing: 0.1,
                                                }}
                                            >
                                                Email
                                            </span>
                                        </button>
                                    )}
                                </React.Fragment>
                            );
                        })
                    )}
                </div>
            </nav>



            {/* ── Quick Send Email Modal ────────────────────────────────────── */}
            {showEmailModal && canSendEmail && (
                <QuickSendModal
                    churchId={churchId}
                    church={church}
                    currentUser={currentUser}
                    onClose={() => setShowEmailModal(false)}
                    onSendQuickEmail={handleSendQuickEmail}
                />
            )}
        </div>
    );
};

export default MobileSmsLayout;
