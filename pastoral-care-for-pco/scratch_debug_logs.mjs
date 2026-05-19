import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, orderBy, limit } from 'firebase/firestore';

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
    console.log('Fetching debugLogs...');
    try {
        const q = query(collection(db, 'debugLogs'), orderBy('timestamp', 'desc'), limit(5));
        const snap = await getDocs(q);
        if (snap.empty) {
            console.log('No debug logs found.');
        } else {
            snap.forEach(doc => {
                console.log('LOG ID:', doc.id);
                console.log(JSON.stringify(doc.data(), null, 2));
                console.log('-------------------------');
            });
        }
    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

main();