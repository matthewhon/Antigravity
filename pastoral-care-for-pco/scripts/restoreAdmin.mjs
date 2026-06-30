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

  const uid = 'wPwbkEVmz0ZbFlhUl1lLN9htgTp1';

  await db.collection('users').doc(uid).set({
    id: uid,
    name: 'Matthew Hon',
    email: 'matthew.hon@honventures.com',
    churchId: 'c1',
    roles: [
      'System Administration',
      'Church Admin', 
      'Pastor', 
      'People', 
      'Services', 
      'Groups', 
      'Giving', 
      'Metrics', 
      'Messaging', 
      'Email', 
      'Workflows', 
      'Polls'
    ],
    theme: 'modern'
  });

  console.log('Restored Firestore user document for matthew.hon@honventures.com');
}

main().catch(console.error);
