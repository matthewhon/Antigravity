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
  
  console.log('--- twilioNumbers ---');
  const tnSnap = await db.collection('twilioNumbers').where('churchId', '==', 'c1').get();
  tnSnap.forEach(d => console.log(d.id, d.data()));

  console.log('\n--- smsConversations ---');
  const cvSnap = await db.collection('smsConversations').where('churchId', '==', 'c1').get();
  cvSnap.forEach(d => console.log(d.id, d.data()));

  if (!cvSnap.empty) {
      console.log('\n--- messages for conversation:', cvSnap.docs[0].id, '---');
      const msSnap = await db.collection('smsConversations').doc(cvSnap.docs[0].id).collection('messages').get();
      msSnap.forEach(d => console.log(d.id, d.data()));
  }
}

main().catch(console.error);
