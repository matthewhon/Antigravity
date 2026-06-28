/**
 * Script to fetch the current widget preferences for matthewhon@vbcrowlett.com
 * from Firestore (using the pcforpco database).
 */

import { initializeApp } from 'firebase/app';
import { getFirestore, collection, query, where, getDocs } from 'firebase/firestore';

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

const email = "matthewhon@vbcrowlett.com";

const q = query(collection(db, "users"), where("email", "==", email));
const snap = await getDocs(q);

if (snap.empty) {
  console.log("No user found for email:", email);
} else {
  snap.forEach(docSnap => {
    const data = docSnap.data();
    console.log("User ID:", docSnap.id);
    console.log("Name:", data.name);
    console.log("Roles:", JSON.stringify(data.roles));
    console.log("lastLogin:", data.lastLogin);
    console.log("widgetPreferences:", JSON.stringify(data.widgetPreferences, null, 2));
  });
}

process.exit(0);
