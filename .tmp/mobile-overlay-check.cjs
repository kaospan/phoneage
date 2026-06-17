const { chromium } = require("playwright");

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({
    viewport: { width: 932, height: 430 },
    isMobile: true,
    hasTouch: true,
    deviceScaleFactor: 2,
  });

  await page.goto("http://127.0.0.1:5174/", { waitUntil: "networkidle" });
  await page.evaluate(() => {
    const root = document.createElement("div");
    root.innerHTML = `
      <div class="absolute inset-0 z-[70] flex items-center justify-center bg-black/55 px-3 py-2 backdrop-blur-sm sm:px-4">
        <div class="pointer-events-auto flex max-h-[calc(100svh-1rem)] w-full max-w-xl flex-col overflow-hidden rounded-[24px] border border-white/15 bg-stone-950/92 p-3 text-stone-50 shadow-2xl sm:rounded-[28px] sm:p-5 md:p-6">
          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain pr-1">
            <div class="text-center">
              <div class="text-xs font-black uppercase tracking-[0.22em] text-amber-300">Stage Cleared</div>
              <div class="mt-1 text-2xl font-black uppercase tracking-[0.14em] sm:mt-2 sm:text-3xl md:text-4xl">Level 8 Complete</div>
              <div class="mt-2 flex flex-wrap items-center justify-center gap-1.5 sm:mt-3 sm:gap-2">
                <span class="rounded-full border border-emerald-300/40 bg-emerald-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-100">First Clear</span>
                <span class="rounded-full border border-amber-300/40 bg-amber-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-amber-100">Best Moves</span>
                <span class="rounded-full border border-sky-300/40 bg-sky-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-sky-100">Best Clock</span>
              </div>
            </div>
            <div class="mt-3 grid gap-2 sm:mt-4 sm:grid-cols-2 sm:gap-3">
              <div class="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                <div class="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Run Moves</div>
                <div class="mt-1 text-2xl font-black sm:mt-2 sm:text-3xl">11</div>
              </div>
              <div class="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                <div class="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Personal Best</div>
                <div class="mt-1 text-2xl font-black sm:mt-2 sm:text-3xl">11</div>
              </div>
              <div class="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                <div class="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Clock Left</div>
                <div class="mt-1 text-2xl font-black sm:mt-2 sm:text-3xl">0:42</div>
              </div>
              <div class="rounded-2xl border border-white/10 bg-white/5 p-3 sm:p-4">
                <div class="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Best Clock</div>
                <div class="mt-1 text-2xl font-black sm:mt-2 sm:text-3xl">0:42</div>
              </div>
            </div>
            <div class="mt-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-center sm:mt-4 sm:px-4 sm:py-3">
              <div class="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Campaign Progress</div>
              <div class="mt-1 text-base font-black text-stone-50 sm:mt-2 sm:text-lg">8/199 stages cleared</div>
            </div>
          </div>
          <div class="shrink-0 -mx-3 mt-3 flex flex-wrap items-center justify-center gap-2 border-t border-white/10 bg-stone-950/95 px-3 pb-1 pt-3 sm:-mx-5 sm:mt-5 sm:px-5 md:-mx-6 md:px-6">
            <button class="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-stone-50 hover:bg-white/10">Replay</button>
            <button class="inline-flex h-10 items-center justify-center gap-2 whitespace-nowrap rounded-md bg-amber-300 px-4 py-2 text-sm font-medium text-stone-950 hover:bg-amber-200">Next Level</button>
          </div>
        </div>
      </div>
    `;
    document.body.appendChild(root.firstElementChild);
  });

  await page.screenshot({ path: ".tmp/codex-mobile-complete-overlay.png", fullPage: false });
  const result = await page.evaluate(() => {
    const buttons = [...document.querySelectorAll("button")]
      .filter((button) => ["Replay", "Next Level"].includes(button.textContent.trim()))
      .map((button) => {
        const r = button.getBoundingClientRect();
        return {
          text: button.textContent.trim(),
          x: Math.round(r.x),
          y: Math.round(r.y),
          w: Math.round(r.width),
          h: Math.round(r.height),
          visible: r.bottom <= innerHeight && r.top >= 0 && r.right <= innerWidth && r.left >= 0,
        };
      });
    return { viewport: { w: innerWidth, h: innerHeight }, buttons };
  });

  console.log(JSON.stringify(result, null, 2));
  await browser.close();
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
