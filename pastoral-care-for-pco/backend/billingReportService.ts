import { getDb } from './firebase.js';
import { BigQuery } from '@google-cloud/bigquery';
import fetch from 'node-fetch'; // assuming fetch is available in this env
import { Church, SystemSettings } from '../types.js';

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

/**
 * Helper to fetch SignalWire usage for the month
 */
async function getSignalWireTotalCost(
    settings: SystemSettings, 
    yearMonth: string
): Promise<number> {
    const { signalwireProjectId, signalwireApiToken, signalwireSpaceUrl } = settings;
    if (!signalwireProjectId || !signalwireApiToken || !signalwireSpaceUrl) {
        return 0;
    }

    try {
        const [year, month] = yearMonth.split('-');
        const startDate = `${year}-${month}-01`;
        // last day of month
        const endDate = new Date(Number(year), Number(month), 0).toISOString().split('T')[0];

        const authHeader = 'Basic ' + Buffer.from(`${signalwireProjectId}:${signalwireApiToken}`).toString('base64');
        const url = `https://${signalwireSpaceUrl}/api/laml/2010-04-01/Accounts/${signalwireProjectId}/Usage/Records.json?StartDate=${startDate}&EndDate=${endDate}`;

        const res = await fetch(url, {
            headers: { 'Authorization': authHeader }
        });

        if (!res.ok) {
            console.error(`[BillingService] SignalWire API error: ${res.statusText}`);
            return 0;
        }

        const data: any = await res.json();
        // Sum up the price
        let totalCost = 0;
        if (data.usage_records && Array.isArray(data.usage_records)) {
            for (const record of data.usage_records) {
                totalCost += Math.abs(Number(record.price || 0));
            }
        }
        return totalCost;
    } catch (e: any) {
        console.error(`[BillingService] Failed to fetch SignalWire costs: ${e.message}`);
        return 0;
    }
}

/**
 * Fetch total GCP cost from BigQuery
 * Assumes a dataset named `billing_export` and a table `gcp_billing_export_v1_*`
 * in the default GCP project.
 */
async function getGcpTotalCost(yearMonth: string): Promise<number> {
    try {
        const bigquery = new BigQuery();
        
        // This is a generic query. Users will need to update the dataset/table name
        // to match their actual billing export setup.
        // E.g., `your-project.billing_export.gcp_billing_export_v1_*`
        const query = `
            SELECT SUM(cost) as total_cost 
            FROM \`billing_export.gcp_billing_export_v1_*\`
            WHERE invoice.month = @invoice_month
        `;
        
        const invoiceMonth = yearMonth.replace('-', ''); // E.g., '2026-06' -> '202606'

        const options = {
            query: query,
            params: { invoice_month: invoiceMonth },
        };

        const [job] = await bigquery.createQueryJob(options);
        const [rows] = await job.getQueryResults();

        if (rows && rows.length > 0 && rows[0].total_cost) {
            return Number(rows[0].total_cost);
        }
        return 0;
    } catch (e: any) {
        console.error(`[BillingService] Failed to fetch GCP costs from BigQuery: ${e.message}`);
        // Return 0 if BigQuery is not configured or query fails
        return 0;
    }
}

export async function generateBillingReport(period: string): Promise<BillingReportResponse> {
    const db = getDb();
    
    // 1. Fetch system settings
    const sysSnap = await db.collection('system').doc('settings').get();
    const settings = (sysSnap.data() || {}) as SystemSettings;

    // 2. Fetch all churches
    const churchesSnap = await db.collection('churches').get();
    const churches = churchesSnap.docs.map(d => d.data() as Church);
    
    // Calculate total metrics across all active churches
    let totalActiveUsers = 0;
    let totalEmailSent = 0;
    let totalSmsSegments = 0;

    const tenantsData = churches.map(church => {
        const activeUsers = church.activePeopleCount || 0;
        const emailSent = church.emailUsage?.[period] || 0;
        const smsSegments = church.smsUsage?.[period] || 0;
        
        totalActiveUsers += activeUsers;
        totalEmailSent += emailSent;
        totalSmsSegments += smsSegments;

        return {
            churchId: church.id,
            name: church.name,
            metrics: {
                activeUsers,
                emailSent,
                smsSegments
            }
        };
    });

    // 3. Fetch Provider Costs
    // Postmark base rate is $15/mo. Additional costs are per email, but for simplicity
    // if we don't have a direct Postmark invoice API, we'll assume a $15 flat base 
    // + $1.50 per 1k emails over 10k. Or we can just use the base rate for now.
    // Let's calculate estimated postmark cost:
    let postmarkTotalCost = 15.00;
    if (totalEmailSent > 10000) {
        postmarkTotalCost += Math.ceil((totalEmailSent - 10000) / 1000) * 1.50;
    }

    const [gcpTotalCost, signalwireTotalCost] = await Promise.all([
        getGcpTotalCost(period),
        getSignalWireTotalCost(settings, period)
    ]);

    // 4. Allocate Costs
    const reports: TenantBillingReport[] = tenantsData.map(tenant => {
        // GCP allocated proportionally by active users
        const gcpRatio = totalActiveUsers > 0 ? (tenant.metrics.activeUsers / totalActiveUsers) : 0;
        const gcpCost = gcpTotalCost * gcpRatio;

        // Postmark allocated evenly for base rate + proportionally for overage, 
        // OR simply distributed evenly based on the user's preference
        // User said: "I would distribute the base rate per tenant"
        const activeTenantCount = tenantsData.length || 1;
        const postmarkBasePerTenant = 15.00 / activeTenantCount;
        const postmarkOverage = postmarkTotalCost - 15.00;
        const emailRatio = totalEmailSent > 0 ? (tenant.metrics.emailSent / totalEmailSent) : 0;
        const postmarkCost = postmarkBasePerTenant + (postmarkOverage * emailRatio);

        // SignalWire allocated proportionally by SMS segments sent
        // (Even though we pulled total invoice cost, we allocate it by usage ratio)
        const smsRatio = totalSmsSegments > 0 ? (tenant.metrics.smsSegments / totalSmsSegments) : 0;
        const signalwireCost = signalwireTotalCost * smsRatio;

        return {
            churchId: tenant.churchId,
            name: tenant.name,
            gcpCost,
            postmarkCost,
            signalwireCost,
            totalCost: gcpCost + postmarkCost + signalwireCost,
            metrics: tenant.metrics
        };
    });

    return {
        period,
        totals: {
            gcpCost: gcpTotalCost,
            postmarkCost: postmarkTotalCost,
            signalwireCost: signalwireTotalCost,
            grandTotal: gcpTotalCost + postmarkTotalCost + signalwireTotalCost
        },
        tenants: reports
    };
}
