import React, { useEffect, useMemo, useState } from "react";
import { CELL_REFERENCES_UPDATED_EVENT, getCellReferences, type CellReference } from "@/lib/spriteMatching";
import { isArrowCell } from "@/game/arrows";
import { detectGridLines } from "@/components/level-mapper/gridDetection";
import { getAlignmentHints } from "@/components/level-mapper/alignmentProfile";
import { normalizeMapperImage } from "@/components/level-mapper/imageNormalization";

type PlayerFacing = "up" | "right" | "down" | "left";

interface GameSprite2DProps {
  grid: number[][];
  cavePos: { x: number; y: number };
  levelImageUrl?: string | null;
  playerStart?: { x: number; y: number } | null;
  selectedArrow?: { x: number; y: number } | null;
  selectorPos?: { x: number; y: number } | null;
  players: Array<{ id: string; pos: { x: number; y: number }; facing: PlayerFacing; color: string; isLocal?: boolean }>;
  zoomFactor?: number;
  showCoords?: boolean;
  onArrowClick?: (x: number, y: number) => void;
  onCancelSelection?: () => void;
}

type LevelSpriteAtlas = {
  tileSprites: Record<number, string>;
  heroSprite?: string;
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

export function GameSprite2D({
  grid,
  cavePos,
  levelImageUrl,
  playerStart,
  selectedArrow,
  selectorPos,
  players,
  zoomFactor = 1,
  showCoords = false,
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
  const localPlayer = players.find((p) => p.isLocal) ?? players[0];
  const atlasGrid = useMemo(() => grid.map((r) => [...r]), [levelImageUrl]);

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

      setLevelAtlas({ tileSprites: {}, status: "Building sprites..." });

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

        const det = detectGridLines(dsCanvas, true, rows, cols, getAlignmentHints());
        if (!det) {
          setLevelAtlas({ tileSprites: {}, status: "Sprite mode: grid detect failed (using reference sprites)" });
          return;
        }
        if (det.confidence < ATLAS_MIN_CONFIDENCE) {
          setLevelAtlas({
            tileSprites: {},
            status: `Sprite mode: low grid confidence (conf ${det.confidence.toFixed(2)}) - using reference sprites`,
            confidence: det.confidence,
          });
          return;
        }

        const scaleX = img.width / dsW;
        const scaleY = img.height / dsH;
        const offsetX = Math.max(0, Math.round(det.offsetX * scaleX));
        const offsetY = Math.max(0, Math.round(det.offsetY * scaleY));
        const cellW = Math.max(1, Math.round(det.cellWidth * scaleX));
        const cellH = Math.max(1, Math.round(det.cellHeight * scaleY));

        // Draw full-res source once.
        const srcCanvas = document.createElement("canvas");
        srcCanvas.width = img.width;
        srcCanvas.height = img.height;
        const srcCtx = srcCanvas.getContext("2d", { willReadFrequently: true });
        if (!srcCtx) throw new Error("Failed to create sprite canvas context");
        srcCtx.imageSmoothingEnabled = false;
        srcCtx.drawImage(img, 0, 0);

        const sampleByType = new Map<number, { row: number; col: number }>();
        for (let r = 0; r < rows; r += 1) {
          for (let c = 0; c < cols; c += 1) {
            const raw = atlasGrid[r]?.[c];
            if (raw === undefined) continue;
            const tileType = cavePos.x === c && cavePos.y === r ? 3 : raw;
            if (tileType === 5) continue; // void handled separately in sprite mode (transparent)
            if (!sampleByType.has(tileType)) sampleByType.set(tileType, { row: r, col: c });
          }
        }

        const inset = Math.max(1, Math.round(Math.min(cellW, cellH) * 0.03));
        const outW = 64;
        const outH = 64;

        const cropCell = (row: number, col: number) => {
          const sx = offsetX + col * cellW + inset;
          const sy = offsetY + row * cellH + inset;
          const sw = Math.max(1, cellW - inset * 2);
          const sh = Math.max(1, cellH - inset * 2);
          const out = document.createElement("canvas");
          out.width = outW;
          out.height = outH;
          const outCtx = out.getContext("2d");
          if (!outCtx) return null;
          outCtx.imageSmoothingEnabled = false;
          outCtx.drawImage(srcCanvas, sx, sy, sw, sh, 0, 0, outW, outH);
          return out;
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
              setLevelAtlas({
                tileSprites: {},
                status: `Sprite mode: bad atlas crop (floor too dark) - using reference sprites`,
                confidence: det.confidence,
              });
              return;
            }
          }
        }

        // Extract a transparent hero sprite by diffing player-start cell against a clean floor cell.
        let heroSprite: string | undefined;
        const floorPos = sampleByType.get(0);
        if (floorPos && playerStart && playerStart.x >= 0 && playerStart.y >= 0) {
          const floorCanvas = cropCell(floorPos.row, floorPos.col);
          const heroCanvas = cropCell(playerStart.y, playerStart.x);
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
                // Threshold tuned for these screenshots: keep anything that differs from floor by enough luma/chroma.
                const thr = 34;
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

                // If we extracted almost nothing, the hero crop likely missed (bad grid confidence/offset),
                // so fall back to the in-cell 🦖 marker instead of showing an invisible/blank sprite.
                const minPixels = 40;
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
          status: `Sprites ready (conf ${det.confidence.toFixed(2)})`,
          confidence: det.confidence,
        });
      } catch (e) {
        console.error(e);
        setLevelAtlas({ tileSprites: {}, status: "Sprite mode: failed to build sprites (using reference sprites)" });
      }
    };

    void buildAtlas();

    return () => {
      cancelled = true;
    };
  }, [levelImageUrl, rows, cols, cavePos.x, cavePos.y, atlasGrid, playerStart?.x, playerStart?.y]);

  const scale = useMemo(() => {
    // Keep semantics aligned with the existing % indicator: higher % = larger board.
    return Math.max(0.75, Math.min(1.35, 1 / Math.max(0.01, zoomFactor)));
  }, [zoomFactor]);

  return (
    <div
      className="w-full h-full flex items-center justify-center overflow-hidden touch-none select-none"
      onClick={() => onCancelSelection?.()}
    >
      <div
        className="rounded-xl border border-border/40 bg-transparent p-2 md:p-3 shadow-lg"
        style={{ transform: `scale(${scale})`, transformOrigin: "center" }}
      >
        <div
          className="grid gap-[2px] bg-transparent p-2 rounded-lg"
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            width: "min(92vw, 980px)",
            aspectRatio: cols > 0 && rows > 0 ? `${cols} / ${rows}` : undefined,
            imageRendering: "pixelated",
          }}
        >
          {grid.map((row, y) =>
            row.map((cell, x) => {
              const isCave = cavePos.x === x && cavePos.y === y;
              const tileType = isCave ? 3 : cell;
              const isPlayer = localPlayer?.pos.x === x && localPlayer?.pos.y === y;
              const isArrow = isArrowCell(cell) || cell === 11 || cell === 12 || cell === 13;
              const isSelected = selectedArrow?.x === x && selectedArrow?.y === y;
              const isSelector = selectorPos?.x === x && selectorPos?.y === y;

              const atlasSprite = levelAtlas?.tileSprites?.[tileType];
              const refSprite = latestByType.get(tileType)?.imageData;
              // Sprite mode policy:
              // - Void must be visually empty (transparent) so the game background shows through.
              // - Do not use atlas/ref sprites for void even if present.
              const backgroundImage =
                tileType === 5 ? undefined : atlasSprite ? `url(${atlasSprite})` : refSprite ? `url(${refSprite})` : undefined;

              const fallback =
                tileType === 5 ? "transparent" :
                tileType === 0 ? "rgba(255,255,255,0.08)" :
                tileType === 4 ? "rgba(30,144,255,0.55)" :
                tileType === 1 ? "rgba(255,80,80,0.65)" :
                tileType === 2 ? "rgba(120,85,60,0.75)" :
                tileType === 6 ? "rgba(160,155,140,0.80)" :
                tileType === 14 ? "rgba(255,70,70,0.70)" :
                tileType === 15 ? "rgba(60,210,120,0.70)" :
                tileType === 16 ? "rgba(150,20,20,0.80)" :
                tileType === 17 ? "rgba(20,110,35,0.80)" :
                "rgba(255,255,255,0.06)";

              return (
                <div
                  key={`${x}-${y}`}
                  className={[
                    "relative aspect-square rounded-[4px] overflow-hidden",
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
                      !backgroundImage && tileType === 0 ? "inset 0 0 0 1px rgba(75,85,99,0.9)" :
                      undefined,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isArrow) onArrowClick?.(x, y);
                  }}
                  title={`(${y},${x}) = ${tileType}`}
                >
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
                  {isPlayer && (
                    levelAtlas?.heroSprite ? (
                      <img
                        src={levelAtlas.heroSprite}
                        alt="Hero"
                        className="absolute inset-0 h-full w-full"
                        style={{ imageRendering: "pixelated" }}
                        draggable={false}
                      />
                    ) : (
                      <div
                        className="absolute inset-0 flex items-center justify-center font-black text-white"
                        style={{
                          textShadow: "0 1px 2px rgba(0,0,0,0.7)",
                          fontSize: "min(3.2vw, 26px)",
                        }}
                      >
                        🦖
                      </div>
                    )
                  )}
                </div>
              );
            })
          )}
        </div>
        {levelAtlas?.status && (
          <div className="mt-2 text-center text-[11px] text-white/70">
            {levelAtlas.status}
          </div>
        )}
      </div>
    </div>
  );
}
