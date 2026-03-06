import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { TILE_TYPES } from '@/lib/levelgrid';
import { Crosshair, Save, X } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { extractCellImageData, findBestMatch } from '@/lib/spriteMatching';

interface SpriteCaptureProps {
    imageURL: string | null;
    rows: number;
    cols: number;
    gridOffsetX: number;
    gridOffsetY: number;
    gridFrameWidth: number | null;
    gridFrameHeight: number | null;
    zoom: number;
    grid?: number[][];
    setGrid?: (grid: number[][]) => void;
    onCapture: (cellData: {
        imageData: string;
        tileType: number;
        row: number;
        col: number;
    }) => void;
}

const STORAGE_KEY = 'stone-age-cell-references';

export const SpriteCapture: React.FC<SpriteCaptureProps> = ({
    imageURL,
    rows,
    cols,
    gridOffsetX,
    gridOffsetY,
    gridFrameWidth,
    gridFrameHeight,
    zoom,
    grid,
    setGrid,
    onCapture,
}) => {
    const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
    const [selectedType, setSelectedType] = useState<number>(10); // Default to Arrow Left (10) for the user's current task
    const [filterType, setFilterType] = useState<number | 'all'>('all'); // Filter to show specific types
    const [lastSaved, setLastSaved] = useState<string>(''); // Track last saved to avoid duplicates
    const [detectedType, setDetectedType] = useState<number | null>(null);
    const [isDetecting, setIsDetecting] = useState(false);
    const [tempCanvas, setTempCanvas] = useState<HTMLCanvasElement | null>(null);
    const [detectedGrid, setDetectedGrid] = useState<Map<string, number>>(new Map()); // Store all detected cells
    const [isScanning, setIsScanning] = useState(false);

    // Create a temporary canvas for cell extraction
    useEffect(() => {
        const canvas = document.createElement('canvas');
        setTempCanvas(canvas);
    }, []);

    // Auto-detect all cells when image loads or grid changes
    useEffect(() => {
        if (!imageURL || !tempCanvas || !setGrid || !grid) return;

        const detectAllCells = async () => {
            setIsScanning(true);
            console.log('Auto-detecting all cells...');

            const dims = getCellDimensions();
            if (!dims) {
                setIsScanning(false);
                return;
            }

            const { cellWidth, cellHeight } = dims;
            const ctx = tempCanvas.getContext('2d');
            if (!ctx) {
                setIsScanning(false);
                return;
            }

            const img = new Image();
            img.src = imageURL;

            await new Promise((resolve) => {
                img.onload = resolve;
            });

            tempCanvas.width = img.width;
            tempCanvas.height = img.height;
            ctx.drawImage(img, 0, 0);

            const newGrid = grid.map(row => [...row]);
            const detectedMap = new Map<string, number>();
            let matchCount = 0;

            // Scan all cells
            for (let r = 0; r < rows; r++) {
                for (let c = 0; c < cols; c++) {
                    const x0 = Math.floor(c * cellWidth + gridOffsetX);
                    const y0 = Math.floor(r * cellHeight + gridOffsetY);
                    const x1 = Math.floor((c + 1) * cellWidth + gridOffsetX);
                    const y1 = Math.floor((r + 1) * cellHeight + gridOffsetY);

                    const cellImageData = extractCellImageData(tempCanvas, x0, y0, x1, y1);
                    if (cellImageData) {
                        const matchedType = await findBestMatch(cellImageData, 0.70);
                        if (matchedType !== null) {
                            newGrid[r][c] = matchedType;
                            detectedMap.set(`${r},${c}`, matchedType);
                            matchCount++;
                        }
                    }
                }
            }

            setDetectedGrid(detectedMap);
            setGrid(newGrid);
            setIsScanning(false);
            console.log(`✓ Auto-detected and mapped ${matchCount}/${rows * cols} cells`);
        };

        detectAllCells();
    }, [imageURL, rows, cols, gridOffsetX, gridOffsetY, gridFrameWidth, gridFrameHeight]); // Run when image or grid params change

    // Calculate cell dimensions
    const getCellDimensions = () => {
        if (!imageURL) return null;

        const img = new Image();
        img.src = imageURL;

        const frameWidth = gridFrameWidth ?? img.width;
        const frameHeight = gridFrameHeight ?? img.height;
        const cellWidth = frameWidth / cols;
        const cellHeight = frameHeight / rows;

        return { cellWidth, cellHeight, imgWidth: img.width, imgHeight: img.height };
    };

    // Detect cell type on hover (for status display only)
    const handleCellHover = async (row: number, col: number) => {
        if (!imageURL || !tempCanvas) return;

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

            // Create canvas for the full image
            const ctx = tempCanvas.getContext('2d');
            if (!ctx) {
                setIsDetecting(false);
                setDetectedType(null);
                return;
            }

            const img = new Image();
            img.src = imageURL;

            await new Promise((resolve) => {
                img.onload = resolve;
            });

            // Set canvas to full image size
            tempCanvas.width = img.width;
            tempCanvas.height = img.height;

            // Draw full image
            ctx.drawImage(img, 0, 0);

            // Calculate cell bounds
            const x0 = Math.floor(col * cellWidth + gridOffsetX);
            const y0 = Math.floor(row * cellHeight + gridOffsetY);
            const x1 = Math.floor((col + 1) * cellWidth + gridOffsetX);
            const y1 = Math.floor((row + 1) * cellHeight + gridOffsetY);

            // Extract cell image data
            const cellImageData = extractCellImageData(tempCanvas, x0, y0, x1, y1);
            if (!cellImageData) {
                console.log('No cell image data extracted');
                setDetectedType(null);
                setIsDetecting(false);
                return;
            }

            console.log(`Detecting cell [${row},${col}]...`);

            // Find best match from references
            const matchedType = await findBestMatch(cellImageData, 0.70);

            console.log(`Cell [${row},${col}] hover detection result:`, matchedType);

            // Update result for display
            setDetectedType(matchedType);
        } catch (e) {
            console.error('Detection error:', e);
            setDetectedType(null);
        } finally {
            setIsDetecting(false);
        }
    };    // Save cell on click
    const handleCellClick = async (row: number, col: number) => {
        if (!imageURL) return;

        const key = `${row},${col}`;
        if (lastSaved === key) return; // Already saved this one

        // Get the detected type from the grid (or use detected type from hover)
        const cellType = grid?.[row]?.[col] ?? detectedType ?? selectedType;

        const dims = getCellDimensions();
        if (!dims) return;

        const { cellWidth, cellHeight } = dims;

        // Create canvas for cropping
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        const img = new Image();
        img.src = imageURL;

        await new Promise((resolve) => {
            img.onload = resolve;
        });

        // Set canvas size to cell size
        canvas.width = cellWidth;
        canvas.height = cellHeight;

        // Calculate source coordinates
        const sx = col * cellWidth + gridOffsetX;
        const sy = row * cellHeight + gridOffsetY;

        // Draw the cropped cell
        ctx.drawImage(
            img,
            sx, sy, cellWidth, cellHeight,  // Source
            0, 0, cellWidth, cellHeight      // Destination
        );

        // Get base64 image data
        const imageData = canvas.toDataURL('image/png');

        // Save
        onCapture({
            imageData: imageData,
            tileType: cellType,
            row: row,
            col: col,
        });

        // Save to localStorage
        const stored = localStorage.getItem(STORAGE_KEY);
        const existing = stored ? JSON.parse(stored) : [];

        const newRef = {
            id: `ref-${Date.now()}-${row}-${col}`,
            tileType: cellType,
            imageData: imageData,
            timestamp: Date.now(),
            gridPosition: { row, col },
        };

        localStorage.setItem(STORAGE_KEY, JSON.stringify([...existing, newRef]));

        setLastSaved(key);

        console.log(`✓ Saved cell [${row},${col}] as type ${cellType} (${TILE_TYPES.find(t => t.id === cellType)?.name})`);
    };

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
                <Alert className="bg-blue-50 border-blue-200">
                    <AlertDescription className="font-semibold">
                        🔍 Scanning and detecting all cells...
                    </AlertDescription>
                </Alert>
            )}

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
                    All cells are <strong>automatically detected and mapped</strong> when the image loads. <strong>Hover</strong> over cells to view detection results. <strong>Click</strong> to save a cell as a reference sprite.
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
                        className="absolute inset-0 grid"
                        style={{
                            gridTemplateColumns: `repeat(${cols}, 1fr)`,
                            gridTemplateRows: `repeat(${rows}, 1fr)`
                        }}
                    >
                        {Array.from({ length: rows }).map((_, r) =>
                            Array.from({ length: cols }).map((_, c) => {
                                const isHovered = hoveredCell?.row === r && hoveredCell?.col === c;
                                const wasSaved = lastSaved === `${r},${c}`;

                                // Check if cell matches filter type
                                const matchesFilter = filterType === 'all' || detectedType === filterType ||
                                    (isHovered && detectedType === filterType);

                                // Determine background color based on detection and filter
                                // Don't show intermediate "detecting" state - only show final results
                                let bgColor = 'bg-transparent border-blue-500/30';
                                let shouldHighlight = false;

                                if (wasSaved) {
                                    bgColor = 'bg-green-500/50 border-green-500';
                                } else if (isHovered && !isDetecting) {
                                    // Only show visual feedback when detection is complete
                                    if (detectedType !== null) {
                                        // Check if detected type matches filter
                                        if (filterType === 'all' || detectedType === filterType) {
                                            shouldHighlight = true;
                                            bgColor = `border-blue-500 border-2`;
                                        } else {
                                            // Detected but doesn't match filter - show dimmed
                                            bgColor = `border-gray-400 border-opacity-50`;
                                        }
                                    } else {
                                        // No match - white
                                        bgColor = 'bg-white/50 border-red-500';
                                    }
                                } else if (filterType !== 'all') {
                                    // When filter is active, dim non-matching cells slightly
                                    bgColor = 'bg-transparent border-gray-400/20';
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
                                        className={`border transition-colors hover:opacity-80 ${bgColor}`}
                                        style={{
                                            backgroundColor: shouldHighlight && detectedType !== null && !wasSaved
                                                ? TILE_TYPES.find(t => t.id === detectedType)?.color + '80' // Add transparency
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
