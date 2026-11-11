/**
 * chatPermissions.ts
 *
 * Port of the Team Chat-relevant parts of the web app's
 * pastoral-care-for-pco/services/permissionService.ts (the source of truth).
 * Keep these rules identical so a user sees the same channels on web and mobile.
 */
import { Church, TeamChatArea, User } from '../types';

export const isAdmin = (user: User): boolean =>
    !!user.roles?.includes('System Administration') || !!user.roles?.includes('Church Admin');

export const isPastor = (user: User): boolean => !!user.roles?.includes('Pastor');

/** Users with the SMS/messaging tools (Inbox, Broadcast, etc.). */
export const hasMessagingAccess = (user: User | null): boolean =>
    !!user && (isAdmin(user) || !!user.roles?.includes('Messaging'));

/** Team Chat is not included in the Starter plan (same gate as the web app). */
export const isStarterPlan = (church: Church | null | undefined): boolean =>
    church?.subscription?.status === 'active' && church?.subscription?.planId === 'starter';

/**
 * Can this user open Team Chat?
 * Web: hasModuleAccess(user, 'tools-team-chat', { isStarterPlan }) — every
 * staff user except on the Starter plan (tools-* views without a role mapping
 * are open to all staff).
 */
export const hasTeamChatAccess = (user: User | null, church: Church | null | undefined): boolean => {
    if (!user || !church) return false;
    if (user.churchId && church.id && user.churchId !== church.id) return false;
    return !isStarterPlan(church);
};

/** Which role grants module access for each chat area (web MODULE_ROLE_MAP). */
const AREA_ROLE: Record<Exclude<TeamChatArea, 'admin' | 'care'>, string> = {
    giving: 'Giving',
    people: 'People',
    groups: 'Groups',
    services: 'Services',
};

/**
 * Web canReadArea(user, area) restricted to Team Chat areas.
 * Admins always; 'admin' is admin-only; Pastor reads everything else;
 * otherwise the module role (care = Pastor / Pastoral Care).
 */
export const canReadArea = (user: User | null, area: TeamChatArea): boolean => {
    if (!user) return false;
    if (isAdmin(user)) return true;
    if (area === 'admin') return false;
    if (isPastor(user)) return true;
    const roles = (user.roles || []) as string[];
    if (area === 'care') return roles.includes('Pastor') || roles.includes('Pastoral Care');
    return roles.includes(AREA_ROLE[area]);
};

