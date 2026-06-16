import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Church, User } from '../types';
import { firestore } from '../services/firestoreService';
import {
    ChevronLeft, Settings2, Sun, Moon, Smartphone,
    RefreshCw, LogOut, Loader2,
} from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface SettingsPageProps {
    currentUser: User;
    church: Church;
    isSyncing: boolean;
    onLogout: () => void;
    onUpdateTheme: (pref: 'light' | 'dark' | 'system') => void;
    onSyncPeople: () => Promise<void>;
}

type AppearancePref = 'light' | 'dark' | 'system';
const APPEARANCE_KEY = 'mobileAppearance';

function getStoredAppearance(): AppearancePref {
    const s = localStorage.getItem(APPEARANCE_KEY);
    if (s === 'light' || s === 'dark' || s === 'system') return s;
    return 'system';
}

// ─── Settings Page ────────────────────────────────────────────────────────────

const SettingsPage: React.FC<SettingsPageProps> = ({
    currentUser,
    church,
    isSyncing,
    onLogout,
    onUpdateTheme,
    onSyncPeople,
}) => {
    const navigate = useNavigate();
    const [appearance, setAppearance] = useState<AppearancePref>(getStoredAppearance);
    const [syncing, setSyncing] = useState(false);
    const [syncDone, setSyncDone] = useState(false);

    const applyAppearance = (pref: AppearancePref) => {
        localStorage.setItem(APPEARANCE_KEY, pref);
        setAppearance(pref);
        onUpdateTheme(pref);
    };

    // Apply stored appearance preference on mount (handles "system" re-detection)
    useEffect(() => {
        const stored = localStorage.getItem(APPEARANCE_KEY);
        if (stored === 'system') {
            onUpdateTheme('system');
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleSyncPeople = async () => {
        setSyncing(true);
        setSyncDone(false);
        try {
            await onSyncPeople();
            setSyncDone(true);
            setTimeout(() => setSyncDone(false), 3000);
        } finally {
            setSyncing(false);
        }
    };

    const APPEARANCE_OPTS: { id: AppearancePref; label: string; icon: React.ReactNode; desc: string }[] = [
        { id: 'light',  label: 'Light',  desc: 'Always light',         icon: <Sun size={20} /> },
        { id: 'dark',   label: 'Dark',   desc: 'Always dark',          icon: <Moon size={20} /> },
        { id: 'system', label: 'System', desc: 'Follows iPhone setting', icon: <Smartphone size={20} /> },
    ];

    return (
        <div
            className="flex flex-col min-h-[100dvh] bg-[#F2F2F7] dark:bg-slate-950"
            style={{ paddingTop: 'env(safe-area-inset-top)' }}
        >
            {/* ── iOS-style Navigation Bar ─────────────────────────────────── */}
            <div className="shrink-0 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-slate-200/80 dark:border-slate-800 px-2 py-2 flex items-center gap-2">
                <button
                    onClick={() => navigate(-1)}
                    className="flex items-center gap-0.5 text-violet-600 dark:text-violet-400 active:opacity-50 transition px-1 py-1"
                >
                    <ChevronLeft size={22} strokeWidth={2.5} />
                    <span className="text-[17px] font-normal">Back</span>
                </button>
                <h1 className="flex-1 text-center text-[17px] font-semibold text-slate-900 dark:text-white -ml-16">
                    Settings
                </h1>
                <div className="w-16" /> {/* spacer to balance the back button */}
            </div>

            {/* ── Content ───────────────────────────────────────────────────── */}
            <div
                className="flex-1 overflow-y-auto px-4 py-6 space-y-8"
                style={{ paddingBottom: 'max(2rem, env(safe-area-inset-bottom))' }}
            >
                {/* User info card */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl px-4 py-4 flex items-center gap-3 shadow-sm">
                    <div className="w-12 h-12 rounded-full bg-violet-600 flex items-center justify-center text-white text-lg font-black shrink-0">
                        {currentUser.name?.charAt(0) || '?'}
                    </div>
                    <div className="min-w-0">
                        <p className="font-bold text-slate-900 dark:text-white truncate">{currentUser.name}</p>
                        <p className="text-[13px] text-slate-400 truncate">{currentUser.email}</p>
                        <p className="text-[11px] text-violet-500 font-semibold mt-0.5">{church.name}</p>
                    </div>
                </div>

                {/* ── Appearance ─────────────────────────────────────────────── */}
                <section>
                    <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1 mb-2">
                        Appearance
                    </p>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-sm divide-y divide-slate-100 dark:divide-slate-800">
                        {APPEARANCE_OPTS.map(opt => (
                            <button
                                key={opt.id}
                                onClick={() => applyAppearance(opt.id)}
                                className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-slate-50 dark:active:bg-slate-800 transition text-left"
                            >
                                <span className="w-8 h-8 rounded-lg bg-violet-100 dark:bg-violet-900/40 flex items-center justify-center text-violet-600 dark:text-violet-400 shrink-0">
                                    {opt.icon}
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[16px] font-medium text-slate-900 dark:text-white">{opt.label}</p>
                                    <p className="text-[13px] text-slate-400">{opt.desc}</p>
                                </div>
                                {/* iOS-style checkmark */}
                                {appearance === opt.id && (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-violet-600 dark:text-violet-400 shrink-0">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                            </button>
                        ))}
                    </div>
                </section>

                {/* ── Planning Center ────────────────────────────────────────── */}
                {church.pcoConnected && (
                    <section>
                        <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1 mb-2">
                            Planning Center
                        </p>
                        <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-sm">
                            <button
                                onClick={handleSyncPeople}
                                disabled={syncing || isSyncing}
                                className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-slate-50 dark:active:bg-slate-800 transition disabled:opacity-60 text-left"
                            >
                                <span className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/40 flex items-center justify-center shrink-0">
                                    {(syncing || isSyncing)
                                        ? <Loader2 size={18} className="animate-spin text-emerald-600 dark:text-emerald-400" />
                                        : <RefreshCw size={18} className={`text-emerald-600 dark:text-emerald-400 ${syncDone ? 'text-emerald-500' : ''}`} />
                                    }
                                </span>
                                <div className="flex-1 min-w-0">
                                    <p className="text-[16px] font-medium text-slate-900 dark:text-white">
                                        {syncDone ? 'Sync Complete!' : 'Sync People from PCO'}
                                    </p>
                                    <p className="text-[13px] text-slate-400">
                                        {(syncing || isSyncing) ? 'Syncing...' : 'Pick up recent profile changes'}
                                    </p>
                                </div>
                                {syncDone && (
                                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-500 shrink-0">
                                        <polyline points="20 6 9 17 4 12" />
                                    </svg>
                                )}
                            </button>
                        </div>
                    </section>
                )}

                {/* ── Account ────────────────────────────────────────────────── */}
                <section>
                    <p className="text-[13px] font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest px-1 mb-2">
                        Account
                    </p>
                    <div className="bg-white dark:bg-slate-900 rounded-2xl overflow-hidden shadow-sm">
                        <button
                            onClick={onLogout}
                            className="w-full flex items-center gap-4 px-4 py-3.5 active:bg-rose-50 dark:active:bg-rose-950/20 transition text-left"
                        >
                            <span className="w-8 h-8 rounded-lg bg-rose-100 dark:bg-rose-900/30 flex items-center justify-center text-rose-500 dark:text-rose-400 shrink-0">
                                <LogOut size={18} />
                            </span>
                            <p className="text-[16px] font-medium text-rose-500 dark:text-rose-400">Sign Out</p>
                        </button>
                    </div>
                </section>

                {/* App version */}
                <p className="text-center text-[12px] text-slate-400">
                    Pastoral Care Messaging · v1.0
                </p>
            </div>
        </div>
    );
};

export default SettingsPage;
