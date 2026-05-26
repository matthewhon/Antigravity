import { getDb } from './backend/firebase.ts';

async function run() {
    const churchId = 'ch_v0cjkh0z1';
    const db = getDb();
    
    try {
        console.log("=== VBC ATTENDANCE (In-Memory Filter) ===");
        const snap = await db.collection('attendance')
            .where('churchId', '==', churchId)
            .get();
            
        console.log(`Found ${snap.size} total documents. Filtering...`);
        const filtered = snap.docs.filter(doc => {
            const date = doc.data().date;
            return date >= '2026-05-10' && date <= '2026-05-17';
        });

        console.log(`Found ${filtered.length} matching documents in date range:`);
        filtered.forEach(doc => {
            console.log(`\nDocument ID: ${doc.id}`);
            console.log(JSON.stringify(doc.data(), null, 2));
        });
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}
run();
