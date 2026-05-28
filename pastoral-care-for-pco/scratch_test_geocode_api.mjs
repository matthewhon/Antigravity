import { initializeApp } from 'firebase/app';
import { getFirestore, doc, getDoc } from 'firebase/firestore';

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
    // 1. Get Google Maps API key
    const settingsSnap = await getDoc(doc(db, 'system', 'settings'));
    const googleApiKey = settingsSnap.data()?.googleMapsApiKey;
    if (!googleApiKey) {
        console.error('No Google Maps API Key found in system/settings!');
        process.exit(1);
    }
    console.log(`Using API key: ${googleApiKey.substring(0, 10)}...`);

    // 2. Test Nominatim fallback
    const testAddress = "Stone Mountain, GA, 30087";
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(testAddress)}`;
    
    console.log(`Calling Nominatim API for: "${testAddress}"...`);
    try {
        const res = await fetch(url, { headers: { 'User-Agent': 'PastoralCareApp/1.0' } });
        const data = await res.json();
        if (data && data[0]) {
            console.log('Nominatim Location:', { lat: data[0].lat, lon: data[0].lon });
        } else {
            console.log('Nominatim empty response:', data);
        }
    } catch (e) {
        console.error('Nominatim error:', e);
    }

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
