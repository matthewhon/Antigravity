// ─── pcoFieldData.ts ─────────────────────────────────────────────────────────
//
// Writes SMS keyword subscription data to a custom "Pastoral Care" tab in the
// Planning Center People app using PCO's field_data API.
//
// Setup (one-time, done manually by a church admin in PCO):
//   People → Settings (gear icon) → Customize Fields
//     → Add Tab:   "Pastoral Care"
//     → Add Field: "SMS Subscriptions" (type: Checkboxes)
//
// After that, this module:
//   1. Discovers the field definition ID by scanning /people/v2/tabs.
//   2. Auto-creates a FieldOption per keyword via the API (no manual option mgmt).
//   3. Reads the person's existing checked values (pipe-separated).
//   4. Appends the new keyword and writes back.
//
// All public functions are fire-and-forget safe — they never throw.
// ─────────────────────────────────────────────────────────────────────────────

import { createServerLogger } from '../services/logService';

// ─── Constants ────────────────────────────────────────────────────────────────

const PCO_TAB_NAME       = 'Pastoral Care';
const PCO_FIELD_NAME     = 'SMS Subscriptions';
const PCO_DATE_FIELD     = 'Last Keyword Match'; // optional — written if found
const PCO_BASE           = 'https://api.planningcenteronline.com/people/v2';
const MAX_RETRIES        = 0; // fire-and-forget: no retries, just log

// ─── In-process cache ─────────────────────────────────────────────────────────
// Avoids repeated tab/field-discovery calls within the same server process.
// Structure: churchId → { smsFieldDefId, dateFieldDefId | null, fieldOptions: Set<string>, fetchedAt }

interface FieldCache {
    smsFieldDefId:  string | null;
    dateFieldDefId: string | null;
    fieldOptions:   Set<string>;  // set of option values (keyword names) already in PCO
    fetchedAt:      number;
}

const fieldCache = new Map<string, FieldCache>();
const CACHE_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours

// ─── PCO HTTP helper ──────────────────────────────────────────────────────────

async function pcoFetch(
    token: string,
    path: string,
    options: RequestInit = {}
): Promise<Response> {
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

// ─── Token loader ─────────────────────────────────────────────────────────────

async function loadToken(db: any, churchId: string): Promise<string | null> {
    const snap = await db.collection('churches').doc(churchId).get();
    return snap.exists ? (snap.data()?.pcoAccessToken || null) : null;
}

// ─── Field discovery ──────────────────────────────────────────────────────────

/**
 * Discover the "Pastoral Care" tab and "SMS Subscriptions" field definition IDs.
 * Also discovers "Last Keyword Match" date field if present.
 * Caches results in-process and in Firestore.
 */
async function resolveFieldIds(
    db: any,
    log: any,
    churchId: string,
    token: string
): Promise<{ smsFieldDefId: string | null; dateFieldDefId: string | null }> {
    // 1. Check in-process cache
    const cached = fieldCache.get(churchId);
    if (cached && Date.now() - cached.fetchedAt < CACHE_TTL_MS) {
        return { smsFieldDefId: cached.smsFieldDefId, dateFieldDefId: cached.dateFieldDefId };
    }

    // 2. Check Firestore cache (survives process restarts)
    try {
        const churchSnap = await db.collection('churches').doc(churchId).get();
        const cfg = churchSnap.data()?.pcoFieldConfig || {};
        if (cfg.smsSubscriptionsFieldId) {
            const entry: FieldCache = {
                smsFieldDefId:  cfg.smsSubscriptionsFieldId,
                dateFieldDefId: cfg.lastKeywordMatchFieldId || null,
                fieldOptions:   new Set<string>(),
                fetchedAt:      Date.now(),
            };
            fieldCache.set(churchId, entry);
            return { smsFieldDefId: entry.smsFieldDefId, dateFieldDefId: entry.dateFieldDefId };
        }
    } catch { /* fall through to live discovery */ }

    // 3. Live discovery — scan all tabs for "Pastoral Care"
    let tabId: string | null = null;
    try {
        const tabsRes = await pcoFetch(token, '/tabs?per_page=100');
        if (!tabsRes.ok) {
            log.warn('[PCOFieldData] Failed to fetch PCO tabs', 'system', { churchId, status: tabsRes.status }, churchId);
            return { smsFieldDefId: null, dateFieldDefId: null };
        }
        const tabsData = await tabsRes.json();
        const tab = (tabsData.data || []).find(
            (t: any) => (t.attributes?.name || '').toLowerCase() === PCO_TAB_NAME.toLowerCase()
        );
        if (!tab) {
            log.warn(
                `[PCOFieldData] "${PCO_TAB_NAME}" tab not found in PCO. Create it in People → Settings → Customize Fields.`,
                'system', { churchId }, churchId
            );
            return { smsFieldDefId: null, dateFieldDefId: null };
        }
        tabId = tab.id as string;
    } catch (e: any) {
        log.warn(`[PCOFieldData] Error fetching tabs: ${e.message}`, 'system', { churchId }, churchId);
        return { smsFieldDefId: null, dateFieldDefId: null };
    }

    // 4. Fetch field definitions for the tab
    let smsFieldDefId: string | null   = null;
    let dateFieldDefId: string | null  = null;
    try {
        const defsRes = await pcoFetch(token, `/tabs/${tabId}/field_definitions?per_page=100`);
        if (defsRes.ok) {
            const defsData = await defsRes.json();
            for (const def of (defsData.data || [])) {
                const name = (def.attributes?.name || '').trim();
                if (name.toLowerCase() === PCO_FIELD_NAME.toLowerCase()) {
                    smsFieldDefId = def.id;
                }
                if (name.toLowerCase() === PCO_DATE_FIELD.toLowerCase()) {
                    dateFieldDefId = def.id;
                }
            }
        }
    } catch (e: any) {
        log.warn(`[PCOFieldData] Error fetching field definitions: ${e.message}`, 'system', { churchId }, churchId);
    }

    if (!smsFieldDefId) {
        log.warn(
            `[PCOFieldData] "${PCO_FIELD_NAME}" field not found under "${PCO_TAB_NAME}" tab. Add a Checkboxes field with that name.`,
            'system', { churchId }, churchId
        );
    } else {
        log.info(
            `[PCOFieldData] Discovered field defs — sms:${smsFieldDefId} date:${dateFieldDefId || 'none'}`,
            'system', { churchId }, churchId
        );
        // Persist to Firestore so future process starts skip live discovery
        try {
            await db.collection('churches').doc(churchId).update({
                'pcoFieldConfig.smsSubscriptionsFieldId': smsFieldDefId,
                'pcoFieldConfig.lastKeywordMatchFieldId': dateFieldDefId || null,
            });
        } catch { /* best-effort */ }
    }

    const entry: FieldCache = {
        smsFieldDefId,
        dateFieldDefId,
        fieldOptions: new Set<string>(),
        fetchedAt: Date.now(),
    };
    fieldCache.set(churchId, entry);
    return { smsFieldDefId, dateFieldDefId };
}

// ─── Checkbox option sync ─────────────────────────────────────────────────────

/**
 * Ensures a FieldOption with the given keyword label exists under the
 * SMS Subscriptions checkbox field definition. Creates it if missing.
 */
async function ensureCheckboxOption(
    db: any,
    log: any,
    churchId: string,
    token: string,
    smsFieldDefId: string,
    keyword: string
): Promise<void> {
    const cache = fieldCache.get(churchId);

    // Check in-process set first
    if (cache?.fieldOptions.has(keyword)) return;

    // Fetch existing options from PCO
    try {
        const res = await pcoFetch(token, `/field_definitions/${smsFieldDefId}/field_options?per_page=200`);
        if (res.ok) {
            const data = await res.json();
            const existing = new Set<string>(
                (data.data || []).map((o: any) => (o.attributes?.value || '').toUpperCase())
            );
            // Update in-process cache with all known options
            if (cache) {
                for (const v of existing) cache.fieldOptions.add(v);
            }
            if (existing.has(keyword.toUpperCase())) return; // already exists
        }
    } catch { /* fall through to create */ }

    // Create the missing option
    try {
        const sequence = (cache?.fieldOptions.size || 0) + 1;
        const createRes = await pcoFetch(token, `/field_definitions/${smsFieldDefId}/field_options`, {
            method: 'POST',
            body: JSON.stringify({
                data: {
                    type: 'FieldOption',
                    attributes: { value: keyword.toUpperCase(), sequence },
                },
            }),
        });
        if (createRes.ok) {
            cache?.fieldOptions.add(keyword.toUpperCase());
            log.info(
                `[PCOFieldData] Created checkbox option "${keyword}" on field ${smsFieldDefId}`,
                'system', { churchId, keyword }, churchId
            );
        } else {
            const err = await createRes.text().catch(() => '');
            log.warn(
                `[PCOFieldData] Failed to create checkbox option "${keyword}": ${createRes.status} ${err.slice(0, 200)}`,
                'system', { churchId, keyword }, churchId
            );
        }
    } catch (e: any) {
        log.warn(`[PCOFieldData] Error creating checkbox option: ${e.message}`, 'system', { churchId }, churchId);
    }
}

// ─── Field datum read / write ─────────────────────────────────────────────────

/** Returns { datumId, currentValue } for the person's SMS Subscriptions field, or null if none. */
async function getExistingDatum(
    token: string,
    personId: string,
    fieldDefId: string
): Promise<{ datumId: string; currentValue: string } | null> {
    try {
        const res = await pcoFetch(
            token,
            `/people/${personId}/field_data?include=field_definition&per_page=100`
        );
        if (!res.ok) return null;
        const data = await res.json();
        const match = (data.data || []).find(
            (d: any) => d.relationships?.field_definition?.data?.id === fieldDefId
        );
        if (!match) return null;
        return { datumId: match.id, currentValue: match.attributes?.value || '' };
    } catch {
        return null;
    }
}

/**
 * Appends `keyword` to the person's pipe-separated checkbox value and writes it back.
 * Creates the FieldDatum if it doesn't exist yet for this person.
 */
async function writeCheckboxValue(
    log: any,
    churchId: string,
    token: string,
    personId: string,
    fieldDefId: string,
    keyword: string
): Promise<void> {
    const existing = await getExistingDatum(token, personId, fieldDefId);

    // Build new pipe-separated value (deduplicated, uppercased)
    const currentKeywords = existing?.currentValue
        ? existing.currentValue.split('|').map(v => v.trim().toUpperCase()).filter(Boolean)
        : [];

    if (currentKeywords.includes(keyword.toUpperCase())) {
        // Already checked — Q2: ignore duplicates
        return;
    }

    currentKeywords.push(keyword.toUpperCase());
    const newValue = currentKeywords.join('|');

    const payload = JSON.stringify({
        data: {
            type: 'FieldDatum',
            attributes: { value: newValue },
            relationships: {
                field_definition: { data: { type: 'FieldDefinition', id: fieldDefId } },
                customizable: { data: { type: 'Person', id: personId } },
            },
        },
    });

    try {
        let res: Response;
        if (existing?.datumId) {
            // Update existing datum
            res = await pcoFetch(token, `/field_data/${existing.datumId}`, {
                method: 'PATCH',
                body: payload,
            });
        } else {
            // Create new datum
            res = await pcoFetch(token, `/field_data`, {
                method: 'POST',
                body: payload,
            });
        }

        if (!res.ok) {
            const err = await res.text().catch(() => '');
            log.warn(
                `[PCOFieldData] field_data write failed for person ${personId}: ${res.status} ${err.slice(0, 200)}`,
                'system', { churchId, personId, keyword }, churchId
            );
        } else {
            log.info(
                `[PCOFieldData] Checked "${keyword}" on person ${personId} (value: ${newValue})`,
                'system', { churchId, personId, keyword }, churchId
            );
        }
    } catch (e: any) {
        log.warn(`[PCOFieldData] Unexpected error writing field_data: ${e.message}`, 'system', { churchId, personId }, churchId);
    }
}

/** Writes the "Last Keyword Match" date field if the field definition exists. */
async function writeDateField(
    token: string,
    personId: string,
    fieldDefId: string
): Promise<void> {
    const existing = await getExistingDatum(token, personId, fieldDefId);
    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

    const payload = JSON.stringify({
        data: {
            type: 'FieldDatum',
            attributes: { value: today },
            relationships: {
                field_definition: { data: { type: 'FieldDefinition', id: fieldDefId } },
                customizable: { data: { type: 'Person', id: personId } },
            },
        },
    });

    try {
        if (existing?.datumId) {
            await pcoFetch(token, `/field_data/${existing.datumId}`, { method: 'PATCH', body: payload });
        } else {
            await pcoFetch(token, `/field_data`, { method: 'POST', body: payload });
        }
    } catch { /* best-effort */ }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Main entry point. Called after a keyword match to:
 *   1. Discover (and cache) the PCO field definition IDs.
 *   2. Ensure the keyword has a checkbox option in PCO.
 *   3. Check the keyword checkbox on the person's PCO profile.
 *   4. Update the "Last Keyword Match" date field if present.
 *
 * This function is fire-and-forget safe — it swallows all errors internally.
 */
export async function updatePcoSubscriptionField(params: {
    db: any;
    log: any;
    churchId: string;
    personId: string;   // PCO People person ID
    keyword: string;    // uppercased keyword label, e.g. "YOUTH"
}): Promise<void> {
    const { db, log, churchId, personId, keyword } = params;

    try {
        const token = await loadToken(db, churchId);
        if (!token) {
            log.warn('[PCOFieldData] No PCO access token — skipping field update', 'system', { churchId, personId }, churchId);
            return;
        }

        const { smsFieldDefId, dateFieldDefId } = await resolveFieldIds(db, log, churchId, token);
        if (!smsFieldDefId) return; // tab/field not set up yet — already warned

        // Ensure checkbox option exists for this keyword
        await ensureCheckboxOption(db, log, churchId, token, smsFieldDefId, keyword);

        // Check the keyword box on this person's profile
        await writeCheckboxValue(log, churchId, token, personId, smsFieldDefId, keyword);

        // Update "Last Keyword Match" date (best-effort)
        if (dateFieldDefId) {
            await writeDateField(token, personId, dateFieldDefId);
        }
    } catch (e: any) {
        log.warn(`[PCOFieldData] Unhandled error in updatePcoSubscriptionField: ${e.message}`, 'system', { churchId, personId, keyword }, churchId);
    }
}

/**
 * Invalidates the in-process field ID cache for a church.
 * Call this after the church reconnects PCO or changes the field configuration.
 */
export function invalidatePcoFieldCache(churchId: string): void {
    fieldCache.delete(churchId);
}
