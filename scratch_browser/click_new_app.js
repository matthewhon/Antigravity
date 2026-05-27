const puppeteer = require('puppeteer-core');

async function run() {
  try {
    const browser = await puppeteer.connect({
      browserURL: 'http://localhost:9222',
      defaultViewport: null
    });
    const pages = await browser.pages();
    let targetPage = pages.find(p => p.url().includes('appstoreconnect.apple.com'));

    if (!targetPage) {
      console.log('App Store Connect page not found.');
      return;
    }

    console.log('Clicking new-app-btn-icon...');
    await targetPage.click('#new-app-btn-icon');
    console.log('Clicked! Waiting 2 seconds...');
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Capture screenshot
    const screenshotPath = 'C:\\Users\\matth\\.gemini\\antigravity-ide\\brain\\9eced54a-8d40-469f-a042-809aff5499bf\\clicked_plus.png';
    await targetPage.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to ${screenshotPath}`);

    // Print out any new interactive elements (especially dropdown options)
    const elementsInfo = await targetPage.evaluate(() => {
      const elements = Array.from(document.querySelectorAll('button, a, [role="button"], [role="menuitem"]'));
      return elements.map(el => ({
        tagName: el.tagName,
        id: el.id,
        role: el.getAttribute('role'),
        text: el.innerText || el.textContent,
        outerHTML: el.outerHTML.substring(0, 200)
      }));
    });

    console.log('Interactive elements after click:');
    console.log(JSON.stringify(elementsInfo, null, 2));

    await browser.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
