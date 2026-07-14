import { chromium, devices } from 'playwright';

const iPhone = devices['iPhone 13'];

const browser = await chromium.launch();
const context = await browser.newContext({ ...iPhone, isMobile: true, hasTouch: true });
const page = await context.newPage();

await page.addInitScript(() => {
  try { localStorage.setItem('stone-age-admin-mode', '1'); } catch {}
});

await page.goto('http://localhost:8082/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const startBtn = page.getByText('Start', { exact: true });
if (await startBtn.count() > 0) {
  await startBtn.first().click();
  await page.waitForTimeout(1200);
}

// Switch to TOP view for a clear read of the grid.
const viewBtn = page.locator('button:has-text("SPR"), button:has-text("TOP"), button:has-text("3D"), button:has-text("FPS"), button:has-text("2D")').first();
for (let i = 0; i < 6; i++) {
  const label = (await viewBtn.innerText().catch(() => '')).trim();
  if (label === 'TOP') break;
  await viewBtn.click();
  await page.waitForTimeout(300);
}

// Click "Next level" 100 times to reach level 101 (admin mode bypasses the lock gate).
const nextBtn = page.getByTitle(/Next level/);
for (let i = 0; i < 100; i++) {
  await nextBtn.first().click();
  await page.waitForTimeout(30);
}
await page.waitForTimeout(500);

const levelLabel = await page.locator('text=/^L\\d+$/').first().innerText().catch(() => 'unknown');
console.log('landed on level label:', levelLabel);

await page.screenshot({ path: 'C:/Users/alonk/AppData/Local/Temp/claude/d--phoneage-phoneage/1dc39d0b-262c-4ea4-a80e-12c0ce8a103e/scratchpad/level101_top.png' });
await browser.close();
