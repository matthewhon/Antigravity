import { createServerLogger } from '../services/logService';
import type { PersonInfo } from './smsSend';
import type { ServicePlanSnapshot, ServicesTeam } from '../types';

/** Calculate difference in days. If plan is 5 days from now, this returns 5. */
function getDaysUntil(dateString: string): number {
    const target = new Date(dateString);
    if (isNaN(target.getTime())) return -1;
    const now = new Date();
    
    // Normalize to start of day in UTC
    const utcNow = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
    const utcTarget = Date.UTC(target.getFullYear(), target.getMonth(), target.getDate());
    return Math.floor((utcTarget - utcNow) / (1000 * 60 * 60 * 24));
}

/** Replace merge tags with context data. */
function resolveTemplate(template: string, personName: string, serviceName: string, teamName: string, dateStr: string): string {
    return template
        .replace(/\{name\}/gi, personName)
        .replace(/\{service_name\}/gi, serviceName)
        .replace(/\{team_name\}/gi, teamName)
        .replace(/\{date\}/gi, dateStr);
}

/** Format date string */
function fmtDate(raw?: string): string {
    if (!raw) return '';
    const d = new Date(raw);
    return isNaN(d.getTime()) ? raw : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export async function runServicesReminderScanner(db: any): Promise<void> {
    const log = createServerLogger(db);

    try {
        const nowStr = new Date().toISOString().substring(0, 10);
        
        // Load all active churches with SMS and reminders enabled
        const churchesSnap = await db.collection('churches').get();
        const activeChurches: any[] = [];
        
        for (const doc of churchesSnap.docs) {
            const data = doc.data();
            const smsSettings = data.smsSettings || {};
            if (smsSettings.smsEnabled && smsSettings.servicesReminders?.enabled) {
                activeChurches.push({ id: doc.id, reminders: smsSettings.servicesReminders });
            }
        }
        
        if (activeChurches.length === 0) return;

        log.info(`[ServicesReminder] Scanning ${activeChurches.length} church(es)`, 'system', {}, '');

        for (const church of activeChurches) {
            const churchId = church.id;
            const reminders = church.reminders;
            
            // Only remind if either leaders or members are enabled
            if (!reminders.leaderReminderEnabled && !reminders.memberReminderEnabled) continue;
            
            try {
                // Fetch upcoming plans
                const plansSnap = await db.collection('service_plans')
                    .where('churchId', '==', churchId)
                    .where('sortDate', '>=', nowStr)
                    .get();

                if (plansSnap.empty) continue;
                
                // Fetch services teams to determine leaders
                const teamsSnap = await db.collection('services_teams')
                    .where('churchId', '==', churchId)
                    .get();
                    
                // Map of teamName -> leaderPersonIds array for fast lookup
                const teamLeadersMap = new Map<string, Set<string>>();
                teamsSnap.docs.forEach((doc: any) => {
                    const t = doc.data() as ServicesTeam;
                    teamLeadersMap.set(t.name, new Set(t.leaderPersonIds || []));
                });
                
                let sentCount = 0;
                let deduplicatedCount = 0;

                for (const planDoc of plansSnap.docs) {
                    const plan = planDoc.data() as ServicePlanSnapshot;
                    const planId = plan.id;
                    if (!plan.teamMembers || plan.teamMembers.length === 0) continue;
                    
                    const daysDiff = getDaysUntil(plan.sortDate);
                    if (daysDiff < 0) continue; // Past plan
                    
                    for (const member of plan.teamMembers) {
                        const personId = member.personId;
                        if (!personId) continue;
                        
                        // Check if they need to be reminded based on status
                        if (reminders.remindOnlyUnconfirmed && member.status !== 'Pending' && member.status !== 'U') {
                            continue;
                        }

                        const leadersSet = teamLeadersMap.get(member.teamName);
                        const isLeader = leadersSet && leadersSet.has(personId);
                        
                        let shouldRemind = false;
                        let template = '';
                        let role = '';
                        
                        if (isLeader && reminders.leaderReminderEnabled && daysDiff === reminders.leaderDaysBefore) {
                            shouldRemind = true;
                            template = reminders.leaderMessageTemplate;
                            role = 'leader';
                        } else if (!isLeader && reminders.memberReminderEnabled && daysDiff === reminders.memberDaysBefore) {
                            shouldRemind = true;
                            template = reminders.memberMessageTemplate;
                            role = 'member';
                        }
                        
                        if (!shouldRemind) continue;
                        
                        // Check deduplication
                        const historyId = `${churchId}_${planId}_${personId}_${role}`;
                        const historyDoc = await db.collection('smsServicesSentHistory').doc(historyId).get();
                        if (historyDoc.exists) {
                            deduplicatedCount++;
                            continue;
                        }
                        
                        // Fetch person to get phone number
                        const personDoc = await db.collection('people').doc(personId).get().catch(() => null);
                        if (!personDoc?.exists) continue;
                        
                        const person = personDoc.data();
                        const rawPhone: string = (person.phone || '').replace(/\D/g, '');
                        const e164 = rawPhone.length === 10 ? `+1${rawPhone}` : rawPhone.length === 11 ? `+${rawPhone}` : '';
                        
                        if (!e164) continue;
                        
                        // Format message
                        const serviceName = plan.serviceTypeName || plan.seriesTitle || 'Service';
                        const dateFormatted = fmtDate(plan.sortDate);
                        const body = resolveTemplate(template, member.name || person.name || 'Team Member', serviceName, member.teamName, dateFormatted);
                        
                        // Send via sendBulkInternal
                        const personInfo: PersonInfo = {
                            personName: person.name || member.name,
                            email: person.email,
                            phone: e164
                        };
                        
                        const { sendBulkInternal } = await import('./smsSend.js');
                        try {
                            const sendResult = await sendBulkInternal({
                                db,
                                churchId,
                                campaignId: `services_reminder_${planId}`,
                                phones: [e164],
                                body,
                                personMap: { [e164]: personInfo }
                            });
                            
                            // If successful, record history
                            if (sendResult.sent > 0 || sendResult.optedOut > 0) {
                                await db.collection('smsServicesSentHistory').doc(historyId).set({
                                    id: historyId,
                                    churchId,
                                    planId,
                                    personId,
                                    role,
                                    sentAt: Date.now()
                                });
                                sentCount++;
                            }
                        } catch (err: any) {
                            log.warn(`[ServicesReminder] Failed to send reminder to ${e164} for plan ${planId}: ${err.message}`, 'system', { churchId, planId, personId }, churchId);
                        }
                    }
                }
                
                if (sentCount > 0) {
                    log.info(`[ServicesReminder] Church ${churchId}: sent ${sentCount} reminders (skipped ${deduplicatedCount} existing)`, 'system', { churchId, sentCount, deduplicatedCount }, churchId);
                }

            } catch (e: any) {
                log.warn(`[ServicesReminder] Error processing church ${churchId}: ${e.message}`, 'system', { churchId }, churchId);
            }
        }
    } catch (e: any) {
        console.error('[ServicesReminder] Unexpected error:', e?.message);
    }
}

// Global state for scheduler
let reminderInterval: ReturnType<typeof setInterval> | null = null;
const REMINDER_SCAN_INTERVAL = 60 * 60 * 1000; // 1 hour

export function startServicesReminderScheduler(db: any): void {
    if (reminderInterval) {
        clearInterval(reminderInterval);
    }
    
    console.log('[ServicesReminderScheduler] Started. Checking every hour.');
    
    // Run immediately
    runServicesReminderScanner(db);
    
    // Then run on interval
    reminderInterval = setInterval(() => {
        runServicesReminderScanner(db);
    }, REMINDER_SCAN_INTERVAL);
}

export function stopServicesReminderScheduler(): void {
    if (reminderInterval) {
        clearInterval(reminderInterval);
        reminderInterval = null;
        console.log('[ServicesReminderScheduler] Stopped.');
    }
}
