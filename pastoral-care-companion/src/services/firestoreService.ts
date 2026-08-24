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
  orderBy,
  limit,
  runTransaction,
  writeBatch,
  onSnapshot,
  Unsubscribe
} from 'firebase/firestore';
import { db } from './firebase';
import { 
  Church, User, UserRole, 
  PcoPerson, PcoGroup, SystemSettings, 
  PastoralNote, PrayerRequest, PcoList,
  OutreachSession, OutreachSlot
} from '../types';

class FirestoreService {
  private handleFirestoreError(error: any) {
    console.error("Firestore Error:", error);
    throw error;
  }

  // --- User Management ---
  async getUserProfile(uid: string): Promise<User | null> {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      return userDoc.exists() ? ({ ...userDoc.data(), id: userDoc.id } as User) : null;
    } catch (e) {
      this.handleFirestoreError(e);
      return null;
    }
  }

  async createUserProfile(user: User): Promise<void> {
    try {
      await setDoc(doc(db, 'users', user.id), user, { merge: true });
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }

  async updateUserLastLogin(uid: string) {
    try {
      await updateDoc(doc(db, 'users', uid), { lastLogin: Date.now() });
    } catch (e) {
      // ignore
    }
  }

  async updateUserTheme(uid: string, theme: 'light' | 'dark' | 'system') {
    try {
      await updateDoc(doc(db, 'users', uid), { theme });
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }

  // --- Church / Tenant Management ---
  async getChurch(churchId: string): Promise<Church | null> {
    try {
      const churchDoc = await getDoc(doc(db, 'churches', churchId));
      return churchDoc.exists() ? (churchDoc.data() as Church) : null;
    } catch (e) {
      this.handleFirestoreError(e);
      return null;
    }
  }

  // --- System Settings ---
  async getSystemSettings(): Promise<SystemSettings> {
    try {
      const docSnap = await getDoc(doc(db, 'system', 'settings'));
      return docSnap.exists() ? (docSnap.data() as SystemSettings) : {};
    } catch (e) {
      return {};
    }
  }

  // --- People Directory ---
  async getPeople(churchId: string): Promise<PcoPerson[]> {
    try {
      const q = query(collection(db, 'people'), where('churchId', '==', churchId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as PcoPerson);
    } catch (e) {
      return [];
    }
  }

  // --- Pastoral Notes ---
  async getPastoralNotes(churchId: string, personId?: string): Promise<PastoralNote[]> {
    try {
      let q;
      if (personId) {
        q = query(
          collection(db, 'pastoral_notes'), 
          where('churchId', '==', churchId), 
          where('personId', '==', personId)
        );
      } else {
        q = query(
          collection(db, 'pastoral_notes'), 
          where('churchId', '==', churchId)
        );
      }
      const snapshot = await getDocs(q);
      const list = snapshot.docs.map(d => d.data() as PastoralNote);
      return list.sort((a, b) => b.date.localeCompare(a.date));
    } catch (e) {
      console.warn("getPastoralNotes error:", e);
      return [];
    }
  }

  async savePastoralNote(note: PastoralNote) {
    try {
      await setDoc(doc(db, 'pastoral_notes', note.id), note, { merge: true });
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }

  async deletePastoralNote(id: string) {
    try {
      await deleteDoc(doc(db, 'pastoral_notes', id));
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }

  // --- Prayer Requests ---
  async getPrayerRequests(churchId: string): Promise<PrayerRequest[]> {
    try {
      const q = query(
        collection(db, 'prayer_requests'), 
        where('churchId', '==', churchId), 
        orderBy('date', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as PrayerRequest);
    } catch (e) {
      return [];
    }
  }

  async savePrayerRequest(request: PrayerRequest): Promise<void> {
    try {
      await setDoc(doc(db, 'prayer_requests', request.id), request, { merge: true });
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }

  // --- Groups ---
  async getGroups(churchId: string): Promise<PcoGroup[]> {
    try {
      const q = query(collection(db, 'groups'), where('churchId', '==', churchId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as PcoGroup);
    } catch (e) {
      return [];
    }
  }

  // --- Intake / PCO Forms ---
  async getForms(churchId: string): Promise<any[]> {
    try {
      const q = query(collection(db, 'pco_forms'), where('churchId', '==', churchId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ ...d.data(), id: d.id }));
    } catch (e) {
      console.error("getForms error:", e);
      return [];
    }
  }

  // --- Outreach Sessions & Slots ---
  async getOutreachSessions(churchId: string): Promise<OutreachSession[]> {
    try {
      const q = query(
        collection(db, 'outreach_sessions'),
        where('churchId', '==', churchId),
        orderBy('createdAt', 'desc')
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as OutreachSession);
    } catch (e) {
      return [];
    }
  }

  async getOutreachSession(sessionId: string): Promise<OutreachSession | null> {
    try {
      const snap = await getDoc(doc(db, 'outreach_sessions', sessionId));
      return snap.exists() ? (snap.data() as OutreachSession) : null;
    } catch (e) {
      return null;
    }
  }

  subscribeToOutreachSlots(
    sessionId: string,
    callback: (slots: OutreachSlot[]) => void
  ): Unsubscribe {
    const q = query(
      collection(db, 'outreach_slots'),
      where('sessionId', '==', sessionId),
      orderBy('assignedAt', 'asc')
    );
    return onSnapshot(q, (snap) => {
      callback(snap.docs.map(d => d.data() as OutreachSlot));
    }, () => callback([]));
  }

  async claimNextPerson(
    session: OutreachSession,
    volunteerPhone: string,
    eligiblePeople: { id: string; name: string; phone?: string | null; email?: string | null }[],
    volunteerName?: string | null
  ): Promise<OutreachSlot | null> {
    const slots = await this.claimBatch(session, volunteerPhone, eligiblePeople, 1, volunteerName);
    return slots[0] ?? null;
  }

  async claimBatch(
    session: OutreachSession,
    volunteerPhone: string,
    eligiblePeople: { id: string; name: string; phone?: string | null; email?: string | null }[],
    batchSize: number,
    volunteerName?: string | null
  ): Promise<OutreachSlot[]> {
    try {
      const now = Date.now();
      const slotsRef = collection(db, 'outreach_slots');

      const q = query(slotsRef, where('sessionId', '==', session.id));
      const snap = await getDocs(q);
      const existing = snap.docs.map(d => d.data() as OutreachSlot);

      const blocked = new Set<string>();
      const countMap = new Map<string, number>();

      for (const slot of existing) {
        countMap.set(slot.assignedPersonId, (countMap.get(slot.assignedPersonId) || 0) + 1);
        if (slot.status === 'pending' || slot.status === 'contacted') {
          blocked.add(slot.assignedPersonId);
        } else if (slot.status === 'no-answer') {
          if (slot.noAnswerUntil && slot.noAnswerUntil > now) {
            blocked.add(slot.assignedPersonId);
          }
        }
      }

      const candidateList = eligiblePeople.filter(p => !blocked.has(p.id));
      const candidateCount = Math.min(candidateList.length, batchSize * 2);
      const candidates = candidateList.slice(0, candidateCount);

      const newSlots = await runTransaction(db, async (txn) => {
        const docRefs = candidates.map(person => {
          const attemptIndex = countMap.get(person.id) || 0;
          return {
            person,
            attemptIndex,
            ref: doc(db, 'outreach_slots', `slot_${session.id}_${person.id}_${attemptIndex}`)
          };
        });

        const snaps = await Promise.all(docRefs.map(item => txn.get(item.ref)));
        const created: OutreachSlot[] = [];
        const localBlocked = new Set<string>(blocked);

        for (let i = 0; i < docRefs.length; i++) {
          if (created.length >= batchSize) break;
          const { person, ref, attemptIndex } = docRefs[i];
          const snap = snaps[i];

          if (localBlocked.has(person.id)) continue;

          if (snap.exists()) {
            const slotData = snap.data() as OutreachSlot;
            if (slotData.status === 'pending' || slotData.status === 'contacted') {
              localBlocked.add(person.id);
              continue;
            } else if (slotData.status === 'no-answer') {
              if (slotData.noAnswerUntil && slotData.noAnswerUntil > now) {
                localBlocked.add(person.id);
                continue;
              }
            }
          }

          const slotId = `slot_${session.id}_${person.id}_${attemptIndex}`;
          const newSlot: OutreachSlot = {
            id: slotId,
            sessionId: session.id,
            churchId: session.churchId,
            volunteerPhone,
            volunteerName: volunteerName ?? null,
            assignedPersonId: person.id,
            assignedPersonName: person.name,
            assignedPersonPhone: person.phone ?? null,
            assignedPersonEmail: person.email ?? null,
            assignedPersonRiskCategory: (person as any).riskCategory ?? null,
            assignedAt: now + created.length,
            status: 'pending',
            notes: '',
            completedAt: null,
            noAnswerUntil: null,
          };

          txn.set(ref, newSlot);
          localBlocked.add(person.id);
          created.push(newSlot);
        }

        return created;
      });

      return newSlots;
    } catch (e) {
      console.error('claimBatch error:', e);
      return [];
    }
  }

  async releasePendingSlots(sessionId: string, volunteerPhone: string): Promise<void> {
    try {
      const q = query(
        collection(db, 'outreach_slots'),
        where('sessionId', '==', sessionId),
        where('volunteerPhone', '==', volunteerPhone),
        where('status', '==', 'pending')
      );
      const snap = await getDocs(q);
      if (snap.empty) return;
      const batch = writeBatch(db);
      snap.docs.forEach(d => batch.update(d.ref, { status: 'released', completedAt: Date.now() }));
      await batch.commit();
    } catch (e) {
      console.warn('releasePendingSlots error:', e);
    }
  }

  async updateOutreachSlot(slotId: string, updates: Partial<OutreachSlot>): Promise<void> {
    try {
      await updateDoc(doc(db, 'outreach_slots', slotId), updates as any);
    } catch (e) {
      this.handleFirestoreError(e);
      throw e;
    }
  }

  async updateSessionStats(
    sessionId: string,
    stats: { contactedCount: number; noAnswerCount: number; pendingCount: number; totalEligible: number }
  ): Promise<void> {
    try {
      await updateDoc(doc(db, 'outreach_sessions', sessionId), {
        stats: { ...stats, lastUpdatedAt: Date.now() },
      });
    } catch (e) {
      console.warn('updateSessionStats error:', e);
    }
  }

  async createOutreachSession(session: OutreachSession): Promise<void> {
    try {
      await setDoc(doc(db, 'outreach_sessions', session.id), session, { merge: true });
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }

  async getChurchOutreachSlots(churchId: string): Promise<OutreachSlot[]> {
    try {
      const q = query(
        collection(db, 'outreach_slots'),
        where('churchId', '==', churchId)
      );
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as OutreachSlot);
    } catch (e) {
      return [];
    }
  }
}

export const firestore = new FirestoreService();
