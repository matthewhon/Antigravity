import { getSystemSettings } from './backend/smsProvisioning.js';
import fetch from 'node-fetch';

async function testEntityTypes() {
    const settings = await getSystemSettings();
    const projectId = settings.signalwireProjectId;
    const apiToken = settings.signalwireApiToken;
    const spaceUrl = settings.signalwireSpaceUrl;

    if (!projectId || !apiToken || !spaceUrl) {
        console.error("Missing creds");
        process.exit(1);
    }

    const auth = Buffer.from(`${projectId}:${apiToken}`).toString('base64');

    const typesToTest = [
        'PRIVATE_PROFIT', 'NONPROFIT', 'NON_PROFIT', 'Private Profit', 'Non-Profit', 'Private', 'Public', 'Nonprofit', 'Private Company', 'Non-Profit Organization'
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
        console.log(`\nTesting type: '${type}'`);
        console.log(`Status: ${res.status}`);
        
        if (res.status === 422 && data.errors && data.errors[0].attribute === 'legal_entity_type') {
            console.log(`Rejected: ${data.errors[0].message}`);
        } else {
            console.log(`SUCCESS or different error:`, JSON.stringify(data));
            break; // Found the right one (or at least it passed legal_entity_type validation)
        }
    }
}

testEntityTypes().catch(console.error);
