import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

let dbInstance: FirebaseFirestore.Firestore | null = null;

export const getDb = () => {
  if (!dbInstance) {
    if (!admin.apps.length) {
      try {
        admin.initializeApp();
      } catch (e) {
        console.error('Firebase Admin init failed:', e);
      }
    }
    dbInstance = getFirestore();
  }
  return dbInstance;
};
