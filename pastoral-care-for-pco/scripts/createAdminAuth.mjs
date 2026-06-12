import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { existsSync } from 'fs';

const PROJECT_ID  = 'pastoral-care-for-pco';

const KEY_PATH = new URL('../serviceAccountKey.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const credential = existsSync(KEY_PATH) ? cert(KEY_PATH) : applicationDefault();

initializeApp({ credential, projectId: PROJECT_ID });

async function main() {
  const auth = getAuth();
  const uid = 'demo_admin_1';
  const email = 'admin@gracebaptist.church';
  const password = 'password123';
  const displayName = 'Demo Admin';

  try {
    await auth.createUser({ uid, email, password, displayName });
    console.log('User created successfully');
  } catch (e) {
    if (e.code === 'auth/email-already-exists' || e.code === 'auth/uid-already-exists') {
      console.log('User already exists. Updating password...');
      await auth.updateUser(uid, { password });
      console.log('Password updated successfully');
    } else {
      console.error('Error creating user:', e);
    }
  }
}

main().catch(console.error);
