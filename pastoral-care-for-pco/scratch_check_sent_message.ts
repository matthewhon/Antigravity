import { getDb } from './backend/firebase';

async function check() {
  const db = getDb();
  
  // Find conversation between church and Matthew Hon (+14693440785)
  const convSnap = await db.collection('smsConversations')
    .where('churchId', '==', 'ch_v0cjkh0z1')
    .where('phoneNumber', '==', '+14693440785')
    .limit(1)
    .get();

  if (convSnap.empty) {
    console.log("No conversation found");
    return;
  }

  const convId = convSnap.docs[0].id;
  console.log("Conversation ID:", convId);

  // List last 3 messages
  const msgSnap = await db.collection('smsConversations').doc(convId)
    .collection('messages')
    .orderBy('id', 'desc')
    .limit(3)
    .get();

  console.log("Last messages:");
  msgSnap.docs.forEach(doc => {
    const data = doc.data();
    console.log(`- [${data.direction}] ${data.sentByName || data.sentBy || 'User'}: "${data.body}" (Status: ${data.status})`);
  });
}

check().catch(console.error);
