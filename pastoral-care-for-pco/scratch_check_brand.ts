import { callRegistryApiPaginated, callRegistryApi } from './backend/signalwireClient.ts';

async function checkBrand() {
    const brandId = '52bdd0bb-73a5-4cb9-b612-c9d325f62f4b';

    const data = await callRegistryApi(`/brands/${brandId}`, 'GET');
    console.log(JSON.stringify(data, null, 2));
}

checkBrand().catch(console.error);
