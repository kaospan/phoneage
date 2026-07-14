import { chromium } from 'playwright';
import { createServer } from 'vite';
import path from 'node:path';
import { mkdir, writeFile, readFile } from 'node:fs/promises';

const argv = process.argv.slice(2);
const argMap = new Map();
argv.forEach((arg) => {
  const [key, value] = arg.split('=');
  argMap.set(key, value ?? true);
});

const idsArg = argMap.get('--ids');
const ids = idsArg.split(',').map((s) => Number(s.trim())).filter((n) => Number.isFinite(n));
const maxMsPerLevel = Number(argMap.get('--maxMsPerLevel') ?? 45000);
const maxNodesPerLevel = Number(argMap.get('--maxNodesPerLevel') ?? 1500000);
const maxDepth = Number(argMap.get('--maxDepth') ?? 400);
const outPath = argMap.get('--out') ?? 'reports/unsolved-retry.json';

const root = 'd:/phoneage/phoneage';
const fullOutPath = path.isAbsolute(outPath) ? outPath : path.join(root, outPath);

let existing = {};
try {
  existing = JSON.parse(await readFile(fullOutPath, 'utf8'));
} catch {
  existing = {};
}

const viteServer = await createServer({
  root,
  server: { port: 5174, strictPort: false, hmr: false }
});
await viteServer.listen();
const baseUrl = viteServer.resolvedUrls?.local[0] ?? 'http://localhost:5174/';

const browser = await chromium.launch();
const page = await browser.newPage();
page.on('console', (msg) => {
  const text = msg.text();
  if (text.startsWith('[solve]')) console.log(`[page] ${text}`);
});
page.on('pageerror', (err) => console.log(`[pageerror] ${err?.message ?? String(err)}`));

try {
  await page.goto(baseUrl, { waitUntil: 'domcontentloaded' });
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => typeof window.runSolveLevel === 'function', null, { timeout: 120000 });

  for (const id of ids) {
    if (existing[id]?.solved) {
      console.log(`Level ${id}: already solved in retry file, skipping`);
      continue;
    }
    console.log(`--- Solving level ${id} (budget ${maxMsPerLevel}ms / ${maxNodesPerLevel} nodes / depth ${maxDepth}) ---`);
    const t0 = Date.now();
    let result;
    try {
      result = await page.evaluate(async ({ id, maxMsPerLevel, maxNodesPerLevel, maxDepth }) => {
        return await window.runSolveLevel(id, {
          maxMsPerLevel,
          maxNodesPerLevel,
          maxDepth,
          onProgress: (status) => console.log(`[solve] ${status}`)
        });
      }, { id, maxMsPerLevel, maxNodesPerLevel, maxDepth });
    } catch (err) {
      console.log(`Level ${id}: page.evaluate error: ${err?.message ?? String(err)}`);
      result = { levelId: id, solved: false, moves: null, actions: [], reason: `evaluate error: ${err?.message ?? String(err)}`, nodesExpanded: 0, ms: Date.now() - t0 };
    }
    existing[id] = result;
    await writeFile(fullOutPath, JSON.stringify(existing, null, 2), 'utf8');
    console.log(`Level ${id}: ${result.solved ? `SOLVED in ${result.moves} moves (${result.ms}ms, ${result.nodesExpanded} nodes)` : `UNSOLVED (${result.reason})`}`);
  }
} finally {
  await browser.close();
  await viteServer.close();
}

console.log('Done.');
