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
    const settingsDoc = await getDoc(doc(db, "system", "settings"));
    const settings = settingsDoc.exists() ? settingsDoc.data() : {};
    const apiBaseUrl = (settings.apiBaseUrl || "https://pastoralcare.barnabassoftware.com").replace(/\/$/, "");
    const proxyUrl = apiBaseUrl + "/pco/proxy";
    
    console.log("Testing with undefined churchId...");
    const resUndefined = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        churchId: undefined,
        url: "https://api.planningcenteronline.com/people/v2/lists?per_page=100&order=name",
        method: "GET"
      })
    });
    console.log("ResUndefined status:", resUndefined.status);
    console.log("ResUndefined body:", await resUndefined.text());

    console.log("\nTesting with empty string churchId...");
    const resEmpty = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        churchId: "",
        url: "https://api.planningcenteronline.com/people/v2/lists?per_page=100&order=name",
        method: "GET"
      })
    });
    console.log("ResEmpty status:", resEmpty.status);
    console.log("ResEmpty body:", await resEmpty.text());

  } catch (e) {
    console.error("Error:", e);
  }
}

main();
