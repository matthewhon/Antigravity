import { getDb } from '../backend/firebase.js';

const PM_API = 'https://api.postmarkapp.com';

function pmAccountHeaders(accountToken: string) {
    return {
        'X-Postmark-Account-Token': accountToken,
        'Content-Type': 'application/json',
        Accept: 'application/json',
    };
}

async function test() {
    const db = getDb();
    
    // 1. Get the church's current email settings
    const churchId = 'chv0cjkh0z1';
    const churchSnap = await db.collection('churches').doc(churchId).get();
    const churchData = churchSnap.data() || {};
    const tenantEmail = churchData.emailSettings || {};
    
    console.log('Church emailSettings:', JSON.stringify(tenantEmail, null, 2));
    console.log('postmarkServerToken:', tenantEmail.postmarkServerToken || 'NOT SET');

    // 2. Get system settings
    const settingsSnap = await db.doc('system/settings').get();
    const settings = settingsSnap.data() || {};
    console.log('\nemailProvider:', settings.emailProvider);
    console.log('postmarkApiKey:', settings.postmarkApiKey ? settings.postmarkApiKey.substring(0, 10) + '...' : 'NOT SET');

    // 3. If no server token, simulate the findOrCreateServer flow
    if (!tenantEmail.postmarkServerToken) {
        console.log('\n--- No server token in church doc. Testing findOrCreateServer...');
        const pmToken = settings.postmarkApiKey;
        const serverName = `pco_${churchId.replace(/[^a-z0-9]/gi, '').substring(0, 20).toLowerCase()}`;
        
        console.log(`Looking for server named "${serverName}"...`);
        
        const listRes = await fetch(`${PM_API}/servers?count=500&offset=0`, {
            headers: pmAccountHeaders(pmToken),
        });
        
        if (listRes.ok) {
            const listData = await listRes.json();
            const match = (listData.Servers || []).find(
                (s: any) => s.Name.toLowerCase() === serverName.toLowerCase()
            );
            
            if (match) {
                console.log(`Found match! ID: ${match.ID}`);
                
                const detailRes = await fetch(`${PM_API}/servers/${match.ID}`, {
                    headers: pmAccountHeaders(pmToken),
                });
                if (detailRes.ok) {
                    const detail = await detailRes.json();
                    const token = detail.ApiTokens?.[0] || '';
                    console.log(`Server token: ${String(token).substring(0, 10)}...`);
                    console.log('\n✅ findOrCreateServer would succeed!');
                }
            } else {
                console.log('No match found — would create a new server');
            }
        }
    } else {
        console.log('\n✅ Church already has a postmarkServerToken');
    }
}
test();
