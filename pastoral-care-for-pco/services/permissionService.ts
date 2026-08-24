/**
 * permissionService.ts
 *
 * Single source of truth for role-based access.
 *
 * Two distinct questions live here, and conflating them is what let the old
 * widget dashboard leak giving totals to users who couldn't open the Giving
 * module (the widget picker filtered only on the tenant-wide
 * `church.enabledWidgets`, never on the user's roles):
 *
 *   hasModuleAccess(user, view, opts)
 *     "Can this user navigate to this view?"  — drives routing and the sidebar.
 *
 *   canReadArea(user, area)
 *     "Can this user see a read-only summary of this area?" — drives the
 *     dashboard overview page only.
 *
 * `canReadArea` is deliberately wider than `hasModuleAccess`: it also grants
 * Pastor, whose role description promises "full read access to pastoral data
 * and dashboards" but who is not checked by the module role map for giving,
 * people, groups or services. Gating the dashboard on module access alone
 * would collapse a Pastor-only user's page to almost nothing.
 *
 * It is never wider in the other direction — a user who can open a module can
 * always read its summary.
 */

import { User, UserRole } from '../types';

/**
 * View id → the single role that grants it. Mirrors the routing table.
 *
 * Typed as plain strings, not UserRole, because `tools-files` maps to a
 * "Files" role that isn't in the UserRole union — no user can hold it, so that
 * view is effectively admin-only. Preserved as-is rather than quietly changed.
 */
const MODULE_ROLE_MAP: Record<string, string> = {
    'people': 'People',
    'people-households': 'People',
    'people-risk': 'People',
    'people-reports': 'People',
    'groups': 'Groups',
    'groups-reports': 'Groups',
    'services': 'Services',
    'services-attendance': 'Services',
    'services-teams': 'Services',
    'services-plans': 'Services',
    'services-reminders': 'Services',
    'giving': 'Giving',
    'giving-pledges': 'Giving',
    'giving-donor': 'Giving',
    'giving-budgets': 'Giving',
    'giving-donations': 'Giving',
    'giving-reports': 'Giving',
    'finance': 'Finance',
    'metrics': 'Metrics',
    'metrics-input': 'Metrics',
    'metrics-settings': 'Metrics',
    'messaging': 'Messaging',
    'tools-sms': 'Messaging',
    'tools-sms-inbox': 'Messaging',
    'tools-sms-campaigns': 'Messaging',
    'tools-sms-workflows': 'Messaging',
    'tools-sms-keywords': 'Messaging',
    'tools-sms-analytics': 'Messaging',
    'tools-sms-agent': 'Messaging',
    'tools-sms-permissions': 'Messaging',
    'tools-emails': 'Email',
    'tools-polls': 'Polls',
    'tools-workflows': 'Workflows',
    'tools-notes': 'Notes',
    'tools-files': 'Files',
    'tools-forms': 'People',
};

/** Views granted to Pastor / Pastoral Care regardless of the role map. */
const PASTORAL_VIEWS = new Set([
    'pastoral',
    'pastoral-membership',
    'pastoral-community',
    'pastoral-care',
    'pastoral-calendar',
    'pastoral-reports',
]);

export const isAdmin = (user: User): boolean =>
    user.roles.includes('System Administration') || user.roles.includes('Church Admin');

export const isPastor = (user: User): boolean => user.roles.includes('Pastor');

export interface ModuleAccessOptions {
    /** Starter plan blocks Calling, Polls, Workflows, Forms, Notes and Pastor AI. */
    isStarterPlan?: boolean;
    /** Tenant-level module switches from system settings. */
    communicationEnabled?: boolean;
}

/**
 * Can this user navigate to `view`?
 *
 * Extracted verbatim from the routing gate so that both the router and the
 * dashboard resolve access from the same rules.
 */
export const hasModuleAccess = (
    user: User | null,
    view: string,
    opts: ModuleAccessOptions = {}
): boolean => {
    if (!user) return false;

    const { isStarterPlan = false, communicationEnabled = true } = opts;

    // Plan gate applies to everyone, admins included.
    if (isStarterPlan && view === 'pastor-ai') return false;
    if (view === 'communication' && !communicationEnabled) return false;

    if (isAdmin(user)) return true;
    if (view === 'dashboard') return true;
    if (view === 'settings') return user.roles.includes('Church Admin');

    if (PASTORAL_VIEWS.has(view)) {
        return user.roles.includes('Pastor') || user.roles.includes('Pastoral Care');
    }
    if (view === 'pastor-ai') {
        return user.roles.includes('Pastor AI') || user.roles.includes('Pastor');
    }

    if (isStarterPlan) {
        if (view === 'pastoral-contact' || view === 'pastoral-group-care') return false;
        if (view === 'tools-polls') return false;
        if (view === 'tools-workflows') return false;
        if (view === 'tools-forms') return false;
        if (view === 'tools-notes') return false;
        if (view === 'tools-bulletin') return false;
    }

    if (view === 'pastoral-contact' || view === 'pastoral-group-care') {
        return user.roles.includes('Pastor')
            || user.roles.includes('Pastoral Care')
            || user.roles.includes('Groups');
    }

    if (view === 'tools') return true;
    if (view.startsWith('tools-') && !MODULE_ROLE_MAP[view]) return true;

    const requiredRole = MODULE_ROLE_MAP[view];
    return requiredRole ? (user.roles as string[]).includes(requiredRole) : false;
};

/** Areas the dashboard overview page can render a summary for. */
export type DashboardArea =
    | 'people'
    | 'giving'
    | 'groups'
    | 'services'
    | 'messaging'
    | 'email'
    | 'outreach'
    | 'care'
    | 'admin';

/** Which module view each dashboard area defers to for its access check. */
const AREA_VIEW: Record<Exclude<DashboardArea, 'admin'>, string> = {
    people: 'people',
    giving: 'giving',
    groups: 'groups',
    services: 'services',
    messaging: 'messaging',
    email: 'tools-emails',
    outreach: 'pastoral-contact',
    care: 'pastoral-care',
};

/**
 * Can this user see a read-only dashboard summary of `area`?
 *
 * Module access, widened to include Pastor and admins. Used ONLY by the
 * dashboard overview — routing must keep using `hasModuleAccess`, or Pastor
 * would silently gain modules they were never meant to open.
 */
export const canReadArea = (
    user: User | null,
    area: DashboardArea,
    opts: ModuleAccessOptions = {}
): boolean => {
    if (!user) return false;
    if (isAdmin(user)) return true;

    // Tenant operations and billing are admin-only, with no Pastor widening.
    if (area === 'admin') return false;

    if (isPastor(user)) return true;

    return hasModuleAccess(user, AREA_VIEW[area], opts);
};

/**
 * The subset of areas this user can see, in a stable order.
 * Handy for laying out the area bands without repeating the gate per section.
 */
export const readableAreas = (
    user: User | null,
    opts: ModuleAccessOptions = {}
): DashboardArea[] => {
    const order: DashboardArea[] = [
        'people', 'giving', 'groups', 'services', 'messaging', 'email', 'outreach', 'care', 'admin',
    ];
    return order.filter(a => canReadArea(user, a, opts));
};
