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

console.log('📦 LevelMapperContext.tsx loading...');

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
    showGrid: boolean; setShowGrid: (b: boolean) => void;
    // Overlay
    overlayEnabled: boolean; setOverlayEnabled: (b: boolean) => void;
    overlayOpacity: number; setOverlayOpacity: (n: number) => void;
    overlayStretch: boolean; setOverlayStretch: (b: boolean) => void;
    // Levels compare/import
    allLevels: ReturnType<typeof getAllLevels>; setAllLevels: (lv: ReturnType<typeof getAllLevels>) => void;
    compareLevelIndex: number; setCompareLevelIndex: (i: number) => void; compareLevel: ReturnType<typeof getAllLevels>[number] | undefined;
    importLevelIndex: number | null; setImportLevelIndex: (i: number | null) => void;
    // Undo/redo
    undo: () => void; redo: () => void; canUndo: boolean; canRedo: boolean;
    // Save state
    isSaved: boolean; setIsSaved: (b: boolean) => void; saveChanges: () => void;
    showUnsavedBanner: boolean;
    // Detection
    detectGrid: () => void; detectCells: () => void; detectGridAndCells: () => void; useDetectCurrentCounts: boolean; setUseDetectCurrentCounts: (b: boolean) => void;
    // Bulk context menu
    contextMenu: { x: number; y: number; type: BulkContextType } | null; setContextMenu: (m: { x: number; y: number; type: BulkContextType } | null) => void;
    addMultipleColumns: (side: 'left' | 'right', count: number) => void;
    addMultipleRows: (side: 'top' | 'bottom', count: number) => void;
    // Shape helpers
    addColumnLeft: () => void; addColumnRight: () => void; addRowTop: () => void; addRowBottom: () => void;
    // Export
    exportTS: () => void;
    // Editing helpers
    pushUndo: () => void;
}

const LevelMapperContext = createContext<LevelMapperContextValue | undefined>(undefined);

export const LevelMapperProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    console.log('⚛️ LevelMapperProvider initializing...');

    // All hooks must be called unconditionally (React Rules of Hooks)
    const [gridOffsetX, setGridOffsetX] = useState(0);
    const [gridOffsetY, setGridOffsetY] = useState(0);
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
        const [useDetectCurrentCounts, setUseDetectCurrentCounts] = useState(true);

        // Use custom hooks for side effects
        useJsonSync(grid, setJsonInput);
        useBeforeUnload(isSaved);
        useUnsavedBanner(isSaved, setShowUnsavedBanner);
        useCanvasDraw(canvasRef, imageURL, showGrid, rows, cols, gridOffsetX, gridOffsetY);
        useSaveCompareLevel(compareLevelIndex, saveCompareLevelIndex);
        useSaveImportLevel(importLevelIndex, saveImportLevelIndex);

        // Auto-load level on startup if one was previously imported
        useEffect(() => {
            if (importLevelIndex !== null && !imageURL) {
                const lvl = allLevels[importLevelIndex];
                if (lvl?.grid) {
                    // Check if grid is not all void (avoid loading empty/void grids)
                    const hasNonVoidCells = lvl.grid.some(row => row.some(cell => cell !== 5));

                    if (hasNonVoidCells) {
                        setRows(lvl.grid.length);
                        setCols(lvl.grid[0]?.length || 0);
                        setGrid(lvl.grid.map(row => [...row]));
                        // Load player start position if it exists
                        if (lvl.playerStart) {
                            setPlayerStart({ x: lvl.playerStart.x, y: lvl.playerStart.y });
                        }
                        // Load theme if it exists
                        if (lvl.theme) {
                            setTheme(lvl.theme);
                        }
                        console.log(`Auto-loaded Level ${lvl.id} from previous session`);
                    } else {
                        console.log(`Skipped auto-loading Level ${lvl.id} (empty/void grid)`);
                        // Clear the saved import level if it's all void
                        clearImportLevel();
                        setImportLevelIndex(null);
                    }
                }
            }
            // This effect should only run on mount - allLevels, imageURL, importLevelIndex are read from initial state
            // eslint-disable-next-line react-hooks/exhaustive-deps
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
            // grid is intentionally omitted - this effect reads from prevGrid (refs), not current grid state
            // eslint-disable-next-line react-hooks/exhaustive-deps
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
            } else {
                console.error('❌ Grid detection failed');
                alert('Grid detection failed (not enough line candidates).');
            }
        };

        const detectCells = async () => {
            console.log('🔍 detectCells() called - OPTIMIZED VERSION');
            const canvas = canvasRef.current;
            if (!canvas || !imageURL) {
                console.error('❌ No canvas or image in detectCells');
                alert('Please load an image first');
                return;
            }

            const ctx = canvas.getContext('2d', { willReadFrequently: true });
            if (!ctx) {
                console.error('❌ No canvas context');
                return;
            }

            try {
                const cw = canvas.width;
                const ch = canvas.height;
                console.log(`📊 Canvas size: ${cw}x${ch}, Grid: ${rows}x${cols}`);

                // Get image data once
                const imageData = ctx.getImageData(0, 0, cw, ch);
                const data = imageData.data;
                console.log('✓ Image data retrieved:', data.length, 'bytes');

                const newGrid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
                const totalCells = rows * cols;
                let processedCells = 0;

                // Simple fast classifier - just check if cell is mostly dark (stone/void) or light (floor)
                const classifyCell = (x0: number, y0: number, x1: number, y1: number): number => {
                    let totalBrightness = 0;
                    let pixelCount = 0;
                    let darkPixels = 0;

                    // Sample every 2nd pixel for speed
                    for (let y = y0; y < y1; y += 2) {
                        for (let x = x0; x < x1; x += 2) {
                            const idx = (y * cw + x) * 4;
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
                        requestAnimationFrame(() => {
                            const batchSize = 20; // Process 20 cells per frame
                            const endCell = Math.min(startCell + batchSize, totalCells);

                            for (let cellIndex = startCell; cellIndex < endCell; cellIndex++) {
                                const r = Math.floor(cellIndex / cols);
                                const c = cellIndex % cols;

                                const x0 = Math.max(0, Math.min(cw - 1, Math.floor((c * cw) / cols + gridOffsetX)));
                                const x1 = Math.max(0, Math.min(cw, Math.floor(((c + 1) * cw) / cols + gridOffsetX)));
                                const y0 = Math.max(0, Math.min(ch - 1, Math.floor((r * ch) / rows + gridOffsetY)));
                                const y1 = Math.max(0, Math.min(ch, Math.floor(((r + 1) * ch) / rows + gridOffsetY)));

                                newGrid[r][c] = classifyCell(x0, y0, x1, y1);
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

        console.log('✓ Creating context value...');
        const value: LevelMapperContextValue = { rows, cols, setRows, setCols, grid, setGrid, activeTile, setActiveTile, playerStart, setPlayerStart, theme, setTheme, imageURL, setImageURL, canvasRef, zoom, setZoom, gridOffsetX, setGridOffsetX, gridOffsetY, setGridOffsetY, showGrid, setShowGrid, overlayEnabled, setOverlayEnabled, overlayOpacity, setOverlayOpacity, overlayStretch, setOverlayStretch, allLevels, setAllLevels, compareLevelIndex, setCompareLevelIndex, compareLevel, importLevelIndex, setImportLevelIndex, undo, redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, isSaved, setIsSaved, saveChanges, showUnsavedBanner, detectGrid, detectCells, detectGridAndCells, useDetectCurrentCounts, setUseDetectCurrentCounts, contextMenu, setContextMenu, addMultipleColumns, addMultipleRows, addColumnLeft, addColumnRight, addRowTop, addRowBottom, exportTS, pushUndo };

        console.log('✅ LevelMapperProvider ready');
        return <LevelMapperContext.Provider value={value}>{children}</LevelMapperContext.Provider>;
};

console.log('✅ LevelMapperContext.tsx loaded');

export const useLevelMapper = () => { const ctx = useContext(LevelMapperContext); if (!ctx) throw new Error('useLevelMapper must be used inside LevelMapperProvider'); return ctx; };
