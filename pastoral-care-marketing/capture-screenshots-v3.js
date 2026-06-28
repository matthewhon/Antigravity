const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SAVE_DIR = path.join(__dirname, 'app images');
const BASE_URL = 'https://pastoralcare.barnabassoftware.com';
const EMAIL = 'test@test.com';
const PASSWORD = 'Pastor123';

async function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function shot(page, name, fullPage = true) {
  const filePath = path.join(SAVE_DIR, name);
  await page.screenshot({ path: filePath, fullPage });
  console.log(`✅ Saved: ${name}`);
  return filePath;
}

// Click a button whose textContent *contains* the given string (emoji-safe)
async function clickContains(page, text, waitMs = 2000) {
  try {
    const btn = page.locator(`button, a, li`).filter({ hasText: text }).first();
    if (await btn.count() > 0) {
      await btn.click();
      await sleep(waitMs);
      console.log(`  ✔ Clicked: "${text}"`);
      return true;
    }
  } catch(e) { /* skip */ }
  console.log(`  ⚠ Not found: "${text}"`);
  return false;
}

// List all visible button texts on the page
async function listButtons(page) {
  return page.$$eval('button, a[role="button"]', els =>
    els.map(el => el.textContent?.trim().substring(0, 80)).filter(Boolean)
  );
}

(async () => {
  if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  // ── LOGIN ──────────────────────────────────────────
  console.log('🌐 Logging in…');
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30000 });
  await sleep(3000);
  const emailInput = page.locator('input[type="email"], input[name="email"]').first();
  if (await emailInput.count() > 0) {
    await emailInput.fill(EMAIL);
    await page.locator('input[type="password"]').first().fill(PASSWORD);
    await page.keyboard.press('Enter');
    await sleep(5000);
  }
  console.log('URL after login:', page.url());
  await shot(page, 'dashboard.png');

  // ── SMS / TOOLS — find what's in the left sidebar/top nav ──
  console.log('\n🔍 Listing all top-level buttons…');
  const allBtns = await listButtons(page);
  console.log(allBtns.slice(0, 30));

  // ── TOOLS section ─────────────────────────────────
  console.log('\n📸 Tools overview…');
  await clickContains(page, 'Tools');
  await sleep(1500);
  await shot(page, 'tools-overview.png');

  // Inspect what buttons appear after clicking Tools
  const toolBtns = await listButtons(page);
  console.log('Tools sub-buttons:', toolBtns);

  // Screenshot each tool sub-item by its visible button text
  const toolTargets = [
    { contains: 'SMS',            file: 'tools-sms.png' },
    { contains: 'Mass',           file: 'tools-mass-text.png' },
    { contains: 'Broadcast',      file: 'tools-mass-text.png' },
    { contains: 'Keyword',        file: 'tools-keywords.png' },
    { contains: 'Poll',           file: 'tools-polls.png' },
    { contains: 'Form',           file: 'tools-forms.png' },
    { contains: 'Connect',        file: 'tools-connect-cards.png' },
    { contains: 'Prayer',         file: 'tools-prayer.png' },
    { contains: 'Outreach',       file: 'tools-outreach.png' },
    { contains: 'Session',        file: 'tools-sessions.png' },
    { contains: 'Quick Send',     file: 'tools-quick-send.png' },
    { contains: 'Workflow',       file: 'tools-workflows.png' },
    { contains: 'Automation',     file: 'tools-workflows.png' },
    { contains: 'Campaign',       file: 'tools-email-campaign.png' },
    { contains: 'Template',       file: 'tools-templates.png' },
    { contains: 'Note',           file: 'tools-notes.png' },
  ];

  for (const { contains, file } of toolTargets) {
    const clicked = await clickContains(page, contains, 1500);
    if (clicked) {
      await shot(page, file);
      // Navigate back to Tools
      await clickContains(page, 'Tools', 1000);
    }
  }

  // ── SMS / MESSAGING ───────────────────────────────
  console.log('\n📱 Looking for SMS / Messaging section…');
  // Try clicking top nav items that might be SMS
  const smsTargets = ['SMS', 'Messages', 'Messaging', 'Inbox', 'Chat', 'Texting', 'Communication'];
  for (const t of smsTargets) {
    const found = await clickContains(page, t, 1500);
    if (found) {
      await shot(page, 'sms-inbox.png');
      // Try sub-tabs
      for (const sub of ['Inbox', 'Compose', 'Keywords', 'Conversations', 'Broadcast', 'Mass Text']) {
        const sc = await clickContains(page, sub, 1000);
        if (sc) await shot(page, `sms-${sub.toLowerCase().replace(/\s+/g, '-')}.png`);
      }
      break;
    }
  }

  // ── EMAIL / COMMUNICATION ─────────────────────────
  console.log('\n📧 Email / Communication…');
  await clickContains(page, 'Email');
  await shot(page, 'tools-email-builder.png');

  // ── CARE / PASTORAL ───────────────────────────────
  console.log('\n🕊️ Care module…');
  await clickContains(page, 'Care');
  await sleep(1500);
  await shot(page, 'pastoral.png');
  // Sub-tabs inside Care
  const careTabs = ['Notes', 'Log', 'Prayer', 'Calendar', 'Visits', 'Tasks', 'Follow'];
  for (const t of careTabs) {
    const c = await clickContains(page, t, 1000);
    if (c) await shot(page, `care-${t.toLowerCase()}.png`);
  }

  // ── PASTOR AI ─────────────────────────────────────
  console.log('\n🤖 Pastor AI…');
  for (const t of ['Pastor AI', 'AI', 'Gemini', 'Assistant']) {
    const f = await clickContains(page, t, 1500);
    if (f) { await shot(page, 'pastor-ai.png'); break; }
  }

  // ── METRICS ───────────────────────────────────────
  console.log('\n📈 Metrics…');
  await clickContains(page, 'Metrics');
  await shot(page, 'metrics.png');

  await browser.close();

  const files = fs.readdirSync(SAVE_DIR)
    .filter(f => f.endsWith('.png') && !f.startsWith('_'));
  console.log('\n🎉 Done! Captured:', files.join(', '));
})();
