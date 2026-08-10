import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync } from 'fs';

const PROJECT_ID  = 'pastoral-care-for-pco';
const DATABASE_ID = 'pcforpco';

const KEY_PATH = new URL('../serviceAccountKey.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const credential = existsSync(KEY_PATH) ? cert(KEY_PATH) : applicationDefault();

const app = initializeApp({ credential, projectId: PROJECT_ID });
const db = getFirestore(app);
db.settings({ databaseId: DATABASE_ID, ignoreUndefinedProperties: true });

async function run() {
  const wfId = 'nOs2WSP7ABclJwQpVqnI';
  const wfDoc = await db.collection('smsWorkflows').doc(wfId).get();
  console.log(JSON.stringify(wfDoc.data(), null, 2));
}

run().then(() => process.exit(0)).catch(console.error);
