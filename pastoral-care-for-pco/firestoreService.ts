import { 
  collection, 
  query, 
  where, 
  getDocs, 
  getDoc,
  doc, 
  setDoc, 
  updateDoc,
  deleteDoc,
  limit,
  writeBatch
} from 'firebase/firestore';
import { db } from './services/firebase';
import { AttendanceRecord, GivingRecord, Church, User, UserRole, DetailedDonation } from './types';

class FirestoreService {
  private handleFirestoreError(error: any) {
    console.error("Firestore Error:", error);
    throw error;
  }

  async getChurch(churchId: string): Promise<Church | null> {
    try {
      const churchDoc = await getDoc(doc(db, 'churches', churchId));
      return churchDoc.exists() ? (churchDoc.data() as Church) : null;
    } catch (e) {
      this.handleFirestoreError(e);
      return null;
    }
  }

  async getAllChurches(): Promise<Church[]> {
    try {
      const snapshot = await getDocs(collection(db, 'churches'));
      return snapshot.docs.map(d => d.data() as Church);
    } catch (e) {
      this.handleFirestoreError(e);
      return [];
    }
  }

  async createChurch(id: string, name: string, subdomain: string): Promise<Church> {
    const church: Church = {
      id,
      name,
      subdomain,
      pcoConnected: false,
      lastSyncTimestamp: Date.now()
    };
    await setDoc(doc(db, 'churches', id), church, { merge: true });
    return church;
  }

  /**
   * PURGE TENANT DATA
   * Deletes everything associated with a churchId
   */
  async deleteChurchAndData(churchId: string): Promise<void> {
    try {
      console.log(`Starting deep purge for tenant: ${churchId}`);
      
      // 1. Purge sub-collections (Attendance, Giving, Donations, Users)
      const collectionsToClear = ['attendance', 'giving', 'detailed_donations', 'users'];
      
      for (const colName of collectionsToClear) {
        const q = query(collection(db, colName), where('churchId', '==', churchId));
        const snapshot = await getDocs(q);
        
        // Firestore batches are limited to 500 operations
        // For very large tenants, we might need multiple batches, 
        // but for standard use cases, one batch per collection is usually sufficient or manageable in chunks.
        let batch = writeBatch(db);
        let count = 0;
        
        for (const d of snapshot.docs) {
          batch.delete(d.ref);
          count++;
          if (count >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
          }
        }
        if (count > 0) await batch.commit();
      }

      // 2. Delete the church metadata record itself
      await deleteDoc(doc(db, 'churches', churchId));
      
      console.log(`Purge complete for tenant: ${churchId}`);
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }

  async getUserProfile(uid: string): Promise<User | null> {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      return userDoc.exists() ? (userDoc.data() as User) : null;
    } catch (e) {
      this.handleFirestoreError(e);
      return null;
    }
  }

  async deleteUser(uid: string): Promise<void> {
    try {
      await deleteDoc(doc(db, 'users', uid));
    } catch (e) {
      this.handleFirestoreError(e);
      throw e;
    }
  }

  async findUserByEmail(email: string): Promise<User | null> {
    try {
      const q = query(collection(db, 'users'), where('email', '==', email.toLowerCase().trim()), limit(1));
      const snapshot = await getDocs(q);
      if (snapshot.empty) return null;
      return snapshot.docs[0].data() as User;
    } catch (e) {
      this.handleFirestoreError(e);
      return null;
    }
  }

  async getUsersByChurch(churchId: string): Promise<User[]> {
    try {
      const q = query(collection(db, 'users'), where('churchId', '==', churchId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as User);
    } catch (e) {
      this.handleFirestoreError(e);
      return [];
    }
  }

  async getAllUsersAcrossTenants(): Promise<User[]> {
    try {
      const snapshot = await getDocs(collection(db, 'users'));
      return snapshot.docs.map(d => d.data() as User);
    } catch (e) {
      this.handleFirestoreError(e);
      return [];
    }
  }

  async updateUserRoles(uid: string, newRoles: UserRole[]) {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { roles: newRoles });
    } catch (e) {
      this.handleFirestoreError(e);
      throw e;
    }
  }

  async updateUserLastLogin(uid: string) {
    try {
      const userRef = doc(db, 'users', uid);
      await updateDoc(userRef, { lastLogin: Date.now() });
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }

  async getAttendance(churchId: string): Promise<AttendanceRecord[]> {
    try {
      const q = query(collection(db, 'attendance'), where('churchId', '==', churchId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as AttendanceRecord).sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) {
      return [];
    }
  }

  async getGiving(churchId: string): Promise<GivingRecord[]> {
    try {
      const q = query(collection(db, 'giving'), where('churchId', '==', churchId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as GivingRecord).sort((a, b) => a.month.localeCompare(b.month));
    } catch (e) {
      return [];
    }
  }

  async getDetailedDonations(churchId: string): Promise<DetailedDonation[]> {
    try {
      const q = query(collection(db, 'detailed_donations'), where('churchId', '==', churchId));
      const snapshot = await getDocs(q);
      return snapshot.docs
        .map(d => d.data() as DetailedDonation)
        .sort((a, b) => b.date.localeCompare(a.date));
    } catch (e) {
      return [];
    }
  }

  async updateChurch(churchId: string, updates: Partial<Church>) {
    try {
      const churchRef = doc(db, 'churches', churchId);
      await setDoc(churchRef, updates, { merge: true });
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }

  async upsertAttendance(records: AttendanceRecord[]) {
    try {
      const batch = writeBatch(db);
      for (const record of records) {
        batch.set(doc(db, 'attendance', record.id), record, { merge: true });
      }
      await batch.commit();
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }

  async upsertDetailedDonations(records: DetailedDonation[]) {
    try {
      const batch = writeBatch(db);
      for (const record of records) {
        batch.set(doc(db, 'detailed_donations', record.id), record, { merge: true });
      }
      await batch.commit();
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }

  async upsertGiving(records: GivingRecord[]) {
    try {
      const batch = writeBatch(db);
      for (const record of records) {
        batch.set(doc(db, 'giving', record.id), record, { merge: true });
      }
      await batch.commit();
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }
}

export const firestore = new FirestoreService();