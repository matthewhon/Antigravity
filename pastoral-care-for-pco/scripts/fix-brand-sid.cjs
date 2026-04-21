/**
 * fix-brand-sid.cjs
 * Clears the incorrectly stored twilioBrandSid for ch_v0cjkh0z1.
 *
 * The Customer Profile SID (BU8ed...) was mistakenly saved as twilioBrandSid.
 * This clears it and resets twilioA2pStatus to 'not_started' so Step 4 is
 * available to run correctly on the sub-account.
 */

'use strict';

const admin = require('firebase-admin');

const CHURCH_ID     = 'ch_v0cjkh0z1';
const BAD_BRAND_SID = 'BU8ed4097cb9652478a674e0bafcc9a129'; // Customer Profile SID wrongly stored as Brand SID

if (!admin.apps.length) {
  admin.initializeApp({ projectId: 'pastoral-care-for-pco' });
}
const db = admin.firestore(admin.app());
db.settings({ databaseId: 'pcforpco' });

async function main() {
  console.log('\n── Fix: Clear bad twilioBrandSid ──────────────────────────\n');

  const ref  = db.collection('churches').doc(CHURCH_ID);
  const snap = await ref.get();
  if (!snap.exists) { console.error('Church not found'); process.exit(1); }

  const sms = snap.data().smsSettings || {};
  console.log(`Current twilioBrandSid    : ${sms.twilioBrandSid}`);
  console.log(`Current twilioA2pStatus   : ${sms.twilioA2pStatus}`);
  console.log(`Customer Profile SID      : ${sms.twilioCustomerProfileSid}`);
  console.log('');

  if (sms.twilioBrandSid !== BAD_BRAND_SID) {
    console.log('twilioBrandSid is already different — nothing to fix.');
    process.exit(0);
  }

  await ref.update({
    'smsSettings.twilioBrandSid':      admin.firestore.FieldValue.delete(),
    'smsSettings.twilioA2pStatus':     'not_started',
    'smsSettings.a2pLastStatusCheck':  admin.firestore.FieldValue.delete(),
    'smsSettings.a2pSubmittedAt':      admin.firestore.FieldValue.delete(),
    'smsSettings.a2pFailureReason':    admin.firestore.FieldValue.delete(),
    'smsSettings.twilioA2pRawStatus':  admin.firestore.FieldValue.delete(),
  });

  console.log('✅  Fixed! twilioBrandSid cleared, twilioA2pStatus reset to "not_started".');
  console.log('');
  console.log('Next steps for this church:');
  console.log('  1. Open admin panel → SMS Settings for ch_v0cjkh0z1');
  console.log('  2. Customer Profile (Step 3) → already twilio-approved ✅');
  console.log('  3. Brand Registration (Step 4) → now shows "Not Started" → click Submit');
  console.log(`     Will submit under sub-account: ${sms.twilioSubAccountSid}`);
  console.log('  4. Wait for Twilio brand approval (1-5 business days)');
  console.log('  5. Then run Steps 5, 6, 7 in order');
  console.log('');
}

main().catch(e => { console.error('Fatal:', e.message); process.exit(1); });
