const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

let sa;
try { sa = require('../functions/service-account.json'); } catch { sa = require('../service-account.json'); }

initializeApp({ credential: cert(sa) });
const db = getFirestore();

(async () => {
  const snap = await db.collection('churches').get();
  for (const doc of snap.docs) {
    const d = doc.data();
    if (d.smsSettings?.twilioSubAccountSid || d.smsSettings?.smsEnabled) {
      console.log('\n=== Church:', doc.id, '|', d.name, '===');
      console.log('  subSid    :', d.smsSettings?.twilioSubAccountSid || '(none)');
      console.log('  hasToken  :', !!(d.smsSettings?.twilioSubAccountAuthToken));
      console.log('  phone     :', d.smsSettings?.twilioPhoneNumber || '(none)');
      console.log('  smsEnabled:', d.smsSettings?.smsEnabled);
      console.log('  a2pStatus :', d.smsSettings?.twilioA2pStatus);
      console.log('  profileSid:', d.smsSettings?.twilioCustomerProfileSid || '(none)');
    }
  }
})().catch(console.error);
