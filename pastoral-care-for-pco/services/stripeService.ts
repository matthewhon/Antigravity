
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
        features: [
            '5 Users',
            'Up to 200 Active People',
            'Basic Analytics',
            'People & Groups Sync',
            'Census Integration',
            'Financial Insights',
            'Email ($3 / 1,000 emails)',
        ],
        maxUsers: 5,
        maxActivePeople: 200,
        maxSmsNumbers: 0,
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
            'SMS & MMS (2 numbers · pay-as-you-go)',
            'Email ($3 / 1,000 emails · Custom Domain)',
        ],
        maxUsers: 10,
        maxActivePeople: 401,
        /** Maximum provisioned phone numbers. Grandfathered churches with more are not affected. */
        maxSmsNumbers: 2,
    },
    {
        id: 'kingdom',
        name: 'Kingdom',
        price: 199,
        interval: 'month',
        features: [
            'Everything in Growth',
            'Unlimited Active People & Users',
            'SMS & MMS (Unlimited numbers · pay-as-you-go)',
            'Email ($3 / 1,000 emails · Custom Domain)',
            'Custom Metrics',
            'Dedicated Support',
            'Multi-Site Data',
            'Advanced Risk Profiling',
        ],
        maxUsers: 99999,
        maxActivePeople: Infinity,
        maxSmsNumbers: Infinity,
    }
];

/** Default pay-as-you-go customer pricing constants (SignalWire cost + 20% markup, $3/1k email). */
export const USAGE_PRICING = {
    smsOutboundCostUsd: 0.0079,
    smsInboundCostUsd: 0.00715,
    mmsOutboundCostUsd: 0.0280,
    mmsInboundCostUsd: 0.0150,
    smsMarkupPercent: 20,
    smsOutboundPriceUsd: 0.00948,
    smsInboundPriceUsd: 0.00858,
    mmsOutboundPriceUsd: 0.0336,
    mmsInboundPriceUsd: 0.0180,
    emailBlockPriceUsd: 3.00,
    emailBlockSize: 1000,
} as const;

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

        const { sessionId, upgraded } = responseData;
        if (upgraded) {
            window.location.search = '?success=true';
            return;
        }
        if (!sessionId) {
            throw new Error(responseData.message || 'Payment server did not return a session ID. Check server logs.');
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
 * Compute effective SMS limits for a church.
 * SMS/MMS messages are pay-as-you-go (unlimited), while phone numbers are capped per plan.
 */
export function getEffectiveSmsLimits(church: { subscription?: { planId?: string }; smsAddOns?: { quantity?: number } }): {
    maxSmsPerMonth: number;
    maxSmsNumbers: number;
} {
    const planId = church.subscription?.planId || '';
    const plan = PLANS.find(p => p.id === planId);
    const baseNumbers = (plan as any)?.maxSmsNumbers ?? Infinity;
    return {
        maxSmsPerMonth: Infinity,
        maxSmsNumbers: baseNumbers,
    };
}
