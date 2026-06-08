// ─── SendGrid Provider Implementation ────────────────────────────────────────
//
// Implements the EmailProvider interface using the SendGrid v3 API.
// All existing SendGrid logic is preserved verbatim — this is a pure refactor
// that moves the code from sendEmail.ts / emailProvisioning.ts into a class.
//
// Active when system/settings.emailProvider = 'sendgrid' (or is unset).

import { createServerLogger } from '../services/logService.js';
import type { EmailProvider, EmailMessage, SendOptions, DnsRecord, DiagnosticCheck } from './emailProvider.js';

const SHARED_DOMAIN = 'pastoralcare.barnabassoftware.com';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sgHeaders(apiKey: string, subuserId?: string): Record<string, string> {
    const headers: Record<string, string> = {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };
    if (subuserId) {
        headers['on-behalf-of'] = subuserId;
    }
    return headers;
}

function extractCnameRecords(data: any): DnsRecord[] {
    const records: DnsRecord[] = [];
    const dns = data?.dns || {};
    const possibleKeys = ['mail_cname', 'dkim1', 'dkim2', 's1', 's2', 'mail_server'];
    for (const key of possibleKeys) {
        if (dns[key] && dns[key].type === 'cname') {
            records.push({
                host: dns[key].host,
                type: 'CNAME',
                data: dns[key].data,
                label: key,
            });
        }
    }
    // Fallback: iterate all keys for any cname entries
    if (records.length === 0) {
        for (const key of Object.keys(dns)) {
            const entry = dns[key];
            if (entry?.type === 'cname' || entry?.type === 'CNAME') {
                records.push({ host: entry.host, type: 'CNAME', data: entry.data, label: key });
            }
        }
    }
    return records;
}

async function getMasterApiKey(db: any): Promise<string> {
    const snap = await db.doc('system/settings').get();
    const key: string = snap.data()?.sendGridApiKey || '';
    if (!key || !key.startsWith('SG.')) {
        throw new Error('Master SendGrid API key is not configured in App Config → System Settings.');
    }
    return key;
}

// ─── Provider class ───────────────────────────────────────────────────────────

export class SendGridProvider implements EmailProvider {

    // ─── Send ─────────────────────────────────────────────────────────────────

    async send(messages: EmailMessage[], options: SendOptions): Promise<void> {
        const { apiKey, tenantToken: subuserId, tag: campaignId } = options;

        // SendGrid batches all personalizations in a single request
        const personalizations = messages.map(m => ({ to: [{ email: m.to }] }));
        const firstMsg = messages[0];

        const payload: Record<string, any> = {
            personalizations,
            from: firstMsg.from,
            subject: firstMsg.subject,
            content: [{ type: 'text/html', value: firstMsg.html }],
            tracking_settings: {
                click_tracking: { enable: true, enable_text: false },
                open_tracking: { enable: true },
            },
        };
        if (campaignId) {
            payload.categories = [campaignId];
        }
        if (firstMsg.replyTo) {
            payload.reply_to = { email: firstMsg.replyTo };
        }

        const res = await fetch('https://api.sendgrid.com/v3/mail/send', {
            method: 'POST',
            headers: sgHeaders(apiKey, subuserId),
            body: JSON.stringify(payload),
        });

        if (!res.ok && res.status !== 202) {
            const body = await res.json().catch(() => ({}));
            const errors: any[] = (body as any)?.errors || [];
            const fromAddr = firstMsg.from.email;
            const detail = errors.length > 0
                ? errors.map((e: any) => e.message).join('; ')
                : `SendGrid HTTP ${res.status}`;
            throw new Error(`[SendGrid] from=${fromAddr} status=${res.status}: ${detail}`);
        }
    }

    // ─── Provision Tenant (Subuser + Shared Domain) ───────────────────────────

    async provisionTenant(db: any, churchId: string, prefix: string, fromName: string): Promise<{ fromEmail: string; tenantToken: string }> {
        const log = createServerLogger(db);
        const masterKey = await getMasterApiKey(db);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church = churchSnap.data() || {};
        const existing = church.emailSettings?.sendGridSubuserId;

        let subuserId: string;

        if (existing) {
            subuserId = existing;
        } else {
            subuserId = `pco_${churchId.replace(/[^a-z0-9]/gi, '').substring(0, 20).toLowerCase()}`;
            const fromEmail = `${prefix}@${SHARED_DOMAIN}`;

            const createRes = await fetch('https://api.sendgrid.com/v3/subusers', {
                method: 'POST',
                headers: sgHeaders(masterKey),
                body: JSON.stringify({
                    username: subuserId,
                    email: fromEmail,
                    password: `${subuserId}!${Date.now()}`,
                    ips: [],
                }),
            });

            if (!createRes.ok) {
                const errBody = await createRes.json().catch(() => ({}));
                if (createRes.status !== 409) {
                    const errMsg = errBody?.errors?.[0]?.message || `SendGrid returned ${createRes.status}`;
                    throw new Error(`Subuser creation failed: ${errMsg}`);
                }
            }

            // Associate the master shared domain with this subuser
            try {
                const domainsRes = await fetch('https://api.sendgrid.com/v3/whitelabel/domains?limit=50', {
                    headers: sgHeaders(masterKey),
                });
                if (domainsRes.ok) {
                    const domains: any[] = await domainsRes.json();
                    const sharedDomainAuth = domains.find((d: any) =>
                        d.domain === SHARED_DOMAIN && d.valid === true
                    );
                    if (sharedDomainAuth) {
                        await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${sharedDomainAuth.id}/subuser`, {
                            method: 'POST',
                            headers: sgHeaders(masterKey),
                            body: JSON.stringify({ username: subuserId }),
                        });
                        log.info(`Shared domain auth ${sharedDomainAuth.id} associated to subuser ${subuserId}`, 'system', { churchId }, churchId);
                    } else {
                        log.warn(`No verified domain auth found for ${SHARED_DOMAIN} in master account`, 'system', { churchId }, churchId);
                    }
                }
            } catch (domainErr: any) {
                log.warn(`Could not associate domain auth to subuser: ${domainErr.message}`, 'system', { churchId }, churchId);
            }
        }

        const fromEmail = `${prefix}@${SHARED_DOMAIN}`;
        const emailSettings = {
            mode: 'shared',
            sharedPrefix: prefix,
            fromEmail,
            fromName: fromName || church.name || 'Church',
            sendGridSubuserId: subuserId,
        };

        await db.collection('churches').doc(churchId).update({ emailSettings });
        log.info(`Email provisioned for ${churchId}: ${fromEmail} (subuser: ${subuserId})`, 'system', { churchId, subuserId }, churchId);

        return { fromEmail, tenantToken: subuserId };
    }

    // ─── Authenticate Custom Domain ───────────────────────────────────────────

    async authenticateDomain(db: any, churchId: string, domain: string, fromEmail?: string, fromName?: string): Promise<DnsRecord[]> {
        const log = createServerLogger(db);
        const masterKey = await getMasterApiKey(db);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church = churchSnap.data() || {};
        const existingSettings = church.emailSettings || {};

        // Search for existing master-account domain auth
        const listRes = await fetch('https://api.sendgrid.com/v3/whitelabel/domains?limit=200', {
            headers: sgHeaders(masterKey),
        });

        let existingMasterAuthId: string | null = null;
        let existingMasterCnames: DnsRecord[] = [];

        if (listRes.ok) {
            const allDomains: any[] = await listRes.json();
            const match = allDomains.find(
                (d: any) => (d.domain || '').toLowerCase() === domain.toLowerCase()
            );
            if (match) {
                existingMasterAuthId = String(match.id);
                existingMasterCnames = extractCnameRecords(match);
            }
        }

        // Clean up any subuser-owned domain auth for this domain
        const subuserId: string | undefined = existingSettings.sendGridSubuserId;
        if (!existingMasterAuthId && subuserId) {
            try {
                const subuserListRes = await fetch('https://api.sendgrid.com/v3/whitelabel/domains?limit=200', {
                    headers: sgHeaders(masterKey, subuserId),
                });
                if (subuserListRes.ok) {
                    const subuserDomains: any[] = await subuserListRes.json();
                    const subuserMatch = subuserDomains.find(
                        (d: any) => (d.domain || '').toLowerCase() === domain.toLowerCase()
                    );
                    if (subuserMatch) {
                        await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${subuserMatch.id}`, {
                            method: 'DELETE',
                            headers: sgHeaders(masterKey, subuserId),
                        });
                    }
                }
            } catch (subuserErr: any) {
                log.warn(`Could not check/delete subuser domain auth: ${subuserErr.message}`, 'system', { churchId }, churchId);
            }
        }

        let domainAuthId: string;
        let cnameRecords: DnsRecord[];

        if (existingMasterAuthId) {
            domainAuthId = existingMasterAuthId;
            cnameRecords = existingMasterCnames;
        } else {
            const authRes = await fetch('https://api.sendgrid.com/v3/whitelabel/domains', {
                method: 'POST',
                headers: sgHeaders(masterKey),
                body: JSON.stringify({
                    domain,
                    subdomain: 'em',
                    automatic_security: true,
                    custom_spf: false,
                    default: false,
                }),
            });

            if (!authRes.ok) {
                const errBody = await authRes.json().catch(() => ({}));
                const errMsg = errBody?.errors?.[0]?.message || `SendGrid returned ${authRes.status}`;
                throw new Error(`Domain authentication failed: ${errMsg}`);
            }

            const authData = await authRes.json();
            domainAuthId = String(authData.id);
            cnameRecords = extractCnameRecords(authData);
        }

        const resolvedFromEmail = fromEmail || existingSettings.fromEmail || `contact@${domain}`;
        const resolvedFromName = fromName || existingSettings.fromName || church.name || 'Church';

        await db.collection('churches').doc(churchId).update({
            emailSettings: {
                ...existingSettings,
                mode: 'custom',
                customDomain: domain,
                fromEmail: resolvedFromEmail,
                fromName: resolvedFromName,
                domainAuthId,
                cnameRecords,
                domainVerified: false,
            },
        });

        log.info(`Domain auth configured for ${churchId}: ${domain} (authId: ${domainAuthId})`, 'system', { churchId, domain }, churchId);
        return cnameRecords;
    }

    // ─── Verify Domain ────────────────────────────────────────────────────────

    async verifyDomain(db: any, churchId: string): Promise<{ verified: boolean; message: string; dnsRecords?: DnsRecord[] }> {
        const log = createServerLogger(db);
        const masterKey = await getMasterApiKey(db);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church = churchSnap.data() || {};
        const emailSettings = church.emailSettings || {};
        const { domainAuthId } = emailSettings;

        if (!domainAuthId) {
            throw new Error('No domain authentication is pending for this church.');
        }

        const verifyRes = await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${domainAuthId}/validate`, {
            method: 'POST',
            headers: sgHeaders(masterKey),
        });

        const verifyData = await verifyRes.json().catch(() => ({}));
        const isValid: boolean = verifyData.valid === true;

        let cnameRecords: DnsRecord[] = emailSettings.cnameRecords || [];
        try {
            const detailRes = await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${domainAuthId}`, {
                headers: sgHeaders(masterKey),
            });
            if (detailRes.ok) {
                const detail = await detailRes.json();
                const freshRecords = extractCnameRecords(detail);
                if (freshRecords.length > 0) cnameRecords = freshRecords;
            }
        } catch (detailErr: any) {
            log.warn(`Could not refresh CNAME records during verification: ${detailErr.message}`, 'system', { churchId }, churchId);
        }

        await db.collection('churches').doc(churchId).update({
            'emailSettings.domainVerified': isValid,
            'emailSettings.cnameRecords': cnameRecords,
        });

        // Associate validated domain with subuser for reputation isolation
        if (isValid) {
            const subuserId: string | undefined = emailSettings.sendGridSubuserId;
            if (subuserId) {
                try {
                    const assocRes = await fetch(
                        `https://api.sendgrid.com/v3/whitelabel/domains/${domainAuthId}/subuser`,
                        {
                            method: 'POST',
                            headers: sgHeaders(masterKey),
                            body: JSON.stringify({ username: subuserId }),
                        }
                    );
                    if (assocRes.ok || assocRes.status === 400) {
                        log.info(`Domain auth #${domainAuthId} associated with subuser ${subuserId}`, 'system', { churchId }, churchId);
                    }
                } catch (assocErr: any) {
                    log.warn(`Subuser domain association failed: ${assocErr.message}`, 'system', { churchId }, churchId);
                }
            }
        }

        log.info(`Domain verification for ${churchId}: ${isValid ? 'VERIFIED' : 'PENDING'}`, 'system', { churchId, domainAuthId }, churchId);
        return {
            verified: isValid,
            message: isValid
                ? '✓ Domain verified! Your custom domain is ready to send.'
                : 'DNS has not propagated yet. This can take up to 48 hours. Try again soon.',
            dnsRecords: cnameRecords,
        };
    }

    // ─── Diagnose Domain ──────────────────────────────────────────────────────

    async diagnoseDomain(db: any, churchId: string, testEmailAddress: string): Promise<{ success: boolean; checks: DiagnosticCheck[] }> {
        const log = createServerLogger(db);
        const checks: DiagnosticCheck[] = [];

        const masterKey = await getMasterApiKey(db);
        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church = churchSnap.data() || {};
        const emailSettings = church.emailSettings || {};
        const { domainAuthId, customDomain, fromEmail, fromName, sendGridSubuserId, domainVerified } = emailSettings;

        // Check 1: domainAuthId exists
        if (!domainAuthId) {
            checks.push({ label: 'Domain auth ID exists in settings', status: 'fail', detail: 'No domainAuthId found. Click "Get DNS Records" in Step 1 first.' });
            return { success: false, checks };
        }
        checks.push({ label: 'Domain auth ID exists in settings', status: 'pass', detail: `Auth ID: ${domainAuthId}` });

        // Check 2: domainVerified flag
        checks.push({
            label: 'DNS verified flag in database',
            status: domainVerified ? 'pass' : 'fail',
            detail: domainVerified
                ? 'Firestore shows domain as verified.'
                : 'domainVerified = false. Click "Verify DNS" in Step 3 after DNS propagates.',
        });

        // Check 3: Fetch domain auth from SendGrid
        let sgDomainData: any = null;
        try {
            const detailRes = await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${domainAuthId}`, {
                headers: sgHeaders(masterKey),
            });
            if (detailRes.ok) {
                sgDomainData = await detailRes.json();
                checks.push({ label: 'Domain auth found in SendGrid master account', status: 'pass', detail: `Domain: ${sgDomainData.domain}` });
            } else {
                const body = await detailRes.json().catch(() => ({}));
                checks.push({ label: 'Domain auth found in SendGrid master account', status: 'fail', detail: `SendGrid returned ${detailRes.status}: ${body?.errors?.[0]?.message || 'Not found'}` });
            }
        } catch (e: any) {
            checks.push({ label: 'Domain auth found in SendGrid master account', status: 'fail', detail: e.message });
        }

        // Check 4: DNS validity
        if (sgDomainData) {
            const sgValid: boolean = sgDomainData.valid === true;
            checks.push({
                label: 'DNS records valid in SendGrid',
                status: sgValid ? 'pass' : 'fail',
                detail: sgValid ? 'All CNAME records resolved correctly.' : 'DNS not yet valid. Records may still be propagating (up to 48h).',
            });
            if (!sgValid && sgDomainData.dns) {
                const failing: string[] = [];
                for (const [key, val] of Object.entries(sgDomainData.dns as Record<string, any>)) {
                    if (val && val.valid === false) failing.push(`${key}: ${val.host}`);
                }
                if (failing.length > 0) {
                    checks.push({ label: 'Failing DNS records', status: 'warn', detail: failing.join('\n') });
                }
            }
        }

        // Check 5: Subuser association
        if (sendGridSubuserId && sgDomainData) {
            let isAssociated = false;
            let associationDetail = '';
            try {
                const subuserDomainsRes = await fetch('https://api.sendgrid.com/v3/whitelabel/domains?limit=200', {
                    headers: sgHeaders(masterKey, sendGridSubuserId),
                });
                if (subuserDomainsRes.ok) {
                    const subuserDomains: any[] = await subuserDomainsRes.json();
                    const match = subuserDomains.find(
                        (d: any) => String(d.id) === String(domainAuthId) ||
                                    (d.domain || '').toLowerCase() === (customDomain || '').toLowerCase()
                    );
                    isAssociated = !!match;
                    if (!isAssociated && sgDomainData.valid === true) {
                        const assocRes = await fetch(
                            `https://api.sendgrid.com/v3/whitelabel/domains/${domainAuthId}/subuser`,
                            { method: 'POST', headers: sgHeaders(masterKey), body: JSON.stringify({ username: sendGridSubuserId }) }
                        );
                        if (assocRes.ok || assocRes.status === 400) {
                            isAssociated = true;
                            associationDetail = `Auto-associated with subuser "${sendGridSubuserId}" during diagnostics.`;
                        }
                    } else if (isAssociated) {
                        associationDetail = `Associated with subuser "${sendGridSubuserId}".`;
                    } else {
                        associationDetail = `Not yet associated with subuser "${sendGridSubuserId}". DNS may still be propagating.`;
                    }
                }
            } catch (assocCheckErr: any) {
                associationDetail = `Could not verify association: ${assocCheckErr.message}`;
            }
            checks.push({ label: 'Domain associated with tenant subuser', status: isAssociated ? 'pass' : 'warn', detail: associationDetail });
        }

        // Check 6: From email domain matches
        const resolvedFromEmail = fromEmail || `contact@${customDomain}`;
        const fromDomain = resolvedFromEmail.split('@')[1]?.toLowerCase();
        const domainMatch = fromDomain === (customDomain || '').toLowerCase();
        checks.push({
            label: 'From email domain matches authenticated domain',
            status: domainMatch ? 'pass' : 'fail',
            detail: domainMatch
                ? `"${resolvedFromEmail}" matches domain "${customDomain}"`
                : `"${resolvedFromEmail}" does NOT match "${customDomain}". Update From Email in settings.`,
        });

        // Check 7: Send test email
        try {
            const resolvedFromName = fromName || church.name || 'Church';
            const payload = {
                personalizations: [{ to: [{ email: testEmailAddress }] }],
                from: { email: resolvedFromEmail, name: resolvedFromName },
                subject: `✅ Test Email — ${customDomain} domain check`,
                content: [{
                    type: 'text/html',
                    value: `<div style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px">
                        <h2 style="color:#4f46e5;margin:0 0 12px">Domain Test Successful 🎉</h2>
                        <p style="color:#475569;line-height:1.6">This test email confirms that <strong>${customDomain}</strong> is correctly authenticated with SendGrid and emails can be delivered from <strong>${resolvedFromEmail}</strong>.</p>
                        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
                        <p style="color:#94a3b8;font-size:12px">Sent via Pastoral Care · Auth ID: ${domainAuthId}</p>
                    </div>`,
                }],
            };

            const sendRes = await fetch('https://api.sendgrid.com/v3/mail/send', {
                method: 'POST',
                headers: sendGridSubuserId ? sgHeaders(masterKey, sendGridSubuserId) : sgHeaders(masterKey),
                body: JSON.stringify(payload),
            });

            if (sendRes.ok || sendRes.status === 202) {
                checks.push({ label: `Test email sent to ${testEmailAddress}`, status: 'pass', detail: `Successfully sent from ${resolvedFromEmail}.` });
            } else {
                const errBody = await sendRes.json().catch(() => ({}));
                const errMsg = (errBody as any)?.errors?.map((e: any) => e.message).join('; ') || `SendGrid HTTP ${sendRes.status}`;
                checks.push({ label: `Test email to ${testEmailAddress}`, status: 'fail', detail: `Send failed: ${errMsg}` });
            }
        } catch (sendErr: any) {
            checks.push({ label: `Test email to ${testEmailAddress}`, status: 'fail', detail: sendErr.message });
        }

        const allPassed = checks.every(c => c.status !== 'fail');
        log.info(`Domain diagnosis for ${churchId} (${customDomain}): ${allPassed ? 'ALL PASS' : 'ISSUES FOUND'}`, 'system', { churchId, domainAuthId }, churchId);
        return { success: allPassed, checks };
    }
}
