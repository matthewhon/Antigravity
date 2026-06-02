import { getDb } from '../firebase';

async function run() {
  try {
    const db = getDb();
    const doc = await db.collection('churches').doc('c1').get();
    if (doc.exists) {
      console.log('C1 Document found:', JSON.stringify(doc.data(), null, 2));
    } else {
      console.log('C1 Document does not exist');
    }
    
    const settingsSnap = await db.doc('system/settings').get();
    if (settingsSnap.exists) {
      console.log('System Settings found:', JSON.stringify(settingsSnap.data(), null, 2));
    } else {
      console.log('System Settings doc does not exist');
    }
  } catch (e) {
    console.error('Error:', e);
  }
}
run();
