import type { CellType } from "@/game/types";

export type TutorialId =
  | "basics"
  | "arrow-single"
  | "arrow-multi"
  | "teleport"
  | "key-lock"
  | "breakable-rock"
  | "bonus-time";

export type TutorialSound = "tap" | "glide" | "unlock" | "collect" | "teleport" | "break" | "chime";

export interface TutorialStep {
  /** Character's cell in the mini demo grid for this step. */
  characterAt: { x: number; y: number };
  /** Where the animated finger/pointer taps or rests during this step; omitted to hide it. */
  fingerAt?: { x: number; y: number };
  /** Cells to highlight with a glowing outline during this step. */
  highlightCells?: Array<{ x: number; y: number }>;
  /** Camera focus point (mini-grid cell coordinates) and zoom level (1 = fit whole board). */
  cameraFocus: { x: number; y: number };
  cameraZoom: number;
  durationMs: number;
  slowMotion?: boolean;
  sound?: TutorialSound;
  /** Optional secondary line shown only for this step (e.g. "Tap again to redirect"). */
  caption?: string;
}

export interface TutorialDefinition {
  id: TutorialId;
  title: string;
  /** 1-2 short sentences, shown for the whole sequence. */
  text: string;
  /** Cell types that trigger this tutorial the first time they appear in a level's grid. */
  triggerCellTypes: CellType[];
  /** Small hand-authored demo grid (cell type numbers) — kept tiny so the mini-board reads clearly. */
  miniGrid: number[][];
  steps: TutorialStep[];
}
