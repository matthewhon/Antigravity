/**
 * sync/index.ts
 * Orchestrates all domain sync modules in the correct dependency order.
 * This is the single entry point for a full PCO data sync.
 */

import { firestore } from '../firestoreService';
import { initializeWebhooks } from '../pcoWebhookService';
import { computeActivePeopleCount } from '../activePeopleService';
import { logger } from './pcoSyncCore.ts';
import { syncCampusesData, syncPeopleData, reconcileSmsConversations } from './syncPeople.ts';
import { syncGroupsData } from './syncGroups.ts';
import { syncServicesData } from './syncServices.ts';
import { syncRecentGiving } from './syncGiving.ts';
import { syncCheckInCounts, syncCheckInsData } from './syncAttendance.ts';
import { syncRegistrationsData } from './syncRegistrations.ts';
import { syncRiskChanges, geocodePeopleAddresses, syncWeatherData } from './syncMisc.ts';

export const syncAllData = async (churchId: string) => {
    logger.info('Full sync started', 'sync', { churchId }, churchId);
    const startTime = Date.now();

    // Check if multi-campus features are enabled for this tenant
    let multiCampusEnabled = false;
    try {
        const church = await firestore.getChurch(churchId);
        multiCampusEnabled = church?.multiCampusEnabled ?? false;
    } catch (e: any) {
        logger.warn('Failed to load church settings for campus check', 'sync', { error: e?.message }, churchId);
    }

    // Ensure Webhooks are set up (non-fatal)
    try {
        await initializeWebhooks(churchId);
    } catch (e: any) {
        logger.warn('Webhook initialization failed (non-fatal)', 'sync', { error: e?.message }, churchId);
    }

    // Sync campuses first if enabled
    if (multiCampusEnabled) {
        try {
            await syncCampusesData(churchId);
        } catch (e: any) {
            logger.error('Sync Campuses failed', 'sync', { error: e?.message }, churchId);
        }
    }

    try {
        await syncPeopleData(churchId);
    } catch (e: any) {
        logger.error('Sync People failed', 'sync', { error: e?.message }, churchId);
    }

    // Reconcile SMS conversations after fresh people sync
    try {
        await reconcileSmsConversations(churchId);
    } catch (e: any) {
        logger.warn('SMS conversation reconciliation failed (non-fatal)', 'sync', { error: e?.message }, churchId);
    }

    // Geocode new/updated addresses after people are stored
    try {
        await geocodePeopleAddresses(churchId);
    } catch (e: any) {
        logger.warn('Geocoding step failed (non-fatal)', 'sync', { error: e?.message }, churchId);
    }

    // Sync check-in counts AFTER people are stored
    try {
        await syncCheckInCounts(churchId);
    } catch (e: any) {
        logger.error('Sync Check-ins failed', 'sync', { error: e?.message }, churchId);
    }

    // Sync check-in event data for the Attendance tab
    try {
        await syncCheckInsData(churchId);
    } catch (e: any) {
        logger.error('Sync Check-ins Data failed', 'sync', { error: e?.message }, churchId);
    }

    try {
        await syncGroupsData(churchId);
    } catch (e: any) {
        logger.error('Sync Groups failed', 'sync', { error: e?.message }, churchId);
    }

    try {
        await syncServicesData(churchId);
    } catch (e: any) {
        logger.error('Sync Services failed', 'sync', { error: e?.message }, churchId);
    }

    try {
        await syncRecentGiving(churchId);
    } catch (e: any) {
        logger.error('Sync Giving failed', 'sync', { error: e?.message }, churchId);
    }

    // Non-fatal: org may not have the Registrations module
    try {
        await syncRegistrationsData(churchId);
    } catch (e: any) {
        logger.error('Sync Registrations failed', 'sync', { error: e?.message }, churchId);
    }

    // Evaluate risk profiles & log changes
    try {
        await syncRiskChanges(churchId);
    } catch (e: any) {
        logger.error('Sync Risk Changes failed', 'sync', { error: e?.message }, churchId);
    }

    // Recompute active people count with fresh data
    try {
        const count = await computeActivePeopleCount(churchId);
        await firestore.updateActivePeopleCount(churchId, count);
        logger.info('Active people count updated', 'sync', { churchId, count }, churchId);
    } catch (e: any) {
        logger.warn('Active people count update failed (non-fatal)', 'sync', { error: e?.message }, churchId);
    }

    const durationMs = Date.now() - startTime;
    await firestore.updateChurch(churchId, { lastSyncTimestamp: Date.now() });
    logger.info('Full sync complete', 'sync', { churchId, durationMs }, churchId);
};

// Re-export all domain functions for direct access if needed
export {
    syncCampusesData,
    syncPeopleData,
    reconcileSmsConversations,
    syncGroupsData,
    syncServicesData,
    syncRecentGiving,
    syncCheckInCounts,
    syncCheckInsData,
    syncRegistrationsData,
    syncRiskChanges,
    geocodePeopleAddresses,
    syncWeatherData,
};
