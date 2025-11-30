// Grid line detection logic
export const detectGridLines = (
    canvas: HTMLCanvasElement,
    useDetectCurrentCounts: boolean,
    currentRows: number,
    currentCols: number
): { rows: number; cols: number } | null => {
    console.log('🔍 detectGridLines() started');
    
    const ctx = canvas.getContext('2d');
    if (!ctx) {
        console.error('❌ No context in detectGrid');
        return null;
    }
    
    const { width, height } = canvas;
    console.log(`📐 Canvas size: ${width}x${height}`);

    const imgData = ctx.getImageData(0, 0, width, height).data;
    console.log(`✓ ImageData retrieved: ${imgData.length} bytes`);

    const horizontalScores: number[] = [];
    const verticalScores: number[] = [];
    const threshold = 180;

    // Scan horizontal lines
    console.log('🔍 Scanning horizontal lines...');
    for (let y = 0; y < height; y++) {
        let score = 0;
        for (let x = 0; x < width; x += 2) {
            const i = (y * width + x) * 4;
            const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2];
            if (r > threshold && g > threshold && b > threshold) score++;
        }
        horizontalScores[y] = score;
    }

    // Scan vertical lines
    console.log('🔍 Scanning vertical lines...');
    for (let x = 0; x < width; x++) {
        let score = 0;
        for (let y = 0; y < height; y += 2) {
            const i = (y * width + x) * 4;
            const r = imgData[i], g = imgData[i + 1], b = imgData[i + 2];
            if (r > threshold && g > threshold && b > threshold) score++;
        }
        verticalScores[x] = score;
    }

    // Find peaks in scores
    const findPeaks = (scores: number[], minSpacing: number) => {
        const peaks: { pos: number; score: number }[] = [];
        for (let i = 1; i < scores.length - 1; i++) {
            if (scores[i] > scores[i - 1] && scores[i] > scores[i + 1]) {
                peaks.push({ pos: i, score: scores[i] });
            }
        }
        peaks.sort((a, b) => b.score - a.score);
        
        const filtered: number[] = [];
        for (const peak of peaks) {
            const tooClose = filtered.some(pos => Math.abs(pos - peak.pos) < minSpacing);
            if (!tooClose) filtered.push(peak.pos);
        }
        filtered.sort((a, b) => a - b);
        return filtered;
    };

    const minSpacing = 15;
    const hLines = findPeaks(horizontalScores, minSpacing);
    const vLines = findPeaks(verticalScores, minSpacing);

    console.log(`📊 Detected lines: ${hLines.length} horizontal, ${vLines.length} vertical`);

    if (hLines.length >= 2 && vLines.length >= 2) {
        const detectedRows = hLines.length - 1;
        const detectedCols = vLines.length - 1;
        const finalRows = useDetectCurrentCounts ? currentRows : detectedRows;
        const finalCols = useDetectCurrentCounts ? currentCols : detectedCols;
        console.log(`✓ Grid detected: ${finalRows}x${finalCols}`);
        return { rows: finalRows, cols: finalCols };
    }

    console.error('❌ Grid detection failed:', { hLines: hLines.length, vLines: vLines.length });
    return null;
};
