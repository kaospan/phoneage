import { CellType, GameState, Position } from './types';
import { isArrowCell, getArrowDirections } from './arrows';
import { computePlayerGlidePath, computeRemoteArrowGlidePath } from './glide';

export interface PlayerMoveOutcome {
  glidePath?: { path: Position[]; arrowType: CellType };
  newPlayerPos?: Position;
  newGrid?: CellType[][];
  brokeRock?: boolean;
  consumedMove?: boolean;
  startGlide?: boolean;
}

export function attemptPlayerMove(state: GameState, dx: number, dy: number): PlayerMoveOutcome {
  const { grid, playerPos, breakableRockStates, baseGrid } = state;
  const targetX = playerPos.x + dx;
  const targetY = playerPos.y + dy;
  // Bounds
  if (targetY < 0 || targetY >= grid.length || targetX < 0 || targetX >= grid[0].length) return {}; // no move

  const playerCell = grid[playerPos.y][playerPos.x];
  const targetCell = grid[targetY][targetX];

  // If on arrow
  if (isArrowCell(playerCell)) {
    // Step priority (floor, cave, arrow, fresh breakable rock)
    if (targetCell === 0 || targetCell === 3 || isArrowCell(targetCell)) {
      return { newPlayerPos: { x: targetX, y: targetY }, consumedMove: true };
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
      return { newPlayerPos: { x: targetX, y: targetY }, consumedMove: true };
    }
    return {}; // second time blocked
  }
  // Fire, water, void impassable
  if (targetCell === 1 || targetCell === 4 || targetCell === 5) return {};

  // Floor/cave/arrow
  const outcome: PlayerMoveOutcome = {
    newPlayerPos: { x: targetX, y: targetY },
    consumedMove: true
  };
  if (willBreakRock) {
    const newGrid = grid.map(r => [...r]);
    newGrid[playerPos.y][playerPos.x] = 5; // becomes void
    outcome.newGrid = newGrid;
    outcome.brokeRock = true;
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
