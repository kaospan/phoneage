import { createServer } from 'vite';
import { chromium } from 'playwright';

const server = await createServer({ server: { host: '127.0.0.1', port: 5174, strictPort: true } });
await server.listen();

let browser;
try {
  browser = await chromium.launch({
    headless: true,
    executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
  });
  const page = await browser.newPage({ viewport: { width: 1366, height: 768 } });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem('levelmapper-import-level', '4');
    localStorage.setItem('levelmapper-compare-level', '4');
  });
  await page.goto('http://127.0.0.1:5174/?mapper', { waitUntil: 'domcontentloaded' });
  const viewport = page.locator('div[class*="color-scheme:dark"]').first();
  await viewport.waitFor({ state: 'visible', timeout: 30_000 });

  const samples = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const viewportElement = document.querySelector('div[class*="color-scheme:dark"]');
    const out = [];
    for (let index = 0; index < 80; index += 1) {
      const content = viewportElement?.firstElementChild?.firstElementChild;
      const rect = content?.getBoundingClientRect();
      out.push({
        t: index * 50,
        width: rect?.width ?? 0,
        height: rect?.height ?? 0,
        scrollWidth: viewportElement?.scrollWidth ?? 0,
        scrollHeight: viewportElement?.scrollHeight ?? 0,
        clientWidth: viewportElement?.clientWidth ?? 0,
        clientHeight: viewportElement?.clientHeight ?? 0,
      });
      await sleep(50);
    }
    return out;
  });

  const signatures = [...new Set(samples.map((sample) => JSON.stringify(sample, ['width', 'height', 'scrollWidth', 'scrollHeight', 'clientWidth', 'clientHeight'])))];
  console.log(JSON.stringify({ signatureCount: signatures.length, signatures, first: samples[0], last: samples.at(-1) }, null, 2));
  if (signatures.length > 3) process.exitCode = 1;
} finally {
  await browser?.close();
  await server.close();
}
