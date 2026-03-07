import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TILE_TYPES, voidGrid } from '@/lib/levelgrid';
import Palette from './Palette';
import { useLevelMapper } from '@/components/level-mapper/useLevelMapper';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SpriteCapture } from './SpriteCapture';
import { CellReferenceManager } from './CellReferenceManager';
import { themes, type ColorTheme } from '@/data/levels';
import { normalizeMapperImage } from './imageNormalization';
const isPlaceholderGrid = (levelGrid?: number[][]) => {
    if (!levelGrid || levelGrid.length === 0) return true;
    if (levelGrid.length === 1 && levelGrid[0]?.length === 1 && levelGrid[0][0] === 5) return true;
    return levelGrid.every((row) => row.every((cell) => cell === 5));
};

const getEditableGridForLevel = (levelGrid?: number[][]) => {
    if (!isPlaceholderGrid(levelGrid)) {
        return levelGrid?.map((row) => [...row]) ?? voidGrid(11, 20);
    }
    return voidGrid(11, 20);
};

export const LeftPanel: React.FC<{ width: number; onStartResize: () => void; min: number; max: number; }> = ({ width, onStartResize, min, max }) => {
    const {
        rows, cols, setRows, setCols,
        showGrid, setShowGrid,
        importLevelIndex, setImportLevelIndex,
        compareLevelIndex, setCompareLevelIndex,
        overlayEnabled, setOverlayEnabled,
        allLevels, imageURL, setImageURL,
        detectGrid, detectCells, detectGridAndCells, useDetectCurrentCounts, setUseDetectCurrentCounts,
        zoom, setZoom, gridOffsetX, setGridOffsetX, gridOffsetY, setGridOffsetY,
        gridFrameWidth, setGridFrameWidth, gridFrameHeight, setGridFrameHeight,
        activeTile, setActiveTile, setGrid, grid, setPlayerStart,
        theme, setTheme, setIsSaved,
        addRowTop, addRowBottom, addColumnLeft, addColumnRight,
        removeRowTop, removeRowBottom, removeColumnLeft, removeColumnRight,
        setLoadedSnapshot, resetToLoadedSnapshot
    } = useLevelMapper();

    const fileInputRef = useRef<HTMLInputElement | null>(null);
    const [isDetecting, setIsDetecting] = useState(false);
    const [detectionProgress, setDetectionProgress] = useState<string>('');

    // Persistent tab state
    const [activeTab, setActiveTab] = useState(() => {
        return localStorage.getItem('levelmapper-active-tab') || 'sprites'; // Default to sprites for capture
    });

    // Save tab preference
    const handleTabChange = (value: string) => {
        setActiveTab(value);
        localStorage.setItem('levelmapper-active-tab', value);
    };

    const handleSpriteCapture = (cellData: {
        imageData: string;
        tileType: number;
        row: number;
        col: number;
    }) => {
        console.log('Captured sprite:', cellData);
        // Don't switch tabs - stay on capture tab
    };

    const runCellDetection = async () => {
        if (!imageURL) {
            alert('Load an image first');
            return;
        }

        try {
            setIsDetecting(true);
            setDetectionProgress('Analyzing cell types...');
            await new Promise((resolve) => setTimeout(resolve, 50));
            await detectCells();
        } catch (error) {
            console.error('❌ Error running image cell detection:', error);
            alert(`Cell detection failed: ${(error as Error).message}`);
        } finally {
            setIsDetecting(false);
            setDetectionProgress('');
        }
    };

    const resolveLevelForMapper = async (levelIndex: number) => {
        const lvl = allLevels[levelIndex];
        if (!lvl) return null;
        if (lvl.autoBuild && isPlaceholderGrid(lvl.grid)) {
            return {
                ...lvl,
                grid: getEditableGridForLevel(lvl.grid),
            };
        }

        return lvl;
    };

    return (
        <div className="w-full lg:w-auto bg-card rounded border p-2 relative overflow-y-auto" style={{ width, minWidth: min, maxWidth: max, maxHeight: '100vh' }}>
            {/* File Upload - Always visible across all tabs */}
            <div className="mb-3 pb-3 border-b">
                <div className="flex items-center gap-2 flex-wrap">
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

                                // Auto-detect level from filename (e.g., "lvl01.png" or "level1.png")
                                const levelMatch = f.name.match(/(?:lvl|level)[\s_-]*(\d+)/i);
                                if (levelMatch) {
                                    const levelNum = parseInt(levelMatch[1], 10);
                                    const levelIndex = allLevels.findIndex(l => l.id === levelNum);
                                    if (levelIndex !== -1) {
                                        console.log(`🎯 Auto-detected Level ${levelNum} from filename`);
                                        setImportLevelIndex(levelIndex);
                                        setCompareLevelIndex(levelIndex);

                                        // Auto-load the level's grid, player start, and theme
                                        const lvl = allLevels[levelIndex];
                                        setRows(lvl.grid.length);
                                        setCols(lvl.grid[0]?.length || 0);
                                        setGrid(lvl.grid.map(row => [...row]));
                                        setGridOffsetX(0);
                                        setGridOffsetY(0);
                                        setGridFrameWidth(null);
                                        setGridFrameHeight(null);

                                        if (lvl.playerStart) {
                                            setPlayerStart({ x: lvl.playerStart.x, y: lvl.playerStart.y });
                                        }
                                        if (lvl.theme) {
                                            setTheme(lvl.theme);
                                        }

                                        // Enable overlay by default
                                        setOverlayEnabled(true);
                                    }
                                }

                                const url = URL.createObjectURL(f);
                                console.log('✓ Object URL created:', url);

                                setGridOffsetX(0);
                                setGridOffsetY(0);
                                setGridFrameWidth(null);
                                setGridFrameHeight(null);
                                // Normalize (auto-crop borders/HUD) but do not auto-run detection here.
                                // Detection can be heavy; the user triggers it explicitly via "Auto-detect Cells".
                                const normalizedURL = await normalizeMapperImage(url);
                                setImageURL(normalizedURL);
                                setOverlayEnabled(true);
                                setIsDetecting(false);
                                setDetectionProgress('');

                                // Release the original object URL (normalized image is cached separately).
                                try { URL.revokeObjectURL(url); } catch { /* ignore */ }
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
                </div>
            </div>

            <Tabs value={activeTab} onValueChange={handleTabChange}>
                <TabsList className="grid w-full grid-cols-3 mb-2">
                    <TabsTrigger value="editor">Editor</TabsTrigger>
                    <TabsTrigger value="sprites">Capture</TabsTrigger>
                    <TabsTrigger value="references">References</TabsTrigger>
                </TabsList>

                <TabsContent value="editor" className="space-y-2 relative">
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

                    <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-xs text-muted-foreground">Rows</label>
                        <input className="w-16 px-2 py-1 rounded border bg-background" type="number" min={1} value={rows} onChange={(e) => setRows(parseInt(e.target.value || '1', 10))} />
                        <label className="text-xs text-muted-foreground">Cols</label>
                        <input className="w-16 px-2 py-1 rounded border bg-background" type="number" min={1} value={cols} onChange={(e) => setCols(parseInt(e.target.value || '1', 10))} />
                        <div className="flex items-center gap-1 rounded border border-border/60 bg-background px-2 py-1">
                            <span className="text-xs text-muted-foreground">Rows</span>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={addRowTop} title="Add a void row at the top">+Top</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={addRowBottom} title="Add a void row at the bottom">+Bot</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={removeRowTop} title="Remove the top row">-Top</Button>
                            <Button size="sm" variant="outline" className="h-7 px-2" onClick={removeRowBottom} title="Remove the bottom row">-Bot</Button>
                        </div>
                        <div className="flex items-center gap-1 rounded border border-border/60 bg-background px-2 py-1">
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
                        <label className="flex items-center gap-1 rounded border border-border/60 bg-background px-2 py-1 text-xs">
                            <input
                                type="checkbox"
                                checked={useDetectCurrentCounts}
                                onChange={(e) => setUseDetectCurrentCounts(e.target.checked)}
                            />
                            Lock current rows/cols
                        </label>
                        <select
                            className="px-2 py-1 rounded border bg-background text-xs"
                            value={importLevelIndex ?? ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') return;
                                const idx = parseInt(val, 10);
                                setImportLevelIndex(idx);
                                setCompareLevelIndex(idx);
                                void (async () => {
                                    const lvl = await resolveLevelForMapper(idx);
                                    if (!lvl?.grid) return;
                                    setRows(lvl.grid.length);
                                    setCols(lvl.grid[0]?.length || 0);
                                    setGrid(getEditableGridForLevel(lvl.grid));
                                    const normalizedURL = lvl.image ? await normalizeMapperImage(lvl.image) : null;
                                    setImageURL(normalizedURL);
                                    setOverlayEnabled(Boolean(normalizedURL));
                                    setGridOffsetX(0);
                                    setGridOffsetY(0);
                                    setGridFrameWidth(null);
                                    setGridFrameHeight(null);
                                    setZoom(1);
                                    if (lvl.playerStart) {
                                        setPlayerStart({ x: lvl.playerStart.x, y: lvl.playerStart.y });
                                    }
                                    if (lvl.theme) {
                                        setTheme(lvl.theme);
                                    }
                                    setLoadedSnapshot({
                                        grid: lvl.grid,
                                        playerStart: lvl.playerStart ? { x: lvl.playerStart.x, y: lvl.playerStart.y } : null,
                                        theme: lvl.theme,
                                        imageURL: normalizedURL,
                                        overlayEnabled: Boolean(normalizedURL),
                                        overlayOpacity: 0.5,
                                        overlayStretch: true,
                                        zoom: 1,
                                        gridOffsetX: 0,
                                        gridOffsetY: 0,
                                        gridFrameWidth: null,
                                        gridFrameHeight: null,
                                    });
                                })();
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
                            title="Analyze the loaded image and fill the grid cells automatically"
                        >
                            Auto-detect Cells
                        </Button>
                    </div>
                    <div className="mt-1 text-xs text-muted-foreground">
                        Grid detection now auto-detects row and column counts from the screenshot. Enable `Lock current rows/cols` only when you want detection constrained to the values above.
                    </div>
                    <div className="mt-1 rounded border border-amber-300/60 bg-amber-50/60 px-3 py-2 text-xs text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/30 dark:text-amber-100">
                        Resizing rows/cols or adding/removing edges changes the level layout. Use `Reset Layout` to snap back before saving if you resized by accident.
                    </div>

                    {/* Theme Selector */}
                    <div className="flex items-center gap-2 flex-wrap mt-2 p-2 border rounded bg-muted/30">
                        <label className="text-xs font-semibold text-foreground">Color Theme:</label>
                        <select
                            className="px-3 py-1.5 rounded border bg-background text-sm flex-1 min-w-[120px]"
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
                        </select>
                        {theme && theme !== 'default' && (
                            <div
                                className="w-6 h-6 rounded border-2 border-border shadow-sm"
                                style={{ backgroundColor: themes[theme].floor }}
                                title={`${theme} theme preview`}
                            />
                        )}
                    </div>
                    <div className="mt-2 relative">
                        {imageURL ? (
                            <div className="text-sm p-4 border rounded bg-green-50 dark:bg-green-950">
                                ✅ Image loaded! Switch to <strong>Grid Editor</strong> tab to see the overlay.
                            </div>
                        ) : (
                            <div className="text-sm text-muted-foreground p-6 border rounded">Upload a screenshot above to get started</div>
                        )}
                    </div>
                    <Palette activeTile={activeTile} setActiveTile={setActiveTile} />
                </TabsContent>

                <TabsContent value="sprites">
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

                <TabsContent value="references">
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
