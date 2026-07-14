import { chromium } from 'playwright';

const url = process.argv[2] || 'http://localhost:8081/';
const outDir = process.argv[3] || '.';

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 500, height: 900 } });

await page.addInitScript(() => {
  try { window.localStorage.setItem('stone-age-view-mode', 'top'); } catch {}
});

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(2000);
await page.getByRole('button', { name: /start/i }).click();
await page.waitForTimeout(1500);

// zoom in using the + button a couple times for a closer look
const plus = page.getByRole('button', { name: '+' });
if (await plus.count()) {
  await plus.click();
  await plus.click();
  await page.waitForTimeout(500);
}

await page.screenshot({ path: `${outDir}/3_zoomed_top.png` });
await browser.close();
