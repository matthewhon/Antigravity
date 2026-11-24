import { Church, TenantVariable } from '../types';

export type GlobalVariableCategory = 'Contact' | 'Church' | 'Date & Event' | 'Staff Alert';

export interface GlobalVariableDef {
    tag: string;
    label: string;
    category: GlobalVariableCategory;
    sample: string;
    description: string;
}

export const RESERVED_GLOBAL_PREFIXES = new Set([
    'contact',
    'church',
    'custom',
    'event',
    'system',
    'workflow',
]);

export const GLOBAL_VARIABLES: GlobalVariableDef[] = [
    // Contact / Person
    { tag: '{firstName}', label: 'First Name', category: 'Contact', sample: 'John', description: "Recipient's first name" },
    { tag: '{lastName}', label: 'Last Name', category: 'Contact', sample: 'Smith', description: "Recipient's last name" },
    { tag: '{fullName}', label: 'Full Name', category: 'Contact', sample: 'John Smith', description: "Recipient's full name" },
    { tag: '{nickname}', label: 'Nickname', category: 'Contact', sample: 'Johnny', description: "Recipient's nickname or first name" },
    { tag: '{email}', label: 'Email', category: 'Contact', sample: 'john@example.com', description: "Recipient's email address" },
    { tag: '{phone}', label: 'Phone', category: 'Contact', sample: '(615) 555-0100', description: "Recipient's formatted phone number" },
    { tag: '{city}', label: 'City', category: 'Contact', sample: 'Nashville', description: "Recipient's city" },
    { tag: '{state}', label: 'State', category: 'Contact', sample: 'TN', description: "Recipient's state" },
    { tag: '{zip}', label: 'ZIP Code', category: 'Contact', sample: '37201', description: "Recipient's postal code" },
    { tag: '{birthday}', label: 'Birthday', category: 'Contact', sample: 'Jan 15', description: "Recipient's birthday" },
    { tag: '{anniversary}', label: 'Anniversary', category: 'Contact', sample: 'Jun 10', description: "Recipient's anniversary" },
    { tag: '{membership}', label: 'Membership', category: 'Contact', sample: 'Member', description: 'Planning Center membership type' },
    { tag: '{campus}', label: 'Campus', category: 'Contact', sample: 'Main Campus', description: "Recipient's primary campus" },
    { tag: '{householdName}', label: 'Household Name', category: 'Contact', sample: 'The Smith Family', description: "Recipient's household name" },

    // Church
    { tag: '{church.name}', label: 'Church Name', category: 'Church', sample: 'Grace Church', description: 'Your church name' },
    { tag: '{church.phone}', label: 'Church Phone', category: 'Church', sample: '(615) 555-0199', description: 'Main church phone number' },
    { tag: '{church.email}', label: 'Church Email', category: 'Church', sample: 'hello@gracechurch.org', description: 'Main church email address' },
    { tag: '{church.address}', label: 'Church Address', category: 'Church', sample: '123 Church St, Nashville, TN', description: 'Church street address' },
    { tag: '{church.website}', label: 'Church Website', category: 'Church', sample: 'https://gracechurch.org', description: 'Church website URL' },
    { tag: '{church.pastorName}', label: 'Lead Pastor', category: 'Church', sample: 'Pastor David', description: 'Lead pastor name' },
    { tag: '{church.serviceTimes}', label: 'Service Times', category: 'Church', sample: 'Sundays at 9:00 AM & 10:45 AM', description: 'Weekly service times' },
    { tag: '{church.givingUrl}', label: 'Giving Link', category: 'Church', sample: 'https://gracechurch.org/give', description: 'Online giving URL' },
    { tag: '{church.connectUrl}', label: 'Connect Card Link', category: 'Church', sample: 'https://gracechurch.org/connect', description: 'Guest connect / next-steps URL' },

    // Date & Event
    { tag: '{today}', label: 'Today (Date)', category: 'Date & Event', sample: 'Nov 24, 2026', description: 'Current formatted date' },
    { tag: '{dayOfWeek}', label: 'Day of Week', category: 'Date & Event', sample: 'Sunday', description: 'Current weekday name' },
    { tag: '{currentYear}', label: 'Current Year', category: 'Date & Event', sample: '2026', description: '4-digit current year' },
    { tag: '{eventName}', label: 'Event Name', category: 'Date & Event', sample: 'Easter Sunday Service', description: 'Workflow registration event name' },
    { tag: '{eventLink}', label: 'Event / Registration Link', category: 'Date & Event', sample: 'https://churchcenter.com/registrations', description: 'Registration or Church Center link' },
    { tag: '{registrantCount}', label: 'Registrant Count', category: 'Date & Event', sample: '42', description: 'Number of registered attendees' },

    // Staff Alert Aliases
    { tag: '{contact.firstName}', label: 'Contact First Name', category: 'Staff Alert', sample: 'John', description: 'Enrolled contact first name (for staff alerts)' },
    { tag: '{contact.lastName}', label: 'Contact Last Name', category: 'Staff Alert', sample: 'Smith', description: 'Enrolled contact last name (for staff alerts)' },
    { tag: '{contact.name}', label: 'Contact Full Name', category: 'Staff Alert', sample: 'John Smith', description: 'Enrolled contact full name (for staff alerts)' },
    { tag: '{contact.phone}', label: 'Contact Phone', category: 'Staff Alert', sample: '(615) 555-0100', description: 'Enrolled contact phone (for staff alerts)' },
    { tag: '{contact.email}', label: 'Contact Email', category: 'Staff Alert', sample: 'john@example.com', description: 'Enrolled contact email (for staff alerts)' },
];

/** Normalize a raw user-entered key into a safe `custom.<key>` identifier. */
export function normalizeTenantVarKey(raw: string): string {
    return raw
        .trim()
        .toLowerCase()
        .replace(/^custom\./, '')
        .replace(/[^a-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 40);
}

export function validateTenantVarKey(key: string): string | null {
    if (!key) return 'Key is required.';
    if (!/^[a-z][a-z0-9_]{1,39}$/.test(key)) {
        return 'Key must start with a letter and use 2–40 lowercase letters, numbers, or underscores.';
    }
    if (RESERVED_GLOBAL_PREFIXES.has(key)) {
        return `"${key}" is reserved for global variables.`;
    }
    return null;
}

/** Resolve all global + tenant custom variables for UI previews. */
export function resolveVariablesPreview(
    text: string,
    church?: Partial<Church> | null,
    sampleOverrides?: Record<string, string>
): string {
    if (!text) return '';
    let out = text;

    const now = new Date();
    const churchMap: Record<string, string> = {
        '{church.name}': church?.name || 'Grace Church',
        '{churchName}': church?.name || 'Grace Church',
        '{church.phone}': church?.phone || '(615) 555-0199',
        '{churchPhone}': church?.phone || '(615) 555-0199',
        '{church.email}': church?.email || 'hello@gracechurch.org',
        '{church.address}': church?.address || '123 Church St, Nashville, TN',
        '{churchAddress}': church?.address || '123 Church St, Nashville, TN',
        '{church.website}': church?.website || 'https://gracechurch.org',
        '{churchWebsite}': church?.website || 'https://gracechurch.org',
        '{church.pastorName}': church?.pastorName || 'Pastor David',
        '{church.serviceTimes}': church?.serviceTimes || 'Sundays at 9:00 AM & 10:45 AM',
        '{church.givingUrl}': church?.givingUrl || 'https://gracechurch.org/give',
        '{church.connectUrl}': church?.connectUrl || 'https://gracechurch.org/connect',
        '{today}': now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
        '{dayOfWeek}': now.toLocaleDateString('en-US', { weekday: 'long' }),
        '{currentYear}': String(now.getFullYear()),
    };

    for (const def of GLOBAL_VARIABLES) {
        const val = sampleOverrides?.[def.tag] ?? churchMap[def.tag] ?? def.sample;
        out = out.split(def.tag).join(val);
    }

    for (const [tag, val] of Object.entries(churchMap)) {
        out = out.split(tag).join(val);
    }

    const customVars: TenantVariable[] = church?.customVariables || [];
    for (const cv of customVars) {
        out = out.split(`{custom.${cv.key}}`).join(cv.value || '');
    }

    return out;
}
