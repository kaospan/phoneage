const loadImage = async (imageURL: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image: ${imageURL}`));
        image.src = imageURL;
    });
};

const NEAR_BLACK = 20;

const isNearBlack = (r: number, g: number, b: number) =>
    r <= NEAR_BLACK && g <= NEAR_BLACK && b <= NEAR_BLACK;

const clampInt = (value: number, min: number, max: number) =>
    Math.max(min, Math.min(max, Math.round(value)));

const colorDistance = (r: number, g: number, b: number, bg: { r: number; g: number; b: number }) =>
    Math.abs(r - bg.r) + Math.abs(g - bg.g) + Math.abs(b - bg.b);

const estimateBackgroundColor = (pixels: Uint8ClampedArray, width: number, height: number) => {
    const samples: Array<{ r: number; g: number; b: number }> = [];
    const points = [
        [2, 2],
        [width - 3, 2],
        [2, height - 3],
        [width - 3, height - 3],
        [Math.floor(width / 2), 2],
        [Math.floor(width / 2), height - 3],
    ];

    for (const [x, y] of points) {
        const sx = clampInt(x, 0, width - 1);
        const sy = clampInt(y, 0, height - 1);
        const index = (sy * width + sx) * 4;
        samples.push({ r: pixels[index], g: pixels[index + 1], b: pixels[index + 2] });
    }

    // Median-ish (sort by luma and pick middle) to reduce impact of UI chrome.
    const withLuma = samples
        .map((c) => ({ ...c, l: 0.2126 * c.r + 0.7152 * c.g + 0.0722 * c.b }))
        .sort((a, b) => a.l - b.l);

    const mid = withLuma[Math.floor(withLuma.length / 2)];
    return { r: mid.r, g: mid.g, b: mid.b };
};

// Attempts to isolate the main "game viewport" rectangle inside larger screenshots (browser UI, margins, cookie banners).
// It looks for the longest vertical run of rows where the non-background content forms a stable, centered rectangle.
const cropCenterViewport = (pixels: Uint8ClampedArray, width: number, height: number) => {
    const bg = estimateBackgroundColor(pixels, width, height);
    const step = 4;
    const diffThreshold = 55;
    const minSegmentWidth = Math.floor(width * 0.35);
    const maxSegmentWidth = Math.floor(width * 0.92);
    const minRunRows = Math.max(40, Math.floor(height * 0.18));
    const toleranceX = Math.max(18, Math.floor(width * 0.03));

    const rows: Array<{ y: number; x0: number; x1: number; w: number }> = [];

    for (let y = 0; y < height; y += step) {
        let left = -1;
        let right = -1;

        for (let x = 0; x < width; x += step) {
            const index = (y * width + x) * 4;
            const dist = colorDistance(pixels[index], pixels[index + 1], pixels[index + 2], bg);
            if (dist > diffThreshold) {
                left = x;
                break;
            }
        }

        if (left === -1) continue;

        for (let x = width - 1; x >= 0; x -= step) {
            const index = (y * width + x) * 4;
            const dist = colorDistance(pixels[index], pixels[index + 1], pixels[index + 2], bg);
            if (dist > diffThreshold) {
                right = x;
                break;
            }
        }

        if (right <= left) continue;
        const segWidth = right - left + 1;
        if (segWidth < minSegmentWidth || segWidth > maxSegmentWidth) continue;

        rows.push({ y, x0: left, x1: right, w: segWidth });
    }

    if (rows.length === 0) return null;

    // Find the longest run with stable x0/x1 (viewport borders stay roughly constant).
    let best: { start: number; end: number } | null = null;
    let runStart = 0;

    for (let i = 1; i <= rows.length; i += 1) {
        const isBreak =
            i === rows.length ||
            rows[i].y - rows[i - 1].y > step * 2 ||
            Math.abs(rows[i].x0 - rows[i - 1].x0) > toleranceX ||
            Math.abs(rows[i].x1 - rows[i - 1].x1) > toleranceX;

        if (isBreak) {
            const runEnd = i - 1;
            const runRows = runEnd - runStart + 1;
            if (runRows * step >= minRunRows) {
                if (!best || runRows > best.end - best.start + 1) {
                    best = { start: runStart, end: runEnd };
                }
            }
            runStart = i;
        }
    }

    if (!best) return null;

    const slice = rows.slice(best.start, best.end + 1);
    const xs0 = slice.map((r) => r.x0).sort((a, b) => a - b);
    const xs1 = slice.map((r) => r.x1).sort((a, b) => a - b);
    const medianX0 = xs0[Math.floor(xs0.length / 2)];
    const medianX1 = xs1[Math.floor(xs1.length / 2)];

    const y0 = slice[0].y;
    const y1 = slice[slice.length - 1].y;

    const cropLeft = clampInt(medianX0 - step, 0, width - 1);
    const cropRight = clampInt(medianX1 + step, 0, width - 1);
    const cropTop = clampInt(y0 - step * 2, 0, height - 1);
    const cropBottom = clampInt(y1 + step * 2, 0, height - 1);

    const cropW = cropRight - cropLeft + 1;
    const cropH = cropBottom - cropTop + 1;

    // Sanity: avoid tiny/incorrect crops.
    if (cropW < width * 0.4 || cropH < height * 0.25) return null;

    return { left: cropLeft, top: cropTop, width: cropW, height: cropH };
};

const isMostlyBlackRow = (
    pixels: Uint8ClampedArray,
    width: number,
    y: number,
    startX: number,
    endX: number,
    threshold = 0.92
) => {
    let dark = 0;
    let total = 0;
    for (let x = startX; x <= endX; x += 1) {
        const index = (y * width + x) * 4;
        if (isNearBlack(pixels[index], pixels[index + 1], pixels[index + 2])) dark += 1;
        total += 1;
    }
    return total > 0 && dark / total >= threshold;
};

const isMostlyBlackColumn = (
    pixels: Uint8ClampedArray,
    width: number,
    height: number,
    x: number,
    startY: number,
    endY: number,
    threshold = 0.92
) => {
    let dark = 0;
    let total = 0;
    for (let y = startY; y <= endY; y += 1) {
        const index = (y * width + x) * 4;
        if (isNearBlack(pixels[index], pixels[index + 1], pixels[index + 2])) dark += 1;
        total += 1;
    }
    return total > 0 && dark / total >= threshold;
};

const cropBlackEdges = (
    pixels: Uint8ClampedArray,
    width: number,
    height: number
) => {
    let left = 0;
    let right = width - 1;
    let top = 0;
    let bottom = height - 1;
    const maxHorizontalTrim = Math.floor(width * 0.08);
    const maxVerticalTrim = Math.floor(height * 0.08);

    while (left < right && left < maxHorizontalTrim && isMostlyBlackColumn(pixels, width, height, left, top, bottom)) {
        left += 1;
    }
    while (right > left && width - 1 - right < maxHorizontalTrim && isMostlyBlackColumn(pixels, width, height, right, top, bottom)) {
        right -= 1;
    }
    while (top < bottom && top < maxVerticalTrim && isMostlyBlackRow(pixels, width, top, left, right)) {
        top += 1;
    }
    while (bottom > top && height - 1 - bottom < maxVerticalTrim && isMostlyBlackRow(pixels, width, bottom, left, right)) {
        bottom -= 1;
    }

    return { left, top, width: right - left + 1, height: bottom - top + 1 };
};

const findHudCutRow = (pixels: Uint8ClampedArray, width: number, height: number) => {
    const minY = Math.floor(height * 0.72);
    const fallback = Math.floor(height * 0.89);

    for (let y = height - 2; y >= minY; y -= 1) {
        if (isMostlyBlackRow(pixels, width, y, 0, width - 1, 0.78)) {
            return y;
        }
    }

    return fallback;
};

export const normalizeMapperImage = async (imageURL: string): Promise<string> => {
    const image = await loadImage(imageURL);
    const rotatedCanvas = document.createElement('canvas');
    const shouldRotate = image.width < image.height;
    rotatedCanvas.width = shouldRotate ? image.height : image.width;
    rotatedCanvas.height = shouldRotate ? image.width : image.height;

    const rotatedContext = rotatedCanvas.getContext('2d');
    if (!rotatedContext) {
        return imageURL;
    }

    if (shouldRotate) {
        rotatedContext.translate(rotatedCanvas.width, 0);
        rotatedContext.rotate(Math.PI / 2);
    }
    rotatedContext.drawImage(image, 0, 0);

    const rotatedPixels = rotatedContext.getImageData(0, 0, rotatedCanvas.width, rotatedCanvas.height).data;

    // First, attempt to isolate the central game viewport for screenshots that include browser/UI chrome.
    const viewportCrop = cropCenterViewport(rotatedPixels, rotatedCanvas.width, rotatedCanvas.height);
    const viewportLeft = viewportCrop?.left ?? 0;
    const viewportTop = viewportCrop?.top ?? 0;
    const viewportWidth = viewportCrop?.width ?? rotatedCanvas.width;
    const viewportHeight = viewportCrop?.height ?? rotatedCanvas.height;

    const viewportPixels = rotatedContext.getImageData(viewportLeft, viewportTop, viewportWidth, viewportHeight).data;
    const borderCrop = cropBlackEdges(viewportPixels, viewportWidth, viewportHeight);
    const croppedWidth = borderCrop.width;
    const croppedHeight = borderCrop.height;
    const hudSourceTop = viewportTop + borderCrop.top;
    const hudSourceLeft = viewportLeft + borderCrop.left;

    const hudPixels = rotatedContext.getImageData(
        hudSourceLeft,
        hudSourceTop,
        croppedWidth,
        croppedHeight
    ).data;
    const hudCutRow = findHudCutRow(hudPixels, croppedWidth, croppedHeight);
    const finalHeight = Math.max(1, Math.min(croppedHeight, hudCutRow));

    const finalCanvas = document.createElement('canvas');
    finalCanvas.width = croppedWidth;
    finalCanvas.height = finalHeight;
    const finalContext = finalCanvas.getContext('2d');
    if (!finalContext) {
        return imageURL;
    }

    finalContext.drawImage(
        rotatedCanvas,
        hudSourceLeft,
        hudSourceTop,
        croppedWidth,
        finalHeight,
        0,
        0,
        croppedWidth,
        finalHeight
    );

    return finalCanvas.toDataURL('image/png');
};
