const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

const SAVE_DIR = path.join(__dirname, 'app images');
const BASE_URL = 'https://pastoralcare.barnabassoftware.com';
const EMAIL = 'test@test.com';
const PASSWORD = 'Pastor123';

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

async function shot(page, name, fullPage = true) {
  const filePath = path.join(SAVE_DIR, name);
  await page.screenshot({ path: filePath, fullPage });
  console.log(`✅ Saved: ${name}`);
  return filePath;
}

async function clickNav(page, label) {
  // Try buttons first, then links
  const selectors = [
    `button:has-text("${label}")`,
    `a:has-text("${label}")`,
    `[class*="nav"]:has-text("${label}")`,
    `[class*="sidebar"]:has-text("${label}")`,
    `[class*="menu"]:has-text("${label}")`,
    `li:has-text("${label}")`,
  ];
  for (const sel of selectors) {
    try {
      const el = page.locator(sel).first();
      const count = await el.count();
      if (count > 0) {
        await el.click();
        await sleep(2000);
        console.log(`  Clicked nav: ${label}`);
        return true;
      }
    } catch(e) { /* try next */ }
  }
  console.log(`  ⚠️  Could not click nav: ${label}`);
  return false;
}

(async () => {
  if (!fs.existsSync(SAVE_DIR)) fs.mkdirSync(SAVE_DIR, { recursive: true });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    deviceScaleFactor: 2,
  });
  const page = await context.newPage();

  console.log('🌐 Navigating to app…');
  try {
    await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 20000 });
    await sleep(3000);
  } catch(e) {
    console.log('Initial navigation timeout, continuing…');
    await sleep(2000);
  }
  console.log('Current URL:', page.url());

  // --- LOGIN ---
  console.log('🔐 Logging in…');
  try {
    const emailInput = page.locator('input[type="email"], input[name="email"], input[placeholder*="email" i], input[placeholder*="Email" i]').first();
    const emailCount = await emailInput.count();
    console.log('Email inputs found:', emailCount);
    if (emailCount > 0) {
      await emailInput.fill(EMAIL);
      const passInput = page.locator('input[type="password"]').first();
      await passInput.fill(PASSWORD);
      await page.keyboard.press('Enter');
      await sleep(5000);
      console.log('URL after login attempt:', page.url());
    }
  } catch(e) {
    console.log('Login error:', e.message.split('\n')[0]);
  }

  await shot(page, '_after-login.png', false);

  // --- DASHBOARD ---
  console.log('\n📸 Dashboard…');
  await shot(page, 'dashboard.png');

  // --- PEOPLE ---
  console.log('\n📸 People/Members…');
  await clickNav(page, 'People');
  await shot(page, 'members.png');

  // --- GROUPS ---
  console.log('\n📸 Groups…');
  await clickNav(page, 'Groups');
  await shot(page, 'groups.png');

  // --- SERVICES ---
  console.log('\n📸 Services…');
  await clickNav(page, 'Services');
  await shot(page, 'services.png');

  // --- GIVING ---
  console.log('\n📸 Giving…');
  await clickNav(page, 'Giving');
  await shot(page, 'giving.png');

  // --- CARE ---
  console.log('\n📸 Care/Pastoral…');
  await clickNav(page, 'Care');
  await shot(page, 'pastoral.png');
  // Try multiple sub-tabs of Care
  const careTabs = ['Church', 'Membership', 'Community', 'Care', 'Calendar'];
  for (const tab of careTabs) {
    try {
      const el = page.locator(`button:has-text("${tab}"), [class*="tab"]:has-text("${tab}")`).first();
      if (await el.count() > 0) {
        await el.click();
        await sleep(1500);
        await shot(page, `care-${tab.toLowerCase()}.png`);
      }
    } catch(e) { /* skip */ }
  }

  // --- METRICS ---
  console.log('\n📸 Metrics/Analytics…');
  await clickNav(page, 'Metrics');
  await shot(page, 'analytics.png');
  await shot(page, 'metrics.png');

  // --- TOOLS ---
  console.log('\n📸 Tools…');
  await clickNav(page, 'Tools');
  await sleep(1500);
  await shot(page, 'tools-overview.png');

  // Try to find and screenshot all tool sub-items
  const toolSubItems = await page.$$eval(
    'button, a, [class*="tool-item"], [class*="tool-card"], [class*="list-item"], li',
    els => els.map(el => ({ text: el.textContent?.trim().substring(0, 60), tag: el.tagName }))
             .filter(el => el.text && el.text.length > 1)
  );
  console.log('Tool sub-items found:', toolSubItems.slice(0, 30));

  // Common tool names to try clicking
  const toolItems = [
    { name: 'Polls', file: 'tools-polls.png' },
    { name: 'Poll', file: 'tools-polls.png' },
    { name: 'Forms', file: 'tools-forms.png' },
    { name: 'Connect Cards', file: 'tools-connect-cards.png' },
    { name: 'Connect Card', file: 'tools-connect-cards.png' },
    { name: 'Workflows', file: 'tools-workflows.png' },
    { name: 'Workflow', file: 'tools-workflows.png' },
    { name: 'Email Builder', file: 'tools-email-builder.png' },
    { name: 'Email', file: 'tools-email.png' },
    { name: 'Prayer', file: 'tools-prayer.png' },
    { name: 'Prayer Requests', file: 'tools-prayer-requests.png' },
    { name: 'Outreach', file: 'tools-outreach.png' },
    { name: 'Sessions', file: 'tools-sessions.png' },
    { name: 'PCO Notes', file: 'tools-pco-notes.png' },
    { name: 'Quick Send', file: 'tools-quick-send.png' },
    { name: 'Keywords', file: 'tools-keywords.png' },
    { name: 'Keyword', file: 'tools-keywords.png' },
    { name: 'Mass Text', file: 'tools-mass-text.png' },
    { name: 'Broadcast', file: 'tools-broadcast.png' },
    { name: 'Template', file: 'tools-templates.png' },
    { name: 'Templates', file: 'tools-templates.png' },
  ];

  for (const item of toolItems) {
    const clicked = await clickNav(page, item.name);
    if (clicked) {
      await sleep(1500);
      await shot(page, item.file);
      // Go back to tools after each
      await clickNav(page, 'Tools');
      await sleep(1000);
    }
  }

  // Go back to dashboard and look for SMS/Messaging nav
  console.log('\n📸 Looking for SMS/Messaging…');
  await clickNav(page, 'Dashboard');
  await sleep(1000);

  // Look for SMS section
  const smsSelectors = ['SMS', 'Messages', 'Messaging', 'Inbox', 'Communication', 'Chat', 'Texting'];
  for (const sel of smsSelectors) {
    const found = await clickNav(page, sel);
    if (found) {
      await shot(page, 'messaging.png');
      // Try sub sections
      const subSections = ['Inbox', 'Compose', 'Conversations', 'Keywords', 'Mass Text', 'Broadcast', 'Settings'];
      for (const sub of subSections) {
        const subClicked = await clickNav(page, sub);
        if (subClicked) {
          await shot(page, `sms-${sub.toLowerCase().replace(/\s+/g, '-')}.png`);
        }
      }
      break;
    }
  }

  // --- PASTOR AI ---
  console.log('\n📸 Pastor AI…');
  const aiSelectors = ['Pastor AI', 'AI', 'Gemini', 'Assistant', 'Chat'];
  for (const sel of aiSelectors) {
    const found = await clickNav(page, sel);
    if (found) {
      await shot(page, 'pastor-ai.png');
      break;
    }
  }

  // Communication
  console.log('\n📸 Communication/Email…');
  const commSelectors = ['Communication', 'Email', 'Campaigns'];
  for (const sel of commSelectors) {
    const found = await clickNav(page, sel);
    if (found) {
      await shot(page, 'communication.png');
      break;
    }
  }

  // Final - go back to dashboard for reference shot
  await clickNav(page, 'Dashboard');
  await sleep(1500);
  await shot(page, 'dashboard-final.png');

  await browser.close();
  console.log('\n🎉 All screenshots done!');
  
  // List what we captured
  const files = fs.readdirSync(SAVE_DIR).filter(f => f.endsWith('.png') && !f.startsWith('_'));
  console.log('\n📦 Captured files:', files.join(', '));
})();
