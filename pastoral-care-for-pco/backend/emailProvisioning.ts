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
        // We CANNOT rely on the stored domainAuthId from Firestore because it may
        // have been created on-behalf-of a subuser (before this fix). Instead, list
        // all domain auths on the master account and find one matching this domain.
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
        const { domainAuthId, sendGridSubuserId: subuserId } = emailSettings;

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

        // Update Firestore
        await db.collection('churches').doc(churchId).update({
            'emailSettings.domainVerified': isValid,
        });

        log.info(`Domain verification for ${churchId}: ${isValid ? 'VERIFIED' : 'PENDING'}`, 'system', { churchId, domainAuthId }, churchId);

        return res.json({
            success: true,
            verified: isValid,
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
