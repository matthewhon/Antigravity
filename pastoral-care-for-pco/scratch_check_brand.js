import { getSystemSettings } from './backend/smsProvisioning.js';
import fetch from 'node-fetch';

async function checkBrand() {
    const settings = await getSystemSettings();
    const projectId = settings.signalwireProjectId;
    const apiToken = settings.signalwireApiToken;
    const spaceUrl = settings.signalwireSpaceUrl;

    if (!projectId || !apiToken || !spaceUrl) {
        console.error("Missing creds");
        process.exit(1);
    }

    const auth = Buffer.from(`${projectId}:${apiToken}`).toString('base64');
    const brandId = '52bdd0bb-73a5-4cb9-b612-c9d325f62f4b';

    const res = await fetch(`https://${spaceUrl}/api/relay/rest/registry/beta/brands/${brandId}`, {
        method: 'GET',
        headers: {
            'Authorization': `Basic ${auth}`,
            'Accept': 'application/json'
        }
    });

    const data = await res.json();
    console.log(`Status code: ${res.status}`);
    console.log(JSON.stringify(data, null, 2));
}

checkBrand().catch(console.error);
