import admin from 'firebase-admin';

admin.initializeApp({
  projectId: 'pastoral-care-for-pco'
});

const db = admin.firestore();

async function check() {
  const snap = await db.collection('churches').get();
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`Church: ${doc.id} - ${data.name}`);
  });
}

check().catch(console.error);
