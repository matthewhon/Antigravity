
import React, { useState, useEffect, useMemo, useRef } from 'react';
import { MetricDefinition, Ministry, MetricEntry, User, CensusStats, Church, PeopleDashboardData, WidgetDefinition } from '../types';
import { firestore } from '../services/firestoreService';
import { StatCard, WidgetWrapper } from './SharedUI';
import { syncYoutubeMetrics } from '../services/youtubeService';
import WidgetsController from './WidgetsController';
import { 
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';

interface MetricsViewProps {
    churchId: string;
    currentUser: User;
    censusData?: CensusStats | null;
    peopleData?: PeopleDashboardData | null;
    church?: Church;
    systemSettings?: any;
    onUpdateChurch?: (updates: Partial<Church>) => void;
    onUpdateWidgets?: (newWidgets: string[]) => void;
}

type TimeFilter = 'Week' | 'Month' | 'Quarter' | 'Year';

const normalizeDateStr = (dateStr: string): string => {
    if (dateStr && dateStr.length === 7) { // YYYY-MM
        return `${dateStr}-01`;
    }
    return dateStr;
};

const getLocalISOString = (date: Date): string => {
    const yyyy = date.getFullYear();
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    return `${yyyy}-${mm}-${dd}`;
};

const getXAxisLabel = (dateStr: string): string => {
    const parts = dateStr.split('-');
    if (parts.length >= 2) {
        const month = parseInt(parts[1], 10);
        const day = parts[2] ? parseInt(parts[2], 10) : 1;
        return `${month}/${day}`;
    }
    return dateStr;
};

interface MetricsViewPropsExtended extends MetricsViewProps {
    activePage?: 'Dashboard' | 'Input' | 'Settings';
}

export const MetricsView: React.FC<MetricsViewPropsExtended> = ({ churchId, currentUser, censusData, peopleData, church, systemSettings, onUpdateChurch, onUpdateWidgets, activePage = 'Dashboard' }) => {
    const activeTab = activePage;
    const [definitions, setDefinitions] = useState<MetricDefinition[]>([]);
    const [ministries, setMinistries] = useState<Ministry[]>([]);
    const [entries, setEntries] = useState<MetricEntry[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Input Tab State
    const [inputDate, setInputDate] = useState(new Date().toISOString().split('T')[0]);
    const [selectedMinistryId, setSelectedMinistryId] = useState<string>('');
    const [inputValues, setInputValues] = useState<Record<string, number>>({}); // Key: DefinitionID
    const [isSavingEntry, setIsSavingEntry] = useState(false);

    // Settings Tab State
    const [defName, setDefName] = useState('');
    const [defType, setDefType] = useState<'number' | 'currency'>('number');
    const [defMinistryId, setDefMinistryId] = useState(''); 
    const [editingDefId, setEditingDefId] = useState<string | null>(null);

    const [ministryName, setMinistryName] = useState('');
    const [editingMinistryId, setEditingMinistryId] = useState<string | null>(null);

    // Dashboard State
    const [timeFilter, setTimeFilter] = useState<TimeFilter>('Year');
    
    // Drag & Drop Refs
    const dragItem = useRef<number | null>(null);
    const dragOverItem = useRef<number | null>(null);

    // YouTube State
    const [isAutoSyncing, setIsAutoSyncing] = useState(false);

    useEffect(() => {
        loadData();
    }, [churchId]);

    // Automatic YouTube metrics sync on page load (older than 1 hr)
    useEffect(() => {
        const autoSyncYoutube = async () => {
            const ytChannelId = church?.metricsSettings?.youtubeChannelId;
            const showYoutube = church?.metricsSettings?.showYoutubeWidgets;
            if (!ytChannelId || !showYoutube || isAutoSyncing) return;

            const lastSynced = church?.metricsSettings?.youtubeLastSynced || 0;
            const oneHourMs = 60 * 60 * 1000;
            const shouldSync = Date.now() - lastSynced > oneHourMs;

            if (shouldSync) {
                setIsAutoSyncing(true);
                try {
                    console.log("[MetricsView] Auto-syncing YouTube metrics on load...");
                    await syncYoutubeMetrics(
                        churchId,
                        ytChannelId,
                        systemSettings?.youtubeApiKey
                    );
                    await loadData();
                } catch (e) {
                    console.error("[MetricsView] Auto-syncing YouTube metrics failed:", e);
                } finally {
                    setIsAutoSyncing(false);
                }
            }
        };

        if (activeTab === 'Dashboard') {
            autoSyncYoutube();
        }
    }, [activeTab, churchId, church?.metricsSettings?.youtubeChannelId, church?.metricsSettings?.showYoutubeWidgets, systemSettings]);

    // Calculate growth rates based on historical metric entries
    const getSubscribersGrowth = useMemo(() => {
        const ytEntries = entries.filter(e => e.ministryId === 'min_youtube');
        if (ytEntries.length === 0) return { weekly: null, monthly: null };

        const sorted = [...ytEntries].sort((a, b) => a.date.localeCompare(b.date));
        const latestEntry = sorted[sorted.length - 1];
        const latestSubs = latestEntry?.values?.['def_yt_subscribers'] || church?.metricsSettings?.youtubeSubscribers || 0;

        if (latestSubs === 0) return { weekly: null, monthly: null };

        const getClosestEntryValue = (daysAgo: number): number | null => {
            const targetDate = new Date();
            targetDate.setDate(targetDate.getDate() - daysAgo);
            const targetDateStr = targetDate.toISOString().split('T')[0];

            let closestEntry: MetricEntry | null = null;
            let minDiff = Infinity;

            for (const entry of sorted) {
                const diff = Math.abs(new Date(entry.date).getTime() - new Date(targetDateStr).getTime());
                if (diff < minDiff && diff < (daysAgo * 0.5 * 24 * 60 * 60 * 1000)) {
                    minDiff = diff;
                    closestEntry = entry;
                }
            }

            return closestEntry?.values?.['def_yt_subscribers'] || null;
        };

        const weeklySubs = getClosestEntryValue(7);
        const monthlySubs = getClosestEntryValue(30);

        const calcRate = (current: number, past: number | null): string | null => {
            if (past === null || past === 0) return null;
            const rate = ((current - past) / past) * 100;
            const sign = rate >= 0 ? '+' : '';
            return `${sign}${rate.toFixed(1)}%`;
        };

        return {
            weekly: calcRate(latestSubs, weeklySubs),
            monthly: calcRate(latestSubs, monthlySubs)
        };
    }, [entries, church?.metricsSettings?.youtubeSubscribers]);

    const loadData = async () => {
        setIsLoading(true);
        try {
            const [fetchedDefs, fetchedMinistries, fetchedEntries] = await Promise.all([
                firestore.getMetricDefinitions(churchId),
                firestore.getMinistries(churchId),
                firestore.getMetricEntries(churchId)
            ]);
            setDefinitions(fetchedDefs);
            setMinistries(fetchedMinistries);
            setEntries(fetchedEntries);
            
            // Default selections
            if (fetchedMinistries.length > 0) {
                if (!selectedMinistryId) setSelectedMinistryId(fetchedMinistries[0].id);
                if (!defMinistryId) setDefMinistryId(fetchedMinistries[0].id);
            }
        } catch (e) {
            console.error("Failed to load metrics data", e);
        } finally {
            setIsLoading(false);
        }
    };

    // Available widgets list
    const availableWidgets = useMemo<WidgetDefinition[]>(() => {
        const list: WidgetDefinition[] = [
            { id: 'census_pop', label: 'Census: Total Population', icon: '📊' },
            { id: 'census_income', label: 'Census: Median Income', icon: '💰' },
            { id: 'census_age', label: 'Census: Median Age', icon: '👥' },
            { id: 'census_poverty', label: 'Census: Poverty Rate', icon: '📉' },
            { id: 'missional_gap', label: 'Missional Gap', icon: '🏙️' },
            { id: 'city_penetration', label: 'City Penetration', icon: '📍' },
        ];

        const showYoutube = church?.metricsSettings?.showYoutubeWidgets || false;
        if (showYoutube && church?.metricsSettings?.youtubeChannelId) {
            list.push({ id: 'youtube_channel', label: 'YouTube Channel Stats', icon: '▶️' });
            list.push({ id: 'youtube_latest_video', label: 'YouTube Latest Video', icon: '🎬' });
        }

        ministries.forEach(m => {
            list.push({ id: `ministry_${m.id}`, label: `${m.name} Chart`, icon: '📈' });
        });

        return list;
    }, [church?.metricsSettings?.showYoutubeWidgets, church?.metricsSettings?.youtubeChannelId, ministries]);

    // Visible widgets list
    const visibleWidgets = useMemo<string[]>(() => {
        const saved = currentUser?.widgetPreferences?.['metrics'];
        if (saved && Array.isArray(saved)) {
            // Filter to only include widgets that are actually available
            return saved.filter(id => availableWidgets.some(w => w.id === id));
        }

        // Default list of widgets: all available widgets!
        return availableWidgets.map(w => w.id);
    }, [currentUser?.widgetPreferences, availableWidgets]);

    const handleRemoveWidget = (id: string) => {
        if (onUpdateWidgets) {
            onUpdateWidgets(visibleWidgets.filter(w => w !== id));
        }
    };

    // Drag Handlers
    const handleDragStart = (e: React.DragEvent<HTMLDivElement>, position: number) => {
        dragItem.current = position;
        e.currentTarget.style.opacity = '0.4';
    };

    const handleDragEnter = (e: React.DragEvent<HTMLDivElement>, position: number) => {
        dragOverItem.current = position;
        e.preventDefault();
    };

    const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
        e.preventDefault();
    };

    const handleDragEnd = (e: React.DragEvent<HTMLDivElement>) => {
        e.currentTarget.style.opacity = '1';
        if (dragItem.current !== null && dragOverItem.current !== null && dragItem.current !== dragOverItem.current) {
            const copy = [...visibleWidgets];
            const draggedContent = copy[dragItem.current];
            copy.splice(dragItem.current, 1);
            copy.splice(dragOverItem.current, 0, draggedContent);
            if (onUpdateWidgets) {
                onUpdateWidgets(copy);
            }
        }
        dragItem.current = null;
        dragOverItem.current = null;
    };

    // --- Settings Handlers (Same as before) ---
    const handleSaveMinistry = async () => {
        if (!ministryName.trim()) return;
        const id = editingMinistryId || `min_${Date.now()}`;
        const ministry: Ministry = { id, churchId, name: ministryName, isActive: true };
        try {
            await firestore.saveMinistry(ministry);
            if (editingMinistryId) {
                setMinistries(prev => prev.map(m => m.id === id ? ministry : m));
                setEditingMinistryId(null);
            } else {
                setMinistries(prev => [...prev, ministry]);
                if (!selectedMinistryId) setSelectedMinistryId(ministry.id);
                if (!defMinistryId) setDefMinistryId(ministry.id);
            }
            setMinistryName('');
        } catch (e) {
            console.error(e);
            alert("Failed to save ministry.");
        }
    };

    const handleEditMinistry = (m: Ministry) => {
        setMinistryName(m.name);
        setEditingMinistryId(m.id);
    };

    const handleCancelEditMinistry = () => {
        setMinistryName('');
        setEditingMinistryId(null);
    };

    const handleDeleteMinistry = async (id: string) => {
        if(!window.confirm("Are you sure you want to delete this ministry? This cannot be undone.")) return;
        try {
            await firestore.deleteMinistry(id);
            setMinistries(prev => prev.filter(m => m.id !== id));
            if (selectedMinistryId === id) setSelectedMinistryId('');
            if (editingMinistryId === id) handleCancelEditMinistry();
        } catch (e) {
            console.error(e);
            alert("Failed to delete ministry.");
        }
    };

    const handleSaveDefinition = async () => {
        if (!defName.trim()) return;
        if (!defMinistryId) { alert("Please select a Ministry."); return; }
        const id = editingDefId || `def_${Date.now()}`;
        const def: MetricDefinition = { id, churchId, ministryId: defMinistryId, name: defName, type: defType, isActive: true };
        try {
            await firestore.saveMetricDefinition(def);
            if (editingDefId) {
                setDefinitions(prev => prev.map(d => d.id === id ? def : d));
                setEditingDefId(null);
            } else {
                setDefinitions(prev => [...prev, def]);
            }
            setDefName('');
            setDefType('number');
        } catch (e) {
            console.error(e);
            alert("Failed to save metric.");
        }
    };

    const handleEditDefinition = (d: MetricDefinition) => {
        setDefName(d.name);
        setDefType(d.type);
        setDefMinistryId(d.ministryId || ministries[0]?.id || '');
        setEditingDefId(d.id);
    };

    const handleCancelEditDefinition = () => {
        setDefName('');
        setDefType('number');
        setEditingDefId(null);
    };

    const handleDeleteDefinition = async (id: string) => {
        if(!window.confirm("Delete this metric?")) return;
        try {
            await firestore.deleteMetricDefinition(id);
            setDefinitions(prev => prev.filter(d => d.id !== id));
            if (editingDefId === id) handleCancelEditDefinition();
        } catch (e) {
            console.error(e);
            alert("Failed to delete metric.");
        }
    };

    // --- Input Handlers ---
    const handleInputValueChange = (defId: string, val: string) => {
        const num = parseFloat(val);
        setInputValues(prev => ({ ...prev, [defId]: isNaN(num) ? 0 : num }));
    };

    useEffect(() => {
        if (!selectedMinistryId || !inputDate) return;
        const existingEntry = entries.find(e => e.date === inputDate && e.ministryId === selectedMinistryId);
        if (existingEntry) {
            setInputValues(existingEntry.values);
        } else {
            setInputValues({});
        }
    }, [inputDate, selectedMinistryId, entries]);

    const handleSaveEntry = async () => {
        if (!selectedMinistryId || !inputDate) return;
        setIsSavingEntry(true);
        try {
            const existingEntry = entries.find(e => e.date === inputDate && e.ministryId === selectedMinistryId);
            const entryId = existingEntry ? existingEntry.id : `entry_${churchId}_${selectedMinistryId}_${inputDate}`;
            const entry: MetricEntry = {
                id: entryId,
                churchId,
                date: inputDate,
                ministryId: selectedMinistryId,
                values: inputValues,
                updatedAt: Date.now(),
                updatedBy: currentUser.id
            };
            await firestore.saveMetricEntry(entry);
            const otherEntries = entries.filter(e => e.id !== entryId);
            setEntries([...otherEntries, entry]);
            alert("Data saved successfully!");
        } catch (e) {
            console.error(e);
            alert("Failed to save data.");
        } finally {
            setIsSavingEntry(false);
        }
    };

    // --- Dashboard Logic ---
    const getStartDate = (filter: TimeFilter): Date => {
        const now = new Date();
        const start = new Date();
        start.setHours(0, 0, 0, 0);
        if (filter === 'Week') {
            const day = start.getDay();
            start.setDate(start.getDate() - day + (day === 0 ? -6 : 1));
        } else if (filter === 'Month') {
            start.setDate(1);
        } else if (filter === 'Quarter') {
            start.setMonth(Math.floor(now.getMonth() / 3) * 3, 1);
        } else if (filter === 'Year') {
            start.setMonth(0, 1);
        }
        return start;
    };

    const getChartDataForMinistry = (ministryId: string) => {
        const startDate = getStartDate(timeFilter);
        const startDateStr = getLocalISOString(startDate);
        const today = new Date();

        const relevantEntries = entries.filter(e => {
            const normalizedDate = normalizeDateStr(e.date);
            return e.ministryId === ministryId && normalizedDate >= startDateStr;
        }).sort((a,b) => new Date(normalizeDateStr(a.date)).getTime() - new Date(normalizeDateStr(b.date)).getTime());

        const ministryDefs = definitions.filter(d => d.ministryId === ministryId);
        const dataMap: Record<string, any> = {};

        relevantEntries.forEach(entry => {
            const normalizedDate = normalizeDateStr(entry.date);
            if (!dataMap[normalizedDate]) {
                dataMap[normalizedDate] = { 
                    date: normalizedDate, 
                    name: getXAxisLabel(normalizedDate) 
                };
            }
            Object.entries(entry.values).forEach(([defId, val]) => {
                const def = ministryDefs.find(d => d.id === defId);
                if (def) dataMap[normalizedDate][def.name] = val;
            });
        });

        let chartData = Object.values(dataMap);
        if (chartData.length === 0 && ministryDefs.length > 0) {
            const createZeroPoint = (d: Date) => {
                const localStr = getLocalISOString(d);
                const point: any = { 
                    date: localStr, 
                    name: getXAxisLabel(localStr) 
                };
                ministryDefs.forEach(def => { point[def.name] = 0; });
                return point;
            };
            chartData.push(createZeroPoint(startDate));
            chartData.push(createZeroPoint(today));
        }
        return { chartData, validDefs: ministryDefs };
    };

    const activeDefinitions = definitions.filter(d => d.ministryId === selectedMinistryId);
    const LINE_COLORS = ['#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#8b5cf6', '#06b6d4'];

    const renderWidget = (id: string) => {
        const currentTheme = currentUser.theme || 'traditional';
        const gridColor = currentTheme === 'dark' ? '#334155' : '#f1f5f9';
        const axisColor = currentTheme === 'dark' ? '#94a3b8' : '#94a3b8';

        if (id.startsWith('census_')) {
            if (!censusData) return null;
            if (id === 'census_pop') {
                return (
                    <WidgetWrapper title="Total Population" onRemove={() => handleRemoveWidget(id)} source="US Census">
                        <div className="flex flex-col justify-center items-center h-full py-8 text-center">
                            <span className="text-4xl font-black text-slate-850 dark:text-white tracking-tight">{censusData.totalPopulation.toLocaleString()}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Residents</span>
                        </div>
                    </WidgetWrapper>
                );
            }
            if (id === 'census_income') {
                return (
                    <WidgetWrapper title="Median Income" onRemove={() => handleRemoveWidget(id)} source="US Census">
                        <div className="flex flex-col justify-center items-center h-full py-8 text-center">
                            <span className="text-4xl font-black text-slate-850 dark:text-white tracking-tight">${censusData.economics?.medianHouseholdIncome?.toLocaleString() || 'N/A'}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Household Median</span>
                        </div>
                    </WidgetWrapper>
                );
            }
            if (id === 'census_age') {
                return (
                    <WidgetWrapper title="Median Age" onRemove={() => handleRemoveWidget(id)} source="US Census">
                        <div className="flex flex-col justify-center items-center h-full py-8 text-center">
                            <span className="text-4xl font-black text-slate-850 dark:text-white tracking-tight">{censusData.demographics?.medianAge?.toFixed(1) || 'N/A'}</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Years Old</span>
                        </div>
                    </WidgetWrapper>
                );
            }
            if (id === 'census_poverty') {
                return (
                    <WidgetWrapper title="Poverty Rate" onRemove={() => handleRemoveWidget(id)} source="US Census">
                        <div className="flex flex-col justify-center items-center h-full py-8 text-center">
                            <span className="text-4xl font-black text-slate-850 dark:text-white tracking-tight">{censusData.economics?.povertyRate?.toFixed(1)}%</span>
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-2">Below Poverty Line</span>
                        </div>
                    </WidgetWrapper>
                );
            }
        }

        if (id === 'youtube_channel') {
            const ytSettings = church?.metricsSettings;
            if (!ytSettings?.youtubeChannelId) return null;
            const lastSyncedText = ytSettings.youtubeLastSynced 
                ? new Date(ytSettings.youtubeLastSynced).toLocaleDateString()
                : 'Never';

            const subscribersCount = ytSettings.youtubeSubscribers || 0;
            // Calculate next milestone (e.g. nearest power of 10 or next 5k/10k/100k milestone)
            let nextMilestone = 1000;
            if (subscribersCount >= 1000000) {
                nextMilestone = Math.ceil((subscribersCount + 1) / 500000) * 500000;
            } else if (subscribersCount >= 100000) {
                nextMilestone = Math.ceil((subscribersCount + 1) / 50000) * 50000;
            } else if (subscribersCount >= 10000) {
                nextMilestone = Math.ceil((subscribersCount + 1) / 5000) * 5000;
            } else {
                nextMilestone = Math.ceil((subscribersCount + 1) / 1000) * 1000;
            }
            const milestoneProgress = Math.min(100, Math.max(0, (subscribersCount / nextMilestone) * 100));

            return (
                <WidgetWrapper title="YouTube Analytics" onRemove={() => {}} source="YouTube Live API">
                    <div className="flex flex-col h-full justify-between p-4 bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-850 dark:to-slate-900 transition-all rounded-[2rem] gap-3">
                        {/* Channel Header */}
                        <div className="flex items-center gap-3">
                            <div className="relative">
                                {ytSettings.youtubeChannelAvatar ? (
                                    <img 
                                        src={ytSettings.youtubeChannelAvatar} 
                                        alt="YouTube Avatar" 
                                        className="w-12 h-12 rounded-2xl border-2 border-rose-500/20 object-cover shadow-sm"
                                    />
                                ) : (
                                    <div className="w-12 h-12 rounded-2xl bg-rose-600 text-white flex items-center justify-center font-black text-xl shadow-md shadow-rose-900/10">▶</div>
                                )}
                                <span className="absolute -bottom-1 -right-1 flex h-4 w-4 items-center justify-center rounded-full bg-rose-600 text-[8px] text-white font-bold ring-2 ring-white dark:ring-slate-850">✓</span>
                            </div>
                            <div className="min-w-0 flex-1">
                                <h5 className="text-sm font-black text-slate-900 dark:text-white truncate">
                                    {ytSettings.youtubeChannelName || 'YouTube Channel'}
                                </h5>
                                <p className="text-[10px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">
                                    Last Synced: {lastSyncedText}
                                </p>
                            </div>
                        </div>

                        {/* Subscribers Hero Stat */}
                        <div className="pt-1">
                            <p className="text-[9px] font-black text-slate-400 dark:text-slate-500 uppercase tracking-widest mb-1">Subscribers</p>
                            <div className="flex items-baseline gap-2 flex-wrap">
                                <span className="text-3xl font-black tracking-tight text-slate-900 dark:text-white leading-none">
                                    {subscribersCount.toLocaleString()}
                                </span>
                                {getSubscribersGrowth.weekly && (
                                    <span className={`inline-flex items-center gap-0.5 px-2 py-0.5 rounded-full text-[9px] font-black ${getSubscribersGrowth.weekly.startsWith('-') ? 'bg-rose-100 dark:bg-rose-950/30 text-rose-600 dark:text-rose-400' : 'bg-emerald-100 dark:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400'}`}>
                                        {getSubscribersGrowth.weekly.startsWith('-') ? '▼' : '▲'} {getSubscribersGrowth.weekly}
                                    </span>
                                )}
                            </div>
                        </div>

                        {/* Goal Progress Bar */}
                        <div className="space-y-1">
                            <div className="flex justify-between text-[9px] font-bold text-slate-400 dark:text-slate-500 uppercase tracking-wider">
                                <span>Milestone Goal Progress</span>
                                <span>{milestoneProgress.toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-slate-100 dark:bg-slate-800 h-2 rounded-full overflow-hidden p-0.5 border border-slate-200/50 dark:border-slate-700/50">
                                <div 
                                    className="bg-gradient-to-r from-rose-500 to-rose-600 h-full rounded-full transition-all duration-1000 shadow-sm shadow-rose-500/20" 
                                    style={{ width: `${milestoneProgress}%` }}
                                ></div>
                            </div>
                            <div className="flex justify-between text-[8px] font-black text-slate-400/80 dark:text-slate-500/80 uppercase">
                                <span>0</span>
                                <span>{nextMilestone.toLocaleString()} Goals</span>
                            </div>
                        </div>

                        {/* Secondary Stats Grid */}
                        <div className="grid grid-cols-2 gap-3 pt-1">
                            <div className="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-2xl border border-slate-100 dark:border-slate-800/80 flex flex-col justify-center">
                                <p className="text-xs font-black text-slate-850 dark:text-white">
                                    {(ytSettings.youtubeViews || 0).toLocaleString()}
                                </p>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">Total Views</p>
                            </div>
                            <div className="bg-slate-50 dark:bg-slate-900/40 p-2.5 rounded-2xl border border-slate-100 dark:border-slate-800/80 flex flex-col justify-center">
                                <p className="text-xs font-black text-slate-850 dark:text-white">
                                    {(ytSettings.youtubeVideos || 0).toLocaleString()}
                                </p>
                                <p className="text-[9px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">Videos Published</p>
                            </div>
                        </div>

                        {/* Sync Actions */}
                        <div className="flex items-center gap-2 pt-2 border-t border-slate-100 dark:border-slate-800">
                            <a 
                                href={`https://youtube.com/${ytSettings.youtubeChannelName?.startsWith('@') ? ytSettings.youtubeChannelName : ''}`}
                                target="_blank"
                                rel="noreferrer"
                                className="flex-1 text-center bg-rose-600 hover:bg-rose-700 text-white font-black text-[9px] uppercase tracking-wider py-2.5 rounded-xl shadow-md shadow-rose-950/10 hover:shadow-rose-600/20 hover:scale-[1.02] active:scale-[0.98] transition-all"
                            >
                                Open Channel
                            </a>
                            <button
                                type="button"
                                onClick={async () => {
                                    if (isAutoSyncing) return;
                                    setIsAutoSyncing(true);
                                    try {
                                        await syncYoutubeMetrics(churchId, ytSettings.youtubeChannelId!, systemSettings?.youtubeApiKey);
                                        await loadData();
                                    } catch (e) {
                                        console.error(e);
                                    } finally {
                                        setIsAutoSyncing(false);
                                    }
                                }}
                                disabled={isAutoSyncing}
                                className="p-2.5 bg-slate-100 dark:bg-slate-850 hover:bg-slate-200 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-xl transition-all border border-slate-200/50 dark:border-slate-700/50 hover:scale-[1.02] active:scale-[0.98]"
                                title="Sync metrics now"
                            >
                                {isAutoSyncing ? (
                                    <svg className="animate-spin h-3.5 w-3.5" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                    </svg>
                                ) : '🔄'}
                            </button>
                        </div>
                    </div>
                </WidgetWrapper>
            );
        }

        if (id === 'youtube_latest_video') {
            const ytSettings = church?.metricsSettings;
            if (!ytSettings?.youtubeChannelId || !ytSettings.youtubeLatestVideo) return null;
            const video = ytSettings.youtubeLatestVideo;
            const publishDate = new Date(video.publishedAt).toLocaleDateString();

            // Calculate engagement rate
            const views = video.views || 0;
            const likes = video.likes || 0;
            const comments = video.comments || 0;
            const engagementRate = views > 0 ? ((likes + comments) / views) * 100 : 0;

            return (
                <WidgetWrapper title="Latest Video Stats" onRemove={() => {}} source="YouTube Content API">
                    <div className="flex flex-col h-full justify-between p-4 bg-gradient-to-br from-white to-slate-50/50 dark:from-slate-850 dark:to-slate-900 rounded-[2rem] gap-3">
                        {/* Image Container with Floating Badges */}
                        <a 
                            href={`https://youtube.com/watch?v=${video.id}`} 
                            target="_blank" 
                            rel="noreferrer"
                            className="relative block group rounded-2xl overflow-hidden border border-slate-100 dark:border-slate-800 shadow-sm aspect-video bg-slate-900"
                        >
                            <img 
                                src={video.thumbnail} 
                                alt={video.title}
                                className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-500 opacity-90 group-hover:opacity-100"
                            />
                            {/* Hover Play Button Overlay */}
                            <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300">
                                <span className="w-11 h-11 bg-rose-600 rounded-full flex items-center justify-center text-white text-lg font-bold shadow-lg shadow-rose-900/40 transform scale-75 group-hover:scale-100 transition-transform duration-300">▶</span>
                            </div>
                            
                            {/* Floating Stats on Thumbnail */}
                            <div className="absolute bottom-2 left-2 px-2.5 py-1 rounded-lg backdrop-blur-md bg-black/60 text-white text-[9px] font-black uppercase tracking-wider flex items-center gap-1 shadow-sm">
                                👁️ {views.toLocaleString()}
                            </div>
                            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-lg bg-rose-600 text-white text-[8px] font-black uppercase tracking-widest shadow-sm">
                                Latest Upload
                            </div>
                        </a>

                        {/* Title and Metadata */}
                        <div>
                            <a 
                                href={`https://youtube.com/watch?v=${video.id}`} 
                                target="_blank" 
                                rel="noreferrer"
                                className="text-xs font-black text-slate-900 dark:text-white line-clamp-2 leading-relaxed hover:text-rose-600 dark:hover:text-rose-400 transition-colors" 
                                title={video.title}
                            >
                                {video.title}
                            </a>
                            <p className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider mt-1.5 flex items-center gap-1.5">
                                <span>Published: {publishDate}</span>
                            </p>
                        </div>

                        {/* Performance & Engagement Stats Grid */}
                        <div className="grid grid-cols-3 gap-2 text-center pt-2 border-t border-slate-100 dark:border-slate-800">
                            <div className="p-2 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-100/55 dark:border-slate-800/50">
                                <p className="text-xs font-black text-slate-850 dark:text-white">
                                    {likes.toLocaleString()}
                                </p>
                                <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">Likes</p>
                            </div>
                            <div className="p-2 bg-slate-50 dark:bg-slate-900/30 rounded-xl border border-slate-100/55 dark:border-slate-800/50">
                                <p className="text-xs font-black text-slate-850 dark:text-white">
                                    {comments.toLocaleString()}
                                </p>
                                <p className="text-[8px] text-slate-400 font-bold uppercase tracking-tight mt-0.5">Comments</p>
                            </div>
                            <div className="p-2 bg-rose-50/50 dark:bg-rose-950/20 rounded-xl border border-rose-100/30 dark:border-rose-900/20">
                                <p className="text-xs font-black text-rose-600 dark:text-rose-400">
                                    {engagementRate.toFixed(1)}%
                                </p>
                                <p className="text-[8px] text-rose-500/80 font-bold uppercase tracking-tight mt-0.5">Engagement</p>
                            </div>
                        </div>
                    </div>
                </WidgetWrapper>
            );
        }
        if (id === 'missional_gap') {
            return (
                <WidgetWrapper title="Missional Gap" onRemove={() => handleRemoveWidget(id)} source="Census & PCO">
                    <div className="flex flex-col justify-center h-full items-center text-center p-6">
                        <div className="w-40 h-40 rounded-full border-[16px] border-slate-100 dark:border-slate-800 flex items-center justify-center relative mb-6">
                            <div className="absolute inset-0 rounded-full border-[16px] border-emerald-500" style={{clipPath: `inset(${100 - (peopleData && censusData ? (peopleData.stats.total / censusData.totalPopulation) * 100 : 0)}% 0 0 0)`}}></div>
                            <div className="text-slate-300 dark:text-slate-600 text-5xl">🏙️</div>
                        </div>
                        <h5 className="text-slate-900 dark:text-white font-black text-xl mb-1">
                            {censusData ? (censusData.totalPopulation - (peopleData?.stats.total || 0)).toLocaleString() : '---'}
                        </h5>
                        <p className="text-xs font-bold text-slate-400 dark:text-slate-500 uppercase tracking-widest">Unreached Residents</p>
                    </div>
                </WidgetWrapper>
            );
        }

        if (id === 'city_penetration') {
            return (
                <WidgetWrapper title="City Penetration" onRemove={() => handleRemoveWidget(id)} source="PCO Addresses & Census">
                    <div className="space-y-4 max-h-80 overflow-y-auto custom-scrollbar pr-2">
                        {peopleData?.geoData?.byCity.map((city, idx) => {
                            const censusLoc = censusData?.locationName.toLowerCase() || '';
                            const pcoCity = city.name.toLowerCase();
                            const isMatch = !!(censusData && censusLoc && pcoCity && censusLoc.includes(pcoCity));
                            const population = isMatch && censusData ? censusData.totalPopulation : 0;
                            const reachPercentage = population > 0 ? (city.value / population) * 100 : 0;
                            const churchTotal = peopleData?.stats.total || 1;
                            const densityPercentage = (city.value / churchTotal) * 100;

                            return (
                                <div key={idx} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 relative overflow-hidden group">
                                    {isMatch && <div className="absolute left-0 top-0 bottom-0 w-1 bg-emerald-500"></div>}
                                    <div className="flex items-center gap-4">
                                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${isMatch ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-slate-200 dark:bg-slate-800 text-slate-500 dark:text-slate-400'}`}>{idx + 1}</div>
                                        <div>
                                            <p className="text-sm font-bold text-slate-800 dark:text-white">{city.name}</p>
                                            <p className="text-[10px] text-slate-400 dark:text-slate-500 font-medium">{city.value} Households/People</p>
                                        </div>
                                    </div>
                                    <div className="text-right">
                                        {isMatch ? (
                                            <div><p className="text-lg font-black text-emerald-600 dark:text-emerald-400">{reachPercentage.toFixed(2)}%</p><p className="text-[9px] font-bold text-emerald-400 dark:text-emerald-500 uppercase tracking-wider">Reach (City Pop)</p></div>
                                        ) : (
                                            <div><p className="text-lg font-black text-slate-400 dark:text-slate-500">{densityPercentage.toFixed(1)}%</p><p className="text-[9px] font-bold text-slate-300 dark:text-slate-600 uppercase tracking-wider">Density (Church)</p></div>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                        {(!peopleData?.geoData?.byCity || peopleData.geoData.byCity.length === 0) && <div className="text-center text-slate-400 py-8 text-xs">No address data available.</div>}
                    </div>
                </WidgetWrapper>
            );
        }

        if (id.startsWith('ministry_')) {
            const ministryId = id.replace('ministry_', '');
            const ministry = ministries.find(m => m.id === ministryId);
            if (!ministry) return null;
            const { chartData, validDefs } = getChartDataForMinistry(ministry.id);
            return (
                <WidgetWrapper 
                    title={ministry.name} 
                    onRemove={() => handleRemoveWidget(id)} 
                    source="Manual Entry"
                    headerControl={<span className="text-[9px] font-black bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 px-2 py-1 rounded uppercase tracking-widest">{timeFilter} View</span>}
                >
                    <div className="h-64 w-full">
                        {validDefs.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%" minWidth={1} minHeight={1} debounce={1}>
                                <LineChart data={chartData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke={gridColor} strokeOpacity={0.2} />
                                    <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} />
                                    <YAxis axisLine={false} tickLine={false} tick={{fontSize: 10, fill: axisColor}} width={40} />
                                    <Tooltip contentStyle={{borderRadius:'12px', border:'none', boxShadow: '0 4px 12px rgba(0, 0, 0, 0.2)', backgroundColor: '#1e293b', color: '#fff'}} />
                                    <Legend verticalAlign="top" height={36} wrapperStyle={{color: axisColor}}/>
                                    {validDefs.map((def, i) => (
                                        <Line key={def.id} type="monotone" dataKey={def.name} stroke={LINE_COLORS[i % LINE_COLORS.length]} strokeWidth={3} dot={{ r: 3.5, strokeWidth: 0 }} activeDot={{r: 6}} />
                                    ))}
                                </LineChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="h-full flex items-center justify-center text-slate-400 text-xs font-bold bg-slate-50 dark:bg-slate-900 rounded-2xl">No metrics defined.</div>
                        )}
                    </div>
                </WidgetWrapper>
            );
        }
        return null;
    };

    if (isLoading) return <div className="p-10 text-center text-slate-400">Loading Metrics...</div>;

    const pageTitle = activeTab === 'Dashboard' ? 'Metrics Dashboard' : activeTab === 'Input' ? 'Input Data' : 'Configure Metrics';
    const pageSubtitle = activeTab === 'Dashboard' ? 'Track Custom Data Points' : activeTab === 'Input' ? 'Enter Ministry Data' : 'Manage Ministries & Metrics';

    return (
        <div className="space-y-8 animate-in fade-in">
            <header className="flex flex-col md:flex-row md:items-center justify-between gap-6">
                <div>
                    <h3 className="text-4xl font-black tracking-tighter text-slate-900 dark:text-white">{pageTitle}</h3>
                    <p className="text-slate-400 dark:text-slate-500 font-medium uppercase text-[10px] tracking-widest mt-1">{pageSubtitle}</p>
                </div>
                {activeTab === 'Dashboard' && onUpdateWidgets && (
                    <div className="flex items-center gap-4">
                        <WidgetsController 
                            availableWidgets={availableWidgets}
                            visibleWidgets={visibleWidgets}
                            onUpdate={onUpdateWidgets}
                            currentTheme={currentUser.theme}
                        />
                    </div>
                )}
            </header>

            {activeTab === 'Settings' && (
                <>
                    {/* ... (Existing Ministries & Definitions Config UI) ... */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        <div className="bg-white dark:bg-slate-850 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
                            <h4 className="font-black text-indigo-900 dark:text-indigo-300 mb-6">{editingMinistryId ? 'Edit Ministry' : 'Ministries / Departments'}</h4>
                            <div className="flex gap-2 mb-6">
                                <input type="text" value={ministryName} onChange={e => setMinistryName(e.target.value)} placeholder="Ministry Name" className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"/>
                                <button onClick={handleSaveMinistry} type="button" className={`text-white px-4 py-2 rounded-xl font-bold text-xs transition-colors ${editingMinistryId ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}>{editingMinistryId ? 'Update' : 'Add'}</button>
                                {editingMinistryId && <button onClick={handleCancelEditMinistry} type="button" className="bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 px-4 py-2 rounded-xl font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">Cancel</button>}
                            </div>
                            <div className="space-y-2">
                                {ministries.map(min => (
                                    <div key={min.id} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 group hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                        <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{min.name}</span>
                                        <div className="flex gap-2">
                                            <button type="button" onClick={() => handleEditMinistry(min)} className="text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 text-[10px] font-black uppercase transition-colors">Edit</button>
                                            <button type="button" onClick={() => handleDeleteMinistry(min.id)} className="text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 text-[10px] font-black uppercase transition-colors">Delete</button>
                                        </div>
                                    </div>
                                ))}
                                {ministries.length === 0 && <p className="text-xs text-slate-400 italic text-center">No ministries defined.</p>}
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-850 p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm transition-colors">
                            <h4 className="font-black text-indigo-900 dark:text-indigo-300 mb-6">{editingDefId ? 'Edit Metric' : 'Metrics'}</h4>
                            <div className="flex flex-col gap-3 mb-6">
                                <input type="text" value={defName} onChange={e => setDefName(e.target.value)} placeholder="Metric Name" className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white"/>
                                <div className="flex gap-2">
                                    <select title="Select Ministry" value={defMinistryId} onChange={(e) => setDefMinistryId(e.target.value)} className="flex-1 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white">
                                        <option value="">Select Ministry...</option>
                                        {ministries.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
                                    </select>
                                    <select title="Select Metric Type" value={defType} onChange={(e) => setDefType(e.target.value as any)} className="w-24 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-3 py-2 text-xs font-bold outline-none focus:ring-2 focus:ring-indigo-500 text-slate-900 dark:text-white">
                                        <option value="number">#</option>
                                        <option value="currency">$</option>
                                    </select>
                                </div>
                                <div className="flex gap-2">
                                    <button onClick={handleSaveDefinition} type="button" className={`flex-1 text-white px-4 py-2 rounded-xl font-bold text-xs transition-colors ${editingDefId ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-indigo-600 hover:bg-indigo-700'}`}>{editingDefId ? 'Update Metric' : 'Add Metric'}</button>
                                    {editingDefId && (<><button onClick={() => handleDeleteDefinition(editingDefId)} type="button" className="bg-rose-100 dark:bg-rose-900/20 text-rose-600 dark:text-rose-400 px-4 py-2 rounded-xl font-bold text-xs hover:bg-rose-200 dark:hover:bg-rose-900/40 transition-colors">Delete</button><button onClick={handleCancelEditDefinition} type="button" className="bg-slate-200 dark:bg-slate-700 text-slate-500 dark:text-slate-300 px-4 py-2 rounded-xl font-bold text-xs hover:bg-slate-300 dark:hover:bg-slate-600 transition-colors">Cancel</button></>)}
                                </div>
                            </div>
                            <div className="space-y-2 max-h-[300px] overflow-y-auto custom-scrollbar">
                                {definitions.map(def => {
                                    const ministryName = ministries.find(m => m.id === def.ministryId)?.name || 'Unknown';
                                    return (
                                        <div key={def.id} className="flex justify-between items-center p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 group hover:bg-slate-50/50 dark:hover:bg-slate-800/50 transition-colors">
                                            <div className="flex flex-col"><div className="flex items-center gap-2"><span className={`px-2 py-0.5 rounded text-[9px] font-black uppercase ${def.type === 'currency' ? 'bg-emerald-100 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400' : 'bg-indigo-100 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400'}`}>{def.type === 'currency' ? '$' : '#'}</span><span className="text-xs font-bold text-slate-700 dark:text-slate-300">{def.name}</span></div><span className="text-[9px] text-slate-400 dark:text-slate-500 font-bold uppercase tracking-widest ml-1">{ministryName}</span></div>
                                            <div className="flex gap-2"><button type="button" onClick={() => handleEditDefinition(def)} className="text-slate-400 dark:text-slate-500 hover:text-indigo-500 dark:hover:text-indigo-400 text-[10px] font-black uppercase transition-colors">Edit</button><button type="button" onClick={() => handleDeleteDefinition(def.id)} className="text-slate-400 dark:text-slate-500 hover:text-rose-500 dark:hover:text-rose-400 text-[10px] font-black uppercase transition-colors">Delete</button></div>
                                        </div>
                                    );
                                })}
                                {definitions.length === 0 && <p className="text-xs text-slate-400 italic text-center">No metrics defined.</p>}
                            </div>
                        </div>
                    </div>
                </>
            )}

            {activeTab === 'Input' && (
                <div className="max-w-2xl mx-auto bg-white dark:bg-slate-850 p-10 rounded-[3rem] border border-slate-100 dark:border-slate-800 shadow-xl transition-colors">
                    <div className="flex gap-4 mb-8">
                        <div className="flex-1"><label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">Date</label><input type="date" title="Entry Date" placeholder="Select date" value={inputDate} onChange={e => setInputDate(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500"/></div>
                        <div className="flex-1"><label className="block text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest mb-2">Ministry</label><select title="Select Ministry" value={selectedMinistryId} onChange={e => setSelectedMinistryId(e.target.value)} className="w-full bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-3 font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500">{ministries.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}{ministries.length === 0 && <option value="">No Ministries Configured</option>}</select></div>
                    </div>
                    <div className="space-y-6">
                        {activeDefinitions.length > 0 ? (
                            activeDefinitions.map(def => (
                                <div key={def.id} className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-700 transition-colors">
                                    <label className="text-sm font-bold text-slate-700 dark:text-slate-300">{def.name}</label>
                                    <div className="relative w-32">{def.type === 'currency' && <span className="absolute left-3 top-2 text-slate-400 dark:text-slate-500 text-xs font-bold">$</span>}<input type="number" value={inputValues[def.id] || ''} onChange={e => handleInputValueChange(def.id, e.target.value)} className={`w-full bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg py-2 ${def.type === 'currency' ? 'pl-6' : 'pl-3'} pr-3 text-right font-bold text-slate-900 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500`} placeholder="0"/></div>
                                </div>
                            ))
                        ) : (<div className="text-center p-8 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700"><p className="text-xs text-slate-400 dark:text-slate-500">{selectedMinistryId ? "No metrics configured for this ministry." : "Select a ministry."} Go to Settings to add some.</p></div>)}
                    </div>
                    <div className="mt-8 flex justify-end"><button onClick={handleSaveEntry} disabled={isSavingEntry || !selectedMinistryId || activeDefinitions.length === 0} className="bg-indigo-600 text-white px-8 py-3 rounded-xl font-black text-xs uppercase tracking-widest hover:bg-indigo-700 transition-all shadow-lg shadow-indigo-200 disabled:opacity-50">{isSavingEntry ? 'Saving...' : 'Save Data'}</button></div>
                </div>
            )}

            {activeTab === 'Dashboard' && (
                <div className="space-y-8">
                    {/* Controls */}
                    <div className="flex justify-end items-center gap-4 bg-white dark:bg-slate-850 p-2 rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm w-fit ml-auto transition-colors">
                        <span className="text-[10px] font-black uppercase text-slate-400 dark:text-slate-500 tracking-widest pl-3">Time Range</span>
                        <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                            {(['Week', 'Month', 'Quarter', 'Year'] as TimeFilter[]).map(tf => (
                                <button key={tf} onClick={() => setTimeFilter(tf)} className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${timeFilter === tf ? 'bg-white dark:bg-slate-700 shadow-sm text-indigo-600 dark:text-indigo-300' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}>{tf}</button>
                            ))}
                        </div>
                    </div>

                    {/* Unified Drag & Drop Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 grid-flow-row-dense">
                        {visibleWidgets.map((id, index) => {
                            let colSpan = 'col-span-1';
                            if (id.startsWith('ministry_') || id === 'city_penetration' || id === 'youtube_channel' || id === 'youtube_latest_video') {
                                colSpan = 'col-span-1 md:col-span-2 lg:col-span-2';
                            }
                            
                            return (
                                <div 
                                    key={id} 
                                    className={`${colSpan} cursor-grab active:cursor-grabbing transition-transform`}
                                    draggable
                                    onDragStart={(e) => handleDragStart(e, index)}
                                    onDragEnter={(e) => handleDragEnter(e, index)}
                                    onDragEnd={handleDragEnd}
                                    onDragOver={handleDragOver}
                                >
                                    {renderWidget(id)}
                                </div>
                            );
                        })}
                        {visibleWidgets.length === 0 && (
                            <div className="col-span-full text-center py-20 bg-slate-50 dark:bg-slate-900 rounded-[3rem] border border-dashed border-slate-200 dark:border-slate-700">
                                <p className="text-slate-400 font-bold mb-2">Dashboard Empty</p>
                                <p className="text-xs text-slate-400 dark:text-slate-500 mt-2">Use the "Customize Layout" button to add widgets.</p>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
};
