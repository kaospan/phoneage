import { stageImageSets } from '@/data/assetCatalog';

// Stone Age DOS game levels
// Legend: 
// 0 = floor, 1 = wall/fire, 2 = stone, 3 = cave entrance, 4 = water, 5 = void/air, 6 = breakable rock
// 7 = arrow up, 8 = arrow right, 9 = arrow down, 10 = arrow left
// 11 = up-down arrow, 12 = left-right arrow, 13 = omnidirectional arrow (all 4 directions)

export type ArrowDirection = 'up' | 'right' | 'down' | 'left';

export type ColorTheme = 'default' | 'ocean' | 'forest' | 'sunset' | 'lava' | 'crystal' | 'neon';

export interface ThemeColors {
  floor: string;
  wall: string;
  stone: string;
  cave: string;
  arrow: string;
  breakable: string;
  player: string;
  ambient: string;
  background: string;
}

export const themes: Record<ColorTheme, ThemeColors> = {
  default: {
    floor: '#d4a574',
    wall: '#a67c52',
    stone: '#6b4423',
    cave: '#8b4513',
    arrow: '#cd853f',
    breakable: '#4a9eff',
    player: '#00ff00',
    ambient: '#fff5e6',
    background: 'from-amber-50 to-orange-100'
  },
  ocean: {
    floor: '#87ceeb',
    wall: '#4682b4',
    stone: '#1e90ff',
    cave: '#00bfff',
    arrow: '#40e0d0',
    breakable: '#20b2aa',
    player: '#ffff00',
    ambient: '#e0f7fa',
    background: 'from-blue-50 to-cyan-100'
  },
  forest: {
    floor: '#90ee90',
    wall: '#228b22',
    stone: '#556b2f',
    cave: '#8b4513',
    arrow: '#9acd32',
    breakable: '#32cd32',
    player: '#ff69b4',
    ambient: '#f1f8e9',
    background: 'from-green-50 to-emerald-100'
  },
  sunset: {
    floor: '#ffb347',
    wall: '#ff6347',
    stone: '#cd5c5c',
    cave: '#8b0000',
    arrow: '#ff69b4',
    breakable: '#ff1493',
    player: '#ffff00',
    ambient: '#fff3e0',
    background: 'from-orange-100 to-pink-200'
  },
  lava: {
    floor: '#ff4500',
    wall: '#8b0000',
    stone: '#b22222',
    cave: '#ff8c00',
    arrow: '#ffa500',
    breakable: '#ff6347',
    player: '#00ffff',
    ambient: '#ffe4e1',
    background: 'from-red-100 to-orange-200'
  },
  crystal: {
    floor: '#e6e6fa',
    wall: '#9370db',
    stone: '#8a2be2',
    cave: '#9400d3',
    arrow: '#da70d6',
    breakable: '#ba55d3',
    player: '#ffff00',
    ambient: '#f3e5f5',
    background: 'from-purple-50 to-pink-100'
  },
  neon: {
    floor: '#00ff00',
    wall: '#ff00ff',
    stone: '#00ffff',
    cave: '#ff1493',
    arrow: '#ffff00',
    breakable: '#ff69b4',
    player: '#ffffff',
    ambient: '#1a1a2e',
    background: 'from-gray-900 to-purple-900'
  }
};

export interface Level {
  id: number;
  grid: number[][];
  playerStart: { x: number; y: number };
  cavePos: { x: number; y: number };
  theme?: ColorTheme;
  image?: string;
  sources?: string[];
  autoBuild?: boolean;
}

export const manualLevels: Level[] = [
  // Level 1 - User custom grid
  {
    id: 1,
    grid: [
      [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 2, 2, 5, 5],
      [2, 2, 2, 5, 5, 5, 5, 5, 5, 2, 2, 2, 2, 2, 2, 2, 5, 2, 5, 5],
      [2, 2, 2, 5, 5, 5, 5, 2, 2, 2, 5, 5, 5, 5, 0, 0, 5, 2, 5, 5],
      [2, 2, 2, 5, 5, 5, 2, 2, 5, 5, 5, 5, 5, 0, 0, 0, 5, 2, 5, 5],
      [5, 5, 5, 5, 5, 5, 2, 5, 5, 5, 0, 5, 10, 0, 0, 5, 5, 2, 5, 5],
      [5, 5, 5, 5, 5, 5, 2, 5, 5, 0, 0, 5, 10, 0, 5, 2, 2, 2, 5, 5],
      [5, 5, 5, 5, 5, 5, 2, 3, 0, 0, 0, 5, 5, 5, 2, 2, 5, 5, 5, 5],
      [5, 5, 5, 5, 5, 5, 2, 0, 0, 0, 5, 5, 5, 2, 2, 5, 5, 5, 5, 5],
      [5, 5, 2, 2, 2, 5, 2, 2, 2, 2, 5, 5, 2, 2, 5, 5, 5, 5, 5, 5],
      [5, 5, 2, 2, 2, 5, 5, 5, 5, 2, 2, 2, 2, 5, 5, 5, 5, 5, 5, 5],
      [5, 5, 2, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
    ],
    playerStart: { x: 15, y: 3 },
    cavePos: { x: 7, y: 6 },
  },
  // Level 2 - Dual-path puzzle: up-down arrow glide or left-right arrow bridge
  {
    id: 2,
    grid: [
      [5, 1, 1, 1, 5, 5, 5, 5, 5, 5, 0, 5, 5],
      [1, 1, 0, 12, 5, 5, 5, 5, 5, 5, 5, 5, 3],
      [1, 0, 0, 1, 1, 0, 0, 1, 1, 5, 5, 5, 5],
      [1, 0, 0, 6, 6, 6, 0, 0, 1, 1, 5, 5, 5],
      [1, 0, 0, 1, 1, 1, 0, 0, 0, 1, 5, 5, 5],
      [1, 1, 0, 1, 5, 1, 1, 0, 0, 0, 11, 1, 5],
      [5, 1, 1, 1, 5, 5, 1, 1, 0, 0, 0, 1, 5],
      [5, 5, 5, 5, 5, 5, 5, 1, 1, 0, 0, 1, 5],
      [5, 5, 5, 5, 5, 5, 5, 5, 1, 1, 1, 1, 5],
    ],
    playerStart: { x: 10, y: 7 },
    cavePos: { x: 12, y: 1 },
  },
  // Level 3 - Horizontal void corrxidor with arrows
  {
    id: 3,
    grid: [[5, 5, 5, 5, 5, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5], [5, 5, 5, 2, 2, 5, 0, 2, 2, 5, 5, 5, 5, 5, 5, 2, 2, 5, 5, 5], [5, 5, 2, 5, 5, 5, 0, 5, 2, 2, 2, 2, 2, 2, 2, 5, 3, 2, 5, 5], [5, 2, 5, 5, 5, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 2, 5, 5], [2, 5, 5, 5, 5, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 5, 2, 2, 5], [2, 5, 5, 8, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 5], [2, 5, 5, 5, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 5, 5, 5, 2, 5], [5, 2, 5, 7, 5, 0, 5, 0, 5, 0, 5, 0, 5, 0, 5, 5, 5, 5, 2, 5], [5, 5, 2, 0, 5, 2, 2, 0, 5, 0, 5, 0, 5, 8, 7, 5, 7, 2, 5, 5], [5, 5, 5, 2, 2, 5, 5, 2, 2, 2, 5, 0, 5, 0, 5, 2, 2, 5, 5, 5], [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 2, 2, 2, 2, 5, 5, 5, 5, 5]],
    playerStart: { x: 3, y: 8 },
    cavePos: { x: 10, y: 0 },
  },
  // Level 4 - Stone maze with omnidirectional start
  {
    id: 4,
    grid: [
      [5, 5, 2, 2, 2, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      [5, 5, 2, 5, 5, 5, 2, 5, 2, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      [5, 5, 2, 2, 2, 5, 2, 2, 2, 5, 2, 5, 5, 5, 5, 2, 2, 2, 5, 5],
      [5, 5, 5, 5, 2, 5, 5, 5, 5, 5, 2, 2, 2, 2, 2, 2, 5, 2, 5, 5],
      [5, 5, 5, 5, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 2, 5, 5, 2, 5, 5],
      [5, 5, 2, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 2, 5, 5],
      [5, 5, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 5, 2, 5, 5, 5],
      [5, 5, 2, 13, 2, 2, 2, 2, 5, 5, 5, 5, 5, 5, 2, 2, 2, 5, 5, 5],
      [5, 5, 2, 0, 2, 5, 5, 2, 2, 2, 2, 5, 5, 5, 2, 5, 5, 5, 5, 5],
      [5, 5, 2, 2, 2, 5, 5, 5, 5, 5, 2, 2, 2, 2, 2, 5, 5, 5, 5, 5],
      [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
    ],
    playerStart: { x: 3, y: 8 },
    cavePos: { x: 3, y: 7 },
  },
  // Level 5 - User custom grid with arrows and cave
  {
    id: 5,
    grid: [
      [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5],
      [5, 5, 5, 5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 5, 5, 5],
      [5, 5, 5, 2, 2, 5, 2, 5, 2, 11, 5, 2, 11, 2, 11, 0, 2, 5, 5, 5],
      [5, 5, 5, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 13, 5, 2, 5, 5, 5],
      [5, 5, 5, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 2, 5, 5, 5],
      [5, 5, 5, 5, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 2, 2, 5, 5, 5, 5],
      [5, 5, 5, 2, 2, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 2, 5, 5, 5],
      [5, 5, 5, 2, 5, 13, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 2, 5, 5, 5],
      [5, 5, 5, 2, 3, 11, 2, 11, 2, 5, 5, 2, 5, 2, 5, 2, 2, 5, 5, 5],
      [5, 5, 5, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 5, 5, 5, 5],
      [5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5, 5]
    ],
    playerStart: { x: 15, y: 2 },
    cavePos: { x: 4, y: 8 },
  },
  // Level 6 - Sample level for testing
  {
    id: 6,
    grid: [
      [5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5], // Row 1
      [5,5,5,2,2,2,5,2,2,2,2,2,2,2,5,5,5,5,5,5], // Row 2
      [5,5,5,2,3,0,2,2,5,5,5,5,5,2,2,2,2,2,5,5], // Row 3
      [5,5,5,2,0,0,5,10,5,2,0,0,5,5,5,10,5,2,5,5], // Row 4
      [5,5,5,5,2,9,5,0,5,5,10,5,2,7,5,5,2,2,5,5], // Row 5
      [5,5,5,5,2,5,8,5,5,5,5,5,0,0,5,5,2,5,5,5], // Row 6
      [5,5,5,2,2,5,0,5,5,2,2,2,2,2,5,0,2,5,5,5], // Row 7
      [5,5,5,2,5,5,5,5,5,10,0,0,5,5,5,10,0,2,5,5], // Row 8
      [5,5,5,2,2,2,2,2,5,5,5,5,5,2,2,0,0,2,5,5], // Row 9
      [5,5,5,5,5,5,5,2,2,2,2,2,2,2,5,2,2,2,5,5], // Row 10
      [5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5,5] // Row 11
],
    playerStart: { x: 16, y: 8 },
    cavePos: { x: 4, y: 8 }
  }
];

export const manualFallbackById = new Map(manualLevels.map((level) => [level.id, level]));
const manualById = new Map(manualLevels.map((level) => [level.id, level]));

const buildAutoLevels = (): Level[] => {
  if (stageImageSets.length === 0) {
    return manualLevels;
  }

  const themeCycle: ColorTheme[] = [
    'default',
    'ocean',
    'forest',
    'sunset',
    'lava',
    'crystal',
    'neon',
  ];

  return stageImageSets.map((stage) => {
    const manual = manualById.get(stage.id);
    if (manual) {
      return {
        ...manual,
        image: stage.primary,
        sources: stage.sources,
        autoBuild: false,
      };
    }

    return {
      id: stage.id,
      grid: [[5]],
      playerStart: { x: 0, y: 0 },
      cavePos: { x: 0, y: 0 },
      theme: themeCycle[(stage.id - 1) % themeCycle.length],
      image: stage.primary,
      sources: stage.sources,
      autoBuild: true,
    };
  });
};

export const allLevels = buildAutoLevels();

console.log('📦 levels.ts loaded, total levels:', allLevels.length);

// Retrieve levels with any grid overrides stored in localStorage (level_override_<id>)
export const getAllLevels = (): Level[] => {
  console.log('🔍 getAllLevels() called');
  
  try {
    const base = allLevels.map(l => ({ ...l, grid: l.grid.map(row => [...row]) }));
    console.log('✓ Base levels cloned:', base.length);
    
    if (typeof window === 'undefined') {
      console.log('⚠️ SSR mode, returning base levels');
      return base;
    }
    
    console.log('🔍 Checking localStorage for overrides...');
    const withOverrides = base.map(l => {
      if (l.autoBuild === false) return l;
      const key = `level_override_${l.id}`;
      const raw = localStorage.getItem(key);
      if (!raw) return l;
      try {
        const parsed = JSON.parse(raw);
        // Handle new format: { grid, playerStart }
        if (parsed && typeof parsed === 'object' && parsed.grid) {
          console.log(`✓ Override found for level ${l.id} (new format)`);
          const result = { ...l, grid: parsed.grid as number[][] };
          if (parsed.playerStart) {
            result.playerStart = parsed.playerStart;
          }
          return result;
        }
        // Handle old format: just the grid array
        if (Array.isArray(parsed) && Array.isArray(parsed[0])) {
          console.log(`✓ Override found for level ${l.id} (old format)`);
          return { ...l, grid: parsed as number[][] };
        }
      } catch (err) {
        console.warn(`⚠️ Failed to parse override for level ${l.id}:`, err);
      }
      return l;
    });

    console.log('🔍 Syncing cave positions...');
    // Ensure cavePos matches the location of tile id 3 in the grid when present
    const result = withOverrides.map(l => {
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
    
    console.log('✅ getAllLevels() complete, returning', result.length, 'levels');
    return result;
  } catch (error) {
    console.error('❌ Error in getAllLevels:', error);
    console.error('Stack trace:', (error as Error).stack);
    throw error;
  }
};
