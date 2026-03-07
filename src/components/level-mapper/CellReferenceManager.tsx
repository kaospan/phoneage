import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TILE_TYPES } from '@/lib/levelgrid';
import { X, Upload, Save, Trash2 } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { STORAGE_KEY, saveCellReferences, type CellReference } from '@/lib/spriteMatching';

export const CellReferenceManager: React.FC = () => {
    const [references, setReferences] = useState<CellReference[]>([]);
    const [selectedType, setSelectedType] = useState<number>(2); // Default to stone
    const [uploadedImage, setUploadedImage] = useState<string | null>(null);

    // Load references from localStorage
    useEffect(() => {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
            try {
                setReferences(JSON.parse(stored));
            } catch (e) {
                console.error('Failed to load cell references:', e);
            }
        }
    }, []);

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

        const newRef: CellReference = {
            id: `ref-${Date.now()}`,
            tileType: selectedType,
            imageData: uploadedImage,
            timestamp: Date.now(),
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

    return (
        <div className="space-y-4 p-4">
            <div className="flex items-center justify-between">
                <h3 className="text-lg font-semibold">Cell Reference Sprites</h3>
                <div className="flex items-center gap-2">
                    <span className="text-sm text-muted-foreground">{references.length} saved</span>
                    <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => {
                            if (references.length === 0) return;
                            const ok = window.confirm(`Delete all ${references.length} reference sprites? This cannot be undone.`);
                            if (!ok) return;
                            saveReferences([]);
                        }}
                        disabled={references.length === 0}
                        title="Delete all saved reference sprites"
                    >
                        <Trash2 className="h-4 w-4" />
                        Delete all
                    </Button>
                </div>
            </div>

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
                                    {TILE_TYPES.map((tile) => (
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
                                            <select
                                                value={ref.tileType}
                                                onChange={(e) => updateReference(ref.id, { tileType: parseInt(e.target.value, 10) })}
                                                className="w-full rounded border bg-background px-2 py-1 text-xs"
                                                title="Change the tile type for this saved reference"
                                            >
                                                {TILE_TYPES.map((tile) => (
                                                    <option key={tile.id} value={tile.id}>
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
