import React, { useEffect, useRef, useState } from 'react';
import { LevelMapperProvider } from '@/components/level-mapper/LevelMapperContext';
import { useLevelMapper } from '@/components/level-mapper/useLevelMapper';
import BulkAddContextMenu from '@/components/level-mapper/BulkAddContextMenu';
import LeftPanel from '@/components/level-mapper/LeftPanel';
import GridEditorPanel from '@/components/level-mapper/GridEditorPanel';
import JsonPanel from '@/components/level-mapper/JsonPanel';
import { MapperDockButton, MapperMetricPill } from '@/components/level-mapper/MapperChrome';
import { TILE_TYPES } from '@/lib/levelgrid';
import { ChevronLeft, ChevronRight, Image as ImageIcon, Layers3, LayoutDashboard } from 'lucide-react';
import { toast } from 'sonner';

const THEME_LABELS: Record<string, string> = {
    default: 'Default (Brown)',
    ocean: 'Ocean (Blue)',
    forest: 'Forest (Green)',
    sunset: 'Sunset (Orange/Pink)',
    lava: 'Lava (Red)',
    crystal: 'Crystal (Purple)',
    neon: 'Neon (Cyberpunk)',
    snow: 'Snow (White)',
    gray: 'Gray (Neutral)',
    slate: 'Slate (Cool Gray)',
};

console.log('📦 LevelMapper.tsx loading...');

// Clean wrapper: all complex logic moved into extracted components & context.
const LayoutInner: React.FC = () => {
    console.log('⚛️ LayoutInner rendering...');
    const {
        showUnsavedBanner,
        isSaved,
        saveChanges,
        contextMenu,
        setContextMenu,
        addMultipleColumns,
        addMultipleRows,
        importLevelIndex,
        allLevels,
        compareLevel,
        activeTile,
        imageURL,
        theme,
        rows,
        cols,
        overlayEnabled,
        currentLevelProvenance,
        timeLimitSeconds,
    } = useLevelMapper();
    console.log('✓ Context loaded:', { showUnsavedBanner, isSaved });
    const unsavedToastIdRef = useRef<string | number | null>(null);
    const saveFromUnsavedToast = React.useCallback(() => {
        void (async () => {
            try {
                await saveChanges();
                toast.dismiss('level-mapper-unsaved');
            } catch (error) {
                console.error('Failed to save mapper changes from toast action:', error);
                toast.error('Failed to save mapper changes.', {
                    position: 'bottom-right',
                    duration: 4500,
                    description: error instanceof Error ? error.message : 'Unknown save error.',
                });
            }
        })();
    }, [saveChanges]);

    // Local panel widths (UI only)
    const [leftPanelWidth, setLeftPanelWidth] = useState(292);
    const leftPanelMin = 252; const leftPanelMax = 640;
    const [rightPanelWidth, setRightPanelWidth] = useState(288);
    const rightPanelMin = 260; const rightPanelMax = 560;
    const isResizingLeftRef = useRef(false);
    const isResizingRightRef = useRef(false);

    // Collapse/expand state
    const [leftCollapsed, setLeftCollapsed] = useState(false);
    const [rightCollapsed, setRightCollapsed] = useState(true);
    const currentLevel = importLevelIndex !== null ? allLevels[importLevelIndex] ?? null : null;
    const selectedTile = TILE_TYPES.find((tile) => tile.id === activeTile) ?? TILE_TYPES[0];
    const themeLabel = THEME_LABELS[theme || 'default'] ?? 'Default (Brown)';
    const currentLevelLabel = currentLevel ? `Level ${currentLevel.id}` : 'New Draft';
    const provenanceLabel =
        currentLevelProvenance === 'user-edited'
            ? 'User'
            : currentLevelProvenance === 'ai-detected'
                ? 'AI'
                : 'Default';

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
                    onClick: saveFromUnsavedToast,
                },
            });
            return;
        }

        if (isSaved && unsavedToastIdRef.current !== null) {
            toast.dismiss(unsavedToastIdRef.current);
            unsavedToastIdRef.current = null;
        }
    }, [isSaved, saveFromUnsavedToast, showUnsavedBanner]);

    return (
        <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top_left,rgba(245,158,11,0.18),transparent_28%),radial-gradient(circle_at_top_right,rgba(56,189,248,0.18),transparent_26%),linear-gradient(180deg,#1c1917_0%,#0c0a09_100%)] text-stone-100">
            <div className="pointer-events-none absolute inset-0 opacity-60" style={{ backgroundImage: 'linear-gradient(rgba(255,255,255,0.025) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.025) 1px, transparent 1px)', backgroundSize: '26px 26px' }} />
            <div className="relative mx-auto flex min-h-screen w-full max-w-[1880px] flex-col gap-3 p-3">
                <div className="rounded-[28px] border border-white/10 bg-stone-950/88 px-5 py-4 shadow-[0_24px_80px_rgba(0,0,0,0.35)] backdrop-blur-xl">
                    <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
                        <div className="min-w-0">
                            <div className="flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.24em] text-stone-400">
                                <LayoutDashboard className="h-4 w-4 text-amber-300" />
                                Mapper Workspace
                            </div>
                            <div className="mt-2 flex flex-wrap items-center gap-3">
                                <h1 className="text-2xl font-black tracking-[0.08em] text-stone-50 sm:text-3xl">
                                    {currentLevelLabel}
                                </h1>
                                <div className="rounded-full border border-white/10 bg-white/[0.06] px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em] text-stone-300">
                                    {provenanceLabel}
                                </div>
                                <div
                                    className={[
                                        'rounded-full border px-3 py-1 text-[11px] font-black uppercase tracking-[0.16em]',
                                        isSaved
                                            ? 'border-emerald-300/25 bg-emerald-500/12 text-emerald-100'
                                            : 'border-amber-300/25 bg-amber-500/12 text-amber-100',
                                    ].join(' ')}
                                >
                                    {isSaved ? 'Saved' : 'Unsaved'}
                                </div>
                            </div>
                            <p className="mt-2 max-w-3xl text-sm leading-relaxed text-stone-400">
                                Screenshot ingestion, grid alignment, sprite capture, and JSON inspection now sit in one cleaner workspace.
                                The editing engine stays intact; the shell is simplified around it.
                            </p>
                        </div>

                        <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                            <MapperMetricPill label="Grid" value={`${rows} × ${cols}`} />
                            <MapperMetricPill
                                label="Selected Tile"
                                value={
                                    <span className="inline-flex items-center gap-2">
                                        <span className="inline-block h-3 w-3 rounded-full border border-white/20" style={{ backgroundColor: selectedTile.color }} />
                                        <span className="truncate">{selectedTile.name}</span>
                                    </span>
                                }
                                tone="warning"
                            />
                            <MapperMetricPill label="Theme" value={themeLabel} />
                            <MapperMetricPill
                                label="Overlay"
                                value={overlayEnabled && imageURL ? 'Aligned' : imageURL ? 'Image Ready' : 'No Image'}
                                tone={overlayEnabled && imageURL ? 'success' : imageURL ? 'info' : 'default'}
                            />
                            <MapperMetricPill
                                label="Timer"
                                value={timeLimitSeconds && timeLimitSeconds > 0 ? `${timeLimitSeconds}s` : 'Off'}
                                tone={timeLimitSeconds && timeLimitSeconds > 0 ? 'info' : 'default'}
                            />
                        </div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-xs text-stone-400">
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                            <Layers3 className="h-3.5 w-3.5 text-sky-300" />
                            Compare target: {compareLevel ? `Level ${compareLevel.id}` : 'None'}
                        </div>
                        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.04] px-3 py-1.5">
                            <ImageIcon className="h-3.5 w-3.5 text-emerald-300" />
                            {imageURL ? 'Screenshot loaded and ready for snapping' : 'Load a screenshot to enable alignment workflows'}
                        </div>
                    </div>
                </div>

                <div className="relative flex min-h-0 flex-1 gap-3">
                    {!leftCollapsed ? (
                        <div className="relative min-h-0 shrink-0 transition-all duration-300">
                            <LeftPanel width={leftPanelWidth} onStartResize={() => { isResizingLeftRef.current = true; }} min={leftPanelMin} max={leftPanelMax} />
                            <button
                                onClick={() => setLeftCollapsed(true)}
                                className="absolute right-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-stone-950/85 text-stone-300 shadow-lg transition-colors hover:border-amber-200/30 hover:text-stone-50"
                                title="Collapse control deck"
                            >
                                <ChevronLeft className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <MapperDockButton
                            title="Controls"
                            description="Re-open the level, screenshot, and tile workflow deck."
                            onClick={() => setLeftCollapsed(false)}
                            icon={<ChevronRight className="h-4 w-4" />}
                            align="left"
                        />
                    )}

                    <GridEditorPanel />

                    {!rightCollapsed ? (
                        <div className="relative min-h-0 shrink-0 transition-all duration-300">
                            <JsonPanel width={rightPanelWidth} onStartResize={() => { isResizingRightRef.current = true; }} min={rightPanelMin} max={rightPanelMax} />
                            <button
                                onClick={() => setRightCollapsed(true)}
                                className="absolute left-3 top-3 z-20 inline-flex h-10 w-10 items-center justify-center rounded-2xl border border-white/10 bg-stone-950/85 text-stone-300 shadow-lg transition-colors hover:border-sky-200/30 hover:text-stone-50"
                                title="Collapse inspector"
                            >
                                <ChevronRight className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <MapperDockButton
                            title="Inspector"
                            description="Bring back the JSON, current grid, and saved snapshot view."
                            onClick={() => setRightCollapsed(false)}
                            icon={<ChevronLeft className="h-4 w-4" />}
                            align="right"
                        />
                    )}
                </div>
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
