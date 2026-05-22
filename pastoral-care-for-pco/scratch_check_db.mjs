import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

function getDb(dbId) {
    if (!admin.apps.length) {
        admin.initializeApp({
            projectId: 'pastoral-care-for-pco',
        });
    }
    return dbId ? getFirestore(admin.app(), dbId) : getFirestore(admin.app());
}

async function check() {
  const defaultDb = getDb();
  console.log('Checking default database for users...');
  const userSnap = await defaultDb.collection('users').doc('MR9FBPeop3TRfsujxtvcDEIvd492').get();
  console.log('Default DB User exists:', userSnap.exists);
  if (userSnap.exists) {
    console.log('Default DB User data:', userSnap.data());
  } else {
    // List collections in default DB
    const cols = await defaultDb.listCollections();
    console.log('Default DB collections:', cols.map(c => c.id));
  }
}
check().catch(console.error);
