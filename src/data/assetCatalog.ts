export interface AssetEntry {
  name: string;
  url: string;
}

export interface StageImageSet {
  id: number;
  primary: string;
  sources: string[];
}

const pngs = import.meta.glob('../assets/*.png', { eager: true, import: 'default' });
const jpgs = import.meta.glob('../assets/*.jpg', { eager: true, import: 'default' });

const rawAssets = { ...pngs, ...jpgs } as Record<string, string>;

const assets: AssetEntry[] = Object.entries(rawAssets).map(([path, url]) => {
  const name = path.split('/').pop() || path;
  return { name, url };
});

export const assetByName: Record<string, string> = assets.reduce((acc, asset) => {
  acc[asset.name] = asset.url;
  return acc;
}, {} as Record<string, string>);

const stagePrimary = assets
  .map((asset) => {
    const match = asset.name.match(/^(\d{2})\.png$/);
    return match ? { id: parseInt(match[1], 10), url: asset.url } : null;
  })
  .filter((entry): entry is { id: number; url: string } => Boolean(entry))
  .sort((a, b) => a.id - b.id);

const stageVariants = new Map<number, string[]>();

assets.forEach((asset) => {
  let match = asset.name.match(/^(\d{2})-(?:pre|1)\.png$/);
  if (match) {
    const id = parseInt(match[1], 10);
    const list = stageVariants.get(id) ?? [];
    list.push(asset.url);
    stageVariants.set(id, list);
    return;
  }

  match = asset.name.match(/^level_(\d{2})\.png$/);
  if (match) {
    const id = parseInt(match[1], 10);
    const list = stageVariants.get(id) ?? [];
    list.push(asset.url);
    stageVariants.set(id, list);
  }
});

export const stageImageSets: StageImageSet[] = stagePrimary.map((entry) => {
  const variants = stageVariants.get(entry.id) ?? [];
  const sources = Array.from(new Set([entry.url, ...variants]));
  return {
    id: entry.id,
    primary: entry.url,
    sources,
  };
});

export const referenceSpriteUrls = {
  floor: assetByName['floor.jpg'],
  stone: assetByName['stone.png'],
  cave: assetByName['door.jpg'],
  arrowLeft: assetByName['left.jpg'],
  arrowDown: assetByName['down.jpg'],
};

export const uiImages = {
  menu: assetByName['menu.png'],
  background: assetByName['stone-age-bg.png'],
};

export const miscAssets = assets;
