const loadImage = async (imageURL: string): Promise<HTMLImageElement> => {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load image: ${imageURL}`));
        image.src = imageURL;
    });
};

export const normalizeMapperImage = async (imageURL: string): Promise<string> => {
    const image = await loadImage(imageURL);

    if (image.width >= image.height) {
        return imageURL;
    }

    const canvas = document.createElement('canvas');
    canvas.width = image.height;
    canvas.height = image.width;
    const context = canvas.getContext('2d');
    if (!context) {
        return imageURL;
    }

    context.translate(canvas.width, 0);
    context.rotate(Math.PI / 2);
    context.drawImage(image, 0, 0);

    return canvas.toDataURL('image/png');
};
