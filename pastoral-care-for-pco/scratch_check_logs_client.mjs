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
    for (const colName of ['logs', 'system_logs', 'debugLogs']) {
        console.log(`Searching ${colName}...`);
        try {
            const snap = await getDocs(query(collection(db, colName), orderBy('timestamp', 'desc'), limit(100)));
            snap.forEach(doc => {
                const d = doc.data();
                const jsonStr = JSON.stringify(d);
                if (jsonStr.toLowerCase().includes('send') || jsonStr.toLowerCase().includes('fail') || jsonStr.toLowerCase().includes('reply')) {
                    console.log(`[${colName}] [${new Date(d.timestamp).toISOString()}] ${d.level || 'INFO'}: ${d.message || d.msg || 'no message'}`);
                    console.log('  Data:', jsonStr.slice(0, 500));
                }
            });
        } catch (e) {
            console.error(`Error searching ${colName}:`, e.message);
        }
    }
    process.exit(0);
}

main();
