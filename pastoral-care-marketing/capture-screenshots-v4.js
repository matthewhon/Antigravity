const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SAVE_DIR = path.join(__dirname, 'app images');
const BASE_URL = 'https://pastoralcare.barnabassoftware.com';
const EMAIL = 'test@test.com';
const PASSWORD = 'Pastor123';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
async function shot(page, name, fullPage = true) {
  await page.screenshot({ path: path.join(SAVE_DIR, name), fullPage });
  console.log(`✅ Saved: ${name}`);
}
async function clickContains(page, text, waitMs = 2000) {
  try {
    const btn = page.locator('button, a, li, [role="tab"], [role="menuitem"]').filter({ hasText: text }).first();
    if (await btn.count() > 0) { await btn.click(); await sleep(waitMs); console.log(`  ✔ Clicked: "${text}"`); return true; }
  } catch(e) {}
  console.log(`  ⚠ Not found: "${text}"`); return false;
}
async function listButtons(page) {
  return page.$$eval('button, a[role="button"], [role="tab"]', els =>
    els.map(el => el.textContent?.trim().substring(0, 80)).filter(Boolean)
  );
}

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 }).then(c => c.newPage());

  // Login
  console.log('🔐 Logging in…');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  const emailInput = page.locator('input[type="email"]').first();
  if (await emailInput.count() > 0) {
    await emailInput.fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.keyboard.press('Enter');
    await sleep(5000);
  }

  // ── TOOLS → Quick Send Email ──────────────────────
  console.log('\n🧰 Tools > Quick Send Email…');
  await clickContains(page, 'Tools');
  await sleep(1500);
  await shot(page, 'tools-overview.png');

  console.log('Buttons in Tools:', await listButtons(page));

  await clickContains(page, 'Quick Send Email');
  await sleep(1500);
  await shot(page, 'tools-quick-send-email.png');

  // ── TOOLS → Create Campaign (email builder) ───────
  console.log('\n📧 Tools > Create Campaign…');
  await clickContains(page, 'Tools');
  await sleep(1000);
  await clickContains(page, 'Create Campaign');
  await sleep(2000);
  await shot(page, 'tools-email-campaign.png');

  // Inspect buttons inside campaign builder
  const campaignBtns = await listButtons(page);
  console.log('Campaign builder buttons:', campaignBtns);

  // ── CARE → drill into sub-tabs ────────────────────
  console.log('\n🕊️ Care sub-tabs…');
  await clickContains(page, 'Care');
  await sleep(2000);
  await shot(page, 'care-overview.png');
  const careBtns = await listButtons(page);
  console.log('Care buttons:', careBtns);

  // Try all visible sub-tabs
  for (const tab of careBtns.slice(0, 20)) {
    if (tab.length > 1 && tab.length < 30 && !['Dashboard','People','Groups','Services','Giving','Care','Metrics','Tools'].some(n => tab.includes(n))) {
      await clickContains(page, tab, 1000);
      await shot(page, `care-${tab.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0,20)}.png`);
    }
  }

  // ── SMS inside Tools — look at the full page DOM ──
  console.log('\n📱 Checking Tools for SMS sub-items via URL navigation…');
  await clickContains(page, 'Tools');
  await sleep(1500);

  // Try navigating to common SMS sub-routes
  const smsRoutes = [
    { path: '/sms', file: 'sms-inbox.png' },
    { path: '/messaging', file: 'sms-inbox.png' },
    { path: '/tools/sms', file: 'sms-inbox.png' },
    { path: '/tools/messaging', file: 'sms-inbox.png' },
    { path: '/tools/mass-text', file: 'sms-mass-text.png' },
    { path: '/tools/keywords', file: 'sms-keywords.png' },
    { path: '/tools/polls', file: 'tools-polls.png' },
    { path: '/tools/forms', file: 'tools-forms.png' },
    { path: '/tools/prayer', file: 'tools-prayer.png' },
    { path: '/tools/outreach', file: 'tools-outreach.png' },
    { path: '/tools/workflow', file: 'tools-workflows.png' },
  ];

  for (const { path: routePath, file } of smsRoutes) {
    try {
      await page.goto(BASE_URL + routePath, { waitUntil: 'domcontentloaded', timeout: 8000 });
      await sleep(2000);
      const url = page.url();
      // Only save if it actually navigated (not redirected back to login/dashboard)
      if (!url.includes('login') && url !== BASE_URL + '/') {
        await shot(page, file);
        console.log(`  Navigated to ${url}`);
      }
    } catch(e) { /* route doesn't exist */ }
  }

  // ── PASTOR AI ─────────────────────────────────────
  console.log('\n🤖 Pastor AI with prompts visible…');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
  await sleep(3000);
  await clickContains(page, 'AI');
  await sleep(2000);
  await shot(page, 'pastor-ai.png');

  // ── METRICS ───────────────────────────────────────
  console.log('\n📈 Metrics…');
  await clickContains(page, 'Metrics');
  await sleep(2000);
  await shot(page, 'metrics.png');
  const metricBtns = await listButtons(page);
  console.log('Metrics buttons:', metricBtns);
  for (const tab of metricBtns.slice(8, 20)) {
    if (tab.length > 1 && tab.length < 30) {
      await clickContains(page, tab, 1000);
      await shot(page, `metrics-${tab.toLowerCase().replace(/[^a-z0-9]/g, '-').substring(0,20)}.png`);
    }
  }

  await browser.close();

  const files = fs.readdirSync(SAVE_DIR).filter(f => f.endsWith('.png') && !f.startsWith('_') && !f.startsWith('Simulator'));
  console.log('\n🎉 Done! Captured:\n' + files.join('\n'));
})();
