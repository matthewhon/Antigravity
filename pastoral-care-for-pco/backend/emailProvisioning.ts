import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';
import { resolveEmailProvider } from './emailProvider.js';

// ─── CORS helper ─────────────────────────────────────────────────────────────

function handleCors(req: any, res: any, method = 'POST'): boolean {
    res.set('Access-Control-Allow-Origin', '*');
    if (req.method === 'OPTIONS') {
        res.set('Access-Control-Allow-Methods', method);
        res.set('Access-Control-Allow-Headers', 'Content-Type');
        res.status(204).send('');
        return true;
    }
    return false;
}

// ─── Provision Subuser + Shared Email ────────────────────────────────────────
// Creates (or reuses) a sending identity for this church and configures the
// shared-subdomain "From" address (e.g. grace@pastoralcare.barnabassoftware.com).
// Delegates to the active email provider (SendGrid subuser or Postmark Server).

export const provisionSubuser = async (req: any, res: any) => {
    if (handleCors(req, res)) return;

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
        const provider = await resolveEmailProvider(db);
        const result = await provider.provisionTenant(db, churchId, cleanPrefix, fromName || '');

        log.info(`Email provisioned for ${churchId}: ${result.fromEmail}`, 'system', { churchId }, churchId);

        return res.json({
            success: true,
            fromEmail: result.fromEmail,
            subuserId: result.tenantToken, // kept for backward compat with the frontend
            message: `Email configured. You can now send as ${result.fromEmail}.`,
        });
    } catch (e: any) {
        log.error(`[emailProvisioning] provisionSubuser failed: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Unknown error' });
    }
};

// ─── Authenticate Custom Domain ──────────────────────────────────────────────
// Requests domain authentication and returns the DNS records the church admin
// needs to add to their DNS provider.
// SendGrid: 3 CNAME records. Postmark: 2 records (DKIM TXT + Return-Path CNAME).

export const authenticateDomain = async (req: any, res: any) => {
    if (handleCors(req, res)) return;

    const { churchId, domain, fromEmail, fromName } = req.body || {};
    if (!churchId || !domain) {
        return res.status(400).json({ error: 'Missing churchId or domain' });
    }

    const db = getDb();
    const log = createServerLogger(db);

    try {
        const provider = await resolveEmailProvider(db);
        const dnsRecords = await provider.authenticateDomain(db, churchId, domain, fromEmail, fromName);

        log.info(`Domain auth configured for ${churchId}: ${domain}`, 'system', { churchId, domain }, churchId);

        return res.json({
            success: true,
            // cnameRecords is kept for backward compat with the frontend — contains all DNS records
            cnameRecords: dnsRecords,
            dnsRecords,
            message: `Domain authentication initiated. Add the DNS records to your DNS provider, then click "Verify DNS".`,
        });
    } catch (e: any) {
        log.error(`[emailProvisioning] authenticateDomain failed: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Unknown error' });
    }
};

// ─── Verify Domain DNS ───────────────────────────────────────────────────────
// Triggers the active provider to re-check DNS propagation.
// When all records resolve, sets domainVerified = true in Firestore.

export const verifyDomain = async (req: any, res: any) => {
    if (handleCors(req, res)) return;

    const { churchId } = req.body || {};
    if (!churchId) {
        return res.status(400).json({ error: 'Missing churchId' });
    }

    const db = getDb();
    const log = createServerLogger(db);

    try {
        const provider = await resolveEmailProvider(db);
        const result = await provider.verifyDomain(db, churchId);

        log.info(`Domain verification for ${churchId}: ${result.verified ? 'VERIFIED' : 'PENDING'}`, 'system', { churchId }, churchId);

        return res.json({
            success: true,
            verified: result.verified,
            // cnameRecords kept for backward compat — contains all fresh DNS records
            cnameRecords: result.dnsRecords || [],
            dnsRecords: result.dnsRecords || [],
            message: result.message,
        });
    } catch (e: any) {
        log.error(`[emailProvisioning] verifyDomain failed: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Unknown error' });
    }
};

// ─── Diagnose Custom Domain + Send Test Email ────────────────────────────────
// Performs a full health check for the tenant's custom domain via the active
// provider and optionally sends a real test email.
// Returns a structured checks array for the UI to display as a checklist.

export const diagnoseDomain = async (req: any, res: any) => {
    if (handleCors(req, res)) return;

    const { churchId, testEmailAddress } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });
    if (!testEmailAddress || !testEmailAddress.includes('@')) {
        return res.status(400).json({ error: 'Missing or invalid testEmailAddress' });
    }

    const db = getDb();
    const log = createServerLogger(db);

    try {
        const provider = await resolveEmailProvider(db);
        const result = await provider.diagnoseDomain(db, churchId, testEmailAddress);

        const allPassed = result.checks.every(c => c.status !== 'fail');
        log.info(`Domain diagnosis for ${churchId}: ${allPassed ? 'ALL PASS' : 'ISSUES FOUND'}`, 'system', { churchId }, churchId);

        return res.json(result);
    } catch (e: any) {
        log.error(`[emailProvisioning] diagnoseDomain failed: ${e.message}`, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message || 'Unknown error' });
    }
};
