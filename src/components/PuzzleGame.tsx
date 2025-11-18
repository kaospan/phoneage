import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getAllLevels } from "@/data/levels";
import { Game3D } from "./Game3D";
import { TouchControls } from "./TouchControls";
import { Thumbstick } from "./Thumbstick";
import { Box, Grid3x3 } from "lucide-react";
import { CellType, GameState } from "@/game/types";
import { isArrowCell } from "@/game/arrows";
import { attemptPlayerMove, attemptRemoteArrowMove } from "@/game/movement";

export const PuzzleGame = () => {
  const [currentLevelIndex, setCurrentLevelIndex] = useState(0);
  const [grid, setGrid] = useState<CellType[][]>([]);
  const [playerPos, setPlayerPos] = useState({ x: 0, y: 0 });
  const [moves, setMoves] = useState(0);
  const [isComplete, setIsComplete] = useState(false);
  const [viewMode, setViewMode] = useState<"3d" | "2d">("3d");
  const [isGliding, setIsGliding] = useState(false);
  const [baseGrid, setBaseGrid] = useState<CellType[][]>([]); // Track original terrain under arrows
  const [selectedArrow, setSelectedArrow] = useState<{ x: number, y: number } | null>(null); // For remote arrow control
  const [cameraOffset, setCameraOffset] = useState({ x: 0, z: 0 }); // Camera pan offset when arrow selected
  const [breakableRockStates, setBreakableRockStates] = useState<Map<string, boolean>>(new Map()); // Track which breakable rocks have been stepped on
  // Selector navigation state for keyboard-based arrow selection
  const [selectorPos, setSelectorPos] = useState<{ x: number; y: number } | null>(null);
  const [isSelectorActive, setIsSelectorActive] = useState(false);

  const allLevels = getAllLevels();
  const currentLevel = allLevels[currentLevelIndex];

  // Initialize level
  useEffect(() => {
    if (currentLevel) {
      setGrid(currentLevel.grid.map(row => [...row]) as CellType[][]);

      // Create base grid - for arrows, look at surrounding terrain to determine what should be underneath
      const base = currentLevel.grid.map((row, y) =>
        row.map((cell, x) => {
          // If it's an arrow, determine what terrain is underneath by checking surroundings
          if ((cell >= 7 && cell <= 10) || cell === 11 || cell === 12 || cell === 13) {
            // Collect adjacent non-arrow cells
            const adjacentCells: CellType[] = [];
            if (y > 0) adjacentCells.push(currentLevel.grid[y - 1][x] as CellType);
            if (y < currentLevel.grid.length - 1) adjacentCells.push(currentLevel.grid[y + 1][x] as CellType);
            if (x > 0) adjacentCells.push(currentLevel.grid[y][x - 1] as CellType);
            if (x < row.length - 1) adjacentCells.push(currentLevel.grid[y][x + 1] as CellType);

            // Filter to only terrain types (not arrows)
            const terrainTypes = adjacentCells.filter(c =>
              c !== 7 && c !== 8 && c !== 9 && c !== 10 && c !== 11 && c !== 12 && c !== 13
            );

            if (terrainTypes.length > 0) {
              // Count occurrences of each terrain type
              const counts = terrainTypes.reduce((acc, type) => {
                acc[type] = (acc[type] || 0) + 1;
                return acc;
              }, {} as Record<number, number>);

              // Return the most common terrain type
              const mostCommon = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
              return Number(mostCommon) as CellType;
            }
            return 5; // Default to void if no terrain found
          }
          return cell;
        })
      );

      setBaseGrid(base as CellType[][]);
      setPlayerPos(currentLevel.playerStart);
      setMoves(0);
      setIsComplete(false);
      setBreakableRockStates(new Map()); // Reset breakable rock states
    }
  }, [currentLevelIndex]);

  // Check if reached cave
  useEffect(() => {
    if (playerPos.x === currentLevel.cavePos.x && playerPos.y === currentLevel.cavePos.y) {
      setIsComplete(true);
      toast.success(`LEVEL ${currentLevel.id} COMPLETE! MOVES: ${moves}`, {
        duration: 3000,
      });

      // Auto-advance to next level after 2 seconds
      const timer = setTimeout(() => {
        if (currentLevelIndex < allLevels.length - 1) {
          setCurrentLevelIndex(i => i + 1);
        } else {
          toast.success("ALL LEVELS COMPLETE! YOU WIN!", {
            duration: 5000,
          });
        }
      }, 2000);

      return () => clearTimeout(timer);
    }
  }, [playerPos, currentLevel, moves, currentLevelIndex]);

  const moveArrowRemotely = useCallback((dx: number, dy: number) => {
    if (!selectedArrow || isGliding) return;
    const state: GameState = { grid, baseGrid, playerPos, selectedArrow, breakableRockStates, isGliding, isComplete, } as GameState;
    const outcome = attemptRemoteArrowMove(state, dx, dy);
    if (!outcome.glidePath) {
      toast.info("Arrow can't move further");
      setSelectedArrow(null);
      return;
    }
    setIsGliding(true);
    const { path, arrowType } = outcome.glidePath;
    const newGrid = grid.map(r => [...r]);
    let step = 0;
    const animate = () => {
      if (step < path.length) {
        const pos = path[step];
        const prevX = step === 0 ? selectedArrow.x : path[step - 1].x;
        const prevY = step === 0 ? selectedArrow.y : path[step - 1].y;
        if (step === 0) newGrid[selectedArrow.y][selectedArrow.x] = 5; else newGrid[prevY][prevX] = baseGrid[prevY][prevX];
        newGrid[pos.y][pos.x] = arrowType;
        setGrid([...newGrid.map(r => [...r])] as CellType[][]);
        if (step === path.length - 1) {
          setMoves(m => m + 1);
          setIsGliding(false);
          setSelectedArrow(null);
        }
        step++;
        setTimeout(animate, 150);
      }
    };
    animate();
  }, [selectedArrow, isGliding, grid, baseGrid, playerPos, breakableRockStates, isComplete]);

  const movePlayer = useCallback((dx: number, dy: number) => {
    if (isComplete || isGliding) return;
    const state: GameState = { grid, baseGrid, playerPos, selectedArrow, breakableRockStates, isGliding, isComplete } as GameState;
    const outcome = attemptPlayerMove(state, dx, dy);
    if (outcome.glidePath && outcome.startGlide) {
      setIsGliding(true);
      const { path, arrowType } = outcome.glidePath;
      const newGrid = grid.map(r => [...r]);
      let step = 0;
      const animate = () => {
        if (step < path.length) {
          const pos = path[step];
          const prevX = step === 0 ? playerPos.x : path[step - 1].x;
          const prevY = step === 0 ? playerPos.y : path[step - 1].y;
          if (step === 0) newGrid[playerPos.y][playerPos.x] = 5; else newGrid[prevY][prevX] = baseGrid[prevY][prevX];
          newGrid[pos.y][pos.x] = arrowType;
          setGrid([...newGrid.map(r => [...r])] as CellType[][]);
          setPlayerPos({ x: pos.x, y: pos.y });
          if (step === path.length - 1) {
            setMoves(m => m + 1);
            setIsGliding(false);
          }
          step++;
          setTimeout(animate, 150);
        }
      };
      animate();
      return;
    }
    if (outcome.newGrid) setGrid(outcome.newGrid as CellType[][]);
    if (outcome.brokeRock) toast.info("ROCK CRUMBLED!");
    if (outcome.newPlayerPos) setPlayerPos(outcome.newPlayerPos);
    if (outcome.consumedMove) setMoves(m => m + 1);
  }, [grid, baseGrid, playerPos, selectedArrow, breakableRockStates, isComplete, isGliding]);

  // Unified move handler
  const handleMove = useCallback((dx: number, dy: number) => {
    if (selectedArrow) {
      moveArrowRemotely(dx, dy);
    } else {
      movePlayer(dx, dy);
    }
  }, [selectedArrow, moveArrowRemotely, movePlayer]);

  // Keyboard controls (player movement or selector navigation)
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      const key = e.key;
      // Space toggles selector
      if (key === ' ' || key === 'Enter') {
        e.preventDefault();
        if (!isSelectorActive) {
          // Activate selector at player position
          setIsSelectorActive(true);
          setSelectorPos({ x: playerPos.x, y: playerPos.y });
          // Deselect any arrow currently selected
          setSelectedArrow(null);
        } else {
          // Attempt selection
          if (selectorPos) {
            const cell = grid[selectorPos.y]?.[selectorPos.x];
            if (cell !== undefined && ((cell >= 7 && cell <= 10) || cell === 11 || cell === 12 || cell === 13)) {
              // Select arrow and exit selector mode
              setSelectedArrow({ x: selectorPos.x, y: selectorPos.y });
              toast.info("Arrow selected via keyboard selector");
              setIsSelectorActive(false);
              setSelectorPos(null);
            } else {
              // Exit selector mode without selection
              setIsSelectorActive(false);
              setSelectorPos(null);
            }
          } else {
            setIsSelectorActive(false);
          }
        }
        return;
      }
      // If selector active, navigate highlight instead of moving player/arrow
      if (isSelectorActive && selectorPos) {
        let dx = 0, dy = 0;
        switch (key) {
          case 'ArrowUp': case 'w': case 'W': dy = -1; break;
          case 'ArrowDown': case 's': case 'S': dy = 1; break;
          case 'ArrowLeft': case 'a': case 'A': dx = -1; break;
          case 'ArrowRight': case 'd': case 'D': dx = 1; break;
          default: break;
        }
        if (dx !== 0 || dy !== 0) {
          e.preventDefault();
          setSelectorPos(pos => {
            if (!pos) return pos;
            const nx = Math.max(0, Math.min(grid[0].length - 1, pos.x + dx));
            const ny = Math.max(0, Math.min(grid.length - 1, pos.y + dy));
            return { x: nx, y: ny };
          });
        }
        return; // Do not process movement keys for gameplay while selector active
      }
      // Normal gameplay controls
      switch (key) {
        case 'ArrowUp': case 'w': case 'W': e.preventDefault(); handleMove(0, -1); break;
        case 'ArrowDown': case 's': case 'S': e.preventDefault(); handleMove(0, 1); break;
        case 'ArrowLeft': case 'a': case 'A': e.preventDefault(); handleMove(-1, 0); break;
        case 'ArrowRight': case 'd': case 'D': e.preventDefault(); handleMove(1, 0); break;
        case 'r': case 'R': e.preventDefault(); resetLevel(); break;
        case 'n': case 'N': e.preventDefault(); if (currentLevelIndex < allLevels.length - 1) { setCurrentLevelIndex(i => i + 1); toast.info("SKIPPED TO NEXT LEVEL"); } break;
        case 'p': case 'P': e.preventDefault(); if (currentLevelIndex > 0) { setCurrentLevelIndex(i => i - 1); toast.info("PREVIOUS LEVEL"); } break;
      }
    };
    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [handleMove, currentLevelIndex, isSelectorActive, selectorPos, grid, playerPos]);

  const resetLevel = () => {
    setSelectedArrow(null);
    setCameraOffset({ x: 0, z: 0 });
    setGrid(currentLevel.grid.map(row => [...row]) as CellType[][]);
    const base = currentLevel.grid.map((row, y) =>
      row.map((cell, x) => {
        if ((cell >= 7 && cell <= 10) || cell === 11 || cell === 12 || cell === 13) {
          const adjacentCells: CellType[] = [];
          if (y > 0) adjacentCells.push(currentLevel.grid[y - 1][x] as CellType);
          if (y < currentLevel.grid.length - 1) adjacentCells.push(currentLevel.grid[y + 1][x] as CellType);
          if (x > 0) adjacentCells.push(currentLevel.grid[y][x - 1] as CellType);
          if (x < row.length - 1) adjacentCells.push(currentLevel.grid[y][x + 1] as CellType);
          const terrainTypes = adjacentCells.filter(c => c !== 7 && c !== 8 && c !== 9 && c !== 10 && c !== 11 && c !== 12 && c !== 13);
          if (terrainTypes.length > 0) return terrainTypes[0];
          return 5;
        }
        return cell;
      })
    );
    setBaseGrid(base as CellType[][]);
    setPlayerPos(currentLevel.playerStart);
    setMoves(0);
    setIsComplete(false);
    setBreakableRockStates(new Map());
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

  return (
    <div className="w-full h-screen flex flex-col overflow-hidden bg-gradient-to-br from-amber-50 to-orange-100 relative">
      {isSelectorActive && (
        <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] pointer-events-none z-10 transition-opacity" />
      )}
      <TouchControls onMove={handleMove} disabled={isComplete} />
      <Thumbstick onMove={handleMove} disabled={isComplete} />
      <div className="absolute top-1 left-1 right-1 z-50 flex items-center gap-1">
        <div className="bg-card/95 backdrop-blur px-2 py-0.5 rounded text-xs font-medium shadow-md">
          <span className="text-primary font-bold">L{currentLevel.id}</span>
          <span className="text-muted-foreground mx-1">•</span>
          <span className="text-foreground">M{moves}</span>
        </div>
        <Button onClick={() => { const newMode = viewMode === "3d" ? "2d" : "3d"; setViewMode(newMode); setCameraOffset({ x: 0, z: 0 }); }} variant="ghost" size="sm" className="h-6 w-6 p-0 bg-card/95 backdrop-blur">
          {viewMode === "3d" ? <Grid3x3 className="h-3 w-3" /> : <Box className="h-3 w-3" />}
        </Button>
        <Button onClick={resetLevel} variant="ghost" size="sm" disabled={isComplete || isGliding} className="h-6 px-2 text-xs bg-card/95 backdrop-blur">R</Button>
        <div className="ml-auto flex items-center gap-1">
          <Button onClick={() => { if (currentLevelIndex > 0) { setSelectedArrow(null); setCameraOffset({ x: 0, z: 0 }); setCurrentLevelIndex(i => i - 1); toast.info("Preview: Previous level"); } }} variant="ghost" size="sm" className="h-6 px-2 text-xs bg-card/95 backdrop-blur" disabled={currentLevelIndex === 0} aria-label="Previous level" title="Previous level (P)">←</Button>
          <Button onClick={() => { if (currentLevelIndex < allLevels.length - 1) { setSelectedArrow(null); setCameraOffset({ x: 0, z: 0 }); setCurrentLevelIndex(i => i + 1); toast.info("Preview: Next level"); } else { toast.info("No more levels"); } }} variant="ghost" size="sm" className="h-6 px-2 text-xs bg-card/95 backdrop-blur" aria-label="Next level" title="Next level (N)">→</Button>
        </div>
      </div>
      <div className="w-full flex-1 relative my-2 z-20">
        <Game3D
          grid={grid}
          playerPos={playerPos}
          cavePos={currentLevel.cavePos}
          selectedArrow={selectedArrow}
          selectorPos={isSelectorActive ? selectorPos : null}
          cameraOffset={cameraOffset}
          viewMode={viewMode}
          onArrowClick={(x, y) => {
            if (isGliding) return;
            const cell = grid[y][x];
            if ((cell >= 7 && cell <= 10) || cell === 11 || cell === 12 || cell === 13) {
              if (playerPos.x === x && playerPos.y === y) { toast.error("Cannot select arrow while standing on it!"); return; }
              const isSameArrow = selectedArrow?.x === x && selectedArrow?.y === y;
              setSelectedArrow(isSameArrow ? null : { x, y });
              toast.info(isSameArrow ? "Arrow deselected" : "Arrow selected! Use controls to move it remotely.");
            }
          }}
          onCancelSelection={() => { if (selectedArrow) { setSelectedArrow(null); toast.info("Arrow deselected"); } }}
        />
      </div>
      <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 z-50 md:hidden">
        <div className="bg-card/95 backdrop-blur border border-border/50 px-2 py-1 rounded shadow-md">
          <div className="grid grid-cols-4 gap-1">
            <Button onClick={() => selectedArrow ? moveArrowRemotely(0, -1) : handleMove(0, -1)} className="h-8 w-8 p-0 text-xs" variant="secondary" size="sm">↑</Button>
            <Button onClick={() => selectedArrow ? moveArrowRemotely(0, 1) : handleMove(0, 1)} className="h-8 w-8 p-0 text-xs" variant="secondary" size="sm">↓</Button>
            <Button onClick={() => selectedArrow ? moveArrowRemotely(-1, 0) : handleMove(-1, 0)} className="h-8 w-8 p-0 text-xs" variant="secondary" size="sm">←</Button>
            <Button onClick={() => selectedArrow ? moveArrowRemotely(1, 0) : handleMove(1, 0)} className="h-8 w-8 p-0 text-xs" variant="secondary" size="sm">→</Button>
          </div>
        </div>
      </div>
      {selectedArrow && (
        <div className="absolute top-1 right-1 z-50 bg-primary/90 backdrop-blur px-2 py-0.5 rounded text-xs font-semibold text-primary-foreground shadow-md">Arrow ({selectedArrow.x},{selectedArrow.y})</div>
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
