
import { initializeApp } from "firebase/app";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";

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

import { initializeAuth, indexedDBLocalPersistence, browserLocalPersistence, getAuth } from "firebase/auth";
import { Capacitor } from '@capacitor/core';

// Initialize Firebase App
const app = initializeApp(firebaseConfig);

// Export Auth Instance
const getFirebaseAuthConfig = () => {
  if (Capacitor.isNativePlatform()) {
    console.log("Firebase Auth: Initializing on Native Platform using explicit persistence");
    return initializeAuth(app, {
      persistence: [indexedDBLocalPersistence, browserLocalPersistence]
    });
  } else {
    console.log("Firebase Auth: Initializing on Web Platform");
    return getAuth(app);
  }
};
export const auth = getFirebaseAuthConfig();

/** 
 * CRITICAL: Use the named database instance "pcforpco".
 * The "(default)" database does not exist for this project.
 * Explicitly passing the database ID fixes the [code=not-found] error.
 *
 * persistentLocalCache enables IndexedDB offline persistence so Firestore
 * returns cached data instantly on the next app launch before hitting the network.
 * persistentMultipleTabManager allows multiple browser/webview tabs to share the cache.
 */
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
}, "pcforpco");

export const storage = getStorage(app);

export const PROJECT_ID = firebaseConfig.projectId;
