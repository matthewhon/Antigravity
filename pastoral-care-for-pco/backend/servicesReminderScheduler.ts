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

async function sendReminder(
    db: any, churchId: string, planId: string, personId: string, role: string, body: string, historyId: string, log: any
): Promise<number> {
    const historyDoc = await db.collection('smsServicesSentHistory').doc(historyId).get();
    if (historyDoc.exists) {
        return 2; // deduplicated
    }
    
    const personDoc = await db.collection('people').doc(personId).get().catch(() => null);
    if (!personDoc?.exists) return 0;
    
    const person = personDoc.data();
    const rawPhone: string = (person.phone || '').replace(/\D/g, '');
    const e164 = rawPhone.length === 10 ? `+1${rawPhone}` : rawPhone.length === 11 ? `+${rawPhone}` : '';
    
    if (!e164) return 0;
    
    const personInfo: PersonInfo = {
        personName: person.name,
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
        
        if (sendResult.sent > 0 || sendResult.optedOut > 0) {
            await db.collection('smsServicesSentHistory').doc(historyId).set({
                id: historyId,
                churchId,
                planId,
                personId,
                role,
                sentAt: Date.now()
            });
            return 1; // Sent
        }
    } catch (err: any) {
        log.warn(`[ServicesReminder] Failed to send to ${e164} for plan ${planId}: ${err.message}`, 'system', { churchId, planId, personId }, churchId);
    }
    return 0;
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
                
                // Pre-calculate 30-day schedule counts for over-scheduled warning
                const scheduleCounts30Days = new Map<string, number>();
                if (reminders.leaderWarningOverScheduledEnabled) {
                    const thirtyDaysFromNowStr = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().substring(0, 10);
                    plansSnap.docs.forEach(doc => {
                        const p = doc.data() as ServicePlanSnapshot;
                        if (p.sortDate >= nowStr && p.sortDate <= thirtyDaysFromNowStr) {
                            if (p.teamMembers) {
                                p.teamMembers.forEach(m => {
                                    if (m.personId) {
                                        scheduleCounts30Days.set(m.personId, (scheduleCounts30Days.get(m.personId) || 0) + 1);
                                    }
                                });
                            }
                        }
                    });
                }
                
                let sentCount = 0;
                let deduplicatedCount = 0;

                for (const planDoc of plansSnap.docs) {
                    const plan = planDoc.data() as ServicePlanSnapshot;
                    const planId = plan.id;
                    const daysDiff = getDaysUntil(plan.sortDate);
                    if (daysDiff < 0) continue; // Past plan
                    
                    const serviceName = plan.serviceTypeName || plan.seriesTitle || 'Service';
                    const dateFormatted = fmtDate(plan.sortDate);

                    // Determine if today is a scheduled day for leaders
                    const leaderDays = new Set<number>();
                    if (reminders.leaderReminders && reminders.leaderReminders.length > 0) {
                        reminders.leaderReminders.forEach(r => leaderDays.add(r.daysBefore));
                    } else if (reminders.leaderDaysBefore) {
                        leaderDays.add(reminders.leaderDaysBefore);
                    }
                    const isLeaderDay = leaderDays.has(daysDiff);

                    // 1. Understaffed Warning (sent to leaders)
                    if (reminders.leaderWarningUnderstaffedEnabled && isLeaderDay && plan.neededPositions) {
                        for (const needed of plan.neededPositions) {
                            if (needed.quantity > 0) {
                                const leadersSet = teamLeadersMap.get(needed.teamName);
                                if (leadersSet) {
                                    for (const leaderId of leadersSet) {
                                        const role = `warning_understaffed_${needed.teamName.replace(/[^a-zA-Z0-9]/g, '_')}`;
                                        const historyId = `${churchId}_${planId}_${leaderId}_${role}`;
                                        
                                        const template = reminders.leaderWarningUnderstaffedTemplate || "Warning: {team_name} for {service_name} on {date} still needs {needed_count} more people. Please check PCO.";
                                        const body = template
                                            .replace(/\{needed_count\}/gi, needed.quantity.toString())
                                            .replace(/\{team_name\}/gi, needed.teamName)
                                            .replace(/\{service_name\}/gi, serviceName)
                                            .replace(/\{date\}/gi, dateFormatted);
                                            
                                        const didSend = await sendReminder(db, churchId, planId, leaderId, role, body, historyId, log);
                                        if (didSend === 1) sentCount++; else if (didSend === 2) deduplicatedCount++;
                                    }
                                }
                            }
                        }
                    }
                    
                    if (!plan.teamMembers || plan.teamMembers.length === 0) continue;
                    
                    for (const member of plan.teamMembers) {
                        const personId = member.personId;
                        if (!personId) continue;
                        
                        const leadersSet = teamLeadersMap.get(member.teamName);
                        const isLeader = leadersSet && leadersSet.has(personId);
                        
                        // 2. Over-scheduled Warning
                        if (reminders.leaderWarningOverScheduledEnabled && isLeaderDay) {
                            const count = scheduleCounts30Days.get(personId) || 0;
                            const threshold = reminders.leaderWarningOverScheduledThreshold || 3;
                            if (count >= threshold && leadersSet) {
                                for (const leaderId of leadersSet) {
                                    const role = `warning_overscheduled_${personId}`;
                                    const historyId = `${churchId}_${planId}_${leaderId}_${role}`;
                                    
                                    const template = reminders.leaderWarningOverScheduledTemplate || "Warning: {person_name} is scheduled {count} times in the next 30 days (including {service_name} on {date}). You may want to find a replacement.";
                                    const body = template
                                        .replace(/\{person_name\}/gi, member.name || 'Team Member')
                                        .replace(/\{count\}/gi, count.toString())
                                        .replace(/\{team_name\}/gi, member.teamName)
                                        .replace(/\{service_name\}/gi, serviceName)
                                        .replace(/\{date\}/gi, dateFormatted);
                                        
                                    const didSend = await sendReminder(db, churchId, planId, leaderId, role, body, historyId, log);
                                    if (didSend === 1) sentCount++; else if (didSend === 2) deduplicatedCount++;
                                }
                            }
                        }
                        
                        // 3. Standard Reminders
                        if (reminders.remindOnlyUnconfirmed && member.status !== 'Pending' && member.status !== 'U') {
                            continue;
                        }

                        const applicableReminders: { template: string, roleKey: string }[] = [];
                        
                        if (isLeader && reminders.leaderReminderEnabled) {
                            const leaderList = (reminders.leaderReminders && reminders.leaderReminders.length > 0) 
                                ? reminders.leaderReminders 
                                : [{ daysBefore: reminders.leaderDaysBefore || 5, messageTemplate: reminders.leaderMessageTemplate || '' }];
                            
                            for (const r of leaderList) {
                                if (daysDiff === r.daysBefore && r.messageTemplate) {
                                    applicableReminders.push({ template: r.messageTemplate, roleKey: `leader_${r.daysBefore}` });
                                }
                            }
                        } else if (!isLeader && reminders.memberReminderEnabled) {
                            const memberList = (reminders.memberReminders && reminders.memberReminders.length > 0)
                                ? reminders.memberReminders
                                : [{ daysBefore: reminders.memberDaysBefore || 3, messageTemplate: reminders.memberMessageTemplate || '' }];
                                
                            for (const r of memberList) {
                                if (daysDiff === r.daysBefore && r.messageTemplate) {
                                    applicableReminders.push({ template: r.messageTemplate, roleKey: `member_${r.daysBefore}` });
                                }
                            }
                        }
                        
                        if (applicableReminders.length === 0) continue;
                        
                        for (const rem of applicableReminders) {
                            const historyId = `${churchId}_${planId}_${personId}_${rem.roleKey}`;
                            const body = resolveTemplate(rem.template, member.name || 'Team Member', serviceName, member.teamName, dateFormatted);
                            
                            const didSend = await sendReminder(db, churchId, planId, personId, rem.roleKey, body, historyId, log);
                            if (didSend === 1) sentCount++; else if (didSend === 2) deduplicatedCount++;
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
