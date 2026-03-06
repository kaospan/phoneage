import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import { getAllLevels, type ColorTheme } from '@/data/levels';
import { emptyGrid } from '@/lib/levelgrid';
import { detectGridLines } from './gridDetection';
import {
    addColumnLeft as addColLeft,
    addColumnRight as addColRight,
    addRowTop as addRowT,
    addRowBottom as addRowB,
    addMultipleColumns as addMultipleCols,
    addMultipleRows as addMultipleR
} from './gridOperations';
import {
    saveGridChanges,
    exportGridToClipboard,
    loadCompareLevelIndex,
    saveCompareLevelIndex,
    loadImportLevelIndex,
    saveImportLevelIndex,
    clearImportLevel
} from './persistenceOperations';
import {
    useJsonSync,
    useBeforeUnload,
    useUnsavedBanner,
    useCanvasDraw,
    useSaveCompareLevel,
    useSaveImportLevel
} from './mapperHooks';
import { buildReferenceMatcher } from '@/lib/spriteMatching';
import { normalizeMapperImage } from './imageNormalization';
import { buildLevelFromSources } from '@/lib/levelImageDetection';
import { seedDefaultReferences } from '@/lib/referenceSeeder';
import { saveLevelOverride } from '@/lib/levelOverrides';

console.log('📦 LevelMapperContext.tsx loading...');

const CELL_SAMPLE_INSET_RATIO = 0.08;
const MAX_AUTO_DETECT_CELLS = 320;

// Types
export type BulkContextType = 'column-left' | 'column-right' | 'row-top' | 'row-bottom';

interface LevelMapperContextValue {
    // Dimensions & grid
    rows: number; cols: number; setRows: (r: number) => void; setCols: (c: number) => void;
    grid: number[][]; setGrid: React.Dispatch<React.SetStateAction<number[][]>>;
    activeTile: number; setActiveTile: (id: number) => void;
    // Player start position
    playerStart: { x: number; y: number } | null; setPlayerStart: (pos: { x: number; y: number } | null) => void;
    // Theme
    theme: ColorTheme | undefined; setTheme: (theme: ColorTheme | undefined) => void;
    // Image & canvas
    imageURL: string | null; setImageURL: (url: string | null) => void;
    canvasRef: React.RefObject<HTMLCanvasElement>;
    zoom: number; setZoom: (z: number) => void;
    gridOffsetX: number; setGridOffsetX: (n: number) => void;
    gridOffsetY: number; setGridOffsetY: (n: number) => void;
    gridFrameWidth: number | null; setGridFrameWidth: (n: number | null) => void;
    gridFrameHeight: number | null; setGridFrameHeight: (n: number | null) => void;
    showGrid: boolean; setShowGrid: (b: boolean) => void;
    // Overlay
    overlayEnabled: boolean; setOverlayEnabled: (b: boolean) => void;
    overlayOpacity: number; setOverlayOpacity: (n: number) => void;
    overlayStretch: boolean; setOverlayStretch: (b: boolean) => void;
    // Levels compare/import
    allLevels: ReturnType<typeof getAllLevels>; setAllLevels: React.Dispatch<React.SetStateAction<ReturnType<typeof getAllLevels>>>;
    compareLevelIndex: number; setCompareLevelIndex: (i: number) => void; compareLevel: any;
    importLevelIndex: number | null; setImportLevelIndex: (i: number | null) => void;
    // Undo/redo
    undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
    // Save state
    isSaved: boolean; setIsSaved: (b: boolean) => void; saveChanges: () => void;
    showUnsavedBanner: boolean;
    // Detection
    detectGrid: () => void; detectCells: () => void; detectGridAndCells: () => void; useDetectCurrentCounts: boolean; setUseDetectCurrentCounts: (b: boolean) => void;
    // Bulk context menu
    contextMenu: { x: number; y: number; type: BulkContextType } | null; setContextMenu: (m: any) => void;
    addMultipleColumns: (side: 'left' | 'right', count: number) => void;
    addMultipleRows: (side: 'top' | 'bottom', count: number) => void;
    // Shape helpers
    addColumnLeft: () => void; addColumnRight: () => void; addRowTop: () => void; addRowBottom: () => void;
    // Export
    exportTS: () => void;
    jsonInput: string;
    setJsonInput: (json: string) => void;
    syncJsonInputToGrid: () => void;
    applyJsonInput: () => void;
    // Editing helpers
    pushUndo: () => void;
    replaceGridShape: (nextGrid: number[][]) => void;
}

const LevelMapperContext = createContext<LevelMapperContextValue | undefined>(undefined);

const isPlaceholderGrid = (levelGrid?: number[][]) => {
    if (!levelGrid || levelGrid.length === 0) return true;
    if (levelGrid.length === 1 && levelGrid[0]?.length === 1 && levelGrid[0][0] === 5) return true;
    return levelGrid.every((row) => row.every((cell) => cell === 5));
};

const stripJsonComments = (value: string) => value.replace(/\/\/.*$/gm, '').trim();

const parseGridJson = (value: string): number[][] => {
    const parsed = JSON.parse(stripJsonComments(value));

    if (!Array.isArray(parsed) || parsed.length === 0) {
        throw new Error('Grid JSON must be a non-empty array of rows.');
    }

    if (!parsed.every((row) => Array.isArray(row))) {
        throw new Error('Every row in the grid JSON must be an array.');
    }

    const cols = parsed[0].length;
    if (cols === 0) {
        throw new Error('Grid JSON rows cannot be empty.');
    }

    const normalized = parsed.map((row, rowIndex) => {
        if (row.length !== cols) {
            throw new Error(`Row ${rowIndex + 1} has ${row.length} cells; expected ${cols}.`);
        }

        return row.map((cell, cellIndex) => {
            const valueAsNumber = Number(cell);
            if (!Number.isInteger(valueAsNumber) || valueAsNumber < 0) {
                throw new Error(`Cell at row ${rowIndex + 1}, col ${cellIndex + 1} is not a valid tile id.`);
            }
            return valueAsNumber;
        });
    });

    return normalized;
};

export const LevelMapperProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    console.log('⚛️ LevelMapperProvider initializing...');

    try {
        const [gridOffsetX, setGridOffsetX] = useState(0);
        const [gridOffsetY, setGridOffsetY] = useState(0);
        const [gridFrameWidth, setGridFrameWidth] = useState<number | null>(null);
        const [gridFrameHeight, setGridFrameHeight] = useState<number | null>(null);
        const [zoom, setZoom] = useState(1);
        console.log('✓ Basic state initialized');

        const canvasRef = useRef<HTMLCanvasElement | null>(null);
        const [rows, setRows] = useState(11);
        const [cols, setCols] = useState(20);
        const [activeTile, setActiveTile] = useState(0);
        const [grid, setGrid] = useState<number[][]>(() => emptyGrid(11, 20));
        const [playerStart, setPlayerStart] = useState<{ x: number; y: number } | null>(null);
        const [theme, setTheme] = useState<ColorTheme | undefined>(undefined);
        console.log('✓ Grid state initialized');

        const [allLevels, setAllLevels] = useState(() => {
            console.log('🔍 Loading all levels...');
            const levels = getAllLevels();
            console.log('✓ Levels loaded:', levels.length);
            return levels;
        });

        // Persistent compare level index - remember last selection
        const [compareLevelIndex, setCompareLevelIndex] = useState(loadCompareLevelIndex);
        const compareLevel = allLevels[compareLevelIndex];

        // Persistent import level index - remember last loaded level
        const [importLevelIndex, setImportLevelIndex] = useState<number | null>(loadImportLevelIndex);

        const [imageURL, setImageURL] = useState<string | null>(null);
        const [showGrid, setShowGrid] = useState(true);
        const [jsonInput, setJsonInput] = useState('');
        const [isSaved, setIsSaved] = useState(true);
        const [showUnsavedBanner, setShowUnsavedBanner] = useState(true);
        const prevSizeRef = useRef({ rows, cols });
        const skipAutoResizeRef = useRef(false);
        const [contextMenu, setContextMenu] = useState<{ x: number; y: number; type: BulkContextType } | null>(null);
        const [undoStack, setUndoStack] = useState<number[][][]>([]);
        const [redoStack, setRedoStack] = useState<number[][][]>([]);
        const [overlayEnabled, setOverlayEnabled] = useState(false);
        const [overlayOpacity, setOverlayOpacity] = useState(0.5);
        const [overlayStretch, setOverlayStretch] = useState(true);
        const [useDetectCurrentCounts, setUseDetectCurrentCounts] = useState(false);

        // Use custom hooks for side effects
        useJsonSync(grid, jsonInput, setJsonInput);
        useBeforeUnload(isSaved);
        useUnsavedBanner(isSaved, setShowUnsavedBanner);
        useCanvasDraw(canvasRef, imageURL, showGrid, rows, cols, gridOffsetX, gridOffsetY);
        useSaveCompareLevel(compareLevelIndex, saveCompareLevelIndex);
        useSaveImportLevel(importLevelIndex, saveImportLevelIndex);

        // Auto-load level on startup if one was previously imported
        useEffect(() => {
            if (importLevelIndex !== null) {
                const lvl = allLevels[importLevelIndex];
                if (lvl?.grid) {
                    const loadLevelIntoMapper = async () => {
                        let resolved = lvl;

                        if (resolved.autoBuild && isPlaceholderGrid(resolved.grid) && (resolved.sources?.length || resolved.image)) {
                            try {
                                await seedDefaultReferences();
                                const built = await buildLevelFromSources(resolved.sources ?? [resolved.image!], {
                                    minSimilarity: 0.72,
                                    timeoutMs: 12000,
                                    yieldEveryRows: 1,
                                });
                                resolved = {
                                    ...resolved,
                                    grid: built.grid,
                                    playerStart: built.playerStart,
                                    cavePos: built.cavePos,
                                };
                                saveLevelOverride(resolved.id, built.grid, built.playerStart, resolved.theme);
                                setAllLevels((current) =>
                                    current.map((entry) => (entry.id === resolved.id ? resolved : entry))
                                );
                            } catch (error) {
                                console.error(`Failed to lazy-build Level ${resolved.id} in mapper:`, error);
                            }
                        }

                        const hasNonVoidCells = resolved.grid.some(row => row.some(cell => cell !== 5));
                        if (!hasNonVoidCells) {
                            console.log(`Skipped auto-loading Level ${resolved.id} (empty/void grid)`);
                            clearImportLevel();
                            setImportLevelIndex(null);
                            return;
                        }

                        setRows(resolved.grid.length);
                        setCols(resolved.grid[0]?.length || 0);
                        setGrid(resolved.grid.map(row => [...row]));
                        if (resolved.image) {
                            void normalizeMapperImage(resolved.image).then((normalizedURL) => {
                                setImageURL(normalizedURL);
                            });
                        } else {
                            setImageURL(null);
                        }
                        setOverlayEnabled(Boolean(resolved.image));
                        setGridOffsetX(0);
                        setGridOffsetY(0);
                        setGridFrameWidth(null);
                        setGridFrameHeight(null);
                        if (resolved.playerStart) {
                            setPlayerStart({ x: resolved.playerStart.x, y: resolved.playerStart.y });
                        }
                        if (resolved.theme) {
                            setTheme(resolved.theme);
                        }
                        console.log(`Auto-loaded Level ${resolved.id} from previous session`);
                    };

                    void loadLevelIntoMapper();
                }
            }
        }, []); // Only run on mount

        // Resize dimension change effect
        useEffect(() => {
            if (prevSizeRef.current.rows === rows && prevSizeRef.current.cols === cols) return;
            if (skipAutoResizeRef.current) { prevSizeRef.current = { rows, cols }; skipAutoResizeRef.current = false; return; }
            const prevRows = prevSizeRef.current.rows; const prevCols = prevSizeRef.current.cols; const prevGrid = grid;
            const growRows = Math.max(0, rows - prevRows); const growCols = Math.max(0, cols - prevCols);
            const topPad = Math.floor(growRows / 2); const leftPad = Math.floor(growCols / 2);
            const topCrop = Math.max(0, Math.floor((prevRows - rows) / 2)); const leftCrop = Math.max(0, Math.floor((prevCols - cols) / 2));
            const newGrid: number[][] = Array.from({ length: rows }, (_, r) => {
                const srcR = r - topPad + topCrop;
                return Array.from({ length: cols }, (_, c) => {
                    const srcC = c - leftPad + leftCrop;
                    if (srcR >= 0 && srcR < prevRows && srcC >= 0 && srcC < prevCols && prevGrid[srcR]?.[srcC] !== undefined) {
                        return prevGrid[srcR][srcC];
                    }
                    return 5;
                });
            });
            setUndoStack(s => [...s, prevGrid.map(row => [...row])]); setRedoStack([]); setIsSaved(false); setGrid(newGrid); prevSizeRef.current = { rows, cols };
        }, [rows, cols]);

        // Grid manipulation functions using extracted modules
        const addColumnLeft = () => addColLeft(grid, setGrid, setCols, setUndoStack, setRedoStack, setIsSaved, skipAutoResizeRef, prevSizeRef, rows);
        const addColumnRight = () => addColRight(grid, setGrid, setCols, setUndoStack, setRedoStack, setIsSaved, skipAutoResizeRef, prevSizeRef, rows);
        const addRowTop = () => addRowT(grid, setGrid, setRows, setCols, setUndoStack, setRedoStack, setIsSaved, skipAutoResizeRef, prevSizeRef, cols);
        const addRowBottom = () => addRowB(grid, setGrid, setRows, setCols, setUndoStack, setRedoStack, setIsSaved, skipAutoResizeRef, prevSizeRef, cols);
        const addMultipleColumns = (side: 'left' | 'right', count: number) => addMultipleCols(side, count, grid, setGrid, setCols, setUndoStack, setRedoStack, setIsSaved, skipAutoResizeRef, prevSizeRef, rows);
        const addMultipleRows = (side: 'top' | 'bottom', count: number) => addMultipleR(side, count, grid, setGrid, setRows, setCols, setUndoStack, setRedoStack, setIsSaved, skipAutoResizeRef, prevSizeRef, cols);

        const undo = () => { if (undoStack.length === 0) return; setRedoStack(s => [...s, grid.map(r => [...r])]); const prev = undoStack[undoStack.length - 1]; setGrid(prev.map(r => [...r])); setUndoStack(s => s.slice(0, -1)); setIsSaved(false); };
        const redo = () => { if (redoStack.length === 0) return; setUndoStack(s => [...s, grid.map(r => [...r])]); const next = redoStack[redoStack.length - 1]; setGrid(next.map(r => [...r])); setRedoStack(s => s.slice(0, -1)); setIsSaved(false); };

        const detectGrid = () => {
            const canvas = canvasRef.current;
            if (!canvas) {
                console.error('❌ No canvas in detectGrid');
                return;
            }

            const result = detectGridLines(canvas, useDetectCurrentCounts, rows, cols);

            if (result) {
                console.log(`✓ Grid detected: ${result.rows}x${result.cols}`);
                setRows(result.rows);
                setCols(result.cols);
                setGrid(emptyGrid(result.rows, result.cols));
                const applyGridBounds = async () => {
                    if (!imageURL) {
                        setGridOffsetX(result.offsetX);
                        setGridOffsetY(result.offsetY);
                        setGridFrameWidth(null);
                        setGridFrameHeight(null);
                        return;
                    }

                    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                        const img = new Image();
                        img.onload = () => resolve(img);
                        img.onerror = () => reject(new Error('Failed to load image for grid detection'));
                        img.src = imageURL;
                    });

                    const scaleX = canvas.width > 0 ? image.width / canvas.width : 1;
                    const scaleY = canvas.height > 0 ? image.height / canvas.height : 1;
                    setGridOffsetX(Math.round(result.offsetX * scaleX));
                    setGridOffsetY(Math.round(result.offsetY * scaleY));
                    setGridFrameWidth(image.width);
                    setGridFrameHeight(image.height);
                };

                void applyGridBounds();
            } else {
                console.error('❌ Grid detection failed');
                alert('Grid detection failed. Try locking the current rows/cols if you already know them, or adjust the crop so the board edges are cleaner.');
            }
        };

        const detectCells = async () => {
            console.log('🔍 detectCells() called - OPTIMIZED VERSION');
            if (!imageURL) {
                console.error('❌ No image in detectCells');
                alert('Please load an image first');
                return;
            }

            try {
                const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error('Failed to load image for cell detection'));
                    img.src = imageURL;
                });

                const sampleCanvas = document.createElement('canvas');
                sampleCanvas.width = image.width;
                sampleCanvas.height = image.height;
                const ctx = sampleCanvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) {
                    console.error('❌ No offscreen canvas context');
                    return;
                }

                ctx.drawImage(image, 0, 0);
                const imageData = ctx.getImageData(0, 0, image.width, image.height);
                const data = imageData.data;
                const frameWidth = gridFrameWidth ?? image.width;
                const frameHeight = gridFrameHeight ?? image.height;
                const cellWidth = frameWidth / cols;
                const cellHeight = frameHeight / rows;
                console.log(`📊 Image size: ${image.width}x${image.height}, Grid: ${rows}x${cols}, Frame: ${frameWidth}x${frameHeight}`);

                const newGrid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
                const totalCells = rows * cols;
                if (totalCells > MAX_AUTO_DETECT_CELLS) {
                    throw new Error(`Unsafe auto-detect size ${rows}x${cols}. Reduce rows/cols or re-run grid detection with cleaner borders.`);
                }
                let processedCells = 0;

                const matcher = await buildReferenceMatcher(0.70);

                // Sprite-first classifier with pattern fallback
                const classifyCell = async (x0: number, y0: number, x1: number, y1: number): Promise<number> => {
                    if (matcher) {
                        const cellImageData = ctx.getImageData(x0, y0, Math.max(1, x1 - x0), Math.max(1, y1 - y0));
                        const spriteMatch = await matcher(cellImageData);
                        if (spriteMatch !== null) return spriteMatch;
                    }

                    let totalBrightness = 0;
                    let pixelCount = 0;
                    let darkPixels = 0;

                    // Sample every 2nd pixel for speed
                    for (let y = y0; y < y1; y += 2) {
                        for (let x = x0; x < x1; x += 2) {
                            const idx = (y * image.width + x) * 4;
                            const r = data[idx];
                            const g = data[idx + 1];
                            const b = data[idx + 2];
                            const brightness = (r + g + b) / 3;

                            totalBrightness += brightness;
                            pixelCount++;
                            if (brightness < 80) darkPixels++;
                        }
                    }

                    if (pixelCount === 0) return 5; // void

                    const avgBrightness = totalBrightness / pixelCount;
                    const darkRatio = darkPixels / pixelCount;

                    // Simple classification
                    if (avgBrightness < 50) return 5; // void (very dark)
                    if (darkRatio > 0.6) return 2; // stone (mostly dark)
                    if (avgBrightness > 180) return 0; // floor (bright)
                    if (avgBrightness > 120) return 0; // floor
                    return 2; // default to stone
                };

                // Process in batches using requestAnimationFrame
                const processBatch = (startCell: number): Promise<void> => {
                    return new Promise((resolve) => {
                        requestAnimationFrame(async () => {
                            const batchSize = 20; // Process 20 cells per frame
                            const endCell = Math.min(startCell + batchSize, totalCells);

                            for (let cellIndex = startCell; cellIndex < endCell; cellIndex++) {
                                const r = Math.floor(cellIndex / cols);
                                const c = cellIndex % cols;

                                const insetX = Math.min(cellWidth * CELL_SAMPLE_INSET_RATIO, Math.max(1, cellWidth / 4));
                                const insetY = Math.min(cellHeight * CELL_SAMPLE_INSET_RATIO, Math.max(1, cellHeight / 4));
                                const x0 = Math.max(0, Math.min(image.width - 1, Math.floor(gridOffsetX + c * cellWidth + insetX)));
                                const x1 = Math.max(x0 + 1, Math.min(image.width, Math.ceil(gridOffsetX + (c + 1) * cellWidth - insetX)));
                                const y0 = Math.max(0, Math.min(image.height - 1, Math.floor(gridOffsetY + r * cellHeight + insetY)));
                                const y1 = Math.max(y0 + 1, Math.min(image.height, Math.ceil(gridOffsetY + (r + 1) * cellHeight - insetY)));

                                newGrid[r][c] = await classifyCell(x0, y0, x1, y1);
                                processedCells++;
                            }

                            // Log progress every 100 cells
                            if (processedCells % 100 === 0 || processedCells === totalCells) {
                                console.log(`Progress: ${processedCells}/${totalCells} cells (${Math.round(processedCells / totalCells * 100)}%)`);
                            }

                            resolve();
                        });
                    });
                };

                // Process all batches sequentially
                console.log('🚀 Starting batch processing...');
                for (let cellIndex = 0; cellIndex < totalCells; cellIndex += 20) {
                    await processBatch(cellIndex);
                }

                console.log('✅ Detection complete!');
                setUndoStack(s => [...s, grid.map(row => [...row])]);
                setRedoStack([]);
                setIsSaved(false);
                setGrid(newGrid);

            } catch (error) {
                console.error('❌ Error in detectCells:', error);
                alert(`Detection failed: ${(error as Error).message}`);
            }
        };

        const detectGridAndCells = () => {
            detectGrid();
            setTimeout(() => detectCells(), 300);
        };

        const exportTS = async () => {
            try {
                await exportGridToClipboard(grid);
                alert('Grid copied to clipboard as JSON');
            } catch (error) {
                console.error('Export failed:', error);
                alert('Failed to copy to clipboard');
            }
        };

        const syncJsonInputToGrid = () => {
            setJsonInput(formatGridRowsOneLine(grid));
        };

        const applyJsonInput = () => {
            try {
                const nextGrid = parseGridJson(jsonInput);
                setUndoStack((stack) => [...stack, grid.map((row) => [...row])]);
                setRedoStack([]);
                replaceGridShape(nextGrid);
                setJsonInput(formatGridRowsOneLine(nextGrid));
                alert(`Applied JSON grid: ${nextGrid.length} rows × ${nextGrid[0].length} cols`);
            } catch (error) {
                console.error('Failed to apply JSON grid:', error);
                alert(`Invalid JSON grid: ${(error as Error).message}`);
            }
        };

        const saveChanges = () => {
            const updatedLevels = saveGridChanges(grid, playerStart, theme, importLevelIndex, allLevels);
            setAllLevels(updatedLevels);
            setIsSaved(true);

            // Force the compare level to update by triggering a re-render
            if (compareLevelIndex !== null) {
                setCompareLevelIndex(compareLevelIndex);
            }

            alert('Changes saved!');
        };

        const pushUndo = () => { setUndoStack(s => [...s, grid.map(r => [...r])]); setRedoStack([]); setIsSaved(false); };
        const replaceGridShape = (nextGrid: number[][]) => {
            const nextRows = nextGrid.length;
            const nextCols = nextGrid[0]?.length ?? 0;
            skipAutoResizeRef.current = true;
            prevSizeRef.current = { rows: nextRows, cols: nextCols };
            setRows(nextRows);
            setCols(nextCols);
            setGrid(nextGrid.map((row) => [...row]));
            setIsSaved(false);
        };

        console.log('✓ Creating context value...');
        const value: LevelMapperContextValue = { rows, cols, setRows, setCols, grid, setGrid, activeTile, setActiveTile, playerStart, setPlayerStart, theme, setTheme, imageURL, setImageURL, canvasRef, zoom, setZoom, gridOffsetX, setGridOffsetX, gridOffsetY, setGridOffsetY, gridFrameWidth, setGridFrameWidth, gridFrameHeight, setGridFrameHeight, showGrid, setShowGrid, overlayEnabled, setOverlayEnabled, overlayOpacity, setOverlayOpacity, overlayStretch, setOverlayStretch, allLevels, setAllLevels, compareLevelIndex, setCompareLevelIndex, compareLevel, importLevelIndex, setImportLevelIndex, undo, redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, isSaved, setIsSaved, saveChanges, showUnsavedBanner, detectGrid, detectCells, detectGridAndCells, useDetectCurrentCounts, setUseDetectCurrentCounts, contextMenu, setContextMenu, addMultipleColumns, addMultipleRows, addColumnLeft, addColumnRight, addRowTop, addRowBottom, exportTS, jsonInput, setJsonInput, syncJsonInputToGrid, applyJsonInput, pushUndo, replaceGridShape };

        console.log('✅ LevelMapperProvider ready');
        return <LevelMapperContext.Provider value={value}>{children}</LevelMapperContext.Provider>;
    } catch (error) {
        console.error('❌ Error in LevelMapperProvider:', error);
        console.error('Stack trace:', (error as Error).stack);
        return (
            <div style={{ padding: '20px', color: 'red' }}>
                <h2>Level Mapper Context Failed</h2>
                <p>{(error as Error).message}</p>
                <pre>{(error as Error).stack}</pre>
                <button onClick={() => window.location.reload()}>Reload</button>
            </div>
        );
    }
};

console.log('✅ LevelMapperContext.tsx loaded');

export const useLevelMapper = () => { const ctx = useContext(LevelMapperContext); if (!ctx) throw new Error('useLevelMapper must be used inside LevelMapperProvider'); return ctx; };
