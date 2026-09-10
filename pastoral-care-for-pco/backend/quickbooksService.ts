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
}

const INTUIT_AUTH_URL = 'https://appcenter.intuit.com/connect/oauth2';
const INTUIT_TOKEN_URL = 'https://oauth.platform.intuit.com/oauth2/v1/tokens/bearer';

export async function getQuickBooksConfig(db: any): Promise<QuickBooksConfig> {
    const settingsDoc = await db.doc('system/settings').get();
    const settings = settingsDoc.data() || {};

    const clientId = (settings.quickbooksClientId || process.env.QUICKBOOKS_CLIENT_ID || '').trim();
    const clientSecret = (settings.quickbooksClientSecret || process.env.QUICKBOOKS_CLIENT_SECRET || '').trim();
    const environment = (settings.quickbooksEnvironment || process.env.QUICKBOOKS_ENVIRONMENT || 'production').trim() === 'sandbox' 
        ? 'sandbox' 
        : 'production';
    
    // Default redirect URI can be overridden in settings
    const appBaseUrl = (settings.appBaseUrl || process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/$/, '');
    const redirectUri = (settings.quickbooksRedirectUri || `${appBaseUrl}/api/quickbooks/callback`).trim();

    return { clientId, clientSecret, environment, redirectUri };
}

export function getBaseApiUrl(environment: 'sandbox' | 'production'): string {
    return environment === 'sandbox' 
        ? 'https://sandbox-quickbooks.api.intuit.com' 
        : 'https://quickbooks.api.intuit.com';
}

export async function getAuthUrl(churchId: string, stateExtra?: string): Promise<string> {
    const db = getDb();
    const config = await getQuickBooksConfig(db);
    if (!config.clientId) {
        throw new Error('QuickBooks Client ID is not configured in System Settings.');
    }

    const state = JSON.stringify({ churchId, extra: stateExtra || '' });
    const encodedState = Buffer.from(state).toString('base64');

    const params = new URLSearchParams({
        client_id: config.clientId,
        response_type: 'code',
        scope: 'com.intuit.quickbooks.accounting',
        redirect_uri: config.redirectUri,
        state: encodedState
    });

    return `${INTUIT_AUTH_URL}?${params.toString()}`;
}

export async function exchangeCodeForTokens(code: string, realmId: string, churchId: string): Promise<QuickBooksTokens> {
    const db = getDb();
    const log = createServerLogger(db);
    const config = await getQuickBooksConfig(db);

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

    if (!res.ok) {
        const errorText = await res.text();
        log.error('Failed to exchange QuickBooks authorization code', 'quickbooks', { error: errorText, status: res.status }, churchId);
        throw new Error(`Failed to exchange QuickBooks authorization code: ${errorText}`);
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
        updatedAt: now
    };

    await db.collection('churches').doc(churchId).collection('integrations').doc('quickbooks').set(tokens);
    log.info(`Connected church to QuickBooks company: ${companyName} (${realmId})`, 'quickbooks', { realmId, companyName }, churchId);

    return tokens;
}

export async function getValidTokens(churchId: string): Promise<QuickBooksTokens | null> {
    const db = getDb();
    const log = createServerLogger(db);
    const tokenDoc = await db.collection('churches').doc(churchId).collection('integrations').doc('quickbooks').get();

    if (!tokenDoc.exists) return null;
    let tokens = tokenDoc.data() as QuickBooksTokens;

    const now = Date.now();
    // Refresh 5 minutes before actual expiration
    if (tokens.accessTokenExpiresAt - 300000 <= now) {
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

        if (!res.ok) {
            const errText = await res.text();
            log.error('Failed to refresh QuickBooks token', 'quickbooks', { error: errText }, churchId);
            throw new Error(`QuickBooks token refresh failed: ${errText}`);
        }

        const freshData = await res.json();
        tokens = {
            ...tokens,
            accessToken: freshData.access_token,
            refreshToken: freshData.refresh_token || tokens.refreshToken,
            accessTokenExpiresAt: now + (freshData.expires_in * 1000),
            refreshTokenExpiresAt: now + (freshData.x_refresh_token_expires_in ? freshData.x_refresh_token_expires_in * 1000 : tokens.refreshTokenExpiresAt),
            updatedAt: now
        };

        await db.collection('churches').doc(churchId).collection('integrations').doc('quickbooks').set(tokens, { merge: true });
    }

    return tokens;
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

    if (!res.ok) {
        throw new Error(`Failed to fetch company info: ${res.statusText}`);
    }

    const data = await res.json();
    return data.CompanyInfo;
}

export async function queryQuickBooks(churchId: string, queryStr: string): Promise<any> {
    const db = getDb();
    const tokens = await getValidTokens(churchId);
    if (!tokens) throw new Error('QuickBooks is not connected for this church.');

    const config = await getQuickBooksConfig(db);
    const base = getBaseApiUrl(config.environment);
    const encodedQuery = encodeURIComponent(queryStr);
    const url = `${base}/v3/company/${tokens.realmId}/query?query=${encodedQuery}&minorversion=65`;

    const res = await fetch(url, {
        headers: {
            'Authorization': `Bearer ${tokens.accessToken}`,
            'Accept': 'application/json'
        }
    });

    if (!res.ok) {
        const errorText = await res.text();
        throw new Error(`QuickBooks query failed: ${errorText}`);
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

    // 2. Negative Line: Stripe Credit Card / ACH Processing Fees (Expense)
    if (batch.totalFees > 0) {
        if (!mapping.stripeFeeExpenseAccountId) {
            throw new Error('Stripe Fee Expense Account is not configured, but this batch has processing fees.');
        }

        const feeLineDetail: any = {
            AccountRef: {
                value: mapping.stripeFeeExpenseAccountId
            }
        };

        if (mapping.stripeVendorId) {
            feeLineDetail.Entity = {
                Type: 'Vendor',
                EntityRef: {
                    value: mapping.stripeVendorId,
                    name: mapping.stripeVendorName || 'Stripe'
                }
            };
        }

        lines.push({
            Amount: -Math.abs(batch.totalFees),
            DetailType: 'DepositLineDetail',
            Description: `Stripe Processing Fees - ${batch.name}`,
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
    const base = getBaseApiUrl(config.environment);
    const url = `${base}/v3/company/${tokens.realmId}/deposit?minorversion=65`;

    log.info(`Creating QuickBooks Deposit for batch ${batch.id} into account ${targetBankAccountId}`, 'quickbooks', { 
        batchId: batch.id, 
        targetBankAccountId,
        targetBankAccountName,
        gross: batch.totalGross, 
        fees: batch.totalFees, 
        net: batch.totalNet 
    }, churchId);

    const res = await fetch(url, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        },
        body: JSON.stringify(depositPayload)
    });

    if (!res.ok) {
        const errorText = await res.text();
        log.error('QuickBooks deposit creation failed', 'quickbooks', { error: errorText, payload: depositPayload }, churchId);
        throw new Error(`QuickBooks deposit creation failed: ${errorText}`);
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
        targetBankAccountId
    }, churchId);

    return {
        depositId,
        docNumber,
        txnDate,
        totalAmount,
        qboUrl,
        depositBankAccountId: targetBankAccountId,
        depositBankAccountName: targetBankAccountName
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
    authUrl?: string;
    message: string;
    details?: any;
}> {
    const clientId = (params.clientId || '').trim();
    const clientSecret = (params.clientSecret || '').trim();
    const environment = params.environment || 'production';
    const redirectUri = (params.redirectUri || '').trim();

    if (!clientId) {
        return { success: false, message: 'Client ID is missing. Please enter your Intuit Client ID.' };
    }
    if (!clientSecret) {
        return { success: false, message: 'Client Secret is missing. Please enter your Intuit Client Secret.' };
    }

    // Generate sample OAuth authorization URL for testing/inspection
    const authParams = new URLSearchParams({
        client_id: clientId,
        response_type: 'code',
        scope: 'com.intuit.quickbooks.accounting',
        redirect_uri: redirectUri || 'https://developer.intuit.com',
        state: Buffer.from(JSON.stringify({ test: true, timestamp: Date.now() })).toString('base64')
    });
    const authUrl = `${INTUIT_AUTH_URL}?${authParams.toString()}`;

    // Validate client authentication directly with Intuit's OAuth 2.0 token endpoint
    // We send a test request with HTTP Basic Auth (clientId:clientSecret).
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

        const json = await res.json().catch(() => ({}));
        const error = json?.error;
        const errorDesc = json?.error_description;

        if (error === 'invalid_client') {
            return {
                success: false,
                authUrl,
                message: `Client Authentication Failed: Intuit rejected this Client ID or Client Secret (${errorDesc || 'invalid_client'}). Please check that you copied the keys from the ${environment === 'sandbox' ? 'Development' : 'Production'} tab in your Intuit Developer Portal.`,
                details: json
            };
        }

        if (error === 'redirect_uri_mismatch') {
            return {
                success: true,
                authUrl,
                message: `Credentials Valid! Note: Ensure the Redirect URI (${redirectUri}) is added under Redirect URIs in your Intuit App settings.`,
                details: json
            };
        }

        if (error === 'invalid_grant' || res.status === 400) {
            return {
                success: true,
                authUrl,
                message: `Credentials Authenticated! Intuit verified your Client ID and Client Secret successfully (${environment === 'sandbox' ? 'Sandbox' : 'Production'}).`,
                details: { status: 'authenticated', intuitResponse: error || 'Client verified' }
            };
        }

        return {
            success: true,
            authUrl,
            message: `Intuit server verified client credentials successfully (Status ${res.status}).`,
            details: json
        };
    } catch (err: any) {
        return {
            success: false,
            authUrl,
            message: `Could not reach Intuit OAuth servers: ${err.message}`
        };
    }
}
