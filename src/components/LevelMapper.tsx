import React, { useRef, useState, useEffect } from 'react';
import { LevelMapperProvider, useLevelMapper } from '@/components/level-mapper/LevelMapperContext';
import UnsavedBanner from '@/components/level-mapper/UnsavedBanner';
import BulkAddContextMenu from '@/components/level-mapper/BulkAddContextMenu';
import LeftPanel from '@/components/level-mapper/LeftPanel';
import GridEditorPanel from '@/components/level-mapper/GridEditorPanel';
import JsonPanel from '@/components/level-mapper/JsonPanel';
import { TILE_TYPES } from '@/lib/levelgrid';

const THEME_LABELS: Record<string, string> = {
    default: 'Default (Brown)',
    ocean: 'Ocean (Blue)',
    forest: 'Forest (Green)',
    sunset: 'Sunset (Orange/Pink)',
    lava: 'Lava (Red)',
    crystal: 'Crystal (Purple)',
    neon: 'Neon (Cyberpunk)',
};

const CollapsedLeftPanel: React.FC<{ onExpand: () => void }> = ({ onExpand }) => {
    const { activeTile, setActiveTile, imageURL, theme } = useLevelMapper();
    const themeLabel = THEME_LABELS[theme || 'default'] ?? 'Default (Brown)';

    return (
        <div className="self-start w-[240px] max-h-[100vh] overflow-y-auto rounded border bg-card p-2 transition-all duration-300">
            <div className="mb-2 flex items-center justify-between">
                <div className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Tools</div>
                <button
                    onClick={onExpand}
                    className="rounded border bg-background p-1 hover:bg-muted"
                    title="Expand left panel"
                >
                    <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                    </svg>
                </button>
            </div>

            <div className="space-y-2">
                <div className="rounded border bg-background/50 p-2">
                    <div className="text-[11px] font-semibold text-muted-foreground">Color Theme:</div>
                    <div className="text-sm">{themeLabel}</div>
                </div>

                <div className={`rounded border p-2 text-sm ${imageURL ? 'bg-green-50 text-green-900 dark:bg-green-950 dark:text-green-100' : 'bg-background/50 text-muted-foreground'}`}>
                    {imageURL ? '✅ Image loaded! Switch to Grid Editor tab to see the overlay.' : 'No image loaded'}
                </div>

                <div className="space-y-1">
                    {TILE_TYPES.map((tile) => (
                        <button
                            key={tile.id}
                            onClick={() => setActiveTile(tile.id)}
                            className={`flex w-full items-center gap-2 rounded border px-2 py-1 text-left text-xs ${activeTile === tile.id ? 'ring-2 ring-primary' : ''}`}
                            title={tile.name}
                        >
                            <span className="inline-block h-5 w-5 rounded" style={{ background: tile.color }} />
                            <span>{tile.name} ({tile.id})</span>
                        </button>
                    ))}
                </div>
            </div>
        </div>
    );
};

console.log('📦 LevelMapper.tsx loading...');

// Clean wrapper: all complex logic moved into extracted components & context.
const LayoutInner: React.FC = () => {
    console.log('⚛️ LayoutInner rendering...');

    try {
        const { showUnsavedBanner, isSaved, saveChanges, contextMenu, setContextMenu, addMultipleColumns, addMultipleRows } = useLevelMapper();
        console.log('✓ Context loaded:', { showUnsavedBanner, isSaved });

        // Local panel widths (UI only)
        const [leftPanelWidth, setLeftPanelWidth] = useState(400);
        const leftPanelMin = 280; const leftPanelMax = 800;
        const [rightPanelWidth, setRightPanelWidth] = useState(350);
        const rightPanelMin = 250; const rightPanelMax = 600;
        const isResizingLeftRef = useRef(false);
        const isResizingRightRef = useRef(false);

        // Collapse/expand state
        const [leftCollapsed, setLeftCollapsed] = useState(false);
        const [rightCollapsed, setRightCollapsed] = useState(false);

        useEffect(() => {
            const onMove = (e: MouseEvent) => {
                if (isResizingLeftRef.current) {
                    let newW = e.clientX - 32;
                    newW = Math.max(leftPanelMin, Math.min(leftPanelMax, newW));
                    setLeftPanelWidth(newW);
                }
                if (isResizingRightRef.current) {
                    const newW = window.innerWidth - e.clientX - 32;
                    setRightPanelWidth(Math.max(rightPanelMin, Math.min(rightPanelMax, newW)));
                }
            };
            const onUp = () => { isResizingLeftRef.current = false; isResizingRightRef.current = false; };
            window.addEventListener('mousemove', onMove);
            window.addEventListener('mouseup', onUp);
            return () => { window.removeEventListener('mousemove', onMove); window.removeEventListener('mouseup', onUp); };
        }, [leftPanelMin, leftPanelMax, rightPanelMin, rightPanelMax]);

        return (
            <div className="w-full min-h-screen p-2 md:p-4 bg-background text-foreground">
                <div className="fixed top-0 left-0 w-full z-50">
                    <UnsavedBanner visible={!isSaved && showUnsavedBanner} onSave={saveChanges} />
                </div>
                <div className="w-full mx-auto flex flex-wrap lg:flex-nowrap gap-3 pt-1 relative">
                    {/* Left panel with collapse button */}
                    {!leftCollapsed && (
                        <div className="relative transition-all duration-300">
                            <LeftPanel width={leftPanelWidth} onStartResize={() => { isResizingLeftRef.current = true; }} min={leftPanelMin} max={leftPanelMax} />
                            <button
                                onClick={() => setLeftCollapsed(true)}
                                className="absolute top-2 right-2 z-20 p-1 bg-background border rounded hover:bg-muted"
                                title="Collapse left panel"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                                </svg>
                            </button>
                        </div>
                    )}
                    {leftCollapsed && (
                        <CollapsedLeftPanel onExpand={() => setLeftCollapsed(false)} />
                    )}

                    <GridEditorPanel />

                    {/* Right panel with collapse button */}
                    {!rightCollapsed && (
                        <div className="relative transition-all duration-300">
                            <JsonPanel width={rightPanelWidth} onStartResize={() => { isResizingRightRef.current = true; }} min={rightPanelMin} max={rightPanelMax} />
                            <button
                                onClick={() => setRightCollapsed(true)}
                                className="absolute top-2 left-2 z-20 p-1 bg-background border rounded hover:bg-muted"
                                title="Collapse right panel"
                            >
                                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                                </svg>
                            </button>
                        </div>
                    )}
                    {rightCollapsed && (
                        <button
                            onClick={() => setRightCollapsed(false)}
                            className="self-start p-2 bg-card border rounded hover:bg-muted transition-all duration-300"
                            title="Expand right panel"
                        >
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
                            </svg>
                        </button>
                    )}
                </div>
                <BulkAddContextMenu
                    menu={contextMenu}
                    onAdd={(type, count) => {
                        if (type === 'column-left') addMultipleColumns('left', count);
                        else if (type === 'column-right') addMultipleColumns('right', count);
                        else if (type === 'row-top') addMultipleRows('top', count);
                        else if (type === 'row-bottom') addMultipleRows('bottom', count);
                        setContextMenu(null);
                    }}
                    onClose={() => setContextMenu(null)}
                />
            </div>
        );
    } catch (error) {
        console.error('❌ Error in LayoutInner:', error);
        return (
            <div style={{ padding: '20px', color: 'red' }}>
                <h2>Level Mapper Failed to Load</h2>
                <p>{(error as Error).message}</p>
                <button onClick={() => window.location.reload()}>Reload</button>
            </div>
        );
    }
};

console.log('✅ LevelMapper.tsx loaded');

export const LevelMapper: React.FC = () => {
    console.log('⚛️ LevelMapper mounting...');
    return (
        <LevelMapperProvider>
            <LayoutInner />
        </LevelMapperProvider>
    );
};

export default LevelMapper;
