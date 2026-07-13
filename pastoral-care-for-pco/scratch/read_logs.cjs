const admin = require('firebase-admin');

admin.initializeApp({
  projectId: 'pastoral-care-for-pco',
});

const db = admin.firestore();

async function checkLogs() {
  const snapshot = await db.collection('logs')
    .orderBy('timestamp', 'desc')
    .limit(10)
    .get();
  
  snapshot.forEach(doc => {
    const data = doc.data();
    if (data.message && data.message.includes('Canva')) {
        console.log(data.timestamp, data.message, data.metadata);
    }
  });
}

checkLogs().catch(console.error);
