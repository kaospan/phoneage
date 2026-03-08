import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TILE_TYPES } from '@/lib/levelgrid';
import { X, Upload, Save, Trash2, Lock, Unlock } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { STORAGE_KEY, saveCellReferences, type CellReference } from '@/lib/spriteMatching';
import { assessSingleCellReference } from './referenceQuality';

export const CellReferenceManager: React.FC = () => {
    const [references, setReferences] = useState<CellReference[]>([]);
    const [selectedType, setSelectedType] = useState<number>(2); // Default to stone
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);
    const [autoCleaned, setAutoCleaned] = useState<{ removed: number; kept: number } | null>(null);

    // Load references from localStorage
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                const parsed = JSON.parse(stored) as CellReference[];
                setReferences(parsed);
            } catch (e) {
                console.error('Failed to load cell references:', e);
            }
        }
    }, []);

    // Auto-clean obvious "bad" sprites (those that include a seam/border between cells).
    // Conservative: only removes the most obvious cases.
    useEffect(() => {
        if (typeof window === 'undefined') return;
        if (!references.length) return;
        if (autoCleaned) return;

        let removed = 0;
        let kept = 0;
        const next: CellReference[] = [];

        // Decode a small batch; keep UI responsive.
        const run = async () => {
            for (const ref of references) {
                try {
                    const img = new Image();
                    const imageData: ImageData | null = await new Promise((resolve) => {
                        img.onload = () => {
                            try {
                                const canvas = document.createElement('canvas');
                                canvas.width = img.width;
                                canvas.height = img.height;
                                const ctx = canvas.getContext('2d');
                                if (!ctx) return resolve(null);
                                ctx.imageSmoothingEnabled = false;
                                ctx.drawImage(img, 0, 0);
                                resolve(ctx.getImageData(0, 0, img.width, img.height));
                            } catch {
                                resolve(null);
                            }
                        };
                        img.onerror = () => resolve(null);
                        img.src = ref.imageData;
                    });

                    if (imageData) {
                        const q = assessSingleCellReference(imageData);
                        if (!q.ok && !ref.locked) {
                            removed += 1;
                            continue;
                        }
                    }

                    kept += 1;
                    next.push(ref);
                } catch {
                    kept += 1;
                    next.push(ref);
                }

                if (removed + kept > 0 && (removed + kept) % 18 === 0) {
                    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
                }
            }

            if (removed > 0) {
                saveReferences(next);
            }
            setAutoCleaned({ removed, kept });
        };

        void run();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [references, autoCleaned]);

    // Save references to localStorage
    const saveReferences = (refs: CellReference[]) => {
        saveCellReferences(refs);
        setReferences(refs);
    };

    // Handle image upload
    const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            const imageData = event.target?.result as string;
            setUploadedImage(imageData);
        };
        reader.readAsDataURL(file);
    };

    // Save uploaded image as reference
    const saveAsReference = () => {
        if (!uploadedImage) return;
        if (selectedType === 5) {
            alert('Void (5) cannot be saved as a reference sprite.');
            return;
        }

        const newRef: CellReference = {
            id: `ref-${Date.now()}`,
            tileType: selectedType,
            imageData: uploadedImage,
            timestamp: Date.now(),
            locked: false,
        };

        saveReferences([...references, newRef]);
        setUploadedImage(null);
    };

    // Delete a reference
    const deleteReference = (id: string) => {
        saveReferences(references.filter(ref => ref.id !== id));
    };

    const updateReference = (id: string, updates: Partial<CellReference>) => {
        saveReferences(
            references.map((ref) => (ref.id === id ? { ...ref, ...updates } : ref))
        );
    };

    const replaceReferenceImage = (id: string, file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (event) => {
            const imageData = event.target?.result as string;
            if (!imageData) return;
            updateReference(id, { imageData, timestamp: Date.now() });
        };
        reader.readAsDataURL(file);
    };

    // Get tile type name
    const getTileTypeName = (type: number) => {
        return TILE_TYPES.find(t => t.id === type)?.name || `Type ${type}`;
    };

    // Group references by tile type
    const referencesByType = references.reduce((acc, ref) => {
        if (!acc[ref.tileType]) acc[ref.tileType] = [];
        acc[ref.tileType].push(ref);
        return acc;
    }, {} as Record<number, CellReference[]>);

    const lockedCount = references.filter((r) => r.locked).length;
    const unlockedCount = references.length - lockedCount;

    return (
        <div className="space-y-4 p-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Cell Reference Sprites</h3>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">
                        {references.length} saved{lockedCount ? ` (${lockedCount} locked)` : ''}
                    </span>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                            if (unlockedCount === 0) return;
                            const ok = window.confirm(
                                `Delete ${unlockedCount} unlocked reference sprite${unlockedCount === 1 ? '' : 's'}?\n\nLocked sprites will be kept.`
                            );
                            if (!ok) return;
                            saveReferences(references.filter((r) => r.locked));
                        }}
                        disabled={unlockedCount === 0}
                        title="Delete all unlocked reference sprites (locked sprites are kept)"
                    >
                        <Trash2 className="h-4 w-4" />
                        Delete unlocked
                    </Button>
                </div>
            </div>

            {autoCleaned?.removed ? (
                <Alert className="border-amber-500/40 bg-amber-500/10">
                    <AlertDescription>
                        Removed {autoCleaned.removed} obviously bad sprite{autoCleaned.removed === 1 ? '' : 's'} (border bleed). Locked sprites are never auto-removed.
                    </AlertDescription>
                </Alert>
            ) : null}

            <Alert>
                <AlertDescription>
                    Upload cropped cell images to use as reference sprites for detection. You can also change a saved sprite's tile type or replace its image if it was categorized incorrectly.
                </AlertDescription>
            </Alert>

            {/* Upload Section */}
            <Card className="p-4 space-y-3">
                <Label>Add New Reference Sprite</Label>

                <div className="space-y-2">
                    <Label htmlFor="sprite-upload" className="text-sm text-muted-foreground">
                        Upload Cell Image
                    </Label>
                    <div className="flex gap-2">
                        <input
                            id="sprite-upload"
                            type="file"
                            accept="image/*"
                            onChange={handleImageUpload}
                            className="hidden"
                        />
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={() => document.getElementById('sprite-upload')?.click()}
                            className="flex-1"
                        >
                            <Upload className="w-4 h-4 mr-2" />
                            Choose Image
                        </Button>
                    </div>
                </div>

                {uploadedImage && (
                    <>
                        <div className="border rounded-lg p-2 bg-muted/20">
                            <img
                                src={uploadedImage}
                                alt="Preview"
                                className="w-full h-auto max-h-32 object-contain"
                            />
                        </div>

                        <div className="space-y-2">
                            <Label htmlFor="tile-type-select">Tile Type</Label>
                            <Select
                                value={selectedType.toString()}
                                onValueChange={(val) => setSelectedType(parseInt(val))}
                            >
                                <SelectTrigger id="tile-type-select">
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    {TILE_TYPES.filter((tile) => tile.id !== 5).map((tile) => (
                                        <SelectItem key={tile.id} value={tile.id.toString()}>
                                            <div className="flex items-center gap-2">
                                                <div
                                                    className="w-4 h-4 rounded border"
                                                    style={{ backgroundColor: tile.color }}
                                                />
                                                <span>{tile.name}</span>
                                            </div>
                                        </SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="flex gap-2">
                            <Button onClick={saveAsReference} size="sm" className="flex-1">
                                <Save className="w-4 h-4 mr-2" />
                                Save Reference
                            </Button>
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setUploadedImage(null)}
                            >
                                <X className="w-4 h-4" />
                            </Button>
                        </div>
                    </>
                )}
            </Card>

            {/* Saved References Gallery */}
            {Object.keys(referencesByType).length > 0 && (
                <div className="space-y-4">
                    <h4 className="font-medium">Saved References</h4>
                    {Object.entries(referencesByType).map(([typeStr, refs]) => {
                        const type = parseInt(typeStr);
                        return (
                            <Card key={type} className="p-3">
                                <div className="flex items-center gap-2 mb-3">
                                    <div
                                        className="w-4 h-4 rounded border"
                                        style={{ backgroundColor: TILE_TYPES.find(t => t.id === type)?.color }}
                                    />
                                    <span className="font-medium">{getTileTypeName(type)}</span>
                                    <span className="text-xs text-muted-foreground ml-auto">
                                        {refs.length} {refs.length === 1 ? 'sprite' : 'sprites'}
                                    </span>
                                </div>
                                <div className="grid grid-cols-4 gap-2">
                                    {refs.map((ref) => (
                                        <div key={ref.id} className="relative space-y-2 rounded border border-border/60 bg-background/40 p-2">
                                            <div className="border rounded overflow-hidden bg-muted/20 aspect-square">
                                                <img
                                                    src={ref.imageData}
                                                    alt={`Reference ${ref.id}`}
                                                    className="w-full h-full object-contain"
                                                />
                                            </div>
                                            <Button
                                                variant={ref.locked ? 'secondary' : 'outline'}
                                                size="icon"
                                                className="absolute -top-2 -left-2 h-6 w-6"
                                                onClick={() => updateReference(ref.id, { locked: !ref.locked })}
                                                title={ref.locked ? 'Locked (kept on mass delete)' : 'Unlocked'}
                                                aria-label={ref.locked ? 'Unlock reference' : 'Lock reference'}
                                            >
                                                {ref.locked ? <Lock className="w-3 h-3" /> : <Unlock className="w-3 h-3" />}
                                            </Button>
                                            <select
                                                value={ref.tileType}
                                                onChange={(e) => updateReference(ref.id, { tileType: parseInt(e.target.value, 10) })}
                                                className="w-full rounded border bg-background px-2 py-1 text-xs"
                                                title="Change the tile type for this saved reference"
                                            >
                                                {TILE_TYPES.map((tile) => (
                                                    <option key={tile.id} value={tile.id} disabled={tile.id === 5}>
                                                        {tile.name}
                                                    </option>
                                                ))}
                                            </select>
                                            <label className="flex w-full cursor-pointer items-center justify-center gap-1 rounded border px-2 py-1 text-xs hover:bg-muted">
                                                <Upload className="h-3 w-3" />
                                                Replace Image
                                                <input
                                                    type="file"
                                                    accept="image/*"
                                                    className="hidden"
                                                    onChange={(e) => {
                                                        replaceReferenceImage(ref.id, e.target.files?.[0] ?? null);
                                                        e.currentTarget.value = '';
                                                    }}
                                                />
                                            </label>
                                            <Button
                                                variant="destructive"
                                                size="icon"
                                                className="absolute -top-2 -right-2 h-6 w-6"
                                                onClick={() => deleteReference(ref.id)}
                                                disabled={Boolean(ref.locked)}
                                                title={ref.locked ? 'Unlock to delete' : 'Delete reference'}
                                            >
                                                <Trash2 className="w-3 h-3" />
                                            </Button>
                                        </div>
                                    ))}
                                </div>
                            </Card>
                        );
                    })}
                </div>
            )}
        </div>
    );
};

// Export utility functions to use references in detection
export const getCellReferences = (): CellReference[] => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];
    try {
        return JSON.parse(stored);
    } catch {
        return [];
    }
};

export const getReferencesForType = (tileType: number): CellReference[] => {
    return getCellReferences().filter(ref => ref.tileType === tileType);
};
