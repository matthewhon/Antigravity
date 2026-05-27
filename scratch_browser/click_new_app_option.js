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

    console.log('Clicking new-app-btn...');
    await targetPage.click('#new-app-btn');
    console.log('Clicked! Waiting 3 seconds for modal to appear...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Capture screenshot
    const screenshotPath = 'C:\\Users\\matth\\.gemini\\antigravity-ide\\brain\\9eced54a-8d40-469f-a042-809aff5499bf\\modal_opened.png';
    await targetPage.screenshot({ path: screenshotPath });
    console.log(`Screenshot saved to ${screenshotPath}`);

    // Print all inputs, select dropdowns, and form elements in the modal
    const modalInfo = await targetPage.evaluate(() => {
      const inputs = Array.from(document.querySelectorAll('input, select, textarea, button'));
      return inputs.map(el => {
        let options = [];
        if (el.tagName === 'SELECT') {
          options = Array.from(el.options).map(opt => ({
            text: opt.text,
            value: opt.value,
            selected: opt.selected
          }));
        }
        return {
          tagName: el.tagName,
          id: el.id,
          name: el.name,
          placeholder: el.placeholder,
          type: el.type,
          label: el.getAttribute('aria-label') || el.labels?.[0]?.innerText,
          value: el.value,
          options: options,
          outerHTML: el.outerHTML.substring(0, 150)
        };
      });
    });

    console.log('Modal form elements:');
    console.log(JSON.stringify(modalInfo, null, 2));

    await browser.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
