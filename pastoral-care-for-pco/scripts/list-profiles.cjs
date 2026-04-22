/**
 * list-profiles.cjs
 * Lists all Customer Profiles and Trust Products on the master Twilio account
 * so we can see what the fetch endpoint is seeing and why it picks the wrong one.
 */
'use strict';
const admin  = require('firebase-admin');
const twilio = require('twilio');

if (!admin.apps.length) admin.initializeApp({ projectId: 'pastoral-care-for-pco' });
const db = admin.firestore(admin.app());
db.settings({ databaseId: 'pcforpco' });

const TARGET_SID = 'BUa1af845d485a108299cd1bfb3e59ac51';

async function main() {
  const sys = (await db.doc('system/settings').get()).data() || {};
  const masterSid   = sys.twilioMasterAccountSid;
  const masterToken = sys.twilioMasterAuthToken;
  if (!masterSid || !masterToken) { console.error('No master creds'); process.exit(1); }

  const client = twilio(masterSid, masterToken);

  console.log(`\nMaster Account: ${masterSid}\n`);

  // ── 1. All Customer Profiles (trusthub.v1.customerProfiles) ─────────────
  console.log('═══ trusthub.v1.customerProfiles ═══');
  try {
    const profiles = await client.trusthub.v1.customerProfiles.list({ pageSize: 50 });
    profiles.forEach(p => {
      const marker = p.sid === TARGET_SID ? '  ◄── TARGET' : '';
      console.log(`  ${p.sid}  [${p.status.padEnd(16)}]  policySid=${p.policySid || '(none)'}  "${p.friendlyName}"${marker}`);
    });
    if (profiles.length === 0) console.log('  (none found)');
  } catch (e) { console.log('  ERROR:', e.message); }

  // ── 2. All Trust Products (trusthub.v1.trustProducts) ───────────────────
  console.log('\n═══ trusthub.v1.trustProducts ═══');
  try {
    const products = await client.trusthub.v1.trustProducts.list({ pageSize: 50 });
    products.forEach(p => {
      const marker = p.sid === TARGET_SID ? '  ◄── TARGET' : '';
      console.log(`  ${p.sid}  [${p.status.padEnd(16)}]  policySid=${p.policySid || '(none)'}  "${p.friendlyName}"${marker}`);
    });
    if (products.length === 0) console.log('  (none found)');
  } catch (e) { console.log('  ERROR:', e.message); }

  console.log('');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
