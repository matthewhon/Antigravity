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
async function resolvePcoPersons(
    token: string,
    listId?: string | null,
    groupId?: string | null,
): Promise<PersonInfo[]> {
    const persons: PersonInfo[] = [];

    if (listId) {
        // PCO People Lists API — include emails & addresses for merge tags
        let url: string | null =
            `https://api.planningcenteronline.com/people/v2/lists/${listId}/people` +
            `?per_page=100&include=emails,addresses` +
            `&fields[Person]=name,first_name,last_name,phone_numbers,birthdate,anniversary`;

        while (url) {
            const res = await fetch(url, {
                headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
            });
            if (!res.ok) throw new Error(`PCO List API returned ${res.status}`);
            const data: any = await res.json();

            const included: any[] = data.included || [];
            const emailByPersonId = new Map<string, string>();
            const cityByPersonId  = new Map<string, string>();
            const stateByPersonId = new Map<string, string>();

            for (const inc of included) {
                const attrs    = inc.attributes || {};
                const personId = inc.relationships?.person?.data?.id;
                if (!personId) continue;
                if (inc.type === 'Email' && attrs.primary)   emailByPersonId.set(personId, attrs.address || '');
                if (inc.type === 'Address' && attrs.primary) {
                    cityByPersonId.set(personId,  attrs.city  || '');
                    stateByPersonId.set(personId, attrs.state || '');
                }
            }

            for (const person of (data.data || [])) {
                const attrs      = person.attributes || {};
                const phones_    = attrs.phone_numbers || [];
                const primary    = phones_.find((p: any) => p.primary) || phones_[0];
                const rawPhone   = primary?.number || '';
                const digits     = rawPhone.replace(/\D/g, '');
                const e164       = digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : '';
                if (!e164) continue;

                persons.push({
                    e164,
                    name:        attrs.name || `${attrs.first_name || ''} ${attrs.last_name || ''}`.trim(),
                    personId:    person.id || null,
                    email:       emailByPersonId.get(person.id) || '',
                    city:        cityByPersonId.get(person.id)  || '',
                    state:       stateByPersonId.get(person.id) || '',
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
                if (!e164) continue;

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
                const enrollId = person.personId
                    ? `${workflowId}_${person.personId}`
                    : `${workflowId}_${person.e164.replace(/\+/g, '')}`;

                const existing = await db.collection('smsWorkflowEnrollments').doc(enrollId).get();
                if (existing.exists) {
                    skipped++;
                    return;
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
