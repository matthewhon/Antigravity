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
  console.log(`=== Searching for Matthew Hon / 4693440785 / Visitor Followup in ${churchId} ===`);

  const wfSnap = await db.collection('smsWorkflows').where('churchId', '==', churchId).get();
  console.log(`\n--- Workflows ---`);
  wfSnap.forEach(doc => {
    const d = doc.data();
    console.log(`Workflow ID: ${doc.id} | Name: "${d.name}" | Trigger: ${d.trigger}`);
    if (d.steps) {
      d.steps.forEach((s, idx) => {
        console.log(`  Step ${idx + 1} (0-indexed ${idx}): channelType=${s.channelType}, message="${s.message || s.emailSubject || ''}"`);
        if (s.staffRecipients) console.log(`    staffRecipients:`, JSON.stringify(s.staffRecipients));
        if (s.staffTargetType) console.log(`    staffTargetType: ${s.staffTargetType}, staffListId: ${s.staffListId}, staffGroupId: ${s.staffGroupId}`);
      });
    }
  });

  console.log(`\n--- Enrollments ---`);
  const enrSnap = await db.collection('smsWorkflowEnrollments').where('churchId', '==', churchId).get();
  enrSnap.forEach(doc => {
    const d = doc.data();
    console.log(`Enrollment ID: ${doc.id}`);
    console.log(`  workflowId: ${d.workflowId}, personName: ${d.personName}, phone: ${d.phoneNumber}, currentStep: ${d.currentStep}, completed: ${d.completed}`);
  });

  console.log(`\n--- Searching Conversations for Matthew Hon (+14693440785) ---`);
  const convSnap = await db.collection('smsConversations').where('churchId', '==', churchId).get();
  for (const doc of convSnap.docs) {
    const d = doc.data();
    if (d.phoneNumber === '+14693440785' || (d.personName && d.personName.toLowerCase().includes('matthew'))) {
      console.log(`\nMATCH CONVERSATION: ${doc.id}`);
      console.log(JSON.stringify(d, null, 2));
      const msgSnap = await doc.ref.collection('messages').get();
      const msgs = [];
      msgSnap.forEach(m => msgs.push({ id: m.id, ...m.data() }));
      msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
      msgs.forEach(m => {
        console.log(`  [${new Date(m.createdAt).toISOString()}] direction: ${m.direction} | campaignId: ${m.campaignId} | messageSid: ${m.messageSid}`);
        console.log(`    body: "${m.body}"`);
      });
    }
  }
}

run().then(() => process.exit(0)).catch(console.error);
