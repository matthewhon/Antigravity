import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs } from "firebase/firestore";

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
const db = getFirestore(app, "pcforpco");

async function run() {
  try {
    const logsRef = collection(db, "serverLogs");
    const q = query(logsRef, where("churchId", "==", "ch_v0cjkh0z1"));
    const snap = await getDocs(q);
    
    const logs = [];
    snap.forEach(doc => logs.push(doc.data()));
    logs.sort((a, b) => a.timestamp - b.timestamp);
    
    for (const l of logs) {
        if (l.timestamp > 1784950000000 && l.message.includes('Sent staff_sms')) {
            console.log(`[${new Date(l.timestamp).toISOString()}] [${l.level}] ${l.message}`);
        }
    }
  } catch (e: any) {
    console.error("Error:", e);
  }
}

run();
