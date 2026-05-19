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
    console.log('Fetching all users...');
    try {
        const q = query(collection(db, 'users'), where('churchId', '==', 'ch_v0cjkh0z1'));
        const snap = await getDocs(q);
        snap.forEach(doc => {
            const data = doc.data();
            console.log(doc.id, '|', data.name, '|', data.email, '| Roles:', data.roles?.length);
        });
    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

main();