import { GoogleGenAI, Type } from '@google/genai';
import { getDb } from './firebase';
import { analyzeReadability, qualityWarnings, verifyFacts, stripHtml } from '../services/readability';

/**
 * POST /ai/campaign-writer
 *
 * Structured church-communications writer for email, SMS and digital bulletin.
 * Returns subject-line variants, preview text, body (HTML for email/bulletin,
 * plain text for SMS) and deterministic quality checks (reading grade, SMS
 * segments, spam wording, fact verification).
 *
 * Body: {
 *   channel:      'email' | 'sms' | 'bulletin'
 *   churchId?:    string                  (loads smsAgentKnowledge facts)
 *   churchName?:  string
 *   senderName?:  string
 *   topic:        string                  (what to write about / instructions)
 *   goal?:        'inform' | 'invite' | 'remind' | 'thank'
 *   audience?:    'everyone' | 'parents' | 'students' | 'visitors' | 'volunteers' | string
 *   tone?:        string                  (e.g. 'warm', 'upbeat')
 *   length?:      'short' | 'medium' | 'long'
 *   targetGrade?: number                  (default 8)
 *   subjectCount?:number                  (2-4, default 3; email only)
 *   items?:       { label, description?, url?, date? }[]   (events/groups to feature)
 *   existingText?:string                  (rewrite / simplify this instead of drafting fresh)
 *   simplify?:    boolean                 (rewrite existingText to hit targetGrade)
 *   voice?:       object                  (reserved for per-church voice profile, milestone 2)
 * }
 */

type Channel = 'email' | 'sms' | 'bulletin';

const LENGTH_GUIDE: Record<Channel, Record<string, string>> = {
    email: {
        short: 'about 60-90 words',
        medium: 'about 120-180 words',
        long: 'about 250-350 words',
    },
    bulletin: {
        short: 'about 80-120 words',
        medium: 'about 180-260 words',
        long: 'about 300-450 words',
    },
    sms: {
        short: 'at most 160 characters',
        medium: 'at most 240 characters',
        long: 'at most 320 characters',
    },
};

const SMS_MAX: Record<string, number> = { short: 160, medium: 240, long: 320 };

const clamp = (n: any, lo: number, hi: number, dflt: number) => {
    const v = Number(n);
    return Number.isFinite(v) ? Math.min(hi, Math.max(lo, Math.round(v))) : dflt;
};

const loadKnowledge = async (churchId?: string): Promise<string> => {
    if (!churchId) return '';
    try {
        const snap = await getDb().collection('smsAgentKnowledge').doc(churchId).get();
        const k = snap.data();
        if (!k) return '';
        const lines = [
            k.address && `Address: ${k.address}`,
            k.serviceTimes && `Service times: ${k.serviceTimes}`,
            k.pastor && `Pastor: ${k.pastor}`,
            k.ministries && `Ministries: ${k.ministries}`,
            k.classes && `Classes & groups: ${k.classes}`,
            k.website && `Website: ${k.website}`,
            k.customFacts && `Other facts: ${k.customFacts}`,
        ].filter(Boolean);
        return lines.join('\n');
    } catch (e) {
        console.error('[CampaignWriter] knowledge load failed:', e);
        return '';
    }
};

/** Per-church voice profile (churchVoice/{churchId}), saved from the UI. */
const loadVoice = async (churchId?: string): Promise<any | null> => {
    if (!churchId) return null;
    try {
        const snap = await getDb().collection('churchVoice').doc(churchId).get();
        return snap.exists ? snap.data() : null;
    } catch (e) {
        console.error('[CampaignWriter] voice load failed:', e);
        return null;
    }
};

const resolveApiKey = async (): Promise<string | undefined> => {
    let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    try {
        const snap = await getDb().doc('system/settings').get();
        const data = snap.data() || {};
        if (data.geminiApiKey) apiKey = String(data.geminiApiKey).trim();
    } catch (e) {
        console.error('[CampaignWriter] Failed to fetch system settings:', e);
    }
    return apiKey;
};

const responseSchema = (channel: Channel) => ({
    type: Type.OBJECT,
    properties: {
        subjectVariants: {
            type: Type.ARRAY,
            items: {
                type: Type.OBJECT,
                properties: {
                    text: { type: Type.STRING },
                    style: { type: Type.STRING, enum: ['curiosity', 'direct', 'urgent', 'benefit'] },
                },
                required: ['text', 'style'],
            },
        },
        previewText: { type: Type.STRING },
        body: { type: Type.STRING },
    },
    required: channel === 'sms' ? ['body'] : ['subjectVariants', 'previewText', 'body'],
});

export const buildSystemInstruction = (p: {
    channel: Channel; churchName?: string; senderName?: string; tone?: string;
    goal?: string; audience?: string; length: string; targetGrade: number;
    subjectCount: number; knowledge: string; voice?: any;
}): string => {
    const { channel } = p;
    const voiceLines: string[] = [];
    if (p.voice) {
        if (p.voice.adjectives?.length) voiceLines.push(`Voice: ${p.voice.adjectives.join(', ')}.`);
        if (p.voice.wordsToUse?.length) voiceLines.push(`Prefer these words/phrases: ${p.voice.wordsToUse.join(', ')}.`);
        if (p.voice.wordsToAvoid?.length) voiceLines.push(`Never use: ${p.voice.wordsToAvoid.join(', ')}.`);
        if (p.voice.signOffs?.length) voiceLines.push(`Sign-off examples: ${p.voice.signOffs.join(' | ')}.`);
        if (p.voice.sampleMessages?.length) voiceLines.push(`Match the style of these samples:\n${p.voice.sampleMessages.join('\n---\n')}`);
        if (p.voice.notes) voiceLines.push(`Additional guidance: ${p.voice.notes}`);
    }
    if (channel === 'sms') {
        voiceLines.push(p.voice?.allowEmoji ? 'At most one emoji is allowed.' : 'Do not use emoji (keeps the text in one cheap GSM-7 segment).');
    }

    const format = channel === 'sms'
        ? `OUTPUT FORMAT: "body" is a plain-text SMS. No HTML, no markdown. ${LENGTH_GUIDE.sms[p.length]}. Include at most one link. Do not include subject lines.`
        : `OUTPUT FORMAT: "body" is clean HTML using only <p>, <h2>, <h3>, <strong>, <em>, <ul>, <ol>, <li>, <a href>. No markdown, no code fences, no <html>/<body>/<style>. Length: ${LENGTH_GUIDE[channel][p.length]}. Paragraphs of 2-3 short sentences.${
            channel === 'email'
                ? ` Provide exactly ${p.subjectCount} subject-line variants (under 60 characters each) with DIFFERENT styles (curiosity, direct, urgent, benefit) and a "previewText" under 90 characters that complements, not repeats, the subject.`
                : ' For a bulletin, provide a short title as the first subject variant and a one-line "previewText" summary.'
        }`;

    return `You are the communications director for ${p.churchName || 'a local church'}. You write ${channel === 'sms' ? 'text messages' : channel === 'bulletin' ? 'digital bulletin sections' : 'emails'} that are warm, clear and trustworthy.

Tone: ${p.tone || 'warm, pastoral and welcoming'}.
Goal: ${p.goal || 'inform'}. Audience: ${p.audience || 'everyone in the church'}.
Write at a US grade ${p.targetGrade} reading level or lower: short sentences, common words, no church jargon unless the audience is members.
${p.senderName ? `The message is from ${p.senderName}.` : ''}
${voiceLines.join('\n')}

${format}

RULES:
- Use ONLY facts provided in the request or in CHURCH FACTS. Never invent dates, times, prices, locations or links. If a detail is unknown, leave it out.
- Copy dates, times and URLs from provided items EXACTLY.
- Preserve merge tags such as @first-name or {firstName} exactly as written.
- Do not guilt, pressure or use hype/spam wording. No ALL CAPS shouting.
${p.knowledge ? `\nCHURCH FACTS:\n${p.knowledge}` : ''}`;
};

export const handleCampaignWriter = async (req: any, res: any) => {
    const body = req.body || {};
    const channel: Channel = ['email', 'sms', 'bulletin'].includes(body.channel) ? body.channel : 'email';
    const length: string = ['short', 'medium', 'long'].includes(body.length) ? body.length : 'medium';
    const requestedGrade = body.targetGrade;
    const subjectCount = clamp(body.subjectCount, 2, 4, 3);
    const items: any[] = Array.isArray(body.items) ? body.items.slice(0, 12) : [];
    const existingText: string = typeof body.existingText === 'string' ? body.existingText : '';
    const topic: string = typeof body.topic === 'string' ? body.topic.trim() : '';

    if (!topic && items.length === 0 && !existingText) {
        return res.status(400).json({ error: 'Provide a topic, items to feature, or existingText.' });
    }

    const apiKey = await resolveApiKey();
    if (!apiKey) {
        return res.status(500).json({ error: 'AI service is not configured. Contact your administrator.' });
    }

    const knowledge = await loadKnowledge(body.churchId);
    const voice = body.voice || await loadVoice(body.churchId);
    const targetGrade = clamp(requestedGrade ?? voice?.targetGrade, 3, 14, 8);
    const systemInstruction = buildSystemInstruction({
        channel, churchName: body.churchName, senderName: body.senderName, tone: body.tone,
        goal: body.goal, audience: body.audience, length, targetGrade, subjectCount, knowledge, voice,
    });

    const itemBlock = items.length
        ? `\nFEATURE THESE ITEMS (in this order):\n${items.map((it, i) =>
            `${i + 1}. ${it.label || 'Item'}${it.date ? ` — ${it.date}` : ''}${it.description ? `\n   ${stripHtml(String(it.description)).slice(0, 400)}` : ''}${it.url ? `\n   Link: ${it.url}` : ''}`).join('\n')}`
        : '';

    const prompt = existingText
        ? `${body.simplify ? `Rewrite the following to a grade ${targetGrade} reading level or lower, keeping every fact, date, link and merge tag.` : `Improve the following per the instructions.`}\n${topic ? `Instructions: ${topic}\n` : ''}\nTEXT:\n"""\n${existingText}\n"""`
        : `Write the ${channel === 'sms' ? 'text message' : channel === 'bulletin' ? 'bulletin section' : 'email'}.\nTopic / instructions: ${topic || '(see items)'}${itemBlock}`;

    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: prompt,
            config: {
                systemInstruction,
                responseMimeType: 'application/json',
                responseSchema: responseSchema(channel),
                temperature: 0.7,
            },
        });

        let parsed: any;
        try {
            parsed = JSON.parse((response.text || '').trim());
        } catch {
            return res.status(502).json({ error: 'The AI returned an unreadable response. Please try again.' });
        }

        let outBody: string = String(parsed.body || '').trim();
        if (channel === 'sms') outBody = stripHtml(outBody);
        const subjectVariants = channel === 'sms' ? [] : (Array.isArray(parsed.subjectVariants) ? parsed.subjectVariants : [])
            .filter((v: any) => v && typeof v.text === 'string' && v.text.trim())
            .slice(0, subjectCount)
            .map((v: any, i: number) => ({
                id: `v${i + 1}`,
                text: v.text.trim(),
                style: v.style || 'direct',
            }));

        const readability = analyzeReadability(outBody, channel);
        const warnings = [
            ...qualityWarnings(outBody, {
                channel, targetGrade,
                maxSmsChars: SMS_MAX[length],
                requireLink: items.some(i => i.url),
                requireDate: items.some(i => i.date),
            }, readability),
            ...verifyFacts(outBody, items.map(i => ({
                label: i.label || 'Item',
                urls: i.url ? [i.url] : [],
                dates: i.date ? [i.date] : [],
            }))),
        ];
        for (const v of subjectVariants) {
            if (v.text.length > 60) warnings.push(`Subject "${v.text.slice(0, 30)}…" is ${v.text.length} characters (aim for under 60).`);
        }

        res.json({
            channel,
            subjectVariants,
            previewText: channel === 'sms' ? '' : String(parsed.previewText || '').trim(),
            body: outBody,
            readability,
            warnings,
        });
    } catch (e: any) {
        console.error('[CampaignWriter] Gemini error:', e?.message || e);
        res.status(500).json({ error: e?.message || 'Gemini API error' });
    }
};
