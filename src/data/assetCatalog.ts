import menuPng from '../assets/menu.png';
import backgroundPng from '../assets/stone-age-bg.png';
import stonePng from '../assets/stone.png';
import floorJpg from '../assets/floor.jpg';
import caveJpg from '../assets/door.jpg';
import arrowLeftJpg from '../assets/left.jpg';
import arrowDownJpg from '../assets/down.jpg';

export interface AssetEntry {
  name: string;
  url: string;
}

export interface StageImageSet {
  id: number;
  primary: string;
  sources: string[];
}

const stagePngs = import.meta.glob('../assets/level_*.png', { eager: true, import: 'default' }) as Record<string, string>;

const supportAssets = {
  'menu.png': menuPng,
  'stone-age-bg.png': backgroundPng,
  'stone.png': stonePng,
  'floor.jpg': floorJpg,
  'door.jpg': caveJpg,
  'left.jpg': arrowLeftJpg,
  'down.jpg': arrowDownJpg,
} satisfies Record<string, string>;

const stageAssets: AssetEntry[] = Object.entries(stagePngs).map(([path, url]) => ({
  name: path.split('/').pop() || path,
  url,
}));

const supportAssetEntries: AssetEntry[] = Object.entries(supportAssets).map(([name, url]) => ({
  name,
  url,
}));

const assets: AssetEntry[] = [...stageAssets, ...supportAssetEntries];

export const assetByName: Record<string, string> = assets.reduce((acc, asset) => {
  acc[asset.name] = asset.url;
  return acc;
}, {} as Record<string, string>);

export const stageImageSets: StageImageSet[] = stageAssets
  .map((asset) => {
    const match = asset.name.match(/^level_(\d{3})\.png$/i);
    if (!match) return null;

    return {
      id: parseInt(match[1], 10),
      primary: asset.url,
      sources: [asset.url],
    } satisfies StageImageSet;
  })
  .filter((entry): entry is StageImageSet => entry !== null)
  .sort((a, b) => a.id - b.id);

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
