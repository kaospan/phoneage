/**
 * Procedurally generates levels 101-200, verifying every candidate with the real in-game
 * solver (via a headless browser calling window.solveGrid) before accepting it. Nothing is
 * accepted on faith — every generated level is guaranteed solvable because the solver says so.
 *
 * Difficulty ramps in five tiers by introducing mechanics progressively:
 *   101-120  pure maze (floor + stone)                         target moves ~10-22
 *   121-140  + directional arrows bridging void gaps            target moves ~18-32
 *   141-160  + breakable rocks                                  target moves ~24-42
 *   161-180  + one red key/lock chokepoint                      target moves ~32-58
 *   181-200  + red+green key/lock, denser arrows, biggest maze  target moves ~46-85
 *
 * Usage: node scripts/generate-levels-101-200.mjs [--start=101] [--end=200] [--seed=42] [--out=preview.json]
 */
import { chromium } from 'playwright';
import { createServer } from 'vite';
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

const argv = process.argv.slice(2);
const argMap = new Map();
argv.forEach((arg) => {
  const [key, value] = arg.split('=');
  argMap.set(key.replace(/^--/, ''), value ?? true);
});
const RANGE_START = Number(argMap.get('start') ?? 101);
const RANGE_END = Number(argMap.get('end') ?? 200);
const BASE_SEED = Number(argMap.get('seed') ?? 1337);
const OUT_PATH = argMap.get('out') ?? null; // if set, writes a preview JSON instead of touching promoted-levels.json

// ---------------------------------------------------------------------------
// Seeded RNG (deterministic across runs for a given seed)
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let s = seed | 0;
  return function rng() {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const pick = (rng, arr) => arr[Math.floor(rng() * arr.length)];
const shuffle = (rng, arr) => {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
};

// ---------------------------------------------------------------------------
// Maze geometry: 11 x 20 canvas, logical maze cells on odd coordinates
// ---------------------------------------------------------------------------
const ROWS = 11;
const COLS = 20;
const LROWS = 5; // odd y in [1,9]
const LCOLS = 9; // odd x in [1,17]
const DIRS4 = [[1, 0], [-1, 0], [0, 1], [0, -1]];

const logicalToGrid = (lx, ly) => ({ x: 1 + lx * 2, y: 1 + ly * 2 });
const idxOf = (lx, ly) => ly * LCOLS + lx;
const lxOf = (idx) => idx % LCOLS;
const lyOf = (idx) => Math.floor(idx / LCOLS);

function carveMazeTree(rng) {
  const N = LROWS * LCOLS;
  const adj = Array.from({ length: N }, () => []);
  const visited = new Array(N).fill(false);
  const startIdx = Math.floor(rng() * N);
  visited[startIdx] = true;
  const stack = [startIdx];
  while (stack.length) {
    const cur = stack[stack.length - 1];
    const cx = lxOf(cur), cy = lyOf(cur);
    const candidates = [];
    for (const [dx, dy] of DIRS4) {
      const nx = cx + dx, ny = cy + dy;
      if (nx < 0 || nx >= LCOLS || ny < 0 || ny >= LROWS) continue;
      const ni = idxOf(nx, ny);
      if (!visited[ni]) candidates.push(ni);
    }
    if (candidates.length === 0) { stack.pop(); continue; }
    const next = pick(rng, candidates);
    visited[next] = true;
    adj[cur].push(next);
    adj[next].push(cur);
    stack.push(next);
  }
  return adj;
}

function addLoopEdges(adj, count, rng) {
  const N = adj.length;
  let added = 0, attempts = 0;
  while (added < count && attempts < count * 20) {
    attempts++;
    const a = Math.floor(rng() * N);
    const ax = lxOf(a), ay = lyOf(a);
    const [dx, dy] = pick(rng, DIRS4);
    const bx = ax + dx, by = ay + dy;
    if (bx < 0 || bx >= LCOLS || by < 0 || by >= LROWS) continue;
    const b = idxOf(bx, by);
    if (adj[a].includes(b)) continue;
    adj[a].push(b); adj[b].push(a);
    added++;
  }
}

function bfsDistances(adj, src) {
  const dist = new Array(adj.length).fill(-1);
  dist[src] = 0;
  const q = [src]; let qi = 0;
  while (qi < q.length) {
    const u = q[qi++];
    for (const v of adj[u]) if (dist[v] === -1) { dist[v] = dist[u] + 1; q.push(v); }
  }
  return dist;
}

/** Picks a start/goal pair whose tree-distance is close to targetDist, sampling a handful of far-apart candidates. */
function pickStartGoal(adj, targetDist, rng) {
  const N = adj.length;
  const d0 = bfsDistances(adj, 0);
  let aIdx = 0, aBest = -1;
  for (let i = 0; i < N; i++) if (d0[i] > aBest) { aBest = d0[i]; aIdx = i; }
  const dA = bfsDistances(adj, aIdx);
  // Collect candidates across a spread of distances from aIdx, pick whichever is closest to target.
  let bestIdx = 0, bestGap = Infinity;
  const candidates = [];
  for (let i = 0; i < N; i++) if (dA[i] > 0) candidates.push(i);
  for (const c of shuffle(rng, candidates).slice(0, Math.min(40, candidates.length))) {
    const gap = Math.abs(dA[c] - targetDist);
    if (gap < bestGap) { bestGap = gap; bestIdx = c; }
  }
  return { startIdx: aIdx, goalIdx: bestIdx, treeDist: dA[bestIdx], dFromStart: dA };
}

function treePath(adj, fromIdx, toIdx) {
  const N = adj.length;
  const parent = new Array(N).fill(-1);
  const visited = new Array(N).fill(false);
  visited[fromIdx] = true;
  const q = [fromIdx]; let qi = 0;
  while (qi < q.length) {
    const u = q[qi++];
    if (u === toIdx) break;
    for (const v of adj[u]) if (!visited[v]) { visited[v] = true; parent[v] = u; q.push(v); }
  }
  const path = [];
  let cur = toIdx;
  while (cur !== -1) { path.push(cur); if (cur === fromIdx) break; cur = parent[cur]; }
  path.reverse();
  return path;
}

/** BFS reachability from `from`, treating the edge (excludeA-excludeB) as removed. */
function reachableExcludingEdge(adj, from, excludeA, excludeB) {
  const N = adj.length;
  const visited = new Array(N).fill(false);
  visited[from] = true;
  const q = [from]; let qi = 0;
  while (qi < q.length) {
    const u = q[qi++];
    for (const v of adj[u]) {
      if ((u === excludeA && v === excludeB) || (u === excludeB && v === excludeA)) continue;
      if (!visited[v]) { visited[v] = true; q.push(v); }
    }
  }
  return visited;
}

function buildFloorGrid(adj) {
  const grid = Array.from({ length: ROWS }, () => new Array(COLS).fill(5)); // void
  for (let idx = 0; idx < adj.length; idx++) {
    const p = logicalToGrid(lxOf(idx), lyOf(idx));
    grid[p.y][p.x] = 0;
    for (const v of adj[idx]) {
      if (v < idx) continue;
      const pv = logicalToGrid(lxOf(v), lyOf(v));
      const mx = (p.x + pv.x) / 2, my = (p.y + pv.y) / 2;
      grid[my][mx] = 0;
    }
  }
  // Stone hugging the carved region so it reads as solid maze walls, not empty space.
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < COLS; x++) {
      if (grid[y][x] !== 5) continue;
      let adjFloor = false;
      for (const [dx, dy] of DIRS4) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) continue;
        if (grid[ny][nx] === 0) { adjFloor = true; break; }
      }
      if (adjFloor) grid[y][x] = 2; // stone
    }
  }
  return grid;
}

const cellAt = (idx) => logicalToGrid(lxOf(idx), lyOf(idx));
const midCellOf = (aIdx, bIdx) => {
  const pa = cellAt(aIdx), pb = cellAt(bIdx);
  return { x: (pa.x + pb.x) / 2, y: (pa.y + pb.y) / 2 };
};

// ---------------------------------------------------------------------------
// Level generation per tier
// ---------------------------------------------------------------------------
function tierFor(id) {
  if (id <= 120) return 1;
  if (id <= 140) return 2;
  if (id <= 160) return 3;
  if (id <= 180) return 4;
  return 5;
}

function targetMovesFor(id) {
  // Smooth ramp 101 -> 200, roughly 10 -> 90.
  const t = (id - 101) / (200 - 101);
  return Math.round(10 + t * 80);
}

/** Builds one candidate grid for the given level id/seed. Returns null if geometry doesn't allow the requested mechanics. */
function buildCandidate(id, rng) {
  const tier = tierFor(id);
  const target = targetMovesFor(id);
  const adj = carveMazeTree(rng);

  if (tier <= 3) addLoopEdges(adj, tier === 1 ? Math.floor(rng() * 3) : 2 + Math.floor(rng() * 4), rng);

  // Each logical maze-hop costs ~2 actual grid moves (the passage cell, then the next cell),
  // so target the tree-distance in logical hops, not raw moves.
  const { startIdx, goalIdx, dFromStart } = pickStartGoal(adj, target / 2, rng);
  const path = treePath(adj, startIdx, goalIdx); // path of logical-cell indices along the tree

  const grid = buildFloorGrid(adj);

  // Mark start (18) and goal (3) tiles.
  const startPos = cellAt(startIdx);
  const goalPos = cellAt(goalIdx);
  grid[startPos.y][startPos.x] = 18;
  grid[goalPos.y][goalPos.x] = 3;

  const usedCells = new Set([`${startPos.x},${startPos.y}`, `${goalPos.x},${goalPos.y}`]);
  const isFree = (x, y) => grid[y]?.[x] === 0 && !usedCells.has(`${x},${y}`);

  // --- Tier 2+: arrows bridging void gaps, placed on straight interior runs of the path ---
  if (tier >= 2) {
    const arrowBudget = tier === 2 ? 1 + Math.floor(rng() * 2) : tier === 3 ? 1 + Math.floor(rng() * 2) : 2 + Math.floor(rng() * 3);
    let placed = 0;
    const straightSpots = [];
    for (let i = 1; i < path.length - 1; i++) {
      const prev = cellAt(path[i - 1]), cur = cellAt(path[i]), next = cellAt(path[i + 1]);
      const d1x = cur.x - prev.x, d1y = cur.y - prev.y;
      const d2x = next.x - cur.x, d2y = next.y - cur.y;
      if (d1x === d2x && d1y === d2y && isFree(cur.x, cur.y)) {
        straightSpots.push({ cur, dir: { dx: d2x > 0 ? 1 : d2x < 0 ? -1 : 0, dy: d2y > 0 ? 1 : d2y < 0 ? -1 : 0 } });
      }
    }
    for (const spot of shuffle(rng, straightSpots)) {
      if (placed >= arrowBudget) break;
      if (!isFree(spot.cur.x, spot.cur.y)) continue;
      const nx = spot.cur.x + spot.dir.dx, ny = spot.cur.y + spot.dir.dy;
      if (grid[ny]?.[nx] !== 0) continue;
      const arrowType = spot.dir.dx === 1 ? 8 : spot.dir.dx === -1 ? 10 : spot.dir.dy === 1 ? 9 : 7;
      const finalType = tier === 5 && rng() < 0.35 ? 13 : arrowType; // occasional omni arrows in the hardest tier
      grid[spot.cur.y][spot.cur.x] = finalType;
      grid[ny][nx] = 5; // carve a 1-cell void gap right after the arrow
      usedCells.add(`${spot.cur.x},${spot.cur.y}`);
      placed++;
    }
  }

  // --- Tier 3+: breakable rocks sprinkled on the path for texture ---
  if (tier >= 3) {
    const rockBudget = 1 + Math.floor(rng() * 3);
    let placed = 0;
    for (const idx of shuffle(rng, path.slice(1, -1))) {
      if (placed >= rockBudget) break;
      const p = cellAt(idx);
      if (!isFree(p.x, p.y)) continue;
      grid[p.y][p.x] = 6;
      usedCells.add(`${p.x},${p.y}`);
      placed++;
    }
  }

  // --- Tier 4+: one red key/lock chokepoint on the path ---
  const lockEdges = [];
  if (tier >= 4 && path.length >= 6) {
    const mid = Math.floor(path.length * (0.45 + rng() * 0.2));
    lockEdges.push({ a: path[mid - 1], b: path[mid], color: 'red', keyCell: 16, lockCell: 14 });
  }
  // --- Tier 5: a second, green lock further along the path ---
  if (tier >= 5 && path.length >= 10) {
    const mid2 = Math.floor(path.length * (0.72 + rng() * 0.15));
    lockEdges.push({ a: path[mid2 - 1], b: path[mid2], color: 'green', keyCell: 17, lockCell: 15 });
  }

  for (const edge of lockEdges) {
    const lockPos = midCellOf(edge.a, edge.b);
    if (grid[lockPos.y][lockPos.x] !== 0) continue; // corridor cell already repurposed by an arrow/rock; skip this lock
    const sideOfA = reachableExcludingEdge(adj, edge.a, edge.a, edge.b);
    const keyCandidates = [];
    for (let idx = 0; idx < adj.length; idx++) {
      if (!sideOfA[idx]) continue;
      const p = cellAt(idx);
      if (isFree(p.x, p.y)) keyCandidates.push(p);
    }
    if (keyCandidates.length === 0) continue; // nowhere safe to put the key; skip this lock
    const keyPos = pick(rng, keyCandidates);
    grid[lockPos.y][lockPos.x] = edge.lockCell === 14 ? 16 : 17; // 16=red lock, 17=green lock
    grid[keyPos.y][keyPos.x] = edge.keyCell === 16 ? 14 : 15; // 14=red key, 15=green key
    usedCells.add(`${lockPos.x},${lockPos.y}`);
    usedCells.add(`${keyPos.x},${keyPos.y}`);
  }

  return { grid, playerStart: startPos, cavePos: goalPos, tier, target };
}

// ---------------------------------------------------------------------------
// Browser-driven solver verification
// ---------------------------------------------------------------------------
async function withSolverPage(fn) {
  const server = await createServer({ root: ROOT, server: { port: 0 } });
  await server.listen();
  const address = server.httpServer.address();
  const url = `http://localhost:${address.port}/`;

  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => typeof window.solveGrid === 'function', { timeout: 20000 });

  try {
    return await fn(page);
  } finally {
    await browser.close();
    await server.close();
  }
}

async function solve(page, grid, playerStart, cavePos) {
  return page.evaluate(
    ([grid, playerStart, cavePos]) =>
      window.solveGrid(grid, playerStart, cavePos, { maxMsPerLevel: 6000, maxNodesPerLevel: 120000, maxDepth: 220 }),
    [grid, playerStart, cavePos],
  );
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  const results = [];
  await withSolverPage(async (page) => {
    for (let id = RANGE_START; id <= RANGE_END; id++) {
      const target = targetMovesFor(id);
      let best = null;
      const maxAttempts = 24;
      for (let attempt = 0; attempt < maxAttempts; attempt++) {
        const rng = mulberry32(BASE_SEED * 1000003 + id * 97 + attempt);
        const candidate = buildCandidate(id, rng);
        const solution = await solve(page, candidate.grid, candidate.playerStart, candidate.cavePos);
        if (!solution.solved) continue;
        const gap = Math.abs(solution.moves - target);
        if (!best || gap < best.gap) {
          best = { ...candidate, moves: solution.moves, gap };
        }
        // Accept early once close enough — no need to burn the whole attempt budget.
        if (gap <= Math.max(3, target * 0.2)) break;
      }
      if (!best) {
        console.error(`Level ${id}: FAILED to find any solvable candidate after ${maxAttempts} attempts`);
        continue;
      }
      console.log(`Level ${id} [tier ${best.tier}]: target ${target} moves, got ${best.moves} moves (gap ${best.gap})`);
      results.push({
        id,
        grid: best.grid,
        playerStart: best.playerStart,
        cavePos: best.cavePos,
        tier: best.tier,
        targetMoves: target,
        actualMoves: best.moves,
      });
    }
  });

  if (OUT_PATH) {
    writeFileSync(path.resolve(ROOT, OUT_PATH), JSON.stringify(results, null, 2));
    console.log(`\nWrote ${results.length} candidate levels to ${OUT_PATH}`);
    return;
  }

  // Merge into promoted-levels.json, replacing any existing entries for these ids.
  const promotedPath = path.resolve(ROOT, 'src/data/promoted-levels.json');
  const existing = JSON.parse(readFileSync(promotedPath, 'utf8'));
  const filtered = existing.filter((l) => l.id < RANGE_START || l.id > RANGE_END);
  const newEntries = results.map((r) => ({
    id: r.id,
    grid: r.grid,
    playerStart: r.playerStart,
    cavePos: r.cavePos,
  }));
  const merged = [...filtered, ...newEntries].sort((a, b) => a.id - b.id);
  writeFileSync(promotedPath, JSON.stringify(merged, null, 2));
  console.log(`\nWrote ${results.length} generated levels into ${promotedPath}`);

  const summary = results.map((r) => `L${r.id} [T${r.tier}] ${r.actualMoves}mv (target ${r.targetMoves})`).join('\n');
  console.log('\n--- Summary ---\n' + summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
