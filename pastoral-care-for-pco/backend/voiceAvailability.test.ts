import assert from 'node:assert/strict';
import { defaultCallingPreferences, evaluateUserAvailability } from './voiceAvailability';

// Wednesday, Nov 18, 2026 at 10:00 AM America/Chicago (UTC-6 = 16:00 UTC)
const wed10amChicago = Date.UTC(2026, 10, 18, 16, 0, 0);
// Wednesday, Nov 18, 2026 at 8:00 PM America/Chicago (UTC-6 = 02:00 UTC next day)
const wed8pmChicago = Date.UTC(2026, 10, 19, 2, 0, 0);
// Sunday, Nov 22, 2026 at 10:00 AM America/Chicago (UTC-6 = 16:00 UTC)
const sun10amChicago = Date.UTC(2026, 10, 22, 16, 0, 0);

const basePrefs = defaultCallingPreferences('America/Chicago');
basePrefs.callingHoursEnabled = true;

// 1. Within weekday 9-5
assert.equal(
    evaluateUserAvailability({ callingPreferences: basePrefs }, 'America/Chicago', wed10amChicago).available,
    true,
    'Should be available Wed 10am'
);

// 2. Outside weekday 9-5
const resAfterHours = evaluateUserAvailability({ callingPreferences: basePrefs }, 'America/Chicago', wed8pmChicago);
assert.equal(resAfterHours.available, false);
assert.equal(resAfterHours.reason, 'outside_hours');

// 3. Weekend disabled
const resWeekend = evaluateUserAvailability({ callingPreferences: basePrefs }, 'America/Chicago', sun10amChicago);
assert.equal(resWeekend.available, false);
assert.equal(resWeekend.reason, 'day_disabled');

// 4. DND active overrides available hours
const dndPrefs = { ...basePrefs, dndOverride: { active: true, until: null, reason: 'In a meeting' } };
const resDnd = evaluateUserAvailability({ callingPreferences: dndPrefs }, 'America/Chicago', wed10amChicago);
assert.equal(resDnd.available, false);
assert.equal(resDnd.reason, 'dnd');

// 5. Expired DND allows calls again
const expiredDndPrefs = { ...basePrefs, dndOverride: { active: true, until: wed10amChicago - 1000 } };
assert.equal(
    evaluateUserAvailability({ callingPreferences: expiredDndPrefs }, 'America/Chicago', wed10amChicago).available,
    true
);

// 6. Date override blocks a normally open Wednesday
const holidayPrefs = {
    ...basePrefs,
    dateOverrides: [{ date: '2026-11-18', label: 'Staff Retreat', available: false }],
};
const resHoliday = evaluateUserAvailability({ callingPreferences: holidayPrefs }, 'America/Chicago', wed10amChicago);
assert.equal(resHoliday.available, false);
assert.equal(resHoliday.reason, 'date_override');

// 7. Emergency bypass allows after-hours call when enabled
const emergencyPrefs = { ...basePrefs, allowEmergencyBypass: true };
const resEmerg = evaluateUserAvailability({ callingPreferences: emergencyPrefs }, 'America/Chicago', wed8pmChicago, {
    ignoreHoursForEmergency: true,
});
assert.equal(resEmerg.available, true);
assert.equal(resEmerg.reason, 'emergency_bypass');

// 8. Emergency bypass still respects DND
const emergencyDndPrefs = { ...emergencyPrefs, dndOverride: { active: true, until: null } };
assert.equal(
    evaluateUserAvailability({ callingPreferences: emergencyDndPrefs }, 'America/Chicago', wed8pmChicago, {
        ignoreHoursForEmergency: true,
    }).available,
    false
);

console.log('All voiceAvailability tests passed!');
