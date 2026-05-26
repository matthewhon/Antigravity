import { getDb } from './backend/firebase.ts';
import { fetchFromPco } from './backend/publicApi.ts';

async function run() {
    const db = getDb();
    const snap = await db.collection('churches').get();
    
    for (const doc of snap.docs) {
        const churchId = doc.id;
        const data = doc.data();
        if (!data.pcoConnected || !data.pcoAccessToken) {
            continue;
        }
        
        console.log(`\n=== Checking PCO for Church: ${data.name} (${churchId}) ===`);
        
        // 1. Try to fetch events from check-ins API
        try {
            console.log(`Fetching events...`);
            const eventsData = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/check-ins/v2/events?per_page=100');
            const events = eventsData.data || [];
            console.log(`Found ${events.length} events:`);
            events.forEach((ev: any) => {
                console.log(`  - Event ID: ${ev.id}, Name: ${ev.attributes?.name}`);
            });
        } catch (e: any) {
            console.error(`  Error fetching events:`, e.message);
        }

        // 2. Try to fetch recent check-ins from check-ins API
        try {
            console.log(`Fetching recent check-ins...`);
            const checkInsData = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/check-ins/v2/check_ins?per_page=5&include=event,person');
            const checkins = checkInsData.data || [];
            console.log(`Found ${checkins.length} recent check-ins. Sample included:`);
            if (checkInsData.included) {
                console.log(`  Included types:`, Array.from(new Set(checkInsData.included.map((inc: any) => inc.type))));
            }
        } catch (e: any) {
            console.error(`  Error fetching check-ins:`, e.message);
        }
    }
}
run();
