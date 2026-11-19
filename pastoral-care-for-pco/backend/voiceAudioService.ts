import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { GoogleGenAI, Type } from '@google/genai';
import { getAuth } from 'firebase-admin/auth';
import { getDb, getStorage } from './firebase';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

function extFromMime(mimeType: string, fileName?: string): string {
    const lower = String(mimeType || '').toLowerCase();
    if (lower.includes('webm')) return 'webm';
    if (lower.includes('ogg')) return 'ogg';
    if (lower.includes('wav')) return 'wav';
    if (lower.includes('mp4') || lower.includes('m4a') || lower.includes('aac')) return 'm4a';
    if (lower.includes('mpeg') || lower.includes('mp3')) return 'mp3';
    const fromName = path.extname(fileName || '').replace(/^\./, '').toLowerCase();
    return fromName || 'webm';
}

export async function transcodeToMp3(
    inputBuffer: Buffer,
    mimeType = 'audio/webm',
    fileName?: string
): Promise<{ mp3Buffer: Buffer; durationSec: number }> {
    const id = randomUUID();
    const tmpDir = os.tmpdir();
    const inputExt = extFromMime(mimeType, fileName);
    const inputPath = path.join(tmpDir, `voice_in_${id}.${inputExt}`);
    const outputPath = path.join(tmpDir, `voice_out_${id}.mp3`);

    await fs.writeFile(inputPath, inputBuffer);

    try {
        let durationSec = 0;
        await new Promise<void>((resolve, reject) => {
            ffmpeg(inputPath)
                .audioCodec('libmp3lame')
                .audioFrequency(44100)
                .audioChannels(1)
                .audioBitrate('128k')
                .format('mp3')
                .on('codecData', (data: any) => {
                    const m = /(\d+):(\d+):(\d+(?:\.\d+)?)/.exec(String(data?.duration || ''));
                    if (m) {
                        durationSec = Math.round(Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]));
                    }
                })
                .on('end', () => resolve())
                .on('error', (err: any) => reject(err))
                .save(outputPath);
        });

        const mp3Buffer = await fs.readFile(outputPath);
        return { mp3Buffer, durationSec };
    } finally {
        await fs.unlink(inputPath).catch(() => {});
        await fs.unlink(outputPath).catch(() => {});
    }
}

export async function transcribeVoicemailWithGemini(
    audioBuffer: Buffer,
    mimeType = 'audio/mpeg'
): Promise<{ transcript: string; summary: string; urgent: boolean } | null> {
    let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY;
    try {
        const snap = await getDb().doc('system/settings').get();
        const data = snap.data() || {};
        if (data.geminiApiKey) apiKey = String(data.geminiApiKey).trim();
    } catch {
        // fallback to env
    }
    if (!apiKey) return null;

    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash',
            contents: [
                {
                    inlineData: {
                        mimeType,
                        data: audioBuffer.toString('base64'),
                    },
                },
                {
                    text: 'Transcribe this pastoral care / church voicemail accurately. Also provide a 1-sentence summary and set urgent=true if the caller mentions an emergency, hospital visit, death, crisis, or urgent pastoral need.',
                },
            ],
            config: {
                responseMimeType: 'application/json',
                responseSchema: {
                    type: Type.OBJECT,
                    properties: {
                        transcript: { type: Type.STRING },
                        summary: { type: Type.STRING },
                        urgent: { type: Type.BOOLEAN },
                    },
                    required: ['transcript', 'summary', 'urgent'],
                },
            },
        });

        const parsed = JSON.parse(response.text || '{}');
        return {
            transcript: String(parsed.transcript || '').trim(),
            summary: String(parsed.summary || '').trim(),
            urgent: Boolean(parsed.urgent),
        };
    } catch (err: any) {
        console.warn('[voiceAudioService] Gemini transcription failed:', err?.message || err);
        return null;
    }
}

export const handleUploadVoiceAudio = async (req: any, res: any) => {
    res.set('Access-Control-Allow-Origin', '*');
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    let uid = '';
    try {
        const decoded = await getAuth().verifyIdToken(authHeader.slice(7).trim());
        uid = decoded.uid;
    } catch {
        return res.status(401).json({ error: 'Unauthorized' });
    }

    const { churchId, scope = 'flow_prompt', fileName, mimeType = 'audio/webm', dataBase64 } = req.body || {};
    if (!churchId || !dataBase64) {
        return res.status(400).json({ error: 'Missing churchId or dataBase64' });
    }
    if (scope !== 'user_greeting' && scope !== 'flow_prompt') {
        return res.status(400).json({ error: 'Invalid scope' });
    }

    try {
        const db = getDb();
        const userSnap = await db.collection('users').doc(uid).get();
        const userData = userSnap.data() || {};
        if (userData.churchId && userData.churchId !== churchId && !userData.roles?.includes('System Administration')) {
            return res.status(403).json({ error: 'Forbidden' });
        }

        const cleanBase64 = String(dataBase64).replace(/^data:[^;]+;base64,/, '');
        const rawBuffer = Buffer.from(cleanBase64, 'base64');
        if (rawBuffer.length === 0 || rawBuffer.length > 15 * 1024 * 1024) {
            return res.status(400).json({ error: 'Audio file must be between 1 byte and 15 MB.' });
        }

        const { mp3Buffer, durationSec } = await transcodeToMp3(rawBuffer, mimeType, fileName);

        const audioId = `${scope === 'user_greeting' ? `${uid}_` : ''}${Date.now()}_${randomUUID().slice(0, 8)}`;
        const storagePath = `voiceAudio/${churchId}/${scope}/${audioId}.mp3`;
        const bucket = getStorage().bucket();
        const file = bucket.file(storagePath);
        await file.save(mp3Buffer, {
            contentType: 'audio/mpeg',
            metadata: {
                cacheControl: 'public, max-age=31536000',
            },
        });

        const [signedUrl] = await file.getSignedUrl({
            action: 'read',
            expires: Date.now() + 1000 * 60 * 60 * 24 * 365 * 10,
        });

        return res.json({
            success: true,
            url: signedUrl,
            storagePath,
            durationSec,
        });
    } catch (e: any) {
        console.error('[handleUploadVoiceAudio] Error:', e);
        return res.status(500).json({ error: e.message || 'Failed to process audio upload' });
    }
};
