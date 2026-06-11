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
  console.log(`Searching conversations in church ${targetChurchId} related to Bernice...`);
  try {
    const conversationsRef = collection(db, "smsConversations");
    const q = query(
      conversationsRef,
      where("churchId", "==", targetChurchId)
    );
    const snap = await getDocs(q);
    
    const matches: any[] = [];
    snap.forEach(doc => {
      const data = doc.data();
      const name = (data.personName || "").toLowerCase();
      if (name.includes("bernice") || name.includes("worthington")) {
        matches.push({ id: doc.id, ...data });
      }
    });

    for (const conv of matches) {
      console.log(`\n==================================================`);
      console.log(`Conversation ID: ${conv.id}`);
      console.log(`Name: ${conv.personName} | Phone: ${conv.phoneNumber}`);
      console.log(`Last Message: "${conv.lastMessageBody}"`);
      console.log(`Is Opted Out: ${conv.isOptedOut}`);
      
      console.log(`Fetching messages...`);
      const messagesRef = collection(db, "smsConversations", conv.id, "messages");
      const msgSnap = await getDocs(messagesRef);
      console.log(`Found ${msgSnap.size} messages.`);
      
      const msgs = msgSnap.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
      msgs.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));

      msgs.forEach(m => {
        console.log(`[${new Date(m.createdAt).toISOString()}] ${m.direction} | Status: ${m.status} | Body: "${m.body}"`);
        if (m.error || m.errorMessage || m.twilioError || m.lastError || m.errorCode) {
          console.log("  ⚠️ ERROR DETAILS:", {
            error: m.error || null,
            errorMessage: m.errorMessage || null,
            twilioError: m.twilioError || null,
            lastError: m.lastError || null,
            errorCode: m.errorCode || null
          });
        }
      });
    }

  } catch (e: any) {
    console.error("Error running query:", e);
  }
}

run();
