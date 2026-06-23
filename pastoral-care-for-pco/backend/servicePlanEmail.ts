/**
 * servicePlanEmail.ts
 *
 * Generates and sends a beautifully-styled HTML service plan email that includes:
 *   - Order of Service items
 *   - Scheduled Roster (grouped by team, with positions and confirmation status)
 *   - Open / Needed Positions
 *
 * Two modes:
 *   • email-everyone  → looks up each roster member's email in the `people` collection
 *   • email-address   → sends to a single custom address
 */

import { getDb } from './firebase.js';
import { resolveEmailProvider } from './emailProvider.js';

// ─── HTML Email Generator ─────────────────────────────────────────────────────

function buildPlanEmailHtml(params: {
    churchName: string;
    serviceTypeName: string;
    seriesTitle?: string;
    planDate: string;           // e.g. "Sunday, June 29, 2025"
    planTime: string;           // e.g. "9:00 AM"
    items: { type: string; title: string; author?: string }[];
    teamMembers: { teamName: string; name: string; teamPositionName?: string; status: string }[];
    neededPositions: { teamName: string; quantity: number }[];
    recipientName?: string;
}): string {
    const {
        churchName,
        serviceTypeName,
        seriesTitle,
        planDate,
        planTime,
        items,
        teamMembers,
        neededPositions,
        recipientName,
    } = params;

    // ── Helpers ──────────────────────────────────────────────────────────────
    const esc = (s: string) =>
        s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // ── Order of Service rows ────────────────────────────────────────────────
    const itemsHtml = items.length > 0
        ? items.map((item, idx) => {
            const isSong = item.type === 'song';
            const isHeader = item.type === 'header';
            if (isHeader) {
                return `
                <tr>
                  <td colspan="3" style="padding: 20px 0 6px; font-size: 10px; font-weight: 900;
                      letter-spacing: 2px; text-transform: uppercase; color: #64748b;">
                    ${esc(item.title)}
                  </td>
                </tr>`;
            }
            return `
            <tr>
              <td style="padding: 10px 12px; width: 32px; text-align: center;
                  font-size: 10px; font-weight: 700; color: #94a3b8; vertical-align: top;">
                ${idx + 1}
              </td>
              <td style="padding: 10px 12px; vertical-align: top;">
                <div style="font-weight: 700; font-size: 13px; color: #1e293b;">
                  ${esc(item.title)}
                </div>
                ${isSong && item.author
                    ? `<div style="font-size: 11px; color: #2563eb; font-weight: 600; margin-top: 2px;">by ${esc(item.author)}</div>`
                    : ''}
              </td>
              <td style="padding: 10px 12px; vertical-align: top; width: 80px; text-align: right;">
                <span style="display: inline-block; font-size: 9px; font-weight: 800; padding: 3px 8px;
                    border-radius: 20px; letter-spacing: 1px; text-transform: uppercase;
                    background: ${isSong ? '#dbeafe' : '#f1f5f9'};
                    color: ${isSong ? '#1d4ed8' : '#64748b'};">
                  ${esc(item.type)}
                </span>
              </td>
            </tr>`;
        }).join('')
        : `<tr><td colspan="3" style="padding: 24px; text-align: center; color: #94a3b8; font-size: 12px;">No items in this plan.</td></tr>`;

    // ── Roster grouped by team ───────────────────────────────────────────────
    const teamsMap: Record<string, typeof teamMembers> = {};
    teamMembers.forEach(m => {
        const t = m.teamName || 'Other Staff';
        if (!teamsMap[t]) teamsMap[t] = [];
        teamsMap[t].push(m);
    });

    const statusBadge = (status: string) => {
        const norm = (status || '').toLowerCase();
        const isConfirmed = norm === 'confirmed' || norm === 'c';
        const isDeclined  = norm === 'declined'  || norm === 'd';
        const bg    = isConfirmed ? '#d1fae5' : isDeclined ? '#fee2e2' : '#fef3c7';
        const color = isConfirmed ? '#065f46' : isDeclined ? '#991b1b' : '#92400e';
        const label = isConfirmed ? 'Confirmed' : isDeclined ? 'Declined' : 'Pending';
        return `<span style="display:inline-block; font-size:9px; font-weight:800;
            padding:3px 8px; border-radius:20px; letter-spacing:1px; text-transform:uppercase;
            background:${bg}; color:${color};">${label}</span>`;
    };

    const rosterHtml = teamMembers.length > 0
        ? Object.entries(teamsMap).map(([teamName, members]) => `
          <div style="margin-bottom: 20px;">
            <div style="font-size: 10px; font-weight: 900; letter-spacing: 2px;
                text-transform: uppercase; color: #64748b; margin-bottom: 8px;">
              📁 ${esc(teamName)} (${members.length})
            </div>
            ${members.map(m => `
            <table width="100%" cellpadding="0" cellspacing="0"
                style="margin-bottom: 6px; border-radius: 10px; overflow: hidden;
                       background: #f8fafc; border: 1px solid #e2e8f0;">
              <tr>
                <td style="padding: 10px 14px;">
                  <div style="font-weight: 700; font-size: 13px; color: #1e293b;">${esc(m.name || 'Unknown')}</div>
                  <div style="font-size: 11px; color: #64748b; margin-top: 1px;">${esc(m.teamPositionName || 'Volunteer')}</div>
                </td>
                <td style="padding: 10px 14px; text-align: right; white-space: nowrap;">
                  ${statusBadge(m.status)}
                </td>
              </tr>
            </table>`).join('')}
          </div>`).join('')
        : `<p style="color: #94a3b8; font-size: 12px; text-align: center; padding: 24px;">No team members scheduled.</p>`;

    // ── Needed Positions ─────────────────────────────────────────────────────
    const needsHtml = neededPositions.length > 0
        ? `<table width="100%" cellpadding="0" cellspacing="0">
           ${neededPositions.map(np => `
           <tr>
             <td style="padding: 10px 14px; background: #fff5f5; border-radius: 10px;
                 border: 1px solid #fecaca; margin-bottom: 6px;">
               <div style="font-weight: 700; font-size: 13px; color: #991b1b;">${esc(np.teamName)}</div>
               <div style="font-size: 11px; color: #dc2626; margin-top: 2px; font-weight: 600;">
                 ${np.quantity} slot${np.quantity !== 1 ? 's' : ''} still needed
               </div>
             </td>
           </tr>
           <tr><td style="height:6px;"></td></tr>`).join('')}
           </table>`
        : `<div style="text-align: center; padding: 24px;">
             <div style="font-size: 32px;">🎉</div>
             <div style="font-weight: 700; color: #059669; font-size: 14px; margin-top: 8px;">Fully Staffed!</div>
             <div style="color: #94a3b8; font-size: 12px; margin-top: 4px;">No open positions for this service.</div>
           </div>`;

    const greeting = recipientName ? `Hi ${esc(recipientName)},` : 'Hello,';

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(serviceTypeName)} — Service Plan</title>
</head>
<body style="margin:0; padding:0; background:#eff6ff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Arial, sans-serif;">

  <!-- Preheader -->
  <div style="display:none; max-height:0; overflow:hidden; color:#eff6ff;">
    Service Plan for ${esc(serviceTypeName)} on ${esc(planDate)} — Order of Service, Roster &amp; Open Positions
  </div>

  <!-- Outer wrapper -->
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#eff6ff; padding: 32px 16px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0"
            style="max-width:600px; width:100%; border-radius:24px; overflow:hidden;
                   box-shadow: 0 20px 60px rgba(37,99,235,0.15);">

          <!-- HERO HEADER -->
          <tr>
            <td style="background: linear-gradient(135deg, #1d4ed8 0%, #2563eb 50%, #1e40af 100%);
                padding: 48px 40px 40px; text-align: center;">
              <div style="display:inline-block; background:rgba(255,255,255,0.15);
                  border-radius: 16px; padding: 12px 20px; margin-bottom: 20px;">
                <span style="font-size: 11px; font-weight: 900; letter-spacing: 3px;
                    text-transform: uppercase; color: rgba(255,255,255,0.85);">
                  📅 Service Plan
                </span>
              </div>
              <h1 style="margin: 0; font-size: 30px; font-weight: 900; color: #ffffff;
                  letter-spacing: -0.5px; line-height: 1.2;">
                ${esc(serviceTypeName)}
              </h1>
              ${seriesTitle
                ? `<div style="margin-top:10px; font-size:13px; font-weight:700;
                       color:rgba(255,255,255,0.75);">
                     Series: ${esc(seriesTitle)}
                   </div>`
                : ''}
              <div style="margin-top: 16px; display:inline-flex; gap:16px; flex-wrap:wrap; justify-content:center;">
                <span style="background:rgba(255,255,255,0.2); border-radius:50px; padding:7px 18px;
                    font-size:12px; font-weight:700; color:#fff;">
                  🗓️ ${esc(planDate)}
                </span>
                <span style="background:rgba(255,255,255,0.2); border-radius:50px; padding:7px 18px;
                    font-size:12px; font-weight:700; color:#fff;">
                  ⏰ ${esc(planTime)}
                </span>
              </div>
            </td>
          </tr>

          <!-- BODY -->
          <tr>
            <td style="background:#ffffff; padding: 40px;">

              <!-- Greeting -->
              <p style="font-size:15px; color:#1e293b; margin:0 0 24px;">${greeting}</p>
              <p style="font-size:14px; color:#475569; margin:0 0 36px; line-height:1.6;">
                Here is your service plan for <strong>${esc(churchName)}</strong>. 
                Please review the order of service, confirm your spot on the roster, and help recruit for any open positions.
              </p>

              <!-- ── ORDER OF SERVICE ── -->
              <div style="margin-bottom: 36px;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
                  <div style="width:4px; height:24px; background:linear-gradient(180deg,#1d4ed8,#2563eb);
                      border-radius:4px;"></div>
                  <h2 style="margin:0; font-size:16px; font-weight:900; color:#1e293b;
                      letter-spacing:-0.3px;">
                    📝 Order of Service
                  </h2>
                </div>
                <div style="border-radius:16px; overflow:hidden; border:1px solid #e2e8f0;">
                  <table width="100%" cellpadding="0" cellspacing="0">
                    ${itemsHtml}
                  </table>
                </div>
              </div>

              <!-- ── ROSTER ── -->
              <div style="margin-bottom: 36px;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
                  <div style="width:4px; height:24px; background:linear-gradient(180deg,#2563eb,#3b82f6);
                      border-radius:4px;"></div>
                  <h2 style="margin:0; font-size:16px; font-weight:900; color:#1e293b;
                      letter-spacing:-0.3px;">
                    👥 Scheduled Roster
                  </h2>
                </div>
                ${rosterHtml}
              </div>

              <!-- ── OPEN POSITIONS ── -->
              <div style="margin-bottom: 36px;">
                <div style="display:flex; align-items:center; gap:10px; margin-bottom:16px;">
                  <div style="width:4px; height:24px; background:linear-gradient(180deg,#ef4444,#f87171);
                      border-radius:4px;"></div>
                  <h2 style="margin:0; font-size:16px; font-weight:900; color:#1e293b;
                      letter-spacing:-0.3px;">
                    ⚠️ Open Positions
                  </h2>
                </div>
                <div style="border-radius:16px; overflow:hidden; border:1px solid #fecaca;
                    background:#fff8f8; padding: ${neededPositions.length > 0 ? '16px' : '0'};">
                  ${needsHtml}
                </div>
              </div>

              <!-- CTA -->
              <div style="text-align:center; margin-top: 8px; padding-top:32px; border-top: 1px solid #f1f5f9;">
                <p style="font-size:12px; color:#94a3b8; margin:0;">
                  This email was sent from <strong>${esc(churchName)}</strong> via Pastoral Care.
                </p>
              </div>

            </td>
          </tr>

          <!-- FOOTER -->
          <tr>
            <td style="background:#f8fafc; padding:24px 40px; text-align:center;
                border-top:1px solid #e2e8f0;">
              <p style="margin:0; font-size:11px; color:#94a3b8;">
                © ${new Date().getFullYear()} ${esc(churchName)} · Sent via Pastoral Care Platform
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

// ─── Main request handler ─────────────────────────────────────────────────────

export async function emailServicePlan(req: any, res: any) {
    const {
        churchId,
        plan,          // ServicePlanSnapshot serialised from the client
        toAddress,     // optional: single custom address to send to
        toEveryone,    // boolean: look up every roster member's email
    } = req.body || {};

    if (!churchId || !plan) {
        return res.status(400).json({ error: 'Missing churchId or plan' });
    }

    try {
        const db = getDb();

        // ── Church + email settings ──────────────────────────────────────────
        const churchSnap = await db.collection('churches').doc(churchId).get();
        if (!churchSnap.exists) return res.status(404).json({ error: 'Church not found' });
        const churchData = churchSnap.data() as any;
        const emailSettings = churchData.emailSettings || {};
        const churchName   = churchData.name || 'Your Church';

        const fromEmail = emailSettings.fromEmail || null;
        const fromName  = emailSettings.fromName  || churchName;

        if (!fromEmail) {
            return res.status(400).json({
                error: 'No From Email configured. Set it in App Config → Email Settings.',
            });
        }

        // ── Resolve email provider ───────────────────────────────────────────
        const provider = await resolveEmailProvider(db);
        const tenantToken: string | undefined =
            emailSettings.postmarkServerToken || emailSettings.sendGridSubuserId || undefined;

        // ── Build the plan display values ────────────────────────────────────
        let planDate = 'TBD';
        let planTime = 'TBD';
        try {
            const rawDate = plan.planTimes?.[0]?.startsAt || plan.sortDate;
            const d = new Date(rawDate);
            planDate = d.toLocaleDateString('en-US', {
                weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
            });
            planTime = d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
        } catch { /* leave defaults */ }

        const items: { type: string; title: string; author?: string }[] = plan.items || [];
        const teamMembers: { teamName: string; name: string; teamPositionName?: string; status: string }[] = plan.teamMembers || [];
        const neededPositions: { teamName: string; quantity: number }[] = plan.neededPositions || [];

        // ── Decide recipients ────────────────────────────────────────────────
        interface Recipient { email: string; name?: string }
        let recipients: Recipient[] = [];

        if (toAddress && !toEveryone) {
            // Single custom address
            recipients = [{ email: toAddress.trim().toLowerCase() }];
        } else if (toEveryone) {
            // Look up email for each person on the roster
            const personIds = [...new Set(
                teamMembers
                    .map((m: any) => m.personId)
                    .filter(Boolean),
            )];

            const emailMap: Record<string, { email: string; name: string }> = {};

            // Batch fetch from `people` collection (max 30 per query due to Firestore 'in' limit)
            const chunkSize = 30;
            for (let i = 0; i < personIds.length; i += chunkSize) {
                const chunk = personIds.slice(i, i + chunkSize);
                const peopleSnap = await db.collection('people')
                    .where('churchId', '==', churchId)
                    .where('id', 'in', chunk)
                    .get();
                peopleSnap.docs.forEach((doc: any) => {
                    const p = doc.data();
                    const email = p.email || p.emailAddress || '';
                    if (email) {
                        emailMap[p.id] = { email: email.trim().toLowerCase(), name: p.name || '' };
                    }
                });
            }

            // Build recipients list — deduplicate by email
            const seen = new Set<string>();
            teamMembers.forEach((m: any) => {
                const info = m.personId ? emailMap[m.personId] : null;
                if (info && info.email && !seen.has(info.email)) {
                    seen.add(info.email);
                    recipients.push({ email: info.email, name: info.name || m.name });
                }
            });

            if (recipients.length === 0) {
                return res.status(400).json({
                    error: 'No email addresses found for the scheduled roster. Make sure people have emails in Planning Center.',
                });
            }
        } else {
            return res.status(400).json({ error: 'Specify toAddress or set toEveryone=true' });
        }

        // ── Send one email per recipient ──────────────────────────────────────
        const messages = recipients.map(r => ({
            to: r.email,
            from: { email: fromEmail, name: fromName },
            subject: `Service Plan — ${plan.serviceTypeName || 'Service'} · ${planDate}`,
            html: buildPlanEmailHtml({
                churchName,
                serviceTypeName: plan.serviceTypeName || 'Service Plan',
                seriesTitle: plan.seriesTitle,
                planDate,
                planTime,
                items,
                teamMembers,
                neededPositions,
                recipientName: r.name || undefined,
            }),
        }));

        // ── Resolve API key from system settings ─────────────────────────────
        const settingsSnap = await db.doc('system/settings').get();
        const settingsData = settingsSnap.data() || {};
        const masterApiKey: string =
            settingsData.sendGridApiKey || settingsData.postmarkApiToken || settingsData.postmarkAccountToken || '';

        // Send in batches of 10 (each with its own personalized HTML)
        const batchSize = 10;
        for (let i = 0; i < messages.length; i += batchSize) {
            const batch = messages.slice(i, i + batchSize);
            // Send each message individually so each gets a personalized greeting
            for (const msg of batch) {
                await provider.send([msg], {
                    apiKey: masterApiKey,
                    tenantToken,
                    tag: `service-plan-${plan.id}`,
                    stream: 'transactional',
                    churchId,
                });
            }
        }

        return res.json({
            success: true,
            sent: messages.length,
            recipients: recipients.map(r => r.email),
        });

    } catch (e: any) {
        console.error('[emailServicePlan]', e.message);
        return res.status(500).json({ error: e.message || 'Failed to send plan email' });
    }
}
