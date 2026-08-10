import { syncRecentGiving } from './services/sync/syncGiving';
import { getDb } from './backend/firebase';

async function run() {
    const db = getDb();
    const churchesSnap = await db.collection('churches').get();
    for (const doc of churchesSnap.docs) {
        const churchId = doc.id;
        console.log('Running giving sync for', churchId);
        await syncRecentGiving(churchId);
    }
    console.log('Done!');
}

run().catch(console.error);
