import { getFirestore } from "firebase-admin/firestore";
import { initializeApp, cert } from "firebase-admin/app";

// Initialize Firebase Admin
if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
  // Try default app or initialize with admin if environment exists
}

const db = getFirestore("pcforpco");

async function main() {
  console.log("Querying db via Firestore Admin or direct query...");
  // Let's list collections or search smsWorkflows
  const workflowsSnap = await db.collection("smsWorkflows").where("churchId", "==", "ch_v0cjkh0z1").get();
  console.log(`Found ${workflowsSnap.size} workflows for ch_v0cjkh0z1:`);
  workflowsSnap.forEach(doc => {
    console.log("- ID:", doc.id, "Name:", doc.data().name);
  });
}

main().catch(console.error);
