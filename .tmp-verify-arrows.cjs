const { chromium } = require("playwright");

const baseUrl = "http://127.0.0.1:4177/";
const views = ["2d", "3d", "fps"];

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const mode of views) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });

    await page.addInitScript(({ selectedMode }) => {
      localStorage.setItem("stone-age-admin-mode", "1");
      localStorage.setItem("stone-age-view-mode", selectedMode);
      localStorage.setItem(
        "stone-age-campaign-progress-v1",
        JSON.stringify({
          version: 1,
          highestUnlockedLevelId: 100,
          lastPlayedLevelId: 8,
          levels: {},
        }),
      );
    }, { selectedMode: mode });

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Start/i }).click();
    await page.waitForTimeout(mode === "fps" ? 3500 : 2500);
    await page.screenshot({ path: `.verify-arrows-${mode}.png`, fullPage: false });

    const info = await page.evaluate(() => ({
      bodyText: document.body.innerText.slice(0, 300),
      canvasCount: document.querySelectorAll("canvas").length,
    }));

    console.log(
      `${mode}: canvas=${info.canvasCount} text=${info.bodyText.replace(/\s+/g, " ").slice(0, 140)}`,
    );

    await page.close();
  }

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
