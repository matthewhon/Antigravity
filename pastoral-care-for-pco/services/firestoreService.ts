
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
  writeBatch,
  orderBy,
  deleteField
} from 'firebase/firestore';
import { db } from './firebase';
import { 
    AttendanceRecord, GivingRecord, Church, User, UserRole, DetailedDonation, 
    PcoPerson, PcoGroup, PcoFund, BudgetRecord, ServicesTeam, ServicePlanSnapshot,
    ServicesDashboardData, ServicesFilter, SystemSettings, CensusStats,
    Ministry, MetricDefinition, MetricEntry, AggregatedChurchStats, LogEntry,
    PastoralNote, PrayerRequest, CheckInRecord, EmailCampaign, PcoRegistrationEvent,
    Poll, PollResponse
} from '../types';
import { calculateServicesAnalytics, calculateAggregatedStats } from './analyticsService';

class FirestoreService {
  private handleFirestoreError(error: any) {
    console.error("Firestore Error:", error);
    throw error;
  }

  // --- Pastoral Care & Prayer Requests ---

  async getPastoralNotes(churchId: string, personId?: string): Promise<PastoralNote[]> {
    try {
      let q;
      if (personId) {
        q = query(collection(db, 'pastoral_notes'), where('churchId', '==', churchId), where('personId', '==', personId), orderBy('date', 'desc'));
      } else {
        q = query(collection(db, 'pastoral_notes'), where('churchId', '==', churchId), orderBy('date', 'desc'));
      }
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as PastoralNote);
    } catch (e) {
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

  async getPrayerRequests(churchId: string, status?: 'Active' | 'Answered' | 'Archived'): Promise<PrayerRequest[]> {
    try {
      let q;
      if (status) {
        q = query(collection(db, 'prayer_requests'), where('churchId', '==', churchId), where('status', '==', status), orderBy('date', 'desc'));
      } else {
        q = query(collection(db, 'prayer_requests'), where('churchId', '==', churchId), orderBy('date', 'desc'));
      }
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as PrayerRequest);
    } catch (e) {
      return [];
    }
  }

  async savePrayerRequest(request: PrayerRequest) {
    try {
      await setDoc(doc(db, 'prayer_requests', request.id), request, { merge: true });
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }

  async deletePrayerRequest(id: string) {
    try {
      await deleteDoc(doc(db, 'prayer_requests', id));
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

  async getAllChurches(): Promise<Church[]> {
    try {
      const snapshot = await getDocs(collection(db, 'churches'));
      return snapshot.docs.map(d => d.data() as Church);
    } catch (e) {
      this.handleFirestoreError(e);
      return [];
    }
  }

  async createChurch(id: string, name: string, subdomain: string, profileData?: Partial<Church>): Promise<Church> {
    const church: Church = {
      id,
      name,
      subdomain,
      pcoConnected: false,
      lastSyncTimestamp: 0,
      ...profileData
    };
    await setDoc(doc(db, 'churches', id), church, { merge: true });
    return church;
  }

  async updateChurch(churchId: string, updates: Partial<Church>) {
    try {
      const churchRef = doc(db, 'churches', churchId);
      await setDoc(churchRef, updates, { merge: true });
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }

  async flushSyncedData(churchId: string): Promise<void> {
    try {
        console.log(`Flushing synced PCO data for tenant: ${churchId}`);
        // Only flush collections that are populated by the PCO Sync process
        const collectionsToPurge = [
            'people', 
            'groups', 
            'attendance', 
            'detailed_donations', 
            'funds', 
            'teams', 
            'service_plans',
            'pco_registrations'
        ];

        for (const colName of collectionsToPurge) {
            const q = query(collection(db, colName), where('churchId', '==', churchId));
            const snapshot = await getDocs(q);
            
            if (snapshot.empty) continue;

            // Batch deletes in chunks
            const chunk = 400;
            for (let i = 0; i < snapshot.docs.length; i += chunk) {
                const batch = writeBatch(db);
                snapshot.docs.slice(i, i + chunk).forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
            }
            console.log(`Flushed ${snapshot.size} docs from ${colName}`);
        }

        // Reset sync timestamp but keep connection
        await updateDoc(doc(db, 'churches', churchId), { 
            lastSyncTimestamp: deleteField()
        });
        console.log(`Flush complete for tenant: ${churchId}`);

    } catch (e) {
        this.handleFirestoreError(e);
    }
  }

  async deleteChurchAndData(churchId: string): Promise<void> {
    try {
        console.log(`Starting full purge for tenant: ${churchId}`);
        
        // List of all collections that store tenant-specific data with a 'churchId' field
        const collectionsToPurge = [
            'people', 
            'groups', 
            'attendance', 
            'detailed_donations', 
            'funds', 
            'budgets', 
            'teams', 
            'service_plans', 
            'users', // Users are also tenant-scoped via churchId
            'metric_entries', 
            'metric_definitions', 
            'ministries'
        ];

        for (const colName of collectionsToPurge) {
            const q = query(collection(db, colName), where('churchId', '==', churchId));
            const snapshot = await getDocs(q);
            
            if (snapshot.empty) continue;

            // Batch deletes in chunks of 400 (Firestore limit is 500)
            const chunk = 400;
            for (let i = 0; i < snapshot.docs.length; i += chunk) {
                const batch = writeBatch(db);
                snapshot.docs.slice(i, i + chunk).forEach(doc => {
                    batch.delete(doc.ref);
                });
                await batch.commit();
            }
            console.log(`Purged ${snapshot.size} docs from ${colName}`);
        }

        // Finally, delete the church document itself
        await deleteDoc(doc(db, 'churches', churchId));
        console.log(`Tenant ${churchId} deleted successfully.`);

    } catch (e) {
        this.handleFirestoreError(e);
    }
  }

  async deleteDonations(churchId: string, ids: string[]): Promise<void> {
      try {
          if (ids.length === 0) return;
          console.log(`Deleting ${ids.length} obsolete donation records for ${churchId}...`);
          
          const chunk = 400;
          for (let i = 0; i < ids.length; i += chunk) {
              const batch = writeBatch(db);
              ids.slice(i, i + chunk).forEach(id => {
                  batch.delete(doc(db, 'detailed_donations', id));
              });
              await batch.commit();
          }
          console.log("Deletion complete.");
      } catch (e) {
          this.handleFirestoreError(e);
      }
  }

  async resetAllSubscriptions(): Promise<void> {
      try {
          const snapshot = await getDocs(collection(db, 'churches'));
          const batch = writeBatch(db);
          let count = 0;

          snapshot.docs.forEach((docSnap) => {
              batch.update(docSnap.ref, {
                  subscription: {
                      status: 'canceled',
                      planId: 'free',
                      currentPeriodEnd: Date.now(),
                      customerId: null 
                  }
              });
              count++;
          });

          if (count > 0) {
              await batch.commit();
          }
          console.log(`Reset subscriptions for ${count} tenants.`);
      } catch (e) {
          this.handleFirestoreError(e);
      }
  }

  // --- User Management ---

  async getUserProfile(uid: string): Promise<User | null> {
    try {
      const userDoc = await getDoc(doc(db, 'users', uid));
      return userDoc.exists() ? (userDoc.data() as User) : null;
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

  async createTenantUser(churchId: string, userData: any): Promise<void> {
      // Note: This function typically requires Cloud Functions to create Auth users securely without logging out the admin.
      // For client-side, we assume an invite flow or standard auth. 
      // If used purely client-side, it might conflict with current auth session.
      // Placeholder implementation for data record:
      const uid = `user_${Date.now()}`; // In reality, this comes from Auth
      const newUser: User = {
          id: uid,
          churchId,
          name: userData.name,
          email: userData.email,
          roles: userData.roles,
          theme: 'traditional'
      };
      await this.createUserProfile(newUser);
  }

  async updateUserLastLogin(uid: string) {
      try {
          await updateDoc(doc(db, 'users', uid), { lastLogin: Date.now() });
      } catch (e) {
          // ignore
      }
  }

  async updateUserPreferences(uid: string, preferences: Record<string, string[]>) {
      try {
          await updateDoc(doc(db, 'users', uid), { widgetPreferences: preferences });
      } catch (e) {
          this.handleFirestoreError(e);
      }
  }

  async updateUserTheme(uid: string, theme: 'traditional' | 'dark') {
      try {
          await updateDoc(doc(db, 'users', uid), { theme });
      } catch (e) {
          this.handleFirestoreError(e);
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

  async getSystemAdmins(): Promise<User[]> {
      try {
          const q = query(collection(db, 'users'), where('roles', 'array-contains', 'System Administration'));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(d => d.data() as User);
      } catch (e) {
          this.handleFirestoreError(e);
          return [];
      }
  }

  // --- Data Accessors ---

  async getPeople(churchId: string): Promise<PcoPerson[]> {
      try {
          const q = query(collection(db, 'people'), where('churchId', '==', churchId));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(d => d.data() as PcoPerson);
      } catch (e) { return []; }
  }

  /**
   * Batch-updates the `checkInCount` field on person documents.
   * @param churchId The church tenant ID
   * @param counts Map of { [personId]: checkInCount }
   */
  async updatePeopleCheckInCounts(churchId: string, counts: Record<string, number>): Promise<void> {
      try {
          const entries = Object.entries(counts);
          const CHUNK = 400;
          for (let i = 0; i < entries.length; i += CHUNK) {
              const batch = writeBatch(db);
              entries.slice(i, i + CHUNK).forEach(([personId, count]) => {
                  const ref = doc(db, 'people', `${churchId}_${personId}`);
                  batch.update(ref, { checkInCount: count });
              });
              await batch.commit();
          }
          console.log(`[Firestore] Updated checkInCount for ${entries.length} people in church ${churchId}`);
      } catch (e) {
          // Non-fatal — log and continue
          console.warn('[Firestore] updatePeopleCheckInCounts failed:', e);
      }
  }



  async getGroups(churchId: string): Promise<PcoGroup[]> {
      try {
          const q = query(collection(db, 'groups'), where('churchId', '==', churchId));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(d => d.data() as PcoGroup);
      } catch (e) { return []; }
  }

  async getAttendance(churchId: string): Promise<AttendanceRecord[]> {
    try {
      const q = query(collection(db, 'attendance'), where('churchId', '==', churchId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as AttendanceRecord).sort((a, b) => a.date.localeCompare(b.date));
    } catch (e) { return []; }
  }

  async getDetailedDonations(churchId: string): Promise<DetailedDonation[]> {
    try {
      const q = query(collection(db, 'detailed_donations'), where('churchId', '==', churchId));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => d.data() as DetailedDonation).sort((a, b) => b.date.localeCompare(a.date));
    } catch (e) { return []; }
  }

  async getAggregatedGiving(churchId: string, limitMonths: number = 12): Promise<import('../types').AggregatedGivingMetric[]> {
      try {
          const q = query(
              collection(db, 'analytics_giving'), 
              where('churchId', '==', churchId),
              orderBy('month', 'desc'),
              limit(limitMonths)
          );
          const snapshot = await getDocs(q);
          return snapshot.docs.map(d => d.data() as import('../types').AggregatedGivingMetric).sort((a,b) => a.month.localeCompare(b.month));
      } catch (e) { return []; }
  }

  async hasGivingData(churchId: string): Promise<boolean> {
      try {
          const q = query(collection(db, 'detailed_donations'), where('churchId', '==', churchId), limit(1));
          const snapshot = await getDocs(q);
          return !snapshot.empty;
      } catch (e) {
          return false;
      }
  }

  async getFunds(churchId: string): Promise<PcoFund[]> {
      try {
          const q = query(collection(db, 'funds'), where('churchId', '==', churchId));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(d => d.data() as PcoFund);
      } catch (e) { return []; }
  }

  async getBudgets(churchId: string): Promise<BudgetRecord[]> {
      try {
          const q = query(collection(db, 'budgets'), where('churchId', '==', churchId));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(d => d.data() as BudgetRecord);
      } catch (e) { return []; }
  }

  async getServicesTeams(churchId: string): Promise<ServicesTeam[]> {
      try {
          const q = query(collection(db, 'teams'), where('churchId', '==', churchId));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(d => d.data() as ServicesTeam);
      } catch (e) { return []; }
  }

  async getServicePlans(churchId: string): Promise<ServicePlanSnapshot[]> {
      try {
          const q = query(collection(db, 'service_plans'), where('churchId', '==', churchId));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(d => d.data() as ServicePlanSnapshot);
      } catch (e) { return []; }
  }

  async getServicesAnalytics(churchId: string, filter: ServicesFilter): Promise<ServicesDashboardData> {
      // In a real optimized scenario, this might fetch a pre-calculated document.
      // Here we fetch raw data and calculate on client/server boundary to emulate a service.
      const [plans, teams, attendance] = await Promise.all([
          this.getServicePlans(churchId),
          this.getServicesTeams(churchId),
          this.getAttendance(churchId)
      ]);
      return calculateServicesAnalytics(plans, teams, attendance, filter);
  }

  // --- Data Mutation (Batch Upserts) ---

  /**
   * Recursively replaces all `undefined` values with `null` so Firestore doesn't
   * reject the entire WriteBatch with "Unsupported field value: undefined".
   */
  private deepSanitize(obj: any): any {
      if (obj === undefined) return null;
      if (obj === null || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(item => this.deepSanitize(item));
      const sanitized: Record<string, any> = {};
      for (const [key, value] of Object.entries(obj)) {
          sanitized[key] = this.deepSanitize(value);
      }
      return sanitized;
  }

  async upsertPeople(records: PcoPerson[]) { await this.batchUpsert('people', records); }
  async upsertGroups(records: PcoGroup[]) { await this.batchUpsert('groups', records); }
  async upsertAttendance(records: AttendanceRecord[]) { await this.batchUpsert('attendance', records); }
  async upsertCheckIns(records: CheckInRecord[]) { await this.batchUpsert('check_ins', records); }
  async upsertDetailedDonations(records: DetailedDonation[]) { await this.batchUpsert('detailed_donations', records); }
  async upsertFunds(records: PcoFund[]) { await this.batchUpsert('funds', records); }
  async upsertServicesTeams(records: ServicesTeam[]) { await this.batchUpsert('teams', records); }
  async upsertServicePlans(records: ServicePlanSnapshot[]) { await this.batchUpsert('service_plans', records); }
  async upsertRegistrations(records: PcoRegistrationEvent[]) { await this.batchUpsert('pco_registrations', records); }

  /**
   * Deletes all pco_registrations documents for a tenant.
   * Called before a full-replace sync to ensure cancelled/deleted PCO events
   * don't remain stale in Firestore.
   */
  async clearRegistrations(churchId: string): Promise<void> {
      try {
          const q = query(collection(db, 'pco_registrations'), where('churchId', '==', churchId));
          const snapshot = await getDocs(q);
          if (snapshot.empty) return;
          const CHUNK = 400;
          for (let i = 0; i < snapshot.docs.length; i += CHUNK) {
              const batch = writeBatch(db);
              snapshot.docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref));
              await batch.commit();
          }
          console.log(`[Firestore] Cleared ${snapshot.size} old registrations for tenant ${churchId}`);
      } catch (e) {
          console.warn('[Firestore] clearRegistrations failed (non-fatal):', e);
      }
  }

  async getRegistrations(churchId: string): Promise<PcoRegistrationEvent[]> {
      try {
          const q = query(
              collection(db, 'pco_registrations'),
              where('churchId', '==', churchId)
          );
          const snapshot = await getDocs(q);
          return snapshot.docs
              .map(d => d.data() as PcoRegistrationEvent)
              .sort((a, b) => {
                  if (!a.startsAt) return 1;
                  if (!b.startsAt) return -1;
                  return new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime();
              });
      } catch (e) { return []; }
  }
  
  async saveBudget(budget: BudgetRecord) {
      await setDoc(doc(db, 'budgets', budget.id), budget, { merge: true });
  }

  private async batchUpsert(collectionName: string, records: any[]) {
    try {
      let batch = writeBatch(db);
      let count = 0;
      for (const record of records) {
        const ref = doc(db, collectionName, record.id);
        // Sanitize: Firestore rejects undefined values — convert all to null
        const safe = this.deepSanitize(record);
        batch.set(ref, safe, { merge: true });
        count++;
        if (count >= 450) {
            await batch.commit();
            batch = writeBatch(db);
            count = 0;
        }
      }
      if (count > 0) await batch.commit();
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }


  // --- System Settings & Benchmarks ---

  async getSystemSettings(): Promise<SystemSettings> {
      try {
          const docSnap = await getDoc(doc(db, 'system', 'settings'));
          return docSnap.exists() ? (docSnap.data() as SystemSettings) : {};
      } catch (e) { return {}; }
  }

  async saveSystemSettings(settings: SystemSettings) {
      try {
          await setDoc(doc(db, 'system', 'settings'), settings, { merge: true });
      } catch (e) { this.handleFirestoreError(e); }
  }

  async updateCensusCache(churchId: string, data: CensusStats, sourceUrl: string, city: string, state: string) {
      try {
          await updateDoc(doc(db, 'churches', churchId), {
              censusCache: {
                  lastUpdated: Date.now(),
                  data,
                  sourceUrl,
                  city,
                  state
              }
          });
      } catch (e) { console.error("Census cache update failed", e); }
  }

  async getAggregatedStats(): Promise<AggregatedChurchStats[]> {
      try {
          const q = query(collection(db, 'aggregated_stats'));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(d => d.data() as AggregatedChurchStats);
      } catch (e) { return []; }
  }

  async recalculateGlobalBenchmarks() {
      // 1. Fetch all churches with metrics sharing enabled
      const churchesSnapshot = await getDocs(query(collection(db, 'churches'), where('metricsSharingEnabled', '==', true)));
      const churches = churchesSnapshot.docs.map(d => d.data() as Church);

      const batch = writeBatch(db);
      let count = 0;

      for (const church of churches) {
          // 2. Fetch data for each church
          const [people, donations, groups, teams] = await Promise.all([
              this.getPeople(church.id),
              this.getDetailedDonations(church.id),
              this.getGroups(church.id),
              this.getServicesTeams(church.id)
          ]);

          // 3. Calculate Stats
          const stats = calculateAggregatedStats(church.id, people, donations, groups, teams);

          // 4. Save to aggregated_stats collection
          const ref = doc(db, 'aggregated_stats', church.id);
          batch.set(ref, stats);
          count++;
      }

      if (count > 0) await batch.commit();
      console.log(`Updated benchmarks for ${count} tenants.`);
  }

  // --- Metrics Module ---

  async getMinistries(churchId: string): Promise<Ministry[]> {
      try {
          const q = query(collection(db, 'ministries'), where('churchId', '==', churchId));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(d => d.data() as Ministry);
      } catch (e) { return []; }
  }

  async saveMinistry(ministry: Ministry) {
      await setDoc(doc(db, 'ministries', ministry.id), ministry, { merge: true });
  }

  async deleteMinistry(id: string) {
      await deleteDoc(doc(db, 'ministries', id));
  }

  async getMetricDefinitions(churchId: string): Promise<MetricDefinition[]> {
      try {
          const q = query(collection(db, 'metric_definitions'), where('churchId', '==', churchId));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(d => d.data() as MetricDefinition);
      } catch (e) { return []; }
  }

  async saveMetricDefinition(def: MetricDefinition) {
      await setDoc(doc(db, 'metric_definitions', def.id), def, { merge: true });
  }

  async deleteMetricDefinition(id: string) {
      await deleteDoc(doc(db, 'metric_definitions', id));
  }

  async getMetricEntries(churchId: string): Promise<MetricEntry[]> {
      try {
          // Typically we might limit this by date, but for now fetch all
          const q = query(collection(db, 'metric_entries'), where('churchId', '==', churchId));
          const snapshot = await getDocs(q);
          return snapshot.docs.map(d => d.data() as MetricEntry);
      } catch (e) { return []; }
  }

  async saveMetricEntry(entry: MetricEntry) {
      await setDoc(doc(db, 'metric_entries', entry.id), entry, { merge: true });
  }

  // --- Email Campaigns ---

  async getEmailCampaigns(churchId: string): Promise<EmailCampaign[]> {
      try {
          // NOTE: No orderBy here — compound queries (where + orderBy) require a
          // composite Firestore index. If the index is missing, Firestore throws and
          // the catch silently returns []. Sort in-memory instead.
          const q = query(collection(db, 'email_campaigns'), where('churchId', '==', churchId));
          const snapshot = await getDocs(q);
          return snapshot.docs
              .map(d => d.data() as EmailCampaign)
              .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
      } catch (e) {
          console.error('[FirestoreService] getEmailCampaigns failed:', e);
          return [];
      }
  }

  async saveEmailCampaign(campaign: EmailCampaign): Promise<void> {
      try {
          // Strip undefined values — Firestore rejects them
          const safe = JSON.parse(JSON.stringify(campaign));
          await setDoc(doc(db, 'email_campaigns', campaign.id), safe);
      } catch (e) {
          console.error('[FirestoreService] saveEmailCampaign failed:', e);
          throw e;
      }
  }

  async updateEmailCampaign(campaignId: string, updates: Partial<EmailCampaign>): Promise<void> {
      try {
          const safe = JSON.parse(JSON.stringify({ ...updates, updatedAt: Date.now() }));
          await updateDoc(doc(db, 'email_campaigns', campaignId), safe);
      } catch (e) {
          console.error('[FirestoreService] updateEmailCampaign failed:', e);
          throw e;
      }
  }

  async deleteEmailCampaign(campaignId: string): Promise<void> {
      try {
          await deleteDoc(doc(db, 'email_campaigns', campaignId));
      } catch (e) { this.handleFirestoreError(e); }
  }

  // --- Email Unsubscribes ---

  async getEmailUnsubscribes(churchId: string): Promise<import('../types').EmailUnsubscribe[]> {
      try {
          const q = query(collection(db, 'email_unsubscribes'), where('churchId', '==', churchId));
          const snapshot = await getDocs(q);
          return snapshot.docs
              .map(d => d.data() as import('../types').EmailUnsubscribe)
              .sort((a, b) => (b.unsubscribedAt || 0) - (a.unsubscribedAt || 0));
      } catch (e) {
          console.error('[FirestoreService] getEmailUnsubscribes failed:', e);
          return [];
      }
  }

  async removeEmailUnsubscribe(id: string): Promise<void> {
      try {
          await deleteDoc(doc(db, 'email_unsubscribes', id));
      } catch (e) { this.handleFirestoreError(e); }
  }

  // --- Logging ---

  async saveLog(entry: LogEntry): Promise<void> {
      try {
          await setDoc(doc(db, 'logs', entry.id), entry);
      } catch (e) {
          // Raw console only — never call logger.error here (circular)
          console.error('[FirestoreService] Failed to save log entry:', e);
      }
  }

  async getLogs(
      churchId?: string,
      limitCount = 100,
      level?: 'info' | 'warn' | 'error',
      source?: string
  ): Promise<LogEntry[]> {
      try {
          const logsRef = collection(db, 'logs');
          const constraints: any[] = [orderBy('timestamp', 'desc'), limit(limitCount)];

          if (churchId && churchId !== 'all') {
              constraints.unshift(where('churchId', '==', churchId));
          }
          if (level) {
              constraints.unshift(where('level', '==', level));
          }
          if (source) {
              constraints.unshift(where('source', '==', source));
          }

          const q = query(logsRef, ...constraints);
          const snapshot = await getDocs(q);
          return snapshot.docs.map(d => ({ id: d.id, ...d.data() as any } as LogEntry));
      } catch (e) {
          console.error("Error fetching logs:", e);
          return [];
      }
  }

  // --- Sermon Verse Usage ---

  async getSermonVerseUsage(book: string, chapter: number, verse: number): Promise<SermonVerseRecord[]> {
    const id = `${book}_${chapter}_${verse}`;
    try {
      const docSnap = await getDoc(doc(db, 'sermon_verses', id));
      if (!docSnap.exists()) return [];
      const data = docSnap.data();
      return (data.sermons || []) as SermonVerseRecord[];
    } catch (e) {
      return [];
    }
  }

  async addSermonVerseUsage(
    book: string, chapter: number, verse: number,
    churchId: string,
    sermonTitle: string, preacher: string, date: string
  ): Promise<void> {
    const id = `${book}_${chapter}_${verse}`;
    const newEntry: SermonVerseRecord = { sermonTitle, preacher, date, churchId, addedAt: new Date().toISOString() };
    try {
      const docRef = doc(db, 'sermon_verses', id);
      const docSnap = await getDoc(docRef);
      const existing: SermonVerseRecord[] = docSnap.exists() ? (docSnap.data().sermons || []) : [];
      await setDoc(docRef, { book, chapter, verse, sermons: [...existing, newEntry] }, { merge: true });
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }

  // --- Polls ---

  async getPolls(churchId: string): Promise<Poll[]> {
    try {
      const q = query(collection(db, 'polls'), where('churchId', '==', churchId));
      const snapshot = await getDocs(q);
      return snapshot.docs
        .map(d => d.data() as Poll)
        .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    } catch (e) {
      console.error('[FirestoreService] getPolls failed:', e);
      return [];
    }
  }

  async getPoll(pollId: string): Promise<Poll | null> {
    try {
      const docSnap = await getDoc(doc(db, 'polls', pollId));
      return docSnap.exists() ? (docSnap.data() as Poll) : null;
    } catch (e) {
      return null;
    }
  }

  async savePoll(poll: Poll): Promise<void> {
    try {
      const safe = JSON.parse(JSON.stringify(poll));
      await setDoc(doc(db, 'polls', poll.id), safe);
    } catch (e) {
      this.handleFirestoreError(e);
      throw e;
    }
  }

  async updatePoll(pollId: string, updates: Partial<Poll>): Promise<void> {
    try {
      const safe = JSON.parse(JSON.stringify({ ...updates, updatedAt: Date.now() }));
      await updateDoc(doc(db, 'polls', pollId), safe);
    } catch (e) {
      this.handleFirestoreError(e);
      throw e;
    }
  }

  async deletePoll(pollId: string): Promise<void> {
    try {
      // Delete all responses first
      const q = query(collection(db, 'poll_responses'), where('pollId', '==', pollId));
      const snapshot = await getDocs(q);
      if (!snapshot.empty) {
        const CHUNK = 400;
        for (let i = 0; i < snapshot.docs.length; i += CHUNK) {
          const batch = writeBatch(db);
          snapshot.docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref));
          await batch.commit();
        }
      }
      await deleteDoc(doc(db, 'polls', pollId));
    } catch (e) {
      this.handleFirestoreError(e);
    }
  }

  async getPollResponses(pollId: string): Promise<PollResponse[]> {
    try {
      const q = query(collection(db, 'poll_responses'), where('pollId', '==', pollId));
      const snapshot = await getDocs(q);
      return snapshot.docs
        .map(d => d.data() as PollResponse)
        .sort((a, b) => (b.submittedAt || 0) - (a.submittedAt || 0));
    } catch (e) {
      return [];
    }
  }

  async submitPollResponse(response: PollResponse): Promise<void> {
    try {
      const safe = JSON.parse(JSON.stringify(response));
      const batch = writeBatch(db);
      // Write the response
      batch.set(doc(db, 'poll_responses', response.id), safe);
      // Increment totalResponses on the poll document
      batch.update(doc(db, 'polls', response.pollId), {
        totalResponses: (await this.getPoll(response.pollId))?.totalResponses + 1 || 1,
        updatedAt: Date.now()
      });
      await batch.commit();
    } catch (e) {
      throw e;
    }
  }
}

export interface SermonVerseRecord {
  sermonTitle: string;
  preacher: string;
  date: string;
  churchId: string;
  addedAt: string;
}

export const firestore = new FirestoreService();

