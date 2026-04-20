// Reset stale sub-account SID so provisionTwilioNumber creates a fresh one.
// Run: GOOGLE_APPLICATION_CREDENTIALS=path/to/sa.json node scripts/reset-sub-account.cjs <churchId>

const { initializeApp, applicationDefault } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

initializeApp({ credential: applicationDefault() });
const db = getFirestore();

const churchId = process.argv[2];
if (!churchId) { console.error('Usage: node reset-sub-account.cjs <churchId>'); process.exit(1); }

(async () => {
  const ref = db.collection('churches').doc(churchId);
  const snap = await ref.get();
  if (!snap.exists) { console.error('Church not found:', churchId); process.exit(1); }
  const sms = snap.data()?.smsSettings || {};
  console.log('Current sub-account SID:', sms.twilioSubAccountSid || '(none)');
  console.log('Current phone number   :', sms.twilioPhoneNumber || '(none)');

  // Null out the sub-account credentials so provision creates a fresh one.
  // Leave the Customer Profile SID and A2P status intact.
  await ref.update({
    'smsSettings.twilioSubAccountSid':       null,
    'smsSettings.twilioSubAccountAuthToken': null,
    'smsSettings.twilioPhoneNumber':         null,
    'smsSettings.twilioPhoneSid':            null,
    'smsSettings.smsEnabled':                false,
  });
  console.log('✓ Cleared stale sub-account for', churchId);
  console.log('  The next "Claim Number" will create a fresh Twilio sub-account.');
})().catch(e => { console.error(e); process.exit(1); });
