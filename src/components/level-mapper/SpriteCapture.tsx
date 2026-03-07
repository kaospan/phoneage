import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TILE_TYPES } from '@/lib/levelgrid';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
    appendCellReferences,
    buildReferenceMatcher,
    CELL_REFERENCES_UPDATED_EVENT,
    extractCellImageData,
} from '@/lib/spriteMatching';

interface SpriteCaptureProps {
    imageURL: string | null;
    rows: number;
    cols: number;
    gridOffsetX: number;
    gridOffsetY: number;
    gridFrameWidth: number | null;
    gridFrameHeight: number | null;
    grid?: number[][];
    setGrid?: React.Dispatch<React.SetStateAction<number[][]>>;
    onCapture: (cellData: {
        imageData: string;
        tileType: number;
        row: number;
        col: number;
    }) => void;
}

// Trim inward so we don't capture gridlines/neighbor cell pixels in reference sprites.
const CELL_INSET_RATIO = 0.12;

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));

export const SpriteCapture: React.FC<SpriteCaptureProps> = ({
    imageURL,
    rows,
    cols,
    gridOffsetX,
    gridOffsetY,
    gridFrameWidth,
    gridFrameHeight,
    grid,
    setGrid,
    onCapture,
}) => {
    const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
    const [selectedType, setSelectedType] = useState<number>(10);
    const [filterType, setFilterType] = useState<number | 'all'>('all');
    const [lastSaved, setLastSaved] = useState<string>('');
    const [detectedType, setDetectedType] = useState<number | null>(null);
    const [isDetecting, setIsDetecting] = useState(false);
    const [tempCanvas, setTempCanvas] = useState<HTMLCanvasElement | null>(null);
    const [detectedGrid, setDetectedGrid] = useState<Map<string, number>>(new Map());
    const [isScanning, setIsScanning] = useState(false);
    const [imageSize, setImageSize] = useState<{ width: number; height: number } | null>(null);
    const [matcher, setMatcher] = useState<((cellImageData: ImageData) => Promise<number | null>) | null>(null);
    const [referenceRevision, setReferenceRevision] = useState(0);
    const latestGridRef = React.useRef<number[][] | undefined>(grid);
    const scanAbortRef = React.useRef<{ abort: boolean } | null>(null);
    const [scanProgress, setScanProgress] = useState<{ done: number; total: number } | null>(null);
    const [autoScanEnabled, setAutoScanEnabled] = useState(false);

    useEffect(() => {
        latestGridRef.current = grid;
    }, [grid]);

    useEffect(() => {
        const canvas = document.createElement('canvas');
        setTempCanvas(canvas);
    }, []);

    useEffect(() => {
        if (typeof window === 'undefined') return;

        const handleReferenceUpdate = () => {
            setReferenceRevision((value) => value + 1);
        };

        window.addEventListener(CELL_REFERENCES_UPDATED_EVENT, handleReferenceUpdate as EventListener);
        window.addEventListener('storage', handleReferenceUpdate);
        return () => {
            window.removeEventListener(CELL_REFERENCES_UPDATED_EVENT, handleReferenceUpdate as EventListener);
            window.removeEventListener('storage', handleReferenceUpdate);
        };
    }, []);

    useEffect(() => {
        let cancelled = false;

        const prepareMatcher = async () => {
            const nextMatcher = await buildReferenceMatcher(0.7);
            if (!cancelled) {
                setMatcher(() => nextMatcher);
            }
        };

        void prepareMatcher();
        return () => {
            cancelled = true;
        };
    }, [referenceRevision]);

    useEffect(() => {
        if (!imageURL || !tempCanvas) {
            setImageSize(null);
            return;
        }

        let cancelled = false;
        const image = new Image();

        image.onload = () => {
            if (cancelled) return;
            const context = tempCanvas.getContext('2d', { willReadFrequently: true });
            if (!context) return;

            tempCanvas.width = image.width;
            tempCanvas.height = image.height;
            context.clearRect(0, 0, image.width, image.height);
            context.drawImage(image, 0, 0);
            setImageSize({ width: image.width, height: image.height });
        };

        image.onerror = () => {
            if (!cancelled) {
                setImageSize(null);
            }
        };

        image.src = imageURL;

        return () => {
            cancelled = true;
        };
    }, [imageURL, tempCanvas]);

    const getCellDimensions = () => {
        if (!imageSize) return null;

        const frameWidth = gridFrameWidth ?? imageSize.width;
        const frameHeight = gridFrameHeight ?? imageSize.height;
        return {
            cellWidth: frameWidth / cols,
            cellHeight: frameHeight / rows,
        };
    };

    const getCellBounds = (row: number, col: number, cellWidth: number, cellHeight: number) => {
        if (!imageSize) return null;

        const insetX = Math.min(cellWidth * CELL_INSET_RATIO, Math.max(1, cellWidth / 4));
        const insetY = Math.min(cellHeight * CELL_INSET_RATIO, Math.max(1, cellHeight / 4));
        const rawX0 = gridOffsetX + col * cellWidth + insetX;
        const rawY0 = gridOffsetY + row * cellHeight + insetY;
        const rawX1 = gridOffsetX + (col + 1) * cellWidth - insetX;
        const rawY1 = gridOffsetY + (row + 1) * cellHeight - insetY;

        const x0 = clamp(Math.floor(rawX0), 0, Math.max(0, imageSize.width - 1));
        const y0 = clamp(Math.floor(rawY0), 0, Math.max(0, imageSize.height - 1));
        const x1 = clamp(Math.ceil(rawX1), x0 + 1, imageSize.width);
        const y1 = clamp(Math.ceil(rawY1), y0 + 1, imageSize.height);

        return { x0, y0, x1, y1 };
    };

    const cancelScan = () => {
        if (scanAbortRef.current) {
            scanAbortRef.current.abort = true;
        }
        setIsScanning(false);
        setScanProgress(null);
    };

    const scanAllCells = async () => {
        if (!imageURL || !tempCanvas || !setGrid || !matcher || !imageSize) return;
        if (isScanning) return;

        const dims = getCellDimensions();
        if (!dims) return;

        const currentGrid = latestGridRef.current;
        if (!currentGrid) return;

        const { cellWidth, cellHeight } = dims;
        const totalCells = rows * cols;
        const abort = { abort: false };
        scanAbortRef.current = abort;

        setIsScanning(true);
        setScanProgress({ done: 0, total: totalCells });

        const newGrid = currentGrid.map(row => [...row]);
        const detectedMap = new Map<string, number>();
        let matchCount = 0;

        const batchSize = 18; // keep UI responsive
        let done = 0;

        for (let start = 0; start < totalCells; start += batchSize) {
            if (abort.abort) break;
            const end = Math.min(totalCells, start + batchSize);

            for (let idx = start; idx < end; idx++) {
                if (abort.abort) break;
                const r = Math.floor(idx / cols);
                const c = idx % cols;
                const bounds = getCellBounds(r, c, cellWidth, cellHeight);
                if (!bounds) { done++; continue; }

                const cellImageData = extractCellImageData(tempCanvas, bounds.x0, bounds.y0, bounds.x1, bounds.y1);
                if (cellImageData) {
                    const matchedType = await matcher(cellImageData);
                    if (matchedType !== null) {
                        newGrid[r][c] = matchedType;
                        detectedMap.set(`${r},${c}`, matchedType);
                        matchCount++;
                    }
                }

                done++;
            }

            setScanProgress({ done, total: totalCells });
            await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
        }

        if (!abort.abort) {
            setDetectedGrid(detectedMap);
            const hasGridChanges = newGrid.some((row, rowIndex) =>
                row.some((cell, colIndex) => cell !== currentGrid[rowIndex]?.[colIndex])
            );
            if (hasGridChanges) {
                setGrid(newGrid);
            }
            console.log(`✓ Scanned and mapped ${matchCount}/${rows * cols} cells`);
        }

        setIsScanning(false);
        setScanProgress(null);
        scanAbortRef.current = null;
    };

    useEffect(() => {
        if (!autoScanEnabled) return;
        if (!imageURL || !tempCanvas || !setGrid || !grid || !matcher || !imageSize) return;
        void scanAllCells();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [autoScanEnabled, imageURL, rows, cols, gridOffsetX, gridOffsetY, gridFrameWidth, gridFrameHeight, matcher, imageSize, referenceRevision]);

    useEffect(() => () => cancelScan(), []);

    const handleCellHover = async (row: number, col: number) => {
        if (!imageURL || !tempCanvas || !matcher) return;

        const hoverKey = `${row},${col}`;
        setHoveredCell({ row, col });

        // Check if this cell was already detected
        const alreadyDetected = detectedGrid.get(hoverKey);
        if (alreadyDetected !== undefined) {
            setDetectedType(alreadyDetected);
            return;
        }

        setIsDetecting(true);

        try {
            const dims = getCellDimensions();
            if (!dims) {
                setIsDetecting(false);
                setDetectedType(null);
                return;
            }

            const { cellWidth, cellHeight } = dims;
            const bounds = getCellBounds(row, col, cellWidth, cellHeight);
            if (!bounds) {
                setDetectedType(null);
                setIsDetecting(false);
                return;
            }

            const cellImageData = extractCellImageData(tempCanvas, bounds.x0, bounds.y0, bounds.x1, bounds.y1);
            if (!cellImageData) {
                setDetectedType(null);
                setIsDetecting(false);
                return;
            }

            const matchedType = await matcher(cellImageData);
            setDetectedType(matchedType);
        } catch (e) {
            console.error('Detection error:', e);
            setDetectedType(null);
        } finally {
            setIsDetecting(false);
        }
    };

    const handleCellClick = async (row: number, col: number) => {
        if (!imageURL || !tempCanvas) return;

        const key = `${row},${col}`;
        if (lastSaved === key) return;

        const dims = getCellDimensions();
        if (!dims) return;

        const { cellWidth, cellHeight } = dims;
        const bounds = getCellBounds(row, col, cellWidth, cellHeight);
        if (!bounds) return;

        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const captureWidth = Math.max(1, bounds.x1 - bounds.x0);
        const captureHeight = Math.max(1, bounds.y1 - bounds.y0);
        canvas.width = captureWidth;
        canvas.height = captureHeight;

        ctx.drawImage(
            tempCanvas,
            bounds.x0,
            bounds.y0,
            captureWidth,
            captureHeight,
            0,
            0,
            captureWidth,
            captureHeight
        );

        const imageData = canvas.toDataURL('image/png');
        const tileType = selectedType;

        onCapture({
            imageData,
            tileType,
            row,
            col,
        });

        appendCellReferences([{
            id: `ref-${Date.now()}-${row}-${col}`,
            tileType,
            imageData,
            timestamp: Date.now(),
            gridPosition: { row, col },
        }]);

        if (setGrid) {
            setGrid((currentGrid) => {
                const nextGrid = currentGrid.map((gridRow) => [...gridRow]);
                if (nextGrid[row]?.[col] !== undefined) {
                    nextGrid[row][col] = tileType;
                }
                return nextGrid;
            });
        }

        setDetectedGrid((current) => {
            const next = new Map(current);
            next.set(key, tileType);
            return next;
        });
        setDetectedType(tileType);

        setLastSaved(key);

        console.log(`✓ Saved cell [${row},${col}] as type ${tileType} (${TILE_TYPES.find(t => t.id === tileType)?.name})`);
    };

    const overlayFrame = React.useMemo(() => {
        if (!imageSize) return null;
        const frameWidth = gridFrameWidth ?? imageSize.width;
        const frameHeight = gridFrameHeight ?? imageSize.height;
        if (imageSize.width <= 0 || imageSize.height <= 0) return null;

        const clampPct = (value: number) => Math.max(0, Math.min(100, value));
        const leftPct = clampPct((gridOffsetX / imageSize.width) * 100);
        const topPct = clampPct((gridOffsetY / imageSize.height) * 100);
        const widthPct = clampPct((frameWidth / imageSize.width) * 100);
        const heightPct = clampPct((frameHeight / imageSize.height) * 100);

        return { leftPct, topPct, widthPct, heightPct };
    }, [imageSize, gridFrameWidth, gridFrameHeight, gridOffsetX, gridOffsetY]);

    if (!imageURL) {
        return (
            <Alert>
                <AlertDescription>
                    Upload an image and detect the grid first to capture cell sprites.
                </AlertDescription>
            </Alert>
        );
    }

    return (
        <div className="space-y-4">
            {/* Scanning status */}
            {isScanning && (
                <Alert className="border-sky-500/40 bg-slate-950/85 text-sky-50">
                    <AlertDescription className="font-semibold text-sky-50">
                        🔍 Scanning cells...{scanProgress ? ` ${scanProgress.done}/${scanProgress.total}` : ''}
                    </AlertDescription>
                </Alert>
            )}

            <Card className="p-3 bg-muted/30">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                    <div className="text-xs text-muted-foreground">
                        Scan is optional. Hover or click to detect a single cell. Full scan can be slow if you have many reference sprites.
                    </div>
                    <div className="flex items-center gap-2">
                        <label className="flex items-center gap-2 text-xs select-none">
                            <input
                                type="checkbox"
                                checked={autoScanEnabled}
                                onChange={(e) => setAutoScanEnabled(e.target.checked)}
                                disabled={!matcher || !imageSize}
                            />
                            Auto
                        </label>
                        <button
                            className="px-3 py-1.5 rounded border bg-background text-xs hover:bg-muted disabled:opacity-50"
                            onClick={() => void scanAllCells()}
                            disabled={isScanning || !matcher || !imageSize}
                            title="Scan all cells using saved reference sprites"
                        >
                            Scan
                        </button>
                        <button
                            className="px-3 py-1.5 rounded border bg-background text-xs hover:bg-muted disabled:opacity-50"
                            onClick={cancelScan}
                            disabled={!isScanning}
                            title="Cancel scan"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </Card>

            {/* Type Selector and Filter */}
            <div className="space-y-2">
                <Label htmlFor="tile-filter-select">Filter by Tile Type (Visual Highlight)</Label>
                <Select
                    value={filterType.toString()}
                    onValueChange={(val) => {
                        setFilterType(val === 'all' ? 'all' : parseInt(val));
                    }}
                >
                    <SelectTrigger id="tile-filter-select">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="all">
                            <div className="flex items-center gap-2">
                                <div className="w-4 h-4 rounded border bg-gradient-to-r from-blue-500 via-green-500 to-red-500" />
                                <span className="font-semibold">All Tile Types</span>
                            </div>
                        </SelectItem>
                        {TILE_TYPES.map((tile) => (
                            <SelectItem key={tile.id} value={tile.id.toString()}>
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-4 h-4 rounded border"
                                        style={{ backgroundColor: tile.color }}
                                    />
                                    <span>{tile.name}</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <div className="space-y-2">
                <Label htmlFor="tile-type-select">Select Tile Type to Capture</Label>
                <Select
                    value={selectedType.toString()}
                    onValueChange={(val) => {
                        setSelectedType(parseInt(val));
                        setLastSaved(''); // Reset when type changes
                    }}
                >
                    <SelectTrigger id="tile-type-select">
                        <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                        {TILE_TYPES.map((tile) => (
                            <SelectItem key={tile.id} value={tile.id.toString()}>
                                <div className="flex items-center gap-2">
                                    <div
                                        className="w-4 h-4 rounded border"
                                        style={{ backgroundColor: tile.color }}
                                    />
                                    <span>{tile.name}</span>
                                </div>
                            </SelectItem>
                        ))}
                    </SelectContent>
                </Select>
            </div>

            <Alert>
                <AlertDescription>
                    Hover a cell to run detection for that one cell. Click to save a cropped reference sprite for the selected tile type, even if detection guessed it wrong. Use Scan only when you want a full pass.
                </AlertDescription>
            </Alert>

            {/* Capture Grid */}
            <Card className="p-4 space-y-3">
                <Label>Click Cell to Capture:</Label>
                <div className="relative inline-block">
                    <img
                        src={imageURL}
                        alt="Level screenshot"
                        className="max-w-full h-auto border rounded"
                        style={{ display: 'block' }}
                    />
                    <div
                        className="absolute grid"
                        style={{
                            left: overlayFrame ? `${overlayFrame.leftPct}%` : '0%',
                            top: overlayFrame ? `${overlayFrame.topPct}%` : '0%',
                            width: overlayFrame ? `${overlayFrame.widthPct}%` : '100%',
                            height: overlayFrame ? `${overlayFrame.heightPct}%` : '100%',
                            gridTemplateColumns: `repeat(${cols}, 1fr)`,
                            gridTemplateRows: `repeat(${rows}, 1fr)`
                        }}
                    >
                        {Array.from({ length: rows }).map((_, r) =>
                            Array.from({ length: cols }).map((_, c) => {
                                const isHovered = hoveredCell?.row === r && hoveredCell?.col === c;
                                const wasSaved = lastSaved === `${r},${c}`;

                                // Check if cell matches filter type
                                const cellDetectedType = detectedGrid.get(`${r},${c}`);
                                const highlightType = isHovered ? detectedType : cellDetectedType;
                                let chrome = 'outline outline-1 outline-transparent';
                                let shouldHighlight = false;

                                if (wasSaved) {
                                    chrome = 'outline outline-2 outline-green-500';
                                } else if (isHovered && !isDetecting) {
                                    if (detectedType !== null) {
                                        if (filterType === 'all' || detectedType === filterType) {
                                            shouldHighlight = true;
                                            chrome = 'outline outline-2 outline-blue-500';
                                        } else {
                                            chrome = 'outline outline-1 outline-gray-400/50';
                                        }
                                    } else {
                                        chrome = 'outline outline-2 outline-rose-500';
                                    }
                                } else if (filterType !== 'all' && cellDetectedType !== filterType) {
                                    chrome = 'outline outline-1 outline-transparent';
                                } else if (filterType !== 'all' && cellDetectedType === filterType) {
                                    shouldHighlight = true;
                                    chrome = 'outline outline-2 outline-blue-500/70';
                                }

                                return (
                                    <button
                                        key={`${r}-${c}`}
                                        onMouseEnter={() => handleCellHover(r, c)}
                                        onMouseLeave={() => {
                                            setHoveredCell(null);
                                            setDetectedType(null);
                                        }}
                                        onClick={() => handleCellClick(r, c)}
                                        className={`transition-colors hover:opacity-80 ${chrome}`}
                                        style={{
                                            backgroundColor: shouldHighlight && highlightType !== null && !wasSaved
                                                ? `${TILE_TYPES.find(t => t.id === highlightType)?.color ?? '#000000'}80`
                                                : undefined
                                        }}
                                        title={`Cell [${r}, ${c}]${wasSaved ? ' - Saved!' : ''}`}
                                    />
                                );
                            })
                        )}
                    </div>
                </div>
            </Card>

            {/* Status Bar - Only show final results, no intermediate states */}
            <Card className="p-3 bg-muted/50">
                <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                        {hoveredCell && !isDetecting ? (
                            <>
                                <span className="text-sm font-medium">
                                    Cell [{hoveredCell.row}, {hoveredCell.col}]:
                                </span>
                                {detectedType !== null ? (
                                    <div className="flex items-center gap-2">
                                        <div
                                            className="w-6 h-6 rounded border-2"
                                            style={{ backgroundColor: TILE_TYPES.find(t => t.id === detectedType)?.color }}
                                        />
                                        <span className="text-sm font-semibold text-green-600">
                                            {TILE_TYPES.find(t => t.id === detectedType)?.name} ({detectedType})
                                        </span>
                                    </div>
                                ) : (
                                    <div className="flex items-center gap-2">
                                        <div className="w-6 h-6 rounded border-2 bg-white" />
                                        <span className="text-sm text-red-600">No match detected</span>
                                    </div>
                                )}
                            </>
                        ) : (
                            <span className="text-sm text-muted-foreground">
                                Hover over a cell to see detection info
                            </span>
                        )}
                    </div>
                </div>
            </Card>
        </div>
    );
};
