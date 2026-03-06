const MIN_DETECTED_ROWS = 8;
const MAX_DETECTED_ROWS = 16;
const MIN_DETECTED_COLS = 8;
const MAX_DETECTED_COLS = 24;
const MAX_DETECTED_CELLS = 320;

// Grid line detection logic
export const detectGridLines = (
    canvas: HTMLCanvasElement,
    useDetectCurrentCounts: boolean,
    currentRows: number,
    currentCols: number
): { rows: number; cols: number; offsetX: number; offsetY: number } | null => {
    console.log('🔍 detectGridLines() started');

    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) {
        console.error('❌ No context in detectGrid');
        return null;
    }
    
    const { width, height } = canvas;
    console.log(`📐 Canvas size: ${width}x${height}`);

    const imgData = ctx.getImageData(0, 0, width, height).data;
    console.log(`✓ ImageData retrieved: ${imgData.length} bytes`);

    const step = 2;
    const verticalEdge: number[] = Array(width).fill(0);
    const horizontalEdge: number[] = Array(height).fill(0);

    const luma = (idx: number) => {
        const r = imgData[idx];
        const g = imgData[idx + 1];
        const b = imgData[idx + 2];
        return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    };

    console.log('🔍 Scanning edge strengths...');
    for (let y = 0; y < height; y += step) {
        for (let x = 1; x < width; x += step) {
            const i = (y * width + x) * 4;
            const j = (y * width + (x - 1)) * 4;
            verticalEdge[x] += Math.abs(luma(i) - luma(j));
        }
    }

    for (let x = 0; x < width; x += step) {
        for (let y = 1; y < height; y += step) {
            const i = (y * width + x) * 4;
            const j = ((y - 1) * width + x) * 4;
            horizontalEdge[y] += Math.abs(luma(i) - luma(j));
        }
    }

    const smooth = (arr: number[], windowSize = 5) => {
        const half = Math.floor(windowSize / 2);
        return arr.map((_, i) => {
            let sum = 0;
            let count = 0;
            for (let k = -half; k <= half; k++) {
                const idx = i + k;
                if (idx >= 0 && idx < arr.length) {
                    sum += arr[idx];
                    count++;
                }
            }
            return count ? sum / count : 0;
        });
    };

    const vSmooth = smooth(verticalEdge, 7);
    const hSmooth = smooth(horizontalEdge, 7);

    const findBestSpacing = (arr: number[], sizeHint?: number) => {
        const minSize = Math.max(8, Math.floor(Math.min(width, height) / 80));
        const maxSize = Math.min(180, Math.floor(Math.min(width, height) / 2));
        const sizes = sizeHint ? [Math.max(minSize, Math.min(maxSize, Math.round(sizeHint)))] : Array.from({ length: maxSize - minSize + 1 }, (_, i) => i + minSize);

        let bestSize = 0;
        let bestOffset = 0;
        let bestScore = -Infinity;

        for (const size of sizes) {
            for (let offset = 0; offset < size; offset += 1) {
                let score = 0;
                let count = 0;
                for (let pos = offset; pos < arr.length; pos += size) {
                    score += arr[pos];
                    count++;
                }
                if (count > 0) {
                    const normalized = score / count;
                    if (normalized > bestScore) {
                        bestScore = normalized;
                        bestSize = size;
                        bestOffset = offset;
                    }
                }
            }
        }
        return { size: bestSize, offset: bestOffset, score: bestScore };
    };

    const hintCols = currentCols > 0 ? width / currentCols : undefined;
    const hintRows = currentRows > 0 ? height / currentRows : undefined;

    const xSpacing = findBestSpacing(vSmooth, useDetectCurrentCounts ? hintCols : undefined);
    const ySpacing = findBestSpacing(hSmooth, useDetectCurrentCounts ? hintRows : undefined);

    if (xSpacing.size <= 0 || ySpacing.size <= 0) {
        console.error('❌ Grid detection failed: no spacing candidates');
        return null;
    }

    const detectedCols = Math.max(MIN_DETECTED_COLS, Math.min(MAX_DETECTED_COLS, Math.round(width / xSpacing.size)));
    const detectedRows = Math.max(MIN_DETECTED_ROWS, Math.min(MAX_DETECTED_ROWS, Math.round(height / ySpacing.size)));
    const finalCols = useDetectCurrentCounts ? currentCols : detectedCols;
    const finalRows = useDetectCurrentCounts ? currentRows : detectedRows;

    if (!useDetectCurrentCounts && finalRows * finalCols > MAX_DETECTED_CELLS) {
        console.error(`❌ Grid detection produced an unsafe cell count: ${finalRows}x${finalCols}`);
        return null;
    }

    console.log(`✓ Grid detected: ${finalRows}x${finalCols} (cell ~ ${xSpacing.size}px × ${ySpacing.size}px)`);
    return { rows: finalRows, cols: finalCols, offsetX: xSpacing.offset, offsetY: ySpacing.offset };
};
