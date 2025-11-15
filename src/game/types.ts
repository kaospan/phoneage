export type CellType = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 13;

export interface Position { x: number; y: number; }
export interface GameState {
  grid: CellType[][];
  baseGrid: CellType[][];
  playerPos: Position;
  selectedArrow: Position | null;
  breakableRockStates: Map<string, boolean>;
  isGliding: boolean;
  isComplete: boolean;
}

export interface GlidePath { path: Position[]; }

export interface ArrowMoveResult {
  path: Position[];
  arrowType: CellType;
}

export interface PlayerGlideResult extends GlidePath { arrowType: CellType; }
