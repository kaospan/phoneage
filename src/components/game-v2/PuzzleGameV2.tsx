import { useRef, useState, useEffect, useMemo, useCallback } from "react";
import { useGameEngine } from "./hooks/useGameEngine";
import { useGameControls } from "./hooks/useGameControls";
import { useCameraGestures } from "./hooks/useCameraGestures";
import { useGameTimerSession } from "./hooks/useGameTimerSession";
import { GameOverlays } from "./shell/GameOverlays";
import { GameHudTop } from "./shell/GameHudTop";
import { getAllLevels } from "@/data/levels";
import { loadCampaignProgress } from "@/lib/campaignProgress";
import { useIsMobile } from "@/hooks/use-mobile";
import { startPlaySession } from "@/lib/playSessions";
import { usePlayerSession } from "@/contexts/PlayerSessionContext";

export const PuzzleGameV2 = () => {
  const isMobile = useIsMobile();
  const [isPortrait, setIsPortrait] = useState(false);
  const [viewMode] = useState<"3d" | "fps" | "2d" | "sprite" | "top">("3d");
  const isMobilePortrait = isMobile && isPortrait;

  const playerSession = usePlayerSession();
  const playerUserId = playerSession?.user?.id ?? null;

  const [allLevels] = useState(() => getAllLevels());
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const allLevelsLength = allLevels.length;
  const currentLevel = allLevels[currentLevelIndex] || null;
  const orderedLevelIds = useMemo(() => allLevels.map((l) => l.id), [allLevels]);

  const campaignProgressRef = useRef(loadCampaignProgress());
  const recordMovesEnabledRef = useRef(false);
  const isReplayingRef = useRef(false);

  // --- Session & Timer Hook ---
  const session = useGameTimerSession({
    currentLevel,
    playerUserId,
    isComplete: false,
    isBuilding: false,
    isReplaying: false,
    onPushHudMessage: (msg) => console.log("HUD:", msg),
  });

  const isWaitingToStart = Boolean(session.levelTimeLimitSeconds) && !session.isTimerArmed && !session.isTimeUp;

  // --- Engine Hook ---
  const engine = useGameEngine({
    currentLevel,
    currentLevelIndex,
    allLevels,
    orderedLevelIds,
    timerEnabledRef: session.timerEnabledRef,
    timerRemainingMsRef: session.timerRemainingMsRef,
    recordMovesEnabledRef,
    isReplayingRef,
    campaignProgressRef,
    onAddLevelTimeSeconds: session.addLevelTimeSeconds,
    onClosePlaySession: session.closeCurrentPlaySession,
    onCommitCampaignProgress: (next) => { campaignProgressRef.current = next; },
    onPushHudMessage: (msg) => console.log("HUD:", msg),
  });

  // --- Controls Hook ---
  const localPlayer = useMemo(
    () => engine.renderPlayers.find((p) => p.isLocal) ?? engine.renderPlayers[0],
    [engine.renderPlayers]
  );
  const localPlayerPos = localPlayer?.pos ?? { x: 0, y: 0 };

  const handleStartPlaySession = useCallback(async (levelId: number) => {
    if (!playerUserId) return null;
    session.sessionStartInFlightRef.current = true;
    session.resetSessionActiveTime();
    const sessionId = await startPlaySession(playerUserId, levelId);
    session.sessionStartInFlightRef.current = false;
    session.currentPlaySessionIdRef.current = sessionId;
    return sessionId;
  }, [playerUserId, session]);

  const controls = useGameControls({
    localPlayerPos,
    selectedArrow: engine.selectedArrow,
    renderGrid: engine.renderGrid,
    viewMode,
    isMobilePortrait,
    isBuilding: false,
    isComplete: engine.isComplete,
    isTimeUp: session.isTimeUp,
    isWaitingToStart,
    shouldRotateGate: false,
    isReplaying: false,
    isTutorialActive: false,
    resetLevel: () => currentLevel && engine.reset(currentLevel),
    goToLevelIndex: (idx) => {
      if (idx >= 0 && idx < allLevels.length) {
        setCurrentLevelIndex(idx);
        return true;
      }
      return false;
    },
    currentLevelIndex,
    allLevelsLength,
    pushHudMessage: (msg) => console.log("HUD:", msg),
    toggleKeyboardSelection: () => {},
    moveKeyboardSelector: () => {},
    startGameFromTitle: () => session.setHasStartedGame(true),
    startLevelWhenReady: () => session.setIsTimerArmed(true),
  });

  // --- Camera & Gestures Hook ---
  const camera = useCameraGestures({
    renderGrid: engine.renderGrid,
    viewMode,
    isMobilePortrait,
    isMobile,
    onPushHudMessage: (msg) => console.log("HUD:", msg),
  });

  useEffect(() => {
    if (currentLevel) {
      engine.reset(currentLevel);
      session.resetLevelTimer(currentLevel.timeLimitSeconds);
      if (playerUserId) void handleStartPlaySession(currentLevel.id);
    }
  }, [currentLevel, playerUserId, engine.reset, session.resetLevelTimer, handleStartPlaySession]);

  const timeLeftText = session.timeLeftSeconds !== null 
    ? `${Math.floor(session.timeLeftSeconds / 60)}:${String(session.timeLeftSeconds % 60).padStart(2, '0')}` 
    : null;

  return (
    <div className="flex h-[100svh] w-full flex-col bg-stone-900 text-stone-50 overflow-hidden relative">
      {/* Top HUD Component */}
      <GameHudTop
        currentLevelId={currentLevel?.id ?? 1}
        moves={engine.moves}
        timeLeftText={timeLeftText}
        isTimerUrgent={Boolean(session.timeLeftSeconds !== null && session.timeLeftSeconds <= 10)}
        redKeyCount={localPlayer?.keys.red ?? 0}
        greenKeyCount={localPlayer?.keys.green ?? 0}
        isWaitingToStart={isWaitingToStart}
        onPrevLevel={() => currentLevelIndex > 0 && setCurrentLevelIndex(i => i - 1)}
        onNextLevel={() => currentLevelIndex < allLevels.length - 1 && setCurrentLevelIndex(i => i + 1)}
        onStartLevel={() => session.setIsTimerArmed(true)}
      />

      {/* Gesture Board Viewport */}
      <div
        ref={camera.gestureSurfaceRef}
        {...camera.handlers}
        className="flex-1 w-full h-full cursor-grab active:cursor-grabbing bg-black/40 flex items-center justify-center relative"
      >
        <div className="text-center pointer-events-none space-y-1">
          <p className="text-stone-300 font-bold tracking-wide text-lg">Game V2 Shell Operational</p>
          <p className="text-stone-400 text-xs">Grid dimensions: {engine.renderGrid[0]?.length ?? 0} x {engine.renderGrid.length}</p>
          <p className="text-stone-500 text-xs">Active direction handler ready: {typeof controls.queueMove === 'function' ? 'Yes' : 'No'}</p>
        </div>
      </div>

      {/* Victory / Defeat Overlays */}
      <GameOverlays
        isTimeUp={session.isTimeUp}
        isComplete={engine.isComplete}
        completionSummary={engine.completionSummary}
        moves={engine.moves}
        currentLevelId={currentLevel?.id ?? 1}
        onResetLevel={() => currentLevel && engine.reset(currentLevel)}
        onNextLevel={() => currentLevelIndex < allLevels.length - 1 && setCurrentLevelIndex(i => i + 1)}
      />
    </div>
  );
};
