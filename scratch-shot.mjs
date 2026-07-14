import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:8081/';
const outDir = process.argv[3] || '.';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 500, height: 900 } });

page.on('console', (msg) => {
  if (msg.type() === 'error') console.log('PAGE ERROR:', msg.text());
});
page.on('pageerror', (err) => console.log('PAGE EXCEPTION:', err.message));

await page.addInitScript(() => {
  try { window.localStorage.setItem('stone-age-view-mode', 'top'); } catch {}
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(2000);

await page.getByText('START', { exact: true }).click();
await page.waitForTimeout(2000);
await page.screenshot({ path: `${outDir}/2_after_start.png` });

// try clicking first level tile if a level select screen shows
const levelCandidates = await page.locator('button, [role="button"], a').all();
console.log('clickable count after start:', levelCandidates.length);

await browser.close();
