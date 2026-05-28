import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

const firebaseConfig = {
  apiKey: "AIzaSyDKmgrnWhB0iT3EFA94Wg7X8QsF1qX40VU",
  authDomain: "pastoral-care-for-pco.firebaseapp.com",
  projectId: "pastoral-care-for-pco",
  storageBucket: "pastoral-care-for-pco.firebasestorage.app",
  messagingSenderId: "420611303326",
  appId: "1:420611303326:web:f0a7742a19e15c8ab8988f",
  measurementId: "G-SE7TBF0HVB"
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, 'pcforpco');

async function main() {
    console.log('Fetching people collection...');
    const snap = await getDocs(collection(db, 'people'));
    console.log(`Total people documents: ${snap.size}`);
    
    let withAddress = 0;
    let withCoords = 0;
    let needsGeocodeTrue = 0;
    let needsGeocodeFalse = 0;
    let samplePeople = [];

    snap.forEach(doc => {
        const p = doc.data();
        const hasAddr = p.addresses && p.addresses.length > 0;
        const hasCoords = hasAddr && p.addresses[0].lat != null && p.addresses[0].lng != null;
        
        if (hasAddr) withAddress++;
        if (hasCoords) withCoords++;
        if (p.needsGeocoding === true) needsGeocodeTrue++;
        if (p.needsGeocoding === false) needsGeocodeFalse++;

        if (samplePeople.length < 5 && hasAddr) {
            samplePeople.push({
                id: doc.id,
                name: p.name,
                needsGeocoding: p.needsGeocoding,
                addresses: p.addresses
            });
        }
    });

    console.log(`People with addresses: ${withAddress}`);
    console.log(`People with geocoded coordinates: ${withCoords}`);
    console.log(`needsGeocoding == true: ${needsGeocodeTrue}`);
    console.log(`needsGeocoding == false: ${needsGeocodeFalse}`);
    console.log('\n--- Sample records with addresses ---');
    console.log(JSON.stringify(samplePeople, null, 2));

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
