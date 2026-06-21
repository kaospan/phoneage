import React, { useEffect, useMemo, useRef, useState } from "react";
import { CELL_REFERENCES_UPDATED_EVENT, getCellReferences, type CellReference } from "@/lib/spriteMatching";
import { createBreakableRockTileDataUrl, createClockIconDataUrl, createKeyIconDataUrl, createVortexIconDataUrl } from "@/lib/canvasIcons";
import { isArrowCell } from "@/game/arrows";
import { buildGoalCaveKeySet } from "@/game/caves";
import { referenceSpriteUrls } from "@/data/assetCatalog";
import { detectGridLines } from "@/components/level-mapper/gridDetection";
import { getAlignmentHints } from "@/components/level-mapper/alignmentProfile";
import { normalizeMapperImage } from "@/components/level-mapper/imageNormalization";

type PlayerFacing = "up" | "right" | "down" | "left";

interface GameSprite2DProps {
  grid: number[][];
  atlasSourceGrid?: number[][];
  cavePos: { x: number; y: number };
  levelImageUrl?: string | null;
  playerStart?: { x: number; y: number } | null;
  selectedArrow?: { x: number; y: number } | null;
  selectorPos?: { x: number; y: number } | null;
  players: Array<{ id: string; pos: { x: number; y: number }; facing: PlayerFacing; color: string; isLocal?: boolean }>;
  zoomFactor?: number;
  fullBleed?: boolean;
  onArrowClick?: (x: number, y: number) => void;
  onCancelSelection?: () => void;
}

type LevelSpriteAtlas = {
  tileSprites: Record<number, string>;
  heroFootprintKeys?: Set<string>;
  boardBackground?: string;
  status: string;
  confidence?: number;
};

type LevelSpriteAtlasState = {
  key: string;
  atlas: LevelSpriteAtlas;
};

// Sprite mode atlas building is useful even at moderate confidence; only bail out
// when detection is clearly wrong (e.g. sampling black borders/HUD).
const ATLAS_MIN_CONFIDENCE = 0.08;
const SPRITE_ZOOM_BASELINE_FACTOR = 0.66;
const MAX_CACHED_LEVEL_ATLASES = 12;
const RAW_SCREENSHOT_BACKGROUND_SIZE = "112% 113%";
const levelSpriteAtlasCache = new Map<string, LevelSpriteAtlas>();

const getCachedLevelAtlas = (key: string) => {
  const cached = levelSpriteAtlasCache.get(key);
  if (!cached) return null;
  levelSpriteAtlasCache.delete(key);
  levelSpriteAtlasCache.set(key, cached);
  return cached;
};

const cacheLevelAtlas = (key: string, atlas: LevelSpriteAtlas) => {
  levelSpriteAtlasCache.delete(key);
  levelSpriteAtlasCache.set(key, atlas);
  if (levelSpriteAtlasCache.size <= MAX_CACHED_LEVEL_ATLASES) return;
  const oldestKey = levelSpriteAtlasCache.keys().next().value;
  if (oldestKey) levelSpriteAtlasCache.delete(oldestKey);
};

const waitForAtlasWorkSlot = () => new Promise<void>((resolve) => {
  if (typeof window.requestIdleCallback === "function") {
    window.requestIdleCallback(() => resolve(), { timeout: 250 });
    return;
  }
  window.setTimeout(resolve, 0);
});

const pickLatestByType = (refs: CellReference[]) => {
  const latest = new Map<number, CellReference>();
  for (const ref of refs) {
    const existing = latest.get(ref.tileType);
    if (!existing || ref.timestamp > existing.timestamp) latest.set(ref.tileType, ref);
  }
  return latest;
};

const getStartCaveSpriteFallback = () => {
  // Start cave (18) is a synthetic marker we paint into the grid to show the original spawn tile.
  // It does not exist in the level screenshot (the hero covers a floor tile), so sampling it from
  // the screenshot would capture the hero. Use the built-in cave reference sprite instead.
  return referenceSpriteUrls.cave;
};

const renderArrowVector = (tileType: number) => {
  const shadow = "drop-shadow(0 1px 1px rgba(0,0,0,0.95)) drop-shadow(0 0 4px rgba(0,0,0,0.72))";
  const common = {
    fill: "#f6c84f",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const OneArrow = ({ dir }: { dir: "up" | "right" | "down" | "left" }) => {
    const rotations = {
      up: 0,
      right: 90,
      down: 180,
      left: 270,
    };

    return (
      <g transform={`rotate(${rotations[dir]} 16 16)`}>
        <path d="M12 26 L12 14 L7 14 L16 5 L25 14 L20 14 L20 26 Z" stroke="rgba(16,18,12,0.92)" strokeWidth="4.2" {...common} />
        <path d="M12 26 L12 14 L7 14 L16 5 L25 14 L20 14 L20 26 Z" stroke="#fff8c8" strokeWidth="1.7" {...common} />
      </g>
    );
  };

  const GlyphPath = ({ d, highlight = true }: { d: string; highlight?: boolean }) => (
    <>
      <path d={d} stroke="rgba(16,18,12,0.92)" strokeWidth="4.2" {...common} />
      {highlight && <path d={d} stroke="#fff8c8" strokeWidth="1.7" {...common} />}
    </>
  );

  const doubleVerticalPath = "M16 3 L26 13 L21 13 L21 19 L26 19 L16 29 L6 19 L11 19 L11 13 L6 13 Z";
  const doubleHorizontalPath = "M3 16 L13 6 L13 11 L19 11 L19 6 L29 16 L19 26 L19 21 L13 21 L13 26 Z";
  const omniPath = "M13 13 L13 8 L10 8 L16 2 L22 8 L19 8 L19 13 L24 13 L24 10 L30 16 L24 22 L24 19 L19 19 L19 24 L22 24 L16 30 L10 24 L13 24 L13 19 L8 19 L8 22 L2 16 L8 10 L8 13 Z";

  const shape =
    tileType === 7 ? <OneArrow dir="up" /> :
    tileType === 8 ? <OneArrow dir="right" /> :
    tileType === 9 ? <OneArrow dir="down" /> :
    tileType === 10 ? <OneArrow dir="left" /> :
    tileType === 11 ? <GlyphPath d={doubleVerticalPath} /> :
    tileType === 12 ? <GlyphPath d={doubleHorizontalPath} /> :
    tileType === 13 ? <GlyphPath d={omniPath} /> :
    null;

  if (!shape) return null;

  return (
    <svg
      viewBox="0 0 32 32"
      className="h-[78%] w-[78%]"
      aria-hidden
      style={{ filter: shadow }}
    >
      {shape}
    </svg>
  );
};

const renderHeroFallback = () => (
  <svg
    viewBox="0 0 64 64"
    className="absolute inset-[8%] h-[84%] w-[84%]"
    aria-label="Hero"
    style={{
      filter: "drop-shadow(0 2px 2px rgba(0,0,0,0.95)) drop-shadow(0 0 5px rgba(0,0,0,0.72))",
      imageRendering: "pixelated",
    }}
  >
    <path d="M20 40 L20 32 L25 27 L34 27 L43 32 L47 42 L42 49 L28 49 Z" fill="#10b981" stroke="#063b2a" strokeWidth="4" strokeLinejoin="round" />
    <path d="M39 27 L45 19 L54 19 L58 24 L56 31 L47 31 Z" fill="#12d68a" stroke="#063b2a" strokeWidth="4" strokeLinejoin="round" />
    <path d="M21 36 L10 30 L7 24 L12 27 L24 31 Z" fill="#0a8f61" stroke="#063b2a" strokeWidth="4" strokeLinejoin="round" />
    <path d="M30 47 L27 58 M42 46 L47 57" stroke="#063b2a" strokeWidth="5" strokeLinecap="round" />
    <circle cx="52" cy="23" r="2.2" fill="#f8fafc" />
    <path d="M28 33 L35 33 M30 39 L40 39" stroke="#85f7bf" strokeWidth="3" strokeLinecap="round" opacity="0.75" />
  </svg>
);

export function GameSprite2D({
  grid,
  atlasSourceGrid,
  cavePos,
  levelImageUrl,
  playerStart,
  selectedArrow,
  selectorPos,
  players,
  zoomFactor = 1,
  fullBleed = false,
  onArrowClick,
  onCancelSelection,
}: GameSprite2DProps) {
  const [references, setReferences] = useState<CellReference[]>(() => {
    if (typeof window === "undefined") return [];
    return getCellReferences();
  });
  const [levelAtlasState, setLevelAtlasState] = useState<LevelSpriteAtlasState | null>(null);

  useEffect(() => {
    const refresh = () => setReferences(getCellReferences());
    window.addEventListener(CELL_REFERENCES_UPDATED_EVENT, refresh as EventListener);
    return () => window.removeEventListener(CELL_REFERENCES_UPDATED_EVENT, refresh as EventListener);
  }, []);

  const latestByType = useMemo(() => pickLatestByType(references), [references]);

  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const sourceGrid = atlasSourceGrid ?? grid;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const renderBaselineRef = useRef<{ key: string; grid: number[][] } | null>(null);
  const [availableSize, setAvailableSize] = useState({ width: 0, height: 0 });
  const localPlayer = players.find((p) => p.isLocal) ?? players[0];
  const atlasGrid = useMemo(() => sourceGrid.map((r) => [...r]), [sourceGrid]);
  const goalCaveKeys = useMemo(() => buildGoalCaveKeySet(grid, cavePos), [grid, cavePos]);
  const atlasGoalCaveKeys = useMemo(() => buildGoalCaveKeySet(sourceGrid, cavePos), [sourceGrid, cavePos]);
  const atlasCacheKey = useMemo(
    () => [
      levelImageUrl ?? "no-image",
      `${rows}x${cols}`,
      `${cavePos.x},${cavePos.y}`,
      `${playerStart?.x ?? -1},${playerStart?.y ?? -1}`,
      atlasGrid.map((row) => row.join(",")).join(";"),
    ].join("|"),
    [atlasGrid, cavePos.x, cavePos.y, cols, levelImageUrl, playerStart?.x, playerStart?.y, rows],
  );
  const levelAtlas = levelAtlasState?.key === atlasCacheKey ? levelAtlasState.atlas : null;
  const renderBaselineKey = `${levelImageUrl ?? "no-image"}|${rows}x${cols}|${cavePos.x},${cavePos.y}|${playerStart?.x ?? -1},${playerStart?.y ?? -1}`;
  if (renderBaselineRef.current?.key !== renderBaselineKey) {
    renderBaselineRef.current = {
      key: renderBaselineKey,
      grid: grid.map((row) => [...row]),
    };
  }

  // Mark board edges (modern + readable): a cell is on the edge if it is non-void and
  // at least one 4-neighbor is void or out-of-bounds.
  const edgeMasks = useMemo(() => {
    if (rows <= 0 || cols <= 0) return [];

    const isVoidAt = (x: number, y: number) => {
      if (y < 0 || y >= rows) return true;
      if (x < 0 || x >= cols) return true;
      // Cave is always treated as non-void for edge purposes.
      if (goalCaveKeys.has(`${x},${y}`)) return false;
      return grid[y]?.[x] === 5;
    };

    return grid.map((row, y) =>
      row.map((cell, x) => {
        const tileType = goalCaveKeys.has(`${x},${y}`) ? 3 : cell;
        if (tileType === 5) return null;
        const top = isVoidAt(x, y - 1);
        const right = isVoidAt(x + 1, y);
        const bottom = isVoidAt(x, y + 1);
        const left = isVoidAt(x - 1, y);
        const any = top || right || bottom || left;
        return { top, right, bottom, left, any };
      })
    );
  }, [goalCaveKeys, grid, rows, cols]);

  useEffect(() => {
    let cancelled = false;
    const setCurrentAtlas = (atlas: LevelSpriteAtlas) => {
      setLevelAtlasState({ key: atlasCacheKey, atlas });
    };
    const updateCurrentAtlas = (update: (current: LevelSpriteAtlas | null) => LevelSpriteAtlas) => {
      setLevelAtlasState((current) => ({
        key: atlasCacheKey,
        atlas: update(current?.key === atlasCacheKey ? current.atlas : null),
      }));
    };

    const loadImage = async (url: string): Promise<HTMLImageElement> => {
      return await new Promise((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error(`Failed to load level image: ${url}`));
        img.crossOrigin = "anonymous";
        img.src = url;
      });
    };

    const buildAtlas = async () => {
      if (!levelImageUrl || rows <= 0 || cols <= 0) {
        setLevelAtlasState(null);
        return;
      }

      const cachedAtlas = getCachedLevelAtlas(atlasCacheKey);
      if (cachedAtlas) {
        setCurrentAtlas(cachedAtlas);
        return;
      }

      setCurrentAtlas({
        tileSprites: {},
        status: "Building sprites...",
      });

      // Let React paint the generated board before screenshot normalization and
      // grid detection consume a browser work slot.
      await waitForAtlasWorkSlot();
      if (cancelled) return;

      try {
        // Normalize/crop level screenshots (trim borders + HUD row) so grid detection isn't polluted.
        const normalizedUrl = await normalizeMapperImage(levelImageUrl);
        const img = await loadImage(normalizedUrl);
        if (cancelled) return;

        // Downsample for fast grid detection; scale results back to full-res pixels.
        const maxDim = 1100;
        const scale = Math.min(1, maxDim / Math.max(img.width, img.height));
        const dsW = Math.max(1, Math.round(img.width * scale));
        const dsH = Math.max(1, Math.round(img.height * scale));
        const dsCanvas = document.createElement("canvas");
        dsCanvas.width = dsW;
        dsCanvas.height = dsH;
        const dsCtx = dsCanvas.getContext("2d", { willReadFrequently: true });
        if (!dsCtx) throw new Error("Failed to create detection canvas context");
        dsCtx.imageSmoothingEnabled = false;
        dsCtx.drawImage(img, 0, 0, dsW, dsH);

        const buildAspectGridFallback = () => {
          if (rows <= 0 || cols <= 0) return null;
          const minCellPx = 16;
          if (dsW < cols * minCellPx || dsH < rows * minCellPx) return null;
          const targetAspect = cols / rows;
          const imageAspect = dsW / dsH;
          if (Math.abs(imageAspect - targetAspect) / targetAspect > 0.18) return null;

          const cellWidth = dsW / cols;
          const cellHeight = dsH / rows;
          if (cellWidth <= 0 || cellHeight <= 0) return null;

          return {
            rows,
            cols,
            offsetX: 0,
            offsetY: 0,
            cellWidth,
            cellHeight,
            runLenX: cols + 1,
            runLenY: rows + 1,
            scoreX: 1,
            scoreY: 1,
            confidence: 0.92,
            durationMs: 0,
            usedRunCounts: false,
          };
        };

        const geometryMatchesAspectFallback = (
          candidate: NonNullable<ReturnType<typeof detectGridLines>>,
          fallback: NonNullable<ReturnType<typeof buildAspectGridFallback>>,
        ) => {
          const candidateCellAspect = candidate.cellWidth / Math.max(1, candidate.cellHeight);
          const fallbackCellAspect = fallback.cellWidth / Math.max(1, fallback.cellHeight);
          return Math.abs(candidateCellAspect - fallbackCellAspect) / fallbackCellAspect <= 0.18;
        };

        let usedAspectGridFallback = false;
        let det = detectGridLines(dsCanvas, true, rows, cols, getAlignmentHints());
        const aspectFallback = buildAspectGridFallback();
        if (
          !det ||
          det.confidence < ATLAS_MIN_CONFIDENCE ||
          (aspectFallback && !geometryMatchesAspectFallback(det, aspectFallback))
        ) {
          if (aspectFallback) {
            det = aspectFallback;
            usedAspectGridFallback = true;
          }
        }
        if (!det) {
          updateCurrentAtlas((current) => ({
            tileSprites: current?.tileSprites ?? {},
            heroFootprintKeys: current?.heroFootprintKeys,
            boardBackground: current?.boardBackground,
            status: "Sprite mode: grid detect failed (using reference sprites)",
            confidence: current?.confidence,
          }));
          return;
        }

        const allowAtlas = det.confidence >= ATLAS_MIN_CONFIDENCE;

        const scaleX = img.width / dsW;
        const scaleY = img.height / dsH;
        let offsetX = Math.max(0, Math.round(det.offsetX * scaleX));
        let offsetY = Math.max(0, Math.round(det.offsetY * scaleY));
        let cellW = Math.max(1, Math.round(det.cellWidth * scaleX));
        let cellH = Math.max(1, Math.round(det.cellHeight * scaleY));
        let frameW = Math.max(1, Math.round(det.cellWidth * cols * scaleX));
        let frameH = Math.max(1, Math.round(det.cellHeight * rows * scaleY));
        let frameFitsImage = offsetX + frameW <= img.width + 2 && offsetY + frameH <= img.height + 2;
        if (!frameFitsImage && !usedAspectGridFallback) {
          if (aspectFallback) {
            det = aspectFallback;
            usedAspectGridFallback = true;
            offsetX = Math.max(0, Math.round(det.offsetX * scaleX));
            offsetY = Math.max(0, Math.round(det.offsetY * scaleY));
            cellW = Math.max(1, Math.round(det.cellWidth * scaleX));
            cellH = Math.max(1, Math.round(det.cellHeight * scaleY));
            frameW = Math.max(1, Math.round(det.cellWidth * cols * scaleX));
            frameH = Math.max(1, Math.round(det.cellHeight * rows * scaleY));
            frameFitsImage = offsetX + frameW <= img.width + 2 && offsetY + frameH <= img.height + 2;
          }
        }
        if (!frameFitsImage) {
          updateCurrentAtlas((current) => ({
            tileSprites: current?.tileSprites ?? {},
            heroFootprintKeys: current?.heroFootprintKeys,
            boardBackground: undefined,
            status: "Sprite mode: rejected bad screenshot crop (using reference sprites)",
            confidence: det.confidence,
          }));
          return;
        }

        // Draw full-res source once.
        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = img.width;
        srcCanvas.height = img.height;
        const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
        if (!srcCtx) throw new Error("Failed to create sprite canvas context");
        srcCtx.imageSmoothingEnabled = false;
        srcCtx.drawImage(img, 0, 0);

        const boardCanvas = document.createElement("canvas");
        boardCanvas.width = frameW;
        boardCanvas.height = frameH;
        const boardCtx = boardCanvas.getContext("2d");
        if (boardCtx) {
          boardCtx.imageSmoothingEnabled = false;
          boardCtx.drawImage(srcCanvas, offsetX, offsetY, frameW, frameH, 0, 0, frameW, frameH);
        }
        const boardBackground = boardCtx ? boardCanvas.toDataURL("image/png") : undefined;

        const sampleByType = new Map<number, { row: number; col: number }>();
        if (allowAtlas) {
          for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
              const raw = atlasGrid[r]?.[c];
              if (raw === undefined) continue;
              const tileType = atlasGoalCaveKeys.has(`${c},${r}`) ? 3 : raw;
              // Start cave (18) is synthetic; never sample it from the screenshot or we'll capture the hero.
              if (tileType === 18) continue;
              if (!sampleByType.has(tileType)) sampleByType.set(tileType, { row: r, col: c });
            }
          }
        }

        const inset = Math.max(1, Math.round(Math.min(cellW, cellH) * 0.03));
        const outW = 64;
        const outH = 64;

        const cropSourceRect = (sxRaw: number, syRaw: number, sw: number, sh: number) => {
          const sx = Math.max(0, Math.min(srcCanvas.width - sw, sxRaw));
          const sy = Math.max(0, Math.min(srcCanvas.height - sh, syRaw));
          const out = document.createElement("canvas");
          out.width = outW;
          out.height = outH;
          const outCtx = out.getContext("2d");
          if (!outCtx) return null;
          outCtx.imageSmoothingEnabled = false;
          outCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outW, outH);
          return out;
        };

        const cropCell = (row: number, col: number, insetPx = inset, shiftX = 0, shiftY = 0) => {
          const sw = Math.max(1, cellW - insetPx * 2);
          const sh = Math.max(1, cellH - insetPx * 2);
          return cropSourceRect(
            offsetX + col * cellW + insetPx + shiftX,
            offsetY + row * cellH + insetPx + shiftY,
            sw,
            sh,
          );
        };

        const tileSprites: Record<number, string> = {};
        let floorCanvasForSanity: HTMLCanvasElement | null = null;
        let sampledAtlasReliable = true;
        sampleByType.forEach((pos, tileType) => {
          const canvas = cropCell(pos.row, pos.col);
          if (!canvas) return;
          if (tileType === 0) floorCanvasForSanity = canvas;
          tileSprites[tileType] = canvas.toDataURL("image/png");
        });

        // Sanity check: if "floor" is mostly black, we're probably sampling borders/HUD due to bad offset.
        if (floorCanvasForSanity) {
          const ctx = floorCanvasForSanity.getContext("2d", { willReadFrequently: true });
          if (ctx) {
            const data = ctx.getImageData(0, 0, outW, outH).data;
            let sum = 0;
            let nearBlack = 0;
            const total = outW * outH;
            for (let i = 0; i < data.length; i += 4) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              const l = 0.2126 * r + 0.7152 * g + 0.0722 * b;
              sum += l;
              if (l < 12) nearBlack += 1;
            }
            const mean = sum / Math.max(1, total);
            const blackFrac = nearBlack / Math.max(1, total);
            if (mean < 28 && blackFrac > 0.55) {
              sampledAtlasReliable = false;
            }
          }
        }

        const heroFootprintKeys = new Set<string>();
        if (playerStart && playerStart.x >= 0 && playerStart.x < cols && playerStart.y >= 0 && playerStart.y < rows) {
          heroFootprintKeys.add(`${playerStart.x},${playerStart.y}`);
          if (playerStart.y > 0) heroFootprintKeys.add(`${playerStart.x},${playerStart.y - 1}`);
        }

        const atlas = {
          tileSprites: sampledAtlasReliable ? tileSprites : {},
          heroFootprintKeys,
          boardBackground,
          status: !sampledAtlasReliable
            ? `Sprites ready (screenshot base; tile atlas rejected at conf ${det.confidence.toFixed(2)})`
            : usedAspectGridFallback
            ? "Sprites ready (aspect grid fallback)"
            : allowAtlas
            ? `Sprites ready (conf ${det.confidence.toFixed(2)})`
            : `Sprite mode: low grid confidence (conf ${det.confidence.toFixed(2)}) - using reference sprites`,
          confidence: det.confidence,
        };
        cacheLevelAtlas(atlasCacheKey, atlas);
        setCurrentAtlas(atlas);
      } catch (e) {
        console.error(e);
        updateCurrentAtlas((current) => ({
          tileSprites: current?.tileSprites ?? {},
          heroFootprintKeys: current?.heroFootprintKeys,
          boardBackground: current?.boardBackground,
          status: "Sprite mode: failed to build sprites (using reference sprites)",
          confidence: current?.confidence,
        }));
      }
    };

    void buildAtlas();

    return () => {
      cancelled = true;
    };
  }, [levelImageUrl, rows, cols, atlasGoalCaveKeys, atlasGrid, atlasCacheKey, playerStart, sourceGrid]);

  const scale = useMemo(() => {
    // Match gameplay zoom semantics: 0.66 was the old 152% view and is now 100%.
    return Math.max(0.55, Math.min(1.5, SPRITE_ZOOM_BASELINE_FACTOR / Math.max(0.01, zoomFactor)));
  }, [zoomFactor]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;

    const updateSize = () => {
      const rect = node.getBoundingClientRect();
      setAvailableSize({
        width: Math.max(0, Math.floor(rect.width)),
        height: Math.max(0, Math.floor(rect.height)),
      });
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const boardSize = useMemo(() => {
    if (rows <= 0 || cols <= 0 || availableSize.width <= 0 || availableSize.height <= 0) {
      return { width: 0, height: 0 };
    }

    const aspect = cols / rows;
    const frameInset = fullBleed ? 0 : 16;
    const maxWidth = Math.max(1, availableSize.width - frameInset);
    const maxHeight = Math.max(1, availableSize.height - frameInset);
    const fitWidth = Math.min(maxWidth, maxHeight * aspect);
    const width = Math.max(cols, Math.floor(fitWidth * scale));
    return {
      width,
      height: Math.max(rows, Math.floor(width / aspect)),
    };
  }, [availableSize.height, availableSize.width, cols, fullBleed, rows, scale]);

  const teleportFallbackUrl = useMemo(() => {
    return createVortexIconDataUrl(32);
  }, []);

  const redKeyFallbackUrl = useMemo(() => {
    return createKeyIconDataUrl(32, {
      accent: "rgba(239,68,68,0.98)",
      glow: "rgba(239,68,68,0.18)",
    });
  }, []);

  const greenKeyFallbackUrl = useMemo(() => {
    return createKeyIconDataUrl(32, {
      accent: "rgba(34,197,94,0.98)",
      glow: "rgba(34,197,94,0.18)",
    });
  }, []);

  const bonusTimeFallbackUrl = useMemo(() => {
    return createClockIconDataUrl(32, { glow: "rgba(239,68,68,0.18)" });
  }, []);

  const breakableRockFallbackUrl = useMemo(() => {
    return createBreakableRockTileDataUrl(64);
  }, []);

  const startCaveFallbackUrl = useMemo(() => getStartCaveSpriteFallback(), []);
  const startCaveSpriteUrl = levelAtlas?.tileSprites?.[3] ?? startCaveFallbackUrl;
  const goalCaveFallbackUrl = useMemo(() => referenceSpriteUrls.cave, []);
  const processedBoardBackgroundUrl = levelAtlas?.boardBackground ?? null;
  const boardBackgroundUrl = processedBoardBackgroundUrl ?? levelImageUrl ?? null;
  const hasProcessedBoard = Boolean(processedBoardBackgroundUrl);
  const useScreenshotBase = Boolean(boardBackgroundUrl);
  const screenshotHeroCropStyle =
    useScreenshotBase && boardBackgroundUrl && playerStart && playerStart.x >= 0 && playerStart.y >= 0
      ? {
          backgroundImage: `url(${boardBackgroundUrl})`,
          backgroundRepeat: "no-repeat",
          backgroundPosition: `${cols > 1 ? (playerStart.x / (cols - 1)) * 100 : 0}% ${rows > 1 ? (playerStart.y / (rows - 1)) * 100 : 0}%`,
          backgroundSize: `${cols * 100}% ${rows * 100}%`,
          imageRendering: "pixelated" as const,
        }
      : null;
  const allowGeneratedFallback = !useScreenshotBase;

  return (
    <div
      ref={containerRef}
      className={[
        "w-full h-full flex overflow-hidden touch-none select-none",
        "items-center justify-center",
      ].join(" ")}
      style={{
        backgroundColor: "black",
      }}
      onClick={() => onCancelSelection?.()}
    >
      <div
        className={[
          fullBleed ? "border-0 shadow-none rounded-none" : "rounded-xl border border-border/40 shadow-lg",
          "relative bg-transparent",
        ].join(" ")}
        style={{
          width: boardSize.width > 0 ? `${boardSize.width}px` : undefined,
          height: boardSize.height > 0 ? `${boardSize.height}px` : undefined,
          maxWidth: scale <= 1 ? "100%" : undefined,
          maxHeight: scale <= 1 ? "100%" : undefined,
        }}
      >
        <div
          data-sprite-status={levelAtlas?.status ?? "no-atlas"}
          data-sprite-has-board={boardBackgroundUrl ? "1" : "0"}
          data-sprite-has-hero={levelAtlas?.heroSprite ? "1" : "0"}
          className={[
            "grid gap-0",
            fullBleed ? "rounded-none" : "rounded-lg",
          ].join(" ")}
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            width: "100%",
            height: "100%",
            backgroundColor: "black",
            backgroundImage: boardBackgroundUrl ? `url(${boardBackgroundUrl})` : undefined,
            backgroundRepeat: "no-repeat",
            backgroundPosition: hasProcessedBoard ? "center" : "center top",
            backgroundSize: hasProcessedBoard ? "100% 100%" : "112% 113%",
            imageRendering: "pixelated",
            boxShadow: useScreenshotBase || !allowGeneratedFallback
              ? undefined
              : "inset 0 0 0 3px rgba(0,0,0,0.92), 0 0 0 1px rgba(255,255,255,0.08)",
          }}
        >
          {grid.map((row, y) =>
            row.map((cell, x) => {
              const isCave = goalCaveKeys.has(`${x},${y}`);
              const isPlayer = localPlayer?.pos.x === x && localPlayer?.pos.y === y;
              const isPlayerAtScreenshotStart =
                Boolean(
                  isPlayer &&
                  useScreenshotBase &&
                  playerStart &&
                  playerStart.x === x &&
                  playerStart.y === y
                );
              const suppressPlayerOverlay =
                isPlayer && useScreenshotBase && isPlayerAtScreenshotStart;
              const tileType = isCave ? 3 : cell;
              // If the player is standing on the start-marker cave (18), render the base tile as floor
              // so the cave appears only after the hero moves off the spawn tile (nostalgia behavior).
              const displayTileType = isPlayer && tileType === 18 ? 0 : tileType;
              const isArrow = isArrowCell(cell) || cell === 11 || cell === 12 || cell === 13;
              const isSelected = selectedArrow?.x === x && selectedArrow?.y === y;
              const isSelector = selectorPos?.x === x && selectorPos?.y === y;
              const edge = edgeMasks?.[y]?.[x] ?? null;
              const isDirectionalArrowTile = displayTileType >= 7 && displayTileType <= 13;
              // Keep arrow hidden while the player occupies that tile (DOS behavior feel).
              const effectiveTileType =
                isPlayer && isDirectionalArrowTile && !useScreenshotBase ? 0 : displayTileType;
              const effectiveIsArrow = effectiveTileType >= 7 && effectiveTileType <= 13;
              const originalTileType = atlasGoalCaveKeys.has(`${x},${y}`) ? 3 : (sourceGrid[y]?.[x] ?? tileType);
              const baselineTileType = goalCaveKeys.has(`${x},${y}`)
                ? 3
                : (renderBaselineRef.current?.grid[y]?.[x] ?? originalTileType);
              const originalIsArrow = originalTileType >= 7 && originalTileType <= 13;
              const hasMovedOffScreenshotStart =
                Boolean(
                  useScreenshotBase &&
                  playerStart &&
                  localPlayer &&
                  (localPlayer.pos.x !== playerStart.x || localPlayer.pos.y !== playerStart.y)
                );
              const heroFootprintNeedsCleanup =
                Boolean(
                  hasMovedOffScreenshotStart &&
                  levelAtlas?.heroFootprintKeys?.has(`${x},${y}`)
                );
              const playerStartNeedsCleanup =
                Boolean(
                  playerStart &&
                  playerStart.x === x &&
                  playerStart.y === y &&
                  localPlayer &&
                  (localPlayer.pos.x !== x || localPlayer.pos.y !== y)
                ) || heroFootprintNeedsCleanup;
              const tileChangedFromScreenshot = effectiveTileType !== baselineTileType;
              const shouldPaintStaticTile =
                !suppressPlayerOverlay && (
                  useScreenshotBase
                    ? tileChangedFromScreenshot || playerStartNeedsCleanup
                    : allowGeneratedFallback
                );

              const atlasSprite = levelAtlas?.tileSprites?.[effectiveTileType];
              const refSprite = latestByType.get(effectiveTileType)?.imageData;
              const canUseRefSprite = effectiveTileType !== 5;
              const staticTileBackgroundImage =
                  effectiveTileType === 18 ? (startCaveSpriteUrl ? `url(${startCaveSpriteUrl})` : undefined) :
                  effectiveTileType === 3 && goalCaveFallbackUrl ? `url(${goalCaveFallbackUrl})` :
                  effectiveTileType === 6 && breakableRockFallbackUrl ? `url(${breakableRockFallbackUrl})` :
                  atlasSprite ? `url(${atlasSprite})` :
                  (canUseRefSprite && refSprite) ? `url(${refSprite})` :
                  effectiveTileType === 14 && redKeyFallbackUrl ? `url(${redKeyFallbackUrl})` :
                  effectiveTileType === 15 && greenKeyFallbackUrl ? `url(${greenKeyFallbackUrl})` :
                  effectiveTileType === 19 && teleportFallbackUrl ? `url(${teleportFallbackUrl})` :
                  effectiveTileType === 20 && bonusTimeFallbackUrl ? `url(${bonusTimeFallbackUrl})` :
                  undefined;
              const backgroundImage = shouldPaintStaticTile ? staticTileBackgroundImage : undefined;
              const arrowVector =
                effectiveIsArrow && !isPlayer && shouldPaintStaticTile && !backgroundImage
                  ? renderArrowVector(effectiveTileType)
                  : null;

              const fallback =
                !shouldPaintStaticTile ? "transparent" :
                effectiveTileType === 5 ? "black" :
                effectiveTileType === 0 ? "rgba(255,255,255,0.08)" :
                effectiveTileType === 4 ? "rgba(30,144,255,0.55)" :
                effectiveTileType === 1 ? "rgba(255,80,80,0.65)" :
                effectiveTileType === 2 ? "rgba(120,85,60,0.75)" :
                effectiveTileType === 6 ? "rgba(160,155,140,0.80)" :
                effectiveTileType === 14 ? "rgba(255,70,70,0.70)" :
                effectiveTileType === 15 ? "rgba(60,210,120,0.70)" :
                effectiveTileType === 16 ? "rgba(150,20,20,0.80)" :
                effectiveTileType === 17 ? "rgba(20,110,35,0.80)" :
                effectiveTileType === 18 ? "rgba(0,0,0,0.88)" :
                effectiveTileType === 20 ? "rgba(251,191,36,0.78)" :
                effectiveIsArrow ? "rgba(160,120,80,0.88)" :
                "rgba(255,255,255,0.06)";

              return (
                <div
                  key={`${x}-${y}`}
                  className={[
                    "relative min-h-0 min-w-0 overflow-hidden",
                    isArrow ? "cursor-pointer hover:brightness-110" : "",
                    isSelected ? "ring-2 ring-white" : "",
                    isSelector ? "ring-2 ring-emerald-300" : "",
                  ].join(" ")}
                  style={{
                    backgroundColor: backgroundImage ? undefined : fallback,
                    backgroundImage,
                    backgroundSize: "cover",
                    backgroundPosition: "center",
                    imageRendering: "pixelated",
                    boxShadow:
                      allowGeneratedFallback && !useScreenshotBase && !backgroundImage && displayTileType === 0 ? "inset 0 0 0 1px rgba(75,85,99,0.9)" :
                      undefined,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isArrow) onArrowClick?.(x, y);
                  }}
                  title={`Tile ${tileType}`}
                >
                  {edge?.any && allowGeneratedFallback && !useScreenshotBase && (
                    <div
                      className="pointer-events-none absolute inset-0"
                      style={{
                        borderTop: edge.top ? "2px solid rgba(15,23,42,0.55)" : undefined,
                        borderRight: edge.right ? "2px solid rgba(15,23,42,0.55)" : undefined,
                        borderBottom: edge.bottom ? "2px solid rgba(15,23,42,0.55)" : undefined,
                        borderLeft: edge.left ? "2px solid rgba(15,23,42,0.55)" : undefined,
                        boxShadow: "0 0 0 1px rgba(15,23,42,0.18)",
                        borderRadius: 6,
                      }}
                    />
                  )}
                  {isPlayer && !isPlayerAtScreenshotStart && !suppressPlayerOverlay && (
                    useScreenshotBase ? renderHeroFallback() : levelAtlas?.heroSprite ? (
                      <img
                        src={levelAtlas.heroSprite}
                        alt="Hero"
                        className="absolute inset-0 h-full w-full"
                        style={{ imageRendering: "pixelated" }}
                        draggable={false}
                      />
                    ) : screenshotHeroCropStyle ? (
                      <div
                        aria-label="Hero"
                        className="absolute inset-0 h-full w-full"
                        style={screenshotHeroCropStyle}
                      />
                    ) : renderHeroFallback()
                  )}
                  {arrowVector && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      {arrowVector}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
