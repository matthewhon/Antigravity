const apiKey = '4eb0bb69-0324-4478-b60f-0c2458e46f7d';
const domainId = '6762783';

async function run() {
    const res = await fetch(`https://api.postmarkapp.com/domains/${domainId}`, {
        headers: {
            'X-Postmark-Account-Token': apiKey,
            'Accept': 'application/json'
        }
    });
    console.log('Status:', res.status);
    const json = await res.json();
    console.log(JSON.stringify(json, null, 2));
}

run().catch(console.error);
