import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useLevelMapper } from './LevelMapperContext';
import { formatGridRowsOneLine } from '@/lib/levelgrid';

export const JsonPanel: React.FC<{ width: number; onStartResize: () => void; min: number; max: number; }> = ({ width, onStartResize, min, max }) => {
    const { grid, setGrid, setRows, setCols, isSaved, allLevels, importLevelIndex, saveChanges, compareLevelIndex } = useLevelMapper();
    const [jsonInput, setJsonInput] = useState(formatGridRowsOneLine(grid));
    const [jsonError, setJsonError] = useState('');

    React.useEffect(() => { setJsonInput(formatGridRowsOneLine(grid)); }, [grid]);

    const applyJSON = () => {
        try {
            const parsed = JSON.parse(jsonInput);
            if (!Array.isArray(parsed) || parsed.length === 0 || !Array.isArray(parsed[0])) throw new Error('JSON must be array of arrays');
            const rCount = parsed.length; const cCount = parsed[0].length;
            for (let r = 0; r < rCount; r++) { if (!Array.isArray(parsed[r]) || parsed[r].length !== cCount) throw new Error('Rows must equal length'); for (let c = 0; c < cCount; c++) { if (typeof parsed[r][c] !== 'number') throw new Error('All cells numeric'); } }
            setRows(rCount); setCols(cCount); setGrid(parsed as number[][]); setJsonError(''); alert('Grid loaded from JSON');
        } catch (err: any) { setJsonError(err?.message || 'Invalid JSON'); }
    };

    return (
        <div className="w-full lg:w-auto bg-card rounded border p-2 relative" style={{ width, minWidth: min, maxWidth: max }}>
            <div className="text-sm font-medium mb-3">JSON Editor</div>
            <div className="mb-4">
                <div className="text-xs font-medium mb-1">Current Grid JSON (rows inline)</div>
                <pre className="text-[10px] bg-muted p-2 rounded border overflow-auto max-h-[30vh] whitespace-pre">{formatGridRowsOneLine(grid)}</pre>
            </div>
            <div>
                <div className="flex items-center justify-between mb-1">
                    <div className="text-xs font-medium">Paste or edit JSON grid</div>
                    <div className="flex gap-2">
                        <Button size="sm" variant="outline" onClick={async () => { try { const txt = await navigator.clipboard.readText(); setJsonInput(txt); setJsonError(''); } catch { setJsonError('Clipboard read failed'); } }}>Paste</Button>
                        <Button size="sm" variant="outline" onClick={() => setJsonInput(formatGridRowsOneLine(grid))}>Use Current</Button>
                        <Button size="sm" onClick={applyJSON}>Apply To Grid</Button>
                    </div>
                </div>
                <textarea className="w-full text-xs font-mono bg-background border rounded p-2 min-h-[140px]" value={jsonInput} onChange={(e) => setJsonInput(e.target.value)} />
                {jsonError && <div className="text-xs text-red-600 mt-1">{jsonError}</div>}
            </div>
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
