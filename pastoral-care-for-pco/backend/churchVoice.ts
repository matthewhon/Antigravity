import { GoogleGenAI, Type } from '@google/genai';
import { getDb } from './firebase';

/**
 * POST /ai/church-voice/learn
 *
 * Stateless: analyses sample messages (the church's past sent emails/texts,
 * supplied by the browser) and PROPOSES a voice profile. Nothing is saved —
 * the admin reviews/edits it in the UI and saves it to churchVoice/{churchId}.
 *
 * Body: { samples: string[]  (plain text, up to 12 used) }
 */
export const handleChurchVoiceLearn = async (req: any, res: any) => {
    const raw: any[] = Array.isArray(req.body?.samples) ? req.body.samples : [];
    const samples = raw
        .filter(s => typeof s === 'string' && s.trim().length > 40)
        .slice(0, 12)
        .map(s => s.trim().slice(0, 1500));

    if (samples.length < 2) {
        return res.status(400).json({ error: 'Need at least 2 past messages with some text to learn from.' });
    }

    let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    try {
        const snap = await getDb().doc('system/settings').get();
        const data = snap.data() || {};
        if (data.geminiApiKey) apiKey = String(data.geminiApiKey).trim();
    } catch (e) {
        console.error('[ChurchVoice] Failed to fetch system settings:', e);
    }
    if (!apiKey) return res.status(500).json({ error: 'AI service is not configured. Contact your administrator.' });

    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: `Here are past messages written by a church:\n\n${samples.map((s, i) => `--- MESSAGE ${i + 1} ---\n${s}`).join('\n\n')}`,
            config: {
                systemInstruction:
                    `You analyse a church's past communications and describe its writing voice so another writer can imitate it.
Return concise, concrete values:
- adjectives: 3-5 style adjectives (e.g. "warm", "direct").
- wordsToUse: up to 8 words/phrases the church repeatedly uses (e.g. "church family").
- wordsToAvoid: up to 6 words/phrases that clearly do NOT fit this voice (e.g. hype or corporate jargon); leave empty if unclear.
- signOffs: up to 3 sign-offs copied verbatim from the messages (empty if none).
- sampleMessages: pick the 2-3 messages (or short excerpts under 400 characters) that best represent the voice, copied verbatim.
- targetGrade: estimated US reading grade (integer 5-12) of the samples.
- allowEmoji: true only if the messages use emoji.
Never invent content that is not in the messages.`,
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        adjectives: { type: Type.ARRAY, items: { type: Type.STRING } },
                        wordsToUse: { type: Type.ARRAY, items: { type: Type.STRING } },
                        wordsToAvoid: { type: Type.ARRAY, items: { type: Type.STRING } },
                        signOffs: { type: Type.ARRAY, items: { type: Type.STRING } },
                        sampleMessages: { type: Type.ARRAY, items: { type: Type.STRING } },
                        targetGrade: { type: Type.INTEGER },
                        allowEmoji: { type: Type.BOOLEAN },
                    },
                    required: ['adjectives', 'wordsToUse', 'wordsToAvoid', 'signOffs', 'sampleMessages'],
                },
                temperature: 0.2,
            },
        });
        const parsed = JSON.parse((response.text || '').trim());
        const list = (v: any, n: number) => (Array.isArray(v) ? v : []).filter((x: any) => typeof x === 'string' && x.trim()).map((x: string) => x.trim()).slice(0, n);
        res.json({
            adjectives: list(parsed.adjectives, 5),
            wordsToUse: list(parsed.wordsToUse, 8),
            wordsToAvoid: list(parsed.wordsToAvoid, 6),
            signOffs: list(parsed.signOffs, 3),
            sampleMessages: list(parsed.sampleMessages, 3).map((s: string) => s.slice(0, 400)),
            targetGrade: Math.min(12, Math.max(5, Number(parsed.targetGrade) || 8)),
            allowEmoji: !!parsed.allowEmoji,
        });
    } catch (e: any) {
        console.error('[ChurchVoice] learn failed:', e?.message || e);
        res.status(500).json({ error: 'Could not analyse past messages. Please try again.' });
    }
};
