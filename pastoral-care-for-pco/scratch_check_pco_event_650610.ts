import { getDb } from './backend/firebase.ts';
import { fetchFromPco } from './backend/publicApi.ts';

async function run() {
    const churchId = 'ch_v0cjkh0z1';
    
    try {
        console.log("=== FETCHING EVENT 650610 ===");
        const ev = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/check-ins/v2/events/650610');
        console.log(JSON.stringify(ev, null, 2));
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}
run();
