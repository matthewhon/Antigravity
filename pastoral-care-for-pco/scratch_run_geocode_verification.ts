import { geocodePeopleAddresses } from './services/pcoSyncService';

async function main() {
    const churchId = 'ch_v0cjkh0z1';
    console.log(`Starting geocoding run for churchId: ${churchId} with force=true...`);
    try {
        await geocodePeopleAddresses(churchId, true);
        console.log('Geocoding run finished!');
    } catch (e) {
        console.error('Error during geocoding run:', e);
    }
    process.exit(0);
}

main();
