import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import https from 'https';

function getDb() {
    if (!admin.apps.length) {
        admin.initializeApp({ projectId: 'pastoral-care-for-pco' });
    }
    return getFirestore(admin.app(), 'pcforpco');
}

async function check() {
  const db = getDb();
  
  // get signalwire creds
  const sysSnap = await db.doc('system/settings').get();
  const data = sysSnap.data() || {};
  const projectId = data.signalwireProjectId;
  const apiToken = data.signalwireApiToken;
  const spaceUrl = data.signalwireSpaceUrl?.replace(/^https?:\/\//i, '').replace(/\/+$/, '');

  const authHeader = 'Basic ' + Buffer.from(`${projectId}:${apiToken}`).toString('base64');

  const snap = await db.collection('smsNumbers').where('churchId', '==', 'ch_v0cjkh0z1').get();
  for (const doc of snap.docs) {
      const num = doc.data();
      console.log(`Number ${num.phoneNumber} has assignment status: ${num.campaignAssignmentStatus}, orderId: ${num.campaignAssignmentOrderId}`);
      
      if (num.campaignAssignmentOrderId && num.campaignId) {
          // let's fetch the order
          const url = `https://${spaceUrl}/api/relay/rest/registry/beta/campaigns/${num.campaignId}/orders/${num.campaignAssignmentOrderId}`;
          console.log(`Fetching ${url}`);
          
          await new Promise((resolve, reject) => {
              https.get(url, { headers: { 'Authorization': authHeader } }, (res) => {
                  let raw = '';
                  res.on('data', c => raw += c);
                  res.on('end', () => {
                      console.log(`Order response: ${res.statusCode} ${raw}`);
                      resolve();
                  });
              }).on('error', reject);
          });
      }
  }
}
check().catch(console.error);
