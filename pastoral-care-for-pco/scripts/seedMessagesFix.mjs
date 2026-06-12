import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync } from 'fs';

const PROJECT_ID  = 'pastoral-care-for-pco';
const KEY_PATH = new URL('../serviceAccountKey.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const credential = existsSync(KEY_PATH) ? cert(KEY_PATH) : applicationDefault();

initializeApp({ credential, projectId: PROJECT_ID });

async function main() {
  const db = getFirestore();
  db.settings({ databaseId: 'pcforpco', ignoreUndefinedProperties: true });
  
  const CHURCH_ID = 'c1';
  const now = Date.now();
  
  // We need a few mock people phones from the seed script
  const samplePhones = [
    '(555) 012-3456',
    '(555) 987-6543',
    '(555) 111-2222',
    '(555) 333-4444',
    '(555) 555-6666'
  ];

  const SMS_CONVERSATIONS = [];
  const SMS_MESSAGES = [];
  
  samplePhones.forEach((phone, i) => {
    const convId = `${CHURCH_ID}_${phone.replace(/\D/g, '')}`;
    
    // Create the conversation doc again just in case
    SMS_CONVERSATIONS.push({
      id: convId,
      churchId: CHURCH_ID,
      personId: `person_${i}`,
      personName: `Sample Person ${i}`,
      twilioNumberId: `${CHURCH_ID}_+14045550199`,
      twilioPhoneNumber: '+14045550199',
      contactPhoneNumber: phone,
      lastMessageAt: now - (i * 86400_000),
      lastMessageBody: i % 2 === 0 ? 'Thanks, Pastor!' : 'Looking forward to Sunday.',
      lastMessageDirection: 'inbound',
      unreadCount: i % 2 === 0 ? 1 : 0,
      status: 'active'
    });
    
    SMS_MESSAGES.push({
      id: `${convId}_msg1`,
      churchId: CHURCH_ID,
      conversationId: convId,
      body: 'Hi, just a reminder about the volunteer meeting tomorrow at 7 PM.',
      direction: 'outbound',
      status: 'delivered',
      createdAt: now - (i * 86400_000) - 3600_000
    });
    SMS_MESSAGES.push({
      id: `${convId}_msg2`,
      churchId: CHURCH_ID,
      conversationId: convId,
      body: i % 2 === 0 ? 'Thanks, Pastor!' : 'Looking forward to Sunday.',
      direction: 'inbound',
      status: 'received',
      createdAt: now - (i * 86400_000)
    });
  });

  console.log('Seeding SMS conversations...');
  const convBatch = db.batch();
  for (const c of SMS_CONVERSATIONS) {
    convBatch.set(db.collection('smsConversations').doc(c.id), c, { merge: true });
  }
  await convBatch.commit();

  console.log('Seeding SMS messages to subcollections...');
  const msgBatch = db.batch();
  for (const m of SMS_MESSAGES) {
    const ref = db.collection('smsConversations').doc(m.conversationId).collection('messages').doc(m.id);
    msgBatch.set(ref, m, { merge: true });
  }
  await msgBatch.commit();

  console.log('Done seeding messaging inbox demo data!');
}

main().catch(console.error);
