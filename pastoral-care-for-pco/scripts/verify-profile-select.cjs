/**
 * Quick simulation of the new fetchPrimaryProfileSid selection logic
 * against the actual data from the Twilio account.
 */
'use strict';
const admin  = require('firebase-admin');
const twilio = require('twilio');

if (!admin.apps.length) admin.initializeApp({ projectId: 'pastoral-care-for-pco' });
const db = admin.firestore(admin.app());
db.settings({ databaseId: 'pcforpco' });

const EXPECTED = 'BUa1af845d485a108299cd1bfb3e59ac51';

async function main() {
  const sys     = (await db.doc('system/settings').get()).data() || {};
  const client  = twilio(sys.twilioMasterAccountSid, sys.twilioMasterAuthToken);
  const isvName = (sys.organizationName || sys.isvName || 'Hon Ventures').toLowerCase();

  const profiles = await client.trusthub.v1.customerProfiles.list({ pageSize: 50 });

  // Count policy SIDs
  const policyCounts = {};
  for (const p of profiles) {
    const ps = p.policySid || 'none';
    policyCounts[ps] = (policyCounts[ps] || 0) + 1;
  }
  const churchPolicySids = new Set(
    Object.entries(policyCounts).filter(([, c]) => c > 1).map(([s]) => s)
  );

  // Step 1: exclude church secondaries
  let candidates = profiles.filter(p => !churchPolicySids.has(p.policySid || 'none'));

  // Step 2: name match
  const nameMatch = candidates.find(p => (p.friendlyName || '').toLowerCase().includes(isvName));

  const selected = nameMatch || candidates[0] || profiles[0];

  console.log(`\nISV name filter : "${isvName}"`);
  console.log(`Church policy SIDs excluded: ${[...churchPolicySids].join(', ')}`);
  console.log(`Remaining candidates: ${candidates.length}`);
  console.log(`\nSelected : ${selected?.sid}  "${selected?.friendlyName}"  [${selected?.status}]`);
  console.log(selected?.sid === EXPECTED ? '✅  CORRECT!' : `❌  WRONG — expected ${EXPECTED}`);
}

main().catch(e => { console.error(e.message); process.exit(1); });
