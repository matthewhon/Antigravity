import { DetailedDonation, GivingBatchFundBreakdown } from '../types';
import { ParentDonationGroup } from './payoutMatcherService';

export interface StripeCsvRow {
    date: string;
    type: string;
    source: string;
    name: string;
    fundOrSignup: string;
    gross: number;
    fee: number;
    net: number;
    paymentMethod: string;
    description: string;
    donationId?: string;
    parsedFunds?: { fundName: string; amount: number }[];
}

export interface StripeCsvParseResult {
    rows: StripeCsvRow[];
    totalGross: number;
    totalFees: number;
    totalNet: number;
    totalTithe: number;
    transactionCount: number;
    minDate: string;
    maxDate: string;
    matchedExistingCount: number;
    synthesizedCount: number;
    alreadyBatchedCount: number;
    allDonations: DetailedDonation[];
    parentGroups: ParentDonationGroup[];
    fundsBreakdown: GivingBatchFundBreakdown[];
    suggestedPayoutId: string;
    suggestedBatchName: string;
    warningMessages: string[];
}

/**
 * Robust RFC 4180-compliant CSV line splitter that correctly handles
 * quoted fields with embedded commas and escaped quotes.
 */
export function parseCsvRows(text: string): string[][] {
    const lines: string[][] = [];
    const cleanText = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    
    let currentRow: string[] = [];
    let currentField = '';
    let inQuotes = false;
    let i = 0;

    while (i < cleanText.length) {
        const char = cleanText[i];
        const nextChar = cleanText[i + 1];

        if (char === '"') {
            if (inQuotes && nextChar === '"') {
                currentField += '"';
                i += 2;
                continue;
            }
            inQuotes = !inQuotes;
            i++;
            continue;
        }

        if (char === ',' && !inQuotes) {
            currentRow.push(currentField.trim());
            currentField = '';
            i++;
            continue;
        }

        if (char === '\n' && !inQuotes) {
            currentRow.push(currentField.trim());
            if (currentRow.some(cell => cell.length > 0)) {
                lines.push(currentRow);
            }
            currentRow = [];
            currentField = '';
            i++;
            continue;
        }

        currentField += char;
        i++;
    }

    if (currentField.length > 0 || currentRow.length > 0) {
        currentRow.push(currentField.trim());
        if (currentRow.some(cell => cell.length > 0)) {
            lines.push(currentRow);
        }
    }

    return lines;
}

/**
 * Clean and parse monetary strings (e.g. "$20,000.00", "430.30", "-526.33") into numbers
 */
function parseMoney(val: any): number {
    if (typeof val === 'number') return isNaN(val) ? 0 : val;
    if (!val) return 0;
    const cleaned = String(val).replace(/[$,]/g, '').trim();
    const num = parseFloat(cleaned);
    return isNaN(num) ? 0 : num;
}

/**
 * Extract donation ID from Description string (e.g. "Donation #400345658 - Lynne LG...")
 */
export function extractDonationId(description: string): string | undefined {
    if (!description) return undefined;
    const match = description.match(/(?:Donation|Payment|Charge)?\s*#?(\d{6,12})/i);
    return match ? match[1] : undefined;
}

/**
 * Extract split fund allocations from Description
 * e.g. "Donation #400338830 - Jacob Lofton - Tithes and Offerings ($75.60) Regular Missions ($30.00)"
 */
export function extractSplitFundsFromDescription(description: string): { fundName: string; amount: number }[] {
    if (!description) return [];
    const results: { fundName: string; amount: number }[] = [];
    // Match patterns like "Tithes and Offerings ($75.60)" or "Regular Missions ($30.00)"
    const regex = /([A-Za-z0-9\s&/\-_.]+?)\s*\(\$([0-9,.]+)\)/g;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(description)) !== null) {
        let name = match[1].trim();
        // Remove leading prefixes like "- " or "Donation #12345 - Donor Name - "
        if (name.includes(' - ')) {
            const parts = name.split(' - ');
            name = parts[parts.length - 1].trim();
        }
        const amt = parseMoney(match[2]);
        if (name && amt > 0) {
            results.push({ fundName: name, amount: amt });
        }
    }

    return results;
}

/**
 * Main parser: takes CSV string and matches against existing DetailedDonations
 */
export function parseStripePayoutCsv(
    csvContent: string,
    churchId: string,
    existingDonations: DetailedDonation[] = []
): StripeCsvParseResult {
    const rawRows = parseCsvRows(csvContent);
    if (rawRows.length < 2) {
        throw new Error('CSV file is empty or missing headers.');
    }

    // Map headers
    const headerRow = rawRows[0].map(h => h.toLowerCase().trim());
    const colIndex = {
        date: headerRow.findIndex(h => h === 'date' || h.includes('created')),
        type: headerRow.findIndex(h => h === 'type'),
        source: headerRow.findIndex(h => h === 'source'),
        name: headerRow.findIndex(h => h === 'name' || h.includes('donor') || h.includes('customer')),
        fund: headerRow.findIndex(h => h.includes('fund') || h.includes('signup')),
        gross: headerRow.findIndex(h => h === 'gross' || h === 'amount' || h.includes('gross amount')),
        fee: headerRow.findIndex(h => h === 'fee' || h === 'fees' || h.includes('fee amount')),
        net: headerRow.findIndex(h => h === 'net' || h.includes('net amount')),
        method: headerRow.findIndex(h => h.includes('method') || h.includes('payment method')),
        description: headerRow.findIndex(h => h === 'description' || h.includes('desc')),
        donationId: headerRow.findIndex(h => h.includes('donation id') || h === 'id')
    };

    if (colIndex.gross === -1 && colIndex.net === -1) {
        throw new Error('Invalid CSV format: Missing "Gross" or "Amount" column.');
    }

    const rows: StripeCsvRow[] = [];
    let totalGross = 0;
    let totalFees = 0;
    let totalNet = 0;
    let totalTithe = 0;
    let minDate = '9999-99-99';
    let maxDate = '0000-00-00';

    for (let r = 1; r < rawRows.length; r++) {
        const row = rawRows[r];
        if (!row || row.length === 0 || row.every(c => !c)) continue;

        const dateVal = colIndex.date !== -1 ? (row[colIndex.date] || '').slice(0, 10) : '';
        const typeVal = colIndex.type !== -1 ? row[colIndex.type] || 'Charge' : 'Charge';
        const sourceVal = colIndex.source !== -1 ? row[colIndex.source] || 'Giving' : 'Giving';
        const nameVal = colIndex.name !== -1 ? row[colIndex.name] || 'Donor' : 'Donor';
        const fundVal = colIndex.fund !== -1 ? row[colIndex.fund] || 'Tithes and Offerings' : 'Tithes and Offerings';
        const descVal = colIndex.description !== -1 ? row[colIndex.description] || '' : '';
        const methodVal = colIndex.method !== -1 ? row[colIndex.method] || 'card' : 'card';

        let grossVal = colIndex.gross !== -1 ? parseMoney(row[colIndex.gross]) : 0;
        let feeVal = colIndex.fee !== -1 ? Math.abs(parseMoney(row[colIndex.fee])) : 0;
        let netVal = colIndex.net !== -1 ? parseMoney(row[colIndex.net]) : grossVal - feeVal;

        // If net is negative because of a refund
        if (typeVal.toLowerCase().includes('refund')) {
            grossVal = -Math.abs(grossVal);
            netVal = -Math.abs(netVal);
        }

        let donId: string | undefined;
        if (colIndex.donationId !== -1 && row[colIndex.donationId]) {
            donId = row[colIndex.donationId].trim();
        }
        if (!donId) {
            donId = extractDonationId(descVal);
        }

        const parsedFunds = extractSplitFundsFromDescription(descVal);

        rows.push({
            date: dateVal,
            type: typeVal,
            source: sourceVal,
            name: nameVal,
            fundOrSignup: fundVal,
            gross: Math.round(grossVal * 100) / 100,
            fee: Math.round(feeVal * 100) / 100,
            net: Math.round(netVal * 100) / 100,
            paymentMethod: methodVal.toLowerCase().includes('ach') ? 'ach' : 'card',
            description: descVal,
            donationId: donId,
            parsedFunds: parsedFunds.length > 0 ? parsedFunds : undefined
        });

        totalGross += grossVal;
        totalFees += feeVal;
        totalNet += netVal;

        if (dateVal) {
            if (dateVal < minDate) minDate = dateVal;
            if (dateVal > maxDate) maxDate = dateVal;
        }
    }

    if (rows.length === 0) {
        throw new Error('No transaction rows found in CSV.');
    }

    // Round financial summaries
    totalGross = Math.round(totalGross * 100) / 100;
    totalFees = Math.round(totalFees * 100) / 100;
    totalNet = Math.round(totalNet * 100) / 100;

    // Index existing donations by root ID and donor+date+amount
    const existingById = new Map<string, DetailedDonation[]>();
    existingDonations.forEach(d => {
        const rootId = d.id.includes('_') ? d.id.split('_')[0] : d.id;
        if (!existingById.has(rootId)) existingById.set(rootId, []);
        existingById.get(rootId)!.push(d);
    });

    const allDonations: DetailedDonation[] = [];
    const parentGroups: ParentDonationGroup[] = [];
    const warningMessages: string[] = [];
    let matchedExistingCount = 0;
    let synthesizedCount = 0;
    let alreadyBatchedCount = 0;

    // Track matched root IDs to prevent duplicates
    const matchedRootIds = new Set<string>();

    rows.forEach((row, idx) => {
        let matched: DetailedDonation[] | null = null;

        // 1. Try match by Donation ID
        if (row.donationId && existingById.has(row.donationId)) {
            matched = existingById.get(row.donationId)!;
        }

        // 2. Fallback: match by donor name + gross amount + approximate date
        if (!matched) {
            for (const [rId, desigs] of Array.from(existingById.entries())) {
                if (matchedRootIds.has(rId)) continue;
                const dGross = desigs.reduce((s, d) => s + (d.amount || 0), 0);
                if (Math.abs(dGross - row.gross) < 0.01) {
                    const first = desigs[0];
                    const donorMatches = first.donorName?.toLowerCase().trim() === row.name.toLowerCase().trim();
                    const dateMatches = !!row.date && Math.abs(new Date(first.date).getTime() - new Date(row.date).getTime()) <= 86400000 * 2;
                    if (donorMatches && dateMatches) {
                        matched = desigs;
                        break;
                    }
                }
            }
        }

        if (matched && matched.length > 0) {
            matchedExistingCount++;
            const rootId = matched[0].id.includes('_') ? matched[0].id.split('_')[0] : matched[0].id;
            matchedRootIds.add(rootId);

            const isAlreadyBatched = matched.some(d => !!d.batchId);
            if (isAlreadyBatched) {
                alreadyBatchedCount++;
                warningMessages.push(`Donation #${rootId} (${row.name}) was already assigned to batch "${matched[0].batchName || matched[0].batchId}". It will be included in this payout batch.`);
            }

            matched.forEach(d => allDonations.push(d));

            const pGross = matched.reduce((s, d) => s + (d.amount || 0), 0);
            const pFee = matched.reduce((s, d) => s + Math.abs(d.fee || 0), 0) || row.fee;
            const pTithe = matched
                .filter(d => /tithe|general|operating|budget|tithes|offering|ministry|kingdom|unrestricted/i.test(d.fundName || ''))
                .reduce((s, d) => s + (d.amount || 0), 0);

            totalTithe += pTithe;

            parentGroups.push({
                rootId,
                gross: Math.round(pGross * 100) / 100,
                fee: Math.round(pFee * 100) / 100,
                net: Math.round((pGross - pFee) * 100) / 100,
                tithe: Math.round(pTithe * 100) / 100,
                date: matched[0].date || row.date,
                donorName: matched[0].donorName || row.name,
                paymentMethod: row.paymentMethod,
                paymentSource: 'Stripe CSV',
                batchId: matched[0].batchId || null,
                designations: matched
            });
        } else {
            // Synthesize from CSV row if not found in database
            synthesizedCount++;
            const rootId = row.donationId || `csv_${row.date.replace(/-/g, '')}_${idx + 1}`;
            const synthesizedDesigs: DetailedDonation[] = [];

            if (row.parsedFunds && row.parsedFunds.length > 0) {
                row.parsedFunds.forEach((pf, pfi) => {
                    const d: DetailedDonation = {
                        id: `${rootId}_${pfi}`,
                        churchId,
                        amount: pf.amount,
                        date: new Date(row.date || maxDate).toISOString(),
                        fundName: pf.fundName,
                        donorId: `csv_donor_${idx}`,
                        donorName: row.name,
                        isRecurring: false,
                        paymentMethod: row.paymentMethod,
                        paymentSource: 'Stripe CSV',
                        fee: pfi === 0 ? row.fee : 0
                    };
                    synthesizedDesigs.push(d);
                    allDonations.push(d);
                });
            } else {
                const d: DetailedDonation = {
                    id: rootId,
                    churchId,
                    amount: row.gross,
                    date: new Date(row.date || maxDate).toISOString(),
                    fundName: row.fundOrSignup,
                    donorId: `csv_donor_${idx}`,
                    donorName: row.name,
                    isRecurring: false,
                    paymentMethod: row.paymentMethod,
                    paymentSource: 'Stripe CSV',
                    fee: row.fee
                };
                synthesizedDesigs.push(d);
                allDonations.push(d);
            }

            const pTithe = synthesizedDesigs
                .filter(d => /tithe|general|operating|budget|tithes|offering|ministry|kingdom|unrestricted/i.test(d.fundName || ''))
                .reduce((s, d) => s + (d.amount || 0), 0);

            totalTithe += pTithe;

            parentGroups.push({
                rootId,
                gross: row.gross,
                fee: row.fee,
                net: row.net,
                tithe: Math.round(pTithe * 100) / 100,
                date: row.date,
                donorName: row.name,
                paymentMethod: row.paymentMethod,
                paymentSource: 'Stripe CSV',
                batchId: null,
                designations: synthesizedDesigs
            });
        }
    });

    // Compute Fund Breakdown
    const fundMap = new Map<string, GivingBatchFundBreakdown>();
    allDonations.forEach(d => {
        const key = d.fundName || 'General Giving';
        if (!fundMap.has(key)) {
            fundMap.set(key, {
                fundId: d.fundId || key.toLowerCase().replace(/[^a-z0-9]/g, '_'),
                fundName: key,
                campusId: d.campusId || null,
                campusName: d.campusName || null,
                grossAmount: 0,
                feeAmount: 0,
                netAmount: 0,
                donationCount: 0
            });
        }
        const f = fundMap.get(key)!;
        f.grossAmount += (d.amount || 0);
        f.feeAmount += Math.abs(d.fee || 0);
        f.netAmount += (d.amount || 0) - Math.abs(d.fee || 0);
        f.donationCount += 1;
    });

    const fundsBreakdown = Array.from(fundMap.values()).map(f => ({
        ...f,
        grossAmount: Math.round(f.grossAmount * 100) / 100,
        feeAmount: Math.round(f.feeAmount * 100) / 100,
        netAmount: Math.round(f.netAmount * 100) / 100
    }));

    // Sort parent groups descending by date
    parentGroups.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    const pDateClean = (maxDate !== '0000-00-00' ? maxDate : new Date().toISOString().slice(0, 10));
    const suggestedPayoutId = `payout_${pDateClean.replace(/-/g, '')}`;
    const suggestedBatchName = `${pDateClean} Stripe Payout ($${totalNet.toFixed(2)} Net)`;

    return {
        rows,
        totalGross,
        totalFees,
        totalNet,
        totalTithe: Math.round(totalTithe * 100) / 100,
        transactionCount: parentGroups.length,
        minDate: minDate !== '9999-99-99' ? minDate : pDateClean,
        maxDate: pDateClean,
        matchedExistingCount,
        synthesizedCount,
        alreadyBatchedCount,
        allDonations,
        parentGroups,
        fundsBreakdown,
        suggestedPayoutId,
        suggestedBatchName,
        warningMessages
    };
}
