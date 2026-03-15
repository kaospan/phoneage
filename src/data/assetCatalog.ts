export interface AssetEntry {
  name: string;
  url: string;
}

export interface StageImageSet {
  id: number;
  primary: string;
  sources: string[];
}

interface StageAssetCandidate {
  id: number;
  name: string;
  url: string;
  priority: number;
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

const getStageAssetCandidate = (asset: AssetEntry): StageAssetCandidate | null => {
  let match = asset.name.match(/^level_(\d{3})\.png$/i);
  if (match) {
    return {
      id: parseInt(match[1], 10),
      name: asset.name,
      url: asset.url,
      priority: 0,
    };
  }

  match = asset.name.match(/^level_(\d{1,3})\.png$/i);
  if (match) {
    return {
      id: parseInt(match[1], 10),
      name: asset.name,
      url: asset.url,
      priority: 1,
    };
  }

  // Legacy bundled names: 7.png, 07.png, 082.png, etc.
  match = asset.name.match(/^(\d{1,3})\.png$/);
  if (match) {
    return {
      id: parseInt(match[1], 10),
      name: asset.name,
      url: asset.url,
      priority: 2,
    };
  }

  // Older preprocessed variants kept only as lower-priority fallbacks.
  match = asset.name.match(/^(\d{1,3})-(?:pre|1)\.png$/i);
  if (match) {
    return {
      id: parseInt(match[1], 10),
      name: asset.name,
      url: asset.url,
      priority: 3,
    };
  }

  return null;
};

const stageCandidateGroups = new Map<number, StageAssetCandidate[]>();

for (const asset of assets) {
  const candidate = getStageAssetCandidate(asset);
  if (!candidate) continue;

  const list = stageCandidateGroups.get(candidate.id) ?? [];
  list.push(candidate);
  stageCandidateGroups.set(candidate.id, list);
}

export const stageImageSets: StageImageSet[] = Array.from(stageCandidateGroups.entries())
  .sort(([a], [b]) => a - b)
  .map(([id, candidates]) => {
    const ordered = [...candidates].sort((a, b) => {
      if (a.priority !== b.priority) return a.priority - b.priority;
      return a.name.localeCompare(b.name);
    });

    return {
      id,
      primary: ordered[0]!.url,
      sources: Array.from(new Set(ordered.map((entry) => entry.url))),
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
