import type { ColorTheme } from '@/data/levels';

export const saveLevelOverride = (
  levelId: number,
  grid: number[][],
  playerStart: { x: number; y: number },
  theme?: ColorTheme
) => {
  if (typeof window === 'undefined') return;
  const payload = { grid, playerStart, theme };
  localStorage.setItem(`level_override_${levelId}`, JSON.stringify(payload));
};

