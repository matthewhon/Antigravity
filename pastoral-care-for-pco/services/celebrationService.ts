import { PcoPerson } from '../types';

export interface TodayCelebration {
    id: string; // Unique key e.g. `${person.id}-birthday` or `${person.id}-anniversary`
    personId: string;
    type: 'birthday' | 'anniversary';
    name: string;
    firstName: string;
    lastName: string;
    avatar?: string | null;
    email?: string | null;
    phone?: string | null;
    membership?: string | null;
    status?: string | null;
    householdId?: string;
    householdName?: string;
    spouseName?: string | null;
    turningAge?: number | null;
    yearsMarried?: number | null;
    originalDateStr: string;
}

export interface ParsedDate {
    month: number; // 1-12
    day: number;   // 1-31
    year?: number;
}

/**
 * Safely extracts month, day, and optional year from various date string formats
 * without introducing UTC vs Local timezone shifts.
 */
export function parseCelebrationDate(dateStr?: string | null): ParsedDate | null {
    if (!dateStr) return null;
    const s = String(dateStr).trim();
    if (!s) return null;

    // ISO or YYYY-MM-DD or YYYY-MM-DDTHH:mm:ss
    const ymdMatch = s.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/);
    if (ymdMatch) {
        const year = parseInt(ymdMatch[1], 10);
        const month = parseInt(ymdMatch[2], 10);
        const day = parseInt(ymdMatch[3], 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return { month, day, year };
        }
    }

    // MM/DD/YYYY or MM-DD-YYYY
    const mdyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})/);
    if (mdyMatch) {
        const month = parseInt(mdyMatch[1], 10);
        const day = parseInt(mdyMatch[2], 10);
        const year = parseInt(mdyMatch[3], 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return { month, day, year };
        }
    }

    // MM-DD or MM/DD (without year)
    const mdOnlyMatch = s.match(/^(\d{1,2})[-/.](\d{1,2})$/);
    if (mdOnlyMatch) {
        const month = parseInt(mdOnlyMatch[1], 10);
        const day = parseInt(mdOnlyMatch[2], 10);
        if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
            return { month, day };
        }
    }

    // Fallback: Date parse
    try {
        const d = new Date(s);
        if (!isNaN(d.getTime())) {
            return {
                month: d.getUTCMonth() + 1,
                day: d.getUTCDate(),
                year: d.getUTCFullYear()
            };
        }
    } catch {
        // ignore fallback errors
    }

    return null;
}

/**
 * Checks if a parsed month/day is today in local time.
 * Also handles leap years where Feb 29 can be celebrated on Feb 28 in non-leap years.
 */
export function isSameDayAndMonth(
    parsed: ParsedDate,
    targetDate: Date = new Date()
): boolean {
    const targetMonth = targetDate.getMonth() + 1;
    const targetDay = targetDate.getDate();

    if (parsed.month === targetMonth && parsed.day === targetDay) {
        return true;
    }

    // Leap year handling: if born/married on Feb 29, celebrate on Feb 28 in non-leap years
    if (parsed.month === 2 && parsed.day === 29 && targetMonth === 2 && targetDay === 28) {
        const isLeap = (year: number) => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
        if (!isLeap(targetDate.getFullYear())) {
            return true;
        }
    }

    return false;
}

/**
 * Returns phone number formatted or extracted from person.
 */
export function getPersonPhone(person: PcoPerson): string | null {
    return person.primary_phone || person.phone || person.e164Phone || null;
}

/**
 * Returns primary email extracted from person.
 */
export function getPersonEmail(person: PcoPerson): string | null {
    return person.primary_email || person.email || null;
}

/**
 * Generates an array of all birthdays and anniversaries happening on the current day.
 */
export function getTodayCelebrations(
    people: PcoPerson[],
    targetDate: Date = new Date()
): TodayCelebration[] {
    if (!people || people.length === 0) return [];

    const currentYear = targetDate.getFullYear();
    const celebrations: TodayCelebration[] = [];

    // Group people by householdId to easily identify spouses
    const householdMembersMap = new Map<string, PcoPerson[]>();
    for (const p of people) {
        if (p.householdId && p.status !== 'inactive') {
            const list = householdMembersMap.get(p.householdId) || [];
            list.push(p);
            householdMembersMap.set(p.householdId, list);
        }
    }

    for (const p of people) {
        if (!p || p.status === 'inactive') continue;

        const nameParts = (p.name || '').trim().split(' ');
        const firstName = p.firstName || nameParts[0] || 'Friend';
        const lastName = p.lastName || (nameParts.length > 1 ? nameParts.slice(1).join(' ') : '');
        const phone = getPersonPhone(p);
        const email = getPersonEmail(p);
        const membership = p.membership || p.membershipStatus || p.membership_status || null;

        // 1. Check Birthday
        if (p.birthdate) {
            const parsedBirthdate = parseCelebrationDate(p.birthdate);
            if (parsedBirthdate && isSameDayAndMonth(parsedBirthdate, targetDate)) {
                let turningAge: number | null = null;
                if (parsedBirthdate.year && parsedBirthdate.year > 1900 && parsedBirthdate.year <= currentYear) {
                    turningAge = currentYear - parsedBirthdate.year;
                }

                celebrations.push({
                    id: `${p.id}-birthday`,
                    personId: p.id,
                    type: 'birthday',
                    name: p.name || `${firstName} ${lastName}`.trim(),
                    firstName,
                    lastName,
                    avatar: p.avatar || null,
                    email,
                    phone,
                    membership,
                    status: p.status || null,
                    householdId: p.householdId,
                    householdName: p.householdName,
                    turningAge,
                    originalDateStr: p.birthdate,
                });
            }
        }

        // 2. Check Anniversary
        if (p.anniversary) {
            const parsedAnniversary = parseCelebrationDate(p.anniversary);
            if (parsedAnniversary && isSameDayAndMonth(parsedAnniversary, targetDate)) {
                let yearsMarried: number | null = null;
                if (parsedAnniversary.year && parsedAnniversary.year > 1900 && parsedAnniversary.year <= currentYear) {
                    yearsMarried = currentYear - parsedAnniversary.year;
                }

                // Look for spouse in the same household
                let spouseName: string | null = null;
                if (p.householdId) {
                    const householdMembers = householdMembersMap.get(p.householdId) || [];
                    const otherMembers = householdMembers.filter(m => m.id !== p.id);
                    // Match person who also has the same anniversary or is opposite gender adult
                    const matchingSpouse = otherMembers.find(m => m.anniversary === p.anniversary) || otherMembers[0];
                    if (matchingSpouse) {
                        spouseName = matchingSpouse.name;
                    }
                }

                celebrations.push({
                    id: `${p.id}-anniversary`,
                    personId: p.id,
                    type: 'anniversary',
                    name: p.name || `${firstName} ${lastName}`.trim(),
                    firstName,
                    lastName,
                    avatar: p.avatar || null,
                    email,
                    phone,
                    membership,
                    status: p.status || null,
                    householdId: p.householdId,
                    householdName: p.householdName,
                    spouseName,
                    yearsMarried,
                    originalDateStr: p.anniversary,
                });
            }
        }
    }

    // Sort: Birthdays first, then Anniversaries, then alphabetically
    return celebrations.sort((a, b) => {
        if (a.type !== b.type) {
            return a.type === 'birthday' ? -1 : 1;
        }
        return a.name.localeCompare(b.name);
    });
}

/**
 * Returns ordinal suffix for numbers (e.g. 1st, 2nd, 3rd, 25th)
 */
export function getOrdinal(n: number): string {
    const s = ['th', 'st', 'nd', 'rd'];
    const v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
}
