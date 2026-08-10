/**
 * syncMisc.ts
 * Miscellaneous sync operations: Risk profile changes, address geocoding, and weather data.
 */

import { firestore } from '../firestoreService';
import { PcoPerson, RiskChangeRecord } from '../../types';
import { calculateBulkRisk, DEFAULT_RISK_SETTINGS } from '../riskService';
import { fetchWeatherRange, fetchWeatherForecast } from '../../backend/weatherService.js';
import { logger, delay } from './pcoSyncCore.ts';

/**
 * Calculates risk for all people based on newly fetched data, detects category changes,
 * updates people with their new historicRiskCategory, and logs changes to risk_changes collection.
 */
export const syncRiskChanges = async (churchId: string) => {
    logger.info('Evaluating risk profile changes...', 'sync', { churchId }, churchId);

    try {
        const [church, people, donations, groups, plans, teams] = await Promise.all([
            firestore.getChurch(churchId),
            firestore.getPeople(churchId),
            firestore.getDetailedDonations(churchId),
            firestore.getGroups(churchId),
            firestore.getServicePlans(churchId),
            firestore.getServicesTeams(churchId)
        ]);

        const settings = church?.riskSettings || DEFAULT_RISK_SETTINGS;
        const evaluatedPeople = calculateBulkRisk(people, donations, groups, plans, teams, settings);

        const changes: RiskChangeRecord[] = [];
        const peopleToUpdate: Partial<PcoPerson>[] = [];
        const nowMs = Date.now();
        const nowIso = new Date().toISOString();

        for (const person of evaluatedPeople) {
            const currentCat = person.riskProfile?.category || 'Disconnected';
            const currentScore = person.riskProfile?.score ?? 0;
            const oldCat = person.historicRiskCategory || currentCat;
            const oldScore = person.historicRiskScore;

            if (currentCat !== oldCat) {
                changes.push({
                    id: `${churchId}_${person.id}_${nowMs}`,
                    churchId,
                    personId: person.id,
                    personName: person.name,
                    date: nowIso,
                    oldCategory: oldCat,
                    newCategory: currentCat,
                    oldScore: oldScore,
                    newScore: currentScore,
                    reasons: person.riskProfile?.factors || [],
                    timestamp: nowMs
                });
                peopleToUpdate.push({ id: person.id, churchId, historicRiskCategory: currentCat, historicRiskScore: currentScore });
            } else if (!person.historicRiskCategory || person.historicRiskScore !== currentScore) {
                peopleToUpdate.push({ id: person.id, churchId, historicRiskCategory: currentCat, historicRiskScore: currentScore });
            }
        }

        if (changes.length > 0) {
            await firestore.upsertRiskChanges(changes);
            logger.info(`Logged ${changes.length} risk status changes.`, 'sync', { churchId }, churchId);
        }
        if (peopleToUpdate.length > 0) {
            await firestore.upsertPeople(peopleToUpdate as PcoPerson[]);
            logger.info(`Updated historicRiskCategory on ${peopleToUpdate.length} people.`, 'sync', { churchId }, churchId);
        }
    } catch (e: any) {
        logger.error('Failed to evaluate risk profile changes', 'sync', { error: e?.message }, churchId);
        throw e;
    }
};

/**
 * Geocodes member addresses and persists lat/lng back to Firestore.
 * Uses Google Geocoding API when available; falls back to Nominatim.
 * Only processes people whose primary address lacks coordinates.
 */
export const geocodePeopleAddresses = async (churchId: string, force = false): Promise<void> => {
    logger.info(`Geocoding people addresses (force=${force})...`, 'sync', { churchId }, churchId);

    const sysSettings = await firestore.getSystemSettings();
    const googleApiKey: string | undefined = sysSettings?.googleMapsApiKey || undefined;

    let toGeocode: PcoPerson[] = [];
    if (force) {
        const allPeople = await firestore.getPeople(churchId);
        toGeocode = allPeople.filter(p => {
            const addr = p.addresses?.[0];
            return addr && (addr.city || addr.zip) && (addr.lat === undefined || addr.lat === null);
        });
    } else {
        toGeocode = await firestore.getPeopleNeedsGeocoding(churchId);
    }

    if (toGeocode.length === 0) {
        logger.info('No new addresses to geocode.', 'sync', { churchId }, churchId);
        return;
    }

    logger.info(`Geocoding ${toGeocode.length} addresses...`, 'sync', { churchId, count: toGeocode.length }, churchId);

    const geocodeAddress = async (addr: { street?: string | null, city?: string | null, state?: string | null, zip?: string | null }): Promise<{ coords: { lat: number; lng: number } | null, isPermanent: boolean }> => {
        const parts = [addr.street, addr.city, addr.state, addr.zip].filter(Boolean);
        if (parts.length === 0) return { coords: null, isPermanent: true };
        const fullAddress = parts.join(', ');

        if (googleApiKey) {
            try {
                const url = `https://maps.googleapis.com/maps/api/geocode/json?address=${encodeURIComponent(fullAddress)}&key=${googleApiKey}`;
                const res = await fetch(url);
                const data = await res.json();
                if (data.status === 'OK' && data.results?.[0]?.geometry?.location) {
                    const { lat, lng } = data.results[0].geometry.location;
                    return { coords: { lat, lng }, isPermanent: true };
                }
                if (data.status === 'ZERO_RESULTS') {
                    logger.warn(`Google geocode: no results for "${fullAddress}"`, 'sync', { churchId });
                    return { coords: null, isPermanent: true };
                }
                logger.warn(`Google geocode failed for "${fullAddress}": ${data.status}`, 'sync', { churchId });
            } catch (e: any) {
                logger.warn(`Google geocode error: ${e?.message}`, 'sync', { churchId });
            }
            logger.info(`Google geocode failed/denied for "${fullAddress}". Falling back to Nominatim...`, 'sync', { churchId });
        }

        try {
            const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(fullAddress)}`;
            const res = await fetch(url, { headers: { 'User-Agent': 'PastoralCareApp/1.0' } });
            if (!res.ok) {
                logger.warn(`Nominatim geocode returned HTTP ${res.status}`, 'sync', { churchId });
                return { coords: null, isPermanent: false };
            }
            const data = await res.json();
            if (data && data[0]) {
                return { coords: { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) }, isPermanent: true };
            } else {
                logger.warn(`Nominatim geocode: no results for "${fullAddress}"`, 'sync', { churchId });
                return { coords: null, isPermanent: true };
            }
        } catch (e: any) {
            logger.warn(`Nominatim geocode error: ${e?.message}`, 'sync', { churchId });
            return { coords: null, isPermanent: false };
        } finally {
            await delay(1100); // Nominatim: respect 1 req/s
        }
    };

    const updated: PcoPerson[] = [];
    let successCount = 0;
    let failCount = 0;

    for (const person of toGeocode) {
        const addr = person.addresses![0];
        try {
            const { coords, isPermanent } = await geocodeAddress(addr);
            if (coords) {
                const updatedAddresses = [{ ...addr, lat: coords.lat, lng: coords.lng }, ...(person.addresses?.slice(1) || [])];
                updated.push({ ...person, addresses: updatedAddresses, needsGeocoding: false });
                successCount++;
            } else if (isPermanent) {
                failCount++;
                updated.push({ ...person, needsGeocoding: false });
            } else {
                failCount++;
                updated.push({ ...person, needsGeocoding: true });
            }
        } catch (e: any) {
            failCount++;
            logger.warn(`Geocode failed for person ${person.id}`, 'sync', { churchId, error: e?.message });
            updated.push({ ...person, needsGeocoding: true });
        }
        if (googleApiKey) await delay(60);
    }

    if (updated.length > 0) await firestore.upsertPeople(updated);

    logger.info(
        `Geocoding complete`, 'sync',
        { churchId, geocoded: successCount, failed: failCount, total: toGeocode.length },
        churchId
    );
};

/**
 * Fetches historical weather for attendance dates missing weather records,
 * plus a 14-day forecast. Writes results to the `weather` collection.
 * Non-fatal — errors are logged but never crash the calling sync pipeline.
 */
export const syncWeatherData = async (churchId: string): Promise<void> => {
    try {
        const { getDb } = await import('../../backend/firebase.js');
        const db = getDb();

        const churchDoc = await db.collection('churches').doc(churchId).get();
        const churchData = churchDoc.data();
        const zip: string | undefined = churchData?.zip || undefined;
        const city: string | undefined = churchData?.city || undefined;
        const state: string | undefined = churchData?.state || undefined;
        const location = zip || (city && state ? `${city},${state}` : undefined);

        if (!location) {
            console.warn(`[WeatherSync] No zip/city+state for church ${churchId} — skipping weather sync`);
            return;
        }

        const settingsDoc = await db.doc('system/settings').get();
        const settings = settingsDoc.data() || {};
        const apiKey: string | undefined = settings.weatherApiKey || undefined;

        if (!apiKey) {
            console.warn(`[WeatherSync] No weatherApiKey in system settings — skipping weather sync`);
            return;
        }

        const attendanceSnap = await db.collection('attendance').where('churchId', '==', churchId).get();
        const attendanceDates = new Set<string>();
        attendanceSnap.docs.forEach((d: any) => { const data = d.data(); if (data.date) attendanceDates.add(data.date); });

        const weatherSnap = await db.collection('weather').where('churchId', '==', churchId).get();
        const existingWeatherDates = new Set<string>();
        weatherSnap.docs.forEach((d: any) => { const data = d.data(); if (data.date) existingWeatherDates.add(data.date); });

        const missingDates: string[] = [];
        attendanceDates.forEach(date => { if (!existingWeatherDates.has(date)) missingDates.push(date); });

        let allWeatherRecords: any[] = [];

        if (missingDates.length > 0) {
            missingDates.sort();
            const minDate = missingDates[0];
            const maxDate = missingDates[missingDates.length - 1];
            logger.info(`Fetching historical weather for ${missingDates.length} missing dates (${minDate} → ${maxDate})`, 'sync', { churchId }, churchId);
            try {
                const historical = await fetchWeatherRange(apiKey, location, minDate, maxDate, churchId);
                allWeatherRecords.push(...historical);
            } catch (e: any) {
                console.warn(`[WeatherSync] Historical weather fetch failed for ${churchId}:`, e.message);
            }
        }

        try {
            const forecast = await fetchWeatherForecast(apiKey, location, 14, churchId);
            allWeatherRecords.push(...forecast);
        } catch (e: any) {
            console.warn(`[WeatherSync] Forecast fetch failed for ${churchId}:`, e.message);
        }

        if (allWeatherRecords.length > 0) {
            const CHUNK = 400;
            for (let i = 0; i < allWeatherRecords.length; i += CHUNK) {
                const batch = db.batch();
                const chunk = allWeatherRecords.slice(i, i + CHUNK);
                for (const record of chunk) {
                    const ref = db.collection('weather').doc(record.id);
                    const safe = JSON.parse(JSON.stringify(record));
                    batch.set(ref, safe, { merge: true });
                }
                await batch.commit();
            }
            logger.info(`Weather sync complete — wrote ${allWeatherRecords.length} records`, 'sync', { churchId }, churchId);
        } else {
            logger.info('Weather sync complete — no new records to write', 'sync', { churchId }, churchId);
        }
    } catch (e: any) {
        console.error(`[WeatherSync] Weather sync failed for church ${churchId}:`, e.message);
        logger.warn(`Weather sync failed (non-fatal): ${e.message}`, 'sync', { churchId, error: e.message }, churchId);
    }
};
