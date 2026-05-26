import { getDb } from './backend/firebase.ts';
import { fetchFromPco } from './backend/publicApi.ts';

async function run() {
    const churchId = 'ch_v0cjkh0z1';
    const since = new Date();
    since.setDate(since.getDate() - 180); // Let's check last 180 days to be sure
    const sinceStr = since.toISOString();

    try {
        console.log("=== FETCHING ALL EVENT TIMES ===");
        const url = `https://api.planningcenteronline.com/check-ins/v2/event_times?where[created_at][gte]=${sinceStr}&include=event&per_page=100`;
        const res = await fetchFromPco(churchId, url);
        const eventTimes = res.data || [];
        const included = res.included || [];

        console.log(`Found ${eventTimes.length} event times.`);
        
        const kidsTimes = [];
        for (const et of eventTimes) {
            const eventId = et.relationships?.event?.data?.id;
            const eventObj = included.find((inc: any) => inc.type === 'Event' && inc.id === eventId);
            const eventName = eventObj?.attributes?.name || 'Unknown';
            const startsAt = et.attributes?.starts_at;
            
            console.log(`EventTime ID: ${et.id} | Event Name: ${eventName} (Event ID: ${eventId}) | Starts At: ${startsAt}`);
            
            if (eventName.toLowerCase().includes('kids')) {
                kidsTimes.push({
                    eventTimeId: et.id,
                    eventName,
                    eventId,
                    startsAt
                });
            }
        }

        console.log("\n=== KIDS BIBLE CLASSES TIMES ===");
        console.log(kidsTimes);

        // Fetch check-ins for each kids time
        for (const kt of kidsTimes.slice(0, 3)) {
            console.log(`\nFetching check-ins for ${kt.eventName} starting at ${kt.startsAt} (EventTime ID: ${kt.eventTimeId})...`);
            const ciRes = await fetchFromPco(churchId, `https://api.planningcenteronline.com/check-ins/v2/check_ins?where[event_time_id]=${kt.eventTimeId}&include=person`);
            console.log(`Count: ${ciRes.data?.length || 0}`);
            const people = (ciRes.data || []).map((ci: any) => {
                const pid = ci.relationships?.person?.data?.id;
                const pObj = ciRes.included?.find((inc: any) => inc.type === 'Person' && inc.id === pid);
                return pObj?.attributes?.name || pid;
            });
            console.log("People:", people);
        }

    } catch (e: any) {
        console.error("Error:", e.message);
    }
}
run();
