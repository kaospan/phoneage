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
  showCoords?: boolean;
  fullBleed?: boolean;
  onArrowClick?: (x: number, y: number) => void;
  onCancelSelection?: () => void;
}

type LevelSpriteAtlas = {
  tileSprites: Record<number, string>;
  heroSprite?: string;
  boardBackground?: string;
  status: string;
  confidence?: number;
};

// Sprite mode atlas building is useful even at moderate confidence; only bail out
// when detection is clearly wrong (e.g. sampling black borders/HUD).
const ATLAS_MIN_CONFIDENCE = 0.08;

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

const measureDinoCrop = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return { greenPixels: 0, width: 0, height: 0, minX: 0, minY: 0, maxX: -1, maxY: -1 };

  const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
  let greenPixels = 0;
  let minX = canvas.width;
  let minY = canvas.height;
  let maxX = -1;
  let maxY = -1;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i];
    const g = data[i + 1];
    const b = data[i + 2];
    if (g > 70 && g - r > 24 && g - b > 18) {
      const pixel = i / 4;
      const x = pixel % canvas.width;
      const y = Math.floor(pixel / canvas.width);
      greenPixels += 1;
      minX = Math.min(minX, x);
      minY = Math.min(minY, y);
      maxX = Math.max(maxX, x);
      maxY = Math.max(maxY, y);
    }
  }

  return {
    greenPixels,
    width: maxX >= minX ? maxX - minX + 1 : 0,
    height: maxY >= minY ? maxY - minY + 1 : 0,
    minX,
    minY,
    maxX,
    maxY,
  };
};

const scoreDinoCrop = (canvas: HTMLCanvasElement) => measureDinoCrop(canvas).greenPixels;

const hasUsableDinoShape = (canvas: HTMLCanvasElement, minPixels: number) => {
  const measurement = measureDinoCrop(canvas);
  const total = Math.max(1, canvas.width * canvas.height);
  const greenFraction = measurement.greenPixels / total;
  const edgeTouches = [
    measurement.minX <= 1,
    measurement.minY <= 1,
    measurement.maxX >= canvas.width - 2,
    measurement.maxY >= canvas.height - 2,
  ].filter(Boolean).length;
  return (
    measurement.greenPixels >= minPixels &&
    greenFraction <= 0.18 &&
    edgeTouches < 2 &&
    measurement.width >= Math.round(canvas.width * 0.14) &&
    measurement.height >= Math.round(canvas.height * 0.18)
  );
};

const createDinoSilhouetteCanvas = (canvas: HTMLCanvasElement) => {
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  const { width, height } = canvas;
  const image = ctx.getImageData(0, 0, width, height);
  const pixels = image.data;
  const greenMask = new Uint8Array(width * height);
  let greenPixels = 0;

  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    if (g > 58 && g - r > 18 && g - b > 14) {
      greenMask[p] = 1;
      greenPixels += 1;
    }
  }

  if (greenPixels < Math.round(width * height * 0.01)) return null;

  const keepMask = new Uint8Array(width * height);
  const radius = 4;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = y * width + x;
      if (!greenMask[index]) continue;

      for (let dy = -radius; dy <= radius; dy += 1) {
        const yy = y + dy;
        if (yy < 0 || yy >= height) continue;
        for (let dx = -radius; dx <= radius; dx += 1) {
          const xx = x + dx;
          if (xx < 0 || xx >= width) continue;
          if (dx * dx + dy * dy > radius * radius) continue;
          keepMask[yy * width + xx] = 1;
        }
      }
    }
  }

  const out = document.createElement("canvas");
  out.width = width;
  out.height = height;
  const outCtx = out.getContext("2d");
  if (!outCtx) return null;

  const outImage = outCtx.createImageData(width, height);
  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    if (!keepMask[p]) {
      outImage.data[i + 3] = 0;
      continue;
    }

    outImage.data[i] = pixels[i];
    outImage.data[i + 1] = pixels[i + 1];
    outImage.data[i + 2] = pixels[i + 2];
    outImage.data[i + 3] = pixels[i + 3];
  }

  outCtx.putImageData(outImage, 0, 0);
  return out;
};

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
  showCoords = false,
  fullBleed = false,
  onArrowClick,
  onCancelSelection,
}: GameSprite2DProps) {
  const [references, setReferences] = useState<CellReference[]>(() => {
    if (typeof window === "undefined") return [];
    return getCellReferences();
  });
  const [levelAtlas, setLevelAtlas] = useState<LevelSpriteAtlas | null>(null);

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
  const [availableSize, setAvailableSize] = useState({ width: 0, height: 0 });
  const localPlayer = players.find((p) => p.isLocal) ?? players[0];
  const atlasGrid = useMemo(() => sourceGrid.map((r) => [...r]), [sourceGrid]);
  const goalCaveKeys = useMemo(() => buildGoalCaveKeySet(grid, cavePos), [grid, cavePos]);
  const atlasGoalCaveKeys = useMemo(() => buildGoalCaveKeySet(sourceGrid, cavePos), [sourceGrid, cavePos]);

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
        setLevelAtlas(null);
        return;
      }

      setLevelAtlas((prev) => ({
        tileSprites: prev?.tileSprites ?? {},
        heroSprite: undefined,
        boardBackground: undefined,
        status: "Building sprites...",
        confidence: prev?.confidence,
      }));

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

        const buildDosGridFallback = () => {
          if (rows !== 12 || cols !== 20) return null;
          if (dsW < 900 || dsH < 600) return null;
          const targetAspect = cols / rows;
          const imageAspect = dsW / dsH;
          if (Math.abs(imageAspect - targetAspect) / targetAspect > 0.035) return null;

          const cell = dsW / cols;
          if (dsH < cell * rows) return null;

          return {
            rows,
            cols,
            offsetX: 0,
            offsetY: 0,
            cellWidth: cell,
            cellHeight: cell,
            runLenX: cols + 1,
            runLenY: rows + 1,
            scoreX: 1,
            scoreY: 1,
            confidence: 0.92,
            durationMs: 0,
            usedRunCounts: false,
          };
        };

        let usedDosGridFallback = false;
        let det = detectGridLines(dsCanvas, true, rows, cols, getAlignmentHints());
        if (!det || det.confidence < ATLAS_MIN_CONFIDENCE) {
          const dosFallback = buildDosGridFallback();
          if (dosFallback) {
            det = dosFallback;
            usedDosGridFallback = true;
          }
        }
        if (!det) {
          setLevelAtlas((prev) => ({
            tileSprites: prev?.tileSprites ?? {},
            heroSprite: prev?.heroSprite,
            boardBackground: prev?.boardBackground,
            status: "Sprite mode: grid detect failed (using reference sprites)",
            confidence: prev?.confidence,
          }));
          return;
        }

        const allowAtlas = det.confidence >= ATLAS_MIN_CONFIDENCE;

        const scaleX = img.width / dsW;
        const scaleY = img.height / dsH;
        const offsetX = Math.max(0, Math.round(det.offsetX * scaleX));
        const offsetY = Math.max(0, Math.round(det.offsetY * scaleY));
        const cellW = Math.max(1, Math.round(det.cellWidth * scaleX));
        const cellH = Math.max(1, Math.round(det.cellHeight * scaleY));
        const frameW = Math.max(1, Math.round(cellW * cols));
        const frameH = Math.max(1, Math.round(cellH * rows));
        const frameFitsImage = offsetX + frameW <= img.width + 2 && offsetY + frameH <= img.height + 2;
        if (!frameFitsImage) {
          setLevelAtlas((prev) => ({
            tileSprites: prev?.tileSprites ?? {},
            heroSprite: prev?.heroSprite,
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

        const minDinoPixels = Math.round(outW * outH * 0.012);
        const findBestDinoCrop = () => {
          if (!playerStart || playerStart.x < 0 || playerStart.y < 0) return null;

          const heroInset = Math.max(0, inset - 1);
          const strongDinoPixels = Math.round(outW * outH * 0.035);
          let bestCanvas: HTMLCanvasElement | null = null;
          let bestScore = 0;
          let bestRawScore = 0;

          const findGreenClusterNearStart = () => {
            const searchRadiusX = Math.round(cellW * 2.4);
            const searchRadiusY = Math.round(cellH * 2.8);
            const expectedX = Math.round(offsetX + (playerStart.x + 0.5) * cellW);
            const expectedY = Math.round(offsetY + (playerStart.y + 0.5) * cellH);
            const x0 = Math.max(0, expectedX - searchRadiusX);
            const y0 = Math.max(0, expectedY - searchRadiusY);
            const w = Math.max(1, Math.min(srcCanvas.width - x0, searchRadiusX * 2));
            const h = Math.max(1, Math.min(srcCanvas.height - y0, searchRadiusY * 2));
            const data = srcCtx.getImageData(x0, y0, w, h).data;
            let count = 0;
            let minX = w;
            let minY = h;
            let maxX = 0;
            let maxY = 0;

            for (let i = 0, p = 0; i < data.length; i += 4, p += 1) {
              const r = data[i];
              const g = data[i + 1];
              const b = data[i + 2];
              if (!(g > 58 && g - r > 18 && g - b > 14)) continue;

              const x = p % w;
              const y = Math.floor(p / w);
              count += 1;
              minX = Math.min(minX, x);
              minY = Math.min(minY, y);
              maxX = Math.max(maxX, x);
              maxY = Math.max(maxY, y);
            }

            if (count < Math.round(cellW * cellH * 0.012)) return null;

            const clusterCx = x0 + (minX + maxX) / 2;
            const clusterCy = y0 + (minY + maxY) / 2;
            const sw = Math.max(1, cellW - heroInset * 2);
            const sh = Math.max(1, cellH - heroInset * 2);
            return cropSourceRect(clusterCx - sw / 2, clusterCy - sh / 2, sw, sh);
          };

          const considerCrop = (x: number, y: number, distancePenalty: number, shiftX = 0, shiftY = 0) => {
            if (x < 0 || x >= cols || y < 0 || y >= rows) return;
            if (atlasGoalCaveKeys.has(`${x},${y}`)) return;
            const tile = sourceGrid[y]?.[x];
            if (tile == null || tile === 3 || tile === 5) return;

            const canvas = cropCell(y, x, heroInset, shiftX, shiftY);
            if (!canvas) return;

            const rawScore = scoreDinoCrop(canvas);
            const dist = Math.abs(x - playerStart.x) + Math.abs(y - playerStart.y);
            const shiftPenalty =
              (Math.abs(shiftX) / Math.max(1, cellW) + Math.abs(shiftY) / Math.max(1, cellH)) * 18;
            const score = rawScore - dist * distancePenalty - shiftPenalty;
            if (score > bestScore) {
              bestScore = score;
              bestRawScore = rawScore;
              bestCanvas = canvas;
            }
          };

          considerCrop(playerStart.x, playerStart.y, 0);
          if (bestCanvas && hasUsableDinoShape(bestCanvas, strongDinoPixels)) return bestCanvas;

          const stepX = Math.max(1, Math.round(cellW * 0.1));
          const stepY = Math.max(1, Math.round(cellH * 0.1));
          const maxShiftX = Math.round(cellW * 1.1);
          const maxShiftY = Math.round(cellH * 2.2);
          for (let shiftY = -maxShiftY; shiftY <= maxShiftY; shiftY += stepY) {
            for (let shiftX = -maxShiftX; shiftX <= maxShiftX; shiftX += stepX) {
              considerCrop(playerStart.x, playerStart.y, 0, shiftX, shiftY);
            }
          }
          if (bestCanvas && hasUsableDinoShape(bestCanvas, strongDinoPixels)) return bestCanvas;

          // Some DOS screenshots include the selected hero slightly above/below the
          // logical start cell. Search nearby cells before accepting a weak strip.
          for (let y = playerStart.y - 2; y <= playerStart.y + 2; y += 1) {
            for (let x = playerStart.x - 2; x <= playerStart.x + 2; x += 1) {
              considerCrop(x, y, 10);
            }
          }
          if (bestCanvas && hasUsableDinoShape(bestCanvas, strongDinoPixels)) return bestCanvas;

          const clusterCanvas = findGreenClusterNearStart();
          if (clusterCanvas && hasUsableDinoShape(clusterCanvas, minDinoPixels)) return clusterCanvas;

          for (let y = 0; y < rows; y += 1) {
            for (let x = 0; x < cols; x += 1) {
              const tile = sourceGrid[y]?.[x];
              if (tile !== 0 && tile !== 18) continue;
              considerCrop(x, y, 14);
            }
          }

          return bestCanvas && hasUsableDinoShape(bestCanvas, minDinoPixels) ? bestCanvas : null;
        };

        const tileSprites: Record<number, string> = {};
        let floorCanvasForSanity: HTMLCanvasElement | null = null;
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
              setLevelAtlas((prev) => ({
                tileSprites: prev?.tileSprites ?? {},
                heroSprite: prev?.heroSprite,
                boardBackground: prev?.boardBackground,
                status: `Sprite mode: bad atlas crop (floor too dark) - using reference sprites`,
                confidence: det.confidence,
              }));
              return;
            }
          }
        }

        const findCleanFloorCell = () => {
          const isFloorAt = (x: number, y: number) => {
            const v = sourceGrid[y]?.[x];
            if (v == null) return false;
            if (atlasGoalCaveKeys.has(`${x},${y}`)) return false;
            // Start cave (18) is synthetic; do not treat it as a clean floor sample.
            if (v === 18) return false;
            return v === 0;
          };

          // Prefer an interior floor tile (surrounded by floor) to reduce edge/shadow contamination.
          for (let y = 1; y < rows - 1; y += 1) {
            for (let x = 1; x < cols - 1; x += 1) {
              if (playerStart && playerStart.x === x && playerStart.y === y) continue;
              if (!isFloorAt(x, y)) continue;

              let ok = true;
              for (let dy = -1; dy <= 1 && ok; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                  if (dx === 0 && dy === 0) continue;
                  if (!isFloorAt(x + dx, y + dy)) { ok = false; break; }
                }
              }
              if (ok) return { x, y };
            }
          }

          // Fallback: any non-start floor tile.
          for (let y = 0; y < rows; y += 1) {
            for (let x = 0; x < cols; x += 1) {
              if (playerStart && playerStart.x === x && playerStart.y === y) continue;
              if (isFloorAt(x, y)) return { x, y };
            }
          }

          return null;
        };

        // Prefer the original screenshot dino crop, but only if the crop actually
        // contains the green dinosaur. A bad opaque crop would hide the fallback.
        let heroSprite: string | undefined;
        const bestDinoCrop = findBestDinoCrop();
        if (bestDinoCrop) {
          const silhouette = createDinoSilhouetteCanvas(bestDinoCrop);
          heroSprite = (silhouette ?? bestDinoCrop).toDataURL("image/png");
        }

        // Keep the older floor-diff path as a backup for non-green variants, but
        // never accept a raw opaque crop unless it passes the dino color check above.
        const cleanFloor = findCleanFloorCell();
        if (!heroSprite && cleanFloor && playerStart && playerStart.x >= 0 && playerStart.y >= 0) {
          const floorCanvas = cropCell(cleanFloor.y, cleanFloor.x);
          // Slightly smaller inset for the hero crop so we don't clip the sprite.
          const heroCanvas = cropCell(playerStart.y, playerStart.x, Math.max(0, inset - 1));
          if (floorCanvas && heroCanvas) {
            const fc = floorCanvas.getContext("2d", { willReadFrequently: true });
            const hc = heroCanvas.getContext("2d", { willReadFrequently: true });
            if (fc && hc) {
              const floorData = fc.getImageData(0, 0, outW, outH);
              const heroData = hc.getImageData(0, 0, outW, outH);
              const out = document.createElement("canvas");
              out.width = outW;
              out.height = outH;
              const oc = out.getContext("2d");
              if (oc) {
                const outData = oc.createImageData(outW, outH);
                // Keep anything that differs from floor by enough luma/chroma.
                const thr = 26;
                let nonFloorPixels = 0;
                for (let i = 0; i < outData.data.length; i += 4) {
                  const dr = Math.abs(heroData.data[i] - floorData.data[i]);
                  const dg = Math.abs(heroData.data[i + 1] - floorData.data[i + 1]);
                  const db = Math.abs(heroData.data[i + 2] - floorData.data[i + 2]);
                  const d = dr + dg + db;
                  if (d > thr) {
                    nonFloorPixels += 1;
                    outData.data[i] = heroData.data[i];
                    outData.data[i + 1] = heroData.data[i + 1];
                    outData.data[i + 2] = heroData.data[i + 2];
                    outData.data[i + 3] = 255;
                  } else {
                    outData.data[i + 3] = 0;
                  }
                }

                // Require a meaningful extracted silhouette; very sparse alpha masks
                // can appear invisible on some levels (e.g. 1/4/8/13).
                const minPixels = Math.round(outW * outH * 0.055); // ~225 px for 64x64
                if (nonFloorPixels >= minPixels) {
                  oc.putImageData(outData, 0, 0);
                  heroSprite = out.toDataURL("image/png");
                }
              }
            }
          }
        }

        setLevelAtlas({
          tileSprites,
          heroSprite,
          boardBackground,
          status: usedDosGridFallback
            ? "Sprites ready (DOS grid fallback)"
            : allowAtlas
            ? `Sprites ready (conf ${det.confidence.toFixed(2)})`
            : `Sprite mode: low grid confidence (conf ${det.confidence.toFixed(2)}) - using reference sprites`,
          confidence: det.confidence,
        });
      } catch (e) {
        console.error(e);
        setLevelAtlas((prev) => ({
          tileSprites: prev?.tileSprites ?? {},
          heroSprite: prev?.heroSprite,
          boardBackground: prev?.boardBackground,
          status: "Sprite mode: failed to build sprites (using reference sprites)",
          confidence: prev?.confidence,
        }));
      }
    };

    void buildAtlas();

    return () => {
      cancelled = true;
    };
  }, [levelImageUrl, rows, cols, atlasGoalCaveKeys, atlasGrid, playerStart, sourceGrid]);

  const scale = useMemo(() => {
    // Keep semantics aligned with the existing % indicator: higher % = larger board.
    return Math.max(0.75, Math.min(1.35, 1 / Math.max(0.01, zoomFactor)));
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
    const containedScale = Math.min(scale, 1);
    const width = Math.max(cols, Math.floor(fitWidth * containedScale));
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
  const boardBackgroundUrl = levelAtlas?.boardBackground ?? null;
  const useScreenshotBase = Boolean(boardBackgroundUrl);

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
          maxWidth: "100%",
          maxHeight: "100%",
        }}
      >
        <div
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
            backgroundPosition: "center",
            backgroundSize: "100% 100%",
            imageRendering: "pixelated",
            boxShadow: useScreenshotBase
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
                isPlayer && useScreenshotBase && (!levelAtlas?.heroSprite || isPlayerAtScreenshotStart);
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
              const effectiveTileType = isPlayer && isDirectionalArrowTile ? 0 : displayTileType;
              const effectiveIsArrow = effectiveTileType >= 7 && effectiveTileType <= 13;
              const originalTileType = atlasGoalCaveKeys.has(`${x},${y}`) ? 3 : (sourceGrid[y]?.[x] ?? tileType);
              const originalIsArrow = originalTileType >= 7 && originalTileType <= 13;
              const playerStartNeedsCleanup =
                Boolean(
                  playerStart &&
                  playerStart.x === x &&
                  playerStart.y === y &&
                  localPlayer &&
                  (localPlayer.pos.x !== x || localPlayer.pos.y !== y)
                );
              const tileChangedFromScreenshot = effectiveTileType !== originalTileType;
              const shouldPaintStaticTile =
                !suppressPlayerOverlay && (
                  useScreenshotBase
                    ? tileChangedFromScreenshot || playerStartNeedsCleanup
                    : true
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
                      !useScreenshotBase && !backgroundImage && displayTileType === 0 ? "inset 0 0 0 1px rgba(75,85,99,0.9)" :
                      undefined,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isArrow) onArrowClick?.(x, y);
                  }}
                  title={`(${y},${x}) = ${tileType}`}
                >
                  {edge?.any && !useScreenshotBase && (
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
                  {showCoords && y === 0 && (
                    <div
                      className="pointer-events-none absolute top-[2px] left-0 right-0 text-center text-[9px] font-black text-white/70"
                      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
                    >
                      {x}
                    </div>
                  )}
                  {showCoords && x === 0 && (
                    <div
                      className="pointer-events-none absolute left-[2px] top-0 bottom-0 flex items-center text-[9px] font-black text-white/70"
                      style={{ textShadow: "0 1px 2px rgba(0,0,0,0.8)" }}
                    >
                      {y}
                    </div>
                  )}
                  {isPlayer && !isPlayerAtScreenshotStart && (
                    levelAtlas?.heroSprite ? (
                      <img
                        src={levelAtlas.heroSprite}
                        alt="Hero"
                        className="absolute inset-0 h-full w-full"
                        style={{ imageRendering: "pixelated" }}
                        draggable={false}
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
