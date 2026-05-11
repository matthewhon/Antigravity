import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

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
  const snap = await db.collection('smsNumbers').where('churchId', '==', 'ch_v0cjkh0z1').get();
  console.log('Numbers:', JSON.stringify(snap.docs.map(d => ({id: d.id, ...d.data()})), null, 2));

  const churchSnap = await db.collection('churches').doc('ch_v0cjkh0z1').get();
  console.log('Church SMS Settings:', JSON.stringify(churchSnap.data()?.smsSettings, null, 2));
}
check().catch(console.error);
