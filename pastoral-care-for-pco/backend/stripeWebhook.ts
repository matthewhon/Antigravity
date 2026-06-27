
import Stripe from 'stripe';
import { getDb } from './firebase';
import { sgSend } from './sendEmail';
import { resolveEmailProvider } from './emailProvider.js';

// ─── Stripe Plan metadata ──────────────────────────────────────────────────────
const PLAN_NAMES: Record<string, string> = {
    starter: 'Starter',
    growth:  'Growth',
    kingdom: 'Kingdom',
};
const PLAN_PRICES: Record<string, string> = {
    starter: '$49/mo',
    growth:  '$99/mo',
    kingdom: '$199/mo',
};

// ─── Branded receipt HTML ──────────────────────────────────────────────────────

function buildReceiptHtml(opts: {
    churchName: string;
    planName: string;
    planPrice: string;
    amount: string;         // e.g. "$49.00"
    invoiceNumber: string;
    periodStart: string;    // formatted date string
    periodEnd: string;      // formatted date string
    invoiceUrl: string;     // Stripe-hosted PDF URL
}): string {
    const { churchName, planName, planPrice, amount, invoiceNumber, periodStart, periodEnd, invoiceUrl } = opts;
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:40px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;text-align:center;">
            <div style="font-size:28px;margin-bottom:8px;">✅</div>
            <div style="font-size:22px;font-weight:900;color:#ffffff;letter-spacing:-0.5px;">Payment Confirmed</div>
            <div style="font-size:14px;color:#c4b5fd;margin-top:6px;">Pastoral Care for PCO – Subscription Receipt</div>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:36px 40px;">

            <p style="margin:0 0 24px;font-size:15px;color:#334155;line-height:1.6;">
              Hi <strong>${churchName}</strong>, thank you for your subscription! Your payment was processed successfully.
            </p>

            <!-- Receipt box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;margin-bottom:28px;">
              <tr>
                <td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Plan</td>
                      <td align="right" style="font-size:15px;font-weight:800;color:#1e293b;">${planName} — ${planPrice}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Billing Period</td>
                      <td align="right" style="font-size:14px;color:#334155;">${periodStart} – ${periodEnd}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;border-bottom:1px solid #e2e8f0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:13px;font-weight:700;color:#64748b;text-transform:uppercase;letter-spacing:0.5px;">Invoice #</td>
                      <td align="right" style="font-size:14px;color:#334155;font-family:monospace;">${invoiceNumber}</td>
                    </tr>
                  </table>
                </td>
              </tr>
              <tr>
                <td style="padding:20px 24px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td style="font-size:16px;font-weight:900;color:#0f172a;">Total Charged</td>
                      <td align="right" style="font-size:22px;font-weight:900;color:#4f46e5;">${amount}</td>
                    </tr>
                  </table>
                </td>
              </tr>
            </table>

            <!-- Download button -->
            <div style="text-align:center;margin-bottom:28px;">
              <a href="${invoiceUrl}" target="_blank" style="display:inline-block;background:#4f46e5;color:#ffffff;font-size:14px;font-weight:700;padding:14px 32px;border-radius:10px;text-decoration:none;letter-spacing:0.2px;">
                📄 View & Download Invoice
              </a>
            </div>

            <p style="margin:0;font-size:13px;color:#94a3b8;text-align:center;line-height:1.6;">
              Questions about your subscription? Reply to this email or visit<br>
              <a href="https://pastoralcare.barnabassoftware.com" style="color:#6366f1;">pastoralcare.barnabassoftware.com</a>
            </p>

          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:20px 40px;text-align:center;">
            <p style="margin:0;font-size:11px;color:#94a3b8;">
              Barnabas Software LLC · Pastoral Care for PCO<br>
              This is an automated payment receipt. Please keep it for your records.
            </p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

// ─── Webhook Handler ───────────────────────────────────────────────────────────

export const handleStripeWebhook = async (req: any, res: any) => {
    const db = getDb();
    const sig = req.headers['stripe-signature'];

    // Fetch settings to get keys
    const settingsDoc = await db.doc('system/settings').get();
    const settings = settingsDoc.data() || {};

    // TRIM KEY to prevent whitespace errors
    const secretKey = settings.stripeSecretKey ? settings.stripeSecretKey.trim() : '';

    if (!secretKey) {
        console.error("Stripe Secret Key missing in settings");
        res.status(500).send("Configuration Error");
        return;
    }

    const stripe = new Stripe(secretKey, {
        apiVersion: '2023-10-16' as any,
    });

    const endpointSecret = settings.stripeWebhookSecret ? settings.stripeWebhookSecret.trim() : '';

    if (!endpointSecret) {
        console.error("Stripe Webhook Secret not found in system/settings");
        res.status(500).send("Webhook configuration missing");
        return;
    }

    let event: Stripe.Event;

    // express.raw() puts the raw Buffer into req.body — NOT req.rawBody
    const rawBody = req.body;
    if (!rawBody || !sig) {
        console.error('[StripeWebhook] Missing raw body or stripe-signature header');
        res.status(400).send('Webhook Error: No webhook payload was provided.');
        return;
    }

    try {
        event = stripe.webhooks.constructEvent(rawBody, sig, endpointSecret);
    } catch (err: any) {
        console.error(`Webhook Error: ${err.message}`);
        res.status(400).send(`Webhook Error: ${err.message}`);
        return;
    }

    // Handle the event
    switch (event.type) {

        // ── New subscription via Checkout ─────────────────────────────────────
        case 'checkout.session.completed': {
            const session = event.data.object as Stripe.Checkout.Session;
            const churchId = session.client_reference_id;

            if (churchId && session.subscription) {
                console.log(`[StripeWebhook] checkout.session.completed for church: ${churchId}`);

                const subscriptionId = session.subscription as string;
                const subscription = await stripe.subscriptions.retrieve(subscriptionId);
                const planId = session.metadata?.planId || 'growth';

                await db.collection('churches').doc(churchId).update({
                    subscription: {
                        status: 'active',
                        planId,
                        subscriptionId,
                        currentPeriodEnd: (subscription as any).current_period_end * 1000,
                        customerId: session.customer as string,
                    }
                });
            }
            break;
        }

        // ── Monthly invoice paid → send receipt ───────────────────────────────
        case 'invoice.paid': {
            const invoice = event.data.object as Stripe.Invoice;

            // Only send for subscription invoices (not one-off)
            if (!(invoice as any).subscription) break;

            try {
                const customerId = typeof invoice.customer === 'string'
                    ? invoice.customer
                    : (invoice.customer as any)?.id;

                if (!customerId) break;

                // Find the church by customerId
                const churchSnap = await db.collection('churches')
                    .where('subscription.customerId', '==', customerId)
                    .limit(1)
                    .get();

                if (churchSnap.empty) {
                    console.warn(`[StripeWebhook] invoice.paid: no church found for customer ${customerId}`);
                    break;
                }

                const churchDoc = churchSnap.docs[0];
                const church = churchDoc.data();
                const churchName = church.name || 'Your Church';
                const planId = church.subscription?.planId || 'growth';

                // Get the billing admin's email — use the customer email on the invoice first
                const customerEmail = invoice.customer_email ||
                    (typeof invoice.customer === 'object' ? (invoice.customer as any)?.email : null);

                // Fallback: find the church admin user
                let toEmail = customerEmail;
                if (!toEmail) {
                    const adminSnap = await db.collection('users')
                        .where('churchId', '==', churchDoc.id)
                        .where('role', '==', 'Church Admin')
                        .limit(1)
                        .get();
                    if (!adminSnap.empty) toEmail = adminSnap.docs[0].data().email;
                }

                if (!toEmail) {
                    console.warn(`[StripeWebhook] invoice.paid: no email found for church ${churchDoc.id}`);
                    break;
                }

                // Format amounts and dates
                const amountPaid = `$${(invoice.amount_paid / 100).toFixed(2)}`;
                const fmt = (ts: number) => new Date(ts * 1000).toLocaleDateString('en-US', {
                    month: 'long', day: 'numeric', year: 'numeric'
                });
                const periodStart = fmt((invoice as any).period_start || invoice.created);
                const periodEnd   = fmt((invoice as any).period_end   || invoice.created + 30 * 86400);
                const invoiceUrl  = (invoice as any).hosted_invoice_url || 'https://billing.stripe.com';
                const invoiceNum  = invoice.number || invoice.id;

                const planName  = PLAN_NAMES[planId]  || 'Premium';
                const planPrice = PLAN_PRICES[planId] || '';

                // Get email config from system settings (provider-aware)
                const emailProvider = settings.emailProvider || 'sendgrid';
                const sgKey      =
                    emailProvider === 'postmark'
                        ? (settings.postmarkApiKey || '').trim()
                        : (settings.sendGridApiKey || '').trim();
                const fromEmail  =
                    emailProvider === 'postmark'
                        ? (settings.postmarkFromEmail || 'noreply@barnabassoftware.com').trim()
                        : (settings.sendGridFromEmail || 'noreply@barnabassoftware.com').trim();
                const fromName   =
                    emailProvider === 'postmark'
                        ? (settings.postmarkFromName  || 'Pastoral Care for PCO').trim()
                        : (settings.sendGridFromName  || 'Pastoral Care for PCO').trim();

                if (!sgKey) {
                    console.warn('[StripeWebhook] invoice.paid: Email provider not configured, skipping receipt email');
                    break;
                }

                const html = buildReceiptHtml({
                    churchName, planName, planPrice,
                    amount: amountPaid,
                    invoiceNumber: invoiceNum,
                    periodStart, periodEnd,
                    invoiceUrl,
                });

                const provider = await resolveEmailProvider(db);

                // For Postmark, system-level emails need a Server token (the Account
                // token cannot send mail). Use the church's tenant token if available,
                // or fetch the first server's token from the Postmark account.
                let systemTenantToken: string | undefined;
                if (emailProvider === 'postmark') {
                    // Try using the church's existing server token
                    systemTenantToken = church.emailSettings?.postmarkServerToken;
                    if (!systemTenantToken) {
                        // Fallback: fetch the first server from the Postmark account
                        try {
                            const listRes = await fetch('https://api.postmarkapp.com/servers?count=1&offset=0', {
                                headers: {
                                    'X-Postmark-Account-Token': sgKey,
                                    Accept: 'application/json',
                                },
                            });
                            if (listRes.ok) {
                                const listData = await listRes.json();
                                const firstServer = listData.Servers?.[0];
                                if (firstServer) {
                                    const detailRes = await fetch(`https://api.postmarkapp.com/servers/${firstServer.ID}`, {
                                        headers: {
                                            'X-Postmark-Account-Token': sgKey,
                                            Accept: 'application/json',
                                        },
                                    });
                                    if (detailRes.ok) {
                                        const detail = await detailRes.json();
                                        systemTenantToken = detail.ApiTokens?.[0] || undefined;
                                    }
                                }
                            }
                        } catch (e) {
                            console.warn('[StripeWebhook] Could not fetch Postmark server token for receipt:', e);
                        }
                    }
                }

                await provider.send([{
                    to:      toEmail,
                    from:    { email: fromEmail, name: fromName },
                    subject: `✅ Receipt: ${planName} Plan — ${amountPaid} – Pastoral Care for PCO`,
                    html,
                }], {
                    apiKey: sgKey,
                    tenantToken: systemTenantToken,
                    stream: 'transactional',
                });

                console.log(`[StripeWebhook] Receipt sent to ${toEmail} for church ${churchDoc.id} (${planName}, ${amountPaid})`);

            } catch (receiptErr: any) {
                // Don't fail the webhook — Stripe needs a 200 back regardless
                console.error('[StripeWebhook] Failed to send receipt email:', receiptErr?.message || receiptErr);
            }
            break;
        }

        // ── Subscription renewed / plan changed ───────────────────────────────
        case 'customer.subscription.updated': {
            const subscription = event.data.object as Stripe.Subscription;
            const churchesSnapshot = await db.collection('churches')
                .where('subscription.customerId', '==', subscription.customer)
                .limit(1)
                .get();

            if (!churchesSnapshot.empty) {
                const churchDoc = churchesSnapshot.docs[0];

                // ── Resolve planId from subscription items ──────────────────────
                // The priceIds map in Firestore is { planId → stripePrice }.
                // We build a reverse map { stripePrice → planId } to resolve the current plan.
                const priceMap: Record<string, string> = settings.stripePriceIds || {};
                const reversePriceMap: Record<string, string> = {};
                for (const [pid, priceId] of Object.entries(priceMap)) {
                    if (typeof priceId === 'string') reversePriceMap[priceId] = pid;
                }

                const addonPriceId: string = (priceMap.smsAddon || '').trim();
                let resolvedPlanId: string | null = null;
                let addonQuantity: number = 0;

                for (const item of subscription.items.data) {
                    const itemPriceId = item.price.id;
                    if (addonPriceId && itemPriceId === addonPriceId) {
                        // This item is the SMS add-on
                        addonQuantity = item.quantity ?? 0;
                    } else if (reversePriceMap[itemPriceId]) {
                        // This item is a plan price
                        resolvedPlanId = reversePriceMap[itemPriceId];
                    }
                }

                const updatePayload: Record<string, any> = {
                    'subscription.status':           subscription.status,
                    'subscription.currentPeriodEnd': (subscription as any).current_period_end * 1000,
                };

                // Only update planId if we successfully resolved it (prevents wiping it on
                // unrecognised price IDs like coupon adjustments or usage-based items).
                if (resolvedPlanId) {
                    updatePayload['subscription.planId'] = resolvedPlanId;
                    console.log(`[StripeWebhook] Synced planId=${resolvedPlanId} for ${churchDoc.id}`);
                }

                // Always sync add-on quantity (0 if the item is not present)
                updatePayload['smsAddOns.quantity'] = addonQuantity;
                if (addonQuantity === 0) {
                    updatePayload['smsAddOns.stripeItemId'] = null;
                } else {
                    // Store the Stripe item ID for future update calls
                    const addonItem = subscription.items.data.find(i => i.price.id === addonPriceId);
                    if (addonItem) updatePayload['smsAddOns.stripeItemId'] = addonItem.id;
                }

                await churchDoc.ref.update(updatePayload);
                console.log(`[StripeWebhook] Updated subscription for ${churchDoc.id}: status=${subscription.status}, addOns=${addonQuantity}`);
            }
            break;
        }

        // ── Subscription cancelled ────────────────────────────────────────────
        case 'customer.subscription.deleted': {
            const subscription = event.data.object as Stripe.Subscription;
            const churchesSnapshot = await db.collection('churches')
                .where('subscription.customerId', '==', subscription.customer)
                .limit(1)
                .get();

            if (!churchesSnapshot.empty) {
                const churchDoc = churchesSnapshot.docs[0];
                await churchDoc.ref.update({
                    'subscription.status':          'canceled',
                    'subscription.currentPeriodEnd': Date.now(),
                });
                console.log(`[StripeWebhook] Subscription canceled for church ${churchDoc.id}`);
            }
            break;
        }

        default:
            console.log(`[StripeWebhook] Unhandled event type: ${event.type}`);
    }

    res.json({ received: true });
};
