import React, { useState } from 'react';
import { doc, updateDoc } from 'firebase/firestore';
import {
    AlertTriangle,
    Braces,
    Check,
    Copy,
    Globe2,
    Loader2,
    Pencil,
    Plus,
    Trash2,
    X,
} from 'lucide-react';
import { db } from '../services/firebase';
import {
    GLOBAL_VARIABLES,
    normalizeTenantVarKey,
    resolveVariablesPreview,
    validateTenantVarKey,
} from '../constants/globalVariables';
import { Church, TenantVariable } from '../types';

interface TenantVariablesPanelProps {
    churchId: string;
    church?: Partial<Church> | null;
    onUpdateChurch?: (updates: Partial<Church>) => void;
    currentUserId?: string;
}

export const TenantVariablesPanel: React.FC<TenantVariablesPanelProps> = ({
    churchId,
    church,
    onUpdateChurch,
    currentUserId,
}) => {
    const [tab, setTab] = useState<'custom' | 'global'>('custom');
    const [customVars, setCustomVars] = useState<TenantVariable[]>(church?.customVariables || []);

    // Add / Edit form
    const [editingId, setEditingId] = useState<string | null>(null);
    const [label, setLabel] = useState('');
    const [keyInput, setKeyInput] = useState('');
    const [keyTouched, setKeyTouched] = useState(false);
    const [value, setValue] = useState('');
    const [description, setDescription] = useState('');
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [copiedTag, setCopiedTag] = useState<string | null>(null);

    const resetForm = () => {
        setEditingId(null);
        setLabel('');
        setKeyInput('');
        setKeyTouched(false);
        setValue('');
        setDescription('');
        setError('');
    };

    const startEdit = (v: TenantVariable) => {
        setEditingId(v.id);
        setLabel(v.label);
        setKeyInput(v.key);
        setKeyTouched(true);
        setValue(v.value);
        setDescription(v.description || '');
        setError('');
    };

    const handleLabelChange = (nextLabel: string) => {
        setLabel(nextLabel);
        if (!keyTouched && !editingId) {
            setKeyInput(normalizeTenantVarKey(nextLabel));
        }
    };

    const persistVars = async (next: TenantVariable[]) => {
        setSaving(true);
        try {
            await updateDoc(doc(db, 'churches', churchId), { customVariables: next });
            setCustomVars(next);
            onUpdateChurch?.({ customVariables: next });
        } finally {
            setSaving(false);
        }
    };

    const handleSaveVar = async (e: React.FormEvent) => {
        e.preventDefault();
        const normalizedKey = normalizeTenantVarKey(keyInput);
        const validationErr = validateTenantVarKey(normalizedKey);
        if (validationErr) {
            setError(validationErr);
            return;
        }
        if (!label.trim()) {
            setError('Label is required.');
            return;
        }
        const duplicate = customVars.find(v => v.key === normalizedKey && v.id !== editingId);
        if (duplicate) {
            setError(`A custom variable with key "{custom.${normalizedKey}}" already exists.`);
            return;
        }
        setError('');

        const now = Date.now();
        let next: TenantVariable[];
        if (editingId) {
            next = customVars.map(v =>
                v.id === editingId
                    ? {
                          ...v,
                          key: normalizedKey,
                          label: label.trim(),
                          value: value.trim(),
                          description: description.trim() || undefined,
                          updatedAt: now,
                          updatedBy: currentUserId,
                      }
                    : v
            );
        } else {
            const newVar: TenantVariable = {
                id: `tv_${now}_${Math.random().toString(36).slice(2, 7)}`,
                key: normalizedKey,
                label: label.trim(),
                value: value.trim(),
                description: description.trim() || undefined,
                updatedAt: now,
                updatedBy: currentUserId,
            };
            next = [...customVars, newVar];
        }

        await persistVars(next);
        resetForm();
    };

    const handleDelete = async (id: string) => {
        if (!window.confirm('Delete this custom variable?')) return;
        const next = customVars.filter(v => v.id !== id);
        await persistVars(next);
        if (editingId === id) resetForm();
    };

    const handleCopy = (tag: string) => {
        navigator.clipboard?.writeText(tag);
        setCopiedTag(tag);
        setTimeout(() => setCopiedTag(null), 1500);
    };

    return (
        <div className="space-y-5">
            {/* Tabs */}
            <div className="flex items-center gap-1.5 bg-slate-100 dark:bg-slate-800 p-1 rounded-xl w-fit">
                <button
                    type="button"
                    onClick={() => setTab('custom')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                        tab === 'custom'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400'
                    }`}
                >
                    Tenant Custom Variables ({customVars.length})
                </button>
                <button
                    type="button"
                    onClick={() => setTab('global')}
                    className={`px-3.5 py-1.5 rounded-lg text-xs font-bold transition ${
                        tab === 'global'
                            ? 'bg-white dark:bg-slate-700 text-slate-900 dark:text-white shadow-sm'
                            : 'text-slate-500 dark:text-slate-400'
                    }`}
                >
                    Global Variables ({GLOBAL_VARIABLES.length})
                </button>
            </div>

            {tab === 'custom' ? (
                <div className="space-y-5">
                    <div className="text-xs text-slate-600 dark:text-slate-400 bg-indigo-50 dark:bg-indigo-900/20 border border-indigo-200 dark:border-indigo-800 rounded-2xl p-3.5 leading-relaxed">
                        Custom variables use the <code className="font-mono font-bold text-indigo-700 dark:text-indigo-300">{'{custom.<key>}'}</code> namespace so they can never conflict with global variables across SMS, Email, or Workflows.
                    </div>

                    {/* Add / Edit Form */}
                    <form onSubmit={handleSaveVar} className="bg-slate-50 dark:bg-slate-800/60 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3">
                        <p className="text-xs font-black text-slate-900 dark:text-white">
                            {editingId ? 'Edit Custom Variable' : 'Add Custom Variable'}
                        </p>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Label</label>
                                <input
                                    type="text"
                                    value={label}
                                    onChange={e => handleLabelChange(e.target.value)}
                                    placeholder="e.g. Guest WiFi Password"
                                    className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div>
                                <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Variable Tag</label>
                                <div className="flex items-center border border-slate-200 dark:border-slate-600 rounded-xl bg-white dark:bg-slate-900 overflow-hidden">
                                    <span className="px-2.5 py-2 text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-900/30 border-r border-slate-200 dark:border-slate-700 shrink-0">
                                        {'{custom.'}
                                    </span>
                                    <input
                                        type="text"
                                        value={keyInput}
                                        onChange={e => {
                                            setKeyTouched(true);
                                            setKeyInput(normalizeTenantVarKey(e.target.value));
                                        }}
                                        placeholder="guest_wifi"
                                        className="flex-1 min-w-0 text-xs font-mono px-2.5 py-2 bg-transparent text-slate-900 dark:text-white focus:outline-none"
                                    />
                                    <span className="pr-2.5 text-[11px] font-mono font-bold text-indigo-600 dark:text-indigo-400">{'}'}</span>
                                </div>
                            </div>
                        </div>

                        <div>
                            <label className="block text-[10px] font-bold uppercase tracking-wide text-slate-400 mb-1">Value</label>
                            <input
                                type="text"
                                value={value}
                                onChange={e => setValue(e.target.value)}
                                placeholder="e.g. GraceGuest2026"
                                className="w-full text-xs border border-slate-200 dark:border-slate-600 rounded-xl px-3 py-2 bg-white dark:bg-slate-900 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>

                        {error && (
                            <div className="flex items-center gap-1.5 text-xs text-red-600 dark:text-red-400">
                                <AlertTriangle size={12} /> {error}
                            </div>
                        )}

                        <div className="flex justify-end gap-2">
                            {editingId && (
                                <button type="button" onClick={resetForm} className="px-3 py-1.5 text-xs font-bold text-slate-500">
                                    Cancel
                                </button>
                            )}
                            <button
                                type="submit"
                                disabled={saving}
                                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white text-xs font-black transition"
                            >
                                {saving ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                                {editingId ? 'Save Changes' : 'Add Variable'}
                            </button>
                        </div>
                    </form>

                    {/* List */}
                    {customVars.length === 0 ? (
                        <div className="text-center py-8 text-xs text-slate-400 border border-dashed border-slate-200 dark:border-slate-700 rounded-2xl">
                            No custom variables yet. Create one above for reusable church info like service times, WiFi, or pastor signatures.
                        </div>
                    ) : (
                        <div className="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
                            {customVars.map(v => {
                                const fullTag = `{custom.${v.key}}`;
                                return (
                                    <div key={v.id} className="p-3.5 bg-white dark:bg-slate-900 flex items-center justify-between gap-3">
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-xs font-bold text-slate-900 dark:text-white">{v.label}</span>
                                                <button
                                                    type="button"
                                                    onClick={() => handleCopy(fullTag)}
                                                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 font-mono text-[10px] font-bold hover:bg-indigo-100 transition"
                                                    title="Copy tag"
                                                >
                                                    {fullTag}
                                                    {copiedTag === fullTag ? <Check size={10} /> : <Copy size={10} />}
                                                </button>
                                            </div>
                                            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">{v.value || '(empty)'}</p>
                                        </div>
                                        <div className="flex items-center gap-1 shrink-0">
                                            <button type="button" onClick={() => startEdit(v)} title="Edit" className="p-1.5 text-slate-400 hover:text-indigo-600 rounded-lg">
                                                <Pencil size={13} />
                                            </button>
                                            <button type="button" onClick={() => handleDelete(v.id)} title="Delete" className="p-1.5 text-slate-400 hover:text-red-500 rounded-lg">
                                                <Trash2 size={13} />
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            ) : (
                <div className="border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden max-h-[380px] overflow-y-auto">
                    <table className="w-full text-xs text-left border-collapse">
                        <thead className="bg-slate-50 dark:bg-slate-800 sticky top-0">
                            <tr>
                                <th className="px-3.5 py-2.5 font-black uppercase text-[10px] text-slate-400">Tag</th>
                                <th className="px-3.5 py-2.5 font-black uppercase text-[10px] text-slate-400">Category</th>
                                <th className="px-3.5 py-2.5 font-black uppercase text-[10px] text-slate-400">Preview</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {GLOBAL_VARIABLES.map(g => (
                                <tr key={g.tag} className="bg-white dark:bg-slate-900">
                                    <td className="px-3.5 py-2">
                                        <button
                                            type="button"
                                            onClick={() => handleCopy(g.tag)}
                                            className="inline-flex items-center gap-1 font-mono text-[11px] font-bold text-indigo-600 dark:text-indigo-400 hover:underline"
                                        >
                                            {g.tag}
                                            {copiedTag === g.tag && <Check size={10} className="text-emerald-500" />}
                                        </button>
                                        <p className="text-[10px] text-slate-400">{g.description}</p>
                                    </td>
                                    <td className="px-3.5 py-2 text-[10px] font-bold text-slate-500">{g.category}</td>
                                    <td className="px-3.5 py-2 text-slate-600 dark:text-slate-300">
                                        {resolveVariablesPreview(g.tag, church)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            )}
        </div>
    );
};

export const TenantVariablesModal: React.FC<TenantVariablesPanelProps & { onClose: () => void }> = ({
    onClose,
    ...props
}) => (
    <div className="fixed inset-0 z-[140] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4" onClick={onClose}>
        <div
            className="w-full max-w-2xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden flex flex-col max-h-[90vh]"
            onClick={e => e.stopPropagation()}
        >
            <div className="px-6 py-4 bg-gradient-to-r from-indigo-600 to-slate-800 text-white flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2.5">
                    <Braces size={18} />
                    <div>
                        <h3 className="text-sm font-black">Variables &amp; Merge Tags</h3>
                        <p className="text-[11px] text-indigo-100 flex items-center gap-1">
                            <Globe2 size={11} /> Global variables + collision-free {'{custom.*}'} church variables
                        </p>
                    </div>
                </div>
                <button type="button" onClick={onClose} title="Close" className="p-1.5 rounded-xl text-white/80 hover:text-white hover:bg-white/20 transition">
                    <X size={16} />
                </button>
            </div>
            <div className="p-6 overflow-y-auto flex-1">
                <TenantVariablesPanel {...props} />
            </div>
        </div>
    </div>
);
