import { addDoc, collection, doc, setDoc } from 'firebase/firestore';
import { db } from './firebase';
import {
    CustomReportDefinition,
    CustomReportFilter,
    FormRecipe,
    PcoPerson,
    Recipe,
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
