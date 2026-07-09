import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  BookOpen,
  Compass,
  Expand,
  LayoutDashboard,
  Map as MapIcon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Play,
  RotateCcw,
  Sparkles,
  Star,
  TimerReset,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { getAllLevels, themes, manualFallbackById } from "@/data/levels";
import { Game3D } from "./Game3D";
import { GameSprite2D } from "./GameSprite2D";
import { ADMIN_MODE_UPDATED_EVENT, getAdminMode } from "@/lib/adminMode";
import { Thumbstick } from "./Thumbstick";
import { CellType, GameState, KeyInventory, Position } from "@/game/types";
import { isArrowCell } from "@/game/arrows";
import { buildGoalCaveKeySet, findGoalCaves } from "@/game/caves";
import { attemptPlayerMove, attemptRemoteArrowMove } from "@/game/movement";
import { buildLevelFromSources } from "@/lib/levelImageDetection";
import { LEVEL_OVERRIDES_UPDATED_EVENT, saveLevelOverride } from "@/lib/levelOverrides";
import { seedDefaultReferences } from "@/lib/referenceSeeder";
import {
  formatCampaignClock,
  getCompletedLevelCount,
  getHighestUnlockedLevelIndex,
  getLevelCampaignRecord,
  loadCampaignProgress,
  recordLevelCompletion,
  saveCampaignProgress,
  setLastPlayedLevel,
  syncCampaignProgress,
  type CampaignProgressState,
} from "@/lib/campaignProgress";
import { useIsMobile } from "@/hooks/use-mobile";
import { CampaignDialog } from "./CampaignDialog";
import { HowToPlayDialog } from "./HowToPlayDialog";
import { TouchControls } from "./TouchControls";
import { getLevelImageUrl } from "@/components/level-mapper/levelImageStore";
import menuArt from "@/assets/menu.png";

console.log('📦 PuzzleGame.tsx loading...');

type PlayerId = string;
type FacingDirection = "up" | "right" | "down" | "left";

const isKeyboardShortcutTarget = (target: EventTarget | null): target is HTMLElement => {
  if (!(target instanceof HTMLElement)) return false;
  return !target.closest("button, input, textarea, select, [contenteditable='true'], [role='dialog']");
};

type InputCommand =
  | { type: "move"; dx: number; dy: number; seq: number }
  | { type: "select"; x: number; y: number; seq: number }
  | { type: "deselect"; seq: number };

type QueuedInputCommand =
  | { type: "move"; dx: number; dy: number }
  | { type: "select"; x: number; y: number }
  | { type: "deselect" };

interface SimPlayer {
  id: PlayerId;
  pos: Position;
  facing: FacingDirection;
  isLocal: boolean;
  color: string;
  keys: KeyInventory;
  selectedArrow: Position | null;
  isGliding: boolean;
  glidePath: Position[] | null;
  glideArrowType: CellType | null;
  glideIndex: number;
  moves: number;
}

interface ArrowGlide {
  ownerId: PlayerId;
  from: Position;
  path: Position[];
  arrowType: CellType;
  index: number;
}

interface SimulationState {
  grid: CellType[][];
  baseGrid: CellType[][];
  breakableRockStates: Map<string, boolean>;
  players: Map<PlayerId, SimPlayer>;
  arrowGlides: ArrowGlide[];
  goalCaveKeys: Set<string>;
  cavePos: Position;
  tick: number;
}

// Camera zoom values (multipliers). Lower = closer / larger board. Higher = farther / smaller board.
// The old 152% close view used zoomFactor 0.66; that is now the semantic 100% baseline.
const CAMERA_BASELINE_ZOOM_FACTOR = 0.66;
const CAMERA_ZOOM_PERCENT_LEVELS = Array.from({ length: 19 }, (_, index) => 60 + index * 5);
const CAMERA_ZOOM_LEVELS = CAMERA_ZOOM_PERCENT_LEVELS.map((percent) => CAMERA_BASELINE_ZOOM_FACTOR / (percent / 100));
const DEFAULT_CAMERA_ZOOM_INDEX = CAMERA_ZOOM_PERCENT_LEVELS.indexOf(100);
const MOBILE_DEFAULT_CAMERA_ZOOM_INDEX = DEFAULT_CAMERA_ZOOM_INDEX;
const VIEW_MODES = ["3d", "fps", "2d", "sprite"] as const;
type ViewMode = (typeof VIEW_MODES)[number];
const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  "3d": "3D",
  fps: "FPS",
  "2d": "2D",
  sprite: "SPR",
};
const EMPTY_KEYS: KeyInventory = { red: 0, green: 0 };
const DEFAULT_BONUS_TIME_SECONDS = 50;

export const PuzzleGame = () => {
  console.log('⚛️ PuzzleGame component rendering...');

  // Placeholder component - file needs to be restored
  return (
    <div className="flex items-center justify-center h-screen bg-gray-900 text-white">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4">Stone Age</h1>
        <p className="text-xl">Loading...</p>
      </div>
    </div>
  );
};
