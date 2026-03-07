const MIN_DETECTED_ROWS = 6;
const MAX_DETECTED_ROWS = 16;
const MIN_DETECTED_COLS = 8;
const MAX_DETECTED_COLS = 26;
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

    // Larger images can be scanned with a bigger step without losing the periodicity signal.
    const step = Math.max(2, Math.round(Math.min(width, height) / 700));
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

    const movingAverage = (arr: number[], windowSize: number) => {
        const w = Math.max(3, Math.floor(windowSize) | 1);
        const half = Math.floor(w / 2);
        const prefix: number[] = Array(arr.length + 1).fill(0);
        for (let i = 0; i < arr.length; i += 1) prefix[i + 1] = prefix[i] + arr[i];
        return arr.map((_, i) => {
            const lo = Math.max(0, i - half);
            const hi = Math.min(arr.length - 1, i + half);
            const sum = prefix[hi + 1] - prefix[lo];
            const denom = hi - lo + 1;
            return denom > 0 ? sum / denom : 0;
        });
    };

    const percentile = (arr: number[], p: number) => {
        if (arr.length === 0) return 0;
        const copy = [...arr].sort((a, b) => a - b);
        const idx = Math.max(0, Math.min(copy.length - 1, Math.round((copy.length - 1) * p)));
        return copy[idx];
    };

    const findActivityExtents = (arr: number[], axisSize: number) => {
        // Smooth into a "texture energy" signal so islands still contribute even if boundaries are sparse.
        const window = Math.max(13, Math.round(axisSize / 60) | 1);
        const energy = movingAverage(arr, window);
        const p90 = percentile(energy, 0.9);
        const p50 = percentile(energy, 0.5);
        const thr = p50 + (p90 - p50) * 0.35;

        let min = Infinity;
        let max = -Infinity;
        for (let i = 0; i < energy.length; i += 1) {
            if (energy[i] >= thr) {
                if (i < min) min = i;
                if (i > max) max = i;
            }
        }
        if (!Number.isFinite(min) || !Number.isFinite(max) || max <= min) {
            return { min: 0, max: energy.length - 1, energy };
        }
        const pad = Math.min(24, Math.max(6, Math.round(axisSize / 90)));
        return {
            min: Math.max(0, Math.floor(min - pad)),
            max: Math.min(energy.length - 1, Math.ceil(max + pad)),
            energy,
        };
    };

    const xExtent = findActivityExtents(vSmooth, width);
    const yExtent = findActivityExtents(hSmooth, height);

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

    const findBestSpacing = (
        arr: number[],
        sizeHint?: number,
        preferredCount?: number,
        candidateSizes?: number[]
    ) => {
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
            if (candidateSizes && candidateSizes.length > 0) {
                const unique = Array.from(new Set(candidateSizes.map((v) => Math.round(v))))
                    .filter((v) => Number.isFinite(v) && v >= minSize && v <= maxSize)
                    .sort((a, b) => a - b);
                if (unique.length > 0) return unique;
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

    const findBestSpacingInRange = (
        arr: number[],
        rangeMin: number,
        rangeMax: number,
        sizeHint?: number,
        preferredCount?: number,
        candidateSizes?: number[]
    ) => {
        const start = Math.max(0, Math.min(arr.length - 1, rangeMin));
        const end = Math.max(start, Math.min(arr.length - 1, rangeMax));
        const sliced = arr.slice(start, end + 1);
        const res = findBestSpacing(sliced, sizeHint, preferredCount, candidateSizes);
        return { ...res, offsetAbs: start + res.offset, rangeStart: start, rangeEnd: end };
    };

    // Use the active extents to avoid background noise, but keep the full extents for counting (gap between islands).
    const makeCandidateSizes = (span: number, minCount: number, maxCount: number) => {
        const sizes: number[] = [];
        const safeSpan = Math.max(1, span);
        for (let count = minCount; count <= maxCount; count += 1) {
            const base = safeSpan / count;
            const center = Math.round(base);
            for (let d = -2; d <= 2; d += 1) sizes.push(center + d);
        }
        return sizes;
    };

    const xSpan = Math.max(1, xExtent.max - xExtent.min);
    const ySpan = Math.max(1, yExtent.max - yExtent.min);
    const xCandidates = makeCandidateSizes(xSpan, MIN_DETECTED_COLS, MAX_DETECTED_COLS);
    const yCandidates = makeCandidateSizes(ySpan, MIN_DETECTED_ROWS, MAX_DETECTED_ROWS);

    const xSpacing = findBestSpacingInRange(vSmooth, xExtent.min, xExtent.max, sizeHintX, preferredCols, xCandidates);
    const ySpacing = findBestSpacingInRange(hSmooth, yExtent.min, yExtent.max, sizeHintY, preferredRows, yCandidates);

    if (xSpacing.size <= 0 || ySpacing.size <= 0) {
        console.error('❌ Grid detection failed: no spacing candidates');
        return null;
    }

    // Use runStart to position the first strong boundary line when available.
    const adjustedOffsetX = xSpacing.runLen >= 3 ? xSpacing.offsetAbs + xSpacing.runStart * xSpacing.size : xSpacing.offsetAbs;
    const adjustedOffsetY = ySpacing.runLen >= 3 ? ySpacing.offsetAbs + ySpacing.runStart * ySpacing.size : ySpacing.offsetAbs;

    const snapGridToExtent = (
        extentMin: number,
        extentMax: number,
        size: number,
        offset: number,
        minCount: number,
        maxCount: number,
        preferredCount?: number
    ) => {
        const safeSize = Math.max(1, Math.round(size));
        const gridStart = Math.floor((extentMin - offset) / safeSize) * safeSize + offset;
        const gridEnd = Math.ceil((extentMax - offset) / safeSize) * safeSize + offset;
        const span = Math.max(safeSize, gridEnd - gridStart);
        let count = Math.max(1, Math.round(span / safeSize));
        if (preferredCount && Math.abs(preferredCount - count) <= 2) {
            count = preferredCount;
        }
        count = Math.max(minCount, Math.min(maxCount, count));
        return { gridStart, count };
    };

    const detectedColsFromExtent = snapGridToExtent(
        xExtent.min,
        xExtent.max,
        xSpacing.size,
        adjustedOffsetX,
        MIN_DETECTED_COLS,
        MAX_DETECTED_COLS,
        preferredCols
    );
    const detectedRowsFromExtent = snapGridToExtent(
        yExtent.min,
        yExtent.max,
        ySpacing.size,
        adjustedOffsetY,
        MIN_DETECTED_ROWS,
        MAX_DETECTED_ROWS,
        preferredRows
    );

    const finalCols = useDetectCurrentCounts ? currentCols : detectedColsFromExtent.count;
    const finalRows = useDetectCurrentCounts ? currentRows : detectedRowsFromExtent.count;

    // Safety: never allow absurdly large grids (they can freeze the UI during cell analysis).
    if (finalRows * finalCols > MAX_DETECTED_CELLS) {
        console.error(`❌ Grid detection produced an unsafe cell count: ${finalRows}x${finalCols}`);
        return null;
    }

    console.log(`✓ Grid detected: ${finalRows}x${finalCols} (cell ~ ${xSpacing.size}px × ${ySpacing.size}px)`);

    const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

    const scoreBoundaries = (arr: number[], offset: number, size: number, count: number) => {
        let sum = 0;
        for (let i = 0; i <= count; i += 1) {
            const pos = Math.round(offset + i * size);
            if (pos >= 0 && pos < arr.length) sum += arr[pos];
        }
        return sum;
    };

    const refineOffset = (arr: number[], offset: number, size: number, count: number) => {
        const range = Math.min(10, Math.max(3, Math.round(size * 0.12)));
        let best = offset;
        let bestScore = scoreBoundaries(arr, offset, size, count);
        for (let d = -range; d <= range; d += 1) {
            const cand = offset + d;
            const s = scoreBoundaries(arr, cand, size, count);
            if (s > bestScore) {
                bestScore = s;
                best = cand;
            }
        }
        return best;
    };

    const baseOffsetX = useDetectCurrentCounts ? adjustedOffsetX : detectedColsFromExtent.gridStart;
    const baseOffsetY = useDetectCurrentCounts ? adjustedOffsetY : detectedRowsFromExtent.gridStart;
    const refinedOffsetX = refineOffset(vSmooth, baseOffsetX, xSpacing.size, finalCols);
    const refinedOffsetY = refineOffset(hSmooth, baseOffsetY, ySpacing.size, finalRows);

    const finalOffsetX = clamp(refinedOffsetX, 0, width - 1);
    const finalOffsetY = clamp(refinedOffsetY, 0, height - 1);
    return {
        rows: finalRows,
        cols: finalCols,
        offsetX: finalOffsetX,
        offsetY: finalOffsetY,
        cellWidth: xSpacing.size,
        cellHeight: ySpacing.size,
    };
};
