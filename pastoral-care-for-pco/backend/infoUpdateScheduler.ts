// ─── infoUpdateScheduler.ts ───────────────────────────────────────────────────
//
// 60-second polling scheduler for Church Helper campaigns.
// For each active people_info_campaign, fetches the PCO list, upserts sessions,
// and sends initial outreach to pending / due-for-retry people.
//
// Respects send window (start/end hour) via the existing getNextAllowedSmsTime
// utility from smsCampaignScheduler.ts.
// ─────────────────────────────────────────────────────────────────────────────

import { FieldValue } from 'firebase-admin/firestore';
import { createServerLogger } from '../services/logService';
import { fetchFromPco } from './publicApi';
import { sendIndividualInternal } from './smsSend';
import { getNextAllowedSmsTime } from './smsCampaignScheduler';

const POLL_INTERVAL_MS = 60_000;

// ─── Outreach message builder ─────────────────────────────────────────────────

function buildIntroMessage(campaign: any, personName: string, churchName: string, pcoValues: Record<string, string> = {}): string {
    const rawTemplate = campaign.messaging?.introMessage || 
        `Hi {{first_name}}! This is {{church_name}}. We're updating our church directory and would love to confirm a few details: {{fields_list}}. Reply to get started! Reply STOP to opt out.`;

    const fieldLabels = (campaign.fieldsToCollect || []).map((f: any) => f.label).join(', ');
    const firstName = personName.split(' ')[0] || personName;

    let message = rawTemplate
        .replace(/\{\{name\}\}/gi, personName)
        .replace(/\{\{first_name\}\}/gi, firstName)
        .replace(/\{\{full_name\}\}/gi, personName)
        .replace(/\{\{church_name\}\}/gi, churchName)
        .replace(/\{\{fields_list\}\}/gi, fieldLabels);

    // Merge field tags: {{phone_mobile}}, {{email_primary}}, {{address_home}}, {{birthdate}}, etc.
    const fieldTagMap: Record<string, string> = {
        phone_mobile: 'mobile_phone',
        phone_home: 'home_phone',
        email_primary: 'email',
        address_home: 'address',
        birthdate: 'birthday',
        anniversary: 'anniversary',
        marital_status: 'marital_status',
        gender: 'gender',
        graduation_year: 'graduation_year',
        school: 'school',
        membership: 'membership',
        emergency_contact: 'emergency_contact',
    };

    for (const [key, val] of Object.entries(pcoValues)) {
        const valStr = val || '(not on file)';
        // Match both exact key {{phone_mobile}} and friendly tag {{mobile_phone}} / {{address}} / {{email}}
        message = message.replace(new RegExp(`\{\{${key}\}\}`, 'gi'), valStr);
        const alias = fieldTagMap[key];
        if (alias) {
            message = message.replace(new RegExp(`\{\{${alias}\}\}`, 'gi'), valStr);
        }
    }

    // Replace any un-matched field tags with (not on file)
    message = message.replace(/\{\{[a-z0-9_]+\}\}/gi, '(not on file)');

    return message;
}

// ─── Per-campaign processing ──────────────────────────────────────────────────

async function processCampaign(db: any, log: any, campaign: any): Promise<void> {
    const { id: campaignId, churchId, pcoListId, schedule, channels } = campaign;

    // Load church info (name + timezone)
    const churchSnap = await db.collection('churches').doc(churchId).get();
    if (!churchSnap.exists) return;
    const church = churchSnap.data();
    const churchName = church.name || 'Our Church';
    const timeZone = church.timezone || 'America/Chicago';

    const now = Date.now();
    const windowStart = schedule?.sendWindowStart || '09:00';
    const windowEnd   = schedule?.sendWindowEnd   || '21:00';

    // 1. Check kickoff start date in the church's local timezone
    if (schedule?.startDate) {
        // Construct ISO string for kickoff date at the start of the send window in local time (e.g. 2026-07-25T09:00:00)
        const kickoffDateTimeStr = `${schedule.startDate}T${windowStart}:00`;
        const kickoffMs = new Date(kickoffDateTimeStr).getTime();

        if (now < kickoffMs) {
            log.info(`[InfoUpdateScheduler] Campaign ${campaignId} kickoff not yet reached (scheduled for ${schedule.startDate} at ${windowStart} in ${timeZone})`, 'system', { churchId }, churchId);
            return;
        }
    }

    // 2. Check current send window (start & end hour) in local time
    const { allowed } = getNextAllowedSmsTime(now, timeZone, windowStart, windowEnd);
    if (!allowed) {
        log.info(`[InfoUpdateScheduler] Outside send window for campaign ${campaignId} (${windowStart}–${windowEnd} ${timeZone})`, 'system', { churchId }, churchId);
        return;
    }

    // Fetch PCO list members (paginated)
    let allPeople: any[] = [];
    let nextUrl: string | null = `https://api.planningcenteronline.com/people/v2/lists/${pcoListId}/people?per_page=100&include=phone_numbers,emails`;
    while (nextUrl) {
        try {
            const data = await fetchFromPco(churchId, nextUrl);
            const people = data?.data || [];
            const included = data?.included || [];
            allPeople = [...allPeople, ...people.map((p: any) => ({ ...p, _included: included }))];
            nextUrl = data?.links?.next || null;
        } catch (e: any) {
            log.warn(`[InfoUpdateScheduler] PCO list fetch failed for campaign ${campaignId}: ${e.message}`, 'system', { churchId, campaignId }, churchId);
            return;
        }
    }

    log.info(`[InfoUpdateScheduler] Campaign ${campaignId} — ${allPeople.length} people in PCO list`, 'system', { churchId, campaignId }, churchId);

    for (const person of allPeople) {
        await processPersonForCampaign(db, log, campaign, person, churchName, timeZone);
    }

    // Check if campaign is fully complete
    const remaining = await db.collection('people_info_sessions')
        .where('campaignId', '==', campaignId)
        .where('status', 'in', ['pending', 'in_progress'])
        .limit(1)
        .get();
    if (remaining.empty) {
        await db.collection('people_info_campaigns').doc(campaignId).update({
            status: 'complete',
            completedAt: Date.now(),
        });
        log.info(`[InfoUpdateScheduler] Campaign ${campaignId} marked complete`, 'system', { churchId, campaignId }, churchId);
    }
}

async function processPersonForCampaign(
    db: any,
    log: any,
    campaign: any,
    pcoPerson: any,
    churchName: string,
    _timeZone: string,
): Promise<void> {
    const { id: campaignId, churchId, schedule, channels, fieldsToCollect } = campaign;
    const pcoPersonId = pcoPerson.id;
    const personName  = `${pcoPerson.attributes?.first_name || ''} ${pcoPerson.attributes?.last_name || ''}`.trim() || 'Friend';
    const included    = pcoPerson._included || [];

    // Resolve phone and email from PCO includes
    const phones = included.filter((i: any) => i.type === 'PhoneNumber' && pcoPerson.relationships?.phone_numbers?.data?.some((r: any) => r.id === i.id));
    const emails  = included.filter((i: any) => i.type === 'Email' && pcoPerson.relationships?.emails?.data?.some((r: any) => r.id === i.id));
    const mobilePhone = phones.find((p: any) => p.attributes?.location === 'Mobile') || phones[0];
    const primaryEmail = emails.find((e: any) => e.attributes?.primary) || emails[0];

    const phoneE164  = mobilePhone?.attributes?.number ? normaliseE164(mobilePhone.attributes.number) : null;
    const emailAddr  = primaryEmail?.attributes?.address?.toLowerCase().trim() || null;

    // Extract current values for all candidate fields from PCO person attributes & includes
    const pcoValues: Record<string, string> = {};
    if (phoneE164) pcoValues['phone_mobile'] = mobilePhone?.attributes?.number || '';
    const homePhone = phones.find((p: any) => p.attributes?.location === 'Home');
    if (homePhone?.attributes?.number) pcoValues['phone_home'] = homePhone.attributes.number;
    if (emailAddr) pcoValues['email_primary'] = primaryEmail?.attributes?.address || '';

    // Standard PCO person attributes
    const attrs = pcoPerson.attributes || {};
    if (attrs.birthdate) pcoValues['birthdate'] = attrs.birthdate;
    if (attrs.anniversary) pcoValues['anniversary'] = attrs.anniversary;
    if (attrs.marital_status) pcoValues['marital_status'] = attrs.marital_status;
    if (attrs.gender) pcoValues['gender'] = attrs.gender;
    if (attrs.graduation_year) pcoValues['graduation_year'] = String(attrs.graduation_year);
    if (attrs.school) pcoValues['school'] = attrs.school;
    if (attrs.membership) pcoValues['membership'] = attrs.membership;

    // Address
    const addresses = included.filter((i: any) => i.type === 'Address');
    if (addresses.length > 0) {
        const addr = addresses[0].attributes || {};
        const fullAddr = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean).join(', ');
        if (fullAddr) pcoValues['address_home'] = fullAddr;
    }

    // Determine initial remaining fields based on campaign fieldBehavior ('confirm_all' vs 'only_blank')
    const behavior = campaign.fieldBehavior || 'confirm_all';
    const allFieldKeys = (fieldsToCollect || []).map((f: any) => f.key);
    const initialRemainingFields = behavior === 'only_blank'
        ? allFieldKeys.filter((key: string) => !pcoValues[key] || !pcoValues[key].trim())
        : allFieldKeys;

    // Check for existing session
    const existingSnap = await db.collection('people_info_sessions')
        .where('campaignId', '==', campaignId)
        .where('pcoPersonId', '==', pcoPersonId)
        .limit(1)
        .get();

    if (!existingSnap.empty) {
        const session = existingSnap.docs[0].data();
        const sessionId = existingSnap.docs[0].id;

        if (session.status === 'complete' || session.status === 'max_attempts') return;

        // Check if retry is due
        const maxAttempts = schedule?.maxAttempts || 3;
        if (session.attemptCount >= maxAttempts) {
            await db.collection('people_info_sessions').doc(sessionId).update({ status: 'max_attempts' });
            await db.collection('people_info_campaigns').doc(campaignId).update({ 'stats.maxAttempts': FieldValue.increment(1), 'stats.pending': FieldValue.increment(-1) });
            return;
        }

        const nextScheduledAt = session.nextScheduledAt || 0;
        if (Date.now() < nextScheduledAt) return; // Not yet time to retry

        // Send retry outreach
        await sendOutreach(db, log, campaign, sessionId, session, churchName, phoneE164, emailAddr);
        return;
    }

    // Create new session
    const sessionId = `ius_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const newSession = {
        id: sessionId,
        campaignId,
        churchId,
        pcoPersonId,
        personName,
        phoneE164: phoneE164 || null,
        emailAddress: emailAddr || null,
        conversationHistory: [],
        collectedData: {},
        existingPcoData: pcoValues,
        remainingFields: initialRemainingFields,
        status: 'pending',
        attemptCount: 0,
        lastContactedAt: null,
        nextScheduledAt: null,
        completedAt: null,
        pcoWriteResult: null,
    };
    await db.collection('people_info_sessions').doc(sessionId).set(newSession);
    await db.collection('people_info_campaigns').doc(campaignId).update({ 'stats.total': FieldValue.increment(1), 'stats.pending': FieldValue.increment(1) });

    // Send initial outreach
    await sendOutreach(db, log, campaign, sessionId, newSession, churchName, phoneE164, emailAddr);
}

async function sendOutreach(
    db: any,
    log: any,
    campaign: any,
    sessionId: string,
    session: any,
    churchName: string,
    phoneE164: string | null,
    emailAddr: string | null,
): Promise<void> {
    const { churchId, channels, schedule } = campaign;
    const intervalDays = schedule?.intervalDays || 3;
    const nextScheduledAt = Date.now() + intervalDays * 24 * 60 * 60 * 1000;

    const message = buildIntroMessage(campaign, session.personName, churchName, session.existingPcoData || {});
    let sent = false;

    // Prefer SMS; fall back to email
    if (channels?.sms && phoneE164) {
        try {
            await sendIndividualInternal({
                db,
                log,
                churchId,
                toPhone: phoneE164,
                body: message,
                smsNumberId: channels?.smsNumberId,
                sentBy: 'church-helper-agent',
                sentByName: 'Church Helper',
            });
            sent = true;
            log.info(`[InfoUpdateScheduler] Sent SMS outreach to ${session.personName}`, 'system', { churchId, sessionId }, churchId);
        } catch (e: any) {
            log.warn(`[InfoUpdateScheduler] SMS outreach failed for ${session.personName}: ${e.message}`, 'system', { churchId, sessionId }, churchId);
        }
    }

    if (!sent && channels?.email && emailAddr) {
        try {
            const apiBase = process.env.API_BASE_URL || 'http://localhost:3000';
            await fetch(`${apiBase}/api/info-update/send-email-reply`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ churchId, to: emailAddr, personName: session.personName, body: message, campaignName: campaign.name }),
            });
            sent = true;
            log.info(`[InfoUpdateScheduler] Sent email outreach to ${session.personName}`, 'system', { churchId, sessionId }, churchId);
        } catch (e: any) {
            log.warn(`[InfoUpdateScheduler] Email outreach failed for ${session.personName}: ${e.message}`, 'system', { churchId, sessionId }, churchId);
        }
    }

    if (!sent) {
        log.warn(`[InfoUpdateScheduler] No contact channel available for ${session.personName}`, 'system', { churchId, sessionId }, churchId);
    }

    // Update session regardless of send success
    const outboundMsg = { role: 'agent', text: message, channel: channels?.sms && phoneE164 ? 'sms' : 'email', ts: Date.now() };
    await db.collection('people_info_sessions').doc(sessionId).update({
        status: 'in_progress',
        attemptCount: FieldValue.increment(1),
        lastContactedAt: Date.now(),
        nextScheduledAt,
        conversationHistory: FieldValue.arrayUnion(outboundMsg),
    });
    await db.collection('people_info_campaigns').doc(campaign.id).update({
        'stats.pending': FieldValue.increment(-1),
        'stats.inProgress': FieldValue.increment(1),
    });
}

function normaliseE164(phone: string): string {
    const digits = phone.replace(/\D/g, '');
    if (digits.length === 10) return `+1${digits}`;
    if (digits.length === 11 && digits.startsWith('1')) return `+${digits}`;
    return `+${digits}`;
}

// ─── Scheduler entry point ────────────────────────────────────────────────────

export function startInfoUpdateScheduler(db: any, log: any): void {
    log.info('[InfoUpdateScheduler] Starting', 'system', {}, 'system');

    const tick = async () => {
        try {
            const snap = await db.collection('people_info_campaigns')
                .where('status', '==', 'active')
                .get();

            for (const doc of snap.docs) {
                const campaign = { id: doc.id, ...doc.data() };
                try {
                    await processCampaign(db, log, campaign);
                } catch (e: any) {
                    log.warn(`[InfoUpdateScheduler] Error processing campaign ${campaign.id}: ${e.message}`, 'system', { churchId: campaign.churchId }, campaign.churchId);
                }
            }
        } catch (e: any) {
            log.warn(`[InfoUpdateScheduler] Tick error: ${e.message}`, 'system', {}, 'system');
        }
    };

    setInterval(tick, POLL_INTERVAL_MS);
    // Kick off immediately after a short delay to allow server boot
    setTimeout(tick, 5_000);
}
