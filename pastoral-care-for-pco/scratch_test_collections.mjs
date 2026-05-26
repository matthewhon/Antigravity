import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, query, where, limit } from 'firebase/firestore';

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
    const churchId = 'ch_v0cjkh0z1'; // Victory Baptist Church of Rowlett
    console.log(`Checking collections for Church: ${churchId}`);

    const collections = [
        'people',
        'groups',
        'attendance',
        'detailed_donations',
        'funds',
        'service_plans',
        'services_teams',
        'budgets',
        'risk_changes',
        'status_changes'
    ];

    for (const colName of collections) {
        try {
            const q = query(collection(db, colName), where('churchId', '==', churchId));
            const snap = await getDocs(q);
            console.log(`- ${colName}: ${snap.size} documents`);
            if (snap.size > 0) {
                console.log(`  Sample keys for first document:`, Object.keys(snap.docs[0].data()));
            }
        } catch (e) {
            console.error(`- Error checking ${colName}:`, e.message);
        }
    }
    process.exit(0);
}

main();
