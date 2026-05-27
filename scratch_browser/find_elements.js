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

    // Inspect buttons near the "Apps" header
    const elementsInfo = await targetPage.evaluate(() => {
      // Find all buttons, SVGs, or links near the top
      const elements = Array.from(document.querySelectorAll('button, a, [role="button"]'));
      return elements.map(el => ({
        tagName: el.tagName,
        id: el.id,
        className: el.className,
        text: el.innerText || el.textContent,
        outerHTML: el.outerHTML.substring(0, 300)
      }));
    });

    console.log('Interactive elements found on page:');
    console.log(JSON.stringify(elementsInfo, null, 2));

    await browser.disconnect();
  } catch (err) {
    console.error('Error:', err);
  }
}

run();
