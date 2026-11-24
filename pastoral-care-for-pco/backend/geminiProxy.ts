
import { GoogleGenAI } from '@google/genai';
import { getDb } from './firebase';

/**
 * POST /ai/generate
 * 
 * Server-side proxy for all Gemini AI calls. The GEMINI_API_KEY is read
 * from process.env at runtime — never exposed in the frontend bundle.
 *
 * Body: {
 *   model?:             string   (default: 'gemini-2.5-flash')
 *   prompt:             string
 *   systemInstruction?: string
 *   config?:            object   (forwarded verbatim to Gemini config)
 * }
 *
 * Response: {
 *   text:        string
 *   candidates?: any[]   (present when caller needs groundingMetadata, e.g. Maps)
 * }
 */
export interface GeminiGenerateParams {
    model?: string;
    prompt: string;
    systemInstruction?: string;
    config?: Record<string, any>;
}

/**
 * Shared server-side helper for calling Gemini directly without an HTTP roundtrip.
 */
export async function generateGeminiContent({
    model = 'gemini-2.5-flash',
    prompt,
    systemInstruction,
    config,
}: GeminiGenerateParams): Promise<{ text: string; candidates: any[] }> {
    let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    try {
        const snap = await getDb().doc('system/settings').get();
        const data = snap.data() || {};
        if (data.geminiApiKey) {
            apiKey = data.geminiApiKey.trim();
        }
    } catch (dbErr) {
        console.error('[GeminiProxy] Failed to fetch system settings:', dbErr);
    }

    if (!apiKey) {
        console.error('[GeminiProxy] GEMINI_API_KEY is not set on the server or in System Settings.');
        throw new Error('AI service is not configured. Contact your administrator.');
    }

    const ai = new GoogleGenAI({ apiKey });
    const mergedConfig: Record<string, any> = { ...(config || {}) };
    if (systemInstruction) {
        mergedConfig.systemInstruction = systemInstruction;
    }

    const response = await ai.models.generateContent({
        model,
        contents: prompt,
        ...(Object.keys(mergedConfig).length > 0 ? { config: mergedConfig } : {}),
    });

    return {
        text: response.text || '',
        candidates: response.candidates || [],
    };
}

export const handleGeminiProxy = async (req: any, res: any) => {
    const {
        model = 'gemini-2.5-flash',
        prompt,
        systemInstruction,
        config,
    } = req.body || {};

    if (!prompt) {
        return res.status(400).json({ error: 'prompt is required' });
    }

    try {
        const result = await generateGeminiContent({ model, prompt, systemInstruction, config });
        res.json(result);
    } catch (e: any) {
        console.error('[GeminiProxy] Gemini API error:', e?.message || e);
        const status = e?.message?.includes('not configured') ? 500 : 500;
        res.status(status).json({ error: e?.message || 'Gemini API error' });
    }
};
