import { getDb } from './backend/firebase.ts';
import { fetchFromPco } from './backend/publicApi.ts';

async function run() {
    const churchId = 'ch_v0cjkh0z1';
    
    try {
        const events = ['647532', '859000'];
        for (const id of events) {
            console.log(`\n=== FETCHING EVENT ${id} ===`);
            const ev = await fetchFromPco(churchId, `https://api.planningcenteronline.com/check-ins/v2/events/${id}`);
            console.log(`Name: ${ev.data.attributes?.name}`);
            console.log(`Archived At: ${ev.data.attributes?.archived_at}`);
            
            // Fetch event periods or times
            const periodsUrl = ev.data.relationships?.event_periods?.links?.related || `https://api.planningcenteronline.com/check-ins/v2/events/${id}/event_periods`;
            const periods = await fetchFromPco(churchId, periodsUrl);
            console.log(`Found ${periods.data?.length || 0} event periods.`);
            
            // Let's fetch check-ins for this event
            const cis = await fetchFromPco(churchId, `https://api.planningcenteronline.com/check-ins/v2/check_ins?where[event_id]=${id}&per_page=5&include=person`);
            console.log(`Recent check-ins count: ${cis.data?.length || 0}`);
            if (cis.data && cis.data.length > 0) {
                console.log(`Latest check-in date: ${cis.data[0].attributes?.created_at}`);
                console.log("Check-in people sample:", cis.data.map((c: any) => {
                    const pId = c.relationships?.person?.data?.id;
                    const p = cis.included?.find((inc: any) => inc.type === 'Person' && inc.id === pId);
                    return p?.attributes?.name || pId;
                }));
            }
        }
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}
run();
