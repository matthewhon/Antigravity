/**
 * syncPeople.ts
 * PCO sync for People, Campuses, and SMS conversation reconciliation.
 */

import { firestore } from '../firestoreService';
import { PcoPerson, PcoCampus, StatusChangeRecord } from '../../types';
import { logger, fetchAllPages, delay } from './pcoSyncCore.ts';

export const syncCampusesData = async (churchId: string): Promise<PcoCampus[]> => {
    logger.info('Syncing campuses...', 'sync', { churchId }, churchId);
    const now = Date.now();

    const campuses = await fetchAllPages(
        churchId,
        'people/v2/campuses',
        (c: any) => {
            // Guard: a throw inside the mapper is caught by fetchAllPages as a *page*
            // error, so one malformed campus would silently truncate the whole list.
            if (!c) return null;
            const attrs = c.attributes || {};
            return {
                id: `${churchId}_${c.id}`,
                pcoId: c.id,
                churchId,
                name: attrs.name || 'Unnamed Campus',
                active: attrs.active ?? true,
                createdAt: attrs.created_at || null,
                updatedAt: attrs.updated_at || null,
                lastSynced: now,
            } as PcoCampus;
        }
    );

    const filtered = campuses.filter(Boolean) as PcoCampus[];
    if (filtered.length > 0) {
        await firestore.upsertCampuses(filtered);
    }
    logger.info('Campuses synced', 'sync', { churchId, count: filtered.length }, churchId);
    return filtered;
};

export const syncPeopleData = async (churchId: string) => {
    logger.info('Syncing people...', 'sync', { churchId }, churchId);

    // Fetch campuses to build a name mapping lookup
    const campuses = await firestore.getCampuses(churchId);
    const campusMap = new Map<string, string>();
    campuses.forEach(c => campusMap.set(c.pcoId, c.name));

    let multiCampusEnabled = false;
    try {
        const church = await firestore.getChurch(churchId);
        multiCampusEnabled = church?.multiCampusEnabled ?? false;
    } catch (e) {
        logger.warn('Failed to load church for campus check in syncPeopleData', 'sync', { churchId }, churchId);
    }

    const includeUrl = multiCampusEnabled
        ? 'people/v2/people?include=addresses,emails,phone_numbers,households,field_data,primary_campus'
        : 'people/v2/people?include=addresses,emails,phone_numbers,households,field_data';

    const people = await fetchAllPages(
        churchId,
        includeUrl,
        (p: any, included: any[] = []) => {
            const attrs = p.attributes;
            const rels = p.relationships;

            // ── Age calculation ─────────────────────────────────────────────────
            let age: number | undefined;
            if (attrs.birthdate) {
                const birth = new Date(attrs.birthdate);
                const now = new Date();
                age = now.getFullYear() - birth.getFullYear();
                if (now.getMonth() < birth.getMonth() || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) {
                    age--;
                }
            }

            // ── Household ────────────────────────────────────────────────────────
            const householdRef = rels?.households?.data?.[0];
            const householdId = householdRef?.id || null;
            const householdObj = householdId
                ? (included || []).find(i => i.type === 'Household' && i.id === householdId)
                : null;
            const householdName = householdObj?.attributes?.name || null;

            // ── Primary Campus ──────────────────────────────────────────────
            const campusRef = rels?.primary_campus?.data;
            const primaryCampusId = campusRef?.id || null;
            const campusObj = primaryCampusId
                ? (included || []).find(i => i.type === 'Campus' && i.id === primaryCampusId)
                : null;
            const primaryCampusName = campusObj?.attributes?.name || (primaryCampusId ? (campusMap.get(primaryCampusId) ?? null) : null);

            const milestones = {
                salvationDate: null as string | null,
                baptismDate: null as string | null,
                isBaptizedAfterSalvation: null as boolean | null
            };

            // ── Phone Numbers ───────────────────────────────────────────────
            const personPhoneNumbers = (included || [])
                .filter(i => i.type === 'PhoneNumber' && rels?.phone_numbers?.data?.some((r: any) => r.id === i.id))
                .map(ph => ({
                    number:   ph.attributes.number   || '',
                    location: ph.attributes.location || 'mobile',
                    primary:  ph.attributes.primary  ?? false,
                }));

            const primaryPhone =
                personPhoneNumbers.find(ph => ph.primary) ||
                personPhoneNumbers.find(ph => ['mobile', 'cell'].includes((ph.location || '').toLowerCase())) ||
                personPhoneNumbers[0] ||
                null;

            const rawPhone = primaryPhone ? primaryPhone.number.replace(/\D/g, '') : '';
            const e164Phone = rawPhone.length === 10 ? `+1${rawPhone}` : rawPhone.length === 11 ? `+${rawPhone}` : null;

            return {
                id: p.id,
                churchId,
                name: `${attrs.first_name} ${attrs.last_name}`,
                nameLower: `${attrs.first_name || ''} ${attrs.last_name || ''}`.toLowerCase().trim(),
                firstName: attrs.first_name || null,
                lastName: attrs.last_name || null,
                avatar: attrs.avatar || null,
                membership: attrs.membership || null,
                status: attrs.status || null,
                gender: attrs.gender || null,
                birthdate: attrs.birthdate || null,
                anniversary: attrs.anniversary || null,
                createdAt: attrs.created_at,
                child: attrs.child ?? false,
                age,
                spiritualMilestones: milestones,
                householdId,
                householdName,
                phone: primaryPhone ? primaryPhone.number : null,
                e164Phone,
                phoneNumbers: personPhoneNumbers,
                addresses: (included || [])
                    .filter(i => i.type === 'Address' && rels?.addresses?.data?.some((r: any) => r.id === i.id))
                    .map(a => ({
                        street: a.attributes.street || null,
                        city: a.attributes.city || null,
                        state: a.attributes.state || null,
                        zip: a.attributes.zip || null,
                        location: a.attributes.location || null,
                    })),
                emails: (included || [])
                    .filter(i => i.type === 'Email' && rels?.emails?.data?.some((r: any) => r.id === i.id))
                    .map(e => ({
                        address: e.attributes.address,
                        location: e.attributes.location,
                        primary: e.attributes.primary,
                    })),
                checkInCount: 0,
                primaryCampusId,
                primaryCampusName,
            } as PcoPerson;
        }
    );

    if (people.length > 0) {
        let existingPeople: PcoPerson[] = [];
        try {
            existingPeople = await firestore.getPeople(churchId);
        } catch (e) {
            logger.warn('Could not fetch existing people for change detection', 'sync', { churchId }, churchId);
        }

        const existingMap = new Map(existingPeople.map(p => [p.id, p]));
        const statusChanges: StatusChangeRecord[] = [];
        const nowMs = Date.now();
        const nowIso = new Date().toISOString();

        for (const newPerson of people) {
            const oldPerson = existingMap.get(newPerson.id);

            // Coordinate Preservation
            const newAddr = newPerson.addresses?.[0];
            const oldAddr = oldPerson?.addresses?.[0];
            if (newAddr && oldAddr) {
                const streetMatch = (newAddr.street || '').trim().toLowerCase() === (oldAddr.street || '').trim().toLowerCase();
                const cityMatch = (newAddr.city || '').trim().toLowerCase() === (oldAddr.city || '').trim().toLowerCase();
                const stateMatch = (newAddr.state || '').trim().toLowerCase() === (oldAddr.state || '').trim().toLowerCase();
                const zipMatch = (newAddr.zip || '').trim().toLowerCase() === (oldAddr.zip || '').trim().toLowerCase();

                if (streetMatch && cityMatch && stateMatch && zipMatch) {
                    if (oldAddr.lat !== undefined && oldAddr.lat !== null) newAddr.lat = oldAddr.lat;
                    if (oldAddr.lng !== undefined && oldAddr.lng !== null) newAddr.lng = oldAddr.lng;
                }
            }

            if (newAddr && (newAddr.city || newAddr.zip) && (newAddr.lat === undefined || newAddr.lat === null)) {
                newPerson.needsGeocoding = true;
            } else {
                newPerson.needsGeocoding = false;
            }

            if (!oldPerson) continue;

            if (oldPerson.status !== newPerson.status) {
                statusChanges.push({
                    id: `${churchId}_${newPerson.id}_status_${nowMs}`,
                    churchId,
                    personId: newPerson.id,
                    personName: newPerson.name,
                    date: nowIso,
                    type: 'status',
                    oldValue: oldPerson.status || 'null',
                    newValue: newPerson.status || 'null',
                    timestamp: nowMs
                });
            }

            if (oldPerson.membership !== newPerson.membership) {
                statusChanges.push({
                    id: `${churchId}_${newPerson.id}_membership_${nowMs}`,
                    churchId,
                    personId: newPerson.id,
                    personName: newPerson.name,
                    date: nowIso,
                    type: 'membership',
                    oldValue: oldPerson.membership || 'null',
                    newValue: newPerson.membership || 'null',
                    timestamp: nowMs
                });
            }
        }

        if (statusChanges.length > 0) {
            await firestore.upsertStatusChanges(statusChanges);
            logger.info(`Logged ${statusChanges.length} status/membership changes`, 'sync', { churchId }, churchId);
        }

        await firestore.upsertPeople(people);
    }
    logger.info(`People sync complete`, 'sync', { churchId, count: people.length }, churchId);
};

/**
 * After a people sync, walk every smsConversation document for this church that
 * has a personId set and verify it still matches the e164Phone in the people
 * collection. Fixes stale names/IDs after phone number reassignment in PCO.
 */
export const reconcileSmsConversations = async (churchId: string): Promise<void> => {
    try {
        const { getDb } = await import('../../backend/firebase.js');
        const db = getDb();

        const convSnap = await db.collection('smsConversations')
            .where('churchId', '==', churchId)
            .get();

        if (convSnap.empty) {
            logger.info('SMS reconcile: no linked conversations to check', 'sync', { churchId }, churchId);
            return;
        }

        const peopleSnap = await db.collection('people')
            .where('churchId', '==', churchId)
            .where('e164Phone', '!=', null)
            .get();

        const phoneMap = new Map<string, { personId: string; personName: string; personAvatar: string | null }>();
        for (const doc of peopleSnap.docs) {
            const p = doc.data();
            if (p.e164Phone && !phoneMap.has(p.e164Phone)) {
                phoneMap.set(p.e164Phone, {
                    personId: p.id,
                    personName: p.name || '',
                    personAvatar: p.avatar || null,
                });
            }
        }

        let updatedCount = 0;
        let clearedCount = 0;
        // A WriteBatch is single-use — it must be replaced after every commit, or the
        // next update() throws 'Cannot modify a WriteBatch that has been committed'.
        let batch = db.batch();
        let batchSize = 0;
        const MAX_BATCH = 400;

        const flush = async () => {
            if (batchSize > 0) {
                await batch.commit();
                batch = db.batch();
                batchSize = 0;
            }
        };

        for (const convDoc of convSnap.docs) {
            const conv = convDoc.data();
            const phone: string = conv.phoneNumber;
            if (!phone) continue;

            const correctPerson = phoneMap.get(phone);

            if (correctPerson) {
                const nameChanged   = conv.personName   !== correctPerson.personName;
                const idChanged     = conv.personId     !== correctPerson.personId;
                const avatarChanged = conv.personAvatar !== correctPerson.personAvatar;

                if (nameChanged || idChanged || avatarChanged) {
                    batch.update(convDoc.ref, {
                        personId:     correctPerson.personId,
                        personName:   correctPerson.personName,
                        personAvatar: correctPerson.personAvatar,
                    });
                    batchSize++;
                    updatedCount++;
                    logger.info(
                        `SMS reconcile: updated conversation ${convDoc.id} ` +
                        `(was "${conv.personName}" / ${conv.personId}, ` +
                        `now "${correctPerson.personName}" / ${correctPerson.personId})`,
                        'sync', { churchId, convId: convDoc.id }, churchId
                    );
                }
            } else {
                if (conv.personId !== null || conv.personName !== null || conv.personAvatar !== null) {
                    batch.update(convDoc.ref, {
                        personId:     null,
                        personName:   null,
                        personAvatar: null,
                    });
                    batchSize++;
                    clearedCount++;
                    logger.info(
                        `SMS reconcile: cleared stale person link on conversation ${convDoc.id} ` +
                        `(phone ${phone} no longer matched to any PCO person)`,
                        'sync', { churchId, convId: convDoc.id }, churchId
                    );
                }
            }

            if (batchSize >= MAX_BATCH) await flush();
        }

        await flush();

        logger.info(
            `SMS reconcile complete — ${updatedCount} updated, ${clearedCount} cleared ` +
            `(of ${convSnap.size} linked conversations)`,
            'sync', { churchId, updatedCount, clearedCount }, churchId
        );
    } catch (e: any) {
        logger.warn(`SMS conversation reconciliation error: ${e.message}`, 'sync', { churchId }, churchId);
    }
};
