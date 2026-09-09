import React, { useState, useEffect, useMemo } from 'react';
import { 
    GivingBatch, PcoFund, DetailedDonation, 
    QuickbooksMappingConfig, QuickbooksStatusResponse, QuickbooksDepositResult 
} from '../types';
import { firestore } from '../services/firestoreService';
import { quickbooksClient } from '../services/quickbooksService';
import { QuickbooksMappingModal } from './QuickbooksMappingModal';
import { GivingDepositPreviewModal } from './GivingDepositPreviewModal';
import { 
    Landmark, CreditCard, CheckCircle2, AlertCircle, RefreshCw, 
    Settings, Search, ArrowUpRight, Check, ExternalLink, Calendar,
    DollarSign, Filter, Layers, ChevronRight
} from 'lucide-react';

interface GivingBatchesViewProps {
    churchId: string;
    funds: PcoFund[];
    donations: DetailedDonation[];
    userName?: string;
    onSyncRecent?: () => void;
    isSyncing?: boolean;
}

export const GivingBatchesView: React.FC<GivingBatchesViewProps> = ({
    churchId,
    funds,
    donations,
    userName,
    onSyncRecent,
    isSyncing = false
}) => {
    const [batches, setBatches] = useState<GivingBatch[]>([]);
    const [loadingBatches, setLoadingBatches] = useState(true);
    const [qboStatus, setQboStatus] = useState<QuickbooksStatusResponse | null>(null);
    const [mapping, setMapping] = useState<QuickbooksMappingConfig | null>(null);
    const [isMappingModalOpen, setIsMappingModalOpen] = useState(false);
    const [previewBatch, setPreviewBatch] = useState<GivingBatch | null>(null);

    const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'synced' | 'stripe' | 'manual'>('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    // Check URL parameters for OAuth callbacks
    useEffect(() => {
        const url = new URL(window.location.href);
        if (url.searchParams.get('qbo') === 'connected') {
            setActionMessage({ type: 'success', text: 'QuickBooks Online connected successfully!' });
            url.searchParams.delete('qbo');
            window.history.replaceState({}, '', url.toString());
        } else if (url.searchParams.get('qbo_error')) {
            const err = url.searchParams.get('qbo_error') || 'Unknown error connecting to QuickBooks';
            setActionMessage({ type: 'error', text: `QuickBooks connection failed: ${err}` });
            url.searchParams.delete('qbo_error');
            window.history.replaceState({}, '', url.toString());
        }
    }, []);

    const loadQboInfo = async () => {
        try {
            const [status, mapConfig] = await Promise.all([
                quickbooksClient.getStatus(churchId),
                quickbooksClient.getMapping(churchId)
            ]);
            setQboStatus(status);
            setMapping(mapConfig);
        } catch (e: any) {
            console.error('Failed to load QuickBooks status/mapping:', e);
        }
    };

    const loadBatches = async () => {
        setLoadingBatches(true);
        try {
            const fetched = await firestore.getGivingBatches(churchId);
            setBatches(fetched);
        } catch (e) {
            console.error('Failed to load giving batches:', e);
        } finally {
            setLoadingBatches(false);
        }
    };

    useEffect(() => {
        if (churchId) {
            loadQboInfo();
            loadBatches();
        }
    }, [churchId]);

    const handleConnectQbo = () => {
        quickbooksClient.connect(churchId);
    };

    const handleDisconnectQbo = async () => {
        if (!window.confirm('Are you sure you want to disconnect QuickBooks Online?')) return;
        try {
            await quickbooksClient.disconnect(churchId);
            setQboStatus({ connected: false, hasMapping: false });
            setActionMessage({ type: 'success', text: 'Disconnected from QuickBooks Online.' });
        } catch (err: any) {
            setActionMessage({ type: 'error', text: err.message || 'Failed to disconnect QuickBooks' });
        }
    };

    const handleDepositSuccess = (updatedBatch: GivingBatch, result: QuickbooksDepositResult) => {
        setBatches(prev => prev.map(b => b.id === updatedBatch.id ? updatedBatch : b));
        setActionMessage({
            type: 'success',
            text: `Batch "${updatedBatch.name}" was successfully deposited into QuickBooks (Deposit #${result.depositId})!`
        });
    };

    // Calculate aggregated metrics
    const metrics = useMemo(() => {
        let gross = 0;
        let fees = 0;
        let syncedCount = 0;
        let pendingCount = 0;

        batches.forEach(b => {
            gross += b.totalGross || 0;
            fees += b.totalFees || 0;
            if (b.status === 'synced_to_qbo') syncedCount++;
            else pendingCount++;
        });

        return {
            totalBatches: batches.length,
            gross,
            fees,
            net: gross - fees,
            syncedCount,
            pendingCount
        };
    }, [batches]);

    // Filtered batches
    const filteredBatches = useMemo(() => {
        return batches.filter(b => {
            if (statusFilter === 'pending' && b.status === 'synced_to_qbo') return false;
            if (statusFilter === 'synced' && b.status !== 'synced_to_qbo') return false;
            if (statusFilter === 'stripe' && b.batchType !== 'stripe') return false;
            if (statusFilter === 'manual' && b.batchType !== 'manual') return false;

            if (searchQuery.trim()) {
                const query = searchQuery.toLowerCase();
                const nameMatches = b.name.toLowerCase().includes(query);
                const fundMatches = b.fundsBreakdown.some(f => f.fundName.toLowerCase().includes(query));
                if (!nameMatches && !fundMatches) return false;
            }

            return true;
        });
    }, [batches, statusFilter, searchQuery]);

    const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <div className="space-y-6 animate-in fade-in duration-200">
            {/* Action Banner Message */}
            {actionMessage && (
                <div className={`p-4 rounded-xl border flex items-center justify-between transition-all ${
                    actionMessage.type === 'success' 
                        ? 'bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800 text-emerald-800 dark:text-emerald-200' 
                        : 'bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800 text-rose-800 dark:text-rose-200'
                }`}>
                    <div className="flex items-center gap-2 text-sm font-medium">
                        {actionMessage.type === 'success' ? <CheckCircle2 className="w-5 h-5 text-emerald-600" /> : <AlertCircle className="w-5 h-5 text-rose-600" />}
                        <span>{actionMessage.text}</span>
                    </div>
                    <button onClick={() => setActionMessage(null)} className="text-xs opacity-60 hover:opacity-100">
                        Dismiss
                    </button>
                </div>
            )}

            {/* QuickBooks Connection Strip */}
            <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <div className={`p-3 rounded-xl flex items-center justify-center ${
                        qboStatus?.connected 
                            ? 'bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400' 
                            : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                    }`}>
                        <Landmark className="w-7 h-7" />
                    </div>
                    <div>
                        <div className="flex items-center gap-2">
                            <h2 className="text-base font-bold text-slate-900 dark:text-white">QuickBooks Online Integration</h2>
                            {qboStatus?.connected ? (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                                    Connected
                                </span>
                            ) : (
                                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700">
                                    Disconnected
                                </span>
                            )}
                        </div>
                        <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                            {qboStatus?.connected ? (
                                <>
                                    Connected to company: <strong className="text-slate-700 dark:text-slate-300">{qboStatus.companyName}</strong> (ID: {qboStatus.realmId}). Deposits match bank feed entries automatically.
                                </>
                            ) : (
                                'Connect your QuickBooks Online company to sync batch deposits with fund breakdowns and Stripe fees.'
                            )}
                        </p>
                    </div>
                </div>

                <div className="flex items-center gap-2.5">
                    {qboStatus?.connected ? (
                        <>
                            <button
                                type="button"
                                onClick={() => setIsMappingModalOpen(true)}
                                className="flex items-center gap-1.5 px-3.5 py-2 text-xs font-semibold text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors"
                            >
                                <Settings className="w-4 h-4 text-slate-500" />
                                Accounts & Fund Matching
                            </button>
                            <button
                                type="button"
                                onClick={handleDisconnectQbo}
                                className="px-3 py-2 text-xs font-medium text-slate-500 hover:text-rose-600 transition-colors"
                            >
                                Disconnect
                            </button>
                        </>
                    ) : (
                        <button
                            type="button"
                            onClick={handleConnectQbo}
                            className="flex items-center gap-2 px-4 py-2 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl shadow-sm transition-colors"
                        >
                            <Landmark className="w-4 h-4" />
                            Connect to QuickBooks
                        </button>
                    )}
                </div>
            </div>

            {/* Metrics Ribbon */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Total Batches</span>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{metrics.totalBatches}</div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                        {metrics.syncedCount} synced to QBO • {metrics.pendingCount} pending
                    </p>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">Gross Donations</span>
                    <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">{money(metrics.gross)}</div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Total across all funds</p>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-xs font-semibold uppercase tracking-wider text-amber-600 dark:text-amber-400">Stripe Card Fees</span>
                    <div className="text-2xl font-bold text-rose-600 dark:text-rose-400 mt-1">-{money(metrics.fees)}</div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Deducted as QBO expense</p>
                </div>

                <div className="p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <span className="text-xs font-semibold uppercase tracking-wider text-emerald-600 dark:text-emerald-400">Net Bank Deposits</span>
                    <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400 mt-1">{money(metrics.net)}</div>
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">Exact amount hitting bank feed</p>
                </div>
            </div>

            {/* Filter and Table Card */}
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                {/* Search & Tabs Toolbar */}
                <div className="p-4 border-b border-slate-200 dark:border-slate-800 flex flex-col md:flex-row md:items-center justify-between gap-3">
                    <div className="flex items-center gap-1 overflow-x-auto">
                        {(['all', 'pending', 'synced', 'stripe', 'manual'] as const).map(tab => (
                            <button
                                key={tab}
                                onClick={() => setStatusFilter(tab)}
                                className={`px-3 py-1.5 rounded-lg text-xs font-semibold capitalize transition-colors whitespace-nowrap ${
                                    statusFilter === tab 
                                        ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900' 
                                        : 'text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                }`}
                            >
                                {tab === 'all' ? 'All Batches' : tab === 'pending' ? 'Pending Deposit' : tab === 'synced' ? 'Synced to QBO' : tab === 'stripe' ? 'Stripe Online' : 'Manual Cash/Checks'}
                            </button>
                        ))}
                    </div>

                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                            <input
                                type="text"
                                placeholder="Search by batch name or fund..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="pl-9 pr-3 py-1.5 text-xs bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-slate-900 dark:text-white placeholder-slate-400 focus:outline-none focus:ring-1 focus:ring-emerald-500 w-60"
                            />
                        </div>

                        {onSyncRecent && (
                            <button
                                type="button"
                                onClick={() => onSyncRecent()}
                                disabled={isSyncing}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 rounded-lg transition-colors disabled:opacity-50"
                            >
                                <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin' : ''}`} />
                                Refresh Batches
                            </button>
                        )}
                    </div>
                </div>

                {/* Batches Table */}
                <div className="overflow-x-auto">
                    {loadingBatches ? (
                        <div className="py-16 text-center text-slate-500 dark:text-slate-400">
                            <RefreshCw className="w-6 h-6 animate-spin mx-auto text-emerald-500 mb-2" />
                            Loading giving batches...
                        </div>
                    ) : filteredBatches.length === 0 ? (
                        <div className="py-16 text-center text-slate-400 dark:text-slate-500 space-y-2">
                            <Layers className="w-10 h-10 mx-auto opacity-40" />
                            <p className="text-sm font-medium">No giving batches found.</p>
                            <p className="text-xs">Try refreshing batches or adjusting your filters.</p>
                        </div>
                    ) : (
                        <table className="w-full text-left text-xs border-collapse">
                            <thead>
                                <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 font-semibold uppercase tracking-wider">
                                    <th className="px-5 py-3">Date & Batch</th>
                                    <th className="px-4 py-3">Type</th>
                                    <th className="px-4 py-3">Fund Breakdown</th>
                                    <th className="px-4 py-3 text-right">Gross Amount</th>
                                    <th className="px-4 py-3 text-right">Stripe Fees</th>
                                    <th className="px-4 py-3 text-right font-bold text-slate-700 dark:text-slate-300">Net Bank Deposit</th>
                                    <th className="px-4 py-3 text-center">Status</th>
                                    <th className="px-5 py-3 text-right">Action</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                {filteredBatches.map(batch => {
                                    const isSynced = batch.status === 'synced_to_qbo';
                                    const hasFees = (batch.totalFees || 0) > 0;

                                    return (
                                        <tr key={batch.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                            {/* Date & Batch */}
                                            <td className="px-5 py-3.5">
                                                <div className="font-bold text-sm text-slate-900 dark:text-white flex items-center gap-1.5">
                                                    {batch.name}
                                                </div>
                                                <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                                    <Calendar className="w-3 h-3" />
                                                    {batch.date.slice(0, 10)} • {batch.donationCount} {batch.donationCount === 1 ? 'gift' : 'gifts'}
                                                </div>
                                            </td>

                                            {/* Type Badge */}
                                            <td className="px-4 py-3.5">
                                                {batch.batchType === 'stripe' ? (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-purple-50 dark:bg-purple-950/40 text-purple-700 dark:text-purple-300 border border-purple-200 dark:border-purple-800">
                                                        <CreditCard className="w-3 h-3" />
                                                        Stripe Online
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 border border-blue-200 dark:border-blue-800">
                                                        <DollarSign className="w-3 h-3" />
                                                        Cash / Checks
                                                    </span>
                                                )}
                                            </td>

                                            {/* Fund Breakdown Chips */}
                                            <td className="px-4 py-3.5 max-w-xs">
                                                <div className="flex flex-wrap gap-1">
                                                    {batch.fundsBreakdown.map(f => (
                                                        <span 
                                                            key={f.fundId}
                                                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700"
                                                        >
                                                            <span>{f.fundName}:</span>
                                                            <span className="text-slate-900 dark:text-white">{money(f.grossAmount)}</span>
                                                        </span>
                                                    ))}
                                                </div>
                                            </td>

                                            {/* Gross Amount */}
                                            <td className="px-4 py-3.5 text-right font-semibold text-slate-900 dark:text-white">
                                                {money(batch.totalGross)}
                                            </td>

                                            {/* Stripe Fees */}
                                            <td className="px-4 py-3.5 text-right">
                                                {hasFees ? (
                                                    <span className="font-semibold text-rose-600 dark:text-rose-400">
                                                        -{money(batch.totalFees)}
                                                    </span>
                                                ) : (
                                                    <span className="text-slate-400">—</span>
                                                )}
                                            </td>

                                            {/* Net Bank Deposit */}
                                            <td className="px-4 py-3.5 text-right font-bold text-emerald-600 dark:text-emerald-400 text-sm">
                                                {money(batch.totalNet)}
                                            </td>

                                            {/* Status Badge */}
                                            <td className="px-4 py-3.5 text-center">
                                                {isSynced ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                        <Check className="w-3 h-3" />
                                                        Deposit #{batch.quickbooksDepositId}
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                                                        Ready to Send
                                                    </span>
                                                )}
                                            </td>

                                            {/* Action Button */}
                                            <td className="px-5 py-3.5 text-right">
                                                <button
                                                    type="button"
                                                    onClick={() => setPreviewBatch(batch)}
                                                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold shadow-sm transition-colors ${
                                                        isSynced 
                                                            ? 'text-slate-700 dark:text-slate-200 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200' 
                                                            : 'text-white bg-emerald-600 hover:bg-emerald-700'
                                                    }`}
                                                >
                                                    {isSynced ? 'View Deposit' : 'Preview & Deposit'}
                                                    <ChevronRight className="w-3.5 h-3.5" />
                                                </button>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    )}
                </div>
            </div>

            {/* Account & Fund Matching Modal */}
            <QuickbooksMappingModal
                isOpen={isMappingModalOpen}
                onClose={() => setIsMappingModalOpen(false)}
                churchId={churchId}
                funds={funds}
                onMappingSaved={(newMapping) => {
                    setMapping(newMapping);
                    setActionMessage({ type: 'success', text: 'QuickBooks accounts & fund mappings saved successfully!' });
                }}
            />

            {/* Deposit Preview & Send Modal */}
            <GivingDepositPreviewModal
                isOpen={!!previewBatch}
                onClose={() => setPreviewBatch(null)}
                batch={previewBatch}
                mapping={mapping}
                churchId={churchId}
                userName={userName}
                onConfigureMapping={() => {
                    setPreviewBatch(null);
                    setIsMappingModalOpen(true);
                }}
                onDepositSuccess={handleDepositSuccess}
            />
        </div>
    );
};
