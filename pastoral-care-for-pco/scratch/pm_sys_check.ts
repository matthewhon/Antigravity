import { getDb } from '../backend/firebase.js';

async function check() {
    const db = getDb();
    const settingsSnap = await db.doc('system/settings').get();
    console.log(JSON.stringify(settingsSnap.data(), null, 2));
}

check();
