// ─── pcoPersonUpdate.ts ───────────────────────────────────────────────────────
//
// Maps collected field data from a Church Helper campaign session back to the
// correct Planning Center People API endpoints.
//
// Supported field keys and their PCO targets:
//   phone_mobile / phone_home  → POST /people/v2/people/:id/phone_numbers
//   email_primary              → POST /people/v2/people/:id/emails
//   address_home               → POST /people/v2/people/:id/addresses
//   birthdate / anniversary    → PATCH /people/v2/people/:id
//   marital_status / gender    → PATCH /people/v2/people/:id
//   graduation_year / school   → PATCH /people/v2/people/:id
//   custom_*                   → POST/PATCH /people/v2/field_data
//
// All functions are fire-and-forget safe at the call site.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerLogger } from '../services/logService';

const PCO_BASE = 'https://api.planningcenteronline.com/people/v2';

async function loadToken(db: any, churchId: string): Promise<string | null> {
    const snap = await db.collection('churches').doc(churchId).get();
    return snap.exists ? (snap.data()?.pcoAccessToken || null) : null;
}

async function pcoFetch(token: string, path: string, options: RequestInit = {}): Promise<Response> {
    return fetch(`${PCO_BASE}${path}`, {
        ...options,
        headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'PastoralCareApp/1.0',
            ...(options.headers || {}),
        },
    });
}

export interface FieldSpec {
    key: string;
    label: string;
    required: boolean;
    pcoPath: string;
    fieldType: 'standard' | 'custom';
    pcoFieldDefId?: string;
}

export const FIELD_CATALOG: FieldSpec[] = [
    { key: 'phone_mobile',      label: 'Mobile Phone',      required: false, pcoPath: 'phone_numbers', fieldType: 'standard' },
    { key: 'phone_home',        label: 'Home Phone',        required: false, pcoPath: 'phone_numbers', fieldType: 'standard' },
    { key: 'email_primary',     label: 'Primary Email',     required: false, pcoPath: 'emails',        fieldType: 'standard' },
    { key: 'address_home',      label: 'Home Address',      required: false, pcoPath: 'addresses',     fieldType: 'standard' },
    { key: 'birthdate',         label: 'Birthday',          required: false, pcoPath: 'person',        fieldType: 'standard' },
    { key: 'anniversary',       label: 'Anniversary',       required: false, pcoPath: 'person',        fieldType: 'standard' },
    { key: 'marital_status',    label: 'Marital Status',    required: false, pcoPath: 'person',        fieldType: 'standard' },
    { key: 'gender',            label: 'Gender',            required: false, pcoPath: 'person',        fieldType: 'standard' },
    { key: 'graduation_year',   label: 'Graduation Year',   required: false, pcoPath: 'person',        fieldType: 'standard' },
    { key: 'school',            label: 'School',            required: false, pcoPath: 'person',        fieldType: 'standard' },
    { key: 'membership',        label: 'Membership Type',   required: false, pcoPath: 'person',        fieldType: 'standard' },
    { key: 'emergency_contact', label: 'Emergency Contact', required: false, pcoPath: 'field_data',    fieldType: 'custom'   },
];

async function writePhone(token: string, personId: string, value: string, location: 'Mobile' | 'Home'): Promise<string | null> {
    const existing = await pcoFetch(token, `/people/${personId}/phone_numbers?per_page=50`);
    if (existing.ok) {
        const data = await existing.json();
        const normalized = value.replace(/\D/g, '');
        const duplicate = (data.data || []).find((p: any) => p.attributes?.number?.replace(/\D/g, '') === normalized);
        if (duplicate) return null;
    }
    const res = await pcoFetch(token, `/people/${personId}/phone_numbers`, {
        method: 'POST',
        body: JSON.stringify({ data: { type: 'PhoneNumber', attributes: { number: value, location, primary: location === 'Mobile' } } }),
    });
    if (!res.ok) { const err = await res.text().catch(() => ''); return `PCO phone write failed (${res.status}): ${err.slice(0, 200)}`; }
    return null;
}

async function writeEmail(token: string, personId: string, value: string): Promise<string | null> {
    const existing = await pcoFetch(token, `/people/${personId}/emails?per_page=50`);
    if (existing.ok) {
        const data = await existing.json();
        const duplicate = (data.data || []).find((e: any) => (e.attributes?.address || '').toLowerCase() === value.toLowerCase());
        if (duplicate) return null;
    }
    const res = await pcoFetch(token, `/people/${personId}/emails`, {
        method: 'POST',
        body: JSON.stringify({ data: { type: 'Email', attributes: { address: value, location: 'Home', primary: true } } }),
    });
    if (!res.ok) { const err = await res.text().catch(() => ''); return `PCO email write failed (${res.status}): ${err.slice(0, 200)}`; }
    return null;
}

async function writeAddress(token: string, personId: string, value: string): Promise<string | null> {
    const parts = value.split(',').map(s => s.trim());
    const street = parts[0] || value;
    const city   = parts[1] || '';
    const stateZip = (parts[2] || '').trim().split(/\s+/);
    const state  = stateZip[0] || '';
    const zip    = stateZip[1] || '';
    const res = await pcoFetch(token, `/people/${personId}/addresses`, {
        method: 'POST',
        body: JSON.stringify({ data: { type: 'Address', attributes: { street, city, state, zip, location: 'Home', primary: true } } }),
    });
    if (!res.ok) { const err = await res.text().catch(() => ''); return `PCO address write failed (${res.status}): ${err.slice(0, 200)}`; }
    return null;
}

async function writeCustomField(token: string, personId: string, fieldDefId: string, value: string): Promise<string | null> {
    const existingRes = await pcoFetch(token, `/people/${personId}/field_data?per_page=100`);
    let existingDatumId: string | null = null;
    if (existingRes.ok) {
        const data = await existingRes.json();
        const match = (data.data || []).find((d: any) => d.relationships?.field_definition?.data?.id === fieldDefId);
        if (match) existingDatumId = match.id;
    }
    const payload = JSON.stringify({
        data: {
            type: 'FieldDatum',
            attributes: { value },
            relationships: {
                field_definition: { data: { type: 'FieldDefinition', id: fieldDefId } },
                customizable: { data: { type: 'Person', id: personId } },
            },
        },
    });
    const res = existingDatumId
        ? await pcoFetch(token, `/field_data/${existingDatumId}`, { method: 'PATCH', body: payload })
        : await pcoFetch(token, `/field_data`, { method: 'POST', body: payload });
    if (!res.ok) { const err = await res.text().catch(() => ''); return `PCO custom field write failed (${res.status}): ${err.slice(0, 200)}`; }
    return null;
}

export interface WriteResult { success: boolean; errors: string[]; }

export async function writePersonDataToPco(params: {
    db: any;
    log: any;
    churchId: string;
    pcoPersonId: string;
    collectedData: Record<string, string>;
    fieldsToCollect: FieldSpec[];
}): Promise<WriteResult> {
    const { db, log, churchId, pcoPersonId, collectedData, fieldsToCollect } = params;
    const errors: string[] = [];
    try {
        const token = await loadToken(db, churchId);
        if (!token) return { success: false, errors: ['No PCO access token available'] };

        // 1. Batch standard person attrs into a single PATCH
        const personAttrs: Record<string, any> = {};
        const PERSON_ATTR_KEYS = ['birthdate', 'anniversary', 'marital_status', 'gender', 'graduation_year', 'school', 'membership'];
        for (const key of PERSON_ATTR_KEYS) {
            if (collectedData[key]) {
                personAttrs[key] = key === 'graduation_year'
                    ? (parseInt(collectedData[key], 10) || collectedData[key])
                    : collectedData[key];
            }
        }
        if (Object.keys(personAttrs).length > 0) {
            const res = await pcoFetch(token, `/people/${pcoPersonId}`, {
                method: 'PATCH',
                body: JSON.stringify({ data: { type: 'Person', id: pcoPersonId, attributes: personAttrs } }),
            });
            if (!res.ok) { const err = await res.text().catch(() => ''); errors.push(`PCO person PATCH failed (${res.status}): ${err.slice(0, 200)}`); }
            else log.info(`[PcoPersonUpdate] PATCH person attrs for ${pcoPersonId}`, 'system', { churchId, pcoPersonId }, churchId);
        }

        // 2. Phone
        if (collectedData['phone_mobile']) {
            const err = await writePhone(token, pcoPersonId, collectedData['phone_mobile'], 'Mobile');
            if (err) errors.push(err);
            else log.info(`[PcoPersonUpdate] Wrote mobile phone for ${pcoPersonId}`, 'system', { churchId, pcoPersonId }, churchId);
        }
        if (collectedData['phone_home']) {
            const err = await writePhone(token, pcoPersonId, collectedData['phone_home'], 'Home');
            if (err) errors.push(err);
        }

        // 3. Email
        if (collectedData['email_primary']) {
            const err = await writeEmail(token, pcoPersonId, collectedData['email_primary']);
            if (err) errors.push(err);
            else log.info(`[PcoPersonUpdate] Wrote email for ${pcoPersonId}`, 'system', { churchId, pcoPersonId }, churchId);
        }

        // 4. Address
        if (collectedData['address_home']) {
            const err = await writeAddress(token, pcoPersonId, collectedData['address_home']);
            if (err) errors.push(err);
            else log.info(`[PcoPersonUpdate] Wrote address for ${pcoPersonId}`, 'system', { churchId, pcoPersonId }, churchId);
        }

        // 5. Custom fields
        for (const field of fieldsToCollect.filter(f => f.fieldType === 'custom' && f.pcoFieldDefId && collectedData[f.key])) {
            const err = await writeCustomField(token, pcoPersonId, field.pcoFieldDefId!, collectedData[field.key]);
            if (err) errors.push(err);
            else log.info(`[PcoPersonUpdate] Wrote custom field ${field.key} for ${pcoPersonId}`, 'system', { churchId, pcoPersonId }, churchId);
        }

        const success = errors.length === 0;
        if (!success) log.warn(`[PcoPersonUpdate] Partial errors for ${pcoPersonId}`, 'system', { churchId, errors }, churchId);
        return { success, errors };
    } catch (e: any) {
        log.warn(`[PcoPersonUpdate] Unexpected error for ${pcoPersonId}: ${e.message}`, 'system', { churchId, pcoPersonId }, churchId);
        return { success: false, errors: [e.message] };
    }
}
