import { getDb } from './backend/firebase.js';
import { fetchFromPco } from './backend/publicApi.js';

async function main() {
    try {
        const churchId = 'ch_v0cjkh0z1';
        const listId = '4942298';
        console.log(`Fetching people from PCO List ${listId} for church ${churchId}...`);
        
        const listUrl = `https://api.planningcenteronline.com/people/v2/lists/${listId}/people?per_page=100&include=phone_numbers`;
        const listData = await fetchFromPco(churchId, listUrl);
        
        const people = listData?.data || [];
        const included = listData?.included || [];
        
        console.log(`Found ${people.length} people:`);
        for (const person of people) {
            const name = person.attributes?.name || person.id;
            const phoneIds = person.relationships?.phone_numbers?.data?.map((p) => p.id) || [];
            const phones = included
                .filter((inc) => inc.type === 'PhoneNumber' && phoneIds.includes(inc.id))
                .map((inc) => inc.attributes?.number)
                .filter(Boolean);
            console.log(`- ${name} (ID: ${person.id}): Phone numbers: ${phones.join(', ')}`);
        }
    } catch (e) {
        console.error("Error fetching list people:", e);
    }
    process.exit(0);
}

main();
