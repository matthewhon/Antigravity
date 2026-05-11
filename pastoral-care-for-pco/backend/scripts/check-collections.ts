import { getDb } from '../firebase';
async function main() {
    const db = getDb();
    const twilio = await db.collection('twilioNumbers').get();
    console.log("twilioNumbers:", twilio.docs.length);
    const sms = await db.collection('smsNumbers').get();
    console.log("smsNumbers:", sms.docs.length);
}
main().catch(console.error);
