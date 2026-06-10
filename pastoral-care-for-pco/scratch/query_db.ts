import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc, updateDoc } from "firebase/firestore";

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
  const workflowId = "G0JITZMuvSxaOQnoiaoB";
  try {
    const wfRef = doc(db, "smsWorkflows", workflowId);
    const snap = await getDoc(wfRef);
    if (!snap.exists()) {
      console.log("Workflow does not exist.");
      return;
    }
    const data = snap.data();
    console.log("Original Workflow steps/nodes:");
    console.log("Steps staffListName:", data.steps?.[0]?.staffListName);
    console.log("Nodes staffListName:", data.nodes?.[0]?.staffListName);

    const updatedSteps = [...(data.steps || [])];
    if (updatedSteps[0]) {
      updatedSteps[0].staffListId = "4942298";
      updatedSteps[0].staffListName = "VBC - Church Leadership";
    }

    const updatedNodes = [...(data.nodes || [])];
    if (updatedNodes[0]) {
      updatedNodes[0].staffListId = "4942298";
      updatedNodes[0].staffListName = "VBC - Church Leadership";
    }

    await updateDoc(wfRef, {
      steps: updatedSteps,
      nodes: updatedNodes,
      updatedAt: Date.now()
    });

    console.log("Successfully updated workflow in Firestore.");

    // Fetch again to verify
    const newSnap = await getDoc(wfRef);
    const newData = newSnap.data() || {};
    console.log("Updated Workflow steps/nodes:");
    console.log("Steps staffListName:", newData.steps?.[0]?.staffListName);
    console.log("Nodes staffListName:", newData.nodes?.[0]?.staffListName);

  } catch (e: any) {
    console.error("Error during update:", e);
  }
}

run();
