import React, { useEffect, useRef, useState } from 'react';
import { getAllLevels, type ColorTheme } from '@/data/levels';
import { emptyGrid, formatGridRowsOneLine, voidGrid } from '@/lib/levelgrid';
import { detectGridLines } from './gridDetection';
import { LevelMapperContext, type BulkContextType, type LevelMapperContextValue } from './LevelMapperStore';
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
    clearImportLevel,
    loadLevelLayoutOverride,
    saveLevelLayoutOverride
} from './persistenceOperations';
import {
    useJsonSync,
    useBeforeUnload,
    useUnsavedBanner,
    useCanvasDraw,
    useSaveCompareLevel,
    useSaveImportLevel
} from './mapperHooks';
import { getCellReferences as getStoredCellReferences, loadImageData } from '@/lib/spriteMatching';
import { normalizeMapperImage } from './imageNormalization';
import { getAlignmentHints } from './alignmentProfile';
import { getLevelImageUrl } from './levelImageStore';
console.log('📦 LevelMapperContext.tsx loading...');

// Sample interior pixels to avoid gridlines/adjacent cell bleed when matching sprites.
const CELL_SAMPLE_INSET_RATIO = 0.12;
const MAX_AUTO_DETECT_CELLS = 320;

// Types
// LevelMapperContextValue lives in LevelMapperStore.ts (to keep Fast Refresh stable)

const isPlaceholderGrid = (levelGrid?: number[][]) => {
    if (!levelGrid || levelGrid.length === 0) return true;
    if (levelGrid.length === 1 && levelGrid[0]?.length === 1 && levelGrid[0][0] === 5) return true;
    return levelGrid.every((row) => row.every((cell) => cell === 5));
};

const reshapeGridPreservingOverlap = (prev: number[][], nextRows: number, nextCols: number, fill = 5) => {
    const next = Array.from({ length: nextRows }, () => Array(nextCols).fill(fill));
    const rMax = Math.min(prev.length, nextRows);
    const cMax = Math.min(prev[0]?.length ?? 0, nextCols);
    for (let r = 0; r < rMax; r += 1) {
        for (let c = 0; c < cMax; c += 1) next[r][c] = prev[r][c];
    }
    return next;
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
        // Default mapper layout is 12x20 unless a level has a saved manual layout override.
        const [rows, setRows] = useState(12);
        const [cols, setCols] = useState(20);
        const [activeTile, setActiveTile] = useState(0);
        const [grid, setGrid] = useState<number[][]>(() => emptyGrid(12, 20));
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
        const [lastGridDetection, setLastGridDetection] = useState<ReturnType<typeof detectGridLines> | null>(null);
        const loadedSnapshotRef = useRef<null | {
            grid: number[][];
            playerStart: { x: number; y: number } | null;
            theme: ColorTheme | undefined;
            imageURL: string | null;
            overlayEnabled: boolean;
            overlayOpacity: number;
            overlayStretch: boolean;
            zoom: number;
            gridOffsetX: number;
            gridOffsetY: number;
            gridFrameWidth: number | null;
            gridFrameHeight: number | null;
        }>(null);

        // Use custom hooks for side effects
        useJsonSync(grid, jsonInput, setJsonInput);
        useBeforeUnload(isSaved);
        useUnsavedBanner(isSaved, setShowUnsavedBanner);
        useCanvasDraw(canvasRef, imageURL, showGrid, rows, cols, gridOffsetX, gridOffsetY);
        useSaveCompareLevel(compareLevelIndex, saveCompareLevelIndex);
        useSaveImportLevel(importLevelIndex, saveImportLevelIndex);

        // Detection results are image-specific; clear when the image changes.
        useEffect(() => {
            setLastGridDetection(null);
        }, [imageURL]);

        // Persist per-level layout (rows/cols) so placeholder auto-build levels can remember a user-chosen size
        // like "Level 21 is 12 rows" even before the grid is fully mapped.
        useEffect(() => {
            if (importLevelIndex === null) return;
            const lvl = allLevels[importLevelIndex];
            if (!lvl) return;
            saveLevelLayoutOverride(lvl.id, rows, cols);
        }, [rows, cols, importLevelIndex, allLevels]);

        // Auto-load level on startup if one was previously imported.
        // For placeholder auto-build levels, load the image and keep the editor responsive
        // instead of running a heavy full image-to-grid build during mount.
        useEffect(() => {
                    if (importLevelIndex !== null) {
                const lvl = allLevels[importLevelIndex];
                if (lvl?.grid) {
                    const loadLevelIntoMapper = async () => {
                        let resolved = lvl;

                        if (resolved.autoBuild && isPlaceholderGrid(resolved.grid)) {
                            const layout = loadLevelLayoutOverride(resolved.id) ?? { rows: 12, cols: 20 };
                            resolved = {
                                ...resolved,
                                grid: voidGrid(layout.rows, layout.cols),
                            };
                        }

                        const storedUpload = await getLevelImageUrl(resolved.id);
                        const hasNonVoidCells = resolved.grid.some(row => row.some(cell => cell !== 5));
                        if (!hasNonVoidCells && !resolved.image && !storedUpload) {
                            console.log(`Skipped auto-loading Level ${resolved.id} (empty/void grid)`);
                            clearImportLevel();
                            setImportLevelIndex(null);
                            return;
                        }

                        setRows(resolved.grid.length);
                        setCols(resolved.grid[0]?.length || 0);
                        setGrid(resolved.grid.map(row => [...row]));
                        if (storedUpload) {
                            setImageURL(storedUpload);
                            setOverlayEnabled(true);
                        } else if (resolved.image) {
                            void normalizeMapperImage(resolved.image).then((normalizedURL) => {
                                setImageURL(normalizedURL);
                            });
                            setOverlayEnabled(true);
                        } else {
                            setImageURL(null);
                            setOverlayEnabled(false);
                        }
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

        const removeColumnLeft = () => {
            setGrid((g) => {
                const width = g[0]?.length ?? cols;
                if (width <= 1) return g;
                const snap = g.map((r) => [...r]);
                setUndoStack((s) => [...s, snap]);
                setRedoStack([]);
                setIsSaved(false);
                const newG = g.map((r) => r.slice(1));
                skipAutoResizeRef.current = true;
                setCols(width - 1);
                prevSizeRef.current = { rows: g.length, cols: width - 1 };
                setPlayerStart((prev) =>
                    prev ? { x: Math.max(0, prev.x - 1), y: Math.min(prev.y, g.length - 1) } : prev
                );
                return newG;
            });
        };

        const removeColumnRight = () => {
            setGrid((g) => {
                const width = g[0]?.length ?? cols;
                if (width <= 1) return g;
                const snap = g.map((r) => [...r]);
                setUndoStack((s) => [...s, snap]);
                setRedoStack([]);
                setIsSaved(false);
                const newG = g.map((r) => r.slice(0, -1));
                skipAutoResizeRef.current = true;
                setCols(width - 1);
                prevSizeRef.current = { rows: g.length, cols: width - 1 };
                setPlayerStart((prev) =>
                    prev ? { x: Math.min(prev.x, width - 2), y: Math.min(prev.y, g.length - 1) } : prev
                );
                return newG;
            });
        };

        const removeRowTop = () => {
            setGrid((g) => {
                const height = g.length;
                if (height <= 1) return g;
                const snap = g.map((r) => [...r]);
                setUndoStack((s) => [...s, snap]);
                setRedoStack([]);
                setIsSaved(false);
                const newG = g.slice(1).map((r) => [...r]);
                skipAutoResizeRef.current = true;
                setRows(height - 1);
                prevSizeRef.current = { rows: height - 1, cols: g[0]?.length ?? cols };
                setPlayerStart((prev) =>
                    prev
                        ? { x: Math.min(prev.x, (g[0]?.length ?? cols) - 1), y: Math.max(0, prev.y - 1) }
                        : prev
                );
                return newG;
            });
        };

        const removeRowBottom = () => {
            setGrid((g) => {
                const height = g.length;
                if (height <= 1) return g;
                const snap = g.map((r) => [...r]);
                setUndoStack((s) => [...s, snap]);
                setRedoStack([]);
                setIsSaved(false);
                const newG = g.slice(0, -1).map((r) => [...r]);
                skipAutoResizeRef.current = true;
                setRows(height - 1);
                prevSizeRef.current = { rows: height - 1, cols: g[0]?.length ?? cols };
                setPlayerStart((prev) =>
                    prev
                        ? { x: Math.min(prev.x, (g[0]?.length ?? cols) - 1), y: Math.min(prev.y, height - 2) }
                        : prev
                );
                return newG;
            });
        };

        const undo = () => { if (undoStack.length === 0) return; setRedoStack(s => [...s, grid.map(r => [...r])]); const prev = undoStack[undoStack.length - 1]; setGrid(prev.map(r => [...r])); setUndoStack(s => s.slice(0, -1)); setIsSaved(false); };
        const redo = () => { if (redoStack.length === 0) return; setUndoStack(s => [...s, grid.map(r => [...r])]); const next = redoStack[redoStack.length - 1]; setGrid(next.map(r => [...r])); setRedoStack(s => s.slice(0, -1)); setIsSaved(false); };

        const referenceSigCacheRef = useRef<{
            key: string;
            sigSize: number;
            refs: Array<{ tileType: number; sig: Uint8Array }>;
        } | null>(null);

        const detectGrid = async () => {
            try {
                const maxDim = 1100; // speed: run detection on downsampled image, then scale back to source pixels
                const imageCanvas = document.createElement('canvas');
                let srcW = 0;
                let srcH = 0;

                if (imageURL) {
                    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                        const img = new Image();
                        img.decoding = 'async';
                        img.onload = () => resolve(img);
                        img.onerror = () => reject(new Error('Failed to load image for grid detection'));
                        img.src = imageURL;
                    });
                    srcW = image.width;
                    srcH = image.height;

                    const scale = Math.min(1, maxDim / Math.max(1, Math.max(srcW, srcH)));
                    const w = Math.max(1, Math.round(srcW * scale));
                    const h = Math.max(1, Math.round(srcH * scale));
                    imageCanvas.width = w;
                    imageCanvas.height = h;
                    const ctx = imageCanvas.getContext('2d', { willReadFrequently: true });
                    if (!ctx) throw new Error('Failed to create canvas context for grid detection');
                    ctx.drawImage(image, 0, 0, w, h);
                } else {
                    const preview = canvasRef.current;
                    if (!preview) {
                        console.error('❌ No canvas/image in detectGrid');
                        return null;
                    }
                    srcW = preview.width;
                    srcH = preview.height;
                    imageCanvas.width = preview.width;
                    imageCanvas.height = preview.height;
                    const ctx = imageCanvas.getContext('2d', { willReadFrequently: true });
                    if (!ctx) throw new Error('Failed to create canvas context for grid detection');
                    ctx.drawImage(preview, 0, 0);
                }

                // Auto-detect always ignores the "Lock current rows/cols" toggle.
                const detected = detectGridLines(imageCanvas, false, rows, cols, getAlignmentHints());
                if (!detected) {
                    setLastGridDetection(null);
                    console.error('❌ Grid detection failed');
                    alert('Grid detection failed. Try adjusting the crop so the board edges are cleaner.');
                    return null;
                }

                // If auto-detect produced a different layout with low confidence (common when a faint outer ring exists),
                // keep the user's current rows/cols and only snap offset/frame.
                const lowConfidenceLayoutChange =
                    detected.confidence < 0.35 && (detected.rows !== rows || detected.cols !== cols);
                if (lowConfidenceLayoutChange) {
                    const snapped = detectGridLines(imageCanvas, true, rows, cols, getAlignmentHints());
                    if (snapped) {
                        const scaleBackX = srcW / Math.max(1, imageCanvas.width);
                        const scaleBackY = srcH / Math.max(1, imageCanvas.height);
                        const result = {
                            ...snapped,
                            offsetX: snapped.offsetX * scaleBackX,
                            offsetY: snapped.offsetY * scaleBackY,
                            cellWidth: snapped.cellWidth * scaleBackX,
                            cellHeight: snapped.cellHeight * scaleBackY,
                        };

                        console.log(
                            `⚠️ Low-confidence auto-detect (${detected.confidence.toFixed(2)}) changed layout ` +
                            `${detected.rows}x${detected.cols} -> keeping ${rows}x${cols} and snapping frame only.`
                        );

                        setLastGridDetection(result);

                        const nextOffsetX = Math.max(0, Math.min(srcW - 1, Math.round(result.offsetX)));
                        const nextOffsetY = Math.max(0, Math.min(srcH - 1, Math.round(result.offsetY)));
                        const nextFrameWidth = Math.min(srcW, Math.max(1, Math.round(result.cellWidth * cols)));
                        const nextFrameHeight = Math.min(srcH, Math.max(1, Math.round(result.cellHeight * rows)));

                        setGridOffsetX(nextOffsetX);
                        setGridOffsetY(nextOffsetY);
                        setGridFrameWidth(nextFrameWidth);
                        setGridFrameHeight(nextFrameHeight);
                        setIsSaved(false);
                        return result;
                    }
                }

                const scaleBackX = srcW / Math.max(1, imageCanvas.width);
                const scaleBackY = srcH / Math.max(1, imageCanvas.height);
                const result = {
                    ...detected,
                    offsetX: detected.offsetX * scaleBackX,
                    offsetY: detected.offsetY * scaleBackY,
                    cellWidth: detected.cellWidth * scaleBackX,
                    cellHeight: detected.cellHeight * scaleBackY,
                };

                console.log(`✓ Grid detected: ${result.rows}x${result.cols} (conf ${result.confidence.toFixed(2)})`);
                setLastGridDetection(result);

                setRows(result.rows);
                setCols(result.cols);
                setPlayerStart((prev) => (prev ? { x: Math.min(prev.x, result.cols - 1), y: Math.min(prev.y, result.rows - 1) } : prev));

                // Preserve overlap if the user already painted a map; otherwise start with void.
                setGrid((prev) => {
                    const base = voidGrid(result.rows, result.cols);
                    if (isPlaceholderGrid(prev)) return base;
                    return reshapeGridPreservingOverlap(prev, result.rows, result.cols, 5);
                });

                // Snap frame to exact tile multiples in the source image pixels.
                const nextOffsetX = Math.max(0, Math.min(srcW - 1, Math.round(result.offsetX)));
                const nextOffsetY = Math.max(0, Math.min(srcH - 1, Math.round(result.offsetY)));
                const nextFrameWidth = Math.min(srcW, Math.max(1, Math.round(result.cellWidth * result.cols)));
                const nextFrameHeight = Math.min(srcH, Math.max(1, Math.round(result.cellHeight * result.rows)));

                setGridOffsetX(nextOffsetX);
                setGridOffsetY(nextOffsetY);
                setGridFrameWidth(nextFrameWidth);
                setGridFrameHeight(nextFrameHeight);
                setIsSaved(false);
                return result;
            } catch (error) {
                console.error('❌ Grid detection failed:', error);
                alert(`Grid detection failed: ${(error as Error).message}`);
                return null;
            }
        };

        // Advanced tool: keep current rows/cols, only snap frame/offset to the detected grid.
        const snapToLockedCounts = async () => {
            try {
                if (!imageURL) {
                    alert('Please load an image first.');
                    return null;
                }
                const maxDim = 1100;
                const imageCanvas = document.createElement('canvas');
                const image = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const img = new Image();
                    img.decoding = 'async';
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error('Failed to load image for grid snap'));
                    img.src = imageURL;
                });

                const srcW = image.width;
                const srcH = image.height;
                const scale = Math.min(1, maxDim / Math.max(1, Math.max(srcW, srcH)));
                const w = Math.max(1, Math.round(srcW * scale));
                const h = Math.max(1, Math.round(srcH * scale));
                imageCanvas.width = w;
                imageCanvas.height = h;
                const ctx = imageCanvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) throw new Error('Failed to create canvas context for grid snap');
                ctx.drawImage(image, 0, 0, w, h);

                const detected = detectGridLines(imageCanvas, true, rows, cols, getAlignmentHints());
                if (!detected) {
                    alert('Snap failed. Try adjusting the crop so the board edges are cleaner.');
                    return null;
                }

                const scaleBackX = srcW / Math.max(1, imageCanvas.width);
                const scaleBackY = srcH / Math.max(1, imageCanvas.height);
                const result = {
                    ...detected,
                    offsetX: detected.offsetX * scaleBackX,
                    offsetY: detected.offsetY * scaleBackY,
                    cellWidth: detected.cellWidth * scaleBackX,
                    cellHeight: detected.cellHeight * scaleBackY,
                };

                setLastGridDetection(result);

                const nextOffsetX = Math.max(0, Math.min(srcW - 1, Math.round(result.offsetX)));
                const nextOffsetY = Math.max(0, Math.min(srcH - 1, Math.round(result.offsetY)));
                const nextFrameWidth = Math.min(srcW, Math.max(1, Math.round(result.cellWidth * cols)));
                const nextFrameHeight = Math.min(srcH, Math.max(1, Math.round(result.cellHeight * rows)));

                setGridOffsetX(nextOffsetX);
                setGridOffsetY(nextOffsetY);
                setGridFrameWidth(nextFrameWidth);
                setGridFrameHeight(nextFrameHeight);
                setIsSaved(false);
                return result;
            } catch (error) {
                console.error('❌ Snap failed:', error);
                alert(`Snap failed: ${(error as Error).message}`);
                return null;
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
                const sigSize = 8; // 8x8 luma signature, fast and scale-tolerant
                const signatureFromImageData = (img: ImageData) => {
                    const out = new Uint8Array(sigSize * sigSize);
                    const d = img.data;
                    const w = img.width;
                    const h = img.height;
                    let k = 0;
                    for (let yy = 0; yy < sigSize; yy += 1) {
                        const y = Math.max(0, Math.min(h - 1, Math.floor(((yy + 0.5) * h) / sigSize)));
                        for (let xx = 0; xx < sigSize; xx += 1) {
                            const x = Math.max(0, Math.min(w - 1, Math.floor(((xx + 0.5) * w) / sigSize)));
                            const idx = (y * w + x) * 4;
                            const r = d[idx], g = d[idx + 1], b = d[idx + 2];
                            out[k++] = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
                        }
                    }
                    return out;
                };

                const signatureFromRegion = (data: Uint8ClampedArray, imgW: number, imgH: number, x0: number, y0: number, x1: number, y1: number) => {
                    const out = new Uint8Array(sigSize * sigSize);
                    const rw = Math.max(1, x1 - x0);
                    const rh = Math.max(1, y1 - y0);
                    let k = 0;
                    for (let yy = 0; yy < sigSize; yy += 1) {
                        const y = Math.max(0, Math.min(imgH - 1, Math.floor(y0 + ((yy + 0.5) * rh) / sigSize)));
                        const row = y * imgW;
                        for (let xx = 0; xx < sigSize; xx += 1) {
                            const x = Math.max(0, Math.min(imgW - 1, Math.floor(x0 + ((xx + 0.5) * rw) / sigSize)));
                            const idx = (row + x) * 4;
                            const r = data[idx], g = data[idx + 1], b = data[idx + 2];
                            out[k++] = (0.2126 * r + 0.7152 * g + 0.0722 * b) | 0;
                        }
                    }
                    return out;
                };

                const sigDistance = (a: Uint8Array, b: Uint8Array) => {
                    let s = 0;
                    for (let i = 0; i < a.length; i += 1) s += Math.abs(a[i] - b[i]);
                    return s;
                };

                const summarizeSig = (sig: Uint8Array) => {
                    let sum = 0;
                    let sum2 = 0;
                    for (let i = 0; i < sig.length; i += 1) {
                        const v = sig[i];
                        sum += v;
                        sum2 += v * v;
                    }
                    const n = sig.length;
                    const mean = sum / n;
                    const varr = Math.max(0, sum2 / n - mean * mean);
                    return { mean, std: Math.sqrt(varr) };
                };

                const storedRefs = getStoredCellReferences();
                const cacheKey = storedRefs.map((r) => `${r.id}:${r.tileType}:${r.timestamp}`).join('|');
                let refSigs: Array<{ tileType: number; sig: Uint8Array }> = [];
                const cached = referenceSigCacheRef.current;
                if (cached && cached.key === cacheKey && cached.sigSize === sigSize) {
                    refSigs = cached.refs;
                } else {
                    for (const ref of storedRefs) {
                        const img = await loadImageData(ref.imageData);
                        if (!img) continue;
                        refSigs.push({ tileType: ref.tileType, sig: signatureFromImageData(img) });
                    }
                    referenceSigCacheRef.current = { key: cacheKey, sigSize, refs: refSigs };
                }

                if (refSigs.length === 0) {
                    alert('No reference sprites saved yet. Go to References tab and capture/upload a few cell sprites first.');
                    return;
                }

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

                const gridAllVoid = grid.every((row) => row.every((cell) => cell === 5));
                const gridAllFloor = grid.length > 0 && grid.every((row) => row.every((cell) => cell === 0));
                const overwriteAll = gridAllVoid || gridAllFloor;

                // If the grid is clearly a placeholder (all void or all floor), overwrite everything.
                // Otherwise, be conservative and fill only unknown/void cells so we don't overwrite manual fixes.
                const newGrid: number[][] = overwriteAll ? voidGrid(rows, cols) : grid.map((row) => [...row]);
                const totalCells = rows * cols;
                if (totalCells > MAX_AUTO_DETECT_CELLS) {
                    throw new Error(`Unsafe auto-detect size ${rows}x${cols}. Reduce rows/cols or re-run grid detection with cleaner borders.`);
                }
                let processedCells = 0;

                const classifyCellFast = (x0: number, y0: number, x1: number, y1: number): number => {
                    const sig = signatureFromRegion(data, image.width, image.height, x0, y0, x1, y1);
                    const stats = summarizeSig(sig);

                    // Quick void fallback when there's no good reference match.
                    const voidish = stats.mean < 45 && stats.std < 22;

                    let bestType: number | null = null;
                    let bestDist = Infinity;
                    for (const ref of refSigs) {
                        const d = sigDistance(sig, ref.sig);
                        if (d < bestDist) {
                            bestDist = d;
                            bestType = ref.tileType;
                        }
                    }

                    // Convert to similarity in 0..1 range (approx).
                    const similarity = bestType === null ? 0 : 1 - bestDist / (255 * sig.length);
                    const minSimilarity = voidish ? 0.86 : 0.78;
                    if (bestType !== null && similarity >= minSimilarity) return bestType;
                    if (voidish) return 5;
                    return 5; // unknown: leave as void so the user can fill blanks
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

                                if (!overwriteAll && newGrid[r]?.[c] !== 5) {
                                    processedCells++;
                                    continue;
                                }

                                const insetX = Math.min(cellWidth * CELL_SAMPLE_INSET_RATIO, Math.max(1, cellWidth / 4));
                                const insetY = Math.min(cellHeight * CELL_SAMPLE_INSET_RATIO, Math.max(1, cellHeight / 4));
                                const x0 = Math.max(0, Math.min(image.width - 1, Math.floor(gridOffsetX + c * cellWidth + insetX)));
                                const x1 = Math.max(x0 + 1, Math.min(image.width, Math.ceil(gridOffsetX + (c + 1) * cellWidth - insetX)));
                                const y0 = Math.max(0, Math.min(image.height - 1, Math.floor(gridOffsetY + r * cellHeight + insetY)));
                                const y1 = Math.max(y0 + 1, Math.min(image.height, Math.ceil(gridOffsetY + (r + 1) * cellHeight - insetY)));

                                newGrid[r][c] = classifyCellFast(x0, y0, x1, y1);
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
                // Do not auto-crop the grid or image here. Cropping is a separate, explicit action in the editor
                // and auto-cropping can cut off islands if detection misses a few edge tiles.
                setGrid(newGrid);

            } catch (error) {
                console.error('❌ Error in detectCells:', error);
                alert(`Detection failed: ${(error as Error).message}`);
            }
        };

        const detectGridAndCells = () => {
            void detectGrid().then(() => {
                setTimeout(() => { void detectCells(); }, 300);
            });
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

        const setLoadedSnapshot = (snapshot: {
            grid: number[][];
            playerStart: { x: number; y: number } | null;
            theme: ColorTheme | undefined;
            imageURL: string | null;
            overlayEnabled: boolean;
            overlayOpacity: number;
            overlayStretch: boolean;
            zoom: number;
            gridOffsetX: number;
            gridOffsetY: number;
            gridFrameWidth: number | null;
            gridFrameHeight: number | null;
        }) => {
            loadedSnapshotRef.current = {
                ...snapshot,
                grid: snapshot.grid.map((row) => [...row]),
                playerStart: snapshot.playerStart ? { ...snapshot.playerStart } : null,
            };
        };

        const resetToLoadedSnapshot = () => {
            const snapshot = loadedSnapshotRef.current;
            if (!snapshot) {
                alert('No default layout snapshot is available yet for this level.');
                return;
            }

            skipAutoResizeRef.current = true;
            prevSizeRef.current = { rows: snapshot.grid.length, cols: snapshot.grid[0]?.length ?? 0 };
            setRows(snapshot.grid.length);
            setCols(snapshot.grid[0]?.length ?? 0);
            setGrid(snapshot.grid.map((row) => [...row]));
            setPlayerStart(snapshot.playerStart ? { ...snapshot.playerStart } : null);
            setTheme(snapshot.theme);
            setImageURL(snapshot.imageURL);
            setOverlayEnabled(snapshot.overlayEnabled);
            setOverlayOpacity(snapshot.overlayOpacity);
            setOverlayStretch(snapshot.overlayStretch);
            setZoom(snapshot.zoom);
            setGridOffsetX(snapshot.gridOffsetX);
            setGridOffsetY(snapshot.gridOffsetY);
            setGridFrameWidth(snapshot.gridFrameWidth);
            setGridFrameHeight(snapshot.gridFrameHeight);
            setUndoStack([]);
            setRedoStack([]);
            setIsSaved(true);
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
        const value: LevelMapperContextValue = { rows, cols, setRows, setCols, grid, setGrid, activeTile, setActiveTile, playerStart, setPlayerStart, theme, setTheme, imageURL, setImageURL, canvasRef, zoom, setZoom, gridOffsetX, setGridOffsetX, gridOffsetY, setGridOffsetY, gridFrameWidth, setGridFrameWidth, gridFrameHeight, setGridFrameHeight, showGrid, setShowGrid, overlayEnabled, setOverlayEnabled, overlayOpacity, setOverlayOpacity, overlayStretch, setOverlayStretch, allLevels, setAllLevels, compareLevelIndex, setCompareLevelIndex, compareLevel, importLevelIndex, setImportLevelIndex, undo, redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, isSaved, setIsSaved, saveChanges, showUnsavedBanner, detectGrid, snapToLockedCounts, detectCells, detectGridAndCells, useDetectCurrentCounts, setUseDetectCurrentCounts, lastGridDetection, contextMenu, setContextMenu, addMultipleColumns, addMultipleRows, addColumnLeft, addColumnRight, addRowTop, addRowBottom, removeColumnLeft, removeColumnRight, removeRowTop, removeRowBottom, exportTS, jsonInput, setJsonInput, syncJsonInputToGrid, applyJsonInput, setLoadedSnapshot, resetToLoadedSnapshot, pushUndo, replaceGridShape };

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
