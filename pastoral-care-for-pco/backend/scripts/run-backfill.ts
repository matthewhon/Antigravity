import { getDb } from '../firebase';

async function runBackfill() {
    const db = getDb();
    
    console.log("Loading SMS numbers...");
    const numbersSnap = await db.collection('smsNumbers').get();
    const churchNumbersMap = new Map(); // churchId -> { id, phoneNumber }
    for (const doc of numbersSnap.docs) {
        const numData = doc.data();
        const churchId = numData.churchId;
        if (!churchId) continue;
        
        const existing = churchNumbersMap.get(churchId);
        if (!existing || numData.isDefault) {
            churchNumbersMap.set(churchId, { id: doc.id, phoneNumber: numData.phoneNumber });
        }
    }
    console.log(`Loaded ${churchNumbersMap.size} church default lines.`);

    console.log("Loading people...");
    const peopleSnap = await db.collection('people').get();
    const peopleMap = new Map(); // e164 -> person data
    
    let peopleUpdates = 0;
    
    for (const doc of peopleSnap.docs) {
        const p = doc.data();
        const rawPhone = (p.phone || '').replace(/\D/g, '');
        const e164 = rawPhone.length === 10 ? `+1${rawPhone}` : rawPhone.length === 11 ? `+${rawPhone}` : null;
        
        if (e164) {
            peopleMap.set(`${p.churchId}_${e164}`, { id: doc.id, name: p.name, avatar: p.avatar });
            if (!p.e164Phone) {
                await doc.ref.update({ e164Phone: e164 });
                peopleUpdates++;
            }
        }
    }
    console.log(`Updated ${peopleUpdates} people with e164Phone.`);

    console.log("Loading conversations...");
    const convsSnap = await db.collection('smsConversations').get();
    let convUpdates = 0;
    
    for (const convDoc of convsSnap.docs) {
        const conv = convDoc.data();
        let needsUpdate = false;
        const updatePatch: any = {};
        
        // 1. Backfill Name and Avatar if missing
        if (!conv.personName) {
            const phone = conv.phoneNumber;
            if (phone) {
                const match = peopleMap.get(`${conv.churchId}_${phone}`);
                if (match) {
                    updatePatch.personId = match.id;
                    updatePatch.personName = match.name || null;
                    updatePatch.personAvatar = match.avatar || null;
                    needsUpdate = true;
                }
            }
        }
        
        // 2. Backfill Routing / Line ID fields if missing
        if (!conv.smsNumberId || !conv.inboxId) {
            const numInfo = churchNumbersMap.get(conv.churchId);
            if (numInfo) {
                updatePatch.smsNumberId = numInfo.id;
                updatePatch.twilioNumberId = numInfo.id;
                updatePatch.inboxId = numInfo.id;
                updatePatch.toPhoneNumber = numInfo.phoneNumber || null;
                needsUpdate = true;
            }
        }
        
        if (needsUpdate) {
            console.log(`Backfilling conversation ${convDoc.id}...`);
            await convDoc.ref.update(updatePatch);
            convUpdates++;
        }
    }
    
    console.log(`Done! Updated ${peopleUpdates} people and backfilled ${convUpdates} SMS conversations.`);
}

runBackfill().catch(console.error);
