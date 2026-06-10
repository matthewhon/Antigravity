import { getDb } from '../backend/firebase.js';

const PM_API = 'https://api.postmarkapp.com';

async function checkDomains() {
    const db = getDb();
    const settingsSnap = await db.doc('system/settings').get();
    const settings = settingsSnap.data() || {};
    const pmToken = settings.postmarkApiKey;

    const domainsRes = await fetch(`${PM_API}/domains?count=100&offset=0`, {
        headers: { 'X-Postmark-Account-Token': pmToken, Accept: 'application/json' },
    });
    console.log("Domains:", JSON.stringify(await domainsRes.json(), null, 2));
}

checkDomains();
