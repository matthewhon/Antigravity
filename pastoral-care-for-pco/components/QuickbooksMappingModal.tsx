import React, { useState, useEffect } from 'react';
import { 
    PcoFund, PcoCampus, QuickbooksAccount, QuickbooksClass, 
    QuickbooksVendor, QuickbooksMappingConfig, FundQuickbooksMapping 
} from '../types';
import { quickbooksClient } from '../services/quickbooksService';
import { firestore } from '../services/firestoreService';
import { pcoService } from '../services/pcoService';
import { 
    X, Check, AlertCircle, Sparkles, RefreshCw, Landmark, CreditCard, 
    ArrowRight, Search, Building2, Copy, Mail, Users, Send, Bell
} from 'lucide-react';

interface QuickbooksMappingModalProps {
    isOpen: boolean;
    onClose: () => void;
    churchId: string;
    funds: PcoFund[];
    campuses?: PcoCampus[];
    onMappingSaved: (mapping: QuickbooksMappingConfig) => void;
}

export const QuickbooksMappingModal: React.FC<QuickbooksMappingModalProps> = ({
    isOpen,
    onClose,
    churchId,
    funds,
    campuses,
    onMappingSaved
}) => {
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);

    const [allFunds, setAllFunds] = useState<PcoFund[]>(funds || []);
    const [campusesList, setCampusesList] = useState<PcoCampus[]>(campuses || []);
    const [fundSearch, setFundSearch] = useState('');

    const [bankAccounts, setBankAccounts] = useState<QuickbooksAccount[]>([]);
    const [incomeAccounts, setIncomeAccounts] = useState<QuickbooksAccount[]>([]);
    const [expenseAccounts, setExpenseAccounts] = useState<QuickbooksAccount[]>([]);
    const [classes, setClasses] = useState<QuickbooksClass[]>([]);
    const [vendors, setVendors] = useState<QuickbooksVendor[]>([]);

    const [depositBankAccountId, setDepositBankAccountId] = useState('');
    const [stripeFeeExpenseAccountId, setStripeFeeExpenseAccountId] = useState('');
    const [stripeVendorId, setStripeVendorId] = useState('');
    const [tithelyFeeExpenseAccountId, setTithelyFeeExpenseAccountId] = useState('');
    const [tithelyVendorId, setTithelyVendorId] = useState('');
    const [defaultIncomeAccountId, setDefaultIncomeAccountId] = useState('');
    const [fundMappings, setFundMappings] = useState<Record<string, FundQuickbooksMapping>>({});
    const [enableCampusMapping, setEnableCampusMapping] = useState(false);
    const [campusFundMappings, setCampusFundMappings] = useState<Record<string, Record<string, FundQuickbooksMapping>>>({});
    const [selectedCampusTab, setSelectedCampusTab] = useState<string>('default'); // 'default' or campus.pcoId
    const [cutoffDate, setCutoffDate] = useState('');
    const [stripePayoutCadence, setStripePayoutCadence] = useState<'daily' | 'weekly' | 'transaction' | 'manual'>('manual');
    const [stripePayoutDayOfWeek, setStripePayoutDayOfWeek] = useState<number>(3); // 3 = Wednesday

    // Email Notification State
    const [emailNotificationsEnabled, setEmailNotificationsEnabled] = useState(false);
    const [notifyOnBatchReady, setNotifyOnBatchReady] = useState(true);
    const [notifyOnBatchSynced, setNotifyOnBatchSynced] = useState(true);
    const [notificationRecipientType, setNotificationRecipientType] = useState<'email' | 'pco_list'>('email');
    const [notificationEmail, setNotificationEmail] = useState('');
    const [notificationPcoListId, setNotificationPcoListId] = useState('');
    const [notificationPcoListName, setNotificationPcoListName] = useState('');
    const [pcoLists, setPcoLists] = useState<any[]>([]);
    const [testSending, setTestSending] = useState(false);
    const [testFeedback, setTestFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const loadData = async () => {
        setLoading(true);
        setError(null);
        try {
            const [accountsData, existingMapping, dbFunds, dbCampuses, lists] = await Promise.all([
                quickbooksClient.getAccounts(churchId),
                quickbooksClient.getMapping(churchId),
                firestore.getFunds(churchId).catch(() => []),
                firestore.getCampuses(churchId).catch(() => []),
                pcoService.getPeopleLists(churchId).catch(() => [])
            ]);

            setPcoLists(lists || []);

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

            if (campuses && campuses.length > 0) {
                setCampusesList(campuses);
            } else {
                setCampusesList(dbCampuses || []);
            }

            setBankAccounts(accountsData.bankAccounts || []);
            setIncomeAccounts(accountsData.incomeAccounts || []);
            setExpenseAccounts(accountsData.expenseAccounts || []);
            setClasses(accountsData.classes || []);
            setVendors(accountsData.vendors || []);

            if (existingMapping) {
                setDepositBankAccountId(existingMapping.depositBankAccountId || '');
                setStripeFeeExpenseAccountId(existingMapping.stripeFeeExpenseAccountId || '');
                setStripeVendorId(existingMapping.stripeVendorId || '');
                setTithelyFeeExpenseAccountId(existingMapping.tithelyFeeExpenseAccountId || '');
                setTithelyVendorId(existingMapping.tithelyVendorId || '');
                setDefaultIncomeAccountId(existingMapping.defaultIncomeAccountId || '');
                setFundMappings(existingMapping.fundMappings || {});
                setEnableCampusMapping(existingMapping.enableCampusMapping ?? false);
                setCampusFundMappings(existingMapping.campusFundMappings || {});
                setCutoffDate(existingMapping.cutoffDate || '');
                setStripePayoutCadence(existingMapping.stripePayoutCadence || 'weekly');
                setStripePayoutDayOfWeek(typeof existingMapping.stripePayoutDayOfWeek === 'number' ? existingMapping.stripePayoutDayOfWeek : 3);
                setEmailNotificationsEnabled(existingMapping.emailNotificationsEnabled ?? false);
                setNotifyOnBatchReady(existingMapping.notifyOnBatchReady ?? true);
                setNotifyOnBatchSynced(existingMapping.notifyOnBatchSynced ?? true);
                setNotificationRecipientType(existingMapping.notificationRecipientType || 'email');
                setNotificationEmail(existingMapping.notificationEmail || '');
                setNotificationPcoListId(existingMapping.notificationPcoListId || '');
                setNotificationPcoListName(existingMapping.notificationPcoListName || '');
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
                const tithelyVendor = accountsData.vendors.find(v => /tithe/i.test(v.displayName));
                if (tithelyVendor) {
                    setTithelyVendorId(tithelyVendor.id);
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
        if (selectedCampusTab === 'default') {
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
        } else {
            const currentCampus = campusesList.find(c => c.pcoId === selectedCampusTab);
            const campusNameClean = (currentCampus?.name || '').toLowerCase();
            const campusClass = classes.find(c => 
                c.name.toLowerCase() === campusNameClean || c.name.toLowerCase().includes(campusNameClean)
            );

            const newCampusMappings = { ...(campusFundMappings[selectedCampusTab] || {}) };
            let matchedCount = 0;

            allFunds.forEach(fund => {
                const cleanFundName = fund.name.toLowerCase().trim();
                // Look for campus-specific account first (e.g. "Tithes - North Campus" or "North Tithes")
                let matchedAccount = incomeAccounts.find(acc => {
                    const cleanAccName = acc.name.toLowerCase().trim();
                    return cleanAccName.includes(cleanFundName) && cleanAccName.includes(campusNameClean);
                });

                // Fallback to general fund name match
                if (!matchedAccount) {
                    matchedAccount = incomeAccounts.find(acc => {
                        const cleanAccName = acc.name.toLowerCase().trim();
                        return cleanAccName === cleanFundName || cleanAccName.includes(cleanFundName);
                    });
                }

                if (matchedAccount || campusClass) {
                    newCampusMappings[fund.id] = {
                        qboAccountId: matchedAccount?.id || fundMappings[fund.id]?.qboAccountId || '',
                        qboAccountName: matchedAccount?.name || fundMappings[fund.id]?.qboAccountName || '',
                        qboClassId: campusClass?.id || fundMappings[fund.id]?.qboClassId,
                        qboClassName: campusClass?.name || fundMappings[fund.id]?.qboClassName
                    };
                    matchedCount++;
                }
            });

            setCampusFundMappings(prev => ({
                ...prev,
                [selectedCampusTab]: newCampusMappings
            }));
            setSuccessMessage(`Auto-matched ${matchedCount} funds for ${currentCampus?.name || 'this campus'}.`);
            setTimeout(() => setSuccessMessage(null), 3000);
        }
    };

    const handleCopyDefaultToCurrentCampus = () => {
        if (selectedCampusTab === 'default') return;
        const currentCampus = campusesList.find(c => c.pcoId === selectedCampusTab);
        const campusClass = classes.find(c => 
            currentCampus && c.name.toLowerCase().includes(currentCampus.name.toLowerCase())
        );

        const newCampusMap: Record<string, FundQuickbooksMapping> = {};
        allFunds.forEach(fund => {
            const def = fundMappings[fund.id];
            if (def && def.qboAccountId) {
                newCampusMap[fund.id] = {
                    ...def,
                    qboClassId: campusClass?.id || def.qboClassId,
                    qboClassName: campusClass?.name || def.qboClassName
                };
            }
        });

        setCampusFundMappings(prev => ({
            ...prev,
            [selectedCampusTab]: newCampusMap
        }));
        setSuccessMessage(`Copied default fund mappings to ${currentCampus?.name || 'this campus'}${campusClass ? ` and assigned Class "${campusClass.name}"` : ''}.`);
        setTimeout(() => setSuccessMessage(null), 3000);
    };

    const handleFundAccountChange = (fund: PcoFund, accountId: string) => {
        const account = incomeAccounts.find(a => a.id === accountId);
        if (selectedCampusTab === 'default') {
            setFundMappings(prev => ({
                ...prev,
                [fund.id]: {
                    ...(prev[fund.id] || {}),
                    qboAccountId: accountId,
                    qboAccountName: account?.name || ''
                }
            }));
        } else {
            setCampusFundMappings(prev => ({
                ...prev,
                [selectedCampusTab]: {
                    ...(prev[selectedCampusTab] || {}),
                    [fund.id]: {
                        ...(prev[selectedCampusTab]?.[fund.id] || {}),
                        qboAccountId: accountId,
                        qboAccountName: account?.name || ''
                    }
                }
            }));
        }
    };

    const handleFundClassChange = (fund: PcoFund, classId: string) => {
        const qboClass = classes.find(c => c.id === classId);
        if (selectedCampusTab === 'default') {
            setFundMappings(prev => ({
                ...prev,
                [fund.id]: {
                    ...(prev[fund.id] || { qboAccountId: defaultIncomeAccountId, qboAccountName: '' }),
                    qboClassId: classId || undefined,
                    qboClassName: qboClass?.name || undefined
                }
            }));
        } else {
            setCampusFundMappings(prev => ({
                ...prev,
                [selectedCampusTab]: {
                    ...(prev[selectedCampusTab] || {}),
                    [fund.id]: {
                        ...(prev[selectedCampusTab]?.[fund.id] || { qboAccountId: '', qboAccountName: '' }),
                        qboClassId: classId || undefined,
                        qboClassName: qboClass?.name || undefined
                    }
                }
            }));
        }
    };

    const handleSendTestEmail = async () => {
        setTestSending(true);
        setTestFeedback(null);
        try {
            const currentMapping: QuickbooksMappingConfig = {
                churchId,
                depositBankAccountId: depositBankAccountId || 'test',
                stripeFeeExpenseAccountId: stripeFeeExpenseAccountId || 'test',
                fundMappings,
                emailNotificationsEnabled: true,
                notifyOnBatchReady,
                notifyOnBatchSynced,
                notificationRecipientType,
                notificationEmail: notificationEmail.trim(),
                notificationPcoListId: notificationRecipientType === 'pco_list' ? notificationPcoListId : undefined,
                notificationPcoListName: notificationRecipientType === 'pco_list' ? notificationPcoListName : undefined
            };

            const res = await quickbooksClient.sendTestNotification(churchId, currentMapping);
            setTestFeedback({
                type: 'success',
                text: res.message || `Test email sent to ${res.recipients.join(', ')}!`
            });
        } catch (err: any) {
            setTestFeedback({
                type: 'error',
                text: err.message || 'Failed to send test email.'
            });
        } finally {
            setTestSending(false);
        }
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
            const tithelyFeeAcc = expenseAccounts.find(a => a.id === tithelyFeeExpenseAccountId);
            const tithelyVendor = vendors.find(v => v.id === tithelyVendorId);
            const defIncome = incomeAccounts.find(a => a.id === defaultIncomeAccountId);

            const payload: QuickbooksMappingConfig = {
                churchId,
                depositBankAccountId,
                depositBankAccountName: bankAcc?.name,
                stripeFeeExpenseAccountId,
                stripeFeeExpenseAccountName: feeAcc?.name,
                stripeVendorId: stripeVendorId || undefined,
                stripeVendorName: vendor?.displayName,
                tithelyFeeExpenseAccountId: tithelyFeeExpenseAccountId || undefined,
                tithelyFeeExpenseAccountName: tithelyFeeAcc?.name,
                tithelyVendorId: tithelyVendorId || undefined,
                tithelyVendorName: tithelyVendor?.displayName,
                defaultIncomeAccountId: defaultIncomeAccountId || undefined,
                defaultIncomeAccountName: defIncome?.name,
                fundMappings,
                enableCampusMapping,
                campusFundMappings: enableCampusMapping ? campusFundMappings : undefined,
                cutoffDate: cutoffDate.trim() || undefined,
                stripePayoutCadence,
                stripePayoutDayOfWeek: stripePayoutCadence === 'weekly' ? stripePayoutDayOfWeek : undefined,
                emailNotificationsEnabled,
                notifyOnBatchReady,
                notifyOnBatchSynced,
                notificationRecipientType,
                notificationEmail: notificationEmail.trim() || undefined,
                notificationPcoListId: notificationRecipientType === 'pco_list' ? notificationPcoListId : undefined,
                notificationPcoListName: notificationRecipientType === 'pco_list' ? notificationPcoListName : undefined
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
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5 flex items-center gap-1.5">
                                        <CreditCard className="w-4 h-4 text-emerald-500" />
                                        Tithely Fee Expense Account (Optional)
                                    </label>
                                    <select
                                        value={tithelyFeeExpenseAccountId}
                                        onChange={(e) => setTithelyFeeExpenseAccountId(e.target.value)}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    >
                                        <option value="">Use Default Stripe/Merchant Fee Account</option>
                                        {expenseAccounts.map(a => (
                                            <option key={a.id} value={a.id}>{a.name}</option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                        Used for processing fees on Tithely batches. Defaults to the merchant fee account if left unselected.
                                    </p>
                                </div>

                                <div>
                                    <label className="block text-xs font-semibold uppercase tracking-wider text-slate-700 dark:text-slate-300 mb-1.5">
                                        Tithely Payee / Vendor (Optional)
                                    </label>
                                    <select
                                        value={tithelyVendorId}
                                        onChange={(e) => setTithelyVendorId(e.target.value)}
                                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-emerald-500"
                                    >
                                        <option value="">No vendor selected</option>
                                        {vendors.map(v => (
                                            <option key={v.id} value={v.id}>{v.displayName}</option>
                                        ))}
                                    </select>
                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                        Vendor attached to Tithely fee lines in QuickBooks (e.g. Tithe.ly).
                                    </p>
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

                                {/* Stripe Online Payout Cadence Section */}
                                <div className="md:col-span-2 pt-3 border-t border-slate-200 dark:border-slate-700">
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="p-1.5 bg-purple-100 dark:bg-purple-950/60 rounded-lg text-purple-600 dark:text-purple-400">
                                            <CreditCard className="w-4 h-4" />
                                        </div>
                                        <div>
                                            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-900 dark:text-white">
                                                Stripe Online Giving Payout Schedule
                                            </h4>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400">
                                                Group online card & ACH donations into QuickBooks deposits matching your Stripe bank payout schedule.
                                            </p>
                                        </div>
                                    </div>

                                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2">
                                        <div>
                                            <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                                Deposit Cadence
                                            </label>
                                            <select
                                                value={stripePayoutCadence}
                                                onChange={(e) => setStripePayoutCadence(e.target.value as any)}
                                                className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                            >
                                                <option value="manual">Manual / Smart Payout Matching (Recommended)</option>
                                                <option value="weekly">Estimated Weekly Schedule</option>
                                                <option value="daily">Daily Rolling Payout</option>
                                                <option value="transaction">Individual per Transaction</option>
                                            </select>
                                        </div>

                                        {stripePayoutCadence === 'weekly' && (
                                            <div>
                                                <label className="block text-xs font-semibold text-slate-700 dark:text-slate-300 mb-1">
                                                    Weekly Payout Day
                                                </label>
                                                <select
                                                    value={stripePayoutDayOfWeek}
                                                    onChange={(e) => setStripePayoutDayOfWeek(Number(e.target.value))}
                                                    className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-purple-500"
                                                >
                                                    <option value={3}>Wednesday (Default / Planning Center)</option>
                                                    <option value={1}>Monday</option>
                                                    <option value={2}>Tuesday</option>
                                                    <option value={4}>Thursday</option>
                                                    <option value={5}>Friday</option>
                                                    <option value={6}>Saturday</option>
                                                    <option value={0}>Sunday</option>
                                                </select>
                                            </div>
                                        )}
                                    </div>
                                </div>
                            </div>

                            {/* Multi-Campus Support Toggle */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                <div className="flex items-center gap-3">
                                    <div className="p-2.5 bg-indigo-100 dark:bg-indigo-950/60 rounded-xl text-indigo-600 dark:text-indigo-400">
                                        <Building2 className="w-5 h-5" />
                                    </div>
                                    <div>
                                        <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            <span>Campus & Location Specific Funds</span>
                                            {enableCampusMapping ? (
                                                <span className="text-[10px] font-black bg-indigo-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                                                    Enabled
                                                </span>
                                            ) : (
                                                <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full uppercase tracking-wide">
                                                    Single / Consolidated
                                                </span>
                                            )}
                                        </div>
                                        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                            Associate each campus with a different set of QuickBooks income accounts or classes.
                                        </p>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    onClick={() => setEnableCampusMapping(!enableCampusMapping)}
                                    className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${enableCampusMapping ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                                    title="Toggle campus mapping"
                                >
                                    <div className={`w-4 h-4 bg-white rounded-full transition-transform ${enableCampusMapping ? 'translate-x-6' : ''}`}></div>
                                </button>
                            </div>

                            {/* Campus Tabs (when enabled) */}
                            {enableCampusMapping && campusesList.length > 0 && (
                                <div className="space-y-3">
                                    <div className="flex flex-wrap items-center gap-1.5 p-1.5 bg-slate-100 dark:bg-slate-800/80 rounded-xl border border-slate-200 dark:border-slate-700">
                                        <button
                                            type="button"
                                            onClick={() => setSelectedCampusTab('default')}
                                            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                                                selectedCampusTab === 'default'
                                                    ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                            }`}
                                        >
                                            <span>⭐</span>
                                            <span>Default / All Campuses</span>
                                        </button>
                                        {campusesList.map(campus => {
                                            const hasCustom = campusFundMappings[campus.pcoId] && Object.keys(campusFundMappings[campus.pcoId]).length > 0;
                                            return (
                                                <button
                                                    key={campus.pcoId}
                                                    type="button"
                                                    onClick={() => setSelectedCampusTab(campus.pcoId)}
                                                    className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold transition-all ${
                                                        selectedCampusTab === campus.pcoId
                                                            ? 'bg-white dark:bg-slate-900 text-indigo-600 dark:text-indigo-400 shadow-sm'
                                                            : 'text-slate-500 hover:text-slate-900 dark:hover:text-white'
                                                    }`}
                                                >
                                                    <span>🏛️</span>
                                                    <span>{campus.name}</span>
                                                    {hasCustom && (
                                                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" title="Has campus-specific mappings"></span>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>

                                    {selectedCampusTab !== 'default' && (
                                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 bg-indigo-50/60 dark:bg-indigo-950/30 rounded-xl border border-indigo-100 dark:border-indigo-900/40 text-xs">
                                            <div className="flex items-center gap-2 text-indigo-950 dark:text-indigo-200">
                                                <span>ℹ️</span>
                                                <span>
                                                    Configuring funds for <strong>{campusesList.find(c => c.pcoId === selectedCampusTab)?.name}</strong>. Funds left unmapped will inherit the <strong>Default / Church-Wide</strong> mapping.
                                                </span>
                                            </div>
                                            <button
                                                type="button"
                                                onClick={handleCopyDefaultToCurrentCampus}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-indigo-200 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 rounded-lg font-bold text-xs hover:bg-indigo-50 dark:hover:bg-slate-800 transition-colors shrink-0 shadow-sm"
                                            >
                                                <Copy className="w-3.5 h-3.5" />
                                                Copy All From Default
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Batch Email Notifications */}
                            <div className="p-4 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 space-y-4">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2.5 bg-blue-100 dark:bg-blue-950/60 rounded-xl text-blue-600 dark:text-blue-400">
                                            <Mail className="w-5 h-5" />
                                        </div>
                                        <div>
                                            <div className="text-xs font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                                <span>Batch Email Notifications</span>
                                                {emailNotificationsEnabled ? (
                                                    <span className="text-[10px] font-black bg-blue-600 text-white px-2 py-0.5 rounded-full uppercase tracking-wide">
                                                        Active
                                                    </span>
                                                ) : (
                                                    <span className="text-[10px] font-bold bg-slate-200 dark:bg-slate-700 text-slate-600 dark:text-slate-300 px-2 py-0.5 rounded-full uppercase tracking-wide">
                                                        Off
                                                    </span>
                                                )}
                                            </div>
                                            <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                                                Send email alerts when Giving batches are ready to sync or successfully deposited into QuickBooks.
                                            </p>
                                        </div>
                                    </div>
                                    <button
                                        type="button"
                                        onClick={() => setEmailNotificationsEnabled(!emailNotificationsEnabled)}
                                        className={`w-12 h-6 rounded-full p-1 transition-colors shrink-0 ${emailNotificationsEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-700'}`}
                                        title="Toggle batch email notifications"
                                    >
                                        <div className={`w-4 h-4 bg-white rounded-full transition-transform ${emailNotificationsEnabled ? 'translate-x-6' : ''}`}></div>
                                    </button>
                                </div>

                                {emailNotificationsEnabled && (
                                    <div className="pt-3 border-t border-slate-200 dark:border-slate-700 space-y-4 animate-in fade-in duration-150">
                                        {/* Notification Triggers */}
                                        <div className="flex flex-wrap items-center gap-6">
                                            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                                                <input
                                                    type="checkbox"
                                                    checked={notifyOnBatchReady}
                                                    onChange={(e) => setNotifyOnBatchReady(e.target.checked)}
                                                    className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 w-4 h-4"
                                                />
                                                <span>🔔 Notify when a batch is <strong>Ready to Sync</strong></span>
                                            </label>
                                            <label className="flex items-center gap-2 cursor-pointer text-xs font-medium text-slate-700 dark:text-slate-300">
                                                <input
                                                    type="checkbox"
                                                    checked={notifyOnBatchSynced}
                                                    onChange={(e) => setNotifyOnBatchSynced(e.target.checked)}
                                                    className="rounded border-slate-300 dark:border-slate-700 text-blue-600 focus:ring-blue-500 w-4 h-4"
                                                />
                                                <span>✅ Notify when a batch has been <strong>Deposited to QuickBooks</strong></span>
                                            </label>
                                        </div>

                                        {/* Recipient Mode Tabs */}
                                        <div className="space-y-2">
                                            <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-slate-600 dark:text-slate-400">
                                                <span>Send Notification To:</span>
                                            </div>
                                            <div className="flex items-center gap-2">
                                                <button
                                                    type="button"
                                                    onClick={() => setNotificationRecipientType('email')}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                        notificationRecipientType === 'email'
                                                            ? 'bg-blue-600 text-white shadow-sm'
                                                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                                                    }`}
                                                >
                                                    <Mail className="w-3.5 h-3.5" />
                                                    Direct Email Address(es)
                                                </button>
                                                <button
                                                    type="button"
                                                    onClick={() => setNotificationRecipientType('pco_list')}
                                                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-all ${
                                                        notificationRecipientType === 'pco_list'
                                                            ? 'bg-blue-600 text-white shadow-sm'
                                                            : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-700'
                                                    }`}
                                                >
                                                    <Users className="w-3.5 h-3.5" />
                                                    Planning Center People List
                                                </button>
                                            </div>

                                            {notificationRecipientType === 'email' ? (
                                                <div className="pt-1">
                                                    <input
                                                        type="text"
                                                        value={notificationEmail}
                                                        onChange={(e) => setNotificationEmail(e.target.value)}
                                                        placeholder="e.g. finance@yourchurch.org, bookkeeper@yourchurch.org"
                                                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    />
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                                        Enter one or more email addresses separated by commas or semicolons.
                                                    </p>
                                                </div>
                                            ) : (
                                                <div className="pt-1">
                                                    <select
                                                        value={notificationPcoListId}
                                                        onChange={(e) => {
                                                            const selectedId = e.target.value;
                                                            setNotificationPcoListId(selectedId);
                                                            const found = pcoLists.find(l => String(l.id) === String(selectedId));
                                                            setNotificationPcoListName(found ? (found.attributes?.name || found.name) : '');
                                                        }}
                                                        className="w-full px-3 py-2 bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-lg text-sm text-slate-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                                                    >
                                                        <option value="">Select a Planning Center List...</option>
                                                        {pcoLists.map(l => (
                                                            <option key={l.id} value={l.id}>
                                                                {l.attributes?.name || l.name} {l.attributes?.total_people ? `(${l.attributes.total_people} members)` : ''}
                                                            </option>
                                                        ))}
                                                    </select>
                                                    <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-1">
                                                        Emails will automatically be sent to the primary address of each member in this Planning Center list (e.g. Finance Team or Board of Elders).
                                                    </p>
                                                </div>
                                            )}
                                        </div>

                                        {/* Test Email Button & Status */}
                                        <div className="pt-2 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 dark:border-slate-700/60">
                                            <button
                                                type="button"
                                                onClick={handleSendTestEmail}
                                                disabled={testSending || (!notificationEmail.trim() && !notificationPcoListId)}
                                                className="flex items-center gap-1.5 px-3 py-1.5 bg-white dark:bg-slate-900 border border-blue-200 dark:border-blue-800 text-blue-600 dark:text-blue-400 rounded-lg font-bold text-xs hover:bg-blue-50 dark:hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
                                            >
                                                {testSending ? (
                                                    <>
                                                        <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                                                        <span>Sending Test Email...</span>
                                                    </>
                                                ) : (
                                                    <>
                                                        <Send className="w-3.5 h-3.5" />
                                                        <span>Send Test Email</span>
                                                    </>
                                                )}
                                            </button>

                                            {testFeedback && (
                                                <div className={`text-xs flex items-center gap-1.5 ${testFeedback.type === 'success' ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-rose-600 dark:text-rose-400'}`}>
                                                    {testFeedback.type === 'success' ? <Check className="w-3.5 h-3.5" /> : <AlertCircle className="w-3.5 h-3.5" />}
                                                    <span>{testFeedback.text}</span>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>

                            {/* 1-to-1 Fund Matching Table */}
                            <div className="space-y-3">
                                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                    <div>
                                        <h3 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
                                            {selectedCampusTab === 'default'
                                                ? 'Default Fund Mapping: Planning Center to QuickBooks Income'
                                                : `${campusesList.find(c => c.pcoId === selectedCampusTab)?.name} Fund Mapping`}
                                            <span className="text-xs px-2.5 py-0.5 rounded-full font-medium bg-emerald-100 dark:bg-emerald-950/80 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                                                {selectedCampusTab === 'default' 
                                                    ? `${mappedCount} of ${allFunds.length} mapped`
                                                    : `${Object.keys(campusFundMappings[selectedCampusTab] || {}).length} customized`}
                                            </span>
                                        </h3>
                                        <p className="text-xs text-slate-500 dark:text-slate-400">
                                            {selectedCampusTab === 'default'
                                                ? 'Each Planning Center fund line in a batch is credited 1-to-1 to its mapped QuickBooks Income account.'
                                                : `Customize accounts and classes for donations attributed to ${campusesList.find(c => c.pcoId === selectedCampusTab)?.name}.`}
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
                                                <th className="px-3 py-3 w-24 text-center">Status</th>
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
                                                    const defaultMap = fundMappings[fund.id] || { qboAccountId: '' };
                                                    const campusMap = selectedCampusTab !== 'default' ? campusFundMappings[selectedCampusTab]?.[fund.id] : undefined;
                                                    const activeMap = selectedCampusTab === 'default' ? defaultMap : (campusMap || { qboAccountId: '' });

                                                    const isCampusExplicitlyMapped = selectedCampusTab !== 'default' && !!campusMap?.qboAccountId;
                                                    const isDefaultMapped = !!defaultMap.qboAccountId;

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
                                                                    value={activeMap.qboAccountId || ''}
                                                                    onChange={(e) => handleFundAccountChange(fund, e.target.value)}
                                                                    className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                                >
                                                                    <option value="">
                                                                        {selectedCampusTab !== 'default' && defaultMap.qboAccountId 
                                                                            ? `(Inherits default: ${defaultMap.qboAccountName || 'Mapped'})` 
                                                                            : 'Select QuickBooks Income Account...'}
                                                                    </option>
                                                                    {incomeAccounts.map(a => (
                                                                        <option key={a.id} value={a.id}>{a.name}</option>
                                                                    ))}
                                                                </select>
                                                            </td>
                                                            {classes.length > 0 && (
                                                                <td className="px-4 py-3">
                                                                    <select
                                                                        value={activeMap.qboClassId || ''}
                                                                        onChange={(e) => handleFundClassChange(fund, e.target.value)}
                                                                        className="w-full px-3 py-1.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg text-xs text-slate-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                                                                    >
                                                                        <option value="">
                                                                            {selectedCampusTab !== 'default' && defaultMap.qboClassId 
                                                                                ? `(Inherits default: ${defaultMap.qboClassName || 'Class'})` 
                                                                                : 'None'}
                                                                        </option>
                                                                        {classes.map(c => (
                                                                            <option key={c.id} value={c.id}>{c.name}</option>
                                                                        ))}
                                                                    </select>
                                                                </td>
                                                            )}
                                                            <td className="px-3 py-3 text-center">
                                                                {selectedCampusTab !== 'default' ? (
                                                                    isCampusExplicitlyMapped ? (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400" title="Customized for this campus">
                                                                            <Check className="w-3 h-3" />
                                                                            Campus
                                                                        </span>
                                                                    ) : isDefaultMapped ? (
                                                                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-indigo-100 dark:bg-indigo-950/60 text-indigo-600 dark:text-indigo-400" title="Inherits default church-wide mapping">
                                                                            Inherited
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
                                                                    )
                                                                ) : isDefaultMapped ? (
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
