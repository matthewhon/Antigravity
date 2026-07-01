import { getDb } from './backend/firebase';
import fetch from 'node-fetch';

async function main() {
    const db = getDb();
    const sysSnap = await db.collection('system').doc('settings').get();
    const settings = sysSnap.data() || {};

    const { signalwireProjectId, signalwireApiToken, signalwireSpaceUrl } = settings as any;
    console.log('Project ID:', signalwireProjectId);
    console.log('Space URL:', signalwireSpaceUrl);
    console.log('API Token:', signalwireApiToken ? '***' + signalwireApiToken.slice(-4) : 'none');

    if (!signalwireProjectId || !signalwireApiToken || !signalwireSpaceUrl) {
        console.log('Missing SignalWire settings in Firestore.');
        return;
    }

    const yearMonth = '2026-06';
    const [year, month] = yearMonth.split('-');
    const startDate = `${year}-${month}-01`;
    const endDate = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

    const authHeader = 'Basic ' + Buffer.from(`${signalwireProjectId}:${signalwireApiToken}`).toString('base64');
    const url = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Usage/Records.json?StartDate=${startDate}&EndDate=${endDate}`;
    
    console.log('Fetching:', url);

    const res = await fetch(url, {
        headers: { 'Authorization': authHeader }
    });

    console.log('Status:', res.status, res.statusText);
    const text = await res.text();
    console.log('Response:', text.substring(0, 1000));
}

main().catch(console.error);
