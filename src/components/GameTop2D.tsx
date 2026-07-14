import React, { useEffect, useMemo, useRef, useState } from "react";
import { isArrowCell } from "@/game/arrows";
import { buildGoalCaveKeySet } from "@/game/caves";
import playerSpriteUrl from "@/assets/dino.png";
import {
  createKeyIconDataUrl,
  createLockIconDataUrl,
  createClockIconDataUrl,
  createVortexIconDataUrl,
} from "@/lib/canvasIcons";

type PlayerFacing = "up" | "right" | "down" | "left";

interface GameTop2DProps {
  grid: number[][];
  cavePos: { x: number; y: number };
  playerStart?: { x: number; y: number } | null;
  selectedArrow?: { x: number; y: number } | null;
  selectorPos?: { x: number; y: number } | null;
  players: Array<{
    id: string;
    pos: { x: number; y: number };
    facing: PlayerFacing;
    color: string;
    isLocal?: boolean;
  }>;
  zoomFactor?: number;
  fullBleed?: boolean;
  rotateUpright?: boolean;
  onArrowClick?: (x: number, y: number) => void;
  onCancelSelection?: () => void;
}

const SPRITE_ZOOM_BASELINE_FACTOR = 0.66;

// ─── SVG Tile Components ────────────────────────────────────────────────────

const VoidTile = () => (
  <div className="w-full h-full" style={{ background: "#000" }} />
);

const FloorTile = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`fg${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D2C4A6" />
        <stop offset="100%" stopColor="#BBA88A" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#fg${uid})`} />
    {/* 2×2 sub-tile grout lines */}
    <line x1="50" y1="1" x2="50" y2="99" stroke="rgba(90,68,45,0.18)" strokeWidth="1.5" />
    <line x1="1" y1="50" x2="99" y2="50" stroke="rgba(90,68,45,0.18)" strokeWidth="1.5" />
    {/* Subtle highlights per quadrant */}
    <rect x="2" y="2" width="46" height="46" fill="rgba(255,255,255,0.08)" rx="1" />
    <rect x="52" y="52" width="46" height="46" fill="rgba(0,0,0,0.04)" rx="1" />
    <rect width="100" height="100" fill="none" stroke="rgba(90,68,45,0.12)" strokeWidth="1" />
  </svg>
);

const StoneTile = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`sg${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#6A5342" />
        <stop offset="100%" stopColor="#3C2B1C" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#sg${uid})`} />
    {/* Bevel: top+left highlight */}
    <polygon points="0,0 100,0 88,11 12,11" fill="rgba(255,255,255,0.13)" />
    <polygon points="0,0 11,12 11,88 0,100" fill="rgba(255,255,255,0.09)" />
    {/* Bevel: bottom+right shadow */}
    <polygon points="100,100 0,100 12,89 88,89" fill="rgba(0,0,0,0.30)" />
    <polygon points="100,100 100,0 89,12 89,88" fill="rgba(0,0,0,0.22)" />
    {/* Stone texture patches */}
    <path d="M22,32 Q33,22 42,30 Q46,36 36,40 Q24,41 22,32Z" fill="rgba(255,255,255,0.07)" />
    <path d="M58,55 Q70,47 77,57 Q79,65 67,68 Q56,67 58,55Z" fill="rgba(0,0,0,0.11)" />
    <path d="M28,65 Q38,59 44,66 Q46,73 38,75 Q29,74 28,65Z" fill="rgba(255,255,255,0.05)" />
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,0.38)" strokeWidth="1.5" />
  </svg>
);

const BreakableRockTile = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`brg${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#9B7A54" />
        <stop offset="100%" stopColor="#6B4E2E" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#brg${uid})`} />
    {/* Bevel highlights */}
    <polygon points="0,0 100,0 88,11 12,11" fill="rgba(255,255,255,0.11)" />
    <polygon points="0,0 11,12 11,88 0,100" fill="rgba(255,255,255,0.07)" />
    <polygon points="100,100 0,100 12,89 88,89" fill="rgba(0,0,0,0.25)" />
    <polygon points="100,100 100,0 89,12 89,88" fill="rgba(0,0,0,0.18)" />
    {/* Crack lines radiating from center */}
    <line x1="50" y1="50" x2="33" y2="14" stroke="rgba(20,10,4,0.88)" strokeWidth="2.2" strokeLinecap="round" />
    <line x1="50" y1="50" x2="80" y2="22" stroke="rgba(20,10,4,0.82)" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="50" y1="50" x2="85" y2="66" stroke="rgba(20,10,4,0.90)" strokeWidth="2.0" strokeLinecap="round" />
    <line x1="50" y1="50" x2="55" y2="88" stroke="rgba(20,10,4,0.80)" strokeWidth="1.6" strokeLinecap="round" />
    <line x1="50" y1="50" x2="16" y2="78" stroke="rgba(20,10,4,0.85)" strokeWidth="1.9" strokeLinecap="round" />
    <line x1="50" y1="50" x2="18" y2="36" stroke="rgba(20,10,4,0.75)" strokeWidth="1.3" strokeLinecap="round" />
    {/* Crack edge highlights (lighter side) */}
    <line x1="50" y1="50" x2="33" y2="14" stroke="rgba(255,230,180,0.22)" strokeWidth="0.8" strokeLinecap="round" />
    <line x1="50" y1="50" x2="85" y2="66" stroke="rgba(255,230,180,0.18)" strokeWidth="0.7" strokeLinecap="round" />
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,0.32)" strokeWidth="1.5" />
  </svg>
);

const CaveTile = ({ uid, isStart = false }: { uid: string; isStart?: boolean }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`cvf${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#5A4835" />
        <stop offset="100%" stopColor="#38281A" />
      </linearGradient>
      <radialGradient id={`cvd${uid}`} cx="50%" cy="75%" r="65%">
        <stop offset="0%" stopColor={isStart ? "#2C1E0E" : "#0A0705"} />
        <stop offset="80%" stopColor="#000000" />
      </radialGradient>
      {isStart && (
        <radialGradient id={`cvgl${uid}`} cx="50%" cy="90%" r="55%">
          <stop offset="0%" stopColor="rgba(200,160,60,0.18)" />
          <stop offset="100%" stopColor="rgba(200,160,60,0)" />
        </radialGradient>
      )}
    </defs>
    {/* Rocky frame */}
    <rect width="100" height="100" fill={`url(#cvf${uid})`} />
    {/* Dark arch void */}
    <path d="M17,100 L17,50 Q17,12 50,12 Q83,12 83,50 L83,100 Z" fill={`url(#cvd${uid})`} />
    {/* Stone arch rim */}
    <path d="M17,50 Q17,12 50,12 Q83,12 83,50" fill="none" stroke="#8B7055" strokeWidth="3.5" />
    {/* Inner depth layer */}
    <path d="M24,100 L24,52 Q24,24 50,24 Q76,24 76,52 L76,100 Z" fill="rgba(0,0,0,0.32)" />
    {/* Frame texture */}
    <path d="M5,28 Q13,22 19,28 Q21,35 14,37 Q5,36 5,28Z" fill="rgba(255,255,255,0.07)" />
    <path d="M81,42 Q89,36 97,42 Q99,49 93,51 Q83,50 81,42Z" fill="rgba(255,255,255,0.06)" />
    <path d="M5,58 Q12,52 18,57 Q20,64 13,66 Q5,65 5,58Z" fill="rgba(0,0,0,0.12)" />
    <path d="M82,62 Q90,57 97,62 Q99,69 93,71 Q83,70 82,62Z" fill="rgba(0,0,0,0.10)" />
    {/* Warm glow at entrance base (start cave only) */}
    {isStart && <ellipse cx="50" cy="92" rx="24" ry="9" fill={`url(#cvgl${uid})`} />}
    {/* Outer bevel */}
    <polygon points="0,0 100,0 88,11 12,11" fill="rgba(255,255,255,0.08)" />
    <polygon points="0,0 11,12 11,88 0,100" fill="rgba(255,255,255,0.06)" />
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,0.38)" strokeWidth="1.5" />
  </svg>
);

const FireTile = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <radialGradient id={`frg${uid}`} cx="50%" cy="88%" r="55%">
        <stop offset="0%" stopColor="#FF4800" stopOpacity="0.5" />
        <stop offset="100%" stopColor="transparent" stopOpacity="0" />
      </radialGradient>
    </defs>
    <rect width="100" height="100" fill="#150800" />
    {/* Base glow */}
    <ellipse cx="50" cy="88" rx="36" ry="13" fill={`url(#frg${uid})`} />
    {/* Outer flame — deep red */}
    <path d="M50,10 C36,27 24,44 29,64 C32,75 39,83 50,85 C61,83 68,75 71,64 C76,44 64,27 50,10Z"
          fill="#C02000" />
    {/* Mid flame — orange */}
    <path d="M50,26 C40,38 35,54 38,68 C41,76 46,81 50,81 C54,81 59,76 62,68 C65,54 60,38 50,26Z"
          fill="#E85500" />
    {/* Inner flame — bright orange */}
    <path d="M50,40 C44,50 42,63 45,72 C47,77 49,79 50,79 C51,79 53,77 55,72 C58,63 56,50 50,40Z"
          fill="#FF7200" />
    {/* Core — yellow */}
    <path d="M50,53 C47,60 46,68 48,73 C49,76 50,76 50,76 C50,76 51,76 52,73 C54,68 53,60 50,53Z"
          fill="#FFD000" />
    {/* Ember specks */}
    <circle cx="42" cy="48" r="2.2" fill="#FF8800" opacity="0.75" />
    <circle cx="58" cy="42" r="1.8" fill="#FFBB00" opacity="0.65" />
    <circle cx="38" cy="35" r="1.3" fill="#FF6000" opacity="0.5" />
  </svg>
);

const WaterTile = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`wg${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#2196F3" />
        <stop offset="100%" stopColor="#0A3D8A" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#wg${uid})`} />
    {/* Ripple ellipses */}
    <ellipse cx="50" cy="50" rx="32" ry="9" fill="none" stroke="rgba(255,255,255,0.24)" strokeWidth="1.5" />
    <ellipse cx="50" cy="50" rx="20" ry="5.5" fill="none" stroke="rgba(255,255,255,0.18)" strokeWidth="1.1" />
    <ellipse cx="50" cy="66" rx="24" ry="6.5" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="1" />
    <ellipse cx="34" cy="36" rx="10" ry="3" fill="none" stroke="rgba(255,255,255,0.12)" strokeWidth="0.8" />
    {/* Surface shine strokes */}
    <path d="M16,26 Q24,21 32,26" fill="none" stroke="rgba(255,255,255,0.48)" strokeWidth="2.5" strokeLinecap="round" />
    <path d="M62,37 Q70,32 78,37" fill="none" stroke="rgba(255,255,255,0.36)" strokeWidth="2" strokeLinecap="round" />
    <path d="M22,55 Q29,51 36,55" fill="none" stroke="rgba(255,255,255,0.26)" strokeWidth="1.5" strokeLinecap="round" />
    {/* Light refraction dots */}
    <circle cx="44" cy="30" r="1.4" fill="rgba(255,255,255,0.32)" />
    <circle cx="73" cy="57" r="1.1" fill="rgba(255,255,255,0.26)" />
    <rect width="100" height="100" fill="none" stroke="rgba(10,60,140,0.55)" strokeWidth="1.5" />
  </svg>
);

// ─── Arrow Vector (same design as GameSprite2D) ─────────────────────────────

const renderArrowVector = (tileType: number) => {
  const shadow =
    "drop-shadow(0 1px 1px rgba(0,0,0,0.95)) drop-shadow(0 0 4px rgba(0,0,0,0.72))";
  const common = {
    fill: "#f6c84f",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const OneArrow = ({ dir }: { dir: "up" | "right" | "down" | "left" }) => {
    const rotations = { up: 0, right: 90, down: 180, left: 270 };
    return (
      <g transform={`rotate(${rotations[dir]} 16 16)`}>
        <path
          d="M12 26 L12 14 L7 14 L16 5 L25 14 L20 14 L20 26 Z"
          stroke="rgba(16,18,12,0.92)"
          strokeWidth="4.2"
          {...common}
        />
        <path
          d="M12 26 L12 14 L7 14 L16 5 L25 14 L20 14 L20 26 Z"
          stroke="#fff8c8"
          strokeWidth="1.7"
          {...common}
        />
      </g>
    );
  };

  const GlyphPath = ({ d }: { d: string }) => (
    <>
      <path d={d} stroke="rgba(16,18,12,0.92)" strokeWidth="4.2" {...common} />
      <path d={d} stroke="#fff8c8" strokeWidth="1.7" {...common} />
    </>
  );

  const doubleVerticalPath =
    "M16 3 L26 13 L21 13 L21 19 L26 19 L16 29 L6 19 L11 19 L11 13 L6 13 Z";
  const doubleHorizontalPath =
    "M3 16 L13 6 L13 11 L19 11 L19 6 L29 16 L19 26 L19 21 L13 21 L13 26 Z";
  const omniPath =
    "M13 13 L13 8 L10 8 L16 2 L22 8 L19 8 L19 13 L24 13 L24 10 L30 16 L24 22 L24 19 L19 19 L19 24 L22 24 L16 30 L10 24 L13 24 L13 19 L8 19 L8 22 L2 16 L8 10 L8 13 Z";

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

// ─── Player / spawn sprites ──────────────────────────────────────────────────

const PlayerSprite = ({ rotate }: { rotate?: boolean }) => (
  <img
    src={playerSpriteUrl}
    alt="Hero"
    className="pointer-events-none absolute bottom-[6%] left-1/2 h-[88%] w-[88%] max-w-none object-contain object-bottom"
    style={{
      imageRendering: "auto",
      transform: rotate ? "translateX(-50%) rotate(90deg)" : "translateX(-50%)",
    }}
  />
);

const SpawnMarker = ({ rotate }: { rotate?: boolean }) => (
  <img
    src={playerSpriteUrl}
    alt=""
    aria-hidden
    className="pointer-events-none absolute bottom-[10%] left-1/2 h-[62%] w-[62%] max-w-none object-contain object-bottom opacity-40"
    style={{
      imageRendering: "auto",
      transform: rotate ? "translateX(-50%) rotate(90deg)" : "translateX(-50%)",
    }}
  />
);

// ─── Arrow background tile ───────────────────────────────────────────────────

const ArrowBgTile = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`abg${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#C8A860" />
        <stop offset="100%" stopColor="#8C6B30" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#abg${uid})`} />
    {/* Subtle bevel */}
    <polygon points="0,0 100,0 90,10 10,10" fill="rgba(255,255,255,0.10)" />
    <polygon points="0,0 10,10 10,90 0,100" fill="rgba(255,255,255,0.07)" />
    <polygon points="100,100 0,100 10,90 90,90" fill="rgba(0,0,0,0.20)" />
    <polygon points="100,100 100,0 90,10 90,90" fill="rgba(0,0,0,0.14)" />
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,0.28)" strokeWidth="1.5" />
  </svg>
);

// ─── Icon overlay (keys, locks, hourglass, teleport) ────────────────────────

const IconTile = ({
  iconUrl,
  bgColor,
  uid,
  rotate,
}: {
  iconUrl: string | null;
  bgColor: string;
  uid: string;
  rotate?: boolean;
}) => {
  if (!iconUrl) return <div className="w-full h-full" style={{ background: bgColor }} />;
  const content = (
    <img
      src={iconUrl}
      alt=""
      aria-hidden
      className="pointer-events-none"
      style={{
        width: "75%",
        height: "75%",
        objectFit: "contain",
        imageRendering: "auto",
        transform: rotate ? "rotate(90deg)" : undefined,
      }}
    />
  );
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ background: bgColor }}>
      {content}
    </div>
  );
};

// ─── Main component ──────────────────────────────────────────────────────────

export function GameTop2D({
  grid,
  cavePos,
  playerStart,
  selectedArrow,
  selectorPos,
  players,
  zoomFactor = 1,
  fullBleed = false,
  rotateUpright = false,
  onArrowClick,
  onCancelSelection,
}: GameTop2DProps) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [availableSize, setAvailableSize] = useState({ width: 0, height: 0 });
  const localPlayer = players.find((p) => p.isLocal) ?? players[0];

  const goalCaveKeys = useMemo(() => buildGoalCaveKeySet(grid, cavePos), [grid, cavePos]);

  useEffect(() => {
    const node = containerRef.current;
    if (!node) return;
    setAvailableSize({ width: Math.max(0, node.offsetWidth), height: Math.max(0, node.offsetHeight) });
    const observer = new ResizeObserver((entries) => {
      const r = entries[0]?.contentRect;
      if (r)
        setAvailableSize({
          width: Math.max(0, Math.floor(r.width)),
          height: Math.max(0, Math.floor(r.height)),
        });
    });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  const scale = useMemo(
    () => Math.max(0.55, Math.min(1.5, SPRITE_ZOOM_BASELINE_FACTOR / Math.max(0.01, zoomFactor))),
    [zoomFactor],
  );

  const boardSize = useMemo(() => {
    if (rows <= 0 || cols <= 0 || availableSize.width <= 0 || availableSize.height <= 0)
      return { width: 0, height: 0 };
    const aspect = cols / rows;
    const frameInset = fullBleed ? 0 : 16;
    const maxWidth = Math.max(1, availableSize.width - frameInset);
    const maxHeight = Math.max(1, availableSize.height - frameInset);
    const fitWidth = Math.min(maxWidth, maxHeight * aspect);
    const width = Math.max(cols, Math.floor(fitWidth * scale));
    return { width, height: Math.max(rows, Math.floor(width / aspect)) };
  }, [availableSize.height, availableSize.width, cols, fullBleed, rows, scale]);

  // Icon data URLs at higher resolution for crisp non-pixelated display
  const redKeyUrl = useMemo(
    () => (typeof window !== "undefined" ? createKeyIconDataUrl(128, { accent: "rgba(239,68,68,0.98)", glow: "rgba(239,68,68,0.18)" }) : null),
    [],
  );
  const greenKeyUrl = useMemo(
    () => (typeof window !== "undefined" ? createKeyIconDataUrl(128, { accent: "rgba(34,197,94,0.98)", glow: "rgba(34,197,94,0.18)" }) : null),
    [],
  );
  const redLockUrl = useMemo(
    () => (typeof window !== "undefined" ? createLockIconDataUrl(128, { body: "rgba(185,28,28,0.97)", shackle: "rgba(120,20,20,0.95)", glow: "rgba(220,38,38,0.22)" }) : null),
    [],
  );
  const greenLockUrl = useMemo(
    () => (typeof window !== "undefined" ? createLockIconDataUrl(128, { body: "rgba(21,128,61,0.97)", shackle: "rgba(16,80,40,0.95)", keyhole: "rgba(255,255,255,0.85)", glow: "rgba(34,197,94,0.22)" }) : null),
    [],
  );
  const hourglassUrl = useMemo(
    () => (typeof window !== "undefined" ? createClockIconDataUrl(128, { glow: "rgba(251,191,36,0.18)" }) : null),
    [],
  );
  const teleportUrl = useMemo(
    () => (typeof window !== "undefined" ? createVortexIconDataUrl(128) : null),
    [],
  );

  return (
    <div
      ref={containerRef}
      className="w-full h-full flex overflow-hidden touch-none select-none items-center justify-center"
      style={{ backgroundColor: "black" }}
      onClick={() => onCancelSelection?.()}
    >
      <div
        className={[
          fullBleed
            ? "border-0 shadow-none rounded-none"
            : "rounded-xl border border-border/40 shadow-lg",
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
          className={["grid gap-0", fullBleed ? "rounded-none" : "rounded-lg"].join(" ")}
          style={{
            gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`,
            gridTemplateRows: `repeat(${rows}, minmax(0, 1fr))`,
            width: "100%",
            height: "100%",
            backgroundColor: "black",
            boxShadow: "inset 0 0 0 3px rgba(0,0,0,0.92), 0 0 0 1px rgba(255,255,255,0.08)",
          }}
        >
          {grid.map((row, y) =>
            row.map((cell, x) => {
              const uid = `${x}-${y}`;
              const isCave = goalCaveKeys.has(`${x},${y}`);
              const isPlayer = localPlayer?.pos.x === x && localPlayer?.pos.y === y;
              const tileType = isCave ? 3 : cell;
              // Hide cave marker while player stands on spawn
              const displayTileType = isPlayer && tileType === 18 ? 0 : tileType;
              const isArrow = isArrowCell(cell) || cell === 11 || cell === 12 || cell === 13;
              const isSelected = selectedArrow?.x === x && selectedArrow?.y === y;
              const isSelector = selectorPos?.x === x && selectorPos?.y === y;
              // Hide arrow glyph while player stands on it
              const effectiveTileType =
                isPlayer && displayTileType >= 7 && displayTileType <= 13
                  ? 0
                  : displayTileType;
              const effectiveIsArrow = effectiveTileType >= 7 && effectiveTileType <= 13;
              const isSpawnMarker =
                !isPlayer &&
                effectiveTileType === 18 &&
                playerStart &&
                x === playerStart.x &&
                y === playerStart.y;

              // Upright-rotation needed for icons in portrait mode
              const needsUprightIcon =
                effectiveTileType === 3 ||
                effectiveTileType === 18 ||
                effectiveTileType === 16 ||
                effectiveTileType === 17 ||
                effectiveTileType === 20;

              const renderTileBg = () => {
                switch (effectiveTileType) {
                  case 5: return <VoidTile />;
                  case 0: return <FloorTile uid={uid} />;
                  case 2: return <StoneTile uid={uid} />;
                  case 6: return <BreakableRockTile uid={uid} />;
                  case 1: return <FireTile uid={uid} />;
                  case 4: return <WaterTile uid={uid} />;
                  case 3: return <CaveTile uid={uid} isStart={false} />;
                  case 18: return <CaveTile uid={uid} isStart />;
                  case 14:
                    return (
                      <IconTile
                        uid={uid}
                        iconUrl={redKeyUrl}
                        bgColor="rgba(220,40,40,0.22)"
                        rotate={rotateUpright && needsUprightIcon}
                      />
                    );
                  case 15:
                    return (
                      <IconTile
                        uid={uid}
                        iconUrl={greenKeyUrl}
                        bgColor="rgba(30,180,80,0.22)"
                        rotate={rotateUpright && needsUprightIcon}
                      />
                    );
                  case 16:
                    return (
                      <IconTile
                        uid={uid}
                        iconUrl={redLockUrl}
                        bgColor="rgba(140,15,15,0.82)"
                        rotate={rotateUpright && needsUprightIcon}
                      />
                    );
                  case 17:
                    return (
                      <IconTile
                        uid={uid}
                        iconUrl={greenLockUrl}
                        bgColor="rgba(15,100,30,0.82)"
                        rotate={rotateUpright && needsUprightIcon}
                      />
                    );
                  case 19:
                    return (
                      <IconTile
                        uid={uid}
                        iconUrl={teleportUrl}
                        bgColor="rgba(80,0,160,0.72)"
                        rotate={false}
                      />
                    );
                  case 20:
                    return (
                      <IconTile
                        uid={uid}
                        iconUrl={hourglassUrl}
                        bgColor="rgba(120,80,0,0.45)"
                        rotate={rotateUpright && needsUprightIcon}
                      />
                    );
                  default:
                    // Arrow tiles: amber background
                    if (effectiveIsArrow) return <ArrowBgTile uid={uid} />;
                    // Fallback: floor
                    return <FloorTile uid={uid} />;
                }
              };

              return (
                <div
                  key={uid}
                  className={[
                    "relative min-h-0 min-w-0",
                    isPlayer ? "z-10 overflow-visible" : "overflow-hidden",
                    isArrow && !isPlayer ? "cursor-pointer hover:brightness-110" : "",
                    isSelected ? "ring-2 ring-white" : "",
                    isSelector ? "ring-2 ring-emerald-300" : "",
                  ].join(" ")}
                  onClick={
                    isArrow && !isPlayer
                      ? (e) => { e.stopPropagation(); onArrowClick?.(x, y); }
                      : undefined
                  }
                >
                  {/* Tile background */}
                  {renderTileBg()}

                  {/* Arrow glyph overlay (centered) */}
                  {effectiveIsArrow && !isPlayer && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      {renderArrowVector(effectiveTileType)}
                    </div>
                  )}

                  {/* Spawn marker dino (dimmed) */}
                  {isSpawnMarker && (
                    <SpawnMarker rotate={rotateUpright} />
                  )}

                  {/* Player dino */}
                  {isPlayer && (
                    <PlayerSprite rotate={rotateUpright} />
                  )}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
