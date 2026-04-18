import { createServerLogger } from '../services/logService';
import type { PersonInfo } from './twilioSend';

// ─── SMS Campaign Scheduler ───────────────────────────────────────────────────
// Polls Firestore every 60 seconds for SmsCampaigns with status='scheduled'
// and scheduledAt <= now. Resolves PCO List/Group members, then fires sendBulk.
//
// Also:
//   • Runs a workflow step executor (60s) — fires pending enrollment steps.
//   • Runs a birthday/anniversary scanner (24h) — auto-enrolls people whose
//     special day is today (adjusted by triggerDayOffset).

const MAX_RETRIES = 3;

/** Format a PCO date string (YYYY-MM-DD) as "Mon DD", e.g. "Jan 15". */
function fmtDate(raw?: string): string {
    if (!raw) return '';
    const d = new Date(raw + 'T00:00:00'); // avoid UTC shift
    return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/** Return today's date as a "MM-DD" string (local time). */
function todayMmDd(offsetDays = 0): string {
    const d = new Date();
    d.setDate(d.getDate() + offsetDays);
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    return `${mm}-${dd}`;
}

/** Extract MM-DD from a YYYY-MM-DD date string. */
function toMmDd(dateStr?: string | null): string {
    if (!dateStr) return '';
    // dateStr is YYYY-MM-DD
    const parts = dateStr.split('-');
    if (parts.length < 3) return '';
    return `${parts[1]}-${parts[2]}`;
}

/** Resolve phone numbers from a PCO List or Group via the stored PCO access token. */
async function resolvePcoPhones(
    db: any,
    churchId: string,
    listId?: string,
    groupId?: string
): Promise<{ phones: string[]; personMap: Record<string, PersonInfo> }> {

    const churchSnap = await db.collection('churches').doc(churchId).get();
    const church = churchSnap.data() || {};
    const token  = church.pcoAccessToken;
    if (!token) throw new Error('No PCO access token for this church.');

    // Determine the PCO endpoint — include emails & addresses for merge tags
    let url: string;
    if (listId) {
        url = `https://api.planningcenteronline.com/people/v2/lists/${listId}/people?per_page=100&include=emails,addresses&fields[Person]=name,first_name,last_name,phone_numbers,birthdate,anniversary`;
    } else if (groupId) {
        url = `https://api.planningcenteronline.com/groups/v2/groups/${groupId}/memberships?include=person&per_page=100`;
    } else {
        return { phones: [], personMap: {} };
    }

    const phones: string[]                    = [];
    const personMap: Record<string, PersonInfo> = {};

    let nextUrl: string | null = url;
    while (nextUrl) {
        const pcoRes = await fetch(nextUrl, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        if (!pcoRes.ok) {
            throw new Error(`PCO API returned ${pcoRes.status} for ${nextUrl}`);
        }
        const data: any    = await pcoRes.json();
        const people: any[] = data.data     || [];
        const included: any[] = data.included || [];

        // Build lookup maps from included resources (Email, Address)
        const emailByPersonId = new Map<string, string>();
        const cityByPersonId  = new Map<string, string>();
        const stateByPersonId = new Map<string, string>();

        for (const inc of included) {
            const attrs = inc.attributes || {};
            const rels  = inc.relationships || {};
            const personId = rels.person?.data?.id;
            if (!personId) continue;

            if (inc.type === 'Email' && attrs.primary) {
                emailByPersonId.set(personId, attrs.address || '');
            }
            if (inc.type === 'Address' && attrs.primary) {
                cityByPersonId.set(personId,  attrs.city  || '');
                stateByPersonId.set(personId, attrs.state || '');
            }
        }

        for (const person of people) {
            const attrs  = person.attributes || {};
            const phones_: any[] = attrs.phone_numbers || [];
            const primaryPhone   = phones_.find((p: any) => p.primary) || phones_[0];
            const rawPhone       = primaryPhone?.number || '';
            const digits         = rawPhone.replace(/\D/g, '');
            const e164           = digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : '';

            if (e164) {
                phones.push(e164);
                personMap[e164] = {
                    personName:  attrs.name || `${attrs.first_name || ''} ${attrs.last_name || ''}`.trim(),
                    email:       emailByPersonId.get(person.id) || '',
                    phone:       e164,
                    birthday:    fmtDate(attrs.birthdate),
                    anniversary: fmtDate(attrs.anniversary),
                    city:        cityByPersonId.get(person.id)  || '',
                    state:       stateByPersonId.get(person.id) || '',
                };
            }
        }

        // PCO-style pagination
        nextUrl = data.meta?.next?.href || (data.links?.next ?? null);
    }

    return { phones, personMap };
}

// ─── Birthday / Anniversary Scanner ──────────────────────────────────────────

/**
 * Once per day: scan all people in Firestore and auto-enroll anyone whose
 * birthday or anniversary (adjusted by triggerDayOffset) matches today.
 * Enrollment IDs use `{workflowId}_{personId}_{year}` to prevent re-enrollment
 * in the same calendar year.
 */
async function runBirthdayAnniversaryScanner(db: any): Promise<void> {
    const log = createServerLogger(db as any);

    try {
        // 1. Find all active birthday/anniversary workflows across all churches
        const wfSnap = await db.collectionGroup('smsWorkflows')
            .where('isActive', '==', true)
            .get()
            .catch(() => null);

        // collectionGroup requires an index — fall back to per-church query if needed
        const wfDocs: any[] = wfSnap?.docs || [];

        // If collectionGroup failed or returned no results, try fetching per church
        if (wfDocs.length === 0) {
            // Fetch all churches and query per church
            const churchesSnap = await db.collection('churches').get();
            for (const churchDoc of churchesSnap.docs) {
                const churchId = churchDoc.id;
                const snap = await db.collection('smsWorkflows')
                    .where('churchId', '==', churchId)
                    .where('isActive', '==', true)
                    .get()
                    .catch(() => null);
                if (snap) wfDocs.push(...snap.docs);
            }
        }

        const birthdayWorkflows    = wfDocs.filter(d => d.data().trigger === 'birthday');
        const anniversaryWorkflows = wfDocs.filter(d => d.data().trigger === 'anniversary');

        if (birthdayWorkflows.length === 0 && anniversaryWorkflows.length === 0) return;

        log.info(
            `[BirthdayScanner] Scanning — ${birthdayWorkflows.length} birthday, ${anniversaryWorkflows.length} anniversary workflow(s)`,
            'system', {}, ''
        );

        const currentYear = new Date().getFullYear();

        // Process each workflow
        for (const wfDoc of [...birthdayWorkflows, ...anniversaryWorkflows]) {
            const wf        = wfDoc.data() as any;
            const wfId      = wfDoc.id;
            const churchId  = wf.churchId;
            const offset    = typeof wf.triggerDayOffset === 'number' ? wf.triggerDayOffset : 0;
            const targetMd  = todayMmDd(-offset); // negative because offset = "days before event"

            if (!wf.steps?.length) continue;

            try {
                // 2. Load all people for this church
                const peopleSnap = await db.collection('people')
                    .where('churchId', '==', churchId)
                    .get();

                const dateField = wf.trigger === 'birthday' ? 'birthdate' : 'anniversary';
                let enrolled = 0;

                for (const personDoc of peopleSnap.docs) {
                    const person = personDoc.data() as any;
                    const personId = personDoc.id;

                    const eventDate: string | null = person[dateField] || null;
                    if (!eventDate) continue;

                    const mmdd = toMmDd(eventDate);
                    if (mmdd !== targetMd) continue;

                    // 3. Check for existing enrollment this year
                    const enrollId = `${wfId}_${personId}_${currentYear}`;
                    const existing = await db.collection('smsWorkflowEnrollments').doc(enrollId).get();
                    if (existing.exists) continue;

                    // 4. Need a phone number — look it up from the person record
                    const personPhone: string = (person.phone || '').replace(/\D/g, '');
                    const e164 = personPhone.length === 10 ? `+1${personPhone}` : personPhone.length === 11 ? `+${personPhone}` : '';
                    if (!e164) continue;

                    // 5. Create enrollment — nextSendAt = beginning of today
                    const today = new Date();
                    today.setHours(9, 0, 0, 0); // fire at 9am local server time

                    const enrollment = {
                        id:           enrollId,
                        churchId,
                        workflowId:   wfId,
                        phoneNumber:  e164,
                        personName:   person.name || null,
                        personId,
                        currentStep:  0,
                        nextSendAt:   today.getTime(),
                        completed:    false,
                        enrolledAt:   Date.now(),
                        lastStepSentAt: null,
                        // Extra metadata for merge tags
                        personBirthdate:   person.birthdate    || null,
                        personAnniversary: person.anniversary  || null,
                        personEmail:       person.email        || null,
                        personCity:        person.city         || null,
                        personState:       person.state        || null,
                    };

                    await db.collection('smsWorkflowEnrollments').doc(enrollId).set(enrollment);

                    // Increment enrolledCount
                    await db.collection('smsWorkflows').doc(wfId).update({
                        enrolledCount: (wf.enrolledCount || 0) + enrolled + 1,
                        updatedAt: Date.now(),
                    }).catch(() => {});

                    enrolled++;
                }

                if (enrolled > 0) {
                    log.info(
                        `[BirthdayScanner] Enrolled ${enrolled} person(s) into workflow "${wf.name}" (${wf.trigger})`,
                        'system', { wfId, churchId, enrolled }, churchId
                    );
                }

            } catch (e: any) {
                log.warn(
                    `[BirthdayScanner] Error scanning workflow ${wfId}: ${e.message}`,
                    'system', { wfId, churchId }, churchId
                );
            }
        }

    } catch (e: any) {
        console.error('[BirthdayScanner] Unexpected error:', e?.message);
    }
}

// ─── Workflow Step Executor ───────────────────────────────────────────────────

/**
 * Every 60s: find incomplete enrollments whose nextSendAt <= now.
 * Fire the pending step, then advance to the next step (or mark complete).
 */
async function runWorkflowStepExecutor(db: any): Promise<void> {
    const log = createServerLogger(db as any);

    try {
        const now = Date.now();

        // Query for enrollments that are ready to send
        const enrollSnap = await db.collection('smsWorkflowEnrollments')
            .where('completed', '==', false)
            .where('nextSendAt', '<=', now)
            .limit(50)
            .get();

        if (enrollSnap.empty) return;

        log.info(`[WorkflowExecutor] ${enrollSnap.size} enrollment(s) ready`, 'system', {}, '');

        await Promise.all(enrollSnap.docs.map(async (enrollDoc: any) => {
            const enrollment = enrollDoc.data() as any;
            const enrollId   = enrollDoc.id;
            const { workflowId, churchId, phoneNumber, currentStep, personId, personName } = enrollment;

            try {
                // Load workflow
                const wfDoc = await db.collection('smsWorkflows').doc(workflowId).get();
                if (!wfDoc.exists) {
                    // Workflow deleted — abandon enrollment
                    await db.collection('smsWorkflowEnrollments').doc(enrollId).update({ completed: true });
                    return;
                }
                const wf = wfDoc.data() as any;
                if (!wf.isActive) return; // workflow paused

                const steps: any[] = wf.steps || [];
                if (currentStep >= steps.length) {
                    // All steps done
                    await db.collection('smsWorkflowEnrollments').doc(enrollId).update({
                        completed: true,
                        lastStepSentAt: now,
                    });
                    await db.collection('smsWorkflows').doc(workflowId).update({
                        completedCount: (wf.completedCount || 0) + 1,
                        updatedAt: Date.now(),
                    }).catch(() => {});
                    return;
                }

                const step = steps[currentStep];
                const channelType: string = step.channelType || 'sms';

                // Build personInfo for merge tags
                const personInfo: PersonInfo = {
                    personName:  personName || '',
                    email:       enrollment.personEmail       || '',
                    phone:       phoneNumber,
                    birthday:    fmtDate(enrollment.personBirthdate),
                    anniversary: fmtDate(enrollment.personAnniversary),
                    city:        enrollment.personCity        || '',
                    state:       enrollment.personState       || '',
                };

                // If we have a personId, try to load richer data from Firestore
                if (personId) {
                    const pDoc = await db.collection('people').doc(personId).get().catch(() => null);
                    if (pDoc?.exists) {
                        const p = pDoc.data() as any;
                        personInfo.personName   = p.name      || personInfo.personName;
                        personInfo.email        = p.email     || personInfo.email;
                        personInfo.birthday     = fmtDate(p.birthdate)    || personInfo.birthday;
                        personInfo.anniversary  = fmtDate(p.anniversary)  || personInfo.anniversary;
                        personInfo.city         = p.city  || personInfo.city;
                        personInfo.state        = p.state || personInfo.state;
                    }
                }

                // ── Fire the step ─────────────────────────────────────────────
                if (channelType === 'sms' || channelType === 'mms') {
                    const { sendBulkInternal } = await import('./twilioSend.js');
                    await sendBulkInternal({
                        db,
                        churchId,
                        campaignId:  `wf_${workflowId}_step${currentStep}`,
                        phones:      [phoneNumber],
                        body:        step.message || '',
                        mediaUrls:   step.mediaUrls || [],
                        personMap:   { [phoneNumber]: personInfo },
                    });

                } else if (channelType === 'email') {
                    // Build minimal email campaign payload and call sendEmail
                    if (personInfo.email) {
                        const { sendEmail } = await import('./sendEmail.js');
                        const fakeReq = {
                            body: {
                                churchId,
                                subject:     step.emailSubject || '(no subject)',
                                htmlContent: step.emailBody    || '',
                                toAddresses: [personInfo.email],
                                personData:  { [personInfo.email]: personInfo },
                            }
                        } as any;
                        const fakeRes = {
                            json: () => {},
                            status: () => ({ json: () => {} }),
                        } as any;
                        await sendEmail(fakeReq, fakeRes);
                    }

                } else if (channelType === 'staff_sms') {
                    // Staff reminder — resolve staff recipients and send
                    // For now, log only; full implementation can be added later
                    log.info(`[WorkflowExecutor] staff_sms step skipped (not yet implemented)`, 'system', { enrollId }, churchId);
                }

                // ── Advance to next step ─────────────────────────────────────
                const nextStep = currentStep + 1;
                const isComplete = nextStep >= steps.length;
                let nextSendAt = now;

                if (!isComplete) {
                    const nextStepData = steps[nextStep];
                    const delayMs = (nextStepData.delayDays || 0) * 86_400_000;
                    nextSendAt = now + delayMs;
                }

                await db.collection('smsWorkflowEnrollments').doc(enrollId).update({
                    currentStep:    nextStep,
                    nextSendAt,
                    completed:      isComplete,
                    lastStepSentAt: now,
                });

                if (isComplete) {
                    await db.collection('smsWorkflows').doc(workflowId).update({
                        completedCount: (wf.completedCount || 0) + 1,
                        updatedAt: Date.now(),
                    }).catch(() => {});
                }

                log.info(
                    `[WorkflowExecutor] ${isComplete ? 'Completed' : `Step ${currentStep + 1}→${nextStep + 1}`} for enrollment ${enrollId}`,
                    'system', { enrollId, workflowId, churchId, step: currentStep }, churchId
                );

            } catch (e: any) {
                log.warn(
                    `[WorkflowExecutor] Error on enrollment ${enrollId}: ${e.message}`,
                    'system', { enrollId, workflowId, churchId }, churchId
                );
            }
        }));

    } catch (e: any) {
        console.error('[WorkflowExecutor] Tick error:', e?.message);
    }
}

// ─── Main Scheduler (SMS Campaigns + Workflow Executor + Birthday Scanner) ────

export function startSmsCampaignScheduler(db: any): void {
    const log = createServerLogger(db as any);

    const tick = async () => {
        try {
            const now = Date.now();

            const snap = await db.collection('smsCampaigns')
                .where('status', '==', 'scheduled')
                .where('scheduledAt', '<=', now)
                .get();

            if (!snap.empty) {
                log.info(`[SmsScheduler] Found ${snap.size} campaign(s) due to send`, 'system', {}, '');

                await Promise.all(snap.docs.map(async (docSnap: any) => {
                    const campaign   = docSnap.data() as any;
                    const campaignId = docSnap.id;
                    const churchId   = campaign.churchId;
                    const retryCount = campaign.retryCount || 0;

                    if (retryCount >= MAX_RETRIES) {
                        log.error(`[SmsScheduler] Campaign ${campaignId} exceeded max retries`, 'system', { campaignId }, churchId);
                        await db.collection('smsCampaigns').doc(campaignId).update({
                            status:    'failed',
                            lastError: `Max retries (${MAX_RETRIES}) exceeded`,
                            updatedAt: Date.now(),
                        });
                        return;
                    }

                    try {
                        // Mark as 'sending' to prevent double-processing
                        await db.collection('smsCampaigns').doc(campaignId).update({
                            status:    'sending',
                            updatedAt: Date.now(),
                        });

                        // Resolve recipient phone numbers
                        let phones: string[]                    = campaign.toPhones || [];
                        let personMap: Record<string, PersonInfo> = {};

                        if (phones.length === 0 && (campaign.toListId || campaign.toGroupId)) {
                            const resolved = await resolvePcoPhones(db, churchId, campaign.toListId, campaign.toGroupId);
                            phones    = resolved.phones;
                            personMap = resolved.personMap;
                        }

                        if (phones.length === 0) {
                            throw new Error('No phone numbers resolved for this campaign.');
                        }

                        // Delegate actual send to the send-bulk endpoint (re-use its logic inline)
                        const { sendBulkInternal } = await import('./twilioSend.js');
                        const result = await sendBulkInternal({
                            db,
                            churchId,
                            campaignId,
                            phones,
                            body:       campaign.body,
                            mediaUrls:  campaign.mediaUrls || [],
                            personMap,
                        });

                        log.info(
                            `[SmsScheduler] Campaign ${campaignId} sent: ${result.sent} sent, ${result.failed} failed, ${result.optedOut} opted-out`,
                            'system', { campaignId, ...result }, churchId
                        );

                        // Handle recurring reschedule
                        const isRecurring = !!campaign.recurringFrequency;
                        if (isRecurring) {
                            const d = new Date(campaign.scheduledAt || now);
                            if (campaign.recurringFrequency === 'daily')        d.setDate(d.getDate() + 1);
                            else if (campaign.recurringFrequency === 'weekly')  d.setDate(d.getDate() + 7);
                            else if (campaign.recurringFrequency === 'monthly') d.setMonth(d.getMonth() + 1);

                            const history = campaign.sentHistory || [];
                            history.push({ sentAt: now, recipientCount: result.sent });

                            await db.collection('smsCampaigns').doc(campaignId).update({
                                status:         'scheduled',
                                scheduledAt:    d.getTime(),
                                sendAt:         d.toISOString(),
                                lastSentAt:     now,
                                sentHistory:    history,
                                retryCount:     0,
                                lastError:      null,
                                updatedAt:      Date.now(),
                            });
                        }

                    } catch (e: any) {
                        const errMsg        = e?.message || 'Unknown error';
                        const newRetryCount = retryCount + 1;

                        log.warn(
                            `[SmsScheduler] Campaign ${campaignId} failed (attempt ${newRetryCount}/${MAX_RETRIES}): ${errMsg}`,
                            'system', { campaignId, churchId, retryCount: newRetryCount }, churchId
                        );

                        await db.collection('smsCampaigns').doc(campaignId).update({
                            status:     'scheduled',
                            retryCount: newRetryCount,
                            lastError:  errMsg,
                            updatedAt:  Date.now(),
                        });
                    }
                }));
            }

        } catch (e: any) {
            console.error('[SmsScheduler] Tick error:', e?.message);
        }
    };

    // ── Also run workflow step executor every 60s ──────────────────────────
    const workflowTick = () => runWorkflowStepExecutor(db);

    // ── Birthday / anniversary scanner — once per day ─────────────────────
    // Run at startup (catches any missed scans from overnight), then every 24h.
    let lastBirthdayScan = 0;
    const BIRTHDAY_SCAN_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

    const birthdayTick = async () => {
        const now = Date.now();
        if (now - lastBirthdayScan >= BIRTHDAY_SCAN_INTERVAL) {
            lastBirthdayScan = now;
            await runBirthdayAnniversaryScanner(db);
        }
    };

    // Start everything
    tick();
    workflowTick();
    birthdayTick();

    setInterval(tick, 60_000);
    setInterval(workflowTick, 60_000);
    setInterval(birthdayTick, 60_000); // checks every minute, but only scans once per 24h

    console.log('[SmsScheduler] Started — polling every 60 seconds (campaigns + workflow executor + birthday scanner)');
}
