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

const pad2 = (n) => String(n).padStart(2, '0');

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
    if (req.method !== 'POST' || parsed.pathname !== '/write-level-image') {
      send(res, 404, { ok: false, error: 'Not found' });
      return;
    }

    const id = Number(parsed.query.id);
    const overwrite = parsed.query.overwrite === '1' || parsed.query.overwrite === 'true';
    if (!Number.isInteger(id) || id <= 0) {
      send(res, 400, { ok: false, error: 'Invalid id' });
      return;
    }

    const bytes = await readBody(req);
    if (!bytes || bytes.length < 10) {
      send(res, 400, { ok: false, error: 'Empty body' });
      return;
    }

    const filename = `${pad2(id)}.png`;
    const repoRoot = process.cwd();
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
  } catch (err) {
    send(res, 500, { ok: false, error: err?.message ?? String(err) });
  }
});

server.listen(PORT, () => {
  // eslint-disable-next-line no-console
  console.log(`asset-writer listening on http://localhost:${PORT}/write-level-image`);
});

