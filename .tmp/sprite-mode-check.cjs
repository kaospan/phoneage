const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 }, deviceScaleFactor: 1 });
  await page.addInitScript(() => {
    localStorage.setItem("stone-age-view-mode", "sprite");
    localStorage.setItem("stone-age-admin-mode", "1");
    localStorage.setItem("stone-age-fullscreen-mode", "0");
    localStorage.setItem("stone-age-campaign-progress-v1", JSON.stringify({
      highestUnlockedLevelId: 100,
      completedLevelIds: [],
      perfectLevelIds: [],
      levelStats: {},
      totalMoves: 0,
      lastPlayedLevelId: 1,
    }));
  });
  await page.goto("http://127.0.0.1:5174/", { waitUntil: "networkidle" });
  const start = page.getByRole("button", { name: "Start" });
  if (await start.count()) await start.click();
  await page.waitForTimeout(3000);
  await page.screenshot({ path: ".tmp/sprite-mode-level1.png", fullPage: false });
  const result = await page.evaluate(() => ({
    text: document.body.innerText.slice(0, 500),
    imageBackgrounds: [...document.querySelectorAll("[style*='background-image']")]
      .map((el) => String(el.getAttribute("style") || ""))
      .filter((style) => style.includes("data:image") || style.includes("level_001"))
      .slice(0, 10),
  }));
  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
