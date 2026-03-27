
import { GoogleGenAI } from '@google/genai';

/**
 * POST /ai/generate
 * 
 * Server-side proxy for all Gemini AI calls. The GEMINI_API_KEY is read
 * from process.env at runtime — never exposed in the frontend bundle.
 *
 * Body: {
 *   model?:             string   (default: 'gemini-2.0-flash')
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

    const apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    if (!apiKey) {
        console.error('[GeminiProxy] GEMINI_API_KEY is not set on the server.');
        return res.status(500).json({ error: 'AI service is not configured. Contact your administrator.' });
    }

    try {
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

        res.json({
            text: response.text || '',
            candidates: response.candidates || [],
        });
    } catch (e: any) {
        console.error('[GeminiProxy] Gemini API error:', e?.message || e);
        res.status(500).json({ error: e?.message || 'Gemini API error' });
    }
};
