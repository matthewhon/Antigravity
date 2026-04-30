
import React, { useState, useEffect } from 'react';
import { Church } from '../types';
import { PLANS, stripeService } from '../services/stripeService';
import { auth } from '../services/firebase';

interface SubscriptionSettingsViewProps {
    church: Church;
    onUpdateChurch: (updates: Partial<Church>) => void;
}

export const SubscriptionSettingsView: React.FC<SubscriptionSettingsViewProps> = ({ church, onUpdateChurch }) => {
    const [isManaging, setIsManaging] = useState(false);
    const [processingPlanId, setProcessingPlanId] = useState<string | null>(null);
    const [statusMessage, setStatusMessage] = useState<{type: 'success'|'error', text: string} | null>(null);

    const currentPlanId = church.subscription?.status === 'active' ? church.subscription.planId : null;
    const isPastDue = church.subscription?.status === 'past_due';
    
    // Check trial status
    const now = Date.now();
    const trialEndsAt = church.trialEndsAt || 0;
    const isTrialActive = !currentPlanId && trialEndsAt > now;
    const daysLeftInTrial = isTrialActive ? Math.ceil((trialEndsAt - now) / (1000 * 60 * 60 * 24)) : 0;

    // Handle return from Stripe
    useEffect(() => {
        const query = new URLSearchParams(window.location.search);
        if (query.get('success')) {
            setStatusMessage({ type: 'success', text: 'Subscription successful! Your account has been upgraded.' });
            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
            // Optimistic update might happen here if webhook hasn't fired yet
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
            // Redirection happens inside service
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
            // State update handled in service via optimistic update + webhook will confirm
        } finally {
            setIsManaging(false);
        }
    };

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
                                {isPastDue ? 'Past Due' : `${PLANS.find(p => p.id === currentPlanId)?.name || 'Premium'} Plan`}
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
                    {church.subscription?.currentPeriodEnd && currentPlanId && (
                        <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-2 font-mono">
                            Renews: {new Date(church.subscription.currentPeriodEnd).toLocaleDateString()}
                        </p>
                    )}
                </div>
                
                {currentPlanId && (
                    <div className="flex gap-3">
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
                    {/* Decorative Elements */}
                    <div className="absolute top-0 right-0 w-64 h-64 bg-white/10 rounded-full -translate-y-1/2 translate-x-1/4 blur-3xl"></div>
                </div>
            )}

            {/* Custom Pricing Grid */}
            {!currentPlanId && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 my-8">
                    {PLANS.map((plan) => {
                        const isRecommended = plan.id === 'growth';
                        return (
                            <div 
                                key={plan.id}
                                className={`relative p-8 rounded-[2.5rem] border flex flex-col transition-all duration-300 ${isRecommended ? 'bg-slate-900 dark:bg-slate-800 text-white border-slate-900 dark:border-slate-700 shadow-2xl scale-105 z-10' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 shadow-sm hover:border-indigo-100 dark:hover:border-slate-700'}`}
                            >
                                {isRecommended && (
                                    <div className="absolute -top-4 left-1/2 -translate-x-1/2 bg-gradient-to-r from-indigo-500 to-violet-500 text-white text-[10px] font-black uppercase tracking-widest px-4 py-1.5 rounded-full shadow-lg">
                                        Most Popular
                                    </div>
                                )}
                                
                                <div className="mb-6">
                                    <h4 className={`text-lg font-black ${isRecommended ? 'text-white' : 'text-slate-900 dark:text-white'}`}>{plan.name}</h4>
                                    <div className="flex items-baseline gap-1 mt-2">
                                        <span className={`text-4xl font-black ${isRecommended ? 'text-white' : 'text-slate-900 dark:text-white'}`}>${plan.price}</span>
                                        <span className={`text-xs font-bold ${isRecommended ? 'text-slate-400' : 'text-slate-400 dark:text-slate-500'}`}>/ {plan.interval}</span>
                                    </div>
                                </div>

                                <ul className="space-y-3 mb-8 flex-1">
                                    {plan.features.map((feature, i) => (
                                        <li key={i} className="flex items-start gap-3 text-xs font-medium">
                                            <span className={`mt-0.5 ${isRecommended ? 'text-emerald-400' : 'text-emerald-500'}`}>✓</span>
                                            <span className={`${isRecommended ? 'text-slate-300' : 'text-slate-500 dark:text-slate-400'}`}>{feature}</span>
                                        </li>
                                    ))}
                                </ul>

                                <button
                                    onClick={() => handleSubscribe(plan.id)}
                                    disabled={!!processingPlanId}
                                    className={`w-full py-4 rounded-xl font-black text-xs uppercase tracking-widest transition-all ${
                                        isRecommended 
                                        ? 'bg-white text-slate-900 hover:bg-indigo-50' 
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white hover:bg-slate-200 dark:hover:bg-slate-700'
                                    } ${processingPlanId && processingPlanId !== plan.id ? 'opacity-50' : ''}`}
                                >
                                    {processingPlanId === plan.id ? 'Redirecting to Stripe...' : `Select ${plan.name}`}
                                </button>
                            </div>
                        );
                    })}
                </div>
            )}

            {/* Active Subscription View */}
            {currentPlanId && (
                 <div className="bg-slate-50 dark:bg-slate-900 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 text-center transition-colors">
                    <div className="w-16 h-16 bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center text-3xl mx-auto mb-4">
                        💎
                    </div>
                    <p className="text-xl font-black text-slate-900 dark:text-white mb-2">Active Subscription</p>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mb-6 max-w-md mx-auto">
                        Your organization has full access to premium features. Use the Billing Portal above to manage payment methods, download invoices, or change plans.
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
