import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

admin.initializeApp({
  projectId: 'pastoral-care-for-pco'
});

const db = getFirestore(admin.app(), 'pcforpco');

async function check() {
  const churchId = 'ch_v0cjkh0z1';
  
  console.log(`Checking people_info_campaigns for church ${churchId}`);
  const snap = await db.collection('people_info_campaigns').where('churchId', '==', churchId).get();
  console.log(`Found ${snap.size} people_info_campaigns`);
  
  snap.forEach(doc => {
    const data = doc.data();
    console.log(`\n--- Campaign: ${doc.id} ---`);
    console.log(`Name: ${data.name}`);
    console.log(`Status: ${data.status}`);
    console.log(`Schedule:`, data.schedule);
    console.log(`Behavior: ${data.fieldBehavior}`);
    console.log(`Stats:`, data.stats);
    console.log(`Channels:`, data.channels);
    console.log(`PCO List ID: ${data.pcoListId}`);
  });

  console.log(`\nChecking people_info_sessions for church ${churchId}`);
  const sessionsSnap = await db.collection('people_info_sessions').where('churchId', '==', churchId).get();
  console.log(`Found ${sessionsSnap.size} people_info_sessions`);
  sessionsSnap.forEach(doc => {
    const data = doc.data();
    console.log(`Session: ${doc.id} | Campaign: ${data.campaignId} | Person: ${data.personName} | Status: ${data.status} | Attempts: ${data.attemptCount} | Next: ${data.nextScheduledAt ? new Date(data.nextScheduledAt).toISOString() : null}`);
  });
}

check().catch(console.error);
