import { callRegistryApi } from './backend/signalwireClient.js';

export async function testSignalWireEntity(req: any, res: any) {
    const typesToTest = [
        'PRIVATE_PROFIT', 'NONPROFIT', 'NON_PROFIT', 'Private Profit', 'Non-Profit', 'Private', 'Public', 'Nonprofit', 'Private Company', 'Non-Profit Organization', 'PRIVATE', 'PUBLIC'
    ];
    
    let results: Record<string, string> = {};

    for (const type of typesToTest) {
        try {
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

            await callRegistryApi('/brands', 'POST', body);
            results[type] = "SUCCESS";
            break; 
        } catch (e: any) {
            results[type] = e.message;
        }
    }
    
    res.json(results);
}
