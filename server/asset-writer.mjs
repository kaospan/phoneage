import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import url from 'node:url';

const PORT = process.env.PORT ? Number(process.env.PORT) : 8787;

const send = (res, status, obj) => {
  const body = JSON.stringify(obj);
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(body),
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
  });
  res.end(body);
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  return Buffer.concat(chunks);
};

const pad3 = (n) => String(n).padStart(3, '0');

const readJson = async (req) => {
  const bytes = await readBody(req);
  if (!bytes || bytes.length < 2) return null;
  const txt = bytes.toString('utf8');
  return JSON.parse(txt);
};

const isGrid = (grid) => Array.isArray(grid) && grid.length > 0 && Array.isArray(grid[0]);

const isInt = (n) => Number.isInteger(n);

const server = http.createServer(async (req, res) => {
  try {
    if (req.method === 'OPTIONS') {
      res.writeHead(204, {
        'access-control-allow-origin': '*',
        'access-control-allow-methods': 'POST, OPTIONS',
        'access-control-allow-headers': 'content-type',
      });
      res.end();
      return;
    }

    const parsed = url.parse(req.url, true);
    if (req.method !== 'POST' || (parsed.pathname !== '/write-level-image' && parsed.pathname !== '/write-level-default')) {
      send(res, 404, { ok: false, error: 'Not found' });
      return;
    }

    const id = Number(parsed.query.id);
    const overwrite = parsed.query.overwrite === '1' || parsed.query.overwrite === 'true';
    if (!Number.isInteger(id) || id <= 0) {
      send(res, 400, { ok: false, error: 'Invalid id' });
      return;
    }

    const repoRoot = process.cwd();

    if (parsed.pathname === '/write-level-image') {
      const bytes = await readBody(req);
      if (!bytes || bytes.length < 10) {
        send(res, 400, { ok: false, error: 'Empty body' });
        return;
      }

      const filename = `level_${pad3(id)}.png`;
      const assetsDir = path.resolve(repoRoot, 'src', 'assets');
      const outPath = path.resolve(assetsDir, filename);

      try {
        const stat = await fs.stat(outPath);
        if (stat.isFile() && !overwrite) {
          send(res, 409, { ok: false, error: `Refusing to overwrite existing ${filename}` });
          return;
        }
      } catch {
        // does not exist
      }

      await fs.mkdir(assetsDir, { recursive: true });
      await fs.writeFile(outPath, bytes);

      send(res, 200, { ok: true, path: outPath, bytes: bytes.length });
      return;
    }

    // write-level-default: dev-only helper that promotes a mapper-saved level to repo defaults
    // by updating src/data/promoted-levels.json. (Static deployments cannot write to the repo.)
    const body = await readJson(req);
    if (!body || typeof body !== 'object') {
      send(res, 400, { ok: false, error: 'Invalid JSON body' });
      return;
    }

    const grid = body.grid;
    const playerStart = body.playerStart;
    const cavePos = body.cavePos;
    if (!isGrid(grid)) {
      send(res, 400, { ok: false, error: 'Missing/invalid grid' });
      return;
    }
    if (!playerStart || typeof playerStart !== 'object' || !isInt(playerStart.x) || !isInt(playerStart.y)) {
      send(res, 400, { ok: false, error: 'Missing/invalid playerStart' });
      return;
    }
    if (!cavePos || typeof cavePos !== 'object' || !isInt(cavePos.x) || !isInt(cavePos.y)) {
      send(res, 400, { ok: false, error: 'Missing/invalid cavePos' });
      return;
    }

    const rows = grid.length;
    const cols = Array.isArray(grid[0]) ? grid[0].length : 0;
    if (rows <= 0 || cols <= 0) {
      send(res, 400, { ok: false, error: 'Invalid grid size' });
      return;
    }
    if (playerStart.x < 0 || playerStart.y < 0 || playerStart.y >= rows || playerStart.x >= cols) {
      send(res, 400, { ok: false, error: 'playerStart out of bounds' });
      return;
    }
    if (cavePos.x < 0 || cavePos.y < 0 || cavePos.y >= rows || cavePos.x >= cols) {
      send(res, 400, { ok: false, error: 'cavePos out of bounds' });
      return;
    }

    const outPath = path.resolve(repoRoot, 'src', 'data', 'promoted-levels.json');
    let existing = [];
    try {
      const txt = await fs.readFile(outPath, 'utf8');
      const parsedExisting = JSON.parse(txt);
      if (Array.isArray(parsedExisting)) existing = parsedExisting;
    } catch {
      // treat as empty
    }

    const idx = existing.findIndex((e) => e && typeof e === 'object' && Number(e.id) === id);
    if (idx !== -1 && !overwrite) {
      send(res, 409, { ok: false, error: `Refusing to overwrite existing default for level ${id}` });
      return;
    }

    const nextEntry = { id, ...body };
    if (idx === -1) existing.push(nextEntry);
    else existing[idx] = nextEntry;

    existing.sort((a, b) => Number(a.id) - Number(b.id));
    await fs.mkdir(path.dirname(outPath), { recursive: true });
    await fs.writeFile(outPath, `${JSON.stringify(existing, null, 2)}\n`, 'utf8');

    send(res, 200, { ok: true, path: outPath, levelId: id });
  } catch (err) {
    send(res, 500, { ok: false, error: err?.message ?? String(err) });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`asset-writer listening on http://localhost:${PORT}/write-level-image`);
  // eslint-disable-next-line no-console
  console.log(`asset-writer listening on http://localhost:${PORT}/write-level-default`);
});
