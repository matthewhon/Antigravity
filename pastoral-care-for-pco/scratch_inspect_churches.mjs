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
    console.log('Fetching churches collection...');
    const churchesSnap = await getDocs(collection(db, 'churches'));
    console.log(`Total churches: ${churchesSnap.size}`);
    churchesSnap.forEach(doc => {
        console.log(`Church ID: ${doc.id}, Name: ${doc.data().name}`);
    });

    console.log('\nGrouping people by churchId...');
    const peopleSnap = await getDocs(collection(db, 'people'));
    const groups = {};
    peopleSnap.forEach(doc => {
        const p = doc.data();
        const cid = p.churchId || 'no_church_id';
        groups[cid] = (groups[cid] || 0) + 1;
    });
    console.log('People counts per churchId:', groups);

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
