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
        let subApiKey: string;

        if (existing) {
            // Reuse existing subuser — just fetch/store the details
            subuserId = existing;
            subApiKey = church.emailSettings?.sendGridSubuserApiKey || '';
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

            // 3. Create a scoped API key for this Subuser
            const keyRes = await fetch('https://api.sendgrid.com/v3/api_keys', {
                method: 'POST',
                headers: { ...sgHeaders(masterKey), 'on-behalf-of': subuserId },
                body: JSON.stringify({
                    name: `${subuserId}-mail-send`,
                    scopes: ['mail.send', 'stats.read'],
                }),
            });

            if (!keyRes.ok) {
                const errBody = await keyRes.json().catch(() => ({}));
                const errMsg = errBody?.errors?.[0]?.message || `SendGrid returned ${keyRes.status}`;
                throw new Error(`API key creation failed: ${errMsg}`);
            }

            const keyData = await keyRes.json();
            subApiKey = keyData.api_key || '';
        }

        const fromEmail = `${cleanPrefix}@${SHARED_DOMAIN}`;

        // 4. Save email settings to Firestore
        const emailSettings = {
            mode: 'shared',
            sharedPrefix: cleanPrefix,
            fromEmail,
            fromName: fromName || church.name || 'Church',
            sendGridSubuserId: subuserId,
            sendGridSubuserApiKey: subApiKey,
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

        // Ensure this church has a Subuser (required for per-tenant domain auth)
        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church = churchSnap.data() || {};
        const existingSettings = church.emailSettings || {};
        const subuserId = existingSettings.sendGridSubuserId;

        if (!subuserId) {
            return res.status(400).json({ error: 'Please configure your shared email first before adding a custom domain.' });
        }

        // Check if domain auth already exists for this domain
        if (existingSettings.customDomain === domain && existingSettings.domainAuthId) {
            // Re-fetch existing CNAME records from SendGrid
            const getRes = await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${existingSettings.domainAuthId}`, {
                headers: sgHeaders(masterKey),
            });
            if (getRes.ok) {
                const data = await getRes.json();
                const cnameRecords = extractCnameRecords(data);
                return res.json({ success: true, cnameRecords, message: 'Existing CNAME records returned.' });
            }
        }

        // Create domain authentication (on behalf of the subuser)
        const authRes = await fetch('https://api.sendgrid.com/v3/whitelabel/domains', {
            method: 'POST',
            headers: { ...sgHeaders(masterKey), 'on-behalf-of': subuserId },
            body: JSON.stringify({
                domain,
                subdomain: 'em',  // SendGrid uses em.<domain> for CNAME
                automatic_security: true,
                custom_spf: false,
                default: true,
            }),
        });

        if (!authRes.ok) {
            const errBody = await authRes.json().catch(() => ({}));
            const errMsg = errBody?.errors?.[0]?.message || `SendGrid returned ${authRes.status}`;
            throw new Error(`Domain authentication failed: ${errMsg}`);
        }

        const authData = await authRes.json();
        const domainAuthId = String(authData.id);
        const cnameRecords = extractCnameRecords(authData);

        // Save to Firestore
        const emailSettings = {
            ...existingSettings,
            mode: 'custom',
            customDomain: domain,
            fromEmail: fromEmail || existingSettings.fromEmail || `contact@${domain}`,
            fromName: fromName || existingSettings.fromName || church.name || 'Church',
            domainAuthId,
            cnameRecords,
            domainVerified: false,
        };

        await db.collection('churches').doc(churchId).update({ emailSettings });

        log.info(`Domain auth requested for ${churchId}: ${domain}`, 'system', { churchId, domain }, churchId);

        return res.json({
            success: true,
            cnameRecords,
            domainAuthId,
            message: `Domain authentication initiated. Add the 3 CNAME records to your DNS provider, then click "Verify DNS".`,
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

        // Validate domain on SendGrid's side
        const verifyRes = await fetch(`https://api.sendgrid.com/v3/whitelabel/domains/${domainAuthId}/validate`, {
            method: 'POST',
            headers: { ...sgHeaders(masterKey), 'on-behalf-of': subuserId || '' },
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
