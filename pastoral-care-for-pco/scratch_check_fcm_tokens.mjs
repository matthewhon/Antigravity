import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query } from 'firebase/firestore';

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
    console.log('Fetching all users with tokens...');
    try {
        const snap = await getDocs(collection(db, 'users'));
        snap.forEach(doc => {
            const data = doc.data();
            if (data.fcmTokens && data.fcmTokens.length > 0) {
                console.log(`User: ${data.name} (${doc.id})`);
                console.log(`Tokens:`, data.fcmTokens);
            } else {
                console.log(`User: ${data.name} (${doc.id}) has NO tokens`);
            }
        });
    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

main();
