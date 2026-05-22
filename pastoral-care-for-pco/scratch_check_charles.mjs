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
    try {
        console.log('--- FETCHING CHARLES ---');
        const userQuery = query(collection(db, 'users'), where('email', '==', 'charles.mccuiston@vbcrowlett.com'));
        const userSnap = await getDocs(userQuery);
        let charlesId = null;
        if (userSnap.empty) {
            console.log('No user found with email charles.mccuiston@vbcrowlett.com');
        } else {
            userSnap.forEach(doc => {
                charlesId = doc.id;
                console.log('User ID:', doc.id);
                console.log(JSON.stringify(doc.data(), null, 2));
            });
        }

        console.log('\n--- FETCHING ALL SMS NUMBERS ---');
        const smsSnap = await getDocs(collection(db, 'smsNumbers'));
        smsSnap.forEach(doc => {
            console.log('SMS Number ID:', doc.id);
            console.log(JSON.stringify(doc.data(), null, 2));
        });
    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

main();
