import React, { useState, useRef } from 'react';
import { Mic, Square, Upload, Loader2, Trash2, Volume2, Sparkles } from 'lucide-react';
import { auth } from '../services/firebase';

const GEMINI_VOICES = [
    { id: 'Kore', label: 'Kore (Warm Female)' },
    { id: 'Aoede', label: 'Aoede (Clear Female)' },
    { id: 'Leda', label: 'Leda (Gentle Female)' },
    { id: 'Zephyr', label: 'Zephyr (Bright Female)' },
    { id: 'Puck', label: 'Puck (Friendly Male)' },
    { id: 'Charon', label: 'Charon (Calm Male)' },
    { id: 'Fenrir', label: 'Fenrir (Deep Male)' },
    { id: 'Orus', label: 'Orus (Steady Male)' },
];

interface AudioGreetingUploaderProps {
    churchId: string;
    scope: 'user_greeting' | 'flow_prompt';
    currentUrl?: string;
    onUploaded: (url: string, durationSec?: number) => void;
    onClear?: () => void;
    apiBaseUrl?: string;
    label?: string;
    defaultText?: string;
}

export const AudioGreetingUploader: React.FC<AudioGreetingUploaderProps> = ({
    churchId,
    scope,
    currentUrl,
    onUploaded,
    onClear,
    apiBaseUrl = '',
    label = 'Audio Recording',
    defaultText = '',
}) => {
    const [uploading, setUploading] = useState(false);
    const [generating, setGenerating] = useState(false);
    const [showTtsPanel, setShowTtsPanel] = useState(false);
    const [ttsText, setTtsText] = useState(defaultText);
    const [voiceName, setVoiceName] = useState('Kore');
    const [recording, setRecording] = useState(false);
    const [recordSec, setRecordSec] = useState(0);
    const [error, setError] = useState<string | null>(null);

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const chunksRef = useRef<Blob[]>([]);
    const timerRef = useRef<number | null>(null);
    const fileInputRef = useRef<HTMLInputElement | null>(null);

    const uploadBlob = async (blob: Blob, fileName: string) => {
        setUploading(true);
        setError(null);
        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('You must be signed in to upload audio.');

            const dataBase64: string = await new Promise((resolve, reject) => {
                const reader = new FileReader();
                reader.onloadend = () => resolve(String(reader.result || ''));
                reader.onerror = () => reject(new Error('Failed to read audio file.'));
                reader.readAsDataURL(blob);
            });

            const res = await fetch(`${apiBaseUrl}/api/voice/upload-audio`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    churchId,
                    scope,
                    fileName,
                    mimeType: blob.type || 'audio/webm',
                    dataBase64,
                }),
            });

            const json = await res.json();
            if (!res.ok || !json.url) {
                throw new Error(json.error || 'Upload failed');
            }
            onUploaded(json.url, json.durationSec);
        } catch (err: any) {
            setError(err?.message || 'Unable to upload audio.');
        } finally {
            setUploading(false);
        }
    };

    const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;
        e.target.value = '';
        await uploadBlob(file, file.name);
    };

    const startRecording = async () => {
        setError(null);
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            const recorder = new MediaRecorder(stream);
            chunksRef.current = [];
            recorder.ondataavailable = (ev) => {
                if (ev.data.size > 0) chunksRef.current.push(ev.data);
            };
            recorder.onstop = async () => {
                stream.getTracks().forEach((t) => t.stop());
                if (timerRef.current) window.clearInterval(timerRef.current);
                setRecording(false);
                const blob = new Blob(chunksRef.current, { type: recorder.mimeType || 'audio/webm' });
                if (blob.size > 0) {
                    await uploadBlob(blob, `recording_${Date.now()}.webm`);
                }
            };
            mediaRecorderRef.current = recorder;
            recorder.start();
            setRecordSec(0);
            setRecording(true);
            timerRef.current = window.setInterval(() => {
                setRecordSec((s) => s + 1);
            }, 1000);
        } catch (err: any) {
            setError(err?.message || 'Microphone access denied.');
        }
    };

    const stopRecording = () => {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
            mediaRecorderRef.current.stop();
        }
    };

    const generateFromText = async () => {
        const clean = ttsText.trim();
        if (!clean) {
            setError('Please enter a message to convert to voice.');
            return;
        }
        setGenerating(true);
        setError(null);
        try {
            const token = await auth.currentUser?.getIdToken();
            if (!token) throw new Error('You must be signed in to generate audio.');

            const res = await fetch(`${apiBaseUrl}/api/voice/generate-audio`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    Authorization: `Bearer ${token}`,
                },
                body: JSON.stringify({
                    churchId,
                    scope,
                    text: clean,
                    voiceName,
                }),
            });

            const json = await res.json();
            if (!res.ok || !json.url) {
                throw new Error(json.error || 'Voice generation failed');
            }
            onUploaded(json.url, json.durationSec);
            setShowTtsPanel(false);
        } catch (err: any) {
            setError(err?.message || 'Unable to generate voice audio.');
        } finally {
            setGenerating(false);
        }
    };

    const busy = uploading || generating;

    return (
        <div className="space-y-2.5">
            <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{label}</span>
                {currentUrl && onClear && (
                    <button
                        type="button"
                        onClick={onClear}
                        className="text-[11px] font-semibold text-rose-600 hover:text-rose-700 flex items-center gap-1"
                    >
                        <Trash2 className="w-3 h-3" />
                        Remove
                    </button>
                )}
            </div>

            <div className="flex flex-wrap items-center gap-2">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="audio/*,.mp3,.wav,.m4a,.ogg,.webm"
                    onChange={handleFileChange}
                    className="hidden"
                />

                <button
                    type="button"
                    disabled={busy || recording}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 disabled:opacity-50"
                >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Audio
                </button>

                {!recording ? (
                    <button
                        type="button"
                        disabled={busy}
                        onClick={startRecording}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-indigo-50 dark:bg-indigo-900/30 border border-indigo-200 dark:border-indigo-800 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-100 disabled:opacity-50"
                    >
                        <Mic className="w-3.5 h-3.5" />
                        Record Mic
                    </button>
                ) : (
                    <button
                        type="button"
                        onClick={stopRecording}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-rose-600 text-white hover:bg-rose-700 animate-pulse"
                    >
                        <Square className="w-3 h-3 fill-current" />
                        Stop ({Math.floor(recordSec / 60)}:{String(recordSec % 60).padStart(2, '0')})
                    </button>
                )}

                <button
                    type="button"
                    disabled={busy || recording}
                    onClick={() => setShowTtsPanel((v) => !v)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold border disabled:opacity-50 ${
                        showTtsPanel
                            ? 'bg-emerald-600 text-white border-emerald-600'
                            : 'bg-emerald-50 dark:bg-emerald-900/30 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100'
                    }`}
                >
                    <Sparkles className="w-3.5 h-3.5" />
                    Text to Voice (AI)
                </button>

                {busy && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        {generating ? 'Generating voice...' : 'Converting to MP3...'}
                    </span>
                )}
            </div>

            {showTtsPanel && (
                <div className="space-y-2 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                    <div className="flex items-center justify-between gap-2">
                        <label className="text-[11px] font-bold text-slate-600 dark:text-slate-300">
                            Gemini Voice
                        </label>
                        <select
                            value={voiceName}
                            onChange={(e) => setVoiceName(e.target.value)}
                            disabled={generating}
                            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2 py-1 text-xs text-slate-800 dark:text-slate-100"
                        >
                            {GEMINI_VOICES.map((v) => (
                                <option key={v.id} value={v.id}>
                                    {v.label}
                                </option>
                            ))}
                        </select>
                    </div>
                    <textarea
                        rows={3}
                        value={ttsText}
                        onChange={(e) => setTtsText(e.target.value)}
                        disabled={generating}
                        placeholder="Type the message you want converted into a voice recording..."
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white"
                    />
                    <div className="flex items-center justify-end gap-2">
                        <button
                            type="button"
                            disabled={generating}
                            onClick={() => setShowTtsPanel(false)}
                            className="px-2.5 py-1 rounded-lg text-xs font-semibold text-slate-600 dark:text-slate-300 hover:bg-slate-200/60 dark:hover:bg-slate-800"
                        >
                            Cancel
                        </button>
                        <button
                            type="button"
                            disabled={generating || !ttsText.trim()}
                            onClick={generateFromText}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
                        >
                            {generating ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                            Generate Audio
                        </button>
                    </div>
                </div>
            )}

            {currentUrl && (
                <div className="flex items-center gap-2 p-2 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700">
                    <Volume2 className="w-4 h-4 text-indigo-600 shrink-0" />
                    <audio controls src={currentUrl} className="w-full h-8" />
                </div>
            )}

            {error && (
                <p className="text-[11px] font-medium text-rose-600">{error}</p>
            )}
        </div>
    );
};
