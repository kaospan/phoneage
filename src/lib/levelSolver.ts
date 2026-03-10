import { getAllLevels, isPlaceholderGrid } from "@/data/levels";
import { getArrowDirections, isArrowCell } from "@/game/arrows";
import { computePlayerGlidePath, computeRemoteArrowGlidePath } from "@/game/glide";
import { getPairedTeleport, TELEPORT_CELL } from "@/game/teleport";
import type { CellType, KeyInventory, Position } from "@/game/types";

type DirKey = "U" | "R" | "D" | "L";
type Action =
  | { t: "P"; d: DirKey }
  | { t: "A"; x: number; y: number; d: DirKey };

export interface SolveOptions {
  maxMsPerLevel?: number;
  maxNodesPerLevel?: number;
  maxDepth?: number;
  onProgress?: (msg: string) => void;
}

export interface LevelSolution {
  levelId: number;
  solved: boolean;
  moves: number | null;
  actions: string[];
  reason?: string;
  nodesExpanded: number;
  ms: number;
}

export interface LevelDump {
  levelId: number;
  grid: number[][];
  playerStart: { x: number; y: number };
  cavePos: { x: number; y: number };
  theme?: string;
  arrowCount: number;
}

const DIRS: Array<{ dx: number; dy: number; k: DirKey }> = [
  { dx: 0, dy: -1, k: "U" },
  { dx: 1, dy: 0, k: "R" },
  { dx: 0, dy: 1, k: "D" },
  { dx: -1, dy: 0, k: "L" },
];

const isKeyCell = (cell: CellType) => cell === 14 || cell === 15;
const isLockCell = (cell: CellType) => cell === 16 || cell === 17;
const keyColorForCell = (cell: CellType): keyof KeyInventory | null =>
  cell === 14 ? "red" : cell === 15 ? "green" : null;
const lockColorForCell = (cell: CellType): keyof KeyInventory | null =>
  cell === 16 ? "red" : cell === 17 ? "green" : null;

function buildBaseGrid(levelGrid: CellType[][]): CellType[][] {
  return levelGrid.map((row, y) =>
    row.map((cell, x) => {
      if (isArrowCell(cell)) {
        const adjacentCells: CellType[] = [];
        if (y > 0) adjacentCells.push(levelGrid[y - 1][x] as CellType);
        if (y < levelGrid.length - 1) adjacentCells.push(levelGrid[y + 1][x] as CellType);
        if (x > 0) adjacentCells.push(levelGrid[y][x - 1] as CellType);
        if (x < row.length - 1) adjacentCells.push(levelGrid[y][x + 1] as CellType);

        // Do not let the start-marker cave (18) or teleport (19) "bleed" into arrow base terrain.
        const terrainTypes = adjacentCells
          .filter((c) => !isArrowCell(c))
          .map((c) => (c === 18 || c === TELEPORT_CELL ? 0 : c));
        if (terrainTypes.length > 0) {
          const counts = new Map<number, number>();
          for (const t of terrainTypes) counts.set(t, (counts.get(t) ?? 0) + 1);
          let best: number = 5;
          let bestCount = -1;
          for (const [t, c] of counts.entries()) {
            if (c > bestCount) {
              bestCount = c;
              best = t;
            }
          }
          return best as CellType;
        }
        return 5;
      }
      return cell;
    })
  ) as CellType[][];
}

interface SolveState {
  grid: CellType[][];
  baseGrid: CellType[][];
  playerPos: Position;
  inventory: KeyInventory;
  breakableRockStates: Map<string, boolean>;
}

function cloneGrid(grid: CellType[][]): CellType[][] {
  return grid.map((r) => r.slice()) as CellType[][];
}

function cloneInventory(inv: KeyInventory): KeyInventory {
  return { red: !!inv.red, green: !!inv.green };
}

function cloneBreakables(map: Map<string, boolean>): Map<string, boolean> {
  return new Map(map);
}

function stateKey(s: SolveState): string {
  const rows = s.grid.length;
  const cols = s.grid[0]?.length ?? 0;
  const inv = (s.inventory.red ? 1 : 0) | (s.inventory.green ? 2 : 0);
  let br = "";
  if (s.breakableRockStates.size > 0) {
    // Include only stepped breakables that still exist as breakable cells.
    const keys: string[] = [];
    for (const [k, v] of s.breakableRockStates.entries()) {
      if (!v) continue;
      const [xs, ys] = k.split(",");
      const x = Number(xs);
      const y = Number(ys);
      if (Number.isFinite(x) && Number.isFinite(y) && s.grid[y]?.[x] === 6) keys.push(k);
    }
    keys.sort();
    if (keys.length) br = `|b:${keys.join(";")}`;
  }
  // Fast-enough key for typical puzzles; if this becomes hot, replace with bit-packed encoding.
  const g = s.grid.map((r) => r.join(",")).join("|");
  const bg = s.baseGrid.map((r) => r.join(",")).join("|");
  return `${rows}x${cols}|p:${s.playerPos.x},${s.playerPos.y}|i:${inv}|g:${g}|bg:${bg}${br}`;
}

function applyPlayerMoveAtomic(prev: SolveState, dx: number, dy: number): SolveState | null {
  const grid = prev.grid;
  const baseGrid = prev.baseGrid;
  const inv = prev.inventory;
  const br = prev.breakableRockStates;
  const px = prev.playerPos.x;
  const py = prev.playerPos.y;
  const tx = px + dx;
  const ty = py + dy;
  if (ty < 0 || ty >= grid.length || tx < 0 || tx >= grid[0].length) return null;

  const playerCell = grid[py][px] as CellType;
  const targetCell = grid[ty][tx] as CellType;
  const targetKey = keyColorForCell(targetCell);
  const targetLock = lockColorForCell(targetCell);

  const next: SolveState = {
    grid: grid,
    baseGrid: baseGrid,
    playerPos: { x: px, y: py },
    inventory: inv,
    breakableRockStates: br,
  };

  const ensureCloned = () => {
    if (next.grid === grid) next.grid = cloneGrid(grid);
    if (next.baseGrid === baseGrid) next.baseGrid = cloneGrid(baseGrid);
    if (next.inventory === inv) next.inventory = cloneInventory(inv);
    if (next.breakableRockStates === br) next.breakableRockStates = cloneBreakables(br);
  };

  if (isArrowCell(playerCell)) {
    if (targetLock && !inv[targetLock]) return null;

    // Step priority (floor, cave (goal), start-marker cave, arrow, key/lock)
    if (
      targetCell === 0 ||
      targetCell === 3 ||
      targetCell === 18 ||
      targetCell === TELEPORT_CELL ||
      isArrowCell(targetCell) ||
      isKeyCell(targetCell) ||
      isLockCell(targetCell)
    ) {
      ensureCloned();
      next.playerPos = { x: tx, y: ty };

      if (targetKey || targetLock) {
        if (targetKey) {
          next.inventory[targetKey] = true;
        }
        // Key/lock tile becomes floor (underlying terrain) for both grid+base.
        next.grid[ty][tx] = 0;
        next.baseGrid[ty][tx] = 0;
      }
      if (targetCell === TELEPORT_CELL) {
        const dest = getPairedTeleport(next.grid, { x: tx, y: ty });
        if (dest) next.playerPos = dest;
      }
      return next;
    }

    if (targetCell === 6) {
      const k = `${tx},${ty}`;
      if (!br.get(k)) {
        ensureCloned();
        next.breakableRockStates.set(k, true);
        next.playerPos = { x: tx, y: ty };
        return next;
      }
      return null;
    }

    const dirs = getArrowDirections(playerCell);
    const isArrowDir = dirs.some((d) => d.dx === dx && d.dy === dy);
    if (!isArrowDir) return null;

    const glide = computePlayerGlidePath(grid, { x: px, y: py }, dx, dy, playerCell);
    if (glide.path.length === 0) return null;

    ensureCloned();
    // Apply glide like PuzzleGame tick loop, but as a single atomic move.
    for (let i = 0; i < glide.path.length; i++) {
      const step = glide.path[i];
      const prevPos = i === 0 ? { x: px, y: py } : glide.path[i - 1];
      if (i === 0) next.grid[py][px] = 5;
      else next.grid[prevPos.y][prevPos.x] = next.baseGrid[prevPos.y][prevPos.x];
      next.grid[step.y][step.x] = glide.arrowType;
      next.playerPos = { x: step.x, y: step.y };
    }
    return next;
  }

  // Normal movement
  const currentCell = playerCell;
  let willBreakRock = false;
  if (currentCell === 6) {
    const k = `${px},${py}`;
    if (br.get(k)) willBreakRock = true;
  }

  if (targetCell === 2) return null; // stone

  if (targetCell === 6) {
    const k = `${tx},${ty}`;
    if (!br.get(k)) {
      ensureCloned();
      next.breakableRockStates.set(k, true);
      if (willBreakRock) {
        next.grid[py][px] = 5;
      }
      next.playerPos = { x: tx, y: ty };
      return next;
    }
    return null;
  }

  if (targetLock && !inv[targetLock]) return null;
  if (targetCell === 1 || targetCell === 4 || targetCell === 5) return null; // fire/water/void

  ensureCloned();
  next.playerPos = { x: tx, y: ty };
  if (targetKey || targetLock) {
    if (targetKey) {
      next.inventory[targetKey] = true;
    }
    next.grid[ty][tx] = 0;
    next.baseGrid[ty][tx] = 0;
  }
  if (willBreakRock) {
    next.grid[py][px] = 5;
  }
  if (targetCell === TELEPORT_CELL) {
    const dest = getPairedTeleport(next.grid, { x: tx, y: ty });
    if (dest) next.playerPos = dest;
  }
  return next;
}

function applyRemoteArrowMoveAtomic(prev: SolveState, arrowPos: Position, dx: number, dy: number): SolveState | null {
  const grid = prev.grid;
  const baseGrid = prev.baseGrid;
  const ax = arrowPos.x;
  const ay = arrowPos.y;
  const arrowCell = grid[ay]?.[ax] as CellType | undefined;
  if (arrowCell === undefined || !isArrowCell(arrowCell)) return null;

  const dirs = getArrowDirections(arrowCell);
  const isValid = dirs.some((d) => d.dx === dx && d.dy === dy);
  if (!isValid) return null;

  const glide = computeRemoteArrowGlidePath(grid, { x: ax, y: ay }, dx, dy, arrowCell);
  if (glide.path.length === 0) return null;

  const next: SolveState = {
    grid: cloneGrid(grid),
    baseGrid: baseGrid, // baseGrid is unchanged by remote glide
    playerPos: { ...prev.playerPos },
    inventory: prev.inventory,
    breakableRockStates: prev.breakableRockStates,
  };

  for (let i = 0; i < glide.path.length; i++) {
    const step = glide.path[i];
    const prevPos = i === 0 ? { x: ax, y: ay } : glide.path[i - 1];
    if (i === 0) next.grid[ay][ax] = 5;
    else next.grid[prevPos.y][prevPos.x] = next.baseGrid[prevPos.y][prevPos.x];
    next.grid[step.y][step.x] = glide.arrowType;
  }

  return next;
}

function fmtAction(a: Action): string {
  if (a.t === "P") return `P:${a.d}`;
  return `A(${a.x},${a.y}):${a.d}`;
}

async function solveLevel(
  levelId: number,
  start: SolveState,
  cavePos: Position,
  opts: Required<Pick<SolveOptions, "maxMsPerLevel" | "maxNodesPerLevel" | "maxDepth">> & Pick<SolveOptions, "onProgress">
): Promise<LevelSolution> {
  const t0 = performance.now();
  const startKey = stateKey(start);

  const prev = new Map<string, { p: string; a: Action }>();
  const depth = new Map<string, number>();
  const q: Array<{ k: string; s: SolveState }> = [{ k: startKey, s: start }];
  depth.set(startKey, 0);

  let nodesExpanded = 0;
  let idx = 0;

  const isGoal = (s: SolveState) => s.playerPos.x === cavePos.x && s.playerPos.y === cavePos.y;

  if (isGoal(start)) {
    return {
      levelId,
      solved: true,
      moves: 0,
      actions: [],
      nodesExpanded: 0,
      ms: 0,
    };
  }

  while (idx < q.length) {
    const now = performance.now();
    if (now - t0 > opts.maxMsPerLevel) {
      return {
        levelId,
        solved: false,
        moves: null,
        actions: [],
        reason: `Timed out after ${Math.round(now - t0)}ms (expanded ${nodesExpanded} nodes)`,
        nodesExpanded,
        ms: Math.round(now - t0),
      };
    }
    if (nodesExpanded >= opts.maxNodesPerLevel) {
      return {
        levelId,
        solved: false,
        moves: null,
        actions: [],
        reason: `Node limit reached (${opts.maxNodesPerLevel})`,
        nodesExpanded,
        ms: Math.round(now - t0),
      };
    }

    const { k, s } = q[idx++];
    const d0 = depth.get(k) ?? 0;
    if (d0 >= opts.maxDepth) continue;

    nodesExpanded += 1;
    if (opts.onProgress && nodesExpanded % 2000 === 0) {
      opts.onProgress(`Level ${levelId}: expanded ${nodesExpanded} (queue ${q.length})`);
    }

    // Yield to keep UI responsive if run in-browser.
    if (nodesExpanded % 1500 === 0) {
      // eslint-disable-next-line no-await-in-loop
      await new Promise((r) => setTimeout(r, 0));
    }

    // Player moves
    for (const dir of DIRS) {
      const ns = applyPlayerMoveAtomic(s, dir.dx, dir.dy);
      if (!ns) continue;
      const nk = stateKey(ns);
      if (depth.has(nk)) continue;
      const nd = d0 + 1;
      depth.set(nk, nd);
      prev.set(nk, { p: k, a: { t: "P", d: dir.k } });
      if (isGoal(ns)) {
        const actions: string[] = [];
        let cur = nk;
        while (cur !== startKey) {
          const link = prev.get(cur);
          if (!link) break;
          actions.push(fmtAction(link.a));
          cur = link.p;
        }
        actions.reverse();
        return {
          levelId,
          solved: true,
          moves: actions.length,
          actions,
          nodesExpanded,
          ms: Math.round(performance.now() - t0),
        };
      }
      q.push({ k: nk, s: ns });
    }

    // Remote arrow moves (selection is free; model as choosing any arrow not under player)
    const rows = s.grid.length;
    const cols = s.grid[0]?.length ?? 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if (x === s.playerPos.x && y === s.playerPos.y) continue;
        const cell = s.grid[y][x] as CellType;
        if (!isArrowCell(cell)) continue;
        const dirs = getArrowDirections(cell);
        for (const d of dirs) {
          const kdir = d.dx === 0 && d.dy === -1 ? "U" : d.dx === 1 && d.dy === 0 ? "R" : d.dx === 0 && d.dy === 1 ? "D" : "L";
          const ns = applyRemoteArrowMoveAtomic(s, { x, y }, d.dx, d.dy);
          if (!ns) continue;
          const nk = stateKey(ns);
          if (depth.has(nk)) continue;
          const nd = d0 + 1;
          depth.set(nk, nd);
          prev.set(nk, { p: k, a: { t: "A", x, y, d: kdir } });
          // Remote move cannot complete the level directly unless player already at cave; checked earlier.
          q.push({ k: nk, s: ns });
        }
      }
    }
  }

  return {
    levelId,
    solved: false,
    moves: null,
    actions: [],
    reason: "No solution found (search exhausted)",
    nodesExpanded,
    ms: Math.round(performance.now() - t0),
  };
}

export async function runSolveAllLevels(options: SolveOptions = {}): Promise<{
  generatedAt: string;
  options: Required<Pick<SolveOptions, "maxMsPerLevel" | "maxNodesPerLevel" | "maxDepth">>;
  results: LevelSolution[];
  text: string;
}> {
  const formatLocalIso = (d: Date) => {
    const pad2 = (n: number) => String(n).padStart(2, "0");
    const pad3 = (n: number) => String(n).padStart(3, "0");
    const y = d.getFullYear();
    const m = pad2(d.getMonth() + 1);
    const day = pad2(d.getDate());
    const hh = pad2(d.getHours());
    const mm = pad2(d.getMinutes());
    const ss = pad2(d.getSeconds());
    const ms = pad3(d.getMilliseconds());
    const offMin = -d.getTimezoneOffset();
    const sign = offMin >= 0 ? "+" : "-";
    const abs = Math.abs(offMin);
    const offH = pad2(Math.floor(abs / 60));
    const offM = pad2(abs % 60);
    return `${y}-${m}-${day}T${hh}:${mm}:${ss}.${ms}${sign}${offH}:${offM}`;
  };

  const opts = {
    maxMsPerLevel: options.maxMsPerLevel ?? 4000,
    maxNodesPerLevel: options.maxNodesPerLevel ?? 40_000,
    maxDepth: options.maxDepth ?? 200,
  };
  const onProgress = options.onProgress;

  const levels = getAllLevels();
  const results: LevelSolution[] = [];
  const lines: string[] = [];
  lines.push(`# Level Solutions (Minimum Moves)`);
  lines.push(`Generated: ${formatLocalIso(new Date())}`);
  lines.push(`Limits: maxMsPerLevel=${opts.maxMsPerLevel}, maxNodesPerLevel=${opts.maxNodesPerLevel}, maxDepth=${opts.maxDepth}`);
  lines.push("");

  for (const lvl of levels) {
    const grid = lvl.grid as CellType[][];
    if (isPlaceholderGrid(grid)) {
      results.push({
        levelId: lvl.id,
        solved: false,
        moves: null,
        actions: [],
        reason: "Placeholder/empty grid",
        nodesExpanded: 0,
        ms: 0,
      });
      continue;
    }

    const cave = lvl.cavePos ?? { x: 0, y: 0 };
    if (!Number.isFinite(cave.x) || !Number.isFinite(cave.y)) {
      results.push({
        levelId: lvl.id,
        solved: false,
        moves: null,
        actions: [],
        reason: "Missing cave position",
        nodesExpanded: 0,
        ms: 0,
      });
      continue;
    }

    if (onProgress) onProgress(`Solving level ${lvl.id}...`);

    const start: SolveState = {
      grid: grid.map((r) => r.slice()) as CellType[][],
      baseGrid: buildBaseGrid(grid.map((r) => r.slice()) as CellType[][]),
      playerPos: { ...lvl.playerStart },
      inventory: { red: false, green: false },
      breakableRockStates: new Map(),
    };

    const solved = await solveLevel(lvl.id, start, cave, { ...opts, onProgress });
    results.push(solved);

    if (solved.solved) {
      lines.push(`Level ${lvl.id}: ${solved.moves} moves (expanded ${solved.nodesExpanded}, ${solved.ms}ms)`);
      lines.push(solved.actions.join(" "));
      lines.push("");
    } else {
      lines.push(`Level ${lvl.id}: UNSOLVED (${solved.reason ?? "unknown"})`);
      lines.push("");
    }
  }

  const text = lines.join("\n");
  return {
    generatedAt: formatLocalIso(new Date()),
    options: opts,
    results,
    text,
  };
}

export function dumpLevel(levelId: number): LevelDump | null {
  const levels = getAllLevels();
  const lvl = levels.find((l) => l.id === levelId);
  if (!lvl) return null;
  const grid = (lvl.grid ?? []).map((r) => r.slice());
  let arrowCount = 0;
  for (let y = 0; y < grid.length; y++) {
    for (let x = 0; x < (grid[y]?.length ?? 0); x++) {
      const v = grid[y][x] as CellType;
      if (isArrowCell(v)) arrowCount += 1;
    }
  }
  return {
    levelId,
    grid,
    playerStart: { ...lvl.playerStart },
    cavePos: { ...lvl.cavePos },
    theme: lvl.theme,
    arrowCount,
  };
}

export async function runSolveLevel(levelId: number, options: SolveOptions = {}): Promise<LevelSolution> {
  const levels = getAllLevels();
  const lvl = levels.find((l) => l.id === levelId);
  if (!lvl) {
    return {
      levelId,
      solved: false,
      moves: null,
      actions: [],
      reason: "Level not found",
      nodesExpanded: 0,
      ms: 0,
    };
  }
  const grid = lvl.grid as CellType[][];
  if (isPlaceholderGrid(grid)) {
    return {
      levelId,
      solved: false,
      moves: null,
      actions: [],
      reason: "Placeholder/empty grid",
      nodesExpanded: 0,
      ms: 0,
    };
  }

  const start: SolveState = {
    grid: grid.map((r) => r.slice()) as CellType[][],
    baseGrid: buildBaseGrid(grid.map((r) => r.slice()) as CellType[][]),
    playerPos: { ...lvl.playerStart },
    inventory: { red: false, green: false },
    breakableRockStates: new Map(),
  };
  return await solveLevel(levelId, start, { ...lvl.cavePos }, {
    maxMsPerLevel: options.maxMsPerLevel ?? 15000,
    maxNodesPerLevel: options.maxNodesPerLevel ?? 200_000,
    maxDepth: options.maxDepth ?? 300,
    onProgress: options.onProgress,
  });
}
