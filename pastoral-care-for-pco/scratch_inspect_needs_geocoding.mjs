import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where } from 'firebase/firestore';

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
    const churchId = 'ch_v0cjkh0z1';
    console.log(`Inspecting people for church: ${churchId}...`);
    
    const q = query(collection(db, 'people'), where('churchId', '==', churchId));
    const snap = await getDocs(q);
    
    let total = snap.size;
    let withAddress = 0;
    let withCoords = 0;
    let needsGeocodeTrue = 0;
    let needsGeocodeFalse = 0;
    let needsGeocodeUndefined = 0;
    let hasAddressButNoCoordsAndFalse = 0;

    snap.forEach(doc => {
        const p = doc.data();
        const hasAddr = p.addresses && p.addresses.length > 0;
        const hasCoords = hasAddr && p.addresses[0].lat != null && p.addresses[0].lng != null;
        
        if (hasAddr) withAddress++;
        if (hasCoords) withCoords++;
        
        if (p.needsGeocoding === true) {
            needsGeocodeTrue++;
        } else if (p.needsGeocoding === false) {
            needsGeocodeFalse++;
            if (hasAddr && !hasCoords) {
                hasAddressButNoCoordsAndFalse++;
            }
        } else {
            needsGeocodeUndefined++;
        }
    });

    console.log(`Total people: ${total}`);
    console.log(`With address: ${withAddress}`);
    console.log(`With coordinates: ${withCoords}`);
    console.log(`needsGeocoding === true: ${needsGeocodeTrue}`);
    console.log(`needsGeocoding === false: ${needsGeocodeFalse}`);
    console.log(`needsGeocoding is undefined: ${needsGeocodeUndefined}`);
    console.log(`Has address but NO coordinates AND needsGeocoding === false: ${hasAddressButNoCoordsAndFalse}`);

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
