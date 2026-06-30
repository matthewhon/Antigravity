import React, { useState, useEffect } from 'react';
import { getAuth } from 'firebase/auth';

export interface TenantBillingReport {
    churchId: string;
    name: string;
    gcpCost: number;
    postmarkCost: number;
    signalwireCost: number;
    totalCost: number;
    metrics: {
        activeUsers: number;
        emailSent: number;
        smsSegments: number;
    };
}

export interface BillingReportResponse {
    period: string;
    totals: {
        gcpCost: number;
        postmarkCost: number;
        signalwireCost: number;
        grandTotal: number;
    };
    tenants: TenantBillingReport[];
}

export const BillingReportsView: React.FC = () => {
    const [report, setReport] = useState<BillingReportResponse | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [period, setPeriod] = useState<string>(() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    });

    const fetchReport = async (selectedPeriod: string) => {
        setIsLoading(true);
        setError(null);
        try {
            const auth = getAuth();
            const token = await auth.currentUser?.getIdToken();
            const res = await fetch(`/api/admin/billing-report?period=${selectedPeriod}`, {
                headers: {
                    'Authorization': `Bearer ${token}`
                }
            });
            if (!res.ok) {
                throw new Error(`Failed to fetch report: ${res.statusText}`);
            }
            const data: BillingReportResponse = await res.json();
            setReport(data);
        } catch (err: any) {
            setError(err.message || 'An error occurred while fetching the report.');
        } finally {
            setIsLoading(false);
        }
    };

    useEffect(() => {
        fetchReport(period);
    }, [period]);

    const formatCurrency = (val: number) => {
        return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(val);
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-sm border border-slate-200 dark:border-slate-800">
            <div className="flex justify-between items-center mb-6">
                <div>
                    <h2 className="text-xl font-bold text-slate-800 dark:text-white">Tenant Cost Allocation</h2>
                    <p className="text-sm text-slate-500">Estimated cost breakdown per church</p>
                </div>
                <div className="flex gap-4 items-center">
                    <input 
                        type="month" 
                        value={period}
                        onChange={e => setPeriod(e.target.value)}
                        className="px-4 py-2 bg-slate-100 dark:bg-slate-800 border-none rounded-xl text-sm font-medium focus:ring-2 focus:ring-emerald-500 outline-none"
                    />
                    <button 
                        onClick={() => fetchReport(period)}
                        disabled={isLoading}
                        className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 dark:bg-emerald-900/30 dark:text-emerald-400 dark:hover:bg-emerald-900/50 px-4 py-2 rounded-xl text-sm font-medium transition-colors"
                    >
                        {isLoading ? 'Loading...' : 'Refresh'}
                    </button>
                </div>
            </div>

            {error && (
                <div className="p-4 bg-red-50 text-red-600 dark:bg-red-900/20 dark:text-red-400 rounded-xl mb-6 text-sm">
                    {error}
                </div>
            )}

            {report && (
                <>
                    <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <div className="text-sm text-slate-500 mb-1">Total Allocated Cost</div>
                            <div className="text-2xl font-bold text-slate-800 dark:text-white">
                                {formatCurrency(report.totals.grandTotal)}
                            </div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <div className="text-sm text-slate-500 mb-1">GCP/Firebase</div>
                            <div className="text-2xl font-bold text-slate-800 dark:text-white">
                                {formatCurrency(report.totals.gcpCost)}
                            </div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <div className="text-sm text-slate-500 mb-1">Postmark (Email)</div>
                            <div className="text-2xl font-bold text-slate-800 dark:text-white">
                                {formatCurrency(report.totals.postmarkCost)}
                            </div>
                        </div>
                        <div className="bg-slate-50 dark:bg-slate-800/50 p-4 rounded-2xl border border-slate-100 dark:border-slate-800">
                            <div className="text-sm text-slate-500 mb-1">SignalWire (SMS)</div>
                            <div className="text-2xl font-bold text-slate-800 dark:text-white">
                                {formatCurrency(report.totals.signalwireCost)}
                            </div>
                        </div>
                    </div>

                    <div className="overflow-x-auto rounded-2xl border border-slate-200 dark:border-slate-800">
                        <table className="w-full text-left text-sm whitespace-nowrap">
                            <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500">
                                <tr>
                                    <th className="px-6 py-4 font-medium">Tenant</th>
                                    <th className="px-6 py-4 font-medium text-right">GCP Cost</th>
                                    <th className="px-6 py-4 font-medium text-right">Postmark</th>
                                    <th className="px-6 py-4 font-medium text-right">SignalWire</th>
                                    <th className="px-6 py-4 font-medium text-right bg-slate-100 dark:bg-slate-800">Total Cost</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50 text-slate-600 dark:text-slate-300">
                                {report.tenants.length === 0 ? (
                                    <tr>
                                        <td colSpan={5} className="px-6 py-8 text-center text-slate-400">
                                            No billing data available for this period.
                                        </td>
                                    </tr>
                                ) : (
                                    report.tenants.map(t => (
                                        <tr key={t.churchId} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                            <td className="px-6 py-4 font-medium text-slate-800 dark:text-slate-200">
                                                {t.name}
                                                <div className="text-xs text-slate-400 font-normal">ID: {t.churchId}</div>
                                            </td>
                                            <td className="px-6 py-4 text-right">{formatCurrency(t.gcpCost)}</td>
                                            <td className="px-6 py-4 text-right">{formatCurrency(t.postmarkCost)}</td>
                                            <td className="px-6 py-4 text-right">{formatCurrency(t.signalwireCost)}</td>
                                            <td className="px-6 py-4 text-right font-bold bg-slate-50 dark:bg-slate-800/30">
                                                {formatCurrency(t.totalCost)}
                                            </td>
                                        </tr>
                                    ))
                                )}
                            </tbody>
                        </table>
                    </div>
                </>
            )}
        </div>
    );
};
