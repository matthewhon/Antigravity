import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import fetch from 'node-fetch';

const app = initializeApp();
const db = getFirestore();

async function run() {
  const churchId = 'ch_v0cjkh0z1';
  const doc = await db.collection('churches').doc(churchId).get();
  const token = doc.data().pcoAccessToken;
  
  const res = await fetch('https://api.planningcenteronline.com/registrations/v2/signups?per_page=2', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  const data = await res.json();
  console.log(JSON.stringify(data.data[0], null, 2));
}

run().catch(console.error);
