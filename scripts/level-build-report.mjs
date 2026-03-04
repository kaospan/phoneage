import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';

const argv = process.argv.slice(2);
const argMap = new Map();
argv.forEach((arg) => {
  const [key, value] = arg.split('=');
  argMap.set(key, value ?? true);
});

const useUrl = argMap.get('--url');
const reportDir = argMap.get('--out') ?? 'reports';

const root = process.cwd();
let viteServer = null;
let baseUrl = useUrl;

if (!baseUrl) {
  viteServer = await createServer({
    root,
    server: { port: 5173, strictPort: false }
  });
  await viteServer.listen();
  baseUrl = viteServer.resolvedUrls?.local[0] ?? 'http://localhost:5173/';
}

const browser = await chromium.launch();
const page = await browser.newPage();

try {
  await page.goto(baseUrl, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.runBulkBuildReport === 'function');

  const report = await page.evaluate(async () => {
    return await window.runBulkBuildReport({
      onProgress: (status) => console.log(`[bulkbuild] ${status}`)
    });
  });

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `level-build-report-${timestamp}.json`;
  const outputPath = path.join(root, reportDir);
  await mkdir(outputPath, { recursive: true });
  await writeFile(path.join(outputPath, filename), JSON.stringify(report, null, 2));
  console.log(`Report saved to ${path.join(reportDir, filename)}`);
} finally {
  await browser.close();
  if (viteServer) {
    await viteServer.close();
  }
}
