/**
 * One-time setup: writes SignalWire credentials into Firestore system/settings
 * via the live backend API endpoint (which already has Firestore access).
 * Run with: node scripts/setSignalWireCredentials.mjs
 */

const BACKEND = 'https://api.pastoralcare.barnabassoftware.com';

const credentials = {
    signalwireProjectId: '169b4705-7fc4-42ff-8877-f9477c5853e4',
    signalwireApiToken:  'PT867737fa44061e75e93e1a8e5231f45d4b463e18625360ef',
    signalwireSpaceUrl:  'barnabassoftware.signalwire.com',
};

const res = await fetch(`${BACKEND}/api/system/settings`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(credentials),
});

if (res.ok) {
    const data = await res.json().catch(() => ({}));
    console.log('✅ Written via backend API:', data);
} else {
    const text = await res.text();
    console.error(`❌ Backend returned ${res.status}: ${text}`);
}
