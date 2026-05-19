import fetch from 'node-fetch';

async function main() {
    console.log('Fetching from PCO Proxy...');
    try {
        const response = await fetch('https://pastoralcare.barnabassoftware.com/pco/proxy', {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'User-Agent': 'PastoralCareApp/1.0' 
            },
            body: JSON.stringify({ 
                churchId: 'ch_v0cjkh0z1', 
                url: 'https://api.planningcenteronline.com/people/v2/lists?per_page=10&order=name', 
                method: 'GET', 
                body: null 
            })
        });
        
        console.log('Status:', response.status);
        if (!response.ok) {
            console.log('Error:', await response.text());
        } else {
            const data = await response.json();
            console.log('Success! Lists count:', data.data?.length);
            console.log('First list ID:', data.data?.[0]?.id);
        }
    } catch (e) {
        console.error('Fetch failed:', e);
    }
}
main();