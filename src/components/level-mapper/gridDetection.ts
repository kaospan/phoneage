const MIN_DETECTED_ROWS = 8;
const MAX_DETECTED_ROWS = 16;
const MIN_DETECTED_COLS = 8;
const MAX_DETECTED_COLS = 24;
const MAX_DETECTED_CELLS = 320;

type DetectGridHints = {
    hintCellWidth?: number;
    hintCellHeight?: number;
    preferredCols?: number;
    preferredRows?: number;
};

// Grid line detection logic
export const detectGridLines = (
    canvas: HTMLCanvasElement,
    useDetectCurrentCounts: boolean,
    currentRows: number,
    currentCols: number,
    hints?: DetectGridHints
): { rows: number; cols: number; offsetX: number; offsetY: number; cellWidth: number; cellHeight: number } | null => {
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

    const scoreOffsetForSize = (
        arr: number[],
        size: number,
        preferredCount?: number
    ): { offset: number; score: number; runStart: number; runLen: number } => {
        let bestOffset = 0;
        let bestScore = -Infinity;
        let bestRunStart = 0;
        let bestRunLen = 0;

        for (let offset = 0; offset < size; offset += 1) {
            const samples: number[] = [];
            for (let pos = offset; pos < arr.length; pos += size) samples.push(arr[pos]);
            if (samples.length < 4) continue;

            // Adaptive threshold: prefer the strongest repeated boundaries.
            const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
            const variance = samples.reduce((a, b) => a + (b - mean) * (b - mean), 0) / samples.length;
            const std = Math.sqrt(variance);
            const thr = mean + std * 0.35;

            let runStart = 0;
            let runLen = 0;
            let bestLocalStart = 0;
            let bestLocalLen = 0;
            let runSum = 0;
            let bestLocalSum = 0;

            for (let i = 0; i < samples.length; i += 1) {
                if (samples[i] >= thr) {
                    if (runLen === 0) runStart = i;
                    runLen += 1;
                    runSum += samples[i];
                    if (runLen > bestLocalLen || (runLen === bestLocalLen && runSum > bestLocalSum)) {
                        bestLocalLen = runLen;
                        bestLocalStart = runStart;
                        bestLocalSum = runSum;
                    }
                } else {
                    runLen = 0;
                    runSum = 0;
                }
            }

            // Score favors long consistent runs; gently boost if it matches the preferred row/col count.
            const cellCount = Math.max(0, bestLocalLen - 1);
            const matchBoost = preferredCount && cellCount === preferredCount ? 1.25 : 1;
            const avgRunStrength = bestLocalLen > 0 ? bestLocalSum / bestLocalLen : 0;
            const score = matchBoost * (bestLocalLen * 2 + avgRunStrength);

            if (score > bestScore) {
                bestScore = score;
                bestOffset = offset;
                bestRunStart = bestLocalStart;
                bestRunLen = bestLocalLen;
            }
        }

        return { offset: bestOffset, score: bestScore, runStart: bestRunStart, runLen: bestRunLen };
    };

    const findBestSpacing = (arr: number[], sizeHint?: number, preferredCount?: number) => {
        const minSize = Math.max(10, Math.floor(Math.min(width, height) / 90));
        const maxSize = Math.min(180, Math.floor(Math.min(width, height) / 2));

        const sizes = (() => {
            if (sizeHint && Number.isFinite(sizeHint)) {
                const center = Math.round(sizeHint);
                const span = Math.max(6, Math.round(center * 0.18));
                const lo = Math.max(minSize, center - span);
                const hi = Math.min(maxSize, center + span);
                return Array.from({ length: hi - lo + 1 }, (_, i) => lo + i);
            }
            return Array.from({ length: maxSize - minSize + 1 }, (_, i) => i + minSize);
        })();

        let bestSize = 0;
        let bestOffset = 0;
        let bestScore = -Infinity;
        let bestRunStart = 0;
        let bestRunLen = 0;

        for (const size of sizes) {
            const scored = scoreOffsetForSize(arr, size, preferredCount);
            if (scored.score > bestScore) {
                bestScore = scored.score;
                bestSize = size;
                bestOffset = scored.offset;
                bestRunStart = scored.runStart;
                bestRunLen = scored.runLen;
            }
        }

        return { size: bestSize, offset: bestOffset, score: bestScore, runStart: bestRunStart, runLen: bestRunLen };
    };

    const preferredCols = hints?.preferredCols;
    const preferredRows = hints?.preferredRows;

    // Only constrain size search when the user locks counts OR we have a learned cell-size profile.
    const sizeHintX = useDetectCurrentCounts
        ? (currentCols > 0 ? width / currentCols : undefined)
        : hints?.hintCellWidth;
    const sizeHintY = useDetectCurrentCounts
        ? (currentRows > 0 ? height / currentRows : undefined)
        : hints?.hintCellHeight;

    const xSpacing = findBestSpacing(vSmooth, sizeHintX, preferredCols);
    const ySpacing = findBestSpacing(hSmooth, sizeHintY, preferredRows);

    if (xSpacing.size <= 0 || ySpacing.size <= 0) {
        console.error('❌ Grid detection failed: no spacing candidates');
        return null;
    }

    // If we found a strong run of boundaries, trust it. Otherwise fall back to naive width/height division.
    const runCols = xSpacing.runLen >= 3 ? Math.max(0, xSpacing.runLen - 1) : 0;
    const runRows = ySpacing.runLen >= 3 ? Math.max(0, ySpacing.runLen - 1) : 0;

    const detectedCols = runCols
        ? Math.max(MIN_DETECTED_COLS, Math.min(MAX_DETECTED_COLS, runCols))
        : Math.max(MIN_DETECTED_COLS, Math.min(MAX_DETECTED_COLS, Math.round(width / xSpacing.size)));
    const detectedRows = runRows
        ? Math.max(MIN_DETECTED_ROWS, Math.min(MAX_DETECTED_ROWS, runRows))
        : Math.max(MIN_DETECTED_ROWS, Math.min(MAX_DETECTED_ROWS, Math.round(height / ySpacing.size)));

    const finalCols = useDetectCurrentCounts ? currentCols : detectedCols;
    const finalRows = useDetectCurrentCounts ? currentRows : detectedRows;

    // Safety: never allow absurdly large grids (they can freeze the UI during cell analysis).
    if (finalRows * finalCols > MAX_DETECTED_CELLS) {
        console.error(`❌ Grid detection produced an unsafe cell count: ${finalRows}x${finalCols}`);
        return null;
    }

    console.log(`✓ Grid detected: ${finalRows}x${finalCols} (cell ~ ${xSpacing.size}px × ${ySpacing.size}px)`);

    // Use runStart to position the first strong boundary line when available.
    const adjustedOffsetX = xSpacing.runLen >= 3 ? xSpacing.offset + xSpacing.runStart * xSpacing.size : xSpacing.offset;
    const adjustedOffsetY = ySpacing.runLen >= 3 ? ySpacing.offset + ySpacing.runStart * ySpacing.size : ySpacing.offset;
    return {
        rows: finalRows,
        cols: finalCols,
        offsetX: adjustedOffsetX,
        offsetY: adjustedOffsetY,
        cellWidth: xSpacing.size,
        cellHeight: ySpacing.size,
    };
};
