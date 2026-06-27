
import React, { useState, useEffect, useCallback } from 'react';
import { Church } from '../types';
import { PLANS, stripeService } from '../services/stripeService';
import { auth } from '../services/firebase';
import { computeActivePeopleCount, ACTIVE_WINDOW_DAYS } from '../services/activePeopleService';
import { firestore } from '../services/firestoreService';

interface SubscriptionSettingsViewProps {
    church: Church;
    onUpdateChurch: (updates: Partial<Church>) => void;
}

/** How old (ms) a cached activePeopleCount can be before auto-refreshing on open. */
const STALE_THRESHOLD_MS = 24 * 60 * 60 * 1000; // 24 hours

export const SubscriptionSettingsView: React.FC<SubscriptionSettingsViewProps> = ({ church, onUpdateChurch }) => {
    const [isManaging, setIsManaging] = useState(false);
    const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<{type: 'success'|'error', text: string} | null>(null);
    const [showUpgrade, setShowUpgrade] = useState(false);

    // Active People state
    const [activePeopleCount, setActivePeopleCount] = useState<number | null>(church.activePeopleCount ?? null);
    const [activePeopleLastCalculatedAt, setActivePeopleLastCalculatedAt] = useState<number | null>(
        church.activePeopleLastCalculatedAt ?? null
    );
    const [isCalculating, setIsCalculating] = useState(false);

    const currentPlanId = church.subscription?.status === 'active' ? church.subscription.planId : null;
    const isPastDue = church.subscription?.status === 'past_due';
    const currentPlan = PLANS.find(p => p.id === currentPlanId);

    // Check trial status
    const now = Date.now();
    const trialEndsAt = church.trialEndsAt || 0;
    const isTrialActive = !currentPlanId && trialEndsAt > now;
    const daysLeftInTrial = isTrialActive ? Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24)) : 0;

    /** Computes the active people count, persists it, and updates local state. */
    const handleRecalculate = useCallback(async (silent = false) => {
        if (isCalculating) return;
        setIsCalculating(true);
        try {
            const count = await computeActivePeopleCount(church.id);
            const calculatedAt = Date.now();
            await firestore.updateActivePeopleCount(church.id, count);
            setActivePeopleCount(count);
            setActivePeopleLastCalculatedAt(calculatedAt);
            onUpdateChurch({ activePeopleCount: count, activePeopleLastCalculatedAt: calculatedAt });
            if (!silent) {
                setStatusMessage({ type: 'success', text: `Active people count updated: ${count.toLocaleString()} people active in the last ${ACTIVE_WINDOW_DAYS} days.` });
            }
        } catch (e: any) {
            console.error('[SubscriptionSettings] Failed to compute active people:', e);
            if (!silent) {
                setStatusMessage({ type: 'error', text: 'Could not calculate active people count. Please try again.' });
            }
        } finally {
            setIsCalculating(false);
        }
    }, [church.id, isCalculating, onUpdateChurch]);

    // Auto-refresh on mount if the count is missing or stale (> 24h old)
    useEffect(() => {
        const isStale = !activePeopleLastCalculatedAt || (Date.now() - activePeopleLastCalculatedAt > STALE_THRESHOLD_MS);
        if (isStale) {
            handleRecalculate(true); // silent — no toast
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    // Handle return from Stripe
    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        if (query.get('success')) {
            setStatusMessage({ type: 'success', text: 'Subscription successful! Your account has been upgraded.' });
            window.history.replaceState({}, document.title, window.location.pathname);
            if (church.subscription?.status !== 'active') {
                onUpdateChurch({ subscription: { ...church.subscription, status: 'active', planId: 'growth', currentPeriodEnd: Date.now() + 30*24*60*60*1000 } as any });
            }
        }
        if (query.get('canceled')) {
            setStatusMessage({ type: 'error', text: 'Checkout canceled.' });
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, []);

    const handleManage = async () => {
        setIsManaging(true);
        try {
            await stripeService.openCustomerPortal(church.id);
        } catch (e) {
            alert("Could not open billing portal.");
        } finally {
            setIsManaging(false);
        }
    };

    const handleSubscribe = async (planId: string) => {
        setProcessingPlanId(planId);
        try {
            const userEmail = auth.currentUser?.email || undefined;
            await stripeService.createCheckoutSession(church.id, planId, userEmail);
        } catch (e: any) {
            console.error(e);
            setStatusMessage({ type: 'error', text: e.message || "Failed to start subscription." });
            setProcessingPlanId(null);
        }
    };

    const handleCancel = async () => {
        setIsManaging(true);
        try {
            await stripeService.cancelSubscription(church.id);
        } finally {
            setIsManaging(false);
        }
    };

    const getPlanButtonLabel = (plan: typeof PLANS[number]) => {
        if (processingPlanId === plan.id) return 'Redirecting to Stripe...';
        if (plan.id === currentPlanId) return 'Current Plan';
        if (currentPlan && plan.price > currentPlan.price) return `Upgrade to ${plan.name}`;
        if (currentPlan && plan.price < currentPlan.price) return `Downgrade to ${plan.name}`;
        return `Select ${plan.name}`;
    };

    /**
     * Safely formats a timestamp (number or Firestore Timestamp) as a locale date string.
     * Returns null if the value is missing, NaN, or produces an invalid date.
     */
    const formatDate = (value: any): string | null => {
        if (!value && value !== 0) return null;
        // Handle Firestore Timestamp objects (they have a .toDate() method)
        const ms = typeof value?.toDate === 'function'
            ? value.toDate().getTime()
            : Number(value);
        if (isNaN(ms)) return null;
        const d = new Date(ms);
        if (isNaN(d.getTime())) return null;
        return d.toLocaleDateString();
    };

    const renewalDateLabel = formatDate(church.subscription?.currentPeriodEnd);

    const lastCalculatedLabel = activePeopleLastCalculatedAt
        ? new Date(activePeopleLastCalculatedAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })
        : null;

    return (
        <div className="space-y-8 animate-in fade-in">
            {statusMessage && (
                <div className={`p-4 rounded-xl border flex items-center gap-3 ${statusMessage.type === 'success' ? 'bg-emerald-50 border-emerald-100 text-emerald-700' : 'bg-rose-50 border-rose-100 text-rose-700'}`}>
                    <span className="text-xl">{statusMessage.type === 'success' ? '🎉' : '⚠️'}</span>
                    <p className="font-bold text-sm">{statusMessage.text}</p>
                    <button onClick={() => setStatusMessage(null)} className="ml-auto text-xs underline">Dismiss</button>
                </div>
            )}

            {/* Header / Status Banner */}
            <div className="bg-white dark:bg-slate-850 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-sm flex flex-col md:flex-row justify-between items-center gap-6 transition-colors">
                <div>
                    <h3 className="text-2xl font-black text-slate-900 dark:text-white tracking-tight">Subscription & Billing</h3>
                    <div className="flex items-center gap-2 mt-2">
                        <span className="text-xs text-slate-500 dark:text-slate-400 font-bold uppercase tracking-widest">Current Status:</span>
                        {currentPlanId ? (
                            <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${isPastDue ? 'bg-rose-100 text-rose-600 dark:bg-rose-900/30 dark:text-rose-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400'}`}>
                                {isPastDue ? 'Past Due' : `${currentPlan?.name || 'Premium'} Plan`}
                            </span>
                        ) : isTrialActive ? (
                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-violet-100 text-violet-600 dark:bg-violet-900/30 dark:text-violet-400">
                                Free Trial ({daysLeftInTrial} days left)
                            </span>
                        ) : (
                            <span className="px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                Free Tier
                            </span>
                        )}
                    </div>
                    {renewalDateLabel && currentPlanId && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-mono">
                            Renews: {renewalDateLabel}
                        </p>
                    )}
                </div>

                {currentPlanId && (
                    <div className="flex gap-3 flex-wrap justify-end">
                        <button
                            onClick={() => setShowUpgrade(v => !v)}
                            className={`px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all border ${
                                showUpgrade
                                ? 'bg-indigo-600 text-white border-indigo-600 hover:bg-indigo-700'
                                : 'bg-white dark:bg-slate-900 border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20'
                            }`}
                        >
                            {showUpgrade ? '✕ Hide Plans' : '⬆ Change Plan'}
                        </button>
                        <button
                            onClick={handleManage}
                            disabled={isManaging}
                            className="bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                        >
                            {isManaging ? 'Loading...' : 'Billing Portal'}
                        </button>
                        <button
                            onClick={handleCancel}
                            disabled={isManaging}
                            className="bg-white dark:bg-slate-850 border border-rose-100 dark:border-rose-900 text-rose-500 dark:text-rose-400 px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest hover:bg-rose-50 dark:hover:bg-rose-900/20 transition-all"
                        >
                            Cancel
                        </button>
                    </div>
                )}
            </div>

            {/* ── Active People Metric Card ── */}
            <div className="bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 rounded-[3rem] shadow-sm overflow-hidden transition-colors">
                {/* Gradient accent bar */}
                <div className="h-1.5 bg-gradient-to-r from-indigo-500 via-violet-500 to-pink-500" />

                <div className="p-10 flex flex-col md:flex-row items-center gap-8">
                    {/* Icon */}
                    <div className="w-20 h-20 rounded-3xl bg-gradient-to-br from-indigo-100 to-violet-100 dark:from-indigo-900/40 dark:to-violet-900/40 flex items-center justify-center text-4xl flex-shrink-0">
                        🏃
                    </div>

                    {/* Count + labels */}
                    <div className="flex-1 text-center md:text-left">
                        <p className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">
                            Active Congregation
                        </p>
                        <div className="flex items-baseline gap-3 justify-center md:justify-start">
                            {isCalculating ? (
                                <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full border-4 border-indigo-200 border-t-indigo-500 animate-spin" />
                                    <span className="text-slate-400 dark:text-slate-500 text-sm font-bold">Calculating…</span>
                                </div>
                            ) : (
                                <>
                                    <span className="text-6xl font-black text-slate-900 dark:text-white tabular-nums">
                                        {activePeopleCount !== null ? activePeopleCount.toLocaleString() : '—'}
                                    </span>
                                    <span className="text-sm font-bold text-slate-400 dark:text-slate-500">people</span>
                                </>
                            )}
                        </div>
                        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                            Active in the last <strong className="text-slate-700 dark:text-slate-300">{ACTIVE_WINDOW_DAYS} days</strong>
                        </p>

                        {/* Activity signal pills */}
                        <div className="flex flex-wrap gap-2 mt-3 justify-center md:justify-start">
                            {[
                                { icon: '💸', label: 'Gave' },
                                { icon: '🎸', label: 'Served' },
                                { icon: '✅', label: 'Checked In' },
                                { icon: '👥', label: 'Attended a Group' },
                            ].map(({ icon, label }) => (
                                <span
                                    key={label}
                                    className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px] font-bold"
                                >
                                    {icon} {label}
                                </span>
                            ))}
                        </div>

                        {lastCalculatedLabel && !isCalculating && (
                            <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-3 font-mono">
                                Last updated: {lastCalculatedLabel}
                            </p>
                        )}
                    </div>

                    {/* Recalculate button */}
                    <div className="flex-shrink-0">
                        <button
                            onClick={() => handleRecalculate(false)}
                            disabled={isCalculating}
                            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed text-white px-6 py-3 rounded-xl font-black text-[10px] uppercase tracking-widest transition-all shadow-lg shadow-indigo-200 dark:shadow-indigo-900/40"
                        >
                            {isCalculating ? (
                                <>
                                    <div className="w-3.5 h-3.5 rounded-full border-2 border-white/40 border-t-white animate-spin" />
                                    Calculating…
                                </>
                            ) : (
                                <>
                                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" strokeWidth={2.5} viewBox="0 0 24 24">
                                        <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182m0-4.991v4.99" />
                                    </svg>
                                    Recalculate
                                </>
                            )}
                        </button>
                    </div>
                </div>
            </div>

            {/* Trial Banner */}
            {isTrialActive && (
                <div className="bg-gradient-to-r from-violet-500 to-indigo-600 p-8 rounded-[2rem] text-white shadow-xl relative overflow-hidden">
                    <div className="relative z-10 flex flex-col md:flex-row justify-between items-center gap-6">
                        <div>
                            <h4 className="text-xl font-black">You are on the Free Trial!</h4>
                            <p className="text-white/80 text-sm mt-1 max-w-lg">
                                Enjoy unlimited access to all features for the next {daysLeftInTrial} days.
                                Upgrade anytime to keep your data and access.
                            </p>
                        </div>
                        <div className="bg-white/20 px-6 py-3 rounded-xl backdrop-blur-sm border border-white/10">
                            <span className="block text-[10px] font-bold uppercase tracking-widest opacity-80">Expires On</span>
                            <span className="text-lg font-black">{new Date(trialEndsAt).toLocaleDateString()}</span>
                        </div>
                    </div>
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl" />
                </div>
            )}

            {/* Plan Comparison Grid */}
            {(!currentPlanId || showUpgrade) && (
                <div>
                    {currentPlanId && showUpgrade && (
                        <p className="text-xs font-bold text-slate-500 dark:text-slate-400 uppercase tracking-widest mb-4 text-center">
                            Select a new plan — Stripe will handle proration automatically
                        </p>
                    )}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-2">
                        {PLANS.map((plan) => {
                            const isRecommended = plan.id === 'growth';
                            const isCurrent = plan.id === currentPlanId;
                            const isUpgrade = currentPlan ? plan.price > currentPlan.price : false;
                            const isDowngrade = currentPlan ? plan.price < currentPlan.price : false;

                            return (
                                <div
                                    key={plan.id}
                                    className={`relative p-8 rounded-[2.5rem] border flex flex-col transition-all duration-300 ${
                                        isCurrent
                                            ? 'bg-slate-900 dark:bg-slate-800 text-white border-slate-900 dark:border-slate-700 shadow-2xl scale-105 z-10'
                                            : isRecommended && !currentPlanId
                                            ? 'bg-slate-900 dark:bg-slate-800 text-white border-slate-900 dark:border-slate-700 shadow-2xl scale-105 z-10'
                                            : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm hover:border-indigo-100 dark:hover:border-slate-700'
                                    }`}
                                >
                                    {isCurrent && (
                                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-emerald-500 to-teal-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                                            Current Plan
                                        </div>
                                    )}
                                    {!isCurrent && isRecommended && !currentPlanId && (
                                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                                            Most Popular
                                        </div>
                                    )}
                                    {!isCurrent && isUpgrade && (
                                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                                            ⬆ Upgrade
                                        </div>
                                    )}
                                    {!isCurrent && isDowngrade && (
                                        <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-slate-600 text-slate-200 text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-md">
                                            ⬇ Downgrade
                                        </div>
                                    )}

                                    <div className="mb-6">
                                        <h4 className={`text-lg font-black ${isCurrent || (isRecommended && !currentPlanId) ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{plan.name}</h4>
                                        <div className="flex items-baseline gap-1 mt-2">
                                            <span className={`text-4xl font-black ${isCurrent || (isRecommended && !currentPlanId) ? 'text-white' : 'text-slate-900 dark:text-white'}`}>${plan.price}</span>
                                            <span className={`text-xs font-bold ${isCurrent || (isRecommended && !currentPlanId) ? 'text-slate-400' : 'text-slate-400 dark:text-slate-500'}`}>/ {plan.interval}</span>
                                        </div>
                                    </div>

                                    <ul className="space-y-3 mb-8 flex-1">
                                        {plan.features.map((feature, i) => (
                                            <li key={i} className="flex items-start gap-3 text-xs font-medium">
                                                <span className={`mt-0.5 ${isCurrent || (isRecommended && !currentPlanId) ? 'text-emerald-400' : 'text-emerald-500'}`}>✓</span>
                                                <span className={`${isCurrent || (isRecommended && !currentPlanId) ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>{feature}</span>
                                            </li>
                                        ))}
                                    </ul>

                                    <button
                                        onClick={() => !isCurrent && handleSubscribe(plan.id)}
                                        disabled={!!processingPlanId || isCurrent}
                                        className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                                            isCurrent
                                                ? 'bg-white/20 text-white cursor-default opacity-60'
                                                : isUpgrade
                                                ? 'bg-gradient-to-r from-indigo-500 to-violet-500 text-white hover:opacity-90 shadow-lg'
                                                : isDowngrade
                                                ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300 hover:bg-slate-300 dark:hover:bg-slate-600'
                                                : isCurrent || (isRecommended && !currentPlanId)
                                                ? 'bg-white text-slate-900 hover:bg-indigo-50'
                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
                                        } ${processingPlanId && processingPlanId !== plan.id ? 'opacity-50' : ''}`}
                                    >
                                        {getPlanButtonLabel(plan)}
                                    </button>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Active Subscription summary — only shown when upgrade grid is hidden */}
            {currentPlanId && !showUpgrade && (
                <div className="bg-slate-50 dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 text-center transition-colors">
                    <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                        💎
                    </div>
                    <p className="text-xl font-black text-slate-900 dark:text-white mb-2">Active Subscription</p>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-md mx-auto">
                        Your organization has full access to premium features. Click <strong>Change Plan</strong> above to switch tiers, or use the <strong>Billing Portal</strong> to manage payment methods and invoices.
                    </p>
                </div>
            )}

            <div className="bg-slate-50 dark:bg-slate-900 p-6 rounded-3xl border border-slate-100 dark:border-slate-800 text-center transition-colors">
                <p className="text-[10px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Secure Payment Processing</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                    Payments are processed securely by Stripe. We do not store your credit card information.
                    <br/>Have a coupon code? You can apply it on the checkout page.
                </p>
            </div>
        </div>
    );
};
