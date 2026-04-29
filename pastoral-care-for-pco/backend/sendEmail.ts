import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';
import { refreshCampaignBlocks } from './emailScheduler';

// ─── SendGrid v3 raw send helper ─────────────────────────────────────────────
// We use fetch() directly instead of @sendgrid/mail so we can set the
// 'on-behalf-of' header for Subuser reputation isolation while still using
// the master API key (which carries the master account's domain authentication).

export async function sgSend(
    messages: {
        to: string;
        from: { email: string; name?: string };
        replyTo?: string;
        subject: string;
        html: string;
    }[],
    masterApiKey: string,
    subuserId?: string,
    campaignId?: string
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
    if (campaignId) {
        payload.categories = [campaignId];
    }
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
        const errors: any[] = (body as any)?.errors || [];
        // Include all error messages + the from-address to aid diagnosis
        const fromAddr = firstMsg.from.email;
        const detail = errors.length > 0
            ? errors.map((e: any) => e.message).join('; ')
            : `SendGrid HTTP ${res.status}`;
        throw new Error(`[SendGrid] from=${fromAddr} status=${res.status}: ${detail}`);
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
export function renderBlocksToHtml(blocks: any[], templateSettings: any, unsubscribeHtml = ''): string {
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
            case 'analytics_block':
            case 'data_chart': {
                const label = block.content?.label || '';
                const widgetId = block.content?.widgetId || '';
                // Render a simplified non-interactive version for email
                return renderAnalyticsBlockHtml(widgetId, label, block.content?.data, primaryColor, fontFamily, textColor);
            }
            case 'pastoral_care_chart': {
                const area = block.content?.area || 'Pastoral Care';
                const data = block.content?.data || {};
                const period = data.period || 'Last 30 Days';
                const count1Text = area === 'Visits' ? 'Recent Visits' : 'Recent Requests';
                const count2Text = area === 'Visits' ? 'Active / Total' : 'Answered';
                const val1 = data.recentCount || 0;
                const val2 = area === 'Visits' ? (data.totalCount || 0) : (data.answeredCount || 0);
                
                return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
                  <div style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:12px 16px;display:flex;justify-content:space-between;align-items:center;">
                    <div style="font-size:11px;font-weight:800;color:#e0e7ff;text-transform:uppercase;letter-spacing:1px;font-family:${fontFamily};">Pastoral Care: ${area}</div>
                    <div style="font-size:10px;color:#c7d2fe;font-family:${fontFamily};">${period}</div>
                  </div>
                  <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;">
                    <tr>
                      <td style="padding:16px;width:50%;">
                        <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;font-weight:700;font-family:${fontFamily};">${count1Text}</div>
                        <div style="font-size:24px;font-weight:900;color:#1e293b;font-family:${fontFamily};margin-top:2px;">${val1}</div>
                      </td>
                      <td style="padding:16px;width:50%;">
                        <div style="font-size:9px;color:#94a3b8;text-transform:uppercase;font-weight:700;font-family:${fontFamily};">${count2Text}</div>
                        <div style="font-size:24px;font-weight:900;color:#1e293b;font-family:${fontFamily};margin-top:2px;">${val2}</div>
                      </td>
                    </tr>
                  </table>
                </div>`;
            }
            // PCO content cards
            case 'pco_registration':
            case 'pco_group':
            case 'pco_event': {
                const c = block.content || {};
                const strip = (h: string) => (h || '').replace(/<[^>]*>/g, '').trim();
                return `
                  <div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;background:#fff;">
                    ${c.imageUrl ? `<img src="${c.imageUrl}" alt="${c.name || ''}" style="width:100%;height:auto;display:block;" />` : ''}
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
            if (data.months && data.months.length > 0) {
                const months: { label: string; actual: number | null; budget: number; isPast: boolean }[] = data.months;
                const maxVal = Math.max(...months.map(m => Math.max(m.actual || 0, m.budget)), 1);
                const bars = months.map(pt => {
                    const actualH = pt.actual !== null ? Math.max(2, Math.round((pt.actual / maxVal) * 56)) : 0;
                    return `<td valign="bottom" style="text-align:center;padding:0 1px;">
                      <div style="background:#34d399;width:100%;height:${actualH}px;border-radius:2px 2px 0 0;${!pt.isPast ? 'opacity:0.4;' : ''}"></div>
                      <div style="font-size:7px;color:#94a3b8;margin-top:2px;">${pt.label.charAt(0)}</div>
                    </td>`;
                }).join('');
                return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
                  <div style="background:linear-gradient(135deg,#059669,#10b981);padding:10px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" valign="middle">
                          <div style="font-size:10px;font-weight:800;color:#a7f3d0;text-transform:uppercase;letter-spacing:1px;font-family:${fontFamily};">Cumulative Giving YTD</div>
                          ${data.fundFilter ? `<div style="font-size:10px;color:#a7f3d0;margin-top:2px;font-family:${fontFamily};">${data.fundFilter}</div>` : ''}
                        </td>
                        <td align="right" valign="middle">
                          <div style="font-size:16px;font-weight:900;color:#fff;font-family:${fontFamily};">${fmt(data.totalYTD || 0, true)}</div>
                          ${data.hasBudget && data.totalAnnualBudget > 0 ? `<div style="font-size:10px;color:#a7f3d0;margin-top:2px;font-family:${fontFamily};">of ${fmt(data.totalAnnualBudget, true)} budget</div>` : ''}
                        </td>
                      </tr>
                    </table>
                  </div>
                  <div style="background:#fff;padding:8px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0"><tr>${bars}</tr></table>
                  </div>
                </div>`;
            } else {
                // Legacy fallback for old email drafts that still use data.cumulative
                const cumulative: { date: string; amount: number }[] = data.cumulative || [];
                const maxVal = cumulative.length > 0 ? cumulative[cumulative.length - 1].amount : 1;
                const bars = cumulative.map(pt => {
                    const h = Math.max(2, Math.round((pt.amount / maxVal) * 56));
                    return `<td valign="bottom" style="text-align:center;padding:0 1px;">
                      <div style="background:#34d399;width:100%;height:${h}px;border-radius:2px 2px 0 0;"></div>
                      <div style="font-size:7px;color:#94a3b8;margin-top:2px;">${pt.date.slice(5)}</div>
                    </td>`;
                }).join('');
                return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
                  <div style="background:linear-gradient(135deg,#059669,#10b981);padding:10px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td align="left" valign="middle">
                          <div style="font-size:10px;font-weight:800;color:#a7f3d0;text-transform:uppercase;letter-spacing:1px;font-family:${fontFamily};">Cumulative Giving YTD</div>
                          ${data.fundFilter ? `<div style="font-size:10px;color:#a7f3d0;margin-top:2px;font-family:${fontFamily};">${data.fundFilter}</div>` : ''}
                        </td>
                        <td align="right" valign="middle">
                          <div style="font-size:16px;font-weight:900;color:#fff;font-family:${fontFamily};">${fmt(data.totalYTD || 0, true)}</div>
                        </td>
                      </tr>
                    </table>
                  </div>
                  <div style="background:#fff;padding:8px 16px;">
                    <table width="100%" cellpadding="0" cellspacing="0"><tr>${bars || '<td><div style="font-size:11px;color:#94a3b8;text-align:center;">No data</div></td>'}</tr></table>
                  </div>
                </div>`;
            }
        }
        case 'giving_key_metrics':
            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#059669,#0d9488);padding:10px 16px;">
                <div style="font-size:10px;font-weight:800;color:#a7f3d0;text-transform:uppercase;letter-spacing:1px;">Key Financial Overview</div>
                <div style="font-size:22px;font-weight:900;color:#fff;margin-top:4px;">${fmt(data.totalGiving || 0, true)}</div>
              </div>
              <div style="background:#fff;padding:12px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="33%" align="left"><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Donors</div><div style="font-size:18px;font-weight:900;color:#4f46e5;">${fmt(data.contributingPeople || 0)}</div></td>
                    <td width="33%" align="center"><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Recurring</div><div style="font-size:18px;font-weight:900;color:#0891b2;">${fmt(data.recurringGivers || 0)}</div></td>
                    <td width="33%" align="right"><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Avg Gift</div><div style="font-size:18px;font-weight:900;color:#7c3aed;">${fmt(data.averageGift || 0, true)}</div></td>
                  </tr>
                </table>
              </div>
            </div>`;
        case 'giving_fund_performance': {
            const funds: { name: string; value: number }[] = data.givingByFund || [];
            const maxVal = funds.length > 0 ? funds[0].value : 1;
            const fundRows = funds.map(f => {
                const w = Math.max(2, Math.round((f.value / maxVal) * 100));
                return `<tr><td style="padding:4px 0;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;">
                    <tr>
                      <td align="left" style="font-size:11px;font-weight:600;color:#334155;font-family:${fontFamily};">${f.name}</td>
                      <td align="right" style="font-size:11px;font-weight:800;color:#0f172a;font-family:${fontFamily};">${fmt(f.value, true)}</td>
                    </tr>
                  </table>
                  <div style="background:#f1f5f9;border-radius:4px;height:6px;width:100%;">
                    <div style="background:#6366f1;height:100%;border-radius:4px;width:${w}%;"></div>
                  </div>
                </td></tr>`;
            }).join('');
            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:10px 16px;">
                <div style="font-size:10px;font-weight:800;color:#c7d2fe;text-transform:uppercase;letter-spacing:1px;font-family:${fontFamily};">Fund Performance</div>
                ${data.fundFilter ? `<div style="font-size:9px;color:#a5b4fc;font-family:${fontFamily};">${data.fundFilter}</div>` : ''}
              </div>
              <div style="background:#fff;padding:12px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">${fundRows || '<tr><td style="font-size:11px;color:#94a3b8;font-family:${fontFamily};">No fund data available</td></tr>'}</table>
              </div>
            </div>`;
        }
        case 'giving_donor_lifecycle': {
            const lc = data.donorLifecycle || {};
            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#0ea5e9,#2563eb);padding:10px 16px;">
                <div style="font-size:10px;font-weight:800;color:#bae6fd;text-transform:uppercase;letter-spacing:1px;font-family:${fontFamily};">Donor Lifecycle Status</div>
              </div>
              <div style="background:#fff;padding:12px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="25%" align="left"><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;font-family:${fontFamily};">Active</div><div style="font-size:18px;font-weight:900;color:#0ea5e9;font-family:${fontFamily};">${fmt(lc.active || 0)}</div></td>
                    <td width="25%" align="left"><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;font-family:${fontFamily};">New</div><div style="font-size:18px;font-weight:900;color:#10b981;font-family:${fontFamily};">${fmt(lc.new || 0)}</div></td>
                    <td width="25%" align="left"><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;font-family:${fontFamily};">Recov</div><div style="font-size:18px;font-weight:900;color:#8b5cf6;font-family:${fontFamily};">${fmt(lc.recovered || 0)}</div></td>
                    <td width="25%" align="left"><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;font-family:${fontFamily};">Lapsed</div><div style="font-size:18px;font-weight:900;color:#f43f5e;font-family:${fontFamily};">${fmt(lc.lapsed || 0)}</div></td>
                  </tr>
                </table>
              </div>
            </div>`;
        }
        case 'giving_donor_acquisition': {
            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#3b82f6,#8b5cf6);padding:10px 16px;">
                <div style="font-size:10px;font-weight:800;color:#dbeafe;text-transform:uppercase;letter-spacing:1px;font-family:${fontFamily};">Donor Acquisition</div>
              </div>
              <div style="background:#fff;padding:12px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="33%" align="left"><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;font-family:${fontFamily};">New Donors</div><div style="font-size:18px;font-weight:900;color:#10b981;font-family:${fontFamily};">${fmt(data.newDonors || 0)}</div></td>
                    <td width="33%" align="left"><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;font-family:${fontFamily};">Recovered</div><div style="font-size:18px;font-weight:900;color:#8b5cf6;font-family:${fontFamily};">${fmt(data.recoveredDonors || 0)}</div></td>
                    <td width="33%" align="left"><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;font-family:${fontFamily};">Lapsed</div><div style="font-size:18px;font-weight:900;color:#f43f5e;font-family:${fontFamily};">${fmt(data.lapsedDonors || 0)}</div></td>
                  </tr>
                </table>
              </div>
            </div>`;
        }
        case 'giving_last_week_by_fund': {
            const funds: { name: string; amount: number; pct: number }[] = data.funds || [];
            const fundRows = funds.map(f => {
                return `<tr><td style="padding:4px 0;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;">
                    <tr>
                      <td align="left" style="font-size:11px;font-weight:600;color:#334155;font-family:${fontFamily};">${f.name}</td>
                      <td align="right" style="font-size:11px;font-weight:800;color:#0f172a;font-family:${fontFamily};">${fmt(f.amount, true)}</td>
                    </tr>
                  </table>
                  <div style="background:#f1f5f9;border-radius:4px;height:6px;width:100%;">
                    <div style="background:#0ea5e9;height:100%;border-radius:4px;width:${f.pct}%;"></div>
                  </div>
                </td></tr>`;
            }).join('');
            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#0284c7,#0369a1);padding:10px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="left" valign="middle">
                      <div style="font-size:10px;font-weight:800;color:#bae6fd;text-transform:uppercase;letter-spacing:1px;font-family:${fontFamily};">Last Week by Fund</div>
                      <div style="font-size:9px;color:#7dd3fc;font-family:${fontFamily};">${data.weekLabel || ''}</div>
                    </td>
                    <td align="right" valign="middle">
                      <div style="font-size:16px;font-weight:900;color:#fff;font-family:${fontFamily};">${fmt(data.weekTotal || 0, true)}</div>
                    </td>
                  </tr>
                </table>
              </div>
              <div style="background:#fff;padding:12px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">${fundRows || `<tr><td style="font-size:11px;color:#94a3b8;font-family:${fontFamily};">No donations last week</td></tr>`}</table>
              </div>
            </div>`;
        }
        case 'giving_budget_progress': {
            const funds: { name: string; actual: number; budget: number; pct: number }[] = data.funds || [];
            const fundRows = funds.map(f => {
                return `<tr><td style="padding:4px 0;">
                  <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:4px;">
                    <tr>
                      <td align="left" style="font-size:11px;font-weight:600;color:#334155;font-family:${fontFamily};">${f.name}</td>
                      <td align="right" style="font-size:11px;font-weight:600;color:#64748b;font-family:${fontFamily};">${fmt(f.actual, true)} <span style="font-weight:400;font-size:9px;">of ${fmt(f.budget, true)}</span></td>
                    </tr>
                  </table>
                  <div style="background:#f1f5f9;border-radius:4px;height:6px;width:100%;">
                    <div style="background:${f.pct >= 100 ? '#10b981' : '#6366f1'};height:100%;border-radius:4px;width:${f.pct}%;"></div>
                  </div>
                </td></tr>`;
            }).join('');
            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#6366f1,#4338ca);padding:10px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="left" valign="middle">
                      <div style="font-size:10px;font-weight:800;color:#c7d2fe;text-transform:uppercase;letter-spacing:1px;font-family:${fontFamily};">Budget Progress (${data.year || new Date().getFullYear()})</div>
                    </td>
                    <td align="right" valign="middle">
                      <div style="font-size:16px;font-weight:900;color:#fff;font-family:${fontFamily};">${data.totalPct || 0}%</div>
                    </td>
                  </tr>
                </table>
              </div>
              <div style="background:#fff;padding:12px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">${fundRows || `<tr><td style="font-size:11px;color:#94a3b8;text-align:center;font-family:${fontFamily};">No budget data configured</td></tr>`}</table>
              </div>
            </div>`;
        }
        case 'people_stats': {
            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:10px 16px;">
                <div style="font-size:10px;font-weight:800;color:#fef3c7;text-transform:uppercase;letter-spacing:1px;font-family:${fontFamily};">People Overview</div>
                <div style="font-size:22px;font-weight:900;color:#fff;margin-top:4px;font-family:${fontFamily};">${fmt(data.total || 0)}</div>
              </div>
              <div style="background:#fff;padding:12px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td width="33%" align="left"><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;font-family:${fontFamily};">Members</div><div style="font-size:18px;font-weight:900;color:#ea580c;font-family:${fontFamily};">${fmt(data.members || 0)}</div></td>
                    <td width="33%" align="center"><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;font-family:${fontFamily};">New (30d)</div><div style="font-size:18px;font-weight:900;color:#10b981;font-family:${fontFamily};">${fmt(data.newThisMonth || 0)}</div></td>
                    <td width="33%" align="right"><div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;font-family:${fontFamily};">Households</div><div style="font-size:18px;font-weight:900;color:#0284c7;font-family:${fontFamily};">${fmt(data.households || 0)}</div></td>
                  </tr>
                </table>
              </div>
            </div>`;
        }
        case 'events': {
            const period = data.period || 'This Month';
            const eventsData: any[] = data.events || [];
            if (eventsData.length === 0) {
              return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
                <div style="background:linear-gradient(135deg,#f43f5e,#e11d48);padding:10px 16px;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    <tr>
                      <td align="left" valign="middle">
                        <div style="font-size:10px;font-weight:800;color:#ffe4e6;text-transform:uppercase;letter-spacing:1px;font-family:${fontFamily};">Events Check-Ins</div>
                      </td>
                      <td align="right" valign="middle">
                        <div style="font-size:10px;color:#fda4af;font-family:${fontFamily};">${period}</div>
                      </td>
                    </tr>
                  </table>
                </div>
                <div style="background:#fff;padding:12px 16px;font-size:11px;color:#94a3b8;text-align:center;font-family:${fontFamily};">No events data available</div>
              </div>`;
            }
            const eventRows = eventsData.map(ev => {
              const dStr = new Date(ev.startsAt || ev.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
              return `<tr>
                <td style="padding:8px 16px;border-bottom:1px solid #f1f5f9;font-family:${fontFamily};">
                  <span style="font-size:11px;font-weight:700;color:#1e293b;">${ev.name || 'Event'}</span>
                  <br/><span style="font-size:10px;color:#94a3b8;">${dStr}</span>
                </td>
                <td style="padding:8px 16px;text-align:right;border-bottom:1px solid #f1f5f9;font-family:${fontFamily};">
                  <div style="font-size:14px;font-weight:800;color:#1e293b;">${ev.total || ev.headcount || 0}</div>
                </td>
              </tr>`;
            }).join('');
            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#f43f5e,#be123c);padding:10px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="left" valign="middle">
                      <div style="font-size:10px;font-weight:800;color:#ffe4e6;text-transform:uppercase;letter-spacing:1px;font-family:${fontFamily};">Events Check-Ins</div>
                    </td>
                    <td align="right" valign="middle">
                      <div style="font-size:10px;color:#fda4af;font-family:${fontFamily};">${period}</div>
                    </td>
                  </tr>
                </table>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;">${eventRows}</table>
            </div>`;
        }
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
              <div style="background:linear-gradient(135deg,#7c3aed,#4f46e5);padding:10px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="left" valign="middle">
                      <div style="font-size:10px;font-weight:800;color:#ddd6fe;text-transform:uppercase;letter-spacing:1px;">Upcoming Services</div>
                    </td>
                    <td align="right" valign="middle">
                      <div style="font-size:10px;color:#c4b5fd;">Next ${data.dayRange || 14} days</div>
                    </td>
                  </tr>
                </table>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;">${rows || '<tr><td style="padding:12px 16px;font-size:11px;color:#94a3b8;text-align:center;">No upcoming services</td></tr>'}</table>
            </div>`;
        }
        case 'church_progress': {
            const rows: { label: string; thisMonth: number; lastMonth: number }[] = data.rows || [];
            const rowHtml = rows.map(r => {
                const diff = r.thisMonth - r.lastMonth;
                const isUp = diff >= 0;
                const pctChange = r.lastMonth > 0 ? Math.round((Math.abs(diff) / r.lastMonth) * 100) : null;
                const badgeBg = isUp ? '#f0fdf4' : '#fef2f2';
                const badgeColor = isUp ? '#16a34a' : '#dc2626';
                const arrow = isUp ? '▲' : '▼';
                const changeLabel = pctChange !== null ? `${pctChange}%` : Math.abs(diff).toLocaleString();
                return `<tr>
                  <td style="padding:8px 16px;border-bottom:1px solid #f1f5f9;font-family:${fontFamily};font-size:12px;font-weight:600;color:#334155;">${r.label}</td>
                  <td style="padding:8px 16px;border-bottom:1px solid #f1f5f9;text-align:right;">
                    <span style="font-size:14px;font-weight:900;color:#1e293b;">${r.thisMonth.toLocaleString()}</span>
                    <span style="margin-left:8px;font-size:10px;font-weight:800;background:${badgeBg};color:${badgeColor};padding:2px 6px;border-radius:6px;">${arrow} ${changeLabel}</span>
                  </td>
                </tr>`;
            }).join('');
            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:10px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="left" valign="middle">
                      <div style="font-size:10px;font-weight:800;color:#c7d2fe;text-transform:uppercase;letter-spacing:1px;">Church Progress</div>
                    </td>
                    <td align="right" valign="middle">
                      <div style="font-size:10px;color:#a5b4fc;">Last 30 Days</div>
                    </td>
                  </tr>
                </table>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;">${rowHtml || '<tr><td style="padding:12px 16px;font-size:11px;color:#94a3b8;text-align:center;">No progress data available</td></tr>'}</table>
            </div>`;
        }
        case 'upcoming_registrations': {
            const events: { name: string; dateStr: string; signupCount: number; signupLimit: number | null; fillPct: number | null; isFull: boolean; waitlistedCount: number; publicUrl: string | null }[] = data.upcoming || [];
            const rowHtml = events.slice(0, 6).map(e => {
                const capacityText = e.signupLimit ? `${e.signupCount.toLocaleString()} / ${e.signupLimit.toLocaleString()} spots` : `${e.signupCount.toLocaleString()} registered`;
                const badgeHtml = e.isFull
                    ? `<span style="font-size:9px;font-weight:800;text-transform:uppercase;background:#fee2e2;color:#dc2626;padding:2px 6px;border-radius:6px;">Full</span>`
                    : e.waitlistedCount > 0
                    ? `<span style="font-size:9px;font-weight:800;background:#fef3c7;color:#d97706;padding:2px 6px;border-radius:6px;">${e.waitlistedCount} waitlisted</span>`
                    : '';
                const barHtml = e.fillPct !== null
                    ? `<div style="margin-top:4px;height:4px;background:#e5e7eb;border-radius:4px;overflow:hidden;"><div style="height:100%;background:${e.isFull ? '#f87171' : e.fillPct >= 80 ? '#fbbf24' : '#34d399'};width:${e.fillPct}%;"></div></div>`
                    : '';
                return `<tr>
                  <td style="padding:8px 16px;border-bottom:1px solid #f1f5f9;">
                    <div style="font-size:11px;font-weight:700;color:#1e293b;">${e.name}</div>
                    <div style="font-size:10px;color:#6366f1;margin-top:2px;">${e.dateStr}</div>
                    <div style="font-size:10px;color:#64748b;margin-top:2px;">${capacityText} ${badgeHtml}</div>
                    ${barHtml}
                  </td>
                </tr>`;
            }).join('');
            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#7c3aed,#a21caf);padding:10px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="left" valign="middle">
                      <div style="font-size:10px;font-weight:800;color:#e9d5ff;text-transform:uppercase;letter-spacing:1px;">Upcoming Registrations</div>
                    </td>
                    <td align="right" valign="middle">
                      <div style="font-size:10px;color:#d8b4fe;">${events.length} event${events.length !== 1 ? 's' : ''}</div>
                    </td>
                  </tr>
                </table>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;">${rowHtml || '<tr><td style="padding:12px 16px;font-size:11px;color:#94a3b8;text-align:center;">No upcoming registration events</td></tr>'}</table>
            </div>`;
        }
        case 'group_attendance': {
            const rows: { name: string; members: number; visitors: number; total: number }[] = data.rows || [];
            const max = Math.max(...rows.map((r: any) => r.total), 1);
            const periodTotal    = data.periodTotal    || 0;
            const periodMembers  = data.periodMembers  || 0;
            const periodVisitors = data.periodVisitors || 0;
            const period         = data.period         || 'This Month';

            // Bar chart as a single-row table — each cell is one day's stacked bar
            const barCells = rows.slice(-24).map((r: any) => {
                const totalH   = Math.max(2, Math.round((r.total    / max) * 48));
                const memberH  = Math.max(2, Math.round((r.members  / max) * 48));
                const visitorH = r.visitors > 0 ? Math.max(2, Math.round((r.visitors / max) * 48)) : 0;
                return `<td valign="bottom" style="text-align:center;padding:0 1px;vertical-align:bottom;" title="${r.name}: ${r.total}">
                  ${visitorH > 0 ? `<div style="width:100%;height:${visitorH}px;background:#fbbf24;border-radius:2px 2px 0 0;"></div>` : ''}
                  <div style="width:100%;height:${memberH}px;background:#6366f1;border-radius:${visitorH > 0 ? '0' : '2px 2px'} 0 0;"></div>
                </td>`;
            }).join('');

            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#4f46e5,#2563eb);padding:10px 16px;display:flex;justify-content:space-between;align-items:center;">
                <div style="font-size:10px;font-weight:800;color:#c7d2fe;text-transform:uppercase;letter-spacing:1px;">Group Attendance</div>
                <div style="font-size:10px;color:#a5b4fc;">${period}</div>
              </div>
              <div style="background:#fff;padding:12px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:10px;">
                  <tr>
                    <td style="padding:0 12px 0 0;">
                      <div style="font-size:8px;color:#94a3b8;text-transform:uppercase;font-weight:700;">Total</div>
                      <div style="font-size:20px;font-weight:900;color:#1e293b;">${periodTotal.toLocaleString()}</div>
                    </td>
                    <td style="padding:0 12px;">
                      <div style="font-size:8px;color:#6366f1;text-transform:uppercase;font-weight:700;">Members</div>
                      <div style="font-size:20px;font-weight:900;color:#4f46e5;">${periodMembers.toLocaleString()}</div>
                    </td>
                    <td>
                      <div style="font-size:8px;color:#d97706;text-transform:uppercase;font-weight:700;">Visitors</div>
                      <div style="font-size:20px;font-weight:900;color:#f59e0b;">${periodVisitors.toLocaleString()}</div>
                    </td>
                  </tr>
                </table>
                ${rows.length > 0
                    ? `<table width="100%" cellpadding="0" cellspacing="0" style="height:56px;"><tr>${barCells}</tr></table>`
                    : `<div style="font-size:11px;color:#94a3b8;text-align:center;padding:8px 0;">No attendance data for this period</div>`
                }
              </div>
            </div>`;
        }
        case 'giving_average_giving': {
            const weeks: { label: string; byFund: Record<string, number>; total: number }[] = data.weeks || [];
            const fundAverages: { name: string; average: number }[] = data.fundAverages || [];
            const overallWeeklyAverage: number = data.overallWeeklyAverage || 0;
            const FUND_COLORS = ['#6366f1','#10b981','#f59e0b','#06b6d4','#f43f5e','#8b5cf6'];
            const maxWeekTotal = Math.max(...weeks.map(w => w.total), 1);

            const bars = weeks.map(w => {
                const h = Math.max(2, Math.round((w.total / maxWeekTotal) * 48));
                return `<td valign="bottom" style="text-align:center;padding:0 1px;">
                  <div style="width:100%;height:${h}px;background:#10b981;border-radius:2px 2px 0 0;opacity:0.85;"></div>
                </td>`;
            }).join('');

            const fundRows = fundAverages.slice(0, 6).map((f, i) =>
                `<tr>
                  <td style="padding:4px 0;font-size:11px;font-weight:600;color:#334155;font-family:${fontFamily};">
                    <span style="display:inline-block;width:8px;height:8px;border-radius:50%;background:${FUND_COLORS[i % FUND_COLORS.length]};margin-right:6px;vertical-align:middle;"></span>${f.name}
                  </td>
                  <td style="padding:4px 0;text-align:right;font-size:11px;font-weight:800;color:#0f172a;font-family:${fontFamily};">${fmt(f.average, true)}<span style="font-weight:400;font-size:9px;color:#94a3b8;">/wk</span></td>
                </tr>`
            ).join('');

            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#059669,#0891b2);padding:10px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td align="left" valign="middle">
                    <div style="font-size:10px;font-weight:800;color:#a7f3d0;text-transform:uppercase;letter-spacing:1px;font-family:${fontFamily};">Average Giving</div>
                    <div style="font-size:10px;color:#6ee7b7;font-family:${fontFamily};">Last 12 Weeks</div>
                  </td>
                  <td align="right" valign="middle">
                    <div style="font-size:16px;font-weight:900;color:#fff;font-family:${fontFamily};">${fmt(overallWeeklyAverage, true)}</div>
                    <div style="font-size:10px;color:#6ee7b7;font-family:${fontFamily};">weekly avg</div>
                  </td>
                </tr></table>
              </div>
              <div style="background:#fff;padding:8px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0" style="height:56px;"><tr>${bars || '<td><div style="font-size:11px;color:#94a3b8;text-align:center;padding-top:16px;">No giving data</div></td>'}</tr></table>
              </div>
              <div style="background:#f8fafc;padding:8px 16px;border-top:1px solid #f1f5f9;">
                <table width="100%" cellpadding="0" cellspacing="0">${fundRows || '<tr><td style="font-size:11px;color:#94a3b8;font-family:' + fontFamily + ';">No fund data</td></tr>'}</table>
              </div>
            </div>`;
        }
        case 'people_birthdays': {
            const upcoming: { name: string; daysUntil: number; dateStr: string }[] = data.upcoming || [];
            const rows = upcoming.slice(0, 8).map(p => {
                const badgeColor = p.daysUntil === 0 ? '#dc2626' : p.daysUntil <= 7 ? '#d97706' : '#6366f1';
                const badgeBg    = p.daysUntil === 0 ? '#fee2e2' : p.daysUntil <= 7 ? '#fef3c7' : '#eef2ff';
                const daysLabel  = p.daysUntil === 0 ? 'Today!' : `${p.daysUntil}d`;
                return `<tr>
                  <td style="padding:8px 16px;border-bottom:1px solid #f8fafc;font-size:12px;font-weight:600;color:#1e293b;font-family:${fontFamily};">🎂 ${p.name}</td>
                  <td style="padding:8px 16px;border-bottom:1px solid #f8fafc;text-align:right;">
                    <span style="font-size:10px;color:#64748b;font-family:${fontFamily};">${p.dateStr}</span>
                    <span style="margin-left:6px;font-size:9px;font-weight:800;background:${badgeBg};color:${badgeColor};padding:2px 6px;border-radius:6px;">${daysLabel}</span>
                  </td>
                </tr>`;
            }).join('');
            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#f59e0b,#d97706);padding:10px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td align="left" valign="middle">
                    <div style="font-size:10px;font-weight:800;color:#fef3c7;text-transform:uppercase;letter-spacing:1px;font-family:${fontFamily};">Upcoming Birthdays</div>
                  </td>
                  <td align="right" valign="middle">
                    <div style="font-size:10px;color:#fde68a;font-family:${fontFamily};">Next 30 Days</div>
                  </td>
                </tr></table>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;">${rows || '<tr><td style="padding:12px 16px;font-size:11px;color:#94a3b8;text-align:center;font-family:' + fontFamily + ';">No upcoming birthdays</td></tr>'}</table>
            </div>`;
        }
        case 'people_anniversaries': {
            const upcoming: { name: string; daysUntil: number; dateStr: string; years?: number }[] = data.upcoming || [];
            const rows = upcoming.slice(0, 8).map(p => {
                const badgeColor = p.daysUntil === 0 ? '#dc2626' : p.daysUntil <= 7 ? '#d97706' : '#7c3aed';
                const badgeBg    = p.daysUntil === 0 ? '#fee2e2' : p.daysUntil <= 7 ? '#fef3c7' : '#f5f3ff';
                const daysLabel  = p.daysUntil === 0 ? 'Today!' : `${p.daysUntil}d`;
                return `<tr>
                  <td style="padding:8px 16px;border-bottom:1px solid #f8fafc;font-size:12px;font-weight:600;color:#1e293b;font-family:${fontFamily};">💍 ${p.name}${p.years ? ` <span style="font-size:10px;color:#7c3aed;font-weight:400;">(${p.years} yrs)</span>` : ''}</td>
                  <td style="padding:8px 16px;border-bottom:1px solid #f8fafc;text-align:right;">
                    <span style="font-size:10px;color:#64748b;font-family:${fontFamily};">${p.dateStr}</span>
                    <span style="margin-left:6px;font-size:9px;font-weight:800;background:${badgeBg};color:${badgeColor};padding:2px 6px;border-radius:6px;">${daysLabel}</span>
                  </td>
                </tr>`;
            }).join('');
            return `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;margin-bottom:16px;">
              <div style="background:linear-gradient(135deg,#7c3aed,#a21caf);padding:10px 16px;">
                <table width="100%" cellpadding="0" cellspacing="0"><tr>
                  <td align="left" valign="middle">
                    <div style="font-size:10px;font-weight:800;color:#ede9fe;text-transform:uppercase;letter-spacing:1px;font-family:${fontFamily};">Upcoming Anniversaries</div>
                  </td>
                  <td align="right" valign="middle">
                    <div style="font-size:10px;color:#c4b5fd;font-family:${fontFamily};">Next 30 Days</div>
                  </td>
                </tr></table>
              </div>
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#fff;">${rows || '<tr><td style="padding:12px 16px;font-size:11px;color:#94a3b8;text-align:center;font-family:' + fontFamily + ';">No upcoming anniversaries</td></tr>'}</table>
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
    testEmail?: string,
    skipStatusUpdate?: boolean,
    collectionName: string = 'email_campaigns'
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

    // IMPORTANT: Both shared and custom domain sends use the master API key + 'on-behalf-of'
    // header to route through the tenant's SendGrid subuser.
    //
    // SHARED DOMAIN: The shared domain auth (pastoralcare.barnabassoftware.com) is associated
    // with the subuser at provisioning time, so on-behalf-of works immediately.
    //
    // CUSTOM DOMAIN: After DNS verification, our verifyDomain endpoint calls:
    //   POST /v3/whitelabel/domains/{id}/subuser  (SendGrid docs: associate domain with subuser)
    // This transfers ownership of the Sender Identity to the subuser. Once associated,
    // the master account can NO LONGER use it as a Sender Identity without on-behalf-of.
    // So custom domain sends MUST also use on-behalf-of — the subuser now owns the identity.
    //
    // NOTE: Our pre-send guard (domainVerified check above) ensures we never reach this
    // point for unverified custom domains, so the association is guaranteed to have run.
    const isCustomDomainMode = tenantEmail.mode === 'custom';
    const subuserId: string | undefined = tenantEmail.sendGridSubuserId || undefined;

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
    const campaignSnap = await db.collection(collectionName).doc(campaignId).get();
    if (!campaignSnap.exists) throw new Error('Campaign not found');
    const campaign = campaignSnap.data() as any;

    let blocks = campaign.blocks || [];
    if (blocks.length === 0 && campaign.channelType === 'email' && campaign.body) {
        blocks = [{ id: 'body', type: 'text', content: { text: campaign.body } }];
    }
    const hasRefreshable = blocks.some((b: any) => 
        b.type === 'analytics_block' || 
        b.type === 'data_chart' || 
        b.type === 'pastoral_care_chart'
    );

    // Only refresh if NOT called by the scheduler (which already refreshed them)
    if (hasRefreshable && !skipStatusUpdate) {
        log.info(`[SendEmail] Refreshing dynamic blocks for campaign ${campaignId} prior to dispatch.`, 'system', { campaignId }, churchId);
        const refreshedResult = await refreshCampaignBlocks(db, churchId, blocks);
        blocks = refreshedResult.blocks;
        campaign.blocks = blocks;

        if (!testEmail) {
            await db.collection(collectionName).doc(campaignId).update({
                blocks: blocks,
                analyticsRefreshedAt: Date.now()
            });
        }
    }

    const fromEmail = tenantFromEmail || campaign.fromEmail || globalFromEmail;
    const fromName  = tenantFromName  || campaign.fromName  || globalFromName;
    const subject   = campaign.subject   || campaign.emailSubject || '(No Subject)';

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

        // PCO emails are a related resource — use include=emails to sideload them.
        // The per_page=100 limit applies to people; paginate if the list is larger.
        let pcoPage = 1;
        let hasMore = true;
        while (hasMore) {
            const pcoUrl = `https://api.planningcenteronline.com/people/v2/lists/${campaign.toListId}/people?include=emails&per_page=100&offset=${(pcoPage - 1) * 100}`;
            const pcoRes = await fetch(pcoUrl, {
                headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' }
            });

            if (!pcoRes.ok) {
                const errBody = await pcoRes.text().catch(() => '');
                const errDetail = pcoRes.status === 401
                    ? 'PCO access token expired or revoked — re-connect Planning Center in Settings.'
                    : `PCO API returned HTTP ${pcoRes.status} for list ${campaign.toListId}.`;
                log.warn(`Failed to fetch PCO list members (page ${pcoPage}): ${pcoRes.status} — ${errDetail}`, 'system', { churchId, listId: campaign.toListId }, churchId);
                throw new Error(errDetail);
            }


            const pcoData = await pcoRes.json();
            const people: any[] = pcoData.data || [];
            const included: any[] = pcoData.included || [];

            // Build a lookup: personId → primary email from the included email objects
            const emailByPersonId = new Map<string, string>();
            for (const inc of included) {
                if (inc.type === 'Email' && inc.attributes?.address) {
                    // Each Email object has a relationships.person.data.id pointing back to the person
                    const personId: string | undefined = inc.relationships?.person?.data?.id;
                    if (personId && (!emailByPersonId.has(personId) || inc.attributes?.primary)) {
                        emailByPersonId.set(personId, inc.attributes.address);
                    }
                }
            }

            for (const person of people) {
                const email = emailByPersonId.get(person.id);
                if (email) recipients.push(email);
            }

            // Check for next page
            const nextOffset = pcoData.meta?.next?.offset;
            hasMore = !!nextOffset && people.length === 100;
            pcoPage++;
        }

        recipients = [...new Set(recipients.filter(Boolean))]; // dedupe
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
            // Always include the unsubscribe footer — on test sends we use the test
            // email address so the link renders correctly, but append a note so the
            // sender knows it's a preview rather than a live unsubscribe token.
            const unsubHtml = buildUnsubscribeHtml(churchId, recipientEmail, fontFamily, appBaseUrl)
                + (testEmail
                    ? `<div style="text-align:center;padding:0 32px 8px;"><p style="margin:0;font-family:${fontFamily};font-size:10px;color:#d1d5db;">(TEST SEND — unsubscribe link not active)</p></div>`
                    : '');
            const personalizedHtml = renderBlocksToHtml(
                campaign.blocks || [],
                campaign.templateSettings || {},
                unsubHtml
            );
            await sgSend(
                [{ to: recipientEmail, from: { email: fromEmail, name: fromName }, replyTo: campaign.replyTo || undefined, subject, html: personalizedHtml }],
                globalApiKey,
                subuserId,
                campaignId
            );
        }
    }

    // 6. Mark sent (skip for test or when scheduler is managing recurring dates)
    if (!testEmail && !skipStatusUpdate) {
        await db.collection(collectionName).doc(campaignId).update({
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

    const { campaignId, churchId, testEmail, collectionName } = req.body || {};
    if (!campaignId || !churchId) {
        res.status(400).json({ error: 'Missing campaignId or churchId' });
        return;
    }

    try {
        const result = await executeSend(db, campaignId, churchId, testEmail, false, collectionName || 'email_campaigns');
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

export const getEmailStats = async (req: any, res: any) => {
    const db = getDb();
    
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return;
    }

    const { campaignId, churchId } = req.body || {};
    if (!campaignId || !churchId) {
        res.status(400).json({ error: 'Missing campaignId or churchId' });
        return;
    }

    try {
        const log = createServerLogger(db);

        // 1. Get Campaign to identify Start Date
        const campaignSnap = await db.collection('email_campaigns').doc(campaignId).get();
        if (!campaignSnap.exists) {
            return res.status(404).json({ error: 'Campaign not found' });
        }
        const campaign = campaignSnap.data();
        
        // SendGrid requires start_date in YYYY-MM-DD
        const startDate = new Date(campaign.createdAt || Date.now()).toISOString().split('T')[0];

        // 2. Load system settings (global API key)
        const settingsSnap = await db.doc('system/settings').get();
        const settings = settingsSnap.data() || {};
        const globalApiKey: string = settings.sendGridApiKey || '';

        if (!globalApiKey || !globalApiKey.startsWith('SG.')) {
            return res.status(500).json({ error: 'SendGrid is not configured globally' });
        }

        // 3. Subuser check
        const churchSnap = await db.collection('churches').doc(churchId).get();
        const churchData = churchSnap.data() || {};
        const tenantEmail = churchData.emailSettings || {};
        const subuserId: string | undefined = tenantEmail.sendGridSubuserId || undefined;

        // 4. Fetch Stats from SendGrid API
        const url = new URL(`https://api.sendgrid.com/v3/categories/stats`);
        url.searchParams.set('categories', campaignId);
        url.searchParams.set('start_date', startDate);
        url.searchParams.set('aggregated_by', 'day');

        const headers: Record<string, string> = {
            Authorization: `Bearer ${globalApiKey}`,
            'Content-Type': 'application/json',
        };
        if (subuserId) {
            headers['on-behalf-of'] = subuserId;
        }

        const sgRes = await fetch(url.toString(), { method: 'GET', headers });

        if (!sgRes.ok) {
            const body = await sgRes.text();
            if (sgRes.status === 404 && body.includes('category does not exist')) {
                return res.json({
                    success: true,
                    stats: {
                        requests: 0, delivered: 0, opens: 0, unique_opens: 0,
                        clicks: 0, unique_clicks: 0, bounces: 0, spam_reports: 0,
                        unsubscribes: 0, drops: 0
                    }
                });
            }
            throw new Error(`SendGrid API error: ${sgRes.status} - ${body}`);
        }

        const data = await sgRes.json();
        
        // Aggregate daily data over the returned period
        const aggregated = {
            requests: 0,
            delivered: 0,
            opens: 0,
            unique_opens: 0,
            clicks: 0,
            unique_clicks: 0,
            bounces: 0,
            spam_reports: 0,
            unsubscribes: 0,
            drops: 0
        };

        if (Array.isArray(data)) {
            data.forEach((dayData: any) => {
                const metrics = dayData.stats?.[0]?.metrics;
                if (metrics) {
                    aggregated.requests += metrics.requests || 0;
                    aggregated.delivered += metrics.delivered || 0;
                    aggregated.opens += metrics.opens || 0;
                    aggregated.unique_opens += metrics.unique_opens || 0;
                    aggregated.clicks += metrics.clicks || 0;
                    aggregated.unique_clicks += metrics.unique_clicks || 0;
                    aggregated.bounces += metrics.bounces || 0;
                    aggregated.spam_reports += metrics.spam_reports || 0;
                    aggregated.unsubscribes += metrics.unsubscribes || 0;
                    aggregated.drops += metrics.drops || 0;
                }
            });
        }

        res.json({ success: true, stats: aggregated });
    } catch (e: any) {
        res.status(500).json({ error: e.message || 'Failed to fetch email statistics' });
    }
};
