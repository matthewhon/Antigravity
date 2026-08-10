import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, orderBy, limit } from "firebase/firestore";

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
    const q = query(convRef, where("churchId", "==", "ch_v0campaign"), where("phoneNumber", "==", "+19364143830")); // I will change the ch_v0campaign to ch_v0cjkh0z1 in the code block
    const snap = await getDocs(query(convRef, where("churchId", "==", "ch_v0cjkh0z1"), where("phoneNumber", "==", "+19364143830")));
    
    for (const doc of snap.docs) {
       console.log("Found conversation:", doc.id);
       const msgRef = collection(db, "smsConversations", doc.id, "messages");
       const msgSnap = await getDocs(query(msgRef, orderBy("createdAt", "desc"), limit(10)));
       
       const messages = [];
       msgSnap.forEach(m => messages.push(m.data()));
       messages.sort((a, b) => a.createdAt - b.createdAt);
       
       for (const m of messages) {
          console.log(`sentAt: ${new Date(m.createdAt).toISOString()}, campaignId: ${m.campaignId}, messageSid: ${m.messageSid}, body: ${m.body?.substring(0, 50)}...`);
       }
    }
  } catch (e: any) {
    console.error("Error:", e);
  }
}

run();
