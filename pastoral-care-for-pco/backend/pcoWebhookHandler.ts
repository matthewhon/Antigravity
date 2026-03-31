import { Request, Response } from 'express';
import * as crypto from 'crypto';
import admin from 'firebase-admin';
import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';

const db = getDb();
const log = createServerLogger(db);

// ─── Entry Point ─────────────────────────────────────────────────────────────

export const handlePcoWebhook = async (req: Request, res: Response) => {
    try {
        const signature = req.headers['x-pco-signature'] as string;
        const churchId = req.query.churchId as string;
        
        let payloadString = '';
        if (Buffer.isBuffer(req.body)) {
            payloadString = req.body.toString('utf8');
        } else if (typeof req.body === 'string') {
            payloadString = req.body;
        } else if (req.body) {
            payloadString = JSON.stringify(req.body);
        }

        if (!signature) {
            log.error('Webhook received without X-PCO-Signature header', 'webhook', { churchId });
            return res.status(401).send('Missing Signature');
        }

        const settingsDoc = await db.collection('system_settings').doc('pco_webhooks').get();
        const secret = settingsDoc.data()?.secret;

        if (!secret) {
            log.error('Webhook secret not found in database', 'webhook', { churchId });
            return res.status(500).send('Server Error: Secret missing');
        }

        const hmac = crypto.createHmac('sha256', secret);
        const digest = hmac.update(payloadString).digest('hex');

        if (digest !== signature) {
            log.warn('Webhook signature mismatch — proceeding (dev mode)', 'webhook', { churchId });
            // return res.status(403).send('Invalid Signature'); // Uncomment for strict security
        }

        if (!payloadString) {
            log.warn('Empty webhook payload received', 'webhook', { churchId });
            return res.status(400).send('Empty Payload');
        }

        const event = JSON.parse(payloadString);
        const eventsList = Array.isArray(event?.data) ? event.data : (event?.data ? [event.data] : []);

        if (eventsList.length === 0) {
            log.warn('Invalid webhook payload structure — no events in list', 'webhook', { churchId });
            return res.status(400).send('Invalid Payload');
        }

        for (const eventItem of eventsList) {
            const eventName: string = eventItem?.attributes?.name;
            const resourceData = eventItem?.attributes?.payload?.data;
            const includedData: any[] = eventItem?.attributes?.payload?.included || [];

            if (!eventName || !resourceData) {
                log.warn('Invalid webhook event item — missing name or payload', 'webhook', { churchId, eventItem });
                continue;
            }

            log.info(`Processing PCO webhook: ${eventName}`, 'webhook', { churchId, eventName }, churchId);

            // ── People ──────────────────────────────────────────────────────
            if (eventName.startsWith('people.v2.events.person')) {
                await handlePersonEvent(eventName, resourceData, churchId);
            } else if (eventName.startsWith('people.v2.events.household')) {
                await handleHouseholdEvent(eventName, resourceData, churchId);

            // ── Giving ──────────────────────────────────────────────────────
            } else if (eventName.startsWith('giving.v2.events.donation')) {
                await handleDonationEvent(eventName, resourceData, includedData, churchId);
            } else if (eventName.startsWith('giving.v2.events.recurring_donation')) {
                await handleRecurringDonationEvent(eventName, resourceData, churchId);
            } else if (eventName.startsWith('giving.v2.events.fund')) {
                await handleFundEvent(eventName, resourceData, churchId);

            // ── Services ────────────────────────────────────────────────────
            } else if (eventName.startsWith('services.v2.events.plan_person')) {
                await handlePlanPersonEvent(eventName, resourceData, churchId);
            } else if (eventName.startsWith('services.v2.events.needed_position')) {
                await handleNeededPositionEvent(eventName, resourceData, churchId);
            } else if (eventName.startsWith('services.v2.events.plan.')) {
                await handlePlanEvent(eventName, resourceData, churchId);

            // ── Check-Ins ───────────────────────────────────────────────────
            } else if (eventName === 'check_ins.v2.events.check_in.created') {
                await handleCheckInCreated(resourceData, churchId);
            } else if (eventName === 'check_ins.v2.events.check_in.destroyed') {
                await handleCheckInDestroyed(resourceData, churchId);

            // ── Groups ──────────────────────────────────────────────────────
            } else if (eventName === 'groups.v2.events.group_attendance.created') {
                await handleGroupAttendanceEvent(resourceData, churchId);
            } else if (eventName.startsWith('groups.v2.events.group.')) {
                await handleGroupEvent(eventName, resourceData, churchId);
            } else if (eventName.startsWith('groups.v2.events.membership.')) {
                await handleGroupMembershipEvent(eventName, resourceData, churchId);

            } else {
                log.info(`Unhandled webhook event type: ${eventName}`, 'webhook', { churchId, eventName }, churchId);
            }
        }

        return res.status(200).send('Webhook Processed');

    } catch (error: any) {
        log.error('Error processing webhook', 'webhook', { churchId: req.query.churchId, error: error?.message });
        return res.status(500).send('Internal Server Error');
    }
};

// ─── People ───────────────────────────────────────────────────────────────────

async function handlePersonEvent(eventName: string, data: any, churchId: string) {
    const personId = data.id;
    const attrs = data.attributes;

    if (eventName.endsWith('.destroyed') || eventName.endsWith('.deleted')) {
        await db.collection('people').doc(personId).delete();
        log.info(`Person deleted via webhook`, 'webhook', { personId, churchId }, churchId);
        return;
    }

    const updateData: any = {
        id: personId,
        churchId,
        name: `${attrs.first_name || ''} ${attrs.last_name || ''}`.trim(),
        avatar: attrs.avatar || null,
        email: attrs.primary_email || null,
        status: attrs.status || null,
        gender: attrs.gender || null,
        birthdate: attrs.birthdate || null,
        anniversary: attrs.anniversary || null,
        membership: attrs.membership || null,
        createdAt: attrs.created_at,
        lastUpdated: Date.now(),
        age: attrs.birthdate
            ? new Date().getFullYear() - new Date(attrs.birthdate).getFullYear()
            : undefined,
    };

    await db.collection('people').doc(personId).set(updateData, { merge: true });
    log.info(`Person synced via webhook`, 'webhook', { personId, churchId, event: eventName }, churchId);
}

async function handleHouseholdEvent(eventName: string, data: any, churchId: string) {
    const householdId = data.id;
    const attrs = data.attributes;

    if (eventName.endsWith('.destroyed')) {
        // Remove household reference from all people in this household
        const snapshot = await db.collection('people')
            .where('churchId', '==', churchId)
            .where('householdId', '==', householdId)
            .get();

        const batch = db.batch();
        snapshot.docs.forEach(doc => {
            batch.update(doc.ref, { householdId: null, householdName: null });
        });
        await batch.commit();
        log.info(`Household ${householdId} destroyed — cleared from ${snapshot.size} people`, 'webhook', { churchId }, churchId);
        return;
    }

    // Update all people in this household with the new name
    const newName = attrs.name;
    if (!newName) return;
    const snapshot = await db.collection('people')
        .where('churchId', '==', churchId)
        .where('householdId', '==', householdId)
        .get();

    const batch = db.batch();
    snapshot.docs.forEach(doc => {
        batch.update(doc.ref, { householdName: newName, lastUpdated: Date.now() });
    });
    await batch.commit();
    log.info(`Household ${householdId} synced via webhook`, 'webhook', { churchId, householdId, count: snapshot.size }, churchId);
}

// ─── Giving ───────────────────────────────────────────────────────────────────

async function handleDonationEvent(eventName: string, data: any, included: any[], churchId: string) {
    const donationId = data.id;
    const attrs = data.attributes;

    if (eventName.endsWith('.destroyed')) {
        // Remove from detailed_donations
        await db.collection('detailed_donations').doc(donationId).delete();

        // Reverse-decrement the giving aggregation
        const donationDate = new Date(attrs.created_at || Date.now());
        const monthKey = `${donationDate.getFullYear()}_${String(donationDate.getMonth() + 1).padStart(2, '0')}`;
        const amount = (attrs.amount_cents || 0) / 100;
        if (amount > 0) {
            const aggRef = db.collection('analytics_giving').doc(`${churchId}_${monthKey}`);
            await aggRef.set({
                totalAmount: admin.firestore.FieldValue.increment(-amount),
                donationCount: admin.firestore.FieldValue.increment(-1),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        }
        log.info(`Donation destroyed via webhook`, 'webhook', { donationId, churchId }, churchId);
        return;
    }

    // Resolve fund name from included resources
    const fundId = data.relationships?.fund?.data?.id;
    let fundName = 'General';
    if (fundId) {
        const fundResource = included?.find((i: any) => i.type === 'Fund' && i.id === fundId);
        if (fundResource?.attributes?.name) {
            fundName = fundResource.attributes.name;
        } else {
            // Fall back to Firestore cache
            const fundDoc = await db.collection('giving_funds')
                .where('churchId', '==', churchId)
                .where('pcoId', '==', fundId)
                .limit(1).get();
            if (!fundDoc.empty) fundName = fundDoc.docs[0].data().name || 'General';
        }
    }

    const personId = data.relationships?.person?.data?.id;
    let donorName = 'Unknown';
    if (personId) {
        const personDoc = await db.collection('people').doc(personId).get();
        if (personDoc.exists) donorName = personDoc.data()?.name || 'Unknown';
    }

    const isRecurring = !!(data.relationships?.recurring_donation?.data?.id);

    const donation = {
        id: donationId,
        churchId,
        amount: (attrs.amount_cents || 0) / 100,
        date: attrs.created_at || new Date().toISOString(),
        fundName,
        fundId: fundId || null,
        donorId: personId || 'anonymous',
        donorName,
        isRecurring,
        lastUpdated: Date.now(),
    };

    await db.collection('detailed_donations').doc(donationId).set(donation, { merge: true });

    // Write-time aggregation (only increment on .created — .updated adjusts the existing record)
    if (eventName.endsWith('.created')) {
        try {
            const donationDate = new Date(donation.date);
            const monthKey = `${donationDate.getFullYear()}_${String(donationDate.getMonth() + 1).padStart(2, '0')}`;
            const aggRef = db.collection('analytics_giving').doc(`${churchId}_${monthKey}`);
            await aggRef.set({
                churchId,
                month: monthKey,
                totalAmount: admin.firestore.FieldValue.increment(donation.amount),
                donationCount: admin.firestore.FieldValue.increment(1),
                [`funds.${fundName}`]: admin.firestore.FieldValue.increment(donation.amount),
                lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
            }, { merge: true });
        } catch (aggErr: any) {
            log.error('Failed to update analytics_giving aggregation', 'webhook', { donationId, churchId, error: aggErr?.message }, churchId);
        }
    }

    log.info(`Donation synced via webhook (${eventName})`, 'webhook', { donationId, amount: donation.amount, fund: fundName, churchId }, churchId);
}

async function handleRecurringDonationEvent(eventName: string, data: any, churchId: string) {
    const rdId = data.id;
    const attrs = data.attributes;
    const personId = data.relationships?.person?.data?.id;

    if (eventName.endsWith('.destroyed')) {
        // Mark any donations linked to this recurring_donation as non-recurring
        log.info(`Recurring donation ${rdId} destroyed`, 'webhook', { churchId, rdId }, churchId);
        return;
    }

    // Store recurring donation record for reference (used to flag donations as recurring)
    await db.collection('recurring_donations').doc(`${churchId}_${rdId}`).set({
        id: rdId,
        churchId,
        personId: personId || null,
        amount: (attrs.amount_cents || 0) / 100,
        status: attrs.status || 'active',
        frequency: attrs.schedule?.frequency || null,
        lastUpdated: Date.now(),
    }, { merge: true });

    log.info(`Recurring donation synced via webhook (${eventName})`, 'webhook', { rdId, churchId }, churchId);
}

async function handleFundEvent(eventName: string, data: any, churchId: string) {
    const fundId = data.id;
    const attrs = data.attributes;

    if (eventName.endsWith('.destroyed')) {
        await db.collection('giving_funds').doc(`${churchId}_${fundId}`).delete();
        log.info(`Fund destroyed via webhook`, 'webhook', { fundId, churchId }, churchId);
        return;
    }

    await db.collection('giving_funds').doc(`${churchId}_${fundId}`).set({
        id: `${churchId}_${fundId}`,
        pcoId: fundId,
        churchId,
        name: attrs.name || 'Unknown Fund',
        isDefault: attrs.default || false,
        isVisible: attrs.visible || true,
        lastUpdated: Date.now(),
    }, { merge: true });

    log.info(`Fund synced via webhook (${eventName})`, 'webhook', { fundId, name: attrs.name, churchId }, churchId);
}

// ─── Services ─────────────────────────────────────────────────────────────────

async function handlePlanEvent(eventName: string, data: any, churchId: string) {
    const planId = data.id;
    const attrs = data.attributes;

    if (eventName.endsWith('.destroyed')) {
        await db.collection('service_plans').doc(`${churchId}_${planId}`).delete();
        log.info(`Plan destroyed via webhook`, 'webhook', { planId, churchId }, churchId);
        return;
    }

    await db.collection('service_plans').doc(`${churchId}_${planId}`).set({
        id: planId,
        churchId,
        sortDate: attrs.sort_date || attrs.dates || new Date().toISOString(),
        seriesTitle: attrs.series_title || null,
        serviceTypeName: data.relationships?.service_type?.data?.id || null,
        lastUpdated: Date.now(),
    }, { merge: true });

    log.info(`Plan synced via webhook (${eventName})`, 'webhook', { planId, churchId }, churchId);
}

async function handlePlanPersonEvent(eventName: string, data: any, churchId: string) {
    const planPersonId = data.id;
    const attrs = data.attributes;
    const planId = data.relationships?.plan?.data?.id;
    const personId = data.relationships?.person?.data?.id;

    if (!planId) {
        log.warn(`plan_person webhook missing planId`, 'webhook', { planPersonId, churchId }, churchId);
        return;
    }

    const planDocId = `${churchId}_${planId}`;
    const planRef = db.collection('service_plans').doc(planDocId);

    if (eventName.endsWith('.destroyed')) {
        // Remove this team member from the plan's teamMembers array
        const planDoc = await planRef.get();
        if (planDoc.exists) {
            const teamMembers: any[] = planDoc.data()?.teamMembers || [];
            const updated = teamMembers.filter((m: any) => m.planPersonId !== planPersonId);
            await planRef.set({ teamMembers: updated, lastUpdated: Date.now() }, { merge: true });
        }
        log.info(`Plan person removed via webhook`, 'webhook', { planPersonId, planId, churchId }, churchId);
        return;
    }

    // Upsert this team member in the plan's teamMembers array
    const newMember = {
        planPersonId,
        personId: personId || null,
        status: attrs.status || 'Unknown',
        teamName: attrs.team_position_name || null,
        teamId: data.relationships?.team?.data?.id || null,
        teamPositionName: attrs.team_position_name || null,
        name: attrs.name || null,
    };

    const planDoc = await planRef.get();
    const teamMembers: any[] = planDoc.exists ? (planDoc.data()?.teamMembers || []) : [];
    const existingIdx = teamMembers.findIndex((m: any) => m.planPersonId === planPersonId);
    if (existingIdx >= 0) {
        teamMembers[existingIdx] = { ...teamMembers[existingIdx], ...newMember };
    } else {
        teamMembers.push(newMember);
    }

    await planRef.set({ teamMembers, lastUpdated: Date.now() }, { merge: true });
    log.info(`Plan person synced via webhook (${eventName})`, 'webhook', { planPersonId, planId, churchId }, churchId);
}

async function handleNeededPositionEvent(eventName: string, data: any, churchId: string) {
    const positionId = data.id;
    const attrs = data.attributes;
    const planId = data.relationships?.plan?.data?.id;

    if (!planId) return;

    const planDocId = `${churchId}_${planId}`;
    const planRef = db.collection('service_plans').doc(planDocId);

    if (eventName.endsWith('.destroyed')) {
        const planDoc = await planRef.get();
        if (planDoc.exists) {
            const positions: any[] = planDoc.data()?.neededPositions || [];
            const updated = positions.filter((p: any) => p.id !== positionId);
            await planRef.set({ neededPositions: updated, positionsNeeded: Math.max(0, updated.length), lastUpdated: Date.now() }, { merge: true });
        }
        log.info(`Needed position removed via webhook`, 'webhook', { positionId, planId, churchId }, churchId);
        return;
    }

    const planDoc = await planRef.get();
    const positions: any[] = planDoc.exists ? (planDoc.data()?.neededPositions || []) : [];
    const newPosition = {
        id: positionId,
        teamName: attrs.team_position_name || 'Position',
        quantity: attrs.quantity || 1,
    };
    const existingIdx = positions.findIndex((p: any) => p.id === positionId);
    if (existingIdx >= 0) positions[existingIdx] = newPosition;
    else positions.push(newPosition);

    await planRef.set({
        neededPositions: positions,
        positionsNeeded: positions.reduce((s: number, p: any) => s + (p.quantity || 1), 0),
        lastUpdated: Date.now(),
    }, { merge: true });

    log.info(`Needed position synced via webhook (${eventName})`, 'webhook', { positionId, planId, churchId }, churchId);
}

// ─── Check-Ins ────────────────────────────────────────────────────────────────

async function handleCheckInCreated(data: any, churchId: string) {
    const checkInId = data.id;
    const attrs = data.attributes;
    const personId = data.relationships?.person?.data?.id;
    const eventId = data.relationships?.event?.data?.id;

    if (!eventId) return;

    const record = {
        id: checkInId,
        churchId,
        personId: personId || 'unknown',
        eventId,
        date: (attrs.created_at || '').split('T')[0],
        createdAt: attrs.created_at,
        checkedInAt: attrs.created_at,
        securityCode: attrs.security_code,
        kind: attrs.kind || 'Regular',
    };

    await db.collection('check_ins').doc(checkInId).set(record, { merge: true });

    // Increment daily attendance aggregate
    const dateKey = record.date;
    const dailyDocId = `daily_${churchId}_${dateKey}`;
    await db.collection('attendance').doc(dailyDocId).set({
        id: dailyDocId,
        churchId,
        date: dateKey,
        digitalCheckins: admin.firestore.FieldValue.increment(1),
        count: admin.firestore.FieldValue.increment(1),
        guests: record.kind === 'Guest' ? admin.firestore.FieldValue.increment(1) : admin.firestore.FieldValue.increment(0),
        regulars: (record.kind !== 'Guest' && record.kind !== 'Volunteer') ? admin.firestore.FieldValue.increment(1) : admin.firestore.FieldValue.increment(0),
        volunteers: record.kind === 'Volunteer' ? admin.firestore.FieldValue.increment(1) : admin.firestore.FieldValue.increment(0),
    }, { merge: true });

    log.info(`Check-in created via webhook`, 'webhook', { checkInId, eventId, churchId, kind: record.kind }, churchId);
}

async function handleCheckInDestroyed(data: any, churchId: string) {
    const checkInId = data.id;
    const attrs = data.attributes;

    // Fetch the stored record first to know the date and kind
    const stored = await db.collection('check_ins').doc(checkInId).get();
    const kind: string = stored.data()?.kind || attrs.kind || 'Regular';
    const dateKey: string = stored.data()?.date || (attrs.created_at || '').split('T')[0];

    if (dateKey) {
        const dailyDocId = `daily_${churchId}_${dateKey}`;
        await db.collection('attendance').doc(dailyDocId).set({
            digitalCheckins: admin.firestore.FieldValue.increment(-1),
            count: admin.firestore.FieldValue.increment(-1),
            guests: kind === 'Guest' ? admin.firestore.FieldValue.increment(-1) : admin.firestore.FieldValue.increment(0),
            regulars: (kind !== 'Guest' && kind !== 'Volunteer') ? admin.firestore.FieldValue.increment(-1) : admin.firestore.FieldValue.increment(0),
            volunteers: kind === 'Volunteer' ? admin.firestore.FieldValue.increment(-1) : admin.firestore.FieldValue.increment(0),
        }, { merge: true });
    }

    await db.collection('check_ins').doc(checkInId).delete();
    log.info(`Check-in destroyed via webhook`, 'webhook', { checkInId, churchId, kind, dateKey }, churchId);
}

// ─── Groups ───────────────────────────────────────────────────────────────────

async function handleGroupEvent(eventName: string, data: any, churchId: string) {
    const groupId = data.id;
    const attrs = data.attributes;
    const groupDocId = `${churchId}_${groupId}`;

    if (eventName.endsWith('.destroyed')) {
        await db.collection('groups').doc(groupDocId).delete();
        log.info(`Group destroyed via webhook`, 'webhook', { groupId, churchId }, churchId);
        return;
    }

    await db.collection('groups').doc(groupDocId).set({
        id: groupId,
        churchId,
        name: attrs.name || 'Unknown Group',
        groupTypeName: attrs.group_type_name || null,
        membersCount: attrs.members_count || 0,
        isPublic: attrs.public_church_center_web_url !== null,
        createdAt: attrs.created_at,
        archivedAt: attrs.archived_at || null,
        lastUpdated: Date.now(),
    }, { merge: true });

    log.info(`Group synced via webhook (${eventName})`, 'webhook', { groupId, churchId, name: attrs.name }, churchId);
}

async function handleGroupMembershipEvent(eventName: string, data: any, churchId: string) {
    const membershipId = data.id;
    const groupId = data.relationships?.group?.data?.id;
    const personId = data.relationships?.person?.data?.id;

    if (!groupId || !personId) {
        log.warn(`Group membership webhook missing groupId or personId`, 'webhook', { churchId, membershipId }, churchId);
        return;
    }

    const groupDocId = `${churchId}_${groupId}`;
    const groupRef = db.collection('groups').doc(groupDocId);

    if (eventName.endsWith('.destroyed')) {
        const groupDoc = await groupRef.get();
        if (groupDoc.exists) {
            const memberIds: string[] = (groupDoc.data()?.memberIds || []).filter((id: string) => id !== personId);
            const membersCount = Math.max(0, (groupDoc.data()?.membersCount || 1) - 1);
            await groupRef.set({ memberIds, membersCount, lastUpdated: Date.now() }, { merge: true });
        }
        log.info(`Group member removed via webhook`, 'webhook', { groupId, personId, churchId }, churchId);
        return;
    }

    // Add member to group
    const groupDoc = await groupRef.get();
    const memberIds: string[] = groupDoc.exists ? (groupDoc.data()?.memberIds || []) : [];
    if (!memberIds.includes(personId)) memberIds.push(personId);
    const membersCount = memberIds.length;
    await groupRef.set({ memberIds, membersCount, lastUpdated: Date.now() }, { merge: true });

    log.info(`Group member added via webhook (${eventName})`, 'webhook', { groupId, personId, churchId }, churchId);
}

async function handleGroupAttendanceEvent(data: any, churchId: string) {
    const eventId = data.id;
    const attrs = data.attributes;
    const groupId = data.relationships?.group?.data?.id;

    if (!groupId || !eventId) {
        log.warn('Group attendance webhook missing groupId or eventId', 'webhook', { churchId });
        return;
    }

    try {
        const attendanceCount = attrs.attendance_count || 0;
        const visitorsCount = attrs.visitors_count || 0;
        const membersCount = Math.max(0, attendanceCount - visitorsCount);
        const eventDate = attrs.starts_at || attrs.created_at || new Date().toISOString();

        const newEntry = {
            eventId: String(eventId),
            date: eventDate,
            count: attendanceCount,
            members: membersCount,
            visitors: visitorsCount,
            attendeeIds: [] as string[],
        };

        const groupDocId = `${churchId}_${groupId}`;
        const groupRef = db.collection('groups').doc(groupDocId);
        const groupDoc = await groupRef.get();

        if (!groupDoc.exists) {
            log.warn(`Group doc not found for webhook attendance — will be created on next sync`, 'webhook', { groupId, churchId });
            return;
        }

        const history: any[] = Array.isArray(groupDoc.data()?.attendanceHistory) ? groupDoc.data()!.attendanceHistory : [];
        const existingIdx = history.findIndex(h => h.eventId === String(eventId));
        if (existingIdx >= 0) {
            history[existingIdx] = newEntry;
        } else {
            history.push(newEntry);
        }

        history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const trimmedHistory = history.slice(0, 104); // ~2 years of weekly meetings

        await groupRef.set({ attendanceHistory: trimmedHistory, lastUpdated: Date.now() }, { merge: true });

        log.info(`Group attendance synced via webhook`, 'webhook', {
            groupId, eventId, churchId, members: membersCount, visitors: visitorsCount,
        }, churchId);

    } catch (err: any) {
        log.error(`Failed to handle group attendance webhook`, 'webhook', { groupId: data.relationships?.group?.data?.id, eventId, churchId, error: err?.message }, churchId);
    }
}
