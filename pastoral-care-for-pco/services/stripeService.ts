
import { loadStripe, Stripe } from '@stripe/stripe-js';
import { firestore } from './firestoreService';

// Updated Default based on provided Cloud Run URL
const DEFAULT_API_BASE_URL = 'https://pastoral-care-for-pco-ejvpnqnz4q-uc.a.run.app';

const STRIPE_CUSTOMER_PORTAL_URL = 'https://billing.stripe.com/p/login/aFaeVd88p7aq6mda7acjS00'; 

export const PLANS = [
    {
        id: 'starter',
        name: 'Starter',
        price: 49,
        interval: 'month',
        features: ['5 Users', 'Basic Analytics', 'People & Groups Sync', 'Weekly Email Reports', 'Census Integration', 'Financial Insights'],
        maxUsers: 5
    },
    {
        id: 'growth',
        name: 'Growth',
        price: 99,
        interval: 'month',
        features: ['Unlimited Users', 'Advanced Analytics', 'Financial Insights', 'Pastor AI Assistant', 'Census Integration'],
        maxUsers: 99999
    },
    {
        id: 'kingdom',
        name: 'Kingdom',
        price: 199,
        interval: 'month',
        features: ['Everything in Growth', 'Custom Metrics', 'Dedicated Support', 'Multi-Site Data', 'Advanced Risk Profiling'],
        maxUsers: 99999
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

        if (!response.ok) {
            const errorData = await response.json().catch(() => ({}));
            throw new Error(errorData.message || `Payment server error: ${response.status}`);
        }

        const { sessionId } = await response.json();

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
}

export const stripeService = new StripeService();
