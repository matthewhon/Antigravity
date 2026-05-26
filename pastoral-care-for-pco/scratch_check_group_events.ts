import { getDb } from './backend/firebase.ts';
import { fetchFromPco } from './backend/publicApi.ts';

async function run() {
    const churchId = 'ch_v0cjkh0z1';
    
    try {
        console.log("=== FETCHING VBC GROUPS WITH MEMBERS ===");
        const groupsRes = await fetchFromPco(churchId, 'https://api.planningcenteronline.com/groups/v2/groups?per_page=100');
        const groups = groupsRes.data || [];
        
        for (const g of groups) {
            console.log(`\nGroup: ${g.attributes?.name} (ID: ${g.id})`);
            
            // Fetch members
            const membersRes = await fetchFromPco(churchId, `https://api.planningcenteronline.com/groups/v2/groups/${g.id}/memberships?per_page=100&include=person`);
            const members = membersRes.data || [];
            const includedPeople = membersRes.included || [];
            console.log(`- Members count: ${members.length}`);
            const memberNames = members.map((m: any) => {
                const pid = m.relationships?.person?.data?.id;
                const p = includedPeople.find((inc: any) => inc.type === 'Person' && inc.id === pid);
                return `${p?.attributes?.name || pid} (${m.attributes?.role})`;
            });
            console.log(`- Members:`, memberNames.join(', '));

            // Fetch recent events
            const eventsRes = await fetchFromPco(churchId, `https://api.planningcenteronline.com/groups/v2/groups/${g.id}/events?per_page=10&order=-starts_at`);
            const events = eventsRes.data || [];
            console.log(`- Recent events: ${events.length}`);
            for (const ev of events) {
                const eventId = ev.id;
                const startsAt = ev.attributes?.starts_at;
                console.log(`  * Event: ${ev.attributes?.name || 'Class'} on ${startsAt} (ID: ${eventId})`);
                
                // Fetch attendance for this event
                try {
                    const attRes = await fetchFromPco(churchId, `https://api.planningcenteronline.com/groups/v2/groups/${g.id}/events/${eventId}/attendances?per_page=100`);
                    const attendances = attRes.data || [];
                    const attendedPeople = attendances.filter((a: any) => a.attributes?.attended === true).map((a: any) => {
                        const pid = a.relationships?.person?.data?.id;
                        return pid;
                    });
                    const absentPeople = attendances.filter((a: any) => a.attributes?.attended === false).map((a: any) => {
                        const pid = a.relationships?.person?.data?.id;
                        return pid;
                    });
                    console.log(`    - Attended count: ${attendedPeople.length}, Absent count: ${absentPeople.length}`);
                } catch (e: any) {
                    console.log(`    - Error fetching attendance: ${e.message}`);
                }
            }
        }
    } catch (e: any) {
        console.error("Error:", e.message);
    }
}
run();
