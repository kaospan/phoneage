import React from "react";
import { TILE_TYPES } from "@/lib/levelgrid";

type Props = {
    activeTile: number;
    setActiveTile: (id: number) => void;
};

export const Palette: React.FC<Props> = ({ activeTile, setActiveTile }) => {
    return (
        <div className="mt-3">
            <div className="grid grid-cols-2 gap-2 lg:grid-cols-3 2xl:grid-cols-4">
                {TILE_TYPES.map(t => (
                    <button
                        key={t.id}
                        onClick={() => setActiveTile(t.id)}
                        className={`flex items-center gap-2 rounded border px-2 py-1.5 text-xs ${activeTile === t.id ? "ring-2 ring-primary" : ""}`}
                        title={t.name}
                    >
                        <span className="inline-block rounded w-6 h-6" style={{ background: t.color }} />
                        {t.name}
                    </button>
                ))}
            </div>
        </div>
    );
};

export default Palette;
