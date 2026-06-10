import { getDb } from '../backend/firebase.js';

const db = getDb();

async function run() {
    const docRef = db.collection('churches').doc('ch_v0cjkh0z1');
    const doc = await docRef.get();
    if (!doc.exists) {
        console.error('Church ch_v0cjkh0z1 not found');
        return;
    }
    const data = doc.data();
    const existing = data?.emailSettings || {};
    
    const updatedSettings = {
        ...existing,
        mode: 'custom',
        customDomain: 'vbcrowlett.com',
        postmarkDomainId: 6762783,
        fromEmail: 'vbcnewletter@vbcrowlett.com',
        fromName: 'Victory Baptist Church of Rowlett',
        domainVerified: false,
        additionalSenders: [
            { email: 'prayer@vbcrowlett.com', name: 'Prayer' },
            { email: 'churchnews@vbcrowlett.com', name: 'churchnews' }
        ]
    };

    await docRef.update({
        emailSettings: updatedSettings
    });
    console.log('Restored email settings successfully:', updatedSettings);
}

run().catch(console.error);
