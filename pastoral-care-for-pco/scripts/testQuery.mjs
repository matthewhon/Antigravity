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

  try {
    const snap = await db.collection('smsConversations')
      .where('churchId', '==', churchId)
      .orderBy('lastMessageAt', 'desc')
      .limit(100)
      .get();
      
    console.log(`Found ${snap.docs.length} conversations for ${churchId} using orderBy`);
    if (snap.empty) {
      console.log('Query returned empty!');
    } else {
      snap.forEach(d => {
         console.log(d.id, d.data().lastMessageAt);
      });
    }
  } catch (err) {
    console.error('Error running ordered query:', err);
  }
}

main().catch(console.error);
