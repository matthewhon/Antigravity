import { GivingBatch, QuickbooksMappingConfig } from '../types';

function buildMockDepositPayload(batch: GivingBatch, mapping: QuickbooksMappingConfig) {
    if (!mapping.depositBankAccountId) {
        throw new Error('Target deposit bank account is not configured in QuickBooks mapping.');
    }

    const lines: any[] = [];

    // 1. Positive Lines: Fund breakdown (Income)
    for (const fund of batch.fundsBreakdown) {
        if (fund.grossAmount <= 0) continue;

        const fundMap = mapping.fundMappings[fund.fundId];
        const accountId = fundMap?.qboAccountId || mapping.defaultIncomeAccountId;

        if (!accountId) {
            throw new Error(`Fund "${fund.fundName}" is not mapped to a QuickBooks Income Account, and no default income account is set.`);
        }

        const depositLineDetail: any = {
            AccountRef: {
                value: accountId,
                name: fundMap?.qboAccountName || mapping.defaultIncomeAccountName
            }
        };

        if (fundMap?.qboClassId) {
            depositLineDetail.ClassRef = {
                value: fundMap.qboClassId,
                name: fundMap.qboClassName
            };
        }

        lines.push({
            Amount: fund.grossAmount,
            DetailType: 'DepositLineDetail',
            Description: `${fund.fundName} - ${batch.name}`,
            DepositLineDetail: depositLineDetail
        });
    }

    // 2. Negative Line: Stripe Credit Card / ACH Processing Fees (Expense)
    if (batch.totalFees > 0) {
        if (!mapping.stripeFeeExpenseAccountId) {
            throw new Error('Stripe Fee Expense Account is not configured, but this batch has processing fees.');
        }

        const feeLineDetail: any = {
            AccountRef: {
                value: mapping.stripeFeeExpenseAccountId,
                name: mapping.stripeFeeExpenseAccountName
            }
        };

        if (mapping.stripeVendorId) {
            feeLineDetail.Entity = {
                Type: 'Vendor',
                EntityRef: {
                    value: mapping.stripeVendorId,
                    name: mapping.stripeVendorName || 'Stripe'
                }
            };
        }

        lines.push({
            Amount: -Math.abs(batch.totalFees),
            DetailType: 'DepositLineDetail',
            Description: `Stripe Processing Fees - ${batch.name}`,
            DepositLineDetail: feeLineDetail
        });
    }

    const txnDate = (batch.date || new Date().toISOString()).slice(0, 10);
    const privateNote = `Giving Batch: ${batch.name} (ID: ${batch.id})`;

    return {
        DepositToAccountRef: {
            value: mapping.depositBankAccountId,
            name: mapping.depositBankAccountName
        },
        TxnDate: txnDate,
        PrivateNote: privateNote,
        Line: lines
    };
}

function runTests() {
    console.log('--- Testing QuickBooks Deposit Payload Generator ---');

    const mockBatch: GivingBatch = {
        id: 'pco_batch_12345',
        churchId: 'church_abc',
        name: 'Sunday Morning Service Offering',
        date: '2026-09-06T10:30:00Z',
        batchType: 'stripe',
        status: 'committed',
        totalGross: 3250.00,
        totalFees: 72.35,
        totalNet: 3177.65,
        donationCount: 42,
        fundsBreakdown: [
            {
                fundId: 'fund_1',
                fundName: 'General Tithes & Offerings',
                grossAmount: 2500.00,
                feeAmount: 55.65,
                netAmount: 2444.35,
                donationCount: 30
            },
            {
                fundId: 'fund_2',
                fundName: 'Building Campaign',
                grossAmount: 500.00,
                feeAmount: 11.13,
                netAmount: 488.87,
                donationCount: 8
            },
            {
                fundId: 'fund_3',
                fundName: 'Youth Ministry',
                grossAmount: 250.00,
                feeAmount: 5.57,
                netAmount: 244.43,
                donationCount: 4
            }
        ]
    };

    const mockMapping: QuickbooksMappingConfig = {
        churchId: 'church_abc',
        depositBankAccountId: 'qbo_acc_checking_1001',
        depositBankAccountName: 'PNC Operating Checking (1001)',
        stripeFeeExpenseAccountId: 'qbo_acc_fees_6050',
        stripeFeeExpenseAccountName: 'Merchant & Card Processing Fees (6050)',
        stripeVendorId: 'vendor_stripe_99',
        stripeVendorName: 'Stripe',
        defaultIncomeAccountId: 'qbo_acc_income_4000',
        defaultIncomeAccountName: 'Tithes & Offerings (4000)',
        fundMappings: {
            'fund_1': {
                qboAccountId: 'qbo_acc_tithes_4010',
                qboAccountName: 'General Tithes (4010)',
                qboClassId: 'class_sanctuary',
                qboClassName: 'Main Sanctuary'
            },
            'fund_2': {
                qboAccountId: 'qbo_acc_building_4020',
                qboAccountName: 'Building Expansion Fund (4020)'
            },
            'fund_3': {
                qboAccountId: 'qbo_acc_youth_4030',
                qboAccountName: 'Youth Ministry Income (4030)',
                qboClassId: 'class_youth',
                qboClassName: 'NextGen'
            }
        }
    };

    const payload = buildMockDepositPayload(mockBatch, mockMapping);

    // 1. Check Bank Account
    console.assert(payload.DepositToAccountRef.value === 'qbo_acc_checking_1001', 'DepositToAccountRef must match');
    console.log('✓ Target Deposit Bank Account verified: ', payload.DepositToAccountRef.name);

    // 2. Check Date
    console.assert(payload.TxnDate === '2026-09-06', 'TxnDate must be YYYY-MM-DD');
    console.log('✓ Transaction Date verified: ', payload.TxnDate);

    // 3. Check Fund Lines
    console.assert(payload.Line.length === 4, `Expected 4 lines (3 funds + 1 fee), got ${payload.Line.length}`);
    const fund1Line = payload.Line[0];
    console.assert(fund1Line.Amount === 2500.00, 'Fund 1 amount must be 2500.00');
    console.assert(fund1Line.DepositLineDetail.AccountRef.value === 'qbo_acc_tithes_4010', 'Fund 1 AccountRef must match');
    console.assert(fund1Line.DepositLineDetail.ClassRef.value === 'class_sanctuary', 'Fund 1 ClassRef must match');
    console.log('✓ Fund Line 1 (General Tithes) verified: $', fund1Line.Amount, 'to Account:', fund1Line.DepositLineDetail.AccountRef.name);

    // 4. Check Fee Line
    const feeLine = payload.Line[3];
    console.assert(feeLine.Amount === -72.35, `Fee line amount must be -72.35, got ${feeLine.Amount}`);
    console.assert(feeLine.DepositLineDetail.AccountRef.value === 'qbo_acc_fees_6050', 'Fee AccountRef must match');
    console.assert(feeLine.DepositLineDetail.Entity.EntityRef.value === 'vendor_stripe_99', 'Fee Vendor must match');
    console.log('✓ Fee Line (Stripe Processing) verified: $', feeLine.Amount, 'to Account:', feeLine.DepositLineDetail.AccountRef.name);

    // 5. Check Sum Matches Net Deposit Exactly
    const calculatedNet = payload.Line.reduce((sum: number, line: any) => sum + line.Amount, 0);
    const roundedNet = Math.round(calculatedNet * 100) / 100;
    console.assert(roundedNet === mockBatch.totalNet, `Net deposit (${roundedNet}) must equal batch net (${mockBatch.totalNet})`);
    console.log('✓ Net Deposit matches batch net to the penny:', roundedNet, '==', mockBatch.totalNet);

    console.log('\nAll QuickBooks Deposit Payload tests passed successfully!');
}

runTests();
