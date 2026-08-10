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
  const wfId = 'nOs2WSP7ABclJwQpVqnI';

  console.log(`=== Inspecting Workflow ${wfId} ===`);
  const wfDoc = await db.collection('smsWorkflows').doc(wfId).get();
  const wf = wfDoc.data();
  console.log(`Workflow Name: "${wf.name}"`);
  console.log(`Total Steps in Workflow: ${wf.steps?.length}`);
  
  if (wf.steps) {
    wf.steps.forEach((s, idx) => {
      console.log(`\nStep index ${idx} (User Step ${idx + 1}):`);
      console.log(`  channelType: ${s.channelType}`);
      console.log(`  staffTargetType: ${s.staffTargetType}`);
      console.log(`  staffListId: ${s.staffListId}`);
      console.log(`  staffRecipients:`, JSON.stringify(s.staffRecipients));
      console.log(`  message snippet: "${(s.message || '').slice(0, 100)}..."`);
    });
  }

  console.log(`\n=== All Enrollments for Workflow ${wfId} ===`);
  const enrSnap = await db.collection('smsWorkflowEnrollments').where('workflowId', '==', wfId).get();
  console.log(`Found ${enrSnap.size} total enrollments:`);
  
  const step5Counts = {};

  enrSnap.forEach(doc => {
    const d = doc.data();
    console.log(`Enrollment ID: ${doc.id}`);
    console.log(`  personName: ${d.personName} (${d.personId}) | phone: ${d.phoneNumber}`);
    console.log(`  currentStep: ${d.currentStep} | completed: ${d.completed} | lastStepSentAt: ${d.lastStepSentAt ? new Date(d.lastStepSentAt).toISOString() : null}`);
  });
}

run().then(() => process.exit(0)).catch(console.error);
