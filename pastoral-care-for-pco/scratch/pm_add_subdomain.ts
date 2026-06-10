import { getDb } from '../backend/firebase.js';

const PM_API = 'https://api.postmarkapp.com';

async function addSubdomain() {
    const db = getDb();
    const settingsSnap = await db.doc('system/settings').get();
    const settings = settingsSnap.data() || {};
    const pmToken = settings.postmarkApiKey;

    const res = await fetch(`${PM_API}/domains`, {
        method: 'POST',
        headers: { 'X-Postmark-Account-Token': pmToken, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ Name: 'pastoralcare.barnabassoftware.com' })
    });
    console.log("Add Domain:", JSON.stringify(await res.json(), null, 2));
}

addSubdomain();
