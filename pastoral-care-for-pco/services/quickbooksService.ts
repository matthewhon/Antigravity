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

    async sendDeposit(churchId: string, batchId: string, userName?: string): Promise<{
        success: boolean;
        depositResult: QuickbooksDepositResult;
        batch: GivingBatch;
    }> {
        const res = await fetch('/api/quickbooks/deposit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ churchId, batchId, userName })
        });
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || 'Failed to send deposit to QuickBooks');
        }
        return res.json();
    }
};
