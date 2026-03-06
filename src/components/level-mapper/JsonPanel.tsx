import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useLevelMapper } from './LevelMapperContext';

// Format grid with row number comments
const formatGridWithRowNumbers = (grid: number[][]): string => {
    if (!grid || grid.length === 0) return '[]';

    let result = '[\n';
    grid.forEach((row, index) => {
        const rowJson = JSON.stringify(row);
        const rowNumber = index + 1;
        result += `  ${rowJson}${index < grid.length - 1 ? ',' : ''} // Row ${rowNumber}\n`;
    });
    result += ']';

    return result;
};

export const JsonPanel: React.FC<{ width: number; onStartResize: () => void; min: number; max: number; }> = ({ width, onStartResize, min, max }) => {
    const { grid, isSaved, jsonInput, setJsonInput, syncJsonInputToGrid, applyJsonInput } = useLevelMapper();
    const [savedGrid, setSavedGrid] = useState<number[][] | null>(null);

    // Load saved grid from localStorage
    useEffect(() => {
        try {
            const saved = localStorage.getItem('levelmapper_grid');
            if (saved) {
                const parsed = JSON.parse(saved);
                if (Array.isArray(parsed)) {
                    setSavedGrid(parsed);
                }
            }
        } catch (err) {
            console.error('Failed to load saved grid:', err);
        }
    }, [isSaved]); // Update when save state changes

    return (
        <div className="w-full lg:w-auto bg-card rounded border p-2 relative" style={{ width, minWidth: min, maxWidth: max }}>
            {/* Title positioned to the right of chevron button */}
            <div className="text-sm font-medium mb-3 pl-8">JSON Editor</div>

            {/* Current (Editing) Grid */}
            <div className="mb-4">
                <div className="text-xs font-semibold mb-1 text-blue-600">Current Grid (Editing)</div>
                <pre className="text-[8px] leading-[1.4] font-mono bg-muted p-2 rounded border overflow-auto max-h-[40vh] whitespace-pre">{formatGridWithRowNumbers(grid)}</pre>
            </div>

            {/* Saved Grid - only show if exists */}
            {savedGrid && (
                <div className="mb-4">
                    <div className="text-xs font-semibold mb-1 text-green-600">Saved Grid (Last Save)</div>
                    <pre className="text-[8px] leading-[1.4] font-mono bg-muted p-2 rounded border overflow-auto max-h-[40vh] whitespace-pre">{formatGridWithRowNumbers(savedGrid)}</pre>
                </div>
            )}

            <div className="mb-2">
                <div className="mb-1 text-xs font-semibold text-amber-700">Manual JSON (Paste / Edit)</div>
                <Textarea
                    value={jsonInput}
                    onChange={(e) => setJsonInput(e.target.value)}
                    spellCheck={false}
                    className="min-h-[220px] font-mono text-[11px] leading-5"
                    placeholder="Paste a grid JSON array here"
                />
                <div className="mt-2 flex flex-wrap gap-2">
                    <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                            await navigator.clipboard.writeText(jsonInput);
                            alert('JSON copied to clipboard');
                        }}
                    >
                        Copy JSON
                    </Button>
                    <Button size="sm" variant="outline" onClick={syncJsonInputToGrid}>
                        Load Current
                    </Button>
                    <Button size="sm" onClick={applyJsonInput}>
                        Apply JSON
                    </Button>
                </div>
            </div>

            {/* Resize handle */}
            <div
                style={{ position: 'absolute', top: 0, left: -8, width: 16, height: '100%', cursor: 'ew-resize', zIndex: 10, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onMouseDown={onStartResize}
                title="Resize horizontally"
            >
                <span style={{ fontSize: 18, color: '#aaa', userSelect: 'none' }}>&#8596;</span>
            </div>
        </div>
    );
};

export default JsonPanel;
