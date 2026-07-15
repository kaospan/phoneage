// Persists which camera view-modes the main game's view-cycle button should skip.
// Shared localStorage format with PuzzleGame.tsx's own disabledViewModes state, so a toggle
// flipped here (e.g. from the Mapper) takes effect in the game without any extra plumbing.
const DISABLED_VIEW_MODES_KEY = 'stone-age-disabled-view-modes';
export const CAMERA_VIEW_MODES = ['3d', 'fps'] as const;

const readDisabledViewModes = (): string[] => {
    if (typeof window === 'undefined') return [];
    try {
        const stored = localStorage.getItem(DISABLED_VIEW_MODES_KEY);
        if (!stored) return [];
        const parsed = JSON.parse(stored) as unknown;
        return Array.isArray(parsed) ? parsed.filter((m): m is string => typeof m === 'string') : [];
    } catch {
        return [];
    }
};

const writeDisabledViewModes = (modes: string[]): void => {
    if (typeof window === 'undefined') return;
    try {
        localStorage.setItem(DISABLED_VIEW_MODES_KEY, JSON.stringify(modes));
    } catch {
        // ignore storage failures
    }
};

export const getCameraModesSkipped = (): boolean => {
    const disabled = new Set(readDisabledViewModes());
    return CAMERA_VIEW_MODES.every((mode) => disabled.has(mode));
};

export const setCameraModesSkipped = (skip: boolean): void => {
    const disabled = new Set(readDisabledViewModes());
    for (const mode of CAMERA_VIEW_MODES) {
        if (skip) disabled.add(mode);
        else disabled.delete(mode);
    }
    writeDisabledViewModes(Array.from(disabled));
};
