import { addDoc, collection, deleteDoc, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
    CustomReportDefinition,
    CustomReportFilter,
    FormRecipe,
    PcoPerson,
    Recipe,
    RecipeCategory,
    ReportRecipe,
    SmsWorkflow,
    SmsWorkflowStep,
    WorkflowActionNode,
    WorkflowDelayNode,
    WorkflowNode,
    WorkflowRecipe,
} from '../types';

function uid(): string {
    return Math.random().toString(36).slice(2, 10) + Math.random().toString(36).slice(2, 10);
}

/** Recursively strip `undefined` properties because Firestore rejects them. */
function stripUndefined<T>(obj: T): T {
    if (Array.isArray(obj)) return obj.map(stripUndefined) as unknown as T;
    if (obj !== null && typeof obj === 'object') {
        return Object.fromEntries(
            Object.entries(obj as Record<string, unknown>)
                .filter(([, v]) => v !== undefined)
                .map(([k, v]) => [k, stripUndefined(v)])
        ) as T;
    }
    return obj;
}

/** Flatten node-based workflow into legacy `SmsWorkflowStep[]` for the backend scheduler. */
function compileNodesToSteps(nodes: WorkflowNode[]): SmsWorkflowStep[] {
    const steps: SmsWorkflowStep[] = [];
    let pendingDelay: WorkflowDelayNode | null = null;
    let order = 0;

    const pushAction = (an: WorkflowActionNode, delay: WorkflowDelayNode | null) => {
        steps.push({
            id: an.id,
            order: order++,
            channelType: an.channelType,
            message: an.message,
            mediaUrls: an.mediaUrls,
            emailSubject: an.emailSubject,
            emailBody: an.emailBody,
            staffTargetType: an.staffTargetType,
            staffRecipients: an.staffRecipients,
            staffListId: an.staffListId,
            staffListName: an.staffListName,
            staffGroupId: an.staffGroupId,
            staffGroupName: an.staffGroupName,
            delayDays: delay?.delayDays ?? 0,
            delayHours: delay?.delayHours ?? 0,
            scheduleType: delay?.scheduleType,
            scheduleDayOfWeek: delay?.scheduleDayOfWeek,
            scheduleDayOfMonth: delay?.scheduleDayOfMonth,
            scheduleDate: delay?.scheduleDate,
            scheduleTime: delay?.scheduleTime,
        });
    };

    for (const node of nodes) {
        if (node.nodeType === 'delay') {
            pendingDelay = node;
        } else if (node.nodeType === 'action') {
            pushAction(node, pendingDelay);
            pendingDelay = null;
        } else if (node.nodeType === 'branch') {
            for (const an of node.thenNodes) pushAction(an, null);
            pendingDelay = null;
        }
    }
    return steps;
}

function cloneNodesWithFreshIds(nodes: WorkflowNode[]): WorkflowNode[] {
    return nodes.map((node, index) => {
        if (node.nodeType === 'branch') {
            return {
                ...node,
                id: uid(),
                order: index,
                thenNodes: node.thenNodes.map((tn, ti) => ({ ...tn, id: uid(), order: ti })),
                elseNodes: node.elseNodes.map((en, ei) => ({ ...en, id: uid(), order: ei })),
            };
        }
        return { ...node, id: uid(), order: index };
    });
}

export async function importWorkflowRecipe(churchId: string, recipe: WorkflowRecipe): Promise<SmsWorkflow> {
    const now = Date.now();
    const clonedNodes = cloneNodesWithFreshIds(recipe.nodes);
    const compiledSteps = compileNodesToSteps(clonedNodes);

    const payload: Omit<SmsWorkflow, 'id'> = {
        churchId,
        name: recipe.title,
        description: recipe.subtitle,
        trigger: recipe.trigger,
        triggerKeywordId: null,
        triggerKeywordWord: null,
        triggerListId: null,
        triggerListName: null,
        triggerEventId: null,
        triggerEventName: null,
        triggerDayOffset: recipe.triggerDayOffset ?? 0,
        triggerTime: recipe.triggerTime ?? '09:00',
        twilioNumberId: null,
        steps: compiledSteps,
        nodes: clonedNodes,
        // Activate simple manual/birthday recipes immediately unless they contain unconfigured staff_email recipients
        isActive: recipe.trigger === 'birthday' || recipe.trigger === 'anniversary',
        enrolledCount: 0,
        completedCount: 0,
        createdAt: now,
        updatedAt: now,
        allowReentry: recipe.allowReentry ?? false,
    };

    const ref = await addDoc(collection(db, 'smsWorkflows'), stripUndefined(payload));
    return { id: ref.id, ...payload };
}

export async function importFormRecipe(churchId: string, recipe: FormRecipe): Promise<any> {
    const now = Date.now();
    const formId = `form_${now}_${Math.random().toString(36).substring(2, 8)}`;
    const customFields = recipe.customFields.map(f => ({
        ...f,
        id: f.mapToPco === 'firstName' || f.mapToPco === 'lastName'
            ? f.mapToPco
            : `field_${now}_${Math.random().toString(36).substring(2, 8)}`,
        placeholder: f.placeholder ?? '',
    }));

    const payload = {
        id: formId,
        churchId,
        name: recipe.formName,
        description: recipe.formDescription,
        fields: {},
        customFields,
        styles: {
            primaryColor: recipe.primaryColor || '#4F46E5',
            backgroundColor: '#FFFFFF',
            textColor: '#1F2937',
            buttonTextColor: '#FFFFFF',
            inputBgColor: '#F8FAFC',
        },
        actions: {
            addToGroupId: '',
            enrollInWorkflowId: '',
            noteCategoryId: '',
            sendSmsAlertTo: '',
        },
        isActive: true,
        settings: {
            syncToPco: recipe.syncToPco,
        },
        recipeId: recipe.id,
        updatedAt: now,
        createdAt: now,
    };

    const cleanPayload = stripUndefined(payload);
    await setDoc(doc(db, 'pco_forms', formId), cleanPayload, { merge: true });
    return cleanPayload;
}

export async function importReportRecipe(churchId: string, recipe: ReportRecipe): Promise<CustomReportDefinition> {
    const now = Date.now();
    const reportId = `rep_${now}_${Math.random().toString(36).substring(2, 8)}`;
    const definition: CustomReportDefinition = {
        id: reportId,
        churchId,
        name: recipe.reportName,
        description: recipe.reportDescription,
        category: recipe.category,
        filters: recipe.filters,
        columns: recipe.columns,
        sortBy: recipe.sortBy,
        sortDir: recipe.sortDir,
        recipeId: recipe.id,
        createdAt: now,
        updatedAt: now,
    };

    await setDoc(doc(db, 'pco_custom_reports', reportId), stripUndefined(definition), { merge: true });
    return definition;
}

export async function importAnyRecipe(churchId: string, recipe: Recipe): Promise<any> {
    if (recipe.kind === 'workflow') return importWorkflowRecipe(churchId, recipe);
    if (recipe.kind === 'form') return importFormRecipe(churchId, recipe);
    return importReportRecipe(churchId, recipe);
}

/**
 * Sanitize and publish a tenant's workflow to the global `shared_recipes` collection
 * so all tenants can 1-click import, edit, and use it.
 */
export async function publishWorkflowAsSharedRecipe(
    wf: SmsWorkflow,
    meta: {
        title: string;
        subtitle: string;
        category: RecipeCategory;
        churchSizeFit: 'Small (<150)' | 'All Churches';
        publishedByUid?: string;
        publishedByName?: string;
    }
): Promise<WorkflowRecipe> {
    const now = Date.now();
    const recipeId = `shared_wf_${now}_${Math.random().toString(36).slice(2, 8)}`;

    // Build nodes from wf.nodes if present, otherwise convert legacy steps
    const rawNodes: WorkflowNode[] =
        wf.nodes && wf.nodes.length > 0
            ? wf.nodes
            : (wf.steps || []).flatMap((s, i) => {
                  const arr: WorkflowNode[] = [];
                  if (i > 0 && (s.delayDays > 0 || (s.delayHours && s.delayHours > 0) || s.scheduleType !== undefined)) {
                      arr.push({
                          nodeType: 'delay',
                          id: uid(),
                          order: arr.length,
                          delayDays: s.delayDays ?? 1,
                          delayHours: s.delayHours ?? 0,
                          scheduleType: s.scheduleType,
                          scheduleDayOfWeek: s.scheduleDayOfWeek,
                          scheduleDayOfMonth: s.scheduleDayOfMonth,
                          scheduleDate: s.scheduleDate,
                          scheduleTime: s.scheduleTime,
                      });
                  }
                  arr.push({
                      nodeType: 'action',
                      id: uid(),
                      order: arr.length,
                      channelType: s.channelType ?? 'sms',
                      message: s.message || '',
                      mediaUrls: s.mediaUrls,
                      emailSubject: s.emailSubject,
                      emailBody: s.emailBody,
                  });
                  return arr;
              });

    // Strip church-specific PCO/Twilio IDs from action & branch nodes
    const sanitizeAction = (an: WorkflowActionNode): WorkflowActionNode => ({
        ...an,
        id: uid(),
        staffListId: null,
        staffListName: null,
        staffGroupId: null,
        staffGroupName: null,
        ...(an.channelType === 'staff_sms' || an.channelType === 'staff_email'
            ? { staffTargetType: 'individuals' as const, staffRecipients: [] }
            : {}),
    });

    const sanitizedNodes: WorkflowNode[] = rawNodes.map((n, idx) => {
        if (n.nodeType === 'action') return { ...sanitizeAction(n), order: idx };
        if (n.nodeType === 'branch') {
            return {
                ...n,
                id: uid(),
                order: idx,
                conditionTagId: null,
                conditionTagName: null,
                thenNodes: n.thenNodes.map((tn, ti) => ({ ...sanitizeAction(tn), order: ti })),
                elseNodes: n.elseNodes.map((en, ei) => ({ ...sanitizeAction(en), order: ei })),
            };
        }
        return { ...n, id: uid(), order: idx };
    });

    const actionCount = sanitizedNodes.filter(n => n.nodeType === 'action').length;
    const triggerLabelMap: Record<string, string> = {
        manual: 'Manual Trigger',
        keyword: 'Keyword Trigger',
        list_add: 'PCO List Trigger',
        birthday: 'Birthday Trigger',
        anniversary: 'Anniversary Trigger',
        event_registration: 'Event Trigger',
    };

    // Keep date-based triggers as-is; convert church-specific list/keyword/event triggers to 'manual'
    // so other tenants don't inherit broken IDs and can assign their own trigger after importing.
    const portableTrigger =
        wf.trigger === 'birthday' || wf.trigger === 'anniversary' ? wf.trigger : 'manual';

    const recipe: WorkflowRecipe = {
        id: recipeId,
        kind: 'workflow',
        title: meta.title.trim(),
        subtitle: meta.subtitle.trim() || `${actionCount}-step workflow shared for all churches.`,
        category: meta.category,
        churchSizeFit: meta.churchSizeFit,
        estimatedSetupMinutes: Math.max(1, Math.min(5, actionCount)),
        highlights: [
            `${actionCount} Step${actionCount !== 1 ? 's' : ''}`,
            triggerLabelMap[portableTrigger] || 'Manual Trigger',
            'Shared Recipe',
        ],
        trigger: portableTrigger,
        allowReentry: !!wf.allowReentry,
        triggerDayOffset: wf.triggerDayOffset ?? 0,
        triggerTime: wf.triggerTime ?? '09:00',
        nodes: sanitizedNodes,
        isShared: true,
        publishedByUid: meta.publishedByUid,
        publishedByName: meta.publishedByName,
        sourceChurchId: wf.churchId,
        createdAt: now,
    };

    await setDoc(doc(db, 'shared_recipes', recipeId), stripUndefined(recipe));
    return recipe;
}

export async function deleteSharedRecipe(recipeId: string): Promise<void> {
    await deleteDoc(doc(db, 'shared_recipes', recipeId));
}

/** Evaluate a CustomReportDefinition's filters & sort against synced PCO people. */
export function evaluateCustomReport(people: PcoPerson[], def: CustomReportDefinition): PcoPerson[] {
    const now = Date.now();
    const f: CustomReportFilter = def.filters || {};

    const filtered = people.filter(p => {
        if (f.adultsOnly && p.child) return false;

        if (f.statusIn && f.statusIn.length > 0) {
            const norm = (p.status || 'Unknown').toLowerCase();
            if (!f.statusIn.some(s => s.toLowerCase() === norm)) return false;
        }

        if (f.membershipIn && f.membershipIn.length > 0) {
            const norm = (p.membership || p.membershipStatus || 'Unknown').toLowerCase();
            if (!f.membershipIn.some(m => m.toLowerCase() === norm)) return false;
        }

        if (f.riskCategoryIn && f.riskCategoryIn.length > 0) {
            const cat = (p.riskProfile?.category || 'Unknown').toLowerCase();
            if (!f.riskCategoryIn.some(r => r.toLowerCase() === cat)) return false;
        }

        if (f.createdWithinDays !== undefined) {
            const createdMs = p.createdAt ? new Date(p.createdAt).getTime() : 0;
            if (!createdMs || now - createdMs > f.createdWithinDays * 86_400_000) return false;
        }

        if (f.notAttendedInDays !== undefined) {
            const lastStr = p.attendanceStats?.lastAttended;
            if (lastStr) {
                const lastMs = new Date(lastStr).getTime();
                if (!isNaN(lastMs) && now - lastMs < f.notAttendedInDays * 86_400_000) {
                    return false;
                }
            }
        }

        if (f.noGroup) {
            if (p.groupIds && p.groupIds.length > 0) return false;
        }

        if (f.missingAnyOf && f.missingAnyOf.length > 0) {
            const missingPhone = f.missingAnyOf.includes('phone') && !(p.phone || p.primary_phone || '').trim();
            const missingEmail = f.missingAnyOf.includes('email') && !(p.email || p.primary_email || '').trim();
            const missingBirthdate = f.missingAnyOf.includes('birthdate') && !(p.birthdate || '').trim();
            if (!missingPhone && !missingEmail && !missingBirthdate) return false;
        }

        return true;
    });

    const dir = def.sortDir === 'desc' ? -1 : 1;
    return [...filtered].sort((a, b) => {
        if (def.sortBy === 'createdAt') {
            return (new Date(a.createdAt || 0).getTime() - new Date(b.createdAt || 0).getTime()) * dir;
        }
        if (def.sortBy === 'lastAttended') {
            const am = a.attendanceStats?.lastAttended ? new Date(a.attendanceStats.lastAttended).getTime() : 0;
            const bm = b.attendanceStats?.lastAttended ? new Date(b.attendanceStats.lastAttended).getTime() : 0;
            return (am - bm) * dir;
        }
        if (def.sortBy === 'riskCategory') {
            const order: Record<string, number> = { Healthy: 0, 'At Risk': 1, Disconnected: 2, Critical: 3 };
            const av = order[a.riskProfile?.category || ''] ?? -1;
            const bv = order[b.riskProfile?.category || ''] ?? -1;
            return (av - bv) * dir;
        }
        return (a.name || '').localeCompare(b.name || '') * dir;
    });
}
