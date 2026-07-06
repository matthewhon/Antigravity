// ─── pcoRegistrationsService.ts ────────────────────────────────────────────────
//
// Interacts with Planning Center's Registrations v2 and People v2 APIs.
// Handles retrieving signup details, custom questions, creating PCO people,
// and registering attendees with dynamic answers.
//
// ─────────────────────────────────────────────────────────────────────────────

import { getDb } from './firebase.js';
import { createServerLogger } from '../services/logService.js';

const PCO_BASE = 'https://api.planningcenteronline.com';

// Mocks for unit testing
export const mocks = {
    getPcoSignupQuestions: null as null | ((churchId: string, signupId: string) => Promise<any[]>),
    createPcoPerson: null as null | ((churchId: string, firstName: string, lastName: string, email: string | null, phone: string) => Promise<string>),
    registerPersonForEvent: null as null | ((churchId: string, personId: string, signupId: string, answers: Record<string, string>) => Promise<{ registrationId: string; attendeeId: string }>)
};

/**
 * Low-level helper to execute requests against Planning Center API with token refresh.
 */
export async function requestPco(
    churchId: string,
    url: string,
    method: 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE' = 'GET',
    body?: any
): Promise<any> {
    const db = getDb();
    const log = createServerLogger(db);

    const churchDoc = await db.collection('churches').doc(churchId).get();
    if (!churchDoc.exists) throw new Error('Church not found');
    const churchData = churchDoc.data();
    let accessToken = churchData?.pcoAccessToken;
    const refreshToken = churchData?.pcoRefreshToken;

    if (!accessToken) throw new Error('No PCO access token');

    const performReq = async (token: string) => {
        const headers: any = {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': 'PastoralCareApp/1.0',
        };
        const options: RequestInit = { method, headers };
        if (body && (method === 'POST' || method === 'PUT' || method === 'PATCH')) {
            options.body = JSON.stringify(body);
        }
        return fetch(url, options);
    };

    let response = await performReq(accessToken);

    if (response.status === 401 && refreshToken) {
        log.info(`PCO access token expired in registrations service — refreshing`, 'system', { churchId }, churchId);
        
        const settingsDoc = await db.doc('system/settings').get();
        const settings = settingsDoc.data() || {};
        const clientId = (settings.pcoClientId || '').trim();
        const clientSecret = (settings.pcoClientSecret || '').trim();

        if (clientId && clientSecret) {
            const refreshParams = new URLSearchParams();
            refreshParams.append('grant_type', 'refresh_token');
            refreshParams.append('refresh_token', refreshToken);
            refreshParams.append('client_id', clientId);
            refreshParams.append('client_secret', clientSecret);

            const refreshRes = await fetch('https://api.planningcenteronline.com/oauth/token', {
                method: 'POST',
                body: refreshParams,
            });

            if (refreshRes.ok) {
                const tokenData = await refreshRes.json();
                accessToken = tokenData.access_token;
                await db.collection('churches').doc(churchId).update({
                    pcoAccessToken: accessToken,
                    pcoRefreshToken: tokenData.refresh_token,
                    pcoTokenExpiry: Date.now() + (tokenData.expires_in * 1000),
                });
                response = await performReq(accessToken);
            }
        }
    }

    if (!response.ok) {
        const errText = await response.text().catch(() => '');
        let errorMsg = `PCO API error: ${response.status} — ${errText.slice(0, 300)}`;
        if (response.status === 401) errorMsg = 'Unauthorized: PCO session expired. Please reconnect Planning Center.';
        if (response.status === 403) errorMsg = 'Forbidden: Your PCO connection lacks the necessary scopes (e.g. registrations).';
        throw new Error(errorMsg);
    }

    return response.json();
}

/**
 * Fetch details of a PCO Registrations signup form.
 */
export async function getPcoSignupDetails(
    churchId: string,
    signupId: string
): Promise<{ id: string; name: string; isPaid: boolean; publicUrl: string | null }> {
    const data = await requestPco(churchId, `${PCO_BASE}/registrations/v2/signups/${signupId}`);
    const attributes = data.data?.attributes || {};
    
    // Check if there are fees configured on the signup.
    const hasFeesCount = (attributes.registration_fees_count || 0) > 0;
    const isPaid = hasFeesCount;
    
    return {
        id: data.data.id,
        name: attributes.name || 'Event Signup',
        isPaid,
        publicUrl: attributes.church_center_url || attributes.public_url || null,
    };
}

/**
 * Fetch custom questions associated with a PCO Registrations signup form.
 */
export async function getPcoSignupQuestions(
    churchId: string,
    signupId: string
): Promise<any[]> {
    if (mocks.getPcoSignupQuestions) {
        return mocks.getPcoSignupQuestions(churchId, signupId);
    }
    const data = await requestPco(churchId, `${PCO_BASE}/registrations/v2/signups/${signupId}/questions?per_page=100`);
    const rawQuestions = data.data || [];
    
    return rawQuestions.map((q: any) => {
        const attrs = q.attributes || {};
        const rawOptions = attrs.options || [];
        const options = rawOptions.map((o: any) => {
            if (typeof o === 'string') return o;
            return o?.value || o?.name || JSON.stringify(o);
        });
        
        return {
            id: q.id,
            label: attrs.label || attrs.text || attrs.title || '',
            kind: attrs.kind || 'string',
            required: !!attrs.required,
            options,
        };
    });
}

/**
 * Create a new Person record in PCO People and attach their email and phone.
 */
export async function createPcoPerson(
    churchId: string,
    firstName: string,
    lastName: string,
    email: string | null,
    phone: string
): Promise<string> {
    const db = getDb();
    const log = createServerLogger(db);

    if (mocks.createPcoPerson) {
        return mocks.createPcoPerson(churchId, firstName, lastName, email, phone);
    }

    log.info(`Creating new PCO Person: ${firstName} ${lastName}`, 'system', { firstName, lastName, email, phone }, churchId);

    // 1. POST the Person record
    const personRes = await requestPco(churchId, `${PCO_BASE}/people/v2/people`, 'POST', {
        data: {
            type: 'Person',
            attributes: {
                first_name: firstName,
                last_name: lastName,
            },
        },
    });

    const personId = personRes.data.id;

    // 2. Attach Email (if provided)
    if (email && email.trim()) {
        try {
            await requestPco(churchId, `${PCO_BASE}/people/v2/people/${personId}/emails`, 'POST', {
                data: {
                    type: 'Email',
                    attributes: {
                        address: email.trim(),
                        location: 'Home',
                        primary: true,
                    },
                },
            });
        } catch (e: any) {
            log.warn(`Failed to attach email to new person ${personId}: ${e.message}`, 'system', { personId }, churchId);
        }
    }

    // 3. Attach Phone Number
    try {
        await requestPco(churchId, `${PCO_BASE}/people/v2/people/${personId}/phone_numbers`, 'POST', {
            data: {
                type: 'PhoneNumber',
                attributes: {
                    number: phone,
                    location: 'Mobile',
                    primary: true,
                },
            },
        });
    } catch (e: any) {
        log.warn(`Failed to attach phone number to new person ${personId}: ${e.message}`, 'system', { personId }, churchId);
    }

    // Proactively queue a sync for this person locally in our system
    try {
        const personData = {
            id: personId,
            churchId,
            name: `${firstName} ${lastName}`,
            first_name: firstName,
            last_name: lastName,
            email: email || null,
            phone: phone,
            e164Phone: phone,
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        await db.collection('people').doc(personId).set(personData);
    } catch (err: any) {
        log.warn(`Failed to cache new person locally: ${err.message}`, 'system', { personId }, churchId);
    }

    return personId;
}

/**
 * Register a person for an event, adding the attendee record and answers.
 */
export async function registerPersonForEvent(
    churchId: string,
    personId: string,
    signupId: string,
    answers: Record<string, string>
): Promise<{ registrationId: string; attendeeId: string }> {
    const db = getDb();
    const log = createServerLogger(db);

    if (mocks.registerPersonForEvent) {
        return mocks.registerPersonForEvent(churchId, personId, signupId, answers);
    }

    // 1. Fetch Person Details (to populate attendee fields)
    const personDoc = await db.collection('people').doc(personId).get();
    let firstName = 'Guest';
    let lastName = '';
    let email = '';

    if (personDoc.exists) {
        const p = personDoc.data() || {};
        firstName = p.first_name || p.name?.split(' ')[0] || 'Guest';
        lastName = p.last_name || p.name?.split(' ').slice(1).join(' ') || '';
        email = p.email || '';
    } else {
        // Fallback: Query PCO People directly
        try {
            const pRes = await requestPco(churchId, `${PCO_BASE}/people/v2/people/${personId}`);
            const attrs = pRes.data?.attributes || {};
            firstName = attrs.first_name || 'Guest';
            lastName = attrs.last_name || '';
            
            // Fetch primary email
            const emailRes = await requestPco(churchId, `${PCO_BASE}/people/v2/people/${personId}/emails?where[primary]=true`);
            if (emailRes.data && emailRes.data.length > 0) {
                email = emailRes.data[0].attributes?.address || '';
            }
        } catch (e: any) {
            log.warn(`Failed to fetch person details for registration: ${e.message}`, 'system', { personId }, churchId);
        }
    }

    // 2. Create the Registration shell
    log.info(`Creating PCO Registration for person ${personId} on signup ${signupId}`, 'system', { personId, signupId }, churchId);
    const regRes = await requestPco(churchId, `${PCO_BASE}/registrations/v2/registrations`, 'POST', {
        data: {
            type: 'Registration',
            attributes: {},
            relationships: {
                signup: {
                    data: { type: 'Signup', id: signupId }
                },
                primary_contact: {
                    data: { type: 'Person', id: personId }
                }
            }
        }
    });

    const registrationId = regRes.data.id;

    // 3. Create the Attendee record
    log.info(`Creating PCO Attendee on registration ${registrationId}`, 'system', { registrationId, personId }, churchId);
    const attendeeRes = await requestPco(churchId, `${PCO_BASE}/registrations/v2/registrations/${registrationId}/attendees`, 'POST', {
        data: {
            type: 'Attendee',
            attributes: {
                first_name: firstName,
                last_name: lastName,
                email: email || null,
            },
            relationships: {
                person: {
                    data: { type: 'Person', id: personId }
                }
            }
        }
    });

    const attendeeId = attendeeRes.data.id;

    // 4. Submit Answers (if any)
    for (const [questionId, value] of Object.entries(answers)) {
        if (value === undefined || value === null) continue;
        
        try {
            log.info(`Submitting answer for attendee ${attendeeId}, question ${questionId}: "${value}"`, 'system', { attendeeId, questionId }, churchId);
            await requestPco(churchId, `${PCO_BASE}/registrations/v2/attendees/${attendeeId}/answers`, 'POST', {
                data: {
                    type: 'Answer',
                    attributes: {
                        value: String(value)
                    },
                    relationships: {
                        question: {
                            data: { type: 'Question', id: questionId }
                        }
                    }
                }
            });
        } catch (ansErr: any) {
            log.warn(`Failed to submit answer for question ${questionId}: ${ansErr.message}`, 'system', { attendeeId, questionId }, churchId);
        }
    }

    return { registrationId, attendeeId };
}
