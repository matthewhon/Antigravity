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
  
  console.log('Fetching logs...');
  const snap = await db.collection('logs')
    .orderBy('timestamp', 'desc')
    .limit(100)
    .get();
    
  console.log(`Found ${snap.size} logs.`);
  
  snap.forEach(doc => {
    const data = doc.data();
    const dateStr = new Date(data.timestamp).toISOString();
    console.log(`[${dateStr}] [${data.level?.toUpperCase()}] [${data.source}]: ${data.message}`);
    if (data.context) {
      console.log('  Context:', JSON.stringify(data.context));
    }
    if (data.details) {
      console.log('  Details:', data.details);
    }
  });
}

check().catch(console.error);
