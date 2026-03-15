import { getAllLevels, type ColorTheme } from '@/data/levels';
import { voidGrid } from '@/lib/levelgrid';
import { normalizeMapperImage } from './imageNormalization';
import { getLevelImageUrl } from './levelImageStore';
import { getDefaultOverlayImageScale } from './overlayDefaults';
import { trimDetectedDosFooterBottomRow } from './footerGridTrim';
import {
  loadLevelImageScale,
  loadLevelLayoutOverride,
  loadLevelMapperDraft,
  loadLevelMapperSavedState,
} from './persistenceOperations';

type MapperLevel = ReturnType<typeof getAllLevels>[number];

export interface ResolvedLevelMapperBaseline {
  levelId: number;
  rows: number;
  cols: number;
  grid: number[][];
  playerStart: { x: number; y: number } | null;
  theme: ColorTheme | undefined;
  timeLimitSeconds: number | null;
  hourglassBonusByCell: Record<string, number>;
  imageURL: string | null;
  overlayEnabled: boolean;
  overlayOpacity: number;
  overlayStretch: boolean;
  imageScaleX: number;
  imageScaleY: number;
  imageOffsetX: number;
  imageOffsetY: number;
  lockImageAspect: boolean;
  zoom: number;
  gridOffsetX: number;
  gridOffsetY: number;
  gridFrameWidth: number | null;
  gridFrameHeight: number | null;
  shouldRestoreDraft: boolean;
}

const isPlaceholderGrid = (levelGrid?: number[][]) => {
  if (!levelGrid || levelGrid.length === 0) return true;
  if (levelGrid.length === 1 && levelGrid[0]?.length === 1 && levelGrid[0][0] === 5) return true;
  return levelGrid.every((row) => row.every((cell) => cell === 5));
};

const cloneGrid = (grid: number[][]) => grid.map((row) => [...row]);

const sanitizeTimeLimit = (value: number | null | undefined) => {
  if (value == null || !Number.isFinite(value)) return null;
  const rounded = Math.max(0, Math.round(value));
  return rounded > 0 ? rounded : null;
};

export const resolveLevelMapperBaseline = async (
  level: MapperLevel,
): Promise<ResolvedLevelMapperBaseline> => {
  const storedUpload = await getLevelImageUrl(level.id);
  const normalizedURL = storedUpload ?? (level.image ? await normalizeMapperImage(level.image) : null);
  const savedState = loadLevelMapperSavedState(level.id);
  const draft = loadLevelMapperDraft(level.id);

  if (savedState) {
    const normalizedSavedState = trimDetectedDosFooterBottomRow(
      {
        ...savedState,
        grid: cloneGrid(savedState.grid),
        playerStart: savedState.playerStart ? { ...savedState.playerStart } : null,
        hourglassBonusByCell: { ...(savedState.hourglassBonusByCell ?? {}) },
      },
      normalizedURL
    );
    return {
      levelId: level.id,
      rows: normalizedSavedState.rows,
      cols: normalizedSavedState.cols,
      grid: cloneGrid(normalizedSavedState.grid),
      playerStart: normalizedSavedState.playerStart ? { ...normalizedSavedState.playerStart } : null,
      theme: normalizedSavedState.theme,
      timeLimitSeconds: sanitizeTimeLimit(normalizedSavedState.timeLimitSeconds),
      hourglassBonusByCell: { ...(normalizedSavedState.hourglassBonusByCell ?? {}) },
      imageURL: normalizedURL,
      overlayEnabled: normalizedSavedState.overlayEnabled ?? Boolean(normalizedURL),
      overlayOpacity:
        Number.isFinite(Number(normalizedSavedState.overlayOpacity))
          ? Math.max(0, Math.min(1, Number(normalizedSavedState.overlayOpacity)))
          : 0.5,
      overlayStretch: Boolean(normalizedSavedState.overlayStretch ?? true),
      imageScaleX:
        Number.isFinite(Number(normalizedSavedState.imageScaleX))
          ? Math.max(0.85, Math.min(1.15, Number(normalizedSavedState.imageScaleX)))
          : 1,
      imageScaleY:
        Number.isFinite(Number(normalizedSavedState.imageScaleY))
          ? Math.max(0.85, Math.min(1.15, Number(normalizedSavedState.imageScaleY)))
          : 1,
      imageOffsetX:
        Number.isFinite(Number(normalizedSavedState.imageOffsetX)) ? Math.max(0, Number(normalizedSavedState.imageOffsetX)) : 0,
      imageOffsetY:
        Number.isFinite(Number(normalizedSavedState.imageOffsetY)) ? Math.max(0, Number(normalizedSavedState.imageOffsetY)) : 0,
      lockImageAspect: Boolean(normalizedSavedState.lockImageAspect ?? true),
      zoom: Number.isFinite(Number(normalizedSavedState.zoom)) ? Math.max(0.2, Math.min(6, Number(normalizedSavedState.zoom))) : 1,
      gridOffsetX: Number.isFinite(Number(normalizedSavedState.gridOffsetX)) ? Number(normalizedSavedState.gridOffsetX) : 0,
      gridOffsetY: Number.isFinite(Number(normalizedSavedState.gridOffsetY)) ? Number(normalizedSavedState.gridOffsetY) : 0,
      gridFrameWidth:
        normalizedSavedState.gridFrameWidth == null || !Number.isFinite(Number(normalizedSavedState.gridFrameWidth))
          ? null
          : Math.max(1, Number(normalizedSavedState.gridFrameWidth)),
      gridFrameHeight:
        normalizedSavedState.gridFrameHeight == null || !Number.isFinite(Number(normalizedSavedState.gridFrameHeight))
          ? null
          : Math.max(1, Number(normalizedSavedState.gridFrameHeight)),
      shouldRestoreDraft: Boolean(draft && (draft.updatedAt ?? 0) > (normalizedSavedState.updatedAt ?? 0)),
    };
  }

  const layout = level.autoBuild && isPlaceholderGrid(level.grid)
    ? loadLevelLayoutOverride(level.id) ?? { rows: 12, cols: 20 }
    : null;
  const editableGrid =
    level.autoBuild && isPlaceholderGrid(level.grid)
      ? voidGrid(layout?.rows ?? 12, layout?.cols ?? 20)
      : cloneGrid(level.grid);
  const savedScale = loadLevelImageScale(level.id);
  const defaultScale = getDefaultOverlayImageScale(level.id);
  const normalizedFallback = trimDetectedDosFooterBottomRow(
    {
      rows: editableGrid.length,
      cols: editableGrid[0]?.length ?? 0,
      grid: editableGrid,
      playerStart: level.playerStart ? { ...level.playerStart } : null,
      hourglassBonusByCell: { ...(level.hourglassBonusByCell ?? {}) },
    },
    normalizedURL
  );

  return {
    levelId: level.id,
    rows: normalizedFallback.rows,
    cols: normalizedFallback.cols,
    grid: normalizedFallback.grid,
    playerStart: normalizedFallback.playerStart ? { ...normalizedFallback.playerStart } : null,
    theme: level.theme,
    timeLimitSeconds: sanitizeTimeLimit(level.timeLimitSeconds ?? null),
    hourglassBonusByCell: { ...(normalizedFallback.hourglassBonusByCell ?? {}) },
    imageURL: normalizedURL,
    overlayEnabled: Boolean(normalizedURL),
    overlayOpacity: 0.5,
    overlayStretch: true,
    imageScaleX: savedScale?.x ?? defaultScale.x,
    imageScaleY: savedScale?.y ?? defaultScale.y,
    imageOffsetX: Number((savedScale as { offsetX?: number } | null)?.offsetX ?? 0),
    imageOffsetY: Number((savedScale as { offsetY?: number } | null)?.offsetY ?? 0),
    lockImageAspect: savedScale?.lock ?? defaultScale.lock,
    zoom: 1,
    gridOffsetX: 0,
    gridOffsetY: 0,
    gridFrameWidth: null,
    gridFrameHeight: null,
    shouldRestoreDraft: Boolean(draft),
  };
};
