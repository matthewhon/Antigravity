import { getDb } from './firebase';
import { createServerLogger } from '../services/logService';

// ─── SMS Campaign Scheduler ───────────────────────────────────────────────────
// Polls Firestore every 60 seconds for SmsCampaigns with status='scheduled'
// and scheduledAt <= now. Resolves PCO List/Group members, then fires sendBulk.

const MAX_RETRIES = 3;

/** Resolve phone numbers from a PCO List or Group via the stored PCO access token. */
async function resolvePcoPhones(
    db: any,
    churchId: string,
    listId?: string,
    groupId?: string
): Promise<{ phones: string[]; personMap: Record<string, { personName: string }> }> {

    const churchSnap = await db.collection('churches').doc(churchId).get();
    const church = churchSnap.data() || {};
    const token  = church.pcoAccessToken;
    if (!token) throw new Error('No PCO access token for this church.');

    // Determine the PCO endpoint
    let url: string;
    if (listId) {
        url = `https://api.planningcenteronline.com/people/v2/lists/${listId}/people?per_page=100&fields[Person]=phone_numbers,name`;
    } else if (groupId) {
        url = `https://api.planningcenteronline.com/groups/v2/groups/${groupId}/memberships?include=person&per_page=100`;
    } else {
        return { phones: [], personMap: {} };
    }

    const phones: string[]   = [];
    const personMap: Record<string, { personName: string }> = {};

    let nextUrl: string | null = url;
    while (nextUrl) {
        const pcoRes = await fetch(nextUrl, {
            headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        });
        if (!pcoRes.ok) {
            throw new Error(`PCO API returned ${pcoRes.status} for ${nextUrl}`);
        }
        const data: any = await pcoRes.json();
        const people: any[] = data.data || [];

        for (const p of people) {
            // Name lives on the resource itself or in included
            const name: string = p.attributes?.name || p.attributes?.full_name || '';

            // Phone numbers are either embedded or need a follow-up fetch
            const phoneAttrs: any[] = p.attributes?.phone_numbers || [];
            for (const ph of phoneAttrs) {
                const num: string = ph.number || ph.formatted_number || '';
                if (num) {
                    const digits = num.replace(/\D/g, '');
                    const e164   = digits.length === 10 ? `+1${digits}` : digits.length === 11 ? `+${digits}` : '';
                    if (e164 && !phones.includes(e164)) {
                        phones.push(e164);
                        personMap[e164] = { personName: name };
                    }
                }
            }
        }

        // PCO-style pagination
        nextUrl = data.meta?.next?.href || (data.links?.next ?? null);
    }

    return { phones, personMap };
}

export function startSmsCampaignScheduler(db: any): void {
    const log = createServerLogger(db as any);

    const tick = async () => {
        try {
            const now = Date.now();

            const snap = await db.collection('smsCampaigns')
                .where('status', '==', 'scheduled')
                .where('scheduledAt', '<=', now)
                .get();

            if (snap.empty) return;

            log.info(`[SmsScheduler] Found ${snap.size} campaign(s) due to send`, 'system', {}, '');

            await Promise.all(snap.docs.map(async (docSnap: any) => {
                const campaign   = docSnap.data() as any;
                const campaignId = docSnap.id;
                const churchId   = campaign.churchId;
                const retryCount = campaign.retryCount || 0;

                if (retryCount >= MAX_RETRIES) {
                    log.error(`[SmsScheduler] Campaign ${campaignId} exceeded max retries`, 'system', { campaignId }, churchId);
                    await db.collection('smsCampaigns').doc(campaignId).update({
                        status:    'failed',
                        lastError: `Max retries (${MAX_RETRIES}) exceeded`,
                        updatedAt: Date.now(),
                    });
                    return;
                }

                try {
                    // Mark as 'sending' to prevent double-processing
                    await db.collection('smsCampaigns').doc(campaignId).update({
                        status:    'sending',
                        updatedAt: Date.now(),
                    });

                    // Resolve recipient phone numbers
                    let phones: string[]   = campaign.toPhones || [];
                    let personMap: Record<string, { personName: string }> = {};

                    if (phones.length === 0 && (campaign.toListId || campaign.toGroupId)) {
                        const resolved = await resolvePcoPhones(db, churchId, campaign.toListId, campaign.toGroupId);
                        phones    = resolved.phones;
                        personMap = resolved.personMap;
                    }

                    if (phones.length === 0) {
                        throw new Error('No phone numbers resolved for this campaign.');
                    }

                    // Delegate actual send to the send-bulk endpoint (re-use its logic inline)
                    const { sendBulkInternal } = await import('./twilioSend.js');
                    const result = await sendBulkInternal({
                        db,
                        churchId,
                        campaignId,
                        phones,
                        body:       campaign.body,
                        mediaUrls:  campaign.mediaUrls || [],
                        personMap,
                    });

                    log.info(
                        `[SmsScheduler] Campaign ${campaignId} sent: ${result.sent} sent, ${result.failed} failed, ${result.optedOut} opted-out`,
                        'system', { campaignId, ...result }, churchId
                    );

                    // Handle recurring reschedule
                    const isRecurring = !!campaign.recurringFrequency;
                    if (isRecurring) {
                        const d = new Date(campaign.scheduledAt || now);
                        if (campaign.recurringFrequency === 'daily')   d.setDate(d.getDate() + 1);
                        else if (campaign.recurringFrequency === 'weekly')  d.setDate(d.getDate() + 7);
                        else if (campaign.recurringFrequency === 'monthly') d.setMonth(d.getMonth() + 1);

                        const history = campaign.sentHistory || [];
                        history.push({ sentAt: now, recipientCount: result.sent });

                        await db.collection('smsCampaigns').doc(campaignId).update({
                            status:         'scheduled',
                            scheduledAt:    d.getTime(),
                            sendAt:         d.toISOString(),
                            lastSentAt:     now,
                            sentHistory:    history,
                            retryCount:     0,
                            lastError:      null,
                            updatedAt:      Date.now(),
                        });
                    }

                } catch (e: any) {
                    const errMsg       = e?.message || 'Unknown error';
                    const newRetryCount = retryCount + 1;

                    log.warn(
                        `[SmsScheduler] Campaign ${campaignId} failed (attempt ${newRetryCount}/${MAX_RETRIES}): ${errMsg}`,
                        'system', { campaignId, churchId, retryCount: newRetryCount }, churchId
                    );

                    await db.collection('smsCampaigns').doc(campaignId).update({
                        status:     'scheduled',
                        retryCount: newRetryCount,
                        lastError:  errMsg,
                        updatedAt:  Date.now(),
                    });
                }
            }));

        } catch (e: any) {
            console.error('[SmsScheduler] Tick error:', e?.message);
        }
    };

    tick();
    setInterval(tick, 60_000);
    console.log('[SmsScheduler] Started — polling every 60 seconds');
}
