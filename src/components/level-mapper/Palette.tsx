import React from "react";
import { TILE_TYPES } from "@/lib/levelgrid";

type Props = {
    activeTile: number;
    setActiveTile: (id: number) => void;
};

/** Compact vertical swatch grid meant for a narrow sidebar (e.g. the grid editor's left margin). */
export const Palette: React.FC<Props> = ({ activeTile, setActiveTile }) => {
    return (
        <div className="grid grid-cols-2 gap-1">
            {TILE_TYPES.map((t) => (
                <button
                    key={t.id}
                    onClick={() => setActiveTile(t.id)}
                    className={`flex h-8 w-8 items-center justify-center rounded-md border text-[10px] font-bold text-white transition-colors ${
                        activeTile === t.id
                            ? "border-amber-300 ring-2 ring-amber-300/70"
                            : "border-black/25 hover:border-amber-200/60"
                    }`}
                    style={{ background: t.color, textShadow: "0 1px 2px rgba(0,0,0,0.9)" }}
                    title={t.name}
                >
                    {t.id}
                </button>
            ))}
        </div>
    );
};

export default Palette;
