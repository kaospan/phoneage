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
    const borderCrop = cropBlackEdges(rotatedPixels, rotatedCanvas.width, rotatedCanvas.height);
    const croppedWidth = borderCrop.width;
    const croppedHeight = borderCrop.height;
    const hudSourceTop = borderCrop.top;
    const hudSourceLeft = borderCrop.left;

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
