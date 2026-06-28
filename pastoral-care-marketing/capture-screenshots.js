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

async function goto(page, url, opts = {}) {
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 20000, ...opts });
    await sleep(2500);
  } catch(e) {
    console.log(`⚠️  goto ${url} error: ${e.message.split('\n')[0]}`);
    await sleep(2000);
  }
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
  await goto(page, BASE_URL);
  console.log('Current URL:', page.url());

  // Save initial page for inspection
  const html0 = await page.content();
  fs.writeFileSync(path.join(SAVE_DIR, '_initial.html'), html0.substring(0, 50000));
  await shot(page, '_login-page.png', false);

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
      await sleep(4000);
      console.log('URL after login attempt:', page.url());
    } else {
      // Try clicking sign-in button first
      const signInLinks = await page.$$('a[href*="login"], a[href*="sign-in"], button:has-text("Sign In"), a:has-text("Sign In"), a:has-text("Login")');
      console.log('Sign-in links found:', signInLinks.length);
      if (signInLinks.length > 0) {
        await signInLinks[0].click();
        await sleep(2000);
        await shot(page, '_after-signin-click.png', false);
        const emailInput2 = page.locator('input[type="email"], input[name="email"]').first();
        await emailInput2.fill(EMAIL);
        const passInput2 = page.locator('input[type="password"]').first();
        await passInput2.fill(PASSWORD);
        await page.keyboard.press('Enter');
        await sleep(4000);
      }
    }
  } catch(e) {
    console.log('Login error:', e.message);
  }

  // Print page content for debugging
  const allText = await page.evaluate(() => document.title + ' | ' + document.body.innerText.substring(0, 500));
  console.log('Page state:', allText);
  await shot(page, '_after-login.png', false);

  // Get all links visible in the app 
  const allLinks = await page.$$eval('a[href]', links => links.map(l => ({ text: l.textContent?.trim().substring(0, 50), href: l.href })));
  console.log('\n=== ALL LINKS ===');
  allLinks.forEach(l => console.log(`  "${l.text}" -> ${l.href}`));

  // Get all nav/sidebar items 
  const navItems = await page.$$eval('nav *, aside *, [class*="sidebar"] *, [class*="nav"] *, [class*="menu"] *', els => 
    els.filter(el => el.tagName === 'A' || el.tagName === 'BUTTON' || el.role === 'menuitem')
       .map(el => ({ tag: el.tagName, text: el.textContent?.trim().substring(0, 50), href: el.href || null }))
       .filter(el => el.text)
  );
  console.log('\n=== NAV ITEMS ===');
  navItems.forEach(n => console.log(`  [${n.tag}] "${n.text}" -> ${n.href || 'no href'}`));

  // Save HTML for deep inspection
  const html = await page.content();
  fs.writeFileSync(path.join(SAVE_DIR, '_page-snapshot.html'), html.substring(0, 100000));
  console.log('Saved page HTML snapshot (100k chars)');

  // --- DASHBOARD ---
  console.log('\n📸 Taking dashboard screenshot…');
  await shot(page, 'dashboard.png');

  // Try common routes
  const routes = [
    // Dashboard/home
    { urls: ['/', '/dashboard', '/home'], name: 'dashboard.png' },
    // People/members
    { urls: ['/people', '/members', '/congregation', '/contacts'], name: 'members.png' },
    // Care/pastoral
    { urls: ['/pastoral', '/care', '/pastoral-care', '/care-notes', '/notes'], name: 'care-notes.png' },
    // SMS/messaging
    { urls: ['/sms', '/messaging', '/messages', '/inbox', '/communication', '/chat', '/texting'], name: 'messaging.png' },
    // Analytics/metrics
    { urls: ['/analytics', '/reports', '/metrics', '/stats'], name: 'analytics.png' },
    // Pastor AI
    { urls: ['/pastor-ai', '/ai', '/chat', '/assistant', '/pastor_ai'], name: 'pastor-ai.png' },
    // Tools
    { urls: ['/tools', '/tool', '/features'], name: 'tools-overview.png' },
    // Groups
    { urls: ['/groups', '/group'], name: 'groups.png' },
    // Giving
    { urls: ['/giving', '/donations', '/finance'], name: 'giving.png' },
    // Services
    { urls: ['/services', '/service', '/events'], name: 'services.png' },
  ];

  const currentBase = page.url().replace(/\/$/, '').replace(/\/[^/]+$/, '');
  console.log('\nTrying routes from base:', currentBase);

  for (const route of routes) {
    let success = false;
    for (const p of route.urls) {
      const targetUrl = BASE_URL + p;
      try {
        await goto(page, targetUrl);
        const status = await page.evaluate(() => document.title);
        const body = await page.evaluate(() => document.body.innerText.substring(0, 100));
        console.log(`  Trying ${p}: title="${status}", body="${body.replace(/\n/g, ' ')}"`);
        // Check if we got a 404 or redirect to login
        if (!page.url().includes('/404') && !page.url().includes('/error')) {
          await shot(page, route.name);
          success = true;
          break;
        }
      } catch(e) {
        console.log(`  ${p}: ${e.message.split('\n')[0]}`);
      }
    }
    if (!success) {
      console.log(`  ⚠️  Could not capture ${route.name}`);
    }
  }

  await browser.close();
  console.log('\n🎉 Done!');
})();
