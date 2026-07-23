import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

admin.initializeApp({
  projectId: 'pastoral-care-for-pco'
});

const db = getFirestore(admin.app(), 'pcforpco');

async function checkLogs() {
  const churchId = 'ch_v0cjkh0z1';
  
  console.log(`Checking logs for church ${churchId}`);
  const snap = await db.collection('logs')
    .where('churchId', '==', churchId)
    .limit(1000)
    .get();
    
  console.log(`Found ${snap.size} logs`);
  
  const relevantLogs = [];
  snap.forEach(doc => {
    const data = doc.data();
    if (data.message.includes('InfoUpdateScheduler') || data.message.includes('pic_1784725242619_2z425l')) {
      relevantLogs.push(data);
    }
  });

  relevantLogs.sort((a, b) => a.timestamp - b.timestamp);
  relevantLogs.forEach(data => {
    console.log(`[${new Date(data.timestamp).toISOString()}] ${data.level.toUpperCase()} - ${data.message} | Context: ${data.details}`);
  });
}

checkLogs().catch(console.error);
