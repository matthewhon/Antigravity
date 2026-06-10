import { getDb } from '../backend/firebase.js';

const PM_API = 'https://api.postmarkapp.com';

async function testStreams() {
    const db = getDb();
    const settingsSnap = await db.doc('system/settings').get();
    const settings = settingsSnap.data() || {};
    const pmToken = settings.postmarkApiKey;

    // Get the first server's token
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

    const streamsRes = await fetch(`${PM_API}/message-streams/broadcast`, {
        method: 'PATCH',
        headers: { 'X-Postmark-Server-Token': serverToken, 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
            SubscriptionManagementConfiguration: {
                UnsubscribeHandlingType: "Custom"
            }
        })
    });

    console.log("Update Stream response:", JSON.stringify(await streamsRes.json(), null, 2));
}

testStreams();
