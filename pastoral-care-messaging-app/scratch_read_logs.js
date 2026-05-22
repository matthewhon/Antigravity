import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, limit, orderBy, query } from "firebase/firestore";

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

async function main() {
  try {
    console.log("Fetching debugLogs...");
    const q = query(collection(db, "debugLogs"), orderBy("timestamp", "desc"), limit(10));
    const snap = await getDocs(q);
    console.log(`Found ${snap.size} log entries:`);
    snap.forEach(doc => {
      console.log(`--- Log ${doc.id} ---`);
      console.log(JSON.stringify(doc.data(), null, 2));
    });
  } catch (e) {
    console.error("Error fetching debug logs:", e);
  }
}

main();
