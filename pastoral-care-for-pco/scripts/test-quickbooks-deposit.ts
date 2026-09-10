import { GivingBatch, QuickbooksMappingConfig, FundQuickbooksMapping } from '../types';

function buildMockDepositPayload(
    batch: GivingBatch, 
    mapping: QuickbooksMappingConfig,
    options?: {
        depositBankAccountId?: string;
        depositBankAccountName?: string;
        fundOverrides?: Record<string, FundQuickbooksMapping>;
    }
) {
    const targetBankAccountId = options?.depositBankAccountId || mapping.depositBankAccountId;
    const targetBankAccountName = options?.depositBankAccountName || mapping.depositBankAccountName;

    if (!targetBankAccountId) {
        throw new Error('Target deposit bank account is not configured or specified.');
    }

    const lines: any[] = [];

    // 1. Positive Lines: 1-to-1 Fund breakdown (Income)
    for (const fund of batch.fundsBreakdown) {
        if (fund.grossAmount <= 0) continue;

        const overrideKey = fund.campusId ? `${fund.campusId}_${fund.fundId}` : fund.fundId;
        const campusSpecificMap = (mapping.enableCampusMapping && fund.campusId)
            ? mapping.campusFundMappings?.[fund.campusId]?.[fund.fundId]
            : undefined;

        const fundMap = options?.fundOverrides?.[overrideKey] 
            || options?.fundOverrides?.[fund.fundId] 
            || campusSpecificMap 
            || mapping.fundMappings[fund.fundId];

        const accountId = fundMap?.qboAccountId || mapping.defaultIncomeAccountId;

        if (!accountId) {
            const campusLabel = fund.campusName ? ` (${fund.campusName})` : '';
            throw new Error(`Fund "${fund.fundName}"${campusLabel} is not mapped to a QuickBooks Income Account, and no default income account is set.`);
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

        const lineDesc = fund.campusName 
            ? `${fund.fundName} (${fund.campusName}) - ${batch.name}`
            : `${fund.fundName} - ${batch.name}`;

        lines.push({
            Amount: fund.grossAmount,
            DetailType: 'DepositLineDetail',
            Description: lineDesc,
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
            value: targetBankAccountId,
            name: targetBankAccountName
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

    // Test 1: Standard deposit using configured default bank account and 1-to-1 fund mappings
    console.log('\nTest 1: Default deposit account & 1-to-1 fund mappings:');
    const payload = buildMockDepositPayload(mockBatch, mockMapping);

    console.assert(payload.DepositToAccountRef.value === 'qbo_acc_checking_1001', 'DepositToAccountRef must match');
    console.log('✓ Target Deposit Bank Account verified: ', payload.DepositToAccountRef.name);
    console.assert(payload.TxnDate === '2026-09-06', 'TxnDate must be YYYY-MM-DD');
    console.log('✓ Transaction Date verified: ', payload.TxnDate);

    console.assert(payload.Line.length === 4, `Expected 4 lines (3 funds + 1 fee), got ${payload.Line.length}`);
    const fund1Line = payload.Line[0];
    console.assert(fund1Line.Amount === 2500.00, 'Fund 1 amount must be 2500.00');
    console.assert(fund1Line.DepositLineDetail.AccountRef.value === 'qbo_acc_tithes_4010', 'Fund 1 AccountRef must match');
    console.assert(fund1Line.DepositLineDetail.ClassRef.value === 'class_sanctuary', 'Fund 1 ClassRef must match');
    console.log('✓ Fund Line 1 (General Tithes) verified: $', fund1Line.Amount, 'to Account:', fund1Line.DepositLineDetail.AccountRef.name);

    const feeLine = payload.Line[3];
    console.assert(feeLine.Amount === -72.35, `Fee line amount must be -72.35, got ${feeLine.Amount}`);
    console.assert(feeLine.DepositLineDetail.AccountRef.value === 'qbo_acc_fees_6050', 'Fee AccountRef must match');
    console.assert(feeLine.DepositLineDetail.Entity.EntityRef.value === 'vendor_stripe_99', 'Fee Vendor must match');
    console.log('✓ Fee Line (Stripe Processing) verified: $', feeLine.Amount, 'to Account:', feeLine.DepositLineDetail.AccountRef.name);

    const calculatedNet = payload.Line.reduce((sum: number, line: any) => sum + line.Amount, 0);
    const roundedNet = Math.round(calculatedNet * 100) / 100;
    console.assert(roundedNet === mockBatch.totalNet, `Net deposit (${roundedNet}) must equal batch net (${mockBatch.totalNet})`);
    console.log('✓ Net Deposit matches batch net to the penny:', roundedNet, '==', mockBatch.totalNet);

    // Test 2: Specifying a custom deposit bank account for this deposit
    console.log('\nTest 2: Specifying a custom target deposit account:');
    const customBankPayload = buildMockDepositPayload(mockBatch, mockMapping, {
        depositBankAccountId: 'qbo_acc_building_checking_1002',
        depositBankAccountName: 'Capital Projects Checking (1002)'
    });
    console.assert(customBankPayload.DepositToAccountRef.value === 'qbo_acc_building_checking_1002', 'Must use specified bank account');
    console.assert(customBankPayload.DepositToAccountRef.name === 'Capital Projects Checking (1002)', 'Must use specified bank name');
    console.log('✓ Custom Target Deposit Account verified:', customBankPayload.DepositToAccountRef.name);

    // Test 3: Specifying 1-to-1 fund overrides on the fly
    console.log('\nTest 3: Specifying 1-to-1 fund mapping overrides:');
    const overridePayload = buildMockDepositPayload(mockBatch, mockMapping, {
        fundOverrides: {
            'fund_2': {
                qboAccountId: 'qbo_acc_special_missions_4099',
                qboAccountName: 'Special Mission Projects (4099)'
            }
        }
    });
    const overriddenFund2Line = overridePayload.Line.find(l => l.Description.startsWith('Building Campaign'));
    console.assert(overriddenFund2Line?.DepositLineDetail.AccountRef.value === 'qbo_acc_special_missions_4099', 'Must use overridden fund account');
    console.log('✓ 1-to-1 Fund Mapping Override verified: Fund 2 deposited to', overriddenFund2Line?.DepositLineDetail.AccountRef.name);

    // Test 4: Multi-Campus Fund Mapping & Location Routing
    console.log('\nTest 4: Multi-Campus Fund Mapping (Per-Campus Accounts & Classes):');
    const multiCampusBatch: GivingBatch = {
        id: 'pco_batch_multi_campus_999',
        churchId: 'church_abc',
        name: 'Combined Sunday Offering',
        date: '2026-09-06T12:00:00Z',
        batchType: 'stripe',
        status: 'committed',
        totalGross: 1250.00,
        totalFees: 28.50,
        totalNet: 1221.50,
        donationCount: 15,
        fundsBreakdown: [
            {
                fundId: 'fund_1',
                fundName: 'General Tithes',
                campusId: 'campus_north',
                campusName: 'North Campus',
                grossAmount: 600.00,
                feeAmount: 13.50,
                netAmount: 586.50,
                donationCount: 8
            },
            {
                fundId: 'fund_1',
                fundName: 'General Tithes',
                campusId: 'campus_south',
                campusName: 'South Campus',
                grossAmount: 400.00,
                feeAmount: 10.00,
                netAmount: 390.00,
                donationCount: 5
            },
            {
                fundId: 'fund_2',
                fundName: 'Building Campaign',
                campusId: 'campus_north',
                campusName: 'North Campus',
                grossAmount: 250.00,
                feeAmount: 5.00,
                netAmount: 245.00,
                donationCount: 2
            }
        ]
    };

    const multiCampusMapping: QuickbooksMappingConfig = {
        ...mockMapping,
        enableCampusMapping: true,
        campusFundMappings: {
            'campus_north': {
                'fund_1': {
                    qboAccountId: 'qbo_acc_north_tithes_4011',
                    qboAccountName: 'North Campus Tithes (4011)',
                    qboClassId: 'class_north_campus',
                    qboClassName: 'North Campus'
                },
                'fund_2': {
                    qboAccountId: 'qbo_acc_north_building_4021',
                    qboAccountName: 'North Building Fund (4021)',
                    qboClassId: 'class_north_campus',
                    qboClassName: 'North Campus'
                }
            },
            'campus_south': {
                'fund_1': {
                    qboAccountId: 'qbo_acc_south_tithes_4012',
                    qboAccountName: 'South Campus Tithes (4012)',
                    qboClassId: 'class_south_campus',
                    qboClassName: 'South Campus'
                }
            }
        }
    };

    const multiCampusPayload = buildMockDepositPayload(multiCampusBatch, multiCampusMapping);
    console.assert(multiCampusPayload.Line.length === 4, `Expected 4 lines (3 fund + 1 fee), got ${multiCampusPayload.Line.length}`);

    // North Campus Tithes line
    const northTithesLine = multiCampusPayload.Line[0];
    console.assert(northTithesLine.Amount === 600.00, 'North Tithes must be 600.00');
    console.assert(northTithesLine.DepositLineDetail.AccountRef.value === 'qbo_acc_north_tithes_4011', 'North Tithes must route to North Tithes account');
    console.assert(northTithesLine.DepositLineDetail.ClassRef.value === 'class_north_campus', 'North Tithes must have North Campus class');
    console.assert(northTithesLine.Description.includes('(North Campus)'), 'Line description must include campus name');
    console.log('✓ North Campus Tithes verified: $', northTithesLine.Amount, 'routed to', northTithesLine.DepositLineDetail.AccountRef.name, 'with Class:', northTithesLine.DepositLineDetail.ClassRef.name);

    // South Campus Tithes line
    const southTithesLine = multiCampusPayload.Line[1];
    console.assert(southTithesLine.Amount === 400.00, 'South Tithes must be 400.00');
    console.assert(southTithesLine.DepositLineDetail.AccountRef.value === 'qbo_acc_south_tithes_4012', 'South Tithes must route to South Tithes account');
    console.assert(southTithesLine.DepositLineDetail.ClassRef.value === 'class_south_campus', 'South Tithes must have South Campus class');
    console.assert(southTithesLine.Description.includes('(South Campus)'), 'Line description must include campus name');
    console.log('✓ South Campus Tithes verified: $', southTithesLine.Amount, 'routed to', southTithesLine.DepositLineDetail.AccountRef.name, 'with Class:', southTithesLine.DepositLineDetail.ClassRef.name);

    // North Campus Building line
    const northBuildingLine = multiCampusPayload.Line[2];
    console.assert(northBuildingLine.Amount === 250.00, 'North Building must be 250.00');
    console.assert(northBuildingLine.DepositLineDetail.AccountRef.value === 'qbo_acc_north_building_4021', 'North Building must route to North Building account');
    console.log('✓ North Campus Building verified: $', northBuildingLine.Amount, 'routed to', northBuildingLine.DepositLineDetail.AccountRef.name);

    // Multi-campus Net deposit to the penny
    const mcNet = multiCampusPayload.Line.reduce((sum: number, line: any) => sum + line.Amount, 0);
    const mcNetRounded = Math.round(mcNet * 100) / 100;
    console.assert(mcNetRounded === multiCampusBatch.totalNet, `Multi-campus net (${mcNetRounded}) must equal batch net (${multiCampusBatch.totalNet})`);
    console.log('✓ Multi-campus Net Deposit matches to the penny:', mcNetRounded, '==', multiCampusBatch.totalNet);

    console.log('\nAll QuickBooks Deposit Payload tests passed successfully!');
}

runTests();
