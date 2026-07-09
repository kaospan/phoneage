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
<< copilot/fix-pinch-zoom-gesture
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
const PINCH_ZOOM_STEP_DISTANCE_PX = 18;
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

const facingFromDelta = (dx: number, dy: number, fallback: FacingDirection): FacingDirection => {
  if (dx > 0) return "right";
  if (dx < 0) return "left";
  if (dy > 0) return "down";
  if (dy < 0) return "up";
  return fallback;
};

const distanceBetweenTouches = (firstTouch: Touch, secondTouch: Touch) => (
  Math.hypot(secondTouch.clientX - firstTouch.clientX, secondTouch.clientY - firstTouch.clientY)
);

const facingTowardTarget = (
  from: Position,
  target: Position,
  fallback: FacingDirection
): FacingDirection => {
  const dx = target.x - from.x;
  const dy = target.y - from.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    return facingFromDelta(dx, 0, fallback);
  }

  return facingFromDelta(0, dy, fallback);
};

const deltaFromFacing = (facing: FacingDirection): { dx: number; dy: number } => {
  switch (facing) {
    case "up":
      return { dx: 0, dy: -1 };
    case "right":
      return { dx: 1, dy: 0 };
    case "down":
      return { dx: 0, dy: 1 };
    case "left":
      return { dx: -1, dy: 0 };
    default:
      return { dx: 0, dy: -1 };
  }
};

type LevelData = ReturnType<typeof getAllLevels>[number];

interface LevelCompletionSummary {
  levelId: number;
  moves: number;
  timeLeftSeconds: number | null;
  bestMoves: number | null;
  bestTimeLeftSeconds: number | null;
  isFirstClear: boolean;
  isNewBestMoves: boolean;
  isNewBestTime: boolean;
  completedCount: number;
  totalLevels: number;
}

interface StoredLevelOverrideShape {
  grid?: unknown;
}

type BrowserFullscreenDocument = Document & {
  webkitExitFullscreen?: () => Promise<void> | void;
  msExitFullscreen?: () => Promise<void> | void;
};

type BrowserFullscreenElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
  msRequestFullscreen?: () => Promise<void> | void;
};
#REPLACE_SECTION_END

#REPLACE_SECTION_START:256:260
  // Dragging state for panning the view
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragOffsetStart, setDragOffsetStart] = useState({ x: 0, z: 0 });
  const pinchDistanceRef = useRef<number | null>(null);

#REPLACE_SECTION_START:1628:1656
    // Touch handlers for mobile dragging
    const handleTouchStart = (e: React.TouchEvent) => {
      if (viewMode === 'fps' || viewMode === 'sprite') return;
      if (e.touches.length >= 2) {
        pinchDistanceRef.current = distanceBetweenTouches(e.touches[0], e.touches[1]);
        setIsDragging(false);
        return;
      }
      pinchDistanceRef.current = null;
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        setIsDragging(true);
        setDragStart({ x: touch.clientX, y: touch.clientY });
        setDragOffsetStart({ x: cameraOffset.x, z: cameraOffset.z });
      }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
      if (viewMode === 'fps' || viewMode === 'sprite') return;
      if (e.touches.length >= 2) {
        const nextDistance = distanceBetweenTouches(e.touches[0], e.touches[1]);
        const previousDistance = pinchDistanceRef.current;
        setIsDragging(false);
        if (previousDistance === null) {
          pinchDistanceRef.current = nextDistance;
          return;
        }
        const distanceDelta = nextDistance - previousDistance;
        if (Math.abs(distanceDelta) < PINCH_ZOOM_STEP_DISTANCE_PX) return;
        pinchDistanceRef.current = nextDistance;
        setUserZoomTouched(true);
        setCameraZoomIndex((index) => {
          if (distanceDelta > 0) {
            return Math.min(CAMERA_ZOOM_LEVELS.length - 1, index + 1);
          }
          return Math.max(0, index - 1);
        });
        return;
      }
      if (isDragging && e.touches.length === 1) {
        const touch = e.touches[0];
        const deltaX = touch.clientX - dragStart.x;
        const deltaY = touch.clientY - dragStart.y;

        const sensitivity = 0.01;
        setCameraOffset({
          x: dragOffsetStart.x - deltaX * sensitivity,
          z: dragOffsetStart.z + deltaY * sensitivity
        });
      }
    };

    const handleTouchEnd = (e: React.TouchEvent) => {
      if (e.touches.length >= 2) {
        pinchDistanceRef.current = distanceBetweenTouches(e.touches[0], e.touches[1]);
        return;
      }
      pinchDistanceRef.current = null;
      if (e.touches.length === 1) {
        const touch = e.touches[0];
        setDragStart({ x: touch.clientX, y: touch.clientY });
        setDragOffsetStart({ x: cameraOffset.x, z: cameraOffset.z });
        setIsDragging(true);
        return;
      }
      setIsDragging(false);
    };