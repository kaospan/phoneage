import React, { createContext, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { getAllLevels } from '@/data/levels';
import { TILE_TYPES, emptyGrid, voidGrid, formatGridRowsOneLine, drawGrid } from '@/lib/levelgrid';

// Types
export type BulkContextType = 'column-left' | 'column-right' | 'row-top' | 'row-bottom';

interface LevelMapperContextValue {
    // Dimensions & grid
    rows: number; cols: number; setRows: (r: number) => void; setCols: (c: number) => void;
    grid: number[][]; setGrid: React.Dispatch<React.SetStateAction<number[][]>>;
    activeTile: number; setActiveTile: (id: number) => void;
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
    // Editing helpers
    pushUndo: () => void;
}

const LevelMapperContext = createContext<LevelMapperContextValue | undefined>(undefined);

export const LevelMapperProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [gridOffsetX, setGridOffsetX] = useState(0);
    const [gridOffsetY, setGridOffsetY] = useState(0);
    const [zoom, setZoom] = useState(1);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);
    const isPaintingRef = useRef(false);
    const didPushUndoForPaintRef = useRef(false);
    const [rows, setRows] = useState(11);
    const [cols, setCols] = useState(20);
    const [activeTile, setActiveTile] = useState(0);
    const [grid, setGrid] = useState<number[][]>(() => emptyGrid(11, 20));
    const [allLevels, setAllLevels] = useState(getAllLevels());
    const [compareLevelIndex, setCompareLevelIndex] = useState(1);
    const compareLevel = allLevels[compareLevelIndex];
    const [importLevelIndex, setImportLevelIndex] = useState<number | null>(null);
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

    // Sync JSON preview
    useEffect(() => { setJsonInput(formatGridRowsOneLine(grid)); }, [grid]);

    // beforeunload
    useEffect(() => { const h = (e: BeforeUnloadEvent) => { if (!isSaved) { e.preventDefault(); e.returnValue = ''; } }; window.addEventListener('beforeunload', h); return () => window.removeEventListener('beforeunload', h); }, [isSaved]);
    // Auto hide unsaved banner
    useEffect(() => { if (!isSaved) { setShowUnsavedBanner(true); const t = setTimeout(() => setShowUnsavedBanner(false), 4000); return () => clearTimeout(t); } else { setShowUnsavedBanner(true); } }, [isSaved]);

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
                if (srcR >= 0 && srcR < prevRows && srcC >= 0 && srcC < prevCols) return prevGrid[srcR][srcC];
                return 5;
            });
        });
        setUndoStack(s => [...s, prevGrid.map(row => [...row])]); setRedoStack([]); setIsSaved(false); setGrid(newGrid); prevSizeRef.current = { rows, cols };
    }, [rows, cols]);

    // Canvas draw when image changes
    useEffect(() => {
        const canvas = canvasRef.current; if (!canvas || !imageURL) return; const ctx = canvas.getContext('2d'); if (!ctx) return;
        const img = new Image(); img.src = imageURL; img.onload = () => { const maxW = Math.min(window.innerWidth - 24, 900); const scale = Math.min(1, maxW / img.naturalWidth); canvas.width = Math.floor(img.naturalWidth * scale); canvas.height = Math.floor(img.naturalHeight * scale); ctx.clearRect(0, 0, canvas.width, canvas.height); ctx.drawImage(img, 0, 0, canvas.width, canvas.height); if (showGrid) { ctx.save(); ctx.translate(gridOffsetX, gridOffsetY); drawGrid(ctx, canvas.width, canvas.height, rows, cols, gridOffsetX, gridOffsetY); ctx.restore(); } };
    }, [imageURL, rows, cols, showGrid, gridOffsetX, gridOffsetY]);

    const addColumnLeft = () => { setGrid(g => { const snap = g.map(r => [...r]); setUndoStack(s => [...s, snap]); setRedoStack([]); setIsSaved(false); const newG = g.map(r => [5, ...r]); skipAutoResizeRef.current = true; setCols(g[0]?.length + 1); prevSizeRef.current = { rows, cols: (g[0]?.length || 0) + 1 }; return newG; }); };
    const addColumnRight = () => { setGrid(g => { const snap = g.map(r => [...r]); setUndoStack(s => [...s, snap]); setRedoStack([]); setIsSaved(false); const newG = g.map(r => [...r, 5]); skipAutoResizeRef.current = true; setCols(g[0]?.length + 1); prevSizeRef.current = { rows, cols: (g[0]?.length || 0) + 1 }; return newG; }); };
    const addRowTop = () => { setGrid(g => { const snap = g.map(r => [...r]); setUndoStack(s => [...s, snap]); setRedoStack([]); setIsSaved(false); const width = g[0]?.length || cols; const newRow = Array.from({ length: width }, () => 5); const newG = [newRow, ...g.map(r => [...r])]; skipAutoResizeRef.current = true; setRows(g.length + 1); prevSizeRef.current = { rows: g.length + 1, cols }; return newG; }); };
    const addRowBottom = () => { setGrid(g => { const snap = g.map(r => [...r]); setUndoStack(s => [...s, snap]); setRedoStack([]); setIsSaved(false); const width = g[0]?.length || cols; const newRow = Array.from({ length: width }, () => 5); const newG = [...g.map(r => [...r]), newRow]; skipAutoResizeRef.current = true; setRows(g.length + 1); prevSizeRef.current = { rows: g.length + 1, cols }; return newG; }); };

    const addMultipleColumns = (side: 'left' | 'right', count: number) => { setGrid(g => { const snap = g.map(r => [...r]); setUndoStack(s => [...s, snap]); setRedoStack([]); setIsSaved(false); const voidCols = Array(count).fill(5); const newG = side === 'left' ? g.map(r => [...voidCols, ...r]) : g.map(r => [...r, ...voidCols]); skipAutoResizeRef.current = true; setCols((g[0]?.length || 0) + count); prevSizeRef.current = { rows, cols: (g[0]?.length || 0) + count }; return newG; }); };
    const addMultipleRows = (side: 'top' | 'bottom', count: number) => { setGrid(g => { const snap = g.map(r => [...r]); setUndoStack(s => [...s, snap]); setRedoStack([]); setIsSaved(false); const width = g[0]?.length || cols; const newRows = Array.from({ length: count }, () => Array.from({ length: width }, () => 5)); const newG = side === 'top' ? [...newRows, ...g.map(r => [...r])] : [...g.map(r => [...r]), ...newRows]; skipAutoResizeRef.current = true; setRows(g.length + count); prevSizeRef.current = { rows: g.length + count, cols }; return newG; }); };

    const undo = () => { if (undoStack.length === 0) return; setRedoStack(s => [...s, grid.map(r => [...r])]); const prev = undoStack[undoStack.length - 1]; setGrid(prev.map(r => [...r])); setUndoStack(s => s.slice(0, -1)); setIsSaved(false); };
    const redo = () => { if (redoStack.length === 0) return; setUndoStack(s => [...s, grid.map(r => [...r])]); const next = redoStack[redoStack.length - 1]; setGrid(next.map(r => [...r])); setRedoStack(s => s.slice(0, -1)); setIsSaved(false); };

    const detectGrid = () => {
        const canvas = canvasRef.current; if (!canvas) return; const ctx = canvas.getContext('2d'); if (!ctx) return; const { width, height } = canvas; const imgData = ctx.getImageData(0, 0, width, height).data; const horizontalScores: number[] = []; const verticalScores: number[] = []; const threshold = 180; for (let y = 0; y < height; y++) { let score = 0; for (let x = 0; x < width; x += 2) { const i = (y * width + x) * 4; const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2]; if (r > threshold && g > threshold && b > threshold) score++; } horizontalScores[y] = score; } for (let x = 0; x < width; x++) { let score = 0; for (let y = 0; y < height; y += 2) { const i = (y * width + x) * 4; const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2]; if (r > threshold && g > threshold && b > threshold) score++; } verticalScores[x] = score; }
        const findPeaks = (scores: number[], minSpacing: number) => { const peaks: { pos: number; score: number }[] = []; for (let i = 1; i < scores.length - 1; i++) { if (scores[i] > scores[i - 1] && scores[i] > scores[i + 1]) peaks.push({ pos: i, score: scores[i] }); } peaks.sort((a, b) => b.score - a.score); const filtered: number[] = []; for (const peak of peaks) { const tooClose = filtered.some(pos => Math.abs(pos - peak.pos) < minSpacing); if (!tooClose) filtered.push(peak.pos); } filtered.sort((a, b) => a - b); return filtered; };
        const minSpacing = 15; const hLines = findPeaks(horizontalScores, minSpacing); const vLines = findPeaks(verticalScores, minSpacing); if (hLines.length >= 2 && vLines.length >= 2) { const detectedRows = hLines.length - 1; const detectedCols = vLines.length - 1; const finalRows = useDetectCurrentCounts ? rows : detectedRows; const finalCols = useDetectCurrentCounts ? cols : detectedCols; setRows(finalRows); setCols(finalCols); setGrid(emptyGrid(finalRows, finalCols)); } else { alert('Grid detection failed (not enough line candidates).'); }
    };

    const detectCells = () => {
        const canvas = canvasRef.current; if (!canvas) { alert('No canvas'); return; }
        const ctx = canvas.getContext('2d'); if (!ctx) { alert('No context'); return; }
        const { width: cw, height: ch } = canvas;
        const img = ctx.getImageData(0, 0, cw, ch).data;

        // Enhanced pattern-based classifier: distinguishes all tile types
        const classifyCell = (x0: number, y0: number, x1: number, y1: number, r: number, c: number): number => {
            // Sample area (skip 25% borders to avoid grid lines)
            const mx0 = Math.floor(x0 + (x1 - x0) * 0.25);
            const mx1 = Math.floor(x1 - (x1 - x0) * 0.25);
            const my0 = Math.floor(y0 + (y1 - y0) * 0.25);
            const my1 = Math.floor(y1 - (y1 - y0) * 0.25);

            if (mx1 <= mx0 + 2 || my1 <= my0 + 2) return 5;

            // Collect pixel data with directional analysis
            let sr = 0, sg = 0, sb = 0, cnt = 0;
            let minBrightness = 255, maxBrightness = 0;
            let darkPixels = 0, lightPixels = 0, midPixels = 0;
            let brownishPixels = 0, tanPixels = 0, grayishPixels = 0;
            let greenPixels = 0, bluePixels = 0, redPixels = 0, yellowPixels = 0, purplePixels = 0, orangePixels = 0;

            // Enhanced directional density for arrow detection (fine-grained quadrants + strips)
            let topDense = 0, bottomDense = 0, leftDense = 0, rightDense = 0;
            let centerDense = 0, edgeDense = 0; // Center vs edge for omni arrows
            let topStripDark = 0, bottomStripDark = 0, leftStripDark = 0, rightStripDark = 0; // Edge strips
            const midY = (my0 + my1) / 2, midX = (mx0 + mx1) / 2;
            const cellWidth = mx1 - mx0, cellHeight = my1 - my0;
            const stripThreshold = 0.25; // 25% strips on edges

            for (let y = my0; y < my1; y += 2) {
                for (let x = mx0; x < mx1; x += 2) {
                    const idx = (y * cw + x) * 4;
                    const r = img[idx], g = img[idx + 1], b = img[idx + 2];
                    sr += r; sg += g; sb += b; cnt++;

                    const brightness = (r + g + b) / 3;
                    minBrightness = Math.min(minBrightness, brightness);
                    maxBrightness = Math.max(maxBrightness, brightness);

                    if (brightness < 80) darkPixels++;
                    else if (brightness > 180) lightPixels++;
                    else midPixels++;

                    // Calculate relative position (0 to 1)
                    const relY = (y - my0) / cellHeight;
                    const relX = (x - mx0) / cellWidth;

                    // Directional density (for arrow patterns) - dark pixels only
                    const isDark = brightness < 150;
                    if (isDark) {
                        if (y < midY) topDense++;
                        if (y > midY) bottomDense++;
                        if (x < midX) leftDense++;
                        if (x > midX) rightDense++;

                        // Center vs edge detection for omni arrows
                        const distFromCenterY = Math.abs(relY - 0.5);
                        const distFromCenterX = Math.abs(relX - 0.5);
                        if (distFromCenterY < 0.3 && distFromCenterX < 0.3) {
                            centerDense++;
                        } else {
                            edgeDense++;
                        }

                        // Edge strip detection for arrow tips
                        if (relY < stripThreshold) topStripDark++;
                        if (relY > 1 - stripThreshold) bottomStripDark++;
                        if (relX < stripThreshold) leftStripDark++;
                        if (relX > 1 - stripThreshold) rightStripDark++;
                    }

                    const rg_diff = Math.abs(r - g), rb_diff = Math.abs(r - b), gb_diff = Math.abs(g - b);

                    // Color family detection
                    if (r > g && r > b && r < 180 && g > 60 && gb_diff < 80) brownishPixels++;
                    else if (r > 150 && g > 120 && b > 80 && rg_diff < 50 && rb_diff < 100) tanPixels++;
                    else if (rg_diff < 40 && rb_diff < 40 && gb_diff < 40 && brightness < 120) grayishPixels++;

                    // Distinct color detection for arrows/cave
                    if (g > r * 1.2 && g > b * 1.2 && g > 100) greenPixels++; // Cave (green)
                    else if (b > r * 1.2 && b > g && b > 100) bluePixels++; // Blue arrows
                    else if (r > g * 1.3 && r > b * 1.3 && r > 120) redPixels++; // Red arrow
                    else if (r > 180 && g > 160 && b < 100 && rg_diff < 60) yellowPixels++; // Yellow arrow
                    else if (r > 100 && b > 100 && g < r * 0.8 && g < b * 0.8) purplePixels++; // Purple arrow
                    else if (r > 200 && g > 100 && g < 180 && b < 100) orangePixels++; // Orange arrow
                }
            }

            if (!cnt) return 5;

            const avgR = sr / cnt, avgG = sg / cnt, avgB = sb / cnt;
            const avgBrightness = (avgR + avgG + avgB) / 3;
            const brightnessVariance = maxBrightness - minBrightness;

            // Calculate directional bias (for arrows) - enhanced pattern detection
            const totalDense = topDense + bottomDense + leftDense + rightDense;
            const verticalBias = totalDense > 0 ? Math.abs(topDense - bottomDense) / totalDense : 0;
            const horizontalBias = totalDense > 0 ? Math.abs(leftDense - rightDense) / totalDense : 0;

            // Edge strip analysis for arrow detection (tips of arrows)
            const topStripRatio = darkPixels > 0 ? topStripDark / darkPixels : 0;
            const bottomStripRatio = darkPixels > 0 ? bottomStripDark / darkPixels : 0;
            const leftStripRatio = darkPixels > 0 ? leftStripDark / darkPixels : 0;
            const rightStripRatio = darkPixels > 0 ? rightStripDark / darkPixels : 0;

            // Omni arrow detection: center dense with arrows pointing outward
            const omniPattern = edgeDense > centerDense * 0.8 && totalDense > cnt * 0.2;

            // Check if this cell is on the perimeter (adjacent to edge of grid)
            const isPerimeter = r === 0 || c === 0 || r === rows - 1 || c === cols - 1;

            // PATTERN RECOGNITION RULES (prioritized)

            // Rule 0: VOID - BLACK TILES (check FIRST before anything else)
            // Pure black or very dark with no variance = void
            if (avgBrightness < 50 || (avgBrightness < 70 && brightnessVariance < 40)) {
                return 5; // Void (black)
            }

            // Rule 0.5: PERIMETER STONE - cells on map edge adjacent to void are likely stone border
            // Check if it looks like stone (brown, textured) and is on perimeter
            if (isPerimeter && brownishPixels > cnt * 0.25 && brightnessVariance > 50 && avgBrightness > 70 && avgBrightness < 160) {
                return 2; // Perimeter stone (don't confuse with omni arrows)
            }

            // Rule 1: Cave entrance (BLACK with GREEN LINES - dark base with green accents)
            if (greenPixels > cnt * 0.2 && avgBrightness < 100 && avgG > avgR && avgG > avgB) {
                return 3; // Cave (black with green lines)
            }

            // Pre-calculate colored pixels for arrow detection
            const hasColoredPixels = bluePixels + greenPixels + redPixels + yellowPixels + purplePixels + orangePixels > cnt * 0.1;

            // Rule 2: OMNI-DIRECTIONAL ARROWS (require VERY STRONG pattern to avoid stone misdetection)
            // Must have clear edge distribution to all 4 sides AND center point
            // SKIP if on perimeter (already handled above)
            // REQUIRE colored pixels or extreme pattern to distinguish from stone
            if (!isPerimeter && omniPattern && brightnessVariance > 100) {
                const edgeBalance = Math.min(topStripRatio, bottomStripRatio, leftStripRatio, rightStripRatio);
                const allEdgesActive = topStripDark > 0 && bottomStripDark > 0 && leftStripDark > 0 && rightStripDark > 0;
                const hasStrongBalance = edgeBalance > 0.15; // Increased from 0.12
                const hasVeryHighVariance = brightnessVariance > 120; // Increased from 100

                // MUST have colored pixels OR extreme variance/balance to avoid stone misclassification
                if (allEdgesActive && (hasColoredPixels || (hasStrongBalance && hasVeryHighVariance))) {
                    return 13; // Omni arrow (all directions)
                }
            }

            // Rule 3: UP-DOWN ARROWS (vertical bias with darkness at both top and bottom)
            if (verticalBias > 0.15 && topStripDark > 0 && bottomStripDark > 0) {
                const verticalRatio = (topStripDark + bottomStripDark) / darkPixels;
                if (verticalRatio > 0.35) {
                    return 11; // Up-down arrow (vertical)
                }
            }

            // Rule 4: LEFT-RIGHT ARROWS (horizontal bias with darkness at both sides)
            if (horizontalBias > 0.15 && leftStripDark > 0 && rightStripDark > 0) {
                const horizontalRatio = (leftStripDark + rightStripDark) / darkPixels;
                if (horizontalRatio > 0.35) {
                    return 12; // Left-right arrow (horizontal)
                }
            }

            // Rule 5: Single-direction arrows by dominant edge strip
            if (totalDense > cnt * 0.2 && brightnessVariance > 70) {
                const maxStripRatio = Math.max(topStripRatio, bottomStripRatio, leftStripRatio, rightStripRatio);
                if (maxStripRatio > 0.25) {
                    if (topStripRatio === maxStripRatio && topStripRatio > bottomStripRatio * 1.5) return 7; // Arrow up
                    if (bottomStripRatio === maxStripRatio && bottomStripRatio > topStripRatio * 1.5) return 9; // Arrow down
                    if (leftStripRatio === maxStripRatio && leftStripRatio > rightStripRatio * 1.5) return 10; // Arrow left
                    if (rightStripRatio === maxStripRatio && rightStripRatio > leftStripRatio * 1.5) return 8; // Arrow right
                }
            }

            // Rule 6: Color-based arrow detection (when colors are distinct)
            // SKIP if has white highlights - that's stone with diagonal gradient, not arrow
            const hasWhiteHighlights = lightPixels > cnt * 0.15 && maxBrightness > 200;

            if (hasColoredPixels && !hasWhiteHighlights) {
                // Blue arrows (up or up-down)
                if (bluePixels > cnt * 0.12 && verticalBias > 0.15) {
                    return topDense > bottomDense ? 7 : 9;
                }
                // Green arrow (right)
                if (greenPixels > cnt * 0.12 && horizontalBias > 0.15 && rightDense > leftDense) {
                    return 8;
                }
                // Red arrow (left) - MUST have strong left bias, not just red shading
                if (redPixels > cnt * 0.15 && horizontalBias > 0.25 && leftDense > rightDense * 1.5) {
                    return 10;
                }
                // Yellow arrow (down)
                if (yellowPixels > cnt * 0.12 && verticalBias > 0.15 && bottomDense > topDense) {
                    return 9;
                }
                // Orange arrow - MUST have strong pattern, not just orange shading on stone
                if (orangePixels > cnt * 0.15 && (verticalBias > 0.25 || horizontalBias > 0.25)) {
                    // Only if clear directional arrow, not diagonal gradient
                    if (verticalBias < 0.15 && horizontalBias < 0.15) {
                        return 13; // Omni only if balanced
                    }
                }
            }

            // Rule 7: Stone (DIAGONAL GRADIENT: white→brown→red/orange flames)
            // Stone tiles have diagonal shading from light (left) to dark/fire (right)
            // NOT arrows! Just 3D shading effect
            const hasLightHighlights = lightPixels > cnt * 0.15; // 15%+ bright/white pixels
            const hasDiagonalGradient = hasLightHighlights && (brownishPixels > cnt * 0.15 || tanPixels > cnt * 0.15);
            const hasRedOrangeShading = redPixels > cnt * 0.1 || orangePixels > cnt * 0.1; // Fire/shadow colors

            // Stone detection: diagonal gradient with light→brown→fire pattern
            if (brightnessVariance > 70 && maxBrightness > 200) {
                // Has white highlights AND brown base AND high variance = stone with diagonal shading
                if (hasDiagonalGradient) {
                    return 2; // Stone (diagonal gradient: light to dark/fire)
                }
                // OR has light highlights + red/orange shading (fire effect on stone)
                if (hasLightHighlights && hasRedOrangeShading && (brownishPixels > cnt * 0.1 || tanPixels > cnt * 0.1)) {
                    return 2; // Stone (with fire/flame shading)
                }
            }

            // Rule 8: Floor (TAN/LIGHT BROWN - uniform, no 3D shading)
            // Tan tiles with LOW variance = flat floor
            if ((tanPixels > cnt * 0.2 || brownishPixels > cnt * 0.15) && brightnessVariance < 70) {
                return 0; // Floor (tan, uniform)
            }

            // Rule 9: DISABLED - Generic arrow fallback was causing false positives
            // Only detect arrows with specific color patterns (handled above in Rule 6)

            // Rule 9: Breakable blocks (cracked appearance, medium variance)
            if (brightnessVariance > 80 && brightnessVariance < 150 && avgBrightness > 80 && avgBrightness < 140 && !hasColoredPixels) {
                return 6; // Breakable
            }

            // Rule 10: Void (uniform gray - not pure black, already handled)
            if (grayishPixels > cnt * 0.6 && avgBrightness < 100) {
                return 5;
            }

            // Rule 11: Stone fallback (brown/textured with medium brightness)
            if ((brownishPixels > cnt * 0.15 || tanPixels > cnt * 0.15) && avgBrightness > 70 && avgBrightness < 160) {
                return 2; // Stone
            }

            // Rule 12: Floor fallback (tan/beige tones, bright)
            if (tanPixels > cnt * 0.2 || (avgBrightness > 120 && avgBrightness < 220 && avgR > avgG && avgG > avgB * 0.8)) {
                return 0; // Floor
            }

            // Rule 13: Very bright (grid artifacts or light floor)
            if (avgBrightness > 220 || lightPixels > cnt * 0.7) {
                return 0;
            }

            // Rule 10: Dominant dark pixels with variance → Stone (shaded)
            if (darkPixels > cnt * 0.4 && brightnessVariance > 60 && avgBrightness < 120) {
                return 2;
            }

            // Default fallback by brightness and texture
            if (avgBrightness > 120 && brightnessVariance < 80) return 0; // Floor (smooth tan)
            else if (brightnessVariance > 60 && avgBrightness > 80) return 2; // Stone (textured)
            else if (avgBrightness > 80) return 0; // Bright = floor
            else return 5; // Dark = void
        };

        const newGrid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                const x0 = Math.max(0, Math.min(cw - 1, Math.floor((c * cw) / cols + gridOffsetX)));
                const x1 = Math.max(0, Math.min(cw, Math.floor(((c + 1) * cw) / cols + gridOffsetX)));
                const y0 = Math.max(0, Math.min(ch - 1, Math.floor((r * ch) / rows + gridOffsetY)));
                const y1 = Math.max(0, Math.min(ch, Math.floor(((r + 1) * ch) / rows + gridOffsetY)));

                newGrid[r][c] = classifyCell(x0, y0, x1, y1, r, c);
            }
        }
        setUndoStack(s => [...s, grid.map(row => [...row])]);
        setRedoStack([]);
        setIsSaved(false);
        setGrid(newGrid);
    };

    const detectGridAndCells = () => { detectGrid(); setTimeout(() => detectCells(), 0); };

    const exportTS = () => { const txt = JSON.stringify(grid); navigator.clipboard.writeText(txt).catch(() => { }); alert('Grid copied to clipboard as JSON'); };
    const saveChanges = () => { if (importLevelIndex !== null) { const lvl = allLevels[importLevelIndex]; if (lvl) { localStorage.setItem(`level_override_${lvl.id}`, JSON.stringify(grid)); } } localStorage.setItem('levelmapper_grid', JSON.stringify(grid)); setIsSaved(true); setAllLevels(getAllLevels()); alert('Changes saved!'); };

    const pushUndo = () => { setUndoStack(s => [...s, grid.map(r => [...r])]); setRedoStack([]); setIsSaved(false); };

    const value: LevelMapperContextValue = { rows, cols, setRows, setCols, grid, setGrid, activeTile, setActiveTile, imageURL, setImageURL, canvasRef, zoom, setZoom, gridOffsetX, setGridOffsetX, gridOffsetY, setGridOffsetY, showGrid, setShowGrid, overlayEnabled, setOverlayEnabled, overlayOpacity, setOverlayOpacity, overlayStretch, setOverlayStretch, allLevels, setAllLevels, compareLevelIndex, setCompareLevelIndex, compareLevel, importLevelIndex, setImportLevelIndex, undo, redo, canUndo: undoStack.length > 0, canRedo: redoStack.length > 0, isSaved, setIsSaved, saveChanges, showUnsavedBanner, detectGrid, detectCells, detectGridAndCells, useDetectCurrentCounts, setUseDetectCurrentCounts, contextMenu, setContextMenu, addMultipleColumns, addMultipleRows, addColumnLeft, addColumnRight, addRowTop, addRowBottom, exportTS, pushUndo };

    return <LevelMapperContext.Provider value={value}>{children}</LevelMapperContext.Provider>;
};

export const useLevelMapper = () => { const ctx = useContext(LevelMapperContext); if (!ctx) throw new Error('useLevelMapper must be used inside LevelMapperProvider'); return ctx; };
