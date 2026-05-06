/**
 * One-time setup script: writes SignalWire credentials into Firestore system/settings.
 * Run with: npx ts-node --skip-project scripts/setSignalWireCredentials.ts
 */
import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

if (!admin.apps.length) {
    admin.initializeApp({ projectId: 'pastoral-care-for-pco' });
}

const db = getFirestore(admin.app(), 'pcforpco');

const credentials = {
    signalwireProjectId: '169b4705-7fc4-42ff-8877-f9477c5853e4',
    signalwireApiToken:  'PT867737fa44061e75e93e1a8e5231f45d4b463e18625360ef',
    signalwireSpaceUrl:  'barnabassoftware.signalwire.com',
};

db.collection('system').doc('settings').set(credentials, { merge: true })
    .then(() => {
        console.log('✅ SignalWire credentials written to system/settings (pcforpco db)');
        console.log(`   Project ID : ${credentials.signalwireProjectId}`);
        console.log(`   Space URL  : ${credentials.signalwireSpaceUrl}`);
        console.log(`   API Token  : ${credentials.signalwireApiToken.slice(0, 10)}...`);
        console.log('');
        console.log('📌 Next: set smsWebhookBaseUrl in System Settings → SignalWire SMS panel');
        process.exit(0);
    })
    .catch(e => {
        console.error('❌ Failed:', e.message);
        process.exit(1);
    });
