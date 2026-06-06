import { chromium } from "playwright";

const browser = await chromium.launch();

for (const level of [8, 13]) {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  await page.addInitScript((levelId) => {
    localStorage.setItem("stone-age-admin-mode", "1");
    localStorage.setItem("stone-age-view-mode", "sprite");
    localStorage.setItem("show_coords_overlay_v1", "1");
    localStorage.setItem(
      "stone-age-campaign-progress-v1",
      JSON.stringify({
        version: 1,
        highestUnlockedLevelId: 200,
        lastPlayedLevelId: levelId,
        levels: {},
      }),
    );
  }, level);

  await page.goto("http://127.0.0.1:5176", { waitUntil: "networkidle" });
  await page.waitForTimeout(7000);
  await page.screenshot({ path: `.tmp-level-${level}-sprite.png`, fullPage: false });

  const status = await page
    .locator("text=/Sprite mode|Sprites ready/")
    .last()
    .textContent()
    .catch(() => "no status");
  console.log(`level=${level} status=${status}`);
  await page.close();
}

await browser.close();
