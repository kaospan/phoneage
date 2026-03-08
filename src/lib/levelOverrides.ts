import { getAllLevels, shouldAllowLevelOverride, type ColorTheme } from '@/data/levels';

export const LEVEL_OVERRIDES_UPDATED_EVENT = 'stone-age-level-overrides-updated';

export const notifyLevelOverridesUpdated = () => {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(LEVEL_OVERRIDES_UPDATED_EVENT));
};

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
  notifyLevelOverridesUpdated();
};
