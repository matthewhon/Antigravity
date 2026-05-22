import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage as getAdminStorage } from 'firebase-admin/storage';

/**
 * CRITICAL: The Firestore database for this project is the NAMED database "pcforpco".
 * The "(default)" database does NOT exist for the "pastoral-care-for-pco" Firebase project.
 * The Admin SDK must explicitly specify both the projectId and the databaseId.
 */

const initAdmin = () => {
  if (!admin.apps.length) {
    try {
      admin.initializeApp({
        projectId: 'pastoral-care-for-pco',
        storageBucket: 'pastoral-care-for-pco.firebasestorage.app',
      });
    } catch (e) {
      console.error('Firebase Admin init failed:', e);
    }
  }
};

let dbInstance: FirebaseFirestore.Firestore | null = null;

export const getDb = () => {
  if (!dbInstance) {
    initAdmin();
    // Use the named database "pcforpco" — the (default) database does not exist
    dbInstance = getFirestore(admin.app(), 'pcforpco');
  }
  return dbInstance;
};

let storageInstance: any = null;

export const getStorage = () => {
  if (!storageInstance) {
    initAdmin();
    storageInstance = getAdminStorage(admin.app());
  }
  return storageInstance;
};

