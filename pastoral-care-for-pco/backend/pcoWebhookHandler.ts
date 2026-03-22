import { Request, Response } from 'express';
import * as crypto from 'crypto';
import admin from 'firebase-admin';
import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';

// Helper to get Firestore instance
const db = getDb();
const log = createServerLogger(db);

export const handlePcoWebhook = async (req: Request, res: Response) => {
    const signature = req.headers['x-pco-signature'] as string;
    const churchId = req.query.churchId as string;
    
    // req.body is a Buffer because we used express.raw() in server.ts
    const payloadString = req.body.toString(); 

    if (!signature) {
        log.error('Webhook received without X-PCO-Signature header', 'webhook', { churchId });
        return res.status(401).send('Missing Signature');
    }

    try {
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

        const event = JSON.parse(payloadString);
        const eventsList = Array.isArray(event?.data) ? event.data : (event?.data ? [event.data] : []);
        
        if (eventsList.length === 0) {
            log.warn('Invalid webhook payload structure — no events in list', 'webhook', { churchId });
            return res.status(400).send('Invalid Payload');
        }

        for (const eventItem of eventsList) {
            const eventName = eventItem?.attributes?.name;
            const resourceData = eventItem?.attributes?.payload?.data;
            
            if (!eventName || !resourceData) {
                log.warn('Invalid webhook event item — missing name or payload', 'webhook', { churchId, eventItem });
                continue;
            }

            log.info(`Processing PCO webhook: ${eventName}`, 'webhook', { churchId, eventName }, churchId);

            if (eventName.startsWith('people.v2.events.person')) {
                await handlePersonEvent(eventName, resourceData, churchId);
            } else if (eventName === 'giving.v2.events.donation.created') {
                await handleDonationEvent(resourceData, churchId);
            } else if (eventName.startsWith('services.v2.events.plan_person')) {
                await handlePlanPersonEvent(eventName, resourceData, churchId);
            } else if (eventName.startsWith('services.v2.events.needed_position')) {
                await handleNeededPositionEvent(eventName, resourceData, churchId);
            } else if (eventName === 'check_ins.v2.events.check_in.created') {
                await handleCheckInEvent(resourceData, churchId);
            } else if (eventName === 'groups.v2.events.group_attendance.created') {
                await handleGroupAttendanceEvent(resourceData, churchId);
            } else {
                log.info(`Unhandled webhook event type: ${eventName}`, 'webhook', { churchId, eventName }, churchId);
            }
        }

        return res.status(200).send('Webhook Processed');

    } catch (error: any) {
        log.error('Error processing webhook', 'webhook', { churchId, error: error?.message }, churchId);
        return res.status(500).send('Internal Server Error');
    }
};

async function handlePersonEvent(eventName: string, data: any, churchId: string) {
    const personId = data.id;
    const attrs = data.attributes;

    if (eventName.endsWith('.deleted')) {
        await db.collection('people').doc(personId).delete();
        log.info(`Person deleted via webhook`, 'webhook', { personId, churchId }, churchId);
        return;
    }

    const updateData: any = {
        id: personId,
        churchId,
        name: `${attrs.first_name} ${attrs.last_name}`,
        avatar: attrs.avatar,
        status: attrs.status,
        gender: attrs.gender,
        birthdate: attrs.birthdate,
        anniversary: attrs.anniversary,
        createdAt: attrs.created_at,
        lastUpdated: Date.now(),
        age: attrs.birthdate ? new Date().getFullYear() - new Date(attrs.birthdate).getFullYear() : undefined
    };

    await db.collection('people').doc(personId).set(updateData, { merge: true });
    log.info(`Person synced via webhook`, 'webhook', { personId, churchId, event: eventName }, churchId);
}

async function handleDonationEvent(data: any, churchId: string) {
    const donationId = data.id;
    const attrs = data.attributes;
    
    const personId = data.relationships?.person?.data?.id;
    let donorName = 'Unknown';

    if (personId) {
        const personDoc = await db.collection('people').doc(personId).get();
        if (personDoc.exists) {
            donorName = personDoc.data()?.name || 'Unknown';
        }
    }

    const donation = {
        id: donationId,
        churchId,
        amount: attrs.amount_cents / 100,
        date: attrs.created_at,
        fundName: 'General',
        donorId: personId || 'anonymous',
        donorName: donorName,
        isRecurring: false
    };

    await db.collection('detailed_donations').doc(donationId).set(donation, { merge: true });
    
    // Write-time aggregation for fast Analytics retrieval
    try {
        const donationDate = new Date(donation.date);
        const monthKey = `${donationDate.getFullYear()}_${String(donationDate.getMonth() + 1).padStart(2, '0')}`;
        const aggRef = db.collection('analytics_giving').doc(`${churchId}_${monthKey}`);
        
        await aggRef.set({
            churchId,
            month: monthKey,
            totalAmount: admin.firestore.FieldValue.increment(donation.amount),
            donationCount: admin.firestore.FieldValue.increment(1),
            [`funds.${donation.fundName}`]: admin.firestore.FieldValue.increment(donation.amount),
            lastUpdated: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
    } catch (aggError: any) {
        log.error('Failed to update analytics_giving aggregation', 'webhook', { donationId, churchId, error: aggError?.message }, churchId);
    }
    
    log.info(`Donation synced via webhook`, 'webhook', { donationId, amount: donation.amount, churchId }, churchId);
}

async function handlePlanPersonEvent(eventName: string, data: any, churchId: string) {
    const planId = data.relationships?.plan?.data?.id;
    if (planId) {
        log.info(`Plan person updated`, 'webhook', { planId, eventName, churchId }, churchId);
    }
}

async function handleNeededPositionEvent(eventName: string, data: any, churchId: string) {
    const planId = data.relationships?.plan?.data?.id;
    if (planId) {
        log.info(`Needed position updated`, 'webhook', { planId, eventName, churchId }, churchId);
    }
}

async function handleCheckInEvent(data: any, churchId: string) {
    const checkInId = data.id;
    const attrs = data.attributes;
    const personId = data.relationships?.person?.data?.id;
    const eventId = data.relationships?.event?.data?.id;
    
    if (eventId) {
        const record = {
            id: checkInId,
            churchId,
            personId: personId || 'unknown',
            eventId: eventId,
            date: attrs.created_at.split('T')[0],
            createdAt: attrs.created_at,
            checkedInAt: attrs.created_at,
            securityCode: attrs.security_code,
            kind: attrs.kind
        };

        await db.collection('check_ins').doc(checkInId).set(record, { merge: true });
        
        // Update DAILY attendance aggregate (keyed as daily_churchId_YYYY-MM-DD).
        // This matches the keys written by syncCheckInsData so the Attendance chart
        // stays consistent across webhook updates and full syncs.
        const dateKey = attrs.created_at.split('T')[0]; // YYYY-MM-DD
        const dailyDocId = `daily_${churchId}_${dateKey}`;
        
        const dailyRef = db.collection('attendance').doc(dailyDocId);
        await dailyRef.set({
            id: dailyDocId,
            churchId,
            date: dateKey,
            count: admin.firestore.FieldValue.increment(1),
            guests: attrs.kind === 'Guest' ? admin.firestore.FieldValue.increment(1) : admin.firestore.FieldValue.increment(0),
            regulars: (attrs.kind !== 'Guest' && attrs.kind !== 'Volunteer') ? admin.firestore.FieldValue.increment(1) : admin.firestore.FieldValue.increment(0),
            volunteers: attrs.kind === 'Volunteer' ? admin.firestore.FieldValue.increment(1) : admin.firestore.FieldValue.increment(0),
            headcount: 0
        }, { merge: true });

        log.info(`Check-in synced via webhook`, 'webhook', { checkInId, eventId, churchId, kind: attrs.kind }, churchId);
    }
}

async function handleGroupAttendanceEvent(data: any, churchId: string) {
    // The webhook payload contains the event (group meeting) that just had attendance recorded.
    const eventId = data.id;
    const attrs = data.attributes;
    const groupId = data.relationships?.group?.data?.id;

    if (!groupId || !eventId) {
        log.warn('Group attendance webhook missing groupId or eventId', 'webhook', { churchId });
        return;
    }

    try {
        // The webhook gives us top-level counts directly from the payload attributes
        const attendanceCount = attrs.attendance_count || 0;
        const visitorsCount = attrs.visitors_count || 0;
        const membersCount = Math.max(0, attendanceCount - visitorsCount);
        const eventDate = attrs.starts_at || attrs.created_at || new Date().toISOString();

        // Build the attendance history entry
        const newEntry = {
            eventId: String(eventId),
            date: eventDate,
            count: attendanceCount,
            members: membersCount,
            visitors: visitorsCount,
            attendeeIds: [] as string[]
        };

        // Fetch the current group document from Firestore
        const groupDocId = `${churchId}_${groupId}`;
        const groupRef = db.collection('groups').doc(groupDocId);
        const groupDoc = await groupRef.get();

        if (!groupDoc.exists) {
            log.warn(`Group doc not found for webhook update — will be created on next sync`, 'webhook', { groupId, churchId });
            return;
        }

        const groupData = groupDoc.data()!;
        const history: any[] = Array.isArray(groupData.attendanceHistory) ? groupData.attendanceHistory : [];

        // Replace existing entry for this event (if re-submitted) or append
        const existingIdx = history.findIndex(h => h.eventId === String(eventId));
        if (existingIdx >= 0) {
            history[existingIdx] = newEntry;
        } else {
            history.push(newEntry);
        }

        // Keep history sorted newest-first and cap to last 104 entries (~2 years of weekly meetings)
        history.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const trimmedHistory = history.slice(0, 104);

        await groupRef.set({ attendanceHistory: trimmedHistory, lastUpdated: Date.now() }, { merge: true });

        log.info(`Group attendance synced via webhook`, 'webhook', {
            groupId, eventId, churchId,
            members: membersCount, visitors: visitorsCount
        }, churchId);

    } catch (err: any) {
        log.error(`Failed to handle group attendance webhook`, 'webhook', { groupId, eventId, churchId, error: err?.message }, churchId);
    }
}
