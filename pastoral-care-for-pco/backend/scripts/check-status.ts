import { getDb } from '../firebase';

async function main() {
    const db = getDb();
    const snap = await db.collection('smsNumbers').where('phoneNumber', '==', '+19723918600').get();
    if (snap.empty) {
        console.log("Not found with +1, trying without...");
        const snap2 = await db.collection('smsNumbers').where('phoneNumber', '==', '9723918600').get();
        if (snap2.empty) {
            console.log("Not found at all.");
            return;
        }
        snap2.forEach(doc => console.log(doc.id, doc.data()));
    } else {
        snap.forEach(doc => console.log(doc.id, doc.data()));
    }
}

main().catch(console.error);
