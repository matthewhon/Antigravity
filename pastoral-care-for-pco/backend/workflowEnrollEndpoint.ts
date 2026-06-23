// ─── Workflow Bulk-Enroll from PCO List/Group ────────────────────────────────
//
// POST /api/messaging/workflow-enroll-list
// Body: { churchId, workflowId, listId?, groupId? }
//
// Resolves every phone number on a PCO List or Group, then creates
// smsWorkflowEnrollment docs for each person who isn't already enrolled.
// Existing enrollments are silently skipped (idempotent).
//
// Returns: { success, enrolled, skipped, noPhone }

import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';

/** Minimal person info needed for an enrollment */
interface PersonInfo {
    e164: string;
    name: string;
    personId: string | null; // PCO person ID (if resolvable)
    email: string;
    city: string;
    state: string;
    birthdate: string | null;
    anniversary: string | null;
}

/**
 * Resolve all people on a PCO List or Group using the church's stored access token.
 * Returns a flat array of PersonInfo objects (phone numbers in E.164 format).
 * Handles PCO pagination automatically.
 */
export async function resolvePcoPersons(
    token: string,
    listId?: string | null,
    groupId?: string | null,
): Promise<PersonInfo[]> {
    const persons: PersonInfo[] = [];

    if (listId) {
        // PCO People Lists API
        // NOTE: phone_numbers is a relationship in PCO API v2 — it cannot be requested
        // via fields[Person] sparse fieldsets (those only work for plain attributes).
        // We must use include=phone_numbers to get them via the included[] array,
        // OR omit fields[] entirely so PCO returns all attributes.
        // We use include=emails,addresses,phone_numbers and build lookup maps for each.
        let url: string | null =
            `https://api.planningcenteronline.com/people/v2/lists/${listId}/people` +
            `?per_page=100&include=emails,addresses,phone_numbers`;

        while (url) {
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            if (!res.ok) throw new Error(`PCO List API returned ${res.status}: ${await res.text().catch(() => '')}`);
            const data: any = await res.json();

            const included: any[] = data.included || [];
            const emailByPersonId  = new Map<string, string>();
            const cityByPersonId   = new Map<string, string>();
            const stateByPersonId  = new Map<string, string>();
            // phone_numbers come through included[] keyed by their own id;
            // the person resource has a phone_numbers relationship listing which ids belong to it.
            const phonesByPersonId = new Map<string, { number: string; primary: boolean }[]>();

            for (const inc of included) {
                const attrs = inc.attributes || {};
                if (inc.type === 'Email') {
                    const personId = inc.relationships?.person?.data?.id;
                    if (personId && attrs.primary) emailByPersonId.set(personId, attrs.address || '');
                }
                if (inc.type === 'Address') {
                    const personId = inc.relationships?.person?.data?.id;
                    if (personId && attrs.primary) {
                        cityByPersonId.set(personId,  attrs.city  || '');
                        stateByPersonId.set(personId, attrs.state || '');
                    }
                }
                if (inc.type === 'PhoneNumber') {
                    const personId = inc.relationships?.person?.data?.id;
                    if (personId) {
                        const existing = phonesByPersonId.get(personId) || [];
                        existing.push({ number: attrs.number || '', primary: !!attrs.primary });
                        phonesByPersonId.set(personId, existing);
                    }
                }
            }

            for (const person of (data.data || [])) {
                const attrs   = person.attributes || {};
                const pid     = person.id;

                // Phone: prefer included PhoneNumber resources, fall back to inline attribute array
                const phonesFromIncluded = phonesByPersonId.get(pid) || [];
                const phonesFromAttr     = (attrs.phone_numbers || []) as { number: string; primary: boolean }[];
                const phones  = phonesFromIncluded.length ? phonesFromIncluded : phonesFromAttr;
                const primary = phones.find(p => p.primary) || phones[0];
                const rawPhone = primary?.number || '';
                const digits   = rawPhone.replace(/\D/g, '');
                const e164     = digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : '';

                persons.push({
                    e164,
                    name:        attrs.name || `${attrs.first_name || ''} ${attrs.last_name || ''}`.trim(),
                    personId:    pid || null,
                    email:       emailByPersonId.get(pid) || '',
                    city:        cityByPersonId.get(pid)  || '',
                    state:       stateByPersonId.get(pid) || '',
                    birthdate:   attrs.birthdate   || null,
                    anniversary: attrs.anniversary || null,
                });
            }

            url = data.meta?.next?.href || data.links?.next || null;
        }

    } else if (groupId) {
        // PCO Groups API — memberships with person included
        let url: string | null =
            `https://api.planningcenteronline.com/groups/v2/groups/${groupId}/memberships` +
            `?include=person&per_page=100`;

        while (url) {
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            if (!res.ok) throw new Error(`PCO Group API returned ${res.status}`);
            const data: any = await res.json();

            for (const person of (data.included || [])) {
                if (person.type !== 'Person') continue;
                const attrs    = person.attributes || {};
                const phones_  = attrs.phone_numbers || [];
                const primary  = phones_.find((p: any) => p.primary) || phones_[0];
                const rawPhone = primary?.number || attrs.phone || '';
                const digits   = rawPhone.replace(/\D/g, '');
                const e164     = digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : '';

                persons.push({
                    e164,
                    name:        attrs.name || `${attrs.first_name || ''} ${attrs.last_name || ''}`.trim(),
                    personId:    person.id || null,
                    email:       attrs.primary_email || '',
                    city:        '',
                    state:       '',
                    birthdate:   null,
                    anniversary: null,
                });
            }

            url = data.meta?.next?.href || data.links?.next || null;
        }
    }

    return persons;
}

/** Express handler: POST /api/messaging/workflow-enroll-list */
export async function workflowEnrollList(req: any, res: any): Promise<void> {
    const { churchId, workflowId, listId, groupId } = req.body || {};

    if (!churchId || !workflowId) {
        res.status(400).json({ error: 'Missing churchId or workflowId' });
        return;
    }
    if (!listId && !groupId) {
        res.status(400).json({ error: 'Provide listId or groupId' });
        return;
    }

    try {
        const db = getDb();

        // 1. Load the workflow — verify it exists and belongs to this church
        const wfDoc = await db.collection('smsWorkflows').doc(workflowId).get();
        if (!wfDoc.exists) {
            res.status(404).json({ error: 'Workflow not found' });
            return;
        }
        const wf = wfDoc.data() as any;
        if (wf.churchId !== churchId) {
            res.status(403).json({ error: 'Workflow does not belong to this church' });
            return;
        }
        if (!wf.steps?.length && !wf.nodes?.length) {
            res.status(400).json({ error: 'Workflow has no steps — add at least one step before enrolling.' });
            return;
        }

        // 2. Load the PCO access token
        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church     = churchSnap.data() || {};
        const token: string = church.pcoAccessToken || '';
        if (!token) {
            res.status(400).json({ error: 'Planning Center is not connected for this church.' });
            return;
        }

        // 3. Resolve persons from PCO
        const persons = await resolvePcoPersons(token, listId || null, groupId || null);

        // 4. Bulk-create enrollments, skipping any that already exist
        let enrolled = 0;
        let skipped  = 0;
        let noPhone  = 0;

        const now       = Date.now();
        const batchSize = 25; // stay well within Firestore write limits

        // Process in batches to avoid hitting Firestore limits
        for (let i = 0; i < persons.length; i += batchSize) {
            const chunk = persons.slice(i, i + batchSize);
            await Promise.all(chunk.map(async (person) => {
                // Enrollment ID: prefer personId so we avoid double-enrolling the same person
                // who might have two phone numbers; fall back to phone-based ID.
                const baseId = person.personId
                    ? `${workflowId}_${person.personId}`
                    : `${workflowId}_${person.e164.replace(/\+/g, '')}`;
                const enrollId = wf.allowReentry
                    ? `${baseId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
                    : baseId;

                if (!wf.allowReentry) {
                    const existing = await db.collection('smsWorkflowEnrollments').doc(enrollId).get();
                    if (existing.exists) {
                        skipped++;
                        return;
                    }
                }

                // Fire Step 1 immediately (nextSendAt = now)
                const enrollment = {
                    id:               enrollId,
                    churchId,
                    workflowId,
                    phoneNumber:      person.e164,
                    personName:       person.name || null,
                    personId:         person.personId || null,
                    currentStep:      0,
                    nextSendAt:       now,
                    completed:        false,
                    enrolledAt:       now,
                    lastStepSentAt:   null,
                    // Merge-tag data for the step executor
                    personEmail:      person.email      || null,
                    personCity:       person.city       || null,
                    personState:      person.state      || null,
                    personBirthdate:  person.birthdate  || null,
                    personAnniversary:person.anniversary || null,
                    // Source metadata
                    enrollSource:     listId ? 'pco_list' : 'pco_group',
                    enrollSourceId:   (listId || groupId) ?? null,
                };

                await db.collection('smsWorkflowEnrollments').doc(enrollId).set(enrollment);
                enrolled++;
            }));
        }

        noPhone = 0; // already filtered above — persons[] only contains those with a phone

        // 5. Update workflow enrolledCount
        if (enrolled > 0) {
            await db.collection('smsWorkflows').doc(workflowId).update({
                enrolledCount: (wf.enrolledCount || 0) + enrolled,
                updatedAt:     Date.now(),
            });
        }

        res.json({ success: true, enrolled, skipped, noPhone });
    } catch (e: any) {
        console.error('[WorkflowEnrollList] Error:', e?.message);
        res.status(500).json({ error: e?.message || 'Failed to enroll from list' });
    }
}

/**
 * POST /api/messaging/workflow-enroll-list-preview
 * Returns estimated member count for a PCO list or group without enrolling anyone.
 * Body: { churchId, listId?, groupId? }
 */
export async function workflowEnrollPreview(req: any, res: any): Promise<void> {
    const { churchId, listId, groupId } = req.body || {};
    if (!churchId || (!listId && !groupId)) {
        res.status(400).json({ error: 'Missing churchId and listId/groupId' });
        return;
    }

    try {
        const db = getDb();
        const churchSnap = await db.collection('churches').doc(churchId).get();
        const church     = churchSnap.data() || {};
        const token: string = church.pcoAccessToken || '';
        if (!token) {
            res.status(400).json({ error: 'Planning Center is not connected.' });
            return;
        }

        // Fetch first page only to grab the totalCount from meta
        let url = '';
        if (listId) {
            url = `https://api.planningcenteronline.com/people/v2/lists/${listId}/people?per_page=1&fields[Person]=id`;
        } else {
            url = `https://api.planningcenteronline.com/groups/v2/groups/${groupId}/memberships?per_page=1`;
        }

        const pcoRes = await fetch(url, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        if (!pcoRes.ok) throw new Error(`PCO returned ${pcoRes.status}`);
        const data: any = await pcoRes.json();

        const totalCount: number = data.meta?.total_count ?? data.meta?.totalCount ?? (data.data?.length ?? 0);
        res.json({ success: true, totalCount });
    } catch (e: any) {
        console.error('[WorkflowEnrollPreview] Error:', e?.message);
        res.status(500).json({ error: e?.message || 'Preview failed' });
    }
}


export const workflowForceScan = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const { churchId } = req.body || {};
    if (!churchId) return res.status(400).json({ error: 'Missing churchId' });
    
    const db = getDb();
    const log = createServerLogger(db);
    
    try {
        const { runBirthdayAnniversaryScanner, runEventRegistrationScanner } = await import('./smsCampaignScheduler.js');
        // Run both asynchronously in the background. We don't need to wait for them.
        runBirthdayAnniversaryScanner(db).catch(e => console.error(e));
        runEventRegistrationScanner(db).catch(e => console.error(e));
        
        return res.json({ success: true, message: 'Scanners triggered' });
    } catch (e: any) {
        log.error('Force scan failed: ' + e.message, 'system', { churchId }, churchId);
        return res.status(500).json({ error: e.message });
    }
};

/**
 * GET /api/messaging/workflow-step-counts/:churchId/:workflowId
 * Returns a map of stepIndex -> count of active (non-completed) enrollments at that step.
 * Also returns totalActive and totalCompleted.
 */
export async function getWorkflowStepCounts(req: any, res: any): Promise<void> {
    const { churchId, workflowId } = req.params;
    if (!churchId || !workflowId) {
        res.status(400).json({ error: 'Missing churchId or workflowId' });
        return;
    }

    try {
        const db = getDb();

        // Load active (not completed) enrollments for this workflow
        const activeSnap = await db.collection('smsWorkflowEnrollments')
            .where('workflowId', '==', workflowId)
            .where('churchId', '==', churchId)
            .where('completed', '==', false)
            .get();

        const stepCounts: Record<number, number> = {};
        for (const doc of activeSnap.docs) {
            const step: number = doc.data().currentStep ?? 0;
            stepCounts[step] = (stepCounts[step] || 0) + 1;
        }

        // Load completed count separately
        const completedSnap = await db.collection('smsWorkflowEnrollments')
            .where('workflowId', '==', workflowId)
            .where('churchId', '==', churchId)
            .where('completed', '==', true)
            .get();

        res.json({
            stepCounts,          // { 0: 5, 1: 3, 2: 1 }
            totalActive: activeSnap.size,
            totalCompleted: completedSnap.size,
        });
    } catch (e: any) {
        console.error('[getWorkflowStepCounts] Error:', e?.message);
        res.status(500).json({ error: e?.message || 'Failed to get step counts' });
    }
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared re-sync business logic
// Re-resolves the PCO list/group attached to a workflow and enrolls any people
// who are NOT yet enrolled. Existing enrollments (active or completed) are
// skipped so people stay at their current workflow step.
// ─────────────────────────────────────────────────────────────────────────────
export async function reSyncWorkflow(
    workflowId: string,
    churchId: string,
    db: any,
): Promise<{ enrolled: number; skipped: number; noPhone: number; error?: string }> {
    // 1. Load workflow
    const wfDoc = await db.collection('smsWorkflows').doc(workflowId).get();
    if (!wfDoc.exists) return { enrolled: 0, skipped: 0, noPhone: 0, error: 'Workflow not found' };
    const wf = wfDoc.data() as any;
    if (wf.churchId !== churchId) return { enrolled: 0, skipped: 0, noPhone: 0, error: 'Forbidden' };
    if (!wf.steps?.length && !wf.nodes?.length) return { enrolled: 0, skipped: 0, noPhone: 0, error: 'Workflow has no steps' };

    // 2. Resolve list/group IDs — support list_add trigger and manual triggerGroupId field
    const listId: string | null  = wf.triggerListId  || null;
    const groupId: string | null = wf.triggerGroupId || null;
    if (!listId && !groupId) return { enrolled: 0, skipped: 0, noPhone: 0, error: 'No PCO list or group configured on this workflow' };

    // 3. Load PCO access token
    const churchSnap = await db.collection('churches').doc(churchId).get();
    const token: string = churchSnap.data()?.pcoAccessToken || '';
    if (!token) return { enrolled: 0, skipped: 0, noPhone: 0, error: 'Planning Center is not connected' };

    // 4. Resolve current PCO list/group members
    const persons = await resolvePcoPersons(token, listId, groupId);

    // 5. Enroll new people, skip existing
    let enrolled = 0;
    let skipped  = 0;
    let noPhone  = 0;
    const now       = Date.now();
    const batchSize = 25;

    for (let i = 0; i < persons.length; i += batchSize) {
        const chunk = persons.slice(i, i + batchSize);
        await Promise.all(chunk.map(async (person) => {
            if (!person.e164) { noPhone++; return; }

            // Always use a stable ID for re-sync — ensures we never double-enroll
            // someone who is already active OR has already completed the workflow.
            const stableId = person.personId
                ? `${workflowId}_${person.personId}`
                : `${workflowId}_${person.e164.replace(/\+/g, '')}`;

            const existing = await db.collection('smsWorkflowEnrollments').doc(stableId).get();
            if (existing.exists) { skipped++; return; }

            // New person — enroll at step 0
            const enrollId = wf.allowReentry
                ? `${stableId}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
                : stableId;

            const enrollment = {
                id:                enrollId,
                churchId,
                workflowId,
                phoneNumber:       person.e164,
                personName:        person.name        || null,
                personId:          person.personId    || null,
                currentStep:       0,
                nextSendAt:        now,
                completed:         false,
                enrolledAt:        now,
                lastStepSentAt:    null,
                personEmail:       person.email       || null,
                personCity:        person.city        || null,
                personState:       person.state       || null,
                personBirthdate:   person.birthdate   || null,
                personAnniversary: person.anniversary || null,
                enrollSource:      listId ? 'pco_list_resync' : 'pco_group_resync',
                enrollSourceId:    (listId || groupId) ?? null,
            };

            await db.collection('smsWorkflowEnrollments').doc(enrollId).set(enrollment);
            enrolled++;
        }));
    }

    // 6. Update enrolledCount and lastListSyncAt on the workflow
    if (enrolled > 0 || true /* always stamp lastListSyncAt */) {
        const updates: any = { lastListSyncAt: now, updatedAt: now };
        if (enrolled > 0) updates.enrolledCount = (wf.enrolledCount || 0) + enrolled;
        await db.collection('smsWorkflows').doc(workflowId).update(updates).catch(() => {});
    }

    return { enrolled, skipped, noPhone };
}

/**
 * POST /api/messaging/workflow-resync
 * Body: { churchId, workflowId }
 * Forces an immediate re-sync of the workflow's PCO list/group.
 */
export async function workflowReSyncHandler(req: any, res: any): Promise<void> {
    const { churchId, workflowId } = req.body || {};
    if (!churchId || !workflowId) {
        res.status(400).json({ error: 'Missing churchId or workflowId' });
        return;
    }
    const db = getDb();
    try {
        const result = await reSyncWorkflow(workflowId, churchId, db);
        if (result.error) {
            res.status(400).json({ error: result.error });
            return;
        }
        res.json({ success: true, ...result });
    } catch (e: any) {
        console.error('[workflowReSyncHandler] Error:', e?.message);
        res.status(500).json({ error: e?.message || 'Re-sync failed' });
    }
}

/**
 * Daily scanner: re-syncs all active list_add (and group-based) workflows.
 * Called by smsCampaignScheduler on a 24-hour interval.
 */
export async function runListWorkflowReSyncScanner(db: any): Promise<void> {
    const { createServerLogger } = await import('../services/logService.js');
    const log = createServerLogger(db);

    try {
        // Find all active workflows that have a list or group configured
        const snap = await db.collection('smsWorkflows')
            .where('isActive', '==', true)
            .where('trigger', '==', 'list_add')
            .get()
            .catch(() => null);

        // Also scan for manual/other workflows that have a triggerGroupId stored
        const groupSnap = await db.collection('smsWorkflows')
            .where('isActive', '==', true)
            .where('trigger', '==', 'manual')
            .get()
            .catch(() => null);

        const wfDocs: any[] = [
            ...(snap?.docs || []),
            ...((groupSnap?.docs || []).filter((d: any) => d.data().triggerGroupId)),
        ];

        if (wfDocs.length === 0) {
            log.info('[ListReSyncScanner] No active list/group workflows found — nothing to do.', 'system', {}, '');
            return;
        }

        log.info(`[ListReSyncScanner] Starting daily re-sync for ${wfDocs.length} workflow(s)`, 'system', {}, '');

        for (const wfDoc of wfDocs) {
            const wf       = wfDoc.data() as any;
            const wfId     = wfDoc.id;
            const churchId = wf.churchId;

            try {
                const result = await reSyncWorkflow(wfId, churchId, db);
                if (result.error) {
                    log.warn(`[ListReSyncScanner] Skipped "${wf.name}": ${result.error}`, 'system', { wfId }, churchId);
                } else {
                    log.info(
                        `[ListReSyncScanner] "${wf.name}" — enrolled ${result.enrolled}, skipped ${result.skipped} existing, ${result.noPhone} no-phone`,
                        'system', { wfId, ...result }, churchId
                    );
                }
            } catch (wfErr: any) {
                log.error(`[ListReSyncScanner] Error re-syncing "${wf.name}": ${wfErr.message}`, 'system', { wfId }, churchId);
            }
        }
    } catch (e: any) {
        console.error('[ListReSyncScanner] Fatal error:', e?.message);
    }
}
