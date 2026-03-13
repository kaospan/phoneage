import React, { useEffect, useMemo, useState } from "react";
import { CELL_REFERENCES_UPDATED_EVENT, getCellReferences, type CellReference } from "@/lib/spriteMatching";
import { createClockIconDataUrl, createKeyIconDataUrl, createVortexIconDataUrl } from "@/lib/canvasIcons";
import { isArrowCell } from "@/game/arrows";
import { referenceSpriteUrls } from "@/data/assetCatalog";
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
  fullBleed?: boolean;
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
const HERO_SPRITE_CACHE_KEY = "stone-age-spr-hero-sprite-v1";

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
  const localPlayer = players.find((p) => p.isLocal) ?? players[0];
  const atlasGrid = useMemo(() => grid.map((r) => [...r]), [levelImageUrl]);

  // Mark board edges (modern + readable): a cell is on the edge if it is non-void and
  // at least one 4-neighbor is void or out-of-bounds.
  const edgeMasks = useMemo(() => {
    if (rows <= 0 || cols <= 0) return [];

    const isVoidAt = (x: number, y: number) => {
      if (y < 0 || y >= rows) return true;
      if (x < 0 || x >= cols) return true;
      // Cave is always treated as non-void for edge purposes.
      if (cavePos.x === x && cavePos.y === y) return false;
      return grid[y]?.[x] === 5;
    };

    return grid.map((row, y) =>
      row.map((cell, x) => {
        const tileType = cavePos.x === x && cavePos.y === y ? 3 : cell;
        if (tileType === 5) return null;
        const top = isVoidAt(x, y - 1);
        const right = isVoidAt(x + 1, y);
        const bottom = isVoidAt(x, y + 1);
        const left = isVoidAt(x - 1, y);
        const any = top || right || bottom || left;
        return { top, right, bottom, left, any };
      })
    );
  }, [grid, rows, cols, cavePos.x, cavePos.y]);

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

      const cachedHeroSprite = (() => {
        if (typeof window === "undefined") return undefined;
        try {
          const s = localStorage.getItem(HERO_SPRITE_CACHE_KEY);
          return s || undefined;
        } catch {
          return undefined;
        }
      })();

      setLevelAtlas({ tileSprites: {}, heroSprite: cachedHeroSprite, status: "Building sprites..." });

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
          setLevelAtlas({
            tileSprites: {},
            heroSprite: cachedHeroSprite,
            status: "Sprite mode: grid detect failed (using reference sprites)",
          });
          return;
        }

        const allowAtlas = det.confidence >= ATLAS_MIN_CONFIDENCE;

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
        if (allowAtlas) {
          for (let r = 0; r < rows; r += 1) {
            for (let c = 0; c < cols; c += 1) {
              const raw = atlasGrid[r]?.[c];
              if (raw === undefined) continue;
              const tileType = cavePos.x === c && cavePos.y === r ? 3 : raw;
              // Void is handled separately in sprite mode (transparent).
              if (tileType === 5) continue;
              // Start cave (18) is synthetic; never sample it from the screenshot or we'll capture the hero.
              if (tileType === 18) continue;
              if (!sampleByType.has(tileType)) sampleByType.set(tileType, { row: r, col: c });
            }
          }
        }

        const inset = Math.max(1, Math.round(Math.min(cellW, cellH) * 0.03));
        const outW = 64;
        const outH = 64;

        const cropCell = (row: number, col: number, insetPx = inset) => {
          const sx = offsetX + col * cellW + insetPx;
          const sy = offsetY + row * cellH + insetPx;
          const sw = Math.max(1, cellW - insetPx * 2);
          const sh = Math.max(1, cellH - insetPx * 2);
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
                heroSprite: cachedHeroSprite,
                status: `Sprite mode: bad atlas crop (floor too dark) - using reference sprites`,
                confidence: det.confidence,
              });
              return;
            }
          }
        }

        const findCleanFloorCell = () => {
          const isFloorAt = (x: number, y: number) => {
            const v = grid[y]?.[x];
            if (v == null) return false;
            if (x === cavePos.x && y === cavePos.y) return false;
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

        // Extract a transparent hero sprite by diffing player-start cell against a clean floor cell.
        let heroSprite: string | undefined;
        const cleanFloor = findCleanFloorCell();
        if (cleanFloor && playerStart && playerStart.x >= 0 && playerStart.y >= 0) {
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

                const minPixels = 24;
                if (nonFloorPixels >= minPixels) {
                  oc.putImageData(outData, 0, 0);
                  heroSprite = out.toDataURL("image/png");
                }
              }
            }
          }
        }

        if (heroSprite) {
          try { localStorage.setItem(HERO_SPRITE_CACHE_KEY, heroSprite); } catch { /* ignore */ }
        } else {
          heroSprite = cachedHeroSprite;
        }

        setLevelAtlas({
          tileSprites,
          heroSprite,
          status: allowAtlas
            ? `Sprites ready (conf ${det.confidence.toFixed(2)})`
            : `Sprite mode: low grid confidence (conf ${det.confidence.toFixed(2)}) - using reference sprites`,
          confidence: det.confidence,
        });
      } catch (e) {
        console.error(e);
        setLevelAtlas({ tileSprites: {}, heroSprite: cachedHeroSprite, status: "Sprite mode: failed to build sprites (using reference sprites)" });
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

  const startCaveFallbackUrl = useMemo(() => getStartCaveSpriteFallback(), []);
  const startCaveSpriteUrl = levelAtlas?.tileSprites?.[3] ?? startCaveFallbackUrl;

  return (
    <div
      className={[
        "w-full h-full flex overflow-hidden touch-none select-none",
        // In fullscreen mode, keep the board visually lower so the HUD never occludes rows.
        fullBleed ? "items-end justify-center" : "items-center justify-center",
      ].join(" ")}
      style={{
        // Outside the board perimeter we show the original level screenshot for nostalgia.
        // Inside the board, void cells are transparent but sit on a black board background.
        backgroundColor: "black",
        backgroundImage: levelImageUrl ? `url(${levelImageUrl})` : undefined,
        backgroundRepeat: "no-repeat",
        backgroundPosition: "center",
        backgroundSize: "cover",
      }}
      onClick={() => onCancelSelection?.()}
    >
      <div
        className={[
          fullBleed ? "border-0 shadow-none p-0 rounded-none" : "rounded-xl border border-border/40 shadow-lg p-2 md:p-3",
          "bg-transparent",
        ].join(" ")}
        style={{ transform: `scale(${scale})`, transformOrigin: "center" }}
      >
        <div
          className={[
            // The board itself is always black so void reads as empty even if the screenshot has detail.
            "grid gap-[2px] bg-black",
            fullBleed ? "p-0 rounded-none" : "p-2 rounded-lg",
          ].join(" ")}
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            width: fullBleed
              ? "calc(100vw - env(safe-area-inset-left) - env(safe-area-inset-right))"
              : "min(92vw, 980px)",
            aspectRatio: cols > 0 && rows > 0 ? `${cols} / ${rows}` : undefined,
            imageRendering: "pixelated",
            // Full grid frame (rows×cols): inner black border + subtle outer highlight
            // so the whole board reads as a bounded rectangle even on black outside.
            boxShadow:
              "inset 0 0 0 3px rgba(0,0,0,0.92), 0 0 0 1px rgba(255,255,255,0.08)",
          }}
        >
          {grid.map((row, y) =>
            row.map((cell, x) => {
              const isCave = cavePos.x === x && cavePos.y === y;
              const isPlayer = localPlayer?.pos.x === x && localPlayer?.pos.y === y;
              const tileType = isCave ? 3 : cell;
              // If the player is standing on the start-marker cave (18), render the base tile as floor
              // so the cave appears only after the hero moves off the spawn tile (nostalgia behavior).
              const displayTileType = isPlayer && tileType === 18 ? 0 : tileType;
              const isArrow = isArrowCell(cell) || cell === 11 || cell === 12 || cell === 13;
              const isSelected = selectedArrow?.x === x && selectedArrow?.y === y;
              const isSelector = selectorPos?.x === x && selectorPos?.y === y;
              const edge = edgeMasks?.[y]?.[x] ?? null;

              const atlasSprite = levelAtlas?.tileSprites?.[displayTileType];
              const refSprite = latestByType.get(displayTileType)?.imageData;
              // Sprite mode policy:
              // - Void must be visually empty (transparent) so the game background shows through.
              // - Do not use atlas/ref sprites for void even if present.
                const backgroundImage =
                  displayTileType === 5 ? undefined :
                  displayTileType === 18 ? (startCaveSpriteUrl ? `url(${startCaveSpriteUrl})` : undefined) :
                  atlasSprite ? `url(${atlasSprite})` :
                  refSprite ? `url(${refSprite})` :
                  displayTileType === 14 && redKeyFallbackUrl ? `url(${redKeyFallbackUrl})` :
                  displayTileType === 15 && greenKeyFallbackUrl ? `url(${greenKeyFallbackUrl})` :
                  displayTileType === 19 && teleportFallbackUrl ? `url(${teleportFallbackUrl})` :
                  displayTileType === 20 && bonusTimeFallbackUrl ? `url(${bonusTimeFallbackUrl})` :
                  undefined;

              const fallback =
                displayTileType === 5 ? "transparent" :
                displayTileType === 0 ? "rgba(255,255,255,0.08)" :
                displayTileType === 4 ? "rgba(30,144,255,0.55)" :
                displayTileType === 1 ? "rgba(255,80,80,0.65)" :
                displayTileType === 2 ? "rgba(120,85,60,0.75)" :
                displayTileType === 6 ? "rgba(160,155,140,0.80)" :
                displayTileType === 14 ? "rgba(255,70,70,0.70)" :
                displayTileType === 15 ? "rgba(60,210,120,0.70)" :
                displayTileType === 16 ? "rgba(150,20,20,0.80)" :
                displayTileType === 17 ? "rgba(20,110,35,0.80)" :
                displayTileType === 18 ? "rgba(0,0,0,0.88)" :
                displayTileType === 20 ? "rgba(251,191,36,0.78)" :
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
                      !backgroundImage && displayTileType === 0 ? "inset 0 0 0 1px rgba(75,85,99,0.9)" :
                      undefined,
                  }}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (isArrow) onArrowClick?.(x, y);
                  }}
                  title={`(${y},${x}) = ${tileType}`}
                >
                  {edge?.any && (
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
                      // Avoid non-nostalgic fallbacks (emoji/new hero). If the hero sprite hasn't been
                      // extracted yet, show a subtle marker so play is still possible.
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div
                          className="h-[70%] w-[70%] rounded-full border-2 border-emerald-200/90 bg-emerald-400/20"
                          style={{
                            boxShadow:
                              "0 0 0 2px rgba(0,0,0,0.35), 0 0 18px rgba(16,185,129,0.55)",
                          }}
                        />
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
