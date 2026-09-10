import React, { useState, useEffect } from 'react';
import { GivingBatch, QuickbooksMappingConfig, QuickbooksDepositResult, QuickbooksAccount, QuickbooksClass, FundQuickbooksMapping } from '../types';
import { quickbooksClient } from '../services/quickbooksService';
import { X, Check, AlertCircle, RefreshCw, Landmark, CreditCard, ArrowRight, ExternalLink } from 'lucide-react';

interface GivingDepositPreviewModalProps {
    isOpen: boolean;
    onClose: () => void;
    batch: GivingBatch | null;
    mapping: QuickbooksMappingConfig | null;
    churchId: string;
    userName?: string;
    onConfigureMapping: () => void;
    onDepositSuccess: (batch: GivingBatch, result: QuickbooksDepositResult) => void;
    onMappingSaved?: (mapping: QuickbooksMappingConfig) => void;
}

export const GivingDepositPreviewModal: React.FC<GivingDepositPreviewModalProps> = ({
    isOpen,
    onClose,
    batch,
    mapping,
    churchId,
    userName,
    onConfigureMapping,
    onDepositSuccess,
    onMappingSaved
}) => {
    const [sending, setSending] = useState(false);
    const [loadingAccounts, setLoadingAccounts] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successResult, setSuccessResult] = useState<QuickbooksDepositResult | null>(null);

    const [bankAccounts, setBankAccounts] = useState<QuickbooksAccount[]>([]);
    const [incomeAccounts, setIncomeAccounts] = useState<QuickbooksAccount[]>([]);
    const [classes, setClasses] = useState<QuickbooksClass[]>([]);

    const [depositBankAccountId, setDepositBankAccountId] = useState(mapping?.depositBankAccountId || '');
    const [fundMappings, setFundMappings] = useState<Record<string, FundQuickbooksMapping>>(mapping?.fundMappings || {});
    const [saveAsDefault, setSaveAsDefault] = useState(false);

    useEffect(() => {
        if (isOpen && churchId) {
            setDepositBankAccountId(batch?.quickbooksDepositBankAccountId || mapping?.depositBankAccountId || '');
            
            const initialMap: Record<string, FundQuickbooksMapping> = { ...(mapping?.fundMappings || {}) };
            if (batch?.fundsBreakdown) {
                batch.fundsBreakdown.forEach(f => {
                    const lineKey = f.campusId ? `${f.campusId}_${f.fundId}` : f.fundId;
                    if (mapping?.enableCampusMapping && f.campusId && mapping.campusFundMappings?.[f.campusId]?.[f.fundId]) {
                        initialMap[lineKey] = mapping.campusFundMappings[f.campusId][f.fundId];
                    }
                });
            }
            setFundMappings(initialMap);

            setSaveAsDefault(false);
            setError(null);
            setSuccessResult(null);

            setLoadingAccounts(true);
            quickbooksClient.getAccounts(churchId)
                .then(data => {
                    setBankAccounts(data.bankAccounts || []);
                    setIncomeAccounts(data.incomeAccounts || []);
                    setClasses(data.classes || []);

                    // If no deposit account is currently selected, pick the first available
                    if (!mapping?.depositBankAccountId && !batch?.quickbooksDepositBankAccountId && data.bankAccounts.length > 0) {
                        setDepositBankAccountId(data.bankAccounts[0].id);
                    }
                })
                .catch(e => {
                    console.error('Failed to load accounts for deposit preview:', e);
                })
                .finally(() => {
                    setLoadingAccounts(false);
                });
        }
    }, [isOpen, churchId, batch, mapping]);

    if (!isOpen || !batch) return null;

    const handleFundAccountChange = (lineKey: string, accountId: string) => {
        const acc = incomeAccounts.find(a => a.id === accountId);
        setFundMappings(prev => ({
            ...prev,
            [lineKey]: {
                ...(prev[lineKey] || {}),
                qboAccountId: accountId,
                qboAccountName: acc?.name || ''
            }
        }));
    };

    const handleFundClassChange = (lineKey: string, classId: string) => {
        const cls = classes.find(c => c.id === classId);
        setFundMappings(prev => ({
            ...prev,
            [lineKey]: {
                ...(prev[lineKey] || { qboAccountId: mapping?.defaultIncomeAccountId || '', qboAccountName: mapping?.defaultIncomeAccountName || '' }),
                qboClassId: classId || undefined,
                qboClassName: cls?.name || undefined
            }
        }));
    };

    const unmappedFunds = batch.fundsBreakdown.filter(f => {
        const lineKey = f.campusId ? `${f.campusId}_${f.fundId}` : f.fundId;
        const mapped = fundMappings[lineKey] || fundMappings[f.fundId];
        return f.grossAmount > 0 && !mapped?.qboAccountId && !mapping?.defaultIncomeAccountId;
    });
    const missingBank = !depositBankAccountId;
    const missingFeeAcc = batch.totalFees > 0 && !mapping?.stripeFeeExpenseAccountId;
    const hasConfigError = unmappedFunds.length > 0 || missingBank || missingFeeAcc;

    const handleSend = async () => {
        if (hasConfigError) return;
        setSending(true);
        setError(null);

        try {
            const selectedBank = bankAccounts.find(a => a.id === depositBankAccountId);
            const res = await quickbooksClient.sendDeposit(churchId, batch.id, userName, {
                depositBankAccountId,
                depositBankAccountName: selectedBank?.name || mapping?.depositBankAccountName,
                fundOverrides: fundMappings,
                saveAsDefault
            });

            if (saveAsDefault && onMappingSaved && mapping) {
                onMappingSaved({
                    ...mapping,
                    depositBankAccountId,
                    depositBankAccountName: selectedBank?.name || mapping.depositBankAccountName,
                    fundMappings: {
                        ...(mapping.fundMappings || {}),
                        ...fundMappings
                    }
                });
            }

            setSuccessResult(res.depositResult);
            onDepositSuccess(res.batch, res.depositResult);
        } catch (err: any) {
            setError(err.message || 'Failed to send deposit to QuickBooks');
        } finally {
            setSending(false);
        }
    };

    const money = (n: number) => `$${n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200">
            <div className="relative w-full max-w-2xl bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
                
                {/* Header */}
                <div className="flex items-center justify-between px-6 py-5 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900/50">
                    <div className="flex items-center gap-3">
                        <div className="p-2.5 bg-emerald-100 dark:bg-emerald-950/60 rounded-xl text-emerald-600 dark:text-emerald-400">
                            <Landmark className="w-6 h-6" />
                        </div>
                        <div>
                            <h2 className="text-xl font-bold text-slate-900 dark:text-white">QuickBooks Deposit Preview</h2>
                            <p className="text-xs text-slate-500 dark:text-slate-400">
                                Review how this batch will be posted to your QuickBooks Bank Register.
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

                {/* Body */}
                <div className="p-6 space-y-6 max-h-[75vh] overflow-y-auto">
                    {successResult ? (
                        <div className="text-center py-6 space-y-4">
                            <div className="w-14 h-14 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-full flex items-center justify-center mx-auto">
                                <Check className="w-8 h-8" />
                            </div>
                            <div>
                                <h3 className="text-lg font-bold text-slate-900 dark:text-white">Deposit Created Successfully!</h3>
                                <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">
                                    QuickBooks Deposit #{successResult.depositId} has been posted to your bank register for{' '}
                                    <strong className="text-slate-900 dark:text-white">{money(successResult.totalAmount)}</strong>.
                                </p>
                            </div>

                            <div className="p-4 bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-left text-xs text-emerald-800 dark:text-emerald-300 space-y-1">
                                <p className="font-semibold flex items-center gap-1.5">
                                    <Check className="w-4 h-4 text-emerald-500" />
                                    Bank Feed Ready
                                </p>
                                <p>
                                    When your bank feed downloads this deposit transaction, QuickBooks Online will automatically recognize the net amount and offer the green <strong>Match</strong> button.
                                </p>
                            </div>

                            <div className="flex items-center justify-center gap-3 pt-2">
                                {successResult.qboUrl && (
                                    <a
                                        href={successResult.qboUrl}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="flex items-center gap-1.5 px-4 py-2 text-sm font-semibold text-emerald-700 dark:text-emerald-300 bg-emerald-100 dark:bg-emerald-950/50 hover:bg-emerald-200 rounded-xl transition-colors"
                                    >
                                        <ExternalLink className="w-4 h-4" />
                                        View in QuickBooks
                                    </a>
                                )}
                                <button
                                    onClick={onClose}
                                    className="px-5 py-2 text-sm font-semibold text-white bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 rounded-xl transition-colors"
                                >
                                    Close
                                </button>
                            </div>
                        </div>
                    ) : (
                        <>
                            {/* Summary Card & Deposit Destination Account Selector */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-slate-200 dark:border-slate-800 space-y-3">
                                <div className="grid grid-cols-2 gap-3">
                                    <div>
                                        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Batch Name</span>
                                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate" title={batch.name}>{batch.name}</p>
                                    </div>
                                    <div>
                                        <span className="text-[11px] font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">Date</span>
                                        <p className="font-bold text-sm text-slate-900 dark:text-white">{batch.date.slice(0, 10)}</p>
                                    </div>
                                </div>

                                <div className="pt-3 border-t border-slate-200 dark:border-slate-700">
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                        <Landmark className="w-4 h-4 text-emerald-500" />
                                        Deposit Destination Bank Account *
                                    </label>
                                    <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                                        <select
                                            value={depositBankAccountId}
                                            onChange={(e) => setDepositBankAccountId(e.target.value)}
                                            disabled={loadingAccounts}
                                            className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500 font-medium"
                                        >
                                            <option value="">Select Checking, Bank, or Asset Account...</option>
                                            {bankAccounts.map(a => (
                                                <option key={a.id} value={a.id}>
                                                    {a.name} {a.accountSubType ? `(${a.accountSubType})` : `(${a.accountType})`}
                                                </option>
                                            ))}
                                        </select>
                                    </div>
                                    <div className="mt-2.5 flex items-center gap-2">
                                        <input
                                            type="checkbox"
                                            id="saveAsDefaultDeposit"
                                            checked={saveAsDefault}
                                            onChange={(e) => setSaveAsDefault(e.target.checked)}
                                            className="rounded border-slate-300 dark:border-slate-700 text-emerald-600 focus:ring-emerald-500 w-4 h-4 cursor-pointer"
                                        />
                                        <label htmlFor="saveAsDefaultDeposit" className="text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
                                            Save this deposit account and fund mappings as default for future deposits
                                        </label>
                                    </div>
                                </div>
                            </div>

                            {/* Warnings */}
                            {hasConfigError && (
                                <div className="p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 rounded-xl space-y-2">
                                    <div className="flex items-start gap-2.5 text-amber-800 dark:text-amber-300 text-sm">
                                        <AlertCircle className="w-5 h-5 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
                                        <div>
                                            <p className="font-bold">Configuration Required Before Posting</p>
                                            <ul className="list-disc list-inside text-xs mt-1 space-y-0.5">
                                                {missingBank && <li>Please select a QuickBooks Bank Account to receive deposits above.</li>}
                                                {missingFeeAcc && <li>Please configure a QuickBooks Expense Account for Stripe processing fees.</li>}
                                                {unmappedFunds.map(f => (
                                                    <li key={f.fundId}>
                                                        Fund "{f.fundName}" needs a QuickBooks Income Account (select from dropdown below).
                                                    </li>
                                                ))}
                                            </ul>
                                        </div>
                                    </div>
                                    {missingFeeAcc && (
                                        <div className="pt-1">
                                            <button
                                                type="button"
                                                onClick={onConfigureMapping}
                                                className="text-xs font-bold text-amber-900 dark:text-amber-200 underline hover:no-underline"
                                            >
                                                Open Accounts & Fund Matching Settings →
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {error && (
                                <div className="p-4 bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-900 rounded-xl text-sm text-rose-700 dark:text-rose-300">
                                    <p className="font-bold">Error Posting Deposit</p>
                                    <p className="text-xs mt-1">{error}</p>
                                </div>
                            )}

                            {/* Line Items Table */}
                            <div className="space-y-2">
                                <div className="flex items-center justify-between">
                                    <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                                        1-to-1 Deposit Line Items Breakdown
                                    </h4>
                                    <span className="text-[11px] text-slate-400">
                                        Planning Center Fund ➔ QuickBooks Income Account
                                    </span>
                                </div>
                                <div className="border border-slate-200 dark:border-slate-800 rounded-xl overflow-hidden">
                                    <table className="w-full text-left text-xs border-collapse">
                                        <thead>
                                            <tr className="bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800 font-semibold text-slate-500 dark:text-slate-400">
                                                <th className="px-4 py-2.5">Planning Center Fund</th>
                                                <th className="px-4 py-2.5">QuickBooks Income Account (1-to-1)</th>
                                                <th className="px-4 py-2.5 text-right">Amount</th>
                                            </tr>
                                        </thead>
                                        <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                                            {/* Fund Lines */}
                                            {batch.fundsBreakdown.map((f) => {
                                                const lineKey = f.campusId ? `${f.campusId}_${f.fundId}` : f.fundId;
                                                const fundMap = fundMappings[lineKey] || fundMappings[f.fundId];
                                                const currentAccountId = fundMap?.qboAccountId || (mapping?.defaultIncomeAccountId || '');

                                                return (
                                                    <tr key={lineKey} className="bg-white dark:bg-slate-900 hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                                        <td className="px-4 py-2.5">
                                                            <div className="font-semibold text-slate-900 dark:text-white flex items-center gap-1.5 flex-wrap">
                                                                <span>{f.fundName}</span>
                                                                {f.campusName && (
                                                                    <span className="text-[10px] font-bold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                                                        <span>🏛️</span>
                                                                        <span>{f.campusName}</span>
                                                                    </span>
                                                                )}
                                                            </div>
                                                            <div className="text-[10px] text-slate-400">{f.donationCount} gifts</div>
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            <div className="flex items-center gap-2">
                                                                <select
                                                                    value={currentAccountId}
                                                                    onChange={(e) => handleFundAccountChange(lineKey, e.target.value)}
                                                                    className={`w-full max-w-xs px-2.5 py-1 text-xs rounded-lg border focus:outline-none focus:ring-1 focus:ring-emerald-500 ${
                                                                        currentAccountId 
                                                                            ? 'bg-slate-50 dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-900 dark:text-white' 
                                                                            : 'bg-amber-50 dark:bg-amber-950/40 border-amber-300 dark:border-amber-700 text-amber-900 dark:text-amber-200 font-semibold'
                                                                    }`}
                                                                >
                                                                    <option value="">Select Income Account (1-to-1)...</option>
                                                                    {incomeAccounts.map(a => (
                                                                        <option key={a.id} value={a.id}>{a.name}</option>
                                                                    ))}
                                                                </select>
                                                                {classes.length > 0 && (
                                                                    <select
                                                                        value={fundMap?.qboClassId || ''}
                                                                        onChange={(e) => handleFundClassChange(lineKey, e.target.value)}
                                                                        className="w-28 px-2 py-1 text-xs rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300"
                                                                    >
                                                                        <option value="">No Class</option>
                                                                        {classes.map(c => (
                                                                            <option key={c.id} value={c.id}>{c.name}</option>
                                                                        ))}
                                                                    </select>
                                                                )}
                                                            </div>
                                                        </td>
                                                        <td className="px-4 py-2.5 text-right font-semibold text-slate-900 dark:text-white">
                                                            {money(f.grossAmount)}
                                                        </td>
                                                    </tr>
                                                );
                                            })}

                                            {/* Stripe Fee Negative Line */}
                                            {batch.totalFees > 0 && (
                                                <tr className="bg-amber-50/40 dark:bg-amber-950/20">
                                                    <td className="px-4 py-2.5">
                                                        <div className="font-medium text-amber-900 dark:text-amber-300 flex items-center gap-1.5">
                                                            <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                                                            Stripe Processing Fees
                                                        </div>
                                                        <div className="text-[10px] text-slate-400">Card / ACH processing reduction</div>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <span className={mapping?.stripeFeeExpenseAccountId ? 'text-amber-800 dark:text-amber-300 font-medium' : 'text-rose-500 font-semibold'}>
                                                            {mapping?.stripeFeeExpenseAccountName || 'Unmapped Expense Account'}
                                                        </span>
                                                        {mapping?.stripeVendorName && (
                                                            <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/50 text-amber-700 dark:text-amber-300">
                                                                Vendor: {mapping.stripeVendorName}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 text-right font-semibold text-rose-600 dark:text-rose-400">
                                                        -{money(batch.totalFees)}
                                                    </td>
                                                </tr>
                                            )}
                                        </tbody>
                                        <tfoot>
                                            <tr className="bg-slate-100 dark:bg-slate-800 font-bold border-t border-slate-200 dark:border-slate-700">
                                                <td colSpan={2} className="px-4 py-3 text-slate-900 dark:text-white">
                                                    Net Bank Deposit Total (Hits Bank Feed)
                                                </td>
                                                <td className="px-4 py-3 text-right text-emerald-600 dark:text-emerald-400 text-sm">
                                                    {money(batch.totalNet)}
                                                </td>
                                            </tr>
                                        </tfoot>
                                    </table>
                                </div>
                            </div>
                        </>
                    )}
                </div>

                {/* Footer */}
                {!successResult && (
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
                            onClick={handleSend}
                            disabled={sending || hasConfigError}
                            className="flex items-center gap-2 px-5 py-2 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed rounded-xl shadow-sm transition-colors"
                        >
                            {sending ? (
                                <>
                                    <RefreshCw className="w-4 h-4 animate-spin" />
                                    Sending to QuickBooks...
                                </>
                            ) : (
                                <>
                                    <Landmark className="w-4 h-4" />
                                    Send Deposit to QuickBooks
                                </>
                            )}
                        </button>
                    </div>
                )}

            </div>
        </div>
    );
};
