import { getDb } from '../firebase';

async function forceActive() {
    console.log("Forcing +19723918600 to active status...");
    const db = getDb();
    
    // Find the number in smsNumbers
    const snap = await db.collection('smsNumbers').where('phoneNumber', '==', '+19723918600').get();
    
    if (snap.empty) {
        console.error("Number +19723918600 not found in smsNumbers collection.");
        return;
    }

    const batch = db.batch();
    snap.docs.forEach(doc => {
        batch.update(doc.ref, {
            campaignAssignmentStatus: 'active',
            campaignAssigned: true
        });
        console.log(`Prepared update for doc: ${doc.id}`);
    });

    await batch.commit();
    console.log("Successfully updated the number status to Active!");
    process.exit(0);
}

forceActive().catch(e => {
    console.error("Error:", e);
    process.exit(1);
});
