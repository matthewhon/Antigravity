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
    const snap = await db.doc('system/settings').get();
    const pmToken = snap.data()?.postmarkApiKey;
    if (!pmToken) { console.error('No pmToken'); return; }

    console.log('Step 1: Listing all servers...');
    const listRes = await fetch(`${PM_API}/servers?count=500&offset=0`, {
        headers: pmAccountHeaders(pmToken),
    });

    if (!listRes.ok) {
        console.error('List failed:', listRes.status, await listRes.text());
        return;
    }

    const listData = await listRes.json();
    console.log(`Found ${listData.TotalCount} servers:`);
    for (const s of listData.Servers || []) {
        console.log(`  - "${s.Name}" (ID: ${s.ID})`);
    }

    // Try to find one matching pco_chv0cjkh0z1
    const match = (listData.Servers || []).find(
        (s: any) => s.Name.toLowerCase().startsWith('pco_')
    );

    if (match) {
        console.log(`\nStep 2: Fetching details for "${match.Name}" (ID: ${match.ID})...`);
        const detailRes = await fetch(`${PM_API}/servers/${match.ID}`, {
            headers: pmAccountHeaders(pmToken),
        });
        if (detailRes.ok) {
            const detail = await detailRes.json();
            const token = detail.ApiTokens?.[0];
            console.log('  Token found:', token ? `${String(token).substring(0, 10)}...` : 'NONE');
            console.log('  Token type:', typeof token);
        } else {
            console.error('  Detail fetch failed:', detailRes.status);
        }
    }
}
test();
