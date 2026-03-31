import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';

const SHARED_DOMAIN = 'pastoralcare.barnabassoftware.com';

// ─── Helpers ────────────────────────────────────────────────────────────────

async function getMasterApiKey(db: any): Promise<string> {
    const snap = await db.doc('system/settings').get();
    const key: string = snap.data()?.sendGridApiKey || '';
    if (!key || !key.startsWith('SG.')) {
        throw new Error('Master SendGrid API key is not configured in App Config → System Settings.');
    }
    return key;
}

function sgHeaders(apiKey: string) {
    return {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
    };
}

// ─── Provision Subuser + Shared Email ───────────────────────────────────────
// Creates (or reuses) a SendGrid Subuser for this church and configures the
// shared-subdomain "From" address (e.g. grace@pastoralcare.barnabassoftware.com).

export const provisionSubuser = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).send('');
    }

    const { churchId, prefix, fromName } = req.body || {};
    if (!churchId || !prefix) {
        return res.status(400).json({ error: 'Missing churchId or prefix' });
    }

    const cleanPrefix = prefix.toLowerCase().replace(/[^a-z0-9._-]/g, '');
    if (!cleanPrefix) {
        return res.status(400).json({ error: 'Invalid prefix — use only letters, numbers, dots, hyphens, or underscores.' });
    }

    const db = getDb();
    const log = createServerLogger(db);

    try {
        const masterKey = await getMasterApiKey(db);

        // 1. Check if Subuser already exists in our DB
        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church = churchSnap.data() || {};
        const existing = church.emailSettings?.sendGridSubuserId;

        let subuserId: string;

        if (existing) {
            // Reuse existing subuser
            subuserId = existing;
        } else {
            // 2. Create SendGrid Subuser
            //    Username must be globally unique in SendGrid, so prefix with "pco_"
            subuserId = `pco_${churchId.replace(/[^a-z0-9]/gi, '').substring(0, 20).toLowerCase()}`;
            const fromEmail = `${cleanPrefix}@${SHARED_DOMAIN}`;

            const createRes = await fetch('https://api.sendgrid.com/v3/subusers', {
                method: 'POST',
                headers: sgHeaders(masterKey),
                body: JSON.stringify({
                    username: subuserId,
                    email: fromEmail,
                    password: `${subuserId}!${Date.now()}`,  // Required by SendGrid but not used after creation
                    ips: [],  // Inherit parent IPs
                }),
            });

            if (!createRes.ok) {
                const errBody = await createRes.json().catch(() => ({}));
                // 409 = already exists — that's fine, continue
                if (createRes.status !== 409) {
                    const errMsg = errBody?.errors?.[0]?.message || `SendGrid returned ${createRes.status}`;
                    throw new Error(`Subuser creation failed: ${errMsg}`);
                }
            }

            // 3. Associate the master domain authentication for SHARED_DOMAIN to this Subuser.
            //    This allows sends from prefix@pastoralcare.barnabassoftware.com to pass
            //    sender identity checks when using master key + on-behalf-of header.
            //    We look up the domain auth ID from the master account first.
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
                        // Associate authenticated domain to this Subuser
                        await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${sharedDomainAuth.id}/subuser`, {
                            method: 'POST',
                            headers: sgHeaders(masterKey),
                            body: JSON.stringify({ username: subuserId }),
                        });
                        log.info(`Shared domain auth ${sharedDomainAuth.id} associated to subuser ${subuserId}`, 'system', { churchId }, churchId);
                    } else {
                        log.warn(`No verified domain auth found for ${SHARED_DOMAIN} in master account — sends may fail sender identity check`, 'system', { churchId }, churchId);
                    }
                }
            } catch (domainErr: any) {
                // Non-fatal — log but continue. The master key + on-behalf-of will still work
                // if the master account has the domain authenticated at the account level.
                log.warn(`Could not associate domain auth to subuser: ${domainErr.message}`, 'system', { churchId }, churchId);
            }
        }

        const fromEmail = `${cleanPrefix}@${SHARED_DOMAIN}`;

        // 4. Save email settings to Firestore
        const emailSettings = {
            mode: 'shared',
            sharedPrefix: cleanPrefix,
            fromEmail,
            fromName: fromName || church.name || 'Church',
            sendGridSubuserId: subuserId,
        };

        await db.collection('churches').doc(churchId).update({ emailSettings });

        log.info(`Email provisioned for ${churchId}: ${fromEmail} (subuser: ${subuserId})`, 'system', { churchId, subuserId }, churchId);

        return res.json({
            success: true,
            fromEmail,
            subuserId,
            message: `Email configured. You can now send as ${fromEmail}.`,
        });
    } catch (e: any) {
        log.error(`[emailProvisioning] provisionSubuser failed: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Unknown error' });
    }
};

// ─── Authenticate Custom Domain ──────────────────────────────────────────────
// Requests domain authentication from SendGrid and returns the 3 CNAME records
// the church admin needs to add to their DNS provider.

export const authenticateDomain = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).send('');
    }

    const { churchId, domain, fromEmail, fromName } = req.body || {};
    if (!churchId || !domain) {
        return res.status(400).json({ error: 'Missing churchId or domain' });
    }

    const db = getDb();
    const log = createServerLogger(db);

    try {
        const masterKey = await getMasterApiKey(db);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church = churchSnap.data() || {};
        const existingSettings = church.emailSettings || {};

        // ── Step 1: Search for an EXISTING domain auth on the MASTER account ────
        // List domain auths using the master key (no on-behalf-of) — this returns
        // only master-account-level auths. We also check if a subuser-owned auth
        // exists for this domain (from the old code path) and delete it, because
        // master-key sends cannot use subuser-owned domain identities.
        const listRes = await fetch('https://api.sendgrid.com/v3/whitelabel/domains?limit=200', {
            headers: sgHeaders(masterKey),
        });

        let existingMasterAuthId: string | null = null;
        let existingMasterCnames: { host: string; type: 'CNAME'; data: string }[] = [];

        if (listRes.ok) {
            const allDomains: any[] = await listRes.json();
            // Match by domain name (case-insensitive) on the MASTER account (no on-behalf-of needed for listing)
            const match = allDomains.find(
                (d: any) => (d.domain || '').toLowerCase() === domain.toLowerCase()
            );
            if (match) {
                existingMasterAuthId = String(match.id);
                existingMasterCnames = extractCnameRecords(match);
                log.info(
                    `Found existing master-account domain auth #${existingMasterAuthId} for ${domain}`,
                    'system', { churchId }, churchId
                );
            }
        }

        // ── Step 1b: Check for a subuser-owned domain auth and DELETE it ─────────
        // If the domain was previously authenticated on-behalf-of a subuser (old code
        // path), it won't appear in the master-account list above. We must find it
        // on the subuser and delete it before creating a clean master-account auth.
        // This is what produces the "Sender Identity" error: master key sends cannot
        // reference a domain auth owned by a subuser.
        const subuserId: string | undefined = existingSettings.sendGridSubuserId;
        if (!existingMasterAuthId && subuserId) {
            try {
                const subuserListRes = await fetch('https://api.sendgrid.com/v3/whitelabel/domains?limit=200', {
                    headers: {
                        ...sgHeaders(masterKey),
                        'on-behalf-of': subuserId,
                    },
                });
                if (subuserListRes.ok) {
                    const subuserDomains: any[] = await subuserListRes.json();
                    const subuserMatch = subuserDomains.find(
                        (d: any) => (d.domain || '').toLowerCase() === domain.toLowerCase()
                    );
                    if (subuserMatch) {
                        log.warn(
                            `Found subuser-owned domain auth #${subuserMatch.id} for ${domain} on subuser ${subuserId} — deleting it to allow master-account re-creation`,
                            'system', { churchId }, churchId
                        );
                        // Delete the subuser-owned auth so we can create a clean master-account one
                        await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${subuserMatch.id}`, {
                            method: 'DELETE',
                            headers: {
                                ...sgHeaders(masterKey),
                                'on-behalf-of': subuserId,
                            },
                        });
                        log.info(`Deleted subuser-owned domain auth #${subuserMatch.id} for ${domain}`, 'system', { churchId }, churchId);
                    }
                }
            } catch (subuserErr: any) {
                log.warn(`Could not check/delete subuser domain auth: ${subuserErr.message}`, 'system', { churchId }, churchId);
            }
        }

        let domainAuthId: string;
        let cnameRecords: { host: string; type: 'CNAME'; data: string }[];

        if (existingMasterAuthId) {
            // ── Reuse existing master-account domain auth ────────────────────────
            domainAuthId = existingMasterAuthId;
            cnameRecords = existingMasterCnames;
        } else {
            // ── Create a new domain auth on the MASTER account ──────────────────
            // Sends custom-domain emails directly with the master key (no on-behalf-of),
            // so the domain auth must exist at the master-account level.
            const authRes = await fetch('https://api.sendgrid.com/v3/whitelabel/domains', {
                method: 'POST',
                headers: sgHeaders(masterKey),
                body: JSON.stringify({
                    domain,
                    subdomain: 'em',
                    automatic_security: true,
                    custom_spf: false,
                    default: false,  // Don't override master default — matching by from-domain is automatic
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
            log.info(`Created new master-account domain auth #${domainAuthId} for ${domain}`, 'system', { churchId }, churchId);
        }

        // ── Always persist the correct master-account auth ID to Firestore ──────
        const emailSettings = {
            ...existingSettings,
            mode: 'custom',
            customDomain: domain,
            fromEmail: fromEmail || existingSettings.fromEmail || `contact@${domain}`,
            fromName: fromName || existingSettings.fromName || church.name || 'Church',
            domainAuthId,   // ← guaranteed to be a MASTER account auth ID
            cnameRecords,
            domainVerified: false,  // Reset — user must re-verify after getting records
        };

        await db.collection('churches').doc(churchId).update({ emailSettings });

        log.info(`Domain auth configured for ${churchId}: ${domain} (authId: ${domainAuthId})`, 'system', { churchId, domain }, churchId);

        return res.json({
            success: true,
            cnameRecords,
            domainAuthId,
            message: existingMasterAuthId
                ? `Found existing domain auth. Add these CNAME records to your DNS if not already done, then click "Verify DNS".`
                : `Domain authentication initiated. Add the 3 CNAME records to your DNS provider, then click "Verify DNS".`,
        });
    } catch (e: any) {
        log.error(`[emailProvisioning] authenticateDomain failed: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Unknown error' });
    }
};


// ─── Verify Domain DNS ───────────────────────────────────────────────────────
// Triggers SendGrid to re-check DNS propagation. When all CNAMEs resolve,
// sets domainVerified = true in Firestore.

export const verifyDomain = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).send('');
    }

    const { churchId } = req.body || {};
    if (!churchId) {
        return res.status(400).json({ error: 'Missing churchId' });
    }

    const db = getDb();
    const log = createServerLogger(db);

    try {
        const masterKey = await getMasterApiKey(db);

        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church = churchSnap.data() || {};
        const emailSettings = church.emailSettings || {};
        const { domainAuthId } = emailSettings;

        if (!domainAuthId) {
            return res.status(400).json({ error: 'No domain authentication is pending for this church.' });
        }

        // Validate domain on the MASTER account (no on-behalf-of), consistent with
        // how customdomain auth was created and how sends are executed.
        const verifyRes = await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${domainAuthId}/validate`, {
            method: 'POST',
            headers: sgHeaders(masterKey),
        });

        const verifyData = await verifyRes.json().catch(() => ({}));
        const isValid: boolean = verifyData.valid === true;

        // Also fetch the domain auth record to refresh cnameRecords in Firestore.
        // This ensures the CNAME table is always populated in the UI even on reload.
        let cnameRecords: { host: string; type: 'CNAME'; data: string }[] = emailSettings.cnameRecords || [];
        try {
            const detailRes = await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${domainAuthId}`, {
                headers: sgHeaders(masterKey),
            });
            if (detailRes.ok) {
                const detail = await detailRes.json();
                const freshRecords = extractCnameRecords(detail);
                if (freshRecords.length > 0) {
                    cnameRecords = freshRecords;
                }
            }
        } catch (detailErr: any) {
            log.warn(`Could not refresh CNAME records during verification: ${detailErr.message}`, 'system', { churchId }, churchId);
        }

        // Update Firestore — patch only the fields we need to change
        await db.collection('churches').doc(churchId).update({
            'emailSettings.domainVerified': isValid,
            'emailSettings.cnameRecords': cnameRecords,
        });

        // ── Step 4 (per SendGrid docs): Associate validated domain with subuser ──
        // SendGrid docs: "the parent account must first authenticate and validate
        // the domain. The parent may then associate the authenticated domain via
        // the subuser management tools."
        //
        // This makes the domain visible in the subuser's SendGrid account, enables
        // proper bounce/stat isolation per tenant, and allows the on-behalf-of header
        // to be used for custom domain sends (removing the need for the master-only workaround).
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
                        // 400 often means "already associated" — treat as success
                        log.info(
                            `Domain auth #${domainAuthId} associated with subuser ${subuserId}`,
                            'system', { churchId, domainAuthId, subuserId }, churchId
                        );
                    } else {
                        const assocBody = await assocRes.json().catch(() => ({}));
                        log.warn(
                            `Could not associate domain auth with subuser: ${assocRes.status} — ${JSON.stringify(assocBody)}`,
                            'system', { churchId }, churchId
                        );
                    }
                } catch (assocErr: any) {
                    // Non-fatal — the master-account domain auth still works for sends
                    log.warn(`Subuser domain association failed: ${assocErr.message}`, 'system', { churchId }, churchId);
                }
            } else {
                log.warn(
                    `Domain verified for ${churchId} but no sendGridSubuserId found — skipping subuser association.`,
                    'system', { churchId }, churchId
                );
            }
        }

        log.info(`Domain verification for ${churchId}: ${isValid ? 'VERIFIED' : 'PENDING'}`, 'system', { churchId, domainAuthId }, churchId);

        return res.json({
            success: true,
            verified: isValid,
            cnameRecords,   // Return fresh records to UI so it can repopulate state
            message: isValid
                ? '✓ Domain verified! Your custom domain is ready to send.'
                : 'DNS has not propagated yet. This can take up to 48 hours. Try again soon.',
        });
    } catch (e: any) {
        log.error(`[emailProvisioning] verifyDomain failed: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Unknown error' });
    }
};


// ─── Helper: Extract CNAME records from SendGrid domain auth response ────────

function extractCnameRecords(data: any): { host: string; type: 'CNAME'; data: string }[] {
    const records: { host: string; type: 'CNAME'; data: string }[] = [];
    const dns = data?.dns || {};

    // SendGrid returns: mail_cname, dkim1, dkim2 (or s1/s2 in automatic security mode)
    const possibleKeys = ['mail_cname', 'dkim1', 'dkim2', 's1', 's2', 'mail_server'];
    for (const key of possibleKeys) {
        if (dns[key] && dns[key].type === 'cname') {
            records.push({
                host: dns[key].host,
                type: 'CNAME',
                data: dns[key].data,
            });
        }
    }

    // Fallback: iterate all keys for any cname entries
    if (records.length === 0) {
        for (const key of Object.keys(dns)) {
            const entry = dns[key];
            if (entry?.type === 'cname' || entry?.type === 'CNAME') {
                records.push({ host: entry.host, type: 'CNAME', data: entry.data });
            }
        }
    }

    return records;
}

// ─── Diagnose Custom Domain + Send Test Email ────────────────────────────────
// Performs a full SendGrid health check for the tenant's custom domain:
//   1. Confirms domainAuthId exists in Firestore
//   2. Fetches the domain auth record from SendGrid master account
//   3. Checks if the domain is valid (DNS propagated)
//   4. Checks if the domain auth is associated with the tenant's subuser
//   5. Attempts to send a real test email and reports success/failure
//
// Returns a structured `checks` array for the UI to display as a checklist.

export const diagnoseDomain = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', 'POST');
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        return res.status(204).send('');
    }

    const { churchId, testEmailAddress } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });
    if (!testEmailAddress || !testEmailAddress.includes('@')) {
        return res.status(400).json({ error: 'Missing or invalid testEmailAddress' });
    }

    const db = getDb();
    const log = createServerLogger(db);

    // Each check: { label, status: 'pass'|'fail'|'warn', detail }
    const checks: { label: string; status: 'pass' | 'fail' | 'warn'; detail: string }[] = [];

    try {
        const masterKey = await getMasterApiKey(db);

        // ── Load church settings ──────────────────────────────────────────────
        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church = churchSnap.data() || {};
        const emailSettings = church.emailSettings || {};
        const { domainAuthId, customDomain, fromEmail, fromName, sendGridSubuserId, domainVerified } = emailSettings;

        // Check 1: domainAuthId exists
        if (!domainAuthId) {
            checks.push({ label: 'Domain auth ID exists in settings', status: 'fail', detail: 'No domainAuthId found. Click "Get DNS Records" in Step 1 first.' });
            return res.json({ success: false, checks });
        }
        checks.push({ label: 'Domain auth ID exists in settings', status: 'pass', detail: `Auth ID: ${domainAuthId}` });

        // Check 2: domainVerified flag in Firestore
        checks.push({
            label: 'DNS verified flag in database',
            status: domainVerified ? 'pass' : 'fail',
            detail: domainVerified
                ? 'Firestore shows domain as verified.'
                : 'domainVerified = false. Click "Verify DNS" in Step 3 after DNS propagates.',
        });

        // Check 3: Fetch domain auth from SendGrid master account
        let sgDomainData: any = null;
        try {
            const detailRes = await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${domainAuthId}`, {
                headers: sgHeaders(masterKey),
            });
            if (detailRes.ok) {
                sgDomainData = await detailRes.json();
                checks.push({
                    label: 'Domain auth found in SendGrid master account',
                    status: 'pass',
                    detail: `Domain: ${sgDomainData.domain}, Subdomain: ${sgDomainData.subdomain}`,
                });
            } else {
                const body = await detailRes.json().catch(() => ({}));
                checks.push({
                    label: 'Domain auth found in SendGrid master account',
                    status: 'fail',
                    detail: `SendGrid returned ${detailRes.status}: ${body?.errors?.[0]?.message || 'Not found'}. You may need to click "Get DNS Records" again.`,
                });
            }
        } catch (e: any) {
            checks.push({ label: 'Domain auth found in SendGrid master account', status: 'fail', detail: e.message });
        }

        // Check 4: Is the domain valid (DNS propagated) in SendGrid?
        if (sgDomainData) {
            const sgValid: boolean = sgDomainData.valid === true;
            checks.push({
                label: 'DNS records valid in SendGrid',
                status: sgValid ? 'pass' : 'fail',
                detail: sgValid
                    ? 'All CNAME records resolved correctly.'
                    : 'DNS not yet valid in SendGrid. Records may still be propagating (up to 48h). Click "Verify DNS" to recheck.',
            });

            // If not valid, show which records are failing
            if (!sgValid && sgDomainData.dns) {
                const failing: string[] = [];
                for (const [key, val] of Object.entries(sgDomainData.dns as Record<string, any>)) {
                    if (val && val.valid === false) {
                        failing.push(`${key}: ${val.host}`);
                    }
                }
                if (failing.length > 0) {
                    checks.push({
                        label: 'Failing DNS records',
                        status: 'warn',
                        detail: failing.join('\n'),
                    });
                }
            }
        }

        // Check 5: Is the domain associated with this tenant's subuser?
        // NOTE: sgDomainData.username always shows the *owner* of the domain auth (the
        // master account), not the associated subuser. To verify subuser association we
        // must query the subuser's domain list via the on-behalf-of header and check
        // whether this domain auth ID appears there.
        if (sendGridSubuserId && sgDomainData) {
            let isAssociated = false;
            let associationDetail = '';
            try {
                const subuserDomainsRes = await fetch('https://api.sendgrid.com/v3/whitelabel/domains?limit=200', {
                    headers: {
                        ...sgHeaders(masterKey),
                        'on-behalf-of': sendGridSubuserId,
                    },
                });
                if (subuserDomainsRes.ok) {
                    const subuserDomains: any[] = await subuserDomainsRes.json();
                    // Look for this domain auth by ID or by matching domain name
                    const match = subuserDomains.find(
                        (d: any) => String(d.id) === String(domainAuthId) ||
                                    (d.domain || '').toLowerCase() === (customDomain || '').toLowerCase()
                    );
                    isAssociated = !!match;
                    if (!isAssociated && sgDomainData.valid === true) {
                        // DNS is valid but not yet associated — try to associate now
                        const assocRes = await fetch(
                            `https://api.sendgrid.com/v3/whitelabel/domains/${domainAuthId}/subuser`,
                            {
                                method: 'POST',
                                headers: sgHeaders(masterKey),
                                body: JSON.stringify({ username: sendGridSubuserId }),
                            }
                        );
                        // 400 often means "already associated" — treat as success
                        if (assocRes.ok || assocRes.status === 400) {
                            isAssociated = true;
                            associationDetail = `Auto-associated with subuser "${sendGridSubuserId}" during diagnostics.`;
                            log.info(
                                `Domain auth #${domainAuthId} auto-associated with subuser ${sendGridSubuserId} during diagnose`,
                                'system', { churchId, domainAuthId, sendGridSubuserId }, churchId
                            );
                        } else {
                            const assocBody = await assocRes.json().catch(() => ({}));
                            associationDetail = `Association attempt returned ${assocRes.status}: ${(assocBody as any)?.errors?.[0]?.message || 'unknown error'}. Try clicking "Verify DNS".`;
                        }
                    } else if (isAssociated) {
                        associationDetail = `Associated with subuser "${sendGridSubuserId}".`;
                    } else {
                        associationDetail = `Not yet associated with subuser "${sendGridSubuserId}". DNS may still be propagating — click "Verify DNS" once DNS is confirmed.`;
                    }
                } else {
                    associationDetail = `Could not query subuser domain list (HTTP ${subuserDomainsRes.status}). Association status unknown.`;
                }
            } catch (assocCheckErr: any) {
                associationDetail = `Could not verify association: ${assocCheckErr.message}`;
            }
            checks.push({
                label: 'Domain associated with tenant subuser',
                status: isAssociated ? 'pass' : 'warn',
                detail: associationDetail,
            });
        } else if (!sendGridSubuserId) {
            checks.push({ label: 'Domain associated with tenant subuser', status: 'warn', detail: 'No sendGridSubuserId found — subuser not provisioned. Use Shared Domain first to create the subuser.' });
        }

        // Check 6: From email domain matches the authenticated domain
        const resolvedFromEmail = fromEmail || `contact@${customDomain}`;
        const fromDomain = resolvedFromEmail.split('@')[1]?.toLowerCase();
        const domainMatch = fromDomain === (customDomain || '').toLowerCase();
        checks.push({
            label: 'From email domain matches authenticated domain',
            status: domainMatch ? 'pass' : 'fail',
            detail: domainMatch
                ? `"${resolvedFromEmail}" matches domain "${customDomain}"`
                : `"${resolvedFromEmail}" (domain: ${fromDomain}) does NOT match "${customDomain}". Update From Email in Step 1.`,
        });

        // Check 7: Send actual test email
        try {
            const resolvedFromName = fromName || church.name || 'Church';
            const headers: Record<string, string> = {
                Authorization: `Bearer ${masterKey}`,
                'Content-Type': 'application/json',
            };
            // After DNS verification, the domain auth is associated with the subuser
            // (via verifyDomain → POST /v3/whitelabel/domains/{id}/subuser).
            // The subuser now OWNS the Sender Identity, so we MUST use on-behalf-of —
            // the master account alone can no longer satisfy the Sender Identity check.
            if (sendGridSubuserId) {
                headers['on-behalf-of'] = sendGridSubuserId;
            }
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
                headers,
                body: JSON.stringify(payload),
            });

            if (sendRes.ok || sendRes.status === 202) {
                checks.push({
                    label: `Test email sent to ${testEmailAddress}`,
                    status: 'pass',
                    detail: `Successfully sent from ${resolvedFromEmail}. Check your inbox (and spam folder).`,
                });
            } else {
                const errBody = await sendRes.json().catch(() => ({}));
                const errMsg = (errBody as any)?.errors?.map((e: any) => e.message).join('; ')
                    || `SendGrid HTTP ${sendRes.status}`;
                checks.push({
                    label: `Test email to ${testEmailAddress}`,
                    status: 'fail',
                    detail: `Send failed: ${errMsg}`,
                });
            }
        } catch (sendErr: any) {
            checks.push({ label: `Test email to ${testEmailAddress}`, status: 'fail', detail: sendErr.message });
        }

        const allPassed = checks.every(c => c.status !== 'fail');
        log.info(`Domain diagnosis for ${churchId} (${customDomain}): ${allPassed ? 'ALL PASS' : 'ISSUES FOUND'}`, 'system', { churchId, domainAuthId }, churchId);

        return res.json({ success: allPassed, checks });

    } catch (e: any) {
        log.error(`[emailProvisioning] diagnoseDomain failed: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Unknown error' });
    }
};
