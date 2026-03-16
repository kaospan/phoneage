import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TILE_TYPES, voidGrid } from '@/lib/levelgrid';
import Palette from './Palette';
import { useLevelMapper } from '@/components/level-mapper/useLevelMapper';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SpriteCapture } from './SpriteCapture';
import { CellReferenceManager } from './CellReferenceManager';
import { themes, type ColorTheme } from '@/data/levels';
import { normalizeMapperImage } from './imageNormalization';
import { detectGridLines } from './gridDetection';
import { getAlignmentHints } from './alignmentProfile';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { guessThemeForLevelId, saveCustomLevelDefinition } from '@/lib/customLevels';
import { putLevelImage } from './levelImageStore';
import { getShowCoordsOverlay, setShowCoordsOverlay, UI_SETTINGS_UPDATED_EVENT } from '@/lib/uiSettings';
import { resolveLevelMapperBaseline } from './levelBaseline';
export const LeftPanel: React.FC<{ width: number; onStartResize: () => void; min: number; max: number; }> = ({ width, onStartResize, min, max }) => {
    const {
        rows, cols, setRows, setCols,
        importLevelIndex, setImportLevelIndex,
        compareLevelIndex, setCompareLevelIndex,
        overlayEnabled, setOverlayEnabled, setOverlayOpacity, setOverlayStretch,
        allLevels, imageURL, setImageURL,
        setAllLevels,
        detectGrid, snapToLockedCounts, detectCells,
        zoom, setZoom, gridOffsetX, setGridOffsetX, gridOffsetY, setGridOffsetY,
        gridFrameWidth, setGridFrameWidth, gridFrameHeight, setGridFrameHeight,
        imageScaleX, setImageScaleX, imageScaleY, setImageScaleY, setImageOffsetX, imageOffsetY, setImageOffsetY, lockImageAspect, setLockImageAspect,
        activeTile, setActiveTile, setGrid, grid, setPlayerStart,
        hourglassBrushSeconds, setHourglassBrushSeconds, setHourglassBonusByCell,
        theme, setTheme, timeLimitSeconds, setTimeLimitSeconds, setIsSaved,
        addRowTop, addRowBottom, addColumnLeft, addColumnRight,
        removeRowTop, removeRowBottom, removeColumnLeft, removeColumnRight,
        setLoadedSnapshot, resetToLoadedSnapshot
    } = useLevelMapper();

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [isDetecting, setIsDetecting] = useState(false);
    const [detectionProgress, setDetectionProgress] = useState<string>('');
    const [autoDetectStatus, setAutoDetectStatus] = useState<string>('');
    const [tileFitStatus, setTileFitStatus] = useState<'idle' | 'detecting' | 'ready' | 'failed'>('idle');
    const [tileFit, setTileFit] = useState<null | { rows: number; cols: number; cellWidth: number; cellHeight: number }>(null);
    const [showCoordsOverlay, setShowCoordsOverlayState] = useState(() => getShowCoordsOverlay());

    // Upload flow: choose an image, then decide which level id to apply it to.
    const [applyDialogOpen, setApplyDialogOpen] = useState(false);
    const [pendingUploadFile, setPendingUploadFile] = useState<File | null>(null);
    const [pendingUploadLevelId, setPendingUploadLevelId] = useState<string>('');
    const [pendingUploadAllowOverwrite, setPendingUploadAllowOverwrite] = useState(false);
    const [pendingUploadError, setPendingUploadError] = useState<string>('');

    // Persistent tab state
    const [activeTab, setActiveTab] = useState(() => {
        return localStorage.getItem('levelmapper-active-tab') || 'sprites'; // Default to sprites for capture
    });

    // Save tab preference
    const handleTabChange = (value: string) => {
        setActiveTab(value);
        localStorage.setItem('levelmapper-active-tab', value);
    };

    useEffect(() => {
        const refresh = () => setShowCoordsOverlayState(getShowCoordsOverlay());
        const onStorage = (e: StorageEvent) => {
            if (e.key === 'show_coords_overlay_v1') refresh();
        };
        window.addEventListener(UI_SETTINGS_UPDATED_EVENT, refresh as EventListener);
        window.addEventListener('storage', onStorage);
        return () => {
            window.removeEventListener(UI_SETTINGS_UPDATED_EVENT, refresh as EventListener);
            window.removeEventListener('storage', onStorage);
        };
    }, []);

    const handleSpriteCapture = (cellData: {
        imageData: string;
        tileType: number;
        row: number;
        col: number;
    }) => {
        console.log('Captured sprite:', cellData);
        // Don't switch tabs - stay on capture tab
    };

    // Per-image measurement: estimate the cell size (px) and how many cell-widths fit across/down.
    // This is intentionally fast and only needs floor-tile regularity, not full tile classification.
    useEffect(() => {
        if (!imageURL) {
            setTileFit(null);
            setTileFitStatus('idle');
            return;
        }

        let cancelled = false;
        setTileFitStatus('detecting');

        const run = async () => {
            try {
                const img = await new Promise<HTMLImageElement>((resolve, reject) => {
                    const i = new Image();
                    i.onload = () => resolve(i);
                    i.onerror = () => reject(new Error('Failed to load image for tile sizing'));
                    i.src = imageURL;
                });
                if (cancelled) return;

                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d', { willReadFrequently: true });
                if (!ctx) throw new Error('No canvas context for tile sizing');
                ctx.drawImage(img, 0, 0);

                const detected = detectGridLines(canvas, false, 0, 0, getAlignmentHints());
                if (cancelled) return;

                if (!detected) {
                    setTileFit(null);
                    setTileFitStatus('failed');
                    return;
                }

                setTileFit({
                    rows: detected.rows,
                    cols: detected.cols,
                    cellWidth: detected.cellWidth,
                    cellHeight: detected.cellHeight,
                });
                setTileFitStatus('ready');
            } catch (error) {
                if (cancelled) return;
                console.warn('Tile sizing failed:', error);
                setTileFit(null);
                setTileFitStatus('failed');
            }
        };

        const idle = (window as any).requestIdleCallback as undefined | ((cb: () => void, opts?: { timeout?: number }) => number);
        const cancelIdle = (window as any).cancelIdleCallback as undefined | ((id: number) => void);
        let handle: number | null = null;
        if (idle) {
            handle = idle(() => { void run(); }, { timeout: 450 });
        } else {
            handle = window.setTimeout(() => { void run(); }, 0);
        }

        return () => {
            cancelled = true;
            if (handle !== null) {
                if (idle && cancelIdle) cancelIdle(handle);
                else window.clearTimeout(handle);
            }
        };
    }, [imageURL]);

    const runCellDetection = async () => {
        try {
            setIsDetecting(true);
            setDetectionProgress('Snapping grid to floor tiles...');
            setAutoDetectStatus('');
            await new Promise((resolve) => setTimeout(resolve, 50));
            // Fast path: snap rows/cols + offsets. User can manually fill remaining cells.
            const res = await detectGrid();
            if (res) {
                setAutoDetectStatus(
                    `Detected: ${res.rows}×${res.cols} | Tile: ${Math.round(res.cellWidth)}×${Math.round(res.cellHeight)}px | Confidence: ${res.confidence.toFixed(2)} | Snapped`
                );
            }
        } catch (error) {
            console.error('❌ Error running image cell detection:', error);
            alert(`Auto-detect failed: ${(error as Error).message}`);
        } finally {
            setIsDetecting(false);
            setDetectionProgress('');
        }
    };

    const loadLevelByIndex = async (idx: number) => {
        const lvl = allLevels[idx];
        if (!lvl?.grid) return;

        const baseline = await resolveLevelMapperBaseline(lvl);
        setRows(baseline.rows);
        setCols(baseline.cols);
        setGrid(baseline.grid.map((row) => [...row]));
        setHourglassBonusByCell({ ...(baseline.hourglassBonusByCell ?? {}) });
        setImageURL(baseline.imageURL);
        setOverlayEnabled(baseline.overlayEnabled);
        setOverlayOpacity(baseline.overlayOpacity);
        setOverlayStretch(baseline.overlayStretch);
        setGridOffsetX(baseline.gridOffsetX);
        setGridOffsetY(baseline.gridOffsetY);
        setGridFrameWidth(baseline.gridFrameWidth);
        setGridFrameHeight(baseline.gridFrameHeight);
        setZoom(baseline.zoom);
        setImageScaleX(baseline.imageScaleX);
        setImageScaleY(baseline.imageScaleY);
        setImageOffsetX(baseline.imageOffsetX);
        setImageOffsetY(baseline.imageOffsetY);
        setLockImageAspect(baseline.lockImageAspect);
        setPlayerStart(baseline.playerStart ? { ...baseline.playerStart } : null);
        setTheme(baseline.theme);
        setTimeLimitSeconds(baseline.timeLimitSeconds);

        setLoadedSnapshot({
            levelId: baseline.levelId,
            grid: baseline.grid,
            playerStart: baseline.playerStart,
            theme: baseline.theme,
            timeLimitSeconds: baseline.timeLimitSeconds,
            hourglassBonusByCell: baseline.hourglassBonusByCell,
            imageURL: baseline.imageURL,
            overlayEnabled: baseline.overlayEnabled,
            overlayOpacity: baseline.overlayOpacity,
            overlayStretch: baseline.overlayStretch,
            imageScaleX: baseline.imageScaleX,
            imageScaleY: baseline.imageScaleY,
            imageOffsetX: baseline.imageOffsetX,
            imageOffsetY: baseline.imageOffsetY,
            lockImageAspect: baseline.lockImageAspect,
            zoom: baseline.zoom,
            gridOffsetX: baseline.gridOffsetX,
            gridOffsetY: baseline.gridOffsetY,
            gridFrameWidth: baseline.gridFrameWidth,
            gridFrameHeight: baseline.gridFrameHeight,
        });
    };

    return (
        <div
            className="relative flex h-full min-h-0 w-full shrink-0 flex-col overflow-hidden rounded-xl border border-border/60 bg-card/95 p-2 shadow-sm lg:w-auto"
            style={{ width, minWidth: min, maxWidth: max, maxHeight: '100%' }}
        >
            {/* File Upload - Always visible across all tabs */}
            <div className="mb-2 shrink-0 border-b border-border/60 pb-2">
                <div className="flex flex-wrap items-center gap-1.5">
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="text-sm"
                        onChange={async (e) => {
                            try {
                                console.log('📁 File input onChange triggered');
                                const f = e.target.files?.[0];
                                if (!f) {
                                    console.log('❌ No file selected');
                                    return;
                                }

                                console.log('📷 File selected:', f.name, f.type, f.size, 'bytes');

                                // Suggest a target level:
                                // 1) from filename (e.g. "07.png", "lvl01.png", "level-9.png")
                                // 2) current imported level id
                                // 3) next id after max
                                const levelMatch = f.name.match(/^(\\d{1,3})\\D|(?:lvl|level)[\\s_-]*(\\d{1,3})/i);
                                const raw = levelMatch?.[1] ?? levelMatch?.[2];
                                const fromName = raw ? parseInt(raw, 10) : null;
                                const currentId = importLevelIndex !== null ? allLevels[importLevelIndex]?.id ?? null : null;
                                const maxId = allLevels.reduce((m, l) => Math.max(m, l.id), 0);
                                const suggested = fromName ?? currentId ?? (maxId + 1);

                                setPendingUploadFile(f);
                                setPendingUploadLevelId(String(suggested));
                                setPendingUploadAllowOverwrite(false);
                                setPendingUploadError('');
                                setApplyDialogOpen(true);

                                // Allow selecting the same file again.
                                try { e.currentTarget.value = ''; } catch { /* ignore */ }
                            } catch (error) {
                                console.error('❌ Error in file onChange handler:', error);
                                console.error('Stack trace:', (error as Error).stack);
                                setIsDetecting(false);
                                setDetectionProgress('');
                                alert(`Failed to load image: ${(error as Error).message}`);
                            }
                        }}
                    />
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                            setGrid(voidGrid(rows, cols));
                            setImageURL(null);
                            setHourglassBonusByCell({});
                            setPlayerStart(null);
                            setGridOffsetX(0);
                            setGridOffsetY(0);
                            setGridFrameWidth(null);
                            setGridFrameHeight(null);
                            localStorage.removeItem('levelmapper-import-level');
                            localStorage.removeItem('levelmapper_playerStart');
                            setImportLevelIndex(null);
                            if (fileInputRef.current) fileInputRef.current.value = '';
                        }}
                        title="Clear current level and start fresh"
                    >
                        New Level
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={importLevelIndex === null || importLevelIndex <= 0}
                        title={importLevelIndex === null ? 'Load a level first' : 'Load previous level'}
                        onClick={() => {
                            if (importLevelIndex === null) return;
                            const nextIdx = Math.max(0, importLevelIndex - 1);
                            setImportLevelIndex(nextIdx);
                            setCompareLevelIndex(nextIdx);
                            void loadLevelByIndex(nextIdx);
                        }}
                    >
                        Prev Level
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        disabled={importLevelIndex === null || importLevelIndex >= allLevels.length - 1}
                        title={importLevelIndex === null ? 'Load a level first' : 'Load next level'}
                        onClick={() => {
                            if (importLevelIndex === null) return;
                            const nextIdx = Math.min(allLevels.length - 1, importLevelIndex + 1);
                            setImportLevelIndex(nextIdx);
                            setCompareLevelIndex(nextIdx);
                            void loadLevelByIndex(nextIdx);
                        }}
                    >
                        Next Level
                    </Button>
                    {importLevelIndex !== null && allLevels[importLevelIndex] && (
                        <div className="ml-1 rounded border border-border/60 bg-background px-2 py-1 text-xs text-muted-foreground">
                            Level {allLevels[importLevelIndex]!.id}
                        </div>
                    )}
                </div>
            </div>

            <Dialog
                open={applyDialogOpen}
                onOpenChange={(open) => {
                    setApplyDialogOpen(open);
                    if (!open) setPendingUploadError('');
                }}
            >
                <DialogContent className="max-w-md">
                    <DialogHeader>
                        <DialogTitle>Apply Screenshot To Level</DialogTitle>
                        <DialogDescription>
                            Choose which level number this image belongs to. By default this will not overwrite an existing saved screenshot.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="text-xs text-muted-foreground">
                            File: <span className="font-medium text-foreground">{pendingUploadFile?.name ?? 'None'}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <label className="text-sm text-muted-foreground whitespace-nowrap">Level #</label>
                            <input
                                className="w-28 px-2 py-1 rounded border bg-background text-foreground [color-scheme:dark]"
                                inputMode="numeric"
                                pattern="\\d*"
                                value={pendingUploadLevelId}
                                onChange={(e) => setPendingUploadLevelId(e.target.value)}
                            />
                            <div className="text-xs text-muted-foreground">
                                {(() => {
                                    const id = parseInt(pendingUploadLevelId, 10);
                                    if (!Number.isFinite(id)) return null;
                                    const exists = allLevels.some((l) => l.id === id);
                                    return exists ? 'Existing level' : 'New level';
                                })()}
                            </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm">
                            <input
                                type="checkbox"
                                checked={pendingUploadAllowOverwrite}
                                onChange={(e) => setPendingUploadAllowOverwrite(e.target.checked)}
                            />
                            Allow overwrite (advanced)
                        </label>

                        {pendingUploadError ? (
                            <div className="rounded border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100">
                                {pendingUploadError}
                            </div>
                        ) : null}
                    </div>

                    <DialogFooter>
                        <Button
                            variant="outline"
                            onClick={() => {
                                setApplyDialogOpen(false);
                                setPendingUploadFile(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-emerald-600 hover:bg-emerald-500 text-white"
                            onClick={async () => {
                                const file = pendingUploadFile;
                                const levelId = parseInt(pendingUploadLevelId, 10);
                                if (!file || !Number.isInteger(levelId) || levelId <= 0) {
                                    setPendingUploadError('Enter a valid level number.');
                                    return;
                                }

                                try {
                                    setPendingUploadError('');
                                    setApplyDialogOpen(false);

                                    setIsDetecting(true);
                                    setDetectionProgress(`Saving ${file.name} as Level ${levelId}...`);

                                    const uploadUrl = URL.createObjectURL(file);
                                    const normalizedUrl = await normalizeMapperImage(uploadUrl);
                                    try { URL.revokeObjectURL(uploadUrl); } catch { /* ignore */ }

                                    const blob = await fetch(normalizedUrl).then((r) => r.blob());
                                    await putLevelImage(levelId, blob, file.name, pendingUploadAllowOverwrite);

                                    // Optional: in local dev, also write into `src/assets/NN.png` via the asset-writer helper.
                                    // This cannot work on GitHub Pages (static hosting), but it makes the "upload -> assets folder"
                                    // workflow possible locally when `npm run asset-writer` is running.
                                    if (import.meta.env.DEV) {
                                        const writerBase = (import.meta.env.VITE_ASSET_WRITER_URL as string | undefined) ?? 'http://localhost:8787/write-level-image';
                                        try {
                                            await fetch(`${writerBase}?id=${levelId}&overwrite=${pendingUploadAllowOverwrite ? 1 : 0}`, {
                                                method: 'POST',
                                                body: blob,
                                            });
                                        } catch (err) {
                                            console.warn('asset-writer not available (skipping):', err);
                                        }
                                    }

                                    // Create a new custom level definition only when the level id does not exist yet.
                                    // This never overwrites built-in levels.
                                    let nextLevels = allLevels;
                                    let idx = nextLevels.findIndex((l) => l.id === levelId);
                                    if (idx === -1) {
                                        const newLevel = {
                                            id: levelId,
                                            grid: voidGrid(12, 20),
                                            playerStart: { x: 0, y: 0 },
                                            cavePos: { x: 0, y: 0 },
                                            theme: guessThemeForLevelId(levelId),
                                            autoBuild: false,
                                        } as any;
                                        saveCustomLevelDefinition(newLevel);
                                        nextLevels = [...nextLevels, newLevel].sort((a, b) => a.id - b.id);
                                        setAllLevels(nextLevels);
                                        idx = nextLevels.findIndex((l) => l.id === levelId);
                                    }

                                    setImportLevelIndex(idx);
                                    setCompareLevelIndex(idx);
                                    await loadLevelByIndex(idx);

                                    // Auto-detect immediately (fast snap).
                                    setDetectionProgress('Snapping grid to floor tiles...');
                                    await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
                                    await runCellDetection();
                                } catch (err) {
                                    console.error(err);
                                    setPendingUploadError((err as Error).message ?? 'Upload failed.');
                                    setApplyDialogOpen(true);
                                } finally {
                                    setIsDetecting(false);
                                    setDetectionProgress('');
                                    setPendingUploadFile(null);
                                }
                            }}
                        >
                            Apply + Snap
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            <Tabs value={activeTab} onValueChange={handleTabChange} className="flex min-h-0 flex-1 flex-col">
                <TabsList className="mb-2 grid h-10 w-full shrink-0 grid-cols-3">
                    <TabsTrigger value="editor">Editor</TabsTrigger>
                    <TabsTrigger value="sprites">Capture</TabsTrigger>
                    <TabsTrigger value="references">References</TabsTrigger>
                </TabsList>

                <TabsContent value="editor" className="relative mt-0 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                    {/* Loading Overlay */}
                    {isDetecting && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center rounded bg-slate-950/70 backdrop-blur-sm">
                            <div className="rounded-lg border border-sky-500/30 bg-slate-900/90 p-6 text-sky-50 shadow-lg">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-sky-300"></div>
                                    <div className="text-sm font-medium text-sky-50">{detectionProgress}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex flex-wrap items-center gap-1.5">
                        <label className="text-xs text-muted-foreground">Rows</label>
                        <input
                            className="h-9 w-14 rounded border bg-background px-2 text-foreground [color-scheme:dark]"
                            type="number"
                            min={1}
                            value={rows}
                            onChange={(e) => {
                                const next = Math.max(1, parseInt(e.target.value || '1', 10));
                                if (Number.isFinite(next) && next !== rows) setIsSaved(false);
                                setRows(next);
                            }}
                        />
                        <label className="text-xs text-muted-foreground">Cols</label>
                        <input
                            className="h-9 w-14 rounded border bg-background px-2 text-foreground [color-scheme:dark]"
                            type="number"
                            min={1}
                            value={cols}
                            onChange={(e) => {
                                const next = Math.max(1, parseInt(e.target.value || '1', 10));
                                if (Number.isFinite(next) && next !== cols) setIsSaved(false);
                                setCols(next);
                            }}
                        />
                        <div className="flex flex-wrap items-center gap-1 rounded border border-border/60 bg-background px-2 py-1">
                            <span className="text-xs text-muted-foreground">Rows</span>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={addRowTop} title="Add a void row at the top">+Top</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={addRowBottom} title="Add a void row at the bottom">+Bot</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={removeRowTop} title="Remove the top row">-Top</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={removeRowBottom} title="Remove the bottom row">-Bot</Button>
                        </div>
                        <div className="flex flex-wrap items-center gap-1 rounded border border-border/60 bg-background px-2 py-1">
                            <span className="text-xs text-muted-foreground">Cols</span>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={addColumnLeft} title="Add a void column on the left">+L</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={addColumnRight} title="Add a void column on the right">+R</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={removeColumnLeft} title="Remove the left column">-L</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={removeColumnRight} title="Remove the right column">-R</Button>
                        </div>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={resetToLoadedSnapshot}
                            disabled={importLevelIndex === null}
                            title="Snap back to the layout as it was loaded"
                        >
                            Reset Layout
                        </Button>
                        <select
                            className="h-9 rounded border bg-background px-2 text-xs text-foreground [color-scheme:dark]"
                            value={importLevelIndex ?? ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') return;
                                const idx = parseInt(val, 10);
                                setImportLevelIndex(idx);
                                setCompareLevelIndex(idx);
                                void loadLevelByIndex(idx);
                            }}
                        >
                            <option value="">Load level...</option>
                            {allLevels.map((lvl, idx) => (<option key={lvl.id} value={idx}>Level {lvl.id}</option>))}
                        </select>
                        <Button
                            size="sm"
                            variant="secondary"
                            onClick={runCellDetection}
                            disabled={!imageURL || isDetecting}
                            title="Auto-detect the grid (rows/cols + snap frame/offset). Does not analyze cell types."
                        >
                            Auto-detect Grid
                        </Button>
                        <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                                setIsDetecting(true);
                                setDetectionProgress('Snapping grid to the screenshot before scanning...');
                                try {
                                    await new Promise((resolve) => setTimeout(resolve, 50));
                                    const snapResult = await snapToLockedCounts();
                                    if (!snapResult) return;
                                    setAutoDetectStatus(
                                        `Snapped (kept ${rows}×${cols}) | Tile: ${Math.round(snapResult.cellWidth)}×${Math.round(snapResult.cellHeight)}px | Confidence: ${snapResult.confidence.toFixed(2)}`
                                    );
                                    setDetectionProgress('Scanning cell types into the aligned grid...');
                                    await detectCells();
                                } finally {
                                    setIsDetecting(false);
                                    setDetectionProgress('');
                                }
                            }}
                            disabled={!imageURL || isDetecting}
                            title="Snap the overlay/grid to the screenshot first, then scan saved reference sprites. Fills only void (unknown) cells so manual fixes are preserved."
                        >
                            Align + Scan Cells
                        </Button>
                    </div>
                    {autoDetectStatus && (
                        <div className="mt-1 rounded border border-emerald-500/25 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100">
                            {autoDetectStatus}
                        </div>
                    )}
                    <details className="mt-1.5 rounded border border-border/50 bg-background/30 p-2">
                        <summary className="cursor-pointer select-none text-xs font-semibold text-muted-foreground">
                            Advanced
                        </summary>
                        <div className="mt-2 text-xs text-muted-foreground">
                            Auto-detect ignores locks and will update rows/cols. Use this tool to snap the frame/offset while keeping your current rows/cols.
                        </div>
                        <div className="mt-3 flex items-center justify-between gap-2 rounded border border-border/50 bg-background/40 px-2 py-2">
                            <div className="min-w-0">
                                <div className="text-xs font-semibold text-foreground">In-game coordinates</div>
                                <div className="text-[11px] leading-snug text-muted-foreground">
                                    Show X labels (0..cols-1) across the top row and Y labels (0..rows-1) down the left column in <strong>SPR</strong> view.
                                </div>
                            </div>
                            <label className="flex items-center gap-2 shrink-0 select-none">
                                <input
                                    type="checkbox"
                                    checked={showCoordsOverlay}
                                    onChange={(e) => {
                                        const next = e.target.checked;
                                        setShowCoordsOverlay(next);
                                        setShowCoordsOverlayState(next);
                                    }}
                                />
                                <span className="text-xs text-foreground">Show</span>
                            </label>
                        </div>
                        <div className="mt-2 flex items-center gap-2">
                            <Button
                                size="sm"
                                variant="outline"
                                onClick={async () => {
                                    setIsDetecting(true);
                                    setDetectionProgress('Snapping frame (keeping rows/cols)...');
                                    setAutoDetectStatus('');
                                    try {
                                        const res = await snapToLockedCounts();
                                        if (res) {
                                            setAutoDetectStatus(
                                                `Snapped (kept ${rows}×${cols}) | Tile: ${Math.round(res.cellWidth)}×${Math.round(res.cellHeight)}px | Confidence: ${res.confidence.toFixed(2)}`
                                            );
                                        }
                                    } finally {
                                        setIsDetecting(false);
                                        setDetectionProgress('');
                                    }
                                }}
                                disabled={!imageURL || isDetecting}
                                title="Snap frame/offset using current rows/cols (does not change rows/cols)"
                            >
                                Snap (Keep Rows/Cols)
                            </Button>
                        </div>
                    </details>
                    {imageURL && (
                        <div className="mt-1 text-[11px] leading-tight text-muted-foreground">
                            {tileFitStatus === 'detecting' && <span>Measuring floor tile size and board tile counts...</span>}
                            {tileFitStatus !== 'detecting' && tileFit && (
                                <span>
                                    Floor tile: ~{Math.round(tileFit.cellWidth)}×{Math.round(tileFit.cellHeight)}px. Across: {tileFit.cols}. Down: {tileFit.rows}.
                                    {((tileFit.rows !== rows) || (tileFit.cols !== cols)) && (
                                        <span className="ml-2 text-amber-200">
                                            (Current grid: {rows}×{cols})
                                        </span>
                                    )}
                                </span>
                            )}
                            {tileFitStatus === 'failed' && <span>Could not estimate tile size from this image. Try a cleaner crop or hit Auto-detect.</span>}
                        </div>
                    )}
                    <div className="mt-1 text-[11px] leading-snug text-muted-foreground">
                        Auto-detect finds the screenshot's tile grid and snaps rows/cols + frame. If it misses, adjust crop and re-run.
                    </div>
                    <div className="mt-1 rounded border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-100">
                        Resizing rows/cols or adding/removing edges changes the level layout. Use `Reset Layout` to snap back before saving if you resized by accident.
                    </div>

                    {/* Theme Selector */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded border bg-muted/30 p-2">
                        <label className="text-xs font-semibold text-foreground">Color Theme:</label>
                        <select
                            className="h-9 min-w-[120px] flex-1 rounded border bg-background px-3 text-sm text-foreground [color-scheme:dark]"
                            value={theme || 'default'}
                            onChange={(e) => {
                                const newTheme = e.target.value === 'default' ? undefined : e.target.value as ColorTheme;
                                setTheme(newTheme);
                                setIsSaved(false);
                            }}
                        >
                            <option value="default">Default (Brown)</option>
                            <option value="ocean">Ocean (Blue)</option>
                            <option value="forest">Forest (Green)</option>
                            <option value="sunset">Sunset (Orange/Pink)</option>
                            <option value="lava">Lava (Red)</option>
                            <option value="crystal">Crystal (Purple)</option>
                            <option value="neon">Neon (Cyberpunk)</option>
                            <option value="snow">Snow (White)</option>
                            <option value="gray">Gray (Neutral)</option>
                            <option value="slate">Slate (Cool Gray)</option>
                        </select>
                        {theme && theme !== 'default' && (
                            <div
                                className="w-6 h-6 rounded border-2 border-border shadow-sm"
                                style={{ backgroundColor: themes[theme].floor }}
                                title={`${theme} theme preview`}
                            />
                        )}
                    </div>

                    {/* Per-level timer */}
                    <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded border bg-muted/30 p-2">
                        <label className="text-xs font-semibold text-foreground whitespace-nowrap">Timer:</label>
                        <input
                            className="h-9 w-24 rounded border bg-background px-3 text-sm text-foreground [color-scheme:dark]"
                            type="number"
                            inputMode="numeric"
                            min={0}
                            step={1}
                            placeholder="0"
                            value={timeLimitSeconds ?? ''}
                            onChange={(e) => {
                                const raw = e.target.value;
                                if (raw === '') {
                                    setTimeLimitSeconds(null);
                                    setIsSaved(false);
                                    return;
                                }
                                const n = Math.max(0, Math.round(Number(raw)));
                                setTimeLimitSeconds(n > 0 ? n : null);
                                setIsSaved(false);
                            }}
                            title="Seconds countdown per level (0 disables)"
                        />
                        <div className="text-[11px] text-muted-foreground">sec (0 = off)</div>
                    </div>

                    {/* Bonus Time (+time) brush */}
                    {activeTile === 20 && (
                        <div className="mt-2 flex flex-wrap items-center gap-1.5 rounded border bg-muted/30 p-2">
                            <label className="text-xs font-semibold text-foreground whitespace-nowrap">Bonus Time:</label>
                            <input
                                className="h-9 w-24 rounded border bg-background px-3 text-sm text-foreground [color-scheme:dark]"
                                type="number"
                                inputMode="numeric"
                                min={1}
                                step={1}
                                value={hourglassBrushSeconds}
                                onChange={(e) => {
                                    const raw = e.target.value;
                                    const n = Math.max(1, Math.min(86400, Math.round(Number(raw)) || 0));
                                    setHourglassBrushSeconds(n);
                                }}
                                title="Seconds added when Bonus Time is collected"
                            />
                            <div className="text-[11px] text-muted-foreground">sec bonus (needs timer on)</div>
                        </div>
                    )}
                    <div className="mt-1.5 relative">
                        {imageURL ? (
                            <div className="text-sm p-4 border rounded border-emerald-500/25 bg-emerald-500/10 text-emerald-100">
                                ✅ Image loaded! Switch to <strong>Grid Editor</strong> tab to see the overlay.
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground p-6 border rounded">Upload a screenshot above to get started</div>
                        )}
                    </div>
                    <Palette activeTile={activeTile} setActiveTile={setActiveTile} />
                </TabsContent>

                <TabsContent value="sprites" className="mt-0 min-h-0 flex-1 overflow-y-auto pr-1">
                    <SpriteCapture
                        imageURL={imageURL}
                        rows={rows}
                        cols={cols}
                        gridOffsetX={gridOffsetX}
                        gridOffsetY={gridOffsetY}
                        gridFrameWidth={gridFrameWidth}
                        gridFrameHeight={gridFrameHeight}
                        grid={grid}
                        setGrid={setGrid}
                        onCapture={handleSpriteCapture}
                    />
                </TabsContent>

                <TabsContent value="references" className="mt-0 min-h-0 flex-1 overflow-y-auto pr-1">
                    <CellReferenceManager />
                </TabsContent>
            </Tabs>

            <div
                style={{ position: 'absolute', top: 0, right: -8, width: 16, height: '100%', cursor: 'ew-resize', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseDown={onStartResize}
                title="Resize horizontally"
            >
                <span style={{ fontSize: 18, color: '#aaa', userSelect: 'none' }}>&#8596;</span>
            </div>
        </div>
    );
};

export default LeftPanel;
