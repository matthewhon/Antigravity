import express from 'express';
import { getDb } from './firebase';
import { 
    getAuthUrl, exchangeCodeForTokens, getValidTokens, 
    disconnectQuickBooks, fetchAccounts, createQuickbooksDeposit 
} from './quickbooksService';
import { 
    sendBatchReadyNotification, sendBatchSyncedNotification, sendTestNotification 
} from './quickbooksNotificationService';
import { QuickbooksMappingConfig, GivingBatch } from '../types';

export const quickbooksRouter = express.Router();

// ─── GET /api/quickbooks/auth ───────────────────────────────────────────────
// Redirects user to Intuit OAuth 2.0 Authorization Screen
quickbooksRouter.get('/auth', async (req: any, res: any) => {
    try {
        const churchId = String(req.query.churchId || '').trim();
        if (!churchId) {
            return res.status(400).send('Missing churchId query parameter');
        }

        const url = await getAuthUrl(churchId);
        res.redirect(url);
    } catch (error: any) {
        console.error('QuickBooks auth error:', error);
        res.status(500).send(`Failed to initiate QuickBooks authorization: ${error.message}`);
    }
});

// ─── GET /api/quickbooks/callback ───────────────────────────────────────────
// Receives authorization code and realmId from Intuit
quickbooksRouter.get('/callback', async (req: any, res: any) => {
    try {
        const { code, realmId, state } = req.query;
        if (!code || !realmId) {
            return res.status(400).send('Missing code or realmId from QuickBooks callback');
        }

        let churchId = '';
        if (state) {
            try {
                const parsed = JSON.parse(Buffer.from(String(state), 'base64').toString('utf8'));
                churchId = parsed.churchId || '';
            } catch (e) {
                console.error('Failed to parse state:', e);
            }
        }

        if (!churchId) {
            return res.status(400).send('Could not determine churchId from callback state');
        }

        await exchangeCodeForTokens(String(code), String(realmId), churchId);

        // Redirect back to Giving Batches in the frontend
        res.redirect('/giving/batches?qbo=connected');
    } catch (error: any) {
        console.error('QuickBooks callback error:', error);
        res.redirect(`/giving/batches?qbo_error=${encodeURIComponent(error.message)}`);
    }
});

// ─── GET /api/quickbooks/status ─────────────────────────────────────────────
quickbooksRouter.get('/status', async (req: any, res: any) => {
    try {
        const churchId = String(req.query.churchId || '').trim();
        if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

        const tokens = await getValidTokens(churchId);
        if (!tokens) {
            return res.json({ connected: false, hasMapping: false });
        }

        const db = getDb();
        const mappingDoc = await db.collection('churches').doc(churchId).collection('quickbooks_mapping').doc('config').get();
        const mapping = mappingDoc.data() as QuickbooksMappingConfig | undefined;

        const hasMapping = !!(mapping?.depositBankAccountId && mapping?.stripeFeeExpenseAccountId);

        return res.json({
            connected: true,
            companyName: tokens.companyName || 'QuickBooks Company',
            realmId: tokens.realmId,
            lastConnected: new Date(tokens.connectedAt).toISOString(),
            hasMapping
        });
    } catch (error: any) {
        console.error('Error checking QuickBooks status:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── POST /api/quickbooks/disconnect ────────────────────────────────────────
quickbooksRouter.post('/disconnect', async (req: any, res: any) => {
    try {
        const { churchId } = req.body || {};
        if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

        await disconnectQuickBooks(churchId);
        res.json({ success: true, message: 'Disconnected from QuickBooks' });
    } catch (error: any) {
        console.error('Error disconnecting QuickBooks:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── GET /api/quickbooks/accounts ───────────────────────────────────────────
// Returns Chart of Accounts (Bank, Income, Expense), Classes, and Vendors
quickbooksRouter.get('/accounts', async (req: any, res: any) => {
    try {
        const churchId = String(req.query.churchId || '').trim();
        if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

        const data = await fetchAccounts(churchId);
        res.json(data);
    } catch (error: any) {
        console.error('Error fetching QuickBooks accounts:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── GET /api/quickbooks/mapping ────────────────────────────────────────────
quickbooksRouter.get('/mapping', async (req: any, res: any) => {
    try {
        const churchId = String(req.query.churchId || '').trim();
        if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

        const db = getDb();
        const doc = await db.collection('churches').doc(churchId).collection('quickbooks_mapping').doc('config').get();
        if (!doc.exists) {
            return res.json(null);
        }

        res.json(doc.data());
    } catch (error: any) {
        console.error('Error getting QuickBooks mapping:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── POST /api/quickbooks/mapping ───────────────────────────────────────────
quickbooksRouter.post('/mapping', async (req: any, res: any) => {
    try {
        const { churchId, mapping, userName } = req.body || {};
        if (!churchId || !mapping) return res.status(400).json({ error: 'Missing churchId or mapping' });

        const db = getDb();
        const configToSave: QuickbooksMappingConfig = {
            ...mapping,
            churchId,
            updatedAt: Date.now(),
            updatedBy: userName || 'System'
        };

        await db.collection('churches').doc(churchId).collection('quickbooks_mapping').doc('config').set(configToSave, { merge: true });
        res.json({ success: true, mapping: configToSave });
    } catch (error: any) {
        console.error('Error saving QuickBooks mapping:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── POST /api/quickbooks/deposit ───────────────────────────────────────────
// Creates a Deposit in QuickBooks for a specific Giving Batch
quickbooksRouter.post('/deposit', async (req: any, res: any) => {
    try {
        const { 
            churchId, 
            batchId, 
            userName, 
            depositBankAccountId, 
            depositBankAccountName, 
            fundOverrides, 
            saveAsDefault 
        } = req.body || {};

        if (!churchId || !batchId) {
            return res.status(400).json({ error: 'Missing churchId or batchId' });
        }

        const db = getDb();

        // 1. Fetch the batch from Firestore
        const batchDoc = await db.collection('churches').doc(churchId).collection('giving_batches').doc(batchId).get();
        if (!batchDoc.exists) {
            return res.status(404).json({ error: 'Giving batch not found' });
        }
        const batch = batchDoc.data() as GivingBatch;

        // 2. Fetch QuickBooks mapping
        const mappingDoc = await db.collection('churches').doc(churchId).collection('quickbooks_mapping').doc('config').get();
        let mapping = (mappingDoc.exists ? mappingDoc.data() : null) as QuickbooksMappingConfig | null;

        if (!mapping && !depositBankAccountId) {
            return res.status(400).json({ error: 'QuickBooks mapping is not configured. Please configure your accounts or select a deposit bank account.' });
        }

        const effectiveMapping: QuickbooksMappingConfig = mapping || {
            churchId,
            depositBankAccountId: depositBankAccountId || '',
            depositBankAccountName: depositBankAccountName || '',
            stripeFeeExpenseAccountId: '',
            fundMappings: {}
        };

        // 3. Create Deposit in QuickBooks with specified target account and fund overrides
        const depositResult = await createQuickbooksDeposit(churchId, batch, effectiveMapping, userName, {
            depositBankAccountId,
            depositBankAccountName,
            fundOverrides
        });

        // 4. Optionally update default mapping in Firestore if requested
        if (saveAsDefault) {
            const mappingUpdates: Partial<QuickbooksMappingConfig> = {
                churchId,
                updatedAt: Date.now(),
                updatedBy: userName || 'System'
            };

            if (depositBankAccountId) {
                mappingUpdates.depositBankAccountId = depositBankAccountId;
                mappingUpdates.depositBankAccountName = depositBankAccountName;
            }

            if (fundOverrides && Object.keys(fundOverrides).length > 0) {
                mappingUpdates.fundMappings = {
                    ...(effectiveMapping.fundMappings || {}),
                    ...fundOverrides
                };
            }

            await db.collection('churches').doc(churchId).collection('quickbooks_mapping').doc('config').set(mappingUpdates, { merge: true });
        }

        // 5. Update Batch status in Firestore
        const batchUpdates: Partial<GivingBatch> = {
            status: 'synced_to_qbo',
            quickbooksDepositId: depositResult.depositId,
            quickbooksDepositDocNumber: depositResult.docNumber,
            quickbooksDepositBankAccountId: depositResult.depositBankAccountId,
            quickbooksDepositBankAccountName: depositResult.depositBankAccountName,
            syncedAt: new Date().toISOString(),
            syncedBy: userName || 'User'
        };

        await batchDoc.ref.set(batchUpdates, { merge: true });

        // 6. Send email notification if enabled
        if (effectiveMapping.emailNotificationsEnabled && effectiveMapping.notifyOnBatchSynced !== false) {
            try {
                const notifyRes = await sendBatchSyncedNotification(
                    churchId, 
                    { ...batch, ...batchUpdates }, 
                    depositResult, 
                    effectiveMapping, 
                    userName
                );
                if (notifyRes.success) {
                    await batchDoc.ref.set({ syncedNotifiedAt: new Date().toISOString() }, { merge: true });
                }
            } catch (notifErr: any) {
                console.warn('[QuickbooksRoutes] Non-fatal notification error on deposit sync:', notifErr.message);
            }
        }

        res.json({
            success: true,
            depositResult,
            batch: { ...batch, ...batchUpdates }
        });
    } catch (error: any) {
        console.error('Error sending deposit to QuickBooks:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── POST /api/quickbooks/notify/test ───────────────────────────────────────
// Sends a sample test email to verify recipient resolution and provider setup
quickbooksRouter.post('/notify/test', async (req: any, res: any) => {
    try {
        const { churchId, mapping, testRecipientOverride } = req.body || {};
        if (!churchId) return res.status(400).json({ error: 'Missing churchId' });

        const effectiveMapping: QuickbooksMappingConfig = mapping || {};
        const result = await sendTestNotification(churchId, effectiveMapping, testRecipientOverride);

        if (!result.success) {
            return res.status(400).json({
                error: result.error || 'Failed to send test email',
                details: result
            });
        }

        res.json({
            success: true,
            message: `Test email successfully dispatched to ${result.recipientCount} recipient(s).`,
            recipients: result.recipients
        });
    } catch (error: any) {
        console.error('Error sending test notification:', error);
        res.status(500).json({ error: error.message });
    }
});

// ─── POST /api/quickbooks/notify/batch-ready ────────────────────────────────
// Manually triggers a batch-ready notification email for a specific batch
quickbooksRouter.post('/notify/batch-ready', async (req: any, res: any) => {
    try {
        const { churchId, batchId } = req.body || {};
        if (!churchId || !batchId) return res.status(400).json({ error: 'Missing churchId or batchId' });

        const db = getDb();
        const [batchDoc, mappingDoc] = await Promise.all([
            db.collection('churches').doc(churchId).collection('giving_batches').doc(batchId).get(),
            db.collection('churches').doc(churchId).collection('quickbooks_mapping').doc('config').get()
        ]);

        if (!batchDoc.exists) return res.status(404).json({ error: 'Batch not found' });
        const batch = batchDoc.data() as GivingBatch;
        const mapping = (mappingDoc.exists ? mappingDoc.data() : null) as QuickbooksMappingConfig | null;

        if (!mapping || !mapping.emailNotificationsEnabled) {
            return res.status(400).json({ error: 'Email notifications are not configured or enabled in QuickBooks settings.' });
        }

        const result = await sendBatchReadyNotification(churchId, batch, mapping);
        if (!result.success) {
            return res.status(400).json({ error: result.error || 'Failed to send ready notification', details: result });
        }

        const now = new Date().toISOString();
        await batchDoc.ref.set({ readyNotifiedAt: now }, { merge: true });

        res.json({
            success: true,
            message: `Batch ready notification sent to ${result.recipients.length} recipient(s).`,
            recipients: result.recipients,
            readyNotifiedAt: now
        });
    } catch (error: any) {
        console.error('Error sending batch-ready notification:', error);
        res.status(500).json({ error: error.message });
    }
});

