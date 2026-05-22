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
    const userId = "MR9FBPeop3TRfsujxtvcDEIvd492";
    console.log("Fetching user profile for:", userId);
    const userDoc = await getDoc(doc(db, "users", userId));
    if (!userDoc.exists()) {
      console.log("User not found!");
      return;
    }
    const user = userDoc.data();
    console.log("User:", JSON.stringify(user, null, 2));

    const churchId = user.churchId;
    console.log("Fetching church profile for:", churchId);
    const churchDoc = await getDoc(doc(db, "churches", churchId));
    if (!churchDoc.exists()) {
      console.log("Church not found!");
      return;
    }
    const church = churchDoc.data();
    console.log("Church:", JSON.stringify(church, null, 2));

    // Now let's try to query system settings
    console.log("Fetching system settings...");
    const settingsDoc = await getDoc(doc(db, "system", "settings"));
    const settings = settingsDoc.exists() ? settingsDoc.data() : {};
    console.log("System Settings:", JSON.stringify(settings, null, 2));

    // Now let's perform a fetch to the proxy
    const apiBaseUrl = (settings.apiBaseUrl || "https://pastoralcare.barnabassoftware.com").replace(/\/$/, "");
    const proxyUrl = apiBaseUrl + "/pco/proxy";
    console.log("Proxy URL:", proxyUrl);

    console.log("Fetching PCO lists via proxy...");
    const res = await fetch(proxyUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        churchId,
        url: "https://api.planningcenteronline.com/people/v2/lists?per_page=100&order=name",
        method: "GET"
      })
    });
    
    console.log("Response status:", res.status);
    const resText = await res.text();
    console.log("Response body:", resText);

  } catch (e) {
    console.error("Error:", e);
  }
}

main();
