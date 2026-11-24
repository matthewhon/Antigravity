import { generateCampaignContent } from '../../services/geminiService';
import { SmsTag } from '../../types';

export const compressSmsImage = (file: File): Promise<Blob | File> => {
    return new Promise((resolve) => {
        if (!file.type.startsWith('image/') || file.type === 'image/gif') {
            resolve(file);
            return;
        }
        const img = new Image();
        img.src = URL.createObjectURL(file);
        img.onload = () => {
            URL.revokeObjectURL(img.src);
            const MAX_DIM = 1024;
            let width = img.width;
            let height = img.height;
            if (width > MAX_DIM || height > MAX_DIM) {
                if (width > height) {
                    height = Math.round((height * MAX_DIM) / width);
                    width = MAX_DIM;
                } else {
                    width = Math.round((width * MAX_DIM) / height);
                    height = MAX_DIM;
                }
            }
            const canvas = document.createElement('canvas');
            canvas.width = width;
            canvas.height = height;
            const ctx = canvas.getContext('2d');
            if (!ctx) {
                resolve(file);
                return;
            }
            ctx.drawImage(img, 0, 0, width, height);
            canvas.toBlob((blob) => {
                if (blob) {
                    const name = file.name.replace(/\.[^/.]+$/, '') + '.jpg';
                    const compressedFile = new File([blob], name, { type: 'image/jpeg' });
                    resolve(compressedFile);
                } else {
                    resolve(file);
                }
            }, 'image/jpeg', 0.85);
        };
        img.onerror = () => {
            resolve(file);
        };
    });
};

export const STATUS_LABELS: Record<string, { label: string; color: string }> = {
    draft: { label: 'Draft', color: 'bg-slate-100 text-slate-600 dark:bg-slate-700 dark:text-slate-300' },
    scheduled: { label: 'Scheduled', color: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    sending: { label: 'Sending...', color: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    sent: { label: 'Sent', color: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400' },
    failed: { label: 'Failed', color: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export const SEGMENT_NOTE = 'SMS segments: 1 segment = 160 chars. Merge tags like {firstName} count toward length.';

export const ALL_MERGE_TAGS: { tag: string; label: string }[] = [
    { tag: '{firstName}', label: 'First Name' },
    { tag: '{lastName}', label: 'Last Name' },
    { tag: '{fullName}', label: 'Full Name' },
    { tag: '{email}', label: 'Email' },
    { tag: '{phone}', label: 'Phone' },
    { tag: '{city}', label: 'City' },
    { tag: '{state}', label: 'State' },
    { tag: '{birthday}', label: 'Birthday' },
    { tag: '{anniversary}', label: 'Anniversary' },
    { tag: '{church.name}', label: 'Church Name' },
    { tag: '{church.phone}', label: 'Church Phone' },
    { tag: '{church.address}', label: 'Church Address' },
    { tag: '{church.website}', label: 'Church Website' },
];

export const COMMON_EMOJIS = [
    '👋', '🙏', '❤️', '😊', '👍', '🎉', '🙌', '✨', '🔥', '💡',
    '📆', '🔔', '💬', '📢', '⛪', '✝️', '🕊️', '☕', '🌟', '🤗'
];

export const TAG_COLOR_MAP: Record<SmsTag['color'], { bg: string; text: string; border: string; dot: string }> = {
    violet: { bg: 'bg-violet-100 dark:bg-violet-900/40', text: 'text-violet-700 dark:text-violet-300', border: 'border-violet-300 dark:border-violet-700', dot: 'bg-violet-500' },
    blue: { bg: 'bg-blue-100 dark:bg-blue-900/40', text: 'text-blue-700 dark:text-blue-300', border: 'border-blue-300 dark:border-blue-700', dot: 'bg-blue-500' },
    emerald: { bg: 'bg-emerald-100 dark:bg-emerald-900/40', text: 'text-emerald-700 dark:text-emerald-300', border: 'border-emerald-300 dark:border-emerald-700', dot: 'bg-emerald-500' },
    amber: { bg: 'bg-amber-100 dark:bg-amber-900/40', text: 'text-amber-700 dark:text-amber-300', border: 'border-amber-300 dark:border-amber-700', dot: 'bg-amber-500' },
    red: { bg: 'bg-red-100 dark:bg-red-900/40', text: 'text-red-700 dark:text-red-300', border: 'border-red-300 dark:border-red-700', dot: 'bg-red-500' },
    pink: { bg: 'bg-pink-100 dark:bg-pink-900/40', text: 'text-pink-700 dark:text-pink-300', border: 'border-pink-300 dark:border-pink-700', dot: 'bg-pink-500' },
};

export function countSegments(body: string): number {
    if (!body) return 0;
    const isUnicode = !/^[\n\r a-zA-Z0-9@£$¥èéùìòÇØøÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ!"#¤%&'()*+,\-./:;<=>?¡ÄÖÑÜ§¿äöñüà^{}\[~\]|€]*$/.test(body);
    if (isUnicode) {
        if (body.length <= 70) return 1;
        return Math.ceil(body.length / 67);
    } else {
        let gsmLength = 0;
        const gsmExtensions = '^{}\\[~]|€';
        for (let i = 0; i < body.length; i++) {
            gsmLength += gsmExtensions.includes(body[i]) ? 2 : 1;
        }
        if (gsmLength <= 160) return 1;
        return Math.ceil(gsmLength / 153);
    }
}

export async function shortenSms(messageBody: string, churchId?: string): Promise<string> {
    const result = await generateCampaignContent({
        channel: 'sms',
        churchId,
        existingText: messageBody,
        topic: 'Shorten this text message to under 160 characters (one SMS segment) while keeping its full meaning and warmth. Keep merge tags like {firstName}, {email}, {phone}, {city}, {state}, {birthday}, {anniversary} exactly as written, and keep any link.',
        length: 'short',
    });
    return result.body.trim();
}

export async function getSmsAiSuggestion(messageBody: string, churchId?: string): Promise<string> {
    return shortenSms(messageBody, churchId);
}

export interface AiWorkflowDraftStep {
    channelType: 'sms' | 'mms' | 'email' | 'staff_sms' | 'staff_email';
    delayDays: number;
    delayHours?: number;
    scheduleType?: 'relative' | 'day_of_week' | 'day_of_month';
    scheduleDayOfWeek?: number;
    scheduleDayOfMonth?: number;
    scheduleTime?: string;
    message?: string;
    emailSubject?: string;
    emailBody?: string;
    staffNote?: string;
}

export interface AiWorkflowDraft {
    name: string;
    description: string;
    steps: AiWorkflowDraftStep[];
}

export interface AiBuilderContext {
    eventType: 'registration' | 'calendar';
    eventName: string;
    eventDate?: string;
    eventPcoId?: string;
    isManualEntry: boolean;
    goal: 'invite' | 'remind' | 'both';
    touchpointCount: number;
    timingMode: 'before_event' | 'after_registration';
    firstMessageDaysBefore?: number;
    spacing: 'even' | 'closer_to_event' | 'ai_decides';
    tone: string;
    includeStaffAlert: boolean;
    staffAlertTiming?: 'with_first' | 'with_last' | 'day_of_event';
    includeRegistrantCount: boolean;
    customContent?: string;
}

export async function generateWorkflowWithAi(prompt: string): Promise<AiWorkflowDraft> {
    const systemPrompt = `You are an expert church communications strategist helping a pastor build automated message workflows.
The user will describe the workflow they want in plain English.
You must respond with ONLY a valid JSON object (no markdown, no explanation) matching this exact schema:
{
  "name": string,
  "description": string,
  "steps": [
    {
      "channelType": "sms" | "mms" | "email" | "staff_sms" | "staff_email",
      "delayDays": number,
      "delayHours": number,
      "scheduleType": "relative" | "day_of_week" | "day_of_month",
      "scheduleDayOfWeek": number,
      "scheduleDayOfMonth": number,
      "scheduleTime": string,
      "message": string,
      "emailSubject": string,
      "emailBody": string,
      "staffNote": string
    }
  ]
}

Channel type guide:
- "sms"         — standard text message sent to the enrolled contact.
- "mms"         — picture/media message sent to the enrolled contact (also include a message caption).
- "email"       — email sent to the enrolled contact (requires emailSubject and emailBody).
- "staff_sms"   — internal SMS notification sent to a pastor or staff member (not the contact). Use when the user wants to alert staff to follow up.
- "staff_email" — internal email notification sent to a pastor or staff member (not the contact). Use when the user wants to email staff with a care alert.

Guidelines:
- Use warm, pastoral, encouraging language appropriate for a church audience.
- For SMS steps, keep "message" under 160 characters when possible (1 segment).
- Include real content (actual Bible verses, actual prayer encouragements, etc.) — do NOT use placeholders like "[verse here]".
- Use {firstName} to personalise messages to the contact where natural.
- If the workflow involves inviting people to register/sign up for an event, you MUST include the {eventLink} merge tag in the message body or email body of all contact steps as the registration link (e.g., "Register here: {eventLink}").
- delayDays and delayHours for the first step are always 0.
- For subsequent steps, use the delay the user specifies or infer a sensible default (e.g. 4 hours or 1 day between steps).
- If the user asks for a weekly cadence, prefer scheduleType "day_of_week" with an appropriate scheduleDayOfWeek.
- If the user asks for a monthly reminder on a specific date, prefer scheduleType "day_of_month".
- If the user asks for staff follow-up or pastor alerts, add a staff_sms or staff_email step after the relevant contact step.
- Infer the number of steps and channel mix from the user's description.

User's workflow request:
${prompt}`;

    const { getAuthJsonHeaders } = await import('../../services/authHeaders');
    const res = await fetch('/ai/generate', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ model: 'gemini-2.5-flash', prompt: systemPrompt }),
    });
    if (!res.ok) throw new Error('AI request failed');
    const data = await res.json();
    const raw = (data.text || '').trim();
    const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    try {
        return JSON.parse(cleaned) as AiWorkflowDraft;
    } catch {
        throw new Error('AI returned an unexpected format. Please try again.');
    }
}

export async function generateWorkflowFromContext(ctx: AiBuilderContext): Promise<AiWorkflowDraft> {
    const eventLabel = ctx.eventType === 'registration' ? 'Registration Event' : 'Calendar Event';
    const eventDateStr = ctx.eventDate
        ? new Date(ctx.eventDate + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })
        : 'date not specified';

    const isInvite = ctx.goal === 'invite';
    const isRemind = ctx.goal === 'remind';

    const goalSection = isInvite
        ? `GOAL: INVITATION — Drive signups for ${ctx.eventName}. These messages go to people on a list who have NOT yet registered. Every message should build excitement and include a clear call to action to sign up for the event. The urgency and excitement should increase as the event approaches.`
        : isRemind
            ? `GOAL: REMINDERS — Prepare registered attendees for ${ctx.eventName}. These messages go to people who have ALREADY signed up. Do NOT include a CTA to register. Focus on what to expect, practical details (what to bring, where to go, parking), spiritual preparation, and building anticipation.`
            : `GOAL: REMINDERS — Prepare registered attendees for ${ctx.eventName}. These messages go to people who have ALREADY signed up. Do NOT include a CTA to register. Focus on preparation, logistics, and spiritual anticipation.`;

    const timingDesc = ctx.timingMode === 'before_event'
        ? `The first message should go out ${ctx.firstMessageDaysBefore ?? 7} days before the event (${eventDateStr}). Space the remaining ${ctx.touchpointCount - 1} message(s) ${ctx.spacing === 'even' ? 'evenly across the window' : ctx.spacing === 'closer_to_event' ? 'with messages spaced closer together as the event approaches' : 'at sensible intervals of your choosing'}.`
        : `The first message goes out immediately when someone registers. Space the remaining ${ctx.touchpointCount - 1} message(s) ${ctx.spacing === 'even' ? 'evenly' : ctx.spacing === 'closer_to_event' ? 'closer together as the event approaches' : 'at sensible intervals'}. Use delayDays between steps.`;

    const channelDesc = `Alternate SMS and Email for the ${ctx.touchpointCount} contact messages — odd steps (1, 3, 5…) = SMS, even steps (2, 4, 6…) = Email.`;

    const staffDesc = ctx.includeStaffAlert
        ? `After the ${ctx.staffAlertTiming === 'with_first' ? 'first contact message' : ctx.staffAlertTiming === 'with_last' ? 'final contact message' : 'last contact message (day of event)'}, add a staff_email step alerting the pastor that people are registered for ${ctx.eventName}.${ctx.includeRegistrantCount ? ' Include the merge tag {registrantCount} in the staff message body to show how many people are registered.' : ''}`
        : 'Do not include any staff alert steps.';

    const systemPrompt = `You are an expert church communications strategist helping a pastor build automated message workflows.
You must respond with ONLY a valid JSON object (no markdown, no explanation) matching this exact schema:
{
  "name": string,
  "description": string,
  "steps": [
    {
      "channelType": "sms" | "email" | "staff_email",
      "delayDays": number,
      "delayHours": number,
      "scheduleType": "relative",
      "scheduleTime": string,
      "message": string,
      "emailSubject": string,
      "emailBody": string,
      "staffNote": string
    }
  ]
}

Here is the workflow brief:

EVENT: ${ctx.eventName} (${eventLabel})${ctx.eventDate ? ` on ${eventDateStr}` : ''}
${goalSection}
TOTAL CONTACT MESSAGES: ${ctx.touchpointCount}
TIMING: ${timingDesc}
CHANNELS: ${channelDesc}
TONE: ${ctx.tone}
STAFF ALERT: ${staffDesc}${ctx.customContent ? `
ADDITIONAL CONTENT TO INCLUDE: ${ctx.customContent}` : ''}

Guidelines:
- Use warm, pastoral language appropriate for a church.
- For SMS steps, keep "message" under 160 characters.
- Include real, specific content (actual Bible verses, actual encouragements) — never use placeholders like "[verse here]".
- Use {firstName} to personalise messages where natural.
${ctx.eventType === 'registration' && isInvite ? '- This is an event invitation workflow. You MUST include the `{eventLink}` merge tag in the message body or email body of all contact steps as the registration link (e.g. "Register here: {eventLink}").' : ''}
- delayDays for the very first step is always 0.
- For email steps, write a compelling emailSubject and a warm, 2-3 paragraph emailBody with greeting, body, and sign-off. Use {firstName}.
- The name should reference the event and the goal (e.g. "${ctx.eventName} — ${isInvite ? 'Invitation' : 'Reminders'}"). The description should be 1-2 sentences.`;

    const { getAuthJsonHeaders } = await import('../../services/authHeaders');
    const res = await fetch('/ai/generate', {
        method: 'POST',
        headers: await getAuthJsonHeaders(),
        body: JSON.stringify({ model: 'gemini-2.5-flash', prompt: systemPrompt }),
    });
    if (!res.ok) throw new Error('AI request failed');
    const data = await res.json();
    const raw = (data.text || '').trim();
    const cleaned = raw.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '').trim();
    try {
        return JSON.parse(cleaned) as AiWorkflowDraft;
    } catch {
        throw new Error('AI returned an unexpected format. Please try again.');
    }
}

export function timeAgo(ts: number): string {
    const diffMs = Date.now() - ts;
    const mins = Math.floor(diffMs / 60_000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.floor(hrs / 24);
    return `${days}d ago`;
}
