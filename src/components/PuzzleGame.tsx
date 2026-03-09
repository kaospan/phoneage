/* @refresh reset */
import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getAllLevels, themes, manualFallbackById } from "@/data/levels";
import { Game3D } from "./Game3D";
import { GameSprite2D } from "./GameSprite2D";
import { UI_SETTINGS_UPDATED_EVENT, getShowCoordsOverlay, setShowCoordsOverlay } from "@/lib/uiSettings";
import { TouchControls } from "./TouchControls";
import { Thumbstick } from "./Thumbstick";
import { CellType, GameState, KeyInventory, Position } from "@/game/types";
import { isArrowCell } from "@/game/arrows";
import { attemptPlayerMove, attemptRemoteArrowMove } from "@/game/movement";
import { buildLevelFromSources } from "@/lib/levelImageDetection";
import { LEVEL_OVERRIDES_UPDATED_EVENT, saveLevelOverride } from "@/lib/levelOverrides";
import { seedDefaultReferences } from "@/lib/referenceSeeder";
import { useIsMobile } from "@/hooks/use-mobile";
import { HowToPlayDialog } from "./HowToPlayDialog";

console.log('📦 PuzzleGame.tsx loading...');

type PlayerId = string;
type FacingDirection = "up" | "right" | "down" | "left";

type InputCommand =
  | { type: "move"; dx: number; dy: number; seq: number }
  | { type: "select"; x: number; y: number; seq: number }
  | { type: "deselect"; seq: number };

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
  cavePos: Position;
  tick: number;
}

const CAMERA_ZOOM_LEVELS = [1.08, 1, 0.93, 0.86] as const;
const DEFAULT_CAMERA_ZOOM_INDEX = 2;
  const VIEW_MODES = ["3d", "fps", "2d", "sprite"] as const;
  type ViewMode = (typeof VIEW_MODES)[number];
  const VIEW_MODE_LABELS: Record<ViewMode, string> = {
  "3d": "3D",
  fps: "FPS",
  "2d": "2D",
  sprite: "SPR",
  };
const EMPTY_KEYS: KeyInventory = { red: false, green: false };

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

type LevelData = ReturnType<typeof getAllLevels>[number];

export const PuzzleGame = () => {
  console.log('⚛️ PuzzleGame component rendering...');

  const isMobile = useIsMobile();
  const [isPortrait, setIsPortrait] = useState(false);
  const shouldRotateGate = isMobile && isPortrait;

  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const [renderGrid, setRenderGrid] = useState<CellType[][]>([]);
  const [renderPlayers, setRenderPlayers] = useState<SimPlayer[]>([]);
  const [renderCavePos, setRenderCavePos] = useState({ x: 0, y: 0 });
  const [activeLevel, setActiveLevel] = useState<LevelData | null>(null);
  const [moves, setMoves] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("3d");
  const [selectedArrow, setSelectedArrow] = useState<{ x: number, y: number } | null>(null); // For remote arrow control
  const [cameraOffset, setCameraOffset] = useState({ x: 0, z: 0 }); // Camera pan offset when arrow selected
  const [cameraZoomIndex, setCameraZoomIndex] = useState(DEFAULT_CAMERA_ZOOM_INDEX);
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

  const simRef = useRef<SimulationState | null>(null);
  const inputQueueRef = useRef<Map<PlayerId, InputCommand[]>>(new Map());
  const localPlayerIdRef = useRef<PlayerId>('local');
  const inputSeqRef = useRef(0);
  const wsRef = useRef<WebSocket | null>(null);
  const lastRenderRef = useRef(0);
  const buildInFlightRef = useRef<Set<number>>(new Set());

  const [overrideRevision, setOverrideRevision] = useState(0);
  const [showCoordsOverlay, setShowCoordsOverlayState] = useState(() => getShowCoordsOverlay());

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

  const allLevels = useMemo(() => getAllLevels(), [currentLevelIndex, overrideRevision]);
  const currentLevel = allLevels[currentLevelIndex];

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

  // On mobile landscape, bias toward zoom-out so the full board is on screen.
  useEffect(() => {
    if (!isMobile) return;
    if (shouldRotateGate) return;
    setCameraOffset({ x: 0, z: 0 });
    setCameraZoomIndex(0);
  }, [isMobile, shouldRotateGate, currentLevelIndex]);

    const isPlaceholderGrid = useCallback((levelGrid?: number[][]) => {
      if (!levelGrid || levelGrid.length === 0) return true;
      if (levelGrid.length === 1 && levelGrid[0]?.length === 1) return true;
      return levelGrid.every(row => row.every(cell => cell === 5));
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
            ).map((c) => (c === 18 ? 0 : c));

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
      const cave = { ...level.cavePos };
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
        cavePos: cave,
        tick: 0
      };

      setRenderGrid(gridCopy.map(row => [...row]));
      setRenderPlayers(Array.from(players.values()));
      setRenderCavePos(cave);
      setMoves(0);
      setIsComplete(false);
      setSelectedArrow(null);
      setSelectorPos({ ...level.playerStart });
      setIsSelectorActive(false);
      setCameraOffset({ x: 0, z: 0 });
      setActiveLevel(level);
    }, [buildBaseGrid]);

    // Initialize or auto-build level
    useEffect(() => {
      if (!currentLevel) return;
      let cancelled = false;

      const needsBuild = isPlaceholderGrid(currentLevel.grid);
      if (!needsBuild) {
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
    }, [currentLevelIndex, applyLevelState, isPlaceholderGrid]);

    // Show drag hint on first load
    useEffect(() => {
      const hasSeenHint = sessionStorage.getItem('dragHintSeen');
      if (!hasSeenHint) {
        setTimeout(() => {
          toast.info("💡 Tip: Drag the game view to pan the camera!", { duration: 4000 });
          sessionStorage.setItem('dragHintSeen', 'true');
        }, 1500);
      }
    }, []);

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

    const enqueueInput = useCallback((command: Omit<InputCommand, "seq">) => {
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
      if (isComplete || isBuilding) return;
      enqueueInput({ type: "move", dx, dy });
    }, [enqueueInput, isComplete, isBuilding]);

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
            toast.success(`${outcome.collectedKey.toUpperCase()} KEY COLLECTED`);
          }
          if (outcome.unlockedLock && player.isLocal) {
            toast.success(`${outcome.unlockedLock.toUpperCase()} LOCK OPENED`);
          }
          if (outcome.brokeRock && player.isLocal) {
            toast.info("ROCK CRUMBLED!");
          }
          if (outcome.consumedMove) {
            player.moves += 1;
            if (player.isLocal) localMoves = player.moves;
          }
        }
      });

      const localPlayer = sim.players.get(localPlayerIdRef.current);
      if (localPlayer && localPlayer.pos.x === sim.cavePos.x && localPlayer.pos.y === sim.cavePos.y && !localComplete) {
        localComplete = true;
        setIsComplete(true);
        toast.success(`LEVEL ${currentLevel.id} COMPLETE! MOVES: ${localPlayer.moves}`, {
          duration: 3000,
        });

        const timer = setTimeout(() => {
          if (currentLevelIndex < allLevels.length - 1) {
            setCurrentLevelIndex(i => i + 1);
          } else {
            toast.success("ALL LEVELS COMPLETE! YOU WIN!", {
              duration: 5000,
            });
          }
        }, 2000);

        setTimeout(() => clearTimeout(timer), 2100);
      }

      if (gridDirty) setRenderGrid(sim.grid.map(row => [...row]));
      if (playersDirty || gridDirty) setRenderPlayers(Array.from(sim.players.values()).map(p => ({ ...p, pos: { ...p.pos } })));
      if (localMoves !== moves) setMoves(localMoves);
      if (localSelected !== selectedArrow) setSelectedArrow(localSelected);
      if (sim.cavePos.x !== renderCavePos.x || sim.cavePos.y !== renderCavePos.y) setRenderCavePos(sim.cavePos);
    }, [allLevels.length, currentLevel?.id, currentLevelIndex, moves, renderCavePos.x, renderCavePos.y, selectedArrow]);

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
        toast.info("Arrow deselected - control returned to player");
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
        toast.info("Arrow selected! Use arrow keys to move it.");
        return;
      }

      if (isOnPlayer) {
        resetSelectorToPlayer();
        return;
      }

      toast.info("Move the selector onto an arrow block, then press Space or Enter.");
    }, [
      enqueueInput,
      flashPlayerHighlight,
      isBuilding,
      isComplete,
      isSelectorActive,
      localPlayer?.isGliding,
      localPlayerPos.x,
      localPlayerPos.y,
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
          case 'n': case 'N': e.preventDefault(); if (currentLevelIndex < allLevels.length - 1) { setCurrentLevelIndex(i => i + 1); toast.info("SKIPPED TO NEXT LEVEL"); } break;
          case 'p': case 'P': e.preventDefault(); if (currentLevelIndex > 0) { setCurrentLevelIndex(i => i - 1); toast.info("PREVIOUS LEVEL"); } break;
        }
      };
      window.addEventListener('keydown', handleKeyPress);
      return () => window.removeEventListener('keydown', handleKeyPress);
    }, [
      currentLevelIndex,
      isBuilding,
      isSelectorActive,
      moveKeyboardSelector,
      queueMove,
      selectedArrow,
      toggleKeyboardSelection
    ]);

    const resetLevel = () => {
      const levelToReset = activeLevel ?? currentLevel;
      if (!levelToReset) return;
      applyLevelState(levelToReset);
      toast.info("LEVEL RESET");
    };

    const nextLevel = () => {
      if (currentLevelIndex < allLevels.length - 1) {
        setCurrentLevelIndex(i => i + 1);
      } else {
        toast.success("ALL LEVELS COMPLETE!");
      }
    };

    const prevLevel = () => { if (currentLevelIndex > 0) setCurrentLevelIndex(i => i - 1); };
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
      toast.info("View reset");
    };

    useEffect(() => {
      if (viewMode === 'fps') {
        setIsDragging(false);
      }
    }, [viewMode]);

    const levelBackground = currentLevel?.image;

    return (
      <div className={`relative flex h-full w-full flex-col overflow-hidden bg-gradient-to-br ${currentLevel.theme ? themes[currentLevel.theme].background : 'from-amber-50 to-orange-100'}`}>
        {levelBackground && (
          <div
            className="absolute inset-0 opacity-30 bg-cover bg-center blur-[2px]"
            style={{ backgroundImage: `url(${levelBackground})` }}
          />
        )}
        <div className="absolute inset-0 bg-black/30" />
        {shouldRotateGate && (
          <div className="absolute inset-0 z-[80] flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="mx-6 max-w-sm rounded-2xl border border-white/15 bg-black/55 px-6 py-6 text-center shadow-2xl">
              <div className="text-lg font-black tracking-[0.18em] text-white/95">ROTATE DEVICE</div>
              <div className="mt-2 text-sm leading-relaxed text-white/80">
                Landscape is required on mobile so the whole gameboard fits on screen.
              </div>
              <div className="mt-4 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-xs text-white/70">
                Tip: disable screen rotation lock.
              </div>
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
        <TouchControls onMove={queueMove} disabled={isComplete || isBuilding || shouldRotateGate} />
        <Thumbstick onMove={queueMove} disabled={isComplete || isBuilding || shouldRotateGate} />
        <div
          className="absolute left-0 right-0 z-50 flex justify-center"
          style={{ top: 'calc(env(safe-area-inset-top) + 0.5rem)' }}
        >
          <div className="bg-card/95 backdrop-blur px-3 py-2 md:px-6 md:py-3 rounded-lg shadow-lg border border-border/50 flex flex-wrap items-center justify-center gap-2 md:gap-4 max-w-[calc(100vw-16px)]">
            {/* Previous Level Button */}
            <Button
              onClick={() => {
                if (currentLevelIndex > 0) {
                  setSelectedArrow(null);
                  setCameraOffset({ x: 0, z: 0 });
                  setCurrentLevelIndex(i => i - 1);
                  toast.info("Previous Level");
                }
              }}
              variant="ghost"
              size="default"
              className="h-11 w-11 md:h-10 md:w-10 p-0 text-xl md:text-xl font-bold hover:bg-primary/20"
              disabled={currentLevelIndex === 0}
              aria-label="Previous level"
              title="Previous level (P)"
            >
              ←
            </Button>

            {/* Level Info */}
            <div className="flex items-center gap-2 md:gap-3 px-1 md:px-4">
              <span className="text-primary font-bold text-xl md:text-2xl">Level {currentLevel.id}</span>
              <span className="text-muted-foreground text-base md:text-xl">•</span>
              <span className="text-foreground font-medium text-base md:text-lg">Moves: {moves}</span>
              <span className="text-muted-foreground text-base md:text-xl">•</span>
              <div className="flex items-center gap-2">
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-red-300/70 bg-red-600 px-2 py-1 text-sm md:text-xs font-black text-white"
                  title="Red keys collected"
                >
                  <span aria-hidden>🗝</span>
                  <span>{redKeyCount}</span>
                </span>
                <span
                  className="inline-flex items-center gap-1 rounded-md border border-green-300/70 bg-green-600 px-2 py-1 text-sm md:text-xs font-black text-white"
                  title="Green keys collected"
                >
                  <span aria-hidden>🔑</span>
                  <span>{greenKeyCount}</span>
                </span>
              </div>
            </div>

            {/* Restart Button */}
            <Button
              onClick={resetLevel}
              variant="outline"
              size="default"
              disabled={isComplete || localPlayer?.isGliding}
              className="h-11 px-5 text-base font-semibold hover:bg-primary/20"
              title="Restart level (R)"
            >
              Restart
            </Button>

            <HowToPlayDialog disabled={shouldRotateGate} />

            {/* Next Level Button */}
            <Button
              onClick={() => {
                if (currentLevelIndex < allLevels.length - 1) {
                  setSelectedArrow(null);
                  setCameraOffset({ x: 0, z: 0 });
                  setCurrentLevelIndex(i => i + 1);
                  toast.info("Next Level");
                } else {
                  toast.info("No more levels");
                }
              }}
              variant="ghost"
              size="default"
              className="h-11 w-11 md:h-10 md:w-10 p-0 text-xl font-bold hover:bg-primary/20"
              aria-label="Next level"
              title="Next level (N)"
            >
              →
            </Button>

            {/* View Mode Toggle & Reset View (right side) */}
            <div className="ml-2 pl-2 border-l border-border/50 flex items-center gap-2">
              <Button
                onClick={() => {
                  const next = !showCoordsOverlay;
                  setShowCoordsOverlay(next);
                  setShowCoordsOverlayState(next);
                }}
                variant="ghost"
                size="sm"
                className="h-10 px-2 text-xs font-black tracking-wide hover:bg-primary/20"
                title="Toggle coordinate labels (shown in SPR view)"
                aria-pressed={showCoordsOverlay}
              >
                XY
              </Button>

              <Button
                onClick={() => {
                  setCameraZoomIndex((i) => Math.max(0, i - 1));
                }}
                variant="ghost"
                size="sm"
                className="h-10 w-10 p-0 text-lg hover:bg-primary/20"
                title="Zoom out"
                disabled={!canZoomOut}
              >
                -
              </Button>

              <div className="min-w-12 text-center text-sm md:text-xs font-semibold text-muted-foreground">
                {Math.round((1 / cameraZoomFactor) * 100)}%
              </div>

              <Button
                onClick={() => {
                  setCameraZoomIndex((i) => Math.min(CAMERA_ZOOM_LEVELS.length - 1, i + 1));
                }}
                variant="ghost"
                size="sm"
                className="h-10 w-10 p-0 text-lg hover:bg-primary/20"
                title="Zoom in"
                disabled={!canZoomIn}
              >
                +
              </Button>

              <Button
                onClick={() => {
                  setViewMode(nextViewMode);
                  setCameraOffset({ x: 0, z: 0 });
                }}
                variant="ghost"
                size="sm"
                className="h-10 px-3 text-sm md:text-xs font-bold tracking-wide hover:bg-primary/20"
                title={`Switch to ${VIEW_MODE_LABELS[nextViewMode]} view`}
              >
                {VIEW_MODE_LABELS[viewMode]}
              </Button>

              {/* Reset View Button - shows when camera is offset */}
              {(cameraOffset.x !== 0 || cameraOffset.z !== 0) && (
                <Button
                  onClick={() => {
                    setCameraOffset({ x: 0, z: 0 });
                    toast.info("View reset");
                  }}
                  variant="ghost"
                  size="sm"
                  className="h-10 px-2 text-sm md:text-xs hover:bg-primary/20"
                  title="Reset camera view (double-click game area)"
                >
                  ⟲
                </Button>
              )}
            </div>
          </div>
        </div>
        <div
          className="relative z-20 w-full min-h-0 flex-1"
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
            touchAction: viewMode === 'fps' || viewMode === 'sprite' ? 'auto' : 'none',
          }}
        >
          {viewMode === "sprite" ? (
            <GameSprite2D
              grid={renderGrid}
              cavePos={renderCavePos}
              levelImageUrl={currentLevel?.image ?? null}
              playerStart={currentLevel?.playerStart ?? null}
              selectedArrow={selectedArrow}
              selectorPos={isSelectorActive && !selectedArrow ? selectorPos : null}
              players={renderPlayers}
              zoomFactor={cameraZoomFactor}
              showCoords={showCoordsOverlay}
              onArrowClick={(x, y) => {
                if (localPlayer?.isGliding) return;
                const cell = renderGrid[y]?.[x];
                if (cell !== undefined && isArrowCell(cell)) {
                  if (localPlayerPos.x === x && localPlayerPos.y === y) {
                    toast.error("Cannot select arrow while standing on it!");
                    return;
                  }
                  const isSameArrow = selectedArrow?.x === x && selectedArrow?.y === y;
                  if (isSameArrow) {
                    enqueueInput({ type: "deselect" });
                    resetSelectorToPlayer();
                    flashPlayerHighlight();
                    toast.info("Arrow deselected - control returned to player");
                  } else {
                    enqueueInput({ type: "select", x, y });
                    setIsSelectorActive(false);
                    setSelectorPos({ x, y });
                    toast.info("Arrow selected! Use controls to move it remotely.");
                  }
                }
              }}
              onCancelSelection={() => {
                if (selectedArrow) {
                  enqueueInput({ type: "deselect" });
                  resetSelectorToPlayer();
                  toast.info("Arrow deselected");
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
                    toast.error("Cannot select arrow while standing on it!");
                    return;
                  }
                  const isSameArrow = selectedArrow?.x === x && selectedArrow?.y === y;
                  if (isSameArrow) {
                    enqueueInput({ type: "deselect" });
                    resetSelectorToPlayer();
                    flashPlayerHighlight();
                    toast.info("Arrow deselected - control returned to player");
                  } else {
                    enqueueInput({ type: "select", x, y });
                    setIsSelectorActive(false);
                    setSelectorPos({ x, y });
                    toast.info("Arrow selected! Use controls to move it remotely.");
                  }
                }
              }}
              onCancelSelection={() => {
                if (selectedArrow) {
                  enqueueInput({ type: "deselect" });
                  resetSelectorToPlayer();
                  toast.info("Arrow deselected");
                }
              }}
            />
          )}
        </div>
        <div
          className="absolute left-1/2 transform -translate-x-1/2 z-50 md:hidden"
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
        {selectedArrow && (
          <div className="absolute top-1 right-1 z-50 bg-primary/90 backdrop-blur px-2 py-0.5 rounded text-xs font-semibold text-primary-foreground shadow-md">Arrow ({selectedArrow.x},{selectedArrow.y})</div>
        )}
        {isComplete && (
          <div className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none">
            <div className="rounded-2xl border border-white/20 bg-black/75 px-10 py-6 text-center shadow-2xl backdrop-blur-sm">
              <div className="text-4xl font-black tracking-[0.18em] text-white sm:text-5xl">LEVEL COMPLETE!</div>
            </div>
          </div>
        )}
        {isComplete && (
          <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 z-50 flex gap-1 md:bottom-auto md:right-1 md:left-auto md:top-8">
            <Button onClick={prevLevel} disabled={currentLevelIndex === 0} className="h-7 px-2 text-xs bg-card/95 backdrop-blur" variant="outline" size="sm">←</Button>
            <Button onClick={nextLevel} disabled={currentLevelIndex >= allLevels.length - 1} className="h-7 px-2 text-xs bg-card/95 backdrop-blur" variant="outline" size="sm">→</Button>
          </div>
        )}
      </div>
    );
};
