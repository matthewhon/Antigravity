import { getDb } from './backend/firebase.ts';

async function run() {
    try {
        const db = getDb();
        const snap = await db.collection('churches').get();
        snap.forEach(doc => {
            const data = doc.data();
            console.log(`ChurchId: ${doc.id}`);
            console.log(`- Name: ${data.name}`);
            console.log(`- pcoConnected: ${data.pcoConnected}`);
            console.log(`- executiveAiAgentEnabled: ${data.executiveAiAgentEnabled}`);
            console.log(`- executiveAiListId: ${data.executiveAiListId}`);
            console.log(`- executiveAiKeyword: ${data.executiveAiKeyword}`);
        });
    } catch (e) {
        console.error("Error:", e);
    }
}
run();
