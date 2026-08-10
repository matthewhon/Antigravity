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
  const churchId = 'ch_v0cjkh0z1';
  console.log(`=== Step 6 Messages sent to Matthew Hon today ===`);
  const convSnap = await db.collection('smsConversations').where('churchId', '==', churchId).get();
  for (const doc of convSnap.docs) {
    const d = doc.data();
    if (d.phoneNumber === '+14693440785' || (d.personName && d.personName.toLowerCase().includes('matthew'))) {
      const msgSnap = await doc.ref.collection('messages').get();
      const msgs = [];
      msgSnap.forEach(m => msgs.push({ id: m.id, ...m.data() }));
      msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      msgs.forEach(m => {
        if (m.campaignId === 'wf_nOs2WSP7ABclJwQpVqnI_step5_staff') {
          console.log(`\nTime: ${new Date(m.createdAt).toISOString()} (${m.createdAt})`);
          console.log(`Message SID: ${m.messageSid}`);
          console.log(`Body:\n${m.body}`);
        }
      });
    }
  }
}

run().then(() => process.exit(0)).catch(console.error);
