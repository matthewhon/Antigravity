export interface MergeTagPersonInfo {
    personName?: string;
    firstName?: string;
    lastName?: string;
    fullName?: string;
    nickname?: string;
    email?: string;
    phone?: string;
    birthday?: string;
    anniversary?: string;
    city?: string;
    state?: string;
    zip?: string;
    membership?: string;
    campus?: string;
    householdName?: string;
    pcoPersonId?: string | null;
    personId?: string | null;
    avatar?: string | null;
}

export interface MergeTagExtraContext {
    eventName?: string;
    eventLink?: string;
    registrantCount?: number | string;
    unsubscribeLink?: string;
}

function formatUsPhone(raw: string): string {
    const cleaned = (raw || '').replace(/^\+1/, '');
    const digits = cleaned.replace(/\D/g, '');
    if (digits.length === 10) {
        return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
    }
    return cleaned;
}

/**
 * Unified server-side merge tag resolver for SMS, Email, and Workflows.
 * Resolves:
 *  - Global contact variables (`{firstName}`, `{nickname}`, `{campus}`, etc.)
 *  - Global church variables (`{church.name}`, `{church.serviceTimes}`, `{church.givingUrl}`, etc.)
 *  - Global dynamic date/event variables (`{today}`, `{dayOfWeek}`, `{currentYear}`, `{eventName}`, etc.)
 *  - Tenant custom variables (`{custom.<key>}`) stored on `church.customVariables`
 */
export function resolveMergeTags(
    body: string,
    person: MergeTagPersonInfo = {},
    church?: any,
    extra?: MergeTagExtraContext
): string {
    if (!body) return '';

    const parts = (person.personName || person.fullName || '').trim().split(/\s+/).filter(Boolean);
    const firstName = person.firstName || parts[0] || '';
    const lastName = person.lastName || parts.slice(1).join(' ') || '';
    const fullName = person.fullName || person.personName || [firstName, lastName].filter(Boolean).join(' ');
    const nickname = person.nickname || firstName;
    const formattedPhone = formatUsPhone(person.phone || '');
    const formattedChurchPhone = formatUsPhone(church?.phone || '');

    const now = new Date();
    const today = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    const dayOfWeek = now.toLocaleDateString('en-US', { weekday: 'long' });
    const currentYear = String(now.getFullYear());

    let out = body
        .replace(/\{contact\.firstName\}|\{firstName\}|\{first_name\}|\{first name\}/gi, firstName || 'Friend')
        .replace(/\{contact\.lastName\}|\{lastName\}|\{last_name\}|\{last name\}/gi, lastName)
        .replace(/\{contact\.fullName\}|\{contact\.name\}|\{fullName\}|\{full_name\}|\{name\}/gi, fullName || firstName || 'Friend')
        .replace(/\{contact\.nickname\}|\{nickname\}/gi, nickname || 'Friend')
        .replace(/\{contact\.email\}|\{email\}/gi, person.email || '')
        .replace(/\{contact\.phone\}|\{phone\}/gi, formattedPhone)
        .replace(/\{contact\.birthday\}|\{birthday\}/gi, person.birthday || '')
        .replace(/\{contact\.anniversary\}|\{anniversary\}/gi, person.anniversary || '')
        .replace(/\{contact\.city\}|\{city\}/gi, person.city || '')
        .replace(/\{contact\.state\}|\{state\}/gi, person.state || '')
        .replace(/\{contact\.zip\}|\{zip\}/gi, person.zip || '')
        .replace(/\{contact\.membership\}|\{membership\}/gi, person.membership || '')
        .replace(/\{contact\.campus\}|\{campus\}/gi, person.campus || '')
        .replace(/\{contact\.householdName\}|\{householdName\}/gi, person.householdName || '')
        .replace(/\{church\.name\}|\{churchName\}|\{church_name\}/gi, church?.name || '')
        .replace(/\{church\.phone\}|\{churchPhone\}|\{church_phone\}/gi, formattedChurchPhone)
        .replace(/\{church\.email\}|\{churchEmail\}|\{church_email\}/gi, church?.email || '')
        .replace(/\{church\.address\}|\{churchAddress\}|\{church_address\}/gi, church?.address || '')
        .replace(/\{church\.website\}|\{churchWebsite\}|\{church_website\}/gi, church?.website || '')
        .replace(/\{church\.pastorName\}|\{church\.pastor_name\}/gi, church?.pastorName || '')
        .replace(/\{church\.serviceTimes\}|\{church\.service_times\}/gi, church?.serviceTimes || '')
        .replace(/\{church\.givingUrl\}|\{church\.giving_url\}/gi, church?.givingUrl || '')
        .replace(/\{church\.connectUrl\}|\{church\.connect_url\}/gi, church?.connectUrl || '')
        .replace(/\{today\}/gi, today)
        .replace(/\{dayOfWeek\}|\{day_of_week\}/gi, dayOfWeek)
        .replace(/\{currentYear\}|\{current_year\}/gi, currentYear)
        .replace(/\{eventName\}|\{event_name\}/gi, extra?.eventName || '')
        .replace(/\{eventLink\}|\{registrationLink\}/gi, extra?.eventLink || '')
        .replace(/\{registrantCount\}|\{registrant_count\}/gi, extra?.registrantCount !== undefined ? String(extra.registrantCount) : '')
        .replace(/\{unsubscribeLink\}|\{unsubscribe_link\}/gi, extra?.unsubscribeLink || '');

    // Resolve tenant custom variables `{custom.<key>}` (never collides with global tags)
    const customVars: { key: string; value: string }[] = Array.isArray(church?.customVariables)
        ? church.customVariables
        : [];
    const customMap = new Map<string, string>();
    for (const cv of customVars) {
        if (cv?.key) {
            customMap.set(cv.key.toLowerCase(), cv.value ?? '');
        }
    }

    out = out.replace(/\{custom\.([a-z0-9_]+)\}/gi, (_match, key: string) => {
        return customMap.get(key.toLowerCase()) ?? '';
    });

    return out;
}
