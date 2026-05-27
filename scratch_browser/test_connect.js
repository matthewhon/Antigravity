const puppeteer = require('puppeteer-core');
const path = require('path');

async function run() {
  try {
    console.log('Connecting to browser...');
    const browser = await puppeteer.connect({
      browserURL: 'http://localhost:9222',
      defaultViewport: null
    });
    console.log('Connected! Fetching pages...');
    const pages = await browser.pages();
    console.log(`Found ${pages.length} pages.`);

    let targetPage = null;
    for (const page of pages) {
      const url = page.url();
      const title = await page.title();
      console.log(`Page: ${title} (${url})`);
      if (url.includes('appstoreconnect.apple.com')) {
        targetPage = page;
      }
    }

    if (!targetPage) {
      console.log('App Store Connect page not found among open pages.');
      return;
    }

    console.log(`Target page found: ${await targetPage.title()}`);
    
    // Take screenshot
    const screenshotPath = 'C:\\Users\\matth\\.gemini\\antigravity-ide\\brain\\9eced54a-8d40-469f-a042-809aff5499bf\\appstoreconnect.png';
    await targetPage.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to ${screenshotPath}`);

    await browser.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
