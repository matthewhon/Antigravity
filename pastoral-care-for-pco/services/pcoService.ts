import { PcoPerson } from '../types';

const getProxyUrl = () => '/pco/proxy';

const pcoFetch = async (churchId: string, url: string, method = 'GET', body: any = null): Promise<any> => {
    const response = await fetch(getProxyUrl(), {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'User-Agent': 'PastoralCareApp/1.0' 
        },
        body: JSON.stringify({
            churchId,
            url,
            method,
            body
        })
    });
    return response.json();
};

export const pcoService = {
    async getGroups(churchId: string): Promise<any[]> {
        const data = await pcoFetch(churchId, `https://api.planningcenteronline.com/groups/v2/groups`);
        return data.data;
    },
    async getRegistrations(churchId: string): Promise<any[]> {
        const data = await pcoFetch(churchId, `https://api.planningcenteronline.com/registrations/v2/events`);
        return data.data;
    },
    async getEvents(churchId: string): Promise<any[]> {
        const data = await pcoFetch(churchId, `https://api.planningcenteronline.com/calendar/v2/events`);
        return data.data;
    },
    async getTeams(churchId: string): Promise<any[]> {
        const data = await pcoFetch(churchId, `https://api.planningcenteronline.com/services/v2/teams`);
        return data.data;
    },
    async addPersonToWorkflow(churchId: string, personId: string, workflowId: string) {
        return await pcoFetch(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}/workflow_cards`, 'POST', {
            data: {
                type: 'WorkflowCard',
                attributes: {
                    workflow_id: workflowId
                }
            }
        });
    },
    
    async getPerson(churchId: string, personId: string): Promise<PcoPerson> {
        return await pcoFetch(churchId, `https://api.planningcenteronline.com/people/v2/people/${personId}?include=field_data`);
    }
};
