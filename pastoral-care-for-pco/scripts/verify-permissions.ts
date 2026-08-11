import { hasModuleAccess, canReadArea, DashboardArea } from '../services/permissionService';
import { User, UserRole } from '../types';

// ── Verbatim copy of the pre-refactor hasPermission body (App.tsx @ 9718262) ──
const oldHasPermission = (user: User | null, v: string, isStarterPlan: boolean, commEnabled: boolean) => {
    if (!user) return false;
    if (isStarterPlan && v === 'pastor-ai') return false;
    if (v === 'communication' && commEnabled === false) return false;
    if (user.roles.includes('System Administration') || user.roles.includes('Church Admin')) return true;
    if (v === 'dashboard') return true;
    if (v === 'settings') return user.roles.includes('Church Admin');
    if (v === 'pastoral') return user.roles.includes('Pastor') || user.roles.includes('Pastoral Care');
    if (v === 'pastoral-membership') return user.roles.includes('Pastor') || user.roles.includes('Pastoral Care');
    if (v === 'pastoral-community') return user.roles.includes('Pastor') || user.roles.includes('Pastoral Care');
    if (v === 'pastoral-care') return user.roles.includes('Pastor') || user.roles.includes('Pastoral Care');
    if (v === 'pastoral-calendar') return user.roles.includes('Pastor') || user.roles.includes('Pastoral Care');
    if (v === 'pastoral-reports') return user.roles.includes('Pastor') || user.roles.includes('Pastoral Care');
    if (v === 'pastor-ai') return user.roles.includes('Pastor AI') || user.roles.includes('Pastor');
    if (isStarterPlan) {
        if (v === 'pastoral-contact' || v === 'pastoral-group-care') return false;
        if (v === 'tools-polls') return false;
        if (v === 'tools-workflows') return false;
        if (v === 'tools-forms') return false;
        if (v === 'tools-notes') return false;
        if (v === 'tools-bulletin') return false;
    }
    if (v === 'pastoral-contact' || v === 'pastoral-group-care') return user.roles.includes('Pastor') || user.roles.includes('Pastoral Care') || user.roles.includes('Groups');
    const roleMap: Record<string, string> = {
        'people': 'People', 'people-households': 'People', 'people-risk': 'People', 'people-reports': 'People',
        'groups': 'Groups', 'groups-reports': 'Groups',
        'services': 'Services', 'services-attendance': 'Services', 'services-teams': 'Services',
        'services-plans': 'Services', 'services-reminders': 'Services',
        'giving': 'Giving', 'giving-donor': 'Giving', 'giving-budgets': 'Giving',
        'giving-donations': 'Giving', 'giving-reports': 'Giving',
        'finance': 'Finance', 'metrics': 'Metrics', 'metrics-input': 'Metrics', 'metrics-settings': 'Metrics',
        'messaging': 'Messaging', 'tools-sms': 'Messaging', 'tools-sms-inbox': 'Messaging',
        'tools-sms-campaigns': 'Messaging', 'tools-sms-workflows': 'Messaging', 'tools-sms-keywords': 'Messaging',
        'tools-sms-analytics': 'Messaging', 'tools-sms-agent': 'Messaging', 'tools-sms-permissions': 'Messaging',
        'tools-emails': 'Email', 'tools-polls': 'Polls', 'tools-workflows': 'Workflows',
        'tools-notes': 'Notes', 'tools-files': 'Files', 'tools-forms': 'People',
    };
    if (v === 'tools') return true;
    if (v.startsWith('tools-') && !roleMap[v]) return true;
    const requiredRole = roleMap[v];
    return requiredRole ? user.roles.includes(requiredRole as any) : false;
};

const ALL_ROLES: UserRole[] = ['Church Admin','Pastor','Pastor AI','People','Services','Groups','Giving',
    'Finance','Pastoral Care','Metrics','System Administration','Messaging','Email','Polls','Workflows','Notes'];

const VIEWS = ['dashboard','settings','communication','pastoral','pastoral-membership','pastoral-community',
    'pastoral-care','pastoral-calendar','pastoral-reports','pastor-ai','pastoral-contact','pastoral-group-care',
    'people','people-households','people-risk','people-reports','groups','groups-reports','services',
    'services-attendance','services-teams','services-plans','services-reminders','services-reports','giving',
    'giving-donor','giving-budgets','giving-donations','giving-reports','finance','metrics','metrics-input',
    'metrics-settings','messaging','tools','tools-sms','tools-sms-inbox','tools-sms-campaigns','tools-sms-workflows',
    'tools-sms-keywords','tools-sms-analytics','tools-sms-agent','tools-sms-permissions','tools-emails','tools-polls',
    'tools-workflows','tools-notes','tools-files','tools-forms','tools-bulletin','tools-website','tools-qrcodes',
    'tools-unsubscribers','tools-church-helper','unknown-view'];

// Every single role alone, every pair, plus empty and all-roles.
const roleSets: UserRole[][] = [[], ALL_ROLES.slice()];
ALL_ROLES.forEach(r => roleSets.push([r]));
ALL_ROLES.forEach(a => ALL_ROLES.forEach(b => { if (a < b) roleSets.push([a, b]); }));

let checks = 0, mismatches = 0;
for (const roles of roleSets) {
  const user = { id: 'u', churchId: 'c', name: 'T', email: 't@t', roles } as User;
  for (const view of VIEWS) {
    for (const starter of [false, true]) {
      for (const comm of [true, false]) {
        const before = oldHasPermission(user, view, starter, comm);
        const after  = hasModuleAccess(user, view, { isStarterPlan: starter, communicationEnabled: comm });
        checks++;
        if (before !== after) {
          mismatches++;
          if (mismatches <= 10) console.log(`MISMATCH roles=[${roles}] view=${view} starter=${starter} comm=${comm}: before=${before} after=${after}`);
        }
      }
    }
  }
}
// null user
if (hasModuleAccess(null, 'dashboard') !== false) { console.log('MISMATCH null user'); mismatches++; }

console.log(`${checks.toLocaleString()} module-access checks compared against the pre-refactor implementation — ${mismatches} mismatches`);

// ── canReadArea: the dashboard's read gate ───────────────────────────────────
const mk = (roles: UserRole[]) => ({ id: 'u', churchId: 'c', name: 'T', email: 't@t', roles } as User);
const AREAS: DashboardArea[] = ['people','giving','groups','services','messaging','email','outreach','care','admin'];

let failed = 0;
const expect = (label: string, actual: boolean, wanted: boolean) => {
  if (actual !== wanted) { console.log(`  FAIL ${label}: expected ${wanted}, got ${actual}`); failed++; }
};

// Pastor reads every area except admin.
AREAS.forEach(a => expect(`Pastor can read ${a}`, canReadArea(mk(['Pastor']), a), a !== 'admin'));

// Admin reads everything including admin.
AREAS.forEach(a => expect(`Church Admin can read ${a}`, canReadArea(mk(['Church Admin']), a), true));

// Giving-only reads giving and nothing else.
AREAS.forEach(a => expect(`Giving-only can read ${a}`, canReadArea(mk(['Giving']), a), a === 'giving'));

// Messaging+Email reads exactly those two.
AREAS.forEach(a => expect(`Messaging+Email can read ${a}`, canReadArea(mk(['Messaging','Email']), a),
  a === 'messaging' || a === 'email'));

// Groups grants outreach too (matches pastoral-contact).
expect('Groups can read outreach', canReadArea(mk(['Groups']), 'outreach'), true);
expect('Groups cannot read care',  canReadArea(mk(['Groups']), 'care'), false);

// No roles, and no user, read nothing.
AREAS.forEach(a => expect(`roleless cannot read ${a}`, canReadArea(mk([]), a), false));
AREAS.forEach(a => expect(`null user cannot read ${a}`, canReadArea(null, a), false));

// canReadArea is never narrower than module access.
for (const roles of roleSets) {
  const u = mk(roles);
  ([['people','people'],['giving','giving'],['groups','groups'],['services','services'],
    ['messaging','messaging'],['email','tools-emails'],['outreach','pastoral-contact'],
    ['care','pastoral-care']] as [DashboardArea, string][]).forEach(([area, view]) => {
    if (hasModuleAccess(u, view) && !canReadArea(u, area)) {
      console.log(`  FAIL [${roles}] can open ${view} but cannot read ${area}`); failed++;
    }
  });
}

console.log(`canReadArea assertions — ${failed} failures`);
process.exit(mismatches === 0 && failed === 0 ? 0 : 1);
