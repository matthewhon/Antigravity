import { getDb } from './backend/firebase';

async function check() {
  const db = getDb();
  const snap = await db.collection('people').where('churchId', '==', 'ch_v0cjkh0z1').limit(5).get();
  console.log('People:');
  snap.docs.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id}, Name: ${data.name}, Phone: ${data.e164Phone || data.phone}`);
  });
}
check().catch(console.error);
