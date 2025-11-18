// Stone Age DOS game levels
// Legend: 
// 0 = floor, 1 = wall/fire, 2 = stone, 3 = cave entrance, 4 = water, 5 = void/air, 6 = breakable rock
// 7 = arrow up, 8 = arrow right, 9 = arrow down, 10 = arrow left
// 11 = up-down arrow, 12 = left-right arrow, 13 = omnidirectional arrow (all 4 directions)

export type ArrowDirection = 'up' | 'right' | 'down' | 'left';

export interface Level {
  id: number;
  grid: number[][];
  playerStart: { x: number; y: number };
  cavePos: { x: number; y: number };
}

export const levels: Level[] = [
  // Level 1 - User custom grid
  {
    id: 1,
    grid: [
      [5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,2,2,2,5,5],
      [2,2,2,5,5,5,5,5,5,2,2,2,2,2,2,2,5,2,5,5],
      [2,2,2,5,5,5,5,2,2,2,5,5,5,5,0,0,5,2,5,5],
      [2,2,2,5,5,5,2,2,5,5,5,5,5,0,0,0,5,2,5,5],
      [5,5,5,5,5,5,2,5,5,5,0,5,10,0,0,5,5,2,5,5],
      [5,5,5,5,5,5,2,5,5,0,0,5,10,0,5,2,2,2,5,5],
      [5,5,5,5,5,5,2,3,0,0,0,5,5,5,2,2,5,5,5,5],
      [5,5,5,5,5,5,2,0,0,0,5,5,5,2,2,5,5,5,5,5],
      [5,5,2,2,2,5,2,2,2,2,5,5,2,2,5,5,5,5,5,5],
      [5,5,2,2,2,5,5,5,5,2,2,2,2,5,5,5,5,5,5,5],
      [5,5,2,2,2,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5],
    ],
    playerStart: { x: 15, y: 3 },
    cavePos: { x: 7, y: 6 },
  },
  // Level 2 - Dual-path puzzle: up-down arrow glide or left-right arrow bridge
  {
    id: 2,
    grid: [
      [5,1,1,1,5,5,5,5,5,5,0,5,5],
      [1,1,0,12,5,5,5,5,5,5,5,5,3],
      [1,0,0,1,1,0,0,1,1,5,5,5,5],
      [1,0,0,6,6,6,0,0,1,1,5,5,5],
      [1,0,0,1,1,1,0,0,0,1,5,5,5],
      [1,1,0,1,5,1,1,0,0,0,11,1,5],
      [5,1,1,1,5,5,1,1,0,0,0,1,5],
      [5,5,5,5,5,5,5,1,1,0,0,1,5],
      [5,5,5,5,5,5,5,5,1,1,1,1,5],
    ],
    playerStart: { x: 10, y: 7 },
    cavePos: { x: 12, y: 1 },
  },
  // Level 3 - Horizontal void corrxidor with arrows
  {
    id: 3,
    grid: [[5,5,5,5,5,2,2,5,5,5,5,5,5,5,5,5,5,5,5,5],[5,5,5,2,2,5,0,2,2,5,5,5,5,5,5,2,2,5,5,5],[5,5,2,5,5,5,0,5,2,2,2,2,2,2,2,5,3,2,5,5],[5,2,5,5,5,5,0,5,0,5,0,5,0,5,0,5,0,2,5,5],[2,5,5,5,5,5,0,5,0,5,0,5,0,5,0,5,5,2,2,5],[2,5,5,8,5,5,5,5,5,5,5,5,5,5,5,5,5,5,2,5],[2,5,5,5,5,0,5,0,5,0,5,0,5,0,5,5,5,5,2,5],[5,2,5,7,5,0,5,0,5,0,5,0,5,0,5,5,5,5,2,5],[5,5,2,0,5,2,2,0,5,0,5,0,5,8,7,5,7,2,5,5],[5,5,5,2,2,5,5,2,2,2,5,0,5,0,5,2,2,5,5,5],[5,5,5,5,5,5,5,5,5,5,2,2,2,2,2,5,5,5,5,5]],
    playerStart: { x: 3, y: 8 },
    cavePos: { x: 10, y: 0 },
  },
  // Level 4 - Stone maze with omnidirectional start
  {
    id: 4,
    grid: [
      [5,5,2,2,2,2,2,5,5,5,5,5,5,5,5,5,5,5,5,5],
      [5,5,2,5,5,5,2,5,2,2,2,5,5,5,5,5,5,5,5,5],
      [5,5,2,2,2,5,2,2,2,5,2,5,5,5,5,2,2,2,5,5],
      [5,5,5,5,2,5,5,5,5,5,2,2,2,2,2,2,5,2,5,5],
      [5,5,5,5,2,2,5,5,5,5,5,5,5,5,2,5,5,2,5,5],
      [5,5,2,2,2,5,5,5,5,5,5,5,5,5,5,5,2,2,5,5],
      [5,5,2,5,5,5,5,5,5,5,5,5,5,5,2,5,2,5,5,5],
      [5,5,2,13,2,2,2,2,5,5,5,5,5,5,2,2,2,5,5,5],
      [5,5,2,0,2,5,5,2,2,2,2,5,5,5,2,5,5,5,5,5],
      [5,5,2,2,2,5,5,5,5,5,2,2,2,2,2,5,5,5,5,5],
      [5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5]
    ],
    playerStart: { x: 3, y: 8 },
    cavePos: { x: 3, y: 7 },
  },
  // Level 5 - User custom grid with arrows and cave
  {
    id: 5,
    grid: [
      [5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5],
      [5,5,5,5,2,2,2,2,2,2,2,2,2,2,2,2,2,5,5,5],
      [5,5,5,2,2,5,2,5,2,11,5,2,11,2,11,0,2,5,5,5],
      [5,5,5,2,5,5,5,5,5,5,5,5,5,5,13,5,2,5,5,5],
      [5,5,5,2,2,5,5,5,5,5,5,5,5,5,5,2,2,5,5,5],
      [5,5,5,5,2,2,5,5,5,5,5,5,5,5,2,2,5,5,5,5],
      [5,5,5,2,2,5,5,5,5,5,5,5,5,5,5,2,2,5,5,5],
      [5,5,5,2,5,13,5,5,5,5,5,5,5,5,5,5,2,5,5,5],
      [5,5,5,2,3,11,2,11,2,5,5,2,5,2,5,2,2,5,5,5],
      [5,5,5,2,2,2,2,2,2,2,2,2,2,2,2,2,5,5,5,5],
      [5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5]
    ],
    playerStart: { x: 15, y: 2 },
    cavePos: { x: 4, y: 8 },
  }
];

// Generate procedural levels 6-47
const generateExtraLevels = (): Level[] => {
  const extraLevels: Level[] = [];
  
  for (let i = 6; i <= 47; i++) {
    const size = 8 + (i % 5);
    const grid: number[][] = [];
    
    // Create base grid with void around walkable path
    for (let y = 0; y < size; y++) {
      grid[y] = [];
      for (let x = 0; x < size; x++) {
        // Create a path pattern with void around it
        const isEdge = x === 0 || x === size - 1 || y === 0 || y === size - 1;
        const isPath = Math.abs(x - size / 2) < size / 3 || Math.abs(y - size / 2) < size / 3;
        grid[y][x] = (isEdge || !isPath) ? 5 : 0;
      }
    }
    
    // Ensure player start and cave positions are walkable
    const playerX = Math.floor(size / 2);
    const playerY = size - 2;
    const caveX = 1 + (i % (size - 3));
    const caveY = 1;
    
    grid[playerY][playerX] = 0;
    grid[caveY][caveX] = 0;
    
    // Create connecting path
    let cx = playerX, cy = playerY;
    while (cx !== caveX || cy !== caveY) {
      grid[cy][cx] = 0;
      if (cx < caveX) cx++;
      else if (cx > caveX) cx--;
      if (cy < caveY) cy++;
      else if (cy > caveY) cy--;
    }
    
    // Add stones
    const numStones = 1 + (i % 4);
    for (let s = 0; s < numStones; s++) {
      const sx = 2 + ((s * 3) % (size - 4));
      const sy = 2 + ((s * 2) % (size - 4));
      if (grid[sy] && grid[sy][sx] === 0) {
        grid[sy][sx] = 2;
      }
    }
    
    // Add arrows (directions: 7=up, 8=right, 9=down, 10=left)
    const numArrows = 1 + (i % 3);
    for (let a = 0; a < numArrows; a++) {
      const ax = 1 + ((a * 4) % (size - 2));
      const ay = 1 + ((a * 3) % (size - 2));
      const arrowType = 7 + (a % 4); // Cycle through arrow directions
      if (grid[ay] && grid[ay][ax] === 0) {
        grid[ay][ax] = arrowType;
      }
    }
    
    extraLevels.push({
      id: i,
      grid,
      playerStart: { x: playerX, y: playerY },
      cavePos: { x: caveX, y: caveY },
    });
  }
  
  return extraLevels;
};

export const allLevels = [...levels, ...generateExtraLevels()];

// Retrieve levels with any grid overrides stored in localStorage (level_override_<id>)
export const getAllLevels = (): Level[] => {
  const base = allLevels.map(l => ({ ...l, grid: l.grid.map(row => [...row]) }));
  if (typeof window === 'undefined') return base; // SSR safety
  const withOverrides = base.map(l => {
    const key = `level_override_${l.id}`;
    const raw = localStorage.getItem(key);
    if (!raw) return l;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
        return { ...l, grid: parsed as number[][] };
      }
    } catch { /* ignore bad JSON */ }
    return l;
  });

  // Ensure cavePos matches the location of tile id 3 in the grid when present
  return withOverrides.map(l => {
    let caveX = l.cavePos.x;
    let caveY = l.cavePos.y;
    let found = false;
    for (let y = 0; y < l.grid.length && !found; y++) {
      for (let x = 0; x < (l.grid[y]?.length || 0) && !found; x++) {
        if (l.grid[y][x] === 3) {
          caveX = x;
          caveY = y;
          found = true;
        }
      }
    }
    return found ? { ...l, cavePos: { x: caveX, y: caveY } } : l;
  });
};
