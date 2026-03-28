import { PcoPerson } from '../types';

const getProxyUrl = () => '/pco/proxy';

const pcoFetch = async (churchId: string, url: string, method = 'GET', body: any = null): Promise<any> => {
    const response = await fetch(getProxyUrl(), {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'PastoralCareApp/1.0' 
        },
        body: JSON.stringify({ churchId, url, method, body })
    });
    if (!response.ok) {
        let message = `Proxy error: ${response.status}`;
        try {
            const errBody = await response.clone().json();
            if (errBody?.requiresReauth) {
                // Provide a clear re-auth message that the UI can detect
                message = errBody.error || message;
                throw new Error(message + ' [requiresReauth]');
            }
            if (errBody?.error) message = errBody.error;
            else if (errBody?.message) message = errBody.message;
        } catch (innerErr: any) {
            // If it's our requiresReauth throw, re-throw it
            if (innerErr?.message?.includes('[requiresReauth]')) throw innerErr;
            // Also treat 403 on registrations URLs as a scope reauth signal
            if (response.status === 403 && url.includes('/registrations/')) {
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
        const data = await pcoFetch(churchId, `https://api.planningcenteronline.com/groups/v2/groups?per_page=100`);
        return safeData(data);
    },
    async getRegistrations(churchId: string): Promise<any[]> {
        const data = await pcoFetch(churchId, `https://api.planningcenteronline.com/registrations/v2/events?order=starts_at&filter=unarchived,published&per_page=100`);
        return safeData(data);
    },
    async getEvents(churchId: string): Promise<any[]> {
        const data = await pcoFetch(churchId, `https://api.planningcenteronline.com/calendar/v2/events?per_page=100&filter=future`);
        return safeData(data);
    },
    async getTeams(churchId: string): Promise<any[]> {
        const data = await pcoFetch(churchId, `https://api.planningcenteronline.com/services/v2/teams`);
        return safeData(data);
    },
    async addPersonToWorkflow(churchId: string, personId: string, workflowId: string) {
        return await pcoFetch(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/workflow_cards`, 'POST', {
            data: {
                type: 'WorkflowCard',
                attributes: { workflow_id: workflowId }
            }
        });
    },
    
    async getPerson(churchId: string, personId: string): Promise<PcoPerson> {
        return await pcoFetch(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}?include=field_data`);
    },

    async getPeopleLists(churchId: string): Promise<any[]> {
        try {
            const data = await pcoFetch(churchId, `https://api.planningcenteronline.com/people/v2/lists?per_page=100&order=name`);
            return safeData(data);
        } catch {
            return [];
        }
    },

    async getGroupMembers(churchId: string, groupId: string): Promise<string[]> {
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
};

