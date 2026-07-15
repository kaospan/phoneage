import { VIEW_MODES, type ViewMode } from '@/components/PuzzleGame';

// Persists which camera view-modes the main game's view-cycle button should skip.
// Shared localStorage format with PuzzleGame.tsx's own disabledViewModes state, so a toggle
// flipped here (e.g. from the Mapper) takes effect in the game without any extra plumbing.
const DISABLED_VIEW_MODES_KEY = 'stone-age-disabled-view-modes';

export { VIEW_MODES };
export type { ViewMode };

const readDisabledViewModes = (): ViewMode[] => {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(DISABLED_VIEW_MODES_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored) as unknown;
        if (!Array.isArray(parsed)) return [];
        return parsed.filter((m): m is ViewMode => (VIEW_MODES as readonly string[]).includes(m as string));
    } catch {
        return [];
    }
};

const writeDisabledViewModes = (modes: ViewMode[]): void => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(DISABLED_VIEW_MODES_KEY, JSON.stringify(modes));
    } catch {
        // ignore storage failures
    }
};

export const getDisabledViewModes = (): ViewMode[] => readDisabledViewModes();

export const isViewModeSkipped = (mode: ViewMode): boolean => readDisabledViewModes().includes(mode);

export const setViewModeSkipped = (mode: ViewMode, skip: boolean): void => {
    const disabled = new Set(readDisabledViewModes());
    if (skip) disabled.add(mode);
    else disabled.delete(mode);
    writeDisabledViewModes(Array.from(disabled));
};
