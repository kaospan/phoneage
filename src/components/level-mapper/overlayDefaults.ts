// Centralized defaults for overlay image scaling in the Level Mapper.
//
// Many captured screenshots have slightly non-square pixels (often a bit taller than wide).
// We treat this as a baseline vertical correction that keeps "100%" feeling like the
// natural, aligned state (instead of forcing users to dial ~96.8% every time).

// Storage schema version for per-level overlay image scale persisted in localStorage.
export const LEVEL_IMAGE_SCALE_STORAGE_VERSION = 2;

// Baseline vertical correction (applied to Y only).
// At user scaleY=1.0 (100%), the effective vertical scale is this baseline.
export const OVERLAY_IMAGE_SCALE_Y_BASE = 0.968;

export const getDefaultOverlayImageScale = (levelId: number) => {
    if (levelId >= 22 && levelId <= 100) {
        return { x: 1, y: 1.15, lock: false as const };
    }

    return { x: 1, y: 1, lock: false as const };
};
