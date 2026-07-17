import Stripe from 'stripe';
import { SendGridProvider } from '../sgProvider.js';
import { PostmarkProvider } from '../pmProvider.js';

// Parse command line arguments
const args = process.argv.slice(2);
const isLiveSend = args.includes('--send');
const isLiveDb = args.includes('--live-db');
const isOneOff = args.includes('--one-off');
const targetEmail = args.find(a => a.startsWith('--email='))?.split('=')[1] || 'billing@testchurch.org';

// Mock DB configuration (default)
const mockDb = {
    doc(path: string) {
        if (path === 'system/settings') {
            return {
                async get() {
                    return {
                        exists: true,
                        data() {
                            return {
                                stripeSecretKey: 'sk_test_mockStripeSecretKey123456789',
                                stripeWebhookSecret: 'whsec_mockStripeWebhookSecret123456789',
                                emailProvider: 'sendgrid',
                                sendGridApiKey: 'SG.mockSendGridApiKey123456789',
                                sendGridFromEmail: 'noreply@barnabassoftware.com',
                                sendGridFromName: 'Pastoral Care for PCO'
                            };
                        }
                    };
                }
            };
        }
        throw new Error(`mockDb: doc path "${path}" not mocked`);
    },
    collection(name: string) {
        return {
            where(field: string, op: string, val: any) {
                return this; // chainable
            },
            limit(n: number) {
                return this; // chainable
            },
            async get() {
                if (name === 'churches') {
                    return {
                        empty: false,
                        docs: [{
                            id: 'ch_mock_123',
                            data() {
                                return {
                                    name: 'Mock Test Church',
                                    subscription: {
                                        planId: 'growth',
                                        customerId: 'cus_mock_123',
                                        subscriptionId: 'sub_mock_123',
                                    }
                                };
                            }
                        }]
                    };
                }
                if (name === 'users') {
                    return {
                        empty: false,
                        docs: [{
                            id: 'usr_mock_123',
                            data() {
                                return {
                                    email: targetEmail,
                                    name: 'Mock Admin User'
                                };
                            }
                        }]
                    };
                }
                return { empty: true, docs: [] };
            }
        };
    }
};

// Set mock DB on global scope before importing firebase client and stripeWebhook
if (!isLiveDb) {
    console.log('🤖 Offline mock database enabled. Bypassing live Firestore connection.');
    (global as any).__mockDb = mockDb;
} else {
    console.log('🌐 Live Firestore database connection requested.');
}

// Dynamically import modules to allow global mockDb initialization first
const { getDb } = await import('../firebase.js');
const { handleStripeWebhook } = await import('../stripeWebhook.js');

async function runTest() {
    console.log('🏁 Starting monthly subscription receipt verification test...');
    const db = getDb();

    // 1. Fetch system settings
    const settingsDoc = await db.doc('system/settings').get();
    const settings = settingsDoc.data() || {};
    
    const stripeSecretKey = (settings.stripeSecretKey || '').trim();
    const stripeWebhookSecret = (settings.stripeWebhookSecret || '').trim();

    if (!stripeSecretKey || !stripeWebhookSecret) {
        console.error('❌ Missing stripeSecretKey or stripeWebhookSecret in Firestore system/settings.');
        process.exit(1);
    }

    console.log('✓ Resolved Stripe Secret Key and Webhook Secret');

    // 2. Fetch or mock the target customer info
    let customerId = 'cus_mock_123';
    let churchName = 'Mock Test Church';

    if (isLiveDb) {
        const activeChurches = await db.collection('churches')
            .where('subscription.customerId', '!=', null)
            .limit(1)
            .get();
        
        if (!activeChurches.empty) {
            const doc = activeChurches.docs[0];
            customerId = doc.data().subscription?.customerId || customerId;
            churchName = doc.data().name || churchName;
            console.log(`✓ Found church on database: "${churchName}" (Customer: ${customerId})`);
        } else {
            console.log('⚠ No church with subscription customerId found on database. Mocking payload.');
        }
    }

    // 3. Mock/Intercept email sending if --send is NOT specified (Dry-run mode)
    if (!isLiveSend) {
        console.log('🤖 Dry-run mode enabled. Email sending will be intercepted.');

        const printMockSend = async (messages: any[], options: any) => {
            console.log('\n--- [EMAIL DISPATCH INTERCEPTED] ---');
            console.log('Options:', JSON.stringify(options, null, 2));
            for (const msg of messages) {
                console.log(`To:      ${msg.to}`);
                console.log(`From:    ${msg.from.name} <${msg.from.email}>`);
                console.log(`Subject: ${msg.subject}`);
                console.log('Content (HTML preview - first 500 chars):');
                console.log(msg.html.substring(0, 500) + '...\n[HTML truncated]');
            }
            console.log('-------------------------------------\n');
        };

        SendGridProvider.prototype.send = printMockSend;
        PostmarkProvider.prototype.send = printMockSend;
    } else {
        console.log('⚡ LIVE SEND mode enabled. Receipts will be sent via configured provider.');
    }

    // 4. Construct mock invoice.paid payload
    const stripe = new Stripe(stripeSecretKey, { apiVersion: '2023-10-16' as any });
    
    const invoicePayload = {
        id: 'in_test_receipt_9999',
        object: 'invoice',
        amount_paid: isOneOff ? 2500 : 6900, // $25.00 vs $69.00
        customer: customerId,
        customer_email: targetEmail,
        number: 'INV-TEST-RECEIPT-2026',
        created: Math.floor(Date.now() / 1000),
        period_start: Math.floor(Date.now() / 1000),
        period_end: Math.floor(Date.now() / 1000) + (isOneOff ? 0 : 30 * 24 * 3600),
        subscription: isOneOff ? null : 'sub_test_receipt_123',
        hosted_invoice_url: 'https://invoice.stripe.com/i/acct_123/test_url',
        lines: isOneOff ? {
            data: [
                { description: 'SMS Pack Add-on (5,000 Messages)' }
            ]
        } : undefined
    };

    const webhookEvent = {
        id: 'evt_test_receipt_9999',
        object: 'event',
        api_version: '2023-10-16',
        created: Math.floor(Date.now() / 1000),
        type: 'invoice.paid',
        data: {
            object: invoicePayload
        }
    };

    const payloadString = JSON.stringify(webhookEvent);

    // 5. Generate signature header
    const signature = stripe.webhooks.generateTestHeaderString({
        payload: payloadString,
        secret: stripeWebhookSecret,
    });

    console.log('✓ Mock webhook signature generated successfully');

    // 6. Invoke handleStripeWebhook with mock req and res
    const mockReq: any = {
        headers: {
            'stripe-signature': signature
        },
        body: Buffer.from(payloadString)
    };

    let statusCalled: number | null = null;
    let sendData: any = null;

    const mockRes: any = {
        status(code: number) {
            statusCalled = code;
            return this;
        },
        send(data: any) {
            sendData = data;
            return this;
        },
        json(data: any) {
            sendData = data;
            return this;
        }
    };

    console.log('⚙ Triggering handleStripeWebhook...');
    await handleStripeWebhook(mockReq, mockRes);

    console.log(`✓ Webhook handler responded with Status: ${statusCalled || 200}, Data:`, sendData);
    console.log('🎉 Verification run complete!');
}

runTest().catch(e => {
    console.error('❌ Verification run failed with error:', e);
    process.exit(1);
});
