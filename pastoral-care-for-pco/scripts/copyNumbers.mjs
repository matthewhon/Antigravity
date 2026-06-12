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
  
  const churchId = 'c1';

  // Copy twilioNumbers -> smsNumbers
  const oldNums = await db.collection('twilioNumbers').where('churchId', '==', churchId).get();
  let count = 0;
  for (const doc of oldNums.docs) {
    await db.collection('smsNumbers').doc(doc.id).set(doc.data());
    count++;
  }
  console.log(`Copied ${count} numbers to smsNumbers!`);
}

main().catch(console.error);
