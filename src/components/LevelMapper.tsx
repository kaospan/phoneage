import React, { useRef, useState, useEffect } from 'react';
import { LevelMapperProvider, useLevelMapper } from '@/components/level-mapper/LevelMapperContext';
import UnsavedBanner from '@/components/level-mapper/UnsavedBanner';
import BulkAddContextMenu from '@/components/level-mapper/BulkAddContextMenu';
import LeftPanel from '@/components/level-mapper/LeftPanel';
import GridEditorPanel from '@/components/level-mapper/GridEditorPanel';
import JsonPanel from '@/components/level-mapper/JsonPanel';
import ErrorBoundary from '@/components/ErrorBoundary';

console.log('📦 LevelMapper.tsx loading...');

// Clean wrapper: all complex logic moved into extracted components & context.
const LayoutInner: React.FC = () => {
    console.log('⚛️ LayoutInner rendering...');

    // All hooks must be called unconditionally (React Rules of Hooks)
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
                    <button
                        onClick={() => setLeftCollapsed(false)}
                        className="self-start p-2 bg-card border rounded hover:bg-muted transition-all duration-300"
                        title="Expand left panel"
                    >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </button>
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
};

console.log('✅ LevelMapper.tsx loaded');

export const LevelMapper: React.FC = () => {
    console.log('⚛️ LevelMapper mounting...');
    return (
        <ErrorBoundary fallbackMessage="Level Mapper Failed to Load">
            <LevelMapperProvider>
                <LayoutInner />
            </LevelMapperProvider>
        </ErrorBoundary>
    );
};

export default LevelMapper;