/**
 * seedDemoData.mjs — Populates the "c1" (Grace Baptist Church) tenant with
 * realistic demo data for advertising/demo purposes.
 *
 * Uses the Firebase Admin SDK with Application Default Credentials.
 *
 * Usage (from the project root):
 *   node scripts/seedDemoData.mjs
 *
 * Prerequisites:
 *   1. gcloud auth application-default login
 *   2. node scripts/seedDemoData.mjs
 *
 * To clear & re-seed: node scripts/seedDemoData.mjs --reset
 */

import { initializeApp, applicationDefault, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { existsSync } from 'fs';

const PROJECT_ID  = 'pastoral-care-for-pco';
const DATABASE_ID = 'pcforpco';
const CHURCH_ID   = 'c1';
const RESET       = process.argv.includes('--reset');

// ─── Init ──────────────────────────────────────────────────────────────────────
// Try service account key first (drop a serviceAccountKey.json in project root)
// otherwise fall back to Application Default Credentials.
const KEY_PATH = new URL('../serviceAccountKey.json', import.meta.url).pathname.replace(/^\/([A-Z]:)/, '$1');
const credential = existsSync(KEY_PATH) ? cert(KEY_PATH) : applicationDefault();

const app = initializeApp({ credential, projectId: PROJECT_ID });
// Named database — the (default) database does not exist in this project
const db = getFirestore(app);
db.settings({ databaseId: DATABASE_ID, ignoreUndefinedProperties: true });

const id  = (...parts) => parts.join('_');
const now = Date.now();

// ─── Helpers ──────────────────────────────────────────────────────────────────
async function batchSet(collectionName, docs) {
  if (!docs.length) return;
  const CHUNK = 450;
  for (let i = 0; i < docs.length; i += CHUNK) {
    const batch = db.batch();
    for (const d of docs.slice(i, i + CHUNK)) {
      batch.set(db.collection(collectionName).doc(d.id), d, { merge: true });
    }
    await batch.commit();
  }
  console.log(`  ✓ ${docs.length} docs → ${collectionName}`);
}

async function clearCollection(collectionName) {
  const snap = await db.collection(collectionName).where('churchId', '==', CHURCH_ID).get();
  if (snap.empty) return;
  const CHUNK = 450;
  for (let i = 0; i < snap.docs.length; i += CHUNK) {
    const batch = db.batch();
    snap.docs.slice(i, i + CHUNK).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  console.log(`  🗑  cleared ${snap.size} docs from ${collectionName}`);
}

function dateStr(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400_000);
  return d.toISOString().split('T')[0];
}

function isoFuture(daysFromNow) {
  const d = new Date(Date.now() + daysFromNow * 86400_000);
  return d.toISOString();
}

function monthStr(monthsAgo) {
  const d = new Date();
  d.setMonth(d.getMonth() - monthsAgo);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

// ─── People ────────────────────────────────────────────────────────────────────
const FIRST_NAMES = ['James','Mary','Robert','Patricia','John','Jennifer','Michael','Linda','David','Barbara',
  'William','Elizabeth','Richard','Susan','Joseph','Jessica','Thomas','Sarah','Charles','Karen',
  'Emily','Daniel','Ashley','Matthew','Brittany','Andrew','Amanda','Joshua','Hannah','Ryan',
  'Megan','Nathan','Lauren','Tyler','Rachel','Brandon','Kayla','Samuel','Alexis','Benjamin','Stephanie'];
const LAST_NAMES  = ['Smith','Johnson','Williams','Jones','Brown','Davis','Miller','Wilson','Moore','Taylor',
  'Anderson','Thomas','Jackson','White','Harris','Martin','Thompson','Garcia','Martinez','Robinson',
  'Clark','Rodriguez','Lewis','Lee','Walker','Hall','Allen','Young','Hernandez','King'];

const GENDERS   = ['Male','Female','Male','Female','Male','Female']; // slight lean
const MEMBER_STATUS = ['Member','Regular Attendee','Occasional Visitor'];
const ENGAGEMENT_STATUS = ['Highly Engaged','Engaged','Nominally Engaged','Disengaged'];

function makePerson(index) {
  const firstName = FIRST_NAMES[index % FIRST_NAMES.length];
  const lastName  = LAST_NAMES[index % LAST_NAMES.length];
  const name      = `${firstName} ${lastName}`;
  const pcoId     = `pco${String(index).padStart(5, '0')}`;
  const docId     = `${CHURCH_ID}_${pcoId}`;
  const bYear     = 1940 + rand(0, 60);
  const bMonth    = rand(1, 12);
  const bDay      = rand(1, 28);
  const gender    = GENDERS[index % GENDERS.length];
  const createdDaysAgo = index < 6 ? rand(1, 29) : rand(1, 1095);
  const zip       = pick(['30301','30302','30303','30318','30319']);
  const city      = 'Atlanta';
  const state     = 'GA';

  return {
    id:              docId,
    churchId:        CHURCH_ID,
    name,
    email:           `${firstName.toLowerCase()}.${lastName.toLowerCase()}${index}@example.com`,
    phone:           `(404) 555-${String(rand(1000,9999))}`,
    gender,
    membership:      pick(MEMBER_STATUS),
    status:          'active',
    birthdate:       `${bYear}-${String(bMonth).padStart(2,'0')}-${String(bDay).padStart(2,'0')}`,
    createdAt:       dateStr(createdDaysAgo),
    lastUpdated:     now,
    addresses:       [{ city, state, zip, location: 'Home' }],
    checkInCount:    rand(0, 80),
    householdId:     `hh${Math.floor(index / 2)}`,
    householdName:   `${lastName} Family`,
    engagementStatus: pick(ENGAGEMENT_STATUS),
    isDonor:         index % 3 === 0,
    riskProfile: {
      score:    rand(30, 100),
      category: index % 5 === 0 ? 'At Risk' : index % 11 === 0 ? 'Disconnected' : 'Healthy',
      factors:  [],
    },
    givingStats: index % 3 === 0 ? {
      weekly:      rand(50, 500),
      monthly:     rand(200, 2000),
      quarterly:   rand(600, 6000),
      ytd:         rand(2000, 25000),
      lastUpdated: now,
    } : null,
  };
}

const PEOPLE = Array.from({ length: 120 }, (_, i) => makePerson(i));

// ─── Groups ────────────────────────────────────────────────────────────────────
const GROUP_DATA = [
  { name: 'Young Adults Ministry',   type: 'Small Group', size: 18 },
  { name: 'Senior Saints Fellowship', type: 'Fellowship',  size: 22 },
  { name: "Men's Bible Study",        type: 'Small Group', size: 14 },
  { name: "Women's Prayer Circle",    type: 'Small Group', size: 16 },
  { name: 'Couples Connect',          type: 'Small Group', size: 12 },
  { name: 'Youth Group (6th–12th)',   type: 'Youth',       size: 25 },
  { name: 'Praise & Worship Team',   type: 'Ministry',    size: 10 },
  { name: 'Hospitality Team',        type: 'Ministry',    size: 8  },
  { name: 'Outreach Committee',      type: 'Ministry',    size: 7  },
  { name: 'Sunday School – Adults',  type: 'Education',   size: 30 },
  { name: 'NEW Member Class',        type: 'Education',   size: 9  },
  { name: 'Grief Support Group',     type: 'Support',     size: 6  },
];

const GROUPS = GROUP_DATA.map((g, i) => {
  const pcoId = `grp${String(i + 1).padStart(4, '0')}`;
  const memberSample = PEOPLE.slice(i * 5, i * 5 + g.size).map(p => p.id);
  return {
    id:            `${CHURCH_ID}_${pcoId}`,
    churchId:      CHURCH_ID,
    name:          g.name,
    groupTypeName: g.type,
    membersCount:  g.size,
    isPublic:      i < 10,
    createdAt:     dateStr(rand(90, 730)),
    lastUpdated:   now,
    leaderIds:     [memberSample[0]],
    memberIds:     memberSample,
    attendanceHistory: Array.from({ length: 8 }, (_, w) => ({
      eventId:  `evt${i}_${w}`,
      date:     dateStr(w * 7 + 1),
      count:    rand(Math.floor(g.size * 0.6), g.size),
      members:  rand(Math.floor(g.size * 0.5), g.size - 1),
      visitors: rand(0, 3),
      attendeeIds: [],
    })),
  };
});

// ─── Attendance ────────────────────────────────────────────────────────────────
function makeAttendance(weeksAgo) {
  const d   = dateStr(weeksAgo * 7);
  const reg = rand(290, 380);
  const gu  = rand(10, 35);
  const vol = rand(30, 55);
  return {
    id:             `${CHURCH_ID}_${d}`,
    churchId:       CHURCH_ID,
    date:           d,
    count:          reg + gu + vol,
    regulars:       reg,
    guests:         gu,
    volunteers:     vol,
    digitalCheckins: rand(200, 340),
    headcount:      0,
    customHeadcounts: [
      { name: 'Online Viewers', total: rand(80, 200) },
      { name: 'Children\'s Church', total: rand(40, 70) },
    ],
  };
}

const ATTENDANCE = Array.from({ length: 52 }, (_, i) => makeAttendance(i + 1));

// ─── Funds ────────────────────────────────────────────────────────────────────
const FUND_NAMES = ['General Fund','Building Fund','Missions','Youth Ministry','Benevolence'];
const FUNDS = FUND_NAMES.map((name, i) => ({
  id:       `${CHURCH_ID}_fund${i + 1}`,
  churchId: CHURCH_ID,
  name,
}));

// ─── Detailed Donations ────────────────────────────────────────────────────────
function makeDonation(index) {
  const donor    = PEOPLE[index % PEOPLE.length];
  const daysAgo  = rand(1, 365);
  const date     = dateStr(daysAgo);
  const fundName = pick(FUND_NAMES);
  const amt      = pick([25,50,50,75,100,100,150,200,250,250,300,500,1000]);
  return {
    id:          `${CHURCH_ID}_don${String(index).padStart(6, '0')}`,
    churchId:    CHURCH_ID,
    amount:      amt,
    date,
    fundName,
    donorId:     donor.id,
    donorName:   donor.name,
    isRecurring: index % 4 === 0,
  };
}

const DONATIONS = Array.from({ length: 600 }, (_, i) => makeDonation(i));

// ─── Budgets ──────────────────────────────────────────────────────────────────
const currentYear = new Date().getFullYear();
const BUDGETS = FUND_NAMES.map((name, i) => {
  const monthly = Array.from({ length: 12 }, () => rand(8000, 25000));
  return {
    id:            `${CHURCH_ID}_budget${i + 1}_${currentYear}`,
    churchId:      CHURCH_ID,
    year:          currentYear,
    fundName:      name,
    totalAmount:   monthly.reduce((a, b) => a + b, 0),
    monthlyAmounts: monthly,
    isActive:      true,
  };
});

// ─── Teams ────────────────────────────────────────────────────────────────────
const TEAM_DATA = [
  { name: 'Worship Team',      serviceTypeName: 'Sunday Morning' },
  { name: 'Sound & Tech',      serviceTypeName: 'Sunday Morning' },
  { name: 'Greeting Team',     serviceTypeName: 'Sunday Morning' },
  { name: 'Nursery & Toddlers', serviceTypeName: 'Sunday Morning' },
  { name: 'Children\'s Church', serviceTypeName: 'Sunday Morning' },
  { name: 'Parking Ministry',  serviceTypeName: 'Sunday Morning' },
];

const TEAMS = TEAM_DATA.map((t, i) => {
  const memberSample = PEOPLE.slice(i * 8, i * 8 + 8).map(p => p.id);
  return {
    id:               `${CHURCH_ID}_team${i + 1}`,
    churchId:         CHURCH_ID,
    name:             t.name,
    serviceTypeName:  t.serviceTypeName,
    memberIds:        memberSample,
    leaderPersonIds:  [memberSample[0]],
    leaderCount:      1,
    positionCount:    memberSample.length,
  };
});

// ─── Service Plans ────────────────────────────────────────────────────────────
const SERMON_SERIES = [
  { series: 'Fresh Start', topics: ['New Beginnings','Faith That Moves','Living Free'] },
  { series: 'Anchored in Christ', topics: ['Firm Foundation','Storms of Life','Unshakeable Peace'] },
  { series: 'The Lord\'s Prayer', topics: ['Our Father','Daily Bread','Forgiveness'] },
];

function makeServicePlan(weeksOffset) {
  const isFuture = weeksOffset < 0;
  const date     = isFuture ? isoFuture(Math.abs(weeksOffset) * 7) : new Date(Date.now() - weeksOffset * 7 * 86400_000).toISOString();
  const series   = SERMON_SERIES[Math.floor(Math.abs(weeksOffset) / 3) % SERMON_SERIES.length];
  const topicIdx = Math.abs(weeksOffset) % series.topics.length;
  const filled   = rand(18, 26);
  const needed   = rand(filled, 30);
  return {
    id:             `${CHURCH_ID}_svc${weeksOffset}`,
    churchId:       CHURCH_ID,
    sortDate:       date.split('T')[0],
    seriesTitle:    series.series,
    serviceTypeName: 'Sunday Morning Service',
    positionsFilled: filled,
    positionsNeeded: needed,
    isUnderstaffed:  filled < needed,
    teamMembers:     TEAMS.slice(0, 4).flatMap(team =>
      team.memberIds.slice(0, 3).map(pid => ({
        teamName:           team.name,
        personId:           pid,
        status:             pick(['Confirmed','Declined','Unconfirmed']),
        teamPositionName:   pick(['Vocalist','Guitarist','Sound Engineer','Greeter']),
      }))
    ),
    items: [
      { type: 'song',  title: pick(['How Great Thou Art','Amazing Grace','Cornerstone','Way Maker','Graves Into Gardens']), author: '' },
      { type: 'song',  title: pick(['Good Good Father','Blessed Assurance','What A Beautiful Name','10,000 Reasons']),     author: '' },
      { type: 'header',title: 'Sermon',                                                                                     type2: 'header' },
      { type: 'item',  title: series.topics[topicIdx],                                                                      author: 'Pastor John Williams' },
      { type: 'song',  title: pick(['I Surrender All','Just As I Am','Doxology']),                                          author: '' },
    ],
    planTimes: [
      { id: `pt_${weeksOffset}_1`, startsAt: date, endsAt: new Date(new Date(date).getTime() + 75 * 60_000).toISOString() },
    ],
    planNotes: [],
  };
}

const SERVICE_PLANS = [
  ...Array.from({ length: 4 }, (_, i) => makeServicePlan(-(i + 1))),  // future plans
  ...Array.from({ length: 12 }, (_, i) => makeServicePlan(i + 1)),     // past plans
];

// ─── PCO Registrations ────────────────────────────────────────────────────────
const REGISTRATION_EVENTS = [
  {
    name:        'Summer Family Camp 2025',
    description: '<p>Join us for a week of faith, fun, and fellowship at our annual family camp!</p>',
    daysOut:     45,
    signups:     62,
    limit:       80,
  },
  {
    name:        'Marriage Enrichment Retreat',
    description: '<p>Strengthen your marriage through biblical teaching and guided exercises.</p>',
    daysOut:     22,
    signups:     18,
    limit:       20,
  },
  {
    name:        'Youth Summer Mission Trip',
    description: '<p>High school students serving in Appalachia for one week.</p>',
    daysOut:     60,
    signups:     14,
    limit:       25,
  },
  {
    name:        'Women\'s Fall Retreat',
    description: '<p>A weekend of renewal and sisterhood for the women of Grace Baptist.</p>',
    daysOut:     90,
    signups:     35,
    limit:       50,
  },
  {
    name:        'New Member Orientation',
    description: '<p>Learn about our church\'s history, vision, and how to get connected.</p>',
    daysOut:     14,
    signups:     9,
    limit:       null,
  },
];

const PCOREGISTRATIONS = REGISTRATION_EVENTS.map((e, i) => {
  const pcoId  = `reg${String(i + 1).padStart(4,'0')}`;
  const starts = isoFuture(e.daysOut);
  const closes = isoFuture(e.daysOut - 7);
  return {
    id:               `${CHURCH_ID}_${pcoId}`,
    pcoId,
    churchId:         CHURCH_ID,
    name:             e.name,
    description:      e.description,
    logoUrl:          null,
    publicUrl:        `https://gracebaptist.church/events/${pcoId}`,
    visibility:       'public',
    registrationType: 'detailed',
    startsAt:         starts,
    endsAt:           isoFuture(e.daysOut + 5),
    openAt:           new Date().toISOString(),
    closeAt:          closes,
    signupCount:      e.signups,
    signupLimit:      e.limit,
    openSignup:       true,
    totalRegistrations: e.signups,
    totalAttendees:   e.signups,
    waitlistedCount:  i === 1 ? 3 : 0,
    canceledCount:    rand(0, 5),
    campusId:         null,
    campusName:       null,
    lastSynced:       now,
  };
});

// ─── Pastoral Notes ────────────────────────────────────────────────────────────
const NOTE_TYPES = ['Visit','Call','Meeting','Note','Hospital'];
const NOTE_CONTENTS = [
  'Visited with family following the loss of their father. They are doing well and appreciated the church\'s support.',
  'Called to follow up on prayer request from last Sunday. Prayed together over the phone.',
  'Met for counseling session; working through marriage difficulties. Follow-up scheduled.',
  'Hospital visit — recovering from surgery. Shared scripture and prayed. Spirits high.',
  'Brief conversation after service. Expressed interest in joining a small group.',
  'Followed up on job loss situation. Connected them with deacon assistance fund.',
  'Noted that family has missed the last 4 Sundays. Sent a care card.',
  'One-on-one discipleship meeting. Discussed spiritual gifts and serving opportunities.',
];

const PASTORAL_NOTES = PEOPLE.slice(0, 30).map((person, i) => ({
  id:           `${CHURCH_ID}_note${i + 1}`,
  churchId:     CHURCH_ID,
  personId:     person.id,
  personName:   person.name,
  authorId:     'pastor001',
  authorName:   'Pastor John Williams',
  date:         dateStr(rand(1, 120)),
  type:         pick(NOTE_TYPES),
  content:      NOTE_CONTENTS[i % NOTE_CONTENTS.length],
  followUpDate: i % 3 === 0 ? dateStr(-rand(7, 30)) : null,
  isCompleted:  i % 5 === 0,
  tags:         i % 4 === 0 ? ['grief'] : i % 7 === 0 ? ['counseling'] : [],
}));

// ─── Prayer Requests ──────────────────────────────────────────────────────────
const PRAYER_REQUESTS_DATA = [
  { name: 'The Harrison Family',   req: 'Pray for healing as Tom undergoes cancer treatment.',                           status: 'Active'   },
  { name: 'Sarah Mitchell',        req: 'Seeking God\'s guidance in a career transition.',                               status: 'Active'   },
  { name: 'Youth Mission Team',    req: 'Safe travels and open hearts on the summer mission trip.',                     status: 'Active'   },
  { name: 'Pastor John Williams',  req: 'Wisdom and strength as I lead our congregation through change.',               status: 'Active'   },
  { name: 'The Nguyen Family',     req: 'Welcome them as they join our congregation from Vietnam.',                     status: 'Active'   },
  { name: 'Mark & Lisa Davis',     req: 'Pray for restored unity in their marriage.',                                   status: 'Active'   },
  { name: 'Anonymous',             req: 'Struggling with anxiety and fear. Seeking peace.',                             status: 'Active'   },
  { name: 'Grace Baptist Building Committee', req: 'Wisdom as we plan our new sanctuary expansion.',                   status: 'Active'   },
  { name: 'Robert Chen',           req: 'Recovered from stroke — praising God!',                                        status: 'Answered' },
  { name: 'Emily Watkins',         req: 'Baby arrived healthy — God is faithful!',                                      status: 'Answered' },
  { name: 'James Thompson',        req: 'Got the job — God provided!',                                                  status: 'Answered' },
];

const PRAYER_REQUESTS = PRAYER_REQUESTS_DATA.map((p, i) => ({
  id:        `${CHURCH_ID}_pr${i + 1}`,
  churchId:  CHURCH_ID,
  personId:  i < 5 ? PEOPLE[i].id : null,
  personName: p.name,
  request:   p.req,
  date:      dateStr(rand(1, 60)),
  status:    p.status,
  isPublic:  i !== 6,
  category:  pick(['Health','Family','Provision','Guidance','Relationships','Prayer']),
}));

// ─── Ministries & Metrics ────────────────────────────────────────────────────
const MINISTRY_DATA = [
  { name: 'Children\'s Ministry' },
  { name: 'Youth Ministry' },
  { name: 'Worship' },
  { name: 'Outreach' },
  { name: 'Discipleship' },
];

const MINISTRIES = MINISTRY_DATA.map((m, i) => ({
  id:       `${CHURCH_ID}_min${i + 1}`,
  churchId: CHURCH_ID,
  name:     m.name,
  isActive: true,
}));

const METRIC_DEFINITIONS = MINISTRIES.flatMap((min, mi) => [
  {
    id:         `${CHURCH_ID}_metdef${mi * 2 + 1}`,
    churchId:   CHURCH_ID,
    ministryId: min.id,
    name:       'Weekly Attendance',
    type:       'number',
    isActive:   true,
  },
  {
    id:         `${CHURCH_ID}_metdef${mi * 2 + 2}`,
    churchId:   CHURCH_ID,
    ministryId: min.id,
    name:       'Volunteer Hours',
    type:       'number',
    isActive:   true,
  },
]);

const METRIC_ENTRIES = MINISTRIES.flatMap((min, mi) =>
  Array.from({ length: 12 }, (_, w) => ({
    id:         `${CHURCH_ID}_metent${mi}_${w}`,
    churchId:   CHURCH_ID,
    date:       monthStr(11 - w),
    ministryId: min.id,
    values: {
      [`${CHURCH_ID}_metdef${mi * 2 + 1}`]: rand(10, 120),
      [`${CHURCH_ID}_metdef${mi * 2 + 2}`]: rand(5, 60),
    },
    updatedAt: now,
    updatedBy: 'admin',
  }))
);

// ─── Calculate actual risk profiles and generate changes based on Risk Profile Configuration ───
const riskSettings = {
  weights:    { attendance: 40, groups: 20, serving: 20, giving: 10, membership: 10 },
  thresholds: { healthyMin: 70, atRiskMin: 40 },
};

function calculateSeededPersonRisk(person, isDonor, isGroupMember, timesServed, settings) {
  let score = 0;
  const factors = [];

  // 1. Attendance (Check-ins)
  const checkIns = person.checkInCount || 0;
  let attendanceScore = 0;
  if (checkIns >= 8) attendanceScore = 1;
  else if (checkIns >= 3) attendanceScore = 0.7;
  else if (checkIns >= 1) attendanceScore = 0.3;
  
  score += attendanceScore * settings.weights.attendance;
  if (attendanceScore < 0.3) factors.push('Low Attendance');

  // 2. Groups
  const groupScore = isGroupMember ? 1 : 0;
  score += groupScore * settings.weights.groups;
  if (!isGroupMember) factors.push('Not in Group');

  // 3. Serving
  const targetServing = 4;
  let servingScore = 0;
  if (timesServed >= targetServing) servingScore = 1;
  else if (timesServed > 0) servingScore = timesServed / targetServing;
  
  score += servingScore * settings.weights.serving;
  if (timesServed === 0) factors.push('Not Serving');

  // 4. Giving
  const givingScore = isDonor ? 1 : 0;
  score += givingScore * settings.weights.giving;
  if (!isDonor) factors.push('No Giving History');

  // 5. Membership
  const isMember = person.membership === 'Member';
  score += (isMember ? 1 : 0) * settings.weights.membership;

  // Categorize
  let category = 'Disconnected';
  if (score >= settings.thresholds.healthyMin) category = 'Healthy';
  else if (score >= settings.thresholds.atRiskMin) category = 'At Risk';

  return {
    score: Math.round(score),
    category,
    factors
  };
}

const RISK_CHANGES = [];
const STATUS_CHANGES = [];

// Determine donor status, group membership, and times served for each person
const donorIds = new Set(DONATIONS.map(d => d.donorId));

const groupMembers = new Set();
GROUPS.forEach(g => {
  g.memberIds.forEach(mid => groupMembers.add(mid));
});

const volunteerCounts = new Map();
SERVICE_PLANS.forEach(p => {
  p.teamMembers?.forEach(tm => {
    const status = tm.status?.toLowerCase() || '';
    if (tm.personId && (status === 'confirmed' || status === 'c')) {
      volunteerCounts.set(tm.personId, (volunteerCounts.get(tm.personId) || 0) + 1);
    }
  });
});

// Update each person's riskProfile and simulate changes
PEOPLE.forEach((person, idx) => {
  const isDonor = donorIds.has(person.id);
  const isGroupMember = groupMembers.has(person.id);
  const timesServed = volunteerCounts.get(person.id) || 0;

  // Calculate current risk profile based on configuration
  const currentRisk = calculateSeededPersonRisk(person, isDonor, isGroupMember, timesServed, riskSettings);
  
  person.riskProfile = currentRisk;

  // Simulate historical changes for a subset of the people (e.g., first 30 people)
  // to populate the Status Changes widget with realistic historical movements
  if (idx < 30) {
    let pastDonor = isDonor;
    let pastGroupMember = isGroupMember;
    let pastTimesServed = timesServed;
    let pastCheckInCount = person.checkInCount || 0;
    
    // Simulate a different past state
    if (idx % 3 === 0) {
      // Improved: they were disconnected or at risk, now they are healthy/at risk (e.g. joined group & started giving)
      pastDonor = false;
      pastGroupMember = false;
      pastTimesServed = 0;
    } else if (idx % 3 === 1) {
      // Declined: they were healthy, but recently stopped serving or check-ins dropped
      pastTimesServed = Math.max(0, timesServed - 4);
      pastCheckInCount = Math.max(0, (person.checkInCount || 0) - 10);
    } else {
      // Dropped to Disconnected: had everything, now nothing
      pastDonor = true;
      pastGroupMember = true;
      pastTimesServed = 4;
      pastCheckInCount = 15;
    }

    const pastPersonObj = { ...person, checkInCount: pastCheckInCount };
    const pastRisk = calculateSeededPersonRisk(pastPersonObj, pastDonor, pastGroupMember, pastTimesServed, riskSettings);

    // If the category was different in the past, log a change record
    if (pastRisk.category !== currentRisk.category) {
      const daysAgo = rand(2, 28);
      const ts = now - daysAgo * 86400_000;
      const dStr = new Date(ts).toISOString();

      RISK_CHANGES.push({
        id: `${CHURCH_ID}_${person.id}_${ts}`,
        churchId: CHURCH_ID,
        personId: person.id,
        personName: person.name,
        date: dStr,
        oldCategory: pastRisk.category,
        newCategory: currentRisk.category,
        oldScore: pastRisk.score,
        newScore: currentRisk.score,
        reasons: currentRisk.factors,
        timestamp: ts
      });

      // Save historic category on the person document so the sync engine knows their previous state
      person.historicRiskCategory = pastRisk.category;
      person.historicRiskScore = pastRisk.score;
    }
  }

  // Also simulate Status/Membership changes
  if (idx < 20) {
    if (idx % 2 === 0) {
      // Membership change
      const daysAgo = rand(2, 60);
      const ts = now - daysAgo * 86400_000;
      const dStr = new Date(ts).toISOString();
      const oldVal = person.membership === 'Member' ? 'Regular Attendee' : 'Occasional Visitor';
      STATUS_CHANGES.push({
        id: `${CHURCH_ID}_${person.id}_membership_${ts}`,
        churchId: CHURCH_ID,
        personId: person.id,
        personName: person.name,
        date: dStr,
        type: 'membership',
        oldValue: oldVal,
        newValue: person.membership,
        timestamp: ts
      });
    } else {
      // Status change
      const daysAgo = rand(2, 60);
      const ts = now - daysAgo * 86400_000;
      const dStr = new Date(ts).toISOString();
      STATUS_CHANGES.push({
        id: `${CHURCH_ID}_${person.id}_status_${ts}`,
        churchId: CHURCH_ID,
        personId: person.id,
        personName: person.name,
        date: dStr,
        type: 'status',
        oldValue: 'active',
        newValue: 'inactive',
        timestamp: ts
      });
    }
  }
});

// ─── Users ────────────────────────────────────────────────────────────────────
const USERS = [
  {
    id: 'demo_admin_1',
    churchId: CHURCH_ID,
    name: 'Demo Admin',
    email: 'admin@gracebaptist.church',
    roles: ['Church Admin', 'Pastor', 'People', 'Services', 'Groups', 'Giving', 'Metrics', 'Messaging', 'Email', 'Workflows', 'Polls'],
    lastLogin: now,
    theme: 'dark'
  }
];

// ─── Twilio Numbers ────────────────────────────────────────────────────────────
const TWILIO_NUMBERS = [
  {
    id: `${CHURCH_ID}_+14045550199`,
    churchId: CHURCH_ID,
    phoneNumber: '+14045550199',
    friendlyName: 'Grace Baptist Main',
    isDefault: true,
    capabilities: { sms: true, mms: true, voice: false },
    status: 'active',
    createdAt: now - 365 * 86400_000,
    updatedAt: now
  }
];

// ─── SMS Campaigns ────────────────────────────────────────────────────────────
const SMS_CAMPAIGNS = [
  {
    id: `${CHURCH_ID}_smsCamp1`,
    churchId: CHURCH_ID,
    name: 'Easter Service Reminder',
    status: 'sent',
    content: "Hi [Name], we can't wait to celebrate Easter with you tomorrow at 9am and 11am! See you there. - Grace Baptist",
    scheduledAt: now - 30 * 86400_000,
    sentAt: now - 30 * 86400_000,
    createdAt: now - 32 * 86400_000,
    updatedAt: now - 30 * 86400_000,
    toListName: 'All Members',
    recipientCount: 150,
    metrics: { sent: 150, delivered: 148, failed: 2 }
  },
  {
    id: `${CHURCH_ID}_smsCamp2`,
    churchId: CHURCH_ID,
    name: 'Youth Group Cancellation',
    status: 'sent',
    content: 'Important: Youth group is cancelled tonight due to the weather. Stay safe!',
    scheduledAt: now - 5 * 86400_000,
    sentAt: now - 5 * 86400_000,
    createdAt: now - 5 * 86400_000,
    updatedAt: now - 5 * 86400_000,
    toGroupName: 'Youth Group (6th–12th)',
    recipientCount: 25,
    metrics: { sent: 25, delivered: 25, failed: 0 }
  }
];

// ─── SMS Workflows ────────────────────────────────────────────────────────────
const SMS_WORKFLOWS = [
  {
    id: `${CHURCH_ID}_wf1`,
    churchId: CHURCH_ID,
    name: 'First Time Guest Follow-up',
    isActive: true,
    trigger: 'keyword',
    keywordId: 'guest_keyword_id',
    steps: [
      { type: 'delay', delayMinutes: 10, channelType: 'sms' },
      { type: 'message', content: 'Thanks for joining us today! We have a small gift for you at the Welcome Desk.', channelType: 'sms' }
    ],
    createdAt: now - 60 * 86400_000,
    updatedAt: now - 60 * 86400_000
  }
];

// ─── SMS Conversations & Messages ──────────────────────────────────────────────
const SMS_CONVERSATIONS = [];
const SMS_MESSAGES = [];
PEOPLE.slice(0, 5).forEach((p, i) => {
  const convId = `${CHURCH_ID}_${p.phone.replace(/\\D/g, '')}`;
  SMS_CONVERSATIONS.push({
    id: convId,
    churchId: CHURCH_ID,
    personId: p.id,
    personName: p.name,
    twilioNumberId: `${CHURCH_ID}_+14045550199`,
    twilioPhoneNumber: '+14045550199',
    contactPhoneNumber: p.phone,
    lastMessageAt: now - (i * 86400_000),
    lastMessageBody: i % 2 === 0 ? 'Thanks, Pastor!' : 'Looking forward to Sunday.',
    lastMessageDirection: 'inbound',
    unreadCount: i % 2 === 0 ? 1 : 0,
    status: 'active'
  });
  
  SMS_MESSAGES.push({
    id: `${convId}_msg1`,
    churchId: CHURCH_ID,
    conversationId: convId,
    body: 'Hi, just a reminder about the volunteer meeting tomorrow at 7 PM.',
    direction: 'outbound',
    status: 'delivered',
    createdAt: now - (i * 86400_000) - 3600_000
  });
  SMS_MESSAGES.push({
    id: `${convId}_msg2`,
    churchId: CHURCH_ID,
    conversationId: convId,
    body: i % 2 === 0 ? 'Thanks, Pastor!' : 'Looking forward to Sunday.',
    direction: 'inbound',
    status: 'received',
    createdAt: now - (i * 86400_000)
  });
});

// ─── Email Campaigns ──────────────────────────────────────────────────────────
const EMAIL_CAMPAIGNS = [
  {
    id: `${CHURCH_ID}_email1`,
    churchId: CHURCH_ID,
    name: 'Weekly Newsletter',
    status: 'sent',
    subject: "What's happening this week at Grace Baptist",
    fromName: 'Grace Baptist Church',
    fromEmail: 'office@gracebaptist.church',
    scheduledAt: now - 3 * 86400_000,
    sentAt: now - 3 * 86400_000,
    createdAt: now - 5 * 86400_000,
    updatedAt: now - 3 * 86400_000,
    toListName: 'All Members',
    contentType: 'html',
    content: '<h1>Weekly Update</h1><p>Here is what is happening...</p>',
    sentHistory: [{ sentAt: now - 3 * 86400_000, recipientCount: 150 }]
  },
  {
    id: `${CHURCH_ID}_email2`,
    churchId: CHURCH_ID,
    name: 'Upcoming Draft Newsletter',
    status: 'draft',
    subject: 'Important Update from Pastor John',
    fromName: 'Pastor John Williams',
    fromEmail: 'office@gracebaptist.church',
    createdAt: now - 86400_000,
    updatedAt: now - 3600_000,
    contentType: 'html',
    content: '<h1>Pastor Update</h1><p>Draft content...</p>'
  }
];

// ─── Polls ────────────────────────────────────────────────────────────────────
const POLLS = [
  {
    id: `${CHURCH_ID}_poll1`,
    churchId: CHURCH_ID,
    title: 'Sermon Series Feedback',
    description: 'Let us know your thoughts on the recent Fresh Start series.',
    status: 'active',
    createdAt: now - 2 * 86400_000,
    updatedAt: now,
    questions: [
      { id: 'q1', type: 'single_choice', text: 'How helpful was the series?', options: ['Very Helpful', 'Somewhat Helpful', 'Not Helpful'], required: true },
      { id: 'q2', type: 'text', text: 'Any other comments?', required: false }
    ],
    responseCount: 12
  }
];

// ─── Check-Ins & Weather ──────────────────────────────────────────────────────
const CHECK_INS = [];
const WEATHER_RECORDS = [];
ATTENDANCE.forEach((att) => {
  WEATHER_RECORDS.push({
    id: `${CHURCH_ID}_${att.date}`,
    churchId: CHURCH_ID,
    date: att.date,
    tempHigh: rand(50, 90),
    tempLow: rand(30, 70),
    precipProb: rand(0, 100),
    precipAmount: rand(0, 2),
    conditions: pick(['Clear', 'Rain', 'Cloudy', 'Partly Cloudy']),
    source: 'visual_crossing',
    fetchedAt: now
  });

  if (now - new Date(att.date).getTime() < 30 * 86400_000) {
    PEOPLE.slice(0, 10).forEach(p => {
      CHECK_INS.push({
        id: `${CHURCH_ID}_${p.id}_${att.date}`,
        churchId: CHURCH_ID,
        personId: p.id,
        eventId: `${CHURCH_ID}_evt_${att.date}`,
        date: att.date,
        createdAt: new Date(new Date(att.date).getTime() + 8 * 3600_000).toISOString(),
        checkedInAt: new Date(new Date(att.date).getTime() + 8.5 * 3600_000).toISOString(),
        kind: 'Regular'
      });
    });
  }
});

// ─── Church Document ───────────────────────────────────────────────────────────


const CHURCH_DOC = {
  id:                 CHURCH_ID,
  name:               'Grace Baptist Church',
  subdomain:          'grace',
  pcoConnected:       true,
  lastSyncTimestamp:  now,
  address:            '1200 Peachtree St NE',
  city:               'Atlanta',
  state:              'GA',
  zip:                '30309',
  phone:              '(404) 555-0142',
  website:            'https://gracebaptist.church',
  email:              'office@gracebaptist.church',
  allowSignups:       true,
  metricsSharingEnabled: true,
  subscription: {
    status:           'active',
    planId:           'growth',
    currentPeriodEnd: now + 30 * 86400_000,
    customerId:       'cus_demo_grace',
  },
  riskSettings: {
    weights:    { attendance: 40, groups: 20, serving: 20, giving: 10, membership: 10 },
    thresholds: { healthyMin: 70, atRiskMin: 40 },
  },
  metricsSettings: {
    showCensusWidgets:  true,
    showCityPenetration: true,
  },
  communityLocations: [
    { id: 'loc1', name: 'Atlanta Campus', city: 'Atlanta', state: 'GA', zip: '30309', isDefault: true },
  ],
};

// ─── Reset ────────────────────────────────────────────────────────────────────
async function resetDemoData() {
  console.log('\\n🗑  Resetting demo data for tenant:', CHURCH_ID);
  const collections = [
    'people','groups','attendance','detailed_donations','funds','budgets',
    'teams','service_plans','pco_registrations','pco_registration_attendees',
    'pastoral_notes','prayer_requests','ministries','metric_definitions','metric_entries',
    'risk_changes','status_changes',
    'users', 'twilioNumbers', 'smsCampaigns', 'smsWorkflows', 'smsConversations',
    'messages', 'email_campaigns', 'polls', 'check_ins', 'weather'
  ];
  for (const col of collections) {
    await clearCollection(col);
  }
  console.log('\\nReset complete.\\n');
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\\n=== Grace Baptist Church Demo Data Seeder ===');
  console.log(`Target: ${PROJECT_ID} / ${DATABASE_ID} / tenant: ${CHURCH_ID}\\n`);

  if (RESET) {
    await resetDemoData();
  }

  console.log('Seeding church document...');
  await db.collection('churches').doc(CHURCH_ID).set(CHURCH_DOC, { merge: true });
  console.log('  ✓ churches/' + CHURCH_ID);

  console.log('\\nSeeding users...');
  await batchSet('users', USERS);

  console.log('\\nSeeding Twilio numbers...');
  await batchSet('twilioNumbers', TWILIO_NUMBERS);

  console.log('\\nSeeding people...');
  await batchSet('people', PEOPLE);

  console.log('\\nSeeding groups...');
  await batchSet('groups', GROUPS);

  console.log('\\nSeeding attendance (52 weeks)...');
  await batchSet('attendance', ATTENDANCE);

  console.log('\\nSeeding check-ins...');
  await batchSet('check_ins', CHECK_INS);

  console.log('\\nSeeding weather records...');
  await batchSet('weather', WEATHER_RECORDS);

  console.log('\\nSeeding funds...');
  await batchSet('funds', FUNDS);

  console.log('\\nSeeding donations (600 records)...');
  await batchSet('detailed_donations', DONATIONS);

  console.log('\\nSeeding budgets...');
  await batchSet('budgets', BUDGETS);

  console.log('\\nSeeding service teams...');
  await batchSet('teams', TEAMS);

  console.log('\\nSeeding service plans...');
  await batchSet('service_plans', SERVICE_PLANS);

  console.log('\\nSeeding PCO registration events...');
  await batchSet('pco_registrations', PCOREGISTRATIONS);

  console.log('\\nSeeding pastoral notes...');
  await batchSet('pastoral_notes', PASTORAL_NOTES);

  console.log('\\nSeeding prayer requests...');
  await batchSet('prayer_requests', PRAYER_REQUESTS);

  console.log('\\nSeeding ministries...');
  await batchSet('ministries', MINISTRIES);

  console.log('\\nSeeding metric definitions...');
  await batchSet('metric_definitions', METRIC_DEFINITIONS);

  console.log('\\nSeeding metric entries...');
  await batchSet('metric_entries', METRIC_ENTRIES);

  console.log('\\nSeeding risk changes...');
  await batchSet('risk_changes', RISK_CHANGES);

  console.log('\\nSeeding status changes...');
  await batchSet('status_changes', STATUS_CHANGES);

  console.log('\\nSeeding SMS campaigns...');
  await batchSet('smsCampaigns', SMS_CAMPAIGNS);

  console.log('\\nSeeding SMS workflows...');
  console.log('\nSeeding SMS workflows...');
  await batchSet('smsWorkflows', SMS_WORKFLOWS);

  console.log('\nSeeding SMS conversations...');
  await batchSet('smsConversations', SMS_CONVERSATIONS);

  console.log('\nSeeding SMS messages...');
  const msgBatch = db.batch();
  for (const m of SMS_MESSAGES) {
    const ref = db.collection('smsConversations').doc(m.conversationId).collection('messages').doc(m.id);
    msgBatch.set(ref, m, { merge: true });
  }
  await msgBatch.commit();

  console.log('\nSeeding Email campaigns...');
  await batchSet('email_campaigns', EMAIL_CAMPAIGNS);

  console.log('\nSeeding Polls...');
  await batchSet('polls', POLLS);

  console.log(`
✅ Done! Grace Baptist Church (${CHURCH_ID}) is fully seeded.

Summary:
  - ${PEOPLE.length} people (members, attendees, visitors)
  - ${GROUPS.length} groups across 7 ministry types
  - ${ATTENDANCE.length} weeks of attendance data
  - ${FUNDS.length} giving funds + ${BUDGETS.length} budget records
  - ${DONATIONS.length} donation transactions
  - ${TEAMS.length} service teams + ${SERVICE_PLANS.length} service plans
  - ${PCOREGISTRATIONS.length} upcoming registration events
  - ${PASTORAL_NOTES.length} pastoral notes
  - ${PRAYER_REQUESTS.length} prayer requests
  - ${MINISTRIES.length} ministry departments + metrics
  - ${RISK_CHANGES.length} risk status change records
  - ${STATUS_CHANGES.length} status/membership change records
  - ${SMS_CAMPAIGNS.length} SMS campaigns
  - ${EMAIL_CAMPAIGNS.length} Email campaigns
  - ${SMS_WORKFLOWS.length} SMS workflows
  - ${SMS_CONVERSATIONS.length} SMS conversations
  - ${POLLS.length} polls
  - ${CHECK_INS.length} check-ins
  - ${WEATHER_RECORDS.length} weather records

Open the app and log in as a Grace Baptist admin to see the data.
`);
}

main().catch(e => {
  console.error('\\n✗ Seeder failed:', e.message);
  process.exit(1);
});
