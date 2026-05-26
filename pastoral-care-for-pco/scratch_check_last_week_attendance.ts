import { getDb } from './backend/firebase.ts';

async function run() {
    const churchId = 'ch_v0cjkh0z1';
    const db = getDb();
    
    try {
        console.log("=== VBC ATTENDANCE BETWEEN MAY 10 AND MAY 17, 2026 ===");
        const snap = await db.collection('attendance')
            .where('churchId', '==', churchId)
            .where('date', '>=', '2026-05-10')
            .where('date', '<=', '2026-05-17')
            .get();
            
        console.log(`Found ${snap.size} documents.`);
        snap.forEach(doc => {
            console.log(`\nDocument ID: ${doc.id}`);
            console.log(JSON.stringify(doc.data(), null, 2));
        });
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}
run();
