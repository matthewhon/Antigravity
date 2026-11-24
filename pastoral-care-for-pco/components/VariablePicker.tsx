import React, { useEffect, useMemo, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { Braces, Search, Settings2 } from 'lucide-react';
import { db } from '../services/firebase';
import { GLOBAL_VARIABLES, GlobalVariableCategory } from '../constants/globalVariables';
import { Church, TenantVariable } from '../types';
import { TenantVariablesModal } from './TenantVariablesManager';

interface VariablePickerProps {
    churchId?: string;
    church?: Partial<Church> | null;
    customVariables?: TenantVariable[];
    includeStaffTags?: boolean;
    onInsert: (tag: string) => void;
    onUpdateChurch?: (updates: Partial<Church>) => void;
    buttonLabel?: string;
}

export const VariablePicker: React.FC<VariablePickerProps> = ({
    churchId,
    church,
    customVariables,
    includeStaffTags = false,
    onInsert,
    onUpdateChurch,
    buttonLabel = 'Variables',
}) => {
    const [open, setOpen] = useState(false);
    const [search, setSearch] = useState('');
    const [showManager, setShowManager] = useState(false);
    const [liveChurch, setLiveChurch] = useState<Partial<Church> | null>(church ?? null);

    useEffect(() => {
        if (church) {
            setLiveChurch(church);
            return;
        }
        if (!churchId) return;
        const unsub = onSnapshot(doc(db, 'churches', churchId), snap => {
            if (snap.exists()) setLiveChurch({ id: snap.id, ...(snap.data() as Partial<Church>) });
        });
        return unsub;
    }, [church, churchId]);

    const tenantVars = customVariables ?? liveChurch?.customVariables ?? [];

    const filteredGlobal = useMemo(() => {
        const q = search.trim().toLowerCase();
        return GLOBAL_VARIABLES.filter(v => {
            if (!includeStaffTags && v.category === 'Staff Alert') return false;
            if (!q) return true;
            return (
                v.tag.toLowerCase().includes(q) ||
                v.label.toLowerCase().includes(q) ||
                v.category.toLowerCase().includes(q)
            );
        });
    }, [search, includeStaffTags]);

    const filteredTenant = useMemo(() => {
        const q = search.trim().toLowerCase();
        return tenantVars.filter(v => {
            if (!q) return true;
            return (
                v.key.toLowerCase().includes(q) ||
                v.label.toLowerCase().includes(q) ||
                v.value.toLowerCase().includes(q)
            );
        });
    }, [tenantVars, search]);

    const categories: GlobalVariableCategory[] = includeStaffTags
        ? ['Contact', 'Church', 'Date & Event', 'Staff Alert']
        : ['Contact', 'Church', 'Date & Event'];

    return (
        <div className="relative inline-block">
            <button
                type="button"
                onClick={() => setOpen(v => !v)}
                className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-bold rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-700 hover:bg-indigo-100 dark:hover:bg-indigo-900/40 transition"
                title="Insert global or custom variable"
            >
                <Braces size={12} /> {buttonLabel}
            </button>

            {open && (
                <div className="absolute left-0 top-full mt-1.5 z-50 w-80 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl overflow-hidden">
                    <div className="p-2.5 border-b border-slate-100 dark:border-slate-800">
                        <div className="relative">
                            <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search variables..."
                                autoFocus
                                className="w-full pl-7 pr-2.5 py-1.5 text-xs rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    <div className="max-h-72 overflow-y-auto p-2 space-y-3">
                        {filteredTenant.length > 0 && (
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-wider text-teal-600 dark:text-teal-400 px-1.5 mb-1">
                                    Custom Variables
                                </p>
                                <div className="space-y-0.5">
                                    {filteredTenant.map(cv => {
                                        const tag = `{custom.${cv.key}}`;
                                        return (
                                            <button
                                                key={cv.id}
                                                type="button"
                                                onClick={() => {
                                                    onInsert(tag);
                                                    setOpen(false);
                                                }}
                                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-teal-50 dark:hover:bg-teal-900/20 flex items-center justify-between gap-2 transition"
                                            >
                                                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{cv.label}</span>
                                                <span className="text-[10px] font-mono text-teal-700 dark:text-teal-300 shrink-0">{tag}</span>
                                            </button>
                                        );
                                    })}
                                </div>
                            </div>
                        )}

                        {categories.map(cat => {
                            const items = filteredGlobal.filter(g => g.category === cat);
                            if (items.length === 0) return null;
                            return (
                                <div key={cat}>
                                    <p className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-1.5 mb-1">
                                        {cat}
                                    </p>
                                    <div className="space-y-0.5">
                                        {items.map(g => (
                                            <button
                                                key={g.tag}
                                                type="button"
                                                onClick={() => {
                                                    onInsert(g.tag);
                                                    setOpen(false);
                                                }}
                                                className="w-full text-left px-2 py-1.5 rounded-lg hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex items-center justify-between gap-2 transition"
                                            >
                                                <span className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate">{g.label}</span>
                                                <span className="text-[10px] font-mono text-indigo-600 dark:text-indigo-400 shrink-0">{g.tag}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>

                    {churchId && (
                        <div className="p-2 border-t border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                            <button
                                type="button"
                                onClick={() => {
                                    setOpen(false);
                                    setShowManager(true);
                                }}
                                className="w-full py-1.5 px-2.5 rounded-lg text-xs font-bold text-indigo-600 dark:text-indigo-400 hover:bg-indigo-50 dark:hover:bg-indigo-900/20 flex items-center justify-center gap-1.5 transition"
                            >
                                <Settings2 size={12} /> Manage Custom Variables
                            </button>
                        </div>
                    )}
                </div>
            )}

            {showManager && churchId && (
                <TenantVariablesModal
                    churchId={churchId}
                    church={liveChurch}
                    onUpdateChurch={updates => {
                        setLiveChurch(prev => ({ ...(prev || {}), ...updates }));
                        onUpdateChurch?.(updates);
                    }}
                    onClose={() => setShowManager(false)}
                />
            )}
        </div>
    );
};
