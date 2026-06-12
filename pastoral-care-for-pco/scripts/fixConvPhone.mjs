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

  const snap = await db.collection('smsConversations').where('churchId', '==', churchId).get();
  let count = 0;
  for (const doc of snap.docs) {
    const data = doc.data();
    if (data.contactPhoneNumber && !data.phoneNumber) {
      await db.collection('smsConversations').doc(doc.id).update({
        phoneNumber: data.contactPhoneNumber
      });
      count++;
    }
  }
  console.log(`Updated ${count} conversations with missing phoneNumber!`);
}

main().catch(console.error);
