import assert from 'assert';
import crypto from 'crypto';
import { 
    QuickBooksAuthError, 
    generateOAuthState, 
    verifyOAuthState, 
    withQuickBooksApiRetry,
    getIntuitTid,
    QuickBooksTokens,
    QuickBooksConfig
} from '../backend/quickbooksService';

console.log('🧪 Starting QuickBooks OAuth & Auth Error Handling Test Suite...\n');

// Mock in-memory Firestore-like document store for testing
const mockDbStore: Record<string, any> = {
    'system/settings': {
        quickbooksClientId: 'test-client-id-123',
        quickbooksClientSecret: 'test-client-secret-xyz-456',
        quickbooksEnvironment: 'sandbox',
        appBaseUrl: 'http://localhost:3000'
    }
};

const mockDb: any = {
    doc: (path: string) => ({
        get: async () => ({
            exists: path in mockDbStore,
            data: () => mockDbStore[path]
        }),
        set: async (data: any, options?: any) => {
            if (options?.merge && mockDbStore[path]) {
                mockDbStore[path] = { ...mockDbStore[path], ...data };
            } else {
                mockDbStore[path] = data;
            }
        },
        delete: async () => {
            delete mockDbStore[path];
        }
    }),
    collection: (coll: string) => ({
        add: async (item: any) => ({ id: 'mock-id' }),
        doc: (id: string) => ({
            get: async () => ({
                exists: `${coll}/${id}` in mockDbStore,
                data: () => mockDbStore[`${coll}/${id}`]
            }),
            set: async (data: any, options?: any) => {
                const key = `${coll}/${id}`;
                if (options?.merge && mockDbStore[key]) {
                    mockDbStore[key] = { ...mockDbStore[key], ...data };
                } else {
                    mockDbStore[key] = data;
                }
            },
            delete: async () => {
                delete mockDbStore[`${coll}/${id}`];
            },
            collection: (subColl: string) => ({
                doc: (subId: string) => ({
                    get: async () => {
                        const key = `${coll}/${id}/${subColl}/${subId}`;
                        return {
                            exists: key in mockDbStore,
                            data: () => mockDbStore[key]
                        };
                    },
                    set: async (data: any, options?: any) => {
                        const key = `${coll}/${id}/${subColl}/${subId}`;
                        if (options?.merge && mockDbStore[key]) {
                            mockDbStore[key] = { ...mockDbStore[key], ...data };
                        } else {
                            mockDbStore[key] = data;
                        }
                    },
                    delete: async () => {
                        const key = `${coll}/${id}/${subColl}/${subId}`;
                        delete mockDbStore[key];
                    }
                })
            })
        })
    })
};

// Use global mockDb supported by backend/firebase.ts
(global as any).__mockDb = mockDb;

async function runTests() {
    let passed = 0;
    const churchId = 'test-church-auth-001';

    // ──────────────────────────────────────────────────────────────────────────
    // Test 1: CSRF State Generation and Verification
    // ──────────────────────────────────────────────────────────────────────────
    console.log('🔹 Test 1: CSRF State Generation and Verification');
    const stateToken = await generateOAuthState(churchId, 'test-extra-val');
    assert(stateToken.includes('.'), 'State token must consist of payload and HMAC signature separated by a dot');

    // 1a. Verification of valid token succeeds
    const verified = await verifyOAuthState(stateToken);
    assert.strictEqual(verified.churchId, churchId, 'Verified churchId should match original');
    assert.strictEqual(verified.extra, 'test-extra-val', 'Verified extra should match original');
    console.log('  ✅ 1a: Valid state token passed cryptographic HMAC verification');

    // 1b. Replay attack fails (nonce deleted after first use)
    let replayFailed = false;
    try {
        await verifyOAuthState(stateToken);
    } catch (e: any) {
        replayFailed = true;
        assert(e instanceof QuickBooksAuthError);
        assert.strictEqual(e.code, 'CSRF_MISMATCH');
        assert(e.message.includes('already been used') || e.message.includes('not found'));
    }
    assert(replayFailed, 'Second verification attempt with same nonce must fail (anti-replay)');
    console.log('  ✅ 1b: Replay attempt correctly blocked (single-use nonce)');

    // 1c. Tampered signature fails
    const stateToken2 = await generateOAuthState(churchId);
    const [p2, s2] = stateToken2.split('.');
    const tamperedSig = s2.slice(0, -2) + (s2.slice(-2) === 'aa' ? 'bb' : 'aa');
    let tamperFailed = false;
    try {
        await verifyOAuthState(`${p2}.${tamperedSig}`);
    } catch (e: any) {
        tamperFailed = true;
        assert.strictEqual(e.code, 'CSRF_MISMATCH');
        assert(e.message.includes('mismatch'));
    }
    assert(tamperFailed, 'Tampered signature must be rejected');
    console.log('  ✅ 1c: Tampered signature correctly rejected');

    // 1d. Expired token (> 15 minutes) fails
    const secret = mockDbStore['system/settings'].quickbooksClientSecret;
    const expiredPayload = {
        churchId,
        nonce: 'expired-nonce-999',
        timestamp: Date.now() - (16 * 60 * 1000), // 16 minutes ago
        extra: ''
    };
    const expiredStr = Buffer.from(JSON.stringify(expiredPayload)).toString('base64url');
    const expiredSig = crypto.createHmac('sha256', secret).update(expiredStr).digest('base64url');
    let expireFailed = false;
    try {
        await verifyOAuthState(`${expiredStr}.${expiredSig}`);
    } catch (e: any) {
        expireFailed = true;
        assert.strictEqual(e.code, 'CSRF_MISMATCH');
        assert(e.message.includes('expired'));
    }
    assert(expireFailed, 'Expired state token must be rejected');
    console.log('  ✅ 1d: Expired token (>15 mins TTL) correctly rejected');

    passed++;

    // ──────────────────────────────────────────────────────────────────────────
    // Test 2: Expired Access Token & 401 Auto-Retry Mechanism
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n🔹 Test 2: Expired Access Token & Automatic 401 Retry');
    
    // Set up mock tokens for church
    const initialTokens: QuickBooksTokens = {
        realmId: 'mock-realm-123',
        accessToken: 'stale-access-token-001',
        refreshToken: 'valid-refresh-token-001',
        accessTokenExpiresAt: Date.now() + 3600000,
        refreshTokenExpiresAt: Date.now() + (100 * 86400000),
        companyName: 'Grace Church',
        connectedAt: Date.now(),
        updatedAt: Date.now(),
        needsReconnect: false,
        connectionState: 'connected'
    };
    mockDbStore[`churches/${churchId}/integrations/quickbooks`] = { ...initialTokens };

    let apiCallAttempts = 0;
    let refreshAttempted = false;

    // Intercept global fetch for token refresh
    const originalFetch = global.fetch;
    global.fetch = (async (url: any, init?: any) => {
        const urlStr = String(url);
        // Token refresh endpoint
        if (urlStr.includes('/tokens/bearer')) {
            refreshAttempted = true;
            return new Response(JSON.stringify({
                access_token: 'brand-new-fresh-access-token-002',
                refresh_token: 'fresh-refresh-token-002',
                expires_in: 3600,
                x_refresh_token_expires_in: 8726400
            }), { status: 200, headers: { 'Content-Type': 'application/json' } });
        }
        return originalFetch(url, init);
    }) as any;

    try {
        // Execute an operation that fails on first attempt with 401, then succeeds on retry
        const res = await withQuickBooksApiRetry(churchId, async (tokens, config) => {
            apiCallAttempts++;
            if (apiCallAttempts === 1) {
                // Return 401 on first try
                return new Response(JSON.stringify({ error: 'Unauthorized' }), {
                    status: 401,
                    statusText: 'Unauthorized'
                });
            }
            // Return 200 on retry with new token
            assert.strictEqual(tokens.accessToken, 'brand-new-fresh-access-token-002', 'Retry must use newly refreshed token');
            return new Response(JSON.stringify({ QueryResponse: { Account: [] } }), {
                status: 200,
                headers: { 'Content-Type': 'application/json' }
            });
        });

        assert.strictEqual(apiCallAttempts, 2, 'API operation should have retried once after 401');
        assert.strictEqual(refreshAttempted, true, 'Token refresh must have been triggered on 401');
        assert.strictEqual(res.status, 200, 'Final response should be 200 OK');
        console.log('  ✅ 2a: Handled 401 Unauthorized by proactively refreshing access token and retrying successfully');
    } finally {
        global.fetch = originalFetch;
    }
    passed++;

    // ──────────────────────────────────────────────────────────────────────────
    // Test 3: Expired Refresh Token & Invalid Grant Handling
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n🔹 Test 3: Expired Refresh Token & Invalid Grant (101-day lifetime / revocation)');
    
    // 3a. Token with expired refreshTokenExpiresAt
    mockDbStore[`churches/${churchId}/integrations/quickbooks`] = {
        ...initialTokens,
        refreshTokenExpiresAt: Date.now() - 1000 // Expired 1 second ago
    };

    let expiredRefreshErrorCaught = false;
    try {
        const { getValidTokens } = await import('../backend/quickbooksService');
        await getValidTokens(churchId);
    } catch (e: any) {
        expiredRefreshErrorCaught = true;
        assert(e instanceof QuickBooksAuthError);
        assert.strictEqual(e.code, 'EXPIRED_REFRESH_TOKEN');
    }
    assert(expiredRefreshErrorCaught, 'Expired refresh token must throw EXPIRED_REFRESH_TOKEN');

    // Verify Firestore doc was marked with needsReconnect: true
    const updatedDoc = mockDbStore[`churches/${churchId}/integrations/quickbooks`];
    assert.strictEqual(updatedDoc.needsReconnect, true, 'Firestore document must be marked with needsReconnect: true');
    assert.strictEqual(updatedDoc.connectionState, 'expired', 'connectionState must be set to expired');
    console.log('  ✅ 3a: 101-day expired refresh token correctly identified; marked needsReconnect: true');

    // 3b. Intuit token refresh returning 400 Bad Request with "invalid_grant"
    mockDbStore[`churches/${churchId}/integrations/quickbooks`] = {
        ...initialTokens,
        accessTokenExpiresAt: Date.now() - 5000, // Trigger refresh
        refreshTokenExpiresAt: Date.now() + 10000000,
        needsReconnect: false
    };

    global.fetch = (async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/tokens/bearer')) {
            return new Response(JSON.stringify({
                error: 'invalid_grant',
                error_description: 'Token revoked or invalid'
            }), { 
                status: 400, 
                headers: { 
                    'Content-Type': 'application/json',
                    'intuit_tid': '1-66df3b-refresh-tid-101'
                } 
            });
        }
        return originalFetch(url);
    }) as any;

    let invalidGrantCaught = false;
    try {
        const { getValidTokens } = await import('../backend/quickbooksService');
        await getValidTokens(churchId);
    } catch (e: any) {
        invalidGrantCaught = true;
        assert(e instanceof QuickBooksAuthError);
        assert.strictEqual(e.code, 'INVALID_GRANT');
        assert.strictEqual(e.intuitTid, '1-66df3b-refresh-tid-101', 'intuit_tid header must be captured on auth error');
        assert(e.message.includes('expired or was revoked'));
    } finally {
        global.fetch = originalFetch;
    }

    assert(invalidGrantCaught, 'invalid_grant must throw QuickBooksAuthError with INVALID_GRANT');
    const docAfterRevoke = mockDbStore[`churches/${churchId}/integrations/quickbooks`];
    assert.strictEqual(docAfterRevoke.needsReconnect, true);
    assert.strictEqual(docAfterRevoke.connectionState, 'expired');
    console.log('  ✅ 3b: Intuit invalid_grant on refresh caught with intuit_tid captured; updated church state to needsReconnect: true');
    passed++;

    // ──────────────────────────────────────────────────────────────────────────
    // Test 4: Invalid Grant During Authorization Code Exchange
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n🔹 Test 4: Invalid Grant During Authorization Code Exchange');

    global.fetch = (async (url: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/tokens/bearer')) {
            return new Response(JSON.stringify({
                error: 'invalid_grant',
                error_description: 'Authorization code has expired'
            }), { 
                status: 400, 
                headers: { 
                    'Content-Type': 'application/json',
                    'intuit_tid': '1-66df3b-code-exchange-tid-202'
                } 
            });
        }
        return originalFetch(url);
    }) as any;

    let codeExchangeInvalidGrantCaught = false;
    try {
        const { exchangeCodeForTokens } = await import('../backend/quickbooksService');
        await exchangeCodeForTokens('expired-auth-code-123', 'mock-realm-123', churchId);
    } catch (e: any) {
        codeExchangeInvalidGrantCaught = true;
        assert(e instanceof QuickBooksAuthError);
        assert.strictEqual(e.code, 'INVALID_GRANT');
        assert.strictEqual(e.intuitTid, '1-66df3b-code-exchange-tid-202', 'intuit_tid must be captured on code exchange error');
        assert(e.message.includes('expired or has already been used'));
    } finally {
        global.fetch = originalFetch;
    }

    assert(codeExchangeInvalidGrantCaught, 'invalid_grant during code exchange must throw user-friendly QuickBooksAuthError');
    console.log('  ✅ 4a: Code exchange invalid_grant detected with intuit_tid captured and clean error messaging');
    passed++;

    // ──────────────────────────────────────────────────────────────────────────
    // Test 5: Response Header `intuit_tid` Capture in Deposit & API Calls
    // ──────────────────────────────────────────────────────────────────────────
    console.log('\n🔹 Test 5: Response Header `intuit_tid` Capture in Deposit Operations');

    // 5a. getIntuitTid utility helper
    const mockResWithTid = new Response('{}', { headers: { 'intuit_tid': '1-sample-intuit-tid-999' } });
    assert.strictEqual(getIntuitTid(mockResWithTid), '1-sample-intuit-tid-999', 'getIntuitTid should extract intuit_tid from Response headers');
    const mockResWithoutTid = new Response('{}', { headers: {} });
    assert.strictEqual(getIntuitTid(mockResWithoutTid), undefined, 'getIntuitTid should return undefined when header is absent');
    console.log('  ✅ 5a: getIntuitTid correctly parses intuit_tid header');

    // 5b. createQuickbooksDeposit captures intuit_tid in QuickbooksDepositResult
    mockDbStore[`churches/${churchId}/integrations/quickbooks`] = {
        ...initialTokens,
        accessTokenExpiresAt: Date.now() + 3600000,
        needsReconnect: false,
        connectionState: 'connected'
    };

    const mockBatch: any = {
        id: 'batch-test-tid-001',
        name: 'Sunday Giving',
        date: '2026-09-10',
        totalGross: 500,
        totalFees: 15,
        totalNet: 485,
        fundsBreakdown: [
            { fundId: 'fund-1', fundName: 'Tithes', grossAmount: 500, feeAmount: 15, netAmount: 485 }
        ]
    };
    const mockMapping: any = {
        depositBankAccountId: 'bank-101',
        stripeFeeExpenseAccountId: 'exp-601',
        defaultIncomeAccountId: 'inc-401'
    };

    global.fetch = (async (url: any, init?: any) => {
        const urlStr = String(url);
        if (urlStr.includes('/deposit')) {
            return new Response(JSON.stringify({
                Deposit: {
                    Id: 'qbo-dep-12345',
                    DocNumber: 'DOC-99',
                    TotalAmt: 485
                }
            }), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                    'intuit_tid': '1-66df3b-deposit-success-tid-888'
                }
            });
        }
        return originalFetch(url, init);
    }) as any;

    try {
        const { createQuickbooksDeposit } = await import('../backend/quickbooksService');
        const depResult = await createQuickbooksDeposit(churchId, mockBatch, mockMapping);
        assert.strictEqual(depResult.intuitTid, '1-66df3b-deposit-success-tid-888', 'createQuickbooksDeposit must attach intuit_tid to result');
        assert.strictEqual(depResult.depositId, 'qbo-dep-12345');
        console.log('  ✅ 5b: createQuickbooksDeposit successfully captured and returned intuit_tid:', depResult.intuitTid);
    } finally {
        global.fetch = originalFetch;
    }
    passed++;

    console.log(`\n🎉 All ${passed}/5 QuickBooks Auth, Security & intuit_tid scenarios verified successfully!\n`);
}

runTests().catch(err => {
    console.error('❌ Test failed with error:', err);
    process.exit(1);
});
