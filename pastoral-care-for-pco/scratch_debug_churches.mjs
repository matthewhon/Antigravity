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
    console.log('Fetching Church ch_v0cjkh0z1...');
    try {
        const snap = await getDoc(doc(db, 'churches', 'ch_v0cjkh0z1'));
        if (!snap.exists()) {
            console.log('No church found.');
        } else {
            console.log('CHURCH DATA:');
            const data = snap.data();
            console.log(JSON.stringify({ broadcastPermissions: data.broadcastPermissions }, null, 2));
        }
    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

main();