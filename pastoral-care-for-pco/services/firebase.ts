
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

/**
 * Firebase configuration for the "pastoral-care-for-pco" project.
 */
export const firebaseConfig = {
  apiKey: "AIzaSyDKmgrnWhB0iT3EFA94Wg7X8QsF1qX40VU",
  authDomain: "pastoral-care-for-pco.firebaseapp.com",
  projectId: "pastoral-care-for-pco",
  storageBucket: "pastoral-care-for-pco.firebasestorage.app",
  messagingSenderId: "420611303326",
  appId: "1:420611303326:web:f0a7742a19e15c8ab8988f",
  measurementId: "G-SE7TBF0HVB"
};

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Export Auth Instance
export const auth = getAuth(app);

/** 
 * CRITICAL: Use the named database instance "pcforpco".
 * The "(default)" database does not exist for this project.
 * Explicitly passing the database ID fixes the [code=not-found] error.
 */
export const db = getFirestore(app, "pcforpco");

export const PROJECT_ID = firebaseConfig.projectId;
