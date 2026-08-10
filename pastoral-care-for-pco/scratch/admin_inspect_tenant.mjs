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
  console.log(`=== Inspecting Church: ${churchId} ===`);

  const wfSnap = await db.collection('smsWorkflows').where('churchId', '==', churchId).get();
  console.log(`Found ${wfSnap.size} workflows for ${churchId}`);
  wfSnap.forEach(doc => {
    console.log(`Workflow ID: ${doc.id}`);
    console.log(JSON.stringify(doc.data(), null, 2));
  });

  const enrSnap = await db.collection('smsWorkflowEnrollments').where('churchId', '==', churchId).get();
  console.log(`\nFound ${enrSnap.size} enrollments for ${churchId}`);
  enrSnap.forEach(doc => {
    console.log(`Enrollment ID: ${doc.id}`);
    console.log(JSON.stringify(doc.data(), null, 2));
  });

  const convSnap = await db.collection('smsConversations').where('churchId', '==', churchId).get();
  console.log(`\nFound ${convSnap.size} conversations for ${churchId}`);
  for (const doc of convSnap.docs) {
    console.log(`\nConversation ID: ${doc.id}`);
    console.log(JSON.stringify(doc.data(), null, 2));
    const msgSnap = await doc.ref.collection('messages').get();
    console.log(`Messages count: ${msgSnap.size}`);
    const msgs = [];
    msgSnap.forEach(m => msgs.push({ id: m.id, ...m.data() }));
    msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
    msgs.forEach(m => {
      console.log(`  [${new Date(m.createdAt).toISOString()}] ${m.direction} | campaignId: ${m.campaignId} | messageSid: ${m.messageSid} | body: "${m.body}"`);
    });
  }
}

run().then(() => process.exit(0)).catch(console.error);
