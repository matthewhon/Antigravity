import sgMail from '@sendgrid/mail';
import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';

/**
 * Minimal HTML renderer for email blocks.
 * Converts the campaign's block array into a sendable HTML string.
 */
function renderBlocksToHtml(blocks: any[], templateSettings: any): string {
    const bg = templateSettings?.backgroundColor || '#ffffff';
    const textColor = templateSettings?.textColor || '#1f2937';
    const primaryColor = templateSettings?.primaryColor || '#4f46e5';
    const fontFamily = templateSettings?.fontFamily || 'sans-serif';
    const header = templateSettings?.header || '';
    const footer = templateSettings?.footer || '';

    const headerHtml = header
        ? `<div style="background:${primaryColor};padding:24px 32px;text-align:center;">
             <h1 style="margin:0;color:#ffffff;font-family:${fontFamily};font-size:22px;">${header}</h1>
           </div>`
        : '';

    const footerHtml = footer
        ? `<div style="padding:16px 32px;text-align:center;border-top:1px solid #e5e7eb;">
             <p style="margin:0;font-family:${fontFamily};font-size:11px;color:#9ca3af;">${footer}</p>
           </div>`
        : '';

    const bodyContent = (blocks || []).map((block: any) => {
        switch (block.type) {
            case 'header':
                return `<h2 style="font-family:${fontFamily};color:${primaryColor};font-size:24px;margin:0 0 16px;">${block.content?.text || ''}</h2>`;
            case 'text':
                return `<p style="font-family:${fontFamily};color:${textColor};font-size:15px;line-height:1.6;margin:0 0 16px;">${block.content?.text || ''}</p>`;
            case 'html':
                return block.content?.html || '';
            case 'image':
                if (block.content?.url) {
                    return `<img src="${block.content.url}" alt="${block.content.alt || ''}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:16px;" />`;
                }
                return '';
            case 'button':
                return `<div style="text-align:center;margin:16px 0;">
                    <a href="${block.content?.url || '#'}" style="display:inline-block;background:${primaryColor};color:#ffffff;font-family:${fontFamily};font-size:14px;font-weight:bold;padding:12px 28px;border-radius:8px;text-decoration:none;">
                        ${block.content?.label || 'Click Here'}
                    </a>
                  </div>`;
            case 'divider':
                return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />`;
            // Analytics widgets — rendered as an embedded card
            case 'analytics_block': {
                const label = block.content?.label || '';
                const widgetId = block.content?.widgetId || '';
                // Render a simplified non-interactive version for email
                return renderAnalyticsBlockHtml(widgetId, label, block.content?.data, primaryColor, fontFamily, textColor);
            }
            // PCO content cards
            case 'pco_registration':
            case 'pco_group':
            case 'pco_event': {
                const c = block.content || {};
                const strip = (h: string) => (h || '').replace(/<[^>]*>/g, '').trim();
                return `
                  <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;background:#fff;">
                    ${c.imageUrl ? `<img src="${c.imageUrl}" alt="${c.name || ''}" style="width:100%;height:200px;object-fit:cover;display:block;" />` : ''}
                    <div style="padding:12px 16px;">
                      ${c.date ? `<div style="font-size:12px;color:${primaryColor};font-weight:600;margin-bottom:4px;">${c.date}</div>` : ''}
                      <div style="font-size:16px;font-weight:700;color:#1e293b;margin-bottom:4px;">${c.name || ''}</div>
                      ${c.description ? `<div style="font-size:13px;color:#64748b;line-height:1.5;margin-bottom:8px;">${strip(c.description)}</div>` : ''}
                      ${c.meta ? `<div style="font-size:11px;color:#94a3b8;">${strip(c.meta)}</div>` : ''}
                      ${c.url ? `<a href="${c.url}" style="display:inline-block;margin-top:10px;padding:6px 16px;background:${primaryColor};color:#fff;border-radius:8px;text-decoration:none;font-size:13px;font-weight:600;">Learn More</a>` : ''}
                    </div>
                  </div>`;
            }
            default:
                return '';
        }
    }).join('\n');

    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f3f4f6;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background:${bg};border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,0.1);">
          <tr><td>${headerHtml}</td></tr>
          <tr>
            <td style="padding:32px;">
              ${bodyContent}
            </td>
          </tr>
          <tr><td>${footerHtml}</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/** Renders an analytics widget data payload as static email-safe HTML */
function renderAnalyticsBlockHtml(
    widgetId: string,
    label: string,
    data: any,
    primaryColor: string,
    fontFamily: string,
    textColor: string
): string {
    if (!data) return `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-family:${fontFamily};color:#94a3b8;font-size:12px;">${label} — no data</div>`;
    const fmt = (n: number, currency = false) => currency ? `$${Math.round(n).toLocaleString()}` : n.toLocaleString();

    switch (widgetId) {
        case 'giving_cumulative_ytd': {
            const cumulative: { date: string; amount: number }[] = data.cumulative || [];
            const maxVal = cumulative.length > 0 ? cumulative[cumulative.length - 1].amount : 1;
            const bars = cumulative.map(pt => {
                const h = Math.max(2, Math.round((pt.amount / maxVal) * 56));
                return `<td valign="bottom" style="text-align:center;padding:0 1px;">
                  <div style="background:#34d399;width:100%;height:${h}px;border-radius:2px 2px 0 0;"></div>
                  <div style="font-size:7px;color:#94a3b8;">${pt.date.slice(5)}</div>
                </td>`;
            }).join('');
            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#059669,#10b981);padding:10px 16px;display:flex;justify-content:space-between;align-items:center;">
                <div>
                  <div style="font-size:10px;font-weight:800;color:#a7f3d0;text-transform:uppercase;letter-spacing:1px;">Cumulative Giving YTD</div>
                  ${data.fundFilter ? `<div style="font-size:9px;color:#6ee7b7;">${data.fundFilter}</div>` : ''}
                </div>
                <div style="font-size:16px;font-weight:900;color:#fff;">${fmt(data.totalYTD || 0, true)}</div>
              </div>
              <div style="background:#fff;padding:8px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0"><tr>${bars}</tr></table>
              </div>
            </div>`;
        }
        case 'giving_key_metrics':
            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#059669,#0d9488);padding:10px 16px;">
                <div style="font-size:10px;font-weight:800;color:#a7f3d0;text-transform:uppercase;letter-spacing:1px;">Key Financial Overview</div>
                <div style="font-size:22px;font-weight:900;color:#fff;margin-top:4px;">${fmt(data.totalGiving || 0, true)}</div>
              </div>
              <div style="background:#fff;padding:12px 16px;display:flex;gap:24px;">
                <div><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Donors</div><div style="font-size:18px;font-weight:900;color:#4f46e5;">${fmt(data.contributingPeople || 0)}</div></div>
                <div><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Recurring</div><div style="font-size:18px;font-weight:900;color:#0891b2;">${fmt(data.recurringGivers || 0)}</div></div>
                <div><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Avg Gift</div><div style="font-size:18px;font-weight:900;color:#7c3aed;">${fmt(data.averageGift || 0, true)}</div></div>
              </div>
            </div>`;
        case 'services_upcoming_events': {
            const events: any[] = data.upcoming || [];
            const rows = events.slice(0, 6).map(ev => {
                const statusBg = ev.status === 'Ready' ? '#f0fdf4' : ev.status === 'Pending' ? '#fffbeb' : '#fef2f2';
                const statusColor = ev.status === 'Ready' ? '#16a34a' : ev.status === 'Pending' ? '#d97706' : '#dc2626';
                return `<tr>
                  <td style="padding:8px 16px;border-bottom:1px solid #f1f5f9;">
                    <span style="font-size:11px;font-weight:700;color:#1e293b;">${ev.serviceTypeName}</span>
                    ${ev.seriesTitle ? `<span style="font-size:10px;color:#6366f1;margin-left:6px;">${ev.seriesTitle}</span>` : ''}
                    <br/><span style="font-size:10px;color:#94a3b8;">${ev.dateStr} ${ev.timeStr}</span>
                  </td>
                  <td style="padding:8px 16px;text-align:right;border-bottom:1px solid #f1f5f9;">
                    <span style="font-size:9px;font-weight:800;text-transform:uppercase;background:${statusBg};color:${statusColor};padding:2px 7px;border-radius:6px;">${ev.status}</span>
                  </td>
                </tr>`;
            }).join('');
            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:10px 16px;display:flex;justify-content:space-between;align-items:center;">
                <div style="font-size:10px;font-weight:800;color:#ddd6fe;text-transform:uppercase;letter-spacing:1px;">Upcoming Services</div>
                <div style="font-size:10px;color:#c4b5fd;">Next ${data.dayRange || 14} days</div>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;">${rows || '<tr><td style="padding:12px 16px;font-size:11px;color:#94a3b8;text-align:center;">No upcoming services</td></tr>'}</table>
            </div>`;
        }
        default:
            // Generic fallback: label only
            return `<div style="border:1px solid #e2e8f0;border-radius:8px;padding:12px;font-family:${fontFamily};font-size:12px;color:${textColor};margin-bottom:16px;">${label}</div>`;
    }
}

// ─── Core send logic (shared by HTTP handler and scheduler) ────────────────

export async function executeSend(
    db: any,
    campaignId: string,
    churchId: string,
    testEmail?: string
): Promise<{ recipientCount: number; message: string }> {
    const log = createServerLogger(db);

    // 1. Load system settings
    const settingsSnap = await db.doc('system/settings').get();
    const settings = settingsSnap.data() || {};
    const apiKey: string = settings.sendGridApiKey || '';
    const defaultFromEmail: string = settings.sendGridFromEmail || '';
    const defaultFromName: string = settings.sendGridFromName || 'Church';

    if (!apiKey || !apiKey.startsWith('SG.')) {
        throw new Error('SendGrid is not configured. Please add your API key in App Config → System Settings.');
    }

    sgMail.setApiKey(apiKey);

    // 2. Load campaign
    const campaignSnap = await db.collection('email_campaigns').doc(campaignId).get();
    if (!campaignSnap.exists) throw new Error('Campaign not found');
    const campaign = campaignSnap.data() as any;

    const fromEmail = campaign.fromEmail || defaultFromEmail;
    const fromName  = campaign.fromName  || defaultFromName;
    const subject   = campaign.subject   || '(No Subject)';

    if (!fromEmail) throw new Error('No "From Email" configured. Set it on the campaign or in App Config → SendGrid.');

    // 3. Build HTML
    const html = renderBlocksToHtml(campaign.blocks || [], campaign.templateSettings || {});

    // 4. Determine recipients
    let recipients: string[] = [];

    if (testEmail) {
        recipients = [testEmail];
        log.info(`Sending test email to ${testEmail}`, 'system', { campaignId, churchId }, churchId);
    } else if (campaign.toListId) {
        log.info(`Fetching PCO list ${campaign.toListId} for campaign ${campaignId}`, 'system', { churchId }, churchId);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        const churchData = churchSnap.data() || {};
        const accessToken = churchData.pcoAccessToken;

        if (!accessToken) throw new Error('Church not connected to Planning Center. Cannot fetch recipient list.');

        const pcoUrl = `https://api.planningcenteronline.com/people/v2/lists/${campaign.toListId}/people?fields[Person]=emails&per_page=100`;
        const pcoRes = await fetch(pcoUrl, {
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });

        if (pcoRes.ok) {
            const pcoData = await pcoRes.json();
            const people: any[] = pcoData.data || [];
            recipients = people
                .map((p: any) => {
                    const emails = p.attributes?.emails || [];
                    const primary = emails.find((e: any) => e.primary) || emails[0];
                    return primary?.address || null;
                })
                .filter(Boolean);
        } else {
            log.warn(`Failed to fetch PCO list members: ${pcoRes.status}`, 'system', { churchId, listId: campaign.toListId }, churchId);
            const peopleSnap = await db.collection('people').where('churchId', '==', churchId).get();
            recipients = peopleSnap.docs.map(d => d.data().email as string).filter(Boolean);
        }

        if (recipients.length === 0) throw new Error('No email addresses found for the selected list.');

        log.info(`Sending campaign "${subject}" to ${recipients.length} recipients`, 'system', { campaignId, churchId }, churchId);
    } else {
        throw new Error('No recipients configured. Select a PCO list on the campaign.');
    }

    // 5. Send via SendGrid (batches of 50)
    const messages = recipients.map(to => ({
        to,
        from: { email: fromEmail, name: fromName },
        replyTo: campaign.replyTo || undefined,
        subject,
        html,
    }));

    const BATCH = 50;
    for (let i = 0; i < messages.length; i += BATCH) {
        await sgMail.send(messages.slice(i, i + BATCH) as any);
    }

    // 6. Mark sent (skip for test)
    if (!testEmail) {
        await db.collection('email_campaigns').doc(campaignId).update({
            status: 'sent',
            sentAt: Date.now(),
            updatedAt: Date.now(),
            retryCount: 0,
            lastError: null,
        });
    }

    const msg = testEmail
        ? `Test email sent to ${testEmail}`
        : `Campaign "${subject}" sent to ${recipients.length} recipient${recipients.length !== 1 ? 's' : ''}.`;
    log.info(msg, 'system', { campaignId, churchId, recipientCount: recipients.length }, churchId);

    return { recipientCount: recipients.length, message: msg };
}

// ─── HTTP Handlers ─────────────────────────────────────────────────────────

export const sendEmail = async (req: any, res: any) => {
    const db = getDb();

    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    const { campaignId, churchId, testEmail } = req.body || {};
    if (!campaignId || !churchId) {
        res.status(400).json({ error: 'Missing campaignId or churchId' });
        return;
    }

    try {
        const result = await executeSend(db, campaignId, churchId, testEmail);
        res.json({ success: true, ...result });
    } catch (e: any) {
        const sendGridErrors = e?.response?.body?.errors;
        const errMsg = sendGridErrors
            ? sendGridErrors.map((err: any) => err.message).join('; ')
            : e.message || 'Unknown error';
        const log = createServerLogger(db);
        log.error(`Email send failed: ${errMsg}`, 'system', { campaignId, churchId }, churchId);
        res.status(500).json({ error: `Send failed: ${errMsg}` });
    }
};
