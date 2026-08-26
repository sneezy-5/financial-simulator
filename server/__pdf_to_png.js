const path = require('path');

async function main() {
  const puppeteer = (await import('puppeteer')).default;
  const pdfPath = process.argv[2];
  const outPath = process.argv[3];
  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();
  await page.setViewport({ width: 1300, height: 1600, deviceScaleFactor: 2 });
  await page.goto('file://' + path.resolve(pdfPath).replace(/\\/g, '/') + '#zoom=page-fit', { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 800));
  await page.screenshot({ path: outPath, fullPage: false });
  await browser.close();
  console.log('OK', outPath);
}

main().catch(e => { console.error(e); process.exit(1); });
