import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:8081/';
const out = process.argv[3] || 'shot.png';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 500, height: 900 } });

page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text());
});

await page.addInitScript(() => {
  try { window.localStorage.setItem('stone-age-view-mode', 'top'); } catch {}
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(3000);
await page.screenshot({ path: out, fullPage: false });
console.log('saved', out);
await browser.close();
