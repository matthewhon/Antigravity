import { pcoService } from './pcoService';
import { pastoralJourneyQueue } from './jobQueue';

export const automationService = {
    async handlePersonEvent(churchId: string, personId: string) {
        const person = await pcoService.getPerson(churchId, personId);
        
        // Check for 'Spiritual Gifts' custom field
        const spiritualGifts = person.field_data?.find(f => f.field_definition.name === 'Spiritual Gifts');
        
        if (spiritualGifts && spiritualGifts.value.includes('Teaching')) {
            // Trigger workflow
            await pcoService.addPersonToWorkflow(churchId, personId, process.env.TEACHING_WORKFLOW_ID!);
            
            // Queue first communication step
            await pastoralJourneyQueue.add('send-email', { 
                personId, 
                templateId: 'welcome-teaching-email' 
            });
        }
    }
};
