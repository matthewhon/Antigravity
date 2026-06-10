// ─── Postmark Provider Implementation ────────────────────────────────────────
//
// Implements the EmailProvider interface using the Postmark API.
// Active when system/settings.emailProvider = 'postmark'.
//
// Key architectural differences from SendGrid:
//   • Tenant isolation: Postmark Servers (one per church) vs SendGrid Subusers.
//   • Per-send auth:    X-Postmark-Server-Token header (per-server token) vs
//                       on-behalf-of header (master key + subuser ID).
//   • Domain auth:      2 DNS records (DKIM TXT + Return-Path CNAME) vs 3 CNAMEs.
//   • Message streams:  Separate 'outbound' (transactional) and 'broadcast' streams.
//
// Account-level operations (createServer, authenticateDomain) use the Account API
// token stored at system/settings.postmarkApiKey. Per-send calls use the
// per-server token stored at churches/{id}.emailSettings.postmarkServerToken.

import { createServerLogger } from '../services/logService.js';
import type { EmailProvider, EmailMessage, SendOptions, DnsRecord, DiagnosticCheck } from './emailProvider.js';

const PM_API = 'https://api.postmarkapp.com';
const SHARED_DOMAIN = 'pastoralcare.barnabassoftware.com';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function pmAccountHeaders(accountToken: string): Record<string, string> {
    return {
        'X-Postmark-Account-Token': accountToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
}

function pmServerHeaders(serverToken: string): Record<string, string> {
    return {
        'X-Postmark-Server-Token': serverToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
}

async function getAccountToken(db: any): Promise<string> {
    const snap = await db.doc('system/settings').get();
    const token: string = snap.data()?.postmarkApiKey || '';
    if (!token) {
        throw new Error('Postmark Account API token is not configured in App Config → System Settings → Email (Postmark).');
    }
    return token;
}

function extractDnsRecords(data: any): DnsRecord[] {
    const records: DnsRecord[] = [];

    // DKIM: Postmark returns DKIMHost (hostname) + DKIMTextValue (the TXT value)
    // or DKIMPendingHost + DKIMPendingTextValue if pending/rotating.
    const dkimHost = data.DKIMPendingHost || data.DKIMHost;
    const dkimText = data.DKIMPendingTextValue || data.DKIMTextValue;
    if (dkimHost && dkimText) {
        records.push({
            host: dkimHost,
            type: 'TXT',
            data: dkimText,
            label: 'DKIM',
        });
    }

    // Return-Path: Postmark returns ReturnPathDomain (host) + ReturnPathDomainCNAMEValue (target) or ReturnPathCNAMEValue
    const rpHost = data.ReturnPathDomain;
    const rpValue = data.ReturnPathDomainCNAMEValue || data.ReturnPathCNAMEValue;
    if (rpHost && rpValue) {
        records.push({
            host: rpHost,
            type: 'CNAME',
            data: rpValue,
            label: 'Return-Path',
        });
    }

    return records;
}

// ─── Provider class ───────────────────────────────────────────────────────────

export class PostmarkProvider implements EmailProvider {

    // ─── Send ─────────────────────────────────────────────────────────────────

    async send(messages: EmailMessage[], options: SendOptions): Promise<void> {
        const { apiKey, tenantToken, tag, stream = 'broadcast', churchId, campaignId } = options;

        // Use the per-server token if available; fall back to the account token
        // (account token cannot send mail — always prefer the server token)
        const serverToken = tenantToken || apiKey;
        if (!serverToken) {
            throw new Error('[Postmark] No server token available. Church may not be provisioned on Postmark yet.');
        }

        // Map stream type: 'transactional' → 'outbound', 'broadcast' → 'broadcast'
        const messageStream = stream === 'transactional' ? 'outbound' : 'broadcast';

        // Postmark batch endpoint accepts up to 500 messages per call
        const BATCH = 500;
        for (let i = 0; i < messages.length; i += BATCH) {
            const batch = messages.slice(i, i + BATCH);

            const payload = batch.map(m => ({
                From: m.from.name ? `${m.from.name} <${m.from.email}>` : m.from.email,
                To: m.to,
                ...(m.replyTo ? { ReplyTo: m.replyTo } : {}),
                Subject: m.subject,
                HtmlBody: m.html,
                ...(tag ? { Tag: tag } : {}),
                MessageStream: messageStream,
                TrackOpens: true,
                TrackLinks: 'HtmlAndText',
                // Metadata is echoed back in bounce/spam webhooks so we can
                // identify the tenant and campaign without scanning all churches.
                Metadata: {
                    ...(churchId   ? { churchId }   : {}),
                    ...(campaignId ? { campaignId } : {}),
                },
            }));

            const endpoint = batch.length === 1 ? `${PM_API}/email` : `${PM_API}/email/batch`;
            const body = batch.length === 1 ? JSON.stringify(payload[0]) : JSON.stringify(payload);

            const res = await fetch(endpoint, {
                method: 'POST',
                headers: pmServerHeaders(serverToken),
                body,
            });

            if (!res.ok) {
                const resBody = await res.json().catch(() => ({}));
                const errorCode = (resBody as any)?.ErrorCode;
                const message   = (resBody as any)?.Message || `Postmark HTTP ${res.status}`;
                throw new Error(`[Postmark] ErrorCode=${errorCode} ${message}`);
            }
        }
    }

    // ─── Provision Tenant (Server + Shared Sender Signature) ─────────────────

    async provisionTenant(db: any, churchId: string, prefix: string, fromName: string): Promise<{ fromEmail: string; tenantToken: string }> {
        const log = createServerLogger(db);
        const accountToken = await getAccountToken(db);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church = churchSnap.data() || {};
        const existing = church.emailSettings?.postmarkServerToken;

        let serverToken: string;
        let serverId: number;

        if (existing) {
            // Already provisioned — reuse existing server token
            serverToken = existing;
            serverId = church.emailSettings?.postmarkServerId;
            log.info(`Reusing existing Postmark Server for ${churchId}`, 'system', { churchId }, churchId);
        } else {
            // Create a new Postmark Server for this church tenant
            const serverName = `pco_${churchId.replace(/[^a-z0-9]/gi, '').substring(0, 20).toLowerCase()}`;

            const createRes = await fetch(`${PM_API}/servers`, {
                method: 'POST',
                headers: pmAccountHeaders(accountToken),
                body: JSON.stringify({
                    Name: serverName,
                    Color: 'Blue',
                    SmtpApiActivated: false,
                }),
            });

            if (!createRes.ok) {
                const errBody = await createRes.json().catch(() => ({}));
                const errMsg = (errBody as any)?.Message || `Postmark returned ${createRes.status}`;
                
                if (createRes.status === 422 && errMsg.toLowerCase().includes('already exists')) {
                    log.info(`Server "${serverName}" already exists. Fetching from Postmark...`, 'system', { churchId }, churchId);
                    const listRes = await fetch(`${PM_API}/servers?count=100&offset=0&name=${serverName}`, {
                        headers: pmAccountHeaders(accountToken),
                    });
                    if (listRes.ok) {
                        const listData = await listRes.json();
                        const existingServer = listData.Servers?.find((s: any) => s.Name.toLowerCase() === serverName.toLowerCase());
                        if (existingServer) {
                            serverId = existingServer.ID;
                            serverToken = existingServer.ApiTokens?.[0]?.Token;
                            log.info(`Recovered existing Postmark Server "${serverName}" (ID: ${serverId})`, 'system', { churchId, serverId }, churchId);
                        }
                    }
                }
                
                if (!serverToken) {
                    throw new Error(`Postmark Server creation failed: ${errMsg}`);
                }
            } else {
                const serverData = await createRes.json();
                serverId = serverData.ID;
                serverToken = serverData.ApiTokens?.[0]?.Token;
            }

            if (!serverToken) {
                throw new Error('Postmark Server created/recovered but no API token returned. Check Postmark account permissions.');
            }

            if (createRes.ok) {
                log.info(`Created Postmark Server "${serverName}" (ID: ${serverId}) for ${churchId}`, 'system', { churchId, serverId }, churchId);
            }
        }

        const fromEmail = `${prefix}@${SHARED_DOMAIN}`;
        const resolvedFromName = fromName || church.name || 'Church';

        await db.collection('churches').doc(churchId).update({
            emailSettings: {
                mode: 'shared',
                sharedPrefix: prefix,
                fromEmail,
                fromName: resolvedFromName,
                postmarkServerToken: serverToken,
                postmarkServerId: serverId,
            },
        });

        log.info(`Email provisioned for ${churchId}: ${fromEmail} (Postmark Server ID: ${serverId})`, 'system', { churchId, serverId }, churchId);
        return { fromEmail, tenantToken: serverToken };
    }

    // ─── Authenticate Custom Domain ───────────────────────────────────────────
    // Creates a Domain on the Postmark Server for this church and returns the
    // 2 DNS records (DKIM TXT + Return-Path CNAME) the admin needs to add.

    async authenticateDomain(db: any, churchId: string, domain: string, fromEmail?: string, fromName?: string): Promise<DnsRecord[]> {
        const log = createServerLogger(db);
        const accountToken = await getAccountToken(db);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church = churchSnap.data() || {};
        const existingSettings = church.emailSettings || {};

        // Auto-provision a dedicated Postmark Server for this tenant if one does not exist yet
        let serverToken = existingSettings.postmarkServerToken;
        let serverId = existingSettings.postmarkServerId;

        if (!serverToken) {
            log.info(`No Postmark Server found for ${churchId} during domain authentication. Auto-provisioning server...`, 'system', { churchId }, churchId);
            const serverName = `pco_${churchId.replace(/[^a-z0-9]/gi, '').substring(0, 20).toLowerCase()}`;
            try {
                const createRes = await fetch(`${PM_API}/servers`, {
                    method: 'POST',
                    headers: pmAccountHeaders(accountToken),
                    body: JSON.stringify({
                        Name: serverName,
                        Color: 'Blue',
                        SmtpApiActivated: false,
                    }),
                });

                if (!createRes.ok) {
                    const errBody = await createRes.json().catch(() => ({}));
                    const errMsg = (errBody as any)?.Message || `Postmark returned ${createRes.status}`;
                    
                    if (createRes.status === 422 && errMsg.toLowerCase().includes('already exists')) {
                        log.info(`Server "${serverName}" already exists. Fetching from Postmark...`, 'system', { churchId }, churchId);
                        const listRes = await fetch(`${PM_API}/servers?count=100&offset=0&name=${serverName}`, {
                            headers: pmAccountHeaders(accountToken),
                        });
                        if (listRes.ok) {
                            const listData = await listRes.json();
                            const existingServer = listData.Servers?.find((s: any) => s.Name.toLowerCase() === serverName.toLowerCase());
                            if (existingServer) {
                                serverId = existingServer.ID;
                                serverToken = existingServer.ApiTokens?.[0]?.Token;
                                log.info(`Recovered existing Postmark Server "${serverName}" (ID: ${serverId})`, 'system', { churchId, serverId }, churchId);
                            }
                        }
                    }

                    if (!serverToken) {
                        throw new Error(`Auto-provisioning Server failed: ${errMsg}`);
                    }
                } else {
                    const serverData = await createRes.json();
                    serverId = serverData.ID;
                    serverToken = serverData.ApiTokens?.[0]?.Token;
                }

                if (!serverToken) {
                    throw new Error('Postmark Server created/recovered but no API token returned.');
                }
                
                if (createRes.ok) {
                    log.info(`Auto-created Postmark Server "${serverName}" (ID: ${serverId}) for ${churchId}`, 'system', { churchId, serverId }, churchId);
                }
            } catch (serverErr: any) {
                log.error(`Failed to auto-create Postmark Server: ${serverErr.message}`, 'system', { churchId }, churchId);
                throw new Error(`Postmark Server creation is required before domain setup: ${serverErr.message}`);
            }
        }

        // Check if domain is already registered in Postmark
        if (existingSettings.postmarkDomainId) {
            // Fetch fresh DNS records from the existing domain registration
            const detailRes = await fetch(`${PM_API}/domains/${existingSettings.postmarkDomainId}`, {
                headers: pmAccountHeaders(accountToken),
            });
            if (detailRes.ok) {
                const detail = await detailRes.json();
                const dnsRecords = extractDnsRecords(detail);
                await db.collection('churches').doc(churchId).update({
                    emailSettings: {
                        ...existingSettings,
                        mode: 'custom',
                        customDomain: domain,
                        fromEmail: fromEmail || existingSettings.fromEmail || `contact@${domain}`,
                        fromName: fromName || existingSettings.fromName || church.name || 'Church',
                        dnsRecords,
                        domainVerified: false,
                        ...(serverToken ? { postmarkServerToken: serverToken } : {}),
                        ...(serverId ? { postmarkServerId: serverId } : {}),
                    },
                });
                log.info(`Reusing existing Postmark domain registration for ${domain}`, 'system', { churchId }, churchId);
                return dnsRecords;
            }
        }

        // Create a new domain in Postmark
        const createRes = await fetch(`${PM_API}/domains`, {
            method: 'POST',
            headers: pmAccountHeaders(accountToken),
            body: JSON.stringify({ Name: domain }),
        });

        if (!createRes.ok) {
            const errBody = await createRes.json().catch(() => ({}));
            const errMsg = (errBody as any)?.Message || `Postmark returned ${createRes.status}`;
            throw new Error(`Domain authentication failed: ${errMsg}`);
        }

        const domainData = await createRes.json();
        const domainId: number = domainData.ID;
        const dnsRecords = extractDnsRecords(domainData);

        await db.collection('churches').doc(churchId).update({
            emailSettings: {
                ...existingSettings,
                mode: 'custom',
                customDomain: domain,
                fromEmail: fromEmail || existingSettings.fromEmail || `contact@${domain}`,
                fromName: fromName || existingSettings.fromName || church.name || 'Church',
                postmarkDomainId: domainId,
                dnsRecords,
                domainVerified: false,
                ...(serverToken ? { postmarkServerToken: serverToken } : {}),
                ...(serverId ? { postmarkServerId: serverId } : {}),
            },
        });

        log.info(`Created Postmark domain registration for ${domain} (ID: ${domainId})`, 'system', { churchId, domainId }, churchId);
        return dnsRecords;
    }

    // ─── Verify Domain ────────────────────────────────────────────────────────

    async verifyDomain(db: any, churchId: string): Promise<{ verified: boolean; message: string; dnsRecords?: DnsRecord[] }> {
        const log = createServerLogger(db);
        const accountToken = await getAccountToken(db);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church = churchSnap.data() || {};
        const emailSettings = church.emailSettings || {};
        const { postmarkDomainId } = emailSettings;

        if (!postmarkDomainId) {
            throw new Error('No Postmark domain registration found. Click "Get DNS Records" first.');
        }

        // Trigger DKIM verification
        const dkimRes = await fetch(`${PM_API}/domains/${postmarkDomainId}/verifyDkim`, {
            method: 'PUT',
            headers: pmAccountHeaders(accountToken),
        });

        // Trigger Return-Path verification
        const rpRes = await fetch(`${PM_API}/domains/${postmarkDomainId}/verifyReturnPath`, {
            method: 'PUT',
            headers: pmAccountHeaders(accountToken),
        });

        const dkimData = await dkimRes.json().catch(() => ({}));
        const rpData   = await rpRes.json().catch(() => ({}));

        const dkimVerified = (dkimData as any)?.DKIMVerified === true;
        const rpVerified   = (rpData as any)?.ReturnPathDomainVerified === true;
        const isVerified   = dkimVerified && rpVerified;

        // Fetch fresh DNS records
        let dnsRecords: DnsRecord[] = emailSettings.dnsRecords || [];
        try {
            const detailRes = await fetch(`${PM_API}/domains/${postmarkDomainId}`, {
                headers: pmAccountHeaders(accountToken),
            });
            if (detailRes.ok) {
                const detail = await detailRes.json();
                const fresh = extractDnsRecords(detail);
                if (fresh.length > 0) dnsRecords = fresh;
            }
        } catch { /* non-fatal */ }

        await db.collection('churches').doc(churchId).update({
            'emailSettings.domainVerified': isVerified,
            'emailSettings.dnsRecords': dnsRecords,
        });

        log.info(`Postmark domain verification for ${churchId}: DKIM=${dkimVerified} ReturnPath=${rpVerified}`, 'system', { churchId, postmarkDomainId }, churchId);

        if (isVerified) {
            return { verified: true, message: '✓ Domain verified! Your custom domain is ready to send.', dnsRecords };
        }

        const pending: string[] = [];
        if (!dkimVerified) pending.push('DKIM');
        if (!rpVerified)   pending.push('Return-Path');
        return {
            verified: false,
            message: `DNS has not fully propagated yet. Still waiting on: ${pending.join(', ')}. This can take up to 48 hours.`,
            dnsRecords,
        };
    }

    // ─── Diagnose Domain ──────────────────────────────────────────────────────

    async diagnoseDomain(db: any, churchId: string, testEmailAddress: string): Promise<{ success: boolean; checks: DiagnosticCheck[] }> {
        const log = createServerLogger(db);
        const checks: DiagnosticCheck[] = [];
        const accountToken = await getAccountToken(db);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church = churchSnap.data() || {};
        const emailSettings = church.emailSettings || {};
        const { postmarkDomainId, postmarkServerToken, customDomain, fromEmail, fromName, domainVerified } = emailSettings;

        // Check 1: Postmark Server token exists
        if (!postmarkServerToken) {
            checks.push({ label: 'Postmark Server token exists', status: 'fail', detail: 'No postmarkServerToken found. Provision the church first.' });
        } else {
            checks.push({ label: 'Postmark Server token exists', status: 'pass', detail: 'Server token is stored.' });
        }

        // Check 2: Domain ID exists
        if (!postmarkDomainId) {
            checks.push({ label: 'Postmark domain registration exists', status: 'fail', detail: 'No postmarkDomainId found. Click "Get DNS Records" first.' });
            return { success: false, checks };
        }
        checks.push({ label: 'Postmark domain registration exists', status: 'pass', detail: `Domain ID: ${postmarkDomainId}` });

        // Check 3: DNS verified flag
        checks.push({
            label: 'DNS verified flag in database',
            status: domainVerified ? 'pass' : 'fail',
            detail: domainVerified ? 'Firestore shows domain as verified.' : 'domainVerified = false. Click "Verify DNS" after DNS propagates.',
        });

        // Check 4: Fetch domain from Postmark
        let pmDomainData: any = null;
        try {
            const detailRes = await fetch(`${PM_API}/domains/${postmarkDomainId}`, {
                headers: pmAccountHeaders(accountToken),
            });
            if (detailRes.ok) {
                pmDomainData = await detailRes.json();
                const dkimOk = pmDomainData.DKIMVerified === true;
                const rpOk   = pmDomainData.ReturnPathDomainVerified === true;
                checks.push({ label: 'DKIM record verified', status: dkimOk ? 'pass' : 'fail', detail: dkimOk ? 'DKIM TXT record verified.' : 'DKIM not yet verified. Check DNS and click "Verify DNS".' });
                checks.push({ label: 'Return-Path record verified', status: rpOk ? 'pass' : 'fail', detail: rpOk ? 'Return-Path CNAME verified.' : 'Return-Path CNAME not yet verified.' });
            } else {
                const body = await detailRes.json().catch(() => ({}));
                checks.push({ label: 'Domain found in Postmark', status: 'fail', detail: `Postmark returned ${detailRes.status}: ${(body as any)?.Message || 'Not found'}` });
            }
        } catch (e: any) {
            checks.push({ label: 'Domain found in Postmark', status: 'fail', detail: e.message });
        }

        // Check 5: From email domain matches
        const resolvedFromEmail = fromEmail || `contact@${customDomain}`;
        const fromDomain = resolvedFromEmail.split('@')[1]?.toLowerCase();
        const domainMatch = fromDomain === (customDomain || '').toLowerCase();
        checks.push({
            label: 'From email domain matches authenticated domain',
            status: domainMatch ? 'pass' : 'fail',
            detail: domainMatch
                ? `"${resolvedFromEmail}" matches "${customDomain}"`
                : `"${resolvedFromEmail}" does NOT match "${customDomain}". Update From Email in settings.`,
        });

        // Check 6: Send test email via Postmark
        if (postmarkServerToken) {
            try {
                const resolvedFromName = fromName || church.name || 'Church';
                const res = await fetch(`${PM_API}/email`, {
                    method: 'POST',
                    headers: pmServerHeaders(postmarkServerToken),
                    body: JSON.stringify({
                        From: `${resolvedFromName} <${resolvedFromEmail}>`,
                        To: testEmailAddress,
                        Subject: `✅ Test Email — ${customDomain} domain check`,
                        HtmlBody: `<div style="font-family:sans-serif;max-width:480px;margin:40px auto;padding:32px;border:1px solid #e2e8f0;border-radius:16px">
                            <h2 style="color:#4f46e5;margin:0 0 12px">Domain Test Successful 🎉</h2>
                            <p style="color:#475569;line-height:1.6">This test email confirms that <strong>${customDomain}</strong> is correctly authenticated with Postmark.</p>
                            <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0">
                            <p style="color:#94a3b8;font-size:12px">Sent via Pastoral Care · Postmark Domain ID: ${postmarkDomainId}</p>
                        </div>`,
                        MessageStream: 'outbound',
                        TrackOpens: true,
                    }),
                });

                if (res.ok) {
                    checks.push({ label: `Test email sent to ${testEmailAddress}`, status: 'pass', detail: `Successfully sent from ${resolvedFromEmail} via Postmark.` });
                } else {
                    const errBody = await res.json().catch(() => ({}));
                    const errMsg = (errBody as any)?.Message || `Postmark HTTP ${res.status}`;
                    checks.push({ label: `Test email to ${testEmailAddress}`, status: 'fail', detail: `Send failed: ${errMsg}` });
                }
            } catch (sendErr: any) {
                checks.push({ label: `Test email to ${testEmailAddress}`, status: 'fail', detail: sendErr.message });
            }
        }

        const allPassed = checks.every(c => c.status !== 'fail');
        log.info(`Postmark domain diagnosis for ${churchId}: ${allPassed ? 'ALL PASS' : 'ISSUES FOUND'}`, 'system', { churchId, postmarkDomainId }, churchId);
        return { success: allPassed, checks };
    }
}
