import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, doc, getDoc } from "firebase/firestore";

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
    const wfRef = collection(db, "smsWorkflows");
    const q = query(wfRef, where("churchId", "==", "ch_v0cjkh0z1"), where("name", "==", "New Visitor Followup"));
    const snap = await getDocs(q);
    if (snap.empty) {
      console.log("No workflow found with name 'New Visitor Followup' for ch_v0cjkh0z1");
      return;
    }
    
    let wfId = "";
    snap.forEach(doc => {
      console.log("Found workflow:", doc.id);
      wfId = doc.id;
      console.log(JSON.stringify(doc.data(), null, 2));
    });

    console.log("---------------------------------------");
    console.log("Finding enrollments for this workflow:");
    const enrRef = collection(db, "smsWorkflowEnrollments");
    const enrQ = query(enrRef, where("workflowId", "==", wfId));
    const enrSnap = await getDocs(enrQ);
    
    enrSnap.forEach(doc => {
      console.log("Enrollment:", doc.id);
      console.log(JSON.stringify(doc.data(), null, 2));
    });

  } catch (e: any) {
    console.error("Error:", e);
  }
}

run();
