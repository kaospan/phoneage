import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { ArrowDownUp, ArrowLeftRight, Copy, Crosshair, Eye, EyeOff, GraduationCap, Image as ImageIcon, Link2, Link2Off, Maximize2, Move, Redo2, Save, Scan, Scissors, Trash2, Undo2, UserRound, ZoomIn, ZoomOut } from 'lucide-react';
import { TILE_TYPES } from '@/lib/levelgrid';
import { useLevelMapper } from '@/components/level-mapper/useLevelMapper';
import { cropOuterVoidCells, learnReferencesFromAlignedMap } from './learningOperations';
import { detectGridLines } from './gridDetection';
import { getAlignmentHints, updateAlignmentProfile } from './alignmentProfile';

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
    const [imageScaleX, setImageScaleX] = React.useState(1);
    const [imageScaleY, setImageScaleY] = React.useState(1);
    const [lockImageAspect, setLockImageAspect] = React.useState(true);
    const [showAlignmentGuide, setShowAlignmentGuide] = React.useState(true);
    const [guideGrid, setGuideGrid] = React.useState<null | {
        rows: number;
        cols: number;
        offsetX: number;
        offsetY: number;
        cellWidth: number;
        cellHeight: number;
    }>(null);
    const [guideStatus, setGuideStatus] = React.useState<'idle' | 'detecting' | 'ready' | 'failed'>('idle');
    const containerRef = useRef<HTMLDivElement>(null);
    const [cellWidth, setCellWidth] = React.useState(32);
    const [cellHeight, setCellHeight] = React.useState(32);
    const [imageNaturalSize, setImageNaturalSize] = React.useState<{ width: number; height: number } | null>(null);
    const [displaySize, setDisplaySize] = React.useState<{ width: number; height: number }>({ width: 0, height: 0 });

    // Load overlay image size once per URL (prevents resize jitter).
    React.useEffect(() => {
        if (!imageURL) {
            setImageNaturalSize(null);
            setGuideGrid(null);
            setGuideStatus('idle');
            return;
        }
        let cancelled = false;
        const img = new Image();
        img.onload = () => {
            if (cancelled) return;
            setImageNaturalSize({ width: img.width, height: img.height });
        };
        img.src = imageURL;
        return () => {
            cancelled = true;
        };
    }, [imageURL]);

    // Detect the grid spacing in the overlay image and render it as a guide.
    React.useEffect(() => {
        if (!overlayEnabled || !imageURL || !imageNaturalSize) {
            setGuideGrid(null);
            setGuideStatus('idle');
            return;
        }

        let cancelled = false;
        setGuideStatus('detecting');

        const run = async () => {
            try {
                const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const i = new Image();
                    i.onload = () => resolve(i);
                    i.onerror = () => reject(new Error('Failed to load image for alignment guide'));
                    i.src = imageURL;
                });

                if (cancelled) return;

                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) {
                    setGuideGrid(null);
                    setGuideStatus('failed');
                    return;
                }
                ctx.drawImage(img, 0, 0);

                const detected = detectGridLines(canvas, true, rows, cols, getAlignmentHints());
                if (cancelled) return;
                if (!detected) {
                    setGuideGrid(null);
                    setGuideStatus('failed');
                    return;
                }

                setGuideGrid(detected);
                setGuideStatus('ready');
            } catch {
                if (cancelled) return;
                setGuideGrid(null);
                setGuideStatus('failed');
            }
        };

        const w = window as unknown as { requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => void };
        if (typeof w.requestIdleCallback === 'function') {
            w.requestIdleCallback(() => { void run(); }, { timeout: 1200 });
        } else {
            setTimeout(() => { void run(); }, 0);
        }

        return () => { cancelled = true; };
    }, [overlayEnabled, imageURL, imageNaturalSize, rows, cols]);

    // Calculate cell size based on available viewport space (avoid scroll by default).
    React.useEffect(() => {
        const updateCellSize = () => {
            if (!containerRef.current) return;
            const containerWidth = Math.max(320, containerRef.current.clientWidth - 32);
            const fallbackHeight = typeof window !== 'undefined' ? Math.floor(window.innerHeight * 0.65) : 600;
            const containerHeight = Math.max(240, ((containerRef.current.clientHeight || fallbackHeight) - 32));

            if (imageURL) {
                if (!imageNaturalSize) return;
                const imgW = imageNaturalSize.width;
                const imgH = imageNaturalSize.height;
                const naturalGridWidth = gridFrameWidth ?? imgW;
                const naturalGridHeight = gridFrameHeight ?? imgH;
                // Fit within both width and height, then apply user zoom.
                const fitWidthByHeight = Math.floor(containerHeight * (imgW / imgH));
                const baseWidth = Math.max(1, Math.min(containerWidth, fitWidthByHeight));
                const renderedWidth = Math.max(1, Math.floor(baseWidth * zoom));
                const renderedHeight = Math.max(1, Math.floor(renderedWidth * (imgH / imgW)));
                setDisplaySize({ width: renderedWidth, height: renderedHeight });
                const imageScaleX = renderedWidth / imgW;
                const imageScaleY = renderedHeight / imgH;
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
            } else {
                // Without overlay, fit to container size
                const calculatedCellSize = Math.floor(Math.min(containerWidth / cols, containerHeight / rows));
                const clamped = Math.max(24, Math.min(calculatedCellSize, 80));
                setCellWidth(clamped);
                setCellHeight(clamped);
                setDisplaySize({ width: clamped * cols, height: clamped * rows });
                setImageNaturalSize(null);
            }
        };

        updateCellSize();
        let rafId: number | null = null;
        const resizeObserver = new ResizeObserver(() => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            rafId = requestAnimationFrame(() => updateCellSize());
        });
        resizeObserver.observe(containerRef.current);
        return () => {
            if (rafId !== null) cancelAnimationFrame(rafId);
            resizeObserver.disconnect();
        };
    }, [imageURL, imageNaturalSize, cols, rows, overlayStretch, zoom, gridFrameHeight, gridFrameWidth]);

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

    const scaledDisplayWidth = displaySize.width * imageScaleX;
    const scaledDisplayHeight = displaySize.height * imageScaleY;
    const overlayScaleX = imageNaturalSize ? scaledDisplayWidth / imageNaturalSize.width : 1;
    const overlayScaleY = imageNaturalSize ? scaledDisplayHeight / imageNaturalSize.height : 1;
    const displayOffsetX = gridOffsetX * overlayScaleX;
    const displayOffsetY = gridOffsetY * overlayScaleY;
    const naturalFrameWidth = gridFrameWidth ?? imageNaturalSize?.width ?? 0;
    const naturalFrameHeight = gridFrameHeight ?? imageNaturalSize?.height ?? 0;

    const alignment = React.useMemo(() => {
        if (!guideGrid || !overlayEnabled || !imageNaturalSize) return null;
        if (guideGrid.rows !== rows || guideGrid.cols !== cols) return null;

        const guideOffsetX = guideGrid.offsetX * overlayScaleX;
        const guideOffsetY = guideGrid.offsetY * overlayScaleY;
        const guideCellW = guideGrid.cellWidth * overlayScaleX;
        const guideCellH = guideGrid.cellHeight * overlayScaleY;

        const v: { x: number; diff: number }[] = [];
        const h: { y: number; diff: number }[] = [];
        let sum = 0;
        let count = 0;
        let max = 0;

        for (let c = 0; c <= cols; c++) {
            const gx = displayOffsetX + c * cellWidth;
            const ix = guideOffsetX + c * guideCellW;
            const diff = Math.abs(gx - ix);
            v.push({ x: ix, diff });
            sum += diff; count++; max = Math.max(max, diff);
        }
        for (let r = 0; r <= rows; r++) {
            const gy = displayOffsetY + r * cellHeight;
            const iy = guideOffsetY + r * guideCellH;
            const diff = Math.abs(gy - iy);
            h.push({ y: iy, diff });
            sum += diff; count++; max = Math.max(max, diff);
        }

        const avg = count ? sum / count : 999;
        const aligned = avg < 0.6 && max < 1.2;
        return { aligned, avg, max, v, h, guideOffsetX, guideOffsetY, guideCellW, guideCellH };
    }, [
        guideGrid,
        overlayEnabled,
        imageNaturalSize,
        rows,
        cols,
        overlayScaleX,
        overlayScaleY,
        displayOffsetX,
        displayOffsetY,
        cellWidth,
        cellHeight,
    ]);
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

    const onWheelZoom = (e: React.WheelEvent) => {
        if (!imageURL || !overlayEnabled) return;
        // Keep normal scrolling unless you're actively aligning.
        if (!isDragMode && !e.altKey && !e.ctrlKey && !e.metaKey) return;
        if (!e.deltaY) return;
        e.preventDefault();

        // Fine-tune overlay image scale without changing the grid.
        if (e.altKey) {
            // Default: tiny increments. If you want bigger jumps, hold Alt+Meta (Mac) or Alt+Ctrl (Win/Linux) while NOT stretching an axis.
            const step = 0.002;
            const delta = e.deltaY > 0 ? -step : step;

            // Alt + wheel: uniform scale (locked), unless Ctrl or Shift is held for axis-specific stretch.
            const nextX = (prev: number) => Math.max(0.85, Math.min(1.15, Number((prev + delta).toFixed(3))));

            if (e.ctrlKey) {
                setLockImageAspect(false);
                setImageScaleY((prev) => nextX(prev));
            } else if (e.shiftKey) {
                setLockImageAspect(false);
                setImageScaleX((prev) => nextX(prev));
            } else {
                setImageScaleX((prev) => nextX(prev));
                setImageScaleY((prev) => nextX(prev));
            }
            return;
        }

        const sensitivity = e.shiftKey ? 0.003 : 0.0015;
        const factor = Math.exp(-e.deltaY * sensitivity);
        setZoom((prev) => {
            const next = Math.max(0.5, Math.min(2, Number((prev * factor).toFixed(2))));
            return next;
        });
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

    const learnAlignmentFromCurrent = React.useCallback(() => {
        if (!imageNaturalSize) {
            alert('Load an image first.');
            return;
        }
        if (rows <= 0 || cols <= 0) {
            alert('Invalid grid size.');
            return;
        }

        const frameW = gridFrameWidth ?? imageNaturalSize.width;
        const frameH = gridFrameHeight ?? imageNaturalSize.height;
        const cellW = frameW / cols;
        const cellH = frameH / rows;

        const next = updateAlignmentProfile({ cellWidthPx: cellW, cellHeightPx: cellH, cols, rows });
        alert(
            `Learned cell size ≈ ${next.cellWidthPx.toFixed(2)}×${next.cellHeightPx.toFixed(2)}px (${next.samples} sample${next.samples === 1 ? '' : 's'})`
        );
    }, [cols, gridFrameHeight, gridFrameWidth, imageNaturalSize, rows]);

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
    const rulerSizePx = 28;
    const contentWidthPx = Math.max(scaledDisplayWidth, cols * cellWidth);
    const contentHeightPx = Math.max(scaledDisplayHeight, rows * cellHeight);

    return (
        <div className="w-full lg:flex-1 lg:min-w-0 bg-card rounded border p-2">
            <div className="flex items-center justify-between gap-2 mb-2">
                <div className="flex items-center gap-3">
                    <div className="text-sm font-medium">
                        Grid Editor ({rows}×{cols} = {rows * cols} cells)
                    </div>
                    {importLevel && (
                        <div className="px-3 py-1 rounded-md text-xs font-semibold border border-sky-500/30 bg-sky-500/10 text-sky-100">
                            Editing: Level {importLevel.id}
                        </div>
                    )}
                    {imageURL && overlayEnabled && (
                        <div className="px-2 py-1 rounded text-xs border border-emerald-500/25 bg-emerald-500/10 text-emerald-100">
                            Image overlay active
                        </div>
                    )}
                </div>
                <div className="flex items-center gap-1">
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={undo} disabled={!canUndo} title="Undo" aria-label="Undo">
                        <Undo2 />
                    </Button>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={redo} disabled={!canRedo} title="Redo" aria-label="Redo">
                        <Redo2 />
                    </Button>
                </div>
            </div>
            <div className="flex items-center justify-between gap-2">
                <div className="text-xs text-muted-foreground">
                    Diff cells: {differences.length}
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    {imageURL && overlayEnabled && (
                        <Button
                            size="icon"
                            variant={showAlignmentGuide ? "secondary" : "outline"}
                            className="h-8 w-8"
                            onClick={() => setShowAlignmentGuide((s) => !s)}
                            title={showAlignmentGuide ? "Alignment guide: on" : "Alignment guide: off"}
                            aria-pressed={showAlignmentGuide}
                        >
                            <Crosshair />
                        </Button>
                    )}
                    {imageURL && overlayEnabled && showAlignmentGuide && (
                        <span
                            className={[
                                "rounded-md border px-2 py-1 text-xs tabular-nums",
                                alignment?.aligned
                                    ? "border-green-500/50 bg-green-500/10 text-green-100"
                                    : "border-amber-500/40 bg-amber-500/10 text-amber-100",
                            ].join(' ')}
                            title={guideStatus === 'detecting' ? "Detecting grid lines in the screenshot..." : "Average / max alignment error (px)"}
                        >
                            {guideStatus === 'detecting' && '⏳'}
                            {guideStatus === 'failed' && '⚠'}
                            {guideStatus === 'ready' && (alignment?.aligned ? '✓' : '≈')}
                            {guideStatus === 'ready' && alignment ? ` ${alignment.avg.toFixed(2)} / ${alignment.max.toFixed(2)}px` : ''}
                        </span>
                    )}
                    <Button
                        size="icon"
                        variant={overlayEnabled ? "secondary" : "outline"}
                        className="h-8 w-8"
                        onClick={() => setOverlayEnabled(!overlayEnabled)}
                        title={overlayEnabled ? "Overlay: on" : "Overlay: off"}
                        aria-pressed={overlayEnabled}
                    >
                        {overlayEnabled ? <Eye /> : <EyeOff />}
                    </Button>
                    {overlayEnabled && (
                        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs">
                            <span className="text-muted-foreground" title="Overlay opacity">α</span>
                            <input type="range" min={0} max={1} step={0.05} value={overlayOpacity} onChange={(e) => setOverlayOpacity(Number(e.target.value))} />
                            <span className="tabular-nums">{Math.round(overlayOpacity * 100)}%</span>
                        </div>
                    )}
                    {overlayEnabled && (
                        <Button
                            size="icon"
                            variant={overlayStretch ? "secondary" : "outline"}
                            className="h-8 w-8"
                            onClick={() => setOverlayStretch(!overlayStretch)}
                            title={overlayStretch ? "Cell sizing: stretched" : "Cell sizing: uniform"}
                            aria-pressed={overlayStretch}
                        >
                            <Maximize2 />
                        </Button>
                    )}
                    {overlayEnabled && imageNaturalSize && (
                        <span className="text-xs text-muted-foreground">
                            Image: {imageNaturalSize.width}×{imageNaturalSize.height}px | Frame: {Math.round(naturalFrameWidth)}×{Math.round(naturalFrameHeight)}px | View: {Math.round(displaySize.width)}×{Math.round(displaySize.height)}px | Cell: {cellWidth.toFixed(1)}×{cellHeight.toFixed(1)}px
                        </span>
                    )}
                    {imageURL && (
                        <div className="flex items-center gap-1 text-xs">
                            <span className="text-muted-foreground" title="View zoom">🔎</span>
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setZoom(Math.max(0.5, Number((zoom - 0.1).toFixed(2))))} aria-label="Zoom out">
                                <ZoomOut />
                            </Button>
                            <input
                                type="range"
                                min={0.5}
                                max={2}
                                step={0.05}
                                value={zoom}
                                onChange={(e) => setZoom(Number(e.target.value))}
                            />
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setZoom(Math.min(2, Number((zoom + 0.1).toFixed(2))))} aria-label="Zoom in">
                                <ZoomIn />
                            </Button>
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => setZoom(1)} aria-label="Fit zoom">
                                <Maximize2 />
                            </Button>
                            <span className="tabular-nums">{Math.round(zoom * 100)}%</span>
                        </div>
                    )}
                    {imageURL && overlayEnabled && (
                        <div className="flex items-center gap-2 rounded-md border border-border/60 bg-background/60 px-2 py-1 text-xs" title="Scale only the overlay image (grid stays fixed). Alt+wheel scales uniformly. Alt+Shift stretches X. Alt+Ctrl stretches Y.">
                            <ImageIcon className="h-4 w-4 text-muted-foreground" />
                            <Button
                                size="icon"
                                variant={lockImageAspect ? "secondary" : "outline"}
                                className="h-8 w-8"
                                onClick={() => {
                                    setLockImageAspect((v) => {
                                        const next = !v;
                                        if (next) {
                                            const avg = Number((((imageScaleX + imageScaleY) / 2)).toFixed(3));
                                            setImageScaleX(avg);
                                            setImageScaleY(avg);
                                        }
                                        return next;
                                    });
                                }}
                                title={lockImageAspect ? "Aspect locked" : "Aspect unlocked"}
                                aria-pressed={lockImageAspect}
                                aria-label={lockImageAspect ? "Lock image scale" : "Unlock image scale"}
                            >
                                {lockImageAspect ? <Link2 /> : <Link2Off />}
                            </Button>

                            <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
                            <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                onClick={() => {
                                    setImageScaleX((s) => {
                                        const next = Math.max(0.85, Number((s - 0.005).toFixed(3)));
                                        if (lockImageAspect) setImageScaleY(next);
                                        return next;
                                    });
                                }}
                                aria-label="Decrease image scale X"
                            >
                                <ZoomOut />
                            </Button>
                            <input
                                type="range"
                                min={0.85}
                                max={1.15}
                                step={0.001}
                                value={imageScaleX}
                                onChange={(e) => {
                                    const next = Number(e.target.value);
                                    setImageScaleX(next);
                                    if (lockImageAspect) setImageScaleY(next);
                                }}
                                aria-label="Image scale X"
                            />
                            <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                onClick={() => {
                                    setImageScaleX((s) => {
                                        const next = Math.min(1.15, Number((s + 0.005).toFixed(3)));
                                        if (lockImageAspect) setImageScaleY(next);
                                        return next;
                                    });
                                }}
                                aria-label="Increase image scale X"
                            >
                                <ZoomIn />
                            </Button>
                            <span className="tabular-nums">{Math.round(imageScaleX * 1000) / 10}%</span>

                            {!lockImageAspect && (
                                <>
                                    <ArrowDownUp className="h-4 w-4 text-muted-foreground" />
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-8 w-8"
                                        onClick={() => setImageScaleY((s) => Math.max(0.85, Number((s - 0.005).toFixed(3))))}
                                        aria-label="Decrease image scale Y"
                                    >
                                        <ZoomOut />
                                    </Button>
                                    <input
                                        type="range"
                                        min={0.85}
                                        max={1.15}
                                        step={0.001}
                                        value={imageScaleY}
                                        onChange={(e) => setImageScaleY(Number(e.target.value))}
                                        aria-label="Image scale Y"
                                    />
                                    <Button
                                        size="icon"
                                        variant="outline"
                                        className="h-8 w-8"
                                        onClick={() => setImageScaleY((s) => Math.min(1.15, Number((s + 0.005).toFixed(3))))}
                                        aria-label="Increase image scale Y"
                                    >
                                        <ZoomIn />
                                    </Button>
                                    <span className="tabular-nums">{Math.round(imageScaleY * 1000) / 10}%</span>
                                </>
                            )}

                            <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                onClick={() => {
                                    setImageScaleX(1);
                                    setImageScaleY(1);
                                    setLockImageAspect(true);
                                }}
                                aria-label="Reset image scale"
                                title="Reset image scale"
                            >
                                1x
                            </Button>
                        </div>
                    )}
                    {imageURL && overlayEnabled && (
                        <div className="flex items-center gap-1 text-xs">
                            <Button
                                size="icon"
                                variant={isDragMode ? "secondary" : "outline"}
                                className="h-8 w-8"
                                onClick={() => {
                                    setIsDragMode((prev) => !prev);
                                    setIsDraggingGrid(false);
                                }}
                                title="Drag the grid layer over the image overlay"
                                aria-pressed={isDragMode}
                            >
                                <Move />
                            </Button>
                            <span className="tabular-nums text-muted-foreground" title="Overlay frame offset (px)">({gridOffsetX}, {gridOffsetY})</span>
                            <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                onClick={() => {
                                    setGridOffsetX(0);
                                    setGridOffsetY(0);
                                }}
                                aria-label="Reset offset"
                            >
                                <Maximize2 />
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
                            <Button size="icon" variant="outline" className="h-8 w-8" onClick={learnCurrentMap} title="Learn references from the corrected map" aria-label="Learn from map">
                                <Scan />
                            </Button>
                            <Button
                                size="icon"
                                variant="outline"
                                className="h-8 w-8"
                                onClick={learnAlignmentFromCurrent}
                                title="Learn grid alignment (cell size) from this corrected level to improve auto-detect on other levels"
                                aria-label="Learn alignment"
                            >
                                <GraduationCap />
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
                                <Button size="icon" variant="outline" className="h-8 w-8" onClick={cropCurrentMap} title="Crop excess outer void cells (keep margin)" aria-label="Crop outer void">
                                    <Scissors />
                                </Button>
                            </div>
                        </>
                    )}
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={exportTS} title="Copy JSON" aria-label="Copy JSON">
                        <Copy />
                    </Button>
                    <Button size="icon" variant="outline" className="h-8 w-8" onClick={() => { pushUndo(); setGrid(g => { const width = g[0]?.length || cols; return g.map(r => r.map(() => 5)); }); }} title="Fill all cells with Void" aria-label="All void">
                        <Trash2 />
                    </Button>
                    <Button
                        size="icon"
                        variant={isSettingPlayerStart ? "secondary" : "outline"}
                        className="h-8 w-8"
                        onClick={() => setIsSettingPlayerStart(!isSettingPlayerStart)}
                        title="Click a cell to set player start position"
                        aria-pressed={isSettingPlayerStart}
                        aria-label={isSettingPlayerStart ? "Setting player start: on" : "Setting player start: off"}
                    >
                        <UserRound />
                    </Button>
                    {playerStart && (
                        <>
                            <span className="text-xs text-muted-foreground tabular-nums" title="Player start (col,row)">
                                ({playerStart.x}, {playerStart.y})
                            </span>
                            <Button
                                size="icon"
                                variant="ghost"
                                onClick={() => setPlayerStart(null)}
                                className="h-8 w-8"
                                title="Clear player start position"
                                aria-label="Clear player start"
                            >
                                ✕
                            </Button>
                        </>
                    )}
                    <Button
                        size="icon"
                        variant="outline"
                        className="h-8 w-8"
                        onClick={() => { void saveCurrentMap(); }}
                        disabled={isSaved}
                        title={isSaved ? "Saved" : "Save + Learn"}
                        aria-label="Save + Learn"
                    >
                        <Save />
                    </Button>
                </div>
            </div>
            <div className="text-xs text-muted-foreground mt-1">Diff cells: {differences.length}</div>
            {isDragMode && (
                <div className="mt-1 text-xs text-amber-600">
                    Drag anywhere on the grid to fine-tune alignment. Mouse wheel zooms the view; hold Alt to scale only the overlay image. Turn drag mode off to paint or click cells.
                </div>
            )}
            <div className="mt-2">
                <div
                    ref={containerRef}
                    className="overflow-auto border rounded p-3 h-[calc(100vh-260px)] min-h-[320px] [color-scheme:dark]"
                    onWheel={onWheelZoom}
                >
                    <div
                        className="relative mx-auto"
                        style={{
                            width: `${contentWidthPx + rulerSizePx}px`,
                            height: `${contentHeightPx + rulerSizePx}px`,
                            minWidth: '100%',
                        }}
                    >
                        <div
                            className="grid"
                            style={{
                                gridTemplateColumns: `${rulerSizePx}px ${contentWidthPx}px`,
                                gridTemplateRows: `${rulerSizePx}px ${contentHeightPx}px`,
                                width: `${rulerSizePx + contentWidthPx}px`,
                                height: `${rulerSizePx + contentHeightPx}px`,
                            }}
                        >
                            {/* Corner ruler label */}
                            <div className="sticky top-0 left-0 z-30 flex items-center justify-center border border-border/40 bg-background/80 backdrop-blur-sm">
                                <div className="text-[10px] leading-tight text-muted-foreground tabular-nums text-center">
                                    {cellWidth.toFixed(1)}×{cellHeight.toFixed(1)}px
                                </div>
                            </div>

                            {/* X ruler (px) */}
                            <div className="sticky top-0 z-20 border border-border/40 bg-background/80 backdrop-blur-sm overflow-hidden">
                                <svg
                                    width={Math.max(1, Math.round(contentWidthPx))}
                                    height={rulerSizePx}
                                    viewBox={`0 0 ${Math.max(1, contentWidthPx)} ${rulerSizePx}`}
                                    shapeRendering="crispEdges"
                                >
                                    {Array.from({ length: cols + 1 }, (_, i) => {
                                        const x = i * cellWidth;
                                        const major = i % 5 === 0;
                                        const tickTo = major ? 6 : 12;
                                        return (
                                            <g key={`xr-${i}`}>
                                                <line x1={x} y1={rulerSizePx} x2={x} y2={tickTo} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
                                                {major && (
                                                    <text x={x + 2} y={11} fontSize="9" fill="rgba(255,255,255,0.65)">
                                                        {Math.round(x)}px
                                                    </text>
                                                )}
                                            </g>
                                        );
                                    })}
                                </svg>
                            </div>

                            {/* Y ruler (px) */}
                            <div className="sticky left-0 z-20 border border-border/40 bg-background/80 backdrop-blur-sm overflow-hidden">
                                <svg
                                    width={rulerSizePx}
                                    height={Math.max(1, Math.round(contentHeightPx))}
                                    viewBox={`0 0 ${rulerSizePx} ${Math.max(1, contentHeightPx)}`}
                                    shapeRendering="crispEdges"
                                >
                                    {Array.from({ length: rows + 1 }, (_, i) => {
                                        const y = i * cellHeight;
                                        const major = i % 5 === 0;
                                        const tickTo = major ? 6 : 12;
                                        return (
                                            <g key={`yr-${i}`}>
                                                <line x1={rulerSizePx} y1={y} x2={tickTo} y2={y} stroke="rgba(255,255,255,0.28)" strokeWidth={1} />
                                                {major && (
                                                    <text x={2} y={y + 10} fontSize="9" fill="rgba(255,255,255,0.65)">
                                                        {Math.round(y)}px
                                                    </text>
                                                )}
                                            </g>
                                        );
                                    })}
                                </svg>
                            </div>

                            {/* Main image + grid */}
                            <div className="relative">
                                {overlayEnabled && imageURL && (
                                    <img
                                        src={imageURL}
                                        alt="overlay"
                                        className="absolute top-0 left-0 pointer-events-none"
                                        style={{
                                            opacity: overlayOpacity,
                                            width: `${scaledDisplayWidth}px`,
                                            height: `${scaledDisplayHeight}px`,
                                            objectFit: 'contain',
                                            imageRendering: 'pixelated',
                                            zIndex: 15
                                        }}
                                    />
                                )}
                                {overlayEnabled && imageURL && showAlignmentGuide && alignment && (
                                    <svg
                                        className="absolute top-0 left-0 pointer-events-none"
                                        width={Math.max(1, Math.round(scaledDisplayWidth))}
                                        height={Math.max(1, Math.round(scaledDisplayHeight))}
                                        viewBox={`0 0 ${Math.max(1, scaledDisplayWidth)} ${Math.max(1, scaledDisplayHeight)}`}
                                        style={{ zIndex: 16 }}
                                    >
                                        {/* Detected grid bounds */}
                                        <rect
                                            x={alignment.guideOffsetX}
                                            y={alignment.guideOffsetY}
                                            width={alignment.guideCellW * cols}
                                            height={alignment.guideCellH * rows}
                                            fill="none"
                                            stroke={alignment.aligned ? "rgba(34,197,94,0.9)" : "rgba(251,191,36,0.75)"}
                                            strokeWidth={1.25}
                                        />
                                        {/* Vertical detected lines */}
                                        {alignment.v.map((line, idx) => {
                                            const color =
                                                line.diff < 0.5 ? "rgba(34,197,94,0.85)" :
                                                    line.diff < 1.2 ? "rgba(251,191,36,0.8)" :
                                                        "rgba(239,68,68,0.75)";
                                            return (
                                                <line
                                                    key={`v-${idx}`}
                                                    x1={line.x}
                                                    y1={alignment.guideOffsetY}
                                                    x2={line.x}
                                                    y2={alignment.guideOffsetY + alignment.guideCellH * rows}
                                                    stroke={color}
                                                    strokeWidth={1}
                                                    strokeDasharray={alignment.aligned ? undefined : "4 4"}
                                                />
                                            );
                                        })}
                                        {/* Horizontal detected lines */}
                                        {alignment.h.map((line, idx) => {
                                            const color =
                                                line.diff < 0.5 ? "rgba(34,197,94,0.85)" :
                                                    line.diff < 1.2 ? "rgba(251,191,36,0.8)" :
                                                        "rgba(239,68,68,0.75)";
                                            return (
                                                <line
                                                    key={`h-${idx}`}
                                                    x1={alignment.guideOffsetX}
                                                    y1={line.y}
                                                    x2={alignment.guideOffsetX + alignment.guideCellW * cols}
                                                    y2={line.y}
                                                    stroke={color}
                                                    strokeWidth={1}
                                                    strokeDasharray={alignment.aligned ? undefined : "4 4"}
                                                />
                                            );
                                        })}
                                    </svg>
                                )}

                                <div
                                    className="relative z-10"
                                    style={{
                                        width: `${cols * cellWidth}px`,
                                        transform: `translate(${displayOffsetX}px, ${displayOffsetY}px)`,
                                        transformOrigin: 'top left',
                                    }}
                                >
                                    <table
                                        className="text-xs border-collapse"
                                        style={{ tableLayout: 'fixed', borderSpacing: 0 }}
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
