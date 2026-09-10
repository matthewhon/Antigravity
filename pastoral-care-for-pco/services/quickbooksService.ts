import { 
    QuickbooksStatusResponse, QuickbooksAccount, QuickbooksClass, 
    QuickbooksVendor, QuickbooksMappingConfig, QuickbooksDepositResult, GivingBatch 
} from '../types';

export const quickbooksClient = {
    async getStatus(churchId: string): Promise<QuickbooksStatusResponse> {
        const res = await fetch(`/api/quickbooks/status?churchId=${encodeURIComponent(churchId)}`);
        if (!res.ok) {
            throw new Error(`Failed to check QuickBooks status: ${res.statusText}`);
        }
        return res.json();
    },

    connect(churchId: string): void {
        window.location.href = `/api/quickbooks/auth?churchId=${encodeURIComponent(churchId)}`;
    },

    async disconnect(churchId: string): Promise<void> {
        const res = await fetch('/api/quickbooks/disconnect', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ churchId })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || 'Failed to disconnect from QuickBooks');
        }
    },

    async getAccounts(churchId: string): Promise<{
        bankAccounts: QuickbooksAccount[];
        incomeAccounts: QuickbooksAccount[];
        expenseAccounts: QuickbooksAccount[];
        classes: QuickbooksClass[];
        vendors: QuickbooksVendor[];
    }> {
        const res = await fetch(`/api/quickbooks/accounts?churchId=${encodeURIComponent(churchId)}`);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || 'Failed to fetch QuickBooks accounts');
        }
        return res.json();
    },

    async getMapping(churchId: string): Promise<QuickbooksMappingConfig | null> {
        const res = await fetch(`/api/quickbooks/mapping?churchId=${encodeURIComponent(churchId)}`);
        if (!res.ok) {
            throw new Error('Failed to load QuickBooks mapping');
        }
        return res.json();
    },

    async saveMapping(churchId: string, mapping: Partial<QuickbooksMappingConfig>, userName?: string): Promise<QuickbooksMappingConfig> {
        const res = await fetch('/api/quickbooks/mapping', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ churchId, mapping, userName })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || 'Failed to save QuickBooks mapping');
        }
        const data = await res.json();
        return data.mapping;
    },

    async sendDeposit(
        churchId: string, 
        batchId: string, 
        userName?: string,
        options?: {
            depositBankAccountId?: string;
            depositBankAccountName?: string;
            fundOverrides?: Record<string, import('../types').FundQuickbooksMapping>;
            saveAsDefault?: boolean;
        }
    ): Promise<{
        success: boolean;
        depositResult: QuickbooksDepositResult;
        batch: GivingBatch;
    }> {
        const res = await fetch('/api/quickbooks/deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                churchId, 
                batchId, 
                userName,
                depositBankAccountId: options?.depositBankAccountId,
                depositBankAccountName: options?.depositBankAccountName,
                fundOverrides: options?.fundOverrides,
                saveAsDefault: options?.saveAsDefault
            })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || 'Failed to send deposit to QuickBooks');
        }
        return res.json();
    },

    async sendTestNotification(
        churchId: string,
        mapping: QuickbooksMappingConfig,
        testRecipientOverride?: string
    ): Promise<{ success: boolean; message: string; recipients: string[] }> {
        const res = await fetch('/api/quickbooks/notify/test', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ churchId, mapping, testRecipientOverride })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || 'Failed to send test notification');
        }
        return res.json();
    },

    async sendBatchReadyNotification(
        churchId: string,
        batchId: string
    ): Promise<{ success: boolean; message: string; recipients: string[]; readyNotifiedAt: string }> {
        const res = await fetch('/api/quickbooks/notify/batch-ready', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ churchId, batchId })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || 'Failed to send batch-ready notification');
        }
        return res.json();
    }
};
