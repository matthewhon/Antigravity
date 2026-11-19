import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import ffmpeg from 'fluent-ffmpeg';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import { GoogleGenAI, Modality, Type } from '@google/genai';
import { getAuth } from 'firebase-admin/auth';
import { getDb, getStorage } from './firebase';

ffmpeg.setFfmpegPath(ffmpegInstaller.path);

const ALLOWED_TTS_VOICES = new Set([
    'Kore',
    'Puck',
    'Charon',
    'Fenrir',
    'Aoede',
    'Zephyr',
    'Leda',
    'Orus',
]);

async function getGeminiApiKey(): Promise<string | null> {
    let apiKey = process.env.GEMINI_API_KEY || process.env.API_KEY || '';
    try {
        const snap = await getDb().doc('system/settings').get();
        const data = snap.data() || {};
        if (data.geminiApiKey) apiKey = String(data.geminiApiKey).trim();
    } catch {
        // fallback to env
    }
    return apiKey ? apiKey.trim() : null;
}

/** Wraps raw 16-bit signed little-endian mono PCM bytes in a standard 44-byte WAV header. */
function pcmToWavBuffer(pcmBuffer: Buffer, sampleRate = 24000, channels = 1): Buffer {
    const bitsPerSample = 16;
    const byteRate = sampleRate * channels * (bitsPerSample / 8);
    const blockAlign = channels * (bitsPerSample / 8);
    const header = Buffer.alloc(44);
    header.write('RIFF', 0);
    header.writeUInt32LE(36 + pcmBuffer.length, 4);
    header.write('WAVE', 8);
    header.write('fmt ', 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(channels, 22);
    header.writeUInt32LE(sampleRate, 24);
    header.writeUInt32LE(byteRate, 28);
    header.writeUInt16LE(blockAlign, 32);
    header.writeUInt16LE(bitsPerSample, 34);
    header.write('data', 36);
    header.writeUInt32LE(pcmBuffer.length, 40);
    return Buffer.concat([header, pcmBuffer]);
}

async function verifyChurchAudioAuth(
    req: any,
    res: any
): Promise<{ uid: string; churchId: string; scope: 'user_greeting' | 'flow_prompt' } | null> {
    res.set('Access-Control-Allow-Origin', '*');
    const authHeader = String(req.headers.authorization || '');
    if (!authHeader.startsWith('Bearer ')) {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }
    let uid = '';
    try {
        const decoded = await getAuth().verifyIdToken(authHeader.slice(7).trim());
        uid = decoded.uid;
    } catch {
        res.status(401).json({ error: 'Unauthorized' });
        return null;
    }

    const { churchId, scope = 'flow_prompt' } = req.body || {};
    if (!churchId) {
        res.status(400).json({ error: 'Missing churchId' });
        return null;
    }
    if (scope !== 'user_greeting' && scope !== 'flow_prompt') {
        res.status(400).json({ error: 'Invalid scope' });
        return null;
    }

    const db = getDb();
    const userSnap = await db.collection('users').doc(uid).get();
    const userData = userSnap.data() || {};
    if (userData.churchId && userData.churchId !== churchId && !userData.roles?.includes('System Administration')) {
        res.status(403).json({ error: 'Forbidden' });
        return null;
    }

    return { uid, churchId: String(churchId), scope };
}

async function saveMp3ToVoiceStorage(
    churchId: string,
    scope: 'user_greeting' | 'flow_prompt',
    uid: string,
    mp3Buffer: Buffer,
    durationSec: number
) {
    const audioId = `${scope === 'user_greeting' ? `${uid}_` : ''}${Date.now()}_${randomUUID().slice(0, 8)}`;
    const storagePath = `voiceAudio/${churchId}/${scope}/${audioId}.mp3`;
    const bucket = getStorage().bucket();
    const file = bucket.file(storagePath);
    const downloadToken = randomUUID();
    await file.save(mp3Buffer, {
        contentType: 'audio/mpeg',
        metadata: {
            cacheControl: 'public, max-age=31536000',
            metadata: {
                firebaseStorageDownloadTokens: downloadToken,
            },
        },
    });

    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(storagePath)}?alt=media&token=${downloadToken}`;

    return {
        success: true,
        url,
        storagePath,
        durationSec,
    };
}

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
    const apiKey = await getGeminiApiKey();
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
    const authCtx = await verifyChurchAudioAuth(req, res);
    if (!authCtx) return;

    const { fileName, mimeType = 'audio/webm', dataBase64 } = req.body || {};
    if (!dataBase64) {
        return res.status(400).json({ error: 'Missing dataBase64' });
    }

    try {
        const cleanBase64 = String(dataBase64).replace(/^data:[^;]+;base64,/, '');
        const rawBuffer = Buffer.from(cleanBase64, 'base64');
        if (rawBuffer.length === 0 || rawBuffer.length > 15 * 1024 * 1024) {
            return res.status(400).json({ error: 'Audio file must be between 1 byte and 15 MB.' });
        }

        const { mp3Buffer, durationSec } = await transcodeToMp3(rawBuffer, mimeType, fileName);
        const result = await saveMp3ToVoiceStorage(
            authCtx.churchId,
            authCtx.scope,
            authCtx.uid,
            mp3Buffer,
            durationSec
        );
        return res.json(result);
    } catch (e: any) {
        console.error('[handleUploadVoiceAudio] Error:', e);
        return res.status(500).json({ error: e.message || 'Failed to process audio upload' });
    }
};

/**
 * Generates a spoken MP3 audio file from text using Gemini TTS (`gemini-2.5-flash-preview-tts`),
 * stores it in Firebase Storage, and returns a signed URL for SignalWire `<Play>`.
 */
export const handleGenerateVoiceAudio = async (req: any, res: any) => {
    const authCtx = await verifyChurchAudioAuth(req, res);
    if (!authCtx) return;

    const cleanText = String(req.body?.text || '').trim();
    if (!cleanText) {
        return res.status(400).json({ error: 'Please enter the text message to convert to voice.' });
    }
    if (cleanText.length > 2000) {
        return res.status(400).json({ error: 'Message text must be 2,000 characters or fewer.' });
    }

    const requestedVoice = String(req.body?.voiceName || 'Kore').trim();
    const voiceName = ALLOWED_TTS_VOICES.has(requestedVoice) ? requestedVoice : 'Kore';

    const apiKey = await getGeminiApiKey();
    if (!apiKey) {
        return res.status(500).json({ error: 'Gemini API key is not configured.' });
    }

    try {
        const ai = new GoogleGenAI({ apiKey });
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ parts: [{ text: cleanText }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName },
                    },
                },
            },
        });

        const parts = response.candidates?.[0]?.content?.parts || [];
        const audioPart = parts.find((p: any) => p?.inlineData?.data);
        const inlineData = audioPart?.inlineData;
        if (!inlineData?.data) {
            return res.status(502).json({ error: 'Gemini did not return audio data.' });
        }

        const rawAudioBuffer = Buffer.from(inlineData.data, 'base64');
        const rawMime = String(inlineData.mimeType || 'audio/L16;rate=24000').toLowerCase();

        let transcodeInput = rawAudioBuffer;
        let transcodeMime = rawMime;
        if (rawMime.includes('l16') || rawMime.includes('pcm')) {
            const rateMatch = /rate=(\d+)/i.exec(rawMime);
            const sampleRate = rateMatch ? Number(rateMatch[1]) : 24000;
            transcodeInput = pcmToWavBuffer(rawAudioBuffer, sampleRate, 1);
            transcodeMime = 'audio/wav';
        }

        const { mp3Buffer, durationSec } = await transcodeToMp3(transcodeInput, transcodeMime, 'gemini_tts.wav');
        const result = await saveMp3ToVoiceStorage(
            authCtx.churchId,
            authCtx.scope,
            authCtx.uid,
            mp3Buffer,
            durationSec
        );
        return res.json(result);
    } catch (e: any) {
        console.error('[handleGenerateVoiceAudio] Error:', e);
        return res.status(500).json({ error: e.message || 'Failed to generate voice audio' });
    }
};
