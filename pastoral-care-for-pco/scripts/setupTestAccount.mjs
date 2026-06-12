import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getAuth } from 'firebase-admin/auth';
import { existsSync } from 'fs';

const PROJECT_ID  = 'pastoral-care-for-pco';
const KEY_PATH = new URL('../serviceAccountKey.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const credential = existsSync(KEY_PATH) ? cert(KEY_PATH) : applicationDefault();

initializeApp({ credential, projectId: PROJECT_ID });

async function main() {
  const db = getFirestore();
  db.settings({ databaseId: 'pcforpco', ignoreUndefinedProperties: true });
  const auth = getAuth();

  const email = 'test@test.com';
  const password = 'password123'; // just in case it doesn't exist
  let uid;

  try {
    const user = await auth.getUserByEmail(email);
    uid = user.uid;
    console.log(`User ${email} found in Auth with UID: ${uid}`);
  } catch (e) {
    if (e.code === 'auth/user-not-found') {
      console.log(`User ${email} not found in Auth. Creating...`);
      const newUser = await auth.createUser({
        email,
        password,
        displayName: 'Apple Test Account'
      });
      uid = newUser.uid;
      console.log(`Created new Auth user with UID: ${uid}`);
    } else {
      throw e;
    }
  }

  await db.collection('users').doc(uid).set({
    id: uid,
    name: 'Apple Test Account',
    email: email,
    churchId: 'c1',
    roles: [
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

  console.log(`Successfully associated ${email} with tenant c1 in Firestore.`);
}

main().catch(console.error);
