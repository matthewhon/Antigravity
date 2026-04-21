/**
 * repair-a2p.cjs
 * Diagnose and repair A2P pipeline for a single church.
 *
 * Usage:
 *   node scripts/repair-a2p.cjs [--repair]
 *
 * Without --repair:  prints a full diagnostic report (read-only)
 * With    --repair:  deletes misplaced Messaging Service + Campaign from
 *                    master account and clears those Firestore fields so
 *                    the admin can re-run the pipeline on the correct sub-account.
 */

'use strict';

const admin  = require('firebase-admin');
const twilio = require('twilio');

const CHURCH_ID = 'ch_v0cjkh0z1';
const REPAIR    = process.argv.includes('--repair');

// ── Firebase init ────────────────────────────────────────────────────────────
if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'pastoral-care-for-pco' });
}
const db = admin.firestore(admin.app());
// Named database
db.settings({ databaseId: 'pcforpco' });

// ─────────────────────────────────────────────────────────────────────────────

function getClient(masterSid, authToken, subAccountSid) {
  return subAccountSid
    ? twilio(masterSid, authToken, { accountSid: subAccountSid })
    : twilio(masterSid, authToken);
}

async function tryFetch(fn, label) {
  try {
    const data = await fn();
    return { ok: true, data };
  } catch (e) {
    return { ok: false, error: e.message, code: e.code };
  }
}

async function main() {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`  A2P Diagnostic${REPAIR ? ' + REPAIR' : ''} — Church: ${CHURCH_ID}`);
  console.log(`${'─'.repeat(60)}\n`);

  // ── 1. Read system/settings for master Twilio creds ──────────────────────
  const sysSnap = await db.doc('system/settings').get();
  const sys = sysSnap.data() || {};
  const masterSid   = sys.twilioMasterAccountSid;
  const masterToken = sys.twilioMasterAuthToken;

  if (!masterSid || !masterToken) {
    console.error('❌  Twilio master credentials not found in system/settings. Aborting.');
    process.exit(1);
  }
  console.log(`✅  Master Account SID : ${masterSid}`);

  // ── 2. Read church smsSettings ────────────────────────────────────────────
  const churchSnap = await db.collection('churches').doc(CHURCH_ID).get();
  if (!churchSnap.exists) {
    console.error(`❌  Church ${CHURCH_ID} not found in Firestore. Aborting.`);
    process.exit(1);
  }
  const sms = churchSnap.data().smsSettings || {};

  const subAccountSid   = sms.twilioSubAccountSid;
  const cpSid           = sms.twilioCustomerProfileSid;
  const brandSid        = sms.twilioBrandSid;
  const mgSid           = sms.twilioMessagingServiceSid;
  const campaignSid     = sms.twilioUsAppToPersonSid;

  console.log(`📋  Firestore smsSettings:`);
  console.log(`    twilioSubAccountSid         : ${subAccountSid     || '(none)'}`);
  console.log(`    twilioCustomerProfileSid    : ${cpSid             || '(none)'}`);
  console.log(`    twilioBrandSid              : ${brandSid          || '(none)'}`);
  console.log(`    twilioMessagingServiceSid   : ${mgSid             || '(none)'}`);
  console.log(`    twilioUsAppToPersonSid      : ${campaignSid       || '(none)'}`);
  console.log(`    twilioA2pStatus             : ${sms.twilioA2pStatus || '(none)'}`);
  console.log(`    twilioA2pCampaignStatus     : ${sms.twilioA2pCampaignStatus || '(none)'}`);
  console.log(`    twilioNumbersLinked         : ${sms.twilioNumbersLinked || false}`);
  console.log('');

  if (!subAccountSid) {
    console.warn('⚠️   No sub-account SID on file. Cannot check sub-account resources.');
  }

  const master    = getClient(masterSid, masterToken);
  const subClient = subAccountSid ? getClient(masterSid, masterToken, subAccountSid) : null;

  const report = {};

  // ── 3. Customer Profile (always on master — expected) ─────────────────────
  console.log('🔍  Checking Customer Profile (BU...)...');
  if (cpSid) {
    const r = await tryFetch(
      () => master.trusthub.v1.customerProfiles(cpSid).fetch(),
      'customerProfile'
    );
    if (r.ok) {
      report.customerProfile = { sid: cpSid, account: 'master', status: r.data.status };
      const icon = r.data.status === 'twilio-approved' ? '✅' : '⚠️ ';
      console.log(`    ${icon}  ${cpSid}  status=${r.data.status}  (master — expected)`);
    } else {
      report.customerProfile = { sid: cpSid, account: 'not_found', error: r.error };
      console.log(`    ❌  Not found: ${r.error}`);
    }
  } else {
    report.customerProfile = { sid: null, account: 'not_found' };
    console.log('    ⚠️   No SID stored');
  }

  // ── 4. Brand Registration ─────────────────────────────────────────────────
  console.log('\n🔍  Checking Brand Registration...');
  if (brandSid) {
    // Try sub-account first (correct), then master (wrong)
    let brandAccount = 'not_found';
    let brandStatus  = null;
    if (subClient) {
      const r = await tryFetch(() => subClient.messaging.v1.brandRegistrations(brandSid).fetch(), 'brand-sub');
      if (r.ok) { brandAccount = 'sub'; brandStatus = r.data.status; }
    }
    if (brandAccount === 'not_found') {
      const r = await tryFetch(() => master.messaging.v1.brandRegistrations(brandSid).fetch(), 'brand-master');
      if (r.ok) { brandAccount = 'master'; brandStatus = r.data.status; }
    }
    report.brandRegistration = { sid: brandSid, account: brandAccount, status: brandStatus };

    if (brandAccount === 'sub') {
      console.log(`    ✅  ${brandSid}  status=${brandStatus}  (sub-account — correct ✔)`);
    } else if (brandAccount === 'master') {
      console.log(`    ❌  ${brandSid}  status=${brandStatus}  (MASTER account — WRONG)`);
      console.log(`    ⚠️   Brand registrations CANNOT be deleted via API.`);
      console.log(`    📞  You must contact Twilio Support to cancel/delete this brand.`);
    } else {
      console.log(`    ⚠️   ${brandSid} not found on either account`);
    }
  } else {
    report.brandRegistration = { sid: null, account: 'not_found' };
    console.log('    ⚠️   No Brand SID stored');
  }

  // ── 5. Messaging Service (MG...) ─────────────────────────────────────────
  console.log('\n🔍  Checking Messaging Service (MG...)...');
  let mgAccount = 'not_found';
  if (mgSid) {
    if (subClient) {
      const r = await tryFetch(() => subClient.messaging.v1.services(mgSid).fetch(), 'mg-sub');
      if (r.ok) { mgAccount = 'sub'; report.messagingService = { sid: mgSid, account: 'sub', friendlyName: r.data.friendlyName }; }
    }
    if (mgAccount === 'not_found') {
      const r = await tryFetch(() => master.messaging.v1.services(mgSid).fetch(), 'mg-master');
      if (r.ok) { mgAccount = 'master'; report.messagingService = { sid: mgSid, account: 'master', friendlyName: r.data.friendlyName }; }
    }
    if (mgAccount === 'not_found') {
      report.messagingService = { sid: mgSid, account: 'not_found' };
    }

    if (mgAccount === 'sub') {
      console.log(`    ✅  ${mgSid}  (sub-account — correct ✔)  ${report.messagingService.friendlyName || ''}`);
    } else if (mgAccount === 'master') {
      console.log(`    ❌  ${mgSid}  (MASTER account — WRONG)  ${report.messagingService.friendlyName || ''}`);
      if (REPAIR) {
        console.log(`    🔧  REPAIR: deleting from master account...`);
        const del = await tryFetch(() => master.messaging.v1.services(mgSid).remove(), 'mg-delete');
        if (del.ok) {
          report.messagingService.repaired = true;
          console.log(`    ✅  Deleted successfully`);
        } else {
          report.messagingService.repairError = del.error;
          console.log(`    ❌  Delete failed: ${del.error}`);
        }
      }
    } else {
      console.log(`    ⚠️   ${mgSid} not found on either account`);
    }
  } else {
    report.messagingService = { sid: null, account: 'not_found' };
    console.log('    ⚠️   No Messaging Service SID stored');
  }

  // ── 6. A2P Campaign (UsAppToPerson) ──────────────────────────────────────
  console.log('\n🔍  Checking A2P Campaign (UsAppToPerson)...');
  let campaignAccount = 'not_found';
  if (campaignSid && mgSid) {
    // Try sub-account first (only if MG is on sub)
    if (subClient && mgAccount === 'sub') {
      const r = await tryFetch(
        () => subClient.messaging.v1.services(mgSid).usAppToPerson(campaignSid).fetch(),
        'campaign-sub'
      );
      if (r.ok) { campaignAccount = 'sub'; report.campaign = { sid: campaignSid, account: 'sub', status: r.data.campaignStatus }; }
    }
    // Try master account (MG might have been on master)
    if (campaignAccount === 'not_found') {
      const r = await tryFetch(
        () => master.messaging.v1.services(mgSid).usAppToPerson(campaignSid).fetch(),
        'campaign-master'
      );
      if (r.ok) { campaignAccount = 'master'; report.campaign = { sid: campaignSid, account: 'master', status: r.data.campaignStatus }; }
    }
    if (campaignAccount === 'not_found') {
      report.campaign = { sid: campaignSid, account: 'not_found' };
    }

    if (campaignAccount === 'sub') {
      console.log(`    ✅  ${campaignSid}  (sub-account — correct ✔)  status=${report.campaign.status}`);
    } else if (campaignAccount === 'master') {
      console.log(`    ❌  ${campaignSid}  (MASTER account — WRONG)  status=${report.campaign.status}`);
      if (REPAIR) {
        console.log(`    🔧  REPAIR: deleting from master account...`);
        const del = await tryFetch(
          () => master.messaging.v1.services(mgSid).usAppToPerson(campaignSid).remove(),
          'campaign-delete'
        );
        if (del.ok) {
          report.campaign.repaired = true;
          console.log(`    ✅  Deleted successfully`);
        } else {
          report.campaign.repairError = del.error;
          console.log(`    ❌  Delete failed: ${del.error}`);
        }
      }
    } else {
      console.log(`    ⚠️   ${campaignSid} not found on either account`);
    }
  } else {
    report.campaign = { sid: campaignSid || null, account: 'not_found' };
    console.log('    ⚠️   No Campaign SID stored (or no MG SID to look it up under)');
  }

  // ── 7. Clear Firestore fields for repaired resources ─────────────────────
  if (REPAIR) {
    console.log('\n🔧  Updating Firestore...');
    const clearFields = {};

    if (mgAccount === 'master') {
      clearFields['smsSettings.twilioMessagingServiceSid'] = admin.firestore.FieldValue.delete();
      clearFields['smsSettings.twilioNumbersLinked']       = admin.firestore.FieldValue.delete();
      clearFields['smsSettings.twilioNumbersLinkedAt']     = admin.firestore.FieldValue.delete();
    }
    if (campaignAccount === 'master') {
      clearFields['smsSettings.twilioUsAppToPersonSid']    = admin.firestore.FieldValue.delete();
      clearFields['smsSettings.twilioA2pCampaignStatus']   = admin.firestore.FieldValue.delete();
      clearFields['smsSettings.a2pCampaignSubmittedAt']    = admin.firestore.FieldValue.delete();
    }

    if (Object.keys(clearFields).length > 0) {
      await db.collection('churches').doc(CHURCH_ID).update(clearFields);
      console.log(`    ✅  Cleared fields: ${Object.keys(clearFields).join(', ')}`);
    } else {
      console.log('    ℹ️   Nothing to clear in Firestore.');
    }
  }

  // ── 8. Summary ────────────────────────────────────────────────────────────
  console.log(`\n${'─'.repeat(60)}`);
  console.log('  SUMMARY');
  console.log(`${'─'.repeat(60)}`);

  const wrongAccount = [
    report.brandRegistration?.account === 'master'    && `Brand (${brandSid}) — on master`,
    report.messagingService?.account  === 'master'    && `Messaging Service (${mgSid}) — on master`,
    report.campaign?.account          === 'master'    && `Campaign (${campaignSid}) — on master`,
  ].filter(Boolean);

  if (wrongAccount.length === 0) {
    console.log('✅  All resources are on the correct sub-account!');
  } else {
    console.log('❌  Resources in wrong account:');
    wrongAccount.forEach(w => console.log(`    • ${w}`));
  }

  if (report.brandRegistration?.account === 'master') {
    console.log(`\n⚠️   MANUAL ACTION REQUIRED — Brand Registration:`);
    console.log(`    SID     : ${brandSid}`);
    console.log(`    Status  : ${report.brandRegistration.status}`);
    console.log(`    Action  : Contact Twilio Support → request cancellation of brand ${brandSid}`);
    console.log(`    Then    : Clear twilioBrandSid from Firestore and re-run Step 4`);
    console.log(`              (it will now register under sub-account ${subAccountSid})`);
  }

  if (REPAIR && wrongAccount.length > 0) {
    console.log('\n✅  Repair complete. Steps to finish:');
    if (report.brandRegistration?.account !== 'master') {
      console.log('    • Brand is correct — no action needed');
    } else {
      console.log('    • Contact Twilio Support about the brand (see above)');
    }
    console.log('    • Re-run Step 5 (Create Messaging Service) from the admin panel');
    console.log('    • Re-run Step 6 (Register Campaign) from the admin panel');
    console.log('    • Re-run Step 7 (Link Numbers) from the admin panel');
  } else if (!REPAIR && wrongAccount.length > 0) {
    console.log('\n▶️   Run with --repair to fix automatically:');
    console.log(`    node scripts/repair-a2p.cjs --repair`);
  }

  console.log(`\n${'─'.repeat(60)}\n`);
}

main().catch(e => {
  console.error('\n💥  Fatal error:', e.message);
  process.exit(1);
});
