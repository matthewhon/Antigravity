import { getDb } from './firebase.js';
import { pcoRequest } from './pcoApi.js';
import { resolveEmailProvider } from './emailProvider.js';
import { GivingBatch, QuickbooksMappingConfig, QuickbooksDepositResult } from '../types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Resolves recipient email addresses based on QuickbooksMappingConfig:
 * - Either direct comma/semicolon-separated email addresses
 * - Or by querying members of a Planning Center People List via PCO API
 */
export async function resolveNotificationRecipients(
    churchId: string,
    mapping: QuickbooksMappingConfig
): Promise<string[]> {
    const recipients: Set<string> = new Set();

    if (mapping.notificationRecipientType === 'pco_list' && mapping.notificationPcoListId) {
        try {
            // Check if simulated church
            if (churchId.startsWith('sim_') || churchId === 'test_church') {
                recipients.add('finance@example.com');
                recipients.add('treasurer@example.com');
            } else {
                let url: string | null = `https://api.planningcenteronline.com/people/v2/lists/${mapping.notificationPcoListId}/people?per_page=100&include=emails`;
                let pageCount = 0;

                while (url && pageCount < 5) {
                    pageCount++;
                    const response = await pcoRequest(churchId, url, 'GET');
                    const people = response?.data || [];
                    const included = response?.included || [];

                    // Map included email IDs to address
                    const emailMap = new Map<string, string>();
                    included.forEach((inc: any) => {
                        if (inc.type === 'Email' && inc.attributes?.address) {
                            emailMap.set(String(inc.id), inc.attributes.address);
                        }
                    });

                    // For each person, look for their email relationship
                    for (const person of people) {
                        const emailRefs = person.relationships?.emails?.data || [];
                        for (const ref of emailRefs) {
                            const addr = emailMap.get(String(ref.id));
                            if (addr && EMAIL_REGEX.test(addr.trim())) {
                                recipients.add(addr.trim().toLowerCase());
                            }
                        }
                        // Also check primary_email attribute if available
                        const primEmail = person.attributes?.primary_email;
                        if (primEmail && EMAIL_REGEX.test(primEmail.trim())) {
                            recipients.add(primEmail.trim().toLowerCase());
                        }
                    }

                    url = response?.links?.next || null;
                }
            }
        } catch (err: any) {
            console.warn(`[QuickbooksNotification] Failed to resolve PCO list ${mapping.notificationPcoListId}:`, err.message);
        }
    }

    // Direct emails (or fallback if PCO list returned no emails)
    if (recipients.size === 0 && mapping.notificationEmail) {
        const parts = mapping.notificationEmail.split(/[,;\n]+/);
        for (const part of parts) {
            const trimmed = part.trim().toLowerCase();
            if (trimmed && EMAIL_REGEX.test(trimmed)) {
                recipients.add(trimmed);
            }
        }
    }

    return Array.from(recipients);
}

/**
 * Dispatches an HTML email to a list of recipients using the church's configured email provider
 */
export async function sendEmailNotification(
    churchId: string,
    recipients: string[],
    subject: string,
    html: string
): Promise<{ success: boolean; deliveredTo: string[]; error?: string }> {
    if (!recipients || recipients.length === 0) {
        return { success: false, deliveredTo: [], error: 'No recipients provided' };
    }

    try {
        const db = getDb();
        const [churchDoc, settingsDoc] = await Promise.all([
            db.collection('churches').doc(churchId).get(),
            db.doc('system/settings').get()
        ]);

        const churchData = churchDoc.exists ? churchDoc.data() || {} : {};
        const settings = settingsDoc.exists ? settingsDoc.data() || {} : {};

        const emailSettings = churchData.emailSettings || {};
        const churchName = churchData.name || 'Your Church';

        const fromEmail = emailSettings.fromEmail || settings.postmarkDefaultFromEmail || settings.sendGridFromEmail || 'noreply@pastoralcarepco.com';
        const fromName = emailSettings.fromName || churchName;

        const masterApiKey = (settings.sendGridApiKey || settings.postmarkAccountToken || '').trim();
        const tenantToken = emailSettings.postmarkServerToken || emailSettings.sendGridSubuserId || undefined;

        if (!masterApiKey && !tenantToken) {
            console.warn('[QuickbooksNotification] No email provider API key or tenant token found in system/settings or church.');
            // Do not throw; return non-fatal status
            return { success: false, deliveredTo: [], error: 'Email provider not configured in system settings.' };
        }

        const provider = await resolveEmailProvider(db);
        const messages = recipients.map(toEmail => ({
            to: toEmail,
            from: { email: fromEmail, name: fromName },
            subject,
            html
        }));

        await provider.send(messages, {
            apiKey: masterApiKey,
            tenantToken,
            stream: 'transactional',
            churchId
        });

        console.log(`[QuickbooksNotification] Sent "${subject}" to ${recipients.length} recipients for church ${churchId}`);
        return { success: true, deliveredTo: recipients };
    } catch (err: any) {
        console.error('[QuickbooksNotification] Failed to send email notification:', err.message || err);
        return { success: false, deliveredTo: [], error: err.message || 'Unknown error' };
    }
}

/**
 * Builds HTML and sends an alert when a Giving Batch is ready to be deposited into QuickBooks
 */
export async function sendBatchReadyNotification(
    churchId: string,
    batch: GivingBatch,
    mapping: QuickbooksMappingConfig
): Promise<{ success: boolean; recipients: string[]; error?: string }> {
    if (!mapping.emailNotificationsEnabled) {
        return { success: false, recipients: [], error: 'Notifications are disabled in settings' };
    }
    if (mapping.notifyOnBatchReady === false) {
        return { success: false, recipients: [], error: 'Batch ready notifications are turned off' };
    }

    const recipients = await resolveNotificationRecipients(churchId, mapping);
    if (recipients.length === 0) {
        return { success: false, recipients: [], error: 'No recipient email addresses could be resolved' };
    }

    const db = getDb();
    const churchDoc = await db.collection('churches').doc(churchId).get();
    const churchName = (churchDoc.data() || {}).name || 'Your Church';

    const fmtCurrency = (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const batchDateStr = batch.date ? new Date(batch.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Recent';

    const fundRowsHtml = (batch.fundsBreakdown || []).map(f => `
        <tr style="border-bottom: 1px solid #e2e8f0;">
            <td style="padding: 10px 12px; font-size: 13px; color: #1e293b;">
                <strong>${escapeHtml(f.fundName)}</strong>
                ${f.campusName ? `<br/><span style="font-size: 11px; color: #64748b; font-weight: 500;">🏛️ ${escapeHtml(f.campusName)}</span>` : ''}
            </td>
            <td style="padding: 10px 12px; font-size: 13px; color: #1e293b; text-align: right;">${fmtCurrency(f.grossAmount)}</td>
            <td style="padding: 10px 12px; font-size: 13px; color: #dc2626; text-align: right;">${f.feeAmount > 0 ? `-${fmtCurrency(f.feeAmount)}` : '$0.00'}</td>
            <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: #0f172a; text-align: right;">${fmtCurrency(f.netAmount)}</td>
        </tr>
    `).join('');

    const subject = `🔔 Giving Batch Ready for Deposit: ${batch.name} (${fmtCurrency(batch.totalNet)})`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
        
        <!-- Header banner -->
        <tr>
          <td style="background:linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%);padding:28px 32px;text-align:left;">
            <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#bfdbfe;margin-bottom:4px;">
              ${escapeHtml(churchName)} · Planning Center Giving
            </div>
            <div style="font-size:22px;font-weight:800;color:#ffffff;">
              🔔 Giving Batch Ready to Sync
            </div>
            <div style="font-size:14px;color:#dbeafe;margin-top:6px;">
              A new giving batch is ready for deposit into QuickBooks Online.
            </div>
          </td>
        </tr>

        <!-- Summary Cards -->
        <tr>
          <td style="padding:28px 32px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr>
                <td style="background:#f1f5f9;border-radius:12px;padding:14px 18px;width:50%;">
                  <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#64748b;">Batch Name</div>
                  <div style="font-size:15px;font-weight:700;color:#0f172a;margin-top:2px;">${escapeHtml(batch.name)}</div>
                  <div style="font-size:12px;color:#64748b;margin-top:2px;">Date: ${batchDateStr}</div>
                </td>
                <td style="width:12px;"></td>
                <td style="background:#ecfdf5;border-radius:12px;padding:14px 18px;width:50%;border:1px solid #a7f3d0;">
                  <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#047857;">Net Bank Deposit</div>
                  <div style="font-size:20px;font-weight:900;color:#065f46;margin-top:2px;">${fmtCurrency(batch.totalNet)}</div>
                  <div style="font-size:12px;color:#047857;margin-top:2px;">${batch.donationCount} donations</div>
                </td>
              </tr>
            </table>

            <!-- Financial Totals Strip -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#faf5ff;border-radius:10px;padding:12px 16px;border:1px solid #f3e8ff;margin-bottom:24px;">
              <tr>
                <td style="font-size:13px;color:#6b21a8;">
                  Gross Giving: <strong>${fmtCurrency(batch.totalGross)}</strong>
                </td>
                <td style="font-size:13px;color:#991b1b;text-align:center;">
                  Processing Fees: <strong>${batch.totalFees > 0 ? `-${fmtCurrency(batch.totalFees)}` : '$0.00'}</strong>
                </td>
                <td style="font-size:13px;color:#1e3a8a;text-align:right;">
                  Type: <strong>${batch.batchType === 'stripe' ? 'Online (Stripe)' : 'Cash / Checks'}</strong>
                </td>
              </tr>
            </table>

            <!-- Fund Breakdown Table -->
            <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px;">
              Fund Breakdown
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
              <thead>
                <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
                  <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#475569;text-align:left;text-transform:uppercase;">Fund / Campus</th>
                  <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#475569;text-align:right;text-transform:uppercase;">Gross</th>
                  <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#475569;text-align:right;text-transform:uppercase;">Fees</th>
                  <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#475569;text-align:right;text-transform:uppercase;">Net</th>
                </tr>
              </thead>
              <tbody>
                ${fundRowsHtml || '<tr><td colspan="4" style="padding:12px;text-align:center;color:#64748b;">No fund breakdown data</td></tr>'}
              </tbody>
            </table>

          </td>
        </tr>

        <!-- Call to Action -->
        <tr>
          <td style="padding:12px 32px 28px;text-align:center;">
            <p style="font-size:13px;color:#475569;margin-bottom:16px;">
              Log in to review fund mappings and deposit this batch into your QuickBooks register.
            </p>
            <div style="display:inline-block;background:#2563eb;color:#ffffff;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">
              Review & Deposit in Pastoral Care
            </div>
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center;">
            <div style="font-size:11px;color:#94a3b8;">
              Pastoral Care for Planning Center · Automated Giving & Accounting Integration<br/>
              Notification sent based on your QuickBooks sync settings.
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const res = await sendEmailNotification(churchId, recipients, subject, html);
    return { success: res.success, recipients, error: res.error };
}

/**
 * Builds HTML and sends an alert when a Giving Batch has been deposited into QuickBooks Online
 */
export async function sendBatchSyncedNotification(
    churchId: string,
    batch: GivingBatch,
    depositResult: QuickbooksDepositResult,
    mapping: QuickbooksMappingConfig,
    syncedBy?: string
): Promise<{ success: boolean; recipients: string[]; error?: string }> {
    if (!mapping.emailNotificationsEnabled) {
        return { success: false, recipients: [], error: 'Notifications are disabled in settings' };
    }
    if (mapping.notifyOnBatchSynced === false) {
        return { success: false, recipients: [], error: 'Batch synced notifications are turned off' };
    }

    const recipients = await resolveNotificationRecipients(churchId, mapping);
    if (recipients.length === 0) {
        return { success: false, recipients: [], error: 'No recipient email addresses could be resolved' };
    }

    const db = getDb();
    const churchDoc = await db.collection('churches').doc(churchId).get();
    const churchName = (churchDoc.data() || {}).name || 'Your Church';

    const fmtCurrency = (n: number) => `$${(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
    const depositDateStr = depositResult.txnDate ? new Date(depositResult.txnDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : 'Today';

    const fundRowsHtml = (batch.fundsBreakdown || []).map(f => {
        // Resolve mapped QBO account & class for this fund line
        let lineAccount = mapping.fundMappings?.[f.fundId]?.qboAccountName || 'Income';
        let lineClass = mapping.fundMappings?.[f.fundId]?.qboClassName;

        if (mapping.enableCampusMapping && f.campusId && mapping.campusFundMappings?.[f.campusId]?.[f.fundId]) {
            const campusRule = mapping.campusFundMappings[f.campusId][f.fundId];
            lineAccount = campusRule.qboAccountName || lineAccount;
            lineClass = campusRule.qboClassName || lineClass;
        }

        return `
            <tr style="border-bottom: 1px solid #e2e8f0;">
                <td style="padding: 10px 12px; font-size: 13px; color: #1e293b;">
                    <strong>${escapeHtml(f.fundName)}</strong>
                    ${f.campusName ? `<span style="font-size: 11px; color: #64748b; font-weight: 500;"> (${escapeHtml(f.campusName)})</span>` : ''}
                </td>
                <td style="padding: 10px 12px; font-size: 12px; color: #0369a1;">
                    ${escapeHtml(lineAccount)}
                    ${lineClass ? `<br/><span style="font-size: 10px; color: #475569;">Class: ${escapeHtml(lineClass)}</span>` : ''}
                </td>
                <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: #0f172a; text-align: right;">
                    ${fmtCurrency(f.grossAmount)}
                </td>
            </tr>
        `;
    }).join('');

    const subject = `✅ Giving Batch Deposited to QuickBooks: ${batch.name} (${fmtCurrency(depositResult.totalAmount)})`;

    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1.0">
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:32px 16px;">
    <tr><td align="center">
      <table width="600" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.06);border:1px solid #e2e8f0;">
        
        <!-- Header banner -->
        <tr>
          <td style="background:linear-gradient(135deg, #059669 0%, #047857 100%);padding:28px 32px;text-align:left;">
            <div style="font-size:12px;font-weight:700;letter-spacing:1px;text-transform:uppercase;color:#a7f3d0;margin-bottom:4px;">
              ${escapeHtml(churchName)} · QuickBooks Online Integration
            </div>
            <div style="font-size:22px;font-weight:800;color:#ffffff;">
              ✅ Giving Batch Deposited
            </div>
            <div style="font-size:14px;color:#d1fae5;margin-top:6px;">
              Deposit transaction posted successfully to QuickBooks Online.
            </div>
          </td>
        </tr>

        <!-- Deposit Details Strip -->
        <tr>
          <td style="padding:28px 32px 16px;">
            <table width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:20px;">
              <tr>
                <td style="background:#f1f5f9;border-radius:12px;padding:14px 18px;width:50%;">
                  <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#64748b;">Target Bank Account</div>
                  <div style="font-size:15px;font-weight:700;color:#0f172a;margin-top:2px;">
                    🏦 ${escapeHtml(depositResult.depositBankAccountName || mapping.depositBankAccountName || 'Checking Account')}
                  </div>
                  <div style="font-size:12px;color:#64748b;margin-top:2px;">Date: ${depositDateStr}</div>
                </td>
                <td style="width:12px;"></td>
                <td style="background:#ecfdf5;border-radius:12px;padding:14px 18px;width:50%;border:1px solid #a7f3d0;">
                  <div style="font-size:11px;font-weight:600;text-transform:uppercase;color:#047857;">Net Bank Deposit</div>
                  <div style="font-size:20px;font-weight:900;color:#065f46;margin-top:2px;">${fmtCurrency(depositResult.totalAmount)}</div>
                  <div style="font-size:12px;color:#047857;margin-top:2px;">Deposit #${escapeHtml(depositResult.depositId)}</div>
                </td>
              </tr>
            </table>

            <!-- Metadata Box -->
            <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;border-radius:8px;padding:12px 16px;border:1px solid #e2e8f0;margin-bottom:20px;">
              <tr>
                <td style="font-size:13px;color:#475569;">
                  Batch: <strong>${escapeHtml(batch.name)}</strong>
                </td>
                <td style="font-size:13px;color:#475569;text-align:right;">
                  Deposited By: <strong>${escapeHtml(syncedBy || 'Staff User')}</strong>
                </td>
              </tr>
            </table>

            <!-- Breakdown Table -->
            <div style="font-size:14px;font-weight:700;color:#0f172a;margin-bottom:8px;">
              Deposit Line Items Credited
            </div>
            <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;margin-bottom:16px;">
              <thead>
                <tr style="background:#f8fafc;border-bottom:2px solid #e2e8f0;">
                  <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#475569;text-align:left;text-transform:uppercase;">Fund / Campus</th>
                  <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#475569;text-align:left;text-transform:uppercase;">QuickBooks Account</th>
                  <th style="padding:8px 12px;font-size:11px;font-weight:700;color:#475569;text-align:right;text-transform:uppercase;">Amount</th>
                </tr>
              </thead>
              <tbody>
                ${fundRowsHtml}
                ${batch.totalFees > 0 ? `
                  <tr style="background:#fff1f2;border-bottom: 1px solid #fecdd3;">
                    <td style="padding: 10px 12px; font-size: 13px; color: #991b1b; font-weight: 600;">
                      💳 Stripe Processing Fees
                    </td>
                    <td style="padding: 10px 12px; font-size: 12px; color: #991b1b;">
                      ${escapeHtml(mapping.stripeFeeExpenseAccountName || 'Merchant Fees')}
                    </td>
                    <td style="padding: 10px 12px; font-size: 13px; font-weight: 700; color: #dc2626; text-align: right;">
                      -${fmtCurrency(batch.totalFees)}
                    </td>
                  </tr>
                ` : ''}
              </tbody>
            </table>

            <div style="background:#f0fdf4;border-radius:8px;padding:12px;border:1px solid #bbf7d0;font-size:12px;color:#166534;">
              💡 <strong>Bank Feed Match:</strong> When your bank statement download appears in QuickBooks Banking, select <strong>Match</strong> to reconcile the register with zero duplicate income.
            </div>

          </td>
        </tr>

        <!-- Actions -->
        <tr>
          <td style="padding:12px 32px 28px;text-align:center;">
            ${depositResult.qboUrl ? `
              <a href="${escapeHtml(depositResult.qboUrl)}" target="_blank" style="display:inline-block;background:#059669;color:#ffffff;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;margin-right:8px;">
                View Deposit in QuickBooks Online →
              </a>
            ` : `
              <div style="display:inline-block;background:#059669;color:#ffffff;padding:12px 24px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">
                Deposit #${escapeHtml(depositResult.depositId)} Confirmed
              </div>
            `}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f8fafc;border-top:1px solid #e2e8f0;padding:16px 32px;text-align:center;">
            <div style="font-size:11px;color:#94a3b8;">
              Pastoral Care for Planning Center · Automated Giving & Accounting Integration<br/>
              Notification sent based on your QuickBooks sync settings.
            </div>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const res = await sendEmailNotification(churchId, recipients, subject, html);
    return { success: res.success, recipients, error: res.error };
}

/**
 * Sends a test email notification to verify recipient configuration and email deliverability
 */
export async function sendTestNotification(
    churchId: string,
    mapping: QuickbooksMappingConfig,
    testRecipientOverride?: string
): Promise<{ success: boolean; recipientCount: number; recipients: string[]; error?: string }> {
    let recipients: string[] = [];

    if (testRecipientOverride && EMAIL_REGEX.test(testRecipientOverride.trim())) {
        recipients = [testRecipientOverride.trim().toLowerCase()];
    } else {
        recipients = await resolveNotificationRecipients(churchId, mapping);
    }

    if (recipients.length === 0) {
        return {
            success: false,
            recipientCount: 0,
            recipients: [],
            error: 'No valid recipient email addresses found. Please enter an email address or select a Planning Center list with valid emails.'
        };
    }

    const recipientModeLabel = mapping.notificationRecipientType === 'pco_list'
        ? `Planning Center List: ${mapping.notificationPcoListName || mapping.notificationPcoListId}`
        : `Email Address: ${mapping.notificationEmail}`;

    const subject = `🧪 Test Notification: QuickBooks Giving Batch Integration`;
    const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="padding:32px 16px;">
    <tr><td align="center">
      <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:16px;box-shadow:0 4px 20px rgba(0,0,0,0.06);border:1px solid #e2e8f0;overflow:hidden;">
        <tr>
          <td style="background:#4f46e5;padding:24px 32px;text-align:center;">
            <div style="font-size:26px;margin-bottom:6px;">🧪</div>
            <div style="font-size:20px;font-weight:800;color:#ffffff;">QuickBooks Notification Test</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px 32px;">
            <p style="font-size:15px;color:#0f172a;line-height:1.5;margin-top:0;">
              This is a test notification from <strong>Pastoral Care for Planning Center</strong>.
            </p>
            <div style="background:#f1f5f9;border-radius:8px;padding:12px 16px;margin:16px 0;font-size:13px;color:#334155;">
              <div><strong>Recipient Mode:</strong> ${escapeHtml(recipientModeLabel)}</div>
              <div style="margin-top:4px;"><strong>Delivered to:</strong> ${escapeHtml(recipients.join(', '))}</div>
              <div style="margin-top:4px;"><strong>Ready Notifications:</strong> ${mapping.notifyOnBatchReady !== false ? 'Enabled' : 'Disabled'}</div>
              <div style="margin-top:4px;"><strong>Synced Notifications:</strong> ${mapping.notifyOnBatchSynced !== false ? 'Enabled' : 'Disabled'}</div>
            </div>
            <p style="font-size:13px;color:#64748b;margin-bottom:0;">
              If you received this message, your notification pipeline is properly configured and ready to notify your team when Giving batches are ready or synced.
            </p>
          </td>
        </tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;

    const res = await sendEmailNotification(churchId, recipients, subject, html);
    return {
        success: res.success,
        recipientCount: recipients.length,
        recipients,
        error: res.error
    };
}

function escapeHtml(str: string): string {
    return String(str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
