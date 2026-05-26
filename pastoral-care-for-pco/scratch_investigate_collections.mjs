import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs, doc, getDoc, limit, query, where } from 'firebase/firestore';

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
        console.log("Fetching churches...");
        const churchesSnap = await getDocs(collection(db, 'churches'));
        console.log(`Found ${churchesSnap.size} churches:`);
        churchesSnap.forEach(docSnap => {
            const data = docSnap.data();
            console.log(`- ID: ${docSnap.id}, Name: ${data.name || 'N/A'}, pcoConnected: ${data.pcoConnected}`);
        });

        // For each church, check if we have data in collections
        for (const docSnap of churchesSnap.docs) {
            const churchId = docSnap.id;
            console.log(`\n--- Church: ${docSnap.id} ---`);

            const testCollections = [
                'people',
                'groups',
                'attendance',
                'detailed_donations',
                'funds',
                'peopleDashboard',
                'givingAnalytics',
                'groupsDashboard',
                'servicesDashboard'
            ];

            for (const colName of testCollections) {
                try {
                    let count = 0;
                    if (['peopleDashboard', 'givingAnalytics', 'groupsDashboard', 'servicesDashboard'].includes(colName)) {
                        // These are keyed by churchId as doc ID
                        const docRef = doc(db, colName, churchId);
                        const s = await getDoc(docRef);
                        if (s.exists()) {
                            console.log(`  [Document] ${colName} exists! Keys:`, Object.keys(s.data()));
                        } else {
                            console.log(`  [Document] ${colName} does NOT exist.`);
                        }
                    } else {
                        // These are collections containing documents with a churchId field
                        const q = query(collection(db, colName), where('churchId', '==', churchId), limit(5));
                        const s = await getDocs(q);
                        console.log(`  [Collection] ${colName}: found sample docs (${s.size} loaded)`);
                    }
                } catch (e) {
                    console.error(`  Error checking ${colName}:`, e.message);
                }
            }
        }
    } catch (e) {
        console.error("Main error:", e);
    }
    process.exit(0);
}

main();
