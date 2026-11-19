import React, { useState, useEffect } from 'react';
import { Clock, BellOff, Phone, Voicemail, Plus, Trash2, Save, CheckCircle2, AlertCircle } from 'lucide-react';
import { doc, updateDoc, collection, query, where, getDocs } from 'firebase/firestore';
import { db as firebaseDb } from '../services/firebase';
import { AudioGreetingUploader } from './AudioGreetingUploader';
import type { DayOfWeek, TimeWindow, User, UserCallingPreferences } from '../types';

interface CallingPreferencesPanelProps {
    user: User;
    churchId: string;
    churchTimezone?: string;
    apiBaseUrl?: string;
    onSaved?: (prefs: UserCallingPreferences) => void;
}

const DAYS: { key: DayOfWeek; label: string }[] = [
    { key: 'sun', label: 'Sun' },
    { key: 'mon', label: 'Mon' },
    { key: 'tue', label: 'Tue' },
    { key: 'wed', label: 'Wed' },
    { key: 'thu', label: 'Thu' },
    { key: 'fri', label: 'Fri' },
    { key: 'sat', label: 'Sat' },
];

const TIMEZONES = [
    'America/New_York',
    'America/Chicago',
    'America/Denver',
    'America/Phoenix',
    'America/Los_Angeles',
    'America/Anchorage',
    'Pacific/Honolulu',
    'UTC',
];

function buildDefaultPrefs(tz: string): UserCallingPreferences {
    const weekday = { enabled: true, windows: [{ start: '09:00', end: '17:00' }] };
    const weekend = { enabled: false, windows: [{ start: '09:00', end: '17:00' }] };
    return {
        extension: '',
        timezone: tz || 'America/Chicago',
        callingHoursEnabled: false,
        schedule: {
            sun: { ...weekend, windows: [...weekend.windows] },
            mon: { ...weekday, windows: [...weekday.windows] },
            tue: { ...weekday, windows: [...weekday.windows] },
            wed: { ...weekday, windows: [...weekday.windows] },
            thu: { ...weekday, windows: [...weekday.windows] },
            fri: { ...weekday, windows: [...weekday.windows] },
            sat: { ...weekend, windows: [...weekend.windows] },
        },
        dateOverrides: [],
        dndOverride: { active: false, until: null, reason: '' },
        allowEmergencyBypass: false,
        voicemail: {
            enabled: true,
            greetingType: 'tts',
            greetingText: 'Sorry I missed your call. Please leave a message after the tone and I will return your call soon.',
            maxLengthSec: 120,
            transcribeEnabled: true,
            notifyChannels: { push: true, email: false, sms: false },
        },
    };
}

export const CallingPreferencesPanel: React.FC<CallingPreferencesPanelProps> = ({
    user,
    churchId,
    churchTimezone = 'America/Chicago',
    apiBaseUrl = '',
    onSaved,
}) => {
    const [prefs, setPrefs] = useState<UserCallingPreferences>(() => {
        const def = buildDefaultPrefs(churchTimezone);
        const existing = user.callingPreferences;
        if (!existing) return def;
        return {
            ...def,
            ...existing,
            schedule: { ...def.schedule, ...(existing.schedule || {}) },
            dndOverride: { ...def.dndOverride, ...(existing.dndOverride || {}) },
            voicemail: { ...def.voicemail!, ...(existing.voicemail || {}) },
        };
    });
    const [saving, setSaving] = useState(false);
    const [status, setStatus] = useState<{ type: 'ok' | 'err'; msg: string } | null>(null);
    const [newOverrideDate, setNewOverrideDate] = useState('');
    const [newOverrideLabel, setNewOverrideLabel] = useState('');

    useEffect(() => {
        const def = buildDefaultPrefs(churchTimezone);
        const existing = user.callingPreferences;
        if (existing) {
            setPrefs({
                ...def,
                ...existing,
                schedule: { ...def.schedule, ...(existing.schedule || {}) },
                dndOverride: { ...def.dndOverride, ...(existing.dndOverride || {}) },
                voicemail: { ...def.voicemail!, ...(existing.voicemail || {}) },
            });
        }
    }, [user.id, churchTimezone]);

    const updateDay = (day: DayOfWeek, patch: Partial<{ enabled: boolean; windows: TimeWindow[] }>) => {
        setPrefs((prev) => ({
            ...prev,
            schedule: {
                ...prev.schedule,
                [day]: { ...prev.schedule[day], ...patch },
            },
        }));
    };

    const handleSave = async () => {
        setSaving(true);
        setStatus(null);
        try {
            const cleanExt = (prefs.extension || '').trim();
            if (cleanExt) {
                if (!/^\d{2,5}$/.test(cleanExt)) {
                    throw new Error('Extension must be 2 to 5 digits (e.g. 101).');
                }
                const snap = await getDocs(
                    query(collection(firebaseDb, 'users'), where('churchId', '==', churchId))
                );
                const conflict = snap.docs.find((d) => {
                    if (d.id === user.id) return false;
                    return String(d.data()?.callingPreferences?.extension || '').trim() === cleanExt;
                });
                if (conflict) {
                    throw new Error(`Extension ${cleanExt} is already assigned to ${conflict.data()?.name || 'another user'}.`);
                }
            }

            const payload: UserCallingPreferences = {
                ...prefs,
                extension: cleanExt || undefined,
            };

            await updateDoc(doc(firebaseDb, 'users', user.id), {
                callingPreferences: payload,
            });
            setStatus({ type: 'ok', msg: 'Calling hours & voicemail saved.' });
            onSaved?.(payload);
        } catch (err: any) {
            setStatus({ type: 'err', msg: err?.message || 'Failed to save settings.' });
        } finally {
            setSaving(false);
        }
    };

    const vm = prefs.voicemail!;
    const dndActive = Boolean(prefs.dndOverride?.active && (!prefs.dndOverride.until || prefs.dndOverride.until > Date.now()));

    return (
        <div className="space-y-6">
            {/* Extension & Do Not Disturb */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-2">
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300">
                        <Phone className="w-3.5 h-3.5 text-indigo-600" />
                        Direct Extension
                    </div>
                    <input
                        type="text"
                        inputMode="numeric"
                        maxLength={5}
                        value={prefs.extension || ''}
                        onChange={(e) => setPrefs((p) => ({ ...p, extension: e.target.value.replace(/\D/g, '') }))}
                        placeholder="e.g. 101"
                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-sm font-bold text-slate-900 dark:text-white"
                    />
                    <p className="text-[11px] text-slate-500">
                        Callers can dial this extension from an IVR voice agent or directory.
                    </p>
                </div>

                <div className={`p-4 rounded-2xl border space-y-2.5 ${dndActive ? 'bg-rose-50 dark:bg-rose-950/30 border-rose-200 dark:border-rose-800' : 'bg-slate-50 dark:bg-slate-900/60 border-slate-200 dark:border-slate-700'}`}>
                    <div className="flex items-center justify-between">
                        <span className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-slate-700 dark:text-slate-200">
                            <BellOff className={`w-3.5 h-3.5 ${dndActive ? 'text-rose-600' : 'text-slate-400'}`} />
                            Do Not Disturb
                        </span>
                        <input
                            type="checkbox"
                            checked={dndActive}
                            onChange={(e) =>
                                setPrefs((p) => ({
                                    ...p,
                                    dndOverride: {
                                        ...p.dndOverride,
                                        active: e.target.checked,
                                        until: e.target.checked ? p.dndOverride?.until ?? null : null,
                                    },
                                }))
                            }
                            className="rounded text-rose-600"
                        />
                    </div>
                    {dndActive && (
                        <div className="space-y-2">
                            <select
                                value={prefs.dndOverride?.until ? 'timed' : 'indefinite'}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    setPrefs((p) => ({
                                        ...p,
                                        dndOverride: {
                                            ...p.dndOverride,
                                            active: true,
                                            until: val === 'indefinite' ? null : Date.now() + 60 * 60 * 1000,
                                        },
                                    }));
                                }}
                                className="w-full rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs font-semibold"
                            >
                                <option value="indefinite">Until I turn it off</option>
                                <option value="timed">For 1 hour</option>
                            </select>
                            <input
                                type="text"
                                value={prefs.dndOverride?.reason || ''}
                                onChange={(e) =>
                                    setPrefs((p) => ({
                                        ...p,
                                        dndOverride: { ...p.dndOverride, active: true, reason: e.target.value },
                                    }))
                                }
                                placeholder="Reason (optional, e.g. In a meeting)"
                                className="w-full rounded-xl border border-rose-200 dark:border-rose-800 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs"
                            />
                        </div>
                    )}
                    <p className="text-[11px] text-slate-500">
                        Immediately silences incoming calls and routes to your voicemail.
                    </p>
                </div>
            </div>

            {/* Calling Hours Schedule */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                        <h4 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                            <Clock className="w-4 h-4 text-indigo-600" />
                            Calling Hours
                        </h4>
                        <p className="text-xs text-slate-500">
                            Restrict when this user&apos;s devices ring for incoming voice calls.
                        </p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={prefs.callingHoursEnabled}
                            onChange={(e) => setPrefs((p) => ({ ...p, callingHoursEnabled: e.target.checked }))}
                            className="rounded text-indigo-600"
                        />
                        Enforce Calling Hours
                    </label>
                </div>

                {prefs.callingHoursEnabled && (
                    <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex flex-wrap items-center gap-3">
                            <label className="text-xs font-bold text-slate-600 dark:text-slate-300">Timezone:</label>
                            <select
                                value={prefs.timezone}
                                onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value }))}
                                className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-1.5 text-xs font-semibold"
                            >
                                {TIMEZONES.map((tz) => (
                                    <option key={tz} value={tz}>{tz}</option>
                                ))}
                            </select>

                            <label className="ml-auto inline-flex items-center gap-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={Boolean(prefs.allowEmergencyBypass)}
                                    onChange={(e) => setPrefs((p) => ({ ...p, allowEmergencyBypass: e.target.checked }))}
                                    className="rounded text-indigo-600"
                                />
                                Allow Urgent/Emergency IVR Bypass
                            </label>
                        </div>

                        <div className="space-y-2">
                            {DAYS.map(({ key, label }) => {
                                const dayCfg = prefs.schedule[key];
                                return (
                                    <div key={key} className="flex flex-wrap items-center gap-2 bg-white dark:bg-slate-800/70 p-2 rounded-xl border border-slate-200/70 dark:border-slate-700/70">
                                        <label className="w-16 flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                checked={dayCfg.enabled}
                                                onChange={(e) => updateDay(key, { enabled: e.target.checked })}
                                                className="rounded text-indigo-600"
                                            />
                                            {label}
                                        </label>

                                        {dayCfg.enabled ? (
                                            <div className="flex-1 flex flex-wrap items-center gap-2">
                                                {dayCfg.windows.map((win, idx) => (
                                                    <div key={idx} className="flex items-center gap-1.5">
                                                        <input
                                                            type="time"
                                                            value={win.start}
                                                            onChange={(e) => {
                                                                const next = [...dayCfg.windows];
                                                                next[idx] = { ...win, start: e.target.value };
                                                                updateDay(key, { windows: next });
                                                            }}
                                                            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1 text-xs"
                                                        />
                                                        <span className="text-xs text-slate-400">to</span>
                                                        <input
                                                            type="time"
                                                            value={win.end}
                                                            onChange={(e) => {
                                                                const next = [...dayCfg.windows];
                                                                next[idx] = { ...win, end: e.target.value };
                                                                updateDay(key, { windows: next });
                                                            }}
                                                            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 px-2 py-1 text-xs"
                                                        />
                                                        {dayCfg.windows.length > 1 && (
                                                            <button
                                                                type="button"
                                                                onClick={() => updateDay(key, { windows: dayCfg.windows.filter((_, i) => i !== idx) })}
                                                                className="text-slate-400 hover:text-rose-500 p-0.5"
                                                            >
                                                                <Trash2 className="w-3.5 h-3.5" />
                                                            </button>
                                                        )}
                                                    </div>
                                                ))}
                                                <button
                                                    type="button"
                                                    onClick={() => updateDay(key, { windows: [...dayCfg.windows, { start: '13:00', end: '17:00' }] })}
                                                    className="text-[11px] font-bold text-indigo-600 hover:text-indigo-700 flex items-center gap-0.5 px-1.5 py-0.5 rounded-lg hover:bg-indigo-50"
                                                >
                                                    <Plus className="w-3 h-3" /> Split
                                                </button>
                                            </div>
                                        ) : (
                                            <span className="text-xs text-slate-400 italic">Unavailable</span>
                                        )}
                                    </div>
                                );
                            })}
                        </div>

                        {/* Date Overrides (Holidays / Vacation) */}
                        <div className="pt-2 border-t border-slate-200 dark:border-slate-700 space-y-2">
                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200">Date Overrides (Days Off / Holidays)</p>
                            <div className="flex flex-wrap gap-2">
                                <input
                                    type="date"
                                    value={newOverrideDate}
                                    onChange={(e) => setNewOverrideDate(e.target.value)}
                                    className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs"
                                />
                                <input
                                    type="text"
                                    value={newOverrideLabel}
                                    onChange={(e) => setNewOverrideLabel(e.target.value)}
                                    placeholder="Label (e.g. Vacation)"
                                    className="flex-1 min-w-[140px] rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 text-xs"
                                />
                                <button
                                    type="button"
                                    onClick={() => {
                                        if (!newOverrideDate) return;
                                        setPrefs((p) => ({
                                            ...p,
                                            dateOverrides: [
                                                ...(p.dateOverrides || []).filter((o) => o.date !== newOverrideDate),
                                                { date: newOverrideDate, label: newOverrideLabel || 'Day Off', available: false },
                                            ],
                                        }));
                                        setNewOverrideDate('');
                                        setNewOverrideLabel('');
                                    }}
                                    className="px-3 py-1.5 rounded-xl bg-slate-800 dark:bg-slate-700 text-white text-xs font-bold hover:bg-slate-900"
                                >
                                    Add Day Off
                                </button>
                            </div>
                            {(prefs.dateOverrides || []).length > 0 && (
                                <div className="flex flex-wrap gap-1.5">
                                    {(prefs.dateOverrides || []).map((o) => (
                                        <span key={o.date} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/30 border border-amber-200 dark:border-amber-800 text-[11px] font-bold text-amber-800 dark:text-amber-200">
                                            {o.date} {o.label ? `· ${o.label}` : ''}
                                            <button
                                                type="button"
                                                onClick={() =>
                                                    setPrefs((p) => ({
                                                        ...p,
                                                        dateOverrides: (p.dateOverrides || []).filter((x) => x.date !== o.date),
                                                    }))
                                                }
                                                className="hover:text-rose-600"
                                            >
                                                ×
                                            </button>
                                        </span>
                                    ))}
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Personal Voicemail */}
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-700 space-y-3">
                <div className="flex items-center justify-between">
                    <div>
                        <h4 className="flex items-center gap-2 text-sm font-black text-slate-900 dark:text-white">
                            <Voicemail className="w-4 h-4 text-indigo-600" />
                            Personal Voicemail
                        </h4>
                        <p className="text-xs text-slate-500">
                            Private voicemail inbox &amp; custom greeting for {user.name}.
                        </p>
                    </div>
                    <label className="inline-flex items-center gap-2 text-xs font-bold text-slate-700 dark:text-slate-200 cursor-pointer">
                        <input
                            type="checkbox"
                            checked={vm.enabled}
                            onChange={(e) =>
                                setPrefs((p) => ({ ...p, voicemail: { ...p.voicemail!, enabled: e.target.checked } }))
                            }
                            className="rounded text-indigo-600"
                        />
                        Enabled
                    </label>
                </div>

                {vm.enabled && (
                    <div className="space-y-3 pt-2 border-t border-slate-200 dark:border-slate-700">
                        <div className="flex gap-2">
                            <button
                                type="button"
                                onClick={() => setPrefs((p) => ({ ...p, voicemail: { ...p.voicemail!, greetingType: 'tts' } }))}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${vm.greetingType === 'tts' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-700'}`}
                            >
                                Text-to-Speech
                            </button>
                            <button
                                type="button"
                                onClick={() => setPrefs((p) => ({ ...p, voicemail: { ...p.voicemail!, greetingType: 'audio' } }))}
                                className={`px-3 py-1.5 rounded-xl text-xs font-bold border ${vm.greetingType === 'audio' ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-slate-600 border-slate-200 dark:border-slate-700'}`}
                            >
                                Recorded / Uploaded Audio
                            </button>
                        </div>

                        {vm.greetingType === 'tts' ? (
                            <textarea
                                rows={2}
                                value={vm.greetingText || ''}
                                onChange={(e) =>
                                    setPrefs((p) => ({ ...p, voicemail: { ...p.voicemail!, greetingText: e.target.value } }))
                                }
                                placeholder="Enter your voicemail greeting..."
                                className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-3 py-2 text-xs text-slate-900 dark:text-white"
                            />
                        ) : (
                            <AudioGreetingUploader
                                churchId={churchId}
                                scope="user_greeting"
                                currentUrl={vm.greetingAudioUrl}
                                apiBaseUrl={apiBaseUrl}
                                label="Personal Voicemail Greeting"
                                onUploaded={(url, durationSec) =>
                                    setPrefs((p) => ({
                                        ...p,
                                        voicemail: {
                                            ...p.voicemail!,
                                            greetingType: 'audio',
                                            greetingAudioUrl: url,
                                            greetingAudioDurationSec: durationSec,
                                        },
                                    }))
                                }
                                onClear={() =>
                                    setPrefs((p) => ({
                                        ...p,
                                        voicemail: { ...p.voicemail!, greetingAudioUrl: undefined },
                                    }))
                                }
                            />
                        )}
                    </div>
                )}
            </div>

            {status && (
                <div className={`flex items-center gap-2 p-3 rounded-xl text-xs font-bold ${status.type === 'ok' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-rose-50 text-rose-700 border border-rose-200'}`}>
                    {status.type === 'ok' ? <CheckCircle2 className="w-4 h-4 shrink-0" /> : <AlertCircle className="w-4 h-4 shrink-0" />}
                    {status.msg}
                </div>
            )}

            <div className="flex justify-end">
                <button
                    type="button"
                    disabled={saving}
                    onClick={handleSave}
                    className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black shadow-sm disabled:opacity-50"
                >
                    <Save className="w-4 h-4" />
                    {saving ? 'Saving...' : 'Save Calling Settings'}
                </button>
            </div>
        </div>
    );
};
