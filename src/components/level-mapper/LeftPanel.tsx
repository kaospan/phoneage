import React, { useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { TILE_TYPES, voidGrid } from '@/lib/levelgrid';
import Palette from './Palette';
import { useLevelMapper } from './LevelMapperContext';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { SpriteCapture } from './SpriteCapture';
import { CellReferenceManager } from './CellReferenceManager';
import { themes, type ColorTheme } from '@/data/levels';

export const LeftPanel: React.FC<{ width: number; onStartResize: () => void; min: number; max: number; }> = ({ width, onStartResize, min, max }) => {
    const {
        rows, cols, setRows, setCols,
        showGrid, setShowGrid,
        importLevelIndex, setImportLevelIndex,
        allLevels, imageURL, setImageURL,
        detectGrid, detectCells, detectGridAndCells, useDetectCurrentCounts, setUseDetectCurrentCounts,
        zoom, setZoom, gridOffsetX, setGridOffsetX, gridOffsetY, setGridOffsetY,
        activeTile, setActiveTile, setGrid, grid, setPlayerStart,
        theme, setTheme, setIsSaved
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
                                const url = URL.createObjectURL(f);
                                console.log('✓ Object URL created:', url);

                                setImageURL(url);
                                setIsDetecting(true);
                                setDetectionProgress('Loading image...');
                                console.log('⏳ Waiting 400ms for canvas to render...');

                                // Wait for canvas to be ready and drawn
                                await new Promise(resolve => setTimeout(resolve, 400));

                                console.log('🔍 Starting grid detection...');
                                setDetectionProgress('Detecting grid lines...');
                                detectGrid();
                                console.log('✓ detectGrid() called');

                                // Wait for grid state to update
                                console.log('⏳ Waiting 200ms for grid state update...');
                                await new Promise(resolve => setTimeout(resolve, 200));

                                console.log('📊 Grid dimensions before cell detection:', { rows, cols, gridSize: grid.length });

                                setDetectionProgress('Analyzing cell types...');
                                console.log('⏳ Scheduling detectCells in 50ms...');

                                // Use setTimeout to let the progress message render before blocking
                                setTimeout(() => {
                                    try {
                                        console.log('🎯 Starting detectCells...');
                                        detectCells();
                                        console.log('✅ detectCells complete!');

                                        console.log('📈 Grid after cell detection:', {
                                            rows: grid.length,
                                            cols: grid[0]?.length,
                                            sampleCells: grid.slice(0, 3).map((row, r) =>
                                                row.slice(0, 5).map((cell, c) => `[${r},${c}]=${cell}`)
                                            )
                                        });

                                        setIsDetecting(false);
                                        setDetectionProgress('');
                                        console.log('✅ Full detection complete - grid editor should show results');
                                    } catch (innerError) {
                                        console.error('❌ Error in detectCells setTimeout:', innerError);
                                        setIsDetecting(false);
                                        setDetectionProgress('');
                                        alert(`Cell detection failed: ${(innerError as Error).message}`);
                                    }
                                }, 50);
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
                        <div className="absolute inset-0 z-50 bg-background/80 backdrop-blur-sm flex items-center justify-center rounded">
                            <div className="bg-card border rounded-lg p-6 shadow-lg">
                                <div className="flex flex-col items-center gap-3">
                                    <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
                                    <div className="text-sm font-medium">{detectionProgress}</div>
                                </div>
                            </div>
                        </div>
                    )}

                    <div className="flex items-center gap-2 flex-wrap">
                        <label className="text-xs text-muted-foreground">Rows</label>
                        <input className="w-16 px-2 py-1 rounded border bg-background" type="number" min={1} value={rows} onChange={(e) => setRows(parseInt(e.target.value || '1', 10))} />
                        <label className="text-xs text-muted-foreground">Cols</label>
                        <input className="w-16 px-2 py-1 rounded border bg-background" type="number" min={1} value={cols} onChange={(e) => setCols(parseInt(e.target.value || '1', 10))} />
                        <select
                            className="px-2 py-1 rounded border bg-background text-xs"
                            value={importLevelIndex ?? ''}
                            onChange={(e) => {
                                const val = e.target.value;
                                if (val === '') return;
                                const idx = parseInt(val, 10);
                                setImportLevelIndex(idx);
                                // Load player start position when importing level
                                const lvl = allLevels[idx];
                                if (lvl?.playerStart) {
                                    setPlayerStart({ x: lvl.playerStart.x, y: lvl.playerStart.y });
                                }
                                if (lvl?.theme) {
                                    setTheme(lvl.theme);
                                }
                            }}
                        >
                            <option value="">Load level...</option>
                            {allLevels.map((lvl, idx) => (<option key={lvl.id} value={idx}>Level {lvl.id}</option>))}
                        </select>
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
                            <>
                                <div className="flex flex-wrap gap-2 my-2 items-center">
                                    <label className="text-xs">Zoom</label>
                                    <input type="range" min={0.5} max={2} step={0.05} value={zoom} onChange={e => setZoom(Number(e.target.value))} />
                                    <span className="text-xs">{zoom}x</span>
                                    <label className="text-xs ml-4">Offset X</label>
                                    <input type="number" className="w-16 px-2 py-1 rounded border bg-background" value={gridOffsetX} onChange={e => setGridOffsetX(Number(e.target.value))} />
                                    <label className="text-xs ml-2">Y</label>
                                    <input type="number" className="w-16 px-2 py-1 rounded border bg-background" value={gridOffsetY} onChange={e => setGridOffsetY(Number(e.target.value))} />
                                    <label className="flex items-center gap-1 text-xs ml-2">
                                        <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid
                                    </label>
                                </div>
                                <canvas ref={useLevelMapper().canvasRef} style={{ width: `${zoom * 100}%`, height: 'auto' }} className="border rounded" />
                            </>
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
                        zoom={zoom}
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
