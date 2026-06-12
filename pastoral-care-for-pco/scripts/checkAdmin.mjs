import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync } from 'fs';

const PROJECT_ID  = 'pastoral-care-for-pco';
const KEY_PATH = new URL('../serviceAccountKey.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const credential = existsSync(KEY_PATH) ? cert(KEY_PATH) : applicationDefault();

initializeApp({ credential, projectId: PROJECT_ID });

async function main() {
  const auth = getAuth();
  const db = getFirestore();
  db.settings({ databaseId: 'pcforpco', ignoreUndefinedProperties: true });

  const email = 'matthew.hon@honventures.com';

  try {
    const user = await auth.getUserByEmail(email);
    console.log('Firebase Auth User:', JSON.stringify(user, null, 2));
    
    const dbUser = await db.collection('users').doc(user.uid).get();
    if (dbUser.exists) {
      console.log('Firestore User Document:', JSON.stringify(dbUser.data(), null, 2));
    } else {
      console.log('No corresponding Firestore user document found.');
    }
  } catch (e) {
    console.error('Error fetching user:', e);
  }
}

main().catch(console.error);
