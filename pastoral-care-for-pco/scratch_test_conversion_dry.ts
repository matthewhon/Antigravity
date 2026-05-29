// Import firebase-admin so we can mock the app method
import admin from 'firebase-admin';

const mockAccessToken = 'mock-access-token-12345';
const mockApnsToken = '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef';
const mockFcmToken = 'fcm-mock-token-converted-xyz';

// 1. Mock admin.app()
admin.app = (() => ({
  options: {
    credential: {
      getAccessToken: async () => ({
        access_token: mockAccessToken,
        expires_in: 3600
      })
    }
  }
})) as any;

// 2. Mock global fetch
const fetchHistory: any[] = [];
global.fetch = async (url: any, init: any) => {
  fetchHistory.push({ url, init });
  
  if (url === 'https://iid.googleapis.com/iid/v1:batchImport') {
    const body = JSON.parse(init.body);
    const results = body.apns_tokens.map((tok: string) => {
      if (tok === mockApnsToken) {
        return {
          status: 'OK',
          apns_token: tok,
          registration_token: mockFcmToken
        };
      }
      return {
        status: 'INVALID_ARGUMENT',
        apns_token: tok
      };
    });
    
    return {
      ok: true,
      status: 200,
      json: async () => ({ results }),
      text: async () => JSON.stringify({ results })
    } as any;
  }
  
  return { ok: false, status: 404 } as any;
};

// Import the function under test
import { convertApnsToFcm } from './backend/webPushService';

async function runTest() {
  console.log('Starting APNs to FCM token conversion dry-run test...');
  
  const tokens = [mockApnsToken, 'invalid-apns-token-here'];
  const mapping = await convertApnsToFcm(tokens, true);
  
  console.log('\n--- VERIFICATION CHECKLIST ---');
  
  // Check 1: Did we trigger fetch?
  const importCall = fetchHistory.find(c => c.url === 'https://iid.googleapis.com/iid/v1:batchImport');
  if (importCall) {
    console.log('✓ Successfully triggered APNs to FCM conversion request.');
    const body = JSON.parse(importCall.init.body);
    console.log('  Request URL:', importCall.url);
    console.log('  Request Headers:', importCall.init.headers);
    console.log('  Authorization Header:', importCall.init.headers.Authorization);
    console.log('  Target Application Bundle ID:', body.application);
    console.log('  Sandbox Mode:', body.sandbox);
    console.log('  Tokens to Convert:', body.apns_tokens);
    
    if (importCall.init.headers.Authorization === `Bearer ${mockAccessToken}` && importCall.init.headers.access_token_auth === 'true') {
      console.log('✓ Request contains correct Google OAuth2 Bearer authorization headers.');
    } else {
      console.log('✗ Incorrect request headers.');
    }
  } else {
    console.log('✗ Failed to trigger conversion request.');
  }
  
  // Check 2: Verify the output mapping
  console.log('\nReturned Mapping:', mapping);
  if (mapping[mockApnsToken] === mockFcmToken) {
    console.log('✓ Successfully mapped APNs token to converted FCM token.');
  } else {
    console.log('✗ Mapping failed.');
  }
  
  if (mapping['invalid-apns-token-here'] === undefined) {
    console.log('✓ Successfully ignored failed/invalid APNs token mapping.');
  } else {
    console.log('✗ Incorrectly mapped invalid token.');
  }
}

runTest().then(() => {
  console.log('\n--- Dry-Run Test Complete ---');
  process.exit(0);
}).catch(e => {
  console.error('Test failed with error:', e);
  process.exit(1);
});
