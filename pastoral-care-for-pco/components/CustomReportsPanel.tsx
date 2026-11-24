import React, { useEffect, useMemo, useState } from 'react';
import { collection, deleteDoc, doc, onSnapshot, query, setDoc, where } from 'firebase/firestore';
import {
    BarChart3,
    Download,
    Filter,
    Loader2,
    Plus,
    Sparkles,
    Trash2,
    Users,
} from 'lucide-react';
import { db } from '../services/firebase';
import { evaluateCustomReport } from '../services/recipeImportService';
import { CustomReportColumnKey, CustomReportDefinition, PcoPerson } from '../types';
import { RecipeLibraryModal } from './RecipeLibraryModal';

interface CustomReportsPanelProps {
    churchId?: string;
    people: PcoPerson[];
}

const COLUMN_LABELS: Record<CustomReportColumnKey, string> = {
    name: 'Name',
    phone: 'Phone',
    email: 'Email',
    membership: 'Membership',
    status: 'Status',
    riskCategory: 'Care Risk',
    lastAttended: 'Last Attended',
    groupCount: 'Groups',
    birthdate: 'Birthday',
    createdAt: 'Added to PCO',
};

function getCellValue(p: PcoPerson, col: CustomReportColumnKey): string {
    switch (col) {
        case 'name':
            return p.name || '';
        case 'phone':
            return p.phone || p.primary_phone || '—';
        case 'email':
            return p.email || p.primary_email || '—';
        case 'membership':
            return p.membership || p.membershipStatus || '—';
        case 'status':
            return p.status || '—';
        case 'riskCategory':
            return p.riskProfile?.category || '—';
        case 'lastAttended':
            return p.attendanceStats?.lastAttended
                ? new Date(p.attendanceStats.lastAttended).toLocaleDateString()
                : 'Never / Unknown';
        case 'groupCount':
            return String(p.groupIds?.length ?? 0);
        case 'birthdate':
            return p.birthdate || '—';
        case 'createdAt':
            return p.createdAt ? new Date(p.createdAt).toLocaleDateString() : '—';
    }
}

export const CustomReportsPanel: React.FC<CustomReportsPanelProps> = ({ churchId, people }) => {
    const [reports, setReports] = useState<CustomReportDefinition[]>([]);
    const [loading, setLoading] = useState(true);
    const [selectedId, setSelectedId] = useState<string | null>(null);
    const [showRecipes, setShowRecipes] = useState(false);
    const [showQuickBuilder, setShowQuickBuilder] = useState(false);

    // Quick custom report builder state
    const [newName, setNewName] = useState('');
    const [newStatus, setNewStatus] = useState('Active');
    const [newNotAttendedDays, setNewNotAttendedDays] = useState('');
    const [newNoGroup, setNewNoGroup] = useState(false);
    const [newAdultsOnly, setNewAdultsOnly] = useState(true);
    const [savingNew, setSavingNew] = useState(false);

    useEffect(() => {
        if (!churchId) {
            setLoading(false);
            return;
        }
        const q = query(collection(db, 'pco_custom_reports'), where('churchId', '==', churchId));
        const unsub = onSnapshot(
            q,
            snap => {
                const list = snap.docs
                    .map(d => ({ id: d.id, ...d.data() } as CustomReportDefinition))
                    .sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
                setReports(list);
                setSelectedId(prev => (prev && list.some(r => r.id === prev) ? prev : list[0]?.id ?? null));
                setLoading(false);
            },
            () => setLoading(false)
        );
        return unsub;
    }, [churchId]);

    const activeReport = useMemo(
        () => reports.find(r => r.id === selectedId) ?? null,
        [reports, selectedId]
    );

    const rows = useMemo(() => {
        if (!activeReport) return [];
        return evaluateCustomReport(people, activeReport);
    }, [people, activeReport]);

    const handleExportCsv = () => {
        if (!activeReport) return;
        const cols = activeReport.columns;
        const header = cols.map(c => `"${COLUMN_LABELS[c]}"`).join(',');
        const body = rows
            .map(p =>
                cols
                    .map(c => `"${getCellValue(p, c).replace(/"/g, '""')}"`)
                    .join(',')
            )
            .join('\n');
        const blob = new Blob([`${header}\n${body}`], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${activeReport.name.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.csv`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const handleDeleteReport = async (id: string) => {
        if (!window.confirm('Delete this custom report?')) return;
        await deleteDoc(doc(db, 'pco_custom_reports', id));
    };

    const handleCreateQuickReport = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!churchId || !newName.trim()) return;
        setSavingNew(true);
        try {
            const now = Date.now();
            const id = `rep_${now}_${Math.random().toString(36).substring(2, 8)}`;
            const def: CustomReportDefinition = {
                id,
                churchId,
                name: newName.trim(),
                description: 'Custom PCO people report',
                filters: {
                    ...(newStatus ? { statusIn: [newStatus] } : {}),
                    ...(newNotAttendedDays ? { notAttendedInDays: Number(newNotAttendedDays) } : {}),
                    ...(newNoGroup ? { noGroup: true } : {}),
                    ...(newAdultsOnly ? { adultsOnly: true } : {}),
                },
                columns: ['name', 'phone', 'email', 'membership', 'riskCategory', 'lastAttended'],
                sortBy: 'name',
                sortDir: 'asc',
                createdAt: now,
                updatedAt: now,
            };
            await setDoc(doc(db, 'pco_custom_reports', id), def);
            setSelectedId(id);
            setNewName('');
            setShowQuickBuilder(false);
        } finally {
            setSavingNew(false);
        }
    };

    if (!churchId) {
        return (
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-8 text-center text-slate-500 text-sm">
                Select a church to create and view PCO Custom Reports.
            </div>
        );
    }

    return (
        <div className="space-y-6">
            {/* Header Bar */}
            <div className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm flex flex-wrap items-center justify-between gap-4">
                <div>
                    <h4 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <BarChart3 size={20} className="text-indigo-500" /> PCO Custom Reports
                    </h4>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                        Import ready-made ministry reports in 1 click or build your own filtered PCO list.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        type="button"
                        onClick={() => setShowQuickBuilder(v => !v)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-xs font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition"
                    >
                        <Plus size={14} /> Custom Report
                    </button>
                    <button
                        type="button"
                        onClick={() => setShowRecipes(true)}
                        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition shadow-sm"
                    >
                        <Sparkles size={14} /> Browse Report Recipes
                    </button>
                </div>
            </div>

            {/* Quick Custom Report Builder */}
            {showQuickBuilder && (
                <form
                    onSubmit={handleCreateQuickReport}
                    className="bg-white dark:bg-slate-900 rounded-3xl border border-indigo-200 dark:border-indigo-800 p-6 shadow-sm space-y-4"
                >
                    <div className="flex items-center gap-2 text-xs font-black uppercase tracking-wider text-indigo-600 dark:text-indigo-400">
                        <Filter size={13} /> New Custom PCO Report
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div>
                            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Report Name</label>
                            <input
                                type="text"
                                required
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                placeholder="e.g. Unconnected Active Adults"
                                className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                            />
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">PCO Status</label>
                            <select
                                value={newStatus}
                                onChange={e => setNewStatus(e.target.value)}
                                className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                            >
                                <option value="Active">Active</option>
                                <option value="Inactive">Inactive</option>
                                <option value="">Any Status</option>
                            </select>
                        </div>
                        <div>
                            <label className="block text-xs font-bold text-slate-600 dark:text-slate-400 mb-1">Not Attended In (Days)</label>
                            <input
                                type="number"
                                min={1}
                                value={newNotAttendedDays}
                                onChange={e => setNewNotAttendedDays(e.target.value)}
                                placeholder="e.g. 60 (optional)"
                                className="w-full text-sm border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white"
                            />
                        </div>
                    </div>
                    <div className="flex flex-wrap items-center gap-6">
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                            <input type="checkbox" checked={newNoGroup} onChange={e => setNewNoGroup(e.target.checked)} className="rounded accent-indigo-600" />
                            Not in any Small Group
                        </label>
                        <label className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 cursor-pointer">
                            <input type="checkbox" checked={newAdultsOnly} onChange={e => setNewAdultsOnly(e.target.checked)} className="rounded accent-indigo-600" />
                            Adults Only
                        </label>
                    </div>
                    <div className="flex justify-end gap-2">
                        <button type="button" onClick={() => setShowQuickBuilder(false)} className="px-4 py-2 text-xs font-bold text-slate-500">Cancel</button>
                        <button
                            type="submit"
                            disabled={savingNew}
                            className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black"
                        >
                            {savingNew ? 'Saving...' : 'Save Report'}
                        </button>
                    </div>
                </form>
            )}

            {/* Saved Reports + Table */}
            {loading ? (
                <div className="flex items-center justify-center py-12 text-slate-400 text-sm">
                    <Loader2 size={18} className="animate-spin mr-2" /> Loading custom reports...
                </div>
            ) : reports.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-300 dark:border-slate-700 p-10 text-center space-y-3">
                    <BarChart3 size={32} className="mx-auto text-indigo-400" />
                    <h5 className="text-base font-black text-slate-900 dark:text-white">No Custom Reports Yet</h5>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-md mx-auto">
                        Start in seconds by importing a pre-built report recipe like 30-Day Guests, Lapsed Attendance, or Missing Contact Info.
                    </p>
                    <button
                        type="button"
                        onClick={() => setShowRecipes(true)}
                        className="inline-flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-black transition"
                    >
                        <Sparkles size={14} /> Browse Report Recipes
                    </button>
                </div>
            ) : (
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Sidebar list */}
                    <div className="space-y-2">
                        {reports.map(r => (
                            <div
                                key={r.id}
                                onClick={() => setSelectedId(r.id)}
                                className={`p-3.5 rounded-2xl border cursor-pointer transition flex items-start justify-between gap-2 ${
                                    selectedId === r.id
                                        ? 'bg-indigo-50 dark:bg-indigo-900/30 border-indigo-400 dark:border-indigo-600'
                                        : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-indigo-300'
                                }`}
                            >
                                <div className="min-w-0">
                                    <p className="text-xs font-black text-slate-900 dark:text-white truncate">{r.name}</p>
                                    {r.category && (
                                        <span className="text-[10px] font-bold text-indigo-600 dark:text-indigo-400">{r.category}</span>
                                    )}
                                </div>
                                <button
                                    type="button"
                                    title="Delete report"
                                    onClick={e => { e.stopPropagation(); handleDeleteReport(r.id); }}
                                    className="p-1 text-slate-400 hover:text-red-500 rounded-lg shrink-0"
                                >
                                    <Trash2 size={13} />
                                </button>
                            </div>
                        ))}
                    </div>

                    {/* Results table */}
                    {activeReport && (
                        <div className="lg:col-span-3 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-6 shadow-sm space-y-4">
                            <div className="flex flex-wrap items-center justify-between gap-3">
                                <div>
                                    <h5 className="text-lg font-black text-slate-900 dark:text-white">{activeReport.name}</h5>
                                    {activeReport.description && (
                                        <p className="text-xs text-slate-500 dark:text-slate-400">{activeReport.description}</p>
                                    )}
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="inline-flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200">
                                        <Users size={13} /> {rows.length} {rows.length === 1 ? 'person' : 'people'}
                                    </span>
                                    <button
                                        type="button"
                                        onClick={handleExportCsv}
                                        disabled={rows.length === 0}
                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs font-bold transition"
                                    >
                                        <Download size={13} /> Export CSV
                                    </button>
                                </div>
                            </div>

                            <div className="overflow-x-auto border border-slate-200 dark:border-slate-800 rounded-2xl">
                                <table className="w-full text-xs text-left border-collapse">
                                    <thead>
                                        <tr className="bg-slate-50 dark:bg-slate-800/70 border-b border-slate-200 dark:border-slate-800">
                                            {activeReport.columns.map(col => (
                                                <th key={col} className="px-4 py-3 font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 text-[10px]">
                                                    {COLUMN_LABELS[col]}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                        {rows.length === 0 ? (
                                            <tr>
                                                <td colSpan={activeReport.columns.length} className="px-4 py-10 text-center text-slate-400">
                                                    No people match this report&apos;s filters.
                                                </td>
                                            </tr>
                                        ) : (
                                            rows.slice(0, 200).map(p => (
                                                <tr key={p.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-800/40">
                                                    {activeReport.columns.map(col => (
                                                        <td key={col} className="px-4 py-2.5 text-slate-700 dark:text-slate-200 whitespace-nowrap">
                                                            {col === 'name' ? <span className="font-bold">{getCellValue(p, col)}</span> : getCellValue(p, col)}
                                                        </td>
                                                    ))}
                                                </tr>
                                            ))
                                        )}
                                    </tbody>
                                </table>
                            </div>
                            {rows.length > 200 && (
                                <p className="text-[11px] text-slate-400">
                                    Showing first 200 of {rows.length} people. Export CSV for the full list.
                                </p>
                            )}
                        </div>
                    )}
                </div>
            )}

            {showRecipes && (
                <RecipeLibraryModal
                    churchId={churchId}
                    initialKind="report"
                    onClose={() => setShowRecipes(false)}
                    onImported={(_recipe, created) => {
                        if (created?.id) setSelectedId(created.id);
                        setShowRecipes(false);
                    }}
                />
            )}
        </div>
    );
};
