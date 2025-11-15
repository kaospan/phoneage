import React, { useEffect, useMemo, useRef, useState } from "react";
import { levels as allLevels } from "@/data/levels";
import { Button } from "@/components/ui/button";

// Basic tile palette
const TILE_TYPES = [
    { id: 0, name: "Floor (0)", color: "#c9a876" },
    { id: 1, name: "Fire/Wall (1)", color: "#a67c52" },
    { id: 2, name: "Stone (2)", color: "#6b4423" },
    { id: 3, name: "Cave (3)", color: "#6ab82e" },
    { id: 4, name: "Water (4)", color: "#1e90ff" },
    { id: 5, name: "Void (5)", color: "#3a3a3a" },
    { id: 6, name: "Breakable (6)", color: "#4a9eff" },
    { id: 7, name: "Arrow Up (7)", color: "#1976d2" },         // blue
    { id: 8, name: "Arrow Right (8)", color: "#43a047" },      // green
    { id: 9, name: "Arrow Down (9)", color: "#fbc02d" },      // yellow
    { id: 10, name: "Arrow Left (10)", color: "#d32f2f" },    // red
    { id: 11, name: "Arrow Up/Down (11)", color: "#7b1fa2" }, // purple
    { id: 12, name: "Arrow Left/Right (12)", color: "#00838f" }, // teal
    { id: 13, name: "Arrow Omni (13)", color: "#ff9800" },    // orange
];

const emptyGrid = (rows: number, cols: number) => Array.from({ length: rows }, () => Array(cols).fill(0));

export const LevelMapper: React.FC = () => {
    const [gridOffsetX, setGridOffsetX] = useState(0);
    const [gridOffsetY, setGridOffsetY] = useState(0);
    const [leftPanelWidth, setLeftPanelWidth] = useState(400);
    const leftPanelMin = 280;
    const leftPanelMax = 800;
    const isResizingRef = useRef(false);

    // Handle mouse drag for resizing
    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!isResizingRef.current) return;
            let newWidth = e.clientX - 32; // 32px padding
            newWidth = Math.max(leftPanelMin, Math.min(leftPanelMax, newWidth));
            setLeftPanelWidth(newWidth);
        };
        const onMouseUp = () => {
            isResizingRef.current = false;
        };
        window.addEventListener('mousemove', onMouseMove);
        window.addEventListener('mouseup', onMouseUp);
        return () => {
            window.removeEventListener('mousemove', onMouseMove);
            window.removeEventListener('mouseup', onMouseUp);
        };
    }, []);
    // Removed paletteSize and legend size slider
    const [zoom, setZoom] = useState(1);
    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const imgRef = useRef<HTMLImageElement | null>(null);
    const canvasRef = useRef<HTMLCanvasElement | null>(null);

    const [rows, setRows] = useState(12);
    const [cols, setCols] = useState(20);
    const [activeTile, setActiveTile] = useState<number>(0);
    const [grid, setGrid] = useState<number[][]>(() => emptyGrid(9, 13));
    const [compareLevelIndex, setCompareLevelIndex] = useState(1); // default compare level index (Level 2)
    const compareLevel = allLevels[compareLevelIndex];
    const [importLevelIndex, setImportLevelIndex] = useState<number | null>(null);

    const [imageURL, setImageURL] = useState<string | null>(null);
    const [showGrid, setShowGrid] = useState(true);

    const cellW = useMemo(() => (canvasRef.current ? canvasRef.current.width / cols : 0), [cols]);
    const cellH = useMemo(() => (canvasRef.current ? canvasRef.current.height / rows : 0), [rows]);

    // Resize canvas to image
    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas || !imageURL) return;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Create an image object and draw it to canvas when loaded
        const img = new window.Image();
        img.src = imageURL;
        img.onload = () => {
            const maxW = Math.min(window.innerWidth - 24, 900);
            const scale = Math.min(1, maxW / img.naturalWidth);
            canvas.width = Math.floor(img.naturalWidth * scale);
            canvas.height = Math.floor(img.naturalHeight * scale);
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            if (showGrid) {
                ctx.save();
                ctx.translate(gridOffsetX, gridOffsetY);
                drawGrid(ctx, canvas.width, canvas.height, rows, cols);
                ctx.restore();
            }
        };
    }, [imageURL, rows, cols, showGrid, gridOffsetX, gridOffsetY]);

    const drawGrid = (ctx: CanvasRenderingContext2D, w: number, h: number, r: number, c: number) => {
        ctx.save();
        ctx.strokeStyle = "rgba(255,255,255,0.6)";
        ctx.lineWidth = 1;
        for (let y = 0; y <= r; y++) {
            const py = Math.round((y * h) / r) + 0.5;
            ctx.beginPath();
            ctx.moveTo(0, py);
            ctx.lineTo(w, py);
            ctx.stroke();
        }
        for (let x = 0; x <= c; x++) {
            const px = Math.round((x * w) / c) + 0.5;
            ctx.beginPath();
            ctx.moveTo(px, 0);
            ctx.lineTo(px, h);
            ctx.stroke();
        }
        ctx.restore();
    };

    const onCanvasClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const c = Math.floor((x / canvas.width) * cols);
        const r = Math.floor((y / canvas.height) * rows);
        setGrid(g => {
            const ng = g.map(row => [...row]);
            if (ng[r] && typeof ng[r][c] !== "undefined") ng[r][c] = activeTile;
            return ng;
        });
    };

    const importLevel = (idx: number) => {
        const lvl = allLevels[idx];
        if (!lvl) return;
        const g = lvl.grid.map(row => row.slice());
        setRows(g.length);
        setCols(g[0]?.length || 0);
        setGrid(g);
    };

    // --- Grid detection from screenshot ---
    const detectGrid = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        const { width, height } = canvas;
        const imgData = ctx.getImageData(0, 0, width, height).data;

        // Scan for grid lines by counting light pixels along each row/column
        const horizontalScores: number[] = [];
        const verticalScores: number[] = [];

        // Lower threshold, allow for light gray grid lines
        const threshold = 180;

        for (let y = 0; y < height; y++) {
            let score = 0;
            for (let x = 0; x < width; x += 2) {
                const i = (y * width + x) * 4;
                const r = imgData[i];
                const g = imgData[i + 1];
                const b = imgData[i + 2];
                // count as grid line if pixel is light (not just pure white)
                if (r > threshold && g > threshold && b > threshold) score++;
            }
            horizontalScores[y] = score;
        }
        for (let x = 0; x < width; x++) {
            let score = 0;
            for (let y = 0; y < height; y += 2) {
                const i = (y * width + x) * 4;
                const r = imgData[i];
                const g = imgData[i + 1];
                const b = imgData[i + 2];
                if (r > threshold && g > threshold && b > threshold) score++;
            }
            verticalScores[x] = score;
        }

        // Find local maxima (peaks) - more robust than threshold
        const findPeaks = (scores: number[], minSpacing: number) => {
            const peaks: { pos: number; score: number }[] = [];
            for (let i = 1; i < scores.length - 1; i++) {
                // A peak is higher than both neighbors
                if (scores[i] > scores[i - 1] && scores[i] > scores[i + 1]) {
                    peaks.push({ pos: i, score: scores[i] });
                }
            }
            // Sort by score descending
            peaks.sort((a, b) => b.score - a.score);

            // Filter: keep strongest peaks with minimum spacing
            const filtered: number[] = [];
            for (const peak of peaks) {
                const tooClose = filtered.some(pos => Math.abs(pos - peak.pos) < minSpacing);
                if (!tooClose) {
                    filtered.push(peak.pos);
                }
            }
            // Sort by position for grid construction
            filtered.sort((a, b) => a - b);
            return filtered;
        };

        const minSpacing = 15; // Minimum pixel spacing between grid lines
        const hLines = findPeaks(horizontalScores, minSpacing);
        const vLines = findPeaks(verticalScores, minSpacing);

        // Derive rows/cols from line counts (lines = cells+1 typically)
        if (hLines.length >= 2 && vLines.length >= 2) {
            // hLines = horizontal grid lines (Y axis) => rows
            // vLines = vertical grid lines (X axis) => columns
            const detectedRows = hLines.length - 1;
            const detectedCols = vLines.length - 1;
            setRows(detectedRows);
            setCols(detectedCols);
            setGrid(emptyGrid(detectedRows, detectedCols));
        } else {
            alert('Grid detection failed (not enough line candidates).');
        }
    };

    const differences = useMemo(() => {
        const ref = compareLevel?.grid || [];
        const diffs: { r: number; c: number }[] = [];
        for (let r = 0; r < Math.max(ref.length, grid.length); r++) {
            for (let c = 0; c < Math.max(ref[0]?.length || 0, grid[0]?.length || 0); c++) {
                const a = ref[r]?.[c];
                const b = grid[r]?.[c];
                if (a !== b) diffs.push({ r, c });
            }
        }
        return diffs;
    }, [grid, compareLevel]);

    const exportTS = () => {
        const txt = JSON.stringify(grid);
        navigator.clipboard.writeText(txt).catch(() => { });
        alert("Grid copied to clipboard as JSON");
    };

    return (
        <div className="w-full min-h-screen p-2 md:p-4 bg-background text-foreground">
            <div className="w-full mx-auto flex gap-3">
                {/* Left: Screenshot + overlay */}
                <div
                    className="bg-card rounded border p-2 relative"
                    style={{ width: leftPanelWidth, minWidth: leftPanelMin, maxWidth: leftPanelMax }}
                >
                    <div className="flex items-center gap-2 flex-wrap">
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept="image/*"
                            onChange={(e) => {
                                const f = e.target.files?.[0];
                                if (!f) return;
                                const url = URL.createObjectURL(f);
                                setImageURL(url);
                                setRows(12);
                                setCols(20);
                                setGrid(emptyGrid(12, 20));
                            }}
                        />
                        <label className="text-xs text-muted-foreground">Rows</label>
                        <input
                            className="w-16 px-2 py-1 rounded border bg-background"
                            type="number"
                            min={1}
                            value={rows}
                            onChange={(e) => setRows(parseInt(e.target.value || "1", 10))}
                        />
                        <label className="text-xs text-muted-foreground">Cols</label>
                        <input
                            className="w-16 px-2 py-1 rounded border bg-background"
                            type="number"
                            min={1}
                            value={cols}
                            onChange={(e) => setCols(parseInt(e.target.value || "1", 10))}
                        />
                        <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid
                        </label>
                        <select
                            className="px-2 py-1 rounded border bg-background text-xs"
                            value={importLevelIndex ?? ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') return;
                                const idx = parseInt(val, 10);
                                setImportLevelIndex(idx);
                                importLevel(idx);
                            }}
                        >
                            <option value="">Import level...</option>
                            {allLevels.map((lvl, idx) => (
                                <option key={lvl.id} value={idx}>Load Level {lvl.id}</option>
                            ))}
                        </select>
                        <Button size="sm" variant="secondary" onClick={detectGrid}>Detect Grid</Button>
                    </div>
                    <div className="mt-2 relative">
                        {imageURL ? (
                            <>
                                {/* Only show canvas, not <img> */}
                                <div className="flex flex-wrap gap-2 my-2 items-center">
                                    <label className="text-xs">Zoom</label>
                                    <input type="range" min={0.5} max={2} step={0.05} value={zoom} onChange={e => setZoom(Number(e.target.value))} />
                                    <span className="text-xs">{zoom}x</span>
                                    <label className="text-xs ml-4">Grid Offset X</label>
                                    <input type="number" className="w-16 px-2 py-1 rounded border bg-background" value={gridOffsetX} onChange={e => setGridOffsetX(Number(e.target.value))} />
                                    <label className="text-xs ml-2">Grid Offset Y</label>
                                    <input type="number" className="w-16 px-2 py-1 rounded border bg-background" value={gridOffsetY} onChange={e => setGridOffsetY(Number(e.target.value))} />
                                </div>
                                <canvas ref={canvasRef} style={{ width: `${zoom * 100}%`, height: 'auto' }} className="border rounded" onClick={onCanvasClick} />
                            </>
                        ) : (
                            <div className="text-sm text-muted-foreground p-6 border rounded">
                                Upload a screenshot (PNG/JPG). Then click cells to set tile types.
                            </div>
                        )}
                    </div>

                    {/* Palette without legend size slider */}
                    <div className="mt-3">
                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2">
                            {TILE_TYPES.map(t => (
                                <button
                                    key={t.id}
                                    onClick={() => setActiveTile(t.id)}
                                    className={`flex items-center gap-2 px-2 py-1 rounded border text-xs ${activeTile === t.id ? "ring-2 ring-primary" : ""}`}
                                    title={t.name}
                                >
                                    <span
                                        className="inline-block rounded w-6 h-6"
                                        style={{ background: t.color }}
                                    />
                                    {t.name}
                                </button>
                            ))}
                        </div>
                    </div>
                    {/* Drag handle for resizing */}
                    <div
                        style={{ position: 'absolute', top: 0, right: -8, width: 16, height: '100%', cursor: 'ew-resize', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                        onMouseDown={() => { isResizingRef.current = true; }}
                        title="Resize horizontally"
                    >
                        <span style={{ fontSize: 18, color: '#aaa', userSelect: 'none' }}>&#8596;</span>
                    </div>
                </div>

                {/* Right: Grid editor + compare */}
                <div className="bg-card rounded border p-2 flex-1">
                    <div className="flex items-center justify-between gap-2">
                        <div className="text-sm font-medium">Grid Editor</div>
                        <div className="flex items-center gap-2">
                            <select
                                className="px-2 py-1 rounded border bg-background text-sm"
                                value={compareLevelIndex}
                                onChange={(e) => setCompareLevelIndex(parseInt(e.target.value, 10))}
                            >
                                {allLevels.map((lvl, idx) => (
                                    <option key={lvl.id} value={idx}>Compare: Level {lvl.id}</option>
                                ))}
                            </select>
                            <Button size="sm" onClick={exportTS}>Copy JSON</Button>
                            <Button size="sm" variant="outline" onClick={() => {
                                if (compareLevel?.grid) {
                                    setRows(compareLevel.grid.length);
                                    setCols(compareLevel.grid[0]?.length || 0);
                                    setGrid(compareLevel.grid.map(row => [...row]));
                                }
                            }}>Copy Reference</Button>
                        </div>
                    </div>

                    {/* Differences summary */}
                    <div className="text-xs text-muted-foreground mt-1">Diff cells: {differences.length}</div>

                    {/* Editor grid */}
                    <div className="mt-2 overflow-auto max-h-[70vh] border rounded">
                        <table className="text-xs" style={{ tableLayout: 'auto' }}>
                            <tbody>
                                {grid.map((row, r) => (
                                    <tr key={r}>
                                        {row.map((cell, c) => {
                                            const diff = compareLevel?.grid?.[r]?.[c] !== undefined && compareLevel.grid[r][c] !== cell;
                                            return (
                                                <td key={`${r}-${c}`}>
                                                    <button
                                                        className={`w-8 h-8 border ${diff ? "ring-2 ring-red-500" : ""}`}
                                                        style={{ background: TILE_TYPES.find(t => t.id === cell)?.color || "#000" }}
                                                        onClick={() => {
                                                            setGrid(g => {
                                                                const ng = g.map(row => [...row]);
                                                                ng[r][c] = activeTile;
                                                                return ng;
                                                            });
                                                        }}
                                                        title={`(${r},${c}) = ${cell}`}
                                                    />
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Reference level grid (read-only) */}
                    <div className="mt-3">
                        <div className="text-xs font-medium">Reference: Level {compareLevel?.id}</div>
                        <div className="overflow-auto max-h-[40vh] border rounded mt-1">
                            <table className="text-[10px]" style={{ tableLayout: 'auto' }}>
                                <tbody>
                                    {compareLevel?.grid.map((row, r) => (
                                        <tr key={`ref-${r}`}>
                                            {row.map((cell, c) => (
                                                <td key={`ref-${r}-${c}`}>
                                                    <div
                                                        className="w-8 h-8 border"
                                                        style={{ background: TILE_TYPES.find(t => t.id === cell)?.color || "#000" }}
                                                        title={`(${r},${c}) = ${cell}`}
                                                    />
                                                </td>
                                            ))}
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default LevelMapper;
