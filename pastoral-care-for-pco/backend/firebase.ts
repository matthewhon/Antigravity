import admin from 'firebase-admin';
import { getFirestore } from 'firebase-admin/firestore';

/**
 * CRITICAL: The Firestore database for this project is the NAMED database "pcforpco".
 * The "(default)" database does NOT exist for the "pastoral-care-for-pco" Firebase project.
 * The Admin SDK must explicitly specify both the projectId and the databaseId.
 */

let dbInstance: FirebaseFirestore.Firestore | null = null;

export const getDb = () => {
  if (!dbInstance) {
    if (!admin.apps.length) {
      try {
        admin.initializeApp({
          projectId: 'pastoral-care-for-pco',
        });
      } catch (e) {
        console.error('Firebase Admin init failed:', e);
      }
    }
    // Use the named database "pcforpco" — the (default) database does not exist
    dbInstance = getFirestore(admin.app(), 'pcforpco');
  }
  return dbInstance;
};
