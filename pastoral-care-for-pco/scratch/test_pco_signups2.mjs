import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync } from 'fs';
import fetch from 'node-fetch';

const PROJECT_ID  = 'pastoral-care-for-pco';
const DATABASE_ID = 'pcforpco';

const KEY_PATH = new URL('../serviceAccountKey.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const credential = existsSync(KEY_PATH) ? cert(KEY_PATH) : applicationDefault();

const app = initializeApp({ credential, projectId: PROJECT_ID });
const db = getFirestore(app);
db.settings({ databaseId: DATABASE_ID, ignoreUndefinedProperties: true });

async function run() {
  const churchId = 'ch_v0cjkh0z1';
  const doc = await db.collection('churches').doc(churchId).get();
  const token = doc.data().pcoAccessToken;
  
  const res = await fetch('https://api.planningcenteronline.com/registrations/v2/signups?per_page=2', {
    headers: { 'Authorization': `Bearer ${token}` }
  });
  if (!res.ok) {
    console.error('API Error:', res.status);
    console.error(await res.text());
    return;
  }
  const data = await res.json();
  console.log(JSON.stringify(data.data[0], null, 2));
}

run().catch(console.error);
