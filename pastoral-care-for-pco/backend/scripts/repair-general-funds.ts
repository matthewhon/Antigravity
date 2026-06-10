import { getDb } from '../firebase.js';

async function repair() {
    const db = getDb();
    
    // 1. Fetch all funds across all tenants
    console.log('Fetching funds cache...');
    const fundsSnap = await db.collection('funds').get();
    const fundMap = new Map<string, string>(); // fundId -> name
    fundsSnap.docs.forEach(doc => {
        const data = doc.data();
        if (data.id && data.name) {
            fundMap.set(data.id, data.name);
        }
    });
    console.log(`Loaded ${fundMap.size} funds.`);

    // 2. Query all detailed_donations where fundName is 'General'
    console.log('Querying donations with fundName "General"...');
    const donationsSnap = await db.collection('detailed_donations')
        .where('fundName', '==', 'General')
        .get();

    console.log(`Found ${donationsSnap.size} donations to evaluate.`);

    let updatedCount = 0;
    let skippedCount = 0;
    
    const batchSize = 400;
    let batch = db.batch();
    
    for (const donationDoc of donationsSnap.docs) {
        const donationData = donationDoc.data();
        const fundId = donationData.fundId;
        
        if (fundId && fundMap.has(fundId)) {
            const correctName = fundMap.get(fundId)!;
            console.log(`Donation ${donationDoc.id} (fundId: ${fundId}): 'General' -> '${correctName}'`);
            
            batch.update(donationDoc.ref, { fundName: correctName, lastUpdated: Date.now() });
            updatedCount++;
            
            if (updatedCount % batchSize === 0) {
                await batch.commit();
                batch = db.batch();
            }
        } else {
            console.log(`Donation ${donationDoc.id} has no matching fund in cache (fundId: ${fundId || 'none'}). Skipping.`);
            skippedCount++;
        }
    }
    
    if (updatedCount % batchSize !== 0 && updatedCount > 0) {
        await batch.commit();
    }
    
    console.log(`Repair completed successfully. Updated: ${updatedCount}, Skipped: ${skippedCount}`);
}

repair().catch(e => { console.error(e); process.exit(1); });
