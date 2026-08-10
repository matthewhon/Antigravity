/**
 * fix_matthew_hon_conversation.ts
 * ─────────────────────────────────
 * One-shot repair: finds the smsConversation for (469) 344-0785 in tenant
 * ch_v0cjkh0z1, looks up the correct person (Matthew Hon) from the people
 * collection by that phone number, and patches the conversation document.
 *
 * Run with:
 *   npx tsx scratch/fix_matthew_hon_conversation.ts
 */

import { initializeApp } from "firebase/app";
import { getFirestore, collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDKmgrnWhB0iT3EFA94Wg7X8QsF1qX40VU",
  authDomain: "pastoral-care-for-pco.firebaseapp.com",
  projectId: "pastoral-care-for-pco",
  storageBucket: "pastoral-care-for-pco.firebasestorage.app",
  messagingSenderId: "420611303326",
  appId: "1:420611303326:web:f0a7742a19e15c8ab8988f",
  measurementId: "G-SE7TBF0HVB"
};

const CHURCH_ID  = "ch_v0cjkh0z1";
const PHONE_E164 = "+14693440785";

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app, "pcforpco");

async function run() {
  try {
    // 1. Find the correct person in the people collection by phone number
    const peopleSnap = await getDocs(
      query(
        collection(db, "people"),
        where("churchId",  "==", CHURCH_ID),
        where("e164Phone", "==", PHONE_E164)
      )
    );

    if (peopleSnap.empty) {
      console.error("❌  No person found in the people collection for", PHONE_E164);
      console.error("    Make sure a PCO sync has run first so the people collection is up-to-date.");
      process.exit(1);
    }

    const personDoc  = peopleSnap.docs[0].data();
    const personId   = personDoc.id       as string;
    const personName = personDoc.name     as string;
    const personAvatar = personDoc.avatar as string | null ?? null;

    console.log(`✅  Found person: "${personName}" (${personId})`);

    // 2. Find the smsConversation document(s) for this church + phone
    const convSnap = await getDocs(
      query(
        collection(db, "smsConversations"),
        where("churchId",    "==", CHURCH_ID),
        where("phoneNumber", "==", PHONE_E164)
      )
    );

    if (convSnap.empty) {
      console.log("ℹ️  No smsConversation documents found for this phone number — nothing to fix.");
      process.exit(0);
    }

    // 3. Patch each conversation document (usually just one, but handles multiples)
    for (const convDoc of convSnap.docs) {
      const current = convDoc.data();
      console.log(`\n📄  Conversation: ${convDoc.id}`);
      console.log(`    Current  → personId: ${current.personId}, personName: "${current.personName}"`);
      console.log(`    Updating → personId: ${personId},   personName: "${personName}"`);

      await updateDoc(doc(db, "smsConversations", convDoc.id), {
        personId,
        personName,
        personAvatar,
      });

      console.log(`    ✅  Updated.`);
    }

    console.log("\n🎉  Done. The SMS inbox should now show Matthew Hon correctly.");
  } catch (e: any) {
    console.error("Error:", e);
    process.exit(1);
  }
}

run();
