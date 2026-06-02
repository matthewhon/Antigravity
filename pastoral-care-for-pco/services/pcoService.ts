import { PcoPerson } from '../types';
import { auth, db } from './firebase';
import { getDoc, doc } from 'firebase/firestore';

const isReviewUser = (email?: string | null): boolean => {
    if (!email) return false;
    const clean = email.toLowerCase().trim();
    return clean === 'test@test.com' || clean === 'text@test.com';
};

const isSimulated = (churchId: string): boolean => {
    return churchId === 'c1' || isReviewUser(auth.currentUser?.email);
};

const MOCK_PCO_GROUPS = [
    {
        id: 'c1_grp0001',
        type: 'Group',
        attributes: {
            name: 'Young Adults Ministry',
            memberships_count: 18,
            member_count: 18
        }
    },
    {
        id: 'c1_grp0003',
        type: 'Group',
        attributes: {
            name: "Men's Bible Study",
            memberships_count: 14,
            member_count: 14
        }
    },
    {
        id: 'c1_grp0006',
        type: 'Group',
        attributes: {
            name: 'Youth Group (6th–12th)',
            memberships_count: 25,
            member_count: 25
        }
    }
];

const MOCK_PCO_LISTS = [
    {
        id: 'pco_list_all_members',
        type: 'List',
        attributes: {
            name: 'All Members',
            total_people: 120
        }
    },
    {
        id: 'pco_list_women',
        type: 'List',
        attributes: {
            name: "Women's Ministry List",
            total_people: 16
        }
    },
    {
        id: 'pco_list_new_visitors',
        type: 'List',
        attributes: {
            name: 'New Visitors',
            total_people: 5
        }
    },
    {
        id: 'pco_list_volunteers',
        type: 'List',
        attributes: {
            name: 'Volunteers',
            total_people: 8
        }
    }
];

const MOCK_MEMBERS = [
    { id: 'pco_person_001', name: 'Marcus Thompson', emails: ['marcus.t@example.com'], phones: ['+15550020001'] },
    { id: 'pco_person_002', name: 'Lisa Chen', emails: ['lisa.chen@example.com'], phones: ['+15550020002'] },
    { id: 'pco_person_003', name: 'James Okafor', emails: ['james.okafor@example.com'], phones: ['+15550020003'] },
    { id: 'pco_person_004', name: 'Destiny Williams', emails: ['destiny.w@example.com'], phones: ['+15550020004'] },
    { id: 'pco_person_005', name: 'Robert Park', emails: ['robert.park@example.com'], phones: ['+15550020005'] },
    { id: 'pco_person_006', name: 'Sarah Mitchell', emails: ['sarah.m@example.com'], phones: ['+15550020006'] },
    { id: 'pco_person_007', name: 'Michael Brown', emails: ['michael.b@example.com'], phones: ['+15550020007'] },
    { id: 'pco_person_008', name: 'David Miller', emails: ['david.m@example.com'], phones: ['+15550020008'] }
];

const getProxyUrl = () => '/pco/proxy';

const pcoFetch = async (churchId: string, url: string, method = 'GET', body: any = null): Promise<any> => {
    const response = await fetch(getProxyUrl(), {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ churchId, url, method, body })
    });
    if (!response.ok) {
        // Default message uses status code; we'll try to replace with a server message
        let message = `Proxy error: ${response.status}`;
        try {
            const errBody = await response.json();

            // 429 — PCO rate limit. Give a user-friendly message.
            if (response.status === 429 || errBody?.pcoStatus === 429) {
                const wait = errBody?.retryAfter ? ` (wait ~${errBody.retryAfter}s)` : '';
                throw new Error(`Planning Center rate limit reached${wait}. Please wait a moment before trying again.`);
            }

            // requiresReauth — scope missing, user must reconnect PCO
            if (errBody?.requiresReauth) {
                message = errBody.error || message;
                throw new Error(message + ' [requiresReauth]');
            }

            if (errBody?.error) message = errBody.error;
            else if (errBody?.message) message = errBody.message;
        } catch (innerErr: any) {
            // Re-throw any errors we constructed above
            if (innerErr?.message?.includes('[requiresReauth]') ||
                innerErr?.message?.includes('rate limit')) throw innerErr;
            // Also treat 403 on registrations URLs as a scope reauth signal
            if (response.status === 403 && url.includes('/registrations/v2/')) {
                throw new Error(message + ' [requiresReauth]');
            }
            /* otherwise leave default message */
        }
        throw new Error(message);
    }
    const json = await response.json();
    // PCO API errors come as { errors: [...] }
    if (json?.errors?.length) {
        const msg = json.errors[0]?.title || json.errors[0]?.detail || 'PCO API error';
        throw new Error(msg);
    }
    return json;
};

const safeData = (json: any): any[] => {
    if (!json || !Array.isArray(json.data)) return [];
    return json.data;
};

export const pcoService = {
    async getGroups(churchId: string): Promise<any[]> {
        if (isSimulated(churchId)) {
            return MOCK_PCO_GROUPS;
        }
        const data = await pcoFetch(churchId, `https://api.planningcenteronline.com/groups/v2/groups?per_page=100`);
        return safeData(data);
    },
    async getRegistrations(churchId: string): Promise<any[]> {
        if (isSimulated(churchId)) {
            return [
                { id: 'c1_reg0001', type: 'Signup', attributes: { name: 'Summer Family Camp 2025', signup_count: 62, signup_limit: 80 } },
                { id: 'c1_reg0002', type: 'Signup', attributes: { name: 'Marriage Enrichment Retreat', signup_count: 18, signup_limit: 20 } }
            ];
        }
        // PCO Registrations API v2 — events are called "signups" in the API resource name
        // The old /events endpoint does not exist; use /signups instead.
        try {
            const data = await pcoFetch(churchId, `https://api.planningcenteronline.com/registrations/v2/signups?per_page=100&include=signup_times`);
            return safeData(data);
        } catch (e: any) {
            // If the scoped endpoint fails, re-throw with original error
            throw e;
        }
    },

    async getEvents(churchId: string): Promise<any[]> {
        if (isSimulated(churchId)) {
            return [
                { id: 'event_1', type: 'Event', attributes: { name: 'Sunday Morning Service', starts_at: '2025-06-15T09:00:00Z' } }
            ];
        }
        const data = await pcoFetch(churchId, `https://api.planningcenteronline.com/calendar/v2/events?per_page=100&filter=future`);
        return safeData(data);
    },
    async getTeams(churchId: string): Promise<any[]> {
        if (isSimulated(churchId)) {
            return [
                { id: 'team_1', type: 'Team', attributes: { name: 'Worship Team' } },
                { id: 'team_2', type: 'Team', attributes: { name: 'Greeting Team' } }
            ];
        }
        const data = await pcoFetch(churchId, `https://api.planningcenteronline.com/services/v2/teams`);
        return safeData(data);
    },
    async addPersonToWorkflow(churchId: string, personId: string, workflowId: string) {
        if (isSimulated(churchId)) {
            return { success: true };
        }
        return await pcoFetch(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/workflow_cards`, 'POST', {
            data: {
                type: 'WorkflowCard',
                attributes: { workflow_id: workflowId }
            }
        });
    },
    
    async getPerson(churchId: string, personId: string): Promise<PcoPerson> {
        if (isSimulated(churchId)) {
            try {
                const pSnap = await getDoc(doc(db, 'people', `${churchId}_${personId}`));
                if (pSnap.exists()) {
                    const pData = pSnap.data();
                    return {
                        id: personId,
                        name: pData.name || '',
                        first_name: (pData.name || '').split(' ')[0] || '',
                        last_name: (pData.name || '').split(' ')[1] || '',
                        email: pData.email || '',
                        phone: pData.phone || '',
                        gender: pData.gender || '',
                        birthdate: pData.birthdate || null,
                        anniversary: pData.anniversary || null,
                        membership: pData.membership || '',
                        status: pData.status || 'active',
                        createdAt: pData.createdAt || '',
                        lastUpdated: pData.lastUpdated || Date.now(),
                        addresses: pData.addresses || [],
                        checkInCount: pData.checkInCount || 0,
                        householdId: pData.householdId || '',
                        householdName: pData.householdName || '',
                        engagementStatus: pData.engagementStatus || 'Healthy',
                        isDonor: !!pData.isDonor,
                    } as any;
                }
            } catch (e) {
                console.warn('Failed to load local mock person:', e);
            }
            return {
                id: personId,
                name: 'Apple Reviewer',
                first_name: 'Apple',
                last_name: 'Reviewer',
                email: 'test@test.com',
                phone: '(555) 001-0001',
                status: 'active'
            } as any;
        }
        return await pcoFetch(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}?include=field_data`);
    },

    async getPeopleLists(churchId: string): Promise<any[]> {
        if (isSimulated(churchId)) {
            return MOCK_PCO_LISTS;
        }
        try {
            const data = await pcoFetch(churchId, `https://api.planningcenteronline.com/people/v2/lists?per_page=100&order=name`);
            return safeData(data);
        } catch {
            return [];
        }
    },

    /**
     * Returns the PCO person IDs for all members of a given PCO List.
     * Handles pagination automatically.
     */
    async getListPeopleIds(churchId: string, listId: string): Promise<string[]> {
        if (isSimulated(churchId)) {
            const members = await this.getListMembersDetails(churchId, listId);
            return members.map(m => m.id);
        }
        try {
            const ids: string[] = [];
            let url: string | null = `https://api.planningcenteronline.com/people/v2/lists/${listId}/people?per_page=100&fields[Person]=id`;
            while (url) {
                const data = await pcoFetch(churchId, url);
                const page = safeData(data);
                page.forEach((p: any) => { if (p.id) ids.push(p.id); });
                url = data?.links?.next || null;
            }
            return ids;
        } catch {
            return [];
        }
    },

    async getGroupMembers(churchId: string, groupId: string): Promise<string[]> {
        if (isSimulated(churchId)) {
            const members = await this.getGroupMembersDetails(churchId, groupId);
            return members.map(m => m.emails[0]).filter(Boolean);
        }
        // PCO Groups API: get memberships with person included, extract primary emails
        try {
            const data = await pcoFetch(churchId,
                `https://api.planningcenteronline.com/groups/v2/groups/${groupId}/memberships?include=person&per_page=100`
            );
            const included: any[] = data?.included || [];
            const emails: string[] = [];
            for (const person of included) {
                if (person.type !== 'Person') continue;
                // Each person in Groups API has an emails array via a separate endpoint;
                // instead, fetch basic contact data from People API for the person
                const personId = person.id;
                const emailAttr = person.attributes?.email_addresses;
                if (emailAttr && emailAttr.length > 0) {
                    const primary = emailAttr.find((e: any) => e.primary) || emailAttr[0];
                    if (primary?.address) emails.push(primary.address);
                } else {
                    // Fallback: use the person's primary email from People API
                    const personEmail = person.attributes?.primary_email;
                    if (personEmail) emails.push(personEmail);
                }
            }
            return emails;
        } catch {
            return [];
        }
    },

    async addNoteToPerson(churchId: string, personId: string, content: string): Promise<any> {
        if (isSimulated(churchId)) {
            return { success: true };
        }
        return await pcoFetch(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/notes`, 'POST', {
            data: {
                type: 'Note',
                attributes: {
                    note: content
                }
            }
        });
    },

    async getListMembersDetails(churchId: string, listId: string): Promise<any[]> {
        if (isSimulated(churchId)) {
            if (listId === 'pco_list_women') {
                return MOCK_MEMBERS.filter(m => ['Lisa Chen', 'Destiny Williams', 'Sarah Mitchell'].includes(m.name));
            }
            if (listId === 'pco_list_new_visitors') {
                return MOCK_MEMBERS.filter(m => ['Marcus Thompson', 'Lisa Chen', 'Destiny Williams'].includes(m.name));
            }
            if (listId === 'pco_list_volunteers') {
                return MOCK_MEMBERS.filter(m => ['Robert Park', 'Michael Brown', 'David Miller'].includes(m.name));
            }
            return MOCK_MEMBERS;
        }
        try {
            const data = await pcoFetch(churchId, `https://api.planningcenteronline.com/people/v2/lists/${listId}/people?per_page=100&include=emails,phone_numbers`);
            const people = safeData(data);
            const included = data.included || [];

            return people.map(person => {
                const emails = included
                    .filter((inc: any) => inc.type === 'Email' && person.relationships?.emails?.data?.find((e: any) => e.id === inc.id))
                    .map((inc: any) => inc.attributes.address);
                const phones = included
                    .filter((inc: any) => inc.type === 'PhoneNumber' && person.relationships?.phone_numbers?.data?.find((p: any) => p.id === inc.id))
                    .map((inc: any) => inc.attributes.number);

                return {
                    id: person.id,
                    name: person.attributes.name,
                    emails,
                    phones
                };
            });
        } catch {
            return [];
        }
    },

    async getGroupMembersDetails(churchId: string, groupId: string): Promise<any[]> {
        if (isSimulated(churchId)) {
            if (groupId === 'c1_grp0003') { // Men's Bible Study
                return MOCK_MEMBERS.filter(m => ['Marcus Thompson', 'James Okafor', 'Robert Park', 'Michael Brown', 'David Miller'].includes(m.name));
            }
            if (groupId === 'c1_grp0001') { // Young Adults
                return MOCK_MEMBERS.filter(m => ['Lisa Chen', 'Destiny Williams', 'Marcus Thompson'].includes(m.name));
            }
            if (groupId === 'c1_grp0006') { // Youth Group
                return [
                    { id: 'pco_person_004', name: 'Destiny Williams', emails: ['destiny.w@example.com'], phones: ['+15550020004'] },
                    { id: 'pco_person_009', name: 'Tyler Smith', emails: ['tyler.s@example.com'], phones: ['+15550020009'] },
                    { id: 'pco_person_010', name: 'Kayla Jones', emails: ['kayla.j@example.com'], phones: ['+15550020010'] }
                ];
            }
            return MOCK_MEMBERS;
        }
        try {
            const data = await pcoFetch(churchId,
                `https://api.planningcenteronline.com/groups/v2/groups/${groupId}/memberships?include=person&per_page=100`
            );
            const included: any[] = data?.included || [];
            const members = [];

            for (const person of included) {
                if (person.type !== 'Person') continue;
                
                const emails = (person.attributes?.email_addresses || []).map((e: any) => e.address);
                if (emails.length === 0 && person.attributes?.primary_email) {
                    emails.push(person.attributes.primary_email);
                }

                const phones = (person.attributes?.phone_numbers || []).map((p: any) => p.number);
                if (phones.length === 0 && person.attributes?.primary_phone_number) {
                    phones.push(person.attributes.primary_phone_number);
                }

                members.push({
                    id: person.id,
                    name: person.attributes?.name || `${person.attributes?.first_name || ''} ${person.attributes?.last_name || ''}`.trim(),
                    emails,
                    phones
                });
            }
            return members;
        } catch {
            return [];
        }
    }
};

