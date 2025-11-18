import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { TILE_TYPES, voidGrid } from '@/lib/levelgrid';
import Palette from './Palette';
import { useLevelMapper } from './LevelMapperContext';

export const LeftPanel: React.FC<{ width: number; onStartResize: () => void; min: number; max: number; }> = ({ width, onStartResize, min, max }) => {
    const {
        rows, cols, setRows, setCols,
        showGrid, setShowGrid,
        importLevelIndex, setImportLevelIndex,
        allLevels, imageURL, setImageURL,
        detectGrid, useDetectCurrentCounts, setUseDetectCurrentCounts,
        zoom, setZoom, gridOffsetX, setGridOffsetX, gridOffsetY, setGridOffsetY,
        activeTile, setActiveTile, setGrid,
    } = useLevelMapper();

    const fileInputRef = useRef<HTMLInputElement | null>(null);

    return (
        <div className="w-full lg:w-auto bg-card rounded border p-2 relative" style={{ width, minWidth: min, maxWidth: max }}>
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
                        setRows(11); setCols(20);
                        setGrid(voidGrid(11, 20));
                    }}
                />
                <label className="text-xs text-muted-foreground">Rows</label>
                <input className="w-16 px-2 py-1 rounded border bg-background" type="number" min={1} value={rows} onChange={(e) => setRows(parseInt(e.target.value || '1', 10))} />
                <label className="text-xs text-muted-foreground">Cols</label>
                <input className="w-16 px-2 py-1 rounded border bg-background" type="number" min={1} value={cols} onChange={(e) => setCols(parseInt(e.target.value || '1', 10))} />
                <label className="flex items-center gap-1 text-xs">
                    <input type="checkbox" checked={showGrid} onChange={(e) => setShowGrid(e.target.checked)} /> Grid
                </label>
                <select
                    className="px-2 py-1 rounded border bg-background text-xs"
                    value={importLevelIndex ?? ''}
                    onChange={(e) => { const val = e.target.value; if (val === '') return; const idx = parseInt(val, 10); setImportLevelIndex(idx); }}
                >
                    <option value="">Import level...</option>
                    {allLevels.map((lvl, idx) => (<option key={lvl.id} value={idx}>Load Level {lvl.id}</option>))}
                </select>
                <label className="flex items-center gap-1 text-xs ml-2">
                    <input type="checkbox" checked={useDetectCurrentCounts} onChange={(e) => setUseDetectCurrentCounts(e.target.checked)} /> Use current Rows/Cols
                </label>
                <Button size="sm" variant="secondary" onClick={detectGrid}>Detect Grid</Button>
                <Button size="sm" variant="secondary" onClick={useLevelMapper().detectCells}>Detect Cells</Button>
                <Button size="sm" variant="secondary" onClick={useLevelMapper().detectGridAndCells}>Grid + Cells</Button>
            </div>
            <div className="mt-2 relative">
                {imageURL ? (
                    <>
                        <div className="flex flex-wrap gap-2 my-2 items-center">
                            <label className="text-xs">Zoom</label>
                            <input type="range" min={0.5} max={2} step={0.05} value={zoom} onChange={e => setZoom(Number(e.target.value))} />
                            <span className="text-xs">{zoom}x</span>
                            <label className="text-xs ml-4">Grid Offset X</label>
                            <input type="number" className="w-16 px-2 py-1 rounded border bg-background" value={gridOffsetX} onChange={e => setGridOffsetX(Number(e.target.value))} />
                            <label className="text-xs ml-2">Grid Offset Y</label>
                            <input type="number" className="w-16 px-2 py-1 rounded border bg-background" value={gridOffsetY} onChange={e => setGridOffsetY(Number(e.target.value))} />
                        </div>
                        <canvas ref={useLevelMapper().canvasRef} style={{ width: `${zoom * 100}%`, height: 'auto' }} className="border rounded" />
                    </>
                ) : (
                    <div className="text-sm text-muted-foreground p-6 border rounded">Upload a screenshot (PNG/JPG). Then click cells to set tile types.</div>
                )}
            </div>
            <Palette activeTile={activeTile} setActiveTile={setActiveTile} />
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
