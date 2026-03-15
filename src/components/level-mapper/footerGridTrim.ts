import { getImageNormalizationMetadata } from './imageNormalization';

type GridLikeState = {
  rows: number;
  cols: number;
  grid: number[][];
  playerStart?: { x: number; y: number } | null;
  hourglassBonusByCell?: Record<string, number>;
};

const isBottomPlaceholderVoidRow = (grid: number[][]) => {
  if (grid.length <= 1) return false;
  const bottomRow = grid[grid.length - 1];
  return Array.isArray(bottomRow) && bottomRow.length > 0 && bottomRow.every((cell) => cell === 5);
};

const clampHourglassBonusByCell = (value: Record<string, number>, rows: number, cols: number) => {
  const out: Record<string, number> = {};
  for (const [key, raw] of Object.entries(value ?? {})) {
    const parts = key.split(',');
    if (parts.length !== 2) continue;
    const x = Number(parts[0]);
    const y = Number(parts[1]);
    if (!Number.isInteger(x) || !Number.isInteger(y)) continue;
    if (x < 0 || y < 0 || x >= cols || y >= rows) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    out[`${x},${y}`] = Math.max(1, Math.min(86400, Math.round(n)));
  }
  return out;
};

export const hasDetectedDosFooter = (imageURL: string | null | undefined) =>
  Boolean(getImageNormalizationMetadata(imageURL)?.hudFooterDetected);

export const trimDetectedDosFooterBottomRow = <T extends GridLikeState>(
  state: T,
  imageURL: string | null | undefined
): T => {
  if (!hasDetectedDosFooter(imageURL)) return state;
  if (!isBottomPlaceholderVoidRow(state.grid)) return state;

  const nextGrid = state.grid.slice(0, -1).map((row) => [...row]);
  const nextRows = nextGrid.length;
  const nextCols = nextGrid[0]?.length ?? state.cols;
  const nextPlayerStart =
    state.playerStart && state.playerStart.y < nextRows
      ? { ...state.playerStart }
      : null;

  return {
    ...state,
    rows: nextRows,
    cols: nextCols,
    grid: nextGrid,
    playerStart: nextPlayerStart,
    hourglassBonusByCell: clampHourglassBonusByCell(state.hourglassBonusByCell ?? {}, nextRows, nextCols),
  };
};
