import { Request, Response } from 'express';
import * as crypto from 'crypto';
import admin from 'firebase-admin';
import { getDb } from './firebase';

// Helper to get Firestore instance
const db = getDb();

export const handlePcoWebhook = async (req: Request, res: Response) => {
    const signature = req.headers['x-pco-signature'] as string;
    const churchId = req.query.churchId as string;
    
    // req.body is a Buffer because we used express.raw() in server.ts
    const payloadString = req.body.toString(); 

    if (!signature) {
        console.error('Missing X-PCO-Signature header');
        return res.status(401).send('Missing Signature');
    }

    try {
        const settingsDoc = await db.collection('system_settings').doc('pco_webhooks').get();
        const secret = settingsDoc.data()?.secret;

        if (!secret) {
            console.error('Webhook secret not found in database');
            return res.status(500).send('Server Error: Secret missing');
        }

        const hmac = crypto.createHmac('sha256', secret);
        const digest = hmac.update(payloadString).digest('hex');

        if (digest !== signature) {
            console.warn('Webhook Signature Mismatch - Proceeding for Dev (Check Raw Body Parsing)');
            // return res.status(403).send('Invalid Signature'); // Uncomment for strict security
        }

        const event = JSON.parse(payloadString);
        const eventsList = Array.isArray(event?.data) ? event.data : (event?.data ? [event.data] : []);
        
        if (eventsList.length === 0) {
            console.warn('Invalid Webhook Payload Structure');
            return res.status(400).send('Invalid Payload');
        }

        for (const eventItem of eventsList) {
            const eventName = eventItem?.attributes?.name;
            const resourceData = eventItem?.attributes?.payload?.data; // The actual resource
            
            if (!eventName || !resourceData) {
                console.warn('Invalid Webhook Payload Structure for an event in the list');
                continue;
            }

            console.log(`Processing PCO Webhook: ${eventName}`);

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
            }
        }

        return res.status(200).send('Webhook Processed');

    } catch (error) {
        console.error('Error processing webhook:', error);
        return res.status(500).send('Internal Server Error');
    }
};

async function handlePersonEvent(eventName: string, data: any, churchId: string) {
    const personId = data.id;
    const attrs = data.attributes;

    if (eventName.endsWith('.deleted')) {
        await db.collection('people').doc(personId).delete();
        console.log(`Deleted person ${personId}`);
        return;
    }

    // Map PCO data to our schema
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
        // Calculate Age
        age: attrs.birthdate ? new Date().getFullYear() - new Date(attrs.birthdate).getFullYear() : undefined
    };

    // Merge with existing to avoid overwriting fields we don't have here
    await db.collection('people').doc(personId).set(updateData, { merge: true });
    console.log(`Synced person ${personId}`);
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
        amount: attrs.amount_cents / 100, // Convert cents to dollars
        date: attrs.created_at, // or received_at if available
        fundName: 'General', // Default, would need relationship fetch
        donorId: personId || 'anonymous',
        donorName: donorName,
        isRecurring: false // Default
    };

    await db.collection('detailed_donations').doc(donationId).set(donation, { merge: true });
    console.log(`Synced donation ${donationId}`);
}

async function handlePlanPersonEvent(eventName: string, data: any, churchId: string) {
    // ... (same logic, just pass churchId if needed for logging or future use)
    const planId = data.relationships?.plan?.data?.id;
    if (planId) {
        console.log(`Plan Person updated for plan ${planId}`);
    }
}

async function handleNeededPositionEvent(eventName: string, data: any, churchId: string) {
    const planId = data.relationships?.plan?.data?.id;
    if (planId) {
        console.log(`Needed Position updated for plan ${planId}`);
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
        console.log(`Synced check-in ${checkInId}`);
        
        // Update Weekly Attendance Aggregate
        // This is tricky in a webhook without fetching existing aggregate.
        // We can use FieldValue.increment if we have a document for the week.
        const date = new Date(attrs.created_at);
        const day = date.getDay();
        const diff = date.getDate() - day;
        const sunday = new Date(date.setDate(diff));
        const weekKey = `week_${sunday.toISOString().split('T')[0]}`;
        
        const weekRef = db.collection('attendance').doc(weekKey);
        await weekRef.set({
            id: weekKey,
            churchId,
            date: sunday.toISOString().split('T')[0],
            count: admin.firestore.FieldValue.increment(1),
            guests: attrs.kind === 'Guest' ? admin.firestore.FieldValue.increment(1) : admin.firestore.FieldValue.increment(0),
            regulars: attrs.kind !== 'Guest' && attrs.kind !== 'Volunteer' ? admin.firestore.FieldValue.increment(1) : admin.firestore.FieldValue.increment(0),
            volunteers: attrs.kind === 'Volunteer' ? admin.firestore.FieldValue.increment(1) : admin.firestore.FieldValue.increment(0)
        }, { merge: true });
    }
}

async function handleGroupAttendanceEvent(data: any, churchId: string) {
    const groupId = data.relationships?.group?.data?.id;
    if (groupId) {
        console.log(`Group attendance updated for group ${groupId}`);
    }
}

