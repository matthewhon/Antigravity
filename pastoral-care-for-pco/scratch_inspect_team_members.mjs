import { initializeApp } from "firebase/app";
import { getFirestore, doc, getDoc } from "firebase/firestore";

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
    const planSnap = await getDoc(doc(db, "service_plans", "88753878"));
    const plan = planSnap.data();

    const settingsDoc = await getDoc(doc(db, "system", "settings"));
    const settings = settingsDoc.exists() ? settingsDoc.data() : {};
    const apiBaseUrl = (settings.apiBaseUrl || "https://pastoralcare.barnabassoftware.com").replace(/\/$/, "");
    const proxyUrl = apiBaseUrl + "/pco/proxy";

    const membersUrl = `https://api.planningcenteronline.com/services/v2/service_types/${plan.serviceTypeId}/plans/${plan.id}/team_members?per_page=5`;
    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        churchId: plan.churchId,
        url: membersUrl,
        method: "GET"
      })
    });
    const membersData = await res.json();
    console.log("PCO Team Members Data (First 2 entries):");
    if (membersData.data) {
      console.log(JSON.stringify(membersData.data.slice(0, 2), null, 2));
    }
  } catch (e) {
    console.error("Error:", e);
  }
  process.exit(0);
}

main();
