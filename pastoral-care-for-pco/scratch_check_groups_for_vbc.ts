import { getDb } from './backend/firebase.ts';
import { fetchFromPco } from './backend/publicApi.ts';

async function run() {
    const churchId = 'ch_v0cjkh0z1';
    
    try {
        console.log("=== CHECK-IN EVENTS ===");
        const eventsData = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/check-ins/v2/events?per_page=100');
        const events = eventsData.data || [];
        for (const ev of events) {
            console.log(`Event ID: ${ev.id}, Name: ${ev.attributes?.name}`);
        }

        console.log("\n=== GROUPS FOR VBC ===");
        const groupsData = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/groups/v2/groups?per_page=100');
        const groups = groupsData.data || [];
        for (const g of groups) {
            console.log(`Group ID: ${g.id}, Name: ${g.attributes?.name}, Members Count: ${g.attributes?.members_count}`);
        }

        // Fetch event times for the "Kids Bible Classes" (Event ID: 650610)
        console.log("\n=== TEST 1: event_periods?include=event_times ===");
        try {
            const res = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/check-ins/v2/events/650610/event_periods?include=event_times');
            console.log("Success! Included event times:", res.included?.filter((inc: any) => inc.type === 'EventTime').map((t: any) => ({
                id: t.id,
                starts_at: t.attributes?.starts_at
            })));
        } catch (e: any) {
            console.error("Test 1 failed:", e.message);
        }

        console.log("\n=== TEST 2: event_times?where[event_id]=650610 ===");
        try {
            const res = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/check-ins/v2/event_times?where[event_id]=650610');
            console.log("Success! Found event times:", res.data?.map((t: any) => ({
                id: t.id,
                starts_at: t.attributes?.starts_at
            })));
        } catch (e: any) {
            console.error("Test 2 failed:", e.message);
        }

        // No longer fetching check-ins directly in this test script

    } catch (e: any) {
        console.error("Error:", e.message);
    }
}
run();
