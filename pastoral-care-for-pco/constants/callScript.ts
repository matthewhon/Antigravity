/**
 * AI Recommended Call Script & Status-Tailored Talking Points
 */

export interface StatusScriptDetails {
    statusKey: 'Healthy' | 'At Risk' | 'Disconnected';
    statusLabel: string;
    badgeBg: string;
    badgeText: string;
    greeting: string;
    checkIn: string;
    prayerAsk: string;
    talkingPoints: string[];
    fullScript: string;
}

/**
 * Generates status-tailored call script & talking points based on member status
 * (Healthy, Warning / At Risk, Disconnected).
 */
export function getAiRecommendedCallScriptByStatus(
    status?: string | null,
    churchName?: string
): StatusScriptDetails {
    const cName = churchName?.trim() || '[Church Name]';
    const norm = (status || '').toLowerCase();

    if (norm.includes('healthy')) {
        return {
            statusKey: 'Healthy',
            statusLabel: 'Healthy Attender',
            badgeBg: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/60 dark:text-emerald-300 dark:border-emerald-800',
            badgeText: '💚 Healthy',
            greeting: `Hi [Person Name], this is [Caller Name] from ${cName}!`,
            checkIn: `We wanted to reach out and say thank you for being a vital, connected part of our church family!`,
            prayerAsk: `How are you and your family doing today, and do you have any prayer needs or requests we can join you in praying for?`,
            talkingPoints: [
                `Express gratitude for their presence and continued connection in ${cName}.`,
                `Ask how their family is doing and if they have any personal prayer requests.`,
                `Encourage them and ask if they have any interest in small groups, serving, or upcoming events.`
            ],
            fullScript: `Hi [Person Name], this is [Caller Name] from ${cName}!\n\nWe wanted to reach out to say thank you for being a vital, connected part of our church family. We're checking in to see how you and your family are doing today, and to ask if you have any prayer needs or if there's anything our care team can pray with you about today.`
        };
    }

    if (norm.includes('risk') || norm.includes('warn') || norm.includes('at-risk')) {
        return {
            statusKey: 'At Risk',
            statusLabel: 'At Risk / Warning',
            badgeBg: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/60 dark:text-amber-300 dark:border-amber-800',
            badgeText: '⚠️ At Risk (Warning)',
            greeting: `Hi [Person Name], this is [Caller Name] from ${cName}!`,
            checkIn: `We've missed seeing you recently and wanted to reach out with a warm check-in to see how you're doing.`,
            prayerAsk: `Is everything going okay with you and your family, and do you have any specific prayer needs or challenges our pastoral team can pray for you about today?`,
            talkingPoints: [
                `Let them know they are missed and deeply valued at ${cName}.`,
                `Ask if there are any recent life changes, illness, or schedule shifts that have made attending tough.`,
                `Offer a warm, listening ear and ask if they have prayer needs or desire pastoral support.`
            ],
            fullScript: `Hi [Person Name], this is [Caller Name] from ${cName}!\n\nWe've missed seeing you recently and wanted to reach out with a warm check-in to see how you're doing. Is everything going okay with you and your family, and do you have any prayer needs or anything our pastoral care team can pray with you about today?`
        };
    }

    // Default: Disconnected
    return {
        statusKey: 'Disconnected',
        statusLabel: 'Disconnected',
        badgeBg: 'bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/60 dark:text-rose-300 dark:border-rose-800',
        badgeText: '🔴 Disconnected',
        greeting: `Hi [Person Name], this is [Caller Name] from ${cName}!`,
        checkIn: `I'm reaching out today just to let you know that our church family cares about you and you're on our hearts.`,
        prayerAsk: `We'd love to know how you're doing and ask if there are any prayer needs or ways our care team can support you right now.`,
        talkingPoints: [
            `Emphasize unconditional care and warmth — no guilt or pressure.`,
            `Ask open-ended questions about how they and their family are doing.`,
            `Offer prayer and ask if there is any practical assistance or pastoral support they need.`
        ],
        fullScript: `Hi [Person Name], this is [Caller Name] from ${cName}!\n\nI'm reaching out today just to let you know our church family cares about you and you're on our hearts. We'd love to know how you're doing and ask if you have any prayer needs or if there's anything our team can pray with you about today.`
    };
}

export const DEFAULT_AI_SCRIPT_TEMPLATE =
    `Hi [Person Name], this is [Caller Name] from [Church Name]! ` +
    `I'm reaching out today to check in on our church family, see how you're doing, ` +
    `and ask if you have any prayer needs or if there's anything our pastoral care team can pray with you about today.`;

/**
 * Returns the default AI recommended call script & talking points template with tenant church name.
 */
export function getAiRecommendedCallScript(churchName?: string, status?: string | null): string {
    return getAiRecommendedCallScriptByStatus(status, churchName).fullScript;
}

/**
 * Replaces placeholders ([Person Name], [Caller Name], [Church Name], etc.) in a script template
 * with live runtime values on the calling screen.
 */
export function renderCallScript(
    script: string | undefined | null,
    context: { churchName?: string; callerName?: string; personName?: string; status?: string | null }
): string {
    const raw = (script && script.trim())
        ? script
        : getAiRecommendedCallScriptByStatus(context.status, context.churchName).fullScript;

    const church = context.churchName?.trim() || 'our church';
    const caller = context.callerName?.trim() || 'a volunteer';
    const person = context.personName?.trim() || 'friend';

    return raw
        .replace(/\[Church Name\]|\{churchName\}|\{church\}/gi, church)
        .replace(/\[Caller Name\]|\[Volunteer Name\]|\{callerName\}|\{volunteerName\}|\{caller\}/gi, caller)
        .replace(/\[Person Name\]|\[Contact Name\]|\{personName\}|\{firstName\}|\{person\}/gi, person);
}
