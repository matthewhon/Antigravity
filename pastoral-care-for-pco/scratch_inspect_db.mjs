import { initializeApp } from 'firebase/app';
import { getFirestore, collection, getDocs } from 'firebase/firestore';

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
const db = getFirestore(app, 'pcforpco');

async function main() {
    console.log('=== USERS ===');
    const usersSnap = await getDocs(collection(db, 'users'));
    usersSnap.forEach(doc => {
        const u = doc.data();
        console.log(`User ID: ${doc.id}`);
        console.log(`Name: ${u.name}`);
        console.log(`Email: ${u.email}`);
        console.log(`Roles:`, u.roles);
        console.log('---');
    });

    console.log('\n=== SMS NUMBERS ===');
    const numsSnap = await getDocs(collection(db, 'smsNumbers'));
    numsSnap.forEach(doc => {
        const n = doc.data();
        console.log(`Number ID: ${doc.id}`);
        console.log(`Phone: ${n.phoneNumber}`);
        console.log(`Friendly Label: ${n.friendlyLabel}`);
        console.log(`Allowed Users:`, n.allowedUserIds);
        console.log(`Permissions:`, JSON.stringify(n.permissions, null, 2));
        console.log('---');
    });

    process.exit(0);
}

main().catch(err => {
    console.error(err);
    process.exit(1);
});
