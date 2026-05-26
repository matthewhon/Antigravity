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
    try {
        const docRef = doc(db, 'churches', 'ch_v0cjkh0z1');
        const snap = await getDoc(docRef);
        if (snap.exists()) {
            console.log('Church ch_v0cjkh0z1:', JSON.stringify(snap.data(), null, 2));
        } else {
            console.log('No church document found.');
        }
    } catch (e) {
        console.error('Error:', e);
    }
    process.exit(0);
}

main();
