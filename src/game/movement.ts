import { CellType, GameState, Position } from './types';
import { isArrowCell, getArrowDirections } from './arrows';
import { computePlayerGlidePath, computeRemoteArrowGlidePath } from './glide';
import { getPairedTeleport, TELEPORT_CELL } from './teleport';

const isKeyCell = (cell: CellType) => cell === 14 || cell === 15;
const isLockCell = (cell: CellType) => cell === 16 || cell === 17;
const keyColorForCell = (cell: CellType) => (cell === 14 ? 'red' : cell === 15 ? 'green' : null);
const lockColorForCell = (cell: CellType) => (cell === 16 ? 'red' : cell === 17 ? 'green' : null);

export interface PlayerMoveOutcome {
  glidePath?: { path: Position[]; arrowType: CellType };
  newPlayerPos?: Position;
  newGrid?: CellType[][];
  brokeRock?: boolean;
  consumedMove?: boolean;
  startGlide?: boolean;
  collectedKey?: 'red' | 'green';
  unlockedLock?: 'red' | 'green';
}

export function attemptPlayerMove(state: GameState, dx: number, dy: number): PlayerMoveOutcome {
  const { grid, playerPos, breakableRockStates, baseGrid, inventory } = state;
  const targetX = playerPos.x + dx;
  const targetY = playerPos.y + dy;
  // Bounds
  if (targetY < 0 || targetY >= grid.length || targetX < 0 || targetX >= grid[0].length) return {}; // no move

  const playerCell = grid[playerPos.y][playerPos.x];
  const targetCell = grid[targetY][targetX];
  const targetKey = keyColorForCell(targetCell);
  const targetLock = lockColorForCell(targetCell);

  // If on arrow
  if (isArrowCell(playerCell)) {
    if (targetLock && !inventory[targetLock]) {
      return {};
    }

    // Step priority (floor, cave, start-marker cave, arrow, fresh breakable rock)
    if (targetCell === 0 || targetCell === 3 || targetCell === 18 || targetCell === TELEPORT_CELL || isArrowCell(targetCell) || isKeyCell(targetCell) || isLockCell(targetCell)) {
      const outcome: PlayerMoveOutcome = {
        newPlayerPos: { x: targetX, y: targetY },
        consumedMove: true
      };
      if (targetKey || targetLock) {
        const newGrid = grid.map(r => [...r]);
        if (targetKey) {
          inventory[targetKey] = true;
          outcome.collectedKey = targetKey;
        } else if (targetLock) {
          outcome.unlockedLock = targetLock;
        }
        newGrid[targetY][targetX] = 0;
        baseGrid[targetY][targetX] = 0;
        outcome.newGrid = newGrid;
      }
      if (targetCell === TELEPORT_CELL) {
        const dest = getPairedTeleport(outcome.newGrid ?? grid, { x: targetX, y: targetY });
        if (dest) outcome.newPlayerPos = dest;
      }
      return outcome;
    }
    if (targetCell === 6) { // breakable rock first time
      const key = `${targetX},${targetY}`;
      if (!breakableRockStates.get(key)) {
        breakableRockStates.set(key, true);
        return { newPlayerPos: { x: targetX, y: targetY }, consumedMove: true };
      }
      return {}; // already stepped
    }
    // Stone / fire / water / void impassable for walking; may glide if direction matches
    const dirs = getArrowDirections(playerCell);
    const isArrowDir = dirs.some(d => d.dx === dx && d.dy === dy);
    if (isArrowDir) {
      const glide = computePlayerGlidePath(grid, playerPos, dx, dy, playerCell);
      if (glide.path.length === 0) return {}; // can't glide
      // Build updated grid leaving void trail and restoring base
      const newGrid = grid.map(r => [...r]);
      return { glidePath: glide, newGrid, startGlide: true };
    }
    return {}; // blocked
  }

  // Normal movement
  const currentCell = playerCell;
  let willBreakRock = false;
  if (currentCell === 6) {
    const key = `${playerPos.x},${playerPos.y}`;
    if (breakableRockStates.get(key) && (targetX !== playerPos.x || targetY !== playerPos.y)) {
      willBreakRock = true;
    }
  }

  // Stones impassable
  if (targetCell === 2) return {};
  
  // Enter breakable rock (first time)
  if (targetCell === 6) {
    const key = `${targetX},${targetY}`;
    if (!breakableRockStates.get(key)) {
      breakableRockStates.set(key, true);
      const outcome: PlayerMoveOutcome = {
        newPlayerPos: { x: targetX, y: targetY },
        consumedMove: true
      };
      // If leaving a stepped-on breakable rock, break it even when entering another breakable rock
      if (willBreakRock) {
        const newGrid = grid.map(r => [...r]);
        newGrid[playerPos.y][playerPos.x] = 5; // becomes void
        outcome.newGrid = newGrid;
        outcome.brokeRock = true;
      }
      return outcome;
    }
    return {}; // second time blocked
  }

  if (targetLock && !inventory[targetLock]) return {};
  
  // Fire, water, void impassable
  if (targetCell === 1 || targetCell === 4 || targetCell === 5) return {};

  // Floor/cave/start-marker cave/arrow
  const outcome: PlayerMoveOutcome = {
    newPlayerPos: { x: targetX, y: targetY },
    consumedMove: true
  };
  if (targetKey || targetLock) {
    const newGrid = outcome.newGrid ?? grid.map(r => [...r]);
    if (targetKey) {
      inventory[targetKey] = true;
      outcome.collectedKey = targetKey;
    } else if (targetLock) {
      outcome.unlockedLock = targetLock;
    }
    newGrid[targetY][targetX] = 0;
    baseGrid[targetY][targetX] = 0;
    outcome.newGrid = newGrid;
  }
  if (willBreakRock) {
    const newGrid = outcome.newGrid ?? grid.map(r => [...r]);
    newGrid[playerPos.y][playerPos.x] = 5; // becomes void
    outcome.newGrid = newGrid;
    outcome.brokeRock = true;
  }
  if (targetCell === TELEPORT_CELL) {
    const dest = getPairedTeleport(outcome.newGrid ?? grid, { x: targetX, y: targetY });
    if (dest) outcome.newPlayerPos = dest;
  }
  return outcome;
}

export interface RemoteArrowOutcome {
  glidePath?: { path: Position[]; arrowType: CellType };
  newGrid?: CellType[][];
  consumedMove?: boolean;
}

export function attemptRemoteArrowMove(state: GameState, dx: number, dy: number): RemoteArrowOutcome {
  const { grid, selectedArrow, baseGrid } = state;
  if (!selectedArrow) return {};
  const arrowCell = grid[selectedArrow.y][selectedArrow.x] as CellType;
  if (!isArrowCell(arrowCell)) return {};

  const dirs = getArrowDirections(arrowCell);
  const isValid = dirs.some(d => d.dx === dx && d.dy === dy);
  if (!isValid) return {};

  const glide = computeRemoteArrowGlidePath(grid, selectedArrow, dx, dy, arrowCell);
  if (glide.path.length === 0) return {}; // cannot move further

  const newGrid = grid.map(r => [...r]);
  return { glidePath: glide, newGrid, consumedMove: true };
}
