import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { TILE_TYPES } from '@/lib/levelgrid';
import { useLevelMapper } from '@/components/level-mapper/LevelMapperContext';
import { cropOuterVoidCells, learnReferencesFromAlignedMap } from './learningOperations';

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
        zoom, setZoom,
        gridOffsetX, setGridOffsetX, gridOffsetY, setGridOffsetY,
        gridFrameWidth, setGridFrameWidth, gridFrameHeight, setGridFrameHeight,
        replaceGridShape,
    } = useLevelMapper();

    const [isSettingPlayerStart, setIsSettingPlayerStart] = React.useState(false);
    const [isDragMode, setIsDragMode] = React.useState(false);
    const [isDraggingGrid, setIsDraggingGrid] = React.useState(false);
    const [outerVoidMargin, setOuterVoidMargin] = React.useState(3);
    const containerRef = useRef<HTMLDivElement>(null);
    const [cellWidth, setCellWidth] = React.useState(32);
    const [cellHeight, setCellHeight] = React.useState(32);
    const [imageNaturalSize, setImageNaturalSize] = React.useState<{ width: number; height: number } | null>(null);
    const [displaySize, setDisplaySize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });

    // Calculate cell size based on container width and image
    React.useEffect(() => {
        const updateCellSize = () => {
            if (!containerRef.current) return;
            const containerWidth = Math.max(320, containerRef.current.clientWidth - 32);

            if (imageURL) {
                const img = new Image();
                img.onload = () => {
                    setImageNaturalSize({ width: img.width, height: img.height });
                    const naturalGridWidth = gridFrameWidth ?? img.width;
                    const naturalGridHeight = gridFrameHeight ?? img.height;
                    const fitScale = containerWidth / img.width;
                    const renderedWidth = Math.max(1, Math.floor(containerWidth * zoom));
                    const renderedHeight = Math.max(1, Math.floor(renderedWidth * (img.height / img.width)));
                    setDisplaySize({ width: renderedWidth, height: renderedHeight });
                    const imageScaleX = renderedWidth / img.width;
                    const imageScaleY = renderedHeight / img.height;
                    const imageCellWidth = (naturalGridWidth * imageScaleX) / cols;
                    const imageCellHeight = (naturalGridHeight * imageScaleY) / rows;

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
                const calculatedCellSize = Math.floor(containerWidth / cols);
                const clamped = Math.max(24, Math.min(calculatedCellSize, 80));
                setCellWidth(clamped);
                setCellHeight(clamped);
                setDisplaySize({ width: clamped * cols, height: clamped * rows });
                setImageNaturalSize(null);
            }
        };

        updateCellSize();
        const resizeObserver = new ResizeObserver(() => updateCellSize());
        resizeObserver.observe(containerRef.current);
        return () => resizeObserver.disconnect();
    }, [imageURL, cols, rows, overlayStretch, zoom, gridFrameHeight, gridFrameWidth]);

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
    const dragStartRef = React.useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

    const overlayScaleX = imageNaturalSize ? displaySize.width / imageNaturalSize.width : 1;
    const overlayScaleY = imageNaturalSize ? displaySize.height / imageNaturalSize.height : 1;
    const displayOffsetX = gridOffsetX * overlayScaleX;
    const displayOffsetY = gridOffsetY * overlayScaleY;
    const naturalFrameWidth = gridFrameWidth ?? imageNaturalSize?.width ?? 0;
    const naturalFrameHeight = gridFrameHeight ?? imageNaturalSize?.height ?? 0;
    const cropInsets = React.useMemo(() => {
        if (!imageNaturalSize) return null;

        const left = Math.max(0, Math.round(gridOffsetX));
        const top = Math.max(0, Math.round(gridOffsetY));
        const right = Math.max(0, Math.round(imageNaturalSize.width - (gridOffsetX + naturalFrameWidth)));
        const bottom = Math.max(0, Math.round(imageNaturalSize.height - (gridOffsetY + naturalFrameHeight)));

        return { left, top, right, bottom };
    }, [gridOffsetX, gridOffsetY, imageNaturalSize, naturalFrameHeight, naturalFrameWidth]);

    const applyCropInsets = React.useCallback((next: {
        left?: number;
        top?: number;
        right?: number;
        bottom?: number;
    }) => {
        if (!imageNaturalSize || !cropInsets) return;

        const left = Math.max(0, Math.min(imageNaturalSize.width - 1, Math.round(next.left ?? cropInsets.left)));
        const top = Math.max(0, Math.min(imageNaturalSize.height - 1, Math.round(next.top ?? cropInsets.top)));
        const right = Math.max(0, Math.min(imageNaturalSize.width - 1, Math.round(next.right ?? cropInsets.right)));
        const bottom = Math.max(0, Math.min(imageNaturalSize.height - 1, Math.round(next.bottom ?? cropInsets.bottom)));

        const frameWidth = Math.max(1, imageNaturalSize.width - left - right);
        const frameHeight = Math.max(1, imageNaturalSize.height - top - bottom);

        setGridOffsetX(left);
        setGridOffsetY(top);
        setGridFrameWidth(frameWidth);
        setGridFrameHeight(frameHeight);
    }, [cropInsets, imageNaturalSize, setGridFrameHeight, setGridFrameWidth, setGridOffsetX, setGridOffsetY]);

    const beginPaint = (r: number, c: number) => {
        if (isDragMode) return;
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
        if (isDragMode) return;
        if (isSettingPlayerStart) return;
        if (!isPaintingRef.current) return;
        setGrid(g => {
            const ng = g.map(row => [...row]);
            if (ng[r] && ng[r][c] !== undefined) ng[r][c] = activeTile;
            return ng;
        });
    };
    const endPaint = () => { isPaintingRef.current = false; didPushUndoRef.current = false; };

    const startGridDrag = (clientX: number, clientY: number) => {
        if (!isDragMode || !imageURL) return;
        setIsDraggingGrid(true);
        dragStartRef.current = {
            x: clientX,
            y: clientY,
            offsetX: gridOffsetX,
            offsetY: gridOffsetY,
        };
    };

    const moveGridDrag = (clientX: number, clientY: number) => {
        if (!isDraggingGrid || !imageNaturalSize) return;

        const deltaX = clientX - dragStartRef.current.x;
        const deltaY = clientY - dragStartRef.current.y;
        const nextOffsetX = dragStartRef.current.offsetX + deltaX / overlayScaleX;
        const nextOffsetY = dragStartRef.current.offsetY + deltaY / overlayScaleY;

        setGridOffsetX(Math.round(nextOffsetX));
        setGridOffsetY(Math.round(nextOffsetY));
    };

    const endGridDrag = () => {
        setIsDraggingGrid(false);
    };

    const learnCurrentMap = async (options?: { silent?: boolean }) => {
        if (!imageURL || !imageNaturalSize) {
            alert('Load an aligned image first');
            return;
        }

        const learnedCount = await learnReferencesFromAlignedMap({
            imageURL,
            grid,
            frame: {
                offsetX: gridOffsetX,
                offsetY: gridOffsetY,
                width: naturalFrameWidth,
                height: naturalFrameHeight,
            },
            levelLabel: importLevel ? `level-${importLevel.id}` : 'mapper-current',
        });

        if (!options?.silent) {
            alert(`Learned ${learnedCount} reference cells from the current map`);
        }
    };

    const cropCurrentMap = () => {
        if (!imageNaturalSize) {
            alert('Load an aligned image first');
            return;
        }

        const result = cropOuterVoidCells({
            grid,
            keepMargin: Math.max(0, Math.min(5, Math.round(outerVoidMargin))),
            playerStart,
            frame: {
                offsetX: gridOffsetX,
                offsetY: gridOffsetY,
                width: naturalFrameWidth,
                height: naturalFrameHeight,
            },
        });

        if (
            result.removed.top === 0 &&
            result.removed.right === 0 &&
            result.removed.bottom === 0 &&
            result.removed.left === 0
        ) {
            alert('No extra outer void cells to crop');
            return;
        }

        pushUndo();
        replaceGridShape(result.grid);
        setPlayerStart(result.playerStart);
        setGridOffsetX(Math.round(result.frame.offsetX));
        setGridOffsetY(Math.round(result.frame.offsetY));
        setGridFrameWidth(result.frame.width);
        setGridFrameHeight(result.frame.height);
        alert(`Cropped void border (kept ${Math.max(0, Math.min(5, Math.round(outerVoidMargin)))}-cell margin): top ${result.removed.top}, right ${result.removed.right}, bottom ${result.removed.bottom}, left ${result.removed.left}`);
    };

    const saveCurrentMap = async () => {
        if (imageURL && imageNaturalSize) {
            try {
                await learnCurrentMap({ silent: true });
            } catch (error) {
                console.error('Failed to learn from current map before saving:', error);
            }
        }
        saveChanges();
    };

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
                            Image: {imageNaturalSize.width}×{imageNaturalSize.height}px | Frame: {Math.round(naturalFrameWidth)}×{Math.round(naturalFrameHeight)}px | View: {Math.round(displaySize.width)}×{Math.round(displaySize.height)}px | Cell: {cellWidth.toFixed(1)}×{cellHeight.toFixed(1)}px
                        </span>
                    )}
                    {imageURL && (
                        <div className="flex items-center gap-1 text-xs">
                            <span>Zoom</span>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setZoom(Math.max(0.5, Number((zoom - 0.1).toFixed(2))))}>-</Button>
                            <input
                                type="range"
                                min={0.5}
                                max={2}
                                step={0.05}
                                value={zoom}
                                onChange={(e) => setZoom(Number(e.target.value))}
                            />
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setZoom(Math.min(2, Number((zoom + 0.1).toFixed(2))))}>+</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={() => setZoom(1)}>Fit</Button>
                            <span>{Math.round(zoom * 100)}%</span>
                        </div>
                    )}
                    {imageURL && overlayEnabled && (
                        <div className="flex items-center gap-1 text-xs">
                            <Button
                                size="sm"
                                variant={isDragMode ? "default" : "outline"}
                                className="h-7 px-2"
                                onClick={() => {
                                    setIsDragMode((prev) => !prev);
                                    setIsDraggingGrid(false);
                                }}
                                title="Drag the grid layer over the image overlay"
                            >
                                {isDragMode ? "Dragging Map" : "Drag Map"}
                            </Button>
                            <span>Offset {gridOffsetX}, {gridOffsetY}</span>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                onClick={() => {
                                    setGridOffsetX(0);
                                    setGridOffsetY(0);
                                }}
                            >
                                Reset
                            </Button>
                        </div>
                    )}
                    {imageURL && overlayEnabled && imageNaturalSize && cropInsets && (
                        <div className="flex items-center gap-1 rounded border border-border/60 bg-background/60 px-2 py-1 text-xs">
                            <span className="font-medium text-foreground">Crop</span>
                            <label className="flex items-center gap-1">
                                <span>L</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={imageNaturalSize.width - 1}
                                    value={cropInsets.left}
                                    onChange={(e) => applyCropInsets({ left: Number(e.target.value) || 0 })}
                                    className="h-7 w-14 rounded border bg-background px-1"
                                />
                            </label>
                            <label className="flex items-center gap-1">
                                <span>T</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={imageNaturalSize.height - 1}
                                    value={cropInsets.top}
                                    onChange={(e) => applyCropInsets({ top: Number(e.target.value) || 0 })}
                                    className="h-7 w-14 rounded border bg-background px-1"
                                />
                            </label>
                            <label className="flex items-center gap-1">
                                <span>R</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={imageNaturalSize.width - 1}
                                    value={cropInsets.right}
                                    onChange={(e) => applyCropInsets({ right: Number(e.target.value) || 0 })}
                                    className="h-7 w-14 rounded border bg-background px-1"
                                />
                            </label>
                            <label className="flex items-center gap-1">
                                <span>B</span>
                                <input
                                    type="number"
                                    min={0}
                                    max={imageNaturalSize.height - 1}
                                    value={cropInsets.bottom}
                                    onChange={(e) => applyCropInsets({ bottom: Number(e.target.value) || 0 })}
                                    className="h-7 w-14 rounded border bg-background px-1"
                                />
                            </label>
                            <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2"
                                onClick={() => {
                                    setGridOffsetX(0);
                                    setGridOffsetY(0);
                                    setGridFrameWidth(imageNaturalSize.width);
                                    setGridFrameHeight(imageNaturalSize.height);
                                }}
                                title="Reset manual image crop"
                            >
                                Reset Crop
                            </Button>
                        </div>
                    )}
                    {imageURL && overlayEnabled && (
                        <>
                            <Button size="sm" variant="outline" onClick={learnCurrentMap} title="Learn tile references from the corrected current map">
                                Learn From Map
                            </Button>
                            <div className="flex items-center gap-2">
                                <label className="flex items-center gap-1 text-xs text-muted-foreground" title="How many void cells to keep around the outside when cropping">
                                    <span>Void margin</span>
                                    <input
                                        type="number"
                                        min={0}
                                        max={5}
                                        value={outerVoidMargin}
                                        onChange={(e) => setOuterVoidMargin(Number(e.target.value))}
                                        className="h-7 w-14 rounded border bg-background px-1 text-foreground"
                                    />
                                </label>
                                <Button size="sm" variant="outline" onClick={cropCurrentMap} title="Crop excess outer void cells while keeping the selected void margin">
                                Crop Outer Void
                            </Button>
                            </div>
                        </>
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
                        onClick={() => { void saveCurrentMap(); }}
                        disabled={isSaved}
                        className="bg-green-600 hover:bg-green-700 text-white disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        Save + Learn
                    </Button>
                    <Button size="sm" variant="outline" onClick={undo} disabled={!canUndo}>Undo</Button>
                    <Button size="sm" variant="outline" onClick={redo} disabled={!canRedo}>Redo</Button>
                </div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Diff cells: {differences.length}</div>
            {isDragMode && (
                <div className="mt-1 text-xs text-amber-600">
                    Drag anywhere on the grid to fine-tune alignment. Turn drag mode off to paint or click cells.
                </div>
            )}
            <div className="mt-2">
                <div ref={containerRef} className="overflow-auto max-h-[70vh] border rounded p-3">
                    <div
                        className="relative mx-auto"
                        style={{
                            width: `${Math.max(displaySize.width, cols * cellWidth)}px`,
                            minWidth: '100%',
                        }}
                    >
                        {overlayEnabled && imageURL && (
                            <img
                                src={imageURL}
                                alt="overlay"
                                className="absolute top-0 left-0 pointer-events-none"
                                style={{
                                    opacity: overlayOpacity,
                                    width: `${displaySize.width}px`,
                                    height: `${displaySize.height}px`,
                                    objectFit: 'contain',
                                    imageRendering: 'pixelated',
                                    zIndex: 15
                                }}
                            />
                        )}
                        <div
                            className="relative z-10"
                            style={{
                                width: `${cols * cellWidth}px`,
                                transform: `translate(${displayOffsetX}px, ${displayOffsetY}px)`,
                                transformOrigin: 'top left',
                            }}
                        >
                            <table className="text-xs border-collapse" style={{ tableLayout: 'fixed', borderSpacing: 0 }}
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
                                                            disabled={isDragMode}
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
                            {isDragMode && (
                                <div
                                    className="absolute inset-0 z-20"
                                    style={{
                                        cursor: isDraggingGrid ? 'grabbing' : 'grab',
                                        touchAction: 'none',
                                    }}
                                    onPointerDown={(e) => {
                                        e.preventDefault();
                                        e.currentTarget.setPointerCapture(e.pointerId);
                                        startGridDrag(e.clientX, e.clientY);
                                    }}
                                    onPointerMove={(e) => {
                                        if (!isDraggingGrid) return;
                                        e.preventDefault();
                                        moveGridDrag(e.clientX, e.clientY);
                                    }}
                                    onPointerUp={(e) => {
                                        e.preventDefault();
                                        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                            e.currentTarget.releasePointerCapture(e.pointerId);
                                        }
                                        endGridDrag();
                                    }}
                                    onPointerCancel={(e) => {
                                        if (e.currentTarget.hasPointerCapture(e.pointerId)) {
                                            e.currentTarget.releasePointerCapture(e.pointerId);
                                        }
                                        endGridDrag();
                                    }}
                                />
                            )}
                        </div>
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
