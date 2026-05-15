import { getAllLevels } from '@/data/levels';
import { buildLevelFromSources } from '@/lib/levelImageDetection';
import { runSolveLevel } from '@/lib/levelSolver';
import { seedDefaultReferences } from '@/lib/referenceSeeder';

export interface RunLevelQaOptions {
  solveMaxMsPerLevel?: number;
  solveMaxNodesPerLevel?: number;
  solveMaxDepth?: number;
  detectTimeoutMs?: number;
  matchThreshold?: number;
  onProgress?: (status: string) => void;
}

export interface LevelQaEntry {
  levelId: number;
  hasImage: boolean;
  solved?: boolean;
  solveError?: string;
  mapMatchRatio?: number;
  mapMatched?: boolean;
  imageError?: string;
}

export interface LevelQaReport {
  generatedAt: string;
  summary: {
    totalLevels: number;
    levelsWithImage: number;
    solveCrashCount: number;
    imageMismatchCount: number;
    imageErrorCount: number;
  };
  threshold: number;
  entries: LevelQaEntry[];
}

const countCells = (grid: number[][]) => {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  return rows * cols;
};

const compareGridMatchRatio = (left: number[][], right: number[][]) => {
  const rows = Math.max(left.length, right.length);
  const cols = Math.max(left[0]?.length ?? 0, right[0]?.length ?? 0);
  if (rows === 0 || cols === 0) return 0;

  let equal = 0;
  let total = 0;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < cols; x += 1) {
      const l = left[y]?.[x];
      const r = right[y]?.[x];
      total += 1;
      if (l === r) equal += 1;
    }
  }
  return equal / total;
};

export const runLevelQaReport = async (options: RunLevelQaOptions = {}): Promise<LevelQaReport> => {
  if (typeof window === 'undefined') {
    throw new Error('runLevelQaReport can only run in a browser context');
  }

  const matchThreshold = options.matchThreshold ?? 0.75;
  const levels = getAllLevels().slice().sort((a, b) => a.id - b.id);
  const entries: LevelQaEntry[] = [];

  await seedDefaultReferences();

  for (let index = 0; index < levels.length; index += 1) {
    const level = levels[index];
    const source = level.image ?? level.sources?.[0];
    options.onProgress?.(`QA level ${level.id} (${index + 1}/${levels.length})`);

    const entry: LevelQaEntry = {
      levelId: level.id,
      hasImage: Boolean(source),
    };

    try {
      const solved = await runSolveLevel(level.id, {
        maxMsPerLevel: options.solveMaxMsPerLevel ?? 1500,
        maxNodesPerLevel: options.solveMaxNodesPerLevel ?? 10000,
        maxDepth: options.solveMaxDepth ?? 120,
      });
      entry.solved = solved.solved;
    } catch (error) {
      entry.solveError = (error as Error).message;
    }

    if (source) {
      try {
        const detected = await buildLevelFromSources([source], {
          minSimilarity: 0.72,
          timeoutMs: options.detectTimeoutMs ?? 5000,
        });
        const ratio = compareGridMatchRatio(level.grid, detected.grid);
        const sameSize = countCells(level.grid) === countCells(detected.grid);
        entry.mapMatchRatio = ratio;
        entry.mapMatched = sameSize && ratio >= matchThreshold;
      } catch (error) {
        entry.imageError = (error as Error).message;
      }
    }

    entries.push(entry);
    await new Promise(requestAnimationFrame);
  }

  return {
    generatedAt: new Date().toISOString(),
    threshold: matchThreshold,
    summary: {
      totalLevels: entries.length,
      levelsWithImage: entries.filter((entry) => entry.hasImage).length,
      solveCrashCount: entries.filter((entry) => Boolean(entry.solveError)).length,
      imageMismatchCount: entries.filter((entry) => entry.hasImage && entry.mapMatched === false && !entry.imageError).length,
      imageErrorCount: entries.filter((entry) => Boolean(entry.imageError)).length,
    },
    entries,
  };
};
