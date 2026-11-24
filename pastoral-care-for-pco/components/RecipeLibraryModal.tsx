import React, { useMemo, useState } from 'react';
import {
    BarChart3,
    CheckCircle,
    Clock,
    FormInput,
    Loader2,
    Search,
    Sparkles,
    X,
    Zap,
} from 'lucide-react';
import { ALL_RECIPES } from '../data/recipeCatalog';
import { importAnyRecipe } from '../services/recipeImportService';
import { Recipe, RecipeCategory, RecipeKind } from '../types';

interface RecipeLibraryModalProps {
    churchId: string;
    /** Lock or pre-filter the modal to a specific recipe kind (optional). */
    initialKind?: RecipeKind | 'all';
    onClose: () => void;
    /** Called after a recipe is imported into Firestore. */
    onImported: (recipe: Recipe, createdEntity: any) => void;
}

const KIND_META: Record<RecipeKind, { label: string; badge: string; Icon: React.ElementType }> = {
    workflow: {
        label: 'SMS/Email Workflow',
        badge: 'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300',
        Icon: Zap,
    },
    form: {
        label: 'Care Form',
        badge: 'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300',
        Icon: FormInput,
    },
    report: {
        label: 'PCO Custom Report',
        badge: 'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300',
        Icon: BarChart3,
    },
};

const CATEGORIES: ('All' | RecipeCategory)[] = [
    'All',
    'Assimilation',
    'Pastoral Care',
    'Retention',
    'Volunteers',
    'Data Health',
];

export const RecipeLibraryModal: React.FC<RecipeLibraryModalProps> = ({
    churchId,
    initialKind = 'all',
    onClose,
    onImported,
}) => {
    const [kindFilter, setKindFilter] = useState<RecipeKind | 'all'>(initialKind);
    const [category, setCategory] = useState<'All' | RecipeCategory>('All');
    const [search, setSearch] = useState('');
    const [importingId, setImportingId] = useState<string | null>(null);
    const [importedIds, setImportedIds] = useState<Record<string, boolean>>({});
    const [error, setError] = useState<string | null>(null);

    const filteredRecipes = useMemo(() => {
        const q = search.trim().toLowerCase();
        return ALL_RECIPES.filter(r => {
            if (kindFilter !== 'all' && r.kind !== kindFilter) return false;
            if (category !== 'All' && r.category !== category) return false;
            if (!q) return true;
            return (
                r.title.toLowerCase().includes(q) ||
                r.subtitle.toLowerCase().includes(q) ||
                r.highlights.some(h => h.toLowerCase().includes(q))
            );
        });
    }, [kindFilter, category, search]);

    const handleImport = async (recipe: Recipe) => {
        if (importingId) return;
        setError(null);
        setImportingId(recipe.id);
        try {
            const created = await importAnyRecipe(churchId, recipe);
            setImportedIds(prev => ({ ...prev, [recipe.id]: true }));
            onImported(recipe, created);
        } catch (err: any) {
            setError(err?.message || 'Failed to import recipe.');
        } finally {
            setImportingId(null);
        }
    };

    return (
        <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
            onClick={onClose}
        >
            <div
                className="w-full max-w-4xl bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col max-h-[90vh] overflow-hidden"
                onClick={e => e.stopPropagation()}
            >
                {/* Header */}
                <div className="px-6 py-5 bg-gradient-to-r from-indigo-600 to-violet-600 text-white flex items-center justify-between shrink-0">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-2xl bg-white/20 flex items-center justify-center">
                            <Sparkles size={20} />
                        </div>
                        <div>
                            <h2 className="text-lg font-black">Church Recipe Library</h2>
                            <p className="text-xs text-indigo-100">
                                1-click templates for Workflows, Care Forms, and PCO Custom Reports
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        title="Close"
                        aria-label="Close recipe library"
                        className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/20 transition"
                    >
                        <X size={18} />
                    </button>
                </div>

                {/* Filters */}
                <div className="px-6 py-4 border-b border-slate-200 dark:border-slate-800 space-y-3 shrink-0 bg-slate-50/70 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                        <div className="flex items-center gap-1.5 bg-white dark:bg-slate-800 p-1 rounded-xl border border-slate-200 dark:border-slate-700">
                            {([
                                { id: 'all', label: 'All Recipes' },
                                { id: 'workflow', label: 'Workflows' },
                                { id: 'form', label: 'Care Forms' },
                                { id: 'report', label: 'PCO Reports' },
                            ] as const).map(tab => (
                                <button
                                    key={tab.id}
                                    type="button"
                                    onClick={() => setKindFilter(tab.id)}
                                    className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${
                                        kindFilter === tab.id
                                            ? 'bg-indigo-600 text-white shadow-sm'
                                            : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-700'
                                    }`}
                                >
                                    {tab.label}
                                </button>
                            ))}
                        </div>

                        <div className="relative flex-1 min-w-[200px] max-w-xs">
                            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                placeholder="Search recipes (e.g. Guest, Hospital)..."
                                className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            />
                        </div>
                    </div>

                    <div className="flex flex-wrap gap-1.5">
                        {CATEGORIES.map(cat => (
                            <button
                                key={cat}
                                type="button"
                                onClick={() => setCategory(cat)}
                                className={`px-2.5 py-1 rounded-full text-[11px] font-bold transition border ${
                                    category === cat
                                        ? 'bg-slate-900 dark:bg-white text-white dark:text-slate-900 border-transparent'
                                        : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-indigo-300'
                                }`}
                            >
                                {cat}
                            </button>
                        ))}
                    </div>

                    {error && (
                        <div className="text-xs text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">
                            {error}
                        </div>
                    )}
                </div>

                {/* Recipe Grid */}
                <div className="flex-1 overflow-y-auto p-6">
                    {filteredRecipes.length === 0 ? (
                        <div className="text-center py-12 text-slate-400 text-sm">
                            No recipes match your current filter.
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {filteredRecipes.map(recipe => {
                                const meta = KIND_META[recipe.kind];
                                const KindIcon = meta.Icon;
                                const isBusy = importingId === recipe.id;
                                const isDone = !!importedIds[recipe.id];

                                return (
                                    <div
                                        key={recipe.id}
                                        className="flex flex-col justify-between p-5 rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800/60 hover:border-indigo-300 dark:hover:border-indigo-600 transition shadow-xs"
                                    >
                                        <div className="space-y-3">
                                            <div className="flex items-start justify-between gap-2">
                                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wide px-2.5 py-1 rounded-full ${meta.badge}`}>
                                                    <KindIcon size={11} />
                                                    {meta.label}
                                                </span>
                                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-slate-400">
                                                    <Clock size={10} /> {recipe.estimatedSetupMinutes}m setup
                                                </span>
                                            </div>

                                            <div>
                                                <h3 className="text-base font-black text-slate-900 dark:text-white">
                                                    {recipe.title}
                                                </h3>
                                                <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                                                    {recipe.subtitle}
                                                </p>
                                            </div>

                                            <div className="flex flex-wrap gap-1.5">
                                                {recipe.highlights.map(h => (
                                                    <span
                                                        key={h}
                                                        className="text-[10px] font-semibold px-2 py-0.5 rounded-lg bg-slate-100 dark:bg-slate-700/70 text-slate-600 dark:text-slate-300"
                                                    >
                                                        {h}
                                                    </span>
                                                ))}
                                            </div>
                                        </div>

                                        <div className="mt-4 pt-3 border-t border-slate-100 dark:border-slate-700/60 flex items-center justify-between gap-3">
                                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">
                                                {recipe.category} · {recipe.churchSizeFit}
                                            </span>
                                            <button
                                                type="button"
                                                disabled={isBusy || isDone}
                                                onClick={() => handleImport(recipe)}
                                                className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-black transition ${
                                                    isDone
                                                        ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-700'
                                                        : 'bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white shadow-sm'
                                                }`}
                                            >
                                                {isBusy ? (
                                                    <>
                                                        <Loader2 size={13} className="animate-spin" /> Importing...
                                                    </>
                                                ) : isDone ? (
                                                    <>
                                                        <CheckCircle size={13} /> Imported
                                                    </>
                                                ) : (
                                                    <>
                                                        <Sparkles size={13} /> Import 1-Click
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
