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

// Toggle thumbstick on (joystick icon button in bottom bar)
const joystickBtn = page.getByTitle('Show thumbstick');
if (await joystickBtn.count() > 0) {
  await joystickBtn.first().click();
  await page.waitForTimeout(500);
}

await page.screenshot({ path: 'C:/Users/alonk/AppData/Local/Temp/claude/d--phoneage-phoneage/1dc39d0b-262c-4ea4-a80e-12c0ce8a103e/scratchpad/hud_portrait_thumbstick.png' });

await browser.close();
