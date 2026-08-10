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
  const targetChurchId = "ch_v0cjkh0z1";
  console.log(`=== Fetching Workflows for ${targetChurchId} ===`);
  try {
    const wfRef = collection(db, "smsWorkflows");
    const q = query(wfRef, where("churchId", "==", targetChurchId));
    const snap = await getDocs(q);
    
    console.log(`Found ${snap.size} total workflows for church`);
    snap.forEach(doc => {
      const d = doc.data();
      console.log(`- Workflow ID: ${doc.id}`);
      console.log(`  Name: "${d.name}"`);
      console.log(`  Active: ${d.isActive}`);
      console.log(`  Steps count: ${d.steps?.length}`);
      if (d.steps) {
        d.steps.forEach((s: any, idx: number) => {
          console.log(`    Step ${idx + 1}: type=${s.channelType}, targetType=${s.staffTargetType}, recipients=${JSON.stringify(s.staffRecipients || s.staffListId || s.staffGroupId || [])}`);
        });
      }
    });

  } catch (e: any) {
    console.error("Error:", e);
  }
}

run();
