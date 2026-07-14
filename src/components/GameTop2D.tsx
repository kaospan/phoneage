import React, { useEffect, useMemo, useRef, useState } from "react";
import { isArrowCell } from "@/game/arrows";
import { buildGoalCaveKeySet } from "@/game/caves";
import dinotoonUrl from "@/assets/dinotoon.png";
import { themes, type ColorTheme } from "@/data/levels";
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
  theme?: ColorTheme;
  onArrowClick?: (x: number, y: number) => void;
  onCancelSelection?: () => void;
}

// ─── Color helpers (for theme-driven tile shading) ────────────────────────────

const hexToRgbTriple = (hex: string): [number, number, number] => {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const bigint = parseInt(full, 16);
  if (Number.isNaN(bigint)) return [128, 128, 128];
  return [(bigint >> 16) & 255, (bigint >> 8) & 255, bigint & 255];
};

const mixHex = (hex: string, amount: number, toward: 0 | 255): string => {
  const [r, g, b] = hexToRgbTriple(hex);
  const clamp = (v: number) => Math.max(0, Math.min(255, Math.round(v)));
  const nr = clamp(r + (toward - r) * amount);
  const ng = clamp(g + (toward - g) * amount);
  const nb = clamp(b + (toward - b) * amount);
  return `rgb(${nr}, ${ng}, ${nb})`;
};

const lightenHex = (hex: string, amount: number) => mixHex(hex, amount, 255);
const darkenHex = (hex: string, amount: number) => mixHex(hex, amount, 0);

/** Small stable hash so per-tile texture flecks are deterministic (no re-randomizing on re-render). */
const hashUid = (uid: string): number => {
  let h = 0;
  for (let i = 0; i < uid.length; i++) h = (h * 31 + uid.charCodeAt(i)) >>> 0;
  return h;
};

const SPRITE_ZOOM_BASELINE_FACTOR = 0.66;

// ─── Tile Components ─────────────────────────────────────────────────────────

const VoidTile = () => (
  <div className="w-full h-full" style={{ background: "#060508" }} />
);

/** Sandy dirt-path floor — amber/orange with scattered pebbles and grain marks */
const FloorTile = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`fg${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#D49A3C" />
        <stop offset="50%" stopColor="#B87C24" />
        <stop offset="100%" stopColor="#96601A" />
      </linearGradient>
      {/* Warm top-light bloom */}
      <radialGradient id={`fgl${uid}`} cx="28%" cy="28%" r="55%">
        <stop offset="0%" stopColor="rgba(255,215,100,0.16)" />
        <stop offset="100%" stopColor="rgba(255,215,100,0)" />
      </radialGradient>
    </defs>
    {/* Sandy dirt base */}
    <rect width="100" height="100" fill={`url(#fg${uid})`} />
    {/* Top-light sheen */}
    <rect width="100" height="100" fill={`url(#fgl${uid})`} />
    {/* Pebbles — each: outer shadow circle, main pebble, tiny shine */}
    <circle cx="18" cy="15" r="4.8" fill="rgba(70,35,5,0.20)" />
    <circle cx="18" cy="15" r="4.0" fill="rgba(155,96,28,0.55)" />
    <circle cx="17" cy="14" r="1.3" fill="rgba(255,215,120,0.32)" />

    <circle cx="74" cy="22" r="3.8" fill="rgba(70,35,5,0.18)" />
    <circle cx="74" cy="22" r="3.1" fill="rgba(148,88,22,0.50)" />
    <circle cx="73.2" cy="21.2" r="1.0" fill="rgba(255,215,120,0.28)" />

    <circle cx="38" cy="56" r="5.2" fill="rgba(70,35,5,0.20)" />
    <circle cx="38" cy="56" r="4.3" fill="rgba(152,92,24,0.52)" />
    <circle cx="37" cy="55" r="1.5" fill="rgba(255,215,120,0.30)" />

    <circle cx="84" cy="62" r="4.0" fill="rgba(70,35,5,0.18)" />
    <circle cx="84" cy="62" r="3.3" fill="rgba(145,85,20,0.50)" />
    <circle cx="83.2" cy="61.2" r="1.0" fill="rgba(255,215,120,0.26)" />

    <circle cx="58" cy="84" r="4.4" fill="rgba(70,35,5,0.20)" />
    <circle cx="58" cy="84" r="3.6" fill="rgba(150,90,22,0.52)" />
    <circle cx="57" cy="83" r="1.2" fill="rgba(255,215,120,0.28)" />

    <circle cx="12" cy="74" r="3.2" fill="rgba(70,35,5,0.16)" />
    <circle cx="12" cy="74" r="2.6" fill="rgba(140,80,18,0.46)" />

    <circle cx="88" cy="86" r="3.6" fill="rgba(70,35,5,0.16)" />
    <circle cx="88" cy="86" r="2.9" fill="rgba(142,82,18,0.46)" />

    <circle cx="50" cy="30" r="2.8" fill="rgba(70,35,5,0.15)" />
    <circle cx="50" cy="30" r="2.2" fill="rgba(136,78,16,0.42)" />

    <circle cx="28" cy="88" r="2.5" fill="rgba(70,35,5,0.14)" />
    <circle cx="28" cy="88" r="2.0" fill="rgba(134,76,16,0.40)" />
    {/* Fine dirt-grain arc marks */}
    <path d="M30,38 Q38,34 44,38" fill="none" stroke="rgba(65,32,4,0.16)" strokeWidth="1.2" strokeLinecap="round" />
    <path d="M62,50 Q68,46 74,50" fill="none" stroke="rgba(65,32,4,0.13)" strokeWidth="1.0" strokeLinecap="round" />
    <path d="M6,50 Q12,47 18,50"  fill="none" stroke="rgba(65,32,4,0.12)" strokeWidth="1.0" strokeLinecap="round" />
    <path d="M70,76 Q76,73 82,76" fill="none" stroke="rgba(65,32,4,0.12)" strokeWidth="0.9" strokeLinecap="round" />
    <path d="M24,92 Q29,89 34,92" fill="none" stroke="rgba(65,32,4,0.11)" strokeWidth="0.9" strokeLinecap="round" />
    {/* Edge border */}
    <rect width="100" height="100" fill="none" stroke="rgba(65,32,4,0.20)" strokeWidth="1.5" />
  </svg>
);

/** Solid stone wall — cool dark slate with clear multi-block look */
const StoneTile = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`sg${uid}`} x1="0%" y1="10%" x2="100%" y2="90%">
        <stop offset="0%" stopColor="#5E5048" />
        <stop offset="45%" stopColor="#46392D" />
        <stop offset="100%" stopColor="#2E2018" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#sg${uid})`} />
    {/* Top-left face highlight */}
    <polygon points="0,0 100,0 86,13 14,13" fill="rgba(255,255,255,0.14)" />
    <polygon points="0,0 14,13 14,86 0,100" fill="rgba(255,255,255,0.09)" />
    {/* Bottom-right cast shadow */}
    <polygon points="100,100 0,100 14,87 86,87" fill="rgba(0,0,0,0.34)" />
    <polygon points="100,100 100,0 87,14 87,86" fill="rgba(0,0,0,0.24)" />
    {/* Mortar lines suggesting two stones stacked */}
    <line x1="14" y1="52" x2="86" y2="52" stroke="rgba(0,0,0,0.30)" strokeWidth="2" />
    <line x1="14" y1="50" x2="86" y2="50" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
    {/* Stone grain: upper block */}
    <path d="M20,25 Q32,18 42,26 Q46,31 34,35 Q22,36 20,25Z" fill="rgba(255,255,255,0.06)" />
    <path d="M58,30 Q68,24 76,31 Q78,38 68,40 Q58,40 58,30Z" fill="rgba(0,0,0,0.09)" />
    {/* Stone grain: lower block */}
    <path d="M22,65 Q33,59 42,65 Q44,72 35,74 Q23,73 22,65Z" fill="rgba(255,255,255,0.05)" />
    <path d="M55,68 Q66,63 74,68 Q76,75 66,77 Q55,77 55,68Z" fill="rgba(0,0,0,0.08)" />
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,0.42)" strokeWidth="1.5" />
  </svg>
);

/** Breakable rock — warmer, clearly cracked, distinct from solid stone */
const BreakableRockTile = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`brg${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#A88050" />
        <stop offset="50%" stopColor="#8A6238" />
        <stop offset="100%" stopColor="#62421E" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#brg${uid})`} />
    {/* Bevel */}
    <polygon points="0,0 100,0 86,13 14,13" fill="rgba(255,255,255,0.12)" />
    <polygon points="0,0 14,13 14,86 0,100" fill="rgba(255,255,255,0.08)" />
    <polygon points="100,100 0,100 14,87 86,87" fill="rgba(0,0,0,0.28)" />
    <polygon points="100,100 100,0 87,14 87,86" fill="rgba(0,0,0,0.20)" />
    {/* Impact centre — dark pit */}
    <circle cx="50" cy="50" r="5" fill="rgba(0,0,0,0.35)" />
    {/* Crack lines — zigzag for realism */}
    <polyline points="50,50 45,38 38,28 30,14" fill="none" stroke="rgba(15,8,2,0.92)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="50,50 62,44 75,30 86,18" fill="none" stroke="rgba(15,8,2,0.85)" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="50,50 60,58 74,64 88,70" fill="none" stroke="rgba(15,8,2,0.92)" strokeWidth="2.1" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="50,50 52,66 56,78 54,92" fill="none" stroke="rgba(15,8,2,0.80)" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="50,50 36,58 22,70 14,82" fill="none" stroke="rgba(15,8,2,0.88)" strokeWidth="2.0" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="50,50 38,44 28,36 18,32" fill="none" stroke="rgba(15,8,2,0.75)" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    {/* Crack bright edge — light catching the split */}
    <polyline points="50,50 45,38 38,28 30,14" fill="none" stroke="rgba(255,220,150,0.25)" strokeWidth="0.9" strokeLinecap="round" strokeLinejoin="round" />
    <polyline points="50,50 60,58 74,64 88,70" fill="none" stroke="rgba(255,220,150,0.22)" strokeWidth="0.8" strokeLinecap="round" strokeLinejoin="round" />
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,0.35)" strokeWidth="1.5" />
  </svg>
);

/** Cave entrance — dark archway; exit shows a modern green ladder descending into the cave */
const CaveTile = ({ uid, isStart = false, rotate }: { uid: string; isStart?: boolean; rotate?: boolean }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block", transform: rotate ? "rotate(90deg)" : undefined }}>
    <defs>
      {/* Rocky frame gradient */}
      <linearGradient id={`cvf${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#524030" />
        <stop offset="100%" stopColor="#302014" />
      </linearGradient>
      {/* Interior void — slightly bluer/darker for exit to contrast with green */}
      <radialGradient id={`cvd${uid}`} cx="50%" cy="55%" r="70%">
        <stop offset="0%" stopColor={isStart ? "#1E1408" : "#060A08"} />
        <stop offset="65%" stopColor={isStart ? "#0E0A06" : "#020604"} />
        <stop offset="100%" stopColor="#000000" />
      </radialGradient>
      {/* Base atmospheric glow — gold (start) / green (exit) */}
      <radialGradient id={`cvglow${uid}`} cx="50%" cy="100%" r="58%">
        <stop offset="0%" stopColor={isStart ? "rgba(220,170,60,0.25)" : "rgba(34,197,94,0.32)"} />
        <stop offset="100%" stopColor="rgba(0,0,0,0)" />
      </radialGradient>
      {/* Clip: restrict ladder to the inside of the arch */}
      <clipPath id={`archclip${uid}`}>
        <path d="M16,100 L16,48 Q16,10 50,10 Q84,10 84,48 L84,100 Z" />
      </clipPath>
      {/* Metallic green gradient for ladder rails + rungs (horizontal → tube look) */}
      <linearGradient id={`ldr${uid}`} x1="0%" y1="0%" x2="100%" y2="0%">
        <stop offset="0%"   stopColor="#14532D" />
        <stop offset="30%"  stopColor="#16A34A" />
        <stop offset="55%"  stopColor="#22C55E" />
        <stop offset="80%"  stopColor="#15803D" />
        <stop offset="100%" stopColor="#14532D" />
      </linearGradient>
      {/* Green depth glow around the ladder */}
      <radialGradient id={`cvgr${uid}`} cx="50%" cy="62%" r="36%">
        <stop offset="0%" stopColor="rgba(34,197,94,0.26)" />
        <stop offset="100%" stopColor="rgba(34,197,94,0)" />
      </radialGradient>
    </defs>

    {/* ── Rocky outer frame ── */}
    <rect width="100" height="100" fill={`url(#cvf${uid})`} />

    {/* ── Dark void inside arch ── */}
    <path d="M16,100 L16,48 Q16,10 50,10 Q84,10 84,48 L84,100 Z" fill={`url(#cvd${uid})`} />

    {/* ── Exit cave: green ladder descending into the dark ── */}
    {!isStart && (
      <g clipPath={`url(#archclip${uid})`}>
        {/* Diffuse green ambient light cast from the ladder */}
        <ellipse cx="50" cy="62" rx="20" ry="30" fill={`url(#cvgr${uid})`} />
        {/* Left rail */}
        <rect x="37" y="18" width="4.5" height="80" rx="2.25" fill={`url(#ldr${uid})`} />
        <rect x="37.5" y="18" width="1.5" height="80" rx="0.75" fill="rgba(187,247,208,0.50)" />
        {/* Right rail */}
        <rect x="58.5" y="18" width="4.5" height="80" rx="2.25" fill={`url(#ldr${uid})`} />
        <rect x="59" y="18" width="1.5" height="80" rx="0.75" fill="rgba(187,247,208,0.50)" />
        {/* Rungs */}
        {[25, 35, 45, 55, 65, 75, 85, 93].map((ry) => (
          <g key={ry}>
            <rect x="37" y={ry} width="26" height="3.5" rx="1.75" fill={`url(#ldr${uid})`} />
            <rect x="38" y={ry + 0.5} width="24" height="1.2" rx="0.6" fill="rgba(187,247,208,0.55)" />
          </g>
        ))}
        {/* Subtle green floor reflection at bottom */}
        <ellipse cx="50" cy="98" rx="16" ry="4" fill="rgba(34,197,94,0.14)" />
      </g>
    )}

    {/* ── Atmospheric bottom glow (gold/green) ── */}
    <ellipse cx="50" cy="96" rx="26" ry="11" fill={`url(#cvglow${uid})`} />

    {/* ── Arch stone rim ── */}
    <path d="M16,48 Q16,10 50,10 Q84,10 84,48"
          fill="none" stroke="rgba(160,130,90,0.72)" strokeWidth="3" />
    {/* Inner receding arch shadow */}
    <path d="M23,100 L23,50 Q23,20 50,20 Q77,20 77,50 L77,100 Z" fill="rgba(0,0,0,0.22)" />
    <path d="M23,50 Q23,20 50,20 Q77,20 77,50"
          fill="none" stroke="rgba(80,60,40,0.48)" strokeWidth="1.5" />
    {/* Keystone block */}
    <path d="M44,10 L50,4 L56,10 Z" fill="rgba(150,118,75,0.65)" />

    {/* ── Frame rock texture — left ── */}
    <path d="M4,24 Q11,18 17,24 Q19,32 12,34 Q3,33 4,24Z" fill="rgba(255,255,255,0.07)" />
    <path d="M4,56 Q11,50 17,55 Q19,63 12,65 Q3,64 4,56Z" fill="rgba(0,0,0,0.12)" />
    <path d="M4,78 Q10,73 15,77 Q16,84 10,85 Q3,85 4,78Z" fill="rgba(255,255,255,0.05)" />
    {/* ── Frame rock texture — right ── */}
    <path d="M83,36 Q90,30 97,36 Q99,44 92,46 Q83,45 83,36Z" fill="rgba(255,255,255,0.07)" />
    <path d="M84,60 Q91,54 98,60 Q100,68 93,70 Q84,69 84,60Z" fill="rgba(0,0,0,0.10)" />
    <path d="M84,80 Q90,75 96,79 Q98,86 92,88 Q84,87 84,80Z" fill="rgba(255,255,255,0.05)" />

    {/* ── Top bevel ── */}
    <polygon points="0,0 100,0 86,13 14,13" fill="rgba(255,255,255,0.08)" />
    <polygon points="0,0 14,13 14,86 0,100" fill="rgba(255,255,255,0.06)" />
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,0.42)" strokeWidth="1.5" />
  </svg>
);

/**
 * Stone wall — a squat 4-sided pyramid per tile (one square base, 4 triangular faces meeting
 * at a center apex), the same "block" language as the reference art. Repeated edge-to-edge,
 * a run of these reads as one continuous ridge of stone rather than isolated tiles.
 */
const StoneWallTile = ({ uid, baseColor }: { uid: string; baseColor: string }) => {
  const top = lightenHex(baseColor, 0.32);
  const left = lightenHex(baseColor, 0.10);
  const right = darkenHex(baseColor, 0.24);
  const bottom = darkenHex(baseColor, 0.44);
  const h = hashUid(uid);
  const fleckA = { x: 20 + (h % 15), y: 18 + ((h >> 4) % 15) };
  const fleckB = { x: 66 + ((h >> 8) % 16), y: 62 + ((h >> 12) % 18) };
  return (
    <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
      {/* Base fill (guards against hairline seams between adjacent triangles) */}
      <rect width="100" height="100" fill={bottom} />
      {/* 4-sided pyramid: triangles fanning from each edge to the center apex */}
      <polygon points="0,0 100,0 50,50" fill={top} />
      <polygon points="0,0 50,50 0,100" fill={left} />
      <polygon points="100,0 100,100 50,50" fill={right} />
      <polygon points="0,100 50,50 100,100" fill={bottom} />
      {/* Apex highlight — catches the light at the pyramid's peak */}
      <circle cx="50" cy="50" r="3.2" fill="rgba(255,255,255,0.22)" />
      <circle cx="50" cy="50" r="1.3" fill="rgba(255,255,255,0.30)" />
      {/* Subtle hand-hewn texture flecks, deterministic per-tile */}
      <circle cx={fleckA.x} cy={fleckA.y} r="1.6" fill="rgba(0,0,0,0.16)" />
      <circle cx={fleckB.x} cy={fleckB.y} r="1.3" fill="rgba(255,255,255,0.10)" />
      <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,0.40)" strokeWidth="1.5" />
    </svg>
  );
};

/** Water tile — deep blue with concentric ripples and highlights */
const WaterTile = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`wg${uid}`} x1="0%" y1="0%" x2="0%" y2="100%">
        <stop offset="0%" stopColor="#1E90E8" />
        <stop offset="40%" stopColor="#1260C0" />
        <stop offset="100%" stopColor="#082878" />
      </linearGradient>
      <radialGradient id={`wc${uid}`} cx="40%" cy="35%" r="45%">
        <stop offset="0%" stopColor="rgba(100,200,255,0.18)" />
        <stop offset="100%" stopColor="rgba(100,200,255,0)" />
      </radialGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#wg${uid})`} />
    {/* Caustic light patch */}
    <ellipse cx="38" cy="34" rx="28" ry="18" fill={`url(#wc${uid})`} />
    {/* Concentric ripple rings */}
    <ellipse cx="50" cy="55" rx="35" ry="10" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.5" />
    <ellipse cx="50" cy="55" rx="24" ry="6.5" fill="none" stroke="rgba(255,255,255,0.17)" strokeWidth="1.1" />
    <ellipse cx="50" cy="55" rx="13" ry="3.5" fill="none" stroke="rgba(255,255,255,0.13)" strokeWidth="0.9" />
    {/* Secondary ripple set */}
    <ellipse cx="28" cy="36" rx="12" ry="3.5" fill="none" stroke="rgba(255,255,255,0.14)" strokeWidth="0.9" />
    {/* Surface shine strokes */}
    <path d="M14,24 Q22,19 30,24" fill="none" stroke="rgba(255,255,255,0.55)" strokeWidth="2.8" strokeLinecap="round" />
    <path d="M64,32 Q72,27 80,32" fill="none" stroke="rgba(255,255,255,0.42)" strokeWidth="2.2" strokeLinecap="round" />
    <path d="M20,48 Q27,44 34,48" fill="none" stroke="rgba(255,255,255,0.30)" strokeWidth="1.8" strokeLinecap="round" />
    <path d="M68,62 Q74,58 80,62" fill="none" stroke="rgba(255,255,255,0.22)" strokeWidth="1.4" strokeLinecap="round" />
    {/* Specular dots */}
    <circle cx="42" cy="28" r="1.6" fill="rgba(255,255,255,0.38)" />
    <circle cx="72" cy="44" r="1.3" fill="rgba(255,255,255,0.30)" />
    <circle cx="24" cy="60" r="1.0" fill="rgba(255,255,255,0.22)" />
    <rect width="100" height="100" fill="none" stroke="rgba(8,40,120,0.50)" strokeWidth="1.5" />
  </svg>
);

// ─── Arrow Vector ─────────────────────────────────────────────────────────────

const renderArrowVector = (tileType: number) => {
  const shadow =
    "drop-shadow(0 1px 2px rgba(0,0,0,0.95)) drop-shadow(0 0 5px rgba(0,0,0,0.75))";
  const common = {
    fill: "#f6c84f",
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
  };

  const OneArrow = ({ dir }: { dir: "up" | "right" | "down" | "left" }) => {
    const rotations = { up: 0, right: 90, down: 180, left: 270 };
    return (
      <g transform={`rotate(${rotations[dir]} 16 16)`}>
        <path d="M12 26 L12 14 L7 14 L16 5 L25 14 L20 14 L20 26 Z"
              stroke="rgba(16,18,12,0.92)" strokeWidth="4.2" {...common} />
        <path d="M12 26 L12 14 L7 14 L16 5 L25 14 L20 14 L20 26 Z"
              stroke="#fff8c8" strokeWidth="1.7" {...common} />
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
    tileType === 7  ? <OneArrow dir="up"    /> :
    tileType === 8  ? <OneArrow dir="right" /> :
    tileType === 9  ? <OneArrow dir="down"  /> :
    tileType === 10 ? <OneArrow dir="left"  /> :
    tileType === 11 ? <GlyphPath d={doubleVerticalPath}   /> :
    tileType === 12 ? <GlyphPath d={doubleHorizontalPath} /> :
    tileType === 13 ? <GlyphPath d={omniPath} /> :
    null;

  if (!shape) return null;

  return (
    <svg viewBox="0 0 32 32" className="h-[78%] w-[78%]" aria-hidden style={{ filter: shadow }}>
      {shape}
    </svg>
  );
};

// ─── Arrow background — warm amber stone with deeper bevel ────────────────────

const ArrowBgTile = ({ uid }: { uid: string }) => (
  <svg viewBox="0 0 100 100" width="100%" height="100%" style={{ display: "block" }}>
    <defs>
      <linearGradient id={`abg${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stopColor="#C8A455" />
        <stop offset="50%" stopColor="#A87E30" />
        <stop offset="100%" stopColor="#7A5618" />
      </linearGradient>
    </defs>
    <rect width="100" height="100" fill={`url(#abg${uid})`} />
    <polygon points="0,0 100,0 86,13 14,13" fill="rgba(255,255,255,0.13)" />
    <polygon points="0,0 14,13 14,86 0,100" fill="rgba(255,255,255,0.09)" />
    <polygon points="100,100 0,100 14,87 86,87" fill="rgba(0,0,0,0.28)" />
    <polygon points="100,100 100,0 87,14 87,86" fill="rgba(0,0,0,0.20)" />
    {/* Subtle etched cross-hatch */}
    <line x1="14" y1="50" x2="86" y2="50" stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
    <line x1="50" y1="14" x2="50" y2="86" stroke="rgba(0,0,0,0.12)" strokeWidth="1" />
    <rect width="100" height="100" fill="none" stroke="rgba(0,0,0,0.32)" strokeWidth="1.5" />
  </svg>
);

// ─── Player / spawn sprites using dinotoon ────────────────────────────────────

/** Player dino — dark oval shadow behind the image so screen-blend keeps strong green */
const PlayerSprite = ({ rotate }: { rotate?: boolean }) => {
  const t = rotate ? "translateX(-50%) rotate(90deg)" : "translateX(-50%)";
  return (
    <>
      {/* Dark neutral oval: gives screen-blend a dark base so dino stays saturated */}
      <div
        className="pointer-events-none absolute bottom-[4%] left-1/2 h-[90%] w-[90%]"
        style={{
          transform: t,
          background:
            "radial-gradient(ellipse at 50% 58%, rgba(0,0,0,0.60) 0%, rgba(0,0,0,0.30) 42%, rgba(0,0,0,0) 68%)",
        }}
      />
      <img
        src={dinotoonUrl}
        alt="Hero"
        className="pointer-events-none absolute bottom-[4%] left-1/2 h-[90%] w-[90%] max-w-none object-contain object-bottom"
        style={{
          imageRendering: "auto",
          mixBlendMode: "screen",
          filter: "saturate(1.5) contrast(1.08)",
          transform: t,
        }}
      />
    </>
  );
};

// ─── Icon tile (keys, locks, hourglass, teleport) ─────────────────────────────

const IconTile = ({
  iconUrl,
  bgColor,
  rotate,
}: {
  iconUrl: string | null;
  bgColor: string;
  uid: string;
  rotate?: boolean;
}) => {
  if (!iconUrl) return <div className="w-full h-full" style={{ background: bgColor }} />;
  return (
    <div className="w-full h-full flex items-center justify-center" style={{ background: bgColor }}>
      <img
        src={iconUrl}
        alt=""
        aria-hidden
        className="pointer-events-none"
        style={{
          width: "72%",
          height: "72%",
          objectFit: "contain",
          imageRendering: "auto",
          transform: rotate ? "rotate(90deg)" : undefined,
        }}
      />
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
  theme,
  onArrowClick,
  onCancelSelection,
}: GameTop2DProps) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [availableSize, setAvailableSize] = useState({ width: 0, height: 0 });
  const localPlayer = players.find((p) => p.isLocal) ?? players[0];
  const wallColor = themes[theme ?? "default"].wall;

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

  // Icons at 128 px — crisp when downscaled
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
              const displayTileType = isPlayer && tileType === 18 ? 0 : tileType;
              const isArrow = isArrowCell(cell) || cell === 11 || cell === 12 || cell === 13;
              const isSelected = selectedArrow?.x === x && selectedArrow?.y === y;
              const isSelector = selectorPos?.x === x && selectorPos?.y === y;
              const effectiveTileType =
                isPlayer && displayTileType >= 7 && displayTileType <= 13
                  ? 0
                  : displayTileType;
              const effectiveIsArrow = effectiveTileType >= 7 && effectiveTileType <= 13;

              const needsUprightIcon =
                effectiveTileType === 3  ||
                effectiveTileType === 18 ||
                effectiveTileType === 16 ||
                effectiveTileType === 17 ||
                effectiveTileType === 20;

              const renderTileBg = () => {
                switch (effectiveTileType) {
                  case 5:  return <VoidTile />;
                  case 0:  return <FloorTile uid={uid} />;
                  case 2:  return <StoneTile uid={uid} />;
                  case 6:  return <BreakableRockTile uid={uid} />;
                  case 1:  return <StoneWallTile uid={uid} baseColor={wallColor} />;
                  case 4:  return <WaterTile uid={uid} />;
                  case 3:  return <CaveTile uid={uid} isStart={false} rotate={rotateUpright} />;
                  case 18: return <CaveTile uid={uid} isStart rotate={rotateUpright} />;
                  case 14: return <IconTile uid={uid} iconUrl={redKeyUrl}    bgColor="rgba(200,30,30,0.20)"   rotate={rotateUpright && needsUprightIcon} />;
                  case 15: return <IconTile uid={uid} iconUrl={greenKeyUrl}  bgColor="rgba(20,160,70,0.20)"   rotate={rotateUpright && needsUprightIcon} />;
                  case 16: return <IconTile uid={uid} iconUrl={redLockUrl}   bgColor="rgba(130,10,10,0.88)"   rotate={rotateUpright && needsUprightIcon} />;
                  case 17: return <IconTile uid={uid} iconUrl={greenLockUrl} bgColor="rgba(10,90,25,0.88)"    rotate={rotateUpright && needsUprightIcon} />;
                  case 19: return <IconTile uid={uid} iconUrl={teleportUrl}  bgColor="rgba(70,0,140,0.78)"    rotate={false} />;
                  case 20: return <IconTile uid={uid} iconUrl={hourglassUrl} bgColor="rgba(100,65,0,0.50)"    rotate={rotateUpright && needsUprightIcon} />;
                  default:
                    if (effectiveIsArrow) return <ArrowBgTile uid={uid} />;
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
                  {renderTileBg()}

                  {effectiveIsArrow && !isPlayer && (
                    <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                      {renderArrowVector(effectiveTileType)}
                    </div>
                  )}

                  {isPlayer && <PlayerSprite rotate={rotateUpright} />}
                </div>
              );
            }),
          )}
        </div>
      </div>
    </div>
  );
}
