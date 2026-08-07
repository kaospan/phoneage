import type { CellType, Position } from "@/game/types";
import { solveGrid } from "@/lib/levelSolver";

export type LevelLabDifficulty = "easy" | "medium" | "hard" | "expert";

export interface LevelLabMechanics {
  keys: boolean;
  arrows: boolean;
  teleports: boolean;
}

export interface LevelLabCandidate {
  id: string;
  createdAt: string;
  seed: number;
  difficulty: LevelLabDifficulty;
  mechanics: LevelLabMechanics;
  grid: CellType[][];
  playerStart: Position;
  cavePos: Position;
  solved: boolean;
  moves: number | null;
  actions: string[];
  reason: string;
  nodesExpanded: number;
  ms: number;
  score: number;
  promotedLevelId?: number;
}

export interface GenerateLevelLabCandidateOptions {
  seed: number;
  difficulty: LevelLabDifficulty;
  mechanics: LevelLabMechanics;
}

export interface GenerateLevelLabCampaignOptions {
  seed: number;
  candidateCount?: number;
  levelsToPromote?: number;
  onProgress?: (done: number, total: number, selected: number) => void;
  shouldCancel?: () => boolean;
}

export interface LevelLabCampaignResult {
  generated: LevelLabCandidate[];
  promoted: LevelLabCandidate[];
  attempted: number;
}

const ROWS = 11;
const COLS = 20;

const PROMOTED_LEVEL_START = 101;
const PROMOTED_LEVEL_END = 200;

const levelLabDifficultyRanges: Record<LevelLabDifficulty, { start: number; end: number }> = {
  easy: { start: 101, end: 125 },
  medium: { start: 126, end: 150 },
  hard: { start: 151, end: 175 },
  expert: { start: 176, end: 200 },
};

const difficultyOrder: LevelLabDifficulty[] = ["easy", "medium", "hard", "expert"];

const difficultyConfig: Record<LevelLabDifficulty, {
  wander: number;
  obstacleChance: number;
  solveMs: number;
  solveNodes: number;
  maxDepth: number;
  targetMoves: number;
}> = {
  easy: { wander: 0.18, obstacleChance: 0.08, solveMs: 1200, solveNodes: 9000, maxDepth: 90, targetMoves: 10 },
  medium: { wander: 0.32, obstacleChance: 0.16, solveMs: 1600, solveNodes: 18000, maxDepth: 130, targetMoves: 18 },
  hard: { wander: 0.46, obstacleChance: 0.24, solveMs: 2200, solveNodes: 32000, maxDepth: 170, targetMoves: 28 },
  expert: { wander: 0.58, obstacleChance: 0.31, solveMs: 3200, solveNodes: 60000, maxDepth: 220, targetMoves: 40 },
};

export const levelLabDifficultyForPromotedIndex = (
  index: number,
  totalPromoted = PROMOTED_LEVEL_END - PROMOTED_LEVEL_START + 1,
): LevelLabDifficulty => {
  const total = Math.max(1, totalPromoted);
  const clampedIndex = Math.max(0, Math.min(total - 1, index));
  const ratio = clampedIndex / total;
  if (ratio < 0.25) return "easy";
  if (ratio < 0.5) return "medium";
  if (ratio < 0.75) return "hard";
  return "expert";
};

export const levelLabDifficultyForPromotedLevelId = (levelId: number): LevelLabDifficulty | null => {
  for (const difficulty of difficultyOrder) {
    const { start, end } = levelLabDifficultyRanges[difficulty];
    if (levelId >= start && levelId <= end) return difficulty;
  }
  return null;
};

export const buildLevelLabPromotionSlots = (levelsToPromote: number): Array<{ levelId: number; difficulty: LevelLabDifficulty }> => {
  const total = Math.max(0, levelsToPromote);

  // Explicitly pin the 100-level campaign to fixed mapper overwrite bands.
  if (total === 100) {
    const slots: Array<{ levelId: number; difficulty: LevelLabDifficulty }> = [];
    for (const difficulty of difficultyOrder) {
      const { start, end } = levelLabDifficultyRanges[difficulty];
      for (let levelId = start; levelId <= end; levelId += 1) {
        slots.push({ levelId, difficulty });
      }
    }
    return slots;
  }

  return Array.from({ length: total }, (_, index) => ({
    levelId: PROMOTED_LEVEL_START + index,
    difficulty: levelLabDifficultyForPromotedIndex(index, total),
  }));
};

export const levelLabMechanicsForDifficulty = (difficulty: LevelLabDifficulty): LevelLabMechanics => {
  if (difficulty === "easy") return { keys: false, arrows: true, teleports: false };
  if (difficulty === "medium") return { keys: true, arrows: true, teleports: false };
  if (difficulty === "hard") return { keys: true, arrows: true, teleports: true };
  return { keys: true, arrows: true, teleports: true };
};

const createRng = (seed: number) => {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x100000000;
  };
};

const randomInt = (rng: () => number, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));

const keyFor = (p: Position) => `${p.x},${p.y}`;

export const fingerprintLevelLabGrid = (grid: CellType[][]): string =>
  grid.map((row) => row.join(",")).join("|");

const directionCell = (from: Position, to: Position): CellType => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? 8 : 10;
  return dy > 0 ? 9 : 7;
};

const buildPath = (rng: () => number, difficulty: LevelLabDifficulty): Position[] => {
  const config = difficultyConfig[difficulty];
  const startY = randomInt(rng, 1, ROWS - 2);
  const goalY = randomInt(rng, 1, ROWS - 2);
  const path: Position[] = [{ x: 1, y: startY }];
  const visited = new Set([keyFor(path[0])]);
  let current = path[0];
  let guard = 0;

  while ((current.x !== COLS - 2 || current.y !== goalY) && guard < 360) {
    guard += 1;
    const towardGoal: Position =
      current.x < COLS - 2
        ? { x: current.x + 1, y: current.y }
        : { x: current.x, y: current.y + Math.sign(goalY - current.y) };
    const wanderVertical =
      rng() < config.wander && current.y > 1 && current.y < ROWS - 2
        ? { x: current.x, y: current.y + (rng() < 0.5 ? -1 : 1) }
        : null;
    const next = wanderVertical && !visited.has(keyFor(wanderVertical)) ? wanderVertical : towardGoal;
    if (next.x < 1 || next.x > COLS - 2 || next.y < 1 || next.y > ROWS - 2) continue;
    current = next;
    path.push(current);
    visited.add(keyFor(current));
  }

  return path;
};

const carveCandidateGrid = (
  rng: () => number,
  path: Position[],
  difficulty: LevelLabDifficulty,
  mechanics: LevelLabMechanics,
): CellType[][] => {
  const config = difficultyConfig[difficulty];
  const grid = Array.from({ length: ROWS }, () => Array<CellType>(COLS).fill(5));
  const pathKeys = new Set(path.map(keyFor));

  for (const p of path) grid[p.y][p.x] = 0;
  for (const p of path) {
    const neighbors = [
      { x: p.x + 1, y: p.y },
      { x: p.x - 1, y: p.y },
      { x: p.x, y: p.y + 1 },
      { x: p.x, y: p.y - 1 },
    ];
    for (const n of neighbors) {
      if (n.x <= 0 || n.x >= COLS - 1 || n.y <= 0 || n.y >= ROWS - 1 || pathKeys.has(keyFor(n))) continue;
      if (rng() < 0.36) grid[n.y][n.x] = 0;
    }
  }

  for (let y = 1; y < ROWS - 1; y += 1) {
    for (let x = 1; x < COLS - 1; x += 1) {
      if (pathKeys.has(`${x},${y}`) || grid[y][x] !== 0) continue;
      if (rng() < config.obstacleChance) grid[y][x] = rng() < 0.72 ? 2 : 1;
    }
  }

  const start = path[0];
  const cave = path[path.length - 1];
  grid[start.y][start.x] = 18;
  grid[cave.y][cave.x] = 3;

  const usablePath = path.slice(2, -2);
  if (mechanics.keys && usablePath.length >= 8) {
    const redKeyIndex = Math.max(1, Math.floor(usablePath.length * 0.24));
    const redLockIndex = Math.max(redKeyIndex + 2, Math.floor(usablePath.length * 0.62));
    const redKey = usablePath[redKeyIndex];
    const redLock = usablePath[Math.min(usablePath.length - 1, redLockIndex)];
    grid[redKey.y][redKey.x] = 14;
    grid[redLock.y][redLock.x] = 16;

    if ((difficulty === "hard" || difficulty === "expert") && usablePath.length >= 14) {
      const greenKey = usablePath[Math.floor(usablePath.length * 0.42)];
      const greenLock = usablePath[Math.floor(usablePath.length * 0.78)];
      if (grid[greenKey.y][greenKey.x] === 0) grid[greenKey.y][greenKey.x] = 15;
      if (grid[greenLock.y][greenLock.x] === 0) grid[greenLock.y][greenLock.x] = 17;
    }
  }

  if (mechanics.arrows && usablePath.length >= 6) {
    const count = difficulty === "easy" ? 1 : difficulty === "medium" ? 2 : difficulty === "hard" ? 3 : 4;
    for (let i = 0; i < count; i += 1) {
      const index = randomInt(rng, 2, path.length - 3);
      const p = path[index];
      if (grid[p.y][p.x] !== 0) continue;
      grid[p.y][p.x] = directionCell(p, path[index + 1]);
    }
  }

  if (mechanics.teleports && usablePath.length >= 10) {
    const first = usablePath[Math.floor(usablePath.length * 0.34)];
    const second = usablePath[Math.floor(usablePath.length * 0.70)];
    if (grid[first.y][first.x] === 0 && grid[second.y][second.x] === 0) {
      grid[first.y][first.x] = 19;
      grid[second.y][second.x] = 19;
    }
  }

  return grid;
};

export const scoreLevelLabCandidate = (
  difficulty: LevelLabDifficulty,
  mechanics: LevelLabMechanics,
  moves: number | null,
  nodesExpanded: number,
) => {
  if (!moves) return 0;
  const targetMoves = difficultyConfig[difficulty].targetMoves;
  const mechanicCount = Number(mechanics.keys) + Number(mechanics.arrows) + Number(mechanics.teleports);
  const moveScore = Math.max(0, 100 - Math.abs(targetMoves - moves) * 2.8);
  const searchScore = Math.min(35, Math.log10(Math.max(1, nodesExpanded)) * 9);
  return Math.round(moveScore + mechanicCount * 12 + searchScore);
};

export const generateLevelLabCandidate = async ({
  seed,
  difficulty,
  mechanics,
}: GenerateLevelLabCandidateOptions): Promise<LevelLabCandidate> => {
  const rng = createRng(seed);
  const path = buildPath(rng, difficulty);
  const grid = carveCandidateGrid(rng, path, difficulty, mechanics);
  const playerStart = { ...path[0] };
  const cavePos = { ...path[path.length - 1] };
  const result = await solveGrid(grid, playerStart, cavePos, {
    maxMsPerLevel: difficultyConfig[difficulty].solveMs,
    maxNodesPerLevel: difficultyConfig[difficulty].solveNodes,
    maxDepth: difficultyConfig[difficulty].maxDepth,
  });
  const score = scoreLevelLabCandidate(difficulty, mechanics, result.moves, result.nodesExpanded);

  return {
    id: `lab-${seed}`,
    createdAt: new Date().toISOString(),
    seed,
    difficulty,
    mechanics: { ...mechanics },
    grid,
    playerStart,
    cavePos,
    solved: result.solved,
    moves: result.moves,
    actions: result.actions,
    reason: result.reason ?? (result.solved ? "Solved" : "Unknown solver result"),
    nodesExpanded: result.nodesExpanded,
    ms: result.ms,
    score,
  };
};

export const generateLevelLabCampaign = async ({
  seed,
  candidateCount = 1000,
  levelsToPromote = 100,
  onProgress,
  shouldCancel,
}: GenerateLevelLabCampaignOptions): Promise<LevelLabCampaignResult> => {
  const generated: LevelLabCandidate[] = [];
  const promotionSlots = buildLevelLabPromotionSlots(levelsToPromote);
  const selectedByDifficulty: Record<LevelLabDifficulty, LevelLabCandidate[]> = {
    easy: [],
    medium: [],
    hard: [],
    expert: [],
  };
  const seen = new Set<string>();
  const perBandTarget = Math.ceil(Math.max(0, levelsToPromote) / 4);

  for (let i = 0; i < candidateCount; i += 1) {
    if (shouldCancel?.()) break;
    const targetIndex = Math.min(
      promotionSlots.length - 1,
      Math.floor((i / Math.max(1, candidateCount)) * Math.max(1, promotionSlots.length)),
    );
    const difficulty = promotionSlots[Math.max(0, targetIndex)]?.difficulty ?? "expert";
    const mechanics = levelLabMechanicsForDifficulty(difficulty);
    const candidate = await generateLevelLabCandidate({
      seed: seed + i * 104729,
      difficulty,
      mechanics,
    });
    const fingerprint = fingerprintLevelLabGrid(candidate.grid);
    const unique = !seen.has(fingerprint);
    seen.add(fingerprint);
    generated.push(candidate);

    if (candidate.solved && unique) {
      const bucket = selectedByDifficulty[difficulty];
      bucket.push(candidate);
      bucket.sort((a, b) => b.score - a.score || (b.moves ?? 0) - (a.moves ?? 0));
      selectedByDifficulty[difficulty] = bucket.slice(0, perBandTarget + 10);
    }

    onProgress?.(i + 1, candidateCount, Object.values(selectedByDifficulty).reduce((sum, bucket) => sum + bucket.length, 0));
  }

  const promotedByLevelId = new Map<number, LevelLabCandidate>();
  const usedCandidateIds = new Set<string>();

  // First pass: assign best bucketed candidates into their exact slot difficulty.
  for (const slot of promotionSlots) {
    const bucket = selectedByDifficulty[slot.difficulty];
    const picked = bucket.shift();
    if (!picked || usedCandidateIds.has(picked.id)) continue;
    promotedByLevelId.set(slot.levelId, { ...picked, promotedLevelId: slot.levelId });
    usedCandidateIds.add(picked.id);
  }

  // Fallback pass: fill missing slots using remaining solved candidates of the same difficulty only.
  const fallbackByDifficulty: Record<LevelLabDifficulty, LevelLabCandidate[]> = {
    easy: generated
      .filter((candidate) => candidate.solved && candidate.difficulty === "easy")
      .sort((a, b) => b.score - a.score),
    medium: generated
      .filter((candidate) => candidate.solved && candidate.difficulty === "medium")
      .sort((a, b) => b.score - a.score),
    hard: generated
      .filter((candidate) => candidate.solved && candidate.difficulty === "hard")
      .sort((a, b) => b.score - a.score),
    expert: generated
      .filter((candidate) => candidate.solved && candidate.difficulty === "expert")
      .sort((a, b) => b.score - a.score),
  };

  for (const slot of promotionSlots) {
    if (promotedByLevelId.has(slot.levelId)) continue;
    const fallbackBucket = fallbackByDifficulty[slot.difficulty];
    const picked = fallbackBucket.find((candidate) => !usedCandidateIds.has(candidate.id));
    if (!picked) continue;
    promotedByLevelId.set(slot.levelId, { ...picked, promotedLevelId: slot.levelId });
    usedCandidateIds.add(picked.id);
  }

  const promoted = promotionSlots
    .map((slot) => promotedByLevelId.get(slot.levelId))
    .filter((candidate): candidate is LevelLabCandidate => Boolean(candidate));

  return {
    generated,
    promoted,
    attempted: generated.length,
  };
};
