
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { firestore } from './firestoreService';

// Updated Default based on provided Cloud Run URL
const DEFAULT_API_BASE_URL = 'https://pastoral-care-for-pco-ejvpnqnz4q-uc.a.run.app';

const STRIPE_CUSTOMER_PORTAL_URL = 'https://billing.stripe.com/p/login/aFaeVd88p7aq6mda7acjS00'; 

export const PLANS = [
    {
        id: 'starter',
        name: 'Starter',
        price: 39,
        interval: 'month',
        features: ['5 Users', 'Up to 200 Active People', 'Basic Analytics', 'People & Groups Sync', 'Census Integration', 'Financial Insights', 'Email (5,000/mo)'],
        maxUsers: 5,
        maxActivePeople: 200,
        /** Maximum outbound emails per calendar month. */
        maxEmailsPerMonth: 5000,
    },
    {
        id: 'growth',
        name: 'Growth',
        price: 69,
        interval: 'month',
        features: [
            '10 Users',
            'Up to 401 Active People',
            'Advanced Analytics',
            'Financial Insights',
            'Pastor AI Assistant',
            'Census Integration',
            'Polls & Workflows',
            'QR Codes',
            'SMS (1,500 msg/mo · 2 numbers · MMS=2)',
            'Custom Domain Email',
        ],
        maxUsers: 10,
        maxActivePeople: 401,
        /** Maximum outbound emails per calendar month. */
        maxEmailsPerMonth: 5000,
        /** Maximum outbound SMS segments per calendar month. MMS counts as 2 segments. */
        maxSmsPerMonth: 1500,
        /** Maximum provisioned phone numbers. Grandfathered churches with more are not affected. */
        maxSmsNumbers: 2,
    },
    {
        id: 'kingdom',
        name: 'Kingdom',
        price: 199,
        interval: 'month',
        features: ['Everything in Growth', 'Custom Metrics', 'Dedicated Support', 'Multi-Site Data', 'Advanced Risk Profiling'],
        maxUsers: 99999,
        maxActivePeople: Infinity,
    }
];

class StripeService {
    private stripePromise: Promise<Stripe | null> | null = null;

    /**
     * Lazily loads Stripe with the key from System Settings.
     */
    private async getStripe(): Promise<Stripe | null> {
        if (this.stripePromise) return this.stripePromise;

        try {
            const settings = await firestore.getSystemSettings();
            // TRIM KEY to prevent whitespace errors
            const key = settings.stripePublishableKey ? settings.stripePublishableKey.trim() : '';

            if (!key) {
                console.error("Stripe Publishable Key is missing in System Settings.");
                return null;
            }

            this.stripePromise = loadStripe(key);
            return this.stripePromise;
        } catch (e) {
            console.error("Failed to load Stripe configuration", e);
            return null;
        }
    }

    private async getApiUrl(): Promise<string> {
        const settings = await firestore.getSystemSettings();
        const url = settings.apiBaseUrl || DEFAULT_API_BASE_URL;
        return url;
    }

    /**
     * Initiates the Stripe Checkout flow.
     * Calls the backend to create a session, then redirects the user.
     */
    async createCheckoutSession(churchId: string, planId: string, userEmail?: string): Promise<void> {
        const stripe = await this.getStripe();
        
        if (!stripe) {
            throw new Error("Stripe is not configured. Please check App Settings.");
        }

        const baseUrl = await this.getApiUrl();
        console.log(`Connecting to payment backend at: ${baseUrl}/createCheckoutSession`);
        
        // Call your backend to create the Checkout Session
        const response = await fetch(`${baseUrl}/createCheckoutSession`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                churchId,
                planId,
                email: userEmail,
                returnUrl: window.location.origin // Dynamic return URL
            }),
        });

        // Read the raw text first — if the server returns an HTML error page
        // (e.g. a missing route returning the SPA index.html), JSON.parse will
        // produce a cryptic "unexpected character" error.  We surface it cleanly.
        const rawText = await response.text();
        let responseData: any = {};
        try { responseData = JSON.parse(rawText); } catch {
            throw new Error(
                `Payment server returned an unexpected response (HTTP ${response.status}).\n` +
                `This usually means the /createCheckoutSession endpoint is not reachable.\n` +
                `Raw response (first 200 chars): ${rawText.slice(0, 200)}`
            );
        }

        if (!response.ok) {
            throw new Error(responseData.message || `Payment server error: ${response.status}`);
        }

        const { sessionId } = responseData;
        if (!sessionId) {
            throw new Error('Payment server did not return a session ID. Check server logs.');
        }


        // Redirect to Stripe Checkout
        const result = await (stripe as any).redirectToCheckout({
            sessionId,
        });

        if (result.error) {
            throw new Error(result.error.message);
        }
    }

    async openCustomerPortal(churchId: string): Promise<void> {
        window.open(STRIPE_CUSTOMER_PORTAL_URL, '_blank');
    }

    async cancelSubscription(churchId: string): Promise<void> {
        if (!window.confirm("Are you sure you want to cancel? You will lose access to premium features immediately.")) return;
        
        const baseUrl = await this.getApiUrl();
        console.log(`Connecting to payment backend at: ${baseUrl}/cancelSubscription`);

        const response = await fetch(`${baseUrl}/cancelSubscription`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ churchId })
        });

        if (!response.ok) {
            throw new Error("Failed to cancel subscription via payment provider.");
        }

        // Optimistic update for UI responsiveness
        await firestore.updateChurch(churchId, {
            subscription: {
                status: 'canceled',
                planId: 'canceled',
                currentPeriodEnd: Date.now()
            }
        });
        alert("Subscription canceled.");
        window.location.reload();
    }

    /**
     * Adds one SMS add-on unit (+$20/mo, +1 number, +1,500 SMS) to a Growth plan subscription.
     * Charges apply to the next invoice (no immediate proration).
     */
    async purchaseSmsAddon(churchId: string): Promise<{ quantity: number; maxSmsPerMonth: number; maxSmsNumbers: number; message: string }> {
        const baseUrl = await this.getApiUrl();
        const response = await fetch(`${baseUrl}/api/billing/add-sms-addon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ churchId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Add-on purchase failed (HTTP ${response.status})`);
        return data;
    }

    /**
     * Removes one SMS add-on unit from a Growth plan subscription.
     * Change applies to the next invoice (no immediate credit).
     */
    async removeSmsAddon(churchId: string): Promise<{ quantity: number; maxSmsPerMonth: number; maxSmsNumbers: number; message: string }> {
        const baseUrl = await this.getApiUrl();
        const response = await fetch(`${baseUrl}/api/billing/remove-sms-addon`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ churchId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Add-on removal failed (HTTP ${response.status})`);
        return data;
    }
}

export const stripeService = new StripeService();

/**
 * Compute effective SMS limits for a church, incorporating any purchased add-ons.
 * Returns the base plan limits when no add-ons are active.
 */
export function getEffectiveSmsLimits(church: { subscription?: { planId?: string }; smsAddOns?: { quantity?: number } }): {
    maxSmsPerMonth: number;
    maxSmsNumbers: number;
} {
    const planId = church.subscription?.planId || '';
    const plan = PLANS.find(p => p.id === planId);
    const baseSms     = (plan as any)?.maxSmsPerMonth  ?? Infinity;
    const baseNumbers = (plan as any)?.maxSmsNumbers   ?? Infinity;
    const addOnQty    = church.smsAddOns?.quantity ?? 0;
    return {
        maxSmsPerMonth: isFinite(baseSms)     ? baseSms     + addOnQty * 1500 : Infinity,
        maxSmsNumbers:  isFinite(baseNumbers) ? baseNumbers + addOnQty        : Infinity,
    };
}

/** SMS Add-On product metadata (for display in the UI). */
export const SMS_ADDON = {
    pricePerMonth: 20,
    smsPerAddon:   1500,
    numbersPerAddon: 1,
    maxAddons:     8,
    maxTotalNumbers: 10,
} as const;
