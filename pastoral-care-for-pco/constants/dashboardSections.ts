/**
 * dashboardSections.ts
 *
 * Section ordering for the dashboard overview page.
 *
 * This replaces the dashboard's slice of `getRoleBasedDefaults()`. The other
 * analytics views still use that function to pick widget ids — only the
 * dashboard moved to fixed sections, so both live side by side.
 *
 * Ordering is a presentation choice, not an access control: a section a user
 * may not see never reaches the page, because `calculateDashboardOverview`
 * leaves it out of the result entirely. Listing an id here is harmless if the
 * user can't see it.
 */

export type DashboardSectionId =
    | 'needs_attention'
    | 'this_week'
    | 'trends'
    | 'areas'
    | 'timeline'
    | 'tenant_health';

/** Every section, in the order a Pastor or admin sees them. */
export const ALL_SECTIONS: DashboardSectionId[] = [
    'needs_attention',
    'this_week',
    'trends',
    'areas',
    'timeline',
    'tenant_health',
];

export const SECTION_LABELS: Record<DashboardSectionId, string> = {
    needs_attention: 'Needs attention',
    this_week: 'This week',
    trends: 'Trends',
    areas: 'By area',
    timeline: 'Timeline',
    tenant_health: 'Tenant health',
};

/**
 * Section order for a user's roles.
 *
 * The lead section after the Pulse is whatever that role opens the app to do:
 * a Services coordinator wants the timeline and roster state, a finance
 * volunteer wants giving. "Needs attention" stays first for everyone — it's the
 * one section whose whole purpose is to interrupt.
 */
export const getSectionOrder = (roles: string[]): DashboardSectionId[] => {
    const has = (r: string) => roles.includes(r);
    const isAdmin = has('Church Admin') || has('System Administration');
    const isPastor = has('Pastor') || isAdmin;

    if (isAdmin) {
        return ['needs_attention', 'tenant_health', 'this_week', 'trends', 'areas', 'timeline'];
    }
    if (isPastor) {
        return ['needs_attention', 'this_week', 'trends', 'areas', 'timeline'];
    }
    if (has('Giving') || has('Finance')) {
        return ['needs_attention', 'areas', 'this_week', 'trends', 'timeline'];
    }
    if (has('Services')) {
        return ['needs_attention', 'timeline', 'areas', 'this_week', 'trends'];
    }
    if (has('Groups')) {
        return ['needs_attention', 'areas', 'this_week', 'trends', 'timeline'];
    }
    if (has('Pastoral Care')) {
        return ['needs_attention', 'areas', 'this_week', 'timeline', 'trends'];
    }
    if (has('Messaging') || has('Email')) {
        return ['needs_attention', 'areas', 'timeline', 'this_week', 'trends'];
    }

    return ALL_SECTIONS.filter(s => s !== 'tenant_health');
};
