import { getDb } from './backend/firebase.js';

async function main() {
    console.log('Initializing DB...');
    const db = getDb();
    const now = Date.now();
    console.log('Fetching logs...');
    try {
        const snap = await db.collection('logs')
            .where('timestamp', '>=', now - 60 * 60 * 1000)
            .orderBy('timestamp', 'desc')
            .limit(30)
            .get();
            
        console.log('Logs found:', snap.size);
        snap.forEach(doc => {
            const d = doc.data();
            console.log(`[${new Date(d.timestamp).toISOString()}] ${d.level || 'INFO'}: ${d.message}`);
            if (d.metadata) console.dir(d.metadata, { depth: null });
        });
    } catch (e) {
        console.error('Failed to query logs collection:', e.message);
        
        // Try system_logs if 'logs' doesn't exist
        const snap2 = await db.collection('system_logs')
            .orderBy('timestamp', 'desc')
            .limit(20)
            .get();
        console.log('System Logs found:', snap2.size);
        snap2.forEach(doc => {
            const d = doc.data();
            console.log(`[${new Date(d.timestamp).toISOString()}] ${d.level || 'INFO'}: ${d.message}`);
        });
    }
}
main().catch(console.error);
