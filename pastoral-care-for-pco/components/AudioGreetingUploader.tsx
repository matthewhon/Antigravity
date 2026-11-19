import React, { useState, useRef } from 'react';
import { Mic, Square, Upload, Loader2, Trash2, Volume2 } from 'lucide-react';
import { auth } from '../services/firebase';

interface AudioGreetingUploaderProps {
    churchId: string;
    scope: 'user_greeting' | 'flow_prompt';
    currentUrl?: string;
    onUploaded: (url: string, durationSec?: number) => void;
    onClear?: () => void;
    apiBaseUrl?: string;
    label?: string;
}

export const AudioGreetingUploader: React.FC<AudioGreetingUploaderProps> = ({
    churchId,
    scope,
    currentUrl,
    onUploaded,
    onClear,
    apiBaseUrl = '',
    label = 'Audio Recording',
}) => {
    const [uploading, setUploading] = useState(false);
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
                    disabled={uploading || recording}
                    onClick={() => fileInputRef.current?.click()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-bold bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-200 hover:bg-slate-50 disabled:opacity-50"
                >
                    <Upload className="w-3.5 h-3.5" />
                    Upload Audio
                </button>

                {!recording ? (
                    <button
                        type="button"
                        disabled={uploading}
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

                {uploading && (
                    <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        Converting to MP3...
                    </span>
                )}
            </div>

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
