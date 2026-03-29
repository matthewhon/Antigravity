import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';

// ─── SendGrid v3 raw send helper ─────────────────────────────────────────────
// We use fetch() directly instead of @sendgrid/mail so we can set the
// 'on-behalf-of' header for Subuser reputation isolation while still using
// the master API key (which carries the master account's domain authentication).

async function sgSend(
    messages: {
        to: string;
        from: { email: string; name?: string };
        replyTo?: string;
        subject: string;
        html: string;
    }[],
    masterApiKey: string,
    subuserId?: string
): Promise<void> {
    // Build personalizations (one per recipient)
    const personalizations = messages.map(m => ({ to: [{ email: m.to }] }));

    const firstMsg = messages[0];
    const payload: Record<string, any> = {
        personalizations,
        from: firstMsg.from,
        subject: firstMsg.subject,
        content: [{ type: 'text/html', value: firstMsg.html }],
    };
    if (firstMsg.replyTo) {
        payload.reply_to = { email: firstMsg.replyTo };
    }

    const headers: Record<string, string> = {
        Authorization: `Bearer ${masterApiKey}`,
        'Content-Type': 'application/json',
    };
    if (subuserId) {
        headers['on-behalf-of'] = subuserId;
    }

    const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers,
        body: JSON.stringify(payload),
    });

    if (!res.ok && res.status !== 202) {
        const body = await res.json().catch(() => ({}));
        const errMsg = (body as any)?.errors?.[0]?.message || `SendGrid returned ${res.status}`;
        throw new Error(errMsg);
    }
}

/**
 * Extract a YouTube video ID from any standard YouTube URL.
 * Handles: watch?v=, youtu.be/, embed/, shorts/
 */
function extractYouTubeId(url: string): string | null {
    if (!url) return null;
    const m = url.match(/(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/);
    return m ? m[1] : null;
}

/**
 * Minimal HTML renderer for email blocks.
 * Converts the campaign's block array into a sendable HTML string.
 */
function renderBlocksToHtml(blocks: any[], templateSettings: any, unsubscribeHtml = ''): string {
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
            case 'header': {
                // Tiptap content is already HTML (may contain <h1>–<h3>, <p>, etc.)
                // Wrap in a styled div so inline styles apply to child elements.
                const hHtml = block.content?.text || '';
                return `<div style="font-family:${fontFamily};color:${primaryColor};font-weight:700;font-size:24px;margin:0 0 16px;line-height:1.3;">${hHtml}</div>`;
            }
            case 'text': {
                // Tiptap content is already HTML — inject base styles via wrapper.
                const tHtml = block.content?.text || '';
                return `<div style="font-family:${fontFamily};color:${textColor};font-size:15px;line-height:1.65;margin:0 0 16px;">${tHtml}</div>`;
            }
            case 'html':
                return block.content?.html || '';
            case 'image': {
                const imgSrc = block.content?.src || block.content?.url || '';
                if (!imgSrc) return '';
                const imgAlt = block.content?.alt || '';
                const imgLink = block.content?.link;
                const imgTag = `<img src="${imgSrc}" alt="${imgAlt}" style="max-width:100%;height:auto;border-radius:8px;margin-bottom:16px;display:block;" />`;
                return imgLink
                    ? `<a href="${imgLink}" style="display:block;" target="_blank" rel="noopener noreferrer">${imgTag}</a>`
                    : imgTag;
            }
            case 'button': {
                const bc = block.content || {};
                const bg = bc.color || primaryColor;
                const tc = bc.textColor || '#ffffff';
                const rad = bc.borderRadius === 'pill' ? '999px' : bc.borderRadius === 'square' ? '4px' : '8px';
                const pad = bc.size === 'small' ? '8px 18px' : bc.size === 'large' ? '14px 36px' : '12px 28px';
                const fs = bc.size === 'small' ? '13px' : bc.size === 'large' ? '17px' : '15px';
                const align = bc.align === 'left' ? 'left' : bc.align === 'right' ? 'right' : 'center';
                return `<div style="text-align:${align};margin:16px 0;">
                    <a href="${bc.url || '#'}" style="display:inline-block;background:${bg};color:${tc};font-family:${fontFamily};font-size:${fs};font-weight:bold;padding:${pad};border-radius:${rad};text-decoration:none;">
                        ${bc.text || 'Click Here'}
                    </a>
                  </div>`;
            }
            case 'divider':
                return `<hr style="border:none;border-top:1px solid #e5e7eb;margin:24px 0;" />`;
            case 'video': {
                // Email clients cannot render <video> or <iframe>.
                // For YouTube: show a linked thumbnail with play button overlay (email-safe table trick).
                // For other URLs: show a styled play button link.
                const videoSrc: string = block.content?.src || '';
                if (!videoSrc) return '';
                const ytId = extractYouTubeId(videoSrc);
                if (ytId) {
                    const thumbUrl = `https://img.youtube.com/vi/${ytId}/hqdefault.jpg`;
                    // We use a position:relative trick via a single-cell table to overlay the play button.
                    // This technique works in Gmail, Apple Mail, and Outlook Web.
                    return `<div style="margin-bottom:16px;">
                      <a href="${videoSrc}" target="_blank" rel="noopener noreferrer" style="display:block;text-decoration:none;">
                        <table cellpadding="0" cellspacing="0" width="100%" style="border-radius:10px;overflow:hidden;">
                          <tr>
                            <td style="position:relative;padding:0;line-height:0;">
                              <img src="${thumbUrl}" alt="Watch on YouTube" width="100%" style="display:block;width:100%;border-radius:10px;" />
                              <!-- Play button overlay using a centered table -->
                              <table cellpadding="0" cellspacing="0" style="position:absolute;top:0;left:0;width:100%;height:100%;">
                                <tr><td align="center" valign="middle">
                                  <table cellpadding="0" cellspacing="0"><tr><td style="width:68px;height:68px;border-radius:50%;background:rgba(0,0,0,0.72);text-align:center;vertical-align:middle;">
                                    <span style="display:inline-block;margin-left:5px;width:0;height:0;border-style:solid;border-width:12px 0 12px 22px;border-color:transparent transparent transparent #ffffff;"></span>
                                  </td></tr></table>
                                </td></tr>
                              </table>
                            </td>
                          </tr>
                          <tr>
                            <td style="background:#ff0000;padding:7px 14px;font-family:${fontFamily};font-size:12px;font-weight:800;color:#ffffff;border-radius:0 0 10px 10px;text-align:center;letter-spacing:0.5px;">
                              &#9654; Watch on YouTube
                            </td>
                          </tr>
                        </table>
                      </a>
                    </div>`;
                }
                // Non-YouTube fallback: styled play button link
                return `<div style="margin-bottom:16px;">
                    <a href="${videoSrc}" target="_blank" rel="noopener noreferrer" style="display:inline-flex;align-items:center;background:#ef4444;color:#ffffff;font-family:${fontFamily};font-size:14px;font-weight:700;padding:10px 20px;border-radius:8px;text-decoration:none;">
                        <span style="display:inline-block;width:0;height:0;border-style:solid;border-width:7px 0 7px 14px;border-color:transparent transparent transparent #ffffff;vertical-align:middle;margin-right:8px;"></span>Watch Video
                    </a>
                    <div style="font-family:${fontFamily};font-size:11px;color:#9ca3af;margin-top:6px;word-break:break-all;">${videoSrc}</div>
                </div>`;
            }
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
            case 'columns': {
                const cells: { id: string; blocks: { id: string; type: string; content: any }[] }[] = block.content?.cells || [];
                const layout: string = block.content?.layout || '2';
                // Calculate column widths as percentages
                const widthMap: Record<string, string[]> = {
                    '1': ['100%'],
                    '2': ['50%', '50%'],
                    '3': ['33%', '33%', '33%'],
                    '2:1': ['67%', '33%'],
                    '1:2': ['33%', '67%'],
                };
                const widths = widthMap[layout] || ['50%', '50%'];

                const renderMini = (b: any): string => {
                    const bc = b.content || {};
                    if (b.type === 'text') return `<div style="font-family:${fontFamily};font-size:14px;color:${textColor};line-height:1.6;">${bc.text || ''}</div>`;
                    if (b.type === 'image' && bc.src) return `<img src="${bc.src}" alt="${bc.alt || ''}" style="max-width:100%;height:auto;border-radius:6px;display:block;" />`;
                    if (b.type === 'button') {
                        const bg = bc.color || primaryColor;
                        const tc = bc.textColor || '#ffffff';
                        const rad = bc.borderRadius === 'pill' ? '999px' : bc.borderRadius === 'square' ? '4px' : '8px';
                        const pad = bc.size === 'small' ? '6px 14px' : bc.size === 'large' ? '12px 28px' : '8px 20px';
                        const align = bc.align === 'left' ? 'left' : bc.align === 'right' ? 'right' : 'center';
                        return `<div style="text-align:${align};"><a href="${bc.url || '#'}" style="display:inline-block;background:${bg};color:${tc};font-family:${fontFamily};font-size:14px;font-weight:bold;padding:${pad};border-radius:${rad};text-decoration:none;">${bc.text || 'Click Here'}</a></div>`;
                    }
                    return '';
                };

                const tds = cells.map((cell, i) =>
                    `<td width="${widths[i] || '50%'}" valign="top" style="padding:0 6px;">
                        ${cell.blocks.map(renderMini).join('<br/>')}
                     </td>`
                ).join('');

                return `<table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:16px;">
                    <tr>${tds}</tr>
                </table>`;
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
          <tr><td>${unsubscribeHtml}</td></tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

/**
 * Generates a personalised unsubscribe footer snippet for one recipient.
 * Token = base64url(churchId:email) — common, URL-safe convention.
 */
function buildUnsubscribeHtml(
    churchId: string,
    recipientEmail: string,
    fontFamily: string,
    appBaseUrl: string
): string {
    const token = Buffer.from(`${churchId}:${recipientEmail.toLowerCase()}`).toString('base64url');
    const link = `${appBaseUrl}/unsubscribe?token=${token}`;
    return `<div style="text-align:center;padding:12px 32px 20px;">
        <p style="margin:0;font-family:${fontFamily};font-size:11px;color:#9ca3af;">
          Don't want these emails?
          <a href="${link}" style="color:#6b7280;text-decoration:underline;">Unsubscribe</a>
        </p>
      </div>`;
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

    // 1. Load system settings (global/fallback)
    const settingsSnap = await db.doc('system/settings').get();
    const settings = settingsSnap.data() || {};
    const globalApiKey: string = settings.sendGridApiKey || '';
    const globalFromEmail: string = settings.sendGridFromEmail || '';
    const globalFromName: string = settings.sendGridFromName || 'Church';

    if (!globalApiKey || !globalApiKey.startsWith('SG.')) {
        throw new Error('SendGrid is not configured. Please add your API key in App Config → System Settings.');
    }

    // 2. Load church to check for tenant-specific email configuration
    const churchSnap = await db.collection('churches').doc(churchId).get();
    const churchData = churchSnap.data() || {};
    const tenantEmail = churchData.emailSettings || {};

    // IMPORTANT: The 'on-behalf-of' subuser header tells SendGrid to check the *subuser's*
    // sender identities. For the shared domain, the domain auth is explicitly associated
    // with the subuser at provisioning time, so on-behalf-of works.
    //
    // For custom domain sends: the domain auth is created on the master account, then
    // associated with the subuser after DNS validation. Until that association is complete
    // (i.e. domainVerified = true), sending via on-behalf-of will fail with "Sender Identity"
    // errors. We therefore send without on-behalf-of (master key only) for custom domains.
    // This is safe because the master account's domain auth covers the from-email domain.
    const isCustomDomainMode = tenantEmail.mode === 'custom';
    const subuserId: string | undefined = (!isCustomDomainMode && tenantEmail.sendGridSubuserId)
        ? tenantEmail.sendGridSubuserId
        : undefined;

    // Guard: if custom domain is configured but not yet DNS-verified, fail early with a
    // clear message rather than letting SendGrid return a cryptic Sender Identity error.
    if (isCustomDomainMode && !tenantEmail.domainVerified) {
        throw new Error(
            `Custom domain "${tenantEmail.customDomain || '(unknown)'}" has not been verified yet. ` +
            `Go to Settings → Mail Settings → Verify DNS before sending.`
        );
    }

    // Prefer tenant-level From settings → campaign override → global fallback.
    // IMPORTANT: If the tenant has configured a From email in Mail Settings (shared or
    // custom domain), it takes precedence over whatever is stored on the campaign, because
    // the campaign may have been created/saved before the domain was set up, or the admin
    // may have typed a different address into the campaign editor.
    const tenantFromEmail = tenantEmail.fromEmail || '';
    const tenantFromName  = tenantEmail.fromName  || '';

    // 3. Load campaign
    const campaignSnap = await db.collection('email_campaigns').doc(campaignId).get();
    if (!campaignSnap.exists) throw new Error('Campaign not found');
    const campaign = campaignSnap.data() as any;

    const fromEmail = tenantFromEmail || campaign.fromEmail || globalFromEmail;
    const fromName  = tenantFromName  || campaign.fromName  || globalFromName;
    const subject   = campaign.subject   || '(No Subject)';

    if (!fromEmail) throw new Error('No "From Email" configured. Set it on the campaign or in App Config → SendGrid.');

    // Extra guard for custom domain: catch from-email domain mismatch early.
    // If someone has a custom domain "grace.org" but the resolved from-email is
    // "pastor@gmail.com" (e.g. from an old campaign field), SendGrid will reject it.
    if (isCustomDomainMode && tenantEmail.customDomain && fromEmail) {
        const fromDomain = fromEmail.split('@')[1]?.toLowerCase();
        const configuredDomain = tenantEmail.customDomain.toLowerCase();
        if (fromDomain && fromDomain !== configuredDomain) {
            throw new Error(
                `From email "${fromEmail}" does not match the authenticated custom domain "${configuredDomain}". ` +
                `Update the From Email in Settings → Mail Settings.`
            );
        }
    }

    // 3. Base HTML template rendered per-recipient in the send loop below.
    //    (Each email gets a personalized unsubscribe link injected.)

    // Load unsubscriber blocklist for this church (skip for test sends)
    const unsubscribedEmails = new Set<string>();
    if (!testEmail) {
        try {
            const unsubSnap = await db.collection('email_unsubscribes').where('churchId', '==', churchId).get();
            unsubSnap.docs.forEach((d: any) => unsubscribedEmails.add((d.data().email || '').toLowerCase()));
            if (unsubscribedEmails.size > 0) {
                log.info(`Suppression list loaded: ${unsubscribedEmails.size} unsubscribed address(es).`, 'system', { churchId }, churchId);
            }
        } catch (e: any) {
            log.warn(`Could not load unsubscribe list: ${e.message}`, 'system', { churchId }, churchId);
        }
    }

    // Determine app base URL for unsubscribe links
    const settingsSnap2 = await db.doc('system/settings').get();
    const appBaseUrl: string = (settingsSnap2.data() || {}).apiBaseUrl || 'https://pastoralcare.barnabassoftware.com';
    const fontFamily: string = campaign.templateSettings?.fontFamily || 'sans-serif';

    // 4. Determine recipients
    let recipients: string[] = [];

    if (testEmail) {
        recipients = [testEmail];
        log.info(`Sending test email to ${testEmail}`, 'system', { campaignId, churchId }, churchId);

    } else if (campaign.toListId) {
        log.info(`Fetching PCO list ${campaign.toListId} for campaign ${campaignId}`, 'system', { churchId }, churchId);

        // churchData already loaded above (for email settings)
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
        log.info(`Sending campaign "${subject}" to ${recipients.length} recipients (PCO list)`, 'system', { campaignId, churchId }, churchId);

    } else if (campaign.toGroupId) {
        log.info(`Fetching PCO group ${campaign.toGroupId} members for campaign ${campaignId}`, 'system', { churchId }, churchId);

        const accessToken = churchData.pcoAccessToken;
        if (!accessToken) throw new Error('Church not connected to Planning Center. Cannot fetch group members.');

        // Fetch group memberships with person included
        const groupUrl = `https://api.planningcenteronline.com/groups/v2/groups/${campaign.toGroupId}/memberships?include=person&per_page=100`;
        const groupRes = await fetch(groupUrl, {
            headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
        });

        if (!groupRes.ok) {
            throw new Error(`Failed to fetch PCO group members: ${groupRes.status}`);
        }

        const groupData = await groupRes.json();
        const included: any[] = groupData?.included || [];
        const personIds: string[] = [];

        for (const item of included) {
            if (item.type === 'Person') {
                // Try to get email directly from included attributes
                const emailAttr = item.attributes?.primary_email || item.attributes?.email;
                if (emailAttr) {
                    recipients.push(emailAttr);
                } else {
                    personIds.push(item.id);
                }
            }
        }

        // For persons without email in the included payload, fetch from People API
        if (personIds.length > 0) {
            await Promise.all(personIds.map(async (pid) => {
                const pRes = await fetch(
                    `https://api.planningcenteronline.com/people/v2/people/${pid}?include=emails`,
                    { headers: { Authorization: `Bearer ${accessToken}` } }
                );
                if (!pRes.ok) return;
                const pData = await pRes.json();
                const emailsIncluded: any[] = pData.included || [];
                const primary = emailsIncluded.find(e => e.attributes?.primary) || emailsIncluded[0];
                if (primary?.attributes?.address) recipients.push(primary.attributes.address);
            }));
        }

        recipients = [...new Set(recipients.filter(Boolean))]; // dedupe
        if (recipients.length === 0) throw new Error('No email addresses found for the selected group.');
        log.info(`Sending campaign "${subject}" to ${recipients.length} recipients (PCO group: ${campaign.toGroupName})`, 'system', { campaignId, churchId }, churchId);

    } else {
        throw new Error('No recipients configured. Select a PCO list or group on the campaign.');
    }

    // 5. Filter unsubscribers
    const beforeCount = recipients.length;
    if (!testEmail && unsubscribedEmails.size > 0) {
        recipients = recipients.filter(r => !unsubscribedEmails.has(r.toLowerCase()));
        const suppressed = beforeCount - recipients.length;
        if (suppressed > 0) {
            log.info(`Suppressed ${suppressed} unsubscribed recipient(s).`, 'system', { campaignId, churchId }, churchId);
        }
    }
    if (recipients.length === 0 && !testEmail) {
        throw new Error('All recipients have unsubscribed. No emails were sent.');
    }

    // 6. Send via SendGrid — each recipient gets a personalised unsubscribe link,
    //    so we build per-recipient HTML and send in batches of individual messages.
    const BATCH = 50; // smaller batches since each message has unique HTML
    for (let i = 0; i < recipients.length; i += BATCH) {
        const batch = recipients.slice(i, i + BATCH);
        for (const recipientEmail of batch) {
            const unsubHtml = testEmail
                ? '' // no unsubscribe link on test sends
                : buildUnsubscribeHtml(churchId, recipientEmail, fontFamily, appBaseUrl);
            const personalizedHtml = renderBlocksToHtml(
                campaign.blocks || [],
                campaign.templateSettings || {},
                unsubHtml
            );
            await sgSend(
                [{ to: recipientEmail, from: { email: fromEmail, name: fromName }, replyTo: campaign.replyTo || undefined, subject, html: personalizedHtml }],
                globalApiKey,
                subuserId
            );
        }
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
