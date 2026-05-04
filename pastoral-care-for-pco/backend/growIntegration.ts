import { getDb } from './firebase.js';
import { sgSend } from './sendEmail.js';
import { createServerLogger } from '../services/logService.js';

export async function setupGrowIntegration(req: any, res: any) {
    const { churchId, secret, churchName } = req.body || {};

    const expectedSecret = process.env.GROW_INTEGRATION_SECRET || 'GROW_TEMP_SECRET_123';
    if (secret !== expectedSecret) {
        return res.status(401).json({ error: 'Unauthorized: Invalid integration secret.' });
    }

    if (!churchId) {
        return res.status(400).json({ error: 'Missing churchId.' });
    }

    const db = getDb();
    const churchRef = db.collection('churches').doc(churchId);
    
    try {
        const doc = await churchRef.get();
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

    // Basic Authentication - the Grow backend must send the correct shared secret
    const expectedSecret = process.env.GROW_INTEGRATION_SECRET || 'GROW_TEMP_SECRET_123';
    if (secret !== expectedSecret) {
        return res.status(401).json({ error: 'Unauthorized: Invalid integration secret.' });
    }

    if (!churchId || !Array.isArray(recipients) || recipients.length === 0) {
        return res.status(400).json({ error: 'Missing churchId or recipients array.' });
    }

    const db = getDb();
    const log = createServerLogger(db as any);

    try {
        // 1. Fetch global SendGrid API key
        const settingsSnap = await db.doc('system/settings').get();
        const settings = settingsSnap.data() || {};
        const globalApiKey: string = settings.sendGridApiKey || '';
        const globalFromEmail: string = settings.sendGridFromEmail || '';
        const globalFromName: string = settings.sendGridFromName || 'Church';

        if (!globalApiKey) {
            return res.status(500).json({ error: 'SendGrid is not configured globally.' });
        }

        // 2. Fetch Church/Tenant specific email settings
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) {
            return res.status(404).json({ error: 'Church not found.' });
        }
        
        const churchData = churchSnap.data() || {};
        const tenantEmail = churchData.emailSettings || {};
        const isCustomDomainMode = tenantEmail.mode === 'custom';
        const subuserId: string | undefined = tenantEmail.sendGridSubuserId || undefined;

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
                await sgSend([msg], globalApiKey, subuserId, 'grow_daily_email');
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
 */
function buildGrowEmailHtml(data: any, churchName: string) {
    const primaryColor = '#4f46e5';
    let contentHtml = '';

    // -- BIBLE READING PLAN BLOCK --
    if (data.readingPlan) {
        contentHtml += `
            <div style="margin-bottom: 24px;">
                <div style="font-size: 12px; font-weight: bold; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 1px;">Today's Reading</div>
                <div style="font-size: 18px; font-weight: 800; margin-top: 4px; color: #1f2937;">${data.readingPlan.title || 'Bible Reading'}</div>
                <div style="font-size: 16px; color: #4b5563; margin-top: 8px;">${data.readingPlan.passage || ''}</div>
                ${data.readingPlan.link 
                    ? `<a href="${data.readingPlan.link}" style="display: inline-block; margin-top: 14px; padding: 10px 24px; background: ${primaryColor}; color: #ffffff; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 14px;">Read Now</a>` 
                    : ''}
            </div>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        `;
    }

    // -- DEVOTIONAL BLOCK --
    if (data.devotional) {
        contentHtml += `
            <div style="margin-bottom: 24px;">
                <div style="font-size: 12px; font-weight: bold; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 1px;">Devotional</div>
                <div style="font-size: 18px; font-weight: 800; margin-top: 4px; color: #1f2937;">${data.devotional.title || "Today's Devotional"}</div>
                <div style="font-size: 15px; color: #4b5563; margin-top: 10px; line-height: 1.6;">${data.devotional.contentPreview || ''}</div>
                ${data.devotional.link 
                    ? `<a href="${data.devotional.link}" style="display: inline-block; margin-top: 12px; font-weight: bold; color: ${primaryColor}; text-decoration: none; font-size: 15px;">Continue Reading &rarr;</a>` 
                    : ''}
            </div>
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
        `;
    }

    // -- MEMORY VERSE BLOCK --
    if (data.memoryVerse) {
        contentHtml += `
            <div style="margin-bottom: 24px; padding: 24px; background: #f8fafc; border-left: 4px solid ${primaryColor}; border-radius: 0 12px 12px 0;">
                <div style="font-size: 11px; font-weight: bold; color: #64748b; text-transform: uppercase; margin-bottom: 8px; letter-spacing: 1px;">Memory Verse</div>
                <div style="font-size: 18px; font-style: italic; color: #1e293b; line-height: 1.5;">"${data.memoryVerse}"</div>
            </div>
        `;
    }

    // -- PRAYER REQUESTS BLOCK (Optional) --
    if (data.prayerRequests && Array.isArray(data.prayerRequests) && data.prayerRequests.length > 0) {
        const prayersList = data.prayerRequests.map((pr: any) => 
            `<li style="margin-bottom: 8px; color: #374151; font-size: 15px; line-height: 1.5;"><strong>${pr.name || 'Anonymous'}:</strong> ${pr.request}</li>`
        ).join('');
        
        contentHtml += `
            <hr style="border: none; border-top: 1px solid #e5e7eb; margin: 24px 0;" />
            <div style="margin-bottom: 24px;">
                <div style="font-size: 12px; font-weight: bold; color: ${primaryColor}; text-transform: uppercase; letter-spacing: 1px;">Prayers for Today</div>
                <ul style="margin-top: 12px; padding-left: 20px;">
                    ${prayersList}
                </ul>
            </div>
        `;
    }

    return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="margin: 0; padding: 0; background-color: #f1f5f9; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
        <table width="100%" cellpadding="0" cellspacing="0" style="padding: 40px 16px;">
            <tr>
                <td align="center">
                    <table width="600" cellpadding="0" cellspacing="0" style="background: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06);">
                        <!-- Header -->
                        <tr>
                            <td style="padding: 40px 32px; text-align: center; background: linear-gradient(135deg, #4f46e5, #6366f1);">
                                <h1 style="margin: 0; color: #ffffff; font-size: 26px; font-weight: 800; letter-spacing: -0.5px;">${churchName}</h1>
                                <p style="margin: 8px 0 0 0; color: #e0e7ff; font-size: 15px; font-weight: 500;">Your Daily Spiritual Growth</p>
                            </td>
                        </tr>
                        
                        <!-- Body -->
                        <tr>
                            <td style="padding: 40px 32px;">
                                <p style="font-size: 16px; color: #1e293b; margin-top: 0; font-weight: 600;">Hi ${data.firstName || 'there'},</p>
                                <p style="font-size: 15px; color: #475569; line-height: 1.6; margin-bottom: 32px;">Here is your personalized daily digest to help you stay in the Word today.</p>
                                
                                ${contentHtml}
                            </td>
                        </tr>
                        
                        <!-- Footer -->
                        <tr>
                            <td style="padding: 24px 32px; text-align: center; background: #f8fafc; border-top: 1px solid #e2e8f0;">
                                <p style="margin: 0; font-size: 12px; color: #64748b;">Powered by Grow App & Pastoral Care for PCO</p>
                                <p style="margin: 8px 0 0 0; font-size: 12px; color: #94a3b8;">You are receiving this email because you opted in via your Grow App settings.</p>
                            </td>
                        </tr>
                    </table>
                </td>
            </tr>
        </table>
    </body>
    </html>
    `;
}
