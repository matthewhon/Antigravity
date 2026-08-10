import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs } from "firebase/firestore";

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
    const convRef = collection(db, "smsConversations");
    const snap = await getDocs(convRef);
    console.log(`Found ${snap.size} total conversations across DB:`);
    
    for (const doc of snap.docs) {
      const data = doc.data();
      if (data.churchId === "ch_v0cjkh0z1") {
        console.log(`Conv ID: ${doc.id} | Phone: ${data.phoneNumber} | Name: ${data.personName}`);
        const msgRef = collection(db, "smsConversations", doc.id, "messages");
        const msgSnap = await getDocs(msgRef);
        const msgs: any[] = [];
        msgSnap.forEach(m => msgs.push({ id: m.id, ...m.data() }));
        msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
        msgs.forEach(m => {
          console.log(`  [${new Date(m.createdAt).toISOString()}] ${m.direction} | campaignId: ${m.campaignId} | body: "${m.body}"`);
        });
      }
    }
  } catch (e: any) {
    console.error("Error:", e);
  }
}

run();
