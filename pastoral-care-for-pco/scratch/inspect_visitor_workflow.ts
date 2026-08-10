import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

admin.initializeApp({
  projectId: 'pastoral-care-for-pco'
});

const db = getFirestore(admin.app(), 'pcforpco');

async function inspectWorkflow() {
  const churchId = 'ch_v0cjkh0z1';
  console.log(`=== Fetching Workflows for ${churchId} ===`);
  const wfSnap = await db.collection('smsWorkflows')
    .where('churchId', '==', churchId)
    .get();

  console.log(`Found ${wfSnap.size} workflows:`);
  let targetWfId = '';
  wfSnap.forEach(doc => {
    const data = doc.data();
    console.log(`ID: ${doc.id} | Name: "${data.name}"`);
    if (data.name?.toLowerCase().includes('visitor') || data.name?.toLowerCase().includes('followup') || data.name?.toLowerCase().includes('new')) {
      targetWfId = doc.id;
      console.log("Workflow Details:", JSON.stringify(data, null, 2));
    }
  });

  if (!targetWfId) {
    console.log("Listing all workflows in details:");
    wfSnap.forEach(doc => {
      console.log(`Workflow ${doc.id}:`, JSON.stringify(doc.data(), null, 2));
    });
  } else {
    console.log(`\n=== Fetching Enrollments for Workflow ${targetWfId} ===`);
    const enrSnap = await db.collection('smsWorkflowEnrollments')
      .where('workflowId', '==', targetWfId)
      .get();
      
    console.log(`Found ${enrSnap.size} enrollments:`);
    enrSnap.forEach(doc => {
      console.log(`Enrollment ID: ${doc.id}`);
      console.log(JSON.stringify(doc.data(), null, 2));
    });
  }
}

inspectWorkflow().then(() => process.exit(0)).catch(console.error);
