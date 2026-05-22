const admin = require('firebase-admin');
const { getFirestore } = require('firebase-admin/firestore');

function getDb() {
    if (!admin.apps.length) {
        admin.initializeApp({
            projectId: 'pastoral-care-for-pco',
        });
    }
    return getFirestore(admin.app(), 'pcforpco');
}

async function check() {
  const db = getDb();
  
  // Find Charles's user profile
  const userSnap = await db.collection('users')
    .where('email', '==', 'charles.mccuiston@vbcrowlett.com')
    .get();
  
  if (userSnap.empty) {
    console.log('No user found with email charles.mccuiston@vbcrowlett.com');
  } else {
    userSnap.forEach(doc => {
      console.log('Charles Profile:', JSON.stringify({id: doc.id, ...doc.data()}, null, 2));
    });
  }

  // Get Twilio numbers for the church
  const snap = await db.collection('smsNumbers').where('churchId', '==', 'ch_v0cjkh0z1').get();
  console.log('Numbers:', JSON.stringify(snap.docs.map(d => ({id: d.id, ...d.data()})), null, 2));
}

check().catch(console.error);
