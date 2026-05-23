import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TILE_TYPES, voidGrid } from '@/lib/levelgrid';
import Palette from './Palette';
import { useLevelMapper } from '@/components/level-mapper/useLevelMapper';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SpriteCapture } from './SpriteCapture';
import { CellReferenceManager } from './CellReferenceManager';
import { themes, type ColorTheme, type Level } from '@/data/levels';
import { normalizeMapperImage } from './imageNormalization';
import { detectGridLines } from './gridDetection';
import { getAlignmentHints } from './alignmentProfile';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { guessThemeForLevelId, saveCustomLevelDefinition } from '@/lib/customLevels';
import { putLevelImage } from './levelImageStore';
import { getShowCoordsOverlay, setShowCoordsOverlay, UI_SETTINGS_UPDATED_EVENT } from '@/lib/uiSettings';
import { resolveLevelMapperBaseline } from './levelBaseline';
import { DEFAULT_MAPPER_COLS, DEFAULT_MAPPER_ROWS, createDefaultMapperVoidGrid } from './mapperDefaults';
import { MapperMetricPill, MapperPanelFrame, MapperResizeHandle, MapperSection } from './MapperChrome';
export const LeftPanel: React.FC<{ width: number; onStartResize: () => void; min: number; max: number; }> = ({ width, onStartResize, min, max }) => {
    type IdleWindow = Window & typeof globalThis & {
        requestIdleCallback?: (cb: () => void, opts?: { timeout?: number }) => number;
        cancelIdleCallback?: (id: number) => void;
    };

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
        imageScaleX, setImageScaleX, imageScaleY, setImageScaleY, imageOffsetX, setImageOffsetX, imageOffsetY, setImageOffsetY, lockImageAspect, setLockImageAspect,
        activeTile, setActiveTile, setGrid, grid, setPlayerStart,
        hourglassBrushSeconds, setHourglassBrushSeconds, setHourglassBonusByCell,
        theme, setTheme, timeLimitSeconds, setTimeLimitSeconds, setIsSaved, currentLevelProvenance,
        addRowTop, addRowBottom, addColumnLeft, addColumnRight,
        removeRowTop, removeRowBottom, removeColumnLeft, removeColumnRight,
        setLoadedSnapshot, resetToLoadedSnapshot, replaceGridShape
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

    const currentLevel = importLevelIndex !== null ? allLevels[importLevelIndex] ?? null : null;
    const currentLevelTitle = currentLevel ? `Level ${currentLevel.id}` : 'Level Mapper';
    const currentLevelStatusLabel =
        currentLevelProvenance === 'user-edited'
            ? 'User'
            : currentLevelProvenance === 'ai-detected'
                ? 'AI'
                : 'Default';
    const selectedTile = TILE_TYPES.find((tile) => tile.id === activeTile) ?? TILE_TYPES[0];
    const currentThemeKey = theme || 'default';
    const themePreview = themes[currentThemeKey]?.floor ?? themes.default.floor;
    const canGoPrev = importLevelIndex !== null && importLevelIndex > 0;
    const canGoNext = importLevelIndex !== null && importLevelIndex < allLevels.length - 1;
    const boardShapeLabel = `${rows} × ${cols}`;
    const imageStatusLabel = imageURL ? (overlayEnabled ? 'Overlay Active' : 'Image Loaded') : 'No Image';
    const tileFitSummary = imageURL
        ? tileFitStatus === 'detecting'
            ? 'Measuring screenshot tile size...'
            : tileFit
                ? `Detected floor tile ~${Math.round(tileFit.cellWidth)}×${Math.round(tileFit.cellHeight)}px across ${tileFit.cols}×${tileFit.rows}`
                : 'No reliable floor-tile measurement yet.'
        : 'Upload a screenshot to enable alignment and scan tools.';
    const triggerFileUpload = () => fileInputRef.current?.click();

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

        const idleWindow = window as IdleWindow;
        const idle = idleWindow.requestIdleCallback;
        const cancelIdle = idleWindow.cancelIdleCallback;
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
            provenance: baseline.provenance,
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
        <MapperPanelFrame
            className="shrink-0 lg:w-auto"
            style={{ width, minWidth: min, maxWidth: max, maxHeight: '100%' }}
        >
            <div className="border-b border-white/10 bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.12),transparent_42%),linear-gradient(180deg,rgba(255,255,255,0.04),transparent)] px-5 py-4">
                <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                        try {
                            console.log('📁 File input onChange triggered');
                            const f = e.target.files?.[0];
                            if (!f) {
                                console.log('❌ No file selected');
                                return;
                            }

                            console.log('📷 File selected:', f.name, f.type, f.size, 'bytes');

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

                <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                        <div className="text-[10px] font-black uppercase tracking-[0.22em] text-stone-400">
                            Control Deck
                        </div>
                        <div className="mt-1 text-xl font-black tracking-[0.08em] text-stone-50">
                            {currentLevelTitle}
                        </div>
                        <div className="mt-1 text-xs leading-relaxed text-stone-400">
                            Load screenshots, steer level metadata, and prep the board before you move into alignment or paint work.
                        </div>
                    </div>
                    <div className="rounded-full border border-white/10 bg-white/[0.05] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-stone-200">
                        {currentLevelStatusLabel}
                    </div>
                </div>

                <div className="mt-4 grid gap-2 sm:grid-cols-2">
                    <MapperMetricPill label="Board" value={boardShapeLabel} />
                    <MapperMetricPill label="Theme" value={currentThemeKey === 'default' ? 'Default' : currentThemeKey} tone="warning" />
                    <MapperMetricPill label="Selected Tile" value={selectedTile.name} tone="info" />
                    <MapperMetricPill label="Screenshot" value={imageStatusLabel} tone={imageURL ? 'success' : 'default'} />
                </div>

                <div className="mt-4 flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]"
                        onClick={() => {
                            replaceGridShape(createDefaultMapperVoidGrid());
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
                    <select
                        className="h-9 min-w-[148px] rounded-2xl border border-white/10 bg-stone-900/85 px-3 text-xs text-stone-100 [color-scheme:dark]"
                        value={importLevelIndex ?? ''}
                        onChange={(e) => {
                            const val = e.target.value;
                            if (val === '') return;
                            const idx = parseInt(val, 10);
                            setImportLevelIndex(idx);
                            setCompareLevelIndex(idx);
                            void loadLevelByIndex(idx);
                        }}
                        title="Load an existing level into the mapper"
                    >
                        <option value="">Load level...</option>
                        {allLevels.map((lvl, idx) => (<option key={lvl.id} value={idx}>Level {lvl.id}</option>))}
                    </select>
                    <Button
                        size="sm"
                        className="bg-amber-300 text-stone-950 hover:bg-amber-200"
                        onClick={triggerFileUpload}
                    >
                        Upload Screenshot
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]"
                        disabled={!canGoPrev}
                        title={importLevelIndex === null ? 'Load a level first' : 'Load previous level'}
                        onClick={() => {
                            if (importLevelIndex === null) return;
                            const nextIdx = Math.max(0, importLevelIndex - 1);
                            setImportLevelIndex(nextIdx);
                            setCompareLevelIndex(nextIdx);
                            void loadLevelByIndex(nextIdx);
                        }}
                    >
                        Prev
                    </Button>
                    <Button
                        size="sm"
                        variant="outline"
                        className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]"
                        disabled={!canGoNext}
                        title={importLevelIndex === null ? 'Load a level first' : 'Load next level'}
                        onClick={() => {
                            if (importLevelIndex === null) return;
                            const nextIdx = Math.min(allLevels.length - 1, importLevelIndex + 1);
                            setImportLevelIndex(nextIdx);
                            setCompareLevelIndex(nextIdx);
                            void loadLevelByIndex(nextIdx);
                        }}
                    >
                        Next
                    </Button>
                </div>

                <div className="mt-4 grid gap-3 xl:grid-cols-[1.1fr,0.9fr]">
                    <div className="rounded-[20px] border border-white/10 bg-white/[0.045] px-4 py-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Theme + Timer</div>
                        <div className="mt-3 grid gap-3 sm:grid-cols-[1fr,auto]">
                            <div className="flex items-center gap-2">
                                <select
                                    className="h-10 min-w-[120px] flex-1 rounded-2xl border border-white/10 bg-stone-900/85 px-3 text-sm text-stone-100 [color-scheme:dark]"
                                    value={currentThemeKey}
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
                                <div
                                    className="h-10 w-10 shrink-0 rounded-2xl border border-white/10 shadow-sm"
                                    style={{ backgroundColor: themePreview }}
                                    title={`${currentThemeKey} theme preview`}
                                />
                            </div>
                            <div className="flex items-center gap-2">
                                <input
                                    className="h-10 w-24 rounded-2xl border border-white/10 bg-stone-900/85 px-3 text-sm text-stone-100 [color-scheme:dark]"
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
                                <div className="text-[11px] text-stone-400">sec</div>
                            </div>
                        </div>
                    </div>

                    <div className="rounded-[20px] border border-white/10 bg-white/[0.045] px-4 py-3">
                        <div className="text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Alignment Readiness</div>
                        <div className="mt-3 text-xs leading-relaxed text-stone-300">
                            {tileFitSummary}
                        </div>
                    </div>
                </div>
            </div>

            <Dialog
                open={applyDialogOpen}
                onOpenChange={(open) => {
                    setApplyDialogOpen(open);
                    if (!open) setPendingUploadError('');
                }}
            >
                <DialogContent className="max-w-md border-white/10 bg-stone-950/95 text-stone-100">
                    <DialogHeader>
                        <DialogTitle className="text-stone-50">Apply Screenshot To Level</DialogTitle>
                        <DialogDescription className="text-stone-400">
                            Choose which level number this image belongs to. By default this will not overwrite an existing saved screenshot.
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3">
                        <div className="text-xs text-stone-400">
                            File: <span className="font-medium text-stone-100">{pendingUploadFile?.name ?? 'None'}</span>
                        </div>

                        <div className="flex items-center gap-2">
                            <label className="text-sm whitespace-nowrap text-stone-300">Level #</label>
                            <input
                                className="w-28 rounded-2xl border border-white/10 bg-stone-900/85 px-3 py-2 text-stone-100 [color-scheme:dark]"
                                inputMode="numeric"
                                pattern="\\d*"
                                value={pendingUploadLevelId}
                                onChange={(e) => setPendingUploadLevelId(e.target.value)}
                            />
                            <div className="text-xs text-stone-400">
                                {(() => {
                                    const id = parseInt(pendingUploadLevelId, 10);
                                    if (!Number.isFinite(id)) return null;
                                    const exists = allLevels.some((l) => l.id === id);
                                    return exists ? 'Existing level' : 'New level';
                                })()}
                            </div>
                        </div>

                        <label className="flex items-center gap-2 text-sm text-stone-300">
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
                            className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]"
                            onClick={() => {
                                setApplyDialogOpen(false);
                                setPendingUploadFile(null);
                            }}
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-emerald-600 text-white hover:bg-emerald-500"
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
                                        const newLevel: Level = {
                                            id: levelId,
                                            grid: voidGrid(DEFAULT_MAPPER_ROWS, DEFAULT_MAPPER_COLS),
                                            playerStart: { x: 0, y: 0 },
                                            cavePos: { x: 0, y: 0 },
                                            theme: guessThemeForLevelId(levelId),
                                            autoBuild: false,
                                        };
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

            <Tabs value={activeTab} onValueChange={handleTabChange} className="flex min-h-0 flex-1 flex-col px-4 py-4">
                <TabsList className="mb-3 grid h-11 w-full shrink-0 grid-cols-3 rounded-2xl border border-white/10 bg-white/[0.04] p-1">
                    <TabsTrigger value="editor" className="rounded-xl data-[state=active]:bg-amber-300 data-[state=active]:text-stone-950">Editor</TabsTrigger>
                    <TabsTrigger value="sprites" className="rounded-xl data-[state=active]:bg-amber-300 data-[state=active]:text-stone-950">Capture</TabsTrigger>
                    <TabsTrigger value="references" className="rounded-xl data-[state=active]:bg-amber-300 data-[state=active]:text-stone-950">References</TabsTrigger>
                </TabsList>

                <TabsContent value="editor" className="relative mt-0 min-h-0 flex-1 space-y-3 overflow-y-auto pr-1">
                    {isDetecting && (
                        <div className="absolute inset-0 z-50 flex items-center justify-center rounded-[24px] bg-stone-950/75 backdrop-blur-sm">
                            <div className="rounded-[22px] border border-sky-300/20 bg-stone-900/95 p-6 text-sky-50 shadow-lg">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="h-8 w-8 animate-spin rounded-full border-b-2 border-sky-300"></div>
                                    <div className="text-sm font-medium text-sky-50">{detectionProgress}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    <MapperSection
                        title="Board Shape"
                        eyebrow="Layout Control"
                        description="Adjust rows, columns, and edge padding for the board currently loaded in the mapper."
                        contentClassName="space-y-3 pt-3"
                    >
                        <div className="flex flex-wrap items-center gap-2">
                            <label className="text-xs font-semibold uppercase tracking-wide text-stone-400">Rows</label>
                            <input
                                className="h-10 w-16 rounded-2xl border border-white/10 bg-stone-900/85 px-3 text-sm text-stone-100 [color-scheme:dark]"
                                type="number"
                                min={1}
                                value={rows}
                                onChange={(e) => {
                                    const next = Math.max(1, parseInt(e.target.value || String(DEFAULT_MAPPER_ROWS), 10));
                                    if (Number.isFinite(next) && next !== rows) setIsSaved(false);
                                    setRows(next);
                                }}
                            />
                            <label className="text-xs font-semibold uppercase tracking-wide text-stone-400">Cols</label>
                            <input
                                className="h-10 w-16 rounded-2xl border border-white/10 bg-stone-900/85 px-3 text-sm text-stone-100 [color-scheme:dark]"
                                type="number"
                                min={1}
                                value={cols}
                                onChange={(e) => {
                                    const next = Math.max(1, parseInt(e.target.value || String(DEFAULT_MAPPER_COLS), 10));
                                    if (Number.isFinite(next) && next !== cols) setIsSaved(false);
                                    setCols(next);
                                }}
                            />
                            <Button
                                size="sm"
                                variant="outline"
                                className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]"
                                onClick={resetToLoadedSnapshot}
                                disabled={importLevelIndex === null}
                                title="Snap back to the layout as it was loaded"
                            >
                                Reset Layout
                            </Button>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2">
                            <div className="rounded-2xl border border-white/10 bg-stone-900/55 p-3">
                                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Rows</div>
                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]" onClick={addRowTop} title="Add a void row at the top">+ Top</Button>
                                    <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]" onClick={addRowBottom} title="Add a void row at the bottom">+ Bottom</Button>
                                    <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]" onClick={removeRowTop} title="Remove the top row">- Top</Button>
                                    <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]" onClick={removeRowBottom} title="Remove the bottom row">- Bottom</Button>
                                </div>
                            </div>
                            <div className="rounded-2xl border border-white/10 bg-stone-900/55 p-3">
                                <div className="mb-2 text-[10px] font-black uppercase tracking-[0.18em] text-stone-400">Columns</div>
                                <div className="flex flex-wrap gap-2">
                                    <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]" onClick={addColumnLeft} title="Add a void column on the left">+ Left</Button>
                                    <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]" onClick={addColumnRight} title="Add a void column on the right">+ Right</Button>
                                    <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]" onClick={removeColumnLeft} title="Remove the left column">- Left</Button>
                                    <Button size="sm" variant="outline" className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]" onClick={removeColumnRight} title="Remove the right column">- Right</Button>
                                </div>
                            </div>
                        </div>

                        <div className="rounded-2xl border border-amber-300/20 bg-amber-500/10 px-3 py-2 text-[11px] leading-snug text-amber-100">
                            Resizing rows or columns changes the level layout. Use <strong>Reset Layout</strong> if you want to return to the currently loaded baseline before saving.
                        </div>
                    </MapperSection>

                    <MapperSection
                        title="Detection Workflow"
                        eyebrow="Alignment"
                        description="Snap the board to a screenshot first, then optionally scan tiles into the aligned grid."
                        contentClassName="space-y-3 pt-3"
                    >
                        <div className="flex flex-wrap gap-2">
                            <Button
                                size="sm"
                                variant="secondary"
                                className="bg-sky-600 text-white hover:bg-sky-500"
                                onClick={runCellDetection}
                                disabled={!imageURL || isDetecting}
                                title="Auto-detect the grid (rows/cols + snap frame/offset). Does not analyze cell types."
                            >
                                Auto-detect Grid
                            </Button>
                            <Button
                                size="sm"
                                variant="outline"
                                className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]"
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
                            <Button
                                size="sm"
                                variant="outline"
                                className="border-white/10 bg-white/[0.03] text-stone-100 hover:bg-white/[0.08]"
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

                        {autoDetectStatus && (
                            <div className="rounded-2xl border border-emerald-300/20 bg-emerald-500/10 px-3 py-2 text-[11px] text-emerald-100">
                                {autoDetectStatus}
                            </div>
                        )}

                        <div className="rounded-2xl border border-white/10 bg-stone-900/55 px-3 py-3 text-[11px] leading-relaxed text-stone-300">
                            {tileFitSummary}
                            {imageURL && tileFit && ((tileFit.rows !== rows) || (tileFit.cols !== cols)) && (
                                <span className="ml-2 text-amber-100">
                                    Current grid is {rows}×{cols}.
                                </span>
                            )}
                        </div>

                        <details className="rounded-2xl border border-white/10 bg-stone-900/40 p-3">
                            <summary className="cursor-pointer select-none text-xs font-semibold text-stone-300">
                                Advanced
                            </summary>
                            <div className="mt-2 text-xs leading-relaxed text-stone-400">
                                Auto-detect may change rows and columns. Use the snap-only path when you want to keep your existing board shape and only realign the frame.
                            </div>
                            <div className="mt-3 flex items-center justify-between gap-2 rounded-2xl border border-white/10 bg-white/[0.03] px-3 py-3">
                                <div className="min-w-0">
                                    <div className="text-xs font-semibold text-stone-100">In-game coordinates</div>
                                    <div className="text-[11px] leading-snug text-stone-400">
                                        Show X labels across the top row and Y labels down the left column in <strong>SPR</strong> view.
                                    </div>
                                </div>
                                <label className="flex shrink-0 items-center gap-2 select-none text-xs text-stone-100">
                                    <input
                                        type="checkbox"
                                        checked={showCoordsOverlay}
                                        onChange={(e) => {
                                            const next = e.target.checked;
                                            setShowCoordsOverlay(next);
                                            setShowCoordsOverlayState(next);
                                        }}
                                    />
                                    Show
                                </label>
                            </div>
                        </details>
                    </MapperSection>

                    {activeTile === 20 && (
                        <MapperSection
                            title="Bonus Time Brush"
                            eyebrow="Tile Metadata"
                            description="Tile 20 stores its own per-cell time bonus. Set the amount that gets applied while painting."
                            contentClassName="pt-3"
                        >
                            <div className="flex flex-wrap items-center gap-2">
                                <input
                                    className="h-10 w-24 rounded-2xl border border-white/10 bg-stone-900/85 px-3 text-sm text-stone-100 [color-scheme:dark]"
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
                                <div className="text-[11px] text-stone-400">seconds added when the hourglass is collected</div>
                            </div>
                        </MapperSection>
                    )}

                    <MapperSection
                        title="Tile Palette"
                        eyebrow="Paint Tools"
                        description="Choose the active tile and then paint directly in the center editor."
                        contentClassName="space-y-3 pt-3"
                    >
                        <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-stone-900/55 px-3 py-3">
                            <span className="inline-block h-8 w-8 rounded-2xl border border-white/10 shadow-sm" style={{ backgroundColor: selectedTile.color }} />
                            <div className="min-w-0">
                                <div className="text-xs font-semibold text-stone-100">{selectedTile.name}</div>
                                <div className="text-[11px] text-stone-400">Tile ID {selectedTile.id}</div>
                            </div>
                        </div>
                        <Palette activeTile={activeTile} setActiveTile={setActiveTile} />
                    </MapperSection>
                </TabsContent>

                <TabsContent value="sprites" className="mt-0 min-h-0 flex-1 overflow-y-auto pr-1">
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-2">
                        <SpriteCapture
                            imageURL={imageURL}
                            rows={rows}
                            cols={cols}
                            gridOffsetX={gridOffsetX}
                            gridOffsetY={gridOffsetY}
                            gridFrameWidth={gridFrameWidth}
                            gridFrameHeight={gridFrameHeight}
                            imageScaleX={imageScaleX}
                            imageScaleY={imageScaleY}
                            imageOffsetX={imageOffsetX}
                            imageOffsetY={imageOffsetY}
                            grid={grid}
                            setGrid={setGrid}
                            onCapture={handleSpriteCapture}
                        />
                    </div>
                </TabsContent>

                <TabsContent value="references" className="mt-0 min-h-0 flex-1 overflow-y-auto pr-1">
                    <div className="rounded-[22px] border border-white/10 bg-white/[0.04] p-2">
                        <CellReferenceManager />
                    </div>
                </TabsContent>
            </Tabs>

            <MapperResizeHandle
                side="right"
                onMouseDown={onStartResize}
                title="Resize control deck"
            />
        </MapperPanelFrame>
    );
};

export default LeftPanel;
