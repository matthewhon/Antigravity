import { initializeApp } from "firebase/app";
import { getFirestore, collection, getDocs, doc, getDoc, query, where } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyDKmgrnWhB0iT3EFA94Wg7X8QsF1qX40VU",
  authDomain: "pastoral-care-for-pco.firebaseapp.com",
  projectId: "pastoral-care-for-pco",
  storageBucket: "pastoral-care-for-pco.firebasestorage.app",
  messagingSenderId: "420611303326",
  appId: "1:420611303326:web:f0a7742a19e15c8ab8988f",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app, "pcforpco");

const CHURCH_ID = "ch_v0cjkh0z1";
const BIRTHDAY_WF_ID = "G0JITZMuvSxaOQnoiaoB";
const ANNIVERSARY_WF_ID = "A8jbY1xK3xco8yUwcbsB";

async function run() {
  console.log(`=== ANALYZING WORKFLOWS FOR TENANT ${CHURCH_ID} ===\n`);

  // 1. Fetch Workflow details
  const bdayDoc = await getDoc(doc(db, "smsWorkflows", BIRTHDAY_WF_ID));
  console.log("--- Birthday Workflow Config ---");
  const bdayData = bdayDoc.data();
  console.log(`Name: ${bdayData?.name}`);
  console.log(`Trigger: ${bdayData?.trigger}`);
  console.log(`Steps:`, JSON.stringify(bdayData?.steps, null, 2));

  const annivDocRef = doc(db, "smsWorkflows", ANNIVERSARY_WF_ID);
  const annivData = (await getDoc(annivDocRef)).data();
  console.log("\n--- Anniversary Workflow Config ---");
  console.log(`Name: ${annivData?.name}`);
  console.log(`Trigger: ${annivData?.trigger}`);
  console.log(`Steps:`, JSON.stringify(annivData?.steps, null, 2));

  // 2. Fetch conversations & messages for this tenant
  const convRef = collection(db, "smsConversations");
  const qConv = query(convRef, where("churchId", "==", CHURCH_ID));
  const convSnap = await getDocs(qConv);

  console.log(`\nFound ${convSnap.size} conversations for church ${CHURCH_ID}`);

  let birthdayMsgCount = 0;
  let annivMsgCount = 0;

  const bdayRecipientsMap = new Map<string, { name: string; phone: string; count: number; sampleMsgs: string[] }>();
  const annivRecipientsMap = new Map<string, { name: string; phone: string; count: number; sampleMsgs: string[] }>();

  // Run in chunks of 20
  const docs = convSnap.docs;
  const chunkSize = 20;
  for (let i = 0; i < docs.length; i += chunkSize) {
    const chunk = docs.slice(i, i + chunkSize);
    await Promise.all(
      chunk.map(async (cDoc) => {
        const cData = cDoc.data();
        const msgRef = collection(db, "smsConversations", cDoc.id, "messages");
        const msgSnap = await getDocs(msgRef);

        msgSnap.forEach((mDoc) => {
          const mData = mDoc.data();
          const campaignId = mData.campaignId || "";

          if (campaignId.includes(BIRTHDAY_WF_ID)) {
            birthdayMsgCount++;
            const key = cData.phoneNumber || cDoc.id;
            if (!bdayRecipientsMap.has(key)) {
              bdayRecipientsMap.set(key, { name: cData.personName || "Unknown", phone: cData.phoneNumber, count: 0, sampleMsgs: [] });
            }
            const rec = bdayRecipientsMap.get(key)!;
            rec.count++;
            if (rec.sampleMsgs.length < 2) {
              rec.sampleMsgs.push(`[${new Date(mData.createdAt).toISOString()}] ${mData.body}`);
            }
          }

          if (campaignId.includes(ANNIVERSARY_WF_ID)) {
            annivMsgCount++;
            const key = cData.phoneNumber || cDoc.id;
            if (!annivRecipientsMap.has(key)) {
              annivRecipientsMap.set(key, { name: cData.personName || "Unknown", phone: cData.phoneNumber, count: 0, sampleMsgs: [] });
            }
            const rec = annivRecipientsMap.get(key)!;
            rec.count++;
            if (rec.sampleMsgs.length < 2) {
              rec.sampleMsgs.push(`[${new Date(mData.createdAt).toISOString()}] ${mData.body}`);
            }
          }
        });
      })
    );
  }

  console.log(`\n=== BIRTHDAY WORKFLOW MESSAGES SUMMARY ===`);
  console.log(`Total messages sent across all conversations: ${birthdayMsgCount}`);
  console.log(`Total unique recipient phone numbers: ${bdayRecipientsMap.size}`);
  console.log("\nRecipient Breakdown:");
  bdayRecipientsMap.forEach((val) => {
    console.log(`- ${val.name} (${val.phone}): received ${val.count} birthday notifications`);
    val.sampleMsgs.forEach(s => console.log(`    ${s}`));
  });

  console.log(`\n=== ANNIVERSARY WORKFLOW MESSAGES SUMMARY ===`);
  console.log(`Total messages sent across all conversations: ${annivMsgCount}`);
  console.log(`Total unique recipient phone numbers: ${annivRecipientsMap.size}`);
  console.log("\nRecipient Breakdown:");
  annivRecipientsMap.forEach((val) => {
    console.log(`- ${val.name} (${val.phone}): received ${val.count} anniversary notifications`);
    val.sampleMsgs.forEach(s => console.log(`    ${s}`));
  });
}

run().catch(console.error);
