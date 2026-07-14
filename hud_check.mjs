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

// Click "Start" on the title screen if present
const startBtn = page.getByText('Start', { exact: true });
if (await startBtn.count() > 0) {
  await startBtn.first().click();
  await page.waitForTimeout(1500);
}

await page.screenshot({ path: 'C:/Users/alonk/AppData/Local/Temp/claude/d--phoneage-phoneage/1dc39d0b-262c-4ea4-a80e-12c0ce8a103e/scratchpad/hud_portrait.png' });

await browser.close();
