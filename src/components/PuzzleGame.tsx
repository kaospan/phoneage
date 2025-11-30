import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getAllLevels, themes } from "@/data/levels";
import { Game3D } from "./Game3D";
import { TouchControls } from "./TouchControls";
import { Thumbstick } from "./Thumbstick";
import { Box, Grid3x3 } from "lucide-react";
import { CellType, GameState } from "@/game/types";
import { isArrowCell } from "@/game/arrows";
import { attemptPlayerMove, attemptRemoteArrowMove } from "@/game/movement";

console.log('📦 PuzzleGame.tsx loading...');

export const PuzzleGame = () => {
  console.log('⚛️ PuzzleGame component rendering...');

  try {
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

    // Dragging state for panning the view
    const [isDragging, setIsDragging] = useState(false);
    const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
    const [dragOffsetStart, setDragOffsetStart] = useState({ x: 0, z: 0 });

    // Flashing state for arrow deselection feedback
    const [isFlashing, setIsFlashing] = useState(false);

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

    // Helper function to check if an arrow can move in any direction
    const canArrowMove = useCallback((arrowPos: { x: number; y: number }) => {
      const arrowCell = grid[arrowPos.y]?.[arrowPos.x];
      if (!arrowCell || !((arrowCell >= 7 && arrowCell <= 10) || arrowCell === 11 || arrowCell === 12 || arrowCell === 13)) {
        return false;
      }
      const state: GameState = { grid, baseGrid, playerPos, selectedArrow: arrowPos, breakableRockStates, isGliding, isComplete } as GameState;
      
      // Try all four directions
      const directions = [
        { dx: 0, dy: -1 },  // up
        { dx: 0, dy: 1 },   // down
        { dx: -1, dy: 0 },  // left
        { dx: 1, dy: 0 }    // right
      ];
      
      for (const dir of directions) {
        const outcome = attemptRemoteArrowMove(state, dir.dx, dir.dy);
        if (outcome.glidePath) {
          return true; // Can move in at least one direction
        }
      }
      return false; // Cannot move in any direction
    }, [grid, baseGrid, playerPos, breakableRockStates, isGliding, isComplete]);

    const moveArrowRemotely = useCallback((dx: number, dy: number) => {
      if (!selectedArrow || isGliding) return;
      const state: GameState = { grid, baseGrid, playerPos, selectedArrow, breakableRockStates, isGliding, isComplete, } as GameState;
      const outcome = attemptRemoteArrowMove(state, dx, dy);
      if (!outcome.glidePath) {
        toast.info("Arrow can't move further");
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
            const newArrowPos = { x: pos.x, y: pos.y };
            
            // Check if arrow can still move in any direction
            setTimeout(() => {
              const finalGrid = [...newGrid.map(r => [...r])] as CellType[][];
              const arrowCell = finalGrid[newArrowPos.y][newArrowPos.x];
              const testState: GameState = { 
                grid: finalGrid, 
                baseGrid, 
                playerPos, 
                selectedArrow: newArrowPos, 
                breakableRockStates, 
                isGliding: false, 
                isComplete 
              } as GameState;
              
              const directions = [
                { dx: 0, dy: -1 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }, { dx: 1, dy: 0 }
              ];
              
              let canMove = false;
              for (const dir of directions) {
                const testOutcome = attemptRemoteArrowMove(testState, dir.dx, dir.dy);
                if (testOutcome.glidePath) {
                  canMove = true;
                  break;
                }
              }
              
              if (canMove) {
                // Keep arrow selected
                setSelectedArrow(newArrowPos);
              } else {
                // Arrow is blocked, return control to player
                setSelectedArrow(null);
                toast.info("Arrow blocked - control returned to player");
              }
            }, 50); // Small delay to ensure grid is updated
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
        // Space/Enter: deselect arrow (with flash) OR toggle selector
        if (key === ' ' || key === 'Enter') {
          e.preventDefault();
          // If arrow is selected, deselect it with flash effect
          if (selectedArrow && !isSelectorActive) {
            setIsFlashing(true);
            setTimeout(() => {
              setIsFlashing(false);
              setSelectedArrow(null);
              toast.info("Arrow deselected");
            }, 500); // Flash for 500ms before deselecting
            return;
          }
          // Otherwise, handle selector mode
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

    // Drag handlers for panning the view
    const handleMouseDown = (e: React.MouseEvent) => {
      // Only start dragging with left mouse button and not on UI elements
      if (e.button === 0 && e.target === e.currentTarget) {
        setIsDragging(true);
        setDragStart({ x: e.clientX, y: e.clientY });
        setDragOffsetStart({ x: cameraOffset.x, z: cameraOffset.z });
      }
    };

    const handleMouseMove = (e: React.MouseEvent) => {
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
      if (e.touches.length === 1 && e.target === e.currentTarget) {
        const touch = e.touches[0];
        setIsDragging(true);
        setDragStart({ x: touch.clientX, y: touch.clientY });
        setDragOffsetStart({ x: cameraOffset.x, z: cameraOffset.z });
      }
    };

    const handleTouchMove = (e: React.TouchEvent) => {
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
      setCameraOffset({ x: 0, z: 0 });
      toast.info("View reset");
    };

    return (
      <div className={`w-full h-screen flex flex-col overflow-hidden bg-gradient-to-br ${currentLevel.theme ? themes[currentLevel.theme].background : 'from-amber-50 to-orange-100'} relative`}>
        {isSelectorActive && (
          <div className="absolute inset-0 bg-black/40 backdrop-blur-[1px] pointer-events-none z-10 transition-opacity" />
        )}
        <TouchControls onMove={handleMove} disabled={isComplete} />
        <Thumbstick onMove={handleMove} disabled={isComplete} />
        <div className="absolute top-2 left-0 right-0 z-50 flex justify-center">
          <div className="bg-card/95 backdrop-blur px-6 py-3 rounded-lg shadow-lg border border-border/50 flex items-center gap-4">
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
              className="h-10 w-10 p-0 text-xl font-bold hover:bg-primary/20"
              disabled={currentLevelIndex === 0}
              aria-label="Previous level"
              title="Previous level (P)"
            >
              ←
            </Button>

            {/* Level Info */}
            <div className="flex items-center gap-3 px-4">
              <span className="text-primary font-bold text-2xl">Level {currentLevel.id}</span>
              <span className="text-muted-foreground text-xl">•</span>
              <span className="text-foreground font-medium text-lg">Moves: {moves}</span>
            </div>

            {/* Restart Button */}
            <Button
              onClick={resetLevel}
              variant="outline"
              size="default"
              disabled={isComplete || isGliding}
              className="h-10 px-4 text-base font-semibold hover:bg-primary/20"
              title="Restart level (R)"
            >
              Restart
            </Button>

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
              className="h-10 w-10 p-0 text-xl font-bold hover:bg-primary/20"
              aria-label="Next level"
              title="Next level (N)"
            >
              →
            </Button>

            {/* View Mode Toggle & Reset View (right side) */}
            <div className="ml-2 pl-2 border-l border-border/50 flex items-center gap-2">
              <Button
                onClick={() => {
                  const newMode = viewMode === "3d" ? "2d" : "3d";
                  setViewMode(newMode);
                  setCameraOffset({ x: 0, z: 0 });
                }}
                variant="ghost"
                size="default"
                className="h-10 w-10 p-0 hover:bg-primary/20"
                title={`Switch to ${viewMode === "3d" ? "2D" : "3D"} view`}
              >
                {viewMode === "3d" ? <Grid3x3 className="h-5 w-5" /> : <Box className="h-5 w-5" />}
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
                  className="h-8 px-2 text-xs hover:bg-primary/20"
                  title="Reset camera view (double-click game area)"
                >
                  ⟲
                </Button>
              )}
            </div>
          </div>
        </div>
        <div
          className="w-full flex-1 relative my-2 z-20"
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
          onTouchStart={handleTouchStart}
          onTouchMove={handleTouchMove}
          onTouchEnd={handleTouchEnd}
          onDoubleClick={handleDoubleClick}
          style={{ cursor: isDragging ? 'grabbing' : 'grab' }}
        >
          <Game3D
            grid={grid}
            playerPos={playerPos}
            cavePos={currentLevel.cavePos}
            selectedArrow={selectedArrow}
            selectorPos={isSelectorActive ? selectorPos : null}
            cameraOffset={cameraOffset}
            viewMode={viewMode}
            theme={currentLevel.theme}
            onArrowClick={(x, y) => {
              if (isGliding || isFlashing) return; // Prevent clicks during gliding or flashing
              const cell = grid[y][x];
              if ((cell >= 7 && cell <= 10) || cell === 11 || cell === 12 || cell === 13) {
                if (playerPos.x === x && playerPos.y === y) { toast.error("Cannot select arrow while standing on it!"); return; }
                const isSameArrow = selectedArrow?.x === x && selectedArrow?.y === y;
                if (isSameArrow) {
                  // Flash before deselecting
                  setIsFlashing(true);
                  setTimeout(() => {
                    setIsFlashing(false);
                    setSelectedArrow(null);
                    toast.info("Arrow deselected");
                  }, 500);
                } else {
                  // Select new arrow
                  setSelectedArrow({ x, y });
                  toast.info("Arrow selected! Use controls to move it remotely.");
                }
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
  } catch (error) {
    console.error('❌ Error in PuzzleGame component:', error);
    return (
      <div style={{ padding: '20px', color: 'red' }}>
        <h2>Game Failed to Load</h2>
        <p>{(error as Error).message}</p>
        <button onClick={() => window.location.reload()}>Reload</button>
      </div>
    );
  }
};