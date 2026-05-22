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
    const churchSnap = await getDoc(doc(db, "churches", "ch_v0cjkh0z1"));
    if (!churchSnap.exists()) {
      console.log("Church ch_v0cjkh0z1 does not exist!");
      process.exit(1);
    }
    const data = churchSnap.data();
    console.log("Church PCO Settings:");
    console.log("- pcoConnected:", data.pcoConnected);
    console.log("- has pcoAccessToken:", !!data.pcoAccessToken);
    console.log("- has pcoRefreshToken:", !!data.pcoRefreshToken);
    console.log("- pcoTokenExpiry:", data.pcoTokenExpiry ? new Date(data.pcoTokenExpiry).toISOString() : "None");
    console.log("- pcoTokenExpiry Raw:", data.pcoTokenExpiry);

    const settingsDoc = await getDoc(doc(db, "system", "settings"));
    const settings = settingsDoc.exists() ? settingsDoc.data() : {};
    const apiBaseUrl = (settings.apiBaseUrl || "https://pastoralcare.barnabassoftware.com").replace(/\/$/, "");
    const proxyUrl = apiBaseUrl + "/pco/proxy";
    console.log("\nUsing Proxy URL:", proxyUrl);

    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        churchId: "ch_v0cjkh0z1",
        url: "https://api.planningcenteronline.com/people/v2/lists?per_page=100&order=name",
        method: "GET"
      })
    });
    console.log("\nProxy response status:", res.status);
    const bodyText = await res.text();
    console.log("Proxy response body (first 500 chars):", bodyText.slice(0, 500));
  } catch (e) {
    console.error("Error:", e);
  }
  process.exit(0);
}

main();
