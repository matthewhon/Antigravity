import { getDb } from '../backend/firebase.js';

async function test() {
    const db = getDb();
    const snap = await db.doc('system/settings').get();
    const pmToken = snap.data()?.postmarkApiKey;
    
    if (!pmToken) { console.error('No pmToken'); return; }

    const res = await fetch(`https://api.postmarkapp.com/servers?count=100&offset=0&name=pco_c1`, {
        headers: {
            'X-Postmark-Account-Token': pmToken,
            'Accept': 'application/json'
        }
    });

    console.log(res.status, await res.text());
}
test();
