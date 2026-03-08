import { getAllLevels, type ColorTheme } from '@/data/levels';
import { notifyLevelOverridesUpdated } from '@/lib/levelOverrides';

/**
 * Persistence operations for level mapper
 * Handles save/load operations and export functionality
 * @author Level Mapper Team
 */

/**
 * Saves the current grid, player start position, and theme to localStorage
 * @param grid - The current grid state
 * @param playerStart - The player starting position (if any)
 * @param theme - The color theme for the level (if any)
 * @param importLevelIndex - Index of the imported level (if any)
 * @param allLevels - Array of all available levels
 * @returns Updated levels array after save
 */
export const saveGridChanges = (
    grid: number[][],
    playerStart: { x: number; y: number } | null,
    theme: ColorTheme | undefined,
    importLevelIndex: number | null,
    allLevels: ReturnType<typeof getAllLevels>
): ReturnType<typeof getAllLevels> => {
    const dataToSave = { grid, playerStart, theme };
    
    // Save override for specific level if one is imported
    if (importLevelIndex !== null) {
        const lvl = allLevels[importLevelIndex];
        if (lvl) {
            localStorage.setItem(`level_override_${lvl.id}`, JSON.stringify(dataToSave));
            notifyLevelOverridesUpdated();
        }
    }
    
    // Always save to general mapper storage
    localStorage.setItem('levelmapper_grid', JSON.stringify(grid));
    if (playerStart) {
        localStorage.setItem('levelmapper_playerStart', JSON.stringify(playerStart));
    }
    if (theme) {
        localStorage.setItem('levelmapper_theme', theme);
    }
    
    // Reload and return updated levels
    return getAllLevels();
};

const LEVEL_LAYOUT_OVERRIDE_PREFIX = 'level_layout_override_';

export const saveLevelLayoutOverride = (levelId: number, rows: number, cols: number): void => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(`${LEVEL_LAYOUT_OVERRIDE_PREFIX}${levelId}`, JSON.stringify({ rows, cols }));
    } catch {
        // ignore
    }
};

export const loadLevelLayoutOverride = (levelId: number): { rows: number; cols: number } | null => {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(`${LEVEL_LAYOUT_OVERRIDE_PREFIX}${levelId}`);
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== 'object') return null;
        const rows = Number((parsed as any).rows);
        const cols = Number((parsed as any).cols);
        if (!Number.isFinite(rows) || !Number.isFinite(cols)) return null;
        if (!Number.isInteger(rows) || !Number.isInteger(cols)) return null;
        if (rows <= 0 || cols <= 0) return null;
        return { rows, cols };
    } catch {
        return null;
    }
};

/**
 * Exports the current grid as JSON to clipboard
 * @param grid - The grid to export
 * @throws Error if clipboard write fails
 */
export const exportGridToClipboard = async (grid: number[][]): Promise<void> => {
    const txt = JSON.stringify(grid);
    await navigator.clipboard.writeText(txt);
};

/**
 * Loads compare level index from localStorage
 * @returns Saved compare level index or 0 as default
 */
export const loadCompareLevelIndex = (): number => {
    const saved = localStorage.getItem('levelmapper-compare-level');
    return saved ? parseInt(saved, 10) : 0;
};

/**
 * Saves compare level index to localStorage
 * @param index - The level index to save
 */
export const saveCompareLevelIndex = (index: number): void => {
    localStorage.setItem('levelmapper-compare-level', index.toString());
};

/**
 * Loads import level index from localStorage
 * @returns Saved import level index or null
 */
export const loadImportLevelIndex = (): number | null => {
    const saved = localStorage.getItem('levelmapper-import-level');
    return saved ? parseInt(saved, 10) : null;
};

/**
 * Saves import level index to localStorage
 * @param index - The level index to save
 */
export const saveImportLevelIndex = (index: number): void => {
    localStorage.setItem('levelmapper-import-level', index.toString());
};

/**
 * Clears import level from localStorage
 */
export const clearImportLevel = (): void => {
    localStorage.removeItem('levelmapper-import-level');
};
