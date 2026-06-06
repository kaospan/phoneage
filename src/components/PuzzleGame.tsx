import { useState, useEffect, useCallback, useMemo, useRef, useLayoutEffect } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  BookOpen,
  Compass,
  Expand,
  LayoutDashboard,
  Map as MapIcon,
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
import { UI_SETTINGS_UPDATED_EVENT, getShowCoordsOverlay, setShowCoordsOverlay } from "@/lib/uiSettings";
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
import menuArt from "@/assets/menu.png";

console.log('📦 PuzzleGame.tsx loading...');

type PlayerId = string;
type FacingDirection = "up" | "right" | "down" | "left";

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
// The HUD shows percent as `Math.round((1 / zoomFactor) * 100)` to match existing semantics.
// Add extra zoom-in steps at the end so mobile/fullscreen can fill the viewport without clipping.
const CAMERA_ZOOM_LEVELS = [1.16, 1.08, 1.0, 0.97, 0.93, 0.9, 0.86, 0.82, 0.78, 0.74] as const;
const DEFAULT_CAMERA_ZOOM_INDEX = 4; // 0.93 => ~108% (desktop/tablet baseline)
// Mobile baseline: default to ~122% (0.82) so tiles are readable on phones.
const MOBILE_DEFAULT_CAMERA_ZOOM_INDEX = (() => {
  const target = 0.82; // ~122%
  let idx = CAMERA_ZOOM_LEVELS.findIndex((z) => Math.abs(z - target) < 1e-6);
  if (idx >= 0) return idx;

  // Fallback: closest match if the list changes.
  idx = 0;
  let best = Number.POSITIVE_INFINITY;
  for (let i = 0; i < CAMERA_ZOOM_LEVELS.length; i += 1) {
    const d = Math.abs(CAMERA_ZOOM_LEVELS[i] - target);
    if (d < best) {
      best = d;
      idx = i;
    }
  }
  return idx;
})();
// On mobile, auto-fit should not zoom in beyond the baseline 122% unless the user does it manually (+ button).
const MOBILE_AUTO_FIT_MAX_ZOOM_IN_INDEX = (() => {
  return MOBILE_DEFAULT_CAMERA_ZOOM_INDEX;
})();
  const VIEW_MODES = ["3d", "fps", "2d", "sprite"] as const;
  type ViewMode = (typeof VIEW_MODES)[number];
const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  "3d": "3D",
  fps: "FPS",
  "2d": "2D",
  sprite: "SPR",
  };
const EMPTY_KEYS: KeyInventory = { red: false, green: false };
const DEFAULT_BONUS_TIME_SECONDS = 50;

type GridContentSize = { width: number; height: number };

const computeNonVoidContentSize = (grid: number[][] | undefined): GridContentSize => {
  const rows = grid?.length ?? 0;
  const cols = grid?.[0]?.length ?? 0;
  if (!grid || rows <= 0 || cols <= 0) return { width: 1, height: 1 };

  let minX = Number.POSITIVE_INFINITY;
  let maxX = Number.NEGATIVE_INFINITY;
  let minY = Number.POSITIVE_INFINITY;
  let maxY = Number.NEGATIVE_INFINITY;

  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < (grid[y]?.length ?? 0); x += 1) {
      if (grid[y][x] === 5) continue;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    }
  }

  if (!Number.isFinite(minX) || !Number.isFinite(minY)) return { width: cols, height: rows };
  return {
    width: Math.max(1, maxX - minX + 1),
    height: Math.max(1, maxY - minY + 1),
  };
};

const pickBestZoomIndexForContent = ({
  content,
  aspect,
  viewMode,
}: {
  content: GridContentSize;
  aspect: number;
  viewMode: "3d" | "2d";
}) => {
  // Mirrors the camera's own "view size" approximation (see Game3D.tsx):
  // viewHeight = 2 * tan(fov/2) * cameraHeight
  // cameraHeight = baseCameraHeight * zoomFactor
  const fov = viewMode === "2d" ? 42 : 50;
  const baseCameraHeight = viewMode === "2d" ? 24 : 18;
  const fovRad = fov * (Math.PI / 180);
  const k = 2 * Math.tan(fovRad / 2) * baseCameraHeight;

  // Small margin so tiles don't sit flush against the edges.
  const needW = content.width * 1.08;
  const needH = content.height * 1.08;

  // Choose the most zoomed-in option that still fits the content.
  for (let i = CAMERA_ZOOM_LEVELS.length - 1; i >= 0; i -= 1) {
    const z = CAMERA_ZOOM_LEVELS[i];
    const viewH = k * z;
    const viewW = viewH * Math.max(0.1, aspect);
    if (viewW >= needW && viewH >= needH) return i;
  }

  return 0;
};

const facingFromDelta = (dx: number, dy: number, fallback: FacingDirection): FacingDirection => {
  if (dx > 0) return "right";
  if (dx < 0) return "left";
  if (dy > 0) return "down";
  if (dy < 0) return "up";
  return fallback;
};

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

export const PuzzleGame = () => {
  console.log('⚛️ PuzzleGame component rendering...');

  const isMobile = useIsMobile();
  const [isPortrait, setIsPortrait] = useState(false);
  const shouldRotateGate = false;
  const showRotateHint = isMobile && isPortrait;
  const isMobileLandscape = isMobile && !isPortrait;

  const [isFullscreenMode, setIsFullscreenMode] = useState(() => {
    if (typeof window === "undefined") return false;
    try {
      return localStorage.getItem("stone-age-fullscreen-mode") === "1";
    } catch {
      return false;
    }
  });
  const [showDpad, setShowDpad] = useState(() => {
    if (typeof window === "undefined") return true;
    try {
      // Default to ON; user can hide it via the in-game toggle (mobile only).
      return localStorage.getItem("stone-age-show-dpad") !== "0";
    } catch {
      return true;
    }
  });
  const prevZoomIndexRef = useRef<number | null>(null);
  const gestureSurfaceRef = useRef<HTMLDivElement | null>(null);
  const [userZoomTouched, setUserZoomTouched] = useState(false);
  const [fitRevision, setFitRevision] = useState(0);
  const initialCampaignProgressRef = useRef<CampaignProgressState | null>(null);

  if (initialCampaignProgressRef.current == null) {
    initialCampaignProgressRef.current = loadCampaignProgress();
  }

  const [currentLevelIndex, setCurrentLevelIndex] = useState(() =>
    Math.max(0, (initialCampaignProgressRef.current?.lastPlayedLevelId ?? 1) - 1)
  );
  const [campaignProgress, setCampaignProgress] = useState<CampaignProgressState>(
    () => initialCampaignProgressRef.current ?? loadCampaignProgress()
  );
  const [renderGrid, setRenderGrid] = useState<CellType[][]>([]);
  const [renderPlayers, setRenderPlayers] = useState<SimPlayer[]>([]);
  const [renderCavePos, setRenderCavePos] = useState({ x: 0, y: 0 });
  const [activeLevel, setActiveLevel] = useState<LevelData | null>(null);
  const [moves, setMoves] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [completionSummary, setCompletionSummary] = useState<LevelCompletionSummary | null>(null);
  // Keep the user's chosen view mode persistent; default to sprite if not set.
  const [viewMode, setViewMode] = useState<ViewMode>(() => {
    if (typeof window === "undefined") return "sprite";
    try {
      const stored = localStorage.getItem("stone-age-view-mode");
      if (stored && (VIEW_MODES as readonly string[]).includes(stored)) {
        return stored as ViewMode;
      }
    } catch {
      // ignore storage failures
    }
    return "sprite";
  });
  const [selectedArrow, setSelectedArrow] = useState<{ x: number, y: number } | null>(null); // For remote arrow control
  const [cameraOffset, setCameraOffset] = useState({ x: 0, z: 0 }); // Camera pan offset when arrow selected
  const [cameraZoomIndex, setCameraZoomIndex] = useState(() => (
    isMobile ? MOBILE_DEFAULT_CAMERA_ZOOM_INDEX : DEFAULT_CAMERA_ZOOM_INDEX
  ));
  // Selector navigation state for keyboard-based arrow selection
  const [selectorPos, setSelectorPos] = useState<{ x: number; y: number } | null>(null);
  const [isSelectorActive, setIsSelectorActive] = useState(false);

  // Dragging state for panning the view
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [dragOffsetStart, setDragOffsetStart] = useState({ x: 0, z: 0 });

  // Player highlight flash state for control transfer feedback
  const [playerFlashCount, setPlayerFlashCount] = useState(0);
  const [isBuilding, setIsBuilding] = useState(false);
  const [buildStatus, setBuildStatus] = useState<string>('');
  const [networkStatus, setNetworkStatus] = useState<'offline' | 'connecting' | 'online'>('offline');
  const [hudMessage, setHudMessage] = useState<string | null>(null);
  const hudMessageTimeoutRef = useRef<number | null>(null);

  // Per-level countdown timer (configured in the mapper).
  const [levelTimeLimitSeconds, setLevelTimeLimitSeconds] = useState<number | null>(null);
  const [timeLeftSeconds, setTimeLeftSeconds] = useState<number | null>(null);
  const [isTimeUp, setIsTimeUp] = useState(false);
  const [isTimerArmed, setIsTimerArmed] = useState(true);
  const isWaitingToStart = Boolean(levelTimeLimitSeconds) && !isTimerArmed && !isComplete && !isBuilding && !isTimeUp;
  const timerRemainingMsRef = useRef(0);
  const timerEndAtMsRef = useRef<number | null>(null);
  const timerIntervalRef = useRef<number | null>(null);
  const timerEnabledRef = useRef(false);
  const campaignProgressRef = useRef<CampaignProgressState>(
    initialCampaignProgressRef.current ?? loadCampaignProgress()
  );
  const didRestoreCampaignLevelRef = useRef(false);

  useEffect(() => {
    campaignProgressRef.current = campaignProgress;
  }, [campaignProgress]);

  const commitCampaignProgress = useCallback((next: CampaignProgressState) => {
    if (next === campaignProgressRef.current) return;
    campaignProgressRef.current = next;
    saveCampaignProgress(next);
    setCampaignProgress(next);
  }, []);

  const updateCampaignProgress = useCallback((updater: (prev: CampaignProgressState) => CampaignProgressState) => {
    const next = updater(campaignProgressRef.current);
    commitCampaignProgress(next);
  }, [commitCampaignProgress]);

  useEffect(() => {
    timerEnabledRef.current = Boolean(levelTimeLimitSeconds);
  }, [levelTimeLimitSeconds]);

  const clearTimerInterval = useCallback(() => {
    if (timerIntervalRef.current != null) {
      window.clearInterval(timerIntervalRef.current);
      timerIntervalRef.current = null;
    }
  }, []);

  const pushHudMessage = useCallback((message: string | null, duration = 1800) => {
    if (hudMessageTimeoutRef.current != null) {
      window.clearTimeout(hudMessageTimeoutRef.current);
      hudMessageTimeoutRef.current = null;
    }

    setHudMessage(message);

    if (!message) return;
    hudMessageTimeoutRef.current = window.setTimeout(() => {
      setHudMessage((current) => (current === message ? null : current));
      hudMessageTimeoutRef.current = null;
    }, duration);
  }, []);

  useEffect(() => {
    return () => {
      if (hudMessageTimeoutRef.current != null) {
        window.clearTimeout(hudMessageTimeoutRef.current);
      }
    };
  }, []);

  const resetLevelTimer = useCallback((limitSeconds: number | undefined) => {
    clearTimerInterval();
    timerEndAtMsRef.current = null;
    timerRemainingMsRef.current = 0;
    setIsTimeUp(false);

    const n = Number(limitSeconds);
    if (!Number.isFinite(n) || n <= 0) {
      setLevelTimeLimitSeconds(null);
      setTimeLeftSeconds(null);
      setIsTimerArmed(true);
      return;
    }

    const sec = Math.min(86400, Math.round(n));
    setLevelTimeLimitSeconds(sec);
    setTimeLeftSeconds(sec);
    timerRemainingMsRef.current = sec * 1000;
    // Auto-start timer on level load/advance (no explicit START button required).
    setIsTimerArmed(true);
  }, [clearTimerInterval]);

  const addLevelTimeSeconds = useCallback((deltaSeconds: number) => {
    const delta = Math.max(0, Math.round(Number(deltaSeconds)));
    if (delta <= 0) return;
    if (!timerEnabledRef.current) return;

    const deltaMs = delta * 1000;
    const maxMs = 86400 * 1000;
    const nextRemaining = Math.min(maxMs, timerRemainingMsRef.current + deltaMs);
    timerRemainingMsRef.current = nextRemaining;

    if (timerEndAtMsRef.current != null) {
      timerEndAtMsRef.current = Math.min(Date.now() + maxMs, timerEndAtMsRef.current + deltaMs);
    } else {
      // If paused for some reason, resume with the extended remaining time.
      timerEndAtMsRef.current = Date.now() + nextRemaining;
    }

    setIsTimeUp(false);
    setTimeLeftSeconds(Math.ceil(nextRemaining / 1000));
  }, []);

  const simRef = useRef<SimulationState | null>(null);
  const inputQueueRef = useRef<Map<PlayerId, InputCommand[]>>(new Map());
  const localPlayerIdRef = useRef<PlayerId>('local');
  const inputSeqRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const lastRenderRef = useRef(0);
  const buildInFlightRef = useRef<Set<number>>(new Set());

  const [overrideRevision, setOverrideRevision] = useState(0);
  const [showCoordsOverlay, setShowCoordsOverlayState] = useState(() => getShowCoordsOverlay());
  const [isAdminMode, setIsAdminMode] = useState(() => getAdminMode());

  // Same-tab localStorage writes do not trigger the 'storage' event, so we also listen to a custom event.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const bump = () => setOverrideRevision((v) => v + 1);
    const onStorage = (e: StorageEvent) => {
      if (!e.key) return;
      if (e.key.startsWith("level_override_")) bump();
    };
    window.addEventListener(LEVEL_OVERRIDES_UPDATED_EVENT, bump as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(LEVEL_OVERRIDES_UPDATED_EVENT, bump as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setShowCoordsOverlayState(getShowCoordsOverlay());
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'show_coords_overlay_v1') refresh();
    };
    window.addEventListener(UI_SETTINGS_UPDATED_EVENT, refresh as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(UI_SETTINGS_UPDATED_EVENT, refresh as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const refresh = () => setIsAdminMode(getAdminMode());
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'stone-age-admin-mode') refresh();
    };
    window.addEventListener(ADMIN_MODE_UPDATED_EVENT, refresh as EventListener);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(ADMIN_MODE_UPDATED_EVENT, refresh as EventListener);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  const allLevels = useMemo(() => {
    void overrideRevision;
    return getAllLevels();
  }, [overrideRevision]);
  const currentLevel = allLevels[Math.min(currentLevelIndex, Math.max(0, allLevels.length - 1))] ?? allLevels[0];
  const orderedLevelIds = useMemo(() => allLevels.map((level) => level.id), [allLevels]);
  const completedLevelCount = useMemo(
    () => getCompletedLevelCount(campaignProgress, orderedLevelIds),
    [campaignProgress, orderedLevelIds]
  );
  const highestUnlockedIndex = useMemo(
    () => getHighestUnlockedLevelIndex(campaignProgress, orderedLevelIds),
    [campaignProgress, orderedLevelIds]
  );
  const effectiveHighestUnlockedIndex = isAdminMode
    ? Math.max(0, allLevels.length - 1)
    : highestUnlockedIndex;
  const frontierLevelId =
    effectiveHighestUnlockedIndex >= 0
      ? allLevels[Math.min(effectiveHighestUnlockedIndex, allLevels.length - 1)]?.id ?? null
      : null;
  const campaignProgressValue = allLevels.length > 0 ? (completedLevelCount / allLevels.length) * 100 : 0;
  const currentLevelRecord = currentLevel ? getLevelCampaignRecord(campaignProgress, currentLevel.id) : null;
  const campaignLevelCards = useMemo(
    () =>
      allLevels.map((level, index) => {
        const record = getLevelCampaignRecord(campaignProgress, level.id);
        return {
          id: level.id,
          theme: level.theme,
          isCurrent: level.id === currentLevel?.id,
          isCompleted: Boolean(record?.completed),
          isUnlocked: isAdminMode || index <= highestUnlockedIndex,
          bestMoves: record?.bestMoves ?? null,
          bestTimeLeftSeconds: record?.bestTimeLeftSeconds ?? null,
        };
      }),
    [allLevels, campaignProgress, currentLevel?.id, highestUnlockedIndex, isAdminMode]
  );

  useEffect(() => {
    if (allLevels.length === 0) return;
    updateCampaignProgress((prev) => syncCampaignProgress(prev, orderedLevelIds));
  }, [allLevels.length, orderedLevelIds, updateCampaignProgress]);

  useEffect(() => {
    if (didRestoreCampaignLevelRef.current) return;
    if (allLevels.length === 0) return;
    didRestoreCampaignLevelRef.current = true;

    const savedLevelId = campaignProgressRef.current.lastPlayedLevelId;
    if (savedLevelId == null) {
      setCurrentLevelIndex((index) => Math.min(index, allLevels.length - 1));
      return;
    }

    const exactIndex = allLevels.findIndex((level) => level.id === savedLevelId);
    if (exactIndex >= 0) {
      setCurrentLevelIndex(exactIndex);
      return;
    }

    setCurrentLevelIndex((index) => Math.min(index, allLevels.length - 1));
  }, [allLevels]);

  useEffect(() => {
    if (!currentLevel) return;
    updateCampaignProgress((prev) => setLastPlayedLevel(prev, currentLevel.id));
  }, [currentLevel, updateCampaignProgress]);

  // Mobile portrait gate: require landscape so the whole board can be visible.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const mql = window.matchMedia?.('(orientation: portrait)');
    const update = () => {
      const portrait = mql ? mql.matches : window.innerHeight > window.innerWidth;
      setIsPortrait(portrait);
    };
    update();
    mql?.addEventListener?.('change', update);
    window.addEventListener('resize', update, { passive: true });
    window.addEventListener('orientationchange', update, { passive: true } as AddEventListenerOptions);
    return () => {
      mql?.removeEventListener?.('change', update);
      window.removeEventListener('resize', update as EventListener);
      window.removeEventListener('orientationchange', update as EventListener);
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onResize = () => setFitRevision((v) => v + 1);
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize as EventListener);
  }, []);

  // Auto-fit zoom on mobile landscape + fullscreen layout so the board uses the available viewport.
  useLayoutEffect(() => {
    if (isBuilding) return;
    if (!(isMobile || isFullscreenMode)) return;
    if (viewMode === "fps" || viewMode === "sprite") return;
    if (userZoomTouched) return;
    if (selectedArrow) return;

    const el = gestureSurfaceRef.current;
    if (!el) return;

    const raf = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 40 || rect.height < 40) return;
      const aspect = rect.width / Math.max(1, rect.height);
      const content = computeNonVoidContentSize(currentLevel?.grid);
      let nextIndex = pickBestZoomIndexForContent({
        content,
        aspect,
        viewMode: viewMode === "2d" ? "2d" : "3d",
      });

      // Mobile: cap auto-fit at the baseline (~122%) so it doesn't jump to the "extra zoom-in" steps by itself.
      // Users can still tap (+) to zoom further in if they want.
      if (isMobile) {
        nextIndex = Math.min(nextIndex, MOBILE_AUTO_FIT_MAX_ZOOM_IN_INDEX);
      }
      if (nextIndex !== cameraZoomIndex) setCameraZoomIndex(nextIndex);
      setCameraOffset({ x: 0, z: 0 });
    });

    return () => cancelAnimationFrame(raf);
  }, [
    cameraZoomIndex,
    currentLevel?.grid,
    fitRevision,
    isBuilding,
    isFullscreenMode,
    isMobile,
    selectedArrow,
    userZoomTouched,
    viewMode,
  ]);

  useEffect(() => {
    // New level: allow auto-fit again (but don't override manual zoom within the same level).
    setUserZoomTouched(false);
  }, [currentLevelIndex]);

    const isPlaceholderGrid = useCallback((levelGrid?: number[][]) => {
      if (!levelGrid || levelGrid.length === 0) return true;
      if (levelGrid.length === 1 && levelGrid[0]?.length === 1) return true;
      return levelGrid.every(row => row.every(cell => cell === 5));
    }, []);

    // If a user manually saved a level override in the mapper, we should treat that as authoritative and
    // never kick off the expensive image analysis/build step for that level.
    const hasReadableLevelOverride = useCallback((levelId: number) => {
      if (typeof window === "undefined") return false;
      const raw = localStorage.getItem(`level_override_${levelId}`);
      if (!raw) return false;
      try {
        const parsed = JSON.parse(raw) as unknown;

        // Old format: the override itself is the 2D grid.
        if (Array.isArray(parsed) && Array.isArray(parsed[0])) return true;

        // New format: { grid, playerStart, theme, ... }
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const grid = (parsed as StoredLevelOverrideShape).grid;
          if (Array.isArray(grid) && Array.isArray(grid[0])) return true;
        }
      } catch {
        return false;
      }
      return false;
    }, []);

    const buildBaseGrid = useCallback((levelGrid: CellType[][]) => {
      return levelGrid.map((row, y) =>
        row.map((cell, x) => {
          if ((cell >= 7 && cell <= 10) || cell === 11 || cell === 12 || cell === 13) {
            const adjacentCells: CellType[] = [];
            if (y > 0) adjacentCells.push(levelGrid[y - 1][x] as CellType);
            if (y < levelGrid.length - 1) adjacentCells.push(levelGrid[y + 1][x] as CellType);
            if (x > 0) adjacentCells.push(levelGrid[y][x - 1] as CellType);
            if (x < row.length - 1) adjacentCells.push(levelGrid[y][x + 1] as CellType);

            const terrainTypes = adjacentCells.filter(c =>
              c !== 7 && c !== 8 && c !== 9 && c !== 10 && c !== 11 && c !== 12 && c !== 13
            ).map((c) => (c === 18 || c === 19 || c === 20 ? 0 : c));

            if (terrainTypes.length > 0) {
              const counts = terrainTypes.reduce((acc, type) => {
                acc[type] = (acc[type] || 0) + 1;
                return acc;
              }, {} as Record<number, number>);

              const mostCommon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
              return Number(mostCommon) as CellType;
            }
            return 5;
          }
          return cell;
        })
      ) as CellType[][];
    }, []);

    const applyLevelState = useCallback((level: LevelData) => {
      const gridCopy = level.grid.map(row => [...row]) as CellType[][];
      const baseGridCopy = buildBaseGrid(gridCopy);
      const goalCaves = findGoalCaves(gridCopy, level.cavePos);
      const cave = goalCaves[0] ?? { ...level.cavePos };
      const localId = localPlayerIdRef.current;
      const localPlayer: SimPlayer = {
        id: localId,
        pos: { ...level.playerStart },
        facing: facingTowardTarget(level.playerStart, cave, "down"),
        isLocal: true,
        color: themes[level.theme ?? 'default']?.player ?? '#7dff9b',
        keys: { ...EMPTY_KEYS },
        selectedArrow: null,
        isGliding: false,
        glidePath: null,
        glideArrowType: null,
        glideIndex: 0,
        moves: 0
      };

      const players = new Map<PlayerId, SimPlayer>();
      players.set(localId, localPlayer);

      simRef.current = {
        grid: gridCopy,
        baseGrid: baseGridCopy,
        breakableRockStates: new Map(),
        players,
        arrowGlides: [],
        goalCaveKeys: buildGoalCaveKeySet(gridCopy, cave),
        cavePos: cave,
        tick: 0
      };

      setRenderGrid(gridCopy.map(row => [...row]));
      setRenderPlayers(Array.from(players.values()));
      setRenderCavePos(cave);
      setMoves(0);
      setIsComplete(false);
      setCompletionSummary(null);
      setSelectedArrow(null);
      setSelectorPos({ ...level.playerStart });
      setIsSelectorActive(false);
      setCameraOffset({ x: 0, z: 0 });
      setActiveLevel(level);
      resetLevelTimer(level.timeLimitSeconds);
    }, [buildBaseGrid, resetLevelTimer]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("stone-age-view-mode", viewMode);
    } catch {
      // ignore storage failures
    }
  }, [viewMode]);

    // Initialize or auto-build level
    useEffect(() => {
      if (!currentLevel) return;
      let cancelled = false;

      const hasOverride = hasReadableLevelOverride(currentLevel.id);
      const needsBuild = Boolean(currentLevel.autoBuild) && isPlaceholderGrid(currentLevel.grid) && !hasOverride;
      if (!needsBuild) {
        // If the user saved a manual override (or this level already has a real grid), don't leave the UI
        // stuck in "Analyzing level image..." from a previously-cancelled build run.
        setIsBuilding(false);
        setBuildStatus('');
        applyLevelState(currentLevel);
        return;
      }

      if (buildInFlightRef.current.has(currentLevel.id)) {
        return;
      }
      buildInFlightRef.current.add(currentLevel.id);

      const run = async () => {
        setIsBuilding(true);
        setBuildStatus('Analyzing level image...');

        try {
          await new Promise<void>((resolve) => {
            if (typeof requestIdleCallback !== 'undefined') {
              requestIdleCallback(() => resolve());
            } else {
              setTimeout(resolve, 0);
            }
          });

          await seedDefaultReferences();
          const primarySource = currentLevel.image ?? currentLevel.sources?.[0];
          const sources = primarySource ? [primarySource] : [];
          if (sources.length === 0) {
            throw new Error('No image sources available for this level');
          }

          const buildPromise = buildLevelFromSources(sources, {
            minSimilarity: 0.72,
            timeoutMs: 12000,
            yieldEveryRows: 1,
            onProgress: (status) => {
              if (!cancelled) setBuildStatus(status);
            },
          });

          let timeoutId: ReturnType<typeof setTimeout> | null = null;
          const timeoutPromise = new Promise<never>((_, reject) => {
            timeoutId = setTimeout(() => {
              timeoutId = null;
              reject(new Error('Level build timed out'));
            }, 30000);
          });

          const built = await Promise.race([buildPromise, timeoutPromise]);
          if (timeoutId) {
            clearTimeout(timeoutId);
            timeoutId = null;
          }
          if (cancelled) return;

          const builtLevel: LevelData = {
            ...currentLevel,
            grid: built.grid,
            playerStart: built.playerStart,
            cavePos: built.cavePos,
          };

          saveLevelOverride(currentLevel.id, built.grid, built.playerStart, currentLevel.theme);
          applyLevelState(builtLevel);
        } catch (error) {
          console.error('Auto-build failed:', error);
          const fallback = manualFallbackById.get(currentLevel.id);
          if (fallback) {
            applyLevelState(fallback as LevelData);
          }
        } finally {
          buildInFlightRef.current.delete(currentLevel.id);
          if (!cancelled) {
            setIsBuilding(false);
            setBuildStatus('');
          }
        }
      };

      run();

      return () => {
        cancelled = true;
      };
    }, [applyLevelState, currentLevel, hasReadableLevelOverride, isPlaceholderGrid]);

    // Countdown timer tick (mapper-configurable per level).
    useEffect(() => {
      if (!levelTimeLimitSeconds) {
        clearTimerInterval();
        timerEndAtMsRef.current = null;
        timerRemainingMsRef.current = 0;
        setTimeLeftSeconds(null);
        setIsTimeUp(false);
        return;
      }

      if (!isTimerArmed) {
        clearTimerInterval();
        timerEndAtMsRef.current = null;
        // While waiting for explicit START, ensure we never stay in a stale
        // timed-out state from a previous run.
        if (timerRemainingMsRef.current <= 0 && levelTimeLimitSeconds > 0) {
          timerRemainingMsRef.current = levelTimeLimitSeconds * 1000;
        }
        setIsTimeUp(false);
        const sec = Math.max(0, Math.ceil(timerRemainingMsRef.current / 1000));
        setTimeLeftSeconds((prev) => (prev === sec ? prev : sec));
        return;
      }

      if (shouldRotateGate || isComplete || isTimeUp) {
        clearTimerInterval();
        timerEndAtMsRef.current = null;
        return;
      }

      if (isBuilding) {
        // Pause countdown while the level is building/loading.
        if (timerEndAtMsRef.current != null) {
          const remaining = Math.max(0, timerEndAtMsRef.current - Date.now());
          timerRemainingMsRef.current = remaining;
          timerEndAtMsRef.current = null;
          const sec = Math.ceil(remaining / 1000);
          setTimeLeftSeconds((prev) => (prev === sec ? prev : sec));
        }
        clearTimerInterval();
        return;
      }

      // Resume (or start) using the last known remaining time.
      if (timerEndAtMsRef.current == null) {
        timerEndAtMsRef.current = Date.now() + timerRemainingMsRef.current;
      }

      const tick = () => {
        const endAt = timerEndAtMsRef.current;
        if (endAt == null) return;
        const remaining = Math.max(0, endAt - Date.now());
        timerRemainingMsRef.current = remaining;

        const sec = Math.ceil(remaining / 1000);
        setTimeLeftSeconds((prev) => (prev === sec ? prev : sec));

        if (remaining <= 0) {
          setIsTimeUp(true);
          timerEndAtMsRef.current = null;
          clearTimerInterval();
        }
      };

      tick();
      const id = window.setInterval(tick, 250);
      timerIntervalRef.current = id;
      return () => {
        window.clearInterval(id);
        if (timerIntervalRef.current === id) timerIntervalRef.current = null;
      };
    }, [clearTimerInterval, isBuilding, isComplete, isTimeUp, isTimerArmed, levelTimeLimitSeconds, shouldRotateGate, currentLevelIndex]);

    // Show drag hint on first load
    useEffect(() => {
      const hasSeenHint = sessionStorage.getItem('dragHintSeen');
      if (!hasSeenHint) {
        setTimeout(() => {
          pushHudMessage("Tip: drag the board to pan the camera.", 4000);
          sessionStorage.setItem('dragHintSeen', 'true');
        }, 1500);
      }
    }, [pushHudMessage]);

    // Helper function to flash player highlight twice
    const flashPlayerHighlight = useCallback(() => {
      setPlayerFlashCount(2); // Start with 2 flashes
      let flashes = 0;
      const flashInterval = setInterval(() => {
        flashes++;
        setPlayerFlashCount(prev => prev > 0 ? prev - 1 : 0);
        if (flashes >= 4) { // 2 on, 2 off = 4 total changes
          clearInterval(flashInterval);
          setPlayerFlashCount(0);
        }
      }, 300); // Flash every 300ms
    }, []);

    const enqueueInput = useCallback((command: QueuedInputCommand) => {
      const sim = simRef.current;
      if (!sim) return;
      const localId = localPlayerIdRef.current;
      const seq = ++inputSeqRef.current;
      const input = { ...command, seq } as InputCommand;
      const queue = inputQueueRef.current.get(localId) ?? [];
      queue.push(input);
      inputQueueRef.current.set(localId, queue);

      if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
        wsRef.current.send(JSON.stringify({ type: "input", id: localId, input }));
      }
    }, []);

    const queueMove = useCallback((dx: number, dy: number) => {
      if (isComplete || isBuilding || isTimeUp || shouldRotateGate || isWaitingToStart) return;

      // FPS view uses "relative" controls:
      // Up = forward (keep going straight), Down = backward, Left/Right = strafe relative to facing.
      // This matches user expectation: if facing LEFT on the 2D map, pressing UP continues left.
      if (viewMode === "fps") {
        const sim = simRef.current;
        const localId = localPlayerIdRef.current;
        const facing = sim?.players.get(localId)?.facing ?? "up";
        const fwd = deltaFromFacing(facing);
        const right = { dx: -fwd.dy, dy: fwd.dx }; // rotate clockwise in grid space
        const worldDx = dx * right.dx + (-dy) * fwd.dx;
        const worldDy = dx * right.dy + (-dy) * fwd.dy;
        enqueueInput({ type: "move", dx: worldDx, dy: worldDy });
        return;
      }

      enqueueInput({ type: "move", dx, dy });
    }, [enqueueInput, isComplete, isBuilding, isTimeUp, isWaitingToStart, shouldRotateGate, viewMode]);

    useEffect(() => {
      const wsUrl = import.meta.env.VITE_WS_URL as string | undefined;
      if (!wsUrl) {
        setNetworkStatus('offline');
        return;
      }

      setNetworkStatus('connecting');
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => setNetworkStatus('online');
      ws.onclose = () => setNetworkStatus('offline');
      ws.onerror = () => setNetworkStatus('offline');
      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'welcome' && msg.id) {
            const sim = simRef.current;
            if (sim && sim.players.has(localPlayerIdRef.current) && !sim.players.has(msg.id)) {
              const local = sim.players.get(localPlayerIdRef.current)!;
              sim.players.delete(localPlayerIdRef.current);
              local.id = msg.id;
              local.isLocal = true;
              sim.players.set(msg.id, local);
              setRenderPlayers(Array.from(sim.players.values()).map(p => ({ ...p, pos: { ...p.pos } })));
            }
            localPlayerIdRef.current = msg.id;
          } else if (msg.type === 'input' && msg.id && msg.input) {
            const sim = simRef.current;
            if (sim && !sim.players.has(msg.id)) {
              const palette = ['#5fd5ff', '#ffb347', '#ff6b6b', '#9bffd0', '#c7a6ff'];
              const spawn = sim.players.get(localPlayerIdRef.current)?.pos ?? sim.cavePos;
              sim.players.set(msg.id, {
                id: msg.id,
                pos: { ...spawn },
                facing: facingTowardTarget(spawn, sim.cavePos, 'down'),
                isLocal: false,
                color: palette[sim.players.size % palette.length],
                keys: { ...EMPTY_KEYS },
                selectedArrow: null,
                isGliding: false,
                glidePath: null,
                glideArrowType: null,
                glideIndex: 0,
                moves: 0
              });
              setRenderPlayers(Array.from(sim.players.values()).map(p => ({ ...p, pos: { ...p.pos } })));
            }
            const queue = inputQueueRef.current.get(msg.id) ?? [];
            queue.push(msg.input);
            inputQueueRef.current.set(msg.id, queue);
          }
        } catch (err) {
          console.warn('Invalid WS message', err);
        }
      };

      return () => {
        ws.close();
      };
    }, []);

    const PLAYER_GLIDE_DIV = 3;
    const stepSimulation = useCallback(() => {
      const sim = simRef.current;
      if (!sim) return;
      sim.tick += 1;

      let gridDirty = false;
      let playersDirty = false;
      let localMoves = moves;
      let localSelected = selectedArrow;
      let localComplete = isComplete;

      // Advance arrow glides
      if (sim.arrowGlides.length > 0) {
        sim.arrowGlides = sim.arrowGlides.filter((glide) => {
          const next = glide.path[glide.index];
          const prev = glide.index === 0 ? glide.from : glide.path[glide.index - 1];
          if (!next) return false;

          if (glide.index === 0) sim.grid[glide.from.y][glide.from.x] = 5;
          else sim.grid[prev.y][prev.x] = sim.baseGrid[prev.y][prev.x];
          sim.grid[next.y][next.x] = glide.arrowType;
          glide.index += 1;
          gridDirty = true;

          if (glide.index >= glide.path.length) {
            const owner = sim.players.get(glide.ownerId);
            if (owner) {
              owner.isGliding = false;
              const newArrowPos = { x: next.x, y: next.y };
              const testState: GameState = {
                grid: sim.grid,
                baseGrid: sim.baseGrid,
                playerPos: owner.pos,
                inventory: owner.keys,
                selectedArrow: newArrowPos,
                breakableRockStates: sim.breakableRockStates,
                isGliding: false,
                isComplete: false
              } as GameState;
              const dirs = [
                { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
              ];
              const canMove = dirs.some((dir) => attemptRemoteArrowMove(testState, dir.dx, dir.dy).glidePath);
              owner.selectedArrow = canMove ? newArrowPos : null;
              if (owner.isLocal) {
                localSelected = owner.selectedArrow;
              }
            }
            return false;
          }
          return true;
        });
      }

      // Advance player glides and inputs
      sim.players.forEach((player, id) => {
        if (player.isGliding && player.glidePath && player.glideIndex < player.glidePath.length) {
          if (sim.tick % PLAYER_GLIDE_DIV !== 0) {
            return;
          }
          const stepPos = player.glidePath[player.glideIndex];
          const prevPos = player.glideIndex === 0 ? player.pos : player.glidePath[player.glideIndex - 1];
          if (player.glideIndex === 0) {
            sim.grid[player.pos.y][player.pos.x] = 5;
          } else {
            sim.grid[prevPos.y][prevPos.x] = sim.baseGrid[prevPos.y][prevPos.x];
          }
          sim.grid[stepPos.y][stepPos.x] = player.glideArrowType ?? sim.grid[stepPos.y][stepPos.x];
          player.pos = { ...stepPos };
          player.facing = facingFromDelta(stepPos.x - prevPos.x, stepPos.y - prevPos.y, player.facing);
          player.glideIndex += 1;
          gridDirty = true;
          playersDirty = true;

          if (player.glideIndex >= player.glidePath.length) {
            player.isGliding = false;
            player.glidePath = null;
            player.glideArrowType = null;
            player.glideIndex = 0;
            player.moves += 1;
            if (player.isLocal) localMoves = player.moves;
          }
          return;
        }

        if (player.isGliding) return;

        const queue = inputQueueRef.current.get(id);
        if (!queue || queue.length === 0) return;

        const input = queue.shift();
        if (!input) return;

        if (input.type === 'select') {
          if (player.pos.x === input.x && player.pos.y === input.y) return;
          const cell = sim.grid[input.y]?.[input.x];
          if (cell !== undefined && isArrowCell(cell)) {
            player.selectedArrow = { x: input.x, y: input.y };
            if (player.isLocal) localSelected = player.selectedArrow;
          }
          return;
        }

        if (input.type === 'deselect') {
          player.selectedArrow = null;
          if (player.isLocal) localSelected = null;
          return;
        }

        if (input.type === 'move') {
          if (player.selectedArrow) {
            const state: GameState = {
              grid: sim.grid,
              baseGrid: sim.baseGrid,
              playerPos: player.pos,
              inventory: player.keys,
              selectedArrow: player.selectedArrow,
              breakableRockStates: sim.breakableRockStates,
              isGliding: false,
              isComplete: false
            } as GameState;
            const outcome = attemptRemoteArrowMove(state, input.dx, input.dy);
            if (outcome.glidePath) {
              sim.arrowGlides.push({
                ownerId: player.id,
                from: { ...player.selectedArrow },
                path: outcome.glidePath.path,
                arrowType: outcome.glidePath.arrowType,
                index: 0
              });
              player.isGliding = true;
              player.moves += 1;
              if (player.isLocal) localMoves = player.moves;
            }
            return;
          }

          const state: GameState = {
            grid: sim.grid,
            baseGrid: sim.baseGrid,
            playerPos: player.pos,
            inventory: player.keys,
            selectedArrow: player.selectedArrow,
            breakableRockStates: sim.breakableRockStates,
            isGliding: false,
            isComplete: false
          } as GameState;
          const outcome = attemptPlayerMove(state, input.dx, input.dy);

          if (outcome.glidePath && outcome.startGlide) {
            const firstGlideStep = outcome.glidePath.path[0];
            if (firstGlideStep) {
              player.facing = facingFromDelta(
                firstGlideStep.x - player.pos.x,
                firstGlideStep.y - player.pos.y,
                player.facing
              );
            } else {
              player.facing = facingFromDelta(input.dx, input.dy, player.facing);
            }
            player.isGliding = true;
            player.glidePath = outcome.glidePath.path;
            player.glideArrowType = outcome.glidePath.arrowType;
            player.glideIndex = 0;
            return;
          }

          if (outcome.newGrid) {
            sim.grid = outcome.newGrid as CellType[][];
            gridDirty = true;
          }
          if (outcome.newPlayerPos) {
            player.facing = facingFromDelta(
              outcome.newPlayerPos.x - player.pos.x,
              outcome.newPlayerPos.y - player.pos.y,
              player.facing
            );
            player.pos = { ...outcome.newPlayerPos };
            playersDirty = true;
          }
          if (outcome.collectedKey && player.isLocal) {
            pushHudMessage(`${outcome.collectedKey.toUpperCase()} key collected`);
          }
          if (outcome.unlockedLock && player.isLocal) {
            pushHudMessage(`${outcome.unlockedLock.toUpperCase()} lock opened`);
          }
          if (outcome.collectedHourglass && player.isLocal) {
            const at = outcome.collectedHourglass;
            const key = `${at.x},${at.y}`;
            const raw = currentLevel?.hourglassBonusByCell?.[key];
            const bonus = Math.max(1, Math.min(86400, Math.round(Number(raw ?? DEFAULT_BONUS_TIME_SECONDS))));
            if (timerEnabledRef.current) {
              addLevelTimeSeconds(bonus);
              pushHudMessage(`+${bonus}s bonus time`, 1400);
            } else {
              pushHudMessage("Bonus time collected", 1400);
            }
          }
          if (outcome.brokeRock && player.isLocal) {
            pushHudMessage("Rock crumbled");
          }
          if (outcome.consumedMove) {
            player.moves += 1;
            if (player.isLocal) localMoves = player.moves;
          }
        }
      });

      const localPlayer = sim.players.get(localPlayerIdRef.current);
      if (localPlayer && sim.goalCaveKeys.has(`${localPlayer.pos.x},${localPlayer.pos.y}`) && !localComplete) {
        localComplete = true;
        const clearTimeLeftSeconds = timerEnabledRef.current
          ? Math.max(0, Math.ceil(timerRemainingMsRef.current / 1000))
          : null;
        const clearUpdate = recordLevelCompletion({
          progress: campaignProgressRef.current,
          levelId: currentLevel.id,
          moves: localPlayer.moves,
          timeLeftSeconds: clearTimeLeftSeconds,
          nextLevelId: allLevels[currentLevelIndex + 1]?.id ?? null,
        });

        commitCampaignProgress(clearUpdate.progress);
        setCompletionSummary({
          levelId: currentLevel.id,
          moves: localPlayer.moves,
          timeLeftSeconds: clearTimeLeftSeconds,
          bestMoves: clearUpdate.record.bestMoves,
          bestTimeLeftSeconds: clearUpdate.record.bestTimeLeftSeconds,
          isFirstClear: clearUpdate.isFirstClear,
          isNewBestMoves: clearUpdate.isNewBestMoves,
          isNewBestTime: clearUpdate.isNewBestTime,
          completedCount: getCompletedLevelCount(clearUpdate.progress, orderedLevelIds),
          totalLevels: allLevels.length,
        });
        setIsComplete(true);
        const clearHighlights = [];
        if (clearUpdate.isFirstClear) clearHighlights.push("First clear");
        if (clearUpdate.isNewBestMoves) clearHighlights.push("Best moves");
        if (clearUpdate.isNewBestTime) clearHighlights.push("Best clock");

        pushHudMessage(
          clearHighlights.length > 0
            ? `Level ${currentLevel.id} complete • ${clearHighlights.join(" • ")}`
            : `Level ${currentLevel.id} complete • Moves ${localPlayer.moves}`,
          2600,
        );
      }

      if (gridDirty) setRenderGrid(sim.grid.map(row => [...row]));
      if (playersDirty || gridDirty) setRenderPlayers(Array.from(sim.players.values()).map(p => ({ ...p, pos: { ...p.pos } })));
      if (localMoves !== moves) setMoves(localMoves);
      if (localSelected !== selectedArrow) setSelectedArrow(localSelected);
      if (sim.cavePos.x !== renderCavePos.x || sim.cavePos.y !== renderCavePos.y) setRenderCavePos(sim.cavePos);
    }, [
      addLevelTimeSeconds,
      allLevels,
      commitCampaignProgress,
      currentLevel,
      currentLevelIndex,
      isComplete,
      moves,
      orderedLevelIds,
      pushHudMessage,
      renderCavePos.x,
      renderCavePos.y,
      selectedArrow,
    ]);

    useEffect(() => {
      let raf = 0;
      let last = performance.now();
      let accumulator = 0;
      const step = 1000 / 60;

      const frame = (now: number) => {
        const delta = now - last;
        last = now;
        accumulator += delta;
        while (accumulator >= step) {
          stepSimulation();
          accumulator -= step;
        }
        raf = requestAnimationFrame(frame);
      };

      raf = requestAnimationFrame(frame);
      return () => cancelAnimationFrame(raf);
    }, [stepSimulation]);

    const localPlayer = useMemo(
      () => renderPlayers.find((p) => p.isLocal) ?? renderPlayers[0],
      [renderPlayers]
    );
    const localPlayerPos = localPlayer?.pos ?? { x: 0, y: 0 };
    const redKeyCount = localPlayer?.keys.red ? 1 : 0;
    const greenKeyCount = localPlayer?.keys.green ? 1 : 0;
    const timeLeftText = timeLeftSeconds == null
      ? null
      : (() => {
        const sec = Math.max(0, Math.round(timeLeftSeconds));
        const m = Math.floor(sec / 60);
        const s = sec % 60;
        return `${m}:${String(s).padStart(2, '0')}`;
      })();
    const isTimerUrgent = timeLeftSeconds != null && timeLeftSeconds <= 10;
    const currentBestMoves = currentLevelRecord?.bestMoves ?? null;
    const currentBestClockText = formatCampaignClock(currentLevelRecord?.bestTimeLeftSeconds ?? null);
    const campaignProgressText = `${completedLevelCount}/${allLevels.length}`;
    const completionClockText = formatCampaignClock(completionSummary?.timeLeftSeconds ?? null);
    const completionBestClockText = formatCampaignClock(completionSummary?.bestTimeLeftSeconds ?? null);

    const goToLevelIndex = useCallback((nextIndex: number) => {
      if (nextIndex < 0 || nextIndex >= allLevels.length) return false;
      if (!isAdminMode && nextIndex > highestUnlockedIndex) {
        const currentFrontier = allLevels[Math.min(highestUnlockedIndex, allLevels.length - 1)];
        const nextLocked = allLevels[nextIndex];
        if (currentFrontier && nextLocked) {
          pushHudMessage(`Complete Level ${currentFrontier.id} to unlock Level ${nextLocked.id}.`, 2200);
        } else {
          pushHudMessage("Complete the frontier level to unlock more stages.", 2200);
        }
        return false;
      }

      setSelectedArrow(null);
      setCameraOffset({ x: 0, z: 0 });
      setCompletionSummary(null);
      setCurrentLevelIndex(nextIndex);
      return true;
    }, [allLevels, highestUnlockedIndex, isAdminMode, pushHudMessage]);

    const goToLevelId = useCallback((levelId: number) => {
      const nextIndex = allLevels.findIndex((level) => level.id === levelId);
      if (nextIndex < 0) return false;
      return goToLevelIndex(nextIndex);
    }, [allLevels, goToLevelIndex]);

    const resetSelectorToPlayer = useCallback(() => {
      setIsSelectorActive(false);
      setSelectorPos({ x: localPlayerPos.x, y: localPlayerPos.y });
    }, [localPlayerPos.x, localPlayerPos.y]);

    const moveKeyboardSelector = useCallback((dx: number, dy: number) => {
      if (renderGrid.length === 0 || renderGrid[0]?.length === 0) return;

      setIsSelectorActive(true);
      setSelectorPos((prev) => {
        const origin = prev ?? { x: localPlayerPos.x, y: localPlayerPos.y };
        const nextX = Math.max(0, Math.min(renderGrid[0].length - 1, origin.x + dx));
        const nextY = Math.max(0, Math.min(renderGrid.length - 1, origin.y + dy));
        return { x: nextX, y: nextY };
      });
    }, [localPlayerPos.x, localPlayerPos.y, renderGrid]);

    const toggleKeyboardSelection = useCallback(() => {
      if (isBuilding || isComplete || localPlayer?.isGliding) return;

      if (selectedArrow) {
        enqueueInput({ type: "deselect" });
        resetSelectorToPlayer();
        flashPlayerHighlight();
        pushHudMessage("Arrow deselected");
        return;
      }

      const currentSelector = selectorPos ?? { x: localPlayerPos.x, y: localPlayerPos.y };
      const isOnPlayer =
        currentSelector.x === localPlayerPos.x && currentSelector.y === localPlayerPos.y;

      if (!isSelectorActive) {
        setIsSelectorActive(true);
        setSelectorPos({ x: localPlayerPos.x, y: localPlayerPos.y });
        return;
      }

      const cell = renderGrid[currentSelector.y]?.[currentSelector.x];
      if (cell !== undefined && isArrowCell(cell) && !isOnPlayer) {
        enqueueInput({ type: "select", x: currentSelector.x, y: currentSelector.y });
        setIsSelectorActive(false);
        setSelectorPos({ x: currentSelector.x, y: currentSelector.y });
        pushHudMessage("Arrow selected — use the movement controls to slide it.", 2200);
        return;
      }

      if (isOnPlayer) {
        resetSelectorToPlayer();
        return;
      }

      // If user tries to "select" a non-arrow cell, just return control to player silently.
      resetSelectorToPlayer();
      flashPlayerHighlight();
    }, [
      enqueueInput,
      flashPlayerHighlight,
      isBuilding,
      isComplete,
      isSelectorActive,
      localPlayer?.isGliding,
      localPlayerPos.x,
      localPlayerPos.y,
      pushHudMessage,
      renderGrid,
      resetSelectorToPlayer,
      selectedArrow,
      selectorPos
    ]);

    useEffect(() => {
      if (selectedArrow) {
        setIsSelectorActive(false);
        setSelectorPos({ x: selectedArrow.x, y: selectedArrow.y });
        return;
      }

      if (!isSelectorActive) {
        setSelectorPos({ x: localPlayerPos.x, y: localPlayerPos.y });
      }
    }, [isSelectorActive, localPlayerPos.x, localPlayerPos.y, selectedArrow]);

    const resetLevel = useCallback(() => {
      const levelToReset = activeLevel ?? currentLevel;
      if (!levelToReset) return;
      applyLevelState(levelToReset);
      pushHudMessage("Level reset");
    }, [activeLevel, applyLevelState, currentLevel, pushHudMessage]);

    const startLevelWhenReady = useCallback(() => {
      if (!levelTimeLimitSeconds || isTimerArmed || isTimeUp || isBuilding || isComplete) return;

      // Defensive: if a stale zero remained from a previous timeout, restore full level time.
      if (timerRemainingMsRef.current <= 0) {
        timerRemainingMsRef.current = levelTimeLimitSeconds * 1000;
        setTimeLeftSeconds(levelTimeLimitSeconds);
      }
      setIsTimeUp(false);
      setIsTimerArmed(true);
      pushHudMessage("Timer started — good luck!", 1600);
    }, [isBuilding, isComplete, isTimeUp, isTimerArmed, levelTimeLimitSeconds, pushHudMessage]);

    // Keyboard controls (player movement + keyboard arrow selection)
    useEffect(() => {
      const handleKeyPress = (e: KeyboardEvent) => {
        if (isBuilding) return;
        const key = e.key;

        if (e.repeat && (key === ' ' || key === 'Enter')) {
          e.preventDefault();
          return;
        }

        const isUp = key === 'ArrowUp' || key === 'w' || key === 'W';
        const isDown = key === 'ArrowDown' || key === 's' || key === 'S';
        const isLeft = key === 'ArrowLeft' || key === 'a' || key === 'A';
        const isRight = key === 'ArrowRight' || key === 'd' || key === 'D';

        if (key === ' ' || key === 'Enter') {
          e.preventDefault();
          toggleKeyboardSelection();
          return;
        }

        if (isSelectorActive && !selectedArrow) {
          if (isUp) { e.preventDefault(); moveKeyboardSelector(0, -1); return; }
          if (isDown) { e.preventDefault(); moveKeyboardSelector(0, 1); return; }
          if (isLeft) { e.preventDefault(); moveKeyboardSelector(-1, 0); return; }
          if (isRight) { e.preventDefault(); moveKeyboardSelector(1, 0); return; }
        }

        // Normal gameplay controls
        switch (key) {
          case 'ArrowUp': case 'w': case 'W': e.preventDefault(); queueMove(0, -1); break;
          case 'ArrowDown': case 's': case 'S': e.preventDefault(); queueMove(0, 1); break;
          case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); queueMove(-1, 0); break;
          case 'ArrowRight': case 'd': case 'D': e.preventDefault(); queueMove(1, 0); break;
          case 'r': case 'R': e.preventDefault(); resetLevel(); break;
          case 'n': case 'N':
            e.preventDefault();
            if (currentLevelIndex < allLevels.length - 1 && goToLevelIndex(currentLevelIndex + 1)) {
              pushHudMessage("Skipped to next level");
            }
            break;
          case 'p': case 'P':
            e.preventDefault();
            if (currentLevelIndex > 0 && goToLevelIndex(currentLevelIndex - 1)) {
              pushHudMessage("Previous level");
            }
            break;
        }
      };
      window.addEventListener('keydown', handleKeyPress);
      return () => window.removeEventListener('keydown', handleKeyPress);
    }, [
      allLevels.length,
      currentLevelIndex,
      isBuilding,
      isSelectorActive,
      moveKeyboardSelector,
      goToLevelIndex,
      queueMove,
      resetLevel,
      selectedArrow,
      pushHudMessage,
      toggleKeyboardSelection
    ]);

    const nextLevel = () => {
      if (currentLevelIndex < allLevels.length - 1) {
        goToLevelIndex(currentLevelIndex + 1);
      } else {
        pushHudMessage("All levels complete!", 2600);
      }
    };

    const prevLevel = () => {
      if (currentLevelIndex > 0) goToLevelIndex(currentLevelIndex - 1);
    };
    const canZoomIn = viewMode !== 'fps' && cameraZoomIndex < CAMERA_ZOOM_LEVELS.length - 1;
    const canZoomOut = viewMode !== 'fps' && cameraZoomIndex > 0;
  const cameraZoomFactor = CAMERA_ZOOM_LEVELS[cameraZoomIndex];
    const nextViewMode = VIEW_MODES[(VIEW_MODES.indexOf(viewMode) + 1) % VIEW_MODES.length];

    // Drag handlers for panning the view
    const handleMouseDown = (e: React.MouseEvent) => {
      if (viewMode === 'fps' || viewMode === 'sprite') return;
      // Only start dragging with left mouse button and not on UI elements
      if (e.button === 0 && e.target === e.currentTarget) {
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setDragOffsetStart({ x: cameraOffset.x, z: cameraOffset.z });
      }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
      if (viewMode === 'fps' || viewMode === 'sprite') return;
      if (isDragging) {
        const deltaX = e.clientX - dragStart.x;
        const deltaY = e.clientY - dragStart.y;

        // Scale the movement - adjust sensitivity here
        const sensitivity = 0.01;
        setCameraOffset({
          x: dragOffsetStart.x - deltaX * sensitivity,
          z: dragOffsetStart.z + deltaY * sensitivity
        });
      }
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    const handleMouseLeave = () => {
      setIsDragging(false);
    };

    // Touch handlers for mobile dragging
    const handleTouchStart = (e: React.TouchEvent) => {
      if (viewMode === 'fps' || viewMode === 'sprite') return;
      if (e.touches.length === 1 && e.target === e.currentTarget) {
        const touch = e.touches[0];
        setIsDragging(true);
        setDragStart({ x: touch.clientX, y: touch.clientY });
        setDragOffsetStart({ x: cameraOffset.x, z: cameraOffset.z });
      }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
      if (viewMode === 'fps' || viewMode === 'sprite') return;
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

    const handleTouchEnd = () => {
      setIsDragging(false);
    };

    // Double-click or double-tap to reset camera
    const handleDoubleClick = () => {
      if (viewMode === 'fps' || viewMode === 'sprite') return;
      setCameraOffset({ x: 0, z: 0 });
      pushHudMessage("View reset");
    };

    useEffect(() => {
      if (viewMode === 'fps') {
        setIsDragging(false);
      }
    }, [viewMode]);

  const levelBackground = currentLevel?.image;
  const activeThemeKey = currentLevel?.theme ?? "default";
  const activeTheme = themes[activeThemeKey];
  const networkBadgeText =
    networkStatus === "online" ? "Connected" : networkStatus === "connecting" ? "Connecting" : "Solo";
  const chapterCards = useMemo(() => {
    const chapterBlueprints = [
      {
        title: "Forest Caves",
        subtitle: "Soft moss, hidden roots, and cozy starts.",
        accent: "from-emerald-400/35 via-lime-300/10 to-transparent",
      },
      {
        title: "Crystal Depths",
        subtitle: "Glowing caverns with trickier lines.",
        accent: "from-fuchsia-400/35 via-violet-300/10 to-transparent",
      },
      {
        title: "Volcano Core",
        subtitle: "Hot routes, sharp turns, no pressure. Okay, some pressure.",
        accent: "from-orange-400/40 via-red-300/10 to-transparent",
      },
      {
        title: "Frozen Hollow",
        subtitle: "Calm blue light and slippery brainteasers.",
        accent: "from-sky-400/35 via-cyan-300/10 to-transparent",
      },
    ] as const;

    const levelsPerChapter = Math.max(1, Math.ceil(allLevels.length / chapterBlueprints.length));

    return chapterBlueprints.map((chapter, index) => {
      const sliceStart = index * levelsPerChapter;
      const sliceEnd = Math.min(allLevels.length, sliceStart + levelsPerChapter);
      const segment = allLevels.slice(sliceStart, sliceEnd);
      const completed = segment.reduce((count, level) => {
        const record = getLevelCampaignRecord(campaignProgress, level.id);
        return count + (record?.completed ? 1 : 0);
      }, 0);
      const preview = segment.find((level) => level.image)?.image ?? levelBackground ?? null;
      const containsCurrent = Boolean(currentLevel && segment.some((level) => level.id === currentLevel.id));

      return {
        ...chapter,
        completed,
        total: segment.length,
        preview,
        containsCurrent,
      };
    });
  }, [allLevels, campaignProgress, currentLevel, levelBackground]);

  const goToMapper = useCallback(() => {
    if (typeof window === "undefined") return;
    const baseUrl = import.meta.env.BASE_URL || "/";
    const normalizedBase = baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`;
    window.location.assign(`${window.location.origin}${normalizedBase}mapper`);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("stone-age-fullscreen-mode", isFullscreenMode ? "1" : "0");
    } catch {
      // ignore
    }
  }, [isFullscreenMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      localStorage.setItem("stone-age-show-dpad", showDpad ? "1" : "0");
    } catch {
      // ignore
    }
  }, [showDpad]);

    useEffect(() => {
      const doc = typeof document !== "undefined" ? document : null;
      if (!doc) return;
      const onChange = () => {
        // If the user exits browser fullscreen manually, exit our immersive layout too.
        // (Some mobile browsers don't support the Fullscreen API; in that case this is a no-op.)
        if (!doc.fullscreenElement) {
          setIsFullscreenMode(false);
          if (prevZoomIndexRef.current != null) {
            setCameraZoomIndex(prevZoomIndexRef.current);
            prevZoomIndexRef.current = null;
          }
        }
      };
      doc.addEventListener("fullscreenchange", onChange);
      return () => doc.removeEventListener("fullscreenchange", onChange);
    }, []);

    const toggleFullscreenMode = useCallback(async () => {
      const next = !isFullscreenMode;
      setIsFullscreenMode(next);

      // Preserve/restore user zoom when toggling.
      if (next) {
        prevZoomIndexRef.current = cameraZoomIndex;
        setUserZoomTouched(false);
        setCameraOffset({ x: 0, z: 0 });
        setSelectedArrow(null);
      } else if (prevZoomIndexRef.current != null) {
        setCameraZoomIndex(prevZoomIndexRef.current);
        prevZoomIndexRef.current = null;
        // Leaving fullscreen: treat the restored zoom as user-chosen so auto-fit doesn't instantly override it.
        setUserZoomTouched(true);
      }

      // Try to enter browser fullscreen if supported (best-effort).
      if (typeof document === "undefined") return;
      try {
        const doc = document as BrowserFullscreenDocument;
        const el = document.documentElement as BrowserFullscreenElement;
        if (next) {
          const req = el.requestFullscreen ?? el.webkitRequestFullscreen ?? el.msRequestFullscreen;
          if (typeof req === "function") await req.call(el);
        } else {
          const exit = doc.exitFullscreen ?? doc.webkitExitFullscreen ?? doc.msExitFullscreen;
          if (typeof exit === "function") await exit.call(doc);
        }
      } catch {
        // ignore (e.g. iOS Safari)
      }
    }, [cameraZoomIndex, isFullscreenMode]);

    const useSplitHud = isMobile || isFullscreenMode || viewMode === "sprite";
    const desktopShellActive = !useSplitHud && !shouldRotateGate;
    const hasNextLevel = currentLevelIndex < allLevels.length - 1;
    const nextLevelLocked = !isAdminMode && hasNextLevel && currentLevelIndex + 1 > highestUnlockedIndex;
    const nextLevelTitle = !hasNextLevel
      ? "No more levels"
      : nextLevelLocked
        ? `Complete Level ${currentLevel.id} to unlock the next stage`
        : "Next level (N)";
    const campaignDialog = (
      <CampaignDialog
        compact={useSplitHud}
        disabled={shouldRotateGate}
        levels={campaignLevelCards}
        completedCount={completedLevelCount}
        frontierLevelId={frontierLevelId}
        progressValue={campaignProgressValue}
        totalLevels={allLevels.length}
        onSelectLevel={goToLevelId}
      />
    );

    return (
      <div className={`relative flex h-[100svh] w-full flex-col overflow-hidden bg-[#081214]`}>
        <div className={`absolute inset-0 bg-gradient-to-br ${currentLevel.theme ? themes[currentLevel.theme].background : 'from-amber-50 to-orange-100'} opacity-20`} />
        {levelBackground && (
          <div
            className="absolute inset-0 opacity-35 bg-cover bg-center blur-[2px] scale-105"
            style={{ backgroundImage: `url(${levelBackground})` }}
          />
        )}
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,205,138,0.20),transparent_24%),radial-gradient(circle_at_top_right,rgba(98,220,255,0.16),transparent_22%),linear-gradient(180deg,rgba(5,12,14,0.18)_0%,rgba(5,12,14,0.68)_58%,rgba(3,8,9,0.88)_100%)]" />
        <div className="absolute inset-0 opacity-[0.18]" style={{ backgroundImage: "linear-gradient(rgba(255,255,255,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.03) 1px, transparent 1px)", backgroundSize: "32px 32px" }} />
        {showRotateHint && (
          <div className="pointer-events-none absolute inset-x-0 top-[calc(env(safe-area-inset-top)+0.4rem)] z-[75] flex justify-center px-3">
            <div className="max-w-md rounded-2xl border border-white/15 bg-black/60 px-4 py-2 text-center shadow-xl backdrop-blur-sm">
              <div className="text-[11px] font-black tracking-[0.14em] text-white/90">ROTATE FOR BEST VIEW</div>
              <div className="mt-1 text-xs text-white/75">Portrait is supported, but landscape gives a wider board view.</div>
            </div>
          </div>
        )}
        {isBuilding && (
          <div className="absolute inset-0 z-[60] flex items-center justify-center bg-black/60 text-white">
            <div className="bg-black/70 border border-white/20 rounded-lg px-6 py-4 text-center">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-white mx-auto mb-3"></div>
              <div className="text-sm font-semibold">{buildStatus || 'Building level...'}</div>
            </div>
          </div>
        )}
        {isTimeUp && levelTimeLimitSeconds && (
          <div className="absolute inset-0 z-[70] pointer-events-none flex items-start justify-center">
            <div className="mt-24 rounded-2xl border border-red-200/60 bg-red-700/90 px-6 py-3 text-center text-white shadow-2xl">
              <div className="text-lg font-black tracking-[0.18em]">TIME'S UP!</div>
            </div>
          </div>
        )}
        <TouchControls
          onMove={queueMove}
          disabled={isComplete || isBuilding || isTimeUp || shouldRotateGate || isWaitingToStart}
          targetRef={gestureSurfaceRef}
        />
        {isMobile && (
          <Thumbstick onMove={queueMove} disabled={isComplete || isBuilding || isTimeUp || shouldRotateGate || isWaitingToStart} />
        )}

        {desktopShellActive && (
          <>
            <aside className="pointer-events-none absolute inset-y-4 left-4 z-40 hidden w-80 xl:flex xl:flex-col xl:gap-4">
              <div className="pointer-events-auto overflow-hidden rounded-[32px] border border-[#8d6e4f]/55 bg-[#120d09]/78 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <div className="relative h-44 overflow-hidden border-b border-white/10">
                  <div className="absolute inset-0 bg-[#0b0907]" />
                  <img
                    src={menuArt}
                    alt="Stone Age art"
                    className="pointer-events-none absolute left-2 top-2 h-[78%] w-[78%] object-contain object-left-top opacity-95"
                    style={{ filter: "drop-shadow(0 4px 10px rgba(0,0,0,0.45))" }}
                  />
                  <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(14,10,8,0.08)_0%,rgba(14,10,8,0.18)_40%,rgba(14,10,8,0.82)_100%)]" />
                  <div className="absolute inset-x-5 bottom-5">
                    <div className="inline-flex items-center gap-2 rounded-full border border-amber-300/30 bg-amber-400/10 px-3 py-1 text-[10px] font-black uppercase tracking-[0.22em] text-amber-100">
                      <Sparkles className="h-3.5 w-3.5" />
                      Story Mode
                    </div>
                    <div className="mt-3 text-4xl font-black uppercase tracking-[0.08em] text-stone-50">
                      Stone Age
                    </div>
                    <div className="mt-2 max-w-[17rem] text-sm leading-relaxed text-stone-300">
                      A warmer, more cinematic puzzle shell inspired by your reference boards and menus.
                    </div>
                  </div>
                </div>

                <div className="space-y-3 p-4">
                  <button
                    type="button"
                    onClick={() => pushHudMessage("Adventure already in progress ✨")}
                    className="flex w-full items-center justify-between rounded-2xl border border-emerald-300/25 bg-emerald-500/14 px-4 py-3 text-left text-stone-50 transition-colors hover:bg-emerald-500/18"
                  >
                    <span>
                      <span className="block text-xs font-black uppercase tracking-[0.18em] text-emerald-200/80">Continue</span>
                      <span className="mt-1 block text-sm text-stone-200">Jump right back into Level {currentLevel.id}</span>
                    </span>
                    <Play className="h-5 w-5 text-emerald-200" />
                  </button>

                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={goToMapper}
                      className="flex min-h-24 flex-col items-start justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-stone-100 transition-colors hover:border-amber-200/30 hover:bg-white/10"
                    >
                      <LayoutDashboard className="h-5 w-5 text-amber-200" />
                      <div>
                        <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Create</div>
                        <div className="mt-1 text-sm font-semibold">Level Editor</div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={resetLevel}
                      className="flex min-h-24 flex-col items-start justify-between rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-left text-stone-100 transition-colors hover:border-amber-200/30 hover:bg-white/10"
                    >
                      <RotateCcw className="h-5 w-5 text-stone-200" />
                      <div>
                        <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Replay</div>
                        <div className="mt-1 text-sm font-semibold">Restart Stage</div>
                      </div>
                    </button>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Campaign</div>
                      <div className="mt-2 text-2xl font-black text-stone-50">{campaignProgressText}</div>
                      <div className="mt-1 text-xs text-stone-300">Stages cleared so far</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Network</div>
                      <div className="mt-2 text-2xl font-black text-stone-50">{networkBadgeText}</div>
                      <div className="mt-1 text-xs text-stone-300">{networkStatus === 'online' ? 'Live ghost inputs active' : 'Single-player mode'}</div>
                    </div>
                  </div>
                </div>
              </div>

              <div className="pointer-events-auto rounded-[28px] border border-[#8d6e4f]/45 bg-[#120d09]/72 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">World Map</div>
                    <div className="mt-1 text-lg font-black text-stone-50">Adventure Regions</div>
                  </div>
                  {campaignDialog}
                </div>

                <div className="mt-4 space-y-3">
                  {chapterCards.map((chapter) => (
                    <div
                      key={chapter.title}
                      className={[
                        "overflow-hidden rounded-2xl border p-3",
                        chapter.containsCurrent
                          ? "border-amber-300/35 bg-white/10"
                          : "border-white/10 bg-white/[0.045]",
                      ].join(" ")}
                    >
                      <div className="relative overflow-hidden rounded-xl border border-white/10">
                        {chapter.preview ? (
                          <img src={chapter.preview} alt={chapter.title} className="h-24 w-full object-cover opacity-80" />
                        ) : (
                          <div className={`h-24 w-full bg-gradient-to-br ${chapter.accent}`} />
                        )}
                        <div className={`absolute inset-0 bg-gradient-to-br ${chapter.accent}`} />
                        <div className="absolute inset-0 bg-[linear-gradient(180deg,rgba(8,12,13,0.05)_0%,rgba(8,12,13,0.72)_100%)]" />
                        <div className="absolute inset-x-3 bottom-3 flex items-end justify-between gap-3">
                          <div>
                            <div className="text-sm font-black uppercase tracking-[0.1em] text-stone-50">{chapter.title}</div>
                            <div className="mt-1 text-[11px] text-stone-200/80">{chapter.subtitle}</div>
                          </div>
                          <div className="rounded-full border border-white/15 bg-black/30 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-stone-100">
                            {chapter.completed}/{chapter.total}
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </aside>

            <aside className="pointer-events-none absolute inset-y-4 right-4 z-40 hidden w-80 xl:flex xl:flex-col xl:gap-4">
              <div className="pointer-events-auto rounded-[32px] border border-[#5a7f88]/40 bg-[#09161a]/76 p-4 shadow-[0_24px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl">
                <div className="rounded-[28px] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(125,211,252,0.18),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.05)_0%,rgba(255,255,255,0.02)_100%)] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.22em] text-sky-100/70">Explorer Profile</div>
                      <div className="mt-2 text-3xl font-black uppercase tracking-[0.08em] text-stone-50">Rex</div>
                      <div className="mt-1 text-sm text-stone-300">The little cave runner, now with a much fancier UI trailer.</div>
                    </div>
                    <div
                      className="flex h-20 w-20 items-center justify-center rounded-[24px] border border-white/15 text-3xl font-black text-stone-950 shadow-[inset_0_1px_0_rgba(255,255,255,0.3)]"
                      style={{ background: `linear-gradient(135deg, ${activeTheme.player}, ${activeTheme.arrow})` }}
                    >
                      R
                    </div>
                  </div>

                  <div className="mt-5 grid grid-cols-2 gap-3">
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">Current Stage</div>
                      <div className="mt-2 text-2xl font-black text-stone-50">{currentLevel.id}</div>
                      <div className="mt-1 text-xs text-stone-300">{activeThemeKey} theme</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-black/20 p-3">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">Best Moves</div>
                      <div className="mt-2 text-2xl font-black text-stone-50">{currentBestMoves ?? '--'}</div>
                      <div className="mt-1 text-xs text-stone-300">Personal record</div>
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-[28px] border border-white/10 bg-black/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Companions</div>
                      <div className="mt-1 text-lg font-black text-stone-50">Palette Picks</div>
                    </div>
                    <Star className="h-4 w-4 text-amber-200" />
                  </div>
                  <div className="mt-4 grid grid-cols-4 gap-2">
                    {[
                      { name: 'Moss', color: '#79d28a' },
                      { name: 'Tide', color: '#5daeff' },
                      { name: 'Amber', color: '#f7c35f' },
                      { name: 'Ember', color: '#ff8f6a' },
                    ].map((variant, index) => (
                      <button
                        key={variant.name}
                        type="button"
                        onClick={() => pushHudMessage(`${variant.name} skin preview coming soon`)}
                        className={[
                          'group rounded-2xl border px-2 py-3 text-center transition-colors',
                          index === 0 ? 'border-emerald-300/35 bg-emerald-500/12' : 'border-white/10 bg-white/5 hover:bg-white/10',
                        ].join(' ')}
                      >
                        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-[18px] border border-white/15 text-sm font-black text-stone-950" style={{ backgroundColor: variant.color }}>
                          {variant.name.charAt(0)}
                        </div>
                        <div className="mt-2 text-[10px] font-black uppercase tracking-[0.14em] text-stone-200">{variant.name}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              <div className="pointer-events-auto rounded-[28px] border border-[#5a7f88]/35 bg-[#09161a]/72 p-4 shadow-[0_18px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl">
                <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Session Snapshot</div>
                <div className="mt-3 space-y-3">
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-stone-100">
                      <Compass className="h-4 w-4 text-sky-200" />
                      Objective
                    </div>
                    <div className="mt-2 text-sm leading-relaxed text-stone-300">
                      Reach the cave, keep an eye on the clock, and use remote arrows to bridge awkward gaps.
                    </div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                    <div className="flex items-center gap-2 text-sm font-semibold text-stone-100">
                      <TimerReset className="h-4 w-4 text-amber-200" />
                      Clock
                    </div>
                    <div className="mt-2 text-2xl font-black text-stone-50">{timeLeftText ?? '∞'}</div>
                    <div className="mt-1 text-xs text-stone-300">{currentBestClockText ? `Best clock: ${currentBestClockText}` : 'No clock record yet'}</div>
                  </div>
                  <div className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.05] p-3">
                    <div>
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">Controls</div>
                      <div className="mt-1 text-sm text-stone-100">Keyboard, touch, and immersive board zoom.</div>
                    </div>
                    <HowToPlayDialog disabled={shouldRotateGate} />
                  </div>
                </div>
              </div>
            </aside>
          </>
        )}

        {useSplitHud ? (
          <div
            className="relative z-50 flex w-full items-start justify-between px-2"
            style={{ paddingTop: 'calc(env(safe-area-inset-top) + 0.25rem)' }}
          >
            {/* Left HUD cluster */}
            <div className="bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border/50 flex items-center gap-1 px-2 py-1.5 max-w-[calc(50vw-12px)] overflow-x-auto">
              <Button
                onClick={() => {
                  if (currentLevelIndex > 0 && goToLevelIndex(currentLevelIndex - 1)) pushHudMessage("Previous level");
                }}
                variant="ghost"
                size="default"
                className="h-9 w-9 p-0 text-lg font-bold hover:bg-primary/20"
                disabled={currentLevelIndex === 0}
                aria-label="Previous level"
                title="Previous level (P)"
              >
                ←
              </Button>

               <div className="flex items-center gap-2 px-1 whitespace-nowrap">
                 <span className="text-primary font-bold text-base">
                   {`L${currentLevel.id}`}
                 </span>
                 <span className="text-foreground font-medium text-sm">{`M:${moves}`}</span>
                 <span
                   className="inline-flex items-center rounded-md border border-border/60 bg-background/70 px-2 py-1 text-[11px] font-black tracking-wide text-muted-foreground"
                   title="Campaign clears"
                 >
                   {campaignProgressText}
                 </span>
                 {currentBestMoves != null && (
                   <span
                     className="inline-flex items-center rounded-md border border-amber-300/50 bg-amber-500/10 px-2 py-1 text-[11px] font-black tracking-wide text-amber-100"
                     title="Personal best moves on this level"
                   >
                     PB {currentBestMoves}
                   </span>
                 )}
                  {timeLeftText && (
                     <span
                       className={[
                         "inline-flex items-center gap-2 rounded-md border px-2.5 py-1 text-[13px] font-black tabular-nums shadow-md",
                         isTimerUrgent
                           ? "border-red-200/80 bg-red-700 text-white shadow-lg ring-2 ring-red-200/40"
                           : "border-border/60 bg-background/70 text-foreground ring-1 ring-black/10",
                       ].join(" ")}
                       title="Time left"
                    >
                      <span aria-hidden>⏱</span>
                      <span>{timeLeftText}</span>
                   </span>
                 )}
                 {isWaitingToStart && (
                   <Button
                     onClick={startLevelWhenReady}
                     variant="default"
                     size="sm"
                     className="h-8 px-2 text-[11px] font-black tracking-wide"
                     title="Start timer when ready"
                   >
                     <Play className="mr-1 h-3.5 w-3.5" />
                     START
                   </Button>
                 )}
                 <div className="flex items-center gap-1">
                   <span
                     className="inline-flex items-center gap-1 rounded-md border border-red-300/70 bg-red-600 text-[11px] font-black text-white px-1.5 py-0.5"
                     title="Red keys collected"
                   >
                    <span aria-hidden>🗝</span>
                    <span>{redKeyCount}</span>
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded-md border border-green-300/70 bg-green-600 text-[11px] font-black text-white px-1.5 py-0.5"
                    title="Green keys collected"
                  >
                    <span aria-hidden>🔑</span>
                    <span>{greenKeyCount}</span>
                  </span>
                </div>
              </div>

              <Button
                onClick={() => {
                  if (currentLevelIndex < allLevels.length - 1) {
                    if (goToLevelIndex(currentLevelIndex + 1)) pushHudMessage("Next level");
                  } else {
                    pushHudMessage("No more levels");
                  }
                }}
                variant="ghost"
                size="default"
                className="h-9 w-9 p-0 text-lg font-bold hover:bg-primary/20"
                aria-label="Next level"
                title={nextLevelTitle}
              >
                →
              </Button>
            </div>

            {/* Right HUD cluster */}
            <div className="bg-card/95 backdrop-blur rounded-lg shadow-lg border border-border/50 flex items-center gap-2 px-2 py-1.5 max-w-[calc(50vw-12px)] overflow-x-auto">
              <Button
                onClick={resetLevel}
                variant="outline"
                size="default"
                disabled={isComplete || localPlayer?.isGliding}
                className="h-9 px-3 text-sm font-semibold hover:bg-primary/20"
                title="Restart level (R)"
              >
                {isFullscreenMode ? "↻" : "Restart"}
              </Button>

              {campaignDialog}

              {!isFullscreenMode && <HowToPlayDialog disabled={shouldRotateGate} />}

              {!isFullscreenMode && (
                <Button
                  onClick={() => {
                    const next = !showCoordsOverlay;
                    setShowCoordsOverlay(next);
                    setShowCoordsOverlayState(next);
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2 text-xs font-black tracking-wide hover:bg-primary/20"
                  title="Toggle coordinate labels (shown in SPR view)"
                  aria-pressed={showCoordsOverlay}
                >
                  XY
                </Button>
              )}

                <Button
                  onClick={() => {
                    setUserZoomTouched(true);
                    setCameraZoomIndex((i) => Math.max(0, i - 1));
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-base hover:bg-primary/20"
                title="Zoom out"
                disabled={!canZoomOut}
              >
                -
              </Button>

              <div className="min-w-10 text-center font-semibold text-muted-foreground text-xs whitespace-nowrap">
                {Math.round((1 / cameraZoomFactor) * 100)}%
              </div>

                <Button
                  onClick={() => {
                    setUserZoomTouched(true);
                    setCameraZoomIndex((i) => Math.min(CAMERA_ZOOM_LEVELS.length - 1, i + 1));
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-base hover:bg-primary/20"
                title="Zoom in"
                disabled={!canZoomIn}
              >
                +
              </Button>

                <Button
                  onClick={() => {
                    setViewMode(nextViewMode);
                    setUserZoomTouched(false);
                    setCameraOffset({ x: 0, z: 0 });
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-9 px-3 text-xs font-bold tracking-wide hover:bg-primary/20"
                title={`Switch to ${VIEW_MODE_LABELS[nextViewMode]} view`}
              >
                {VIEW_MODE_LABELS[viewMode]}
              </Button>

                <Button
                  onClick={() => void toggleFullscreenMode()}
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2 text-base font-bold hover:bg-primary/20"
                title={isFullscreenMode ? "Exit fullscreen layout" : "Fullscreen layout (fit board)"}
                aria-pressed={isFullscreenMode}
              >
                ⛶
              </Button>

              {isMobile && (
                <Button
                  onClick={() => setShowDpad(v => !v)}
                  variant="ghost"
                  size="sm"
                  className="h-9 w-9 p-0 text-base font-bold hover:bg-primary/20"
                  title={showDpad ? "Hide D-pad" : "Show D-pad"}
                  aria-pressed={showDpad}
                >
                  ⊞
                </Button>
              )}

              {!isFullscreenMode && (cameraOffset.x !== 0 || cameraOffset.z !== 0) && (
                <Button
                  onClick={() => {
                    setCameraOffset({ x: 0, z: 0 });
                    pushHudMessage("View reset");
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-9 px-2 text-xs hover:bg-primary/20"
                  title="Reset camera view (double-click game area)"
                >
                  ⟲
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div
            className="absolute left-4 right-4 z-50 xl:left-[22rem] xl:right-[22rem]"
            style={{ top: 'calc(env(safe-area-inset-top) + 0.75rem)' }}
          >
            <div className="rounded-[28px] border border-[#7b6043]/60 bg-[#1c140e]/78 p-3 shadow-[0_24px_90px_rgba(0,0,0,0.42)] backdrop-blur-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    onClick={() => {
                      if (currentLevelIndex > 0 && goToLevelIndex(currentLevelIndex - 1)) pushHudMessage("Previous level");
                    }}
                    variant="ghost"
                    size="default"
                    className="h-11 w-11 rounded-2xl border border-white/10 bg-white/5 p-0 text-xl font-bold text-stone-50 hover:bg-white/10"
                    disabled={currentLevelIndex === 0}
                    aria-label="Previous level"
                    title="Previous level (P)"
                  >
                    ←
                  </Button>

                  <div className="flex flex-wrap items-center gap-2 rounded-[22px] border border-white/10 bg-black/20 px-3 py-2">
                    <div className="rounded-2xl border border-amber-300/25 bg-amber-500/10 px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">Stage</div>
                      <div className="mt-1 text-lg font-black text-amber-100">L{currentLevel.id}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">Moves</div>
                      <div className="mt-1 text-lg font-black text-stone-50">{moves}</div>
                    </div>
                    <div className={[
                      'rounded-2xl border px-3 py-2',
                      isTimerUrgent ? 'border-red-300/40 bg-red-500/14' : 'border-white/10 bg-white/5',
                    ].join(' ')}>
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">Clock</div>
                      <div className="mt-1 text-lg font-black text-stone-50">{timeLeftText ?? '∞'}</div>
                    </div>
                    <div className="rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                      <div className="text-[10px] font-black uppercase tracking-[0.16em] text-stone-400">Campaign</div>
                      <div className="mt-1 text-lg font-black text-stone-50">{campaignProgressText}</div>
                    </div>
                    <div className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-semibold text-stone-200">
                      <span className="inline-flex items-center gap-1 rounded-full border border-red-300/60 bg-red-600/85 px-2 py-1 text-xs font-black text-white">
                        <span aria-hidden>🗝</span>
                        <span>{redKeyCount}</span>
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-green-300/60 bg-green-600/85 px-2 py-1 text-xs font-black text-white">
                        <span aria-hidden>🔑</span>
                        <span>{greenKeyCount}</span>
                      </span>
                    </div>
                  </div>

                  <Button
                    onClick={() => {
                      if (currentLevelIndex < allLevels.length - 1) {
                        if (goToLevelIndex(currentLevelIndex + 1)) pushHudMessage("Next level");
                      } else {
                        pushHudMessage("No more levels");
                      }
                    }}
                    variant="ghost"
                    size="default"
                    className="h-11 w-11 rounded-2xl border border-white/10 bg-white/5 p-0 text-xl font-bold text-stone-50 hover:bg-white/10"
                    aria-label="Next level"
                    title={nextLevelTitle}
                  >
                    →
                  </Button>
                </div>

                <div className="flex flex-wrap items-center gap-2 rounded-[22px] border border-white/10 bg-black/20 px-3 py-2">
                  {isWaitingToStart && (
                    <Button
                      onClick={startLevelWhenReady}
                      variant="default"
                      size="sm"
                      className="h-10 rounded-2xl bg-emerald-500 px-3 text-xs font-black tracking-[0.12em] text-emerald-950 hover:bg-emerald-400"
                      title="Start timer when ready"
                    >
                      <Play className="mr-2 h-4 w-4" />
                      START WHEN READY
                    </Button>
                  )}

                  <Button
                    onClick={resetLevel}
                    variant="ghost"
                    size="sm"
                    disabled={isComplete || localPlayer?.isGliding}
                    className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-stone-50 hover:bg-white/10"
                    title="Restart level (R)"
                  >
                    <RotateCcw className="mr-2 h-4 w-4" />
                    Replay
                  </Button>

                  <HowToPlayDialog disabled={shouldRotateGate} />

                  <Button
                    onClick={() => {
                      const next = !showCoordsOverlay;
                      setShowCoordsOverlay(next);
                      setShowCoordsOverlayState(next);
                    }}
                    variant="ghost"
                    size="sm"
                    className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-xs font-black tracking-[0.16em] text-stone-50 hover:bg-white/10"
                    title="Toggle coordinate labels (shown in SPR view)"
                    aria-pressed={showCoordsOverlay}
                  >
                    XY
                  </Button>

                  <Button
                    onClick={() => {
                      setUserZoomTouched(true);
                      setCameraZoomIndex((i) => Math.max(0, i - 1));
                    }}
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 p-0 text-stone-50 hover:bg-white/10"
                    title="Zoom out"
                    disabled={!canZoomOut}
                  >
                    <ZoomOut className="h-4 w-4" />
                  </Button>

                  <div className="min-w-14 text-center text-sm font-black text-stone-300">
                    {Math.round((1 / cameraZoomFactor) * 100)}%
                  </div>

                  <Button
                    onClick={() => {
                      setUserZoomTouched(true);
                      setCameraZoomIndex((i) => Math.min(CAMERA_ZOOM_LEVELS.length - 1, i + 1));
                    }}
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 p-0 text-stone-50 hover:bg-white/10"
                    title="Zoom in"
                    disabled={!canZoomIn}
                  >
                    <ZoomIn className="h-4 w-4" />
                  </Button>

                  <Button
                    onClick={() => {
                      setViewMode(nextViewMode);
                      setUserZoomTouched(false);
                      setCameraOffset({ x: 0, z: 0 });
                    }}
                    variant="ghost"
                    size="sm"
                    className="h-10 rounded-2xl border border-white/10 bg-white/5 px-3 text-sm font-black tracking-[0.14em] text-stone-50 hover:bg-white/10"
                    title={`Switch to ${VIEW_MODE_LABELS[nextViewMode]} view`}
                  >
                    {VIEW_MODE_LABELS[viewMode]}
                  </Button>

                  <Button
                    onClick={() => void toggleFullscreenMode()}
                    variant="ghost"
                    size="sm"
                    className="h-10 w-10 rounded-2xl border border-white/10 bg-white/5 p-0 text-stone-50 hover:bg-white/10"
                    title={isFullscreenMode ? "Exit fullscreen layout" : "Fullscreen layout (fit board)"}
                    aria-pressed={isFullscreenMode}
                  >
                    <Expand className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </div>
          </div>
        )}
        <div
          ref={gestureSurfaceRef}
          data-touch-controls-target
          className={[
            "relative z-20 w-full min-h-0 flex-1",
            desktopShellActive ? "px-3 pb-5 pt-24 xl:px-[22rem] xl:pb-8" : "",
          ].join(" ")}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
          style={{
            cursor: viewMode === 'fps' || viewMode === 'sprite' ? 'default' : isDragging ? 'grabbing' : 'grab',
            // Prevent the browser from stealing swipe gestures (mobile), even in SPR view.
            touchAction: shouldRotateGate ? 'auto' : 'none',
          }}
        >
          <div className={[
            "relative h-full w-full overflow-hidden rounded-[30px] border border-white/10 bg-[linear-gradient(180deg,rgba(9,18,20,0.9)_0%,rgba(7,12,14,0.96)_100%)] shadow-[0_26px_120px_rgba(0,0,0,0.55)]",
            desktopShellActive ? "ring-1 ring-amber-300/10" : "",
          ].join(' ')}>
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(255,215,160,0.15),transparent_28%),linear-gradient(180deg,rgba(255,255,255,0.03)_0%,rgba(255,255,255,0)_18%,rgba(0,0,0,0.18)_100%)]" />
            <div className="pointer-events-none absolute inset-x-0 top-0 h-20 bg-[linear-gradient(180deg,rgba(255,255,255,0.06)_0%,transparent_100%)]" />

            {desktopShellActive && (
              <div className="pointer-events-none absolute inset-x-4 bottom-4 z-30 hidden xl:flex items-end justify-between gap-4">
                <div className="max-w-md rounded-[24px] border border-white/10 bg-black/28 px-4 py-3 backdrop-blur-md">
                  <div className="text-[10px] font-black uppercase tracking-[0.2em] text-stone-400">Adventure Notes</div>
                  <div className="mt-1 text-sm leading-relaxed text-stone-200">
                    Reach the cave, route arrows across the void, and keep the clock from eating your lunch.
                  </div>
                </div>
                <div className="flex items-center gap-2 rounded-[24px] border border-white/10 bg-black/28 px-4 py-3 backdrop-blur-md text-sm text-stone-200">
                  <BookOpen className="h-4 w-4 text-amber-200" />
                  <span>View {VIEW_MODE_LABELS[viewMode]} • Theme {activeThemeKey}</span>
                </div>
              </div>
            )}

            {viewMode === "sprite" ? (
              <GameSprite2D
                grid={renderGrid}
                atlasSourceGrid={activeLevel?.grid ?? currentLevel?.grid ?? renderGrid}
                cavePos={renderCavePos}
                levelImageUrl={currentLevel?.image ?? null}
                playerStart={activeLevel?.playerStart ?? currentLevel?.playerStart ?? null}
                selectedArrow={selectedArrow}
                selectorPos={isSelectorActive && !selectedArrow ? selectorPos : null}
                players={renderPlayers}
                zoomFactor={cameraZoomFactor}
                showCoords={showCoordsOverlay}
                fullBleed={isFullscreenMode}
                onArrowClick={(x, y) => {
                  if (localPlayer?.isGliding) return;
                  const cell = renderGrid[y]?.[x];
                  if (cell !== undefined && isArrowCell(cell)) {
                    if (localPlayerPos.x === x && localPlayerPos.y === y) {
                      pushHudMessage("Step off the arrow before selecting it.", 2200);
                      return;
                    }
                    const isSameArrow = selectedArrow?.x === x && selectedArrow?.y === y;
                    if (isSameArrow) {
                      enqueueInput({ type: "deselect" });
                      resetSelectorToPlayer();
                      flashPlayerHighlight();
                      pushHudMessage("Arrow deselected");
                    } else {
                      enqueueInput({ type: "select", x, y });
                      setIsSelectorActive(false);
                      setSelectorPos({ x, y });
                      pushHudMessage("Arrow selected — use the controls to move it.", 2200);
                    }
                  }
                }}
                onCancelSelection={() => {
                  if (selectedArrow) {
                    enqueueInput({ type: "deselect" });
                    resetSelectorToPlayer();
                    pushHudMessage("Arrow deselected");
                  }
                }}
              />
            ) : (
              <Game3D
                grid={renderGrid}
                cavePos={renderCavePos}
                selectedArrow={selectedArrow}
                selectorPos={isSelectorActive && !selectedArrow ? selectorPos : null}
                cameraOffset={cameraOffset}
                zoomFactor={cameraZoomFactor}
                viewMode={viewMode}
                theme={currentLevel.theme}
                players={renderPlayers}
                localPlayerId={localPlayer?.id}
                onPlayerClick={flashPlayerHighlight}
                playerFlashCount={playerFlashCount}
                onArrowClick={(x, y) => {
                  if (localPlayer?.isGliding) return;
                  const cell = renderGrid[y]?.[x];
                  if (cell !== undefined && isArrowCell(cell)) {
                    if (localPlayerPos.x === x && localPlayerPos.y === y) {
                      pushHudMessage("Step off the arrow before selecting it.", 2200);
                      return;
                    }
                    const isSameArrow = selectedArrow?.x === x && selectedArrow?.y === y;
                    if (isSameArrow) {
                      enqueueInput({ type: "deselect" });
                      resetSelectorToPlayer();
                      flashPlayerHighlight();
                      pushHudMessage("Arrow deselected");
                    } else {
                      enqueueInput({ type: "select", x, y });
                      setIsSelectorActive(false);
                      setSelectorPos({ x, y });
                      pushHudMessage("Arrow selected — use the controls to move it.", 2200);
                    }
                  }
                }}
                onCancelSelection={() => {
                  if (selectedArrow) {
                    enqueueInput({ type: "deselect" });
                    resetSelectorToPlayer();
                    pushHudMessage("Arrow deselected");
                  }
                }}
              />
            )}
          </div>
        </div>
        {isMobile && showDpad && (
          <div
            className="absolute left-1/2 transform -translate-x-1/2 z-50"
            style={{ bottom: 'calc(env(safe-area-inset-bottom) + 0.35rem)' }}
          >
            <div className="bg-card/95 backdrop-blur border border-border/50 px-2 py-1 rounded shadow-md">
              <div className="grid grid-cols-4 gap-1">
                <Button onClick={() => queueMove(0, -1)} className="h-11 w-11 p-0 text-base" variant="secondary" size="sm">↑</Button>
                <Button onClick={() => queueMove(0, 1)} className="h-11 w-11 p-0 text-base" variant="secondary" size="sm">↓</Button>
                <Button onClick={() => queueMove(-1, 0)} className="h-11 w-11 p-0 text-base" variant="secondary" size="sm">←</Button>
                <Button onClick={() => queueMove(1, 0)} className="h-11 w-11 p-0 text-base" variant="secondary" size="sm">→</Button>
              </div>
            </div>
          </div>
        )}
        {selectedArrow && (
          <div className="absolute top-1 right-1 z-50 bg-primary/90 backdrop-blur px-2 py-0.5 rounded text-xs font-semibold text-primary-foreground shadow-md">Arrow ({selectedArrow.x},{selectedArrow.y})</div>
        )}
        {isWaitingToStart && (
          <div className="absolute inset-x-0 top-[calc(env(safe-area-inset-top)+5.25rem)] z-[65] flex justify-center px-4">
            <div className="pointer-events-auto rounded-2xl border border-emerald-300/45 bg-emerald-700/92 px-4 py-2 text-center text-white shadow-2xl">
              <div className="text-[11px] font-black tracking-[0.14em]">READY CHECK</div>
              <div className="mt-1 text-sm">Timer is paused. Press START when ready.</div>
            </div>
          </div>
        )}
        {hudMessage && !isComplete && (
          <div className="pointer-events-none absolute bottom-3 left-1/2 z-40 -translate-x-1/2 px-4">
            <div className="rounded-full border border-white/10 bg-black/55 px-4 py-2 text-sm font-medium text-stone-100 shadow-xl backdrop-blur-md">
              {hudMessage}
            </div>
          </div>
        )}
        {isComplete && completionSummary && (
          <div className="absolute inset-0 z-[70] flex items-center justify-center bg-black/55 px-4 backdrop-blur-sm">
            <div className="pointer-events-auto w-full max-w-xl rounded-[28px] border border-white/15 bg-stone-950/92 p-6 text-stone-50 shadow-2xl">
              <div className="text-center">
                <div className="text-xs font-black uppercase tracking-[0.22em] text-amber-300">
                  Stage Cleared
                </div>
                <div className="mt-2 text-3xl font-black uppercase tracking-[0.14em] sm:text-4xl">
                  Level {completionSummary.levelId} Complete
                </div>
                <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
                  {completionSummary.isFirstClear && (
                    <span className="rounded-full border border-emerald-300/40 bg-emerald-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-emerald-100">
                      First Clear
                    </span>
                  )}
                  {completionSummary.isNewBestMoves && (
                    <span className="rounded-full border border-amber-300/40 bg-amber-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-amber-100">
                      Best Moves
                    </span>
                  )}
                  {completionSummary.isNewBestTime && (
                    <span className="rounded-full border border-sky-300/40 bg-sky-500/15 px-3 py-1 text-[11px] font-black uppercase tracking-[0.14em] text-sky-100">
                      Best Clock
                    </span>
                  )}
                </div>
              </div>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Run Moves</div>
                  <div className="mt-2 text-3xl font-black">{completionSummary.moves}</div>
                </div>
                <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                  <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Personal Best</div>
                  <div className="mt-2 text-3xl font-black">{completionSummary.bestMoves ?? "--"}</div>
                </div>
                {completionClockText && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Clock Left</div>
                    <div className="mt-2 text-3xl font-black">{completionClockText}</div>
                  </div>
                )}
                {completionBestClockText && (
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                    <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Best Clock</div>
                    <div className="mt-2 text-3xl font-black">{completionBestClockText}</div>
                  </div>
                )}
              </div>

              <div className="mt-4 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-center">
                <div className="text-xs font-black uppercase tracking-[0.16em] text-stone-400">Campaign Progress</div>
                <div className="mt-2 text-lg font-black text-stone-50">
                  {completionSummary.completedCount}/{completionSummary.totalLevels} stages cleared
                </div>
              </div>

              <div className="mt-6 flex flex-wrap items-center justify-center gap-2">
                <Button
                  onClick={resetLevel}
                  variant="outline"
                  className="border-white/15 bg-white/5 text-stone-50 hover:bg-white/10"
                >
                  Replay
                </Button>
                {currentLevelIndex < allLevels.length - 1 ? (
                  <Button
                    onClick={nextLevel}
                    className="bg-amber-300 text-stone-950 hover:bg-amber-200"
                  >
                    Next Level
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      goToLevelIndex(0);
                      pushHudMessage("Campaign restarted", 2200);
                    }}
                    className="bg-amber-300 text-stone-950 hover:bg-amber-200"
                  >
                    Restart Campaign
                  </Button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>
    );
};
