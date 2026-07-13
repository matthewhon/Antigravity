const admin = require('firebase-admin');
const serviceAccount = require('../metadata.json');

if (!admin.apps.length) {
  admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
  });
}

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
