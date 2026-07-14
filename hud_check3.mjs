import { chromium, devices } from 'playwright';

const iPhone = devices['iPhone 13'];

const browser = await chromium.launch();
const context = await browser.newContext({
  ...iPhone,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();
await page.goto('http://localhost:8082/', { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const startBtn = page.getByText('Start', { exact: true });
if (await startBtn.count() > 0) {
  await startBtn.first().click();
  await page.waitForTimeout(1500);
}

// Cycle the view-mode button until it reads "TOP" (button shows CURRENT mode label)
for (let i = 0; i < 6; i++) {
  const label = await page.locator('button:has-text("SPR"), button:has-text("TOP"), button:has-text("3D"), button:has-text("FPS"), button:has-text("2D")').first().innerText().catch(() => '');
  console.log('current view label:', label);
  if (label.trim() === 'TOP') break;
  await page.locator('button:has-text("SPR"), button:has-text("TOP"), button:has-text("3D"), button:has-text("FPS"), button:has-text("2D")').first().click();
  await page.waitForTimeout(600);
}

// Zoom out several times to see more of the board
const zoomOutBtn = page.getByTitle(/Zoom out/);
for (let i = 0; i < 6; i++) {
  if (await zoomOutBtn.count() > 0) {
    await zoomOutBtn.first().click();
    await page.waitForTimeout(150);
  }
}

await page.waitForTimeout(500);
await page.screenshot({ path: 'C:/Users/alonk/AppData/Local/Temp/claude/d--phoneage-phoneage/1dc39d0b-262c-4ea4-a80e-12c0ce8a103e/scratchpad/hud_portrait_top.png' });

await browser.close();
