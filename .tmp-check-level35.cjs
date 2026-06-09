const { chromium } = require("playwright");

const baseUrl = "http://127.0.0.1:4180/";

(async () => {
  const browser = await chromium.launch({ headless: true });

  for (const levelId of [3, 5, 7]) {
    const page = await browser.newPage({
      viewport: { width: 1280, height: 720 },
      deviceScaleFactor: 1,
    });

    await page.addInitScript(({ levelId }) => {
      localStorage.setItem("stone-age-admin-mode", "1");
      localStorage.setItem("stone-age-view-mode", "sprite");
      localStorage.setItem(
        "stone-age-campaign-progress-v1",
        JSON.stringify({
          version: 1,
          highestUnlockedLevelId: 100,
          lastPlayedLevelId: levelId,
          levels: {},
        }),
      );
    }, { levelId });

    await page.goto(baseUrl, { waitUntil: "domcontentloaded" });
    await page.getByRole("button", { name: /Start/i }).click();
    await page.waitForTimeout(3500);
    await page.screenshot({ path: `.verify-level${levelId}-sprite-current.png`, fullPage: false });

    const info = await page.evaluate(() => ({
      text: document.body.innerText.replace(/\s+/g, " ").slice(0, 240),
      heroCount: document.querySelectorAll('img[alt="Hero"]').length,
      statusText: Array.from(document.querySelectorAll("div"))
        .map((el) => el.textContent || "")
        .find((text) => text.includes("Sprites ready") || text.includes("Sprite mode")) || "",
    }));

    console.log(JSON.stringify({ levelId, ...info }));
    await page.close();
  }

  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
