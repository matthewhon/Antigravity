import { getDb } from './backend/firebase.js';
import { runBirthdayAnniversaryScanner } from './backend/smsCampaignScheduler.js';

async function main() {
    console.log('Initializing DB...');
    const db = getDb();
    
    console.log('Looking for workflow...');
    const wfSnap = await db.collection('smsWorkflows').where('name', '==', 'Birthday Staff 2').get();
    if (wfSnap.empty) {
        console.log('Workflow not found');
        return;
    }
    const wf = wfSnap.docs[0];
    const wfId = wf.id;
    console.log('Workflow ID:', wfId, 'Active:', wf.data().isActive);
    
    console.log('Looking for enrollments...');
    const enrollSnap = await db.collection('smsWorkflowEnrollments').where('workflowId', '==', wfId).get();
    console.log('Total enrollments:', enrollSnap.size);
    enrollSnap.forEach(d => {
        const data = d.data();
        console.log(`- ID: ${d.id}, phone: ${data.phoneNumber}, completed: ${data.completed}, nextSend: ${new Date(data.nextSendAt).toLocaleString()}`);
    });
    
    console.log('Running scanner manually...');
    await runBirthdayAnniversaryScanner(db);
    console.log('Done scanning.');
}

main().catch(console.error);
