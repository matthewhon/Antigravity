import { getDb } from '../backend/firebase.js';

const PM_API = 'https://api.postmarkapp.com';

async function testStats() {
    const db = getDb();
    const settingsSnap = await db.doc('system/settings').get();
    const settings = settingsSnap.data() || {};
    const pmToken = settings.postmarkApiKey;

    const listRes = await fetch(`${PM_API}/servers?count=1&offset=0`, {
        headers: { 'X-Postmark-Account-Token': pmToken, Accept: 'application/json' },
    });
    const listData = await listRes.json();
    const firstServer = listData.Servers?.[0];
    
    const detailRes = await fetch(`${PM_API}/servers/${firstServer.ID}`, {
        headers: { 'X-Postmark-Account-Token': pmToken, Accept: 'application/json' },
    });
    const detail = await detailRes.json();
    const serverToken = detail.ApiTokens?.[0];

    // tag query
    const url = new URL(`${PM_API}/stats/outbound`);
    url.searchParams.set('tag', 'does-not-exist');
    
    const res = await fetch(url.toString(), {
        headers: { 'X-Postmark-Server-Token': serverToken, Accept: 'application/json' }
    });

    console.log("Tag Stats:", JSON.stringify(await res.json(), null, 2));
}

testStats();
