import { getAllLevels, shouldAllowLevelOverride, type ColorTheme } from '@/data/levels';

export const saveLevelOverride = (
  levelId: number,
  grid: number[][],
  playerStart: { x: number; y: number },
  theme?: ColorTheme
) => {
  if (typeof window === 'undefined') return;
  const level = getAllLevels().find((entry) => entry.id === levelId);
  if (level && !shouldAllowLevelOverride(level)) {
    console.log(`Skipping local override for level ${levelId}; code default is authoritative.`);
    return;
  }
  const payload = { grid, playerStart, theme };
  localStorage.setItem(`level_override_${levelId}`, JSON.stringify(payload));
};
