/**
 * Postmark integration test script.
 * Reads credentials from Firestore (pcforpco database) and sends a test email.
 * Run: node scripts/test_postmark.mjs
 */

import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

const TO_EMAIL = 'matthewhon@honfamily.com';

// ── Init Firebase Admin ───────────────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'pastoral-care-for-pco' });
}
const db = getFirestore(admin.app(), 'pcforpco');

// ── Read system settings ──────────────────────────────────────────────────────
console.log('📖 Reading system/settings from Firestore (pcforpco)…');
const snap = await db.doc('system/settings').get();
if (!snap.exists) {
  console.error('❌ system/settings document not found.');
  process.exit(1);
}

const settings = snap.data();
const provider   = settings.emailProvider || 'sendgrid';
const pmToken    = settings.postmarkApiKey;
const fromEmail  = settings.postmarkFromEmail || settings.sendGridFromEmail || 'noreply@pastoralcare.barnabassoftware.com';
const fromName   = settings.postmarkFromName  || settings.sendGridFromName  || 'Pastoral Care';

console.log(`\n📋 Settings loaded:`);
console.log(`   Active provider : ${provider}`);
console.log(`   Postmark token  : ${pmToken ? pmToken.slice(0,8) + '…' + pmToken.slice(-4) : '⚠️  NOT SET'}`);
console.log(`   From email      : ${fromEmail}`);
console.log(`   From name       : ${fromName}`);

if (!pmToken) {
  console.error('\n❌ postmarkApiKey is not set in Firestore. Please save it in System Settings → Email Delivery → Postmark.');
  process.exit(1);
}

// ── Step 1: Validate Account Token ──────────────────────────────────────────
console.log('\n🔑 Step 1: Validating Postmark Account Token…');
const serversRes = await fetch('https://api.postmarkapp.com/servers?count=1&offset=0', {
  headers: {
    'Accept': 'application/json',
    'X-Postmark-Account-Token': pmToken,
  },
});

if (!serversRes.ok) {
  const body = await serversRes.json().catch(() => ({}));
  console.error(`❌ Account token rejected by Postmark (HTTP ${serversRes.status}): ${body.Message || JSON.stringify(body)}`);
  process.exit(1);
}
const serversData = await serversRes.json();
console.log(`   ✅ Token valid — account has ${serversData.TotalCount} server(s).`);

// ── Step 2: Send a test email via a transactional stream ─────────────────────
// We use the first available server, or create a temporary one.
let serverToken;
if (serversData.Servers && serversData.Servers.length > 0) {
  const firstServer = serversData.Servers[0];
  console.log(`\n📬 Step 2: Using existing server "${firstServer.Name}" (ID: ${firstServer.ID}) to send test email…`);

  // Fetch the API token for this server
  const srvRes = await fetch(`https://api.postmarkapp.com/servers/${firstServer.ID}`, {
    headers: { 'Accept': 'application/json', 'X-Postmark-Account-Token': pmToken },
  });
  if (!srvRes.ok) {
    console.error('❌ Could not fetch server details.');
    process.exit(1);
  }
  const srvData = await srvRes.json();
  serverToken = srvData.ApiTokens?.[0] || null;

  if (!serverToken) {
    console.warn('⚠️  No server API token available on first server — will create a temp server.');
  }
}

// If no existing server token, create a temp server
if (!serverToken) {
  console.log('\n🆕 Creating temporary test server on Postmark…');
  const createRes = await fetch('https://api.postmarkapp.com/servers', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Account-Token': pmToken,
    },
    body: JSON.stringify({ Name: `pastoral-care-test-${Date.now()}`, Color: 'Blue' }),
  });
  if (!createRes.ok) {
    const body = await createRes.json().catch(() => ({}));
    console.error(`❌ Could not create test server: ${body.Message || JSON.stringify(body)}`);
    process.exit(1);
  }
  const created = await createRes.json();
  serverToken = created.ApiTokens?.[0];
  console.log(`   ✅ Temp server created (ID: ${created.ID}), will delete after test.`);

  // Send the email
  await sendTestEmail(serverToken, fromEmail, fromName, TO_EMAIL);

  // Clean up
  console.log('\n🗑️  Cleaning up temporary test server…');
  await fetch(`https://api.postmarkapp.com/servers/${created.ID}`, {
    method: 'DELETE',
    headers: { 'X-Postmark-Account-Token': pmToken },
  });
  console.log('   ✅ Temp server deleted.');
} else {
  await sendTestEmail(serverToken, fromEmail, fromName, TO_EMAIL);
}

// ── Helper ───────────────────────────────────────────────────────────────────
async function sendTestEmail(token, from, name, to) {
  console.log(`\n📤 Sending test email to ${to}…`);
  const res = await fetch('https://api.postmarkapp.com/email', {
    method: 'POST',
    headers: {
      'Accept': 'application/json',
      'Content-Type': 'application/json',
      'X-Postmark-Server-Token': token,
    },
    body: JSON.stringify({
      From: `${name} <${from}>`,
      To: to,
      Subject: '✅ Postmark Integration Test — Pastoral Care',
      HtmlBody: `
        <div style="font-family:sans-serif;max-width:520px;margin:40px auto;padding:32px;border:1px solid #e2e8f0;border-radius:12px;">
          <h2 style="color:#7c3aed;margin-top:0;">✅ Postmark is connected!</h2>
          <p style="color:#475569;">This test email confirms that your <strong>Pastoral Care</strong> platform is successfully connected to Postmark and ready to send emails.</p>
          <table style="width:100%;border-collapse:collapse;margin:20px 0;font-size:13px;">
            <tr style="background:#f8fafc;"><td style="padding:8px 12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Provider</td><td style="padding:8px 12px;color:#0f172a;">Postmark</td></tr>
            <tr><td style="padding:8px 12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">From</td><td style="padding:8px 12px;color:#0f172a;">${name} &lt;${from}&gt;</td></tr>
            <tr style="background:#f8fafc;"><td style="padding:8px 12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">To</td><td style="padding:8px 12px;color:#0f172a;">${to}</td></tr>
            <tr><td style="padding:8px 12px;color:#94a3b8;font-weight:600;text-transform:uppercase;letter-spacing:.05em;">Sent at</td><td style="padding:8px 12px;color:#0f172a;">${new Date().toLocaleString()}</td></tr>
          </table>
          <p style="color:#94a3b8;font-size:12px;margin-bottom:0;">You can now switch your Email Delivery provider to Postmark in System Settings when ready.</p>
        </div>
      `,
      TextBody: `Postmark Integration Test\n\nThis confirms Pastoral Care is connected to Postmark.\n\nFrom: ${name} <${from}>\nTo: ${to}\nSent: ${new Date().toLocaleString()}`,
      MessageStream: 'outbound',
    }),
  });

  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    console.error(`❌ Email send failed (HTTP ${res.status}): ${body.Message || JSON.stringify(body)}`);
    process.exit(1);
  }
  console.log(`   ✅ Email sent! Message ID: ${body.MessageID}`);
  console.log(`   ✅ Submitted at: ${body.SubmittedAt}`);
}

console.log('\n🎉 All checks passed — Postmark integration is working correctly.');
