import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, limit, getDocs } from 'firebase/firestore';

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
    try {
        console.log('Querying tenantFiles...');
        const q = query(collection(db, 'tenantFiles'), limit(5));
        const snap = await getDocs(q);
        console.log(`Found ${snap.size} files:`);
        snap.forEach(doc => {
            console.log(doc.id, '=>', JSON.stringify(doc.data(), null, 2));
        });
    } catch (e) {
        console.error('Error querying Firestore:', e);
    }
    process.exit(0);
}

main();
