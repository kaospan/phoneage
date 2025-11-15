import { useState, useEffect, useCallback } from "react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { levels as allLevels } from "@/data/levels";
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

  // Keyboard controls
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      switch (e.key) {
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
  }, [handleMove, currentLevelIndex]);

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
      <div className="w-full flex-1 relative my-2">
        <Game3D
          grid={grid}
          playerPos={playerPos}
          cavePos={currentLevel.cavePos}
          selectedArrow={selectedArrow}
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

  const arrowCell = grid[selectedArrow.y][selectedArrow.x];
  if (arrowCell < 7 || (arrowCell > 10 && arrowCell !== 11 && arrowCell !== 12 && arrowCell !== 13)) {
    setSelectedArrow(null);
    return;
  }

  // Check if direction is valid for this arrow
  const isValidDirection = (() => {
  }
      }

    // newX/newY already computed above

    // Animate remote arrow movement
    if (path.length > 0) {
  const newGrid = grid.map(row => [...row]);
  const arrowType = arrowCell;

  let step = 0;
  const animateStep = () => {
    if (step < path.length) {
      const pos = path[step];
      const prevX = step === 0 ? selectedArrow.x : path[step - 1].x;
      const prevY = step === 0 ? selectedArrow.y : path[step - 1].y;

      if (step === 0) {
        newGrid[selectedArrow.y][selectedArrow.x] = 5; // Always leave void when arrow glides remotely
      } else {
        newGrid[prevY][prevX] = baseGrid[prevY][prevX];
      }
      newGrid[pos.y][pos.x] = arrowType;
      setGrid([...newGrid.map(row => [...row])] as CellType[][]);

      if (step === path.length - 1) {
        setMoves(m => m + 1);
        setIsGliding(false);
        setSelectedArrow(null);
      }

      step++;
      setTimeout(animateStep, 150); // 150ms per tile for slower, smoother animation
    }
  };

  animateStep();
} else {
  setIsGliding(false);
  setSelectedArrow(null);
  toast.info("Arrow can't move further");
}
  }, [selectedArrow, grid, isGliding, baseGrid]);

const movePlayer = useCallback((dx: number, dy: number) => {
  if (isComplete || isGliding) return;

  // Check if player is currently on an arrow block
  const playerCell = grid[playerPos.y][playerPos.x];
  const isArrowBlock = (cell: number) => cell >= 7 && cell <= 10 || cell === 11 || cell === 12 || cell === 13;

  if (isArrowBlock(playerCell)) {
    // Get arrow direction(s)
    let arrowDirections: { dx: number, dy: number }[] = [];
    if (playerCell === 7) arrowDirections = [{ dx: 0, dy: -1 }]; // up
    else if (playerCell === 8) arrowDirections = [{ dx: 1, dy: 0 }]; // right
    else if (playerCell === 9) arrowDirections = [{ dx: 0, dy: 1 }]; // down
    else if (playerCell === 10) arrowDirections = [{ dx: -1, dy: 0 }]; // left
    else if (playerCell === 11) arrowDirections = [{ dx: 0, dy: -1 }, { dx: 0, dy: 1 }]; // up-down
    else if (playerCell === 12) arrowDirections = [{ dx: -1, dy: 0 }, { dx: 1, dy: 0 }]; // left-right
    else if (playerCell === 13) arrowDirections = [{ dx: 0, dy: -1 }, { dx: 1, dy: 0 }, { dx: 0, dy: 1 }, { dx: -1, dy: 0 }]; // all directions

    // Special case: allow walking onto adjacent floor or cave even in arrow direction
    const targetCell = grid[newY][newX];
    if (targetCell === 0 || targetCell === 3) {
      setPlayerPos({ x: newX, y: newY });
      setMoves(m => m + 1);
      return;
    }

    // If moving in the arrow's direction, glide; otherwise, treat as walkable floor
    const isArrowDirection = arrowDirections.some(dir => dx === dir.dx && dy === dir.dy);
    if (isArrowDirection) {
      // Arrow block GLIDES carrying the player with animation
      setIsGliding(true);
      const path: { x: number, y: number }[] = [];
      let arrowX = playerPos.x;
      let arrowY = playerPos.y;
      const arrowType = playerCell;
      // Calculate the glide path
      while (true) {
        const nextX = arrowX + dx;
        const nextY = arrowY + dy;
        // Check bounds - stop at edge (don't move past it)
        if (nextY < 0 || nextY >= grid.length || nextX < 0 || nextX >= grid[0].length) {
          break;
        }
        const targetCell = grid[nextY][nextX];
        // Stop BEFORE hitting solid obstacles (stones, breakable rocks, land, cave, floor, wall)
        if (
          targetCell === 2 || // stone
          targetCell === 6 || // breakable rock
          targetCell === 0 || // floor
          targetCell === 3 || // cave
          targetCell === 1 // wall/fire
        ) {
          break;
        }
        // Glide over water (4) and void (5) - void cannot be walked on but arrows can glide over it
        if (targetCell === 4 || targetCell === 5) {
          arrowX = nextX;
          arrowY = nextY;
          path.push({ x: nextX, y: nextY });
          continue; // Keep gliding
        }
        // If next cell is an arrow block, stop BEFORE it (do not glide onto it)
        if (isArrowBlock(targetCell)) {
          break;
        }
        // Any other cell type - stop before it
        break;
      }
      // Animate the glide with smoother updates
      if (path.length > 0) {
        const newGrid = grid.map(row => [...row]);
        let step = 0;
        const animateStep = () => {
          if (step < path.length) {
            const pos = path[step];
            const prevX = step === 0 ? playerPos.x : path[step - 1].x;
            const prevY = step === 0 ? playerPos.y : path[step - 1].y;
            // Update grid progressively - reveal terrain as arrow moves
            if (step === 0) {
              newGrid[playerPos.y][playerPos.x] = 5; // Always leave void when arrow glides
            } else {
              newGrid[prevY][prevX] = baseGrid[prevY][prevX];
            }
            newGrid[pos.y][pos.x] = arrowType;
            setGrid([...newGrid.map(row => [...row])] as CellType[][]);
            setPlayerPos({ x: pos.x, y: pos.y });
            // Mark complete at end
            if (step === path.length - 1) {
              setMoves(m => m + 1);
              setIsGliding(false);
              // After gliding ends, player can walk off arrow block in any direction onto walkable land or another arrow block
              // Movement handler will allow this on next input
            }
            step++;
            setTimeout(animateStep, 150); // 150ms per tile for slower, smoother animation
          }
        };
        animateStep();
      } else {
        setIsGliding(false);
      }
      return;
    } else {
      // Always allow walking off arrow block onto walkable land or another arrow block
      const newX = playerPos.x + dx;
      const newY = playerPos.y + dy;
      // Check bounds
      if (newY < 0 || newY >= grid.length || newX < 0 || newX >= grid[0].length) {
        return;
      }
      const targetCell = grid[newY][newX];
      // Can't move into stones (stationary)
      if (targetCell === 2) {
        return;
      }
      // Allow walking onto any adjacent arrow block (including same type)
      if (isArrowBlock(targetCell)) {
        setPlayerPos({ x: newX, y: newY });
        setMoves(m => m + 1);
        return;
      }
      // Step off arrow to land (floor or cave)
      if (targetCell === 0 || targetCell === 3) {
        setPlayerPos({ x: newX, y: newY });
        setMoves(m => m + 1);
        return;
      }
      // Allow walking onto breakable rock (becomes floor when stepped on)
      if (targetCell === 6) {
        const rockKey = `${newX},${newY}`;
        const hasBeenSteppedOn = breakableRockStates.get(rockKey) || false;
        if (!hasBeenSteppedOn) {
          // First time stepping on - mark it and move
          setBreakableRockStates(prev => new Map(prev).set(rockKey, true));
          setPlayerPos({ x: newX, y: newY });
          setMoves(m => m + 1);
          return;
        } else {
          // Already stepped on - can't step on again (it would break)
          return;
        }
      }
      // Fire/lava (type 1) and water (type 4) cannot be walked upon - they are impassable obstacles
      // Void (type 5) can never be walked onto
      if (targetCell === 1 || targetCell === 4 || targetCell === 5) {
        return;
      }
    }
  }

  // Normal movement (not on arrow)
  const newX = playerPos.x + dx;
  const newY = playerPos.y + dy;

  // Check bounds - cannot walk off the edge of the map (void around edges)
  if (newY < 0 || newY >= grid.length || newX < 0 || newX >= grid[0].length) {
    // Blocked by map boundary (void) - cannot move
    return;
  }

  const targetCell = grid[newY][newX];
  const currentCell = grid[playerPos.y][playerPos.x];

  // Check if leaving a breakable rock - it should break when we step off
  let willBreakRock = false;
  if (currentCell === 6) {
    const rockKey = `${playerPos.x},${playerPos.y}`;
    const hasBeenSteppedOn = breakableRockStates.get(rockKey);
    // Break the rock when stepping off, regardless of target cell
    if (hasBeenSteppedOn && (newX !== playerPos.x || newY !== playerPos.y)) {
      willBreakRock = true;
    }
  }

  // Stones (type 2) are stationary obstacles - cannot be pushed or moved
  if (targetCell === 2) {
    // Cannot move into stones - they are solid obstacles
    return;
  }

  // Breakable rock - mark as stepped on when entering
  if (targetCell === 6) {
    const rockKey = `${newX},${newY}`;
    const hasBeenSteppedOn = breakableRockStates.get(rockKey) || false;

    if (!hasBeenSteppedOn) {
      // First time stepping on - mark it and move
      setBreakableRockStates(prev => new Map(prev).set(rockKey, true));
      setPlayerPos({ x: newX, y: newY });
      setMoves(m => m + 1);
      return;
    } else {
      // Already stepped on - can't step on again (it would break)
      return;
    }
  }

  // Fire/lava (type 1), water (type 4), and void (type 5) cannot be walked upon - they are impassable obstacles
  // But arrows CAN glide over them
  if (targetCell === 1 || targetCell === 4 || targetCell === 5) {
    // Cannot move into fire/lava, water, or void - they are obstacles
    return;
  }

  // Normal movement to floor, cave, or arrow blocks
  // Break rock if we're leaving one
  if (willBreakRock) {
    const newGrid = grid.map(row => [...row]);
    const rockKey = `${playerPos.x},${playerPos.y}`;
    newGrid[playerPos.y][playerPos.x] = 5; // Becomes void
    setGrid(newGrid as CellType[][]);
    setBreakableRockStates(prev => {
      const newMap = new Map(prev);
      newMap.delete(rockKey);
      return newMap;
    });
    toast.info("ROCK CRUMBLED!");
  }

  setPlayerPos({ x: newX, y: newY });
  setMoves(m => m + 1);
}, [playerPos, grid, isComplete, isGliding, breakableRockStates, baseGrid]);

// Unified move handler that routes to player or arrow movement
const handleMove = useCallback((dx: number, dy: number) => {
  if (selectedArrow) {
    moveArrowRemotely(dx, dy);
  } else {
    movePlayer(dx, dy);
  }
}, [selectedArrow, moveArrowRemotely, movePlayer]);

// Keyboard controls (after handleMove declaration)
useEffect(() => {
  const handleKeyPress = (e: KeyboardEvent) => {
    switch (e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        e.preventDefault();
        handleMove(0, -1);
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        e.preventDefault();
        handleMove(0, 1);
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        e.preventDefault();
        handleMove(-1, 0);
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        e.preventDefault();
        handleMove(1, 0);
        break;
      case 'r':
      case 'R':
        e.preventDefault();
        resetLevel();
        break;
      case 'n':
      case 'N':
        e.preventDefault();
        if (currentLevelIndex < allLevels.length - 1) {
          setCurrentLevelIndex(i => i + 1);
          toast.info("SKIPPED TO NEXT LEVEL");
        }
        break;
      case 'p':
      case 'P':
        e.preventDefault();
        if (currentLevelIndex > 0) {
          setCurrentLevelIndex(i => i - 1);
          toast.info("PREVIOUS LEVEL");
        }
        break;
    }
  };
  window.addEventListener('keydown', handleKeyPress);
  return () => window.removeEventListener('keydown', handleKeyPress);
}, [handleMove, currentLevelIndex]);

const resetLevel = () => {
  setSelectedArrow(null);
  setCameraOffset({ x: 0, z: 0 });
  setGrid(currentLevel.grid.map(row => [...row]) as CellType[][]);

  // Recreate base grid with terrain under arrows
  const base = currentLevel.grid.map((row, y) =>
    row.map((cell, x) => {
      if ((cell >= 7 && cell <= 10) || cell === 11 || cell === 12 || cell === 13) {
        const adjacentCells: CellType[] = [];
        if (y > 0) adjacentCells.push(currentLevel.grid[y - 1][x] as CellType);
        if (y < currentLevel.grid.length - 1) adjacentCells.push(currentLevel.grid[y + 1][x] as CellType);
        if (x > 0) adjacentCells.push(currentLevel.grid[y][x - 1] as CellType);
        if (x < row.length - 1) adjacentCells.push(currentLevel.grid[y][x + 1] as CellType);

        const terrainTypes = adjacentCells.filter(c => c !== 7 && c !== 8 && c !== 9 && c !== 10 && c !== 11 && c !== 12 && c !== 13);
        if (terrainTypes.length > 0) {
          return terrainTypes[0];
        }
        return 5;
      }
      return cell;
    })
  );

  setBaseGrid(base as CellType[][]);
  setPlayerPos(currentLevel.playerStart);
  setMoves(0);
  setIsComplete(false);
  setBreakableRockStates(new Map()); // Reset breakable rock states
  toast.info("LEVEL RESET");
};

const nextLevel = () => {
  if (currentLevelIndex < allLevels.length - 1) {
    setCurrentLevelIndex(i => i + 1);
  } else {
    toast.success("ALL LEVELS COMPLETE!");
  }
};

const prevLevel = () => {
  if (currentLevelIndex > 0) {
    setCurrentLevelIndex(i => i - 1);
  }
};

// (moved handleMove above keyboard listener)

return (
  <div className="w-full h-screen flex flex-col overflow-hidden bg-gradient-to-br from-amber-50 to-orange-100 relative">
    <TouchControls onMove={handleMove} disabled={isComplete} />
    <Thumbstick onMove={handleMove} disabled={isComplete} />

    {/* Minimal Header Bar - Ultra compact overlay */}
    <div className="absolute top-1 left-1 right-1 z-50 flex items-center gap-1">
      <div className="bg-card/95 backdrop-blur px-2 py-0.5 rounded text-xs font-medium shadow-md">
        <span className="text-primary font-bold">L{currentLevel.id}</span>
        <span className="text-muted-foreground mx-1">•</span>
        <span className="text-foreground">M{moves}</span>
      </div>
      <Button
        onClick={() => {
          const newMode = viewMode === "3d" ? "2d" : "3d";
          setViewMode(newMode);
          setCameraOffset({ x: 0, z: 0 });
        }}
        variant="ghost"
        size="sm"
        className="h-6 w-6 p-0 bg-card/95 backdrop-blur"
      >
        {viewMode === "3d" ? <Grid3x3 className="h-3 w-3" /> : <Box className="h-3 w-3" />}
      </Button>
      <Button
        onClick={resetLevel}
        variant="ghost"
        size="sm"
        disabled={isComplete || isGliding}
        className="h-6 px-2 text-xs bg-card/95 backdrop-blur"
      >
        R
      </Button>
      {/* Preview navigation */}
      <div className="ml-auto flex items-center gap-1">
        <Button
          onClick={() => {
            if (currentLevelIndex > 0) {
              setSelectedArrow(null);
              setCameraOffset({ x: 0, z: 0 });
              setCurrentLevelIndex((i) => i - 1);
              toast.info("Preview: Previous level");
            }
          }}
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs bg-card/95 backdrop-blur"
          disabled={currentLevelIndex === 0}
          aria-label="Previous level"
          title="Previous level (P)"
        >
          ←
        </Button>
        <Button
          onClick={() => {
            if (currentLevelIndex < allLevels.length - 1) {
              setSelectedArrow(null);
              setCameraOffset({ x: 0, z: 0 });
              setCurrentLevelIndex((i) => i + 1);
              toast.info("Preview: Next level");
            } else {
              toast.info("No more levels");
            }
          }}
          variant="ghost"
          size="sm"
          className="h-6 px-2 text-xs bg-card/95 backdrop-blur"
          aria-label="Next level"
          title="Next level (N)"
        >
          →
        </Button>
      </div>
    </div>

    {/* Full Screen Game View - dominate viewport */}
    <div className="w-full flex-1 relative my-2">
      <Game3D
        grid={grid}
        playerPos={playerPos}
        cavePos={currentLevel.cavePos}
        selectedArrow={selectedArrow}
        cameraOffset={cameraOffset}
        viewMode={viewMode}
        onArrowClick={(x, y) => {
          if (isGliding) return;
          const cell = grid[y][x];
          if ((cell >= 7 && cell <= 10) || cell === 11 || cell === 12 || cell === 13) {
            // Prevent selecting an arrow that the player is currently occupying
            if (playerPos.x === x && playerPos.y === y) {
              toast.error("Cannot select arrow while standing on it!");
              return;
            }
            const isSameArrow = selectedArrow?.x === x && selectedArrow?.y === y;
            setSelectedArrow(isSameArrow ? null : { x, y });
            toast.info(isSameArrow ? "Arrow deselected" : "Arrow selected! Use controls to move it remotely.");
          }
        }}
        onCancelSelection={() => {
          if (selectedArrow) {
            setSelectedArrow(null);
            toast.info("Arrow deselected");
          }
        }}
      />
    </div>

    {/* Minimal Controls - Only show on mobile, desktop uses keyboard */}
    <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 z-50 md:hidden">
      <div className="bg-card/95 backdrop-blur border border-border/50 px-2 py-1 rounded shadow-md">
        <div className="grid grid-cols-4 gap-1">
          <Button
            onClick={() => selectedArrow ? moveArrowRemotely(0, -1) : movePlayer(0, -1)}
            className="h-8 w-8 p-0 text-xs"
            variant="secondary"
            size="sm"
          >
            ↑
          </Button>
          <Button
            onClick={() => selectedArrow ? moveArrowRemotely(0, 1) : movePlayer(0, 1)}
            className="h-8 w-8 p-0 text-xs"
            variant="secondary"
            size="sm"
          >
            ↓
          </Button>
          <Button
            onClick={() => selectedArrow ? moveArrowRemotely(-1, 0) : movePlayer(-1, 0)}
            className="h-8 w-8 p-0 text-xs"
            variant="secondary"
            size="sm"
          >
            ←
          </Button>
          <Button
            onClick={() => selectedArrow ? moveArrowRemotely(1, 0) : movePlayer(1, 0)}
            className="h-8 w-8 p-0 text-xs"
            variant="secondary"
            size="sm"
          >
            →
          </Button>
        </div>
      </div>
    </div>

    {/* Arrow selection indicator - Minimal */}
    {selectedArrow && (
      <div className="absolute top-1 right-1 z-50 bg-primary/90 backdrop-blur px-2 py-0.5 rounded text-xs font-semibold text-primary-foreground shadow-md">
        Arrow ({selectedArrow.x},{selectedArrow.y})
      </div>
    )}

    {/* Level completion buttons - Minimal overlay */}
    {isComplete && (
      <div className="absolute bottom-1 left-1/2 transform -translate-x-1/2 z-50 flex gap-1 md:bottom-auto md:right-1 md:left-auto md:top-8">
        <Button
          onClick={prevLevel}
          disabled={currentLevelIndex === 0}
          className="h-7 px-2 text-xs bg-card/95 backdrop-blur"
          variant="outline"
          size="sm"
        >
          ←
        </Button>
        <Button
          onClick={nextLevel}
          disabled={currentLevelIndex >= allLevels.length - 1}
          className="h-7 px-2 text-xs bg-card/95 backdrop-blur"
          variant="outline"
          size="sm"
        >
          →
        </Button>
      </div>
    )}
  </div>
);
};
