/**
 * Seed script: Populate Tenant C1 ("Grace Community") with rich SMS demo data.
 *
 * Covers every SMS area of the MessagingModule:
 *   ✅  smsNumbers        — 2 phone numbers (Main Line + Youth Line)
 *   ✅  smsCampaigns      — 3 campaigns (sent, scheduled, draft)
 *   ✅  smsConversations  — 5 inbox threads with messages subcollection
 *   ✅  smsKeywords       — 4 keywords (YOUTH, PRAYER, GIVE, INFO)
 *   ✅  smsTags           — 4 tags (Prayer Request, New Visitor, Follow-Up, Volunteer)
 *   ✅  smsWorkflows      — 2 workflows (New Visitor, Birthday)
 *   ✅  smsOptOuts        — 2 opt-out records
 *   ✅  churches doc      — enables smsSettings.smsEnabled + populates church info
 *
 * Run with:
 *   npx tsx backend/scripts/seed-c1-sms-demo.ts
 */

import { getDb } from '../firebase';

const CHURCH_ID = 'c1';
const NOW = Date.now();
const DAY = 86_400_000;

// ──────────────────────────────────────────────────────────────────────────────
// Helpers
// ──────────────────────────────────────────────────────────────────────────────
function msAgo(days: number) { return NOW - days * DAY; }
function msFuture(days: number) { return NOW + days * DAY; }

async function upsert(db: FirebaseFirestore.Firestore, col: string, id: string, data: Record<string, unknown>) {
    await db.collection(col).doc(id).set(data, { merge: true });
    console.log(`  ✔ ${col}/${id}`);
}

// ──────────────────────────────────────────────────────────────────────────────
// Main seed
// ──────────────────────────────────────────────────────────────────────────────
async function seed() {
    const db = getDb();
    console.log(`\n🌱  Seeding SMS demo data for church: ${CHURCH_ID}\n`);

    // ── 1. Enable SMS on the church document ──────────────────────────────────
    console.log('── Church settings ──');
    await upsert(db, 'churches', CHURCH_ID, {
        id: CHURCH_ID,
        name: 'Grace Community',
        subdomain: 'grace',
        pcoConnected: true,
        smsSettings: {
            smsEnabled: true,
            senderName: 'Grace Community',
            prefixMessagesWithName: true,
            messageFooter: 'Reply STOP to unsubscribe.',
            smsAgentEnabled: true,
            prayerDetectionEnabled: true,
        },
    });

    // ── 2. SMS Numbers ────────────────────────────────────────────────────────
    console.log('\n── smsNumbers ──');

    const mainNumberId = `${CHURCH_ID}_main`;
    const youthNumberId = `${CHURCH_ID}_youth`;

    await upsert(db, 'smsNumbers', mainNumberId, {
        id: mainNumberId,
        churchId: CHURCH_ID,
        phoneNumber: '+15550010001',
        phoneSid: 'PNdemo0000000000000000000000main1',
        friendlyLabel: 'Main Office',
        isDefault: true,
        smsEnabled: true,
        allowedUserIds: [],
        campaignAssigned: true,
        campaignAssignmentStatus: 'approved',
        createdAt: msAgo(90),
        updatedAt: msAgo(30),
    });

    await upsert(db, 'smsNumbers', youthNumberId, {
        id: youthNumberId,
        churchId: CHURCH_ID,
        phoneNumber: '+15550010002',
        phoneSid: 'PNdemo0000000000000000000000youth',
        friendlyLabel: 'Youth Ministry',
        isDefault: false,
        smsEnabled: true,
        allowedUserIds: [],
        campaignAssigned: true,
        campaignAssignmentStatus: 'approved',
        createdAt: msAgo(60),
        updatedAt: msAgo(10),
    });

    // ── 3. SMS Tags ───────────────────────────────────────────────────────────
    console.log('\n── smsTags ──');

    const tagPrayer = `${CHURCH_ID}_tag_prayer`;
    const tagNewVisitor = `${CHURCH_ID}_tag_newvisitor`;
    const tagFollowUp = `${CHURCH_ID}_tag_followup`;
    const tagVolunteer = `${CHURCH_ID}_tag_volunteer`;

    await upsert(db, 'smsTags', tagPrayer, {
        id: tagPrayer,
        churchId: CHURCH_ID,
        name: 'Prayer Request',
        emoji: '🙏',
        color: 'violet',
        detectionEnabled: true,
        detectionPhrases: 'pray for me,prayer request,please pray,i need prayer,struggling',
        autoReplyMessage: 'Thank you for reaching out. We will be praying for you! 🙏 Someone from our pastoral team will follow up soon.',
        createdAt: msAgo(60),
    });

    await upsert(db, 'smsTags', tagNewVisitor, {
        id: tagNewVisitor,
        churchId: CHURCH_ID,
        name: 'New Visitor',
        emoji: '👋',
        color: 'emerald',
        detectionEnabled: false,
        createdAt: msAgo(60),
    });

    await upsert(db, 'smsTags', tagFollowUp, {
        id: tagFollowUp,
        churchId: CHURCH_ID,
        name: 'Needs Follow-Up',
        emoji: '📌',
        color: 'amber',
        detectionEnabled: false,
        createdAt: msAgo(45),
    });

    await upsert(db, 'smsTags', tagVolunteer, {
        id: tagVolunteer,
        churchId: CHURCH_ID,
        name: 'Volunteer Interest',
        emoji: '🙌',
        color: 'blue',
        detectionEnabled: true,
        detectionPhrases: 'volunteer,help out,serve,serving,sign up to help',
        autoReplyMessage: 'Thank you for your heart to serve! 🙌 We\'ll send you info on our next volunteer orientation.',
        createdAt: msAgo(45),
    });

    // ── 4. SMS Keywords ───────────────────────────────────────────────────────
    console.log('\n── smsKeywords ──');

    const kwYouth = `${CHURCH_ID}_kw_youth`;
    const kwPrayer = `${CHURCH_ID}_kw_prayer`;
    const kwGive = `${CHURCH_ID}_kw_give`;
    const kwInfo = `${CHURCH_ID}_kw_info`;

    await upsert(db, 'smsKeywords', kwYouth, {
        id: kwYouth,
        churchId: CHURCH_ID,
        keyword: 'YOUTH',
        replyMessage: 'Thanks for connecting with Grace Youth! 🎉 Our next event is Friday at 6:30 PM. Visit gracecc.com/youth for the full schedule.',
        actionType: 'small_groups',
        addToListId: null,
        addToListName: null,
        autoTagIds: [tagNewVisitor],
        twilioNumberId: youthNumberId,
        numberIds: [youthNumberId],
        isActive: true,
        matchCount: 47,
        createdAt: msAgo(45),
    });

    await upsert(db, 'smsKeywords', kwPrayer, {
        id: kwPrayer,
        churchId: CHURCH_ID,
        keyword: 'PRAYER',
        replyMessage: 'We\'d love to pray with you! 🙏 Our pastoral team receives your request and will be praying. You can also join our live prayer line Tuesdays at 7 PM.',
        actionType: 'static',
        addToListId: null,
        addToListName: null,
        autoTagIds: [tagPrayer],
        twilioNumberId: mainNumberId,
        numberIds: [mainNumberId, youthNumberId],
        isActive: true,
        matchCount: 93,
        createdAt: msAgo(60),
    });

    await upsert(db, 'smsKeywords', kwGive, {
        id: kwGive,
        churchId: CHURCH_ID,
        keyword: 'GIVE',
        replyMessage: 'Thank you for your generous gift! 🎁 Give online at gracecc.com/give or text the amount (e.g. "50") to this number. Reply STOP to unsubscribe.',
        actionType: 'giving_ytd',
        addToListId: null,
        addToListName: null,
        autoTagIds: [],
        twilioNumberId: mainNumberId,
        numberIds: [mainNumberId],
        isActive: true,
        matchCount: 128,
        createdAt: msAgo(90),
    });

    await upsert(db, 'smsKeywords', kwInfo, {
        id: kwInfo,
        churchId: CHURCH_ID,
        keyword: 'INFO',
        replyMessage: '⛪ Grace Community Church\n📍 123 Grace Ave, Springfield, TX 75001\n⏰ Sundays 9 AM & 11 AM | Wednesdays 7 PM\n🌐 gracecc.com | 📞 (555) 001-0001',
        actionType: 'static',
        addToListId: null,
        addToListName: null,
        autoTagIds: [],
        twilioNumberId: null,
        numberIds: [],
        isActive: true,
        matchCount: 211,
        createdAt: msAgo(90),
    });

    // ── 5. SMS Campaigns ──────────────────────────────────────────────────────
    console.log('\n── smsCampaigns ──');

    const campSent = `${CHURCH_ID}_camp_easter`;
    const campScheduled = `${CHURCH_ID}_camp_mothers`;
    const campDraft = `${CHURCH_ID}_camp_summer`;

    await upsert(db, 'smsCampaigns', campSent, {
        id: campSent,
        churchId: CHURCH_ID,
        name: 'Easter Sunday Reminder',
        status: 'sent',
        channelType: 'sms',
        body: '🌅 Easter Sunday is this week at Grace Community! Join us at 9 AM or 11 AM — {firstName}, we\'d love to worship with you. Invite a friend! gracecc.com',
        toListId: 'pco_list_all_members',
        toListName: 'All Members',
        toGroupId: null,
        toGroupName: null,
        sentAt: msAgo(14),
        scheduledAt: null,
        recipientCount: 847,
        deliveredCount: 831,
        failedCount: 16,
        optOutCount: 3,
        sentBy: 'user_demo_admin',
        sentByName: 'Pastor James',
        twilioNumberId: mainNumberId,
        createdAt: msAgo(21),
        updatedAt: msAgo(14),
    });

    await upsert(db, 'smsCampaigns', campScheduled, {
        id: campScheduled,
        churchId: CHURCH_ID,
        name: "Mother's Day Celebration",
        status: 'scheduled',
        channelType: 'sms',
        body: "Happy Mother's Day! 🌸 We're celebrating all the incredible moms at Grace this Sunday. Special gift for every mom at both services. See you there! — Grace Community",
        toListId: 'pco_list_women',
        toListName: 'Women\'s Ministry List',
        toGroupId: null,
        toGroupName: null,
        sentAt: null,
        scheduledAt: msFuture(5),
        sendAt: new Date(msFuture(5)).toISOString(),
        recipientCount: null,
        deliveredCount: null,
        failedCount: null,
        optOutCount: null,
        sentBy: 'user_demo_admin',
        sentByName: 'Sarah M.',
        twilioNumberId: mainNumberId,
        createdAt: msAgo(3),
        updatedAt: msAgo(3),
    });

    await upsert(db, 'smsCampaigns', campDraft, {
        id: campDraft,
        churchId: CHURCH_ID,
        name: 'Summer VBS Announcement',
        status: 'draft',
        channelType: 'sms',
        body: "📣 Summer VBS is coming! June 16–20 for kids ages 4–12. Registration is open at gracecc.com/vbs. Spots fill fast — sign up today!",
        toListId: null,
        toListName: null,
        toGroupId: null,
        toGroupName: null,
        sentAt: null,
        scheduledAt: null,
        recipientCount: null,
        deliveredCount: null,
        failedCount: null,
        optOutCount: null,
        sentBy: 'user_demo_admin',
        sentByName: 'Pastor James',
        twilioNumberId: mainNumberId,
        createdAt: msAgo(1),
        updatedAt: msAgo(1),
    });

    // ── 6. SMS Conversations + messages sub-collection ────────────────────────
    console.log('\n── smsConversations (+ messages) ──');

    const conversations = [
        {
            id: `${CHURCH_ID}_15550020001`,
            phoneNumber: '+15550020001',
            personName: 'Marcus Thompson',
            personId: 'pco_person_001',
            personAvatar: null,
            lastMessageBody: 'Thank you so much, see you Sunday!',
            lastMessageDirection: 'inbound',
            lastMessageAt: msAgo(0.05),
            unreadCount: 1,
            isOptedOut: false,
            tags: [tagNewVisitor],
            twilioNumberId: mainNumberId,
            inboxId: mainNumberId,
            messages: [
                { direction: 'inbound', body: 'INFO', status: 'received', createdAt: msAgo(2) },
                {
                    direction: 'outbound',
                    body: '⛪ Grace Community Church\n📍 123 Grace Ave, Springfield, TX 75001\n⏰ Sundays 9 AM & 11 AM | Wednesdays 7 PM\n🌐 gracecc.com | 📞 (555) 001-0001',
                    status: 'delivered',
                    sentByName: 'Auto-reply',
                    createdAt: msAgo(1.99),
                },
                { direction: 'inbound', body: 'Is there parking available?', status: 'received', createdAt: msAgo(1.8) },
                {
                    direction: 'outbound',
                    body: 'Yes! We have a large free parking lot right on site. Accessible spots are near the main entrance. See you Sunday! 😊',
                    status: 'delivered',
                    sentByName: 'Pastor James',
                    createdAt: msAgo(1.75),
                },
                { direction: 'inbound', body: 'Thank you so much, see you Sunday!', status: 'received', createdAt: msAgo(0.05) },
            ],
        },
        {
            id: `${CHURCH_ID}_15550020002`,
            phoneNumber: '+15550020002',
            personName: 'Lisa Chen',
            personId: 'pco_person_002',
            personAvatar: null,
            lastMessageBody: 'PRAYER',
            lastMessageDirection: 'inbound',
            lastMessageAt: msAgo(0.3),
            unreadCount: 2,
            isOptedOut: false,
            tags: [tagPrayer, tagFollowUp],
            twilioNumberId: mainNumberId,
            inboxId: mainNumberId,
            messages: [
                { direction: 'inbound', body: 'PRAYER', status: 'received', createdAt: msAgo(0.5) },
                {
                    direction: 'outbound',
                    body: 'We\'d love to pray with you! 🙏 Our pastoral team receives your request and will be praying. You can also join our live prayer line Tuesdays at 7 PM.',
                    status: 'delivered',
                    sentByName: 'Auto-reply',
                    createdAt: msAgo(0.49),
                },
                { direction: 'inbound', body: 'My mom is in the hospital. Will you pray for her healing?', status: 'received', createdAt: msAgo(0.3) },
            ],
        },
        {
            id: `${CHURCH_ID}_15550020003`,
            phoneNumber: '+15550020003',
            personName: 'James & Ruth Okafor',
            personId: 'pco_person_003',
            personAvatar: null,
            lastMessageBody: 'Perfect, we appreciate you!',
            lastMessageDirection: 'inbound',
            lastMessageAt: msAgo(3),
            unreadCount: 0,
            isOptedOut: false,
            tags: [],
            twilioNumberId: mainNumberId,
            inboxId: mainNumberId,
            messages: [
                { direction: 'inbound', body: 'Hi, what time is the Saturday service?', status: 'received', createdAt: msAgo(5) },
                {
                    direction: 'outbound',
                    body: 'Hi! We actually meet Sundays at 9 AM and 11 AM. Our Wednesday evening service is at 7 PM. Is there a particular service that works best for you?',
                    status: 'delivered',
                    sentByName: 'Sarah M.',
                    createdAt: msAgo(4.9),
                },
                { direction: 'inbound', body: 'Sunday 11am works great, thank you', status: 'received', createdAt: msAgo(4.5) },
                {
                    direction: 'outbound',
                    body: 'Wonderful! We look forward to seeing you. The 11 AM service is in the main sanctuary. If you have any questions before then, just reply here! 😊',
                    status: 'delivered',
                    sentByName: 'Sarah M.',
                    createdAt: msAgo(4.45),
                },
                { direction: 'inbound', body: 'Perfect, we appreciate you!', status: 'received', createdAt: msAgo(3) },
            ],
        },
        {
            id: `${CHURCH_ID}_15550020004`,
            phoneNumber: '+15550020004',
            personName: 'Destiny Williams',
            personId: 'pco_person_004',
            personAvatar: null,
            lastMessageBody: 'YOUTH',
            lastMessageDirection: 'inbound',
            lastMessageAt: msAgo(0.8),
            unreadCount: 1,
            isOptedOut: false,
            tags: [tagNewVisitor],
            twilioNumberId: youthNumberId,
            inboxId: youthNumberId,
            messages: [
                { direction: 'inbound', body: 'YOUTH', status: 'received', createdAt: msAgo(0.9) },
                {
                    direction: 'outbound',
                    body: 'Thanks for connecting with Grace Youth! 🎉 Our next event is Friday at 6:30 PM. Visit gracecc.com/youth for the full schedule.',
                    status: 'delivered',
                    sentByName: 'Auto-reply',
                    createdAt: msAgo(0.89),
                },
                { direction: 'inbound', body: 'Awesome! How old do you have to be?', status: 'received', createdAt: msAgo(0.8) },
            ],
        },
        {
            id: `${CHURCH_ID}_15550020005`,
            phoneNumber: '+15550020005',
            personName: 'Robert Park',
            personId: 'pco_person_005',
            personAvatar: null,
            lastMessageBody: "I'd love to get more info about volunteering on Sundays.",
            lastMessageDirection: 'inbound',
            lastMessageAt: msAgo(1.5),
            unreadCount: 1,
            isOptedOut: false,
            tags: [tagVolunteer],
            twilioNumberId: mainNumberId,
            inboxId: mainNumberId,
            messages: [
                {
                    direction: 'inbound',
                    body: "I'd love to get more info about volunteering on Sundays.",
                    status: 'received',
                    createdAt: msAgo(1.5),
                },
            ],
        },
    ] as const;

    for (const conv of conversations) {
        const { messages, ...convData } = conv;
        await upsert(db, 'smsConversations', convData.id, {
            ...convData,
            createdAt: (messages[0] as any).createdAt,
        });

        // Seed messages in the subcollection
        for (let i = 0; i < messages.length; i++) {
            const msg = messages[i] as any;
            const msgId = `${convData.id}_msg${i}`;
            await upsert(db, `smsConversations/${convData.id}/messages`, msgId, {
                id: msgId,
                conversationId: convData.id,
                churchId: CHURCH_ID,
                direction: msg.direction,
                body: msg.body,
                status: msg.status,
                sentByName: msg.sentByName ?? null,
                sentBy: null,
                campaignId: null,
                mediaUrls: [],
                messageSid: `SM_demo_${msgId}`,
                createdAt: msg.createdAt,
                deliveredAt: msg.direction === 'outbound' ? msg.createdAt + 5000 : null,
            });
        }
    }

    // ── 7. SMS Workflows ──────────────────────────────────────────────────────
    console.log('\n── smsWorkflows ──');

    const wfNewVisitor = `${CHURCH_ID}_wf_newvisitor`;
    const wfBirthday = `${CHURCH_ID}_wf_birthday`;

    const uuid = (n: number) => `demo-workflow-step-${n.toString().padStart(4, '0')}`;

    await upsert(db, 'smsWorkflows', wfNewVisitor, {
        id: wfNewVisitor,
        churchId: CHURCH_ID,
        name: 'New Visitor Welcome Series',
        description: 'Three-touch SMS sequence for first-time guests who text INFO or YOUTH.',
        trigger: 'keyword',
        triggerKeywordId: kwInfo,
        triggerKeywordWord: 'INFO',
        twilioNumberId: mainNumberId,
        isActive: true,
        enrolledCount: 34,
        completedCount: 28,
        allowReentry: false,
        steps: [
            {
                id: uuid(1),
                order: 0,
                delayDays: 0,
                delayHours: 0,
                channelType: 'sms',
                message: "Hi {firstName}! 👋 Welcome to Grace Community. We're so glad you reached out. Is there anything specific you'd like to know about our church?",
                scheduleType: 'relative',
            },
            {
                id: uuid(2),
                order: 1,
                delayDays: 3,
                delayHours: 0,
                channelType: 'sms',
                message: 'Hi {firstName}, just checking in! 😊 This Sunday we\'d love to have you join us — 9 AM or 11 AM. Let us know if you have any questions!',
                scheduleType: 'relative',
            },
            {
                id: uuid(3),
                order: 2,
                delayDays: 7,
                delayHours: 0,
                channelType: 'sms',
                message: '{firstName}, our Connection Team would love to meet you in person! 🤝 Stop by the Welcome Center this Sunday for a free gift and a church tour.',
                scheduleType: 'relative',
            },
        ],
        createdAt: msAgo(30),
        updatedAt: msAgo(7),
    });

    await upsert(db, 'smsWorkflows', wfBirthday, {
        id: wfBirthday,
        churchId: CHURCH_ID,
        name: 'Birthday Blessing',
        description: 'Send a warm birthday message to every church member on their special day.',
        trigger: 'birthday',
        triggerDayOffset: 0,
        triggerTime: '09:00',
        twilioNumberId: mainNumberId,
        isActive: true,
        enrolledCount: 412,
        completedCount: 389,
        allowReentry: true,
        steps: [
            {
                id: uuid(10),
                order: 0,
                delayDays: 0,
                delayHours: 0,
                channelType: 'sms',
                message: '🎂 Happy Birthday, {firstName}! From all of us at Grace Community — may this be your best year yet. You are loved and celebrated today! 🎉🙏',
                scheduleType: 'relative',
            },
        ],
        createdAt: msAgo(60),
        updatedAt: msAgo(14),
    });

    // ── 8. SMS Opt-Outs ───────────────────────────────────────────────────────
    console.log('\n── smsOptOuts ──');

    await upsert(db, 'smsOptOuts', `${CHURCH_ID}_15550029901`, {
        id: `${CHURCH_ID}_15550029901`,
        churchId: CHURCH_ID,
        phoneNumber: '+15550029901',
        optedOutAt: msAgo(10),
        campaignId: campSent,
        source: 'STOP_reply',
    });

    await upsert(db, 'smsOptOuts', `${CHURCH_ID}_15550029902`, {
        id: `${CHURCH_ID}_15550029902`,
        churchId: CHURCH_ID,
        phoneNumber: '+15550029902',
        optedOutAt: msAgo(25),
        campaignId: null,
        source: 'manual',
    });

    // ── Done ──────────────────────────────────────────────────────────────────
    console.log('\n✅  Seeding complete! Tenant C1 SMS demo data is ready.\n');
    process.exit(0);
}

seed().catch(e => {
    console.error('\n❌  Error during seed:', e?.message || e);
    process.exit(1);
});
