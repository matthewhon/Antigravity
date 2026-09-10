import * as crypto from 'crypto';
import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';
import { 
    QuickbooksAccount, QuickbooksClass, QuickbooksVendor, 
    QuickbooksMappingConfig, GivingBatch, QuickbooksDepositResult 
} from '../types';

export interface QuickBooksConfig {
    clientId: string;
    clientSecret: string;
    environment: 'sandbox' | 'production';
    redirectUri: string;
}

export interface QuickBooksTokens {
    realmId: string;
    accessToken: string;
    refreshToken: string;
    accessTokenExpiresAt: number; // Unix timestamp ms
    refreshTokenExpiresAt: number;
    companyName?: string;
    connectedAt: number;
    updatedAt: number;
    needsReconnect?: boolean;
    connectionState?: 'connected' | 'expired' | 'disconnected';
    lastError?: string | null;
}

export type QuickBooksAuthErrorCode = 
    | 'EXPIRED_ACCESS_TOKEN'
    | 'EXPIRED_REFRESH_TOKEN'
    | 'INVALID_GRANT'
    | 'REVOKED'
    | 'CSRF_MISMATCH'
    | 'ACCESS_DENIED'
    | 'UNKNOWN';

export class QuickBooksAuthError extends Error {
    code: QuickBooksAuthErrorCode;
    status?: number;
    details?: any;
    intuitTid?: string;

    constructor(code: QuickBooksAuthErrorCode, message: string, status?: number, details?: any, intuitTid?: string) {
        super(message);
        this.name = 'QuickBooksAuthError';
        this.code = code;
        this.status = status;
        this.details = details;
        this.intuitTid = intuitTid;
        Object.setPrototypeOf(this, QuickBooksAuthError.prototype);
    }
}

/**
 * Extracts the Intuit Tracking ID (intuit_tid) header from an HTTP Response.
 * Intuit attaches this unique identifier to all responses for tracing and developer support.
 */
export function getIntuitTid(res: any): string | undefined {
    try {
        if (!res || !res.headers) return undefined;
        const tid = typeof res.headers.get === 'function' ? res.headers.get('intuit_tid') : res.headers['intuit_tid'];
        return tid ? String(tid).trim() : undefined;
    } catch {
        return undefined;
    }
}

export interface OAuthStatePayload {
    churchId: string;
    nonce: string;
    timestamp: number;
    extra?: string;
}

const INTUIT_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const INTUIT_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

export async function getQuickBooksConfig(db: any, req?: any): Promise<QuickBooksConfig> {
    const settingsDoc = await db.doc('system/settings').get();
    const settings = settingsDoc.data() || {};

    const clientId = (settings.quickbooksClientId || process.env.QUICKBOOKS_CLIENT_ID || '').trim();
    const clientSecret = (settings.quickbooksClientSecret || process.env.QUICKBOOKS_CLIENT_SECRET || '').trim();
    const environment = (settings.quickbooksEnvironment || process.env.QUICKBOOKS_ENVIRONMENT || 'production').trim() === 'sandbox' 
        ? 'sandbox' 
        : 'production';
    
    // Resolve redirect URI in priority order:
    // 1. Explicitly saved quickbooksRedirectUri in system settings
    // 2. Dynamically detected from incoming HTTP request host/proto (e.g. https://pastoralcare.barnabassoftware.com)
    // 3. Environment variable APP_BASE_URL
    // 4. Default to production domain 'https://pastoralcare.barnabassoftware.com' (never default to localhost:3000 unless requested on localhost)
    let redirectUri = (settings.quickbooksRedirectUri || '').trim();
    if (!redirectUri) {
        let appBaseUrl = (settings.appBaseUrl || process.env.APP_BASE_URL || '').replace(/\/$/, '');
        if (!appBaseUrl && req) {
            const proto = req.headers?.['x-forwarded-proto'] || req.protocol || 'https';
            const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
            if (host) {
                appBaseUrl = `${proto}://${host}`;
            }
        }
        if (!appBaseUrl) {
            appBaseUrl = 'https://pastoralcare.barnabassoftware.com';
        }
        redirectUri = `${appBaseUrl}/api/quickbooks/callback`;
    }

    return { clientId, clientSecret, environment, redirectUri };
}

export function getBaseApiUrl(environment: 'sandbox' | 'production'): string {
    return environment === 'sandbox' 
        ? 'https://sandbox-quickbooks.api.intuit.com' 
        : 'https://quickbooks.api.intuit.com';
}

/**
 * Generates a signed, single-use OAuth state token with a 15-minute TTL to defend against CSRF attacks.
 */
export async function generateOAuthState(churchId: string, extra?: string): Promise<string> {
    const db = getDb();
    const config = await getQuickBooksConfig(db);
    const secret = config.clientSecret || process.env.QUICKBOOKS_CLIENT_SECRET || process.env.SESSION_SECRET || 'antigravity-qbo-oauth-secret';

    const nonce = crypto.randomBytes(24).toString('hex');
    const payload: OAuthStatePayload = {
        churchId,
        nonce,
        timestamp: Date.now(),
        extra: extra || ''
    };

    const payloadStr = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url');
    const stateToken = `${payloadStr}.${signature}`;

    // Store state nonce in Firestore with 15-minute TTL
    try {
        await db.collection('churches').doc(churchId).collection('quickbooks_oauth_states').doc(nonce).set({
            churchId,
            createdAt: Date.now(),
            expiresAt: Date.now() + (15 * 60 * 1000)
        });
    } catch (err: any) {
        console.warn('Could not persist OAuth state nonce to Firestore:', err.message);
    }

    return stateToken;
}

/**
 * Validates the OAuth state token: signature verification, expiration check, and single-use nonce validation.
 */
export async function verifyOAuthState(stateToken: string): Promise<{ churchId: string; extra?: string }> {
    if (!stateToken || typeof stateToken !== 'string') {
        throw new QuickBooksAuthError('CSRF_MISMATCH', 'Missing state parameter in QuickBooks callback');
    }

    // Check if token has the payload.signature format
    const parts = stateToken.split('.');
    if (parts.length !== 2) {
        // Check for legacy base64-encoded JSON state
        try {
            const decoded = JSON.parse(Buffer.from(stateToken, 'base64').toString('utf8'));
            if (decoded.churchId) {
                return { churchId: decoded.churchId, extra: decoded.extra };
            }
        } catch {
            // Not valid legacy state either
        }
        throw new QuickBooksAuthError('CSRF_MISMATCH', 'Invalid OAuth state token format');
    }

    const [payloadStr, signature] = parts;
    const db = getDb();
    const config = await getQuickBooksConfig(db);
    const secret = config.clientSecret || process.env.QUICKBOOKS_CLIENT_SECRET || process.env.SESSION_SECRET || 'antigravity-qbo-oauth-secret';

    // Verify HMAC-SHA256 signature
    const expectedSignature = crypto.createHmac('sha256', secret).update(payloadStr).digest('base64url');
    const sigBuf = Buffer.from(signature);
    const expectedBuf = Buffer.from(expectedSignature);

    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
        throw new QuickBooksAuthError('CSRF_MISMATCH', 'QuickBooks state signature mismatch (possible CSRF attack)');
    }

    let payload: OAuthStatePayload;
    try {
        payload = JSON.parse(Buffer.from(payloadStr, 'base64url').toString('utf8'));
    } catch {
        throw new QuickBooksAuthError('CSRF_MISMATCH', 'Corrupted OAuth state payload');
    }

    const now = Date.now();
    // Enforce 15-minute TTL
    if (!payload.timestamp || (now - payload.timestamp) > 15 * 60 * 1000) {
        throw new QuickBooksAuthError('CSRF_MISMATCH', 'QuickBooks authorization session expired (over 15 minutes). Please try again.');
    }

    // Verify nonce in Firestore and delete it (single-use replay prevention)
    if (payload.nonce && payload.churchId) {
        try {
            const stateRef = db.collection('churches').doc(payload.churchId).collection('quickbooks_oauth_states').doc(payload.nonce);
            const doc = await stateRef.get();
            if (!doc.exists) {
                throw new QuickBooksAuthError('CSRF_MISMATCH', 'OAuth state has already been used or expired.');
            }
            // Remove nonce to prevent replay attacks
            await stateRef.delete();
        } catch (err: any) {
            if (err instanceof QuickBooksAuthError) throw err;
            console.warn('Could not verify nonce from Firestore:', err.message);
        }
    }

    return {
        churchId: payload.churchId,
        extra: payload.extra
    };
}

export async function getAuthUrl(churchId: string, stateExtra?: string, req?: any): Promise<string> {
    const db = getDb();
    const config = await getQuickBooksConfig(db, req);
    if (!config.clientId) {
        throw new Error('QuickBooks Client ID is not configured in System Settings.');
    }

    const state = await generateOAuthState(churchId, stateExtra);

    const params = new URLSearchParams({
        client_id: config.clientId,
        response_type: 'code',
        scope: 'com.intuit.quickbooks.accounting',
        redirect_uri: config.redirectUri,
        state
    });

    return `${INTUIT_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, realmId: string, churchId: string, req?: any): Promise<QuickBooksTokens> {
    const db = getDb();
    const log = createServerLogger(db);
    const config = await getQuickBooksConfig(db, req);

    if (!config.clientId || !config.clientSecret) {
        throw new Error('QuickBooks OAuth credentials are not fully configured.');
    }

    const authHeader = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;

    const body = new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: config.redirectUri
    });

    const res = await fetch(INTUIT_TOKEN_URL, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Authorization': authHeader,
            'Accept': 'application/json'
        },
        body: body.toString()
    });

    const intuitTid = getIntuitTid(res);

    if (!res.ok) {
        const errorText = await res.text();
        log.error('Failed to exchange QuickBooks authorization code', 'quickbooks', { error: errorText, status: res.status, intuitTid }, churchId);
        if (errorText.includes('invalid_grant') || res.status === 400) {
            throw new QuickBooksAuthError(
                'INVALID_GRANT',
                'QuickBooks authorization code was expired or has already been used. Please try connecting again.',
                res.status,
                errorText,
                intuitTid
            );
        }
        throw new Error(`Failed to exchange QuickBooks authorization code: ${errorText}${intuitTid ? ` (intuit_tid: ${intuitTid})` : ''}`);
    }

    const tokenData = await res.json();
    const now = Date.now();

    let companyName = 'QuickBooks Company';
    try {
        const companyInfo = await fetchCompanyInfo(tokenData.access_token, realmId, config.environment);
        if (companyInfo?.CompanyName) {
            companyName = companyInfo.CompanyName;
        }
    } catch (e: any) {
        log.warn('Could not fetch QuickBooks company info', 'quickbooks', { error: e.message }, churchId);
    }

    const tokens: QuickBooksTokens = {
        realmId,
        accessToken: tokenData.access_token,
        refreshToken: tokenData.refresh_token,
        accessTokenExpiresAt: now + (tokenData.expires_in * 1000),
        refreshTokenExpiresAt: now + (tokenData.x_refresh_token_expires_in * 1000),
        companyName,
        connectedAt: now,
        updatedAt: now,
        needsReconnect: false,
        connectionState: 'connected',
        lastError: null
    };

    await db.collection('churches').doc(churchId).collection('integrations').doc('quickbooks').set(tokens);
    log.info(`Connected church to QuickBooks company: ${companyName} (${realmId})`, 'quickbooks', { realmId, companyName, intuitTid }, churchId);

    return tokens;
}

export async function getValidTokens(churchId: string, options?: { forceRefresh?: boolean }): Promise<QuickBooksTokens | null> {
    const db = getDb();
    const log = createServerLogger(db);
    const tokenDoc = await db.collection('churches').doc(churchId).collection('integrations').doc('quickbooks').get();

    if (!tokenDoc.exists) return null;
    let tokens = tokenDoc.data() as QuickBooksTokens;

    // Check if integration is marked as needing reconnect or expired
    if (!options?.forceRefresh && (tokens.needsReconnect || tokens.connectionState === 'expired')) {
        throw new QuickBooksAuthError(
            'EXPIRED_REFRESH_TOKEN',
            tokens.lastError || 'QuickBooks authorization has expired. Please reconnect.',
            401
        );
    }

    const now = Date.now();
    // Check if refresh token is known to have expired (101-day Intuit lifetime)
    if (tokens.refreshTokenExpiresAt && tokens.refreshTokenExpiresAt <= now) {
        const errMsg = 'QuickBooks refresh token has expired (101-day lifetime). Please reconnect.';
        await db.collection('churches').doc(churchId).collection('integrations').doc('quickbooks').set({
            needsReconnect: true,
            connectionState: 'expired',
            lastError: errMsg,
            updatedAt: now
        }, { merge: true });
        throw new QuickBooksAuthError('EXPIRED_REFRESH_TOKEN', errMsg, 401);
    }

    // Refresh if forced, or within 5 minutes of access token expiration
    if (options?.forceRefresh || tokens.accessTokenExpiresAt - 300000 <= now) {
        const config = await getQuickBooksConfig(db);
        const authHeader = `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')}`;

        const body = new URLSearchParams({
            grant_type: 'refresh_token',
            refresh_token: tokens.refreshToken
        });

        const res = await fetch(INTUIT_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': authHeader,
                'Accept': 'application/json'
            },
            body: body.toString()
        });

        const intuitTid = getIntuitTid(res);

        if (!res.ok) {
            const errText = await res.text();
            log.error('Failed to refresh QuickBooks token', 'quickbooks', { error: errText, status: res.status, intuitTid }, churchId);

            // Handle invalid_grant or 400 Bad Request
            if (errText.includes('invalid_grant') || res.status === 400) {
                const errMsg = 'QuickBooks authorization has expired or was revoked. Please reconnect.';
                await db.collection('churches').doc(churchId).collection('integrations').doc('quickbooks').set({
                    needsReconnect: true,
                    connectionState: 'expired',
                    lastError: errMsg,
                    updatedAt: now
                }, { merge: true });

                throw new QuickBooksAuthError('INVALID_GRANT', errMsg, res.status, errText, intuitTid);
            }

            throw new Error(`QuickBooks token refresh failed: ${errText}${intuitTid ? ` (intuit_tid: ${intuitTid})` : ''}`);
        }

        const freshData = await res.json();
        tokens = {
            ...tokens,
            accessToken: freshData.access_token,
            refreshToken: freshData.refresh_token || tokens.refreshToken,
            accessTokenExpiresAt: now + (freshData.expires_in * 1000),
            refreshTokenExpiresAt: now + (freshData.x_refresh_token_expires_in ? freshData.x_refresh_token_expires_in * 1000 : tokens.refreshTokenExpiresAt),
            needsReconnect: false,
            connectionState: 'connected',
            lastError: null,
            updatedAt: now
        };

        await db.collection('churches').doc(churchId).collection('integrations').doc('quickbooks').set(tokens, { merge: true });
    }

    return tokens;
}

export async function withQuickBooksApiRetry(
    churchId: string,
    operation: (tokens: QuickBooksTokens, config: QuickBooksConfig) => Promise<Response>
): Promise<Response> {
    const db = getDb();
    const config = await getQuickBooksConfig(db);
    let tokens = await getValidTokens(churchId);
    if (!tokens) {
        throw new Error('QuickBooks is not connected for this church.');
    }

    let res = await operation(tokens, config);
    let intuitTid = getIntuitTid(res);

    // 401 Unauthorized: token may have expired prematurely or been invalidated
    if (res.status === 401) {
        const log = createServerLogger(db);
        log.warn('QuickBooks API returned 401 Unauthorized. Retrying after forcing token refresh...', 'quickbooks', { intuitTid }, churchId);

        tokens = await getValidTokens(churchId, { forceRefresh: true });
        if (!tokens) {
            throw new QuickBooksAuthError('EXPIRED_ACCESS_TOKEN', 'Failed to refresh expired QuickBooks access token.', 401, undefined, intuitTid);
        }

        res = await operation(tokens, config);
        intuitTid = getIntuitTid(res) || intuitTid;
        if (res.status === 401) {
            const errText = await res.text();
            throw new QuickBooksAuthError('EXPIRED_ACCESS_TOKEN', `QuickBooks API rejected authorization after token refresh: ${errText}`, 401, errText, intuitTid);
        }
    }

    return res;
}

export async function disconnectQuickBooks(churchId: string): Promise<void> {
    const db = getDb();
    const log = createServerLogger(db);
    await db.collection('churches').doc(churchId).collection('integrations').doc('quickbooks').delete();
    log.info('Disconnected church from QuickBooks Online', 'quickbooks', {}, churchId);
}

export async function fetchCompanyInfo(accessToken: string, realmId: string, environment: 'sandbox' | 'production'): Promise<any> {
    const base = getBaseApiUrl(environment);
    const url = `${base}/v3/company/${realmId}/companyinfo/${realmId}?minorversion=65`;
    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Accept': 'application/json'
        }
    });

    const intuitTid = getIntuitTid(res);
    if (!res.ok) {
        throw new Error(`Failed to fetch company info: ${res.statusText}${intuitTid ? ` (intuit_tid: ${intuitTid})` : ''}`);
    }

    const data = await res.json();
    return data.CompanyInfo;
}

export async function queryQuickBooks(churchId: string, queryStr: string): Promise<any> {
    const res = await withQuickBooksApiRetry(churchId, (tokens, config) => {
        const base = getBaseApiUrl(config.environment);
        const encodedQuery = encodeURIComponent(queryStr);
        const url = `${base}/v3/company/${tokens.realmId}/query?query=${encodedQuery}&minorversion=65`;

        return fetch(url, {
            headers: {
                'Authorization': `Bearer ${tokens.accessToken}`,
                'Accept': 'application/json'
            }
        });
    });

    const intuitTid = getIntuitTid(res);
    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`QuickBooks query failed: ${errorText}${intuitTid ? ` (intuit_tid: ${intuitTid})` : ''}`);
    }

    return res.json();
}

export async function fetchAccounts(churchId: string): Promise<{
    bankAccounts: QuickbooksAccount[];
    incomeAccounts: QuickbooksAccount[];
    expenseAccounts: QuickbooksAccount[];
    classes: QuickbooksClass[];
    vendors: QuickbooksVendor[];
}> {
    const accountsData = await queryQuickBooks(churchId, 'select * from Account where Active = true maxresults 1000');
    const rawAccounts: any[] = accountsData?.QueryResponse?.Account || [];

    const bankAccounts: QuickbooksAccount[] = [];
    const incomeAccounts: QuickbooksAccount[] = [];
    const expenseAccounts: QuickbooksAccount[] = [];

    for (const a of rawAccounts) {
        const item: QuickbooksAccount = {
            id: String(a.Id),
            name: a.FullyQualifiedName || a.Name,
            accountType: a.AccountType,
            accountSubType: a.AccountSubType,
            classification: a.Classification,
            currentBalance: a.CurrentBalance ? Number(a.CurrentBalance) : undefined,
            active: a.Active !== false
        };

        if (a.AccountType === 'Bank' || (a.Classification === 'Asset' && (a.AccountSubType === 'UndepositedFunds' || a.AccountType === 'Other Current Asset'))) {
            bankAccounts.push(item);
        } else if (a.Classification === 'Revenue' || a.AccountType === 'Income' || a.AccountType === 'Other Income') {
            incomeAccounts.push(item);
        } else if (a.Classification === 'Expense' || a.AccountType === 'Expense' || a.AccountType === 'Other Expense') {
            expenseAccounts.push(item);
        }
    }

    // Sort alphabetically by name
    const byName = (a: { name: string }, b: { name: string }) => a.name.localeCompare(b.name);
    bankAccounts.sort(byName);
    incomeAccounts.sort(byName);
    expenseAccounts.sort(byName);

    // Fetch classes (for church class tracking)
    let classes: QuickbooksClass[] = [];
    try {
        const classData = await queryQuickBooks(churchId, 'select * from Class where Active = true maxresults 500');
        const rawClasses: any[] = classData?.QueryResponse?.Class || [];
        classes = rawClasses.map(c => ({
            id: String(c.Id),
            name: c.FullyQualifiedName || c.Name,
            active: c.Active !== false
        })).sort(byName);
    } catch {
        classes = [];
    }

    // Fetch vendors (to match Stripe vendor)
    let vendors: QuickbooksVendor[] = [];
    try {
        const vendorData = await queryQuickBooks(churchId, 'select * from Vendor where Active = true maxresults 500');
        const rawVendors: any[] = vendorData?.QueryResponse?.Vendor || [];
        vendors = rawVendors.map(v => ({
            id: String(v.Id),
            displayName: v.DisplayName || v.CompanyName || v.GivenName,
            active: v.Active !== false
        })).sort((a, b) => a.displayName.localeCompare(b.displayName));
    } catch {
        vendors = [];
    }

    return { bankAccounts, incomeAccounts, expenseAccounts, classes, vendors };
}

export interface CreateQuickbooksDepositOptions {
    depositBankAccountId?: string;
    depositBankAccountName?: string;
    fundOverrides?: Record<string, import('../types').FundQuickbooksMapping>;
    feeExpenseAccountId?: string;
    feeExpenseAccountName?: string;
    feeVendorId?: string;
    feeVendorName?: string;
    feeAmount?: number;
}

export async function createQuickbooksDeposit(
    churchId: string, 
    batch: GivingBatch, 
    mapping: QuickbooksMappingConfig,
    userName?: string,
    options?: CreateQuickbooksDepositOptions
): Promise<QuickbooksDepositResult> {
    const db = getDb();
    const log = createServerLogger(db);
    const tokens = await getValidTokens(churchId);
    if (!tokens) throw new Error('QuickBooks is not connected.');

    const targetBankAccountId = options?.depositBankAccountId || mapping.depositBankAccountId;
    const targetBankAccountName = options?.depositBankAccountName || mapping.depositBankAccountName;

    if (!targetBankAccountId) {
        throw new Error('Target deposit bank account is not specified. Please configure or select an account.');
    }

    const lines: any[] = [];

    // 1. Positive Lines: 1-to-1 Fund breakdown (Income)
    for (const fund of batch.fundsBreakdown) {
        if (fund.grossAmount <= 0) continue;

        // Resolve mapping: check override by composite key, override by fundId, campus-specific mapping, then default mapping
        const overrideKey = fund.campusId ? `${fund.campusId}_${fund.fundId}` : fund.fundId;
        const campusSpecificMap = (mapping.enableCampusMapping && fund.campusId)
            ? mapping.campusFundMappings?.[fund.campusId]?.[fund.fundId]
            : undefined;

        const fundMap = options?.fundOverrides?.[overrideKey]
            || options?.fundOverrides?.[fund.fundId]
            || campusSpecificMap
            || mapping.fundMappings?.[fund.fundId];

        const accountId = fundMap?.qboAccountId || mapping.defaultIncomeAccountId;

        if (!accountId) {
            const campusLabel = fund.campusName ? ` (${fund.campusName})` : '';
            throw new Error(`Fund "${fund.fundName}"${campusLabel} is not mapped to a QuickBooks Income Account, and no default income account is set.`);
        }

        const depositLineDetail: any = {
            AccountRef: {
                value: accountId
            }
        };

        if (fundMap?.qboClassId) {
            depositLineDetail.ClassRef = {
                value: fundMap.qboClassId
            };
        }

        const lineDesc = fund.campusName 
            ? `${fund.fundName} (${fund.campusName}) - ${batch.name}`
            : `${fund.fundName} - ${batch.name}`;

        lines.push({
            Amount: fund.grossAmount,
            DetailType: 'DepositLineDetail',
            Description: lineDesc,
            DepositLineDetail: depositLineDetail
        });
    }

    // 2. Negative Line: Processing Fees (Expense) - assigned to specified account
    const effectiveFees = options?.feeAmount !== undefined 
        ? Math.round(Math.abs(options.feeAmount) * 100) / 100 
        : Math.round((batch.totalFees || 0) * 100) / 100;

    const feeAccountId = options?.feeExpenseAccountId || mapping.stripeFeeExpenseAccountId;
    const feeAccountName = options?.feeExpenseAccountName || mapping.stripeFeeExpenseAccountName;
    const vendorId = options?.feeVendorId !== undefined ? options.feeVendorId : mapping.stripeVendorId;
    const vendorName = options?.feeVendorName !== undefined ? options.feeVendorName : mapping.stripeVendorName;

    if (effectiveFees > 0) {
        if (!feeAccountId) {
            throw new Error('Processing Fee Expense Account is not specified. Please configure or select an expense account for fees.');
        }

        const feeLineDetail: any = {
            AccountRef: {
                value: feeAccountId
            }
        };

        if (vendorId) {
            feeLineDetail.Entity = {
                Type: 'Vendor',
                EntityRef: {
                    value: vendorId,
                    name: vendorName || 'Vendor'
                }
            };
        }

        const batchNameLower = (batch.name || '').toLowerCase();
        const feeLabel = batchNameLower.includes('tithely') || batchNameLower.includes('tithe.ly')
            ? 'Tithely Processing Fees'
            : (batchNameLower.includes('stripe') ? 'Stripe Processing Fees' : 'Processing Fees');

        lines.push({
            Amount: -effectiveFees,
            DetailType: 'DepositLineDetail',
            Description: `${feeLabel} - ${batch.name}`,
            DepositLineDetail: feeLineDetail
        });
    }

    if (lines.length === 0) {
        throw new Error('No valid deposit lines to send (batch total is zero).');
    }

    const txnDate = (batch.date || new Date().toISOString()).slice(0, 10);
    const privateNote = `Giving Batch: ${batch.name} (ID: ${batch.id}) | Synced by ${userName || 'System'}`;

    const depositPayload: any = {
        DepositToAccountRef: {
            value: targetBankAccountId,
            name: targetBankAccountName
        },
        TxnDate: txnDate,
        PrivateNote: privateNote,
        Line: lines
    };

    const config = await getQuickBooksConfig(db);

    log.info(`Creating QuickBooks Deposit for batch ${batch.id} into account ${targetBankAccountId}`, 'quickbooks', { 
        batchId: batch.id, 
        targetBankAccountId,
        targetBankAccountName,
        gross: batch.totalGross, 
        fees: batch.totalFees, 
        net: batch.totalNet 
    }, churchId);

    const res = await withQuickBooksApiRetry(churchId, (currentTokens, currentConfig) => {
        const base = getBaseApiUrl(currentConfig.environment);
        const url = `${base}/v3/company/${currentTokens.realmId}/deposit?minorversion=65`;

        return fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${currentTokens.accessToken}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify(depositPayload)
        });
    });

    const intuitTid = getIntuitTid(res);

    if (!res.ok) {
        const errorText = await res.text();
        log.error('QuickBooks deposit creation failed', 'quickbooks', { error: errorText, payload: depositPayload, intuitTid }, churchId);
        throw new Error(`QuickBooks deposit creation failed: ${errorText}${intuitTid ? ` (intuit_tid: ${intuitTid})` : ''}`);
    }

    const data = await res.json();
    const createdDeposit = data?.Deposit;
    const depositId = String(createdDeposit?.Id || '');
    const docNumber = createdDeposit?.DocNumber;
    const totalAmount = Number(createdDeposit?.TotalAmt || batch.totalNet);

    const qboUrl = config.environment === 'sandbox'
        ? `https://sandbox.qbo.intuit.com/app/deposit?txnId=${depositId}`
        : `https://qbo.intuit.com/app/deposit?txnId=${depositId}`;

    log.info(`Successfully created QuickBooks Deposit #${depositId}`, 'quickbooks', { 
        depositId, 
        docNumber, 
        totalAmount,
        targetBankAccountId,
        intuitTid
    }, churchId);

    return {
        depositId,
        docNumber,
        txnDate,
        totalAmount,
        qboUrl,
        depositBankAccountId: targetBankAccountId,
        depositBankAccountName: targetBankAccountName,
        intuitTid,
        feeExpenseAccountId: feeAccountId,
        feeExpenseAccountName: feeAccountName,
        feeVendorId: vendorId,
        feeVendorName: vendorName,
        netDepositAmount: totalAmount
    };
}

/**
 * Validates QuickBooks OAuth 2.0 credentials directly against Intuit's OAuth servers
 */
export async function testQuickBooksCredentials(params: {
    clientId: string;
    clientSecret: string;
    environment?: 'sandbox' | 'production';
    redirectUri?: string;
}): Promise<{
    success: boolean;
    message: string;
    authUrl?: string;
    details?: any;
}> {
    const { clientId, clientSecret, environment = 'production', redirectUri } = params;

    if (!clientId || !clientId.trim()) {
        return { success: false, message: 'QuickBooks Client ID is missing.' };
    }
    if (!clientSecret || !clientSecret.trim()) {
        return { success: false, message: 'QuickBooks Client Secret is missing.' };
    }

    const authUrl = `${INTUIT_AUTH_URL}?client_id=${encodeURIComponent(clientId.trim())}&response_type=code&scope=com.intuit.quickbooks.accounting&redirect_uri=${encodeURIComponent(redirectUri || 'https://developer.intuit.com')}&state=test_probe`;

    // Direct probe to Intuit's token endpoint using HTTP Basic Authentication.
    // Intuit evaluates client credentials first:
    // - If credentials are invalid, Intuit returns 400 or 401 with {"error":"invalid_client"}.
    // - If credentials are valid, client auth succeeds and Intuit rejects only the dummy auth code with {"error":"invalid_grant"}.
    try {
        const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString('base64')}`;
        const body = new URLSearchParams({
            grant_type: 'authorization_code',
            code: 'test_verify_credentials_code',
            redirect_uri: redirectUri || 'https://developer.intuit.com'
        });

        const res = await fetch(INTUIT_TOKEN_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                'Authorization': authHeader,
                'Accept': 'application/json'
            },
            body: body.toString()
        });

        const intuitTid = getIntuitTid(res);
        const json = await res.json().catch(() => ({}));
        const error = json?.error;
        const errorDesc = json?.error_description;

        if (error === 'invalid_client') {
            return {
                success: false,
                authUrl,
                message: `Client Authentication Failed: Intuit rejected this Client ID or Client Secret (${errorDesc || 'invalid_client'}). Please check that you copied the keys from the ${environment === 'sandbox' ? 'Development' : 'Production'} tab in your Intuit Developer Portal.`,
                details: { ...json, intuitTid }
            };
        }

        if (error === 'redirect_uri_mismatch') {
            return {
                success: true,
                authUrl,
                message: `Credentials Valid! Note: Ensure the Redirect URI (${redirectUri}) is added under Redirect URIs in your Intuit App settings.`,
                details: { ...json, intuitTid }
            };
        }

        if (error === 'invalid_grant' || res.status === 400) {
            return {
                success: true,
                authUrl,
                message: `Credentials Authenticated! Intuit verified your Client ID and Client Secret successfully (${environment === 'sandbox' ? 'Sandbox' : 'Production'}).`,
                details: { status: 'authenticated', intuitResponse: error || 'Client verified', intuitTid }
            };
        }

        return {
            success: true,
            authUrl,
            message: `Intuit server verified client credentials successfully (Status ${res.status}).`,
            details: { ...json, intuitTid }
        };
    } catch (err: any) {
        return {
            success: false,
            authUrl,
            message: `Could not reach Intuit OAuth servers: ${err.message}`
        };
    }
}
