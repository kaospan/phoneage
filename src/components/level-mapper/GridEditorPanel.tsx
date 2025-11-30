import React, { useRef } from 'react';
import { Button } from '@/components/ui/button';
import { TILE_TYPES } from '@/lib/levelgrid';
import { useLevelMapper } from './LevelMapperContext';

export const GridEditorPanel: React.FC = () => {
    const {
        compareLevelIndex, setCompareLevelIndex, allLevels, compareLevel,
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

    return (
        <div className="w-full lg:flex-1 lg:min-w-0 bg-card rounded border p-2">
            <div className="flex items-center justify-between gap-2">
                <div className="text-sm font-medium">
                    Grid Editor ({rows}×{cols} = {rows * cols} cells)
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                    <select className="px-2 py-1 rounded border bg-background text-sm" value={compareLevelIndex} onChange={(e) => setCompareLevelIndex(parseInt(e.target.value, 10))}>
                        {allLevels.map((lvl, idx) => (<option key={lvl.id} value={idx}>Compare: Level {lvl.id}</option>))}
                    </select>
                    <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={overlayEnabled} onChange={(e) => setOverlayEnabled(e.target.checked)} /> Overlay image
                    </label>
                    <div className="flex items-center gap-1 text-xs">
                        <span>Opacity</span>
                        <input type="range" min={0} max={1} step={0.05} value={overlayOpacity} onChange={(e) => setOverlayOpacity(Number(e.target.value))} />
                        <span>{Math.round(overlayOpacity * 100)}%</span>
                    </div>
                    <label className="flex items-center gap-1 text-xs">
                        <input type="checkbox" checked={overlayStretch} onChange={(e) => setOverlayStretch(e.target.checked)} /> Stretch
                    </label>
                    <Button size="sm" onClick={exportTS}>Copy JSON</Button>
                    <Button size="sm" variant="outline" onClick={() => { if (compareLevel?.grid) { setRows(compareLevel.grid.length); setCols(compareLevel.grid[0]?.length || 0); setGrid(compareLevel.grid.map(row => [...row])); } }}>Copy Reference</Button>
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
            <div className="mt-2 h-12 bg-green-500/10 hover:bg-green-500/30 transition-all duration-200 opacity-20 hover:opacity-100 flex items-center justify-center cursor-pointer border-2 border-green-500/50 hover:border-green-500 rounded"
                onClick={addRowTop}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'row-top' }); }}
                title="Left click: Add 1 row at top | Right click: Add multiple">
                <div className="flex items-center gap-1 text-green-600">Top +</div>
            </div>
            <div className="mt-2 relative">
                <div className="absolute left-0 top-0 bottom-0 w-12 bg-blue-500/10 hover:bg-blue-500/30 transition-all duration-200 opacity-20 hover:opacity-100 flex items-center justify-center cursor-pointer z-10 border-l-2 border-blue-500/50 hover:border-blue-500"
                    onClick={addColumnLeft}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'column-left' }); }}
                    title="Left click: Add 1 column | Right click: Add multiple">
                    <div className="text-blue-600 text-xs">Left +</div>
                </div>
                <div className="absolute right-0 top-0 bottom-0 w-12 bg-blue-500/10 hover:bg-blue-500/30 transition-all duration-200 opacity-20 hover:opacity-100 flex items-center justify-center cursor-pointer z-10 border-r-2 border-blue-500/50 hover:border-blue-500"
                    onClick={addColumnRight}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'column-right' }); }}
                    title="Left click: Add 1 column | Right click: Add multiple">
                    <div className="text-blue-600 text-xs">Right +</div>
                </div>
                <div className="overflow-auto max-h-[70vh] border rounded flex items-center justify-center p-4">
                    <div className="relative inline-block">
                        {overlayEnabled && imageURL && (
                            <img
                                src={imageURL}
                                alt="overlay"
                                className="absolute top-0 left-0 pointer-events-none"
                                style={{
                                    opacity: overlayOpacity,
                                    width: overlayStretch ? '100%' : 'auto',
                                    height: overlayStretch ? '100%' : 'auto',
                                    objectFit: overlayStretch ? 'fill' : 'contain',
                                    zIndex: 15
                                }}
                            />
                        )}
                        <table className="text-xs relative z-10" style={{ tableLayout: 'auto' }}
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
                                                <td key={`${r}-${c}`} className="relative">
                                                    <button
                                                        className="w-8 h-8 border relative"
                                                        style={{ background: TILE_TYPES.find(t => t.id === cell)?.color || '#000' }}
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

            <div className="mt-2 h-12 bg-green-500/10 hover:bg-green-500/30 transition-all duration-200 opacity-20 hover:opacity-100 flex items-center justify-center cursor-pointer border-2 border-green-500/50 hover:border-green-500 rounded"
                onClick={addRowBottom}
                onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, type: 'row-bottom' }); }}
                title="Left click: Add 1 row at bottom | Right click: Add multiple">
                <div className="flex items-center gap-1 text-green-600">Bottom +</div>
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
