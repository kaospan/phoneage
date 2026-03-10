import type { CellType, Position } from "./types";

export const TELEPORT_CELL: CellType = 19;

/**
 * Returns the paired teleport destination for a teleport pad at `at`.
 *
 * Pairing is deterministic, based on reading order (row-major):
 * teleports[0] <-> teleports[1], teleports[2] <-> teleports[3], ...
 *
 * If there are fewer than 2 teleports, if `at` isn't a teleport, or if `at`
 * is an unpaired last teleport (odd count), returns null.
 */
export function getPairedTeleport(grid: CellType[][], at: Position): Position | null {
  if (!grid?.length || !grid[0]?.length) return null;
  if (grid[at.y]?.[at.x] !== TELEPORT_CELL) return null;

  const teleports: Position[] = [];
  for (let y = 0; y < grid.length; y += 1) {
    const row = grid[y];
    if (!row) continue;
    for (let x = 0; x < row.length; x += 1) {
      if (row[x] === TELEPORT_CELL) teleports.push({ x, y });
    }
  }

  if (teleports.length < 2) return null;

  let idx = -1;
  for (let i = 0; i < teleports.length; i += 1) {
    const t = teleports[i];
    if (t.x === at.x && t.y === at.y) {
      idx = i;
      break;
    }
  }
  if (idx < 0) return null;

  const pairIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
  const dest = teleports[pairIdx];
  if (!dest) return null;
  return dest;
}

