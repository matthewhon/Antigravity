/**
 * pcoSyncService.ts
 *
 * Public API barrel — re-exports everything from the sync sub-modules so that
 * all existing callers (App.tsx, server.ts, emailScheduler.ts, etc.) continue
 * to work without any import changes.
 *
 * Domain logic lives in services/sync/:
 *   pcoSyncCore.ts       — shared pcoFetch / fetchAllPages / logger / delay
 *   syncPeople.ts        — syncPeopleData, syncCampusesData, reconcileSmsConversations
 *   syncGiving.ts        — syncRecentGiving  ← fund resolution bug fixed here
 *   syncGroups.ts        — syncGroupsData
 *   syncServices.ts      — syncServicesData
 *   syncAttendance.ts    — syncCheckInCounts, syncCheckInsData
 *   syncRegistrations.ts — syncRegistrationsData
 *   syncMisc.ts          — syncRiskChanges, geocodePeopleAddresses, syncWeatherData
 *   index.ts             — syncAllData orchestrator
 */

export {
    syncAllData,
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
} from './sync/index.ts';
