import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { TILE_TYPES } from '@/lib/levelgrid';
import { useLevelMapper } from './LevelMapperContext';

export const GridEditorPanel: React.FC = () => {
    const {
        compareLevelIndex, setCompareLevelIndex, allLevels, compareLevel,
        importLevelIndex,
        overlayEnabled, setOverlayEnabled, overlayOpacity, setOverlayOpacity, overlayStretch, setOverlayStretch,
        exportTS, saveChanges, undo, redo, canUndo, canRedo, isSaved,
        rows, cols, grid, activeTile, setGrid, setRows, setCols,
        pushUndo,
        addRowTop, addRowBottom, addColumnLeft, addColumnRight,
        addMultipleColumns, addMultipleRows, contextMenu, setContextMenu,
        showUnsavedBanner, isSaved: savedFlag, imageURL,
        canvasRef,
        playerStart, setPlayerStart,
    } = useLevelMapper();

    const [isSettingPlayerStart, setIsSettingPlayerStart] = React.useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const [cellWidth, setCellWidth] = React.useState(32);
    const [cellHeight, setCellHeight] = React.useState(32);
    const [imageNaturalSize, setImageNaturalSize] = React.useState<{ width: number; height: number } | null>(null);

    // Calculate cell size based on container width and image
    React.useEffect(() => {
        const updateCellSize = () => {
            if (!containerRef.current) return;

            if (imageURL && overlayEnabled) {
                // When overlay is enabled, load image and calculate from its dimensions
                const img = new Image();
                img.onload = () => {
                    setImageNaturalSize({ width: img.width, height: img.height });
                    const imageCellWidth = img.width / cols;
                    const imageCellHeight = img.height / rows;
                    if (overlayStretch) {
                        setCellWidth(imageCellWidth);
                        setCellHeight(imageCellHeight);
                    } else {
                        const calculatedSize = Math.floor(Math.min(imageCellWidth, imageCellHeight));
                        const clamped = Math.max(20, Math.min(calculatedSize, 100));
                        setCellWidth(clamped);
                        setCellHeight(clamped);
                    }
                };
                img.src = imageURL;
            } else {
                // Without overlay, fit to container width
                const containerWidth = containerRef.current.offsetWidth - 40;
                const calculatedCellSize = Math.floor(containerWidth / cols);
                const clamped = Math.max(24, Math.min(calculatedCellSize, 80));
                setCellWidth(clamped);
                setCellHeight(clamped);
            }
        };

        updateCellSize();
    }, [imageURL, cols, rows, overlayEnabled, overlayStretch]);

    // Resize observer to update cell size on container resize
    React.useEffect(() => {
        if (!containerRef.current) return;

        const resizeObserver = new ResizeObserver(() => {
            if (containerRef.current && !overlayEnabled) {
                const containerWidth = containerRef.current.offsetWidth - 40;
                const calculatedCellSize = Math.floor(containerWidth / cols);
                const clamped = Math.max(24, Math.min(calculatedCellSize, 80));
                setCellWidth(clamped);
                setCellHeight(clamped);
            }
        });

        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, [cols, overlayEnabled]);

    const differences = React.useMemo(() => {
        const ref = compareLevel?.grid || [];
        const diffs: { r: number; c: number }[] = [];
        for (let r = 0; r < Math.max(ref.length, grid.length); r++) {
            for (let c = 0; c < Math.max(ref[0]?.length || 0, grid[0]?.length || 0); c++) {
                const a = ref[r]?.[c]; const b = grid[r]?.[c]; if (a !== b) diffs.push({ r, c });
            }
        }
        return diffs;
    }, [grid, compareLevel]);

    const isPaintingRef = React.useRef(false);
    const didPushUndoRef = React.useRef(false);

    const beginPaint = (r: number, c: number) => {
        if (isSettingPlayerStart) {
            setPlayerStart({ x: c, y: r });
            setIsSettingPlayerStart(false);
            return;
        }
        isPaintingRef.current = true;
        if (!didPushUndoRef.current) { pushUndo(); didPushUndoRef.current = true; }
        setGrid(g => {
            const ng = g.map(row => [...row]);
            if (ng[r] && ng[r][c] !== undefined) ng[r][c] = activeTile;
            return ng;
        });
    };
    const continuePaint = (r: number, c: number) => {
        if (isSettingPlayerStart) return;
        if (!isPaintingRef.current) return;
        setGrid(g => {
            const ng = g.map(row => [...row]);
            if (ng[r] && ng[r][c] !== undefined) ng[r][c] = activeTile;
            return ng;
        });
    };
    const endPaint = () => { isPaintingRef.current = false; didPushUndoRef.current = false; };

    // Get the import level info for display
    const importLevel = importLevelIndex !== null && importLevelIndex !== undefined ? allLevels[importLevelIndex] : null;

    return (
        <div className="w-full lg:flex-1 lg:min-w-0 bg-card rounded border p-2">
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-3">
                    <div className="text-sm font-medium">
                        Grid Editor ({rows}×{cols} = {rows * cols} cells)
                    </div>
                    {importLevel && (
                        <div className="px-3 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-md text-xs font-semibold border border-blue-300 dark:border-blue-700">
                            📝 Editing: Level {importLevel.id}
                        </div>
                    )}
                    {imageURL && overlayEnabled && (
                        <div className="px-2 py-1 bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded text-xs border border-green-300 dark:border-green-700">
                            🖼️ Image overlay active
                        </div>
                    )}
                </div>
            </div>
            <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                    Diff cells: {differences.length}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={overlayEnabled} onChange={(e) => setOverlayEnabled(e.target.checked)} /> Overlay image
                    </label>
                    {overlayEnabled && (
                        <div className="flex items-center gap-1 text-xs">
                            <span>Opacity</span>
                            <input type="range" min={0} max={1} step={0.05} value={overlayOpacity} onChange={(e) => setOverlayOpacity(Number(e.target.value))} />
                            <span>{Math.round(overlayOpacity * 100)}%</span>
                        </div>
                    )}
                    {overlayEnabled && (
                        <label className="flex items-center gap-1 text-xs">
                            <input type="checkbox" checked={overlayStretch} onChange={(e) => setOverlayStretch(e.target.checked)} /> Stretch to image
                        </label>
                    )}
                    {overlayEnabled && imageNaturalSize && (
                        <span className="text-xs text-muted-foreground">
                            Image: {imageNaturalSize.width}×{imageNaturalSize.height}px | Cell: {cellWidth.toFixed(1)}×{cellHeight.toFixed(1)}px
                        </span>
                    )}
                    <Button size="sm" onClick={exportTS}>Copy JSON</Button>
                    <Button size="sm" variant="outline" onClick={() => { pushUndo(); setGrid(g => { const width = g[0]?.length || cols; return g.map(r => r.map(() => 5)); }); }}>All Void</Button>
                    <Button
                        size="sm"
                        variant={isSettingPlayerStart ? "default" : "outline"}
                        onClick={() => setIsSettingPlayerStart(!isSettingPlayerStart)}
                        className={isSettingPlayerStart ? "bg-purple-600 hover:bg-purple-700 text-white" : ""}
                        title="Click a cell to set player start position"
                    >
                        {isSettingPlayerStart ? "Click Cell..." : "Set Player Start"}
                    </Button>
                    {playerStart && (
                        <>
                            <span className="text-xs text-muted-foreground">
                                Player: ({playerStart.x}, {playerStart.y})
                            </span>
                            <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => setPlayerStart(null)}
                                className="h-7 px-2"
                                title="Clear player start position"
                            >
                                ✕
                            </Button>
                        </>
                    )}
                    <Button
                        size="sm"
                        variant="default"
                        onClick={saveChanges}
                        disabled={isSaved}
                        className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Save Changes
                    </Button>
                    <Button size="sm" variant="outline" onClick={undo} disabled={!canUndo}>Undo</Button>
                    <Button size="sm" variant="outline" onClick={redo} disabled={!canRedo}>Redo</Button>
                </div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Diff cells: {differences.length}</div>
            <div className="mt-2">
                <div ref={containerRef} className="overflow-auto max-h-[70vh] border rounded flex items-center justify-center p-4">
                    <div className="relative inline-block">
                        {overlayEnabled && imageURL && (
                            <img
                                src={imageURL}
                                alt="overlay"
                                className="absolute top-0 left-0 pointer-events-none"
                                style={{
                                    opacity: overlayOpacity,
                                    width: `${cols * cellWidth}px`,
                                    height: `${rows * cellHeight}px`,
                                    objectFit: overlayStretch ? 'fill' : 'contain',
                                    zIndex: 15
                                }}
                            />
                        )}
                        <table className="text-xs relative z-10 border-collapse" style={{ tableLayout: 'fixed', borderSpacing: 0 }}
                            onMouseUp={endPaint}
                            onMouseLeave={endPaint}
                        >
                            <tbody>
                                {grid.map((row, r) => (
                                    <tr key={r}>
                                        {row.map((cell, c) => {
                                            const diff = compareLevel?.grid?.[r]?.[c] !== undefined && compareLevel.grid[r][c] !== cell;
                                            const isPlayerStart = playerStart?.x === c && playerStart?.y === r;
                                            return (
                                                <td key={`${r}-${c}`} className="relative p-0" style={{ width: `${cellWidth}px`, height: `${cellHeight}px` }}>
                                                    <button
                                                        className="w-full h-full border relative"
                                                        style={{
                                                            background: TILE_TYPES.find(t => t.id === cell)?.color || '#000',
                                                            width: `${cellWidth}px`,
                                                            height: `${cellHeight}px`,
                                                        }}
                                                        onMouseDown={(e) => { e.preventDefault(); beginPaint(r, c); }}
                                                        onMouseEnter={() => continuePaint(r, c)}
                                                        title={isPlayerStart ? `Player Start (${r},${c}) = ${cell} - ${TILE_TYPES.find(t => t.id === cell)?.name}` : `(${r},${c}) = ${cell} - ${TILE_TYPES.find(t => t.id === cell)?.name}`}
                                                    >
                                                        {isPlayerStart && (
                                                            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                                                                <div className="text-white font-bold text-lg drop-shadow-[0_1px_1px_rgba(0,0,0,0.8)]">👤</div>
                                                            </div>
                                                        )}
                                                    </button>
                                                </td>
                                            );
                                        })}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            </div>

            {!isSaved && compareLevel?.grid && (
                <div className="mt-3">
                    <div className="text-xs font-medium">Game (current) Level {compareLevel.id}</div>
                </div>
            )}
        </div>
    );
};

export default GridEditorPanel;
