import { getDb } from './backend/firebase';

async function testEntityTypes() {
    const snap = await getDb().doc('system/settings').get();
    const settings = snap.data() || {};
    const projectId = settings.signalwireProjectId;
    const apiToken = settings.signalwireApiToken;
    const spaceUrl = settings.signalwireSpaceUrl;

    if (!projectId || !apiToken || !spaceUrl) {
        console.error("Missing creds");
        return;
    }

    const auth = Buffer.from(`${projectId}:${apiToken}`).toString('base64');
    
    // Testing Twilio-style vs standard TCR-style
    const typesToTest = [
        'PRIVATE_PROFIT', 'NONPROFIT', 'NON_PROFIT', 'non_profit', 'nonprofit', 
        'Private Profit', 'Non-Profit', 'Private', 'Public', 'Nonprofit', 'Private Company', 'Non-Profit Organization', 'Government', 'Sole Proprietor', 'Partnership', 'Corporation', 'LLC', 'Co-operative', 'private', 'public', 'government', 'sole_proprietor'
    ];

    for (const type of typesToTest) {
        const body = {
            company_name: "Test Corp",
            contact_email: "test@test.com",
            contact_phone: "+15555555555",
            ein_issuing_country: "United States",
            legal_entity_type: type,
            ein: "123456789",
            company_address: "123 Test St",
            company_website: "https://test.com"
        };

        const res = await fetch(`https://${spaceUrl}/api/relay/rest/registry/beta/brands`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${auth}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(body)
        });

        const data = await res.json();
        
        if (res.status === 422 && data.errors && data.errors[0].attribute === 'legal_entity_type') {
            // console.log(`Rejected '${type}': ${data.errors[0].message}`);
        } else {
            console.log(`\nFound one! SUCCESS or different error for '${type}':`, res.status, JSON.stringify(data));
        }
    }
    console.log("Done testing");
}

testEntityTypes().catch(console.error);
