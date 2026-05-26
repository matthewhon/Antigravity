import { getDb } from './backend/firebase.ts';
import { fetchFromPco } from './backend/publicApi.ts';

async function run() {
    const churchId = 'ch_v0cjkh0z1';
    
    try {
        console.log("=== RECENT CHECK-INS FROM PCO ===");
        const res = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/check-ins/v2/check_ins?per_page=100&include=event,person,event_time&order=-created_at');
        const checkIns = res.data || [];
        const included = res.included || [];

        console.log(`Loaded ${checkIns.length} check-ins.`);
        if (checkIns.length === 0) return;

        console.log("\nSample check-in data:");
        console.log(JSON.stringify(checkIns[0], null, 2));

        // Group check-ins by event name
        const byEvent: Record<string, any[]> = {};
        for (const ci of checkIns) {
            const eventId = ci.relationships?.event?.data?.id;
            const eventObj = included.find((inc: any) => inc.type === 'Event' && inc.id === eventId);
            const eventName = eventObj?.attributes?.name || 'Unknown Event';
            
            const personId = ci.relationships?.person?.data?.id;
            const personObj = included.find((inc: any) => inc.type === 'Person' && inc.id === personId);
            const personName = personObj?.attributes?.name || 'Unknown Person';

            if (!byEvent[eventName]) byEvent[eventName] = [];
            byEvent[eventName].push({
                id: ci.id,
                date: ci.attributes?.created_at,
                personId,
                personName
            });
        }

        console.log("\nCheck-ins by event type:");
        Object.entries(byEvent).forEach(([name, list]) => {
            console.log(`- ${name}: ${list.length} check-ins. E.g. ${list.slice(0, 3).map(p => p.personName).join(', ')}`);
        });

    } catch (e: any) {
        console.error("Error:", e.message);
    }
}
run();
