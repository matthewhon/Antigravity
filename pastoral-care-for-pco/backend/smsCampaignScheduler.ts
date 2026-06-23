import { createServerLogger } from '../services/logService';
import type { PersonInfo } from './smsSend';
import { runListWorkflowReSyncScanner } from './workflowEnrollEndpoint.js';

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

/** Helper to resolve mock recipients for the c1 tenant directly from local Firestore collections. */
async function resolveMockC1Recipients(
    db: any,
    listId?: string,
    groupId?: string,
    channelType: 'sms' | 'email' | 'mms' = 'sms'
): Promise<{ destinations: string[]; personMap: Record<string, PersonInfo> }> {
    const phones: string[] = [];
    const personMap: Record<string, PersonInfo> = {};

    const fmtDate = (raw?: string): string => {
        if (!raw) return '';
        const d = new Date(raw + 'T00:00:00');
        return isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    };

    if (listId) {
        // Load people from Firestore c1 tenant
        const peopleSnap = await db.collection('people').where('churchId', '==', 'c1').get();
        let peopleDocs = peopleSnap.docs.map((d: any) => d.data());

        // Filter based on listId
        if (listId === 'pco_list_women') {
            peopleDocs = peopleDocs.filter((p: any) => p.gender?.toLowerCase() === 'female');
        } else if (listId === 'pco_list_new_visitors') {
            peopleDocs = peopleDocs.filter((p: any) => p.membership === 'Occasional Visitor' || p.membership === 'Regular Attendee');
        } else if (listId === 'pco_list_volunteers') {
            peopleDocs = peopleDocs.slice(20, 30);
        }

        for (const p of peopleDocs) {
            const rawPhone = (p.phone || '').replace(/\D/g, '');
            const phone = rawPhone.length === 10 ? `+1${rawPhone}` : rawPhone.length === 11 ? `+${rawPhone}` : '';
            const email = p.email || '';
            const dest = channelType === 'email' ? email : phone;

            if (dest) {
                phones.push(dest);
                personMap[dest] = {
                    personName: p.name || '',
                    email,
                    phone: phone || dest,
                    birthday: fmtDate(p.birthdate),
                    anniversary: fmtDate(p.anniversary),
                    city: p.addresses?.[0]?.city || 'Atlanta',
                    state: p.addresses?.[0]?.state || 'GA',
                    pcoPersonId: p.id ? p.id.replace('c1_', '') : null,
                    avatar: p.avatar || null,
                };
            }
        }
    } else if (groupId) {
        // Load the group from Firestore
        const groupDoc = await db.collection('groups').doc(groupId).get();
        if (groupDoc.exists) {
            const groupData = groupDoc.data();
            const memberIds = groupData?.memberIds || [];
            for (const pid of memberIds) {
                const pDoc = await db.collection('people').doc(pid).get();
                if (pDoc.exists) {
                    const p = pDoc.data();
                    const rawPhone = (p.phone || '').replace(/\D/g, '');
                    const phone = rawPhone.length === 10 ? `+1${rawPhone}` : rawPhone.length === 11 ? `+${rawPhone}` : '';
                    const email = p.email || '';
                    const dest = channelType === 'email' ? email : phone;

                    if (dest) {
                        phones.push(dest);
                        personMap[dest] = {
                            personName: p.name || '',
                            email,
                            phone: phone || dest,
                            birthday: fmtDate(p.birthdate),
                            anniversary: fmtDate(p.anniversary),
                            city: p.addresses?.[0]?.city || 'Atlanta',
                            state: p.addresses?.[0]?.state || 'GA',
                            pcoPersonId: p.id ? p.id.replace('c1_', '') : null,
                            avatar: p.avatar || null,
                        };
                    }
                }
            }
        }
    }

    return { destinations: phones, personMap };
}

/** Resolve phone numbers from a PCO List or Group via the stored PCO access token. */
export async function resolvePcoRecipients(
    db: any,
    churchId: string,
    listId?: string,
    groupId?: string,
    channelType: 'sms' | 'email' | 'mms' = 'sms'
): Promise<{ destinations: string[]; personMap: Record<string, PersonInfo> }> {

    if (churchId === 'c1') {
        return await resolveMockC1Recipients(db, listId, groupId, channelType);
    }

    const churchSnap = await db.collection('churches').doc(churchId).get();
    const church = churchSnap.data() || {};
    const token  = church.pcoAccessToken;
    if (!token) throw new Error('No PCO access token for this church.');

    // Determine the PCO endpoint.
    // - For lists: include phone_numbers and emails so we get them in the `included` array.
    // - For groups: include person so we have the embedded person data.
    let url: string;
    if (listId) {
        url = `https://api.planningcenteronline.com/people/v2/lists/${listId}/people?per_page=100&include=phone_numbers,emails,addresses`;
    } else if (groupId) {
        url = `https://api.planningcenteronline.com/groups/v2/groups/${groupId}/memberships?include=person&per_page=100`;
    } else {
        return { destinations: [], personMap: {} };
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

        // Build lookup maps from included resources (PhoneNumber, Email, Address, Person)
        const phonesByPersonId = new Map<string, string>();   // personId → primary E.164
        const emailByPersonId  = new Map<string, string>();
        const cityByPersonId   = new Map<string, string>();
        const stateByPersonId  = new Map<string, string>();
        const personAttrsMap   = new Map<string, any>();       // personId → Person attributes

        for (const inc of included) {
            const attrs    = inc.attributes || {};
            const rels     = inc.relationships || {};

            // Groups API embeds the full Person object in included
            if (inc.type === 'Person') {
                personAttrsMap.set(inc.id, attrs);

                // Extract phone from attributes.phone_numbers array (Groups API path)
                const pPhones: any[] = attrs.phone_numbers || [];
                const primary = pPhones.find((p: any) => p.primary) || pPhones[0];
                let digits = '';
                if (primary) {
                    digits = (primary.number || '').replace(/\D/g, '');
                } else if (attrs.primary_phone_number) {
                    digits = (attrs.primary_phone_number || '').replace(/\D/g, '');
                }
                const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : '';
                if (e164 && !phonesByPersonId.has(inc.id)) {
                    phonesByPersonId.set(inc.id, e164);
                }

                // Extract email from email_addresses array
                const pEmails: any[] = attrs.email_addresses || [];
                const primaryEmail = pEmails.find((e: any) => e.primary) || pEmails[0];
                let email = '';
                if (primaryEmail) {
                    email = primaryEmail.address || '';
                } else if (attrs.primary_email) {
                    email = attrs.primary_email || '';
                }
                if (email) {
                    emailByPersonId.set(inc.id, email);
                }
                continue;
            }

            // PhoneNumber resources link back to person via relationships.person
            const personId = rels.person?.data?.id;
            if (!personId) continue;

            if (inc.type === 'PhoneNumber') {
                // Only use primary phone, or the first one we see if no primary set yet
                const digits = (attrs.number || '').replace(/\D/g, '');
                const e164   = digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : '';
                if (e164 && (attrs.primary || !phonesByPersonId.has(personId))) {
                    phonesByPersonId.set(personId, e164);
                }
            }
            if (inc.type === 'Email' && attrs.primary) {
                emailByPersonId.set(personId, attrs.address || '');
            }
            if (inc.type === 'Address' && attrs.primary) {
                cityByPersonId.set(personId,  attrs.city  || '');
                stateByPersonId.set(personId, attrs.state || '');
            }
        }

        for (const person of people) {
            // For groups API, the person's id is linked via relationships.person.data.id
            const personId = person.relationships?.person?.data?.id || person.id;
            const pAttrs   = personAttrsMap.get(personId) || person.attributes || {};

            let dest = '';
            if (channelType === 'email') {
                dest = emailByPersonId.get(personId) || '';
            } else {
                dest = phonesByPersonId.get(personId) || '';
            }

            if (dest) {
                phones.push(dest);
                personMap[dest] = {
                    personName:  pAttrs.name || `${pAttrs.first_name || ''} ${pAttrs.last_name || ''}`.trim(),
                    email:       emailByPersonId.get(personId)  || pAttrs.email || '',
                    phone:       phonesByPersonId.get(personId) || dest,
                    birthday:    fmtDate(pAttrs.birthdate),
                    anniversary: fmtDate(pAttrs.anniversary),
                    city:        cityByPersonId.get(personId)   || pAttrs.city || '',
                    state:       stateByPersonId.get(personId)  || pAttrs.state || '',
                    pcoPersonId: personId || null,
                    avatar:      pAttrs.avatar || null,
                };
            }
        }

        // PCO-style pagination
        nextUrl = data.meta?.next?.href || (data.links?.next ?? null);
    }

    return { destinations: phones, personMap };
}

// ─── Birthday / Anniversary Scanner ──────────────────────────────────────────

/**
 * Once per day: scan all people in Firestore and auto-enroll anyone whose
 * birthday or anniversary (adjusted by triggerDayOffset) matches today.
 * Enrollment IDs use `{workflowId}_{personId}_{year}` to prevent re-enrollment
 * in the same calendar year.
 */
export async function runBirthdayAnniversaryScanner(db: any): Promise<void> {
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

                    // 4. Look up phone number from the person record (can be empty for staff/email workflows)
                    const personPhone: string = (person.phone || '').replace(/\D/g, '');
                    const e164 = personPhone.length === 10 ? `+1${personPhone}` : personPhone.length === 11 ? `+${personPhone}` : '';

                    // 5. Create enrollment — nextSendAt = beginning of today
                    const today = new Date();
                    const timeParts = (wf.triggerTime || '09:00').split(':').map(Number);
                    const schedHours = timeParts[0] ?? 9;
                    const schedMinutes = timeParts[1] ?? 0;
                    today.setHours(schedHours, schedMinutes, 0, 0); // fire at configured local server time

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

// ─── Scheduled-Day Calculator ─────────────────────────────────────────────────────────

/**
 * Compute when `step` should fire, given the previous step (or enrollment) completed at `fromMs`.
 *
 * Modes:
 *  - 'relative'     → fromMs + delayDays × 86 400 000 ms
 *  - 'day_of_week'  → next occurrence of scheduleDayOfWeek (0=Sun…6=Sat) strictly after fromMs,
 *                     at scheduleTime (HH:MM 24 h, default 09:00), server local time.
 *  - 'day_of_month' → next calendar date matching scheduleDayOfMonth (1–31) strictly after fromMs,
 *                     at scheduleTime, server local time. If the target day doesn't exist in a
 *                     given month (e.g. the 31st in April) that month is skipped.
 */
function calcNextSendAt(step: any, fromMs: number): number {
    const scheduleType: string = step.scheduleType || 'relative';
    const timeParts = (step.scheduleTime || '09:00').split(':').map(Number);
    const schedHours   = timeParts[0] ?? 9;
    const schedMinutes = timeParts[1] ?? 0;

    if (scheduleType === 'day_of_week') {
        const targetDay: number = step.scheduleDayOfWeek ?? 1; // default: Monday
        const candidate = new Date(fromMs);
        candidate.setHours(schedHours, schedMinutes, 0, 0);
        
        for (let i = 0; i <= 7; i++) {
            if (candidate.getDay() === targetDay && candidate.getTime() > fromMs) {
                return candidate.getTime();
            }
            candidate.setDate(candidate.getDate() + 1);
        }
    }

    if (scheduleType === 'specific_date') {
        if (step.scheduleDate) {
            const parts = step.scheduleDate.split('-').map(Number);
            if (parts.length === 3) {
                const candidate = new Date(parts[0], parts[1] - 1, parts[2], schedHours, schedMinutes, 0, 0);
                return candidate.getTime();
            }
        }
        // Fallback if no valid date
        return fromMs;
    }
    if (scheduleType === 'day_of_month') {
        const targetDate: number = step.scheduleDayOfMonth ?? 1; // 1–31
        // Try the target day in the current month first; if already past, advance month by month.
        const ref = new Date(fromMs);
        let year  = ref.getFullYear();
        let month = ref.getMonth(); // 0-based
        while (true) {
            const daysInMonth  = new Date(year, month + 1, 0).getDate();
            if (targetDate <= daysInMonth) {
                const candidate = new Date(year, month, targetDate, schedHours, schedMinutes, 0, 0);
                if (candidate.getTime() > fromMs) return candidate.getTime();
            }
            // Target day doesn't exist this month, or is already past — try the next month.
            month++;
            if (month > 11) { month = 0; year++; }
        }
    }

    // Default: relative offset
    return fromMs + (step.delayDays || 0) * 86_400_000 + (step.delayHours || 0) * 3_600_000;
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

                // ── Claim this enrollment before sending ─────────────────────
                // Push nextSendAt 5 minutes into the future so that any
                // concurrent 60-second tick whose query runs before our final
                // update at the end of this block won't re-pick and re-send
                // the same step (the root cause of duplicate messages).
                await db.collection('smsWorkflowEnrollments').doc(enrollId).update({
                    nextSendAt: now + 5 * 60 * 1000,
                });

                // ── Fire the step ─────────────────────────────────────────────
                if (channelType === 'sms' || channelType === 'mms') {
                    const { sendBulkInternal } = await import('./smsSend.js');
                    await sendBulkInternal({
                        db,
                        churchId,
                        campaignId:     `wf_${workflowId}_step${currentStep}`,
                        phones:         [phoneNumber],
                        body:           step.message || '',
                        mediaUrls:      step.mediaUrls || [],
                        personMap:      { [phoneNumber]: personInfo },
                        twilioNumberId: wf.twilioNumberId || null,
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
                    const { sendBulkInternal } = await import('./smsSend.js');
                    const staffTargetType = step.staffTargetType || 'individuals';
                    const staffPhones: string[] = [];
                    
                    if (staffTargetType === 'individuals') {
                        const recs = step.staffRecipients || [];
                        for (const r of recs) {
                            if (r.phone) {
                                const digits = r.phone.replace(/\D/g, '');
                                const e164 = digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : '';
                                if (e164) staffPhones.push(e164);
                            }
                        }
                    } else if ((staffTargetType === 'list' && step.staffListId) || (staffTargetType === 'group' && step.staffGroupId)) {
                        const churchSnap = await db.collection('churches').doc(churchId).get();
                        const token = churchSnap.data()?.pcoAccessToken || '';
                        if (token) {
                            const { resolvePcoPersons } = await import('./workflowEnrollEndpoint.js');
                            const persons = await resolvePcoPersons(
                                token,
                                staffTargetType === 'list' ? step.staffListId : null,
                                staffTargetType === 'group' ? step.staffGroupId : null
                            );
                            for (const p of persons) {
                                if (p.e164) staffPhones.push(p.e164);
                            }
                        }
                    }
                    
                    if (staffPhones.length > 0) {
                        const pMap: any = {};
                        for (const sp of staffPhones) {
                            pMap[sp] = personInfo;
                        }
                        
                        await sendBulkInternal({
                            db,
                            churchId,
                            campaignId:     `wf_${workflowId}_step${currentStep}_staff`,
                            phones:         staffPhones,
                            body:           step.message || '',
                            mediaUrls:      step.mediaUrls || [],
                            personMap:      pMap,
                            twilioNumberId: wf.twilioNumberId || null,
                        });
                        log.info(`[WorkflowExecutor] Sent staff_sms to ${staffPhones.length} staff members`, 'system', { enrollId }, churchId);
                    } else {
                        log.warn(`[WorkflowExecutor] staff_sms step skipped - no valid phone numbers found for target staff`, 'system', { enrollId }, churchId);
                    }

                } else if (channelType === 'staff_email') {
                    const { sendEmail } = await import('./sendEmail.js');
                    const staffTargetType = step.staffTargetType || 'individuals';
                    const staffEmails: string[] = [];
                    
                    if (staffTargetType === 'individuals') {
                        const recs = step.staffRecipients || [];
                        for (const r of recs) {
                            if (r.email) {
                                staffEmails.push(r.email);
                            }
                        }
                    } else if ((staffTargetType === 'list' && step.staffListId) || (staffTargetType === 'group' && step.staffGroupId)) {
                        const churchSnap = await db.collection('churches').doc(churchId).get();
                        const token = churchSnap.data()?.pcoAccessToken || '';
                        if (token) {
                            const { resolvePcoPersons } = await import('./workflowEnrollEndpoint.js');
                            const persons = await resolvePcoPersons(
                                token,
                                staffTargetType === 'list' ? step.staffListId : null,
                                staffTargetType === 'group' ? step.staffGroupId : null
                            );
                            for (const p of persons) {
                                if (p.email) {
                                    staffEmails.push(p.email);
                                }
                            }
                        }
                    }
                    
                    if (staffEmails.length > 0) {
                        const pMap: any = {};
                        for (const se of staffEmails) {
                            pMap[se] = personInfo;
                        }
                        const fakeReq = {
                            body: {
                                churchId,
                                campaignId:  `wf_${workflowId}_step${currentStep}_staff`,
                                subject:     step.emailSubject || '(no subject)',
                                htmlContent: step.emailBody    || '',
                                toAddresses: staffEmails,
                                personData:  pMap,
                            }
                        } as any;
                        const fakeRes = {
                            json: () => {},
                            status: () => ({ json: () => {} }),
                        } as any;
                        await sendEmail(fakeReq, fakeRes);
                        log.info(`[WorkflowExecutor] Sent staff_email to ${staffEmails.length} staff members`, 'system', { enrollId }, churchId);
                    } else {
                        log.warn(`[WorkflowExecutor] staff_email step skipped - no valid email addresses found for target staff`, 'system', { enrollId }, churchId);
                    }
                }

                // ── Advance to next step ─────────────────────────────────────
                const nextStep = currentStep + 1;
                const isComplete = nextStep >= steps.length;
                let nextSendAt = now;

                if (!isComplete) {
                    nextSendAt = calcNextSendAt(steps[nextStep], now);
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
                // Restore nextSendAt to now so the enrollment stays
                // immediately retryable — it won't be stuck behind the
                // 5-minute claim window we set before the send attempt.
                await db.collection('smsWorkflowEnrollments').doc(enrollId).update({
                    nextSendAt: now,
                }).catch(() => {});
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

// ─── Event Registration Scanner ──────────────────────────────────────────────

/**
 * Once per day: scan all active 'event_registration' workflows and enroll any
 * confirmed PCO attendees who are not yet enrolled.
 *
 * Phone numbers are resolved from the `people` collection via the attendee's
 * personId. Attendees with no matching person doc (or no phone) are skipped;
 * they will be picked up on the next daily run after the full PCO sync runs.
 *
 * Enrollment ID: `{workflowId}_{personId}` — one enrolment per person per
 * workflow, regardless of how many times the scanner runs.
 */
export async function runEventRegistrationScanner(db: any): Promise<void> {
    const log = createServerLogger(db as any);

    try {
        // 1. Find all active event_registration workflows across all churches
        let wfDocs: any[] = [];

        const wfSnap = await db.collection('smsWorkflows')
            .where('isActive', '==', true)
            .where('trigger', '==', 'event_registration')
            .get()
            .catch(() => null);

        if (wfSnap) {
            wfDocs = wfSnap.docs || [];
        }

        // Fallback: per-church query if collectionGroup or simple query returned nothing
        if (wfDocs.length === 0) {
            const churchesSnap = await db.collection('churches').get();
            for (const churchDoc of churchesSnap.docs) {
                const churchId = churchDoc.id;
                const snap = await db.collection('smsWorkflows')
                    .where('churchId', '==', churchId)
                    .where('isActive', '==', true)
                    .where('trigger', '==', 'event_registration')
                    .get()
                    .catch(() => null);
                if (snap) wfDocs.push(...snap.docs);
            }
        }

        if (wfDocs.length === 0) return;

        log.info(
            `[EventRegistrationScanner] Scanning ${wfDocs.length} event_registration workflow(s)`,
            'system', {}, ''
        );

        for (const wfDoc of wfDocs) {
            const wf       = wfDoc.data() as any;
            const wfId     = wfDoc.id;
            const churchId = wf.churchId;
            const eventId  = wf.triggerEventId as string | null;

            if (!eventId) {
                log.warn(
                    `[EventRegistrationScanner] Workflow ${wfId} has no triggerEventId — skipping`,
                    'system', { wfId, churchId }, churchId
                );
                continue;
            }

            if (!wf.steps?.length) continue;

            try {
                // 2. Load confirmed attendees for this event from the Firestore cache
                const attendeesSnap = await db.collection('pco_registration_attendees')
                    .where('churchId', '==', churchId)
                    .where('pcoEventId', '==', eventId)
                    .where('status', '==', 'confirmed')
                    .get();

                if (attendeesSnap.empty) continue;

                let enrolled = 0;

                for (const attDoc of attendeesSnap.docs) {
                    const attendee = attDoc.data() as any;
                    const personId: string | null = attendee.personId || null;

                    if (!personId) continue; // can't resolve a phone without a person

                    // 3. Check for an existing enrollment — skip if already enrolled
                    const enrollId = wf.allowReentry
                        ? `${wfId}_${personId}_${attDoc.id}`
                        : `${wfId}_${personId}`;
                    const existing = await db.collection('smsWorkflowEnrollments').doc(enrollId).get();
                    if (existing.exists) continue;

                    // 4. Look up the person for their phone number and merge-tag data
                    const personDoc = await db.collection('people').doc(personId).get().catch(() => null);
                    if (!personDoc?.exists) continue;

                    const person = personDoc.data() as any;
                    const rawPhone: string = (person.phone || '').replace(/\D/g, '');
                    const e164 =
                        rawPhone.length === 10 ? `+1${rawPhone}` :
                        rawPhone.length === 11 ? `+${rawPhone}` : '';

                    // 5. Create the enrollment — fires at configured time on the next scheduler tick
                    const today = new Date();
                    const timeParts = (wf.triggerTime || '09:00').split(':').map(Number);
                    const schedHours = timeParts[0] ?? 9;
                    const schedMinutes = timeParts[1] ?? 0;
                    today.setHours(schedHours, schedMinutes, 0, 0);

                    const enrollment = {
                        id:            enrollId,
                        churchId,
                        workflowId:    wfId,
                        phoneNumber:   e164,
                        personName:    person.name   || attendee.name || null,
                        personId,
                        currentStep:   0,
                        nextSendAt:    today.getTime(),
                        completed:     false,
                        enrolledAt:    Date.now(),
                        lastStepSentAt: null,
                        // Merge-tag data
                        personBirthdate:   person.birthdate   || null,
                        personAnniversary: person.anniversary || null,
                        personEmail:       person.email       || null,
                        personCity:        person.city        || null,
                        personState:       person.state       || null,
                    };

                    await db.collection('smsWorkflowEnrollments').doc(enrollId).set(enrollment);

                    // Increment enrolledCount on the workflow
                    await db.collection('smsWorkflows').doc(wfId).update({
                        enrolledCount: (wf.enrolledCount || 0) + enrolled + 1,
                        updatedAt: Date.now(),
                    }).catch(() => {});

                    enrolled++;
                }

                if (enrolled > 0) {
                    log.info(
                        `[EventRegistrationScanner] Enrolled ${enrolled} person(s) into workflow "${wf.name}" for event ${eventId}`,
                        'system', { wfId, churchId, eventId, enrolled }, churchId
                    );
                }

            } catch (e: any) {
                log.warn(
                    `[EventRegistrationScanner] Error scanning workflow ${wfId}: ${e.message}`,
                    'system', { wfId, churchId, eventId }, churchId
                );
            }
        }

    } catch (e: any) {
        console.error('[EventRegistrationScanner] Unexpected error:', e?.message);
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

                        // Check channel type
                        const isEmail = campaign.channelType === 'email';
                        let result: any = { sent: 0, failed: 0, optedOut: 0 };

                        if (isEmail) {
                            const { executeSend } = await import('./sendEmail.js');
                            const sendRes = await executeSend(db, campaignId, churchId, undefined, true, 'smsCampaigns');
                            result.sent = sendRes.recipientCount;
                        } else {
                            // Resolve recipient phone numbers for SMS
                            let phones: string[]                    = campaign.toPhones || [];
                            let personMap: Record<string, PersonInfo> = {};

                            if (phones.length === 0 && (campaign.toListId || campaign.toGroupId)) {
                                const resolved = await resolvePcoRecipients(db, churchId, campaign.toListId, campaign.toGroupId, 'sms');
                                phones    = resolved.destinations;
                                personMap = resolved.personMap;
                            }

                            if (phones.length === 0) {
                                throw new Error('No phone numbers resolved for this campaign.');
                            }

                            // Delegate actual send to the send-bulk endpoint
                            const { sendBulkInternal } = await import('./smsSend.js');
                            result = await sendBulkInternal({
                                db,
                                churchId,
                                campaignId,
                                phones,
                                body:        campaign.body,
                                mediaUrls:   campaign.mediaUrls || [],
                                personMap,
                                smsNumberId: campaign.smsNumberId || campaign.twilioNumberId || null,
                                attachVcard: campaign.attachVcard || false,
                            });
                        }

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

    // ── Event Registration scanner — once per day (shares the birthday interval) ──
    let lastEventRegScan = 0;
    const EVENT_REG_SCAN_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

    const eventRegTick = async () => {
        const now = Date.now();
        if (now - lastEventRegScan >= EVENT_REG_SCAN_INTERVAL) {
            lastEventRegScan = now;
            await runEventRegistrationScanner(db);
        }
    };

    // ── PCO List/Group workflow re-sync — once per day ────────────────────────
    // Re-pulls each active list_add workflow's PCO list and enrolls any new people.
    let lastListReScan = 0;
    const LIST_RESCAN_INTERVAL = 24 * 60 * 60 * 1000; // 24 hours

    const listReSyncTick = async () => {
        const now = Date.now();
        if (now - lastListReScan >= LIST_RESCAN_INTERVAL) {
            lastListReScan = now;
            await runListWorkflowReSyncScanner(db);
        }
    };

    // Start everything
    tick();
    workflowTick();
    birthdayTick();
    eventRegTick();
    listReSyncTick();

    setInterval(tick, 60_000);
    setInterval(workflowTick, 60_000);
    setInterval(birthdayTick, 60_000);   // checks every minute, but only scans once per 24h
    setInterval(eventRegTick, 60_000);   // checks every minute, but only scans once per 24h
    setInterval(listReSyncTick, 60_000); // checks every minute, but only scans once per 24h

    console.log('[SmsScheduler] Started — polling every 60 seconds (campaigns + workflow executor + birthday scanner + event registration scanner + PCO list re-sync scanner)');
}

