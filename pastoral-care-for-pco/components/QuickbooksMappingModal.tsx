import React, { useState, useEffect } from 'react';
import { 
    PcoFund, QuickbooksAccount, QuickbooksClass, 
    QuickbooksVendor, QuickbooksMappingConfig, FundQuickbooksMapping 
} from '../types';
import { quickbooksClient } from '../services/quickbooksService';
import { firestore } from '../services/firestoreService';
import { X, Check, AlertCircle, Sparkles, RefreshCw, Landmark, CreditCard, ArrowRight, Search } from 'lucide-react';

interface QuickbooksMappingModalProps {
    isOpen: boolean;
    onClose: () => void;
    churchId: string;
    funds: PcoFund[];
    onMappingSaved: (mapping: QuickbooksMappingConfig) => void;
}

export const QuickbooksMappingModal: React.FC<QuickbooksMappingModalProps> = ({
    isOpen,
    onClose,
    churchId,
    funds,
    onMappingSaved
}) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [allFunds, setAllFunds] = useState<PcoFund[]>(funds || []);
    const [fundSearch, setFundSearch] = useState('');

    const [bankAccounts, setBankAccounts] = useState<QuickbooksAccount[]>([]);
    const [incomeAccounts, setIncomeAccounts] = useState<QuickbooksAccount[]>([]);
    const [expenseAccounts, setExpenseAccounts] = useState<QuickbooksAccount[]>([]);
    const [classes, setClasses] = useState<QuickbooksClass[]>([]);
    const [vendors, setVendors] = useState<QuickbooksVendor[]>([]);

    const [depositBankAccountId, setDepositBankAccountId] = useState('');
    const [stripeFeeExpenseAccountId, setStripeFeeExpenseAccountId] = useState('');
    const [stripeVendorId, setStripeVendorId] = useState('');
    const [defaultIncomeAccountId, setDefaultIncomeAccountId] = useState('');
    const [fundMappings, setFundMappings] = useState<Record<string, FundQuickbooksMapping>>({});
    const [cutoffDate, setCutoffDate] = useState('');

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [accountsData, existingMapping, dbFunds] = await Promise.all([
                quickbooksClient.getAccounts(churchId),
                quickbooksClient.getMapping(churchId),
                firestore.getFunds(churchId).catch(() => [])
            ]);

            // Combine unique funds by ID
            const fundMap = new Map<string, PcoFund>();
            (funds || []).forEach(f => fundMap.set(f.id, f));
            (dbFunds || []).forEach((f: PcoFund) => fundMap.set(f.id, f));
            // Also include any funds already mapped in existingMapping
            if (existingMapping?.fundMappings) {
                Object.keys(existingMapping.fundMappings).forEach(fId => {
                    if (!fundMap.has(fId)) {
                        fundMap.set(fId, { id: fId, churchId, name: `Fund (${fId})` });
                    }
                });
            }
            setAllFunds(Array.from(fundMap.values()));

            setBankAccounts(accountsData.bankAccounts || []);
            setIncomeAccounts(accountsData.incomeAccounts || []);
            setExpenseAccounts(accountsData.expenseAccounts || []);
            setClasses(accountsData.classes || []);
            setVendors(accountsData.vendors || []);

            if (existingMapping) {
                setDepositBankAccountId(existingMapping.depositBankAccountId || '');
                setStripeFeeExpenseAccountId(existingMapping.stripeFeeExpenseAccountId || '');
                setStripeVendorId(existingMapping.stripeVendorId || '');
                setDefaultIncomeAccountId(existingMapping.defaultIncomeAccountId || '');
                setFundMappings(existingMapping.fundMappings || {});
                setCutoffDate(existingMapping.cutoffDate || '');
            } else {
                // Pre-select first bank and fee account if available
                if (accountsData.bankAccounts.length > 0) {
                    setDepositBankAccountId(accountsData.bankAccounts[0].id);
                }
                const feeMatch = accountsData.expenseAccounts.find(a => 
                    /merchant|processing|credit card|stripe|bank fee/i.test(a.name)
                );
                if (feeMatch) {
                    setStripeFeeExpenseAccountId(feeMatch.id);
                }
                const stripeVendor = accountsData.vendors.find(v => /stripe/i.test(v.displayName));
                if (stripeVendor) {
                    setStripeVendorId(stripeVendor.id);
                }
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load QuickBooks Chart of Accounts.');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (isOpen) {
            loadData();
        }
    }, [isOpen, churchId]);

    const handleAutoMatch = () => {
        const newMappings = { ...fundMappings };
        let matchedCount = 0;
        allFunds.forEach(fund => {
            const cleanFundName = fund.name.toLowerCase().trim();
            const matchedAccount = incomeAccounts.find(acc => {
                const cleanAccName = acc.name.toLowerCase().trim();
                return cleanAccName === cleanFundName ||
                    cleanAccName.includes(cleanFundName) || 
                    cleanFundName.includes(cleanAccName);
            });

            if (matchedAccount) {
                newMappings[fund.id] = {
                    ...(newMappings[fund.id] || {}),
                    qboAccountId: matchedAccount.id,
                    qboAccountName: matchedAccount.name
                };
                matchedCount++;
            }
        });
        setFundMappings(newMappings);
        setSuccessMessage(`Auto-matched ${matchedCount} funds to QuickBooks income accounts.`);
        setTimeout(() => setSuccessMessage(null), 3000);
    };

    const handleFundAccountChange = (fund: PcoFund, accountId: string) => {
        const account = incomeAccounts.find(a => a.id === accountId);
        setFundMappings(prev => ({
            ...prev,
            [fund.id]: {
                ...(prev[fund.id] || {}),
                qboAccountId: accountId,
                qboAccountName: account?.name || ''
            }
        }));
    };

    const handleFundClassChange = (fund: PcoFund, classId: string) => {
        const qboClass = classes.find(c => c.id === classId);
        setFundMappings(prev => ({
            ...prev,
            [fund.id]: {
                ...(prev[fund.id] || { qboAccountId: defaultIncomeAccountId, qboAccountName: '' }),
                qboClassId: classId || undefined,
                qboClassName: qboClass?.name || undefined
            }
        }));
    };

    const handleSave = async () => {
        if (!depositBankAccountId) {
            setError('Please select a QuickBooks Bank Account to receive deposits.');
            return;
        }
        if (!stripeFeeExpenseAccountId) {
            setError('Please select a QuickBooks Expense Account for Stripe card processing fees.');
            return;
        }

        setSaving(true);
        setError(null);
        try {
            const bankAcc = bankAccounts.find(a => a.id === depositBankAccountId);
            const feeAcc = expenseAccounts.find(a => a.id === stripeFeeExpenseAccountId);
            const vendor = vendors.find(v => v.id === stripeVendorId);
            const defIncome = incomeAccounts.find(a => a.id === defaultIncomeAccountId);

            const payload: QuickbooksMappingConfig = {
                churchId,
                depositBankAccountId,
                depositBankAccountName: bankAcc?.name,
                stripeFeeExpenseAccountId,
                stripeFeeExpenseAccountName: feeAcc?.name,
                stripeVendorId: stripeVendorId || undefined,
                stripeVendorName: vendor?.displayName,
                defaultIncomeAccountId: defaultIncomeAccountId || undefined,
                defaultIncomeAccountName: defIncome?.name,
                fundMappings,
                cutoffDate: cutoffDate.trim() || undefined
            };

            const saved = await quickbooksClient.saveMapping(churchId, payload);
            onMappingSaved(saved);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to save QuickBooks mappings.');
        } finally {
            setSaving(false);
        }
    };

    if (!isOpen) return null;

    const mappedCount = allFunds.filter(f => fundMappings[f.id]?.qboAccountId).length;
    const filteredFunds = allFunds.filter(fund => {
        if (!fundSearch.trim()) return true;
        const q = fundSearch.toLowerCase();
        return fund.name.toLowerCase().includes(q) || fund.id.toLowerCase().includes(q);
    });

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-4xl max-h-[90vh] flex flex-col bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                            <Landmark className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">QuickBooks Accounts & 1-to-1 Fund Mapping</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Specify your deposit destination account and map Planning Center funds 1-to-1 to QuickBooks Income accounts.
                            </p>
                        </div>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 rounded-lg transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {loading ? (
                        <div className="flex flex-col items-center justify-center py-16 space-y-3">
                            <RefreshCw className="w-8 h-8 text-emerald-500 animate-spin" />
                            <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                                Fetching Chart of Accounts from QuickBooks Online...
                            </p>
                        </div>
                    ) : error ? (
                        <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl flex items-start gap-3">
                            <AlertCircle className="w-5 h-5 text-rose-600 dark:text-rose-400 shrink-0 mt-0.5" />
                            <div className="text-sm text-rose-700 dark:text-rose-300">
                                <p className="font-semibold">Unable to load accounts</p>
                                <p>{error}</p>
                            </div>
                        </div>
                    ) : (
                        <>
                            {successMessage && (
                                <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 rounded-xl text-sm text-emerald-700 dark:text-emerald-300 flex items-center gap-2">
                                    <Check className="w-4 h-4 text-emerald-500" />
                                    <span>{successMessage}</span>
                                </div>
                            )}

                            {/* Bank & Fee Account Setup */}
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-800">
                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                        <Landmark className="w-4 h-4 text-emerald-500" />
                                        Default QuickBooks Deposit Account *
                                    </label>
                                    <select
                                        value={depositBankAccountId}
                                        onChange={(e) => setDepositBankAccountId(e.target.value)}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    >
                                        <option value="">Select Checking, Bank, or Asset Account...</option>
                                        {bankAccounts.map(a => (
                                            <option key={a.id} value={a.id}>
                                                {a.name} {a.accountSubType ? `(${a.accountSubType})` : `(${a.accountType})`}
                                            </option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                        The full net batch deposit lands in this account. You can also specify or change the deposit account on any batch before sending.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                        <CreditCard className="w-4 h-4 text-amber-500" />
                                        Stripe Fee Expense Account *
                                    </label>
                                    <select
                                        value={stripeFeeExpenseAccountId}
                                        onChange={(e) => setStripeFeeExpenseAccountId(e.target.value)}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    >
                                        <option value="">Select Merchant Fee Expense Account...</option>
                                        {expenseAccounts.map(a => (
                                            <option key={a.id} value={a.id}>{a.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                        Credit card & ACH fees will be deducted as a line item on the deposit to match net bank receipts.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                                        Stripe Payee / Vendor (Optional)
                                    </label>
                                    <select
                                        value={stripeVendorId}
                                        onChange={(e) => setStripeVendorId(e.target.value)}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    >
                                        <option value="">No vendor selected</option>
                                        {vendors.map(v => (
                                            <option key={v.id} value={v.id}>{v.displayName}</option>
                                        ))}
                                    </select>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                                        Fallback Income Account (If unmapped)
                                    </label>
                                    <select
                                        value={defaultIncomeAccountId}
                                        onChange={(e) => setDefaultIncomeAccountId(e.target.value)}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    >
                                        <option value="">Select Fallback Income Account...</option>
                                        {incomeAccounts.map(a => (
                                            <option key={a.id} value={a.id}>{a.name}</option>
                                        ))}
                                    </select>
                                </div>

                                <div className="md:col-span-2 pt-2 border-t border-slate-200 dark:border-slate-700">
                                    <div className="flex items-center justify-between mb-1.5">
                                        <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                                            QuickBooks Batch Sync Date Cutoff (Optional)
                                        </label>
                                        {cutoffDate && (
                                            <button
                                                type="button"
                                                onClick={() => setCutoffDate('')}
                                                className="text-[11px] text-rose-600 dark:text-rose-400 hover:underline font-medium"
                                            >
                                                Clear Cutoff (Show All)
                                            </button>
                                        )}
                                    </div>
                                    <input
                                        type="date"
                                        value={cutoffDate}
                                        onChange={(e) => setCutoffDate(e.target.value)}
                                        className="w-full md:w-64 px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    />
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                        Batches dated before this cutoff will be hidden so older manual batches don't clutter your QuickBooks deposit dashboard.
                                    </p>
                                </div>
                            </div>

                            {/* 1-to-1 Fund Matching Table */}
                            <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            1-to-1 Fund Mapping: Planning Center to QuickBooks Income
                                            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                {mappedCount} of {allFunds.length} mapped
                                            </span>
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            Each Planning Center fund line in a batch is credited 1-to-1 to its mapped QuickBooks Income account.
                                        </p>
                                    </div>

                                    <div className="flex items-center gap-2">
                                        <div className="relative">
                                            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
                                            <input
                                                type="text"
                                                placeholder="Search funds..."
                                                value={fundSearch}
                                                onChange={(e) => setFundSearch(e.target.value)}
                                                className="pl-8 pr-3 py-1.5 text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 w-44"
                                            />
                                        </div>
                                        <button
                                            type="button"
                                            onClick={handleAutoMatch}
                                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-50 dark:bg-emerald-950/50 hover:bg-emerald-100 dark:hover:bg-emerald-900/50 rounded-lg transition-colors border border-emerald-200 dark:border-emerald-800 shrink-0"
                                        >
                                            <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
                                            Auto-Match by Name
                                        </button>
                                    </div>
                                </div>

                                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                                    <table className="w-full text-left border-collapse text-sm">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-slate-800/75 border-b border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
                                                <th className="px-4 py-3">Planning Center Giving Fund</th>
                                                <th className="px-4 py-3">QuickBooks Income Account (1-to-1) *</th>
                                                {classes.length > 0 && (
                                                    <th className="px-4 py-3">QuickBooks Class (Optional)</th>
                                                )}
                                                <th className="px-3 py-3 w-20 text-center">Status</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800 bg-white dark:bg-slate-900">
                                            {filteredFunds.length === 0 ? (
                                                <tr>
                                                    <td colSpan={classes.length > 0 ? 4 : 3} className="px-4 py-8 text-center text-xs text-slate-400">
                                                        No Planning Center funds found matching your search.
                                                    </td>
                                                </tr>
                                            ) : (
                                                filteredFunds.map((fund) => {
                                                    const mapping = fundMappings[fund.id] || { qboAccountId: '' };
                                                    const isMapped = !!mapping.qboAccountId;

                                                    return (
                                                        <tr key={fund.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                                            <td className="px-4 py-3">
                                                                <div className="font-semibold text-slate-900 dark:text-white">
                                                                    {fund.name}
                                                                </div>
                                                                <div className="text-[11px] text-slate-400 font-mono">
                                                                    ID: {fund.id}
                                                                </div>
                                                            </td>
                                                            <td className="px-4 py-3">
                                                                <select
                                                                    value={mapping.qboAccountId || ''}
                                                                    onChange={(e) => handleFundAccountChange(fund, e.target.value)}
                                                                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                                >
                                                                    <option value="">Select QuickBooks Income Account...</option>
                                                                    {incomeAccounts.map(a => (
                                                                        <option key={a.id} value={a.id}>{a.name}</option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            {classes.length > 0 && (
                                                                <td className="px-4 py-3">
                                                                    <select
                                                                        value={mapping.qboClassId || ''}
                                                                        onChange={(e) => handleFundClassChange(fund, e.target.value)}
                                                                        className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                                    >
                                                                        <option value="">None</option>
                                                                        {classes.map(c => (
                                                                            <option key={c.id} value={c.id}>{c.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </td>
                                                            )}
                                                            <td className="px-3 py-3 text-center">
                                                                {isMapped ? (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400" title="Mapped 1-to-1">
                                                                        <Check className="w-3 h-3" />
                                                                        Mapped
                                                                    </span>
                                                                ) : defaultIncomeAccountId ? (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-sky-100 dark:bg-sky-950/60 text-sky-600 dark:text-sky-400" title="Using Default Fallback">
                                                                        Fallback
                                                                    </span>
                                                                ) : (
                                                                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-amber-100 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400" title="Unmapped">
                                                                        <AlertCircle className="w-3 h-3" />
                                                                        Unmapped
                                                                    </span>
                                                                )}
                                                            </td>
                                                        </tr>
                                                    );
                                                })
                                            )}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                <div className="flex items-center justify-between px-6 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                    <button
                        type="button"
                        onClick={onClose}
                        className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        onClick={handleSave}
                        disabled={saving || loading}
                        className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-sm transition-colors"
                    >
                        {saving ? (
                            <>
                                <RefreshCw className="w-4 h-4 animate-spin" />
                                Saving Mappings...
                            </>
                        ) : (
                            <>
                                <Check className="w-4 h-4" />
                                Save Configuration
                            </>
                        )}
                    </button>
                </div>

            </div>
        </div>
    );
};
