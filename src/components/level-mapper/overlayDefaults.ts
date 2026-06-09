// Centralized defaults for overlay image scaling in the Level Mapper.
//
// Many captured screenshots need a taller vertical axis to line the editable grid up
// with the source image. Treat that correction as the baseline so "100%" is aligned.

// Storage schema version for per-level overlay image scale persisted in localStorage.
export const LEVEL_IMAGE_SCALE_STORAGE_VERSION = 3;

// Baseline vertical correction (applied to Y only).
// At user scaleY=1.0 (100%), the effective vertical scale is this baseline.
export const OVERLAY_IMAGE_SCALE_Y_BASE = 1.15;

// Default user-facing Y stretch used when a level has no saved per-level calibration.
export const DEFAULT_OVERLAY_USER_Y_SCALE = 1;

export const clampOverlayUserScale = (value: number) => (
    Math.max(0.85, Math.min(1.15, value))
);

export const normalizeOverlayUserScaleY = (
    value: number,
    savedBaseY: number | null | undefined,
) => {
    if (!Number.isFinite(value)) return DEFAULT_OVERLAY_USER_Y_SCALE;
    if (!Number.isFinite(Number(savedBaseY)) || Number(savedBaseY) <= 0) {
        return clampOverlayUserScale(value);
    }
    return clampOverlayUserScale((value * Number(savedBaseY)) / OVERLAY_IMAGE_SCALE_Y_BASE);
};

export const getDefaultOverlayImageScale = (levelId: number) => {
    void levelId;
    return { x: 1, y: DEFAULT_OVERLAY_USER_Y_SCALE, lock: false as const };
};
