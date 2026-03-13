import React, { useEffect, useRef, useState } from 'react';
import { LevelMapperProvider } from '@/components/level-mapper/LevelMapperContext';
import { useLevelMapper } from '@/components/level-mapper/useLevelMapper';
import BulkAddContextMenu from '@/components/level-mapper/BulkAddContextMenu';
import LeftPanel from '@/components/level-mapper/LeftPanel';
import GridEditorPanel from '@/components/level-mapper/GridEditorPanel';
import JsonPanel from '@/components/level-mapper/JsonPanel';
import { TILE_TYPES } from '@/lib/levelgrid';
import { toast } from 'sonner';

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
        <div className="self-start w-[220px] max-h-full overflow-y-auto rounded-xl border border-border/60 bg-card/95 p-2.5 shadow-sm transition-all duration-300">
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

                <div
                    className={[
                        'rounded border p-2 text-sm',
                        imageURL
                            ? 'border-emerald-500/25 bg-emerald-500/10 text-emerald-100'
                            : 'border-border/60 bg-background/50 text-muted-foreground',
                    ].join(' ')}
                >
                    {imageURL ? 'Image loaded. Open Grid Editor to align.' : 'No image loaded'}
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
        const unsavedToastIdRef = useRef<string | number | null>(null);

        // Local panel widths (UI only)
        const [leftPanelWidth, setLeftPanelWidth] = useState(320);
        const leftPanelMin = 260; const leftPanelMax = 680;
        const [rightPanelWidth, setRightPanelWidth] = useState(300);
        const rightPanelMin = 260; const rightPanelMax = 560;
        const isResizingLeftRef = useRef(false);
        const isResizingRightRef = useRef(false);

        // Collapse/expand state
        const [leftCollapsed, setLeftCollapsed] = useState(false);
        const [rightCollapsed, setRightCollapsed] = useState(true);

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

        useEffect(() => {
            if (!isSaved && showUnsavedBanner) {
                const toastId = 'level-mapper-unsaved';
                unsavedToastIdRef.current = toast.warning('You have unsaved changes', {
                    id: toastId,
                    position: 'bottom-right',
                    duration: 4500,
                    description: 'Save the current mapper layout and grid changes when ready.',
                    action: {
                        label: 'Save',
                        onClick: () => saveChanges(),
                    },
                });
                return;
            }

            if (isSaved && unsavedToastIdRef.current !== null) {
                toast.dismiss(unsavedToastIdRef.current);
                unsavedToastIdRef.current = null;
            }
        }, [isSaved, saveChanges, showUnsavedBanner]);

        return (
            <div className="w-full min-h-screen bg-background p-2 text-foreground md:p-2.5">
                <div className="relative mx-auto flex min-h-[calc(100svh-1rem)] w-full flex-col gap-2.5 pt-1 lg:h-[calc(100svh-1.5rem)] lg:min-h-0 lg:flex-row lg:items-stretch">
                    {/* Left panel with collapse button */}
                    {!leftCollapsed && (
                        <div className="relative min-h-0 transition-all duration-300">
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
                        <div className="relative min-h-0 transition-all duration-300">
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
                            className="self-start rounded-xl border border-border/60 bg-card/95 p-2 shadow-sm hover:bg-muted transition-all duration-300"
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
