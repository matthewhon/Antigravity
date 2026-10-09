// ---------------------------------------------------------------------------
// Deterministic text-quality checks for campaign copy (email / SMS / bulletin).
// Pure functions, no dependencies — used by backend/campaignWriter.ts and the UI.
// ---------------------------------------------------------------------------

export interface ReadabilityReport {
    grade: number;        // Flesch-Kincaid grade level (1 decimal)
    wordCount: number;
    sentenceCount: number;
    avgSentenceLength: number;
    smsSegments: number;  // 0 when not applicable
    smsEncoding: 'GSM-7' | 'UCS-2';
    characters: number;
}

export interface QualityOptions {
    channel: 'email' | 'sms' | 'bulletin';
    targetGrade?: number;       // default 8
    maxSmsChars?: number;       // default 320 (2 segments)
    requireLink?: boolean;
    requireDate?: boolean;
}

/** Strip HTML tags/entities so we score only the visible text. */
export const stripHtml = (html: string): string =>
    (html || '')
        .replace(/<(style|script)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<\/(p|div|h[1-6]|li|br)>/gi, '. ')
        .replace(/<br\s*\/?>/gi, '. ')
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/&[a-z]+;/gi, ' ')
        .replace(/\s+/g, ' ')
        .trim();

/** Rough English syllable counter (good enough for grade-level estimation). */
export const countSyllables = (word: string): number => {
    const w = word.toLowerCase().replace(/[^a-z]/g, '');
    if (!w) return 0;
    if (w.length <= 3) return 1;
    const stripped = w
        .replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '')
        .replace(/^y/, '');
    const groups = stripped.match(/[aeiouy]{1,2}/g);
    return Math.max(1, groups ? groups.length : 1);
};

const GSM7 = /^[A-Za-z0-9 @£$¥èéùìòÇ\r\nØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\\[~\]|€]*$/;

/** SMS segment math: 160/153 for GSM-7, 70/67 for UCS-2 (emoji, smart quotes). */
export const smsSegmentInfo = (text: string): { segments: number; encoding: 'GSM-7' | 'UCS-2' } => {
    const len = Array.from(text).length;
    if (len === 0) return { segments: 0, encoding: 'GSM-7' };
    const gsm = GSM7.test(text);
    const single = gsm ? 160 : 70;
    const multi = gsm ? 153 : 67;
    return { segments: len <= single ? 1 : Math.ceil(len / multi), encoding: gsm ? 'GSM-7' : 'UCS-2' };
};

export const analyzeReadability = (input: string, channel: QualityOptions['channel'] = 'email'): ReadabilityReport => {
    const text = channel === 'sms' ? input.trim() : stripHtml(input);
    const words: string[] = text.match(/[A-Za-z0-9'’-]+/g) || [];
    const sentences = text.split(/[.!?]+(?:\s|$)/).filter(s => /[A-Za-z0-9]/.test(s));
    const wordCount = words.length;
    const sentenceCount = Math.max(1, sentences.length);
    const syllables = words.reduce((n, w) => n + countSyllables(w), 0);

    const grade = wordCount === 0
        ? 0
        : 0.39 * (wordCount / sentenceCount) + 11.8 * (syllables / wordCount) - 15.59;

    const sms = channel === 'sms' ? smsSegmentInfo(text) : { segments: 0, encoding: 'GSM-7' as const };

    return {
        grade: Math.max(0, Math.round(grade * 10) / 10),
        wordCount,
        sentenceCount: wordCount === 0 ? 0 : sentenceCount,
        avgSentenceLength: wordCount === 0 ? 0 : Math.round((wordCount / sentenceCount) * 10) / 10,
        smsSegments: sms.segments,
        smsEncoding: sms.encoding,
        characters: Array.from(text).length,
    };
};

const SPAM_WORDS = [
    'free money', 'act now', 'limited time', 'click here', 'guarantee', 'winner',
    'no obligation', '100% free', 'urgent!!!', 'make money', 'risk free', 'buy now',
];

/** Returns human-readable warnings. Empty array = clean. */
export const qualityWarnings = (
    content: string,
    opts: QualityOptions,
    report: ReadabilityReport = analyzeReadability(content, opts.channel),
): string[] => {
    const warnings: string[] = [];
    const target = opts.targetGrade ?? 8;
    const text = opts.channel === 'sms' ? content : stripHtml(content);
    const lower = text.toLowerCase();

    if (report.grade > target + 1) {
        warnings.push(`Reading level is grade ${report.grade} (target ${target}). Consider simplifying.`);
    }
    if (opts.channel === 'sms') {
        const max = opts.maxSmsChars ?? 320;
        if (report.characters > max) warnings.push(`SMS is ${report.characters} characters (limit ${max}).`);
        if (report.smsEncoding === 'UCS-2') warnings.push('Emoji or special characters switch this SMS to UCS-2 (70 chars per segment).');
    }
    const letters = text.replace(/[^A-Za-z]/g, '');
    const upper = text.replace(/[^A-Z]/g, '');
    if (letters.length > 20 && upper.length / letters.length > 0.3) warnings.push('Too many ALL-CAPS words.');
    if ((text.match(/!/g) || []).length > 3) warnings.push('More than 3 exclamation marks.');
    const spam = SPAM_WORDS.filter(w => lower.includes(w));
    if (spam.length) warnings.push(`Spam-trigger wording: ${spam.join(', ')}.`);

    // Unresolved or malformed merge tags: "{firstName" / "[Name]" / "{{x}}" etc.
    const braces = (content.match(/\{/g) || []).length !== (content.match(/\}/g) || []).length;
    if (braces) warnings.push('Unbalanced merge-tag braces.');
    if (/\[(name|first ?name|church|pastor|date|time|location|link)[^\]]*\]/i.test(text)) {
        warnings.push('Placeholder text in [brackets] still needs to be filled in.');
    }
    if (opts.requireLink && !/https?:\/\/|href=/i.test(content)) warnings.push('No link included.');
    if (opts.requireDate && !/(\b(mon|tue|wed|thu|fri|sat|sun)[a-z]*\b|\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b|\d{1,2}\/\d{1,2})/i.test(text)) {
        warnings.push('No date mentioned.');
    }
    return warnings;
};

/** Facts (URLs / dates) that must appear verbatim if the source item was used. */
export const verifyFacts = (
    content: string,
    facts: { label: string; urls?: string[]; dates?: string[] }[],
): string[] => {
    const warnings: string[] = [];
    for (const f of facts) {
        for (const url of f.urls || []) {
            if (url && !content.includes(url)) warnings.push(`"${f.label}": link ${url} missing from draft.`);
        }
        for (const d of f.dates || []) {
            if (d && !content.toLowerCase().includes(d.toLowerCase())) warnings.push(`"${f.label}": date "${d}" missing or altered.`);
        }
    }
    return warnings;
};
