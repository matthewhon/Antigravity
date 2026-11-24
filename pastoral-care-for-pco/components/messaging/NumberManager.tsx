import React, { useState, useEffect } from 'react';
import { db as firebaseDb } from '../../services/firebase';
import { collection, query, where, orderBy, onSnapshot } from 'firebase/firestore';
import { Church, TwilioPhoneNumber, User } from '../../types';
import { Phone, PlusCircle, X, Edit3, Trash2, Unlock, Lock, CheckCircle } from 'lucide-react';

const API_BASE = '';

export function useTwilioNumbers(churchId: string) {
    const [numbers, setNumbers] = useState<TwilioPhoneNumber[]>([]);
    const [loading, setLoading] = useState(true);
    useEffect(() => {
        const q = query(
            collection(firebaseDb, 'smsNumbers'),
            where('churchId', '==', churchId),
            orderBy('createdAt', 'asc')
        );
        const unsub = onSnapshot(q, snap => {
            const list = snap.docs.map(d => ({ id: d.id, ...d.data() } as TwilioPhoneNumber));
            list.sort((a, b) => {
                if (a.isDefault && !b.isDefault) return -1;
                if (!a.isDefault && b.isDefault) return 1;
                return 0;
            });
            setNumbers(list);
            setLoading(false);
        });
        return unsub;
    }, [churchId]);
    return { numbers, loading };
}

export function canUserSeeNumber(num: TwilioPhoneNumber, user: User): boolean {
    return !num.allowedUserIds || num.allowedUserIds.length === 0 || num.allowedUserIds.includes(user.id);
}

export function canUserUseFeature(
    num: TwilioPhoneNumber | null | undefined,
    user: User,
    featureKey: keyof NonNullable<TwilioPhoneNumber['permissions']>
): boolean {
    if (!num) return false;
    if (num.allowedUserIds && num.allowedUserIds.length > 0 && !num.allowedUserIds.includes(user.id)) return false;
    const featureIds = num.permissions?.[featureKey] || [];
    return featureIds.length === 0 || featureIds.includes(user.id);
}

export const NumberManager: React.FC<{
    churchId: string;
    church: Church;
    currentUser: User;
    numbers: TwilioPhoneNumber[];
    onClose: () => void;
    onAddNumber: () => void;
    allUsers: User[];
}> = ({ churchId, numbers, currentUser, onClose, onAddNumber, allUsers }) => {
    const [editingId, setEditingId] = useState<string | null>(null);
    const [labelDraft, setLabelDraft] = useState('');
    const [usersDraft, setUsersDraft] = useState<string[]>([]);
    const [senderDraft, setSenderDraft] = useState('');
    const [saving, setSaving] = useState(false);
    const [toast, setToast] = useState<{ msg: string; type: 'success' | 'error' } | null>(null);

    const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
        setToast({ msg, type });
        setTimeout(() => setToast(null), 3500);
    };

    const startEdit = (num: TwilioPhoneNumber) => {
        setEditingId(num.id);
        setLabelDraft(num.friendlyLabel);
        setUsersDraft(num.allowedUserIds);
        setSenderDraft(num.senderName || '');
    };

    const saveEdit = async (numId: string) => {
        setSaving(true);
        try {
            await fetch(`${API_BASE}/api/messaging/number-settings`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    churchId,
                    twilioNumberId: numId,
                    friendlyLabel: labelDraft,
                    allowedUserIds: usersDraft,
                    senderName: senderDraft,
                }),
            });
            setEditingId(null);
            showToast('Saved');
        } catch {
            showToast('Save failed', 'error');
        } finally {
            setSaving(false);
        }
    };

    const setDefault = async (numId: string) => {
        await fetch(`${API_BASE}/api/messaging/set-default-number`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ churchId, twilioNumberId: numId }),
        });
        showToast('Default number updated');
    };

    const releaseNumber = async (num: TwilioPhoneNumber) => {
        if (!window.confirm(`Release ${num.phoneNumber} (${num.friendlyLabel})? This cannot be undone.`)) return;
        await fetch(`${API_BASE}/api/messaging/release-number`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ churchId, twilioNumberId: num.id }),
        });
        showToast(`${num.phoneNumber} released`);
    };

    const isAdmin = currentUser.roles?.includes('Church Admin') || currentUser.roles?.includes('System Administration');

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh]">
                <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-slate-700">
                    <div className="flex items-center gap-2">
                        <Phone size={18} className="text-indigo-500" />
                        <h2 className="text-lg font-black text-slate-900 dark:text-white">Phone Numbers</h2>
                        <span className="text-xs px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 font-semibold">{numbers.length}</span>
                    </div>
                    <div className="flex items-center gap-2">
                        {isAdmin && (
                            <button
                                onClick={onAddNumber}
                                className="flex items-center gap-2 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition"
                            >
                                <PlusCircle size={14} /> Add Number
                            </button>
                        )}
                        <button onClick={onClose} title="Close" className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 transition">
                            <X size={16} />
                        </button>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-3">
                    {toast && (
                        <div className={`text-sm font-semibold px-4 py-2 rounded-xl ${toast.type === 'error' ? 'bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400' : 'bg-emerald-50 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'}`}>
                            {toast.msg}
                        </div>
                    )}

                    {numbers.map(num => (
                        <div key={num.id} className={`border rounded-2xl overflow-hidden ${num.isDefault ? 'border-indigo-300 dark:border-indigo-700' : 'border-slate-200 dark:border-slate-700'}`}>
                            <div className="flex items-center gap-3 px-4 py-3 bg-slate-50 dark:bg-slate-800/60">
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-black text-sm text-slate-900 dark:text-white">{num.friendlyLabel}</span>
                                        {num.isDefault && (
                                            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300">Default</span>
                                        )}
                                        {!num.smsEnabled && (
                                            <span className="text-[11px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-red-100 dark:bg-red-900/40 text-red-700 dark:text-red-400">Disabled</span>
                                        )}
                                    </div>
                                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono mt-0.5">{num.phoneNumber}</p>
                                </div>
                                {isAdmin && (
                                    <div className="flex items-center gap-1 shrink-0">
                                        {!num.isDefault && (
                                            <button
                                                onClick={() => setDefault(num.id)}
                                                title="Set as default"
                                                className="text-[10px] font-bold px-2 py-1 rounded-lg bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600 text-slate-500 hover:text-indigo-600 hover:border-indigo-400 transition"
                                            >
                                                Set Default
                                            </button>
                                        )}
                                        <button
                                            onClick={() => editingId === num.id ? setEditingId(null) : startEdit(num)}
                                            className="p-1.5 rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-400 hover:text-indigo-500 transition"
                                            title="Edit"
                                        >
                                            <Edit3 size={13} />
                                        </button>
                                        <button
                                            onClick={() => releaseNumber(num)}
                                            className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition"
                                            title="Release number"
                                        >
                                            <Trash2 size={13} />
                                        </button>
                                    </div>
                                )}
                            </div>

                            <div className="px-4 py-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 border-t border-slate-100 dark:border-slate-700/50">
                                {(() => {
                                    const allowed = (num.allowedUserIds || []).filter((id: string) => id !== '_none_');
                                    const restricted = (num.allowedUserIds || []).length > 0;
                                    return !restricted ? (
                                        <><Unlock size={11} className="text-emerald-500" /> Visible to all users</>
                                    ) : (
                                        <><Lock size={11} className="text-amber-500" /> Restricted to {allowed.length} user{allowed.length !== 1 ? 's' : ''}</>
                                    );
                                })()}
                            </div>

                            {isAdmin && editingId === num.id && (
                                <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-700 space-y-3 bg-white dark:bg-slate-900">
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Label</label>
                                        <input
                                            type="text"
                                            value={labelDraft}
                                            onChange={e => setLabelDraft(e.target.value)}
                                            title="Number label"
                                            placeholder="e.g. Main Line, Youth Line"
                                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Sender Name</label>
                                        <input
                                            type="text"
                                            value={senderDraft}
                                            onChange={e => setSenderDraft(e.target.value)}
                                            placeholder="Grace Community Church"
                                            className="w-full text-sm border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-2">
                                            <Lock size={10} className="inline mr-1" />
                                            Restrict to users (leave empty for all)
                                        </label>
                                        <div className="flex flex-wrap gap-1.5 p-2 border border-slate-200 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-800 min-h-[36px]">
                                            {allUsers.map(u => {
                                                const selected = (usersDraft || []).filter((id: string) => id !== '_none_').includes(u.id);
                                                return (
                                                    <button
                                                        key={u.id}
                                                        type="button"
                                                        onClick={() => setUsersDraft(prev => {
                                                            const cleaned = (prev || []).filter((id: string) => id !== '_none_');
                                                            const next = cleaned.includes(u.id)
                                                                ? cleaned.filter((id: string) => id !== u.id)
                                                                : [...cleaned, u.id];
                                                            return next.length === 0 ? ['_none_'] : next;
                                                        })}
                                                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition ${selected ? 'bg-indigo-600 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:border-indigo-400'}`}
                                                    >
                                                        {selected && <CheckCircle size={10} />}
                                                        {u.name}
                                                    </button>
                                                );
                                            })}
                                            {allUsers.length === 0 && <span className="text-xs text-slate-400">No users found</span>}
                                        </div>
                                    </div>
                                    <div className="flex gap-2 pt-1">
                                        <button onClick={() => saveEdit(num.id)} disabled={saving} className="flex-1 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold transition disabled:opacity-50">
                                            {saving ? 'Saving...' : 'Save Changes'}
                                        </button>
                                        <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-sm font-semibold hover:bg-slate-200 dark:hover:bg-slate-700 transition">
                                            Cancel
                                        </button>
                                    </div>
                                </div>
                            )}
                        </div>
                    ))}

                    {numbers.length === 0 && (
                        <div className="text-center py-12 text-slate-400 text-sm">
                            No phone numbers provisioned yet.
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
