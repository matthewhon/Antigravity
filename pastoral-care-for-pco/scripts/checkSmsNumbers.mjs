import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync } from 'fs';

const PROJECT_ID  = 'pastoral-care-for-pco';
const KEY_PATH = new URL('../serviceAccountKey.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const credential = existsSync(KEY_PATH) ? cert(KEY_PATH) : applicationDefault();

initializeApp({ credential, projectId: PROJECT_ID });

async function main() {
  const db = getFirestore();
  db.settings({ databaseId: 'pcforpco', ignoreUndefinedProperties: true });
  
  const snap = await db.collection('smsNumbers').where('churchId', '==', 'c1').get();
  console.log(`Found ${snap.docs.length} numbers in smsNumbers for c1.`);
  snap.forEach(d => console.log(d.id, d.data().phoneNumber));

  const convSnap = await db.collection('smsConversations').where('churchId', '==', 'c1').get();
  console.log(`Found ${convSnap.docs.length} conversations in smsConversations for c1.`);
}

main().catch(console.error);
