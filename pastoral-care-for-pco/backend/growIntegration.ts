import { getDb } from './firebase.js';
import { sgSend } from './sendEmail.js';
import { resolveEmailProvider } from './emailProvider.js';
import { createServerLogger } from '../services/logService.js';

/** Helper: generate a cryptographically-random 32-byte hex string */
function generateSecret(): string {
    const bytes = Array.from({ length: 32 }, () =>
        Math.floor(Math.random() * 256)
    );
    return bytes.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * POST /api/integrations/grow/request-access
 *
 * The Grow Application calls this endpoint to request permission to integrate
 * with a specific Pastoral Care tenant. No secret is needed at this stage —
 * the tenant admin must review and approve the request from within the
 * "Grow Integration" settings tab.
 *
 * Body: { churchId, appName }
 *
 * Responses:
 *   200 – request stored (status: pending)
 *   400 – missing required fields
 *   404 – church not found
 */
export async function requestGrowAccess(req: any, res: any) {
    const { churchId, appName } = req.body || {};

    if (!churchId || !appName) {
        return res.status(400).json({ error: 'Missing churchId or appName.' });
    }

    const db = getDb();
    const churchRef = db.collection('churches').doc(churchId);

    try {
        const doc = await churchRef.get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Church not found. Verify your churchId is correct.' });
        }

        const data = doc.data() || {};
        const existingRequest = (data as any).growSettings?.growPendingRequest;

        // If already approved, tell the Grow App immediately so it doesn't spam requests
        if (existingRequest?.status === 'approved' && (data as any).growSettings?.growIntegrationSecret) {
            return res.json({
                status: 'approved',
                message: 'This church has already approved the Grow integration.',
                // Do not return secret here — use GET /status to fetch it securely
            });
        }

        // Record the pending request
        await churchRef.update({
            'growSettings.growPendingRequest': {
                appName: String(appName).slice(0, 120),
                requestedAt: new Date().toISOString(),
                status: 'pending',
            },
        });

        return res.json({
            status: 'pending',
            message: 'Access request received. A tenant administrator will review and approve it. Poll GET /api/integrations/grow/status?churchId={churchId} to check.',
        });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
}

/**
 * GET /api/integrations/grow/status?churchId=...
 *
 * The Grow Application polls this endpoint to check whether its access request
 * has been approved by the tenant admin. On approval the shared secret is
 * returned so the Grow App can store it and begin sending emails automatically.
 *
 * Query: churchId
 *
 * Responses:
 *   200 – { status: 'pending' | 'approved' | 'rejected', secret? }
 *   400 – missing churchId
 *   404 – church not found
 */
export async function getGrowStatus(req: any, res: any) {
    const churchId = (req.query?.churchId || req.body?.churchId) as string | undefined;

    if (!churchId) {
        return res.status(400).json({ error: 'Missing churchId query parameter.' });
    }

    const db = getDb();

    try {
        const doc = await db.collection('churches').doc(churchId).get();
        if (!doc.exists) {
            return res.status(404).json({ error: 'Church not found.' });
        }

        const data = doc.data() || {};
        const growSettings = (data as any).growSettings || {};
        const pendingRequest = growSettings.growPendingRequest;

        if (!pendingRequest) {
            return res.json({ status: 'no_request', message: 'No access request on record. Submit a request first via POST /api/integrations/grow/request-access.' });
        }

        if (pendingRequest.status === 'rejected') {
            return res.json({ status: 'rejected', message: 'Your access request was rejected by the tenant administrator. Please contact them directly.' });
        }

        if (pendingRequest.status === 'approved' && growSettings.growIntegrationSecret) {
            return res.json({
                status: 'approved',
                secret: growSettings.growIntegrationSecret,
                churchId,
                endpoint: 'https://pastoralcare.barnabassoftware.com/api/integrations/grow/daily-email',
                message: 'Integration approved. Store the secret as PASTORAL_CARE_API_SECRET in your Grow App settings.',
            });
        }

        // Still pending
        return res.json({ status: 'pending', message: 'Waiting for tenant administrator approval. Check back in a few minutes.' });
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
}


export async function setupGrowIntegration(req: any, res: any) {
    const { churchId, secret, churchName } = req.body || {};

    if (!churchId) {
        return res.status(400).json({ error: 'Missing churchId.' });
    }

    const db = getDb();
    const churchRef = db.collection('churches').doc(churchId);

    try {
        const doc = await churchRef.get();

        // Determine the expected secret:
        //   1. Per-tenant growIntegrationSecret stored in Firestore (preferred)
        //   2. Global GROW_INTEGRATION_SECRET env var (fallback / initial setup)
        const churchData = doc.exists ? (doc.data() || {}) : {};
        const tenantSecret: string | undefined = (churchData as any).growSettings?.growIntegrationSecret;
        const globalSecret: string = process.env.GROW_INTEGRATION_SECRET || 'GROW_TEMP_SECRET_123';
        const expectedSecret = tenantSecret || globalSecret;

        if (secret !== expectedSecret) {
            return res.status(401).json({ error: 'Unauthorized: Invalid integration secret.' });
        }

        if (!doc.exists) {
            await churchRef.set({
                id: churchId,
                name: churchName || 'Grow Integration Church',
                createdAt: Date.now(),
                // Basic email settings
                emailSettings: {
                    mode: 'global'
                }
            });
            return res.json({ success: true, message: 'Integration setup successfully. Church document created.' });
        } else {
            return res.json({ success: true, message: 'Integration verified. Church already exists.' });
        }
    } catch (e: any) {
        return res.status(500).json({ error: e.message });
    }
}

export async function handleGrowDailyEmail(req: any, res: any) {
    const { churchId, recipients, secret } = req.body || {};

    if (!churchId || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ error: 'Missing churchId or recipients array.' });
    }

    const db = getDb();
    const log = createServerLogger(db as any);

    try {
        // 1. Fetch global email API key (provider-aware)
        const settingsSnap = await db.doc('system/settings').get();
        const settings = settingsSnap.data() || {};
        const emailProvider = settings.emailProvider || 'sendgrid';
        const globalApiKey: string =
            emailProvider === 'postmark'
                ? (settings.postmarkApiKey || '')
                : (settings.sendGridApiKey || '');
        const globalFromEmail: string =
            emailProvider === 'postmark'
                ? (settings.postmarkFromEmail || '')
                : (settings.sendGridFromEmail || '');
        const globalFromName: string =
            emailProvider === 'postmark'
                ? (settings.postmarkFromName || 'Church')
                : (settings.sendGridFromName || 'Church');

        if (!globalApiKey) {
            return res.status(500).json({ error: 'Email provider is not configured globally.' });
        }

        // 2. Fetch Church/Tenant specific email settings
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) {
            return res.status(404).json({ error: 'Church not found.' });
        }
        
        const churchData = churchSnap.data() || {};

        // Per-tenant secret auth — look up the Grow integration secret from Firestore.
        // Falls back to the global env var so existing deployments keep working.
        const tenantSecret: string | undefined = (churchData as any).growSettings?.growIntegrationSecret;
        const globalSecret: string = process.env.GROW_INTEGRATION_SECRET || 'GROW_TEMP_SECRET_123';
        const expectedSecret = tenantSecret || globalSecret;
        if (secret !== expectedSecret) {
            return res.status(401).json({ error: 'Unauthorized: Invalid integration secret.' });
        }

        const tenantEmail = churchData.emailSettings || {};
        const isCustomDomainMode = tenantEmail.mode === 'custom';
        const subuserId: string | undefined =
            tenantEmail.postmarkServerToken || tenantEmail.sendGridSubuserId || undefined;

        // Guard against unverified custom domains
        if (isCustomDomainMode && !tenantEmail.domainVerified) {
            return res.status(400).json({ error: 'Custom domain is not verified yet for this church.' });
        }

        // Determine sender details (Tenant override -> Global Fallback)
        const fromEmail = tenantEmail.fromEmail || globalFromEmail;
        const fromName  = tenantEmail.fromName  || globalFromName;

        if (!fromEmail) {
            return res.status(400).json({ error: 'No sender (From Email) configured.' });
        }

        let successCount = 0;
        let errors: string[] = [];

        // 3. Filter out unsubscribed users
        const unsubSnap = await db.collection('email_unsubscribes').where('churchId', '==', churchId).get();
        const unsubscribedEmails = new Set(unsubSnap.docs.map((d: any) => (d.data().email || '').toLowerCase()));

        // 4. Dispatch personalised emails
        for (const recipient of recipients) {
            const email = (recipient.email || '').toLowerCase().trim();
            if (!email || unsubscribedEmails.has(email)) continue;

            const html = buildGrowEmailHtml(recipient, churchData.name || 'Your Church');

            const msg = {
                to: email,
                from: { email: fromEmail, name: fromName },
                subject: `Your Daily Spiritual Growth - ${new Date().toLocaleDateString('en-US', { weekday: 'long', month: 'short', day: 'numeric' })}`,
                html: html
            };

            try {
                // Send individually to allow full HTML personalization for reading plans, etc.
                const provider = await resolveEmailProvider(db);
                await provider.send([msg], { apiKey: globalApiKey, tenantToken: subuserId, tag: 'grow_daily_email', stream: 'broadcast' });
                successCount++;
            } catch (err: any) {
                errors.push(`Failed to send to ${email}: ${err.message}`);
            }
        }

        log.info(`[GrowIntegration] Sent ${successCount} daily emails for church ${churchId}`, 'system', { churchId, successCount }, churchId);

        return res.json({
            success: true,
            sentCount: successCount,
            errors: errors.length > 0 ? errors : undefined
        });

    } catch (e: any) {
        log.error(`[GrowIntegration] Error processing daily emails: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message });
    }
}

/**
 * Builds a beautiful HTML email tailored for the Grow Application's Daily Digest.
 *
 * Recipient data shape:
 *   firstName          string
 *   email              string
 *   streak             number          (🔥 badge — days in a row)
 *   readingPlan        {
 *     title            string
 *     passage          string
 *     link             string | null   (Read Now CTA)
 *     markCompleteLink string | null   (deep-link to mark done in Grow app)
 *     dayNumber        number | null   (e.g. 14)
 *     totalDays        number | null   (e.g. 30)
 *     bookName         string | null   (e.g. "Book of John")
 *   }
 *   devotional         { title, contentPreview, link }
 *   memoryVerse        string          (rendered as colorful quote card)
 *   prayerRequests     Array<{ name, request }>
 */
function buildGrowEmailHtml(data: any, churchName: string) {
    const primary   = '#4f46e5';
    const primaryDk = '#3730a3';
    const accent    = '#f59e0b';   // streak / badge orange
    const verseGrad = 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)'; // memory verse card

    /* ── helpers ────────────────────────────────────────────────────────── */
    const esc = (s: any) => String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');

    /* ── streak badge HTML ──────────────────────────────────────────────── */
    const streakHtml = (data.streak && data.streak >= 2)
        ? `<div style="display:inline-block;background:${accent};color:#fff;padding:5px 14px;border-radius:999px;font-size:13px;font-weight:700;margin-top:12px;letter-spacing:0.3px;">
               🔥 ${data.streak}-Day Streak!
           </div>`
        : '';

    /* ── progress bar HTML ──────────────────────────────────────────────── */
    let progressHtml = '';
    const rp = data.readingPlan || {};
    if (rp.dayNumber && rp.totalDays && rp.totalDays > 0) {
        const pct = Math.min(100, Math.round((rp.dayNumber / rp.totalDays) * 100));
        const bookLabel = rp.bookName ? esc(rp.bookName) : 'Reading Plan';
        progressHtml = `
            <div style="margin-top:20px;padding:16px 24px;background:rgba(255,255,255,0.15);border-radius:12px;">
                <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;">
                    <span style="color:#e0e7ff;font-size:13px;font-weight:600;">${bookLabel}</span>
                    <span style="color:#c7d2fe;font-size:12px;">Day ${esc(rp.dayNumber)} of ${esc(rp.totalDays)} &mdash; ${pct}%</span>
                </div>
                <div style="background:rgba(255,255,255,0.2);border-radius:999px;height:8px;overflow:hidden;">
                    <div style="background:#ffffff;width:${pct}%;height:8px;border-radius:999px;"></div>
                </div>
            </div>`;
    }

    /* ── reading plan block ─────────────────────────────────────────────── */
    let readingPlanHtml = '';
    if (rp.title || rp.passage) {
        const markCompleteBtn = rp.markCompleteLink
            ? `<a href="${esc(rp.markCompleteLink)}"
                  style="display:inline-block;margin-top:12px;margin-right:10px;padding:10px 22px;
                         background:#dcfce7;color:#166534;text-decoration:none;border-radius:8px;
                         font-weight:700;font-size:14px;border:1px solid #bbf7d0;">
                   ✓ Mark as Complete
               </a>`
            : '';
        const readNowBtn = rp.link
            ? `<a href="${esc(rp.link)}"
                  style="display:inline-block;margin-top:12px;padding:10px 22px;
                         background:${primary};color:#ffffff;text-decoration:none;border-radius:8px;
                         font-weight:700;font-size:14px;">
                   Read Now →
               </a>`
            : '';

        readingPlanHtml = `
            <div style="margin-bottom:28px;">
                <div style="font-size:11px;font-weight:700;color:${primary};text-transform:uppercase;letter-spacing:1.2px;">📖 Today's Reading</div>
                <div style="font-size:20px;font-weight:800;margin-top:6px;color:#0f172a;line-height:1.3;">${esc(rp.title || 'Bible Reading')}</div>
                <div style="font-size:15px;color:#4b5563;margin-top:6px;">${esc(rp.passage || '')}</div>
                <div style="margin-top:4px;">${markCompleteBtn}${readNowBtn}</div>
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 28px 0;" />`;
    }

    /* ── devotional block ───────────────────────────────────────────────── */
    let devotionalHtml = '';
    const dev = data.devotional;
    if (dev?.title || dev?.contentPreview) {
        const contLink = dev.link
            ? `<a href="${esc(dev.link)}" style="display:inline-block;margin-top:12px;font-weight:700;color:${primary};text-decoration:none;font-size:14px;">Continue Reading &rarr;</a>`
            : '';
        devotionalHtml = `
            <div style="margin-bottom:28px;">
                <div style="font-size:11px;font-weight:700;color:${primary};text-transform:uppercase;letter-spacing:1.2px;">✨ Devotional</div>
                <div style="font-size:19px;font-weight:800;margin-top:6px;color:#0f172a;line-height:1.3;">${esc(dev.title || "Today's Devotional")}</div>
                <div style="font-size:15px;color:#475569;margin-top:10px;line-height:1.7;">${esc(dev.contentPreview || '')}</div>
                ${contLink}
            </div>
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 28px 0;" />`;
    }

    /* ── memory verse quote card ────────────────────────────────────────── */
    let verseHtml = '';
    if (data.memoryVerse) {
        // Split reference from text if in "text — Reference" format
        const rawVerse = String(data.memoryVerse);
        const emDashIdx = rawVerse.lastIndexOf(' — ');
        const verseText = emDashIdx > -1 ? rawVerse.slice(0, emDashIdx).trim() : rawVerse;
        const verseRef  = emDashIdx > -1 ? rawVerse.slice(emDashIdx + 3).trim() : '';

        verseHtml = `
            <div style="margin-bottom:28px;border-radius:16px;overflow:hidden;background:${verseGrad};padding:32px 28px;">
                <div style="font-size:11px;font-weight:700;color:rgba(255,255,255,0.7);text-transform:uppercase;letter-spacing:1.5px;margin-bottom:16px;">📌 Memory Verse</div>
                <div style="font-size:22px;font-style:italic;font-weight:700;color:#ffffff;line-height:1.55;letter-spacing:-0.2px;">
                    &ldquo;${esc(verseText)}&rdquo;
                </div>
                ${verseRef ? `<div style="margin-top:16px;font-size:14px;font-weight:600;color:rgba(255,255,255,0.8);letter-spacing:0.5px;">&mdash; ${esc(verseRef)}</div>` : ''}
                <div style="margin-top:20px;font-size:12px;color:rgba(255,255,255,0.6);">Screenshot &amp; share this verse today!</div>
            </div>`;
    }

    /* ── prayer requests block ──────────────────────────────────────────── */
    let prayerHtml = '';
    const prayers = Array.isArray(data.prayerRequests) ? data.prayerRequests.filter(Boolean) : [];
    if (prayers.length > 0) {
        const cards = prayers.slice(0, 5).map((pr: any, i: number) => {
            const colors = ['#eff6ff','#f0fdf4','#fdf4ff'];
            const borders = ['#bfdbfe','#bbf7d0','#e9d5ff'];
            const bg  = colors[i % colors.length];
            const brd = borders[i % borders.length];
            return `
                <div style="background:${bg};border:1px solid ${brd};border-radius:10px;padding:14px 16px;margin-bottom:10px;">
                    <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:4px;">${esc(pr.name || 'Anonymous')}</div>
                    <div style="font-size:14px;color:#374151;line-height:1.55;">${esc(pr.request || '')}</div>
                </div>`;
        }).join('');

        prayerHtml = `
            <hr style="border:none;border-top:1px solid #e5e7eb;margin:0 0 28px 0;" />
            <div style="margin-bottom:28px;">
                <div style="font-size:11px;font-weight:700;color:${primary};text-transform:uppercase;letter-spacing:1.2px;">🙏 Your Prayers for Today</div>
                <div style="margin-top:12px;">${cards}</div>
            </div>`;
    }

    /* ── final assembly ─────────────────────────────────────────────────── */
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Daily Spiritual Growth</title>
</head>
<body style="margin:0;padding:0;background-color:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table width="100%" cellpadding="0" cellspacing="0" style="padding:40px 16px;">
        <tr>
            <td align="center">
                <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;background:#ffffff;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(79,70,229,0.12);">

                    <!-- ═══ HEADER ═══ -->
                    <tr>
                        <td style="padding:36px 32px 28px;text-align:center;background:linear-gradient(135deg,${primary} 0%,${primaryDk} 100%);">
                            <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">${esc(churchName)}</h1>
                            <p style="margin:6px 0 0;color:#e0e7ff;font-size:14px;font-weight:500;">Your Daily Spiritual Growth</p>
                            ${streakHtml}
                            ${progressHtml}
                        </td>
                    </tr>

                    <!-- ═══ BODY ═══ -->
                    <tr>
                        <td style="padding:36px 32px 8px;">
                            <p style="font-size:16px;color:#0f172a;margin:0 0 6px;font-weight:700;">Hi ${esc(data.firstName || 'there')},</p>
                            <p style="font-size:15px;color:#475569;line-height:1.65;margin:0 0 28px;">Here is your personalized daily digest to help you stay in the Word today.</p>

                            ${readingPlanHtml}
                            ${devotionalHtml}
                            ${verseHtml}
                            ${prayerHtml}
                        </td>
                    </tr>

                    <!-- ═══ FOOTER ═══ -->
                    <tr>
                        <td style="padding:24px 32px;text-align:center;background:#f8fafc;border-top:1px solid #e2e8f0;">
                            <p style="margin:0;font-size:12px;color:#64748b;">Powered by <strong>Grow App</strong> &amp; Pastoral Care for PCO</p>
                            <p style="margin:8px 0 0;font-size:11px;color:#94a3b8;">You are receiving this because you opted in via your Grow App settings.</p>
                        </td>
                    </tr>

                </table>
            </td>
        </tr>
    </table>
</body>
</html>`;
}

