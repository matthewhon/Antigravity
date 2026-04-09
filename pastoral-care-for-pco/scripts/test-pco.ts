import { getDb } from './backend/firebase.js';

async function run() {
  const db = getDb();
  // Get ANY church token
  const snap = await db.collection('churches').limit(1).get();
  if (snap.empty) return console.log('No churches found');
  const token = snap.docs[0].data().pcoAccessToken;

  const res = await fetch('https://api.planningcenteronline.com/calendar/v2/events?per_page=2', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
  process.exit(0);
}

run().catch(console.error);
